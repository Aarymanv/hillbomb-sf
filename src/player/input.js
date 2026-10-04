// Keyboard + mouse + gamepad input with action edge detection.
const KEYMAP = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], jump: ['Space'], enter: ['KeyF', 'Enter'], horn: ['KeyH'],
  camera: ['KeyC'], reset: ['KeyR'], lookBack: ['KeyQ'], map: ['KeyM'], pause: ['Escape', 'KeyP'], radio: ['KeyT'], radioPrev: ['KeyY'],
  interact: ['KeyE'], garage: ['KeyG'], lights: ['KeyL'], phone: ['Tab'], help: ['F1'], boost: ['KeyN'],
  confirm: ['Enter', 'Space'], back: ['Escape', 'Backspace'],
};
// Key latching: a key that went down counts as held until the next input.update() has seen it (a tap inside a frame hitch
// never vanishes) and for at least MIN_TAP ms (a tap always moves the car a little). Releases are caught in the capture
// phase (menus / photo mode that stop propagation can't leave a key stuck); blur / hidden / pagehide release everything.
const MIN_TAP = 60;
const isField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
export function createInput(canvas) {
  const down = new Set(), pressedNow = new Set(), releasedNow = new Set(), unseen = new Set(), tapUntil = new Map();
  let mdx = 0, mdy = 0, wheel = 0, mouseDown = false, lastMouseMove = 0, lastDevice = 'kb';
  const stats = { keydowns: 0, latchedTaps: 0, released: 0, clears: 0 };
  addEventListener('keydown', e => {
    if (isField(e.target)) return;
    if (e.code === 'Tab' || e.code === 'F1') e.preventDefault();
    if (!down.has(e.code)) { pressedNow.add(e.code); unseen.add(e.code); tapUntil.set(e.code, performance.now() + MIN_TAP); pressT.set(e.code, performance.now()); stats.keydowns++; }
    down.add(e.code); lastDevice = 'kb';
  });
  addEventListener('keyup', e => { if (down.delete(e.code)) { releasedNow.add(e.code); if (unseen.has(e.code)) stats.latchedTaps++; } }, true);
  const releaseAll = () => { if (down.size) stats.clears++; for (const c of down) releasedNow.add(c); down.clear(); unseen.clear(); tapUntil.clear(); };
  addEventListener('blur', releaseAll);
  addEventListener('pagehide', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  const pressT = new Map(), lastPress = a => Math.max(0, ...(KEYMAP[a] || []).map(c => pressT.get(c) || 0));
  const isDown = c => down.has(c) || unseen.has(c) || (tapUntil.get(c) || 0) > performance.now();
  canvas.addEventListener('mousedown', e => { mouseDown = true; if (api.wantPointerLock && document.pointerLockElement !== canvas) try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed */ } });
  addEventListener('mouseup', () => { mouseDown = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas || mouseDown) { mdx += e.movementX; mdy += e.movementY; lastMouseMove = performance.now(); }
  });
  addEventListener('wheel', e => { wheel += Math.sign(e.deltaY); }, { passive: true });

  // gamepad
  let pad = null, padPrev = [];
  const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };
  const padBtn = (i) => !!(pad && pad.buttons[i] && pad.buttons[i].pressed);
  const padVal = (i) => (pad && pad.buttons[i] ? pad.buttons[i].value : 0);
  const padPressed = (i) => padBtn(i) && !padPrev[i];
  const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
  // steering stick: small deadzone, then a progressive curve (fine control near centre, full lock at the edge)
  const steerCurve = (v) => { const a = dz(v, api.padDeadzone); return Math.sign(a) * Math.pow(Math.abs(a), api.padCurve); };
  const PADACT = { handbrake: [PAD.a], jump: [PAD.a], enter: [PAD.y], horn: [PAD.ls], camera: [PAD.rs], lookBack: [PAD.rb],
    pause: [PAD.start], radio: [PAD.right], radioPrev: [PAD.left], interact: [PAD.x], sprint: [PAD.a], garage: [PAD.up], confirm: [PAD.a], back: [PAD.b], boost: [PAD.lb], phone: [PAD.down] };

  // pad View button: tap = map, hold 0.6 s = reset the car (both used to fire on every press: opening the map reset the car)
  const view = { t0: 0, down: false, fired: false, tap: false, hold: false };
  function pollView() {
    const d = padBtn(PAD.back), now = performance.now();
    if (d && !view.down) { view.t0 = now; view.fired = false; }
    if (d && !view.fired && now - view.t0 > 600) { view.fired = true; view.hold = true; }
    if (!d && view.down && !view.fired) view.tap = true;
    view.down = d;
  }
  const api = {
    wantPointerLock: false,
    axes: { throttle: 0, brake: 0, steer: 0, moveX: 0, moveY: 0, lookX: 0, lookY: 0 },
    mouse: { dx: 0, dy: 0, wheel: 0, recent: false },
    get device() { return lastDevice; },
    padDeadzone: 0.1, padCurve: 1.4,
    stats,
    held(a) { return (KEYMAP[a] || []).some(isDown) || (PADACT[a] || []).some(padBtn); },
    pressed(a) { return (KEYMAP[a] || []).some(k => pressedNow.has(k)) || (PADACT[a] || []).some(padPressed) || (a === 'map' && view.tap) || (a === 'reset' && view.hold); },
    key(code) { return isDown(code); },
    keyPressed(code) { return pressedNow.has(code); },
    // full sample (once per rendered frame)
    update() {
      pollPads();
      pollView();
      computeAxes();
      api.mouse.dx = mdx; api.mouse.dy = mdy; api.mouse.wheel = wheel; api.mouse.recent = performance.now() - lastMouseMove < 1200;
      mdx = mdy = 0; wheel = 0;
      unseen.clear();
    },
    // driving axes only, called before every physics step (fresh gamepad state; keyboard latches unchanged)
    pollDrive() { if (!pad) return false; pollPads(); computeAxes(); return true; },
    get padConnected() { return !!pad; },
    endFrame() {
      pressedNow.clear(); releasedNow.clear(); view.tap = view.hold = false;
      padPrev = pad ? pad.buttons.map(b => b.pressed) : [];
    },
    rumble(strong = 0.5, weak = 0.5, ms = 120) {
      try { pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* not supported */ }
    },
  };
  function pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    pad = null; for (const p of pads) if (p && p.connected) { pad = p; break; }
  }
  function computeAxes() {
    const k = (a) => (api.held(a) ? 1 : 0);
    let throttle = k('up'), brake = k('down'), steer = k('right') - k('left');
    // both steering keys down (rolling from one to the other, or a latched tap): the most recent press wins, not 0
    if (k('right') && k('left')) steer = lastPress('right') > lastPress('left') ? 1 : -1;
    let moveX = steer, moveY = throttle - brake, lookX = 0, lookY = 0, digitalSteer = true, digitalPedals = true;
    if (pad) {
      const lx = steerCurve(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
      const rt = padVal(PAD.rt), lt = padVal(PAD.lt);
      if (Math.abs(lx) > 0 || rt > 0.05 || lt > 0.05 || Math.abs(rx) > 0 || pad.buttons.some(b => b.pressed)) lastDevice = 'pad';
      if (rt > throttle || lt > brake) digitalPedals = false;
      throttle = Math.max(throttle, rt); brake = Math.max(brake, lt);
      if (Math.abs(lx) > Math.abs(steer)) { steer = lx; digitalSteer = false; }
      if (Math.abs(lx) > 0) moveX = lx;
      if (Math.abs(ly) > 0) moveY = -ly;
      lookX = rx; lookY = ry;
    }
    Object.assign(api.axes, { throttle, brake, steer, moveX, moveY, lookX, lookY, digitalSteer, digitalPedals });
  }
  return api;
}
