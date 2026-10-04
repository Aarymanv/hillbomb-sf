// HILLBOMB audio: offline scenario renderer for measurements (loudness, peaks, clicks, spectra).
// Drives the public audio API exactly like the game does (createEngine/update/setSpatial, tires, wind, impacts, radio)
// inside an OfflineAudioContext, stepping "game frames" with ctx.suspend(). Results are measured in JS and the WAVs
// can be posted to a local receiver for spectrograms.
//   const S = await import('/dev/audio.scenarios.js'); await S.run({ impl: 'new', names: ['throttle'], post: 'http://127.0.0.1:5197/wav' })

const IMPLS = { new: '../src/audio/audio.js', old: './_audio_before/audio.js' }; // old: HEAD copy for before/after (not committed) // (the old synth was compared here before it was removed)
const SR = 48000, FPS = 30;

// ---------------------------------------------------------------- simple car model for rpm/gears
function carSim(o = {}) {
  const gears = o.gears || [2.8, 1.95, 1.45, 1.12, 0.9], final = o.final || 3.3, r = 0.34;
  const idle = o.idle || 800, red = o.redline || 6300;
  const v0 = o.v || 0, g0 = o.gear || 1;
  return { gears, final, r, idle, red, gear: g0, v: v0, rpm: Math.max(idle, (v0 / (2 * Math.PI * r)) * 60 * gears[g0 - 1] * final), shifted: null,
    step(dt, thr, brake = 0, grade = 0) {
      this.shifted = null;
      const ratio = this.gears[this.gear - 1] * this.final;
      let rpm = (this.v / (2 * Math.PI * r)) * 60 * ratio;
      const launch = idle + thr * (red * 0.55 - idle);
      if (this.gear === 1 && rpm < launch) rpm += (launch - rpm) * 0.85;
      rpm = Math.min(red * 1.01, Math.max(idle, rpm));
      this.rpm += (rpm - this.rpm) * Math.min(1, dt * 18);
      const acc = thr * (o.acc || 7) / Math.sqrt(this.gear) - brake * 9 - 0.0006 * this.v * this.v - 0.15 - 9.8 * grade;
      this.v = Math.max(0, this.v + acc * dt);
      if (this.rpm > red * 0.93 && this.gear < this.gears.length && thr > 0.2) { this.gear++; this.shifted = 'up'; }
      else if (this.gear > 1 && this.rpm < red * 0.42) { this.gear--; this.shifted = 'down'; }
      return this;
    } };
}


// the game's keyboard throttle ramp (physics.js: ramp(throttle, input, 6, 12)) and a car driven through the public API
const ramp = (cur, tgt, up, down, dt) => (tgt > cur ? Math.min(tgt, cur + up * dt) : Math.max(tgt, cur - down * dt));
function drive(A, st, dt, o = {}) {
  st.thr = ramp(st.thr || 0, o.thr || 0, 6, 12, dt);
  const c = st.car.step(dt, st.thr, o.brake || 0, o.grade || 0);
  if (c.shifted) st.e.shift(c.shifted === 'up');
  st.e.update({ rpm: c.rpm, idleRpm: c.idle, redline: c.red, throttle: st.thr, load: st.thr, speed: c.v, gear: c.gear });
  A.tires.update({ slip: o.slip || 0, speed: c.v, surface: o.surface || 'asphalt', brake: o.brake || 0, ...(o.road || {}) });
  A.wind.update(c.v); A.scrape(0);
  return c;
}
// NPC cars on straight lines past the listener: [profile, t0, speed (m/s, relative), lateral offset m, start x]
function npcs(A, t, st, list, passby = true) {
  st.npc = st.npc || list.map(([p, t0, v, z, x0 = -60]) => ({ p, t0, v, z, x0, e: null, pb: 0 }));
  for (const n of st.npc) {
    const x = (t - n.t0) * n.v + n.x0, d = Math.hypot(x, n.z);
    const on = d < 70 && t > n.t0;
    if (on && !n.e) n.e = A.createEngine(n.p, { lite: true });
    if (!on && n.e && t > n.t0 + 1) { n.e.stop(); n.e = null; }
    if (!n.e) continue;
    n.e.setSpatial({ distance: d, pan: Math.max(-1, Math.min(1, x / Math.max(1, d))), velocity: -(n.v * x) / Math.max(1, d) });
    n.e.update({ rpm: 1500 + Math.abs(n.v) * 70, idleRpm: 800, redline: 6500, throttle: n.v ? 0.35 : 0, load: n.v ? 0.35 : 0, speed: Math.abs(n.v), gear: 3 });
    // same pass-by prediction as game.js
    const tc = -x / (n.v || 1e-9);
    if (passby && !n.pb && Math.abs(n.v) > 11 && tc > 0.35 && tc < 1.3 && Math.abs(n.z) < 6.5) { n.pb = 1; if (A.passby({ delay: tc, side: x < 0 ? 1 : -1, dmin: Math.abs(n.z), rate: 1, gain: 0.55 })) n.e.duckFor(tc + 1.6); }
  }
}

// ---------------------------------------------------------------- scenarios: (A, t, dt, st) called each frame
const SCEN = {
  idle: { dur: 6, init(A, st) { st.e = A.createEngine('v8'); }, frame(A, t, dt, st) {
    st.e.update({ rpm: 780 + 15 * Math.sin(t * 3), idleRpm: 800, redline: 6300, throttle: 0, load: 0, speed: 0, gear: 1 });
    A.tires.update({ slip: 0, speed: 0, surface: 'asphalt' }); A.wind.update(0); A.scrape(0);
  } },
  throttle: { dur: 14, init(A, st) { st.e = A.createEngine(st.profile || 'v8'); st.car = carSim(); }, frame(A, t, dt, st) {
    const thr = t < 0.5 ? 0 : t < 10 ? 1 : 0; // full throttle through the gears, then lift off
    const c = st.car.step(dt, thr);
    if (c.shifted) { if (A.shift) A.shift(c.shifted === 'up'); }
    st.e.update({ rpm: c.rpm, idleRpm: c.idle, redline: c.red, throttle: thr, load: thr, speed: c.v, gear: c.gear });
    A.tires.update({ slip: t > 0.5 && t < 1.3 ? 0.5 : 0, speed: c.v, surface: 'asphalt' }); A.wind.update(c.v); A.scrape(0);
  } },
  rev: { dur: 8, init(A, st) { st.e = A.createEngine(st.profile || 'v8'); st.rpm = 800; }, frame(A, t, dt, st) {
    // stationary blips: throttle stabs, then a slow sweep idle -> redline -> idle (pitch tracking test)
    const P = { idle: 800, red: 6300 };
    let thr = 0, target = P.idle;
    if (t < 3) { thr = (t % 1) < 0.3 ? 1 : 0; target = thr ? P.red : P.idle; }
    else { const u = (t - 3) / 5; target = P.idle + (P.red - P.idle) * Math.sin(Math.PI * Math.min(1, u)); thr = u < 0.5 ? 0.7 : 0.1; }
    st.rpm += (target - st.rpm) * Math.min(1, dt * (thr ? 6 : 3));
    st.rpmLog = st.rpmLog || []; st.rpmLog.push([t, st.rpm]);
    st.e.update({ rpm: st.rpm, idleRpm: P.idle, redline: P.red, throttle: thr, load: thr * 0.3, speed: 0, gear: 0 });
  } },
  corner: { dur: 8, init(A, st) { st.e = A.createEngine('i4'); }, frame(A, t, dt, st) {
    const v = 20, slip = t < 1 ? 0 : t < 5 ? Math.min(0.9, (t - 1) * 0.3) : Math.max(0, 0.9 - (t - 5) * 0.6);
    st.e.update({ rpm: 4500, idleRpm: 850, redline: 7200, throttle: 0.6, load: 0.6, speed: v, gear: 3 });
    A.tires.update({ slip, speed: v, surface: 'asphalt' }); A.wind.update(v); A.scrape(0);
  } },
  crash: { dur: 8, init(A, st) { st.e = A.createEngine('i4'); st.hits = [[0.5, 0.2, 'car'], [1.5, 0.5, 'car'], [2.6, 1, 'car'], [4, 0.6, 'wall'], [5, 1, 'wall'], [6, 0.7, 'prop'], [6.8, 0.8, 'landing'], [7.3, 0.9, 'glass']]; }, frame(A, t, dt, st) {
    st.e.update({ rpm: 2000, idleRpm: 850, redline: 7200, throttle: 0.2, load: 0.2, speed: 10, gear: 2 });
    A.tires.update({ slip: 0, speed: 10, surface: 'asphalt' }); A.wind.update(10);
    while (st.hits.length && st.hits[0][0] <= t) { const [, s, k] = st.hits.shift(); A.impact(s, k); }
  } },
  traffic: { dur: 12, init(A, st) {
    st.e = A.createEngine('i4');
    // four NPC cars driving past the listener on a straight road 6 m away at different times/speeds
    st.npc = [['i4', 0.5, 14], ['v6', 3, 18], ['v8', 6, 22], ['diesel', 8.5, 10]].map(([p, t0, v]) => ({ p, t0, v, e: null }));
  }, frame(A, t, dt, st) {
    st.e.update({ rpm: 800, idleRpm: 850, redline: 7200, throttle: 0, load: 0, speed: 0, gear: 1 });
    A.tires.update({ slip: 0, speed: 0, surface: 'asphalt' }); A.wind.update(0);
    for (const n of st.npc) {
      const x = (t - n.t0) * n.v - 60, z = 6, d = Math.hypot(x, z);
      const on = d < 90 && t > n.t0;
      if (on && !n.e) n.e = A.createEngine(n.p, { lite: true });
      if (!on && n.e && t > n.t0 + 1) { n.e.stop(); n.e = null; }
      if (!n.e) continue;
      const vel = -(n.v * x) / Math.max(1, d); // radial velocity (positive = approaching)
      n.e.setSpatial({ distance: d, pan: Math.max(-1, Math.min(1, x / Math.max(1, d))), velocity: vel });
      n.e.update({ rpm: 2200 + n.v * 60, idleRpm: 800, redline: 6500, throttle: 0.35, load: 0.35, speed: n.v, gear: 3 });
    }
  } },
  dense: { dur: 12, radio: true, init(A, st) { SCEN.throttle.init(A, st); SCEN.traffic.init(A, st); st.e2 = st.e; }, frame(A, t, dt, st) {
    SCEN.traffic.frame(A, t, dt, st); SCEN.throttle.frame(A, t, dt, st);
    if (Math.abs(t - 7) < dt / 2) A.impact(0.8, 'car');
  } },
  radio: { dur: 12, radio: true, init() {}, frame() {} },
  city: { dur: 12, init() {}, frame(A, t) { A.ambience.update({ district: 'Financial District', night: 0, water: 0, altitude: 5, force: true }); } },
  waterfront: { dur: 12, init() {}, frame(A, t) { A.ambience.update({ district: "Fisherman's Wharf", night: 0, water: 0.8, altitude: 3, fog: 0.8, force: true }); } },
  rain: { dur: 12, init(A, st) { st.e = A.createEngine('i4'); st.th = [[2, 700], [7, 3000]]; }, frame(A, t, dt, st) {
    A.weather({ rain: 0.85, wind: 0.5 });
    A.ambience.update({ district: 'Mission', night: 0.8, water: 0, altitude: 5, interior: t > 6, force: true });
    A.setListener({ interior: t > 6 });
    st.e.update({ rpm: 1800, idleRpm: 850, redline: 7200, throttle: 0.2, load: 0.2, speed: 12, gear: 3 });
    A.tires.update({ slip: 0, speed: 12, surface: 'asphalt' }); A.wind.update(12);
    while (st.th.length && st.th[0][0] <= t) A.thunder(st.th.shift()[1]);
  } },
  ui: { dur: 14, init(A, st) { st.k = 0; st.kinds = null; }, frame(A, t, dt, st) {
    if (!st.kinds) st.kinds = ['click','hover','confirm','back','error','money','purchase','checkpoint','countdown','go','finish','fail','levelup','wanted','busted','evaded','skill','nearmiss','unlock','reward','notify'];
    if (t > 0.3 + st.k * 0.6 && st.k < st.kinds.length) A.ui(st.kinds[st.k++]);
  } },

  // ---- review set (10/1): the situations players actually hear
  cruise30: { dur: 8, init(A, st) { st.e = A.createEngine('i4'); st.car = carSim({ v: 13.4, gear: 3, idle: 850, redline: 7000 }); }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: Math.max(0, Math.min(1, (13.4 - st.car.v) * 0.6 + 0.28)) });
    A.ambience.update({ district: 'Pacific Heights', night: 0, water: 0, altitude: 3, force: true });
  } },
  hyde: { dur: 10, init(A, st) { st.e = A.createEngine('v8'); st.car = carSim({ acc: 8.5 }); st.b = [[2.5, 35], [6, 20]]; }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: t > 0.4 ? 1 : 0, grade: 0.17, slip: t > 0.4 && t < 1.2 ? 0.45 : 0, road: { rails: t > 3 && t < 9 ? 1 : 0 } });
    A.ambience.update({ district: 'Russian Hill', night: 0, water: 0, altitude: 60, force: true });
    while (st.b.length && st.b[0][0] <= t) A.cableCarBell({ distance: st.b.shift()[1], pan: 0.4 });
  } },
  redline: { dur: 7, init(A, st) { st.e = A.createEngine('v10'); st.rpm = 900; }, frame(A, t, dt, st) {
    const thr = t > 0.5 && t < 5 ? 1 : 0, red = 8500;
    st.rpm += ((thr ? red * 1.01 : 900) - st.rpm) * Math.min(1, dt * (thr ? 4 : 2.5));
    st.e.update({ rpm: Math.min(st.rpm, red * 1.01), idleRpm: 900, redline: red, throttle: thr, load: thr * 0.4, speed: 0, gear: 0 });
  } },
  downshift: { dur: 8, init(A, st) { st.e = A.createEngine('v8'); st.car = carSim({ v: 36, gear: 5 }); }, frame(A, t, dt, st) {
    drive(A, st, dt, t < 5 ? { brake: 0.75 } : { thr: 0.6 });
  } },
  drift: { dur: 8, init(A, st) { st.e = A.createEngine('flat6'); st.car = carSim({ v: 16, gear: 2, idle: 900, redline: 7800 }); }, frame(A, t, dt, st) {
    const slip = t < 1 ? 0 : t < 2.5 ? (t - 1) / 1.5 * 0.85 : t < 6 ? 0.85 + 0.08 * Math.sin(t * 5) : Math.max(0, 0.85 - (t - 6) * 0.6);
    st.car.v = Math.max(st.car.v, 14); // held by the drift
    drive(A, st, dt, { thr: t > 0.8 && t < 6.2 ? 0.9 : 0.2, slip });
  } },
  chinatown: { dur: 10, init(A, st) { st.e = A.createEngine('i4'); st.car = carSim({ v: 7, gear: 2, idle: 850, redline: 7000 }); }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: Math.max(0, Math.min(1, (7 - st.car.v) * 0.6 + 0.2)), road: { paint: t > 4 && t < 4.5 ? 1 : 0 } });
    A.ambience.update({ district: 'Chinatown', night: 1, water: 0, altitude: 3, fog: 0.2, force: true });
    if (Math.abs(t - 5) < dt / 2) { A.horn(true, 'car', { id: 'n1', distance: 25, pan: -0.5 }); st.hoff = t + 0.4; }
    if (st.hoff && t >= st.hoff) { A.horn(false, 'car', { id: 'n1' }); st.hoff = 0; }
  } },
  lombard: { dur: 8, init(A, st) { st.e = A.createEngine('i4'); st.car = carSim({ v: 4, gear: 1, idle: 850, redline: 7000 }); }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: Math.max(0, Math.min(1, (4.5 - st.car.v) * 0.5)), brake: st.car.v > 5 ? 0.3 : 0, grade: -0.1, surface: 'brick' });
    A.ambience.update({ district: 'Russian Hill', night: 0, water: 0.2, altitude: 40, force: true });
  } },
  freeway: { dur: 12, init(A, st) { st.e = A.createEngine('v6'); st.car = carSim({ v: 31, gear: 5 }); }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: Math.max(0, Math.min(1, (31 - st.car.v) * 0.5 + 0.45)) });
    A.ambience.update({ district: 'SoMa', night: 0.2, water: 0, altitude: 14, force: true });
    npcs(A, t, st, [['i4', 0, 8, 3.6, -40], ['diesel', 2.5, 6, -3.6, -30], ['v8', 5, 14, 3.6, -50], ['i4', 7, -12, 3.6, 40], ['bus', 8.5, 5, -7, -25]]);
  } },
  tunnel: { dur: 9, init(A, st) { st.e = A.createEngine('i4'); st.car = carSim({ v: 17, gear: 4, idle: 850, redline: 7000 }); }, frame(A, t, dt, st) {
    const tun = t < 2 ? 0 : t < 7 ? 1 : 0;
    drive(A, st, dt, { thr: t > 4 && t < 5.5 ? 1 : 0.35 });
    A.ambience.update({ district: 'Nob Hill', night: 0, water: 0, altitude: 0, tunnel: tun, force: true });
    if (A.setSpace) A.setSpace({ kind: tun ? 'tunnel' : 'street' });
  } },
  interior: { dur: 10, init(A, st) { }, frame(A, t, dt, st) {
    // on foot: walk in from the street (t < 3), stroll around a landmark hall, a UI notify
    const inside = t > 3;
    A.ambience.update({ district: 'Civic Center', night: 0, water: 0, altitude: 0, indoors: inside, force: true });
    if (A.setSpace) A.setSpace({ kind: inside ? 'hall' : 'street', name: 'cityHall' });
    if (A.foot) A.foot.update({ speed: t < 8 ? 1.5 : 0, surface: inside ? 'stone' : 'concrete', grounded: true });
    if (Math.abs(t - 6) < dt / 2) A.ui('notify');
  } },
  menu: { dur: 8, radio: true, init(A, st) { st.e = A.createEngine('i4'); st.k = 0; }, frame(A, t, dt, st) {
    st.e.update({ rpm: 850, idleRpm: 850, redline: 7000, throttle: 0, load: 0, speed: 0, gear: 1 });
    A.ambience.update({ district: 'Mission', night: 0, water: 0, altitude: 3, force: true });
    if (t > 1 && !st.menu) { st.menu = 1; A.radio._setPaused?.(true, 0.5); A.core.menu = { engine: 0.5, sfx: 0.35 }; A.setVolumes({}); }
    const seq = ['hover', 'hover', 'click', 'hover', 'confirm', 'hover', 'back', 'select', 'toggle', 'error', 'close'];
    if (t > 1.5 + st.k * 0.55 && st.k < seq.length) A.ui(seq[st.k++]);
  } },
  jam: { dur: 10, init(A, st) { st.e = A.createEngine('i4'); }, frame(A, t, dt, st) {
    // stacking test: 8 cars idling / creeping around the listener at a light
    st.e.update({ rpm: 850, idleRpm: 850, redline: 7000, throttle: 0, load: 0, speed: 0, gear: 1 });
    A.tires.update({ slip: 0, speed: 0, surface: 'asphalt' }); A.wind.update(0);
    A.ambience.update({ district: 'Financial District', night: 0, water: 0, altitude: 3, force: true });
    st.n = st.n || [['i4', 6, 1], ['v6', 9, -1], ['diesel', 12, 1], ['v8', 15, -1], ['i4', 19, 1], ['bus', 24, -1], ['v6', 30, 1], ['i4', 38, -1]].map(([p, d, s]) => ({ p, d, s, e: A.createEngine(p, { lite: true }) }));
    for (const n of st.n) { n.e.setSpatial({ distance: n.d, pan: n.s * 0.6, velocity: 0 }); n.e.update({ rpm: 800 + (t > 6 ? 600 : 0), idleRpm: 800, redline: 6500, throttle: t > 6 ? 0.3 : 0, load: t > 6 ? 0.3 : 0, speed: t > 6 ? 2 : 0, gear: 1 }); }
  } },
  cruise_radio: { dur: 10, radio: true, init(A, st) { SCEN.cruise30.init(A, st); }, frame(A, t, dt, st) {
    drive(A, st, dt, { thr: t > 4 && t < 7 ? 1 : Math.max(0, Math.min(1, (13.4 - st.car.v) * 0.6 + 0.28)) });
    A.ambience.update({ district: 'Pacific Heights', night: 0, water: 0, altitude: 3, force: true });
  } },
  // engine only, 2 s phases: idle | cruise 30% rpm, 25% throttle | WOT 60% rpm | WOT 92% rpm | lift-off at 70% rpm
  phases: { dur: 10, init(A, st) { st.e = A.createEngine(st.profile || 'v8'); }, frame(A, t, dt, st) {
    const idle = 800, red = 6500, ph = Math.floor(t / 2);
    const [f, thr] = [[0, 0], [0.3, 0.25], [0.6, 1], [0.92, 1], [0.7, 0]][Math.min(4, ph)];
    const rpm = idle + (red - idle) * f;
    st.e.update({ rpm, idleRpm: idle, redline: red, throttle: thr, load: thr, speed: 10 + 20 * f, gear: 3 });
  } },
};

// ---------------------------------------------------------------- analysis
function kweight(x, sr) {
  // BS.1770 K-weighting biquads (bilinear from analog prototypes)
  const bq = (b, a, y) => { const out = new Float32Array(y.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) { const v = y[i]; const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; out[i] = o; } return out; };
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr); const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / sr); a0 = 1 + K / Q + K * K;
  const b2 = [1, -2, 1], a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  return bq(b2, a2, bq(b1, a1, x));
}
export function analyze(buf) {
  const sr = buf.sampleRate, chs = [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c));
  let peak = 0, clip = 0, nan = 0, clicks = 0, maxJump = 0;
  for (const d of chs) {
    let prevD = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i]; if (!Number.isFinite(x)) { nan++; continue; }
      const a = Math.abs(x); if (a > peak) peak = a; if (a > 0.999) clip++;
      if (i > 1) { const dd = x - d[i - 1]; const j = Math.abs(dd - prevD); if (j > maxJump) maxJump = j; if (j > 0.25) clicks++; prevD = dd; }
    }
  }
  // integrated loudness + max short-term (3 s) + max momentary (0.4 s)
  const K = chs.map((d) => kweight(d, sr));
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), zs = [];
  for (let i = 0; i + blk <= K[0].length; i += hop) { let z = 0; for (const k of K) { let s = 0; for (let j = i; j < i + blk; j++) s += k[j] * k[j]; z += s / blk; } zs.push(z); }
  const L = (z) => -0.691 + 10 * Math.log10(Math.max(z, 1e-12));
  const g1 = zs.filter((z) => L(z) > -70); const m1 = g1.reduce((a, b) => a + b, 0) / Math.max(1, g1.length);
  const g2 = g1.filter((z) => L(z) > L(m1) - 10); const lufs = g2.length ? L(g2.reduce((a, b) => a + b, 0) / g2.length) : -70;
  let st = -70; for (let i = 0; i + 30 <= zs.length; i++) { let s = 0; for (let j = i; j < i + 30; j++) s += zs[j]; st = Math.max(st, L(s / 30)); }
  const mom = zs.length ? Math.max(...zs.map(L)) : -70;
  const db = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -180);
  return { lufs: +lufs.toFixed(1), shortMax: +st.toFixed(1), momMax: +mom.toFixed(1), peakDb: +db(peak).toFixed(2), clipped: clip, clicks, maxJump: +maxJump.toFixed(3), nan };
}
export function wav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * ch * 4), v = new DataView(ab);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 4, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 4, true); v.setUint16(32, ch * 4, true); v.setUint16(34, 32, true); s(36, 'data'); v.setUint32(40, n * ch * 4, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setFloat32(o, data[c][i], true); o += 4; }
  return ab;
}

// ---------------------------------------------------------------- runner
export async function render(name, { impl = 'new', profile, raw = false } = {}) {
  const S = SCEN[name];
  const mod = await import(IMPLS[impl] + '?v=' + Date.now());
  const ctx = new OfflineAudioContext(2, Math.round(S.dur * SR), SR);
  const A = mod.createAudio({ context: ctx, rawOutput: raw, suspendWhenHidden: false });
  if (A.ready) await A.ready({ all: true });
  const st = { profile };
  if (S.radio && A.radio) A.radio.setOn(true);
  const dt = 1 / FPS, t0 = performance.now();
  const steps = Math.floor(S.dur * FPS) - 1;
  let k = 0;
  const step = async () => {
    const t = ctx.currentTime;
    // radio scenarios: the offline radio fetches + decodes its track asynchronously; hold the render until it is scheduled
    if (S.radio && k === 1) await new Promise((r) => setTimeout(r, 3000));
    try { if (k === 0) S.init(A, st); S.frame(A, t, dt, st);
      const M = A.core && A.core.meters; if (M && t > 0.5) { st.gr = st.gr || { lim: 0, glue: 0, limSum: 0, n: 0 }; const l = -M.lim.reduction, g = -M.glue.reduction; st.gr.lim = Math.max(st.gr.lim, l); st.gr.glue = Math.max(st.gr.glue, g); st.gr.limSum += l; st.gr.n++; } if (A.tick) A.tick(dt); if (S.radio && A.radio?._scheduleUntil) A.radio._scheduleUntil(t + 0.3); }
    catch (e) { console.warn('[scenario]', name, e); }
    k++;
    if (k <= steps) ctx.suspend(k * dt).then(step);
    ctx.resume();
  };
  ctx.suspend(0).then(step);
  const buf = await ctx.startRendering();
  const res = { name, impl, profile: profile || '', ms: Math.round(performance.now() - t0), ...analyze(buf), stats: A.stats ? A.stats() : null };
  if (st.rpmLog) res.rpmLog = st.rpmLog;
  if (st.gr) res.gr = { limMax: +st.gr.lim.toFixed(1), limMean: +(st.gr.limSum / st.gr.n).toFixed(2), glueMax: +st.gr.glue.toFixed(1) };
  return { buf, res };
}
export async function run({ impl = 'new', names = Object.keys(SCEN), post = null, profile, raw } = {}) {
  const out = [];
  for (const n of names) {
    const { buf, res } = await render(n, { impl, profile, raw });
    if (post) {
      await fetch(`${post}?name=${impl}_${n}${profile ? '_' + profile : ''}`, { method: 'POST', body: wav(buf) });
      if (res.rpmLog) await fetch(`${post}?name=${impl}_${n}${profile ? '_' + profile : ''}_rpm&ext=json`, { method: 'POST', body: JSON.stringify(res.rpmLog) });
    }
    delete res.rpmLog;
    out.push(res);
  }
  if (post) await fetch(`${post}?name=${impl}_results&ext=json`, { method: 'POST', body: JSON.stringify(out) });
  return out;
}
export const NAMES = Object.keys(SCEN);
