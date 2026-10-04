// dev-only capture helper for the buildings v3 pass (not shipped). Paste into the game page (5191 does not serve dev/):
//   await __bld3('before', ['sunset'], ['gold', 'night'])  ->  shots/bld3_<place>_<mode>_<suffix>.jpg
// Cameras are fixed from two street intersections (a -> b), a fraction t along, a lateral offset and a yaw turn.
(() => {
  const SPOTS = {
    sunset: { a: ['Judah Street', '30th Avenue'], b: ['Irving Street', '30th Avenue'], t: 0.3, side: -1.2, turn: -0.55, h: 2.2 },
    divis: { a: ['Divisadero Street', 'Grove Street'], b: ['Divisadero Street', 'Fulton Street'], t: 0.35, side: 6.5, turn: -0.5, h: 2.2 },
    soma: { a: ['Harrison Street', '8th Street'], b: ['Harrison Street', '7th Street'], t: 0.3, side: 4, turn: 0.38, h: 1.8 },
    pacheights: { a: ['Jackson Street', 'Steiner Street'], b: ['Washington Street', 'Steiner Street'], t: 0.3, side: 1.2, turn: 0.45, h: 2.2 },
    mission: { a: ['24th Street', 'Harrison Street'], b: ['24th Street', 'Alabama Street'], t: 0.3, side: 1.2, turn: 0.4, h: 2.2 },
    ware: { bld: 46208, along: 25, h: 1.8, ty: 3 },
    ware2: { bld: 46250, along: 20, h: 1.8, ty: 3 },
    house: { a: ['Judah Street', '30th Avenue'], b: ['Irving Street', '30th Avenue'], t: 0.55, side: -1.0, turn: -1.15, h: 1.7, ahead: 14, up: 1.6 },
  };
  const MODES = { night: { hours: 22.0, wx: 'clear' }, gold: { hours: 17.9, wx: 'clear' } };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function cam(p) {
    if (p.front !== undefined) return window.__bld3Front(p.front, p.d, p.off, p.h, p.ty);
    if (p.bld !== undefined) {           // a building (plan index): from the nearest street point, stepped along it
      const P = __world.buildings.plan, i = p.bld, n = __G.world.graph.nearestEdge(P.cx[i], P.cz[i], 200), e = n.edge, k = Math.min(n.k, e.pts.length - 2);
      let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const px = n.x + dx * (p.along || 15), pz = n.z + dz * (p.along || 15), py = __world.groundAt(px, pz, 999) + (p.h || 1.8);
      return [px, py, pz, P.cx[i], P.y0[i] + (p.ty || 4), P.cz[i]];
    }
    const g = __G.world.graph, A = g.intersection(...p.a), B = g.intersection(...p.b);
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const px = A.x + dx * L * p.t - dz * p.side, pz = A.z + dz * L * p.t + dx * p.side;
    const c = Math.cos(p.turn), s = Math.sin(p.turn), lx = c * dx + s * dz, lz = -s * dx + c * dz, k = p.ahead || 30;
    const py = __world.groundAt(px, pz, 999) + p.h;
    return [px, py, pz, px + lx * k, py + (p.up ?? 0.6), pz + lz * k];
  }
  async function settle(maxIt = 80) {
    const b = __world.buildings, s = __G.world.stream;
    for (let k = 0; k < maxIt; k++) {
      __frames(10); await wait(40);
      const st = b.stats, q = (s._queue || []).filter(j => j.d < 600).length;
      if (k > 3 && !q && !st.queued && !st.inflight && !(st.applyQueued > 0)) break;
    }
    __frames(20);
  }
  // front-wall camera for plan building i: d m out from its longest street wall, shifted `off` along it, looking at it
  window.__bld3Front = (i, d = 9, off = 1.5, h = 1.6, ty = 2.6) => {
    const P = __world.buildings.plan, B = P.bx, t = B.tileOf[i], ox = B.X0 + (t % B.TC) * 512, oz = B.Z0 + Math.floor(t / B.TC) * 512, n = B.nv[i], v0 = B.v0[i];
    const R = []; for (let k = 0; k < n; k++) R.push([ox + B.verts[(v0 + k) * 2] / 16, oz + B.verts[(v0 + k) * 2 + 1] / 16]);
    let A = 0; for (let k = 0; k < n; k++) { const q = R[(k + 1) % n]; A += R[k][0] * q[1] - q[0] * R[k][1]; } const sg = A < 0 ? -1 : 1;
    let best = null, bl = 0;
    for (let k = 0; k < n; k++) { if (!(P.edge[v0 + k] & 1)) continue; const a = R[k], b = R[(k + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = [a, b]; } }
    if (!best) return null;
    const [a, b] = best, ex = (b[0] - a[0]) / bl, ez = (b[1] - a[1]) / bl, nx = sg * ez, nz = -sg * ex, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const px = mx + nx * d + ex * off, pz = mz + nz * d + ez * off, py = __world.groundAt(px, pz, 999) + h;
    return [px, py, pz, mx, P.y0[i] + ty, mz];
  };
  window.__bld3Spots = SPOTS;
  window.__bld3Cam = (name) => { const c = cam(SPOTS[name]); const bx = c[0] - c[3], bz = c[2] - c[5], bl = Math.hypot(bx, bz) || 1; __teleport(c[0] + bx / bl * 30, c[2] + bz / bl * 30); __look(...c); return c; };
  window.__bld3 = async (suffix, places = Object.keys(SPOTS), modes = ['gold', 'night']) => {
    window.__manual = true; const out = [];
    for (const m of modes) {
      const M = MODES[m];
      __G.weather.set(M.wx, { transition: 0 }); __G.weather.auto = false;
      __env.state.hours = M.hours; __env.state.paused = true;
      for (const pl of places) {
        __bld3Cam(pl); await settle(); __bld3Cam(pl); __frames(30);
        const nm = `bld3_${pl}_${m}_${suffix}`; await __shot(nm); out.push(nm);
      }
    }
    return out;
  };
})();
