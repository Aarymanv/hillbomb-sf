// Geometry writers for the facade material.
// MeshBuf: growable typed arrays in the facade vertex layout (position, normal(i8), aUv(vec4), aC(u8x4), aK, aId, [aG]).
// Frame: a local facade frame (u along the wall = "right" seen from outside, v up, d outward) that emits quads, boxes,
// extrusions and polygons with automatic normals, planar texture UVs and facade coords for the grime pass.
import * as THREE from 'three';
import { TILE } from './layers.js';
import { M } from './material.js';

export class MeshBuf {
  constructor(glass = false, cap = 4096) {
    this.glass = glass; this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.nrm = new Int8Array(cap * 3);
    this.uv = new Float32Array(cap * 4); this.c = new Uint8Array(cap * 4);
    this.k = new Float32Array(cap); this.id = new Float32Array(cap);
    if (glass) this.g = new Float32Array(cap * 4);
    this.icap = cap * 2; this.idx = new Uint32Array(this.icap); this.ni = 0;
    // state
    this.sk = M.SURF; this.sid = -1; this.sc = [255, 255, 255, 255]; this.sz = 0; this.sw = 0; this.sg = [0, 0, 0, 0];
  }
  reset() { this.n = 0; this.ni = 0; }
  grow() {
    const cap = this.cap * 2;
    const g = (a, s, T) => { const b = new T(cap * s); b.set(a); return b; };
    this.pos = g(this.pos, 3, Float32Array); this.nrm = g(this.nrm, 3, Int8Array); this.uv = g(this.uv, 4, Float32Array);
    this.c = g(this.c, 4, Uint8Array); this.k = g(this.k, 1, Float32Array); this.id = g(this.id, 1, Float32Array);
    if (this.glass) this.g = g(this.g, 4, Float32Array);
    this.cap = cap;
  }
  v(x, y, z, nx, ny, nz, u, w) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++, i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.nrm[i3] = nx * 127; this.nrm[i3 + 1] = ny * 127; this.nrm[i3 + 2] = nz * 127;
    this.uv[i4] = u; this.uv[i4 + 1] = w; this.uv[i4 + 2] = this.sz; this.uv[i4 + 3] = this.sw;
    const c = this.sc; this.c[i4] = c[0]; this.c[i4 + 1] = c[1]; this.c[i4 + 2] = c[2]; this.c[i4 + 3] = c[3];
    this.k[i] = this.sk; this.id[i] = this.sid;
    if (this.glass) { const g = this.sg; this.g[i4] = g[0]; this.g[i4 + 1] = g[1]; this.g[i4 + 2] = g[2]; this.g[i4 + 3] = g[3]; }
    return i;
  }
  ensureIdx(n) { if (this.ni + n > this.icap) { let c = this.icap * 2; while (c < this.ni + n) c *= 2; const b = new Uint32Array(c); b.set(this.idx); this.idx = b; this.icap = c; } }
  tri(a, b, c) { this.ensureIdx(3); const x = this.idx; x[this.ni++] = a; x[this.ni++] = b; x[this.ni++] = c; }
  quad(a, b, c, d) { this.ensureIdx(6); const x = this.idx; x[this.ni++] = a; x[this.ni++] = b; x[this.ni++] = c; x[this.ni++] = a; x[this.ni++] = c; x[this.ni++] = d; }
  get empty() { return this.ni === 0; }
  toGeometry() {
    const n = this.n, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, n * 3), 3, true));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv.slice(0, n * 4), 4));
    g.setAttribute('aC', new THREE.BufferAttribute(this.c.slice(0, n * 4), 4, true));
    g.setAttribute('aK', new THREE.BufferAttribute(this.k.slice(0, n), 1));
    g.setAttribute('aId', new THREE.BufferAttribute(this.id.slice(0, n), 1));
    if (this.glass) g.setAttribute('aG', new THREE.BufferAttribute(this.g.slice(0, n * 4), 4));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  // world-space helpers --------------------------------------------------------------------------------------------
  // flat quad from 4 world points (CCW seen from the front); uv by planar projection (scale = 1/tile)
  quadW(p0, p1, p2, p3, uvs) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz, uvs[0], uvs[1]);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz, uvs[2], uvs[3]);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz, uvs[4], uvs[5]);
    const d = this.v(p3[0], p3[1], p3[2], nx, ny, nz, uvs[6], uvs[7]);
    this.quad(a, b, c, d);
  }
}

const _uv8 = new Float64Array(8);

// Local facade frame. P(u, v, d) = O + t*u + up*v + n*d, n = (-tz, tx) so that (t, up, n) is right-handed.
export class Frame {
  constructor(buf) { this.b = buf; this.inv = 1; this.front = false; this.fu0 = 0; this.fv0 = 0; this.fsu = 1; }
  set(ox, oy, oz, tx, tz) {
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    this.ox = ox; this.oy = oy; this.oz = oz; this.tx = tx; this.tz = tz; this.nx = -tz; this.nz = tx;
    return this;
  }
  // choose material: layer (texture), linear colour, extra aK flags. front=true writes facade coords for grime.
  mat(layer, r, g, b, flags = 0, ao = 1) {
    const B = this.b;
    B.sk = M.SURF + 32 * layer + flags; this.inv = 1 / TILE[layer];
    B.sc[0] = Math.min(255, r * 255); B.sc[1] = Math.min(255, g * 255); B.sc[2] = Math.min(255, b * 255); B.sc[3] = ao * 255;
    this.front = (flags & 2048) !== 0;
    return this;
  }
  col(c, flags = 0, layer = null) { return this.mat(layer ?? c.layer ?? 9, c[0], c[1], c[2], flags); }
  ao(a) { this.b.sc[3] = a * 255; return this; }
  wx(u, d) { return this.ox + this.tx * u + this.nx * d; }
  wz(u, d) { return this.oz + this.tz * u + this.nz * d; }
  // emit a vertex from local coords with local normal (nu, nv, nd) and texture uv
  vl(u, v, d, nu, nv, nd, tu, tv) {
    const B = this.b;
    if (this.front) { B.sz = u * this.fsu + this.fu0; B.sw = v + this.fv0; } else { B.sz = -1e5; B.sw = 0; }
    return B.v(this.ox + this.tx * u + this.nx * d, this.oy + v, this.oz + this.tz * u + this.nz * d,
      this.tx * nu + this.nx * nd, nv, this.tz * nu + this.nz * nd, tu, tv);
  }
  // quad from 4 local points [u,v,d] (CCW seen from outside the face); normal from cross product; planar UVs
  q(a, b, c, d, aos = null) {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const bx = d[0] - a[0], by = d[1] - a[1], bz = d[2] - a[2];
    let nu = ay * bz - az * by, nv = az * bx - ax * bz, nd = ax * by - ay * bx;
    const l = Math.hypot(nu, nv, nd) || 1; nu /= l; nv /= l; nd /= l;
    const s = this.inv, anu = Math.abs(nu), anv = Math.abs(nv), and = Math.abs(nd);
    const P = [a, b, c, d];
    const B = this.b, base = B.sc[3];
    const ids = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const p = P[k];
      let tu, tv;
      if (and >= anu && and >= anv) { tu = p[0] * (nd >= 0 ? 1 : -1); tv = p[1]; }
      else if (anu >= anv) { tu = -p[2] * (nu >= 0 ? 1 : -1); tv = p[1]; }
      else { tu = p[0]; tv = p[2] * (nv >= 0 ? -1 : 1); }
      if (aos) B.sc[3] = base * aos[k];
      ids[k] = this.vl(p[0], p[1], p[2], nu, nv, nd, tu * s, tv * s);
    }
    B.sc[3] = base;
    B.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  tri(a, b, c) {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2];
    let nu = ay * bz - az * by, nv = az * bx - ax * bz, nd = ax * by - ay * bx;
    const l = Math.hypot(nu, nv, nd) || 1; nu /= l; nv /= l; nd /= l;
    const s = this.inv, and = Math.abs(nd), anu = Math.abs(nu), anv = Math.abs(nv);
    const ids = [a, b, c].map(p => {
      let tu, tv;
      if (and >= anu && and >= anv) { tu = p[0] * (nd >= 0 ? 1 : -1); tv = p[1]; }
      else if (anu >= anv) { tu = -p[2] * (nu >= 0 ? 1 : -1); tv = p[1]; }
      else { tu = p[0]; tv = p[2] * (nv >= 0 ? -1 : 1); }
      return this.vl(p[0], p[1], p[2], nu, nv, nd, tu * s, tv * s);
    });
    this.b.tri(ids[0], ids[1], ids[2]);
  }
  // front-facing rectangle in the plane d
  rect(u0, u1, v0, v1, d, aos = null) { this.q([u0, v0, d], [u1, v0, d], [u1, v1, d], [u0, v1, d], aos); }
  // box: faces bitmask 1 front(+d) 2 back(-d) 4 right(+u) 8 left(-u) 16 top 32 bottom
  box(u0, u1, v0, v1, d0, d1, faces = 63) {
    if (faces & 1) this.q([u0, v0, d1], [u1, v0, d1], [u1, v1, d1], [u0, v1, d1]);
    if (faces & 2) this.q([u1, v0, d0], [u0, v0, d0], [u0, v1, d0], [u1, v1, d0]);
    if (faces & 4) this.q([u1, v0, d1], [u1, v0, d0], [u1, v1, d0], [u1, v1, d1]);
    if (faces & 8) this.q([u0, v0, d0], [u0, v0, d1], [u0, v1, d1], [u0, v1, d0]);
    if (faces & 16) this.q([u0, v1, d0], [u0, v1, d1], [u1, v1, d1], [u1, v1, d0]);
    if (faces & 32) this.q([u0, v0, d0], [u1, v0, d0], [u1, v0, d1], [u0, v0, d1]);
  }
  // horizontal moulding: profile = [[d, v], ...] from the wall (d=0) outward/upward; extruded along u in [u0, u1].
  // caps: 1 = left end, 2 = right end. Profile points are listed bottom -> top.
  extrude(profile, u0, u1, v0, caps = 3, aos = null) {
    for (let i = 0; i < profile.length - 1; i++) {
      const [da, va] = profile[i], [db, vb] = profile[i + 1];
      if (Math.abs(da - db) < 1e-6 && Math.abs(va - vb) < 1e-6) continue;
      const ao0 = aos ? aos[i] : 1, ao1 = aos ? aos[i + 1] : 1;
      this.q([u0, v0 + va, da], [u1, v0 + va, da], [u1, v0 + vb, db], [u0, v0 + vb, db], [ao0, ao0, ao1, ao1]);
    }
    if (caps) {
      // fan caps from the wall-side anchor
      const n = profile.length;
      for (let i = 0; i < n - 1; i++) {
        const [da, va] = profile[i], [db, vb] = profile[i + 1];
        const [d0, v0p] = profile[0], [dn, vn] = profile[n - 1];
        const anchor = [0, v0 + (v0p + vn) * 0.5];
        if (caps & 2) this.tri([u1, anchor[1], 0], [u1, v0 + vb, db], [u1, v0 + va, da]);
        if (caps & 1) this.tri([u0, anchor[1], 0], [u0, v0 + va, da], [u0, v0 + vb, db]);
      }
    }
  }
  // vertical prism with a polygonal footprint in local (u, d): pts CLOCKWISE in the (u = x, d = y) plane; walls + top/bottom
  prism(pts, v0, v1, top = true, bottom = true) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [ua, da] = pts[i], [ub, db] = pts[(i + 1) % n];
      this.q([ua, v0, da], [ub, v0, db], [ub, v1, db], [ua, v1, da]);
    }
    if (top) for (let i = 1; i < n - 1; i++) this.tri([pts[0][0], v1, pts[0][1]], [pts[i][0], v1, pts[i][1]], [pts[i + 1][0], v1, pts[i + 1][1]]);
    if (bottom) for (let i = 1; i < n - 1; i++) this.tri([pts[0][0], v0, pts[0][1]], [pts[i + 1][0], v0, pts[i + 1][1]], [pts[i][0], v0, pts[i][1]]);
  }
}

// convert 0xRRGGBB (sRGB) to linear [r,g,b]
export function lin(hex) {
  const c = new THREE.Color(hex); c.convertSRGBToLinear();
  return [c.r, c.g, c.b];
}
