// Static world meshes: terrain, water, road surfaces, lane markings, sidewalks / blocks, decks (bridge road surfaces,
// rails, the Bay Bridge approach viaduct, piers). All merged per 400 m tile.
import * as THREE from 'three';
import { GeoBuilder, polyCentroid, mulberry32, hash01 } from './geo.js';
import { worldTextures } from './textures.js';
import { PBR } from './assets.js';
import { makeTerrainMaterial, makeRoadMaterial, makeSidewalkMaterial } from '../render/terrainmat.js';
import { BOUNDS, REMOVED_STREETS, XL, ZL, fbm } from './map.js';
import { HF_RES, HF_W, HF_H, SURF, GRID_X, GRID_Z, bilinear } from './terrain.js';
import { resample } from './terrain.js';
import { TILE } from './buildings.js';
import { SIDEWALK } from './blocks.js';

const tileKey = (x, z) => Math.floor((x - BOUNDS.minX) / TILE) * 1000 + Math.floor((z - BOUNDS.minZ) / TILE);
class Tiled {
  constructor(opts) { this.opts = opts; this.m = new Map(); }
  at(x, z) { const k = tileKey(x, z); let g = this.m.get(k); if (!g) this.m.set(k, g = new GeoBuilder(this.opts)); return g; }
  meshes(material, { cast = false, receive = true, name = '' } = {}) {
    const out = [];
    for (const [, g] of this.m) { if (g.empty) continue; const m = new THREE.Mesh(g.toGeometry(), material); m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.name = name; out.push(m); }
    return out;
  }
}
const gxHw = new Map(GRID_X.map(g => [g.c, g.hw])), gzHw = new Map(GRID_Z.map(g => [g.c, g.hw]));

export function buildCityMeshes({ terrain, graph, blocks, night }) {
  const T = worldTextures();
  const group = new THREE.Group(); group.name = 'city';
  const colliders = [];
  const H = (x, z) => terrain.heightAt(x, z);

  // ================================================================= roads
  const road = new Tiled({ uv: true, color: true });
  const mark = new Tiled({ uv: false, color: true });
  const WHITE = [0.82, 0.82, 0.79], YELLOW = [0.86, 0.64, 0.2], RAIL = [0.05, 0.048, 0.045];   // aged paint, not fresh
  const ribbon = (g, pts, hwL, hwR, yOf, lift, uvScale = PBR.TILE.asphalt) => {
    // pts: [[x,z],...]; left/right half widths; yOf(x,z,k,side)
    const n = pts.length;
    let prev = -1;
    for (let k = 0; k < n; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const rx = -dz, rz = dx; // right of travel
      const [x, z] = pts[k];
      const G_ = Math.min(0.8, hwL * 0.12); // gutter strip width
      const cols = [0.62, 1, 1, 0.62];
      const offs = [-hwL, -hwL + G_, hwR - G_, hwR];
      const base = g.n;
      const c0 = g.c.slice();
      for (let q = 0; q < 4; q++) {
        const o = offs[q], px = x + rx * o, pz = z + rz * o;
        g.setColor(c0[0] * cols[q], c0[1] * cols[q], c0[2] * cols[q]);
        g.v(px, yOf(px, pz, k, q < 2 ? -1 : 1) + lift, pz, 0, 1, 0, px / uvScale, pz / uvScale);
      }
      g.setColor(c0[0], c0[1], c0[2]);
      if (prev >= 0) for (let q = 0; q < 3; q++) g.quad(prev + q, prev + q + 1, base + q + 1, base + q);
      prev = base;
    }
  };
  const fixNormals = g => g; // normals are recomputed per tile below
  const edgeTint = (e) => { const r = hash01(e.id, 7, 3); return 0.86 + r * 0.22; };

  const markLine = (pts, off, w, color, yOf, dashed = 0, gap = 0, trim0 = 0, trim1 = 0, lift = 0.06) => {
    // a line parallel to the polyline at lateral offset `off`, width w; optional dash pattern; trims at the ends
    const P = resample(pts, 1.5);
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const L = cum[cum.length - 1];
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const g = mark.at(run[0][0], run[0][1]);
        g.setColor(...color);
        let prev = -1;
        for (const [x, z, dx, dz] of run) {
          const rx = -dz, rz = dx;
          const cx = x + rx * off, cz = z + rz * off;
          const ax = cx - rx * w / 2, az = cz - rz * w / 2, bx = cx + rx * w / 2, bz = cz + rz * w / 2;
          const i0 = g.v(ax, yOf(ax, az) + lift, az, 0, 1, 0), i1 = g.v(bx, yOf(bx, bz) + lift, bz, 0, 1, 0);
          if (prev >= 0) g.quad(prev, prev + 1, i1, i0);
          prev = i0;
        }
      }
      run = [];
    };
    for (let k = 0; k < P.length; k++) {
      const s = cum[k];
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let on = s >= trim0 && s <= L - trim1;
      if (on && dashed) on = (s - trim0) % (dashed + gap) < dashed;
      if (on) run.push([P[k][0], P[k][1], dx, dz]); else flush();
    }
    flush();
  };

  const CABLE_X = new Set([1350, 1050]), CABLE_Z = new Set([-300]);
  for (const e of graph.edges) {
    const tint = edgeTint(e);
    const isDeck = !!e.deck;
    const yOf = isDeck ? deckYOf(e) : (x, z) => H(x, z);
    let pts = e.pts, trimA = 0, trimB = 0;
    const g = road.at((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2);
    const brick = e.kind === 'crooked';
    g.setColor(brick ? 0.62 * tint : tint, brick ? 0.36 * tint : tint, brick ? 0.3 * tint : tint);
    if (e.grid) {
      const ns = Math.abs(e.pts[0][0] - e.pts[e.pts.length - 1][0]) < 0.01;
      const crossHw = n => n.grid ? (ns ? gzHw.get(n.z) : gxHw.get(n.x)) ?? 0 : 0;
      trimA = crossHw(e.a); trimB = crossHw(e.b);
      const [ax, az] = e.pts[0], [bx, bz] = e.pts[e.pts.length - 1];
      const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      const ss = [trimA];
      if (trimA > 0) ss.push(trimA + 0.5);
      for (let s = trimA + 3; s < L - trimB - 0.5; s += 3) ss.push(s);
      if (trimB > 0) ss.push(L - trimB - 0.5);
      ss.push(L - trimB);
      pts = ss.filter((s, i) => i === 0 || s > ss[i - 1] + 0.05).map(s => [ax + dx * s, az + dz * s]);
      ribbon(g, pts, e.width / 2, e.width / 2, yOf, 0.03);
    } else {
      pts = resample(e.pts, 3);
      ribbon(g, pts, e.width / 2, e.width / 2, yOf, isDeck ? 0.03 : 0.05);
    }
    // ---- markings
    const nodeTrim = n => (n.deg >= 3 || n.grid) ? n.radius + 1.2 : 0;
    const t0 = e.grid ? trimA + 1.2 : nodeTrim(e.a), t1 = e.grid ? trimB + 1.2 : nodeTrim(e.b);
    const lift = isDeck ? 0.05 : e.grid ? 0.05 : 0.07;
    if (e.kind !== 'crooked' && e.len > t0 + t1 + 4) {
      const hw = e.width / 2;
      if (e.kind === 'bridge' || e.kind === 'highway') {
        markLine(e.pts, 0.2, 0.14, YELLOW, yOf, 0, 0, t0, t1, lift); markLine(e.pts, -0.2, 0.14, YELLOW, yOf, 0, 0, t0, t1, lift);
        for (let l = 1; l < e.lanes; l++) for (const sd of [-1, 1]) markLine(e.pts, sd * (e.median + l * e.laneW), 0.14, WHITE, yOf, 3, 6, t0, t1, lift);
        for (const sd of [-1, 1]) markLine(e.pts, sd * (hw - 0.5), 0.15, WHITE, yOf, 0, 0, t0, t1, lift);
      } else {
        if (e.median > 1) { for (const sd of [-1, 1]) markLine(e.pts, sd * e.median, 0.13, YELLOW, yOf, 0, 0, t0, t1, lift); }
        else { markLine(e.pts, 0.14, 0.1, YELLOW, yOf, 0, 0, t0, t1, lift); markLine(e.pts, -0.14, 0.1, YELLOW, yOf, 0, 0, t0, t1, lift); }
        for (let l = 1; l < e.lanes; l++) for (const sd of [-1, 1]) markLine(e.pts, sd * (e.median + l * e.laneW), 0.12, WHITE, yOf, 3, 5, t0, t1, lift);
      }
      // cable car / streetcar rails
      const isCable = e.grid && ((Math.abs(e.pts[0][0] - e.pts[e.pts.length - 1][0]) < 0.01 && CABLE_X.has(e.pts[0][0]) && e.a.z < 200 && e.a.z > -1200)
        || (Math.abs(e.pts[0][1] - e.pts[e.pts.length - 1][1]) < 0.01 && CABLE_Z.has(e.pts[0][1]) && e.a.x > 700));
      const isStreetcar = e.name === 'Market St' && e.width > 20 || e.name === 'The Embarcadero';
      if (isCable || isStreetcar) {
        const lo = isStreetcar && e.name === 'The Embarcadero' ? 0 : e.median + e.laneW * 0.5;
        const offs = lo === 0 ? [-1.9, 1.9] : [-lo, lo];
        for (const o of offs) for (const r of [-0.55, 0.55]) markLine(e.pts, o + r, 0.06, RAIL, yOf, 0, 0, Math.max(0, t0 - 6), Math.max(0, t1 - 6), lift - 0.005);
        if (isCable) for (const o of offs) markLine(e.pts, o, 0.05, [0.1, 0.1, 0.1], yOf, 0, 0, Math.max(0, t0 - 6), Math.max(0, t1 - 6), lift - 0.004);
      }
    }
    // stop lines + crosswalks at grid intersections
    if (e.grid) {
      for (const [node, fromA] of [[e.a, true], [e.b, false]]) {
        if (!node.grid || node.deg < 3) continue;
        const tr = fromA ? trimA : trimB;
        const [px, pz] = fromA ? e.pts[0] : e.pts[e.pts.length - 1];
        const [qx, qz] = fromA ? e.pts[e.pts.length - 1] : e.pts[0];
        const L = Math.hypot(qx - px, qz - pz), dx = (qx - px) / L, dz = (qz - pz) / L, rx = -dz, rz = dx;
        const hw = e.width / 2;
        const zebra = node.signal || ['downtown', 'downtown_soma', 'chinatown', 'tenderloin', 'soma'].includes(zoneOf(node));
        const cw0 = tr + 0.6, cw1 = tr + 3.4;
        const gq = mark.at(px, pz); gq.setColor(...WHITE);
        const quadAt = (s0, s1, l0, l1) => {
          const P = [[s0, l0], [s1, l0], [s1, l1], [s0, l1]].map(([s, l]) => { const x = px + dx * s + rx * l, z = pz + dz * s + rz * l; return [x, yOf(x, z) + lift, z]; });
          gq.quadP(P[0], P[3], P[2], P[1]);
        };
        if (zebra) { for (let l = -hw + 0.6; l < hw - 0.6; l += 1.2) quadAt(cw0, cw1, l, l + 0.6); }
        else { quadAt(cw0, cw0 + 0.3, -hw + 0.3, hw - 0.3); quadAt(cw1 - 0.3, cw1, -hw + 0.3, hw - 0.3); }
        // stop line on the approach (right side: travelling toward the node the right side is -r here)
        quadAt(cw1 + 0.4, cw1 + 0.9, -(hw - 0.4), -0.3);
      }
    }
  }
  // intersection squares for lattice nodes
  for (const n of graph.nodes) {
    if (!n.grid) continue;
    const hx = gxHw.get(n.x) ?? 6, hz = gzHw.get(n.z) ?? 6;
    const g = road.at(n.x, n.z);
    const t = 0.9 + hash01(n.id, 3, 1) * 0.15; g.setColor(t, t, t);
    const N = 3, base = g.n;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = n.x - hx + (2 * hx * i) / N, z = n.z - hz + (2 * hz * j) / N;
      g.v(x, H(x, z) + 0.03, z, 0, 1, 0, x / PBR.TILE.asphalt, z / PBR.TILE.asphalt);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i; g.quad(a, a + N + 1, a + N + 2, a + 1); }
  }
  // Lombard crooked block garden fill
  {
    const g = road.at(1100, -940); g.setColor(0.26, 0.42, 0.18);
    const pts = []; for (let x = 1056; x <= 1144; x += 2) pts.push([x, -940]);
    ribbon(g, pts, 9, 9, (x, z) => H(x, z), 0.01, 3);
  }

  // ================================================================= decks: slab, rails, pillars; piers
  const deckMat = new Tiled({ uv: false, color: true });
  for (const d of terrain.decks) {
    const pts = d.pts;
    const isPier = d.kind === 'pier', isGG = d.kind === 'goldengate', isBay = d.kind === 'baybridge';
    const P = resample(pts.map(p => [p[0], p[1], p[2]]), isPier ? 6 : 4);
    const hwRoad = d.width / 2, hwAll = d.hw;
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az, ay] = P[k], [bx, bz, by] = P[k + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / L, dz = (bz - az) / L, rx = -dz, rz = dx;
      const g = deckMat.at(ax, az);
      const approach = isBay && k < 50 && distAlong(P, k) < 610;
      const slab = isPier || approach;
      // pier / approach surface (the bridge road surfaces come from the road graph edges; piers aren't roads)
      if (isPier) {
        g.setColor(0.52, 0.5, 0.47);
        g.quadP([ax - rx * hwAll, ay + 0.02, az - rz * hwAll], [ax + rx * hwAll, ay + 0.02, az + rz * hwAll], [bx + rx * hwAll, by + 0.02, bz + rz * hwAll], [bx - rx * hwAll, by + 0.02, bz - rz * hwAll]);
      }
      if (slab) {
        const th = isPier ? 1.3 : 1.8;
        g.setColor(0.46, 0.45, 0.43);
        for (const sd of [-1, 1]) {
          const ex = sd * (hwAll + 0.3);
          const A = [ax + rx * ex, ay + 0.05, az + rz * ex], B = [bx + rx * ex, by + 0.05, bz + rz * ex];
          const A2 = [A[0], ay - th, A[2]], B2 = [B[0], by - th, B[2]];
          if (sd > 0) g.quadP(A2, B2, B, A); else g.quadP(B2, A2, A, B);
        }
        const lA = [ax - rx * (hwAll + 0.3), ay - th, az - rz * (hwAll + 0.3)], rA = [ax + rx * (hwAll + 0.3), ay - th, az + rz * (hwAll + 0.3)];
        const lB = [bx - rx * (hwAll + 0.3), by - th, bz - rz * (hwAll + 0.3)], rB = [bx + rx * (hwAll + 0.3), by - th, bz + rz * (hwAll + 0.3)];
        g.quadP(lA, lB, rB, rA); // underside (faces down)
      }
      // rails (road edge barriers) for bridges
      if (d.rails) {
        for (const sd of [-1, 1]) {
          const off = sd * (hwRoad + 0.35);
          const A = [ax + rx * off, ay, az + rz * off], B = [bx + rx * off, by, bz + rz * off];
          g.setColor(isGG ? 0.7 : 0.62, isGG ? 0.66 : 0.62, isGG ? 0.6 : 0.6);
          railBox(g, A, B, 0.3, 0.85);
          if (k % 1 === 0) colliders.push(segCollider(A, B, 0.3, ay - 1.2, ay + 1.1, 'rail'));
          if (d.sidewalk) {
            // sidewalk slab + outer railing
            const o2 = sd * (hwAll + 0.1);
            const C = [ax + rx * o2, ay, az + rz * o2], D = [bx + rx * o2, by, bz + rz * o2];
            g.setColor(0.6, 0.58, 0.55);
            const s0 = sd * (hwRoad + 0.5), s1 = sd * hwAll;
            const q = [[ax + rx * s0, ay + 0.2, az + rz * s0], [bx + rx * s0, by + 0.2, bz + rz * s0], [bx + rx * s1, by + 0.2, bz + rz * s1], [ax + rx * s1, ay + 0.2, az + rz * s1]];
            if (sd > 0) g.quadP(q[0], q[3], q[2], q[1]); else g.quadP(q[0], q[1], q[2], q[3]);
            g.setColor(isGG ? 0.62 : 0.5, isGG ? 0.2 : 0.5, isGG ? 0.14 : 0.5);
            railBox(g, C, D, 0.12, 1.25);
            colliders.push(segCollider(C, D, 0.25, ay - 1.2, ay + 1.4, 'rail'));
          }
        }
      }
      // pillars
      const step = isPier ? 18 : 36;
      if ((slab) && Math.floor(distAlong(P, k) / step) !== Math.floor(distAlong(P, k + 1) / step)) {
        const gy = terrain.heightAt(ax, az);
        const bottom = Math.min(gy, 0) - 3, top = ay - (isPier ? 1.2 : 1.7);
        if (top - bottom > 1.5) {
          g.setColor(0.5, 0.49, 0.47);
          const offs = isPier ? [-hwAll + 3, -hwAll / 3, hwAll / 3, hwAll - 3] : [-hwAll * 0.55, hwAll * 0.55];
          for (const o of offs) {
            const px = ax + rx * o, pz = az + rz * o, r = isPier ? 0.45 : 1.1;
            g.box(px, (top + bottom) / 2, pz, r, (top - bottom) / 2, r, Math.atan2(dx, dz), 0b001111);
            if (!isPier) colliders.push({ x: px, z: pz, hx: r, hz: r, yaw: 0, yMin: bottom, yMax: top, kind: 'pillar' });
          }
        }
      }
    }
  }
  function distAlong(P, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; }

  // ================================================================= sidewalks / blocks
  const walk = new Tiled({ uv: true, color: true });
  const lotG = new Tiled({ uv: true, color: true });
  const lotP = new Tiled({ uv: true, color: true });
  for (const b of blocks) {
    const g = walk.at(b.cx, b.cz);
    const outer = b.poly, inner = b.inner;
    const nE = outer.length;
    // sample each edge; inner has the same vertex count if valid
    const OUT = [], IN = [];
    for (let e = 0; e < nE; e++) {
      const a = outer[e], c = outer[(e + 1) % nE];
      const ia = inner ? inner[e] : null, ic = inner ? inner[(e + 1) % nE] : null;
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        OUT.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
        if (ia) IN.push([ia[0] + (ic[0] - ia[0]) * t, ia[1] + (ic[1] - ia[1]) * t]);
      }
    }
    const M = OUT.length;
    const lift = 0.15;
    const sideTint = 0.92 + hash01(b.i, b.j, 5) * 0.08;
    g.setColor(sideTint, sideTint, sideTint);
    const orient = signedArea(outer) > 0 ? 1 : -1; // winding in XZ
    const top = [], bot = [], inn = [];
    for (let k = 0; k < M; k++) {
      const [x, z] = OUT[k];
      const y = H(x, z);
      top.push(g.v(x, y + lift, z, 0, 1, 0, x / PBR.TILE.concrete, z / PBR.TILE.concrete));
      if (IN.length) { const [ix, iz] = IN[k]; inn.push(g.v(ix, H(ix, iz) + lift, iz, 0, 1, 0, ix / PBR.TILE.concrete, iz / PBR.TILE.concrete)); }
    }
    if (IN.length) {
      for (let k = 0; k < M; k++) {
        const k2 = (k + 1) % M;
        if (orient > 0) g.quad(top[k], inn[k], inn[k2], top[k2]); else g.quad(top[k], top[k2], inn[k2], inn[k]);
      }
    }
    // curb faces (outward)
    g.setColor(0.72, 0.7, 0.66);
    for (let k = 0; k < M; k++) {
      const [x0, z0] = OUT[k], [x1, z1] = OUT[(k + 1) % M];
      const y0 = H(x0, z0), y1 = H(x1, z1);
      // quadP(P0,P1,P2,P3) faces (z1-z0, -(x1-x0)); flip if that points into the block
      const nx = z1 - z0, nz = -(x1 - x0);
      const P0 = [x0, y0 + lift, z0], P1 = [x1, y1 + lift, z1], P2 = [x1, y1 - 0.12, z1], P3 = [x0, y0 - 0.12, z0];
      if ((b.cx - x0) * nx + (b.cz - z0) * nz > 0) g.quadP(P1, P0, P3, P2); else g.quadP(P0, P1, P2, P3);
    }
    // interior (lots / backyard / park)
    if (IN.length) {
      const park = !!b.park;
      const paved = !park && ['downtown', 'downtown_soma', 'soma', 'industrial', 'tenderloin', 'chinatown', 'wharf'].includes(b.zone);
      const gl = (paved ? lotP : lotG).at(b.cx, b.cz);
      const [ccx, ccz] = polyCentroid(inner);
      const tk = paved ? PBR.TILE.paving : PBR.TILE.grass;
      if (park) gl.setColor(1, 1, 1); else if (paved) gl.setColor(0.9, 0.88, 0.85); else gl.setColor(0.82, 0.86, 0.72);
      const cIdx = gl.v(ccx, H(ccx, ccz) + lift, ccz, 0, 1, 0, ccx / tk, ccz / tk);
      const ring = IN.map(([x, z]) => gl.v(x, H(x, z) + lift, z, 0, 1, 0, x / tk, z / tk));
      for (let k = 0; k < ring.length; k++) { const k2 = (k + 1) % ring.length; if (orient > 0) gl.tri(cIdx, ring[k2], ring[k]); else gl.tri(cIdx, ring[k], ring[k2]); }
    }
  }

  // ================================================================= terrain (8 m, min-filtered under city/road surfaces)
  const terr = new Tiled({ uv: true, color: true, extra: { aSplat: 4 } });
  const TS = 2; // terrain vertex = every 2nd heightfield sample (8 m)
  const TT = 64; // samples per terrain tile edge (256 m)
  const hf = terrain.hf, S = terrain.surf, mask = terrain.gridMask;
  // authored in sRGB, converted to linear (vertex colours are linear); the material colour compensates the detail map's mean
  const surfCol = [
    [0.2, 0.28, 0.26], [0.22, 0.22, 0.22], [0.55, 0.53, 0.5], [0.4, 0.49, 0.26], [0.86, 0.78, 0.6], [0.52, 0.44, 0.32], [0.55, 0.52, 0.47], [0.26, 0.33, 0.18],
  ].map(c => { const k = new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear(); return [k.r, k.g, k.b]; });
  const vIdx = new Int32Array(Math.ceil(HF_W / TS + 1) * Math.ceil(HF_H / TS + 1)).fill(-1);
  const VW = Math.ceil(HF_W / TS) + 1;
  for (let tj = 0; tj < HF_H - 1; tj += TT) {
    for (let ti = 0; ti < HF_W - 1; ti += TT) {
      // skip deep-water tiles
      let maxH = -99;
      for (let j = tj; j <= Math.min(HF_H - 1, tj + TT); j += 2) for (let i = ti; i <= Math.min(HF_W - 1, ti + TT); i += 2) maxH = Math.max(maxH, hf[j * HF_W + i]);
      if (maxH < -2.5) continue;
      const cx = BOUNDS.minX + (ti + TT / 2) * HF_RES, cz = BOUNDS.minZ + (tj + TT / 2) * HF_RES;
      const g = terr.at(cx, cz);
      const local = new Map();
      const vert = (i, j) => {
        const key = j * HF_W + i; let v = local.get(key); if (v !== undefined) return v;
        const k = j * HF_W + i;
        let h = hf[k];
        const covered = mask[k] > 0.3 || S[k] === SURF.ASPHALT;
        if (covered) { let mn = h; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = Math.min(HF_W - 1, Math.max(0, i + a)), jj = Math.min(HF_H - 1, j + b); mn = Math.min(mn, hf[jj * HF_W + ii]); } h = mn - (mask[k] > 0.3 ? 0.35 : 0.12); }
        const x = BOUNDS.minX + i * HF_RES, z = BOUNDS.minZ + j * HF_RES;
        // normal from heightfield
        const il = Math.max(0, i - 1), ir = Math.min(HF_W - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(HF_H - 1, j + 1);
        let nx = -(hf[j * HF_W + ir] - hf[j * HF_W + il]) / ((ir - il) * HF_RES), nz = -(hf[ju * HF_W + i] - hf[jd * HF_W + i]) / ((ju - jd) * HF_RES), ny = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        // photo-texture splat weights (grass, forest floor, sand, rock) + a tint in the vertex colour
        const sk = S[k];
        let wts = [1, 0, 0, 0], c = [1, 1, 1];
        if (sk === SURF.FOREST) wts = [0.15, 0.85, 0, 0];
        else if (sk === SURF.DIRT) wts = [0.1, 0.6, 0.3, 0];
        else if (sk === SURF.SAND) wts = [0, 0, 1, 0];
        else if (sk === SURF.ROCK) wts = [0.05, 0.1, 0, 0.85];
        else if (sk === SURF.WATER) { wts = [0, 0.1, 0.9, 0]; c = h > -2 ? [0.85, 0.8, 0.7] : [0.35, 0.38, 0.32]; }
        else if (sk === SURF.CONCRETE || sk === SURF.ASPHALT) { wts = [0.1, 0, 0.15, 0.75]; c = [0.9, 0.88, 0.86]; }
        if (sk === SURF.GRASS && !covered) {
          // California grass: patches of dry gold among the green, more gold on exposed slopes and hilltops
          const dry = Math.min(1, Math.max(0, fbm(x * 0.004, z * 0.004, 3) * 1.6 + (h - 25) * 0.012 + (1 - ny) * 1.5));
          c = [1 + 0.45 * dry, 1 + 0.12 * dry, 1 - 0.45 * dry];
          if (dry > 0.6) wts = [0.8, 0, 0.2, 0];
        }
        // steep ground shows rock regardless
        if (ny < 0.8 && sk !== SURF.WATER) { const r = Math.min(1, (0.8 - ny) * 4); wts = wts.map((w, q) => w * (1 - r) + (q === 3 ? r : 0)); }
        const nv = 0.9 + hash01(i >> 2, j >> 2, 9) * 0.18;
        g.e.aSplat = wts;
        g.setColor(c[0] * nv, c[1] * nv, c[2] * nv);
        v = g.v(x, h, z, nx, ny, nz, x / 7, z / 7);
        local.set(key, v);
        return v;
      };
      for (let j = tj; j < Math.min(HF_H - 1, tj + TT); j += TS) {
        for (let i = ti; i < Math.min(HF_W - 1, ti + TT); i += TS) {
          const i2 = Math.min(HF_W - 1, i + TS), j2 = Math.min(HF_H - 1, j + TS);
          const a = vert(i, j), b = vert(i2, j), c = vert(i2, j2), d = vert(i, j2);
          g.quad(a, d, c, b);
        }
      }
    }
  }
  void vIdx; void VW;

  // ================================================================= materials
  const roadMat = makeRoadMaterial();
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const walkMat = makeSidewalkMaterial();
  const lotMat = PBR.material('grass', { vertexColors: true });
  const lotPMat = PBR.material('paving', { vertexColors: true });
  const terrMat = makeTerrainMaterial();
  const deckMatM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  for (const G of [road, walk, lotG, lotP]) for (const [, g] of G.m) recomputeFlatNormals(g);
  const meshes = [
    ...terr.meshes(terrMat, { name: 'terrain', receive: true }),
    ...road.meshes(roadMat, { name: 'road' }),
    ...mark.meshes(markMat, { name: 'markings' }),
    ...walk.meshes(walkMat, { name: 'sidewalk' }),
    ...lotG.meshes(lotMat, { name: 'lots' }),
    ...lotP.meshes(lotPMat, { name: 'lots-paved' }),
    ...deckMat.meshes(deckMatM, { name: 'decks', cast: true }),
  ];
  for (const m of meshes) group.add(m);
  // water: built by world.js via render/water.js
  return { group, colliders };
}

const GOLD = (() => { const k = new THREE.Color(0.66, 0.58, 0.36).convertSRGBToLinear(); return [k.r, k.g, k.b]; })();
function zoneOf(n) { return n.zone || (n.zone = zoneLookup(n.x, n.z)); }
import { zoneAt as zoneLookup } from './map.js';

function deckYOf(e) {
  // y along a deck edge (linear per edge polyline segment); lateral doesn't change y
  const P = e.pts, Y = e.ys;
  return (x, z) => {
    let best = Infinity, by = Y[0];
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
      if (d < best) { best = d; by = Y[k] + (Y[k + 1] - Y[k]) * t; }
    }
    return by;
  };
}
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
function railBox(g, A, B, w, h) {
  const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, rx = -dz / L * w / 2, rz = dx / L * w / 2;
  const p = (P, sx, y) => [P[0] + rx * sx, P[1] + y, P[2] + rz * sx];
  g.quadP(p(A, 1, 0), p(B, 1, 0), p(B, 1, h), p(A, 1, h));
  g.quadP(p(B, -1, 0), p(A, -1, 0), p(A, -1, h), p(B, -1, h));
  g.quadP(p(A, -1, h), p(A, 1, h), p(B, 1, h), p(B, -1, h));
}
function segCollider(A, B, w, yMin, yMax, kind) {
  const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz);
  // local Z along the segment: yaw so that local Z maps to (dx, dz): world z-axis of local frame = (sin yaw, cos yaw)
  const yaw = Math.atan2(dx, dz);
  return { x: (A[0] + B[0]) / 2, z: (A[2] + B[2]) / 2, hx: w / 2, hz: L / 2 + 0.05, yaw, yMin, yMax, kind };
}
// normals for "flat-ish" ground builders: accumulate face normals per vertex
function recomputeFlatNormals(g) {
  const n = g.n, pos = g.pos, nor = g.nor, idx = g.idx;
  const acc = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[c * 3] - pos[a * 3], by = pos[c * 3 + 1] - pos[a * 3 + 1], bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const v of [a, b, c]) { acc[v * 3] += nx; acc[v * 3 + 1] += ny; acc[v * 3 + 2] += nz; }
  }
  for (let v = 0; v < n; v++) {
    let x = acc[v * 3], y = acc[v * 3 + 1], z = acc[v * 3 + 2];
    if (y < 0) { x = -x; y = -y; z = -z; }
    const l = Math.hypot(x, y, z);
    if (l > 1e-9 && Math.abs(nor[v * 3 + 1]) > 0.5) { nor[v * 3] = x / l; nor[v * 3 + 1] = y / l; nor[v * 3 + 2] = z / l; }
  }
}
