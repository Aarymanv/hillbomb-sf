// headless body for dev/car3cdp.mjs: low-noise A/B of runtime perf switches (render/perfflags.js) on FIXED chase-cam views
// (no streaming between arms): per district 3 spots along the world2_perf route (start / middle / end); at each spot reps x
// [A: switches off, B: on] blocks of warm frames + measured frames; per frame CPU = frame() wall ms, GPU = timer query.
// Reports medians per arm and the per-spot paired difference B - A.
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres#flags=maskcull&d=mission,fidi&reps=3&n=60" dev/perf_views_ab.js
// flags may be empty (#flags=) for an A/A noise check.
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
const flags = (H.get('flags') || '').split(',').filter(Boolean), reps = +(H.get('reps') || 3), N = +(H.get('n') || 60), WARM = +(H.get('warm') || 40);
// dev-only pseudo switches (measurement of what other owners' content costs; not game options):
//   nocars  = B arm hides every car:* group except the player's; noprobe = B arm turns the car reflection probe off
const setArm = (on) => { for (const f of flags) {
  if (f === 'nocars') { const pr = W.__player.vehicle?.root; for (const c of W.__scene.children) if (/^car:/.test(c.name)) { let has = false; c.traverse(o => { if (o === pr) has = true; }); if (!has) c.visible = !on; } }
  else if (f === 'noprobe') { if (W.__carProbe) W.__carProbe.enabled = !on; }
  else W.__perf[f] = on; } };
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
W.__manual = true; W.__setWx?.(H.get('wx') || 'clear'); W.__env.state.hours = +(H.get('h') || 15.5); W.__env.state.paused = true; W.__look(null);
if (W.__G.dynres) W.__G.dynres.enabled = false;
await W.__shot('perf_1080_warm', 1920, 1080);
const gl = W.__renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), px = new Uint8Array(4);
const nap = (ms = 0) => new Promise(r => setTimeout(r, ms));
async function measure(n) {
  const cpu = [], qs = [];
  for (let i = 0; i < n; i++) {
    const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
    const t = performance.now(); W.__frame(1 / 60); cpu.push(performance.now() - t);
    gl.endQuery(tq.TIME_ELAPSED_EXT); qs.push(q);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); await nap();
  }
  const gpu = [];
  for (const q of qs) { for (let k = 0; k < 100 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await nap(5); if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { cpu: med(cpu), gpu: med(gpu) };
}
const out = { flags, spots: {} };
const allD = { cpu: [], gpu: [] };
for (const nm of (H.get('d') || 'mission').split(',')) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  const idx = [2, Math.floor(route.length / 2), route.length - 3];
  for (const k of idx) {
    const [x, z] = route[k], [x1, z1] = route[k + 1];
    const yaw = Math.atan2(-(x1 - x), -(z1 - z));
    const place = () => { W.__teleport(x, z, { yaw }); W.__hbSafe?.(x, z, yaw); };
    place(); await W.__bld5Settle(); place();
    for (let i = 0; i < 90; i++) { W.__frames(1); await nap(); }
    const arms = { A: [], B: [] };
    for (let r = 0; r < reps; r++) for (const arm of (r % 2 ? ['B', 'A'] : ['A', 'B'])) {
      setArm(arm === 'B');
      for (let i = 0; i < WARM; i++) { W.__frames(1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); await nap(8); }
      const c = W.__drawCensus();
      const m = await measure(N); m.calls = c.tot.calls; arms[arm].push(m);
    }
    const med = (a, key) => { const s = a.map(o => o[key]).sort((p, q) => p - q); return +s[Math.floor(s.length / 2)].toFixed(2); };
    const S = { A: { cpu: med(arms.A, 'cpu'), gpu: med(arms.A, 'gpu'), calls: med(arms.A, 'calls') }, B: { cpu: med(arms.B, 'cpu'), gpu: med(arms.B, 'gpu'), calls: med(arms.B, 'calls') } };
    S.dCpu = +(S.B.cpu - S.A.cpu).toFixed(2); S.dGpu = +(S.B.gpu - S.A.gpu).toFixed(2);
    allD.cpu.push(S.dCpu); allD.gpu.push(S.dGpu);
    out.spots[nm + '@' + k] = S;
  }
}
const mean = a => +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(2);
out.meanD = { cpu: mean(allD.cpu), gpu: mean(allD.gpu) };
setArm(true);
return out;
