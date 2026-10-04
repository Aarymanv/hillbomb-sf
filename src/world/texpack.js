// GPU-compressed texture variants (tools/texpack.py): <name>.dds (BC1 opaque / BC3 alpha, full mip chain, pre-flipped to
// match the original's flipY) next to the JPG/PNG/WebP. BC1 = 0.5 B/px, BC3 = 1 B/px vs 4 B/px for the decoded image:
// the photo library + kit + baked atlases + tree atlases went from ~1.4 GB to ~0.2 GB of VRAM. Visual: BC1 of a JPEG at
// 1:1 texel scale, i.e. ~35 dB; normal maps stay uncompressed.
//   await initTexpack(renderer)        once at boot (manifest + extension check); ?texpack=0 disables
//   packedUrl(url) -> '.dds' url | null
//   loadPacked(url, opts) -> CompressedTexture (empty until loaded; tex.userData.ready resolves when filled)
//   texCap() -> max texture side for the current quality preset (images are downscaled on decode above it)
import * as THREE from 'three';
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/';
let files = null, cap = 8192;
const dds = new DDSLoader();
export async function initTexpack(renderer, quality = {}) {
  cap = quality.texCap || 8192;
  if (quality.legacy || (typeof location !== 'undefined' && /[?&]texpack=0/.test(location.search))) return;
  const gl = renderer.getContext();
  if (!gl.getExtension('WEBGL_compressed_texture_s3tc') || !gl.getExtension('WEBGL_compressed_texture_s3tc_srgb')) return;
  try { const j = await (await fetch(BASE + 'texpack.json')).json(); files = new Set(j.files); } catch { files = null; }
}
export const texCap = () => cap;
export const texpackOn = () => !!files;     // S3TC (+ sRGB) present and the manifest loaded: .dds variants are usable
const rel = (url) => { const i = url.indexOf('assets/'); return i < 0 ? null : url.slice(i + 7).split('?')[0]; };
export function packedUrl(url) { const r = files && rel(url); return r && files.has(r) ? url.split('?')[0].replace(/\.(jpe?g|png|webp)$/i, '.dds') : null; }

// a CompressedTexture that fills itself from the .dds; levels above the preset's texCap are dropped (a free downscale)
export function loadPacked(url, { srgb = false, anisotropy = 8, wrap = null, onLoad = null, onError = null } = {}) {
  const t = new THREE.CompressedTexture([], 4, 4, THREE.RGBA_S3TC_DXT5_Format);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy; t.flipY = false; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (wrap) t.wrapS = t.wrapT = wrap;
  t.userData.packed = true;
  t.userData.ready = fetch(packedUrl(url) || url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); }).then(buf => {
    const d = dds.parse(buf, true);
    let mips = d.mipmaps; while (mips.length > 1 && Math.max(mips[0].width, mips[0].height) > cap) mips = mips.slice(1);
    t.mipmaps = mips; t.image = { width: mips[0].width, height: mips[0].height }; t.format = d.format; t.needsUpdate = true;
    // the block data is only needed for the one upload: drop the JS copy after it (~200 MB of heap across the set)
    t.onUpdate = () => { for (const m of t.mipmaps) m.data = null; t.onUpdate = null; };
    onLoad?.(t); return t;
  }).catch(e => { console.warn('[texpack]', url, e); onError?.(e); return null; });
  return t;
}

// preset cap for textures that stay uncompressed (normal maps): a decoded image larger than texCap is redrawn at the cap
// (2D canvas, keeps the texture's flipY semantics). Returns the image itself when it fits (High / Ultra: always).
export function capImage(img) {
  const w = img?.naturalWidth || img?.width || 0, h = img?.naturalHeight || img?.height || 0;
  if (!w || !h || Math.max(w, h) <= cap || typeof document === 'undefined') return img;
  const k = cap / Math.max(w, h), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}
