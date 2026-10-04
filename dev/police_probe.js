// Police arrival probe (dev). Load in a `/?sandbox&mode=gta&mute` page:
//   await import('http://127.0.0.1:5190/dev/police_probe.js?' + Date.now())
//   await __copProbe()            -> per downtown spot: seconds until the first unit is < 30 m from a parked suspect (2 stars),
//                                    and every pursuit spawn: road distance, straight distance, one-way + travel direction
// Render is stubbed; the player sits in a stopped car on the street at each spot (the camera looks along the street).
const W = window;
const yieldT = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
// downtown spots on / next to one-way grids (FiDi, Union Square, Tenderloin, SoMa, Chinatown, North Beach)
// (real lat/lon -> 1:1 world through the game's own projection: TESTING.md's x/z spots are the old half-scale map)
const LL = { fidi: [37.7929, -122.4026], unionsq: [37.7873, -122.4083], tenderloin: [37.7838, -122.4123], soma: [37.7795, -122.4045], chinatown: [37.7956, -122.4066], northbeach: [37.8003, -122.4100] };
W.COP_SPOTS = Object.fromEntries(Object.entries(LL).map(([k, [la, lo]]) => [k, W.__world.ll(la, lo)]));
W.__copProbe = async ({ spots = Object.keys(W.COP_SPOTS), secs = 25, runs = 2 } = {}) => {
  const G = W.__G, P = G.police, Rr = W.__renderer, orig = Rr.render, pr = G.post?.render; Rr.render = () => {}; if (G.post) G.post.render = () => {};
  W.__manual = true; const out = {};
  try {
    for (const name of spots) {
      const res = [];
      for (let run = 0; run < runs; run++) {
        const [x0, z0] = W.COP_SPOTS[name], n = G.world.graph.nearestEdge(x0, z0, 80, e => e.main !== false && !e.deck && e.width >= 6);
        const e = n.edge, k = Math.min(n.k ?? 0, e.pts.length - 2), dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
        P.clear(); for (const c of P.cops.slice()) P.spawnCop && G.removeVehicle(c.v); P.cops.length = 0;
        W.__teleport(n.x, n.z, { yaw: Math.atan2(-dx, -dz) });
        const pv = G.player.vehicle; pv.body.vel.set(0, 0, 0);
        W.__autopilot = (input) => { input.axes.throttle = 0; input.axes.brake = 1; input.axes.steer = 0; };
        for (let i = 0; i < 120; i++) { G.state = 'play'; W.__frames(1); }
        P.addStars(2, 'probe');
        let t = 0, first = null; const seen = new Set(), spawns = [];
        for (let f = 0; f < secs * 60; f++) {
          G.state = 'play'; W.__frames(1); t += 1 / 60;
          for (const c of P.cops) { if (!seen.has(c)) { seen.add(c); const s = c.spawn || {}; spawns.push({ t: +t.toFixed(1), d: Math.round(s.d ?? Math.hypot(c.v.pos.x - n.x, c.v.pos.z - n.z)), road: s.routeL != null ? Math.round(s.routeL) : null, oneway: s.oneway ? (s.dir > 0 ? 'legal' : 'WRONG') : '-' }); } }
          const d = Math.min(...P.cops.filter(c => !c.v.wrecked).map(c => Math.hypot(c.v.pos.x - pv.pos.x, c.v.pos.z - pv.pos.z)), 1e9);
          if (first == null && d < 30) first = +t.toFixed(1);
          if (f % 240 === 0) await yieldT();
          if (first != null && t > first + 1) break;
        }
        res.push({ first, spawns: spawns.slice(0, 4) });
        P.clear(); W.__autopilot = null;
      }
      out[name] = res;
    }
  } finally { Rr.render = orig; if (pr) G.post.render = pr; W.__autopilot = null; }
  return out;
};
