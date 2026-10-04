// headless body for dev/car3cdp.mjs: real-time flicker probe parked on the world2 yard views (+ the regression set with &reg=<suffix>)
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&noyardground]&reg=w2" dev/world2_flick.js
for (const f of ['bld5shots.js', 'sky_shots.js', 'flicker_probe.js', 'flicker_rt.js', 'regress_shots.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const q = new URLSearchParams(location.search), out = {};
for (const v of ['yards_drone2', 'yards_street', 'yards_drone']) {
  await window.__w2Shot(v, 'flk');
  const r = await window.__flickRT(10, { paused: true, still: true });
  out[v] = { frames: r.frames, fps: r.fps, regionMax: r.regionMax, regionsOver2: r.regionsOver2, events: r.events };
  window.__manual = true;
}
if (q.get('reg')) out.reg = await window.__regAll(q.get('reg'));
return out;
