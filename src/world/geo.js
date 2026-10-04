// Small geometry accumulator + 2D polygon helpers shared by the world builders.
import * as THREE from 'three';

export class GeoBuilder {
  constructor({ uv = true, color = true, extra = null } = {}) {
    this.hasUv = uv; this.hasColor = color; this.extra = extra; // extra: {name: itemSize}
    this.cap = 4096;
    this.n = 0;
    this.pos = new Float32Array(this.cap * 3);
    this.nor = new Float32Array(this.cap * 3);
    if (uv) this.uv = new Float32Array(this.cap * 2);
    if (color) this.col = new Float32Array(this.cap * 3);
    this.ex = {};
    if (extra) for (const k in extra) this.ex[k] = new Float32Array(this.cap * extra[k]);
    this.idx = [];
    // current vertex state
    this.c = [1, 1, 1];
    this.e = {};
  }
  grow() {
    const cap = this.cap * 2;
    const g = (a, s) => { const b = new Float32Array(cap * s); b.set(a); return b; };
    this.pos = g(this.pos, 3); this.nor = g(this.nor, 3);
    if (this.hasUv) this.uv = g(this.uv, 2);
    if (this.hasColor) this.col = g(this.col, 3);
    if (this.extra) for (const k in this.extra) this.ex[k] = g(this.ex[k], this.extra[k]);
    this.cap = cap;
  }
  v(x, y, z, nx, ny, nz, u = 0, w = 0) {
    if (this.n >= this.cap) this.grow();
    const i = this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nor[i * 3] = nx; this.nor[i * 3 + 1] = ny; this.nor[i * 3 + 2] = nz;
    if (this.hasUv) { this.uv[i * 2] = u; this.uv[i * 2 + 1] = w; }
    if (this.hasColor) { this.col[i * 3] = this.c[0]; this.col[i * 3 + 1] = this.c[1]; this.col[i * 3 + 2] = this.c[2]; }
    if (this.extra) for (const k in this.extra) { const s = this.extra[k], a = this.ex[k], ev = this.e[k] || [0, 0, 0, 0]; for (let q = 0; q < s; q++) a[i * s + q] = ev[q]; }
    this.n++;
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  setColor(r, g, b) { this.c[0] = r; this.c[1] = g; this.c[2] = b; }
  setColorHex(h) { const c = new THREE.Color(h); this.c[0] = c.r; this.c[1] = c.g; this.c[2] = c.b; }
  // flat quad from 4 points (counter-clockwise when viewed from the front), normal computed
  quadP(p0, p1, p2, p3, uvs = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz, u[0][0], u[0][1]);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz, u[1][0], u[1][1]);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz, u[2][0], u[2][1]);
    const d = this.v(p3[0], p3[1], p3[2], nx, ny, nz, u[3][0], u[3][1]);
    this.quad(a, b, c, d);
  }
  // axis box (world aligned) with optional yaw about (cx, cz)
  box(cx, cy, cz, hx, hy, hz, yaw = 0, faces = 0b111111) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [cx + c * lx + s * lz, cy + ly, cz - s * lx + c * lz];
    const q = (a, b, cc, d) => this.quadP(P(...a), P(...b), P(...cc), P(...d));
    if (faces & 1) q([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]);      // +z (back)
    if (faces & 2) q([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]);  // -z (front)
    if (faces & 4) q([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]);      // +x
    if (faces & 8) q([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]);  // -x
    if (faces & 16) q([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]);     // top
    if (faces & 32) q([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]); // bottom
  }
  get empty() { return this.n === 0; }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    if (this.hasUv) g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    if (this.hasColor) g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    if (this.extra) for (const k in this.extra) g.setAttribute(k, new THREE.BufferAttribute(this.ex[k].slice(0, n * this.extra[k]), this.extra[k]));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------ 2D polygon helpers ([x, z] arrays)
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
export function polyCentroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
// keep the side where n.(p) >= c
export function clipHalfPlane(poly, nx, nz, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// inset a convex polygon by d (toward its centroid); returns null if degenerate
export function insetConvex(poly, d) {
  const n = poly.length, [cx, cz] = polyCentroid(poly);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    let ex = b[0] - a[0], ez = b[1] - a[1]; const l = Math.hypot(ex, ez); if (l < 1e-6) continue; ex /= l; ez /= l;
    let nx = -ez, nz = ex;
    if ((cx - a[0]) * nx + (cz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push({ px: a[0] + nx * d, pz: a[1] + nz * d, ex, ez });
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const L1 = lines[(i + lines.length - 1) % lines.length], L2 = lines[i];
    const den = L1.ex * L2.ez - L1.ez * L2.ex;
    if (Math.abs(den) < 1e-6) { out.push([L2.px, L2.pz]); continue; }
    const t = ((L2.px - L1.px) * L2.ez - (L2.pz - L1.pz) * L2.ex) / den;
    out.push([L1.px + L1.ex * t, L1.pz + L1.ez * t]);
  }
  // validity: all inset points must be inside the original and area positive in the same sense
  if (out.length < 3 || Math.sign(polyArea(out)) !== Math.sign(polyArea(poly)) || Math.abs(polyArea(out)) < 20) return null;
  for (const p of out) if (!pointInConvex(p[0], p[1], poly)) return null;
  return out;
}
export function pointInConvex(x, z, poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cr = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}
// oriented rectangle corners {x,z,hx,hz,yaw}
export function obbCorners(o) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.x + c * a * o.hx + s * b * o.hz, o.z - s * a * o.hx + c * b * o.hz]);
}
export function obbOverlap(A, B, margin = 0) {
  const ca = obbCorners(A), cb = obbCorners(B);
  const axes = [];
  for (const o of [A, B]) { const c = Math.cos(o.yaw), s = Math.sin(o.yaw); axes.push([c, -s], [s, c]); }
  for (const [ax, az] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of ca) { const d = p[0] * ax + p[1] * az; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const p of cb) { const d = p[0] * ax + p[1] * az; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 + margin < b0 || b1 + margin < a0) return false;
  }
  return true;
}
// Douglas-Peucker
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * ez - (pts[i][1] - az) * ex) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash01(x, z, s = 0) { let h = Math.imul((x * 73856093) ^ (z * 19349663) ^ (s * 83492791), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
