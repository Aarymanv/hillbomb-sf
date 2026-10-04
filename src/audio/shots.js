// HILLBOMB audio: pooled one-shot voices.
// A ShotPool owns a fixed number of persistent output slots (pan -> distance low-pass -> gain,
// plus a reverb send). Every one-shot borrows a slot; when all slots are busy the oldest shot is
// faded out in a few ms and its slot is reused (voice stealing), so concurrent one-shot nodes are
// strictly bounded no matter how often the game fires impacts or UI sounds. The only nodes created
// per shot are the single-use sources (Oscillator / AudioBufferSource, one-shot by WebAudio design)
// and their small envelope/filter nodes, all disconnected when the shot ends.

import { clamp, num, smoothstep } from './dsp.js';

/** inverse-distance attenuation with a hard-ish horizon */
export function distGain(d, ref = 6, horizon = 450) {
  if (d >= horizon) return 0;
  return (ref / Math.max(ref, d)) * (1 - smoothstep(horizon * 0.7, horizon, d));
}
/** air absorption / occlusion: darker with distance */
export function distCutoff(d) {
  return clamp(20000 / (1 + d / 12), 320, 20000);
}

export class Shot {
  constructor(core, dest, t) {
    this.core = core;
    this.ctx = core.ctx;
    this.t = t;
    this.nodes = [];
    this.srcs = [];
    this.alive = 0;
    this.dead = false;
    this.onCleanup = null;
    this.out = this.ctx.createGain();
    this.out.connect(dest);
    this.nodes.push(this.out);
  }
  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }
  filter(type, f, Q = 0.707, gainDb = 0) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = clamp(f, 10, this.ctx.sampleRate * 0.45);
    b.Q.value = Q;
    b.gain.value = gainDb;
    this.nodes.push(b);
    return b;
  }
  shaper(curve) {
    const s = this.ctx.createWaveShaper();
    s.curve = curve;
    this.nodes.push(s);
    return s;
  }
  panner(p) {
    const s = this.ctx.createStereoPanner();
    s.pan.value = clamp(p, -1, 1);
    this.nodes.push(s);
    return s;
  }
  _src(s, t, offset) {
    this.srcs.push(s);
    this.nodes.push(s);
    this.alive++;
    s.onended = () => { if (--this.alive <= 0) this.cleanup(); };
    if (offset !== undefined) s.start(t, offset);
    else s.start(t);
    return s;
  }
  osc(type, f, t = this.t) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = f;
    return this._src(o, t);
  }
  /** looping noise source at a random offset */
  noise(buffer, t = this.t, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    return this._src(s, t, Math.random() * buffer.duration * 0.9);
  }
  /** play a buffer once (optionally from an offset in seconds) */
  buffer(buffer, t = this.t, rate = 1, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = rate;
    return this._src(s, t, Math.max(0, offset));
  }
  /** schedule the end of the shot: short fade on the shot bus, then stop every source */
  finish(tEnd) {
    this.end = tEnd;
    this.out.gain.setTargetAtTime(0, Math.max(this.t + 0.01, tEnd - 0.03), 0.008);
    for (const s of this.srcs) { try { s.stop(tEnd + 0.01); } catch (e) { /* already stopped */ } }
    if (this.srcs.length === 0) this.cleanup();
  }
  /** voice steal: fade out fast and stop early */
  kill(now) {
    if (this.dead) return;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(0, now, 0.004);
    for (const s of this.srcs) { try { s.stop(now + 0.03); } catch (e) { /* ignore */ } }
  }
  cleanup() {
    if (this.dead) return;
    this.dead = true;
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    this.nodes.length = 0;
    this.srcs.length = 0;
    if (this.onCleanup) this.onCleanup();
  }
}

export class ShotPool {
  constructor(core, size, dest) {
    this.core = core;
    this.slots = [];
    const ctx = core.ctx;
    for (let i = 0; i < size; i++) {
      const input = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 20000;
      lp.Q.value = 0.5;
      const pan = ctx.createStereoPanner();
      const g = ctx.createGain();
      const send = ctx.createGain();
      send.gain.value = 0;
      input.connect(lp);
      lp.connect(pan);
      pan.connect(g);
      g.connect(dest);
      g.connect(send);
      send.connect(core.revIn);
      this.slots.push({ input, lp, pan, g, send, shot: null, until: 0, started: -1 });
    }
  }
  get active() {
    const now = this.core.ctx ? this.core.ctx.currentTime : 0;
    return this.slots.filter((s) => s.until > now).length;
  }
  /**
   * build(shot, t) creates the sound starting at t and returns its duration in seconds.
   * o: { distance, pan, send (reverb 0..1), gain, delay (s) }
   */
  play(build, o = {}) {
    const core = this.core;
    if (!core.canPlay()) return null;
    const ctx = core.ctx, now = ctx.currentTime;
    let slot = null, oldest = null;
    for (const s of this.slots) {
      if (s.until <= now) { slot = s; break; }
      if (!oldest || s.started < oldest.started) oldest = s;
    }
    let t = now + 0.004 + clamp(num(o.delay, 0), 0, 2);
    if (!slot) {
      slot = oldest;
      if (slot.shot) slot.shot.kill(now);
      t = now + 0.025;
    }
    const d = Math.max(0, num(o.distance, 0));
    const g = num(o.gain, 1) * distGain(d, o.ref || 6);
    if (g <= 0.0005) return null;
    slot.pan.pan.setValueAtTime(clamp(num(o.pan, 0), -1, 1), t);
    slot.lp.frequency.setValueAtTime(distCutoff(d), t);
    slot.g.gain.setValueAtTime(g, t);
    slot.send.gain.setValueAtTime(clamp(num(o.send, 0) + 0.35 * smoothstep(15, 250, d), 0, 1.5), t);
    const shot = new Shot(core, slot.input, t);
    let dur = 0.5;
    try {
      dur = num(build(shot, t), 0.5);
    } catch (e) {
      shot.finish(t);
      console.warn('[audio] one-shot failed', e);
      return null;
    }
    shot.finish(t + dur);
    slot.shot = shot;
    slot.until = t + dur + 0.02;
    slot.started = now;
    return shot;
  }
}

// ---------------------------------------------------------------- common one-shot building blocks

/** pitched thump: sine that drops from f0 to f1 */
export function thump(S, t, f0, f1, dur, lvl) {
  const o = S.osc('sine', f0, t);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.6);
  const g = S.gain(0);
  o.connect(g);
  g.connect(S.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(lvl, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, dur / 3);
  return o;
}

/** filtered noise burst. o: { buf, type, f, q, att, dec, lvl, rate, sweep, sweepT } */
export function noiseBurst(S, t, o) {
  const src = S.noise(o.buf, t, o.rate || 1);
  const f = S.filter(o.type || 'lowpass', o.f || 1000, o.q || 0.7);
  const g = S.gain(0);
  src.connect(f);
  f.connect(g);
  g.connect(o.dest || S.out);
  if (o.sweep) {
    f.frequency.setValueAtTime(o.f, t);
    f.frequency.exponentialRampToValueAtTime(o.sweep, t + (o.sweepT || 0.2));
  }
  const att = o.att || 0.002;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.lvl, t + att);
  if (o.hold) g.gain.setValueAtTime(o.lvl, t + att + o.hold);
  g.gain.setTargetAtTime(0, t + att + (o.hold || 0), o.dec || 0.05);
  return { src, f, g };
}

/** struck resonator: sum of decaying sine partials */
export function modal(S, t, base, ratios, amps, decays, lvl) {
  const nyq = S.ctx.sampleRate * 0.45;
  for (let i = 0; i < ratios.length; i++) {
    const f = base * ratios[i] * (1 + (Math.random() - 0.5) * 0.02);
    if (f > nyq) continue;
    const o = S.osc('sine', f, t);
    const g = S.gain(0);
    o.connect(g);
    g.connect(S.out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * amps[i], t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, decays[i]);
  }
}

/**
 * Exhaust pop: a very short broadband burst ringing a pipe resonance, plus a crack edge;
 * big ones get a low thump. `dest` is usually an engine's pop input so NPC pops are spatialised.
 */
export function popSound(core, dest, t, size = 0.5, tone = 1) {
  if (!core.canPlay() || core.activePops >= 14) return;
  const S = new Shot(core, dest, t);
  core.activePops++;
  S.onCleanup = () => { core.activePops--; };
  const buf = core.white;
  const a = 0.4 * clamp(size, 0.05, 1.2);
  const n = S.noise(buf, t, 1);
  const bp = S.filter('bandpass', (230 + 520 * Math.random()) * tone, 2.2);
  const g = S.gain(0);
  n.connect(bp);
  bp.connect(g);
  g.connect(S.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(a * 4.5, t + 0.0012);
  g.gain.setTargetAtTime(0, t + 0.0012, 0.006 + 0.018 * size);
  const hp = S.filter('highpass', 2200, 0.7);
  const g2 = S.gain(0);
  n.connect(hp);
  hp.connect(g2);
  g2.connect(S.out);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(a * 0.9, t + 0.0008);
  g2.gain.setTargetAtTime(0, t + 0.0008, 0.0035);
  if (size > 0.7) thump(S, t, 140 * tone, 55, 0.09, a * 0.9);
  S.finish(t + 0.1 + 0.12 * size);
}
