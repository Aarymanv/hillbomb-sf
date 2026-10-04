// Browser bench for the Spotify station: a mock game object (G) with a mock radio implementing the external-station
// contract, then the real sys_spotify install(). Nothing here signs in: "dry run" shows the authorize URL only.
import { install } from '../src/game/sys_spotify.js';
import { challengeFor } from '../src/audio/spotify/pkce.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = (...a) => { logEl.textContent = `${new Date().toLocaleTimeString()}  ${a.join(' ')}\n` + logEl.textContent.slice(0, 6000); };

// ------------------------------------------------------------------ mock radio (G.audio.radio contract)
function createMockRadio() {
  const builtins = [
    { id: 'kbmb', name: 'KBMB Lo-Fi', genre: 'lo-fi', tracks: [['Fog City', 'Karl & The Mist'], ['Hyde St Crawl', 'Cable Grip']] },
    { id: 'synth', name: 'Night Drive FM', genre: 'synthwave', tracks: [['Neon Embarcadero', 'Bay Lights'], ['Twin Peaks Run', 'Sutro']] },
  ];
  const ext = [];
  const subs = new Set();
  let on = false, index = 0, vol = 0.6, paused = false, t0 = performance.now();
  const list = () => [...builtins.map(b => ({ id: b.id, name: b.name, genre: b.genre, external: false, b })), ...ext.map(s => ({ id: s.id, name: s.name, genre: s.genre, external: true, st: s }))];
  const cur = () => list()[index] || list()[0];
  const emit = () => { const c = radio.current(); for (const fn of subs) fn(c); };
  function tuneTo(i) {
    const L = list(), prev = cur();
    index = ((i % L.length) + L.length) % L.length;
    t0 = performance.now();
    const c = cur();
    if (on && prev !== c) { if (prev.external) prev.st.onDeselect(); if (c.external) c.st.onSelect(); }
    log('radio: tuned to', c.name);
    emit();
  }
  const radio = {
    registerExternal(st) {
      ext.push(st);
      st.setVolume(vol); st.setPaused(paused);
      log('radio: registered external station', st.id);
      emit();
      return { unregister() { const i = ext.indexOf(st); if (i >= 0) ext.splice(i, 1); emit(); }, notify: emit };
    },
    current() {
      const c = cur();
      if (c.external) {
        const np = c.st.nowPlaying() || {};
        return { index, id: c.id, name: c.name, genre: c.st.genre, title: np.title, artist: np.artist, art: np.art, positionMs: np.positionMs, durationMs: np.durationMs, external: true };
      }
      const dur = 150000, el = performance.now() - t0, k = Math.floor(el / dur) % c.b.tracks.length, [title, artist] = c.b.tracks[k];
      return { index, id: c.id, name: c.name, genre: c.genre, title, artist, art: null, positionMs: el % dur, durationMs: dur, external: false, track: `${artist} - ${title}` };
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    stationList: () => list().map((s, i) => ({ index: i, id: s.id, name: s.name, genre: s.external ? s.st.genre : s.genre, external: s.external })),
    setStationById(id) { const i = list().findIndex(s => s.id === id); if (i >= 0) tuneTo(i); },
    isOn: () => on,
    setOn(v) { v = !!v; if (v === on) return; on = v; const c = cur(); if (c.external) (on ? c.st.onSelect() : c.st.onDeselect()); log('radio:', on ? 'on' : 'off'); emit(); },
    next() { const c = cur(); if (on && c.external) c.st.next(); else tuneTo(index + 1); },
    prev() { const c = cur(); if (on && c.external) c.st.prev(); else tuneTo(index - 1); },
    nextStation: () => tuneTo(index + 1),
    prevStation: () => tuneTo(index - 1),
    setVolume(v) { vol = v; for (const s of ext) s.setVolume(v); },
    setPaused(p) { paused = p; for (const s of ext) s.setPaused(p); },
  };
  return radio;
}

// ------------------------------------------------------------------ ?mock: a fake, already-connected FREE account
// Spotify hosts are answered by a local stub and the hillbomb.spotify.* storage keys live in memory, so this never
// touches the network or the real game's saved Spotify settings (same origin).
const MOCK = new URLSearchParams(location.search).has('mock');
if (MOCK) {
  const mem = new Map();
  const ours = k => typeof k === 'string' && k.startsWith('hillbomb.spotify.');
  const P = Storage.prototype, gi = P.getItem, si = P.setItem, ri = P.removeItem;
  P.getItem = function (k) { return ours(k) ? (mem.has(this === sessionStorage ? 's:' + k : k) ? mem.get(this === sessionStorage ? 's:' + k : k) : null) : gi.call(this, k); };
  P.setItem = function (k, v) { if (ours(k)) mem.set(this === sessionStorage ? 's:' + k : k, String(v)); else si.call(this, k, v); };
  P.removeItem = function (k) { if (ours(k)) mem.delete(this === sessionStorage ? 's:' + k : k); else ri.call(this, k); };
  mem.set('hillbomb.spotify.tokens.v1', JSON.stringify({ access_token: 'MOCK', refresh_token: 'MOCK_R', expires_at: Date.now() + 3600e3, scope: '', client_id: 'mock' }));
  const t0 = Date.now();
  const J = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), location.href);
    if (!/(^|\.)spotify\.com$/.test(u.hostname)) return realFetch(url, init);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    log('mock fetch:', key + u.search);
    if (key === 'GET /v1/me') return J(200, { id: 'bench', display_name: 'Bench Driver', product: 'free' });
    if (key === 'GET /v1/me/playlists') return J(200, { items: [
      { id: 'p1', name: 'Hill Bombing', uri: 'spotify:playlist:p1', items: { total: 42 }, images: [], owner: { display_name: 'Bench Driver' } },
      { id: 'p2', name: '<img src=x onerror=alert(1)> escaping test', uri: 'spotify:playlist:p2', tracks: { total: 7 }, images: [], owner: { display_name: 'someone' } },
      { id: 'p3', name: 'A very long playlist name that should be truncated with an ellipsis in the tile', uri: 'spotify:playlist:p3', items: { total: 1200 }, images: [] },
    ], next: null });
    if (key === 'GET /v1/me/player/currently-playing') return J(200, { is_playing: true, progress_ms: (Date.now() - t0) % 180000, item: { type: 'track', id: 'm1', name: 'Mock Track On Your Phone', artists: [{ name: 'Bench Band' }], album: { name: 'Mock', images: [] }, duration_ms: 180000 } });
    if (key === 'POST /v1/me/player/next' || key === 'POST /v1/me/player/previous') return J(403, { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } });
    return J(404, { error: { status: 404, message: 'mock: no route ' + key } });
  };
}

// ------------------------------------------------------------------ mock game
const radio = createMockRadio();
const listeners = {};
const G = {
  state: 'play',
  input: { wantPointerLock: false },
  systems: [],
  player: { vehicle: {} },
  on(ev, fn) { (listeners[ev] ||= []).push(fn); },
  emit(ev, ...a) { for (const fn of listeners[ev] || []) fn(...a); },
  hud: { toast: (t, s) => log('toast:', t, s ? '- ' + s : '') },
  audio: { radio, ui: () => {} },
  economy: { save: () => log('economy.save()') },
};
window.__G = G;
install(G);
G.spotify.dryRun = true;

// systems tick at 10 Hz (no rAF: keeps the bench cheap)
setInterval(() => { for (const s of G.systems) s.update?.(0.1); }, 100);
setInterval(() => { $('state').textContent = JSON.stringify(G.spotify.state, null, 2); }, 500);

// ------------------------------------------------------------------ controls
$('on').onclick = () => radio.setOn(!radio.isOn());
$('toSpotify').onclick = () => { radio.setStationById('spotify'); radio.setOn(true); };
$('nextSt').onclick = () => radio.nextStation();
$('prevSt').onclick = () => radio.prevStation();
$('nextTr').onclick = () => radio.next();
$('prevTr').onclick = () => radio.prev();
$('menus').onchange = e => { radio.setPaused(e.target.checked); log('menus', e.target.checked ? 'open (setPaused true)' : 'closed (setPaused false)'); };
$('vol').oninput = e => { const v = Number(e.target.value); $('volv').textContent = v.toFixed(2); radio.setVolume(v); };
$('foot').onchange = e => { G.player.vehicle = e.target.checked ? null : {}; };
$('panel').onclick = () => G.spotify.openPanel();
$('dry').onchange = e => { G.spotify.dryRun = e.target.checked; };
$('slot').onclick = () => { $('fakehud').style.display = 'block'; G.ui = { slots: { radio: $('fakehud').querySelector('.slot') } }; log('G.ui.slots.radio added (widget moves within ~1 s)'); };
$('authurl').onclick = async () => {
  const url = await G.spotify.connect({ dryRun: true });
  if (!url) { $('url').textContent = '(no URL: ' + (G.spotify.state.message || 'set a 32-char Client ID in the panel first') + ')'; return; }
  const u = new URL(url);
  $('url').textContent = url + '\n\n' + [...u.searchParams].map(([k, v]) => `${k.padEnd(22)} ${v}`).join('\n');
  log('authorize URL built (not opened)');
};
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || G.spotify.state.panelOpen) return;
  if (e.code === 'KeyT') e.shiftKey ? radio.nextStation() : radio.next();
  if (e.code === 'KeyY') e.shiftKey ? radio.prevStation() : radio.prev();
});

// ------------------------------------------------------------------ in-browser PKCE check (RFC 7636 Appendix B)
challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk').then(c => {
  const ok = c === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  $('pkce').innerHTML = ok ? '<span class="pass">PASS</span> (RFC 7636 vector)' : `<span class="fail">FAIL</span> ${c}`;
}, e => { $('pkce').innerHTML = `<span class="fail">FAIL</span> ${e.message}`; });
log('bench ready. Radio stations:', radio.stationList().map(s => s.name).join(', '));
