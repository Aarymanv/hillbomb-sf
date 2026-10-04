// headless body for dev/car3cdp.mjs (run with HB_UNCAP=1): REAL-TIME frame rate, i.e. the game's own rAF loop (CPU and GPU
// overlap as in play, dynamic resolution off unless #dynres=1) while the car is moved along the world2_perf routes at 15 m/s
// by the loop's autopilot hook. Reports rAF interval p50 / p95 / p99 / max, fps, and the frame() CPU p50 per district.
//   HB_UNCAP=1 node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high#d=mission&secs=30" dev/perf_rt.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'perf_drive.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1)), SECS = +(H.get('secs') || 30);
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
const out = { size: [W.__renderer.domElement.width, W.__renderer.domElement.height], spots: {} };
for (const nm of (H.get('d') || Object.keys(ROUTES).join(',')).split(',')) {
  const route = W.__route(ROUTES[nm].map(p => LL(...p)));
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (s) => { s = s % (2 * total); if (s > total) s = 2 * total - s; let k = 0; while (k < cum.length - 2 && cum[k + 1] < s) k++; const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = route[k], b = route[k + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]))]; };
  const [x, z] = route[0];
  W.__teleport(x, z); W.__hbSafe?.(x, z); await W.__bld5Settle(); W.__teleport(x, z); await W.__bld5Settle(20);
  const v = W.__player.vehicle; let s = 0, last = 0, dir = 1;
  const iv = [], cpu = [], fcpu = []; let tf0 = 0;
  W.__autopilot = (input, dt) => { tf0 = performance.now(); s += 15 * dt; const [px, pz, yaw] = at(s); v.place(px, W.__world.groundAt(px, pz, 999) + 0.4, pz, s % (2 * total) > total ? yaw + Math.PI : yaw); if (v.body?.vel) v.body.vel.set?.(0, 0, 0); };
  // the loop calls frame() directly: the frame rate is the rAF interval; renderCpu = post.render (the scene + post passes)
  const g0 = W.__G.post.render; W.__G.post.render = function (dt) { const t = performance.now(); const r = g0.call(this, dt); const t1 = performance.now(); cpu.push(t1 - t); if (tf0) fcpu.push(t1 - tf0); return r; };
  W.__manual = false;
  await new Promise(r => setTimeout(r, 3000));      // warm in real time
  iv.length = 0; cpu.length = 0; fcpu.length = 0;
  await new Promise(res => { const t0 = performance.now(); const tick = (t) => { if (last) iv.push(t - last); last = t; if (t - t0 < SECS * 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  W.__manual = true; W.__autopilot = null; W.__G.post.render = g0;
  const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(1); };
  out.spots[nm] = { frames: iv.length, fps: +(1000 / q(iv, 0.5)).toFixed(1), p50: q(iv, 0.5), p95: q(iv, 0.95), p99: q(iv, 0.99), max: q(iv, 1), over50: iv.filter(x => x > 50).length, renderCpuP50: q(cpu, 0.5), frameCpuP50: q(fcpu, 0.5), frameCpuP95: q(fcpu, 0.95), dynres: W.__G.dynres?.enabled ? { scale: W.__G.dynres.scale, trials: W.__G.dynres.trials?.slice(-6) } : null };
}
return out;
