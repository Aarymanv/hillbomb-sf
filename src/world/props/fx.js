// Breakable prop effects: knocked-over props (animated copies in the model's own InstancedMesh), tumbling shards,
// and the hydrant water geyser (pooled Points). All pools are preallocated.
import * as THREE from 'three';
import { dropTexture } from './textures.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _ax = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4(), _p = new THREE.Vector3();

export function createFx({ groundAt, shardSet, group }) {
  const falls = [];      // { set, d (dyn record), mode, ... }
  // ---------------------------------------------------------------- shards (instanced, one draw)
  const SH = 72;
  const shards = [];
  for (let i = 0; i < SH; i++) shards.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 1, col: [1, 1, 1], d: null });
  let shardCursor = 0;
  // ---------------------------------------------------------------- geyser particles
  const NP = 900;
  const pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pPos, 3); pAttr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', pAttr);
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const pMat = new THREE.PointsMaterial({ size: 0.26, map: dropTexture(), color: 0xdbe9f5, transparent: true, depthWrite: false, opacity: 0.72, sizeAttenuation: true });
  const points = new THREE.Points(pGeo, pMat); points.name = 'props:geyser'; points.frustumCulled = false; points.renderOrder = 3;
  group.add(points);
  let pCursor = 0; pGeo.setDrawRange(0, 0);
  const geysers = [];   // { x, y, z, t, dur }

  function spawnShards(x, y, z, dirX, dirZ, speed, col, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = shards[shardCursor]; shardCursor = (shardCursor + 1) % SH;
      s.life = 2.5 + Math.random() * 1.5;
      s.p.set(x + (Math.random() - 0.5) * 0.4, y + 0.3 + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.4);
      const sp = speed * (0.35 + Math.random() * 0.5);
      s.v.set(dirX * sp + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 4.5, dirZ * sp + (Math.random() - 0.5) * 4);
      s.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      s.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      s.s = 0.5 + Math.random() * 0.9;
      s.col = col;
      if (!s.d || !s.d.active) s.d = shardSet.addDynamic({ m: new THREE.Matrix4(), col });
      else s.d.col = col;
    }
  }
  // knocked-over prop. mode 'tip' (tall pole pivots about its base) or 'tumble' (rigid body)
  function knock(set, matrix, { dirX, dirZ, speed, mode, height = 3, radius = 0.3 }) {
    const d = set.addDynamic({ m: matrix.clone() });
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    matrix.decompose(pos, quat, scl);
    const f = { set, d, mode, pos, quat0: quat.clone(), quat, scl, dirX, dirZ, t: 0, height, radius, done: false, ttl: mode === 'tip' ? 25 : 16 };
    if (mode === 'tip') {
      f.theta = 0; f.omega = Math.min(2.2, speed / Math.max(2, height) * 0.9 + 0.3); f.slide = Math.min(6, speed * 0.25);
      f.axis = new THREE.Vector3(dirZ, 0, -dirX).normalize(); // fall toward (dirX, dirZ): rotate about up x dir
    } else {
      f.vel = new THREE.Vector3(dirX * speed * 0.55, 2.2 + speed * 0.18, dirZ * speed * 0.55);
      f.w = new THREE.Vector3((Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed * 0.5, (Math.random() - 0.5) * speed);
    }
    falls.push(f);
    return f;
  }
  function geyser(x, y, z, dur = 9) { geysers.push({ x, y, z, t: 0, dur }); }

  function update(dt) {
    dt = Math.min(dt, 1 / 20);
    // ---- knocked props
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i];
      f.t += dt;
      if (f.mode === 'tip') {
        if (f.theta < 1.48) {
          f.omega += (1.5 * 9.81 / f.height) * Math.sin(Math.max(0.05, f.theta)) * dt;
          f.theta += f.omega * dt;
          if (f.theta >= 1.48) { f.theta = 1.48; f.omega = -f.omega * 0.12; }
        } else if (f.omega !== 0) { f.theta = Math.min(1.48, f.theta + f.omega * dt); f.omega += 9.81 / f.height * dt; if (f.theta >= 1.48) { f.theta = 1.48; f.omega = 0; } }
        if (f.slide > 0) { const s = f.slide * dt; f.pos.x += f.dirX * s; f.pos.z += f.dirZ * s; f.slide = Math.max(0, f.slide - 9 * dt); }
        _q.setFromAxisAngle(f.axis, f.theta);
        f.quat.copy(_q).multiply(f.quat0);
      } else {
        f.vel.y -= 9.81 * dt;
        f.pos.addScaledVector(f.vel, dt);
        const g = groundAt(f.pos.x, f.pos.z, f.pos.y + 1) + 0.05;
        if (f.pos.y < g) {
          f.pos.y = g;
          if (f.vel.y < 0) f.vel.y = -f.vel.y * 0.25;
          f.vel.x *= 0.72; f.vel.z *= 0.72; f.w.multiplyScalar(0.6);
          if (Math.abs(f.vel.y) < 0.6) f.vel.y = 0;
        }
        const wl = f.w.length();
        if (wl > 1e-3) { _ax.copy(f.w).divideScalar(wl); _q.setFromAxisAngle(_ax, wl * dt); f.quat.premultiply(_q); }
        f.w.multiplyScalar(Math.max(0, 1 - dt * 0.8));
      }
      // sink out at the end of life
      let sink = 0;
      if (f.t > f.ttl - 1.5) sink = (f.t - (f.ttl - 1.5)) * 0.8;
      _p.set(f.pos.x, f.pos.y - sink, f.pos.z);
      f.d.m.compose(_p, f.quat, f.scl);
      f.set.dirty = true;
      if (f.t > f.ttl) { f.d.active = false; f.set.dirty = true; falls.splice(i, 1); }
    }
    // ---- shards
    let anyShard = false;
    for (const s of shards) {
      if (s.life <= 0) continue;
      anyShard = true;
      s.life -= dt;
      s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt);
      const g = groundAt(s.p.x, s.p.z, s.p.y + 1) + 0.04;
      if (s.p.y < g) { s.p.y = g; s.v.y = Math.abs(s.v.y) * 0.3; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.5); }
      const wl = s.w.length(); if (wl > 1e-3) { _ax.copy(s.w).divideScalar(wl); _q2.setFromAxisAngle(_ax, wl * dt); s.q.premultiply(_q2); }
      const sc = s.s * Math.min(1, s.life / 0.6);
      _s.set(sc, sc, sc);
      if (s.d) { s.d.m.compose(s.p, s.q, _s); if (s.life <= 0) s.d.active = false; }
    }
    if (anyShard) shardSet.dirty = true;
    // ---- geysers: emit + integrate particles
    for (let i = geysers.length - 1; i >= 0; i--) {
      const G = geysers[i]; G.t += dt;
      const k = G.t < G.dur ? Math.min(1, G.t * 3) * (G.t > G.dur - 2 ? (G.dur - G.t) / 2 : 1) : 0;
      const emit = Math.floor(420 * dt * k + Math.random());
      for (let e = 0; e < emit; e++) {
        const j = pCursor; pCursor = (pCursor + 1) % NP;
        const a = Math.random() * Math.PI * 2, r = Math.random() * Math.random() * 1.6;
        pPos[j * 3] = G.x + (Math.random() - 0.5) * 0.12; pPos[j * 3 + 1] = G.y + 0.5; pPos[j * 3 + 2] = G.z + (Math.random() - 0.5) * 0.12;
        const up = (8 + Math.random() * 4) * (0.75 + 0.25 * k);
        pVel[j * 3] = Math.cos(a) * r; pVel[j * 3 + 1] = up; pVel[j * 3 + 2] = Math.sin(a) * r;
        pLife[j] = 2.2;
      }
      if (G.t > G.dur + 2.5) geysers.splice(i, 1);
    }
    let live = 0, maxLive = 0;
    for (let j = 0; j < NP; j++) {
      if (pLife[j] <= 0) continue;
      pLife[j] -= dt; live++; maxLive = j + 1;
      pVel[j * 3 + 1] -= 9.81 * dt;
      pPos[j * 3] += pVel[j * 3] * dt; pPos[j * 3 + 1] += pVel[j * 3 + 1] * dt; pPos[j * 3 + 2] += pVel[j * 3 + 2] * dt;
      const g = groundAt(pPos[j * 3], pPos[j * 3 + 2], pPos[j * 3 + 1] + 2) + 0.05;
      if (pPos[j * 3 + 1] < g) { pPos[j * 3 + 1] = g; pVel[j * 3 + 1] = Math.abs(pVel[j * 3 + 1]) * 0.15; pVel[j * 3] *= 2.2; pVel[j * 3 + 2] *= 2.2; pLife[j] = Math.min(pLife[j], 0.35); }
      if (pLife[j] <= 0) pPos[j * 3 + 1] = -9999;
    }
    pGeo.setDrawRange(0, live ? maxLive : 0);
    if (live) { pAttr.clearUpdateRanges(); pAttr.addUpdateRange(0, maxLive * 3); pAttr.needsUpdate = true; }
    points.visible = live > 0;
  }
  return { knock, spawnShards, geyser, update, get active() { return falls.length + geysers.length; } };
}
