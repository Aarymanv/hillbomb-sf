// Buildings v5 massing variety ("clean CG boxes" fix, part 2). Pure functions over the plan arrays, run in the build
// workers with v2build.js emitMid (MID geometry, shown at every distance up to the MID range; none of it is replaced by
// the v3 street facades, so the silhouette is the same near and far):
//   - bay forms per building: angled (45 deg), squared, round (Queen Anne), shallow apartment bays; depth varies per
//     building (bayPts is shared by the MID bays and the v3 real bays so both LODs agree)
//   - corner features where two street fronts meet: a round Queen Anne turret (corbelled base above the ground floor,
//     witch's-hat roof) or a chamfered corner (corner-store entry on commercial / apartment corners)
//   - mansard roofs (Second Empire Victorians, some Edwardians / apartments): a steep slate front with dormers over a
//     full attic storey
//   - balconies: full balconies (slab + iron rail or solid stucco parapet) and Juliet rails at upper-floor windows
// ?nov5 (v2lots.js NOV5) switches all of it off.
import { M } from './material.js';
import { L, TILE } from './layers.js';
import { Frame } from './emit.js';
import { S } from './plan.js';
import { prm, Z } from './v2plan.js';
import { NOV5 } from './v2lots.js';

export function h01(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const FM = new Frame(null);
let KF = 0;               // extra aK flags for what is written (none: v5 massing is never LOD-swapped)

// ------------------------------------------------------------------ bays
// one bay form per building (the bays of a facade match); depth per building
export function bayForm(P, i) {
  const st = P.style[i];
  if (NOV5) return { kind: 'legacy', dep: st === S.VICTORIAN ? 0.85 : 0.7 };
  const q = h01(i, 501), qd = h01(i, 502);
  if (st === S.VICTORIAN) return { kind: q < 0.18 ? 'round' : q < 0.3 ? 'square' : 'angled', dep: 0.6 + 0.55 * qd };
  if (st === S.EDWARDIAN) return { kind: q < 0.1 ? 'round' : q < 0.55 ? 'square' : 'angled', dep: 0.5 + 0.5 * qd };
  return { kind: q < 0.5 ? 'shallow' : 'squareS', dep: 0.45 + 0.4 * qd };
}
// bay outline in the wall frame: [[u, d], ...] from (ua, 0) out and back to (ub, 0)
export function bayPts(P, i, ci, ua, ub) {
  const { kind, dep } = bayForm(P, i), w = ub - ua;
  if (kind === 'legacy') {
    const st = P.style[i], inset = st === S.EDWARDIAN && h01(i, 77 + ci) < 0.5 ? dep * 0.4 : st === S.APARTMENT || st === S.COMMERCIAL ? dep * 0.2 : dep;
    return [[ua, 0], [ua + inset, dep], [ub - inset, dep], [ub, 0]];
  }
  if (kind === 'round') {
    const n = 6, c = (ua + ub) / 2, hw = w / 2, out = [];
    for (let k = 0; k <= n; k++) { const t = Math.PI - k / n * Math.PI; out.push([c + hw * Math.cos(t), Math.max(0, dep * 1.15 * Math.sin(t))]); }
    out[0][1] = 0; out[n][1] = 0;
    return out;
  }
  let inset = kind === 'angled' ? dep : kind === 'shallow' ? dep * 0.35 : kind === 'squareS' ? 0.05 : 0;
  inset = Math.max(0, Math.min(inset, (w - 0.9) / 2));
  return [[ua, 0], [ua + inset, dep], [ub - inset, dep], [ub, 0]];
}
// polyline offset outward by o (miter); the end points slide along the wall
export function offsetPts(pts, o) {
  const n = pts.length, out = [];
  const nrm = (a, b) => { const du = b[0] - a[0], dd = b[1] - a[1], l = Math.hypot(du, dd) || 1; return [-dd / l, du / l]; };
  for (let k = 0; k < n; k++) {
    if (k === 0) { out.push([pts[0][0] - o, 0]); continue; }
    if (k === n - 1) { out.push([pts[k][0] + o, 0]); continue; }
    const a = nrm(pts[k - 1], pts[k]), b = nrm(pts[k], pts[k + 1]);
    let mu = a[0] + b[0], md = a[1] + b[1]; const l = Math.hypot(mu, md) || 1; mu /= l; md /= l;
    const c = Math.max(0.5, mu * a[0] + md * a[1]);
    out.push([pts[k][0] + mu * o / c, pts[k][1] + md * o / c]);
  }
  return out;
}

// ------------------------------------------------------------------ writers
function sc(Bf, layer, c) {
  Bf.sk = M.SURF + 32 * layer + KF; Bf.sz = -1e5; Bf.sw = 0;
  Bf.sc[0] = Math.min(255, c[0] * 255); Bf.sc[1] = Math.min(255, c[1] * 255); Bf.sc[2] = Math.min(255, c[2] * 255); Bf.sc[3] = 255;
}
function rc(Bf) { Bf.sc[0] = Bf.sc[1] = Bf.sc[2] = Bf.sc[3] = 255; Bf.sz = 0; Bf.sw = 0; }
// world quad with a wanted normal (winding fixed), planar uv
function qW(Bf, p, q, r, s, wx, wy, wz, layer) {
  const ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = s[0] - p[0], by = s[1] - p[1], bz = s[2] - p[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const flip = nx * wx + ny * wy + nz * wz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const inv = 1 / TILE[layer], up = Math.abs(ny) > 0.6;
  const tx = up ? 1 : -nz, tz = up ? 0 : nx;
  const V = (P) => Bf.v(P[0], P[1], P[2], nx, ny, nz, (P[0] * tx + P[2] * tz) * inv, (up ? P[2] : P[1]) * inv);
  const a = V(p), b = V(q), c = V(r), d = V(s);
  if (flip) Bf.quad(a, d, c, b); else Bf.quad(a, b, c, d);
}
function tW(Bf, p, q, r, wx, wy, wz, layer) {
  const ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2], bx = r[0] - p[0], by = r[1] - p[1], bz = r[2] - p[2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const flip = nx * wx + ny * wy + nz * wz < 0; if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const inv = 1 / TILE[layer], up = Math.abs(ny) > 0.6, tx = up ? 1 : -nz, tz = up ? 0 : nx;
  const V = (P) => Bf.v(P[0], P[1], P[2], nx, ny, nz, (P[0] * tx + P[2] * tz) * inv, (up ? P[2] : P[1]) * inv);
  const a = V(p), b = V(q), c = V(r);
  if (flip) Bf.tri(a, c, b); else Bf.tri(a, b, c);
}
// procedural facade facet (shader windows, one column) from a to b with outward normal n, v measured above y0
function facet(Bf, ax, az, bx, bz, nx, nz, y0, ya, yb) {
  if ((bx - ax) * nz - (bz - az) * nx < 0) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; }
  const len = Math.hypot(bx - ax, bz - az);
  Bf.sk = M.PROC + KF; Bf.sz = len; Bf.sw = -1;
  const a = Bf.v(ax, ya, az, nx, 0, nz, 0, ya - y0), b = Bf.v(bx, ya, bz, nx, 0, nz, len, ya - y0);
  const c = Bf.v(bx, yb, bz, nx, 0, nz, len, yb - y0), d = Bf.v(ax, yb, az, nx, 0, nz, 0, yb - y0);
  Bf.quad(a, b, c, d);
  Bf.sz = 0; Bf.sw = 0;
}
const colsOf = (P, i) => ({
  wall: [prm(P, i, 3, 0), prm(P, i, 3, 1), prm(P, i, 3, 2)], trim: [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)],
  acc: [prm(P, i, 5, 0), prm(P, i, 5, 1), prm(P, i, 5, 2)], wl: prm(P, i, 9, 2),
  roof: [P.roofC[i * 3], P.roofC[i * 3 + 1], P.roofC[i * 3 + 2]],
});
const SLATE = [[0.16, 0.16, 0.18], [0.2, 0.19, 0.21], [0.13, 0.15, 0.16], [0.24, 0.2, 0.18]];

// ------------------------------------------------------------------ corners (turret / chamfer)
const RESZ5 = new Set([Z.VICTORIAN, Z.CASTRO, Z.MISSION, Z.NOBHILL, Z.NORTHBEACH, Z.TENDERLOIN, Z.MARINA, Z.CIVIC, Z.SOMA]);
// pick one street corner of the simplified polygon (EX, EZ, EF = front flag of edge k = k -> k+1): turret or chamfer.
// A chamfer is applied in place (two vertices replace the corner; the new edge is a street front). -> { kind, ... } | null
export function cornerPlan(P, i, EX, EZ, EF, EG, sgn) {
  if (NOV5) return null;
  const st = P.style[i], zone = P.zone[i], hA = P.yEave[i] - P.y0[i], n = EX.length;
  if (P.flags[i] & 32 || n < 4 || hA < 6) return null;
  const turretOK = (st === S.VICTORIAN && h01(i, 511) < 0.5) || (st === S.EDWARDIAN && h01(i, 511) < 0.14) || (st === S.APARTMENT && RESZ5.has(zone) && hA < 22 && h01(i, 511) < 0.12);
  const chamOK = !turretOK && (st === S.COMMERCIAL || st === S.APARTMENT || st === S.LOFT || st === S.CHINATOWN) && RESZ5.has(zone) && h01(i, 512) < 0.55;
  if (!turretOK && !chamOK) return null;
  let best = -1, bl = 0;
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n, q = (k + 1) % n;
    if (!EF[p] || !EF[k]) continue;
    const e1x = EX[k] - EX[p], e1z = EZ[k] - EZ[p], e2x = EX[q] - EX[k], e2z = EZ[q] - EZ[k];
    const l1 = Math.hypot(e1x, e1z), l2 = Math.hypot(e2x, e2z);
    if (l1 < 4.5 || l2 < 4.5) continue;
    const cr = (e1x * e2z - e1z * e2x) / (l1 * l2), dot = (e1x * e2x + e1z * e2z) / (l1 * l2);
    if (cr * sgn <= 0.75 || Math.abs(dot) > 0.4) continue;      // convex, roughly square
    if (Math.min(l1, l2) > bl) { bl = Math.min(l1, l2); best = k; }
  }
  if (best < 0) return null;
  const k = best, p = (k + n - 1) % n, q = (k + 1) % n;
  const e1x = EX[k] - EX[p], e1z = EZ[k] - EZ[p], e2x = EX[q] - EX[k], e2z = EZ[q] - EZ[k];
  const l1 = Math.hypot(e1x, e1z), l2 = Math.hypot(e2x, e2z);
  // outward normals of the two edges
  const n1x = sgn * e1z / l1, n1z = -sgn * e1x / l1, n2x = sgn * e2z / l2, n2z = -sgn * e2x / l2;
  if (turretOK) {
    let bx = n1x + n2x, bz = n1z + n2z; const bl2 = Math.hypot(bx, bz) || 1; bx /= bl2; bz /= bl2;
    const r = Math.min(1.4 + 0.5 * h01(i, 513), Math.min(l1, l2) * 0.3);
    return { kind: 'turret', x: EX[k] - bx * r * 0.45, z: EZ[k] - bz * r * 0.45, r, k };
  }
  const c = Math.min(1.9 + 0.7 * h01(i, 514), Math.min(l1, l2) * 0.3);
  const ax = EX[k] - e1x / l1 * c, az = EZ[k] - e1z / l1 * c, bx = EX[k] + e2x / l2 * c, bz = EZ[k] + e2z / l2 * c;
  const g = EG[k];
  EX.splice(k, 1, ax, bx); EZ.splice(k, 1, az, bz); EF.splice(k, 0, 1); EG.splice(k, 1, g, g);
  return { kind: 'chamfer', k };
}
// round corner turret: corbelled base above the ground floor, procedural window facets, witch's-hat roof + finial
export function turret(Bf, P, i, T) {
  const y0 = P.y0[i], gH = prm(P, i, 0, 1), C = colsOf(P, i), r = T.r, SEG = 12;
  const vb = y0 + Math.max(2.6, gH), vt = P.yEave[i] + 0.35 + 0.6 * h01(i, 515), hr = r * (1.9 + 0.8 * h01(i, 516));
  const P2 = (a, rr, y) => [T.x + Math.cos(a) * rr, y, T.z + Math.sin(a) * rr];
  for (let s = 0; s < SEG; s++) {
    const a0 = s / SEG * Math.PI * 2, a1 = (s + 1) / SEG * Math.PI * 2, am = (a0 + a1) / 2;
    const nx = Math.cos(am), nz = Math.sin(am);
    const A = P2(a0, r, 0), B = P2(a1, r, 0);
    facet(Bf, A[0], A[2], B[0], B[2], nx, nz, y0, vb, vt);
    // corbel (tapered base) + a moulded band at the bottom of the walls and a frieze under the roof
    sc(Bf, L.TRIM, C.trim);
    qW(Bf, P2(a0, r * 0.35, vb - 0.9), P2(a1, r * 0.35, vb - 0.9), P2(a1, r + 0.06, vb), P2(a0, r + 0.06, vb), nx, -0.6, nz, L.TRIM);
    qW(Bf, P2(a0, r + 0.08, vb), P2(a1, r + 0.08, vb), P2(a1, r + 0.08, vb + 0.22), P2(a0, r + 0.08, vb + 0.22), nx, 0, nz, L.TRIM);
    qW(Bf, P2(a0, r + 0.06, vt - 0.45), P2(a1, r + 0.06, vt - 0.45), P2(a1, r + 0.06, vt), P2(a0, r + 0.06, vt), nx, 0, nz, L.TRIM);
    qW(Bf, P2(a0, r + 0.06, vb + 0.22), P2(a1, r + 0.06, vb + 0.22), P2(a1, r, vb + 0.22), P2(a0, r, vb + 0.22), 0, 1, 0, L.TRIM);
    // roof: soffit ring, fascia, cone
    qW(Bf, P2(a0, r, vt), P2(a1, r, vt), P2(a1, r + 0.32, vt), P2(a0, r + 0.32, vt), 0, -1, 0, L.TRIM);
    qW(Bf, P2(a0, r + 0.32, vt), P2(a1, r + 0.32, vt), P2(a1, r + 0.32, vt + 0.14), P2(a0, r + 0.32, vt + 0.14), nx, 0, nz, L.TRIM);
    sc(Bf, L.ROOF_SHINGLE, SLATE[Math.floor(h01(i, 517) * 4)]);
    tW(Bf, P2(a0, r + 0.32, vt + 0.14), P2(a1, r + 0.32, vt + 0.14), [T.x, vt + 0.14 + hr, T.z], nx, 0.5, nz, L.ROOF_SHINGLE);
  }
  // finial
  sc(Bf, L.METAL, [0.3, 0.28, 0.24]);
  const ft = vt + 0.14 + hr;
  for (let s = 0; s < 4; s++) { const a0 = s * Math.PI / 2, a1 = a0 + Math.PI / 2; qW(Bf, P2(a0, 0.05, ft - 0.1), P2(a1, 0.05, ft - 0.1), P2(a1, 0.03, ft + 0.9), P2(a0, 0.03, ft + 0.9), Math.cos(a0 + 0.78), 0, Math.sin(a0 + 0.78), L.METAL); }
  rc(Bf);
}

// ------------------------------------------------------------------ mansard roofs
export function mansardOf(P, i) {
  if (NOV5 || P.pitched[i] || (P.flags[i] & (32 | 64))) return false;
  const st = P.style[i], zone = P.zone[i], hA = P.yEave[i] - P.y0[i], q = h01(i, 521);
  if (hA < 6 || hA > 24) return false;
  if (st === S.VICTORIAN) return q < 0.13;
  if (st === S.EDWARDIAN) return q < 0.08;
  if (st === S.APARTMENT) return (zone === Z.NOBHILL || zone === Z.VICTORIAN || zone === Z.MARINA || zone === Z.TENDERLOIN) && q < 0.14;
  if (st === S.COMMERCIAL) return q < 0.05;
  return false;
}
// steep slate front over a full attic storey behind the main street wall (a..b along the shader tangent), dormers
export function mansard(Bf, P, i, ax, az, bx, bz, Lw) {
  if (Lw < 4 || Lw > 40) return;
  const y0 = P.y0[i], top = P.yEave[i] - y0, C = colsOf(P, i);
  FM.b = Bf; FM.set(ax, y0, az, bx - ax, bz - az);
  const H = 2.6 + 0.5 * h01(i, 522), sd = 0.85 + 0.25 * h01(i, 523), D = Math.max(3.5, Math.min(11, P.area[i] / Lw * 0.85)), e = top + 0.02;
  const slate = SLATE[Math.floor(h01(i, 524) * 4)], wl = C.wl;
  FM.mat(L.ROOF_SHINGLE, slate[0], slate[1], slate[2], KF);
  FM.q([0, e, 0.12], [Lw, e, 0.12], [Lw, e + H, -sd], [0, e + H, -sd]);                       // front slope
  FM.q([0, e + H, -sd], [Lw, e + H, -sd], [Lw, e + H, -D], [0, e + H, -D]);                  // flat deck
  FM.q([0, e, -D], [0, e, 0.12], [0, e + H, -sd], [0, e + H, -D]);                            // side cheeks (slate)
  FM.q([Lw, e, 0.12], [Lw, e, -D], [Lw, e + H, -D], [Lw, e + H, -sd]);
  FM.mat(wl, C.wall[0] * 0.9, C.wall[1] * 0.9, C.wall[2] * 0.9, KF);
  FM.q([Lw, e, -D], [0, e, -D], [0, e + H, -D], [Lw, e + H, -D]);                            // back wall
  // cresting rail along the top edge + a moulded curb at the foot
  FM.mat(L.TRIM, C.trim[0], C.trim[1], C.trim[2], KF);
  FM.box(-0.05, Lw + 0.05, e + H - 0.06, e + H + 0.1, -sd - 0.06, -sd + 0.08, 1 | 4 | 8 | 16);
  FM.box(-0.08, Lw + 0.08, e - 0.05, e + 0.16, 0, 0.2, 1 | 4 | 8 | 16);
  // dormers on the window grid (every cell up to 4 cells, else every other)
  const margin = prm(P, i, 0, 3), bay = prm(P, i, 9, 0), w = Lw - 2 * margin;
  const nb = w < 1.2 ? 0 : Math.max(1, Math.round(w / bay)), cw = nb ? w / nb : 0, every = nb > 4 ? 2 : 1;
  const dw = Math.min(1.25, cw * 0.62), dv0 = e + 0.35, dv1 = e + H - 0.3, ped = P.style[i] === S.VICTORIAN || h01(i, 525) < 0.4;
  for (let c = (nb > 4 ? 1 : 0); c < nb; c += every) {
    const cu = margin + (c + 0.5) * cw, u0 = cu - dw / 2, u1 = cu + dw / 2, fd = 0.12 - (dv0 - e) / H * (0.12 + sd) + 0.08;
    FM.mat(L.TRIM, C.trim[0], C.trim[1], C.trim[2], KF);
    FM.box(u0 - 0.12, u1 + 0.12, dv0, dv1, -sd - 0.5, fd, 1 | 4 | 8);
    FM.mat(L.TRIM, 0.035, 0.04, 0.05, KF);
    FM.rect(u0 + 0.06, u1 - 0.06, dv0 + 0.12, dv1 - 0.18, fd + 0.005);
    FM.mat(L.TRIM, C.trim[0], C.trim[1], C.trim[2], KF);
    FM.box(u0 + 0.06, u1 - 0.06, (dv0 + dv1) / 2 - 0.03, (dv0 + dv1) / 2 + 0.03, fd, fd + 0.03, 1 | 16 | 32);
    FM.mat(L.ROOF_SHINGLE, slate[0], slate[1], slate[2], KF);
    if (ped) {
      const pm = (u0 + u1) / 2, ph = 0.42;
      FM.q([u0 - 0.2, dv1, fd + 0.1], [pm, dv1 + ph, fd + 0.1], [pm, dv1 + ph, -sd - 0.5], [u0 - 0.2, dv1, -sd - 0.5]);
      FM.q([pm, dv1 + ph, fd + 0.1], [u1 + 0.2, dv1, fd + 0.1], [u1 + 0.2, dv1, -sd - 0.5], [pm, dv1 + ph, -sd - 0.5]);
      FM.mat(L.TRIM, C.trim[0], C.trim[1], C.trim[2], KF);
      FM.tri([u0 - 0.12, dv1, fd], [u1 + 0.12, dv1, fd], [pm, dv1 + ph - 0.05, fd]);
    } else FM.box(u0 - 0.2, u1 + 0.2, dv1, dv1 + 0.12, -sd - 0.5, fd + 0.1, 63);
  }
  rc(Bf);
}

// ------------------------------------------------------------------ balconies
// -> [{ ci0, ci1, row, kind: 0 full iron / 1 full solid / 2 juliet }] on the main front (cells of the wall's window grid)
export function balconyPlan(P, i, nb, bays) {
  const out = [];
  if (NOV5 || nb < 1) return out;
  const st = P.style[i], zone = P.zone[i], floors = prm(P, i, 9, 1), wl = prm(P, i, 9, 2), q = h01(i, 531);
  if (floors < 1 || (P.flags[i] & 32)) return out;
  const free = (c) => !bays.includes(c);
  const stuccoW = wl === L.STUCCO;
  if (st === S.APARTMENT && stuccoW && (zone === Z.MARINA || zone === Z.AVENUES || zone === Z.SOMA || zone === Z.MISSION || zone === Z.CIVIC) && q < 0.35) {
    // stacked balconies (mid-century / modern apartments): a column pair on every upper floor
    const solid = h01(i, 532) < 0.55;
    for (let c = nb > 3 ? 1 : 0; c + 1 < nb; c += 3) if (free(c) && free(c + 1)) for (let r = 1; r <= Math.min(floors, 8); r++) out.push({ ci0: c, ci1: c + 1, row: r, kind: solid ? 1 : 0 });
    return out;
  }
  if ((st === S.EDWARDIAN || st === S.STUCCO || (st === S.APARTMENT && floors <= 4)) && q < 0.22) {
    // one full balcony on the top floor (over the garage on houses)
    const r = Math.max(1, floors), c0 = nb >= 3 ? 1 : 0, c1 = Math.min(nb - 1, c0 + (nb >= 4 ? 1 : 0));
    let ok = true; for (let c = c0; c <= c1; c++) if (!free(c)) ok = false;
    if (ok) out.push({ ci0: c0, ci1: c1, row: r, kind: st === S.STUCCO && h01(i, 533) < 0.5 ? 1 : 0 });
    return out;
  }
  if ((st === S.VICTORIAN || st === S.EDWARDIAN || st === S.COMMERCIAL || st === S.APARTMENT || st === S.CHINATOWN) && q < 0.45) {
    // Juliet rails at a few upper-floor windows
    for (let r = 1; r <= Math.min(floors, 6); r++) for (let c = 0; c < nb; c++) if (free(c) && h01(i * 31 + c, 534 + r) < 0.3) out.push({ ci0: c, ci1: c, row: r, kind: 2 });
  }
  return out;
}
// MID geometry of the plan on one wall (a..b along the shader tangent)
export function balconies(Bf, P, i, ax, az, bx, bz, Lw, plan, nb, cw) {
  if (!plan.length) return;
  const y0 = P.y0[i], top = P.yEave[i] - y0, C = colsOf(P, i), fh = prm(P, i, 0, 0), gH = prm(P, i, 0, 1), margin = prm(P, i, 0, 3);
  const sil = prm(P, i, 1, 1);
  FM.b = Bf; FM.set(ax, y0, az, bx - ax, bz - az);
  const iron = [0.05, 0.05, 0.055], dep = 0.9 + 0.35 * h01(i, 536);
  for (const b of plan) {
    const v = gH + (b.row - 1) * fh;
    if (v + 1.1 > top - 0.3) continue;
    if (b.kind === 2) {
      // Juliet: a shallow iron rail across the window, at sill height
      const u0 = margin + b.ci0 * cw + cw * 0.18, u1 = margin + (b.ci1 + 1) * cw - cw * 0.18, vs = v + Math.max(0.15, sil * fh - 0.15), d = 0.22;
      FM.mat(L.METAL, iron[0], iron[1], iron[2], KF);
      FM.box(u0 - 0.05, u1 + 0.05, vs - 0.06, vs, 0, d + 0.03, 1 | 4 | 8 | 16 | 32);
      FM.box(u0 - 0.05, u1 + 0.05, vs + 0.88, vs + 0.93, d - 0.02, d + 0.03, 1 | 16 | 32);
      const n = Math.max(3, Math.round((u1 - u0) / 0.16));
      for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; FM.box(u - 0.014, u + 0.014, vs, vs + 0.88, d - 0.012, d + 0.012, 1); }
      continue;
    }
    const u0 = margin + b.ci0 * cw + 0.08, u1 = margin + (b.ci1 + 1) * cw - 0.08;
    // slab + brackets
    FM.mat(L.CONCRETE, C.trim[0] * 0.95, C.trim[1] * 0.95, C.trim[2] * 0.95, KF);
    FM.box(u0, u1, v - 0.2, v, 0, dep, 1 | 4 | 8 | 16 | 32);
    for (const u of [u0 + 0.2, u1 - 0.2]) FM.box(u - 0.07, u + 0.07, v - 0.55, v - 0.2, 0, dep * 0.7, 1 | 4 | 8 | 32);
    if (b.kind === 1) {
      // solid stucco parapet
      FM.mat(C.wl, C.wall[0] * 1.03, C.wall[1] * 1.03, C.wall[2] * 1.03, KF);
      FM.box(u0, u1, v, v + 1.0, dep - 0.12, dep, 1 | 2 | 4 | 8);
      FM.box(u0, u0 + 0.12, v, v + 1.0, 0, dep - 0.12, 4 | 8);
      FM.box(u1 - 0.12, u1, v, v + 1.0, 0, dep - 0.12, 4 | 8);
      FM.mat(L.TRIM, C.trim[0], C.trim[1], C.trim[2], KF);
      FM.box(u0 - 0.03, u1 + 0.03, v + 1.0, v + 1.06, 0, dep + 0.03, 1 | 4 | 8 | 16);
    } else {
      // iron rail: top + bottom rails, posts, pickets
      FM.mat(L.METAL, iron[0], iron[1], iron[2], KF);
      FM.box(u0, u1, v + 0.95, v + 1.0, dep - 0.06, dep - 0.01, 63);
      FM.box(u0, u1, v + 0.06, v + 0.1, dep - 0.06, dep - 0.01, 1 | 16);
      for (const u of [u0 + 0.03, u1 - 0.03]) FM.box(u - 0.025, u + 0.025, v + 0.06, v + 1.0, 0.02, dep - 0.01, 1 | 4 | 8 | 16);
      for (const u of [u0 + 0.03, u1 - 0.03]) FM.box(u - 0.025, u + 0.025, v, v + 1.0, dep - 0.06, dep - 0.01, 1 | 4 | 8);
      const n = Math.max(4, Math.round((u1 - u0) / 0.16));
      for (let k = 1; k < n; k++) { const u = u0 + (u1 - u0) * k / n; FM.box(u - 0.014, u + 0.014, v + 0.1, v + 0.95, dep - 0.045, dep - 0.02, 1); }
    }
  }
  rc(Bf);
}

// ------------------------------------------------------------------ industrial / commercial parapet crests
// SoMa / Dogpatch brick lofts and old commercial blocks: a raised centre panel (sometimes stepped) on the street parapet
export function crestOf(P, i) {
  if (NOV5 || P.pitched[i] || (P.flags[i] & (32 | 64))) return 0;
  const st = P.style[i], wl = prm(P, i, 9, 2), hA = P.yEave[i] - P.y0[i];
  if (hA > 30) return 0;
  const brick = wl === L.BRICK || wl === L.BRICK_DARK || wl === L.BRICK_PAINT;
  const q = h01(i, 561);
  if (st === S.LOFT || st === S.WAREHOUSE) return q < 0.3 ? 2 : q < 0.6 ? 1 : 0;
  if (st === S.COMMERCIAL && brick) return q < 0.35 ? 1 : 0;
  return 0;
}
export function crest(Bf, P, i, ax, az, bx, bz, Lw, kind) {
  if (Lw < 7) return;
  const y0 = P.y0[i], top = P.yEave[i] - y0, C = colsOf(P, i);
  FM.b = Bf; FM.set(ax, y0, az, bx - ax, bz - az);
  const w = Math.min(Lw * 0.42, 9), u0 = (Lw - w) / 2, u1 = u0 + w, h = 0.7 + 0.5 * h01(i, 562), t = 0.28;
  FM.mat(C.wl, C.wall[0], C.wall[1], C.wall[2], KF);
  FM.box(u0, u1, top - 0.1, top + h, -t, 0, 1 | 2 | 4 | 8);
  if (kind === 2) FM.box(u0 + w * 0.25, u1 - w * 0.25, top + h, top + h + 0.55, -t, 0, 1 | 2 | 4 | 8);
  FM.mat(L.CONCRETE, C.trim[0], C.trim[1], C.trim[2], KF);
  const yc = kind === 2 ? top + h + 0.55 : top + h;
  FM.box(u0 - 0.06, u1 + 0.06, top + h, top + h + 0.1, -t - 0.04, 0.05, 63);
  if (kind === 2) FM.box(u0 + w * 0.25 - 0.06, u1 - w * 0.25 + 0.06, yc, yc + 0.1, -t - 0.04, 0.05, 63);
  // a name / date panel in the crest
  FM.mat(L.CONCRETE, C.trim[0] * 0.9, C.trim[1] * 0.9, C.trim[2] * 0.9, KF);
  FM.box(u0 + w * 0.3, u1 - w * 0.3, top + 0.12, top + h - 0.15, 0, 0.03, 1 | 4 | 8 | 16 | 32);
  rc(Bf);
}
