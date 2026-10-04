// dev-only capture rig for cars pass 4 (doors, cabin materials, EV light bar, 45 sculpted bodies). Not shipped.
//   node dev/car3cdp.mjs "http://127.0.0.1:5190/?play&mute&prologue=0" dev/car4run.js   (car4run.js imports this + calls __car4Shots)
// Writes shots/car4_<doors_enter|doors_exit|cockpit_night|cockpit_day|ev_tail_night|parked_street>_<suffix>_<k>.jpg
// (frame strips; dev/car4_sheet.py stitches them into car4_<name>_<suffix>.jpg).
const W = window;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function settle(maxIt = 40) {
  const b = W.__world.buildings, s = W.__world.stream;
  for (let k = 0; k < maxIt; k++) {
    W.__frames(10); await wait(50);
    const st = b?.stats || {};
    if (k > 6 && !st.queued && !st.inflight && !(s?.stats?.pending)) break;
  }
  W.__frames(20);
}
const HERO = [104, 372];
function setMode(hours, wx = 'clear') {
  W.__G.weather.set(wx, { transition: 0 }); W.__G.weather.auto = false;
  W.__env.state.hours = hours; W.__env.state.paused = true;
}
function streetPose(x, z) {
  const g = W.__world.graph, n = g.nearestEdge(x, z, 200), e = n.edge, k = Math.min(n.k, e.pts.length - 2);
  const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
  return { x: n.x, z: n.z, yaw: Math.atan2(-dx, -dz), dx, dz };
}
const assetIn = (id) => new Promise((res) => { let done = false; if (W.__hbCarAsset) W.__hbCarAsset(id, () => { done = true; res(true); }); const t0 = performance.now(); (function tick() { if (done) return; if (performance.now() - t0 > 15000) { res(false); return; } setTimeout(tick, 100); })(); });
async function useCar(id, clearR = 14) {
  const G = W.__G, P = G.player, p = streetPose(...HERO);
  await assetIn(id);
  let v = P.vehicle;
  if (!v || v.id !== id) {
    if (v) { P.exitVehicle(true); G.removeVehicle(v); }
    v = G.spawnVehicle(id, p.x, p.z, p.yaw, { role: 'player' });
    P.setVehicle(v);
  }
  for (const o of G.vehicles().slice()) if (o !== P.vehicle && o.root && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < clearR) G.removeVehicle(o);
  W.__teleport(p.x, p.z, { yaw: p.yaw });
  v = P.vehicle; v.body.vel.set(0, 0, 0);
  v.input.brake = 1; v.input.handbrake = 1; v.input.throttle = 0;
  return v;
}
function camRel(v, lx, ly, lz, tx, ty, tz) {
  const r = v.root; r.updateMatrixWorld(true);
  const V3 = r.position.constructor;
  const a = r.localToWorld(new V3(lx, ly, lz)), b = r.localToWorld(new V3(tx, ty, tz));
  W.__look(a.x, a.y, a.z, b.x, b.y, b.z);
}
async function strip(name, n, step, cam) {
  const out = [];
  for (let i = 0; i < n; i++) { step(i); cam(); W.__frames(1); out.push(await W.__shot(`${name}_${i}`, 640, 400)); }
  return out;
}
const run = (s) => { let t = 0; return (T) => { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } }; };

W.__car4Shots = async (suffix, which = ['doors_enter', 'doors_exit', 'cockpit_day', 'cockpit_night', 'ev_tail_night', 'parked_street'], carId = 'sedan') => {
  W.__manual = true; const out = [], G = W.__G, P = G.player;
  if (W.__hbCab) W.__hbCab.gain = suffix === 'before' ? 3.2 : 6.0;   // the pre-pass-4 cabin gain for the before set
  if (G.traffic) G.traffic.density = 0;
  setMode(16.8);
  let v = await useCar(carId); await settle(); v = await useCar(carId); W.__frames(30);
  const doorCam = (v) => () => camRel(v, -4.3, 1.6, -2.4, -0.7, 0.85, 0.15);
  if (which.includes('doors_enter')) {
    setMode(13); v = await useCar(carId); W.__frames(20);
    P.exitVehicle(true); W.__frames(30);
    // stand 1.4 m off the driver door, facing it
    const b = v.body, yaw = b.yaw(), rx = Math.cos(yaw), rz = -Math.sin(yaw), o = v.root.position, sz = v.spec.seat[2];
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    P.pos.set(o.x - rx * (v.spec.width / 2 + 1.0) - fx * sz, o.y, o.z - rz * (v.spec.width / 2 + 1.0) - fz * sz); P.yaw = yaw - Math.PI / 2;
    W.__frames(10);
    const T = P.human.carTime ? P.human.carTime('enter') : 0.55;
    P.tryEnter();
    const go = run(); const ks = [0.18, 0.45, 0.75, 0.97];
    out.push(...await strip(`car4_doors_enter_${suffix}`, ks.length, (i) => go(ks[i] * T), doorCam(v)));
    W.__frames(90);
  }
  if (which.includes('doors_exit')) {
    setMode(13); v = await useCar(carId); W.__frames(30);
    const T = P.human.carTime ? P.human.carTime('exit') : 0.6;
    P.exitVehicle();
    const go = run(); const ks = [0.12, 0.4, 0.75, 1.0];
    out.push(...await strip(`car4_doors_exit_${suffix}`, ks.length, (i) => go(ks[i] * T), doorCam(v)));
    // and walking away: the door swings shut behind
    P.pos.x += 0; W.__frames(10);
    W.__frames(240);
    v = await useCar(carId);
  }
  for (const w of ['cockpit_day', 'cockpit_night']) {
    if (!which.includes(w)) continue;
    const night = w === 'cockpit_night';
    setMode(night ? 21.4 : 16.8);
    v = await useCar(carId); W.__frames(40); v.body.vel.set(0, 0, 0);
    W.__look(null); G.rig.rig.mode = 'cockpit'; G.rig.snap?.(); W.__frames(60);
    const nm = `car4_${w}_${suffix}_0`; await W.__shot(nm); out.push(nm);
    // second frame: from the driver's eye towards the centre console / passenger door (trim materials)
    const e = v.spec.seat; camRel(v, e[0] + 0.05, e[1] - 0.02, e[2] + 0.12, 0.25, e[1] - 0.42, e[2] - 0.75); W.__frames(3);
    const nm2 = `car4_${w}_${suffix}_1`; await W.__shot(nm2); out.push(nm2);
    W.__look(null);
    G.rig.rig.mode = 'chase';
  }
  if (which.includes('ev_tail_night')) {
    setMode(21.4);
    v = await useCar('ev'); W.__frames(60); v.body.vel.set(0, 0, 0);
    G.rig.rig.mode = 'chase';
    // running tail lights (no brake): a parked-looking stop with the driver's foot off the brake
    camRel(v, 2.4, 1.05, 6.2, 0, 0.75, 0.6); W.__frames(3);
    let nm = `car4_ev_tail_night_${suffix}_0`; await W.__shot(nm); out.push(nm);
    camRel(v, 0.6, 0.95, 3.2, 0, 0.82, 1.6); W.__frames(3);
    nm = `car4_ev_tail_night_${suffix}_1`; await W.__shot(nm); out.push(nm);
    // running lights only (foot off the brake, nobody at the wheel)
    v.driver = null; v.input.brake = 0; v.input.handbrake = 1; W.__frames(20);
    camRel(v, 2.4, 1.05, 6.2, 0, 0.75, 0.6); W.__frames(3);
    nm = `car4_ev_tail_night_${suffix}_2`; await W.__shot(nm); out.push(nm);
    v.driver = 'player';
    v = await useCar(carId);
  }
  if (which.includes('parked_street')) {
    setMode(15.5);
    v = await useCar(carId, 60); W.__frames(20);
    const p = streetPose(...HERO), L = Math.hypot(p.dx, p.dz), dx = p.dx / L, dz = p.dz / L, nx = -dz, nz = dx;
    const ids = ['brawler', 'police', 'k3', 'kugel', 'trekker', 'van', 'hellion', 'seiun'];
    await Promise.all(ids.map(assetIn));
    const parked = [];
    ids.forEach((id, i) => {
      const s = 9 + i * 5.6, x = p.x + dx * s + nx * 3.4, z = p.z + dz * s + nz * 3.4;
      const pv = G.spawnVehicle(id, x, z, p.yaw, { role: 'parked', seed: 3 + i });
      pv.input.handbrake = 1; parked.push(pv);
    });
    W.__frames(90);
    const ex = p.x + dx * 2 + nx * 0.2, ez = p.z + dz * 2 + nz * 0.2, ey = W.__world.groundAt(ex, ez, 999) + 1.55;
    const tx = p.x + dx * 30 + nx * 3.4, tz = p.z + dz * 30 + nz * 3.4;
    W.__look(ex, ey, ez, tx, W.__world.groundAt(tx, tz, 999) + 0.6, tz); W.__frames(3);
    let nm = `car4_parked_street_${suffix}_0`; await W.__shot(nm); out.push(nm);
    const sx = p.x + dx * 26 + nx * 8.5, sz2 = p.z + dz * 26 + nz * 8.5;
    W.__look(sx, W.__world.groundAt(sx, sz2, 999) + 1.4, sz2, p.x + dx * 30 + nx * 3.4, W.__world.groundAt(tx, tz, 999) + 0.6, p.z + dz * 30 + nz * 3.4); W.__frames(3);
    nm = `car4_parked_street_${suffix}_1`; await W.__shot(nm); out.push(nm);
    for (const pv of parked) G.removeVehicle(pv);
  }
  W.__look(null);
  return out;
};
