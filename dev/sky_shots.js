// Sky / night capture helpers (load in the game page: await import('http://127.0.0.1:5190/dev/sky_shots.js')).
//   await __skyShot(name, hours, kind)          wide view from Twin Peaks toward downtown (skyline + sky)
//   await __nightShot(name, streetA, streetB, hours, kind)   street-level view toward the junction of two streets
//   await __nightAll(suffix, hours, kind)       the five night street views (Sunset, Divisadero, SoMa, Mission, FiDi)
// The game loop is stepped manually (hidden tabs never fire rAF): frames run until nearby stream jobs are done.
const W = window;
W.__manual = true;
W.__settle = async (max = 60) => {
  for (let i = 0; i < max; i++) {
    W.__frames(10); await new Promise(r => setTimeout(r, 30));
    if (W.__G.world.stream._queue.filter(j => j.d < 600).length === 0 && i > 3) break;
  }
  W.__frames(20);
};
W.__setWx = (kind) => {
  const w = W.__G.env.weather; w.set(kind, { transition: 0 }); w.setLocked(true);
  const wet = kind === 'rain' || kind === 'storm'; w.wetness = wet ? 1 : 0; w.puddles = wet ? 0.7 : 0;
};
W.__skyShot = async (name, hours, kind = 'clear') => {
  W.__setWx(kind); W.__env.state.hours = hours; W.__env.state.paused = true;
  W.__teleport(-2480, 2410); W.__look(-2480, 282, 2400, 1300, 150, -1700);
  await W.__settle(); W.__frames(30); return W.__shot(name, 1280, 720);
};
W.__nightShot = async (name, a, b, hours = 22, kind = 'clear', back = 38) => {
  W.__setWx(kind); W.__env.state.hours = hours; W.__env.state.paused = true;
  const n = W.__G.world.graph.intersection(a, b); W.__street(n.x, n.z);
  const f = W.__freeCam, dx = f.tx - f.x, dz = f.tz - f.z, L = Math.hypot(dx, dz);
  const px = f.x - dx / L * back, pz = f.z - dz / L * back;
  W.__teleport(px - dx / L * 12, pz - dz / L * 12, { foot: true }); await W.__settle(20);
  const gy = W.__G.world.groundAt(px, pz, 999);
  W.__look(px, gy + 1.7, pz, n.x + dx / L * 40, gy + 1.3, n.z + dz / L * 40);
  await W.__settle(); W.__frames(30); return W.__shot(name, 1280, 720);
};
W.__NIGHT = [['sunset', 'Irving Street', '19th Avenue'], ['divis', 'Divisadero Street', 'Hayes Street'], ['soma', 'Folsom Street', '7th Street'],
  ['mission', 'Mission Street', '24th Street'], ['fidi', 'Montgomery Street', 'California Street']];
W.__nightAll = async (suf, hours = 22, kind = 'clear') => { for (const [k, a, b] of W.__NIGHT) await W.__nightShot('night_' + k + '_' + suf, a, b, hours, kind); return 'done'; };
W.__skyAll = async (suf) => {
  for (const [k, h, w] of [['noon', 13, 'clear'], ['golden', 18.5, 'clear'], ['sunset', 19.0, 'clear'], ['bluehour', 19.65, 'clear'], ['night', 22, 'clear'], ['fog', 8.5, 'fog'], ['storm', 15, 'storm']])
    await W.__skyShot('sky_' + k + '_' + suf, h, w);
  return 'done';
};
export default true;
