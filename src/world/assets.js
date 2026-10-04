// Shared photo-scanned PBR material library (CC0, ambientCG) + HDRI skies (CC0, Poly Haven). See public/assets/ASSET_LICENSES.md.
//
// Usage (any module):
//   import { PBR } from '../world/assets.js';
//   const t = PBR.tex('brick_red');              // { map, normalMap, roughnessMap, aoMap, tile } (shared textures, RepeatWrapping)
//   const m = PBR.material('brick_red', { color: 0xffffff, roughness: 1, normalScale: 1 });  // a MeshStandardMaterial using them
// UVs: give geometry UVs in METRES divided by PBR.TILE[key] (or tile yourself), e.g. uv = worldPos.xz / PBR.TILE.asphalt.
// Keys: asphalt, concrete, concrete_rough, paving, brick_red, brick_tan, siding, stucco, painted_plaster, gravel_roof, roof_tiles,
//       metal, corrugated, grass, forest_floor, sand, rock, bark, wood_floor, fabric, tiles, marble, carpet, leather.
// Core outdoor keys are preloaded before the world builds; other keys start loading on first use (textures pop in when ready).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { packedUrl, loadPacked, texCap } from './texpack.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/';
export const TILE = { // metres covered by one texture repeat
  asphalt: 7, concrete: 3.2, concrete_rough: 3, paving: 2.4, brick_red: 2.2, brick_tan: 2.2, siding: 2.4, stucco: 3, painted_plaster: 2.5,
  gravel_roof: 3, roof_tiles: 2, metal: 2, corrugated: 2, grass: 3.5, forest_floor: 4, sand: 4, rock: 5, bark: 1.5,
  wood_floor: 2, fabric: 0.8, tiles: 1.2, marble: 2, carpet: 1.5, leather: 0.8,
};
const CORE = ['asphalt', 'concrete', 'concrete_rough', 'paving', 'brick_red', 'brick_tan', 'siding', 'stucco', 'painted_plaster', 'gravel_roof', 'roof_tiles', 'metal', 'corrugated', 'grass', 'forest_floor', 'sand', 'rock', 'bark'];
const MAPS = { map: 'color', normalMap: 'normal', roughnessMap: 'rough', aoMap: 'ao' };

let manifest = null, renderer = null;
const cache = new Map();
const loader = new THREE.TextureLoader();
const hdrLoader = new RGBELoader();
const hdris = {};

// preset texture cap (texpack.texCap): decode straight to the capped size (createImageBitmap resize is off-thread)
const capSize = (im) => { const c = texCap(), w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, k = Math.max(w, h) > c ? c / Math.max(w, h) : 1;
  return k < 1 ? { resizeWidth: Math.round(w * k), resizeHeight: Math.round(h * k), resizeQuality: 'high' } : {}; };
// (road 2) ground seen at grazing angles (road / sidewalk / paving) gets the GPU's full anisotropic filtering, the rest 8x
const GRAZE = new Set(['asphalt', 'concrete', 'paving']);
const aniso = (key) => !renderer ? 4 : Math.min(GRAZE.has(key) ? 16 : 8, renderer.capabilities.getMaxAnisotropy());
function makeTex(key, which) {
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = which === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso(key);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function load(key) {
  if (cache.has(key)) return cache.get(key);
  const info = manifest?.materials?.[key];
  const entry = { tile: TILE[key] || 2, ready: null };
  const jobs = [];
  for (const [slot, file] of Object.entries(MAPS)) {
    if (info && !info.maps.includes(file)) continue;
    const url = BASE + `tex/${key}/${file}.jpg`;
    if (slot !== 'normalMap' && packedUrl(url)) {   // BC1 .dds (tools/texpack.py): 1/8 the VRAM of the decoded JPEG
      const t = loadPacked(url, { srgb: slot === 'map', anisotropy: aniso(key), wrap: THREE.RepeatWrapping });
      entry[slot] = t; jobs.push(t.userData.ready); continue;
    }
    const t = makeTex(key, slot);
    entry[slot] = t;
    // img.decode() first: the JPEG decodes off the main thread instead of synchronously inside the first texImage2D
    // (2K maps: 40-80 ms each on the frame that first drew them)
    jobs.push(new Promise(res => loader.load(BASE + `tex/${key}/${file}.jpg`, img => {
      const im = img.image;
      // an ImageBitmap decodes off the main thread even while the page is hidden (img.decode() never settles there) and
      // uploads without a CPU flip / conversion: 2K maps went from 40-50 ms of texSubImage2D to a few ms. Pre-flipped
      // here (UNPACK_FLIP_Y is ignored for bitmaps), so the texture's flipY is off.
      const done = (src, bmp) => { t.image = src; if (bmp) t.flipY = false; t.needsUpdate = true; res(); };
      const fallback = () => Promise.race([(im.decode ? im.decode() : Promise.resolve()).catch(() => {}), new Promise(r => setTimeout(r, 2500))]).then(() => done(im, false));
      if (typeof createImageBitmap === 'function') createImageBitmap(im, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none', ...capSize(im) }).then(b => done(b, true), fallback);
      else fallback();
    }, undefined, () => res())));
  }
  entry.ready = Promise.all(jobs);
  cache.set(key, entry);
  return entry;
}

export const PBR = {
  TILE,
  tex(key) { return load(key); },
  // MeshStandardMaterial with the photo maps; opts are passed through (color tints the albedo)
  material(key, opts = {}) {
    const t = load(key);
    const { normalScale = 1, ...rest } = opts;
    const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0, ...rest });
    m.normalScale = new THREE.Vector2(normalScale, normalScale);
    return m;
  },
  hdri(key) { return hdris[key] || null; },
  get manifest() { return manifest; },
};

// preload the manifest, core materials and HDRIs. progress(0..1)
export async function loadAssets(r, progress = () => {}) {
  renderer = r;
  try { manifest = await (await fetch(BASE + 'manifest.json')).json(); } catch { manifest = null; }
  // the photo HDRIs (~150 MB of half floats in the JS heap, 4K storm = 64 MB) only feed the opt-in ?sky=hdri look
  // (render/hdrisky.js); the physical sky bakes its own IBL, so they aren't fetched at all by default
  const hdrKeys = manifest && typeof location !== 'undefined' && /[?&](sky=hdri|legacy)/.test(location.search) ? Object.keys(manifest.hdri) : [];
  let done = 0; const total = CORE.length + hdrKeys.length;
  const tick = () => progress(++done / total);
  const jobs = CORE.map(k => load(k).ready.then(tick));
  for (const k of hdrKeys) {
    jobs.push(new Promise(res => hdrLoader.load(BASE + `hdri/${k}.hdr`, t => { t.mapping = THREE.EquirectangularReflectionMapping; hdris[k] = t; t.userData.sun = findSun(t); tick(); res(); }, undefined, () => { tick(); res(); })));
  }
  await Promise.all(jobs);
  return PBR;
}

// brightest region of an equirect HDR -> sun direction (azimuth, elevation) so the engine can align it with its own sun
function findSun(t) {
  const { data, width: w, height: h } = t.image;
  const isHalf = data instanceof Uint16Array;
  const f = isHalf ? THREE.DataUtils.fromHalfFloat : (v => v);
  let best = -1, bi = 0, bj = 0;
  const step = 2;
  for (let j = 0; j < h / 2; j += step) for (let i = 0; i < w; i += step) {
    const k = (j * w + i) * 4;
    const l = f(data[k]) + f(data[k + 1]) + f(data[k + 2]);
    if (l > best) { best = l; bi = i; bj = j; }
  }
  const u = bi / w, v = bj / h;
  return { azimuth: (u - 0.5) * Math.PI * 2, elevation: (0.5 - v) * Math.PI, intensity: best };
}
