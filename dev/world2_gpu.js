// headless body: static GPU A/B (median of 3 x 40 frames, dev/gpu.js) at 1920x1080 on yard-heavy views
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high[&noyardground&noyardcol]" dev/world2_gpu.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'gpu.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, out = {};
await W.__w2Shot('yards_drone2', 'gpuwarm');
await W.__shot('perf_1080_warm', 1920, 1080);
for (const v of ['yards_drone2', 'yards_street', 'yards_drone']) {
  await W.__w2Shot(v, 'gpu'); await W.__shot('perf_1080_warm', 1920, 1080); W.__w2Place(v); W.__frames(30);
  const r = []; for (let k = 0; k < 3; k++) r.push(await W.__gpu(40)); r.sort((a, b) => a - b);
  out[v] = { gpu: r[1], all: r };
}
return out;
