// Ambient traffic: spawns AI cars on lanes in a ring around the player, despawns far ones, handles reactions.
import * as THREE from 'three';
import { Vehicle, TRAFFIC_MIX } from '../vehicle/cars.js';
import { Driver, lanePoint } from './drivers.js';
import { edgesInRing } from '../world/roads.js';
const _ring = [];

const _f = new THREE.Vector3();
export function createTraffic({ scene, world, sim, game, max = 26 }) {
  const cars = []; // {v, d}
  const graph = world.graph;
  let spawnT = 0;
  if (world.v2) max = Math.round(max * 1.5);           // the 1:1 city: busier streets
  const T = { cars, max, density: 1, enabled: true };
  const rnd = Math.random;

  function pickModel(edge) {
    let tot = 0; for (const [, w] of TRAFFIC_MIX) tot += w;
    for (let tries = 0; tries < 4; tries++) {
      let r = rnd() * tot;
      for (const [id, w] of TRAFFIC_MIX) { r -= w; if (r <= 0) { if (id === 'bus' && edge.width < 14) break; return id; } }
    }
    return 'sedan';
  }
  function trySpawn(focus, camFwd, near = false) {
    // random edge whose midpoint is in the ring
    const R0 = world.v2 ? 90 : 170, R1 = world.v2 ? 300 : 330;   // 1:1 map: denser ring closer to the player
    const r0q = near ? 40 : R0, r1q = near ? 260 : R1;
    const ring = edgesInRing(graph, focus.x, focus.z, r0q, r1q, _ring);
    if (!ring.length) return null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const e = ring[(rnd() * ring.length) | 0];
      if (e.kind === 'crooked' || e.len < 20 || e.traffic === false) continue;
      const mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
      const dx = mx - focus.x, dz = mz - focus.z, dist = Math.hypot(dx, dz);
      const r0 = r0q, r1 = r1q;
      if (dist < r0 || dist > r1) continue;
      // avoid popping in right in front of the camera
      if (!near && dist < 260 && (dx * camFwd.x + dz * camFwd.z) / dist > 0.55) continue;
      const dir = rnd() < 0.5 || e.oneway ? 1 : -1;
      const lane = (rnd() * e.lanes) | 0;
      const s = 8 + rnd() * Math.max(1, e.len - 16);
      const p = lanePoint(e, dir, lane, s, {});
      if (cars.some(c => (c.v.pos.x - p.x) ** 2 + (c.v.pos.z - p.z) ** 2 < 14 * 14)) continue;
      if (game.vehicles().some(v => (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2 < 12 * 12)) continue;
      const id = pickModel(e);
      const v = new Vehicle(id, { scene, seed: rnd() * 1000 });
      const y = (e.deck ? p.y : world.groundAt(p.x, p.z, 999)) + 0.25;
      const yaw = Math.atan2(-p.hx, -p.hz);
      v.place(p.x, y, p.z, yaw);
      const speed = Math.min(13, e.kind === 'highway' || e.kind === 'bridge' ? 22 : 11);
      v.body.vel.set(p.hx * speed, 0, p.hz * speed);
      v.driver = 'npc'; v.role = 'traffic';
      const d = new Driver(v, graph, { mode: 'traffic', rnd });
      d.start(e, dir, lane, s);
      v.ai = d;
      cars.push({ v, d });
      game.addVehicle(v);
      return v;
    }
    return null;
  }
  function despawn(c) {
    const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);
    game.removeVehicle(c.v);
  }
  const frustum = new THREE.Frustum(), _m = new THREE.Matrix4(), _s = new THREE.Sphere(), camPos = new THREE.Vector3();
  const ctx = {
    time: 0,
    // on screen (or right next to the camera): rescues / despawns must not pop cars in or out in view
    inView(x, y, z, r = 3) {
      if ((x - camPos.x) ** 2 + (z - camPos.z) ** 2 < 30 * 30) return true;
      _s.center.set(x, y, z); _s.radius = r; return frustum.intersectsSphere(_s);
    },
    occupied(x, z, r, self) {
      for (const v of game.vehicles()) if (v !== self && (v.pos.x - x) ** 2 + (v.pos.z - z) ** 2 < r * r) return true;
      const P = game.player?.pos; return !!P && (P.x - x) ** 2 + (P.z - z) ** 2 < r * r;
    },
    nodeBusy(n, self) {
      for (const v of game.vehicles()) {
        if (v === self) continue;
        const dx = v.pos.x - n.x, dz = v.pos.z - n.z;
        if (dx * dx + dz * dz < (n.radius + 1) ** 2 && v.body.speed > 1) return true;
      }
      return false;
    },
    carAhead(self, fx, fz, range) {
      let best = null;
      const px = self.pos.x, pz = self.pos.z;
      for (const v of game.vehicles()) {
        if (v === self) continue;
        const dx = v.pos.x - px, dz = v.pos.z - pz;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > range) continue;
        const lat = Math.abs(dx * -fz + dz * fx);
        if (lat > 2.4 + along * 0.03) continue;
        if (Math.abs(v.pos.y - self.pos.y) > 3) continue;
        v.body.forward(_f);
        const sp = Math.max(0, _f.x * v.body.vel.x + _f.z * v.body.vel.z) * Math.max(0, _f.x * fx + _f.z * fz);
        if (!best || along < best.dist) best = { v, dist: along, speed: sp };
      }
      // pedestrians / player on foot
      const P = game.playerOnFoot?.();
      if (P) {
        const dx = P.x - px, dz = P.z - pz, along = dx * fx + dz * fz;
        if (along > 0 && along < range && Math.abs(dx * -fz + dz * fx) < 1.8 && (!best || along < best.dist)) best = { v: { role: 'player' }, dist: along + 3, speed: 0 };
      }
      return best;
    },
  };
  T.update = function (dt, focus, camera, time) {
    ctx.time = time;
    camera.getWorldDirection(_f);
    const camFwd = { x: _f.x, z: _f.z };
    const target = Math.round(T.max * T.density);
    // initial fill
    if (cars.length < target) {
      spawnT -= dt;
      if (spawnT <= 0) { trySpawn(focus, camFwd, cars.length < target * 0.5 && time < 3); spawnT = cars.length < target * 0.6 ? 0.05 : 0.4; }
    }
    camPos.copy(camera.position);
    frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], v = c.v;
      const dx = v.pos.x - focus.x, dz = v.pos.z - focus.z, d2 = dx * dx + dz * dz;
      if (d2 > 400 * 400 || v.pos.y < -3 || (d2 > 200 * 200 && (v.health <= 0 || !v.driver))) { despawn(c); continue; }
      // blocked queues: wrecks / abandoned cars and cars pinned behind a stationary non-driving car are cleared once out
      // of view (a queue behind a red light never waits this long: one signal cycle is 34 s)
      c.still = v.body.speed < 0.6 ? (c.still || 0) + dt : 0;
      if (c.still > 4 && (v.health <= 0 || !v.driver) && !ctx.inView(v.pos.x, v.pos.y + 1, v.pos.z)) { despawn(c); continue; }
      if (c.still > 45 && v.driver === 'npc' && !ctx.inView(v.pos.x, v.pos.y + 1, v.pos.z)) { despawn(c); continue; }
      const blk = v.driver === 'npc' ? c.d.blockedBy : null;
      c.blockT = blk && blk.role !== 'player' && blk.body && blk.body.speed < 0.6 && (!blk.driver || blk.health <= 0 || blk.ai?.state === 'stopped' || blk.ai?.unstuck) && c.still > 0 ? (c.blockT || 0) + dt : 0;
      if (c.blockT > 8) {
        const bc = cars.find(q => q.v === blk);
        if (bc && !ctx.inView(blk.pos.x, blk.pos.y + 1, blk.pos.z)) { despawn(bc); c.blockT = 0; continue; }
        if (!ctx.inView(v.pos.x, v.pos.y + 1, v.pos.z)) { despawn(c); continue; }
        if (c.blockT > 14 && c.d.edge && c.d.edge.lanes > 1) { c.blockT = 0; const l = (c.d.lane + 1) % c.d.edge.lanes; const n = graph.nearestEdge(v.pos.x, v.pos.z, 30); if (n && n.edge === c.d.edge) c.d.start(c.d.edge, c.d.dir, l, c.d.dir > 0 ? n.s : c.d.edge.len - n.s); }
      }
      if (v.driver === 'npc' && v.ai === c.d) {
        if (v.health <= 0 || v.body.up(_f).y < 0.2) { v.driver = null; v.input.throttle = 0; v.input.brake = 1; v.input.autoReverse = false; v.input.reverse = false; continue; }
        if (c.d.shock > 0) { c.d.shock -= dt; v.input.throttle = 0; v.input.brake = 1; v.input.autoReverse = false; v.input.reverse = false; v.input.steer = 0; if (c.d.shock <= 0 && c.d.rnd() < 0.3) c.d.honk = 0.8; continue; }
        c.d.drive(dt, ctx);
      }
    }
  };
  T.onHit = function (v, strength) {
    const c = cars.find(c => c.v === v);
    if (!c) return;
    if (strength > 0.12) { c.d.shock = 1.2 + strength * 2; }
  };
  T.removeCar = function (v) { const c = cars.find(c => c.v === v); if (c) { const i = cars.indexOf(c); cars.splice(i, 1); } };
  T.clear = function () { for (const c of cars.slice()) despawn(c); };
  T.ctx = ctx;
  return T;
}
