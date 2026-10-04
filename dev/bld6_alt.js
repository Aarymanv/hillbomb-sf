// headless body: frame-parity flicker check (__altStat, load-independent) at aerial views, env paused
for (const f of ['flicker_rt.js', 'regress_shots.js', 'bld5shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, out = { v: location.search.includes('nov6') ? 'nov6' : 'v6' };
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.(); W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = 15.5; W.__env.state.paused = true;
for (const nm of ['drone_mission', 'drone_sunset', 'drone_low2']) { W.__bld6Place(nm); await W.__bld5Settle(); W.__bld6Place(nm); W.__frames(20); out[nm] = W.__altStat(14); }
return out;
