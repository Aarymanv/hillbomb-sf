// Look-dev capture helper (whole-image pass). Load in the game page (5191 tab):
//   await import('http://127.0.0.1:5190/dev/sky_shots.js'); await import('http://127.0.0.1:5190/dev/bld3shots.js');
//   await import('http://127.0.0.1:5190/dev/lookshots.js')
//   await __lookShot('house', 'noon', 'before')  ->  shots/look_house_noon_before.jpg
//   await __lookSet('before', [['house','noon'], ['mission','night'], ...])
(() => {
  const W = window;
  const SPOTS = {
    house: { front: 51194 },
    mission: { a: ['24th Street', 'Harrison Street'], b: ['24th Street', 'Alabama Street'], t: 0.3, side: 1.2, turn: 0.4, h: 2.2 },
    mission24: { a: ['24th Street', 'Folsom Street'], b: ['24th Street', 'Harrison Street'], t: 0.15, side: 0, turn: 0, h: 1.8, up: 0.8, ahead: 60 },
    chinatown: { a: ['Grant Avenue', 'Jackson Street'], b: ['Grant Avenue', 'Washington Street'], t: 0.05, side: 0.5, turn: 0, h: 1.8, up: 1.4, ahead: 60 },
    unionsq: { a: ['Geary Street', 'Stockton Street'], b: ['Post Street', 'Powell Street'], t: 0.08, side: 5, turn: 0, h: 1.8, up: 3.0, ahead: 80 },
    hyde: { a: ['Hyde Street', 'Chestnut Street'], b: ['Hyde Street', 'Bay Street'], t: 0.0, side: -1.5, turn: 0, h: 2.4, up: -7, ahead: 120 },
    twinpeaks: { look: [-2480, 282, 2400, 1300, 150, -1700], focus: [-2480, 2410] },
  };
  const TIMES = { noon: [12.5, 'clear'], golden: [17.9, 'clear'], sunset: [19.0, 'clear'], bluehour: [19.65, 'clear'], night: [22.0, 'clear'], rain: [21.5, 'rain'], fog: [8.5, 'fog'], h14: [14, 'clear'], h16: [16, 'clear'], h18: [18, 'clear'], h19: [19, 'clear'] };
  function cam(p) {
    if (p.look) return p.look;
    if (p.front !== undefined) return W.__bld3Front(p.front, 9, 1.5, 1.6, 2.6);
    const g = W.__G.world.graph, A = g.intersection(...p.a), B = g.intersection(...p.b);
    if (!A || !B) throw new Error('no intersection ' + JSON.stringify(p));
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const px = A.x + dx * L * p.t - dz * p.side, pz = A.z + dz * L * p.t + dx * p.side;
    const c = Math.cos(p.turn), s = Math.sin(p.turn), lx = c * dx + s * dz, lz = -s * dx + c * dz, k = p.ahead || 30;
    const py = W.__world.groundAt(px, pz, 999) + p.h;
    return [px, py, pz, px + lx * k, py + (p.up ?? 0.6), pz + lz * k];
  }
  W.__lookCam = (spot) => {
    const p = SPOTS[spot], c = cam(p);
    if (p.focus) W.__teleport(...p.focus);
    else { const bx = c[0] - c[3], bz = c[2] - c[5], bl = Math.hypot(bx, bz) || 1; W.__teleport(c[0] + bx / bl * 25, c[2] + bz / bl * 25); }
    W.__look(...c); return c;
  };
  W.__lookShot = async (spot, time, suf, name) => {
    const [h, wx] = TIMES[time];
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__manual = true; W.__setWx(wx); W.__env.state.hours = h; W.__env.state.paused = true;
    W.__lookCam(spot); await W.__settle(); W.__lookCam(spot); await W.__settle(); W.__frames(30);
    return W.__shot(name || `look_${spot}_${time}_${suf}`, 1280, 720);
  };
  // persistent per-frame hooks after env.update (shots): default = player headlights off (the parked player car sits
  // 25 m behind the free camera and its 60-cd spots flood whatever the camera looks at)
  W.__lookHooks = W.__lookHooks || {};
  W.__lookHooks.noHead = () => { if (!W.__lookHead) return; W.__scene.traverse(o => { if (o.isSpotLight && !o.name && o.intensity > 20) o.intensity = 0; }); };
  W.__lookHead = false;   // (headlights now carry a low-beam cut-off: keep them on)
  W.__lookHooks.noBeams = () => { if (!W.__beamObjs) { W.__beamObjs = []; W.__scene.traverse(o => { if (o.name === 'festival-beams') W.__beamObjs.push(o); }); } for (const o of W.__beamObjs) o.visible = false; };
  { const E = W.__env; if (!E.__origUpdate) E.__origUpdate = E.update; if (!E.__hooked) { E.__hooked = true; const o = E.__origUpdate; E.__origUpdate = (...a) => { o(...a); }; E.update = (...a) => { o(...a); for (const h of Object.values(W.__lookHooks)) h && h(); }; E.__origUpdate = E.update; } }
  W.__lookSet = async (suf, pairs) => { const out = []; for (const [s, t] of pairs) out.push(await W.__lookShot(s, t, suf)); return out; };
  // A/B variants in one settled view: variants = [[name, fnApply, fnReset]]; fnApply runs every frame after env.update
  W.__variants = async (spot, time, variants, pre = 'tmv') => {
    const [h, wx] = TIMES[time];
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__manual = true; W.__setWx(wx); W.__env.state.hours = h; W.__env.state.paused = true;
    W.__lookCam(spot); await W.__settle(); W.__lookCam(spot); await W.__settle();
    const out = [];
    for (const [name, f, reset] of variants) { W.__lookHooks.v = f; W.__frames(3); out.push(await W.__shot(`${pre}_${spot}_${time}_${name}`, 1280, 720)); W.__lookHooks.v = null; reset && reset(); }
    return out;
  };
  W.__LOOK_PAIRS = [['house', 'noon'], ['house', 'night'], ['mission24', 'noon'], ['mission24', 'night'], ['chinatown', 'rain'], ['unionsq', 'golden'],
    ['hyde', 'sunset'], ['twinpeaks', 'noon'], ['twinpeaks', 'bluehour'], ['house', 'fog']];
  W.__lookSpots = SPOTS;
  // hidden tabs: Chrome throttles chained setTimeout to once a minute after 5 min -> yield through a MessageChannel
  const mc = new MessageChannel(), q = []; mc.port1.onmessage = () => { const f = q.shift(); f && f(); };
  W.__yield = (ms = 30) => new Promise(r => { const t = performance.now(); const spin = () => performance.now() - t >= ms ? r() : (q.push(spin), mc.port2.postMessage(0)); spin(); });
  W.__settle = async (max = 60) => {
    for (let i = 0; i < max; i++) {
      W.__frames(10); await W.__yield(30);
      if (W.__G.world.stream._queue.filter(j => j.d < 600).length === 0 && i > 3) break;
    }
    W.__frames(20);
  };
  // mean display RGB of 9x9 patches after one frame; __probe(pts, {name: hook}) re-runs env.update + hook per variant
  W.__px = (pts) => { W.__frames(1); const src = W.__renderer.domElement, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    return pts.map(([x, y]) => { const d = g.getImageData(x - 4, y - 4, 9, 9).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / 81 | 0, gg / 81 | 0, b / 81 | 0].join(','); }).join(' | '); };
  W.__probe = (pts, variants) => { const E = W.__env; if (!E.__origUpdate) E.__origUpdate = E.update; const out = {};
    for (const [k, hook] of Object.entries(variants)) { E.update = (...a) => { E.__origUpdate(...a); hook && hook(); }; out[k] = W.__px(pts); E.update = E.__origUpdate; }
    W.__frames(1); return out; };
  // GPU median ms of n frames (EXT_disjoint_timer_query_webgl2), hidden-tab safe; pre(i) runs before each frame
  W.__gpuMs = async (n = 40, pre = null) => {
    const gl = W.__renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return -1; const qs = [];
    W.__frames(5);
    for (let i = 0; i < n; i++) { pre && pre(i); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); W.__frames(1); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
    gl.finish(); const out = [];
    for (const q of qs) { for (let k = 0; k < 200 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await W.__yield(5); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
    out.sort((a, b) => a - b); return +out[Math.floor(out.length / 2)].toFixed(2);
  };
  W.__lookPerf = async (spots = ['house', 'mission24', 'chinatown'], time = 'noon') => {
    const [h, wx] = TIMES[time]; W.__setWx(wx); W.__env.state.hours = h; W.__env.state.paused = true; const out = {};
    for (const s of spots) { W.__lookCam(s); await W.__settle(); W.__lookCam(s); await W.__settle(); const r = []; for (let k = 0; k < 3; k++) r.push(await W.__gpuMs(40)); r.sort((a, b) => a - b);
      const I = W.__renderer.info; I.autoReset = false; I.reset(); W.__frames(1); const tr = +(I.render.triangles / 1e6).toFixed(2); I.autoReset = true; out[s] = { gpu: r[1], tris: tr }; }
    return out;
  };
  // dump any texture (e.g. a render target) to shots/<name>.jpg through a custom fragment shader (uniform tT, vUv)
  W.__dumpTex = async (tex, w, h, name, fs) => {
    const sky = W.__env.sky, R = W.__renderer;
    const Scene = W.__scene.constructor, Mesh = sky.mesh.constructor, BG = Object.getPrototypeOf(sky.mesh.geometry.constructor.prototype).constructor, BA = sky.mesh.geometry.attributes.position.constructor, RT = W.__env._dbg.eqRT.constructor, Cam = Object.getPrototypeOf(Object.getPrototypeOf(W.__camera)).constructor, SM = sky.material.constructor;
    const g = new BG(); g.setAttribute('position', new BA(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)); g.setAttribute('uv', new BA(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const m = new SM({ uniforms: { tT: { value: tex } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}', fragmentShader: fs || 'uniform sampler2D tT; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(tT,vUv).rgb, 1.0);}', depthTest: false });
    const q = new Mesh(g, m); q.frustumCulled = false; const sc = new Scene(); sc.add(q); const rt = new RT(w, h); R.setRenderTarget(rt); R.render(sc, new Cam()); const px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px); R.setRenderTarget(null);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const id = c.getContext('2d').createImageData(w, h); for (let y = 0; y < h; y++) id.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); c.getContext('2d').putImageData(id, 0, 0);
    await fetch('http://127.0.0.1:5191/__shot?name=' + name, { method: 'POST', body: c.toDataURL('image/jpeg', 0.9) }); rt.dispose(); m.dispose(); g.dispose(); return name;
  };
  // background job (the JS tool times out on long awaits): __run(fnReturningPromise) then poll __job
  W.__job = { busy: false };
  W.__run = (f) => {
    if (W.__job.busy) return 'busy';
    W.__job = { busy: true, r: null, e: null, t0: performance.now() };
    Promise.resolve().then(f).then(r => { W.__job.r = r; }, e => { W.__job.e = String(e && e.stack || e); }).finally(() => { W.__job.busy = false; W.__job.s = ((performance.now() - W.__job.t0) / 1000) | 0; });
    return 'started';
  };
})();
