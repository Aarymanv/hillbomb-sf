// headless body for dev/car3cdp.mjs: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&nov6]" dev/bld6_run.js
// shots: ?nov6 -> bld6_<view>_before.jpg, otherwise _after. window.__bld6Only = [...] (via &views=a,b) limits the set.
for (const f of ['bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
const q = new URLSearchParams(location.search), suf = q.get('suffix') || (q.has('nov6') ? 'before' : 'after');
const views = q.get('views') ? q.get('views').split(',') : Object.keys(window.__bld6Views);
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const t0 = performance.now();
const out = await window.__bld6(suf, views);
const b = window.__world.buildings;
return { out, s: ((performance.now() - t0) / 1000).toFixed(0), repainted: b.plan.repainted, mid: b.stats.midTris, far: b.stats.farTris };
