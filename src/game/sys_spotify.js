// Spotify on the in-game radio: connect panel (PKCE login on Spotify's own page), a "Spotify" station registered
// with G.audio.radio, and a small now-playing card. Exposes G.spotify = { openPanel, closePanel, connect,
// disconnect, state, station }. Nothing talks to Spotify until the user connects (except refreshing saved tokens).
// Never throws into the game loop; never blocks startup.
import { injectTheme, makeNav } from '../ui/theme.js';
import { createAuth, captureCallback, redirectUriFor, CLIENT_ID_RE } from '../audio/spotify/auth.js';
import { createApi } from '../audio/spotify/api.js';
import { createSpotifyStation } from '../audio/spotify/station.js';

// Runs at import time. main.js's eager sys_* glob is hoisted to static imports, so this executes BEFORE main.js
// reads location.search: an OAuth return (?code&state) is swapped back to the pre-login URL (?play etc.) here,
// and the code/state stay in memory for the token exchange in install().
const EARLY = (() => {
  try {
    if (typeof location === 'undefined' || typeof history === 'undefined') return null;
    return captureCallback({ href: location.href, session: () => sessionStorage, replaceState: url => history.replaceState(history.state, '', url) });
  } catch { return null; }
})();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isTyping = t => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export function install(G) {
  try { setup(G); } catch (e) { console.error('[spotify] setup failed', e); }
}

function setup(G) {
  injectTheme();
  injectCss();
  let station = null, panel = null, handle = null, regTries = 0, autoSelect = false, panelMsg = '', lastAuthUrl = '';
  const auth = createAuth({ onChange: () => { try { station?.authChanged(); } catch (e) { console.warn('[spotify]', e); } renderPanel(); } });
  const api = createApi({ auth });
  station = createSpotifyStation({ auth, api });
  const radio = () => G.audio?.radio || null;

  // ---------------------------------------------------------------- radio registration (the contract may land later)
  function tryRegister() {
    if (handle) return true;
    const r = radio();
    if (!r || typeof r.registerExternal !== 'function') return false;
    try { handle = r.registerExternal(station) || { unregister() {} }; } catch (e) { console.warn('[spotify] registerExternal failed', e); return false; }
    try { r.subscribe?.(() => widget.poke()); } catch { /* optional */ }
    if (autoSelect) selectSpotify();
    return true;
  }
  function selectSpotify() {
    const r = radio();
    if (handle && r) {
      autoSelect = false;
      try { r.setStationById?.('spotify'); r.setOn?.(true); } catch (e) { console.warn('[spotify] could not tune the radio', e); }
    } else {
      autoSelect = true;
      // standalone (radio without the external-station contract): play anyway after a grace period
      setTimeout(() => { if (!handle && autoSelect) { autoSelect = false; station.onSelect(); } }, 5000);
    }
  }
  const onSpotify = () => {
    const r = radio();
    if (handle && r) { try { return !!(r.isOn?.() && r.current?.()?.id === 'spotify'); } catch { return false; } }
    return station.snapshot().selected;
  };
  station.subscribe(kind => {
    if (kind !== 'state') { try { handle?.notify?.(); } catch { /* optional */ } }
    widget.poke();
    if (panel && kind !== 'state') renderPanel();
  });

  // ---------------------------------------------------------------- now-playing widget
  const widget = createWidget(G, station, radio, () => handle);
  tryRegister();
  const loop = setInterval(() => {
    try {
      if (!handle && regTries++ < 180) tryRegister();
      if (panel?.layer && !panel.layer.open) closePanel(); // closed by the shell (closeAll etc.)
      widget.render();
    } catch (e) { console.warn('[spotify] tick', e); }
  }, 1000);
  void loop;
  if (Array.isArray(G.systems)) G.systems.push({ update(dt) { try { widget.tick(dt); } catch (e) { console.warn('[spotify] widget', e); } } });

  // ---------------------------------------------------------------- user gestures + keys
  const onGesture = () => { try { station.gesture(); } catch { /* never block input */ } };
  addEventListener('pointerdown', onGesture, true);
  addEventListener('keydown', e => {
    if (!e.repeat) onGesture();
    if (e.code !== 'KeyO' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (panel || G.state !== 'play' || G.ui?.isModal?.() || isTyping(e.target) || !onSpotify()) return;
    e.preventDefault();
    openPanel();
  }, true);

  // ---------------------------------------------------------------- connect / disconnect
  function saveClientId(v) {
    const id = String(v ?? '').trim();
    if (id !== auth.clientId) auth.clientId = id;
  }
  async function connect({ dryRun = !!G.spotify?.dryRun } = {}) {
    try {
      if (panel) saveClientId(panel.cid.value);
      const cid = auth.clientId;
      if (!CLIENT_ID_RE.test(cid)) {
        panelMsg = cid ? 'That Client ID looks wrong: it is 32 characters, 0-9 and a-f.' : 'Paste your Spotify app Client ID first (step 3).';
        if (!panel) openPanel(); else renderPanel();
        panel?.nav.focus(panel.cid);
        return null;
      }
      if (location.hostname === 'localhost') {
        panelMsg = 'Spotify rejects "localhost". Open the game at 127.0.0.1 (link below) and connect from there.';
        renderPanel();
        return null;
      }
      const url = await auth.beginLogin({ clientId: cid, redirectUri: redirectUriFor(location), returnUrl: location.href });
      if (dryRun) { lastAuthUrl = url; panelMsg = 'Dry run: this is the Spotify sign-in URL (not opened).'; renderPanel(); return url; }
      try { G.economy?.save?.(); } catch { /* best effort */ }
      location.assign(url);
      return url;
    } catch (e) {
      panelMsg = e?.message || 'Could not start the Spotify sign-in';
      renderPanel();
      return null;
    }
  }
  function disconnect() {
    try { station.disconnect(); } catch (e) { console.warn('[spotify]', e); }
    panelMsg = 'Disconnected. To remove access completely, open spotify.com/account/apps and remove the app.';
    renderPanel();
  }

  // ---------------------------------------------------------------- panel
  function openPanel() {
    try {
      if (panel) return;
      const root = h('div', 'ui-screen sp-screen');
      root.innerHTML = PANEL_HTML;
      // Preferred: the UI shell's modal layer (pause, pointer lock, HUD hide, gamepad -> key events that makeNav
      // below receives first). Fallback: the classic overlay pattern (G.state = 'paused', release pointer lock).
      let layer = null, prev = null;
      if (typeof G.ui?.screen?.open === 'function') {
        try { layer = G.ui.screen.open(root, { onBack: () => { closePanel(); return false; }, pause: true, hud: false, nav: false }); } catch (e) { console.warn('[spotify] ui.screen.open', e); layer = null; }
      }
      if (!layer) {
        prev = { state: G.state, lock: G.input?.wantPointerLock };
        G.state = 'paused';
        try { document.exitPointerLock?.(); } catch { /* not locked */ }
        if (G.input) G.input.wantPointerLock = false;
        document.body.appendChild(root);
      }
      const q = s => root.querySelector(`[data-el="${s}"]`);
      const cid = q('cid');
      cid.value = auth.clientId;
      // typing guard: registered BEFORE makeNav so WASD / Space / Backspace reach the text field (default action kept)
      const guard = e => {
        if (e.target !== cid) return;
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { cid.blur(); return; }
        if (e.code === 'Escape') return;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault(); e.stopImmediatePropagation();
          saveClientId(cid.value); cid.blur(); renderPanel();
          panel?.nav.focus(root.querySelector('[data-act="connect"]'));
          return;
        }
        e.stopImmediatePropagation();
      };
      addEventListener('keydown', guard, true);
      const nav = makeNav(root, { onBack: closePanel, initial: auth.isConnected() ? root.querySelector('[data-act="close"]') : (CLIENT_ID_RE.test(auth.clientId) ? root.querySelector('[data-act="connect"]') : cid) });
      root.addEventListener('navfocus', e => { if (e.target === cid) cid.focus({ preventScroll: true }); else if (document.activeElement === cid) cid.blur(); });
      cid.addEventListener('input', () => { panelMsg = ''; renderCidHint(); });
      cid.addEventListener('change', () => { saveClientId(cid.value); renderPanel(); });
      root.addEventListener('click', e => {
        const b = e.target.closest?.('[data-act]');
        if (!b || !root.contains(b)) return;
        onGesture();
        G.audio?.ui?.('click');
        const act = b.dataset.act;
        if (act === 'close') closePanel();
        else if (act === 'connect') { if (auth.isConnected()) disconnect(); else connect(); }
        else if (act === 'copy') copyUri(b);
        else if (act === 'tune') { selectSpotify(); panelMsg = 'The radio is tuned to Spotify. Close this panel to drive.'; renderPanel(); }
        else if (act === 'source') {
          const src = b.dataset.src === 'playlist' ? (station.snapshot().playlists || []).find(p => p.id === b.dataset.id) : null;
          station.setSource(src ? { type: 'playlist', ...src } : { type: b.dataset.src });
          if (!onSpotify()) selectSpotify();
          renderPanel();
        } else if (act === 'cid') cid.focus();
      });
      panel = { root, nav, layer, prev, guard, cid, pad: layer ? 0 : padPoller(nav, closePanel) };
      renderPanel();
      if (auth.isConnected()) station.ensureSession().then(ok => { if (ok) station.loadPlaylists().then(renderPanel); });
    } catch (e) { console.error('[spotify] openPanel', e); }
  }
  function closePanel() {
    if (!panel) return;
    const p = panel;
    panel = null; panelMsg = '';
    try { p.nav.destroy(); } catch { /* ignore */ }
    removeEventListener('keydown', p.guard, true);
    clearInterval(p.pad);
    try { saveClientId(p.cid.value); } catch { /* ignore */ }
    if (p.layer) { try { if (p.layer.open) p.layer.close(); } catch { p.root.remove(); } }
    else {
      p.root.remove();
      if (G.state === 'paused') G.state = p.prev.state;
      if (G.input) G.input.wantPointerLock = p.prev.lock ?? G.state === 'play';
    }
    G.audio?.ui?.('back');
    widget.poke();
  }
  async function copyUri(btn) {
    const uri = redirectUriFor(location);
    let ok = false;
    try { await navigator.clipboard.writeText(uri); ok = true; } catch {
      try { const r = document.createRange(); r.selectNodeContents(panel.root.querySelector('[data-el="uri"]')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); } catch { ok = false; }
    }
    btn.textContent = ok ? 'Copied' : 'Select + copy';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  }
  function renderCidHint() {
    if (!panel) return;
    const v = panel.cid.value.trim(), el = panel.root.querySelector('[data-el="cidhint"]');
    el.textContent = !v ? '' : CLIENT_ID_RE.test(v) ? 'Looks good.' : 'A Client ID is 32 characters: digits and letters a-f.';
    el.className = 'sp-hint ' + (!v ? '' : CLIENT_ID_RE.test(v) ? 'ok' : 'bad');
  }
  function renderPanel() {
    if (!panel) return;
    try {
      const { root } = panel, s = station.snapshot();
      const q = k => root.querySelector(`[data-el="${k}"]`);
      // status
      const st = q('status');
      st.replaceChildren();
      const line = h('div', 'sp-line');
      if (s.connected) {
        line.append(h('b', null, s.user ? s.user.name : 'Connected'));
        const prod = s.premium === true ? 'Premium' : s.premium === false ? 'Free account' : '';
        if (prod) line.append(h('span', 'sp-pill' + (s.premium ? ' on' : ''), prod));
        const mode = s.mode === 'sdk' ? 'Playing in the game' : s.mode === 'remote' ? 'Showing your other device' : '';
        if (mode) line.append(h('span', 'sp-dim', mode));
      } else line.append(h('b', null, 'Not connected'));
      st.append(line);
      let msg = panelMsg || (s.message && !/^(Ready|Paused|Nothing playing)$/.test(s.message) ? s.message : '');
      msg = msg.replace(/\s*Press O to connect\.$/, '').replace(/^Not connected - press O to connect$/, ''); // already in the panel
      if (msg) st.append(h('div', 'sp-msg', msg));
      if (lastAuthUrl && !s.connected) { const c = h('code', 'sp-url', lastAuthUrl); st.append(c); }
      const cb = root.querySelector('[data-act="connect"]');
      cb.textContent = s.connected ? 'Disconnect' : 'Connect';
      cb.classList.toggle('primary', !s.connected);
      root.querySelector('[data-act="tune"]').style.display = s.connected && !onSpotify() ? '' : 'none';
      // redirect uri + warnings
      const uri = redirectUriFor(location);
      q('uri').textContent = uri;
      const warn = q('uriwarn');
      warn.replaceChildren();
      const host = location.hostname;
      if (host === 'localhost') {
        const alt = `${location.protocol}//127.0.0.1${location.port ? ':' + location.port : ''}${location.pathname}`;
        warn.append('Spotify rejects "localhost". Use ');
        const a = h('a', null, alt); a.href = alt + location.search + location.hash; warn.append(a, ' instead.');
      } else if (location.protocol === 'http:' && !['127.0.0.1', '[::1]', '::1'].includes(host)) {
        warn.append('Spotify needs https here (plain http only works on 127.0.0.1).');
      }
      renderCidHint();
      // sources (rebuilt only when they change; keyboard focus is kept on the same tile)
      const list = q('sources');
      const cur = s.source;
      const sig = JSON.stringify([s.connected, cur, s.playlists && s.playlists.map(p => [p.id, p.name, p.total])]);
      if (sig === panel.srcSig) return;
      panel.srcSig = sig;
      const f = panel.nav.current, fKey = f && list.contains(f) ? `${f.dataset.src}:${f.dataset.id || ''}` : null;
      list.replaceChildren();
      if (!s.connected) { list.append(h('p', 'ui-p', 'Connect to choose what the Spotify station plays.')); return; }
      const tile = (label, sub, src, id, img) => {
        const t = h('div', 'ui-tile sp-tile' + ((cur.type === src && (src !== 'playlist' || cur.id === id)) ? ' on' : ''));
        t.setAttribute('data-nav', ''); t.dataset.act = 'source'; t.dataset.src = src; if (id) t.dataset.id = id;
        const art = h('div', 'sp-thumb');
        if (img && /^https:\/\//.test(img)) { const im = h('img'); im.alt = ''; im.loading = 'lazy'; im.src = img; art.append(im); } else art.textContent = label.slice(0, 1);
        const txt = h('div', 'sp-tt');
        txt.append(h('div', 't', label), h('div', 's', sub));
        t.append(art, txt);
        list.append(t);
      };
      tile('My queue / resume', 'Pick up where you left off', 'queue');
      tile('Liked Songs', 'Shuffled from your library', 'liked');
      if (!s.playlists) list.append(h('p', 'ui-p sp-dim', 'Loading your playlists...'));
      else if (!s.playlists.length) list.append(h('p', 'ui-p sp-dim', 'No playlists found.'));
      else for (const p of s.playlists) tile(p.name, [p.total != null ? `${p.total} tracks` : '', p.owner].filter(Boolean).join(' · ') || 'Playlist', 'playlist', p.id, p.image);
      if (fKey) { const again = [...list.querySelectorAll('[data-act="source"]')].find(t => `${t.dataset.src}:${t.dataset.id || ''}` === fKey); if (again) panel.nav.focus(again); }
    } catch (e) { console.warn('[spotify] renderPanel', e); }
  }

  // ---------------------------------------------------------------- public API
  G.spotify = {
    openPanel, closePanel, connect, disconnect, station,
    get state() { return { ...station.snapshot(), clientIdSet: CLIENT_ID_RE.test(auth.clientId), redirectUri: redirectUriFor(location), registered: !!handle, panelOpen: !!panel }; },
    dryRun: false,
  };

  // ---------------------------------------------------------------- OAuth return / saved session / ?spotify
  const whenPlaying = fn => {
    if (G.state !== 'title') { fn(); return; }
    let done = false;
    G.on?.('start', () => { if (!done) { done = true; setTimeout(fn, 600); } });
  };
  if (EARLY) {
    station.setConnecting();
    auth.completeCallback(EARLY).then(res => {
      if (!res) return;
      if (res.ok) {
        selectSpotify();
        whenPlaying(() => G.hud?.toast?.('Spotify connected', 'Your music is on the radio · T / Y skip · O Spotify panel', 'radio', 5200));
      } else {
        whenPlaying(() => G.hud?.toast?.(res.error === 'access_denied' ? 'Spotify not connected' : 'Spotify sign-in failed', esc(res.message), '', 5200));
      }
    }).catch(e => console.warn('[spotify] callback', e));
  } else if (auth.isConnected()) {
    auth.getAccessToken().catch(() => { /* invalid_grant clears tokens and shows "disconnected" */ });
  }
  try { if (new URLSearchParams(location.search).has('spotify')) setTimeout(openPanel, 400); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- gamepad navigation for the panel
function padPoller(nav, back) {
  let prev = null, dirKey = '', repeatAt = 0;
  return setInterval(() => {
    try {
      const pads = navigator.getGamepads?.() || [];
      let pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      if (!pad) { prev = null; return; }
      const now = performance.now(), pressed = pad.buttons.map(b => !!b?.pressed);
      if (prev) {
        const edge = i => pressed[i] && !prev[i];
        if (edge(12)) nav.move(0, -1); else if (edge(13)) nav.move(0, 1); else if (edge(14)) nav.move(-1, 0); else if (edge(15)) nav.move(1, 0);
        else if (edge(0)) nav.current?.click(); else if (edge(1)) back();
        const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
        const dir = Math.abs(y) > 0.6 ? [0, Math.sign(y)] : Math.abs(x) > 0.6 ? [Math.sign(x), 0] : null;
        if (dir) { const k = dir.join(); if (k !== dirKey || now > repeatAt) { nav.move(dir[0], dir[1]); repeatAt = now + (k !== dirKey ? 380 : 160); dirKey = k; } } else dirKey = '';
      }
      prev = pressed;
    } catch { /* pads come and go */ }
  }, 50);
}

// ---------------------------------------------------------------- now-playing card
function createWidget(G, station, radio, getHandle) {
  const root = h('div', 'sp-np off');
  root.innerHTML = `<div class="sp-card"><div class="sp-art"><img alt="" referrerpolicy="no-referrer"><span></span></div>
    <div class="sp-meta"><div class="sp-st"><b></b><span></span></div><div class="sp-title"></div><div class="sp-artist"></div><div class="sp-msg2"></div><div class="sp-bar"><i></i></div></div></div>
    <div class="sp-keys"></div>`;
  const $ = s => root.querySelector(s);
  const img = $('.sp-art img'), letter = $('.sp-art span'), stName = $('.sp-st b'), stGenre = $('.sp-st span');
  const title = $('.sp-title'), artist = $('.sp-artist'), msg2 = $('.sp-msg2'), bar = $('.sp-bar'), barI = $('.sp-bar i'), keys = $('.sp-keys');
  let mountedIn = null, inSlot = false, lastKey = null, changedAt = 0, acc = 0, lastArt = '';
  img.addEventListener('error', () => { img.style.display = 'none'; letter.style.display = ''; });

  function mount() {
    const slot = G.ui?.slots?.radio;
    const isEl = !!(slot && typeof slot === 'object' && slot.nodeType === 1);
    const target = isEl ? slot : (G.hud?.root?.nodeType === 1 ? G.hud.root : document.body);
    if (mountedIn === target && root.parentNode === target) return;
    target.appendChild(root);
    mountedIn = target; inSlot = isEl;
    root.classList.toggle('in-slot', inSlot);
  }
  // radio off: take the card out of the HUD slot so the slot is :empty again (the shell then shows its own toasts)
  function unmount() { if (root.parentNode) root.remove(); mountedIn = null; }
  function data() {
    const r = radio();
    if (r && getHandle()) {
      if (!r.isOn?.()) return null;
      const c = r.current?.() || {};
      if (c.id === 'spotify') return spotify(c.name);
      let t = c.title || '', a = c.artist || '';
      if (!t && c.track) { const parts = String(c.track).split(' - '); if (parts.length > 1) { a = a || parts.shift(); t = parts.join(' - '); } else t = c.track; }
      return { spotify: false, station: c.name || 'Radio', genre: c.genre || '', title: t, artist: a, art: c.art || null, pos: +c.positionMs || 0, dur: +c.durationMs || 0, paused: false, message: '' };
    }
    return station.snapshot().selected ? spotify('Spotify') : null;
  }
  function spotify(name) {
    const np = station.nowPlaying() || {};
    return { spotify: true, station: name || 'Spotify', genre: station.genre, title: np.title || '', artist: np.artist || '', art: np.art || null, pos: np.positionMs || 0, dur: np.durationMs || 0, paused: !!np.paused, message: np.message || '' };
  }
  function render() {
    let d = null;
    try { d = data(); } catch { d = null; }
    if (!d) { root.classList.add('off'); lastKey = null; unmount(); return; }
    mount();
    root.classList.remove('off');
    const key = [d.station, d.genre, d.title, d.artist, d.message].join('\u0001');
    if (key !== lastKey) {
      changedAt = performance.now(); // any station / track / status change brings the card back
      lastKey = key;
      stName.textContent = d.station;
      stGenre.textContent = d.genre ? ' · ' + d.genre : '';
      title.textContent = d.title || d.station;
      artist.textContent = d.title ? d.artist : (d.message || d.genre);
      msg2.textContent = d.title && d.message ? d.message : '';
      const art = d.art && /^https:\/\//.test(d.art) ? d.art : '';
      if (art !== lastArt) { lastArt = art; if (art) { img.src = art; img.style.display = ''; letter.style.display = 'none'; } else { img.removeAttribute('src'); img.style.display = 'none'; letter.style.display = ''; } }
      letter.textContent = (d.station || '?').slice(0, 1);
      keys.innerHTML = d.spotify
        ? (station.snapshot().connected ? '<b>T</b>/<b>Y</b> track · <b>Shift</b>+<b>T</b>/<b>Y</b> station · <b>O</b> Spotify' : '<b>O</b> connect Spotify · <b>Shift</b>+<b>T</b>/<b>Y</b> station')
        : '';
    }
    if (d.dur > 0) { bar.style.display = ''; barI.style.width = (Math.min(1, Math.max(0, d.pos / d.dur)) * 100).toFixed(2) + '%'; } else bar.style.display = 'none';
    root.classList.toggle('paused', !!d.paused);
    const idle = G.state === 'play' && performance.now() - changedAt > 6000;
    root.classList.toggle('dim', idle);
    root.classList.toggle('low', !inSlot && !!G.player && !G.player.vehicle);
  }
  return {
    render,
    poke() { render(); },
    tick(dt) { acc += dt; if (acc < 0.25) return; acc = 0; render(); },
  };
}

// ---------------------------------------------------------------- markup + styles
const PANEL_HTML = `
<div class="sp-top">
  <div><div class="ui-h3">Radio</div><h1 class="ui-h1">Spotify</h1></div>
  <button class="ui-btn" data-nav data-act="close">Close <span class="ui-key">Esc</span></button>
</div>
<p class="ui-p sp-lede">Play your own Spotify on the in-game radio. You sign in on Spotify's own page; the game never sees your password.</p>
<div class="sp-cols">
  <section class="ui-panel ui-col">
    <h3 class="ui-h3">Account</h3>
    <div class="sp-status" data-el="status"></div>
    <div class="ui-row sp-actions"><button class="ui-btn primary" data-nav data-act="connect">Connect</button><button class="ui-btn" data-nav data-act="tune">Tune radio to Spotify</button></div>
    <h3 class="ui-h3" style="margin-top:8px">One-time setup</h3>
    <ol class="sp-steps">
      <li>Create an app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">developer.spotify.com/dashboard</a> and tick <b>Web API</b> and <b>Web Playback SDK</b>.</li>
      <li>Add this Redirect URI to the app, exactly:
        <div class="sp-uri"><code data-el="uri"></code><button class="ui-btn sp-small" data-nav data-act="copy">Copy</button></div>
        <div class="sp-warn" data-el="uriwarn"></div></li>
      <li>Paste the app's Client ID here:
        <input class="sp-input" data-nav data-act="cid" data-el="cid" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" maxlength="64" placeholder="32-character Client ID">
        <div class="sp-hint" data-el="cidhint"></div></li>
      <li>Press <b>Connect</b> and approve on Spotify.</li>
    </ol>
    <p class="sp-note">Premium plays music inside the game; free accounts see what is playing on their other device. An app in development mode only works for accounts added under <b>User Management</b> in its dashboard.</p>
  </section>
  <section class="ui-panel ui-col sp-srcwrap">
    <h3 class="ui-h3">Play from</h3>
    <div class="sp-list" data-el="sources"></div>
  </section>
</div>
<div class="ui-foot"><span><span class="ui-key">T</span> <span class="ui-key">Y</span> next / previous track</span><span><span class="ui-key">Shift</span> + <span class="ui-key">T</span> <span class="ui-key">Y</span> change station</span><span><span class="ui-key">O</span> this panel</span><span><span class="ui-key">Esc</span> close</span></div>`;

function injectCss() {
  if (document.getElementById('sp-style')) return;
  const s = document.createElement('style');
  s.id = 'sp-style';
  s.textContent = `
.sp-np{position:fixed;right:30px;bottom:266px;z-index:21;width:280px;pointer-events:none;color:var(--ui-ink);font-family:var(--ui-sans);
  transition:opacity .6s ease,transform .6s ease,bottom .3s ease}
.sp-np.in-slot{position:relative;right:auto;bottom:auto;z-index:auto;width:280px;max-width:100%}
.sp-np.low{bottom:28px}.sp-np.off{display:none}.sp-np.dim{opacity:0;transform:translateY(6px)}
.sp-card{display:flex;gap:12px;align-items:center;padding:9px 12px 10px 9px;border-radius:8px;
  background:linear-gradient(135deg,rgba(9,10,16,.82),rgba(9,10,16,.55));backdrop-filter:blur(8px);box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 0 0 1px var(--ui-faint)}
.sp-art{flex:0 0 52px;height:52px;border-radius:5px;overflow:hidden;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--ui-acc),#5b2bff);font:italic 800 26px/1 var(--ui-cond);text-transform:uppercase}
.sp-art img{width:100%;height:100%;object-fit:cover;display:block}
.sp-meta{min-width:0;flex:1}
.sp-st{font:700 11px/1 var(--ui-cond);letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-st b{color:var(--ui-acc)}.sp-st span{color:var(--ui-dim)}
.sp-title{margin-top:4px;font:italic 800 19px/1.05 var(--ui-cond);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-artist{margin-top:2px;font:500 12.5px/1.3 var(--ui-sans);color:var(--ui-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-msg2{font:600 11px/1.3 var(--ui-sans);color:var(--ui-acc2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-msg2:empty{display:none}
.sp-bar{margin-top:7px;height:3px;border-radius:2px;background:var(--ui-faint);overflow:hidden}
.sp-bar i{display:block;height:100%;width:0;background:var(--ui-ink);transition:width .25s linear}
.sp-np.paused .sp-bar i{background:var(--ui-dim)}
.sp-keys{margin:5px 3px 0;font:600 10.5px/1.2 var(--ui-sans);color:var(--ui-dim);text-align:right;text-shadow:0 1px 4px rgba(0,0,0,.7)}
.sp-keys:empty{display:none}.sp-keys b{color:var(--ui-ink);font-weight:800}
.sp-screen{overflow:auto;padding:40px 56px}
.sp-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.sp-top .ui-h1 span{color:var(--ui-acc)}
.sp-lede{margin:10px 0 18px;max-width:760px}
.sp-cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;align-items:start}
@media (max-width:860px){.sp-cols{grid-template-columns:1fr}.sp-screen{padding:24px 18px}}
.sp-status{font:500 14px/1.45 var(--ui-sans)}
.sp-line{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.sp-line b{font:italic 800 22px/1 var(--ui-cond);text-transform:uppercase}
.sp-pill{font:700 11px/1 var(--ui-sans);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:3px;background:var(--ui-glass);box-shadow:inset 0 0 0 1px var(--ui-faint)}
.sp-pill.on{background:var(--ui-acc)}
.sp-dim{color:var(--ui-dim)}.sp-msg{margin-top:6px;color:var(--ui-acc2);font:600 13px/1.4 var(--ui-sans)}
.sp-url{display:block;margin-top:6px;font:12px/1.35 ui-monospace,Consolas,monospace;word-break:break-all;color:var(--ui-dim)}
.sp-actions{flex-wrap:wrap;margin:4px 0 2px}
.sp-steps{margin:0;padding-left:20px;font:500 14px/1.5 var(--ui-sans);color:var(--ui-dim);display:flex;flex-direction:column;gap:8px}
.sp-steps b{color:var(--ui-ink)}.sp-steps a,.sp-warn a{color:var(--ui-acc2)}
.sp-uri{display:flex;gap:8px;align-items:center;margin-top:5px;flex-wrap:wrap}
.sp-uri code{font:600 13px/1.3 ui-monospace,Consolas,monospace;color:var(--ui-ink);background:rgba(0,0,0,.35);padding:7px 9px;border-radius:4px;user-select:all;word-break:break-all}
.ui-btn.sp-small{font-size:15px;padding:7px 12px}
.sp-warn{margin-top:5px;color:#ff8a8a;font:600 12.5px/1.35 var(--ui-sans)}.sp-warn:empty{display:none}
.sp-input{display:block;width:100%;max-width:420px;box-sizing:border-box;margin-top:5px;padding:9px 11px;border:0;border-radius:4px;outline:none;
  font:600 14px/1.2 ui-monospace,Consolas,monospace;color:var(--ui-ink);background:rgba(0,0,0,.4);box-shadow:inset 0 0 0 1px var(--ui-faint)}
.sp-input.focus,.sp-input:focus{box-shadow:inset 0 0 0 2px var(--ui-acc)}
.sp-hint{margin-top:4px;font:600 12px/1.3 var(--ui-sans)}.sp-hint.ok{color:#39e07a}.sp-hint.bad{color:#ff8a8a}.sp-hint:empty{display:none}
.sp-note{margin:4px 0 0;font:500 12.5px/1.45 var(--ui-sans);color:var(--ui-dim)}.sp-note b{color:var(--ui-ink)}
.sp-list{display:flex;flex-direction:column;gap:8px;max-height:min(56vh,560px);overflow:auto;padding:3px}
.ui-tile.sp-tile{display:flex;gap:12px;align-items:center;min-height:0;padding:9px 12px}
.ui-tile.sp-tile.on{background:rgba(255,46,126,.2);box-shadow:inset 0 0 0 2px var(--ui-acc)}
.sp-thumb{flex:0 0 42px;height:42px;border-radius:4px;overflow:hidden;display:grid;place-items:center;background:linear-gradient(135deg,rgba(255,46,126,.55),rgba(91,43,255,.55));font:italic 800 20px/1 var(--ui-cond)}
.sp-thumb img{width:100%;height:100%;object-fit:cover}
.sp-tt{min-width:0}.sp-tile .t{font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-tile .s{margin-top:3px;font-size:12px}
`;
  document.head.appendChild(s);
}
