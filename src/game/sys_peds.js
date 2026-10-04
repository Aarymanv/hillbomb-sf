// HILLBOMB: pedestrians. A living-city crowd around the player: sidewalk walkers, pairs, chatting groups,
// phone-starers, bus-stop waiters, joggers on park paths and promenades, tourists at landmarks.
// They cross at corners on the walk signal, avoid each other, lean into the hills, dodge / dive from fast
// cars, startle at horns, flee crashes and get knocked flying (ballistic tumble -> lie -> get up).
//
// API: G.peds = { list, spawnFleeing(vehicle), update(dt), panic(x, z, radius, strength), near(x, z, r, out),
//                 pedAhead(x, z, y, fx, fz, range), density, enabled, stats }
// Events emitted: 'pedHit' (ped, speed, vehicle)      player's car hit a pedestrian (> 4 m/s)
//                 'pedHitNpc' (ped, speed, vehicle)   an AI car hit a pedestrian
//                 'pedCarjacked' (ped, vehicle)       driver thrown out by a carjack
//                 'pedShoved' (ped, speed)            the player on foot bowled someone over
//                 'pedPanic' (x, z, count)            a crash / wreck scattered the crowd
// Performance: one draw call per human (pooled SkinnedMeshes), distance / visibility LOD on behaviour and
// animation, hidden beyond 150 m, shadows only near the camera.
import * as THREE from 'three';
import { signalFor } from './drivers.js';
import { pushOutCircle } from '../player/player.js';
import { zoneAt } from '../world/map.js';
import { createNav, pathPos, OFF_MIN, OFF_MAX, NIGHTLIFE, LIFT_WALK, LIFT_ROAD } from './peds/nav.js';
import { createHumanPool } from './peds/looks.js';
import { createYeller, pickLine } from './peds/yell.js';
import { setPedViewer } from './peds/realhuman.js';

const MAX_BY_QUALITY = { low: 22, medium: 34, high: 45 };
const R_PED = 0.3;
const SPAWN_MIN = 38, SPAWN_MAX = 125, DESPAWN = 175, HIDE = 150;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const rand = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);                // yaw facing direction (dx, dz)

// bone indices of src/player/human.js
const BN = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, uaL: 5, laL: 6, hL: 7, uaR: 8, laR: 9, hR: 10 };

export function install(G) {
  const world = G.world, scene = G.scene, camera = G.camera;
  const colliders = world.colliders;
  const nav = createNav(world);
  const qName = G.quality?.name || 'high';
  const MAXP = Math.round((MAX_BY_QUALITY[qName] ?? 34) * (world.v2 ? 1.6 : 1));   // 1:1 map: busier sidewalks
  const shadowsOn = (G.quality?.shadows ?? 1) > 0 && qName !== 'low';
  const group = new THREE.Group(); group.name = 'peds';
  scene.add(group);
  const POOL_CAP = MAXP + 16;
  const pool = createHumanPool(group, { cap: POOL_CAP });
  const yell = createYeller(scene, 5);
  const list = [];
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = { x: 0, z: 0 }, _p = {}, _pp = {}, _pc = new THREE.Vector3();
  const _cand = [], _sph = new THREE.Sphere(), _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4();

  // warm the pool now (inside the loading screen) so spawning never builds a new body variant mid-game
  // (the whole pool is built here: new body variants cost ~15 ms each, extra humans of a known variant ~2.5 ms;
  //  doing it mid-game would spike frames)
  const tw = performance.now();
  const warm = { generic: Math.round(POOL_CAP * 0.56), business: Math.round(POOL_CAP * 0.16), tourist: Math.round(POOL_CAP * 0.17), jogger: Math.round(POOL_CAP * 0.11) };
  try { for (const k in warm) pool.warm(k, warm[k]); } catch (e) { console.warn('[peds] warm', e); }
  const warmMs = performance.now() - tw;

  const P = {
    list, density: 1, enabled: true, max: MAXP,     // max: crowd size cap (quality preset; the pool grows to max + 16)
    stats: { ms: 0, active: 0, visible: 0, updated: 0, pool: 0, target: 0, warmMs: Math.round(warmMs) },
    spawnFleeing, update, panic, near, pedAhead, nav,
    // dev: knock ped p over as if hit by a car at speed v moving along (dx, dz)
    debugKnock(p, v = 12, dx = 1, dz = 0) { const l = Math.hypot(dx, dz) || 1; knock(p, { sp: v, vx: dx / l * v, vz: dz / l * v, x: p.x - dx / l, z: p.z - dz / l, v: {}, player: false }, v, dx / l, dz / l); },
  };
  G.peds = P;
  G.systems.push({ update: dt => P.update(dt) });

  let time = 0, frame = 0, uid = 0, targetF = 0, initialFill = true, firstFill = true, lastFocusX = null, lastFocusZ = 0, fillT = 0;
  let candT = -9, candX = 1e9, candZ = 1e9, localSum = 0, lastPanicT = -9, lastPanicX = 0, lastPanicZ = 0;
  const cands = [];           // {w, b?, R?, path?, s0?, x, z, dens}
  const spotCount = new Map();

  // ------------------------------------------------------------------------------------------ ped objects
  function newPed(style, kind, force = false) {
    if (pool.all.length >= pool.cap && !pool.freeCount() && !force) return null;
    const h = pool.acquire(style, force);
    if (!h) return null;
    const p = {
      id: ++uid, human: h, style, kind, alive: true,
      x: 0, y: 0, z: 0, yaw: 0, hx: 0, hz: -1, spd: 0, pref: 1.35, vx: 0, vz: 0,
      mode: 'stand', R: null, k: 0, t: 0, dir: 1, off: 1.8, offPref: 1.8, offAvoid: 0, offObs: 0, obsT: 0, lastCorner: -1,
      path: null, s: 0, lat: 0, latPref: 0,
      cr: null, tx: 0, tz: 0, fvx: 0, fvz: 0, freeT: 0, onArrive: null, freeSpd: 1.4,
      sx: 0, sz: 0, syaw: 0, standT: 0, standAnim: 'idle',
      act: null, actT: 0, actYaw: null,
      fear: 0, fx: 0, fz: 0, fleeSpd: 5, hurry: 0,
      tb: null, lying: 0, partner: null, leader: null, side: 0, spot: null, talk: 0,
      every: 1, ctr: (Math.random() * 8) | 0, acc: 0, dCam: 0, dPl: 0, inView: false,
      anim: 'idle', aSpeed: 0, turn: 0, slope: 0, slopeL: 0, lookW: 0, lookYaw: 0,
      threatT: 0, reflex: rand(0.1, 0.38), hitCd: 0, yellCd: 0, onRoad: false, bornT: time, probeT: Math.random() * 0.3,
      nextIdle: rand(12, 45), gy: 0, placed: false, waitPhone: chance(0.3),
    };
    h.root.visible = true;
    list.push(p);
    return p;
  }
  function despawn(p) {
    if (!p.alive) return;
    p.alive = false;
    const i = list.indexOf(p); if (i >= 0) list.splice(i, 1);
    if (p.spot) spotCount.set(p.spot, Math.max(0, (spotCount.get(p.spot) || 1) - 1));
    if (p.seat && p.seat.slots[p.slot] === p) p.seat.slots[p.slot] = null;
    for (const q of list) { if (q.leader === p) q.leader = null; if (q.partner === p) q.partner = null; }
    yell.clear(p);
    pool.release(p.human);
  }
  function speedFor(style, kind) {
    if (kind === 'jogger') return rand(2.7, 3.6);
    if (style === 'business') return rand(1.4, 1.75);
    if (style === 'tourist') return rand(0.95, 1.3);
    return chance(0.12) ? rand(0.85, 1.1) : rand(1.15, 1.6);
  }

  // ------------------------------------------------------------------------------------------ mode setters
  function setRing(p, R, k, t, off, dir) {
    p.mode = 'ring'; p.R = R; p.k = k; p.t = clamp(t, 0, 1); p.off = clamp(off, 0.2, 3.4); p.dir = dir;
    p.offAvoid = 0; p.offObs = 0; p.lastCorner = -1; p.cr = null; p.onRoad = false;
    ringPoint(p, _p); p.hx = R.ex[k] * dir; p.hz = R.ez[k] * dir;
  }
  function setFree(p, tx, tz, spd, onArrive) {
    p.mode = 'free'; p.tx = tx; p.tz = tz; p.freeSpd = spd; p.onArrive = onArrive || null; p.fvx = 0; p.fvz = 0; p.freeT = 12;
  }
  function setStand(p, x, z, yaw, anim, dur) {
    p.mode = 'stand'; p.sx = x; p.sz = z; p.x = x; p.z = z; p.syaw = yaw; p.standAnim = anim; p.standT = dur; p.spd = 0;
  }
  /** put a ped back on a sidewalk ring (after a dodge / tumble / stand); false if nowhere near */
  function reattach(p, prefDir = 0) {
    const b = nav.blockAt(p.x, p.z);
    if (b) {
      const at = nav.attach(b, p.x, p.z, p.hx, p.hz);
      if (at && at.off > 0.25 && at.off < 3.45) {
        let dir = prefDir || (at.align >= 0 ? 1 : -1);
        if (p.fear > 0) dir = (at.R.ex[at.k] * (p.x - p.fx) + at.R.ez[at.k] * (p.z - p.fz)) >= 0 ? 1 : -1;
        setRing(p, at.R, at.k, at.t, at.off, dir);
        p.offPref = clamp(p.offPref, 1.1, 2.7);
        return true;
      }
    }
    const nr = nav.nearestRing(p.x, p.z, 45, clamp(p.offPref, 1.2, 2.6));
    if (nr) {
      const spd = p.fear > 0 ? p.fleeSpd : p.hurry > 0 ? 2.6 : p.pref * 1.1;
      setFree(p, nr.x, nr.z, spd, q => {
        let dir = chance(0.5) ? 1 : -1;
        if (q.fear > 0) dir = (nr.R.ex[nr.k] * (q.x - q.fx) + nr.R.ez[nr.k] * (q.z - q.fz)) >= 0 ? 1 : -1;
        setRing(q, nr.R, nr.k, nr.t, nr.off, dir);
      });
      return true;
    }
    // parks / promenades: nearest path
    let best = null, bd = 50;
    for (const path of nav.paths) {
      const bb = path._bb || (path._bb = bboxOf(path.pts));
      if (p.x < bb[0] - bd || p.x > bb[2] + bd || p.z < bb[1] - bd || p.z > bb[3] + bd) continue;
      for (let i = 0; i < path.pts.length; i += 3) { const d = Math.hypot(path.pts[i][0] - p.x, path.pts[i][1] - p.z); if (d < bd) { bd = d; best = { path, s: path.cum[i] }; } }
    }
    if (best) {
      pathPos(best.path, best.s, _pp);
      setFree(p, _pp.x, _pp.z, p.pref * 1.1, q => { q.mode = 'path'; q.path = best.path; q.s = best.s; q.dir = chance(0.5) ? 1 : -1; q.lat = 0; });
      return true;
    }
    setStand(p, p.x, p.z, p.yaw, 'idle', rand(3, 8));
    return false;
  }
  /** break social links (chat partner, tourist spot, pair leader) before a ped runs off on its own */
  function detach(p) {
    if (p.seat) {
      const s = p.seat;
      if (s.slots[p.slot] === p) s.slots[p.slot] = null;
      if (p.standAnim === 'sit') { const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw); p.x += fx * 0.55; p.z += fz * 0.55; p.sx = p.x; p.sz = p.z; }
      p.seat = null; p.fixedY = null;
      if (p.standAnim === 'sit') p.standAnim = 'idle';
    }
    if (p.partner) { const q = p.partner; q.partner = null; p.partner = null; if (q.mode === 'stand') q.standT = Math.min(q.standT, rand(0.5, 2)); }
    if (p.spot) { spotCount.set(p.spot, Math.max(0, (spotCount.get(p.spot) || 1) - 1)); p.spot = null; }
    p.leader = null;
  }
  function bboxOf(pts) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of pts) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return [a, b, c, d]; }

  // ------------------------------------------------------------------------------------------ ring geometry
  function ringPoint(p, out) {
    const R = p.R, n = R.n;
    out.hx = undefined;
    nav.ringPos(R, p.k, p.t, p.off, out);
    const L = nav.ringLen(R, p.k, p.off);
    const rc = Math.min(1.0, L * 0.3);
    const dEnd = (p.dir > 0 ? 1 - p.t : p.t) * L, dStart = L - dEnd;
    if (dEnd >= rc && dStart >= rc) return out;
    // round the corner with a quadratic bezier over [vertex - rc, vertex + rc]
    let ka, kb, u;                                    // ka = edge before the vertex, kb = edge after (walking order)
    if (dEnd < rc) { ka = p.k; kb = p.dir > 0 ? (p.k + 1) % n : (p.k + n - 1) % n; u = 0.5 * (1 - dEnd / rc); }
    else { kb = p.k; ka = p.dir > 0 ? (p.k + n - 1) % n : (p.k + 1) % n; u = 0.5 + 0.5 * dStart / rc; }
    const La = nav.ringLen(R, ka, p.off), Lb = nav.ringLen(R, kb, p.off);
    const ta = p.dir > 0 ? 1 - rc / La : rc / La, tv = p.dir > 0 ? 1 : 0, tb = p.dir > 0 ? rc / Lb : 1 - rc / Lb;
    nav.ringPos(R, ka, clamp(ta, 0, 1), p.off, _b1);
    nav.ringPos(R, ka, tv, p.off, _b2);
    nav.ringPos(R, kb, clamp(tb, 0, 1), p.off, _b3);
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.x = a * _b1.x + b * _b2.x + c * _b3.x; out.z = a * _b1.z + b * _b2.z + c * _b3.z;
    // heading along the curve
    out.hx = 2 * (1 - u) * (_b2.x - _b1.x) + 2 * u * (_b3.x - _b2.x); out.hz = 2 * (1 - u) * (_b2.z - _b1.z) + 2 * u * (_b3.z - _b2.z);
    return out;
  }
  const _b1 = {}, _b2 = {}, _b3 = {};

  // ------------------------------------------------------------------------------------------ spawning
  function refreshCandidates(fx, fz) {
    cands.length = 0; localSum = 0;
    const blocks = nav.blocksNear(fx, fz, SPAWN_MAX + 30, _cand);
    for (const b of blocks) {
      const R = nav.ring(b); if (!R) continue;
      const d = Math.hypot(b.cx - fx, b.cz - fz);
      if (d > SPAWN_MAX + 40) continue;
      const dens = nav.densityAt(b.cx, b.cz) * (b.park ? 0.7 : 1);
      const w = dens * R.per;
      cands.push({ w, R, b, x: b.cx, z: b.cz, dens, zone: b.zone, park: b.park });
      // how much of this block's sidewalk lies within the live ring (rough)
      localSum += w * clamp(1 - Math.max(0, d - SPAWN_MAX) / 40, 0, 1);
    }
    for (const path of nav.paths) {
      const bb = path._bb || (path._bb = bboxOf(path.pts));
      if (fx < bb[0] - SPAWN_MAX - 30 || fx > bb[2] + SPAWN_MAX + 30 || fz < bb[1] - SPAWN_MAX - 30 || fz > bb[3] + SPAWN_MAX + 30) continue;
      for (let s = 10; s < path.len - 10; s += 40) {
        pathPos(path, s, _pp);
        const d = Math.hypot(_pp.x - fx, _pp.z - fz);
        if (d > SPAWN_MAX + 20) continue;
        const w = path.density * 40 * 0.6;
        cands.push({ w, path, s0: s, x: _pp.x, z: _pp.z, dens: path.density });
        if (d < SPAWN_MAX) localSum += w;
      }
    }
    candT = time; candX = fx; candZ = fz;
  }
  // spawn weight: sidewalk length x density, biased toward the player (people far away are barely visible)
  // (a target spawn distance is drawn first, skewed toward the near edge of the ring; blocks around that
  //  distance are preferred and the ring point closest to it is used)
  function pickCandidate(fx, fz, dStar) {
    let tot = 0;
    for (const c of cands) { const e = (Math.hypot(c.x - fx, c.z - fz) - dStar) / 45; c.wd = c.w / (1 + e * e); tot += c.wd; }
    if (tot <= 0) return null;
    let r = Math.random() * tot;
    for (const c of cands) if ((r -= c.wd) < 0) return c;
    return cands[cands.length - 1];
  }
  // spawn gate: in the ring, off-screen (or far / occluded), not on top of someone
  function spawnOK(x, y, z, fx, fz, rMin, rMax, allowView, seated = false) {
    const d = Math.hypot(x - fx, z - fz);
    if (d < rMin || d > rMax) return false;
    if (!allowView) {
      const cx = camera.position.x, cz = camera.position.z, dc = Math.hypot(x - cx, z - cz);
      _sph.center.set(x, y + 0.9, z); _sph.radius = 1.2;
      if (dc < 85 && _frustum.intersectsSphere(_sph)) {
        // visible unless a building is in the way
        if (colliders.raycast2D(cx, cz, x, z, y + 1.4, 0) >= 0.97) return false;
      }
    }
    for (const q of list) if ((q.x - x) ** 2 + (q.z - z) ** 2 < (seated ? 0.5 : 2.2)) return false;
    if (!seated && colliders.pointHit(x, y + 1, z, R_PED + 0.05)) return false;
    return true;
  }
  function kindTable(zone, park) {
    if (park) return [['walker', 44], ['jogger', 26], ['pair', 12], ['chat', 8], ['stand', 6], ['bench', 4]];
    switch (zone) {
      case 'downtown': case 'downtown_soma': return [['walker', 56], ['pair', 10], ['stand', 8], ['chat', 8], ['bus', 12], ['jogger', 2], ['window', 4]];
      case 'chinatown': case 'wharf': return [['walker', 50], ['pair', 15], ['stand', 8], ['chat', 10], ['bus', 5], ['window', 12]];
      case 'marina': return [['walker', 50], ['jogger', 20], ['pair', 13], ['chat', 8], ['stand', 5], ['window', 4]];
      case 'mission': case 'castro': case 'northbeach': return [['walker', 50], ['pair', 14], ['chat', 13], ['stand', 8], ['bus', 6], ['window', 9]];
      default: return [['walker', 58], ['pair', 12], ['chat', 9], ['stand', 8], ['bus', 5], ['jogger', 6], ['window', 2]];
    }
  }
  function styleFor(zone, x, z) {
    const biz = zone === 'downtown' ? 0.42 : zone === 'downtown_soma' ? 0.3 : zone === 'soma' ? 0.16 : 0.06;
    let tour = zone === 'wharf' ? 0.5 : zone === 'chinatown' ? 0.3 : 0.05;
    if (Math.hypot(x - 1400, z + 100) < 200) tour = Math.max(tour, 0.35);   // Union Square
    const r = Math.random();
    return r < biz ? 'business' : r < biz + tour ? 'tourist' : 'generic';
  }
  const pickW = t => { let s = 0; for (const [, w] of t) s += w; let r = Math.random() * s; for (const [v, w] of t) if ((r -= w) < 0) return v; return t[0][0]; };

  // people sitting on benches / waiting at bus shelters (street-props module)
  const _seats = [];
  function trySpawnSeat(fx, fz, rMin, rMax, allowView) {
    const seats = nav.seatsNear(fx, fz, rMax, _seats);
    if (!seats.length) return null;
    for (let tries = 0; tries < 4; tries++) {
      const s = seats[(Math.random() * seats.length) | 0];
      const d = Math.hypot(s.x - fx, s.z - fz);
      if (d < rMin || d > rMax) continue;
      const free = []; s.slots.forEach((q, i) => { if (!q || !q.alive) free.push(i); });
      if (!free.length) continue;
      const slot = free[(Math.random() * free.length) | 0];
      let lx, lz, yaw = s.yaw, anim = 'sit';
      if (s.type === 'bench') { lx = slot ? 0.45 : -0.45; lz = -0.04; }
      else if (slot < 2) { lx = slot ? 0.75 : -0.35; lz = 0.4; }
      else { lx = -1.5 + (slot - 2) * 1.35 + rand(-0.3, 0.3); lz = rand(-1.25, -0.95); yaw += rand(-0.6, 0.6); anim = chance(0.4) ? 'phone' : 'bus'; }
      const q = nav.seatPoint(s, lx, lz, _q);
      const x = q.x, z = q.z;
      if (!spawnOK(x, s.y, z, fx, fz, rMin, rMax, allowView, anim === 'sit')) continue;
      const zone = nav.zoneAt(x, z);
      const p = newPed(styleFor(zone, x, z), anim === 'sit' ? 'sitter' : 'bus'); if (!p) return null;
      setStand(p, x, z, yaw, anim, anim === 'sit' ? rand(20, 70) : rand(15, 45));
      placeAt(p, x, s.y, z, yaw);
      p.fixedY = anim === 'sit' ? s.y : null;
      p.seat = s; p.slot = slot; s.slots[slot] = p;
      p.offPref = rand(1.2, 2.5);
      return p;
    }
    return null;
  }
  function trySpawn(fx, fz, rMin, rMax, allowView) {
    if (chance(0.16)) { const p = trySpawnSeat(fx, fz, rMin, rMax, allowView); if (p) return p; }
    // tourists at landmarks first
    for (const spot of nav.spots) {
      const d = Math.hypot(spot.x - fx, spot.z - fz);
      if (d > rMax + 10 || d < Math.min(rMin, 25)) continue;
      if ((spotCount.get(spot) || 0) >= spot.n) continue;
      if (!chance(0.5)) continue;
      const pts = nav.spotPoints(spot);
      if (pts.length < 3) continue;
      const [x, z] = pts[(Math.random() * pts.length) | 0];
      const y = nav.standY(x, z, spot.deck ? 20 : Infinity);
      if (!spawnOK(x, y, z, fx, fz, 0, rMax + 10, allowView)) continue;
      return spawnTourist(spot, x, z, y);
    }
    const dStar = rMin + (rMax - rMin) * Math.pow(Math.random(), 2.2);
    const c = pickCandidate(fx, fz, dStar); if (!c) return null;
    if (c.path) {
      const s = clamp(c.s0 + rand(-20, 20), 2, c.path.len - 2);
      pathPos(c.path, s, _pp);
      const lat = rand(-1.1, 1.1);
      const x = _pp.x - _pp.dz * lat, z = _pp.z + _pp.dx * lat;
      const y = nav.standY(x, z, 999);
      if (!spawnOK(x, y, z, fx, fz, rMin, rMax, allowView)) return null;
      const jog = c.path.kind === 'park' || c.path.kind === 'shore' ? chance(0.6) : chance(0.3);
      const p = newPed(jog ? 'jogger' : (c.path.kind === 'promenade' && chance(0.4) ? 'tourist' : 'generic'), jog ? 'jogger' : 'walker');
      if (!p) return null;
      p.mode = 'path'; p.path = c.path; p.s = s; p.dir = chance(0.5) ? 1 : -1; p.lat = lat; p.latPref = lat;
      p.pref = speedFor(p.style, p.kind);
      p.x = x; p.z = z; p.y = y; p.yaw = yawOf(_pp.dx * p.dir, _pp.dz * p.dir);
      if (!jog && chance(0.25)) spawnFollower(p);
      return p;
    }
    const R = c.R;
    // a few random points on the ring (weighted by edge length); keep the one nearest the target distance
    let k = 0, t = 0.5, be = Infinity;
    for (let i = 0; i < 6; i++) {
      let r = Math.random() * R.per, kk = 0;
      for (; kk < R.n - 1; kk++) { if ((r -= R.len[kk]) < 0) break; }
      const tt = rand(0.08, 0.92);
      nav.ringPos(R, kk, tt, 1.8, _p);
      const e = Math.abs(Math.hypot(_p.x - fx, _p.z - fz) - dStar);
      if (e < be) { be = e; k = kk; t = tt; }
    }
    const kind = pickW(kindTable(c.zone, c.park));
    const dir = chance(0.5) ? 1 : -1;
    let off = dir > 0 ? rand(1.0, 2.1) : rand(1.6, 2.8);
    if (kind === 'window') off = rand(2.85, 3.0); else if (kind === 'bus') off = rand(0.8, 1.15); else if (kind === 'chat' || kind === 'stand') off = rand(1.5, 2.9);
    nav.ringPos(R, k, t, off, _p);
    const x = _p.x, z = _p.z, y = world.heightAt(x, z) + LIFT_WALK;
    if (!spawnOK(x, y, z, fx, fz, rMin, rMax, allowView)) return null;
    const ex = R.ex[k], ez = R.ez[k], nx = R.nx[k], nz = R.nz[k];
    const style = kind === 'jogger' ? 'jogger' : styleFor(c.zone, x, z);
    switch (kind) {
      case 'walker': case 'jogger': case 'pair': {
        const p = newPed(style, kind === 'jogger' ? 'jogger' : 'walker'); if (!p) return null;
        p.offPref = off; p.pref = speedFor(style, p.kind);
        setRing(p, R, k, t, off, dir); placeAt(p, x, y, z, yawOf(ex * dir, ez * dir));
        if (kind === 'pair') spawnFollower(p);
        return p;
      }
      case 'stand': case 'window': case 'bench': {
        const p = newPed(style, 'stander'); if (!p) return null;
        const yaw = kind === 'window' ? yawOf(nx, nz) + rand(-0.3, 0.3) : chance(0.5) ? yawOf(ex * dir, ez * dir) + rand(-0.8, 0.8) : rand(-Math.PI, Math.PI);
        setStand(p, x, z, yaw, kind === 'window' ? (chance(0.5) ? 'idle' : 'phone') : (chance(0.65) ? 'phone' : 'idle'), rand(12, 45));
        placeAt(p, x, y, z, yaw); p.R = R; p.k = k; p.offPref = rand(1.2, 2.5);
        return p;
      }
      case 'chat': {
        const g = rand(1.0, 1.25) / 2, ang = rand(-0.5, 0.5);
        const ux = ex * Math.cos(ang) + nx * Math.sin(ang), uz = ez * Math.cos(ang) + nz * Math.sin(ang);
        if (colliders.pointHit(x - ux * g, y + 1, z - uz * g, 0.45) || colliders.pointHit(x + ux * g, y + 1, z + uz * g, 0.45)) return null;
        const a = newPed(style, 'chatter'); if (!a) return null;
        const b = newPed(chance(0.7) ? style : 'generic', 'chatter');
        if (!b) { despawn(a); return null; }
        const dur = rand(18, 55);
        setStand(a, x - ux * g, z - uz * g, yawOf(ux, uz), 'chat', dur); placeAt(a, a.sx, y, a.sz, a.syaw);
        setStand(b, x + ux * g, z + uz * g, yawOf(-ux, -uz), 'chat', dur + rand(-3, 3)); placeAt(b, b.sx, y, b.sz, b.syaw);
        a.partner = b; b.partner = a; a.talk = rand(1.5, 4); b.talk = -rand(1.5, 4);
        a.R = b.R = R; a.k = b.k = k;
        return a;
      }
      case 'bus': {
        // a small queue facing the street on a wide road
        const ne = world.graph.nearestEdge(x - nx * (off + 3), z - nz * (off + 3), 12);
        if (!ne || ne.edge.width < 13) return null;
        const n = 1 + ((Math.random() * 3) | 0);
        let first = null;
        for (let i = 0; i < n; i++) {
          const along = (i - (n - 1) / 2) * rand(0.9, 1.4);
          const qx = x + ex * along + nx * rand(-0.2, 0.5), qz = z + ez * along + nz * rand(-0.2, 0.5);
          if (colliders.pointHit(qx, y + 1, qz, 0.35)) continue;
          const q = newPed(style, 'bus'); if (!q) break;
          const yaw = yawOf(-nx, -nz) + rand(-0.5, 0.5);
          setStand(q, qx, qz, yaw, chance(0.45) ? 'phone' : 'idle', rand(20, 50));
          placeAt(q, qx, world.heightAt(qx, qz) + LIFT_WALK, qz, yaw); q.R = R; q.k = k; q.offPref = rand(1.2, 2.5);
          first = first || q;
        }
        return first;
      }
    }
    return null;
  }
  function spawnFollower(leader) {
    const style = leader.style === 'business' ? (chance(0.6) ? 'business' : 'generic') : leader.style === 'jogger' ? 'generic' : leader.style;
    const f = newPed(style, 'follower'); if (!f) return null;
    f.leader = leader; f.side = chance(0.5) ? 1 : -1; f.pref = leader.pref;
    leader.pref = Math.min(leader.pref, 1.35);
    f.mode = 'follow';
    const rx = -leader.hz, rz = leader.hx;
    placeAt(f, leader.x + rx * 0.75 * f.side, leader.y, leader.z + rz * 0.75 * f.side, leader.yaw);
    return f;
  }
  function spawnTourist(spot, x, z, y) {
    const p = newPed(chance(0.8) ? 'tourist' : 'generic', 'tourist'); if (!p) return null;
    p.spot = spot; spotCount.set(spot, (spotCount.get(spot) || 0) + 1);
    const yaw = touristYaw(spot, x, z);
    setStand(p, x, z, yaw, chance(0.5) ? 'photo' : chance(0.5) ? 'idle' : 'phone', rand(6, 20));
    placeAt(p, x, y, z, yaw);
    p.pref = rand(0.9, 1.25);
    return p;
  }
  function touristYaw(spot, x, z) {
    if (!spot.look) return rand(-Math.PI, Math.PI);
    const dx = spot.look[0] - x, dz = spot.look[1] - z;
    if (spot.facing === 'out') return yawOf(-dx, -dz) + rand(-0.9, 0.9);
    return yawOf(dx, dz) + rand(-0.35, 0.35);
  }
  function placeAt(p, x, y, z, yaw) {
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.hx = -Math.sin(yaw); p.hz = -Math.cos(yaw); p.gy = y; p.placed = true;
    const r = p.human.root; r.position.set(x, y, z); r.rotation.set(0, yaw, 0);
    // pooled humans remember their last pose (maybe lying on the ground): settle into the new one right away
    const st = p.mode === 'stand' ? (p.standAnim === 'sit' ? 'sit' : p.standAnim === 'phone' || p.standAnim === 'photo' ? 'phone' : 'idle') : 'walk';
    for (let i = 0; i < 5; i++) p.human.update(0.1, { state: st, speed: st === 'walk' ? p.pref : 0, turn: 0, lying: 0 });
  }

  // ------------------------------------------------------------------------------------------ population
  function population(dt, fx, fz) {
    pool.frame();
    pool.cap = P.max + 16;
    // teleport / big jump: clear far peds and refill instantly
    if (lastFocusX !== null && Math.hypot(fx - lastFocusX, fz - lastFocusZ) > 60) {
      for (const p of list.slice()) if (Math.hypot(p.x - fx, p.z - fz) > SPAWN_MAX) despawn(p);
      initialFill = true; fillT = 0; candT = -9;
    }
    lastFocusX = fx; lastFocusZ = fz;
    if (time - candT > 1.2 || Math.hypot(fx - candX, fz - candZ) > 25) refreshCandidates(fx, fz);
    const night = G.env?.night?.value ?? 0;
    const zone = nav.zoneAt(fx, fz);
    const nightK = 1 - night * (NIGHTLIFE.has(zone) ? 0.3 : 0.6);
    // walkable sidewalk around x density, with a floor from the local density (busy waterfronts have few blocks)
    const target = Math.round(P.max * clamp(Math.max(localSum / 2400, nav.densityAt(fx, fz) * 0.85), 0, 1) * nightK * P.density);
    targetF += (target - targetF) * Math.min(1, dt * (initialFill ? 10 : 0.6));
    P.stats.target = target;
    // despawn far / surplus
    let surplus = list.length - Math.round(targetF) - 3;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.leader && p.leader.alive) continue;                   // followers leave with their leader
      const d = p.dPl;
      const far = !(d <= DESPAWN) || (d > HIDE && !p.inView) || p.y < -3;
      const extra = surplus > 0 && d > 90 && !p.inView && time - p.bornT > 4 && p.mode !== 'tumble';
      if ((far || extra) && time - p.bornT > 0.5) {
        if (extra && !far) surplus--;
        for (const q of list) if (q.leader === p) despawn(q);
        despawn(p);
        i = Math.min(i, list.length);
      }
    }
    // keep the crowd concentrated where it is seen: recycle far, off-screen peds while the near ring is thin
    if (frame % 30 === 0 && !initialFill && list.length > 8) {
      let nearN = 0, far = null;
      for (const p of list) { if (p.dPl < 65) nearN++; else if (p.dPl > 85 && !p.inView && !p.leader && !p.tb && (!far || p.dPl > far.dPl)) far = p; }
      if (far && nearN < list.length * 0.65) { for (const q of list.slice()) if (q.leader === far) despawn(q); despawn(far); }
    }
    // spawn
    if (!P.enabled) return;
    if (initialFill) {
      fillT += dt;
      let guard = 0;
      // the very first fill happens behind the title / loading screen: build freely. After a teleport keep
      // each frame cheap (a few new humans per frame, spread over up to ~2.5 s)
      pool.budget = firstFill ? 40 : 3;
      const t1 = performance.now();
      while (list.length < Math.round(targetF) && guard++ < 80 && (firstFill || performance.now() - t1 < 4)) trySpawn(fx, fz, 6, SPAWN_MAX - 10, true);
      pool.budget = 1;
      if (fillT > (list.length >= Math.round(targetF) - 1 ? 1.2 : 2.5)) { initialFill = false; firstFill = false; }
    } else if (list.length < Math.round(targetF)) {
      for (let i = 0; i < 3 && list.length < Math.round(targetF); i++) trySpawn(fx, fz, SPAWN_MIN, SPAWN_MAX, false);
    }
    // lazily grow the pool a little (reuses existing body variants: cheap) while there are few free humans
    if (frame % 20 === 0 && pool.all.length < pool.cap && pool.freeCount() < 4) pool.grow?.();
  }

  // ------------------------------------------------------------------------------------------ vehicles
  const movers = [];
  const moverPool = [];
  function gatherMovers() {
    movers.length = 0;
    const pv = G.player?.vehicle;
    let i = 0;
    for (const v of G.vehicles()) {
      const b = v.body; if (!b) continue;
      const m = moverPool[i] || (moverPool[i] = {}); i++;
      b.forward(_v); const l = Math.hypot(_v.x, _v.z) || 1;
      m.v = v; m.fx = _v.x / l; m.fz = _v.z / l; m.rx = -m.fz; m.rz = m.fx;
      _v2.copy(b.boxCenter || _v2.set(0, 0, 0)).applyQuaternion(b.quat);
      m.x = b.pos.x + _v2.x; m.z = b.pos.z + _v2.z; m.y = b.pos.y;
      m.hx = b.boxHalf.x; m.hz = b.boxHalf.z; m.vx = b.vel.x; m.vz = b.vel.z; m.sp = Math.hypot(b.vel.x, b.vel.z);
      m.player = v === pv; m.reach = m.hz + 1.2;
      // an AI car still on its lane is no threat to people on the sidewalk; one that jumped the curb is
      m.offroad = m.sp > 4 && !m.player ? !!nav.blockAt(m.x, m.z) : false;
      movers.push(m);
    }
  }
  // point inside any vehicle box (with pad)? returns mover
  function carAt(x, z, pad) {
    for (const m of movers) {
      const dx = x - m.x, dz = z - m.z;
      if (dx * dx + dz * dz > (m.reach + pad) ** 2) continue;
      const lx = dx * m.rx + dz * m.rz, lz = dx * m.fx + dz * m.fz;
      if (Math.abs(lx) < m.hx + pad && Math.abs(lz) < m.hz + pad) return m;
    }
    return null;
  }
  // contact + threat checks, every frame, for every ped near a vehicle
  function vehicleContacts(dt) {
    for (const m of movers) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const dx = p.x - m.x, dz = p.z - m.z;
        const d2 = dx * dx + dz * dz;
        // threat (fast car heading at me)
        if (m.sp > 4.5 && d2 < 900 && !p.tb && p.mode !== 'dodge' && (m.player || m.offroad || p.onRoad)) threatCheck(p, m, dx, dz, dt);
        if (d2 > (m.reach + 0.5) ** 2 || Math.abs(p.y - m.y) > 2.3) continue;
        const lx = dx * m.rx + dz * m.rz, lz = dx * m.fx + dz * m.fz;
        const cx = clamp(lx, -m.hx, m.hx), cz = clamp(lz, -m.hz, m.hz);
        let ox = lx - cx, oz = lz - cz, dd = ox * ox + oz * oz;
        if (dd > R_PED * R_PED) continue;
        let nlx, nlz, pen;
        if (dd < 1e-6) {
          if (m.hx - Math.abs(lx) < m.hz - Math.abs(lz)) { nlx = Math.sign(lx) || 1; nlz = 0; pen = m.hx - Math.abs(lx) + R_PED; }
          else { nlx = 0; nlz = Math.sign(lz) || 1; pen = m.hz - Math.abs(lz) + R_PED; }
        } else { const d = Math.sqrt(dd); nlx = ox / d; nlz = oz / d; pen = R_PED - d; }
        const nx = m.rx * nlx + m.fx * nlz, nz = m.rz * nlx + m.fz * nlz;
        const vn = m.vx * nx + m.vz * nz;                              // car speed into the ped
        const hitV = Math.max(vn, m.sp * 0.55);
        if (hitV > 4 && p.hitCd <= 0) {
          if (m.player && G.flags && !G.flags.pedHits) {
            // Forza / Explore: nobody gets hurt, they leap clear of the car
            const side = (dx * m.rx + dz * m.rz) >= 0 ? 1 : -1;
            dive(p, m.rx * side, m.rz * side, m); push(p, nx * (pen + 0.35), nz * (pen + 0.35)); p.hitCd = 1;
          } else knock(p, m, hitV, nx, nz);
        }
        else {
          push(p, nx * (pen + 0.02), nz * (pen + 0.02));
          if (m.sp > 1.2 && !p.tb && p.hitCd <= 0) { stumble(p, nx, nz, m); }
        }
      }
    }
  }
  function threatCheck(p, m, dx, dz, dt) {
    const sp2 = m.vx * m.vx + m.vz * m.vz;
    const tc = (dx * m.vx + dz * m.vz) / sp2;            // time of closest approach
    if (tc < 0 || tc > 1.5) { p.threatT = Math.max(0, p.threatT - dt); return; }
    const sp = Math.sqrt(sp2);
    const lat = (dx * m.vz - dz * m.vx) / sp;            // signed perpendicular distance from the car's path
    const halfW = m.hx + 0.9;
    if (Math.abs(lat) > halfW + 0.5) { p.threatT = Math.max(0, p.threatT - dt); return; }
    p.threatT += dt;
    if (p.threatT < p.reflex * (G.flags && !G.flags.pedHits ? 0.25 : 1)) return;
    p.threatT = 0;
    // escape sideways, away from the car's path
    let side = Math.sign(lat) || (chance(0.5) ? 1 : -1);
    const px = m.vz / sp * side, pz = -m.vx / sp * side;                 // perpendicular (away)
    // prefer the side toward the sidewalk interior when almost dead centre
    if (Math.abs(lat) < 0.5 && p.mode === 'ring' && p.R) {
      const nx = p.R.nx[p.k], nz = p.R.nz[p.k];
      if (px * nx + pz * nz < 0 && chance(0.7)) side = -side;
    }
    const ux = m.vz / sp * side, uz = -m.vx / sp * side;
    if ((tc < 0.55 && sp > 9) || (tc < 0.35 && sp > 6)) dive(p, ux, uz, m);
    else dodge(p, ux, uz, m, clamp(halfW - Math.abs(lat) + 0.6, 0.8, 3.2));
  }
  function dodge(p, ux, uz, m, dist) {
    p.act = null; p.cr = null;
    detach(p);
    p.mode = 'dodge'; p.fvx = ux; p.fvz = uz; p.freeSpd = rand(4.2, 5.4); p.freeT = clamp(dist / p.freeSpd + 0.15, 0.35, 0.9);
    p.fx = m.x; p.fz = m.z; p.onRoad = !nav.blockAt(p.x, p.z);
  }
  function dive(p, ux, uz, m) {
    const s = rand(4.5, 6);
    startTumble(p, ux * s + m.vx * 0.08, rand(2.2, 3.0), uz * s + m.vz * 0.08, ux, uz, rand(-1.2, 1.2), rand(0.5, 1.2), 'dive');
    p.fx = m.x; p.fz = m.z;
    if (p.yellCd <= 0 && p.dCam < 45) { yell.say(p, pickLine('nearMiss')); p.yellCd = 4; }
  }
  function stumble(p, nx, nz, m) {
    p.hitCd = 0.5;
    if (p.fixedY != null) return;
    if (p.mode === 'ring' || p.mode === 'stand' || p.mode === 'path' || p.mode === 'follow') {
      p.act = 'wave'; p.actT = rand(1.0, 1.6); p.actYaw = yawOf(m.x - p.x, m.z - p.z);
      if (p.yellCd <= 0 && p.dCam < 40) { yell.say(p, pickLine('nearMiss')); p.yellCd = 5; }
    }
  }
  function knock(p, m, v, nx, nz) {
    p.hitCd = 2.0;
    const sp = m.sp;
    // thrown along the car's motion (plus the contact normal), up by the impact
    let ux = m.vx / (sp || 1) * 0.8 + nx * 0.6, uz = m.vz / (sp || 1) * 0.8 + nz * 0.6; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const hs = Math.min(26, v * 0.85 + 1.2), vy = Math.min(7.5, 1.4 + v * 0.2);
    startTumble(p, ux * hs, vy, uz * hs, -ux, -uz, (chance(0.5) ? 1 : -1) * rand(1.5, 2.5 + v * 0.22), clamp(1.4 + v * 0.12, 1.5, 4.5), 'hit');
    p.fx = m.x; p.fz = m.z;
    // feedback: a light thump for the car
    const b = m.v?.body;
    if (b && b.vel) b.vel.multiplyScalar(m.player ? 0.975 : 0.985);
    if (m.player) { G.rig?.addShake?.(Math.min(0.35, v / 60)); G.input?.rumble?.(0.4, 0.3, 120); }
    if (p.dCam < 70) G.audio?.impact?.(Math.min(0.7, v / 30), 'body');
    if (m.player) G.emit('pedHit', p, v, m.v); else G.emit('pedHitNpc', p, v, m.v);
    if (p.dCam < 45 && chance(0.6)) { yell.say(p, pickLine('hit'), 1.2, true); p.yellCd = 3; }
    // a follower / chat partner panics
    for (const q of list) if (q !== p && (q.leader === p || p.leader === q || q.partner === p)) scare(q, m.x, m.z, 1, true);
  }

  // ------------------------------------------------------------------------------------------ tumble
  function startTumble(p, vx, vy, vz, headX, headZ, spin, lie, why) {
    p.act = null; p.cr = null; p.onRoad = true;
    detach(p);
    p.mode = 'tumble';
    // local +Z (where the knocked pose lays the head) points along (headX, headZ)
    p.yaw = Math.atan2(headX, headZ);
    p.tb = { vx, vy, vz, spin, pitch: 0, roll: 0, pitchTo: why === 'dive' ? rand(1.0, 1.3) : rand(1.1, 1.45), rate: why === 'dive' ? 5 : 3.2 + Math.hypot(vx, vz) * 0.12,
      ground: false, bounces: 0, lie, t: 0, getup: false, gT: 0, why };
    p.lying = 0; p.spd = 0;
    p.y += 0.05;
  }
  function stepTumble(p, dt) {
    const T = p.tb;
    T.t += dt;
    if (T.getup) {
      T.gT += dt;
      T.pitch *= Math.max(0, 1 - dt * 8); T.roll *= Math.max(0, 1 - dt * 8);
      p.lying = 0; p.anim = 'getup'; p.aSpeed = 0;
      if (T.gT > (T.getupDur || 1.25)) { p.tb = null; afterTumble(p, T.why); }
      return;
    }
    if (!T.ground) {
      T.vy -= 9.8 * dt;
      p.x += T.vx * dt; p.z += T.vz * dt; p.y += T.vy * dt;
      p.yaw += T.spin * dt;
      T.pitch += (T.pitchTo - T.pitch) * Math.min(1, dt * T.rate);
      T.roll = 0.3 * Math.sin(T.t * 6.5) * Math.exp(-T.t * 1.2);
      const gy = nav.standY(p.x, p.z, p.y + 1.2);
      if (p.y <= gy) {
        p.y = gy;
        if (T.vy < -3.2 && T.bounces < 1) { T.vy = -T.vy * 0.25; T.vx *= 0.55; T.vz *= 0.55; T.bounces++; T.spin *= 0.4; }
        else { T.ground = true; T.vy = 0; }
      }
      p.lying = T.bounces ? 0.6 : 0;
    } else {
      const sp = Math.hypot(T.vx, T.vz);
      if (sp > 0.01) { const k = Math.max(0, sp - 9 * dt) / sp; T.vx *= k; T.vz *= k; }
      p.x += T.vx * dt; p.z += T.vz * dt;
      T.spin *= Math.max(0, 1 - dt * 6); p.yaw += T.spin * dt;
      p.y = nav.standY(p.x, p.z, p.y + 1.2);
      T.pitch *= Math.max(0, 1 - dt * 7); T.roll *= Math.max(0, 1 - dt * 7);
      p.lying = 1;
      if (sp < 0.4) T.lie -= dt;
      if (T.lie <= 0) { T.getup = true; T.gT = 0; }
    }
    // walls: push out, kill the velocity into the wall
    const ox = p.x, oz = p.z;
    staticPush(p);
    const px = p.x - ox, pz = p.z - oz, pl = Math.hypot(px, pz);
    if (pl > 1e-4) { const nx = px / pl, nz = pz / pl, vn = T.vx * nx + T.vz * nz; if (vn < 0) { T.vx -= nx * vn * 1.3; T.vz -= nz * vn * 1.3; } }
    p.anim = 'knocked'; p.aSpeed = 0;
    p.onRoad = true;
  }
  function afterTumble(p, why) {
    p.onRoad = false;
    const src = { x: p.fx, z: p.fz };
    if (why === 'eject') { p.fear = rand(8, 12); p.fleeSpd = rand(4.8, 6.2); reattach(p); return; }
    const r = Math.random();
    if (r < 0.5) { p.fear = rand(4, 8); p.fleeSpd = rand(4.2, 5.8); }
    else if (r < 0.8) { p.act = 'wave'; p.actT = rand(1.2, 2); p.actYaw = yawOf(src.x - p.x, src.z - p.z); if (p.dCam < 40 && p.yellCd <= 0) { yell.say(p, pickLine(why === 'hit' ? 'hit' : 'nearMiss')); p.yellCd = 5; } }
    else p.hurry = rand(3, 6);
    reattach(p);
  }

  // ------------------------------------------------------------------------------------------ fear / startle
  function scare(p, x, z, strength, flee) {
    if (p.tb || !p.alive) return;
    p.fx = x; p.fz = z;
    if (flee) {
      p.fear = Math.max(p.fear, rand(4, 7) + strength * 4); p.fleeSpd = rand(4.3, 6.2); p.act = null;
      if (p.mode === 'stand' || p.mode === 'follow') { detach(p); reattach(p); }
      else if (p.mode === 'ring') p.dir = (p.R.ex[p.k] * (p.x - x) + p.R.ez[p.k] * (p.z - z)) >= 0 ? 1 : -1;
      else if (p.mode === 'path') { pathPos(p.path, p.s, _pp); p.dir = (_pp.dx * (p.x - x) + _pp.dz * (p.z - z)) >= 0 ? 1 : -1; }
      else if (p.mode === 'cross' && p.cr && p.cr.phase !== 'go') p.cr.phase = 'go';
    } else if (!p.act && p.mode !== 'dodge') {
      p.act = 'idle'; p.actT = rand(0.5, 1.1); p.actYaw = yawOf(x - p.x, z - p.z);
    }
  }
  function panic(x, z, radius = 30, strength = 0.6) {
    if (time - lastPanicT < 0.6 && Math.hypot(x - lastPanicX, z - lastPanicZ) < 8) return 0;
    lastPanicT = time; lastPanicX = x; lastPanicZ = z;
    let n = 0;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        if (chance(0.55 + 0.45 * strength * (1 - d / radius))) { scare(p, x, z, strength, true); n++; if (p.dCam < 40 && p.yellCd <= 0 && chance(0.3)) { yell.say(p, pickLine('panic')); p.yellCd = 6; } }
        else scare(p, x, z, strength, false);
      } else if (d < radius * 1.7) scare(p, x, z, strength, false);
    }
    if (n) G.emit('pedPanic', x, z, n);
    return n;
  }
  G.on('carHit', (a, b, hit) => {
    const s = hit?.strength ?? 0; if (s < 0.18) return;
    const pt = hit.point || { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
    panic(pt.x, pt.z, 12 + 40 * s, s);
  });
  G.on('impact', (v, e) => {
    if (!e || e.kind === 'ground' || (e.strength ?? 0) < 0.35) return;
    panic(v.pos.x, v.pos.z, 10 + 30 * e.strength, e.strength);
  });
  G.on('wrecked', v => panic(v.pos.x, v.pos.z, 45, 1));
  G.on('horn', v => {
    if (!v?.body) return;
    const b = v.body; b.forward(_v); const l = Math.hypot(_v.x, _v.z) || 1; const fx = _v.x / l, fz = _v.z / l;
    for (const p of list) {
      const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > 28 || p.tb) continue;
      const along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (p.onRoad && along > -2 && along < 26 && lat < 3.5) {
        if (p.mode === 'cross') p.hurry = 4; else if (along < 10) dodge(p, (dx * fz - dz * fx) > 0 ? fz : -fz, (dx * fz - dz * fx) > 0 ? -fx : fx, { x: b.pos.x, z: b.pos.z }, 1.6);
        else p.hurry = 3;
      } else if (d < 20) {
        const r = Math.random();
        p.act = 'idle'; p.actT = rand(0.35, 0.7); p.actYaw = yawOf(-dx, -dz);
        p.fx = b.pos.x; p.fz = b.pos.z;
        if (r < 0.3) { p.nextAct = 'wave'; if (p.dCam < 35 && p.yellCd <= 0) { yell.say(p, pickLine('horn')); p.yellCd = 5; } }
        else if (r < 0.5) p.hurry = 3;
      }
    }
  });

  // ------------------------------------------------------------------------------------------ carjack
  function spawnFleeing(vehicle) {
    if (!vehicle?.body) return null;
    const spec = vehicle.spec || {}, b = vehicle.body;
    const door = spec.doorL || [-((spec.width || 1.8) / 2 + 0.7), 0, spec.seat ? spec.seat[2] : 0];
    _v.set(door[0], 0, door[2]).applyQuaternion(b.quat);
    const o = vehicle.root.position;
    let x = o.x + _v.x, z = o.z + _v.z;
    // outward from the car
    let ux = _v.x, uz = _v.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    x += ux * 0.35; z += uz * 0.35;
    const p = newPed(chance(0.3) ? 'business' : 'generic', 'victim', true);
    if (!p) return null;
    const y = nav.standY(x, z, o.y + 2);
    placeAt(p, x, y, z, yawOf(-ux, -uz));
    // pulled out and shoved to the ground, then up and running
    startTumble(p, ux * 2.6, 2.2, uz * 2.6, ux, uz, rand(-0.8, 0.8), rand(0.5, 0.9), 'eject');
    p.fx = o.x; p.fz = o.z;
    yell.say(p, pickLine('carjack'), 2.2, true); p.yellCd = 6;
    p.carjackYell = 2.5;
    G.emit('pedCarjacked', p, vehicle);
    return p;
  }

  // ------------------------------------------------------------------------------------------ queries
  function near(x, z, r, out = []) {
    out.length = 0;
    for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) out.push(p);
    return out;
  }
  /** nearest pedestrian on the roadway ahead of a car (for traffic AI braking) */
  function pedAhead(px, pz, py, fx, fz, range) {
    let best = null;
    for (const p of list) {
      if (!p.onRoad) continue;
      const dx = p.x - px, dz = p.z - pz;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > range) continue;
      if (Math.abs(dx * -fz + dz * fx) > 2.0 + along * 0.03) continue;
      if (Math.abs(p.y - py) > 3) continue;
      if (!best || along < best.along) best = { ped: p, along };
    }
    return best;
  }
  // traffic integration: AI cars brake for pedestrians crossing / lying in the road
  const ctx = G.traffic?.ctx;
  if (ctx && typeof ctx.carAhead === 'function' && !ctx.pedAware) {
    const orig = ctx.carAhead;
    ctx.carAhead = function (self, fx, fz, range) {
      let best = orig.call(this, self, fx, fz, range);
      const pa = pedAhead(self.pos.x, self.pos.z, self.pos.y, fx, fz, range);
      if (pa && (!best || pa.along + 1.5 < best.dist)) best = { v: { role: 'ped', ped: pa.ped }, dist: pa.along + 1.5, speed: 0 };
      return best;
    };
    ctx.pedAware = true;
  }

  // ------------------------------------------------------------------------------------------ steering helpers
  function push(p, dx, dz) {
    switch (p.mode) {
      case 'ring': {
        const R = p.R, L = nav.ringLen(R, p.k, p.off);
        p.off = clamp(p.off + dx * R.nx[p.k] + dz * R.nz[p.k], 0.25, 3.35);
        p.t = clamp(p.t + (dx * R.ex[p.k] + dz * R.ez[p.k]) / L, 0, 1);
        break;
      }
      case 'path': { pathPos(p.path, p.s, _pp); p.lat = clamp(p.lat + (-dx * _pp.dz + dz * _pp.dx), -2.2, 2.2); p.s += dx * _pp.dx + dz * _pp.dz; break; }
      case 'stand': p.sx += dx; p.sz += dz; p.x += dx; p.z += dz; break;
      case 'cross': if (p.cr && p.cr.phase === 'go') { p.cr.ox += dx; p.cr.oz += dz; } else { p.x += dx; p.z += dz; } break;
      default: p.x += dx; p.z += dz;
    }
  }
  const _cp = new THREE.Vector3();
  function staticPush(p) {
    const cols = colliders.query(p.x, p.z, R_PED + 0.6, _cand);
    if (!cols.length) return;
    _cp.set(p.x, p.y, p.z);
    for (const c of cols) {
      if (c.kind === 'bounds') { pushOutCircle(_cp, R_PED, c); continue; }
      if (p.y + 1.7 < c.yMin || p.y + 0.25 > c.yMax) continue;
      pushOutCircle(_cp, R_PED, c);
    }
    const dx = _cp.x - p.x, dz = _cp.z - p.z;
    if (dx !== 0 || dz !== 0) {
      if (p.mode === 'ring' || p.mode === 'path' || p.mode === 'stand' || (p.mode === 'cross' && p.cr?.phase === 'go')) push(p, dx, dz);
      else { p.x = _cp.x; p.z = _cp.z; }
    }
  }
  function blockedAt(x, z, y) {
    return !!colliders.pointHit(x, y + 1.0, z, 0.32) || !!carAt(x, z, 0.45);
  }
  // lateral avoidance for lane walkers (ring / path). (hx,hz) heading, (ax,az) = lateral axis (+ = offset up)
  function avoidLane(p, hx, hz, ax, az) {
    const rx = -hz, rz = hx;
    const sgn = rx * ax + rz * az >= 0 ? 1 : -1;       // + right == + offset ?
    let want = 0, cap = 99;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      if (q === p || q.leader === p || p.leader === q || q.tb) continue;
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx > 3.6 || dx < -3.6 || dz > 3.6 || dz < -3.6) continue;
      const along = dx * hx + dz * hz; if (along < -0.2 || along > 3.4) continue;
      const lat = dx * rx + dz * rz; if (lat > 1.0 || lat < -1.0) continue;
      const qv = (q.hx * hx + q.hz * hz) * q.spd;
      const oncoming = qv < -0.2;
      if (!oncoming && qv > p.spd - 0.1 && q.spd > 0.3) continue;   // same way and not slower
      let side;
      if (oncoming) side = lat > 0.35 ? -1 : 1;                    // keep right unless they already are there
      else side = lat > 0.05 ? -1 : lat < -0.05 ? 1 : (p.id & 1 ? 1 : -1);
      const w = (1 - Math.abs(lat)) * (1 - along / 3.6);
      want += side * w * 1.1;
      if (along < 1.2 && Math.abs(lat) < 0.62) cap = Math.min(cap, oncoming ? 0.5 : Math.max(0, qv - 0.05));
    }
    // the player on foot
    const pl = G.player;
    if (pl && pl.mode === 'foot') {
      const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
      const along = dx * hx + dz * hz, lat = dx * rx + dz * rz;
      if (along > -0.2 && along < 3.2 && Math.abs(lat) < 1.1) { want += (lat > 0 ? -1 : 1) * (1.2 - Math.abs(lat)) * 1.2; if (along < 1.0 && Math.abs(lat) < 0.6) cap = Math.min(cap, 0.3); }
    }
    _av.want = clamp(want, -1.5, 1.5) * sgn; _av.cap = cap;
    return _av;
  }
  const _av = { want: 0, cap: 99 };

  // ------------------------------------------------------------------------------------------ per-mode steps
  function slopeFactor(p) { const g = p.slope; return g > 0 ? 1 - Math.min(0.45, g * 1.15) : 1 - Math.min(0.2, -g * 0.45); }
  function desiredSpeed(p) {
    if (p.act) return 0;
    if (p.fear > 0) return p.fleeSpd;
    const base = p.hurry > 0 ? Math.max(p.pref, 2.4) : p.pref;
    return base * slopeFactor(p);
  }
  function locoAnim(p) {
    if (p.act) { p.anim = p.act === 'photo' ? 'phone' : p.act; p.aSpeed = 0; return; }
    if (p.fear > 0 && p.spd > 1.5) { p.anim = 'flee'; p.aSpeed = p.spd; return; }
    p.anim = p.spd < 0.15 ? 'idle' : p.spd < 2.3 ? 'walk' : 'run'; p.aSpeed = p.spd;
  }
  function stepRing(p, dt) {
    const R = p.R;
    const av = p.dCam < 90 ? avoidLane(p, p.hx, p.hz, R.nx[p.k], R.nz[p.k]) : null;
    let v = desiredSpeed(p);
    if (av) { v = Math.min(v, av.cap); p.offAvoid += (av.want - p.offAvoid) * Math.min(1, dt * 3); }
    else p.offAvoid *= Math.max(0, 1 - dt * 2);
    // obstacle probe (props, parked cars) every ~0.3 s
    p.probeT -= dt;
    if (p.probeT <= 0 && p.dCam < 80 && p.spd > 0.2) {
      p.probeT = 0.3;
      const L = nav.ringLen(R, p.k, p.off);
      const ta = clamp(p.t + p.dir * 1.5 / L, 0, 1);
      nav.ringPos(R, p.k, ta, p.off, _q);
      if (blockedAt(_q.x, _q.z, p.y)) {
        let found = null;
        for (const d of [0.75, -0.75, 1.5, -1.5]) {
          const o = p.off + d; if (o < OFF_MIN || o > OFF_MAX) continue;
          nav.ringPos(R, p.k, ta, o, _q);
          if (!blockedAt(_q.x, _q.z, p.y)) { found = d; break; }
        }
        if (found !== null) { p.offObs = found + (p.off - p.offPref - p.offAvoid); p.obsT = 1.4; }
        else if (p.fear <= 0) { p.dir = -p.dir; p.lastCorner = -1; }
      }
    }
    if (p.obsT > 0) { p.obsT -= dt; if (p.obsT <= 0) p.offObs = 0; }
    p.spd += (v - p.spd) * Math.min(1, dt * (v < p.spd ? 5 : 2.2));
    // advance along the ring
    let L = nav.ringLen(R, p.k, p.off);
    p.t += p.dir * p.spd * dt / L;
    let guard = 0;
    while ((p.t > 1 || p.t < 0) && guard++ < 4) {
      const over = (p.t > 1 ? p.t - 1 : -p.t) * L;
      p.k = p.dir > 0 ? (p.k + 1) % R.n : (p.k + R.n - 1) % R.n;
      L = nav.ringLen(R, p.k, p.off);
      p.t = p.dir > 0 ? Math.min(1, over / L) : Math.max(0, 1 - over / L);
    }
    const offT = clamp(p.offPref + p.offAvoid + p.offObs, OFF_MIN, OFF_MAX);
    const lv = (p.fear > 0 ? 1.6 : 0.9) * dt;
    p.off += clamp(offT - p.off, -lv, lv);
    // corner decisions
    const toV = (p.dir > 0 ? 1 - p.t : p.t) * L;
    const c = p.dir > 0 ? (p.k + 1) % R.n : p.k;
    if (toV < 3.6 && p.lastCorner !== c) {
      p.lastCorner = c;
      if (!p.leader && decideCorner(p, c)) return;
    }
    ringPoint(p, _p);
    p.x = _p.x; p.z = _p.z;
    if (_p.hx !== undefined) { const l = Math.hypot(_p.hx, _p.hz) || 1; p.hx = _p.hx / l; p.hz = _p.hz / l; }
    else { p.hx = R.ex[p.k] * p.dir; p.hz = R.ez[p.k] * p.dir; }
    // occasional stops: look at the phone, look around, wave at someone
    if (p.fear <= 0 && !p.act && p.kind !== 'jogger') {
      p.nextIdle -= dt;
      if (p.nextIdle <= 0) {
        p.nextIdle = rand(18, 60);
        const r = Math.random();
        if (r < 0.45) { p.act = 'phone'; p.actT = rand(3, 9); }
        else if (r < 0.8) { p.act = 'idle'; p.actT = rand(1.5, 4); p.actYaw = p.yaw + rand(-1.2, 1.2); }
        else { p.act = 'idle'; p.actT = rand(2, 5); p.actYaw = yawOf(R.nx[p.k], R.nz[p.k]); }   // window shopping
        tellFollowers(p);
      }
    }
    p.onRoad = false;
  }
  function tellFollowers(p) { for (const q of list) if (q.leader === p && p.act) { q.act = p.act === 'phone' ? (chance(0.5) ? 'phone' : 'idle') : 'idle'; q.actT = p.actT; q.actYaw = null; } }
  function decideCorner(p, c) {
    const R = p.R, n = R.n;
    const a = p.k, b = p.dir > 0 ? c : (c + n - 1) % n;
    const straight = nav.crossing(R, c, b), turn = nav.crossing(R, c, a);
    let opt = null;
    if (p.fear > 0) {
      const away = o => o && ((o.fx - p.fx) * o.dx + (o.fz - p.fz) * o.dz) > 0 && (p.x - p.fx) * o.dx + (p.z - p.fz) * o.dz > -2;
      if (away(straight) && chance(0.7)) opt = straight; else if (away(turn) && chance(0.5)) opt = turn;
    } else {
      const r = Math.random();
      const cross = p.kind === 'jogger' ? 0.3 : 0.55;
      if (r < cross * 0.62) opt = straight || (chance(0.5) ? turn : null);
      else if (r < cross) opt = turn || (chance(0.5) ? straight : null);
    }
    if (!opt) return false;
    startCross(p, opt);
    return true;
  }
  function startCross(p, o) {
    const px = -o.dz, pz = o.dx;                         // right of the crossing direction
    const side = 0.25 + Math.random() * 0.9;             // keep right on the zebra
    const back = Math.random() * 0.5;
    p.mode = 'cross';
    p.cr = { o, phase: 'approach', s: 0, waitT: 0, side, wx: o.wx + px * side - o.dx * back, wz: o.wz + pz * side - o.dz * back, ox: 0, oz: 0 };
    p.onRoad = false;
  }
  function canGo(p, o, cr) {
    if (p.fear > 0) return !carsThreaten(o, 0.8);
    const node = o.node;
    if (node && node.signal) {
      if (signalFor(node, o.dx, o.dz, G.time) !== 'green') return false;
      const need = o.len / Math.max(0.9, p.pref) * 0.65;
      if (signalFor(node, o.dx, o.dz, G.time + need) !== 'green') return false;
      return !carsThreaten(o, 1.6);
    }
    if (cr.waitT < 0.5 + p.reflex * 2) return false;     // look both ways
    if (cr.waitT > 16) return !carsThreaten(o, 1.4);
    return !carsThreaten(o, 4.5);
  }
  function carsThreaten(o, horizon) {
    const px = -o.dz, pz = o.dx;
    for (const m of movers) {
      const rx = m.x - o.wx, rz = m.z - o.wz;
      const a = rx * o.dx + rz * o.dz;
      if (a < -3 || a > o.len + 3) continue;
      const h = rx * px + rz * pz;
      if (Math.abs(h) < m.hz + 2.2 && m.sp > 0.3) return true;            // in or at the crosswalk and moving
      if (Math.abs(h) < 2.5) return true;                                  // parked across it
      const vh = m.vx * px + m.vz * pz;
      if (h * vh < 0 && Math.abs(h) / Math.max(0.1, Math.abs(vh)) < horizon && Math.abs(vh) > 1) return true;
    }
    return false;
  }
  function stepCross(p, dt) {
    const cr = p.cr, o = cr.o;
    if (cr.phase === 'approach') {
      const dx = cr.wx - p.x, dz = cr.wz - p.z, d = Math.hypot(dx, dz);
      const v = desiredSpeed(p);
      p.spd += (Math.min(v, d * 2.5 + 0.2) - p.spd) * Math.min(1, dt * 4);
      if (d < 0.18) { cr.phase = 'wait'; cr.waitT = 0; p.spd = 0; }
      else { const s = Math.min(d, p.spd * dt); p.x += dx / d * s; p.z += dz / d * s; p.hx = dx / d; p.hz = dz / d; }
      p.onRoad = false;
    } else if (cr.phase === 'wait') {
      p.spd = 0; cr.waitT += dt;
      p.hx = o.dx; p.hz = o.dz;
      if (canGo(p, o, cr)) {
        cr.phase = 'go'; cr.s = 0; cr.sx = p.x; cr.sz = p.z; cr.ox = 0; cr.oz = 0;
        const px = -o.dz, pz = o.dx;
        cr.ex = o.fx + px * cr.side; cr.ez = o.fz + pz * cr.side;
        cr.len = Math.hypot(cr.ex - cr.sx, cr.ez - cr.sz);
        cr.red = false;
      }
      p.onRoad = false;
    } else {
      let v = desiredSpeed(p) * (p.fear > 0 ? 1 : 1.08);
      if (!cr.red && o.node && o.node.signal && p.fear <= 0 && signalFor(o.node, o.dx, o.dz, G.time) !== 'green') cr.red = true;
      if (cr.red) v = Math.max(v, 2.4);
      if (p.hurry > 0) v = Math.max(v, 2.6);
      // stop for a car sitting right in my path (the player parked on the zebra)
      const ax = p.x + o.dx * 1.1, az = p.z + o.dz * 1.1;
      if (carAt(ax, az, 0.35)) v = 0;
      p.spd += (v - p.spd) * Math.min(1, dt * 4);
      cr.s += p.spd * dt;
      const u = Math.min(1, cr.s / Math.max(0.1, cr.len));
      cr.ox *= Math.max(0, 1 - dt * 1.5); cr.oz *= Math.max(0, 1 - dt * 1.5);
      p.x = cr.sx + (cr.ex - cr.sx) * u + cr.ox; p.z = cr.sz + (cr.ez - cr.sz) * u + cr.oz;
      p.hx = o.dx; p.hz = o.dz;
      p.onRoad = cr.s > 0.4 && cr.s < cr.len - 0.4;
      if (u >= 1) {
        // arrive: join the far block, mostly continuing straight
        const at = nav.attach(o.b2, p.x, p.z, o.dx, o.dz);
        const at2 = nav.attach(o.b2, p.x, p.z, -o.dz, o.dx);
        p.onRoad = false;
        if (at && (chance(0.6) || !at2) && Math.abs(at.align) > 0.5) setRing(p, at.R, at.k, at.t, at.off, at.align >= 0 ? 1 : -1);
        else if (at2) setRing(p, at2.R, at2.k, at2.t, at2.off, at2.t < 0.5 ? 1 : -1);
        else if (at) setRing(p, at.R, at.k, at.t, at.off, chance(0.5) ? 1 : -1);
        else reattach(p);
        if (p.mode === 'ring') p.lastCorner = -2;
      }
    }
  }
  function stepPath(p, dt) {
    const path = p.path;
    pathPos(path, p.s, _pp);
    const hx = _pp.dx * p.dir, hz = _pp.dz * p.dir;
    const av = p.dCam < 90 ? avoidLane(p, hx, hz, -_pp.dz, _pp.dx) : null;
    let v = desiredSpeed(p);
    // obstacle probe (trees, benches, parked cars) -> temporary lateral detour
    p.probeT -= dt;
    if (p.probeT <= 0 && p.dCam < 80 && p.spd > 0.2) {
      p.probeT = 0.3;
      pathPos(path, p.s + p.dir * 1.6, _q);
      const nx = -_q.dz, nz = _q.dx;
      if (blockedAt(_q.x + nx * p.lat, _q.z + nz * p.lat, p.y)) {
        for (const d of [0.8, -0.8, 1.6, -1.6]) { const l = p.lat + d; if (!blockedAt(_q.x + nx * l, _q.z + nz * l, p.y)) { p.offObs = d; p.obsT = 1.2; break; } }
      }
    }
    if (p.obsT > 0) { p.obsT -= dt; if (p.obsT <= 0) p.offObs = 0; }
    const latT = clamp(p.latPref + p.offObs, -2.4, 2.4);
    if (av) { v = Math.min(v, av.cap); p.lat += clamp(latT + av.want - p.lat, -dt * 1.2, dt * 1.2); }
    else p.lat += clamp(latT - p.lat, -dt * 1.2, dt * 1.2);
    p.spd += (v - p.spd) * Math.min(1, dt * 2.5);
    p.s += p.dir * p.spd * dt;
    if (p.s > path.len - 1.5) { p.s = path.len - 1.5; p.dir = -1; p.latPref = -p.latPref; }
    else if (p.s < 1.5) { p.s = 1.5; p.dir = 1; p.latPref = -p.latPref; }
    pathPos(path, p.s, _pp);
    p.x = _pp.x - _pp.dz * p.lat; p.z = _pp.z + _pp.dx * p.lat;
    p.hx = _pp.dx * p.dir; p.hz = _pp.dz * p.dir;
    if (p.fear <= 0 && !p.act && p.kind !== 'jogger') {
      p.nextIdle -= dt;
      if (p.nextIdle <= 0) { p.nextIdle = rand(20, 60); p.act = chance(0.5) ? 'phone' : 'idle'; p.actT = rand(2, 7); p.actYaw = chance(0.5) ? null : p.yaw + rand(-1.5, 1.5); }
    }
    p.onRoad = false;
  }
  function stepFree(p, dt) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    p.freeT -= dt;
    const v = p.act ? 0 : p.fear > 0 ? p.fleeSpd : p.freeSpd;
    if (p.act) p.freeT += dt;
    p.spd += (Math.min(v, d * 3 + 0.3) - p.spd) * Math.min(1, dt * 4);
    if (d < 0.25 || p.freeT <= 0) {
      const f = p.onArrive; p.onArrive = null;
      if (f) f(p); else reattach(p);
      return;
    }
    const s = Math.min(d, p.spd * dt);
    p.x += dx / d * s; p.z += dz / d * s; p.hx = dx / d; p.hz = dz / d;
    separate(p, dt);
    staticPush(p);
    p.onRoad = !nav.blockAt(p.x, p.z);
  }
  function stepDodge(p, dt) {
    p.freeT -= dt;
    p.spd = p.freeSpd;
    p.x += p.fvx * p.spd * dt; p.z += p.fvz * p.spd * dt;
    p.hx = p.fvx; p.hz = p.fvz;
    staticPush(p);
    p.anim = 'run'; p.aSpeed = p.spd;
    if (p.freeT <= 0) {
      p.mode = 'free';
      const r = Math.random();
      if (r < 0.5) { p.fear = rand(3, 6); p.fleeSpd = rand(4.2, 5.8); }
      else if (r < 0.85) { p.act = 'wave'; p.actT = rand(1.1, 1.8); p.actYaw = yawOf(p.fx - p.x, p.fz - p.z); if (p.dCam < 45 && p.yellCd <= 0) { yell.say(p, pickLine('nearMiss')); p.yellCd = 5; } }
      else p.hurry = rand(2, 4);
      reattach(p);
    }
    p.onRoad = !nav.blockAt(p.x, p.z);
  }
  function stepFollow(p, dt) {
    const L = p.leader;
    if (!L || !L.alive || L.tb) { p.leader = null; if (!reattach(p)) return; return; }
    const rx = -L.hz, rz = L.hx;
    let tx = L.x + rx * 0.72 * p.side - L.hx * 0.15, tz = L.z + rz * 0.72 * p.side - L.hz * 0.15;
    // on narrow lanes (crossing / band edge) fall in behind
    if (L.mode === 'ring') { const o = L.off + (rx * L.R.nx[L.k] + rz * L.R.nz[L.k]) * 0.72 * p.side; if (o < 0.5 || o > 3.2) { tx = L.x - L.hx * 0.9; tz = L.z - L.hz * 0.9; } }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const v = Math.min(L.spd * 1.05 + d * 1.6, p.fear > 0 ? 6.5 : 3.2);
    p.spd += (v - p.spd) * Math.min(1, dt * 4);
    if (d > 0.04) { const s = Math.min(d, p.spd * dt); p.x += dx / d * s; p.z += dz / d * s; }
    if (L.spd > 0.3 || d > 0.4) { if (d > 0.4) { p.hx = dx / d; p.hz = dz / d; } else { p.hx = L.hx; p.hz = L.hz; } }
    else { p.hx = -Math.sin(L.yaw + p.side * 0.25); p.hz = -Math.cos(L.yaw + p.side * 0.25); }
    if (L.mode === 'cross' && L.cr?.phase === 'wait') { p.hx = L.hx; p.hz = L.hz; }
    p.fear = Math.max(p.fear, L.fear * 0.9);
    staticPush(p);
    p.onRoad = L.onRoad;
    if (d > 12) { p.x = tx; p.z = tz; }
    if (p.spd < 0.15 && !p.act && L.act) { p.act = L.act === 'wave' ? 'idle' : L.act; p.actT = 0.5; }
  }
  function stepStand(p, dt) {
    p.spd = 0; p.onRoad = false;
    p.x += (p.sx - p.x) * Math.min(1, dt * 3); p.z += (p.sz - p.z) * Math.min(1, dt * 3);
    p.standT -= dt;
    let yaw = p.syaw;
    if (p.partner && p.partner.alive) yaw = yawOf(p.partner.x - p.x, p.partner.z - p.z);
    p.hx = -Math.sin(yaw); p.hz = -Math.cos(yaw);
    const sitting = p.standAnim === 'sit';
    if (!sitting) separate(p, dt);
    else if (p.seat && p.seat.c.broken) p.standT = 0;          // bench smashed: up and away
    if (p.standT <= 0) {
      if (p.seat) detach(p);
      if (p.spot) {
        // tourist: stroll to another vantage point
        const pts = nav.spotPoints(p.spot);
        const [x, z] = pts[(Math.random() * pts.length) | 0];
        const spot = p.spot;
        setFree(p, x, z, p.pref, q => { const yaw2 = touristYaw(spot, q.x, q.z); setStand(q, q.x, q.z, yaw2, chance(0.5) ? 'photo' : chance(0.5) ? 'idle' : 'phone', rand(6, 22)); });
        p.freeT = 25;
        return;
      }
      if (p.partner) { const q = p.partner; p.partner = null; q.partner = null; q.standT = Math.min(q.standT, rand(0, 1.5)); }
      p.kind = 'walker'; p.pref = speedFor(p.style, 'walker');
      reattach(p, 0);
      return;
    }
    p.anim = p.standAnim === 'chat' || p.standAnim === 'bus' ? 'idle' : p.standAnim === 'photo' ? 'phone' : p.standAnim;
    if (sitting) { p.yaw = yaw; p.x = p.sx; p.z = p.sz; }
    p.aSpeed = 0;
    const ty = p.act && p.actYaw != null ? p.actYaw : yaw;
    p.yaw = wrapA(p.yaw + clamp(wrapA(ty - p.yaw), -4 * dt, 4 * dt));
  }
  // hard separation for free-moving / standing peds (ring & path peds use lane avoidance)
  function separate(p, dt) {
    for (const q of list) {
      if (q === p || q.tb) continue;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx > 0.7 || dx < -0.7 || dz > 0.7 || dz < -0.7) continue;
      const d = Math.hypot(dx, dz);
      if (d < 0.62 && d > 1e-4) { const k = (0.62 - d) * 0.5 / d; push(p, dx * k, dz * k); }
    }
  }
  function ringSeparation() {
    // cheap global pass: overlapping lane walkers nudge apart (both ways)
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i]; if (a.tb || a.dCam > 90) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j]; if (b.tb) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx > 0.6 || dx < -0.6 || dz > 0.6 || dz < -0.6) continue;
        const d = Math.hypot(dx, dz);
        if (d >= 0.58 || d < 1e-4) continue;
        const fa = a.fixedY != null, fb = b.fixedY != null;          // seated people stay put
        if (fa && fb) continue;
        const k = (0.58 - d) / d * (fa || fb ? 1 : 0.5);
        if (!fa) push(a, dx * k, dz * k);
        if (!fb) push(b, -dx * k, -dz * k);
      }
    }
  }
  function playerShove() {
    const pl = G.player; if (!pl || pl.mode !== 'foot') return;
    const vx = pl.vel?.x || 0, vz = pl.vel?.z || 0, sp = Math.hypot(vx, vz);
    for (const p of list) {
      if (p.tb) continue;
      const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
      if (dx > 0.7 || dx < -0.7 || dz > 0.7 || dz < -0.7 || Math.abs(p.y - pl.pos.y) > 1.5) continue;
      const d = Math.hypot(dx, dz); if (d >= 0.64 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      if (sp > 5.6 && (vx * nx + vz * nz) > 3.5 && p.hitCd <= 0) {
        p.hitCd = 1.5;
        startTumble(p, nx * 3 + vx * 0.3, 1.6, nz * 3 + vz * 0.3, nx, nz, rand(-1, 1), rand(0.6, 1.2), 'shove');
        p.fx = pl.pos.x; p.fz = pl.pos.z;
        if (p.yellCd <= 0) { yell.say(p, pickLine('shove'), 1.5, true); p.yellCd = 4; }
        G.emit('pedShoved', p, sp);
      } else {
        push(p, nx * (0.64 - d), nz * (0.64 - d));
        if (sp > 2 && p.hitCd <= 0 && !p.act && p.mode !== 'cross') {
          p.hitCd = 2; p.act = 'idle'; p.actT = 0.6; p.actYaw = yawOf(-nx, -nz); p.nextAct = chance(0.4) ? 'wave' : null;
          if (p.yellCd <= 0 && chance(0.5)) { yell.say(p, pickLine('shove')); p.yellCd = 5; }
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ one ped step
  function step(p, dt) {
    if (p.hitCd > 0) p.hitCd -= dt;
    if (p.yellCd > 0) p.yellCd -= dt;
    if (p.fear > 0) { p.fear -= dt; if (p.fear <= 0) { p.hurry = rand(2, 4); } }
    if (p.hurry > 0) p.hurry -= dt;
    if (p.act) {
      p.actT -= dt;
      if (p.actT <= 0) { p.act = p.nextAct || null; p.nextAct = null; if (p.act) { p.actT = rand(1.1, 1.7); if (p.act === 'wave') p.actYaw = yawOf(p.fx - p.x, p.fz - p.z); } else p.actYaw = null; }
    }
    // friendly SF: now and then someone passing close to the player on foot waves hello
    const pl = G.player;
    if (pl && pl.mode === 'foot' && p.dPl < 4.5 && !p.act && !p.tb && p.fear <= 0 && p.fixedY == null && p.mode !== 'cross' && p.mode !== 'dodge' && chance(dt * 0.04)) {
      const a = wrapA(yawOf(pl.pos.x - p.x, pl.pos.z - p.z) - p.yaw);
      if (Math.abs(a) < 1.2) {
        p.act = 'wave'; p.actT = rand(1.2, 1.8); p.actYaw = yawOf(pl.pos.x - p.x, pl.pos.z - p.z);
        if (p.yellCd <= 0 && chance(0.35)) { yell.say(p, pickLine('hello'), 1.4); p.yellCd = 8; }
      }
    }
    if (p.tb) { stepTumble(p, dt); }
    else {
      switch (p.mode) {
        case 'ring': stepRing(p, dt); break;
        case 'cross': stepCross(p, dt); break;
        case 'path': stepPath(p, dt); break;
        case 'free': stepFree(p, dt); break;
        case 'dodge': stepDodge(p, dt); break;
        case 'follow': stepFollow(p, dt); break;
        case 'stand': stepStand(p, dt); break;
      }
      if (p.mode !== 'stand' && p.mode !== 'dodge') locoAnim(p);
      else if (p.mode === 'stand' && p.act && p.fixedY == null) locoAnim(p);
      if (p.mode === 'cross' && p.cr && p.cr.phase === 'wait' && !p.act) { p.anim = p.waitPhone ? 'phone' : 'idle'; p.aSpeed = 0; }
      if (p.carjackYell > 0) { p.carjackYell -= dt; }
      // near the camera: keep out of props / walls
      if ((p.mode === 'ring' || p.mode === 'path' || (p.mode === 'stand' && !p.fixedY)) && p.dCam < 70) staticPush(p);
    }
    // facing
    let tyaw = p.yaw;
    if (p.tb) tyaw = p.yaw;
    else if (p.act && p.actYaw != null) tyaw = p.actYaw;
    else if (p.mode === 'stand') tyaw = p.yaw;
    else if (p.mode === 'cross' && p.cr?.phase === 'wait') tyaw = yawOf(p.cr.o.dx, p.cr.o.dz);
    else if (p.spd > 0.05 || p.mode === 'dodge') tyaw = yawOf(p.hx, p.hz);
    if (!p.tb && p.mode !== 'stand') {
      const rate = p.mode === 'dodge' ? 14 : p.fear > 0 ? 9 : 6;
      const dy = clamp(wrapA(tyaw - p.yaw), -rate * dt, rate * dt);
      p.yaw = wrapA(p.yaw + dy);
      p.turn = clamp(dy / Math.max(dt, 1e-3), -2.5, 2.5);
    } else p.turn = 0;
    // ground + slope
    let gy;
    if (p.tb) gy = p.y;
    else if (p.fixedY != null && p.mode === 'stand') gy = p.fixedY;
    else if (p.mode === 'ring' || (p.mode === 'stand' && p.R)) gy = world.heightAt(p.x, p.z) + LIFT_WALK;
    else if (p.mode === 'cross' && p.cr?.phase === 'go') gy = world.heightAt(p.x, p.z) + (p.onRoad ? LIFT_ROAD : LIFT_WALK);
    else gy = nav.standY(p.x, p.z, p.y + 1.2);
    if (!p.tb) {
      const k = Math.min(1, dt * 14);
      p.y += (gy - p.y) * (Math.abs(gy - p.y) > 1.2 ? 1 : k);
      if (p.dCam < 60) {
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const h1 = world.heightAt(p.x + fx * 0.55, p.z + fz * 0.55), h0 = world.heightAt(p.x - fx * 0.55, p.z - fz * 0.55);
        const l1 = world.heightAt(p.x - fz * 0.35, p.z + fx * 0.35), l0 = world.heightAt(p.x + fz * 0.35, p.z - fx * 0.35);
        p.slope += ((h1 - h0) / 1.1 - p.slope) * Math.min(1, dt * 5);
        p.slopeL += ((l1 - l0) / 0.7 - p.slopeL) * Math.min(1, dt * 5);
      } else { p.slope *= 0.9; p.slopeL *= 0.9; }
    }
  }

  // ------------------------------------------------------------------------------------------ animation + pose
  const _ha = { state: 'idle', speed: 0, turn: 0, lying: 0 };
  const _hv = { x: 0, y: 0, z: 0 }, _hg = { x: 0, y: 0, z: 0, gx: 0, gz: 0 };
  function animate(p, dt) {
    const h = p.human, r = h.root;
    _ha.state = p.anim; _ha.speed = p.aSpeed; _ha.turn = p.turn; _ha.lying = p.lying;
    if (h.isReal) { realAnimate(p, h, r, dt); return; }
    h.update(dt, _ha);
    r.position.set(p.x, p.y, p.z);
    if (p.tb) r.rotation.set(p.tb.pitch, p.yaw, p.tb.roll);
    else {
      const a = Math.atan(p.slope), al = Math.atan(p.slopeL);
      r.rotation.set(0.42 * a, p.yaw, -0.35 * al);
      const bones = h.bones;
      if (bones) {
        // lean into the hill (uphill forward, downhill slightly back), relative to the tilted root
        const lean = 0.42 * a + (a > 0 ? 0.42 * a : 0.22 * a);
        if (lean) bones[BN.spine].rotation.x -= lean;
        if (al) bones[BN.spine].rotation.z += 0.3 * al;
        postPose(p, bones);
      }
    }
  }
  // realistic humans (peds/realhuman.js): gestures + additive head turn / spine lean are inputs of update()
  function realAnimate(p, h, r, dt) {
    const stand = p.mode === 'stand' && !p.act;
    let g = null;
    if (stand && p.standAnim === 'chat') {
      p.talk -= p.every / 60;
      if (p.talk < -rand(2, 5)) p.talk = rand(1.5, 4.5);
      if (p.partner && p.talk > 0 && p.partner.talk > 0) p.partner.talk = -0.1;
      g = p.talk > 0 ? 'talk' : 'listen';
    } else if ((stand && p.standAnim === 'photo') || p.act === 'photo') g = 'photo';
    else if (stand && p.standAnim === 'bus') g = 'look';
    _ha.gesture = g;
    // glance at the player on foot passing close by; fleeing carjack victims look back
    const pl = G.player;
    let w = 0, ly = 0;
    if (pl && pl.mode === 'foot' && p.dPl < 5.5 && !p.tb && p.fear <= 0) {
      const a = wrapA(yawOf(pl.pos.x - p.x, pl.pos.z - p.z) - p.yaw);
      if (Math.abs(a) < 1.9) { w = 1; ly = clamp(a, -1.1, 1.1); }
    }
    if (p.fear > 0 && p.carjackYell > 0) { w = 1; ly = 0.9; }
    p.lookW += (w - p.lookW) * Math.min(1, (p.every / 60) * 4);
    p.lookYaw += (ly - p.lookYaw) * Math.min(1, (p.every / 60) * 6);
    _ha.lookYaw = p.lookYaw; _ha.lookW = p.lookW;
    const a = p.tb ? 0 : Math.atan(p.slope), al = p.tb ? 0 : Math.atan(p.slopeL);
    _ha.lean = p.tb ? 0 : 0.42 * a + (a > 0 ? 0.42 * a : 0.22 * a); _ha.leanSide = 0.3 * al;
    if (p.umb === undefined) p.umb = p.style !== 'jogger' && Math.random() < 0.65;
    _ha.umbrella = p.umb && (G.weather?.rain || 0) > 0.12 && !p.tb && p.fear <= 0;
    // knocked down: the human runs a ragdoll (world space) that follows the tumble; then a mocap get-up placed on
    // the body (it hands back where it will stand: getupRoot). The root stays upright for it (set before update).
    _ha.vel = null; _ha.ground = null; _ha.rate = 1;
    if (p.tb) {
      const T = p.tb;
      if (!T.ragStarted) { T.ragStarted = true; _hv.x = T.vx; _hv.y = T.vy; _hv.z = T.vz; _ha.vel = _hv; _ha.spin = T.spin; }
      const gy = nav.standY(p.x, p.z, p.y + 1.2);
      _hg.x = p.x; _hg.z = p.z; _hg.y = gy;
      _hg.gx = (world.heightAt(p.x + 1, p.z) - world.heightAt(p.x - 1, p.z)) / 2; _hg.gz = (world.heightAt(p.x, p.z + 1) - world.heightAt(p.x, p.z - 1)) / 2;
      _ha.ground = _hg; _ha.rate = T.why === 'eject' ? 1.6 : 1.35;
    }
    r.position.set(p.x, p.y, p.z);
    r.rotation.set(p.tb ? 0 : 0.42 * a, p.yaw, p.tb ? 0 : -0.35 * al);
    h.update(dt, _ha);
    if (h.getupRoot) {          // adopt the get-up placement (the body got up where the ragdoll came to rest)
      const g = h.getupRoot; h.getupRoot = null;
      p.x = g.x; p.z = g.z; p.y = g.y; p.yaw = g.yaw;
      if (p.tb) { p.tb.vx = 0; p.tb.vz = 0; p.tb.getupDur = h.getupDur; }
      r.position.set(p.x, p.y, p.z); r.rotation.set(0, p.yaw, 0); r.updateMatrixWorld(); h._applyAnchor?.();
    }
  }
  function postPose(p, bones) {
    const t = time + p.id * 1.7;
    // chatting: the talker gestures, the listener nods; they swap now and then
    if (p.mode === 'stand' && p.standAnim === 'chat' && !p.act) {
      p.talk -= p.every / 60 * 1;
      if (p.talk > 0) {
        const g = Math.sin(t * 2.6) * 0.5 + 0.5, g2 = Math.sin(t * 1.3 + 1);
        bones[BN.uaR].rotation.x += 0.35 + 0.15 * g2; bones[BN.laR].rotation.x += 0.9 + 0.35 * g; bones[BN.hR].rotation.z += 0.3 * g;
        if (g2 > 0.3) { bones[BN.uaL].rotation.x += 0.25 * g2; bones[BN.laL].rotation.x += 0.6 * g2; }
        bones[BN.head].rotation.y += 0.08 * Math.sin(t * 0.9);
      } else {
        bones[BN.head].rotation.x += 0.07 * Math.max(0, Math.sin(t * 3.2)) * (Math.sin(t * 0.7) > 0 ? 1 : 0);
        bones[BN.uaL].rotation.x += 0.1; bones[BN.laL].rotation.x += 0.25;
      }
      if (p.talk < -rand(2, 5)) p.talk = rand(1.5, 4.5);
      if (p.partner && p.talk > 0 && p.partner.talk > 0) p.partner.talk = -0.1;
    }
    // tourists taking a photo: phone held up at eye level with both hands
    if ((p.mode === 'stand' && p.standAnim === 'photo' && !p.act) || p.act === 'photo') {
      bones[BN.uaR].rotation.set(1.25, 0.05, -0.28); bones[BN.laR].rotation.set(0.75, 0, 0); bones[BN.hR].rotation.set(0.55, -1.3, 0);
      bones[BN.uaL].rotation.set(1.2, -0.05, 0.3); bones[BN.laL].rotation.set(0.8, 0, 0); bones[BN.hL].rotation.set(0.5, 1.2, 0);
      bones[BN.neck].rotation.x = 0.02; bones[BN.head].rotation.x = 0.06;
    }
    // bus stop: glance down the street for the bus
    if (p.mode === 'stand' && p.standAnim === 'bus' && !p.act) bones[BN.head].rotation.y += 0.7 * Math.sin(t * 0.21) * Math.max(0, Math.sin(t * 0.13));
    // fleeing carjack victim: look back over the shoulder at the car
    if (p.fear > 0 && p.carjackYell > 0) bones[BN.head].rotation.y += 0.9;
    // glance at the player on foot passing close by
    const pl = G.player;
    let w = 0, ly = 0;
    if (pl && pl.mode === 'foot' && p.dPl < 5.5 && !p.tb && p.fear <= 0) {
      const a = wrapA(yawOf(pl.pos.x - p.x, pl.pos.z - p.z) - p.yaw);
      if (Math.abs(a) < 1.9) { w = 1; ly = clamp(a, -1.1, 1.1); }
    }
    p.lookW += (w - p.lookW) * Math.min(1, (p.every / 60) * 4);
    p.lookYaw += (ly - p.lookYaw) * Math.min(1, (p.every / 60) * 6);
    if (p.lookW > 0.01) { bones[BN.neck].rotation.y += 0.4 * p.lookYaw * p.lookW; bones[BN.head].rotation.y += 0.6 * p.lookYaw * p.lookW; }
  }

  // ------------------------------------------------------------------------------------------ frame
  function update(dt) {
    if (!dt || G.paused) return;
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    time += dt; frame++;
    yell.time = time;
    const pl = G.player;
    const fx = pl?.pos?.x ?? camera.position.x, fz = pl?.pos?.z ?? camera.position.z;
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    // distances + LOD
    for (const p of list) {
      p.dCam = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      p.dPl = Math.hypot(p.x - fx, p.z - fz);
      _sph.center.set(p.x, p.y + 0.9, p.z); _sph.radius = 1.3;
      p.inView = p.dCam < HIDE && _frustum.intersectsSphere(_sph);
    }
    const prof = P.profile ? (P.prof ||= { pop: 0, veh: 0, step: 0, anim: 0, sep: 0, maxPop: 0, maxStep: 0, maxAnim: 0 }) : null;
    let tp = prof ? performance.now() : 0;
    population(dt, fx, fz);
    if (prof) { const d = performance.now() - tp; prof.pop += d; prof.maxPop = Math.max(prof.maxPop, d); tp = performance.now(); }
    gatherMovers();
    vehicleContacts(dt);
    playerShove();
    if (prof) { prof.veh += performance.now() - tp; }
    setPedViewer(camera.position);
    let tStep = 0, tAnim = 0;
    let updated = 0, visible = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const urgent = p.tb || p.mode === 'dodge' || (p.fear > 0 && p.dCam < 60) || (p.onRoad && p.dCam < 80);
      const d = p.dCam;
      p.every = urgent || d < 26 ? 1 : d < 60 ? (p.inView ? 2 : 3) : d < HIDE ? (p.inView ? 3 : 6) : 8;
      p.acc += dt;
      const vis = d < HIDE;
      if (p.human.root.visible !== vis) p.human.root.visible = vis;
      if (vis) visible++;
      if (++p.ctr < p.every) continue;
      p.ctr = 0;
      const sdt = Math.min(p.acc, 0.2); p.acc = 0;
      let ts = prof ? performance.now() : 0;
      step(p, sdt);
      if (prof) { const n = performance.now(); tStep += n - ts; if (n - ts > 1) prof.slow = [n - ts, p.mode, p.kind, p.cr?.phase, p.tb ? 'tb' : '', p.act]; ts = n; }
      if (!p.alive) { i--; continue; }
      if (vis) {
        animate(p, sdt);
        if (prof) tAnim += performance.now() - ts;
        const cs = shadowsOn && d < 42;
        if (p.human.mesh && p.human.mesh.castShadow !== cs) p.human.mesh.castShadow = cs;
      } else p.human.root.position.set(p.x, p.y, p.z);
      updated++;
    }
    if (prof) { prof.step += tStep; prof.anim += tAnim; prof.maxStep = Math.max(prof.maxStep, tStep); prof.maxAnim = Math.max(prof.maxAnim, tAnim); }
    if (frame % 2 === 0) ringSeparation();
    yell.update(dt, camera);
    const ms = performance.now() - t0;
    const S = P.stats;
    S.ms += (ms - S.ms) * 0.05; S.last = ms; S.active = list.length; S.visible = visible; S.updated = updated; S.pool = pool.all.length;
  }
  return P;
}
