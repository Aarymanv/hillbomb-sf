// Buildings v2 tile builders: pure functions over typed arrays, run in the build workers (v2worker.js) and, as a fallback
// / during the loading fill, on the main thread. ctx = { B, P, R } where B = wrapB(footprint arrays), P = plan arrays
// (v2plan.js) and R = a party-wall Raster. Results are MeshBuf vertex streams (see packBuf / geometryFrom).
import * as THREE from 'three';
import { MeshBuf } from './emit.js';
import { M, NEAR_OFF } from './material.js';
import { S } from './plan.js';
import { mulberry32 } from '../geo.js';
import { FRONT, prm, eachIn } from './v2plan.js';
import { simplify, grid, wall, flatRoof, pitchedRoof, RM, nearWall } from './v2geom.js';
import { v3Eligible, v3Wall, FSTRIDE } from './v3front.js';
import { bayCells, V3LOD, KitCells, kitReady, towerInfo, setTower, chamfer, rim, rimH, hasRim, roofY, midFront, gable, crown, clutterPlan, clutterMid, clutterKit, nearKitWall, falseFrontH, falseFront, solar, hasSaw, sawtooth } from './v2detail.js';
import { buildDressTile } from './v2dressgeo.js';
import { cornerPlan, turret, mansardOf, mansard, balconyPlan, balconies, crestOf, crest } from './v5mass.js';
import { yard, roofDeck, YCOL, mergeYardCols } from './v6yard.js';

// arrays that cross the worker boundary
export const B_KEYS = ['verts', 'v0', 'nv', 'tileOf', 'tileFirst', 'tileCount', 'base', 'h', 'minH'];
export const P_KEYS = ['cx', 'cz', 'area', 'minX', 'minZ', 'maxX', 'maxZ', 'ox', 'oz', 'ohx', 'ohz', 'oyaw', 'fill', 'y0', 'yb', 'yEave', 'yTop',
  'style', 'zone', 'pitched', 'edge', 'roofC', 'roofL', 'flags', 'pc', 'corr', 'swd', 'lotF', 'lotN', 'N0', 'par', 'eg', 'v3', 'nov5', 'nov6', 'yg', 'yd', 'ys'];



export function wrapB(b) {
  const B = { ...b };
  B.ring = (i, out = []) => {
    const t = B.tileOf[i], ox = B.X0 + (t % B.TC) * B.tile, oz = B.Z0 + Math.floor(t / B.TC) * B.tile;
    out.length = B.nv[i] * 2;
    for (let k = 0, v = B.v0[i] * 2, n = B.nv[i]; k < n; k++, v += 2) { out[k * 2] = ox + B.verts[v] / 16; out[k * 2 + 1] = oz + B.verts[v + 1] / 16; }
    return out;
  };
  B.inTile = (tx, tz) => { const t = tz * B.TC + tx; return t >= 0 && t < B.TC * B.TR && tx >= 0 && tx < B.TC ? [B.tileFirst[t], B.tileCount[t]] : [0, 0]; };
  return B;
}

const ring = [], idx = [], g = [0];
function orient(n) { let a = 0; for (let k = 0; k < n; k++) { const kk = (k + 1) % n; a += ring[k * 2] * ring[kk * 2 + 1] - ring[kk * 2] * ring[k * 2 + 1]; } return a < 0 ? -1 : 1; }
function modes(P, i) {
  const st = P.style[i], big = P.yEave[i] - P.y0[i] >= 16 || P.area[i] > 1000;
  return [st === S.TOWER_GLASS ? M.CURTAIN : M.PROC, st === S.TOWER_GLASS ? M.CURTAIN : big ? M.SIDEX : M.BACK];
}
const roofOf = (P, i) => [P.roofC[i * 3], P.roofC[i * 3 + 1], P.roofC[i * 3 + 2]];
const wallCOf = (P, i) => [prm(P, i, 3, 0), prm(P, i, 3, 1), prm(P, i, 3, 2)];

// lot pieces: is the point just outside a wall inside a sibling lot at least as tall? (FAR skips those hidden walls)
const sring = [];
function sibCovers(P, B, j, x, z, ye) {
  const p = P.par ? P.par[j] : -1; if (p < 0) return false;
  for (let s = P.lotF[p], e = s + P.lotN[p]; s < e; s++) {
    if (s === j || P.yEave[s] < ye - 0.3 || x < P.minX[s] || x > P.maxX[s] || z < P.minZ[s] || z > P.maxZ[s]) continue;
    B.ring(s, sring);
    let c = false; const n = sring.length / 2;
    for (let k = 0, q = n - 1; k < n; q = k++) { const zk = sring[k * 2 + 1], zq = sring[q * 2 + 1]; if ((zk > z) !== (zq > z) && x < (sring[q * 2] - sring[k * 2]) * (z - zk) / (zq - zk) + sring[k * 2]) c = !c; }
    if (c) return true;
  }
  return false;
}

// ------------------------------------------------------------------ FAR: one building, simplified
export function emitFar({ B, P }, buf, i) {
  B.ring(i, ring);
  const n = ring.length / 2; if (n < 3) return;
  buf.sid = i;
  const y0 = P.y0[i], yb = P.yb[i], ye = P.yEave[i], margin = prm(P, i, 0, 3), bay = prm(P, i, 9, 0), noWin = P.flags[i] & 32;
  const [mainM, otherM] = modes(P, i), sgn = orient(n), v0 = B.v0[i];
  const small = P.ohx[i] * P.ohz[i] * 4 < 450 && ye - y0 < 20 && P.fill[i] > 0.6, lot = P.par && P.par[i] >= 0;
  const pt = P.pitched[i];
  if (small || n <= 4) {
    const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), hx = P.ohx[i], hz = P.ohz[i], ox = P.ox[i], oz = P.oz[i];
    const cr = (lx, lz) => [ox + c * lx + s * lz, oz - s * lx + c * lz];
    const sides = [[hx, -hz, hx, hz, c, -s], [hx, hz, -hx, hz, s, c], [-hx, hz, -hx, -hz, -c, s], [-hx, -hz, hx, -hz, -s, -c]];
    for (const [ax, az, bx, bz, nx, nz] of sides) {
      let front = false;
      for (let k = 0; k < n && !front; k++) {
        if (!(P.edge[v0 + k] & FRONT)) continue;
        const kk = (k + 1) % n, ex = ring[kk * 2] - ring[k * 2], ez = ring[kk * 2 + 1] - ring[k * 2 + 1], l = Math.hypot(ex, ez) || 1;
        if ((sgn * ez / l) * nx + (-sgn * ex / l) * nz > 0.7) front = true;
      }
      const A = cr(ax, az), Bq = cr(bx, bz), len = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]);
      if (lot && !front && sibCovers(P, B, i, (A[0] + Bq[0]) / 2 + nx * 0.6, (A[1] + Bq[1]) / 2 + nz * 0.6, ye)) continue;
      const nb = noWin ? 0 : grid(len, margin, bay, g);
      wall(buf, A[0], A[1], Bq[0], Bq[1], nx, nz, y0, yb, ye, front ? mainM : otherM, g[0], nb);
    }
    if (pt > 0 && pt < 8) pitchedRoof(buf, P, i, pt, wallCOf(P, i), prm(P, i, 9, 2), true);
    else {
      const q = [cr(hx, -hz), cr(hx, hz), cr(-hx, hz), cr(-hx, -hz)];
      ring.length = 8; for (let k = 0; k < 4; k++) { ring[k * 2] = q[k][0]; ring[k * 2 + 1] = q[k][1]; }
      flatRoof(buf, ring, Q4, ye, P.roofL[i], roofOf(P, i));
    }
    return;
  }
  simplify(ring, n, ye - y0 > 45 ? 0.8 : 1.5, idx);
  if (idx.length > 40) simplify(ring, n, 3, idx);
  const m = idx.length;
  for (let q = 0; q < m; q++) {
    const a = idx[q], b = idx[(q + 1) % m];
    const ax = ring[a * 2], az = ring[a * 2 + 1], bx = ring[b * 2], bz = ring[b * 2 + 1];
    const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
    if (len < 0.5) continue;
    let front = false;
    for (let e = a; e !== b && !front; e = (e + 1) % n) if (P.edge[v0 + e] & FRONT) front = true;
    if (lot && !front && sibCovers(P, B, i, ax + ex * 0.5 + sgn * ez / len * 0.6, az + ez * 0.5 - sgn * ex / len * 0.6, ye)) continue;
    const nb = noWin ? 0 : grid(len, margin, bay, g);
    wall(buf, ax, az, bx, bz, sgn * ez / len, -sgn * ex / len, y0, yb, ye, front ? mainM : otherM, g[0], nb);
  }
  if (pt > 0 && pt < 8) pitchedRoof(buf, P, i, pt, wallCOf(P, i), prm(P, i, 9, 2), true);
  else { flatRoof(buf, ring, idx, ye, P.roofL[i], roofOf(P, i)); if (pt >= 8) pitchedRoof(buf, P, i, pt); else { const tw = towerInfo(P, i); if (tw.crown) { setTower(tw); crown(buf, P, i, ye, P.ohx[i], P.ohz[i]); } } }
}
const Q4 = [0, 1, 2, 3];

// FAR chunk: every building of the given list
export function buildFarChunk(ctx, list) {
  const buf = new MeshBuf(false, 65536);
  for (const i of list) emitFar(ctx, buf, i);
  return buf;
}

// ------------------------------------------------------------------ MID: one 512 m tile with party walls + roofs
const PT = [0.2, 0.5, 0.8];
export function buildMidTile({ B, P, R }, tile, hidden) {
  const [f, c] = B.inTile(tile.tx, tile.tz);
  // party raster: this tile + neighbours near the border
  R.begin(tile.x0, tile.z0);
  const ex0 = tile.x0 - RM, ez0 = tile.z0 - RM, ex1 = tile.x1 + RM, ez1 = tile.z1 + RM;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const [f2, c2] = B.inTile(tile.tx + dx, tile.tz + dz);
    eachIn(P, f2, c2, null, (j) => {
      if (P.maxX[j] < ex0 || P.minX[j] > ex1 || P.maxZ[j] < ez0 || P.minZ[j] > ez1) return;
      B.ring(j, ring); R.poly(ring, ring.length / 2, j);
    });
  }
  const buf = new MeshBuf(false, 32768), fronts = [];
  const rnd = mulberry32(tile.key * 7919 + 13);
  YCOL.on = true; YCOL.out.length = 0;
  try { eachIn(P, f, c, hidden, (i) => emitMid(P, B, R, buf, i, fronts, rnd)); } finally { YCOL.on = false; }
  const ycols = mergeYardCols(YCOL.out); YCOL.out.length = 0;   // yard fence / shed colliders (v6yard.js)
  return { buf, fronts: packFronts(fronts), ycols };
}
const EX = [], EZ = [], EF = [], EG = [], FW = [], PL = [], EP = [];
function emitMid(P, B, R, buf, i, fronts, rnd) {
  B.ring(i, ring);
  const n = ring.length / 2; if (n < 3) return;
  buf.sid = i + NEAR_OFF;
  const y0 = P.y0[i], yb = P.yb[i], ye = P.yEave[i], margin = prm(P, i, 0, 3), bay = prm(P, i, 9, 0), noWin = P.flags[i] & 32;
  const [mainM, otherM] = modes(P, i), sgn = orient(n), v0 = B.v0[i], sty = P.style[i];
  const facety = sty === S.VICTORIAN || sty === S.EDWARDIAN || sty === S.APARTMENT, pi = P.par ? P.par[i] : -1;
  simplify(ring, n, 0.3, idx);
  const m = idx.length;
  // simplified polygon + per-edge street-front flag
  EX.length = 0; EZ.length = 0; EF.length = 0; EG.length = 0;
  for (let q = 0; q < m; q++) {
    const a = idx[q], b = idx[(q + 1) % m];
    let front = 0;
    for (let e = a; e !== b && !front; e = (e + 1) % n) if (P.edge[v0 + e] & FRONT) front = 1;
    const g = P.eg ? P.eg[v0 + a] : -32768;
    EX.push(ring[a * 2]); EZ.push(ring[a * 2 + 1]); EF.push(front); EG.push(g === -32768 ? 0 : Math.max(-6, Math.min(1, g / 20 - P.y0[i])));
  }
  const V3 = v3Eligible(P, i);
  const tw = towerInfo(P, i); setTower(tw);
  if (tw.chamfer) chamfer(EX, EZ, EF, sgn);
  // (v5) a street corner: round Queen Anne turret, or a chamfered corner (applied to the polygon here, so the v3 street
  // facades get the cut edge as a front too)
  const cp = !tw.chamfer && !tw.ySet ? cornerPlan(P, i, EX, EZ, EF, EG, sgn) : null;
  const k = EX.length, yw = tw.ySet || ye;
  // false front: side / back walls stop below the street wall, which rises as a parapet front (v2plan flag 64)
  const ff = (P.flags[i] & 64) && !P.pitched[i] && !tw.ySet ? falseFrontH(P, i) : 0;
  let best = -1, bestL = 0;
  FW.length = 0; EP.length = k; EP.fill(1);
  for (let q = 0; q < k; q++) {
    const qq = (q + 1) % k;
    let ax = EX[q], az = EZ[q], bx = EX[qq], bz = EZ[qq];
    const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
    if (len < 0.1) continue;
    const nx = sgn * ez / len, nz = -sgn * ex / len;
    let front = EF[q] > 0;
    let hits = 0, ntop = -1e9, sib = 0;
    for (const t of PT) {
      const id = R.at(ax + ex * t + nx * 0.9, az + ez * t + nz * 0.9);
      if (id && id - 1 !== i) { hits++; ntop = Math.max(ntop, P.yEave[id - 1]); if (pi >= 0 && P.par[id - 1] === pi) sib++; }
    }
    const party = hits >= 2 || (len < 3 && hits >= 1);
    EP[q] = party || front ? 1 : 0;
    const ywE = ff && !EF[q] ? yw - ff : yw;
    if (party && ntop >= ywE - 2.5) { if (ntop < ywE - 0.05 || sib < 3) wall(buf, ax, az, bx, bz, nx, nz, y0, yb, ywE, M.BACK, 1, 0); continue; }
    let ylo = yb;
    if (party && ntop > yb + 1) { wall(buf, ax, az, bx, bz, nx, nz, y0, yb, ntop, M.BACK, 1, 0); ylo = ntop; front = false; }
    let nb, cw;
    if (noWin) { nb = 0; cw = 1; }
    else if (front && facety && len >= 1.0 && len < 3.0) { nb = -1; cw = len; }
    else { nb = grid(len, margin, bay, g); cw = g[0]; }
    const v3w = V3 && front && !party && len >= 2.5 && !tw.chamfer;
    wall(buf, ax, az, bx, bz, nx, nz, y0, ylo, ywE, (front ? mainM : otherM) + (v3w ? V3LOD : 0), cw, nb);
    if (front && !party && len >= 2.5) {
      let ga = EG[q], gb = EG[qq];
      if ((bx - ax) * nz - (bz - az) * nx < 0) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; t = ga; ga = gb; gb = t; }
      fronts.push(i, ax, az, bx, bz, nx, nz, len, 0, ga, gb);
      FW.push(ax, az, bx, bz, len);
      if (len > bestL) { bestL = len; best = fronts.length - FSTRIDE; }
    }
  }
  if (best >= 0) fronts[best + 8] = 1;
  // street-front detail: cornices, belt courses, bays; a Victorian front gable on the main front
  for (let o = 0; o < FW.length; o += 5) midFront(buf, P, i, FW[o], FW[o + 1], FW[o + 2], FW[o + 3], FW[o + 4], V3 && !tw.chamfer ? V3LOD : 0);
  if (best >= 0 && (sty === S.VICTORIAN || sty === S.EDWARDIAN)) gable(buf, P, i, fronts[best + 1], fronts[best + 2], fronts[best + 3], fronts[best + 4], fronts[best + 7]);
  // (v5) mansard attic on the main front, balconies / Juliet rails, corner turret
  if (best >= 0) {
    const fa = fronts[best + 1], fz = fronts[best + 2], fb = fronts[best + 3], fc = fronts[best + 4], fl = fronts[best + 7];
    if (mansardOf(P, i)) mansard(buf, P, i, fa, fz, fb, fc, fl);
    else { const ck = crestOf(P, i); if (ck) crest(buf, P, i, fa, fz, fb, fc, fl, ck); }
    const nb5 = grid(fl, margin, bay, g), cw5 = g[0];
    const bp = balconyPlan(P, i, nb5, bayCells(P, i, nb5, fl));
    if (bp.length) balconies(buf, P, i, fa, fz, fb, fc, fl, bp, nb5, cw5);
  }
  if (cp && cp.kind === 'turret') turret(buf, P, i, cp);
  // (v6) back yard: lot-line fences, deck / patio / beds / shed (v6yard.js)
  if (P.yg && P.yg[i] > -1e3) yard(buf, P, R, i, EX, EZ, EP, sgn);
  const pt = P.pitched[i];
  // roofs: flat roofs sit below a coped parapet rim; pitched / domes as before; tower setback + crown
  const roofPoly = () => { ring.length = k * 2; idx.length = k; for (let q = 0; q < k; q++) { ring[q * 2] = EX[q]; ring[q * 2 + 1] = EZ[q]; idx[q] = q; } };
  if (pt > 0 && pt < 8) pitchedRoof(buf, P, i, pt, wallCOf(P, i), prm(P, i, 9, 2));
  else {
    const rimOn = hasRim(P, i), rh = rimOn ? rimH(P, i) : 0;
    let ry = ye - rh;
    if (tw.ySet) {
      const hs = rimH(P, i) * 0.7;
      rim(buf, P, i, EX, EZ, sgn, tw.ySet, hs);
      roofPoly(); flatRoof(buf, ring, idx, tw.ySet - hs, P.roofL[i], roofOf(P, i));
      // upper block: the OBB inset, walls with the same window grid, own rim
      const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), hx = P.ohx[i] - tw.inset, hz = P.ohz[i] - tw.inset, ox = P.ox[i], oz = P.oz[i];
      const cr = (lx, lz) => [ox + c * lx + s * lz, oz - s * lx + c * lz];
      const sides = [[hx, -hz, hx, hz, c, -s], [hx, hz, -hx, hz, s, c], [-hx, hz, -hx, -hz, -c, s], [-hx, -hz, hx, -hz, -s, -c]];
      EX.length = 0; EZ.length = 0;
      for (const [ax, az, bx, bz, nx, nz] of sides) {
        const A = cr(ax, az), Bq = cr(bx, bz), len = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]);
        const nb = noWin ? 0 : grid(len, margin, bay, g);
        wall(buf, A[0], A[1], Bq[0], Bq[1], nx, nz, y0, tw.ySet - hs, ye, mainM, g[0], nb);
        EX.push(A[0]); EZ.push(A[1]);
      }
      const s4 = orientXZ(EX, EZ);
      rim(buf, P, i, EX, EZ, s4, ye, rh);
      ring.length = 8; for (let q = 0; q < 4; q++) { ring[q * 2] = EX[q]; ring[q * 2 + 1] = EZ[q]; }
      flatRoof(buf, ring, Q4, ry, P.roofL[i], roofOf(P, i));
      if (tw.crown) crown(buf, P, i, ry, hx, hz);
    } else {
      if (ff) { const rs = 0.35; falseFront(buf, P, i, EX, EZ, EF, sgn, ye, ff, rs); ry = ye - ff - rs; }
      else if (rimOn) rim(buf, P, i, EX, EZ, sgn, ye, rh);
      if (tw.chamfer) roofPoly();
      flatRoof(buf, ring, idx, ry, P.roofL[i], roofOf(P, i));
      if (hasSaw(P, i)) sawtooth(buf, P, i, ry);
      if (pt >= 8) pitchedRoof(buf, P, i, pt);
      else if (tw.crown) crown(buf, P, i, ry, P.ohx[i], P.ohz[i]);
    }
  }
  if (pt < 8) { B.ring(i, ring); clutterPlan(P, i, ring, PL); if (PL.length) clutterMid(buf, P, i, PL, pt ? P.yEave[i] : roofY(P, i)); }
  if (!pt) { B.ring(i, ring); solar(buf, P, i, ring, roofY(P, i)); if (!tw.ySet) roofDeck(buf, P, i, ring, roofY(P, i)); }
}
function orientXZ(X, Zs) { let a = 0; const n = X.length; for (let k = 0; k < n; k++) { const kk = (k + 1) % n; a += X[k] * Zs[kk] - X[kk] * Zs[k]; } return a < 0 ? -1 : 1; }
function packFronts(a) { return new Float32Array(a); }

// ------------------------------------------------------------------ NEAR: 3D street-facade details from the MID front list
export function buildNearTile({ B, P }, key, fronts, hidden, tx = key % B.TC, tz = Math.floor(key / B.TC)) {
  const buf = new MeshBuf(true, 16384), rnd = mulberry32(key * 131 + 7), w = { i: 0, ax: 0, az: 0, bx: 0, bz: 0, nx: 0, nz: 0, len: 0, main: false, ga: 0, gb: 0 };
  const kit = kitReady(), kb = kit ? new KitCells() : null;
  for (let o = 0; o + FSTRIDE <= fronts.length; o += FSTRIDE) {
    const i = fronts[o] | 0;
    if (hidden && hidden.has(i)) continue;
    w.i = i; w.ax = fronts[o + 1]; w.az = fronts[o + 2]; w.bx = fronts[o + 3]; w.bz = fronts[o + 4]; w.nx = fronts[o + 5]; w.nz = fronts[o + 6]; w.len = fronts[o + 7]; w.main = fronts[o + 8] > 0.5;
    w.ga = fronts[o + 9]; w.gb = fronts[o + 10];
    buf.sid = i + NEAR_OFF;
    // v3: real street facades (walls with openings, reveals, interior-mapped glass, Blender kit frames / doors / trims)
    // replace the MID wall (V3LOD there, KITHI here: swapped per building with its v3 kit cell, hide channel B)
    if (kit && v3Eligible(P, i) && !towerInfo(P, i).chamfer) { const fb = kb.fb3(P, i); fb.sid = i + NEAR_OFF; v3Wall(fb, kb.at3(P, i), P, i, w, rnd, kb.at3d(P, i)); }
    else nearWall(buf, P, w, rnd, kit);
    if (kit) nearKitWall(kb.at(P, i), P, i, w);
  }
  // rooftop kit pieces (same deterministic plan as the MID stand-ins)
  if (kit) {
    const [f, c] = B.inTile(tx, tz);
    eachIn(P, f, c, hidden, (i) => {
      if (P.pitched[i] >= 8) return;
      B.ring(i, ring); clutterPlan(P, i, ring, PL);
      if (PL.length) clutterKit(kb.at(P, i), PL, P.pitched[i] ? P.yEave[i] : roofY(P, i));
    });
  }
  return { buf, kit: kb };
}

// ------------------------------------------------------------------ DRESS: storefront signs / awnings / neon (v2dressgeo.js)
export function buildDress(ctx, key, hidden, tx, tz) { return buildDressTile(ctx, key, hidden, tx, tz); }

// ------------------------------------------------------------------ transfer helpers
export function packBuf(buf) {
  const n = buf.n, pos = buf.pos.slice(0, n * 3);
  // bounds computed here (build worker), not by computeBoundingBox / Sphere on the main thread (2 passes over up to
  // ~1M vertices per MID tile / FAR chunk when the result is applied)
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n * 3; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2; let r2 = 0;
  for (let i = 0; i < n * 3; i += 3) { const dx = pos[i] - cx, dy = pos[i + 1] - cy, dz = pos[i + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  return { n, ni: buf.ni, pos, nrm: buf.nrm.slice(0, n * 3), uv: buf.uv.slice(0, n * 4), c: buf.c.slice(0, n * 4),
    k: buf.k.slice(0, n), id: buf.id.slice(0, n), idx: buf.idx.slice(0, buf.ni), g: buf.glass ? buf.g.slice(0, n * 4) : null, bb: n ? [x0, y0, z0, x1, y1, z1, Math.sqrt(r2)] : null };
}
export const transferList = (p) => { const l = [p.pos.buffer, p.nrm.buffer, p.uv.buffer, p.c.buffer, p.k.buffer, p.id.buffer, p.idx.buffer]; if (p.g) l.push(p.g.buffer); return l; };
export function geometryFrom(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3, true));
  g.setAttribute('aUv', new THREE.BufferAttribute(p.uv, 4));
  g.setAttribute('aC', new THREE.BufferAttribute(p.c, 4, true));
  g.setAttribute('aK', new THREE.BufferAttribute(p.k, 1));
  g.setAttribute('aId', new THREE.BufferAttribute(p.id, 1));
  if (p.g) g.setAttribute('aG', new THREE.BufferAttribute(p.g, 4));
  g.setIndex(new THREE.BufferAttribute(p.idx, 1));
  if (p.bb) {
    const b = p.bb; g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), b[6]);
  } else { g.computeBoundingSphere(); g.computeBoundingBox(); }
  return g;
}
