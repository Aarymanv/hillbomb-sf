// Drift scoring shared by drift events, drift zones and story missions: slip angle x speed, a combo multiplier that
// grows while the drift is held, banking after a short pause, and a lost combo on any real impact.
import * as THREE from 'three';
const _f = new THREE.Vector3();
export function createDriftMeter() {
  const D = { total: 0, combo: 0, mult: 1, held: 0, idle: 0, angle: 0, active: false, lost: 0, best: 0, frame: 0 };
  D.reset = () => { D.total = 0; D.combo = 0; D.mult = 1; D.held = 0; D.idle = 0; D.active = false; D.lost = 0; D.best = 0; };
  D.lose = () => { if (D.combo > 0) { D.lost += D.combo * D.mult; D.combo = 0; D.mult = 1; D.held = 0; D.active = false; return true; } return false; };
  D.bank = () => { const v = Math.round(D.combo * D.mult); D.total += v; if (v > D.best) D.best = v; D.combo = 0; D.mult = 1; D.held = 0; D.active = false; return v; };
  D.score = () => Math.round(D.total + D.combo * D.mult);
  // returns points added this frame (before multiplier)
  D.update = function (dt, v) {
    D.frame = 0;
    if (!v) return 0;
    const b = v.body;
    b.forward(_f);
    const sp = Math.hypot(b.vel.x, b.vel.z);
    let ang = 0;
    if (sp > 7 && b.grounded >= 2) {
      const fl = Math.hypot(_f.x, _f.z) || 1;
      ang = Math.acos(Math.min(1, Math.max(-1, (_f.x * b.vel.x + _f.z * b.vel.z) / (fl * sp))));
    }
    D.angle = ang;
    const deg = ang * 57.2958;
    if (deg > 11 && deg < 115 && b.fwdSpeed > 4) {
      const pts = deg * sp * 1.25 * dt;
      D.combo += pts; D.frame = pts; D.held += dt; D.idle = 0; D.active = true;
      D.mult = 1 + Math.min(4, D.held / 2.2);
    } else if (D.active) {
      D.idle += dt;
      if (D.idle > 1.3) D.bank();
    }
    return D.frame;
  };
  return D;
}
