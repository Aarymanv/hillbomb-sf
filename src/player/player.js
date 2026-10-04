// The player: on foot (GTA-style) or driving. Enter/exit/carjack, reset, horn, camera modes.
import * as THREE from 'three';

const humanMods = import.meta.glob('./human.js', { eager: true });
const HM = humanMods['./human.js'] || null;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
export function makeHuman(opts) {
  if (HM) { try { return HM.createHuman(opts); } catch (e) { console.warn('[human] fallback', e); } }
  // fallback capsule person
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: opts.shirt ?? 0x3355aa, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), mat);
  body.position.y = 0.85; body.castShadow = true; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8a080 }));
  head.position.y = 1.62; root.add(head);
  return { root, mesh: body, height: 1.78, update() {}, setVisible(b) { root.visible = b; }, dispose() {} };
}
export const HUMAN_SEAT_HIP_Y = HM?.HUMAN_SEAT_HIP_Y ?? 0.5;

export function createPlayer({ scene, world, input, rig, sim, audio, game }) {
  const human = makeHuman({ seed: 7, skin: 0x8d5a3b, shirt: 0x1f2a44, pants: 0x2b2b30, shoes: 0xeeeeee, hair: 0x1a1410, hairStyle: 'short', outfit: 'hoodie', build: 'average', height: 1.8 });
  scene.add(human.root);
  const P = {
    human, mode: 'foot', vehicle: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, grounded: true,
    health: 100, sprinting: false, state: 'idle', anim: 0, knocked: 0, stamina: 1,
    enterT: 0, enterFrom: new THREE.Vector3(), enterCar: null, exitT: 0,
    lastSafe: { x: 0, y: 0, z: 0, yaw: 0, t: 0 },
    hornOn: false, flipT: 0,
  };
  const R = 0.35;

  function setVehicle(v) {
    P.vehicle = v; P.mode = 'car'; v.driver = 'player'; v.role = 'player'; v.body.isPlayer = true;
    human.setVisible(false);
    rig.rig.mode = rig.rig.mode === 'foot' ? 'chase' : rig.rig.mode;
    if (rig.rig.mode === 'foot') rig.rig.mode = 'chase';
    rig.snap(); rig.rig.orbitYaw = 0; rig.rig.orbitPitch = 0;
    sim.add(v);
    game.onEnterVehicle?.(v);
  }
  function exitVehicle(force = false) {
    const v = P.vehicle; if (!v) return;
    const b = v.body;
    if (!force && b.speed > 7) return false;
    // door position on the left (driver) side, else right
    const spec = v.spec;
    let placed = false;
    for (const side of [-1, 1]) {
      _v.set(side * (spec.width / 2 + 0.7), 0, spec.seat ? spec.seat[2] : 0).applyQuaternion(b.quat);
      const o = v.root.position;
      const x = o.x + _v.x, z = o.z + _v.z;
      if (!world.colliders.pointHit(x, o.y + 1, z, R)) { P.pos.set(x, world.groundAt(x, z, o.y + 2), z); placed = true; P.exitSide = side; break; }
    }
    if (!placed) { P.pos.copy(v.root.position); P.pos.y += spec.height + 0.3; }
    P.yaw = b.yaw();
    // climb-out animation (not for forced exits: teleports, wrecks)
    P.exitT = !force && placed && human.carTime ? human.carTime('exit') : 0;
    P.exitDur = P.exitT;   // door timing (cars pass 4)
    P.exitCar = v; P.exitCarYaw = b.yaw();
    v.driver = null; v.role = 'npc'; v.body.isPlayer = false;
    v.input.throttle = 0; v.input.brake = 0; v.input.steer = 0; v.input.handbrake = 1;
    P.vehicle = null; P.mode = 'foot';
    human.setVisible(true);
    human.root.position.copy(P.pos);
    P.vel.set(0, 0, 0);
    rig.rig.mode = 'foot'; rig.rig.orbitYaw = P.yaw; rig.rig.orbitPitch = 0; rig.snap();
    game.onExitVehicle?.(v);
    if (P.hornOn) { audio?.horn(false); P.hornOn = false; }
    return true;
  }
  function tryEnter() {
    // nearest car within 4 m of its driver door
    let best = null, bd = 16;
    for (const v of game.vehicles()) {
      if ((v.wrecked && v.health <= 0) || v.role === 'cablecar') continue;
      const b = v.body, spec = v.spec;
      _v.set(-(spec.width / 2 + 0.5), 0, spec.seat ? spec.seat[2] : 0).applyQuaternion(b.quat).add(v.root.position);
      const d = (_v.x - P.pos.x) ** 2 + (_v.z - P.pos.z) ** 2;
      const dc = (v.root.position.x - P.pos.x) ** 2 + (v.root.position.z - P.pos.z) ** 2;
      const dd = Math.min(d, dc * 0.7);
      if (dd < bd && Math.abs(v.root.position.y - P.pos.y) < 2.5) { bd = dd; best = v; }
    }
    if (!best) return;
    if (best.body.speed > 6) return;
    if (best.driver && best.driver !== 'player' && game.flags && !game.flags.carjack) {
      game.hud?.toast('Not in this mode', 'Carjacking is off in ' + (game.mode === 'explore' ? 'Free Roam' : 'Festival') + ' mode. Switch to Outlaw mode in the pause menu.', '', 2600);
      return;
    }
    P.enterT = human.carTime ? human.carTime('enter') : 0.55; P.enterCar = best; P.enterFrom.copy(P.pos);
    P.enterDur = P.enterT; P.enterJack = !!(best.driver && best.driver !== 'player');   // door timing (cars pass 4)
    if (best.driver && best.driver !== 'player') game.onCarjack?.(best);
    best.input.throttle = 0; best.input.brake = 1; best.input.autoReverse = false; best.input.reverse = false;
  }

  function update(dt) {
    if (P.enterT > 0) {
      P.enterT -= dt;
      const v = P.enterCar, spec = v.spec;
      // (hinged door: stand a little behind the seat, near the door's rear edge, so the door swings open in front)
      _v.set(-(spec.width / 2 + 0.3), 0, (spec.seat ? spec.seat[2] : 0) + (v.visual.hasDoor?.(-1) ? 0.3 : 0)).applyQuaternion(v.body.quat).add(v.root.position);
      P.pos.lerp(_v, Math.min(1, dt * 10));
      human.root.position.copy(P.pos);
      // mocap: turn and sit down onto the driver seat (realhuman.js glides the body from the door to the seat)
      human.update(dt, { state: 'enterCar', speed: 0, turn: 0, side: -1, seat: seatWorld(v, _v2), carYaw: v.body.yaw() });
      v.openDoor?.(-1, doorCurve(1 - P.enterT / Math.max(1e-3, P.enterDur), P.enterJack ? 'jack' : 'enter'));
      if (P.enterT <= 0) { v.openDoor?.(-1, 0); setVehicle(v); P.enterCar = null; }
      return;
    }
    if (P.exitT > 0) {   // climbing out: stand up from the seat and step away from the door (move input cuts it short)
      P.exitT -= dt;
      const v = P.exitCar, ax = input.axes;
      human.root.position.copy(P.pos); human.root.rotation.y = P.yaw;
      human.update(dt, { state: 'exitCar', speed: 0, turn: 0, side: P.exitSide, seat: seatWorld(v, _v2), carYaw: P.exitCarYaw });
      v.openDoor?.(P.exitSide, doorCurve(1 - P.exitT / Math.max(1e-3, P.exitDur || 1), 'exit'));
      if (P.exitT > 0 && !(Math.hypot(ax.moveX || 0, ax.moveY || 0) > 0.3 && P.exitT < 0.55)) return;
      P.exitT = 0; P.exitCar = null; v.releaseDoor?.(P.exitSide, human.root);
      if (human.exitYaw != null) { P.yaw = human.exitYaw; human.root.rotation.y = P.yaw; }
    }
    if (P.mode === 'car') updateCar(dt); else updateFoot(dt);
  }

  // player handling settings (Settings > Driving): read into one reused object the physics step understands (input.hs)
  const HS = { mode: 'standard', abs: true, tcs: true, stm: true, counter: true, sens: 1, kb: 1 };
  function handlingSettings() {
    const s = game?.economy?.settings, a = s?.assists, h = s?.handling;
    if (a) { HS.mode = a.steering || 'standard'; HS.abs = a.abs !== false; HS.tcs = a.tcs !== false; HS.stm = a.stm !== false; }
    if (h) { HS.counter = h.counter !== false; HS.sens = h.sens ?? 1; HS.kb = h.kbSpeed ?? 1; input.padCurve = h.padCurve ?? 1.4; }
    return HS;
  }
  // before every 120 Hz physics step: fresh gamepad axes (keyboard state is event-latched per frame)
  P.preStep = function () {
    const v = P.vehicle;
    if (P.mode !== 'car' || !v || window.__autopilot || !input.pollDrive()) return;
    const ax = input.axes, inp = v.input;
    inp.throttle = v.health <= 0 ? 0 : ax.throttle; inp.brake = ax.brake; inp.steer = ax.steer;
    inp.digital = ax.digitalSteer !== false; inp.digitalPedals = ax.digitalPedals !== false;
  };
  function updateCar(dt) {
    const v = P.vehicle, b = v.body, ax = input.axes;
    const inp = v.input;
    inp.throttle = ax.throttle; inp.brake = ax.brake; inp.steer = ax.steer;
    inp.handbrake = input.held('handbrake') ? 1 : 0;
    inp.digital = ax.digitalSteer !== false; inp.digitalPedals = ax.digitalPedals !== false;
    inp.hs = window.__autopilot ? null : handlingSettings();   // the dev / tour autopilot steers like the race AI
    inp.autoReverse = true; inp.reverse = false;
    inp.pitch = input.key('ArrowUp') && input.key('ShiftLeft') ? -1 : input.key('ArrowDown') && input.key('ShiftLeft') ? 1 : -ax.lookY * 0;
    if (v.health <= 0) { inp.throttle = 0; }
    if (input.pressed('camera')) rig.rig.mode = rig.rig.mode === 'chase' ? 'far' : rig.rig.mode === 'far' ? 'hood' : rig.rig.mode === 'hood' ? 'cockpit' : 'chase';
    rig.rig.lookBack = input.held('lookBack');
    // horn
    const horn = input.held('horn');
    if (horn !== P.hornOn) { P.hornOn = horn; audio?.horn(horn, v.def.model === 'bus' ? 'bus' : v.def.mass > 2200 ? 'truck' : 'car'); if (horn) game.onHorn?.(v); }
    // reset / flip
    const up = b.up(_v);
    if (up.y < 0.3 && b.speed < 3) P.flipT += dt; else P.flipT = 0;
    if (input.pressed('reset') || P.flipT > 2.5) resetCar(v);
    // remember a safe spot for respawns (on a road, upright, slow-ish)
    P.lastSafe.t -= dt;
    if (P.lastSafe.t <= 0 && b.grounded >= 3 && up.y > 0.9 && b.pos.y > 1) {
      const n = world.graph.nearestEdge(b.pos.x, b.pos.z, 8);
      if (n) { const o = v.root.position; Object.assign(P.lastSafe, { x: o.x, y: o.y, z: o.z, yaw: b.yaw(), t: 1.5 }); }
    }
    if (input.pressed('enter')) exitVehicle();
    P.pos.copy(v.root.position);
  }
  function resetCar(v) {
    const b = v.body, o = v.root.position;
    const n = world.graph.nearestEdge(o.x, o.z, 40);
    let x = o.x, z = o.z, yaw = b.yaw();
    if (n) {
      x = n.x; z = n.z;
      const e = n.edge; const k = Math.min(n.k, e.pts.length - 2);
      const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
      const ey = Math.atan2(-dx, -dz);
      yaw = Math.abs(wrapA(ey - yaw)) < Math.PI / 2 ? ey : ey + Math.PI;
    } else { x = P.lastSafe.x; z = P.lastSafe.z; yaw = P.lastSafe.yaw; }
    const y = world.groundAt(x, z, o.y + 3) + 0.3;
    b.place(x, y, z, yaw);
    // festival / free roam: a reset also fixes a wrecked car (a dead car cannot drive and there is no other way out)
    if (v.health <= 0 && !game.flags?.police) { v.health = 100; v.wrecked = false; }
    P.flipT = 0;
    rig.snap();
  }

  // back to the last safe road spot (water, off the world): used by the game's recovery in every mode
  P.resetToSafe = function () {
    const s = P.lastSafe;
    if (P.vehicle) {
      const b = P.vehicle.body;
      b.place(s.x, world.groundAt(s.x, s.z, s.y + 3) + 0.4, s.z, s.yaw);
      b.vel?.set?.(0, 0, 0); b.angVel?.set?.(0, 0, 0);
    } else { P.pos.set(s.x, world.groundAt(s.x, s.z, 999), s.z); P.vel?.set?.(0, 0, 0); }
    P.flipT = 0;
    rig.snap();
  };
  function updateFoot(dt) {
    const ax = input.axes;
    // knocked down
    if (P.knocked > 0) {
      P.knocked -= dt;
      const gt = P.getupT ?? 0.9, down = P.knocked > gt;
      if (down) {
        P.vel.y -= 9.8 * dt;
        P.pos.addScaledVector(P.vel, dt);
      }
      const gy = world.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
      if (P.pos.y < gy) { P.pos.y = gy; P.vel.multiplyScalar(0.5); P.vel.y = Math.abs(P.vel.y) * 0.2; }
      human.root.position.copy(P.pos);
      // realistic human: ragdoll while down (seeded with the hit velocity), then a mocap get-up where the body lies
      human.update(dt, { state: down ? 'knocked' : 'getup', speed: 0, turn: 0, rate: 1.7, vel: P.knockVel, ground: { x: P.pos.x, z: P.pos.z, y: gy, gx: 0, gz: 0 } });
      P.knockVel = null;
      if (human.getupRoot) {
        const g = human.getupRoot; human.getupRoot = null;
        P.pos.set(g.x, g.y, g.z); P.yaw = g.yaw; P.vel.set(0, 0, 0);
        human.root.position.copy(P.pos); human.root.rotation.y = P.yaw; human.root.updateMatrixWorld(); human._applyAnchor?.();
      }
      return;
    }
    const camYaw = rig.rig.orbitYaw;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = rx * ax.moveX + fx * ax.moveY, mz = rz * ax.moveX + fz * ax.moveY;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    P.sprinting = input.held('sprint') && ml > 0.2 && P.stamina > 0.05;
    P.stamina = Math.max(0, Math.min(1, P.stamina + (P.sprinting ? -dt * 0.12 : dt * 0.25)));
    const speed = P.sprinting ? 7.2 : 4.4 * Math.min(1, ml * 1.2) * (input.device === 'pad' ? 1 : 1);
    const walk = input.key('ControlLeft') || input.key('AltLeft');
    const tgt = walk ? 1.5 : speed;
    const tvx = mx * tgt, tvz = mz * tgt;
    const acc = P.grounded ? 14 : 2;
    P.vel.x += (tvx - P.vel.x) * Math.min(1, dt * acc);
    P.vel.z += (tvz - P.vel.z) * Math.min(1, dt * acc);
    if (ml > 0.1) {
      const ty = Math.atan2(-mx, -mz);
      const d = wrapA(ty - P.yaw);
      P.yaw += d * Math.min(1, dt * 12);
      P.turn = d;
    } else P.turn = 0;
    // jump + gravity
    if (P.grounded && input.pressed('jump') && P.mode === 'foot') { P.vel.y = 5.2; P.grounded = false; P.jumpT = 0.3; }
    P.vel.y -= 16 * dt;
    P.pos.addScaledVector(P.vel, dt);
    const gy = world.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.6);
    // (rising out of a jump: no ground snap, else the step-down smoothing below swallowed every jump)
    const rising = P.jumpT > 0 && P.vel.y > 0; if (P.jumpT > 0) P.jumpT -= dt;
    if (P.pos.y <= gy + 0.02 && !rising) {
      if (!P.grounded && P.vel.y < -3) P.landT = P.vel.y < -9 ? 0.3 : 0.2;   // (soft landings play the land clip too)
      P.pos.y = gy; P.vel.y = 0; P.grounded = true;
    } else if (P.pos.y > gy + 0.3 || rising) P.grounded = false;
    else { P.pos.y += (gy - P.pos.y) * Math.min(1, dt * 20); P.grounded = true; }
    // collisions: static
    const cols = world.colliders.query(P.pos.x, P.pos.z, 1.5, _cand);
    for (const c of cols) {
      if (P.pos.y + 1.7 < c.yMin || P.pos.y > c.yMax - 0.05) continue;
      pushOutCircle(P.pos, R, c);
    }
    // vehicles: push out, get hit
    for (const v of game.vehicles()) {
      const b = v.body;
      const dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z;
      if (dx * dx + dz * dz > 49 || Math.abs(P.pos.y - b.pos.y) > 2.5) continue;
      const hit = circleVsCar(P.pos, R, b);
      if (hit) {
        const rel = Math.hypot(b.vel.x, b.vel.z);
        if (rel > 5) { knock(b.vel, rel); game.onPlayerHitByCar?.(v, rel); }
      }
    }
    human.root.position.copy(P.pos);
    human.root.rotation.y = P.yaw;
    const hs = Math.hypot(P.vel.x, P.vel.z);
    let st = !P.grounded ? (P.vel.y > 0 ? 'jump' : 'fall') : P.landT > 0 ? 'land' : hs < 0.2 ? 'idle' : P.sprinting ? 'sprint' : hs < 2.2 ? 'walk' : 'run';
    if (P.landT > 0) P.landT -= dt;
    human.update(dt, { state: st, speed: hs, turn: P.turn || 0 });
    if (input.pressed('enter')) tryEnter();
    // water: swim-less... respawn on shore
    if (P.pos.y < -1.2) { game.onDrown?.(); }
  }
  function knock(vel, rel) {
    P.getupT = human.getupTime ? human.getupTime(1.7) : 0.9;
    P.knocked = (human.getupTime ? 1.5 : 0.9) + P.getupT;
    P.vel.set(vel.x * 0.6, Math.min(8, 2 + rel * 0.25), vel.z * 0.6);
    P.knockVel = { x: P.vel.x, y: P.vel.y, z: P.vel.z };
    P.health = Math.max(0, P.health - Math.min(60, rel * 2.2));
    if (P.health <= 0) game.onWasted?.('hit');
  }
  return Object.assign(P, { update, setVehicle, exitVehicle, resetCar, knock, tryEnter });
}

const _cand = [];
/** door openness over a car one-shot (k = 0..1 of the clip): 'enter' opens while turning at the door, stays open while
 *  sliding in, pulled shut once seated; 'jack' yanks it open at once (the driver is thrown out); 'exit' opens as the
 *  body rises out of the seat and stays open (the car closes it once the person is clear, Vehicle.releaseDoor). */
function doorCurve(k, kind) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (kind === 'exit') return sm(0.0, 0.22, k);
  return sm(kind === 'jack' ? -0.02 : 0.04, kind === 'jack' ? 0.1 : 0.28, k) * (1 - sm(0.86, 1.0, k));
}
// world position of the car's driver-seat pelvis point (spec.seat, car local; origin at ground level)
function seatWorld(v, out) {
  const s = v.spec?.seat || [-0.35, 0.9, 0];
  // spec.seat[1] sits near eye level (camera anchor); the hip point of a car seat is ~36 % of the roof height
  const hy = Math.min(s[1], Math.max(0.45, Math.min(1.0, (v.spec?.height || 1.45) * 0.36)));
  return out.set(s[0], hy, s[2]).applyQuaternion(v.body.quat).add(v.root.position);
}
export function wrapA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export function pushOutCircle(p, r, c) {
  const dx = p.x - c.x, dz = p.z - c.z;
  const lx = c.c * dx - c.s * dz, lz = c.s * dx + c.c * dz;
  const cx = Math.max(-c.hx, Math.min(c.hx, lx)), cz = Math.max(-c.hz, Math.min(c.hz, lz));
  let ox = lx - cx, oz = lz - cz;
  const d2 = ox * ox + oz * oz;
  if (d2 > r * r) return false;
  let nlx, nlz, pen;
  if (d2 < 1e-8) { // centre inside: push along the least-penetrating axis
    const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = pz + r; }
  } else { const d = Math.sqrt(d2); nlx = ox / d; nlz = oz / d; pen = r - d; }
  // local -> world: wx = c*lx + s*lz, wz = -s*lx + c*lz
  p.x += (c.c * nlx + c.s * nlz) * pen; p.z += (-c.s * nlx + c.c * nlz) * pen;
  return true;
}
function circleVsCar(p, r, b) {
  b.forward(_v2); let fx = _v2.x, fz = _v2.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  const rx = -fz, rz = fx;
  const dx = p.x - b.pos.x, dz = p.z - b.pos.z;
  const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
  const hx = b.boxHalf.x, hz = b.boxHalf.z;
  const cx = Math.max(-hx, Math.min(hx, lx)), cz = Math.max(-hz, Math.min(hz, lz));
  const ox = lx - cx, oz = lz - cz, d2 = ox * ox + oz * oz;
  if (d2 > r * r) return false;
  const d = Math.sqrt(d2) || 1e-4;
  let nlx = ox / d, nlz = oz / d, pen = r - d;
  if (d2 < 1e-8) { if (hx - Math.abs(lx) < hz - Math.abs(lz)) { nlx = Math.sign(lx) || 1; nlz = 0; pen = hx - Math.abs(lx) + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = hz - Math.abs(lz) + r; } }
  p.x += (rx * nlx + fx * nlz) * pen; p.z += (rz * nlx + fz * nlz) * pen;
  return true;
}
