// dev-only capture helper for the facade agent (not imported by the game, not shipped). Paste into the game page via the
// browser JS tool (the test server does not serve dev/), then: await __cityShots('before', ['mission'], ['night', 'gold'])

const PLACES = {
  mission: { street: [88, 2488, { h: 2.2 }] },
  tenderloin: { street: [581, -1010, { h: 2.2 }] },
  pacheights: { street: [-1654, -1946, { h: 2.2, side: 3 }], turn: 0.62 },
  pacheights2: { street: [-1654, -1946, { h: 2.2, side: -3 }], turn: -0.62 },
  haight: { street: [-2423, 544, { h: 2.2 }] },
  fidi: { street: [1461, -2245, { h: 2.2 }] },
  chinatown: { street: [1124, -2330, { h: 2.2 }] },
  far: { look: [-600, 190, 1300, 900, 20, -1300], focus: [0, 800] },
};
const MODES = { night: { hours: 21.5, wx: 'rain' }, gold: { hours: 17.9, wx: 'clear' } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function settle(maxIt = 60) {
  const b = window.__world.buildings, s = window.__world.stream;
  for (let k = 0; k < maxIt; k++) {
    window.__frames(10); await wait(60);
    const st = b.stats;
    if (k > 4 && !st.queued && !st.inflight && !s.stats.pending && (!b.dress || b.dress.done !== false)) break;
  }
  window.__frames(20);
}
window.__cityPlaces = PLACES;
window.__placeCam = (name) => {
  const p = PLACES[name];
  if (p.street) {
    window.__teleport(p.street[0], p.street[1]); const nm = window.__street(...p.street);
    if (p.turn) { const f = window.__freeCam, dx = f.tx - f.x, dz = f.tz - f.z, c = Math.cos(p.turn), s = Math.sin(p.turn);
      window.__look(f.x, f.y, f.z, f.x + c * dx + s * dz, f.ty + 3, f.z - s * dx + c * dz); }
    return nm;
  }
  window.__teleport(...p.focus); window.__look(...p.look); return name;
};
window.__cityShots = async (suffix, places = Object.keys(PLACES), modes = ['night', 'gold']) => {
  window.__manual = true;
  const out = [];
  for (const m of modes) {
    const M = MODES[m];
    window.__G.weather.set(M.wx, { transition: 0 }); window.__G.weather.auto = false;
    window.__env.state.hours = M.hours; window.__env.state.paused = true;
    for (const pl of places) {
      window.__placeCam(pl); await settle(); window.__placeCam(pl); window.__frames(30);
      const nm = `city_${pl}_${m}_${suffix}`; await window.__shot(nm); out.push(nm);
    }
  }
  return out;
};
window.__perf = (n = 120) => { window.__frames(10); const t = performance.now(); window.__frames(n); window.__renderer.getContext().finish(); return +((performance.now() - t) / n).toFixed(2); };
PLACES.sunset = { street: [-6150, 1504, { h: 2.2 }] };
PLACES.tpeaks = { look: [-2490, 293.5, 2267, 600, 20, -1200], focus: [-2490, 2267] };   // Twin Peaks aerial (city2_ shots)
// perf at a place: settle, then mean ms/frame over n frames (gl.finish) + draw stats of one frame
window.__perfAt = async (pl, n = 90) => {
  window.__manual = true; window.__placeCam(pl); await settle(); window.__placeCam(pl);
  const ms = []; for (let r = 0; r < 3; r++) ms.push(window.__perf(n));
  const info = window.__renderer.info; info.autoReset = false; info.reset(); window.__frames(1);
  const b = window.__world.buildings.stats, o = { pl, ms: Math.min(...ms), calls: info.render.calls, tris: (info.render.triangles / 1e6).toFixed(2), nearT: (b.nearTris / 1e6).toFixed(2), midT: (b.midTris / 1e6).toFixed(2), near: b.nearTiles, mid: b.midTiles };
  info.autoReset = true; return o;
};
// night driving flicker test: car at a place, rain, autopilot along the street; returns __gser + __flick maxima
window.__flickAt = async (pl, n = 150, speed = 12) => {
  if (!window.__gser) console.warn('paste dev/flicker_probe.js first');
  window.__manual = true; window.__look(null);
  window.__G.weather.set('rain', { transition: 0 }); window.__env.state.hours = 21.5; window.__env.state.paused = true;
  const p = PLACES[pl].street || PLACES[pl].focus; window.__teleport(p[0], p[1]); await settle(30);
  window.__drive(speed); window.__frames(90);
  const g = window.__gser(n), f = window.__flick(n);
  window.__autopilot = null;
  return { pl, gser: g, flick: f };
};
// side view from a place's street camera: side = 1 left, -1 right; k = how far along
window.__sideLook = (pl, side = 1, k = 12) => {
  window.__placeCam(pl); window.__frames(2);
  const c = window.__camera, p = c.position.clone(), d = p.clone(); c.getWorldDirection(d);
  const L = { x: d.z * side, z: -d.x * side };
  window.__look(p.x + L.x * 2, p.y, p.z + L.z * 2, p.x + d.x * k + L.x * k, p.y + 0.5, p.z + d.z * k + L.z * k);
};
window.__quick = async (name, pl, mode = 'night', side = 0) => {
  const M = MODES[mode]; window.__manual = true;
  window.__G.weather.set(M.wx, { transition: 0 }); window.__env.state.hours = M.hours; window.__env.state.paused = true;
  window.__placeCam(pl); await settle(); if (side) window.__sideLook(pl, side); else window.__placeCam(pl);
  window.__frames(20); await window.__shot(name); return name;
};
