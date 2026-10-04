// Story chains: character-led missions with dialogue captions, varied objectives and 1-3 stars.
// Kinds: tail, tag, race, drag, reach, speed, air, drift, smash, nearmiss, fare.
import * as THREE from 'three';
import { STORIES, CHARACTERS, RIVALS } from './catalog.js';
import { Driver } from '../drivers.js';
import { threadKeysClean, makeRoute, makeTracker, trackUpdate, trackInit, routeAt, snapRoad, roadPath, ll, fmtTime, fmtNum, clamp, yawOf, speedVal, offsetPts } from './util.js';
import { createDriftMeter } from './drift.js';

const NPC = {
  frankie: { id: 'frankie', nick: 'Frankie', name: 'Frankie Delgado', color: '#ff8a1d', skill: 0.92, aggr: 0.6, prefers: ['muscle', 'brawler'], home: 'Russian Hill' },
  rook: { id: 'rook', nick: 'Rook', name: 'Rook', color: '#8e7cff', skill: 0.95, aggr: 0.7, prefers: ['kaminari', 'tora', 'coupe'], home: 'SoMa' },
  kai: { id: 'kai', nick: 'Kai', name: 'Kai Mendes', color: '#b25cff', skill: 1.0, aggr: 0.6, prefers: ['elektra', 'corsair', 'super'], home: 'SoMa' },
};
const _f = new THREE.Vector3();

export function createStories(F) {
  const { G, world } = F;
  const SY = { list: STORIES, active: null };
  const pt = {};
  const rec = (sid) => (F.S.stories[sid] ||= {});
  SY.starsOf = (sid, mid) => rec(sid)[mid] || 0;
  SY.completed = sid => STORIES.find(s => s.id === sid).missions.filter(m => SY.starsOf(sid, m.id) > 0).length;
  SY.next = function (story) { for (const m of story.missions) if (!SY.starsOf(story.id, m.id)) return m; return null; };
  SY.available = story => F.chapter() >= story.chapter && F.S.prologue;

  // ---------------------------------------------------------------- start points on the map
  const startPt = m => { const [lat, lon, hint] = m.start; return snapRoad(world, lat, lon, hint || null, 300); };
  SY.refreshMarkers = function () {
    for (const s of STORIES) {
      F.markers.remove('story:' + s.id);
      if (!F.enabled() || !SY.available(s)) continue;
      const m = SY.next(s) || s.missions[s.missions.length - 1];
      const p = startPt(m); if (!p) continue;
      const done = !SY.next(s);
      F.markers.add({ id: 'story:' + s.id, kind: 'story', icon: 'story', group: 'event', x: p.x, z: p.z, color: s.color, title: `${s.name}: ${m.name}`, sub: done ? 'Story complete · replay' : `Story · mission ${s.missions.indexOf(m) + 1} / ${s.missions.length}`,
        meta: `${CHARACTERS[s.host].name} · ${m.desc}`, beamH: 120, data: { s, m } });
      s._p = p; s._m = m;
    }
  };
  let scanT = 0, near = null;
  SY.update = function (dt) {
    if (SY.active) { tick(SY.active, dt); return; }
    if (F.activity || F.busy()) { if (near) { F.overlay.prompt('story', null); near = null; } return; }
    scanT -= dt;
    if (scanT <= 0) {
      scanT = 0.25; near = null;
      const pv = G.player.vehicle;
      if (pv) for (const s of STORIES) if (s._p && SY.available(s) && Math.hypot(s._p.x - pv.pos.x, s._p.z - pv.pos.z) < 16) near = s;
      if (near) { const m = near._m; F.overlay.prompt('story', { kicker: `Story · ${near.name}`, title: m.name, sub: CHARACTERS[near.host].name + ' · ' + m.desc, color: near.color, action: '<span><kbd>E</kbd>Start mission</span>' }); }
      else F.overlay.prompt('story', null);
    }
    if (near && G.input.pressed('interact')) { F.overlay.prompt('story', null); const s = near; near = null; SY.open(s, s._m); }
  };

  // ---------------------------------------------------------------- open: briefing -> car -> mission
  SY.open = async function (story, m) {
    const go = await F.screens.mission(story, m);
    if (!go) return;
    let carKey = m.car, loaner = false;
    if (carKey) { loaner = !F.cars.owns(carKey); if (!F.cars.exists(carKey)) carKey = F.cars.bestFor(m.cls || 'B'); }
    else { const c = await F.chooseCar({ cls: m.cls || 'A', title: m.name, kicker: story.name }); if (!c) return; carKey = c.key; loaner = c.loaner; }
    SY.start(story, m, carKey, loaner);
  };
  SY.start = function (story, m, carKey, loaner) {
    if (m.kind === 'race' || m.kind === 'drag') return startRaceMission(story, m, carKey, loaner);
    const M = { story, m, carKey, loaner, phase: 'fadeout', t: 0, pt: 0, score: 0, hits: 0, bigHits: 0, restore: null, npc: null, route: null, tr: null, air: 0, maxSpeed: 0, smashed: 0, near: 0, props: [], fail: null, lineT: 0 };
    SY.active = M;
    F.activity = { kind: 'story', M, end: why => finish(M, why || 'quit') };
    G.events.active = { festival: true, kind: 'story', R: { name: m.name, type: `Story · ${story.name}`, desc: m.desc }, cpIdx: 0, get t() { return M.t; } };
    F.markers.setFilter(r => r.group === 'mission');
    F.overlay.fadeTo(1, 3.2);
  };

  function setup(M) {
    const { m } = M;
    M.restore = F.setConditions({ time: m.time });
    G.police?.clear?.();
    const keepTraffic = m.kind === 'nearmiss' || m.kind === 'fare' || m.kind === 'reach' || m.traffic;
    if (!keepTraffic) { M.traffic = G.traffic.density; G.traffic.clear(); G.traffic.density = 0.15; }
    // route
    if (m.route) {
      const th = threadKeysClean(world, m.route);
      if (th) { M.route = makeRoute(world, th, { startS: 25, smoothIters: 1 }); if (m.kind !== 'nearmiss') M.parked = F.clearCorridor(M.route); }
    }
    // start pose
    let x, z, yaw, y = null;
    if (M.route) { routeAt(M.route, m.kind === 'tail' || m.kind === 'tag' ? 4 : 10, pt); x = pt.x; z = pt.z; yaw = yawOf(pt.dx, pt.dz); y = pt.y; }
    else {
      const p = startPt(m); x = p.x; z = p.z;
      const tgt = m.pickup || m.to || m.area;
      if (tgt) { const [tx, tz] = ll(tgt[0], tgt[1]); const e = p.edge, k = Math.min(Math.max(0, Math.floor(p.s / (e.len / Math.max(1, e.pts.length - 1)))), e.pts.length - 2); let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; if (dx * (tx - x) + dz * (tz - z) < 0) { dx = -dx; dz = -dz; } yaw = yawOf(dx, dz); } else yaw = yawOf(p.dx, p.dz);
    }
    for (const c of G.traffic.cars.slice()) if (Math.hypot(c.v.pos.x - x, c.v.pos.z - z) < 50) { G.traffic.removeCar(c.v); G.removeVehicle(c.v); }
    const pv = F.cars.spawnPlayer(M.carKey, x, z, yaw, y);
    pv.health = 100;
    M.pv = pv;
    if (M.route) { M.tr = makeTracker(M.route); trackInit(M.route, M.tr, pv.pos.x, pv.pos.z); }
    // kind specifics
    const K = m.kind;
    if (K === 'tail' || K === 'tag') {
      const lead = K === 'tail' ? 45 : 70;
      routeAt(M.route, lead + 10, pt);
      const v = G.spawnVehicle(F.cars.exists('brawler') ? 'brawler' : 'sedan', pt.x, pt.z, yawOf(pt.dx, pt.dz), { role: 'racer', paint: 0x121316, y: pt.y });
      v.driver = 'racer';
      const d = new Driver(v, world.graph, { mode: 'race' });
      d.setPath(offsetPts(M.route, 0), { latAcc: K === 'tail' ? 5.5 : 8.2, loop: false, ys: M.route.ys });
      d.speedMul = K === 'tail' ? 0.58 : 0.86; d.rubber = 1;
      v.ai = d;
      M.npc = { v, d, tr: makeTracker(M.route), stuck: 0 };
      trackInit(M.route, M.npc.tr, v.pos.x, v.pos.z);
      M.sweet = 0; M.close = 0; M.lost = 0; M.tagT = 0; M.tags = 0; M.cool = 0;
      F.markers.add({ id: 'ms-npc', kind: 'target', icon: 'target', group: 'mission', x: v.pos.x, z: v.pos.z, color: '#ff4d5e', beam: false, iconSize: 1.6, iconH: 3.2, iconRange: 250, edge: true, title: 'Target' });
    }
    if (K === 'reach' || K === 'fare') {
      M.dest = m.to ? ll(m.to[0], m.to[1]) : null;
      if (K === 'fare') { const [px, pz] = ll(m.pickup[0], m.pickup[1]); const s = snapRoad(world, m.pickup[0], m.pickup[1], null, 200); M.pick = s ? [s.x, s.z] : [px, pz]; M.onboard = false; M.board = 0; }
      const s2 = snapRoad(world, m.to[0], m.to[1], null, 260); if (s2) M.dest = [s2.x, s2.z];
      const tgt = K === 'fare' ? M.pick : M.dest;
      F.markers.add({ id: 'ms-dest', kind: K === 'fare' ? 'pickup' : 'dropoff', icon: K === 'fare' ? 'pickup' : 'dropoff', group: 'mission', x: tgt[0], z: tgt[1], color: M.story.color, beamH: 120, edge: true, title: K === 'fare' ? 'Pick up' : 'Destination' });
      M.gpsT = 0;
    }
    if (K === 'speed' || K === 'air' || K === 'drift') {
      const L = M.route.L;
      routeAt(M.route, L - 2, pt);
      F.gates.set(0, { x: pt.x, y: pt.y, z: pt.z, dx: pt.dx, dz: pt.dz, w: Math.max(10, pt.w + 2), color: M.story.color, style: 'road', finish: K !== 'speed' });
      F.line.set(M.route);
      if (K === 'drift') M.drift = createDriftMeter();
      F.markers.add({ id: 'ms-dest', kind: 'finish', icon: 'finish', group: 'mission', x: pt.x, z: pt.z, color: M.story.color, beam: false, iconRange: 0, edge: true, title: 'Finish' });
    }
    if (K === 'smash') spawnBoxes(M);
    if (K === 'nearmiss' || K === 'smash') {
      const [ax, az] = ll(m.area[0], m.area[1]);
      M.area = [ax, az];
      F.markers.add({ id: 'ms-area', kind: 'target', icon: 'target', group: 'mission', x: ax, z: az, color: M.story.color, beam: false, iconRange: 0, radius: m.radius, title: 'Mission area' });
    }
    G.rig.snap();
    F.overlay.lower(m.name, M.story.name, m.desc, 4200);
  }
  function spawnBoxes(M) {
    const [cx, cz] = ll(M.m.area[0], M.m.area[1]);
    const n = M.m.count, geo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const tex = boxTex();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let placed = 0, tries = 0;
    // stack boxes along the roads in the area
    while (placed < n && tries++ < 600) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * M.m.radius;
      const e = world.graph.nearestEdge(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 40);
      if (!e) continue;
      const x = e.x + (Math.random() - 0.5) * 3, z = e.z + (Math.random() - 0.5) * 3;
      if (M.props.some(b => Math.hypot(b.x - x, b.z - z) < 6)) continue;
      const y = world.groundAt(x, z, world.heightAt(x, z) + 3);
      const col = { x, z, hx: 0.7, hz: 0.7, yaw: 0, yMin: y - 0.5, yMax: y + 1.4, kind: 'box', breakable: true };
      world.colliders.add(col);
      q.setFromAxisAngle(up, Math.random() * 3); mm.compose(new THREE.Vector3(x, y + 0.55, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(placed, mm);
      M.props.push({ x, y, z, col, i: placed, hit: false });
      placed++;
    }
    mesh.count = placed; mesh.castShadow = true; mesh.computeBoundingSphere();
    G.scene.add(mesh); M.boxMesh = mesh;
  }

  // ---------------------------------------------------------------- per frame
  function tick(M, dt) {
    const { m } = M;
    if (M.phase === 'fadeout') { if (F.overlay.fade >= 0.999) { setup(M); M.phase = 'intro'; F.overlay.fadeTo(0, 2); F.say(m.intro || []); } return; }
    const pv = G.player.vehicle;
    if (!pv || pv !== M.pv) { finish(M, 'quit'); return; }
    M.pt += dt;
    if (M.phase === 'intro') {
      pv.input.throttle = 0; pv.input.brake = 1; pv.input.handbrake = 1; pv.input.autoReverse = false; pv.input.reverse = false;
      if (M.npc) holdCar(M.npc.v);
      if (G.input.pressed('interact') || G.input.pressed('confirm')) F.overlay.skipCaption();
      if (!F.overlay.captionsBusy() && M.pt > 1.2) { M.phase = 'run'; M.t = 0; G.audio?.ui('go'); F.overlay.banner(M.story.name, m.name, objectiveText(M), M.story.color, 2400); }
      return;
    }
    if (M.phase === 'end') return;
    M.t += dt;
    const b = pv.body;
    if (b.speed > M.maxSpeed) M.maxSpeed = b.speed;
    if (M.route) trackUpdate(M.route, M.tr, pv.pos.x, pv.pos.z);
    if (G.input.pressed('reset') && M.route) { routeAt(M.route, Math.max(0, M.tr.s - 5), pt); F.cars.place(pv, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y); G.rig.snap(); }
    // route missions: wedged for 4 s with the throttle down -> back on the route a little further on (R does it at once)
    if (M.route && m.kind !== 'tail' && m.kind !== 'tag') {
      M.stuckT = pv.body.speed < 1.2 && pv.input.throttle > 0.3 ? (M.stuckT || 0) + dt : 0;
      if (M.stuckT > 4) { routeAt(M.route, Math.min(M.route.L - 4, M.tr.s + 8), pt); F.cars.place(pv, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y); G.rig.snap(); M.stuckT = 0; }
    }
    const K = m.kind;
    let res = null;
    if (K === 'tail' || K === 'tag') res = tickChase(M, dt, pv);
    else if (K === 'reach' || K === 'fare') res = tickTrip(M, dt, pv);
    else if (K === 'speed') {
      const u = G.hud?.units === 'kmh' ? 'kmh' : 'mph';
      F.overlay.live('Speed', `${Math.round(speedVal(m.top ? M.maxSpeed : b.speed, u))} ${u === 'kmh' ? 'KM/H' : 'MPH'}`, m.top ? 'Top speed on the bridge' : 'Speed through the camera gate', M.story.color);
      if (M.tr.s >= M.route.L - 3) { M.score = Math.round((m.top ? M.maxSpeed : b.speed) * 2.23694); res = 'done'; }
    } else if (K === 'air') {
      if (b.grounded === 0) M.air += dt;
      F.overlay.live('Air time', `${M.air.toFixed(2)} s`, `${fmtTime(Math.max(0, m.timeLimit - M.t), false)} left`, M.story.color);
      if (M.tr.s >= M.route.L - 3) { M.score = M.air; res = 'done'; }
    } else if (K === 'drift') {
      M.drift.update(dt, pv);
      F.overlay.live('Drift', fmtNum(M.drift.score()), M.drift.active ? `Combo x${M.drift.mult.toFixed(1)}` : `${fmtTime(Math.max(0, m.timeLimit - M.t), false)} left`, M.story.color);
      if (M.tr.s >= M.route.L - 3) { M.drift.bank(); M.score = M.drift.score(); res = 'done'; }
    } else if (K === 'smash') {
      for (const p of M.props) if (!p.hit && p.col.broken) {
        p.hit = true; M.smashed++;
        M.boxMesh.setMatrixAt(p.i, new THREE.Matrix4().makeScale(0, 0, 0)); M.boxMesh.instanceMatrix.needsUpdate = true;
        G.fx?.dust?.(p.x, p.y + 0.5, p.z, b.vel.x * 0.3, b.vel.z * 0.3, 1, [0.72, 0.58, 0.4]); G.fx?.sparks?.(p.x, p.y + 0.6, p.z, 0, 2, 0, 6);
        try { world.colliders.remove(p.col); } catch { /* ignore */ }
        G.audio?.ui('skill');
      }
      M.score = M.smashed;
      F.overlay.live('Smashed', `${M.smashed} / ${M.props.length}`, `${fmtTime(Math.max(0, m.timeLimit - M.t), false)} left`, M.story.color);
      if (M.smashed >= M.props.length) res = 'done';
    } else if (K === 'nearmiss') {
      M.score = M.near;
      F.overlay.live('Near misses', `${M.near} / ${m.count}`, `${fmtTime(Math.max(0, m.timeLimit - M.t), false)} left${M.hits ? ' · ' + M.hits + ' hits' : ''}`, M.story.color);
      if (M.near >= m.count) res = 'done';
    }
    if (M.route && K !== 'tail' && K !== 'tag') F.line.update(M.tr.s, b.speed, M.route.L);
    if (!res && m.timeLimit && M.t > m.timeLimit) res = (K === 'smash' || K === 'nearmiss') && M.score > 0 ? 'done' : 'timeout';
    if (res) finish(M, res);
  }
  function holdCar(v) { const i = v.input; i.throttle = 0; i.brake = 1; i.handbrake = 1; i.steer = 0; i.autoReverse = false; i.reverse = false; }
  function tickChase(M, dt, pv) {
    const n = M.npc, v = n.v, K = M.m.kind;
    trackUpdate(M.route, n.tr, v.pos.x, v.pos.z);
    const d = Math.hypot(v.pos.x - pv.pos.x, v.pos.z - pv.pos.z);
    // the target reacts: tail = cruises, speeds up if you get close; tag = runs, harder after each tag
    if (K === 'tail') n.d.rubber = d < 25 ? 1.25 : d > 80 ? 0.7 : 1;
    else n.d.rubber = (d < 20 ? 1.18 : d > 120 ? 0.78 : 1.02) * (1 + M.tags * 0.05) * (M.cool > 0 ? 1.25 : 1);
    n.d.drive(dt, G.traffic.ctx);
    if (M.t < 0.6) holdCar(v);
    const up = v.body.up(_f).y;
    if ((up < 0.3 || v.body.speed < 0.5) && M.t > 3) { n.stuck += dt; if (n.stuck > 2.5) { routeAt(M.route, n.tr.s + 3, pt); F.cars.place(v, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y); n.stuck = 0; } } else n.stuck = 0;
    M.lineT -= dt; if (M.lineT <= 0) { M.lineT = 0.3; F.markers.update('ms-npc', { x: v.pos.x, z: v.pos.z }); G.gps.points = [[pv.pos.x, pv.pos.z], [v.pos.x, v.pos.z]]; G.gps.color = '#ff4d5e'; }
    if (K === 'tail') {
      if (d >= 15 && d <= 60) M.sweet += dt;
      if (d > 95) M.lost += dt; else M.lost = Math.max(0, M.lost - dt);
      if (d < 10) M.close += dt; else M.close = Math.max(0, M.close - dt * 0.5);
      const frac = M.sweet / Math.max(1, M.t);
      F.overlay.live('Tail', `${Math.round(d)} m`, d < 12 ? 'Too close. Back off!' : d > 80 ? 'Losing him. Close in!' : `In the pocket ${Math.round(frac * 100)}%`, d < 12 || d > 80 ? '#ff4d5e' : M.story.color);
      if (M.lost > 5) { M.fail = 'You lost him'; return 'fail'; }
      if (M.close > 3) { M.fail = 'He spotted you'; return 'fail'; }
      if (n.tr.s >= M.route.L - 6) { M.score = frac; return 'done'; }
    } else {
      if (M.cool > 0) M.cool -= dt;
      if (d < 9 && M.cool <= 0) { M.tagT += dt; if (M.tagT > 1.3) { M.tags++; M.tagT = 0; M.cool = 4; G.audio?.ui('checkpoint'); F.overlay.stunt('Tag', `${M.tags}`, -1, M.tags >= 3 ? 'Maximum pressure' : 'Stay on him', M.story.color); } } else M.tagT = Math.max(0, M.tagT - dt);
      F.overlay.live('Chase', `${M.tags} ${M.tags === 1 ? 'tag' : 'tags'}`, M.cool > 0 ? 'He is running!' : d < 9 ? `Tagging... ${Math.round(M.tagT / 1.3 * 100)}%` : `${Math.round(d)} m`, M.story.color);
      if (n.tr.s >= M.route.L - 6 || M.tags >= 3) { M.score = M.tags; return M.tags > 0 ? 'done' : 'fail'; }
    }
    return null;
  }
  function tickTrip(M, dt, pv) {
    const m = M.m, K = m.kind;
    const tgt = K === 'fare' && !M.onboard ? M.pick : M.dest;
    const d = Math.hypot(tgt[0] - pv.pos.x, tgt[1] - pv.pos.z);
    M.gpsT -= dt;
    if (M.gpsT <= 0) { M.gpsT = 1.2; G.gps.points = G.events?.routePoints ? G.events.routePoints(pv.pos.x, pv.pos.z, tgt[0], tgt[1]) : roadPath(world, pv.pos.x, pv.pos.z, tgt[0], tgt[1]); G.gps.color = M.story.color; }
    const left = m.timeLimit - M.t;
    if (K === 'fare' && !M.onboard) {
      F.overlay.live('Pick up', `${Math.round(d)} m`, d < 14 ? 'Stop to let them in' : `${fmtTime(Math.max(0, left), false)} left`, M.story.color);
      if (d < 12 && pv.body.speed < 2.5) { M.board += dt; if (M.board > 1.2) { M.onboard = true; M.hits = 0; M.bigHits = 0; F.markers.update('ms-dest', { x: M.dest[0], z: M.dest[1], kind: 'dropoff', icon: 'dropoff', title: 'Drop off' }); F.markers.remove('ms-dest'); F.markers.add({ id: 'ms-dest', kind: 'dropoff', icon: 'dropoff', group: 'mission', x: M.dest[0], z: M.dest[1], color: M.story.color, beamH: 120, edge: true, title: 'Drop off' }); G.audio?.ui('confirm'); if (m.fareLines?.[0]) F.say([m.fareLines[0]]); M.gpsT = 0; } }
      else M.board = 0;
      return null;
    }
    if (K === 'fare' && m.fareLines?.[1] && !M.midLine && M.t > m.timeLimit * 0.4) { M.midLine = true; F.say([m.fareLines[1]]); }
    const smooth = M.hits === 0 ? 'Smooth ride' : `${M.hits} bump${M.hits > 1 ? 's' : ''}`;
    F.overlay.live(K === 'fare' ? 'Drop off' : 'Destination', fmtTime(Math.max(0, left)), `${Math.round(d)} m${m.fragile || m.damage ? ' · ' + smooth : ''}`, left < 15 ? '#ff4d5e' : M.story.color);
    if (m.fragile && M.bigHits > 0) { M.fail = 'The cake did not survive'; return 'fail'; }
    if (d < 14 && pv.body.speed < 6) {
      const frac = left / m.timeLimit;
      M.score = m.rush ? (frac > 0.3 ? 3 : frac > 0.12 ? 2 : 1) : (M.hits === 0 ? 3 : M.hits <= 2 ? 2 : 1);
      if (m.damage) M.score = Math.min(M.score, M.hits === 0 && frac > 0.2 ? 3 : M.hits <= 2 ? 2 : 1);
      return 'done';
    }
    return null;
  }
  function objectiveText(M) {
    const m = M.m;
    switch (m.kind) {
      case 'tail': return 'Keep the sedan in sight';
      case 'tag': return 'Catch the sedan and stay on it';
      case 'air': return 'Get as much air as you can';
      case 'drift': return 'Drift to the finish';
      case 'speed': return m.top ? 'Hit the highest top speed' : 'Fly through the camera gate';
      case 'smash': return `Smash ${m.count} boxes`;
      case 'nearmiss': return `${m.count} near misses in traffic`;
      case 'fare': return 'Pick up your passenger';
      case 'reach': return 'Get to the destination';
      default: return m.desc;
    }
  }
  // near misses + impacts during a mission
  G.on('nearMiss', () => { if (SY.active?.phase === 'run') SY.active.near++; });
  SY.onPlayerHit = s => { const M = SY.active; if (!M || M.phase !== 'run') return; if (s > 0.12) M.hits++; if (s > 0.25) M.bigHits++; if (M.drift && s > 0.2) M.drift.lose(); };

  // ---------------------------------------------------------------- finish + results
  function starsFor(m, score, how) {
    if (how !== 'done') return 0;
    if (m.kind === 'reach' || m.kind === 'fare') return score;
    const th = m.stars; let s = 0; for (let i = 0; i < 3; i++) if (score >= th[i]) s = i + 1;
    return s;
  }
  async function finish(M, how) {
    if (M.phase === 'end') return;
    M.phase = 'end';
    const m = M.m, s = M.story;
    const stars = how === 'quit' ? 0 : starsFor(m, M.score, how);
    F.overlay.live(null);
    cleanupWorld(M);
    if (how === 'quit') { SY.active = null; F.activity = null; F.overlay.fadeTo(0, 3); if (M.loaner) F.restoreCar(); G.hud?.toast?.('Mission abandoned', m.name, '', 2200); return; }
    G.audio?.ui(stars ? 'finish' : 'fail');
    F.overlay.banner(stars ? 'Mission complete' : 'Mission failed', stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (M.fail || (how === 'timeout' ? 'Out of time' : 'Try again')), '', s.color, 2400);
    if (stars) F.say(m.outro || []);
    const rewards = applyRewards(M, stars);
    await F.wait(2.6);
    const choice = await F.screens.missionResult(s, m, { stars, score: M.score, how, fail: M.fail, rewards, kind: m.kind });
    SY.active = null; F.activity = null;
    if (M.loaner) F.restoreCar();
    SY.refreshMarkers();
    if (choice === 'retry') SY.start(s, m, M.carKey, M.loaner);
    else if (choice === 'next') { const n = SY.next(s); if (n) SY.open(s, n); }
  }
  function cleanupWorld(M) {
    if (M.npc) G.removeVehicle(M.npc.v);
    if (M.boxMesh) { G.scene.remove(M.boxMesh); for (const p of M.props) if (!p.hit) try { world.colliders.remove(p.col); } catch { /* ignore */ } }
    F.markers.remove('ms-npc'); F.markers.remove('ms-dest'); F.markers.remove('ms-area');
    F.gates.hideAll(); F.line.clear();
    if (G.events.active?.kind === 'story') G.events.active = null;
    if (M.traffic !== undefined) G.traffic.density = M.traffic;
    F.restoreCorridor(M.parked);
    if (M.restore) F.restoreConditions(M.restore);
    G.gps.points = null;
    F.markers.setFilter(null);
  }
  function applyRewards(M, stars) {
    const { m, story } = M;
    const prev = SY.starsOf(story.id, m.id);
    const first = !prev && stars > 0;
    const out = { credits: 0, xp: 0, fp: 0, spins: 0, car: null, first };
    if (stars > 0) {
      const f = 0.5 + stars * 0.25;
      out.credits = Math.round((m.rewards.credits || 5000) * (first ? f : f * 0.3));
      out.xp = Math.round((m.rewards.xp || 1500) * (first ? f : f * 0.4));
      out.fp = Math.max(0, stars - prev) * 50 + (first ? 100 : 0);
      if (first && m.rewards.spin) out.spins = m.rewards.spin;
      if (first && m.rewards.car && F.cars.exists(m.rewards.car)) { out.car = m.rewards.car; F.cars.give(m.rewards.car, 'story'); }
      if (stars > prev) rec(story.id)[m.id] = stars;
      F.award({ credits: out.credits, xp: out.xp, fp: out.fp }, m.name, { silent: true });
      if (out.spins) F.addSpins(out.spins, false);
      F.setStat('story:' + story.id, SY.completed(story.id));
      F.setStat('storyStars', STORIES.reduce((a, st) => a + st.missions.reduce((b, mm) => b + SY.starsOf(st.id, mm.id), 0), 0));
      F.save();
    }
    return out;
  }

  // ---------------------------------------------------------------- race / drag missions through the race runtime
  function startRaceMission(story, m, carKey, loaner) {
    const th = threadKeysClean(world, m.route);
    if (!th) { G.hud?.toast?.('Mission unavailable', 'Route does not fit this map', '', 2400); return; }
    const drag = m.kind === 'drag';
    let R = makeRoute(world, th, { startS: drag ? 30 : 55, smoothIters: drag ? 0 : 1 });
    if (drag && m.dist && R.L > R.startS + m.dist + 5) {
      const pts = [], deck = [];
      for (let i = 0; i < R.n && R.cum[i] <= R.startS + m.dist; i++) { pts.push(R.pts[i]); deck.push(NaN); }
      R = makeRoute(world, { pts, deck }, { startS: 30, smoothIters: 0 });
    }
    const opp = m.opponent === 'crew' ? [NPC.kai, NPC.rook, RIVALS[4], RIVALS[10]] : [NPC[m.opponent] || NPC.frankie];
    const cls = m.cls || 'B';
    const grid = opp.map(r => ({ rival: r, carKey: F.cars.bestFor(cls, { prefer: r.prefers }) }));
    const diff = Math.max(1, F.S.difficulty ?? 1);
    const intro = m.intro || [];
    F.say(intro);
    F.racing.start({
      id: 'story:' + m.id, name: m.name, kicker: story.name, subtitle: CHARACTERS[story.host].name, route: R, laps: 1, discipline: drag ? 'drag' : 'road', color: story.color,
      carKey, diff, traffic: !!m.traffic, time: m.time, grid, virtual: [], results: true,
      rewards: res => {
        const stars = res.how === 'finish' ? (res.place === 1 ? 3 : res.place === 2 ? 1 : 0) : 0;
        const M = { m, story };
        const r = applyRewards(M, stars);
        if (stars) F.say(m.outro || []);
        return { credits: r.credits, xp: r.xp, fp: r.fp, lines: [[stars ? `Mission complete ${'★'.repeat(stars)}` : 'Mission failed', r.credits]], pb: false, first: r.first, beaten: [], failed: !stars, stars, car: r.car };
      },
      onDone: () => { if (loaner) F.restoreCar(); SY.refreshMarkers(); },
    });
  }
  SY.quit = () => { if (SY.active) finish(SY.active, 'quit'); };
  SY.restart = () => { const M = SY.active; if (!M) return; const { story, m, carKey, loaner } = M; finish(M, 'quit'); SY.start(story, m, carKey, loaner); };
  void clamp; void fmtNum; void makeTracker;
  return SY;
}
let _boxTex = null;
function boxTex() {
  if (_boxTex) return _boxTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#b8895a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#9c7045'; g.fillRect(0, 58, 128, 12);
  g.strokeStyle = '#7a5635'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
  g.fillStyle = '#3a2a1a'; g.font = '800 20px Barlow Condensed, sans-serif'; g.textAlign = 'center'; g.fillText('PROP DEPT', 64, 40); g.fillText('FRAGILE', 64, 100);
  _boxTex = new THREE.CanvasTexture(c); _boxTex.colorSpace = THREE.SRGBColorSpace;
  return _boxTex;
}
