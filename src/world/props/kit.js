// Tiny procedural mesh kit for street props and trees: primitives emitted through a transform stack into one
// buffer set (position, normal, color, uv, aSurf = [nightGlow, roughness, metalness, dayGlow], optional aSway).
// Object local frame: +X right, +Y up, -Z forward (see CONVENTIONS.md).
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _col = new THREE.Color();

export const WHITE_UV = [0.9995, 0.0005]; // a white texel in every prop atlas (bottom-right corner)

export class Kit {
  constructor({ sway = false, bark = false } = {}) {
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.surf = []; this.idx = []; this.pb = [];
    this.bark = bark ? [] : null; this.b = [-1, -1]; this.p = [0, 0];
    this.sway = sway ? [] : null;
    this.c = [1, 1, 1];
    this.s = [0, 0.7, 0, 0];     // glowNight, roughness, metalness, glowDay
    this.w = [0, 0];             // sway: bend weight, flutter weight
    this.uvOverride = null;      // [u, v] forces a constant uv (untextured parts)
    this.M = new THREE.Matrix4();
    this.stack = [];
  }
  // ---------------------------------------------------------------- state
  color(hex, mul = 1) { _col.set(hex); this.c = [_col.r * mul, _col.g * mul, _col.b * mul]; return this; }
  rgb(r, g, b) { this.c = [r, g, b]; return this; }
  mat(rough = 0.7, metal = 0, glowNight = 0, glowDay = 0) { this.s = [glowNight, rough, metal, glowDay]; this.p = [0, 0]; return this; }
  // photo-scanned detail: id 1 = metal, 2 = concrete (see props.js), strength 0..1
  pbr(id = 0, strength = 1) { this.p = [id, strength]; return this; }
  flat() { this.uvOverride = WHITE_UV; return this; }
  textured() { this.uvOverride = null; return this; }
  push() { this.stack.push(this.M.clone()); return this; }
  pop() { this.M.copy(this.stack.pop()); return this; }
  translate(x, y, z) { this.M.multiply(_m.makeTranslation(x, y, z)); return this; }
  rotY(a) { this.M.multiply(_m.makeRotationY(a)); return this; }
  rotX(a) { this.M.multiply(_m.makeRotationX(a)); return this; }
  rotZ(a) { this.M.multiply(_m.makeRotationZ(a)); return this; }
  scale(x, y = x, z = x) { this.M.multiply(_m.makeScale(x, y, z)); return this; }
  get count() { return this.pos.length / 3; }

  // ---------------------------------------------------------------- raw emit
  v(x, y, z, nx, ny, nz, u = 0, w = 0) {
    _v.set(x, y, z).applyMatrix4(this.M);
    _n.getNormalMatrix(this.M);
    _w.set(nx, ny, nz).applyMatrix3(_n).normalize();
    this.pos.push(_v.x, _v.y, _v.z);
    this.nor.push(_w.x, _w.y, _w.z);
    this.col.push(this.c[0], this.c[1], this.c[2]);
    if (this.uvOverride) this.uv.push(this.uvOverride[0], this.uvOverride[1]); else this.uv.push(u, w);
    this.surf.push(this.s[0], this.s[1], this.s[2], this.s[3]);
    this.pb.push(this.p[0], this.p[1]);
    if (this.sway) this.sway.push(this.w[0], this.w[1]);
    if (this.bark) this.bark.push(this.b[0], this.b[1]);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quadI(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  // quad from 4 local points (CCW seen from the front), flat normal, optional uvs
  quad(p0, p1, p2, p3, uvs = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz, u[0][0], u[0][1]);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz, u[1][0], u[1][1]);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz, u[2][0], u[2][1]);
    const d = this.v(p3[0], p3[1], p3[2], nx, ny, nz, u[3][0], u[3][1]);
    this.quadI(a, b, c, d);
  }

  // ---------------------------------------------------------------- primitives (local frame of the current matrix)
  // box centred at (cx, cy, cz) with half extents; faces bitmask +Z,-Z,+X,-X,+Y,-Y
  box(cx, cy, cz, hx, hy, hz, faces = 0b111111, uvFront = null) {
    const P = (x, y, z) => [cx + x * hx, cy + y * hy, cz + z * hz];
    if (faces & 1) this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1));
    if (faces & 2) this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), uvFront);
    if (faces & 4) this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1));
    if (faces & 8) this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1));
    if (faces & 16) this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1));
    if (faces & 32) this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1));
    return this;
  }
  // box between two y levels (convenience)
  boxY(cx, y0, y1, cz, hx, hz, faces = 0b111111) { return this.box(cx, (y0 + y1) / 2, cz, hx, (y1 - y0) / 2, hz, faces); }

  // vertical (tapered) cylinder from y0 to y1, smooth sides, optional caps. uv: u around, v = y * vScale
  cyl(x, y0, y1, z, r0, r1, seg = 8, caps = 0b10, vScale = 0.5, uv0 = [0, 0], uvW = 1) {
    const base = this.count;
    const dr = (r0 - r1) / Math.max(1e-6, y1 - y0);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nl = Math.hypot(1, dr);
      this.v(x + c * r0, y0, z + s * r0, c / nl, dr / nl, s / nl, uv0[0] + (i / seg) * uvW, uv0[1] + y0 * vScale);
      this.v(x + c * r1, y1, z + s * r1, c / nl, dr / nl, s / nl, uv0[0] + (i / seg) * uvW, uv0[1] + y1 * vScale);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.quadI(a, a + 1, a + 3, a + 2); }
    if (caps & 2 && r1 > 0.001) this.disc(x, y1, z, r1, seg, 1);
    if (caps & 1 && r0 > 0.001) this.disc(x, y0, z, r0, seg, -1);
    return this;
  }
  disc(x, y, z, r, seg = 8, dir = 1) {
    const c0 = this.v(x, y, z, 0, dir, 0, 0.5, 0.5);
    const first = this.count;
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; this.v(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, dir, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); }
    for (let i = 0; i < seg; i++) { if (dir > 0) this.tri(c0, first + i + 1, first + i); else this.tri(c0, first + i, first + i + 1); }
    return this;
  }
  // flat disc facing +Z (local) at z, e.g. lenses; uv mapped to [u0,v0]-[u1,v1]
  discZ(x, y, z, r, seg = 10, dir = -1, uvr = null) {
    const c0 = this.v(x, y, z, 0, 0, dir, uvr ? (uvr[0] + uvr[2]) / 2 : 0.5, uvr ? (uvr[1] + uvr[3]) / 2 : 0.5);
    const first = this.count;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      const u = uvr ? uvr[0] + (uvr[2] - uvr[0]) * (0.5 + cx * 0.5 * dir) : 0.5, w = uvr ? uvr[1] + (uvr[3] - uvr[1]) * (0.5 + sy * 0.5) : 0.5;
      this.v(x + cx * r, y + sy * r, z, 0, 0, dir, u, w);
    }
    for (let i = 0; i < seg; i++) { if (dir < 0) this.tri(c0, first + i + 1, first + i); else this.tri(c0, first + i, first + i + 1); }
    return this;
  }
  // lathe around local Y: profile [[r, y], ...] bottom -> top, smooth normals
  lathe(x, z, profile, seg = 10, uv0 = [0, 0], vScale = 0.5) {
    const base = this.count, n = profile.length;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (let k = 0; k < n; k++) {
        const [r, y] = profile[k];
        const p = profile[Math.max(0, k - 1)], q = profile[Math.min(n - 1, k + 1)];
        let dy = q[1] - p[1], dr = q[0] - p[0]; const l = Math.hypot(dy, dr) || 1; dy /= l; dr /= l;
        // outward normal of the profile curve (r, y): (dy, -dr)
        this.v(x + c * r, y, z + s * r, c * dy, -dr, s * dy, uv0[0] + i / seg, uv0[1] + y * vScale);
      }
    }
    for (let i = 0; i < seg; i++) for (let k = 0; k < n - 1; k++) {
      const a = base + i * n + k, b = base + (i + 1) * n + k;
      this.quadI(a, b, b + 1, a + 1);
    }
    return this;
  }
  // ellipsoid
  sphere(cx, cy, cz, rx, ry = rx, rz = rx, wSeg = 8, hSeg = 6, uvr = null) {
    const base = this.count;
    for (let j = 0; j <= hSeg; j++) {
      const th = (j / hSeg) * Math.PI, sy = Math.cos(th), sr = Math.sin(th);
      for (let i = 0; i <= wSeg; i++) {
        const ph = (i / wSeg) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph);
        const nx = c * sr / rx, ny = sy / ry, nz = s * sr / rz, nl = Math.hypot(nx, ny, nz) || 1;
        this.v(cx + c * sr * rx, cy + sy * ry, cz + s * sr * rz, nx / nl, ny / nl, nz / nl, uvr ? uvr[0] + (uvr[2] - uvr[0]) * i / wSeg : 0, uvr ? uvr[1] + (uvr[3] - uvr[1]) * (1 - j / hSeg) : 0);
      }
    }
    for (let j = 0; j < hSeg; j++) for (let i = 0; i < wSeg; i++) {
      const a = base + j * (wSeg + 1) + i, b = a + wSeg + 1;
      this.quadI(a, b, b + 1, a + 1);
    }
    return this;
  }
  // tube along a 3D path (local), radii per point; uv: u around, v = arc length * vScale
  tube(path, radii, seg = 6, uv0 = [0, 0], vScale = 0.5, uvW = 1, capEnd = false) {
    const base = this.count, n = path.length;
    let prevN = null, s = 0;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const p = path[k], a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
      T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (k > 0) s += Math.hypot(p[0] - path[k - 1][0], p[1] - path[k - 1][1], p[2] - path[k - 1][2]);
      if (!prevN) { up.set(0, 1, 0); if (Math.abs(T.y) > 0.9) up.set(1, 0, 0); N.crossVectors(T, up).normalize(); }
      else { N.copy(prevN).sub(T.clone().multiplyScalar(prevN.dot(T))).normalize(); }
      prevN = N.clone();
      B.crossVectors(T, N).normalize();
      const r = radii[Math.min(k, radii.length - 1)];
      for (let i = 0; i <= seg; i++) {
        const ang = (i / seg) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
        const nx = N.x * c + B.x * sn, ny = N.y * c + B.y * sn, nz = N.z * c + B.z * sn;
        this.v(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r, nx, ny, nz, uv0[0] + (i / seg) * uvW, uv0[1] + s * vScale);
      }
    }
    for (let k = 0; k < n - 1; k++) for (let i = 0; i < seg; i++) {
      const a = base + k * (seg + 1) + i, b = a + seg + 1;
      this.quadI(a, a + 1, b + 1, b);
    }
    if (capEnd) {
      const p = path[n - 1], r = radii[Math.min(n - 1, radii.length - 1)], c0 = this.v(p[0], p[1], p[2], T.x, T.y, T.z, 0.5, 0.5);
      const ring = base + (n - 1) * (seg + 1);
      for (let i = 0; i < seg; i++) this.tri(c0, ring + i, ring + i + 1);
      void r;
    }
    return this;
  }
  // append another kit (already in its own local frame) through the current matrix
  append(k) {
    const off = this.count;
    for (let i = 0; i < k.pos.length / 3; i++) {
      this.c = [k.col[i * 3], k.col[i * 3 + 1], k.col[i * 3 + 2]];
      this.s = [k.surf[i * 4], k.surf[i * 4 + 1], k.surf[i * 4 + 2], k.surf[i * 4 + 3]]; this.p = [k.pb[i * 2], k.pb[i * 2 + 1]];
      if (this.sway && k.sway) this.w = [k.sway[i * 2], k.sway[i * 2 + 1]];
      const save = this.uvOverride; this.uvOverride = null;
      this.v(k.pos[i * 3], k.pos[i * 3 + 1], k.pos[i * 3 + 2], k.nor[i * 3], k.nor[i * 3 + 1], k.nor[i * 3 + 2], k.uv[i * 2], k.uv[i * 2 + 1]);
      this.uvOverride = save;
    }
    for (const i of k.idx) this.idx.push(i + off);
    return this;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surf, 4));
    g.setAttribute('aPbr', new THREE.Float32BufferAttribute(this.pb, 2));
    if (this.bark) g.setAttribute('aBark', new THREE.Float32BufferAttribute(this.bark, 2));
    if (this.sway) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ small helpers
export function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hash2(x, z, s = 0) { let h = Math.imul((Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663) ^ (s * 83492791), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
