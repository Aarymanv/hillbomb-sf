// Per-pixel temporal flicker map (dev): the concept framing (ctshots 'ref', Sacramento St in rain) with traffic / peds off, the
// rain streak + splash particles hidden, film grain off and time of day frozen, 12 s real-time warm-up (streaming / LOD swaps),
// then 15 s of real-time frames -> luma std per pixel (x25) beside the frame -> shots/<name>.jpg; returns mean / lower-half std.
//   await import('http://127.0.0.1:5190/dev/flicker_map.js?' + Date.now()); await __flickMap('flk_x', 'label')
// (10/4: road fix 1 vs road fix 3 render files: lower half 0.26-0.27 vs 0.28-0.35, frame-region probe max 3.1-3.7 vs 3.0-3.6.)
window.__flickMap = async (name, label = null) => {
  // temporal-std heatmap of the concept framing (rain particles hidden, no traffic / peds), 15 s real time -> shots/<name>.jpg
  for (const f of ['sky_shots.js', 'regress_shots.js', 'ctshots.js', 'gpu.js', 'road2shots.js', 'flicker_probe.js', 'flicker_rt.js']) await import('http://127.0.0.1:5190/dev/' + f + '?' + Date.now());
  await __ctShot('ref', 'flkmap');
  const G = __G; G.traffic.clear(); G.traffic.density = 0; G.traffic.enabled = false; G.peds.enabled = false; G.peds.density = 0;
  for (const n of ['weather:rain', 'weather:splash']) { const o = __scene.getObjectByName(n); if (o) o.material.visible = false; }
  for (let i = 0; i < 30; i++) __frames(1);
  __env.state.paused = true; { const g = __G.post.grade; (g.uniforms || g.material.uniforms).uGrain.value = 0; }   // (film grain off: it is per-pixel noise by design)    // (time of day frozen: only frame-to-frame instability remains)
  const Wd = 320, Hd = 180, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; const x = c.getContext('2d', { willReadFrequently: true });
  const N = Wd * Hd, mean = new Float64Array(N), m2 = new Float64Array(N); let n = 0, last = performance.now(); const t0 = last;
  const ch = new MessageChannel(); const tick = () => new Promise(r => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  let frame = null;
  { const tw = performance.now(); let lw = tw; while (performance.now() - tw < 12000) { await tick(); const now = performance.now(); __frame(Math.min(0.1, (now - lw) / 1000)); lw = now; } }   // warm-up: streaming / LOD swaps settle in real time
  last = performance.now(); const t1 = last;
  while (performance.now() - t1 < 15000) {
    await tick(); const now = performance.now(); __frame(Math.min(0.1, (now - last) / 1000)); last = now;
    x.drawImage(__renderer.domElement, 0, 0, Wd, Hd); const d = x.getImageData(0, 0, Wd, Hd).data; n++;
    for (let i = 0; i < N; i++) { const L = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2], dl = L - mean[i]; mean[i] += dl / n; m2[i] += dl * (L - mean[i]); }
    if (!frame) frame = x.getImageData(0, 0, Wd, Hd);
  }
  let tot = 0, road = 0, rn = 0; const o = document.createElement('canvas'); o.width = Wd * 2; o.height = Hd; const ox = o.getContext('2d');
  ox.putImageData(frame, 0, 0); const img = ox.createImageData(Wd, Hd);
  for (let i = 0; i < N; i++) { const sd = Math.sqrt(m2[i] / Math.max(1, n - 1)); tot += sd; if (i / Wd > Hd * 0.5) { road += sd; rn++; } const v = Math.min(255, sd * 25); img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.6; img.data[i * 4 + 2] = 0; img.data[i * 4 + 3] = 255; }
  ox.putImageData(img, Wd, 0); ox.fillStyle = '#fff'; ox.font = '12px sans-serif'; ox.fillText(`${label || name}: luma std x25`, Wd + 6, 14); ox.fillText(`mean ${(tot / N).toFixed(2)}, road half ${(road / rn).toFixed(2)}`, Wd + 6, 30);
  await fetch('http://127.0.0.1:5191/__shot?name=' + name, { method: 'POST', body: o.toDataURL('image/jpeg', 0.9) });
  return JSON.stringify({ frames: n, meanStd: +(tot / N).toFixed(3), roadStd: +(road / rn).toFixed(3) });
  
};
