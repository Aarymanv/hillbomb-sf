// Festival shared helpers: lat/lon placement + road snapping, route threading over the road graph, dense route paths
// with cumulative length / heights / widths, progress trackers, formatting.
// Everything the festival places is authored in real lat/lon (catalog.js) and resolved here against the live world,
// so content moves with map rebuilds. Nothing here allocates per frame except where noted.
import { ll } from '../../world/latlon.js';
import { findRoute, edgePointAt } from '../../world/roads.js';

export { ll };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
// yaw so that an object's -Z (forward) faces direction (dx, dz)
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz);

// ------------------------------------------------------------------ formatting
export function fmtTime(t, cs = true) {
  if (!isFinite(t)) return '--:--';
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return (neg ? '-' : '') + `${m}:${cs ? s.toFixed(2).padStart(5, '0') : String(Math.floor(s)).padStart(2, '0')}`;
}
export const fmtGap = t => (t >= 0 ? '+' : '-') + Math.abs(t).toFixed(2);
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
export const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');
export const fmtNum = n => Math.round(n).toLocaleString('en-US');
export function fmtSpeed(ms, units) { return units === 'kmh' ? `${Math.round(ms * 3.6)} KM/H` : `${Math.round(ms * 2.23694)} MPH`; }
export function speedVal(ms, units) { return units === 'kmh' ? ms * 3.6 : ms * 2.23694; }
export function fmtDist(m, units) {
  if (units === 'kmh') return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  return m >= 300 ? (m / 1609.34).toFixed(1) + ' mi' : Math.round(m * 3.281) + ' ft';
}
export const stars = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ placement
const SLOW_KIND = { alley: 1, plaza: 1, park: 1, crooked: 1 };
// race routing: one-way streets may be raced against the flow (closed roads) but cost 3x, so divided roads still
// take the right carriageway while a key snapped to the wrong one no longer forces a kilometres-long loop
export const RACE_ROUTE = { onewayCost: 3, minWidth: 5.5 };   // + slip lanes / single-lane stubs cost 2.5x
function nameMatch(e, hint) { return e.name && e.name.toLowerCase().includes(hint.toLowerCase()); }
// nearest road point to a lat/lon, optionally preferring roads whose name contains `hint`
export function snapRoad(world, lat, lon, hint = null, maxDist = 260) {
  const [x, z] = ll(lat, lon);
  const g = world.graph;
  let n = null;
  // v2: only the connected road network (e.main; undefined on v1), unnamed keys avoid service lanes / plazas / paths
  const conn = e => e.main !== false, drive = e => conn(e) && !e.restricted && !SLOW_KIND[e.kind] && !(e.width < 5);
  if (hint) n = g.nearestEdge(x, z, Math.max(maxDist, 380), e => conn(e) && e.width >= 5 && nameMatch(e, hint))
    || g.nearestEdge(x, z, Math.max(maxDist, 380), e => conn(e) && nameMatch(e, hint));
  if (!n) n = g.nearestEdge(x, z, maxDist, drive);
  if (!n) n = g.nearestEdge(x, z, maxDist, conn);
  if (!n) return null;
  const o = edgePointAt(n.edge, n.s, {});
  return { x: n.x, z: n.z, edge: n.edge, s: n.s, dx: o.dx, dz: o.dz, raw: [x, z], dist: n.dist };
}
// nearest graph node (intersection / road end) for a lat/lon: snap to a road, then take the closer edge end unless the
// snapped point is mid-block far from both ends (then the nearest end anyway: routes are node to node)
export function snapNode(world, lat, lon, hint = null) {
  const r = snapRoad(world, lat, lon, hint);
  if (!r) return null;
  const e = r.edge;
  return r.s < e.len / 2 ? e.a : e.b;
}
// on land inside the map (outside the heightfield the surface reads as water)
export function onLand(world, x, z, minH = 0.35) { return world.heightAt(x, z) > minH && (world.terrain?.surfaceAt ? world.terrain.surfaceAt(x, z) !== 0 : true); }
// inside an OSM building footprint (1:1 map: its collider may not be streamed in yet)
export function inBuilding(world, x, z) { return (world.buildings?.buildingAt?.(x, z) ?? -1) >= 0; }
// free spot for an off-road point: on land, not inside a static collider; searches rings outward
export function snapLand(world, lat, lon, { radius = 80, pad = 2.5 } = {}) {
  const [x0, z0] = ll(lat, lon);
  const ok = (x, z) => onLand(world, x, z) && !world.colliders.pointHit(x, world.groundAt(x, z) + 1, z, pad) && !inBuilding(world, x, z);
  if (ok(x0, z0)) return { x: x0, z: z0 };
  for (let r = 6; r <= radius; r += 6) {
    const n = Math.max(8, Math.round(r / 3));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; if (ok(x, z)) return { x, z }; }
  }
  return null;
}
// over water (for boats / jets): pushes the point seaward until the sea floor is below minDepth
export function snapWater(world, lat, lon, { radius = 400, depth = -1.5 } = {}) {
  const [x0, z0] = ll(lat, lon);
  if (world.heightAt(x0, z0) < depth) return { x: x0, z: z0 };
  for (let r = 10; r <= radius; r += 10) {
    const n = Math.max(8, Math.round(r / 5));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; if (world.heightAt(x, z) < depth) return { x, z }; }
  }
  return null;
}
// a clear rectangular footprint (w x d metres) near a lat/lon, for festival sites: on land, no colliders, away from roads
export function findFootprint(world, lat, lon, w, d, { radius = 180, step = 8, roadClear = 2 } = {}) {
  const [x0, z0] = ll(lat, lon);
  const g = world.graph;
  // samples ordered centre, corners, edges, rest: cheap early rejection
  const S = [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (!S.some(q => q[0] === i && q[1] === j)) S.push([i, j]);
  const test = (cx, cz, limit) => {
    let bad = 0;
    for (const [i, j] of S) {
      const x = cx + (i / 2) * (w / 2), z = cz + (j / 2) * (d / 2);
      if (!onLand(world, x, z, 0.4)) return 99;
      // 1:1 map: building colliders are streamed (absent far from the player at install), so ask the footprint data too
      if (world.colliders.pointHit(x, world.groundAt(x, z) + 1.2, z, 1) || inBuilding(world, x, z)) bad++;
      else { const n = g.nearestEdge(x, z, 16); if (n && n.dist < n.edge.width / 2 + roadClear) bad++; }
      if (bad > limit) return bad;
    }
    return bad;
  };
  // sites must be reachable: a road within 400 m of the anchor
  if (!g.nearestEdge(x0, z0, 400)) return null;
  let best = null;
  for (let r = 0; r <= radius; r += step) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      const b = test(x, z, best ? Math.min(best.bad, 24) : 24);
      const score = b * 60 + r;
      if (!best || score < best.score) best = { x, z, score, bad: b };
      if (best.bad === 0) break;
    }
    if (best && best.bad === 0) break;
  }
  return best && best.bad < 99 ? best : null;
}

// ------------------------------------------------------------------ straight off-road legs
// fraction of the segment that is drivable (land, no collider); samples every `step` m
export function legClear(world, x0, z0, x1, z1, step = 6) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
  let bad = 0, hp = null;
  const sl = L / n;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const h = world.heightAt(x, z);
    // cliffs / seawalls / dune faces: > ~27 deg between samples is not drivable (the prologue beach leg climbed a 50 deg bluff)
    if (hp !== null && Math.abs(h - hp) > sl * 0.5) bad += 2;
    hp = h;
    if (h < 0.15 && world.terrain?.surfaceAt?.(x, z) === 0) { bad += 3; continue; }
    if (world.colliders.pointHit(x, world.groundAt(x, z) + 1, z, 1.6) || inBuilding(world, x, z)) bad++;
  }
  return bad;
}
// off-road path a -> b over the terrain: A* on an 8 m grid, cost grows with grade, cliffs (> ~31 deg), water, buildings and
// solid colliders are walls. Smoothed to ~24 m spacing. null when there is no way through inside the search box.
export function terrainPath(world, a, b, { cell = 8, pad = 160, maxGrade = 0.6 } = {}) {
  const x0 = Math.min(a[0], b[0]) - pad, z0 = Math.min(a[1], b[1]) - pad;
  const W = Math.ceil((Math.max(a[0], b[0]) + pad - x0) / cell) + 1, H = Math.ceil((Math.max(a[1], b[1]) + pad - z0) / cell) + 1;
  if (W * H > 90000) return null;
  const N = W * H, h = new Float32Array(N), ok = new Uint8Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * W + i, y = world.heightAt(x, z);
    h[k] = y;
    ok[k] = !(y < 0.15 && world.terrain?.surfaceAt?.(x, z) === 0) && !inBuilding(world, x, z) && !world.colliders.pointHit(x, world.groundAt(x, z) + 1, z, 1.2) ? 1 : 0;
  }
  const idx = (x, z) => Math.max(0, Math.min(H - 1, Math.round((z - z0) / cell))) * W + Math.max(0, Math.min(W - 1, Math.round((x - x0) / cell)));
  const s0 = idx(a[0], a[1]), s1 = idx(b[0], b[1]); ok[s0] = ok[s1] = 1;
  const g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], hf = [];
  const push = (id, f) => { heap.push(id); hf.push(f); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (hf[q] <= hf[i]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; [hf[q], hf[i]] = [hf[i], hf[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = last; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  const bi = s1 % W, bj = (s1 / W) | 0, heur = k => Math.hypot((k % W) - bi, ((k / W) | 0) - bj) * cell;
  g[s0] = 0; push(s0, heur(s0));
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const k = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === s1) break;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj] of D) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const q = nj * W + ni; if (!ok[q] || closed[q]) continue;
      const d = (di && dj ? 1.4142 : 1) * cell, gr = Math.abs(h[q] - h[k]) / d;
      if (gr > maxGrade) continue;
      const c = g[k] + d * (1 + 6 * gr * gr);
      if (c < g[q]) { g[q] = c; prev[q] = k; push(q, c + heur(q)); }
    }
  }
  if (!closed[s1]) return null;
  const cells = []; for (let k = s1; k >= 0; k = prev[k]) cells.push(k); cells.reverse();
  const P = cells.map(k => [x0 + (k % W) * cell, z0 + ((k / W) | 0) * cell]); P[0] = a; P[P.length - 1] = b;
  // string-pull: from each kept point jump to the furthest cell (<= 48 m) whose straight segment stays drivable (grade, walls)
  const segOk = (p, q) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / 4)); let hp = world.heightAt(p[0], p[1]);
    for (let i = 1; i <= n; i++) { const x = p[0] + (q[0] - p[0]) * i / n, z = p[1] + (q[1] - p[1]) * i / n, y = world.heightAt(x, z); if (Math.abs(y - hp) / (L / n) > maxGrade + 0.05 || !ok[idx(x, z)]) return false; hp = y; }
    return true;
  };
  const out = [P[0]];
  for (let i = 0; i < P.length - 1;) {
    let j = i + 1;
    for (let k = i + 2; k < P.length && Math.hypot(P[k][0] - P[i][0], P[k][1] - P[i][1]) <= 48; k++) if (segOk(P[i], P[k])) j = k;
    out.push(P[j]); i = j;
  }
  return out;
}
// straight leg from a to b, bending around obstacles (terrain A*, then lateral mid-point detours); null when hopeless
export function offroadLeg(world, a, b) {
  if (legClear(world, a[0], a[1], b[0], b[1]) === 0) return [a, b];
  // gentle first (race cars spin up > ~25 deg of grass: Headlands XC rivals all stalled on 31 deg faces), steeper if that's all there is
  const tp = terrainPath(world, a, b, { maxGrade: 0.45 }) || terrainPath(world, a, b); if (tp) return tp;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
  let best = null;
  for (const off of [12, -12, 24, -24, 40, -40, 60, -60, 90, -90]) {
    for (const f of [0.5, 0.33, 0.67]) {
      const m = [a[0] + dx * f + nx * off, a[1] + dz * f + nz * off];
      const bad = legClear(world, a[0], a[1], m[0], m[1]) + legClear(world, m[0], m[1], b[0], b[1]);
      if (bad === 0) return [a, m, b];
      if (!best || bad < best.bad) best = { bad, m };
    }
  }
  return best && best.bad <= 2 ? [a, best.m, b] : null;
}

// ------------------------------------------------------------------ route threading
// keys: [[lat, lon, hint?], ...]. hint: road-name substring to snap to, or '~' = off-road point (straight legs to it).
// returns { pts: [[x,z]...], deckY: [..] (NaN off decks) } or null
export function threadKeys(world, keys, { loop = false } = {}) {
  const g = world.graph;
  const res = [];
  for (const k of keys) {
    const [lat, lon, hint] = k;
    if (hint === '~') { const p = snapLand(world, lat, lon); if (!p) return null; res.push({ off: true, x: p.x, z: p.z }); }
    else {
      const r = snapRoad(world, lat, lon, hint || null); if (!r) return null;
      const last = res[res.length - 1];
      if (last && !last.off && Math.hypot(last.x - r.x, last.z - r.z) < 6) continue;
      res.push({ road: r, node: r.s < r.edge.len / 2 ? r.edge.a : r.edge.b, x: r.x, z: r.z });
    }
  }
  if (loop && res.length > 2) res.push(res[0]);
  if (res.length < 2) return null;
  const pts = [[res[0].x, res[0].z]], deck = [NaN];
  const push = (x, z, y = NaN) => { const q = pts[pts.length - 1]; if (Math.hypot(q[0] - x, q[1] - z) < 0.6) { if (!isNaN(y)) deck[deck.length - 1] = y; return; } pts.push([x, z]); deck.push(y); };
  for (let i = 0; i < res.length - 1; i++) {
    const A = res[i], B = res[i + 1];
    if (A.off || B.off) {
      const leg = offroadLeg(world, [A.x, A.z], [B.x, B.z]);
      if (!leg) {
        // off-road leg blocked: fall back to the roads between the nearest nodes
        const na = A.node || nearestNodeXZ(g, A.x, A.z), nb = B.node || nearestNodeXZ(g, B.x, B.z);
        const r = na && nb ? findRoute(g, na, nb, RACE_ROUTE) : null;
        if (!r) return null;
        push(na.x, na.z); appendEdges(r, push); push(B.x, B.z);
      } else for (let k = 1; k < leg.length; k++) push(leg[k][0], leg[k][1]);
      continue;
    }
    const seg = pathBetween(world, A.road, B.road);
    if (seg) { for (let k = 0; k < seg.pts.length; k++) push(seg.pts[k][0], seg.pts[k][1], seg.deck[k]); continue; }
    const r = findRoute(g, A.node, B.node, RACE_ROUTE);
    if (!r) return null;
    push(A.node.x, A.node.z); appendEdges(r, push);
  }
  return { pts, deck };
}
function appendEdges(route, push) {
  for (const { edge, forward } of route) {
    const n = edge.pts.length;
    for (let k = 1; k < n; k++) {
      const i = forward ? k : n - 1 - k;
      push(edge.pts[i][0], edge.pts[i][1], edge.ys ? edge.ys[i] : NaN);
    }
  }
}
export function nearestNodeXZ(g, x, z) { const n = g.nearestEdge(x, z, 300); if (!n) return null; return n.s < n.edge.len / 2 ? n.edge.a : n.edge.b; }
// U-turns in a threaded path (a key snapped onto the far carriageway / wrong side of a one-way pair makes the route
// double back): returns [{ i, j, k, x, z }] where the heading over 25 m before j and 25 m after j differs by > 150 deg
export function findUturns(pts, win = 25) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = []; let last = -1e9;
  for (let i = 0; i < pts.length; i++) {
    let j = i; while (j < pts.length - 1 && cum[j] - cum[i] < win) j++;
    let k = j; while (k < pts.length - 1 && cum[k] - cum[j] < win) k++;
    if (k === j || j === i) continue;
    const a1 = Math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]), a2 = Math.atan2(pts[k][1] - pts[j][1], pts[k][0] - pts[j][0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 2.6 && cum[j] - last > 60) { last = cum[j]; out.push({ i, j, k, s: cum[j], x: pts[j][0], z: pts[j][1] }); }
  }
  return out;
}
// threadKeys + U-turn repair: an intermediate key that causes a U-turn is dropped (its neighbours still route over the
// same streets); a U-turn right at the start / end is trimmed off
export function threadKeysClean(world, keys, opts = {}) {
  let th = threadKeys(world, keys, opts);
  for (let it = 0; th && it < 4; it++) {
    const U = findUturns(th.pts); if (!U.length) break;
    let drop = -1;
    for (const u of U) {
      for (let q = opts.loop ? 1 : 1; q < keys.length - (opts.loop ? 0 : 1); q++) {
        const [kx, kz] = ll(keys[q][0], keys[q][1]);
        if (Math.hypot(kx - u.x, kz - u.z) < 140) { drop = q; break; }
      }
      if (drop >= 0) break;
    }
    if (drop < 0 || keys.length <= 2) break;
    const k2 = keys.filter((_, q) => q !== drop), t2 = threadKeys(world, k2, opts);
    if (!t2) break;
    keys = k2; th = t2;
  }
  if (th && !opts.loop) {
    const U = findUturns(th.pts);
    const cum = [0]; for (let i = 1; i < th.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(th.pts[i][0] - th.pts[i - 1][0], th.pts[i][1] - th.pts[i - 1][1]));
    const L = cum[cum.length - 1];
    let a = 0, b = th.pts.length;
    const [fx, fz] = ll(keys[0][0], keys[0][1]), [lx, lz] = ll(keys[keys.length - 1][0], keys[keys.length - 1][1]);
    for (const u of U) {
      if (u.s < 90 || Math.hypot(u.x - fx, u.z - fz) < 80) a = Math.max(a, u.j);
      else if (L - u.s < 90 || Math.hypot(u.x - lx, u.z - lz) < 80) b = Math.min(b, u.j + 1);
    }
    if (a > 0 || b < th.pts.length) th = { pts: th.pts.slice(a, b), deck: th.deck.slice(a, b) };
    th = trimReturnLegs(th);
  }
  return th;
}
// Wide turnarounds at the ends: a first / last key snapped onto the far carriageway of a divided road makes the route run past
// it, turn through a median opening and come back down the other side (Russian Hill Bomb: finish 30 m beside a stretch the
// racers had already driven). findUturns misses these (the turn is a kink + a 25 m crossing). If the last ~220 m come back
// anti-parallel within 40 m of the route driven >= 70 m earlier, end where the route first passes that point (start likewise).
function trimReturnLegs(th) {
  const P = th.pts, n = P.length; if (n < 6) return th;
  const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[n - 1];
  const dir = i => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  let end = n, start = 0;
  for (let q = n - 1; q > 0 && L - cum[q] < 220; q--) {
    const hq = dir(q);
    for (let p = 0; p < q && cum[q] - cum[p] >= 70; p++) {
      if (Math.hypot(P[p][0] - P[q][0], P[p][1] - P[q][1]) > 40) continue;
      const hp = dir(p); if (hp[0] * hq[0] + hp[1] * hq[1] < -0.7) { end = Math.min(end, p + 1); break; }
    }
  }
  for (let q = 0; q < n - 1 && cum[q] < 220; q++) {
    const hq = dir(q);
    for (let p = n - 1; p > q && cum[p] - cum[q] >= 70; p--) {
      if (Math.hypot(P[p][0] - P[q][0], P[p][1] - P[q][1]) > 40) continue;
      const hp = dir(p); if (hp[0] * hq[0] + hp[1] * hq[1] < -0.7) { start = Math.max(start, p); break; }
    }
  }
  // only when what is left is still a real route (never more than a third of it)
  if ((end < n && L - cum[end - 1] > L / 3) || (start > 0 && cum[start] > L / 3) || end - start < 4) return th;
  if (end < n || start > 0) return { pts: P.slice(start, end), deck: th.deck.slice(start, end) };
  return th;
}
// GPS helper: road route between two world points (points list, first = from, last = to)
// heading (hx, hz, unit) = the player's direction of travel: the route leaves through the end of the current street the
// player is driving toward (respecting one-ways) instead of always the nearer node, which pointed the GPS back behind the
// car mid-block. Drivable roads only (no footpaths / closed service lanes) for the start and end snaps.
const GPS_ROAD = e => e.main !== false && !e.restricted && !(e.width < 4);
export function roadPath(world, fx, fz, tx, tz, hx = 0, hz = 0) {
  const g = world.graph;
  const nf = g.nearestEdge(fx, fz, 300, GPS_ROAD) || g.nearestEdge(fx, fz, 300), nt = g.nearestEdge(tx, tz, 300, GPS_ROAD) || g.nearestEdge(tx, tz, 300);
  if (!nf || !nt) return null;
  const b = nt.s < nt.edge.len / 2 ? nt.edge.a : nt.edge.b;
  const e = nf.edge, cands = [];
  // direction of e at the player: +1 = toward e.b
  let along = 0;
  if (hx || hz) { const k = Math.min(nf.k ?? 0, e.pts.length - 2), dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1], l = Math.hypot(dx, dz) || 1; along = (dx * hx + dz * hz) / l; }
  for (const [node, d, fwd] of [[e.b, e.len - nf.s, 1], [e.a, nf.s, -1]]) {
    if (e.oneway && fwd < 0) continue;                       // can't leave a one-way street backwards
    const turn = along * fwd < -0.3 ? 120 : 0;              // turning round costs ~a block
    cands.push({ node, cost: d + turn });
  }
  if (!cands.length) cands.push({ node: nf.s < e.len / 2 ? e.a : e.b, cost: 0 });
  let best = null;
  for (const c of cands.sort((p, q) => p.cost - q.cost).slice(0, 2)) {
    const r = c.node === b ? [] : findRoute(g, c.node, b); if (!r) continue;
    let len = c.cost; for (const st of r) len += st.edge.len;
    if (!best || len < best.len) best = { r, node: c.node, len };
  }
  if (!best) return null;
  const r = best.r, a = best.node;
  const pts = [[fx, fz], [a.x, a.z]];
  appendEdges(r, (x, z) => { const q = pts[pts.length - 1]; if (Math.hypot(q[0] - x, q[1] - z) > 0.6) pts.push([x, z]); });
  pts.push([tx, tz]);
  return pts;
}

// exact road path between two snapRoad() results (partial edges at both ends); { pts, deck } or null
export function pathBetween(world, A, B) {
  const g = world.graph;
  const slice = (e, s0, s1) => { // points of edge e from arc length s0 to s1 (either direction)
    const out = [], dk = [], P = {};
    const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / 4) + 1);
    for (let i = 0; i < n; i++) { const s = s0 + (s1 - s0) * i / (n - 1); edgePointAt(e, s, P); out.push([P.x, P.z]); dk.push(e.ys ? P.y : NaN); }
    return { pts: out, deck: dk };
  };
  if (A.edge === B.edge) return slice(A.edge, A.s, B.s);
  let best = null;
  for (const na of [A.edge.a, A.edge.b]) for (const nb of [B.edge.a, B.edge.b]) {
    const r = na === nb ? [] : findRoute(g, na, nb, RACE_ROUTE);
    if (!r) continue;
    const la = na === A.edge.a ? A.s : A.edge.len - A.s, lb = nb === B.edge.a ? B.s : B.edge.len - B.s;
    let L = la + lb; for (const { edge } of r) L += edge.len;
    // skip routes that immediately double back over their own start / end edge
    if (r.length && (r[0].edge === A.edge || r[r.length - 1].edge === B.edge)) continue;
    if (!best || L < best.L) best = { L, na, nb, r };
  }
  if (!best) return null;
  const a = slice(A.edge, A.s, best.na === A.edge.a ? 0 : A.edge.len);
  const pts = a.pts, deck = a.deck;
  const push = (x, z, y = NaN) => { const q = pts[pts.length - 1]; if (Math.hypot(q[0] - x, q[1] - z) < 0.6) return; pts.push([x, z]); deck.push(y); };
  appendEdges(best.r, push);
  const b = slice(B.edge, best.nb === B.edge.a ? 0 : B.edge.len, B.s);
  for (let i = 0; i < b.pts.length; i++) push(b.pts[i][0], b.pts[i][1], b.deck[i]);
  return { pts, deck };
}

// remove back-and-forth spikes (U-turn artefacts where two keys snapped onto the same street)
export function despike(pts, deck) {
  let i = 1;
  while (i < pts.length - 1) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    const degenerate = lu < 1e-3 || lv < 1e-3;
    if (degenerate || ((ux * vx + uz * vz) / (lu * lv) < -0.93 && Math.min(lu, lv) < 90)) {
      pts.splice(i, 1); deck?.splice(i, 1);
      i = Math.max(1, i - 1); // the previous point may now be the tip of the same spur
      continue;
    }
    i++;
  }
}
export function densify(pts, deck, step) {
  const out = [pts[0].slice()], od = [deck ? deck[0] : NaN];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    const ya = deck ? deck[i - 1] : NaN, yb = deck ? deck[i] : NaN;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      od.push(!isNaN(ya) && !isNaN(yb) ? ya + (yb - ya) * t : k === n ? yb : NaN);
    }
  }
  return { pts: out, deck: od };
}
// light corner rounding so the driving line and AI don't see 90-degree kinks (keeps endpoints)
export function roundCorners(pts, iters = 2) {
  let P = pts;
  for (let it = 0; it < iters; it++) {
    const Q = [P[0]];
    for (let i = 1; i < P.length - 1; i++) Q.push([P[i][0] * 0.5 + (P[i - 1][0] + P[i + 1][0]) * 0.25, P[i][1] * 0.5 + (P[i - 1][1] + P[i + 1][1]) * 0.25]);
    Q.push(P[P.length - 1]);
    P = Q;
  }
  return P;
}

// ------------------------------------------------------------------ Route: dense path with lengths, heights, widths
// opts.startS: start line distance along the path (grid sits behind it); loop: circuit (last point joins the first)
// something solid (not breakable street furniture, not parked cars) within pad of (x, z) at height y
export function solidNear(world, x, y, z, pad) {
  const arr = world.colliders.query(x, z, pad + 1, _solidTmp);
  for (const c of arr) {
    if (c.breakable || c.broken || c.kind === 'parked' || c.kind === 'bounds' || y < c.yMin - 0.5 || y > c.yMax + 1.5) continue;
    const dx = x - c.x, dz = z - c.z, lx = c.c * dx - c.s * dz, lz = c.s * dx + c.c * dz;
    if (Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad) return c;
  }
  return null;
}
const _solidTmp = [];
export function makeRoute(world, threaded, { loop = false, step = 5, startS = 50, smoothIters = 1, clearance = true } = {}) {
  let { pts, deck } = threaded;
  pts = pts.map(p => p.slice()); deck = deck ? deck.slice() : pts.map(() => NaN);
  despike(pts, deck);
  if (loop) {
    const a = pts[0], b = pts[pts.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) { pts.pop(); deck.pop(); }
    // circuits: also remove spikes across the start / finish seam (a start key just past a corner)
    const spike = (a, b, c) => { const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1], lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz); return lu < 1e-3 || lv < 1e-3 || ((ux * vx + uz * vz) / (lu * lv) < -0.93 && Math.min(lu, lv) < 90); };
    for (let guard = 0; guard < 400 && pts.length > 4; guard++) {
      const n0 = pts.length;
      if (Math.hypot(pts[n0 - 1][0] - pts[0][0], pts[n0 - 1][1] - pts[0][1]) < 1) { pts.pop(); deck.pop(); continue; }
      if (spike(pts[n0 - 1], pts[0], pts[1])) { pts.shift(); deck.shift(); continue; }
      if (spike(pts[n0 - 2], pts[n0 - 1], pts[0])) { pts.pop(); deck.pop(); continue; }
      break;
    }
  }
  const d = densify(loop ? [...pts, pts[0]] : pts, loop ? [...deck, deck[0]] : deck, step);
  let P = d.pts, D = d.deck;
  if (loop) { P.pop(); D.pop(); }
  if (smoothIters) {
    const S = roundCorners(P, smoothIters);
    // keep deck samples exact (bridges are straight-ish anyway)
    for (let i = 0; i < P.length; i++) if (isNaN(D[i])) P[i] = S[i];
  }
  // circuits: an out-and-back stub at the start / finish seam survives the coarse seam pass when the closing leg comes back
  // down the street the first leg leaves on (Golden Gate Park Loop: a 35 m dead-end spike at the line; the grid sat on it,
  // the rivals' progress pinned at 0 and they were respawned over and over). Eat it from both ends until the seam is smooth.
  if (loop) {
    const rev = (a, b, c) => { const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1], lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz); return lu < 1e-3 || lv < 1e-3 || (ux * vx + uz * vz) / (lu * lv) < -0.3; };
    for (let guard = 0; guard < 200 && P.length > 20; guard++) {
      const m = P.length;
      if (rev(P[m - 1], P[0], P[1])) { P.shift(); D.shift(); continue; }
      if (rev(P[m - 2], P[m - 1], P[0])) { P.pop(); D.pop(); continue; }
      break;
    }
    // start / finish on a straight: the grid sits on the last ~40 m of the lap and the first move is the launch. A key at a
    // junction put the line on a 90-180 deg corner (Golden Gate Park Loop: a hairpin; the rivals launched straight on past
    // it, their progress stayed pinned at the line and they were respawned for 12 s). Rotate the loop to the first point
    // (within 600 m) whose 50 m behind and 30 m ahead turn less than ~20 deg.
    const m = P.length, hd = i => { const a = P[(i - 1 + m) % m], b = P[(i + 1) % m]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const turnAt = i => { let t = 0, h0 = hd(i); for (let k = -10; k <= 6; k++) { let d = Math.abs(hd((i + k + m) % m) - h0); if (d > Math.PI) d = 2 * Math.PI - d; t = Math.max(t, d); } return t; };
    let start = 0, walked = 0;
    for (let i = 0; i < m && walked < 600; i++) {
      if (turnAt(i) < 0.35) { start = i; break; }
      const q = P[(i + 1) % m]; walked += Math.hypot(q[0] - P[i][0], q[1] - P[i][1]);
    }
    if (start > 0) { P = [...P.slice(start), ...P.slice(0, start)]; D = [...D.slice(start), ...D.slice(0, start)]; }
  }
  const n = P.length;
  const cum = new Float32Array(n + (loop ? 1 : 0));
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  if (loop) cum[n] = cum[n - 1] + Math.hypot(P[0][0] - P[n - 1][0], P[0][1] - P[n - 1][1]);
  let L;
  const ys = new Float32Array(n), width = new Float32Array(n), off = new Uint8Array(n), med = new Float32Array(n);
  const g = world.graph;
  for (let i = 0; i < n; i++) {
    const [x, z] = P[i];
    const e = g.nearestEdge(x, z, 14);
    if (e) {
      const E = e.edge;
      // divided roads (planted median): race down the right-hand carriageway, never through the median
      if ((E.median || 0) >= 1 && !E.deck) { med[i] = E.median + E.lanes * E.laneW * 0.62; width[i] = E.lanes * E.laneW + 1; }
      else width[i] = E.width;
    } else { width[i] = 14; off[i] = 1; }
  }
  // shift onto the carriageway (offset smoothed over +-4 points so lane changes at junctions are gradual)
  if (med.some(v => v > 0)) {
    const sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = loop ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k)); a += med[j]; c++; } sm[i] = a / c; }
    const Q = P.map(p => p.slice());
    for (let i = 0; i < n; i++) {
      if (sm[i] <= 0.01) continue;
      const a = P[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      Q[i][0] = P[i][0] - (dz / l) * sm[i]; Q[i][1] = P[i][1] + (dx / l) * sm[i];
    }
    P = Q;
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (loop) cum[n] = cum[n - 1] + Math.hypot(P[0][0] - P[n - 1][0], P[0][1] - P[n - 1][1]);
  }
  for (let i = 0; i < n; i++) {
    const [x, z] = P[i];
    const dy = D[i];
    ys[i] = !isNaN(dy) ? world.groundAt(x, z, dy + 1) : world.groundAt(x, z, world.heightAt(x, z) + 2.5);
  }
  // clearance: nudge points that pass within ~2 m of something solid (median palms, poles, walls) sideways
  if (clearance) {
    const shift = new Float32Array(n);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = P[i], y = ys[i] + 1;
      if (!solidNear(world, x, y, z, 2.1)) continue;
      const a = P[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l;
      for (const o of [0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8, 3.6, -3.6, 4.5, -4.5]) {
        if (!solidNear(world, x + rx * o, y, z + rz * o, 2.1)) { shift[i] = o; moved++; break; }
      }
    }
    if (moved) {
      const Q = P.map(p => p.slice());
      for (let i = 0; i < n; i++) {
        let o = 0, wsum = 0;
        for (let k = -3; k <= 3; k++) { const j = loop ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k)); const w = 4 - Math.abs(k); o += shift[j] * w; wsum += w; }
        // keep the full shift where it was needed, blend it into the neighbours elsewhere
        const s0 = Math.abs(shift[i]) > 0 ? shift[i] : o / wsum;
        if (Math.abs(s0) < 0.05) continue;
        const a = P[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        Q[i][0] = P[i][0] - (dz / l) * s0; Q[i][1] = P[i][1] + (dx / l) * s0;
      }
      P = Q;
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (loop) cum[n] = cum[n - 1] + Math.hypot(P[0][0] - P[n - 1][0], P[0][1] - P[n - 1][1]);
    }
  }
  L = cum[loop ? n : n - 1];
  const R = { pts: P, ys, width, off, cum, L, loop, n, startS: loop ? 0 : Math.min(startS, L * 0.2) };
  // circuits: rotate so index 0 is the start line and the grid sits at the end of the lap
  return R;
}
// position on a route at arc length s (wraps for loops); writes {x,z,y,dx,dz,i}
export function routeAt(R, s, out) {
  const { cum, pts, n, L, loop } = R;
  if (loop) { s %= L; if (s < 0) s += L; } else s = clamp(s, 0, L);
  let lo = 0, hi = loop ? n : n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const i = lo, j = loop ? (i + 1) % n : Math.min(i + 1, n - 1);
  const seg = cum[i + 1] - cum[i] || 1, t = clamp((s - cum[i]) / seg, 0, 1);
  const a = pts[i], b = pts[j];
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
  out.y = R.ys[i] + (R.ys[j] - R.ys[i]) * t;
  const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  out.dx = (b[0] - a[0]) / dl; out.dz = (b[1] - a[1]) / dl; out.i = i; out.w = R.width[i];
  return out;
}
// lateral offset copy of a route's points (for AI lanes); +off = right of travel direction
// The offset is capped at 0.5x the local turn radius and tapered (+-4 points): at a 90 deg junction corner the route's
// turn radius is only ~5-8 m, and a 2.6 m inside offset folded the lane back on itself (rivals at Lincoln -> Great Highway
// steered full lock into the park and sat there until the noProgress reset).
export function offsetPts(R, off) {
  const n = R.n, P = R.pts, out = new Array(n), cap = new Float32Array(n), at = (i) => P[R.loop ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n; i++) {
    const a = at(i - 2), p = P[i], b = at(i + 2);
    const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1], l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    let rad = 1e9;
    if (l1 > 1e-3 && l2 > 1e-3) { const ang = Math.acos(clamp((d1x * d2x + d1z * d2z) / (l1 * l2), -1, 1)); if (ang > 1e-3) rad = (l1 + l2) / 2 / ang; }
    cap[i] = Math.min(Math.max(0, R.width[i] / 2 - 2.2), rad * 0.5);
  }
  for (let i = 0; i < n; i++) {
    let lim = 1e9; for (let k = -4; k <= 4; k++) { const j = R.loop ? (i + k + n) % n : i + k; if (j >= 0 && j < n) lim = Math.min(lim, cap[j]); }
    const a = at(i - 1), b = at(i + 1);
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const o = clamp(off, -lim, lim);
    out[i] = [P[i][0] - (dz / l) * o, P[i][1] + (dx / l) * o];
  }
  return out;
}

// ------------------------------------------------------------------ progress tracker
// Arc-length progress along a route, robust to rewinds / respawns (window search, global fallback on big jumps).
// tr = { i, s, lap, P, lat } ; P = total progress from the start line (can be negative on the grid)
export function makeTracker(R) { return { i: 0, s: 0, lap: 0, P: -R.startS, lat: 0, dist: 0, init: false }; }
export function trackUpdate(R, tr, x, z) {
  const { pts, cum, n, loop, L } = R;
  const segs = loop ? n : n - 1;
  let best = -1, bd = Infinity, bt = 0, bs = Infinity;
  // pen: global pass only. A forward jump of more than 120 m costs its length in metres, so a car that strays near a
  // later part of the route is not teleported ahead; backward jumps (rewind, respawn) stay free.
  const test = (k, pen) => {
    const i = ((k % segs) + segs) % segs, j = loop ? (i + 1) % n : i + 1;
    const a = pts[i], b = pts[j], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
    let t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + ex * t - x, pz = a[1] + ez * t - z, d = px * px + pz * pz;
    let sc = d;
    if (pen) {
      const sk = cum[i] + (cum[i + 1] - cum[i]) * t;
      let jump = sk - tr.s; if (loop) { jump = ((jump % L) + L) % L; if (jump > L / 2) jump -= L; }
      if (jump > 120) { const q = Math.sqrt(d) + (jump - 120); sc = q * q; }
    }
    if (sc < bs) { bs = sc; bd = d; best = i; bt = t; }
  };
  if (tr.init) {
    const lo = loop ? tr.i - 30 : Math.max(0, tr.i - 30), hi = loop ? tr.i + 45 : Math.min(segs - 1, tr.i + 45);
    for (let k = lo; k <= hi; k++) test(k, false);
  }
  if (!tr.init || bd > 55 * 55) { bs = Infinity; for (let k = 0; k < segs; k++) test(k, tr.init); }
  const i = best, j = loop ? (i + 1) % n : i + 1;
  const s = cum[i] + (cum[i + 1] - cum[i]) * bt;
  if (loop && tr.init) {
    if (s < L * 0.25 && tr.s > L * 0.75) tr.lap++;
    else if (s > L * 0.75 && tr.s < L * 0.25) tr.lap--;
  }
  const a = pts[i], b = pts[j], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
  tr.lat = ((x - a[0]) * -ez + (z - a[1]) * ex) / l; // + = right of travel
  tr.i = i; tr.s = s; tr.dist = Math.sqrt(bd); tr.init = true;
  tr.P = loop ? tr.lap * L + s - R.startS : s - R.startS;
  return tr;
}
// first placement (grid): circuits count cars behind the line as lap -1
export function trackInit(R, tr, x, z) {
  tr.init = false; tr.lap = 0;
  trackUpdate(R, tr, x, z);
  if (R.loop && tr.s > R.L * 0.5) { tr.lap = -1; tr.P = -R.L + tr.s; }
  return tr;
}

// ------------------------------------------------------------------ curvature speed limits (driving line + AI hints)
export function speedLimits(R, latAcc = 9.5) {
  const { pts, n } = R, lim = new Float32Array(n), W = 3;
  for (let i = 0; i < n; i++) {
    const ia = R.loop ? (i - W + n) % n : Math.max(0, i - W), ib = R.loop ? (i + W) % n : Math.min(n - 1, i + W);
    const a = pts[ia], p = pts[i], b = pts[ib];
    const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-3 || l2 < 1e-3) { lim[i] = 90; continue; }
    const ang = Math.acos(clamp((d1x * d2x + d1z * d2z) / (l1 * l2), -1, 1));
    const k = ang / Math.max(1, (l1 + l2) / 2);
    lim[i] = k > 1e-4 ? clamp(Math.sqrt(latAcc / k), 8, 90) : 90;
  }
  // braking envelope backwards (decel ~7.5 m/s^2)
  const out = Float32Array.from(lim);
  const passes = R.loop ? 2 : 1;
  for (let p = 0; p < passes; p++) for (let k = n - 2 + (R.loop ? 1 : 0); k >= 0; k--) {
    const i = k % n, j = (k + 1) % n;
    const ds = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    const v = Math.sqrt(out[j] * out[j] + 2 * 7.5 * ds);
    if (v < out[i]) out[i] = v;
  }
  return out;
}

// seeded random (mulberry32)
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
