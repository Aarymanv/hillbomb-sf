// Pause / festival menu, big map and settings wiring (the UI itself lives in src/ui: shell.js, menu.js, bigmap.js,
// tabs.js). Also radio hotkeys and car delivery. G.menus.update() is called by main.js every frame (also while
// paused and while a render override is active), and drives the UI shell's tick (gamepad, map, menu pages).
import * as CarsMod from '../vehicle/cars.js';
import { registerBuiltinTabs, settingsDefaults, applyAudio } from '../ui/tabs.js';

export function install(G) {
  const ui = G.ui;
  if (!ui) { console.error('[menus] G.ui missing (createHud must run first)'); return; }
  const M = { open: null };
  G.menus = M;
  const audio = G.audio;
  const s = settingsDefaults(G.economy.settings);
  G.hud.setScale?.(s.hudScale);

  registerBuiltinTabs(G);

  // legacy fields some systems read
  Object.defineProperty(M, 'open', { get: () => (ui.menu.isOpen() ? 'pause' : ui.map.isOpen() ? 'map' : null), configurable: true });
  M.pause = tab => ui.menu.open(tab);
  M.map = opts => ui.map.open(opts);
  M.close = () => { ui.menu.close(); ui.map.close(); };

  // ---------------------------------------------------------------- car delivery (garage tab, other modules)
  function deliver(id) {
    const P = G.player;
    const old = P.vehicle;
    let x = P.pos.x, z = P.pos.z, yaw = 0;
    if (old) { yaw = old.body.yaw(); P.exitVehicle(true); }
    const spot = ui.roadSpot(x, z, 60);
    if (spot) { x = spot.x; z = spot.z; yaw = spot.yaw; }
    if (old && old.role === 'player') G.removeVehicle(old);
    const v = G.spawnVehicle(id, x, z, yaw, { role: 'player' });
    P.setVehicle(v);
    G.rig?.snap?.();
  }
  M.deliver = deliver;
  G._carsModule = CarsMod;

  // ---------------------------------------------------------------- hooks
  G.on('pause', () => { if (!ui.isModal()) ui.menu.open(); });
  G.on('start', () => {
    applyAudio(G);
    G.emit('settings', s, 'all');
    setTimeout(() => { if (audio?.radio && !audio.radio.isOn()) audio.radio.setOn(true); }, 1500);
  });
  M.update = function (dt) {
    ui.tick(dt);
    const inp = G.input;
    if (G.state !== 'play' || ui.isModal()) return;
    if (inp.pressed('map')) { ui.map.open(); return; }
    if (inp.pressed('help')) { ui._settingsCat = 'controls'; ui.menu.open('settings'); return; }
    // radio (the audio module may draw its own now-playing widget into G.ui.slots.radio)
    if (inp.pressed('radio')) {
      const r = audio?.radio; if (!r) return;
      if (!r.isOn()) r.setOn(true); else r.next();
      radioToast(r.current());
    }
    if (inp.pressed('radioPrev')) { const r = audio?.radio; if (r) { if (!r.isOn()) r.setOn(true); else r.prev(); radioToast?.(r.current()); } M._yHeld = 0; }
    if (inp.held('radioPrev')) { M._yHeld = (M._yHeld || 0) + dt; const r = audio?.radio; if (M._yHeld > 0.6 && r?.isOn()) { r.setOn(false); M._yHeld = -99; if (!ui.slots.radio.firstChild) ui.notify({ title: 'Radio off', kind: 'radio', ms: 1500 }); } }
  };
  function radioToast(c) { if (!c || ui.slots.radio.firstChild) return; ui.notify({ title: c.name, sub: `${c.track || ''}${c.genre ? ' · ' + c.genre : ''}`, kind: 'radio', ms: 3200 }); }
  if (audio?.radio && !audio.radio.onTrackChange) audio.radio.onTrackChange = c => { if (G.state === 'play') radioToast(c); };
}
