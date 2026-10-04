// HILLBOMB audio: radio.
// Stations play curated CC0 tracks (public/assets/audio/music/..., listed in the manifest) through one streaming
// <audio> element routed into the music bus (tracks are never decoded whole). Stations run on a "live" timeline:
// tuning back in joins whatever is on air, like real radio. A short station ident plays on tune-in and between some
// tracks. External stations (the Spotify module) register through registerExternal() and receive select/deselect,
// next/prev, volume and pause calls.
//
// Keys (handled by the menus module): T = radio.next(), Y = radio.prev() or off. On an external station T/Y skip
// tracks; hold Shift to change station instead.

import { clamp, num } from './dsp.js';

const LS_KEY = 'hillbomb.radio.v1';
const MUSIC_TRIM = 0.85;  // tracks are mastered to -16 LUFS; default slider (0.6) puts the radio near -21 LUFS (offline render 10/1: ~0.5 dB under a 30 mph cruise), max near -17
// Spotify plays outside Web Audio at its own -14 LUFS normalisation (no master chain): this factor lands it on the same
// loudness as the internal stations at any slider position (-14 + 20log10(master * music * MUSIC_TRIM * EXT_MATCH) = the measured internal level)
const EXT_MATCH = 0.96;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

function shuffle(a, seed) {
  let s = seed >>> 0 || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

export function createRadio(core) {
  let list = [];          // [{ id, name, genre, tracks, ident, external?, ext?, order, epoch, total }]
  let on = false, index = 0, ready = false;
  let el = null, elSrc = null, trackGain = null, out = null;
  let playing = null;     // { st, ti, started (ctx time), dur }
  let identBufs = new Map();
  let shiftHeld = false;
  let paused = false;     // menus / cutscene (external stations pause; internal ones duck)
  let duck = 1;
  let extVol = -1;
  const subs = new Set();
  const wall = () => performance.now() / 1000;
  const saved = lsGet();

  if (typeof window !== 'undefined') {
    const k = (e) => { shiftHeld = !!e.shiftKey; };
    window.addEventListener('keydown', k, true);
    window.addEventListener('keyup', k, true);
    window.addEventListener('blur', () => { shiftHeld = false; });
  }

  function buildList() {
    const m = core.assets && core.assets.manifest;
    const internal = (m && m.music && m.music.stations) || [];
    const ext = list.filter((s) => s.external);
    list = internal.filter((s) => s.tracks && s.tracks.length).map((s, i) => {
      const order = shuffle(s.tracks.map((_, k) => k), (Date.now() / 3.6e6) ^ (i * 7919));
      const total = s.tracks.reduce((a, t) => a + (t.duration || 180) + 1.5, 0);
      return { id: s.id, name: s.name, genre: s.genre, tracks: s.tracks, ident: s.ident, order, total, epoch: wall() - Math.random() * total };
    }).concat(ext);
    radio.stations.length = 0;
    for (const s of list) radio.stations.push({ id: s.id, name: s.name, get genre() { return s.external ? s.ext.genre : s.genre; } });
    if (saved.station) { const i = list.findIndex((s) => s.id === saved.station); if (i >= 0) index = i; }
    index = clamp(index, 0, Math.max(0, list.length - 1));
  }

  function graph() {
    if (out || !core.ctx) return !!out;
    const ctx = core.ctx;
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(core.musicBus);
    trackGain = ctx.createGain();
    trackGain.gain.value = 0;
    trackGain.connect(out);
    if (!core.offline && typeof Audio !== 'undefined') {
      el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      try { elSrc = ctx.createMediaElementSource(el); elSrc.connect(trackGain); } catch (e) { console.warn('[audio] radio element', e); }
      el.addEventListener('ended', () => { if (on && playing) advance(); });
      el.addEventListener('error', () => { if (on && playing) setTimeout(advance, 1500); });
    }
    return true;
  }

  const cur = () => list[index] || null;
  function position(st) {
    // live timeline: which track is on air and how far into it
    let t = ((wall() - st.epoch) % st.total + st.total) % st.total;
    for (let k = 0; k < st.order.length; k++) {
      const tr = st.tracks[st.order[k]], d = (tr.duration || 180) + 1.5;
      if (t < d) {
        // joining in the last 15 s of a song sounds like a glitch: start the next one instead
        if ((tr.duration || 180) - t < 15) return { k: (k + 1) % st.order.length, off: 0 };
        return { k, off: t };
      }
      t -= d;
    }
    return { k: 0, off: 0 };
  }

  function stopInternal(fade = 0.25) {
    if (!trackGain) return;
    const now = core.ctx.currentTime;
    trackGain.gain.cancelScheduledValues(now);
    trackGain.gain.setTargetAtTime(0, now, fade / 3);
    const e = el;
    if (e) setTimeout(() => { if (!playing || playing.el !== e || !on) { try { e.pause(); } catch (x) { /* ignore */ } } }, fade * 1000 + 50);
    if (playing && playing.bufSrc) { try { playing.bufSrc.stop(now + fade); } catch (x) { /* ignore */ } }
    playing = null;
  }

  function ident(st, t) {
    if (!st.ident || !core.canPlay()) return 0;
    const b = identBufs.get(st.ident);
    if (!b) { core.assets.load(st.ident.file || st.ident).then((x) => { if (x) identBufs.set(st.ident, x); }); return 0; }
    const ctx = core.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; g.gain.value = 0.8;
    s.connect(g); g.connect(out);
    s.start(t);
    s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
    return b.duration;
  }

  function playTrack(st, k, off, withIdent) {
    const tr = st.tracks[st.order[k]];
    if (!tr) return;
    const ctx = core.ctx, now = ctx.currentTime;
    const identDur = withIdent ? ident(st, now + 0.05) : 0;
    const startAt = identDur > 0 ? Math.max(0, identDur - 0.6) : 0;
    playing = { st, k, tr, started: now + startAt, off, el };
    if (core.offline) {
      // tests: decode and schedule as a buffer
      core.assets.load(tr.file).then((b) => {
        if (!b || !playing || playing.tr !== tr) return;
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(trackGain); s.start(ctx.currentTime + 0.02, off);
        playing.bufSrc = s;
        trackGain.gain.setTargetAtTime(trackLevel(tr), ctx.currentTime, 0.05);
      });
      notify();
      return;
    }
    if (!el) return;
    el.src = core.assets.base + tr.file;
    const go = () => {
      try { el.currentTime = off; } catch (e) { /* not seekable yet */ }
      const p = el.play();
      if (p && p.catch) p.catch(() => { retryOnGesture(); });
      const t = core.ctx.currentTime;
      trackGain.gain.cancelScheduledValues(t);
      trackGain.gain.setValueAtTime(0, t);
      trackGain.gain.setTargetAtTime(trackLevel(tr), t + startAt, off > 0 ? 0.4 : 0.02);
    };
    if (el.readyState >= 1) go();
    else el.addEventListener('loadedmetadata', go, { once: true });
    notify();
  }
  const trackLevel = (tr) => clamp(Math.pow(10, (-16 - num(tr.lufs, -16)) / 20), 0.3, 2);

  let gestureHooked = false;
  function retryOnGesture() {
    if (gestureHooked || typeof window === 'undefined') return;
    gestureHooked = true;
    const f = () => { gestureHooked = false; window.removeEventListener('pointerdown', f, true); window.removeEventListener('keydown', f, true); if (on && el && el.paused && playing) el.play().catch(() => {}); };
    window.addEventListener('pointerdown', f, true);
    window.addEventListener('keydown', f, true);
  }

  function advance() {
    const st = cur();
    if (!st || st.external || !on) return;
    const k = playing && playing.st === st ? (playing.k + 1) % st.order.length : position(st).k;
    // keep the live timeline consistent with what actually played
    playTrack(st, k, 0, Math.random() < 0.5);
  }

  function tune() {
    if (!on || !core.ctx || !graph()) return;
    const st = cur();
    for (const s of list) if (s.external && s !== st && s._selected) { s._selected = false; try { s.ext.onDeselect(); } catch (e) { console.warn(e); } }
    if (!st) { notify(); return; }
    if (st.external) {
      stopInternal(0.2);
      if (!st._selected) { st._selected = true; try { st.ext.onSelect(); } catch (e) { console.warn('[audio] station select', e); } }
      pushExtVolume(true);
      notify();
      return;
    }
    stopInternal(0.15);
    const p = position(st);
    playTrack(st, p.k, p.off, true);
  }

  function setStation(i) {
    const n = list.length;
    if (!n) { notify(); return; }
    i = ((Math.round(Number.isFinite(i) ? i : 0) % n) + n) % n;
    if (i === index && playing) return;
    index = i;
    saved.station = list[index].id; lsSet(saved);
    if (on) tune(); else notify();
  }

  function effVolume() {
    const v = core.vol || {};
    const side = core.musicSide ? clamp(num(core.musicSide.gain.value, 1), 0, 1) : 1; // engine side-chain (audio.js)
    return clamp((v.master ?? 1) * (v.music ?? 1) * (core.muted ? 0 : 1) * MUSIC_TRIM * EXT_MATCH * duck * side, 0, 1);
  }
  function pushExtVolume(force) {
    const st = cur();
    if (!st || !st.external) return;
    const v = on ? effVolume() : 0;
    if (force || Math.abs(v - extVol) > 0.01) { extVol = v; try { st.ext.setVolume(v); } catch (e) { /* ignore */ } }
  }

  function applyOut() {
    if (!out) return;
    const now = core.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(on ? MUSIC_TRIM * duck : 0, now, 0.25);
    pushExtVolume(false);
  }

  function notify() {
    const c = radio.current();
    const cb = radio.onTrackChange;
    if (typeof cb === 'function') { try { cb(c); } catch (e) { console.warn('[audio] onTrackChange', e); } }
    for (const f of subs) { try { f(c); } catch (e) { console.warn('[audio] radio subscriber', e); } }
  }

  const radio = {
    stations: [],
    onTrackChange: null,
    setOn(v) {
      v = !!v;
      if (v === on) return;
      on = v;
      if (!ready) { notify(); return; }
      if (on) { graph(); applyOut(); tune(); }
      else {
        stopInternal(0.3);
        const st = cur();
        if (st && st.external && st._selected) { st._selected = false; try { st.ext.onDeselect(); } catch (e) { /* ignore */ } }
        applyOut();
        notify();
      }
    },
    isOn: () => on,
    next() {
      const st = cur();
      if (on && st && st.external && !shiftHeld) { try { st.ext.next(); } catch (e) { /* ignore */ } return; }
      setStation(index + 1);
    },
    prev() {
      const st = cur();
      if (on && st && st.external && !shiftHeld) { try { st.ext.prev(); } catch (e) { /* ignore */ } return; }
      setStation(index - 1);
    },
    nextStation() { setStation(index + 1); },
    prevStation() { setStation(index - 1); },
    setStation(i) { setStation(i); },
    setStationById(id) { const i = list.findIndex((s) => s.id === id); if (i >= 0) setStation(i); },
    stationList() { return list.map((s, i) => ({ index: i, id: s.id, name: s.name, genre: s.external ? s.ext.genre : s.genre, external: !!s.external })); },
    current() {
      const st = cur();
      if (!st) return { index: -1, id: null, name: 'Radio', genre: '', track: '', title: '', artist: '', external: false };
      if (st.external) {
        let np = null;
        try { np = st.ext.nowPlaying(); } catch (e) { /* ignore */ }
        return { index, id: st.id, name: st.name, genre: st.ext.genre, external: true, title: np?.title || '', artist: np?.artist || '', art: np?.art || null,
          positionMs: np?.positionMs || 0, durationMs: np?.durationMs || 0, paused: !!np?.paused, message: np?.message || '', track: np?.title ? `${np.artist} - ${np.title}` : np?.message || '' };
      }
      const p = playing && playing.st === st ? playing : null;
      const tr = p ? p.tr : st.tracks[st.order[position(st).k]];
      let pos = 0;
      if (p && el && !core.offline) pos = el.currentTime || 0;
      else if (p) pos = p.off + Math.max(0, core.ctx.currentTime - p.started);
      return { index, id: st.id, name: st.name, genre: st.genre, external: false, title: tr?.title || '', artist: tr?.artist || '', art: null,
        positionMs: Math.round(pos * 1000), durationMs: Math.round((tr?.duration || 0) * 1000), track: tr ? `${tr.artist} - ${tr.title}` : '' };
    },
    nowPlaying() { return radio.current(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    registerExternal(ext) {
      if (!ext || !ext.id) return { unregister() {}, notify() {} };
      const i0 = list.findIndex((s) => s.id === ext.id);
      if (i0 >= 0) list.splice(i0, 1);
      const st = { id: ext.id, get name() { return ext.name || ext.id; }, external: true, ext, _selected: false };
      list.push(st);
      radio.stations.push({ id: st.id, get name() { return st.name; }, get genre() { return ext.genre; } });
      if (saved.station === ext.id) index = list.length - 1;
      pushExtVolume(true);
      if (on && cur() === st) tune();
      return {
        unregister() {
          const i = list.indexOf(st);
          if (i < 0) return;
          if (st._selected) { st._selected = false; try { ext.onDeselect(); } catch (e) { /* ignore */ } }
          list.splice(i, 1);
          const j = radio.stations.findIndex((s) => s.id === st.id);
          if (j >= 0) radio.stations.splice(j, 1);
          index = clamp(index, 0, Math.max(0, list.length - 1));
        },
        notify() { if (cur() === st) notify(); },
      };
    },
    /** internal: core calls this once the context exists / the manifest loaded */
    _onContext() {
      core.assets.loadManifest().then(() => {
        buildList();
        ready = true;
        for (const st of list) if (st.ident) core.assets.load(st.ident).then((b) => { if (b) identBufs.set(st.ident, b); });
        if (on) { graph(); applyOut(); tune(); }
        notify();
      });
    },
    /** internal: menus / cutscenes (external stations pause, internal ones duck) */
    _setPaused(p, amount = 0.5) {
      const target = p ? amount : 1;
      if (paused !== !!p || Math.abs(duck - target) > 0.01) {
        paused = !!p;
        duck = target;
        const st = cur();
        if (st && st.external && on) { try { st.ext.setPaused(paused); } catch (e) { /* ignore */ } }
        applyOut();
      }
    },
    _volumeChanged() { pushExtVolume(false); },
    _scheduleUntil() {},
  };
  return radio;
}
