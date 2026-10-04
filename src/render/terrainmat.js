// Photo-scanned ground materials: terrain splatting (grass / forest floor / sand / cliff rock by per-vertex weights,
// two-scale sampling against tiling), asphalt and sidewalk concrete with world-space UVs.
// Weather: every lit material gets wet shading from fog.js (HB_WET); these ground materials also opt into puddles +
// rain ripples (HB_PUDDLES), the road adds curb-gutter puddles (HB_GUTTER), and the beach sand darkens in a swash band.
import * as THREE from 'three';
import { PBR } from '../world/assets.js';
import { YARD_GLSL, NOYARDG } from '../world/grass/yard_glsl.js';
import { ROAD_VERT_PARS, ROAD_VERT, ROAD_FRAG_PARS, ROAD_FRAG, ROAD_ROUGH, ROAD_METAL, ROAD_NORMAL, CURB_VERT_PARS, CURB_VERT, CURB_FRAG_PARS, CURB_FRAG, MARK_FRAG_PARS, MARK_FRAG } from './roadwear.js';

const CLIFF_TILE = 9;
// the grass system's biome window (src/world/grass/capture.js BioWindow: R = surface class, G = lushness), shared so the
// terrain's grass layer takes the same golden / green colour as the blades on top of it (no colour step where they end)
const bioBlank = new THREE.DataTexture(new Uint8Array([3, 128, 0, 255]), 1, 1);
bioBlank.needsUpdate = true;
const lotBlank = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
lotBlank.needsUpdate = true;
// tLot: per-cell lot frame of yard cells (capture.js BioWindow.lotTex) for the yard patchwork (grass/yard_glsl.js)
export const TERRAIN_BIO = { tBio: { value: bioBlank }, tBioXf: { value: new THREE.Vector4(1e9, 1e9, 1, 1) }, tLot: { value: lotBlank } };
// terrain: attribute aSplat = (grass, forest, sand, rock) weights; vertex colour still tints (dry grass, wet sand)
export function makeTerrainMaterial() {
  const G = PBR.tex('grass'), F = PBR.tex('forest_floor'), S = PBR.tex('sand');
  const cliff = PBR.manifest?.materials?.cliff_rock ? PBR.tex('cliff_rock') : null;
  const R = cliff || PBR.tex('rock');
  const kRock = cliff ? 1 / CLIFF_TILE : 1 / PBR.TILE.rock;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: G.map, normalMap: G.normalMap });
  mat.defines = { HB_WET_GLOSS: '0.2' };   // rain: grass / soil darken but barely shine (fog.js wet shading)
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tG: { value: G.map }, tF: { value: F.map }, tS: { value: S.map }, tR: { value: R.map },
      nG: { value: G.normalMap }, nF: { value: F.normalMap }, nS: { value: S.normalMap }, nR: { value: R.normalMap },
      ...TERRAIN_BIO,
      kG: { value: 1 / PBR.TILE.grass }, kF: { value: 1 / PBR.TILE.forest_floor }, kS: { value: 1 / PBR.TILE.sand }, kR: { value: kRock },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vTW; attribute float aYard; varying float vYard;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSplat = aSplat; vTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vYard = aYard;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tG, tF, tS, tR, nG, nF, nS, nR; uniform float kG, kF, kS, kR;
varying vec4 vSplat; varying vec3 vTW; varying float vYard;
uniform sampler2D tBio; uniform vec4 tBioXf; uniform sampler2D tLot;
float tWetSand = 0.0, tYardHard = 0.0;
${NOYARDG ? '' : YARD_GLSL}
// grass palette + noise: the same maths as src/world/grass/glsl.js (hash12 / vnoise / fbm / dryness / grassCol)
float gH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y); }
float gF(vec2 p) { return gN(p) * 0.55 + gN(p * 2.03 + 7.1) * 0.3 + gN(p * 4.11 + 3.7) * 0.15; }
vec3 gCol(float dry, float n1, float r) {
  vec3 wet = mix(vec3(0.045, 0.14, 0.018), vec3(0.12, 0.23, 0.035), n1); wet = mix(wet, vec3(0.2, 0.28, 0.06), r * 0.35);
  vec3 dr = mix(vec3(0.36, 0.25, 0.09), vec3(0.6, 0.43, 0.16), n1); dr = mix(dr, vec3(0.74, 0.6, 0.34), r * 0.45);
  return mix(wet, dr, smoothstep(0.3, 0.7, dry));
}
// lushness (0 dry .. 1 green) + class from the biome window (bilinear on G), else a slope / height guess like BioWindow's
vec2 gLush(vec2 xz, float ny, float h) {
  vec2 f = (xz - tBioXf.xy) * tBioXf.z * tBioXf.w - 0.5;
  float R = tBioXf.w;
  if (f.x >= 0.0 && f.y >= 0.0 && f.x < R - 1.0 && f.y < R - 1.0) {
    ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
    vec4 a = texelFetch(tBio, i, 0), b = texelFetch(tBio, i + ivec2(1, 0), 0), c = texelFetch(tBio, i + ivec2(0, 1), 0), d = texelFetch(tBio, i + ivec2(1, 1), 0);
    vec4 m = t.x + t.y < 1.0 ? a : d;
    return vec2(mix(mix(a.g, b.g, t.x), mix(c.g, d.g, t.x), t.y), m.r * 255.0);
  }
  float sl = sqrt(max(0.0, 1.0 - ny * ny)) / max(ny, 0.05);
  return vec2(max(clamp(1.25 - sl * 3.5, 0.0, 1.0) * clamp((150.0 - h) / 90.0, 0.0, 1.0), smoothstep(0.2, 0.6, vSplat.y) * 0.8), 3.0);
}
vec3 tri(sampler2D t, vec2 p, float k){ vec3 a = texture2D(t, p * k).rgb; vec3 b = texture2D(t, p * k * 0.19 + 0.37).rgb; return mix(a, b, 0.35); }
float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
vec4 wts = max(vSplat, 0.0);
// break up the blend borders with noise so transitions look natural
float bn = vn(vTW.xz * 0.15) * 0.5 + vn(vTW.xz * 0.6) * 0.25;
wts = pow(wts + bn * 0.35 * step(0.01, wts), vec4(3.0)); wts /= max(1e-4, dot(wts, vec4(1.0)));
// cliff rock: on steep faces project onto the dominant vertical plane (xy / zy) instead of xz (no vertical smearing)
vec3 rockA = vec3(0.5);
if (wts.w > 0.01) {
  vec3 nW = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
  vec3 aw = abs(nW);
  vec3 top = tri(tR, vTW.xz, kR);
  vec3 side = aw.x > aw.z ? tri(tR, vTW.zy, kR) : tri(tR, vTW.xy, kR);
  rockA = mix(side, top, smoothstep(0.55, 0.8, aw.y));
}
// grass layer: photo detail (luminance only) x the blades' own biome colour, so far ground = far grass
vec3 grassA;
{
  vec3 nW0 = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
  vec2 lc = gLush(vTW.xz, abs(nW0.y), vTW.y);
  float patchN = gF(vTW.xz * 0.03 + 11.0);
  float dry = clamp(1.0 - lc.x + (patchN - 0.5) * 0.8 + (gN(vTW.xz * 0.0035 + 5.3) - 0.5) * 0.45 * (1.0 - 0.8 * smoothstep(0.8, 0.95, lc.x)), 0.0, 1.0);
  float dist = distance(vTW, cameraPosition);
  float n1 = mix(gN(vTW.xz * 0.13), 0.5, smoothstep(20.0, 120.0, dist));
  vec3 gc = gCol(dry, n1, 0.5);
  if (lc.y > 8.5 || (lc.y > 2.5 && lc.y < 3.5 && lc.x > 0.6 && patchN < 0.6)) gc = mix(gc, vec3(0.07, 0.19, 0.025), 0.55);   // lawns
  // macro breakup far away: patchy greens / golds at hillside scale
  float mN = gF(vTW.xz * 0.0021 + 3.1);
  gc *= mix(1.0, 0.8 + 0.4 * gN(vTW.xz * 0.009 - 7.0), smoothstep(60.0, 250.0, dist));
  gc = mix(gc, gc * vec3(0.82, 1.08, 0.8), smoothstep(0.55, 0.8, mN) * smoothstep(80.0, 300.0, dist) * (1.0 - dry * 0.5));
  vec3 tg = tri(tG, vTW.xz, kG);
  vec3 avgG = textureLod(tG, vec2(0.5), 12.0).rgb;
  float det = clamp(dot(tg, vec3(0.3, 0.59, 0.11)) / max(0.02, dot(avgG, vec3(0.3, 0.59, 0.11))), 0.35, 1.8);
  // near: the ground between blades is the shaded blade base (darker); by ~80 m it matches the blades' average tone
  grassA = gc * mix(det, mix(det, 1.0, 0.6), smoothstep(30.0, 120.0, dist)) * mix(0.6, 0.78, smoothstep(12.0, 85.0, dist));
  grassA = mix(vec3(dot(grassA, vec3(0.3, 0.59, 0.11))), grassA, 0.88);
}
vec3 alb = grassA * wts.x + tri(tF, vTW.xz, kF) * wts.y + tri(tS, vTW.xz, kS) * wts.z + rockA * wts.w;
float macro = mix(0.82 + 0.36 * vn(vTW.xz * 0.012), 1.0, wts.x * 0.6);
${NOYARDG ? '' : `// residential yards (class 9): a lot patchwork of dry / watered lawn, dirt, paving, mulch, gravel (grass/yard_glsl.js)
float yW = smoothstep(0.3, 0.7, vYard);
if (yW > 0.001) {
  float aa = length(fwidth(vTW.xz));
  vec4 yc = yardCell(tLot, tBioXf, vTW.xz);
  float hk, dk; vec3 ya = yardAlb(yc, vTW.xz, aa, hk, dk);
  vec3 dt, da;   // photo detail (luminance) of the matching ground: grass / forest floor / sand
  if (dk < 0.5) { dt = tri(tG, vTW.xz, kG); da = textureLod(tG, vec2(0.5), 12.0).rgb; }
  else if (dk < 1.5) { dt = tri(tF, vTW.xz, kF); da = textureLod(tF, vec2(0.5), 12.0).rgb; }
  else { dt = tri(tS, vTW.xz, kS); da = textureLod(tS, vec2(0.5), 12.0).rgb; }
  float dl = clamp(dot(dt, vec3(0.3, 0.59, 0.11)) / max(0.02, dot(da, vec3(0.3, 0.59, 0.11))), 0.45, 1.7);
  ya *= mix(dl, 1.0, smoothstep(0.3, 1.5, aa) * 0.7);
  alb = mix(alb, ya, yW); macro = mix(macro, 1.0, yW * 0.7); tYardHard = hk * yW;
}`}
diffuseColor.rgb *= alb * macro;
// beach swash: the sand just above the waterline is dark and glossy, the edge creeps up and down
{
  #ifdef HB_FOG_PARS
  float tt = hbWet.y;
  #else
  float tt = 0.0;
  #endif
  float swash = 0.35 + 0.22 * sin(tt * 0.55 + vTW.x * 0.013 + vTW.z * 0.011) + 0.12 * vn(vTW.xz * 0.08 + tt * 0.05);
  tWetSand = wts.z * (1.0 - smoothstep(swash - 0.12, swash + 0.1, vTW.y)) * step(-2.0, vTW.y);
  diffuseColor.rgb *= 1.0 - tWetSand * 0.42;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, tWetSand);')
      .replace('#include <normal_fragment_maps>', `
{
  vec3 nm = texture2D(nG, vTW.xz * kG).xyz * wts.x + texture2D(nF, vTW.xz * kF).xyz * wts.y + texture2D(nS, vTW.xz * kS).xyz * wts.z + texture2D(nR, vTW.xz * kR).xyz * wts.w;
  nm = nm * 2.0 - 1.0; nm.xy *= 0.9;
  nm.xy *= 1.0 - tWetSand * 0.7;
  nm.xy *= 1.0 - tYardHard * 0.8;
  // world-space ground: tangent = +X, bitangent = -Z (uv v runs along +Z), normal = geometry normal
  vec3 Nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x), B = cross(Nw, T);
  vec3 nw = normalize(T * nm.x + B * nm.y + Nw * nm.z);
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}`);
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v4' + (NOYARDG ? 'n' : '');
  return mat;
}

// asphalt: photo maps; the vertex colour tints (patches, gutters, brick for Lombard). Wet: puddles + gutter streams.
// Wear (render/roadwear.js): tracks, patches, cracks + sealant, stains, covers, gutter pans; coords = the 1:1 map's
// road coordinates (aRoad / aLanes / aSpan), markings = paint the lane lines in the shader.
export function makeRoadMaterial({ coords = false, markings = false } = {}) {
  const t = PBR.tex('asphalt');
  // real asphalt reads dark and fine-grained from a car: darken the photo albedo, soften the aggregate relief
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, vertexColors: true, roughness: 1, metalness: 0, color: 0x8a8a8a });   // (road 2) 0x9d -> 0x8a: aged asphalt albedo ~0.1
  m.normalScale.set(0.45, 0.45);
  m.defines = { HB_PUDDLES: '' };   // HB_GUTTER comes with the shader text (roadwear.js), never via defines
  if (coords) m.defines.HB_ROADCOORD = '';
  if (coords && markings) m.defines.HB_ROADPAINT = '';
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + ROAD_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + ROAD_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + ROAD_FRAG_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_COLOR
// the road ribbon darkens its outer ~0.8 m (gutter strip) in the vertex colour; brick (Lombard) is excluded
hbGutter = (1.0 - smoothstep(0.6, 0.8, vColor.g)) * (1.0 - smoothstep(0.1, 0.2, vColor.r - vColor.g));
#endif
` + ROAD_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + ROAD_ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + ROAD_METAL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + ROAD_NORMAL);
  };
  m.customProgramCacheKey = () => 'road-wear-v1' + (coords ? 'c' : '') + (markings ? 'm' : '');
  return m;
}
// sidewalk: photo concrete + SF slab seams every 1.6 m (albedo + a groove in the normal); curbs = SF painted curb zones
export function makeSidewalkMaterial({ curbs = false } = {}) {
  const t = PBR.tex('concrete');
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, vertexColors: true, roughness: 1, metalness: 0 });
  m.defines = { HB_PUDDLES: '' };
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;' + (curbs ? '\n' + CURB_VERT_PARS : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (curbs ? '\n' + CURB_VERT : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; float seamK;' + (curbs ? '\n' + CURB_FRAG_PARS : '\nfloat curbK = 0.0;'))
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec2 g = abs(fract(vSW.xz / 1.6) - 0.5); float e = 0.5 - max(g.x, g.y); float aa = fwidth(vSW.x / 1.6) * 1.2 + 0.004;
  seamK = 1.0 - smoothstep(0.004, 0.004 + aa, e); diffuseColor.rgb *= (1.0 - seamK * 0.45) * 0.6; }` + (curbs ? CURB_FRAG : ''))   // weathered concrete ~0.28 albedo (look-dev r2 0.74 -> 0.6: slabs still read pale-white under the night lamp pools)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, seamK);\nroughnessFactor = mix(roughnessFactor, 0.6, curbK);');
  };
  m.customProgramCacheKey = () => 'sidewalk-seams-v3' + (curbs ? 'c' : '');
  return m;
}

// road markings geometry (crosswalks, stop lines, STOP legends, sharrows, trackways): worn thermoplastic. World-space
// chipping, tyre-scrubbed patches and grime show the asphalt through the paint; trackway concrete gets a mottle.
// Bright paint only (luma > ~0.45), so dark flangeway grooves stay as they are.
export function makeMarkingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  m.defines = { HB_PUDDLES: '' };
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + MARK_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + MARK_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + mkRough, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'road-marking-v1';
  return m;
}
// rail heads / slot rails: polished steel that reads as a bright line near the camera; far away it goes rough and
// dull so the sub-pixel strips don't sparkle (flicker probe)
export function makeRailMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85 });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.75, smoothstep(18.0, 80.0, length(vViewPosition)));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.75 * smoothstep(25.0, 110.0, length(vViewPosition));');
  };
  m.customProgramCacheKey = () => 'road-rail-v1';
  return m;
}
