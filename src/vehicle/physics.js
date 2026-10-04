// Raycast-suspension rigid-body car. Arcade-leaning but physical: springs/dampers per wheel, slip-based tyre forces with
// a friction circle, engine torque curve + automatic gearbox, drag/downforce, chassis-vs-ground and chassis-vs-wall
// impulse contacts. Frames: body local +X right, +Y up, -Z forward (CONVENTIONS.md).
import * as THREE from 'three';

const G = 9.81;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m3 = new THREE.Matrix3();
const _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const _gn = { x: 0, y: 1, z: 0, surface: 1, deck: null };
// world conditions shared by every body (set once per frame by the game): grip = weather wetness multiplier (1 dry .. ~0.8 soaked)
export const ENV = { grip: 1, legacyContact: false };   // legacyContact: dev A/B of the pre-2026-09-30 wheel contact

// surface grip multipliers by SURF code (water, asphalt, concrete, grass, sand, dirt, rock, forest)
const SURF_GRIP = [0.3, 1.0, 0.95, 0.72, 0.6, 0.75, 0.85, 0.7];
const SURF_DRAG = [4, 0, 0, 0.018, 0.06, 0.012, 0.004, 0.02];

export class CarBody {
  constructor(spec, P) {
    this.spec = spec; this.P = P;
    const m = P.mass;
    this.mass = m; this.invMass = 1 / m;
    const L = spec.length, W = spec.width, H = spec.height;
    // box inertia, slightly reduced (mass concentrated low/centre)
    const k = P.inertiaScale ?? 0.85;
    this.Ilocal = new THREE.Vector3((m / 12) * (H * H + L * L) * k, (m / 12) * (W * W + L * L) * k, (m / 12) * (W * W + H * H) * k);
    this.invI = new THREE.Vector3(1 / this.Ilocal.x, 1 / this.Ilocal.y, 1 / this.Ilocal.z);
    // centre of mass in model space
    this.com = new THREE.Vector3(0, P.comY ?? 0.5, P.comZ ?? 0);
    this.pos = new THREE.Vector3();        // COM world position
    this.prevPos = new THREE.Vector3(); this.prevQuat = new THREE.Quaternion(); this.interp = false; this.alpha = 1;  // render interpolation (sim.js)
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    // suspension
    const travel = P.travel ?? 0.28;
    const kSpring = P.spring ?? m * G / 4 / (travel * 0.42);   // static sag ~42% of travel
    const cDamp = P.damper ?? 2 * 0.32 * Math.sqrt(kSpring * m / 4);
    const sag = (m * G / 4) / kSpring;
    const wy = spec.wheelRadius;
    this.wheels = [];
    const pos = [[-spec.trackF / 2, spec.axleFZ, true], [spec.trackF / 2, spec.axleFZ, true], [-spec.trackR / 2, spec.axleRZ, false], [spec.trackR / 2, spec.axleRZ, false]];
    for (const [x, z, front] of pos) {
      const driven = P.drive === 'AWD' || (P.drive === 'FWD' ? front : !front);
      this.wheels.push({
        front, driven, radius: spec.wheelRadius,
        mount: new THREE.Vector3(x, wy + travel - sag, z).sub(this.com), // mount in COM-local space
        rest: travel, k: kSpring, c: cDamp, sag,
        len: travel - sag, lenPrev: travel - sag, contact: false, compression: sag, load: m * G / 4,
        n: new THREE.Vector3(0, 1, 0), cp: new THREE.Vector3(), surface: 1, deck: null,
        steer: 0, spin: 0, spinVel: 0, slipLat: 0, slipLong: 0, skid: 0, vLong: 0,
      });
    }
    this.travel = travel;
    // drivetrain
    this.gear = 1; this.rpm = P.idle; this.shiftTimer = 0; this.clutch = 1; this.reverse = false;
    this.throttle = 0; this.brake = 0; this.handbrake = 0; this.steerInput = 0; this.steer = 0;
    this.boost = 0; this.nitro = 0;
    // derived
    this.speed = 0; this.fwdSpeed = 0; this.grounded = 0; this.airTime = 0; this.lastAir = 0;
    this.events = []; // {type:'impact', strength, point, other} for audio / damage
    this.damage = 0;
    this.maxSteer = P.steer ?? 0.62;
    this.onShift = null;
    this.scrape = 0;
    this.drift = 0;
    this.sleeping = false;
    this.halfExt = new THREE.Vector3(spec.width / 2, spec.height / 2, spec.length / 2);
    this.boxCenter = new THREE.Vector3(0, (spec.bounds.min[1] + spec.bounds.max[1]) / 2, (spec.bounds.min[2] + spec.bounds.max[2]) / 2).sub(this.com);
    this.boxHalf = new THREE.Vector3((spec.bounds.max[0] - spec.bounds.min[0]) / 2, (spec.bounds.max[1] - spec.bounds.min[1]) / 2, (spec.bounds.max[2] - spec.bounds.min[2]) / 2);
    this.corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(sx * this.boxHalf.x * 0.95, sy * this.boxHalf.y * (sy < 0 ? 0.6 : 0.95), sz * this.boxHalf.z * 0.97).add(this.boxCenter));
    // mid-edge points along the underside and roof (better ground contact when flipped)
    for (const sy of [-1, 1]) for (const sz of [-0.5, 0, 0.5]) for (const sx of [-1, 1]) this.corners.push(new THREE.Vector3(sx * this.boxHalf.x * 0.9, sy * this.boxHalf.y * (sy < 0 ? 0.6 : 0.95), sz * this.boxHalf.z).add(this.boxCenter));
  }

  // place the car with its model origin (ground contact point) at (x, y, z) facing yaw
  place(x, y, z, yaw) {
    this.quat.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    this.pos.copy(this.com).applyQuaternion(this.quat).add(_v.set(x, y, z));
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); this.interp = false;
    this.gear = 1; this.rpm = this.P.idle; this.reverse = false; this.airTime = 0;
    for (const w of this.wheels) { w.len = w.rest - w.sag; w.lenPrev = w.len; }
  }
  // model origin in world
  originWorld(out) { return out.copy(this.com).negate().applyQuaternion(this.quat).add(this.pos); }
  forward(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  yaw() { this.forward(_v); return Math.atan2(-_v.x, -_v.z); }
  pointVel(pWorld, out) { return out.copy(pWorld).sub(this.pos).cross(this.angVel).negate().add(this.vel); } // v + w x r
  // world inverse inertia applied to a vector
  applyInvI(vWorld, out) {
    _qi.copy(this.quat).invert();
    out.copy(vWorld).applyQuaternion(_qi);
    out.x *= this.invI.x; out.y *= this.invI.y; out.z *= this.invI.z;
    return out.applyQuaternion(this.quat);
  }
  applyImpulse(J, pWorld) {
    this.vel.addScaledVector(J, this.invMass);
    _ai1.copy(pWorld).sub(this.pos).cross(J);
    this.applyInvI(_ai1, _ai2);
    this.angVel.add(_ai2);
  }
  // effective inverse mass along n at point p
  invMassAt(pWorld, n) {
    _ia1.copy(pWorld).sub(this.pos);
    _ia2.copy(_ia1).cross(n);
    this.applyInvI(_ia2, _ia3);
    _ia3.cross(_ia1);
    return this.invMass + _ia3.dot(n);
  }

  // ------------------------------------------------------------------ player input (Forza-style arcade-sim steering)
  // keyboard: rate-limited steer ramp (slower at speed, faster back to centre), ramped pedals; pad: near-direct.
  // Standard / Assisted: full lock at speed = the angle that puts the front tyres just past peak slip (L*mu*g/v^2 + slip
  // peak), so a held key turns as hard as the grip allows instead of sawing the fronts / snapping the rear.
  // Simulation: the raw angle (the old model). ABS / TCS / STM flags are applied in the tyre + yaw sections of step().
  playerInput(dt, input, hs, vfw, vs) {
    const P = this.P, sim = hs.mode === 'sim';
    const ramp = (cur, tgt, up, dn) => cur + THREE.MathUtils.clamp(tgt - cur, -dn * dt, up * dt);
    if (input.digitalPedals !== false) { this.throttle = ramp(this.throttle, input.throttle, 6, 12); this.brake = ramp(this.brake, input.brake, 8, 14); }
    else { this.throttle = input.throttle; this.brake = input.brake; }
    this.handbrake = input.handbrake;
    const s01 = Math.min(1, vs / 35), tgt = input.steer;
    if (input.digital !== false) {
      const kb = hs.kb ?? 1, back = Math.abs(tgt) < Math.abs(this.steerInput) || tgt * this.steerInput < 0;
      // two-stage ramp: quick initial bite (first 40% of lock), then a slower build to full lock; faster back to centre
      const rate = kb * (back ? 8 - 2 * s01 : Math.abs(this.steerInput) < 0.4 ? 9.5 - 2.5 * s01 : 5 - 2 * s01);
      this.steerInput = ramp(this.steerInput, tgt, rate, rate);
    } else this.steerInput += (tgt - this.steerInput) * Math.min(1, dt * 22);
    let maxA;
    if (sim) maxA = this.maxSteer / (1 + vs / (P.steerSpeed ?? 26));
    else {
      const wb = Math.abs(this.spec.axleFZ - this.spec.axleRZ) || 2.6;
      const mu = (P.grip ?? 1) * (P.gripF ?? 1) * ENV.grip * G;
      const lim = (wb * mu * 1.1 / Math.max(1, vs * vs) + (P.slipPeak ?? 0.13) * 1.2) * (hs.mode === 'assisted' ? 0.92 : 1);
      maxA = Math.min(this.maxSteer, lim * (hs.sens ?? 1));
    }
    let steer = this.steerInput * maxA;
    this.right(_rt);
    const beta = Math.atan2(this.vel.dot(_rt), Math.max(2, vs));
    this.beta = beta;
    // drift intent: handbrake recently, or counter-steering with the throttle down in a slide (drift cars always lean this way)
    // (held counter-steer for 0.3 s, so a quick direction change in a slalom isn't mistaken for a drift)
    this.csT = Math.abs(beta) > 0.22 && this.steerInput * beta > 0.15 && this.throttle > 0.6 ? (this.csT || 0) + dt : 0;
    if (this.handbrake > 0.1) this.driftT = 1.4;
    else if (this.csT > 0.3) this.driftT = Math.max(this.driftT || 0, 0.6);
    else this.driftT = Math.max(0, (this.driftT || 0) - dt);
    if (!sim && hs.counter !== false && vs > 6 && this.grounded >= 2) {
      const slide = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.08);
      steer += THREE.MathUtils.clamp(slide * (P.assist ?? 0.55) * 1.1 * (1 - Math.abs(this.steerInput) * 0.4), -0.3, 0.3);
    }
    this.steer = THREE.MathUtils.clamp(steer, -this.maxSteer, this.maxSteer);
    this._abs = !!hs.abs; this._tcs = !!hs.tcs && !sim; this._stm = !!hs.stm && !sim;
    this._driftCar = !!(P.tags?.includes?.('drift') || P.tyre === 'drift');
  }

  // ------------------------------------------------------------------ step
  step(dt, world, input) {
    const P = this.P, spec = this.spec;
    this.events.length = 0;
    // --- input smoothing
    const vfw = this.forward(_fw).dot(this.vel);
    this.fwdSpeed = vfw;
    this.speed = this.vel.length();
    const vs = Math.abs(vfw);
    const hs = input.hs;   // player handling settings (player.js); AI / traffic leave it unset and keep the original model
    this._abs = this._tcs = this._stm = false;
    if (hs) this.playerInput(dt, input, hs, vfw, vs);
    else {
      this.throttle = input.throttle; this.brake = input.brake; this.handbrake = input.handbrake;
      const steerRate = Math.abs(input.steer) > Math.abs(this.steerInput) ? 4.5 : 6.5;
      this.steerInput += THREE.MathUtils.clamp(input.steer - this.steerInput, -steerRate * dt, steerRate * dt);
      const maxA = this.maxSteer / (1 + vs / (P.steerSpeed ?? 26));
      let steer = this.steerInput * maxA;
      // counter-steer assist while sliding (keeps drifts controllable)
      if (vs > 6 && this.grounded >= 2) {
        this.right(_rt);
        const vlat = this.vel.dot(_rt), beta = Math.atan2(vlat, Math.max(2, vs));
        const assist = P.assist ?? 0.55;
        // only counter-steer in a real slide (normal cornering sideslip is left alone)
        const slide = Math.sign(beta) * Math.max(0, Math.abs(beta) - 0.1);
        steer += THREE.MathUtils.clamp(slide * assist * (1 - Math.abs(this.steerInput) * 0.4), -0.3, 0.3);
      }
      this.steer = THREE.MathUtils.clamp(steer, -this.maxSteer, this.maxSteer);
      // race rivals (input.aiAssist, set by festival racing): TCS + STM like the player's assists. Without them rivals
      // power-oversteered out of every junction corner at 13-16 m/s and spun into the kerb (most 'noProgress' resets)
      if (input.aiAssist) { this._tcs = this._stm = true; this.driftT = 0; this.right(_rt); this.beta = Math.atan2(this.vel.dot(_rt), Math.max(2, vs)); }
    }

    // --- drivetrain: reverse logic (S brakes when moving forward, reverses when stopped)
    let throttle = this.throttle, brake = this.brake;
    if (input.autoReverse === false) {
      // AI: explicit reverse gear, throttle stays throttle
      this.reverse = !!input.reverse;
    } else {
      if (!this.reverse && brake > 0.1 && throttle < 0.1 && vfw < 0.8) this.reverse = true;
      if (this.reverse && throttle > 0.1 && vfw > -0.8) this.reverse = false;
      if (this.reverse) { const t = throttle; throttle = brake; brake = t; }
    }

    // --- gearbox
    const gears = P.gears, fd = P.final, r = spec.wheelRadius;
    let wheelRpm = 0, nd = 0;
    for (const w of this.wheels) if (w.driven) { wheelRpm += Math.abs(w.vLong); nd++; }
    wheelRpm = (wheelRpm / Math.max(1, nd)) / r * 60 / (2 * Math.PI);
    const ratio = this.reverse ? gears[0] * 1.1 : gears[this.gear - 1];
    let rpm = wheelRpm * ratio * fd;
    // clutch slip at launch
    const launchRpm = P.idle + throttle * (P.redline * 0.55 - P.idle);
    if (rpm < launchRpm && (this.gear === 1 || this.reverse)) rpm = rpm + (launchRpm - rpm) * (this.grounded ? 0.85 : 1);
    if (this.grounded < 1) rpm = this.rpm + ((P.idle + throttle * (P.redline - P.idle)) - this.rpm) * Math.min(1, dt * 6);
    rpm = THREE.MathUtils.clamp(rpm, P.idle, P.redline * 1.02);
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 18);
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    else if (!this.reverse && this.grounded >= 2) {
      if (this.rpm > P.redline * 0.93 && this.gear < gears.length && throttle > 0.2) { this.gear++; this.shiftTimer = P.shiftTime ?? 0.18; this.onShift?.(true); }
      else if (this.gear > 1 && this.rpm < P.redline * 0.42) {
        // pick the highest gear that keeps rpm under 80% redline
        let g = this.gear - 1;
        this.gear = g; this.shiftTimer = 0.12; this.onShift?.(false);
      }
    }
    // engine torque
    const x = this.rpm / P.redline;
    const curve = THREE.MathUtils.clamp(0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, x * 1.05)) + (x < 0.25 ? -0.1 : 0), 0.45, 1);
    let engT = P.torque * curve * throttle;
    if (this.rpm >= P.redline) engT = 0;
    if (this.shiftTimer > 0) engT *= 0.1;
    const boostMul = 1 + this.boost * 0.6;
    const wheelForceTotal = engT * ratio * fd * (P.eff ?? 0.88) / r * boostMul * (this.reverse ? -1 : 1);
    // engine braking when off throttle
    const engBrake = throttle < 0.05 && !this.reverse ? (P.engineBrake ?? 0.06) * this.mass * G * Math.min(1, vs / 8) : 0;

    // --- suspension + tyres
    this.up(_up);
    const down = _v.copy(_up).negate();
    let grounded = 0;
    const R = this.quat;
    let scrapeAmt = 0;
    const wheelF = [];
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const mountW = _v2.copy(w.mount).applyQuaternion(R).add(this.pos);
      const maxLen = w.rest + w.radius;
      w.contact0 = w.contact; w.contact = false;
      if (down.y < -0.25) {
        // ray-heightfield: two refinement steps
        let gy = world.groundAt(mountW.x, mountW.z, mountW.y, _gn);
        let t = (mountW.y - gy) / -down.y;
        if (t > -0.6 && t < maxLen + 0.4) {
          const hx = mountW.x + down.x * t, hz = mountW.z + down.z * t;
          gy = world.groundAt(hx, hz, mountW.y, _gn);
          t = (mountW.y - gy) / -down.y;
        }
        // hysteresis: a wheel already on the ground keeps contact 4 cm past full droop (no on/off chatter over seams / crests)
        if (t < maxLen + (w.contact0 && !ENV.legacyContact ? 0.04 : 0) && t > -0.6) {
          w.contact = true;
          w.cp.set(mountW.x + down.x * t, mountW.y + down.y * t, mountW.z + down.z * t);
          w.n.set(_gn.x, _gn.y, _gn.z);
          w.surface = _gn.surface; w.deck = _gn.deck;
          let len = t - w.radius;
          if (len < 0) { scrapeAmt += -len; len = 0; }
          w.lenPrev = w.len; w.len = len;
        }
      }
      if (!w.contact) { w.lenPrev = w.len; w.len = Math.min(w.rest, w.len + dt * 3); w.load = 0; wheelF.push(null); continue; }
      grounded++;
      const comp = w.rest - w.len;
      // digressive damper: above ~1 m/s shaft speed the force rises 4x slower, so a curb / deck joint / rail edge met in a
      // single 8 ms step doesn't fire the car into the air (the old linear damper turned a 15 cm curb into a ~30 kN kick)
      const cv = (w.lenPrev - w.len) / dt, acv = Math.abs(cv);
      const compVel = acv > 1 && !ENV.legacyContact ? Math.sign(cv) * (1 + (acv - 1) * 0.25) : cv;
      let Fs = w.k * Math.max(comp, -0.02) + w.c * compVel;
      // progressive bump stop + extra damping near full compression (soaks up landings)
      if (w.len < 0.1) { const q = (0.1 - w.len) / 0.1; Fs += q * q * w.k * 1.6 + Math.max(0, compVel) * w.c * 2.5 * q; }
      Fs = Math.min(Math.max(0, Fs), this.mass * G * 3.5);
      w.load = Fs;
      w.compression = comp;
      wheelF.push(Fs);
    }
    // anti-roll bars
    const arb = P.antiRoll ?? 0.5;
    for (const [a, b] of [[0, 1], [2, 3]]) {
      const wa = this.wheels[a], wb = this.wheels[b];
      if (wheelF[a] === null || wheelF[b] === null) continue;
      const d = (wa.compression - wb.compression) * wa.k * arb;
      wheelF[a] += d; wheelF[b] -= d;
      wheelF[a] = Math.max(0, wheelF[a]); wheelF[b] = Math.max(0, wheelF[b]);
    }
    const F = _accF.set(0, 0, 0), T = _accT.set(0, 0, 0);
    let driftAcc = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (wheelF[i] === null) { w.skid = 0; w.slipLat = 0; continue; }
      const Fs = wheelF[i];
      w.load = Fs;
      // suspension force along body up at the contact point
      const cp = w.cp;
      _v2.copy(_up).multiplyScalar(Fs);
      F.add(_v2); _r.copy(cp).sub(this.pos); T.add(_v3.copy(_r).cross(_v2));
      // wheel frame on the ground plane
      const n = w.n;
      const st = w.front ? this.steer : 0;
      w.steer = st;
      _fw.set(Math.sin(st), 0, -Math.cos(st)).applyQuaternion(R);
      _fw.addScaledVector(n, -_fw.dot(n)).normalize();
      _rt.copy(_fw).cross(n).normalize();
      const pv = this.pointVel(cp, _v);
      const vLong = pv.dot(_fw), vLat = pv.dot(_rt);
      w.vLong = vLong;
      const grip = (P.grip ?? 1) * SURF_GRIP[w.surface] * (w.front ? (P.gripF ?? 1) : (P.gripR ?? 1)) * (w.surface === 0 ? 1 : ENV.grip);
      // tyre load relaxation (~25 ms): grip follows load changes smoothly instead of vanishing for a step at a seam
      const FzNow = Math.min(Fs, this.mass * G * 1.6);
      const Fz = w.contact0 && !ENV.legacyContact ? Math.max(FzNow, (w.FzT || 0) * Math.exp(-dt / 0.025)) : FzNow;
      w.FzT = Fz;
      const mu = grip * Fz;
      // lateral
      const alpha = Math.atan2(vLat, Math.abs(vLong) + 2.2);
      const peak = P.slipPeak ?? 0.13;
      let nrm = alpha / peak;
      const an = Math.abs(nrm);
      let lat = an <= 1 ? nrm : Math.sign(nrm) * Math.max(0.72, 1 - (an - 1) * (P.slipFalloff ?? 0.06));
      let latMul = 1;
      if (!w.front && this.handbrake > 0.1) latMul = P.handbrakeGrip ?? 0.42;
      let Fy = -lat * mu * latMul * (P.latStiff ?? 1.0);
      // longitudinal
      let Fx = 0;
      if (w.driven) Fx += wheelForceTotal / nd;
      const brakeF = (P.brake ?? 1.1) * this.mass * G / 4 * brake * (w.front ? 1.15 : 0.85);
      if (brake > 0 && Math.abs(vLong) > 0.05) Fx -= Math.sign(vLong) * brakeF;
      else if (brake > 0) Fx -= vLong * this.mass * 0.25;
      if (!w.front && this.handbrake > 0.1) { Fx -= Math.sign(vLong) * Math.min(Math.abs(vLong) * this.mass * 0.5, this.mass * G * 0.45); }
      if (engBrake && w.driven) Fx -= Math.sign(vLong) * engBrake / nd;
      // rolling resistance + surface drag
      Fx -= Math.sign(vLong) * Math.min(1, Math.abs(vLong)) * this.mass * G * (0.012 + SURF_DRAG[w.surface]) / 4;
      // low-speed hold (parking): kill creep
      if (Math.abs(vLong) < 0.6 && throttle < 0.05 && Math.abs(wheelForceTotal) < 1) Fx -= vLong * this.mass * 0.9;
      // ABS: brake force held just under the grip left after cornering (wheels never lock, the car still steers)
      // TCS: same cap on drive force for the driven wheels
      if ((this._abs && brake > 0.02 && !(this.handbrake > 0.1 && !w.front)) || (this._tcs && w.driven && throttle > 0.05 && Fx * wheelForceTotal > 0)) {
        const avail = Math.sqrt(Math.max(mu * mu * 1.0 - Fy * Fy, mu * mu * 0.12));
        if (Math.abs(Fx) > avail) { Fx = Math.sign(Fx) * avail; if (brake > 0.02) this.absActive = 0.15; }
      }
      // friction circle
      const mag = Math.hypot(Fx, Fy);
      let skid = 0;
      if (mag > mu * 1.05) {
        const s = mu * 1.05 / mag;
        skid = 1 - s;
        // under power the longitudinal wins a bit (burnouts), lateral gets squeezed
        Fx *= s; Fy *= s;
      }
      if (an > 1.15) skid = Math.max(skid, Math.min(1, (an - 1.15) * 0.45));
      w.skid = skid * Math.min(1, Math.hypot(vLong, vLat) / 4);
      w.slipLat = alpha;
      if (!w.front) driftAcc += Math.abs(alpha);
      // spin visual
      const wheelspin = w.driven && throttle > 0.6 && mag > mu && Math.abs(vLong) < 12 ? (1 - Math.abs(vLong) / 12) * 25 : 0;
      w.spinVel = (vLong + (this.reverse ? -wheelspin : wheelspin)) / w.radius;
      if (!w.front && this.handbrake > 0.1) w.spinVel *= 0.1;
      if (brake > 0.8 && Math.abs(vLong) > 3 && skid > 0.3) w.spinVel *= 0.3;
      _v2.copy(_fw).multiplyScalar(Fx).addScaledVector(_rt, Fy);
      F.add(_v2); _r.copy(cp).sub(this.pos); T.add(_v3.copy(_r).cross(_v2));
    }
    this.drift = driftAcc / 2;
    this.grounded = grounded;
    // --- aero
    const sp = this.vel.length();
    const cda = P.cda ?? 0.8;
    F.addScaledVector(this.vel, -0.5 * 1.2 * cda * sp);
    if (grounded) F.addScaledVector(_up, -(P.downforce ?? 0.4) * sp * sp);
    // --- air control + self-righting
    if (grounded === 0) {
      this.airTime += dt;
      const ac = (P.airControl ?? 1.0);
      this.forward(_fw); this.right(_rt);
      const Ip = this.Ilocal.x, Iy = this.Ilocal.y, Ir = this.Ilocal.z;
      // damp pitch / roll rates (cars hold their attitude in the air, Forza-style)
      const wP = this.angVel.dot(_rt), wR = this.angVel.dot(_fw), wY = this.angVel.dot(_up);
      T.addScaledVector(_rt, -wP * Ip * 2.2 * ac);
      T.addScaledVector(_fw, -wR * Ir * 2.6 * ac);
      // the nose follows the trajectory
      const vl = this.vel.length();
      if (vl > 4) { const err = this.vel.y / vl - _fw.y; T.addScaledVector(_rt, THREE.MathUtils.clamp(err, -0.6, 0.6) * Ip * 5 * ac); }
      // roll self-levelling (right vector y>0 = rolled left)
      T.addScaledVector(_fw, _rt.y * Ir * 7 * ac);
      // light yaw steering + player pitch
      T.addScaledVector(_up, (-input.steer * 1.2 - wY * 0.8) * Iy * ac);
      T.addScaledVector(_rt, (input.pitch ?? 0) * Ip * 2.5 * ac);
    } else {
      if (this.airTime > 0.35) this.events.push({ type: 'land', strength: Math.min(1, this.airTime / 1.8) });
      this.lastAir = this.airTime > 0.3 ? this.airTime : this.lastAir;
      this.airTime = 0;
    }
    // stability: yaw damping when not drifting on purpose
    if (grounded >= 3) {
      const yawRate = this.angVel.dot(_up);
      const damp = (P.yawDamp ?? 0.6) * (this.handbrake > 0.1 ? 0.2 : 1);
      T.addScaledVector(_up, -yawRate * this.mass * damp * 0.9);
    }
    // STM (player, assist on): caps yaw rate at what the steering + grip ask for, and sideslip at ~14 deg; drift intent
    // (handbrake / counter-steer on throttle) and drift-tagged cars get a much wider window so drifts still hold
    if (grounded >= 2) {
      const yawRate = this.angVel.dot(_up);
      if (this._stm && vs > 7) {
        const wb = Math.abs(spec.axleFZ - spec.axleRZ) || 2.6, mu = (P.grip ?? 1) * ENV.grip * G;
        const rMax = mu * 1.05 / vs, rRef = THREE.MathUtils.clamp(-vfw * Math.tan(this.steer) / wb, -rMax, rMax);
        const intent = (this.driftT || 0) > 0, drifty = this._driftCar;
        const allow = 0.1 + (intent ? 0.9 : 0) + (drifty ? 0.25 : 0);
        const over = yawRate * rRef > 0 ? Math.abs(yawRate) - Math.abs(rRef) - allow : Math.abs(yawRate) - allow;
        const Iy = this.Ilocal.y, gain = intent ? 2.5 : drifty ? 5 : 9;
        if (over > 0) T.addScaledVector(_up, -Math.sign(yawRate) * Math.min(over, 2) * Iy * gain);
        const bMax = intent ? 0.65 : drifty ? 0.38 : 0.25, b = this.beta || 0;
        if (Math.abs(b) > bMax) T.addScaledVector(_up, -Math.sign(b) * Math.min(Math.abs(b) - bMax, 0.5) * Iy * gain * 1.6);
      }
    }
    if (this.absActive > 0) this.absActive -= dt;
    // gravity
    F.y -= this.mass * G;
    // integrate velocities
    this.vel.addScaledVector(F, this.invMass * dt);
    this.applyInvI(T, _v3);
    this.angVel.addScaledVector(_v3, dt);
    // clamp crazy spins
    const aw = this.angVel.length(); if (aw > 12) this.angVel.multiplyScalar(12 / aw);
    // --- contacts (chassis vs ground, chassis vs static colliders)
    this.solveGround(world, dt);
    this.solveStatic(world, dt);
    // integrate positions
    this.pos.addScaledVector(this.vel, dt);
    _q.set(this.angVel.x * dt * 0.5, this.angVel.y * dt * 0.5, this.angVel.z * dt * 0.5, 0).multiply(this.quat);
    this.quat.x += _q.x; this.quat.y += _q.y; this.quat.z += _q.z; this.quat.w += _q.w;
    this.quat.normalize();
    // wheels spin
    for (const w of this.wheels) w.spin += w.spinVel * dt;
    this.scrape = Math.max(this.scrape * 0.9, Math.min(1, scrapeAmt * 3));
  }

  solveGround(world, dt) {
    const R = this.quat;
    let scr = 0;
    for (const c of this.corners) {
      const p = _gp.copy(c).applyQuaternion(R).add(this.pos);
      const gy = world.groundAt(p.x, p.z, p.y + 0.5, _gn);
      const depth = gy - p.y;
      if (depth <= 0) continue;
      const n = _gnrm.set(_gn.x, _gn.y, _gn.z);
      const pv = this.pointVel(p, _gpv);
      const vn = pv.dot(n);
      // position correction
      this.pos.addScaledVector(n, Math.min(depth, 0.3) * 0.25);
      if (vn < 0) {
        const k = this.invMassAt(p, n);
        const j = -(1 + 0.05) * vn / k;
        const J = _jv.copy(n).multiplyScalar(j);
        // friction (low: bodywork slides, it doesn't anchor the car)
        const vt = _vt.copy(pv).addScaledVector(n, -vn);
        const vtl = vt.length();
        if (vtl > 1e-3) {
          const jt = Math.min(0.2 * j, vtl / Math.max(1e-6, this.invMassAt(p, _vt2.copy(vt).divideScalar(vtl))));
          J.addScaledVector(vt, -jt / vtl);
          scr += vtl;
        }
        this.applyImpulse(J, p);
        if (-vn > 4) this.events.push({ type: 'impact', strength: Math.min(1, -vn / 14), kind: 'ground', point: p.clone() });
      }
    }
    if (scr > 0) this.scrape = Math.max(this.scrape, Math.min(1, scr / 12));
  }

  // 2D OBB (car footprint) vs static colliders
  solveStatic(world, dt) {
    const cols = world.colliders.query(this.pos.x, this.pos.z, this.boxHalf.z + 2, _cand);
    if (!cols.length) return;
    const fw = this.forward(_fw);
    let fx = fw.x, fz = fw.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    // car local axes in XZ: right = (-fz, fx)?  right = forward x up => (fx,0,fz)x(0,1,0) = (-fz, 0, fx)
    const rx = -fz, rz = fx;
    const hx = this.boxHalf.x, hz = this.boxHalf.z;
    const cx = this.pos.x + this.boxCenter.z * 0 , cz = this.pos.z;
    const yLo = this.pos.y - 0.4, yHi = this.pos.y + this.boxHalf.y * 1.4;
    for (const c of cols) {
      if (yHi < c.yMin || yLo > c.yMax) continue;
      if (c.kind === 'rail' && this.pos.y > c.yMax + 0.2) continue;
      if (c.broken || c.converting) continue;
      // SAT with 4 axes
      const axes = [[rx, rz], [fx, fz], [c.c, -c.s], [c.s, c.c]];
      let best = Infinity, bn = null;
      let sep = false;
      const dx = c.x - cx, dz = c.z - cz;
      for (const [ax, az] of axes) {
        const ra = Math.abs(rx * ax + rz * az) * hx + Math.abs(fx * ax + fz * az) * hz;
        const rb = Math.abs(c.c * ax - c.s * az) * c.hx + Math.abs(c.s * ax + c.c * az) * c.hz;
        const d = dx * ax + dz * az;
        const o = ra + rb - Math.abs(d);
        if (o <= 0) { sep = true; break; }
        if (o < best) { best = o; bn = [d > 0 ? -ax : ax, d > 0 ? -az : az]; }
      }
      if (sep) continue;
      // light street furniture gets knocked over instead of stopping the car dead
      if (c.breakable && this.speed > 4.5) { c.broken = true; this.events.push({ type: 'break', collider: c, speed: this.speed, dir: [this.vel.x, this.vel.z] }); this.vel.multiplyScalar(0.94); continue; }
      // parked cars: let the game swap in a real physics car (handled synchronously via the event)
      if (c.kind === 'parked' && this.speed > (this.isPlayer ? 2.5 : 9)) { c.converting = true; this.events.push({ type: 'parked', collider: c, speed: this.speed }); continue; }
      // contact point: car corner deepest along -n, else centre offset
      const nx = bn[0], nz = bn[1];
      let px = cx, pz = cz, minD = Infinity;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const qx = cx + rx * hx * sx + fx * hz * sz, qz = cz + rz * hx * sx + fz * hz * sz;
        const dd = qx * nx + qz * nz;
        if (dd < minD) { minD = dd; px = qx; pz = qz; }
      }
      const P = _cp.set(px, this.pos.y, pz);
      const n = _cn.set(nx, 0, nz);
      this.pos.x += nx * best * 0.9; this.pos.z += nz * best * 0.9;
      const pv = this.pointVel(P, _spv);
      const vn = pv.dot(n);
      if (vn < 0) {
        const k = this.invMassAt(P, n);
        const e = c.kind === 'rail' ? 0.1 : 0.22;
        const j = -(1 + e) * vn / k;
        const J = _jv.copy(n).multiplyScalar(j);
        const vt = _vt.copy(pv).addScaledVector(n, -vn); vt.y = 0;
        const vtl = vt.length();
        if (vtl > 1e-3) { const jt = Math.min(0.3 * j, vtl / Math.max(1e-6, this.invMassAt(P, _vt2.copy(vt).divideScalar(vtl)))); J.addScaledVector(vt, -jt / vtl); }
        this.applyImpulse(J, P);
        if (-vn > 1.5) this.events.push({ type: 'impact', strength: Math.min(1, -vn / 22), kind: c.kind || 'wall', point: P.clone(), collider: c, speed: -vn });
        // don't climb walls: kill upward spin from side hits
        this.angVel.x *= 0.9; this.angVel.z *= 0.9;
      }
    }
  }
}
const _accF = new THREE.Vector3(), _accT = new THREE.Vector3(), _jv = new THREE.Vector3(), _vt = new THREE.Vector3(), _vt2 = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _ai1 = new THREE.Vector3(), _ai2 = new THREE.Vector3(), _ia1 = new THREE.Vector3(), _ia2 = new THREE.Vector3(), _ia3 = new THREE.Vector3();
const _gp = new THREE.Vector3(), _gnrm = new THREE.Vector3(), _gpv = new THREE.Vector3(), _spv = new THREE.Vector3();
const _cp = new THREE.Vector3(), _cn = new THREE.Vector3(), _cand = [];

// ------------------------------------------------------------------ car vs car (2D OBB SAT, impulse)
const _pa = new THREE.Vector3(), _na = new THREE.Vector3(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _J = new THREE.Vector3();
export function collideCars(A, B) {
  const dy = Math.abs(A.pos.y - B.pos.y);
  if (dy > 2.2) return null;
  const faw = A.forward(_v), fax0 = _v.x, faz0 = _v.z; const la = Math.hypot(fax0, faz0) || 1; const fax = fax0 / la, faz = faz0 / la;
  const fbw = B.forward(_v2), fbx0 = _v2.x, fbz0 = _v2.z; const lb = Math.hypot(fbx0, fbz0) || 1; const fbx = fbx0 / lb, fbz = fbz0 / lb;
  void faw; void fbw;
  const rax = -faz, raz = fax, rbx = -fbz, rbz = fbx;
  const ha = A.boxHalf, hb = B.boxHalf;
  const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
  if (dx * dx + dz * dz > (ha.z + hb.z + 1) ** 2) return null;
  const axes = [[rax, raz], [fax, faz], [rbx, rbz], [fbx, fbz]];
  let best = Infinity, bn = null;
  for (const [ax, az] of axes) {
    const ra = Math.abs(rax * ax + raz * az) * ha.x + Math.abs(fax * ax + faz * az) * ha.z;
    const rb = Math.abs(rbx * ax + rbz * az) * hb.x + Math.abs(fbx * ax + fbz * az) * hb.z;
    const d = dx * ax + dz * az, o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; bn = [d > 0 ? ax : -ax, d > 0 ? az : -az]; } // normal from A to B
  }
  const nx = bn[0], nz = bn[1];
  // contact point: deepest corner of B along -n (or of A along +n), pick the one inside the other box
  let px = 0, pz = 0, minD = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const qx = B.pos.x + rbx * hb.x * sx + fbx * hb.z * sz, qz = B.pos.z + rbz * hb.x * sx + fbz * hb.z * sz;
    const d = qx * nx + qz * nz; if (d < minD) { minD = d; px = qx; pz = qz; }
  }
  const P = _pa.set(px, (A.pos.y + B.pos.y) / 2, pz);
  const n = _na.set(nx, 0, nz);
  const ma = A.kinematic ? 0 : A.invMass, mb = B.kinematic ? 0 : B.invMass;
  const tot = ma + mb || 1;
  A.pos.x -= nx * best * (ma / tot); A.pos.z -= nz * best * (ma / tot);
  B.pos.x += nx * best * (mb / tot); B.pos.z += nz * best * (mb / tot);
  const va = A.pointVel(P, _va), vb = B.pointVel(P, _vb);
  const vrel = vb.sub(va).dot(n);
  if (vrel >= 0) return { strength: 0 };
  const ka = A.kinematic ? 0 : A.invMassAt(P, n), kb = B.kinematic ? 0 : B.invMassAt(P, n);
  const j = -(1 + 0.25) * vrel / (ka + kb || 1);
  _J.copy(n).multiplyScalar(j);
  if (!B.kinematic) B.applyImpulse(_J, P);
  _J.negate();
  if (!A.kinematic) A.applyImpulse(_J, P);
  return { strength: Math.min(1, -vrel / 20), speed: -vrel, point: P.clone() };
}
