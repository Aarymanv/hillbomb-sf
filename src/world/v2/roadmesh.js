// Streamed road surfaces for the 1:1 map: asphalt ribbons trimmed at junctions + a junction polygon (curb corners
// solved from the real street angles), sidewalks with curbs wrapping the corners, lane markings, crosswalks / stop
// lines at signals and stops, cable-car / streetcar rails, viaduct slabs + barriers + piers, tunnel tubes.
// Deck barriers are colliders so nothing drives off a bridge.
import * as THREE from 'three';
import { GeoBuilder, hash01 } from '../geo.js';
import { PBR } from '../assets.js';
import { makeRoadMaterial, makeSidewalkMaterial, makeMarkingMaterial, makeRailMaterial } from '../../render/terrainmat.js';
import { hash2 } from '../props/kit.js';
import { zoneAtV2, COMMERCIAL_ZONES_V2, COMMERCIAL_STREETS_V2, TROLLEY_V2 } from '../props/v2zones.js';

// worn thermoplastic albedo (~0.6), not 0.9: at night the crosswalks / stop lines under headlights and lamps clipped to pure white and
// every bar sliding into the bottom of the frame at speed jumped the whole-screen mean (Chinatown flicker probe)
const WHITE = [0.64, 0.64, 0.61], YELLOW = [0.74, 0.52, 0.08];
// rails: polished steel heads (rail material), tar-sealed flangeways, cable-car slot, concrete trackway (cable lines, tinted)
const STEEL = [0.55, 0.54, 0.52], GROOVE = [0.035, 0.034, 0.032], TRACKBED = [0.3, 0.31, 0.33];
// "STOP" legend glyphs on a 3 x 5 grid (x0, y0, x1, y1), y = 0 nearest the driver
const GLYPH = {
  S: [[0, 4, 3, 5], [0, 2, 1, 5], [0, 2, 3, 3], [2, 0, 3, 3], [0, 0, 3, 1]],
  T: [[0, 4, 3, 5], [1, 0, 2, 5]],
  O: [[0, 0, 3, 1], [0, 4, 3, 5], [0, 0, 1, 5], [2, 0, 3, 5]],
  P: [[0, 4, 3, 5], [0, 0, 1, 5], [2, 2, 3, 5], [0, 2, 3, 3]],
};
const fract = v => v - Math.floor(v);
// SF curb paint plan for one side of an edge (sd = +1 right / -1 left of a->b), consistent with the street props
// (props/v2.js places hydrants and bus stops from the same hashes): [hydrant s, hydrant 2 s, bus stop s, zone] with
// zone = floor(start s) + type / 10 (1 yellow loading 12 m, 2 white passenger 7 m, 3 blue disabled 6.5 m, 4 green 7 m).
// Red: +-2.8 m at hydrants, the bus zone [s - 14, s + 10], 6 m daylighting at most junction corners (shader).
export function curbPlan(e, sd, s0, s1) {
  const out = [-1, -1, -1, -1], L = s1 - s0;
  const sw = (e.deck || e.tunnel || e.kind === 'highway' || e.sidewalk < 1.2) ? 0 : e.sidewalk;
  if (!sw || L < 6 || e.kind === 'crooked') return out;
  const eh = hash2(e.id, sd + 5, 11);
  if (L > 16) {
    if (eh < 0.62) out[0] = eh < 0.31 ? s0 + 4 + eh * 6 : s1 - 4 - eh * 4;
    if (L > 90 && hash2(e.id, sd, 21) < 0.35) out[1] = s0 + L * 0.5;
  }
  const trolley = TROLLEY_V2.has(e.name) && e.width >= 10.5 && e.kind !== 'highway';
  if ((trolley || e.kind === 'arterial') && L > 70 && sw >= 2.4 && hash2(e.id, sd, 31) < (trolley ? 0.55 : 0.3)) out[2] = sd > 0 ? s1 - 16 : s0 + 16;
  if (e.parkSides > 0 && L > 36) {
    const m = pointAt(e, e.len / 2), com = COMMERCIAL_ZONES_V2.has(zoneAtV2(m[0], m[1])) || COMMERCIAL_STREETS_V2.has(e.name);
    const h = hash2(e.id, sd, 41);
    const type = com ? (h < 0.42 ? 1 : h < 0.56 ? 2 : h < 0.66 ? 3 : h < 0.74 ? 4 : 0) : (h < 0.05 ? 3 : h < 0.08 ? 2 : 0);
    if (type) {
      const zl = [0, 12, 7, 6.5, 7][type], st = s0 + 8 + hash2(e.id, sd, 43) * Math.max(0, L - 16 - zl);
      const hit = (a, b) => a >= 0 && st < b && st + zl > a;
      if (!hit(out[0] - 3, out[0] + 3) && !hit(out[1] - 3, out[1] + 3) && !hit(out[2] - 14, out[2] + 10) && st + zl < s1 - 6) out[3] = Math.floor(st) + type / 10;
    }
  }
  return out;
}
// storm drain (catch basin) at one block end per side: s of the grate / curb inlet or -1 (same formula in roadwear.js)
export function drainAt(seed, sd, s0, s1) {
  const h = fract(seed * 23.7 + sd * 0.31);
  if (h > 0.8 || s1 - s0 < 20) return -1;
  return h < 0.4 ? s0 + 3.0 : s1 - 3.0;
}
const LIFT = 0.035, CURB = 0.15;
// Road shader contract (render/terrainmat.js makeRoadMaterial may read these; lane lines move into the shader when
// opts.markingsInShader is set):
//   aRoad  = (lateral m from the edge centreline, + = right of the edge direction a->b; distance along the edge m;
//             half width m; flags RF)
//   aLanes = (lanes per direction (oneway: total), lane width m, median half-gap m, parking lane width per side m (0 = none))
//   aSpan  = (trimmed start s0 m, trimmed end s1 m, per-edge seed 0..1, controlled ends: 1 = node a, 2 = node b)
// Sidewalks carry aCurb = (s, s0, s1, side * (1 + seed) | 10 + seed at corners) and aCurbD (m from the curb line,
// -1 on the curb face) for the painted-curb zones (render/terrainmat.js hbCurbPaint).
export const RF = { TWOWAY: 1, HIGHWAY: 2, BRICK: 4, DECK: 8, RAILS: 16, JUNCTION: 32, ALLEY: 64, ARTERIAL: 128, CYCLE: 256, TRACK: 512 };
function roadFlags(e) {
  return (e.oneway ? 0 : RF.TWOWAY) | (e.kind === 'highway' ? RF.HIGHWAY : 0) | (e.kind === 'crooked' ? RF.BRICK : 0) | (e.deck ? RF.DECK : 0)
    | (e.hasRails ? RF.RAILS : 0) | (e.kind === 'alley' || e.kind === 'plaza' ? RF.ALLEY : 0) | (e.kind === 'arterial' ? RF.ARTERIAL : 0) | (e.cycle ? RF.CYCLE : 0) | (e.cycleTrack ? RF.TRACK : 0);
}

// --------------------------------------------------------------------------- junction geometry (cached on the node)
export function junction(n) {
  if (n._j) return n._j;
  const arms = [];
  for (const e of n.edges) {
    const fwd = e.a === n, P = e.pts, m = P.length;
    // direction from a point ~6 m along the edge (stable on curvy approaches)
    const s = Math.min(6, e.len * 0.4);
    const q = pointAt(e, fwd ? s : e.len - s);
    const p0 = fwd ? P[0] : P[m - 1];
    let dx = q[0] - p0[0], dz = q[1] - p0[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    arms.push({ e, fwd, dx, dz, nx: -dz, nz: dx, ang: Math.atan2(dz, dx), hw: e.width / 2, sw: e.deck ? 0 : e.sidewalk, trim: 0 });
  }
  arms.sort((a, b) => a.ang - b.ang);
  const k = arms.length;
  if (k >= 3 && !n.edges.some(e => e.deck && !e.deck.tunnel)) {
    for (let i = 0; i < k; i++) {
      const A = arms[i], B = arms[(i + 1) % k];
      const c = corner(A, B, A.hw, B.hw);
      if (c) { A.trim = Math.max(A.trim, c[0]); B.trim = Math.max(B.trim, c[1]); }
    }
    for (const a of arms) a.trim = Math.min(Math.max(a.trim + 1.0, 2.5), a.e.len * 0.45, 45);
  }
  const x = n.x, z = n.z, poly = [];
  if (k >= 3) for (const a of arms) {
    poly.push([x + a.dx * a.trim - a.nx * a.hw, z + a.dz * a.trim - a.nz * a.hw]);
    poly.push([x + a.dx * a.trim + a.nx * a.hw, z + a.dz * a.trim + a.nz * a.hw]);
  }
  return (n._j = { arms, poly, k });
}
// where A's right edge line (offset +ha) meets B's left edge line (offset -hb); returns [sA, tB] or null
function corner(A, B, ha, hb) {
  const det = -A.dx * B.dz + B.dx * A.dz;
  if (Math.abs(det) < 0.12) return null;
  const rx = -B.nx * hb - A.nx * ha, rz = -B.nz * hb - A.nz * ha;
  const s = (rx * -B.dz - -B.dx * rz) / det, t = (A.dx * rz - A.dz * rx) / det;
  if (s < 0 || t < 0 || s > 60 || t > 60) return null;
  return [s, t];
}
function pointAt(e, s) {
  const c = e.cum, P = e.pts;
  if (s <= 0) return P[0]; if (s >= e.len) return P[P.length - 1];
  let k = 0; while (k < c.length - 2 && c[k + 1] < s) k++;
  const t = (s - c[k]) / ((c[k + 1] - c[k]) || 1);
  return [P[k][0] + (P[k + 1][0] - P[k][0]) * t, P[k][1] + (P[k + 1][1] - P[k][1]) * t];
}
function yAtS(e, s) {
  const c = e.cum, Y = e.ys;
  if (s <= 0) return Y[0]; if (s >= e.len) return Y[Y.length - 1];
  let k = 0; while (k < c.length - 2 && c[k + 1] < s) k++;
  const t = (s - c[k]) / ((c[k + 1] - c[k]) || 1);
  return Y[k] + (Y[k + 1] - Y[k]) * t;
}
// trimmed [s0, s1] of an edge (junction mouths removed)
export function edgeSpan(e) {
  const ja = junction(e.a), jb = junction(e.b);
  const ta = ja.k >= 3 ? (ja.arms.find(a => a.e === e && a.fwd)?.trim || 0) : 0;
  const tb = jb.k >= 3 ? (jb.arms.find(a => a.e === e && !a.fwd)?.trim || 0) : 0;
  return [Math.min(ta, e.len / 2), Math.max(e.len / 2, e.len - tb)];
}
// stations along an edge between s0 and s1 (<= step apart, always including polyline vertices)
function stations(e, s0, s1, step) {
  const out = [s0];
  for (let k = 1; k < e.cum.length - 1; k++) if (e.cum[k] > s0 + 0.3 && e.cum[k] < s1 - 0.3) out.push(e.cum[k]);
  out.push(s1);
  const res = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i], n = Math.max(1, Math.ceil((b - a) / step));
    for (let q = 1; q <= n; q++) res.push(a + (b - a) * q / n);
  }
  return res;
}
function frameAt(e, s) {
  const d = 0.8, a = pointAt(e, Math.max(0, s - d)), b = pointAt(e, Math.min(e.len, s + d)), p = pointAt(e, s);
  let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  return [p[0], p[1], dx, dz, -dz, dx];     // x, z, dir, right
}


// sharrow at station s, lateral lat (m, + right of a->b), pointing along dir (+1 = a->b): a bike (two wheels + frame) and
// two chevrons ahead of it, as thick segments in (u across, v along the travel direction)
function sharrow(g, e, s, lat, dir, H) {
  const [x, z, dx, dz, rx, rz] = frameAt(e, s);
  const P = (u, v) => { const px = x + dx * dir * v + rx * (lat + dir * u), pz = z + dz * dir * v + rz * (lat + dir * u); return [px, H(px, pz) + LIFT + 0.012, pz]; };
  const seg = (u0, v0, u1, v1, w) => {
    const l = Math.hypot(u1 - u0, v1 - v0) || 1, nu = -(v1 - v0) / l * w / 2, nv = (u1 - u0) / l * w / 2;
    const q = [P(u0 - nu, v0 - nv), P(u1 - nu, v1 - nv), P(u1 + nu, v1 + nv), P(u0 + nu, v0 + nv)];
    if (dir < 0) q.reverse();       // keep the winding up-facing when mirrored
    g.quadP(q[0], q[1], q[2], q[3]);
  };
  const ring = (cv, r) => { for (let k = 0; k < 10; k++) { const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2; seg(Math.cos(a0) * r, cv + Math.sin(a0) * r * 1.6, Math.cos(a1) * r, cv + Math.sin(a1) * r * 1.6, 0.09); } };
  ring(0, 0.3); ring(1.6, 0.3);
  seg(0, 0, 0.12, 0.9, 0.09); seg(0.12, 0.9, 0, 1.6, 0.09); seg(-0.28, 1.25, 0.28, 1.25, 0.09);
  for (const v of [2.6, 3.5]) { seg(-0.5, v, 0, v + 0.7, 0.16); seg(0.5, v, 0, v + 0.7, 0.16); }
}

// --------------------------------------------------------------------------- providers
export function registerRoads(stream, { data, terrain, graph, root, colliders, markingsInShader = false }) {
  const roadMat = makeRoadMaterial({ coords: true, markings: markingsInShader }); roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -1; roadMat.polygonOffsetUnits = -2;
  const walkMat = makeSidewalkMaterial({ curbs: true }); walkMat.polygonOffset = true; walkMat.polygonOffsetFactor = -1; walkMat.polygonOffsetUnits = -2;
  const markMat = makeMarkingMaterial(); markMat.polygonOffset = true; markMat.polygonOffsetFactor = -2; markMat.polygonOffsetUnits = -4;
  const railMat = makeRailMaterial(); railMat.polygonOffset = true; railMat.polygonOffsetFactor = -3; railMat.polygonOffsetUnits = -6;
  // cable car trackway: photo concrete (world UVs), tinted dirty by the vertex colour
  const bedMat = PBR.material ? PBR.material('concrete_rough', { vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  bedMat.polygonOffset = true; bedMat.polygonOffsetFactor = -2; bedMat.polygonOffsetUnits = -4; bedMat.defines = { ...(bedMat.defines || {}), HB_PUDDLES: '' };
  const concrete = PBR.material ? PBR.material('concrete_rough', { vertexColors: true }) : new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.9 });
  concrete.side = THREE.DoubleSide;   // deck slabs / tunnel tubes are seen from both sides
  const H = (x, z) => terrain.heightAt(x, z);
  // edge / node / rail lists per tile (by midpoint / position)
  const byTile = new Map(), nodesByTile = new Map(), railsByTile = new Map();
  const tkey = (x, z) => stream.tileAt(x, z)?.key ?? -1;
  for (const e of graph.edges) { const m = pointAt(e, e.len / 2); const k = tkey(m[0], m[1]); if (!byTile.has(k)) byTile.set(k, []); byTile.get(k).push(e); }
  for (const n of graph.nodes) { const k = tkey(n.x, n.z); if (!nodesByTile.has(k)) nodesByTile.set(k, []); nodesByTile.get(k).push(n); }
  for (const r of data.extras.rails || []) {
    if (r.bridge) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const k = tkey((r.pts[i][0] + r.pts[i + 1][0]) / 2, (r.pts[i][1] + r.pts[i + 1][1]) / 2);
      if (!railsByTile.has(k)) railsByTile.set(k, []); railsByTile.get(k).push([r, i]);
    }
  }
  const deckY = (e, s, x, z) => e.deck ? yAtS(e, s) : H(x, z);
  const addMesh = (list, g, mat, name, opts = {}) => {
    if (g.empty) return;
    const m = new THREE.Mesh(g.toGeometry(), mat); m.name = name; m.receiveShadow = true; m.castShadow = !!opts.cast; m.matrixAutoUpdate = false;
    root.add(m); list.push(m);
  };

  // ---------------------------------------------------------------- asphalt + decks (range 1700 m)
  stream.register({
    name: 'roads', range: 1700, priority: -1,
    load(tile) {
      const edges = byTile.get(tile.key) || [], nodes = nodesByTile.get(tile.key) || [];
      if (!edges.length && !nodes.length) return null;
      const road = new GeoBuilder({ uv: true, color: true, extra: { aRoad: 4, aLanes: 4, aSpan: 4 } }), deckG = new GeoBuilder({ uv: true, color: true });
      const meshes = [], cols = [];
      for (const e of edges) {
        if (e.unpaved && !e.deck) continue;                                    // dirt tracks: the terrain's dirt shows
        const [s0, s1] = edgeSpan(e);
        const st = stations(e, s0, s1, e.deck ? 6 : 4);
        const tint = 0.84 + hash01(e.id, 7, 3) * 0.2, brick = e.kind === 'crooked';
        const c0 = brick ? [0.62 * tint, 0.36 * tint, 0.3 * tint] : e.kind === 'highway' ? [tint * 1.04, tint * 1.03, tint] : [tint, tint, tint];
        const hw = e.width / 2, G_ = Math.min(0.8, hw * 0.12);
        // 6 across: gutter | parking/edge | centre | ... so the shader gets clean linear lateral coordinates
        const offs = [-hw, -hw + G_, -hw * 0.5, 0, hw * 0.5, hw - G_, hw], cm = [0.62, 1, 1, 1, 1, 1, 0.62];
        const flags = roadFlags(e);
        road.e.aLanes = [e.lanes, e.laneW, e.median, e.parkSides ? e.parkW : 0];
        const ctl = n => (n.signal || n.stop) && junction(n).k >= 3;
        road.e.aSpan = [s0, s1, hash01(e.id, 11, 5), (ctl(e.a) ? 1 : 0) + (ctl(e.b) ? 2 : 0)];
        let prev = -1;
        for (const s of st) {
          const [x, z, , , rx, rz] = frameAt(e, s);
          const base = road.n;
          for (let q = 0; q < offs.length; q++) {
            const px = x + rx * offs[q], pz = z + rz * offs[q];
            road.setColor(c0[0] * cm[q], c0[1] * cm[q], c0[2] * cm[q]);
            road.e.aRoad = [offs[q], s, hw, flags];
            road.v(px, deckY(e, s, px, pz) + LIFT, pz, 0, 1, 0, px / PBR.TILE.asphalt, pz / PBR.TILE.asphalt);
          }
          if (prev >= 0) for (let q = 0; q < offs.length - 1; q++) road.quad(prev + q, prev + q + 1, base + q + 1, base + q);
          prev = base;
        }
        if (e.deck) buildDeck(e, st, deckG, cols);
      }
      // junction polygons (fan from the centre)
      for (const n of nodes) {
        const j = junction(n); if (j.k < 3 || !j.poly.length) continue;
        const onDeck = n.edges.some(e => e.deck);
        const t = 0.9 + hash01(n.id, 3, 1) * 0.14; road.setColor(t, t, t);
        road.e.aRoad = [0, 0, 0, RF.JUNCTION]; road.e.aLanes = [0, 0, 0, 0]; road.e.aSpan = [0, 0, 0, 0];
        const cy = onDeck ? (n.y ?? H(n.x, n.z)) : H(n.x, n.z);
        const c = road.v(n.x, cy + LIFT, n.z, 0, 1, 0, n.x / PBR.TILE.asphalt, n.z / PBR.TILE.asphalt);
        const ring = [];
        for (const [x, z] of j.poly) ring.push(road.v(x, (onDeck ? cy : H(x, z)) + LIFT, z, 0, 1, 0, x / PBR.TILE.asphalt, z / PBR.TILE.asphalt));
        for (let i = 0; i < ring.length; i++) road.tri(c, ring[(i + 1) % ring.length], ring[i]);
      }
      addMesh(meshes, road, roadMat, 'roads');
      addMesh(meshes, deckG, concrete, 'decks', { cast: true });
      if (colliders.addAll) colliders.addAll(cols); else cols.forEach(c => colliders.add(c));   // (addAll returns undefined: `?.() ??` added every collider twice and leaked one copy per tile load)
      return { meshes, cols };
    },
    unload(h) { if (!h) return; for (const m of h.meshes) { root.remove(m); m.geometry.dispose(); } for (const c of h.cols) colliders.remove(c); },
  });

  // is (x, z) on (or within 1 m of) another deck edge's roadway at about height y?
  function onOtherDeck(e, x, z, y, below = false) {
    const C = graph.edgeHashCell, arr = C && graph.edgeHash.get(Math.floor(x / C) * 100003 + Math.floor(z / C));
    if (!arr) return false;
    for (const [o, k] of arr) {
      if (o === e || !o.deck || o.deck.tunnel || o.tunnel) continue;
      const a = o.pts[k], b = o.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) > o.width / 2 + 1) continue;
      const oy = o.ys ? o.ys[k] + (o.ys[k + 1] - o.ys[k]) * t : y;
      if (below ? oy < y - 2.5 : Math.abs(oy - y) < 2.5) return true;
    }
    return false;
  }
  // is (x, z) within the carriageway (+ pad) of a ground-level (non-deck, non-tunnel) road?
  function onGroundRoad(x, z, pad = 0) {
    const C = graph.edgeHashCell, arr = C && graph.edgeHash.get(Math.floor(x / C) * 100003 + Math.floor(z / C));
    if (!arr) return false;
    for (const [o, k] of arr) {
      if (o.deck || o.tunnel || o.kind === 'plaza') continue;
      const a = o.pts[k], b = o.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < o.width / 2 + pad) return true;
    }
    return false;
  }
  // viaduct slab + barriers + piers (bridges owned by the landmarks module draw their own structure); tunnels get a tube
  function buildDeck(e, st, g, cols) {
    const kind = e.deck.kind, hw = e.width / 2 + (e.deck.sidewalk || 0), hero = kind === 'goldengate' || kind === 'baybridge';
    const tube = e.deck.tunnel;
    for (let i = 0; i < st.length - 1; i++) {
      const sa = st[i], sb = st[i + 1];
      const [ax, az, , , arx, arz] = frameAt(e, sa), [bx, bz, , , brx, brz] = frameAt(e, sb);
      const ay = yAtS(e, sa), by = yAtS(e, sb);
      // barrier colliders (both sides), 1.1 m tall; skipped where the side overlaps a parallel carriageway at the same
      // level (OSM divided decks such as the Golden Gate: the inner barriers would stand inside the other roadway)
      for (const sd of [-1, 1]) {
        const cx = (ax + bx) / 2 + (arx + brx) / 2 * sd * (hw + 0.25), cz = (az + bz) / 2 + (arz + brz) / 2 * sd * (hw + 0.25);
        if (!tube && onOtherDeck(e, cx, cz, (ay + by) / 2)) continue;
        const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
        // ... and where it stands on a ground road's carriageway within 3 m of the deck level (ramp gores, a side road joining
        // a short deck, a ramp deck running alongside Treasure Island Rd: barrier stubs on the road stopped every racer dead)
        if (!tube) {
          const ux = (bx - ax) / (len || 1) * (len / 2), uz = (bz - az) / (len || 1) * (len / 2);
          let atGrade = false;
          for (const q of [0, -1, 1]) { const px = cx + ux * q, pz = cz + uz * q; if (onGroundRoad(px, pz, 0.3) && Math.abs(H(px, pz) - (q < 0 ? ay : q > 0 ? by : (ay + by) / 2)) < 3) { atGrade = true; break; } }
          if (atGrade) continue;
        }
        // tunnel walls stop 0.3 m under the ground surface above them (thin cover near a portal: the 7 m walls stood out of
        // the hillside as invisible walls on the road / field on top: Headlands XC over the Alexander Ave tunnel)
        let yTop = Math.max(ay, by) + (tube ? 7 : 1.1);
        if (tube) { const hs = Math.min(H(cx, cz), H(cx - (bx - ax) / 2, cz - (bz - az) / 2), H(cx + (bx - ax) / 2, cz + (bz - az) / 2)); yTop = Math.max(Math.max(ay, by) + 2.2, Math.min(yTop, hs - 0.3)); }
        cols.push({ x: cx, z: cz, hx: 0.25, hz: len / 2 + 0.3, yaw, yMin: Math.min(ay, by) - 0.5, yMax: yTop, kind: 'rail' });
      }
      if (hero) continue;
      g.setColor(0.8, 0.79, 0.76);
      if (tube) {
        // walls + ceiling
        for (const sd of [-1, 1]) {
          const w0 = [ax + arx * sd * (hw + 0.6), ay, az + arz * sd * (hw + 0.6)], w1 = [bx + brx * sd * (hw + 0.6), by, bz + brz * sd * (hw + 0.6)];
          quadV(g, w0, w1, 6.2, sd);
        }
        g.setColor(0.55, 0.55, 0.53);
        const c0 = [ax - arx * (hw + 0.6), ay + 6.2, az - arz * (hw + 0.6)], c1 = [bx - brx * (hw + 0.6), by + 6.2, bz - brz * (hw + 0.6)];
        const c2 = [bx + brx * (hw + 0.6), by + 6.2, bz + brz * (hw + 0.6)], c3 = [ax + arx * (hw + 0.6), ay + 6.2, az + arz * (hw + 0.6)];
        g.quadP(c0, c3, c2, c1);
        continue;
      }
      // slab underside + fascias + parapets
      const dep = 1.5;
      const L0 = [ax - arx * hw, ay, az - arz * hw], R0 = [ax + arx * hw, ay, az + arz * hw], L1 = [bx - brx * hw, by, bz - brz * hw], R1 = [bx + brx * hw, by, bz + brz * hw];
      const dn = p => [p[0], p[1] - dep, p[2]];
      g.quadP(dn(L0), dn(L1), dn(R1), dn(R0));                    // underside (faces down)
      g.quadP(dn(L1), dn(L0), L0, L1); g.quadP(dn(R0), dn(R1), R1, R0);  // fascias
      const up = (p, h) => [p[0], p[1] + h, p[2]];
      g.setColor(0.86, 0.85, 0.82);
      g.quadP(L0, L1, up(L1, 0.95), up(L0, 0.95)); g.quadP(R1, R0, up(R0, 0.95), up(R1, 0.95));      // parapet inner faces
      g.quadP(up(L1, 0.95), up(L0, 0.95), up([L0[0] - arx * 0.35, L0[1], L0[2] - arz * 0.35], 0.95), up([L1[0] - brx * 0.35, L1[1], L1[2] - brz * 0.35], 0.95));
      g.quadP(up(R0, 0.95), up(R1, 0.95), up([R1[0] + brx * 0.35, R1[1], R1[2] + brz * 0.35], 0.95), up([R0[0] + arx * 0.35, R0[1], R0[2] + arz * 0.35], 0.95));
      // piers every ~30 m where the deck is well above the ground (not over water)
      const s = (sa + sb) / 2;
      if (Math.floor(sa / 30) !== Math.floor(sb / 30)) {
        const x = (ax + bx) / 2, z = (az + bz) / 2, y = (ay + by) / 2, gy = H(x, z);
        if (y - gy > 3.5 && gy > -0.5) {
          g.setColor(0.74, 0.73, 0.7);
          const n = hw > 9 ? 2 : 1, yaw = Math.atan2(bx - ax, bz - az);
          for (let p = 0; p < n; p++) {
            const off = n === 1 ? 0 : (p ? 1 : -1) * hw * 0.5;
            const px = x + arx * off, pz = z + arz * off, top = y - dep, hh = (top - gy + 0.5) / 2;
            if (onOtherDeck(e, px, pz, y, true)) continue;   // stacked decks (Bay Bridge): no pier through the lower roadway
            if (onGroundRoad(px, pz, 1.4)) continue;          // never a pier in the carriageway of a street under the viaduct
            g.box(px, gy - 0.5 + hh, pz, 0.8, hh, 0.8, yaw, 0b001111);
            cols.push({ x: px, z: pz, hx: 0.8, hz: 0.8, yaw, yMin: gy - 1, yMax: top, kind: 'pole' });
          }
        }
      }
      void s;
    }
  }
  function quadV(g, a, b, h, sd) {
    const A = a, B = b, C = [b[0], b[1] + h, b[2]], D = [a[0], a[1] + h, a[2]];
    if (sd > 0) g.quadP(B, A, D, C); else g.quadP(A, B, C, D);
  }

  // ---------------------------------------------------------------- sidewalks + curbs (range 900 m)
  stream.register({
    name: 'sidewalks', range: 900, priority: 0,
    load(tile) {
      const edges = byTile.get(tile.key) || [], nodes = nodesByTile.get(tile.key) || [];
      const g = new GeoBuilder({ uv: true, color: true, extra: { aCurb: 4, aCurbD: 1, aCurbZ: 4, aCurbDr: 1 } });
      // daylighting red at a block end: junctions only (not way splits), most corners (SF paints ~20 ft back from the crosswalk)
      const redEnd = (n, e, k) => junction(n).k >= 3 && e.kind !== 'crooked' && hash01(e.id, k, 17) < 0.85;
      const tk = PBR.TILE.concrete || 3;
      const V = (x, y, z) => g.v(x, y, z, 0, 1, 0, x / tk, z / tk);
      for (const e of edges) {
        if (e.deck || !(e.sidewalk > 0)) continue;
        const [s0, s1] = edgeSpan(e);
        const st = stations(e, s0, s1, 4);
        const hw = e.width / 2, sw = e.sidewalk;
        const t = 0.9 + hash01(e.id, 5, 2) * 0.12, seed = hash01(e.id, 11, 5);
        const ra = redEnd(e.a, e, 1) ? s0 : -1e4, rb = redEnd(e.b, e, 2) ? s1 : 1e4;
        for (const sd of [-1, 1]) {
          let pi = -1, pc = -1;
          g.e.aCurbZ = curbPlan(e, sd, s0, s1); g.e.aCurbDr = [drainAt(seed, sd, s0, s1)];
          for (const s of st) {
            const [x, z, , , rx, rz] = frameAt(e, s);
            const ix = x + rx * sd * hw, iz = z + rz * sd * hw, ox = x + rx * sd * (hw + sw), oz = z + rz * sd * (hw + sw);
            const yi = H(ix, iz), yo = H(ox, oz);
            g.setColor(t, t, t);
            g.e.aCurb = [s, ra, rb, sd * (1 + seed)]; g.e.aCurbD = [0];
            const a = V(ix, yi + CURB, iz); g.e.aCurbD = [sw]; const b = V(ox, yo + CURB, oz);
            g.setColor(t * 0.8, t * 0.8, t * 0.78); g.e.aCurbD = [-1];
            const c = g.v(ix, yi + LIFT - 0.02, iz, -rx * sd, 0, -rz * sd, s / 1.5, 0), d = g.v(ix, yi + CURB, iz, -rx * sd, 0, -rz * sd, s / 1.5, CURB);
            if (pi >= 0) {
              if (sd > 0) { g.quad(pi, pi + 1, b, a); g.quad(pc, pc + 1, d, c); }
              else { g.quad(pi, a, b, pi + 1); g.quad(pc, c, d, pc + 1); }
            }
            pi = a; pc = c;
          }
        }
      }
      // corners: between each pair of neighbouring arms, a sidewalk patch (inner chord = curb)
      g.e.aCurbZ = [-1, -1, -1, -1]; g.e.aCurbDr = [-1];
      for (const n of nodes) {
        const j = junction(n); if (j.k < 3) continue;
        for (let i = 0; i < j.k; i++) {
          const A = j.arms[i], B = j.arms[(i + 1) % j.k];
          if (!(A.sw > 0) || !(B.sw > 0)) continue;
          // nearly parallel neighbours (a divided street's two carriageways) enclose a median, not a corner: a corner
          // patch there laid a sidewalk + a curb face diagonally across the roadway (Powell at California)
          let da = B.ang - A.ang; if (da < 0) da += Math.PI * 2;
          if (da < 0.45) continue;
          // short links inside a junction cluster (divided-road crossings): the space between is roadway, not a corner
          const link = e => e.len < 16 && junction(e.a).k >= 3 && junction(e.b).k >= 3;
          if (link(A.e) || link(B.e)) continue;
          const Ai = [n.x + A.dx * A.trim + A.nx * A.hw, n.z + A.dz * A.trim + A.nz * A.hw];
          const Ao = [n.x + A.dx * A.trim + A.nx * (A.hw + A.sw), n.z + A.dz * A.trim + A.nz * (A.hw + A.sw)];
          const Bi = [n.x + B.dx * B.trim - B.nx * B.hw, n.z + B.dz * B.trim - B.nz * B.hw];
          const Bo = [n.x + B.dx * B.trim - B.nx * (B.hw + B.sw), n.z + B.dz * B.trim - B.nz * (B.hw + B.sw)];
          const oc = corner(A, B, A.hw + A.sw, B.hw + B.sw);
          const pts = [Ai, Ao];
          if (oc) pts.push([n.x + A.dx * oc[0] + A.nx * (A.hw + A.sw), n.z + A.dz * oc[0] + A.nz * (A.hw + A.sw)]);
          pts.push(Bo, Bi);
          const t = 0.92; g.setColor(t, t, t);
          g.e.aCurb = [0, 0, 0, 10 + hash01(n.id, i, 9)];   // shader: red when the hash < 0.85
          const ids = pts.map(([x, z], q) => { g.e.aCurbD = [q === 0 || q === pts.length - 1 ? 0 : A.sw]; return V(x, H(x, z) + CURB, z); });
          for (let q = 1; q < ids.length - 1; q++) g.tri(ids[0], ids[q + 1], ids[q]);
          // curb face along the inner chord Ai -> Bi
          const dx = Bi[0] - Ai[0], dz = Bi[1] - Ai[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
          g.setColor(0.72, 0.72, 0.7); g.e.aCurbD = [-1];
          const y0 = H(Ai[0], Ai[1]), y1 = H(Bi[0], Bi[1]);
          const a = g.v(Ai[0], y0 + LIFT - 0.02, Ai[1], nx, 0, nz, 0, 0), b = g.v(Bi[0], y1 + LIFT - 0.02, Bi[1], nx, 0, nz, l / 1.5, 0);
          const c = g.v(Bi[0], y1 + CURB, Bi[1], nx, 0, nz, l / 1.5, CURB), d = g.v(Ai[0], y0 + CURB, Ai[1], nx, 0, nz, 0, CURB);
          g.quad(a, b, c, d); g.quad(a, d, c, b);
        }
      }
      if (g.empty) return null;
      const m = new THREE.Mesh(g.toGeometry(), walkMat); m.name = 'sidewalks'; m.receiveShadow = true; m.matrixAutoUpdate = false;
      root.add(m);
      return { meshes: [m] };
    },
    unload(h) { if (!h) return; for (const m of h.meshes) { root.remove(m); m.geometry.dispose(); } },
  });

  // ---------------------------------------------------------------- markings + rails (range 480 m)
  stream.register({
    name: 'markings', range: 480, priority: 1,
    load(tile) {
      const edges = byTile.get(tile.key) || [], nodes = nodesByTile.get(tile.key) || [];
      const g = new GeoBuilder({ uv: false, color: true });
      const line = (e, s0, s1, off, w, col, dash = 0, gap = 0) => {
        if (s1 - s0 < 1) return;
        const st = stations(e, s0, s1, 2);
        g.setColor(...col);
        let prev = -1;
        for (let i = 0; i < st.length; i++) {
          const s = st[i];
          const on = !dash || ((s - s0) % (dash + gap)) < dash;
          if (!on) { prev = -1; continue; }
          const [x, z, , , rx, rz] = frameAt(e, s);
          const ax = x + rx * (off - w / 2), az = z + rz * (off - w / 2), bx = x + rx * (off + w / 2), bz = z + rz * (off + w / 2);
          const a = g.v(ax, deckY(e, s, ax, az) + LIFT + 0.01, az, 0, 1, 0), b = g.v(bx, deckY(e, s, bx, bz) + LIFT + 0.01, bz, 0, 1, 0);
          if (prev >= 0) g.quad(prev, prev + 1, b, a);
          prev = a;
        }
      };
      for (const e of edges) {
        if (markingsInShader) break;
        if (e.unpaved || e.kind === 'crooked' || e.kind === 'alley' || e.kind === 'plaza' || e.tunnel) continue;
        const [s0, s1] = edgeSpan(e);
        const a = s0 + (junction(e.a).k >= 3 ? 1.5 : 0), b = s1 - (junction(e.b).k >= 3 ? 1.5 : 0);
        const hw = e.width / 2;
        if (!e.oneway) {
          if (e.width >= 7) { line(e, a, b, 0.13, 0.1, YELLOW); line(e, a, b, -0.13, 0.1, YELLOW); }
          for (let l = 1; l < e.lanes; l++) for (const sd of [-1, 1]) line(e, a, b, sd * (e.median + l * e.laneW), 0.11, WHITE, 3, 6);
        } else {
          const W = e.lanes * e.laneW;
          for (let l = 1; l < e.lanes; l++) line(e, a, b, -W / 2 + l * e.laneW, 0.11, WHITE, 3, 6);
          if (e.kind === 'highway') { line(e, a, b, -W / 2 - 0.1, 0.13, YELLOW); line(e, a, b, W / 2 + 0.1, 0.14, WHITE); }
        }
        if (e.kind === 'highway' && !e.oneway) for (const sd of [-1, 1]) line(e, a, b, sd * (hw - 0.45), 0.14, WHITE);
      }
      // crosswalks + stop lines at controlled junctions. SF styles: continental (wide bars along the traffic) downtown / on
      // arterials / at marked crossings there, two transverse lines elsewhere, a few residential stops unmarked. All-way
      // stops get the stop line + a "STOP" legend in every approach lane.
      for (const n of nodes) {
        if (!(n.signal || n.stop)) continue;
        const j = junction(n); if (j.k < 3) continue;
        const zone = zoneAtV2(n.x, n.z), dtown = COMMERCIAL_ZONES_V2.has(zone) || zone === 'soma' || zone === 'downtown_soma';
        const art = n.edges.some(e => e.kind === 'arterial');
        const style = ((n.signal || (n.ctrl & 4)) && (dtown || art)) ? 2 : (n.signal || hash01(n.id, 3, 7) < 0.8) ? 1 : 0;
        g.setColor(...WHITE);
        // the crosswalk band of every marked arm; bars never cross into a neighbouring arm's band (no '#' corners where
        // two crosswalks meet at a skewed / tight junction) and stop at the junction corner
        const bands = [];
        for (const A of j.arms) {
          if (A.e.deck || A.e.kind === 'highway' || A.e.kind === 'alley' || A.e.kind === 'crooked') continue;
          if (A.trim - 3.4 < 0.5) continue;
          bands.push(A);
        }
        const inOther = (A, x, z) => {
          for (const B of bands) {
            if (B === A) continue;
            const sa = (x - n.x) * B.dx + (z - n.z) * B.dz, l = (x - n.x) * B.nx + (z - n.z) * B.nz;
            if (sa > B.trim - 3.4 - 0.25 && sa < B.trim - 0.4 + 0.25 && Math.abs(l) < B.hw + 0.25) return true;
          }
          return false;
        };
        for (const A of bands) {
          const s = A.trim, hw = A.hw;
          const P = (sa, l) => { const x = n.x + A.dx * sa + A.nx * l, z = n.z + A.dz * sa + A.nz * l; return [x, H(x, z) + LIFT + 0.012, z]; };
          const quad = (s0, s1, l0, l1) => g.quadP(P(s0, l0), P(s0, l1), P(s1, l1), P(s1, l0));
          const hit = (sa, l) => inOther(A, n.x + A.dx * sa + A.nx * l, n.z + A.dz * sa + A.nz * l);
          // a bar [s0,s1] x [l0,l1] is clear if no sample on its outline lies in another band
          const clear = (s0, s1, l0, l1) => { for (let i = 0; i <= 4; i++) { const sa = s0 + (s1 - s0) * i / 4; if (hit(sa, l0) || hit(sa, l1)) return false; } for (let i = 1; i < 4; i++) { const l = l0 + (l1 - l0) * i / 4; if (hit(s0, l) || hit(s1, l)) return false; } return true; };
          // a transverse line: shrink its lateral span from both ends until it is clear of the other bands
          const across = (s0, s1, l0, l1) => {
            let a = l0, b = l1;
            while (a < b - 0.6 && (hit(s0, a) || hit(s1, a))) a += 0.2;
            while (b > a + 0.6 && (hit(s0, b) || hit(s1, b))) b -= 0.2;
            if (b - a >= 0.6) quad(s0, s1, a, b);
          };
          const c0 = s - 3.4, c1 = s - 0.4;
          if (style === 2) {
            const nb = Math.max(1, Math.floor((2 * hw - 0.6) / 1.2) + 1), st = (2 * hw - (nb * 1.2 - 0.6)) / 2;
            for (let q = 0; q < nb; q++) { const l = -hw + st + q * 1.2; if (clear(c0, c1, l, l + 0.6)) quad(c0, c1, l, l + 0.6); }
          } else if (style === 1) { across(c0, c0 + 0.3, -hw + 0.3, hw - 0.3); across(c1 - 0.3, c1, -hw + 0.3, hw - 0.3); }
          // stop line across the approach half (arriving traffic keeps right = the -n side of the outgoing arm)
          const arrive = !A.e.oneway || !A.fwd;
          if (arrive) across(s + 0.2, s + 0.65, -hw + 0.3, A.e.oneway ? hw - 0.3 : -0.25);
          // STOP legend: letters 2.4 m long (they read right at a driver's grazing angle), 1.6 m behind the stop line;
          // the driver faces the node, so their right is -n: the word runs from +l to -l, letter tops toward the node
          if (n.stop && arrive && A.e.len > 28 && s + 4.5 < A.e.len * 0.5 && A.e.laneW >= 2.6 && (A.e.kind === 'street' || A.e.kind === 'arterial')) {
            const e = A.e, lw = e.laneW, nl = Math.min(3, e.lanes), W = e.lanes * lw;
            for (let k = 0; k < nl; k++) {
              const lc = e.oneway ? W / 2 - (k + 0.5) * lw : -(e.median + (k + 0.5) * lw);
              if (Math.abs(lc) + 1.1 > hw) continue;
              const top = s + 1.6, LW = 0.42, GAP = 0.12, lx0 = lc + (4 * LW + 3 * GAP) / 2;
              ['S', 'T', 'O', 'P'].forEach((ch, i) => {
                const ls = lx0 - i * (LW + GAP);
                for (const [x0, y0, x1, y1] of GLYPH[ch]) quad(top + 2.4 - y1 * 0.48, top + 2.4 - y0 * 0.48, ls - x1 * LW / 3, ls - x0 * LW / 3);
              });
            }
          }
        }
      }
      // sharrows (shared lane markings): a bike + two chevrons in the outer lane each way, every ~60 m
      for (const e of edges) {
        if (!e.sharrow || e.cycle || e.deck || e.unpaved || e.kind === 'alley' || e.kind === 'highway' || e.kind === 'crooked' || e.width < 7) continue;
        const [s0, s1] = edgeSpan(e); if (s1 - s0 < 40) continue;
        const hw = e.width / 2, pw = e.parkSides ? e.parkW : 0;
        g.setColor(...WHITE);
        for (const sd of e.oneway ? [1] : [1, -1]) {
          const lat = sd * (hw - pw - 1.6);
          for (let s = s0 + 14 + hash01(e.id, sd + 3, 5) * 10; s < s1 - 14; s += 60) sharrow(g, e, s, lat, e.oneway ? 1 : sd, H);
        }
      }
      // rails: polished steel heads (rail material) in tar-sealed flangeways; cable car lines: 3'6" gauge on a concrete
      // trackway with the cable slot between its slot rails; streetcar / light rail: standard gauge set in the asphalt
      const gr = new GeoBuilder({ uv: false, color: true }), gb = new GeoBuilder({ uv: true, color: true });
      const tkc = PBR.TILE.concrete || 3;
      for (const [r, i] of railsByTile.get(tile.key) || []) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L, rx = -dz, rz = dx;
        const cable = r.kind === 'cable', street = r.kind !== 'rail', gauge = cable ? 0.534 : 0.718;
        const strips = [];      // [offset, width, colour, lift, steel]
        if (cable) strips.push([0, 1.9, TRACKBED, 0.011, 'bed']);
        for (const sg of [-1, 1]) {
          if (street) strips.push([sg * (gauge - 0.058), 0.045, GROOVE, 0.013, false]);
          strips.push([sg * gauge, 0.066, STEEL, 0.015, true]);
        }
        if (cable) strips.push([0, 0.026, GROOVE, 0.013, false], [-0.042, 0.04, STEEL, 0.015, true], [0.042, 0.04, STEEL, 0.015, true]);
        const n = Math.max(1, Math.ceil(L / 2));
        const ys = [];
        for (let q = 0; q <= n; q++) ys.push(H(ax + dx * L * q / n, az + dz * L * q / n));
        for (const [o, w, col, lift, steel] of strips) {
          const B = steel === 'bed' ? gb : steel ? gr : g;
          B.setColor(...col);
          let prev = -1;
          for (let q = 0; q <= n; q++) {
            const x = ax + dx * L * q / n, z = az + dz * L * q / n;
            const p0x = x + rx * (o - w / 2), p0z = z + rz * (o - w / 2), p1x = x + rx * (o + w / 2), p1z = z + rz * (o + w / 2);
            const y = ys[q] + LIFT + lift;
            const a2 = B.v(p0x, y, p0z, 0, 1, 0, p0x / tkc, p0z / tkc), b2 = B.v(p1x, y, p1z, 0, 1, 0, p1x / tkc, p1z / tkc);
            if (prev >= 0) B.quad(prev, prev + 1, b2, a2);
            prev = a2;
          }
        }
      }
      const out = [];
      if (!gb.empty) { const bm = new THREE.Mesh(gb.toGeometry(), bedMat); bm.name = 'trackways'; bm.receiveShadow = true; bm.matrixAutoUpdate = false; root.add(bm); out.push(bm); }
      if (!gr.empty) { const rm = new THREE.Mesh(gr.toGeometry(), railMat); rm.name = 'rails'; rm.receiveShadow = true; rm.matrixAutoUpdate = false; root.add(rm); out.push(rm); }
      if (g.empty && !out.length) return null;
      if (!g.empty) { const m = new THREE.Mesh(g.toGeometry(), markMat); m.name = 'markings'; m.receiveShadow = true; m.matrixAutoUpdate = false; root.add(m); out.push(m); }
      return { meshes: out };
    },
    unload(h) { if (!h) return; for (const m of h.meshes) { root.remove(m); m.geometry.dispose(); } },
  });
  return { roadMat, walkMat, markMat, railMat };
}
