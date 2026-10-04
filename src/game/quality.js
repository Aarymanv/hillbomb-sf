// Graphics presets, first-run auto-detect + benchmark, dynamic resolution.
// Presets: low / medium / high / ultra. 'ultra' runs every 'high' code path (quality.name === 'high') plus the 4096
// sun shadow map, a sharper Google-tiles target and a bigger tile cache; quality.preset holds the real choice.
// GPU memory (dev/memtrack.js, 1440p): low < 2 GB, high < 3.5 GB.
//   texCap     max texture side kept on the GPU (texpack drops .dds top mips / downsizes JPEG decodes above it)
//   tilesMB    Google 3D tiles LRU cache (geometry + textures), tilesError = screen-space error target (px)
//   facadeRes  procedural facade texture-array layer size (24 layers x albedo + normal: 1024 = 256 MB, 512 = 64 MB)
const DPR = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
export const PRESETS = {
  low: { shadows: 0, msaa: 0, pixelRatio: 1, traffic: 14, texCap: 1024, tilesMB: 160, tilesError: 24, minScale: 0.5, facadeRes: 512 },
  medium: { shadows: 1, msaa: 2, pixelRatio: Math.min(DPR, 1.25), traffic: 20, texCap: 2048, tilesMB: 240, tilesError: 16, minScale: 0.6 },
  high: { shadows: 1, msaa: 4, pixelRatio: Math.min(DPR, 1.5), traffic: 26, texCap: 8192, tilesMB: 300, tilesError: 12, minScale: 0.65 },
  ultra: { shadows: 2, msaa: 4, pixelRatio: Math.min(DPR, 2), traffic: 30, texCap: 8192, tilesMB: 520, tilesError: 10, minScale: 0.7 },
};
const ORDER = ['low', 'medium', 'high', 'ultra'];
const SAVE = 'hillbomb.save.v1';

// GPU string heuristic (WEBGL_debug_renderer_info): discrete current-gen -> high, older / entry -> medium, integrated -> low
export function detectPreset() {
  let gpu = '';
  try { const gl = document.createElement('canvas').getContext('webgl2'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || ''); gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* no webgl2 */ }
  let p = 'medium';
  const rtx = /RTX\s*(?:A?)(\d{2})(\d{2})/i.exec(gpu), rx = /RX\s*(\d)(\d)(\d)0/i.exec(gpu);
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) p = 'low';
  else if (/Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple M\d(?!.*(Max|Ultra|Pro))|Radeon\(TM\) Graphics|Vega \d+ Graphics/i.test(gpu) && !/Arc/i.test(gpu)) p = 'low';
  else if (rtx) p = (+rtx[1] >= 30 && +rtx[2] >= 60) || +rtx[1] >= 40 ? 'high' : 'medium';
  else if (rx) p = +rx[1] >= 6 && +rx[2] >= 7 ? 'high' : 'medium';
  else if (/Apple M\d (Max|Ultra|Pro)/i.test(gpu)) p = 'high';
  if ((navigator.deviceMemory || 8) <= 4 && p !== 'low') p = 'low';
  return { preset: p, gpu };
}

// URL ?q= > saved setting > auto-detect (first run). Returns the quality object handed to every system.
let memo = null;
export const currentQuality = () => memo || (typeof window === 'undefined' ? PRESETS.high : resolveQuality(new URLSearchParams(location.search)));
export function resolveQuality(params) {
  if (memo) return memo;
  let saved = null; try { saved = JSON.parse(localStorage.getItem(SAVE) || '{}').settings || null; } catch { /* private mode */ }
  let preset = params.get('q'), auto = false, gpu = '';
  if (!preset) preset = saved?.quality && !saved.qualityAuto ? saved.quality : null;
  if (!preset && saved?.quality && saved.qualityAuto) { preset = saved.quality; auto = true; }
  if (!PRESETS[preset]) { const d = detectPreset(); preset = d.preset; gpu = d.gpu; auto = true; }
  const q = { ...PRESETS[preset], name: preset === 'ultra' ? 'high' : preset, preset, auto, gpu };
  // ?legacy = the pre-9/30 memory behaviour for A/B (uncompressed textures, geometry kept in the JS heap, 520 MB tile cache)
  if (params.has('legacy')) Object.assign(q, { legacy: true, tilesMB: 520, tilesMin: 307, texCap: 8192, facadeRes: 1024 });
  return (memo = q);
}

// first run on an auto-picked preset: median frame interval over ~20 s of driving; too slow -> one preset lower for the
// next launch (dynamic resolution covers the current session). Saved settings.quality + qualityAuto stay in sync.
export function installQualityBenchmark(G, quality) {
  const s = G.economy?.settings; if (!s) return;
  if (quality.auto) { s.quality = quality.preset; s.qualityAuto = true; }
  if (!quality.auto || s.qualityBench) return;
  const iv = []; let last = 0;
  G.systems.push({ name: 'qbench', update() {
    if (s.qualityBench || G.state !== 'play' || window.__manual || document.hidden) { last = 0; return; }
    const t = performance.now(); if (last) iv.push(t - last); last = t;
    if (iv.length < 1200) return;
    iv.sort((a, b) => a - b); const med = iv[iv.length >> 1], i = ORDER.indexOf(quality.preset);
    s.qualityBench = { med: +med.toFixed(1), preset: quality.preset };
    if (med > 24 && i > 0) { s.quality = ORDER[i - 1]; G.hud?.toast?.('Graphics', `Running at ${Math.round(1000 / med)} fps: ${ORDER[i - 1]} preset from the next launch (Settings > Graphics)`, '', 6000); }
    G.economy.save?.();
  } });
}

// dynamic resolution: steps the render scale (pixel ratio x scale) so the frame's work fits ~60 fps. The load is
// max(CPU ms of frame(), GPU ms from EXT_disjoint_timer_query_webgl2), not the rAF interval (which sits at the vsync
// period on a 60 Hz panel and could never show headroom). Down fast (0.75 s over), up slow (4 s with 30 % headroom).
// Without the timer extension it falls back to the interval. Each step re-allocates the composer targets once.
//   update(active, cpuMs) after each real frame; .enabled, .scale, .load (smoothed ms)
export function createDynRes({ renderer, post, quality, enabled = true }) {
  const STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5].filter(v => v >= (quality.minScale ?? 0.6) - 1e-6);
  const gl = renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pend = []; let open = null, gpuMs = 0;
  let base = renderer.getPixelRatio(), applied = base, k = 0, ema = 12, over = 0, under = 0, last = 0, cool = 0;
  const api = {
    enabled, budget: 1000 / 60 * 0.95,
    get scale() { return STEPS[k]; }, get load() { return ema; },
    apply(i) {
      k = Math.max(0, Math.min(STEPS.length - 1, i)); applied = base * STEPS[k];
      renderer.setPixelRatio(applied); post?.composer?.setPixelRatio?.(applied);
      renderer.setSize(innerWidth, innerHeight); post?.setSize?.(innerWidth, innerHeight);
      over = under = 0; cool = 90;
    },
    // call right before the frame's render work (opens the GPU timer)
    begin() { if (!tq || !api.enabled || open || pend.length > 3) return; open = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, open); },
    update(active, cpuMs = 0) {
      if (open) { gl.endQuery(tq.TIME_ELAPSED_EXT); pend.push(open); open = null; }
      while (pend.length && gl.getQueryParameter(pend[0], gl.QUERY_RESULT_AVAILABLE)) { const q = pend.shift(); if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); }
      const t = performance.now(), dt = last ? t - last : 16.7; last = t;
      if (Math.abs(renderer.getPixelRatio() - applied) > 1e-6) { base = renderer.getPixelRatio(); applied = base; k = 0; }   // someone else (creative res, photo) set it
      if (!api.enabled || !active || document.hidden || dt > 250) { if (!api.enabled && k) api.apply(0); over = under = 0; return; }
      const work = tq ? Math.max(cpuMs, gpuMs) : dt;
      ema += (Math.min(work, 100) - ema) * 0.08;
      if (cool > 0) { cool--; return; }
      if (ema > api.budget) { over++; under = 0; } else if (ema < api.budget * 0.7) { under++; over = 0; } else { over = Math.max(0, over - 1); under = 0; }
      if (over > 45 && k < STEPS.length - 1) api.apply(k + 1);
      else if (under > 240 && k > 0) api.apply(k - 1);
    },
  };
  return api;
}
