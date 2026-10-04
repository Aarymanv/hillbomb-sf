// Vehicle lab: drives the REAL physics (CarBody from physics.js) on a flat test pad, headless. Used to validate the
// performance model in tuning.js and the PI ordering. Runs in Node (tools in the report) and in dev/cars.html?lab.
//   runStraight: 0-100, 0-160, 0-200, top speed        runBrake: 100-0 km/h distance
//   runSkidpad:  max steady lateral g on a 60 m circle  runLap:   adaptive driver, best clean lap on a test circuit
import * as THREE from 'three';
import { CarBody } from '../../vehicle/physics.js';
const _up = new THREE.Vector3();

const H = 1 / 120;
export const flatWorld = {
  groundAt(x, z, y, out) { if (out) { out.x = 0; out.y = 1; out.z = 0; out.surface = 1; out.deck = null; } return 0; },
  colliders: { query() { return []; } },
};
function mkBody(P, spec) {
  const b = new CarBody(spec, P);
  b.place(0, 0.3, 0, 0);
  const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, autoReverse: false, reverse: false };
  for (let i = 0; i < 120; i++) b.step(H, flatWorld, inp);
  return { b, inp };
}

export function runStraight(P, spec, tMax = 80) {
  const { b, inp } = mkBody(P, spec);
  inp.throttle = 1;
  let t = 0, t100 = null, t160 = null, t200 = null, vmax = 0, lastGain = 0, x = 0;
  const q = { q400: null };
  while (t < tMax) {
    b.step(H, flatWorld, inp); t += H;
    const kmh = b.fwdSpeed * 3.6; x += b.fwdSpeed * H;
    if (t100 === null && kmh >= 100) t100 = t;
    if (t160 === null && kmh >= 160) t160 = t;
    if (t200 === null && kmh >= 200) t200 = t;
    if (q.q400 === null && x >= 402.3) q.q400 = t;
    if (kmh > vmax + 0.05) { vmax = kmh; lastGain = t; }
    if (t - lastGain > 5) break;
  }
  return { t100, t160, t200, vmax, q400: q.q400 };
}

export function runBrake(P, spec) {
  const { b, inp } = mkBody(P, spec);
  inp.throttle = 1;
  let t = 0;
  while (b.fwdSpeed * 3.6 < 103 && t < 40) { b.step(H, flatWorld, inp); t += H; }
  if (b.fwdSpeed * 3.6 < 100) return null;
  inp.throttle = 0; inp.brake = 1;
  let x = 0, started = false;
  for (let i = 0; i < 120 * 12; i++) {
    const v = b.fwdSpeed;
    if (!started && v * 3.6 <= 100) started = true;
    b.step(H, flatWorld, inp);
    if (started) x += Math.max(0, (v + b.fwdSpeed) / 2) * H;
    if (b.fwdSpeed < 0.1) break;
  }
  return x;
}

/** hold a circle of radius R at slowly rising speed; returns the best sustained lateral g */
export function runSkidpad(P, spec, R = 60) {
  const { b, inp } = mkBody(P, spec);
  // start on the circle centred at (R, 0): car at origin facing -Z, turning right (+x)
  let vT = 8, best = 0, ok = 0, t = 0;
  const L = spec.axleRZ - spec.axleFZ;
  while (t < 120) {
    const px = b.pos.x, pz = b.pos.z;
    const rx = px - R, rz = pz, rr = Math.hypot(rx, rz) || 1;
    const err = rr - R;
    // tangent direction for clockwise motion seen from above (turning right) and a look-ahead point
    const ang = Math.atan2(rz, rx), look = Math.max(6, b.speed * 0.5) / R;
    const tx = R + R * Math.cos(ang + look), tz = R * Math.sin(ang + look);
    const steer = pursuit(b, spec, tx, tz, L);
    inp.steer = steer;
    const v = b.speed;
    inp.throttle = v < vT ? Math.min(1, (vT - v) * 0.6 + 0.25) : 0.12;
    inp.brake = v > vT + 1.5 ? 0.3 : 0;
    b.step(H, flatWorld, inp); t += H;
    if (Math.abs(err) < 1.5) { ok += H; if (ok > 1.2) { best = Math.max(best, v * v / R / 9.81); vT += 0.05; } }
    else { ok = 0; if (Math.abs(err) > 6) break; }
    if (b.up(_up).y < 0.5) break;
  }
  return best;
}
// pure pursuit steering command (-1..1, + = right) toward world point (tx, tz)
function pursuit(b, spec, tx, tz, L) {
  const q = b.quat;
  // body forward/right in world (XZ)
  const fx = -(2 * (q.x * q.z + q.w * q.y)), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  const rx = -fz, rz = fx;
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
  const d2 = lf * lf + lr * lr;
  const kappa = 2 * lr / Math.max(1, d2);
  const delta = Math.atan(kappa * L);
  const vs = Math.abs(b.fwdSpeed), maxA = b.maxSteer / (1 + vs / (b.P.steerSpeed ?? 26));
  return Math.max(-1, Math.min(1, delta / Math.max(0.02, maxA)));
}

// ------------------------------------------------------------------ test circuit
// A ~4 km flat street circuit, deliberately different from the PI reference track in tuning.js: corners are polygon
// vertices with fillet radii (m), so the loop always closes. [x, z, radius]
export const TEST_ROUTE = [
  [0, 0, 22], [0, -620, 30], [320, -620, 14], [320, -420, 16], [520, -420, 70], [760, -760, 40], [1180, -760, 110],
  [1180, -240, 26], [900, 60, 150], [420, 60, 18], [420, 300, 18], [140, 300, 45],
];
export function routePoints(verts = TEST_ROUTE, ds = 2) {
  const n = verts.length, segs = [];
  // fillet each corner: tangent points at distance r*tan(theta/2) from the vertex
  const V = verts.map(([x, z, r], i) => {
    const a = verts[(i - 1 + n) % n], b = verts[(i + 1) % n];
    let ux = a[0] - x, uz = a[1] - z, vx = b[0] - x, vz = b[1] - z;
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz); ux /= lu; uz /= lu; vx /= lv; vz /= lv;
    const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz))); // interior angle
    const turn = Math.PI - th, d = r * Math.tan(turn / 2);
    const cross = (-ux) * vz - (-uz) * vx; // incoming dir = -u, outgoing = v; >0 = right turn in +X east/+Z south frame? sign kept as data
    return { p0: [x + ux * d, z + uz * d], p1: [x + vx * d, z + vz * d], r, turn, sgn: Math.sign(cross) || 1, din: [-ux, -uz] };
  });
  for (let i = 0; i < n; i++) {
    const c = V[i], nx = V[(i + 1) % n];
    segs.push({ arc: c });
    segs.push({ line: [c.p1, nx.p0] });
  }
  const pts = [];
  for (const s of segs) {
    if (s.line) {
      const [a, b] = s.line, L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / ds));
      for (let i = 0; i < k; i++) pts.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k, 0]);
    } else {
      const c = s.arc, L = c.r * c.turn, k = Math.max(1, Math.round(L / ds));
      // walk the arc by rotating the heading
      let x = c.p0[0], z = c.p0[1], hx = c.din[0], hz = c.din[1];
      const dth = c.turn / k * c.sgn, step = L / k;
      for (let i = 0; i < k; i++) {
        pts.push([x, z, 1 / c.r]);
        const ca = Math.cos(dth / 2), sa = Math.sin(dth / 2);
        const mx = hx * ca - hz * sa, mz = hx * sa + hz * ca;
        x += mx * step; z += mz * step;
        const cb = Math.cos(dth), sb = Math.sin(dth); const nhx = hx * cb - hz * sb, nhz = hx * sb + hz * cb; hx = nhx; hz = nhz;
      }
    }
  }
  let len = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return { pts, length: len };
}

/** one lap with a driver that plans speed from curvature with lateral budget aLat and braking budget aBrk */
export function lapOnce(P, spec, route, aLat, aBrk, { width = 7, budget = null, onStep = null } = {}) {
  const { pts } = route;
  const N = pts.length, ds = 2;
  // speed plan (budget[i] scales the lateral budget per point: the driver's local confidence)
  const vLim = pts.map((p, i) => (p[2] > 0 ? Math.sqrt(aLat * (budget ? budget[i] : 1) / p[2]) : 150));
  const plan = vLim.slice();
  for (let k = 0; k < 2; k++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; plan[i] = Math.min(plan[i], Math.sqrt(plan[j] * plan[j] + 2 * aBrk * ds)); }
  const { b, inp } = mkBody(P, spec);
  // put the car on the first point facing along the route
  const yaw = Math.atan2(-(pts[1][0] - pts[0][0]), -(pts[1][1] - pts[0][1]));
  b.place(pts[0][0], 0.3, pts[0][1], yaw);
  for (let i = 0; i < 60; i++) b.step(H, flatWorld, inp);
  const L = spec.axleRZ - spec.axleFZ;
  let idx = 0, t = 0, laps = 0, lapStart = null, maxErr = 0, tc = 1;
  const findIdx = () => { let best = idx, bd = Infinity; for (let k = -3; k < 40; k++) { const j = (idx + k + N) % N, dx = pts[j][0] - b.pos.x, dz = pts[j][1] - b.pos.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } } return { best, d: Math.sqrt(bd) }; };
  while (t < 900) {
    const f = findIdx();
    if (f.best < idx && idx > N - 50 && f.best < 50) { laps++; if (laps === 1) lapStart = t; else return { time: t - lapStart, maxErr }; }
    idx = f.best;
    if (laps >= 1) maxErr = Math.max(maxErr, f.d);
    if (f.d > width) return { time: null, maxErr: f.d, off: true, at: idx };
    // Stanley-style tracking + curvature feed-forward (steer angle in rad, + = right)
    const p0 = pts[idx], p1 = pts[(idx + 1) % N], pa = pts[(idx + 3) % N], pb = pts[(idx + 5) % N];
    let tx = p1[0] - p0[0], tz = p1[1] - p0[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx; // right of travel
    const eLat = (b.pos.x - p0[0]) * nx + (b.pos.z - p0[1]) * nz;
    const q = b.quat, fx = -(2 * (q.x * q.z + q.w * q.y)), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const psi = Math.atan2(fx * nx + fz * nz, fx * tx + fz * tz); // heading error, + = car points right of the path
    let hx = pb[0] - pa[0], hz = pb[1] - pa[1]; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const kap = Math.atan2(tx * hz - tz * hx, tx * hx + tz * hz) / Math.max(1, 2 * ds * 2); // signed curvature ahead (+ right)
    const vs = Math.max(1, b.fwdSpeed);
    const delta = Math.atan(L * kap) - psi * 0.9 - Math.atan(1.2 * eLat / (vs + 2));
    const maxA = b.maxSteer / (1 + vs / (P.steerSpeed ?? 26));
    let dCmd = delta;
    // a tidy driver never asks the front tyres for more than their peak slip (that only scrubs speed)
    const aFs = (b.wheels[0].slipLat + b.wheels[1].slipLat) / 2, pk = (P.slipPeak ?? 0.13) * 1.15;
    if (Math.abs(aFs) > pk && Math.sign(dCmd) === -Math.sign(aFs)) dCmd = Math.sign(dCmd) * Math.max(0, Math.min(Math.abs(dCmd), Math.abs(b.steer) - (Math.abs(aFs) - pk)));
    inp.steer = Math.max(-1, Math.min(1, dCmd / Math.max(0.02, maxA)));
    const vt = plan[(idx + 2) % N];
    const v = b.speed;
    // friction-circle aware throttle + simple traction control (what a tidy human driver does with the pedal)
    const kab = pts[(idx + 4) % N][2], use = Math.min(1, v * v * kab / Math.max(1, aLat));
    const room = Math.sqrt(Math.max(0, 1 - use * use));
    const slip = b.drift, peak = P.slipPeak ?? 0.13;
    const cap = Math.max(0.05, Math.min(1, 1 - (slip - peak * 0.9) / (peak * 0.5)));
    tc = Math.min(cap, tc + H * 2.5);
    if (v < vt - 1.0) { inp.throttle = Math.min(1, 0.25 + room) * tc; inp.brake = 0; }
    else if (v > vt + 0.5) { inp.throttle = 0; inp.brake = Math.min(1, (v - vt) * 0.35 + 0.3); }
    else { inp.throttle = Math.max(0, Math.min(1, (vt - v) * 0.6 + 0.15)) * tc; inp.brake = 0; }
    b.step(H, flatWorld, inp); t += H;
    onStep?.(b, inp, idx, plan[idx], t);
  }
  return { time: null, timeout: true };
}
/**
 * Fastest clean lap: the driver starts from the car's own grip estimate and learns the circuit. Every time it runs
 * wide it backs off locally (the 160 m before the spot) and tries again; then it also tries a slightly braver global
 * budget. Returns the best clean lap.
 */
export function runLap(P, spec, route = routePoints(), aStart = 9) {
  const N = route.pts.length;
  let best = null;
  for (const scale of [1.08, 1.0, 0.9]) {
    const a = aStart * scale, budget = new Float32Array(N).fill(1);
    for (let attempt = 0; attempt < 22; attempt++) {
      const r = lapOnce(P, spec, route, a, a * 0.92, { budget });
      if (r.time) { if (!best || r.time < best.time) best = { time: r.time, aLat: a, maxErr: r.maxErr, attempts: attempt + 1 }; break; }
      if (r.off) { for (let k = -80; k <= 10; k++) { const j = (r.at + k + N) % N; budget[j] *= 0.9; } }
      else break;
    }
  }
  return best;
}
