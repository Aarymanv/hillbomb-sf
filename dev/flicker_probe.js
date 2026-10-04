// Dev probe for night flicker / strobing (load in the game page: await import('/dev/flicker_probe.js')).
//   __rb(w, h)            -> Float32Array luminance (0..255) of a w x h readback of the game canvas
//   __flick(n)            -> steps n frames; per-screen-region (12 x 6) max frame-to-frame luminance jump + global jump
//   __gser(n)             -> steps n frames; count of whole-screen mean jumps > 3 / 255 and the max jump
//   __drive(speed)        -> autopilot: follow the nearest street (heading north-ish) at `speed` m/s (0 = brake)
//   window.__rbBox = true  -> box-filtered readback (halving steps): a single 13x bilinear drawImage samples ~4 px per
//                            output pixel, so thin stripes / sub-pixel lamps alias in the PROBE itself and inflate jumps
window.__rb = (W = 96, H = 54) => {
  const c = window.__rbc || (window.__rbc = document.createElement('canvas')); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (window.__rbBox) {
    let src = window.__renderer.domElement, w = src.width, h = src.height;
    const tmp = window.__rbt || (window.__rbt = [document.createElement('canvas'), document.createElement('canvas')]); let k = 0;
    while (w / 2 >= W * 1.5) { const t = tmp[k ^= 1]; t.width = Math.round(w / 2); t.height = Math.round(h / 2); const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, t.width, t.height); src = t; w = t.width; h = t.height; }
    x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, W, H);
  } else x.drawImage(window.__renderer.domElement, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  return L;
};
window.__regions = (L, W = 96, H = 54, RX = 12, RY = 6) => {
  const out = new Float32Array(RX * RY), bw = W / RX, bh = H / RY;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out[Math.floor(j / bh) * RX + Math.floor(i / bw)] += L[j * W + i];
  for (let k = 0; k < out.length; k++) out[k] /= bw * bh;
  return out;
};
window.__flick = (nf = 60) => {
  let prev = null; const mx = new Float32Array(72), gm = [];
  for (let f = 0; f < nf; f++) {
    window.__frames(1); const R = window.__regions(window.__rb()); let s = 0; for (const v of R) s += v; gm.push(s / 72);
    if (prev) for (let k = 0; k < 72; k++) { const d = Math.abs(R[k] - prev[k]); if (d > mx[k]) mx[k] = d; }
    prev = R;
  }
  let worst = 0, wk = -1; for (let k = 0; k < 72; k++) if (mx[k] > worst) { worst = mx[k]; wk = k; }
  const sorted = [...mx].sort((a, b) => b - a); let gj = 0; for (let i = 1; i < gm.length; i++) gj = Math.max(gj, Math.abs(gm[i] - gm[i - 1]));
  return { worst: +worst.toFixed(2), region: [wk % 12, Math.floor(wk / 12)], top5: sorted.slice(0, 5).map(v => +v.toFixed(1)), over4: sorted.filter(v => v > 4).length, globalJump: +gj.toFixed(2) };
};
window.__gser = (n = 40) => {
  const g = []; for (let f = 0; f < n; f++) { window.__frames(1); const L = window.__rb(); let s = 0; for (const v of L) s += v; g.push(s / L.length); }
  let sp = 0, mx = 0; for (let i = 1; i < g.length; i++) { const d = Math.abs(g[i] - g[i - 1]); if (d > 3) sp++; mx = Math.max(mx, d); }
  return { spikes: sp, maxJump: +mx.toFixed(2) };
};
window.__drive = (speed = 10) => {
  const A = { last: null, spd: 0 }; window.__ap = A;
  window.__autopilot = (input, dt) => {
    const v = window.__player.vehicle; if (!v) return;
    const p = v.root.position;
    if (A.last && dt > 0) A.spd = Math.hypot(p.x - A.last[0], p.z - A.last[1]) / dt;
    A.last = [p.x, p.z];
    const ne = window.__world.graph.nearestEdge(p.x, p.z, 60); if (!ne) return;
    const e = ne.edge, k = Math.min(ne.k, e.pts.length - 2);
    let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    if (dz > 0) { dx = -dx; dz = -dz; }
    const m = v.root.matrixWorld.elements; let fx = -m[8], fz = -m[10]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const tx = ne.x + dx * 14 - p.x, tz = ne.z + dz * 14 - p.z, lat = tx * -fz + tz * fx;
    const ax = input.axes; ax.steer = Math.max(-1, Math.min(1, lat / 14 * 2.5));
    ax.throttle = A.spd < speed ? 0.55 : 0; ax.brake = speed === 0 ? 1 : A.spd > speed + 2 ? 0.4 : 0;
  };
};
// repeatable driving run: start on the street nearest (x, z) heading north, autopilot at spd m/s, n frames measured
//   -> { sp3: jumps > 3/255, max, osc: up-then-down pairs > 1.5 (true flicker, not motion) }
window.__flkRun = (x = 1208, z = -1803, n = 300, spd = 12) => {
  const ne = window.__world.graph.nearestEdge(x, z, 60), e = ne.edge, k = Math.min(ne.k, e.pts.length - 2);
  let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; if (dz > 0) { dx = -dx; dz = -dz; }
  window.__teleport(ne.x, ne.z, { yaw: Math.atan2(-dx, -dz) }); window.__drive(spd); window.__frames(90);
  const g = []; for (let f = 0; f < n; f++) { window.__frames(1); const L = window.__rb(); let s = 0; for (const v of L) s += v; g.push(s / L.length); }
  const j = []; for (let i = 1; i < g.length; i++) j.push(g[i] - g[i - 1]);
  let osc = 0; for (let i = 1; i < j.length; i++) if (j[i] * j[i - 1] < 0 && Math.min(Math.abs(j[i]), Math.abs(j[i - 1])) > 1.5) osc++;
  return { sp3: j.filter(v => Math.abs(v) > 3).length, max: +Math.max(...j.map(Math.abs)).toFixed(2), osc };
};
// kinematic run (needs dev/perf_drive.js for __route): the player's car is placed along a street route at spd m/s each
// frame (no physics / autopilot variance); traffic off so passing cars don't count. Default: Grant Ave, Bush -> Broadway.
window.__kinRun = (spd = 15, maxF = 450, route = null) => {
  const g0 = window.__world.graph;
  if (!route) { const A = g0.intersection('Grant Avenue', 'Bush Street'), B = g0.intersection('Grant Avenue', 'Broadway'); route = window.__kinRoute || (window.__kinRoute = window.__route([[A.x, A.z + 60], [B.x, B.z]])); }
  const T = window.__G.traffic; T.density = 0; T.clear();
  const R = route, v = window.__player.vehicle, cum = [0];
  for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]));
  let s = 0, k = 0; const g = [];
  const place = () => { while (k < cum.length - 2 && cum[k + 1] < s) k++; const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = R[k], b = R[k + 1]; const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, nx = b[0] - a[0], nz = b[1] - a[1], l = Math.hypot(nx, nz) || 1; v.place(x - nz / l * 1.8, window.__world.groundAt(x, z, 999) + 0.4, z + nx / l * 1.8, Math.atan2(-nx, -nz)); };
  window.__autopilot = null; place(); window.__G.rig.snap(); window.__frames(30);
  for (let f = 0; f < maxF && s < cum[cum.length - 1] - 2; f++) { s += spd / 60; place(); window.__frames(1); const L = window.__rb(); let q = 0; for (const x of L) q += x; g.push(q / L.length); }
  const j = []; for (let i = 1; i < g.length; i++) j.push(g[i] - g[i - 1]);
  let osc = 0; for (let i = 1; i < j.length; i++) if (j[i] * j[i - 1] < 0 && Math.min(Math.abs(j[i]), Math.abs(j[i - 1])) > 1.5) osc++;
  T.density = 1;
  return { n: g.length, sp3: j.filter(x => Math.abs(x) > 3).length, max: +Math.max(...j.map(Math.abs)).toFixed(2), osc };
};
