// Buildings v2 silhouette detail (kills the "square box" look). Pure functions over the plan arrays, run in the build
// workers with v2build.js:
//   MID  (<= 1.4 km, merged into the tile mesh): projecting cornices, storefront cornice + belt courses, SF bay windows
//        (slanted Victorian / squared Edwardian / apartment bay columns, full height), parapet rims (the roof sits
//        below a coped parapet), Victorian front gables, tower setbacks / chamfered corners / penthouse crowns, and
//        simple rooftop clutter (bulkheads, HVAC, water tanks, skylights, chimneys).
//   NEAR (<= ~450 m) the same cornices + rooftop clutter as Blender-baked kit meshes (tools/blender/kit_city.py,
//        public/assets/kit/city_kit.glb) merged per tile into a KitBuf, plus scroll brackets and fire escapes.
//        MID geometry that the kit replaces carries aK flag KITLOD; the hide texture's G channel (set while the
//        building's NEAR kit tile is shown) collapses it in the vertex shader (material.js HIDE).
import { M } from './material.js';
import { L, TILE } from './layers.js';
import { Frame, MeshBuf } from './emit.js';
import { S, GT } from './plan.js';
import { prm, Z } from './v2plan.js';
import { bayPts, offsetPts, mansardOf } from './v5mass.js';
import { NOV5 } from './v2lots.js';

export const KITLOD = 8192, V3LOD = 32768;
export function h01(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
const isTower = (st) => st === S.TOWER_GLASS || st === S.TOWER_STONE;
const isHouse = (st) => st === S.VICTORIAN || st === S.EDWARDIAN || st === S.STUCCO;

// ------------------------------------------------------------------ kit geometry (per thread)
let KIT = null, KIT3 = null;
export function setKit(k) { KIT = k; }
export const kitReady = () => !!KIT;
// v3 facade kit (tools/blender/kit_facade3.py): pieces carry meta (opening, recess, stretch zones) and a tint mask
export function setKit3(k) { KIT3 = k; }
export const kitReady3 = () => !!KIT3;
export const kit3Has = (name) => !!(KIT3 && KIT3[name]);
// merged kit vertices: position f32, normal i8, uv f32, colour u8 (tint), index u32
export class KitBuf {
  constructor(cap = 16384) { this.n = 0; this.ni = 0; this.cap = cap; this.pos = new Float32Array(cap * 3); this.nrm = new Int8Array(cap * 3); this.uv = new Float32Array(cap * 2); this.col = new Uint8Array(cap * 3); this.idx = new Uint32Array(cap * 2); this.tris = 0; }
  grow(nv, ni) {
    if (this.n + nv > this.cap) {
      let c = this.cap * 2; while (c < this.n + nv) c *= 2;
      const g = (a, s, T) => { const b = new T(c * s); b.set(a); return b; };
      this.pos = g(this.pos, 3, Float32Array); this.nrm = g(this.nrm, 3, Int8Array); this.uv = g(this.uv, 2, Float32Array); this.col = g(this.col, 3, Uint8Array); this.cap = c;
    }
    if (this.ni + ni > this.idx.length) { let c = this.idx.length * 2; while (c < this.ni + ni) c *= 2; const b = new Uint32Array(c); b.set(this.idx); this.idx = b; }
  }
  get empty() { return this.ni === 0; }
  // v3 kit piece fitted to an opening W x H at (u0, v0) of facade frame F (9-slice in geometry: the margins keep
  // their size, the middle stretches; parts inside the reveal follow the recess). tA / tB = tint A (trim) / B (accent).
  // Pieces without an opening scale linearly (W, H = scale factors). shear: v += shear * u (stair railings); flip mirrors u.
  fit(name, F, u0, v0, d0, W, H, rec, tA, tB, shear = 0, flip = false, sz = 1) {
    const k = KIT3 && KIT3[name]; if (!k) return;
    const j = k.meta, p = k.pos, q = k.nrm, mk = k.mask, nv = p.length / 3, b = this.n, op = j.open;
    this.grow(nv, k.idx.length);
    let W0 = 1, H0 = 1, ax = 0, bx = 1, ay = 0, by = 1, kx = W, ky = H, lin = !op, dz = 0;
    if (op) {
      W0 = op[0]; H0 = op[1]; ax = j.sx; bx = W0 - j.sx; ay = j.sy; by = H0 - j.sy; dz = -(rec - (j.rec0 || 0));
      const mx = W - W0 + (bx - ax), my = H - H0 + (by - ay);
      if (bx - ax < 0.02 || mx < (bx - ax) * 0.25) { ax = 0; bx = W0; } if (by - ay < 0.02 || my < (by - ay) * 0.25) { ay = 0; by = H0; }
      kx = (W - W0 + (bx - ax)) / (bx - ax); ky = (H - H0 + (by - ay)) / (by - ay);
    }
    const cA = [Math.min(255, tA[0] * 318), Math.min(255, tA[1] * 318), Math.min(255, tA[2] * 318)], cB = [Math.min(255, tB[0] * 318), Math.min(255, tB[1] * 318), Math.min(255, tB[2] * 318)];
    for (let jv = 0; jv < nv; jv++) {
      const x = p[jv * 3], y = p[jv * 3 + 1], z = p[jv * 3 + 2];
      let lx, ly, sxl, syl;
      if (lin) { lx = x * W; ly = y * H; sxl = W; syl = H; }
      else {
        if (x <= ax) { lx = x; sxl = 1; } else if (x >= bx) { lx = x + (W - W0); sxl = 1; } else { lx = ax + (x - ax) * kx; sxl = kx; }
        if (y <= ay) { ly = y; syl = 1; } else if (y >= by) { ly = y + (H - H0); syl = 1; } else { ly = ay + (y - ay) * ky; syl = ky; }
        if (ax === 0 && bx === W0) { lx = x * W / W0; sxl = W / W0; } if (ay === 0 && by === H0) { ly = y * H / H0; syl = H / H0; }
      }
      const lz = (z < -0.02 ? z + dz : z) * sz;
      if (flip) lx = (op ? W : 0) - lx;
      const u = u0 + lx, v = v0 + ly + shear * lx, d = d0 + lz, o = (b + jv) * 3;
      this.pos[o] = F.ox + F.tx * u + F.nx * d; this.pos[o + 1] = F.oy + v; this.pos[o + 2] = F.oz + F.tz * u + F.nz * d;
      let nx = q[jv * 3] / sxl * (flip ? -1 : 1), ny = q[jv * 3 + 1] / syl, nz = q[jv * 3 + 2] / sz; nx -= ny * shear * (flip ? -1 : 1);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.nrm[o] = (F.tx * nx + F.nx * nz) * 127; this.nrm[o + 1] = ny * 127; this.nrm[o + 2] = (F.tz * nx + F.nz * nz) * 127;
      this.uv[(b + jv) * 2] = k.uv[jv * 2]; this.uv[(b + jv) * 2 + 1] = k.uv[jv * 2 + 1];
      const m = mk[jv] > 0.75 ? cB : mk[jv] > 0.25 ? cA : null;
      if (m) { this.col[o] = m[0]; this.col[o + 1] = m[1]; this.col[o + 2] = m[2]; } else { this.col[o] = this.col[o + 1] = this.col[o + 2] = 255; }
    }
    const ix = k.idx;
    if (flip) for (let t = 0; t < ix.length; t += 3) { this.idx[this.ni++] = b + ix[t]; this.idx[this.ni++] = b + ix[t + 2]; this.idx[this.ni++] = b + ix[t + 1]; }
    else for (let t = 0; t < ix.length; t++) this.idx[this.ni++] = b + ix[t];
    this.n += nv; this.tris += ix.length / 3;
  }
  pack() { const n = this.n; return { n, ni: this.ni, pos: this.pos.slice(0, n * 3), nrm: this.nrm.slice(0, n * 3), uv: this.uv.slice(0, n * 2), col: this.col.slice(0, n * 3), idx: this.idx.slice(0, this.ni) }; }
  // piece in a facade frame F: local (x, y, z) -> (u + x*sx, v + y*sy, d + z*sz)
  wall(name, F, u, v, d, sx, sy, sz, tint) {
    const k = KIT && KIT[name]; if (!k) return;
    const p = k.pos, q = k.nrm, nv = p.length / 3, b = this.n;
    this.grow(nv, k.idx.length);
    const tr = Math.min(255, tint[0] * 255), tg = Math.min(255, tint[1] * 255), tb = Math.min(255, tint[2] * 255);
    for (let j = 0; j < nv; j++) {
      const lu = u + p[j * 3] * sx, lv = v + p[j * 3 + 1] * sy, ld = d + p[j * 3 + 2] * sz, o = (b + j) * 3;
      this.pos[o] = F.ox + F.tx * lu + F.nx * ld; this.pos[o + 1] = F.oy + lv; this.pos[o + 2] = F.oz + F.tz * lu + F.nz * ld;
      let nx = q[j * 3] / sx, ny = q[j * 3 + 1] / sy, nz = q[j * 3 + 2] / sz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.nrm[o] = (F.tx * nx + F.nx * nz) * 127; this.nrm[o + 1] = ny * 127; this.nrm[o + 2] = (F.tz * nx + F.nz * nz) * 127;
      this.uv[(b + j) * 2] = k.uv[j * 2]; this.uv[(b + j) * 2 + 1] = k.uv[j * 2 + 1];
      this.col[o] = tr; this.col[o + 1] = tg; this.col[o + 2] = tb;
    }
    for (let j = 0; j < k.idx.length; j++) this.idx[this.ni++] = b + k.idx[j];
    this.n += nv; this.tris += k.idx.length / 3;
  }
  // piece at a world point, rotated by yaw about +Y (three rotation.y sense), scaled
  roof(name, x, y, z, yaw, sx, sy, sz, tint = WHITE) {
    const k = KIT && KIT[name]; if (!k) return;
    const c = Math.cos(yaw), s = Math.sin(yaw), p = k.pos, q = k.nrm, nv = p.length / 3, b = this.n;
    this.grow(nv, k.idx.length);
    const tr = Math.min(255, tint[0] * 255), tg = Math.min(255, tint[1] * 255), tb = Math.min(255, tint[2] * 255);
    for (let j = 0; j < nv; j++) {
      const lx = p[j * 3] * sx, ly = p[j * 3 + 1] * sy, lz = p[j * 3 + 2] * sz, o = (b + j) * 3;
      this.pos[o] = x + c * lx + s * lz; this.pos[o + 1] = y + ly; this.pos[o + 2] = z - s * lx + c * lz;
      let nx = q[j * 3] / sx, ny = q[j * 3 + 1] / sy, nz = q[j * 3 + 2] / sz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.nrm[o] = (c * nx + s * nz) * 127; this.nrm[o + 1] = ny * 127; this.nrm[o + 2] = (-s * nx + c * nz) * 127;
      this.uv[(b + j) * 2] = k.uv[j * 2]; this.uv[(b + j) * 2 + 1] = k.uv[j * 2 + 1];
      this.col[o] = tr; this.col[o + 1] = tg; this.col[o + 2] = tb;
    }
    for (let j = 0; j < k.idx.length; j++) this.idx[this.ni++] = b + k.idx[j];
    this.n += nv; this.tris += k.idx.length / 3;
  }
}
const WHITE = [1, 1, 1];
// kit pieces grouped per 128 m cell of the building centroid (the main thread distance-culls cells and swaps the
// MID stand-ins of exactly those buildings via the hide texture G channel)
export const KCELL = 128;
export class KitCells {
  constructor() { this.m = new Map(); }
  at(P, i) {
    const k = Math.floor(P.cx[i] / KCELL) * 65536 + Math.floor(P.cz[i] / KCELL);
    let c = this.m.get(k);
    if (!c) this.m.set(k, c = { kb: new KitBuf(4096), kb3: null, fb: null, ids: [], ids3: [], last: -1, last3: -1, cx: (Math.floor(P.cx[i] / KCELL) + 0.5) * KCELL, cz: (Math.floor(P.cz[i] / KCELL) + 0.5) * KCELL });
    if (c.last !== i) { c.ids.push(i); c.last = i; }
    return c.kb;
  }
  // the v3 facade-kit buffer of building i's cell (separate atlas / material)
  at3(P, i) { this.at(P, i); const c = this.m.get(Math.floor(P.cx[i] / KCELL) * 65536 + Math.floor(P.cz[i] / KCELL)); if (c.last3 !== i) { c.ids3.push(i); c.last3 = i; } return c.kb3 || (c.kb3 = new KitBuf(8192)); }
  // the v3 facade-material buffer (walls with openings, reveals, glass...) of building i's cell: drawn per cell, so it is
  // culled with the cell beyond V3_R instead of being collapsed vertex by vertex
  fb3(P, i) { this.at3(P, i); const c = this.m.get(Math.floor(P.cx[i] / KCELL) * 65536 + Math.floor(P.cz[i] / KCELL)); return c.fb || (c.fb = new MeshBuf(true, 8192)); }
  // (v4) small street-front clutter of the v3 kit (plants, bins, bikes, house numbers...): its own cell mesh, drawn over a
  // shorter range than the facade pieces (v2city DET_R)
  at3d(P, i) { this.at3(P, i); const c = this.m.get(Math.floor(P.cx[i] / KCELL) * 65536 + Math.floor(P.cz[i] / KCELL)); return c.kbd || (c.kbd = new KitBuf(4096)); }
  get empty() { for (const c of this.m.values()) if (!c.kb.empty || (c.kb3 && !c.kb3.empty) || (c.kbd && !c.kbd.empty) || (c.fb && !c.fb.empty)) return false; return true; }
  pack(packFb) {
    const out = [];
    for (const c of this.m.values()) {
      const eF = !c.fb || c.fb.empty, eD = !c.kbd || c.kbd.empty, e3 = (!c.kb3 || c.kb3.empty) && eF && eD;
      if (!c.kb.empty || !e3) out.push({ cx: c.cx, cz: c.cz, ids: Int32Array.from(c.kb.empty ? [] : c.ids), ids3: Int32Array.from(e3 ? [] : c.ids3), geo: c.kb.empty ? null : c.kb.pack(),
        geo3: !c.kb3 || c.kb3.empty ? null : c.kb3.pack(), geo3d: eD ? null : c.kbd.pack(), geoF: eF || !packFb ? null : packFb(c.fb) });
    }
    return out;
  }
}

// ------------------------------------------------------------------ small writers
function sc(Bf, layer, c, flags = 0) {
  Bf.sk = M.SURF + 32 * layer + flags; Bf.sz = -1e5; Bf.sw = 0;
  Bf.sc[0] = Math.min(255, c[0] * 255); Bf.sc[1] = Math.min(255, c[1] * 255); Bf.sc[2] = Math.min(255, c[2] * 255); Bf.sc[3] = 255;
}
function rc(Bf) { Bf.sc[0] = Bf.sc[1] = Bf.sc[2] = Bf.sc[3] = 255; Bf.sz = 0; Bf.sw = 0; }
// world quad p..s with a wanted normal (winding fixed to match), planar uv / TILE[layer]
function qW(Bf, p, q, r, s, wx, wy, wz, layer) {
  const ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = s[0] - p[0], by = s[1] - p[1], bz = s[2] - p[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const flip = nx * wx + ny * wy + nz * wz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const inv = 1 / TILE[layer], up = Math.abs(ny) > 0.6;
  const tx = up ? 1 : -nz, tz = up ? 0 : nx;   // horizontal tangent
  const V = (P) => Bf.v(P[0], P[1], P[2], nx, ny, nz, (P[0] * tx + P[2] * tz) * inv, (up ? P[2] : P[1]) * inv);
  const a = V(p), b = V(q), c = V(r), d = V(s);
  if (flip) Bf.quad(a, d, c, b); else Bf.quad(a, b, c, d);
}
// axis box in the building's OBB frame (c, s = cos / sin of oyaw), centre (cx, cz) world, half sizes
function obox(Bf, cx, cz, c, s, hx, hz, y0, y1, layer, col, flags, faces = 31) {
  const X = [c, -s], Zd = [s, c];
  const p = (u, w, y) => [cx + X[0] * u * hx + Zd[0] * w * hz, y, cz + X[1] * u * hx + Zd[1] * w * hz];
  sc(Bf, layer, col, flags);
  if (faces & 16) qW(Bf, p(-1, -1, y1), p(1, -1, y1), p(1, 1, y1), p(-1, 1, y1), 0, 1, 0, layer);
  qW(Bf, p(-1, -1, y0), p(1, -1, y0), p(1, -1, y1), p(-1, -1, y1), -Zd[0], 0, -Zd[1], layer);
  qW(Bf, p(1, 1, y0), p(-1, 1, y0), p(-1, 1, y1), p(1, 1, y1), Zd[0], 0, Zd[1], layer);
  qW(Bf, p(1, -1, y0), p(1, 1, y0), p(1, 1, y1), p(1, -1, y1), X[0], 0, X[1], layer);
  qW(Bf, p(-1, 1, y0), p(-1, -1, y0), p(-1, -1, y1), p(-1, 1, y1), -X[0], 0, -X[1], layer);
}

// ------------------------------------------------------------------ roof levels
export function rimH(P, i) {
  const st = P.style[i];
  if (st === S.TOWER_GLASS) return 2.4;
  if (st === S.STUCCO) return 0.45;
  return Math.max(0.4, Math.min(1.3, prm(P, i, 6, 3) * 0.85));
}
export const hasRim = (P, i) => !P.pitched[i] && P.area[i] >= 40 && !(P.flags[i] & 32);
export const falseFrontH = (P, i) => Math.min(0.9 + 1.2 * h01(i, 63), (P.yEave[i] - P.y0[i]) * 0.2);
const hasFF = (P, i) => (P.flags[i] & 64) && !P.pitched[i] && !towerInfo(P, i).ySet;
export const roofY = (P, i) => hasFF(P, i) ? P.yEave[i] - falseFrontH(P, i) - 0.35 : P.yEave[i] - (hasRim(P, i) ? rimH(P, i) : 0);

// tower massing: chamfered corners, a setback upper block, a crown
export function towerInfo(P, i) {
  const st = P.style[i], hA = P.yEave[i] - P.y0[i];
  const out = { chamfer: 0, ySet: 0, inset: 0, crown: 0 };
  if (P.pitched[i] || !(isTower(st) || st === S.OFFICE) || hA < 30) return out;
  if (P.fill[i] > 0.82 && h01(i, 41) < (st === S.TOWER_GLASS ? 0.45 : 0.3)) out.chamfer = 1;
  const short = Math.min(P.ohx[i], P.ohz[i]);
  if (hA >= 55 && P.fill[i] > 0.78 && short > 9 && h01(i, 43) < (st === S.TOWER_STONE ? 0.6 : 0.4)) {
    out.ySet = P.y0[i] + hA * (0.7 + 0.14 * h01(i, 44)); out.inset = Math.min(4.5, short * 0.2);
  }
  out.crown = hA >= 35 && short > 6 ? 1 + (st === S.TOWER_STONE && h01(i, 45) < 0.45 ? 1 : 0) : 0;
  return out;
}
// chamfer convex ~right-angle corners of a closed polygon (X, Zs, Fr = per-edge front flags), in place
export function chamfer(X, Zs, Fr, sgn) {
  const n = X.length, nx = [], nz = [], nf = [];
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n, q = (k + 1) % n;
    const e1x = X[k] - X[p], e1z = Zs[k] - Zs[p], e2x = X[q] - X[k], e2z = Zs[q] - Zs[k];
    const l1 = Math.hypot(e1x, e1z), l2 = Math.hypot(e2x, e2z);
    const cr = (e1x * e2z - e1z * e2x) / (l1 * l2 || 1), dot = (e1x * e2x + e1z * e2z) / (l1 * l2 || 1);
    if (l1 >= 7 && l2 >= 7 && cr * sgn > 0.8 && Math.abs(dot) < 0.35) {
      const c = Math.min(2.4, 0.16 * Math.min(l1, l2));
      nx.push(X[k] - e1x / l1 * c); nz.push(Zs[k] - e1z / l1 * c); nf.push(Fr[p] || Fr[k]);   // -> chamfer edge
      nx.push(X[k] + e2x / l2 * c); nz.push(Zs[k] + e2z / l2 * c); nf.push(Fr[k]);
    } else { nx.push(X[k]); nz.push(Zs[k]); nf.push(Fr[k]); }
  }
  X.length = 0; Zs.length = 0; Fr.length = 0;
  X.push(...nx); Zs.push(...nz); Fr.push(...nf);
}

// parapet rim over a flat roof: inner faces (wall material) + coping (trim), polygon X/Zs with outward normal sign sgn
export function rim(Bf, P, i, X, Zs, sgn, yTop, h) {
  const n = X.length, t = 0.26, y0 = yTop - h;
  const wl = prm(P, i, 9, 2), wc = [prm(P, i, 3, 0) * 0.85, prm(P, i, 3, 1) * 0.85, prm(P, i, 3, 2) * 0.85], tc = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)];
  for (let k = 0; k < n; k++) {
    const q = (k + 1) % n, ax = X[k], az = Zs[k], bx = X[q], bz = Zs[q], ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez);
    if (l < 0.8) continue;
    const nx = sgn * ez / l, nz = -sgn * ex / l, ix = -nx * t, iz = -nz * t;
    sc(Bf, wl, wc);
    qW(Bf, [ax + ix, y0, az + iz], [bx + ix, y0, bz + iz], [bx + ix, yTop, bz + iz], [ax + ix, yTop, az + iz], -nx, 0, -nz, wl);
    sc(Bf, L.CONCRETE, tc);
    qW(Bf, [ax, yTop, az], [bx, yTop, bz], [bx + ix, yTop, bz + iz], [ax + ix, yTop, az + iz], 0, 1, 0, L.CONCRETE);
  }
  rc(Bf);
}

// false front: the street walls (Fr[k]) rise to yTop, the others stop ff lower; low side parapets (rs) around the roof,
// inner faces + coping everywhere, end caps where the false front overhangs the side walls
export function falseFront(Bf, P, i, X, Zs, Fr, sgn, yTop, ff, rs) {
  const n = X.length, t = 0.26, ys = yTop - ff, y0 = ys - rs;
  const wl = prm(P, i, 9, 2), wc = [prm(P, i, 3, 0) * 0.85, prm(P, i, 3, 1) * 0.85, prm(P, i, 3, 2) * 0.85], tc = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)];
  for (let k = 0; k < n; k++) {
    const q = (k + 1) % n, ax = X[k], az = Zs[k], bx = X[q], bz = Zs[q], ex = bx - ax, ez = bz - az, l = Math.hypot(ex, ez);
    if (l < 0.3) continue;
    const nx = sgn * ez / l, nz = -sgn * ex / l, ix = -nx * t, iz = -nz * t, top = Fr[k] ? yTop : ys;
    sc(Bf, wl, wc);
    qW(Bf, [ax + ix, y0, az + iz], [bx + ix, y0, bz + iz], [bx + ix, top, bz + iz], [ax + ix, top, az + iz], -nx, 0, -nz, wl);
    if (Fr[k]) {
      const dx = ex / l, dz = ez / l;
      if (!Fr[(k + n - 1) % n]) qW(Bf, [ax, ys, az], [ax + ix, ys, az + iz], [ax + ix, top, az + iz], [ax, top, az], -dx, 0, -dz, wl);
      if (!Fr[q]) qW(Bf, [bx, ys, bz], [bx + ix, ys, bz + iz], [bx + ix, top, bz + iz], [bx, top, bz], dx, 0, dz, wl);
    }
    sc(Bf, L.CONCRETE, tc);
    qW(Bf, [ax, top, az], [bx, top, bz], [bx + ix, top, bz + iz], [ax + ix, top, az + iz], 0, 1, 0, L.CONCRETE);
  }
  rc(Bf);
}

// sawtooth roofs on big industrial sheds (SoMa, Dogpatch, Bayview): monitor teeth along the long OBB axis, glazed
// vertical faces (north lights), corrugated slopes, closed gable ends
export const hasSaw = (P, i) => P.style[i] === S.WAREHOUSE && !P.pitched[i] && P.area[i] > 600 && P.fill[i] > 0.85 && !(P.flags[i] & 32) && h01(i, 91) < 0.6;
export function sawtooth(Bf, P, i, y) {
  const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), inset = 0.7;
  let a = P.ohx[i] - inset, b = P.ohz[i] - inset, long = a >= b;
  if (!long) { const t = a; a = b; b = t; }
  if (a < 5 || b < 3) return;
  const W = (u, w, yy) => { const lx = long ? u : w, lz = long ? w : u; return [P.ox[i] + c * lx + s * lz, yy, P.oz[i] - s * lx + c * lz]; };
  const n = Math.max(1, Math.round(2 * a / 6.5)), per = 2 * a / n, H = Math.min(2.2, 0.28 * per);
  const ax = long ? [c, -s] : [s, c];                   // world direction of +u (long axis)
  const up = [0, 1, 0];
  for (let k = 0; k < n; k++) {
    const s0 = -a + k * per, s1 = s0 + per;
    const A = W(s0, -b, y), B = W(s0, b, y), C = W(s1, b, y + H), D = W(s1, -b, y + H);
    sc(Bf, L.CORRUGATED, [0.62, 0.63, 0.62]);
    const nx = -ax[0] * H, nz = -ax[1] * H, ny = per;
    qW(Bf, A, B, C, D, nx, ny, nz, L.CORRUGATED);
    sc(Bf, L.METAL, [0.16, 0.19, 0.22]);
    qW(Bf, W(s1, -b, y), W(s1, b, y), C, D, ax[0], 0, ax[1], L.METAL);
    sc(Bf, prm(P, i, 9, 2), [prm(P, i, 3, 0), prm(P, i, 3, 1), prm(P, i, 3, 2)]);
    const e0 = W(s0, -b, y), e1 = W(s1, -b, y), e2 = W(s1, -b, y + H), wb = long ? [s, c] : [-c, s];
    triW(Bf, e0, e1, e2, -wb[0], 0, -wb[1]);
    const f0 = W(s0, b, y), f1 = W(s1, b, y), f2 = W(s1, b, y + H);
    triW(Bf, f0, f1, f2, wb[0], 0, wb[1]);
  }
  rc(Bf);
}
function triW(Bf, p, q, r, wx, wy, wz) {
  const ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = r[0] - p[0], by = r[1] - p[1], bz = r[2] - p[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const flip = nx * wx + ny * wy + nz * wz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const V = (P) => Bf.v(P[0], P[1], P[2], nx, ny, nz, (P[0] * -nz + P[2] * nx) / 2.4, P[1] / 2.4);
  const i0 = V(p), i1 = V(q), i2 = V(r);
  if (flip) Bf.tri(i0, i2, i1); else Bf.tri(i0, i1, i2);
}

// rooftop solar arrays on some flat house / low-rise roofs (Sunset, Richmond, Mission, Bernal: common since the 2010s)
export function solar(Bf, P, i, ring, y) {
  const st = P.style[i], area = P.area[i];
  if (area < 45 || area > 1500 || P.yEave[i] - P.y0[i] > 25 || (P.flags[i] & 32) || hasSaw(P, i)) return;
  const pz = P.zone[i] === Z.AVENUES || P.zone[i] === Z.MISSION || P.zone[i] === Z.BAYVIEW || P.zone[i] === Z.CASTRO ? 0.22 : isHouse(st) ? 0.12 : 0.07;
  if (h01(i, 71) > pz) return;
  const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), a = P.ohx[i], b = P.ohz[i];
  const long = a >= b, L1 = (long ? a : b) * (0.35 + 0.3 * h01(i, 72)), L2 = Math.min((long ? b : a) - 0.9, 2.2);
  if (L2 < 0.9 || L1 < 1.2) return;
  const off = (h01(i, 73) - 0.5) * ((long ? a : b) - L1) * 1.2;
  const W = (u, w) => { const lx = long ? u : w, lz = long ? w : u; return [P.ox[i] + c * lx + s * lz, P.oz[i] - s * lx + c * lz]; };
  const inside = (x, z) => { let cc = false; const n = ring.length / 2; for (let k = 0, j = n - 1; k < n; j = k++) { const zi = ring[k * 2 + 1], zj = ring[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (ring[j * 2] - ring[k * 2]) * (z - zi) / (zj - zi) + ring[k * 2]) cc = !cc; } return cc; };
  const P4 = [W(off - L1, -L2), W(off + L1, -L2), W(off + L1, L2), W(off - L1, L2)];
  for (const [x, z] of P4) if (!inside(x, z)) return;
  // tilted panel slab (low edge 0.25 m, high edge 0.75 m) facing roughly south (+z world is south)
  const hiW = (P4[0][1] + P4[1][1]) < (P4[2][1] + P4[3][1]) ? 0 : 1;   // the -w side is further north -> high
  const yL = y + 0.25, yH = y + 0.75, Y = (k) => ((k < 2) === (hiW === 0)) ? yH : yL;
  sc(Bf, L.METAL, [0.11, 0.14, 0.22]);
  qW(Bf, [P4[0][0], Y(0), P4[0][1]], [P4[1][0], Y(1), P4[1][1]], [P4[2][0], Y(2), P4[2][1]], [P4[3][0], Y(3), P4[3][1]], 0, 1, 0, L.METAL);
  sc(Bf, L.METAL, [0.5, 0.52, 0.55]);
  for (let k = 0; k < 4; k++) { const p = P4[k], q = P4[(k + 1) % 4]; const mx = (p[0] + q[0]) / 2 - P.ox[i], mz = (p[1] + q[1]) / 2 - P.oz[i];
    qW(Bf, [p[0], y, p[1]], [q[0], y, q[1]], [q[0], Y((k + 1) % 4), q[1]], [p[0], Y(k), p[1]], mx, 0, mz, L.METAL); }
  rc(Bf);
}

// ------------------------------------------------------------------ bay windows (shared by MID geometry and NEAR sills)
export function bayCells(P, i, nb, Lw) {
  const st = P.style[i], fl = P.flags[i], floors = prm(P, i, 9, 1), gCell = Math.floor(prm(P, i, 2, 2) / 8), out = [];
  if (!(fl & 1) || floors < 1 || Lw < 5.2 || nb < 1 || isTower(st)) return out;
  if (st === S.VICTORIAN) out.push(Math.min(gCell, nb - 1));
  else if (st === S.EDWARDIAN) { if (nb >= 3) out.push(0, nb - 1); else out.push(Math.min(gCell, nb - 1)); }
  else if (st === S.APARTMENT || st === S.COMMERCIAL) for (let c = 0; c < nb; c += 2) out.push(c);
  return out;
}
const FD = new Frame(null);
let PK = 0;          // extra aK flags for the MID front detail (V3LOD where the v3 NEAR facade replaces it)
function procFacet(Bf, ua, da, ub, db, v0, v1, cw) {
  const ex = ub - ua, ed = db - da, len = Math.hypot(ex, ed) || 1;
  let nu = ed / len, nd = -ex / len; if (nd < 0) { nu = -nu; nd = -nd; }
  const wx = FD.tx * nu + FD.nx * nd, wz = FD.tz * nu + FD.nz * nd;
  const tu = FD.tx * ex + FD.nx * ed, tz = FD.tz * ex + FD.nz * ed;
  if (tu * wz - tz * wx < 0) { let t = ua; ua = ub; ub = t; t = da; da = db; db = t; }
  Bf.sk = M.PROC + PK; Bf.sz = cw; Bf.sw = -1;
  const p = (u, d, v, uu) => Bf.v(FD.wx(u, d), FD.oy + v, FD.wz(u, d), wx, 0, wz, uu, v);
  const a = p(ua, da, v0, 0), b = p(ub, db, v0, len), c = p(ub, db, v1, len), e = p(ua, da, v1, 0);
  Bf.quad(a, b, c, e);
  Bf.sz = 0; Bf.sw = 0;
}
const grid1 = (len, margin, bay) => { const w = len - 2 * margin; if (w < 1.2) return [0, 1]; const nb = Math.max(1, Math.round(w / bay)); return [nb, w / nb]; };

// cornice kind of a front wall: 0 none, 1 bracketed (paint), 2 corbelled brick, 3 plain box (no kit)
export function corniceKind(P, i) {
  const st = P.style[i], top = P.yEave[i] - P.y0[i];
  if (st === S.WAREHOUSE || st === S.TOWER_GLASS || st === S.STUCCO || top <= 3 || (P.flags[i] & 32)) return 0;
  const wl = prm(P, i, 9, 2);
  if (st === S.LOFT || (st === S.APARTMENT && (wl === L.BRICK || wl === L.BRICK_DARK))) return 2;
  if (st === S.OFFICE) return 3;
  return 1;
}
const cornDims = (P, i) => { const st = P.style[i], corn = prm(P, i, 6, 3); return [st === S.VICTORIAN ? 0.55 : st === S.LOFT ? 0.45 : 0.4, Math.min(0.6, corn * 0.8)]; };

// ------------------------------------------------------------------ MID: street-front detail of one wall (a..b along the shader tangent)
export function midFront(Bf, P, i, ax, az, bx, bz, Lw, kl = 0) {
  PK = kl;
  const st = P.style[i], fl = P.flags[i], y0 = P.y0[i], top = P.yEave[i] - y0;
  const fh = prm(P, i, 0, 0), gH = prm(P, i, 0, 1), margin = prm(P, i, 0, 3), floors = prm(P, i, 9, 1), bay = prm(P, i, 9, 0);
  const gtype = prm(P, i, 2, 2) % 8, trim = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)];
  FD.b = Bf; FD.set(ax, y0, az, bx - ax, bz - az);
  const tower = isTower(st);
  // projecting cornice (the NEAR kit replaces kinds 1 / 2)
  const ck = corniceKind(P, i);
  if (ck) {
    const [cp, ch] = cornDims(P, i), tt = TW.ySet ? TW.ySet - y0 : top;
    FD.mat(L.TRIM, trim[0], trim[1], trim[2], ck === 3 || TW.ySet ? 0 : KITLOD);
    FD.box(-0.05, Lw + 0.05, tt - ch, tt, 0, cp, 1 | 4 | 8 | 16 | 32);
  } else if (st === S.STUCCO && (fl & 2)) {
    FD.mat(L.CLAYTILE, 1, 1, 1, kl);
    FD.q([-0.1, top - 0.9, 0.55], [Lw + 0.1, top - 0.9, 0.55], [Lw + 0.1, top - 0.2, -0.1], [-0.1, top - 0.2, -0.1]);
  }
  if (tower || st === S.WAREHOUSE || (fl & 32)) { rc(Bf); PK = 0; return; }
  // storefront cornice + belt courses at the floor lines
  FD.mat(L.TRIM, trim[0] * 0.92, trim[1] * 0.92, trim[2] * 0.92, kl);
  if (gtype === GT.STORE && gH > 3) FD.box(-0.04, Lw + 0.04, gH - 0.18, gH + 0.2, 0, 0.24, 1 | 4 | 8 | 16 | 32);
  else if (floors >= 1 && st !== S.STUCCO) FD.box(0, Lw, gH - 0.08, gH + 0.08, 0, 0.1, 1 | 16 | 32);
  if (st !== S.STUCCO && st !== S.LOFT && st !== S.OFFICE && floors >= 2 && floors <= 10)
    for (let r = 1; r < floors; r++) { const v = gH + r * fh; if (v > top - 1) break; FD.box(0, Lw, v - 0.07, v + 0.07, 0, 0.08, 1 | 16 | 32); }
  // bay windows
  const [nb, cw] = grid1(Lw, margin, bay);
  const bays = bayCells(P, i, nb, Lw);
  const v0b = gH + 0.1, v1b = Math.min(top - 0.25, gH + floors * fh - 0.15);
  if (v1b - v0b > 1.5) for (const ci of bays) {
    const ua = margin + ci * cw + 0.12, ub = margin + (ci + 1) * cw - 0.12;
    if (ub - ua < 1.6) continue;
    // (v5) bay form per building: angled / squared / round / shallow, varied depth (v5mass.js bayPts, shared with v3)
    const pts = bayPts(P, i, ci, ua, ub), np = pts.length;
    for (let k = 0; k + 1 < np; k++) procFacet(Bf, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], v0b, v1b, Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]));
    FD.mat(L.TRIM, trim[0], trim[1], trim[2], kl);
    const tp = offsetPts(pts, 0.12), tv = v1b + 0.42;
    for (let k = 1; k + 1 < np; k++) {
      FD.tri([tp[0][0], tv, 0], [tp[k][0], tv, tp[k][1]], [tp[k + 1][0], tv, tp[k + 1][1]]);
      FD.tri([tp[0][0], v1b, 0], [tp[k + 1][0], v1b, tp[k + 1][1]], [tp[k][0], v1b, tp[k][1]]);
    }
    for (let k = 0; k + 1 < np; k++) { const p = tp[k], q = tp[k + 1]; FD.q([p[0], v1b, p[1]], [q[0], v1b, q[1]], [q[0], tv, q[1]], [p[0], tv, p[1]]); }
    // panelled base under the bay (skirt) down to the belt
    const vb0 = v0b - 0.45;
    for (let k = 0; k + 1 < np; k++) { const p = pts[k], q = pts[k + 1]; FD.q([p[0], vb0, p[1]], [q[0], vb0, q[1]], [q[0], v0b, q[1]], [p[0], v0b, p[1]]); }
    for (let k = 1; k + 1 < np; k++) FD.tri([pts[0][0], vb0, 0], [pts[k + 1][0], vb0, pts[k + 1][1]], [pts[k][0], vb0, pts[k][1]]);
  }
  // (v5) MID stoop at the house entry cell (v3-eligible houses only: nearWall draws its own for the rest), so the
  // ground floor is not a flat plane at 190-450 m; collapses with the other V3LOD parts once the v3 facade is in
  if (kl && !NOV5 && gtype === GT.HOUSE && nb >= 2 && st !== S.STUCCO) {
    const gCell = Math.floor(prm(P, i, 2, 2) / 8), ci = gCell === 0 ? 1 : 0, uc = margin + (ci + 0.5) * cw;
    FD.mat(L.CONCRETE, 0.62, 0.6, 0.57, kl);
    for (let k = 0; k < 3; k++) FD.box(uc - 0.7, uc + 0.7, -1.2, 0.3 * (k + 1), 0, 1.3 - k * 0.42, 1 | 4 | 8 | 16);
  }
  rc(Bf); PK = 0;
}
let TW = { chamfer: 0, ySet: 0, inset: 0, crown: 0 };
export function setTower(t) { TW = t; }

// Victorian / Edwardian front gable over a flat roof (Stick / Queen Anne): pediment + two pitched planes + barge boards
export function gable(Bf, P, i, ax, az, bx, bz, Lw) {
  const st = P.style[i];
  if (P.pitched[i] || (P.flags[i] & 64) || Lw < 4.5 || Lw > 10.5 || mansardOf(P, i)) return;
  if (!(st === S.VICTORIAN ? h01(i, 31) < 0.55 : st === S.EDWARDIAN ? h01(i, 31) < 0.18 : false)) return;
  const y0 = P.y0[i], top = P.yEave[i] - y0; if (top < 5) return;
  FD.b = Bf; FD.set(ax, y0, az, bx - ax, bz - az);
  const hG = Math.min(Lw * 0.42, 4.2), oh = 0.35, f = 0.45, e = top - 0.05, R = top + hG;
  const depth = Math.max(3, Math.min(7, P.area[i] / Lw * 0.55));
  const wl = prm(P, i, 9, 2), wc = [prm(P, i, 3, 0), prm(P, i, 3, 1), prm(P, i, 3, 2)], tc = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)];
  const rcol = [P.roofC[i * 3] * 0.5 + 0.12, P.roofC[i * 3 + 1] * 0.5 + 0.12, P.roofC[i * 3 + 2] * 0.5 + 0.12];
  FD.mat(wl, wc[0], wc[1], wc[2]);
  FD.tri([0, top, 0.02], [Lw, top, 0.02], [Lw / 2, R - 0.12, 0.02]);
  FD.tri([Lw, top, -depth], [0, top, -depth], [Lw / 2, R - 0.12, -depth]);
  FD.mat(L.ROOF_SHINGLE, rcol[0], rcol[1], rcol[2]);
  FD.q([-oh, e, f], [Lw / 2, R, f], [Lw / 2, R, -depth - 0.2], [-oh, e, -depth - 0.2]);
  FD.q([Lw + oh, e, f], [Lw + oh, e, -depth - 0.2], [Lw / 2, R, -depth - 0.2], [Lw / 2, R, f]);
  FD.mat(L.TRIM, tc[0], tc[1], tc[2]);
  FD.q([-oh, e - 0.24, f], [Lw / 2, R - 0.24, f], [Lw / 2, R, f], [-oh, e, f]);
  FD.q([Lw / 2, R - 0.24, f], [Lw + oh, e - 0.24, f], [Lw + oh, e, f], [Lw / 2, R, f]);
  FD.box(Lw / 2 - 0.45, Lw / 2 + 0.45, top + hG * 0.22, top + hG * 0.22 + Math.min(1.1, hG * 0.4), 0.02, 0.1, 1 | 4 | 8 | 16 | 32);   // attic window frame
  FD.mat(L.TRIM, 0.03, 0.035, 0.04);
  FD.rect(Lw / 2 - 0.33, Lw / 2 + 0.33, top + hG * 0.22 + 0.1, top + hG * 0.22 + Math.min(1.1, hG * 0.4) - 0.1, 0.105);
  rc(Bf);
}

// tower crown: penthouse box(es) on the roof (code; big towers need big boxes)
export function crown(Bf, P, i, y, hx, hz) {
  const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), hA = P.yEave[i] - P.y0[i];
  const h = Math.min(7, 3 + hA * 0.03), col = P.style[i] === S.TOWER_GLASS ? [0.42, 0.44, 0.46] : [prm(P, i, 3, 0) * 0.9, prm(P, i, 3, 1) * 0.9, prm(P, i, 3, 2) * 0.9];
  obox(Bf, P.ox[i], P.oz[i], c, s, hx * 0.45, hz * 0.45, y, y + h, L.CONCRETE, col, 0);
  obox(Bf, P.ox[i], P.oz[i], c, s, hx * 0.48, hz * 0.48, y + h, y + h + 0.3, L.CONCRETE, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], 0);
  if (TW.crown > 1) obox(Bf, P.ox[i], P.oz[i], c, s, hx * 0.28, hz * 0.28, y + h + 0.3, y + h * 1.6, L.CONCRETE, col, 0);
  rc(Bf);
}

// ------------------------------------------------------------------ rooftop clutter (one deterministic plan -> MID boxes / NEAR kit)
export const CK = ['bulkhead', 'hvac_a', 'hvac_b', 'water_tank', 'skylight', 'chimney', 'vents', 'antenna', 'dish'];
const inside = (ring, x, z) => { let c = false; const n = ring.length / 2; for (let k = 0, j = n - 1; k < n; j = k++) { const zi = ring[k * 2 + 1], zj = ring[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (ring[j * 2] - ring[k * 2]) * (z - zi) / (zj - zi) + ring[k * 2]) c = !c; } return c; };
const SZ = [[1.3, 1.15], [0.95, 0.6], [1.7, 1.0], [1.7, 1.7], [0.85, 0.65], [0.45, 0.35], [0.5, 0.6], [1.2, 0.4], [0.45, 0.6]];
// -> [kind, x, z, yaw, sy] (world x / z, yaw incl. the OBB yaw, sy = vertical scale)
export function clutterPlan(P, i, ring, out = []) {
  out.length = 0;
  const st = P.style[i], area = P.area[i], pt = P.pitched[i], zone = P.zone[i];
  if ((P.flags[i] & 32) || area < 25 || pt >= 8 || hasSaw(P, i)) return out;
  let sd = 11; const r = () => h01(i, sd++);
  const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), a = P.ohx[i], b = P.ohz[i], yaw0 = P.oyaw[i];
  const W = (lx, lz) => [P.ox[i] + c * lx + s * lz, P.oz[i] - s * lx + c * lz];
  const add = (k, lx, lz, yaw, sy = 1) => {
    const [x, z] = W(lx, lz), [hx, hz] = SZ[k], cc = Math.abs(Math.cos(yaw)), ss = Math.abs(Math.sin(yaw));
    const ex = hx * cc + hz * ss, ez = hx * ss + hz * cc;
    if (Math.abs(lx) + ex > a - 0.3 || Math.abs(lz) + ez > b - 0.3) return false;
    if (ring && !inside(ring, x, z)) return false;
    out.push([k, x, z, yaw0 + yaw, sy]); return true;
  };
  if (isHouse(st)) {
    const nch = st === S.VICTORIAN ? (r() < 0.9 ? (r() < 0.4 ? 2 : 1) : 0) : st === S.EDWARDIAN ? (r() < 0.65 ? 1 : 0) : (r() < 0.3 ? 1 : 0);
    const long = a >= b, L1 = long ? a : b, L2 = long ? b : a;
    for (let k = 0; k < nch; k++) {
      const t = (k === 0 ? 0.45 : -0.3) * L1, side = r() < 0.5 ? -1 : 1, w = side * Math.max(0, L2 - 0.6);
      const sy = pt ? Math.max(1, (P.yTop[i] - P.yEave[i] + 0.9) / 1.6) : 1;
      if (long) add(5, t, pt ? 0 : w, 0, sy); else add(5, pt ? 0 : w, t, Math.PI / 2, sy);
    }
    if (!pt) {
      if (area > 60 && r() < 0.28) add(4, (r() - 0.5) * a, (r() - 0.5) * b, 0);
      if (r() < 0.35) add(6, (r() - 0.5) * a * 1.2, (r() - 0.5) * b * 1.2, r() * 6.28);
      if (r() < 0.14) add(8, (r() - 0.5) * a * 1.4, (r() - 0.5) * b * 1.4, r() * 6.28);
    }
    return out;
  }
  if (pt || area < 110) return out;
  const hA = P.yEave[i] - P.y0[i];
  if (hA >= 35) {
    for (const q of [-0.6, 0.6]) if (r() < 0.7) add(2, q * a, (r() - 0.5) * b * 0.4, 0);
    if (r() < 0.35) add(7, (r() - 0.5) * a, (r() - 0.5) * b, r() * 6.28);
    return out;
  }
  // slots on a 3x3 grid over the OBB, shuffled
  const slots = [];
  for (let gz = -1; gz <= 1; gz++) for (let gx = -1; gx <= 1; gx++) slots.push([gx * a * 0.55, gz * b * 0.55]);
  for (let k = slots.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = slots[k]; slots[k] = slots[j]; slots[j] = t; }
  let si = 0;
  const put = (k, yaw = 0) => { while (si < slots.length) { const [lx, lz] = slots[si++]; if (add(k, lx, lz, yaw)) return; } };
  const tankZ = zone === Z.SOMA || zone === Z.TENDERLOIN || zone === Z.CHINATOWN || zone === Z.NORTHBEACH || zone === Z.DOWNTOWN || zone === Z.CIVIC || zone === Z.NOBHILL;
  if (area > 220 && r() < 0.75) put(0, Math.floor(r() * 4) * Math.PI / 2);
  if ((st === S.APARTMENT || st === S.LOFT || st === S.COMMERCIAL || st === S.CHINATOWN) && tankZ && area > 260 && r() < 0.4) put(3);
  if (r() < 0.65) put(1, Math.floor(r() * 2) * Math.PI / 2);
  if (area > 600 && r() < 0.6) put(2, Math.floor(r() * 2) * Math.PI / 2);
  if (area > 400 && r() < 0.4) put(1, Math.PI / 2);
  if (r() < 0.5) put(6, r() * 6.28);
  if (area < 700 && r() < 0.3) put(4);
  if (r() < 0.22) put(7, r() * 6.28);
  if (r() < 0.25) put(8, r() * 6.28);
  return out;
}
// MID stand-ins (flagged KITLOD: collapsed when the NEAR kit shows the real piece)
export function clutterMid(Bf, P, i, plan, y) {
  for (const [k, x, z, yaw, sy] of plan) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    switch (k) {
      case 0: obox(Bf, x, z, c, s, 1.3, 1.15, y, y + 2.7, L.STUCCO, [0.8, 0.78, 0.74], KITLOD); obox(Bf, x, z, c, s, 1.42, 1.27, y + 2.7, y + 2.86, L.METAL, [0.55, 0.57, 0.58], KITLOD); break;
      case 1: obox(Bf, x, z, c, s, 0.9, 0.55, y, y + 1.05, L.METAL, [0.66, 0.67, 0.65], KITLOD); break;
      case 2: obox(Bf, x, z, c, s, 1.6, 0.95, y, y + 1.35, L.METAL, [0.66, 0.67, 0.65], KITLOD); break;
      case 3: obox(Bf, x, z, c, s, 1.1, 1.1, y, y + 2.5, L.METAL, [0.1, 0.1, 0.1], KITLOD); tank(Bf, x, z, y); break;
      case 4: obox(Bf, x, z, c, s, 0.85, 0.65, y, y + 0.55, L.METAL, [0.1, 0.12, 0.14], KITLOD); break;
      case 5: obox(Bf, x, z, c, s, 0.38, 0.26, y - 1, y + 1.55 * sy, L.BRICK, [1, 1, 1], KITLOD); break;
      default: break;
    }
  }
  rc(Bf);
}
function tank(Bf, cx, cz, y) {
  const rr = 1.6, y1 = y + 2.6, y2 = y1 + 3.2, SEG = 10;
  sc(Bf, L.WOOD, [0.55, 0.42, 0.3], KITLOD);
  for (let j = 0; j < SEG; j++) {
    const p0 = j / SEG * Math.PI * 2, p1 = (j + 1) / SEG * Math.PI * 2, c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1);
    qW(Bf, [cx + c0 * rr, y1, cz + s0 * rr], [cx + c1 * rr, y1, cz + s1 * rr], [cx + c1 * rr, y2, cz + s1 * rr], [cx + c0 * rr, y2, cz + s0 * rr], c0 + c1, 0, s0 + s1, L.WOOD);
    qW(Bf, [cx + c0 * rr, y2, cz + s0 * rr], [cx + c1 * rr, y2, cz + s1 * rr], [cx + c1 * 0.05, y2 + 1.0, cz + s1 * 0.05], [cx + c0 * 0.05, y2 + 1.0, cz + s0 * 0.05], c0 + c1, 1.5, s0 + s1, L.WOOD);
  }
}
// NEAR kit pieces for the plan
export function clutterKit(kb, plan, y) {
  for (const [k, x, z, yaw, sy] of plan) kb.roof(CK[k], x, y, z, yaw, 1, sy, 1);
}

// ------------------------------------------------------------------ NEAR kit on one street-facing wall
const FK = new Frame(null);
export function nearKitWall(kb, P, i, w) {
  const st = P.style[i], fl = P.flags[i], y0 = P.y0[i], top = P.yEave[i] - y0, Lw = w.len;
  FK.set(w.ax, y0, w.az, w.bx - w.ax, w.bz - w.az);
  const trim = [prm(P, i, 4, 0) * 1.25, prm(P, i, 4, 1) * 1.25, prm(P, i, 4, 2) * 1.25];
  const ck = corniceKind(P, i), tw = towerInfo(P, i);
  if ((ck === 1 || ck === 2) && !tw.ySet) {
    const [cp, ch] = cornDims(P, i), n = Math.max(1, Math.round((Lw + 0.1) / 2.0)), sl = (Lw + 0.1) / n;
    const k = ch / 0.68, kd = cp / 0.56;
    for (let s = 0; s < n; s++) kb.wall(ck === 1 ? 'cornice' : 'cornice_brick', FK, -0.05 + (s + 0.5) * sl, top - ch, 0, sl / 2, k * (ck === 1 ? 1 : 1.3), kd, ck === 1 ? trim : WHITE);
    if (ck === 1 && (st === S.VICTORIAN || st === S.EDWARDIAN || st === S.COMMERCIAL || st === S.CHINATOWN)) {
      const nbk = Math.max(2, Math.round(Lw / 2.4)), kb2 = Math.max(0.55, Math.min(1.1, ch / 0.55));
      for (let q = 0; q <= nbk; q++) kb.wall('bracket', FK, 0.12 + (Lw - 0.24) * q / nbk, top - ch, 0, kb2, kb2, kb2 * Math.min(1, cp / 0.5), trim);
    }
  }
  // fire escape on the widest front
  const floors = prm(P, i, 9, 1);
  if ((fl & 4) && floors >= 2 && w.main) {
    const fh = prm(P, i, 0, 0), gH = prm(P, i, 0, 1), margin = prm(P, i, 0, 3), [nb, cw] = grid1(Lw, margin, prm(P, i, 9, 0));
    if (nb >= 2) {
      const c0 = Math.max(0, Math.floor(nb / 2) - 1), u0 = margin + c0 * cw + 0.1, u1 = margin + Math.min(nb, c0 + 2) * cw - 0.1;
      const um = (u0 + u1) / 2, sx = (u1 - u0) / 3.0;
      for (let r = 1; r <= floors; r++) {
        const v = gH + (r - 1) * fh + 0.02;
        if (v > top - prm(P, i, 6, 3) - 1) break;
        const last = r === floors || gH + r * fh + 0.02 > top - prm(P, i, 6, 3) - 1;
        kb.wall(last ? 'fire_escape_top' : 'fire_escape', FK, um, v, 0, sx, last ? 1 : fh / 3.0, 1, WHITE);
      }
    }
  }
}
