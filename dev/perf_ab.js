// headless body for dev/car3cdp.mjs: interleaved A/B of runtime perf switches (render/perfflags.js) in ONE session, so machine
// drift (thermals, other GPU work) hits both arms alike. Per district: warm drive, then reps x [A: switches off, B: on],
// each arm = settle at the route start + a frames-long drive (dev/perf_drive.js stats). 1920x1080, 15:30 clear.
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres#flags=maskcull,extcull&d=mission&reps=2&frames=400" dev/perf_ab.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'gpu.js', 'perf_drive.js', 'world2_shots.js', 'perf_prof.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1));
const ROUTES = {
  mission: [[37.7524, -122.4184], [37.7650, -122.4216]],
  fidi: [[37.7932, -122.4024], [37.7890, -122.4010], [37.7915, -122.3985]],
  chinatown: [[37.7934, -122.4078], [37.7978, -122.4058]],
  sunset: [[37.7613, -122.4885], [37.7637, -122.4775]],
  twinpeaks: [[37.7525, -122.4475], [37.7576, -122.4468]],
};
const flags = (H.get('flags') || '').split(',').filter(Boolean), reps = +(H.get('reps') || 2), FR = +(H.get('frames') || 400);
const setArm = (on) => { for (const f of flags) W.__perf[f] = on; };
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
W.__manual = true; W.__setWx?.(H.get('wx') || 'clear'); W.__env.state.hours = +(H.get('h') || 15.5); W.__env.state.paused = true; W.__look(null);
if (W.__G.dynres) W.__G.dynres.enabled = false;
await W.__shot('perf_1080_warm', 1920, 1080);
const tick = () => new Promise(r => setTimeout(r, 0));
const out = { flags, spots: {} };
for (const nm of (H.get('d') || 'mission').split(',')) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  const [x, z] = route[0];
  const settle = async (n = 120) => { W.__teleport(x, z); W.__hbSafe?.(x, z); for (let i = 0; i < n; i++) { W.__frames(1); await tick(); } };
  W.__teleport(x, z); W.__hbSafe?.(x, z); await W.__bld5Settle(); await settle();
  await W.__perfDrive({ route, speed: 15, maxFrames: FR });          // warm: stream the whole route once
  const arms = { A: [], B: [] };
  for (let r = 0; r < reps; r++) for (const arm of (r % 2 ? ['B', 'A'] : ['A', 'B'])) {
    setArm(arm === 'B'); await settle(arm === 'B' ? 150 : 150);
    const s = await W.__perfDrive({ route, speed: 15, maxFrames: FR });
    const c = W.__drawCensus();
    arms[arm].push({ p50: s.p50, p95: s.p95, p99: s.p99, max: s.max, cpu: s.cpuP50, gpu: s.gpuP50, calls: c.tot.calls, tris: Math.round(c.tot.tris / 1e3) });
  }
  const med = (a, k) => { const v = a.map(o => o[k]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
  const sum = (a) => Object.fromEntries(['p50', 'p95', 'p99', 'max', 'cpu', 'gpu', 'calls', 'tris'].map(k => [k, med(a, k)]));
  out.spots[nm] = { A: sum(arms.A), B: sum(arms.B), runs: arms };
}
setArm(true);
return out;
