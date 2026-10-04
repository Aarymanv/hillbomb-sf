// (perf r3 10/4) Texture uploads off the first-draw frame. three uploads a texture the first time a draw samples it, so
// shared atlases that load early but are first SEEN mid-drive froze that frame: a 4096^2 PNG normal map (facade_nrm)
// 130-180 ms (synchronous image decode inside texSubImage2D), kit / tree / interior 2-3K JPEG / WebP maps 26-90 ms,
// 2K ImageBitmaps 7-11 ms (dev/perf_rt2.js runs, GL call timing).
//  * every image texture that becomes ready (Texture.needsUpdate = true with an <img> / ImageBitmap / compressed mips)
//    joins a queue and is uploaded by renderer.initTexture() from the frame loop, a little per frame (TEX_MS budget,
//    the first one of a frame always goes), usually long before anything draws it;
//  * large <img> sources (>= 1 Mpx) are first converted to an ImageBitmap with createImageBitmap (decoded off the main
//    thread; flipY / premultiply baked in the same way the GL unpack flags would apply them, colour-space conversion
//    'none' like three's UNPACK_COLORSPACE_CONVERSION NONE): the upload is then a copy, ~4x cheaper.
//  * boot: flush() uploads everything pending behind the loading screen.
// ?notexwarm = off (render/perfflags.js).
import * as THREE from 'three';
import { PERF } from './perfflags.js';

const TEX_MS = 2.5, BIG = 1 << 20;
const pending = new Set(), converting = new Set();
const stats = { queued: 0, uploaded: 0, converted: 0, ms: 0, maxMs: 0, skipped: 0 };
let renderer = null;

function kind(t) {
  if (!t || t.isDataTexture || t.isDataArrayTexture || t.isData3DTexture || t.isCanvasTexture || t.isVideoTexture || t.isDepthTexture || t.isRenderTargetTexture || t.isFramebufferTexture || t.isCubeTexture) return 0;
  const im = t.image; if (!im) return 0;
  if (t.isCompressedTexture) return t.mipmaps?.length ? 3 : 0;
  if (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) return im.complete && im.naturalWidth ? 1 : 0;
  if (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) return 2;
  return 0;
}
// hook: Texture.needsUpdate is a setter that bumps .version; queue image textures when they become ready
if (PERF.texwarm && !THREE.Texture.prototype.__hbWarm) {
  const d = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, 'needsUpdate');
  if (d?.set) {
    Object.defineProperty(THREE.Texture.prototype, 'needsUpdate', {
      configurable: true, get: d.get,
      // (small ImageBitmaps, i.e. the Google photo tiles' 256-512 px textures, ~36 / s while driving, cost ~0.2 ms at
      // first draw: not queued, so they never sit in front of the big ones)
      set(v) { d.set.call(this, v); if (v === true && kind(this) && !(this.image instanceof ImageBitmap && px(this) <= 512 * 512)) { if (!pending.has(this)) stats.queued++; pending.add(this); } },
    });
    const dispose = THREE.Texture.prototype.dispose;
    THREE.Texture.prototype.dispose = function () { pending.delete(this); converting.delete(this); return dispose.apply(this, arguments); };
    THREE.Texture.prototype.__hbWarm = true;
  }
}
const px = (t) => { const im = t.isCompressedTexture ? t.mipmaps[0] : t.image; return (im?.width || 0) * (im?.height || 0); };
const uploaded = (t) => { const p = renderer.properties.get(t); return p.__webglTexture !== undefined && p.__version === t.version; };
function convert(t) {
  const im = t.image; converting.add(t);
  createImageBitmap(im, { imageOrientation: t.flipY ? 'flipY' : 'from-image', premultiplyAlpha: t.premultiplyAlpha ? 'premultiply' : 'none', colorSpaceConversion: 'none' })
    .then((bm) => {
      const live = converting.delete(t);
      if (!live || t.image !== im || !renderer) { bm.close?.(); return; }
      if (uploaded(t)) { bm.close?.(); return; }      // drawn (and uploaded from the <img>) meanwhile: keep that
      t.image = bm; t.flipY = false; t.premultiplyAlpha = false; t.userData.hbBitmap = true; stats.converted++;
      t.needsUpdate = true;                            // re-queues it
    })
    .catch(() => { converting.delete(t); t.userData.hbNoConvert = true; pending.add(t); });
}
function upOne(t) {
  const t0 = performance.now();
  try { renderer.initTexture(t); } catch (e) { stats.skipped++; }
  const d = performance.now() - t0; stats.uploaded++; stats.ms += d; if (d > stats.maxMs) stats.maxMs = d;
  return d;
}
export const texWarm = {
  stats, pending,
  install(r) { renderer = r; return texWarm; },
  // per frame: upload pending textures within the budget (the first of a frame always goes)
  update(ms = TEX_MS) {
    if (!renderer || !PERF.texwarm || !pending.size) return;
    const t0 = performance.now(); let n = 0;
    for (const t of pending) {
      if (n && performance.now() - t0 > ms) break;
      pending.delete(t);
      const k = kind(t);
      if (!k || uploaded(t)) continue;
      if (k === 1 && px(t) >= BIG && !t.userData.hbNoConvert && typeof createImageBitmap === 'function') { if (!converting.has(t)) convert(t); continue; }
      upOne(t); n++;
    }
  },
  // boot: wait for running conversions (<= maxWaitMs), then upload everything pending
  async flush(maxWaitMs = 4000) {
    if (!renderer || !PERF.texwarm) return;
    for (const t of pending) if (kind(t) === 1 && px(t) >= BIG && !t.userData.hbNoConvert && typeof createImageBitmap === 'function' && !converting.has(t)) { pending.delete(t); convert(t); }
    const tw = performance.now();
    while (converting.size && performance.now() - tw < maxWaitMs) await new Promise(r => setTimeout(r, 20));
    this.update(Infinity);
  },
};
if (typeof window !== 'undefined') window.__texWarm = texWarm;
