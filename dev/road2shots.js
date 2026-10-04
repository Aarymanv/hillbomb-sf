// Road pass 2 review views (wet reflections, asphalt, markings, day colour). Load after sky_shots.js, regress_shots.js, ctshots.js, gpu.js:
//   for (const f of ['sky_shots.js', 'regress_shots.js', 'ctshots.js', 'gpu.js', 'road2shots.js']) await import('http://127.0.0.1:5190/dev/' + f)
//   await __road2All('before')  -> shots/road2_<grant_rain|grant_day|mission_rain|hyde_day|market_night>_before.jpg (+ road2_ref_<suf>.jpg)
//   await __road2Wet()          -> GPU ms of the wet-reflection pass alone (trace + street mirror + streak blur + composite) per view
// then: python dev/road2_sheet.py  -> shots/road2_vs_ref.jpg + shots/road2_pairs.jpg
(() => {
  const W = window;
  // hidden tabs throttle chained setTimeout to ~1/min after 5 min (sky_shots.js __settle took minutes per view): yield via
  // MessageChannel instead (not throttled), busy-waiting out the short sleeps
  const mc = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const nap = async (ms) => { const t = performance.now() + ms; while (performance.now() < t) await mc(); };
  W.__settle = async (max = 120) => {
    for (let i = 0; i < max; i++) {
      W.__frames(10); await nap(30);
      if (W.__G.world.stream._queue.filter(j => j.d < 600).length === 0 && i > 70) break;   // >= ~2 s: hero LODs / shop fronts load after the stream queue drains
    }
    W.__frames(20);
  };
  // ctshots.js __ctShot with the 1.5 s pause as a MessageChannel nap (its setTimeout took minutes in a long-hidden tab)
  W.__ctShot = async (name, suf = 'x', o = {}) => {
    const v = { ...W.CT_VIEWS[name], ...o };
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__regNoPolice?.();
    W.__manual = true; W.__setWx(v.wx); W.__env.state.hours = v.h; W.__env.state.paused = true;
    const near = () => { const p = W.__G.player.pos, c = W.__camera.position; return v.chase || Math.hypot(p.x - c.x, p.z - c.z) < 60; };
    for (let k = 0; k < 4; k++) {
      W.__ctPlace(name, o); await W.__settle(150); W.__setWx(v.wx); W.__env.state.hours = v.h; W.__ctPlace(name, o); await W.__settle(150);
      if (near()) break;
    } await nap(1500); W.__frames(60);
    return W.__shot(`ct_${name}_${suf}`, o.w || 1280, o.hgt || 720);
  };
  // chase-cam regression framings with pinned hour / weather (regress_shots.js REG_VIEWS + overrides)
  const R = {
    grant_rain: ['grant', { h: 21.5, wx: 'rain' }],
    mission_rain: ['mission', { h: 22, wx: 'rain' }],
    hyde_day: ['dayhill', { h: 14, wx: 'clear' }],
    market_night: ['market', { h: 21.5, wx: 'clear' }],
    lamp_rain: ['market', { h: 21.5, wx: 'rain' }],       // road 3: white street lamps over a wet arterial
  };
  W.__road2Shot = async (name, suf = 'x') => {
    if (name === 'grant_day') { await W.__ctShot('grantday', suf); return W.__shot(`road2_grant_day_${suf}`, 1280, 720); }
    if (name === 'ref') { await W.__ctShot('ref', suf); return W.__shot(`road2_ref_${suf}`, 1280, 720); }
    // back in the car after a free-camera ct view (those park the player on foot)
    const P = W.__G.player; if (!P.vehicle && W.__ctCar) P.setVehicle(W.__ctCar);
    if (P.vehicle && !P.vehicle.root.parent) W.__scene.add(P.vehicle.root);
    const [v, o] = R[name], V = W.REG_VIEWS[v], keep = { h: V.h, wx: V.wx };
    Object.assign(V, o);
    try { await W.__regShot(v, 'road2tmp'); } finally { Object.assign(V, keep); }
    return W.__shot(`road2_${name}_${suf}`, 1280, 720);
  };
  W.__wait = nap;
  // the wet pass alone (timer query around post.wet.render): whole-frame timings swing with GPU clocks in a hidden pane
  W.__wetMs = async (n = 60) => {
    const w = (W.__post || W.__G.post).wet, gl = W.__renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const orig = w.render, qs = []; let gate = false;
    w.render = function (...a) { if (!gate) return orig.apply(this, a); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); orig.apply(this, a); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); };
    for (let i = 0; i < n; i++) { gate = true; W.__frames(1); gate = false; }
    gl.finish(); const out = [];
    for (const q of qs) { for (let k = 0; k < 100 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await nap(5); out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    w.render = orig; out.sort((a, b) => a - b);
    return out.length ? +out[out.length >> 1].toFixed(3) : null;
  };
  W.__road2Wet = async (names = ['ref', 'grant_rain']) => {
    const out = {};
    for (const n of names) { await W.__road2Shot(n, 'wetms'); const r = []; for (let k = 0; k < 3; k++) r.push(await W.__wetMs(60)); r.sort((a, b) => a - b); out[n] = r[1]; }
    return out;
  };
  // road 3 (lamp veil / puddle sharpness): shots/road3_<lamp_rain|mission_rain|ref>_<suf>.jpg; dbg = 1 also saves the
  // reflection buffer alone (post.wet comp uDebug 1: reflection x 4) as road3_<view>_<suf>_refl.jpg
  W.__road3All = async (suf, names = ['lamp_rain', 'mission_rain', 'ref'], dbg = 0) => {
    for (const n of names) {
      await W.__road2Shot(n, 'r3tmp'); await W.__shot(`road3_${n}_${suf}`, 1280, 720);
      if (dbg) { const C = (W.__post || W.__G.post).wet.comp.material.uniforms; C.uDebug.value = 1; await W.__shot(`road3_${n}_${suf}_refl`, 1280, 720); C.uDebug.value = 0; }
    }
    return names;
  };
  W.__road2All = async (suf, names = ['grant_rain', 'mission_rain', 'hyde_day', 'market_night', 'grant_day', 'ref']) => {
    const out = []; for (const n of names) out.push(await W.__road2Shot(n, suf)); return out;
  };
})();
