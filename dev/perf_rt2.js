// headless body for dev/car3cdp.mjs (run with HB_UNCAP=1): REAL-TIME frame rate like dev/perf_rt.js (the game's own rAF loop,
// dynres off) plus per-frame attribution: frame CPU, GPU time (one TIME_ELAPSED query per frame), draw calls (renderer.info
// summed over the frame), physics steps, and the hooked parts of every frame > 25 ms (tiles / stream loads / sim / render ...),
// and the gap between frames (tasks that ran outside frame(): tile parses, worker replies, GC).
//   HB_UNCAP=1 node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high#d=mission&secs=30&v=45" dev/perf_rt2.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'perf_drive.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1)), SECS = +(H.get('secs') || 30), SPD = +(H.get('v') || 45), SLOW = +(H.get('slow') || 25);
const ROUTES = {
  mission: [[37.7524, -122.4184], [37.7650, -122.4216]],
  fidi: [[37.7932, -122.4024], [37.7890, -122.4010], [37.7915, -122.3985]],
  chinatown: [[37.7934, -122.4078], [37.7978, -122.4058]],
  sunset: [[37.7613, -122.4885], [37.7637, -122.4775]],
  twinpeaks: [[37.7525, -122.4475], [37.7576, -122.4468]],
};
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = 15.5; W.__env.state.paused = true; W.__look(null);
if (W.__G.dynres) W.__G.dynres.enabled = H.get('dynres') === '1';
await W.__shot('perf_1080_warm', 1920, 1080);
// per-frame part timers (light: no gl wraps)
const TRACE = H.get('trace') === '1';
const parts = {}, wrap = (obj, key, name) => { if (!obj || typeof obj[key] !== 'function') return; const f = obj[key]; obj[key] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; parts[name] = (parts[name] || 0) + d; if (TRACE && d > 0.5) performance.measure(name, { start: t, duration: d }); } }; };
{ const w = W.__world, G = W.__G;
  wrap(w.stream, 'update', 'stream'); wrap(w.gtiles, 'update', 'gtiles'); wrap(w.gtiles?.tiles, 'update', 'tiles.update');
  for (const p of w.stream.providers) { wrap(p, 'load', 'ld:' + p.name); wrap(p, 'unload', 'ul:' + p.name); wrap(p, 'update', 'up:' + p.name); }
  wrap(w.buildings, 'update', 'bld'); wrap(w.props, 'update', 'props'); wrap(w.landmarks, 'update', 'lm'); wrap(w.grass, 'update', 'grass'); wrap(w.water, 'update', 'water');
  wrap(G, 'update', 'game'); wrap(G.traffic, 'update', 'traffic'); wrap(W.__sim, 'step', 'sim'); wrap(W.__env, 'update', 'env'); wrap(w, 'update', 'world');
  G.systems.forEach((s, i) => wrap(s, 'update', 'sys' + i + ':' + (s.name || s.id || '')));
  wrap(W.__scene, 'updateMatrixWorld', 'scene.umw');
  const sm = W.__renderer.shadowMap; wrap(sm, 'render', 'shadow');
  // physics steps per frame
  const sim = W.__sim; let steps = 0; const ops = sim.onPreStep; sim.onPreStep = function () { steps++; return ops?.apply(this, arguments); }; W.__simSteps = () => { const s = steps; steps = 0; return s; };
}
// long tasks outside our frames
const loaf = []; let loafOn = false;
try { new PerformanceObserver(l => { if (loafOn) for (const e of l.getEntries()) loaf.push(e); }).observe({ type: 'long-animation-frame', buffered: false }); } catch { /* */ }
const gl = W.__renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), info = W.__renderer.info;
const out = { size: [W.__renderer.domElement.width, W.__renderer.domElement.height], v: SPD, spots: {} };
for (const nm of (H.get('d') || Object.keys(ROUTES).join(',')).split(',')) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s) => { s = s % (2 * total); if (s > total) s = 2 * total - s; let k = 0; while (k < cum.length - 2 && cum[k + 1] < s) k++; const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = route[k], b = route[k + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))]; };
  const [x, z] = route[0];
  W.__teleport(x, z); W.__hbSafe?.(x, z); await W.__bld5Settle(); W.__teleport(x, z); await W.__bld5Settle(20);
  const v = W.__player.vehicle; let s = 0, last = 0;
  const F = []; let cur = null, tf0 = 0, rec = false; const qs = [];
  W.__autopilot = (input, dt) => {
    tf0 = performance.now(); for (const k in parts) parts[k] = 0; W.__simSteps();
    info.autoReset = false; info.reset();
    if (tq && rec) { const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); cur = { q }; } else cur = {};
    s += SPD * dt; const [px, pz, yaw] = at(s); v.place(px, W.__world.groundAt(px, pz, 999) + 0.4, pz, s % (2 * total) > total ? yaw + Math.PI : yaw); if (v.body?.vel) v.body.vel.set?.(0, 0, 0);
  };
  const g0 = W.__G.post.render; W.__G.post.render = function (dt) {
    const r = g0.call(this, dt); const t1 = performance.now();
    if (cur?.q) { gl.endQuery(tq.TIME_ELAPSED_EXT); qs.push(cur); }
    if (rec && cur && t1 - tf0 > (W.__spikeMs || 1e9)) (W.__longFrames = W.__longFrames || []).push([tf0, t1, Object.entries(parts).filter(e => e[1] > 2).map(e => e[0] + ' ' + e[1].toFixed(1)).join(', ')]);
    if (rec && cur) { cur.gap = W.__lastEnd ? tf0 - W.__lastEnd : 0; W.__lastEnd = t1; cur.cpu = t1 - tf0; cur.t0 = tf0; cur.dt = dt; cur.calls = info.render.calls; cur.tris = info.render.triangles; cur.steps = W.__simSteps(); cur.parts = { ...parts }; F.push(cur); }
    info.autoReset = true; cur = null;
    for (let i = 0; i < qs.length; i++) { const o = qs[i]; if (!o.q) continue; if (gl.getQueryParameter(o.q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) o.gpu = gl.getQueryParameter(o.q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(o.q); o.q = null; } }
    return r;
  };
  W.__manual = false;
  await new Promise(r => setTimeout(r, 3000));      // warm in real time
  // trace mode (dev/trace_cdp.mjs): leave the drive running; the driver records SECS of Chrome trace via __traceRun
  if (TRACE) { rec = true; W.__spikeMs = +(H.get('spike') || 1e9); W.__traceRun = () => new Promise(r => setTimeout(() => { rec = false; W.__manual = true; W.__autopilot = null; r({ frames: 1 }); }, SECS * 1000)); return { trace: nm }; }
  rec = true; loaf.length = 0; loafOn = true;
  const iv = [], ivT = [];
  await new Promise(res => { const t0 = performance.now(); const tick = (t) => { if (last) { iv.push(t - last); ivT.push(t); } last = t; if (t - t0 < SECS * 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  rec = false; loafOn = false;
  W.__manual = true; W.__autopilot = null; W.__G.post.render = g0; info.autoReset = true;
  for (let k = 0; k < 20 && qs.some(o => o.q); k++) { await new Promise(r => setTimeout(r, 20)); for (const o of qs) if (o.q && gl.getQueryParameter(o.q, gl.QUERY_RESULT_AVAILABLE)) { o.gpu = gl.getQueryParameter(o.q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(o.q); o.q = null; } }
  for (const o of qs) if (o.q) { gl.deleteQuery(o.q); o.q = null; }
  qs.length = 0;
  const q = (a, p) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(1) : null; };
  // slow frames: attribute (top parts), plus intervals > SLOW with what ran between
  const slow = [];
  for (let i = 0; i < iv.length; i++) if (iv[i] > SLOW) {
    const t = ivT[i], f = F.filter(o => o.t0 < t && o.t0 > t - iv[i] - 2).pop();
    const top = f ? Object.entries(f.parts).filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 7).map(e => e[0] + ' ' + e[1].toFixed(1)).join(', ') : '';
    const lo = loaf.filter(e => e.startTime < t && e.startTime + e.duration > t - iv[i]).flatMap(e => (e.scripts || []).filter(s => s.duration > 3).map(s => `${Math.round(s.duration)} ${s.invoker}`.slice(0, 80)));
    slow.push(`${iv[i].toFixed(0)}ms cpu ${f ? f.cpu.toFixed(1) : '?'} gap ${f?.gap?.toFixed(1) ?? '?'} gpu ${f?.gpu?.toFixed(1) ?? '?'} st ${f?.steps ?? '?'} | ${top}${lo.length ? ' | out: ' + lo.slice(0, 3).join('; ') : ''}`);
  }
  const avgPart = {}, maxPart = {}; for (const f of F) for (const k in f.parts) { avgPart[k] = (avgPart[k] || 0) + f.parts[k]; maxPart[k] = Math.max(maxPart[k] || 0, f.parts[k]); }
  const partsMax = Object.fromEntries(Object.entries(maxPart).filter(e => e[1] > 2 && /^(ld|ul|up):|^(stream|gtiles|tiles\.update|sim|props|lm|water|grass|traffic|sys\d+:)/.test(e[0])).map(([k, v]) => [k, +v.toFixed(1)]).sort((a, b) => b[1] - a[1]));
  const partsMean = Object.fromEntries(Object.entries(avgPart).map(([k, v]) => [k, +(v / F.length).toFixed(2)]).filter(e => e[1] > 0.15).sort((a, b) => b[1] - a[1]));
  const stepsHist = {}; for (const f of F) stepsHist[f.steps] = (stepsHist[f.steps] || 0) + 1;
  out.spots[nm] = { frames: iv.length, fps: +(1000 / q(iv, 0.5)).toFixed(1), meanFps: +(1000 * iv.length / iv.reduce((a, b) => a + b, 0)).toFixed(1), p50: q(iv, 0.5), p95: q(iv, 0.95), p99: q(iv, 0.99), max: q(iv, 1), over50: iv.filter(x => x > 50).length, over33: iv.filter(x => x > 33.4).length,
    hist: [10, 14, 17, 20, 25, 33, 40, 50, 1e9].map((b, j, A) => iv.filter(x => x <= b && x > (A[j - 1] || 0)).length).join(' '), gapP50: q(F.map(f => f.gap), 0.5), gapP95: q(F.map(f => f.gap), 0.95),
    cpuP50: q(F.map(f => f.cpu), 0.5), cpuP95: q(F.map(f => f.cpu), 0.95), gpuP50: q(F.map(f => f.gpu), 0.5), gpuP95: q(F.map(f => f.gpu), 0.95), callsP50: q(F.map(f => f.calls), 0.5), trisP50k: Math.round(q(F.map(f => f.tris), 0.5) / 1000),
    steps: stepsHist, partsMean, partsMax, bld: { applyMax: W.__world.buildings?.stats?.applyMax, yardFilterMs: W.__world.buildings?.stats?.yardFilterMs }, slow: slow.slice(0, 40) };
}
return out;
