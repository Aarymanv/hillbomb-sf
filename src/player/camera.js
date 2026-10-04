// Chase camera (car), hood / bumper camera, in-car (cockpit) camera, on-foot orbit camera. Spring-smoothed, speed FOV,
// occlusion pull-in (never into the car itself), impact shake + a small speed-dependent road shake.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
export function createCameraRig(camera, world) {
  const rig = {
    mode: 'chase',     // 'chase' | 'far' | 'hood' | 'cockpit' | 'foot' | 'cinematic'
    yaw: 0, pitch: 0.18, orbitYaw: 0, orbitPitch: 0, orbitIdle: 0,
    pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62, shake: 0, shakeT: 0,
    lookBack: false, dist: 6.2, height: 2.0,
    speedBlur: 0, roadShake: 0, near: 0.25,
    initialised: false,
  };
  function snap(target) { rig.initialised = false; if (target) rig.pos.copy(target); }

  function updateCar(dt, veh, input) {
    const b = veh.body;
    const spec = veh.spec;
    const size = Math.max(4.2, spec.length);
    const far = rig.mode === 'far';
    const dist = (size * 1.18 + 1.2) * (far ? 1.45 : 1);
    const height = (spec.height * 0.95 + 0.9) * (far ? 1.3 : 1);
    b.forward(_f);
    const carYaw = Math.atan2(-_f.x, -_f.z);
    // heading: blend car facing with velocity direction (drifts show the car's side)
    const vx = b.vel.x, vz = b.vel.z, sp = Math.hypot(vx, vz);
    let targetYaw = carYaw;
    if (sp > 4 && b.fwdSpeed > 0) {
      const velYaw = Math.atan2(-vx, -vz);
      const diff = wrap(velYaw - carYaw);
      targetYaw = carYaw + diff * Math.min(0.6, sp / 40);
    } else if (b.fwdSpeed < -2) targetYaw = carYaw;
    if (!rig.initialised) { rig.yaw = targetYaw; }
    // FH-style lag: a critically damped spring on the heading (no instant snap on keyboard taps / small yaw wiggles;
    // the old first-order follow passed every twitch straight to the camera)
    const followW = b.grounded ? 4.2 : 2.2;
    if (!rig.initialised) rig.yawVel = 0;
    const yErr = wrap(targetYaw - rig.yaw);
    rig.yawVel = (rig.yawVel || 0) + (yErr * followW * followW - 2 * followW * (rig.yawVel || 0)) * Math.min(dt, 0.05);
    rig.yaw += rig.yawVel * Math.min(dt, 0.05);
    if (Math.abs(wrap(targetYaw - rig.yaw)) > 1.2) { rig.yaw = targetYaw - Math.sign(wrap(targetYaw - rig.yaw)) * 1.2; }
    // mouse / stick orbit
    const m = input.mouse, ax = input.axes;
    if (m.dx || m.dy || Math.abs(ax.lookX) > 0.05 || Math.abs(ax.lookY) > 0.05) {
      rig.orbitYaw -= m.dx * 0.0035 + ax.lookX * dt * 3;
      rig.orbitPitch = THREE.MathUtils.clamp(rig.orbitPitch + m.dy * 0.003 + ax.lookY * dt * 2, -0.5, 0.9);
      rig.orbitIdle = 0;
    } else {
      rig.orbitIdle += dt;
      if (rig.orbitIdle > 1.4 && sp > 3) { rig.orbitYaw *= Math.exp(-dt * 2.5); rig.orbitPitch *= Math.exp(-dt * 2.5); }
    }
    const yaw = rig.yaw + rig.orbitYaw + (rig.lookBack ? Math.PI : 0);
    const pitch = 0.16 + rig.orbitPitch;
    const origin = veh.root.position;
    const target = _t.set(origin.x, origin.y + spec.height * 0.75 + 0.35, origin.z);
    // look-ahead along the direction of travel (aims into the corner / drift instead of at the bumper)
    if (sp > 3 && b.fwdSpeed > 0) { const la = Math.min(2.2, sp * 0.06); target.x += vx / sp * la; target.z += vz / sp * la; }
    // speed pull-back
    const pull = Math.min(1, sp / 60);
    const d = dist * (1 + pull * 0.12);
    const desired = _v.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d + height * 0.35, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    // keep above the ground
    const gy = world.groundAt(desired.x, desired.z, desired.y + 2) + 0.6;
    if (desired.y < gy) desired.y = gy;
    // occlusion: pull in toward the target if a building blocks
    const t = world.colliders.raycast2D(target.x, target.z, desired.x, desired.z, (target.y + desired.y) / 2, 0.4);
    // occluded: pull in, but never inside the car's own body (long vehicles: buses, box trucks); rise instead
    if (t < 1) {
      const minK = Math.min(1, (spec.length * 0.5 + 1.1) / Math.max(1, d));
      const k = Math.max(0.25, minK, t - 0.04);
      desired.lerpVectors(target, desired, k);
      if (t - 0.04 < minK) desired.y += (minK - Math.max(0, t - 0.04)) * d * 0.35;
    }
    if (!rig.initialised) { rig.pos.copy(desired); rig.initialised = true; }
    const k = 1 - Math.exp(-dt * (t < 1 ? 14 : 9));
    rig.pos.lerp(desired, k);
    rig.pos.y += (desired.y - rig.pos.y) * Math.min(1, dt * 6);
    // hood / bumper camera (on the bonnet ahead of the windshield) and in-car camera (driver's eye); both ride the body
    const inCar = rig.mode === 'hood' || rig.mode === 'cockpit';
    if (rig.mode === 'hood') {
      const h = spec.hoodCam || [0, spec.seat[1] + 0.2, spec.axleFZ * 0.5];
      rig.pos.set(h[0], h[1], h[2]).applyQuaternion(veh.root.quaternion).add(origin);
      target.set(0, h[1] - 0.35, h[2] - 30).applyQuaternion(veh.root.quaternion).add(origin);
    } else if (rig.mode === 'cockpit') {
      // driver eye: a touch behind + inboard of the seat reference (the A-pillar filled the left third), looking level
      const s = spec.seat;
      rig.pos.set(s[0] * 0.92, s[1] + 0.01, s[2] + 0.1).applyQuaternion(veh.root.quaternion).add(origin);
      target.set(s[0] * 0.8, s[1] - 1.5, s[2] - 30).applyQuaternion(veh.root.quaternion).add(origin);
    }
    veh.visual?.setCabin?.(rig.mode === 'cockpit');
    rig.near = rig.mode === 'cockpit' ? 0.04 : rig.mode === 'hood' ? 0.1 : 0.25;
    rig.look.copy(target);
    rig.fov = THREE.MathUtils.lerp(rig.fov, (rig.mode === 'hood' ? 70 : rig.mode === 'cockpit' ? 56 : 60) + Math.min(inCar ? 10 : 16, sp * (inCar ? 0.14 : 0.22)), Math.min(1, dt * 3));
    rig.speedBlur = THREE.MathUtils.clamp((sp - 30) / 45, 0, 1);
    // road shake: grows with speed (and on rough surfaces while grounded), stronger in the in-car views
    rig.roadShake = b.grounded ? THREE.MathUtils.smoothstep(sp, 12, 70) * (inCar ? 1 : 0.55) : 0;
    rig.inCar = inCar;
  }

  function updateFoot(dt, ped, input) {
    const m = input.mouse, ax = input.axes;
    rig.orbitYaw -= m.dx * 0.0035 + ax.lookX * dt * 3.2;
    rig.orbitPitch = THREE.MathUtils.clamp(rig.orbitPitch + m.dy * 0.003 + ax.lookY * dt * 2.2, -0.6, 1.1);
    const yaw = rig.orbitYaw, pitch = 0.22 + rig.orbitPitch;
    const p = ped.pos;
    const target = _t.set(p.x, p.y + 1.55, p.z);
    // shoulder offset to the right
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    target.x += rx * 0.45; target.z += rz * 0.45;
    const d = 4.2;
    const desired = _v.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    const gy = world.groundAt(desired.x, desired.z, desired.y + 2) + 0.4;
    if (desired.y < gy) desired.y = gy;
    const t = world.colliders.raycast2D(target.x, target.z, desired.x, desired.z, (target.y + desired.y) / 2, 0.3);
    if (t < 1) desired.lerpVectors(target, desired, Math.max(0.15, t - 0.05));
    if (!rig.initialised) { rig.pos.copy(desired); rig.initialised = true; }
    rig.pos.lerp(desired, 1 - Math.exp(-dt * 12));
    rig.look.copy(target);
    rig.fov = THREE.MathUtils.lerp(rig.fov, 58 + (ped.sprinting ? 6 : 0), Math.min(1, dt * 3));
    rig.speedBlur = 0; rig.roadShake = 0; rig.near = 0.25; rig.inCar = false;
    rig.yaw = yaw;
  }

  function apply(dt) {
    camera.position.copy(rig.pos);
    if (rig.shake > 0.001) {
      rig.shakeT += dt * 38;
      const s = rig.shake * rig.shake;
      camera.position.x += Math.sin(rig.shakeT * 1.3) * s * 0.35;
      camera.position.y += Math.sin(rig.shakeT * 1.7 + 1) * s * 0.3;
      rig.shake = Math.max(0, rig.shake - dt * 1.8);
    }
    if (rig.roadShake > 0.001) {
      // smooth pseudo-noise (incommensurate sines), a few mm: reads as speed, not as a wobble
      rig.roadT = (rig.roadT || 0) + dt;
      const T = rig.roadT, a = rig.roadShake * (rig.inCar ? 0.006 : 0.012);
      camera.position.y += (Math.sin(T * 31.7) * 0.6 + Math.sin(T * 17.3 + 2.1) * 0.4) * a;
      camera.position.x += (Math.sin(T * 23.1 + 0.7) * 0.5 + Math.sin(T * 41.9) * 0.5) * a * 0.6;
    }
    camera.lookAt(rig.look);
    let upd = false;
    if (Math.abs(camera.fov - rig.fov) > 0.05) { camera.fov = rig.fov; upd = true; }
    if (camera.near !== rig.near) { camera.near = rig.near; upd = true; }
    if (upd) camera.updateProjectionMatrix();
  }
  function addShake(a) { rig.shake = Math.min(1, rig.shake + a); }
  return { rig, updateCar, updateFoot, apply, addShake, snap };
}
export function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
