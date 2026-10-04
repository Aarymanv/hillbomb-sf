// headless body: regression views + real-time flicker probe for the buildings v6 pass
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&nov6]" dev/bld6_reg.js   (&noreg = flicker only)
for (const f of ['sky_shots.js', 'flicker_probe.js', 'flicker_rt.js', 'regress_shots.js', 'bld5shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, q = new URLSearchParams(location.search), A = q.has('nov6'), out = { v: A ? 'nov6' : 'v6' };
if (!q.has('noreg') && !A) out.reg = await W.__regAll('bld6');
// flicker: day street (mission, regress view), aerial (drone_mission), night street (tenderloin regress view)
out.flick = {};
const FL = [['mission', 'reg'], ['drone_mission', 'air'], ['day', 'reg']].filter(([n]) => !q.get('flk') || q.get('flk').split(',').includes(n));
for (const [nm, kind] of FL) {
  if (kind === 'reg') { await W.__regShot(nm, 'flk_tmp'); }
  else { W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = 15.5; W.__bld6Place(nm); await W.__bld5Settle(); W.__bld6Place(nm); W.__frames(20); }
  const r = await W.__flickRT(12, { paused: true });
  out.flick[nm] = { fps: r.fps, regionMax: r.regionMax, regionsOver2: r.regionsOver2, events: r.events };
}
return out;
