// HILLBOMB audio: shared DSP helpers.
// Every sound in the game is generated in code. The noise tables, impulse responses,
// wavetables and struck-metal buffers below are computed at runtime; there are no audio files.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** finite-number guard: every public input goes through this so an AudioParam never sees NaN */
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function pick(arr, rng = Math.random) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- AudioParam helpers
/** Smoothly move a param toward value (exponential approach). Never throws on bad numbers. */
export function to(param, value, t, tau) {
  if (!Number.isFinite(value) || !Number.isFinite(t)) return;
  param.setTargetAtTime(value, t, tau > 0.0005 ? tau : 0.0005);
}


// ---------------------------------------------------------------- per-context cache
const CACHE = new WeakMap();
export function cached(ctx, key, make) {
  let m = CACHE.get(ctx);
  if (!m) { m = new Map(); CACHE.set(ctx, m); }
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

function normalizePeak(buf, peak = 0.95) {
  let mx = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > mx) mx = a; }
  }
  if (mx > 0) {
    const k = peak / mx;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return buf;
}

/** crossfade the tail into the head so a looping buffer has no seam click */
function seamless(src, n, fade) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = src[i];
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = src[i] * w + src[n + i] * (1 - w);
  }
  return out;
}

// ---------------------------------------------------------------- noise tables
export function whiteNoise(ctx) {
  return cached(ctx, 'white', () => {
    const sr = ctx.sampleRate, n = Math.floor(sr * 4);
    const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  });
}

/** pink noise (Paul Kellet filter), seamless loop */
export function pinkNoise(ctx) {
  return cached(ctx, 'pink', () => {
    const sr = ctx.sampleRate, n = Math.floor(sr * 5), fade = 8192;
    const raw = new Float32Array(n + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    const b = ctx.createBuffer(1, n, sr);
    b.copyToChannel(seamless(raw, n, fade), 0);
    return normalizePeak(b, 0.9);
  });
}



/**
 * San Francisco cable-car bell: a bright bronze bell struck by a clapper.
 * Inharmonic partials, each a slightly detuned pair (beating shimmer), high partials die fast.
 */
export function bellBuffer(ctx, f0 = 1180) {
  return cached(ctx, 'bell' + f0, () => {
    const sr = ctx.sampleRate, dur = 2.6, n = Math.floor(sr * dur);
    const b = ctx.createBuffer(2, n, sr);
    // [ratio, amplitude, decay seconds]
    const P = [
      [0.5, 0.18, 1.9], [1.0, 1.0, 1.45], [1.183, 0.42, 1.1], [1.506, 0.34, 0.9], [2.0, 0.62, 0.75],
      [2.514, 0.3, 0.52], [2.662, 0.27, 0.44], [3.011, 0.2, 0.34], [4.07, 0.16, 0.22], [5.19, 0.1, 0.14], [6.42, 0.06, 0.09],
    ];
    const nyq = sr * 0.45;
    const rng = mulberry32(4242);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (const [r, a, dec] of P) {
        const f = f0 * r;
        if (f > nyq) continue;
        const beat = 0.4 + rng() * 1.3;
        const f1 = f - beat * 0.5 * (ch ? 1.1 : 0.9), f2 = f + beat * 0.5;
        const w1 = TAU * f1 / sr, w2 = TAU * f2 / sr, ph = rng() * TAU;
        const kd = 1 / (dec * sr);
        const len = Math.min(n, Math.floor(dec * 7 * sr));
        for (let i = 0; i < len; i++) {
          const env = Math.exp(-i * kd) * (i < 48 ? i / 48 : 1);
          d[i] += a * env * 0.5 * (Math.sin(w1 * i + ph) + Math.sin(w2 * i));
        }
      }
      // clapper "tink"
      let prev = 0;
      for (let i = 0; i < sr * 0.006; i++) {
        const w = rng() * 2 - 1;
        d[i] += (w - prev) * 0.5 * Math.exp(-i / (sr * 0.0015));
        prev = w;
      }
    }
    return normalizePeak(b, 0.9);
  });
}

/** Stereo impulse response: pre-delay, early reflections, exponentially decaying noise that darkens over time. Unit energy per channel. */
export function reverbIR(ctx, key, o = {}) {
  return cached(ctx, 'ir:' + key, () => {
    const { seconds = 2.2, tau = 0.4, pre = 0.012, bright = 0.25, dark = 0.9, early = [] } = o;
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let y = 0;
      const p0 = Math.floor(pre * sr);
      for (let i = p0; i < n; i++) {
        const tt = (i - p0) / sr;
        const x = (Math.random() * 2 - 1) * Math.exp(-tt / tau);
        const a = lerp(bright, dark, Math.min(1, tt / (seconds * 0.8)));
        y = y * a + x * (1 - a);
        d[i] = y;
      }
      let e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const tailRms = Math.sqrt(e / Math.max(1, n - p0));
      for (const [et, eg] of early) {
        const i = Math.floor((et + (ch ? 0.0031 : 0)) * sr);
        if (i < n) d[i] += eg * tailRms * 8 * (ch ? 0.85 : 1);
      }
      const fade = Math.floor(sr * 0.05);
      for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
      e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const k = 1 / Math.sqrt(e || 1);
      for (let i = 0; i < n; i++) d[i] *= k;
    }
    return b;
  });
}


/** final safety clipper: linear up to the knee, then a tanh shoulder that never exceeds ceil */
export function softClipCurve(knee = 0.82, ceil = 0.985) {
  const n = 8192, c = new Float32Array(n), span = ceil - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + span * Math.tanh((ax - knee) / span);
    c[i] = x < 0 ? -y : y;
  }
  return c;
}






