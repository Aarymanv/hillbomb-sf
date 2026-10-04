// headless body: GPU A/B at fixed spots (5 x 40-frame medians), page variants via the URL (&nov6, &noyardtrees)
for (const f of ['gpu.js', 'bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, out = { v: location.search };
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.(); W.__manual = true; W.__env.state.hours = 12.5; W.__env.state.paused = true;
const med = async () => { const r = []; for (let k = 0; k < 5; k++) r.push(await W.__gpu(40)); r.sort((a, b) => a - b); return r[2]; };
W.__bld5Cam('mission'); await W.__bld5Settle(); W.__bld5Cam('mission'); W.__frames(10); out.mission = await med();
W.__bld5Cam('sunset'); await W.__bld5Settle(); W.__bld5Cam('sunset'); W.__frames(10); out.sunset = await med();
W.__bld6Place('drone_mission'); await W.__bld5Settle(); W.__bld6Place('drone_mission'); W.__frames(10); out.air = await med();
return out;
