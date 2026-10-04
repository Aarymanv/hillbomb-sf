// dev-only car capture rig (not shipped). In the game page:
//   await import('http://127.0.0.1:5190/dev/carshots.js?' + Date.now()); await __carShots('before')
// Writes shots/car_<hero|wheel|traffic|parked|night>_<suffix>.jpg with fixed cameras (same framing before/after).
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
// hero spot: Steiner St by Alamo Square (Painted Ladies), car parked on the street heading along it
export const SPOTS = {
  hero: [104, 372], traffic: [1500, -25], parked: [1530, -40],
};
function setMode(hours, wx) {
  W.__G.weather.set(wx, { transition: 0 }); W.__G.weather.auto = false;
  W.__env.state.hours = hours; W.__env.state.paused = true;
}
// place the player car on the nearest street, return its local->world helper
function placeHero(x, z) {
  const g = W.__world.graph, n = g.nearestEdge(x, z, 200), e = n.edge, k = Math.min(n.k, e.pts.length - 2);
  const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
  const yaw = Math.atan2(-dx, -dz);
  W.__teleport(n.x, n.z, { yaw });
  const v = W.__G.player.vehicle; v.body.vel.set(0, 0, 0);
  v.input.brake = 1; v.input.handbrake = 1; v.input.throttle = 0;
  return v;
}
function camRel(v, lx, ly, lz, tx, ty, tz) {
  W.__frames(1);
  const r = v.root; r.updateMatrixWorld(true);
  const a = r.localToWorld(new (r.position.constructor)(lx, ly, lz)), b = r.localToWorld(new (r.position.constructor)(tx, ty, tz));
  W.__look(a.x, a.y, a.z, b.x, b.y, b.z);
}
W.__carCam = {
  hero: (v) => camRel(v, -3.6, 1.15, -4.4, 0, 0.55, -0.3),
  wheel: (v) => { const s = v.visual.spec; camRel(v, -1.95, 0.42, s.axleFZ - 0.95, -s.trackF / 2, s.wheelRadius, s.axleFZ); },
  night: (v) => camRel(v, 3.4, 1.0, 5.2, 0, 0.6, 0.2),
};
W.__carShots = async (suffix, which = ['hero', 'wheel', 'traffic', 'parked', 'night']) => {
  W.__manual = true; const out = [];
  if (W.__G.traffic) W.__G.traffic.density = 1;
  const heroShots = which.filter(w => w === 'hero' || w === 'wheel' || w === 'night');
  if (heroShots.length) {
    let v = placeHero(...SPOTS.hero); await settle(); v = placeHero(...SPOTS.hero); W.__frames(30);
    for (const w of heroShots) {
      if (w === 'night') setMode(21.3, 'rain'); else setMode(18.2, 'clear');
      v = placeHero(...SPOTS.hero); W.__frames(40); v.body.vel.set(0, 0, 0);
      W.__carCam[w](v); W.__frames(3);
      const nm = `car_${w}_${suffix}`; await W.__shot(nm); out.push(nm);
    }
  }
  if (which.includes('traffic')) {
    setMode(17.6, 'clear');
    W.__teleport(SPOTS.traffic[0] - 40, SPOTS.traffic[1] - 30); await settle(); W.__frames(240);
    W.__street(...SPOTS.traffic, { h: 1.6, side: 2.5 }); W.__frames(3);
    const nm = `car_traffic_${suffix}`; await W.__shot(nm); out.push(nm);
  }
  if (which.includes('parked')) {
    setMode(15.5, 'clear');
    W.__teleport(SPOTS.parked[0] + 30, SPOTS.parked[1] + 30); await settle();
    W.__street(...SPOTS.parked, { h: 1.25, side: W.__parkSide ?? -2.6, flip: !!W.__parkFlip, ahead: 25 }); W.__frames(3);
    const nm = `car_parked_${suffix}`; await W.__shot(nm); out.push(nm);
  }
  return out;
};
