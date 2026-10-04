// Heightfield: natural terrain (map.H0) blended with the street-grid lattice (flat intersections joined by straight
// ramps = the San Francisco hill-jump profile), then special roads carved in. Also the elevated decks (bridges, the
// Bay Bridge approach, piers) and the ground query used by physics.
import {
  BOUNDS, H0, buildCoastSDF, coastSDF, XL, ZL, inExclusion, SPECIAL_ROADS, DECKS, REMOVED_STREETS, LAND, pointInPoly,
  inGGPark, inPresidio, inLandsEnd, inTwinPeaks, coastType, fbm, PARK_BLOCKS,
} from './map.js';

export const HF_RES = 4;
export const HF_W = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / HF_RES) + 1;
export const HF_H = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / HF_RES) + 1;

// surface codes
export const SURF = { WATER: 0, ASPHALT: 1, CONCRETE: 2, GRASS: 3, SAND: 4, DIRT: 5, ROCK: 6, FOREST: 7 };
export const SURF_NAMES = ['water', 'asphalt', 'concrete', 'grass', 'sand', 'dirt', 'rock', 'forest'];

// ---------------------------------------------------------------- grid lattice
// ascending coordinate arrays with half widths
const gx = XL.map(([x, n, w]) => ({ c: x, hw: w / 2 })).sort((a, b) => a.c - b.c);
const gz = ZL.map(([z, n, w]) => ({ c: z, hw: w / 2 })).sort((a, b) => a.c - b.c);
export const GRID_X = gx, GRID_Z = gz;
const NX = gx.length, NZ = gz.length;
function findCell(arr, v) { // index i with arr[i].c <= v < arr[i+1].c, or -1
  if (v < arr[0].c || v >= arr[arr.length - 1].c) return -1;
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m].c <= v) lo = m; else hi = m; }
  return lo;
}
export { findCell };

export class Terrain {
  constructor() {
    this.hf = new Float32Array(HF_W * HF_H);
    this.surf = new Uint8Array(HF_W * HF_H);
    this.gridMask = null;
    this.nodeH = new Float32Array(NX * NZ);
    this.cellActive = new Uint8Array((NX - 1) * (NZ - 1));
    this.decks = [];
    this.deckHash = new Map();
  }

  build(progress = () => {}) {
    buildCoastSDF();
    const hf = this.hf;
    // 1. natural terrain
    for (let j = 0; j < HF_H; j++) {
      const z = BOUNDS.minZ + j * HF_RES;
      for (let i = 0; i < HF_W; i++) hf[j * HF_W + i] = H0(BOUNDS.minX + i * HF_RES, z);
    }
    progress(0.35);
    // 2. lattice node heights + active cells
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) this.nodeH[j * NX + i] = H0(gx[i].c, gz[j].c);
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const cx = (gx[i].c + gx[i + 1].c) / 2, cz = (gz[j].c + gz[j + 1].c) / 2;
      const hwx = (gx[i + 1].c - gx[i].c) / 2, hwz = (gz[j + 1].c - gz[j].c) / 2;
      let ok = !inExclusion(cx, cz);
      if (ok) { // every corner (pulled 10 m in) must be on land, the centre well inland
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (coastSDF(cx + sx * (hwx - 10), cz + sz * (hwz - 10)) < 6) { ok = false; break; }
        if (ok && coastSDF(cx, cz) < 30) ok = false;
      }
      this.cellActive[j * (NX - 1) + i] = ok ? 1 : 0;
    }
    // 3. grid mask (1 inside active cells incl. their half streets), dilated + blurred so streets stay exactly on the lattice
    const mask = new Float32Array(HF_W * HF_H);
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      if (!this.cellActive[j * (NX - 1) + i]) continue;
      const x0 = gx[i].c - gx[i].hw - 2, x1 = gx[i + 1].c + gx[i + 1].hw + 2, z0 = gz[j].c - gz[j].hw - 2, z1 = gz[j + 1].c + gz[j + 1].hw + 2;
      const i0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / HF_RES)), i1 = Math.min(HF_W - 1, Math.ceil((x1 - BOUNDS.minX) / HF_RES));
      const j0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / HF_RES)), j1 = Math.min(HF_H - 1, Math.ceil((z1 - BOUNDS.minZ) / HF_RES));
      for (let jj = j0; jj <= j1; jj++) mask.fill(1, jj * HF_W + i0, jj * HF_W + i1 + 1);
    }
    const blurred = boxBlur(dilate(mask, HF_W, HF_H, 5), HF_W, HF_H, 4);
    this.gridMask = blurred;
    // 4. blend lattice. pure[k] = 1 where the height is exactly the lattice (lets heightAt evaluate the lattice
    // analytically there, so the crisp plateau/ramp kinks match the road meshes exactly)
    this.pure = new Uint8Array(HF_W * HF_H);
    for (let j = 0; j < HF_H; j++) {
      const z = BOUNDS.minZ + j * HF_RES;
      for (let i = 0; i < HF_W; i++) {
        const k = j * HF_W + i, m = blurred[k];
        if (m <= 0.001) continue;
        const g = this.latticeHeight(BOUNDS.minX + i * HF_RES, z);
        if (g === null) continue;
        hf[k] = hf[k] + (g - hf[k]) * smooth01(m);
        if (m >= 0.999) this.pure[k] = 1;
      }
    }
    progress(0.55);
    // 5. special roads carved in
    this.roadProfiles = [];
    for (const r of SPECIAL_ROADS) this.roadProfiles.push(this.carveRoad(r));
    // deck landings: flatten ground where decks start at ground level (Bay approach, pier roots)
    progress(0.7);
    // 6. decks
    for (const d of DECKS) this.addDeck(d);
    // 7. surfaces
    this.buildSurfaces();
    progress(0.8);
  }

  latticeHeight(x, z) {
    const i = findCell(gx, x), j = findCell(gz, z);
    if (i < 0 || j < 0) return null;
    const a = gx[i], b = gx[i + 1], c = gz[j], d = gz[j + 1];
    const u = clamp01((x - (a.c + a.hw + 0.5)) / ((b.c - b.hw - 0.5) - (a.c + a.hw + 0.5)));
    const v = clamp01((z - (c.c + c.hw + 0.5)) / ((d.c - d.hw - 0.5) - (c.c + c.hw + 0.5)));
    const n = this.nodeH;
    const h00 = n[j * NX + i], h10 = n[j * NX + i + 1], h01 = n[(j + 1) * NX + i], h11 = n[(j + 1) * NX + i + 1];
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }

  // ------------------------------------------------------------ carving
  carveRoad(road) {
    const hw = road.width / 2;
    // resample path every 4 m
    const P = resample(road.path, road.kind === 'crooked' ? 2 : 4);
    const n = P.length;
    if (road.kind === 'crooked') { // pin both ends to the intersection plateaus
      const a = this.latticeHeight(P[0][0], P[0][1]), b = this.latticeHeight(P[n - 1][0], P[n - 1][1]);
      if (a !== null) P[0][2] = a; if (b !== null) P[n - 1][2] = b;
    }
    const raw = new Float32Array(n);
    for (let k = 0; k < n; k++) raw[k] = this.sampleRaw(P[k][0], P[k][1]);
    // smooth
    const win = road.kind === 'crooked' ? 1 : road.kind === 'mountain' ? 4 : road.kind === 'highway' ? 10 : 6;
    let prof = movingAverage(raw, win);
    // grade clamp
    const maxG = road.kind === 'highway' ? 0.07 : road.kind === 'mountain' ? 0.2 : road.kind === 'crooked' ? 0.35 : 0.14;
    prof = gradeClamp(prof, P, maxG);
    // anchors: explicit y on path points (propagated by catmull as the 3rd coordinate)
    const anchors = [];
    for (let k = 0; k < n; k++) if (P[k].length > 2 && P[k][2] != null && Number.isFinite(P[k][2])) anchors.push(k);
    if (anchors.length) {
      const corr = new Float32Array(n);
      for (let a = 0; a < anchors.length; a++) corr[anchors[a]] = P[anchors[a]][2] - prof[anchors[a]];
      // interpolate corrections between anchors, fade to 0 over 150 m outside
      let prev = -1;
      for (let k = 0; k < n; k++) {
        if (corr[k] !== 0 || anchors.includes(k)) { prev = k; continue; }
        const next = anchors.find(a => a > k);
        if (prev >= 0 && next !== undefined) { const t = (k - prev) / (next - prev); corr[k] = corr[prev] * (1 - t) + corr[next] * t; }
        else if (prev >= 0) corr[k] = corr[prev] * Math.max(0, 1 - (k - prev) * 4 / 150);
        else if (next !== undefined) corr[k] = corr[next] * Math.max(0, 1 - (next - k) * 4 / 150);
      }
      for (let k = 0; k < n; k++) prof[k] += corr[k];
    }
    // rasterise: nearest distance per heightfield sample
    const hf = this.hf, bank = road.kind === 'crooked' ? 2 : 26, reach = hw + 1.5 + bank;
    const best = new Map(); // sample index -> [dist, target]
    for (let k = 0; k < n - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const x0 = Math.min(ax, bx) - reach, x1 = Math.max(ax, bx) + reach, z0 = Math.min(az, bz) - reach, z1 = Math.max(az, bz) + reach;
      const i0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / HF_RES)), i1 = Math.min(HF_W - 1, Math.ceil((x1 - BOUNDS.minX) / HF_RES));
      const j0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / HF_RES)), j1 = Math.min(HF_H - 1, Math.ceil((z1 - BOUNDS.minZ) / HF_RES));
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      for (let j = j0; j <= j1; j++) {
        const z = BOUNDS.minZ + j * HF_RES;
        for (let i = i0; i <= i1; i++) {
          const x = BOUNDS.minX + i * HF_RES;
          let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - (ax + ex * t), dz = z - (az + ez * t), d = Math.sqrt(dx * dx + dz * dz);
          if (d > reach) continue;
          const idx = j * HF_W + i, cur = best.get(idx);
          if (!cur || d < cur[0]) best.set(idx, [d, prof[k] + (prof[k + 1] - prof[k]) * t]);
        }
      }
    }
    for (const [idx, [d, target]] of best) {
      const old = hf[idx];
      const bw = Math.min(bank, Math.max(Math.min(4, bank), Math.abs(old - target) * 1.7));
      const w = d <= hw + 1.5 ? 1 : 1 - smooth01((d - hw - 1.5) / bw);
      if (w > 0.001) { hf[idx] = old + (target - old) * w; this.pure[idx] = 0; }
    }
    return { road, P, prof };
  }

  sampleRaw(x, z) { return bilinear(this.hf, x, z); }

  // ------------------------------------------------------------ decks
  addDeck(d) {
    const pts = d.pts.map(p => [p[0], p[1], p[2] == null ? this.sampleRaw(p[0], p[1]) : p[2]]);
    const deck = { ...d, pts, hw: d.width / 2 + (d.sidewalk || 0), roadHw: d.width / 2, segs: [] };
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az, ay] = pts[k], [bx, bz, by] = pts[k + 1];
      const seg = { deck, k, ax, az, ay, bx, bz, by, ex: bx - ax, ez: bz - az, l2: (bx - ax) ** 2 + (bz - az) ** 2, len: Math.hypot(bx - ax, bz - az) };
      deck.segs.push(seg);
      const r = deck.hw + 2;
      const cx0 = Math.floor((Math.min(ax, bx) - r) / 32), cx1 = Math.floor((Math.max(ax, bx) + r) / 32);
      const cz0 = Math.floor((Math.min(az, bz) - r) / 32), cz1 = Math.floor((Math.max(az, bz) + r) / 32);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const key = cx * 100003 + cz; let arr = this.deckHash.get(key);
        if (!arr) this.deckHash.set(key, arr = []);
        arr.push(seg);
      }
    }
    this.decks.push(deck);
    return deck;
  }

  // highest deck surface at (x, z) that is <= yMax. returns {y, deck, seg, t} or null
  deckAt(x, z, yMax = Infinity) {
    const arr = this.deckHash.get(Math.floor(x / 32) * 100003 + Math.floor(z / 32));
    if (!arr) return null;
    let best = null;
    for (const s of arr) {
      let t = ((x - s.ax) * s.ex + (z - s.az) * s.ez) / s.l2;
      if (t < -0.02 || t > 1.02) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (s.ax + s.ex * t), dz = z - (s.az + s.ez * t);
      if (dx * dx + dz * dz > s.deck.hw * s.deck.hw) continue;
      const y = s.ay + (s.by - s.ay) * t;
      if (y <= yMax && (!best || y > best.y)) best = { y, deck: s.deck, seg: s, t };
    }
    return best;
  }

  // ------------------------------------------------------------ sidewalks / curbs (block polygons are raised 0.15 m)
  setBlocks(blocks) {
    this.blockHash = new Map();
    for (const b of blocks) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of b.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let cz = Math.floor(z0 / 48); cz <= Math.floor(z1 / 48); cz++) for (let cx = Math.floor(x0 / 48); cx <= Math.floor(x1 / 48); cx++) {
        const k = cx * 100003 + cz; let a = this.blockHash.get(k); if (!a) this.blockHash.set(k, a = []); a.push(b.poly);
      }
    }
  }
  curbAt(x, z) {
    const a = this.blockHash?.get(Math.floor(x / 48) * 100003 + Math.floor(z / 48));
    if (!a) return 0;
    for (const poly of a) {
      let sign = 0, inside = true;
      for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n];
        const cr = (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
        const sg = cr > 0 ? 1 : cr < 0 ? -1 : 0;
        if (sg === 0) continue;
        if (sign === 0) sign = sg; else if (sg !== sign) { inside = false; break; }
      }
      if (inside && sign !== 0) return 0.15;
    }
    return 0;
  }

  // ------------------------------------------------------------ queries
  heightAt(x, z) {
    const fx = (x - BOUNDS.minX) / HF_RES, fz = (z - BOUNDS.minZ) / HF_RES;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i >= 0 && j >= 0 && i < HF_W - 1 && j < HF_H - 1) {
      const k = j * HF_W + i, p = this.pure;
      if (p[k] && p[k + 1] && p[k + HF_W] && p[k + HF_W + 1]) { const g = this.latticeHeight(x, z); if (g !== null) return g; }
    }
    return bilinear(this.hf, x, z);
  }

  // ground under a probe: max(terrain, deck <= probeY + 0.6). returns y and writes the normal into out (optional)
  groundAt(x, z, probeY = Infinity, out = null) {
    const th = this.heightAt(x, z) + this.curbAt(x, z);
    const dk = this.deckAt(x, z, probeY + 0.6);
    if (dk && dk.y > th) {
      if (out) {
        const s = dk.seg, gy = (s.by - s.ay) / (s.len || 1);
        // deck normal: along-axis slope only
        const tx = s.ex / (s.len || 1), tz = s.ez / (s.len || 1);
        out.x = -tx * gy; out.y = 1; out.z = -tz * gy;
        const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
        out.surface = dk.deck.kind === 'pier' ? SURF.CONCRETE : SURF.ASPHALT;
        out.deck = dk.deck;
      }
      return dk.y;
    }
    if (out) {
      const e = 0.6;
      const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
      const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
      out.x = -hx / (2 * e); out.y = 1; out.z = -hz / (2 * e);
      const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
      out.surface = this.surfaceAt(x, z);
      out.deck = null;
    }
    return th;
  }

  surfaceAt(x, z) {
    const i = Math.round((x - BOUNDS.minX) / HF_RES), j = Math.round((z - BOUNDS.minZ) / HF_RES);
    if (i < 0 || j < 0 || i >= HF_W || j >= HF_H) return SURF.WATER;
    return this.surf[j * HF_W + i];
  }
  isGrid(x, z) { const i = Math.round((x - BOUNDS.minX) / HF_RES), j = Math.round((z - BOUNDS.minZ) / HF_RES); return this.gridMask[j * HF_W + i] > 0.5; }
  cellIsActive(i, j) { return i >= 0 && j >= 0 && i < NX - 1 && j < NZ - 1 && this.cellActive[j * (NX - 1) + i] === 1; }

  // ------------------------------------------------------------ surfaces (4 m raster)
  buildSurfaces() {
    const S = this.surf, hf = this.hf;
    for (let j = 0; j < HF_H; j++) {
      const z = BOUNDS.minZ + j * HF_RES;
      for (let i = 0; i < HF_W; i++) {
        const x = BOUNDS.minX + i * HF_RES, k = j * HF_W + i, h = hf[k];
        const sd = coastSDF(x, z);
        let s;
        if (sd < 0 && h < 0.2) s = SURF.WATER;
        else {
          const ct = coastType(x, z);
          if (ct.W > 40 && sd < ct.W * 0.85) s = SURF.SAND;
          else if (this.gridMask[k] > 0.5) s = SURF.CONCRETE;
          else if (inGGPark(x, z)) s = SURF.GRASS;
          else if (inPresidio(x, z) || inTwinPeaks(x, z) || z < -2100) s = fbm(x * 0.01, z * 0.01, 2) > -0.05 ? SURF.FOREST : SURF.GRASS;
          else if (inLandsEnd(x, z)) s = fbm(x * 0.012, z * 0.012, 2) > 0.1 ? SURF.FOREST : SURF.GRASS;
          else if (x > 2700 && z > -1850) s = SURF.FOREST;
          else s = h > 3.2 ? SURF.GRASS : SURF.CONCRETE;
          // steep = rock
          const e = HF_RES;
          if (i > 0 && j > 0 && i < HF_W - 1 && j < HF_H - 1 && s !== SURF.CONCRETE) {
            const gxv = (hf[k + 1] - hf[k - 1]) / (2 * e), gzv = (hf[k + HF_W] - hf[k - HF_W]) / (2 * e);
            if (gxv * gxv + gzv * gzv > 0.85) s = SURF.ROCK;
          }
        }
        S[k] = s;
      }
    }
    // park blocks
    for (const [x0, z0, x1, z1] of PARK_BLOCKS) this.fillSurf(x0, z0, x1, z1, SURF.GRASS);
  }
  fillSurf(x0, z0, x1, z1, s) {
    const i0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / HF_RES)), i1 = Math.min(HF_W - 1, Math.ceil((x1 - BOUNDS.minX) / HF_RES));
    const j0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / HF_RES)), j1 = Math.min(HF_H - 1, Math.ceil((z1 - BOUNDS.minZ) / HF_RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.surf[j * HF_W + i] = s;
  }
  // mark a polyline corridor as a surface (roads -> asphalt)
  paintCorridor(P, hw, s) {
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const x0 = Math.min(ax, bx) - hw, x1 = Math.max(ax, bx) + hw, z0 = Math.min(az, bz) - hw, z1 = Math.max(az, bz) + hw;
      const i0 = Math.max(0, Math.floor((x0 - BOUNDS.minX) / HF_RES)), i1 = Math.min(HF_W - 1, Math.ceil((x1 - BOUNDS.minX) / HF_RES));
      const j0 = Math.max(0, Math.floor((z0 - BOUNDS.minZ) / HF_RES)), j1 = Math.min(HF_H - 1, Math.ceil((z1 - BOUNDS.minZ) / HF_RES));
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = BOUNDS.minX + i * HF_RES, z = BOUNDS.minZ + j * HF_RES;
        let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ax + ex * t), dz = z - (az + ez * t);
        if (dx * dx + dz * dz <= hw * hw) this.surf[j * HF_W + i] = s;
      }
    }
  }
}

// ---------------------------------------------------------------- helpers
export function bilinear(g, x, z) {
  const fx = (x - BOUNDS.minX) / HF_RES, fz = (z - BOUNDS.minZ) / HF_RES;
  let i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0) i = 0; else if (i > HF_W - 2) i = HF_W - 2;
  if (j < 0) j = 0; else if (j > HF_H - 2) j = HF_H - 2;
  let tx = fx - i, tz = fz - j;
  tx = tx < 0 ? 0 : tx > 1 ? 1 : tx; tz = tz < 0 ? 0 : tz > 1 ? 1 : tz;
  const k = j * HF_W + i;
  return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - tz) + (g[k + HF_W] * (1 - tx) + g[k + HF_W + 1] * tx) * tz;
}
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
function dilate(src, W, H, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let m = 0; for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < W) { const v = src[j * W + ii]; if (v > m) m = v; } }
    tmp[j * W + i] = m;
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let m = 0; for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < H) { const v = tmp[jj * W + i]; if (v > m) m = v; } }
    out[j * W + i] = m;
  }
  return out;
}
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let j = 0; j < H; j++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[j * W + Math.min(W - 1, Math.max(0, k))];
    for (let i = 0; i < W; i++) {
      tmp[j * W + i] = acc / n;
      acc += src[j * W + Math.min(W - 1, i + r + 1)] - src[j * W + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < W; i++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + i];
    for (let j = 0; j < H; j++) {
      out[j * W + i] = acc / n;
      acc += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i];
    }
  }
  return out;
}
export function resample(path, step) {
  const out = [path[0].slice()];
  let carry = 0;
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s < len) {
      const t = s / len;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (a.length > 2 && b.length > 2 && a[2] != null && b[2] != null) p.push(a[2] + (b[2] - a[2]) * t);
      out.push(p);
      s += step;
    }
    carry = len - (s - step);
    if (carry >= step) carry = 0;
  }
  const last = path[path.length - 1];
  const lp = out[out.length - 1];
  if (Math.hypot(last[0] - lp[0], last[1] - lp[1]) > 0.5) out.push(last.slice()); else out[out.length - 1] = last.slice();
  return out;
}
function movingAverage(a, r) {
  const n = a.length, out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0, c = 0;
    for (let q = Math.max(0, k - r); q <= Math.min(n - 1, k + r); q++) { s += a[q]; c++; }
    out[k] = s / c;
  }
  return out;
}
function gradeClamp(p, P, g) {
  const n = p.length, out = Float32Array.from(p);
  for (let it = 0; it < 2; it++) {
    for (let k = 1; k < n; k++) { const ds = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); const lim = g * ds; if (out[k] - out[k - 1] > lim) out[k] = out[k - 1] + lim; else if (out[k - 1] - out[k] > lim) out[k] = out[k - 1] - lim; }
    for (let k = n - 2; k >= 0; k--) { const ds = Math.hypot(P[k][0] - P[k + 1][0], P[k][1] - P[k + 1][1]); const lim = g * ds; if (out[k] - out[k + 1] > lim) out[k] = out[k + 1] + lim; else if (out[k + 1] - out[k] > lim) out[k] = out[k + 1] - lim; }
  }
  // blend back toward the smoothed profile: the clamp is a guide, not law (keeps roads close to terrain)
  for (let k = 0; k < n; k++) out[k] = out[k] * 0.7 + p[k] * 0.3;
  return out;
}
