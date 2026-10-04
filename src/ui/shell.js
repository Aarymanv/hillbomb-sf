// UI shell: G.ui. Modal layer stack (menu / map / screens), pause handling, keyboard capture, gamepad -> key
// synthesis, focus navigation, map markers, notifications, fade-to-black and fast travel.
//
// API (created by createHud, so it exists before any sys_* module installs):
//   G.ui.markers.add({ id?, kind, x, z, title, sub, color?, icon?, shape?, minimap=true, bigmap=true, fastTravel=false,
//                      edge?, hidden?, done?, radius?, meta?, action?, onSelect?(marker, { setWaypoint, fastTravel, close }) }) -> id
//     (onSelect returning 'close' closes the map). update(id, patch), remove(id), get(id), list(filter?), clear(pred?)
//   G.ui.menu.addTab({ id, title|label, order, icon, build(el, nav) -> hooks? | onSelect(), visible?() }); open(tab?), close(), isOpen()
//   G.ui.screen.open(el, { onBack, pause=true, hud=false, nav=true, padKeys=true }) -> { close(), el, open }; closeAll(); top()
//     onBack() runs on Esc/B; unless it returns false the screen then closes.
//   G.ui.map.open({ focus: markerId | {x,z}, filter: group | [groups] }), close(), isOpen(), setWaypoint(x, z), clearWaypoint()
//   G.ui.slots.radio / G.ui.slots.activity: empty HUD containers
//   G.ui.notify({ title, sub, icon, color, ms, kind: 'good'|'bad'|'cop'|'radio'|'gold'|'info' })
//   G.ui.hudHidden = true hides the HUD (cutscenes); G.state === 'photo' hides it too
//   G.ui.travel(x, z, { yaw?, label?, fade=true }) -> Promise: fade out, snap to the nearest road lane, fade in
//   G.ui.fade(midFn, { outMs, inMs, hold, label }) -> Promise; G.ui.isModal(); G.ui.paused
//   Events: G.emit('ui:modal', bool), 'menu', 'map', 'teleport', 'fastTravel', 'settings'
//
// PAUSING
//   A layer opened with pause:true (menu, map, screens by default) sets G.state = 'paused' if it was 'play', and
//   restores 'play' when the last pausing layer closes. Other states ('photo', 'title', a state set by another
//   system) are left alone. main.js only runs G.update() when G.state === 'play', so the sim is frozen while paused.
//   G.ui.paused is true while the shell holds the pause. Pointer lock is released while any layer is open.
// INPUT
//   While any layer is open, every keydown is captured on document (capture phase) and never reaches the game's
//   input (keyup always passes through so held keys never get stuck). Arrow keys / WASD move focus between
//   [data-nav] elements of the top layer (class 'focus'), Enter/Space click it, Esc/Backspace go back, Q/E switch
//   tabs. Gamepad: d-pad / left stick = arrows, A = Enter, B = Esc, X = KeyX, Y = KeyY, LB/RB = Q/E, View = M,
//   Start = resume. Synthesized key events carry ev.hbPad = true. A theme.js makeNav() on a screen root still
//   works (it runs first, on window capture) and so gets gamepad support for free.
import { kindInfo, svgIcon, KINDS, ICONS } from './icons.js';
import { createMenu } from './menu.js';
import { createBigMap } from './bigmap.js';
import { edgePointAt } from '../world/roads.js';

const NAVKEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'confirm', NumpadEnter: 'confirm', Space: 'confirm', Escape: 'back', Backspace: 'back', KeyQ: 'tabPrev', KeyE: 'tabNext', PageUp: 'tabPrev', PageDown: 'tabNext' };
const PADKEYS = { 0: 'Enter', 1: 'Escape', 2: 'KeyX', 3: 'KeyY', 4: 'KeyQ', 5: 'KeyE', 8: 'KeyM', 10: 'KeyR', 11: 'KeyC', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

// ------------------------------------------------------------------ focus navigation over [data-nav]
// el._adjust(dir) on a focused element turns left/right into value changes (settings rows, sliders).
export function createFocus(root, { sound = null, hover = true } = {}) {
  let cur = null, hoverOn = hover;
  const visible = e => e.offsetParent !== null && !e.hasAttribute('disabled') && !e.closest('[data-nav-off]');
  const items = () => [...root.querySelectorAll('[data-nav]')].filter(visible);
  const F = {
    root,
    get current() { return cur; },
    items,
    focus(el, silent = false) {
      if (cur === el) return;
      cur?.classList.remove('focus');
      cur = el || null;
      if (!cur) return;
      cur.classList.add('focus');
      cur.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      cur.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
      if (!silent) sound?.('hover');
    },
    ensure() {
      if (cur && root.contains(cur) && visible(cur)) return;
      const list = items();
      F.focus(list.find(e => e.hasAttribute('data-nav-default')) || list[0] || null, true);
    },
    move(dx, dy) {
      if (cur && cur._adjust && dx && !dy && root.contains(cur)) { cur._adjust(dx); return true; }
      const list = items(); if (!list.length) return false;
      if (!cur || !list.includes(cur)) { F.focus(list[0]); return true; }
      const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = null, bs = Infinity;
      for (const e of list) {
        if (e === cur) continue;
        const b = e.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
        const along = (bx - ax) * dx + (by - ay) * dy;
        if (along <= 2) continue;
        // perpendicular gap between the two boxes (0 when they overlap on that axis)
        const gap = dx ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
        const perp = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
        const s = along + gap * 3 + perp * 0.35;
        if (s < bs) { bs = s; best = e; }
      }
      if (best) { F.focus(best); return true; }
      return false;
    },
    activate() { if (cur && root.contains(cur)) { cur.click(); return true; } return false; },
    clear() { cur?.classList.remove('focus'); cur = null; },
    enableHover() { hoverOn = true; },
  };
  root.addEventListener('mouseover', e => { if (!hoverOn) return; const t = e.target.closest?.('[data-nav]'); if (t && root.contains(t) && visible(t)) F.focus(t); });
  return F;
}

export function createShell(G, hud) {
  const sound = n => { try { G.audio?.ui?.(n); } catch { /* audio optional */ } };
  const host = document.createElement('div'); host.id = 'ui-layers'; document.body.appendChild(host);
  const fadeEl = document.createElement('div'); fadeEl.id = 'ui-fade'; fadeEl.innerHTML = '<div class="lbl"></div>'; document.body.appendChild(fadeEl);
  const stack = [];
  let pausedByUs = false, padGuard = false;

  // ---------------------------------------------------------------- layers
  // spec: { kind, el, pause, hideHud, onBack, onKey(e)->bool, onTab(dir), update(dt, pad), wantsStick(), onClose, focusRoot }
  function push(spec) {
    const L = { pause: true, hideHud: false, ...spec, open: true };
    clearTimeout(L.el._uiRemoveT);
    L.el.classList.remove('ui-out');
    L.el.classList.add('ui-layer');
    if (!L.el.parentNode || L.el.parentNode !== host) host.appendChild(L.el);
    L.focus = createFocus(L.focusRoot || L.el, { sound, hover: L.autoFocus !== false });
    L.close = () => close(L);
    stack.push(L);
    padGuard = true;
    sync();
    if (L.autoFocus !== false) setTimeout(() => L.open && L.focus.ensure(), 0);
    return L;
  }
  function close(L) {
    if (!L || !L.open) return;
    L.open = false;
    const i = stack.indexOf(L); if (i >= 0) stack.splice(i, 1);
    try { L.onClose?.(); } catch (e) { console.error('[ui] onClose', e); }
    if (L.keepEl) { L.el.classList.remove('ui-layer', 'ui-top'); if (L.el.parentNode === host) L.el.remove(); }
    else if (!stack.some(l => l.el === L.el)) {
      const el = L.el;
      el.classList.add('ui-out');
      clearTimeout(el._uiRemoveT);
      el._uiRemoveT = setTimeout(() => { if (!stack.some(l => l.el === el)) { el.remove(); el.classList.remove('ui-out'); } }, 180);
    }
    sync();
  }
  function back(L) {
    if (!L) return;
    sound('back');
    if (L.onBack) { let r; try { r = L.onBack(); } catch (e) { console.error('[ui] onBack', e); } if (r !== false && L.open) close(L); }
    else close(L);
  }
  function sync() {
    const wantPause = stack.some(l => l.pause);
    if (wantPause && !pausedByUs && G.state === 'play') { G.state = 'paused'; pausedByUs = true; }
    else if (!wantPause && pausedByUs) { if (G.state === 'paused') G.state = 'play'; pausedByUs = false; }
    if (stack.length) { try { if (document.pointerLockElement) document.exitPointerLock?.(); } catch { /* not locked */ } if (G.input) G.input.wantPointerLock = false; }
    else if (G.input && G.state === 'play') G.input.wantPointerLock = true;
    stack.forEach((l, i) => l.el.classList.toggle('ui-top', i === stack.length - 1));
    document.body.classList.toggle('ui-modal', stack.length > 0);
    G.emit?.('ui:modal', stack.length > 0);
  }
  const top = () => stack[stack.length - 1] || null;

  // ---------------------------------------------------------------- keyboard capture
  const isTyping = t => t && t.matches?.('input[type=text],input[type=search],input:not([type]),textarea,[contenteditable=""],[contenteditable=true]');
  function onKeyDown(e) {
    const synth = !!e.hbPad;
    if (!stack.length) { if (synth) e.stopPropagation(); return; }
    if (!synth && (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code))) return;
    e.stopPropagation();
    const L = top();
    if (isTyping(e.target) && e.code !== 'Escape' && e.code !== 'Enter') return;
    try { if (L.onKey && L.onKey(e) === true) { e.preventDefault(); return; } } catch (err) { console.error('[ui] onKey', err); }
    const act = NAVKEYS[e.code];
    if (!act) return;
    e.preventDefault();
    if (e.repeat && (act === 'confirm' || act === 'back' || act === 'tabPrev' || act === 'tabNext')) return;
    if (act === 'back') back(L);
    else if (act === 'confirm') { if (!L.focus.current) { L.focus.ensure(); L.focus.enableHover(); } else if (L.focus.activate()) sound('click'); }
    else if (act === 'tabPrev' || act === 'tabNext') L.onTab?.(act === 'tabPrev' ? -1 : 1);
    else { L.focus.enableHover(); const [dx, dy] = act === 'up' ? [0, -1] : act === 'down' ? [0, 1] : act === 'left' ? [-1, 0] : [1, 0]; L.focus.move(dx, dy); }
  }
  document.addEventListener('keydown', onKeyDown, true);

  // ---------------------------------------------------------------- gamepad
  let prevBtn = [], rep = { code: null, t: 0 }, lastPadActive = 0;
  const pad = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, held: () => false };
  const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
  function synth(code) {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
    const ev = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
    ev.hbPad = true;
    const t = document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement ? document.activeElement : document.body;
    t.dispatchEvent(ev);
  }
  function pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null; for (const q of pads) if (q && q.connected) { p = q; break; }
    pad.connected = !!p;
    if (!p) { prevBtn = []; return; }
    const btn = i => !!(p.buttons[i] && p.buttons[i].pressed);
    pad.lx = dz(p.axes[0] || 0); pad.ly = dz(p.axes[1] || 0); pad.rx = dz(p.axes[2] || 0); pad.ry = dz(p.axes[3] || 0);
    pad.lt = p.buttons[6]?.value || 0; pad.rt = p.buttons[7]?.value || 0;
    pad.held = btn;
    const now = p.buttons.map(b => b.pressed);
    if (now.some(Boolean) || Math.abs(pad.lx) + Math.abs(pad.ly) + Math.abs(pad.rx) + Math.abs(pad.ry) > 0) lastPadActive = performance.now();
    const L = top();
    const foreign = !L && G.state === 'paused' && G.interiors?.ui?.open; // interiors menus get d-pad/A/B too
    // layers whose owner polls the gamepad itself opt out (padKeys:false); festival screens (.hf-root) poll their own pad
    const ownPad = L && (L.padKeys === false || L.el.classList.contains('hf-root') || !!L.el.querySelector?.('.hf-root'));
    if ((L || foreign) && !padGuard && !ownPad) {
      for (const [i, code] of Object.entries(PADKEYS)) {
        if (!now[i] || prevBtn[i]) continue;
        if (foreign && !['Enter', 'Escape'].includes(code) && !DIRS[code]) continue;
        if (DIRS[code]) { rep.code = code; rep.t = 0.38; }
        synth(code);
      }
      if (now[9] && !prevBtn[9] && L) { if (L.kind === 'menu' || L.kind === 'map') close(L); else synth('Escape'); }
      // left stick -> arrows (with repeat) unless the layer uses the stick itself (map panning)
      const stickFree = !(L && L.wantsStick?.());
      let dir = null;
      for (const [i, code] of [[12, 'ArrowUp'], [13, 'ArrowDown'], [14, 'ArrowLeft'], [15, 'ArrowRight']]) if (now[i]) dir = code;
      if (!dir && stickFree) { if (Math.abs(pad.ly) > 0.5 && Math.abs(pad.ly) >= Math.abs(pad.lx)) dir = pad.ly < 0 ? 'ArrowUp' : 'ArrowDown'; else if (Math.abs(pad.lx) > 0.5) dir = pad.lx < 0 ? 'ArrowLeft' : 'ArrowRight'; }
      if (dir) {
        if (rep.code !== dir) { rep.code = dir; rep.t = 0.38; if (!(now[12] || now[13] || now[14] || now[15])) synth(dir); }
        else { rep.t -= dt; if (rep.t <= 0) { rep.t = 0.085; synth(dir); } }
      } else rep.code = null;
    }
    padGuard = false;
    prevBtn = now;
  }
  const usingPad = () => performance.now() - lastPadActive < 4000 && (G.input?.device === 'pad' || pad.connected);

  // ---------------------------------------------------------------- notifications
  const nWrap = hud.notifyEl;
  const queue = [], live = [];
  const KIND_COL = { good: '#39e07a', cop: '#3a7bff', radio: '#8f7bff', bad: '#ff4d5e', gold: '#ffc247', info: '#d6d0c4' };
  const KIND_IC = { good: 'check', cop: 'shield', radio: 'note', bad: 'cross', gold: 'trophy', info: 'info' };
  function notify(o = {}) {
    const n = { title: '', sub: '', icon: null, color: null, ms: 4200, ...o };
    const dupe = live.find(c => c.n.title === n.title && c.n.sub === n.sub);
    if (dupe) { restartTimer(dupe); return; }
    if (queue.some(q => q.title === n.title && q.sub === n.sub)) return;
    queue.push(n); pump();
  }
  function pump() {
    while (live.length < 3 && queue.length) show(queue.shift());
  }
  function show(n) {
    const col = n.color || KIND_COL[n.kind] || 'var(--ui-acc)';
    const ic = n.icon || KIND_IC[n.kind] || 'info';
    const el = document.createElement('div');
    el.className = 'nt';
    el.style.setProperty('--c', col);
    el.innerHTML = `<div class="nt-ic">${svgIcon(ic, 22)}</div><div class="nt-tx"><b></b>${n.sub ? '<span></span>' : ''}</div><i class="nt-bar"></i>`;
    el.querySelector('b').innerHTML = n.title;
    if (n.sub) el.querySelector('span').innerHTML = n.sub;
    nWrap.appendChild(el);
    const c = { n, el, t: null };
    live.push(c);
    restartTimer(c);
  }
  function restartTimer(c) {
    clearTimeout(c.t);
    const bar = c.el.querySelector('.nt-bar');
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = `nt-drain ${c.n.ms}ms linear forwards`;
    c.t = setTimeout(() => dismiss(c), c.n.ms);
  }
  function dismiss(c) {
    const i = live.indexOf(c); if (i < 0) return;
    live.splice(i, 1);
    c.el.classList.add('out');
    setTimeout(() => { c.el.remove(); pump(); }, 260);
  }

  // ---------------------------------------------------------------- markers
  const markers = new Map();
  let seq = 0;
  const M = {
    version: 0,
    add(spec = {}) {
      const id = spec.id ?? ('mk' + (++seq));
      const k = kindInfo(spec.kind);
      const m = { minimap: true, bigmap: true, fastTravel: false, ...spec, id };
      m._icon = spec.icon; m._color = spec.color; m._shape = spec.shape; m._group = spec.group;
      resolve(m, k);
      markers.set(id, m); M.version++;
      return id;
    },
    update(id, patch = {}) {
      const m = markers.get(id); if (!m) return false;
      for (const f of ['icon', 'color', 'shape', 'group']) if (f in patch) m['_' + f] = patch[f];
      Object.assign(m, patch);
      resolve(m, kindInfo(m.kind));
      M.version++;
      return true;
    },
    remove(id) { const r = markers.delete(id); if (r) M.version++; return r; },
    get(id) { return markers.get(id) || null; },
    list(filter) {
      const out = [...markers.values()];
      if (!filter) return out;
      if (typeof filter === 'function') return out.filter(filter);
      return out.filter(m => (!filter.kind || m.kind === filter.kind) && (!filter.group || m.group === filter.group));
    },
    clear(pred) { for (const [id, m] of markers) if (!pred || pred(m)) markers.delete(id); M.version++; },
  };
  function resolve(m, k) {
    const ic = m._icon;
    m.icon = ic && (ICONS[ic] || String(ic).length <= 2) ? ic : k.icon; // unknown icon names fall back to the kind's icon
    m.color = m._color ?? k.color; m.shape = m._shape ?? k.shape; m.group = m._group ?? (m.fastTravel && !KINDS[m.kind] ? 'fasttravel' : k.group);
    m.kindLabel = m.kindLabel || k.label;
  }

  // ---------------------------------------------------------------- fade + fast travel
  let fading = false;
  function fade(mid, { outMs = 320, inMs = 480, hold = 160, label = '' } = {}) {
    return new Promise(res => {
      if (fading) { try { mid?.(); } catch (e) { console.error(e); } res(); return; }
      fading = true;
      fadeEl.querySelector('.lbl').textContent = label;
      fadeEl.style.transitionDuration = outMs + 'ms';
      fadeEl.classList.add('on');
      setTimeout(() => {
        try { mid?.(); } catch (e) { console.error('[ui] fade', e); }
        setTimeout(() => { fadeEl.style.transitionDuration = inMs + 'ms'; fadeEl.classList.remove('on'); setTimeout(() => { fading = false; res(); }, inMs); }, hold);
      }, outMs);
    });
  }
  // nearest road point, right-hand lane, oriented along the road; the player's car (or the player on foot) is moved there
  function roadSpot(x, z, radius = 400) {
    const g = G.world.graph;
    const n = g.nearestEdge(x, z, radius) || g.nearestEdge(x, z, radius * 4);
    if (!n) return { x, z, yaw: 0, y: G.world.groundAt(x, z, 999) };
    const e = n.edge, o = {};
    edgePointAt(e, Math.max(0.5, Math.min(e.len - 0.5, n.s ?? 0)), o);
    let dx = o.dx ?? 0, dz = o.dz ?? -1;
    const px = o.x ?? n.x, pz = o.z ?? n.z;
    const off = e.oneway ? 0 : (e.median || 0) + (e.laneW || 3) * 0.5;
    const sx = px + -dz * off, sz = pz + dx * off; // right-hand lane
    const yaw = Math.atan2(-dx, -dz);
    const y = o.y != null ? o.y : G.world.groundAt(sx, sz, 999);
    return { x: sx, z: sz, yaw, y, edge: e };
  }
  function teleport(x, z, opts = {}) {
    const P = G.player;
    const spot = opts.exact ? { x, z, yaw: opts.yaw ?? 0, y: G.world.groundAt(x, z, 999) } : roadSpot(x, z);
    if (opts.yaw != null) spot.yaw = opts.yaw;
    // clear traffic parked on the spot
    try { for (const c of (G.traffic?.cars || []).slice()) if (Math.hypot(c.v.pos.x - spot.x, c.v.pos.z - spot.z) < 14) { G.traffic.removeCar(c.v); G.removeVehicle(c.v); } } catch { /* traffic optional */ }
    if (P.vehicle) { const y = G.world.groundAt(spot.x, spot.z, (spot.y ?? 0) + 3) + 0.4; P.vehicle.place(spot.x, y, spot.z, spot.yaw); }
    else { P.pos.set(spot.x, G.world.groundAt(spot.x, spot.z, (spot.y ?? 0) + 3), spot.z); P.vel?.set?.(0, 0, 0); P.yaw = spot.yaw; }
    if (G.rig?.rig) { G.rig.rig.orbitYaw = P.vehicle ? 0 : spot.yaw; G.rig.rig.orbitPitch = 0; }
    G.rig?.snap?.();
    if (G.gps?.target && Math.hypot(G.gps.target.x - spot.x, G.gps.target.z - spot.z) < 60) G.gps.setTarget(null);
    else if (G.gps) G.gps.timer = 0;
    G.emit?.('teleport', spot);
    return spot;
  }
  async function travel(x, z, opts = {}) {
    if (opts.fade === false) return teleport(x, z, opts);
    let spot = null;
    await fade(() => { spot = teleport(x, z, opts); }, { label: opts.label ?? 'Fast travel', hold: 260 });
    return spot;
  }

  // ---------------------------------------------------------------- assemble
  const ui = {
    slots: hud.slots,
    tiles: hud.tiles,
    hudHidden: false,
    get paused() { return pausedByUs; },
    notify,
    markers: M,
    fade, travel, teleport, roadSpot,
    pad, usingPad,
    isModal: () => stack.length > 0,
    layers: () => stack.slice(),
    _push: push, _close: close, _back: back, _top: top, _sound: sound, _stack: stack,
    tick(dt) { pollPad(dt); const L = top(); if (L?.update) { try { L.update(dt, pad); } catch (e) { console.error('[ui] layer update', e); } } ui.map._tick?.(dt); },
    get hudHiddenNow() { return ui.hudHidden || stack.some(l => l.hideHud) || G.state === 'photo' || G.state === 'title'; },
  };
  // screens: full-screen modal layer for other modules' screens (event card, results, garage...)
  ui.screen = {
    open(el, { onBack = null, pause = true, hud = false, nav = true, padKeys = true } = {}) {
      if (!(el instanceof HTMLElement)) { const d = document.createElement('div'); d.innerHTML = String(el ?? ''); el = d; }
      el.classList.add('ui-scr');
      const L = push({ kind: 'screen', el, pause, hideHud: !hud, onBack, padKeys, autoFocus: false, focusRoot: nav ? el : document.createElement('div') });
      return { el, close: () => close(L), get open() { return L.open; }, focus: e => L.focus.focus(e), refresh: () => L.focus.ensure() };
    },
    closeAll() { for (const L of stack.slice().reverse()) if (L.kind === 'screen') close(L); },
    top() { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === 'screen') return stack[i].el; return null; },
  };
  G.ui = ui;
  ui.menu = createMenu(G, ui);
  ui.map = createBigMap(G, ui);
  return ui;
}
