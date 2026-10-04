// HILLBOMB: a light Verlet ragdoll for the realistic humans (knocked down by cars, shoves, carjack ejections).
// 18 particles (pelvis, hips, knees, ankles, toes, chest, neck, head, shoulders, elbows, wrists) with distance
// constraints (stiff torso blocks joined by a slightly soft spine, limb segments, anti-fold limits, knees / elbows
// bend the right way), gravity, a sloped ground plane with friction. The 34 bone rotations are rebuilt every step
// from the particles as rotations relative to the pose at the moment of impact (swing chains: no limb twist), so the
// ragdoll starts exactly from the animated pose and the skinning stays clean.
// World space throughout; the owner converts the bone world rotations into its rig space.
import * as THREE from 'three';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// particle -> bone whose world position seeds it
const PB = ['Pelvis', 'LThigh', 'RThigh', 'LCalf', 'RCalf', 'LFoot', 'RFoot', 'LToe0', 'RToe0', 'Spine2', 'Neck', 'Head',
  'LUpperArm', 'RUpperArm', 'LForearm', 'RForearm', 'LHand', 'RHand'];
const [PEL, HL, HR, KL, KR, AL, AR, TL, TR, CH, NK, HD, SL, SR, EL, ER, WL, WR] = PB.map((_, i) => i);
const RAD = [0.11, 0.08, 0.08, 0.06, 0.06, 0.05, 0.05, 0.03, 0.03, 0.12, 0.07, 0.1, 0.07, 0.07, 0.05, 0.05, 0.04, 0.04];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

function frameQuat(right, up, out) {
  // orthonormal frame from a right vector and a rough up vector -> quaternion (columns: right, up, back)
  _a.copy(right).normalize();
  _c.crossVectors(_a, up).normalize();          // back = right x up
  _b.crossVectors(_c, _a);                      // up' = back x right
  _m.makeBasis(_a, _b, _c);
  return out.setFromRotationMatrix(_m);
}

export class Ragdoll {
  /** BN: bone name -> index, PAR: parent indices, nb: bone count */
  constructor(BN, PAR, nb) {
    this.BN = BN; this.PAR = PAR; this.nb = nb;
    this.n = PB.length;
    this.x = new Float32Array(this.n * 3); this.p = new Float32Array(this.n * 3);
    this.q0 = new Float32Array(nb * 4);           // bone world rotations at impact
    this.W = new Float32Array(nb * 4);            // current bone world rotations
    this.d0 = {};                                 // rest directions (world, at impact)
    this.sticks = [];
    this.t = 0; this.still = 0; this.settled = false; this.acc = 0;
    this.pelvisQ0 = new THREE.Quaternion(); this.chestQ0 = new THREE.Quaternion();
    this.g = { y: 0, gx: 0, gz: 0, x: 0, z: 0 };
  }

  /** WQ/WP: bone world rotations (quats) / positions (world metres) at the impact pose; vel: {x,y,z} m/s */
  start(WQ, WP, vel, spin = 0) {
    const BN = this.BN, x = this.x, p = this.p;
    this.q0.set(WQ);
    let ymin = 1e9;
    for (let i = 0; i < this.n; i++) ymin = Math.min(ymin, WP[BN[PB[i]] * 3 + 1]);
    for (let i = 0; i < this.n; i++) {
      const b = BN[PB[i]];
      x[i * 3] = WP[b * 3]; x[i * 3 + 1] = WP[b * 3 + 1]; x[i * 3 + 2] = WP[b * 3 + 2];
    }
    // the head particle sits ~12 cm above the head bone (crown), along the head's up axis
    const hb = BN.Head * 3;   // (head bone axes are arbitrary: use the neck -> head direction)
    _a.set(WP[hb] - WP[BN.Neck * 3], WP[hb + 1] - WP[BN.Neck * 3 + 1], WP[hb + 2] - WP[BN.Neck * 3 + 2]).normalize().multiplyScalar(0.12);
    x[HD * 3] += _a.x; x[HD * 3 + 1] += _a.y; x[HD * 3 + 2] += _a.z;
    // initial velocity: legs swept harder than the upper body (a bumper hits below the hips -> the body pitches over)
    const dt = 1 / 90;
    for (let i = 0; i < this.n; i++) {
      const h = x[i * 3 + 1] - ymin, low = clamp(1.2 - h * 0.45, 0.55, 1.2);
      const sx = spin * (h - 0.9) * 0.6;
      p[i * 3] = x[i * 3] - (vel.x * low + sx * -vel.z * 0.1) * dt;
      p[i * 3 + 1] = x[i * 3 + 1] - vel.y * (0.8 + h * 0.15) * dt;
      p[i * 3 + 2] = x[i * 3 + 2] - (vel.z * low + sx * vel.x * 0.1) * dt;
    }
    // limbs flail: random kicks on elbows / wrists / knees / ankles (scaled by the impact speed)
    const kick = clamp(Math.hypot(vel.x, vel.y, vel.z) * 0.35, 0.8, 3.2);
    for (const i of [EL, ER, WL, WR, KL, KR, AL, AR, HD]) {
      const m = i === WL || i === WR ? 1.4 : i === HD ? 0.5 : 1;
      p[i * 3] -= (Math.random() * 2 - 1) * kick * m * dt; p[i * 3 + 1] -= (Math.random() * 2 - 1) * kick * m * dt; p[i * 3 + 2] -= (Math.random() * 2 - 1) * kick * m * dt;
    }
    // constraints from the impact pose
    const S = this.sticks = [];
    const len = (a, b) => Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
    const st = (a, b, k = 1, min = 0) => S.push([a, b, len(a, b), k, min]);
    const group = (g, k) => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) st(g[i], g[j], k); };
    group([PEL, HL, HR, CH], 1);
    group([CH, NK, SL, SR], 1);
    st(HL, SL, 0.25); st(HR, SR, 0.25); st(PEL, NK, 0.4);
    st(NK, HD, 1); st(CH, HD, 0.6);
    for (const [h, k, a, t] of [[HL, KL, AL, TL], [HR, KR, AR, TR]]) { st(h, k); st(k, a); st(a, t); st(k, t, 0.8); S.push([h, a, 0, 0, (len(h, k) + len(k, a)) * 0.55]); }
    for (const [s, e, w] of [[SL, EL, WL], [SR, ER, WR]]) { st(s, e); st(e, w); S.push([s, w, 0, 0, (len(s, e) + len(e, w)) * 0.35]); }
    // rest frames for the bone rotations
    this.pelF0 = this._pelvisFrame(new THREE.Quaternion());
    this.chF0 = this._chestFrame(new THREE.Quaternion());
    const dir = (a, b) => new THREE.Vector3(x[b * 3] - x[a * 3], x[b * 3 + 1] - x[a * 3 + 1], x[b * 3 + 2] - x[a * 3 + 2]).normalize();
    this.d0 = { nk: dir(NK, HD), uaL: dir(SL, EL), uaR: dir(SR, ER), faL: dir(EL, WL), faR: dir(ER, WR),
      thL: dir(HL, KL), thR: dir(HR, KR), shL: dir(KL, AL), shR: dir(KR, AR), ftL: dir(AL, TL), ftR: dir(AR, TR) };
    this.t = 0; this.still = 0; this.settled = false; this.acc = 0;
    this._bones();
  }

  _v(i, out) { return out.set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]); }
  _pelvisFrame(out) {
    this._v(HR, _d).sub(this._v(HL, _b));
    const up = this._v(CH, new THREE.Vector3()).sub(this._v(PEL, _b));
    return frameQuat(_d, up, out);
  }
  _chestFrame(out) {
    this._v(SR, _d).sub(this._v(SL, _b));
    const up = this._v(NK, new THREE.Vector3()).sub(this._v(CH, _b));
    return frameQuat(_d, up, out);
  }

  /** ground: { y, gx, gz, x, z } plane through (x, y, z) with slope gx, gz; follow: optional {x, z, k} xz attractor */
  step(dt, ground, follow) {
    if (ground) Object.assign(this.g, ground);
    this.acc += Math.min(dt, 0.25);
    const h = 1 / 90;
    let n = 0;
    while (this.acc >= h && n < 8) { this._sub(h, follow); this.acc -= h; n++; }
    if (n === 8) this.acc = 0;
    this.t += dt;
    this._bones();
  }

  _sub(h, follow) {
    const x = this.x, p = this.p, N = this.n, G = this.g;
    let ke = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      const vx = (x[k] - p[k]) * 0.998, vy = (x[k + 1] - p[k + 1]) * 0.998, vz = (x[k + 2] - p[k + 2]) * 0.998;
      p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2];
      x[k] += vx; x[k + 1] += vy - 9.8 * h * h; x[k + 2] += vz;
      ke += vx * vx + vy * vy + vz * vz;
    }
    const S = this.sticks;
    for (let it = 0; it < 6; it++) {
      for (const s of S) {
        const a = s[0] * 3, b = s[1] * 3;
        const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let tgt = s[2];
        if (s[3] === 0) { if (d >= s[4]) continue; tgt = s[4]; }     // inequality: keep at least min apart
        const f = (d - tgt) / d * 0.5 * (s[3] || 1);
        x[a] += dx * f; x[a + 1] += dy * f; x[a + 2] += dz * f;
        x[b] -= dx * f; x[b + 1] -= dy * f; x[b + 2] -= dz * f;
      }
      this._hinges();
      // ground
      for (let i = 0; i < N; i++) {
        const k = i * 3, gy = G.y + G.gx * (x[k] - G.x) + G.gz * (x[k + 2] - G.z) + RAD[i];
        if (x[k + 1] < gy) {
          x[k + 1] = gy;
          if (it === 5) {   // friction once per sub-step: kill most of the sliding velocity
            p[k] += (x[k] - p[k]) * 0.35; p[k + 2] += (x[k + 2] - p[k + 2]) * 0.35;
            if (p[k + 1] < x[k + 1] - 0.02) p[k + 1] = x[k + 1] - 0.02;
          }
        }
      }
    }
    // keep the body with the owner's (wall-aware) tumble position
    if (follow) {
      const dx = (follow.x - x[0]) * follow.k, dz = (follow.z - x[2]) * follow.k;
      for (let i = 0; i < N; i++) { x[i * 3] += dx; x[i * 3 + 2] += dz; p[i * 3] += dx; p[i * 3 + 2] += dz; }
    }
    const v = Math.sqrt(ke / N) / h;
    this.still = v < 0.35 ? this.still + h : 0;
    if (this.still > 0.35 && this.t > 0.6) this.settled = true;
  }

  // knees bend forward, elbows backward (reflect a joint that flipped through the limb line)
  _hinges() {
    const x = this.x;
    this._v(HR, _a).sub(this._v(HL, _b));
    const up = this._v(CH, _c).sub(this._v(PEL, _b));
    const fwd = _d.crossVectors(up, _a).normalize();      // up x right = forward
    const fix = (a, j, c, sgn) => {
      const mx = (x[a * 3] + x[c * 3]) / 2, my = (x[a * 3 + 1] + x[c * 3 + 1]) / 2, mz = (x[a * 3 + 2] + x[c * 3 + 2]) / 2;
      const ox = x[j * 3] - mx, oy = x[j * 3 + 1] - my, oz = x[j * 3 + 2] - mz;
      const dd = (ox * fwd.x + oy * fwd.y + oz * fwd.z) * sgn;
      if (dd < 0) { x[j * 3] -= 2 * dd * sgn * fwd.x; x[j * 3 + 1] -= 2 * dd * sgn * fwd.y; x[j * 3 + 2] -= 2 * dd * sgn * fwd.z; }
    };
    fix(HL, KL, AL, 1); fix(HR, KR, AR, 1);
    fix(SL, EL, WL, -1); fix(SR, ER, WR, -1);
  }

  /** rebuild the bone world rotations (this.W) from the particles */
  _bones() {
    const BN = this.BN, W = this.W, q0 = this.q0, nb = this.nb, PAR = this.PAR;
    const dP = this._pelvisFrame(new THREE.Quaternion()).multiply(_q.copy(this.pelF0).invert());
    const dC = this._chestFrame(new THREE.Quaternion()).multiply(_q.copy(this.chF0).invert());
    const D = new Array(nb);
    const swing = (parentD, d0, a, b) => {
      _a.copy(d0).applyQuaternion(parentD);
      this._v(b, _b).sub(this._v(a, _c)).normalize();
      return new THREE.Quaternion().setFromUnitVectors(_a, _b).multiply(parentD);
    };
    const set = (name, d) => { D[BN[name]] = d; };
    set('Pelvis', dP);
    set('Spine', dP.clone().slerp(dC, 0.33)); set('Spine1', dP.clone().slerp(dC, 0.66)); set('Spine2', dC);
    set('LClavicle', dC); set('RClavicle', dC);
    const dn = swing(dC, this.d0.nk, NK, HD); set('Neck', dC.clone().slerp(dn, 0.5)); set('Head', dn);
    for (const [s, d0u, d0f, sh, el, wr] of [['L', this.d0.uaL, this.d0.faL, SL, EL, WL], ['R', this.d0.uaR, this.d0.faR, SR, ER, WR]]) {
      const du = swing(dC, d0u, sh, el), df = swing(du, d0f, el, wr);
      set(s + 'UpperArm', du); set(s + 'Forearm', df); set(s + 'Hand', df);
    }
    for (const [s, d0t, d0s, d0f, hp, kn, an, to] of [['L', this.d0.thL, this.d0.shL, this.d0.ftL, HL, KL, AL, TL], ['R', this.d0.thR, this.d0.shR, this.d0.ftR, HR, KR, AR, TR]]) {
      const dt = swing(dP, d0t, hp, kn), ds = swing(dt, d0s, kn, an), df = swing(ds, d0f, an, to);
      set(s + 'Thigh', dt); set(s + 'Calf', ds); set(s + 'Foot', df); set(s + 'Toe0', df);
    }
    for (let b = 0; b < nb; b++) {
      let d = D[b];
      if (!d) { let p = PAR[b]; while (p >= 0 && !D[p]) p = PAR[p]; d = D[b] = p >= 0 ? D[p] : dP; }   // fingers follow the hand
      _q2.fromArray(q0, b * 4); _q.copy(d).multiply(_q2); _q.toArray(W, b * 4);
    }
  }

  pelvis(out) { return this._v(PEL, out); }
  head(out) { return this._v(HD, out); }
  /** facing up (lying on the back)? chest forward vector .y > 0 */
  onBack() {
    this._v(SR, _a).sub(this._v(SL, _b));
    const up = this._v(NK, _c).sub(this._v(CH, _b));
    return _d.crossVectors(up, _a).y > 0;
  }
}
