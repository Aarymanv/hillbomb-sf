// dev-only: car pass 2 perf A/B with 45+ traffic cars. Load the game twice (default vs ?carbase=cars_old), then:
//   await import('http://127.0.0.1:5190/dev/car2perf.js?' + Date.now()); __car2Perf().then(r => window.__c2p = r)
// Market Street downtown drive (dense traffic, close cars at LOD0), GPU-synced frame times from dev/perf_drive.js.
const W = window;
W.__car2Perf = async ({ speed = 22, frames = 1500, max = 52 } = {}) => {
  await import('http://127.0.0.1:5190/dev/perf_drive.js?' + Date.now());
  const g = W.__world.graph, A = g.intersection('Market Street', '3rd Street'), B = g.intersection('Market Street', '8th Street');
  const route = W.__route([[A.x, A.z], [B.x, B.z]]);
  const T = W.__G.traffic; T.max = max; T.density = 1;
  W.__teleport(route[0][0], route[0][1]);
  for (let i = 0; i < 60; i++) { W.__frames(10); await new Promise(r => setTimeout(r, 30)); }   // spawn traffic + stream
  const n0 = T.cars.length;
  const r = await W.__perfDrive({ route, speed, maxFrames: frames });
  const ri = W.__renderer.info.render;
  return { carsStart: n0, carsEnd: T.cars.length, tris: ri.triangles, calls: ri.calls, ...r, worst: undefined, hist: undefined };
};
