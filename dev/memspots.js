// dev: GPU-memory / perf report at 5 spots + a long drive memory trend. Needs ?memtrack (dev/memtrack.js) for GL byte totals.
//   await __memSpots()            -> [{ pl, totalMB, texMB, rbMB, bufMB, gpuMs, heapMB }]
//   __memDrive({ frames })        -> starts a city loop (not awaited); poll window.__memLog / window.__memDriveResult
const D = 'http://127.0.0.1:5190/dev/';
const V = '?v=' + Date.now(); await import(D + 'cityshots.js' + V); await import(D + 'gpu.js' + V); await import(D + 'perf_drive.js' + V);
const { ll } = await import('http://127.0.0.1:5190/src/world/latlon.js');
const W = window;
const P = W.__cityPlaces;
const st = (lat, lon) => { const [x, z] = ll(lat, lon); return { street: [x, z, { h: 2.2 }] }; };
P.unionsq = st(37.78795, -122.40750);
// hidden pages get intensive timer throttling (chained setTimeout ~1/min after 5 min): yield through MessageChannel instead
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const wait = async ms => { const t = performance.now() + ms; while (performance.now() < t) await tick(); };
W.__wait = wait;
async function settle() { const b = W.__world.buildings, s = W.__world.stream; for (let k = 0; k < 80; k++) { W.__frames(10); await wait(60); const q = b.stats; if (k > 6 && !q.queued && !q.inflight && !s.stats.pending) break; } W.__frames(30); }
const heap = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
W.__memSpots = async (spots = ['unionsq', 'fidi', 'mission', 'sunset', 'tpeaks']) => {
  W.__manual = true; const out = [];
  for (const pl of spots) { W.__placeCam(pl); await settle(); W.__placeCam(pl); W.__frames(20); const t = W.__gpumemTotals?.() || {}; const gpu = await W.__gpu(40);
    out.push({ pl, ts: Math.round(Date.now() / 1000), totalMB: t.totalMB, texMB: t.texMB, rbMB: t.rbMB, bufMB: t.bufMB, gpuMs: gpu, heapMB: heap(), tris: W.__renderer.info.render.triangles }); }
  return out;
};
W.__memRoute = () => W.__route([[37.80165, -122.41885], [37.78795, -122.40750], [37.7946, -122.3990], [37.7600, -122.4148], [37.7609, -122.4350], [37.7525, -122.4475], [37.7600, -122.4960], [37.7700, -122.4800], [37.7990, -122.4600], [37.8030, -122.4370], [37.80165, -122.41885]].map(([a, b]) => ll(a, b)));
W.__memDrive = ({ frames = 36000, speed = 22 } = {}) => {
  W.__look?.(null); W.__memLog = []; W.__memDriveResult = null; const r = W.__memRoute(); const loop = []; while (loop.length < 40000 && r.length) loop.push(...r);
  const t0 = performance.now();
  W.__perfDrive({ route: loop, speed, maxFrames: frames, onProgress: (fi) => { if (fi % 1800 === 0 || fi === 300) { const t = W.__gpumemTotals?.() || {}; W.__memLog.push({ fi, min: +(fi / 3600).toFixed(1), wallS: Math.round((performance.now() - t0) / 1000), totalMB: t.totalMB, texMB: t.texMB, bufMB: t.bufMB, heapMB: heap() }); } } })
    .then(s => { W.__memDriveResult = s; }, e => { W.__memDriveResult = { err: String(e) }; });
  return r.length;
};
// run __memSpots and POST the result to shots/<name>.jpg (JSON) so a shell can wait for it
W.__memSpotsPost = (name, spots) => W.__memSpots(spots).then(r => fetch('/__shot?name=' + name, { method: 'POST', body: btoa(JSON.stringify({ q: W.__G.quality, r })) }), e => fetch('/__shot?name=' + name, { method: 'POST', body: btoa(JSON.stringify({ err: String(e) })) }));
