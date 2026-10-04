// Buildings v2 rowhouse individuation. OSM often traces a whole row of San Francisco houses as one long footprint, which
// then renders as one long box (one colour, one height, one flat roof). Here every residential footprint whose street
// front is longer than ~1.6 lots is cut along that front into per-lot pieces (25 ft SF lots, jittered, some 33 / 50 ft).
// Each lot gets its own ground (it steps with the street), height (+-1 storey, tract rows in the Avenues stay even),
// and, through the normal per-building pass in v2plan.js, its own style / palette / roofline / cornice / bay rhythm.
// Deep lots also get a lower rear addition (a separate piece one storey down) and paired light wells notched into
// the lot lines. Back-to-back rows (fronts on both long sides) are first cut in two.
// Output: extended footprint arrays (parents 0..N0-1 untouched, pieces appended) + parent -> piece links. Parents stay
// valid building indices (landmark hides, colliders, find / buildingAt); the tiers draw the pieces instead of them.
import { Z, zoneAt } from './v2plan.js';

export const LOT_W = 7.62;                // 25 ft
// ?nov5 = A/B switch for the v5 massing pass (lot setbacks, bay / roof / turret / balcony variety)
// (a live binding: the build workers have no page URL, v2worker.js sets it from the plan's nov5 on init)
export let NOV5 = typeof location !== 'undefined' && /[?&]nov5\b/.test(location.search || '');
export function setNOV5(v) { NOV5 = !!v; }
// ?nov6 = A/B switch for the v6 pass (district bay / roof / window frequencies, neighbour paint, back yards, roof decks)
export let NOV6 = NOV5 || (typeof location !== 'undefined' && /[?&]nov6\b/.test(location.search || ''));
export function setNOV6(v) { NOV6 = !!v; }
const PROBE = [2.5, 5, 8, 12, 17];
function h01(i, s) { let h = Math.imul(i ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; }

// Sutherland-Hodgman against u in [a0, a1], w in [b0, b1] (local coords, flat [u, w, ...])
function clipRect(src, a0, a1, b0, b1) {
  let p = src;
  const planes = [[0, a0, 1], [0, a1, -1], [1, b0, 1], [1, b1, -1]];
  for (const [ax, c, s] of planes) {
    const out = [], n = p.length / 2;
    if (!n) return out;
    for (let k = 0; k < n; k++) {
      const kk = (k + 1) % n, pa = p[k * 2 + ax], pb = p[kk * 2 + ax];
      const ina = (pa - c) * s >= 0, inb = (pb - c) * s >= 0;
      if (ina) out.push(p[k * 2], p[k * 2 + 1]);
      if (ina !== inb) {
        const t = (c - pa) / (pb - pa), x = p[k * 2] + (p[kk * 2] - p[k * 2]) * t, z = p[k * 2 + 1] + (p[kk * 2 + 1] - p[k * 2 + 1]) * t;
        if (ax === 0) out.push(c, z); else out.push(x, c);
      }
    }
    p = out;
  }
  return p;
}
// notch a light well into the edge lying on u = uc (between w in [wa, wb]) by du (inward sign included)
function notch(p, uc, wa, wb, du) {
  const n = p.length / 2;
  for (let k = 0; k < n; k++) {
    const kk = (k + 1) % n;
    if (Math.abs(p[k * 2] - uc) > 1e-3 || Math.abs(p[kk * 2] - uc) > 1e-3) continue;
    const w0 = p[k * 2 + 1], w1 = p[kk * 2 + 1];
    const lo = Math.min(w0, w1), hi = Math.max(w0, w1);
    if (lo > wa - 0.5 || hi < wb + 0.5) continue;
    const pts = w1 > w0 ? [uc, wa, uc + du, wa, uc + du, wb, uc, wb] : [uc, wb, uc + du, wb, uc + du, wa, uc, wa];
    p.splice(kk === 0 ? p.length : kk * 2, 0, ...pts);
    return p;
  }
  return p;
}
function clean(p) {
  // drop near-duplicate and collinear points
  for (let pass = 0; pass < 2; pass++) {
    const out = [], n = p.length / 2;
    for (let k = 0; k < n; k++) {
      const a = (k + n - 1) % n, c = (k + 1) % n;
      const ax = p[a * 2], az = p[a * 2 + 1], bx = p[k * 2], bz = p[k * 2 + 1], cx = p[c * 2], cz = p[c * 2 + 1];
      if (Math.hypot(bx - ax, bz - az) < 0.08) continue;
      const cr = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
      if (Math.abs(cr) < 0.02 && (bx - ax) * (cx - bx) + (bz - az) * (cz - bz) > 0) continue;
      out.push(bx, bz);
    }
    p = out;
  }
  return p;
}
const areaOf = (p) => { let a = 0; const n = p.length / 2; for (let k = 0; k < n; k++) { const kk = (k + 1) % n; a += p[k * 2] * p[kk * 2 + 1] - p[kk * 2] * p[k * 2 + 1]; } return a / 2; };

// -> { B (extended arrays), N0, N, lotF, lotN, par, twin, nbL, nbR, ms, stats }
export function splitRows(B0, terrain) {
  const t0 = performance.now(), N0 = B0.count, X0 = B0.X0, Z0 = B0.Z0, TC = B0.TC, T = B0.tile || 512;
  const pieces = [];     // { i, pts (world flat), base, h, rear, twinK, nbL, nbR }
  const lotF = new Int32Array(N0), lotN = new Uint16Array(N0);
  const ring = [];
  const LOTZ = new Set([Z.VICTORIAN, Z.CASTRO, Z.MISSION, Z.MARINA, Z.AVENUES, Z.NORTHBEACH, Z.NOBHILL, Z.BAYVIEW, Z.INDUSTRIAL]);   // (lazy: import cycle with v2plan)
  let rows = 0, lots = 0;
  const off = typeof location !== 'undefined' && /[?&]nolots\b/.test(location.search);   // dev A/B switch
  for (let i = 0; i < N0 && !off; i++) {
    const kind = B0.kind[i], h0 = B0.h[i], n = B0.nv[i];
    if (kind > 2 || h0 < 4.5 || h0 > 14 || (kind === 2 && h0 > 12) || B0.minH[i] > 0 || B0.color[i] || n < 4 || n > 400) continue;
    const t = B0.tileOf[i], ox = X0 + (t % TC) * T, oz = Z0 + Math.floor(t / TC) * T;
    ring.length = n * 2;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0, v = B0.v0[i] * 2; k < n; k++, v += 2) {
      const x = ox + B0.verts[v] / 16, z = oz + B0.verts[v + 1] / 16; ring[k * 2] = x; ring[k * 2 + 1] = z;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (Math.max(x1 - x0, z1 - z0) < 12) continue;
    let A2 = 0, cx = 0, cz = 0;
    for (let k = 0; k < n; k++) { const kk = (k + 1) % n, ax = ring[k * 2] - x0, az = ring[k * 2 + 1] - z0, bx = ring[kk * 2] - x0, bz = ring[kk * 2 + 1] - z0, cr = ax * bz - bx * az; A2 += cr; cx += (ax + bx) * cr; cz += (az + bz) * cr; }
    const area = Math.abs(A2) / 2; if (area < 130) continue;
    const sgn = A2 < 0 ? -1 : 1;
    cx = x0 + cx / (3 * A2); cz = z0 + cz / (3 * A2);
    const zone = zoneAt(cx, cz);
    if (!LOTZ.has(zone)) continue;
    if ((zone === Z.INDUSTRIAL || zone === Z.BAYVIEW) && h0 > 11) continue;
    // oriented box
    let best = Infinity, ux = 1, uz = 0, u0 = 0, u1 = 0, w0 = 0, w1 = 0;
    const step = n > 48 ? Math.ceil(n / 48) : 1;
    for (let k = 0; k < n; k += step) {
      const kk = (k + 1) % n, ex = ring[kk * 2] - ring[k * 2], ez = ring[kk * 2 + 1] - ring[k * 2 + 1], l = Math.hypot(ex, ez);
      if (l < 0.4) continue;
      const dx = ex / l, dz = ez / l;
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (let q = 0; q < n; q++) { const px = ring[q * 2] - cx, pz = ring[q * 2 + 1] - cz, u = px * dx + pz * dz, w = -px * dz + pz * dx; if (u < a0) a0 = u; if (u > a1) a1 = u; if (w < b0) b0 = w; if (w > b1) b1 = w; }
      const a = (a1 - a0) * (b1 - b0);
      if (a < best) { best = a; ux = dx; uz = dz; u0 = a0; u1 = a1; w0 = b0; w1 = b1; }
    }
    if (best === Infinity || area / best < 0.55) continue;
    // street fronts (outward probe on the road raster), measured per OBB axis
    let fU = 0, fW = 0, sidePos = 0, sideNeg = 0, sideUPos = 0, sideUNeg = 0;
    let eu0 = 1e9, eu1 = -1e9, ew0 = 1e9, ew1 = -1e9;
    for (let k = 0; k < n; k++) {
      const kk = (k + 1) % n, ax = ring[k * 2], az = ring[k * 2 + 1], ex = ring[kk * 2] - ax, ez = ring[kk * 2 + 1] - az, l = Math.hypot(ex, ez);
      if (l < 1.5) continue;
      const nx = sgn * ez / l, nz = -sgn * ex / l, mx = ax + ex * 0.5, mz = az + ez * 0.5;
      let front = false;
      for (const d of PROBE) { const s = terrain.surfaceRaw(mx + nx * d, mz + nz * d); if (s === 1) { front = true; break; } if (s === 0) break; }
      if (!front) continue;
      const nw = -nx * uz + nz * ux, nu = nx * ux + nz * uz;      // normal along w / u
      const pa = (ax - cx) * ux + (az - cz) * uz, pb = (ax + ex - cx) * ux + (az + ez - cz) * uz;
      const qa = -(ax - cx) * uz + (az - cz) * ux, qb = -(ax + ex - cx) * uz + (az + ez - cz) * ux;
      if (Math.abs(nw) > 0.7) { fU += l; if (nw > 0) sidePos += l; else sideNeg += l; eu0 = Math.min(eu0, pa, pb); eu1 = Math.max(eu1, pa, pb); }
      else if (Math.abs(nu) > 0.7) { fW += l; if (nu > 0) sideUPos += l; else sideUNeg += l; ew0 = Math.min(ew0, qa, qb); ew1 = Math.max(ew1, qa, qb); }
    }
    // split axis: the one the longest street front runs along
    let alongU = fU >= fW, Ef = alongU ? eu1 - eu0 : ew1 - ew0;
    if (!(Ef >= 12.5)) continue;
    // local frame (a along the front, b = depth). a = u or w.
    const Ax = alongU ? ux : -uz, Az = alongU ? uz : ux;          // a axis (world)
    const Bx = alongU ? -uz : ux, Bz = alongU ? ux : uz;          // b axis (world): alongU a=u, b=w; else a=w, b=u
    const a0 = alongU ? u0 : w0, a1 = alongU ? u1 : w1;
    const b0 = alongU ? w0 : u0, b1 = alongU ? w1 : u1;
    const sP = alongU ? sidePos : sideUPos, sN = alongU ? sideNeg : sideUNeg;   // street on +b / -b
    const D = b1 - b0;
    if (D < 7) continue;
    const rowsHere = [];
    if (sP >= 8 && sN >= 8 && D >= 22) { const m = b0 + D * (0.46 + 0.08 * h01(i, 3)); rowsHere.push([m, b1, 1], [b0, m, -1]); }
    else rowsHere.push([b0, b1, sP >= sN ? 1 : -1]);
    let ok = true;
    for (const [r0, r1] of rowsHere) if (r1 - r0 > 36) ok = false;
    if (!ok) continue;
    // local poly (a, b) around the centroid
    const loc = new Array(n * 2);
    for (let k = 0; k < n; k++) { const px = ring[k * 2] - cx, pz = ring[k * 2 + 1] - cz; loc[k * 2] = px * Ax + pz * Az; loc[k * 2 + 1] = px * Bx + pz * Bz; }
    const W = (a, b) => [cx + Ax * a + Bx * b, cz + Az * a + Bz * b];
    const tract = zone === Z.AVENUES || zone === Z.MARINA;
    const lotW = LOT_W * (zone === Z.MARINA ? 1.12 : zone === Z.NOBHILL || zone === Z.NORTHBEACH ? 1.03 : 1) * (1 + 0.05 * (h01(i, 4) - 0.5));
    const first = pieces.length;
    let sd = 20;
    const r = () => h01(i, sd++);
    for (const [r0, r1, side] of rowsHere) {
      const E = a1 - a0, wts = [];
      let sum = 0;
      while (sum * lotW < E - lotW * 0.45 && wts.length < 64) { const q = r(); const w = (q < 0.07 ? 2 : q < 0.17 ? 1.33 : 1) * (1 + 0.14 * (r() - 0.5)); wts.push(w); sum += w; }
      if (wts.length < 2) { if (E < 12.5) continue; wts.length = 0; wts.push(1, 1); sum = 2; }
      const fb = side > 0 ? r1 : r0, rb = side > 0 ? r0 : r1, Dr = r1 - r0;
      // light wells on the lot lines (paired, mid-depth), rear additions per lot
      const nl = wts.length, cuts = [a0];
      for (let k = 0; k < nl; k++) cuts.push(cuts[k] + wts[k] / sum * E);
      cuts[nl] = a1;
      const wells = [];
      for (let k = 0; k < nl - 1; k++) {
        if (Dr >= 13 && r() < 0.5) { const d0 = Dr * (0.28 + 0.12 * r()), L = 2.6 + 1.8 * r(), dd = 0.55 + 0.35 * r(); wells.push([d0, Math.min(d0 + L, Dr * 0.7), dd]); }
        else wells.push(null);
      }
      // per-lot street ground and target tops
      const gs = [], tops = [];
      for (let k = 0; k < nl; k++) {
        const am = (cuts[k] + cuts[k + 1]) / 2, [fx, fz] = W(am, fb + side * 1.2);
        gs.push(terrain.heightAt(fx, fz));
      }
      const gMean = gs.reduce((s, g) => s + g, 0) / nl;
      const H = Math.max(4.5, B0.base[i] + h0 - gMean);
      for (let k = 0; k < nl; k++) {
        const q = r(), jit = (r() - 0.5) * (tract ? 0.5 : 0.9);
        let dh = 0;
        if (tract) dh = q < 0.06 && H > 7.5 ? -3 : q > 0.95 && H < 11 ? 3 : 0;
        else dh = q < 0.2 && H > 7.5 ? -3 : q > 0.76 && H < 12.5 ? 3 : 0;
        tops.push(gs[k] + H + dh + jit);
      }
      // (v5) per-lot front setbacks: the street wall steps in and out along the row (Edwardian / stucco front gardens,
      // a Victorian set back behind its stoop), so a row never reads as one flat plane; tract rows stay nearly even
      const sbP = NOV5 ? 0 : tract ? 0.22 : zone === Z.VICTORIAN || zone === Z.NOBHILL || zone === Z.NORTHBEACH ? 0.3 : 0.4;
      for (let k = 0; k < nl; k++) {
        const s0 = cuts[k], s1 = cuts[k + 1];
        const rear = Dr >= 15 && tops[k] - gs[k] >= 7 && r() < 0.6;
        const dc = rear ? Dr * (0.58 + 0.17 * r()) : Dr;
        const qs = h01(i * 64 + k, 21), sbk = qs < sbP ? Math.min(dc - 7, (tract ? 0.35 + 0.5 * h01(i * 64 + k, 22) : 0.5 + 1.6 * h01(i * 64 + k, 22))) : 0;
        const fbs = fb - side * Math.max(0, sbk);
        const fr0 = side > 0 ? fb - dc : fbs, fr1 = side > 0 ? fbs : fb + dc;   // front piece b-range
        let pf = clipRect(loc, s0, s1, Math.min(fr0, fr1), Math.max(fr0, fr1));
        // light wells: right lot line (u = s1, notch -a), left (u = s0, notch +a); depth d from the front
        const wR = k < nl - 1 ? wells[k] : null, wL = k > 0 ? wells[k - 1] : null;
        for (const [wl, uc, du] of [[wR, s1, -1], [wL, s0, 1]]) {
          if (!wl || pf.length < 6 || wl[1] > dc - 1) continue;
          const ba = fb - side * wl[0], bb = fb - side * wl[1];
          pf = notch(pf, uc, Math.min(ba, bb), Math.max(ba, bb), du * wl[2]);
        }
        pf = clean(pf);
        if (pf.length < 6 || Math.abs(areaOf(pf)) < 14) continue;
        const kf = pieces.length;
        pieces.push({ i, loc: pf, top: tops[k], rear: false, twin: -1, W, lotK: k });
        if (rear) {
          const rr0 = side > 0 ? rb : fb + dc, rr1 = side > 0 ? fb - dc : rb;
          const pr = clean(clipRect(loc, s0, s1, Math.min(rr0, rr1), Math.max(rr0, rr1)));
          if (pr.length >= 6 && Math.abs(areaOf(pr)) >= 10) pieces.push({ i, loc: pr, top: tops[k] - (tops[k] - gs[k] > 10.5 && r() < 0.35 ? 6 : 3), rear: true, twin: kf, W, lotK: k });
        }
        lots++;
      }
      rows++;
    }
    const cnt = pieces.length - first;
    if (cnt < 2) { pieces.length = first; continue; }
    lotF[i] = N0 + first; lotN[i] = cnt;
  }
  // ------------------------------------------------------------ extended arrays
  const K = pieces.length, N = N0 + K;
  let nvExtra = 0;
  for (const p of pieces) nvExtra += p.loc.length / 2;
  const ext = (a) => { const b = new a.constructor(N); b.set(a); return b; };
  const B = { ...B0, count: N };
  for (const k of ['v0', 'nv', 'base', 'h', 'minH', 'levels', 'kind', 'roof', 'slope', 'roofH', 'color', 'roofColor', 'flags', 'tileOf']) B[k] = ext(B0[k]);
  const nv0 = B0.verts.length / 2, verts = new Int16Array((nv0 + nvExtra) * 2);
  verts.set(B0.verts);
  const par = new Int32Array(N).fill(-1), twin = new Int32Array(N).fill(-1);
  let vo = nv0;
  for (let q = 0; q < K; q++) {
    const p = pieces[q], j = N0 + q, i = p.i, t = B0.tileOf[i], ox = X0 + (t % TC) * T, oz = Z0 + Math.floor(t / TC) * T;
    const m = p.loc.length / 2;
    // keep the parent's winding (clipping preserves it, but the (a, b) frame may be mirrored)
    let bmin = 1e9;
    B.v0[j] = vo; B.nv[j] = m;
    for (let k = 0; k < m; k++) {
      const [x, z] = p.W(p.loc[k * 2], p.loc[k * 2 + 1]);
      verts[(vo + k) * 2] = Math.max(-32768, Math.min(32767, Math.round((x - ox) * 16)));
      verts[(vo + k) * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round((z - oz) * 16)));
      bmin = Math.min(bmin, terrain.heightAt(x, z));
    }
    vo += m;
    const base = Math.min(bmin, p.rear ? pieces[p.twin].base ?? bmin : bmin);
    p.base = base;
    B.base[j] = base; B.h[j] = Math.max(p.rear ? 3.2 : 4.2, p.top - base); B.minH[j] = 0; B.levels[j] = 0;
    B.kind[j] = B0.kind[i]; B.roof[j] = p.rear ? 0 : B0.roof[i]; B.slope[j] = 0; B.roofH[j] = 0; B.color[j] = 0; B.roofColor[j] = 0;
    B.flags[j] = B0.flags[i]; B.tileOf[j] = t;
    par[j] = i; if (p.twin >= 0) twin[j] = N0 + p.twin;
  }
  B.verts = verts; B.ring = undefined; B.inTile = undefined;   // (v2build.wrapB rebuilds both over these arrays)
  const ms = performance.now() - t0;
  return { B, N0, N, K, lotF, lotN, par, twin, ms, stats: { rows, lots, pieces: K, parents: lotN.reduce((s, c) => s + (c > 0), 0) } };
}
