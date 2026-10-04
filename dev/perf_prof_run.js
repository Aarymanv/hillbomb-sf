// headless body for dev/car3cdp.mjs: per-district profile at 1920x1080 (world2_perf.js routes). For each district: settle at
// the route start, ~700-frame drive (frame p50/p95/p99/max, CPU/GPU p50), then at the drive's end: draw census (main beauty
// render), per-pass GPU sections (dev/perf_prof.js), mean CPU per system over 120 moving frames.
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres#d=mission,fidi&frames=700" dev/perf_prof_run.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'gpu.js', 'perf_drive.js', 'world2_shots.js', 'perf_prof.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1));
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const ROUTES = {
  mission: [[37.7524, -122.4184], [37.7650, -122.4216]],
  fidi: [[37.7932, -122.4024], [37.7890, -122.4010], [37.7915, -122.3985]],
  chinatown: [[37.7934, -122.4078], [37.7978, -122.4058]],
  sunset: [[37.7613, -122.4885], [37.7637, -122.4775]],
  twinpeaks: [[37.7525, -122.4475], [37.7576, -122.4468]],
};
const names = (H.get('d') || Object.keys(ROUTES).join(',')).split(',');
const FR = +(H.get('frames') || 700), PROF = H.get('prof') !== '0'; W.__profDeep = H.get('deep') === '1';
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
W.__manual = true; W.__setWx?.(H.get('wx') || 'clear'); W.__env.state.hours = +(H.get('h') || 15.5); W.__env.state.paused = true; W.__look(null);
if (W.__G.dynres) W.__G.dynres.enabled = false;
await W.__shot('perf_1080_warm', 1920, 1080);
const out = { size: [W.__renderer.domElement.width, W.__renderer.domElement.height], q: W.__G.quality?.preset, spots: {} };
for (const nm of names) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  const [x, z] = route[0];
  W.__teleport(x, z); W.__hbSafe?.(x, z); await W.__bld5Settle(); W.__teleport(x, z); await W.__bld5Settle(20);
  for (let i = 0; i < 60; i++) { W.__frames(1); await tick(); }
  const r = await W.__perfDrive({ route, speed: 15, maxFrames: FR });
  const o = out.spots[nm] = { n: r.n, p50: r.p50, p95: r.p95, p99: r.p99, max: r.max, over50: r.over50, cpuP50: r.cpuP50, gpuP50: r.gpuP50, gpuP95: r.gpuP95, heapMinMB: r.heapMinMB, heapMaxMB: r.heapMaxMB,
    worst: r.worst.slice(0, 4).map(w => ({ ms: w.ms, cpu: w.cpu, js: w.js, between: w.between, prog: w.prog, tex: w.tex, geo: w.geo, slow: w.slow, upl: w.upl, parts: w.parts })) };
  if (PROF) {
    const c = W.__drawCensus(); o.calls = c.tot.calls; o.tris = c.tot.tris; o.mainDraws = c.mainDraws; o.shadowDraws = c.shadowDraws; o.programs = c.tot.programs; o.census = c.rows.slice(0, 40);
    const g = await W.__gpuPass(20); o.gpuFrame = g.total; o.gpuRoll = W.__gpuRoll(g.sections); o.gpuCpu = g.cpu;
    // CPU: keep moving along the last route leg back and forth
    const v = W.__player.vehicle, a = route[Math.max(0, route.length - 40)], b = route[route.length - 1];
    o.cpu = await W.__cpuParts(120, (i) => { const t = (i % 60) / 60, px = b[0] + (a[0] - b[0]) * t * 0.5, pz = b[1] + (a[1] - b[1]) * t * 0.5; v.place(px, W.__world.groundAt(px, pz, 999) + 0.4, pz, Math.atan2(-(a[0] - b[0]), -(a[1] - b[1]))); });
  }
}
out.shaderWarm = W.__shaderWarm ? { enabled: W.__shaderWarm.enabled, ...W.__shaderWarm.stats } : null;
return out;
