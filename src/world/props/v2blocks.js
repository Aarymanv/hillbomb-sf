// City blocks for the 1:1 map, in the v1 block shape the pedestrian nav understands ({ id, poly (convex curb polygon),
// inner (lot line), cx, cz, zone, park }). Faces of the planar street graph (decks, highways, alleys and dead ends left
// out); each face is clipped inward by every bounding street's half width (curb) and again by its sidewalk (lot line).
// Faces that are far from convex (winding hill streets) are skipped. Cached on the graph (~100-200 ms, once).
import { zoneAtV2 } from './v2zones.js';

const STREETISH = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'road', 'primary_link', 'secondary_link', 'tertiary_link', 'pedestrian', 'busway', 'trunk']);

function area(P) { let a = 0; for (let i = 0, n = P.length; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function hull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
// keep the part of convex polygon P where (p - a) . n >= d
function clip(P, ax, az, nx, nz, d) {
  const out = [], n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n];
    const fp = (p[0] - ax) * nx + (p[1] - az) * nz - d, fq = (q[0] - ax) * nx + (q[1] - az) * nz - d;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

export function buildBlocksV2(graph, terrain) {
  if (graph._blocksV2) return graph._blocksV2;
  const t0 = performance.now();
  const use = e => !e.deck && e.kind !== 'highway' && e.kind !== 'crooked' && STREETISH.has(e.cls) && e.len > 1;
  // half-edges per node, sorted by angle
  const out = new Map();     // node -> [{e, fwd, ang, to}]
  const deg = new Map();
  const alive = new Set();
  for (const e of graph.edges) if (use(e) && e.a !== e.b) alive.add(e);
  const degOf = n => { let d = 0; for (const e of n.edges) if (alive.has(e)) d++; return d; };
  // prune dangling chains
  const stack = [];
  for (const e of alive) for (const n of [e.a, e.b]) if (degOf(n) <= 1) stack.push(n);
  while (stack.length) {
    const n = stack.pop();
    if (degOf(n) !== 1) continue;
    const e = n.edges.find(q => alive.has(q)); alive.delete(e);
    const o = e.a === n ? e.b : e.a; if (degOf(o) === 1) stack.push(o);
  }
  void deg;
  const H = [];
  for (const e of alive) {
    for (const fwd of [true, false]) {
      const P = e.pts, m = P.length, from = fwd ? e.a : e.b, to = fwd ? e.b : e.a;
      const p0 = fwd ? P[0] : P[m - 1], p1 = fwd ? P[1] : P[m - 2];
      const h = { e, fwd, from, to, ang: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), used: false, twin: null, idx: 0 };
      H.push(h);
      let a = out.get(from); if (!a) out.set(from, a = []); a.push(h);
    }
  }
  for (let i = 0; i < H.length; i += 2) { H[i].twin = H[i + 1]; H[i + 1].twin = H[i]; }
  for (const a of out.values()) { a.sort((p, q) => p.ang - q.ang); a.forEach((h, i) => { h.idx = i; }); }
  const blocks = [];
  const faces = [];
  for (const h0 of H) {
    if (h0.used) continue;
    const cyc = []; let h = h0, guard = 0;
    while (!h.used && guard++ < 400) {
      h.used = true; cyc.push(h);
      const a = out.get(h.to), tw = h.twin;
      h = a[(tw.idx - 1 + a.length) % a.length];
    }
    if (h !== h0 || cyc.length < 2) continue;
    // polygon + the edge each segment belongs to
    const P = [], segE = [];
    for (const c of cyc) {
      const pts = c.e.pts, m = pts.length;
      for (let k = 0; k < m - 1; k++) { P.push(c.fwd ? pts[k] : pts[m - 1 - k]); segE.push(c.e); }
    }
    faces.push({ P, segE, A: area(P) });
  }
  // interior orientation = the sign of the majority of small faces
  let pos = 0, neg = 0; for (const f of faces) if (Math.abs(f.A) < 2e5) { if (f.A > 0) pos++; else neg++; }
  const sgn = pos >= neg ? 1 : -1;
  for (const f of faces) {
    const A = f.A * sgn;
    if (A < 250 || A > 4e5) continue;
    const Hl = hull(f.P);
    if (Hl.length < 3 || A / Math.abs(area(Hl)) < 0.88) continue;
    // clip the hull by every street's curb line (and later the lot line): left/right normal toward the interior
    let poly = Hl.map(p => [p[0], p[1]]), inner = null;
    const n = f.P.length;
    const lines = [];
    for (let i = 0; i < n; i++) {
      const p = f.P[i], q = f.P[(i + 1) % n], e = f.segE[i];
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); if (l < 0.3) continue;
      // interior on the left for sgn>0 in (x, z) with area = sum(x_i z_{i+1} - x_{i+1} z_i)
      const nx = -dz / l * sgn, nz = dx / l * sgn;
      lines.push([p[0], p[1], nx, nz, e.width / 2, e.width / 2 + (e.sidewalk > 0 ? e.sidewalk : 2.5)]);
    }
    for (const L of lines) { poly = clip(poly, L[0], L[1], L[2], L[3], L[4]); if (poly.length < 3) break; }
    if (poly.length < 3 || Math.abs(area(poly)) < 120) continue;
    inner = poly;
    for (const L of lines) { inner = clip(inner, L[0], L[1], L[2], L[3], L[5]); if (inner.length < 3) break; }
    if (inner.length < 3 || Math.abs(area(inner)) < 20) inner = null;
    // counter-clockwise like v1 blocks isn't required (nav orients normals by the centroid)
    let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
    let parkN = 0;
    for (const [u, v] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const q = poly[0], x = cx + (q[0] - cx) * u, z = cz + (q[1] - cz) * v;
      const s = terrain.surfaceRaw(x, z); if (s === 3 || s === 7 || s === 8) parkN++;
    }
    blocks.push({ id: blocks.length, poly, inner, cx, cz, zone: zoneAtV2(cx, cz), park: parkN >= 3, area: Math.abs(area(poly)) });
  }
  graph._blocksV2 = blocks;
  console.log(`[props2] ${blocks.length} blocks from ${faces.length} faces in ${(performance.now() - t0).toFixed(0)} ms`);
  return blocks;
}
