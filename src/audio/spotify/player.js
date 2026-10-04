// Spotify Web Playback SDK (in-game device, Premium only) + the remote fallback (now-playing of the user's other
// device via the Web API; works on free accounts; control there needs Premium on Spotify's side).
// The SDK script is injected lazily, only after the user connected and the Spotify station is tuned.
export const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
let sdkPromise = null;

/** Load the SDK once. window.onSpotifyWebPlaybackSDKReady is defined BEFORE the script is injected. */
export function loadSdk({ win = globalThis.window, doc = globalThis.document, timeoutMs = 20000 } = {}) {
  if (win?.Spotify?.Player) return Promise.resolve(win.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const fail = (msg) => { clearTimeout(timer); sdkPromise = null; reject(Object.assign(new Error(msg), { kind: 'load' })); };
    const timer = setTimeout(() => fail('The Spotify player took too long to load'), timeoutMs);
    const prev = win.onSpotifyWebPlaybackSDKReady;
    win.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer);
      try { if (typeof prev === 'function') prev(); } catch { /* someone else's hook */ }
      if (win.Spotify?.Player) resolve(win.Spotify); else fail('The Spotify player loaded without its API');
    };
    const s = doc.createElement('script');
    s.src = SDK_URL; s.async = true;
    s.onerror = () => { s.remove(); fail('Could not load the Spotify player (offline, or blocked by a content blocker)'); };
    doc.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Create + connect an SDK player named `name`. Returns a device handle immediately after connect();
 * `device.ready` resolves with the device_id, or rejects with an Error whose .kind is
 * 'load' | 'init' (no EME/DRM, unsupported browser) | 'auth' | 'account' (not Premium) | 'timeout'.
 * Errors after ready go to onError(kind, message).
 */
export async function createSdkDevice({
  getToken, name = 'HILLBOMB Radio', volume = 0.5,
  onState, onReady, onNotReady, onError, onAutoplayFailed, loader = loadSdk, readyTimeoutMs = 25000,
}) {
  const Spotify = await loader();
  let isReady = false, resolveReady, rejectReady, lastVol = -1, timer = null;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {});
  const player = new Spotify.Player({
    name, volume: clamp01(volume),
    getOAuthToken: cb => { Promise.resolve().then(getToken).then(t => cb(t), e => fail('auth', e?.message || 'No Spotify token')); },
  });
  function fail(kind, message) {
    if (!isReady) { clearTimeout(timer); rejectReady(Object.assign(new Error(message || kind), { kind })); }
    else { try { onError?.(kind, message || kind); } catch { /* listener */ } }
  }
  timer = setTimeout(() => fail('timeout', 'The Spotify player did not come online'), readyTimeoutMs);
  const on = (ev, fn) => player.addListener(ev, (...a) => { try { fn(...a); } catch (e) { console.warn('[spotify] ' + ev, e); } });
  on('ready', ({ device_id }) => { clearTimeout(timer); isReady = true; resolveReady(device_id); onReady?.(device_id); });
  on('not_ready', ({ device_id }) => onNotReady?.(device_id));
  on('player_state_changed', st => onState?.(st));
  on('initialization_error', ({ message }) => fail('init', message));
  on('authentication_error', ({ message }) => fail('auth', message));
  on('account_error', ({ message }) => fail('account', message));
  on('playback_error', ({ message }) => { if (isReady) onError?.('playback', message); });
  on('autoplay_failed', () => onAutoplayFailed?.());
  let ok = false;
  try { ok = await player.connect(); } catch (e) { fail('init', e?.message); }
  if (!ok) fail('init', 'The Spotify player could not start in this browser');

  const quiet = p => { try { const r = p(); return r && typeof r.catch === 'function' ? r.catch(() => {}) : Promise.resolve(); } catch { return Promise.resolve(); } };
  return {
    player, ready,
    /** Call synchronously inside a user gesture (click/keydown): unlocks audio under autoplay rules. */
    activate() { try { const r = player.activateElement?.(); r?.catch?.(() => {}); } catch { /* old SDK */ } },
    setVolume(v) { v = clamp01(v); if (Math.abs(v - lastVol) < 0.005) return; lastVol = v; quiet(() => player.setVolume(v)); },
    pause: () => quiet(() => player.pause()),
    resume: () => quiet(() => player.resume()),
    next: () => quiet(() => player.nextTrack()),
    prev: () => quiet(() => player.previousTrack()),
    getState: () => player.getCurrentState?.().catch?.(() => null) ?? Promise.resolve(null),
    disconnect() { clearTimeout(timer); try { player.disconnect(); } catch { /* gone */ } },
  };
}

/**
 * Remote mode: poll GET /me/player/currently-playing while the station is tuned (5 s, 15 s when the tab is hidden,
 * backing off on errors). onData(json|null) gets each result; onError(err) each failure.
 */
export function createRemotePoller({ api, onData, onError, hidden = () => globalThis.document?.hidden, timers = globalThis, intervalMs = 5000, hiddenMs = 15000 }) {
  let timer = null, running = false, fails = 0, busy = false;
  async function tick() {
    timer = null;
    if (!running || busy) return;
    busy = true;
    try { onData?.(await api.currentlyPlaying()); fails = 0; }
    catch (e) { fails++; try { onError?.(e); } catch { /* listener */ } }
    busy = false;
    if (running) schedule();
  }
  function schedule(ms) {
    if (timer) timers.clearTimeout(timer);
    const base = hidden() ? hiddenMs : intervalMs;
    timer = timers.setTimeout(tick, ms ?? Math.min(60000, base * 2 ** Math.min(fails, 4)));
  }
  return {
    start() { if (running) return; running = true; fails = 0; schedule(0); },
    stop() { running = false; if (timer) timers.clearTimeout(timer); timer = null; },
    /** poll soon (e.g. right after a skip) */
    kick(ms = 700) { if (running) schedule(ms); },
    get running() { return running; },
  };
}

function clamp01(v) { v = Number(v); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5; }
