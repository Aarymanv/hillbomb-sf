// Fixed-step vehicle simulation (120 Hz) with car-vs-car contacts and sleeping.
import { collideCars } from './physics.js';
import { PERF } from '../render/perfflags.js';

export class Sim {
  constructor(world) {
    this.world = world; this.vehicles = []; this.acc = 0; this.h = 1 / 120; this.time = 0; this.lastHit = new Map();
    this.onCarHit = null;      // (a, b, info) callback
    this.onEvent = null;       // (vehicle, event)
    this.onPreStep = null;     // () before every step (fresh player gamepad input)
  }
  add(v) { if (!this.vehicles.includes(v)) this.vehicles.push(v); v.body.sleeping = false; v.sleepT = 0; }
  remove(v) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); }
  step(dt) {
    this.acc = Math.min(this.acc + dt, this.h * 8);
    const V = this.vehicles;
    // (perf r3) catch-up smoothing: one slow frame (a 40 ms frame = 5 steps at 120 Hz) used to run all its steps at once,
    // making the next frame slow too. Steps per frame are capped at the recent need (EMA of dt / h, rounded up, >= 2):
    // the rest stays in the accumulator (<= 8 steps, as before) and is worked off over the next frames, so the sim keeps
    // real time on average and the extra cost of a spike is spread. Interpolation shows the latest state while behind.
    // ?nosimsmooth = every due step in the same frame.
    let cap = Infinity;
    if (PERF.simsmooth && dt > 0) { this.need = this.need === undefined ? dt / this.h : this.need + (dt / this.h - this.need) * 0.1; cap = Math.max(2, Math.ceil(this.need - 0.05)); }
    let n = 0;
    while (this.acc >= this.h && n++ < cap) {
      this.onPreStep?.();
      for (const v of V) {
        const b = v.body;
        if (b.sleeping || b.kinematic) { b.interp = false; continue; }
        // render interpolation: state before the latest step (cars.js sync blends by alpha = acc / h)
        b.prevPos.copy(b.pos); b.prevQuat.copy(b.quat); b.interp = true;
        b.step(this.h, this.world, v.input);
        for (const e of b.events) this.onEvent?.(v, e);
        // sleep parked cars
        if (!v.driver && b.speed < 0.15 && b.angVel.lengthSq() < 0.01 && b.grounded >= 3) { v.sleepT = (v.sleepT || 0) + this.h; if (v.sleepT > 1.5) b.sleeping = true; }
        else v.sleepT = 0;
      }
      for (let i = 0; i < V.length; i++) {
        const A = V[i];
        for (let j = i + 1; j < V.length; j++) {
          const B = V[j];
          if (A.body.sleeping && B.body.sleeping) continue;
          const dx = A.body.pos.x - B.body.pos.x, dz = A.body.pos.z - B.body.pos.z;
          if (dx * dx + dz * dz > 100) continue;
          const hit = collideCars(A.body, B.body);
          if (hit && hit.strength > 0) {
            if (A.body.sleeping) A.body.sleeping = false;
            if (B.body.sleeping) B.body.sleeping = false;
            // only real impacts are reported (resting / scraping contact is resolved silently)
            const now = this.time || 0;
            const key = A.uid < B.uid ? A.uid * 100000 + B.uid : B.uid * 100000 + A.uid;
            const last = this.lastHit.get(key) ?? -9;
            if (hit.speed > 1.8 && now - last > 0.25) { this.lastHit.set(key, now); this.onCarHit?.(A, B, hit); }
          }
        }
      }
      this.acc -= this.h; this.time += this.h;
    }
    const alpha = Math.min(1, this.acc / this.h);
    for (const v of V) v.body.alpha = alpha;
    if (this.lastHit.size > 2000) this.lastHit.clear();
  }
}
