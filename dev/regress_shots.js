// Visual regression set: a fixed list of key views captured with the real chase camera (player car parked on the street,
// heading along it) so look / lighting / streaming passes can be compared before -> after.
//   in the game page (any tab, hidden is fine; a fresh / ?sandbox profile needs &prologue=0, and keep &mute):
//     for (const f of ['sky_shots.js', 'flicker_probe.js', 'regress_shots.js']) await import('http://127.0.0.1:5190/dev/' + f);
//     await __regShot('grant', 'before')        -> shots/reg_grant_before.jpg
//     await __regAll('after')                   -> every view in REG_VIEWS (~8 shots, ~1-2 min)
//   then build a side-by-side sheet: python dev/sheet.py (or open the pairs).
// Views are chase-cam framings like the player's own screenshots (shots/REG_now_*.webp); the car sits t of the way from
// intersection a to b, heading toward b. hours / weather are pinned (env paused, weather locked, wetness forced).
(() => {
  const W = window;
  const V = W.REG_VIEWS = {
    grant:      { a: ['Grant Avenue', 'Clay Street'], b: ['Grant Avenue', 'Washington Street'], t: 0.30, h: 21.5, wx: 'rain' },
    washington: { a: ['Washington Street', 'Kearny Street'], b: ['Washington Street', 'Grant Avenue'], t: 0.35, h: 21.5, wx: 'rain' },
    kearny:     { a: ['Kearny Street', 'Sacramento Street'], b: ['Kearny Street', 'Clay Street'], t: 0.45, h: 21.5, wx: 'rain' },
    market:     { a: ['Market Street', '4th Street'], b: ['Market Street', '3rd Street'], t: 0.4, h: 21.5, wx: 'rain' },
    mission:    { a: ['24th Street', 'Folsom Street'], b: ['24th Street', 'Harrison Street'], t: 0.25, h: 22, wx: 'clear' },
    tenderloin: { a: ['Ellis Street', 'Leavenworth Street'], b: ['Ellis Street', 'Jones Street'], t: 0.35, h: 22.5, wx: 'clear' },
    day:        { a: ['Jackson Street', 'Kearny Street'], b: ['Jackson Street', 'Grant Avenue'], t: 0.93, h: 14, wx: 'clear' },   // ~ shots/REG_old_jackson_day_LIKED.webp
    dayhill:    { a: ['Hyde Street', 'Chestnut Street'], b: ['Hyde Street', 'Bay Street'], t: 0.1, h: 16.5, wx: 'clear' },
    // free camera (no car): low, looking up the street with the sky in frame, like REG_old_jackson_day_LIKED.webp
    jacksonsky: { a: ['Jackson Street', 'Grant Avenue'], b: ['Jackson Street', 'Kearny Street'], t: 0.0, h: 13.5, wx: 'clear', free: { back: 6, side: 4, eye: 1.3, up: 9, ahead: 60 } },
  };
  W.__regPlace = (name) => {
    const v = V[name], g = W.__G.world.graph, A = g.intersection(...v.a), B = g.intersection(...v.b);
    if (!A || !B) throw new Error('no intersection ' + name);
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    // keep right of the centre line (one lane)
    const x = A.x + dx * L * v.t - dz * (v.side ?? 1.8), z = A.z + dz * L * v.t + dx * (v.side ?? 1.8);
    if (v.free) {
      const F = v.free, px = A.x - dx * F.back - dz * F.side, pz = A.z - dz * F.back + dx * F.side, py = W.__world.groundAt(px, pz, 999) + F.eye;
      W.__teleport(px - dx * 20, pz - dz * 20); W.__hbSafe(px - dx * 20, pz - dz * 20);
      W.__look(px, py, pz, px + dx * F.ahead, py + F.up, pz + dz * F.ahead);
      return [px, pz];
    }
    W.__look(null);
    // (10/2) chase views start IN the car: free-camera views (ctshots.js, jacksonsky) leave the player on foot
    const P = W.__G.player;
    if (P.vehicle) W.__regCar = P.vehicle;
    else { const car = W.__regCar || W.__ctCar; if (car) P.setVehicle(car); }
    if (P.vehicle && !P.vehicle.root.parent) W.__scene.add(P.vehicle.root);
    W.__teleport(x, z, { yaw: Math.atan2(-dx, -dz) }); W.__hbSafe(x, z, Math.atan2(-dx, -dz));
    return [x, z];
  };
  // (10/1) the harness drops the car among parked cars / pedestrians: collisions gave wanted stars, a cop busted the idle car
  // and the police respawned it at a station across the city (washington / mission / dayhill came out as parks)
  // (10/2) the real culprit: the car's lastSafe stayed at the far-west spawn. A car dropped before the road tile streamed
  // falls (y < -60) or lands in the Bay, the game's recovery calls resetToSafe() and the shot is of a Sunset park.
  // Every harness teleport now also moves lastSafe to the new spot.
  W.__hbSafe = (x, z, yaw = 0) => { const s = W.__G.player?.lastSafe; if (s) Object.assign(s, { x, y: W.__G.world.groundAt(x, z, 999), z, yaw, t: 1.5 }); };
  // ... and in a fresh profile (?sandbox) the festival prologue runs: its "lost > 35 m from the route for 4 s" rule puts
  // the car back on the prologue route out west. Open the page with ?mute&sandbox&prologue=0 (skipping it mid-run starts
  // the arrival flyover instead); the harness warns.
  W.__regNoPolice = () => { if (W.__G.festival?.activity?.kind === 'prologue') console.warn('[regress] festival prologue running: open the page with &prologue=0'); const P = W.__G.police; if (!P) return; if (!P.__hbNoop) { P.__hbNoop = true; P.addStars = () => {}; } P.clear?.(); P.stars = 0; P.bustT = 0; };
  W.__regShot = async (name, suf = 'x') => {
    const v = V[name];
    W.__regNoPolice();
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__manual = true; W.__setWx(v.wx); W.__env.state.hours = v.h; W.__env.state.paused = true;
    W.__regPlace(name); await W.__settle(); W.__regPlace(name); await W.__settle(); W.__frames(30);
    return W.__shot(`reg_${name}_${suf}`, 1280, 720);
  };
  W.__regAll = async (suf, names = Object.keys(V)) => { const out = []; for (const n of names) out.push(await W.__regShot(n, suf)); return out; };
})();
