// dev-only capture helper for the buildings v5 pass (massing variety / near shadows / pop cross-fade). Game page (5191 tab):
//   await import('http://127.0.0.1:5190/dev/bld5shots.js')
//   await __bld5('before')                 -> shots/bld5_<place>_<noon|night>_before.jpg
//   await __bld5Close('before')            -> shots/bld5_closeup_<noon|night>_before.jpg
//   await __bld5Perf(['sunset','mission']) -> GPU median ms (dev/gpu.js), tris, calls per spot
(() => {
  const W = window;
  const SPOTS = {
    sunset: { a: ['Judah Street', '30th Avenue'], b: ['Irving Street', '30th Avenue'], t: 0.3, side: -1.2, turn: -0.55, h: 2.2 },
    haight: { a: ['Haight Street', 'Masonic Avenue'], b: ['Haight Street', 'Ashbury Street'], t: 0.25, side: 1.2, turn: 0.45, h: 2.2 },
    pacheights: { a: ['Jackson Street', 'Steiner Street'], b: ['Washington Street', 'Steiner Street'], t: 0.3, side: 1.2, turn: 0.45, h: 2.2 },
    mission: { a: ['24th Street', 'Harrison Street'], b: ['24th Street', 'Alabama Street'], t: 0.3, side: 1.2, turn: 0.4, h: 2.2 },
    tenderloin: { a: ['Eddy Street', 'Leavenworth Street'], b: ['Eddy Street', 'Jones Street'], t: 0.3, side: 1.5, turn: 0.4, h: 2.2 },
  };
  const MODES = { night: 22.0, noon: 12.5, gold: 17.9 };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function cam(p) {
    const g = W.__G.world.graph, A = g.intersection(...p.a), B = g.intersection(...p.b);
    if (!A || !B) throw new Error('no intersection ' + JSON.stringify(p));
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const px = A.x + dx * L * p.t - dz * p.side, pz = A.z + dz * L * p.t + dx * p.side;
    const c = Math.cos(p.turn), s = Math.sin(p.turn), lx = c * dx + s * dz, lz = -s * dx + c * dz, k = p.ahead || 30;
    const py = W.__world.groundAt(px, pz, 999) + p.h;
    return [px, py, pz, px + lx * k, py + (p.up ?? 0.6), pz + lz * k];
  }
  async function settle(maxIt = 90) {
    const b = W.__world.buildings, s = W.__G.world.stream;
    for (let k = 0; k < maxIt; k++) {
      W.__frames(10); await wait(40);
      const st = b.stats, q = (s._queue || []).filter(j => j.d < 600).length;
      if (k > 3 && !q && !st.queued && !st.inflight && !(st.applyQueued > 0)) break;
    }
    W.__frames(20);
    // the photogrammetry near mask settles after a teleport (googletiles.js 'ready'): our block is only masked in then
    const g = W.__world.gtiles;
    for (let k = 0; g && k < 400 && !(g.ready && g.nearMask); k++) { W.__frames(10); await wait(60); }
    W.__frames(20);
  }
  W.__bld5Settle = settle;
  W.__bld5Front = (i, d = 9, off = 1.5, h = 1.6, ty = 2.6) => {
    const P = W.__world.buildings.plan, B = P.bx, t = B.tileOf[i], ox = B.X0 + (t % B.TC) * 512, oz = B.Z0 + Math.floor(t / B.TC) * 512, n = B.nv[i], v0 = B.v0[i];
    const R = []; for (let k = 0; k < n; k++) R.push([ox + B.verts[(v0 + k) * 2] / 16, oz + B.verts[(v0 + k) * 2 + 1] / 16]);
    let A = 0; for (let k = 0; k < n; k++) { const q = R[(k + 1) % n]; A += R[k][0] * q[1] - q[0] * R[k][1]; } const sg = A < 0 ? -1 : 1;
    let best = null, bl = 0;
    for (let k = 0; k < n; k++) { if (!(P.edge[v0 + k] & 1)) continue; const a = R[k], b = R[(k + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = [a, b]; } }
    if (!best) return null;
    const [a, b] = best, ex = (b[0] - a[0]) / bl, ez = (b[1] - a[1]) / bl, nx = sg * ez, nz = -sg * ex, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const px = mx + nx * d + ex * off, pz = mz + nz * d + ez * off, py = W.__world.groundAt(px, pz, 999) + h;
    return [px, py, pz, mx, P.y0[i] + ty, mz];
  };
  const prep = (hr) => {
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__manual = true; if (W.__setWx) W.__setWx('clear'); else { W.__G.weather.set('clear', { transition: 0 }); W.__G.weather.auto = false; }
    W.__env.state.hours = hr; W.__env.state.paused = true;
  };
  W.__bld5Spots = SPOTS;
  W.__bld5Cam = (name) => { const c = cam(SPOTS[name]); const bx = c[0] - c[3], bz = c[2] - c[5], bl = Math.hypot(bx, bz) || 1; W.__teleport(c[0] + bx / bl * 30, c[2] + bz / bl * 30); W.__look(...c); return c; };
  W.__bld5 = async (suffix, places = Object.keys(SPOTS), modes = ['noon', 'night']) => {
    const out = [];
    for (const m of modes) {
      prep(MODES[m]);
      for (const pl of places) {
        W.__bld5Cam(pl); await settle(); prep(MODES[m]); W.__bld5Cam(pl); await settle(20); prep(MODES[m]); W.__frames(30);
        const nm = `bld5_${pl}_${m}_${suffix}`; await W.__shot(nm, 1280, 720); out.push(nm);
      }
    }
    return out;
  };
  // close-up: front of building i (plan index), camera d m out
  W.__bld5Close = async (suffix, i = 51194, d = 9, modes = ['noon', 'night'], off = 1.5, h = 1.6, ty = 2.6) => {
    const out = [];
    // (the first pass only warms the streaming + photogrammetry near mask after the teleport: the first shot of a
    // freshly reached place could catch Google photo tiles still covering our block)
    for (const [k, m] of [modes[0], ...modes].entries()) {
      prep(MODES[m]);
      const c = W.__bld5Front(i, d, off, h, ty); const ne = W.__G.world.graph.nearestEdge(c[0], c[2], 150); W.__teleport(ne ? ne.x : c[0], ne ? ne.z : c[2]); const vr = W.__player.vehicle.root; vr.visible = false; W.__look(...c); await settle(); prep(MODES[m]); W.__look(...c); await settle(20); prep(MODES[m]); W.__frames(30);
      if (k === 0) { vr.visible = true; await wait(1500); continue; }
      const nm = `bld5_closeup_${m}_${suffix}`; await W.__shot(nm, 1280, 720); vr.visible = true; out.push(nm);
    }
    return out;
  };
  // a building (plan index) seen from the nearest street, stepped `along` m along it, eye h, looking at ty above its y0
  W.__bld5Bld = async (i, suffix, hr = 12.5, along = 14, ty = 6, h = 1.8) => {
    prep(hr);
    const P = W.__world.buildings.plan, n = W.__G.world.graph.nearestEdge(P.cx[i], P.cz[i], 200), e = n.edge, k = Math.min(n.k, e.pts.length - 2);
    let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const px = n.x + dx * along, pz = n.z + dz * along, py = W.__world.groundAt(px, pz, 999) + h;
    const c = [px, py, pz, P.cx[i], P.y0[i] + ty, P.cz[i]];
    W.__teleport(px - dx * 20, pz - dz * 20); W.__look(...c); await settle(); W.__look(...c); await settle(20); W.__frames(30);
    const nm = `bld5_b${i}_${suffix}`; await W.__shot(nm, 1280, 720); return nm;
  };
  // oblique aerial of building i: from its main street front, out d m and up h m above its eave, looking at its roof line
  W.__bld5Air = async (i, suffix, hr = 12.5, d = 30, h = 14, side = 6) => {
    prep(hr);
    const c0 = W.__bld5Front(i, d, side, 0, 0); if (!c0) return null;
    const P = W.__world.buildings.plan, ye = P.yEave[i];
    const c = [c0[0], ye + h, c0[2], c0[3], ye - 2, c0[5]];
    W.__teleport(c[0], c[2]); W.__look(...c); await settle(); W.__look(...c); await settle(20); W.__frames(30);
    const nm = `bld5_a${i}_${suffix}`; await W.__shot(nm, 1280, 720); return nm;
  };
  W.__bld5Perf = async (places = ['sunset', 'mission', 'haight'], hours = 12.5) => {
    prep(hours); const out = {};
    for (const pl of places) {
      W.__bld5Cam(pl); await settle(); W.__bld5Cam(pl); W.__frames(10);
      const r = []; for (let k = 0; k < 3; k++) r.push(await W.__gpu(40)); r.sort((a, b) => a - b);
      const I = W.__renderer.info; I.autoReset = false; I.reset(); W.__frames(1); const inf = { ...I.render }; I.autoReset = true;
      out[pl] = { gpu: r[1], tris: +(inf.triangles / 1e6).toFixed(3), calls: inf.calls };
    }
    return out;
  };
})();
