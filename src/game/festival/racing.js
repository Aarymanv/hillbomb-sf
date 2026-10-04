// Race runtime shared by every racing activity: road / street / dirt / cross country / drag / drift events,
// showcases (virtual opponents) and story races.
// Flow: fade out -> grid (player at the back, named rivals ahead) -> reveal camera -> 3-2-1 lights -> race
// (checkpoints recomputed from position every frame, so rewinds and respawns are safe) -> finish camera -> results.
import * as THREE from 'three';
import { Driver } from '../drivers.js';
import { makeTracker, trackUpdate, trackInit, routeAt, offsetPts, clamp, fmtTime, fmtGap, ordinal, yawOf, fmtNum, speedVal, solidNear } from './util.js';
import { createDriftMeter } from './drift.js';
import { DIFFICULTY } from './catalog.js';

const BIN = 20; // metres per timing bin (gaps between cars)
const _up = new THREE.Vector3(), _f = new THREE.Vector3();
const SPACING = { road: 260, street: 240, dirt: 170, xc: 150, drag: 1e9, drift: 300, showcase: 320, story: 260 };

export function createRacing(F) {
  const { G, world } = F;
  const RC = { active: null };
  const pt = {}, pt2 = {};

  // ---------------------------------------------------------------- setup
  RC.start = function (cfg) {
    if (RC.active) RC.cleanup('replaced');
    const A = {
      cfg, route: cfg.route, phase: 'fadeout', t: 0, pt: 0, laps: cfg.laps || 1, discipline: cfg.discipline, color: cfg.color || '#ffc247',
      ents: [], order: [], player: null, cps: [], nCp: 0, cpNext: 0, total: 0, missT: 0, offT: 0, wrongT: 0, hits: 0, splits: [], lapTimes: [], lapStart: 0,
      drift: cfg.discipline === 'drift' ? createDriftMeter() : null, gpsT: 0, restore: null, result: null, finT: 0, camT: 0, launch: null, maxSpeed: 0,
    };
    RC.active = A;
    F.activity = { kind: 'race', A, end: r => RC.quit(r) };
    F.overlay.fadeTo(1, 3.2);
    F.markers.setFilter(r => r.group === 'race');
    G.hud?.prompt?.(null, 'events');
    return A;
  };

  function buildCheckpoints(A) {
    const R = A.route, loop = R.loop, sp = SPACING[A.discipline] ?? 260;
    const lapLen = loop ? R.L : R.L - R.startS - 4; // sprints: finish line a few metres before the last point
    const n = A.discipline === 'drag' ? 1 : Math.max(loop ? 3 : 2, Math.min(40, Math.round(lapLen / sp)));
    A.cps = [];
    for (let k = 1; k <= n; k++) {
      const P = lapLen * k / n, s = loop ? (P % R.L) : R.startS + P;
      routeAt(R, loop && k === n ? 0 : Math.min(R.L - 0.5, s), pt);
      const wide = A.discipline === 'xc' || A.discipline === 'dirt' || R.off[pt.i];
      A.cps.push({ P, x: pt.x, y: pt.y, z: pt.z, dx: pt.dx, dz: pt.dz, w: wide ? 24 : Math.max(10, pt.w + 2), style: wide ? 'xc' : 'road', idx: pt.i });
    }
    A.nCp = n; A.total = lapLen * A.laps;
  }
  const cpP = (A, j) => Math.floor(j / A.nCp) * (A.route.loop ? A.route.L : 0) + A.cps[j % A.nCp].P;

  function setup(A) {
    const cfg = A.cfg, R = A.route;
    buildCheckpoints(A);
    A.parked = F.clearCorridor(R);
    // conditions
    A.restore = F.setConditions({ time: cfg.time, weather: cfg.weather, fog: cfg.fog });
    G.police?.clear?.();
    if (!cfg.traffic) { A.trafficDensity = G.traffic.density; G.traffic.clear(); G.traffic.density = 0; }
    else { routeAt(R, R.startS, pt); for (const c of G.traffic.cars.slice()) if (Math.hypot(c.v.pos.x - pt.x, c.v.pos.z - pt.z) < 120) { G.traffic.removeCar(c.v); G.removeVehicle(c.v); } }
    // grid slots along the route behind the start line: 2 columns, 9 m rows
    const nAI = cfg.grid.length, slots = [];
    const drag = A.discipline === 'drag';
    const totalCars = nAI + 1;
    for (let i = 0; i < totalCars; i++) {
      if (drag) { slots.push({ s: R.startS - 4, lat: (i - (totalCars - 1) / 2) * 3.6 }); continue; }
      const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
      slots.push({ s: R.startS - 7 - row * 9, lat: col * 2.4 });
    }
    // the player starts at the back (drag: an inside lane)
    const playerSlot = drag ? Math.min(1, totalCars - 1) : totalCars - 1;
    const aiSlots = slots.filter((_, i) => i !== playerSlot);
    // a grid slot clear of anything solid (stalls / poles / walls on the Treasure Island night market grid held the player
    // behind the line for a minute): the slot itself, then nudged across the road, then further back
    const placeOn = (v, slot) => {
      v._slot = slot;
      let x, z, y, yaw;
      for (let back = 0; back <= 24; back += 6) {
        for (const dl of [0, 1.6, -1.6, 3.2, -3.2]) {
          routeAt(R, slot.s - back, pt);
          const hw = Math.max(1.5, pt.w / 2 - 1.6), lat = clamp(slot.lat + dl, -hw, hw);
          x = pt.x - pt.dz * lat; z = pt.z + pt.dx * lat; yaw = yawOf(pt.dx, pt.dz);
          y = R.off[pt.i] ? world.groundAt(x, z, world.heightAt(x, z) + 3) : world.groundAt(x, z, pt.y + 1.5);
          if (!solidNear(world, x, y + 1, z, 1.3)) { F.cars.place(v, x, z, yaw, y); return { x, z }; }
        }
      }
      routeAt(R, slot.s, pt); x = pt.x - pt.dz * slot.lat; z = pt.z + pt.dx * slot.lat;
      F.cars.place(v, x, z, yawOf(pt.dx, pt.dz), R.off[pt.i] ? world.groundAt(x, z, world.heightAt(x, z) + 3) : world.groundAt(x, z, pt.y + 1.5));
      return { x, z };
    };
    A.placeOn = placeOn;
    // player
    routeAt(R, slots[playerSlot].s, pt);
    const pv = F.cars.spawnPlayer(cfg.carKey, pt.x, pt.z, yawOf(pt.dx, pt.dz), pt.y);
    placeOn(pv, slots[playerSlot]);
    pv.health = 100;
    const me = { kind: 'player', name: F.playerName(), color: '#ff2e7e', v: pv, tr: makeTracker(R), done: false, time: 0, bins: null, prevP: 0, pos: totalCars, player: true };
    A.player = me; A.ents.push(me);
    // AI rivals
    cfg.grid.forEach((g, i) => {
      const v = G.spawnVehicle(g.carKey, pt.x, pt.z, 0, { role: 'racer', paint: g.paint });
      const slot = aiSlots[i];
      placeOn(v, slot);
      v.driver = 'racer'; v.input.aiAssist = true;   // TCS + STM (vehicle/physics.js): no power-oversteer spins at corners
      const tune = F.rivals.tuning(g.rival, cfg.diff ?? 1);
      const d = new Driver(v, world.graph, { mode: 'race', speedMul: 1 });
      const lane = drag ? slot.lat : clamp(slot.lat * 0.4 + (i % 3 - 1) * 0.9, -2.6, 2.6);
      d.setPath(offsetPts(R, lane), { latAcc: tune.latAcc, loop: R.loop, ys: R.ys });
      if (!drag) d.limitLips((x, z, y) => world.groundAt(x, z, y));      // plateau lips: short hops, not 1.7 s flights
      d.speedMul = tune.speedMul; d.rubber = 1;
      v.ai = d;
      A.ents.push({ kind: 'ai', name: g.rival?.nick || g.name, rival: g.rival, color: g.rival?.color || '#ccc', v, d, tune, tr: makeTracker(R), done: false, time: 0, stuck: 0, bins: null, prevP: 0, pos: i + 1 });
    });
    // virtual opponents (showcases)
    for (const o of cfg.virtual || []) { o.P = -R.startS; o.done = false; o.time = 0; A.ents.push({ kind: 'virtual', name: o.name, color: o.color || '#fff', o, done: false, time: 0, bins: null, prevP: 0, P: 0, catcher: !!o.catcher, pos: 0 }); o.setup?.(A, F); }
    const nb = Math.ceil(A.total / BIN) + 4;
    for (const e of A.ents) { e.bins = new Float32Array(nb).fill(-1); if (e.tr) { const p = e.v.root.position; trackInit(R, e.tr, p.x, p.z); e.P = e.tr.P; } else e.P = e.o.P; e.prevP = e.P; }
    A.order = A.ents.slice();
    // world bits
    F.line.set(A.discipline === 'drag' ? null : R, { latAcc: 9.5 });
    A.cpNext = 0; placeGates(A);
    for (const e of A.ents) if (e.kind !== 'player') F.markers.add({ id: 'race-ent-' + A.ents.indexOf(e), kind: 'rival', icon: 'rival', group: 'race', x: e.v ? e.v.pos.x : 0, z: e.v ? e.v.pos.z : 0, color: e.color, beam: false, iconSize: 0, iconRange: 0, minimap: true, bigmap: true, title: e.name });
    F.markers.add({ id: 'race-cp', kind: 'checkpoint', icon: 'checkpoint', group: 'race', x: A.cps[0].x, z: A.cps[0].z, color: A.color, beam: false, iconRange: 0, edge: true, title: 'Checkpoint' });
    // HUD
    const cells = A.discipline === 'drift' ? [{ k: 'Score', cls: 'pos' }, { k: 'Combo' }, { k: A.laps > 1 ? 'Lap' : 'Checkpoint' }, { k: 'Time' }]
      : A.discipline === 'drag' ? [{ k: 'Position', cls: 'pos' }, { k: 'Time' }, { k: 'Speed' }]
      : A.cfg.virtual?.some(o => o.catcher) ? [{ k: 'Lead', cls: 'pos' }, { k: 'Checkpoint' }, { k: 'Time' }]
      : [{ k: 'Position', cls: 'pos' }, { k: A.laps > 1 ? 'Lap' : 'Checkpoint' }, { k: 'Time' }];
    F.racehud.show({ cells, color: A.color, ladder: A.discipline === 'drift' ? 0 : Math.min(8, A.ents.length), tags: A.ents.length - 1, sub: '' });
    G.hud?.race?.(null);
    // compat for the legacy objective card + pause menu (G.events.active)
    const cpsIdx = []; for (let j = 0; j < A.nCp * A.laps; j++) cpsIdx.push(A.cps[j % A.nCp].idx);
    G.events.active = {
      festival: true, kind: 'race', R: { id: cfg.id, name: cfg.name, type: cfg.kicker || 'Race', desc: cfg.desc || cfg.subtitle || '', path: R.pts, cps: cpsIdx, reward: cfg.reward || 0 },
      cpIdx: 0, get t() { return Math.max(0, A.t); }, get rivals() { return A.ents.filter(e => !e.player); },
      get state() { return A.phase === 'race' ? 'race' : A.phase === 'finished' ? 'finished' : 'countdown'; },
    };
    G.gps.target = null;
    G.rig.snap();
    // reveal camera: sweep from ahead of the grid down to the chase position
    const p0 = pv.root.position.clone();
    routeAt(R, R.startS + 20, pt2);
    const yaw = yawOf(pt2.dx, pt2.dz);
    A.cam = { from: new THREE.Vector3(pt2.x + pt2.dz * 14, pt2.y + 16, pt2.z - pt2.dx * 14), look: new THREE.Vector3(p0.x, p0.y + 1, p0.z), yaw };
    let ct = 0;
    G.cameraOverride = {
      update(cam, dt) {
        ct += dt; const u = clamp(ct / 2.6, 0, 1), e = u * u * (3 - 2 * u);
        const v = A.player.v, p = v.root.position;
        v.body.forward(_f);
        const bx = p.x - _f.x * 7.5, bz = p.z - _f.z * 7.5, by = p.y + 2.6;
        cam.position.set(A.cam.from.x + (bx - A.cam.from.x) * e, A.cam.from.y + (by - A.cam.from.y) * e, A.cam.from.z + (bz - A.cam.from.z) * e);
        cam.lookAt(p.x + _f.x * 12 * e, p.y + 1.2, p.z + _f.z * 12 * e);
      },
    };
    // showcases open on their opponent instead
    const rv = (cfg.virtual || []).find(o => o.reveal);
    if (rv) { let rt = 0; G.cameraOverride = { update(cam, dt) { rt += dt; rv.reveal(cam, rt, A); } }; }
    F.overlay.lower(cfg.name, cfg.kicker || '', `${cfg.subtitle || ''}`, 3200);
    G.audio?.ui('confirm');
  }

  function placeGates(A) {
    const R = A.route, tot = A.nCp * A.laps;
    const gate = (slot, j, dim) => {
      if (j >= tot) { F.gates.set(slot, null); return; }
      const c = A.cps[j % A.nCp];
      const finish = j === tot - 1;
      F.gates.set(slot, { x: c.x, y: c.y, z: c.z, dx: c.dx, dz: c.dz, w: c.w, color: A.color, style: c.style, finish, dim });
    };
    gate(0, A.cpNext, false); gate(1, A.cpNext + 1, true);
    F.gates.set(2, null);
    const j = Math.min(A.cpNext, tot - 1), c = A.cps[j % A.nCp];
    F.markers.update('race-cp', { x: c.x, z: c.z, title: j === tot - 1 ? 'Finish' : 'Checkpoint ' + (j + 1) });
    if (G.events.active) G.events.active.cpIdx = A.cpNext;
    void R;
  }

  // ---------------------------------------------------------------- update
  RC.update = function (dt) {
    const A = RC.active; if (!A) return;
    F.gates.update(dt);
    if (A.phase === 'fadeout') { if (F.overlay.fade >= 0.999) { setup(A); A.phase = 'reveal'; A.pt = 0; F.overlay.fadeTo(0, 2.2); } return; }
    const pv = A.player.v;
    if (!pv || G.player.vehicle !== pv) { RC.quit('left'); return; }
    A.pt += dt;
    if (A.phase === 'reveal') {
      hold(A, true);
      for (const e of A.ents) if (e.kind === 'virtual') virtualStep(A, e, dt);
      if (A.pt > (A.revealDur || 2.4)) {
        A.phase = 'countdown'; A.pt = 0; A.lastN = 4; G.cameraOverride = null;
        // colliders around the grid have streamed in by now: move any car that ended up inside one
        for (const e of A.ents) if (e.v?._slot && solidNear(world, e.v.pos.x, e.v.pos.y + 1, e.v.pos.z, 0.9)) A.placeOn(e.v, e.v._slot);
        G.rig.snap();
      }
      updateTags(A); return;
    }
    if (A.phase === 'countdown') {
      hold(A, false);
      for (const e of A.ents) if (e.kind === 'virtual') virtualStep(A, e, dt);
      const n = 3 - Math.floor(A.pt / 0.9);
      if (n !== A.lastN && n >= 1) { A.lastN = n; F.racehud.countdown(n); G.audio?.ui('countdown'); }
      if (A.pt >= 2.7) {
        A.phase = 'race'; A.t = 0; F.racehud.countdown(0); G.audio?.ui('go'); A.goT = 0.9; A.launch = { t0: 0, reacted: false };
        for (const e of A.ents) if (e.kind === 'ai') e.v.input.handbrake = 0;
        A.cfg.onGo?.(A);
      }
      updateHud(A, dt); updateTags(A); return;
    }
    if (A.phase === 'race') { raceStep(A, dt); return; }
    if (A.phase === 'finished') {
      A.finT += dt; A.t += dt;
      for (const e of A.ents) if (e.kind === 'ai') aiStep(A, e, dt);
      for (const e of A.ents) if (e.kind === 'virtual' && !e.done) virtualStep(A, e, dt);
      // coast to a stop under a cinematic camera
      pv.input.throttle = 0; pv.input.brake = Math.min(1, 0.25 + A.finT * 0.3); pv.input.handbrake = 0; pv.input.autoReverse = false; pv.input.reverse = false;
      updateTags(A);
      if (A.finT > 3.2 && !A.resultsShown) { A.resultsShown = true; showResults(A); }
    }
  };
  function hold(A, full) {
    const pv = A.player.v;
    // (auto-reverse off: a held brake at standstill would otherwise reverse the car off the grid)
    pv.input.brake = 1; pv.input.handbrake = 1; if (full) pv.input.throttle = 0; pv.input.steer = 0; pv.input.autoReverse = false; pv.input.reverse = false;
    for (const e of A.ents) if (e.kind === 'ai') { const i = e.v.input; i.throttle = full ? 0 : 0.35; i.brake = 1; i.handbrake = 1; i.steer = 0; i.autoReverse = false; i.reverse = false; }
  }

  function raceStep(A, dt) {
    A.t += dt;
    const R = A.route, me = A.player, pv = me.v, b = pv.body;
    if (A.goT > 0) { A.goT -= dt; if (A.goT <= 0) F.racehud.countdown(null); }
    if (A.launch && !A.launch.reacted && pv.input.throttle > 0.7) { A.launch.reacted = true; A.launch.t = A.t; }
    // player reset (R): back onto the route at the current progress
    if (G.input.pressed('reset')) respawnOnRoute(A, me);
    // player progress + checkpoints
    const p = pv.root.position;
    me.prevP = me.P;
    trackUpdate(R, me.tr, p.x, p.z); me.P = me.tr.P;
    const tot = A.nCp * A.laps;
    // rewinds: step checkpoints back if the car jumped behind the last one
    while (A.cpNext > 0 && me.P < cpP(A, A.cpNext - 1) - 12) { A.cpNext--; placeGates(A); }
    const Pj = cpP(A, A.cpNext);
    if (me.prevP < Pj && me.P >= Pj) {
      const c = A.cps[A.cpNext % A.nCp];
      const offroad = c.style === 'xc' || A.discipline === 'dirt' || A.discipline === 'xc';
      const inside = Math.abs(me.tr.lat) <= c.w / 2 + (offroad ? 12 : 7);
      if (inside) passCheckpoint(A);
      else { A.missT = 2.5; G.audio?.ui('error'); }
    }
    // went wide of a gate but carried on along the route: count it once back on course (no driving back for it)
    else if (me.P > Pj + 35 && me.P < Pj + 400 && me.tr.dist < (A.discipline === 'dirt' || A.discipline === 'xc' ? 30 : 14)) { A.missT = 0; passCheckpoint(A); }
    // a gate missed by more than 400 m can never be passed again (progress only grows, laps included): the race could
    // not finish (Crissy Field Dash ran on past 2x its length). Put the player back at the gate instead.
    else if (me.P > Pj + 400) { respawnOnRoute(A, me, 'missedGate'); me.P = me.tr.P; A.missT = 2.5; }
    if (A.cpNext >= tot && !me.done) { finishPlayer(A); return; }
    // speed stat
    if (b.speed > A.maxSpeed) A.maxSpeed = b.speed;
    // off route / wrong way / missed
    const offLim = A.discipline === 'xc' || A.discipline === 'dirt' ? 140 : 28;
    if (me.tr.dist > offLim) { A.offT += dt; if (A.offT > 6) { respawnOnRoute(A, me, 'offRoute'); A.offT = 0; } } else A.offT = Math.max(0, A.offT - dt);
    // wedged against something with the throttle down: reset after a few seconds (R does it straight away)
    if (b.speed < 1.2 && pv.input.throttle > 0.4) A.stuckT = (A.stuckT || 0) + dt; else A.stuckT = 0;
    if (A.stuckT > 6) { respawnOnRoute(A, me, 'stopped'); A.stuckT = 0; }
    // throttle down but no progress along the route (rocking against a wall / kerb above 1.2 m/s, beached on a median):
    // the speed test above never fires. 10 s of that respawns too.
    if (me.P > (A.bestP ?? -1e9) + 4) { A.bestP = me.P; A.noProgT = 0; } else if (pv.input.throttle > 0.3 || pv.input.brake > 0.3) A.noProgT = (A.noProgT || 0) + dt;
    if (A.noProgT > 10) { respawnOnRoute(A, me, 'noProgress'); A.noProgT = 0; A.bestP = me.P; }
    routeAt(R, me.tr.s, pt);
    const along = b.vel.x * pt.dx + b.vel.z * pt.dz;
    if (along < -4) A.wrongT += dt; else A.wrongT = 0;
    if (A.missT > 0) A.missT -= dt;
    F.racehud.warn(A.missT > 0 ? 'Missed checkpoint' : A.wrongT > 1.2 ? 'Wrong way' : A.offT > 2 ? 'Return to the route' : A.stuckT > 2.5 || A.noProgT > 4 ? 'Stuck? Press R to reset' : '');
    // drift scoring
    if (A.drift) A.drift.update(dt, pv);
    // entrants
    for (const e of A.ents) {
      if (e.kind === 'ai') aiStep(A, e, dt);
      else if (e.kind === 'virtual') virtualStep(A, e, dt);
      binStep(A, e);
    }
    // a chaser (fog bank) catching the player ends it; a showcase opponent crossing the line first ends it too
    for (const e of A.ents) if (e.catcher && !me.done && e.P >= me.P - 2) { finishPlayer(A, 'caught'); return; }
    if (A.cfg.virtual?.length && !A.cfg.virtual.some(o => o.catcher) && A.ents.every(e => e.kind !== 'virtual' || e.done)) { finishPlayer(A, 'beaten'); return; }
    // time limit (drift events, story races)
    if (A.cfg.timeLimit && A.t > A.cfg.timeLimit) { finishPlayer(A, 'timeout'); return; }
    rank(A);
    updateHud(A, dt); updateTags(A);
    // driving line + GPS
    F.line.update(me.tr.s, b.speed, R.loop ? Infinity : R.L);
    A.gpsT -= dt;
    if (A.gpsT <= 0) {
      A.gpsT = 0.6;
      const i0 = me.tr.i, pts = [];
      for (let k = 0; k < 260; k += 2) { const i = R.loop ? (i0 + k) % R.n : i0 + k; if (i >= R.n) break; pts.push(R.pts[i]); }
      G.gps.points = pts; G.gps.color = A.color;
      for (let i = 1; i < A.ents.length; i++) { const e = A.ents[i]; if (e.v) F.markers.update('race-ent-' + i, { x: e.v.pos.x, z: e.v.pos.z }); else if (e.o?.pos) F.markers.update('race-ent-' + i, { x: e.o.pos.x, z: e.o.pos.z }); }
    }
    // impacts are counted by F (clean racing)
  }
  function passCheckpoint(A) {
    const j = A.cpNext;
    A.cpNext++;
    G.audio?.ui('checkpoint');
    // split vs personal best
    const pb = F.S.events[A.cfg.id]?.splits;
    A.splits[j] = A.t;
    if (pb && pb[j] != null && A.cpNext < A.nCp * A.laps) { const d = A.t - pb[j]; F.racehud.split(fmtGap(d), d <= 0); }
    else if (A.cpNext < A.nCp * A.laps) F.racehud.split(fmtTime(A.t), true);
    // lap
    if (A.route.loop && (j + 1) % A.nCp === 0) { A.lapTimes.push(A.t - A.lapStart); A.lapStart = A.t; if (A.cpNext < A.nCp * A.laps) F.overlay.banner('', `Lap ${A.cpNext / A.nCp + 1} / ${A.laps}`, fmtTime(A.lapTimes[A.lapTimes.length - 1]), A.color, 1600); }
    placeGates(A);
  }
  function respawnOnRoute(A, e, why = 'reset') {
    const R = A.route;
    const st = (A.respawns ||= {}); st[why] = (st[why] || 0) + 1; (A.respawnAt ||= []).length < 40 && A.respawnAt.push([why, e.player ? 'YOU' : e.name, Math.round(e.v.pos.x), Math.round(e.v.pos.z), Math.round(e.P), [...new Set(G.world.colliders.query(e.v.pos.x, e.v.pos.z, 3.5, []).map(c => c.kind))].join('/')]);   // dev stats (dev/gameplay_audit.js): + obstacle kinds within 3.5 m
    // back to just after the last passed checkpoint (or current progress, whichever is further back)
    const lastP = A.cpNext > 0 ? cpP(A, A.cpNext - 1) + 6 : 0;
    let P = e.player ? Math.min(Math.max(lastP, e.tr.P - 10), e.tr.P) : e.tr.P - 5;
    // a second reset at the same spot within 25 s: something solid sits on the racing line (a streamed-in collider the route
    // clearance never saw). Respawn past it instead of in front of it again (that looped forever: a softlock for the
    // player, a lost race for a rival).
    const rewind = why === 'missedGate';
    if (rewind) P = lastP;
    const again = !rewind && e.rsP != null && Math.abs(e.tr.P - e.rsP) < 30 && A.t - e.rsT < 25;
    if (again) P = Math.max(P, e.rsP) + 18 * Math.min(4, (e.rsN = (e.rsN || 1) + 1));
    else e.rsN = 1;
    e.rsP = Math.max(P, e.tr.P); e.rsT = A.t;
    const Lmax = R.loop ? Infinity : R.L - R.startS - 6;
    P = Math.min(P, Lmax);
    let s = R.loop ? ((P % R.L) + R.L) % R.L : P + R.startS;
    routeAt(R, s, pt);
    let y = R.off[pt.i] ? world.groundAt(pt.x, pt.z, world.heightAt(pt.x, pt.z) + 3) : world.groundAt(pt.x, pt.z, pt.y + 1.5);
    // clear spot: across the road first, then further along
    let x = pt.x, z = pt.z;
    if (solidNear(world, x, y + 1, z, 1.6)) {
      let found = false;
      for (let ahead = 0; ahead <= 40 && !found; ahead += 8) {
        if (ahead) { s = R.loop ? (s + 8) % R.L : Math.min(s + 8, R.L - 2); routeAt(R, s, pt); y = R.off[pt.i] ? world.groundAt(pt.x, pt.z, world.heightAt(pt.x, pt.z) + 3) : world.groundAt(pt.x, pt.z, pt.y + 1.5); }
        for (const o of [0, 2.5, -2.5, 5, -5, 7.5, -7.5]) {
          const qx = pt.x - pt.dz * o, qz = pt.z + pt.dx * o;
          if (!solidNear(world, qx, y + 1, qz, 1.6)) { x = qx; z = qz; found = true; break; }
        }
      }
    }
    F.cars.place(e.v, x, z, yawOf(pt.dx, pt.dz), y);
    if (rewind) { const tr = e.tr; tr.i = pt.i; tr.s = s; tr.lap = R.loop ? Math.floor((P + R.startS) / R.L) : 0; tr.P = P; tr.init = true; e.P = P; e.prevP = P; A.bestP = P; }
    if (e.player) G.rig.snap();
  }
  function aiStep(A, e, dt) {
    const R = A.route, v = e.v, p = v.root.position;
    e.prevP = e.P;
    trackUpdate(R, e.tr, p.x, p.z); e.P = e.tr.P;
    if (e.done) { const i = v.input; i.throttle = 0; i.brake = 0.6; i.handbrake = 0; i.steer *= 0.9; i.autoReverse = false; i.reverse = false; return; }
    const gap = e.P - A.player.P;
    const T = e.tune;
    e.d.rubber = A.player.done ? 1 : clamp(1 - gap * T.rubberK, T.rubberLo, T.rubberHi);
    if (A.discipline === 'drag') { e.d.rubber = A.player.done ? 1 : clamp(1 - gap * 0.004, 0.94, 1.04); }
    // race-mode AI has no car following: back off behind a slower racer directly ahead (no rear-ending the pack)
    else {
      v.body.forward(_f);
      const fx = _f.x, fz = _f.z, fl = Math.hypot(fx, fz) || 1, sp = Math.max(1, v.body.speed);
      let cap = 9;
      for (const o of A.ents) {
        const ov = o.v; if (!ov || ov === v) continue;
        const dx = ov.pos.x - p.x, dz = ov.pos.z - p.z, along = (dx * fx + dz * fz) / fl;
        if (along < 2 || along > 16) continue;
        const lat = Math.abs((dx * -fz + dz * fx) / fl);
        if (lat > 2.4) continue;
        const os = ov.body.speed;
        if (os < sp) cap = Math.min(cap, clamp((os + (along - 6) * 0.6) / sp, 0.35, 1));
      }
      if (cap < e.d.rubber) e.d.rubber = cap;
    }
    e.d.drive(dt, G.traffic.ctx);
    // launch reaction
    if (A.t < 0.35 * (2 - T.launch)) { v.input.throttle = 0; v.input.brake = 1; }
    if (e.P >= A.total) { e.done = true; e.time = A.t; }
    // recover stuck / flipped rivals
    const up = v.body.up(_up).y;
    if ((up < 0.3 || v.body.speed < 0.6) && A.t > 4) { e.stuck += dt; if (e.stuck > 3) { respawnOnRoute(A, e, up < 0.3 ? 'flip' : 'stopped'); e.stuck = 0; } } else e.stuck = 0;
    // no route progress (wedged on a wall / parked car, rocking back and forth above 0.6 m/s, or lying tilted on two
    // wheels): the speed test above never fired and rivals sat on Hyde St for the rest of the race
    if (A.t > 4 && e.P < (e.bestP ?? -1e9) + 4) { e.noProg = (e.noProg || 0) + dt; if (e.noProg > (up < 0.6 ? 2 : 4.5)) { respawnOnRoute(A, e, 'noProgress'); e.noProg = 0; e.bestP = e.P; } }
    else { e.noProg = 0; e.bestP = e.P; }
    if (e.tr.dist > 60) { e.far = (e.far || 0) + dt; if (e.far > 4) { respawnOnRoute(A, e, 'offRoute'); e.far = 0; } } else e.far = 0;
  }
  function virtualStep(A, e, dt) {
    e.o.update(dt, A, F);
    e.prevP = e.P; e.P = e.o.P;
    if (!e.done && (e.o.done || e.P >= A.total)) { e.done = true; e.time = e.o.time || A.t; }
  }
  function binStep(A, e) {
    if (e.P <= 0) return;
    const k0 = Math.max(0, Math.floor(e.prevP / BIN) + 1), k1 = Math.min(e.bins.length - 1, Math.floor(e.P / BIN));
    for (let k = k0; k <= k1; k++) if (e.bins[k] < 0) e.bins[k] = A.t;
  }
  function rank(A) {
    const o = A.order;
    // insertion sort: finished first (by time), then progress
    for (let i = 1; i < o.length; i++) {
      const x = o[i]; let j = i - 1;
      while (j >= 0 && before(x, o[j])) { o[j + 1] = o[j]; j--; }
      o[j + 1] = x;
    }
    for (let i = 0; i < o.length; i++) o[i].pos = i + 1;
  }
  const before = (a, b) => (a.done && b.done ? a.time < b.time : a.done ? true : b.done ? false : a.P > b.P);
  const ladder = [];
  function gapOf(A, e) {
    const me = A.player;
    if (e === me) return null;
    if (e.pos < me.pos) { const k = Math.max(0, Math.floor(me.P / BIN)); const t = e.bins[k]; return t >= 0 ? -(A.t - t) : null; }
    const k = Math.max(0, Math.floor(e.P / BIN)); const t = me.bins[k]; return t >= 0 ? A.t - t : null;
  }
  // the UI shell's race panel (position / lap / checkpoint / time / gap) + checkpoint arrow
  const shellRace = { pos: 0, of: 0, rows: [], target: { x: 0, z: 0 } };
  function shellHud(A) {
    const me = A.player, tot = A.nCp * A.laps, j = Math.min(A.cpNext, tot - 1), c = A.cps[j % A.nCp];
    const d = shellRace; d.rows.length = 0; d.target.x = c.x; d.target.z = c.z;
    d.lap = A.laps > 1 ? clamp(Math.floor(A.cpNext / A.nCp) + 1, 1, A.laps) : null; d.laps = A.laps > 1 ? A.laps : null;
    d.cp = Math.min(A.cpNext, tot); d.cps = tot; d.time = Math.max(0, A.t); d.gap = null;
    const pb = A.discipline === 'drift' ? null : F.S.events[A.cfg.id]?.best; d.best = pb ?? null;
    if (A.discipline === 'drift') { d.pos = 0; d.of = 0; d.rows.push(['Score', fmtNum(A.drift.score())], ['Combo', A.drift.active ? `${fmtNum(A.drift.combo)} x${A.drift.mult.toFixed(1)}` : '—']); }
    else if (A.cfg.virtual?.some(o => o.catcher)) { const ch = A.ents.find(e => e.catcher); d.pos = 0; d.of = 0; d.rows.push(['Lead', `${((me.P - ch.P) / Math.max(8, me.v.body.speed)).toFixed(1)} s`]); }
    else {
      d.pos = me.pos; d.of = A.ents.length;
      const ahead = A.order[me.pos - 2]; if (ahead && A.phase === 'race') { const g = gapOf(A, ahead); if (g != null) d.gap = g; }
      if (A.discipline === 'drag') { d.cp = null; d.rows.push(['Speed', `${Math.round(speedVal(me.v.body.speed, G.hud?.units))} ${G.hud?.units === 'kmh' ? 'km/h' : 'mph'}`]); }
    }
    G.hud.race(d);
  }
  function updateHud(A, dt) {
    const H = F.racehud, me = A.player, tot = A.nCp * A.laps;
    if (H.shellHud()) shellHud(A);
    const lap = clamp(Math.floor(A.cpNext / A.nCp) + 1, 1, A.laps);
    const cpTxt = A.laps > 1 ? `${lap}<small>/${A.laps}</small>` : `${Math.min(A.cpNext, tot)}<small>/${tot}</small>`;
    if (A.discipline === 'drift') {
      H.set(0, fmtNum(A.drift.score())); H.set(1, A.drift.active ? `${fmtNum(A.drift.combo)} <small>x${A.drift.mult.toFixed(1)}</small>` : '—'); H.set(2, cpTxt); H.set(3, fmtTime(Math.max(0, A.t)));
    } else if (A.discipline === 'drag') {
      H.set(0, `${me.pos}<small>/${A.ents.length}</small>`); H.set(1, fmtTime(Math.max(0, A.t))); H.set(2, `${Math.round(speedVal(me.v.body.speed, G.hud?.units))}<small>${G.hud?.units === 'kmh' ? 'KM/H' : 'MPH'}</small>`);
    } else if (A.cfg.virtual?.some(o => o.catcher)) {
      const ch = A.ents.find(e => e.catcher), lead = me.P - ch.P, sp = Math.max(8, me.v.body.speed);
      H.set(0, `${(lead / sp).toFixed(1)}<small>s</small>`); H.set(1, cpTxt); H.set(2, fmtTime(Math.max(0, A.t)));
    } else {
      H.set(0, `${me.pos}<small>/${A.ents.length}</small>`); H.set(1, cpTxt); H.set(2, fmtTime(Math.max(0, A.t)));
    }
    if (A.discipline !== 'drift') {
      ladder.length = 0;
      for (const e of A.order) ladder.push({ pos: e.pos, name: e.name, color: e.color, gap: A.phase === 'race' ? gapOf(A, e) : null, me: e.player, done: e.done });
      H.ladder(ladder);
    }
    H.update(dt);
  }
  const tagList = [];
  function updateTags(A) {
    tagList.length = 0;
    for (const e of A.ents) if (!e.player) tagList.push({ v: e.v || e.o?.tagTarget || null, name: e.name, color: e.color, pos: e.pos || '' });
    F.racehud.tags(tagList);
  }

  // ---------------------------------------------------------------- finish
  function finishPlayer(A, how = 'finish') {
    const me = A.player;
    me.done = true; me.time = A.t;
    rank(A);
    if (how === 'caught') { me.pos = 2; for (const e of A.ents) if (e.catcher) e.pos = 1; }
    if ((how === 'timeout' && !A.drift) || how === 'beaten') me.pos = A.ents.length;
    A.phase = 'finished'; A.finT = 0; A.how = how;
    F.gates.hideAll(); F.line.clear(); F.racehud.warn(''); F.racehud.countdown(null);
    const place = me.pos;
    const win = A.drift ? null : place === 1;
    G.audio?.ui(how === 'caught' || how === 'timeout' || how === 'beaten' ? 'fail' : win || A.drift ? 'finish' : 'checkpoint');
    if (A.drift) A.drift.bank();
    const title = how === 'caught' ? 'CAUGHT' : how === 'beaten' ? 'BEATEN' : how === 'timeout' && !A.drift ? 'OUT OF TIME' : A.drift ? fmtNum(A.drift.score()) : ordinal(place).toUpperCase();
    F.overlay.banner(A.drift ? 'Final score' : how === 'finish' ? 'Finished' : '', title, A.drift ? '' : fmtTime(me.time), A.color, 2600);
    // estimate unfinished entrants' times from their pace
    for (const e of A.ents) if (!e.done && !e.player) {
      const pace = Math.max(8, e.P / Math.max(1, A.t));
      e.estTime = A.t + Math.max(0, A.total - e.P) / pace;
    }
    // cinematic orbit around the player's car
    let ct = 0;
    const side = Math.random() < 0.5 ? 1 : -1;
    G.cameraOverride = {
      update(cam, dt) {
        ct += dt;
        const p = me.v.root.position; me.v.body.forward(_f);
        const a = Math.atan2(_f.x, _f.z) + side * (1.2 + ct * 0.35);
        cam.position.set(p.x + Math.sin(a) * 8.5, p.y + 2.2 + ct * 0.3, p.z + Math.cos(a) * 8.5);
        cam.lookAt(p.x, p.y + 0.9, p.z);
      },
    };
  }
  function standings(A) {
    const me = A.player;
    let rows;
    if (A.drift) {
      const score = A.drift.score();
      rows = [{ name: me.name, color: me.color, score, player: true, rival: null }];
      for (const g of A.cfg.driftField || []) rows.push({ name: g.rival?.nick || g.name, color: g.rival?.color || '#ccc', score: g.score, rival: g.rival });
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((r, i) => { r.pos = i + 1; });
      return rows;
    }
    rows = A.ents.map(e => ({ name: e.name, color: e.color, player: !!e.player, rival: e.rival || null, time: e.done ? e.time : e.estTime ?? Infinity, est: !e.done, pos: e.pos, car: e.v ? F.cars.name(e.v.id) : e.o?.carName || '', label: e.catcher && A.how === 'caught' ? 'Caught you' : e.catcher ? 'Escaped' : null }));
    if (A.how === 'caught') for (const r of rows) if (r.player) { r.time = Infinity; r.label = 'Caught'; }
    if (A.how === 'caught') { rows.forEach(r => { if (r.player) r.pos = 2; else r.pos = 1; }); }
    else if (A.how === 'timeout' || A.how === 'beaten') { rows.sort((a, b) => (a.player ? 1 : 0) - (b.player ? 1 : 0) || a.time - b.time); rows.forEach((r, i) => { r.pos = i + 1; if (r.player) r.time = Infinity; }); }
    else {
      const meRow = rows.find(r => r.player);
      const others = rows.filter(r => !r.player).sort((a, b) => a.time - b.time);
      others.splice(me.pos - 1, 0, meRow);
      others.forEach((r, i) => { r.pos = i + 1; });
      rows = others;
    }
    rows.sort((a, b) => a.pos - b.pos);
    return rows;
  }
  async function showResults(A) {
    const rows = standings(A);
    const me = rows.find(r => r.player);
    const result = {
      id: A.cfg.id, place: me.pos, time: A.player.time, score: A.drift ? A.drift.score() : null, how: A.how, standings: rows, clean: A.hits === 0,
      laps: A.lapTimes, splits: A.splits, maxSpeed: A.maxSpeed, diff: A.cfg.diff ?? 1, entrants: rows.length, launch: A.launch?.t ?? null,
    };
    A.result = result;
    const rewards = A.cfg.rewards ? A.cfg.rewards(result) : null;
    result.rewards = rewards;
    try { G.garage?.recordRace?.(A.player.v.id, result.place === 1 && result.how === 'finish'); } catch { /* optional */ }
    let choice = 'continue';
    if (A.cfg.results !== false) choice = await F.screens.results(A, result, rewards);
    if (choice === 'restart') { restart(A); return; }
    RC.cleanup('done');
    A.cfg.onDone?.(result);
  }
  function restart(A) {
    const cfg = A.cfg;
    RC.cleanup('restart');
    RC.start({ ...cfg, attempt: (cfg.attempt || 0) + 1 });
  }
  RC.restart = function () { const A = RC.active; if (!A || A.phase === 'fadeout') return; restart(A); };
  RC.quit = function (why = 'quit') {
    const A = RC.active; if (!A) return;
    RC.cleanup(why);
    if (why !== 'replaced') { G.hud?.toast?.('Event abandoned', A.cfg.name, '', 2400); A.cfg.onDone?.(null); }
  };
  RC.cleanup = function (why) {
    const A = RC.active; if (!A) return;
    for (const e of A.ents) { if (e.kind === 'ai') G.removeVehicle(e.v); if (e.kind === 'virtual') e.o.cleanup?.(); }
    for (let i = 0; i < A.ents.length; i++) F.markers.remove('race-ent-' + i);
    F.markers.remove('race-cp');
    F.gates.hideAll(); F.line.clear(); F.racehud.hide();
    if (A.trafficDensity !== undefined) G.traffic.density = A.trafficDensity;
    F.restoreCorridor(A.parked);
    if (A.restore) F.restoreConditions(A.restore);
    G.cameraOverride = null; G.rig.snap();
    G.gps.points = null;
    G.events.active = null;
    F.overlay.fadeTo(0, 3);
    F.markers.setFilter(null);
    RC.active = null;
    if (F.activity?.A === A) F.activity = null;
    void why;
  };
  RC.onPlayerHit = function (strength) { const A = RC.active; if (A && A.phase === 'race' && strength > 0.18) { A.hits++; A.drift?.lose(); } };
  RC.driftTotal = () => RC.active?.drift?.score() ?? 0;
  void DIFFICULTY; void speedVal;
  return RC;
}
