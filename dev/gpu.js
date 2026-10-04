// dev-only GPU timing (EXT_disjoint_timer_query_webgl2): __gpu(n) median ms of n frames; __gpuAt(place) settles first
window.__gpu = async (n = 60) => { const gl = window.__renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); const qs = [];
  window.__frames(5);
  for (let i = 0; i < n; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); window.__frames(1); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
  gl.finish(); const out = [];
  for (const q of qs) { for (let k = 0; k < 50 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await (window.__wait ? window.__wait(10) : new Promise(r => setTimeout(r, 10))); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
  out.sort((a, b) => a - b); return +out[Math.floor(out.length / 2)].toFixed(2); };
window.__gpuAt = async (pl, reps = 3) => { window.__manual = true; window.__placeCam(pl); for (let k = 0; k < 60; k++) { window.__frames(10); await new Promise(r => setTimeout(r, 60)); const st = window.__world.buildings.stats; if (k > 4 && !st.queued && !st.inflight && !window.__world.stream.stats.pending) break; } window.__placeCam(pl); const r = []; for (let k = 0; k < reps; k++) r.push(await window.__gpu(40)); r.sort((a, b) => a - b); return { pl, gpu: r[Math.floor(r.length / 2)], all: r }; };
