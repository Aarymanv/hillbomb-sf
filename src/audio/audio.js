// HILLBOMB: San Francisco - audio.
// Sample-based: real CC0 recordings (engines, tyres, impacts, ambience, UI, radio tracks) listed in
// public/assets/audio/manifest.json, with tiny synthesised stand-ins only while something is still loading.
//
// Mix (every bus has its own volume, see setVolume):
//   player engine ---------> engineBus --\
//   traffic engines/passbys -> trafficBus -+-> engineVol ---\
//   tyres, wind, impacts, horns, sirens -> fxBus -> sfxVol --+
//   ambience beds + one-shots ----------> ambBus -> ambVol --+--> mix -> glue compressor (gentle, slow) -> trim
//   ui -------------------------------> uiBus -> uiVol -------+      -> peak limiter -> ceiling trim (-1 dBFS)
//   street reverb (sends) ------------> revOut -> sfxVol ----+      -> master volume -> speakers
//   radio (CC0 tracks / Spotify volume) -> musicBus -> musicVol -> musicDuck -> musicSide -/
//   tunnel reverb: engine + traffic + fx sends -> spaceIn -> convolver -> sfxVol (only while in a tunnel)
//
// Side-chain: the hero engine's loudness pulls the radio down ~2.5 dB and traffic ~3 dB at full throttle (sidechain()),
// so the engine always reads on top without the music ever vanishing.
//
// The context is created lazily in unlock() (first user gesture). Every method is safe before that: engine voices
// build themselves once the context and their samples exist, one-shots are ignored while nothing can play.

import { clamp, num, whiteNoise, softClipCurve, reverbIR } from './dsp.js';
import { ShotPool } from './shots.js';
import { createEngineVoice, ENGINE_PROFILES, familiesOf } from './engine.js';
import { Tires, Wind, Scrape, Horns, Siren, Foot, impact, cableCarBell, foghorn, ui, passby, UI_KINDS, IMPACT_KINDS } from './sfx.js';
import { Ambience } from './ambience.js';
import { createRadio } from './music.js';
import { createAssets } from './assets.js';

export { UI_KINDS, IMPACT_KINDS, ENGINE_PROFILES };
export const STATIONS = []; // stations now come from the manifest at runtime: use audio.radio.stationList()
export const BUSES = ['master', 'engine', 'sfx', 'ambience', 'music', 'ui'];
const MAX_NPC_VOICES = 4;
// sounds decoded right after unlock (small); engines load per family on demand, ambience beds when first needed
const PRELOAD = ['tyre_squeal', 'tyre_scrub', 'road_asphalt', 'road_gravel', 'road_grass', 'road_wet', 'wind_rush', 'scrape_metal', 'brake_squeal',
  'suspension_thump', 'body_creak', 'impact_car_light', 'impact_car_heavy', 'impact_wall', 'impact_pole', 'impact_prop', 'glass_break', 'debris', 'body_hit', 'splash',
  'horn_car', 'horn_truck', 'horn_bus', 'siren_wail', 'siren_yelp', 'cable_car_bell', 'foghorn', 'blowoff', 'backfire', 'gear_shift', 'starter', 'passby',
  'foot_concrete', 'foot_hall', 'road_cobble'];
const PRELOAD_LATE = ['amb_city_day', 'amb_city_night', 'amb_residential', 'amb_waterfront', 'amb_park_day', 'amb_park_night', 'amb_wind_high', 'amb_tunnel',
  'rain_light', 'rain_heavy', 'rain_car_roof', 'gull', 'city_honk', 'muni_bell', 'distant_siren', 'thunder_near', 'thunder_far', 'dog_bark',
  'amb_night_market', 'amb_indoor_walla', 'muni_tram', 'cablecar_go'];

let warned = 0;
function safe(fn) {
  return function (...args) {
    try { return fn.apply(this, args); } catch (e) { if (warned++ < 20) console.warn('[audio]', e); return undefined; }
  };
}

/**
 * @param {object} [opts]
 * @param {BaseAudioContext} [opts.context] use this context (e.g. an OfflineAudioContext for tests)
 * @param {boolean} [opts.suspendWhenHidden=true] suspend the context while the tab is hidden
 * @param {boolean} [opts.rawOutput=false] tests only: bypass the master dynamics
 * @param {string} [opts.base] asset base URL (default <BASE_URL>assets/audio/)
 */
export function createAudio(opts = {}) {
  const core = {
    ctx: null,
    offline: false,
    unlocked: false,
    // automated test runs are silent: headless/CDP-driven browsers (navigator.webdriver) and ?mute pages
    muted: typeof location !== 'undefined' && (/[?&]mute\b/.test(location.search) || !!globalThis.navigator?.webdriver),
    vol: { master: 0.9, engine: 1, sfx: 1, ambience: 1, music: 0.6, ui: 1 },
    linked: { ambience: true, ui: true }, // follow the 'sfx' (Effects) volume until set on their own
    engines: new Set(),
    sirens: new Set(),
    activePops: 0,
    fogUntil: 0,
    interior: false,
    wetness: 0,
    assets: null,
    canPlay() { const c = core.ctx; return !!c && (core.offline || c.state === 'running'); },
    /** short music dip for big moments (crashes, thunder) */
    duck(amount) {
      if (!core.ctx) return;
      const now = core.ctx.currentTime, p = core.musicDuck.gain;
      const a = clamp(num(amount, 0), 0, 0.5);
      p.cancelScheduledValues(now);
      p.setTargetAtTime(1 - a, now, 0.03);
      p.setTargetAtTime(1, now + 0.25, 0.6);
    },
    /** hero engine loudness 0..1 (per engine update): radio and traffic sit back under a loud engine */
    sidechain(level) {
      if (!core.ctx || !core.musicSide) return;
      const now = core.ctx.currentTime, x = clamp(num(level, 0), 0, 1);
      const k = x * x;
      core.musicSide.gain.setTargetAtTime(1 - 0.25 * k, now, 0.35);
      core.trafficBus.gain.setTargetAtTime(0.8 * (1 - 0.3 * k), now, 0.3);
      if (now - (core.sideT || 0) > 0.25) { core.sideT = now; radio._volumeChanged(); } // Spotify follows at 4 Hz
    },
    /** acoustic space around the listener: 'street' | 'tunnel' */
    space(kind) {
      if (!core.ctx || !core.spaceIn || core.spaceKind === kind) return;
      core.spaceKind = kind;
      core.spaceIn.gain.setTargetAtTime(kind === 'tunnel' ? 0.5 : 0, core.ctx.currentTime, 0.25);
    },
    /** play a random decoded variant of a sample key; o: { pool 'fx'|'ui'|'amb', dest, gain, rate, lp, distance, pan, send, ref, delay } */
    oneShot(key, o = {}) {
      if (!core.canPlay() || !core.assets) return false;
      const v = core.assets.variants(key);
      if (!v.length) return false;
      let e = v[Math.floor(Math.random() * v.length)];
      const lastK = core._lastVar || (core._lastVar = new Map());
      if (v.length > 1 && lastK.get(key) === e) e = v[(v.indexOf(e) + 1) % v.length]; // never the same take twice in a row
      lastK.set(key, e);
      const buf = core.assets.buf(e.file);
      const rate = clamp(num(o.rate, 1), 0.25, 4);
      const gain = num(o.gain, 1) * num(e.gain, 1);
      if (o.dest) {
        const ctx = core.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = buf; s.playbackRate.value = rate; g.gain.value = gain;
        s.connect(g); g.connect(o.dest);
        s.onended = () => { try { s.disconnect(); g.disconnect(); } catch (x) { /* ignore */ } };
        s.start();
        return true;
      }
      const pool = o.pool === 'ui' ? core.uiPool : o.pool === 'amb' ? core.ambPool : core.fxPool;
      const shot = pool.play((S, t) => {
        const s = S.buffer(buf, t, rate);
        let x = s;
        if (o.lp && o.lp < 18000) { const f = S.filter('lowpass', o.lp, 0.6); x.connect(f); x = f; }
        x.connect(S.out);
        return buf.duration / rate + 0.03;
      }, { distance: o.distance, pan: o.pan, send: o.send, gain, ref: o.ref, delay: o.delay });
      return !!shot;
    },
  };

  const tiresV = new Tires(core);
  const footV = new Foot(core);
  const windV = new Wind(core);
  const scrapeV = new Scrape(core);
  const horns = new Horns(core);
  const amb = new Ambience(core);
  const radio = createRadio(core);

  function build(ctx) {
    core.ctx = ctx;
    core.assets = createAssets(core, { base: opts.base });
    core.white = whiteNoise(ctx);
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // ---- master chain
    core.mix = G(1);
    const glue = ctx.createDynamicsCompressor(); // gentle, slow: holds the mix together without pumping
    glue.threshold.value = -14; glue.knee.value = 12; glue.ratio.value = 1.8; glue.attack.value = 0.03; glue.release.value = 0.45;
    const trim = G(1.1);                          // overall gameplay loudness (the glue node adds ~+3.5 dB make-up)
    const lim = ctx.createDynamicsCompressor();   // peak limiter (6 ms look-ahead in Chromium)
    lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const ceil = G(0.82);                         // limiter make-up is ~+1.4 dB: this lands the ceiling under -1 dBFS
    const clip = ctx.createWaveShaper();          // last-resort safety only (linear below 0.9)
    clip.curve = softClipCurve(0.9, 0.985);
    core.out = G(core.muted ? 0 : core.vol.master);
    if (opts.rawOutput) core.mix.connect(core.out);
    else { core.mix.connect(glue); glue.connect(trim); trim.connect(lim); lim.connect(ceil); ceil.connect(clip); clip.connect(core.out); }
    core.out.connect(ctx.destination);
    core.meters = { glue, lim };
    // ---- buses
    core.engineVol = G(core.vol.engine); core.engineVol.connect(core.mix);
    core.sfxVol = G(core.vol.sfx); core.sfxVol.connect(core.mix);
    core.ambVol = G(core.vol.ambience); core.ambVol.connect(core.mix);
    core.uiVol = G(core.vol.ui); core.uiVol.connect(core.mix);
    core.musicVol = G(core.vol.music);
    core.musicDuck = G(1);
    core.musicSide = G(1);
    core.musicVol.connect(core.musicDuck); core.musicDuck.connect(core.musicSide); core.musicSide.connect(core.mix);
    core.engineBus = G(1); core.engineBus.connect(core.engineVol);
    core.trafficBus = G(0.8); core.trafficBus.connect(core.engineVol);
    core.fxBus = G(0.9); core.fxBus.connect(core.sfxVol);
    core.ambBus = G(0.5); core.ambBus.connect(core.ambVol);
    core.uiBus = G(0.8); core.uiBus.connect(core.uiVol);
    core.musicBus = G(1); core.musicBus.connect(core.musicVol);
    // street reverb for traffic, sirens, horns and distant one-shots
    core.revIn = G(1);
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = reverbIR(ctx, 'env', { seconds: 1.8, tau: 0.35, pre: 0.02, bright: 0.3, dark: 0.9, early: [[0.023, 0.5], [0.041, 0.4], [0.067, 0.3], [0.089, 0.2]] });
    const revOut = G(0.35);
    core.revIn.connect(conv); conv.connect(revOut); revOut.connect(core.sfxVol);
    // tunnel: a long bright slap-back reverb on the engine, traffic and effects (sends stay at 0 outside)
    core.spaceIn = G(0);
    const tconv = ctx.createConvolver();
    tconv.normalize = false;
    tconv.buffer = reverbIR(ctx, 'tunnel', { seconds: 2.6, tau: 0.55, pre: 0.012, bright: 0.55, dark: 0.85, early: [[0.011, 0.7], [0.019, 0.6], [0.034, 0.5], [0.052, 0.45], [0.077, 0.35], [0.104, 0.3]] });
    const spaceOut = G(0.55);
    core.spaceIn.connect(tconv); tconv.connect(spaceOut); spaceOut.connect(core.sfxVol);
    core.engineBus.connect(core.spaceIn); core.trafficBus.connect(core.spaceIn); core.fxBus.connect(core.spaceIn);
    // one shared running noise source for fallbacks and turbo hiss
    const n = ctx.createBufferSource();
    n.buffer = core.white; n.loop = true; n.start(0, 0.3);
    core.noiseA = n;
    // bounded one-shot pools (voice stealing)
    core.fxPool = new ShotPool(core, 12, core.fxBus);
    core.uiPool = new ShotPool(core, 4, core.uiBus);
    core.ambPool = new ShotPool(core, 5, core.ambBus);
    for (const s of core.sirens) s._sync();
    // assets: manifest -> the small SFX set now, ambience a moment later (engines load per family on demand)
    core.assets.loadManifest().then(() => {
      core.assets.loadSounds(PRELOAD.concat(UI_KINDS.map((k) => 'ui_' + k)));
      setTimeout(() => core.assets.loadSounds(PRELOAD_LATE), core.offline ? 0 : 1500);
    });
    radio._onContext();
  }

  if (opts.context) {
    core.offline = typeof OfflineAudioContext !== 'undefined' && opts.context instanceof OfflineAudioContext;
    core.unlocked = true;
    build(opts.context);
  }

  if (typeof document !== 'undefined' && opts.suspendWhenHidden !== false) {
    // a page that starts hidden (background test tabs) never fires visibilitychange: suspend it as soon as audio exists
    const hiddenAtStart = setInterval(() => {
      const c = core.ctx;
      if (!document.hidden) { clearInterval(hiddenAtStart); return; }
      if (c && !core.offline && c.state === 'running') { core.autoSuspended = true; c.suspend().catch(() => {}); }
    }, 500);
    document.addEventListener('visibilitychange', () => {
      const c = core.ctx;
      if (!c || core.offline || !core.unlocked) return;
      if (document.hidden) { if (c.state === 'running') { core.autoSuspended = true; c.suspend().catch(() => {}); } }
      else if (core.autoSuspended) { core.autoSuspended = false; c.resume().catch(() => {}); }
    });
  }

  const BUS = { master: 'out', engine: 'engineVol', sfx: 'sfxVol', ambience: 'ambVol', amb: 'ambVol', music: 'musicVol', ui: 'uiVol' };
  const applyVolumes = () => {
    if (!core.ctx) return;
    const now = core.ctx.currentTime;
    const set = (node, v) => { node.gain.cancelScheduledValues(now); node.gain.setTargetAtTime(v, now, 0.04); };
    set(core.out, core.muted ? 0 : core.vol.master);
    const m = core.menu || { engine: 1, sfx: 1 };
    set(core.engineVol, core.vol.engine * m.engine); set(core.sfxVol, core.vol.sfx * m.sfx); set(core.ambVol, core.vol.ambience);
    set(core.musicVol, core.vol.music); set(core.uiVol, core.vol.ui);
    radio._volumeChanged();
  };

  // stopped engine voices idle silently for a moment before being freed, so traffic churn reuses them
  const parked = [];
  let sweepTimer = null;
  function sweepParked() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      const now = performance.now();
      for (let i = parked.length - 1; i >= 0; i--) if (parked[i].until <= now) { parked[i].v.stop(); parked.splice(i, 1); }
      if (parked.length) sweepParked();
    }, 1000);
  }
  const playerEngines = () => [...core.engines].filter((e) => !e.lite && !e.dead);
  const dummyEngine = (name) => ({ profile: name, update() {}, setSpatial() {}, setVolume() {}, stop() {}, shift() {}, backfire() {}, setPerspective() {}, duckFor() {} });

  // ---- director: menus / cutscenes duck the radio (and pause Spotify); runs on a timer so it works while paused
  let G = null, dirTimer = null;
  function direct() {
    if (!G) return;
    try {
      const menu = G.state !== 'play' || !!(G.ui && G.ui.isModal && G.ui.isModal()) || !!G.renderOverride;
      const cutscene = !!G.cameraOverride;
      radio._setPaused(menu || cutscene, cutscene ? 0.35 : 0.5);
      // world sounds sit back while a menu is up (the pools ring out naturally)
      const want = menu ? { engine: 0.5, sfx: 0.35 } : { engine: 1, sfx: 1 };
      if (!core.menu || core.menu.sfx !== want.sfx) { core.menu = want; applyVolumes(); }
    } catch (e) { /* never break the game */ }
  }

  const audio = {
    get ctx() { return core.ctx; },
    get core() { return core; },

    /** Call from the first user gesture (click / key / touch). Safe to call on every gesture. */
    unlock: safe(() => {
      if (!core.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return Promise.resolve(false);
        build(new AC({ latencyHint: 'interactive' }));
      }
      core.unlocked = true;
      const c = core.ctx;
      if (core.offline || c.state === 'running') return Promise.resolve(true);
      try { const b = c.createBufferSource(); b.buffer = c.createBuffer(1, 1, c.sampleRate); b.connect(c.destination); b.start(); } catch (e) { /* ignore */ }
      return c.resume().then(() => true, () => false);
    }),
    /** resolves once the manifest (and with {all:true} every sample, engines included) is decoded */
    ready: safe((o = {}) => {
      if (!core.assets) return Promise.resolve(false);
      return core.assets.loadManifest().then((m) => {
        const jobs = [core.assets.loadSounds(PRELOAD.concat(UI_KINDS.map((k) => 'ui_' + k)))];
        if (o.all) {
          jobs.push(core.assets.loadSounds(PRELOAD_LATE));
          for (const f of Object.keys(m.engines || {})) jobs.push(core.assets.loadEngine(f));
        }
        for (const p of o.engines || []) for (const f of familiesOf(p)) jobs.push(core.assets.loadEngine(f));
        return Promise.all(jobs).then(() => true);
      });
    }),
    /** bus: 'master'|'engine'|'sfx'|'ambience'|'music'|'ui'; v 0..1 */
    setVolume: safe((bus, v) => {
      const k = bus === 'amb' ? 'ambience' : bus;
      if (!(k in core.vol)) return;
      core.vol[k] = clamp(num(v, core.vol[k]), 0, 1);
      if (k in core.linked) core.linked[k] = false;
      if (k === 'sfx') for (const l of Object.keys(core.linked)) if (core.linked[l]) core.vol[l] = core.vol.sfx;
      applyVolumes();
    }),
    getVolume: (bus) => core.vol[bus === 'amb' ? 'ambience' : bus],
    setVolumes: safe((v = {}) => {
      if (!v) return;
      if (v.volume != null && v.master == null) v = { ...v, master: v.volume }; // accept the settings object as-is
      if (v.amb != null && v.ambience == null) v = { ...v, ambience: v.amb };
      for (const k of Object.keys(core.vol)) {
        if (v[k] == null) continue;
        core.vol[k] = clamp(num(v[k], core.vol[k]), 0, 1);
        if (k in core.linked) core.linked[k] = false;
      }
      for (const l of Object.keys(core.linked)) if (core.linked[l]) core.vol[l] = core.vol.sfx;
      applyVolumes();
    }),
    setMuted: safe((m) => { core.muted = !!m; applyVolumes(); }),
    /** listener state from the game: { interior: bool (cabin camera) } */
    setListener: safe((o = {}) => {
      if (o.interior !== undefined && !!o.interior !== core.interior) {
        core.interior = !!o.interior;
        for (const e of core.engines) if (!e.lite) e.setPerspective(core.interior);
      }
    }),
    /** bind the game so menus/cutscenes duck the radio and pause Spotify */
    attach: safe((game) => {
      G = game;
      // the settings screen emits G.emit('settings', settings, key): volume, sfx, music, engine (0..1)
      const fromSettings = (st) => {
        if (!st) return;
        const v = {};
        for (const [from, to] of [['volume', 'master'], ['sfx', 'sfx'], ['music', 'music'], ['engine', 'engine'], ['ambience', 'ambience'], ['ui', 'ui']]) if (typeof st[from] === 'number') v[to] = st[from];
        audio.setVolumes(v);
      };
      if (G.on) G.on('settings', (st, key) => { if (!key || ['all', 'volume', 'sfx', 'music', 'engine', 'ambience', 'ui'].includes(key)) fromSettings(st || G.economy?.settings); });
      fromSettings(G.economy?.settings);
      if (!dirTimer && typeof setInterval !== 'undefined') dirTimer = setInterval(direct, 120);
    }),

    // ---------------------------------------------------------- vehicles
    /**
     * profile: one of ENGINE_PROFILES ('i4','i3turbo','i5','i6','v6','v8','v8sc','v10','v12','w16','flat4','flat6','rotary',
     * 'twin','rally','diesel','bus','electric'). opts: { lite (traffic voice), turbo (bool), supercharged (bool) }
     */
    createEngine: safe((profile, eopts = {}) => {
      const lite = !!(eopts && eopts.lite);
      const name = ENGINE_PROFILES.includes(profile) ? profile : 'i4';
      if (lite && [...core.engines].filter((e) => e.lite).length >= MAX_NPC_VOICES) return dummyEngine(name);
      const i = parked.findIndex((p) => p.v.name === name && p.v.lite === lite && !p.v.dead);
      let v;
      if (i >= 0) { v = parked.splice(i, 1)[0].v; v.turboOpt = eopts.turbo; v.scOpt = eopts.supercharged; v.revive(); }
      else { v = createEngineVoice(core, name, eopts); core.engines.add(v); }
      if (!lite) v.setPerspective(core.interior);
      let alive = true; // a stopped handle never drives a voice that was handed to someone else
      const on = (fn) => safe((...a) => (alive ? fn(...a) : undefined));
      return {
        profile: v.name,
        update: on((p) => v.update(p)),
        setSpatial: on((o) => v.setSpatial(o)),
        setVolume: on((x) => v.setVolume(x)),
        setPerspective: on((x) => v.setPerspective(x)),
        duckFor: on((s) => v.duckFor(s)),
        stop: on(() => {
          alive = false;
          if (parked.length < 4 && v.park()) { parked.push({ v, until: performance.now() + 2500 }); sweepParked(); }
          else v.stop();
        }),
        shift: on((up) => v.shift(!!up)),
        backfire: on(() => v.backfire()),
      };
    }),
    shift: safe((up) => {
      if (core.interior) core.oneShot('gear_shift', { gain: 0.35, rate: 0.95 + Math.random() * 0.1 });
      for (const e of playerEngines()) e.shift(!!up);
    }),
    backfire: safe(() => {
      const list = playerEngines().sort((a, b) => b.touched - a.touched);
      if (list.length && !list[0].P.electric) list[0].backfire();
    }),
    /** engine start (starter crank) for the player's car */
    starter: safe(() => core.oneShot('starter', { gain: 0.5 })),
    /** o: { slip 0..1, speed m/s, surface 'asphalt'|'dirt'|'grass'|'gravel', brake 0..1, wet 0..1 } */
    tires: { update: safe((o) => tiresV.update(o)) },
    wind: { update: safe((s) => windV.update(s)) },
    scrape: safe((a) => scrapeV.set(a)),
    /** kind: one of IMPACT_KINDS ('car','wall','prop','pole','metal','glass','landing','body','splash'); opts {distance, pan} */
    impact: safe((s, kind, o) => impact(core, s, kind, o || {})),
    /** type: 'car'|'truck'|'bus'; opts {id, distance, pan} (default id 'player') */
    horn: safe((on, type, o) => horns.set(on, type, o || {})),
    createSiren: safe(() => {
      const s = new Siren(core);
      core.sirens.add(s);
      return {
        setActive: safe((on) => s.setActive(on)),
        setMode: safe((m) => s.setMode(m)),
        setSpatial: safe((o) => s.setSpatial(o)),
        stop: safe(() => { s.stop(); core.sirens.delete(s); }),
      };
    }),
    cableCarBell: safe((o) => cableCarBell(core, o || {})),
    foghorn: safe((d) => foghorn(core, d)),
    /** recorded traffic pass-by, peak aligned to `delay` s: { delay, side (-1 left..1 right), dmin, rate, gain } */
    passby: safe((o) => passby(core, o || {})),
    ambience: { update: safe((o) => { if (o && o.tunnel !== undefined) core.space(o.tunnel > 0.5 ? 'tunnel' : 'street'); amb.update(o); }) },
    /** acoustic space: { kind: 'street' | 'tunnel' } (ambience.update({ tunnel }) sets it too) */
    setSpace: safe((o = {}) => core.space(o.kind === 'tunnel' ? 'tunnel' : 'street')),
    /** on-foot player: { speed m/s, grounded, surface 'concrete'|'stone'|'wood'|'grass'|'sand', indoor } every frame */
    foot: { update: safe((o) => footV.update(o)) },
    /** render/weather hook, ~1 Hz: { rain 0..1, wind 0..1, storm 0..1, indoors bool } */
    weather: safe((o) => amb.setWeather(o || {})),
    /** a thunder clap heard now from `distance` metres (the caller already delayed it for sound travel) */
    thunder: safe((d) => amb.thunder(d)),
    /** kind: one of UI_KINDS */
    ui: safe((kind) => ui(core, kind)),
    radio,

    // ---------------------------------------------------------- debug / tooling
    stats() {
      const c = core.ctx;
      const eng = [...core.engines];
      return {
        state: c ? c.state : 'none',
        time: c ? c.currentTime : 0,
        engines: eng.length,
        npcEngines: eng.filter((e) => e.lite).length,
        engineSources: eng.reduce((a, e) => a + (e.active ? e.active.size : 0), 0),
        parkedEngines: parked.length,
        sirens: core.sirens.size,
        fxShots: c ? core.fxPool.active : 0,
        uiShots: c ? core.uiPool.active : 0,
        ambShots: c ? core.ambPool.active : 0,
        ambience: amb.stats(),
        pops: core.activePops,
        radio: radio.isOn(),
        assets: core.assets ? core.assets.stats() : null,
        limiterReduction: core.meters ? +core.meters.lim.reduction.toFixed?.(2) || 0 : 0,
        glueReduction: core.meters ? +core.meters.glue.reduction.toFixed?.(2) || 0 : 0,
      };
    },
    /** AnalyserNode tapped from the final output (created on demand) */
    analyser() {
      if (!core.ctx) return null;
      if (!core.an) { core.an = core.ctx.createAnalyser(); core.an.fftSize = 2048; core.out.connect(core.an); }
      return core.an;
    },
  };

  for (const k of ['setOn', 'next', 'prev', 'setStation', 'setStationById', 'nextStation', 'prevStation']) radio[k] = safe(radio[k]);
  return audio;
}
