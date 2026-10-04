// Chinatown hero set review views (tools/blender/hero_ctown.py). Load after sky_shots.js (needs __settle / __setWx):
//   for (const f of ['sky_shots.js', 'ctshots.js']) await import('http://127.0.0.1:5190/dev/' + f)
//   await __ctShot('wash', 'x')            -> shots/ct_wash_x.jpg (free camera, player parked behind the camera)
//   await __ctAll('x', ['wash', 'grant'])  -> several
// View: camera `off` m from intersection `at` toward `to`, `side` m right of the centre line, `eye` m above the road,
// looking along the street (`up` = target height offset at `ahead` m). Hours / weather pinned like the regression views.
(() => {
  const W = window;
  W.CT_VIEWS = {
    wash:   { at: ['Washington Street', 'Grant Avenue'], to: ['Washington Street', 'Kearny Street'], off: 6, side: 0.6, eye: 2.3, up: 0.6, h: 21.5, wx: 'rain', fov: 60 },
    grant:  { at: ['Grant Avenue', 'Jackson Street'], to: ['Grant Avenue', 'Washington Street'], off: 12, side: 0.0, eye: 2.3, up: 0.8, h: 21.5, wx: 'rain', fov: 60 },
    grantn: { at: ['Grant Avenue', 'Clay Street'], to: ['Grant Avenue', 'Washington Street'], off: 10, side: 0.0, eye: 2.3, up: 1.5, h: 21.5, wx: 'rain', fov: 60 },
    clay:   { at: ['Clay Street', 'Stockton Street'], to: ['Clay Street', 'Grant Avenue'], off: 25, side: 0.0, eye: 2.3, up: -2, h: 21.5, wx: 'rain', fov: 60 },
    gate:   { at: ['Grant Avenue', 'Bush Street'], to: ['Grant Avenue', 'Pine Street'], off: -48, side: 0.0, eye: 1.8, up: 3, h: 21.5, wx: 'rain', fov: 60 },
    waverly:{ at: ['Waverly Place', 'Clay Street'], to: ['Waverly Place', 'Washington Street'], off: 8, side: 0.0, eye: 1.8, up: 2, h: 21.5, wx: 'rain', fov: 60 },
    washday:{ at: ['Washington Street', 'Grant Avenue'], to: ['Washington Street', 'Kearny Street'], off: 6, side: 0.6, eye: 2.3, up: 0.6, h: 13.5, wx: 'clear', fov: 60 },
    grantday:{ at: ['Grant Avenue', 'Jackson Street'], to: ['Grant Avenue', 'Washington Street'], off: 12, side: 0.0, eye: 2.3, up: 0.8, h: 13.5, wx: 'clear', fov: 60 },
    sac:    { at: ['Sacramento Street', 'Grant Avenue'], to: ['Sacramento Street', 'Kearny Street'], off: -30, side: 0.0, eye: 2.3, up: -1.0, h: 21.5, wx: 'rain', fov: 60 },
    claye:  { at: ['Clay Street', 'Grant Avenue'], to: ['Clay Street', 'Kearny Street'], off: -30, side: 0.0, eye: 2.3, up: -1.0, h: 21.5, wx: 'rain', fov: 60 },
    jack:   { at: ['Jackson Street', 'Grant Avenue'], to: ['Jackson Street', 'Kearny Street'], off: -30, side: 0.0, eye: 2.3, up: -0.5, h: 21.5, wx: 'rain', fov: 60 },
    // the concept comparison framing (dev/ct_sheet.py): Sacramento St looking east past Grant toward the FiDi towers
    ref:    { at: ['Sacramento Street', 'Grant Avenue'], to: ['Sacramento Street', 'Kearny Street'], off: -30, side: 0.0, eye: 2.3, up: -1.0, h: 21.5, wx: 'rain', fov: 60 },
    refday: { at: ['Sacramento Street', 'Grant Avenue'], to: ['Sacramento Street', 'Kearny Street'], off: -30, side: 0.0, eye: 2.3, up: -1.0, h: 13.5, wx: 'clear', fov: 60 },
    // chase-cam drive-through frames (player car on Grant heading south)
    drive1: { at: ['Grant Avenue', 'Jackson Street'], to: ['Grant Avenue', 'Washington Street'], off: 30, side: 1.6, chase: true, h: 21.5, wx: 'rain' },
    drive2: { at: ['Grant Avenue', 'Clay Street'], to: ['Grant Avenue', 'Sacramento Street'], off: 35, side: 1.6, chase: true, h: 21.5, wx: 'rain' },
  };
  W.__ctPlace = (name, o = {}) => {
    const v = { ...W.CT_VIEWS[name], ...o }, g = W.__G.world.graph, A = g.intersection(...v.at), B = g.intersection(...v.to);
    if (!A || !B) throw new Error('no intersection ' + name);
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    if (v.chase) {
      const x = A.x + dx * v.off - dz * v.side, z = A.z + dz * v.off + dx * v.side;
      const P = W.__G.player; if (!P.vehicle && W.__ctCar) P.setVehicle(W.__ctCar);
      if (P.vehicle && !P.vehicle.root.parent) W.__scene.add(P.vehicle.root);     // (10/2) exitVehicle(true) detached the body: the chase frames had no car
      W.__look(null); W.__teleport(x, z, { yaw: Math.atan2(-dx, -dz) }); W.__hbSafe?.(x, z, Math.atan2(-dx, -dz)); return [x, z];
    }
    const px = A.x + dx * v.off - dz * v.side, pz = A.z + dz * v.off + dx * v.side;
    const gy = W.__G.world.groundAt(px, pz, 999), py = gy + v.eye;
    const ahead = 120, tx = px + dx * ahead, tz = pz + dz * ahead;
    const ty = W.__G.world.groundAt(px + dx * 30, pz + dz * 30, 999) + v.eye + v.up;
    if (W.__G.player.vehicle) W.__ctCar = W.__G.player.vehicle;
    W.__teleport(px - dx * 12, pz - dz * 12, { yaw: Math.atan2(-dx, -dz), foot: true }); W.__hbSafe?.(px - dx * 12, pz - dz * 12, Math.atan2(-dx, -dz));     // on foot: a car dropped among parked cars got rewound
    W.__look(px, py, pz, px + (tx - px), py + (ty - py) * (ahead / 30), tz);
    const cam = W.__camera; if (v.fov && cam) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
    return [px, pz];
  };
  W.__ctShot = async (name, suf = 'x', o = {}) => {
    const v = { ...W.CT_VIEWS[name], ...o };
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__regNoPolice?.();
    W.__manual = true; W.__setWx(v.wx); W.__env.state.hours = v.h; W.__env.state.paused = true;
    const near = () => { const p = W.__G.player.pos, c = W.__camera.position; return v.chase || Math.hypot(p.x - c.x, p.z - c.z) < 60; };
    for (let k = 0; k < 4; k++) {     // the player (stream focus) must really be here, or the city streams elsewhere
      W.__ctPlace(name, o); await W.__settle(150); W.__setWx(v.wx); W.__env.state.hours = v.h; W.__ctPlace(name, o); await W.__settle(150);
      if (near()) break;
    } await new Promise(r => setTimeout(r, 1500)); W.__frames(60);
    return W.__shot(`ct_${name}_${suf}`, o.w || 1280, o.hgt || 720);
  };
  W.__ctAll = async (suf, names = Object.keys(W.CT_VIEWS)) => { const out = []; for (const n of names) out.push(await W.__ctShot(n, suf)); return out; };
})();
