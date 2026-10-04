// Where the enterable buildings go. Nothing here is a hard-coded map position: every site is placed by a query that
// survives map rebuilds (hand-built v1 grid or the 1:1 OpenStreetMap v2 map):
//   1. anchor = the intersection of two named streets in the road graph (else the nearest point on the named street,
//      else the real-world lat/lon through latlon.ll())
//   2. candidates = building lots near the anchor ('lot' mode) or frontage positions along block edges ('block' mode)
//   3. score by distance, whether the side street is on the side the design needs, fit, slope and front street name
// Pure data + geometry (no three.js), so the world builder can also call lotsToSkip() before it builds buildings.
import { obbOverlap, pointInConvex } from '../geo.js';
import { ll } from '../latlon.js';

// need = the building's fixed footprint (half extents, front on local -Z); corner = side the side street must be on
// ('L' = local -X, 'R' = local +X, null = mid-block ok); front = preferred street for the facade
export const SITE_DEFS = [
  { id: 'safehouse', name: 'Safehouse', streets: ['Hyde St', 'Filbert St'], front: 'Filbert St', ll: [37.80016, -122.41926], need: { hx: 7.9, hz: 10.8 }, corner: 'L', strict: true, maxSlope: 1.5 },
  { id: 'showroom', name: 'Bay Motors', streets: ['King St', '4th St'], front: 'King St', ll: [37.77755, -122.39445], need: { hx: 15.7, hz: 12.8 }, corner: 'R', strict: true, maxSlope: 1.0 },
  { id: 'parking', name: 'SoMa Park & Ride', streets: ['King St', '5th St'], front: 'King St', ll: [37.77625, -122.39640], need: { hx: 16.2, hz: 23.2 }, mode: 'block', maxSlope: 1.2 },
  { id: 'diner', name: 'Sea Lion Diner', streets: ['Beach St', 'Taylor St'], front: 'Beach St', ll: [37.80735, -122.41590], need: { hx: 9.4, hz: 10.8 }, corner: 'R', maxSlope: 1.0 },
  { id: 'bodega', name: '21st Street Market', streets: ['Mission St', '21st St'], front: '21st St', ll: [37.75720, -122.41870], need: { hx: 4.9, hz: 8.6 }, corner: 'L', maxSlope: 1.0 },
  { id: 'cafe', name: 'Fogline Coffee', streets: ['Hayes St', 'Octavia St'], front: 'Hayes St', ll: [37.77660, -122.42410], need: { hx: 5.4, hz: 10.6 }, corner: 'R', maxSlope: 1.0 },
  { id: 'pizza', name: 'Bella Nonna Pizzeria', streets: ['Columbus Ave'], front: 'Columbus Ave', ll: [37.80030, -122.40970], need: { hx: 6.3, hz: 10.5 }, corner: null, maxSlope: 1.0 },
];

// sidewalk areas in front of the drivable doors (local rects [x0, z0, x1, z1]) that street props should leave clear
const CLEAR = {
  safehouse: [[1.4, -14.8, 6.6, -10.8]],
  showroom: [[15.7, -2.6, 20.5, 3.4]],
  parking: [[-8.5, -27.5, 4.5, -23.2]],
};

const norm = s => (s || '').toLowerCase().replace(/\b(street|st|avenue|ave|boulevard|blvd)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
// anchor point for a site: intersection of its streets, else nearest point of its first street to the lat/lon, else lat/lon
export function siteAnchor(graph, def) {
  const [lx, lz] = ll(def.ll[0], def.ll[1]);
  if (graph?.nodes && def.streets?.length >= 2) {
    const a = norm(def.streets[0]), b = norm(def.streets[1]);
    let best = null, bd = Infinity;
    for (const n of graph.nodes) {
      const names = new Set(n.edges.map(e => norm(e.name)));
      if (names.has(a) && names.has(b)) { const d = Math.hypot(n.x - lx, n.z - lz); if (d < bd) { bd = d; best = [n.x, n.z]; } }
    }
    if (best) return best;
  }
  if (graph?.edges && def.streets?.length) {
    const a = norm(def.streets[0]);
    let best = null, bd = Infinity;
    for (const e of graph.edges) {
      if (norm(e.name) !== a) continue;
      for (let k = 0; k < e.pts.length - 1; k++) {
        const [x0, z0] = e.pts[k], [x1, z1] = e.pts[k + 1], ex = x1 - x0, ez = z1 - z0, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((lx - x0) * ex + (lz - z0) * ez) / l2)), px = x0 + ex * t, pz = z0 + ez * t;
        const d = Math.hypot(px - lx, pz - lz); if (d < bd) { bd = d; best = [px, pz]; }
      }
    }
    if (best && bd < 600) return best;
  }
  return [lx, lz];
}

const corners = (o) => { const c = Math.cos(o.yaw), s = Math.sin(o.yaw); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.x + c * a * o.hx + s * b * o.hz, o.z - s * a * o.hx + c * b * o.hz]); };
function slopeOf(fp, H) { if (!H) return 0; let lo = Infinity, hi = -Infinity; for (const [x, z] of [...corners(fp), [fp.x, fp.z]]) { const h = H(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; }
function streetAt(graph, x, z) { const n = graph?.nearestEdge?.(x, z, 16); return n ? n.edge.name : null; }

// a lot without front info: pick the lot axis that faces the nearest street and express the lot in that frame
function withFront(l, graph) {
  const n = graph?.nearestEdge?.(l.x, l.z, 60); if (!n) return null;
  const dx = n.x - l.x, dz = n.z - l.z, d = Math.hypot(dx, dz) || 1;
  let best = null, bd = -2;
  for (let r = 0; r < 4; r++) {
    const yaw = (l.yaw || 0) + r * Math.PI / 2, fx = -Math.sin(yaw), fz = -Math.cos(yaw), dot = (fx * dx + fz * dz) / d;
    if (dot > bd) { bd = dot; best = { ...l, yaw, hx: r % 2 ? l.hz : l.hx, hz: r % 2 ? l.hx : l.hz, front: [fx, fz] }; }
  }
  return best;
}
// place one site. ctx = { blocks, graph, heightAt }, taken = footprints already used by other sites
export function placeSite(def, ctx, taken = []) {
  const { blocks, graph, heightAt: H } = ctx;
  const [ax, az] = siteAnchor(graph, def);
  const need = def.need, R = def.mode === 'block' ? 320 : 140;
  const clash = fp => taken.some(t => obbOverlap({ ...fp, hx: fp.hx + 2, hz: fp.hz + 2 }, t, 0));
  let best = null, bs = Infinity;
  const consider = (fp, extra, block) => {
    if (clash(fp)) return;
    const inner = block?.inner;
    if (inner && !corners({ ...fp, hx: fp.hx - 0.4, hz: fp.hz - 0.4 }).every(([x, z]) => pointInConvex(x, z, inner))) return;
    const d = Math.hypot(fp.x - ax, fp.z - az);
    const slope = slopeOf(fp, H);
    const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
    const side = (ax - fp.x) * c - (az - fp.z) * s > 0 ? 'R' : 'L';
    let score = d + extra + Math.max(0, slope - (def.maxSlope ?? 1)) * 60 + slope * 4;
    // generic buildings we would hide but not cover leave holes in the street: penalise the uncovered area
    if (block?.lots) {
      let gap = 0;
      for (const l of block.lots) {
        if (!obbOverlap({ ...fp, hx: fp.hx - 0.3, hz: fp.hz - 0.3 }, l, 0)) continue;
        const dx = l.x - fp.x, dz = l.z - fp.z, lx = c * dx - s * dz, lz = s * dx + c * dz;
        const q = Math.abs(Math.sin(2 * (l.yaw - fp.yaw))) < 0.3 && Math.abs(Math.sin(l.yaw - fp.yaw)) > 0.7;
        const hx = q ? l.hz : l.hx, hz = q ? l.hx : l.hz;
        const ix = Math.max(0, Math.min(lx + hx, fp.hx) - Math.max(lx - hx, -fp.hx)), iz = Math.max(0, Math.min(lz + hz, fp.hz) - Math.max(lz - hz, -fp.hz));
        gap += Math.max(0, 4 * hx * hz - ix * iz);
      }
      score += gap * (def.mode === 'block' ? 0.04 : 0.4);
    }
    // a real corner: there is a street just outside the side edge facing the anchor
    const sg = side === 'R' ? 1 : -1, sx = fp.x + c * (fp.hx + 5) * sg, sz = fp.z - s * (fp.hx + 5) * sg;
    const isCorner = !!streetAt(graph, sx, sz);
    if (def.corner && (side !== def.corner || !isCorner)) score += def.strict ? 1e4 : 150;
    // the facade street: the road just outside the front edge
    const fx = fp.x - s * (fp.hz + 6), fz = fp.z - c * (fp.hz + 6);
    const st = streetAt(graph, fx, fz);
    if (!st) score += 400; else if (def.front && norm(st) !== norm(def.front)) score += 60;
    if (score < bs) { bs = score; best = { ...fp, side: isCorner ? side : null, anchor: [ax, az], street: st, score }; }
  };
  if (def.mode === 'block') {
    for (const b of blocks) {
      if (!b.inner || b.park || b.landmark) continue;
      if (Math.hypot(b.cx - ax, b.cz - az) > R) continue;
      const P = b.inner, n = P.length;
      for (let e = 0; e < n; e++) {
        const [x0, z0] = P[e], [x1, z1] = P[(e + 1) % n], L = Math.hypot(x1 - x0, z1 - z0);
        if (L < need.hx * 2 + 1) continue;
        const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
        let nx = -uz, nz = ux; // outward normal: away from the block centre
        if ((b.cx - x0) * nx + (b.cz - z0) * nz > 0) { nx = -nx; nz = -nz; }
        const yaw = Math.atan2(-nx, -nz);
        for (let t = need.hx + 0.3; t <= L - need.hx - 0.3; t += 2) {
          const px = x0 + ux * t - nx * (need.hz + 0.1), pz = z0 + uz * t - nz * (need.hz + 0.1);
          consider({ x: px, z: pz, hx: need.hx, hz: need.hz, yaw }, 0, b);
        }
      }
    }
  } else {
    for (const b of blocks) for (const l0 of b.lots || []) {
      if (Math.hypot(l0.x - ax, l0.z - az) > R) continue;
      const l = l0.front ? l0 : withFront(l0, graph);   // lots without a known street side (e.g. OSM footprints)
      if (!l) continue;
      // keep the lot's front edge and centre along the frontage; the building's own depth goes inward
      const fx = l.front[0], fz = l.front[1];
      const px = l.x + fx * (l.hz - need.hz), pz = l.z + fz * (l.hz - need.hz);
      const fit = Math.abs(l.hx - need.hx) * 1.5 + Math.abs(l.hz - need.hz) * 0.8 + (l.corner ? 0 : 8);
      consider({ x: px, z: pz, hx: need.hx, hz: need.hz, yaw: l.yaw }, fit, b);
    }
  }
  if (!best) console.warn('[interiors] no placement for', def.id);
  return best;
}
// place every site (in order, never overlapping each other)
export function placeAll(ctx, defs = SITE_DEFS) {
  const taken = [], out = new Map();
  for (const def of defs) { const fp = placeSite(def, ctx, taken); if (fp) { taken.push(fp); out.set(def.id, fp); } }
  return out;
}
// every generic lot a placed site covers: pass these to the building generator as skipLots (or hide them at runtime)
export function lotsToSkip(blocks, graph, heightAt, placed = null) {
  const fps = [...(placed || placeAll({ blocks, graph, heightAt })).values()];
  const out = [];
  for (const fp of fps) {
    const shrunk = { ...fp, hx: fp.hx - 0.3, hz: fp.hz - 0.3 };
    for (const b of blocks) for (const l of b.lots) if (!out.includes(l) && obbOverlap(shrunk, l, 0)) out.push(l);
  }
  return out;
}
export function keepClearZones(placed) {
  const out = [];
  for (const [id, fp] of placed) {
    const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
    for (const [x0, z0, x1, z1] of CLEAR[id] || []) {
      const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
      out.push({ site: id, x: fp.x + c * lx + s * lz, z: fp.z - s * lx + c * lz, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, yaw: fp.yaw });
    }
  }
  return out;
}
