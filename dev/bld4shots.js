// dev-only capture helper for the buildings v4 pass (lighting / grounding / street fronts). Load in the game page:
//   eval(await (await fetch('http://127.0.0.1:5190/dev/bld4shots.js')).text())
//   await __bld4('before', ['sunset'], ['noon', 'night'])  ->  shots/bld4_<place>_<mode>_<suffix>.jpg
// Cameras: two street intersections (a -> b), a fraction t along, a lateral offset and a yaw turn (same as bld3shots.js).
(() => {
  const SPOTS = {
    sunset: { a: ['Judah Street', '30th Avenue'], b: ['Irving Street', '30th Avenue'], t: 0.3, side: -1.2, turn: -0.55, h: 2.2 },
    richmond: { a: ['Anza Street', '8th Avenue'], b: ['Balboa Street', '8th Avenue'], t: 0.35, side: 1.2, turn: 0.5, h: 2.2 },
    mission: { a: ['24th Street', 'Harrison Street'], b: ['24th Street', 'Alabama Street'], t: 0.3, side: 1.2, turn: 0.4, h: 2.2 },
    pacheights: { a: ['Jackson Street', 'Steiner Street'], b: ['Washington Street', 'Steiner Street'], t: 0.3, side: 1.2, turn: 0.45, h: 2.2 },
    noe: { a: ['Jersey Street', 'Noe Street'], b: ['Jersey Street', 'Castro Street'], t: 0.35, side: 1.2, turn: 0.45, h: 2.2 },
  };
  const MODES = { night: { hours: 22.0, wx: 'clear' }, noon: { hours: 12.5, wx: 'clear' }, gold: { hours: 17.9, wx: 'clear' } };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function cam(p) {
    const g = __G.world.graph, A = g.intersection(...p.a), B = g.intersection(...p.b);
    if (!A || !B) throw new Error('no intersection ' + JSON.stringify(p));
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const px = A.x + dx * L * p.t - dz * p.side, pz = A.z + dz * L * p.t + dx * p.side;
    const c = Math.cos(p.turn), s = Math.sin(p.turn), lx = c * dx + s * dz, lz = -s * dx + c * dz, k = p.ahead || 30;
    const py = __world.groundAt(px, pz, 999) + p.h;
    return [px, py, pz, px + lx * k, py + (p.up ?? 0.6), pz + lz * k];
  }
  async function settle(maxIt = 90) {
    const b = __world.buildings, s = __G.world.stream;
    for (let k = 0; k < maxIt; k++) {
      __frames(10); await wait(40);
      const st = b.stats, q = (s._queue || []).filter(j => j.d < 600).length;
      if (k > 3 && !q && !st.queued && !st.inflight && !(st.applyQueued > 0)) break;
    }
    __frames(20);
  }
  // closeup: a Sunset stucco house near the bld3 closeup one (that one faces east under a street tree: no midday sun);
  // this one faces south (sunlit at noon), front camera 9 m out
  window.__bld4Close = async (suffix) => {
    window.__manual = true; __G.weather.set('clear', { transition: 0 }); __G.weather.auto = false; __env.state.paused = true;
    const P = __world.buildings.plan, i = 51194;
    const out = [];
    for (const [m, hr] of [['noon', 12.5], ['night', 22.0]]) {
      __env.state.hours = hr;
      const c = window.__bld3Front(i, 9, 1.5, 1.6, 2.6); __teleport(c[0], c[2] + 25); __look(...c); await settle(); __look(...c); __frames(30);
      const nm = `bld4_closeup_${m}_${suffix}`; await __shot(nm); out.push(nm);
    }
    return out;
  };
  // A/B perf at the street spots (load dev/gpu.js first): GPU median ms + rendered triangles / draw calls
  window.__bld4Perf = async (places = ['sunset', 'mission', 'noe'], hours = 12.5) => {
    window.__manual = true; __env.state.hours = hours; __env.state.paused = true; const out = {};
    for (const pl of places) {
      __bld4Cam(pl); await settle(); __bld4Cam(pl); __frames(10);
      const r = []; for (let k = 0; k < 3; k++) r.push(await window.__gpu(40)); r.sort((a, b) => a - b);
      const I = __renderer.info; I.autoReset = false; I.reset(); __frames(1); const inf = { ...I.render }; I.autoReset = true;
      out[pl] = { gpu: r[1], tris: +(inf.triangles / 1e6).toFixed(3), calls: inf.calls };
    }
    return out;
  };
  window.__bld4Spots = SPOTS;
  window.__bld4Cam = (name) => { const c = cam(SPOTS[name]); const bx = c[0] - c[3], bz = c[2] - c[5], bl = Math.hypot(bx, bz) || 1; __teleport(c[0] + bx / bl * 30, c[2] + bz / bl * 30); __look(...c); return c; };
  window.__bld4 = async (suffix, places = Object.keys(SPOTS), modes = ['noon', 'night']) => {
    window.__manual = true; const out = [];
    for (const m of modes) {
      const M = MODES[m];
      __G.weather.set(M.wx, { transition: 0 }); __G.weather.auto = false;
      __env.state.hours = M.hours; __env.state.paused = true;
      for (const pl of places) {
        __bld4Cam(pl); await settle(); __bld4Cam(pl); __frames(30);
        const nm = `bld4_${pl}_${m}_${suffix}`; await __shot(nm); out.push(nm);
      }
    }
    return out;
  };
})();
