// Buildings v3 NEAR street facades: real geometry for the street walls of the 1:1 OSM city (runs in the build workers
// with v2build.js buildNearTile). Replaces the MID procedural wall of a street front (flat quad with shader windows)
// within the Blender-kit radius:
//   facade material (MeshBuf, flag KITHI: drawn only while the building's kit cell is shown, the exact inverse of the
//   MID wall's KITLOD): the wall with real openings (textured wall layer + grime / streak coords), reveals with vertex
//   AO, interior-mapped glass (rooms / shops / lobbies), vestibules, stairs, plinths, belt courses, real 3-facet bays,
//   storefront bays, lamp glows
//   v3 facade kit (tools/blender/kit_facade3.py, KitBuf.fit 9-slice into each opening): casings, sills, hoods, jamb
//   liners and sashes per style, doors, garage doors (sectional / carriage / roll-up), industrial roll-ups + dock
//   bumpers, clay tile caps and pent roofs, railings, coach lamps, mailboxes, gas / electric meters, downspouts,
//   planters, pots, hedges.
// SF typology: houses have a street-level garage (+ apron) and an entry vestibule with a stair up to the living floor
// (Sunset stucco: a few steps into an arched porch); bays over the garage; Victorians / Edwardians get corner boards and
// belt courses; storefronts keep the sign band on the wall plane (v2dress hangs its signs / awnings there).
import { M, FLAG } from './material.js';
import { L } from './layers.js';
import { S, GT, WT, IT } from './plan.js';
import { prm, Z, winVar } from './v2plan.js';
import { Frame } from './emit.js';
import { bayCells, h01, kit3Has } from './v2detail.js';
import { grid } from './v2geom.js';
import { bayPts, offsetPts, balconyPlan } from './v5mass.js';
import { NOV5 } from './v2lots.js';

export const KITHI = 16384;
export const FSTRIDE = 11;       // fronts: i, ax, az, bx, bz, nx, nz, len, main, ga, gb (ground at a / b, rel. y0)

export function v3Eligible(P, i) {
  const st = P.style[i];
  if (P.v3 === 0) return false;
  if (P.flags[i] & 32) return false;
  if (st === S.TOWER_GLASS || st === S.TOWER_STONE || st === S.OFFICE || st === S.CHINATOWN) return false;
  return P.yEave[i] - P.y0[i] <= 40;
}

const F = new Frame(null), G = new Frame(null);
const WHITE = [1, 1, 1], CONC = [0.6, 0.585, 0.55], STONE = [0.64, 0.6, 0.53], DARK = [0.05, 0.05, 0.055];
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
function col(Fr, c, layer, flags = 0) { Fr.mat(layer, c[0], c[1], c[2], flags | KITHI); }
function lamp(Fr) { Fr.b.sk = M.LIGHT + KITHI; }
// quad with a wanted local normal (u, v, d): the winding is flipped to match
function qN(Fr, a, b, c, d, n) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) Fr.q(a, b, c, d); else Fr.q(a, d, c, b);
}

// ------------------------------------------------------------------ geometry helpers (facade frame: u along, v up, d out)
// wall plane (d = 0) over [u0,u1] x [v0,v1] with rectangular holes {u0,u1,v0,v1}
function wallHoles(Fr, u0, u1, v0, v1, holes, d = 0) {
  const hs = holes.filter(h => h.u1 > u0 && h.u0 < u1 && h.v1 > v0 && h.v0 < v1);
  const vs = [v0, v1];
  for (const h of hs) { if (h.v0 > v0 && h.v0 < v1) vs.push(h.v0); if (h.v1 > v0 && h.v1 < v1) vs.push(h.v1); }
  vs.sort((a, b) => a - b);
  const bands = [];
  for (let k = 0; k < vs.length - 1; k++) {
    const a = vs[k], b = vs[k + 1];
    if (b - a < 1e-4) continue;
    const act = hs.filter(h => h.v0 <= a + 1e-4 && h.v1 >= b - 1e-4).sort((p, q) => p.u0 - q.u0);
    const sig = act.map(h => h.u0.toFixed(3) + ':' + h.u1.toFixed(3)).join('|');
    const last = bands[bands.length - 1];
    if (last && last.sig === sig && Math.abs(last.b - a) < 1e-4) last.b = b; else bands.push({ a, b, act, sig });
  }
  for (const { a, b, act } of bands) {
    let cur = u0;
    for (const h of act) { if (h.u0 > cur + 1e-3) Fr.rect(cur, Math.min(h.u0, u1), a, b, d); cur = Math.max(cur, h.u1); }
    if (u1 > cur + 1e-3) Fr.rect(cur, u1, a, b, d);
  }
}
// recessed opening: reveals with vertex AO toward the back (+ optional arch head)
function reveals(Fr, u0, u1, v0, v1, rec, arch = 0, bottom = true) {
  Fr.q([u0, v0, 0], [u0, v0, -rec], [u0, v1 - arch, -rec], [u0, v1 - arch, 0], [1, 0.45, 0.45, 1]);
  Fr.q([u1, v0, -rec], [u1, v0, 0], [u1, v1 - arch, 0], [u1, v1 - arch, -rec], [0.45, 1, 1, 0.45]);
  if (bottom) Fr.q([u0, v0, -rec], [u0, v0, 0], [u1, v0, 0], [u1, v0, -rec], [0.55, 1, 1, 0.55]);
  if (!arch) Fr.q([u0, v1, -rec], [u1, v1, -rec], [u1, v1, 0], [u0, v1, 0], [0.4, 0.4, 0.8, 0.8]);
  else {
    const r = (u1 - u0) / 2, cu = u0 + r, cv = v1 - r, n = 8;
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI - k / n * Math.PI, a1 = Math.PI - (k + 1) / n * Math.PI;
      const p0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], p1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
      Fr.q([p0[0], p0[1], -rec], [p1[0], p1[1], -rec], [p1[0], p1[1], 0], [p0[0], p0[1], 0], [0.4, 0.4, 0.8, 0.8]);
    }
  }
}
// wall fill between an arched opening's semicircle and its bounding rectangle (the rect is the hole)
function archSpandrels(Fr, u0, u1, v1) {
  const r = (u1 - u0) / 2, cu = u0 + r, cv = v1 - r, n = 8;
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI - k / n * Math.PI, a1 = Math.PI - (k + 1) / n * Math.PI;
    const p0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], p1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
    Fr.tri([p0[0], p0[1], 0], [p1[0], p1[1], 0], k < n / 2 ? [u0, v1, 0] : [u1, v1, 0]);
  }
  Fr.tri([cu, v1, 0], [u0, v1, 0], [cu, cv + r, 0]);
}
// interior-mapped glass quad at depth d (cell = [cu0, cv0, cw, ch, ci, row])
function glass(Fr, u0, u1, v0, v1, d, cell, itype, bars, rec, arch = 0) {
  const B = Fr.b, [cu0, cv0, cw, ch, ci, row] = cell;
  const sk = B.sk, s0 = B.sc[0], s1 = B.sc[1], s2 = B.sc[2], s3 = B.sc[3], g0 = B.sg[0], g1 = B.sg[1], g2 = B.sg[2], g3 = B.sg[3];
  B.sk = M.GLASS + KITHI; B.sc[0] = ci & 255; B.sc[1] = row & 255; B.sc[2] = itype * 16 + bars; B.sc[3] = Math.min(255, rec * 255);
  B.sg[0] = u0 - cu0; B.sg[1] = v0 - cv0; B.sg[2] = u1 - cu0; B.sg[3] = v1 - cv0;
  B.sz = cw; B.sw = ch;
  const nx = Fr.nx, nz = Fr.nz;
  const P = (u, v) => B.v(Fr.wx(u, d), Fr.oy + v, Fr.wz(u, d), nx, 0, nz, u - cu0, v - cv0);
  if (!arch) { const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), e = P(u0, v1); B.quad(a, b, c, e); }
  else {
    const r = (u1 - u0) / 2, cu = u0 + r, vs = v1 - r;
    const a = P(u0, v0), b = P(u1, v0), c = P(u1, vs), e = P(u0, vs); B.quad(a, b, c, e);
    const ctr = P(cu, vs), n = 8; let prev = P(u1, vs);
    for (let k = 1; k <= n; k++) { const t = k / n * Math.PI, q = P(cu + Math.cos(t) * r, vs + Math.sin(t) * r); B.tri(ctr, prev, q); prev = q; }
  }
  B.sk = sk; B.sc[0] = s0; B.sc[1] = s1; B.sc[2] = s2; B.sc[3] = s3; B.sg[0] = g0; B.sg[1] = g1; B.sg[2] = g2; B.sg[3] = g3; B.sz = 0; B.sw = 0;
}
// straight run of steps (with nosings) rising along -d from (dOut, vLow) to (dIn, vHigh); cheek walls with sloped caps
function stairs(Fr, u0, u1, dOut, dIn, vLow, vHigh, c, cheek = true) {
  const rise = vHigh - vLow; if (rise < 0.05) return 0;
  const n = Math.max(1, Math.round(rise / 0.18)), run = (dOut - dIn) / n, h = rise / n;
  col(Fr, c, L.PAVING);
  for (let k = 0; k < n; k++) {
    const d0 = dOut - (k + 1) * run, d1 = dOut - k * run, v1 = vLow + (k + 1) * h;
    Fr.box(u0, u1, v1 - h - (k === 0 ? 0.3 : 0), v1, d0, d1 + 0.025, 1 | 16 | 4 | 8);
    Fr.box(u0, u1, v1 - 0.035, v1, d1, d1 + 0.025, 32);
  }
  if (cheek) {
    col(Fr, shade(c, 0.9), L.CONCRETE);
    const t = 0.16, vb = vLow - 0.3, lo = vLow + 0.3, hi = vHigh + 0.3;
    for (const [a, b] of [[u0 - t, u0], [u1, u1 + t]]) {
      Fr.q([a, vb, dIn], [a, vb, dOut], [a, lo, dOut], [a, hi, dIn]);
      Fr.q([b, vb, dOut], [b, vb, dIn], [b, hi, dIn], [b, lo, dOut]);
      Fr.q([a, lo, dOut], [b, lo, dOut], [b, hi, dIn], [a, hi, dIn]);
      Fr.q([a, vb, dOut], [b, vb, dOut], [b, lo, dOut], [a, lo, dOut]);
    }
  }
  return n;
}

// ------------------------------------------------------------------ per-wall context
function ctxOf(P, i, w) {
  const st = P.style[i], y0 = P.y0[i];
  const T = {
    P, i, st, fl: P.flags[i], zone: P.zone[i], y0, top: P.yEave[i] - y0, vb: P.yb[i] - y0, Lw: w.len,
    fh: prm(P, i, 0, 0), gH: prm(P, i, 0, 1), margin: prm(P, i, 0, 3),
    lox: prm(P, i, 1, 0), sil: prm(P, i, 1, 1), hix: prm(P, i, 1, 2), wtp: prm(P, i, 1, 3),
    gt: prm(P, i, 2, 2) % 8, gCell: Math.floor(prm(P, i, 2, 2) / 8), winType: prm(P, i, 2, 1),
    wallC: [prm(P, i, 3, 0), prm(P, i, 3, 1), prm(P, i, 3, 2)], trimC: [prm(P, i, 4, 0), prm(P, i, 4, 1), prm(P, i, 4, 2)],
    accC: [prm(P, i, 5, 0), prm(P, i, 5, 1), prm(P, i, 5, 2)], itype: prm(P, i, 4, 3) | 0, rec: Math.max(0.1, prm(P, i, 5, 3) || 0.15),
    corn: prm(P, i, 6, 3), hood: prm(P, i, 8, 3) > 0.5, bay: prm(P, i, 9, 0), floors: prm(P, i, 9, 1), wallL: prm(P, i, 9, 2),
    ga: w.ga, gb: w.gb, sb: Math.max(0, Math.min(6, (P.swd ? P.swd[i] : 30) / 10 - 3.0)),
  };
  T.house = st === S.VICTORIAN || st === S.EDWARDIAN || st === S.STUCCO;
  T.brick = T.wallL === L.BRICK || T.wallL === L.BRICK_DARK || T.wallL === L.BRICK_PAINT;
  T.masonry = T.brick || T.wallL === L.STONE || T.wallL === L.CONCRETE;
  T.modern = (st === S.APARTMENT || st === S.COMMERCIAL) && T.wallL === L.STUCCO && h01(i, 301) < 0.45;
  T.nF = Math.max(0, Math.floor((T.top - T.corn - T.gH) / T.fh + 0.05));
  const g = [0];
  if (st === S.VICTORIAN || st === S.EDWARDIAN || st === S.APARTMENT) { if (w.len < 3.0) { T.nb = -1; T.cw = w.len; } }
  if (T.nb !== -1) { T.nb = grid(w.len, T.margin, T.bay, g); T.cw = g[0]; }
  T.gl = (u) => T.ga + (T.gb - T.ga) * Math.max(0, Math.min(1, u / w.len));
  return T;
}
function winPiece(T) {
  if (T.st === S.LOFT || T.st === S.WAREHOUSE || T.winType === WT.LOFT) return 'win_loft';
  if (T.winType === WT.ARCH) return 'win_arch';
  const wv = winVar(T.st, T.i); if (wv) return wv;
  if (T.st === S.VICTORIAN) return 'win_vic';
  if (T.st === S.EDWARDIAN) return 'win_edw';
  if (T.st === S.STUCCO) return 'win_stucco';
  if (T.brick) return 'win_brick';
  return T.modern ? 'win_modern' : 'win_edw';
}
// a full window: reveals (wall material), arch spandrels, interior glass, the kit unit fitted to the opening
function windowUnit(T, Fr, kb, o) {
  const { u0, u1, v0, v1 } = o, rec = o.rec ?? T.rec, arch = o.arch ? (u1 - u0) / 2 : 0;
  col(Fr, o.revealC || T.wallC, o.revealL ?? T.wallL);
  reveals(Fr, u0, u1, v0, v1, rec, arch);
  if (arch) { col(Fr, T.wallC, T.wallL, FLAG.FRONT); archSpandrels(Fr, u0, u1, v1); }
  glass(Fr, u0, u1, v0, v1, -rec + 0.012, o.cell, o.itype ?? T.itype, 0, rec, arch);
  kb.fit(o.piece || winPiece(T), Fr, u0, v0, 0, u1 - u0, v1 - v0, rec, T.trimC, T.accC);
}

// ------------------------------------------------------------------ one street wall
export function v3Wall(Bf, kb, P, i, w, rnd, kd = null) {
  const T = ctxOf(P, i, w);
  T.kd = kd || kb;         // small street-front clutter (plants, bins, bikes, numbers...): its own, shorter-range cell mesh
  F.b = Bf; F.set(w.ax, T.y0, w.az, w.bx - w.ax, w.bz - w.az); F.fu0 = 0; F.fv0 = 0; F.fsu = 1;
  // vG on this wall's surfaces: wall length (ghost signs, window contact AO), ground at u = 0 / at the far end (rel. y0),
  // 2 = marker (material.js hG: wall-foot AO, canyon sky, bounce, moss)
  Bf.sg[0] = w.len; Bf.sg[1] = w.ga; Bf.sg[2] = w.gb; Bf.sg[3] = 2;
  try { v3Body(Bf, kb, P, i, w, T, rnd); } finally { Bf.sg[0] = Bf.sg[1] = Bf.sg[2] = Bf.sg[3] = 0; }
}
function v3Body(Bf, kb, P, i, w, T, rnd) {
  const { st, Lw, gH, fh, margin, nb, cw, top } = T;
  const holes = [], base = [[0, Lw]];
  const cut = (a, b) => { const out = []; for (const [p, q] of base) { if (b <= p || a >= q) { out.push([p, q]); continue; } if (a > p) out.push([p, a]); if (b < q) out.push([b, q]); } base.length = 0; base.push(...out); };
  const cellOf = (ci, row) => [margin + ci * cw, row === 0 ? 0 : gH + (row - 1) * fh, cw, row === 0 ? gH : fh, ci, row];
  const topWin = top - T.corn;
  // ---------------------------------------------------------------- facet walls (short bay faces traced by OSM)
  if (nb === -1) {
    for (let r = 1; r <= T.nF; r++) {
      const cv0 = gH + (r - 1) * fh, u0 = 0.14 * Lw, u1 = 0.86 * Lw, v0 = cv0 + T.sil * fh, v1 = Math.min(cv0 + T.wtp * fh, topWin - 0.2);
      if (v1 - v0 < 0.6 || u1 - u0 < 0.35) continue;
      holes.push({ u0, u1, v0, v1 });
      windowUnit(T, F, kb, { u0, u1, v0, v1, rec: 0.1, cell: [0, cv0, Lw, fh, 0, r], piece: 'win_bay' });
    }
    finishWall(T, kb, holes, base, [], rnd);
    return;
  }
  // ---------------------------------------------------------------- bays (real 3-facet bays; same cells as MID)
  const bays = bayCells(P, i, nb, Lw), bayRanges = [];
  const v0b = gH + 0.1, v1b = Math.min(top - 0.25, gH + T.floors * fh - 0.15);
  if (v1b - v0b > 1.5) for (const ci of bays) {
    const ua = margin + ci * cw + 0.12, ub = margin + (ci + 1) * cw - 0.12;
    if (ub - ua < 1.6) continue;
    holes.push({ u0: ua, u1: ub, v0: v0b, v1: v1b }); bayRanges.push([ua, ub]);
    bayWindow(T, kb, ci, bayPts(P, i, ci, ua, ub), v0b, v1b);
  }
  const inBay = (ci) => bayRanges.some(([a, b]) => a < margin + (ci + 0.5) * cw && b > margin + (ci + 0.5) * cw);
  // (v5) full balconies (MID geometry, v5mass.js) open onto French doors: those windows run down to the floor
  const balc = new Set();
  if (w.main) for (const b of balconyPlan(P, i, nb, bays)) if (b.kind !== 2) for (let c = b.ci0; c <= b.ci1; c++) balc.add(c + ':' + b.row);
  // ---------------------------------------------------------------- ground floor
  const entry = ground(T, kb, holes, cut, cellOf, rnd);
  // ---------------------------------------------------------------- upper floors
  for (let r = 1; r <= T.nF; r++) {
    const cv0 = gH + (r - 1) * fh;
    for (let ci = 0; ci < nb; ci++) {
      if (inBay(ci)) continue;
      let u0 = margin + ci * cw + T.lox * cw, u1 = margin + ci * cw + T.hix * cw;
      if (T.winType === WT.PICTURE && ci === T.gCell) { u0 = margin + ci * cw + 0.1 * cw; u1 = margin + ci * cw + 0.9 * cw; }
      let v0 = balc.has(ci + ':' + r) ? cv0 + 0.06 : cv0 + T.sil * fh; const v1 = Math.min(cv0 + T.wtp * fh, topWin - 0.15);
      // above the entry vestibule (+ its hood / arch / pediment): a shorter stair-hall window, or none
      const eh = st === S.VICTORIAN ? 1.0 : 0.75;
      if (entry && entry.ci === ci && entry.vTop + eh > v0) { v0 = entry.vTop + eh; if (v1 - v0 < 0.7) continue; }
      if (v1 - v0 < 0.5 || u1 - u0 < 0.35) continue;
      const arch = T.winType === WT.ARCH && u1 - u0 < (v1 - v0) * 0.8;
      holes.push({ u0, u1, v0, v1 });
      windowUnit(T, F, kb, { u0, u1, v0, v1, arch, cell: cellOf(ci, r) });
      // Sunset box oriel over the garage: projecting surround + a tile pent roof
      if (st === S.STUCCO && ci === T.gCell && r === 1 && T.winType === WT.PICTURE && h01(i, 311) < 0.55) oriel(T, kb, u0, u1, v0, v1);
      // window AC units on apartments / lofts
      if (r >= 1 && (st === S.APARTMENT || st === S.COMMERCIAL) && h01(i * 31 + ci, 400 + r) < 0.08 && u1 - u0 > 0.8) acUnit(T, kb, u0, u1, v0);
    }
  }
  finishWall(T, kb, holes, base, bayRanges, rnd, entry);
}

// wall with holes, plinth, trims, top dressing and base clutter
function finishWall(T, kb, holes, base, bayRanges, rnd, entry = null) {
  const { st, Lw, gH, fh, top, i } = T;
  col(F, T.wallC, T.wallL, FLAG.FRONT);
  wallHoles(F, 0, Lw, T.vb, top, holes);
  // plinth / base course along the sidewalk (cut at the openings that reach the ground), darkened at the foot
  // (v4) per-lot variants so neighbours differ: Sunset / Edwardian stone or brick veneer wainscots, wood panel around the
  // picture window, Streamline-Moderne speed lines
  const vr = h01(i, 410);
  const veneer = (st === S.STUCCO && vr < 0.3) || (st === S.EDWARDIAN && vr < 0.12) || (st === S.APARTMENT && T.wallL === L.STUCCO && vr < 0.15);
  const vBrick = veneer && h01(i, 411) < 0.35;
  const baseC = veneer ? (vBrick ? [1, 1, 1] : [[0.62, 0.56, 0.47], [0.5, 0.49, 0.47], [0.7, 0.64, 0.55]][Math.floor(h01(i, 412) * 3)]) : T.house ? shade(CONC, 0.92) : T.masonry ? STONE : shade(CONC, 0.86);
  col(F, baseC, veneer ? (vBrick ? L.BRICK : L.STONE) : T.masonry ? L.STONE : L.CONCRETE);
  const vH = veneer ? Math.min(gH - 0.5, 0.75 + 0.5 * h01(i, 413)) : 0;
  for (const [a, b] of base) {
    if (b - a < 0.05) continue;
    const ga = T.gl(a), gb = T.gl(b), h = veneer ? vH : T.house ? 0.32 : 0.55;
    F.q([a, T.vb, 0.045], [b, T.vb, 0.045], [b, gb + h, 0.045], [a, ga + h, 0.045], [0.55, 0.55, 1, 1]);
    F.q([a, ga + h, 0.045], [b, gb + h, 0.045], [b, gb + h, 0], [a, ga + h, 0]);
  }
  if (st === S.STUCCO && T.nF >= 1) {
    const r1 = gH + 0.08, r2 = Math.min(gH + fh, top - T.corn) - 0.12;
    // wood (or painted board) panel around the picture-window cell, 12 mm proud of the stucco
    if (h01(i, 414) < 0.22 && r2 - r1 > 1.5 && T.nb > 0) {
      const ca = T.margin + T.gCell * T.cw + 0.05, cb = ca + T.cw - 0.1;
      col(F, h01(i, 415) < 0.6 ? [0.42, 0.28, 0.17] : shade(T.accC, 1.1), L.SIDING);
      const hs = holes.map(h => ({ u0: h.u0 - 0.2, u1: h.u1 + 0.2, v0: h.v0 - 0.2, v1: h.v1 + 0.2 }));
      wallHoles(F, ca, cb, r1, r2, hs, 0.012);
    } else if (h01(i, 416) < 0.2) {
      // Streamline Moderne: three horizontal speed lines across the upper wall (split at the openings)
      col(F, shade(T.wallC, 1.04), T.wallL);
      for (let k = 0; k < 3; k++) {
        const v = r1 + 0.25 + k * 0.14;
        let cur = 0.25;
        const cuts = holes.filter(h => h.v0 < v + 0.06 && h.v1 > v).map(h => [h.u0 - 0.15, h.u1 + 0.15]).sort((x, y) => x[0] - y[0]);
        for (const [p, q] of [...cuts, [Lw - 0.25, Lw]]) { if (p - cur > 0.3) F.box(cur, p, v, v + 0.05, 0, 0.025, 1 | 4 | 8 | 16 | 32); cur = Math.max(cur, q); }
      }
    }
  }
  // trims
  const trim = T.trimC;
  if (st === S.VICTORIAN || st === S.EDWARDIAN) {
    col(F, trim, L.TRIM);
    const ya = Math.min(T.gl(0), T.gl(Lw)) - 0.05, yt = top - Math.min(0.9, T.corn);
    F.box(0, 0.2, ya, yt, 0, 0.055, 1 | 4 | 8);
    F.box(Lw - 0.2, Lw, ya, yt, 0, 0.055, 1 | 4 | 8);
  }
  if (T.gt === GT.STORE && gH > 3) { col(F, shade(trim, 0.92), L.TRIM); F.box(-0.04, Lw + 0.04, gH - 0.18, gH + 0.2, 0, 0.24, 1 | 4 | 8 | 16 | 32); }
  else if (T.floors >= 1 && st !== S.STUCCO && st !== S.WAREHOUSE) {
    col(F, shade(trim, 0.95), L.TRIM);
    const lines = [gH];
    if (st !== S.LOFT && T.floors >= 2 && T.floors <= 10) for (let r = 1; r < T.floors; r++) { const v = gH + r * fh; if (v > top - 1) break; lines.push(v); }
    for (const v of lines) {
      const segs = [[0, Lw]];
      for (const [ua, ub] of bayRanges) for (let s = segs.length - 1; s >= 0; s--) { const [a, b] = segs[s]; if (ub <= a || ua >= b) continue; segs.splice(s, 1); if (ua > a) segs.push([a, ua]); if (ub < b) segs.push([ub, b]); }
      if (entry && v < entry.vTop + 0.4 && v > entry.gb) for (let s = segs.length - 1; s >= 0; s--) { const [a, b] = segs[s], ua = entry.u0 - 0.35, ub = entry.u1 + 0.35; if (ub <= a || ua >= b) continue; segs.splice(s, 1); if (ua > a) segs.push([a, ua]); if (ub < b) segs.push([ub, b]); }
      for (const [a, b] of segs) if (b - a > 0.2) F.box(a, b, v - 0.07, v + 0.07, 0, v === gH ? 0.1 : 0.07, 1 | 4 | 8 | 16 | 32);
    }
  }
  // Sunset / Marina stucco: Spanish-tile pent roof across the front (MID drew it as one sloped quad) or tile coping;
  // otherwise a moulded stucco cap band (no razor-sharp parapet edge) and rounded corner beads
  const stuccoW = T.wallL === L.STUCCO && (st === S.STUCCO || st === S.APARTMENT || st === S.COMMERCIAL);
  let capped = false;
  if (st === S.STUCCO || (st === S.APARTMENT && (T.zone === Z.MARINA || T.zone === Z.AVENUES) && h01(i, 320) < 0.35)) {
    if (T.fl & 2) { run(kb, 'tile_pent', 0, Lw, top - 0.85, 0, WHITE, T.trimC); capped = true; }
    else if (!(P_pitched(T)) && h01(i, 321) < 0.5) { run(kb, 'tile_cap', -0.02, Lw + 0.02, top, 0, WHITE, WHITE); capped = true; }
  }
  if (stuccoW && !P_pitched(T)) {
    col(F, shade(T.wallC, 1.06), L.STUCCO);
    if (!capped || (T.fl & 2)) F.extrude([[0, -0.32], [0.03, -0.3], [0.03, -0.24], [0.07, -0.19], [0.075, -0.06], [0.05, -0.02], [0.05, 0], [0, 0]], -0.06, Lw + 0.06, top, 3, [0.7, 0.8, 0.85, 0.9, 1, 1, 1, 1]);
    const ya = Math.min(T.gl(0), T.gl(Lw)) - 0.05, yt = top - 0.32;
    col(F, shade(T.wallC, 1.02), L.STUCCO);
    for (const [u, s] of [[0, 1], [Lw, -1]]) {
      qN(F, [u - s * 0.02, ya, 0], [u, ya, 0.03], [u, yt, 0.03], [u - s * 0.02, yt, 0], [-s, 0, 1]);
      qN(F, [u, ya, 0.03], [u + s * 0.06, ya, 0], [u + s * 0.06, yt, 0], [u, yt, 0.03], [s, 0, 1.2]);
    }
  }
  // downspout at one end (not on storefront walls)
  if (T.gt !== GT.STORE && st !== S.WAREHOUSE && h01(i, 330) < 0.7 && Lw > 3) {
    const u = h01(i, 331) < 0.5 ? 0.14 : Lw - 0.14, v0 = T.gl(u) - 0.05, v1 = top - 0.35;
    if (v1 - v0 > 2) kb.fit('downspout', F, u, v0, 0, 1, v1 - v0, 0, shade(T.wallC, 0.92), WHITE);
  }
}
const P_pitched = (T) => T.P.pitched[T.i] > 0;
// kit run along u (pieces 1 m long, stretched to fit)
function run(kb, name, u0, u1, v, d, tA, tB) {
  const n = Math.max(1, Math.round(u1 - u0)), s = (u1 - u0) / n;
  for (let k = 0; k < n; k++) kb.fit(name, F, u0 + k * s, v, d, s, 1, 0, tA, tB);
}
function acUnit(T, kb, u0, u1, v0) {
  const w = 0.66, h = 0.42, cu = (u0 + u1) / 2;
  col(F, [0.55, 0.54, 0.5], L.METAL);
  F.box(cu - w / 2, cu + w / 2, v0 + 0.03, v0 + 0.03 + h, -T.rec + 0.06, 0.32, 1 | 4 | 8 | 16 | 32);
  col(F, [0.2, 0.2, 0.2], L.METAL);
  F.box(cu - w / 2 + 0.04, cu + w / 2 - 0.04, v0 + 0.08, v0 + h - 0.03, 0.32, 0.325, 1);
}
// Sunset oriel: the picture window's surround projects 0.3 m as a box with a tile pent roof
function oriel(T, kb, u0, u1, v0, v1) {
  const p = 0.32, e = 0.16;
  col(F, shade(T.wallC, 1.03), T.wallL);
  F.box(u0 - e, u1 + e, v0 - 0.18, v1 + 0.12, 0, p, 4 | 8 | 32);
  F.q([u0 - e, v0 - 0.18, p], [u1 + e, v0 - 0.18, p], [u1 + e, v0, p], [u0 - e, v0, p]);
  F.q([u0 - e, v1, p], [u1 + e, v1, p], [u1 + e, v1 + 0.12, p], [u0 - e, v1 + 0.12, p]);
  F.q([u0 - e, v0, p], [u0, v0, p], [u0, v1, p], [u0 - e, v1, p]);
  F.q([u1, v0, p], [u1 + e, v0, p], [u1 + e, v1, p], [u1, v1, p]);
  F.q([u0, v0, p], [u0, v0, 0.0], [u0, v1, 0.0], [u0, v1, p], [1, 0.6, 0.6, 1]);
  F.q([u1, v0, 0.0], [u1, v0, p], [u1, v1, p], [u1, v1, 0.0], [0.6, 1, 1, 0.6]);
  F.q([u0, v1, 0.0], [u1, v1, 0.0], [u1, v1, p], [u0, v1, p], [0.6, 0.6, 1, 1]);
  const n = Math.max(1, Math.round(u1 - u0 + 2 * e)), s = (u1 - u0 + 2 * e + 0.1) / n;
  for (let k = 0; k < n; k++) kb.fit('tile_pent', F, u0 - e - 0.05 + k * s, v1 - 0.28, 0.0, s, 1, 0, WHITE, T.trimC, 0, false, 0.75);
}

// ------------------------------------------------------------------ bay window (3 facets) with real windows per floor
function bayWindow(T, kb, ci, pts, v0, v1) {
  const { gH, fh, trimC } = T, np = pts.length, ua = pts[0][0], ub = pts[np - 1][0];
  const dep = Math.max(...pts.map(p => p[1]));
  const panelC = T.st === S.VICTORIAN ? T.accC : trimC;
  for (let f = 0; f + 1 < np; f++) {
    const [pa, pd] = pts[f], [qa, qd] = pts[f + 1];
    const len = Math.hypot(qa - pa, qd - pd);
    const ox = F.wx(pa, pd), oz = F.wz(pa, pd);
    const tx = F.tx * (qa - pa) / len + F.nx * (qd - pd) / len, tz = F.tz * (qa - pa) / len + F.nz * (qd - pd) / len;
    G.b = F.b; G.set(ox, T.y0, oz, tx, tz); G.fu0 = pa; G.fv0 = 0; G.fsu = 1;
    const holes = [], mid = np === 4 ? f === 1 : len > 1.2;
    for (let r = 1; r <= T.floors; r++) {
      const cv0 = gH + (r - 1) * fh, mg = mid ? 0.2 : 0.14, ww = len - 2 * mg;
      if (ww < 0.35) continue;
      const wv0 = cv0 + Math.max(T.sil * fh, 0.6), wv1 = Math.min(cv0 + fh - 0.45, wv0 + (T.wtp - T.sil) * fh + 0.1, v1 - 0.12);
      if (wv1 - wv0 < 0.6) continue;
      holes.push({ u0: mg, u1: len - mg, v0: wv0, v1: wv1 });
      windowUnit(T, G, kb, { u0: mg, u1: len - mg, v0: wv0, v1: wv1, rec: 0.08, cell: [0, cv0, len, fh, ci * 7 + f, r], piece: 'win_bay' });
      col(G, panelC, L.TRIM);
      G.box(mg, len - mg, cv0 + 0.2, wv0 - 0.14, 0, 0.03, 1 | 4 | 8 | 16 | 32);
    }
    col(G, T.wallC, T.wallL, FLAG.FRONT);
    wallHoles(G, 0, len, v0, v1, holes);
    col(G, trimC, L.TRIM);
    G.box(-0.04, 0.09, v0, v1, 0, 0.05, 1 | 4 | 8);
  }
  // top (cornice + roof) and bottom (skirt + brackets)
  col(F, trimC, L.TRIM);
  const o = offsetPts(pts, 0.12);
  for (let k = 1; k + 1 < np; k++) {
    F.tri([o[0][0], v1, 0], [o[k + 1][0], v1, o[k + 1][1]], [o[k][0], v1, o[k][1]]);
    F.tri([o[0][0], v1 + 0.42, 0], [o[k][0], v1 + 0.42, o[k][1]], [o[k + 1][0], v1 + 0.42, o[k + 1][1]]);
  }
  for (let k = 0; k + 1 < np; k++) { const p = o[k], q = o[k + 1]; F.q([p[0], v1, p[1]], [q[0], v1, q[1]], [q[0], v1 + 0.42, q[1]], [p[0], v1 + 0.42, p[1]], [0.7, 0.7, 1, 1]); }
  for (let k = 1; k + 1 < np; k++) F.tri([pts[0][0], v0, 0], [pts[k + 1][0], v0, pts[k + 1][1]], [pts[k][0], v0, pts[k][1]]);
  const i2 = offsetPts(pts, 0.05);
  for (let k = 0; k + 1 < np; k++) { const p = i2[k], q = i2[k + 1]; F.q([p[0], v0 - 0.22, p[1]], [q[0], v0 - 0.22, q[1]], [q[0], v0, q[1]], [p[0], v0, p[1]]); }
  for (let k = 1; k + 1 < np; k++) F.tri([i2[0][0], v0 - 0.22, 0], [i2[k + 1][0], v0 - 0.22, i2[k + 1][1]], [i2[k][0], v0 - 0.22, i2[k][1]]);
  for (const u of [ua + 0.15, (ua + ub) / 2, ub - 0.15]) F.box(u - 0.07, u + 0.07, v0 - 0.62, v0 - 0.22, 0, dep * 0.8, 1 | 4 | 8 | 32);
}

// ------------------------------------------------------------------ ground floors
function ground(T, kb, holes, cut, cellOf, rnd) {
  const { st, nb, cw, margin, gH, i } = T;
  if (T.gt === GT.HOUSE) {
    let entry = null;
    const eci = nb === 1 ? (T.gCell === 0 ? -1 : 0) : (T.gCell === 0 ? 1 : 0);
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = margin + ci * cw;
      if (ci === T.gCell) garage(T, kb, holes, cut, cu0, cw);
      else if (ci === eci) entry = houseEntry(T, kb, holes, cut, ci, cu0, cw);
      else lowWindow(T, kb, holes, ci, cu0, cw, cellOf);
    }
    houseClutter(T, kb, entry, rnd);
    return entry;
  }
  if (T.gt === GT.STORE) { storefront(T, kb, holes, cut, cellOf); return null; }
  if (T.gt === GT.LOBBY) { lobby(T, kb, holes, cut); return null; }
  if (T.gt === GT.ROLLUP) { rollups(T, kb, holes, cut); return null; }
  if (T.gt === GT.RESID) {
    const eci = Math.floor(nb / 2);
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = margin + ci * cw;
      if (ci === eci && cw > 1.6) { entryFlat(T, kb, holes, cut, cu0, cw); continue; }
      lowWindow(T, kb, holes, ci, cu0, cw, cellOf, 1.0);
    }
  }
  return null;
}
function lowWindow(T, kb, holes, ci, cu0, cw, cellOf, sillMin = 0.9) {
  const ww = Math.min(T.lox < 0.3 ? (T.hix - T.lox) * cw : 1.0, cw - 0.5), u0 = cu0 + (cw - ww) / 2, u1 = u0 + ww;
  const g = Math.max(T.gl(u0), T.gl(u1));
  const v0 = Math.max(g + sillMin, 0.9), v1 = Math.min(T.gH - 0.35, v0 + Math.min(1.5, (T.wtp - T.sil) * T.fh));
  if (v1 - v0 < 0.6 || ww < 0.4) return;
  holes.push({ u0, u1, v0, v1 });
  windowUnit(T, F, kb, { u0, u1, v0, v1, cell: cellOf(ci, 0), piece: T.st === S.STUCCO ? 'win_modern' : T.house ? 'win_edw' : winPiece(T) });
}
function garage(T, kb, holes, cut, cu0, cw) {
  const gw = Math.max(2.1, Math.min(2.7, cw - 0.5)), u0 = cu0 + (cw - gw) / 2, u1 = u0 + gw;
  const g0 = Math.max(T.gl(u0), T.gl(u1)) + 0.02, v1 = Math.min(g0 + 2.2, T.gH - 0.3);
  if (v1 - g0 < 1.8) return;
  holes.push({ u0, u1, v0: g0, v1 });
  cut(u0 - 0.1, u1 + 0.1);
  const R = 0.22;
  col(F, T.wallC, T.wallL); reveals(F, u0, u1, g0, v1, R, 0, false);
  const q = h01(T.i, 340), piece = T.st === S.STUCCO ? (q < 0.55 ? 'garage_sect' : q < 0.8 ? 'garage_roll' : 'garage_carriage') : (q < 0.45 ? 'garage_carriage' : q < 0.85 ? 'garage_sect' : 'garage_roll');
  let doorC = piece === 'garage_sect' ? (h01(T.i, 341) < 0.5 ? T.trimC : shade(T.accC, 1.1)) : T.trimC;
  // sun-bleached / chalky old paint on some doors (lighter, greyer)
  const bl = h01(T.i, 342);
  if (bl < 0.4) { const k = 0.25 + bl; const l = 0.2126 * doorC[0] + 0.7152 * doorC[1] + 0.0722 * doorC[2]; doorC = doorC.map(c => Math.min(1, c + (Math.max(l * 1.35, 0.42) - c) * k)); }
  kb.fit(piece, F, u0, g0, 0, gw, v1 - g0, R, doorC, T.accC);
  // concrete driveway apron over the setback: tyre tracks + an oil stain toward the door (vertex AO strips)
  if (T.sb > 0.3) {
    col(F, [0.64, 0.63, 0.6], L.CONCRETE);
    const d1 = T.sb + 0.2, ua = u0 - 0.15, ub = u1 + 0.15, w5 = (ub - ua) / 5, oil = 0.55 + 0.25 * h01(T.i, 343);
    const e0 = [0.95, 0.8, oil, oil, 0.8, 0.95], e1 = [1, 0.9, 0.86, 0.86, 0.9, 1];   // strip edges: at the door / at the sidewalk
    for (let s = 0; s < 5; s++) {
      const a = ua + s * w5, b = a + w5;
      F.q([a, g0 - 0.03, d1], [b, g0 - 0.03, d1], [b, g0 - 0.01, 0], [a, g0 - 0.01, 0], [e1[s], e1[s + 1], e0[s + 1], e0[s]]);
    }
  }
  T.garageU = [u0, u1]; T.garageV1 = v1;
}
// house entry: a vestibule cut into the front with a stair up to the door on the living floor (Victorian / Edwardian:
// up to a full storey; Sunset stucco: a few steps into an arched porch), door + transom, coach lamp, mailbox, railings
function houseEntry(T, kb, holes, cut, ci, cu0, cw) {
  const st = T.st, gH = T.gH;
  const ew = Math.min(1.5, cw - 0.8);
  if (ew < 1.05) { sideDoor(T, kb, holes, cut, cu0 + (cw - 1.0) / 2); return null; }
  const u0 = cu0 + (cw - ew) / 2, u1 = u0 + ew;
  const gb = Math.min(T.gl(u0), T.gl(u1));
  const dOut = Math.min(T.sb + 0.25, 1.4);
  let vDoor;
  if (st === S.STUCCO) vDoor = gb + Math.min(1.26, Math.max(0.36, gH * 0.4));
  else { const n = Math.floor((dOut + 2.6 - 1.1) / 0.27); vDoor = Math.min(gH, gb + Math.max(2, n) * 0.18); }
  vDoor = Math.max(vDoor, gb + 0.18);
  const rows = T.nF > 0 ? gH + T.fh - 0.3 : T.top - T.corn - 0.3;
  const vTop = Math.min(vDoor + 2.55, rows);
  if (vTop - vDoor < 2.3) { sideDoor(T, kb, holes, cut, cu0 + (cw - 1.0) / 2); return null; }
  const run = (vDoor - gb) / 0.18 * 0.27;
  const depth = Math.min(Math.max(1.2, run - dOut + 1.15), 3.2);
  const arch = st === S.STUCCO ? h01(T.i, 350) < 0.75 : st === S.EDWARDIAN && h01(T.i, 350) < 0.35;
  holes.push({ u0, u1, v0: gb - 0.4, v1: vTop });
  cut(u0 - 0.2, u1 + 0.2);
  // vestibule shell
  const vc = shade(T.wallC, 0.95), vl = T.wallL === L.SIDING ? L.TRIM : T.wallL;
  col(F, vc, vl);
  F.q([u0, gb - 0.4, 0], [u0, gb - 0.4, -depth], [u0, vTop, -depth], [u0, vTop, 0], [1, 0.45, 0.45, 1]);
  F.q([u1, gb - 0.4, -depth], [u1, gb - 0.4, 0], [u1, vTop, 0], [u1, vTop, -depth], [0.45, 1, 1, 0.45]);
  F.q([u0, vTop, -depth], [u1, vTop, -depth], [u1, vTop, 0], [u0, vTop, 0], [0.4, 0.4, 0.85, 0.85]);
  const dw = 1.0, du0 = u0 + (ew - dw) / 2, du1 = du0 + dw;
  F.rect(u0, du0, vDoor, vTop, -depth, [0.5, 0.5, 0.5, 0.5]);
  F.rect(du1, u1, vDoor, vTop, -depth, [0.5, 0.5, 0.5, 0.5]);
  F.rect(du0, du1, vDoor + 2.22, vTop, -depth, [0.5, 0.5, 0.5, 0.5]);
  // door (kit) + transom glass
  const dp = st === S.STUCCO || (st === S.EDWARDIAN && h01(T.i, 352) < 0.4) ? 'door_modern' : 'door_vic';
  kb.fit(dp, F, du0, vDoor, -depth + 0.005, dw, 2.15, 0, T.trimC, T.accC);
  if (vTop - vDoor > 2.5) glass(F, du0, du1, vDoor + 2.23, vTop - 0.08, -depth + 0.02, [du0, vDoor, dw, 2.6, 60 + (T.i & 63), 1], IT.RES, 0, 0.1);
  // landing
  col(F, [0.56, 0.54, 0.5], L.PAVING);
  F.q([u0, vDoor, -depth], [u0, vDoor, -depth + 1.15], [u1, vDoor, -depth + 1.15], [u1, vDoor, -depth]);
  // coach lamp + glow, mailbox
  kb.fit('lamp_wall', F, du1 + 0.2, vDoor + 1.75, -depth, 1, 1, 0, WHITE, WHITE);
  lamp(F); F.box(du1 + 0.2 - 0.05, du1 + 0.2 + 0.05, vDoor + 1.8, vDoor + 1.99, -depth + 0.14, -depth + 0.24, 63);
  if (du0 - u0 > 0.2) kb.fit('mailbox', F, (u0 + du0) / 2, vDoor + 1.15, -depth, 0.8, 1, 0, WHITE, WHITE);
  // stairs from the sidewalk / setback up to the landing, iron railings on the cheek walls
  const dIn = -depth + 1.15;
  const n = stairs(F, u0, u1, dOut, dIn, gb, vDoor, [0.6, 0.585, 0.55]);
  if (vDoor - gb > 0.55 && n > 0) {
    const sl = (vDoor - gb) / (dOut - dIn);
    for (const u of [u0 - 0.08, u1 + 0.08]) {
      // railing along -d: a local frame whose u axis runs from the stair foot toward the wall
      G.b = F.b; G.set(F.wx(u, dOut), T.y0, F.wz(u, dOut), -F.nx, -F.nz);
      kb.fit('rail_seg', G, 0, gb + 0.3, 0, dOut - dIn, 1, 0, WHITE, WHITE, sl);
      kb.fit('newel', G, 0.05, gb + 0.3, 0, 1, 1, 0, WHITE, WHITE);
    }
  }
  // entrance surround
  if (arch) {
    col(F, shade(T.wallC, 1.03), T.wallL, FLAG.FRONT);
    archSpandrels(F, u0, u1, vTop);
    col(F, T.trimC, L.TRIM);
    const r = ew / 2, cu = u0 + r, cv = vTop - r, na = 10;
    for (let k = 0; k < na; k++) {
      const a0 = Math.PI - k / na * Math.PI, a1 = Math.PI - (k + 1) / na * Math.PI;
      const i0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], i1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
      const o0 = [cu + Math.cos(a0) * (r + 0.16), cv + Math.sin(a0) * (r + 0.16)], o1 = [cu + Math.cos(a1) * (r + 0.16), cv + Math.sin(a1) * (r + 0.16)];
      F.q([i0[0], i0[1], 0.05], [o0[0], o0[1], 0.05], [o1[0], o1[1], 0.05], [i1[0], i1[1], 0.05]);
      F.q([i1[0], i1[1], 0], [i1[0], i1[1], 0.05], [i0[0], i0[1], 0.05], [i0[0], i0[1], 0]);
      F.q([o0[0], o0[1], 0], [o0[0], o0[1], 0.05], [o1[0], o1[1], 0.05], [o1[0], o1[1], 0]);
    }
    if (st === S.STUCCO) { const s = ew + 0.5, v = vTop + 0.12; kb.fit('tile_pent', F, u0 - 0.25, v - 0.1, 0, s, 1, 0, WHITE, T.trimC, 0, false, 0.6); }
  } else {
    col(F, T.trimC, L.TRIM);
    F.box(u0 - 0.22, u0, gb, vTop, 0, 0.12, 1 | 4 | 8);
    F.box(u1, u1 + 0.22, gb, vTop, 0, 0.12, 1 | 4 | 8);
    F.box(u0 - 0.3, u1 + 0.3, vTop, vTop + 0.32, 0, 0.16, 1 | 4 | 8 | 32);
    F.box(u0 - 0.4, u1 + 0.4, vTop + 0.32, vTop + 0.42, 0, 0.3, 63);
    // (v5) a shed hood on brackets over the stoop (Edwardian / Bayview / Avenues houses without a pediment)
    if (st !== S.VICTORIAN && !NOV5 && h01(T.i, 551) < 0.45 && dOut > 0.3) {
      const hu0 = u0 - 0.45, hu1 = u1 + 0.45, hv = vTop + 0.5, hd = Math.min(1.25, dOut + 0.55), drop = 0.32;
      const tile = st === S.STUCCO || T.zone === Z.MARINA;
      col(F, tile ? [0.62, 0.3, 0.2] : [0.2, 0.2, 0.22], tile ? L.CLAYTILE : L.ROOF_SHINGLE);
      F.q([hu0, hv + 0.42, 0], [hu1, hv + 0.42, 0], [hu1, hv + 0.42 - drop, hd], [hu0, hv + 0.42 - drop, hd]);
      col(F, T.trimC, L.TRIM);
      F.q([hu0, hv + 0.3 - drop, hd], [hu1, hv + 0.3 - drop, hd], [hu1, hv + 0.3, 0], [hu0, hv + 0.3, 0]);
      F.q([hu0, hv + 0.3 - drop, hd], [hu0, hv + 0.42 - drop, hd], [hu1, hv + 0.42 - drop, hd], [hu1, hv + 0.3 - drop, hd]);
      F.q([hu0, hv + 0.3, 0], [hu0, hv + 0.42, 0], [hu0, hv + 0.42 - drop, hd], [hu0, hv + 0.3 - drop, hd]);
      F.q([hu1, hv + 0.42, 0], [hu1, hv + 0.3, 0], [hu1, hv + 0.3 - drop, hd], [hu1, hv + 0.42 - drop, hd]);
      for (const u of [hu0 + 0.12, hu1 - 0.12]) { F.box(u - 0.06, u + 0.06, hv - 0.45, hv + 0.3, 0, 0.12, 1 | 4 | 8 | 32); F.q([u - 0.05, hv - 0.45, 0.12], [u + 0.05, hv - 0.45, 0.12], [u + 0.05, hv + 0.3 - drop * 0.6, hd * 0.6], [u - 0.05, hv + 0.3 - drop * 0.6, hd * 0.6]); }
    }
    if (st === S.VICTORIAN) {
      const pu0 = u0 - 0.4, pu1 = u1 + 0.4, pv = vTop + 0.42, ph = (pu1 - pu0) * 0.25;
      F.tri([pu0, pv, 0.3], [pu1, pv, 0.3], [(pu0 + pu1) / 2, pv + ph, 0.3]);
      F.q([pu0 - 0.05, pv, 0.33], [(pu0 + pu1) / 2, pv + ph + 0.06, 0.33], [(pu0 + pu1) / 2, pv + ph + 0.06, 0], [pu0 - 0.05, pv, 0]);
      F.q([(pu0 + pu1) / 2, pv + ph + 0.06, 0.33], [pu1 + 0.05, pv, 0.33], [pu1 + 0.05, pv, 0], [(pu0 + pu1) / 2, pv + ph + 0.06, 0]);
    }
  }
  return { ci, u0, u1, gb, vDoor, vTop, dOut };
}
// plain door at street level (narrow lots): recessed, kit door, lamp
function sideDoor(T, kb, holes, cut, du0) {
  const dw = 0.95, du1 = du0 + dw, g = Math.max(T.gl(du0), T.gl(du1)) + 0.15, v1 = g + 2.15, R = 0.3;
  if (v1 > T.gH - 0.1) return;
  holes.push({ u0: du0, u1: du1, v0: g, v1 });
  cut(du0 - 0.1, du1 + 0.1);
  col(F, shade(T.wallC, 0.95), T.wallL); reveals(F, du0, du1, g, v1, R, 0, false);
  col(F, [0.56, 0.54, 0.5], L.PAVING); F.box(du0 - 0.1, du1 + 0.1, g - 0.5, g, -R, 0.35, 1 | 4 | 8 | 16);
  kb.fit(T.st === S.STUCCO ? 'door_modern' : 'door_vic', F, du0, g, -R + 0.005, dw, 2.15, 0, T.trimC, T.accC);
  kb.fit('lamp_wall', F, du1 + 0.25, g + 1.75, 0, 1, 1, 0, WHITE, WHITE);
  lamp(F); F.box(du1 + 0.2, du1 + 0.3, g + 1.8, g + 1.99, 0.14, 0.24, 63);
}
// meters beside the garage, planters / pots / hedges on the setback
function houseClutter(T, kb, entry, rnd) {
  const i = T.i, kd = T.kd, Lw = T.Lw;
  // occupied stretches of the front (driveway, entry path, meters, bins): the yard dressing fills the rest
  const busy = [];
  if (T.garageU) busy.push([T.garageU[0] - 0.3, T.garageU[1] + 0.3]);
  if (entry) busy.push([entry.u0 - 0.3, entry.u1 + 0.3]);
  const isFree = (a, b) => a > 0.1 && b < Lw - 0.1 && busy.every(([p, q]) => b <= p || a >= q);
  const freeSpans = () => {
    const out = []; let cur = 0.15;
    for (const [p, q] of [...busy].sort((x, y) => x[0] - y[0])) { if (p - cur > 0.5) out.push([cur, Math.min(p, Lw - 0.15)]); cur = Math.max(cur, q); }
    if (Lw - 0.15 - cur > 0.5) out.push([cur, Lw - 0.15]);
    return out.filter(([a, b]) => b - a > 0.5);
  };
  if (T.garageU && h01(i, 360) < 0.6) {
    const [a, b] = T.garageU, left = entry ? entry.u0 > b : h01(i, 361) < 0.5;
    const u = left ? a - 1.05 : b + 0.15;
    if (u > 0.05 && u + 0.9 < T.Lw - 0.05 && (!entry || u + 0.9 < entry.u0 - 0.25 || u > entry.u1 + 0.25)) { kb.fit('meters', F, u, T.gl(u + 0.45) - 0.02, 0, 1, 1, 0, WHITE, WHITE); busy.push([u - 0.1, u + 1.0]); }
  }
  // SF three-bin set (landfill / recycling / compost) beside the garage on collection-day eve
  if (T.garageU && h01(i, 366) < 0.3) {
    const [a, b] = T.garageU, right = h01(i, 367) < 0.5, u0 = right ? b + 0.12 : a - 2.05;
    if (u0 > 0.05 && u0 + 1.95 < T.Lw - 0.05 && (!entry || u0 + 1.95 < entry.u0 - 0.2 || u0 > entry.u1 + 0.2)) {
      busy.push([u0 - 0.1, u0 + 2.05]);
      if (kit3Has('bins3')) { const g = Math.min(T.gl(u0), T.gl(u0 + 1.95)); kd.fit('bins3', F, u0, g - 0.02, 0.06 + 0.1 * h01(i, 368), 1, 1, 0, WHITE, WHITE); }
      else {
      const BIN = [[0.035, 0.035, 0.04], [0.04, 0.13, 0.42], [0.07, 0.28, 0.09]];
      for (let k = 0; k < 3; k++) {
        const bu = u0 + k * 0.65, g = T.gl(bu + 0.3), d0 = 0.08 + 0.05 * h01(i * 3 + k, 368);
        col(F, BIN[k], L.TRIM);
        F.box(bu, bu + 0.58, g - 0.05, g + 0.98, d0, d0 + 0.7, 1 | 4 | 8 | 2);
        col(F, shade(BIN[k], 1.2), L.TRIM);
        F.box(bu - 0.02, bu + 0.6, g + 0.98, g + 1.06, d0 - 0.03, d0 + 0.73, 63);
        col(F, DARK, L.METAL);
        F.box(bu + 0.08, bu + 0.5, g + 0.9, g + 0.95, d0 + 0.7, d0 + 0.74, 1 | 16);
      }
      }
    }
  }
  if (entry && entry.dOut > 0.5 && h01(i, 362) < 0.45) {
    for (const u of [entry.u0 - 0.45, entry.u1 + 0.45]) if (u > 0.3 && u < T.Lw - 0.3 && (!T.garageU || u < T.garageU[0] - 0.3 || u > T.garageU[1] + 0.3)) kd.fit('pot', F, u, T.gl(u) - 0.02, entry.dOut - 0.25, 1, 1, 0, WHITE, WHITE);
  }
  // house numbers: beside the entry (on the wall next to the vestibule) or over the garage header
  if (h01(i, 369) < 0.85) {
    const np = ['num_a', 'num_b', 'num_c'][Math.floor(h01(i, 370) * 3)];
    if (entry && entry.u1 + 0.75 < Lw - 0.1 && (!T.garageU || entry.u1 + 0.75 < T.garageU[0] || entry.u1 > T.garageU[1])) kd.fit(np, F, entry.u1 + 0.28, entry.vDoor + 1.25, 0, 1, 1, 0, WHITE, WHITE);
    else if (entry && entry.u0 - 0.75 > 0.1 && (!T.garageU || entry.u0 - 0.75 > T.garageU[1] || entry.u0 < T.garageU[0])) kd.fit(np, F, entry.u0 - 0.75, entry.vDoor + 1.25, 0, 1, 1, 0, WHITE, WHITE);
    else if (T.garageU && T.gH - T.garageV1 > 0.45) kd.fit(np, F, (T.garageU[0] + T.garageU[1]) / 2 - 0.25, T.garageV1 + 0.14, 0, 1, 1, 0, WHITE, WHITE);
  }
  frontYard(T, entry, busy, isFree, freeSpans);
}
// (v4) front yards: SF-style small gardens in the setback (dry succulent beds + agave, shrub borders with flowers,
// clipped hedges, concrete planters), low iron / picket fences on the sidewalk line with a lot-line return, bougainvillea
// trained up the wall where there is no setback, potted standards by the door, a bike against the wall, a shared scooter
// left on the sidewalk. Detail cell mesh (kd, DET_R).
function frontYard(T, entry, busy, isFree, freeSpans) {
  const i = T.i, kd = T.kd, Lw = T.Lw, sb = T.sb, st = T.st;
  const gAt = (u) => T.gl(u) - 0.03;
  const spans = freeSpans();
  const gtype = h01(i, 380);
  if (sb >= 1.1) {
    const dMid = Math.min(sb * 0.5, 0.95);
    for (const [a, b] of spans) {
      const L_ = b - a;
      if (gtype < 0.28) {                       // dry garden: gravel beds with succulents + an agave
        const n = Math.floor(L_ / 1.25);
        for (let k = 0; k < n; k++) { const u = a + (L_ - n * 1.25) / 2 + k * 1.25; kd.fit('succulents', F, u, gAt(u + 0.6), 0.05, 1, 1, 0, WHITE, WHITE); }
        if (sb >= 1.5 && L_ >= 1.4 && h01(i, 381) < 0.8) { const u = a + L_ * (0.3 + 0.4 * h01(i, 382)), s = 0.75 + 0.35 * h01(i, 383); kd.fit('agave', F, u, gAt(u), Math.min(sb - 0.55 * s, 1.1 + 0.3 * s), s, s, 0, WHITE, WHITE, 0, false, s); }
      } else if (gtype < 0.55) {                // mixed border: flowers along the wall, shrubs in front
        const n = Math.max(1, Math.round(L_)), s = L_ / n;
        for (let k = 0; k < n; k++) kd.fit('flowerbed', F, a + k * s, gAt(a + k * s), 0.02, s, 0.9 + 0.3 * h01(i * 5 + k, 384), 0, WHITE, WHITE);
        if (sb >= 1.4) for (let u = a + 0.55; u < b - 0.45; u += 1.3 + 0.4 * h01(Math.floor(u * 10) + i, 385)) {
          const fl = h01(i * 3 + Math.floor(u), 386) < 0.4, s = 0.75 + 0.4 * h01(Math.floor(u * 7) + i, 387);
          kd.fit(fl ? 'shrub_flower' : 'shrub', F, u, gAt(u), Math.min(dMid + 0.3, sb - 0.45 * s), s, s, 0, WHITE, WHITE, 0, h01(Math.floor(u * 3) + i, 388) < 0.5, s);
        }
      } else if (gtype < 0.68 && sb >= 1.3) {   // clipped hedge on the sidewalk line
        const n = Math.max(1, Math.round(L_)), s = L_ / n;
        for (let k = 0; k < n; k++) kd.fit('hedge', F, a + k * s, gAt(a + k * s) - 0.02, Math.min(sb - 0.7, 1.2), s, 0.8 + 0.3 * h01(i, 365), 0, WHITE, WHITE);
      } else if (gtype < 0.78 && L_ >= 1.4) {   // concrete planter trough under the window
        kd.fit('planter', F, a + (L_ - 1.2) / 2, gAt(a + L_ / 2), 0.15, 1, 1, 0, WHITE, WHITE);
      } else if (gtype < 0.86) {                // a single shrub or two
        const u = a + L_ * 0.5, s = 0.8 + 0.3 * h01(i, 389);
        kd.fit(h01(i, 390) < 0.5 ? 'shrub' : 'shrub_flower', F, u, gAt(u), Math.min(dMid, sb - 0.45 * s), s, s, 0, WHITE, WHITE, 0, false, s);
      }
    }
    // deep yards (the avenues' 15-20 ft lawns): a specimen shrub / small clipped tree out on the lawn
    if (sb >= 3.5 && h01(i, 417) < 0.4) {
      const [a, b] = spans.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m), [0, 0]);
      if (b - a > 1.2) { const u = a + (b - a) * (0.3 + 0.4 * h01(i, 418)), s = 1.2 + 0.7 * h01(i, 419); kd.fit(h01(i, 420) < 0.3 ? 'shrub_flower' : 'shrub', F, u, gAt(u), sb * (0.45 + 0.2 * h01(i, 421)), s, s * (1 + 0.3 * h01(i, 422)), 0, WHITE, WHITE, 0, false, s); }
    }
    // low front fence on the sidewalk line (not across the driveway / entry path) + a return along the lot line
    if (sb >= 1.2 && h01(i, 391) < (st === S.STUCCO ? 0.22 : 0.4)) {
      const iron = st === S.VICTORIAN || (st !== S.STUCCO && h01(i, 392) < 0.7) || (st === S.STUCCO && h01(i, 392) < 0.6);
      const piece = iron ? 'fence_iron' : 'fence_pick', fc = iron ? WHITE : shade(T.trimC, 1.0);
      for (const [a, b] of spans) {
        const n = Math.max(1, Math.round(b - a)), s = (b - a) / n;
        for (let k = 0; k < n; k++) kd.fit(piece, F, a + k * s, gAt(a + k * s), sb - 0.06, s, 0.9, 0, fc, fc);
      }
      if (spans.length && spans[0][0] < 0.3) {
        G.b = F.b; G.set(F.wx(0.06, 0.1), T.y0, F.wz(0.06, 0.1), F.nx, F.nz);
        const n = Math.max(1, Math.round(sb - 0.2)), s = (sb - 0.2) / n;
        for (let k = 0; k < n; k++) kd.fit(piece, G, k * s, gAt(0.1), 0, s, 0.9, 0, fc, fc);
      }
    }
  } else {
    // no setback: bougainvillea / climbing rose trained up the wall from a sidewalk cut-out
    if (h01(i, 393) < 0.2) {
      const s = 0.8 + 0.3 * h01(i, 394), need = 2.0 * s;
      for (const [a, b] of spans) if (b - a >= need) { const u = h01(i, 395) < 0.5 ? a + need / 2 : b - need / 2; kd.fit('bougain', F, u, gAt(u), 0.0, s, s, 0, WHITE, WHITE, 0, h01(i, 396) < 0.5, 1); busy.push([u - 0.4, u + 0.4]); break; }
    }
  }
  // potted standard (olive / ficus) by the door
  if (entry && h01(i, 397) < 0.2) {
    const u = entry.u1 + 0.45;
    if (isFree(u - 0.3, u + 0.3)) kd.fit('pot_tall', F, u, gAt(u), Math.min(Math.max(entry.dOut - 0.35, 0.3), 1.0), 1, 1, 0, WHITE, shade(T.accC, 1.2));
  }
  // a bike leaning on the wall, a shared scooter on the sidewalk
  if (h01(i, 398) < 0.07) {
    for (const [a, b] of freeSpans()) if (b - a >= 1.85) { const u = a + (b - a - 1.75) * h01(i, 399); kd.fit('bike', F, u, gAt(u + 0.9), 0.02, 1, 1, 0, WHITE, [[0.08, 0.2, 0.45], [0.5, 0.06, 0.05], [0.05, 0.05, 0.05], [0.6, 0.6, 0.55], [0.1, 0.3, 0.15]][Math.floor(h01(i, 400) * 5)], 0, h01(i, 401) < 0.5); break; }
  }
  if (h01(i, 402) < 0.045) {
    const u = 0.5 + (Lw - 1.6) * h01(i, 403), d = sb + 0.6 + 1.2 * h01(i, 404);
    kd.fit('scooter', F, u, T.gl(u + 0.5) - 0.01, d, 1, 1, 0, WHITE, h01(i, 405) < 0.55 ? [0.12, 0.62, 0.2] : [0.06, 0.06, 0.07], 0, h01(i, 406) < 0.5);
  }
}
// storefronts: bulkhead, display glass (shop / cafe interiors), transom, recessed door, pilasters; sign band stays on the
// wall plane (v2dress signs / awnings attach there)
function storefront(T, kb, holes, cut, cellOf) {
  const { nb, cw, margin, gH, i } = T;
  const signV0 = gH - 0.95;
  const frameC = [[0.07, 0.07, 0.07], T.trimC, [0.3, 0.2, 0.12], [0.1, 0.18, 0.14]][Math.floor(h01(i, 370) * 4)];
  for (let ci = 0; ci < nb; ci++) {
    const cu0 = margin + ci * cw, u0 = cu0 + 0.16, u1 = cu0 + cw - 0.16;
    const gb = Math.max(T.gl(u0), T.gl(u1)), v1 = signV0 - 0.1;
    if (v1 - gb < 1.8) continue;
    const isDoor = h01(i * 13 + ci, 371) < 0.3 || (nb <= 2 && ci === 0);
    holes.push({ u0, u1, v0: gb + 0.02, v1 });
    cut(u0 - 0.1, u1 + 0.1);
    const rec = 0.32, cell = cellOf(ci, 0), it = h01(i + ci, 372) < 0.35 ? IT.CAFE : IT.SHOP;
    col(F, shade(frameC, 1.0), L.WOOD);
    reveals(F, u0, u1, gb + 0.02, v1, rec, 0, false);
    col(F, [0.24, 0.24, 0.25], L.TILE);
    F.q([u0, gb + 0.02, -rec], [u0, gb + 0.02, 0], [u1, gb + 0.02, 0], [u1, gb + 0.02, -rec]);
    if (isDoor) {
      const du0 = (u0 + u1) / 2 - 0.5, du1 = du0 + 1.0, dr = 1.0, bh = 0.5, tv = v1 - 0.5;
      col(F, frameC, L.METAL);
      F.box(u0, du0, gb, gb + bh, -rec - 0.05, -rec + 0.02, 1 | 16 | 4);
      F.box(du1, u1, gb, gb + bh, -rec - 0.05, -rec + 0.02, 1 | 16 | 8);
      glass(F, u0, du0, gb + bh, tv - 0.05, -rec, cell, it, 0, rec);
      glass(F, du1, u1, gb + bh, tv - 0.05, -rec, cell, it, 0, rec);
      glass(F, u0, u1, tv, v1, -rec, cell, it, 0, rec);
      col(F, frameC, L.METAL);
      F.box(u0, u1, tv - 0.05, tv, -rec, -rec + 0.06, 1 | 16 | 32);
      col(F, shade(frameC, 0.9), L.WOOD);
      F.q([du0, gb, -rec], [du0, gb, -rec - dr], [du0, tv - 0.05, -rec - dr], [du0, tv - 0.05, -rec], [1, 0.55, 0.55, 1]);
      F.q([du1, gb, -rec - dr], [du1, gb, -rec], [du1, tv - 0.05, -rec], [du1, tv - 0.05, -rec - dr], [0.55, 1, 1, 0.55]);
      F.q([du0, tv - 0.05, -rec - dr], [du1, tv - 0.05, -rec - dr], [du1, tv - 0.05, -rec], [du0, tv - 0.05, -rec]);
      col(F, [0.3, 0.3, 0.3], L.TILE);
      F.q([du0, gb + 0.01, -rec - dr], [du0, gb + 0.01, -rec], [du1, gb + 0.01, -rec], [du1, gb + 0.01, -rec - dr]);
      glass(F, du0 + 0.08, du1 - 0.08, gb + 0.28, gb + 2.05, -rec - dr + 0.02, cell, it, 0, rec + dr);
      col(F, frameC, L.METAL);
      F.box(du0, du1, gb, gb + 0.28, -rec - dr, -rec - dr + 0.05, 1 | 16);
      F.box(du0, du1, gb + 2.05, tv - 0.05, -rec - dr, -rec - dr + 0.05, 1 | 32);
      F.box(du0, du0 + 0.08, gb + 0.28, gb + 2.05, -rec - dr, -rec - dr + 0.05, 1 | 4);
      F.box(du1 - 0.08, du1, gb + 0.28, gb + 2.05, -rec - dr, -rec - dr + 0.05, 1 | 8);
      col(F, [0.7, 0.6, 0.35], L.METAL); F.box(du1 - 0.2, du1 - 0.16, gb + 0.9, gb + 1.3, -rec - dr + 0.05, -rec - dr + 0.1, 63);
    } else if (h01(i * 17 + ci, 373) < 0.12) {
      // closed: roll-down shutter + housing
      col(F, h01(i, 374) < 0.5 ? [0.5, 0.51, 0.52] : shade(T.accC, 0.8), L.ROLLUP);
      F.rect(u0, u1, gb, v1 - 0.3, -0.08);
      col(F, [0.18, 0.18, 0.2], L.METAL);
      F.box(u0 - 0.02, u1 + 0.02, v1 - 0.32, v1, -0.1, 0.12, 1 | 32 | 4 | 8);
    } else {
      const bh = 0.45 + h01(i, 375) * 0.2, tv = v1 - 0.5;
      col(F, h01(i, 376) < 0.5 ? [0.45, 0.45, 0.47] : shade(T.accC, 0.9), h01(i, 377) < 0.5 ? L.TILE : L.WOOD);
      F.box(u0, u1, gb, gb + bh, -rec - 0.05, -rec + 0.04, 1 | 16);
      glass(F, u0, u1, gb + bh, tv - 0.05, -rec, cell, it, 3, rec);
      glass(F, u0, u1, tv, v1, -rec, cell, it, 0, rec);
      col(F, frameC, L.METAL);
      F.box(u0, u1, tv - 0.05, tv, -rec, -rec + 0.06, 1 | 16 | 32);
      F.box(u0, u1, gb + bh - 0.03, gb + bh, -rec, -rec + 0.06, 1 | 16);
      const nm = Math.max(1, Math.round((u1 - u0) / 1.4));
      for (let k = 1; k < nm; k++) { const uu = u0 + (u1 - u0) * k / nm; F.box(uu - 0.03, uu + 0.03, gb + bh, v1, -rec, -rec + 0.06, 1 | 4 | 8); }
    }
    // pilasters between bays
    col(F, T.masonry ? STONE : T.trimC, T.masonry ? L.STONE : L.TRIM);
    F.box(cu0 - 0.18, cu0 + 0.16, gb - 0.05, signV0 - 0.05, 0, 0.1, 1 | 4 | 8);
    if (ci === nb - 1) F.box(cu0 + cw - 0.16, cu0 + cw + 0.18, gb - 0.05, signV0 - 0.05, 0, 0.1, 1 | 4 | 8);
  }
}
function lobby(T, kb, holes, cut) {
  const { Lw, margin, gH } = T;
  const u0 = Math.max(margin + 0.3, Lw / 2 - 3.2), u1 = Math.min(Lw - margin - 0.3, Lw / 2 + 3.2);
  if (u1 - u0 < 1.5) return;
  const gb = Math.max(T.gl(u0), T.gl(u1)), v1 = Math.min(gH - 0.7, gb + 3.2), rec = 0.8;
  if (v1 - gb < 2.4) return;
  holes.push({ u0, u1, v0: gb + 0.02, v1 });
  cut(u0 - 0.2, u1 + 0.2);
  col(F, [0.3, 0.29, 0.3], L.GRANITE); reveals(F, u0, u1, gb + 0.02, v1, rec, 0, false);
  col(F, [0.55, 0.52, 0.48], L.MARBLE); F.q([u0, gb + 0.02, -rec], [u0, gb + 0.02, 0], [u1, gb + 0.02, 0], [u1, gb + 0.02, -rec]);
  const nm = Math.max(2, Math.round((u1 - u0) / 1.8));
  for (let k = 0; k < nm; k++) {
    const a = u0 + (u1 - u0) * k / nm, b = u0 + (u1 - u0) * (k + 1) / nm;
    glass(F, a, b, gb + 0.02, v1, -rec, [u0, 0, u1 - u0, gH, 0, 0], IT.LOBBY, 3, rec);
    col(F, [0.12, 0.12, 0.13], L.METAL); F.box(a - 0.04, a + 0.04, gb, v1, -rec, -rec + 0.12, 1 | 4 | 8);
  }
  col(F, [0.12, 0.12, 0.13], L.METAL); F.box(u0, u1, gb, gb + 0.12, -rec, -rec + 0.1, 1 | 16);
  const cu = (u0 + u1) / 2, cwid = Math.min(5, (u1 - u0) * 0.7);
  col(F, [0.16, 0.16, 0.18], L.METAL); F.box(cu - cwid / 2, cu + cwid / 2, v1 + 0.1, v1 + 0.32, 0, 1.9, 63);
  lamp(F); for (let k = 0; k < 3; k++) { const uu = cu - cwid / 3 + k * cwid / 3; F.box(uu - 0.15, uu + 0.15, v1 + 0.08, v1 + 0.1, 0.7, 1.1, 32); }
  col(F, STONE, L.STONE);
  F.box(u0 - 0.35, u0, gb - 0.1, v1 + 0.1, 0, 0.12, 1 | 8 | 4); F.box(u1, u1 + 0.35, gb - 0.1, v1 + 0.1, 0, 0.12, 1 | 4 | 8);
}
function rollups(T, kb, holes, cut) {
  const { nb, cw, margin, gH, i } = T;
  for (let ci = 0; ci < nb; ci++) {
    const cu0 = margin + ci * cw, u0 = cu0 + cw * 0.12, u1 = cu0 + cw * 0.88;
    const gb = Math.max(T.gl(u0), T.gl(u1)), roll = ci % 2 === 0 || nb === 1;
    const dock = roll && h01(i * 11 + ci, 380) < 0.35, g0 = gb + (dock ? 1.15 : 0.02);
    const v1 = roll ? Math.min(g0 + 3.9, gH - 0.6) : Math.min(gb + 2.8, gH - 0.6);
    if (v1 - g0 < 2.2 || u1 - u0 < 1.6) continue;
    holes.push({ u0, u1, v0: roll ? g0 : gb + 0.02, v1 });
    cut(u0 - 0.15, u1 + 0.15);
    if (roll) {
      col(F, T.wallC, T.wallL); reveals(F, u0, u1, g0, v1, 0.3, 0, true);
      kb.fit('rollup_big', F, u0, g0, 0, u1 - u0, v1 - g0, 0.3, T.trimC, T.accC);
      if (dock) {
        col(F, CONC, L.CONCRETE); F.box(u0 - 0.5, u1 + 0.5, gb - 0.3, g0, 0, 1.4, 1 | 4 | 8 | 16);
        kb.fit('dock', F, (u0 + u1) / 2 - 1.6, g0, 1.4, 1, 1, 0, WHITE, WHITE);
      }
    } else {
      col(F, T.wallC, T.wallL); reveals(F, u0, u1, gb + 0.9, v1, 0.3, 0, true);
      holes[holes.length - 1].v0 = gb + 0.9;
      glass(F, u0, u1, gb + 0.9, v1, -0.3 + 0.012, [cu0, 0, cw, gH, ci, 0], IT.LOFT, 0, 0.3);
      kb.fit('win_loft', F, u0, gb + 0.9, 0, u1 - u0, v1 - gb - 0.9, 0.3, T.trimC, T.accC);
    }
  }
}
// apartment entry: recessed double door, glazed transom, stone surround, canopy with lights, steps
function entryFlat(T, kb, holes, cut, cu0, cw) {
  const ew = Math.min(2.0, cw - 0.5), u0 = cu0 + (cw - ew) / 2, u1 = u0 + ew;
  const gb = Math.max(T.gl(u0), T.gl(u1)) + 0.02, v1 = Math.min(gb + 2.9, T.gH - 0.25), rec = 0.9;
  if (v1 - gb < 2.4) return;
  holes.push({ u0, u1, v0: gb, v1 });
  cut(u0 - 0.35, u1 + 0.35);
  col(F, STONE, L.STONE); reveals(F, u0, u1, gb, v1, rec, 0, false);
  col(F, [0.45, 0.44, 0.42], L.TILE); F.q([u0, gb, -rec], [u0, gb, 0], [u1, gb, 0], [u1, gb, -rec]);
  const dm = (u0 + u1) / 2, dw = Math.min(1.0, (ew - 0.2) / 2);
  kb.fit('door_vic', F, dm - dw, gb, -rec + 0.005, dw, Math.min(2.3, v1 - gb - 0.4), 0, T.trimC, T.accC);
  kb.fit('door_vic', F, dm, gb, -rec + 0.005, dw, Math.min(2.3, v1 - gb - 0.4), 0, T.trimC, T.accC, 0, true);
  if (v1 - gb - 2.35 > 0.25) glass(F, u0, u1, gb + 2.35, v1, -rec + 0.02, [u0, 0, ew, 3, 0, 0], IT.LOBBY, 0, 0.1);
  col(F, STONE, L.STONE);
  F.box(u0 - 0.35, u0, gb - 0.1, v1 + 0.2, 0, 0.14, 1 | 4 | 8); F.box(u1, u1 + 0.35, gb - 0.1, v1 + 0.2, 0, 0.14, 1 | 4 | 8);
  F.box(u0 - 0.45, u1 + 0.45, v1 + 0.2, v1 + 0.5, 0, 0.22, 63);
  col(F, [0.14, 0.14, 0.16], L.METAL); F.box(u0 - 0.2, u1 + 0.2, v1 + 0.55, v1 + 0.75, 0, 1.7, 63);
  lamp(F); F.box((u0 + u1) / 2 - 0.2, (u0 + u1) / 2 + 0.2, v1 + 0.53, v1 + 0.55, 0.7, 1.1, 32);
  col(F, [0.6, 0.58, 0.55], L.PAVING); F.box(u0 - 0.2, u1 + 0.2, gb - 0.4, gb, 0, 0.45, 1 | 4 | 8 | 16);
  kb.fit('lamp_wall', F, u1 + 0.55, gb + 1.8, 0, 1, 1, 0, WHITE, WHITE);
  lamp(F); F.box(u1 + 0.5, u1 + 0.6, gb + 1.85, gb + 2.04, 0.14, 0.24, 63);
  // (v4) street number on the canopy fascia side of the surround, a pair of potted plants / a bike by the door
  const kd = T.kd || kb;
  if (u0 - 1.0 > 0.1) kd.fit(['num_a', 'num_b', 'num_c'][Math.floor(h01(T.i, 370) * 3)], F, u0 - 0.95, gb + 1.7, 0.0, 1, 1, 0, WHITE, WHITE);
  if (h01(T.i, 371) < 0.4) for (const u of [u0 - 0.7, u1 + 0.7]) if (u > 0.3 && u < T.Lw - 0.3) kd.fit('pot', F, u, gb - 0.02, 0.28, 1, 1, 0, WHITE, WHITE);
  if (h01(T.i, 372) < 0.08 && u1 + 2.8 < T.Lw) kd.fit('bike', F, u1 + 0.9, T.gl(u1 + 1.8) - 0.03, 0.02, 1, 1, 0, WHITE, [0.1, 0.12, 0.14]);
}
