// headless body for dev/car3cdp.mjs: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&suffix=after&views=yards_drone,crowds" dev/world2_run.js
// views: any of window.__w2Views, plus 'crowds' (census) and 'fence' (walk into a yard fence)
for (const f of ['bld5shots.js', 'regress_shots.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
const q = new URLSearchParams(location.search), suf = q.get('suffix') || 'x';
const views = (q.get('views') || 'unionsq_crowd,yards_drone,yards_drone2,yards_street,crowds,fence').split(',');
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const out = {};
for (const v of views) {
  try {
    if (v === 'crowds') out.crowds = await window.__w2Crowds();
    else if (v === 'fence') out.fence = await window.__w2Fence(suf);
    else if (v === 'colperf') out.colperf = await window.__w2ColPerf();
    else out[v] = await window.__w2Shot(v, suf);
  } catch (e) { out[v] = 'ERR ' + (e.stack || e.message).slice(0, 300); }
}
return out;
