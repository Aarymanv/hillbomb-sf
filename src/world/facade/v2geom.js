// Buildings v2 geometry: footprint utilities (closed Douglas-Peucker, party-wall raster) and the emitters for the three
// LOD tiers of the real OSM city. Everything writes MeshBuf vertices for the shared facade material (material.js):
// walls are procedural facade quads (u along the wall = shader tangent, v above the building's y0, per-wall window grid),
// roofs / trims / near details are textured SURF surfaces.
import { Earcut } from 'three/src/extras/Earcut.js';
import { Frame } from './emit.js';
import { M } from './material.js';
import { L, TILE } from './layers.js';
import { procRect } from './far.js';
import { S, GT } from './plan.js';
import { prm, FRONT, Z } from './v2plan.js';
import { NOV5 } from './v2lots.js';
import { bayCells, corniceKind, towerInfo } from './v2detail.js';

// ------------------------------------------------------------------ closed Douglas-Peucker (returns kept vertex indices, in order)
const _keep = new Uint8Array(4096);
export function simplify(ring, n, tol, out) {
  out.length = 0;
  if (n <= 4 || n > 4096) { for (let k = 0; k < n; k++) out.push(k); return out; }
  _keep.fill(0, 0, n);
  let far = 0, fd = -1;
  for (let k = 1; k < n; k++) { const d = (ring[k * 2] - ring[0]) ** 2 + (ring[k * 2 + 1] - ring[1]) ** 2; if (d > fd) { fd = d; far = k; } }
  _keep[0] = 1; _keep[far] = 1;
  const t2 = tol * tol;
  const stack = [0, far, far, n];
  while (stack.length) {
    const e = stack.pop(), s = stack.pop();
    if (e - s < 2) continue;
    const ax = ring[s * 2], az = ring[s * 2 + 1], bi = (e % n) * 2, bx = ring[bi], bz = ring[bi + 1];
    const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz || 1e-9;
    let md = -1, mk = -1;
    for (let k = s + 1; k < e; k++) {
      const px = ring[k * 2] - ax, pz = ring[k * 2 + 1] - az, cr = px * dz - pz * dx, d = cr * cr / ll;
      if (d > md) { md = d; mk = k; }
    }
    if (md > t2) { _keep[mk] = 1; stack.push(s, mk, mk, e); }
  }
  for (let k = 0; k < n; k++) if (_keep[k]) out.push(k);
  if (out.length < 3) { out.length = 0; for (let k = 0; k < n; k++) out.push(k); }
  return out;
}

// per-wall window grid: returns nb (0 = blank) and writes cw into g[0]
export function grid(len, margin, bay, g) {
  const w = len - 2 * margin;
  if (w < 1.2) { g[0] = 1; return 0; }
  const nb = Math.max(1, Math.round(w / bay));
  g[0] = w / nb; return nb;
}

// ------------------------------------------------------------------ walls
// procedural wall between a and b with outward normal (nx, nz); u runs along the shader tangent (nz, -nx)
export function wall(Bf, ax, az, bx, bz, nx, nz, y0, ya, yb, mode, cw, nb) {
  if ((bx - ax) * nz - (bz - az) * nx < 0) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; }
  const len = Math.hypot(bx - ax, bz - az);
  Bf.sk = mode; Bf.sz = cw; Bf.sw = nb;
  const va = ya - y0, vb = yb - y0;
  const a = Bf.v(ax, ya, az, nx, 0, nz, 0, va), b = Bf.v(bx, ya, bz, nx, 0, nz, len, va);
  const c = Bf.v(bx, yb, bz, nx, 0, nz, len, vb), d = Bf.v(ax, yb, az, nx, 0, nz, 0, vb);
  Bf.quad(a, b, c, d);
  Bf.sz = 0; Bf.sw = 0;
}
export function surf(Bf, layer, c, ao = 1) {
  Bf.sk = M.SURF + 32 * layer; Bf.sz = -1e5; Bf.sw = 0;
  Bf.sc[0] = Math.min(255, c[0] * 255); Bf.sc[1] = Math.min(255, c[1] * 255); Bf.sc[2] = Math.min(255, c[2] * 255); Bf.sc[3] = ao * 255;
}
function resetC(Bf) { Bf.sc[0] = Bf.sc[1] = Bf.sc[2] = Bf.sc[3] = 255; }

// flat roof over the (simplified) ring at height y
const _flat = [];
export function flatRoof(Bf, ring, idx, y, layer, col) {
  const n = idx.length; if (n < 3) return;
  _flat.length = n * 2;
  for (let k = 0; k < n; k++) { _flat[k * 2] = ring[idx[k] * 2]; _flat[k * 2 + 1] = ring[idx[k] * 2 + 1]; }
  const tris = n === 4 ? QUAD : Earcut.triangulate(_flat, null, 2);
  surf(Bf, layer, col);
  const inv = 1 / TILE[layer], base = Bf.n;
  for (let k = 0; k < n; k++) { const x = _flat[k * 2], z = _flat[k * 2 + 1]; Bf.v(x, y, z, 0, 1, 0, x * inv, z * inv); }
  for (let t = 0; t < tris.length; t += 3) {
    const p = tris[t], q = tris[t + 1], r = tris[t + 2];
    const cy = (_flat[q * 2 + 1] - _flat[p * 2 + 1]) * (_flat[r * 2] - _flat[p * 2]) - (_flat[q * 2] - _flat[p * 2]) * (_flat[r * 2 + 1] - _flat[p * 2 + 1]);
    if (cy >= 0) Bf.tri(base + p, base + q, base + r); else Bf.tri(base + p, base + r, base + q);
  }
  resetC(Bf);
}
const QUAD = [0, 1, 2, 0, 2, 3];

// triangle / quad with an explicit wanted normal direction (flips winding to match)
function triW(Bf, p, q, r, wx, wy, wz, inv, uax, uaz) {
  const ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = r[0] - p[0], by = r[1] - p[1], bz = r[2] - p[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const flip = nx * wx + ny * wy + nz * wz < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const uv = (P) => { const u = (P[0] * uax + P[2] * uaz) * inv; const w = Math.abs(ny) > 0.5 ? (-P[0] * uaz + P[2] * uax) * inv : P[1] * inv; return [u, w]; };
  const U = [uv(p), uv(q), uv(r)];
  const i0 = Bf.v(p[0], p[1], p[2], nx, ny, nz, U[0][0], U[0][1]), i1 = Bf.v(q[0], q[1], q[2], nx, ny, nz, U[1][0], U[1][1]), i2 = Bf.v(r[0], r[1], r[2], nx, ny, nz, U[2][0], U[2][1]);
  if (flip) Bf.tri(i0, i2, i1); else Bf.tri(i0, i1, i2);
}
function quadW(Bf, p, q, r, s, wx, wy, wz, inv, uax, uaz) { triW(Bf, p, q, r, wx, wy, wz, inv, uax, uaz); triW(Bf, p, r, s, wx, wy, wz, inv, uax, uaz); }

// pitched roof on the oriented box (gabled 1, hipped 2, pyramidal 3, skillion 5) or a dome (>= 8)
export function pitchedRoof(Bf, P, i, shape, wallC, wallLayer) {
  const cy = Math.cos(P.oyaw[i]), sy = Math.sin(P.oyaw[i]);
  // local X = (cy, -sy), local Z = (sy, cy)
  let ax = cy, az = -sy, bx = sy, bz = cy, a = P.ohx[i], b = P.ohz[i];
  if (b > a) { ax = sy; az = cy; bx = -cy; bz = sy; const t = a; a = b; b = t; }   // ridge along the long axis
  const ox = P.ox[i], oz = P.oz[i], E = P.yEave[i], R = P.yTop[i];
  const lc = [P.roofC[i * 3], P.roofC[i * 3 + 1], P.roofC[i * 3 + 2]], layer = P.roofL[i];
  const inv = 1 / TILE[layer];
  const W = (s, t, y) => [ox + ax * s + bx * t, y, oz + az * s + bz * t];
  if (shape >= 8) {
    // dome over the box centre
    surf(Bf, L.METAL, [0.55, 0.6, 0.58]);
    const rr = Math.min(a, b) * 0.95, hh = Math.max(1, R - E), SEG = 12, RING = 4;
    for (let k = 0; k < RING; k++) for (let j = 0; j < SEG; j++) {
      const t0 = k / RING * Math.PI / 2, t1 = (k + 1) / RING * Math.PI / 2, p0 = j / SEG * Math.PI * 2, p1 = (j + 1) / SEG * Math.PI * 2;
      const pt = (t, p) => [ox + Math.cos(p) * Math.cos(t) * rr, E + Math.sin(t) * hh, oz + Math.sin(p) * Math.cos(t) * rr];
      const A = pt(t0, p0), Bq = pt(t0, p1), C = pt(t1, p1), D = pt(t1, p0);
      const mx = (A[0] + C[0]) / 2 - ox, mz = (A[2] + C[2]) / 2 - oz;
      if (k === RING - 1) triW(Bf, A, Bq, C, mx, 1, mz, inv, 1, 0); else quadW(Bf, A, Bq, C, D, mx, 1, mz, inv, 1, 0);
    }
    resetC(Bf); return;
  }
  // (v5) real eaves: the roof planes carry on past the walls (0.35-0.75 m by style) and drop with the pitch; a trim
  // soffit under every overhang (the same planes flipped, 12 cm lower) and a fascia board along the eave edges, so the
  // roof reads as a lid with a shadow line under it, not a cap glued onto a box
  const st = P.style[i], q5 = (((i * 2654435761) >>> 0) % 997) / 997;
  const ov = NOV5 ? 0.35 : st === S.STUCCO ? 0.3 + 0.15 * q5 : st === S.VICTORIAN ? 0.45 + 0.2 * q5 : 0.5 + 0.3 * q5;
  const ovr = NOV5 ? 0.25 : Math.min(ov, 0.55);                  // rakes (gable ends) overhang a little less
  const pitch = (R - E) / Math.max(b, 0.5), Ee = E - ov * pitch, oa = a + ovr, ob = b + ov;
  const tcol = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)], TH = 0.12;
  const planes = [];       // roof quads / tris (world points) + their up-normal hint
  if (shape === 1) {
    planes.push([[W(-oa, -ob, Ee), W(oa, -ob, Ee), W(oa, 0, R), W(-oa, 0, R)], -bx, -bz]);
    planes.push([[W(oa, ob, Ee), W(-oa, ob, Ee), W(-oa, 0, R), W(oa, 0, R)], bx, bz]);
  } else if (shape === 2 || shape === 3) {
    const rl = shape === 3 ? 0 : Math.max(0, a - b), oa2 = a + ov;
    planes.push([[W(-oa2, -ob, Ee), W(oa2, -ob, Ee), W(rl, 0, R), W(-rl, 0, R)], -bx, -bz]);
    planes.push([[W(oa2, ob, Ee), W(-oa2, ob, Ee), W(-rl, 0, R), W(rl, 0, R)], bx, bz]);
    planes.push([[W(oa2, -ob, Ee), W(oa2, ob, Ee), W(rl, 0, R)], ax, az]);
    planes.push([[W(-oa2, ob, Ee), W(-oa2, -ob, Ee), W(-rl, 0, R)], -ax, -az]);
  } else {
    // skillion: high side at -b
    const Rh = R + ov * (R - E) / Math.max(2 * b, 1), El = E - ov * (R - E) / Math.max(2 * b, 1);
    planes.push([[W(-oa, -ob, Rh), W(oa, -ob, Rh), W(oa, ob, El), W(-oa, ob, El)], bx, bz]);
  }
  surf(Bf, layer, lc);
  for (const [pts, hx, hz] of planes) {
    if (pts.length === 4) quadW(Bf, pts[0], pts[1], pts[2], pts[3], hx, 1, hz, inv, ax, az);
    else triW(Bf, pts[0], pts[1], pts[2], hx, 1, hz, inv, bx, bz);
  }
  if (!NOV5) {
    // soffits: the planes flipped and lowered (only the overhang band is ever seen from below)
    surf(Bf, L.TRIM, [tcol[0] * 0.92, tcol[1] * 0.92, tcol[2] * 0.92]);
    const ti = 1 / TILE[L.TRIM], dn = (p) => [p[0], p[1] - TH, p[2]];
    for (const [pts] of planes) {
      if (pts.length === 4) quadW(Bf, dn(pts[0]), dn(pts[1]), dn(pts[2]), dn(pts[3]), 0, -1, 0, ti, ax, az);
      else triW(Bf, dn(pts[0]), dn(pts[1]), dn(pts[2]), 0, -1, 0, ti, bx, bz);
    }
    // fascia boards along the eave edges (+ barge boards up the gable rakes)
    surf(Bf, L.TRIM, tcol);
    const fas = (p, q, nx, nz, d = 0.2) => quadW(Bf, [p[0], p[1] - d, p[2]], [q[0], q[1] - d, q[2]], [q[0], q[1] + 0.02, q[2]], [p[0], p[1] + 0.02, p[2]], nx, 0, nz, ti, nz, -nx);
    if (shape === 1) {
      fas(W(-oa, -ob, Ee), W(oa, -ob, Ee), -bx, -bz); fas(W(oa, ob, Ee), W(-oa, ob, Ee), bx, bz);
      for (const sa of [-1, 1]) { fas(W(sa * oa, -ob, Ee), W(sa * oa, 0, R), sa * ax, sa * az, 0.24); fas(W(sa * oa, 0, R), W(sa * oa, ob, Ee), sa * ax, sa * az, 0.24); }
    } else if (shape === 2 || shape === 3) {
      const oa2 = a + ov;
      fas(W(-oa2, -ob, Ee), W(oa2, -ob, Ee), -bx, -bz); fas(W(oa2, ob, Ee), W(-oa2, ob, Ee), bx, bz);
      fas(W(oa2, -ob, Ee), W(oa2, ob, Ee), ax, az); fas(W(-oa2, ob, Ee), W(-oa2, -ob, Ee), -ax, -az);
    }
  }
  if (shape === 1) {
    surf(Bf, wallLayer, wallC);
    const wi = 1 / TILE[wallLayer];
    triW(Bf, W(-a, -b, E), W(-a, b, E), W(-a, 0, R - 0.1), -ax, 0, -az, wi, bx, bz);
    triW(Bf, W(a, -b, E), W(a, b, E), W(a, 0, R - 0.1), ax, 0, az, wi, bx, bz);
  } else if (shape === 5) {
    surf(Bf, wallLayer, wallC);
    const wi = 1 / TILE[wallLayer];
    triW(Bf, W(-a, -b, E), W(-a, b, E), W(-a, -b, R), -ax, 0, -az, wi, bx, bz);
    triW(Bf, W(a, -b, E), W(a, b, E), W(a, -b, R), ax, 0, az, wi, bx, bz);
    quadW(Bf, W(-a, -b, E), W(a, -b, E), W(a, -b, R), W(-a, -b, R), -bx, 0, -bz, wi, ax, az);
  }
  resetC(Bf);
}

// rooftop clutter on flat roofs (bulkhead, water tank, HVAC)
export function roofClutter(Bf, P, i, rnd) {
  const st = P.style[i], area = P.area[i];
  if (area < 220 || P.pitched[i] || st === S.VICTORIAN || st === S.EDWARDIAN || st === S.STUCCO) return;
  const y = P.yEave[i], cy = Math.cos(P.oyaw[i]), sy = Math.sin(P.oyaw[i]);
  const ox = P.ox[i], oz = P.oz[i], hx = P.ohx[i] * 0.55, hz = P.ohz[i] * 0.55;
  const box = (lx, lz, sx, sz, h, c) => {
    const cx = ox + cy * lx + sy * lz, cz = oz - sy * lx + cy * lz;
    const X = [cy * sx, -sy * sx], Zd = [sy * sz, cy * sz];
    const p = (u, w, yy) => [cx + X[0] * u + Zd[0] * w, yy, cz + X[1] * u + Zd[1] * w];
    surf(Bf, L.CONCRETE, c);
    const inv = 1 / TILE[L.CONCRETE];
    quadW(Bf, p(-1, -1, y + h), p(1, -1, y + h), p(1, 1, y + h), p(-1, 1, y + h), 0, 1, 0, inv, 1, 0);
    quadW(Bf, p(-1, -1, y), p(1, -1, y), p(1, -1, y + h), p(-1, -1, y + h), -Zd[0], 0, -Zd[1], inv, X[0] / sx, X[1] / sx);
    quadW(Bf, p(1, 1, y), p(-1, 1, y), p(-1, 1, y + h), p(1, 1, y + h), Zd[0], 0, Zd[1], inv, X[0] / sx, X[1] / sx);
    quadW(Bf, p(1, -1, y), p(1, 1, y), p(1, 1, y + h), p(1, -1, y + h), X[0], 0, X[1], inv, Zd[0] / sz, Zd[1] / sz);
    quadW(Bf, p(-1, 1, y), p(-1, -1, y), p(-1, -1, y + h), p(-1, 1, y + h), -X[0], 0, -X[1], inv, Zd[0] / sz, Zd[1] / sz);
  };
  const r1 = rnd(), r2 = rnd(), r3 = rnd();
  box((r1 - 0.5) * hx, (r2 - 0.5) * hz, 1.3 + r3, 1.2 + r1 * 0.8, 2.6, [0.62, 0.6, 0.57]);                 // stair bulkhead
  if (area > 500) box((0.5 - r1) * hx, (0.5 - r2) * hz, 1.6, 1.0, 1.4, [0.7, 0.7, 0.68]);                 // HVAC
  if ((st === S.LOFT || st === S.APARTMENT) && (P.zone[i] === Z.SOMA || P.zone[i] === Z.TENDERLOIN || P.zone[i] === Z.CHINATOWN) && r3 < 0.35) {
    // wooden water tank on a steel frame
    const cx = ox + cy * (0.3 - r2) * hx, cz = oz - sy * (0.3 - r2) * hx, rr = 1.6, y1 = y + 2.2, y2 = y1 + 3.2;
    surf(Bf, L.WOOD, [0.55, 0.42, 0.3]);
    const inv = 1 / TILE[L.WOOD], SEG = 10;
    for (let j = 0; j < SEG; j++) {
      const p0 = j / SEG * Math.PI * 2, p1 = (j + 1) / SEG * Math.PI * 2, c0 = Math.cos(p0), s0 = Math.sin(p0), c1 = Math.cos(p1), s1 = Math.sin(p1);
      quadW(Bf, [cx + c0 * rr, y1, cz + s0 * rr], [cx + c1 * rr, y1, cz + s1 * rr], [cx + c1 * rr, y2, cz + s1 * rr], [cx + c0 * rr, y2, cz + s0 * rr], c0 + c1, 0, s0 + s1, inv, -s0, c0);
      triW(Bf, [cx + c0 * rr, y2, cz + s0 * rr], [cx + c1 * rr, y2, cz + s1 * rr], [cx, y2 + 1.1, cz], c0 + c1, 1.5, s0 + s1, inv, 1, 0);
    }
    surf(Bf, L.METAL, [0.12, 0.12, 0.12]);
    box((0.3 - r2) * hx, 0, rr * 0.8, rr * 0.8, 2.2, [0.15, 0.15, 0.15]);
  }
  resetC(Bf);
}

// ------------------------------------------------------------------ party-wall raster (1 m, one tile + margin)
export const RC = 1.0, RM = 8;
export class Raster {
  constructor(T = 512) { this.n = Math.ceil((T + 2 * RM) / RC); this.a = new Int32Array(this.n * this.n); this.xs = []; }
  begin(x0, z0) { this.x0 = x0 - RM; this.z0 = z0 - RM; this.a.fill(0); }
  // even-odd scanline fill of ring (flat world coords) with value id+1
  poly(ring, n, id) {
    const { x0, z0, a, xs } = this, N = this.n;
    let mz = 1e9, Mz = -1e9;
    for (let k = 0; k < n; k++) { const z = ring[k * 2 + 1]; if (z < mz) mz = z; if (z > Mz) Mz = z; }
    const j0 = Math.max(0, Math.ceil((mz - z0) / RC - 0.5)), j1 = Math.min(N - 1, Math.floor((Mz - z0) / RC - 0.5));
    for (let j = j0; j <= j1; j++) {
      const zc = z0 + (j + 0.5) * RC; xs.length = 0;
      for (let k = 0; k < n; k++) {
        const kk = k + 1 === n ? 0 : k + 1, za = ring[k * 2 + 1], zb = ring[kk * 2 + 1];
        if ((za <= zc) !== (zb <= zc)) { const xa = ring[k * 2], xb = ring[kk * 2]; xs.push(xa + (zc - za) * (xb - xa) / (zb - za)); }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      const row = j * N;
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - x0) / RC - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[q + 1] - x0) / RC - 0.5));
        for (let i = i0; i <= i1; i++) a[row + i] = id + 1;
      }
    }
  }
  at(x, z) {
    const i = Math.floor((x - this.x0) / RC), j = Math.floor((z - this.z0) / RC);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? 0 : this.a[j * this.n + i];
  }
}

// ------------------------------------------------------------------ near details on one street-facing wall
const F = new Frame(null);
// procedural facet (bay window side) in frame F: from local (ua, da) to (ub, db), u measured along the facet
function procFacet(Bf, ua, da, ub, db, v0, v1, cw) {
  const ex = ub - ua, ed = db - da, len = Math.hypot(ex, ed) || 1;
  let nu = ed / len, nd = -ex / len; if (nd < 0) { nu = -nu; nd = -nd; }
  const wx = F.tx * nu + F.nx * nd, wz = F.tz * nu + F.nz * nd;
  // u must run along the shader tangent (wz, -wx)
  const tu = F.tx * ex + F.nx * ed, tz = F.tz * ex + F.nz * ed;
  if (tu * wz - tz * wx < 0) { let t = ua; ua = ub; ub = t; t = da; da = db; db = t; }
  Bf.sk = M.PROC; Bf.sz = cw; Bf.sw = -1;
  const p = (u, d, v, uu) => Bf.v(F.wx(u, d), F.oy + v, F.wz(u, d), wx, 0, wz, uu, v);
  const a = p(ua, da, v0, 0), b = p(ub, db, v0, len), c = p(ub, db, v1, len), e = p(ua, da, v1, 0);
  Bf.quad(a, b, c, e);
  Bf.sz = 0; Bf.sw = 0;
}

// w = { i, ax, az, bx, bz, nx, nz, len } (a..b ordered along the shader tangent), P = plan, rnd = seeded random
export function nearWall(Bf, P, w, rnd, kit = false) {
  const i = w.i, st = P.style[i], fl = P.flags[i];
  if (fl & 32) return;
  const y0 = P.y0[i], top = P.yEave[i] - y0;
  const fh = prm(P, i, 0, 0), gH = prm(P, i, 0, 1), margin = prm(P, i, 0, 3);
  const lox = prm(P, i, 1, 0), sy = prm(P, i, 1, 1), hix = prm(P, i, 1, 2), wy = prm(P, i, 1, 3);
  const gtype = prm(P, i, 2, 2) % 8, gCell = Math.floor(prm(P, i, 2, 2) / 8);
  const trim = [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)], acc = [prm(P, i, 5, 0), prm(P, i, 5, 1), prm(P, i, 5, 2)];
  const hood = prm(P, i, 8, 3) > 0.5, bay = prm(P, i, 9, 0), floors = prm(P, i, 9, 1), corn = prm(P, i, 6, 3);
  const g = [0];
  const nb = grid(w.len, margin, bay, g), cw = g[0], Lw = w.len;
  F.b = Bf; F.set(w.ax, y0, w.az, w.bx - w.ax, w.bz - w.az);
  const tower = st === S.TOWER_GLASS || st === S.TOWER_STONE;
  // cornice + bays are MID geometry now (v2detail.js midFront); without the Blender kit, code brackets under the cornice
  if (!kit && corniceKind(P, i) === 1 && !towerInfo(P, i).ySet && (st === S.VICTORIAN || st === S.EDWARDIAN || st === S.COMMERCIAL)) {
    F.col(trim, 0, L.TRIM);
    const cp = st === S.VICTORIAN ? 0.55 : 0.4, ch = Math.min(0.6, corn * 0.8);
    const nbk = Math.max(2, Math.round(Lw / 1.6));
    for (let k = 0; k <= nbk; k++) { const u = 0.1 + (Lw - 0.2) * k / nbk; F.box(u - 0.08, u + 0.08, top - ch - 0.45, top - ch, 0, cp * 0.8, 1 | 4 | 8 | 32); }
  }
  if (nb === 0) return;
  const bays = bayCells(P, i, nb, Lw);
  const inBay = (ci) => bays.includes(ci);
  // sills + hoods on the upper floors (low / mid rise only)
  if (!tower && st !== S.OFFICE && floors >= 1 && floors <= 12 && nb <= 16) {
    F.col(trim, 0, L.TRIM);
    const casing = st === S.VICTORIAN || st === S.EDWARDIAN || st === S.CHINATOWN || (st === S.APARTMENT && hood);
    for (let r = 1; r <= floors; r++) {
      const vb = gH + (r - 1) * fh;
      if (vb + wy * fh > top - corn) break;
      for (let ci = 0; ci < nb; ci++) {
        if (inBay(ci)) continue;
        const u0 = margin + ci * cw + lox * cw, u1 = margin + ci * cw + hix * cw;
        F.box(u0 - 0.14, u1 + 0.14, vb + sy * fh - 0.12, vb + sy * fh, 0, 0.13, 1 | 16 | 32);
        if (hood) F.box(u0 - 0.12, u1 + 0.12, vb + wy * fh + 0.09, vb + wy * fh + 0.25, 0, 0.16, 1 | 16 | 32);
        if (casing) { F.box(u0 - 0.13, u0 - 0.02, vb + sy * fh, vb + wy * fh + 0.09, 0, 0.07, 1 | 4 | 8); F.box(u1 + 0.02, u1 + 0.13, vb + sy * fh, vb + wy * fh + 0.09, 0, 0.07, 1 | 4 | 8); }
      }
    }
  }
  // storefront awnings: v2dress (lit undersides + spill)
  // house entry stoop (steps up to the door cell)
  if (gtype === GT.HOUSE && nb >= 2) {
    const ci = gCell === 0 ? 1 : 0, uc = margin + (ci + 0.5) * cw;
    F.col([0.72, 0.7, 0.66], 0, L.CONCRETE);
    for (let k = 0; k < 2; k++) F.box(uc - 0.7, uc + 0.7, -1.2, 0.16 * (k + 1), 0, 1.0 - k * 0.4, 1 | 4 | 8 | 16);
  }
  // fire escape (one per building, on its widest front)
  if (!kit && (fl & 4) && floors >= 2 && nb >= 2 && w.main) {
    const c0 = Math.max(0, Math.floor(nb / 2) - 1), u0 = margin + c0 * cw + 0.1, u1 = margin + Math.min(nb, c0 + 2) * cw - 0.1;
    F.mat(L.METAL, 0.06, 0.06, 0.065);
    for (let r = 1; r <= floors; r++) {
      const v = gH + (r - 1) * fh + 0.02;
      if (v > top - corn - 1) break;
      F.box(u0, u1, v - 0.07, v, 0, 1.1, 63);
      F.box(u0, u1, v + 0.95, v + 1.0, 1.05, 1.1, 1 | 16 | 32);
      F.box(u0, u1, v + 0.45, v + 0.49, 1.06, 1.09, 1 | 16 | 32);
      for (let u = u0; u <= u1 + 0.01; u += (u1 - u0) / Math.max(2, Math.round((u1 - u0) / 1.1))) F.box(u - 0.025, u + 0.025, v, v + 0.95, 1.05, 1.09, 1 | 4 | 8);
      if (r < floors) F.q([u0 + 0.2, v, 0.55], [u0 + 0.8, v, 0.55], [u0 + 0.8 + fh * 0.6, v + fh, 0.55], [u0 + 0.2 + fh * 0.6, v + fh, 0.55]);
    }
  }
  // Chinatown balconies
  if ((fl & 8) && floors >= 1) {
    F.col(trim, 0, L.TRIM);
    for (let r = 1; r <= floors; r++) {
      const v = gH + (r - 1) * fh + 0.05;
      if (v > top - corn - 1) break;
      for (let ci = 0; ci < nb; ci++) {
        if (rnd() > 0.45) continue;
        const u0 = margin + ci * cw + 0.05, u1 = margin + (ci + 1) * cw - 0.05;
        F.box(u0, u1, v - 0.12, v, 0, 0.75, 63);
        F.box(u0, u1, v + 0.9, v + 0.98, 0.68, 0.75, 1 | 16 | 32);
        for (let k = 0; k <= 4; k++) { const u = u0 + 0.03 + (u1 - u0 - 0.06) * k / 4; F.box(u - 0.025, u + 0.025, v, v + 0.9, 0.69, 0.74, 1 | 4 | 8); }
      }
    }
  }
  resetC(Bf);
}
