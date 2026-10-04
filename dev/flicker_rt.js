// Real-time flicker probe (works in a hidden tab): drives the game's frame(dt) with the REAL elapsed time (MessageChannel
// loop, not rAF) so time-of-day, weather drift, IBL re-bakes, cloud shadows and every throttled update advance as they
// do in a visible window. Needs dev/flicker_probe.js (__rb, __regions).
//   await __flickRT(20)                 -> 20 s, camera wherever it is (park it with __look / the regress views)
//   window.__flickTag = { name: fn }    -> extra per-frame tags (e.g. count IBL bakes) reported for the worst jumps
// Reports frame-to-frame jumps of the whole-screen mean and of 12 x 6 screen regions (0..255 luminance), and the frames
// where they happen with their tags (bake = the environment re-baked the IBL that frame).
window.__flickRT = async (secs = 20, { paused = false } = {}) => {
  const W = window, E = W.__env, pm = E._dbg?.pmrem;
  let bakes = 0;
  if (pm && !pm.__hbWrapped) { const f = pm.fromEquirectangular.bind(pm); pm.fromEquirectangular = (...a) => { W.__hbBakes = (W.__hbBakes || 0) + 1; return f(...a); }; pm.__hbWrapped = true; }
  if (!paused) E.state.paused = false;
  const ch = new MessageChannel(); const tick = () => new Promise(r => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const t0 = performance.now(); let last = t0, prev = null, prevG = 0, n = 0;
  const ev = []; const reg = new Float32Array(72);
  while (performance.now() - t0 < secs * 1000) {
    await tick();
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const b0 = W.__hbBakes || 0;
    W.__frame(dt);
    const R = W.__regions(W.__rb()); let s = 0; for (const v of R) s += v; const g = s / 72;
    const baked = (W.__hbBakes || 0) - b0; bakes += baked;
    if (prev) {
      let worst = 0, wk = 0; for (let k = 0; k < 72; k++) { const d = Math.abs(R[k] - prev[k]); if (d > reg[k]) reg[k] = d; if (d > worst) { worst = d; wk = k; } }
      const gj = Math.abs(g - prevG);
      if (worst > 2 || gj > 1) ev.push({ f: n, t: +((now - t0) / 1000).toFixed(2), g: +gj.toFixed(2), r: +worst.toFixed(1), at: [wk % 12, Math.floor(wk / 12)], bake: baked, ...(W.__flickTag ? Object.fromEntries(Object.entries(W.__flickTag).map(([k, f]) => [k, f()])) : {}) });
    }
    prev = R; prevG = g; n++;
  }
  ev.sort((a, b) => b.r - a.r);
  const sorted = [...reg].sort((a, b) => b - a);
  return { frames: n, fps: +(n / secs).toFixed(1), bakes, regionMax: +sorted[0].toFixed(1), regionsOver2: sorted.filter(v => v > 2).length, events: ev.length, worst: ev.slice(0, 8) };
};
// frame-parity check: mean |diff| of consecutive frames (d1) vs frames two apart (d2). d1 >> d2 = something alternates
// every frame (ping-pong state, two systems fighting over a uniform, LOD / visibility flip-flop).
window.__altStat = (n = 6, dt = 1 / 30) => {
  const R = window.__renderer.domElement, c = window.__altc || (window.__altc = document.createElement('canvas')); c.width = 320; c.height = 180;
  const x = c.getContext('2d', { willReadFrequently: true }), F = [];
  for (let i = 0; i < n; i++) { window.__frame(dt); x.drawImage(R, 0, 0, 320, 180); F.push(x.getImageData(0, 0, 320, 180).data); }
  const md = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
  let d1 = 0, d2 = 0; for (let i = 0; i + 2 < n; i++) { d1 += md(F[i], F[i + 1]); d2 += md(F[i], F[i + 2]); }
  return { d1: +(d1 / (n - 2)).toFixed(2), d2: +(d2 / (n - 2)).toFixed(2) };
};
// real-time loop that saves the frame pair (prev | cur, half size) of the first `max` jumps whose whole-screen mean
// changes by more than `gMin` or whose 12 x 6 region changes by more than `rMin` (0..255) -> shots/flk_<name>_<i>.jpg
window.__flickCatch = async (secs = 15, { gMin = 8, rMin = 30, max = 3, name = 'catch', region = null } = {}) => {
  const W = window, R = W.__renderer.domElement;
  const mk = () => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; return c; };
  let pc = mk(), cc = mk(); const ch = new MessageChannel(); const tick = () => new Promise(r => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const t0 = performance.now(); let last = t0, prev = null, prevG = 0, saved = 0; const info = [];
  while (performance.now() - t0 < secs * 1000 && saved < max) {
    await tick(); const now = performance.now(); W.__frame(Math.min(0.1, (now - last) / 1000)); last = now;
    cc.getContext('2d').drawImage(R, 0, 0, 640, 360);
    const Rg = W.__regions(W.__rb()); let s = 0; for (const v of Rg) s += v; const g = s / 72;
    if (prev) {
      let worst = 0, wk = 0; for (let k = 0; k < 72; k++) { if (region && k !== region[1] * 12 + region[0]) continue; const d = Math.abs(Rg[k] - prev[k]); if (d > worst) { worst = d; wk = k; } }
      if (Math.abs(g - prevG) > gMin || worst > rMin) {
        const o = document.createElement('canvas'); o.width = 1280; o.height = 360; const x = o.getContext('2d'); x.drawImage(pc, 0, 0); x.drawImage(cc, 640, 0);
        x.strokeStyle = '#ff0'; x.strokeRect(640 + (wk % 12) * 640 / 12, Math.floor(wk / 12) * 60, 640 / 12, 60);
        await fetch('http://127.0.0.1:5191/__shot?name=flk_' + name + '_' + saved, { method: 'POST', body: o.toDataURL('image/jpeg', 0.85) });
        info.push({ t: +((now - t0) / 1000).toFixed(2), g: +(g - prevG).toFixed(1), r: +worst.toFixed(1), at: [wk % 12, Math.floor(wk / 12)] }); saved++;
      }
    }
    prev = Rg; prevG = g; const t = pc; pc = cc; cc = t;
  }
  return info;
};
