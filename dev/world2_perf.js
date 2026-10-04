// headless body for dev/car3cdp.mjs: frame-time / GPU / GPU-memory report at 1920x1080 for 5 districts, each a ~700-frame
// drive (15 m/s, GPU-synced frames, real wall time) on a local route. Use ?q=high&memtrack&mute&prologue=0[&tiles=..].
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&memtrack" dev/world2_perf.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'gpu.js', 'perf_drive.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
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
await W.__shot('perf_1080_warm', 1920, 1080);                  // renderer + post at 1920 x 1080 (stays)
const out = { size: [W.__renderer.domElement.width, W.__renderer.domElement.height], q: W.__G.quality?.name || W.__G.quality, spots: {} };
for (const [nm, pts] of Object.entries(ROUTES)) {
  const route = W.__route(pts.map(p => LL(...p)));
  const [x, z] = route[0];
  W.__teleport(x, z); W.__hbSafe?.(x, z); await W.__bld5Settle(); W.__teleport(x, z); await W.__bld5Settle(20);
  for (let i = 0; i < 60; i++) { W.__frames(1); await tick(); }
  const r = await W.__perfDrive({ route, speed: 15, maxFrames: 700 });
  const t = W.__gpumemTotals?.() || {};
  out.spots[nm] = { n: r.n, p50: r.p50, p95: r.p95, p99: r.p99, max: r.max, over50: r.over50, cpuP50: r.cpuP50, gpuP50: r.gpuP50, gpuP95: r.gpuP95, gpuMemMB: t.totalMB, texMB: t.texMB, bufMB: t.bufMB, heapMB: r.heapMB,
    worst: r.worst.slice(0, 3).map(w => ({ ms: w.ms, parts: w.parts })) };
}
return out;
