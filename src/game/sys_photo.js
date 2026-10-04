// Photo mode (G.state = 'photo') + weather wiring.
//  * freezes the game (physics, traffic, particles, rain, water, clock), hides the HUD, frees the mouse
//  * orbit camera around the car, or a free camera constrained to 45 m around it (never below the ground)
//  * FOV, roll, focus (auto on the car or manual) + aperture (bokeh DOF), exposure, time of day, weather, colour looks,
//    grain, vignette, letterbox, capture size (screen / 2x / 4K) -> PNG download grabbed right after the render
// Keys: V toggles photo mode (O belongs to the radio/Spotify module). Inside: WASD move, mouse drag look/orbit, wheel zoom, Q/E down/up, Z/X roll, Shift fast,
//   Arrow Up/Down pick a setting, Arrow Left/Right change it, Enter/Space capture, H hide panel, Tab orbit/free, Esc/V exit.
// Gamepad: L3+R3 (both stick clicks) enters. LS move, RS look, LT/RT down/up (orbit: zoom), LB/RB roll, D-pad settings,
//   A capture, B exit, Y hide panel, X orbit/free.
// API: G.photo = { enter(), exit(), active, capture() }.
import * as THREE from 'three';
import { injectTheme } from '../ui/theme.js';
import { LOOKS, applyLook, downloadCanvas, stampName } from '../render/photo/looks.js';

export const PHOTO_KEY = 'KeyV';
const FSTOPS = [0, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];          // 0 = DOF off
const WEATHERS = ['clear', 'fog', 'overcast', 'rain', 'storm'];
const BARS = [['Off', 0], ['2.39 : 1', 2.39], ['1.85 : 1', 1.85], ['4 : 5', 0.8]];
const SIZES = [['Screen', 1], ['2x', 2], ['4K', 'uhd']];

export function install(G) {
  // ---------------------------------------------------------------- weather (render/weather.js lives on the environment)
  const W = G.env?.weather;
  if (W) { G.weather = W; W.attach(G); }

  injectTheme();
  const env = G.env, post = G.post, camera = G.camera, renderer = G.renderer;
  const S = {
    mode: 'orbit', fov: 50, roll: 0, autoFocus: true, focus: 8, fstop: 3, ev: 0, hours: 12, weather: 0,
    look: 0, grain: 0.2, vignette: 0.35, bars: 0, size: 0, panel: true,
  };
  const P = {
    active: false, prevState: 'play', prevHours: 12, prevPaused: false, prevWeather: 'clear', weatherTouched: false, timeTouched: false,
    target: new THREE.Vector3(), yaw: 0, pitch: 0.2, dist: 7, pos: new THREE.Vector3(), fyaw: 0, fpitch: 0,
    keys: new Set(), drag: null, mdx: 0, mdy: 0, wheel: 0, padPrev: [], sel: 0, pending: null, flashT: 0,
  };
  G.photo = { enter, exit, capture, get active() { return P.active; }, settings: S };

  // ---------------------------------------------------------------- panel
  const ROWS = [
    { id: 'mode', label: 'Camera', get: () => S.mode === 'orbit' ? 'Orbit' : 'Free', step: () => setMode(S.mode === 'orbit' ? 'free' : 'orbit') },
    { id: 'fov', label: 'Field of view', get: () => `${Math.round(S.fov)}°`, step: d => { S.fov = clamp(S.fov + d * 2, 12, 100); } },
    { id: 'roll', label: 'Roll', get: () => `${Math.round(S.roll)}°`, step: d => { S.roll = clamp(S.roll + d, -45, 45); } },
    { id: 'focus', label: 'Focus', get: () => S.autoFocus ? `Auto · ${focusDist().toFixed(1)} m` : `${S.focus.toFixed(S.focus < 10 ? 1 : 0)} m`, step: d => {
      if (S.autoFocus && d < 0) return; if (S.autoFocus) { S.autoFocus = false; S.focus = focusDist(); }
      S.focus = clamp(S.focus * Math.pow(1.12, d), 0.5, 800); if (S.focus <= 0.5 && d < 0) S.autoFocus = true; } },
    { id: 'autofocus', label: 'Autofocus on car', get: () => S.autoFocus ? 'On' : 'Off', step: () => { S.autoFocus = !S.autoFocus; if (!S.autoFocus) S.focus = focusDist(); } },
    { id: 'fstop', label: 'Aperture', get: () => FSTOPS[S.fstop] ? `f/${FSTOPS[S.fstop]}` : 'Off (all sharp)', step: d => { S.fstop = clamp(S.fstop + d, 0, FSTOPS.length - 1); } },
    { id: 'ev', label: 'Exposure', get: () => `${S.ev > 0 ? '+' : ''}${S.ev.toFixed(2)} EV`, step: d => { S.ev = clamp(S.ev + d * 0.25, -3, 3); } },
    { id: 'hours', label: 'Time of day', get: () => fmtHours(S.hours), step: d => { S.hours = (S.hours + d * 0.25 + 24) % 24; P.timeTouched = true; } },
    { id: 'weather', label: 'Weather', get: () => cap(WEATHERS[S.weather]), step: d => { S.weather = (S.weather + d + WEATHERS.length) % WEATHERS.length; P.weatherTouched = true; G.weather?.set(WEATHERS[S.weather], { transition: 0 }); } },
    { id: 'look', label: 'Filter', get: () => LOOKS[S.look].name, step: d => { S.look = (S.look + d + LOOKS.length) % LOOKS.length; } },
    { id: 'grain', label: 'Film grain', get: () => `${Math.round(S.grain * 100)}%`, step: d => { S.grain = clamp(S.grain + d * 0.1, 0, 1); } },
    { id: 'vignette', label: 'Vignette', get: () => `${Math.round(S.vignette * 100)}%`, step: d => { S.vignette = clamp(S.vignette + d * 0.1, 0, 1); } },
    { id: 'bars', label: 'Letterbox', get: () => BARS[S.bars][0], step: d => { S.bars = (S.bars + d + BARS.length) % BARS.length; } },
    { id: 'size', label: 'Capture size', get: () => SIZES[S.size][0], step: d => { S.size = (S.size + d + SIZES.length) % SIZES.length; } },
    { id: 'shoot', label: 'Take photo', get: () => 'Enter', act: () => capture() },
    { id: 'exit', label: 'Exit photo mode', get: () => 'Esc', act: () => exit() },
  ];
  const root = document.createElement('div');
  root.id = 'hb-photo';
  root.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;font-family:var(--ui-sans);color:var(--ui-ink);display:none';
  root.innerHTML = `
    <style>
      #hb-photo .pp{position:absolute;right:28px;top:28px;width:340px;pointer-events:auto;padding:16px 16px 12px;max-height:calc(100vh - 56px);overflow:auto}
      #hb-photo .row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font:600 14px/1.2 var(--ui-sans)}
      #hb-photo .row .l{flex:1;color:var(--ui-dim)} #hb-photo .row .v{min-width:120px;text-align:center;font:italic 800 17px/1 var(--ui-cond);text-transform:uppercase}
      #hb-photo .row .a{width:22px;height:22px;border:0;border-radius:3px;background:var(--ui-glass);color:var(--ui-ink);cursor:pointer;font:700 12px/1 var(--ui-sans)}
      #hb-photo .row.focus{background:rgba(255,46,126,.16);box-shadow:inset 3px 0 0 var(--ui-acc)} #hb-photo .row.focus .l{color:var(--ui-ink)}
      #hb-photo .row.btn .v{color:var(--ui-acc2)}
      #hb-photo .keys{position:absolute;left:28px;bottom:24px;display:flex;flex-wrap:wrap;gap:14px;font:600 12px/1 var(--ui-sans);color:var(--ui-dim);pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.6)}
      #hb-photo .flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .45s ease-out;pointer-events:none}
      #hb-photo .toast{position:absolute;left:50%;top:26px;transform:translateX(-50%);padding:10px 16px;opacity:0;transition:opacity .3s}
      #hb-photo.nopanel .pp,#hb-photo.nopanel .keys{display:none}
    </style>
    <div class="ui-panel pp"><div class="ui-h2" style="margin-bottom:4px">Photo mode</div><div class="ui-h3" style="margin-bottom:10px">Game paused</div><div class="rows"></div></div>
    <div class="keys">
      <span><span class="ui-key">W A S D</span> move</span><span><span class="ui-key">Drag</span> look</span><span><span class="ui-key">Wheel</span> zoom</span>
      <span><span class="ui-key">Q</span><span class="ui-key">E</span> down / up</span><span><span class="ui-key">Z</span><span class="ui-key">X</span> roll</span>
      <span><span class="ui-key">↑ ↓ ← →</span> settings</span><span><span class="ui-key">Enter</span> photo</span><span><span class="ui-key">H</span> hide panel</span><span><span class="ui-key">Esc</span> exit</span>
    </div>
    <div class="ui-panel toast"></div>
    <div class="flash"></div>`;
  document.body.appendChild(root);
  const rowsEl = root.querySelector('.rows');
  rowsEl.innerHTML = ROWS.map((r, i) => `<div class="row ${r.act ? 'btn' : ''}" data-i="${i}">${r.act ? '' : '<button class="a" data-d="-1">◀</button>'}<span class="l">${r.label}</span><span class="v"></span>${r.act ? '' : '<button class="a" data-d="1">▶</button>'}</div>`).join('');
  const rowEls = [...rowsEl.querySelectorAll('.row')];
  rowsEl.addEventListener('click', e => {
    const row = e.target.closest('.row'); if (!row) return;
    const i = +row.dataset.i; P.sel = i;
    const b = e.target.closest('button'); const r = ROWS[i];
    if (r.act) r.act(); else if (b) r.step(+b.dataset.d); else r.step(1);
    G.audio?.ui?.('click'); refresh();
  });
  rowsEl.addEventListener('wheel', e => { const row = e.target.closest('.row'); if (!row) return; e.stopPropagation(); const r = ROWS[+row.dataset.i]; if (r.step) { r.step(e.deltaY < 0 ? 1 : -1); refresh(); } }, { passive: true });
  function refresh() {
    rowEls.forEach((el, i) => { el.classList.toggle('focus', i === P.sel); el.querySelector('.v').textContent = ROWS[i].get(); });
  }
  function toast(t) { const el = root.querySelector('.toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => { el.style.opacity = 0; }, 1800); }

  // ---------------------------------------------------------------- enter / exit
  function focusTarget(out) {
    const v = G.player?.vehicle;
    if (v) out.set(v.root.position.x, v.root.position.y + (v.spec?.height || 1.4) * 0.55, v.root.position.z);
    else { const p = G.player?.pos; out.set(p.x, p.y + 1.1, p.z); }
    return out;
  }
  const _v = new THREE.Vector3(), _q = new THREE.Vector3();
  function focusDist() { return camera.position.distanceTo(focusTarget(_q)); }
  function enter() {
    if (P.active || !['play', 'paused'].includes(G.state) || G.renderOverride) return;
    if (G.state === 'paused') return; // open it from gameplay (the pause menu owns that state)
    P.active = true; P.prevState = G.state; G.state = 'photo';
    P.prevHours = env.state.hours; P.prevPaused = env.state.paused; P.prevWeather = G.weather?.kind; P.weatherTouched = false; P.timeTouched = false;
    env.state.paused = true;
    S.hours = env.state.hours; S.fov = camera.fov; S.roll = 0; S.ev = 0;
    S.weather = Math.max(0, WEATHERS.indexOf(G.weather?.kind || 'clear'));
    focusTarget(P.target);
    _v.copy(camera.position).sub(P.target);
    P.dist = clamp(_v.length(), 2, 30); P.yaw = Math.atan2(_v.x, _v.z); P.pitch = Math.asin(clamp(_v.y / Math.max(1e-3, _v.length()), -0.2, 1.3));
    P.pos.copy(camera.position);
    camera.getWorldDirection(_v); P.fyaw = Math.atan2(-_v.x, -_v.z); P.fpitch = Math.asin(clamp(_v.y, -0.99, 0.99));
    P.prevHudHidden = G.ui?.hudHidden;
    G.hud?.setVisible?.(false); if (G.ui) G.ui.hudHidden = true;
    try { document.exitPointerLock?.(); } catch { /* not locked */ }
    G.input.wantPointerLock = false;
    G.cameraOverride = { update: updateCamera };
    root.style.display = ''; root.classList.toggle('nopanel', !S.panel);
    P.keys.clear(); P.mdx = P.mdy = P.wheel = 0;
    refresh();
    G.emit?.('photo', true);
  }
  function exit() {
    if (!P.active) return;
    P.active = false;
    G.state = P.prevState === 'photo' ? 'play' : P.prevState;
    if (G.cameraOverride?.update === updateCamera) G.cameraOverride = null;
    env.state.paused = P.prevPaused;
    if (P.timeTouched) env.state.hours = P.prevHours;
    if (P.weatherTouched && P.prevWeather) G.weather?.set(P.prevWeather, { transition: 0 });
    env.state.exposureMul = 1;
    if (post.dof) post.dof.enabled = false;
    post.finish.enabled = false;
    camera.up.set(0, 1, 0);
    if (P.pending) { P.pending = null; if (restoreSize) { restoreSize(); restoreSize = null; } }
    G.hud?.setVisible?.(true); if (G.ui) G.ui.hudHidden = !!P.prevHudHidden;
    G.input.wantPointerLock = true;
    root.style.display = 'none';
    G.emit?.('photo', false);
  }
  function setMode(m) {
    if (m === S.mode) return;
    if (m === 'free') { P.pos.copy(camera.position); camera.getWorldDirection(_v); P.fyaw = Math.atan2(-_v.x, -_v.z); P.fpitch = Math.asin(clamp(_v.y, -0.99, 0.99)); }
    else { focusTarget(P.target); _v.copy(camera.position).sub(P.target); P.dist = clamp(_v.length(), 1.5, 30); P.yaw = Math.atan2(_v.x, _v.z); P.pitch = Math.asin(clamp(_v.y / Math.max(1e-3, _v.length()), -0.2, 1.3)); }
    S.mode = m;
  }

  // ---------------------------------------------------------------- capture (grabbed right after the composite)
  let restoreSize = null;
  function capture() {
    if (!P.active || P.pending) return;
    const sz = SIZES[S.size][1];
    const pr0 = renderer.getPixelRatio();
    let pr = pr0;
    if (sz === 2) pr = pr0 * 2;
    else if (sz === 'uhd') pr = Math.max(pr0, 3840 / Math.max(1, innerWidth));
    pr = Math.min(pr, 4096 / Math.max(1, innerWidth), 4096 / Math.max(1, innerHeight) * 1.0);
    if (pr !== pr0) {
      renderer.setPixelRatio(pr); post.composer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight);
      restoreSize = () => { renderer.setPixelRatio(pr0); post.composer.setPixelRatio(pr0); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); };
    }
    root.classList.add('nopanel');
    P.pending = { frames: pr !== pr0 ? 2 : 1 };   // give AO / reflections a frame at the new size
  }
  post.onAfterRender(r => {
    if (!P.pending) return;
    if (--P.pending.frames > 0) return;
    const canvas = r.domElement, w = canvas.width, h = canvas.height;
    const name = stampName();
    downloadCanvas(canvas, name).then(blob => { toast(blob ? `Saved ${name} · ${w}×${h}` : 'Capture failed'); });
    P.pending = null;
    if (restoreSize) { const f = restoreSize; restoreSize = null; setTimeout(f, 0); }
    root.classList.toggle('nopanel', !S.panel);
    const fl = root.querySelector('.flash'); fl.style.transition = 'none'; fl.style.opacity = 0.85; requestAnimationFrame(() => { fl.style.transition = 'opacity .45s ease-out'; fl.style.opacity = 0; });
    G.audio?.ui?.('confirm');
  });

  // ---------------------------------------------------------------- input (own listeners; the game's input is frozen)
  const canvas = renderer.domElement;
  addEventListener('keydown', e => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
    if (!P.active) {
      if (e.code === PHOTO_KEY && G.state === 'play' && !e.repeat) { e.preventDefault(); enter(); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    P.keys.add(e.code);
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    const r = ROWS[P.sel];
    switch (e.code) {
      case 'Escape': case PHOTO_KEY: exit(); return;
      case 'ArrowUp': P.sel = (P.sel + ROWS.length - 1) % ROWS.length; break;
      case 'ArrowDown': P.sel = (P.sel + 1) % ROWS.length; break;
      case 'ArrowLeft': r.step?.(-1); break;
      case 'ArrowRight': r.step?.(1); break;
      case 'Enter': case 'Space': if (r.act && r.id !== 'shoot') r.act(); else capture(); break;
      case 'KeyH': S.panel = !S.panel; root.classList.toggle('nopanel', !S.panel); break;
      case 'Tab': setMode(S.mode === 'orbit' ? 'free' : 'orbit'); break;
      default: break;
    }
    refresh();
  }, true);
  addEventListener('keyup', e => { if (P.active) { P.keys.delete(e.code); e.stopPropagation(); } }, true);
  addEventListener('blur', () => P.keys.clear());
  canvas.addEventListener('pointerdown', e => { if (!P.active) return; P.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); });
  addEventListener('pointermove', e => { if (!P.active || !P.drag) return; P.mdx += e.clientX - P.drag.x; P.mdy += e.clientY - P.drag.y; P.drag.x = e.clientX; P.drag.y = e.clientY; });
  addEventListener('pointerup', () => { P.drag = null; });
  canvas.addEventListener('wheel', e => { if (P.active) P.wheel += Math.sign(e.deltaY); }, { passive: true });

  function pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
  // gamepad entry (L3 + R3) is polled from the photo system's own update (runs every frame via G.systems)
  G.systems.push({
    update() {
      if (P.active) return;
      const p = pad(); if (!p) { P.padPrev = []; return; }
      const b = p.buttons.map(x => x.pressed);
      if (b[10] && b[11] && !(P.padPrev[10] && P.padPrev[11]) && G.state === 'play') enter();
      P.padPrev = b;
    },
  });

  // ---------------------------------------------------------------- camera
  const _f = new THREE.Vector3(), _r = new THREE.Vector3();
  function updateCamera(cam, dt) {
    if (!P.active) return;
    dt = Math.min(dt, 0.1);
    const p = pad(); let lx = 0, ly = 0, rx = 0, ry = 0, lt = 0, rt = 0;
    if (p) {
      lx = dz(p.axes[0] || 0); ly = dz(p.axes[1] || 0); rx = dz(p.axes[2] || 0); ry = dz(p.axes[3] || 0);
      lt = p.buttons[6]?.value || 0; rt = p.buttons[7]?.value || 0;
      const b = p.buttons.map(x => x.pressed), prev = P.padPrev, hit = i => b[i] && !prev[i];
      if (hit(1)) { exit(); P.padPrev = b; return; }
      if (hit(0)) capture();
      if (hit(3)) { S.panel = !S.panel; root.classList.toggle('nopanel', !S.panel); }
      if (hit(2)) setMode(S.mode === 'orbit' ? 'free' : 'orbit');
      if (hit(12)) P.sel = (P.sel + ROWS.length - 1) % ROWS.length;
      if (hit(13)) P.sel = (P.sel + 1) % ROWS.length;
      if (hit(14)) ROWS[P.sel].step?.(-1);
      if (hit(15)) ROWS[P.sel].step?.(1);
      if (b[4]) S.roll = clamp(S.roll - dt * 30, -45, 45);
      if (b[5]) S.roll = clamp(S.roll + dt * 30, -45, 45);
      if ([0, 1, 2, 3, 12, 13, 14, 15].some(hit)) refresh();
      P.padPrev = b;
    }
    const K = P.keys, key = c => (K.has(c) ? 1 : 0);
    const fast = K.has('ShiftLeft') || K.has('ShiftRight') ? 3 : 1;
    const mvX = key('KeyD') - key('KeyA') + lx, mvZ = key('KeyW') - key('KeyS') - ly, mvY = key('KeyE') - key('KeyQ') + rt - lt;
    if (K.has('KeyZ')) S.roll = clamp(S.roll - dt * 30, -45, 45);
    if (K.has('KeyX')) S.roll = clamp(S.roll + dt * 30, -45, 45);
    const look = { x: P.mdx * 0.004 + rx * dt * 2.2, y: P.mdy * 0.004 + ry * dt * 1.8 };
    P.mdx = P.mdy = 0;
    focusTarget(P.target);
    const ground = (x, z, y) => G.world.groundAt(x, z, y + 2) + 0.3;
    if (S.mode === 'orbit') {
      P.yaw -= look.x + mvX * dt * 1.2; P.pitch = clamp(P.pitch + look.y + mvZ * dt * 0.8, -0.25, 1.4);
      P.dist = clamp(P.dist * Math.pow(1.1, P.wheel) * (1 - mvY * dt * 0.8), 1.2, 35);   // wheel, Q/E, LT/RT zoom
      _v.set(Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)).multiplyScalar(P.dist).add(P.target);
      _v.y = Math.max(_v.y, ground(_v.x, _v.z, _v.y));
      cam.position.copy(_v); cam.up.set(0, 1, 0); cam.lookAt(P.target);
    } else {
      P.fyaw -= look.x; P.fpitch = clamp(P.fpitch - look.y, -1.45, 1.45);
      if (P.wheel) S.fov = clamp(S.fov + P.wheel * 2, 12, 100);
      _f.set(-Math.sin(P.fyaw) * Math.cos(P.fpitch), Math.sin(P.fpitch), -Math.cos(P.fyaw) * Math.cos(P.fpitch));
      _r.set(Math.cos(P.fyaw), 0, -Math.sin(P.fyaw));
      const sp = 5 * fast * dt;
      P.pos.addScaledVector(_f, mvZ * sp).addScaledVector(_r, mvX * sp); P.pos.y += mvY * sp;
      // constrained to a sphere around the car, never under the ground
      _v.copy(P.pos).sub(P.target); if (_v.length() > 45) P.pos.copy(P.target).addScaledVector(_v.normalize(), 45);
      P.pos.y = Math.max(P.pos.y, ground(P.pos.x, P.pos.z, P.pos.y));
      cam.position.copy(P.pos); cam.up.set(0, 1, 0); cam.lookAt(_v.copy(P.pos).add(_f));
    }
    P.wheel = 0;
    if (S.roll) cam.rotateZ(THREE.MathUtils.degToRad(S.roll));
    if (Math.abs(cam.fov - S.fov) > 0.01) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // apply the look settings
    env.state.exposureMul = Math.pow(2, S.ev);
    if (Math.abs(env.state.hours - S.hours) > 1e-4) env.state.hours = S.hours;
    if (post.dof) {
      post.dof.enabled = FSTOPS[S.fstop] > 0;
      post.dof.fstop = FSTOPS[S.fstop] || 22;
      post.dof.focus = S.autoFocus ? focusDist() : S.focus;
    }
    const F = post.finish; F.enabled = true;
    applyLook(F, S.look);
    F.uniforms.uGrain.value = S.grain * 0.09; F.uniforms.uVig.value = S.vignette * 0.8;
    const cv = renderer.domElement, ar = BARS[S.bars][1], scr = cv.width / Math.max(1, cv.height);
    F.uniforms.uBars.value = ar && ar > scr ? (1 - scr / ar) / 2 : 0;
    F.uniforms.uBarsX.value = ar && ar < scr ? (1 - ar / scr) / 2 : 0;
    if (S.autoFocus && P.sel === 3) rowEls[3].querySelector('.v').textContent = ROWS[3].get();
  }
  // the UI shell's pause menu already has a 'photo' launcher tab that calls G.photo.enter()
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cap = s => s[0].toUpperCase() + s.slice(1);
function fmtHours(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; }
