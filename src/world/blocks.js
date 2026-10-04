// City blocks: grid cells minus street corridors, clipped by the diagonal / curved special roads, then building lots.
import { GRID_X, GRID_Z } from './terrain.js';
import { SPECIAL_ROADS, PARK_BLOCKS, LANDMARK_BLOCKS, zoneAt, coastSDF, DECKS } from './map.js';
import { clipHalfPlane, polyArea, polyCentroid, insetConvex, pointInConvex, obbOverlap, obbCorners, simplify, mulberry32 } from './geo.js';

export const SIDEWALK = 3.6;

export function buildBlocks(terrain) {
  // special-road chunks (straightened) for clipping
  const chunks = [];
  for (const r of SPECIAL_ROADS) {
    if (r.kind === 'crooked') continue; // lives in the removed Lombard corridor between two blocks
    const s = simplify(r.path.map(p => [p[0], p[1]]), 1.2);
    for (let k = 0; k < s.length - 1; k++) {
      const [ax, az] = s[k], [bx, bz] = s[k + 1];
      const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
      chunks.push({ ax, az, bx, bz, dx: (bx - ax) / l, dz: (bz - az) / l, len: l, hw: r.width / 2, road: r,
        minx: Math.min(ax, bx) - r.width, maxx: Math.max(ax, bx) + r.width, minz: Math.min(az, bz) - r.width, maxz: Math.max(az, bz) + r.width });
    }
  }
  // deck corridors (no buildings under the Bay Bridge approach etc.)
  const deckSegs = [];
  for (const d of DECKS) if (d.kind !== 'pier') for (let k = 0; k < d.pts.length - 1; k++) deckSegs.push([d.pts[k], d.pts[k + 1], d.width / 2 + 6]);

  const blocks = [];
  for (let j = 0; j < GRID_Z.length - 1; j++) {
    for (let i = 0; i < GRID_X.length - 1; i++) {
      if (!terrain.cellIsActive(i, j)) continue;
      const x0 = GRID_X[i].c + GRID_X[i].hw, x1 = GRID_X[i + 1].c - GRID_X[i + 1].hw;
      const z0 = GRID_Z[j].c + GRID_Z[j].hw, z1 = GRID_Z[j + 1].c - GRID_Z[j + 1].hw;
      let pieces = [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]];
      for (const ch of chunks) {
        if (ch.maxx < x0 || ch.minx > x1 || ch.maxz < z0 || ch.minz > z1) continue;
        const next = [];
        for (const pc of pieces) {
          if (!chunkTouches(ch, pc)) { next.push(pc); continue; }
          for (const q of subtractRect(pc, ch)) if (q.length >= 3 && Math.abs(polyArea(q)) > 30) next.push(q);
        }
        pieces = next;
      }
      for (const pc of pieces) {
        const area = Math.abs(polyArea(pc));
        if (area < 220) continue;
        const [cx, cz] = polyCentroid(pc);
        if (coastSDF(cx, cz) < 18) continue;
        // thinness: min over edges of the max distance of vertices from the edge
        let thin = Infinity;
        for (let e = 0; e < pc.length; e++) {
          const a = pc[e], b = pc[(e + 1) % pc.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          let md = 0; for (const p of pc) md = Math.max(md, Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / l);
          thin = Math.min(thin, md);
        }
        if (thin < 11) continue;
        const park = PARK_BLOCKS.find(([px0, pz0, px1, pz1]) => cx > px0 && cx < px1 && cz > pz0 && cz < pz1);
        const landmark = LANDMARK_BLOCKS.find(([px0, pz0, px1, pz1]) => cx > px0 && cx < px1 && cz > pz0 && cz < pz1);
        blocks.push({ id: blocks.length, i, j, poly: pc, cx, cz, area, zone: zoneAt(cx, cz), park: park ? park[4] : null, landmark: !!landmark,
          rect: pieces.length === 1 && pc.length === 4 });
      }
    }
  }
  // lots
  for (const b of blocks) {
    b.inner = insetConvex(b.poly, SIDEWALK);
    b.lots = [];
    if (!b.inner || b.park) continue;
    genLots(b, deckSegs);
  }
  return blocks;
}

// convex polygon minus the chunk's road rectangle (segment extended by hw at both ends, half-width hw) -> convex pieces
function subtractRect(poly, ch) {
  const nx = -ch.dz, nz = ch.dx, c = nx * ch.ax + nz * ch.az;
  const dA = ch.dx * ch.ax + ch.dz * ch.az - ch.hw, dB = ch.dx * ch.bx + ch.dz * ch.bz + ch.hw;
  const out = [];
  out.push(clipHalfPlane(poly, nx, nz, c + ch.hw));                 // beyond the right edge
  let q = clipHalfPlane(poly, -nx, -nz, -(c + ch.hw));
  out.push(clipHalfPlane(q, -nx, -nz, -(c - ch.hw)));                // beyond the left edge
  q = clipHalfPlane(q, nx, nz, c - ch.hw);
  out.push(clipHalfPlane(q, -ch.dx, -ch.dz, -dA));                   // before the start
  q = clipHalfPlane(q, ch.dx, ch.dz, dA);
  out.push(clipHalfPlane(q, ch.dx, ch.dz, dB));                      // after the end
  return out;
}

function chunkTouches(ch, poly) {
  // any vertex within hw of the (extended by hw) segment, or segment crosses an edge, or endpoint inside
  const ext = ch.hw;
  const ax = ch.ax - ch.dx * ext, az = ch.az - ch.dz * ext, bx = ch.bx + ch.dx * ext, bz = ch.bz + ch.dz * ext;
  for (const p of poly) {
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = ((p[0] - ax) * ex + (p[1] - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(p[0] - ax - ex * t, p[1] - az - ez * t) < ch.hw) return true;
  }
  if (pointInConvex(ch.ax, ch.az, poly) || pointInConvex(ch.bx, ch.bz, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (segX(ax, az, bx, bz, a[0], a[1], b[0], b[1])) return true;
  }
  return false;
}
function segX(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}
function distToSeg(x, z, a, b) {
  const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
  let t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
}

// lot widths / depths per zone
const ZONE_LOT = {
  downtown: { w: [26, 44], d: [24, 36] },
  downtown_soma: { w: [24, 42], d: [22, 34] },
  soma: { w: [16, 34], d: [18, 30] },
  chinatown: { w: [9, 16], d: [18, 26] },
  northbeach: { w: [8, 14], d: [16, 24] },
  wharf: { w: [14, 26], d: [14, 22] },
  tenderloin: { w: [14, 26], d: [18, 28] },
  nobhill: { w: [14, 28], d: [18, 30] },
  marina: { w: [9, 14], d: [18, 24] },
  victorian: { w: [7, 9.5], d: [18, 24] },
  castro: { w: [7, 10], d: [16, 22] },
  mission: { w: [7.5, 12], d: [16, 24] },
  avenues: { w: [8, 11], d: [16, 22] },
  industrial: { w: [22, 44], d: [22, 36] },
};

function genLots(b, deckSegs) {
  const rnd = mulberry32(b.i * 7919 + b.j * 104729 + 17);
  const spec = ZONE_LOT[b.zone] || ZONE_LOT.victorian;
  const poly = b.inner;
  const n = poly.length;
  const [cx, cz] = polyCentroid(poly);
  const edges = [];
  for (let e = 0; e < n; e++) {
    const a = poly[e], c = poly[(e + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    edges.push({ a, c, len });
  }
  edges.sort((p, q) => q.len - p.len);
  const lots = b.lots;
  for (const ed of edges) {
    if (ed.len < 7) continue;
    const dx = (ed.c[0] - ed.a[0]) / ed.len, dz = (ed.c[1] - ed.a[1]) / ed.len;
    let nx = -dz, nz = dx;
    if ((cx - ed.a[0]) * nx + (cz - ed.a[1]) * nz < 0) { nx = -nx; nz = -nz; } // inward
    // building faces the street: its local -Z (front) points outward = -n. yaw so that front dir (-sin,-cos) = -n
    const yaw = Math.atan2(nx, nz);
    let s = 0;
    while (s < ed.len - 4) {
      let w = spec.w[0] + rnd() * (spec.w[1] - spec.w[0]);
      if (ed.len - s - w < spec.w[0] * 0.7) w = ed.len - s; // absorb the remainder
      if (w < 5) break;
      let depth = spec.d[0] + rnd() * (spec.d[1] - spec.d[0]);
      let placed = null;
      for (const dScale of [1, 0.7, 0.45]) {
        const d = depth * dScale;
        if (d < 7) break;
        const mx = ed.a[0] + dx * (s + w / 2) + nx * (d / 2), mz = ed.a[1] + dz * (s + w / 2) + nz * (d / 2);
        const o = { x: mx, z: mz, hx: w / 2 - 0.05, hz: d / 2, yaw };
        const cs = obbCorners(o);
        if (!cs.every(p => pointInConvex(p[0], p[1], poly))) continue;
        if (lots.some(l => obbOverlap(o, l, -0.05))) continue;
        placed = o; break;
      }
      if (placed) {
        let underDeck = false;
        for (const [p, q, r] of deckSegs) if (distToSeg(placed.x, placed.z, p, q) < r + Math.max(placed.hx, placed.hz)) { underDeck = true; break; }
        if (!underDeck) {
          placed.front = [-nx, -nz];
          placed.seed = rnd();
          placed.zone = b.zone;
          placed.corner = s < 1 || s + w > ed.len - 1;
          lots.push(placed);
        }
      }
      s += w;
    }
  }
  // big blocks downtown: a central tower lot if the middle is free
  if ((b.zone === 'downtown' || b.zone === 'downtown_soma') && b.area > 3000) {
    const o = { x: cx, z: cz, hx: 14, hz: 12, yaw: 0 };
    if (obbCorners(o).every(p => pointInConvex(p[0], p[1], poly)) && !lots.some(l => obbOverlap(o, l, 0.5))) { o.front = [0, -1]; o.seed = rnd(); o.zone = b.zone; o.central = true; lots.push(o); }
  }
}
