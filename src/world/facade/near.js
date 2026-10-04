// Near LOD: real 3D street facades, streamed per CELL x CELL m cell around the camera and merged into 3 meshes per
// cell (facade material / alpha-tested ironwork / signs+murals). A cell's buildings are hidden in the far meshes once
// its near meshes exist (hide texture), and shown again when the cell is dropped.
import * as THREE from 'three';
import { MeshBuf, Frame } from './emit.js';
import { M, FLAG, NEAR_OFF, KIT, KIT_KEYS, facadeKit } from './material.js';
import { L } from './layers.js';
import { S, GT, WT, IT } from './plan.js';
import { frames, turret, procRect } from './far.js';
import { mulberry32 } from '../geo.js';
import { makeNearMaterials, DECAL, CUT, signSlot, isNeonSlot } from './decals.js';

export const CELL = 96;
const R_IN = 150, R_OUT = 190, BUDGET_MS = 4;

export class NearLOD {
  constructor({ specs, group, mat, depth, hideData, hideTex, night, time, H }) {
    Object.assign(this, { specs, group, mat, depth, hideData, hideTex, H });
    this.cells = new Map();
    for (const sp of specs) {
      const ix = Math.floor(sp.x / CELL), iz = Math.floor(sp.z / CELL), k = ix * 4096 + iz;
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, c = { k, ix, iz, specs: [], meshes: null, d: 0 });
      c.specs.push(sp);
    }
    const nm = makeNearMaterials(night, time);
    this.decalMat = nm.decal; this.cutMat = nm.cut; this.cutDepth = nm.cutDepth; this.glowMat = nm.glow;
    this.main = new MeshBuf(true, 1 << 16); this.cut = new MeshBuf(false, 1 << 13); this.dec = new MeshBuf(false, 1 << 12); this.glow = new MeshBuf(false, 1 << 10);
    this.X = { F: new Frame(this.main), C: new Frame(this.cut), D: new Frame(this.dec), G: new Frame(this.main), L: new Frame(this.glow), H };
    this.built = [];
    this.stats = { cells: 0, tris: 0, lastMs: 0 };
    this.enabled = true;
  }
  // streams one cell at a time; a cell's buildings are emitted incrementally (BUDGET_MS per frame) and the cell's
  // meshes appear (and its far boxes hide) only once it is complete, so there are no holes and no frame spikes.
  update(dt, camera) {
    if (!this.enabled) return;
    // cells built before the baked kit's layout arrived are rebuilt once with it
    if (!this.kitSeen && facadeKit().json) { this.kitSeen = true; if (this.built.length || this.job) this.rebuildAll(); }
    const px = camera.position.x, pz = camera.position.z;
    // drop far cells
    for (let i = this.built.length - 1; i >= 0; i--) {
      const c = this.built[i];
      if (cellDist(c, px, pz) > R_OUT) { this.drop(c); this.built[i] = this.built[this.built.length - 1]; this.built.pop(); }
    }
    const t0 = performance.now();
    const job = this.job;
    if (job) {
      job.c.d = cellDist(job.c, px, pz);
      if (job.c.d > R_OUT) this.job = null;          // camera moved away: abandon
      else { this.step(t0, job.c.d < 30 ? 14 : BUDGET_MS); this.stats.lastMs = performance.now() - t0; return; }
    }
    // nearest wanted cell
    let best = null;
    const r = Math.ceil(R_IN / CELL) + 1, cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    for (let ix = cx - r; ix <= cx + r; ix++) for (let iz = cz - r; iz <= cz + r; iz++) {
      const c = this.cells.get(ix * 4096 + iz);
      if (!c || c.meshes) continue;
      c.d = cellDist(c, px, pz);
      if (c.d < R_IN && (!best || c.d < best.d)) best = c;
    }
    if (!best) return;
    this.begin(best);
    this.step(t0, best.d < 30 ? 14 : BUDGET_MS);
    this.stats.lastMs = performance.now() - t0;
  }
  begin(c) {
    this.main.reset(); this.cut.reset(); this.dec.reset(); this.glow.reset();
    this.job = this.jobObj || (this.jobObj = { c: null, i: 0 });
    this.job.c = c; this.job.i = 0;
  }
  step(t0, budget) {
    const job = this.job, specs = job.c.specs;
    while (job.i < specs.length) {
      const sp = specs[job.i++];
      try { emitNear(sp, this.X); } catch (e) { console.warn('[buildings] near emit failed', sp.id, e); }
      if (performance.now() - t0 > budget) break;
    }
    if (job.i >= specs.length) { this.finish(job.c); this.job = null; }
  }
  // synchronous build of one cell (tools / tests)
  build(c) { this.begin(c); this.step(performance.now(), 1e9); }
  finish(c) {
    const { main, cut, dec, glow } = this;
    c.meshes = [];
    const add = (B, mat, depthMat, cast, glowMesh = false) => {
      if (B.empty) return;
      const m = new THREE.Mesh(B.toGeometry(), mat);
      if (depthMat) m.customDepthMaterial = depthMat;
      m.castShadow = cast; m.receiveShadow = !glowMesh; m.matrixAutoUpdate = false; m.name = 'bld-near';
      if (glowMesh) m.renderOrder = 1;
      this.group.add(m); c.meshes.push(m);
      this.stats.tris += B.ni / 3;
    };
    add(main, this.mat, this.depth, true);
    add(cut, this.cutMat, this.cutDepth, true);
    add(dec, this.decalMat, null, false);
    add(glow, this.glowMat, null, false, true);
    for (const sp of c.specs) this.hideData[sp.id] = 255;
    this.hideTex.needsUpdate = true;
    this.built.push(c);
    this.stats.cells++;
  }
  drop(c) {
    for (const m of c.meshes) { this.group.remove(m); this.stats.tris -= m.geometry.index.count / 3; m.geometry.dispose(); }
    c.meshes = null;
    for (const sp of c.specs) this.hideData[sp.id] = 0;
    this.hideTex.needsUpdate = true;
    this.stats.cells--;
  }
  rebuildAll() { for (const c of this.built) this.drop(c); this.built.length = 0; this.job = null; }
}
function cellDist(c, px, pz) {
  const x0 = c.ix * CELL, z0 = c.iz * CELL;
  const dx = Math.max(x0 - px, 0, px - x0 - CELL), dz = Math.max(z0 - pz, 0, pz - z0 - CELL);
  return Math.hypot(dx, dz);
}

// =====================================================================================================================
// emission helpers
// =====================================================================================================================
const gv = (sp, u) => sp.gA + sp.gB * u;           // sidewalk height (rel. y0) at facade u
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const WHITE = [0.86, 0.85, 0.82], DARKMETAL = [0.09, 0.09, 0.1], CONCRETE = [0.62, 0.6, 0.57], STONE = [0.66, 0.62, 0.55];

// wall plane (d = 0) over [u0,u1]x[v0,v1] with rectangular holes {u0,u1,v0,v1}
function wallHoles(F, u0, u1, v0, v1, holes) {
  const hs = holes.filter(h => h.u1 > u0 && h.u0 < u1 && h.v1 > v0 && h.v0 < v1);
  const vs = [v0, v1];
  for (const h of hs) { if (h.v0 > v0 && h.v0 < v1) vs.push(h.v0); if (h.v1 > v0 && h.v1 < v1) vs.push(h.v1); }
  vs.sort((a, b) => a - b);
  const bands = [];
  for (let i = 0; i < vs.length - 1; i++) {
    const a = vs[i], b = vs[i + 1];
    if (b - a < 1e-4) continue;
    const act = hs.filter(h => h.v0 <= a + 1e-4 && h.v1 >= b - 1e-4).sort((p, q) => p.u0 - q.u0);
    const sig = act.map(h => h.u0.toFixed(3) + ':' + h.u1.toFixed(3)).join('|');
    const last = bands[bands.length - 1];
    if (last && last.sig === sig && Math.abs(last.b - a) < 1e-4) last.b = b; else bands.push({ a, b, act, sig });
  }
  for (const { a, b, act } of bands) {
    let cur = u0;
    for (const h of act) { if (h.u0 > cur + 1e-3) F.rect(cur, Math.min(h.u0, u1), a, b, 0); cur = Math.max(cur, h.u1); }
    if (u1 > cur + 1e-3) F.rect(cur, u1, a, b, 0);
  }
}

// glass quad (interior-mapped) in F at depth d
function glass(F, u0, u1, v0, v1, d, cu0, cv0, cw, ch, ci, row, itype, bars, rec, unit = -1) {
  const B = F.b;
  const sk = B.sk, s0 = B.sc[0], s1 = B.sc[1], s2 = B.sc[2], s3 = B.sc[3];
  B.sk = M.GLASS + 32 * (unit + 1); B.sc[0] = ci & 255; B.sc[1] = row & 255; B.sc[2] = itype * 16 + bars; B.sc[3] = Math.min(255, rec * 255);
  B.sg[0] = u0 - cu0; B.sg[1] = v0 - cv0; B.sg[2] = u1 - cu0; B.sg[3] = v1 - cv0;
  B.sz = cw; B.sw = ch;
  const nx = F.nx, nz = F.nz;
  const a = B.v(F.wx(u0, d), F.oy + v0, F.wz(u0, d), nx, 0, nz, u0 - cu0, v0 - cv0);
  const b = B.v(F.wx(u1, d), F.oy + v0, F.wz(u1, d), nx, 0, nz, u1 - cu0, v0 - cv0);
  const c = B.v(F.wx(u1, d), F.oy + v1, F.wz(u1, d), nx, 0, nz, u1 - cu0, v1 - cv0);
  const e = B.v(F.wx(u0, d), F.oy + v1, F.wz(u0, d), nx, 0, nz, u0 - cu0, v1 - cv0);
  B.quad(a, b, c, e);
  B.sk = sk; B.sc[0] = s0; B.sc[1] = s1; B.sc[2] = s2; B.sc[3] = s3; B.sg[0] = B.sg[1] = B.sg[2] = B.sg[3] = 0;
}

// recessed opening: reveals (with vertex AO toward the back) + optional arch top
function reveals(F, u0, u1, v0, v1, rec, arch = 0, bottom = true) {
  const A = [1, 0.55, 0.55, 1];
  F.q([u0, v0, 0], [u0, v0, -rec], [u0, v1 - arch, -rec], [u0, v1 - arch, 0], [1, 0.55, 0.55, 1]);
  F.q([u1, v0, -rec], [u1, v0, 0], [u1, v1 - arch, 0], [u1, v1 - arch, -rec], [0.55, 1, 1, 0.55]);
  if (bottom) F.q([u0, v0, -rec], [u0, v0, 0], [u1, v0, 0], [u1, v0, -rec], [0.6, 1, 1, 0.6]);
  if (!arch) F.q([u0, v1, -rec], [u1, v1, -rec], [u1, v1, 0], [u0, v1, 0], [0.5, 0.5, 0.85, 0.85]);
  else {
    const r = (u1 - u0) / 2, cu = u0 + r, cv = v1 - r, n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI;
      const p0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], p1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
      F.q([p0[0], p0[1], -rec], [p1[0], p1[1], -rec], [p1[0], p1[1], 0], [p0[0], p0[1], 0], [0.5, 0.5, 0.85, 0.85]);
    }
  }
}
// wall fill between an arched opening's semicircle and its bounding rectangle (so the rect can be a hole)
function archSpandrels(F, u0, u1, v1) {
  const r = (u1 - u0) / 2, cu = u0 + r, cv = v1 - r, n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI;
    const p0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], p1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
    const corner = i < n / 2 ? [u0, v1] : [u1, v1];
    F.tri([p0[0], p0[1], 0], [p1[0], p1[1], 0], [corner[0], corner[1], 0]);
  }
  F.tri([cu, v1, 0], [u0, v1, 0], [cu, cv + r, 0]);
}

// sash: frame ring + meeting rail / mullions, standing in front of the glass
function sash(F, u0, u1, v0, v1, d, bars, arch = 0) {
  const fw = 0.055, dd = 0.06;
  const vt = v1 - arch;
  // ring: bottom, top, left, right (front faces + inner edges)
  F.box(u0, u1, v0, v0 + fw, d, d + dd, 1 | 16);
  if (!arch) F.box(u0, u1, v1 - fw, v1, d, d + dd, 1 | 32);
  F.box(u0, u0 + fw, v0 + fw, vt - (arch ? 0 : fw), d, d + dd, 1 | 4);
  F.box(u1 - fw, u1, v0 + fw, vt - (arch ? 0 : fw), d, d + dd, 1 | 8);
  const mid = arch ? vt : (v0 + v1) / 2;
  if (bars === 1 || bars === 2) F.box(u0 + fw, u1 - fw, mid - 0.035, mid + 0.035, d, d + dd + 0.01, 1 | 16 | 32);
  if (bars === 2) { const mu = (u0 + u1) / 2; F.box(mu - 0.02, mu + 0.02, mid + 0.035, vt - fw, d, d + dd * 0.8, 1 | 4 | 8); F.box(mu - 0.02, mu + 0.02, v0 + fw, mid - 0.035, d, d + dd * 0.8, 1 | 4 | 8); }
  if (bars === 4) { const mu = (u0 + u1) / 2; F.box(mu - 0.03, mu + 0.03, v0 + fw, vt - fw, d, d + dd, 1 | 4 | 8); }
  if (bars === 5) { // loft grid 4 x 3 (+ arch)
    for (let i = 1; i < 4; i++) { const uu = u0 + (u1 - u0) * i / 4; F.box(uu - 0.018, uu + 0.018, v0 + fw, vt, d, d + dd * 0.7, 1 | 4 | 8); }
    for (let j = 1; j < 3; j++) { const vv = v0 + (vt - v0) * j / 3; F.box(u0 + fw, u1 - fw, vv - 0.018, vv + 0.018, d, d + dd * 0.7, 1 | 16 | 32); }
  }
  if (arch) { // curved head of the sash
    const r = (u1 - u0) / 2, cu = u0 + r, n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI;
      const o0 = [cu + Math.cos(a0) * r, vt + Math.sin(a0) * r], o1 = [cu + Math.cos(a1) * r, vt + Math.sin(a1) * r];
      const i0 = [cu + Math.cos(a0) * (r - fw), vt + Math.sin(a0) * (r - fw)], i1 = [cu + Math.cos(a1) * (r - fw), vt + Math.sin(a1) * (r - fw)];
      F.q([i0[0], i0[1], d + dd], [o0[0], o0[1], d + dd], [o1[0], o1[1], d + dd], [i1[0], i1[1], d + dd]);
      F.q([i1[0], i1[1], d], [i1[0], i1[1], d + dd], [i0[0], i0[1], d + dd], [i0[0], i0[1], d]);
    }
  }
}


// ---------------------------------------------------------------- baked facade kit (tools/blender/facade_kit.py)
// front-facing rect in the facade plane at depth d drawn with the kit atlas; U = unit coords [x0, z0, x1, z1] (m) at its corners.
// mode 0 = relief (parallax + self shadow), 1 = flat front (slab faces). Carries the wall's UVs so wall pixels match the wall.
function kitRect(sp, F, u0, u1, v0, v1, d, U, unit, mode = 0) {
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
  F.col(sp.wallC, FLAG.FRONT, sp.wallLayer);
  const B = F.b, s = F.inv, a3 = B.sc[3];
  B.sk = M.KIT; B.sc[3] = 255;
  const P = [[u0, v0, U[0], U[1]], [u1, v0, U[2], U[1]], [u1, v1, U[2], U[3]], [u0, v1, U[0], U[3]]];
  const ids = P.map(([u, v, a, b]) => { B.sg[0] = a; B.sg[1] = b; B.sg[2] = unit; B.sg[3] = mode; return F.vl(u, v, d, 0, 0, 1, u * s, v * s); });
  B.quad(ids[0], ids[1], ids[2], ids[3]);
  B.sg[0] = B.sg[1] = B.sg[2] = B.sg[3] = 0; B.sc[3] = a3; F.front = false;
}
function kitUnitFor(sp, o) {
  if (o.bars === 5) return KIT.loft_win;
  if (o.arch) return KIT.ital_win;
  switch (o.deco) {
    case 'vic': return KIT.vic_win;
    case 'casing': case 'bay': return sp.style === S.VICTORIAN ? KIT.vic_win : KIT.edw_win;
    case 'masonry': return KIT.brick_win;
    case 'stucco': return sp.style === S.STUCCO ? KIT.stucco_win : KIT.edw_win;
    case 'slim': return KIT.modern_win;
  }
  return KIT.edw_win;
}
// slab materials behind the baked sill / crown faces (sides, soffit)
function kitSlabCol(sp, unit, crown) {
  if (unit === KIT.brick_win) return [STONE, L.STONE];
  if (unit === KIT.stucco_win) return [[0.36, 0.13, 0.08], L.CLAYTILE];
  if (unit === KIT.modern_win || unit === KIT.loft_win) return [CONCRETE, L.CONCRETE];
  return [crown && unit === KIT.vic_win ? sp.accC : sp.trimC, L.TRIM];
}
// 9-slice surround (8 relief quads around the opening, margins squashed into the cell) + real sill / crown slabs
function kitSurround(sp, F, o, unit, J) {
  const [ox0, oz0, ox1, oz1] = J.open, [W, H] = J.size;
  const [cu0, cv0, cw, ch] = o.cell;
  const need = [ox0, oz0, W - ox1, H - oz1];
  const have = [o.u0 - cu0, o.v0 - cv0, cu0 + cw - o.u1, cv0 + ch - o.v1].map(h => Math.max(0.02, h));
  const k = need.map((n, i) => Math.max(1, n / have[i]));
  const us = [o.u0 - need[0] / k[0], o.u0, o.u1, o.u1 + need[2] / k[2]];
  const vs = [o.v0 - need[1] / k[1], o.v0, o.v1, o.v1 + need[3] / k[3]];
  const px = [0, ox0, ox1, W], pz = [0, oz0, oz1, H];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1) continue;
    kitRect(sp, F, us[i], us[i + 1], vs[j], vs[j + 1], 0.006, [px[i], pz[j], px[i + 1], pz[j + 1]], unit, 0);
  }
  const tu = x => x <= ox0 ? o.u0 - (ox0 - x) / k[0] : x >= ox1 ? o.u1 + (x - ox1) / k[2] : o.u0 + (x - ox0) / (ox1 - ox0) * (o.u1 - o.u0);
  const tv = z => z <= oz0 ? o.v0 - (oz0 - z) / k[1] : z >= oz1 ? o.v1 + (z - oz1) / k[3] : o.v0 + (z - oz0) / (oz1 - oz0) * (o.v1 - o.v0);
  for (const key of ['sill', 'crown']) {
    const b = J[key]; if (!b) continue;
    const u0 = tu(b.x0), u1 = tu(b.x1), v0 = tv(b.z0), v1 = tv(b.z1);
    if (v1 - v0 < 0.02) continue;
    const [col, layer] = kitSlabCol(sp, unit, key === 'crown');
    F.col(col, 0, layer);
    F.box(u0, u1, v0, v1, 0, b.d, 4 | 8 | 16 | 32);
    kitRect(sp, F, u0, u1, v0, v1, b.d, [b.x0, b.z0, b.x1, b.z1], unit, 1);
  }
}
// window air-conditioner (apartments, shops, lofts): box in the lower sash, baked front
function acUnit(sp, F, o, J) {
  const w = 0.66, h = 0.44, cu = (o.u0 + o.u1) / 2, v0 = o.v0 + 0.03, d0 = -o.rec + 0.06, d1 = 0.3;
  if (o.u1 - o.u0 < w + 0.1 || o.v1 - o.v0 < 1.0) return;
  F.col([0.52, 0.5, 0.45], 0, L.METAL);
  F.box(cu - w / 2, cu + w / 2, v0, v0 + h, d0, d1, 4 | 8 | 16 | 32);
  const a = J.open;
  kitRect(sp, F, cu - w / 2, cu + w / 2, v0, v0 + h, d1, [a[0], a[1], a[2], a[3]], KIT.ac, 1);
  F.col(DARKMETAL, 0, L.METAL);
  F.box(cu - w / 2 + 0.04, cu - w / 2 + 0.07, v0 - 0.2, v0, 0, 0.25, 1 | 4 | 8 | 32);
  F.box(cu + w / 2 - 0.07, cu + w / 2 - 0.04, v0 - 0.2, v0, 0, 0.25, 1 | 4 | 8 | 32);
}
// downpipe from the gutter to the sidewalk (hexagonal, with straps)
function downpipe(sp, F, u, v0, v1) {
  const r = 0.05, d = 0.085, pts = [];
  for (let i = 5; i >= 0; i--) { const a = i / 6 * Math.PI * 2; pts.push([u + Math.cos(a) * r, d + Math.sin(a) * r]); }
  F.col([0.33, 0.34, 0.35], 0, L.METAL);
  F.prism(pts, v0, v1, false, false);
  F.col(DARKMETAL, 0, L.METAL);
  for (let v = v0 + 1.2; v < v1 - 0.3; v += 1.8) F.box(u - 0.065, u + 0.065, v, v + 0.04, 0, d + 0.06, 1 | 4 | 8 | 16 | 32);
}

// full window: reveal, glass, sash, casing, sill, hood. o = { u0,u1,v0,v1, rec, arch, cell:[cu0,cv0,cw,ch,ci,row], itype, bars, deco }
function windowUnit(sp, X, o) {
  const F = X.F;
  const { u0, u1, v0, v1, rec } = o;
  const arch = o.arch ? (u1 - u0) / 2 : 0;
  const trim = sp.trimC;
  const KJ = facadeKit().json;
  if (KJ) {   // baked kit: real reveal + interior glass with the atlas sash over it, relief surround, slab sill / crown
    const unit = kitUnitFor(sp, o), J = KJ.units[KIT_KEYS[unit]];
    F.col(o.revealC || sp.wallC, 0, o.revealL ?? sp.wallLayer);
    reveals(F, u0, u1, v0, v1, rec, arch);
    const [cu0, cv0, cw, ch, ci, row] = o.cell;
    glass(F, u0, u1, v0, v1, -rec + 0.012, cu0, cv0, cw, ch, ci, row, o.itype, 0, rec, unit);
    if (o.deco !== 'bay') kitSurround(sp, F, o, unit, J);
    const st = sp.style;
    if (row >= 1 && (st === S.APARTMENT || st === S.COMMERCIAL || st === S.CHINATOWN || st === S.LOFT) && fh1(sp.seedInt * 0.013 + ci * 7.7 + row * 3.1) < 0.14) acUnit(sp, F, o, KJ.units.ac);
    return;
  }
  // reveals in wall material (+ spandrel fill above an arched head)
  F.col(o.revealC || sp.wallC, 0, o.revealL ?? sp.wallLayer);
  reveals(F, u0, u1, v0, v1, rec, arch);
  if (arch) { F.col(sp.wallC, FLAG.FRONT, sp.wallLayer); F.front = true; archSpandrels(F, u0, u1, v1); F.front = false; }
  const [cu0, cv0, cw, ch, ci, row] = o.cell;
  glass(F, u0, u1, v0, v1, -rec + 0.012, cu0, cv0, cw, ch, ci, row, o.itype, 0, rec);
  F.col(o.sashC || trim, 0, L.TRIM);
  sash(F, u0, u1, v0, v1, -rec + 0.012, o.bars ?? 0, arch);
  const deco = o.deco || 'casing';
  if (deco === 'casing' || deco === 'vic') {
    // casing boards (proud), sill with ears, hood moulding (+ pediment on Victorians)
    const cwid = deco === 'vic' ? 0.14 : 0.1, cp = 0.045;
    F.col(trim, 0, L.TRIM);
    F.box(u0 - cwid, u0, v0, v1, 0, cp, 1 | 8 | 4);
    F.box(u1, u1 + cwid, v0, v1, 0, cp, 1 | 4 | 8);
    const hh = deco === 'vic' ? 0.26 : 0.16;
    F.box(u0 - cwid - 0.03, u1 + cwid + 0.03, v1, v1 + hh, 0, cp, 1 | 4 | 8 | 32);
    if (deco === 'vic') F.col(sp.accC, 0, L.TRIM);
    F.box(u0 - cwid - 0.1, u1 + cwid + 0.1, v1 + hh, v1 + hh + 0.07, 0, cp + 0.1, 63);
    F.col(trim, 0, L.TRIM);
    F.box(u0 - cwid - 0.07, u1 + cwid + 0.07, v0 - 0.075, v0, -rec * 0.5, 0.1, 1 | 4 | 8 | 16 | 32);
    if (deco === 'vic') {
      F.box(u0 - cwid + 0.01, u0 - 0.02, v0 - 0.3, v0 - 0.075, 0, 0.08, 1 | 4 | 8 | 32);
      F.box(u1 + 0.02, u1 + cwid - 0.01, v0 - 0.3, v0 - 0.075, 0, 0.08, 1 | 4 | 8 | 32);
      if (o.pediment) {
        const pu0 = u0 - cwid - 0.1, pu1 = u1 + cwid + 0.1, pv = v1 + hh + 0.07, ph = (pu1 - pu0) * 0.22, pd = cp + 0.1;
        F.tri([pu0, pv, pd], [pu1, pv, pd], [(pu0 + pu1) / 2, pv + ph, pd]);
        F.q([pu0 - 0.04, pv, pd + 0.03], [(pu0 + pu1) / 2, pv + ph + 0.05, pd + 0.03], [(pu0 + pu1) / 2, pv + ph + 0.05, 0], [pu0 - 0.04, pv, 0]);
        F.q([(pu0 + pu1) / 2, pv + ph + 0.05, pd + 0.03], [pu1 + 0.04, pv, pd + 0.03], [pu1 + 0.04, pv, 0], [(pu0 + pu1) / 2, pv + ph + 0.05, 0]);
      }
    }
  } else if (deco === 'masonry') {
    // stone lintel with keystone + stone sill (brick / stone walls)
    F.col(o.stoneC || STONE, 0, L.STONE);
    if (arch) {
      const r = (u1 - u0) / 2, cu = u0 + r, cv = v1 - r, n = 8, w = 0.28;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI;
        const i0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], i1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
        const o0 = [cu + Math.cos(a0) * (r + w), cv + Math.sin(a0) * (r + w)], o1 = [cu + Math.cos(a1) * (r + w), cv + Math.sin(a1) * (r + w)];
        F.q([i0[0], i0[1], 0.03], [o0[0], o0[1], 0.03], [o1[0], o1[1], 0.03], [i1[0], i1[1], 0.03]);
        F.q([o1[0], o1[1], 0], [o1[0], o1[1], 0.03], [o0[0], o0[1], 0.03], [o0[0], o0[1], 0]);
      }
      F.box(cu - 0.13, cu + 0.13, v1 - 0.05, v1 + w + 0.06, 0, 0.06, 63);
    } else {
      F.box(u0 - 0.14, u1 + 0.14, v1, v1 + 0.28, 0, 0.035, 1 | 4 | 8 | 16 | 32);
      F.box((u0 + u1) / 2 - 0.14, (u0 + u1) / 2 + 0.14, v1 - 0.04, v1 + 0.34, 0, 0.07, 63);
    }
    F.box(u0 - 0.1, u1 + 0.1, v0 - 0.1, v0, -rec * 0.5, 0.08, 1 | 4 | 8 | 16 | 32);
  } else if (deco === 'stucco') {
    F.col(shade(sp.wallC, 1.04), 0, L.STUCCO);
    F.box(u0 - 0.08, u1 + 0.08, v0 - 0.08, v0, -rec * 0.5, 0.07, 1 | 4 | 8 | 16 | 32);
    F.box(u0 - 0.08, u0, v0, v1, 0, 0.03, 1 | 8); F.box(u1, u1 + 0.08, v0, v1, 0, 0.03, 1 | 4);
    F.box(u0 - 0.08, u1 + 0.08, v1, v1 + 0.08, 0, 0.03, 1 | 4 | 8 | 16);
  } else if (deco === 'slim') {
    F.col(o.sillC || CONCRETE, 0, L.CONCRETE);
    F.box(u0 - 0.04, u1 + 0.04, v0 - 0.06, v0, -rec * 0.5, 0.05, 1 | 4 | 8 | 16 | 32);
  }
}

// cornice: frieze + brackets (+ dentils) + projecting crown, along u in [u0,u1] with its top at v = top
function cornice(sp, X, u0, u1, top, kind, rnd) {
  const F = X.F;
  const c = sp.trimC;
  if (kind === 'ital' || kind === 'classic') {
    const big = kind === 'ital';
    const proj = big ? 0.55 : 0.42;
    F.col(c, 0, L.TRIM);
    // frieze band
    F.box(u0, u1, top - (big ? 1.15 : 0.85), top - 0.45, 0, 0.05, 1 | 4 | 8 | 32);
    // crown profile (extruded)
    const prof = [[0.05, -0.45], [0.12, -0.45], [0.12, -0.4], [proj * 0.75, -0.3], [proj, -0.28], [proj, -0.12], [proj + 0.06, -0.1], [proj + 0.06, 0], [0.0, 0]];
    F.extrude(prof.map(([d, v]) => [d, v]), u0 - 0.12, u1 + 0.12, top, 3, [0.7, 0.8, 0.8, 0.75, 0.9, 1, 1, 1, 1]);
    // brackets (painted in the accent colour on Victorians)
    if (big && sp.style === S.VICTORIAN) F.col(sp.accC, 0, L.TRIM);
    const n = Math.max(2, Math.round((u1 - u0) / (big ? 0.95 : 1.2)) + 1);
    for (let i = 0; i < n; i++) {
      const u = u0 + 0.12 + (u1 - u0 - 0.24) * i / (n - 1);
      F.box(u - 0.07, u + 0.07, top - (big ? 1.05 : 0.8), top - 0.62, 0.05, 0.2, 1 | 4 | 8 | 32);
      F.box(u - 0.08, u + 0.08, top - 0.62, top - 0.3, 0.05, proj - 0.02, 1 | 4 | 8 | 32);
    }
    if (!big || rnd() < 0.5) { // dentils
      const nd = Math.floor((u1 - u0) / 0.13);
      for (let i = 0; i < nd; i++) { const u = u0 + 0.065 + i * 0.13; F.box(u - 0.035, u + 0.035, top - 0.52, top - 0.45, 0.05, 0.13, 1 | 4 | 8 | 32); }
    }
  } else if (kind === 'corbel') {
    // brick corbel table + stone cap
    F.col(sp.wallC, 0, sp.wallLayer);
    F.box(u0, u1, top - 0.9, top - 0.7, 0, 0.06, 1 | 32 | 4 | 8);
    F.box(u0, u1, top - 0.7, top - 0.5, 0, 0.12, 1 | 32 | 4 | 8);
    const n = Math.floor((u1 - u0) / 0.45);
    for (let i = 0; i < n; i++) { const u = u0 + 0.22 + i * 0.45; F.box(u - 0.11, u + 0.11, top - 1.2, top - 0.9, 0, 0.1, 1 | 4 | 8 | 32); }
    F.col(STONE, 0, L.STONE);
    F.box(u0 - 0.05, u1 + 0.05, top - 0.5, top, 0, 0.2, 1 | 4 | 8 | 16 | 32);
  } else if (kind === 'coping') {
    F.col(shade(sp.wallC, 1.05), 0, sp.wallLayer === L.CORRUGATED ? L.METAL : L.CONCRETE);
    F.box(u0 - 0.03, u1 + 0.03, top - 0.18, top, -0.3, 0.06, 1 | 4 | 8 | 16 | 32);
  } else if (kind === 'tile') {
    // Mediterranean clay-tile eave on small brackets
    F.col(sp.trimC, 0, L.TRIM);
    const n = Math.max(2, Math.round((u1 - u0) / 0.7));
    for (let i = 0; i <= n; i++) { const u = u0 + 0.1 + (u1 - u0 - 0.2) * i / n; F.box(u - 0.05, u + 0.05, top - 0.75, top - 0.55, 0, 0.45, 1 | 4 | 8 | 32); }
    F.mat(L.CLAYTILE, 1, 1, 1);
    F.q([u0 - 0.1, top - 0.6, 0.6], [u1 + 0.1, top - 0.6, 0.6], [u1 + 0.1, top - 0.15, -0.05], [u0 - 0.1, top - 0.15, -0.05]);
    F.col([0.3, 0.2, 0.15], 0, L.TRIM);
    F.q([u1 + 0.1, top - 0.62, 0.6], [u0 - 0.1, top - 0.62, 0.6], [u0 - 0.1, top - 0.62, 0], [u1 + 0.1, top - 0.62, 0]);
    F.col(shade(sp.wallC, 1.03), 0, L.STUCCO);
    F.box(u0, u1, top - 0.15, top, -0.3, 0.02, 1 | 16);
  } else if (kind === 'deco') {
    // stepped Art-Deco / modern parapet cap
    F.col(sp.trimC, 0, L.STONE);
    F.box(u0 - 0.04, u1 + 0.04, top - 0.9, top - 0.6, 0, 0.12, 1 | 4 | 8 | 16 | 32);
    F.box(u0 - 0.06, u1 + 0.06, top - 0.2, top, -0.3, 0.16, 1 | 4 | 8 | 16 | 32);
  }
}

// straight run of steps in F, rising along -d (toward the wall) from (d = dOut, v = vLow) to (d = dIn, v = vHigh)
function stairs(F, u0, u1, dOut, dIn, vLow, vHigh, col) {
  const rise = vHigh - vLow; if (rise < 0.05) return;
  const n = Math.max(1, Math.round(rise / 0.18)), run = (dOut - dIn) / n, h = rise / n;
  F.col(col, 0, L.PAVING);
  for (let i = 0; i < n; i++) {
    const d0 = dOut - (i + 1) * run, d1 = dOut - i * run, v1 = vLow + (i + 1) * h;
    F.box(u0, u1, vLow - 0.3, v1, d0, d1, 1 | 16 | (i === 0 ? 0 : 0));
  }
  // cheek walls (vertical slabs following the flight) with sloped caps
  F.col(shade(col, 0.92), 0, L.CONCRETE);
  const t = 0.18, vb = vLow - 0.3, lo = vLow + 0.35, hi = vHigh + 0.35;
  for (const [a, b] of [[u0 - t, u0], [u1, u1 + t]]) {
    F.q([a, vb, dIn], [a, vb, dOut], [a, lo, dOut], [a, hi, dIn]);
    F.q([b, vb, dOut], [b, vb, dIn], [b, hi, dIn], [b, lo, dOut]);
    F.q([a, lo, dOut], [b, lo, dOut], [b, hi, dIn], [a, hi, dIn]);
    F.q([a, vb, dOut], [b, vb, dOut], [b, lo, dOut], [a, lo, dOut]);
  }
}

// sloped canvas awning (both sides) with valance, [u0,u1] at wall height v, projecting p
function awning(F, u0, u1, v, p, drop, col, layer = L.AWNING) {
  F.col(col, FLAG.NONRM, layer);
  const a = [u0, v, 0], b = [u1, v, 0], c = [u1, v - drop, p], d = [u0, v - drop, p];
  F.q(d, c, b, a);                  // top (faces up/out)
  F.q(a, b, c, d);                  // underside
  const vd = 0.28;
  F.q([u0, v - drop - vd, p], [u1, v - drop - vd, p], [u1, v - drop, p], [u0, v - drop, p]);
  F.q([u1, v - drop - vd, p], [u0, v - drop - vd, p], [u0, v - drop, p], [u1, v - drop, p]);
  F.tri([u0, v, 0], [u0, v - drop, p], [u0, v - drop, 0]); F.tri([u0, v, 0], [u0, v - drop, 0], [u0, v - drop, p]);
  F.tri([u1, v, 0], [u1, v - drop, 0], [u1, v - drop, p]); F.tri([u1, v, 0], [u1, v - drop, p], [u1, v - drop, 0]);
}

// decal rect (signs, murals) in frame D; uvr = [u0,v0,u1,v1] atlas rect; em = emissive kind; ph = flicker phase
function decalRect(D, u0, u1, v0, v1, d, uvr, em, tint = [1, 1, 1], ph = 0, rot = false) {
  const B = D.b;
  B.sk = 0; B.sc[0] = tint[0] * 255; B.sc[1] = tint[1] * 255; B.sc[2] = tint[2] * 255; B.sc[3] = em; B.sz = ph; B.sw = 0;
  const nx = D.nx, nz = D.nz;
  const [a0, b0, a1, b1] = uvr;
  const uv = rot ? [[a1, b1], [a1, b0], [a0, b0], [a0, b1]] : [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
  const i0 = B.v(D.wx(u0, d), D.oy + v0, D.wz(u0, d), nx, 0, nz, uv[0][0], uv[0][1]);
  const i1 = B.v(D.wx(u1, d), D.oy + v0, D.wz(u1, d), nx, 0, nz, uv[1][0], uv[1][1]);
  const i2 = B.v(D.wx(u1, d), D.oy + v1, D.wz(u1, d), nx, 0, nz, uv[2][0], uv[2][1]);
  const i3 = B.v(D.wx(u0, d), D.oy + v1, D.wz(u0, d), nx, 0, nz, uv[3][0], uv[3][1]);
  B.quad(i0, i1, i2, i3);
}
// alpha-tested ironwork quad in frame C (vertical plane at depth d, or any 4 local points)
function cutQuad(C, p0, p1, p2, p3, uvr, tint, rep = 1) {
  const B = C.b;
  B.sk = 0; B.sc[0] = tint[0] * 255; B.sc[1] = tint[1] * 255; B.sc[2] = tint[2] * 255; B.sc[3] = 0; B.sz = 0; B.sw = 0;
  const [a0, b0, a1, b1] = uvr;
  const P = [p0, p1, p2, p3];
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
  let nu = ay * bz - az * by, nv = az * bx - ax * bz, nd = ax * by - ay * bx; const l = Math.hypot(nu, nv, nd) || 1; nu /= l; nv /= l; nd /= l;
  const uvs = [[a0, b0], [a0 + (a1 - a0) * rep, b0], [a0 + (a1 - a0) * rep, b1], [a0, b1]];
  const ids = P.map((p, k) => B.v(C.wx(p[0], p[2]), C.oy + p[1], C.wz(p[0], p[2]), C.tx * nu + C.nx * nd, nv, C.tz * nu + C.nz * nd, uvs[k][0], uvs[k][1]));
  B.quad(ids[0], ids[1], ids[2], ids[3]);
}

// =====================================================================================================================
// building emission
// =====================================================================================================================
function emitNear(sp, X) {
  const F = X.F, B = F.b;
  B.sid = sp.id + NEAR_OFF; B.sc[3] = 255;
  X.C.b.sid = -1; X.D.b.sid = -1; X.L.b.sid = -1;
  const rnd = mulberry32(sp.seedInt * 7 + 11);
  body(sp, X, rnd);
  front(sp, X, rnd);
}

function body(sp, X, rnd) {
  const F = X.F;
  const vb = sp.yb - sp.y0, W = sp.W, D = sp.depth, top = sp.topH;
  const tower = !!sp.tiers;
  const roofV = tower ? top : top - Math.min(sp.parapet, 1.3) * 0.7;
  sp.roofV = roofV;
  const big = tower || sp.style === S.OFFICE;
  if (tower) {
    // towers: keep the far massing above the podium (tiers) but with near-quality base in front()
    let v0 = vb;
    for (let ti = 0; ti < sp.tiers.length; ti++) {
      const T = sp.tiers[ti];
      const w = W - 2 * T.inset, d = D - 2 * T.inset;
      const nbF = Math.max(1, Math.round((w - 2 * sp.margin) / sp.cw)), cwF = (w - 2 * sp.margin) / nbF;
      const nbS = Math.max(1, Math.round((d - 2 * sp.margin) / sp.cw)), cwS = (d - 2 * sp.margin) / nbS;
      for (let k = 0; k < 4; k++) {
        if (k === 0 && ti === 0) continue; // street front of the base tier is detailed
        frames(sp, F, k, T.inset);
        const len = k % 2 === 0 ? w : d;
        const f0 = k === 0 ? v0 : (ti === 0 ? vb : v0);
        procRect(F, 0, len, f0, T.v1, 0, sp.curtain ? M.CURTAIN : M.SIDEX, k % 2 === 0 ? cwF : cwS, k % 2 === 0 ? nbF : nbS);
        towerSkin(sp, F, len, Math.max(f0, sp.groundH + 0.2), T.v1 - 0.6, k % 2 === 0 ? cwF : cwS, k % 2 === 0 ? nbF : nbS);
      }
      if (ti === 0) { frames(sp, F, 0, 0); towerSkin(sp, F, W, sp.groundH + 0.2, T.v1 - 0.6, sp.cw, sp.nb); }
      frames(sp, F, 0, T.inset);
      F.mat(L.GRAVEL, 0.5, 0.5, 0.5);
      F.q([0, T.v1, 0], [w, T.v1, 0], [w, T.v1, -d], [0, T.v1, -d]);
      F.col(sp.trimC, 0, sp.curtain ? L.METAL : L.STONE);
      F.box(-0.1, w + 0.1, T.v1 - 0.6, T.v1 + 0.5, 0, 0.3, 1 | 4 | 8 | 16 | 32);
      v0 = T.v1 - 0.01;
    }
    return;
  }
  if (!sp.exposeL || big) { frames(sp, F, 1); procRect(F, 0, D, vb, roofV + 0.4, 0, big || sp.exposeL ? M.SIDEX : M.SIDE, sp.cwS, sp.nbS); }
  frames(sp, F, 2); procRect(F, 0, W, vb, roofV + 0.4, 0, big ? M.SIDEX : M.BACK, sp.cw, sp.nb);
  if (!sp.exposeR || big) { frames(sp, F, 3); procRect(F, 0, D, vb, roofV + 0.4, 0, big || sp.exposeR ? M.SIDEX : M.SIDE, sp.cwS, sp.nbS); }
  frames(sp, F, 0);
  const g = 0.85 + rnd() * 0.25;
  F.mat(L.GRAVEL, 0.46 * g, 0.45 * g, 0.44 * g);
  F.q([0, roofV, -0.3], [W, roofV, -0.3], [W, roofV, -D], [0, roofV, -D]);
  // parapet copings on sides/back, and the back of the front parapet
  F.mat(L.CONCRETE, 0.6, 0.59, 0.56);
  F.box(0, W, roofV + 0.4, roofV + 0.5, -D, -D + 0.28, 1 | 2 | 16);
  F.box(0, 0.28, roofV + 0.4, roofV + 0.5, -D + 0.28, -0.3, 4 | 8 | 16);
  F.box(W - 0.28, W, roofV + 0.4, roofV + 0.5, -D + 0.28, -0.3, 4 | 8 | 16);
  F.box(0.28, W - 0.28, roofV, roofV + 0.4, -D + 0.28, -D + 0.3, 1);
  F.col(sp.wallC, 0, sp.wallLayer);
  F.q([W, roofV, -0.3], [0, roofV, -0.3], [0, top, -0.3], [W, top, -0.3]);
  F.box(0, W, top - 0.05, top, -0.3, 0, 16);
}

// curtain-wall mullion fins + spandrel ledges, or stone piers + belt courses, over a procedural tower face
function towerSkin(sp, F, len, v0, v1, cw, nb) {
  if (v1 - v0 < 2) return;
  const m = (len - nb * cw) / 2;
  if (sp.curtain) {
    F.col(shade(sp.wallC, 0.8), 0, L.METAL);
    for (let k = 0; k <= nb; k++) { const u = m + k * cw; F.box(u - 0.06, u + 0.06, v0, v1, 0, 0.32, 1 | 4 | 8); }
    const fl = sp.floorH;
    for (let v = sp.groundH + fl; v < v1; v += fl) F.box(m, len - m, v - 0.05, v + 0.05, 0, 0.12, 1 | 16 | 32);
  } else {
    F.col(sp.wallC, 0, sp.wallLayer);
    for (let k = 0; k <= nb; k++) { const u = m + k * cw; const w = k === 0 || k === nb ? 0.35 : 0.2; F.box(u - w, u + w, v0, v1, 0, 0.12, 1 | 4 | 8); }
    F.col(sp.trimC, 0, L.STONE);
    const fl = sp.floorH;
    let i = 0;
    for (let v = sp.groundH + fl; v < v1; v += fl, i++) if (i % 4 === 3) F.box(0, len, v - 0.12, v + 0.12, 0, 0.16, 1 | 16 | 32 | 4 | 8);
  }
}

function front(sp, X, rnd) {
  const F = X.F, C = X.C, D = X.D;
  frames(sp, F, 0); frames(sp, C, 0); frames(sp, D, 0); frames(sp, X.L, 0);
  const st = sp.style, W = sp.W, top = sp.topH, gH = sp.groundH, fH = sp.floorH, nb = sp.nb, cw = sp.cw, m = sp.margin;
  const vb = sp.yb - sp.y0;
  const holes = [];
  const house = st === S.VICTORIAN || st === S.EDWARDIAN || st === S.STUCCO;
  const brick = sp.wallLayer === L.BRICK || sp.wallLayer === L.BRICK_DARK || sp.wallLayer === L.BRICK_PAINT;
  const masonry = brick || sp.wallLayer === L.STONE || sp.wallLayer === L.GRANITE || sp.wallLayer === L.CONCRETE;
  const tower = !!sp.tiers;
  const floors = sp.floors;
  const itypeUp = sp.itype;
  const cellOf = (ci, row) => [m + ci * cw, row === 0 ? 0 : gH + (row - 1) * fH, cw, row === 0 ? gH : fH, ci, row];
  const deco = st === S.VICTORIAN ? 'vic' : st === S.EDWARDIAN ? 'casing' : st === S.STUCCO ? 'stucco'
    : (st === S.TOWER_GLASS || st === S.OFFICE) ? 'slim' : masonry ? 'masonry' : sp.wallLayer === L.SIDING ? 'casing' : 'stucco';
  const bars = sp.winType === WT.LOFT ? 5 : sp.winType === WT.PICTURE ? 4 : sp.winType === WT.PLAIN ? 0 : (st === S.VICTORIAN || st === S.EDWARDIAN) ? (rnd() < 0.5 ? 2 : 1) : 1;
  const arched = sp.winType === WT.ARCH;
  const rec = sp.recess;

  // ---------------------------------------------------------------- bays
  const bayCells = new Set();
  if (st === S.VICTORIAN) bayCells.add(sp.gCell);
  else if (st === S.EDWARDIAN) { if (nb >= 3) { bayCells.add(0); bayCells.add(nb - 1); } else bayCells.add(sp.gCell); }
  else if ((st === S.APARTMENT || st === S.COMMERCIAL) && sp.bayCols) for (let i = 0; i < nb; i += 2) bayCells.add(i);
  const bayV0 = gH + (house ? 0.1 : fH * 0.02), bayV1 = gH + floors * fH - 0.15;
  if (floors > 0) for (const ci of bayCells) {
    const ua = m + ci * cw + 0.12, ub = m + (ci + 1) * cw - 0.12;
    const dep = st === S.VICTORIAN ? 0.85 : 0.7;
    const inset = sp.roundBay || st !== S.EDWARDIAN ? dep : dep * 0.5;
    holes.push({ u0: ua, u1: ub, v0: bayV0, v1: bayV1 });
    bayWindow(sp, X, ci, ua, ub, dep, inset, bayV0, bayV1, deco, bars, rnd);
  }

  // ---------------------------------------------------------------- upper floor windows
  const detRows = tower ? (sp.curtain ? 0 : Math.min(3, floors)) : floors;
  for (let row = 1; row <= detRows; row++) {
    for (let ci = 0; ci < nb; ci++) {
      if (bayCells.has(ci)) continue;
      if (house && ci !== sp.gCell && row === 1 && st !== S.STUCCO) continue; // entry vestibule occupies it
      const [cu0, cv0] = cellOf(ci, row);
      let ww = sp.winW, wh = sp.winH, sill = sp.sillH;
      if (sp.winType === WT.PICTURE && ci === sp.gCell) ww = Math.min(cw - 0.4, cw * 0.8);
      if (sp.ribbon) { ww = cw - 0.1; }
      const u0 = cu0 + (cw - ww) / 2, v0 = cv0 + sill;
      const o = { u0, u1: u0 + ww, v0, v1: v0 + wh, rec, arch: arched, cell: cellOf(ci, row), itype: itypeUp, bars, deco, pediment: st === S.VICTORIAN && row === floors };
      holes.push({ u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 });
      windowUnit(sp, X, o);
    }
  }

  // ---------------------------------------------------------------- ground floor
  ground(sp, X, rnd, holes, { house, brick, masonry, deco, cellOf, bars });

  // ---------------------------------------------------------------- wall
  F.col(sp.wallC, FLAG.FRONT, sp.wallLayer);
  F.front = true;
  const detTop = tower ? gH + detRows * fH + 0.2 : top;
  wallHoles(F, 0, W, vb, detTop, holes);
  F.front = false;
  if (tower) procRect(F, 0, W, detTop, sp.tiers[0].v1, 0, sp.curtain ? M.CURTAIN : M.PROC, sp.cw, sp.nb);

  // ---------------------------------------------------------------- trims
  const trim = sp.trimC;
  if (house) {
    // corner boards / pilasters and belt courses
    F.col(trim, 0, L.TRIM);
    const pw = st === S.STUCCO ? 0 : 0.2;
    if (pw) {
      F.box(0, pw, gv(sp, 0) - 0.1, top - sp.parapet, 0, 0.06, 1 | 4 | 8);
      F.box(W - pw, W, gv(sp, W) - 0.1, top - sp.parapet, 0, 0.06, 1 | 4 | 8);
    }
    if (st !== S.STUCCO) {
      for (let r = 0; r <= floors; r++) {
        const v = r === 0 ? gH : gH + r * fH - 0.05;
        if (r === floors) break;
        const segs = [[0, W]];
        for (const ci of bayCells) { const ua = m + ci * cw + 0.12, ub = m + (ci + 1) * cw - 0.12; for (let s = segs.length - 1; s >= 0; s--) { const [a, b] = segs[s]; if (ub <= a || ua >= b) continue; segs.splice(s, 1); if (ua > a) segs.push([a, ua]); if (ub < b) segs.push([ub, b]); } }
        for (const [a, b] of segs) if (b - a > 0.2) {
          if (facadeKit().json) {   // baked belt-course moulding on the front face
            F.col(trim, 0, L.TRIM); F.box(a, b, v - 0.05, v + 0.05, 0, 0.045, 4 | 8 | 16 | 32);
            kitRect(sp, F, a, b, v - 0.05, v + 0.05, 0.045, [a, 0.05, b, 0.35], KIT.belt, 1);
            F.col(trim, 0, L.TRIM);
          } else F.box(a, b, v - 0.05, v + 0.05, 0, 0.045, 1 | 4 | 8 | 16 | 32);
          if (r === 0) F.box(a, b, v + 0.05, v + 0.09, 0, 0.07, 1 | 4 | 8 | 16 | 32);
        }
      }
    }
  } else {
    // masonry: quoins, plinth, belt course over the ground floor
    if (brick && !tower) {
      F.col(STONE, 0, L.STONE);
      for (const u of [0, W]) {
        let v = gH;
        let k = 0;
        while (v < top - sp.parapet - 0.3) {
          const h = 0.34, wq = k % 2 ? 0.32 : 0.52;
          if (u === 0) F.box(0, wq, v, v + h - 0.02, 0, 0.04, 1 | 4 | 16 | 32); else F.box(W - wq, W, v, v + h - 0.02, 0, 0.04, 1 | 8 | 16 | 32);
          v += h; k++;
        }
      }
    }
    if (st !== S.WAREHOUSE) {
      F.col(masonry ? STONE : trim, 0, masonry ? L.STONE : L.TRIM);
      F.box(-0.02, W + 0.02, gH - 0.12, gH + 0.18, 0, 0.1, 1 | 4 | 8 | 16 | 32);
    }
  }
  // plinth / base course along the ground
  {
    const baseC = house ? shade(CONCRETE, 0.9) : st === S.TOWER_STONE || st === S.TOWER_GLASS || st === S.OFFICE ? [0.3, 0.29, 0.3] : shade(CONCRETE, 0.85);
    F.col(baseC, 0, house ? L.CONCRETE : (st === S.TOWER_STONE || st === S.TOWER_GLASS || st === S.OFFICE) ? L.GRANITE : L.CONCRETE);
    const segs = sp.baseSegs || [[0, W]];
    for (const [a, b] of segs) {
      if (b - a < 0.05) continue;
      F.q([a, vb, 0.05], [b, vb, 0.05], [b, gv(sp, b) + 0.35, 0.05], [a, gv(sp, a) + 0.35, 0.05]);
      F.q([a, gv(sp, a) + 0.35, 0.05], [b, gv(sp, b) + 0.35, 0.05], [b, gv(sp, b) + 0.35, 0], [a, gv(sp, a) + 0.35, 0]);
    }
  }

  // ---------------------------------------------------------------- cornice / parapet
  if (!tower) {
    const kind = st === S.VICTORIAN ? 'ital' : st === S.EDWARDIAN || st === S.COMMERCIAL || st === S.APARTMENT || st === S.CHINATOWN ? (brick ? 'corbel' : 'classic')
      : st === S.STUCCO ? (sp.tileRoof ? 'tile' : 'coping') : st === S.LOFT ? 'corbel' : st === S.WAREHOUSE ? 'coping' : 'deco';
    if (!sp.gable) cornice(sp, X, 0, W, top, kind, rnd);
    else gable(sp, X, rnd);
  }
  if (sp.turret) { F.b.sid = sp.id + NEAR_OFF; turretNear(sp, X, rnd); }

  // ---------------------------------------------------------------- exposed side facades (corner lots)
  sp.muralSide = sp.zone === 'mission' && (sp.exposeL || sp.exposeR) && rnd() < 0.7 ? (sp.exposeL ? 1 : 3) : 0;
  if (!tower && st !== S.OFFICE) {
    if (sp.exposeL) sideFacade(sp, X, rnd, 1, ctxSide(sp, deco, bars, arched, rec));
    if (sp.exposeR) sideFacade(sp, X, rnd, 3, ctxSide(sp, deco, bars, arched, rec));
    frames(sp, F, 0); frames(sp, C, 0); frames(sp, D, 0); frames(sp, X.L, 0);
  }
  // ---------------------------------------------------------------- extras
  if (!tower && st !== S.WAREHOUSE && facadeKit().json) {
    const pu = rnd() < 0.5 ? 0.12 : W - 0.12;
    downpipe(sp, F, pu, gv(sp, pu) - 0.05, top - Math.min(sp.parapet, 1.3) * 0.7 - 0.1);
  }
  if (sp.fireEscape && floors >= 2) fireEscape(sp, X, rnd);
  if (sp.balconies && floors >= 1) balconies(sp, X, rnd);
  if (sp.neon) bladeSign(sp, X, rnd);
  if (sp.muralSide) mural(sp, X, rnd);
}

const ctxSide = (sp, deco, bars, arched, rec) => ({ deco, bars, arched, rec });
// detailed street-facing side wall of a corner building: window grid on every floor, storefront wrap near the front,
// the cornice returning around the corner. Side frame u runs from the back corner (0) to the front corner (depth).
function sideFacade(sp, X, rnd, side, o) {
  const F = X.F, H = X.H;
  frames(sp, F, side);
  const D = sp.depth, top = sp.topH, gH = sp.groundH, fH = sp.floorH, m = sp.margin;
  const nb = sp.nbS, cw = sp.cwS, vb = sp.yb - sp.y0;
  const holes = [];
  // ground line along the side (sidewalk of the cross street)
  const gAt = (u) => H(F.wx(u, 1.0), F.wz(u, 1.0)) - sp.y0;
  const g0 = gAt(0), g1 = gAt(D), gl = (u) => g0 + (g1 - g0) * u / D;
  const muralTop = sp.muralSide === side ? Math.min(top - 1.2, 9) + 0.6 : -1;
  const store = sp.groundType === GT.STORE;
  const house = sp.style === S.VICTORIAN || sp.style === S.EDWARDIAN || sp.style === S.STUCCO;
  for (let row = 0; row <= sp.floors; row++) {
    const cv0 = row === 0 ? 0 : gH + (row - 1) * fH, ch = row === 0 ? gH : fH;
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = m + ci * cw;
      if (muralTop > 0 && cv0 < muralTop) continue;
      if (row === 0) {
        const gb = Math.max(gl(cu0), gl(cu0 + cw));
        if (store && ci >= nb - 2) {
          // storefront wrapping around the corner
          const u0 = cu0 + 0.2, u1 = cu0 + cw - 0.2, v1 = gH - 1.1;
          if (v1 - gb < 1.5) continue;
          holes.push({ u0, u1, v0: gb + 0.5, v1 });
          F.col(shade(sp.trimC, 0.8), 0, L.WOOD); reveals(F, u0, u1, gb + 0.5, v1, 0.25, 0, true);
          glass(F, u0, u1, gb + 0.5, v1, -0.24, cu0, 0, cw, gH, ci, 0, IT.SHOP, 0, 0.25);
          F.col([0.1, 0.1, 0.1], 0, L.METAL); F.box(u0, u1, v1 - 0.55, v1 - 0.5, -0.24, -0.18, 1 | 16 | 32);
          continue;
        }
        if (house && rnd() < 0.5) continue;
        const ww = Math.min(sp.winW, cw - 0.5), u0 = cu0 + (cw - ww) / 2;
        const v0 = Math.max(gb + 1.1, 1.0), v1 = Math.min(gH - 0.35, v0 + sp.winH * 0.8);
        if (v1 - v0 < 0.6) continue;
        holes.push({ u0, u1: u0 + ww, v0, v1 });
        windowUnit(sp, X, { u0, u1: u0 + ww, v0, v1, rec: o.rec, cell: [cu0, 0, cw, gH, ci, 0], itype: sp.itype, bars: o.bars, deco: o.deco });
        continue;
      }
      if (house && fh1(ci * 3.7 + row * 1.3 + sp.seed * 9) < 0.35) continue;
      const ww = Math.min(sp.winW, cw - 0.4), u0 = cu0 + (cw - ww) / 2, v0 = cv0 + sp.sillH;
      const v1 = Math.min(cv0 + ch - 0.3, v0 + sp.winH);
      holes.push({ u0, u1: u0 + ww, v0, v1 });
      windowUnit(sp, X, { u0, u1: u0 + ww, v0, v1, rec: o.rec, arch: o.arched, cell: [cu0, cv0, cw, ch, ci, row], itype: sp.itype, bars: o.bars, deco: o.deco });
    }
  }
  F.col(sp.wallC, 0, sp.wallLayer);
  wallHoles(F, 0, D, vb, top, holes);
  // base course + belt over the ground floor + cornice return
  F.col(house ? shade(CONCRETE, 0.9) : shade(CONCRETE, 0.85), 0, L.CONCRETE);
  F.q([0, vb, 0.05], [D, vb, 0.05], [D, gl(D) + 0.35, 0.05], [0, gl(0) + 0.35, 0.05]);
  F.q([0, gl(0) + 0.35, 0.05], [D, gl(D) + 0.35, 0.05], [D, gl(D) + 0.35, 0], [0, gl(0) + 0.35, 0]);
  if (!house) { F.col(STONE, 0, L.STONE); F.box(0, D, gH - 0.12, gH + 0.18, 0, 0.1, 1 | 4 | 8 | 16 | 32); }
  const kind = sp.style === S.VICTORIAN ? 'ital' : sp.style === S.STUCCO ? (sp.tileRoof ? 'tile' : 'coping') : sp.style === S.LOFT ? 'corbel' : sp.style === S.WAREHOUSE ? 'coping'
    : (sp.wallLayer === L.BRICK || sp.wallLayer === L.BRICK_DARK || sp.wallLayer === L.BRICK_PAINT) ? 'corbel' : 'classic';
  if (!sp.gable) cornice(sp, X, 0, D, top, kind, rnd);
  if (sp.style === S.VICTORIAN || sp.style === S.EDWARDIAN) { F.col(sp.trimC, 0, L.TRIM); F.box(D - 0.2, D, gl(D) - 0.1, top - sp.parapet, 0, 0.06, 1 | 4 | 8); }
}
function fh1(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

// ground floor elements by type
function ground(sp, X, rnd, holes, ctx) {
  const F = X.F, C = X.C, D = X.D;
  const st = sp.style, W = sp.W, gH = sp.groundH, nb = sp.nb, cw = sp.cw, m = sp.margin;
  const gt = sp.groundType;
  sp.baseSegs = [[0, W]];
  const cut = (a, b) => { const out = []; for (const [p, q] of sp.baseSegs) { if (b <= p || a >= q) { out.push([p, q]); continue; } if (a > p) out.push([p, a]); if (b < q) out.push([b, q]); } sp.baseSegs = out; };
  if (gt === GT.HOUSE) {
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = m + ci * cw;
      if (ci === sp.gCell) {
        // garage door, recessed, with a concrete apron down to the lot line
        const u0 = cu0 + Math.max(0.25, (cw - 2.7) / 2), u1 = cu0 + cw - Math.max(0.25, (cw - 2.7) / 2);
        const g0 = Math.max(gv(sp, u0), gv(sp, u1)) + 0.03, v1 = Math.min(g0 + 2.25, gH - 0.3);
        holes.push({ u0, u1, v0: g0, v1 });
        F.col(sp.wallC, 0, sp.wallLayer); reveals(F, u0, u1, g0, v1, 0.22, 0, false);
        const KJ = facadeKit().json;
        if (KJ) kitRect(sp, F, u0, u1, g0, v1, -0.2, KJ.units.garage.open, KIT.garage, 1);
        else {
          F.col(shade(sp.trimC, 0.95), FLAG.NONRM * 0, L.GARAGE);
          F.q([u0, g0, -0.2], [u1, g0, -0.2], [u1, v1, -0.2], [u0, v1, -0.2].slice());
          fixDoorUV(F, 4);
        }
        F.col(sp.trimC, 0, L.TRIM);
        F.box(u0 - 0.12, u0, g0 - 0.05, v1 + 0.12, 0, 0.05, 1 | 8); F.box(u1, u1 + 0.12, g0 - 0.05, v1 + 0.12, 0, 0.05, 1 | 4);
        F.box(u0 - 0.12, u1 + 0.12, v1, v1 + 0.14, 0, 0.05, 1 | 16 | 32 | 4 | 8);
        cut(u0 - 0.12, u1 + 0.12);
        apron(sp, X, u0 - 0.1, u1 + 0.1);
      } else {
        entry(sp, X, rnd, holes, ci, ctx, cut);
      }
    }
  } else if (gt === GT.STORE) {
    // storefronts: bulkhead, display glass, transom, recessed door, sign band, awning
    const slot = signSlot(sp.zone, (sp.seed * 13.7) % 1);
    const neon = isNeonSlot(slot);
    const signV0 = gH - 1.0, signV1 = gH - 0.3;
    const awn = (st === S.COMMERCIAL || st === S.CHINATOWN) && rnd() < 0.7;
    const awnC = [sp.accC, [0.12, 0.3, 0.2], [0.55, 0.1, 0.1], [0.1, 0.15, 0.35], [0.8, 0.8, 0.78]][Math.floor(rnd() * 5)];
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = m + ci * cw, u0 = cu0 + 0.18, u1 = cu0 + cw - 0.18;
      const gb = Math.max(gv(sp, u0), gv(sp, u1));
      const v1 = signV0 - 0.12;
      const isDoor = ci === Math.floor(nb / 2) || (nb > 3 && ci === nb - 1 && rnd() < 0.5);
      holes.push({ u0, u1, v0: gb + 0.02, v1 });
      cut(u0 - 0.1, u1 + 0.1);
      const rec = 0.3;
      F.col(shade(sp.trimC, 0.8), 0, L.WOOD);
      reveals(F, u0, u1, gb + 0.02, v1, rec, 0, false);
      F.col([0.25, 0.25, 0.26], 0, L.PAVING);
      F.q([u0, gb + 0.02, -rec], [u0, gb + 0.02, 0], [u1, gb + 0.02, 0], [u1, gb + 0.02, -rec]);
      const cell = [cu0, 0, cw, gH, ci, 0];
      const it = sp.zone === 'chinatown' || rnd() < 0.3 ? IT.CAFE : IT.SHOP;
      const frameC = [[0.08, 0.08, 0.08], sp.trimC, [0.35, 0.22, 0.12]][Math.floor(rnd() * 3)];
      if (isDoor) {
        // recessed door with glass panel + sidelight display
        const du0 = (u0 + u1) / 2 - 0.5, du1 = du0 + 1.0, dr = 1.1;
        const bh = 0.5;
        F.col(frameC, 0, L.METAL);
        F.box(u0, du0, gb, gb + bh, -rec - 0.05, -rec + 0.02, 1 | 16 | 4);
        F.box(du1, u1, gb, gb + bh, -rec - 0.05, -rec + 0.02, 1 | 16 | 8);
        glass(F, u0, du0, gb + bh, v1 - 0.55, -rec, cu0, 0, cw, gH, ci, 0, it, 0, rec);
        glass(F, du1, u1, gb + bh, v1 - 0.55, -rec, cu0, 0, cw, gH, ci, 0, it, 0, rec);
        glass(F, u0, u1, v1 - 0.5, v1, -rec, cu0, 0, cw, gH, ci, 0, it, 0, rec);
        F.col(frameC, 0, L.METAL);
        F.box(u0, u1, v1 - 0.55, v1 - 0.5, -rec, -rec + 0.06, 1 | 16 | 32);
        // door recess
        F.col(shade(sp.trimC, 0.8), 0, L.WOOD);
        F.q([du0, gb, -rec], [du0, gb, -rec - dr], [du0, v1 - 0.55, -rec - dr], [du0, v1 - 0.55, -rec], [1, 0.6, 0.6, 1]);
        F.q([du1, gb, -rec - dr], [du1, gb, -rec], [du1, v1 - 0.55, -rec], [du1, v1 - 0.55, -rec - dr], [0.6, 1, 1, 0.6]);
        F.q([du0, v1 - 0.55, -rec - dr], [du1, v1 - 0.55, -rec - dr], [du1, v1 - 0.55, -rec], [du0, v1 - 0.55, -rec]);
        F.col([0.3, 0.3, 0.3], 0, L.TILE);
        F.q([du0, gb + 0.01, -rec - dr], [du0, gb + 0.01, -rec], [du1, gb + 0.01, -rec], [du1, gb + 0.01, -rec - dr]);
        glass(F, du0 + 0.08, du1 - 0.08, gb + 0.3, gb + 2.05, -rec - dr + 0.02, cu0, 0, cw, gH, ci, 0, it, 0, rec + dr);
        F.col(frameC, 0, L.METAL);
        F.box(du0, du1, gb, gb + 0.3, -rec - dr, -rec - dr + 0.05, 1 | 16);
        F.box(du0, du1, gb + 2.05, v1 - 0.55, -rec - dr, -rec - dr + 0.05, 1 | 32);
        F.box(du0, du0 + 0.08, gb + 0.3, gb + 2.05, -rec - dr, -rec - dr + 0.05, 1 | 4);
        F.box(du1 - 0.08, du1, gb + 0.3, gb + 2.05, -rec - dr, -rec - dr + 0.05, 1 | 8);
        F.box(du0 + 0.1, du0 + 0.14, gb + 1.0, gb + 1.1, -rec - dr + 0.05, -rec - dr + 0.1, 63);
      } else if (rnd() < 0.14) {
        // closed shop: roll-down shutter with its housing
        F.col(rnd() < 0.5 ? [0.5, 0.51, 0.52] : shade(sp.accC, 0.8), 0, L.ROLLUP);
        F.rect(u0, u1, gb, v1 - 0.3, -0.08);
        F.col([0.18, 0.18, 0.2], 0, L.METAL);
        F.box(u0 - 0.02, u1 + 0.02, v1 - 0.32, v1, -0.1, 0.12, 1 | 32 | 4 | 8);
        F.box(u0, u0 + 0.05, gb, v1 - 0.3, -0.1, 0.0, 1 | 4); F.box(u1 - 0.05, u1, gb, v1 - 0.3, -0.1, 0.0, 1 | 8);
      } else {
        const bh = 0.45 + rnd() * 0.2;
        F.col(rnd() < 0.5 ? [0.5, 0.5, 0.52] : shade(sp.accC, 0.9), 0, rnd() < 0.5 ? L.TILE : L.WOOD);
        F.box(u0, u1, gb, gb + bh, -rec - 0.05, -rec + 0.04, 1 | 16);
        glass(F, u0, u1, gb + bh, v1 - 0.55, -rec, cu0, 0, cw, gH, ci, 0, it, 3, rec);
        glass(F, u0, u1, v1 - 0.5, v1, -rec, cu0, 0, cw, gH, ci, 0, it, 0, rec);
        F.col(frameC, 0, L.METAL);
        F.box(u0, u1, v1 - 0.55, v1 - 0.5, -rec, -rec + 0.06, 1 | 16 | 32);
        const nm = Math.max(1, Math.round((u1 - u0) / 1.4));
        for (let k = 1; k < nm; k++) { const uu = u0 + (u1 - u0) * k / nm; F.box(uu - 0.03, uu + 0.03, gb + bh, v1, -rec, -rec + 0.06, 1 | 4 | 8); }
      }
      // pilaster between bays
      F.col(ctx.masonry ? STONE : sp.trimC, 0, ctx.masonry ? L.STONE : L.TRIM);
      F.box(cu0 - 0.18, cu0 + 0.18, gb - 0.05, signV0 - 0.05, 0, 0.1, 1 | 4 | 8);
      if (ci === nb - 1) F.box(cu0 + cw - 0.18, cu0 + cw + 0.18, gb - 0.05, signV0 - 0.05, 0, 0.1, 1 | 4 | 8);
    }
    // sign band across the storefronts
    F.col(neon ? [0.05, 0.05, 0.06] : shade(sp.trimC, 0.7), 0, L.METAL);
    F.box(m - 0.1, W - m + 0.1, signV0 - 0.08, signV1 + 0.06, 0, 0.12, 1 | 4 | 8 | 16 | 32);
    const sw = Math.min(W - 2 * m - 0.3, 6.5), su0 = (W - sw) / 2;
    decalRect(D, su0, su0 + sw, signV0, signV1, 0.125, DECAL.sign(slot), neon ? 2 : 1, [1, 1, 1], sp.seed);
    if (nb >= 3 && W > 12) { // second sign for wide shopfronts
      const s2 = signSlot(sp.zone, (sp.seed * 71.3) % 1), w2 = Math.min(5, (W - 2 * m) * 0.35);
      decalRect(D, W - m - w2 - 0.2, W - m - 0.2, signV0, signV1, 0.126, DECAL.sign(s2), isNeonSlot(s2) ? 2 : 1, [1, 1, 1], sp.seed * 3);
      decalRect(D, m + 0.2, m + 0.2 + w2, signV0, signV1, 0.126, DECAL.sign(s2 + 1), isNeonSlot(s2 + 1) ? 2 : 1, [1, 1, 1], sp.seed * 5);
    }
    if (awn) awning(F, m, W - m, signV0 - 0.15, 1.35, 0.7, awnC);
    lightPool(sp, X, m, W - m, sp.setback + 3.1, [1.0, 0.72, 0.45], 1.0);
    if (st === S.CHINATOWN) lanterns(sp, X, m + 0.4, W - m - 0.4, signV0 - (awn ? 1.0 : 0.3), awn ? 1.2 : 0.5);
  } else if (gt === GT.LOBBY) {
    const u0 = m + 0.3, u1 = W - m - 0.3;
    const gb = Math.max(gv(sp, u0), gv(sp, u1));
    const v1 = gH - 0.7;
    holes.push({ u0, u1, v0: gb + 0.02, v1 });
    cut(u0 - 0.2, u1 + 0.2);
    const rec = 0.8;
    F.col([0.3, 0.29, 0.3], 0, L.GRANITE);
    reveals(F, u0, u1, gb + 0.02, v1, rec, 0, false);
    F.col([0.55, 0.52, 0.48], 0, L.MARBLE);
    F.q([u0, gb + 0.02, -rec], [u0, gb + 0.02, 0], [u1, gb + 0.02, 0], [u1, gb + 0.02, -rec]);
    const nm = Math.max(2, Math.round((u1 - u0) / 1.8));
    for (let k = 0; k < nm; k++) {
      const a = u0 + (u1 - u0) * k / nm, b = u0 + (u1 - u0) * (k + 1) / nm;
      glass(F, a, b, gb + 0.02, v1, -rec, u0, 0, u1 - u0, gH, 0, 0, IT.LOBBY, 3, rec);   // one lobby room across all panes
      F.col([0.12, 0.12, 0.13], 0, L.METAL);
      F.box(a - 0.04, a + 0.04, gb, v1, -rec, -rec + 0.12, 1 | 4 | 8);
    }
    F.col([0.12, 0.12, 0.13], 0, L.METAL);
    F.box(u0, u1, gb, gb + 0.12, -rec, -rec + 0.1, 1 | 16);
    // canopy
    const cu = W / 2, cwid = Math.min(6, W * 0.4);
    F.col([0.18, 0.18, 0.2], 0, L.METAL);
    F.box(cu - cwid / 2, cu + cwid / 2, gb + 3.1, gb + 3.35, 0, 2.2, 63);
    F.col([1, 0.85, 0.6], 0, L.TRIM); F.b.sk = M.LIGHT;
    for (let k = 0; k < 3; k++) { const uu = cu - cwid / 3 + k * cwid / 3; F.box(uu - 0.15, uu + 0.15, gb + 3.08, gb + 3.1, 0.8, 1.2, 32); }
    // stone surround piers
    F.col(STONE, 0, L.RUSTIC);
    F.box(-0.02, u0, gb - 0.1, gH - 0.2, 0, 0.12, 1 | 8 | 4);
    F.box(u1, W + 0.02, gb - 0.1, gH - 0.2, 0, 0.12, 1 | 4 | 8);
  } else if (gt === GT.ROLLUP) {
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = m + ci * cw;
      const u0 = cu0 + cw * 0.12, u1 = cu0 + cw * 0.88;
      const gb = Math.max(gv(sp, u0), gv(sp, u1));
      const roll = ci % 2 === 0 || nb === 1;
      const v1 = roll ? Math.min(gb + 3.8, gH - 0.7) : Math.min(gb + 2.6, gH - 0.6);
      holes.push({ u0, u1, v0: gb + 0.02, v1 });
      cut(u0 - 0.1, u1 + 0.1);
      F.col(sp.wallC, 0, sp.wallLayer); reveals(F, u0, u1, gb + 0.02, v1, 0.35, 0, false);
      if (roll) {
        F.col(rnd() < 0.5 ? [0.55, 0.56, 0.58] : shade(sp.accC, 0.9), 0, L.ROLLUP);
        F.rect(u0, u1, gb + 0.02, v1, -0.33);
        F.col(DARKMETAL, 0, L.METAL); F.box(u0 - 0.05, u1 + 0.05, v1 - 0.3, v1, -0.33, -0.05, 1 | 32);
      } else {
        glass(F, u0, u1, gb + 0.9, v1, -0.33, cu0, 0, cw, gH, ci, 0, IT.LOFT, 5, 0.33);
        F.col(DARKMETAL, 0, L.METAL); sash(F, u0, u1, gb + 0.9, v1, -0.33, 5, 0);
        F.col(sp.wallC, 0, sp.wallLayer); F.rect(u0, u1, gb + 0.02, gb + 0.9, -0.33);
      }
      F.col(STONE, 0, L.STONE);
      F.box(u0 - 0.15, u1 + 0.15, v1, v1 + 0.3, 0, 0.05, 1 | 4 | 8 | 16 | 32);
      // loading dock step
      if (roll && rnd() < 0.4) { F.col(CONCRETE, 0, L.CONCRETE); F.box(u0 - 0.3, u1 + 0.3, gb - 0.2, gb + 0.9, 0, 1.1, 1 | 4 | 8 | 16); }
    }
  } else {
    // residential ground floor: raised windows + central entry with a canopy
    const eci = Math.floor(nb / 2);
    for (let ci = 0; ci < nb; ci++) {
      const cu0 = m + ci * cw;
      if (ci === eci) { entryFlat(sp, X, holes, cu0, cw, cut); continue; }
      const ww = Math.min(sp.winW, cw - 0.4), u0 = cu0 + (cw - ww) / 2;
      const gb = Math.max(gv(sp, u0), gv(sp, u0 + ww));
      const v0 = Math.max(gb + 1.0, 1.0), v1 = Math.min(gH - 0.35, v0 + sp.winH);
      if (v1 - v0 < 0.6) continue;
      const o = { u0, u1: u0 + ww, v0, v1, rec: sp.recess, cell: [cu0, 0, cw, gH, ci, 0], itype: sp.itype, bars: ctx.bars, deco: ctx.deco };
      holes.push({ u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1 });
      windowUnit(sp, X, o);
    }
  }
}

// warm light spilling onto the sidewalk in front of lit ground floors (additive, night only), following the terrain
function lightPool(sp, X, u0, u1, dOut, col, k) {
  const Lf = X.L, B = Lf.b, H = X.H;
  if (u1 - u0 < 0.5) return;
  B.sk = 0; B.sc[0] = col[0] * 255; B.sc[1] = col[1] * 255; B.sc[2] = col[2] * 255; B.sc[3] = Math.min(255, k * 128); B.sz = 0; B.sw = 0;
  const n = Math.max(1, Math.round((u1 - u0) / 3));
  for (let i = 0; i < n; i++) {
    const a = u0 + (u1 - u0) * i / n - 0.8, b = u0 + (u1 - u0) * (i + 1) / n + 0.8;
    const P = (u, d) => { const x = Lf.wx(u, d), z = Lf.wz(u, d); return [x, H(x, z) + 0.175, z]; };
    const p = [P(a, 0.05), P(b, 0.05), P(b, dOut), P(a, dOut)];
    const uv = [[0, 0.5], [1, 0.5], [1, 1], [0, 1]];
    const ids = p.map((q, j) => B.v(q[0], q[1], q[2], 0, 1, 0, uv[j][0], uv[j][1]));
    B.quad(ids[0], ids[3], ids[2], ids[1]);
  }
}

// map a garage/door quad's uv to 0..1 across its extents (last `n` vertices)
function fixDoorUV(F, n) {
  const B = F.b, i0 = B.n - n;
  const uv = B.uv;
  const U = [0, 1, 1, 0], V = [0, 0, 1, 1];
  for (let k = 0; k < n; k++) { uv[(i0 + k) * 4] = U[k]; uv[(i0 + k) * 4 + 1] = V[k]; }
}

// concrete apron / driveway from the facade to the lot front, following the terrain
function apron(sp, X, u0, u1) {
  const F = X.F, H = X.H;
  const d1 = sp.setback + 0.4;
  if (d1 < 0.3) return;
  const y = (u, d) => H(F.wx(u, d), F.wz(u, d)) - sp.y0 + 0.04;
  F.col([0.6, 0.59, 0.56], 0, L.PAVING);
  F.q([u0, y(u0, d1), d1], [u1, y(u1, d1), d1], [u1, y(u1, 0), 0], [u0, y(u0, 0), 0]);
}

// recessed stair vestibule of a house: stairs from the lot line up to a door on the main floor
function entry(sp, X, rnd, holes, ci, ctx, cut) {
  const F = X.F, H = X.H;
  const cw = sp.cw, m = sp.margin, gH = sp.groundH, cu0 = m + ci * cw;
  const st = sp.style;
  const ew = Math.min(1.5, cw - 0.9);
  const u0 = cu0 + (cw - ew) / 2, u1 = u0 + ew;
  const gb = Math.min(gv(sp, u0), gv(sp, u1));
  const vDoor = st === S.STUCCO ? Math.min(1.2, gH * 0.4) : gH;   // entry floor level
  const vTop = vDoor + 2.55;
  const arch = st === S.STUCCO && sp.archEntry || (st === S.EDWARDIAN && rnd() < 0.4);
  const run = Math.max(0, (vDoor - gb) / 0.18) * 0.27;
  const dOut = sp.setback + 0.3;
  const depth = Math.min(Math.max(1.2, run - dOut + 1.2), 3.2);   // how far the vestibule cuts into the building
  holes.push({ u0, u1, v0: gb - 0.4, v1: vTop });
  cut(u0 - 0.2, u1 + 0.2);
  // vestibule side walls, ceiling, back wall with door
  F.col(shade(sp.wallC, 0.97), 0, sp.wallLayer === L.SIDING ? L.TRIM : sp.wallLayer);
  F.q([u0, gb - 0.4, 0], [u0, gb - 0.4, -depth], [u0, vTop, -depth], [u0, vTop, 0], [1, 0.6, 0.6, 1]);
  F.q([u1, gb - 0.4, -depth], [u1, gb - 0.4, 0], [u1, vTop, 0], [u1, vTop, -depth], [0.6, 1, 1, 0.6]);
  F.q([u0, vTop, -depth], [u1, vTop, -depth], [u1, vTop, 0], [u0, vTop, 0], [0.55, 0.55, 0.9, 0.9]);
  F.rect(u0, u0 + (ew - 1.0) / 2, vDoor, vTop, -depth, [0.6, 0.6, 0.6, 0.6]);
  F.rect(u1 - (ew - 1.0) / 2, u1, vDoor, vTop, -depth, [0.6, 0.6, 0.6, 0.6]);
  const du0 = u0 + (ew - 1.0) / 2, du1 = du0 + 1.0;
  // door (panelled) + transom glass
  const KJ = facadeKit().json;
  if (KJ) { const J = KJ.units[st === S.VICTORIAN ? 'vic_door' : 'edw_door']; kitRect(sp, F, du0, du1, vDoor, vDoor + 2.15, -depth + 0.02, J.door, st === S.VICTORIAN ? KIT.vic_door : KIT.edw_door, 1); }
  else {
    F.col(sp.accC, 0, L.DOOR);
    F.q([du0, vDoor, -depth + 0.02], [du1, vDoor, -depth + 0.02], [du1, vDoor + 2.15, -depth + 0.02], [du0, vDoor + 2.15, -depth + 0.02]);
    fixDoorUV(F, 4);
  }
  glass(F, du0, du1, vDoor + 2.2, vTop - 0.05, -depth + 0.02, du0, vDoor, 1.0, 2.6, ci, 1, IT.RES, 0, 0.1);
  F.col(sp.trimC, 0, L.TRIM);
  F.box(du0 - 0.1, du0, vDoor, vTop, -depth, -depth + 0.06, 1 | 4);
  F.box(du1, du1 + 0.1, vDoor, vTop, -depth, -depth + 0.06, 1 | 8);
  F.box(du0, du1, vDoor + 2.15, vDoor + 2.2, -depth, -depth + 0.06, 1 | 16 | 32);
  // lamp by the door
  F.col([1, 0.8, 0.55], 0, L.TRIM); F.b.sk = M.LIGHT;
  F.box(du1 + 0.12, du1 + 0.26, vDoor + 1.9, vDoor + 2.15, -depth + 0.05, -depth + 0.17, 63);
  lightPool(sp, X, u0 - 0.6, u1 + 0.6, sp.setback + 1.6, [1.0, 0.78, 0.5], 0.55);
  // floor of the landing
  F.col([0.55, 0.53, 0.5], 0, L.PAVING);
  F.q([u0, vDoor, -depth], [u0, vDoor, -depth + 1.1], [u1, vDoor, -depth + 1.1], [u1, vDoor, -depth]);
  // stairs: from the lot line inward to the landing
  const dIn = -depth + 1.1;
  const yL = H(F.wx((u0 + u1) / 2, dOut), F.wz((u0 + u1) / 2, dOut)) - sp.y0;
  const yLow = Math.min(yL, gb);
  stairs(F, u0, u1, dOut, dIn, yLow, vDoor, [0.62, 0.6, 0.57]);
  // entrance surround: pilasters + entablature / arch
  F.col(sp.trimC, 0, L.TRIM);
  if (arch) {
    F.col(shade(sp.wallC, 1.05), 0, sp.wallLayer);
    archSpandrels(F, u0, u1, vTop);
    F.col(sp.trimC, 0, L.TRIM);
    const r = ew / 2, cu = u0 + r, cv = vTop - r, n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI;
      const i0 = [cu + Math.cos(a0) * r, cv + Math.sin(a0) * r], i1 = [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r];
      const o0 = [cu + Math.cos(a0) * (r + 0.18), cv + Math.sin(a0) * (r + 0.18)], o1 = [cu + Math.cos(a1) * (r + 0.18), cv + Math.sin(a1) * (r + 0.18)];
      F.q([i0[0], i0[1], 0.05], [o0[0], o0[1], 0.05], [o1[0], o1[1], 0.05], [i1[0], i1[1], 0.05]);
      F.q([i1[0], i1[1], 0], [i1[0], i1[1], 0.05], [i0[0], i0[1], 0.05], [i0[0], i0[1], 0]);
    }
  } else {
    F.box(u0 - 0.22, u0, gb, vTop, 0, 0.12, 1 | 4 | 8);
    F.box(u1, u1 + 0.22, gb, vTop, 0, 0.12, 1 | 4 | 8);
    F.box(u0 - 0.3, u1 + 0.3, vTop, vTop + 0.35, 0, 0.16, 1 | 4 | 8 | 32);
    F.box(u0 - 0.4, u1 + 0.4, vTop + 0.35, vTop + 0.45, 0, 0.3, 63);
    if (st === S.VICTORIAN) { const pu0 = u0 - 0.4, pu1 = u1 + 0.4, pv = vTop + 0.45, ph = (pu1 - pu0) * 0.25; F.tri([pu0, pv, 0.3], [pu1, pv, 0.3], [(pu0 + pu1) / 2, pv + ph, 0.3]); F.q([pu0 - 0.05, pv, 0.33], [(pu0 + pu1) / 2, pv + ph + 0.06, 0.33], [(pu0 + pu1) / 2, pv + ph + 0.06, 0], [pu0 - 0.05, pv, 0]); F.q([(pu0 + pu1) / 2, pv + ph + 0.06, 0.33], [pu1 + 0.05, pv, 0.33], [pu1 + 0.05, pv, 0], [(pu0 + pu1) / 2, pv + ph + 0.06, 0]); }
  }
  // iron railing on the cheek walls
  if (vDoor - yLow > 0.6) railing(sp, X, u0 - 0.09, u1 + 0.09, dOut, yLow + 0.35, dIn, vDoor + 0.35);
  // small basement window next to the stairs (houses on raised basements)
  if (st !== S.STUCCO && cw - ew > 1.6) {
    const bw0 = u1 + 0.35, bw1 = Math.min(cu0 + cw - 0.25, bw0 + 0.9);
    const bv0 = Math.max(gv(sp, bw0), gv(sp, bw1)) + 0.8, bv1 = Math.min(gH - 0.35, bv0 + 1.0);
    if (bw1 - bw0 > 0.5 && bv1 - bv0 > 0.5) {
      holes.push({ u0: bw0, u1: bw1, v0: bv0, v1: bv1 });
      windowUnit(sp, X, { u0: bw0, u1: bw1, v0: bv0, v1: bv1, rec: 0.12, cell: [cu0, 0, cw, gH, ci, 0], itype: IT.RES, bars: 4, deco: ctx.deco === 'vic' ? 'casing' : ctx.deco });
    }
  }
}
function railing(sp, X, uL, uR, dOut, vOut, dIn, vIn) {
  const C = X.C, tint = [0.05, 0.05, 0.055];
  const h = 0.9;
  for (const u of [uL, uR]) cutQuad(C, [u, vOut, dOut], [u, vIn, dIn], [u, vIn + h, dIn], [u, vOut + h, dOut], CUT.iron, tint, 1);
}
// flat entry for apartments / offices: recessed door with a canopy and a couple of steps
function entryFlat(sp, X, holes, cu0, cw, cut) {
  const F = X.F;
  const ew = Math.min(2.0, cw - 0.5), u0 = cu0 + (cw - ew) / 2, u1 = u0 + ew;
  const gb = Math.max(gv(sp, u0), gv(sp, u1)) + 0.02, v1 = gb + 2.9, rec = 0.9;
  holes.push({ u0, u1, v0: gb, v1 });
  cut(u0 - 0.3, u1 + 0.3);
  F.col(STONE, 0, L.STONE);
  reveals(F, u0, u1, gb, v1, rec, 0, false);
  F.col([0.45, 0.44, 0.42], 0, L.TILE);
  F.q([u0, gb, -rec], [u0, gb, 0], [u1, gb, 0], [u1, gb, -rec]);
  F.col(sp.accC, 0, L.DOOR);
  const du0 = u0 + 0.1, du1 = u1 - 0.1;
  const KJ = facadeKit().json;
  if (KJ) {
    const Jd = KJ.units.edw_door.door, dm = (du0 + du1) / 2;
    kitRect(sp, F, du0, dm, gb, gb + 2.3, -rec + 0.02, Jd, KIT.edw_door, 1);
    kitRect(sp, F, dm, du1, gb, gb + 2.3, -rec + 0.02, [Jd[2], Jd[1], Jd[0], Jd[3]], KIT.edw_door, 1);
  } else {
    F.q([du0, gb, -rec + 0.02], [(du0 + du1) / 2, gb, -rec + 0.02], [(du0 + du1) / 2, gb + 2.3, -rec + 0.02], [du0, gb + 2.3, -rec + 0.02]); fixDoorUV(F, 4);
    F.q([(du0 + du1) / 2, gb, -rec + 0.02], [du1, gb, -rec + 0.02], [du1, gb + 2.3, -rec + 0.02], [(du0 + du1) / 2, gb + 2.3, -rec + 0.02]); fixDoorUV(F, 4);
  }
  glass(F, u0, u1, gb + 2.35, v1, -rec + 0.02, u0, 0, ew, 3, 0, 0, IT.LOBBY, 0, 0.1);
  F.col(STONE, 0, L.STONE);
  F.box(u0 - 0.35, u0, gb - 0.1, v1 + 0.2, 0, 0.14, 1 | 4 | 8); F.box(u1, u1 + 0.35, gb - 0.1, v1 + 0.2, 0, 0.14, 1 | 4 | 8);
  F.box(u0 - 0.45, u1 + 0.45, v1 + 0.2, v1 + 0.55, 0, 0.22, 63);
  F.col([0.15, 0.15, 0.17], 0, L.METAL);
  F.box(u0 - 0.2, u1 + 0.2, v1 + 0.6, v1 + 0.8, 0, 1.8, 63);
  F.col([1, 0.85, 0.6], 0, L.TRIM); F.b.sk = M.LIGHT;
  F.box((u0 + u1) / 2 - 0.2, (u0 + u1) / 2 + 0.2, v1 + 0.58, v1 + 0.6, 0.8, 1.2, 32);
  F.col([0.6, 0.58, 0.55], 0, L.PAVING);
  F.box(u0 - 0.2, u1 + 0.2, gb - 0.4, gb, 0, 0.45, 1 | 4 | 8 | 16);
  lightPool(sp, X, u0 - 1.2, u1 + 1.2, sp.setback + 2.8, [1.0, 0.8, 0.55], 0.8);
}

// ---------------------------------------------------------------- bay window (3 facets) with windows per floor
function bayWindow(sp, X, ci, ua, ub, dep, inset, v0, v1, deco, bars, rnd) {
  const F = X.F, G = X.G;
  const pts = [[ua, 0], [ua + inset, dep], [ub - inset, dep], [ub, 0]];
  const floors = sp.floors, gH = sp.groundH, fH = sp.floorH;
  const trim = sp.trimC;
  for (let f = 0; f < 3; f++) {
    const [pa, pd] = pts[f], [qa, qd] = pts[f + 1];
    const len = Math.hypot(qa - pa, qd - pd);
    // facet frame: origin at the facet start, t along the facet
    const ox = F.wx(pa, pd), oz = F.wz(pa, pd);
    const tx = F.tx * (qa - pa) / len + F.nx * (qd - pd) / len, tz = F.tz * (qa - pa) / len + F.nz * (qd - pd) / len;
    G.set(ox, sp.y0, oz, tx, tz);
    const holes = [];
    const X2 = { F: G, C: X.C, D: X.D, H: X.H };
    for (let row = 1; row <= floors; row++) {
      const cv0 = gH + (row - 1) * fH;
      const margin = f === 1 ? 0.2 : 0.14;
      const ww = len - 2 * margin;
      if (ww < 0.35) continue;
      const wv0 = cv0 + Math.max(sp.sillH, 0.6), wv1 = Math.min(cv0 + fH - 0.45, wv0 + sp.winH + 0.1);
      holes.push({ u0: margin, u1: len - margin, v0: wv0, v1: wv1 });
      windowUnit(sp, X2, { u0: margin, u1: len - margin, v0: wv0, v1: wv1, rec: 0.1, cell: [0, cv0, len, fH, 0, row], itype: sp.itype, bars: f === 1 && bars === 2 ? 2 : 1, deco: 'bay' });
      // decorative panel below the window (accent-painted on Victorians)
      G.col(sp.style === S.VICTORIAN ? sp.accC : trim, 0, L.TRIM);
      G.box(margin, len - margin, cv0 + 0.18, wv0 - 0.12, 0, 0.035, 1 | 4 | 8 | 16 | 32);
      G.box(margin - 0.02, len - margin + 0.02, wv0 - 0.1, wv0, -0.05, 0.08, 1 | 16 | 32 | 4 | 8);
    }
    G.col(sp.wallC, 0, sp.wallLayer);
    wallHoles(G, 0, len, v0, v1, holes);
    // corner posts
    G.col(trim, 0, L.TRIM);
    G.box(-0.05, 0.1, v0, v1, 0, 0.05, 1 | 4 | 8);
  }
  // bay top (cornice + roof) and bottom (soffit + brackets)
  F.col(trim, 0, L.TRIM);
  const o = [[ua - 0.1, 0], [ua + inset - 0.03, dep + 0.14], [ub - inset + 0.03, dep + 0.14], [ub + 0.1, 0]];
  F.q([o[0][0], v1, 0], [o[3][0], v1, 0], [o[2][0], v1, o[2][1]], [o[1][0], v1, o[1][1]]);
  F.q([o[0][0], v1 + 0.42, 0], [o[1][0], v1 + 0.42, o[1][1]], [o[2][0], v1 + 0.42, o[2][1]], [o[3][0], v1 + 0.42, 0]);
  for (let i = 0; i < 3; i++) { const p = o[i], q = o[i + 1]; F.q([p[0], v1, p[1]], [q[0], v1, q[1]], [q[0], v1 + 0.42, q[1]], [p[0], v1 + 0.42, p[1]]); }
  F.q([pts[0][0], v0, 0], [pts[3][0], v0, 0], [pts[2][0], v0, pts[2][1]], [pts[1][0], v0, pts[1][1]]);
  const i2 = [[ua - 0.05, 0], [ua + inset, dep + 0.06], [ub - inset, dep + 0.06], [ub + 0.05, 0]];
  for (let i = 0; i < 3; i++) { const p = i2[i], q = i2[i + 1]; F.q([p[0], v0 - 0.22, p[1]], [q[0], v0 - 0.22, q[1]], [q[0], v0, q[1]], [p[0], v0, p[1]]); }
  F.q([i2[0][0], v0 - 0.22, 0], [i2[3][0], v0 - 0.22, 0], [i2[2][0], v0 - 0.22, i2[2][1]], [i2[1][0], v0 - 0.22, i2[1][1]]);
  for (const u of [ua + 0.15, (ua + ub) / 2, ub - 0.15]) F.box(u - 0.07, u + 0.07, v0 - 0.62, v0 - 0.22, 0, dep * 0.8, 1 | 4 | 8 | 32);
}

// Queen Anne front gable: shingled pediment with an attic window, bargeboards and a pitched roof behind
function gable(sp, X, rnd) {
  const F = X.F;
  const W = sp.W, top = sp.topH, D = sp.depth;
  const gh = Math.min(3.2, W * 0.36);
  cornice(sp, X, 0, W, top, 'classic', rnd);
  F.col(sp.wallC, 0, L.SHINGLE);
  F.tri([0, top, 0], [W, top, 0], [W / 2, top + gh, 0]);
  // attic window
  const aw = Math.min(1.1, W * 0.14), av0 = top + 0.35, av1 = av0 + Math.min(1.2, gh * 0.45);
  const u0 = W / 2 - aw / 2;
  windowUnit(sp, X, { u0, u1: u0 + aw, v0: av0, v1: av1, rec: 0.08, cell: [u0 - 0.5, top, aw + 1, gh, 0, sp.floors + 1], itype: IT.RES, bars: 4, deco: 'casing' });
  F.col(sp.wallC, 0, L.SHINGLE);
  F.rect(u0 - 0.2, u0 + aw + 0.2, av0 - 0.2, av1 + 0.2, 0.001);
  // bargeboards along the rakes
  F.col(sp.trimC, 0, L.TRIM);
  const bw = 0.22, ov = 0.35, bd = 0.12;
  F.q([-ov, top - ov * gh / (W / 2), bd], [W / 2, top + gh, bd], [W / 2, top + gh - bw, bd], [-ov, top - ov * gh / (W / 2) - bw, bd]);
  F.q([W / 2, top + gh, bd], [W + ov, top - ov * gh / (W / 2), bd], [W + ov, top - ov * gh / (W / 2) - bw, bd], [W / 2, top + gh - bw, bd]);
  // roof slopes
  F.mat(L.ROOF_SHINGLE, 0.5, 0.48, 0.5);
  const back = -Math.min(D * 0.55, 8);
  F.q([W / 2, top + gh + 0.05, 0.3], [W / 2, top + gh + 0.05, back], [-ov, top - ov * gh / (W / 2), back], [-ov, top - ov * gh / (W / 2), 0.3]);
  F.q([W + ov, top - ov * gh / (W / 2), 0.3], [W + ov, top - ov * gh / (W / 2), back], [W / 2, top + gh + 0.05, back], [W / 2, top + gh + 0.05, 0.3]);
  F.col(sp.wallC, 0, L.SHINGLE);
  F.tri([0, top, back], [W / 2, top + gh, back], [W, top, back]);
  // finial
  F.col(sp.trimC, 0, L.TRIM);
  F.box(W / 2 - 0.05, W / 2 + 0.05, top + gh, top + gh + 0.6, 0.25, 0.35, 63 - 32);
}

function turretNear(sp, X, rnd) {
  const F = X.F;
  turret(F, sp, rnd, false);
  // windows on the turret: small glass panes on the street-facing segments
  const W = sp.W, top = sp.topH;
  const onLeft = sp.exposeL || !sp.exposeR;
  const r = Math.min(1.7, W * 0.2), cu = onLeft ? r * 0.7 : W - r * 0.7, cd = r * 0.55;
  const n = 16;
  for (let row = 1; row <= sp.floors; row++) {
    const cv0 = sp.groundH + (row - 1) * sp.floorH;
    for (let i = 0; i < n; i++) {
      const a0 = -i / n * Math.PI * 2, a1 = -(i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      if (Math.sin(am) < 0.15) continue; // only the outward half
      if (i % 2) continue;
      const p0 = [cu + Math.cos(a0) * (r + 0.01), cd + Math.sin(a0) * (r + 0.01)], p1 = [cu + Math.cos(a1) * (r + 0.01), cd + Math.sin(a1) * (r + 0.01)];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const G = X.G;
      G.set(F.wx(p0[0], p0[1]), sp.y0, F.wz(p0[0], p0[1]), F.tx * (p1[0] - p0[0]) / len + F.nx * (p1[1] - p0[1]) / len, F.tz * (p1[0] - p0[0]) / len + F.nz * (p1[1] - p0[1]) / len);
      // turret points run clockwise, so the facet normal from G.set points inward: flip by swapping
      const wv0 = cv0 + 0.8, wv1 = cv0 + 0.8 + Math.min(1.8, sp.floorH - 1.3);
      glass(G, len, 0, wv0, wv1, 0, 0, cv0, len, sp.floorH, 0, row, IT.RES, 1, 0.02);
    }
  }
}

// ---------------------------------------------------------------- ironwork / extras
function fireEscape(sp, X, rnd) {
  const F = X.F, C = X.C;
  const nb = sp.nb, cw = sp.cw, m = sp.margin, gH = sp.groundH, fH = sp.floorH;
  const span = Math.min(nb, 2);
  const c0 = Math.min(nb - span, Math.floor(rnd() * Math.max(1, nb - span + 1)));
  const u0 = m + c0 * cw + 0.3, u1 = m + (c0 + span) * cw - 0.3;
  const dp = 1.05, tint = sp.zone === 'chinatown' ? [0.1, 0.25, 0.15] : [0.06, 0.06, 0.065];
  for (let row = 1; row <= sp.floors; row++) {
    const v = gH + (row - 1) * fH + 0.05;
    // platform grating + frame + brackets
    cutQuad(C, [u0, v, dp], [u1, v, dp], [u1, v, 0.02], [u0, v, 0.02], CUT.grate, tint, Math.max(1, Math.round((u1 - u0) / 1.5)));
    F.col(tint, FLAG.NONRM, L.METAL);
    F.box(u0, u1, v - 0.08, v, dp - 0.05, dp, 1 | 16 | 32);
    F.box(u0, u0 + 0.05, v - 0.08, v, 0, dp, 4 | 8 | 16 | 32); F.box(u1 - 0.05, u1, v - 0.08, v, 0, dp, 4 | 8 | 16 | 32);
    for (const u of [u0 + 0.2, u1 - 0.2]) F.q([u - 0.03, v - 0.08, dp * 0.9], [u + 0.03, v - 0.08, dp * 0.9], [u + 0.03, v - 0.7, 0], [u - 0.03, v - 0.7, 0]);
    // railings
    const rh = 1.0;
    cutQuad(C, [u0, v, dp], [u1, v, dp], [u1, v + rh, dp], [u0, v + rh, dp], CUT.rail, tint, Math.max(1, Math.round((u1 - u0) / 1.6)));
    cutQuad(C, [u0, v, 0.02], [u0, v, dp], [u0, v + rh, dp], [u0, v + rh, 0.02], CUT.rail, tint, 0.6);
    cutQuad(C, [u1, v, dp], [u1, v, 0.02], [u1, v + rh, 0.02], [u1, v + rh, dp], CUT.rail, tint, 0.6);
    F.box(u0, u1, v + rh - 0.04, v + rh, dp - 0.04, dp, 1 | 16 | 32);
    // stair flight to the next platform
    if (row < sp.floors) {
      const sa = u0 + 0.15, sb = u1 - 0.35;
      cutQuad(C, [sa, v, dp * 0.55], [sb, v + fH, dp * 0.55], [sb, v + fH + 0.5, dp * 0.55], [sa, v + 0.5, dp * 0.55], CUT.stair, tint, 1);
      F.q([sa, v, dp * 0.5], [sb, v + fH, dp * 0.5], [sb, v + fH + 0.1, dp * 0.5], [sa, v + 0.1, dp * 0.5]);
      F.q([sb, v + fH, dp * 0.5], [sa, v, dp * 0.5], [sa, v + 0.1, dp * 0.5], [sb, v + fH + 0.1, dp * 0.5]);
    } else if (row === 1 || sp.floors === 1) { /* nothing */ }
    if (row === 1) { // drop ladder
      const lu = u1 - 0.55;
      cutQuad(C, [lu, v - 2.2, dp - 0.1], [lu + 0.45, v - 2.2, dp - 0.1], [lu + 0.45, v + 0.9, dp - 0.1], [lu, v + 0.9, dp - 0.1], CUT.ladder, tint, 1);
    }
  }
}
function balconies(sp, X, rnd) {
  const F = X.F, C = X.C;
  const nb = sp.nb, cw = sp.cw, m = sp.margin, gH = sp.groundH, fH = sp.floorH;
  const full = rnd() < 0.5;
  const tint = sp.trimC;
  for (let row = 1; row <= sp.floors; row++) {
    const v = gH + (row - 1) * fH + 0.02;
    const spans = full ? [[m + 0.1, sp.W - m - 0.1]] : Array.from({ length: nb }, (_, i) => i).filter(i => i % 2 === (row % 2)).map(i => [m + i * cw + 0.25, m + (i + 1) * cw - 0.25]);
    for (const [a, b] of spans) {
      const dp = 0.85;
      F.col(CONCRETE, 0, L.CONCRETE);
      F.box(a, b, v - 0.16, v, 0, dp, 63 - 2);
      cutQuad(C, [a, v, dp], [b, v, dp], [b, v + 1.0, dp], [a, v + 1.0, dp], CUT.china, tint, Math.max(1, Math.round((b - a) / 1.6)));
      cutQuad(C, [a, v, 0], [a, v, dp], [a, v + 1.0, dp], [a, v + 1.0, 0], CUT.china, tint, 0.5);
      cutQuad(C, [b, v, dp], [b, v, 0], [b, v + 1.0, 0], [b, v + 1.0, dp], CUT.china, tint, 0.5);
      F.col(tint, 0, L.TRIM);
      F.box(a, b, v + 0.96, v + 1.04, dp - 0.06, dp + 0.02, 63);
      if (sp.zone === 'chinatown' && rnd() < 0.5) lanterns(sp, X, a + 0.3, b - 0.3, v - 0.2, dp - 0.1);
    }
  }
}
function lanterns(sp, X, u0, u1, v, d) {
  // round paper lanterns: 8-sided barrels (emissive at night) hanging on short cords
  const D = X.D, F = X.F;
  const n = Math.max(1, Math.floor((u1 - u0) / 1.3));
  const uvr = DECAL.lantern, B = D.b;
  const seg = 8, rings = [[0.07, 0], [0.15, 0.08], [0.17, 0.18], [0.15, 0.28], [0.07, 0.36]];
  for (let i = 0; i <= n; i++) {
    const u = u0 + (u1 - u0) * i / Math.max(1, n), top = v - 0.18;
    B.sk = 0; B.sc[0] = 255; B.sc[1] = 255; B.sc[2] = 255; B.sc[3] = 3; B.sz = 0; B.sw = 0;
    let prev = null;
    for (let r = 0; r < rings.length; r++) {
      const [rad, h] = rings[r], ids = [];
      for (let k = 0; k <= seg; k++) {
        const a = k / seg * Math.PI * 2, cu = Math.cos(a), cd = Math.sin(a);
        const pu = u + cu * rad, pd = d + cd * rad;
        const nu = cu * 0.9, nd = cd * 0.9, ny = (r === 0 ? -0.5 : r === rings.length - 1 ? 0.5 : 0);
        ids.push(B.v(D.wx(pu, pd), D.oy + top - 0.36 + h, D.wz(pu, pd), D.tx * nu + D.nx * nd, ny, D.tz * nu + D.nz * nd,
          uvr[0] + (uvr[2] - uvr[0]) * (k / seg), uvr[1] + (uvr[3] - uvr[1]) * (h / 0.36)));
      }
      if (prev) for (let k = 0; k < seg; k++) B.quad(prev[k + 1], prev[k], ids[k], ids[k + 1]);
      prev = ids;
    }
    F.col([0.05, 0.05, 0.05], FLAG.NONRM, L.METAL);
    F.box(u - 0.008, u + 0.008, top, v, d - 0.008, d + 0.008, 1 | 2 | 4 | 8);
  }
}
function bladeSign(sp, X, rnd) {
  const F = X.F, D = X.D;
  const u = rnd() < 0.5 ? 0.6 : sp.W - 0.6;
  const v0 = sp.groundH + 0.4, v1 = Math.min(sp.topH - 1, v0 + Math.min(6, sp.floors * sp.floorH * 0.7));
  const wd = 0.9, th = 0.16;
  F.col([0.1, 0.1, 0.11], 0, L.METAL);
  F.box(u - th / 2, u + th / 2, v0, v1, 0.25, 0.25 + wd, 1 | 16 | 32);
  F.box(u - 0.04, u + 0.04, v0 + 0.3, v0 + 0.36, 0, 0.3, 63);
  F.box(u - 0.04, u + 0.04, v1 - 0.36, v1 - 0.3, 0, 0.3, 63);
  const uvr = DECAL.blade(Math.floor(rnd() * 5));
  // two faces, perpendicular to the facade (normals +u / -u)
  const B = D.b;
  for (const s of [1, -1]) {
    B.sk = 0; B.sc[0] = 255; B.sc[1] = 255; B.sc[2] = 255; B.sc[3] = 2; B.sz = sp.seed; B.sw = 0;
    const uu = u + s * (th / 2 + 0.005);
    const wx = D.tx * s, wz = D.tz * s;
    const P = (d, vv) => [D.wx(uu, d), D.oy + vv, D.wz(uu, d)];
    const pts = s > 0 ? [P(0.25 + wd, v0), P(0.25, v0), P(0.25, v1), P(0.25 + wd, v1)] : [P(0.25, v0), P(0.25 + wd, v0), P(0.25 + wd, v1), P(0.25, v1)];
    const uvs = [[uvr[0], uvr[1]], [uvr[2], uvr[1]], [uvr[2], uvr[3]], [uvr[0], uvr[3]]];
    const ids = pts.map((q, j) => B.v(q[0], q[1], q[2], wx, 0, wz, uvs[j][0], uvs[j][1]));
    B.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}
function mural(sp, X, rnd) {
  // on an exposed side wall (Mission): a painted mural decal over the lower floors
  const D = X.D;
  const side = sp.muralSide || -1;
  if (side < 0) return;
  frames(sp, D, side);
  const len = sp.depth, h = Math.min(sp.topH - 1.2, 9);
  const w = Math.min(len - 1.0, h * 1.4);
  const u0 = (len - w) / 2, v0 = Math.max(gv(sp, 0), 0) + 0.6;
  decalRect(D, u0, u0 + w, v0, v0 + Math.min(h, w * 0.8), 0.02, DECAL.mural(Math.floor(rnd() * 3)), 4);
  frames(sp, D, 0);
}

// ---------------------------------------------------------------- towers: detailed podium front (upper tiers stay procedural)
export { emitNear };
