// dev-only per-pass GPU + per-system CPU profiler (load in the game page after gpu.js / perf_drive.js).
//   await __gpuPass(frames = 20)  -> { total, sections: { label: medianMs }, draws, tris, programs }
//     GPU time per section via EXT_disjoint_timer_query_webgl2, one query open at a time (WebGL2 queries can't nest): every
//     section change ends the running query and starts the next one. Sections: composer passes (by class), every
//     renderer.render (scene / camera / target), shadow maps (per light map), and inside the main beauty render the draw
//     calls grouped by their top-level scene object (opaque vs transparent).
//   __drawCensus()  -> one frame's draws / triangles / program switches per top-level object (main beauty render only)
//   __cpuParts(frames) -> mean CPU ms per hooked update (stream, bld, props, traffic, systems...) over n frames
(() => {
  const W = window;
  const R = () => W.__renderer, gl = () => R().getContext();
  let cpuAcc = {}; const addCpu = (k, v) => { cpuAcc[k] = (cpuAcc[k] || 0) + v; };
  let on = false, stack = [], cur = null, curQ = null, frameRecs = null, mainDepth = 0, lastCat = null;
  const ext = () => gl().getExtension('EXT_disjoint_timer_query_webgl2');
  function sec(label) {
    if (!on) return;
    const g = gl(), e = ext();
    if (curQ) { g.endQuery(e.TIME_ELAPSED_EXT); frameRecs.push([cur, curQ]); curQ = null; }
    cur = label;
    if (label) { curQ = g.createQuery(); g.beginQuery(e.TIME_ELAPSED_EXT, curQ); }
  }
  const push = (label) => { stack.push(cur); sec(label); };
  const pop = () => { sec(stack.pop()); };
  // category = top-level object under the scene (+ the named object right under it, or the mesh name, when W.__profDeep)
  const topOf = (o) => { let p = o, sub = o.name || ''; while (p.parent && p.parent !== W.__scene) { if (p.name && p.parent.parent === W.__scene) sub = p.name; else if (!sub && p.name) sub = p.name; p = p.parent; } const top = p.name || p.type; if (/^car:|^site:|^festival/.test(top)) return top.replace(/:.*$/, ':*'); return W.__profDeep && sub && sub !== top ? top + '/' + sub.replace(/[-_ ]?\d+(\.\d+)?$/g, '').slice(0, 28) : top; };
  let installed = false; const census = { on: false, rows: {} };
  function install() {
    if (installed) return; installed = true;
    const r = R(), scene = W.__scene;
    const rr = r.render;
    r.render = function (sc, cam) {
      if (!on && !census.on) return rr.apply(this, arguments);
      const rt = r.getRenderTarget();
      const isMain = sc === scene;
      const lab = (cur || '').replace(/\$[0-9a-f]+\$export\$[0-9a-f]+/g, 'N8AO') + '>' + (isMain ? 'SCENE' : (sc.name || (sc.isMesh ? 'quad:' + (sc.material?.name || sc.material?.type) : sc.type))) + (isMain ? '[' + (cam.name || cam.type) + (rt ? '@' + rt.width + 'x' + rt.height : '@screen') + ']' : '');
      const main = isMain && cam === W.__camera;
      push(lab); if (main) mainDepth++; const t0 = performance.now();
      try { return rr.apply(this, arguments); } finally { if (on) addCpu('R ' + lab, performance.now() - t0); if (main) mainDepth--; lastCat = null; pop(); }
    };
    const sm = r.shadowMap, sr = sm.render;
    let shBase = null; const shIds = new Map();
    sm.render = function () { if (!on) return sr.apply(this, arguments); shBase = (cur || '') + '>shadow'; push(shBase); const md = mainDepth; mainDepth = 0; const t0 = performance.now(); try { return sr.apply(this, arguments); } finally { addCpu('S ' + shBase, performance.now() - t0); mainDepth = md; shBase = null; pop(); } };
    const srt = r.setRenderTarget;
    r.setRenderTarget = function (t) { if (on && shBase && t) { if (!shIds.has(t)) shIds.set(t, shIds.size); sec(shBase + '#' + shIds.get(t) + ':' + t.width); } return srt.apply(this, arguments); };
    const rbd = r.renderBufferDirect;
    r.renderBufferDirect = function (cam, sc, geo, mat, obj) {
      if ((on || census.on) && mainDepth > 0) {
        const cat = topOf(obj) + (mat.transparent ? ' (T)' : '');
        if (census.on) { const row = census.rows[cat] || (census.rows[cat] = { draws: 0, tris: 0, inst: 0 }); row.draws++; const n = geo.index ? geo.index.count : geo.attributes.position?.count || 0; const ic = obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1; row.tris += (geo.drawRange.count === Infinity ? n : Math.min(n, geo.drawRange.count)) / 3 * (ic === Infinity ? 1 : ic); if (ic > 1) row.inst++; }
        if (on && cat !== lastCat) { lastCat = cat; sec(String(cur).replace(/\|.*$/, '') + '|' + cat); }
        if (on) { const t0 = performance.now(); try { return rbd.apply(this, arguments); } finally { addCpu('D ' + cat, performance.now() - t0); } }
      }
      return rbd.apply(this, arguments);
    };
    // composer passes
    const passes = W.__G.post?.composer?.passes || [];
    for (const p of passes) { const f = p.render; const nm = p.constructor.name; p.render = function () { if (!on) return f.apply(this, arguments); push('P:' + nm.replace(/\$[0-9a-f]+\$export\$[0-9a-f]+/g, 'N8AO')); const t0 = performance.now(); try { return f.apply(this, arguments); } finally { addCpu('P ' + nm, performance.now() - t0); pop(); } }; }
    // env / world updates may render (IBL bake, clouds, LUTs, water reflection, grass capture)
    const wrapU = (obj, key, name) => { if (!obj || typeof obj[key] !== 'function') return; const f = obj[key]; obj[key] = function () { if (!on) return f.apply(this, arguments); push('U:' + name); const t0 = performance.now(); try { return f.apply(this, arguments); } finally { addCpu('U ' + name, performance.now() - t0); pop(); } }; };
    wrapU(W.__env, 'update', 'env'); wrapU(W.__world, 'update', 'world'); wrapU(W.__G, 'update', 'game');
  }
  W.__gpuPass = async (frames = 20) => {
    install();
    const g = gl(), e = ext(); if (!e) throw new Error('no timer ext');
    const all = []; cpuAcc = {}; let tcpu = 0;
    const px1 = new Uint8Array(4); for (let i = 0; i < 3; i++) { W.__frames(1); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px1); await new Promise(r => setTimeout(r, 0)); }
    for (let f = 0; f < frames; f++) {
      frameRecs = []; on = true; stack = []; cur = null; push('frame');
      const tf = performance.now(); W.__frame(1 / 60); tcpu += performance.now() - tf;
      pop(); sec(null); on = false;
      all.push(frameRecs);
      // GPU sync + a real task boundary: occlusion-query users (water reflection) only see results after a yield
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px1); await new Promise(r => setTimeout(r, 0));
    }
    g.finish();
    const per = {}; const tot = [];
    for (const recs of all) {
      const sum = {}; let t = 0;
      for (const [lab, q] of recs) {
        for (let k = 0; k < 200 && !g.getQueryParameter(q, g.QUERY_RESULT_AVAILABLE); k++) await new Promise(r => setTimeout(r, 5));
        const ms = g.getParameter(e.GPU_DISJOINT_EXT) ? NaN : g.getQueryParameter(q, g.QUERY_RESULT) / 1e6; g.deleteQuery(q);
        sum[lab] = (sum[lab] || 0) + ms; t += ms;
      }
      for (const k in sum) (per[k] = per[k] || []).push(sum[k]);
      tot.push(t);
    }
    const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
    const sections = {};
    for (const k in per) { const m = per[k].reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) / frames; if (m > 0.05) sections[k] = +m.toFixed(2); }
    const sorted = Object.fromEntries(Object.entries(sections).sort((a, b) => b[1] - a[1]));
    const cpu = { frame: +(tcpu / frames).toFixed(2) }; for (const [k, v] of Object.entries(cpuAcc).sort((a, b) => b[1] - a[1])) if (v / frames > 0.08) cpu[k.replace(/\$[0-9a-f]+\$export\$[0-9a-f]+/g, 'N8AO')] = +(v / frames).toFixed(2);
    return { total: +med(tot).toFixed(2), sections: sorted, cpu };
  };
  // roll section labels up into coarse buckets
  W.__gpuRoll = (sections) => {
    const b = {};
    for (const [k, v] of Object.entries(sections)) {
      let key;
      const m = /\|(.*)$/.exec(k);
      if (/shadow#/.test(k)) key = 'shadow' + k.replace(/^.*shadow#/, '#') + (k.includes('U:') ? ' (' + k.split('>')[0] + ')' : '');
      else if (m && /P:N8AO/.test(k)) key = 'main: ' + m[1];
      else if (m) key = 'scene(other ' + k.split('>').slice(-1)[0].split('|')[0] + '): ' + m[1];
      else key = k.replace(/^frame>?/, '');
      b[key] = +((b[key] || 0) + v).toFixed(2);
    }
    return Object.fromEntries(Object.entries(b).sort((a, c) => c[1] - a[1]));
  };
  W.__drawCensus = () => {
    install(); const info = R().info; census.rows = {}; census.on = true;
    const ar = info.autoReset; info.autoReset = false; info.reset();
    W.__frame(1 / 60); census.on = false; info.autoReset = ar;
    const tot = { calls: info.render.calls, tris: info.render.triangles, programs: info.programs?.length, geos: info.memory.geometries, tex: info.memory.textures };
    info.reset();
    const rows = Object.entries(census.rows).sort((a, b) => b[1].draws - a[1].draws).map(([k, v]) => [k, v.draws, Math.round(v.tris / 1000) + 'k', v.inst]);
    return { tot, mainDraws: rows.reduce((a, r) => a + r[1], 0), rows };
  };
  // CPU: mean ms per hooked update over n frames (hooks installed once; perf_drive's instrument() already wraps most)
  W.__cpuParts = async (frames = 60, move) => {
    const parts = W.__perfParts || (W.__perfDrive && null);
    if (!W.__perfParts) throw new Error('load perf_drive.js and run one __perfDrive first (installs the hooks)');
    const acc = {}; let tf = 0; const gl = R().getContext(), px1 = new Uint8Array(4);
    for (let i = 0; i < frames; i++) { for (const k in parts) parts[k] = 0; move?.(i); const t = performance.now(); W.__frame(1 / 60); tf += performance.now() - t; for (const k in parts) acc[k] = (acc[k] || 0) + parts[k]; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); await new Promise(r => setTimeout(r, 0)); }
    const out = { frameCpu: +(tf / frames).toFixed(2) };
    for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1])) if (v / frames > 0.05 && !k.startsWith('gl.')) out[k] = +(v / frames).toFixed(2);
    return out;
  };
})();
