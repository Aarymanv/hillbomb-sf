// HILLBOMB pedestrians: navigation data. Built lazily from world.blocks / world.graph and cached.
//
// SIDEWALK RING. Every block's curb polygon `poly` is convex; the sidewalk is the 3.6 m band between `poly` and
// `inner`. A walker is parametrised by (edge k, t in [0,1], off) where `off` is the distance from edge k's curb.
// The walking line at offset `off` is the offset polygon whose vertex k is V_k + M_k * off (M = miter, M.N = 1
// for both adjacent edges), so a point at (k, t, off) is exactly `off` from edge k's curb for every t and edges
// meet without jumps at corners.
//
// CROSSINGS. At corner vertex c a walker may cross outward through the curb of either adjacent edge e. The
// crossing line runs along -N_e at CROSS_OFF from the other edge's curb line (the centre of the painted zebra
// band), from a wait point 0.55 m inside curb e to a landing point 0.6 m inside the far block's curb.
import { zoneAt, coastSDF as coastSDFv1, SPECIAL_ROADS } from '../../world/map.js';
import { pointInConvex } from '../../world/geo.js';
import { buildBlocksV2 } from '../../world/props/v2blocks.js';
import { zoneAtV2, densityAtV2 } from '../../world/props/v2zones.js';

export const SIDEWALK_W = 3.6;
export const LIFT_WALK = 0.15;    // sidewalk / lot slab height above the terrain (citymesh)
export const LIFT_ROAD = 0.05;    // grid road surface lift
export const OFF_MIN = 0.62, OFF_MAX = 3.02;
export const CROSS_OFF = 2.9;

// ------------------------------------------------------------------------------------------------ density
const ZONE_DENSITY = {
  downtown: 0.95, downtown_soma: 0.7, chinatown: 1, tenderloin: 0.6, soma: 0.5, northbeach: 0.85, wharf: 0.95,
  nobhill: 0.58, marina: 0.55, victorian: 0.42, castro: 0.8, mission: 0.82, avenues: 0.26, industrial: 0.16,
};
// [x, z, radius, density] : Union Square, Chinatown, Fisherman's Wharf, Castro, Mission (Valencia / 16th),
// Ferry Building, Haight, Financial District
const HOTSPOTS = [[1400, -100, 180, 1], [1480, -420, 170, 1], [1150, -1200, 240, 1], [250, 1250, 220, 0.95],
  [800, 1450, 330, 0.9], [2050, -560, 170, 0.9], [-250, 700, 200, 0.75], [1720, -350, 260, 0.95]];
export const NIGHTLIFE = new Set(['downtown', 'castro', 'mission', 'northbeach', 'tenderloin', 'chinatown']);

/** crowd density 0..1 at a world point (zone base, hot spots, the quiet Sunset) */
export function densityAt(x, z) {
  const zone = zoneAt(x, z);
  let d = ZONE_DENSITY[zone] ?? 0.4;
  if (zone === 'avenues' && z > 1100) d = 0.13;
  for (let i = 0; i < HOTSPOTS.length; i++) {
    const h = HOTSPOTS[i], dd = Math.hypot(x - h[0], z - h[1]);
    if (dd < h[2]) d = Math.max(d, h[3] * (1 - 0.35 * dd / h[2]));
  }
  return d;
}

// ------------------------------------------------------------------------------------------------ tourist spots
// look: point the tourists face (null = face the spot centre / random). deck: stands on a pier deck.
const SPOTS = [
  { name: 'Painted Ladies', x: 128, z: 380, r: 13, look: [175, 380], n: 6 },
  { name: 'Palace of Fine Arts', x: -390, z: -950, r: 30, look: [-390, -995], n: 5 },
  { name: 'Coit Tower', x: 1520, z: -965, r: 24, look: [1520, -965], n: 4, facing: 'out' },
  { name: "Fisherman's Wharf", x: 1060, z: -1226, r: 14, look: [1060, -1238], n: 6 },
  { name: 'Pier 39', x: 1334, z: -1390, r: 16, look: null, n: 7, deck: true },
  { name: 'Ferry Building', x: 2046, z: -566, r: 18, look: [2074, -589], n: 5 },
  { name: 'Lombard St', x: 1046, z: -948, r: 7, look: [1110, -940], n: 4 },
  { name: 'Union Square', x: 1400, z: -100, r: 30, look: null, n: 8 },
  { name: 'Golden Gate vista', x: -1480, z: -1215, r: 30, look: [-1640, -1820], n: 5 },
  { name: 'City Hall', x: 745, z: 300, r: 22, look: [800, 300], n: 4 },
  { name: 'Twin Peaks', x: -440, z: 1612, r: 12, look: [1500, -200], n: 3 },
  { name: 'Dolores Park', x: 550, z: 1460, r: 55, look: [1500, 0], n: 6 },
];

// ------------------------------------------------------------------------------------------------ nav
export function createNav(world) {
  // 1:1 map (?map=v2): blocks from the real street graph, real-district densities, park paths from OSM
  const v2 = !!world.v2;
  const { graph, terrain, colliders } = world;
  const blocks = v2 ? buildBlocksV2(graph, terrain) : world.blocks;
  const coastSDF = v2 ? (x, z) => (terrain.heightAt(x, z) > 0.3 && terrain.surfaceRaw(x, z) !== 0 ? 50 : -1) : coastSDFv1;
  const hAt = (x, z) => terrain.heightAt(x, z);

  // ---- block spatial hash
  const BC = 64, bhash = new Map();
  const bkey = (i, j) => i * 100003 + j;
  for (const b of blocks) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of b.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    b._pbox = [x0, z0, x1, z1];
    for (let j = Math.floor(z0 / BC); j <= Math.floor(z1 / BC); j++) for (let i = Math.floor(x0 / BC); i <= Math.floor(x1 / BC); i++) {
      const k = bkey(i, j); let a = bhash.get(k); if (!a) bhash.set(k, a = []); a.push(b);
    }
  }
  let bstamp = 1;
  function blocksNear(x, z, r, out = []) {
    out.length = 0; const st = ++bstamp;
    for (let j = Math.floor((z - r) / BC); j <= Math.floor((z + r) / BC); j++) for (let i = Math.floor((x - r) / BC); i <= Math.floor((x + r) / BC); i++) {
      const a = bhash.get(bkey(i, j)); if (!a) continue;
      for (const b of a) { if (b._bst === st) continue; b._bst = st; const q = b._pbox; if (x < q[0] - r || x > q[2] + r || z < q[1] - r || z > q[3] + r) continue; out.push(b); }
    }
    return out;
  }
  /** block whose curb polygon contains the point (sidewalk or lots), or null (street / park / water) */
  function blockAt(x, z) {
    const a = bhash.get(bkey(Math.floor(x / BC), Math.floor(z / BC)));
    if (!a) return null;
    for (const b of a) { const q = b._pbox; if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue; if (pointInConvex(x, z, b.poly)) return b; }
    return null;
  }

  // ---- graph node hash (signals)
  const NC = 48, nhash = new Map();
  for (const n of graph.nodes) { const k = bkey(Math.floor(n.x / NC), Math.floor(n.z / NC)); let a = nhash.get(k); if (!a) nhash.set(k, a = []); a.push(n); }
  function nodeNear(x, z, r) {
    let best = null, bd = r * r;
    for (let j = Math.floor((z - r) / NC); j <= Math.floor((z + r) / NC); j++) for (let i = Math.floor((x - r) / NC); i <= Math.floor((x + r) / NC); i++) {
      const a = nhash.get(bkey(i, j)); if (!a) continue;
      for (const n of a) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }

  // ---- sidewalk ring of a block
  function ring(b) {
    if (b._pr !== undefined) return b._pr;
    // drop near-duplicate vertices
    const P = [];
    for (const p of b.poly) { const q = P[P.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.4) P.push(p); }
    if (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.4) P.pop();
    const n = P.length;
    if (n < 3) { b._pr = null; return null; }
    const R = { b, n, vx: new Float64Array(n), vz: new Float64Array(n), ex: new Float64Array(n), ez: new Float64Array(n), nx: new Float64Array(n), nz: new Float64Array(n),
      len: new Float64Array(n), mx: new Float64Array(n), mz: new Float64Array(n), per: 0, cross: new Array(n * 2).fill(undefined), id: b.id };
    let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
    for (let k = 0; k < n; k++) {
      const a = P[k], c = P[(k + 1) % n];
      R.vx[k] = a[0]; R.vz[k] = a[1];
      const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz);
      R.len[k] = l; R.ex[k] = dx / l; R.ez[k] = dz / l; R.per += l;
      let nx = -R.ez[k], nz = R.ex[k];
      if ((cx - a[0]) * nx + (cz - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
      R.nx[k] = nx; R.nz[k] = nz;
    }
    for (let k = 0; k < n; k++) {
      const p = (k + n - 1) % n;
      const n0x = R.nx[p], n0z = R.nz[p], n1x = R.nx[k], n1z = R.nz[k];
      const d = Math.max(0.35, 1 + n0x * n1x + n0z * n1z);
      R.mx[k] = (n0x + n1x) / d; R.mz[k] = (n0z + n1z) / d;
    }
    // too thin for a usable ring? (edges shorter than the offset corners eat)
    let ok = false; for (let k = 0; k < n; k++) if (R.len[k] > 8) ok = true;
    b._pr = ok ? R : null;
    return b._pr;
  }
  function ringPos(R, k, t, off, out) {
    const k1 = k + 1 === R.n ? 0 : k + 1;
    const mx = R.mx[k] + (R.mx[k1] - R.mx[k]) * t, mz = R.mz[k] + (R.mz[k1] - R.mz[k]) * t;
    out.x = R.vx[k] + (R.vx[k1] - R.vx[k]) * t + mx * off;
    out.z = R.vz[k] + (R.vz[k1] - R.vz[k]) * t + mz * off;
    return out;
  }
  function ringLen(R, k, off) {
    const k1 = k + 1 === R.n ? 0 : k + 1;
    const dx = R.vx[k1] - R.vx[k] + (R.mx[k1] - R.mx[k]) * off, dz = R.vz[k1] - R.vz[k] + (R.mz[k1] - R.mz[k]) * off;
    return Math.max(0.2, Math.hypot(dx, dz));
  }
  /** inverse of ringPos on edge k: writes out.t, out.off */
  function ringProject(R, k, x, z, out) {
    const k1 = k + 1 === R.n ? 0 : k + 1;
    const rx = x - R.vx[k], rz = z - R.vz[k];
    const off = rx * R.nx[k] + rz * R.nz[k];
    const ex = R.ex[k], ez = R.ez[k];
    const m0 = R.mx[k] * ex + R.mz[k] * ez, m1 = R.mx[k1] * ex + R.mz[k1] * ez;
    out.off = off;
    out.t = (rx * ex + rz * ez - m0 * off) / (R.len[k] + (m1 - m0) * off || 1);
    return out;
  }
  /** attach a point to block b's ring: best edge where the point is on the sidewalk band. heading (hx,hz) picks the
   *  edge most aligned with it (0,0 = nearest). returns {R,k,t,off,align} or null */
  const _pj = {};
  function attach(b, x, z, hx = 0, hz = 0) {
    const R = ring(b); if (!R) return null;
    let best = null, bs = -Infinity;
    for (let k = 0; k < R.n; k++) {
      ringProject(R, k, x, z, _pj);
      if (_pj.t < -0.02 || _pj.t > 1.02 || _pj.off < -1.5 || _pj.off > SIDEWALK_W + 0.8) continue;
      const al = hx * R.ex[k] + hz * R.ez[k];
      const score = -Math.abs(_pj.off - 1.8) * 0.2 + Math.abs(al) * 2;
      if (score > bs) { bs = score; best = { R, k, t: Math.min(1, Math.max(0, _pj.t)), off: _pj.off, align: al }; }
    }
    return best;
  }
  /** nearest sidewalk-ring point to (x,z) within maxD (for peds that ended up on a road / in a park) */
  const _near = [], _rp = {};
  function nearestRing(x, z, maxD = 30, off = 1.6) {
    let best = null, bd = maxD;
    for (const b of blocksNear(x, z, maxD, _near)) {
      const R = ring(b); if (!R) continue;
      for (let k = 0; k < R.n; k++) {
        ringProject(R, k, x, z, _pj);
        const t = Math.min(0.98, Math.max(0.02, _pj.t));
        ringPos(R, k, t, off, _rp);
        const d = Math.hypot(_rp.x - x, _rp.z - z);
        if (d < bd) { bd = d; best = { R, k, t, off, x: _rp.x, z: _rp.z, d }; }
      }
    }
    return best;
  }

  // ---- crossings
  const _q = {};
  function crossing(R, c, e) {
    const key = c * 2 + (e === c ? 1 : 0);
    const cached = R.cross[key];
    if (cached !== undefined) return cached;
    R.cross[key] = null;
    const f = e === c ? (c + R.n - 1) % R.n : c;          // the other edge at this corner
    // corner point at CROSS_OFF from curb f and 0.55 m inside curb e
    const dx = -R.nx[e], dz = -R.nz[e];
    // point on the band at off_f = CROSS_OFF along curb f's inside, then walk out along d to 0.55 from curb e
    const vx = R.vx[c], vz = R.vz[c];
    // solve p = V + a*N_f + b*N_e with (p-V).N_f = CROSS_OFF, (p-V).N_e = 0.55
    const nfx = R.nx[f], nfz = R.nz[f], nex = R.nx[e], nez = R.nz[e];
    const det = nfx * nez - nfz * nex;
    if (Math.abs(det) < 0.25) return null;               // nearly straight corner: no real intersection here
    // unknown point offset q: q.N_f = CROSS_OFF, q.N_e = 0.55
    const qx = (CROSS_OFF * nez - 0.55 * nfz) / det, qz = (0.55 * nfx - CROSS_OFF * nex) / det;
    const wx = vx + qx, wz = vz + qz;
    if (!pointInConvex(wx, wz, R.b.poly)) return null;
    // march outward to the far block
    let hit = null, w = 0.7;
    for (; w < 38; w += 0.6) { const b2 = blockAt(wx + dx * w, wz + dz * w); if (b2 && b2 !== R.b) { hit = b2; break; } }
    if (!hit || w < 5) return null;
    // refine the far curb crossing
    let lo = w - 0.6, hi = w;
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (blockAt(wx + dx * m, wz + dz * m) === hit) hi = m; else lo = m; }
    const fx = wx + dx * (hi + 0.6), fz = wz + dz * (hi + 0.6);
    if (blockAt(fx, fz) !== hit) return null;
    // must be a real street (not an alley gap, highway or deck)
    const mxp = wx + dx * hi * 0.5, mzp = wz + dz * hi * 0.5;
    const ne = graph.nearestEdge(mxp, mzp, hi * 0.5 + 4);
    if (!ne || ne.edge.deck || ne.edge.kind === 'highway' || ne.edge.kind === 'bridge' || ne.edge.kind === 'crooked') return null;
    if (ne.dist > ne.edge.width / 2 + 3) return null;
    // clear of static obstacles (landmarks, pillars)
    const y = hAt(mxp, mzp) + 1.0;
    if (colliders.raycast2D(wx, wz, fx, fz, y, 0.3) < 1) return null;
    const node = nodeNear(mxp, mzp, 22);
    const len = Math.hypot(fx - wx, fz - wz);
    R.cross[key] = { R, c, e, wx, wz, fx, fz, dx, dz, len, b2: hit, node, street: ne.edge, width: hi - 0.55 };
    void _q;
    return R.cross[key];
  }

  // ---- promenades and park paths (joggers)
  const paths = [];
  // big static obstacles only: trees, poles and street furniture are walked around at runtime
  const BIG = new Set(['building', 'landmark', 'rail', 'pillar', 'bounds', 'interior', 'parked']);
  const _pc = [];
  const bigHit = (x, y, z, pad) => {
    for (const c of colliders.query(x, z, pad + 1, _pc)) {
      if (!BIG.has(c.kind) || y < c.yMin || y > c.yMax) continue;
      const dx = x - c.x, dz = z - c.z, lx = c.c * dx - c.s * dz, lz = c.s * dx + c.c * dz;
      if (Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad) return true;
    }
    return false;
  };
  const validPathPoint = (x, z) => {
    const h = hAt(x, z);
    if (h < 0.3 || coastSDF(x, z) < 3) return false;
    if (bigHit(x, h + 1, z, 0.45)) return false;
    const ne = graph.nearestEdge(x, z, 14);
    if (ne && ne.dist < ne.edge.width / 2 + 0.9) return false;
    const b = blockAt(x, z);
    if (b && b.inner && pointInConvex(x, z, b.inner) && !b.park) return false;
    return true;
  };
  function addPath(pts, kind, density) {
    // resample every 2 m, validate, split into runs
    let run = [];
    const flush = () => {
      if (run.length > 14) {
        const cum = [0]; for (let i = 1; i < run.length; i++) cum.push(cum[i - 1] + Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]));
        paths.push({ id: paths.length, pts: run, cum, len: cum[cum.length - 1], kind, density });
      }
      run = [];
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 2));
      for (let s = 0; s < n; s++) {
        const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
        if (validPathPoint(x, z)) run.push([x, z]); else flush();
      }
    }
    flush();
  }
  function offsetLine(pts, off) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      out.push([pts[i][0] - dz / l * off, pts[i][1] + dx / l * off]);
    }
    return out;
  }
  if (v2) {
    // park footpaths / cycle paths from OSM (long ones, on park surfaces)
    const t0 = performance.now();
    for (const p of world.data?.extras?.paths || []) {
      if (p.kind === 'steps' || p.pts.length < 2) continue;
      let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
      if (L < 60) continue;
      const m = p.pts[p.pts.length >> 1], sf = terrain.surfaceRaw(m[0], m[1]);
      if (sf !== 3 && sf !== 7 && sf !== 8 && sf !== 4) continue;
      addPath(p.pts, sf === 4 ? 'beach' : 'park', sf === 4 ? 0.35 : 0.55);
    }
    console.log(`[peds] v2 nav: ${blocks.length} blocks, ${paths.length} park paths in ${(performance.now() - t0).toFixed(0)} ms`);
  } else try {
    for (const r of SPECIAL_ROADS) {
      if (r.kind === 'park') { for (const s of [-1, 1]) addPath(offsetLine(r.path, s * (r.width / 2 + 2.6)), 'park', 0.55); }
      else if (r.name === 'The Embarcadero') {
        // the bayside promenade: pick the side toward the water per point
        const pts = r.path.map((p, i, a) => {
          const q = a[Math.min(a.length - 1, i + 1)], o = a[Math.max(0, i - 1)];
          const dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, off = r.width / 2 + 4.5;
          const s = coastSDF(p[0] + nx * 20, p[1] + nz * 20) < coastSDF(p[0] - nx * 20, p[1] - nz * 20) ? 1 : -1;
          return [p[0] + nx * off * s, p[1] + nz * off * s];
        });
        addPath(pts, 'promenade', 0.9);
      } else if (r.name === 'Great Highway') {
        const pts = r.path.map((p, i, a) => {
          const q = a[Math.min(a.length - 1, i + 1)], o = a[Math.max(0, i - 1)];
          const dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, off = r.width / 2 + 4;
          const s = coastSDF(p[0] + nx * 20, p[1] + nz * 20) < coastSDF(p[0] - nx * 20, p[1] - nz * 20) ? 1 : -1;
          return [p[0] + nx * off * s, p[1] + nz * off * s];
        });
        addPath(pts, 'beach', 0.3);
      }
    }
    // Crissy Field / Marina waterfront: follow the shore ~22 m inland
    const shore = [];
    for (let x = 440; x >= -1440; x -= 20) {
      let found = null;
      for (let z = -1500; z < -1000; z += 2) { if (coastSDF(x, z) > 22) { found = z; break; } }
      if (found !== null) shore.push([x, found]);
    }
    if (shore.length > 4) addPath(shore, 'shore', 0.8);
  } catch (err) { console.warn('[peds] path build', err); }

  // ---- spot sampling (lazy)
  function spotPoints(spot) {
    if (spot.pts) return spot.pts;
    spot.pts = [];
    let seed = (spot.x * 31 + spot.z * 17) | 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 90 && spot.pts.length < 24; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spot.r;
      const x = spot.x + Math.cos(a) * r, z = spot.z + Math.sin(a) * r;
      let y;
      if (spot.deck) { y = terrain.groundAt(x, z, 20); if (y < 2) continue; }
      else {
        y = hAt(x, z);
        if (y < 0.4 || coastSDF(x, z) < 2) continue;
        const ne = graph.nearestEdge(x, z, 14);
        if (ne && ne.dist < ne.edge.width / 2 + 0.8) continue;
        const b = blockAt(x, z);
        if (b && b.inner && !b.park && pointInConvex(x, z, b.inner)) continue;
      }
      if (colliders.pointHit(x, y + 1, z, 0.5)) continue;
      spot.pts.push([x, z]);
    }
    return spot.pts;
  }

  // ---- seats: benches and bus shelters placed by the street-props module (found through their colliders:
  // kind 'prop', propRef.set 'bench' | 'shelter'; both models face local -Z, the shelter bench is at local z +0.43)
  let seats = null;
  const SC = 64, shash = new Map();
  let seatVer = -1;
  function buildSeats() {
    seats = []; shash.clear(); seatVer = world.props?.seatVersion ?? 0;
    for (const c of (v2 ? world.props?.seats || [] : colliders.list)) {
      const r = c.propRef; const set = r && r.set;
      if (c.kind !== 'prop' || (set !== 'bench' && set !== 'shelter')) continue;
      const s = { type: set, x: r.x ?? c.x, y: r.y ?? c.yMin, z: r.z ?? c.z, yaw: r.yaw ?? c.yaw ?? 0, c, slots: set === 'bench' ? [null, null] : [null, null, null, null, null] };
      seats.push(s);
      const k = bkey(Math.floor(s.x / SC), Math.floor(s.z / SC)); let a = shash.get(k); if (!a) shash.set(k, a = []); a.push(s);
    }
  }
  function seatsNear(x, z, r, out = []) {
    if (!seats || (v2 && (world.props?.seatVersion ?? 0) !== seatVer)) buildSeats();
    out.length = 0;
    for (let j = Math.floor((z - r) / SC); j <= Math.floor((z + r) / SC); j++) for (let i = Math.floor((x - r) / SC); i <= Math.floor((x + r) / SC); i++) {
      const a = shash.get(bkey(i, j)); if (!a) continue;
      for (const s of a) if ((s.x - x) ** 2 + (s.z - z) ** 2 < r * r && !s.c.broken && !s.c.removed) out.push(s);
    }
    return out;
  }
  /** local (lx, lz) of a seat prop -> world {x, z} (CONVENTIONS oriented-box formula) */
  function seatPoint(s, lx, lz, out = {}) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    out.x = s.x + c * lx + sn * lz; out.z = s.z - sn * lx + c * lz;
    return out;
  }

  return {
    blocks, blocksNear, blockAt, nodeNear, ring, ringPos, ringLen, ringProject, attach, nearestRing, crossing,
    paths, spots: v2 ? [] : SPOTS, spotPoints, densityAt: v2 ? densityAtV2 : densityAt, zoneAt: v2 ? zoneAtV2 : zoneAt, seatsNear, seatPoint,
    /** ground height a pedestrian stands on at (x, z): sidewalks/lots are raised 0.15 m, roads 0.05 m */
    standY(x, z, probeY = Infinity) {
      const g = terrain.groundAt(x, z, probeY);
      const h = hAt(x, z);
      if (g > h + 0.3) return g;                         // on a deck (pier)
      const b = blockAt(x, z);
      if (b) return h + LIFT_WALK;
      const ne = graph.nearestEdge(x, z, 16);
      return h + (ne && ne.dist < ne.edge.width / 2 + 0.2 ? LIFT_ROAD : 0);
    },
  };
}

// polyline helpers for paths
export function pathPos(path, s, out) {
  const c = path.cum, p = path.pts;
  if (s <= 0) { out.x = p[0][0]; out.z = p[0][1]; out.dx = p[1][0] - p[0][0]; out.dz = p[1][1] - p[0][1]; }
  else if (s >= path.len) { const n = p.length - 1; out.x = p[n][0]; out.z = p[n][1]; out.dx = p[n][0] - p[n - 1][0]; out.dz = p[n][1] - p[n - 1][1]; }
  else {
    // binary search
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const t = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
    out.x = p[lo][0] + (p[hi][0] - p[lo][0]) * t; out.z = p[lo][1] + (p[hi][1] - p[lo][1]) * t;
    out.dx = p[hi][0] - p[lo][0]; out.dz = p[hi][1] - p[lo][1];
  }
  const l = Math.hypot(out.dx, out.dz) || 1; out.dx /= l; out.dz /= l;
  return out;
}
