// Buildings v6: what a block looks like from above ("aerial reads boxy" fix). Pure functions run in the build workers with
// v2build.js emitMid (MID geometry, every distance up to the MID range, no LOD swap):
//   - back yards behind houses / small flats: wood fences on both lot lines + the rear line (the lot grid you see from a
//     drone or Twin Peaks), and per lot a mix of decks (elevated at the living floor with posts + stairs, or low), concrete
//     / brick patios, fully paved yards with planter strips, raised beds, flower borders and garden sheds. The yard depth
//     comes from the party raster (half the gap to the next building behind, so back-to-back yards meet at a shared fence).
//   - roof decks on flat house roofs (boards on sleepers, rail posts + top rails, some with a stair penthouse).
// Plan inputs (v2plan.js): P.yg = yard ground height (-1e4 = none), P.yd = yard direction x127. ?nov6 switches it off.
import { L } from './layers.js';
import { Frame } from './emit.js';
import { prm, Z } from './v2plan.js';
import { NOV6 } from './v2lots.js';
import { S } from './plan.js';

function h01(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }
const FY = new Frame(null);
export const YST = { calls: 0, noEdge: 0, shallow: 0, ok: 0, hit: 0, out: 0, open: 0 };   // (dev counters, per worker)
const pick = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
const FENCE = [[0.4, 0.33, 0.26], [0.47, 0.4, 0.31], [0.36, 0.35, 0.33], [0.5, 0.44, 0.36], [0.3, 0.24, 0.19]];
const DECK = [[0.46, 0.33, 0.21], [0.4, 0.38, 0.35], [0.52, 0.31, 0.2], [0.55, 0.46, 0.34]];
const PAVE = [[0.62, 0.6, 0.56], [0.55, 0.42, 0.34], [0.5, 0.49, 0.46], [0.66, 0.62, 0.55]];
const SHED = [[0.42, 0.47, 0.4], [0.62, 0.58, 0.5], [0.45, 0.33, 0.24], [0.55, 0.57, 0.6], [0.7, 0.66, 0.58]];
const SOIL = [0.09, 0.065, 0.045], LEAF = [[0.07, 0.13, 0.045], [0.1, 0.15, 0.05], [0.12, 0.12, 0.05]], BLOOM = [[0.3, 0.12, 0.16], [0.36, 0.3, 0.08], [0.22, 0.12, 0.3]];

// ---------------------------------------------------------------- colliders (world round 2)
// Fences (both lot lines + the rear line) and sheds become oriented boxes, collected per MID tile while YCOL.on
// (v2build.js buildMidTile) and merged there (mergeYardCols): back-to-back rear fences and neighbours' shared side fences
// collapse into one box per straight fence run. Stride 7: x, z, hx, hz, yaw, yMin, yMax (collision.js oriented box).
export const YCOL = { on: false, out: [] };
const FT = 0.15;                                            // collider half thickness (thin fences tunnel at speed)
let fyYaw = 0;
function colBox(u0, u1, d0, d1, y0, y1) {
  if (!YCOL.on) return;
  const uc = (u0 + u1) / 2, dc = (d0 + d1) / 2;
  YCOL.out.push(FY.wx(uc, dc), FY.wz(uc, dc), (u1 - u0) / 2, (d1 - d0) / 2, fyYaw, y0, y1);
}
// merge collinear, touching boxes: bucket by long-axis angle + line offset, then join overlapping intervals per line
export function mergeYardCols(a) {
  const n = a.length / 7, groups = new Map(), segs = [];
  for (let k = 0; k < n; k++) {
    const o = k * 7, x = a[o], z = a[o + 1], hx = a[o + 2], hz = a[o + 3], yaw = a[o + 4];
    // long axis in world: local x = (cos, -sin), local z = (sin, cos)
    let dx, dz, L, T;
    if (hx >= hz) { dx = Math.cos(yaw); dz = -Math.sin(yaw); L = hx; T = hz; } else { dx = Math.sin(yaw); dz = Math.cos(yaw); L = hz; T = hx; }
    if (dz < 0 || (dz === 0 && dx < 0)) { dx = -dx; dz = -dz; }  // angle in [0, pi)
    const th = Math.atan2(dz, dx), nx = -dz, nz = dx, rho = x * nx + z * nz, s0 = x * dx + z * dz;
    const sg = { th, dx, dz, nx, nz, rho, s0: s0 - L, s1: s0 + L, r0: rho - T, r1: rho + T, y0: a[o + 5], y1: a[o + 6], shed: hx > 0.6 && hz > 0.6 };
    if (sg.shed) { segs.push([x, z, hx, hz, yaw, sg.y0, sg.y1]); continue; }
    const key = Math.round(th / 0.04) * 100003 + Math.round(rho / 0.5);
    let g = groups.get(key); if (!g) groups.set(key, g = []); g.push(sg);
  }
  for (const g of groups.values()) {
    g.sort((p, q) => p.s0 - q.s0);
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const sm = (cur.s0 + cur.s1) / 2, rm = (cur.r0 + cur.r1) / 2;
      segs.push([cur.dx * sm + cur.nx * rm, cur.dz * sm + cur.nz * rm, (cur.s1 - cur.s0) / 2, Math.max(FT, (cur.r1 - cur.r0) / 2), Math.atan2(-cur.dz, cur.dx), cur.y0, cur.y1]);
    };
    for (const sg of g) {
      if (cur && sg.s0 <= cur.s1 + 0.3 && Math.abs(sg.y1 - cur.y1) < 1.5) {
        cur.s1 = Math.max(cur.s1, sg.s1); cur.r0 = Math.min(cur.r0, sg.r0); cur.r1 = Math.max(cur.r1, sg.r1); cur.y0 = Math.min(cur.y0, sg.y0); cur.y1 = Math.max(cur.y1, sg.y1);
      } else { flush(); cur = { ...sg }; }
    }
    flush();
  }
  const out = new Float32Array(segs.length * 7);
  segs.forEach((q, k) => out.set(q, k * 7));
  return out;
}

// depth of the yard behind the edge (frame FY set on it): half the gap to the next building, capped where the raster ends
function yardDepth(R, i, L0) {
  // (SF lots are ~30-37 m deep, houses 12-20 m: back-to-back yards meet at a shared rear fence 15-25 m apart)
  let D = 18;
  for (const t of [0.18, 0.5, 0.82]) {
    const u = L0 * t;
    let d = 1, hit = 0, out = 0;
    for (; d <= 40; d += 0.75) {
      const x = FY.wx(u, d), z = FY.wz(u, d), ii = Math.floor(x - R.x0), jj = Math.floor(z - R.z0);
      if (ii < 0 || jj < 0 || ii >= R.n || jj >= R.n) { out = 1; break; }
      const id = R.a[jj * R.n + ii];
      if (id && id - 1 !== i) { hit = 1; break; }
    }
    D = Math.min(D, hit ? d / 2 - 0.15 : out ? Math.max(6, Math.min(d, 12)) : 14);
    if (hit) YST.hit++; else if (out) YST.out++; else YST.open++;
  }
  return D;
}

// back yard of building i. EX / EZ = its simplified polygon, EP[q] = edge q is a party / hidden wall, sgn = orientation
export function yard(Bf, P, R, i, EX, EZ, EP, sgn) {
  if (NOV6 || !P.yg) return 0;
  const yg = P.yg[i]; if (yg < -1e3) return 0;
  const dx = P.yd[i * 2] / 127, dz = P.yd[i * 2 + 1] / 127, n = EX.length;
  let best = -1, bl = 0, bnx = 0, bnz = 0;
  for (let q = 0; q < n; q++) {
    if (EP[q]) continue;
    const qq = (q + 1) % n, ex = EX[qq] - EX[q], ez = EZ[qq] - EZ[q], l = Math.hypot(ex, ez);
    if (l < 3) continue;
    const nx = sgn * ez / l, nz = -sgn * ex / l;
    if (nx * dx + nz * dz < 0.72) continue;
    if (l > bl) { bl = l; best = q; bnx = nx; bnz = nz; }
  }
  YST.calls++;
  if (best < 0) { YST.noEdge++; return 0; }
  const qq = (best + 1) % n, tx = bnz, tz = -bnx;           // frame: u along the rear wall, +d out into the yard
  const ax = EX[best], az = EZ[best], bx = EX[qq], bz = EZ[qq];
  const o = (bx - ax) * tx + (bz - az) * tz > 0 ? [ax, az] : [bx, bz];
  FY.b = Bf; FY.set(o[0], 0, o[1], tx, tz); fyYaw = Math.atan2(-FY.tz, FY.tx);
  const Lw = bl, D = Math.min(18, yardDepth(R, i, Lw));
  if (D < 2.2) { YST.shallow++; return 0; }
  YST.ok++;
  const h = (k) => h01(i, 800 + k), st = P.style[i];
  const y0 = P.y0[i], gH = prm(P, i, 0, 1), sl = P.ys ? P.ys[i] : 0, G = (d) => yg + sl * (d - 3), yb = Math.min(G(0), G(D)) - 1.6;
  const steep = Math.abs(sl) * D > 0.8;
  // ---------------------------------------------------------------- fences (lot lines + rear line), inside faces + caps; tops follow the ground
  const fc = pick(FENCE, h(1)), fh = 1.65 + 0.35 * h(2), t0 = G(0) + fh, t1 = G(D) + fh;
  FY.mat(L.WOOD, fc[0], fc[1], fc[2]);
  FY.q([0.05, yb, D], [0.05, yb, 0], [0.05, t0, 0], [0.05, t1, D]);
  FY.q([0, t0, 0], [0, t1, D], [0.05, t1, D], [0.05, t0, 0]);
  FY.q([Lw - 0.05, yb, 0], [Lw - 0.05, yb, D], [Lw - 0.05, t1, D], [Lw - 0.05, t0, 0]);
  FY.q([Lw - 0.05, t0, 0], [Lw - 0.05, t1, D], [Lw, t1, D], [Lw, t0, 0]);
  FY.box(0.05, Lw - 0.05, yb, t1, D - 0.05, D, 1 | 2 | 16);
  // (round 2) outer faces too: a fence seen from the neighbour's side / the street was invisible (and now it collides)
  FY.q([0, yb, 0], [0, yb, D], [0, t1, D], [0, t0, 0]);
  FY.q([Lw, yb, D], [Lw, yb, 0], [Lw, t0, 0], [Lw, t1, D]);
  { const yTop = Math.max(t0, t1);
    colBox(0.025 - FT, 0.025 + FT, 0, D, yb, yTop); colBox(Lw - 0.025 - FT, Lw - 0.025 + FT, 0, D, yb, yTop); colBox(0, Lw, D - 0.025 - FT, D - 0.025 + FT, yb, yTop); }
  // ---------------------------------------------------------------- deck (elevated at the living floor, or low)
  let dd = 0;
  const deckP = st === S.STUCCO ? 0.34 : st === S.APARTMENT ? 0.3 : 0.48;
  if (h(3) < deckP && D >= 3.4 && Lw >= 3.2) {
    const dc = pick(DECK, h(4));
    let hd = y0 + gH - 0.12;
    const el = hd - yg > 1.1 && hd - yg < 4.6;
    dd = Math.min(D * 0.55, 2.2 + 1.8 * h(6));
    if (!el) hd = Math.max(G(0), G(dd)) + 0.45 + 0.25 * h(5);
    const w = Math.min(Lw - 0.5, 3.2 + 2.5 * h(7)), u0 = h(8) < 0.5 ? 0.25 : Lw - 0.25 - w, u1 = u0 + w;
    FY.mat(L.WOOD, dc[0], dc[1], dc[2]);
    FY.box(u0, u1, hd - 0.18, hd, 0, dd, 1 | 4 | 8 | 16);
    if (el) {
      FY.mat(L.WOOD, dc[0] * 0.8, dc[1] * 0.8, dc[2] * 0.8);
      for (const u of [u0 + 0.12, u1 - 0.12]) FY.box(u - 0.07, u + 0.07, yb + 1, hd - 0.18, dd - 0.2, dd - 0.06, 1 | 2 | 4 | 8);
      // top rails on the three open sides + a mid rail at the front
      FY.box(u0, u1, hd + 0.92, hd + 0.98, dd - 0.06, dd, 1 | 2 | 16);
      FY.box(u0, u1, hd + 0.45, hd + 0.5, dd - 0.05, dd - 0.01, 1);
      FY.box(u0, u0 + 0.06, hd + 0.92, hd + 0.98, 0, dd, 8 | 4 | 16);
      FY.box(u1 - 0.06, u1, hd + 0.92, hd + 0.98, 0, dd, 4 | 8 | 16);
      for (const u of [u0 + 0.03, u1 - 0.03]) FY.box(u - 0.03, u + 0.03, hd, hd + 0.95, dd - 0.06, dd, 1 | 4 | 8);
      // stair down into the garden (a stringer plane with tread shading from the wood grain)
      const run = (hd - G(dd)) * 1.05, us = u0 < 1 ? u1 - 1.0 : u0 + 0.1, gs = G(dd + run);
      if (dd + run < D - 0.4 && hd - gs > 0.5) FY.q([us, hd - 0.05, dd], [us, gs + 0.05, dd + run], [us + 0.9, gs + 0.05, dd + run], [us + 0.9, hd - 0.05, dd]);
    }
  }
  // ---------------------------------------------------------------- ground: paved yard, or a garden with a patio
  const paved = !steep && h(10) < (st === S.STUCCO ? 0.38 : 0.26);
  const pc = pick(PAVE, h(11));
  if (paved) {
    FY.mat(L.PAVING, pc[0], pc[1], pc[2]);
    FY.q([0.05, Math.max(G(0), G(D)) + 0.06, 0], [0.05, Math.max(G(0), G(D)) + 0.06, D - 0.05], [Lw - 0.05, Math.max(G(0), G(D)) + 0.06, D - 0.05], [Lw - 0.05, Math.max(G(0), G(D)) + 0.06, 0]);
    const yp = Math.max(G(0), G(D)) + 0.06;
    // planter strip along one fence (shrubs), maybe pots
    const lc = pick(LEAF, h(12)), side = h(13) < 0.5;
    FY.mat(L.GRAVEL, lc[0], lc[1], lc[2]);
    if (side) FY.box(0.05, 0.75, yp, yp + 0.5, Math.max(dd, 0.4), D - 0.5, 16 | 4 | 1 | 2);
    else FY.box(Lw - 0.75, Lw - 0.05, yp, yp + 0.5, Math.max(dd, 0.4), D - 0.5, 16 | 8 | 1 | 2);
  } else {
    let pEnd = dd;
    if (h(14) < 0.55 && D - dd > 2.5) {
      const pd0 = dd > 0 ? dd : 0, pd1 = Math.min(D - 1.2, pd0 + 1.6 + 1.6 * h(15)), yp = Math.max(G(pd0), G(pd1)) + 0.06;
      pEnd = pd1;
      FY.mat(L.PAVING, pc[0], pc[1], pc[2]);
      FY.box(0.05, Lw - 0.05, yp - 0.6, yp, pd0, pd1, 16 | 1);
    }
    // ground cover over the rest of the yard: a lush lawn is the terrain itself; otherwise summer-dry lawn, bark mulch or
    // decomposed granite, so a block of yards reads as a patchwork, not one green carpet
    const gq = h(30), gc = gq < 0.3 ? [0.3, 0.29, 0.15] : gq < 0.48 ? [0.17, 0.12, 0.08] : gq < 0.62 ? [0.46, 0.41, 0.33] : null;
    if (gc && D - pEnd > 1) {
      const c0 = Math.max(pEnd, 0) + 0.02, c1 = D - 0.07, k = 0.85 + 0.3 * h(31);
      FY.mat(L.GRAVEL, gc[0] * k, gc[1] * k, gc[2] * k);
      FY.q([0.06, G(c0) + 0.14, c0], [0.06, G(c1) + 0.14, c1], [Lw - 0.06, G(c1) + 0.14, c1], [Lw - 0.06, G(c0) + 0.14, c0]);
    }
    // flower / shrub border along a fence
    if (h(16) < 0.6 && D > 3) {
      const lc = h(17) < 0.3 ? pick(BLOOM, h(18)) : pick(LEAF, h(18));
      FY.mat(L.GRAVEL, lc[0], lc[1], lc[2]);
      const b0 = Math.max(dd, 0.5), b1 = D - 0.1;
      FY.q([0.05, G(b0) + 0.35, b0], [0.05, G(b1) + 0.35, b1], [0.85, G(b1) + 0.35, b1], [0.85, G(b0) + 0.35, b0]);
      FY.q([0.85, G(b1) - 0.3, b1], [0.85, G(b0) - 0.3, b0], [0.85, G(b0) + 0.35, b0], [0.85, G(b1) + 0.35, b1]);
    }
    // raised vegetable beds near the back
    if (h(19) < 0.35 && D >= 5 && Lw >= 4.5) {
      const nb = Lw >= 6.5 ? 2 : 1, bw = 1.1, bd0 = D - 3.4, bd1 = D - 1.0;
      for (let k = 0; k < nb; k++) {
        const u0 = 1.3 + k * 1.9;
        const gb = Math.max(G(bd0), G(bd1));
        FY.mat(L.WOOD, 0.4, 0.31, 0.22); FY.box(u0, u0 + bw, gb - 0.5, gb + 0.42, bd0, bd1, 1 | 2 | 4 | 8);
        FY.mat(L.GRAVEL, SOIL[0] + 0.03 * k, SOIL[1] + 0.06 * h(20 + k), SOIL[2]); FY.box(u0 + 0.05, u0 + bw - 0.05, gb, gb + 0.36, bd0 + 0.05, bd1 - 0.05, 16);
      }
    }
  }
  // ---------------------------------------------------------------- garden shed in a back corner
  if (h(24) < 0.24 && D >= 5.2 && Lw >= 4.2) {
    const sc = pick(SHED, h(25)), w = 1.8 + 0.6 * h(26), dp = 1.6 + 0.6 * h(27), left = h(28) < 0.5;
    const u0 = left ? 0.25 : Lw - 0.25 - w, u1 = u0 + w, d1 = D - 0.25, d0 = d1 - dp, gs = Math.min(G(d0), G(d1)), hw = Math.max(G(d0), G(d1)) + 2.0 + 0.2 * h(29), hr = hw + 0.4;
    FY.mat(L.SIDING, sc[0], sc[1], sc[2]);
    FY.box(u0, u1, gs - 0.3, hw, d0, d1, 1 | 2 | 4 | 8);
    colBox(u0, u1, d0, d1, gs - 0.3, hr);
    FY.box(u0, u1, hw, hr, d1 - 0.04, d1, 2);
    FY.tri([u0, hw, d0], [u0, hr, d1], [u0, hw, d1]);
    FY.tri([u1, hw, d0], [u1, hw, d1], [u1, hr, d1]);
    FY.mat(L.ROOF_SHINGLE, 0.2, 0.2, 0.21);
    const a = [u0 - 0.12, hw - 0.04, d0 - 0.15], b = [u1 + 0.12, hw - 0.04, d0 - 0.15], c = [u1 + 0.12, hr + 0.03, d1 + 0.1], e = [u0 - 0.12, hr + 0.03, d1 + 0.1];
    FY.q(a, e, c, b);
    FY.mat(L.TRIM, 0.85, 0.83, 0.78); FY.box(u0 + w * 0.35, u0 + w * 0.35 + 0.85, G(d0), G(d0) + 1.9, d0 - 0.03, d0, 1);
  }
  return 1;
}

// roof deck on the flat roof of a house (rear half, behind the street parapet): boards on sleepers, rail posts + top rails,
// sometimes a stair penthouse. ring = world footprint, y = roof surface
export function roofDeck(Bf, P, i, ring, y) {
  if (NOV6 || !P.yg || P.pitched[i]) return;
  const st = P.style[i], zone = P.zone[i];
  if (!(st === S.VICTORIAN || st === S.EDWARDIAN || st === S.STUCCO || st === S.APARTMENT) || P.area[i] < 50 || P.area[i] > 900) return;
  const pz = zone === Z.MISSION || zone === Z.CASTRO || zone === Z.VICTORIAN || zone === Z.NORTHBEACH || zone === Z.MARINA || zone === Z.NOBHILL ? 0.17 : 0.07;
  if (h01(i, 850) > pz) return;
  let dx = P.yd[i * 2] / 127, dz = P.yd[i * 2 + 1] / 127;
  if (!dx && !dz) { dx = Math.cos(P.oyaw[i]); dz = -Math.sin(P.oyaw[i]); }
  const cx = P.cx[i], cz = P.cz[i], tx = dz, tz = -dx, n = ring.length / 2;
  let u0 = 1e9, u1 = -1e9, d0 = 1e9, d1 = -1e9;
  for (let k = 0; k < n; k++) { const px = ring[k * 2] - cx, pz2 = ring[k * 2 + 1] - cz, u = px * tx + pz2 * tz, d = px * dx + pz2 * dz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
  const W = Math.min(u1 - u0 - 1.2, 6 + 2 * h01(i, 851)), Dd = Math.min((d1 - d0) * 0.4, 3 + 2.5 * h01(i, 852));
  if (W < 2.4 || Dd < 2.2) return;
  const um = (u0 + u1) / 2 + (h01(i, 853) - 0.5) * (u1 - u0 - 1.2 - W), da = d1 - 0.7 - Dd, db = d1 - 0.7, ua = um - W / 2, ub = um + W / 2;
  const inside = (u, d) => { const x = cx + tx * u + dx * d, z = cz + tz * u + dz * d; let c = false; for (let k = 0, j = n - 1; k < n; j = k++) { const zi = ring[k * 2 + 1], zj = ring[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (ring[j * 2] - ring[k * 2]) * (z - zi) / (zj - zi) + ring[k * 2]) c = !c; } return c; };
  if (!inside(ua, da) || !inside(ub, da) || !inside(ua, db) || !inside(ub, db)) return;
  FY.b = Bf; FY.set(cx, 0, cz, tx, tz);
  const dc = pick(DECK, h01(i, 854)), yd = y + 0.32;
  FY.mat(L.WOOD, dc[0], dc[1], dc[2]);
  FY.box(ua, ub, y, yd, da, db, 63 & ~32);
  // rail: corner posts, top rails all round (dark iron or wood)
  const iron = h01(i, 855) < 0.6, rcl = iron ? [0.06, 0.06, 0.065] : [dc[0] * 0.85, dc[1] * 0.85, dc[2] * 0.85];
  FY.mat(iron ? L.METAL : L.WOOD, rcl[0], rcl[1], rcl[2]);
  for (const [u, d] of [[ua, da], [ub, da], [ua, db], [ub, db], [(ua + ub) / 2, db], [(ua + ub) / 2, da]]) FY.box(u - 0.04, u + 0.04, yd, yd + 1.05, d - 0.04, d + 0.04, 1 | 2 | 4 | 8);
  FY.box(ua, ub, yd + 1.0, yd + 1.06, da - 0.03, da + 0.03, 1 | 2 | 16);
  FY.box(ua, ub, yd + 1.0, yd + 1.06, db - 0.03, db + 0.03, 1 | 2 | 16);
  FY.box(ua - 0.03, ua + 0.03, yd + 1.0, yd + 1.06, da, db, 4 | 8 | 16);
  FY.box(ub - 0.03, ub + 0.03, yd + 1.0, yd + 1.06, da, db, 4 | 8 | 16);
  // stair penthouse at the front edge of the deck
  if (h01(i, 856) < 0.45 && da - 2.6 > d0 + 0.8) {
    const wc = [prm(P, i, 3, 0) * 0.95, prm(P, i, 3, 1) * 0.95, prm(P, i, 3, 2) * 0.95], pu0 = ua + 0.1, pu1 = pu0 + 1.3;
    FY.mat(prm(P, i, 9, 2), wc[0], wc[1], wc[2]);
    FY.box(pu0, pu1, y - 0.1, y + 2.4, da - 2.6, da, 1 | 2 | 4 | 8);
    FY.mat(L.GRAVEL, 0.5, 0.49, 0.47); FY.box(pu0 - 0.05, pu1 + 0.05, y + 2.4, y + 2.5, da - 2.65, da + 0.05, 63 & ~32);
  }
}
