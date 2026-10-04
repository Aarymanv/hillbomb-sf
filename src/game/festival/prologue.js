// First-launch prologue: four short playable drives in different cars, places, times and weather, stitched with
// fades, lower-thirds and MC captions, then the arrival at the Main Stage (site flyover) and the starter-car pick.
// Hold BACK (Backspace / pad B) to skip.
import * as THREE from 'three';
import { PROLOGUE, STARTER_CARS, FESTIVAL } from './catalog.js';
import { threadKeysClean, makeRoute, makeTracker, trackUpdate, trackInit, routeAt, yawOf, clamp } from './util.js';

export function createPrologue(F) {
  const { G, world } = F;
  const PR = { active: null };
  const pt = {};
  PR.start = function () {
    const P = { i: -1, phase: 'fadeout', t: 0, seg: null, R: null, tr: null, skipT: 0, restore: F.setConditions({}), traffic: G.traffic.density, cp: 0 };
    PR.active = P;
    F.activity = { kind: 'prologue', P, end: () => PR.skip() };
    F.markers.setFilter(() => false);
    F.overlay.setFade(1);
    F.overlay.skip('Hold to skip', 0);
    next(P);
  };
  function next(P) {
    P.i++;
    if (P.i >= PROLOGUE.length) { arrive(P); return; }
    const seg = PROLOGUE[P.i];
    const th = threadKeysClean(world, seg.keys);
    if (!th) { next(P); return; }
    const R = makeRoute(world, th, { startS: 12, smoothIters: 1 });
    F.restoreCorridor(P.parked); P.parked = F.clearCorridor(R);
    P.seg = seg; P.R = R; P.t = 0; P.cp = 0; P.phase = 'drive';
    F.setConditions({ time: seg.time, weather: seg.weather, fog: seg.fog }, true);
    G.traffic.clear(); G.traffic.density = 0.25;
    const car = F.cars.byTags(seg.tags, seg.car);
    routeAt(R, 6, pt);
    const pv = F.cars.spawnPlayer(car, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y);
    pv.health = 100;
    // a little rolling start
    pv.body.vel.set(pt.dx * 14, 0, pt.dz * 14);
    P.tr = makeTracker(R); trackInit(R, P.tr, pv.pos.x, pv.pos.z);
    F.line.set(R);
    P.gates = [];
    const n = Math.max(2, Math.round((R.L - 12) / 220));
    for (let k = 1; k <= n; k++) P.gates.push(12 + (R.L - 12) * k / n);
    placeGate(P);
    G.rig.snap();
    F.overlay.fadeTo(0, 1.8);
    F.overlay.lower(seg.title, seg.sub, F.cars.name(car), 4600);
    F.say(seg.caption || []);
    G.gps.points = R.pts; G.gps.color = '#ff2e7e';
  }
  function placeGate(P) {
    const s = P.gates[P.cp];
    if (s == null) { F.gates.set(0, null); return; }
    routeAt(P.R, Math.min(P.R.L - 1, s), pt);
    const last = P.cp === P.gates.length - 1;
    F.gates.set(0, { x: pt.x, y: pt.y, z: pt.z, dx: pt.dx, dz: pt.dz, w: Math.max(12, pt.w + 2), color: '#ff2e7e', style: P.R.off[pt.i] ? 'xc' : 'road', finish: last });
  }
  PR.update = function (dt) {
    const P = PR.active; if (!P) return;
    F.gates.update(dt);
    // hold to skip
    if (G.input.held('back') && P.phase !== 'arrive') { P.skipT += dt; F.overlay.skip('Hold to skip', clamp(P.skipT / 1.1, 0, 1)); if (P.skipT > 1.1) { PR.skip(); return; } }
    else if (P.skipT > 0) { P.skipT = Math.max(0, P.skipT - dt * 2); F.overlay.skip('Hold to skip', P.skipT / 1.1); }
    if (P.phase === 'drive') {
      const pv = G.player.vehicle; if (!pv) return;
      P.t += dt;
      trackUpdate(P.R, P.tr, pv.pos.x, pv.pos.z);
      F.line.update(P.tr.s, pv.body.speed, P.R.L);
      if (P.gates[P.cp] != null && P.tr.s >= P.gates[P.cp] - 2) { P.cp++; G.audio?.ui('checkpoint'); placeGate(P); }
      if (G.input.pressed('reset')) { routeAt(P.R, Math.max(0, P.tr.s - 4), pt); F.cars.place(pv, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y); G.rig.snap(); }
      // first minutes of the game: never leave a new player wedged against a wall / off the route until the segment times
      // out (Hyde St at speed into a front yard sat 40 s). 3 s stuck with the throttle down, or 4 s far off the line, puts
      // the car back on the route a little further on.
      const stuck = pv.body.speed < 1.5 && pv.input.throttle > 0.3, lost = P.tr.dist > 35;
      P.stuckT = stuck || lost ? (P.stuckT || 0) + dt : 0;
      if (P.stuckT > (lost ? 4 : 3)) { routeAt(P.R, Math.min(P.R.L - 10, P.tr.s + (lost ? 0 : 12)), pt); F.cars.place(pv, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y); pv.body.vel.set(pt.dx * 8, 0, pt.dz * 8); G.rig.snap(); P.stuckT = 0; }
      const end = P.tr.s >= P.R.L - 8 || P.t > P.seg.limit;
      if (end) { P.phase = 'fadeout'; F.overlay.fadeTo(1, 2.2); F.gates.hideAll(); }
    } else if (P.phase === 'fadeout') {
      const pv = G.player.vehicle; if (pv) { pv.input.throttle *= 0.5; }
      if (F.overlay.fade >= 0.999) next(P);
    } else if (P.phase === 'arrive') {
      P.t += dt;
    }
  };
  PR.skip = function () {
    const P = PR.active; if (!P || P.phase === 'arrive') return;
    F.overlay.clearCaptions();
    F.overlay.setFade(1);
    F.gates.hideAll(); F.line.clear();
    P.i = PROLOGUE.length - 1;
    arrive(P);
  };
  // ---------------------------------------------------------------- arrival: flyover, welcome, starter car
  function arrive(P) {
    P.phase = 'arrive'; P.t = 0;
    F.restoreCorridor(P.parked); P.parked = null;
    F.overlay.skip(null);
    F.gates.hideAll(); F.line.clear(); G.gps.points = null;
    F.setConditions({ time: 18.35, weather: 'clear', fog: 0 }, true);
    G.traffic.density = P.traffic;
    const site = F.sites.main();
    F.S.prologue = 1; F.save();
    F.refreshWorld();
    if (!site || site.broken) { done(P, null); return; }
    const fr = site.fr;
    // park the last car at the hub, facing into the site
    const pv = G.player.vehicle;
    if (pv) F.cars.place(pv, site.hub.x, site.hub.z, fr.yaw);
    G.rig.snap();
    F.overlay.fadeTo(0, 1.2);
    const cx = site.x, cz = site.z;
    F.cinematic(7.5, (cam, dt, t) => {
      const a = fr.yaw + 0.9 - t * 0.2, r = 64 - t * 3.2;
      cam.position.set(cx + Math.sin(a) * r, site.y + 26 - t * 2, cz + Math.cos(a) * r);
      cam.lookAt(cx - Math.sin(fr.yaw) * 6, site.y + 5, cz - Math.cos(fr.yaw) * 6);
    }, () => done(P, site));
    F.after(1.2, () => F.overlay.banner('Welcome to the', `${FESTIVAL.name}`, 'San Francisco', '#ff2e7e', 4600, 'levelup'));
    F.say([['lena', 'There you are! I am Lena, I run this circus. The whole city is our racetrack for the next few weeks.'], ['lena', 'First things first: every festival driver needs their own car. Pick one. It is yours.']]);
  }
  async function done(P, site) {
    const key = await F.screens.starterPick(STARTER_CARS.map(s => ({ ...s, key: F.cars.exists(s.key) ? s.key : F.cars.bestFor('B') })));
    await F.cars.give(key, 'starter');
    F.cars.setCurrent(key);
    F.S.starter = key;
    if (site) { const pv = F.cars.spawnPlayer(key, site.hub.x, site.hub.z, site.fr.yaw); pv.health = 100; }
    F.restoreConditions(P.restore, { keepTime: true });
    G.traffic.density = P.traffic;
    PR.active = null; F.activity = null;
    F.markers.setFilter(null);
    F.setStat('prologue', 1);
    F.refreshWorld();
    F.overlay.banner('Chapter 1', 'Opening Night', 'Earn Festival Points to grow the festival', '#ff2e7e', 3600);
    F.say([['lena', 'Races, stunts, stories, whatever you like: it all earns Festival Points. Enough of them and we open new outposts around the city.'], ['dex', 'The Marina Sprint starts right outside the gates. Go on, the crowd is watching.']]);
    F.save();
  }
  PR.running = () => !!PR.active;
  void THREE;
  return PR;
}
