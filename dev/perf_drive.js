// Dev hitch profiler (load in the game page: await import('http://127.0.0.1:5190/dev/perf_drive.js')).
//   __route(pts)                 -> street route (A* over the graph) through [[x,z], ...] as a dense polyline
//   await __perfDrive(opts)      -> moves the player's car along the route at opts.speed m/s (default 60), one frame per
//                                   1/60 s, GPU-synced; returns { n, hist, p50, p99, max, worst: [{f, ms, parts}] , heap }
//   await __perfTeleport(x, z)   -> teleport + 180 frames; same stats
// Frame time = frame() + 1 px readback (GPU sync) + any task that ran between frames (worker replies, fetch callbacks).
const W = window;
function astar(g, a, b) {
  const N = g.nodes.length, gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), pe = new Array(N), closed = new Uint8Array(N);
  const heap = []; const push = (id, f) => { heap.push([f, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < heap.length && heap[L][0] < heap[m][0]) m = L; if (R < heap.length && heap[R][0] < heap[m][0]) m = R; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t[1]; };
  gs[a.id] = 0; push(a.id, 0);
  while (heap.length) {
    const c = pop(); if (closed[c]) continue; closed[c] = 1; if (c === b.id) break;
    for (const e of g.nodes[c].edges) { if (e.tunnel || e.kind === 'alley' || e.kind === 'plaza' || e.kind === 'park') continue; const nb = e.a.id === c ? e.b : e.a, ng = gs[c] + e.len;
      if (ng < gs[nb.id]) { gs[nb.id] = ng; prev[nb.id] = c; pe[nb.id] = e; push(nb.id, ng + Math.hypot(nb.x - b.x, nb.z - b.z)); } }
  }
  const out = []; let n = b.id; while (prev[n] >= 0) { const e = pe[n], fwd = e.a.id === prev[n]; const P = fwd ? e.pts : [...e.pts].reverse(); out.unshift(...P.slice(1)); n = prev[n]; }
  return out;
}
W.__route = pts => {
  const g = W.__world.graph, near = (x, z) => { let best = null, bd = Infinity; for (const n of g.nodes) { if (!n.edges.some(e => !e.tunnel && (e.kind === 'street' || e.kind === 'arterial' || e.kind === 'boulevard'))) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) { const a = near(...pts[i]), b = near(...pts[i + 1]); if (!out.length) out.push([a.x, a.z]); out.push(...astar(g, a, b)); }
  return out;
};
const yieldTask = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
// wrap hot entry points so a hitch frame can be attributed
function instrument() {
  if (W.__perfParts) return W.__perfParts;
  const parts = {}, wrap = (obj, key, name) => { if (!obj || typeof obj[key] !== 'function') return; const f = obj[key]; obj[key] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { parts[name] = (parts[name] || 0) + performance.now() - t; } }; };
  const w = W.__world;
  wrap(w.stream, 'update', 'stream'); wrap(w.gtiles, 'update', 'gtiles'); wrap(w.buildings, 'update', 'bld'); wrap(w.props, 'update', 'props');
  wrap(w.landmarks, 'update', 'lm'); wrap(w.grass, 'update', 'grass'); wrap(w.water, 'update', 'water'); wrap(W.__G, 'update', 'game');
  wrap(W.__renderer, 'render', 'render'); wrap(W.__renderer, 'compile', 'compile');
  for (const p of w.stream.providers) { wrap(p, 'load', 'ld:' + p.name); wrap(p, 'unload', 'ul:' + p.name); wrap(p, 'update', 'up:' + p.name); }
  const G = W.__G; wrap(G.traffic, 'update', 'traffic'); wrap(W.__sim, 'step', 'sim'); wrap(W.__env, 'update', 'env'); wrap(G.hud, 'update', 'hud');
  G.systems.forEach((s, i) => wrap(s, 'update', 'sys' + i + ':' + (s.name || s.id || '')));
  wrap(w.gtiles?.tiles, 'update', 'tiles.update');
  wrap(w.gtiles?.tiles?.group, 'updateMatrixWorld', 'tiles.umw');
  wrap(W.__scene, 'updateMatrixWorld', 'scene.umw');
  // long-animation-frame attribution for work that runs between our frames (timers, worker replies, GC shows as no script)
  W.__loaf = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 60) W.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), blk: Math.round(e.blockingDuration || 0),
    s: (e.scripts || []).filter(s => s.duration > 20).map(s => `${Math.round(s.duration)}ms ${s.invoker} ${s.sourceFunctionName}@${(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition}`) }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) { W.__loaf.push(String(e)); }
  // big first-time buffer uploads: remember the attribute, name its owner on hitch frames
  W.__upl = new Set();
  { let m = null; W.__scene.traverse(o => { if (!m && o.isMesh && o.geometry?.attributes?.position) m = o; });
    const BA = Object.getPrototypeOf(Object.getPrototypeOf(m.geometry.attributes.position));
    BA.onUploadCallback = function () { if (this.array?.byteLength > 1e6) W.__upl.add(this); }; }
  // slowest single draw of the frame (object + material): stalls inside render() with no upload / compile call
  { const r = W.__renderer, f = r.renderBufferDirect;
    r.renderBufferDirect = function (cam, scene, geo, mat, obj, group) { const t = performance.now(); try { return f.apply(this, arguments); } finally { const d = performance.now() - t; if (d > (W.__slowDraw?.ms || 3)) { let p = obj, nm = obj.name || obj.type; while (p.parent && p.parent !== W.__scene) { p = p.parent; } W.__slowDraw = { ms: +d.toFixed(0), obj: (p.name || p.type) + '/' + nm, mat: (mat.name || mat.type) + ':' + (mat.customProgramCacheKey?.() || '') }; } } };
    const sm = r.shadowMap, sr = sm.render; sm.render = function () { const t = performance.now(); try { return sr.apply(this, arguments); } finally { parts.shadow = (parts.shadow || 0) + performance.now() - t; } };
  }
  const gl = W.__renderer.getContext();
  for (const k of ['texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'texStorage2D', 'linkProgram', 'bufferData', 'compileShader', 'getProgramParameter']) wrap(gl, k, 'gl.' + k);
  return (W.__perfParts = parts);
}
async function step(rec, fi, move) {
  const parts = instrument(); for (const k in parts) parts[k] = 0;
  const gl = W.__renderer.getContext(), px = new Uint8Array(4), info = W.__renderer.info;
  const p0 = info.programs?.length || 0, t0 = info.memory.textures, g0 = info.memory.geometries;
  W.__slowDraw = null;
  const ta = performance.now();
  // GPU time of the frame (EXT_disjoint_timer_query_webgl2; results land a few frames later)
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'); let q = null;
  if (tq) { rec.gq = rec.gq || []; for (let i = rec.gq.length - 1; i >= 0; i--) { const o = rec.gq[i]; if (gl.getQueryParameter(o, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) (rec.gpu = rec.gpu || []).push(gl.getQueryParameter(o, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(o); rec.gq.splice(i, 1); } }
    if (!rec.qOpen) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); } }
  move?.();
  W.__frame(1 / 60);
  if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); rec.gq.push(q); }
  // (9/30) queries whose result never arrives (hidden tab: no present) piled up and every frame polled all of them:
  // after ~10 k frames each step took ~1 s. Keep the newest 24.
  if (rec.gq?.length > 24) for (const o of rec.gq.splice(0, rec.gq.length - 24)) gl.deleteQuery(o);
  const tj = performance.now();
  (rec.js = rec.js || []).push(tj - ta);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const tb = performance.now();
  await yieldTask();
  const tc = performance.now();
  const ms = tb - ta + Math.max(0, tc - tb - 1);
  rec.ms.push(ms);
  let upl = null;
  if (W.__upl.size && ms > 33) {
    upl = {}; const S = W.__upl;
    W.__scene.traverse(o => { const g = o.geometry; if (!g) return; let b = 0; for (const k in g.attributes) if (S.has(g.attributes[k])) b += g.attributes[k].array.byteLength; if (g.index && S.has(g.index)) b += g.index.array.byteLength;
      if (b) { let p = o, nm = o.name; while (p.parent && p.parent !== W.__scene) { p = p.parent; nm = (p.name || p.type) + '/' + nm; } upl[nm] = +((upl[nm] || 0) + b / 1e6).toFixed(1); } });
  }
  W.__upl.clear();
  const hp = performance.memory?.usedJSHeapSize || 0, dh = rec.hp ? Math.round((hp - rec.hp) / 1e6) : 0; rec.hp = hp;
  if (hp && fi > 60) { rec.hmin = Math.min(rec.hmin ?? Infinity, hp); rec.hmax = Math.max(rec.hmax ?? 0, hp); }   // GC valleys = live heap
  if (ms > 33) rec.worst.push({ f: fi, t: Math.round(ta), ms: +ms.toFixed(0), cpu: +(tb - ta).toFixed(0), js: +(tj - ta).toFixed(0), upl, slow: W.__slowDraw || null, between: +(tc - tb).toFixed(0), dHeap: dh, prog: (info.programs?.length || 0) - p0, tex: info.memory.textures - t0, geo: info.memory.geometries - g0,
    parts: Object.fromEntries(Object.entries(parts).filter(([, v]) => v > 3).map(([k, v]) => [k, +v.toFixed(0)])) });
}
function summarize(rec) {
  const s = [...rec.ms].sort((a, b) => a - b), q = p => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
  const bins = [16.7, 33, 50, 100, 200, 500, 1000, Infinity], hist = {};
  for (const b of bins) hist[b === Infinity ? '>1000' : '<=' + b] = 0;
  for (const v of rec.ms) { const b = bins.find(x => v <= x); hist[b === Infinity ? '>1000' : '<=' + b]++; }
  rec.worst.sort((a, b) => b.ms - a.ms);
  const pq = (arr, p) => { if (!arr?.length) return null; const a = [...arr].sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(p * a.length))].toFixed(2); };
  return { n: s.length, cpuP50: pq(rec.js, 0.5), cpuP95: pq(rec.js, 0.95), gpuP50: pq(rec.gpu, 0.5), gpuP95: pq(rec.gpu, 0.95), gpuN: rec.gpu?.length || 0, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over50: rec.ms.filter(v => v > 50).length, hist, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
    heapMinMB: rec.hmin ? Math.round(rec.hmin / 1e6) : null, heapMaxMB: rec.hmax ? Math.round(rec.hmax / 1e6) : null, gpu: W.__renderer.info.memory,
    programs: W.__renderer.info.programs?.length, tex: W.__renderer.info.memory.textures, worst: rec.worst.slice(0, 12) };
}
W.__perfDrive = async ({ route, speed = 60, maxFrames = 1e9, onProgress } = {}) => {
  W.__manual = true;
  const v = W.__player.vehicle; if (!v) throw new Error('no car');
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = cum[cum.length - 1], rec = { ms: [], worst: [] };
  let s = 0, k = 0, fi = 0;
  while (s < total && fi < maxFrames) {
    s += speed / 60; while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = route[k], b = route[k + 1];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    await step(rec, fi++, () => { v.place(x, W.__world.groundAt(x, z, 999) + 0.4, z, yaw); if (v.body?.vel) v.body.vel.set?.(0, 0, 0); });
    if (onProgress && fi % 300 === 0) onProgress(fi, s / total);
  }
  return summarize(rec);
};
W.__perfTeleport = async (x, z, frames = 300) => {
  W.__manual = true; const rec = { ms: [], worst: [] };
  await step(rec, 0, () => W.__teleport(x, z));
  for (let i = 1; i < frames; i++) await step(rec, i);
  return summarize(rec);
};

// night headlight staging (before/after shots): camera on a street lane, six traffic cars parked in view with lights
// on (close oncoming car angled toward the camera = the old glare worst case)
W.__stage = (x, z, name, angled = true) => {
  let e = null, bd = 1e18;
  for (const q of W.__world.graph.edges) { if (q.width < 10 || q.kind === 'highway' || q.len < 160 || q.tunnel || q.deck || (name && q.name !== name)) continue; const m = q.pts[Math.floor(q.pts.length / 2)]; const d = (m[0] - x) ** 2 + (m[1] - z) ** 2; if (d < bd) { bd = d; e = q; } }
  const at = (s, off) => { let k = 0; while (k < e.cum.length - 2 && e.cum[k + 1] < s) k++; const t = (s - e.cum[k]) / ((e.cum[k + 1] - e.cum[k]) || 1), a = e.pts[k], b = e.pts[k + 1]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz); dx /= L; dz /= L; return { x: a[0] + (b[0] - a[0]) * t - dz * off, z: a[1] + (b[1] - a[1]) * t + dx * off, dx, dz }; };
  const s0 = 20, cam = at(s0, 1.6), look = at(s0 + 80, 0.5), lw = e.laneW || 3.3;
  const cars = W.__G.traffic.cars.map(c => c.v).filter(v => v.ai).slice(0, 6);
  const spots = [[s0 + 6, -lw * 0.5, 1], [s0 + 16, lw * 0.6, 0], [s0 + 26, -lw * 0.6, 1], [s0 + 45, -lw * 0.6, 1], [s0 + 70, lw * 0.6, 0], [s0 + 100, -lw * 0.6, 1]];
  cars.forEach((v, i) => { const [s, off, onc] = spots[i]; const p = at(s, off); const yaw = Math.atan2(onc ? p.dx : -p.dx, onc ? p.dz : -p.dz); v.place(p.x, W.__world.groundAt(p.x, p.z, 999) + 0.3, p.z, yaw); v.ai.state = 'stopped'; v.ai.wps.length = 0; v.ai.deadEnd = true; });
  W.__teleport(cam.x - cam.dx * 40, cam.z - cam.dz * 40);
  W.__look(cam.x, W.__world.groundAt(cam.x, cam.z, 999) + 1.4, cam.z, look.x, W.__world.groundAt(look.x, look.z, 999) + 1.2, look.z);
  if (angled && cars[0]) {       // first car: 20 % closer, 1.2 m left, turned 0.45 rad
    const v = cars[0], p = v.pos, cp = W.__freeCam, yaw = Math.atan2(at(0, 0).dx, at(0, 0).dz) + 0.45;
    v.place(cp.x + (p.x - cp.x) * 0.8 - 1.2, W.__world.groundAt(p.x, p.z, 999) + 0.3, cp.z + (p.z - cp.z) * 0.8, yaw);
  }
  return e.name;
};
