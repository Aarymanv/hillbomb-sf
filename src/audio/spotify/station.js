// The Spotify radio station: implements the external-station contract of G.audio.radio
// ({ id, name, genre, onSelect, onDeselect, next, prev, setVolume, setPaused, nowPlaying }) plus the controls the
// Spotify panel needs (setSource, loadPlaylists, disconnect, gesture, snapshot, subscribe).
// Modes: 'sdk' = Web Playback SDK device inside the game (Premium); 'remote' = now-playing of the user's other
// device via GET /me/player/currently-playing (free accounts, or browsers without EME/DRM).
// No method throws: every async path is caught and turned into a status message.
import { createSdkDevice, createRemotePoller } from './player.js';
import { safeStore } from './auth.js';

export const SOURCE_KEY = 'hillbomb.spotify.source.v1';
export const MSG = {
  notConnected: 'Not connected - press O to connect',
  premium: 'Spotify Premium is required to play music inside the game',
  autoplay: 'Click or press any key to start Spotify',
};

class UserFacing extends Error { constructor(m) { super(m); this.userFacing = true; } }
const isAuthErr = e => e && e.name === 'AuthError';
const isApiErr = e => e && e.name === 'ApiError';

export function pickImage(images, want = 100) {
  if (!Array.isArray(images) || !images.length) return null;
  const withW = images.filter(i => i && i.url).sort((a, b) => (a.width || 0) - (b.width || 0));
  const hit = withW.find(i => (i.width || 0) >= want) || withW[withW.length - 1];
  return hit?.url || null;
}

export function normalizeSource(src) {
  if (src && src.type === 'playlist' && typeof src.id === 'string' && src.id) {
    return { type: 'playlist', id: src.id, name: String(src.name || 'Playlist'), uri: src.uri || `spotify:playlist:${src.id}`, total: Number.isFinite(src.total) ? src.total : null };
  }
  if (src && src.type === 'liked') return { type: 'liked' };
  return { type: 'queue' };
}

export function createSpotifyStation({
  auth, api,
  createDevice = createSdkDevice,
  createRemote = createRemotePoller,
  local = () => globalThis.localStorage,
  now = () => Date.now(),
  rand = Math.random,
  timers = globalThis,
  hidden,
  playerName = 'HILLBOMB Radio',
} = {}) {
  const store = safeStore(local);
  const S = {
    selected: false, menuPaused: false, resumeAfterMenu: false, pendingStart: false,
    status: auth.isConnected() ? 'idle' : 'disconnected', // disconnected|connecting|idle|loading|ready|remote|error
    mode: null, user: null, errorMsg: '',
    nonPremium: false, sdkFailed: false, sdkError: '',
    deviceId: null, activeHere: false, startedOnce: false, autoplayBlocked: false, activated: false, offline: false,
    track: null, paused: true, positionMs: 0, at: 0,
    volume: 0.5,
    source: normalizeSource(store.get(SOURCE_KEY)),
    playlists: null,
    flash: '', flashUntil: 0,
  };
  const subs = new Set();
  const pending = new Set();
  let device = null, deviceP = null, sessionP = null, activeP = null, playlistsP = null, gen = 0;

  const remote = createRemote({
    api, timers, ...(hidden ? { hidden } : {}),
    onData: onRemoteData,
    onError: e => handleError(e, 'Spotify'),
  });

  // ------------------------------------------------------------------ plumbing
  function emit(kind) { for (const fn of subs) { try { fn(kind); } catch (e) { console.warn('[spotify] listener threw', e); } } }
  function setStatus(st, msg) { const changed = st !== S.status || (msg ?? '') !== S.errorMsg; S.status = st; S.errorMsg = msg || ''; if (changed) emit('status'); }
  function flash(text, ms = 5000) { S.flash = text; S.flashUntil = now() + ms; emit('status'); }
  function run(fn) {
    const p = Promise.resolve().then(fn).catch(e => handleError(e, 'Spotify'));
    pending.add(p); p.finally(() => pending.delete(p));
    return p;
  }
  const sleep = ms => new Promise(r => timers.setTimeout(r, ms));
  const trackKey = () => (S.track ? S.track.id + '|' + S.track.title : '');

  function handleError(e, ctx) {
    if (isAuthErr(e)) {
      if (['not_connected', 'invalid_grant', 'invalid_client'].includes(e.code)) { teardown(); setStatus('disconnected'); return; }
      flash(e.message);
      return;
    }
    if (isApiErr(e)) {
      if (e.status === 403 && (e.reason === 'PREMIUM_REQUIRED' || /premium/i.test(e.message))) { flash(MSG.premium); return; }
      if (e.status === 429 || e.status === 0) { flash(e.message); return; }
      if (e.status === 404 && /device/i.test(e.message)) { flash('No active Spotify device found'); return; }
      console.warn('[spotify]', ctx, e);
      flash(`${ctx}: ${e.message}`);
      return;
    }
    if (e && e.userFacing) { flash(e.message, 7000); return; }
    console.warn('[spotify]', ctx, e);
    flash(ctx + (e?.message ? ': ' + e.message : ''));
  }

  function teardown() {
    gen++;
    try { device?.disconnect(); } catch { /* gone */ }
    device = null; deviceP = null;
    remote.stop();
    Object.assign(S, {
      mode: null, user: null, nonPremium: false, sdkFailed: false, sdkError: '', deviceId: null, activeHere: false,
      startedOnce: false, autoplayBlocked: false, activated: false, offline: false, track: null, paused: true,
      playlists: null, pendingStart: false, resumeAfterMenu: false,
    });
    emit('track');
  }

  // ------------------------------------------------------------------ session + devices
  function ensureSession() {
    if (!auth.isConnected()) { setStatus('disconnected'); return Promise.resolve(false); }
    if (S.user) return Promise.resolve(true);
    if (sessionP) return sessionP;
    const g = gen;
    setStatus('connecting');
    sessionP = api.me().then(me => {
      if (g !== gen) return false;
      // GET /me `product` is deprecated (missing for development-mode apps since 2026): unknown -> try the SDK,
      // its account_error tells us when the account is not Premium.
      S.user = { id: me?.id || '', name: me?.display_name || me?.id || 'Spotify user', product: me?.product ?? null, image: pickImage(me?.images, 64) };
      if (S.user.product && S.user.product !== 'premium') S.nonPremium = true;
      setStatus('idle');
      return true;
    }, e => {
      if (g !== gen) return false;
      handleError(e, 'Could not reach Spotify');
      if (auth.isConnected()) setStatus('error', 'Could not reach Spotify. Press T to retry.');
      return false;
    }).finally(() => { sessionP = null; });
    return sessionP;
  }

  function useRemote() { return S.nonPremium || S.sdkFailed; }
  function enterRemote() {
    S.mode = 'remote';
    setStatus('remote');
    if (S.selected) remote.start();
  }

  function ensureDevice() {
    if (S.deviceId && device) return Promise.resolve(S.deviceId);
    if (deviceP) return deviceP;
    const g = gen;
    setStatus('loading');
    deviceP = (async () => {
      let dev = null;
      try {
        dev = await createDevice({
          getToken: () => auth.getAccessToken(), name: playerName, volume: S.volume,
          onState: st => { if (g === gen) onSdkState(st); },
          onReady: id => { if (g === gen) { S.deviceId = id; S.offline = false; emit('status'); } },
          onNotReady: () => { if (g === gen) { S.offline = true; emit('status'); } },
          onError: (kind, msg) => { if (g === gen) onSdkError(kind, msg); },
          onAutoplayFailed: () => { if (g === gen) { S.autoplayBlocked = true; emit('status'); } },
        });
        if (g !== gen) { dev.disconnect(); return null; }
        device = dev;
        const id = await dev.ready;
        if (g !== gen) { dev.disconnect(); return null; }
        S.deviceId = id; S.mode = 'sdk';
        setStatus('ready');
        return id;
      } catch (e) {
        try { dev?.disconnect(); } catch { /* gone */ }
        if (g !== gen) return null;
        device = null; deviceP = null;
        onDeviceFailure(e);
        return null;
      }
    })();
    return deviceP;
  }

  function onDeviceFailure(e) {
    const kind = e?.kind;
    if (kind === 'account') { S.nonPremium = true; }
    else if (kind === 'auth') { setStatus('error', 'Spotify rejected the in-game player login. Disconnect and connect again.'); return; }
    else if (isAuthErr(e)) { handleError(e, 'Spotify'); return; }
    else {
      S.sdkFailed = true;
      S.sdkError = kind === 'init'
        ? "This browser can't play Spotify inside the game (it needs DRM/EME: desktop Chrome, Edge or Firefox). Showing your other device."
        : (e?.message || 'The in-game Spotify player failed') + '. Showing your other device.';
    }
    enterRemote();
  }

  function onSdkError(kind, msg) {
    if (kind === 'account') { S.nonPremium = true; try { device?.disconnect(); } catch { /* gone */ } device = null; deviceP = null; S.deviceId = null; enterRemote(); return; }
    if (kind === 'playback') { flash("Spotify couldn't play that track"); return; }
    if (kind === 'auth') { flash('Spotify login for the in-game player failed: ' + (msg || 'token rejected')); return; }
  }

  function onSdkState(st) {
    const before = trackKey(), wasActive = S.activeHere, wasPaused = S.paused;
    if (!st) { // playback moved to another device (or stopped)
      S.activeHere = false; S.paused = true;
      if (wasActive) emit('track');
      return;
    }
    S.activeHere = true;
    const cur = st.track_window?.current_track;
    S.track = cur ? {
      id: cur.id || cur.uri || cur.name, title: cur.name || '', artist: (cur.artists || []).map(a => a.name).join(', '),
      album: cur.album?.name || '', art: pickImage(cur.album?.images), durationMs: st.duration || cur.duration_ms || 0,
    } : null;
    S.paused = !!st.paused; S.positionMs = st.position || 0; S.at = now();
    if (!S.paused) S.autoplayBlocked = false;
    emit(trackKey() !== before || !wasActive || wasPaused !== S.paused ? 'track' : 'state');
  }

  function onRemoteData(d) {
    const before = trackKey(), wasPaused = S.paused;
    const it = d && d.item;
    if (!it) { S.track = null; S.paused = true; }
    else {
      const ep = it.type === 'episode';
      S.track = {
        id: it.id || it.uri || it.name, title: it.name || '',
        artist: ep ? (it.show?.name || '') : (it.artists || []).map(a => a.name).join(', '),
        album: ep ? '' : (it.album?.name || ''), art: pickImage(ep ? (it.images || it.show?.images) : it.album?.images),
        durationMs: it.duration_ms || 0,
      };
      S.paused = !d.is_playing; S.positionMs = d.progress_ms || 0; S.at = now();
    }
    emit(trackKey() !== before || wasPaused !== S.paused ? 'track' : 'state');
  }

  // ------------------------------------------------------------------ playback
  async function transferHere(id, play) {
    try { await api.transfer(id, play); }
    catch (e) { if (isApiErr(e) && e.status === 404) { await sleep(1000); await api.transfer(id, play); } else throw e; }
  }
  function shuffled(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function playLiked(id) {
    const first = await api.savedTracks(50, 0);
    let items = first?.items || [];
    const total = Number(first?.total) || items.length;
    if (total > 50) {
      const off = Math.floor(rand() * (total - 50 + 1));
      if (off > 0) { try { const pg = await api.savedTracks(50, off); if (pg?.items?.length) items = pg.items; } catch { /* first page is fine */ } }
    }
    const uris = shuffled(items.map(i => (i?.track || i?.item)?.uri).filter(u => typeof u === 'string' && u.startsWith('spotify:track:')));
    if (!uris.length) throw new UserFacing('Your Liked Songs is empty. Press O to pick a playlist.');
    await api.play(id, { uris });
  }

  async function playPlaylist(id, src) {
    try { await api.shuffle(true, id); } catch { /* optional */ }
    const body = { context_uri: src.uri };
    if (src.total > 1) body.offset = { position: Math.floor(rand() * src.total) };
    try { await api.play(id, body); }
    catch (e) {
      if (body.offset && isApiErr(e) && (e.status === 400 || e.status === 404)) await api.play(id, { context_uri: src.uri });
      else throw e;
    }
  }

  async function startSource() {
    const id = S.deviceId;
    if (!id || !device) return;
    S.startedOnce = true; S.pendingStart = false;
    const src = S.source;
    try {
      await transferHere(id, false);
      if (src.type === 'liked') await playLiked(id);
      else if (src.type === 'playlist') await playPlaylist(id, src);
      else {
        try { await api.play(id); } // resume the user's current context/queue on this device
        catch (e) { if (isApiErr(e) && [400, 403, 404].includes(e.status) && e.reason !== 'PREMIUM_REQUIRED') await playLiked(id); else throw e; }
      }
    } catch (e) { handleError(e, 'Could not start playback'); }
  }

  async function playHere() {
    if (!S.deviceId || !device) return;
    if (!S.startedOnce || S.pendingStart) return startSource();
    if (!S.activeHere) { try { await transferHere(S.deviceId, true); } catch (e) { handleError(e, 'Could not bring playback here'); } return; }
    await device.resume();
  }

  async function activate() {
    if (!S.selected) return;
    if (!(await ensureSession()) || !S.selected) return;
    if (useRemote()) { enterRemote(); return; }
    const id = await ensureDevice();
    if (!id) return; // failure already handled (remote mode or error status)
    if (!S.selected) return;
    if (S.menuPaused) { S.resumeAfterMenu = true; return; }
    await playHere();
  }
  function activateOnce() { if (!activeP) activeP = run(activate).finally(() => { activeP = null; }); return activeP; }

  async function skip(dir) {
    if (!auth.isConnected()) { flash(MSG.notConnected); return; }
    if (S.status === 'error' || !S.user) return activateOnce();
    if (S.mode === 'sdk' && device) {
      if (!S.activeHere || !S.startedOnce || S.pendingStart) return playHere();
      return dir > 0 ? device.next() : device.prev();
    }
    if (S.mode === 'remote') {
      const what = dir > 0 ? 'skip tracks' : 'go back a track';
      try { await (dir > 0 ? api.next() : api.previous()); remote.kick(); }
      catch (e) {
        if (isApiErr(e) && e.status === 403) flash(`Spotify Premium is required to ${what}`);
        else if (isApiErr(e) && e.status === 404) flash('No active Spotify device: start playing on your phone or computer first');
        else handleError(e, `Could not ${what}`);
      }
    }
  }

  // ------------------------------------------------------------------ derived views
  function sourceLabel() {
    const s = S.source;
    return s.type === 'liked' ? 'Liked Songs' : s.type === 'playlist' ? s.name : 'Your library';
  }
  function message() {
    if (S.flash && now() < S.flashUntil) return S.flash;
    switch (S.status) {
      case 'disconnected': return auth.message ? `${auth.message} Press O to connect.` : MSG.notConnected;
      case 'connecting': return 'Connecting to Spotify...';
      case 'loading': return 'Starting the in-game Spotify player...';
      case 'error': return S.errorMsg || 'Spotify error';
    }
    if (S.mode === 'remote') {
      if (S.nonPremium) return S.track ? 'On your other device (Premium needed to play in game)' : MSG.premium;
      if (S.sdkError) return S.sdkError;
      return S.track ? 'On your other device' : 'Nothing playing on your Spotify right now';
    }
    if (S.mode === 'sdk') {
      if (S.autoplayBlocked) return MSG.autoplay;
      if (S.offline) return 'Spotify player offline, reconnecting...';
      if (S.startedOnce && !S.activeHere) return 'Playing on another device - press T to bring it here';
      if (!S.track) return S.selected ? 'Starting playback...' : 'Ready';
      if (S.paused) return 'Paused';
    }
    return '';
  }

  function nowPlaying() {
    const msg = message();
    const t = S.track;
    if (!t) return { title: null, artist: null, album: null, art: null, positionMs: 0, durationMs: 0, paused: true, message: msg || 'Nothing playing' };
    let pos = S.positionMs + (S.paused ? 0 : Math.max(0, now() - S.at));
    if (t.durationMs) pos = Math.min(pos, t.durationMs);
    return { title: t.title, artist: t.artist, album: t.album, art: t.art, positionMs: pos, durationMs: t.durationMs, paused: S.paused, message: msg };
  }

  // ------------------------------------------------------------------ the station object
  const station = {
    id: 'spotify',
    name: 'Spotify',
    get genre() {
      switch (S.status) {
        case 'disconnected': return 'Not connected';
        case 'connecting': case 'loading': return 'Connecting';
        case 'error': return 'Error';
      }
      if (S.mode === 'remote') return S.nonPremium ? 'Premium required' : 'Other device';
      return sourceLabel();
    },

    onSelect() { S.selected = true; emit('status'); activateOnce(); },
    onDeselect() {
      S.selected = false; S.resumeAfterMenu = false;
      remote.stop();
      if (device && S.activeHere && !S.paused) device.pause();
      emit('status');
    },
    next() { run(() => skip(1)); },
    prev() { run(() => skip(-1)); },
    setVolume(v) {
      v = Number(v);
      if (!Number.isFinite(v)) return;
      S.volume = Math.min(1, Math.max(0, v));
      if (S.mode === 'sdk' && device) device.setVolume(S.volume); // ignored in remote mode
    },
    setPaused(p) {
      p = !!p;
      if (p === S.menuPaused) return;
      S.menuPaused = p;
      if (S.mode !== 'sdk' || !device) return;
      if (p) { if (S.selected && S.activeHere && !S.paused) { S.resumeAfterMenu = true; device.pause(); } }
      else if (S.resumeAfterMenu) { S.resumeAfterMenu = false; if (S.selected) run(playHere); }
    },
    nowPlaying,

    // -------------------------------------------------------------- controls for the panel / sys_spotify
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** call synchronously from a user gesture (click / keydown): unlocks audio under browser autoplay rules */
    gesture() {
      if (!device) return;
      if (!S.activated) { S.activated = true; device.activate(); }
      if (S.autoplayBlocked) { S.autoplayBlocked = false; if (S.selected && !S.menuPaused) device.resume(); emit('status'); }
    },
    /** auth state changed (connected after the redirect, or tokens cleared by invalid_grant / disconnect) */
    authChanged() {
      if (!auth.isConnected()) { if (S.status !== 'disconnected' || S.user || device) { teardown(); } setStatus('disconnected'); return; }
      if (S.status === 'disconnected' || S.status === 'error' || (S.status === 'connecting' && !sessionP)) setStatus('idle');
      if (S.selected && !S.user) activateOnce();
    },
    setConnecting() { if (S.status === 'disconnected') setStatus('connecting'); },
    ensureSession: () => run(ensureSession),
    setSource(src) {
      S.source = normalizeSource(src);
      store.set(SOURCE_KEY, S.source);
      emit('status');
      if (S.mode === 'sdk' && device && S.deviceId) {
        if (S.selected && !S.menuPaused) run(startSource);
        else { S.pendingStart = true; if (S.selected) S.resumeAfterMenu = true; }
      } else S.startedOnce = false;
    },
    get source() { return { ...S.source }; },
    loadPlaylists(force = false) {
      if (!auth.isConnected()) return Promise.resolve([]);
      if (S.playlists && !force) return Promise.resolve(S.playlists);
      if (playlistsP) return playlistsP;
      playlistsP = (async () => {
        try {
          const all = [];
          for (let page = 0, off = 0; page < 4; page++, off += 50) {
            const r = await api.playlists(50, off);
            const items = r?.items || [];
            for (const p of items) {
              if (!p || !p.id) continue;
              const total = p.items?.total ?? p.tracks?.total; // 2026 API renamed tracks -> items
              all.push({ id: p.id, name: p.name || 'Untitled playlist', uri: p.uri || `spotify:playlist:${p.id}`, total: Number.isFinite(total) ? total : null, image: pickImage(p.images, 64), owner: p.owner?.display_name || '' });
            }
            if (!r?.next || items.length < 50) break;
          }
          S.playlists = all;
          emit('status');
          return all;
        } catch (e) { handleError(e, 'Could not load playlists'); return []; }
        finally { playlistsP = null; }
      })();
      return playlistsP;
    },
    disconnect() { teardown(); auth.disconnect(); setStatus('disconnected'); },
    snapshot() {
      return {
        status: S.status, mode: S.mode, connected: auth.isConnected(), selected: S.selected,
        user: S.user ? { ...S.user } : null,
        premium: S.nonPremium ? false : S.user?.product === 'premium' ? true : S.mode === 'sdk' && S.deviceId ? true : null,
        message: message(), deviceId: S.deviceId, activeHere: S.activeHere,
        source: { ...S.source }, sourceLabel: sourceLabel(), genre: station.genre,
        playlists: S.playlists ? S.playlists.map(p => ({ ...p })) : null,
        volume: S.volume, menuPaused: S.menuPaused, nowPlaying: nowPlaying(),
      };
    },
    /** tests: wait until queued async work has settled */
    async _settle() { for (let i = 0; i < 50 && pending.size; i++) await Promise.allSettled([...pending]); },
  };
  return station;
}
