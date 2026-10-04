// One MeshStandardMaterial (+ onBeforeCompile) draws every opaque building surface, near and far:
//   M_PROC/M_SIDE/M_BACK  far facades: windows, storefronts, garages, cornice band, recess parallax + interior mapping,
//                         analytic recess sun-shadow, grime and rain streaks, all from a per-building params texture
//   M_SURF                explicit textured surfaces (near geometry, far trims/roofs): texture-array albedo/normal/AO
//   M_GLASS               near window glass: parallax interior rooms (walls, floor, ceiling, furniture, curtains/blinds)
//   M_CURTAIN             tower curtain walls (mullions, spandrels, office interiors)
//   M_LIGHT               small emissive fixtures (lamps, aviation lights)
// Per-vertex attributes: aUv(vec4) aC(u8x4) aK(mode + 32*layer + 2048*flags) aId(building id, <0 = never hidden) aG(vec4, glass only)
// A building is hidden in the far meshes (LOD swap) when uHide[id] = 255; the depth material honours it too.
import * as THREE from 'three';
import { LEAF_DECODE } from './kitleaf.js';
import { packedUrl, loadPacked, capImage } from '../texpack.js';
import { LAYER_COUNT, TILE, METAL } from './layers.js';

export const M = { PROC: 0, SIDE: 1, BACK: 2, SIDEX: 3, SURF: 5, GLASS: 7, LIGHT: 8, CURTAIN: 9, KIT: 10 };
// Blender-baked facade kit (tools/blender/facade_kit.py): unit order = uniform-array index in the shader
export const KIT_KEYS = ['vic_win', 'edw_win', 'ital_win', 'brick_win', 'stucco_win', 'modern_win', 'loft_win', 'vic_door', 'edw_door',
  'garage', 'store', 'store_door', 'awning', 'cornice', 'belt', 'ac', 'drain', 'fire'];
export const KIT = Object.fromEntries(KIT_KEYS.map((k, i) => [k, i]));
export const FLAG = { FRONT: 2048, NONRM: 4096 };
export const NP = 12;        // params texels per building
export const PW = 1200;      // params texture width (100 buildings per row)
export const HW = 256;       // hide texture width
export const NEAR_OFF = 4194304; // near-LOD vertices carry id + NEAR_OFF: never hidden, params still resolvable
// ?nov4 = A/B switch for the v4 street-front pass (grounding / bounce / weathering / murals in the shaders, clutter cells, tree wells)
export const NOV4 = typeof location !== 'undefined' && /[?&]nov4\b/.test(location.search || '');

const GLSL_COMMON = /* glsl */`
${NOV4 ? '#define HB_NOV4' : ''}
#define NP ${NP}
#define PW ${PW}
#define HW ${HW}
#define NEAR_OFF ${NEAR_OFF}.0
uniform highp sampler2D uHide;
`;

const VERT_PARS = /* glsl */`
${GLSL_COMMON}
attribute vec4 aUv; attribute vec4 aC; attribute float aK; attribute float aId; attribute vec4 aG;
varying vec4 vUv4; varying vec4 vC; varying vec4 vG; varying vec3 vWPos; varying vec3 vWNrm;
flat varying float vK; flat varying float vId;
`;

// R hides FAR geometry (its MID tile is shown / landmark), G hides MID parts flagged KITLOD (aK bit 8192) while the
// building's NEAR Blender-kit pieces are shown (v2detail.js)
// v3 street facades (v3front.js) swap on the B channel (set while the building's v3 kit cell is shown, V3_R):
// KITHI (aK bit 16384) = NEAR v3 geometry drawn only while B is set, V3LOD (bit 32768) = the MID parts it replaces
const HIDE = /* glsl */`
if (aId >= 0.0) {
  bool nearV = aId >= NEAR_OFF;
  float kfl = floor(aK / 8192.0);
  bool klod = mod(kfl, 2.0) > 0.5, khi = mod(floor(kfl / 2.0), 2.0) > 0.5, v3lod = mod(floor(kfl / 4.0), 2.0) > 0.5;
  if (!nearV || klod || khi || v3lod) {
    int hid = int((nearV ? aId - NEAR_OFF : aId) + 0.5);
    vec4 hv = texelFetch(uHide, ivec2(hid % HW, hid / HW), 0);
    // (v5) G / B are 3-state: 0 = the NEAR version is off, 128 = cross-fading (both drawn; the NEAR one dithers in by
    // distance, material uFadeR), 255 = the NEAR version is fully in (the MID stand-ins collapse)
    if (nearV ? ((klod && hv.g > 0.75) || (khi && hv.b < 0.25) || (v3lod && hv.b > 0.75)) : hv.r > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
}`;

// (v5) distance dither for the NEAR versions that cross-fade over their MID stand-ins (pop fix): kept where the
// screen-space blue-ish noise is below 1 - smoothstep(uFadeR.x, uFadeR.y, camera distance). Only the fade material
// variants carry it (a discard turns early-z off for the program).
export const fadeGLSL = (wp) => `
#ifdef HB_FADE
{ float dF = distance(${wp}.xz, cameraPosition.xz), fF = 1.0 - smoothstep(uFadeR.x, uFadeR.y, dF);
  if (fF < 0.999) { float tF = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (tF >= fF) discard; } }
#endif`;

// ---------------------------------------------------------------- night: street lamps near the camera light the walls
// (props v2 lamps, picked per frame in v2city.js lampUpdate); shared by the facade and the kit materials
export const NIGHT_IND = 0.25;       // share of the (sky) indirect diffuse a wall loses at full night (v4: 0.55 -> 0.25: the new night sky
                                     // is already dark; walls keep some moon / city-glow fill and read as dark but legible masses)
export const NIGHT_DIR = 0.3;        // share of the directional (moon) light a wall loses at night (v4: 0.6 -> 0.3)
const DIR_NIGHT = (u) => ['getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= 1.0 - ${u} * ${NIGHT_DIR.toFixed(2)};`];
let LAMPU = null;
export function lampUniforms() {
  if (!LAMPU) LAMPU = { max: 12, n: { value: 0 }, on: { value: 0 }, k: { value: 1.0 },
    pos: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, col: { value: Array.from({ length: 12 }, () => new THREE.Vector3(1, 0.85, 0.6)) } };
  if (typeof globalThis !== 'undefined') globalThis.__hbLampU = LAMPU;   // dev: look-dev probes
  return LAMPU;
}
// (after fog_pars_fragment: needs the lamp-map uniforms fog.js declares)
const LAMPWALL_GLSL = /* glsl */`
#ifdef HB_FOG_PARS
// street-lamp light map (render/lampmap.js: ground irradiance of every lamp around the camera, a = highest lamp head).
// A wall point takes the pool on the street in front of it (sampled 2.5 m out along its normal), scaled to a vertical
// receiver (lamps stand a few metres out from the wall with heads at 7-10 m: E_v / E_h ~ r / h ~ 0.5) and faded out above
// the lamp heads; up-facing surfaces take it all, soffits little. Returns -1 while the map is off.
vec3 hbLampWall(vec3 wp, vec3 n) {
  if (hbLampXf.w <= 0.001) return vec3(-1.0);
  vec2 hn = n.xz; float hl = length(hn);
  vec3 dirO = hl > 0.2 ? vec3(hn.x, 0.0, hn.y) / hl : vec3(0.0);
  vec2 uv = ((wp + dirO * 3.0).xz - hbLampXf.xy) * hbLampXf.z, uv2 = ((wp + dirO * 8.0).xz - hbLampXf.xy) * hbLampXf.z;
  // city glow: sky glow + the lit street network's bounce, a dim warm floor everywhere under the lamps' reach
  vec3 glow = vec3(1.0, 0.82, 0.65) * 0.1;   // (regression fix 9/30: 0.07 -> 0.1)
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return glow * hbLampXf.w;
  vec4 m = texture2D(hbLampTex, uv);
  vec3 m2 = texture2D(hbLampTex, clamp(uv2, 0.0, 1.0)).rgb;
  float below = m.a > 1.0 ? smoothstep(m.a + 1.5, m.a - 2.5, wp.y) : 0.5;
  // (look-dev) SF cobra heads are full cut-off with a house-side shield: a wall catches the pool low down (the lamp's
  // spill + the lit sidewalk right in front of it) and darkens up the storeys; roofs / sills above ~2.5 m barely catch
  // any. (was: vertical x0.5 all the way up to the lamp heads -> cream stucco read as daylit at night)
  float yr = wp.y - (m.a > 1.0 ? m.a - 8.0 : wp.y - 1.0);
  // (regression fix 9/30: 0.16 -> 0.32 and 0.2 -> 0.35: the upper storeys read near-black under ACES)
  float vfall = mix(1.0, 0.32, smoothstep(0.8, 5.5, yr));
  float recv = mix(0.35 * vfall, mix(1.0, 0.18, smoothstep(2.5, 5.0, yr)), smoothstep(0.15, 0.8, n.y)) * (n.y < -0.3 ? 0.15 : 1.0);
  // + the lit roadway bouncing onto the lower walls (asphalt / paving ~15 %), fading ~2 storeys up
  float bnc = 0.14 * (1.0 - smoothstep(-1.0, 8.0, wp.y - (m.a > 1.0 ? m.a - 8.0 : wp.y)));
  return (m.rgb * (below * recv) + (m.rgb + m2) * 0.5 * bnc * (0.5 - 0.5 * n.y) + glow) * hbLampXf.w;
}
#endif
`;
const LAMP_GLSL = /* glsl */`
uniform vec4 uLampP[12]; uniform vec3 uLampC[12]; uniform int uLampN; uniform float uLampK;
// irradiance / pi of the nearest street lamps (inverse square, soft cut-off at ~30 m, a little wrap so walls facing
// along the street still catch some light)
vec3 hbLamps(vec3 wp, vec3 n) {
  vec3 s = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    if (k >= uLampN) break;
    vec4 L = uLampP[k]; vec3 d = L.xyz - wp; float d2 = dot(d, d);
    if (d2 > 1024.0) continue;
    float dl = sqrt(d2), ndl = dot(n, d / dl);
    float lam = max(ndl, 0.0) * 0.85 + 0.15 * clamp(ndl + 0.4, 0.0, 1.0);
    s += uLampC[k] * (lam * L.w * 13.0 / (d2 + 4.0) * (1.0 - smoothstep(18.0, 32.0, dl)));
  }
  return s * uLampK;
}
`;
// opts.leaf: leaf-card atlas (kitleaf.js): cards (u >= 2) sample it, alpha-test, take a soft canopy normal + sun transmission
export function patchKitMaterial(mat, night, opts = {}) {
  const LU = lampUniforms();
  const LEAF = !!opts.leaf;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night; sh.uniforms.uLampP = LU.pos; sh.uniforms.uLampC = LU.col; sh.uniforms.uLampN = LU.n; sh.uniforms.uLampK = LU.k;
    if (LEAF) { sh.uniforms.uLeafTex = { value: opts.leaf }; kitLeafFrag(sh); }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vKW; varying vec3 vKN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKW = (modelMatrix * vec4(transformed, 1.0)).xyz; vKN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = '#define HB_NO_LAMPMAP\n' + sh.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + LAMPWALL_GLSL).replace('#include <common>', `#include <common>
varying vec3 vKW; varying vec3 vKN; uniform float uNight;
${NOV4 ? '#define HB_NOV4' : ''}
` + LAMP_GLSL)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(...DIR_NIGHT('uNight')))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 lampE = vec3(-1.0);
#ifdef HB_FOG_PARS
  lampE = hbLampWall(vKW, normalize(vKN));
#endif
  if (lampE.x >= 0.0) totalEmissiveRadiance += diffuseColor.rgb * lampE * RECIPROCAL_PI * (1.0 - 0.8 * metalnessFactor);
  else if (uLampN > 0 && uNight > 0.02) totalEmissiveRadiance += diffuseColor.rgb * hbLamps(vKW, normalize(vKN)) * uNight * (1.0 - 0.8 * metalnessFactor);
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= 1.0 - uNight * ${NIGHT_IND.toFixed(2)};
float kAOd = 1.0;
#if defined(USE_AOMAP) && !defined(HB_NOV4)
kAOd = ambientOcclusion;
// baked AO darkens the sun too (three applies it to the indirect only: kit casings / sills / tiles read flat in sun)
reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.55);
#endif
#if NUM_DIR_LIGHTS > 0 && !defined(HB_NOV4)
{ // warm bounce from the sunlit street (same model as the facade material)
  vec3 sWk = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
  float upK = max(sWk.y, 0.0) * (1.0 - uNight); vec3 nWk = normalize(vKN);
  float oppK = max(-dot(sWk, nWk), 0.0) * (1.0 - abs(nWk.y)) * step(0.001, upK) * 0.1 * (1.0 - uNight);
  reflectedLight.indirectDiffuse += directionalLights[0].color * ((upK * 0.5 * (1.0 - nWk.y) * 0.55 * 0.22) * vec3(1.0, 0.84, 0.64) + oppK * vec3(0.98, 0.9, 0.8)) * BRDF_Lambert(material.diffuseColor) * kAOd;
}
#endif`);
  };
  if (opts.fade) {
    const ob = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh) => {
      ob(sh);
      sh.uniforms.uFadeR = opts.fade;
      sh.fragmentShader = '#define HB_FADE\nuniform vec2 uFadeR;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + fadeGLSL('vKW'));
    };
  }
  mat.customProgramCacheKey = () => 'kit-night-v2' + (NOV4 ? 'a' : '') + (LEAF ? 'L' : '') + (opts.fade ? 'F' : '');
}
function kitLeafFrag(sh) {
  const T = THREE.ShaderChunk;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uLeafTex;')
    .replace('#include <map_fragment>', LEAF_DECODE + `
#ifdef USE_MAP
vec4 sampledDiffuseColor;
if (kLeaf) {
  vec4 lt = texture2D(uLeafTex, kLeafUv);
  float aT = lt.a;
  { vec2 dx = dFdx(kLeafUv * 4096.0), dy = dFdy(kLeafUv * 4096.0); aT *= 1.0 + 0.3 * max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))); }
  { vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); aT *= smoothstep(0.05, 0.25, abs(dot(fn, normalize(vViewPosition)))); }
  if (aT < 0.5) discard;
  vec3 lc = lt.rgb / max(lt.a, 0.02);
  float hh = fract(sin(dot(floor(vKW * 2.3), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  if (kLeafType > 0.5) {
    float lum = dot(lc, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = kLeafType < 1.5 ? mix(vec3(0.95, 0.12, 0.45), vec3(0.85, 0.08, 0.3), hh) : mix(vec3(0.45, 0.55, 1.0), vec3(1.0, 0.55, 0.75), step(0.55, hh));
    lc = mix(lc, tint * (0.35 + 1.1 * lum), smoothstep(0.25, 0.6, lum));
  } else lc *= mix(vec3(0.9, 1.0, 0.9), vec3(1.08, 1.02, 0.86), hh);
  sampledDiffuseColor = vec4(lc, 1.0);
} else sampledDiffuseColor = texture2D(map, vMapUv);
diffuseColor *= sampledDiffuseColor;
#endif`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (kLeaf) roughnessFactor = 0.78;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (kLeaf) metalnessFactor = 0.0;')
    .replace('#include <normal_fragment_maps>', 'if (!kLeaf) {\n' + T.normal_fragment_maps + '\n}')
    .replace('#include <aomap_fragment>', T.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', '(kLeaf ? kLeafAO : texture2D( aoMap, vAoMapUv ).r)') + `
#if NUM_DIR_LIGHTS > 0
if (kLeaf) {   // sun through the leaves (back-lit glow) like the tree canopies
  vec3 sL = directionalLights[0].direction;
  float back = pow(saturate(dot(-geometryViewDir, sL)), 4.0), thru = saturate(-dot(geometryNormal, sL));
  reflectedLight.directDiffuse += material.diffuseColor * directionalLights[0].color * (0.25 * thru + 0.55 * back) * (1.0 - uNight) * kLeafAO;
}
#endif`);
  if (!sh.fragmentShader.includes('kLeafAO : texture2D')) console.warn('[kit] leaf AO patch missed');
}

const FRAG_PARS = /* glsl */`
${GLSL_COMMON}
uniform highp sampler2DArray uAlb;
uniform highp sampler2DArray uNrm;
uniform highp sampler2D uParams;
uniform float uNight;
uniform float uTime;
uniform float uInvTile[${LAYER_COUNT}];
uniform float uMetal[${LAYER_COUNT}];
uniform sampler2D uRoomsD; uniform sampler2D uRoomsN; uniform sampler2D uShopsD; uniform sampler2D uShopsN;
uniform vec2 uAtlasOn;   // x: rooms atlas loaded, y: shops atlas loaded
${LAMP_GLSL}
float gRoomLod = 0.0;
varying vec4 vUv4; varying vec4 vC; varying vec4 vG; varying vec3 vWPos; varying vec3 vWNrm;
flat varying float vK; flat varying float vId;

vec4 bp(int k){ float b = vId >= NEAR_OFF ? vId - NEAR_OFF : vId; int i = int(b + 0.5) * NP + k; return texelFetch(uParams, ivec2(i % PW, i / PW), 0); }
float fh1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
// render agent: palette mute toward real SF (cream, white, grey, sand, terracotta); Victorian siding / shingle keep
// more of their paint (muted pastels). s = kept saturation
vec3 hbMute(vec3 c, float s){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return max(mix(l * vec3(1.05, 1.0, 0.9), c, s), 0.0); }
float hbMuteK(float layer){ return (abs(layer - 3.0) < 0.5 || abs(layer - 4.0) < 0.5) ? 0.72 : 0.5; }
float fh2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn1(float x){ float i = floor(x), f = fract(x); return mix(fh1(i), fh1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh2(i), fh2(i + vec2(1, 0)), u.x), mix(fh2(i + vec2(0, 1)), fh2(i + vec2(1, 1)), u.x), u.y); }
vec3 srgbDec(vec3 c){ return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
// ---- generated murals (original art) for exposed side walls in the Mission / SoMa (decor bit 1): q in [0,1]^2 of the
// painted area, asp = width / height, sd = seed. Three families: landscape (banded sky, sun + rays, layered hills,
// flower band), giant stylised flowers, stepped geometric bands. Returns sRGB.
vec3 hbPal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
vec3 hbMural(vec2 q, float asp, float sd, float aa) {
  vec2 p = vec2(q.x * asp, q.y);
  float kind = floor(fract(sd * 7.31) * 3.0), h0 = fract(sd * 3.7);
  vec3 c;
  if (kind < 0.5) {
    c = mix(hbPal(h0 + 0.05), hbPal(h0 + 0.42), smoothstep(0.3, 1.0, q.y));
    vec2 sc = vec2(asp * (0.2 + 0.6 * fract(sd * 11.0)), 0.7);
    vec2 dv = p - sc; float r = length(dv), ang = atan(dv.y, dv.x);
    c = mix(c, hbPal(h0 + 0.15) * 1.1, smoothstep(0.5 - aa, 0.5 + aa, fract(ang * 2.546 + 0.25)) * smoothstep(1.1, 0.2, r) * 0.35);
    c = mix(c, vec3(1.0, 0.86, 0.36), 1.0 - smoothstep(0.17 - aa, 0.17 + aa, r));
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float ridge = 0.56 - 0.13 * fk + 0.07 * sin(p.x * (2.0 + fk * 1.3) + sd * 20.0 + fk) + 0.03 * sin(p.x * 7.0 + fk * 3.0);
      c = mix(c, hbPal(h0 + 0.55 + 0.12 * fk) * (0.5 + 0.17 * fk), 1.0 - smoothstep(ridge - aa, ridge + aa, q.y));
    }
    vec2 g = vec2(p.x * 4.0, q.y * 4.0), gi = floor(g), gf = fract(g) - 0.5;
    float fl = (1.0 - smoothstep(0.23, 0.25, q.y)) * step(0.3, fh2(gi + sd * 17.0));
    float pr = length(gf), pa = atan(gf.y, gf.x);
    c = mix(c, hbPal(fh2(gi + 3.0 + sd)), (1.0 - smoothstep(0.28 - aa * 4.0, 0.3 + aa * 4.0, pr * (1.0 + 0.35 * cos(pa * 5.0)))) * fl);
    c = mix(c, vec3(1.0, 0.9, 0.3), (1.0 - smoothstep(0.07, 0.09 + aa * 4.0, pr)) * fl);
  } else if (kind < 1.5) {
    c = mix(hbPal(h0) * 0.75, hbPal(h0 + 0.5) * 0.62, smoothstep(0.5 - aa, 0.5 + aa, fract(p.x * 0.35 + q.y * 0.5)));
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      vec2 cc = vec2(asp * fract(sd * (3.1 + fk * 1.7) + fk * 0.27), 0.25 + 0.5 * fract(sd * (5.3 + fk)));
      float rad = 0.2 + 0.12 * fract(sd * 9.0 + fk);
      vec2 d = p - cc; float rr = length(d), an = atan(d.y, d.x) + fk;
      float pet = 5.0 + floor(fract(sd * 13.0 + fk) * 4.0);
      float sh = rr / (rad * (0.62 + 0.38 * abs(cos(an * pet * 0.5))));
      float e = aa / rad;
      c = mix(c, hbPal(h0 + 0.2 + 0.23 * fk), 1.0 - smoothstep(1.0 - e, 1.0 + e, sh));
      c = mix(c, hbPal(h0 + 0.7 + 0.1 * fk) * 0.85, 1.0 - smoothstep(0.36 - e, 0.36 + e, sh));
      c = mix(c, vec3(0.98, 0.92, 0.6), 1.0 - smoothstep(0.13 - e, 0.13 + e, sh));
    }
  } else {
    float row = floor(q.y * 5.0), fy = fract(q.y * 5.0), ea = aa * 5.0;
    vec3 b0 = hbPal(h0 + row * 0.17), b1 = hbPal(h0 + row * 0.17 + 0.5) * 0.75;
    float zz = abs(fract(p.x * (1.5 + row * 0.5)) - 0.5) * 2.0;
    float m = mod(row, 2.0) < 0.5 ? smoothstep(-ea, ea, zz - fy) : 1.0 - smoothstep(0.45 - ea, 0.45 + ea, abs(fy - 0.5) + abs(fract(p.x * 2.0 + 0.5 * row) - 0.5));
    c = mix(b0, b1, m);
    c = mix(c, vec3(0.08, 0.07, 0.07), 1.0 - smoothstep(0.02, 0.04 + ea, fy));
  }
  float bd = min(min(q.x * asp, (1.0 - q.x) * asp), min(q.y, 1.0 - q.y));
  return mix(vec3(0.07, 0.07, 0.08), c, smoothstep(0.03, 0.045 + aa, bd));
}
// anti-aliased box mask of p in [lo, hi] with pixel footprint aa
float boxAA(vec2 p, vec2 lo, vec2 hi, vec2 aa){ vec2 a = smoothstep(lo - aa, lo + aa, p) * (1.0 - smoothstep(hi - aa, hi + aa, p)); return a.x * a.y; }
float bandAA(float x, float lo, float hi, float aa){ return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x)); }
// exact box-filtered pulse train / band: the share of [x - w/2, x + w/2] inside [lo, hi] (mod p). Converges to the duty
// cycle when a period is under a pixel, so a far facade keeps its window grid without moire or per-cell sparkle.
float pulseI(float x, float lo, float hi, float p){ float q = floor(x / p); return q * (hi - lo) + clamp(x - q * p - lo, 0.0, hi - lo); }
float pulseAA(float x, float lo, float hi, float p, float w){ return (pulseI(x + 0.5 * w, lo, hi, p) - pulseI(x - 0.5 * w, lo, hi, p)) / w; }
float bandF(float x, float lo, float hi, float w){ return clamp((min(x + 0.5 * w, hi) - max(x - 0.5 * w, lo)) / w, 0.0, 1.0); }

// ray / box (slab), returns entry t (or 1e9) and the entry face normal
float boxHit(vec3 ro, vec3 ird, vec3 bmin, vec3 bmax, out vec3 nrm){
  vec3 t0 = (bmin - ro) * ird, t1 = (bmax - ro) * ird;
  vec3 tmin = min(t0, t1), tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z), tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf < max(tn, 0.0) || tn < 0.0) { nrm = vec3(0.0); return 1e9; }
  nrm = tn == tmin.x ? vec3(-sign(ird.x), 0.0, 0.0) : tn == tmin.y ? vec3(0.0, -sign(ird.y), 0.0) : vec3(0.0, 0.0, -sign(ird.z));
  return tn;
}

// ---------------------------------------------------------------- baked interior atlas (single-texture interior mapping)
// normalised room: window plane z = 0, x,y in [-1,1], back wall at z = -1; tile uv = 0.5 + 0.5 * p.xy / (1 - p.z)
vec3 bakedRoom(vec2 p, vec2 cs, vec3 rd, float D, float tile, bool shop, float lit, float lod){
  vec2 hs = cs * 0.5;
  vec3 o = vec3((p - hs) / hs, 0.0);
  vec3 r = vec3(rd.x / hs.x, rd.y / hs.y, -max(rd.z, 0.02) / D);
  o.xy = clamp(o.xy, vec2(-0.999), vec2(0.999));
  vec3 ir = 1.0 / vec3(abs(r.x) < 1e-4 ? 1e-4 : r.x, abs(r.y) < 1e-4 ? 1e-4 : r.y, r.z);
  float tx = ((r.x > 0.0 ? 1.0 : -1.0) - o.x) * ir.x;
  float ty = ((r.y > 0.0 ? 1.0 : -1.0) - o.y) * ir.y;
  float tz = (-1.0 - o.z) * ir.z;
  float t = max(min(min(tx, ty), tz), 0.0);
  vec3 h = o + r * t;
  vec2 uv = clamp(0.5 + 0.5 * h.xy / (1.0 - h.z), vec2(0.002), vec2(0.998));
  vec2 auv;
  if (shop) { float c = mod(tile, 2.0), rw = floor(tile / 2.0); auv = vec2((c + uv.x) * 0.5, (3.0 - rw + uv.y) * 0.25); }
  else { float c = mod(tile, 4.0), rw = floor(tile / 4.0); auv = vec2((c + uv.x) * 0.25, (3.0 - rw + uv.y) * 0.25); }
  vec3 dayC = shop ? textureLod(uShopsD, auv, lod).rgb : textureLod(uRoomsD, auv, lod).rgb;
  vec3 nightC = shop ? textureLod(uShopsN, auv, lod).rgb : textureLod(uRoomsN, auv, lod).rgb;
  float dayK = shop ? 0.5 : 0.42;
  vec3 dayR = dayC * dayK * (1.0 - uNight) + dayC * 0.03 * uNight;
  return mix(dayR, nightC * (shop ? 1.15 : 1.35), lit * uNight);   // was 1.9 / 1.6: big v2 shop glass clipped to white
}

// ---------------------------------------------------------------- interior mapping
// p: point on the glass in cell coords (m); cs: cell size (m); rd: tangent ray (x right, y up, z into the building);
// win: window rect in cell coords (for curtains); seed 0..1; itype; lit 0/1. Returns radiance (emissive).
vec3 room(vec2 p, vec2 cs, vec3 rd, vec4 win, float seed, float itype, float lit, float fade){
  float s1 = fh1(seed * 91.7 + 1.3), s2 = fh1(seed * 53.1 + 7.9), s3 = fh1(seed * 17.3 + 3.1), s4 = fh1(seed * 29.9 + 5.7);
  bool office = itype > 0.5 && itype < 1.5, shop = itype > 1.5 && itype < 2.5, lobby = itype > 2.5 && itype < 3.5;
  bool loft = itype > 3.5 && itype < 4.5, cafe = itype > 4.5 && itype < 5.5, dim = itype > 5.5;
  bool useShop = (shop || cafe || lobby) && uAtlasOn.y > 0.5, useRoom = !(shop || cafe || lobby) && uAtlasOn.x > 0.5;
  if ((useShop || useRoom) && fade < 0.98) {
    float lod = clamp(log2(max(fwidth(p.x) / cs.x, fwidth(p.y) / cs.y) * 512.0 + 1e-4), 0.0, 8.0);
    vec3 b = bakedRoom(p, cs, rd, useShop ? (lobby ? 7.0 : 4.0) : (office ? 6.0 : 3.8), floor(s1 * (useShop ? 8.0 : 16.0)), useShop, lobby ? 1.0 : lit, lod);
    if (useRoom && !office) b *= mix(vec3(1.0), s4 < 0.45 ? vec3(1.1, 0.84, 0.62) : s4 > 0.9 ? vec3(0.86, 0.93, 1.06) : vec3(1.02, 0.95, 0.86), uNight);   // tungsten / warm LED / cool
    // curtains / blinds overlay
    vec2 pc = p + rd.xy * (0.14 / max(rd.z, 0.05));
    if (useRoom) {
      if (office || s2 > 0.62) { float bl = win.w - (win.w - win.y) * (0.1 + 0.4 * s3); if (pc.y > bl && step(0.25, fract(pc.y * 11.0)) > 0.5) b = (office ? vec3(0.55, 0.55, 0.52) : vec3(0.7, 0.66, 0.58)) * ((1.0 - uNight) * 0.35 + lit * uNight * 0.9); }
      else { float cw2 = (win.z - win.x) * (0.06 + 0.14 * s4); if (pc.x < win.x + cw2 || pc.x > win.z - cw2) b = mix(vec3(0.5, 0.12, 0.1), vec3(0.6, 0.55, 0.42), s3) * (0.8 + 0.2 * sin(pc.x * 45.0)) * ((1.0 - uNight) * 0.3 + lit * uNight * 1.1); }
      // sheer net curtains in many homes: a bright translucent layer just behind the glass (reads as a lived-in
      // window by day, glows softly when the room is lit)
      if (!office && !loft && !dim && fh1(seed * 41.3 + 2.2) < 0.45) {
        vec2 ps = p + rd.xy * (0.06 / max(rd.z, 0.05));
        float fold = 0.82 + 0.18 * sin(ps.x * 38.0 + 3.0 * sin(ps.y * 2.0));
        vec3 sh = vec3(0.86, 0.84, 0.78) * fold * ((1.0 - uNight) * 0.34 + lit * uNight * vec3(1.25, 1.0, 0.72) * 1.1);
        b = mix(b, sh, 0.62);
      }
    }
    return b;
  }
  float D = office ? 7.0 + s1 * 5.0 : shop || cafe ? 5.0 + s1 * 4.0 : lobby ? 8.0 : loft ? 6.0 + s1 * 5.0 : 3.4 + s1 * 3.0;
  float ceilY = cs.y - (office ? 0.55 : 0.28);
  // rooms may span neighbouring cells: widen by a hashed amount on each side
  float xl = -cs.x * floor(s3 * 2.0), xr = cs.x * (1.0 + floor(s4 * 1.6));
  vec3 rdn = rd; rdn.z = max(rdn.z, 0.02);
  vec3 ird = 1.0 / vec3(abs(rdn.x) < 1e-4 ? 1e-4 : rdn.x, abs(rdn.y) < 1e-4 ? 1e-4 : rdn.y, rdn.z);
  p = clamp(p, vec2(xl + 0.01, 0.01), vec2(xr - 0.01, ceilY - 0.01));
  vec3 o = vec3(p, 0.0);
  float tx = ((rdn.x > 0.0 ? xr : xl) - p.x) * ird.x;
  float ty = ((rdn.y > 0.0 ? ceilY : 0.0) - p.y) * ird.y;
  float tz = D * ird.z;
  float t = clamp(min(min(tx, ty), tz), 0.0, 60.0);
  vec3 h = o + rdn * t;
  // palette
  vec3 wallC, floorC, ceilC = vec3(0.62, 0.61, 0.58), furnC;
  float pal = floor(s2 * 8.0);
  wallC = pal < 1.0 ? vec3(0.5, 0.45, 0.36) : pal < 2.0 ? vec3(0.58, 0.58, 0.55) : pal < 3.0 ? vec3(0.33, 0.4, 0.46) : pal < 4.0 ? vec3(0.36, 0.42, 0.32)
        : pal < 5.0 ? vec3(0.5, 0.36, 0.25) : pal < 6.0 ? vec3(0.5, 0.34, 0.34) : pal < 7.0 ? vec3(0.58, 0.5, 0.26) : vec3(0.14, 0.22, 0.18);
  floorC = s3 < 0.6 ? vec3(0.28, 0.16, 0.08) : s3 < 0.85 ? vec3(0.2, 0.2, 0.23) : vec3(0.42, 0.4, 0.37);
  furnC = mix(vec3(0.12, 0.1, 0.09), vec3(0.45, 0.3, 0.2), s4);
  if (office) { wallC = vec3(0.5, 0.5, 0.5); floorC = vec3(0.16, 0.17, 0.2); ceilC = vec3(0.7); furnC = vec3(0.3, 0.3, 0.32); }
  if (shop) { wallC = vec3(0.55, 0.53, 0.5); floorC = vec3(0.4, 0.39, 0.36); ceilC = vec3(0.65); }
  if (lobby) { wallC = vec3(0.62, 0.56, 0.46); floorC = vec3(0.55, 0.52, 0.48); ceilC = vec3(0.7); }
  if (cafe) { wallC = mix(vec3(0.45, 0.2, 0.12), vec3(0.5, 0.4, 0.2), s2); floorC = vec3(0.18, 0.1, 0.05); furnC = vec3(0.2, 0.12, 0.07); }
  if (loft) { floorC = vec3(0.3, 0.18, 0.09); ceilC = vec3(0.2, 0.19, 0.18); }
  vec3 col; vec3 n;
  bool resRoom = !office && !shop && !lobby && !loft && !cafe && !dim;
  float bwTile = floor(s1 * 8.0);
  vec2 bwBase = vec2(mod(bwTile, 4.0) * 0.25, (1.0 - floor(bwTile / 4.0)) * 0.5);
  bool backTex = false;
  if (t == tz) {
    n = vec3(0.0, 0.0, -1.0); col = wallC;
    if (loft) { vec4 b = textureLod(uAlb, vec3(h.xy / ${TILE[0].toFixed(1)}, 0.0), 1.0); col = srgbDec(b.rgb); }
    // back-wall decor: a door, a picture or shelves
    float dx = xl + (xr - xl) * (0.2 + 0.6 * s1);
    if (!backTex && !office && !shop && abs(h.x - dx) < 0.45 && h.y < 2.1) col = mix(col, vec3(0.2, 0.13, 0.08), 0.8);
    else if (!backTex && !office && !shop && s4 > 0.35 && abs(h.x - (xl + (xr - xl) * (0.75 - 0.5 * s1))) < 0.4 && abs(h.y - 1.55) < 0.3) col = mix(vec3(0.05), vec3(fh1(seed * 7.0), fh1(seed * 9.0), fh1(seed * 11.0)) * 0.7, step(0.04, min(0.4 - abs(h.x - (xl + (xr - xl) * (0.75 - 0.5 * s1))), 0.3 - abs(h.y - 1.55))));
    if (shop) { float sh = fract(h.y * 2.4); float prod = fh2(floor(vec2(h.x * 6.0, h.y * 2.4))); col = h.y < 2.2 ? (sh < 0.12 ? vec3(0.6) : mix(vec3(0.7, 0.2, 0.1), vec3(0.2, 0.4, 0.7), prod) * (0.6 + 0.6 * fh2(floor(vec2(h.x * 14.0, h.y * 2.4))))) : col; }
  } else if (t == tx) {
    n = vec3(-sign(rdn.x), 0.0, 0.0); col = wallC * 0.86;
    if (office && h.z > 1.0) col *= 0.9;
  } else if (rdn.y < 0.0) {
    n = vec3(0.0, 1.0, 0.0); col = floorC;
    if (!office) col *= 0.85 + 0.15 * step(0.5, fract(h.x * 5.0 + floor(h.z * 0.8) * 0.37));
    if (lobby) col *= 0.8 + 0.2 * step(0.5, fract(h.x * 0.8 + 0.5 * step(0.5, fract(h.z * 0.8))));
  } else {
    n = vec3(0.0, -1.0, 0.0); col = ceilC;
    if (loft) col *= 0.6 + 0.4 * step(0.18, fract(h.z * 0.5));
  }
  // furniture
  vec3 fn; float tf = 1e9; vec3 fc = furnC;
  if (office) {
    float t1 = boxHit(o, ird, vec3(xl + 0.3, 0.0, 1.3), vec3(xr - 0.3, 0.74, 2.1), fn);
    vec3 fn2; float t2 = boxHit(o, ird, vec3(xl, 0.0, 3.2), vec3(xr, 1.25, 3.3), fn2);
    if (t2 < t1) { t1 = t2; fn = fn2; fc = vec3(0.34, 0.36, 0.4); }
    tf = t1;
  } else if (shop) {
    tf = boxHit(o, ird, vec3(cs.x * (0.45 + 0.2 * s3), 0.0, 1.2), vec3(cs.x * 0.98, 1.0, 1.9), fn); fc = vec3(0.45, 0.4, 0.34);
  } else if (cafe) {
    float tc = floor(h.x / 1.6);
    tf = boxHit(o, ird, vec3(0.3 + s3 * 0.6, 0.0, 1.4), vec3(1.1 + s3 * 0.6, 0.75, 2.1), fn);
  } else if (!lobby && !dim && !resRoom) {
    float w = min(2.1, (xr - xl) * 0.55);
    float x0 = xl + (xr - xl - w) * s3;
    tf = boxHit(o, ird, vec3(x0, 0.0, D - 0.95), vec3(x0 + w, 0.85, D), fn);
    vec3 fn2; float t2 = boxHit(o, ird, vec3(xl, 0.0, D * 0.25), vec3(xl + 0.38, 1.9 + s1 * 0.3, D * 0.25 + 1.1), fn2);
    if (t2 < tf) { tf = t2; fn = fn2; fc = vec3(0.22, 0.14, 0.08); }
  }
  if (tf < t) {
    vec3 hf = o + rdn * tf;
    col = fc * (fn.y > 0.5 ? 1.25 : fn.z < -0.5 ? 1.0 : 0.8);
    if (shop && fn.z < -0.5) col *= 0.9;
    if (office && fn.y > 0.5) col = mix(col, vec3(0.5), 0.3);
    h = hf; n = fn;
  }
  // lighting: daylight from the window falls off with depth; lamps at night
  float day = 1.0 - uNight;
  float amb = (0.1 + 0.16 * exp(-clamp(h.z, 0.0, 30.0) * 0.35)) * day * (0.8 + 0.4 * max(n.y, 0.0));
  vec3 lampC = s1 < 0.72 ? vec3(1.0, 0.74, 0.46) : s1 < 0.9 ? vec3(1.0, 0.88, 0.7) : vec3(0.7, 0.82, 1.0);
  if (office || shop || lobby) lampC = vec3(0.95, 0.97, 1.0);
  vec3 lp = vec3((xl + xr) * 0.5, ceilY - 0.25, D * 0.45);
  vec3 dl = lp - h; float dist2 = dot(dl, dl);
  float lampK = lit * (0.12 + 0.88 * uNight);
  float lamp = lampK * (1.8 / (1.0 + 0.14 * dist2)) * (0.5 + 0.5 * max(dot(n, normalize(dl + vec3(0.0, 0.0, 1e-3))), 0.0));
  if (office || shop) lamp = lit * (0.22 + 1.3 * uNight) * (1.0 + 0.25 * max(dot(n, vec3(0.0, -1.0, 0.0)), 0.0));
  if (lit > 0.5 && t == ty && rdn.y > 0.0) { // ceiling fixture glow / office panel grid
    if (office) col += vec3(2.2) * (0.05 + 0.95 * uNight) * step(0.62, fract(h.x * 0.8)) * step(0.55, fract(h.z * 0.6));
    else col += lampC * 3.0 * (0.3 + 0.7 * uNight) * smoothstep(0.35, 0.0, length(h.xz - lp.xz));
  }
  vec3 rad = col * (amb + lamp * lampC);
  // TV flicker in some living rooms
  if (!office && !shop && lit > 0.5 && s4 > 0.8) rad += vec3(0.1, 0.16, 0.3) * (0.85 + 0.15 * sin(uTime * 1.3 + seed * 40.0)) * uNight;   // TV glow: slow, shallow (was a 1 Hz 40 % pulse)
  // curtains / blinds on a plane just behind the glass
  float zc = 0.14; vec2 pc = p + rd.xy * (zc / max(rd.z, 0.05));
  float cover = 0.0; vec3 cc = vec3(0.0);
  if (!shop && !lobby && !cafe) {
    if (office || s2 > 0.62) {
      float bl = win.w - (win.w - win.y) * (0.1 + 0.4 * s3);
      if (pc.y > bl) { cover = step(0.25, fract(pc.y * 11.0)); cc = office ? vec3(0.55, 0.55, 0.52) : vec3(0.7, 0.66, 0.58); }
    } else {
      float cw = (win.z - win.x) * (0.06 + 0.14 * s4);
      if (pc.x < win.x + cw || pc.x > win.z - cw) { cover = 1.0; cc = mix(vec3(0.5, 0.12, 0.1), vec3(0.6, 0.55, 0.42), s3) * (0.8 + 0.2 * sin(pc.x * 45.0)); }
    }
  }
  vec3 curtainRad = cc * (amb * 1.2 + lit * lampC * (0.06 + 1.25 * uNight));
  rad = mix(rad, curtainRad, cover);
  // distant fade: average room
  vec3 avg = wallC * (0.28 * day + lit * 1.3 * lampC);
  return mix(rad, avg, fade);
}


// ---------------------------------------------------------------- baked facade kit (atlas: albedo / normal+height / masks)
#define NKIT ${KIT_KEYS.length}
#define KH0 -0.40
#define KH1 0.50
uniform sampler2D uFA; uniform sampler2D uFN; uniform sampler2D uFM;
uniform float uFOn; uniform float uKM;
uniform vec4 uKU[NKIT]; uniform vec4 uKO[NKIT]; uniform vec4 uKS[NKIT];
struct KS { vec3 alb; vec3 n; float h; float ao; float rough; float glass; float trim; float wall; float acc; };
vec2 kUV(int k, vec2 p){
  vec4 sz = uKS[k], r = uKU[k];
  if (sz.w > 0.5 && sz.w < 1.5) p.x = mod(p.x, sz.x); else if (sz.w > 1.5) p.y = mod(p.y, sz.y);
  p = clamp(p, vec2(0.004), sz.xy - 0.004);
  return r.xy + p / sz.xy * (r.zw - r.xy);
}
float kHt(int k, vec2 p, float lod){ return mix(KH0, KH1, textureLod(uFN, kUV(k, p), lod).b); }
// 9-slice: cell point q -> unit coords; rect R (cell coords) receives the unit opening O; margins squash to fit the cell
vec2 kMap(vec2 q, vec4 R, vec4 O, vec2 S, vec4 cell){
  vec4 need = vec4(O.xy, S - O.zw);
  vec4 have = max(vec4(R.xy - cell.xy, cell.zw - R.zw), vec4(1e-3));
  vec4 k = max(need / have, vec4(1.0));
  vec2 r;
  r.x = q.x < R.x ? O.x - (R.x - q.x) * k.x : q.x > R.z ? O.z + (q.x - R.z) * k.z : O.x + (q.x - R.x) / max(R.z - R.x, 1e-3) * (O.z - O.x);
  r.y = q.y < R.y ? O.y - (R.y - q.y) * k.y : q.y > R.w ? O.w + (q.y - R.w) * k.w : O.y + (q.y - R.y) / max(R.w - R.y, 1e-3) * (O.w - O.y);
  return r;
}
// parallax occlusion in unit space. rd: tangent ray (x right, y up, z into the wall). Returns the hit, hh = its height (m)
vec2 kPom(int k, vec2 p, vec3 rd, float steps, float lod, float dBot, out float hh){
  vec2 dir = rd.xy / max(rd.z, 0.3);
  float dTop = 0.26;
  float ds = (dTop + dBot) / steps;
  float sd = -dTop; vec2 q = p + dir * sd; float h = kHt(k, q, lod); float df = h + sd;
  if (df >= 0.0) { hh = h; return q; }
  for (int i = 0; i < 16; i++) {
    if (float(i) >= steps) break;
    float sp = sd, dp = df;
    sd += ds; q = p + dir * sd; h = kHt(k, q, lod); df = h + sd;
    if (df >= 0.0) { float t = dp / (dp - df); sd = mix(sp, sd, t); q = p + dir * sd; hh = kHt(k, q, lod); return q; }
  }
  hh = h; return q;
}
// soft self-shadow of the relief toward the sun (sT: sun in tangent space, z out of the wall)
float kShadow(int k, vec2 p, float h0, vec3 sT, float lod){
  if (sT.z < 0.03) return 0.0;
  vec2 dir = sT.xy / max(sT.z, 0.12);
  float sh = 1.0;
  for (int i = 1; i <= 6; i++) {
    float t = float(i) * 0.045;
    float hr = h0 + t;
    float h = kHt(k, p + dir * t, lod);
    sh = min(sh, clamp(1.0 - (h - hr) * 30.0, 0.0, 1.0));
  }
  return sh;
}
KS kFetch(int k, vec2 p, vec2 gx, vec2 gy){
  KS o; vec2 uv = kUV(k, p);
  vec4 a = textureGrad(uFA, uv, gx, gy);
  vec4 n = textureGrad(uFN, uv, gx, gy);
  vec2 mu = vec2(uv.x * 0.5, uv.y), g2x = gx * vec2(0.5, 1.0), g2y = gy * vec2(0.5, 1.0);
  vec4 m = textureGrad(uFM, mu, g2x, g2y);
  vec4 x = textureGrad(uFM, mu + vec2(0.5, 0.0), g2x, g2y);
  o.alb = a.rgb; o.n = vec3(n.xy * 2.0 - 1.0, 0.0); o.n.z = sqrt(max(0.05, 1.0 - dot(o.n.xy, o.n.xy))); o.n = normalize(o.n);
  o.h = mix(KH0, KH1, n.b); o.glass = m.r; o.trim = m.g; o.wall = m.b; o.ao = x.r; o.rough = x.g; o.acc = x.b;
  return o;
}
vec3 kColor(KS s, vec3 wallAlb, vec3 trimC, vec3 accC){
  vec3 c = s.alb;
  c = mix(c, trimC * s.alb * 1.25, s.trim);
  c = mix(c, accC * s.alb * 1.25, s.acc);
  c = mix(c, wallAlb * min(s.alb * 2.0, vec3(1.25)), s.wall);
  return c;
}

mat3 cotFrame(vec3 N, vec3 dp1, vec3 dp2, vec2 duv1, vec2 duv2){
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * invmax, B * invmax, N);
}
`;

// ---------------------------------------------------------------- fragment body (inserted after color_fragment)
const FRAG_MAIN = /* glsl */`
float fMode = mod(vK, 32.0);
float fLayer = mod(floor(vK / 32.0), 64.0);
float fFlags = floor(vK / 2048.0);
vec2 dUx = dFdx(vUv4.xy), dUy = dFdy(vUv4.xy);
vec3 dPx = dFdx(vWPos), dPy = dFdy(vWPos);
vec2 pix = abs(dUx) + abs(dUy);         // footprint of vUv4.xy per pixel
float fRough = 0.85, fMetal = 0.0, fAO = 1.0, fSun = 1.0, fNrmAmt = 0.0, fSpecOcc = 1.0; float fGlassK = 0.0; float fNrmK = 1.0;
vec3 fEmis = vec3(0.0);
vec3 fKN = vec3(0.0, 0.0, 1.0); float fKNAmt = 0.0;
vec3 Nw = normalize(vWNrm);
vec3 Tw = normalize(vec3(Nw.z, 0.0, -Nw.x) + vec3(1e-5, 0.0, 0.0));
vec3 Vd = normalize(vWPos - cameraPosition);        // view ray (world)
vec3 rdT = vec3(dot(Vd, Tw), Vd.y, -dot(Vd, Nw));   // tangent: x along facade, y up, z into the building
vec3 sunW = vec3(0.0, 1.0, 0.0);
#if NUM_DIR_LIGHTS > 0
  sunW = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
#endif
vec3 sunT = vec3(dot(sunW, Tw), sunW.y, dot(sunW, Nw)); // z out of the wall
float cosV = clamp(-dot(Vd, Nw), 0.0, 1.0);
float fres = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);

bool isProc = fMode < 3.5;
bool isCurtain = fMode > 8.5 && fMode < 9.5;
bool isSurf = fMode > 4.5 && fMode < 5.5;
bool isGlass = fMode > 6.5 && fMode < 7.5;
bool isLight = fMode > 7.5 && fMode < 8.5;
bool isKit = fMode > 9.5 && fMode < 10.5;

vec4 P0 = vec4(3.0, 3.0, 10.0, 0.5), P1 = vec4(0.25, 0.3, 0.75, 0.85), P2 = vec4(0.0), P3 = vec4(0.8, 0.8, 0.8, 0.3), P4 = vec4(0.9), P5 = vec4(0.5), P6 = vec4(0.0), P7 = vec4(0.05, 0.06, 0.07, 0.0), P8 = vec4(3.0, 3.0, 0.0, 0.2), P9 = vec4(0.0);
if (vId >= 0.0 && (isProc || isCurtain || isGlass || isKit || (isSurf && fFlags > 0.5))) {
  P0 = bp(0); P1 = bp(1); P2 = bp(2); P3 = bp(3); P4 = bp(4); P5 = bp(5); P6 = bp(6); P7 = bp(7); P8 = bp(8); P9 = bp(9);
}
// v2 plan code in P9.w (v2plan.js writeParams): odd = v2 | 2 * decor | 32 * (MID kit window + 1) | 512 * (kit door + 1);
// v1 plans keep the kit unit overrides in P9.xy
bool v2p = mod(P9.w, 2.0) > 0.5;
float decor = v2p ? mod(floor(P9.w / 2.0), 16.0) : 0.0;
bool dMural = mod(decor, 2.0) > 0.5, dPeel = mod(floor(decor / 2.0), 2.0) > 0.5, dRust = mod(floor(decor / 4.0), 2.0) > 0.5, dVivid = decor > 7.5;
float kWinO = v2p ? mod(floor(P9.w / 32.0), 16.0) : P9.x, kDoorO = v2p ? floor(P9.w / 512.0) : P9.y;
#ifdef HB_NOV4
dMural = false; dPeel = false; dRust = false; dVivid = false;
#endif
if (vId >= 0.0 && (isProc || isCurtain || isGlass || isKit || (isSurf && fFlags > 0.5))) {
  // (vivid: the pastel Sunset / Marina stucco and some painted ladies keep more of their paint)
  float mk = hbMuteK(P2.x); if (dVivid) mk = max(mk, 0.82);
  P3.rgb = hbMute(P3.rgb, mk); P5.rgb = hbMute(P5.rgb, mk + 0.1); P4.rgb = hbMute(P4.rgb, mk + 0.2);
}
float layerIdx = (isProc || isCurtain || isKit) ? P2.x : fLayer;
float tsc = (isProc || isCurtain) ? uInvTile[int(layerIdx)] : 1.0;
vec4 texA = textureGrad(uAlb, vec3(vUv4.xy * tsc, layerIdx), dUx * tsc, dUy * tsc);
vec4 texN = textureGrad(uNrm, vec3(vUv4.xy * tsc, layerIdx), dUx * tsc, dUy * tsc);
vec3 albedo = srgbDec(texA.rgb);
// darker, dirtier mortar joints on brick (the photo AO marks the joints)
if (layerIdx < 1.5 || (layerIdx > 21.5 && layerIdx < 22.5)) albedo *= mix(0.6, 1.0, smoothstep(0.3, 0.85, texN.b));
vec3 wallNT = vec3(texN.xy * 2.0 - 1.0, 0.0); wallNT.z = sqrt(max(0.0, 1.0 - dot(wallNT.xy, wallNT.xy)));

// facade coordinates for grime (u along facade, v above y0)
vec2 fc = vec2(-1e4);
float cwF = P8.x, nbF = P8.y;
if (isProc || isCurtain) { fc = vUv4.xy; cwF = vUv4.z; nbF = vUv4.w; }
else if ((isSurf && fFlags > 0.5) || isKit) fc = vUv4.zw;

if (isSurf) {
  diffuseColor.rgb = albedo * hbMute(vC.rgb, hbMuteK(fLayer));
  float mk = texN.a;
  if (fLayer > 13.5 && fLayer < 14.5) diffuseColor.rgb = mix(vec3(0.85, 0.84, 0.8) * albedo, diffuseColor.rgb, mk); // awning stripes
  fRough = texA.a; fMetal = uMetal[int(fLayer)];
  fAO = vC.a * mix(1.0, texN.b, 0.85);
  // flat roofs seen from above: re-roofed patches / ponding stains per building (faded out where sub-pixel)
  if (fLayer > 7.5 && fLayer < 8.5 && Nw.y > 0.85) {
    float fwR = length(fwidth(vWPos.xz)), kR = 1.0 - smoothstep(2.0, 6.0, fwR);
    vec2 rp = vWPos.xz + fract(vId * 0.0137) * 97.0;
    float pn = vn2(rp * 0.21), pn2 = vn2(rp * 0.9 + 7.0);
    diffuseColor.rgb *= mix(1.0, 0.8 + 0.3 * pn + 0.1 * (pn2 - 0.5), kR);
    fRough = mix(fRough, fRough * (0.85 + 0.3 * pn2), kR);
  }
  fNrmAmt = mod(fFlags, 4.0) > 1.5 ? 0.0 : 1.0;
  if (mod(fFlags, 2.0) > 0.5) fNrmK = (fLayer > 5.5 && fLayer < 6.5) ? 0.6 : 1.7;   // (the concrete photo reads as rubble when boosted)     // street walls (v3 NEAR): stronger stucco / siding / brick relief
  if (fLayer > 11.5 && fLayer < 12.5 && mk > 0.5) { // door glass light
    fEmis = vec3(1.0, 0.75, 0.45) * uNight * 0.8 * step(0.5, fh1(vId * 3.1));
  }
} else if (isLight) {
  diffuseColor.rgb = vC.rgb * 0.3;
  float blink = vC.a < 0.5 ? 1.0 : step(0.5, fract(uTime * 0.6 + vId * 0.37));
  fEmis = vC.rgb * (0.25 + 4.0 * uNight) * blink;
  fRough = 0.3;
} else if (isKit) {
  // near-LOD baked-kit surfaces: vG.xy = unit coords (m), vG.z = unit, vG.w = 0 relief quad (parallax), 1 flat front, 2 flat side
  int ku = int(vG.z + 0.5);
  vec2 pu = vG.xy;
  vec3 wallAlb = albedo * P3.rgb;
  vec2 gx = dFdx(pu) * uKM, gy = dFdy(pu) * uKM;
  float lodK = log2(max(max(length(gx), length(gy)) * 4096.0, 1e-4));
  float hh = 0.0;
  bool relief = vG.w < 0.5;
  if (relief) {
    float steps = floor(clamp(16.0 - lodK * 5.0, 0.0, 16.0));
    if (steps >= 2.0) pu = kPom(ku, pu, rdT, steps, max(lodK, 0.0), uKS[ku].z + 0.03, hh);
  }
  KS ks = kFetch(ku, pu, gx, gy);
  float inOpen = relief ? step(ks.h, -0.03) : 0.0;   // the real reveal / glass geometry sits behind the opening
  diffuseColor.rgb = mix(kColor(ks, wallAlb, P4.rgb, P5.rgb), wallAlb * 0.4, inOpen);
  fRough = mix(ks.rough, texA.a, ks.wall);
  fAO = ks.ao * mix(1.0, texN.b, ks.wall * 0.6) * vC.a;
  fKN = normalize(mix(ks.n, wallNT, ks.wall));
  fKNAmt = vG.w > 1.5 ? 0.0 : 1.0;
  if (relief && lodK < 3.0) fSun = kShadow(ku, pu, ks.h, sunT, max(lodK, 0.0));
  fGlassK = ks.glass * (1.0 - inOpen);
} else if (isGlass) {
  // near glass: vUv4.xy = point on glass (cell coords), vUv4.zw = cell size, vG = window rect, aC = (seed, itype, bars, recess)
  vec2 p = vUv4.xy; vec2 cs = vUv4.zw; vec4 win = vG;
  float gci = floor(vC.r * 255.0 + 0.5), grow = floor(vC.g * 255.0 + 0.5), gb8 = floor(vC.b * 255.0 + 0.5), rec = vC.a;
  float itype = floor(gb8 / 16.0), bars = mod(gb8, 16.0);
  float seed = fh2(vec2(gci + P2.w * 131.0, grow + P2.w * 71.0));
  float lit = step(fh1(seed * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
  if (itype > 0.5 && itype < 1.5) lit = step(fh1(grow * 7.31 + P2.w * 13.7), 0.55 - 0.15 * uNight) * step(seed, 0.72);
  if ((itype > 1.5 && itype < 3.5) || (itype > 4.5 && itype < 5.5)) lit = step(0.15, seed);
  if (itype > 2.5 && itype < 3.5) lit = 1.0;
  gRoomLod = clamp(log2(max(pix.x, pix.y) / max(cs.x, 0.5) * 512.0 + 1e-4), 0.0, 8.0);
  vec3 rad = room(p, cs, rdT, win, seed, itype, lit, 0.0);
  // sash bars in front of the room
  float bw = 0.035; vec2 aa = pix * 0.75 + 0.002;
  float bar = 0.0;
  if (bars > 0.5) {
    float mid = (win.y + win.w) * 0.5;
    bar = max(bar, bandAA(p.y, mid - bw, mid + bw, aa.y));
    if (bars > 1.5 && bars < 2.5 && p.y > mid) { bar = max(bar, bandAA(fract((p.x - win.x) / (win.z - win.x) * 2.0), 0.5 - bw / (win.z - win.x), 0.5 + bw / (win.z - win.x), aa.x)); }
    if (bars > 2.5 && bars < 3.5) { float tb = win.w - (win.w - win.y) * 0.22; bar = max(bandAA(p.y, tb - bw, tb + bw, aa.y), 0.0); }
    if (bars > 3.5 && bars < 4.5) { float mx = (win.x + win.z) * 0.5; bar = max(bar, bandAA(p.x, mx - bw, mx + bw, aa.x)); }
    if (bars > 4.5) { vec2 g = vec2((p.x - win.x) / (win.z - win.x) * 4.0, (p.y - win.y) / (win.w - win.y) * 3.0); vec2 fg = abs(fract(g) - 0.5); bar = max(bar, 1.0 - smoothstep(0.44, 0.47, max(fg.x, fg.y) * 1.0)); }
  }
  vec3 frameC = P4.rgb * 0.9; float frameR = 0.5, kAO = 1.0;
  int kg = int(fLayer + 0.5) - 1;
  if (kg >= 0 && uFOn > 0.5) {   // baked sashes / muntins / door leaves over the glass
    vec2 pu = kMap(p, win, uKO[kg], uKS[kg].xy, vec4(-20.0, -20.0, 20.0, 20.0));
    KS ks = kFetch(kg, pu, dFdx(pu) * uKM, dFdy(pu) * uKM);
    bar = 1.0 - ks.glass; frameC = kColor(ks, P3.rgb * 0.5, P4.rgb, P5.rgb); frameR = ks.rough; kAO = ks.ao;
    fKN = ks.n; fKNAmt = bar;
  }
  // analytic recess shadow: trace to the sun and test the exit through the wall opening
  float sv = 1.0;
  if (sunT.z > 0.02) { vec2 ex = p + sunT.xy / sunT.z * rec; sv = boxAA(ex, win.xy, win.zw, vec2(0.03)); }
  else sv = 0.0;
  fSun = mix(sv, 1.0, bar * 0.6);
  vec3 tint = P7.rgb;
  vec3 f0 = mix(vec3(0.075), tint * 1.4 + 0.02, P7.w);
  diffuseColor.rgb = mix(f0, frameC, bar);
  fRough = mix(0.035 + 0.05 * fh1(seed * 3.0), frameR, bar); fMetal = mix(1.0, 0.0, bar);
  fEmis = rad * (1.0 - fres) * (1.0 - bar) * 0.9;
  fGlassK = 1.0 - bar;
  fAO = mix(1.0, 0.7, smoothstep(0.35, 0.0, win.w - p.y) * 0.5) * kAO;
  float hgt = vWPos.y - P6.x;
  fSpecOcc = mix(0.3, 1.0, smoothstep(1.5, 22.0, hgt)) * mix(1.0, 0.55, smoothstep(0.0, -0.6, Vd.y));
} else if (isProc || isCurtain) {
  // ---------------------------------------------------------- procedural facade (far LOD, and near tower upper floors)
  float u = vUv4.x, v = vUv4.y, cw = max(vUv4.z, 0.5), nb = vUv4.w;
  float floorH = P0.x, groundH = P0.y, topH = P0.z, margin = P0.w;
  bool facet = nb < 0.0; if (facet) { nb = 1.0; margin = 0.0; }
  float winType = P2.y, groundType = mod(P2.z, 8.0), gCell = floor(P2.z / 8.0), bseed = P2.w;
  bool curt = isCurtain && v >= groundH;
  vec3 wallC = P3.rgb, trimC = P4.rgb, accC = P5.rgb;
  float itypeB = P4.w, recess = P5.w, corniceH = P6.w;
  float gA = P6.y, gB = P6.z;
  bool front = fMode < 0.5 || isCurtain, side = fMode > 0.5 && fMode < 1.5, back = fMode > 1.5 && fMode < 2.5;
  float gLine = front ? gA + gB * u : -2.0;
  vec3 wallAlb = albedo * wallC;
  diffuseColor.rgb = wallAlb; fRough = texA.a; fMetal = 0.0;
  fAO = mix(1.0, texN.b, 0.6);
  float nF = max(0.0, floor((topH - corniceH - groundH) / floorH + 0.05));
  float cu = (u - margin) / cw; float ci = floor(cu); float fx = cu - ci;
  bool inCols = ci >= 0.0 && ci < nb;
  float rowI, fy, cellH, vb;
  if (v < groundH) { rowI = 0.0; vb = 0.0; cellH = groundH; } else { rowI = 1.0 + floor((v - groundH) / floorH); vb = groundH + (rowI - 1.0) * floorH; cellH = floorH; }
  float cy = v - vb;           // metres above the cell floor
  float cx = fx * cw;          // metres from the cell's left edge
  float fpx = max(pix.x, pix.y);
  float fade = smoothstep(0.06, 0.2, fpx / min(cw, floorH));   // anti-moire: whole cell under ~6 px
  fKN = wallNT; fKNAmt = 1.0 - fade;
  vec2 aa = vec2(pix.x, pix.y) * 0.8 + 0.004;
  float cellSeed = fh2(vec2(ci + bseed * 131.0, rowI + bseed * 71.0));
  // window rect (cell coords, metres)
  vec4 wr = vec4(P1.x * cw, P1.y * floorH, P1.z * cw, P1.w * floorH);
  float glass = 0.0, frame = 0.0, sill = 0.0, hood = 0.0, door = 0.0, garageM = 0.0, signM = 0.0, rollM = 0.0;
  bool hasWin = inCols && rowI <= nF && v < topH - corniceH;
  float itype = itypeB;
  float bars = winType < 0.5 ? 1.0 : winType < 1.5 ? 1.0 : winType < 2.5 ? 0.0 : winType < 3.5 ? 5.0 : 0.0;
  bool arched = winType > 0.5 && winType < 1.5;
  if (curt) {
    // curtain wall: spandrel band at each floor line, vision glass above, thin mullions
    wr = vec4(0.0, 0.95, cw, floorH - 0.05); bars = 0.0; itype = 1.0;
  }
  if (facet) { wr.x = 0.14 * cw; wr.z = 0.86 * cw; }
  if (winType > 3.5 && winType < 4.5 && front && abs(ci - gCell) < 0.5 && rowI > 0.5) { wr.x = 0.1 * cw; wr.z = 0.9 * cw; }
  bool muralW = dMural && !front && !facet;   // exposed side / back walls (v2 draws them as BACK / SIDEX)
  if (muralW) hasWin = false;
  if (side) { hasWin = hasWin && cellSeed < 0.28; wr.xz = mix(wr.xz, vec2(wr.x + wr.z) * 0.5, 0.25); }
  if (back) { hasWin = hasWin && cellSeed < 0.75; }
  int kG = -1; vec4 kGR = vec4(0.0);
  float washK = 0.0, lampK = 0.0;   // house entry light: steady porch lamp + warm wash on the wall around the door
  if (rowI < 0.5 && front && inCols) {
    float gl = max(gLine - vb, 0.0);
    if (groundType < 0.5) { wr = vec4(P1.x * cw, max(0.9, gl + 0.8), P1.z * cw, min(groundH - 0.4, max(0.9, gl + 0.8) + (P1.w - P1.y) * floorH)); }
    else if (groundType < 1.5) { // storefront
      bool isDoor = fh1(ci * 7.1 + bseed * 33.0) < 0.3;
      wr = vec4(0.07 * cw, isDoor ? gl + 0.02 : gl + 0.5, 0.93 * cw, groundH - 1.05);
      itype = fh1(ci + bseed * 9.0) < 0.35 ? 5.0 : 2.0; bars = 3.0;
      kG = isDoor ? 11 : 10; kGR = vec4(0.07 * cw, gl + 0.02, 0.93 * cw, groundH - 1.05);
      signM = bandAA(cy, groundH - 0.95, groundH - 0.35, aa.y) * bandAA(cx, 0.02 * cw, 0.98 * cw, aa.x);
    } else if (groundType < 2.5) { // houses: garage + entry
      if (abs(ci - gCell) < 0.5) { garageM = boxAA(vec2(cx, cy), vec2(0.1 * cw, gl), vec2(0.9 * cw, min(gl + 2.3, groundH - 0.3)), aa); hasWin = false; kG = 9; kGR = vec4(0.1 * cw, gl, 0.9 * cw, min(gl + 2.3, groundH - 0.3)); }
      else {
        if (uNight > 0.01 && fh1(ci * 3.7 + bseed * 17.0) < 0.72) {
          vec2 lq = (vec2(cx, cy) - vec2(0.5 * cw + 0.8, gl + 2.3)) * vec2(1.0, 1.3);
          float dl = length(lq);
          lampK = (1.0 - smoothstep(0.06, 0.1, dl)) * uNight; washK = exp(-dl * dl * 1.6) * uNight * step(-2.4, cy - gl - 2.3);
        }
        kG = kDoorO > 0.5 ? int(kDoorO + 0.5) - 1 : 8; kGR = vec4(0.5 * cw - 0.53, gl, 0.5 * cw + 0.53, min(gl + uKO[kG].w - uKO[kG].y, groundH - 0.25)); door = boxAA(vec2(cx, cy), vec2(0.5 * cw - 0.5, gl), vec2(0.5 * cw + 0.5, gl + 2.2), aa); wr = vec4(0.25 * cw, gl + 2.5, 0.75 * cw, groundH - 0.3); hasWin = hasWin && wr.w - wr.y > 0.5; }
    } else if (groundType < 3.5) { // lobby
      wr = vec4(0.05 * cw, gl + 0.05, 0.95 * cw, groundH - 0.5); itype = 3.0; bars = 3.0;
      kG = 10; kGR = vec4(0.05 * cw, gl + 0.02, 0.95 * cw, groundH - 0.5);
    } else if (groundType < 4.5) { // roll-up doors
      rollM = boxAA(vec2(cx, cy), vec2(0.1 * cw, gl), vec2(0.9 * cw, min(gl + 3.6, groundH - 0.6)), aa); hasWin = false;
    } else { wr = vec4(0.3 * cw, groundH - 1.2, 0.7 * cw, groundH - 0.4); }
  }
  if (!front && rowI < 0.5) { wr.y = max(wr.y, 0.9); }
  vec3 radE = vec3(0.0);
  float sv = 1.0;
  // ---------------------------------------------------------- baked kit (Blender atlas): windows, doors, garages, shopfronts
  bool kitOn = uFOn > 0.5 && !curt && !facet && fade < 0.97;
  int kU = -1; vec4 kR = wr;
  if (kitOn) {
    if (kG >= 0) { kU = kG; kR = kGR; garageM = 0.0; door = 0.0; hasWin = kG >= 10; if (kG >= 10) wr = kGR; }
    else if (hasWin) kU = kWinO > 0.5 ? int(kWinO + 0.5) - 1 : (winType < 0.5 ? 1 : winType < 1.5 ? 2 : winType < 2.5 ? 5 : winType < 3.5 ? 6 : 4);
  }
  if (kU >= 0) {
    vec4 KO = uKO[kU], KZ = uKS[kU];
    vec2 q = vec2(cx, cy);
    vec2 pu = kMap(q, kR, KO, KZ.xy, vec4(0.0, 0.0, cw, cellH));
    if (pu.x >= 0.0 && pu.y >= 0.0 && pu.x <= KZ.x && pu.y <= KZ.y) {
      vec2 gx = dFdx(pu) * uKM, gy = dFdy(pu) * uKM;
      float lodK = log2(max(max(length(gx), length(gy)) * 4096.0, 1e-4));
      float steps = floor(clamp(14.0 - lodK * 4.0, 0.0, 14.0));
      float hh = 0.0; vec2 ph = pu;
      if (steps >= 2.0) ph = kPom(kU, pu, rdT, steps, max(lodK, 0.0), KZ.z + 0.03, hh);
      KS ks = kFetch(kU, ph, gx, gy);
      float kw = 1.0 - fade;
      float g = ks.glass;
      if (g > 0.01) {
        vec2 pg = q + rdT.xy / max(rdT.z, 0.05) * max(-ks.h, 0.0);
        float lit = step(fh1(cellSeed * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
        if (itype > 0.5 && itype < 1.5) lit = step(fh1(rowI * 7.31 + bseed * 13.7), 0.55 - 0.15 * uNight) * step(cellSeed, 0.72);
        if ((itype > 1.5 && itype < 3.5) || (itype > 4.5 && itype < 5.5)) lit = step(0.15, cellSeed);
        gRoomLod = clamp(log2(max(pix.x, pix.y) / max(cw, 0.5) * 512.0 + 1e-4), 0.0, 8.0);
        vec3 rad = room(pg, vec2(cw, cellH), rdT, kR, cellSeed, itype, lit, fade);
        if (sunT.z > 0.02) { vec2 ex = pg + sunT.xy / sunT.z * max(-ks.h, 0.0); sv = boxAA(ex, kR.xy, kR.zw, vec2(0.04)); } else sv = 0.0;
        radE = rad * (1.0 - fres) * g * 0.95;
      }
      vec3 glassC = mix(vec3(0.075), P7.rgb * 1.4 + 0.02, P7.w);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(kColor(ks, wallAlb, trimC, accC), glassC, g), kw);
      fRough = mix(fRough, mix(mix(ks.rough, fRough, ks.wall), 0.05, g), kw);
      fMetal = mix(fMetal, g, kw);
      fGlassK = g * kw;
      fAO *= mix(1.0, ks.ao, kw);
      fKN = normalize(mix(ks.n, wallNT, ks.wall)); fKNAmt = kw * (1.0 - g);
      float ksh = (lodK < 2.5 && g < 0.99) ? kShadow(kU, ph, ks.h, sunT, max(lodK, 0.0)) : 1.0;
      fSun = mix(ksh, sv, g);
      fSpecOcc = mix(1.0, mix(0.3, 1.0, smoothstep(1.5, 22.0, v)), g);
      glass = g;
    }
  } else if (hasWin) {
    vec2 q = vec2(cx, cy);
    float aw = wr.z - wr.x, r = aw * 0.5;
    // frame, sill, hood
    float fwid = curt ? 0.0 : 0.09;
    vec4 fr = vec4(wr.xy - fwid, wr.zw + fwid);
    float inWin = boxAA(q, wr.xy, wr.zw, aa);
    if (arched) { float ay = wr.w - r; if (cy > ay) inWin = (1.0 - smoothstep(r - aa.x, r + aa.x, length(q - vec2(wr.x + r, ay)))) * step(q.x, wr.z) * step(wr.x, q.x); }
    float inFr = boxAA(q, fr.xy, fr.zw, aa);
    if (arched) { float ay = wr.w - r; if (cy > ay) inFr = 1.0 - smoothstep(r + fwid - aa.x, r + fwid + aa.x, length(q - vec2(wr.x + r, ay))); }
    frame = max(inFr - inWin, 0.0);
    if (!curt) {
      sill = boxAA(q, vec2(wr.x - 0.14, wr.y - 0.1), vec2(wr.z + 0.14, wr.y - fwid * 0.2), aa);
      hood = arched ? 0.0 : boxAA(q, vec2(wr.x - 0.12, wr.w + fwid), vec2(wr.z + 0.12, wr.w + fwid + 0.14), aa) * step(0.5, P8.w);
    }
    // parallax recess: where does the ray reach the glass plane?
    float rd = curt ? 0.04 : recess;
    vec2 pg = q + rdT.xy / max(rdT.z, 0.05) * rd;
    float onGlass = boxAA(pg, wr.xy, wr.zw, aa * 1.5);
    if (arched) { float ay = wr.w - r; if (pg.y > ay) onGlass = 1.0 - smoothstep(r - 0.02, r + 0.02, length(pg - vec2(wr.x + r, ay))); }
    onGlass = mix(onGlass, 1.0, fade);
    glass = inWin;
    // room behind
    float lit = step(fh1(cellSeed * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
    if (itype > 0.5 && itype < 1.5) lit = step(fh1(rowI * 7.31 + bseed * 13.7), 0.55 - 0.15 * uNight) * step(cellSeed, 0.72);
    if ((itype > 1.5 && itype < 3.5) || (itype > 4.5 && itype < 5.5)) lit = step(0.15, cellSeed);
    vec4 winC = vec4(wr.xy, wr.zw);
    gRoomLod = clamp(log2(max(pix.x, pix.y) / max(cw, 0.5) * 512.0 + 1e-4), 0.0, 8.0);
    vec3 rad = room(pg, vec2(cw, cellH), rdT, winC, cellSeed, itype, lit, fade);
    // sash bars
    float bar = 0.0; float bw = 0.035;
    if (fade < 0.99) {
      float mid = (wr.y + wr.w) * 0.5;
      if (bars > 0.5 && bars < 1.5) bar = bandAA(pg.y, mid - bw, mid + bw, aa.y);
      if (bars > 2.5 && bars < 3.5) { float tb = wr.w - (wr.w - wr.y) * 0.22; bar = bandAA(pg.y, tb - bw, tb + bw, aa.y); }
      if (bars > 4.5) { vec2 g = vec2((pg.x - wr.x) / aw * 4.0, (pg.y - wr.y) / (wr.w - wr.y) * 3.0); vec2 fg = abs(fract(g) - 0.5); bar = 1.0 - smoothstep(0.44, 0.47, max(fg.x, fg.y)); }
      if (curt) { bar = max(bandAA(cx, -0.05, 0.05, aa.x), bandAA(cx, cw - 0.05, cw + 0.05, aa.x)); }
      bar *= 1.0 - fade;
    }
    // recess sun shadow
    if (sunT.z > 0.02) { vec2 ex = pg + sunT.xy / sunT.z * rd; sv = boxAA(ex, wr.xy, wr.zw, vec2(0.04)); } else sv = 0.0;
    float reveal = (1.0 - onGlass) * inWin;
    vec3 glassC = mix(mix(vec3(0.075), P7.rgb * 1.4 + 0.02, P7.w), trimC * 0.85, bar);
    vec3 revealC = wallAlb * 0.55;
    diffuseColor.rgb = mix(diffuseColor.rgb, trimC * albedo.g * 1.1, frame);
    diffuseColor.rgb = mix(diffuseColor.rgb, trimC * 1.05, max(sill, hood));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(glassC, revealC, reveal), glass);
    fRough = mix(fRough, mix(mix(0.06, 0.5, bar), 0.85, reveal), glass);
    fMetal = mix(0.0, mix(1.0, 0.0, max(bar, reveal)), glass);
    fGlassK = glass * (1.0 - max(bar, reveal));
    radE = rad * (1.0 - fres) * (1.0 - bar) * (1.0 - reveal) * glass * 0.95;
    fAO *= 1.0 - 0.35 * reveal;
    fSun = mix(1.0, mix(sv, 1.0, bar), glass * (1.0 - reveal));
    fSpecOcc = mix(1.0, mix(0.3, 1.0, smoothstep(1.5, 22.0, v)), glass);
    // shadow under the sill onto the wall
    fAO *= 1.0 - 0.3 * bandAA(cy, wr.y - 0.3, wr.y - 0.1, aa.y) * bandAA(cx, wr.x - 0.1, wr.z + 0.1, aa.x);
  }
  if (garageM > 0.0) {
    vec2 gq = vec2((cx - 0.1 * cw) / (0.8 * cw), (cy - gLine + vb) / 2.3);
    vec4 ga = textureGrad(uAlb, vec3(gq, 11.0), dUx / (0.8 * cw), dUy / 2.3);
    diffuseColor.rgb = mix(diffuseColor.rgb, srgbDec(ga.rgb) * mix(trimC, accC, 0.3), garageM);
    fAO *= 1.0 - 0.2 * garageM;
  }
  if (door > 0.0) { diffuseColor.rgb = mix(diffuseColor.rgb, accC * 0.6, door); fAO *= 1.0 - 0.25 * door; }
  if (rollM > 0.0) {
    vec4 ra = textureGrad(uAlb, vec3(vec2(cx, cy) * 0.5, 18.0), dUx * 0.5, dUy * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, srgbDec(ra.rgb) * vec3(0.75, 0.76, 0.78), rollM); fRough = mix(fRough, 0.45, rollM); fMetal = mix(fMetal, 0.4, rollM);
  }
  if (signM > 0.0) {
    diffuseColor.rgb = mix(diffuseColor.rgb, accC, signM);
    radE += accC * signM * uNight * 1.2 * step(0.3, fh1(ci + bseed * 5.0));
  }
  // mural on an exposed side wall (Mission / SoMa): the painted area leaves a margin at the ends / foot / cornice
  if (muralW) {
    float wl = 2.0 * margin + max(nb, 1.0) * cw;
    vec2 m0 = vec2(0.45, 0.35), m1 = vec2(wl - 0.45, min(topH - corniceH - 0.35, 12.0));
    vec2 q = (vec2(u, v) - m0) / max(m1 - m0, vec2(0.1));
    if (m1.x - m0.x > 4.0 && m1.y - m0.y > 2.4 && q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      float asp = (m1.x - m0.x) / (m1.y - m0.y);
      vec3 mc = srgbDec(hbMural(q, asp, fract(bseed * 5.77 + 0.13), max(pix.y / (m1.y - m0.y), 0.002) * 1.5));
      float lmA = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb, mc * (0.62 + 0.5 * lmA), 0.95);
      fRough = 0.9; fMetal = 0.0; fGlassK = 0.0;
    }
  }
  // cornice band + its shadow
  float cb = smoothstep(topH - corniceH - aa.y, topH - corniceH + aa.y, v);
  if (kitOn && cb > 0.0 && corniceH > 0.45) {
    vec2 pu = vec2(u, (v - (topH - corniceH)) / corniceH * 1.33);
    KS ks = kFetch(13, pu, dFdx(pu) * uKM, dFdy(pu) * uKM);
    diffuseColor.rgb = mix(diffuseColor.rgb, kColor(ks, wallAlb, trimC, accC), cb);
    fKN = normalize(mix(fKN, ks.n, cb)); fAO *= mix(1.0, ks.ao, cb); fRough = mix(fRough, ks.rough, cb);
  } else diffuseColor.rgb = mix(diffuseColor.rgb, trimC * albedo.g * 1.1, cb * (front ? 1.0 : 0.5));
  fAO *= 1.0 - 0.35 * bandAA(v, topH - corniceH - 0.6, topH - corniceH, aa.y) * (1.0 - cb);
  // spandrels for curtain walls
  if (curt) {
    float sp = 1.0 - bandAA(cy, 0.95, floorH - 0.05, aa.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, wallC * 0.9, sp * (1.0 - glass));
    fMetal = mix(fMetal, 0.5, sp * (1.0 - glass)); fRough = mix(fRough, 0.35, sp * (1.0 - glass));
  }
  // anti-moire: tiny on screen, the facade becomes an analytically box-filtered window grid (columns x rows, the
  // ground-floor glass / garage band, the cornice cap): stable from ~150 m to 3 km (no per-cell sampling, no sparkle);
  // night windows glow at the building's expected lit share instead of per-cell coin flips
  if (fade > 0.0 && !curt) {
    vec2 fw = pix * 1.25 + 1e-3;
    float nbE = facet ? 1.0 : nb, uEnd = margin + nbE * cw;
    float colC = pulseAA(u - margin, P1.x * cw, P1.z * cw, cw, fw.x) * bandF(u, margin, uEnd, fw.x);
    float rowC = pulseAA(v - groundH, P1.y * floorH, P1.w * floorH, floorH, fw.y) * bandF(v, groundH, min(groundH + nF * floorH, topH - corniceH), fw.y);
    float glU = colC * rowC * (muralW ? 0.0 : side ? 0.28 : back ? 0.75 : 1.0), glG = 0.0;
    float inU = bandF(u, margin, uEnd, fw.x), gD = 0.0;
    if (front) {
      if (groundType > 0.5 && groundType < 1.5) glG = 0.86 * bandF(v, gLine + 0.5, groundH - 1.05, fw.y) * inU;
      else if (groundType > 2.5 && groundType < 3.5) glG = 0.9 * bandF(v, gLine + 0.05, groundH - 0.5, fw.y) * inU;
      else if (groundType > 1.5 && groundType < 2.5) gD = 0.4 * bandF(v, gLine, gLine + 2.3, fw.y) * inU;
      else if (groundType > 3.5 && groundType < 4.5) gD = 0.55 * bandF(v, gLine, gLine + 3.6, fw.y) * inU;
    }
    float gl = clamp(glU + glG, 0.0, 1.0);
    float capC = bandF(v, topH - corniceH, topH + 3.0, fw.y);
    vec3 farC = mix(muralW ? diffuseColor.rgb : wallAlb * (1.0 - gD), trimC * albedo.g * 1.1, capC * (front ? 1.0 : 0.5));
    farC = mix(farC, mix(vec3(0.075), P7.rgb * 1.4 + 0.02, P7.w), gl);
    diffuseColor.rgb = mix(diffuseColor.rgb, farC, fade);
    fMetal = mix(fMetal, gl, fade); fRough = mix(fRough, mix(texA.a, 0.12, gl), fade); fGlassK = mix(fGlassK, gl, fade);
    // lit rooms: this cell's own coin flip while cells still cover a few pixels, the expected share once sub-pixel
    // (x1.3 there: the bloom no longer picks out single windows)
    bool offF = itypeB > 0.5 && itypeB < 1.5;
    // (office towers: a sub-pixel average of their lit share read as uniformly glowing pale blocks: 0.2 at night)
    float litF = offF ? (0.55 - 0.15 * uNight) * 0.72 * (1.0 - 0.3 * uNight) : 1.3 * clamp(P3.w * (0.55 + 0.45 * uNight), 0.0, 1.0);
    float litC = offF ? step(fh1(rowI * 7.31 + bseed * 13.7), 0.55 - 0.15 * uNight) * step(cellSeed, 0.72) : step(fh1(cellSeed * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
    float sub = smoothstep(0.3, 0.75, fpx / min(cw, floorH));
    float litE = mix(litC, litF, sub);
    vec3 lampF = offF ? vec3(0.95, 0.97, 1.0) : mix(vec3(1.0, 0.74, 0.46), vec3(1.0, 0.88, 0.7), fh1(bseed * 7.0));
    vec3 radF = 0.45 * (vec3(0.14 * (1.0 - uNight)) * gl + 1.3 * uNight * (glU * litE * lampF * (offF ? 1.0 : 1.5) + glG * 0.85 * vec3(1.0, 0.9, 0.78))) * (1.0 - fres) * 0.95;
    radE = mix(radE, radF, fade);
  } else if (fade > 0.0 && v >= groundH) {   // curtain wall far away: office floors at the expected lit share
    float gl = pulseAA(v - groundH, 0.95, floorH - 0.05, floorH, pix.y * 1.25 + 1e-3);
    float sub = smoothstep(0.3, 0.75, fpx / min(cw, floorH));
    float litF = mix(step(fh1(rowI * 7.31 + bseed * 13.7), 0.55 - 0.15 * uNight) * step(cellSeed, 0.72), (0.55 - 0.15 * uNight) * 0.72 * (1.0 - 0.3 * uNight), sub);
    radE = mix(radE, 0.45 * (vec3(0.14 * (1.0 - uNight)) + litF * 1.3 * vec3(0.95, 0.97, 1.0) * uNight) * gl * (1.0 - fres) * 0.95, fade);
  }
  { float sb = smoothstep(0.3, 0.75, fpx / min(cw, floorH)); washK *= 1.0 - sb; lampK *= 1.0 - sb; }
  // far glass at night: the sky IBL (x2.6 on panes) turned distant towers into pale blocks; a few-pixel pane reflects
  // mostly dark sky and street glow, so the mirror term fades with night there
  if (fade > 0.0) { float nk = 1.0 - 0.8 * uNight * fade; fGlassK *= nk; diffuseColor.rgb *= mix(1.0, nk, fMetal); }   // porch lamps: gone once sub-pixel (they sparkled)
  fEmis = radE + diffuseColor.rgb * vec3(1.0, 0.68, 0.38) * washK * 0.9 + vec3(4.0, 2.6, 1.3) * lampK;
  // (v4) window spill at night: a lit room washes the wall around its window (reveal, sill, a halo on the stucco)
  if (uNight > 0.02 && hasWin && !curt && fade < 0.98) {
    float litS = step(fh1(cellSeed * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
    vec2 qs = vec2(cx, cy), ds = max(max(wr.xy - qs, qs - wr.zw), 0.0);
    float dS = length(ds), halo = step(1e-4, dS) * exp(-dS * 2.6) * (1.0 - 0.6 * step(wr.w, cy));
    fEmis += diffuseColor.rgb * vec3(1.0, 0.72, 0.45) * (litS * halo * uNight * 0.55 * (1.0 - fade));
  }
}
// height above the local ground (m): v3 street walls carry their own ground line (aG = wall length, ground at u = 0,
// ground at the far end, 2 = marker; v3front.js), MID fronts the params ground line, other building surfaces the lot's y0
float hG = 1e3;
if (vId >= 0.0 && !isLight) {
  hG = vWPos.y - P6.x;
  if (fc.x > -1e3) {
    if (isSurf && vG.w > 1.5) hG = fc.y - mix(vG.y, vG.z, clamp(fc.x / max(vG.x, 0.1), 0.0, 1.0));
    else if ((isProc && fMode > 0.5) || isCurtain) hG = fc.y + 0.4;
    else hG = fc.y - (P6.y + P6.z * fc.x);
  }
}
bool v3W = isSurf && vG.w > 1.5 && fc.x > -1e3;
float kWv = 1.0;   // near-detail weight (fades out where the facade coords go sub-pixel)
// ageing: ground grime, rain streaks under windows, large-scale dirt (all walls and surfaces with facade coords)
if (fc.x > -1e3) {
  float gl2 = hG;
  float grime = 1.0 - 0.4 * (1.0 - smoothstep(0.0, 3.0, gl2)) * (0.6 + 0.4 * vn2(fc * vec2(4.0, 1.3)));
  grime *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.5, gl2)) * (0.5 + 0.5 * vn2(fc * vec2(9.0, 3.0)));
  float cu2 = (fc.x - P0.w) / max(cwF, 0.5), ci2 = floor(cu2), cx2 = fract(cu2) * cwF;
  float rowb = fc.y < P0.y ? 0.0 : P0.y + floor((fc.y - P0.y) / P0.x) * P0.x;
  float cy2 = fc.y - rowb;
  float wy0 = (fc.y < P0.y ? 0.9 : P1.y * P0.x);
  float st = 0.0;
  if (ci2 >= 0.0 && ci2 < nbF && cy2 < wy0 && fc.y > P0.y * 0.5) {
    float sx = (cx2 - P1.x * cwF) / max((P1.z - P1.x) * cwF, 0.1);
    float streak = vn1(fc.x * 22.0) * vn1(fc.x * 7.0 + 3.0);
    st = step(0.0, sx) * step(sx, 1.0) * streak * exp(-(wy0 - cy2) * 0.9) * 0.55;
  }
  float dirt = 0.86 + 0.14 * vn2(fc * 0.3 + P2.w * 17.0) * (0.6 + 0.4 * vn2(fc * vec2(1.3, 0.6) + 3.0));
  float below = P0.z - P6.w - fc.y;   // run-off under the cornice / parapet
  float cst = below > 0.0 ? exp(-below * 0.8) * vn1(fc.x * 9.0 + 5.0) * vn1(fc.x * 27.0 + P2.w * 40.0) : 0.0;
  st = max(st, cst * 0.9);
  if (isSurf) fAO *= 1.0 - 0.3 * smoothstep(P0.z - P6.w - 0.9, P0.z - P6.w - 0.05, fc.y) * step(fc.y, P0.z - P6.w);
  float age = max(P8.z, 0.3);
  // v3 weathering (all wall LODs so the NEAR / MID hand-off matches): patchy repaint / moisture blotches, faint rain
  // streaking down the whole wall, sun-faded (lighter, less saturated) upper storeys, a darker splash band at the foot
  float fw = length(fwidth(fc)), kW = 1.0 - smoothstep(1.5, 6.0, fw);
  float blot = vn2(fc * vec2(0.45, 0.32) + P2.w * 23.0) * 0.6 + vn2(fc * vec2(1.7, 1.1) + 7.0) * 0.4;
  float rain = vn2(vec2(fc.x * 2.3 + P2.w * 11.0, fc.y * 0.07)) * vn1(fc.x * 5.3 + 2.0);
  float hgt = gl2;
  float wthr = mix(1.0, (0.86 + 0.2 * blot) * (1.0 - 0.14 * rain * age * smoothstep(0.5, 3.0, hgt)), kW);
  float splash = 1.0 - 0.22 * (1.0 - smoothstep(0.05, 0.45, hgt)) * (0.7 + 0.3 * vn2(fc * vec2(6.0, 2.0)));
  diffuseColor.rgb *= mix(1.0, grime * (1.0 - st * age) * dirt * wthr * splash, fMetal < 0.3 ? 1.0 : 0.5);
  float sunF = 0.16 * age * smoothstep(1.5, 9.0, hgt) * (0.6 + 0.4 * blot) * (fMetal < 0.3 ? 1.0 : 0.0);
  { float lmF = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lmF) * 1.12 + 0.02, sunF); }
  fRough = min(1.0, fRough + st * 0.2 * age + 0.08 * (blot - 0.5) * kW);
  kWv = kW;
  bool paintW = fMetal < 0.3 && fGlassK < 0.2;
  // moss / algae film: damp foot of north-facing (-z) walls (and a little on every shaded foot), patchy, greener low down
  #ifndef HB_NOV4
  {
    float north = smoothstep(-0.15, -0.75, Nw.z) * (1.0 - smoothstep(0.5, 0.9, abs(Nw.y)));
    float mn = vn2(fc * vec2(1.3, 2.1) + P2.w * 13.0) * 0.65 + vn2(fc * vec2(4.7, 6.3) + 1.7) * 0.35;
    float moss = (0.25 + 0.75 * north) * (1.0 - smoothstep(0.05, 0.9 + 1.1 * north, hgt)) * smoothstep(0.38, 0.72, mn) * (0.5 + age) * kW;
    if (paintW) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.62, 0.36) + vec3(0.006, 0.012, 0.002), clamp(moss, 0.0, 0.85));
    fRough = mix(fRough, 0.98, moss * 0.5);
  }
  #endif
  // rust: run-off from steel (fire-escape brackets / lintels / railings) down from each floor line, orange-brown
  if (dRust && paintW && kW > 0.02) {
    float fl = max(P0.x, 2.5), ry = fc.y < P0.y ? -1.0 : fract((fc.y - P0.y) / fl);
    float dd = (1.0 - ry) * fl;                              // metres below the next floor line
    float col = step(0.62, vn1(fc.x * 2.7 + P2.w * 17.0)) * vn1(fc.x * 19.0 + 4.0) * vn1(fc.x * 41.0 + P2.w * 3.0);
    float rs = ry < 0.0 ? 0.0 : col * exp(-dd * 0.55) * (0.6 + 0.4 * vn2(fc * vec2(3.0, 0.4)));
    rs = max(rs, st * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 0.52, 0.3) + vec3(0.03, 0.008, 0.0), clamp(rs * 1.6, 0.0, 0.75) * kW);
  }
  // peeling paint on some old Victorian / Edwardian siding: flakes showing grey weathered wood, dark lifted edges
  if (dPeel && paintW && kW > 0.02 && ((isSurf && (abs(fLayer - 3.0) < 0.5 || abs(fLayer - 4.0) < 0.5)) || (isProc && fMode < 0.5))) {
    float pz = smoothstep(0.42, 0.72, vn2(fc * vec2(0.3, 0.42) + P2.w * 7.0)) * (0.55 + 0.45 * (1.0 - smoothstep(2.0, 9.0, hgt)));
    float pn = vn2(fc * vec2(3.1, 1.6) + P2.w * 31.0) * 0.6 + vn2(fc * vec2(13.0, 7.0) + 3.0) * 0.4;
    float th = mix(0.8, 0.52, pz);
    float peel = smoothstep(th, th + 0.02, pn), edge = smoothstep(th - 0.05, th, pn) * (1.0 - peel);
    vec3 wood = vec3(0.3, 0.28, 0.25) * (0.75 + 0.5 * texA.g);
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.35 * edge * kW), wood, peel * kW * step(0.01, pz));
    fRough = mix(fRough, 0.97, peel * kW);
  }
  // ghost signs: faded painted advertising high on the street walls of some lofts / warehouses (SoMa, Dogpatch):
  // a line of blocky lettering on a painted ground in the frieze, flaked by the weather. Wall length: vG.x on v3
  // walls, the window grid on MID walls
  bool frontW = isSurf ? mod(fFlags, 2.0) > 0.5 : (isProc && fMode < 0.5);
  if (frontW && abs(P4.w - 4.0) < 0.5 && fract(P2.w * 7.13) < 0.45 && kW > 0.02) {
    float wl = isSurf ? vG.x : 2.0 * P0.w + max(vUv4.w, 1.0) * max(vUv4.z, 0.5);
    // painted sign band in the frieze between the top-floor window heads and the cornice
    float nFg = max(0.0, floor((P0.z - P6.w - P0.y) / P0.x + 0.05));
    float sTop = P0.z - P6.w - 0.08, sBot = max(P0.y + max(nFg - 1.0, 0.0) * P0.x + P1.w * P0.x + 0.14, sTop - 1.7);
    if (wl > 8.0 && sTop - sBot > 0.55) {
      float sw = min(18.0, wl * 0.8), su0 = (wl - sw) * 0.5;
      vec2 q = vec2((fc.x - su0) / sw, (fc.y - sBot) / (sTop - sBot));
      if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
        float sd = fract(P2.w * 3.77 + 0.2);
        vec3 bg = sd < 0.3 ? vec3(0.72, 0.68, 0.56) : sd < 0.55 ? vec3(0.4, 0.09, 0.06) : sd < 0.8 ? vec3(0.05, 0.05, 0.05) : vec3(0.52, 0.38, 0.12);
        vec3 fgc = sd < 0.3 ? vec3(0.07, 0.07, 0.07) : vec3(0.82, 0.78, 0.66);
        float nch = max(4.0, floor(sw / ((sTop - sBot) * 0.62)));
        float cx = q.x * nch, ci = floor(cx), gx = fract(cx), ly = q.y;
        float gi = floor((gx - 0.12) / 0.76 * 3.0), gj = floor((ly - 0.14) / 0.72 * 5.0);
        float inG = step(0.12, gx) * step(gx, 0.88) * step(0.14, ly) * step(ly, 0.86);
        float sp = step(0.12, fh1(ci * 3.1 + P2.w * 29.0));
        float bit = step(fh2(vec2(ci * 7.0 + gi + P2.w * 97.0, gj * 3.0 + gi)), 0.62) * inG * sp;
        bit = max(bit, step(0.5, inG * sp) * step(abs(gi - 1.0), 0.1) * step(fh1(ci + P2.w * 5.0), 0.5));   // stems
        float edge = bandAA(q.x, 0.004, 0.996, 0.003) * bandAA(q.y, 0.03, 0.97, 0.02);
        float wear = smoothstep(0.12, 0.42, vn2(fc * vec2(2.3, 3.7) + P2.w * 5.0) * 0.6 + vn2(fc * 0.5 + 9.0) * 0.5);
        vec3 paint = mix(bg, fgc, bit * smoothstep(3.0, 1.0, fw * 8.0));
        float lmW = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, paint * (0.55 + 0.9 * lmW), edge * wear * 0.7 * kW);
      }
    }
  }
}
// ---- v4 grounding / occlusion / bounce (building surfaces): what makes a wall sit in a street instead of floating:
//  fOcc   : sky occlusion of the indirect light: soft contact AO at the wall foot, street-canyon sky visibility (lower
//           floors see less sky; exposed side / party walls in the narrow gaps between houses much less), soft AO under
//           the roof edge / cornice, contact AO around the openings of v3 walls (kit casings, sills, hoods)
//  fCont  : contact darkening of the direct light at the very foot (kerb, clutter and plants block the low sun)
//  fBounce: warm light bounced off the sunlit street / sidewalk onto the lower walls, soffits and porch ceilings
float fOcc = 1.0, fCont = 1.0; vec3 fBounce = vec3(0.0);
#ifndef HB_NOV4
if (hG < 900.0) {
  float camD = length(vWPos - cameraPosition), nearK = 1.0 - smoothstep(380.0, 1300.0, camD);
  float vert = 1.0 - smoothstep(0.55, 0.9, abs(Nw.y));
  float hp = max(hG, 0.0);
  float sideW = (isProc && fMode > 0.5 && fMode < 3.5) ? 1.0 : 0.0;   // side / back / party walls (v2: BACK, SIDEX)
  float jn = 1.0 - 0.55 * exp(-hp * 2.4) - 0.15 * exp(-hp * 0.6);
  float cany = 1.0 - mix(0.22, 0.45, sideW) * (1.0 - smoothstep(0.0, mix(11.0, 8.0, sideW), hp));
  float eave = 1.0;
  if (fc.x > -1e3) eave = 1.0 - 0.3 * exp(-max(P0.z - fc.y, 0.0) * 1.7) * vert;
  // lot-line edges of v3 street walls: the neighbour's front / the gap between houses closes in the sky
  float lotE = v3W ? 1.0 - 0.16 * exp(-max(min(fc.x, vG.x - fc.x), 0.0) * 2.2) : 1.0;
  fOcc = mix(1.0, jn * mix(1.0, cany, nearK) * eave * lotE, vert);
  fCont = mix(1.0, 1.0 - 0.3 * exp(-hp * 3.5), vert);
  // v3 street walls: contact occlusion around window openings (same cells as the MID grid; rows above the ground floor)
  if (v3W && v2p && fc.y > P0.y + 0.2) {
    float w3 = vG.x - 2.0 * P0.w, nb3 = max(1.0, floor(w3 / max(P9.x, 1.0) + 0.5)), cw3 = w3 / nb3;
    float cu3 = (fc.x - P0.w) / cw3, ci3 = floor(cu3), cx3 = fract(cu3) * cw3;
    if (ci3 >= 0.0 && ci3 < nb3 && w3 > 1.2) {
      float cy3 = fc.y - (P0.y + floor((fc.y - P0.y) / P0.x) * P0.x);
      vec4 wr3 = vec4(P1.x * cw3, P1.y * P0.x, P1.z * cw3, min(P1.w * P0.x, P0.z - P6.w - 0.15));
      vec2 q3 = vec2(cx3, cy3), dq = max(max(wr3.xy - q3, q3 - wr3.zw), 0.0);
      float dOut = length(dq);
      float ring = step(1e-4, dOut) * exp(-max(dOut - 0.14, 0.0) * 10.0);
      float under = step(cy3, wr3.y - 0.08) * step(wr3.x - 0.25, cx3) * step(cx3, wr3.z + 0.25) * exp(-(wr3.y - 0.08 - cy3) * 4.0);
      float head = step(wr3.w + 0.3, cy3) * step(wr3.x - 0.2, cx3) * step(cx3, wr3.z + 0.2) * exp(-(cy3 - wr3.w - 0.3) * 6.0);
      fOcc *= 1.0 - (0.2 * ring + 0.3 * under + 0.12 * head) * kWv;
      fCont *= 1.0 - 0.18 * under * kWv;
      // night: a lit room (same coin flip as its interior-mapped glass) washes the wall around the window
      if (uNight > 0.02) {
        float row3 = 1.0 + floor((fc.y - P0.y) / P0.x);
        float sd3 = fh2(vec2(ci3 + P2.w * 131.0, row3 + P2.w * 71.0));
        float lit3 = step(fh1(sd3 * 31.7 + 0.13), P3.w * (0.55 + 0.45 * uNight));
        fEmis += diffuseColor.rgb * vec3(1.0, 0.72, 0.45) * (lit3 * step(1e-4, dOut) * exp(-dOut * 2.6) * (1.0 - 0.6 * step(wr3.w, cy3)) * uNight * 0.55);
      }
      // analytic sun shadow under the sill (a ~10 cm projection: the shadow map's normal bias erases it)
      if (sunT.z > 0.03 && sunT.y > 0.0) {
        float drop = 0.1 * sunT.y / sunT.z, sb3 = wr3.y - 0.07;
        float sh = step(cy3, sb3) * smoothstep(sb3 - drop - 0.03, sb3 - drop + 0.03, cy3) * step(wr3.x - 0.2, cx3) * step(cx3, wr3.z + 0.2);
        fSun *= 1.0 - 0.85 * sh * kWv;
      }
    }
  }
  // analytic sun shadow of the roof-edge cap / moulding over the top of v3 street walls
  if (v3W && sunT.z > 0.03 && sunT.y > 0.0) {
    float yE = P0.z - 0.05, drop = 0.1 * sunT.y / sunT.z;
    fSun *= 1.0 - 0.85 * step(fc.y, yE) * smoothstep(yE - drop - 0.03, yE - drop + 0.03, fc.y) * kWv;
  }
#if NUM_DIR_LIGHTS > 0
  float sunUp = max(sunW.y, 0.0) * (1.0 - uNight);
  if (sunUp > 0.0) {
    float gv = 0.5 * (1.0 - Nw.y);                               // view factor of the ground
    float reach = 0.3 + 0.7 * exp(-hp / 5.5);                   // the lit street is finite: the bounce fades up the wall
    fBounce = directionalLights[0].color * (sunUp * gv * reach * 0.22) * vec3(1.0, 0.84, 0.64);
    // the sunlit row across the street: a wall in shade faces a lit facade (the main fill of a real street canyon);
    // strongest low down where the opposite row fills the view, gone above ~2 storeys over it
    float opp = max(-dot(sunW, Nw), 0.0) * vert * (1.0 - smoothstep(4.0, 16.0, hp)) * (1.0 - sideW * 0.5);
    fBounce += directionalLights[0].color * (opp * 0.13 * (1.0 - uNight)) * vec3(0.98, 0.9, 0.8);
  }
#endif
}
#endif
// distance grade toward the Google photogrammetry that takes over beyond our near block (googletiles.js): its baked
// light is greyer and darker, with occlusion in the street canyons. Far walls darken toward street level, all
// facade surfaces lose a little saturation / brightness (so the handoff ring doesn't read as a brighter, pastel city)
{
  float farK = smoothstep(380.0, 1300.0, length(vWPos - cameraPosition));
  if (farK > 0.0 && !isLight) {
    float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(lum), diffuseColor.rgb, 0.66) * 0.8 * (1.0 - 0.5 * uNight), farK);   // night: far walls read as dark masses (the night IBL lit them pale)
    if (isProc || isCurtain) diffuseColor.rgb *= mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 10.0, vUv4.y), farK);
  }
}
// street lamps at night (diffuse only, no shadows): walls near the camera are lit from the sidewalk, not by the sky
// (v4: every lamp through the shared lamp light map; the 12-nearest-lamp uniforms only while the map is off)
{
  vec3 lampE = vec3(-1.0);
#ifdef HB_FOG_PARS
  if (!isLight) lampE = hbLampWall(vWPos, Nw);
#endif
  if (lampE.x >= 0.0) fEmis += diffuseColor.rgb * (1.0 - 0.85 * fMetal) * lampE * RECIPROCAL_PI * mix(1.0, fAO, 0.5);
  else if (uLampN > 0 && uNight > 0.02 && !isLight) fEmis += diffuseColor.rgb * (1.0 - 0.85 * fMetal) * hbLamps(vWPos, Nw) * uNight * mix(1.0, fAO, 0.5);
}
`;

// Blender-baked interior atlases (optional): assets/baked/rooms_day.jpg, rooms_night.jpg (4x4), shops.jpg, shops_night.jpg (2x4).
// Until they load (or if missing) the procedural rooms are used.
let ATL = null;
function bakedAtlases() {
  if (ATL) return ATL;
  const dummy = new THREE.DataTexture(new Uint8Array([40, 38, 36, 255]), 1, 1); dummy.needsUpdate = true;
  ATL = { roomsD: { value: dummy }, roomsN: { value: dummy }, shopsD: { value: dummy }, shopsN: { value: dummy }, on: { value: new THREE.Vector2(0, 0) } };
  if (typeof document === 'undefined') return ATL;
  const base = (import.meta.env?.BASE_URL || './') + 'assets/baked/';
  const ld = new THREE.TextureLoader();
  const get = (file, slot, done) => packedUrl(base + file) ? loadPacked(base + file, { srgb: true, anisotropy: 4, onLoad: t => { ATL[slot].value = t; done(); } }) : ld.load(base + file, t => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; ATL[slot].value = t; done(); }, undefined, () => {});
  let r = 0, sh = 0;
  get('rooms_day.jpg', 'roomsD', () => { if (++r === 2) ATL.on.value.x = 1; });
  get('rooms_night.jpg', 'roomsN', () => { if (++r === 2) ATL.on.value.x = 1; });
  get('shops.jpg', 'shopsD', () => { if (++sh === 2) ATL.on.value.y = 1; });
  get('shops_night.jpg', 'shopsN', () => { if (++sh === 2) ATL.on.value.y = 1; });
  return ATL;
}


// Blender-baked facade kit atlas (tools/blender/facade_kit.py). kit.json is null until loaded; near.js falls back to
// modelled trims until then. uFOn switches the shader paths.
let KITS = null;
export function facadeKit() {
  if (KITS) return KITS;
  const NU = KIT_KEYS.length;
  const px = (r, g, b, a) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.needsUpdate = true; return t; };
  const V = () => Array.from({ length: NU }, () => new THREE.Vector4(0, 0, 1, 1));
  KITS = { json: null, on: { value: 0 }, km: { value: 1 / 12 }, alb: { value: px(200, 200, 200, 255) }, nrm: { value: px(128, 128, 115, 255) },
    ma: { value: null }, U: { value: V() }, O: { value: V() }, S: { value: V() }, ready: null };
  // until the atlas arrives: left half = wall mask, right half = AO 1 (kit quads render as plain wall)
  const ma0 = new THREE.DataTexture(new Uint8Array([0, 0, 255, 255, 255, 128, 0, 255]), 2, 1);
  ma0.minFilter = ma0.magFilter = THREE.NearestFilter; ma0.needsUpdate = true; KITS.ma.value = ma0;
  if (typeof document === 'undefined') return KITS;
  const base = (import.meta.env?.BASE_URL || './') + 'assets/baked/';
  const ld = new THREE.TextureLoader();
  const tex = (file, srgb) => packedUrl(base + file) ? loadPacked(base + file, { srgb, anisotropy: 8 }).userData.ready.then(t => t || Promise.reject(new Error(file))) : new Promise((res, rej) => ld.load(base + file, t => {
    if (file !== 'facade_ma.png') t.image = capImage(t.image);   // (the mask atlas stays full size)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8; res(t);
  }, undefined, rej));
  KITS.ready = fetch(base + 'facade_kit.json').then(r => r.json()).then(async (j) => {
    KIT_KEYS.forEach((k, i) => {
      const u = j.units[k]; if (!u) return;
      const O = k === 'store' || k === 'store_door' ? (u.hole || u.open) : u.open;
      KITS.U.value[i].set(u.uv[0], u.uv[1], u.uv[2], u.uv[3]);
      KITS.O.value[i].set(O[0], O[1], O[2], O[3]);
      KITS.S.value[i].set(u.size[0], u.size[1], u.rec || 0.15, u.tile === 'x' ? 1 : u.tile === 'z' ? 2 : 0);
    });
    KITS.km.value = 1 / j.metres;
    KITS.json = j;     // near.js can emit kit geometry right away; the shader switches on once the maps are in
    const [a, n, m] = await Promise.all([tex('facade_alb.jpg', true), tex('facade_nrm.png'), tex('facade_ma.png')]);
    KITS.alb.value = a; KITS.nrm.value = n; KITS.ma.value = m;
    KITS.on.value = 1;
  }).catch(e => console.warn('[facade] kit atlas unavailable', e));
  return KITS;
}

export function makeFacadeMaterials({ night, textures, paramsTex, hideTex, time }) {
  const atlases = bakedAtlases();
  const kit = facadeKit();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
  const invTile = TILE.map(t => 1 / t);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.uniforms.uTime = time;
    sh.uniforms.uAlb = textures.alb;
    sh.uniforms.uNrm = textures.nrm;
    sh.uniforms.uParams = { value: paramsTex };
    sh.uniforms.uHide = { value: hideTex };
    sh.uniforms.uInvTile = { value: invTile };
    sh.uniforms.uMetal = { value: METAL };
    sh.uniforms.uRoomsD = atlases.roomsD; sh.uniforms.uRoomsN = atlases.roomsN; sh.uniforms.uShopsD = atlases.shopsD; sh.uniforms.uShopsN = atlases.shopsN;
    sh.uniforms.uAtlasOn = atlases.on;
    { const LU = lampUniforms(); sh.uniforms.uLampP = LU.pos; sh.uniforms.uLampC = LU.col; sh.uniforms.uLampN = LU.n; sh.uniforms.uLampK = LU.k; }
    sh.uniforms.uFA = kit.alb; sh.uniforms.uFN = kit.nrm; sh.uniforms.uFM = kit.ma; sh.uniforms.uFOn = kit.on; sh.uniforms.uKM = kit.km;
    sh.uniforms.uKU = kit.U; sh.uniforms.uKO = kit.O; sh.uniforms.uKS = kit.S;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vUv4 = aUv; vC = aC; vG = aG; vK = aK; vId = aId;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + HIDE);
    sh.fragmentShader = '#define HB_NO_LAMPMAP\n' + sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + LAMPWALL_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;')
      // glass mirrors the sky: the world IBL is graded down for walls, window panes need ~2.6x to read as real glass
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#ifdef USE_ENVMAP\nradiance *= mix(1.0, 2.6, fGlassK);\n#endif')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (fNrmAmt > 0.0) {
  vec3 mapN = vec3((texN.xy * 2.0 - 1.0) * fNrmK, 0.0);
  mapN.z = sqrt(max(0.0, 1.0 - dot(mapN.xy, mapN.xy)));
  mat3 tbnF = cotFrame(normal, dFdx(-vViewPosition), dFdy(-vViewPosition), dUx, dUy);
  normal = normalize(mix(normal, tbnF * mapN, fNrmAmt));
}
if (fKNAmt > 0.0) {
  vec3 nwK = normalize(Tw * fKN.x + vec3(0.0, fKN.y, 0.0) + Nw * fKN.z);
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(nwK, 0.0)).xyz), fKNAmt));
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmis;')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(...DIR_NIGHT('uNight')))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.directDiffuse *= fSun * mix(1.0, fAO, 0.6) * fCont;
reflectedLight.directSpecular *= fSun * fCont;
reflectedLight.indirectDiffuse *= fAO * fOcc * (1.0 - uNight * ${NIGHT_IND.toFixed(2)});
reflectedLight.indirectDiffuse += fBounce * BRDF_Lambert(material.diffuseColor) * fAO * fCont;
reflectedLight.indirectSpecular *= mix(1.0, fAO * fOcc, 0.7) * fSpecOcc;`);
  };
  mat.customProgramCacheKey = () => 'facade-v6' + (NOV4 ? 'a' : '');
  // (v5) v3 street-facade variant: dithers in over its MID stand-in (fadeGLSL), pulled a hair forward so it wins the
  // coplanar depth test against the MID wall it replaces while both are drawn
  const fadeVariant = (a, b, offset) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, polygonOffset: offset, polygonOffsetFactor: offset ? -1 : 0, polygonOffsetUnits: offset ? -4 : 0 });
    const fr = { value: new THREE.Vector2(a, b) };
    m.onBeforeCompile = (sh) => {
      mat.onBeforeCompile(sh);
      sh.uniforms.uFadeR = fr;
      sh.fragmentShader = '#define HB_FADE\nuniform vec2 uFadeR;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + fadeGLSL('vWPos'));
    };
    m.customProgramCacheKey = () => 'facade-v6' + (NOV4 ? 'a' : '') + '-fade';
    m.userData.fadeR = fr;
    return m;
  };
  const matFade = fadeVariant(147, 175, true), fadeR = matFade.userData.fadeR;

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uHide = { value: hideTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nattribute float aId; attribute float aK;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + HIDE);
  };
  depth.customProgramCacheKey = () => 'facade-depth-v4';
  return { mat, depth, matFade, fadeR, fadeVariant };
}
