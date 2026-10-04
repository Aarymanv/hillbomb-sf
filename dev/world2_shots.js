// World round 2 shots (ped hot spots on the 1:1 map, residential yard ground, yard fence colliders). Headless + muted:
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&noyardground&noyardcol]" dev/world2_run.js
// or in a game tab (?mute&prologue=0):
//   for (const f of ['bld5shots.js', 'regress_shots.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f);
//   await __w2Shot('yards_drone', 'after')     -> shots/world2_yards_drone_after.jpg
//   await __w2Crowds()                          -> peds near Union Sq / Wharf / Chinatown / Castro / Mission / Ferry Bldg
//   await __w2Fence('after')                    -> walks into a back-yard fence, shot + how far the player got through
(() => {
  const W = window;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const G = () => W.__G;
  const X = (a, b) => { const p = G().world.graph.intersection(a, b); if (!p) throw new Error('no intersection ' + a + ' / ' + b); return p; };
  const gy = (x, z) => W.__world.groundAt(x, z, 999);
  // real lat/lon -> world (src/world/latlon.js ll() with the bake's metres per degree)
  const LL = (lat, lon) => { const pr = (W.__world.data || G().world.data).meta.projection; return { x: (lon + 122.4194) * pr.kx, z: -(lat - 37.7749) * pr.kz }; };
  W.__w2LL = LL;
  const prep = (hr, wx = 'clear') => {
    if (G().state === 'title') document.querySelector('.modebtn')?.click();
    W.__regNoPolice?.();
    W.__manual = true; W.__setWx?.(wx); W.__env.state.hours = hr; W.__env.state.paused = true;
  };
  // crowd places: street corners at the real hot spots (Union Square = the plaza, NE corner Powell / Geary)
  const PLACES = W.__w2Places = {
    unionsq: () => { const a = X('Powell Street', 'Geary Street'), b = X('Stockton Street', 'Post Street'); return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; },
    wharf: () => X('Jefferson Street', 'Taylor Street'),
    chinatown: () => X('Grant Avenue', 'Washington Street'),
    castro: () => X('Castro Street', '18th Street'),
    mission: () => X('Valencia Street', '16th Street'),
    ferry: () => LL(37.7953, -122.3940),   // Ferry Building plaza (Embarcadero side)
  };
  const VIEWS = W.__w2Views = {
    // drone over the plaza, peds settled around the player standing in the middle
    unionsq_crowd: { place: 'unionsq', cam: [-38, 26, 44], hr: 14, foot: true },
    // Mission back yards (bld6 drone_low framing) and a Sunset block from above
    yards_drone: { mid: [['23rd Street', 'Alabama Street'], ['24th Street', 'Florida Street']], dist: 40, h: 42, yaw: 2.6, hr: 15.5 },
    yards_drone2: { at: ['Judah Street', '30th Avenue'], dist: 160, h: 120, yaw: -0.6, hr: 15.5 },
    // low over a Richmond block (8 m, a back-window height): the row of back yards between 22nd and 23rd Ave
    yards_street: { mid: [['Fulton Street', '22nd Avenue'], ['Cabrillo Street', '23rd Avenue']], dist: 30, h: 8, yaw: 0.5, hr: 15.5 },
  };
  function place(v) {
    let fx, fz, c;
    if (v.place) {
      const p = PLACES[v.place](); fx = p.x; fz = p.z;
      c = [fx + v.cam[0], gy(fx, fz) + v.cam[1], fz + v.cam[2], fx, gy(fx, fz) + 1, fz];
    } else if (v.yardrow) {
      // block between avenue a-b (the yard row runs along it), centre line halfway to the next avenue c
      const A = X(...v.yardrow[0]), B = X(...v.yardrow[1]), C = X(...v.yardrow[2]);
      const ox = (C.x - A.x) / 2, oz = (C.z - A.z) / 2;
      const t0 = v.t0 ?? 0.12, t1 = v.t1 ?? 0.7;
      const px = A.x + ox + (B.x - A.x) * t0, pz = A.z + oz + (B.z - A.z) * t0, tx = A.x + ox + (B.x - A.x) * t1, tz = A.z + oz + (B.z - A.z) * t1;
      fx = px; fz = pz;
      const py = W.__world.heightAt(px, pz) + v.h;
      c = [px, py, pz, tx, W.__world.heightAt(tx, tz) - 1.5, tz];
    } else {
      const g = G().world.graph;
      if (v.mid) { const A = g.intersection(...v.mid[0]), B = g.intersection(...v.mid[1]); fx = (A.x + B.x) / 2; fz = (A.z + B.z) / 2; }
      else { const A = g.intersection(...v.at); fx = A.x; fz = A.z; }
      c = [fx - Math.sin(v.yaw) * v.dist, gy(fx, fz) + v.h, fz - Math.cos(v.yaw) * v.dist, fx, gy(fx, fz), fz];
    }
    W.__teleport(fx, fz, { foot: !!v.foot }); W.__hbSafe?.(fx, fz); W.__look(...c);
    return [fx, fz];
  }
  W.__w2Place = (n) => place(VIEWS[n]);
  W.__w2Shot = async (name, suf = 'x') => {
    const v = VIEWS[name];
    prep(v.hr); place(v); await W.__bld5Settle(); prep(v.hr); place(v); await W.__bld5Settle(20);
    if (v.foot) { for (const q of G().peds.list) { q.fear = 0; q.hurry = 0; } W.__frames(600); place(v); }
    const vr = W.__player?.vehicle?.root; if (vr) vr.visible = false;
    W.__frames(30);
    const f = await W.__shot(`world2_${name}_${suf}`, 1280, 720);
    if (vr) vr.visible = true;
    return f;
  };
  // ped census at each hot spot: walkers within 90 m, tourists among them, the population target, far impostor count
  W.__w2Crowds = async (names = Object.keys(PLACES)) => {
    const out = {};
    prep(14);
    for (const n of names) {
      const p = PLACES[n]();
      W.__look(null); W.__teleport(p.x, p.z, { foot: true }); W.__hbSafe?.(p.x, p.z);
      await W.__bld5Settle(30);
      for (let k = 0; k < 8; k++) { W.__frames(100); await wait(20); }
      const P = G().peds, L = P.list.filter(q => Math.hypot(q.x - p.x, q.z - p.z) < 90);
      out[n] = { near: L.length, tourists: L.filter(q => q.style === 'tourist').length, spot: L.filter(q => q.spot).length, target: P.stats.target, all: P.list.length, far: P.stats.crowd ?? null,
        zone: P.nav?.zoneAt?.(p.x, p.z), dens: +(P.nav?.densityAt?.(p.x, p.z) ?? 0).toFixed(2) };
    }
    return out;
  };
  // walk the on-foot player into the nearest back-yard fence (or, with no fence colliders, the same line) for 3 s
  W.__w2FenceSpot = () => {
    // Mission block between Alabama and Florida (23rd -> 24th): its rear lot line runs halfway between the two streets
    const A = X('23rd Street', 'Alabama Street'), B = X('24th Street', 'Alabama Street'), C = X('23rd Street', 'Florida Street');
    const ox = (C.x - A.x) / 2, oz = (C.z - A.z) / 2;
    const x = A.x + ox + (B.x - A.x) * 0.3, z = A.z + oz + (B.z - A.z) * 0.3;
    // the rear fence runs along the block centre line: walk across it (perpendicular = toward avenue C)
    let nx = C.x - A.x, nz = C.z - A.z; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    return { x, z, nx, nz };
  };
  // collision cost per frame: every StaticColliders query / pointHit / raycast2D (outermost call timed), while the game runs
  // at a residential spot (traffic, peds, the player's car) and then while walking the player into a yard fence
  W.__w2ColPerf = async () => {
    const C = G().world.colliders, proto = Object.getPrototypeOf(C);
    let depth = 0, acc = 0, calls = 0;
    const wrap = (k) => { const f = proto[k]; if (f.__w2) return; const g = function (...a) { if (depth++) { try { return f.apply(this, a); } finally { depth--; } } const t = performance.now(); try { return f.apply(this, a); } finally { depth--; acc += performance.now() - t; calls++; } }; g.__w2 = f; proto[k] = g; };
    for (const k of ['query', 'pointHit', 'raycast2D']) wrap(k);
    const run = (n) => { const per = []; for (let i = 0; i < n; i++) { acc = 0; calls = 0; W.__frames(1); per.push([acc, calls]); } per.sort((u, v) => u[0] - v[0]); const ms = per.map(q => q[0]); return { mean: +(ms.reduce((u, v) => u + v, 0) / n).toFixed(3), p50: +ms[n >> 1].toFixed(3), p95: +ms[Math.floor(n * 0.95)].toFixed(3), calls: Math.round(per.reduce((u, v) => u + v[1], 0) / n) }; };
    prep(15.5);
    const v = VIEWS.yards_drone, A = X(...v.mid[0]), B = X(...v.mid[1]), fx = (A.x + B.x) / 2, fz = (A.z + B.z) / 2;
    const ne = G().world.graph.nearestEdge(fx, fz, 120);
    W.__look(null); W.__teleport(ne.x, ne.z); W.__hbSafe?.(ne.x, ne.z); await W.__bld5Settle(); W.__frames(120);
    const drive = run(600);
    const st = W.__world.buildings.stats, list = C.list.length;
    const fence = await W.__w2Fence('perf');
    for (const k of ['query', 'pointHit', 'raycast2D']) if (proto[k].__w2) proto[k] = proto[k].__w2;
    return { drive, cols: list, yardCols: st.yardCols, dropped: st.yardColsDropped, filterMs: +(st.yardFilterMs || 0).toFixed(1), fenceWalked: fence.walked };
  };
  W.__w2Fence = async (suf = 'x', spot = W.__w2FenceSpot()) => {
    prep(15.5);
    const { x, z, nx, nz } = spot;
    const sx = x - nx * 3, sz = z - nz * 3;
    W.__look(null); W.__teleport(sx, sz, { foot: true }); W.__hbSafe?.(sx, sz);
    await W.__bld5Settle(); W.__teleport(sx, sz, { foot: true }); await W.__bld5Settle(20);
    const P = G().player, rig = G().rig.rig;
    P.pos.set(sx, gy(sx, sz), sz); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-nx, -nz);
    rig.orbitYaw = Math.atan2(-nx, -nz);    // camera behind the player (forward = -sin / -cos of the orbit yaw)
    const fwd = -(Math.sin(rig.orbitYaw)), fwdz = -(Math.cos(rig.orbitYaw));
    W.__autopilot = (inp) => { inp.axes.moveY = 1; inp.axes.moveX = 0; };
    const track = [];
    for (let k = 0; k < 180; k++) { rig.orbitYaw = Math.atan2(-nx, -nz); W.__frames(1); if (k % 30 === 0) track.push(+((P.pos.x - sx) * nx + (P.pos.z - sz) * nz).toFixed(2)); }
    W.__autopilot = null;
    const along = (P.pos.x - sx) * nx + (P.pos.z - sz) * nz;
    const fences = G().world.colliders.query(x, z, 6, []).filter(c => c.kind === 'fence').length;
    // camera: over the shoulder, a little high, looking along the walk
    const px = P.pos.x, pz = P.pos.z, py = P.pos.y;
    W.__look(px - nx * 4.5 + nz * 1.5, py + 2.6, pz - nz * 4.5 - nx * 1.5, px + nx * 4, py + 0.8, pz + nz * 4);
    W.__frames(3);
    const f = await W.__shot(`world2_fence_collide_${suf}`, 1280, 720);
    W.__look(null);
    return { f, walked: +along.toFixed(2), track, fenceCols: fences, dir: [fwd, fwdz] };
  };
})();
