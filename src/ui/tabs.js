// Built-in pause-menu tabs. Other modules replace a tab by calling G.ui.menu.addTab() with the same id:
//   event (only while G.events.active), campaign ("Festival", fallback), cars (fallback garage), map, collection
//   (fallback records), photo (fallback launcher), settings.
import { svgIcon, kindInfo } from './icons.js';
import { MODES, setMode } from '../game/modes.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const fmtHours = h => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`; };

export const ASSIST_DEFAULTS = { abs: true, tcs: true, stm: true, steering: 'standard', brakingLine: 'off', gearbox: 'auto' };
export const HANDLING_DEFAULTS = { sens: 1, kbSpeed: 1, counter: true, padCurve: 1.4 };
export const CAMERA_DEFAULTS = { view: 'chase', fov: 0, shake: true, blur: true };
export function settingsDefaults(s) {
  s.assists = { ...ASSIST_DEFAULTS, ...(s.assists || {}) };
  s.camera = { ...CAMERA_DEFAULTS, ...(s.camera || {}) };
  s.handling = { ...HANDLING_DEFAULTS, ...(s.handling || {}) };
  if (s.engine == null) s.engine = 1;
  if (s.hudScale == null) s.hudScale = 1;
  if (s.minimapNorth == null) s.minimapNorth = false;
  return s;
}
export function applyAudio(G) {
  const s = G.economy.settings;
  try { G.audio?.setVolumes?.({ master: s.volume, sfx: s.sfx, music: s.music, engine: s.engine }); } catch (e) { console.warn('[settings] audio', e); }
}

export function registerBuiltinTabs(G) {
  const ui = G.ui, menu = ui.menu;
  menu.addTab({ id: 'event', title: 'Event', order: 0, icon: 'flag', visible: () => !!G.events?.active, build: buildEvent });
  menu.addTab({ id: 'campaign', title: 'Festival', order: 10, icon: 'trophy', build: buildFestival });
  menu.addTab({ id: 'cars', title: 'Cars', order: 20, icon: 'car', build: buildCars });
  menu.addTab({ id: 'map', title: 'Map', order: 30, icon: 'map', build: (el) => { el.style.overflow = 'hidden'; return ui.map.mount(el); } });
  menu.addTab({ id: 'collection', title: 'Collection', order: 40, icon: 'grid', build: buildCollection });
  menu.addTab({ id: 'photo', title: 'Photo', order: 50, icon: 'camera', build: buildPhoto });
  menu.addTab({ id: 'settings', title: 'Settings', order: 90, icon: 'gear', build: buildSettings });

  // ---------------------------------------------------------------- event (in-race pause)
  function buildEvent(el, nav) {
    const A = G.events.active, R = { ...(A?.def || {}), ...(A?.R || {}), ...(G.events.activeInfo?.() || {}) };
    if (!R.name) R.name = A?.name || A?.title; if (!R.type) R.type = A?.type || A?.kindLabel;
    el.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,440px) minmax(0,1fr);gap:48px">
      <div><div class="mw-k">${esc(R.type || 'Event')}</div><h2 class="mw-h" style="font-size:64px">${esc(R.name || 'In event')}</h2><p class="mw-p">${esc(R.desc || '')}</p>
      <div class="ui-col" style="margin-top:26px;gap:6px">
        <button class="mw-btn" data-nav data-nav-default data-a="resume">${svgIcon('play', 20)}Resume</button>
        <button class="mw-btn" data-nav data-a="restart">${svgIcon('restart', 20)}Restart event</button>
        <button class="mw-btn danger" data-nav data-a="quit">${svgIcon('exit', 20)}Quit event<small>Rewards are lost</small></button>
      </div></div>
      <div class="mw-grid" style="align-content:start;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
        ${A?.t != null ? `<div class="mw-stat"><i>Time</i><b>${fmtTime(Math.max(0, A.t))}</b></div>` : ''}
        ${R.cps ? `<div class="mw-stat"><i>Checkpoint</i><b>${Math.min(A.cpIdx, R.cps.length)} / ${R.cps.length}</b></div>` : ''}
        ${A?.rivals ? `<div class="mw-stat"><i>Rivals</i><b>${A.rivals.length}</b></div>` : ''}
        ${R.reward ? `<div class="mw-stat"><i>Reward</i><b class="ui-money">${R.reward.toLocaleString()}</b></div>` : ''}
        ${G.economy?.records?.['race:' + R.id] ? `<div class="mw-stat"><i>Your best</i><b>${fmtTime(G.economy.records['race:' + R.id])}</b></div>` : ''}
      </div></div>`;
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a, E = G.events;
      if (a === 'resume') nav.close();
      else if (a === 'restart') { const R2 = E.active?.R; nav.close(); if (E.restart) E.restart(); else if (R2 && E.startRace) { E.endRace?.('quit'); E.startRace(R2); } }
      else if (a === 'quit') { nav.close(); E.endRace?.('quit'); }
    }));
  }

  // ---------------------------------------------------------------- festival (overview; the festival module may replace 'campaign')
  function buildFestival(el, nav) {
    const E = G.economy, S = E.stats, mph = G.hud.units !== 'kmh';
    const p = G.player.pos;
    const evs = nearbyEvents(8);
    el.innerHTML = `<div class="fx">
      <div class="ui-col" style="gap:18px">
        <div class="fx-hero"><div class="mw-k">Festival · ${esc(G.world.district(p.x, p.z))} · ${fmtHours(G.env?.state?.hours ?? 12)}</div>
          <h2 class="mw-h" style="margin-top:10px">Level ${E.level}</h2>
          <p class="mw-p" style="max-width:420px">${E.xpInLevel.toLocaleString()} / ${E.xpForNext.toLocaleString()} XP to level ${E.level + 1}. <b class="ui-money" style="color:var(--ink)">${Math.round(E.money).toLocaleString()}</b> in the bank, ${E.owned.length} car${E.owned.length === 1 ? '' : 's'} in the garage.</p>
          <div class="ui-bar" style="margin-top:16px;max-width:420px;height:5px;transform:skewX(-20deg)"><i style="width:${(100 * E.xpInLevel / Math.max(1, E.xpForNext)).toFixed(1)}%;background:linear-gradient(90deg,#8f7bff,#c8b9ff)"></i></div>
        </div>
        <div class="mw-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div class="mw-stat"><i>Races won</i><b>${S.wins} / ${S.races}</b></div>
          <div class="mw-stat"><i>Longest air</i><b>${S.bestAir.toFixed(2)} s</b></div>
          <div class="mw-stat"><i>Top speed</i><b>${mph ? Math.round(S.bestSpeed / 1.609) + ' mph' : Math.round(S.bestSpeed) + ' km/h'}</b></div>
          <div class="mw-stat"><i>Jumps</i><b>${S.jumps}</b></div>
          <div class="mw-stat"><i>Distance</i><b>${(S.distance / (mph ? 1609 : 1000)).toFixed(1)} ${mph ? 'mi' : 'km'}</b></div>
          <div class="mw-stat"><i>Mode</i><b>${esc(MODES[G.mode]?.label || G.mode)}</b></div>
        </div>
        <div class="mw-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <button class="mw-tile" data-nav data-a="map"><span class="tag">Navigate</span>${svgIcon('map', 30, 'ic-big')}<span class="t">Open map</span><span class="s">Events, stunts, fast travel</span></button>
          <button class="mw-tile" data-nav data-a="title"><span class="tag">Progress is saved</span>${svgIcon('exit', 30, 'ic-big')}<span class="t">Quit to title</span><span class="s">Back to the start screen</span></button>
        </div>
      </div>
      <div><div class="mw-k" style="margin-bottom:12px">Events near you</div><div class="fx-list">${evs.length ? evs.map((m, i) => `<button class="fx-ev" data-nav ${i === 0 ? 'data-nav-default' : ''} data-i="${i}" style="--c:${m.color}"><span class="bd">${svgIcon(m.icon, 20)}</span><span class="tx"><b>${esc(m.title)}</b><span>${esc(m.kindLabel || '')}${m.meta ? ' · ' + esc(m.meta) : ''}</span></span><em>${G.hud.fmtDist(m.d)}</em></button>`).join('') : '<p class="mw-p">No events in this mode.</p>'}</div>
      <p class="mw-p" style="margin-top:10px;font-size:12.5px">Select an event to set your route to it.</p></div></div>`;
    el.querySelectorAll('.fx-ev').forEach(b => b.addEventListener('click', () => { const m = evs[+b.dataset.i]; ui.map.setWaypoint(m.x, m.z, true); ui._sound('confirm'); ui.notify({ title: 'Route set', sub: m.title, icon: 'pin', ms: 2200 }); nav.close(); }));
    el.querySelector('[data-a="map"]').addEventListener('click', () => nav.openTab('map'));
    el.querySelector('[data-a="title"]').addEventListener('click', () => { G.economy.save(); location.href = location.pathname; });
  }
  function nearbyEvents(n) {
    const p = G.player.pos, out = [];
    for (const m of ui.markers.list()) if (m.group === 'events' || m.group === 'stunts') out.push({ ...m, d: Math.hypot(m.x - p.x, m.z - p.z) });
    const ev = G.events;
    if (ev && (!G.flags || G.flags.events)) {
      const k = kindInfo('race');
      for (const R of ev.races || []) if (!R.broken && R.path && !out.some(o => Math.hypot(o.x - R.path[0][0], o.z - R.path[0][1]) < 8)) out.push({ title: R.name, kindLabel: R.type, meta: R.cls ? 'Class ' + R.cls : '', x: R.path[0][0], z: R.path[0][1], icon: k.icon, color: k.color, d: Math.hypot(R.path[0][0] - p.x, R.path[0][1] - p.z) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, n);
  }

  // ---------------------------------------------------------------- cars (fallback garage; the cars module replaces 'cars')
  function buildCars(el, nav) {
    let CARS = null, ORDER = [];
    try { ({ CARS, PLAYER_GARAGE_ORDER: ORDER } = G._carsModule || {}); } catch { /* ignore */ }
    if (!CARS) { el.innerHTML = '<p class="mw-p">Garage unavailable.</p>'; return; }
    const E = G.economy, mph = G.hud.units !== 'kmh', busy = !!G.events?.active || (G.police?.stars || 0) > 0;
    const CLS = { S: '#b04cf0', A: '#ff3b4e', B: '#ff8a1d', C: '#f7d51d', D: '#3bc4f4' };
    el.innerHTML = `<div class="mw-k">Garage</div><h2 class="mw-h">Your cars</h2><p class="mw-p">${busy ? 'Unavailable during events and police chases.' : 'Pick a car you own and it is delivered to you. Buy more at Bay Motors in SoMa.'} <b class="ui-money" style="color:var(--ink)">${Math.round(E.money).toLocaleString()}</b> available.</p>
      <div class="mw-grid cars-grid" style="margin-top:22px">${ORDER.map(id => { const d = CARS[id], owned = E.owned.includes(id), cur = E.current === id;
        return `<button class="mw-tile ${owned ? '' : 'locked'}" data-nav ${cur ? 'data-nav-default' : ''} data-car="${id}" style="min-height:150px"><span class="tag">${cur ? 'Driving' : owned ? 'Owned' : d.price == null ? 'Not for sale' : 'Dealer'}</span>
          <span style="position:absolute;right:14px;top:12px" class="ui-pi" ><i style="background:${CLS[d.cls] || '#aaa'};color:#0b0c10;padding:4px 8px">${d.cls}</i></span>
          <span class="t">${esc(d.name)}</span><span class="s">${d.drive} · ${mph ? Math.round(d.top / 1.609) + ' mph' : d.top + ' km/h'} · ${d.mass.toLocaleString()} kg</span>
          <span class="s" style="color:${owned ? 'var(--good)' : 'var(--acc2)'};font:italic 800 18px/1 var(--cond);margin-top:8px">${owned ? (cur ? 'In use' : 'Deliver') : d.price == null ? '—' : '$' + d.price.toLocaleString()}</span></button>`; }).join('')}</div>`;
    el.querySelectorAll('[data-car]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.car, d = CARS[id];
      if (busy) { ui._sound('error'); return; }
      if (!E.owned.includes(id)) {
        if (d.price == null || !E.spend(d.price)) { ui._sound('error'); if (d.price != null) ui.notify({ title: 'Not enough money', sub: `You need $${(d.price - E.money).toLocaleString()} more`, kind: 'bad', ms: 2500 }); return; }
        E.owned.push(id); ui._sound('purchase'); ui.notify({ title: `${d.name} purchased`, sub: 'Delivered to your location', kind: 'good', ms: 3000 });
      }
      E.current = id; E.save();
      nav.close();
      G.menus?.deliver?.(id);
    }));
  }

  // ---------------------------------------------------------------- collection (records)
  function buildCollection(el) {
    const ev = G.events || {}, rec = G.economy.records || {}, mph = G.hud.units !== 'kmh';
    const star = n => `<span style="color:var(--acc2);letter-spacing:2px">${'★'.repeat(n)}<span style="opacity:.25">${'★'.repeat(3 - n)}</span></span>`;
    const card = (icon, color, title, val, n) => `<div class="mw-tile" data-nav style="min-height:104px;cursor:default;--c:${color}"><span class="tag">${val == null ? 'Not attempted' : ''}</span><span class="ic-big" style="color:${color}">${svgIcon(icon, 26)}</span><span class="t" style="font-size:22px">${esc(title)}</span><span class="s" style="font:italic 800 20px/1 var(--cond);color:var(--ink);margin-top:6px">${val ?? '—'} ${n != null ? star(n) : ''}</span></div>`;
    const sec = (t, html) => html ? `<div class="mw-k" style="margin:22px 0 10px">${t}</div><div class="mw-grid">${html}</div>` : '';
    const races = (ev.races || []).filter(R => !R.broken).map(R => card('flag', '#ffc247', R.name, rec['race:' + R.id] != null ? fmtTime(rec['race:' + R.id]) : null)).join('');
    const traps = (ev.traps || []).filter(T => !T.broken).map(T => { const v = rec['trap:' + T.name]; return card('gauge', '#3aa0ff', T.name, v != null ? `${Math.round(mph ? v / 1.609 : v)} ${mph ? 'MPH' : 'KM/H'}` : null, v != null ? (v > 240 ? 3 : v > 190 ? 2 : v > 140 ? 1 : 0) : null); }).join('');
    const jumps = (ev.jumps || []).map(J => { const v = rec['jump:' + J.name]; return card('danger', '#ffd23f', J.name, v != null ? (mph ? Math.round(v * 3.281) + ' FT' : Math.round(v) + ' M') : null, v != null ? (v > 70 ? 3 : v > 50 ? 2 : v > 30 ? 1 : 0) : null); }).join('');
    const drifts = (ev.drifts || []).map(D => { const v = rec['drift:' + D.name]; return card('drift', '#ff6ad5', D.name, v != null ? v.toLocaleString() + ' PTS' : null, v != null ? (v > 6000 ? 3 : v > 3000 ? 2 : v > 1200 ? 1 : 0) : null); }).join('');
    el.innerHTML = `<div class="mw-k">Collection</div><h2 class="mw-h">Records</h2><p class="mw-p">Your best at every race, speed trap, danger sign and drift zone in the city.</p>
      ${sec('Races', races)}${sec('Speed traps', traps)}${sec('Danger signs', jumps)}${sec('Drift zones', drifts)}`;
  }

  // ---------------------------------------------------------------- photo (launcher; the photo module may replace it)
  function buildPhoto(el, nav) {
    const has = !!(G.photo?.enter || G.photo?.open || G.photo?.toggle);
    el.innerHTML = `<div class="mw-k">Photo mode</div><h2 class="mw-h">Photo</h2><p class="mw-p">${has ? 'Freeze the moment and frame the shot.' : 'Photo mode is not available in this build yet.'}</p>
      <div class="mw-grid" style="margin-top:22px;max-width:520px"><button class="mw-tile ${has ? '' : 'locked'}" data-nav data-nav-default>${svgIcon('camera', 30, 'ic-big')}<span class="t">Enter photo mode</span><span class="s">Free camera, filters, capture</span></button></div>`;
    el.querySelector('.mw-tile').addEventListener('click', () => { if (!has) { ui._sound('error'); return; } nav.close(); setTimeout(() => (G.photo.enter || G.photo.open || G.photo.toggle).call(G.photo), 30); });
  }

  // ---------------------------------------------------------------- settings
  function buildSettings(el, nav) {
    const s = settingsDefaults(G.economy.settings);
    const save = k => { try { G.economy.save(); } catch { /* ignore */ } G.emit?.('settings', s, k); };
    const onOff = [[true, 'On'], [false, 'Off']];
    const CATS = [
      { id: 'game', title: 'Gameplay', icon: 'flag', rows: [
        { sec: 'Game' },
        { label: 'Game mode', help: Object.values(MODES).map(m => `<b>${m.label}</b>: ${m.blurb}`).join('<br><br>'), opts: Object.entries(MODES).map(([k, m]) => [k, m.label]), get: () => G.mode, set: v => setMode(G, v) },
        { label: 'Units', help: 'Speed and distance units for the HUD, map and results.', opts: [['mph', 'Imperial'], ['kmh', 'Metric']], get: () => s.units, set: v => { s.units = v; G.hud.units = v; save('units'); } },
        { sec: 'World' },
        { label: 'Time of day', help: 'Jump the clock. Takes effect immediately.', opts: [[null, 'Keep'], [7, 'Sunrise'], [12.5, 'Noon'], [18.6, 'Golden hour'], [22, 'Night']], get: () => null, set: v => { if (v != null && G.env) G.env.state.hours = v; } },
        { label: 'Day length', help: 'How long a full day lasts in real time.', opts: [[24, '24 min'], [48, '48 min'], [0, 'Frozen']], get: () => (!G.env || G.env.state.timeScale === 0 ? 0 : Math.round(1 / (G.env.state.timeScale * 60) * 24) === 48 ? 48 : 24), set: v => { if (G.env) G.env.state.timeScale = v === 0 ? 0 : 1 / 60 * (24 / v); } },
        { sec: 'HUD' },
        { label: 'HUD scale', help: 'Size of the driving HUD. It already scales with your screen height.', opts: [[0.85, '85%'], [0.92, '92%'], [1, '100%'], [1.1, '110%'], [1.22, '122%']], get: () => s.hudScale, set: v => { s.hudScale = v; G.hud.setScale?.(v); save('hudScale'); } },
        { label: 'Minimap', help: 'Rotate the minimap with the camera, or keep north up.', opts: [[false, 'Rotating'], [true, 'North up']], get: () => !!s.minimapNorth, set: v => { s.minimapNorth = v; save('minimapNorth'); } },
      ] },
      { id: 'assists', title: 'Driving', icon: 'car', rows: [
        { sec: 'Presets' },
        { label: 'Apply preset', help: '<b>Easy</b>: every aid on, braking line, automatic.<br><b>Pro</b>: ABS only, no line, manual gearbox.', opts: [[null, 'Choose'], ['easy', 'Easy'], ['medium', 'Medium'], ['pro', 'Pro']], get: () => null, set: v => { if (!v) return; Object.assign(s.assists, v === 'easy' ? { abs: true, tcs: true, stm: true, steering: 'assisted', brakingLine: 'full', gearbox: 'auto' } : v === 'medium' ? { abs: true, tcs: true, stm: false, steering: 'standard', brakingLine: 'brake', gearbox: 'auto' } : { abs: true, tcs: false, stm: false, steering: 'sim', brakingLine: 'off', gearbox: 'manual' }); save('assists'); refreshRows(); } },
        { sec: 'Assists' },
        { label: 'ABS', help: 'Anti-lock brakes stop the wheels locking under heavy braking.', opts: onOff, get: () => s.assists.abs, set: v => { s.assists.abs = v; save('assists'); } },
        { label: 'Traction control', help: 'Cuts power when the driven wheels spin.', opts: onOff, get: () => s.assists.tcs, set: v => { s.assists.tcs = v; save('assists'); } },
        { label: 'Stability control', help: 'Brakes individual wheels to keep the car pointing where you steer.', opts: onOff, get: () => s.assists.stm, set: v => { s.assists.stm = v; save('assists'); } },
        { label: 'Steering', help: '<b>Assisted</b> keeps you on the road, <b>Standard</b> is the default, <b>Simulation</b> gives raw input.', opts: [['assisted', 'Assisted'], ['standard', 'Standard'], ['sim', 'Simulation']], get: () => s.assists.steering, set: v => { s.assists.steering = v; save('assists'); } },
        { sec: 'Handling' },
        { label: 'Steering sensitivity', help: 'How much lock you get at speed. 100% turns as hard as the tyres allow; lower is calmer, higher is sharper (Standard / Assisted steering).', slider: [60, 140, 5], fmt: v => v + '%', get: () => Math.round(s.handling.sens * 100), set: v => { s.handling.sens = v / 100; save('handling'); } },
        { label: 'Keyboard steering speed', help: 'How fast the wheel turns while a steering key is held, and how fast it returns to centre.', slider: [50, 160, 10], fmt: v => v + '%', get: () => Math.round(s.handling.kbSpeed * 100), set: v => { s.handling.kbSpeed = v / 100; save('handling'); } },
        { label: 'Counter-steer assist', help: 'Steers into a slide for you so drifts and snaps are easy to catch. Off in Simulation steering.', opts: onOff, get: () => s.handling.counter, set: v => { s.handling.counter = v; save('handling'); } },
        { label: 'Stick response', help: 'Gamepad steering curve. <b>Progressive</b> is gentle near the centre.', opts: [[1, 'Linear'], [1.4, 'Progressive'], [1.8, 'Very progressive']], get: () => s.handling.padCurve, set: v => { s.handling.padCurve = v; save('handling'); } },
        { label: 'Braking line', help: 'A racing line painted on the road. <b>Braking only</b> shows it in corners.', opts: [['off', 'Off'], ['brake', 'Braking only'], ['full', 'Full line']], get: () => s.assists.brakingLine, set: v => { s.assists.brakingLine = v; save('assists'); } },
        { label: 'Gearbox', help: '<b>Manual</b>: shift up / down yourself.', opts: [['auto', 'Automatic'], ['manual', 'Manual']], get: () => s.assists.gearbox, set: v => { s.assists.gearbox = v; save('assists'); } },
      ] },
      { id: 'camera', title: 'Camera', icon: 'camera', rows: [
        { sec: 'Camera' },
        { label: 'Default view', help: 'The camera you start in. Change it while driving with C / R3.', opts: [['chase', 'Chase'], ['far', 'Chase far'], ['hood', 'Hood'], ['cockpit', 'In-car']], get: () => s.camera.view, set: v => { s.camera.view = v; save('camera'); } },
        { label: 'Field of view', help: 'Adds to the camera field of view.', slider: [-10, 15, 1], fmt: v => (v > 0 ? '+' : '') + v + '°', get: () => s.camera.fov, set: v => { s.camera.fov = v; save('camera'); } },
        { label: 'Camera shake', help: 'Shake on impacts, landings and at high speed.', opts: onOff, get: () => s.camera.shake, set: v => { s.camera.shake = v; save('camera'); } },
        { label: 'Speed blur', help: 'Radial blur at high speed.', opts: onOff, get: () => s.camera.blur, set: v => { s.camera.blur = v; save('camera'); } },
        { label: 'Invert look', help: 'Invert vertical camera look.', opts: [[false, 'Off'], [true, 'On']], get: () => !!s.invertY, set: v => { s.invertY = v; save('invertY'); } },
      ] },
      { id: 'audio', title: 'Audio', icon: 'note', rows: [
        { sec: 'Volume' },
        { label: 'Master', help: 'Overall volume.', slider: [0, 100, 5], get: () => Math.round((s.volume ?? 1) * 100), set: v => { s.volume = v / 100; applyAudio(G); save('volume'); } },
        { label: 'Music', help: 'Radio and menu music.', slider: [0, 100, 5], get: () => Math.round((s.music ?? 1) * 100), set: v => { s.music = v / 100; applyAudio(G); save('music'); } },
        { label: 'Effects', help: 'Impacts, tyres, wind, UI.', slider: [0, 100, 5], get: () => Math.round((s.sfx ?? 1) * 100), set: v => { s.sfx = v / 100; applyAudio(G); save('sfx'); } },
        { label: 'Engine', help: 'Your car and traffic engines.', slider: [0, 100, 5], get: () => Math.round((s.engine ?? 1) * 100), set: v => { s.engine = v / 100; applyAudio(G); save('engine'); } },
      ] },
      { id: 'graphics', title: 'Graphics', icon: 'gear', rows: [
        { sec: 'Quality' },
        { label: 'Quality preset', help: 'Shadows, anti-aliasing, resolution, texture size, map streaming and traffic. Low fits ~2 GB of video memory, High ~3.5 GB. Applies after a restart.', opts: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], get: () => s.quality, set: v => { s.quality = v; s.qualityAuto = false; save('quality'); } },
        { label: 'Dynamic resolution', help: 'Lowers the render resolution for a moment when the frame rate drops below 60, so driving stays smooth.', opts: [[true, 'On'], [false, 'Off']], get: () => s.dynres !== false, set: v => { s.dynres = v; if (G.dynres) G.dynres.enabled = v; save('dynres'); } },
        { label: 'Restart to apply', help: 'Saves your progress and reloads the game with the chosen quality.', action: () => { G.economy.save(); location.reload(); } },
        { sec: 'Weather' },
        { label: 'Fog', help: 'Karl the Fog rolls in off the Pacific.', opts: [['clear', 'Clear skies'], ['karl', 'Dynamic'], ['thick', 'Pea soup']], get: () => s.fog, set: v => { s.fog = v; if (G.env) G.env.state.fogMode = v; save('fog'); } },
      ] },
      { id: 'controls', title: 'Controls', icon: 'wrench', page: controlsPage },
      { id: 'licenses', title: 'Licenses', icon: 'info', page: licensesPage },
    ];
    el.innerHTML = `<div class="st"><div class="st-cats">${CATS.map((c, i) => `<button class="st-cat" data-nav ${i === 0 ? 'data-nav-default' : ''} data-c="${c.id}">${svgIcon(c.icon, 18)}${c.title}</button>`).join('')}</div>
      <div class="st-rows"></div><div class="st-help"><h4></h4><p></p></div></div>`;
    const rowsEl = el.querySelector('.st-rows'), helpH = el.querySelector('.st-help h4'), helpP = el.querySelector('.st-help p');
    let cat = null;
    const showCat = id => {
      if (cat === id) return; cat = id;
      el.querySelectorAll('.st-cat').forEach(b => b.classList.toggle('on', b.dataset.c === id));
      const C = CATS.find(c => c.id === id);
      rowsEl.innerHTML = ''; rowsEl.scrollTop = 0;
      if (C.page) { C.page(rowsEl); setHelp(C.title, C.id === 'controls' ? 'Keyboard and gamepad bindings.' : 'Third-party assets used by HILLBOMB.'); return; }
      for (const r of C.rows) rowsEl.appendChild(r.sec ? secEl(r.sec) : rowEl(r));
      setHelp(C.title, '');
    };
    const refreshRows = () => rowsEl.querySelectorAll('.st-row').forEach(r => r._sync?.());
    const setHelp = (h, p) => { helpH.textContent = h; helpP.innerHTML = p; };
    function secEl(t) { const d = document.createElement('div'); d.className = 'st-sec'; d.textContent = t; return d; }
    function rowEl(r) {
      const d = document.createElement('div'); d.className = 'st-row'; d.setAttribute('data-nav', '');
      d.addEventListener('navfocus', () => setHelp(r.label, r.help || ''));
      if (r.action) { d.classList.add('st-act'); d.innerHTML = `<span>${esc(r.label)}</span>`; d.addEventListener('click', r.action); return d; }
      if (r.slider) {
        const [lo, hi, st] = r.slider;
        d.innerHTML = `<span>${esc(r.label)}</span><div class="st-val"><div class="st-slide"><i></i></div><span class="st-num"></span></div>`;
        const bar = d.querySelector('.st-slide'), fill = bar.firstChild, num = d.querySelector('.st-num');
        d._sync = () => { const v = r.get(); fill.style.width = (100 * (v - lo) / (hi - lo)) + '%'; num.textContent = r.fmt ? r.fmt(v) : v; };
        const setV = v => { v = Math.max(lo, Math.min(hi, Math.round(v / st) * st)); if (v !== r.get()) { r.set(v); d._sync(); ui._sound('hover'); } };
        d._adjust = dir => setV(r.get() + dir * st);
        let drag = false;
        const fromX = e => { const b = bar.getBoundingClientRect(); setV(lo + (hi - lo) * Math.max(0, Math.min(1, (e.clientX - b.left) / b.width))); };
        bar.addEventListener('mousedown', e => { drag = true; fromX(e); e.stopPropagation(); });
        addEventListener('mousemove', e => { if (drag) fromX(e); });
        addEventListener('mouseup', () => { drag = false; });
        d._sync();
        return d;
      }
      d.innerHTML = `<span>${esc(r.label)}</span><div class="st-val"><i class="ar" data-d="-1">${svgIcon('play', 12).replace('<svg', '<svg style="transform:scaleX(-1)"')}</i><div><b></b><div class="st-dots">${r.opts.map(() => '<i></i>').join('')}</div></div><i class="ar" data-d="1">${svgIcon('play', 12)}</i></div>`;
      const b = d.querySelector('b'), dots = [...d.querySelectorAll('.st-dots i')];
      let idx = 0;
      d._sync = () => { const v = r.get(); idx = Math.max(0, r.opts.findIndex(o => o[0] === v)); b.textContent = r.opts[idx][1]; dots.forEach((x, i) => x.classList.toggle('on', i === idx)); };
      d._adjust = dir => { idx = (idx + dir + r.opts.length) % r.opts.length; r.set(r.opts[idx][0]); d._sync(); if (r.get() === null || r.get() === undefined) { b.textContent = r.opts[idx][1]; dots.forEach((x, i) => x.classList.toggle('on', i === idx)); } ui._sound('hover'); };
      d.addEventListener('click', e => { const a = e.target.closest('.ar'); d._adjust(a ? +a.dataset.d : 1); });
      d._sync();
      return d;
    }
    function controlsPage(root) {
      const rows = [['Drive', 'Throttle / brake / reverse', 'W / S', 'RT / LT'], ['', 'Steer', 'A / D', 'Left stick'], ['', 'Handbrake', 'Space', 'A'], ['', 'Reset car', 'R', 'Hold View'], ['', 'Horn', 'H', 'L3'], ['', 'Lights', 'L', ''],
        ['Camera', 'Change view', 'C', 'R3'], ['', 'Look back', 'Q', 'RB'], ['', 'Orbit', 'Mouse', 'Right stick'],
        ['World', 'Enter / exit car', 'F', 'Y'], ['', 'Start event / interact', 'E', 'X'], ['', 'Map', 'M', 'View'], ['', 'Garage', 'G', 'D-pad up'], ['', 'Festival / campaign', 'Tab', 'D-pad down'], ['', 'Photo mode', 'V', 'Pause menu'], ['', 'Radio next / off', 'T / Y', 'D-pad right / left'], ['', 'Pause menu', 'Esc', 'Start'], ['', 'This controls list', 'F1', ''],
        ['On foot', 'Sprint / jump', 'Shift / Space', 'A'],
        ['Menus', 'Move', 'Arrows / WASD', 'D-pad / left stick'], ['', 'Select / back', 'Enter / Esc', 'A / B'], ['', 'Switch tab', 'Q / E', 'LB / RB'],
        ['Map', 'Pan / zoom', 'Drag, WASD / wheel, + -', 'Sticks / triggers'], ['', 'Waypoint / fast travel', 'X / F', 'X / Y'], ['', 'Filter / find me', 'R / C', 'L3 / R3']];
      root.innerHTML = `<div class="st-keys" data-nav tabindex="-1"><span class="h">Action</span><span class="h">Keyboard</span><span class="h">Gamepad</span>${rows.map(([g, a, k, p]) => `${g ? `<span class="h" style="grid-column:1/-1;padding-top:18px;border:0">${g}</span>` : ''}<span>${a}</span><span>${k ? `<kbd>${k}</kbd>` : ''}</span><span>${p ? `<kbd class="pad">${p}</kbd>` : ''}</span>`).join('')}</div>`;
      root.firstChild._vscroll = root;
    }
    function licensesPage(root) {
      root.innerHTML = `<div class="st-lic" data-nav tabindex="-1"><p>Loading…</p></div>`;
      const box = root.firstChild; box._vscroll = root;
      fetch(new URL('assets/ASSET_LICENSES.md', document.baseURI)).then(r => r.ok ? r.text() : Promise.reject(r.status)).then(md => {
        box.innerHTML = mdToHtml(md) + `<h3>Fonts</h3><ul><li><strong>Barlow Condensed</strong> and <strong>Inter</strong> via Google Fonts, SIL Open Font License 1.1.</li></ul><h3>Code</h3><ul><li><strong>three.js</strong> (MIT), <strong>postprocessing</strong> (Zlib), <strong>N8AO</strong> (CC0 / MIT).</li><li>Everything else in HILLBOMB (geometry, textures, audio, UI, icons) is generated procedurally by the game.</li></ul>`;
      }).catch(() => { box.innerHTML = '<p>Could not load the licenses file.</p>'; });
    }
    el.addEventListener('navfocus', e => { const c = e.target.closest?.('.st-cat'); if (c) showCat(c.dataset.c); });
    el.querySelectorAll('.st-cat').forEach(b => b.addEventListener('click', () => { showCat(b.dataset.c); const first = rowsEl.querySelector('[data-nav]'); if (first) nav.focus(first); }));
    showCat(G.ui._settingsCat || 'game'); G.ui._settingsCat = null;   // F1 opens straight on Controls
    return {
      onKey(e) {
        const f = el.querySelector('.focus');
        if (f && f._vscroll && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS')) { f._vscroll.scrollBy({ top: (e.code === 'ArrowUp' || e.code === 'KeyW') ? -90 : 90, behavior: 'smooth' }); return true; }
        if (f && f.classList.contains('st-cat') && (e.code === 'Enter' || e.code === 'Space')) { const first = rowsEl.querySelector('[data-nav]'); if (first) nav.focus(first); return true; }
        return false;
      },
      onBack() { const f = el.querySelector('.focus'); if (f && !f.classList.contains('st-cat')) { nav.focus(el.querySelector(`.st-cat[data-c="${cat}"]`)); return true; } return false; },
      hints: [['◀ ▶', 'Change', '◀ ▶']],
    };
  }
}

// minimal markdown: headings, bullets, bold, inline code, links, paragraphs
export function mdToHtml(md) {
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  let out = '', inList = false;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^(#{1,3})\s+(.*)/), li = line.match(/^\s*[*-]\s+(.*)/);
    if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    if (h) out += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
    else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}
