// Interior geometry kit: a transform-aware mesh accumulator with per-vertex albedo, roughness/metalness, procedural
// surface pattern ids and a CPU light bake (room AO + furniture contact AO + point / spot / window lights).
// Everything a site builds lands in a handful of buckets (one draw call each):
//   main  - the uber material (baked interiors + lit exteriors)      glass - transparent glazing
//   glow  - unlit HDR vertex colours (lamps, neon, screens)            sign  - atlas-textured glow   paint - atlas-textured lit
// Groups ('door1', ...) split buckets into separate meshes so a site can animate them.
import * as THREE from 'three';
import { TILE as PBR_TILE } from '../assets.js';

export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// procedural surface patterns (evaluated in the material shader, see materials.js)
export const PAT = { NONE: 0, WOOD: 1, CHECKER: 2, TILE: 3, CONCRETE: 4, CARPET: 5, BRICK: 6, SUBWAY: 7, TERRAZZO: 8, FLUTE: 9, CLAPBOARD: 10, FABRIC: 11, SHINGLE: 12, LINO: 13, STUCCO: 14, PANEL: 15, GRAIN: 16, PLASTER: 17 };

// average linear albedo of each library texture: tex(key, hex) divides by it so the tint lands on the requested colour
const PBR_AVG = { asphalt: [0.189, 0.189, 0.189], brick_red: [0.27, 0.23, 0.158], brick_tan: [0.36, 0.167, 0.104], carpet: [0.5, 0.435, 0.295], concrete: [0.482, 0.482, 0.482], concrete_rough: [0.612, 0.614, 0.486], corrugated: [0.224, 0.223, 0.222], fabric: [0.105, 0.104, 0.106], leather: [0.125, 0.04, 0.021], marble: [0.42, 0.421, 0.471], metal: [0.204, 0.248, 0.296], painted_plaster: [0.515, 0.516, 0.501], paving: [0.36, 0.335, 0.277], siding: [0.074, 0.049, 0.033], stucco: [0.681, 0.652, 0.631], tiles: [0.939, 0.939, 0.937], wood_floor: [0.329, 0.198, 0.112], gravel_roof: [0.702, 0.676, 0.621], roof_tiles: [0.031, 0.03, 0.036] };
const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _nv = new THREE.Vector3();

class Bucket {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.rm = []; this.puv = []; this.uv = []; this.room = []; this.self = []; this.idx = []; this.n = 0; }
}

export class Kit {
  constructor() {
    this.buckets = new Map();
    this.M = new THREE.Matrix4();
    this.N = new THREE.Matrix3();
    this.stack = [];
    this.st = { col: [0.8, 0.8, 0.8], rough: 0.8, metal: 0, pat: 0, patS: 1, room: -1, bucket: 'main', group: '', self: -1 };
    this.rooms = []; this.occ = []; this.lights = []; this.windows = [];
  }
  // ------------------------------------------------------------------ state
  set(o) { Object.assign(this.st, o); if (o.col && typeof o.col === 'number') this.st.col = lin(o.col); return this; }
  c(hex, rough, metal = 0, pat = 0, patS = 1) { this.st.col = typeof hex === 'number' ? lin(hex) : hex; if (rough !== undefined) this.st.rough = rough; this.st.metal = metal; this.st.pat = pat; this.st.patS = patS; if (this.st.bucket.startsWith('pbr:')) this.st.bucket = 'main'; return this; }
  // photo-scanned PBR surface (shared library): tint colour, roughness scale (0.8 = as scanned), metalness, uv scale multiplier
  tex(key, hex = null, rough = 0.8, metal = 0, scale = 1) { const a = PBR_AVG[key] || [0.5, 0.5, 0.5], c = hex == null ? null : (typeof hex === 'number' ? lin(hex) : hex); this.st.col = c ? [Math.min(8, c[0] / a[0]), Math.min(8, c[1] / a[1]), Math.min(8, c[2] / a[2])] : [1, 1, 1]; this.st.rough = rough; this.st.metal = metal; this.st.pat = 0; this.st.patS = scale / (PBR_TILE[key] || 2); this.st.bucket = 'pbr:' + key; return this; }
  bucket(b) { this.st.bucket = b; return this; }
  group(g) { this.st.group = g || ''; return this; }
  room(r) { this.st.room = r; return this; }
  save() { return { ...this.st }; }
  restore(s) { this.st = { ...s }; return this; }
  // transforms: push a translate/rotY/scale frame
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) {
    this.stack.push(this.M.clone());
    _m.compose(_v.set(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
    this.M.multiply(_m); this.N.getNormalMatrix(this.M);
    return this;
  }
  pushM(m) { this.stack.push(this.M.clone()); this.M.multiply(m); this.N.getNormalMatrix(this.M); return this; }
  pop() { this.M.copy(this.stack.pop()); this.N.getNormalMatrix(this.M); return this; }
  at(x, y, z, ry, fn, s = 1) { this.push(x, y, z, ry || 0, s); fn(this); this.pop(); return this; }

  B() {
    const g = this.st.group || (this.st.room < 0 ? 'x' : '');
    const key = (g ? g + '|' : '') + this.st.bucket;
    let b = this.buckets.get(key); if (!b) this.buckets.set(key, b = new Bucket()); return b;
  }
  // one vertex in the current frame (object-local position/normal -> site-local)
  v(b, x, y, z, nx, ny, nz, u = 0, w = 0) {
    const S = this.st;
    _v.set(x, y, z).applyMatrix4(this.M);
    _nv.set(nx, ny, nz).applyMatrix3(this.N).normalize();
    b.pos.push(_v.x, _v.y, _v.z); b.nor.push(_nv.x, _nv.y, _nv.z);
    b.col.push(S.col[0], S.col[1], S.col[2]);
    // pattern uv: dominant-axis planar projection in object space
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), k = S.patS;
    if (ay >= ax && ay >= az) b.puv.push(x * k, z * k); else if (ax >= az) b.puv.push(z * k, y * k); else b.puv.push(x * k, y * k);
    b.rm.push(S.rough, S.metal, S.pat);
    b.uv.push(u, w);
    b.room.push(S.room); b.self.push(S.self);
    return b.n++;
  }
  // ------------------------------------------------------------------ primitives
  // quad from 4 points (CCW seen from the front); sub = max cell size in m (0 = none)
  quad(p0, p1, p2, p3, sub = 0, uvs = null) {
    const b = this.B();
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const nu = sub > 0 ? Math.max(1, Math.ceil(Math.hypot(ax, ay, az) / sub)) : 1, nv = sub > 0 ? Math.max(1, Math.ceil(Math.hypot(bx, by, bz) / sub)) : 1;
    const U = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const base = b.n;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      // bilinear interpolation of the 4 corners
      const P = (k) => (p0[k] * (1 - s) + p1[k] * s) * (1 - t) + (p3[k] * (1 - s) + p2[k] * s) * t;
      const uu = (U[0][0] * (1 - s) + U[1][0] * s) * (1 - t) + (U[3][0] * (1 - s) + U[2][0] * s) * t;
      const vv = (U[0][1] * (1 - s) + U[1][1] * s) * (1 - t) + (U[3][1] * (1 - s) + U[2][1] * s) * t;
      this.v(b, P(0), P(1), P(2), nx, ny, nz, uu, vv);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, c = a + 1, d = a + nu + 1, e = d + 1;
      b.idx.push(a, c, e, a, e, d);
    }
    return this;
  }
  // axis-aligned box by min/max corners. faces: +x -x +y -y +z -z bits (1,2,4,8,16,32). inward = normals point in
  box(x0, y0, z0, x1, y1, z1, faces = 63, sub = 0, inward = false) {
    const Q = (a, b2, c, d) => (inward ? this.quad(d, c, b2, a, sub) : this.quad(a, b2, c, d, sub));
    if (faces & 1) Q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (faces & 2) Q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (faces & 4) Q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (faces & 8) Q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (faces & 16) Q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (faces & 32) Q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    return this;
  }
  // centred box
  boxc(cx, cy, cz, hx, hy, hz, faces = 63, sub = 0) { return this.box(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, faces, sub); }
  // box standing on y: footprint centred at (cx, cz)
  block(cx, cz, w, d, y0, y1, faces = 63 & ~8) { return this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, faces); }
  // horizontal rect (floor: up, ceiling: down)
  floor(x0, z0, x1, z1, y, sub = 0.5, down = false) {
    if (down) return this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], sub);
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], sub);
  }
  // vertical wall in a plane of constant z. normal toward +z if dir > 0. holes: [[x0,x1,y0,y1], ...]
  wallZ(z, x0, x1, y0, y1, dir, holes = [], sub = 0.6) {
    this._wall((u, v) => [u, v, z], x0, x1, y0, y1, holes, sub, dir < 0);
    return this;
  }
  // wall at constant x spanning z; normal toward +x if dir > 0. holes: [[z0,z1,y0,y1]]
  wallX(x, z0, z1, y0, y1, dir, holes = [], sub = 0.6) {
    this._wall((u, v) => [x, v, u], z0, z1, y0, y1, holes, sub, dir > 0);
    return this;
  }
  _wall(P, u0, u1, v0, v1, holes, sub, flip) {
    const us = [u0, u1], vs = [v0, v1];
    for (const h of holes) { us.push(Math.max(u0, Math.min(u1, h[0])), Math.max(u0, Math.min(u1, h[1]))); vs.push(Math.max(v0, Math.min(v1, h[2])), Math.max(v0, Math.min(v1, h[3]))); }
    const U = [...new Set(us)].sort((a, b) => a - b), V = [...new Set(vs)].sort((a, b) => a - b);
    for (let j = 0; j < V.length - 1; j++) for (let i = 0; i < U.length - 1; i++) {
      const a = U[i], b = U[i + 1], c = V[j], d = V[j + 1];
      if (b - a < 1e-4 || d - c < 1e-4) continue;
      const mu = (a + b) / 2, mv = (c + d) / 2;
      if (holes.some(h => mu > h[0] && mu < h[1] && mv > h[2] && mv < h[3])) continue;
      if (flip) this.quad(P(b, c), P(a, c), P(a, d), P(b, d), sub);
      else this.quad(P(a, c), P(b, c), P(b, d), P(a, d), sub);
    }
  }
  // append a three.js BufferGeometry (with optional extra matrix)
  geo(g, m = null) {
    if (m) this.pushM(m);
    const b = this.B();
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    const base = b.n;
    for (let i = 0; i < p.count; i++) this.v(b, p.getX(i), p.getY(i), p.getZ(i), nn.getX(i), nn.getY(i), nn.getZ(i), uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    if (g.index) for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) b.idx.push(base + i);
    if (m) this.pop();
    g.dispose();
    return this;
  }
  cyl(x, y0, z, rTop, rBot, h, seg = 16, open = false) { return this.geo(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z)); }
  // cylinder along an arbitrary axis from a to b
  tube(a, b, r, seg = 8) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    return this.geo(new THREE.CylinderGeometry(r, r, L, seg, 1, true), m);
  }
  sphere(x, y, z, r, ws = 12, hs = 8, sy = 1) { return this.geo(new THREE.SphereGeometry(r, ws, hs), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, sy, 1))); }
  ellipsoid(x, y, z, rx, ry, rz, ws = 14, hs = 8) { return this.geo(new THREE.SphereGeometry(1, ws, hs), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(rx, ry, rz))); }
  // lathe profile [[r, y], ...] around the y axis at (x, y, z)
  lathe(x, y, z, prof, seg = 16) { return this.geo(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg), new THREE.Matrix4().makeTranslation(x, y, z)); }
  torus(x, y, z, R, r, rs = 8, ts = 24, rx = Math.PI / 2) { return this.geo(new THREE.TorusGeometry(R, r, rs, ts), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1))); }
  // rounded box (cushions, mattresses): bevel radius r
  rbox(x0, y0, z0, x1, y1, z1, r = 0.05, seg = 2) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0; r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const g = roundedBox(w, h, d, r, seg);
    return this.geo(g, new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }
  // flat textured quad in the sign atlas (bucket 'sign' or 'paint'); region = {u0,v0,u1,v1}
  sign(p0, p1, p2, p3, region, bucket = 'sign') {
    const prev = this.st.bucket; this.st.bucket = bucket;
    this.quad(p0, p1, p2, p3, 0, [[region.u0, region.v0], [region.u1, region.v0], [region.u1, region.v1], [region.u0, region.v1]]);
    this.st.bucket = prev; return this;
  }
  // sign facing -z (toward the viewer standing at -z) centred at (x, y, z) with width w, height h
  signZ(x, y, z, w, h, region, bucket = 'sign', dir = -1) {
    if (dir < 0) return this.sign([x + w / 2, y - h / 2, z], [x - w / 2, y - h / 2, z], [x - w / 2, y + h / 2, z], [x + w / 2, y + h / 2, z], region, bucket);
    return this.sign([x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z], region, bucket);
  }
  // sign facing +x (dir 1) or -x (dir -1) at constant x
  signX(x, y, z, w, h, region, bucket = 'sign', dir = 1) {
    if (dir > 0) return this.sign([x, y - h / 2, z + w / 2], [x, y - h / 2, z - w / 2], [x, y + h / 2, z - w / 2], [x, y + h / 2, z + w / 2], region, bucket);
    return this.sign([x, y - h / 2, z - w / 2], [x, y - h / 2, z + w / 2], [x, y + h / 2, z + w / 2], [x, y + h / 2, z - w / 2], region, bucket);
  }

  // ------------------------------------------------------------------ bake inputs (site-local coordinates)
  // room: axis box + ambient; returns id
  addRoom(x0, y0, z0, x1, y1, z1, o = {}) {
    this.rooms.push({ b: [x0, y0, z0, x1, y1, z1], amb: o.amb || [0.18, 0.16, 0.14], indirect: o.indirect ?? 0.3, ao: o.ao ?? 1, fall: o.fall ?? 0.42 });
    return this.rooms.length - 1;
  }
  // furniture contact-shadow box (site-local, axis aligned), k = strength
  addOcc(x0, y0, z0, x1, y1, z1, k = 0.55, room = -1, fall = 0.28) { this.occ.push({ b: [x0, y0, z0, x1, y1, z1], k, room, fall }); return this.occ.length - 1; }
  // point light (site-local). o: {room, range, dir:[x,y,z], cos0, cos1, wrap}
  addLight(x, y, z, col, I, o = {}) { this.lights.push({ p: [x, y, z], col: typeof col === 'number' ? lin(col) : col, I, range: o.range ?? 8, room: o.room ?? -1, dir: o.dir || null, cos0: o.cos0 ?? 0.2, cos1: o.cos1 ?? 0.8, wrap: o.wrap ?? 0.18, r0: o.r0 ?? 1.2 }); return this; }
  // window sky source: centre, inward normal, strength, room
  addWindow(x, y, z, nx, nz, k = 1, room = -1, range = 7) { this.windows.push({ p: [x, y, z], n: [nx, 0, nz], k, room, range }); return this; }
  // transform helper for bake inputs given in the current frame
  local(x, y, z) { _v.set(x, y, z).applyMatrix4(this.M); return [_v.x, _v.y, _v.z]; }
  dirLocal(x, y, z) { _nv.set(x, y, z).applyMatrix3(this.N).normalize(); return [_nv.x, _nv.y, _nv.z]; }
  // contact-shadow box given in the current frame (bottom lifted a hair so the floor under it darkens)
  occBox(x0, y0, z0, x1, y1, z1, k = 0.55, fall = 0.28) {
    let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const X of [x0, x1]) for (const Y of [y0, y1]) for (const Z of [z0, z1]) { const p = this.local(X, Y, Z); for (let i = 0; i < 3; i++) { a[i] = Math.min(a[i], p[i]); b[i] = Math.max(b[i], p[i]); } }
    return this.addOcc(a[0], a[1] + 0.04, a[2], b[0], b[1], b[2], k, this.st.room, fall);
  }
  // bake light given in the current frame
  light(x, y, z, col, I, o = {}) {
    const p = this.local(x, y, z);
    const oo = { room: this.st.room, ...o };
    if (o.dir) oo.dir = this.dirLocal(...o.dir);
    return this.addLight(p[0], p[1], p[2], col, I, oo);
  }
  win(x, y, z, nx, nz, k = 1, range = 7) { const p = this.local(x, y, z), n = this.dirLocal(nx, 0, nz); return this.addWindow(p[0], p[1], p[2], n[0], n[2], k, this.st.room, range); }
  // emit in another bucket temporarily
  in(bucket, fn) { const b = this.st.bucket; this.st.bucket = bucket; fn(this); this.st.bucket = b; return this; }
  // glow colour helper: HDR linear colour for the glow bucket
  glow(hex, k = 1) { const c = typeof hex === 'number' ? lin(hex) : hex; this.st.col = [c[0] * k, c[1] * k, c[2] * k]; return this; }

  // ------------------------------------------------------------------ bake + meshes
  bake() {
    const R = this.rooms;
    // per-room lists (room -1 inputs apply everywhere)
    const per = R.map((r, ri) => ({
      occ: this.occ.map((o, k) => ({ ...o, k })).filter(o => o.room < 0 || o.room === ri),
      lights: this.lights.filter(l => l.room < 0 || l.room === ri),
      wins: this.windows.filter(w => w.room < 0 || w.room === ri),
    }));
    for (const [key, b] of this.buckets) {
      if (!key.endsWith('main') && !key.endsWith('paint') && !key.includes('pbr:')) continue;
      const n = b.n, P = b.pos, N = b.nor;
      const bake = b.bake = new Float32Array(n * 4), skyA = b.sky = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ri = b.room[i];
        if (ri < 0) { bake[i * 4 + 3] = 1; continue; }
        const r = R[ri], L = per[ri];
        const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
        const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
        const bb = r.b, fall = r.fall;
        // room corner AO: distance to each of the six planes, weighted by how much the normal faces away from it
        let occ = 0, d;
        d = px - bb[0]; if (d > -0.05 && d < 2) { const f = (1 - nx) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        d = bb[3] - px; if (d > -0.05 && d < 2) { const f = (1 + nx) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        d = py - bb[1]; if (d > -0.05 && d < 2) { const f = (1 - ny) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        d = bb[4] - py; if (d > -0.05 && d < 2) { const f = (1 + ny) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        d = pz - bb[2]; if (d > -0.05 && d < 2) { const f = (1 - nz) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        d = bb[5] - pz; if (d > -0.05 && d < 2) { const f = (1 + nz) * 0.5; if (f > 0.05) occ += f * Math.exp(-Math.max(0, d) / fall) * 0.5; }
        // furniture contact AO
        const self = b.self[i];
        for (let k = 0, O = L.occ; k < O.length; k++) {
          const o = O[k], q = o.b;
          if (px < q[0] - 1.2 || px > q[3] + 1.2 || py < q[1] - 1.2 || py > q[4] + 1.2 || pz < q[2] - 1.2 || pz > q[5] + 1.2 || self === o.k) continue;
          const dx = (px < q[0] ? q[0] : px > q[3] ? q[3] : px) - px, dy = (py < q[1] ? q[1] : py > q[4] ? q[4] : py) - py, dz = (pz < q[2] ? q[2] : pz > q[5] ? q[5] : pz) - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 1.44 || d2 < 0.000144) continue;
          const dd = Math.sqrt(d2), facing = Math.max(0, (nx * dx + ny * dy + nz * dz) / dd);
          occ += o.k * Math.exp(-dd / o.fall) * (0.3 + 0.7 * facing);
        }
        const ao = Math.max(0.22, 1 - occ * r.ao);
        let lr = r.amb[0] * ao, lg = r.amb[1] * ao, lb = r.amb[2] * ao;
        for (let k = 0, Ls = L.lights; k < Ls.length; k++) {
          const l = Ls[k], lp = l.p;
          const dx = lp[0] - px, dy = lp[1] - py, dz = lp[2] - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > l.range * l.range || d2 < 1e-8) continue;
          const dd = Math.sqrt(d2), ux = dx / dd, uy = dy / dd, uz = dz / dd;
          let ndl = nx * ux + ny * uy + nz * uz;
          ndl = (ndl + l.wrap) / (1 + l.wrap);
          if (ndl <= 0) continue;
          let spot = 1;
          if (l.dir) { spot = smooth(l.cos0, l.cos1, -(ux * l.dir[0] + uy * l.dir[1] + uz * l.dir[2])); if (spot <= 0) continue; }
          const att = l.I / (1 + d2 / (l.r0 * l.r0)) * (1 - smooth(l.range * 0.55, l.range, dd)) * spot * ndl * (0.55 + 0.45 * ao);
          lr += l.col[0] * att; lg += l.col[1] * att; lb += l.col[2] * att;
        }
        let sky = 0;
        for (let k = 0, W = L.wins; k < W.length; k++) {
          const w = W[k], wp = w.p;
          const dx = wp[0] - px, dy = wp[1] - py, dz = wp[2] - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > w.range * w.range) continue;
          const dd = Math.sqrt(d2) || 1, ux = dx / dd, uy = dy / dd, uz = dz / dd;
          const ndl = Math.max(0, (nx * ux + ny * uy + nz * uz + 0.3) / 1.3);
          const lobe = Math.max(0, -(ux * w.n[0] + uz * w.n[2]) * 0.7 + 0.3);
          sky += w.k * ndl * lobe / (1 + d2 / 4.84) * (1 - smooth(w.range * 0.5, w.range, dd));
        }
        bake[i * 4] = lr; bake[i * 4 + 1] = lg; bake[i * 4 + 2] = lb; bake[i * 4 + 3] = r.indirect;
        skyA[i] = sky * (0.5 + 0.5 * ao);
      }
    }
  }
  // build meshes: returns { groups: {name: THREE.Group}, meshes: [], drawCalls }
  toMeshes(mats) {
    const t0 = performance.now();
    this.bake();
    const t1 = performance.now();
    let verts = 0; for (const b of this.buckets.values()) verts += b.n;
    this.stats = { bakeMs: t1 - t0, verts, lights: this.lights.length, occ: this.occ.length };
    const groups = {};
    let calls = 0;
    for (const [key, b] of this.buckets) {
      if (!b.n) continue;
      const gi = key.indexOf('|'), gname = gi >= 0 ? key.slice(0, gi) : '', bname = gi >= 0 ? key.slice(gi + 1) : key;
      const pbr = bname.startsWith('pbr:');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      if (bname === 'main' || bname === 'paint' || pbr) {
        g.setAttribute('aBake', new THREE.BufferAttribute(b.bake, 4));
        const rm = new Float32Array(b.n * 4);
        for (let i = 0; i < b.n; i++) { rm[i * 4] = b.rm[i * 3]; rm[i * 4 + 1] = b.rm[i * 3 + 1]; rm[i * 4 + 2] = b.rm[i * 3 + 2]; rm[i * 4 + 3] = b.sky[i]; }
        g.setAttribute('aRM', new THREE.BufferAttribute(rm, 4));
        g.setAttribute('aPuv', new THREE.Float32BufferAttribute(b.puv, 2));
      }
      if (bname === 'sign' || bname === 'paint') g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (pbr) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.puv, 2));
      g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = pbr ? mats.pbr(bname.slice(4)) : (mats[bname] || mats.main);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = key;
      if (bname === 'main' || pbr) { mesh.castShadow = true; mesh.receiveShadow = true; }
      if (bname === 'paint') mesh.receiveShadow = true;
      if (bname === 'glass') mesh.renderOrder = 2;
      if (bname === 'sign') mesh.renderOrder = 3;
      mesh.matrixAutoUpdate = false; mesh.userData.own = true;
      (groups[gname] ||= new THREE.Group()).add(mesh);
      calls++;
    }
    this.stats.meshMs = performance.now() - t1;
    return { groups, drawCalls: calls, stats: this.stats };
  }
}

function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

// rounded box geometry (indexed), centred at the origin
function roundedBox(w, h, d, r, seg) {
  // start from a subdivided box and push vertices onto the rounded shape
  const N = seg * 2 + 1;
  const g = new THREE.BoxGeometry(w, h, d, N, N, N);
  const p = g.attributes.position, n = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  // remap the even grid so the outer `seg` rows cover the bevel band [inner, half]
  const remap = (a, half, inner) => {
    const i = Math.round((a + half) * N / (2 * half));
    if (i <= seg) return -half + (i / seg) * r;
    if (i >= N - seg) return inner + ((i - (N - seg)) / seg) * r;
    return -inner + ((i - seg) / (N - 2 * seg)) * 2 * inner;
  };
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.set(remap(v.x, w / 2, hx), remap(v.y, h / 2, hy), remap(v.z, d / 2, hz));
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z, L = Math.hypot(dx, dy, dz);
    if (L > 1e-6) { v.set(c.x + dx / L * r, c.y + dy / L * r, c.z + dz / L * r); n.setXYZ(i, dx / L, dy / L, dz / L); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
