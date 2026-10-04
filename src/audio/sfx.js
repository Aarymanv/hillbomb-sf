// HILLBOMB audio: vehicle, world and UI sound effects.
// Recorded CC0 samples (see public/assets/audio/manifest.json) drive everything; the few tiny synthesised
// fallbacks only run while a sample is still loading or missing, so nothing is ever silent or throws.
// Continuous voices (tyres, wind, scrape, horns, sirens) keep a small fixed graph; one-shots go through the
// bounded ShotPools owned by the core (voice stealing, see shots.js).

import { clamp, num, rand, smoothstep, pinkNoise, bellBuffer, mtof } from './dsp.js';
import { Shot, thump, noiseBurst, modal, distGain, distCutoff } from './shots.js';

function setTo(param, v, now, tau) {
  try { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tau); } catch (e) { param.value = v; }
}
/** keep-alive: if the game stops calling update, the level falls to 0 by itself */
function keep(param, v, now, tau, hold = 0.3) {
  try { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tau); param.setTargetAtTime(0, now + hold, 0.1); } catch (e) { param.value = v; }
}

// ---------------------------------------------------------------------------------------------- loop layer
/** a looping sample (or a filtered-noise stand-in until the sample decodes) with its own gain */
class LoopLayer {
  constructor(core, key, dest, fallback) {
    this.core = core;
    this.key = key;
    this.dest = dest;
    this.fallback = fallback; // { type, f, q } filter over shared noise, or null
    this.g = core.ctx.createGain();
    this.g.gain.value = 0;
    this.g.connect(dest);
    this.src = null;
    this.fb = null;
    this.mode = 'none';
    this.rate = 1;
  }
  _sync() {
    const keys = Array.isArray(this.key) ? this.key : [this.key];
    let a = null;
    for (const k of keys) { a = this.core.assets && this.core.assets.ready(k); if (a) break; }
    if (a && this.mode !== 'sample') {
      const ctx = this.core.ctx, s = ctx.createBufferSource();
      s.buffer = this.core.assets.buf(a.file);
      s.loop = true; s.loopStart = a.loopStart; s.loopEnd = a.loopEnd;
      s.playbackRate.value = this.rate;
      s.connect(this.g);
      s.start(0, a.loopStart + Math.random() * (a.loopEnd - a.loopStart));
      if (this.fb) { try { this.core.noiseA.disconnect(this.fb); this.fb.disconnect(); } catch (e) { /* ignore */ } this.fb = null; }
      this.src = s;
      this.mode = 'sample';
    } else if (!a && this.mode === 'none' && this.fallback && this.core.noiseA) {
      const ctx = this.core.ctx, f = ctx.createBiquadFilter();
      f.type = this.fallback.type; f.frequency.value = this.fallback.f; f.Q.value = this.fallback.q || 0.7;
      this.core.noiseA.connect(f); f.connect(this.g);
      this.fb = f;
      this.fbGain = this.fallback.gain || 1;
      this.mode = 'fallback';
    }
  }
  set(v, now, tau = 0.05, keepAlive = true) {
    if (v > 0.0005 || this.mode !== 'none') this._sync();
    const g = this.mode === 'fallback' ? v * this.fbGain : v;
    if (keepAlive) keep(this.g.gain, g, now, tau); else setTo(this.g.gain, g, now, tau);
  }
  setRate(r, now) {
    this.rate = r;
    if (this.src) setTo(this.src.playbackRate, r, now, 0.06);
    if (this.fb && this.fallback.track) setTo(this.fb.frequency, this.fallback.f * r, now, 0.06);
  }
}

// ---------------------------------------------------------------------------------------------- tyres
// squeal (full slide) + scrub (grip limit) + surface roll (asphalt/brick/gravel/grass) + wet hiss + road details
// (cable-car rails, crosswalk paint); brake squeal one-shots
export class Tires {
  constructor(core) { this.core = core; this.built = false; this.lastBrakeSq = -9; this.prevSpeed = 0; this.nextRail = 0; this.wob = 0; this.wobT = 0; }
  _ensure() {
    if (this.built) return true;
    const c = this.core;
    if (!c.ctx) return false;
    this.out = c.ctx.createGain();
    this.out.connect(c.fxBus);
    this.squeal = new LoopLayer(c, 'tyre_squeal', this.out, { type: 'bandpass', f: 1400, q: 1.2, gain: 0.5 });
    this.scrub = new LoopLayer(c, 'tyre_scrub', this.out, { type: 'bandpass', f: 1100, q: 0.9, gain: 0.4 });
    this.asphalt = new LoopLayer(c, 'road_asphalt', this.out, { type: 'lowpass', f: 300, q: 0.7, gain: 1.2 });
    this.gravel = new LoopLayer(c, 'road_gravel', this.out, { type: 'bandpass', f: 1800, q: 0.8, gain: 0.6 });
    // grass: a soft low rumble; derived from the gravel loop (slower, low-passed) when no grass recording exists
    this.grassLP = c.ctx.createBiquadFilter();
    this.grassLP.type = 'lowpass'; this.grassLP.frequency.value = 900; this.grassLP.Q.value = 0.5;
    this.grassLP.connect(this.out);
    this.grass = new LoopLayer(c, ['road_grass', 'road_gravel'], this.grassLP, { type: 'bandpass', f: 700, q: 0.7, gain: 0.6 });
    this.wet = new LoopLayer(c, 'road_wet', this.out, { type: 'highpass', f: 2500, q: 0.7, gain: 0.3 });
    // brick / cobbles (Lombard's crooked block, a few plazas): recorded cobble roll
    // (the recording carries the recording car's body boom: high-passed so it reads as texture, not rumble)
    this.cobHP = c.ctx.createBiquadFilter();
    this.cobHP.type = 'highpass'; this.cobHP.frequency.value = 160; this.cobHP.Q.value = 0.6;
    this.cobHP.connect(this.out);
    this.cobble = new LoopLayer(c, ['road_cobble', 'road_gravel'], this.cobHP, { type: 'bandpass', f: 500, q: 0.8, gain: 0.6 });
    this.built = true;
    return true;
  }
  update(o) {
    if (!o || !this._ensure()) return;
    const core = this.core, now = core.ctx.currentTime;
    const slip = clamp(num(o.slip, 0), 0, 1);
    const v = Math.abs(num(o.speed, 0));
    const surf = ['grass', 'dirt', 'gravel', 'sand', 'brick', 'cobble'].includes(o.surface) ? o.surface : 'asphalt';
    const brick = surf === 'brick' || surf === 'cobble';
    const soft = surf !== 'asphalt' && !brick;
    const paint = clamp(num(o.paint, 0), 0, 1), rails = clamp(num(o.rails, 0), 0, 1);
    const moving = smoothstep(0.4, 4, v);
    const sN = clamp(v / 30, 0, 1.3);
    const wet = clamp(num(o.wet, core.wetness || 0), 0, 1);
    const inCab = !!core.interior;
    const cab = inCab ? 0.7 : 1;
    // squeal only on hard surfaces, needs real slip AND some speed; ramps smoothly (never a switch)
    // the slide's own wobble (load transfer, track texture): a slow random walk on level and pitch, never static
    if (now >= this.wobT) { this.wobT = now + rand(0.12, 0.3); this.wobTo = rand(-1, 1); }
    this.wob += ((this.wobTo || 0) - this.wob) * 0.25;
    const sq = soft ? 0 : smoothstep(0.22, 0.7, slip) * smoothstep(2, 8, v) * (1 - 0.6 * wet) * (brick ? 0.6 : 1);
    const sc = soft ? 0 : smoothstep(0.08, 0.32, slip) * (1 - smoothstep(0.45, 0.8, slip)) * smoothstep(2, 10, v) * (1 - 0.5 * wet);
    this.squeal.set(0.42 * sq * cab * (1 + 0.12 * this.wob), now, 0.05);
    this.squeal.setRate(0.92 + 0.14 * slip + 0.04 * clamp(v / 30, 0, 1) + 0.012 * this.wob, now);
    this.scrub.set(0.3 * sc * cab, now, 0.05);
    // painted crosswalk stripes: smoother, a touch brighter and quieter than the open asphalt
    this.asphalt.set((soft ? 0.25 : brick ? 0.18 : 0.65) * (1 - 0.35 * paint) * Math.pow(sN, 1.3) * moving * cab, now, 0.06);
    this.asphalt.setRate(0.85 + 0.25 * clamp(v / 40, 0, 1) + 0.12 * paint, now);
    this.cobble.set(brick ? 0.85 * (0.3 + 0.7 * clamp(v / 12, 0, 1.3)) * moving * cab : 0, now, 0.1);
    this.cobble.setRate(0.7 + 0.45 * clamp(v / 15, 0, 1.2), now);
    this.gravel.set((surf === 'dirt' || surf === 'gravel' || surf === 'sand' ? 0.7 : 0) * (0.35 + 0.65 * sN + 0.6 * slip) * moving, now, 0.08);
    this.gravel.setRate(0.8 + 0.35 * clamp(v / 30, 0, 1), now);
    this.grass.set((surf === 'grass' ? 0.8 : 0) * (0.3 + 0.7 * sN + 0.5 * slip) * moving, now, 0.08);
    this.grass.setRate(0.6 + 0.25 * clamp(v / 30, 0, 1), now);
    // wet road: tyre hiss + spray grows with speed (heard less from the cabin)
    this.wet.set(0.75 * wet * Math.pow(sN, 1.0) * moving * (inCab ? 0.6 : 1), now, 0.1);
    // cable-car / streetcar rails: the tyres thump over the rails and the cable slot (front axle, then rear)
    if (rails > 0 && v > 1.5 && now >= this.nextRail) {
      const k = 0.12 * cab * smoothstep(1.5, 12, v) * (0.6 + 0.4 * rails);
      const r = rand(1.5, 1.9), wb = clamp(2.7 / Math.max(2, v), 0.06, 0.8);
      core.oneShot('suspension_thump', { gain: k, rate: r, lp: 2600 });
      core.oneShot('suspension_thump', { gain: k * 0.8, rate: r * 0.97, lp: 2200, delay: wb });
      core.oneShot('impact_pole', { gain: 0.018 * cab * rails, rate: rand(1.6, 2), lp: 5000, delay: 0.005 });
      this.nextRail = now + clamp(rand(4, 14) / Math.max(2, v), 0.25, 3) / Math.max(0.35, rails);
    }
    // brake squeal: heavy braking coming to a stop at low speed, not every time
    const brake = clamp(num(o.brake, 0), 0, 1);
    const decel = this.prevSpeed - v;
    this.prevSpeed = v;
    if (brake > 0.6 && v > 1.2 && v < 7 && decel > 0 && now - this.lastBrakeSq > 7 && !soft) {
      this.lastBrakeSq = now;
      if (Math.random() < 0.45) core.oneShot('brake_squeal', { gain: 0.3 * cab, rate: rand(0.95, 1.08) });
    }
  }
}

// ---------------------------------------------------------------------------------------------- wind
export class Wind {
  constructor(core) { this.core = core; this.built = false; this.gust = 1; this.gustT = 1; this.nextGust = 0; }
  _ensure() {
    if (this.built) return true;
    const c = this.core;
    if (!c.ctx) return false;
    this.lp = c.ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.lp.frequency.value = 1500; this.lp.Q.value = 0.5;
    this.lp.connect(c.fxBus);
    this.rush = new LoopLayer(c, 'wind_rush', this.lp, { type: 'lowpass', f: 900, q: 0.5, gain: 1.4 });
    this.built = true;
    return true;
  }
  update(speed) {
    if (!this._ensure()) return;
    const now = this.core.ctx.currentTime;
    const v = Math.abs(num(speed, 0));
    if (now >= this.nextGust) { this.gustT = rand(0.8, 1.15); this.nextGust = now + rand(0.7, 2); }
    this.gust += (this.gustT - this.gust) * 0.04;
    const n = clamp((v - 5) / 45, 0, 1);
    const cab = this.core.interior ? 0.55 : 1;
    this.rush.set(0.8 * Math.pow(n, 1.6) * this.gust * cab, now, 0.15);
    this.rush.setRate(0.85 + 0.3 * n, now);
    setTo(this.lp.frequency, (this.core.interior ? 1200 : 2200) + 9000 * n, now, 0.2);
  }
}

// ---------------------------------------------------------------------------------------------- footsteps
// on-foot player: recorded hard-sole steps (street concrete / indoor hall floor), cadence from speed, a scuff + land on
// jumps. o: { speed m/s, grounded, surface 'concrete'|'stone'|'wood'|'grass'|'sand', indoor }
export class Foot {
  constructor(core) { this.core = core; this.phase = 0; this.side = 1; this.air = false; this.airT = 0; }
  update(o = {}) {
    const core = this.core;
    if (!core.canPlay() || !o) return;
    const now = core.ctx.currentTime;
    const dt = clamp(now - (this.lastT || now), 0, 0.1);
    this.lastT = now;
    const v = Math.max(0, num(o.speed, 0)), grounded = o.grounded !== false;
    const surf = String(o.surface || 'concrete');
    const indoor = !!o.indoor || surf === 'stone' || surf === 'wood';
    const soft = surf === 'grass' || surf === 'sand' || surf === 'dirt';
    if (!grounded) { if (!this.air) { this.air = true; this.airT = now; } return; }
    if (this.air) { // landing after a jump / fall
      this.air = false;
      if (now - this.airT > 0.25) this._step(now, 0.9, indoor, soft, 0.92);
      this.phase = 0.5;
      return;
    }
    if (v < 0.35) { this.phase = Math.min(this.phase, 0.6); return; }
    // steps per second: walk ~1.8, jog (4.4 m/s) ~2.7, sprint (7.2 m/s) ~3.2
    const cadence = clamp(1.25 + 0.45 * v - 0.012 * v * v, 1.4, 3.4);
    this.phase += dt * cadence;
    if (this.phase >= 1) { this.phase -= 1; this._step(now, clamp(0.45 + v / 8, 0.45, 1.05), indoor, soft, 1); }
  }
  _step(now, force, indoor, soft, rate) {
    this.side = -this.side;
    const key = indoor ? 'foot_hall' : 'foot_concrete';
    const g = 0.7 * force * (soft ? 0.45 : 1);
    this.core.oneShot(key, { gain: g, rate: rate * rand(0.94, 1.06) * (soft ? 0.85 : 1), lp: soft ? 1400 : 9000 + 9000 * force, pan: 0.08 * this.side, send: indoor ? 0.05 : 0.02 });
  }
}

// ---------------------------------------------------------------------------------------------- scrape
export class Scrape {
  constructor(core) { this.core = core; this.built = false; }
  _ensure() {
    if (this.built) return true;
    const c = this.core;
    if (!c.ctx) return false;
    this.out = c.ctx.createGain();
    this.out.connect(c.fxBus);
    this.layer = new LoopLayer(c, 'scrape_metal', this.out, { type: 'bandpass', f: 2500, q: 2, gain: 0.5 });
    this.built = true;
    return true;
  }
  set(amount) {
    if (!this._ensure()) return;
    const now = this.core.ctx.currentTime;
    const a = clamp(num(amount, 0), 0, 1);
    this.layer.set(a > 0.03 ? 0.6 * Math.pow(a, 0.7) * rand(0.85, 1.1) : 0, now, 0.03);
    this.layer.setRate(0.9 + 0.3 * a, now);
  }
}

// ---------------------------------------------------------------------------------------------- impacts
// kind -> sample layers: [key, minStrength, gain, rate range]; a hit plays the strongest matching body layer plus
// debris / glass sweeteners by strength. Weak hits are darker (low-pass) and quieter.
const IMPACT_LAYERS = {
  car: [['impact_car_light', 0, 1, 0.08], ['impact_car_heavy', 0.45, 1.1, 0.06], ['debris', 0.55, 0.5, 0.1], ['glass_break', 0.8, 0.45, 0.06]],
  wall: [['impact_wall', 0, 1.1, 0.07], ['debris', 0.5, 0.5, 0.1], ['glass_break', 0.85, 0.4, 0.06]],
  prop: [['impact_prop', 0, 1, 0.1], ['debris', 0.5, 0.4, 0.1]],
  pole: [['impact_pole', 0, 0.9, 0.08], ['debris', 0.6, 0.35, 0.1]],
  metal: [['impact_pole', 0, 0.8, 0.12]],
  glass: [['glass_break', 0, 0.9, 0.06]],
  landing: [['suspension_thump', 0, 1.1, 0.06], ['body_creak', 0.55, 0.35, 0.05]],
  body: [['body_hit', 0, 0.9, 0.08]],
  splash: [['splash', 0, 1, 0.05]],
};
export const IMPACT_KINDS = Object.keys(IMPACT_LAYERS);

export function impact(core, strength, kind = 'car', opts = {}) {
  if (!core.canPlay()) return;
  const s = clamp(num(strength, 0.5), 0, 1);
  if (s < 0.03) return;
  kind = IMPACT_LAYERS[kind] ? kind : 'car';
  const now = core.ctx.currentTime;
  const last = core.lastImpact || (core.lastImpact = new Map());
  const prev = last.get(kind);
  if (prev && now - prev.t < 0.11 && now >= prev.t && s < prev.s * 1.5) return; // physics spam guard
  last.set(kind, { t: now, s });
  const d = Math.max(0, num(opts.distance, 0));
  const base = Math.pow(s, 0.9) * (0.35 + 0.65 * s);
  let played = false;
  for (const [key, min, g, spread] of IMPACT_LAYERS[kind]) {
    if (s < min) continue;
    if (!core.assets || !core.assets.variants(key).length) continue;
    played = core.oneShot(key, {
      gain: base * g * (key === IMPACT_LAYERS[kind][0][0] ? 1 : smoothstep(min, 1, s) + 0.3),
      rate: rand(1 - spread, 1 + spread) * (kind === 'landing' ? 1.05 - 0.15 * s : 1),
      lp: 2500 + 16000 * s, distance: d, pan: opts.pan, send: 0.12,
    }) || played;
  }
  if (!played) synthImpact(core, s, kind, opts);
  if (s > 0.45 && kind !== 'body' && d < 30) core.duck(0.25 * s);
}

// synthesised fallback (only while samples are loading/missing)
function synthImpact(core, s, kind, opts) {
  core.fxPool.play((S, t) => {
    const g = 0.2 + 0.8 * s;
    if (kind === 'landing' || kind === 'body') {
      thump(S, t, rand(62, 80), 30, 0.22, 0.9 * g);
      noiseBurst(S, t, { buf: core.white, type: 'lowpass', f: 300, q: 0.8, att: 0.003, dec: 0.05, lvl: 1.5 * g });
      return 0.5;
    }
    thump(S, t, rand(75, 100), 36, 0.2 + 0.1 * s, 0.8 * g);
    noiseBurst(S, t, { buf: core.white, type: 'lowpass', f: 900 + 1800 * s, q: 0.8, att: 0.002, dec: 0.06 + 0.1 * s, lvl: 1.2 * g });
    if (kind === 'pole' || kind === 'metal') modal(S, t, rand(180, 300), [1, 2.76, 5.4], [0.8, 1, 0.5], [0.8, 0.5, 0.3], 0.08 * g);
    return 0.9;
  }, { distance: opts.distance, pan: opts.pan, send: 0.12, gain: 0.45 });
}

// ---------------------------------------------------------------------------------------------- horns
const HORN_KEYS = { car: 'horn_car', truck: 'horn_truck', bus: 'horn_bus' };
const HORN_SYN = { car: [415, 523], truck: [185, 233, 277], bus: [294, 370] };

class HornVoice {
  constructor(core, type, sp) {
    const ctx = core.ctx;
    this.core = core;
    this.type = type;
    this.nodes = [];
    this.srcs = [];
    const n = (x) => { this.nodes.push(x); return x; };
    const now = ctx.currentTime;
    this.env = n(ctx.createGain());
    this.env.gain.value = 0;
    this.sLP = n(ctx.createBiquadFilter());
    this.sLP.type = 'lowpass';
    this.pan = n(ctx.createStereoPanner());
    this.dg = n(ctx.createGain());
    const send = n(ctx.createGain());
    send.gain.value = 0.12;
    this.env.connect(this.sLP); this.sLP.connect(this.pan); this.pan.connect(this.dg);
    this.dg.connect(core.fxBus); this.dg.connect(send); send.connect(core.revIn);
    const a = core.assets && core.assets.ready(HORN_KEYS[type]);
    if (a) {
      const s = n(ctx.createBufferSource());
      s.buffer = core.assets.buf(a.file);
      s.loop = true; s.loopStart = a.loopStart; s.loopEnd = a.loopEnd;
      s.playbackRate.value = rand(0.97, 1.03);
      s.connect(this.env);
      s.start(now, a.loopStart);
      this.srcs.push(s);
      this.level = 0.55;
    } else {
      const mix = n(ctx.createGain());
      const lp = n(ctx.createBiquadFilter());
      lp.type = 'lowpass'; lp.frequency.value = 2600;
      mix.connect(lp); lp.connect(this.env);
      for (const f of HORN_SYN[type]) {
        const o = n(ctx.createOscillator());
        o.type = 'sawtooth'; o.frequency.value = f;
        const g = n(ctx.createGain());
        g.gain.value = 0.3 / HORN_SYN[type].length;
        o.connect(g); g.connect(mix);
        o.start(now);
        this.srcs.push(o);
      }
      this.level = 0.5;
    }
    this.spatial(sp, true);
    this.env.gain.setTargetAtTime(this.level, now, 0.008);
  }
  spatial(sp = {}, instant) {
    const now = this.core.ctx.currentTime, d = Math.max(0, num(sp.distance, 0)), tau = instant ? 0.001 : 0.05;
    setTo(this.dg.gain, distGain(d, 6), now, tau);
    setTo(this.sLP.frequency, distCutoff(d), now, tau);
    setTo(this.pan.pan, clamp(num(sp.pan, 0), -1, 1), now, tau);
  }
  off() {
    const now = this.core.ctx.currentTime;
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setTargetAtTime(0, now + 0.07, 0.025); // minimum length so taps still read as a honk
    const nodes = this.nodes;
    for (const s of this.srcs) { try { s.stop(now + 0.3); } catch (e) { /* ignore */ } }
    setTimeout(() => { for (const x of nodes) { try { x.disconnect(); } catch (e) { /* ignore */ } } }, 450);
  }
}

export class Horns {
  constructor(core) { this.core = core; this.map = new Map(); }
  set(on, type = 'car', opts = {}) {
    const core = this.core;
    const id = opts && opts.id != null ? String(opts.id) : 'player';
    type = HORN_KEYS[type] ? type : 'car';
    const cur = this.map.get(id);
    if (!on) { if (cur) { cur.off(); this.map.delete(id); } return; }
    if (!core.canPlay()) return;
    if (cur && cur.type === type) { cur.spatial(opts); return; }
    if (cur) { cur.off(); this.map.delete(id); }
    if (this.map.size >= 4) return;
    this.map.set(id, new HornVoice(core, type, opts));
  }
}

// ---------------------------------------------------------------------------------------------- police siren
// Recorded US wail / yelp loops with smooth doppler; a synthesised siren stands in until they decode.
export class Siren {
  constructor(core) {
    this.core = core;
    this.active = false;
    this.mode = 'wail';
    this.sp = { distance: 0, pan: 0, velocity: 0 };
    this.dop = 1;
    this.built = false;
    this.dead = false;
    this.want = false;
    this.timer = null;
  }
  _build() {
    const ctx = this.core.ctx, c = this.core;
    this.nodes = [];
    const n = (x) => { this.nodes.push(x); return x; };
    this.act = n(ctx.createGain());
    this.act.gain.value = 0;
    this.sLP = n(ctx.createBiquadFilter());
    this.sLP.type = 'lowpass';
    this.pan = n(ctx.createStereoPanner());
    this.vol = n(ctx.createGain());
    this.vol.gain.value = 0;
    const send = n(ctx.createGain());
    send.gain.value = 0.2;
    this.act.connect(this.sLP); this.sLP.connect(this.pan); this.pan.connect(this.vol);
    this.vol.connect(c.fxBus); this.vol.connect(send); send.connect(c.revIn);
    this.layers = {};
    for (const m of ['wail', 'yelp']) {
      const g = n(ctx.createGain());
      g.gain.value = m === this.mode ? 1 : 0;
      g.connect(this.act);
      this.layers[m] = { g, src: null };
    }
    this.built = true;
    this._sources();
    this._spatial(true);
  }
  _sources() {
    const c = this.core, ctx = c.ctx;
    for (const m of ['wail', 'yelp']) {
      const L = this.layers[m];
      if (L.src) continue;
      const a = c.assets && c.assets.ready('siren_' + m);
      if (a) {
        const s = ctx.createBufferSource();
        s.buffer = c.assets.buf(a.file);
        s.loop = true; s.loopStart = a.loopStart; s.loopEnd = a.loopEnd;
        s.connect(L.g);
        s.start(0, a.loopStart + Math.random() * (a.loopEnd - a.loopStart));
        L.src = s; L.sample = true;
        this.nodes.push(s);
      } else if (!L.syn) {
        // fallback: filtered square/saw sweep
        const o = ctx.createOscillator();
        o.type = 'square';
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.value = m === 'yelp' ? 3.6 : 0.2;
        const dep = ctx.createGain();
        dep.gain.value = m === 'yelp' ? 380 : 420;
        o.frequency.value = 1000;
        lfo.connect(dep); dep.connect(o.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 2400;
        const g = ctx.createGain();
        g.gain.value = 0.12;
        o.connect(lp); lp.connect(g); g.connect(L.g);
        o.start(); lfo.start();
        L.syn = { o, lfo };
        this.nodes.push(o, lfo, dep, lp, g);
      }
    }
  }
  _teardown() {
    if (!this.built) return;
    this.built = false;
    const now = this.core.ctx.currentTime, nodes = this.nodes;
    for (const x of nodes) { if (x.stop) { try { x.stop(now + 0.05); } catch (e) { /* ignore */ } } }
    setTimeout(() => { for (const k of nodes) { try { k.disconnect(); } catch (e) { /* ignore */ } } }, 200);
  }
  setActive(on) { if (this.dead) return; this.want = !!on; this._sync(); }
  _sync() {
    if (this.dead || !this.core.ctx) return;
    if (this.want) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (!this.built) this._build();
      if (this.active) return;
      this.active = true;
      setTo(this.act.gain, 0.5, this.core.ctx.currentTime, 0.15);
    } else {
      if (!this.active) return;
      this.active = false;
      if (!this.built) return;
      setTo(this.act.gain, 0, this.core.ctx.currentTime, 0.25);
      this.timer = setTimeout(() => { this.timer = null; if (!this.active) this._teardown(); }, 2000);
    }
  }
  setMode(m) {
    this.mode = m === 'yelp' ? 'yelp' : 'wail';
    if (!this.built) return;
    const now = this.core.ctx.currentTime;
    setTo(this.layers.wail.g.gain, this.mode === 'wail' ? 1 : 0, now, 0.05);
    setTo(this.layers.yelp.g.gain, this.mode === 'yelp' ? 1 : 0, now, 0.05);
  }
  setSpatial(o = {}) {
    if (!o) return;
    this.sp.distance = Math.max(0, num(o.distance, this.sp.distance));
    this.sp.pan = clamp(num(o.pan, this.sp.pan), -1, 1);
    this.sp.velocity = clamp(num(o.velocity, 0), -60, 60);
    this._spatial(false);
  }
  _spatial(instant) {
    if (!this.built) return;
    this._sources();
    const now = this.core.ctx.currentTime, d = this.sp.distance, tau = instant ? 0.005 : 0.08;
    setTo(this.vol.gain, distGain(d, 10, 700), now, tau);
    setTo(this.sLP.frequency, clamp(20000 / (1 + d / 25), 900, 20000), now, tau);
    setTo(this.pan.pan, this.sp.pan * smoothstep(2, 10, d), now, tau);
    // smooth doppler (heavy smoothing = no warble)
    const target = clamp(343 / (343 - this.sp.velocity), 0.9, 1.1);
    this.dop += (target - this.dop) * 0.15;
    for (const m of ['wail', 'yelp']) {
      const L = this.layers[m];
      if (L.src) setTo(L.src.playbackRate, this.dop, now, 0.15);
      if (L.syn) setTo(L.syn.o.detune, 1200 * Math.log2(this.dop), now, 0.15);
    }
  }
  stop() {
    if (this.dead) return;
    this.setActive(false);
    this.dead = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.built) setTimeout(() => this._teardown(), 400);
  }
}

// ---------------------------------------------------------------------------------------------- bell / foghorn
export function cableCarBell(core, opts = {}) {
  if (!core.canPlay()) return;
  if (core.oneShot('cable_car_bell', { distance: opts.distance, pan: opts.pan, send: 0.2, ref: 10, gain: 0.6, rate: rand(0.98, 1.02) })) return;
  core.fxPool.play((S, t) => {
    const buf = bellBuffer(S.ctx, 1180);
    [0, 0.17].forEach((dt, i) => { const s = S.buffer(buf, t + dt, 1); const g = S.gain(i ? 0.24 : 0.34); s.connect(g); g.connect(S.out); });
    return 2.6;
  }, { distance: opts.distance, pan: opts.pan, send: 0.2, ref: 10 });
}

export function foghorn(core, distance = 900) {
  if (!core.canPlay()) return;
  const now = core.ctx.currentTime;
  if (core.fogUntil > now) return;
  const d = Math.max(0, num(distance, 900));
  const lvl = clamp(1.2 / (1 + d / 700), 0.08, 1);
  if (core.oneShot('foghorn', { gain: 0.8 * lvl, lp: clamp(4000 / (1 + d / 600), 400, 4000), send: 0.5 + 0.4 * smoothstep(200, 2500, d), pool: 'amb' })) {
    core.fogUntil = now + 6;
    return;
  }
  core.fogUntil = now + 6;
  core.ambPool.play((S, t) => {
    for (const [f, dur, at] of [[175, 1.7, 0], [131, 1.4, 1.75]]) {
      const o = S.osc('sawtooth', f, t + at);
      const lp = S.filter('lowpass', 600, 0.8);
      const g = S.gain(0);
      o.connect(lp); lp.connect(g); g.connect(S.out);
      g.gain.setValueAtTime(0, t + at);
      g.gain.setTargetAtTime(0.12 * lvl, t + at, 0.1);
      g.gain.setTargetAtTime(0, t + at + dur - 0.1, 0.12);
    }
    return 4;
  }, { send: 0.6 });
}

// ---------------------------------------------------------------------------------------------- UI
// Recorded UI sounds (ui/<kind>.mp3) with light synthesised fallbacks. Kinds are rate-limited so menus that fire
// hover on every focus change never machine-gun.
const N = (name) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return mtof(12 * (parseInt(m[3], 10) + 1) + base);
};
function blip(S, t, f, dur, lvl, type = 'sine') {
  const o = S.osc(type, f, t);
  const g = S.gain(0);
  o.connect(g); g.connect(S.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(lvl, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, dur / 3);
}
const SYN = {
  click: (S, t) => { blip(S, t, 1200, 0.03, 0.06); return 0.08; },
  hover: (S, t) => { blip(S, t, 2000, 0.02, 0.02); return 0.05; },
  confirm: (S, t) => { blip(S, t, N('E5'), 0.08, 0.07); blip(S, t + 0.06, N('B5'), 0.14, 0.07); return 0.3; },
  back: (S, t) => { blip(S, t, N('B5'), 0.07, 0.06); blip(S, t + 0.06, N('E5'), 0.12, 0.06); return 0.26; },
  error: (S, t) => { blip(S, t, N('D4'), 0.1, 0.07, 'triangle'); blip(S, t + 0.11, N('D4'), 0.12, 0.07, 'triangle'); return 0.3; },
  money: (S, t) => { blip(S, t, N('B5'), 0.2, 0.07); blip(S, t + 0.07, N('E6'), 0.4, 0.07); return 0.55; },
  good: (S, t) => { ['C5', 'E5', 'G5'].forEach((n, i) => blip(S, t + i * 0.06, N(n), 0.25, 0.06)); return 0.5; },
  bad: (S, t) => { ['E4', 'C4'].forEach((n, i) => blip(S, t + i * 0.12, N(n), 0.3, 0.07, 'triangle')); return 0.6; },
  tick: (S, t) => { blip(S, t, 880, 0.15, 0.08); return 0.25; },
  go: (S, t) => { blip(S, t, 1320, 0.45, 0.08); return 0.6; },
};
// kind -> [sample key, fallback, min interval s, gain]
const UI = {
  click: ['click', 'click', 0.04, 0.8], hover: ['hover', 'hover', 0.07, 0.35], confirm: ['confirm', 'confirm', 0.08, 0.9],
  back: ['back', 'back', 0.08, 0.8], error: ['error', 'error', 0.15, 0.85], open: ['open', 'click', 0.1, 0.8],
  close: ['close', 'back', 0.1, 0.8], select: ['select', 'click', 0.05, 0.8], toggle: ['toggle', 'click', 0.06, 0.8],
  notify: ['notify', 'confirm', 0.3, 0.8], money: ['money', 'money', 0.12, 0.8], purchase: ['purchase', 'money', 0.2, 0.9],
  unlock: ['unlock', 'good', 0.3, 0.9], reward: ['reward', 'good', 0.3, 0.9], xp: ['xp', 'click', 0.1, 0.6],
  star: ['star', 'click', 0.08, 0.8], tick: ['tick', 'tick', 0.2, 0.9], countdown: ['tick', 'tick', 0.2, 0.9],
  go: ['go', 'go', 0.3, 1], checkpoint: ['checkpoint', 'confirm', 0.15, 0.9], finish: ['finish', 'good', 0.5, 1],
  fail: ['fail', 'bad', 0.5, 0.9], levelup: ['levelup', 'good', 0.5, 1], rankup: ['rankup', 'good', 0.5, 1],
  wanted: ['wanted', 'bad', 0.5, 0.9], busted: ['busted', 'bad', 0.8, 1], evaded: ['evaded', 'good', 0.8, 0.9],
  skill: ['skill', 'confirm', 0.12, 0.7], nearmiss: ['nearmiss', 'click', 0.2, 0.8], whoosh: ['whoosh', 'click', 0.15, 0.8],
  podium: ['finish', 'good', 0.5, 1], fanfare: ['finish', 'good', 0.5, 1], cash: ['money', 'money', 0.12, 0.8],
};
export const UI_KINDS = Object.keys(UI);

export function ui(core, kind) {
  if (!core.canPlay()) return;
  const d = UI[kind] || (kind ? UI.click : null);
  if (!d) return;
  const now = core.ctx.currentTime;
  const last = core.uiLast || (core.uiLast = new Map());
  if (now - (last.get(kind) || -9) < d[2]) return;
  last.set(kind, now);
  if (core.oneShot('ui_' + d[0], { pool: 'ui', gain: d[3] })) return;
  const fb = SYN[d[1]];
  if (fb) core.uiPool.play((S, t) => fb(S, t), { gain: 1 });
}

// ---------------------------------------------------------------------------------------------- pass-bys
/** recorded pass-by, time-aligned so its loudest moment lands at `delay` seconds from now */
export function passby(core, o = {}) {
  if (!core.canPlay() || !core.assets) return false;
  const v = core.assets.variants('passby');
  if (!v.length) return false;
  const e = v[Math.floor(Math.random() * v.length)];
  const buf = core.assets.buf(e.file);
  const rate = clamp(num(o.rate, 1), 0.8, 1.25);
  const peak = num(e.peak, buf.duration / 2) / rate;
  const delay = clamp(num(o.delay, 0.6), 0, 3);
  const off = Math.max(0, peak - delay);
  const side = num(o.side, 1) >= 0 ? 1 : -1;
  const shot = core.fxPool.play((S, t) => {
    const s = S.buffer(buf, t, rate, off * rate);
    const p = S.panner(-0.8 * side);
    // sweep pan through the closest approach
    const tPeak = t + Math.max(0, delay);
    p.pan.setValueAtTime(-0.8 * side, t);
    p.pan.linearRampToValueAtTime(0, tPeak);
    p.pan.linearRampToValueAtTime(0.8 * side, tPeak + 0.9);
    s.connect(p); p.connect(S.out);
    return (buf.duration - off * rate) / rate + 0.05;
  }, { gain: num(o.gain, 0.6) * clamp(6 / Math.max(3, num(o.dmin, 5)), 0.3, 1.2), send: 0.12, ref: 6 });
  return !!shot;
}

export { Shot, pinkNoise };
