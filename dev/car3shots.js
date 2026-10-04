// dev-only capture rig for the car body pass 3 (not shipped). In the game page (or via dev/car3cdp.mjs):
//   await import('http://127.0.0.1:5190/dev/car3shots.js?' + Date.now()); await __car3Shots('before', ['sedan', 'tora'])
// Writes shots/car3_<front|rear|side|cockpit_day|cockpit_night>_<car>_<suffix>.jpg (same cameras before / after) and
// shots/car3_traffic_<suffix>.jpg.
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
const HERO = [104, 372], TRAFFIC = [1500, -25];
function setMode(hours, wx) {
  W.__G.weather.set(wx, { transition: 0 }); W.__G.weather.auto = false;
  W.__env.state.hours = hours; W.__env.state.paused = true;
}
function streetPose(x, z) {
  const g = W.__world.graph, n = g.nearestEdge(x, z, 200), e = n.edge, k = Math.min(n.k, e.pts.length - 2);
  const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
  return { x: n.x, z: n.z, yaw: Math.atan2(-dx, -dz) };
}
function useCar(id) {
  const G = W.__G, P = G.player, p = streetPose(...HERO);
  let v = P.vehicle;
  if (!v || v.id !== id) {
    if (v) { P.exitVehicle(true); G.removeVehicle(v); }
    v = G.spawnVehicle(id, p.x, p.z, p.yaw, { role: 'player' });
    P.setVehicle(v);
  }
  for (const o of (typeof G.vehicles === 'function' ? G.vehicles() : []).slice()) if (o !== P.vehicle && o.root && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < 14) G.removeVehicle(o);
  W.__teleport(p.x, p.z, { yaw: p.yaw });
  v = P.vehicle; v.body.vel.set(0, 0, 0);
  v.input.brake = 1; v.input.handbrake = 1; v.input.throttle = 0;
  return v;
}
function camRel(v, lx, ly, lz, tx, ty, tz) {
  W.__frames(1);
  const r = v.root; r.updateMatrixWorld(true);
  const a = r.localToWorld(new (r.position.constructor)(lx, ly, lz)), b = r.localToWorld(new (r.position.constructor)(tx, ty, tz));
  W.__look(a.x, a.y, a.z, b.x, b.y, b.z);
}
const CAMS = {
  front: (v) => camRel(v, -2.9, 0.95, -3.9, 0, 0.55, -0.6),
  rear: (v) => camRel(v, 2.9, 1.0, 4.1, 0, 0.6, 0.5),
  side: (v) => camRel(v, -5.6, 0.85, 0.1, 0, 0.62, 0.1),
};
W.__car3Shots = async (suffix, ids = ['sedan'], which = ['front', 'rear', 'side', 'cockpit_day', 'cockpit_night'], traffic = true) => {
  W.__manual = true; const out = [], G = W.__G;
  if (G.traffic) G.traffic.density = 1;
  for (const id of ids) {
    let v = useCar(id); await settle(); v = useCar(id); W.__frames(30);
    for (const w of which) {
      const night = w === 'cockpit_night';
      setMode(night ? 21.4 : (W.__c3Hours ?? 16.8), 'clear');
      v = useCar(id); W.__frames(40); v.body.vel.set(0, 0, 0);
      if (w.startsWith('cockpit')) { W.__look(null); G.rig.rig.mode = 'cockpit'; G.rig.snap?.(); W.__frames(60); }
      else { G.rig.rig.mode = 'chase'; CAMS[w](v); W.__frames(3); }
      const nm = `car3_${w}_${id}_${suffix}`; await W.__shot(nm); out.push(nm);
      if (w.startsWith('cockpit')) G.rig.rig.mode = 'chase';
    }
  }
  if (traffic) {
    setMode(W.__c3Hours ?? 16.8, 'clear');
    W.__teleport(TRAFFIC[0] - 40, TRAFFIC[1] - 30); await settle(); W.__frames(240);
    W.__street(...TRAFFIC, { h: 1.6, side: 2.5 }); W.__frames(3);
    const nm = `car3_traffic_${suffix}`; await W.__shot(nm); out.push(nm);
  }
  return out;
};
