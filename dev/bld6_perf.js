// headless body (perf / memory A/B for the buildings v6 pass), page with &memtrack, A = &nov6:
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&memtrack[&nov6]" dev/bld6_perf.js
for (const f of ['gpu.js', 'perf_drive.js', 'bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, out = { v: location.search.includes('nov6') ? 'A(nov6)' : 'B(v6)' };
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.();
// static street spots (bld5 harness): GPU median, tris, calls
out.street = await W.__bld5Perf(['sunset', 'mission', 'haight'], 12.5);
// aerial spots: settle like the shots, then GPU median of 3 x 40 frames
out.air = {};
for (const nm of ['drone_mission', 'drone_sunset']) {
  const v = W.__bld6Views[nm]; W.__bld6Place(nm); await W.__bld5Settle(); W.__bld6Place(nm); W.__frames(10);
  const r = []; for (let k = 0; k < 3; k++) r.push(await W.__gpu(40)); r.sort((a, b) => a - b);
  const I = W.__renderer.info; I.autoReset = false; I.reset(); W.__frames(1); const inf = { ...I.render }; I.autoReset = true;
  out.air[nm] = { gpu: r[1], tris: +(inf.triangles / 1e6).toFixed(3), calls: inf.calls };
}
// 60 m/s drive through the Mission (24th St -> Valencia -> 16th)
W.__look(null);
const g = W.__G.world.graph, pts = [['24th Street', 'Potrero Avenue'], ['24th Street', 'Valencia Street'], ['16th Street', 'Valencia Street'], ['16th Street', 'Potrero Avenue']].map(p => { const n = g.intersection(...p); return [n.x, n.z]; });
const route = W.__route(pts);
W.__teleport(route[0][0], route[0][1]); await W.__bld5Settle(40);
const d = await W.__perfDrive({ route, speed: 60, maxFrames: 1500 });
out.drive = { cpuP50: d.cpuP50, gpuP50: d.gpuP50, gpuP95: d.gpuP95, p50: d.p50, p99: d.p99, over50: d.over50 };
const b = W.__world.buildings.stats;
out.mem = W.__gpumemTotals ? W.__gpumemTotals() : null;
out.tris = { mid: b.midTris, far: b.farTris, kit: b.kitTris };
return out;
