// (perf 10/4) No first-use shader stalls while playing. ANGLE / D3D11 compiles our big patched shaders in 0.1-0.8 s, and
// three blocks on an object's first draw with a new program (onFirstUse -> getProgramInfoLog / getProgramParameter wait for
// the link): streamed peds (366-445 ms), interior sites (783 ms), landmark LODs first seen in the water reflection
// (391-443 ms) froze the game for that long.
// With KHR_parallel_shader_compile the compile + link run in the GPU process' background; only the first status query
// blocks. While a draw of the game scene is in flight, that query on a program that is not complete yet throws a sentinel
// instead; the draw is skipped (three keeps the program on the material and retries its first use next frame) and the
// object appears once its program is ready (a late pop-in, <= MAX_WAIT_MS, instead of a freeze).
// Only draws of the game scene (main view, water reflection, car probe) are guarded; shadow-depth / full-screen pass /
// boot compiles block as before. ?noshaderwarm (render/perfflags.js) = off.
import { PERF } from './perfflags.js';
const NOT_READY = { hbShaderNotReady: true };
// a burst of new programs (teleport into a fresh district: ~40) queues in the compiler for many seconds: past this an object
// is drawn anyway (its first draw waits for the rest of the compile, as before) so nothing stays invisible for long
const MAX_WAIT_MS = 600;
export function installShaderWarm(renderer, { scene: world = null } = {}) {
  const gl = renderer.getContext();
  const par = gl.getExtension('KHR_parallel_shader_compile');
  // dev: waiting = program -> [skipped draws, first frame, ms since first skip]; waits = [[frames, ms, draws]] of the ones that got ready
  const api = { enabled: !!par, stats: { skipped: 0, programs: 0, timedOut: 0 }, waiting: new Map(), waits: [] };
  if (!par) return api;
  const COMPLETE = par.COMPLETION_STATUS_KHR || 0x91B1;
  const ready = new WeakSet();
  const gpp = gl.getProgramParameter.bind(gl), gpl = gl.getProgramInfoLog.bind(gl);
  let guard = false;
  const check = (p) => {
    if (!guard || !p || ready.has(p)) return;
    const w = api.waiting.get(p);
    if (gpp(p, COMPLETE)) { ready.add(p); if (w) { api.waiting.delete(p); if (api.waits.length < 500) api.waits.push([renderer.info.render.frame - w[1], Math.round(performance.now() - w[2]), w[0]]); } return; }
    if (!w) { api.stats.programs++; api.waiting.set(p, [1, renderer.info.render.frame, performance.now()]); }
    else if (performance.now() - w[2] > MAX_WAIT_MS) { ready.add(p); api.waiting.delete(p); api.stats.timedOut++; return; }   // draw (blocks for the rest)
    else w[0]++;
    throw NOT_READY;
  };
  gl.getProgramParameter = function (p, pname) { if (pname !== COMPLETE) check(p); return gpp(p, pname); };
  gl.getProgramInfoLog = function (p) { check(p); return gpl(p); };
  const rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!PERF.shaderwarm || guard || !scene || (world && scene !== world)) return rbd.apply(this, arguments);
    guard = true;
    try { return rbd.apply(this, arguments); }
    catch (e) { if (e !== NOT_READY) throw e; api.stats.skipped++; }
    finally { guard = false; }
  };
  return api;
}
