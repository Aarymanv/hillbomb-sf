// Headless handling probe: node dev/hb_handling_probe.mjs [car ...]  (flat world, 120 Hz sim, keyboard-style square inputs)
//  latency: ms from steer key-down until yaw rate reaches 0.05 / 0.15 rad/s at 25 m/s (lat10 / lat63 columns)
//  lane change @ 27 m/s: steer +1 0.45 s, -1 0.45 s, 0 -> max lateral g, peak sideslip, settle time (|yawRate|<0.03 & |beta|<0.02)
//  slalom @ 22 m/s: square steer 0.6 Hz for 6 s -> max lat g, max |beta| (spin if > 0.5 rad)
import { carParams, getSpec, ROSTER_KEYS } from '../src/vehicle/cars.js';
import { CarBody } from '../src/vehicle/physics.js';
import * as THREE from 'three';
const world = { groundAt(x, z, y, o) { if (o) { o.x = 0; o.y = 1; o.z = 0; o.surface = 1; o.deck = null; } return 0; }, colliders: { query: () => [] } };
const H = 1 / 120;
function mk(id, v0) {
  const b = new CarBody(getSpec(id), carParams(id)); b.place(0, 0.05, 0, 0);
  const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, autoReverse: true };
  if (process.env.HS) Object.assign(inp, { hs: { mode: process.env.HS, abs: true, tcs: true, stm: process.env.STM !== '0', counter: true, sens: 1, kb: 1 }, digital: true, digitalPedals: false });
  for (let i = 0; i < 240; i++) b.step(H, world, inp);                // settle
  b.vel.set(0, 0, -v0); for (const w of b.wheels) w.spin = 0;
  return { b, inp };
}
const up = new THREE.Vector3(), rt = new THREE.Vector3();
function run(id, v0, steerFn, T) {
  const { b, inp } = mk(id, v0); let t = 0, maxG = 0, maxBeta = 0, settle = null, lastActive = 0; const yaw = [];
  const vPrev = b.vel.clone();
  for (; t < T; t += H) {
    const s = steerFn(t); inp.steer = s; if (s !== 0) lastActive = t;
    const fw = b.forward(new THREE.Vector3()).dot(b.vel);  // speed hold
    inp.throttle = Math.max(0, Math.min(1, (v0 - fw) * 0.5)); inp.brake = 0;
    b.step(H, world, inp);
    b.right(rt); b.up(up);
    const a = b.vel.clone().sub(vPrev).divideScalar(H); vPrev.copy(b.vel);
    const glat = Math.abs(a.dot(rt)) / 9.81; if (t > 0.05) maxG = Math.max(maxG, glat);
    const beta = Math.atan2(b.vel.dot(rt), Math.max(2, Math.abs(fw))); maxBeta = Math.max(maxBeta, Math.abs(beta));
    const yr = b.angVel.dot(up); yaw.push(yr);
    if (s === 0 && t > lastActive) { if (Math.abs(yr) < 0.03 && Math.abs(beta) < 0.02) { if (settle === null) settle = t - lastActive; } else settle = null; }
  }
  return { maxG, maxBeta, settle, yaw, speed: b.speed };
}
function latency(id) {
  const r = run(id, 25, t => (t >= 0 ? 1 : 0), 1.5); const ss = r.yaw[r.yaw.length - 1];
  const f = k => { const i = r.yaw.findIndex(y => Math.abs(y) >= Math.abs(ss) * k); return Math.round(i * H * 1000); };
  const fa = th => Math.round(r.yaw.findIndex(y => Math.abs(y) >= th) * H * 1000);
  return { t10: fa(0.05), t63: fa(0.15), yawSS: +Math.abs(ss).toFixed(3) };
}
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ROSTER_KEYS;
const rows = [];
for (const id of ids) {
  const L = latency(id);
  const lc = run(id, 27, t => (t < 0.45 ? 1 : t < 0.9 ? -1 : 0), 6);
  const sl = run(id, 22, t => (t < 6 ? (Math.sin(t * Math.PI * 2 * 0.6) > 0 ? 1 : -1) : 0), 9);
  rows.push({ id, lat10: L.t10, lat63: L.t63, yawSS: L.yawSS, lcG: +lc.maxG.toFixed(2), lcBeta: +lc.maxBeta.toFixed(2), lcSettle: lc.settle == null ? 'none' : +lc.settle.toFixed(2), slG: +sl.maxG.toFixed(2), slBeta: +sl.maxBeta.toFixed(2), slSettle: sl.settle == null ? 'none' : +sl.settle.toFixed(2) });
}
if (process.env.TABLE) console.table(rows);
const med = k => { const v = rows.map(r => r[k]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v[v.length >> 1]; };
console.log(JSON.stringify({ n: rows.length, med: Object.fromEntries(['lat10', 'lat63', 'yawSS', 'lcG', 'lcBeta', 'lcSettle', 'slG', 'slBeta', 'slSettle'].map(k => [k, med(k)])),
  spins: rows.filter(r => r.lcBeta > 0.5 || r.slBeta > 0.5).map(r => r.id), unsettled: rows.filter(r => r.lcSettle === 'none' || r.lcSettle > 3).map(r => r.id) }));
if (process.env.OUT) (await import('fs')).writeFileSync(process.env.OUT, JSON.stringify(rows));
