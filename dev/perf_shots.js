// headless body for dev/car3cdp.mjs: look check for perf work. Same views with and without an optimisation (A/B URL flags),
// then python dev/perf_diff.py <a> <b> for per-view pixel stats + a side-by-side sheet.
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres#suf=after" dev/perf_shots.js
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres&nomaskcull#suf=before" dev/perf_shots.js
// views: each district route start (chase cam, 15:30 clear) + 50 m on, both at 1280x720; #d=a,b limits, #h= hour, #wx= weather
for (const f of ['bld5shots.js', 'regress_shots.js', 'gpu.js', 'perf_drive.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1)), suf = H.get('suf') || 'x';
const ROUTES = {
  mission: [[37.7524, -122.4184], [37.7650, -122.4216]],
  fidi: [[37.7932, -122.4024], [37.7890, -122.4010], [37.7915, -122.3985]],
  chinatown: [[37.7934, -122.4078], [37.7978, -122.4058]],
  sunset: [[37.7613, -122.4885], [37.7637, -122.4775]],
  twinpeaks: [[37.7525, -122.4475], [37.7576, -122.4468]],
};
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
W.__manual = true; W.__setWx?.(H.get('wx') || 'clear'); W.__env.state.hours = +(H.get('h') || 15.5); W.__env.state.paused = true; W.__look(null);
if (W.__G.dynres) W.__G.dynres.enabled = false;
// traffic / peds move between runs: park them (fewer differences that are not the change under test)
const freeze = () => { for (const c of W.__G.traffic?.cars || []) { if (c.v?.ai) { c.v.ai.state = 'stopped'; } } };
const out = [];
const names = (H.get('d') || Object.keys(ROUTES).join(',')).split(',');
for (const nm of names) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  let [x, z] = route[0]; const [x1, z1] = route[Math.min(route.length - 1, 6)];
  const yaw = Math.atan2(-(x1 - x), -(z1 - z));
  W.__teleport(x, z, { yaw }); W.__hbSafe?.(x, z, yaw); await W.__bld5Settle(); W.__teleport(x, z, { yaw }); await W.__bld5Settle(20);
  for (let i = 0; i < 90; i++) { W.__frames(1); await new Promise(r => setTimeout(r, 0)); }
  freeze(); W.__teleport(x, z, { yaw }); W.__frames(30);
  out.push(await W.__shot(`perfv_${nm}_a_${suf}`, 1280, 720));
  // free camera: 2.5 m up at the start, looking 200 m down the route (long view: photogrammetry / far city hand-off)
  const gy = W.__world.groundAt(x, z, 999);
  const tx = x + (x1 - x) * 8, tz = z + (z1 - z) * 8;
  W.__look(x, gy + 2.5, z, tx, W.__world.groundAt(tx, tz, 999) + 2, tz); W.__frames(20);
  out.push(await W.__shot(`perfv_${nm}_b_${suf}`, 1280, 720));
  // high view: 60 m up looking down the route (roofs, far city, photogrammetry)
  W.__look(x, gy + 60, z, tx, W.__world.groundAt(tx, tz, 999), tz); W.__frames(20);
  for (let i = 0; i < 30; i++) { W.__frames(1); await new Promise(r => setTimeout(r, 0)); }
  out.push(await W.__shot(`perfv_${nm}_c_${suf}`, 1280, 720));
  W.__look(null);
}
return out;
