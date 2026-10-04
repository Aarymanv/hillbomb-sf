// Fixed-step vehicle simulation (120 Hz) with car-vs-car contacts and sleeping.
import { collideCars } from './physics.js';

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
    while (this.acc >= this.h) {
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
    const alpha = this.acc / this.h;
    for (const v of V) v.body.alpha = alpha;
    if (this.lastHit.size > 2000) this.lastHit.clear();
  }
}
