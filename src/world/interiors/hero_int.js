// Walk-in interiors of the Blender-baked hero landmarks (St. Francis lobby, Neiman rotunda, Apple hall, Garden Court ...).
// Same contract as sys_interiors: on foot, press E at the door -> fade -> teleport inside; E at the inside door leaves.
// Assets: public/assets/landmarks/<id>/<id>_int.glb (nodes I_<slot>) + <id>_int_lm.jpg (Cycles lightmap, uv1, gamma-encoded,
// scale = interior.lmScale), lazy-loaded within LOAD_R of the door, disposed beyond DROP_R. Lighting is ALL baked: the
// interior materials drop direct/sky light and use the lightmap as irradiance plus a one-shot local reflection probe.
// Rooms also register as pseudo-sites in G.interiors.sites so weather (no rain) and audio (indoor bed) treat them as indoors.
// Day / night: a second, half-res lightmap (<id>_int_lmn, lamps only) is blended in by env.night; 'sky' window panels
// take the time of day (horizon colour by day, dark skyglow at night). Interiors without a night map dim their daylight.
// Budget: lightmaps are BC1 .dds (hero_int_pack.py; 2.7 MB per 2K map instead of 21 MB RGBA8 + mips) when the GPU has
// S3TC (?texpack=0 = JPEG), at most MAX_LIVE interiors are resident (nearest doors first), all GPU memory is freed on drop.
// Life: hero_int_life.js (idle people at the meta `spots`, murmur bed + hall reverb on the effects bus while inside).
import * as THREE from 'three';
import { HERO_SITES } from '../landmarks/v2/hero_sites.js';
import { heroLoader, prepHero } from '../landmarks/v2/hero_lm.js';
import { PBR } from '../assets.js';
import { loadPacked } from '../texpack.js';
import { createInteriorLife } from './hero_int_life.js';
import { HERO_INT_EXPO } from './hero_int_expo.js';
import { PERF } from '../../render/perfflags.js';

// white balance by the kind of fixtures: warm incandescent / sodium-warm hotels, theatres, churches, restaurants (~2900 K),
// neutral LED stores, offices, arenas (~4000 K), daylight glasshouses and observation floors (~5500 K)
const WB = { warm: [1.06, 0.98, 0.86], neutral: [1.0, 0.995, 0.97], day: [0.96, 0.99, 1.04] };
function wbOf(it) {
  const n = (it.I.name || '') + ' ' + it.id;
  if (/conservatory|academy|rainforest|observation|deYoung|exploratorium|science|fortPoint|alcatraz/i.test(n)) return WB.day;
  if (/apple|salesforce|transamerica|arena|chase|embarcadero|galleria|hobart|mills|phelan|library|saks|macys|mayfield|saxton|pier/i.test(n)) return WB.neutral;
  return WB.warm;
}

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/landmarks/';
const LOAD_R = 110, DROP_R = 200, SHOW_R = 70, MAX_LIVE = 3;
const TEXKEY = { brickred: 'brick_red', brick: 'brick_tan', stucco: 'stucco', marble: 'marble', granite: 'marble', wood: 'wood_floor', plaster: 'painted_plaster', carpet: 'carpet', fabric: 'fabric', leather: 'leather', tiles: 'tiles', concrete: 'concrete', stone: 'painted_plaster', paving: 'paving' };
const TILE = { brickred: 2.2, brick: 2.2, stucco: 2.5, marble: 1.6, granite: 1.2, wood: 1.6, plaster: 2.5, carpet: 1.2, fabric: 0.8, leather: 0.8, tiles: 1.2, concrete: 3, stone: 2.5, paving: 2.4 };
const ROUGH = { chrome: 0.04, marble: 0.12, granite: 0.18, wood: 0.45, plaster: 0.85, carpet: 1, fabric: 0.95, leather: 0.5, tiles: 0.3, gold: 0.3, metal: 0.35, paint: 0.55, leaf: 0.7, glassI: 0.05 };
const EMIT = { sky: 1.8, crystal: 3.2, lampI: 4.5, screen: 1.5, stained: 2.4, neonI: 3.5, ceilglow: 0.9 };
const DAYLIT = { sky: 1, stained: 1 };    // emissive slots that follow the time of day
// per: manual lightmap scale overrides; auto: interiors with a baked median irradiance (meta lmMed) are pulled toward the
// median of all interiors by (median / lmMed)^auto (0 = off, 0.5 = halfway), so a white store and a dark nave don't
// end up 4x apart on screen (the old Macy's / Saks blow-out)
// propIbl / detailIbl: diffuse gain of the probe light on props and on 'd_' detail geometry (one probe at the room centre
// under-lights seats and tables standing in the lamp-lit parts of a room)
export const HERO_INT_TUNE = { lm: 1.0, refl: 0.9, expoRef: 1.0, auto: 0.65, propIbl: 1.35, detailIbl: 2.4, leafGlow: 0.55,
  detailPer: { chase: 4.0, alcatraz: 3.0 }, propPer: { chase: 2.0, alcatraz: 2.0, academy: 1.8, conservatory: 1.8 }, per: {} };

// ---- shared texture library: 'x_<key>' slots = public/assets/landmarks/_itex/<key>/{color,rough,normal}.dds (int_assets.py),
// 'p_<asset>__<k>' slots = Poly Haven props, textures in _iprops/<asset>/ (int_props_pack.py). Ref-counted per interior.
const TEXC = new Map();
let LIB = null, libP = null;
export function loadLib() { return libP || (libP = fetch(BASE + '_itex/lib.json').then(r => r.json()).then(j => (LIB = j)).catch(() => (LIB = {}))); }
function texRef(it, url, srgb, wrap, flipped) {
  let e = TEXC.get(url);
  if (!e) {
    const t = loadPacked(url, { srgb, anisotropy: 8, wrap: wrap ? THREE.RepeatWrapping : null });
    e = { t, refs: 0 }; TEXC.set(url, e);
  }
  e.refs++; it.texRefs.push(url);
  return e.t;
}
function texUnref(it) {
  for (const url of it.texRefs) { const e = TEXC.get(url); if (e && --e.refs <= 0) { e.t.dispose(); TEXC.delete(url); } }
  it.texRefs.length = 0;
}
// roughness floor per library material: polished stone reads polished, not wet glass (box-projected reflections are approximate)
const RMIN = { marble_white: 0.16, marble_cream: 0.16, marble_black: 0.14, marble_grey: 0.16, marble_siena: 0.16, checker: 0.16, onyx: 0.12, travertine: 0.32,
  terrazzo: 0.22, mosaic: 0.26, parquet: 0.3, wood_dark: 0.3, veneer: 0.26, cherry: 0.24, wood_floor: 0.32, gold: 0.18, brass: 0.22, bronze: 0.3 };
const NM = `vec3 hbNm(vec4 t) { vec2 xy = t.ag * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }`;
// box-projected reflections: the probe's room box (room-local, yawed) re-aims each reflection ray at the box wall it hits
const BOX = `uniform vec3 uPrC; uniform vec2 uPrCS; uniform vec3 uPrMin; uniform vec3 uPrMax; uniform vec3 uPrP; varying vec3 vHbW;
vec3 hbBox(vec3 rv) {
  vec3 p = vHbW - uPrC;
  vec3 lp = vec3(uPrCS.x * p.x - uPrCS.y * p.z, p.y, uPrCS.y * p.x + uPrCS.x * p.z);
  vec3 lr = vec3(uPrCS.x * rv.x - uPrCS.y * rv.z, rv.y, uPrCS.y * rv.x + uPrCS.x * rv.z);
  if (any(lessThan(lp, uPrMin - 0.05)) || any(greaterThan(lp, uPrMax + 0.05))) return rv;
  vec3 t = max((uPrMax - lp) / lr, (uPrMin - lp) / lr);
  float k = min(min(t.x, t.y), t.z);
  vec3 d = lp + lr * k - uPrP;
  return normalize(vec3(uPrCS.x * d.x + uPrCS.y * d.z, d.y, -uPrCS.y * d.x + uPrCS.x * d.z));
}`;

function lmMaterial(slot, it, detail = false) {
  // 'd_<slot>': small detail geometry baked without lightmap texels (seat rows, lettering): the slot's material, probe-lit
  if (slot.startsWith('d_')) return lmMaterial(slot.slice(2), it, true);
  // baked shop-sign atlas (hero_signs.py): unlit, alpha-tested lettering
  if (slot === 'signI') { const m = new THREE.MeshBasicMaterial({ map: it.signTex || null, transparent: false, alphaTest: 0.35, vertexColors: false }); m.color.setScalar(1.6); return m; }
  if (EMIT[slot]) {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true }); m.color.setScalar(EMIT[slot] * Math.sqrt(it.expo));
    if (!DAYLIT[slot]) { m.userData.emit = EMIT[slot] * Math.sqrt(it.expo); it.emits.push(m); }
    if (DAYLIT[slot]) { m.userData.daylit = EMIT[slot]; it.daylit.push(m); }
    return m;
  }
  // interior glass: unlit tint (a lit standard material picked up the adapted moon / sky at night and glowed white)
  if (slot === 'glassI' || slot === 'clear') { const m = new THREE.MeshBasicMaterial({ color: 0x9aa4a8, transparent: true, opacity: 0.14, depthWrite: false }); m.fog = false; return m; }
  let P, tile = TILE[slot] || 2, nm = false, alphaTest = 0, alb = null, prop = false, rmin = 0, leaf = false;
  if (slot.startsWith('x_') && LIB?.[slot.slice(2)]) {
    const key = slot.slice(2), L = LIB[key], d = BASE + '_itex/' + key + '/';
    const rough = texRef(it, d + 'rough.dds', false, true);
    P = { map: texRef(it, d + 'color.dds', true, true), roughnessMap: rough, metalnessMap: rough, normalMap: L.normal ? texRef(it, d + 'normal.dds', false, true) : null,
      roughness: 1, metalness: 1, vertexColors: true };
    tile = L.tile; nm = !!L.normal; alb = L.albedo; rmin = RMIN[key] || 0;
  } else if (slot.startsWith('p_') && it.I.props?.[slot]) {
    const M = it.I.props[slot], d = M.ext ? BASE.replace(/landmarks\/$/, '') + M.ext : BASE + '_iprops/' + M.asset + '/', dd = (f) => d + f.replace(/\.(jpe?g|png|webp)$/i, '.dds');
    const arm = M.arm ? texRef(it, dd(M.arm), false, true) : null;
    P = { map: M.diff ? texRef(it, dd(M.diff), true, true) : null, roughnessMap: arm, metalnessMap: arm, aoMap: arm, normalMap: M.nor ? texRef(it, dd(M.nor), false, true) : null,
      roughness: arm ? 1 : 0.7, metalness: arm ? 1 : 0, vertexColors: false, side: M.alpha ? THREE.DoubleSide : THREE.FrontSide };
    prop = true; leaf = !!M.ext;
    tile = 1; nm = !!M.nor; alphaTest = M.alpha ? (M.ext ? 0.5 : 0.4) : 0;
  } else {
    const key = TEXKEY[slot], t = key ? PBR.tex(key) : null;
    P = { map: t?.map || null, normalMap: t?.normalMap || null, roughnessMap: (slot === 'marble' || slot === 'granite') ? null : (t?.roughnessMap || null),
      roughness: ROUGH[slot] ?? 0.8, metalness: slot === 'gold' || slot === 'metal' || slot === 'chrome' ? 1 : 0, vertexColors: true };
  }
  if (detail && !EMIT[slot]) prop = true;
  // props have no lightmap: lit by the room's box-projected probe (diffuse + specular IBL), AO from their ARM texture
  const m = new THREE.MeshStandardMaterial({ ...P, lightMap: prop ? null : it.lmTex, lightMapIntensity: (it.I.lmScale || 1) * Math.PI });
  // foliage (the game's leaf / bark atlas, premultiplied alpha): un-premultiply, and light coming THROUGH the leaves
  // (translucency as an emissive of the leaf colour, gone at night): leaf cards lit only by the probe read near-black
  if (leaf) { m.emissive.setScalar(HERO_INT_TUNE.leafGlow); m.emissiveMap = m.map; }
  if (alphaTest) m.alphaTest = alphaTest;
  if (m.normalMap) m.normalScale.set(nm ? 1 : 0.5, nm ? 1 : 0.5);
  // library slots: the texture is a luminance detail map around its own mean, the vertex colour is the surface albedo
  // (red velvet re-coloured into a white tablecloth keeps its weave, not its red); uAlb.x = mean luminance, 0 = plain multiply
  const albL = alb ? Math.max(0.02, 0.2126 * alb[0] + 0.7152 * alb[1] + 0.0722 * alb[2]) : 0;
  const U = { uAlb: { value: new THREE.Vector3(albL, 0, 0) }, uTile: { value: 1 / tile }, uRMin: { value: rmin }, uIblK: { value: detail ? (it.I.detailIbl ?? HERO_INT_TUNE.detailPer[it.id] ?? HERO_INT_TUNE.detailIbl) : (it.I.propIbl ?? HERO_INT_TUNE.propPer[it.id] ?? HERO_INT_TUNE.propIbl) * (leaf ? 1.6 : 1) }, uWB: it.uWB, uKnee: it.uKnee, uRefl: it.uRefl, uLmK: it.uLmK, uNight: it.uNight, uLmN: it.uLmN, uLmNK: it.uLmNK, ...it.uPr };
  const lmn = !!it.lmnTex;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTile; varying vec3 vHbW;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vMapUv *= uTile;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv *= uTile;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv *= uTile;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv *= uTile;
#endif`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHbW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRefl; uniform float uLmK; uniform float uNight; uniform vec3 uAlb; uniform float uRMin; uniform float uIblK; uniform vec3 uWB; uniform float uKnee;' + (lmn ? '\nuniform sampler2D uLmN; uniform float uLmNK;' : '') + '\n' + BOX + '\n' + NM)
      .replace('#include <color_fragment>', '#if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR )\n diffuseColor.rgb = uAlb.x > 0.0 ? vColor.rgb * (dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / uAlb.x) : diffuseColor.rgb * vColor.rgb;\n#endif')
      .replace('#include <map_fragment>', leaf ? '#include <map_fragment>\ndiffuseColor.rgb /= max(diffuseColor.a, 0.12);' : '#include <map_fragment>')
      .replace('#include <emissivemap_fragment>', leaf ? '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (1.0 - 0.85 * uNight) * uLmK;' : '#include <emissivemap_fragment>')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, uRMin);')
      .replace('#include <lights_fragment_maps>', `irradiance = vec3(0.0);
reflectedLight.directDiffuse = vec3(0.0); reflectedLight.directSpecular = vec3(0.0);
#include <lights_fragment_maps>
${prop ? '' : lmn ? 'irradiance = mix(irradiance, texture2D(uLmN, vLightMapUv).rgb * uLmNK + irradiance * 0.035, uNight);' : 'irradiance *= 1.0 - 0.5 * uNight;'}
${prop ? 'iblIrradiance *= uIblK * uWB;' : 'irradiance *= uLmK * uWB;\n{ float l_ = dot(irradiance, vec3(0.2126, 0.7152, 0.0722)); if (l_ > uKnee) irradiance *= (uKnee + (l_ - uKnee) / (1.0 + (l_ - uKnee) / uKnee)) / l_; }\niblIrradiance = irradiance;'}
radiance *= uRefl * (1.0 - 0.6 * uNight);`);
    fs = fs.replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\treflectVec = hbBox( reflectVec );'));
    if (nm) fs = fs.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0', 'hbNm( texture2D( normalMap, vNormalMapUv ) )'));
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'heroint2-' + (m.map ? 1 : 0) + (m.normalMap ? 1 : 0) + (m.roughnessMap ? 1 : 0) + (m.metalnessMap ? 1 : 0) + (m.metalness > 0.5 ? 1 : 0) + (lmn ? 1 : 0) + (nm ? 1 : 0) + (alphaTest ? 1 : 0) + (prop ? 'p' : '') + (leaf ? 'l' : '');
  return m;
}

export function installHeroInteriors(G) {
  const world = G.world;
  const list = HERO_SITES.filter(s => s.interior && s.interior.doors?.length).map(s => ({
    id: s.id, site: s, I: s.interior, state: 0, group: null, lmTex: null, lmnTex: null, env: null, envRT: null, cols: null, daylit: [], emits: [], d: 1e9, texRefs: [],
    uRefl: { value: HERO_INT_TUNE.refl }, uLmK: { value: 1 }, uNight: { value: 0 }, uLmN: { value: null }, uLmNK: { value: 1 },
    uPr: { uPrC: { value: new THREE.Vector3() }, uPrCS: { value: new THREE.Vector2(1, 0) }, uPrMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) }, uPrMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) }, uPrP: { value: new THREE.Vector3() } },
  }));
  loadLib();
  const meds = list.map(it => it.I.lmMed).filter(v => v > 0).sort((a, b) => a - b);
  const MED = meds.length ? meds[meds.length >> 1] : 0;
  for (const it of list) it.autoK = MED && it.I.lmMed > 0 ? Math.min(1.8, Math.max(0.45, Math.pow(MED / it.I.lmMed, HERO_INT_TUNE.auto))) : 1;
  for (const it of list) {    // box-projection volume: the probe room (meta.probe.room, default the first room)
    const r = it.I.rooms[it.I.probe?.room ?? 0], py = it.I.probe?.y ?? (r.y0 + Math.min(1.7, (r.y1 - r.y0) * 0.4)), U = it.uPr;
    U.uPrC.value.set(r.x, 0, r.z); U.uPrCS.value.set(Math.cos(r.yaw), Math.sin(r.yaw));
    U.uPrMin.value.set(-r.hx, r.y0, -r.hz); U.uPrMax.value.set(r.hx, r.y1, r.hz); U.uPrP.value.set(0, py, 0);
    it.probeAt = new THREE.Vector3(r.x, py, r.z);
  }
  for (const it of list) {
    it.expo = HERO_INT_EXPO[it.id] ?? 1;
    it.uWB = { value: new THREE.Vector3(...wbOf(it)) };
    it.uKnee = { value: 1e9 };
  }
  const life = createInteriorLife(G);
  // inside a room no sun / moon / sky light reaches the people and the player: after env.update (which sets the lights every
  // frame) the direct lights go out and the scene IBL becomes the room's probe; restored on the way out
  let litInside = null, savedEnv = null, swapped = false;
  const E = G.env;
  if (E && typeof E.update === 'function') {
    const envUpdate = E.update.bind(E);
    E.update = (...a) => {
      const r = envUpdate(...a);
      try {
        if (litInside) {
          if (E.sun) E.sun.intensity = 0;
          if (E.hemi) E.hemi.intensity = 0;
          if (G.scene.environment !== litInside.env) { if (!swapped) savedEnv = G.scene.environment; G.scene.environment = litInside.env; swapped = true; }
        } else if (swapped) { G.scene.environment = savedEnv; swapped = false; savedEnv = null; }
      } catch (e) { /* lighting override is optional */ }
      return r;
    };
  }
  // BC1/BC3 .dds variants (hero_int_pack.py) when the GPU has S3TC (+ sRGB) and ?texpack=0 isn't set
  const gl = G.renderer?.getContext?.();
  const s3tc = !!(gl && gl.getExtension('WEBGL_compressed_texture_s3tc') && gl.getExtension('WEBGL_compressed_texture_s3tc_srgb')) &&
    !(typeof location !== 'undefined' && /[?&]texpack=0/.test(location.search));
  const _sky = new THREE.Color(), _hz = new THREE.Color();
  // ferry-style links between two far-apart points (Pier 33 <-> Alcatraz dock): E at either end fades across
  const links = HERO_SITES.flatMap(s => (s.links || []).map(l => ({ ...l, site: s.id })));
  if (!list.length && !links.length) return null;
  const center = (it) => it.probeAt;

  function roomAt(it, x, y, z, pad = 0) {
    for (const r of it.I.rooms) {
      const dx = x - r.x, dz = z - r.z, c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      if (Math.abs(lx) < r.hx + pad && Math.abs(lz) < r.hz + pad && y > r.y0 - 1 && y < r.y1 + pad) return r;
    }
    return null;
  }
  const pseudo = list.map(it => ({ id: 'hero:' + it.id, name: it.I.name, x: it.site.origin[0], z: it.site.origin[2], hero: true, inside: (x, y, z, pad = 0) => !!(it.state === 2 && roomAt(it, x, y, z, pad)) }));
  let pushed = false;

  // lightmap / atlas: .dds when packed (+ supported), else the image; cb(tex | null)
  function loadTex(it, key, v, cb) {
    const url = BASE + it.id + '/' + it.I[key];
    if (s3tc && (it.I.dds || []).includes(key)) {
      loadPacked(url.replace(/\.(jpe?g|png)$/i, '.dds') + (v ? '?v=' + v : ''), { srgb: true, anisotropy: 4, onLoad: (t) => cb(t), onError: () => cb(null) });
      return;
    }
    new THREE.TextureLoader().load(url + (v ? '?v=' + v : ''), (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; cb(t); }, undefined, () => cb(null));
  }
  function load(it) {
    it.state = 1;
    let glb = null, tex = null, sig = !it.I.signs, night = !it.I.lmn;
    const done = () => {
      if (!glb || !tex || !sig || !night || it.state !== 1) return;
      tex.channel = 1;
      it.lmTex = tex;
      if (it.lmnTex) { it.lmnTex.channel = 1; it.uLmN.value = it.lmnTex; it.uLmNK.value = (it.I.lmnScale || 1) * Math.PI; }
      if (!LIB) { setTimeout(done, 100); return; }    // library index still loading
      const g = prepHero(glb.scene, (slot) => lmMaterial(slot, it));
      g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      g.name = 'heroInt:' + it.id;
      g.position.set(it.site.origin[0], it.site.origin[1], it.site.origin[2]); g.updateMatrixWorld(true);
      g.visible = false;
      G.scene.add(g); it.group = g;
      it.cols = (it.I.colliders || []).map(c => ({ ...c, kind: 'interior' }));
      for (const c of it.cols) world.colliders.add(c);
      it.state = 2; it.env = null; it.texOK = false;
      // the probe must not see library / prop textures that are still downloading (they sample black): wait for them
      const gen = (it.gen = (it.gen || 0) + 1);
      Promise.all(it.texRefs.map(u => TEXC.get(u)?.t.userData.ready).filter(Boolean)).then(() => { if (it.gen === gen && it.state === 2) it.texOK = true; });
    };
    // a load cancelled by drop() (state reset) frees whatever arrives late
    const late = (t) => { if (it.state !== 1) { t?.dispose?.(); return true; } return false; };
    heroLoader().load(BASE + it.id + '/' + it.I.file + (it.I.v ? '?v=' + it.I.v : ''), (g) => { if (it.state !== 1) return; glb = g; done(); }, undefined, (e) => { console.warn('[heroInt] glb', it.id, e); it.state = -1; });
    loadTex(it, 'lm', it.I.lmv, (t) => { if (late(t)) return; if (!t) { console.warn('[heroInt] lightmap', it.id); it.state = -1; return; } tex = t; done(); });
    if (it.I.lmn) loadTex(it, 'lmn', it.I.lmnv, (t) => { if (late(t)) return; it.lmnTex = t; night = true; done(); });
    if (it.I.signs) loadTex(it, 'signs', it.I.sv, (t) => { if (late(t)) return; if (t) { t.anisotropy = 4; it.signTex = t; } sig = true; done(); });
  }
  // exterior hero group of a site (lazy, re-looked-up at most once a second while missing)
  function extOf(it) {
    if (it.ext?.parent) return it.ext;
    const now = performance.now(); if (now - (it.extT || 0) < 1000) return null;
    it.extT = now; it.ext = G.scene.getObjectsByProperty('name', 'hero:' + it.id).find(o => !o.isMesh) || null; return it.ext;
  }
  function drop(it) {
    if (it.ext) { it.ext.visible = true; it.ext = null; }
    if (it.group) {
      G.scene.remove(it.group);
      it.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    for (const c of it.cols || []) world.colliders.remove(c);
    it.lmTex?.dispose(); it.lmnTex?.dispose(); it.signTex?.dispose();
    if (it.envRT) it.envRT.dispose(); else if (it.env?.dispose) it.env.dispose();
    it.uLmN.value = null; it.daylit.length = 0; it.emits.length = 0; it.emitK = undefined; texUnref(it);
    Object.assign(it, { state: 0, group: null, lmTex: null, lmnTex: null, env: null, envRT: null, cols: null, signTex: null, probeN: undefined, texOK: false });
  }
  // (perf r3) one PMREM generator for every probe, kept alive: a new one per probe (disposed after) released its programs,
  // so each capture recompiled the cube-UV / blur shaders. Warmed at install (behind the loading screen) at the probe size.
  // ?nointprobe = the old path (new generator per probe, the capture compiles the interior's materials synchronously).
  let PM = null;
  const pmrem = (r) => { if (!PM) PM = new THREE.PMREMGenerator(r); return PM; };
  if (PERF.intprobe && G.renderer) {
    try { const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }); pmrem(G.renderer).fromCubemap(rt.texture).dispose(); rt.dispose(); }
    catch (e) { console.warn('[heroInt] pmrem warm', e); }
  }
  // one-shot local reflection probe (the interior alone, from the middle of its first room)
  function probe(it) {
    const r = G.renderer; if (!r || !it.group) return;
    try {
      const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cam = new THREE.CubeCamera(0.2, 300, rt); cam.position.copy(center(it));
      const tmp = new THREE.Scene(); const parent = it.group.parent;
      const vis = it.group.visible; it.group.visible = true; tmp.add(it.group); tmp.add(cam);
      const sk = it.emitK ?? 1;    // capture the room as seen from inside (undo the street-view dimming)
      if (sk !== 1) { it.uLmK.value /= sk; for (const m of it.emits) m.color.setScalar(m.userData.emit); }
      // (perf r3) the capture's draws go through render/shaderwarm.js: materials whose program is still compiling are
      // skipped and the probe is retried a moment later (the old env, if any, stays) instead of freezing for the compile
      const sw = PERF.intprobe && window.__shaderWarm?.enabled ? window.__shaderWarm : null, sk0 = sw ? sw.stats.skipped : 0;
      if (sw) sw.extra.add(tmp);
      try { cam.update(r, tmp); } finally { if (sw) sw.extra.delete(tmp); }
      if (sk !== 1) { it.uLmK.value *= sk; for (const m of it.emits) m.color.setScalar(m.userData.emit * sk); }
      parent.add(it.group); it.group.visible = vis;
      if (sw && sw.stats.skipped !== sk0) { rt.dispose(); it.probeWait = performance.now(); return; }
      it.probeWait = 0;
      if (it.envRT) { it.envRT.dispose(); it.envRT = null; }
      if (PERF.intprobe) { it.envRT = pmrem(r).fromCubemap(rt.texture); it.env = it.envRT.texture; rt.dispose(); }
      else { const pm = new THREE.PMREMGenerator(r); it.envRT = pm.fromCubemap(rt.texture); it.env = it.envRT.texture; pm.dispose(); rt.dispose(); }
      const first = !it.probeN && it.probeN !== 0;
      it.group.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial && !o.material.transparent) { o.material.envMap = it.env; o.material.envMapIntensity = 1; if (first) o.material.needsUpdate = true; } });
      it.probeN = it.uNight.value;
    } catch (e) { console.warn('[heroInt] probe', it.id, e); it.env = true; }
  }

  // camera: keep the orbit camera inside the room and under its ceiling
  const rig = G.rig, origApply = rig?.apply;
  if (rig && origApply) {
    rig.apply = function (dt) {
      try {
        if (!window.__freeCam) {
          const P = G.player, rp = rig.rig.pos;
          for (const it of list) {
            if (it.state !== 2) continue;
            const room = roomAt(it, P.pos.x, P.pos.y + 0.4, P.pos.z, 0.2); if (!room) continue;
            const c = Math.cos(room.yaw), s = Math.sin(room.yaw), m = 0.35;
            const dx = rp.x - room.x, dz = rp.z - room.z;
            let lx = c * dx - s * dz, lz = s * dx + c * dz;
            lx = Math.max(-room.hx + m, Math.min(room.hx - m, lx)); lz = Math.max(-room.hz + m, Math.min(room.hz - m, lz));
            rp.x = room.x + c * lx + s * lz; rp.z = room.z - s * lx + c * lz;
            if (rp.y > room.y1 - 0.3) rp.y = room.y1 - 0.3;
            if (rp.y < room.y0 + 0.3) rp.y = room.y0 + 0.3;
            break;
          }
        }
      } catch (e) { /* never break the camera */ }
      return origApply.call(this, dt);
    };
  }

  let prompted = false, fadeEl = null, fading = false;
  function fade(mid) {
    const ui = G.interiors?.ui;
    if (ui?.fade) return ui.fade(mid);
    if (!fadeEl) { fadeEl = document.createElement('div'); fadeEl.style.cssText = 'position:fixed;inset:0;background:#05060a;opacity:0;pointer-events:none;z-index:45;transition:opacity .32s ease'; document.body.appendChild(fadeEl); }
    fading = true; fadeEl.style.opacity = 1;
    setTimeout(() => { try { mid(); } catch (e) { console.error(e); } setTimeout(() => { fadeEl.style.opacity = 0; fading = false; }, 120); }, 330);
  }
  function teleport(x, y, z, yaw) {
    const P = G.player; if (P.vehicle) return;
    P.pos.set(x, world.groundAt(x, z, y + 0.5), z); P.vel.set(0, 0, 0); P.yaw = yaw;
    if (P.human?.root) { P.human.root.position.copy(P.pos); P.human.root.rotation.y = yaw; }
    if (G.rig?.rig) { G.rig.rig.orbitYaw = yaw; G.rig.rig.orbitPitch = 0; G.rig.snap?.(); }
  }

  // window panels: the horizon colour (hue + a little of its brightness) by day, a dim warm skyglow at night;
  // divided by the exposure like the lightmaps so they read the same on screen
  function skyColour(night, expo) {
    const fc = G.scene?.fog?.color;
    _hz.setRGB(0.78, 0.86, 1.0);
    if (fc) { const m = Math.max(fc.r, fc.g, fc.b, 1e-4); _hz.lerp(_sky.setRGB(fc.r / m, fc.g / m, fc.b / m), 0.55); }
    const day = 1 - night;
    _sky.copy(_hz).multiplyScalar(1.8 * day * day).add(_hz.setRGB(0.07, 0.065, 0.085).multiplyScalar(night));
    _sky.multiplyScalar(1 / Math.max(0.35, expo));
  }

  // ---- map markers (minimap + big map 'Landmarks' group) for every hero site; walk-ins get the door icon at the door
  let marked = false;
  function addMarkers() {
    const M = G.ui?.markers; if (!M || marked) return; marked = true;
    for (const s of HERO_SITES) {
      if (!s.name || s.ct) continue;     // Chinatown street blocks (hero_ctown.py) are streetscape, not landmarks
      const it = list.find(i => i.id === s.id), d = it?.I.doors[0]?.out;
      const title = s.name.replace(/\s*[:+].*$/, '').replace(/ - .*$/, '');
      M.add({ id: 'hero:' + s.id, kind: it ? 'heroLmIn' : 'heroLm', x: d ? d[0] : s.origin[0], z: d ? d[2] : s.origin[2], title,
        sub: it ? 'Walk in: ' + it.I.name + '. Press E at the door.' : 'Landmark', minimap: true, bigmap: true });
    }
  }
  // ---- floating door labels within ~30 m (on foot or driving)
  let tagRoot = null; const tags = [];
  const _p = new THREE.Vector3();
  function doorTags(pos, foot, busy) {
    if (!tagRoot) {
      tagRoot = document.createElement('div'); tagRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30';
      document.body.appendChild(tagRoot);
      for (let i = 0; i < 2; i++) {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:6px 10px 7px;background:rgba(10,11,17,.78);backdrop-filter:blur(6px);box-shadow:inset 0 -3px 0 #5ad1ff;color:#f6f3ee;font:italic 800 16px/1.05 "Barlow Condensed",sans-serif;text-transform:uppercase;letter-spacing:.02em;text-align:center;white-space:nowrap;display:none';
        tagRoot.appendChild(el); tags.push(el);
      }
    }
    const near = [];
    if (!busy) for (const it of list) for (const dr of it.I.doors) {
      const w = dr.out, d = Math.hypot(pos.x - w[0], pos.z - w[2]);
      if (d < 30 && Math.abs(pos.y - w[1]) < 12) near.push([d, it, dr]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const cam = G.camera, cw = innerWidth, ch = innerHeight;
    for (let i = 0; i < tags.length; i++) {
      const el = tags[i], n = near[i];
      if (!n || !cam) { el.style.display = 'none'; continue; }
      const [d, it, dr] = n;
      _p.set(dr.out[0], dr.out[1] + 3.0, dr.out[2]).project(cam);
      if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) { el.style.display = 'none'; continue; }
      const sub = foot ? (d < 1.8 ? '' : 'Press E at the door') : 'Walk-in · get out to enter';
      const html = `${dr.label}${sub ? `<br><span style="font:600 11px/1.6 Inter,sans-serif;text-transform:none;color:#b9c2cc;letter-spacing:0">${sub}</span>` : ''}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.display = sub || !foot ? 'block' : 'none';
      el.style.opacity = String(Math.min(1, (30 - d) / 8));
      el.style.left = ((_p.x * 0.5 + 0.5) * cw).toFixed(0) + 'px'; el.style.top = ((-_p.y * 0.5 + 0.5) * ch).toFixed(0) + 'px';
    }
  }

  const api = {
    list, links, life,
    ride(i = 0, toB = true) { const l = links[i]; if (!l) return; const to = toB ? l.b : l.a; fade(() => teleport(to[0], to[1], to[2], to[3])); },
    /** dev: GPU bytes held by the hero interiors (lightmaps, shared library / prop textures, geometry, probes), MB */
    mem() {
      const texB = (t) => { if (!t?.image) return 0; const w = t.image.width || 0, h = t.image.height || 0; const bpp = t.isCompressedTexture ? (t.format === THREE.RGB_S3TC_DXT1_Format || t.format === THREE.RGBA_S3TC_DXT1_Format ? 0.5 : 1) : 4; return w * h * bpp * 1.33; };
      const per = {}; let shared = 0;
      for (const it of list) if (it.state === 2) {
        let geo = 0; it.group?.traverse(o => { if (o.isMesh) for (const k in o.geometry.attributes) geo += o.geometry.attributes[k].count * o.geometry.attributes[k].itemSize * 4; if (o.isMesh && o.geometry.index) geo += o.geometry.index.count * 4; });
        per[it.id] = { lm: +((texB(it.lmTex) + texB(it.lmnTex) + texB(it.signTex)) / 1048576).toFixed(1), geo: +(geo / 1048576).toFixed(1), probe: it.env ? 6.3 : 0, texRefs: it.texRefs.length };
      }
      for (const [, e] of TEXC) shared += texB(e.t);
      return { per, sharedTexMB: +(shared / 1048576).toFixed(1), sharedN: TEXC.size };
    },
    info: () => list.map(it => ({ id: it.id, state: it.state, visible: !!it.group?.visible, env: !!it.env, d: Math.round(it.d), dds: !!it.lmTex?.isCompressedTexture, night: !!it.lmnTex })),
    enter(id) { const it = list.find(i => i.id === id); if (!it) return; const d = it.I.doors[0]; const go = () => teleport(d.in[0], d.in[1], d.in[2], d.in[3]); if (it.state === 2) go(); else { if (!it.state) load(it); const t = setInterval(() => { if (it.state === 2) { clearInterval(t); go(); } }, 100); } },
    update(dt) {
      if (!pushed && G.interiors?.sites) { G.interiors.sites.push(...pseudo); pushed = true; }
      const P = G.player, pos = P.pos, foot = P.mode === 'foot';
      const cam = G.camera?.position || pos;
      // residency: the MAX_LIVE nearest doors inside LOAD_R load; one more stays resident (hysteresis); the rest drop
      for (const it of list) { let d = 1e9; for (const dr of it.I.doors) d = Math.min(d, Math.hypot(pos.x - dr.out[0], pos.z - dr.out[2]), Math.hypot(pos.x - dr.in[0], pos.z - dr.in[2])); it.d = d; }
      const rank = list.filter(it => it.d < DROP_R).sort((a, b) => a.d - b.d);
      const night = G.env?.night?.value ?? 0, expo = G.renderer?.toneMappingExposure || 1;
      skyColour(night, expo);
      let inRoom = null;
      for (const it of list) {
        const d = it.d, k = rank.indexOf(it);
        const dc = Math.hypot(cam.x - it.I.rooms[0].x, cam.z - it.I.rooms[0].z);
        if (!it.state && d < LOAD_R && k >= 0 && k < MAX_LIVE) load(it);
        else if ((it.state === 2 || it.state === 1) && (d > DROP_R || k < 0 || k > MAX_LIVE)) { drop(it); continue; }
        if (it.state === 2) {
          it.uNight.value = night;
          const inside = !!roomAt(it, pos.x, pos.y + 0.4, pos.z, 1.0) || !!roomAt(it, cam.x, cam.y, cam.z, 0.5);
          if (inside && !inRoom) inRoom = it;
          it.group.visible = inside || dc < (it.I.showR ?? SHOW_R);
          // open courtyards share the exterior's walls: hide the exterior hero while inside (hideExt)
          if (it.I.hideExt) { const ex = extOf(it); if (ex) ex.visible = !inside; }
          if (it.group.visible && it.texOK && (!it.env || Math.abs(night - (it.probeN ?? night)) > 0.5) && !(it.probeWait && performance.now() - it.probeWait < 250)) probe(it);   // re-capture across dusk / dawn
          // tone-mapping exposure rises at night: keep the baked light constant on screen
          const ex = G.renderer?.toneMappingExposure || 1;
          // seen from the street (camera outside every room) a lit lobby is dimmed toward the street's exposure: at night an
          // un-dimmed interior glowed white through the glass (regression view 'market', the Phelan lobby)
          const seen = inside ? 1 : 0.55 - 0.3 * night;
          it.uLmK.value = HERO_INT_TUNE.lm * (HERO_INT_TUNE.per[it.id] ?? it.autoK) * it.expo * seen * HERO_INT_TUNE.expoRef / Math.max(0.35, ex);
          if (it.group.visible && it.emitK !== seen) { it.emitK = seen; for (const m of it.emits) m.color.setScalar(m.userData.emit * seen); }
          // filmic roll-off of the baked light above ~2.5x the room's median: window walls and lamp pools stop clipping white
          it.uKnee.value = it.I.lmMed > 0 ? 2.5 * it.I.lmMed * Math.PI * it.uLmK.value : 1e9;
          it.uRefl.value = HERO_INT_TUNE.refl;
          it.uNight.value = night;
          if (it.group.visible) for (const m of it.daylit) m.color.copy(_sky).multiplyScalar(m.userData.daylit / 1.8);
        }
      }
      life.update(dt, P.mode === 'foot' ? inRoom : null);
      litInside = P.mode === 'foot' && inRoom?.env?.isTexture ? inRoom : null;
      addMarkers();
      try { doorTags(P.vehicle?.pos || pos, foot, !!(G.interiors?.ui?.open || G.ui?.isModal?.() || G.state !== 'play' || inRoom)); } catch (e) { /* labels optional */ }
      // doors
      const ui = G.interiors?.ui;
      const busy = ui?.open || ui?.fading || fading || G.state !== 'play';
      let best = null, bd = 1e9, html = '';
      if (!busy && foot) {
        for (const it of list) {
          for (const dr of it.I.doors) {
            for (const side of ['out', 'in']) {
              const w = dr[side], dd = Math.hypot(pos.x - w[0], pos.z - w[2]);
              if (dd < 1.8 && Math.abs(pos.y - w[1]) < 2.2 && dd < bd) {
                bd = dd;
                if (side === 'out' && it.state !== 2) { best = { use: () => {} }; html = `<b>${dr.label}</b>Opening...`; if (!it.state) load(it); continue; }
                const to = side === 'out' ? dr.in : dr.out;
                best = { use: () => fade(() => teleport(to[0], to[1], to[2], to[3])) };
                html = `<b>${dr.label}</b>Press <kbd>E</kbd> to ${side === 'out' ? 'enter' : 'exit'}`;
              }
            }
          }
        }
      }
      if (!busy && foot) {
        for (const l of links) {
          for (const [w, to, label] of [[l.a, l.b, l.la], [l.b, l.a, l.lb]]) {
            const dd = Math.hypot(pos.x - w[0], pos.z - w[2]);
            if (dd < 2.4 && Math.abs(pos.y - w[1]) < 2.5 && dd < bd) {
              bd = dd;
              best = { use: () => fade(() => teleport(to[0], to[1], to[2], to[3])) };
              html = `<b>${label}</b>Press <kbd>E</kbd> to ${l.verb || 'board'}`;
            }
          }
        }
      }
      if (best) {
        G.hud?.prompt?.(html, 'heroInt'); prompted = true;
        if (G.input?.pressed?.('interact')) { G.hud?.prompt?.(null, 'heroInt'); prompted = false; G.audio?.ui?.('click'); best.use(); }
      } else if (prompted) { G.hud?.prompt?.(null, 'heroInt'); prompted = false; }
    },
  };
  return api;
}
