// headless body for dev/car3cdp.mjs: Google-tiles selection lag test. A free camera pans (#rate deg/s, #frames frames of
// 1/60 s) over the city from a rooftop view; every frame is read back at 160x90 and compared with the same pan run with a
// full traversal on the real camera every frame (window.__perf.tilesthrottle = false). Reports per-frame differing
// cells (|luma diff| > 24 of 14400): max and mean, for the current switches (A) and an A/A rerun of the reference (noise).
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high&nodynres#rate=120" dev/tiles_pan.js
for (const f of ['bld5shots.js', 'regress_shots.js', 'perf_drive.js', 'world2_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const W = window, LL = (a, b) => { const p = W.__w2LL(a, b); return [p.x, p.z]; };
const H = new URLSearchParams(location.hash.slice(1)), RATE = +(H.get('rate') || 120), N = +(H.get('frames') || 150);
if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
W.__regNoPolice?.(); W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = 15.5; W.__env.state.paused = true;
if (W.__G.dynres) W.__G.dynres.enabled = false;
if (H.get('cyc') && W.__world.gtiles) W.__world.gtiles.phCycle = +H.get('cyc');
const spots = { fidi: [37.7915, -122.4010, 60], mission: [37.7600, -122.4190, 45] };
const c = document.createElement('canvas'); c.width = 160; c.height = 90; const cx = c.getContext('2d', { willReadFrequently: true });
const grab = () => { cx.drawImage(W.__renderer.domElement, 0, 0, 160, 90); const d = cx.getImageData(0, 0, 160, 90).data, L = new Uint8Array(14400); for (let i = 0; i < 14400; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0; return L; };
const out = {};
for (const [nm, [lat, lon, h]] of Object.entries(spots)) {
  const [x, z] = LL(lat, lon);
  W.__teleport(x, z); await W.__bld5Settle(); W.__teleport(x, z);
  for (const c2 of W.__G.traffic?.cars || []) if (c2.v?.ai) c2.v.ai.state = 'stopped';
  const y = W.__world.groundAt(x, z, 999) + h;
  const run = async (throttle) => {
    W.__perf.tilesthrottle = throttle;
    W.__look(x, y, z, x + 100, y - 20, z); for (let i = 0; i < 240; i++) { W.__frames(1); if (i % 10 === 0) await new Promise(r => setTimeout(r, 30)); }   // settle the tiles at the start heading
    const fr = [];
    for (let i = 0; i < N; i++) { const a = (i * RATE / 60) * Math.PI / 180; W.__look(x, y, z, x + 100 * Math.cos(a), y - 20, z + 100 * Math.sin(a)); W.__frames(1); fr.push(grab()); await new Promise(r => setTimeout(r, 4)); }
    return fr;
  };
  const ref = await run(false), A = await run(true), ref2 = await run(false);
  const cmp = (P, Q) => { const n = P.map((p, i) => { let k = 0; const q = Q[i]; for (let j = 0; j < 14400; j++) if (Math.abs(p[j] - q[j]) > 24) k++; return k; }); return { max: Math.max(...n), mean: +(n.reduce((s, v) => s + v, 0) / n.length).toFixed(1) }; };
  out[nm] = { A_vs_ref: cmp(A, ref), AA_noise: cmp(ref2, ref) };
  W.__perf.tilesthrottle = true;
}
W.__look(null);
return out;
