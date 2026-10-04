// Materials for the Blender-baked hero landmarks (tools/blender/hero_*.py -> public/assets/landmarks/<id>/*.glb).
// GLB nodes are named L<lod>_<slot>; every slot maps to ONE shared material here (compiled once for all heroes).
// Vertex colour COLOR_0: rgb = albedo tint (or, for window/shop/lamp slots, the night emission colour), a = baked
// Cycles ambient occlusion (applied to indirect light only, so sunlit faces are not darkened). TEXCOORD_0 = metres.
import * as THREE from 'three';
import { PBR } from '../../assets.js';
import { loadPacked, texpackOn, packedUrl } from '../../texpack.js';
import { HB_WET } from '../../../render/fog.js';

export const HU = { uNight: { value: 0 }, uTime: { value: 0 } };
let M = null;

// patch: tint from vColor.rgb (not alpha), AO from vColor.a on indirect light, texture tiling in metres
// proc: 1 = barrel clay tiles (uv: u across the slope, v down the slope, metres), 2 = lap clapboard siding (v = height)
const PROC = {
  1: `{ vec2 q = vHUv; float s = abs(sin(3.14159 * q.x / 0.24)); float r = fract(q.y / 0.34);
  diffuseColor.rgb *= (0.6 + 0.4 * pow(s, 0.55)) * (0.78 + 0.22 * smoothstep(0.0, 0.22, r)); }`,
  2: `{ float r = fract(vHUv.y / 0.16); diffuseColor.rgb *= 0.74 + 0.26 * smoothstep(0.0, 0.3, r) - 0.08 * smoothstep(0.93, 1.0, r); }`,
  // 3 = perforated + dimpled copper (de Young): a 0.24 m grid of holes whose size follows a slow 'canopy light' field,
  // faded out with distance (no moire far away)
  3: `{ vec2 q = vHUv / 0.24; vec2 id = floor(q); vec2 c = fract(q) - 0.5;
  float n = 0.5 + 0.5 * sin(id.x * 0.23 + 1.7 * sin(id.y * 0.17)) * cos(id.y * 0.19 - 0.8 * sin(id.x * 0.11));
  float fd = 1.0 - smoothstep(40.0, 220.0, length(vViewPosition));
  float hole = (1.0 - smoothstep(0.06 + 0.3 * n - 0.03, 0.06 + 0.3 * n, length(c))) * step(0.25, n);
  float dimple = smoothstep(0.45, 0.1, length(c - vec2(0.2, 0.2))) * (1.0 - n);
  diffuseColor.rgb *= mix(1.0, (1.0 - 0.8 * hole) * (1.0 - 0.12 * dimple), fd) * (0.9 + 0.2 * n * (1.0 - fd)); }`,
  // 4 = roll-up shop grille slats (v = height, metres)
  4: `{ float r = fract(vHUv.y / 0.085); diffuseColor.rgb *= 0.62 + 0.38 * smoothstep(0.0, 0.35, r) - 0.18 * smoothstep(0.82, 1.0, r); }`,
};
// emitMode: 0 = lit surface (vColor = albedo tint), 1 = glass / lamp (vColor = night emission, fixed dark diffuse),
// 2 = paper lantern / backlit curtain (vColor = albedo AND emission; lanterns get a soft facing-ratio core that stays
// saturated red-orange below the ACES white point, so the centres never go pink-white), 3 = textured emitter (signs /
// shop interiors: map = emissiveMap, emission scaled day -> night by texEmit)
// lm: per-site uniforms { uLmNK, uLmN } -> material.lightMap (uv1) = day sky visibility (multiplies the ambient / IBL),
// uLmN = night irradiance from the baked emitters (added, x albedo, by night)
function patch(mat, { tile = 1, emitMode = 0, emitK = 1, dayEmit = 0, aoK = 0.45, proc = 0, texEmit = null, lm = null, lmAvg = null } = {}) {
  mat.vertexColors = true;
  mat.userData.hp = { tile, emitMode, emitK, dayEmit, aoK, proc, texEmit };
  const U = { uTile: { value: 1 / tile }, uEmitK: { value: emitK }, uDayEmit: { value: dayEmit }, uTexEmit: { value: new THREE.Vector2(...(texEmit || [0, 1])) } };
  if (lm) Object.assign(U, lm, CT_NP);
  if (lmAvg) Object.assign(U, lmAvg);
  const em1 = emitMode === 1 || emitMode === 2;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HU, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTile;' + (proc ? '\nvarying vec2 vHUv;' : ''))
      .replace('#include <uv_vertex>', `#include <uv_vertex>
${proc ? '#ifdef USE_MAP\nvHUv = vMapUv;\n#endif' : ''}
#ifdef USE_MAP
vMapUv *= uTile;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv *= uTile;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv *= uTile;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uTime; uniform float uEmitK; uniform float uDayEmit; uniform vec2 uTexEmit;' + (proc ? '\nvarying vec2 vHUv;' : '') + (lm ? '\nuniform sampler2D uLmN; uniform float uLmNK; uniform float uLmDK; uniform float uLmNP; uniform float uLmNG; uniform float uLmRel; uniform float uCtAmb;' : '') + (lmAvg ? '\nuniform vec3 uLmAvg;' : ''))
      .replace('#include <color_fragment>', emitMode === 1 ? '' : '#if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR )\n diffuseColor.rgb *= vColor.rgb;\n#endif\n' + (PROC[proc] || ''))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${emitMode === 1 ? 'totalEmissiveRadiance += vColor.rgb * uEmitK * mix(uDayEmit, 1.0, uNight);' : ''}
${emitMode === 2 ? `{ float hF = pow(abs(dot(normal, normalize(vViewPosition))), 1.6);
  vec3 hE = mix(vColor.rgb, vec3(1.0, 0.3, 0.07), 0.3 * hF * hF) * (0.55 + 0.6 * hF);
  totalEmissiveRadiance += hE * uEmitK * mix(uDayEmit, 1.0, uNight); }` : ''}
${emitMode === 3 ? 'totalEmissiveRadiance *= mix(uTexEmit.x, uTexEmit.y, uNight);' : ''}`)
      .replace('#include <lights_fragment_maps>', lm ? `#if defined( RE_IndirectDiffuse )
  #if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
    iblIrradiance += getIBLIrradiance( geometryNormal );
  #endif
  #ifdef USE_LIGHTMAP
  { vec3 ctVis = min(texture2D( lightMap, vLightMapUv ).rgb * uLmDK, vec3(1.15));
    float ctA = mix(1.0, uCtAmb, uNight);      // (round 2) the night sky / IBL ambient on the hero blocks: mostly dark
    irradiance *= ctVis * ctA; iblIrradiance *= ctVis * ctA; }
  #endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness )${'' /* spec occlusion below */};
  #ifdef USE_LIGHTMAP
  radiance *= 0.35 + 0.65 * min(1.0, dot(texture2D( lightMap, vLightMapUv ).rgb, vec3(0.333)) * uLmDK);
  #endif
#endif` : '#include <lights_fragment_maps>')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  // distance fade of sub-pixel detail (window grids, fins): widen the specular lobe so reflections stop sparkling,
  // and pull glass toward a flat facade tone so window/pier grids don't moire
  { float hFd = smoothstep(140.0, 650.0, length(vViewPosition));
    roughnessFactor = max(roughnessFactor, 0.5 * hFd);
    ${emitMode === 1 ? 'metalnessFactor = mix(metalnessFactor, 0.2, hFd); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.53, 0.56), 0.55 * hFd);' : ''} }`)
      .replace('#include <aomap_fragment>', `{ float hAo = mix(1.0, vColor.a, ${aoK.toFixed(2)});
  reflectedLight.indirectDiffuse *= hAo;
  reflectedLight.indirectSpecular *= hAo; }
${lm ? `#ifdef USE_LIGHTMAP
  { // (round 2) relief: the baked night light comes mostly from below / in front (shops, lanterns, street lamps); the
    // normal map tilts each brick / mortar joint toward or away from it, and the joints (normals off the wall) sit in shadow
    vec3 ctDn = normalize((viewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz), ctL = normalize(nonPerturbedNormal + 1.1 * ctDn);
    float ctR = clamp(1.0 + uLmRel * 3.0 * (dot(normal, ctL) - dot(nonPerturbedNormal, ctL)), 0.25, 1.8);
    ctR *= mix(1.0, smoothstep(0.75, 0.98, dot(normal, nonPerturbedNormal)), 0.5 * uLmRel);
    reflectedLight.indirectDiffuse += BRDF_Lambert( material.diffuseColor ) * pow( texture2D( uLmN, vLightMapUv ).rgb, vec3( uLmNP ) ) * uLmNK * uLmNG * ctR * uNight; }
#endif` : ''}
${lmAvg ? 'reflectedLight.indirectDiffuse += BRDF_Lambert( material.diffuseColor ) * uLmAvg * uNight;' : ''}`);
  };
  mat.customProgramCacheKey = () => `hero-${emitMode}-${aoK}-${proc}-${lm ? 1 : 0}-${lmAvg ? 1 : 0}`;
  return mat;
}

function pbr(key, opts = {}, p = {}) {
  const t = PBR.tex(key);
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0, ...opts });
  return patch(m, { tile: PBR.TILE?.[key] || 2.5, ...p });
}

let MURAL = null;
function muralTex() {
  if (MURAL) return MURAL;
  MURAL = new THREE.TextureLoader().load((import.meta.env?.BASE_URL || './') + 'assets/landmarks/balmy/balmy_murals.jpg');
  MURAL.flipY = false; MURAL.colorSpace = THREE.SRGBColorSpace; MURAL.anisotropy = 4;
  return MURAL;
}

export function heroMats() {
  if (M) return M;
  const glass = (color, rough, emitK, dayEmit) => patch(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.8, envMapIntensity: 1.3 }), { emitMode: 1, emitK, dayEmit, aoK: 0.3 });
  M = {
    stone: pbr('painted_plaster', { normalScale: new THREE.Vector2(0.6, 0.6) }),
    concrete: pbr('concrete', { normalScale: new THREE.Vector2(0.5, 0.5) }),
    granite: pbr('marble', { roughness: 0.55, envMapIntensity: 0.8 }),
    marble: pbr('marble', { roughness: 0.35, envMapIntensity: 1.0 }),
    brick: pbr('brick_tan'),
    brickred: pbr('brick_red'),
    stucco: pbr('stucco'),
    terracotta: pbr('stucco', { normalScale: new THREE.Vector2(0.4, 0.4) }),
    copper: pbr('metal', { metalness: 0.55, roughness: 0.5 }, { tile: 2.5, proc: 3 }),
    rooftile: pbr('stucco', { normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.8 }, { tile: 3, proc: 1 }),
    clap: pbr('painted_plaster', { normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.7 }, { tile: 3, proc: 2 }),
    roof: pbr('gravel_roof'),
    paving: pbr('paving'),
    tiles: pbr('tiles'),
    metal: pbr('metal', { metalness: 0.75, roughness: 0.55 }),
    fabric: pbr('fabric', { side: THREE.DoubleSide }),
    wood: pbr('wood_floor'),
    grass: pbr('grass'),
    bark: pbr('bark'),
    plain: patch(new THREE.MeshStandardMaterial({ roughness: 0.8 })),
    paint: patch(new THREE.MeshStandardMaterial({ roughness: 0.5 })),
    gold: patch(new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 1 })),
    chrome: patch(new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 1 })),
    leaf: patch(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })),
    win: glass(0x7b8894, 0.05, 0.85, 0.0),
    shop: glass(0x5d6770, 0.04, 2.6, 0.03),
    glassc: patch(new THREE.MeshStandardMaterial({ roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.38, depthWrite: false, envMapIntensity: 1.5 })),
    clear: patch(new THREE.MeshStandardMaterial({ roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6 })),
    lamp: patch(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }), { emitMode: 1, emitK: 5, dayEmit: 0.08 }),
    neon: patch(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }), { emitMode: 1, emitK: 7, dayEmit: 0.35 }),
    water: patch(new THREE.MeshStandardMaterial({ color: 0x24363c, roughness: 0.04, metalness: 0.4, envMapIntensity: 1.4 })),
    // painted murals (Balmy Alley): atlas of original art, explicit atlas UVs (tile 1 = no rescale), lazily loaded
    mural: patch(new THREE.MeshStandardMaterial({ map: muralTex(), roughness: 0.88 }), { tile: 1, aoK: 0.35 }),
    // Chinatown hero set (tools/blender/hero_ctown.py): sign + shop-interior atlases, lanterns, curtains, grilles
    sign: patch(new THREE.MeshStandardMaterial({ map: ctTex('ct_signs', true), emissiveMap: ctTex('ct_signs', true), emissive: 0xffffff, roughness: 0.42 }), { tile: 1, emitMode: 3, texEmit: [0.12, 1.45], aoK: 0.3 }),
    shopint: patch(new THREE.MeshStandardMaterial({ map: ctTex('ct_shops'), emissiveMap: ctTex('ct_shops'), emissive: 0xffffff, color: 0x404040, roughness: 0.9 }), { tile: 1, emitMode: 3, texEmit: [0.28, 0.6], aoK: 0.0 }),
    lantern: patch(new THREE.MeshStandardMaterial({ roughness: 0.75 }), { emitMode: 2, emitK: 0.75, dayEmit: 0.22, aoK: 0.2 }),
    curtain: patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }), { emitMode: 2, emitK: 0.75, dayEmit: 0.0, aoK: 0.2 }),
    grille: pbr('metal', { metalness: 0.7, roughness: 0.45 }, { tile: 2.5, proc: 4 }),
    cwin: cwinMat(),
  };
  for (const m of Object.values(M)) m.userData.keep = true;
  return M;
}

// night lightmap curve (pow on the normalised irradiance: pools stay bright near their lamps, the walls between go dark)
export const CT_NP = { uLmNP: { value: 2.0 }, uLmNG: { value: 1.4 }, uLmRel: { value: 1 }, uCtAmb: { value: 0.4 } };
// interior-mapped Chinatown windows ('cwin', hero_ctown.py cwin_glass): uv 0..1 over the opening, colour = (lit, seed, tone).
// A parallax room from the facade system's Blender room atlases (assets/baked/rooms_*.jpg, 4 x 4), curtains / blinds,
// dim warm at night (no flat white panes); dark reflective glass by day with the room faintly behind it
export const CT_WIN = { uWinK: { value: 0.75 } };
let ROOMS = null;
function roomAtlases() {
  if (ROOMS) return ROOMS;
  const dummy = new THREE.DataTexture(new Uint8Array([30, 26, 22, 255]), 1, 1); dummy.needsUpdate = true;
  ROOMS = { uRoomD: { value: dummy }, uRoomN: { value: dummy } };
  if (typeof document === 'undefined') return ROOMS;
  const base = (import.meta.env?.BASE_URL || './') + 'assets/baked/';
  const get = (f, k) => {
    if (packedUrl(base + f)) loadPacked(base + f, { srgb: true, anisotropy: 4, onLoad: t => { ROOMS[k].value = t; } });
    else new THREE.TextureLoader().load(base + f, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ROOMS[k].value = t; });
  };
  get('rooms_day.jpg', 'uRoomD'); get('rooms_night.jpg', 'uRoomN');
  return ROOMS;
}
const ROOM_GLSL = `uniform sampler2D uRoomD, uRoomN; uniform float uWinK;
float cfh1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
vec3 ctRoom(vec2 p, vec2 cs, vec3 rd, float seed, float lit, float tone){
  float s1 = cfh1(seed * 91.7 + 1.3), s2 = cfh1(seed * 53.1 + 7.9), s3 = cfh1(seed * 17.3 + 3.1), s4 = cfh1(seed * 29.9 + 5.7);
  vec2 hs = cs * 0.5; vec3 o = vec3((p - hs) / hs, 0.0); float D = 3.4 + 1.5 * s3;
  vec3 r = vec3(rd.x / hs.x, rd.y / hs.y, -max(rd.z, 0.02) / D);
  o.xy = clamp(o.xy, vec2(-0.999), vec2(0.999));
  vec3 ir = 1.0 / vec3(abs(r.x) < 1e-4 ? 1e-4 : r.x, abs(r.y) < 1e-4 ? 1e-4 : r.y, r.z);
  float tx = ((r.x > 0.0 ? 1.0 : -1.0) - o.x) * ir.x, ty = ((r.y > 0.0 ? 1.0 : -1.0) - o.y) * ir.y, tz = (-1.0 - o.z) * ir.z;
  float t = max(min(min(tx, ty), tz), 0.0); vec3 h = o + r * t;
  vec2 uv = clamp(0.5 + 0.5 * h.xy / (1.0 - h.z), vec2(0.002), vec2(0.998));
  float tile = floor(s1 * 16.0), c = mod(tile, 4.0), rw = floor(tile / 4.0);
  vec2 auv = vec2((c + uv.x) * 0.25, (3.0 - rw + uv.y) * 0.25);
  float lod = clamp(log2(max(fwidth(p.x) / cs.x, fwidth(p.y) / cs.y) * 512.0 + 1e-4), 0.0, 8.0);
  vec3 dayC = textureLod(uRoomD, auv, lod).rgb, nightC = textureLod(uRoomN, auv, lod).rgb;
  vec3 tint = tone < 0.6 ? vec3(1.12, 0.78, 0.5) : tone < 0.85 ? vec3(1.0, 0.86, 0.66) : vec3(0.8, 0.9, 1.05);
  vec3 b = dayC * 0.3 * (1.0 - uNight) + mix(dayC * 0.012, nightC * tint * 0.85, lit) * uNight;
  vec2 pc = p + rd.xy * (0.12 / max(rd.z, 0.05));
  float cw2 = cs.x * (0.12 + 0.2 * s4);
  vec3 lt = (1.0 - uNight) * vec3(0.24) + lit * uNight * vec3(1.0, 0.68, 0.42);
  if (s2 > 0.3 && (pc.x < cw2 || pc.x > cs.x - cw2)) b = mix(vec3(0.55, 0.12, 0.08), vec3(0.62, 0.52, 0.36), s3) * (0.8 + 0.2 * sin(pc.x * 45.0)) * lt;
  else if (s2 <= 0.3 && pc.y > cs.y * (0.5 + 0.35 * s3) && fract(pc.y * 11.0) > 0.3) b = vec3(0.66, 0.62, 0.54) * lt * 0.9;
  return b;
}`;
function cwinMat() {
  const A = roomAtlases();
  const m = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.2, vertexColors: true });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HU, A, CT_WIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\n' + ROOM_GLSL)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 nV = normalize(normal), upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 tV = normalize(cross(upV, nV)), bV = cross(nV, tV), V = normalize(vViewPosition);
  vec3 rd = vec3(dot(-V, tV), dot(-V, bV), dot(-V, -nV));
  vec2 cs = vec2(1.25, 1.85), p = vec2(vUv.x, 1.0 - vUv.y) * cs;
  float fr = pow(1.0 - max(dot(nV, V), 0.0), 4.0);
  totalEmissiveRadiance += ctRoom(p, cs, rd, vColor.g, vColor.r, vColor.b) * (1.0 - 0.85 * fr) * uWinK; }`);
  };
  m.customProgramCacheKey = () => 'ct-cwin-1';
  return m;
}

// Chinatown atlases (public/assets/landmarks/ct, tools/blender/ct_signs.py): BC1 .dds when packed (ct_pack.py)
const CT = {};
function ctTex(name, png = false) {
  if (CT[name]) return CT[name];
  const url = (import.meta.env?.BASE_URL || './') + 'assets/landmarks/ct/' + name + (png ? '.png' : '.jpg');
  if (texpackOn()) return (CT[name] = loadPacked(url.replace(/\.(png|jpg)$/, '.dds') + '?v=2', { srgb: true, anisotropy: 8 }));
  const t = CT[name] = new THREE.TextureLoader().load(url);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function heroMat(slot) {
  if (slot === 'ground') return groundMat(null);
  const m = heroMats();
  return m[slot] || (slot.startsWith('d_') && m[slot.slice(2)]) || m.plain;
}

// per-site lightmapped variant of a wall slot (Chinatown blocks): same textures / patch + day (lightMap, uv1) and night maps.
// U = { uLmN: { value: tex }, uLmNK: { value }, uLmDK: { value } } shared by every slot of the site; dispose() when dropped.
export const CT_LM_SLOTS = new Set(['brickred', 'brick', 'stucco', 'stone', 'roof', 'rooftile', 'metal', 'concrete', 'paint']);
// rain haze around the Chinatown lanterns: one soft additive point sprite per lantern (site.glow), steady, faded in by
// night x (rain / fog), out with distance and when the sprite drops under ~2 px (no shimmer far away)
export const GLOW_U = { uGlowK: { value: 0 }, uVH: { value: 720 } };
let GLOW_MAT = null;
export function glowMat() {
  if (GLOW_MAT) return GLOW_MAT;
  GLOW_MAT = new THREE.ShaderMaterial({
    uniforms: GLOW_U,
    vertexShader: `uniform float uVH; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(0.5, -mv.z);
        float px = 1.7 * projectionMatrix[1][1] * uVH * 0.5 / d; gl_PointSize = min(px, 220.0);
        vA = (1.0 - smoothstep(260.0, 520.0, d)) * smoothstep(2.0, 5.0, d) * smoothstep(1.5, 4.0, px) * min(1.0, 220.0 / px); }`,
    fragmentShader: `uniform float uGlowK; varying float vA;
      void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard;
        float a = exp(-r2 * 3.5) - 0.03; gl_FragColor = vec4(vec3(1.0, 0.16, 0.05) * max(a, 0.0) * vA * uGlowK, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  GLOW_MAT.userData.keep = true;
  return GLOW_MAT;
}

// 'ground': the baked night light on the pavement in front of the blocks (lantern / sign / shop pools), drawn additively
// over the road + sidewalks (x a wet-asphalt albedo), invisible by day and without a lightmap
const GROUND_U = { uGAlb: { value: 0.06 } };
let GROUND_OFF = null;
function groundMat(U) {
  if (!U) return GROUND_OFF || (GROUND_OFF = Object.assign(new THREE.MeshBasicMaterial({ visible: false }), { userData: { keep: true } }));
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uNight: HU.uNight, ...GROUND_U },
    vertexShader: `attribute vec2 uv1; varying vec2 vUv1; varying float vD; varying float vF;
      void main(){ vUv1 = uv1; vF = color.r; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uLmN; uniform float uLmNK, uNight, uGAlb; varying vec2 vUv1; varying float vD; varying float vF;
      void main(){ vec3 e = texture2D(uLmN, vUv1).rgb * uLmNK * uNight * uGAlb * vF * (1.0 - smoothstep(180.0, 320.0, vD));
        gl_FragColor = vec4(e, 1.0); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
}
// far LOD of a lightmapped Chinatown block: the block's mean baked night light as a flat tint (no lightmap), U1 = { uLmAvg }
export function heroMatLM1(slot, U1) {
  const base = heroMat(slot);
  if (!CT_LM_SLOTS.has(slot) || slot === 'ground') return base;
  const m = new THREE.MeshStandardMaterial(); m.copy(base); m.userData.keep = false;
  patch(m, { ...(base.userData.hp || {}), lmAvg: U1 });
  return m;
}
export function heroMatLM(slot, U, dayTex) {
  if (slot === 'ground') { const m = groundMat(dayTex ? U : null); if (dayTex) m.userData.keep = false; return m; }
  const base = heroMat(slot);
  if (!CT_LM_SLOTS.has(slot) || !dayTex) return base;
  const P = base.userData.hp || {};
  const m = new THREE.MeshStandardMaterial();
  m.copy(base);
  m.lightMap = dayTex; m.lightMapIntensity = 1;
  m.userData.keep = false;
  patch(m, { ...P, aoK: 0.15, lm: U });
  return m;
}

// reflective slots sample scene.environment explicitly so their envMapIntensity applies (scene.environmentIntensity is low)
const REFL = { win: 0.9, shop: 0.8, glassc: 1.0, clear: 1.0, water: 1.0, chrome: 1.0, gold: 0.9, granite: 0.5, marble: 0.6 };
let SCENE = null;
export function setHeroScene(scene) { SCENE = scene; }
export function updateHeroMats(dt, env = {}) {
  HU.uNight.value = env.night || 0;
  GLOW_U.uGlowK.value = (env.night || 0) * (0.15 + 0.85 * Math.min(1, HB_WET.x)) * 0.13;
  HU.uTime.value = env.time || 0;
  const e = SCENE?.environment || null;
  if (M && e) for (const [k, i] of Object.entries(REFL)) {
    const m = M[k]; if (!m || m.envMap === e) continue;
    const was = !!m.envMap; m.envMap = e; m.envMapIntensity = i; if (!was) m.needsUpdate = true;
  }
}
