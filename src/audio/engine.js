// HILLBOMB audio: sample-based vehicle engines.
//
// Each engine family (public/assets/audio/engines/<family>.mp3) is a sprite of seamless loops cut from real CC0
// recordings (chassis-dyno sweeps, gear pulls, idles). Every loop was de-chirped to a constant firing frequency F
// (Hz) and cut on whole 720-degree engine cycles, so it can be pitched by playbackRate = F_target / F_loop.
//
// A voice picks the two loops whose F brackets the target (F_target = rpm * cylinders / 120) and crossfades them
// with equal-power weights in log-frequency; on-load / off-load / idle sets are blended by throttle. Only loops with
// non-zero weight have a running AudioBufferSourceNode (created lazily, stopped when unused), so a voice costs
// 2-5 sources. Profiles map every car engine type onto a family by firing frequency (a V6 uses the V8 recordings at
// the V6's firing rate, a V12 the V10 recordings, etc.) plus a per-profile EQ.
//
//   sources -> set gains -> mix -> profile EQ -> tone low-pass (load / cabin) -> cut (shift, limiter) -> post
//   post (+ pops, turbo, road layer) -> air low-pass -> panner -> vol -> engine bus (player) or traffic bus (NPC)

import { clamp, lerp, num, smoothstep } from './dsp.js';
import { distGain, distCutoff, popSound } from './shots.js';

// ---------------------------------------------------------------------------------------------- profiles
// fam: loop family (or sets: composite list), cyl: cylinder-equivalent for F, eq: [type, f, Q, dB] biquads,
// vol: dB trim, turbo/sc/crackle 0..1, rpmScale: audio rpm compression (diesels), idleFam: borrow an idle loop.
const EQ_INLINE = [['peaking', 180, 0.8, -1.5], ['peaking', 2400, 1.0, 1.5]];
export const PROFILES = {
  i4: { fam: 'flat4', cyl: 4, eq: EQ_INLINE, vol: -1, crackle: 0.15 },
  i3turbo: { fam: 'flat4', cyl: 3, eq: [['peaking', 140, 0.9, 2], ['peaking', 1800, 1.2, 1]], vol: -1, turbo: 0.6 },
  i5: { sets: [{ fam: 'flat4', maxF: 116 }, { fam: 'v10', minF: 116 }], cyl: 5, eq: [['peaking', 900, 1.1, 2]], vol: 0, turbo: 0.5, crackle: 0.5 },
  i6: { sets: [{ fam: 'flat4', maxF: 116 }, { fam: 'v10', minF: 116 }], cyl: 6, eq: [['peaking', 1200, 0.9, 1.5], ['highshelf', 5000, 0.7, -1]], vol: 0, crackle: 0.3 },
  v6: { fam: 'v8', cyl: 6, eq: [['lowshelf', 160, 0.7, -3], ['peaking', 1400, 1, 1.5]], vol: -1, crackle: 0.2 },
  v8: { fam: 'v8', cyl: 8, eq: [['lowshelf', 120, 0.7, 1.5]], vol: 0, crackle: 0.8 },
  v8sc: { fam: 'v8', cyl: 8, eq: [['lowshelf', 120, 0.7, 1]], vol: 0, crackle: 0.6, sc: 1 },
  v10: { fam: 'v10', cyl: 10, eq: [['peaking', 2600, 1.1, 1.5]], vol: 0, crackle: 0.6 },
  v12: { sets: [{ fam: 'v10', maxF: 330 }, { fam: 'v8', minF: 330, onlyOn: true }], cyl: 9, eq: [['peaking', 2800, 1.0, 2], ['lowshelf', 150, 0.7, -2]], vol: 0, crackle: 0.5 },
  w16: { sets: [{ fam: 'v10', maxF: 330 }, { fam: 'v8', minF: 330, onlyOn: true }], cyl: 8, eq: [['lowshelf', 150, 0.7, 1]], vol: 0, turbo: 1, crackle: 0.3, whine: 0.3 },
  flat4: { fam: 'flat4', cyl: 4, eq: [['peaking', 110, 0.9, 2.5]], vol: 0, turbo: 0.5, crackle: 0.5 },
  flat6: { sets: [{ fam: 'flat4', maxF: 116 }, { fam: 'v10', minF: 116 }], cyl: 6, eq: [['peaking', 2200, 1.3, 3], ['peaking', 380, 1, -1.5]], vol: 0, crackle: 0.6 },
  rotary: { fam: 'flat4', cyl: 4, eq: [['peaking', 1600, 1.0, 4], ['highshelf', 4500, 0.7, 2], ['peaking', 120, 1, -2]], vol: -1, turbo: 0.7, crackle: 1 },
  twin: { fam: 'flat4', cyl: 2, eq: [['peaking', 90, 1, 2], ['highshelf', 3000, 0.7, -3]], vol: -2 },
  rally: { fam: 'flat4', cyl: 4, eq: [['peaking', 1900, 1.1, 2.5], ['peaking', 110, 0.9, 1]], vol: 0, turbo: 1, crackle: 1, whine: 0.7 },
  diesel: { fam: 'diesel', cyl: 4, eq: [['peaking', 1500, 1.2, 2]], vol: -1, turbo: 0.35, rpmScale: 0.8 },
  bus: { fam: 'bus', cyl: 6, eq: [['lowshelf', 110, 0.7, 2]], vol: -2, turbo: 0.25, rpmScale: 0.8, whine: 1 },
  electric: { electric: true, vol: 0 },
};
PROFILES['i3-turbo'] = PROFILES.i3turbo;
export const ENGINE_PROFILES = Object.keys(PROFILES);

const ENGINE_GAIN = 1.55;     // calibrated (offline renders 10/1): WOT up Hyde ~ -15 LUFS, 30 mph cruise ~ -20 LUFS at the output
const NPC_GAIN = 0.35;         // traffic engines are quieter than the hero engine at the same distance
const EV_GAIN = 0.22;

// ---------------------------------------------------------------------------------------------- helpers
function setTo(param, v, now, tau) {
  // setTargetAtTime without piling events: cancel anything scheduled after now first
  try { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tau); } catch (e) { param.value = v; }
}
function pairWeights(list, F) {
  const n = list.length;
  if (!n) return [];
  if (n === 1 || F <= list[0].F) return [[0, 1]];
  if (F >= list[n - 1].F) return [[n - 1, 1]];
  let i = 0;
  while (i < n - 2 && list[i + 1].F <= F) i++;
  const u = Math.log(F / list[i].F) / Math.log(list[i + 1].F / list[i].F);
  return [[i, Math.cos(u * Math.PI / 2)], [i + 1, Math.sin(u * Math.PI / 2)]];
}

/** gather the loop sets for a profile from decoded families; null while anything is missing */
function loopSets(assets, P) {
  const sets = P.sets || [{ fam: P.fam }];
  const on = [], off = [], idle = [];
  for (const s of sets) {
    const e = assets.engine(s.fam);
    if (!e) return null;
    const buf = assets.buf(e.file);
    for (const l of e.loops) {
      if (s.minF && l.F < s.minF) continue;
      if (s.maxF && l.F > s.maxF) continue;
      const item = { buf, start: l.start, end: l.end, F: l.F, id: s.fam + ':' + l.id };
      if (l.load === 'idle') { if (s === sets[0]) idle.push(item); }
      else if (l.load === 'off') { if (!s.onlyOn) off.push(item); }
      else on.push(item);
    }
  }
  if (P.idleFam) {
    const e = assets.engine(P.idleFam);
    if (!e) return null;
    idle.length = 0;
    for (const l of e.loops) if (l.load === 'idle') idle.push({ buf: assets.buf(e.file), start: l.start, end: l.end, F: l.F, id: P.idleFam + ':' + l.id });
  }
  const by = (a, b) => a.F - b.F;
  on.sort(by); off.sort(by);
  if (!on.length) return null;
  return { on, off, idle: idle[0] || null };
}
export function familiesOf(profile) {
  const P = PROFILES[profile] || PROFILES.i4;
  if (P.electric) return [];
  const f = new Set((P.sets || [{ fam: P.fam }]).map((s) => s.fam));
  if (P.idleFam) f.add(P.idleFam);
  return [...f];
}

// ---------------------------------------------------------------------------------------------- base voice
class VoiceBase {
  constructor(core, name, P, opts = {}) {
    this.core = core;
    this.name = name;
    this.P = P;
    this.lite = !!opts.lite;
    this.turboOpt = opts.turbo;           // true/false from the car's aspiration (overrides the profile default)
    this.scOpt = opts.supercharged;
    this.built = false;
    this.dead = false;
    this.parked = false;
    this.nodes = [];
    this.userVol = 1;
    this.sp = { distance: 0, pan: 0, velocity: 0 };
    this.dop = 1;
    this.dopT = 1;
    this.interior = false;
    this.touched = 0;
    this.lastT = 0;
    this.duckUntil = 0;
  }
  get isPlayer() { return !this.lite && this.sp.distance < 2; }
  _n(x) { this.nodes.push(x); return x; }
  _tail(dest) {
    const ctx = this.core.ctx;
    this.post = this._n(ctx.createGain());
    this.air = this._n(ctx.createBiquadFilter());
    this.air.type = 'lowpass';
    this.air.frequency.value = 20000;
    this.air.Q.value = 0.5;
    this.pan = this._n(ctx.createStereoPanner());
    this.vol = this._n(ctx.createGain());
    this.vol.gain.value = 0;
    this.post.connect(this.air); this.air.connect(this.pan); this.pan.connect(this.vol); this.vol.connect(dest);
    if (this.lite && this.core.revIn) {
      // a touch of street reverb on traffic so distant cars sit in the space instead of on top of it
      this.send = this._n(ctx.createGain());
      this.send.gain.value = 0;
      this.vol.connect(this.send); this.send.connect(this.core.revIn);
    }
  }
  setSpatial(o) {
    if (this.dead || !o) return;
    this.sp.distance = Math.max(0, num(o.distance, this.sp.distance));
    this.sp.pan = clamp(num(o.pan, this.sp.pan), -1, 1);
    const v = clamp(num(o.velocity, 0), -60, 60);
    // doppler target; the per-update smoothing (in update) removes frame jitter so it never warbles
    this.dopT = clamp(343 / (343 - v), 0.88, 1.13);
    this._spatial(false);
  }
  _spatial(instant) {
    if (!this.built || this.dead) return;
    const now = this.core.ctx.currentTime, d = this.sp.distance, tau = instant ? 0.005 : 0.06;
    let g = 1;
    if (this.lite) {
      // a stopped car idles quietly; several voices share one budget (1/sqrt(n) above two) so a queue never drones
      let n = 0;
      for (const e of this.core.engines) if (e.lite && e.built && !e.dead && !e.parked && e.sp.distance < 70) n++;
      const idle = 0.5 + 0.5 * smoothstep(0.5, 4, this.speedS || 0);
      g = distGain(d, 6, 110) * NPC_GAIN * idle * Math.min(1, Math.sqrt(2 / Math.max(1, n)));
    }
    let duck = 1;
    if (this.duckUntil > now) duck = 0.4;
    setTo(this.vol.gain, this.userVol * g * duck, now, tau);
    setTo(this.air.frequency, this.lite ? clamp(16000 / (1 + d / 8), 600, 16000) : 20000, now, tau);
    setTo(this.pan.pan, this.lite ? this.sp.pan * smoothstep(1, 6, d) : 0, now, tau);
    if (this.send) setTo(this.send.gain, 0.08 + 0.4 * smoothstep(10, 80, d), now, tau);
  }
  setVolume(v) { this.userVol = clamp(num(v, 1), 0, 2); this._spatial(false); }
  setPerspective(interior) { this.interior = !!interior; }
  /** temporarily lower this voice while a recorded pass-by of the same car plays */
  duckFor(sec) { if (this.core.ctx) { this.duckUntil = this.core.ctx.currentTime + sec; this._spatial(false); } }
  stop() {
    if (this.dead) return;
    this.dead = true;
    this.core.engines.delete(this);
    if (!this.built) return;
    const now = this.core.ctx.currentTime;
    setTo(this.vol.gain, 0, now, 0.04);
    this._stopSources(now + 0.3);
    const nodes = this.nodes;
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } } }, 450);
  }
  park() {
    if (this.dead || !this.built) return false;
    this.parked = true;
    this.core.engines.delete(this);
    setTo(this.vol.gain, 0, this.core.ctx.currentTime, 0.04);
    return true;
  }
  revive() {
    this.parked = false;
    this.userVol = 1;
    this.sp = { distance: 0, pan: 0, velocity: 0 };
    this.dop = this.dopT = 1;
    this.duckUntil = 0;
    this._reset();
    this.core.engines.add(this);
    this._spatial(false);
  }
  _reset() {}
  _stopSources() {}
  shift() {}
  backfire() {}
}

// ---------------------------------------------------------------------------------------------- sample voice
class SampleVoice extends VoiceBase {
  constructor(core, name, P, opts) {
    super(core, name, P, opts);
    this.sets = null;
    this.active = new Map();   // loop id -> { src, g, item, idleFor }
    this._reset();
    this.loading = false;
  }
  _reset() {
    this.loadS = 0;
    this.speedS = 0;
    this.offT = 0;
    this.rpmS = 0;
    this.boost = 0;
    this.lastThr = 0;
    this.budget = 0;
    this.limT = 0;
    this.nextPop = 0;
  }
  _ensure() {
    if (this.dead) return false;
    if (this.built) return true;
    const core = this.core;
    if (!core.ctx || !core.assets) return false;
    const sets = loopSets(core.assets, this.P);
    if (!sets) {
      if (!this.loading) {
        this.loading = true;
        Promise.all(familiesOf(this.name).map((f) => core.assets.loadEngine(f))).then(() => { this.loading = false; });
      }
      return false;
    }
    this.sets = sets;
    try { this._build(); } catch (e) { console.warn('[audio] engine build failed', e); this.dead = true; return false; }
    this.built = true;
    this._spatial(true);
    return true;
  }
  _build() {
    const ctx = this.core.ctx, P = this.P, lite = this.lite;
    this.mix = this._n(ctx.createGain());
    let x = this.mix;
    if (!lite) {
      for (const [type, f, q, g] of P.eq || []) {
        const b = this._n(ctx.createBiquadFilter());
        b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g;
        x.connect(b); x = b;
      }
      // cabin: low shelf up, presence down (interior camera)
      this.cabShelf = this._n(ctx.createBiquadFilter());
      this.cabShelf.type = 'lowshelf'; this.cabShelf.frequency.value = 180; this.cabShelf.gain.value = 0;
      x.connect(this.cabShelf); x = this.cabShelf;
    }
    this.tone = this._n(ctx.createBiquadFilter());
    this.tone.type = 'lowpass'; this.tone.frequency.value = 12000; this.tone.Q.value = 0.6;
    x.connect(this.tone);
    this.cut = this._n(ctx.createGain());
    this.tone.connect(this.cut);
    this._tail(lite ? this.core.trafficBus : this.core.engineBus);
    this.cut.connect(this.post);
    this.popIn = this._n(ctx.createGain());
    this.popIn.gain.value = 1;
    this.popIn.connect(this.post);
    // forced induction layers (player only): turbo whistle + hiss, supercharger whine
    const turbo = this.turboOpt === undefined ? P.turbo || 0 : this.turboOpt ? Math.max(0.6, P.turbo || 0) : 0;
    const sc = this.scOpt === undefined ? P.sc || 0 : this.scOpt ? 1 : 0;
    this.turbo = lite ? 0 : turbo;
    this.sc = lite ? 0 : sc;
    if (this.turbo > 0 || this.sc > 0) {
      this.wOsc = this._n(ctx.createOscillator());
      this.wOsc.type = 'sine';
      this.wOsc.frequency.value = 2000;
      this.wG = this._n(ctx.createGain());
      this.wG.gain.value = 0;
      this.wOsc.connect(this.wG); this.wG.connect(this.post);
      this.wOsc.start();
      if (this.core.noiseA) {
        this.hBP = this._n(ctx.createBiquadFilter());
        this.hBP.type = 'bandpass'; this.hBP.frequency.value = 4500; this.hBP.Q.value = 1.4;
        this.hG = this._n(ctx.createGain());
        this.hG.gain.value = 0;
        this.core.noiseA.connect(this.hBP); this.hBP.connect(this.hG); this.hG.connect(this.post);
      }
    }
    // transmission whine (straight-cut gears / bus drivetrain): a soft triangle locked to engine speed
    if (!lite && P.whine) {
      this.gOsc = this._n(ctx.createOscillator());
      this.gOsc.type = 'triangle';
      this.gOsc.frequency.value = 200;
      this.gG = this._n(ctx.createGain());
      this.gG.gain.value = 0;
      const bp = this._n(ctx.createBiquadFilter());
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
      this.gOsc.connect(bp); bp.connect(this.gG); this.gG.connect(this.post);
      this.gOsc.start();
    }
    // traffic: tyre/road layer so a passing car is mostly tyre roar, like the real thing
    if (lite) {
      const road = this.core.assets && this.core.assets.ready('road_asphalt');
      if (road) {
        const s = this._n(ctx.createBufferSource());
        s.buffer = this.core.assets.buf(road.file);
        s.loop = true; s.loopStart = road.loopStart; s.loopEnd = road.loopEnd;
        s.start(0, road.loopStart + Math.random() * (road.loopEnd - road.loopStart));
        this.roadSrc = s;
        this.roadG = this._n(ctx.createGain());
        this.roadG.gain.value = 0;
        s.connect(this.roadG); this.roadG.connect(this.post);
      }
    }
    this.lastT = ctx.currentTime;
  }
  _source(item, now, rate) {
    const ctx = this.core.ctx;
    const src = ctx.createBufferSource();
    src.buffer = item.buf;
    src.loop = true;
    src.loopStart = item.start;
    src.loopEnd = item.end;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g); g.connect(this.mix);
    src.start(now, item.start + Math.random() * (item.end - item.start) * 0.95);
    return { src, g, item, idleFor: 0 };
  }
  _stopSources(t) {
    for (const a of this.active.values()) {
      try { a.src.stop(t); } catch (e) { /* ignore */ }
      const { src, g } = a;
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
    }
    this.active.clear();
    if (this.roadSrc) { try { this.roadSrc.stop(t); } catch (e) { /* ignore */ } this.roadSrc = null; }
    for (const o of [this.wOsc, this.gOsc]) { if (o) { try { o.stop(t); } catch (e) { /* ignore */ } } }
  }

  update(p) {
    if (!p || !this._ensure()) return;
    const core = this.core, ctx = core.ctx, now = ctx.currentTime, P = this.P, S = this.sets;
    const dt = clamp(now - this.lastT, 0.001, 0.1);
    this.lastT = now;
    this.touched = performance.now();
    const idleRpm = Math.max(300, num(p.idleRpm, 800));
    const red = Math.max(idleRpm + 800, num(p.redline, 6500));
    let rpm = clamp(num(p.rpm, idleRpm), 0, red * 1.05);
    const thr = clamp(num(p.throttle, 0), 0, 1);
    const load = clamp(num(p.load, thr), 0, 1);
    const speed = Math.abs(num(p.speed, 0));
    this.speedS = speed;
    if (P.rpmScale) rpm = idleRpm + (rpm - idleRpm) * P.rpmScale;
    // smoothing: rpm from physics steps per frame; a short glide hides frame quantisation
    this.rpmS = this.rpmS ? this.rpmS + (rpm - this.rpmS) * (1 - Math.exp(-dt / 0.025)) : rpm;
    const rpmN = clamp((this.rpmS - idleRpm) / (red - idleRpm), 0, 1);
    const want = Math.max(thr, load * 0.9);
    this.loadS += (want - this.loadS) * (1 - Math.exp(-dt / (want > this.loadS ? 0.05 : 0.14)));
    const L = this.loadS;
    // doppler (traffic only), heavily smoothed
    this.dop += (this.dopT - this.dop) * (1 - Math.exp(-dt / 0.3));
    const dop = this.lite ? this.dop : 1;
    const F = Math.max(5, (this.rpmS * P.cyl) / 120);

    // ---- desired gains per loop
    const want2 = new Map();
    const add = (item, g, rate) => {
      if (g < 0.002) return;
      const w = want2.get(item.id);
      if (w) w.g += g; else want2.set(item.id, { item, g, rate });
    };
    const hasOff = S.off.length > 0 && !this.lite;
    // loudness model (dB re. wide-open throttle at redline): rpm term + load term
    //   idle -9.5, light cruise ~ -7, WOT mid-range -2, WOT near redline 0, overrun lift-off ~ -5
    const levelDb = -5.5 * Math.pow(1 - rpmN, 1.2) - 4 * (1 - L);
    const level = Math.pow(10, levelDb / 20);
    // idle loop only near idle rpm; everything power-complementary so crossfades never dip or bump
    const idleW = S.idle ? 1 - smoothstep(idleRpm * 1.06, idleRpm * 1.6, this.rpmS) : 0;
    if (S.idle) add(S.idle, level * Math.sqrt(idleW), clamp((F / S.idle.F) * dop, 0.4, 2.2));
    const upper = level * Math.sqrt(1 - idleW);
    const onShare = hasOff ? Math.sqrt(L) : 1, offShare = hasOff ? Math.sqrt(1 - L) : 0;
    for (const [i, w] of pairWeights(S.on, F)) add(S.on[i], w * onShare * upper, clamp((F / S.on[i].F) * dop, 0.3, 3));
    if (offShare > 0.01) for (const [i, w] of pairWeights(S.off, F)) add(S.off[i], w * offShare * upper, clamp((F / S.off[i].F) * dop, 0.3, 3));

    // ---- apply: create missing sources, update rates/gains, retire unused
    for (const [id, w] of want2) {
      let a = this.active.get(id);
      if (!a) { a = this._source(w.item, now, w.rate); this.active.set(id, a); }
      a.idleFor = 0;
      setTo(a.src.playbackRate, w.rate, now, 0.02);
      setTo(a.g.gain, w.g, now, 0.03);
    }
    for (const [id, a] of this.active) {
      if (want2.has(id)) continue;
      setTo(a.g.gain, 0, now, 0.03);
      a.idleFor += dt;
      if (a.idleFor > 0.35) {
        try { a.src.stop(now + 0.02); } catch (e) { /* ignore */ }
        const { src, g } = a;
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
        this.active.delete(id);
      }
    }

    // ---- master level for this voice (+ rev limiter bounce)
    const lvl = ENGINE_GAIN * Math.pow(10, (P.vol || 0) / 20);
    const atLimit = !this.lite && thr > 0.6 && rpm >= red * 0.975;
    if (atLimit) {
      // fuel-cut bounce: schedule dips at ~16 Hz a little ahead
      if (this.limT < now) this.limT = now;
      const g = this.cut.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      while (this.limT < now + 0.12) {
        g.setTargetAtTime(0.32, this.limT, 0.006);
        g.setTargetAtTime(1, this.limT + 0.028, 0.012);
        this.limT += 0.062;
      }
    } else if (this.limT > now + 0.02) {
      this.limT = 0;
      setTo(this.cut.gain, 1, now, 0.02);
    }
    setTo(this.mix.gain, lvl, now, 0.03);
    if (!this.lite && core.sidechain) core.sidechain(level * smoothstep(0, 0.25, this.userVol));
    // tone: open on load, darker off-throttle; cabin perspective closes it and lifts the lows
    const cab = this.interior && !this.lite;
    const open = hasOff ? lerp(9000, 16000, L) : lerp(3500, 16000, Math.pow(L, 0.7));
    setTo(this.tone.frequency, cab ? lerp(1400, 3200, L) + 1200 * rpmN : open, now, 0.05);
    if (this.cabShelf) setTo(this.cabShelf.gain, cab ? 5 : 0, now, 0.1);

    // ---- forced induction
    if (this.wOsc) {
      const given = clamp(num(p.boost, 0), 0, 1);
      const target = given > 0 ? given : thr > 0.35 ? clamp(rpmN * 1.3 - 0.15, 0, 1) * thr : 0;
      const k = target > this.boost ? 0.6 : 0.18;
      this.boost += (target - this.boost) * (1 - Math.exp(-dt / k));
      if (this.turbo > 0) {
        setTo(this.wOsc.frequency, 2600 + 4200 * this.boost, now, 0.08);
        setTo(this.wG.gain, this.turbo * 0.009 * Math.pow(this.boost, 2) * (cab ? 1.5 : 1), now, 0.08);
        if (this.hG) setTo(this.hG.gain, this.turbo * 0.028 * this.boost * (0.3 + 0.7 * thr), now, 0.08);
        // lift off under boost: blow-off valve (or compressor flutter on the rally/rotary builds)
        if (this.lastThr > 0.6 && thr < 0.2 && this.boost > 0.45 && now > this.offT) {
          this.offT = now + 0.8;
          core.oneShot('blowoff', { dest: this.popIn, gain: 0.3 * this.turbo * this.boost * (cab ? 0.7 : 1), rate: (this.turbo >= 1 ? 1.15 : 0.95) + Math.random() * 0.12 });
          this.boost *= 0.4;
        }
      } else {
        // supercharger: whine locked to crank speed
        setTo(this.wOsc.frequency, clamp((this.rpmS / 60) * 3.1 * 4, 200, 9000), now, 0.03);
        setTo(this.wG.gain, this.sc * 0.004 * (0.2 + 0.8 * L) * (0.3 + 0.7 * rpmN), now, 0.06);
        if (this.hG) setTo(this.hG.gain, 0, now, 0.1);
      }
    }
    if (this.gOsc) {
      setTo(this.gOsc.frequency, clamp((this.rpmS / 60) * 9.3, 60, 4000), now, 0.03);
      setTo(this.gG.gain, P.whine * 0.004 * (0.35 + 0.65 * L) * smoothstep(2, 14, speed) * (cab ? 1.5 : 1), now, 0.06);
    }
    // ---- traffic road layer (tyre roar grows with speed)
    if (this.roadG) setTo(this.roadG.gain, 0.9 * Math.pow(clamp(speed / 22, 0, 1.4), 1.6), now, 0.1);

    this._crackle(dt, thr, rpmN, now);
    this.lastThr = thr;
    this._spatial(false);
  }

  _crackle(dt, thr, rpmN, now) {
    const c = this.P.crackle || 0;
    if (!c || this.lite) return;
    if (this.lastThr > 0.6 && thr < 0.15 && rpmN > 0.5) this.budget = 1;
    if (thr > 0.3) this.budget = 0;
    if (this.budget > 0 && thr < 0.15 && rpmN > 0.3 && now >= this.nextPop) {
      this._pop(now + 0.01, 0.2 + Math.random() * 0.4 * this.budget);
      this.nextPop = now + 0.05 + Math.random() * 0.22 / (c * (0.4 + this.budget));
      this.budget = Math.max(0, this.budget - dt * 1.4 - 0.08);
    }
  }
  _pop(t, size) {
    if (!this.built || this.dead) return;
    const core = this.core;
    const v = core.assets && core.assets.variants('backfire');
    if (v && v.length && core.canPlay() && (core.activePops || 0) < 8) {
      const e = v[Math.floor(Math.random() * v.length)];
      const ctx = core.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = core.assets.buf(e.file);
      s.playbackRate.value = 0.85 + Math.random() * 0.35;
      g.gain.value = 0.18 * size * (this.interior ? 0.6 : 1);
      s.connect(g); g.connect(this.popIn);
      core.activePops = (core.activePops || 0) + 1;
      s.onended = () => { core.activePops--; try { s.disconnect(); g.disconnect(); } catch (e2) { /* ignore */ } };
      s.start(t);
      return;
    }
    popSound(core, this.popIn, t, size, 1);
  }

  /** gear change: torque cut dip; turbo blow-off on upshift under boost; pops on downshift */
  shift(up) {
    if (!this.built || this.dead) return;
    const core = this.core, now = core.ctx.currentTime, g = this.cut.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(up ? 0.28 : 0.6, now, 0.012);
    g.setTargetAtTime(1, now + (up ? 0.1 : 0.06), 0.04);
    this.limT = 0;
    if (up && this.turbo > 0 && this.boost > 0.35) core.oneShot('blowoff', { dest: this.popIn, gain: 0.35 * this.turbo, rate: 0.9 + Math.random() * 0.2 });
    if (up && this.turbo > 0) this.boost *= 0.35;
    if (!up && (this.P.crackle || 0) > 0.4) { this._pop(now + 0.05, 0.6); if (Math.random() < 0.6) this._pop(now + 0.13, 0.4); }
  }
  backfire() {
    if (!this.built || this.dead) return;
    const now = this.core.ctx.currentTime;
    this._pop(now + 0.01, 1);
    let t = now + 0.08;
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { this._pop(t, 0.3 + Math.random() * 0.4); t += 0.05 + Math.random() * 0.08; }
  }
}

// ---------------------------------------------------------------------------------------------- electric
// EVs really are mostly tonal (motor + inverter), so a gentle synthesised whine is honest; keep it soft and let
// road/tyre noise carry the sense of speed.
class ElectricVoice extends VoiceBase {
  _ensure() {
    if (this.dead) return false;
    if (this.built) return true;
    if (!this.core.ctx) return false;
    const ctx = this.core.ctx;
    this.amp = this._n(ctx.createGain());
    this.amp.gain.value = 0;
    const lp = this._n(ctx.createBiquadFilter());
    lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.5;
    this.amp.connect(lp);
    this.cut = this._n(ctx.createGain());
    lp.connect(this.cut);
    this._tail(this.lite ? this.core.trafficBus : this.core.engineBus);
    this.cut.connect(this.post);
    const mk = (lvl) => {
      const o = this._n(ctx.createOscillator());
      o.frequency.value = 60;
      const g = this._n(ctx.createGain());
      g.gain.value = lvl;
      o.connect(g); g.connect(this.amp);
      o.start();
      return o;
    };
    this.o1 = mk(0.6);
    this.o2 = mk(0.18);
    if (this.core.noiseA) {
      this.nBP = this._n(ctx.createBiquadFilter());
      this.nBP.type = 'bandpass'; this.nBP.frequency.value = 900; this.nBP.Q.value = 0.8;
      this.nG = this._n(ctx.createGain());
      this.nG.gain.value = 0;
      this.core.noiseA.connect(this.nBP); this.nBP.connect(this.nG); this.nG.connect(this.post);
    }
    this.built = true;
    this.lastT = ctx.currentTime;
    this._spatial(true);
    return true;
  }
  update(p) {
    if (!p || !this._ensure()) return;
    const now = this.core.ctx.currentTime;
    const dt = clamp(now - this.lastT, 0.001, 0.1);
    this.lastT = now;
    this.touched = performance.now();
    this.dop += (this.dopT - this.dop) * (1 - Math.exp(-dt / 0.3));
    const speed = Math.abs(num(p.speed, 0));
    const thr = clamp(num(p.throttle, 0), 0, 1);
    const move = smoothstep(0.2, 3, speed);
    const f1 = (30 + speed * 17) * (this.lite ? this.dop : 1);
    const pow = 0.35 + 0.65 * thr;
    setTo(this.o1.frequency, f1, now, 0.04);
    setTo(this.o2.frequency, f1 * 2.02, now, 0.04);
    setTo(this.amp.gain, EV_GAIN * move * pow * (this.lite ? NPC_GAIN : 1), now, 0.06);
    if (this.nG) { setTo(this.nBP.frequency, 500 + speed * 30, now, 0.1); setTo(this.nG.gain, 0.02 * move * (0.4 + 0.6 * thr), now, 0.1); }
    this._spatial(false);
  }
  _stopSources(t) {
    for (const o of [this.o1, this.o2]) { try { o && o.stop(t); } catch (e) { /* ignore */ } }
  }
}

export function createEngineVoice(core, profile, opts) {
  const name = PROFILES[profile] ? profile : 'i4';
  const P = PROFILES[name];
  return P.electric ? new ElectricVoice(core, name, P, opts) : new SampleVoice(core, name, P, opts);
}
