// Car builds: upgrades, tuning, derived physics params and the Performance Index.
//
// Pipeline (pure functions, no THREE, no DOM; runs in Node for the lab):
//   stock roster def ──applyUpgrades(def, build.up)──► upgraded def ──deriveParams(def, spec, stock)──► P
//   P ──applyTune(P, build.tune)──► physics params (what CarBody reads)
//   P + spec ──measure()──► { t100, t160, vmax, brake100, latG, lap } ──► PI (100..999), class, stat bars 0..10
//
// The performance model is a quasi-steady-state replica of physics.js (same torque curve, gearbox logic, launch clutch,
// friction circle, drag, downforce, yaw damping, brake split). dev/cars.html?lab and the Node lab measure the same
// numbers with the real CarBody and report the agreement. PI is the reference-circuit lap time mapped onto 100..999.
//
// Physics params written here that physics.js does not read yet (tuning sliders land in them; physics owner can wire
// them up with these exact names): brakeBias, antiRollF, antiRollR, springF, springR, damperF, damperR, rideF, rideR,
// camberF, camberR, toeF, toeR, caster, tyrePressF, tyrePressR, diffAccel, diffDecel, awdFront, aeroF, aeroR.
// Until then each has a documented proxy on supported params (gripF/gripR/latStiff/slipPeak/yawDamp/steer/...).

export const G0 = 9.81;
export const PI_BANDS = [['D', 100, 500], ['C', 501, 600], ['B', 601, 700], ['A', 701, 800], ['S1', 801, 900], ['S2', 901, 998], ['X', 999, 999]];
export const CLASS_ORDER = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
export const classOfPI = pi => (PI_BANDS.find(([, lo, hi]) => pi >= lo && pi <= hi) || PI_BANDS[pi < 100 ? 0 : 6])[0];
export const classMaxPI = c => (PI_BANDS.find(b => b[0] === c) || PI_BANDS[0])[2];
export const classMinPI = c => (PI_BANDS.find(b => b[0] === c) || PI_BANDS[0])[1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ engine torque curve (identical to physics.js)
export function torqueCurve(x) {
  return clamp(0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, x * 1.05)) + (x < 0.25 ? -0.1 : 0), 0.45, 1);
}
/** peak power (kW) and the rpm it happens at, from the physics torque curve */
export function peakPower(torque, redline) {
  let best = 0, at = 0;
  for (let i = 10; i <= 100; i++) { const x = i / 100, p = torque * torqueCurve(x) * x * redline * Math.PI / 30 / 1000; if (p > best) { best = p; at = x * redline; } }
  return { kw: best, hp: best * 1.341, rpm: at };
}

// ------------------------------------------------------------------ gearbox design
/**
 * Progressive gear set: n ratios, first gear reaches v1 (km/h) at the shift point, top gear reaches `top` (km/h) at
 * `topRpm` x redline. Real boxes close up toward the top, so steps shrink ((i/(n-1))^k with k < 1).
 */
export function designGears({ n, v1, top, redline, r, topRatio, topRpm = 0.955, k = 0.86 }) {
  if (n === 1) {
    const w = (top / 3.6) / r * 60 / (2 * Math.PI);
    return { gears: [1], final: +(redline * topRpm / w).toFixed(3) };
  }
  const tr = topRatio ?? ({ 2: 1.0, 3: 1.0, 4: 1.0, 5: 0.82, 6: 0.72, 7: 0.64, 8: 0.62, 9: 0.6, 10: 0.62 }[n] ?? 0.8);
  const wTop = (top / 3.6) / r * 60 / (2 * Math.PI);
  const final = redline * topRpm / (wTop * tr);
  const w1 = (v1 / 3.6) / r * 60 / (2 * Math.PI);
  const g1 = redline * 0.93 / (w1 * final);
  const gears = [];
  for (let i = 0; i < n; i++) { const t = Math.pow(i / (n - 1), k); gears.push(+(g1 * Math.pow(tr / g1, t)).toFixed(3)); }
  return { gears, final: +final.toFixed(3) };
}

// ------------------------------------------------------------------ tyres
export const TYRES = {
  vintage: { name: 'Vintage bias-ply', grip: 0.86, falloff: 0.1, peak: 0.16, off: 0.9, price: 0 },
  eco: { name: 'Economy', grip: 0.93, falloff: 0.07, peak: 0.14, off: 0.95, price: 0 },
  street: { name: 'Street', grip: 1.0, falloff: 0.06, peak: 0.13, off: 1.0, price: 600 },
  sport: { name: 'Sport', grip: 1.07, falloff: 0.055, peak: 0.12, off: 0.95, price: 1600 },
  semi: { name: 'Semi-slick', grip: 1.14, falloff: 0.05, peak: 0.11, off: 0.85, price: 3200 },
  slick: { name: 'Race slick', grip: 1.22, falloff: 0.05, peak: 0.1, off: 0.7, price: 6000 },
  rally: { name: 'Rally', grip: 1.0, falloff: 0.065, peak: 0.14, off: 1.25, price: 2400 },
  offroad: { name: 'Off-road', grip: 0.92, falloff: 0.07, peak: 0.16, off: 1.5, price: 2400 },
  drift: { name: 'Drift', grip: 0.95, falloff: 0.14, peak: 0.12, off: 0.9, price: 1400 },
};
export const TYRE_ORDER = ['vintage', 'eco', 'street', 'sport', 'semi', 'slick', 'rally', 'offroad', 'drift'];

// ------------------------------------------------------------------ engine swaps (referenced by roster `swaps`)
export const SWAPS = {
  v8big: { name: '7.0L V8 big block', engine: 'v8', eng: '7.0L V8', asp: 'NA', torque: 720, redline: 6600, idle: 750, mass: 60, price: 22000 },
  v8race: { name: '5.2L flat-plane V8', engine: 'v8', eng: '5.2L V8', asp: 'NA', torque: 640, redline: 8250, idle: 950, mass: 25, price: 30000 },
  v8tt: { name: '4.0L twin-turbo V8', engine: 'v8', eng: '4.0L TT V8', asp: 'twin-turbo', torque: 860, redline: 7200, idle: 900, mass: 45, price: 42000 },
  v12: { name: '6.5L V12', engine: 'v12', eng: '6.5L V12', asp: 'NA', torque: 800, redline: 8700, idle: 1000, mass: 90, price: 60000 },
  i6tt: { name: '3.0L twin-turbo I6', engine: 'i6', eng: '3.0L TT I6', asp: 'twin-turbo', torque: 640, redline: 7200, idle: 850, mass: 30, price: 26000 },
  r4rotor: { name: '2.6L 4-rotor', engine: 'rotary', eng: '4-rotor', asp: 'NA', torque: 520, redline: 9800, idle: 1100, mass: 20, price: 34000 },
  i4t: { name: '2.0L turbo I4', engine: 'i4', eng: '2.0L T I4', asp: 'turbo', torque: 460, redline: 7400, idle: 900, mass: 10, price: 14000 },
  i5t: { name: '2.5L turbo I5', engine: 'i5', eng: '2.5L T I5', asp: 'turbo', torque: 560, redline: 7400, idle: 900, mass: 20, price: 18000 },
  f4big: { name: '2.4L flat-4', engine: 'flat4', eng: '2.4L flat-4', asp: 'NA', torque: 260, redline: 6400, idle: 900, mass: 25, price: 7000 },
  ev: { name: 'Dual-motor electric', engine: 'electric', eng: 'Dual motor', asp: 'electric', torque: 1100, redline: 16000, idle: 0, mass: 140, price: 38000, ev: true },
  v6tt: { name: '3.5L twin-turbo V6', engine: 'v6', eng: '3.5L TT V6', asp: 'twin-turbo', torque: 700, redline: 7100, idle: 850, mass: 20, price: 24000 },
};

// ------------------------------------------------------------------ upgrade catalogue
// Each part has levels 0 (stock) .. n. `fx(d, lv, ctx)` edits the def copy; values are multiplicative where sensible.
// cost(level, def) scales with the car's value so a hatch is cheap to build and a hypercar is not.
const valueScale = d => clamp(Math.sqrt(Math.max(8000, d.price || d.value || 30000) / 30000), 0.6, 3.2);
export const UPGRADES = [
  // ENGINE
  { id: 'intake', cat: 'engine', name: 'Intake', levels: ['Stock', 'Street', 'Sport', 'Race'], base: [0, 900, 2200, 4200], fx: (d, lv) => { d.torque *= 1 + [0, 0.035, 0.07, 0.11][lv]; } },
  { id: 'exhaust', cat: 'engine', name: 'Exhaust', levels: ['Stock', 'Street', 'Sport', 'Race'], base: [0, 1100, 2600, 5000], fx: (d, lv) => { d.torque *= 1 + [0, 0.03, 0.06, 0.09][lv]; d.mass -= [0, 4, 9, 14][lv]; } },
  { id: 'cams', cat: 'engine', name: 'Camshaft & valves', levels: ['Stock', 'Street', 'Sport', 'Race'], base: [0, 1400, 3200, 6200], fx: (d, lv) => { d.torque *= 1 + [0, 0.02, 0.045, 0.075][lv]; if (!d.ev) d.redline += [0, 200, 450, 750][lv]; } },
  { id: 'displacement', cat: 'engine', name: 'Displacement', levels: ['Stock', 'Bore & stroke', 'Stroker kit', 'Race block'], base: [0, 2500, 5500, 9500], fx: (d, lv) => { d.torque *= 1 + [0, 0.06, 0.12, 0.19][lv]; d.mass += [0, 5, 10, 15][lv]; }, noEV: true },
  { id: 'induction', cat: 'engine', name: 'Forced induction', levels: ['Stock', 'Centrifugal supercharger', 'Single turbo', 'Twin turbo'], base: [0, 6000, 7500, 11000],
    fx: (d, lv) => { if (!lv) return; const na = d.asp === 'NA'; d.torque *= 1 + (na ? [0, 0.26, 0.34, 0.46] : [0, 0.12, 0.18, 0.26])[lv]; d.mass += [0, 22, 26, 38][lv]; d.asp = ['NA', 'supercharged', 'turbo', 'twin-turbo'][lv]; }, noEV: true },
  { id: 'swap', cat: 'engine', name: 'Engine swap', swap: true },
  // PLATFORM
  { id: 'brakes', cat: 'platform', name: 'Brakes', levels: ['Stock', 'Street', 'Sport', 'Race'], base: [0, 900, 2400, 5200], fx: (d, lv) => { d.brake += [0, 0.08, 0.16, 0.28][lv]; d.mass -= [0, 2, 5, 9][lv]; } },
  { id: 'springs', cat: 'platform', name: 'Springs & dampers', levels: ['Stock', 'Street', 'Sport', 'Race', 'Rally', 'Drift'], base: [0, 1000, 2400, 4600, 3800, 3600],
    fx: (d, lv) => {
      if (!lv) return;
      const k = [1, 1.12, 1.3, 1.55, 1.05, 1.4][lv];
      d.springMul = (d.springMul || 1) * k; d.latStiff = (d.latStiff ?? 1) * [1, 1.015, 1.03, 1.05, 1.0, 1.02][lv];
      d.ride = [0, -0.015, -0.03, -0.045, 0.05, -0.03][lv];
      if (lv === 4) { d.travel = (d.travel ?? 0.26) + 0.07; d.offBonus = (d.offBonus || 0) + 2; }
      if (lv === 5) { d.slipFalloff = (d.slipFalloff ?? 0.06) + 0.03; d.gripR = (d.gripR ?? 1) * 0.97; }
    } },
  { id: 'arb', cat: 'platform', name: 'Anti-roll bars', levels: ['Stock', 'Sport', 'Race'], base: [0, 800, 2000], fx: (d, lv) => { d.antiRoll = (d.antiRoll ?? 0.5) * [1, 1.35, 1.7][lv]; d.latStiff = (d.latStiff ?? 1) * [1, 1.01, 1.02][lv]; } },
  { id: 'weight', cat: 'platform', name: 'Weight reduction', levels: ['Stock', 'Street', 'Sport', 'Race', 'Extreme'], base: [0, 1500, 4200, 8200, 14000], fx: (d, lv) => { d.mass *= 1 - [0, 0.03, 0.06, 0.1, 0.15][lv]; } },
  { id: 'chassis', cat: 'platform', name: 'Chassis reinforcement', levels: ['Stock', 'Sport', 'Roll cage'], base: [0, 1800, 4400], fx: (d, lv) => { d.latStiff = (d.latStiff ?? 1) * [1, 1.015, 1.03][lv]; d.mass += [0, 8, 32][lv]; d.inertiaScale = (d.inertiaScale ?? 0.85) * [1, 0.99, 0.97][lv]; } },
  // DRIVETRAIN
  { id: 'clutch', cat: 'drivetrain', name: 'Clutch', levels: ['Stock', 'Sport', 'Race'], base: [0, 800, 1900], fx: (d, lv) => { d.shiftTime = (d.shiftTime ?? 0.18) * [1, 0.8, 0.6][lv]; }, noEV: true },
  { id: 'trans', cat: 'drivetrain', name: 'Transmission', levels: ['Stock', 'Sport close-ratio', 'Race 6-speed', 'Race 7-speed'], base: [0, 1800, 4200, 6400],
    fx: (d, lv, ctx) => {
      if (!lv) return;
      d.shiftTime = (d.shiftTime ?? 0.18) * [1, 0.9, 0.75, 0.65][lv];
      const n = Math.max(d.gearsN, [0, d.gearsN, 6, 7][lv]);
      const r = ctx.r;
      // close ratios: first gear a little shorter, same top speed
      const g = designGears({ n, v1: d.v1 * [1, 0.94, 0.9, 0.86][lv], top: d.top, redline: d.redline, r });
      d.gears = g.gears; d.final = g.final; d.gearsN = n; d.tunableGears = true;
    }, noEV: true },
  { id: 'diff', cat: 'drivetrain', name: 'Differential', levels: ['Stock', 'Sport LSD', 'Race LSD', 'Drift'], base: [0, 1200, 2600, 2200],
    fx: (d, lv) => {
      if (!lv) return;
      d.diffAccel = [0, 0.45, 0.65, 0.9][lv]; d.diffDecel = [0, 0.2, 0.35, 0.6][lv];
      d.assist = (d.assist ?? 0.55) * [1, 1.05, 1.1, 0.8][lv];
      d.launch = (d.launch ?? 1) * [1, 1.03, 1.05, 1.0][lv];
      if (lv === 3) d.slipFalloff = (d.slipFalloff ?? 0.06) + 0.02;
    } },
  { id: 'awd', cat: 'drivetrain', name: 'Drivetrain swap', levels: ['Stock', 'AWD conversion'], base: [0, 9000], fx: (d, lv) => { if (lv && d.drive !== 'AWD') { d.drive = 'AWD'; d.mass += 70; d.eff = 0.85; } } },
  // TYRES
  { id: 'compound', cat: 'tyres', name: 'Tyre compound', tyre: true },
  { id: 'widthF', cat: 'tyres', name: 'Front tyre width', levels: ['Stock', '+10 mm', '+20 mm', '+30 mm'], base: [0, 400, 900, 1500], fx: (d, lv) => { d.gripF = (d.gripF ?? 1) * (1 + 0.012 * lv); d.mass += 1.5 * lv; d.cdaMul = (d.cdaMul || 1) * (1 + 0.004 * lv); } },
  { id: 'widthR', cat: 'tyres', name: 'Rear tyre width', levels: ['Stock', '+10 mm', '+20 mm', '+40 mm'], base: [0, 400, 900, 1700], fx: (d, lv) => { d.gripR = (d.gripR ?? 1) * (1 + [0, 0.012, 0.024, 0.042][lv]); d.mass += 1.5 * lv; d.cdaMul = (d.cdaMul || 1) * (1 + 0.004 * lv); } },
  // AERO
  { id: 'aeroF', cat: 'aero', name: 'Front aero', levels: ['Stock', 'Sport splitter', 'Race splitter'], base: [0, 1200, 2600], fx: (d, lv) => { if (!lv) return; d.downforce = (d.downforce ?? 0) + [0, 0.18, 0.36][lv]; d.aeroF = (d.aeroF || 0) + [0, 0.18, 0.36][lv]; d.cdaMul = (d.cdaMul || 1) * [1, 1.02, 1.04][lv]; d.gripF = (d.gripF ?? 1) * [1, 1.01, 1.02][lv]; } },
  { id: 'aeroR', cat: 'aero', name: 'Rear wing', levels: ['Stock', 'Sport wing', 'Race wing'], base: [0, 1500, 3200], fx: (d, lv) => { if (!lv) return; d.downforce = (d.downforce ?? 0) + [0, 0.3, 0.62][lv]; d.aeroR = (d.aeroR || 0) + [0, 0.3, 0.62][lv]; d.cdaMul = (d.cdaMul || 1) * [1, 1.05, 1.1][lv]; d.gripR = (d.gripR ?? 1) * [1, 1.015, 1.03][lv]; d.wing = lv; } },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
export const UPGRADE_CATS = [['engine', 'Engine'], ['platform', 'Platform & handling'], ['drivetrain', 'Drivetrain'], ['tyres', 'Tyres & rims'], ['aero', 'Aero']];

/** options available for one part on one car: [{ value, name, price, desc }] (value 0 = stock) */
export function partOptions(u, def) {
  const vs = valueScale(def);
  if (u.tyre) {
    const stock = def.tyre || 'street';
    return TYRE_ORDER.filter(t => t !== 'vintage' || stock === 'vintage').map(t => ({ value: t, name: TYRES[t].name + (t === stock ? ' (stock)' : ''), price: t === stock ? 0 : Math.round(TYRES[t].price * vs / 50) * 50 }));
  }
  if (u.swap) {
    const list = [{ value: 0, name: 'Stock ' + (def.eng || def.engine), price: 0 }];
    for (const id of def.swaps || []) { const s = SWAPS[id]; if (s) list.push({ value: id, name: s.name, price: Math.round(s.price * Math.sqrt(vs) / 100) * 100 }); }
    return list;
  }
  if ((u.noEV && def.ev) || (u.id === 'awd' && def.drive === 'AWD')) return [{ value: 0, name: 'Stock', price: 0 }];
  return u.levels.map((name, i) => ({ value: i, name, price: Math.round(u.base[i] * vs / 50) * 50 }));
}
export function partAvailable(u, def) { return partOptions(u, def).length > 1; }

/** apply upgrades to a stock roster def -> new def (never mutates). up = { partId: value } */
export function applyUpgrades(def, up = {}, ctx = {}) {
  const d = { ...def, gears: def.gears.slice() };
  // engine swap first (replaces the base engine), then bolt-ons scale it
  if (up.swap && SWAPS[up.swap] && (def.swaps || []).includes(up.swap)) {
    const s = SWAPS[up.swap];
    Object.assign(d, { engine: s.engine, eng: s.eng, asp: s.asp, torque: s.torque, redline: s.redline, idle: s.idle, ev: !!s.ev });
    d.mass += s.mass;
    if (s.ev) { d.gearsN = 1; d.gears = [1]; }
    const g = designGears({ n: d.gearsN, v1: d.v1, top: d.top * (s.ev ? 1 : 1.04), redline: d.redline, r: ctx.r });
    d.gears = g.gears; d.final = g.final;
    // top speed target follows the power gain so the car is not rev-limited: sqrt law on the drag balance
    d.swapPowerRatio = peakPower(s.torque, s.redline).kw / Math.max(1, peakPower(def.torque, def.redline).kw);
  }
  for (const u of UPGRADES) {
    if (u.tyre || u.swap) continue;
    const lv = up[u.id] | 0;
    if (!lv || !partAvailable(u, d)) continue;
    u.fx(d, Math.min(lv, u.levels.length - 1), ctx);
  }
  if (up.compound && TYRES[up.compound]) d.tyre = up.compound;
  // bolt-on power raises the geared top speed a little (taller final drive) so gains show up at the top end too
  const pr = peakPower(d.torque, d.redline).kw / Math.max(1, peakPower(def.torque, def.redline).kw);
  d.powerRatio = pr;
  if (!d.ev && pr > 1.02 && !d.tunableGears) {
    const vt = def.top * Math.cbrt(pr) * (d.cdaMul ? 1 / Math.cbrt(d.cdaMul) : 1);
    const g = designGears({ n: d.gearsN, v1: d.v1, top: Math.min(vt, def.top * 1.35), redline: d.redline, r: ctx.r });
    d.gears = g.gears; d.final = g.final;
  } else if (d.ev && pr > 1.02) {
    const w = (def.top * Math.cbrt(pr) / 3.6) / ctx.r * 60 / (2 * Math.PI); d.final = +(d.redline * 0.955 / w).toFixed(3);
  }
  return d;
}

// ------------------------------------------------------------------ roster def -> physics params
/**
 * def: roster entry (possibly upgraded). spec: model spec. stock: the stock roster def (for the drag area, which is a
 * property of the body, not of the engine).
 */
export function deriveParams(def, spec, stock = def) {
  const P = { ...def };
  P.gears = def.gears.slice();
  // wheel efficiency: drivetrain losses + rotating inertia (physics has no rotational inertia, so fold it in here)
  P.eff = def.eff ?? effOf(def);
  P.torque = def.torque;
  // body drag area from the stock car's design top speed (drag balances the stock drive force at the stock top speed),
  // capped per body type: short-geared cars (trucks, rally cars) run into the rev limiter instead
  P.cda = stockCda(stock, spec) * (def.cdaMul || 1) + (def.aeroF || 0) * 0.08 + (def.aeroR || 0) * 0.12;
  P.idle = def.ev ? 400 : (def.idle || 800);
  const tyre = TYRES[def.tyre || 'street'] || TYRES.street;
  const massRatio = (stock.mass || def.mass) / def.mass;
  // tyre load sensitivity: a lighter car on the same tyres grips a touch better
  P.grip = def.grip * tyre.grip / (TYRES[stock.tyre || 'street']?.grip || 1) * Math.pow(massRatio, 0.08);
  P.slipPeak = def.slipPeak ?? tyre.peak;
  P.slipFalloff = def.slipFalloff ?? tyre.falloff;
  if (def.tyre && stock.tyre && def.tyre !== stock.tyre) { P.slipPeak = tyre.peak; P.slipFalloff = Math.max(tyre.falloff, (def.slipFalloff ?? 0) - (stock.slipFalloff ?? 0) + tyre.falloff); }
  P.offGrip = tyre.off;
  // limit balance: road cars are set up to understeer a touch at the limit (the rear keeps a margin), so lifting
  // mid-corner does not snap the tail. `stab` 0 = neutral (drift builds), default 0.05.
  P.gripR = (def.gripR ?? 1) * (1 + (def.stab ?? 0.05));
  // centre of mass: engine placement sets the static split; ride height moves it up/down
  const L = spec.axleRZ - spec.axleFZ;
  const fr = def.frontBias ?? ({ F: 0.54, FWD: 0.61, M: 0.42, R: 0.39 }[def.layoutBias] ?? 0.53);
  P.comZ = spec.axleFZ + L * (1 - fr);
  P.frontBias = fr;
  P.travel = def.travel ?? 0.26;
  if (def.ride) P.travel = Math.max(0.12, P.travel + def.ride);
  P.comY = (def.comY ?? Math.max(0.4, spec.height * 0.34)) + (def.ride || 0) * 0.8;
  P.brake = def.brake ?? (def.mass > 3000 ? 0.7 : 1.1);
  P.yawDamp = def.yawDamp ?? 0.28;
  P.steerSpeed = def.steerSpeed ?? 26;
  P.airControl = def.mass > 3000 ? 0.2 : 1.0;
  P.downforce = def.downforce ?? 0.1;
  P.shiftTime = def.shiftTime ?? shiftOf(def);
  if (def.springMul) { const kS = def.mass * G0 / 4 / (P.travel * 0.42); P.spring = kS * def.springMul; P.damper = 2 * 0.34 * Math.sqrt(P.spring * def.mass / 4); }
  return P;
}
export const effOf = d => (d.ev ? 0.86 : d.drive === 'AWD' ? 0.77 : 0.8);
// gearbox shift time by type/era: 'dct' 0.1, 'seq' 0.09, 'auto' modern 0.18 / old 0.4, manual by era
export function shiftOf(d) {
  if (d.ev) return 0.12;
  const b = d.box || (d.year >= 2005 ? 'auto' : 'manual');
  if (b === 'dct') return 0.1;
  if (b === 'seq') return 0.09;
  if (b === 'auto') return d.year >= 2005 ? 0.18 : 0.42;
  return d.year < 1975 ? 0.36 : d.year < 2000 ? 0.3 : 0.24;
}
const cdaCache = new Map();
export function stockCda(stock, spec) {
  const key = stock.key || stock.name;
  if (key && cdaCache.has(key)) return cdaCache.get(key);
  const vTop = stock.top / 3.6, r = spec.wheelRadius, eff = stock.eff ?? effOf(stock);
  // best drive force available at vTop over the gears (same torque curve as physics)
  let F = 0;
  for (const g of stock.gears) {
    const rpm = vTop / r * g * stock.final * 60 / (2 * Math.PI);
    if (rpm > stock.redline * 0.985) continue;
    F = Math.max(F, stock.torque * torqueCurve(rpm / stock.redline) * g * stock.final * eff / r);
  }
  if (!F) { const g = stock.gears[stock.gears.length - 1]; F = stock.torque * torqueCurve(0.97) * g * stock.final * eff / r; }
  const cda = Math.min(stock.cdaMax ?? 1.35, Math.max(0.3, (F - stock.mass * G0 * 0.012) / (0.6 * vTop * vTop)));
  if (key) cdaCache.set(key, cda);
  return cda;
}

// ------------------------------------------------------------------ tuning (sliders)
// Every slider: { id, group, name, min, max, step, unit, def(P, spec, def), apply(P, v, ctx), phys: 'supported'|'proxy', param }
export const TUNE = [
  { id: 'pressF', group: 'Tyres', name: 'Front pressure', min: 18, max: 45, step: 0.5, unit: 'psi', def: () => 32, param: 'tyrePressF', phys: 'proxy',
    apply(P, v) { P.tyrePressF = v; const d = v - 32; P.gripF = (P.gripF ?? 1) * (1 - 0.00035 * d * d); P.slipPeakF = (P.slipPeak ?? 0.13) * (1 - d * 0.006); } },
  { id: 'pressR', group: 'Tyres', name: 'Rear pressure', min: 18, max: 45, step: 0.5, unit: 'psi', def: () => 32, param: 'tyrePressR', phys: 'proxy',
    apply(P, v) { P.tyrePressR = v; const d = v - 32; P.gripR = (P.gripR ?? 1) * (1 - 0.00035 * d * d); } },
  { id: 'final', group: 'Gearing', name: 'Final drive', min: 2.2, max: 6.2, step: 0.01, unit: ':1', def: P => P.final, param: 'final', phys: 'supported', needs: 'trans',
    apply(P, v) { P.final = v; } },
  { id: 'spread', group: 'Gearing', name: 'Ratio spread', min: 0.8, max: 1.2, step: 0.01, unit: 'x', def: () => 1, param: 'gears', phys: 'supported', needs: 'trans',
    apply(P, v) { if (P.gears.length < 2) return; const top = P.gears[P.gears.length - 1]; P.gears = P.gears.map(g => +(top * Math.pow(g / top, v)).toFixed(3)); } },
  { id: 'camberF', group: 'Alignment', name: 'Front camber', min: -5, max: 1, step: 0.1, unit: '°', def: () => -1.0, param: 'camberF', phys: 'proxy', needs: 'springs',
    apply(P, v) { P.camberF = v; P.gripF = (P.gripF ?? 1) * (1 + 0.01 * (1 - Math.pow((v + 2.2) / 2.2, 2))); P.brake *= 1 - Math.max(0, -v - 2) * 0.01; } },
  { id: 'camberR', group: 'Alignment', name: 'Rear camber', min: -5, max: 1, step: 0.1, unit: '°', def: () => -1.0, param: 'camberR', phys: 'proxy', needs: 'springs',
    apply(P, v) { P.camberR = v; P.gripR = (P.gripR ?? 1) * (1 + 0.01 * (1 - Math.pow((v + 1.6) / 1.6, 2))); } },
  { id: 'toeF', group: 'Alignment', name: 'Front toe', min: -1, max: 1, step: 0.05, unit: '°', def: () => 0, param: 'toeF', phys: 'proxy', needs: 'springs',
    apply(P, v) { P.toeF = v; P.steerSpeed *= 1 - v * 0.12; P.yawDamp *= 1 + v * 0.1; } },
  { id: 'toeR', group: 'Alignment', name: 'Rear toe', min: -1, max: 1, step: 0.05, unit: '°', def: () => 0.1, param: 'toeR', phys: 'proxy', needs: 'springs',
    apply(P, v) { P.toeR = v; P.yawDamp *= 1 + (v - 0.1) * 0.35; P.gripR = (P.gripR ?? 1) * (1 + (v - 0.1) * 0.015); } },
  { id: 'caster', group: 'Alignment', name: 'Caster', min: 3, max: 8, step: 0.1, unit: '°', def: () => 5.5, param: 'caster', phys: 'proxy', needs: 'springs',
    apply(P, v) { P.caster = v; P.assist = (P.assist ?? 0.55) * (1 + (v - 5.5) * 0.06); } },
  { id: 'arbF', group: 'Anti-roll bars', name: 'Front', min: 1, max: 65, step: 1, unit: '', def: () => 30, param: 'antiRollF', phys: 'proxy', needs: 'arb',
    apply(P, v, c) { P.antiRollF = v; c.arbF = v; } },
  { id: 'arbR', group: 'Anti-roll bars', name: 'Rear', min: 1, max: 65, step: 1, unit: '', def: () => 30, param: 'antiRollR', phys: 'proxy', needs: 'arb',
    apply(P, v, c) { P.antiRollR = v; c.arbR = v; } },
  { id: 'springF', group: 'Springs', name: 'Front stiffness', min: 0.6, max: 1.8, step: 0.01, unit: 'x', def: () => 1, param: 'springF', phys: 'proxy', needs: 'springs',
    apply(P, v, c) { P.springF = v; c.springF = v; } },
  { id: 'springR', group: 'Springs', name: 'Rear stiffness', min: 0.6, max: 1.8, step: 0.01, unit: 'x', def: () => 1, param: 'springR', phys: 'proxy', needs: 'springs',
    apply(P, v, c) { P.springR = v; c.springR = v; } },
  { id: 'ride', group: 'Springs', name: 'Ride height', min: -6, max: 8, step: 0.5, unit: 'cm', def: () => 0, param: 'travel', phys: 'supported', needs: 'springs',
    apply(P, v) { P.rideF = P.rideR = v; P.travel = Math.max(0.12, P.travel + v / 100); P.comY += v / 100 * 0.8; } },
  { id: 'damp', group: 'Damping', name: 'Damper stiffness', min: 0.6, max: 1.8, step: 0.01, unit: 'x', def: () => 1, param: 'damper', phys: 'supported', needs: 'springs',
    apply(P, v) { P.damperMul = v; } },
  { id: 'aeroF', group: 'Aero', name: 'Front downforce', min: 0.5, max: 1.5, step: 0.01, unit: 'x', def: () => 1, param: 'aeroF', phys: 'proxy', needs: 'aeroF',
    apply(P, v) { const a = P.aeroF || 0; P.downforce += a * (v - 1); P.cda += a * 0.08 * (v - 1); P.gripF = (P.gripF ?? 1) * (1 + 0.02 * (v - 1)); } },
  { id: 'aeroR', group: 'Aero', name: 'Rear downforce', min: 0.5, max: 1.5, step: 0.01, unit: 'x', def: () => 1, param: 'aeroR', phys: 'proxy', needs: 'aeroR',
    apply(P, v) { const a = P.aeroR || 0; P.downforce += a * (v - 1); P.cda += a * 0.12 * (v - 1); P.gripR = (P.gripR ?? 1) * (1 + 0.03 * (v - 1)); } },
  { id: 'bias', group: 'Brakes', name: 'Balance (front)', min: 40, max: 70, step: 1, unit: '%', def: () => 57, param: 'brakeBias', phys: 'proxy', needs: 'brakes',
    apply(P, v) { P.brakeBias = v / 100; P.brake *= 1 - Math.abs(v - 60) * 0.004; } },
  { id: 'bpress', group: 'Brakes', name: 'Pressure', min: 70, max: 130, step: 1, unit: '%', def: () => 100, param: 'brake', phys: 'supported', needs: 'brakes',
    apply(P, v) { P.brake *= v / 100; } },
  { id: 'diffA', group: 'Differential', name: 'Acceleration lock', min: 0, max: 100, step: 1, unit: '%', def: P => Math.round((P.diffAccel ?? 0.25) * 100), param: 'diffAccel', phys: 'proxy', needs: 'diff',
    apply(P, v) { P.diffAccel = v / 100; P.assist = (P.assist ?? 0.55) * (1.1 - v / 100 * 0.25); P.slipFalloff = (P.slipFalloff ?? 0.06) + (v / 100 - 0.5) * 0.02; } },
  { id: 'diffD', group: 'Differential', name: 'Deceleration lock', min: 0, max: 100, step: 1, unit: '%', def: P => Math.round((P.diffDecel ?? 0.1) * 100), param: 'diffDecel', phys: 'proxy', needs: 'diff',
    apply(P, v) { P.diffDecel = v / 100; P.yawDamp *= 1 + (v / 100 - 0.2) * 0.2; } },
  { id: 'awd', group: 'Differential', name: 'AWD front torque', min: 10, max: 90, step: 1, unit: '%', def: () => 40, param: 'awdFront', phys: 'proxy', needs: 'awdCar',
    apply(P, v) { P.awdFront = v / 100; P.assist = (P.assist ?? 0.55) * (1 + (v / 100 - 0.4) * 0.3); } },
];
export const TUNE_BY_ID = Object.fromEntries(TUNE.map(t => [t.id, t]));
export function tuneAvailable(t, def, up = {}) {
  if (!t.needs) return true;
  if (t.needs === 'awdCar') return def.drive === 'AWD' || up.awd > 0;
  if (t.needs === 'trans') return !def.ev && (up.trans > 0 || def.tunable === true);
  if (t.needs === 'aeroF') return (up.aeroF > 0) || (def.aeroF > 0);
  if (t.needs === 'aeroR') return (up.aeroR > 0) || (def.aeroR > 0);
  return (up[t.needs] | 0) > 0 || def.tunable === true;
}
/** apply tuning sliders (only the ones present in tune) */
export function applyTune(P, tune = {}, spec = null) {
  const c = {};
  for (const t of TUNE) if (tune[t.id] != null && Number.isFinite(+tune[t.id])) t.apply(P, +tune[t.id], c);
  // ARB + spring split -> single physics values + balance proxy (stiffer front = more understeer)
  if (c.arbF != null || c.arbR != null) {
    const f = (c.arbF ?? 30) / 30, r = (c.arbR ?? 30) / 30;
    P.antiRoll = (P.antiRoll ?? 0.5) * (f + r) / 2;
    const bal = clamp((r - f) * 0.025, -0.05, 0.05);
    P.gripF = (P.gripF ?? 1) * (1 + bal); P.gripR = (P.gripR ?? 1) * (1 - bal);
  }
  if (c.springF != null || c.springR != null) {
    const f = c.springF ?? 1, r = c.springR ?? 1, kS = P.mass * G0 / 4 / (P.travel * 0.42);
    P.spring = (P.spring ?? kS) * (f + r) / 2;
    const bal = clamp((r - f) * 0.02, -0.03, 0.03);
    P.gripF = (P.gripF ?? 1) * (1 + bal); P.gripR = (P.gripR ?? 1) * (1 - bal);
  }
  if (P.damperMul) { const k = P.spring ?? P.mass * G0 / 4 / (P.travel * 0.42); P.damper = 2 * 0.32 * Math.sqrt(k * P.mass / 4) * P.damperMul; }
  if (P.slipPeakF) { P.slipPeak = (P.slipPeak + P.slipPeakF) / 2; delete P.slipPeakF; }
  void spec;
  return P;
}

// ------------------------------------------------------------------ performance model (quasi steady state)
function axleGeom(P, spec) {
  const L = spec.axleRZ - spec.axleFZ;
  const a = P.comZ - spec.axleFZ, b = spec.axleRZ - P.comZ;
  return { L, a, b, h: P.comY };
}
const wheelsDriven = drive => (drive === 'AWD' ? [1, 1] : drive === 'FWD' ? [1, 0] : [0, 1]);

/** straight-line run at full throttle from rest (1D replica of the physics drivetrain). */
export function straightRun(P, spec, { dt = 1 / 120, tMax = 70, vStop = 1e9 } = {}) {
  const m = P.mass, r = spec.wheelRadius, n = P.gears.length, { L, a, b, h } = axleGeom(P, spec);
  const [dF, dR] = wheelsDriven(P.drive), nd = (dF + dR) * 2;
  const gF = P.grip * (P.gripF ?? 1), gR = P.grip * (P.gripR ?? 1);
  let v = 0, t = 0, gear = 1, rpm = P.idle, shiftT = 0, acc = 0, x = 0;
  const out = { t60: null, t100: null, t160: null, t200: null, t300: null, q400: null, vmax: 0, table: [] };
  let lastV = 0, stall = 0;
  while (t < tMax) {
    const wheelRpm = v / r * 60 / (2 * Math.PI);
    const ratio = P.gears[gear - 1];
    let rr = wheelRpm * ratio * P.final;
    const launchRpm = P.idle + (P.redline * 0.55 - P.idle);
    if (rr < launchRpm && gear === 1) rr += (launchRpm - rr) * 0.85;
    rr = clamp(rr, P.idle, P.redline * 1.02);
    rpm += (rr - rpm) * Math.min(1, dt * 18);
    if (shiftT > 0) shiftT -= dt;
    else if (rpm > P.redline * 0.93 && gear < n) { gear++; shiftT = P.shiftTime ?? 0.18; }
    let T = P.torque * torqueCurve(rpm / P.redline);
    if (rpm >= P.redline) T = 0;
    if (shiftT > 0) T *= 0.1;
    const Fdrive = T * P.gears[gear - 1] * P.final * (P.eff ?? 0.88) / r;
    // axle loads with longitudinal transfer (from last step's accel) + downforce
    const df = (P.downforce ?? 0.4) * v * v;
    const Wf = (m * G0 + df) * b / L - m * acc * h / L, Wr = (m * G0 + df) * a / L + m * acc * h / L;
    const per = Fdrive / nd;
    let Fx = 0;
    if (dF) Fx += 2 * Math.min(per, Math.max(0, Wf / 2) * gF * 1.05);
    if (dR) Fx += 2 * Math.min(per, Math.max(0, Wr / 2) * gR * 1.05);
    const drag = 0.6 * P.cda * v * v, roll = Math.min(1, v) * m * G0 * 0.012;
    acc = (Fx - drag - roll) / m;
    v = Math.max(0, v + acc * dt); x += v * dt; t += dt;
    const kmh = v * 3.6;
    if (out.t60 === null && kmh >= 96.56) out.t60 = t;
    if (out.t100 === null && kmh >= 100) out.t100 = t;
    if (out.t160 === null && kmh >= 160) out.t160 = t;
    if (out.t200 === null && kmh >= 200) out.t200 = t;
    if (out.t300 === null && kmh >= 300) out.t300 = t;
    if (out.q400 === null && x >= 402.3) out.q400 = t;
    if (kmh > out.vmax) out.vmax = kmh;
    if ((out.table.length === 0 || v - out.table[out.table.length - 1][0] >= 1) && shiftT <= 0) out.table.push([v, acc]);
    if (v >= vStop) break;
    if (Math.abs(v - lastV) < 1e-5 * dt && t > 5) { if (++stall > 240) break; } else stall = 0;
    lastV = v;
  }
  out.gearsUsed = gear;
  return out;
}
/** max forward accel available at speed v (m/s), from the straight-run table */
function accelAt(tbl, v) {
  if (!tbl.length) return 0;
  if (v <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) if (tbl[i][0] >= v) { const [v0, a0] = tbl[i - 1], [v1, a1] = tbl[i]; return lerp(a0, a1, (v - v0) / Math.max(1e-6, v1 - v0)); }
  return Math.min(0, tbl[tbl.length - 1][1]);
}
/** braking decel (m/s^2) at speed v, full brake, throttle off */
export function brakeDecel(P, spec, v) {
  const m = P.mass, { L, a, b, h } = axleGeom(P, spec);
  const gF = P.grip * (P.gripF ?? 1), gR = P.grip * (P.gripR ?? 1);
  const df = (P.downforce ?? 0.4) * v * v, drag = 0.6 * P.cda * v * v, roll = m * G0 * 0.012;
  const bf = (P.brake ?? 1.1) * m * G0 / 4;
  const [dF, dR] = wheelsDriven(P.drive), nd = (dF + dR) * 2;
  const eb = (P.engineBrake ?? 0.06) * m * G0 * Math.min(1, v / 8) / nd;
  let dec = 5;
  for (let it = 0; it < 6; it++) {
    const Wf = (m * G0 + df) * b / L + m * dec * h / L, Wr = Math.max(0, (m * G0 + df) * a / L - m * dec * h / L);
    const f = 2 * Math.min(bf * 1.15 + (dF ? eb : 0), Wf / 2 * gF * 1.05), r = 2 * Math.min(bf * 0.85 + (dR ? eb : 0), Wr / 2 * gR * 1.05);
    dec = (f + r + drag + roll) / m;
  }
  return dec * 0.955;
}
export function brakingDistance(P, spec, v0 = 100 / 3.6) {
  let v = v0, x = 0; const dt = 1 / 240;
  while (v > 0.05) { const d = brakeDecel(P, spec, v); v -= d * dt; x += Math.max(0, v) * dt; }
  return x;
}
/** steady-state lateral acceleration (m/s^2) at speed v on asphalt, including yaw damping and downforce */
export function lateralAccel(P, spec, v) {
  const m = P.mass, { L, a, b } = axleGeom(P, spec);
  const k = Math.min(P.latStiff ?? 1, 1.05);
  const df = (P.downforce ?? 0.4) * v * v;
  const capF = P.grip * (P.gripF ?? 1) * k * (m * G0 + df) * b / L;
  const capR = P.grip * (P.gripR ?? 1) * k * (m * G0 + df) * a / L;
  const yd = (P.yawDamp ?? 0.6) * 0.9 * m / Math.max(3, v);  // yaw damping torque per unit lateral accel
  // front: m*ay*b/L + yd*ay/L <= capF ; rear: m*ay*a/L - yd*ay/L <= capR
  const aF = capF / (m * b / L + yd / L), aR = capR / Math.max(1e-6, m * a / L - yd / L);
  return Math.min(aF, aR);
}

// ------------------------------------------------------------------ reference circuit (PI) + QSS lap sim
// A 5.1 km mixed road course: city 90s, a hairpin, esses, fast sweepers and two long straights. [length m, radius m (0 = straight)]
export const REF_TRACK = [
  [420, 0], [38, 22], [160, 0], [45, 28], [240, 0], [70, 60], [60, 0], [70, -60], [520, 0], [32, 14], [260, 0],
  [150, 180], [300, 0], [110, -95], [90, 0], [45, 30], [45, -30], [45, 30], [380, 0], [230, 340], [640, 0], [55, 35], [180, 0], [120, -120], [340, 0], [40, 18], [40, 0],
];
export function lapSim(P, spec, track = REF_TRACK, run = null, ds = 2) {
  run = run || straightRun(P, spec, { tMax: 60 });
  const pts = [];
  for (const [len, R] of track) { const n = Math.max(1, Math.round(len / ds)); for (let i = 0; i < n; i++) pts.push(R ? Math.abs(R) : Infinity); }
  const N = pts.length;
  // corner speed limits (iterate for downforce)
  const vLim = pts.map(R => {
    if (!Number.isFinite(R)) return 200;
    let v = 20; for (let i = 0; i < 8; i++) v = Math.sqrt(lateralAccel(P, spec, v) * R);
    return v;
  });
  const aLatMax = v => lateralAccel(P, spec, v);
  const vmaxMS = run.vmax / 3.6;
  // driven-axle combined slip on corner exit: the driven tyres carry their share of the cornering force AND the drive
  // force (physics.js clamps each wheel on its own friction circle). This is what makes big RWD power hard to use.
  const m = P.mass, { L, a, b, h } = axleGeom(P, spec), k = Math.min(P.latStiff ?? 1, 1.05) * 1.05;
  const [dF, dR] = wheelsDriven(P.drive);
  const tracLimit = (v, alat, acc) => {
    const df = (P.downforce ?? 0.4) * v * v;
    const Wf = Math.max(0, (m * G0 + df) * b / L - m * acc * h / L), Wr = (m * G0 + df) * a / L + m * acc * h / L;
    const capF = P.grip * (P.gripF ?? 1) * k * Wf, capR = P.grip * (P.gripR ?? 1) * k * Wr;
    const FyF = m * alat * b / L, FyR = m * alat * a / L;
    const avF = Math.sqrt(Math.max(0, capF * capF - FyF * FyF)), avR = Math.sqrt(Math.max(0, capR * capR - FyR * FyR));
    const F = (dF ? avF : 0) + (dR ? avR : 0);
    return (F - 0.6 * P.cda * v * v - m * G0 * 0.012) / m;
  };
  // forward pass (lap is closed: run twice so the start speed is the flying lap)
  let v = 10; const vf = new Array(N);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    v = Math.min(v, vLim[i]);
    vf[i] = v;
    const R = pts[i], alat = Number.isFinite(R) ? v * v / R : 0, am = aLatMax(v);
    let along = accelAt(run.table, v) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, alat / am), 2)));
    if (alat > 0.3) along = Math.min(along, tracLimit(v, alat, along));
    v = Math.min(vmaxMS, Math.sqrt(Math.max(0, v * v + 2 * Math.max(0, along) * ds)));
  }
  // backward pass (braking)
  const vb = vf.slice(); v = vb[0];
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) {
    v = Math.min(v, vf[i]); vb[i] = v;
    const R = pts[i], alat = Number.isFinite(R) ? v * v / R : 0, am = aLatMax(v);
    const dec = brakeDecel(P, spec, v) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, alat / am), 2)));
    v = Math.sqrt(v * v + 2 * dec * ds);
  }
  let t = 0; for (let i = 0; i < N; i++) t += ds / Math.max(0.5, vb[i]);
  return { time: t, length: N * ds, avg: N * ds / t * 3.6 };
}

// ------------------------------------------------------------------ PI + stats
// PI maps the reference lap time onto 100..999 (log scale on pace). Calibrated once so a stock 70 hp microcar sits
// near 100, a city hatch ~350, a '68 fastback ~560, a 911-class car ~800 and a 1500 hp hypercar ~970.
// Anchors (reference lap s -> PI) chosen once for the class bands: ~205 s microcar, ~165 s city hatch (D), ~152 s
// classic muscle (C), ~142 s modern muscle (B), ~131 s 911-class (A), ~121 s supercar (S1), ~113 s hypercar (S2).
export const PI_ANCHORS = [[230, 100], [205, 115], [185, 250], [165, 420], [152, 560], [142, 660], [131, 765], [121, 870], [113, 945], [107, 985], [101, 999]];
export function piFromLap(t) {
  const A = PI_ANCHORS;
  if (t >= A[0][0]) return 100;
  if (t <= A[A.length - 1][0]) return 999;
  // piecewise-linear in log(time) (monotone: faster lap = higher PI, always)
  for (let i = 1; i < A.length; i++) if (t >= A[i][0]) {
    const [t0, p0] = A[i - 1], [t1, p1] = A[i], u = Math.log(t0 / t) / Math.log(t0 / t1);
    return Math.round(clamp(p0 + (p1 - p0) * u, 100, 999));
  }
  return 999;
}
const logMap = (t, tBest, tWorst) => clamp(10 * Math.log(tWorst / t) / Math.log(tWorst / tBest), 0, 10);
export function measure(P, spec, { fast = false } = {}) {
  const run = straightRun(P, spec, fast ? { tMax: 45, dt: 1 / 60 } : { tMax: 70 });
  const brake100 = brakingDistance(P, spec);
  const lat60 = lateralAccel(P, spec, 60 / 3.6) / G0, lat120 = lateralAccel(P, spec, 120 / 3.6) / G0, lat200 = lateralAccel(P, spec, 200 / 3.6) / G0;
  const lap = lapSim(P, spec, REF_TRACK, run, fast ? 4 : 2);
  const pi = piFromLap(lap.time);
  const pw = peakPower(P.torque, P.redline);
  const off = offroadScore(P, spec);
  const stats = {
    speed: +clamp((run.vmax - 100) / 32, 0, 10).toFixed(1),
    handling: +clamp(((lat60 + lat120 * 2 + lat200) / 4 - 0.62) / 0.085, 0, 10).toFixed(1),
    accel: +(run.t160 ? logMap(run.t160, 4.2, 42) : 0).toFixed(1),
    launch: +(run.t100 ? logMap(run.t100, 1.9, 20) : 0).toFixed(1),
    braking: +clamp((58 - brake100) / 3.0, 0, 10).toFixed(1),
    offroad: +off.toFixed(1),
  };
  return {
    pi, cls: classOfPI(pi), stats,
    t60: run.t60, t100: run.t100, t160: run.t160, t200: run.t200, q400: run.q400, vmax: run.vmax,
    brake100, lat60, lat120, lat200, lap: lap.time, lapAvg: lap.avg,
    hp: pw.hp, kw: pw.kw, powerRpm: pw.rpm, pw: pw.kw / P.mass * 1000,
  };
}
export function offroadScore(P, spec) {
  let s = P.drive === 'AWD' ? 3.2 : P.drive === 'RWD' ? 1.4 : 1.6;
  s += clamp((P.travel - 0.24) * 16, -1, 4);
  s += clamp((spec.bodyBottomY - 0.16) * 11, -1, 3.2);
  s += ((P.offGrip ?? 1) - 1) * 6;
  s += P.offBonus || 0;
  s -= clamp((P.downforce ?? 0) * 0.8, 0, 1.5);
  return clamp(s, 0, 10);
}
