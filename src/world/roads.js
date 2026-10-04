// Road graph (nodes / edges with polylines, lanes, names) built from the street grid + special roads + drivable decks.
// Used by traffic AI, GPS routing, the minimap and the road meshes.
import { XL, ZL, SPECIAL_ROADS, REMOVED_STREETS, coastSDF, inExclusion, gridStreetName, PLAY } from './map.js';
import { GRID_X, GRID_Z } from './terrain.js';

const NX = GRID_X.length, NZ = GRID_Z.length;
const xlIndexOf = x => XL.findIndex(l => l[0] === x);
const zlIndexOf = z => ZL.findIndex(l => l[0] === z);

export function buildRoadGraph(terrain) {
  const polys = []; // {pts:[[x,z]...], width, name, kind, grid, level:'ground'|'deck', axis, line, deck, splits:[]}

  // ---------------- grid runs
  const edgeActive = (axis, i, j) => {
    // axis 'x': vertical street at GRID_X[i] from GRID_Z[j] to GRID_Z[j+1]; axis 'z': horizontal at GRID_Z[j] from GRID_X[i] to GRID_X[i+1]
    let a, b, cellsActive;
    if (axis === 'x') {
      a = [GRID_X[i].c, GRID_Z[j].c]; b = [GRID_X[i].c, GRID_Z[j + 1].c];
      cellsActive = terrain.cellIsActive(i - 1, j) || terrain.cellIsActive(i, j);
    } else {
      a = [GRID_X[i].c, GRID_Z[j].c]; b = [GRID_X[i + 1].c, GRID_Z[j].c];
      cellsActive = terrain.cellIsActive(i, j - 1) || terrain.cellIsActive(i, j);
    }
    return { a, b, cellsActive, land: coastSDF(a[0], a[1]) > 4 && coastSDF(b[0], b[1]) > 4 };
  };
  const removed = (axis, lineCoord, from, to) => REMOVED_STREETS.some(([ax, li, r0, r1]) => {
    if (ax !== axis) return false;
    const L = ax === 'x' ? XL[li][0] : ZL[li][0];
    return L === lineCoord && Math.min(from, to) >= r0 - 1 && Math.max(from, to) <= r1 + 1;
  });
  const inExcl = (a, b) => { // street fully inside an exclusion zone (check both sides of the midpoint)
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), px = -dz / l * 9, pz = dx / l * 9;
    return inExclusion(mx + px, mz + pz) && inExclusion(mx - px, mz - pz);
  };
  for (const axis of ['x', 'z']) {
    const nLines = axis === 'x' ? NX : NZ, nSeg = axis === 'x' ? NZ - 1 : NX - 1;
    for (let L = 0; L < nLines; L++) {
      const flags = [];
      for (let s = 0; s < nSeg; s++) {
        const e = axis === 'x' ? edgeActive('x', L, s) : edgeActive('z', s, L);
        const lc = axis === 'x' ? GRID_X[L].c : GRID_Z[L].c;
        const from = axis === 'x' ? e.a[1] : e.a[0], to = axis === 'x' ? e.b[1] : e.b[0];
        const ok = e.land && e.cellsActive && !removed(axis, lc, from, to);
        flags.push({ ok, e, ext: e.land && !inExcl(e.a, e.b) && !removed(axis, lc, from, to) });
      }
      // extend runs by one edge at each end (so streets reach the Embarcadero / park roads); stubs are cleaned later
      const use = flags.map(f => f.ok);
      for (let s = 0; s < nSeg; s++) {
        if (flags[s].ok) continue;
        if (flags[s].ext && ((s > 0 && flags[s - 1].ok) || (s < nSeg - 1 && flags[s + 1].ok))) use[s] = true;
      }
      let run = null;
      const flush = () => {
        if (run && run.pts.length > 1) polys.push(run);
        run = null;
      };
      for (let s = 0; s < nSeg; s++) {
        if (!use[s]) { flush(); continue; }
        const { a, b } = flags[s].e;
        if (!run) {
          const li = axis === 'x' ? xlIndexOf(GRID_X[L].c) : zlIndexOf(GRID_Z[L].c);
          const [, name, width] = axis === 'x' ? XL[li] : ZL[li];
          run = { pts: [a.slice()], width, name, kind: width >= 18 ? 'arterial' : width >= 14 ? 'collector' : 'local', grid: true, level: 'ground', axis, line: li, splits: [] };
        }
        run.pts.push(b.slice());
      }
      flush();
    }
  }
  // ---------------- special roads
  for (const r of SPECIAL_ROADS) polys.push({ pts: r.path.map(p => [p[0], p[1]]), width: r.width, name: r.name, kind: r.kind, grid: false, level: 'ground', trees: r.trees, splits: [], special: r });
  // ---------------- decks as roads (bridges / approach)
  for (const d of terrain.decks) {
    if (d.kind === 'pier') continue;
    polys.push({ pts: d.pts.map(p => [p[0], p[1]]), ys: d.pts.map(p => p[2]), width: d.width, name: d.name, kind: 'bridge', grid: false, level: 'deck', deck: d, splits: [] });
  }

  // ---------------- nodes
  const nodes = [], nodeHash = new Map();
  const H = 16, hkey = (x, z) => Math.floor(x / H) * 73856093 ^ Math.floor(z / H) * 19349663;
  function nodeAt(x, z, tol = 2.5) {
    const cx = Math.floor(x / H), cz = Math.floor(z / H);
    let best = null, bd = tol * tol;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = nodeHash.get((cx + a) * 73856093 ^ (cz + b) * 19349663);
      if (!arr) continue;
      for (const n of arr) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    if (best) return best;
    const n = { id: nodes.length, x, z, edges: [], grid: false, signal: false };
    nodes.push(n);
    const k = hkey(x, z); let arr = nodeHash.get(k); if (!arr) nodeHash.set(k, arr = []); arr.push(n);
    return n;
  }
  // along-distance helpers
  for (const p of polys) {
    p.cum = [0];
    for (let k = 1; k < p.pts.length; k++) p.cum.push(p.cum[k - 1] + Math.hypot(p.pts[k][0] - p.pts[k - 1][0], p.pts[k][1] - p.pts[k - 1][1]));
    p.len = p.cum[p.cum.length - 1];
  }
  // grid lattice points are nodes
  for (const p of polys) if (p.grid) for (let k = 0; k < p.pts.length; k++) { const n = nodeAt(p.pts[k][0], p.pts[k][1]); n.grid = true; p.splits.push({ s: p.cum[k], node: n }); }
  // endpoints of non-grid polys
  for (const p of polys) if (!p.grid) {
    p.splits.push({ s: 0, node: nodeAt(p.pts[0][0], p.pts[0][1], p.level === 'deck' ? 4 : 2.5) });
    p.splits.push({ s: p.len, node: nodeAt(p.pts[p.pts.length - 1][0], p.pts[p.pts.length - 1][1], p.level === 'deck' ? 4 : 2.5) });
  }

  // ---------------- segment hash for crossing tests (ground level only)
  const SH = 64, segHash = new Map();
  polys.forEach((p, pi) => {
    if (p.level !== 'ground') return;
    for (let k = 0; k < p.pts.length - 1; k++) {
      const [ax, az] = p.pts[k], [bx, bz] = p.pts[k + 1];
      const x0 = Math.floor(Math.min(ax, bx) / SH), x1 = Math.floor(Math.max(ax, bx) / SH);
      const z0 = Math.floor(Math.min(az, bz) / SH), z1 = Math.floor(Math.max(az, bz) / SH);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const key = cx * 100003 + cz; let arr = segHash.get(key); if (!arr) segHash.set(key, arr = []); arr.push([pi, k]);
      }
    }
  });
  const seen = new Set();
  for (const [, arr] of segHash) {
    for (let u = 0; u < arr.length; u++) for (let v = u + 1; v < arr.length; v++) {
      const [pa, ka] = arr[u], [pb, kb] = arr[v];
      if (pa === pb && Math.abs(ka - kb) <= 1) continue;
      const A = polys[pa], B = polys[pb];
      if (A.grid && B.grid) continue; // lattice handles grid-grid
      const key = pa < pb ? `${pa}:${ka}:${pb}:${kb}` : `${pb}:${kb}:${pa}:${ka}`;
      if (seen.has(key)) continue; seen.add(key);
      const hit = segIntersect(A.pts[ka], A.pts[ka + 1], B.pts[kb], B.pts[kb + 1]);
      if (!hit) continue;
      const [x, z, ta, tb] = hit;
      const n = nodeAt(x, z, 3);
      A.splits.push({ s: A.cum[ka] + ta * (A.cum[ka + 1] - A.cum[ka]), node: n, x, z });
      B.splits.push({ s: B.cum[kb] + tb * (B.cum[kb + 1] - B.cum[kb]), node: n, x, z });
    }
  }
  // T-junctions: special road endpoints touching another ground road's interior
  polys.forEach((p, pi) => {
    if (p.grid || p.level !== 'ground') return;
    for (const end of [0, p.pts.length - 1]) {
      const [ex, ez] = p.pts[end];
      let best = null;
      polys.forEach((q, qi) => {
        if (qi === pi || q.level !== 'ground') return;
        for (let k = 0; k < q.pts.length - 1; k++) {
          const [ax, az] = q.pts[k], [bx, bz] = q.pts[k + 1];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          let t = ((ex - ax) * dx + (ez - az) * dz) / l2; if (t < 0 || t > 1) continue;
          const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(ex - px, ez - pz);
          if (d < 7 && (!best || d < best.d)) best = { q, k, t, d, px, pz };
        }
      });
      if (!best) continue;
      const q = best.q, s = q.cum[best.k] + best.t * (q.cum[best.k + 1] - q.cum[best.k]);
      // snap to an existing split on q if close
      let node = null;
      for (const sp of q.splits) if (Math.abs(sp.s - s) < 6) { node = sp.node; break; }
      if (!node) { node = nodeAt(best.px, best.pz, 3); q.splits.push({ s, node, x: best.px, z: best.pz }); }
      // re-point this road's end split to that node
      const sp = p.splits.find(sp => sp.s === (end === 0 ? 0 : p.len));
      if (sp && sp.node !== node) sp.node = node;
      p.pts[end] = [node.x, node.z];
    }
  });

  // ---------------- edges
  const edges = [];
  for (const p of polys) {
    p.splits.sort((a, b) => a.s - b.s);
    const sp = [];
    for (const s of p.splits) if (!sp.length || s.s - sp[sp.length - 1].s > 0.8) sp.push(s); else if (s.node !== sp[sp.length - 1].node) sp[sp.length - 1].node = sp[sp.length - 1].node; // merge near-duplicates
    for (let q = 0; q < sp.length - 1; q++) {
      const s0 = sp[q].s, s1 = sp[q + 1].s, na = sp[q].node, nb = sp[q + 1].node;
      if (na === nb) continue;
      const pts = [[na.x, na.z]];
      const ys = p.ys ? [interpAlong(p, s0, p.ys)] : null;
      for (let k = 0; k < p.pts.length; k++) if (p.cum[k] > s0 + 0.5 && p.cum[k] < s1 - 0.5) { pts.push(p.pts[k].slice()); if (ys) ys.push(p.ys[k]); }
      pts.push([nb.x, nb.z]); if (ys) ys.push(interpAlong(p, s1, p.ys));
      const e = makeEdge(edges.length, na, nb, pts, p, ys);
      edges.push(e); na.edges.push(e); nb.edges.push(e);
    }
  }
  // ---------------- cleanup: short dead-end stubs (crossing overshoot), except map-boundary terminals
  const isTerminal = n => n.x < PLAY.minX + 40 || n.x > PLAY.maxX - 40 || n.z < PLAY.minZ + 40 || n.z > PLAY.maxZ - 30;
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.dead || n.edges.length !== 1 || isTerminal(n)) continue;
      const e = n.edges[0];
      if (e.len < 75 && !e.deck) {
        e.dead = true; n.dead = true; n.edges = [];
        const o = e.a === n ? e.b : e.a; o.edges = o.edges.filter(x => x !== e);
        changed = true;
      }
    }
  }
  const liveEdges = edges.filter(e => !e.dead);
  const liveNodes = nodes.filter(n => !n.dead && n.edges.length);
  liveNodes.forEach((n, i) => { n.id = i; });
  liveEdges.forEach((e, i) => { e.id = i; });
  // node properties: degree, plateau radius (max half width of incident roads), traffic signals
  for (const n of liveNodes) {
    n.deg = n.edges.length;
    n.radius = Math.max(...n.edges.map(e => e.width / 2)) + 1.5;
    const wide = n.edges.filter(e => e.width >= 14).length;
    n.signal = n.deg >= 3 && wide >= 3 && !n.edges.some(e => e.deck);
    n.stop = n.deg >= 3 && !n.signal;
  }
  const graph = { nodes: liveNodes, edges: liveEdges, polys };
  graph.nearestEdge = makeNearestEdge(graph);
  return graph;
}

function interpAlong(p, s, ys) {
  for (let k = 0; k < p.cum.length - 1; k++) if (s <= p.cum[k + 1] + 1e-6) { const t = (s - p.cum[k]) / ((p.cum[k + 1] - p.cum[k]) || 1); return ys[k] + (ys[k + 1] - ys[k]) * Math.max(0, Math.min(1, t)); }
  return ys[ys.length - 1];
}

function makeEdge(id, a, b, pts, p, ys) {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const w = p.width;
  const lanes = p.kind === 'crooked' ? 1 : w >= 18 ? (p.kind === 'bridge' && w >= 20 ? 3 : 2) : w >= 14 ? 2 : 1;
  const median = w >= 20 && p.kind !== 'bridge' ? 1.5 : 0.15;
  const laneW = p.kind === 'crooked' ? w : Math.min(3.6, (w / 2 - median - (w <= 12 ? 2.2 : 0.4)) / lanes);
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  let name = p.name;
  if (p.grid) name = gridStreetName(p.axis, p.line, mx, mz);
  return {
    id, a, b, pts, ys, cum, len: cum[cum.length - 1], width: w, name, kind: p.kind, grid: p.grid, deck: p.deck || null,
    lanes, laneW, median, oneway: p.kind === 'crooked' ? 1 : 0, trees: p.trees, special: p.special || null,
  };
}

function segIntersect(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0], d1z = p2[1] - p1[1], d2x = p4[0] - p3[0], d2z = p4[1] - p3[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const ex = p3[0] - p1[0], ez = p3[1] - p1[1];
  const t = (ex * d2z - ez * d2x) / den, u = (ex * d1z - ez * d1x) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [p1[0] + d1x * t, p1[1] + d1z * t, Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
}

// ---------------- edge utilities
export function edgePointAt(e, s, out = {}) {
  const c = e.cum;
  if (s <= 0) { out.x = e.pts[0][0]; out.z = e.pts[0][1]; setDir(e, 0, out); out.y = e.ys ? e.ys[0] : undefined; return out; }
  if (s >= e.len) { const n = e.pts.length - 1; out.x = e.pts[n][0]; out.z = e.pts[n][1]; setDir(e, n - 1, out); out.y = e.ys ? e.ys[n] : undefined; return out; }
  let k = 0; while (k < c.length - 2 && c[k + 1] < s) k++;
  const t = (s - c[k]) / ((c[k + 1] - c[k]) || 1);
  out.x = e.pts[k][0] + (e.pts[k + 1][0] - e.pts[k][0]) * t;
  out.z = e.pts[k][1] + (e.pts[k + 1][1] - e.pts[k][1]) * t;
  out.y = e.ys ? e.ys[k] + (e.ys[k + 1] - e.ys[k]) * t : undefined;
  setDir(e, k, out);
  return out;
}
function setDir(e, k, out) {
  const a = e.pts[k], b = e.pts[Math.min(k + 1, e.pts.length - 1)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  out.dx = (b[0] - a[0]) / l; out.dz = (b[1] - a[1]) / l;
}
// nearest edge to a point: {edge, s, dist, x, z}
export function makeNearestEdge(graph) {
  const C = 48, hash = new Map();
  for (const e of graph.edges) {
    for (let k = 0; k < e.pts.length - 1; k++) {
      const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1];
      const r = e.width / 2 + 2;
      const x0 = Math.floor((Math.min(ax, bx) - r) / C), x1 = Math.floor((Math.max(ax, bx) + r) / C);
      const z0 = Math.floor((Math.min(az, bz) - r) / C), z1 = Math.floor((Math.max(az, bz) + r) / C);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const key = cx * 100003 + cz; let arr = hash.get(key); if (!arr) hash.set(key, arr = []); arr.push([e, k]);
      }
    }
  }
  graph.edgeHash = hash; graph.edgeHashCell = C;
  return function nearest(x, z, maxDist = 60, filter = null) {
    let best = null;
    const r = Math.ceil(maxDist / C);
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const arr = hash.get((cx + a) * 100003 + (cz + b));
      if (!arr) continue;
      for (const [e, k] of arr) {
        if (filter && !filter(e)) continue;
        const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1];
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d <= maxDist && (!best || d < best.dist)) best = { edge: e, s: e.cum[k] + t * (e.cum[k + 1] - e.cum[k]), dist: d, x: px, z: pz, k };
      }
    }
    return best;
  };
}

// A* over nodes (binary heap; fine for the 22k-node real map). returns array of {edge, forward} or null
const KIND_COST = { highway: 0.72, bridge: 0.8, arterial: 0.86, boulevard: 0.86, street: 1, alley: 1.7, crooked: 3, mountain: 1.8, plaza: 2.6, park: 1.15 };
export function findRoute(graph, fromNode, toNode, opts = {}) {
  if (!fromNode || !toNode) return null;
  if (fromNode === toNode) return [];
  const N = graph.nodes.length;
  // per-graph scratch arrays, reset lazily with a stamp
  const S = graph._astar || (graph._astar = { g: new Float64Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), prevE: new Array(N), prevN: new Int32Array(N), run: 0 });
  const run = ++S.run;
  const hx = toNode.x, hz = toNode.z, h = n => Math.hypot(n.x - hx, n.z - hz) * 0.72;
  const heap = [], hf = [];
  const push = (id, f) => { heap.push(id); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = last; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  const avoid = opts.avoid, allowRestricted = opts.allowRestricted ?? true;
  S.g[fromNode.id] = 0; S.stamp[fromNode.id] = run; S.prevN[fromNode.id] = -1;
  push(fromNode.id, h(fromNode));
  let iter = 0;
  while (heap.length && iter++ < 400000) {
    const cid = pop();
    if (S.closed[cid] === run) continue;
    S.closed[cid] = run;
    const cur = graph.nodes[cid];
    if (cur === toNode) {
      const path = []; let n = cid;
      while (S.prevN[n] >= 0) { const e = S.prevE[n], pn = S.prevN[n]; path.push({ edge: e, forward: e.a.id === pn }); n = pn; }
      return path.reverse();
    }
    const gc = S.g[cid];
    for (const e of cur.edges) {
      const wrongWay = e.oneway && e.a !== cur;
      if (wrongWay && !opts.onewayCost) continue;
      if (avoid && avoid(e)) continue;
      if (e.restricted && !allowRestricted) continue;
      const nb = e.a === cur ? e.b : e.a;
      if (S.closed[nb.id] === run) continue;
      const cost = e.len * (KIND_COST[e.kind] ?? 1) * (e.restricted ? 1.8 : 1) * (wrongWay ? opts.onewayCost : 1) * (opts.minWidth && e.width < opts.minWidth ? 2.5 : 1) + (nb.signal ? 6 : nb.stop ? 3 : 0);
      const ng = gc + cost;
      if (S.stamp[nb.id] !== run || ng < S.g[nb.id]) { S.stamp[nb.id] = run; S.g[nb.id] = ng; S.prevE[nb.id] = e; S.prevN[nb.id] = cid; push(nb.id, ng + h(nb)); }
    }
  }
  return null;
}

// edges whose midpoint lies in the ring [r0, r1] around (x, z), via the edge hash (fast spawn queries)
export function edgesInRing(graph, x, z, r0, r1, out = []) {
  out.length = 0;
  const C = graph.edgeHashCell, R = Math.ceil(r1 / C);
  const cx = Math.floor(x / C), cz = Math.floor(z / C);
  const seen = graph._ringSeen || (graph._ringSeen = new Set());
  seen.clear();
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    const arr = graph.edgeHash.get((cx + a) * 100003 + (cz + b));
    if (!arr) continue;
    for (const [e] of arr) {
      if (seen.has(e)) continue; seen.add(e);
      const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2, d = Math.hypot(mx - x, mz - z);
      if (d >= r0 && d <= r1) out.push(e);
    }
  }
  return out;
}
