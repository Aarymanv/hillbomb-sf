// HILLBOMB audio: recorded-asset loader (CC0 recordings listed in public/assets/audio/manifest.json).
// Buffers are fetched + decoded on demand and cached; every getter is safe to call before anything has loaded
// (it returns null and the caller falls back or stays silent). Nothing here throws into the game.

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/audio/';

export function createAssets(core, opts = {}) {
  const base = opts.base || BASE;
  const bufs = new Map();     // file -> AudioBuffer
  const pending = new Map();  // file -> Promise<AudioBuffer|null>
  let manifest = null, manifestP = null;

  function loadManifest() {
    if (manifest) return Promise.resolve(manifest);
    if (!manifestP) {
      manifestP = fetch(base + 'manifest.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => { manifest = m || { sounds: {}, engines: {}, music: { stations: [] } }; return manifest; })
        .catch((e) => { console.warn('[audio] manifest', e); manifest = { sounds: {}, engines: {}, music: { stations: [] } }; return manifest; });
    }
    return manifestP;
  }

  function decode(ctx, ab) {
    return new Promise((res, rej) => {
      // Safari < 14.1 only has the callback form
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }

  /** load one file (path relative to assets/audio/) -> AudioBuffer (cached) */
  function load(file) {
    if (!file) return Promise.resolve(null);
    if (bufs.has(file)) return Promise.resolve(bufs.get(file));
    if (pending.has(file)) return pending.get(file);
    const ctx = core.ctx;
    if (!ctx) return Promise.resolve(null);
    const p = fetch(base + file)
      .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + file); return r.arrayBuffer(); })
      .then((ab) => decode(ctx, ab))
      .then((b) => { bufs.set(file, b); pending.delete(file); return b; })
      .catch((e) => { console.warn('[audio] load failed', file, e && e.message); pending.delete(file); bufs.set(file, null); return null; });
    pending.set(file, p);
    return p;
  }

  const A = {
    base,
    get manifest() { return manifest; },
    loadManifest,
    load,
    /** decoded buffer or null (never waits) */
    buf(file) { return bufs.get(file) || null; },
    /** sound entry by key: { file, kind, loopStart, loopEnd, variants:[...] } */
    sound(key) { return manifest && manifest.sounds ? manifest.sounds[key] || null : null; },
    /** all variant entries of a sound key that are decoded */
    variants(key) {
      const s = A.sound(key);
      if (!s) return [];
      const list = s.variants || [s];
      return list.filter((v) => bufs.get(v.file));
    },
    /** first decoded entry for key (loops) */
    ready(key) {
      const v = A.variants(key);
      return v.length ? v[0] : null;
    },
    /** load every variant of the given sound keys */
    loadSounds(keys) {
      return loadManifest().then(() => Promise.all(keys.flatMap((k) => {
        const s = A.sound(k);
        if (!s) return [];
        return (s.variants || [s]).map((v) => load(v.file));
      })));
    },
    loadEngine(family) {
      return loadManifest().then(() => {
        const e = manifest.engines && manifest.engines[family];
        return e ? load(e.file).then((b) => (b ? e : null)) : null;
      });
    },
    engine(family) {
      const e = manifest && manifest.engines ? manifest.engines[family] : null;
      return e && bufs.get(e.file) ? e : null;
    },
    stats() { return { decoded: [...bufs.values()].filter(Boolean).length, pending: pending.size }; },
  };
  return A;
}
