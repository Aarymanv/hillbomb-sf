// Shared interior materials: one uber MeshStandardMaterial (vertex albedo, per-vertex roughness/metalness, baked light,
// window sky light, procedural surface patterns), glazing, unlit HDR glow, and two atlas materials (glowing signs,
// lit posters). All sites share these, so every material compiles once.
import * as THREE from 'three';
import { getAtlas } from './atlas.js';
import { PBR } from '../assets.js';

let MATS = null;
export const U = {
  uBakeK: { value: 1 },
  uSkyCol: { value: new THREE.Color(0.5, 0.56, 0.64) },
  uNight: { value: 0 },
  uTime: { value: 0 },
};

const PATTERNS = /* glsl */`
float ih(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ih(i), ih(i + vec2(1.0, 0.0)), f.x), mix(ih(i + vec2(0.0, 1.0)), ih(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm2(vec2 p){ return vn(p) * 0.6 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.7 + 3.3) * 0.1; }
// 1 on a grout line of half-width w (in cell units) around integer boundaries of x
float gline(float x, float w, float aa){ float d = min(fract(x), 1.0 - fract(x)); return 1.0 - smoothstep(w - aa, w + aa, d); }
`;

function patchUber(mat, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aBake; attribute vec4 aRM; attribute vec2 aPuv;
varying vec4 vBake; varying vec4 vRM; varying vec2 vPuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vBake = aBake; vRM = aRM; vPuv = aPuv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uBakeK; uniform vec3 uSkyCol; uniform float uNight; uniform float uTime;
varying vec4 vBake; varying vec4 vRM; varying vec2 vPuv;
${PATTERNS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pRough = 0.0;
{
  float pid = floor(vRM.z + 0.5);
  vec2 p = vPuv;
  vec2 aa = fwidth(p) + 1e-4;
  float far = 0.0;
  if (pid == 1.0) { // wood planks
    float W = 0.155; float row = floor(p.y / W); float off = ih(vec2(row, 3.1)) * 3.0;
    float L = 1.35 + ih(vec2(row, 1.7)) * 0.8; float seg = floor((p.x + off) / L);
    float h = ih(vec2(row, seg));
    float grain = vn(vec2((p.x + off) * 2.2 + h * 9.0, p.y * 70.0)) * 0.5 + vn(vec2((p.x + off) * 9.0, p.y * 180.0)) * 0.5;
    far = smoothstep(0.02, 0.08, aa.y);
    float seam = max(gline(p.y / W, 0.035, aa.y / W), gline((p.x + off) / L, 0.004, aa.x / L));
    vec3 tint = mix(vec3(0.86, 0.8, 0.74), vec3(1.14, 1.06, 0.95), h);
    vec3 m = tint * (0.86 + 0.26 * grain);
    m *= 1.0 - 0.5 * seam * (1.0 - far);
    diffuseColor.rgb *= mix(m, vec3(0.99), far * 0.6);
    pRough = seam * 0.2;
  } else if (pid == 2.0) { // checkerboard 0.3 m
    vec2 c = floor(p / 0.3); float k = mod(c.x + c.y, 2.0);
    far = smoothstep(0.05, 0.18, max(aa.x, aa.y));
    float g = max(gline(p.x / 0.3, 0.01, aa.x / 0.3), gline(p.y / 0.3, 0.01, aa.y / 0.3));
    float m = mix(1.0, 0.06, k) * (0.95 + 0.1 * ih(c)) * (1.0 - 0.2 * g);
    diffuseColor.rgb *= mix(m, 0.53, far);
  } else if (pid == 3.0) { // square tiles 0.3 m with grout
    vec2 c = floor(p / 0.3); far = smoothstep(0.05, 0.15, max(aa.x, aa.y));
    float g = max(gline(p.x / 0.3, 0.02, aa.x / 0.3), gline(p.y / 0.3, 0.02, aa.y / 0.3)) * (1.0 - far);
    diffuseColor.rgb *= (0.94 + 0.1 * ih(c)) * (1.0 - 0.35 * g);
    pRough = g * 0.5;
  } else if (pid == 4.0) { // concrete
    float n = fbm2(p * 0.9); float s = vn(p * 23.0);
    diffuseColor.rgb *= 0.8 + 0.3 * n + 0.08 * s * (1.0 - smoothstep(0.02, 0.06, aa.x));
    float jt = max(gline(p.x / 6.0, 0.0025, aa.x / 6.0), gline(p.y / 6.0, 0.0025, aa.y / 6.0));
    diffuseColor.rgb *= 1.0 - 0.3 * jt;
    pRough = 0.1 * n;
  } else if (pid == 5.0) { // carpet / rug pile
    float n = vn(p * 55.0) * 0.5 + vn(p * 13.0) * 0.5;
    far = smoothstep(0.01, 0.04, aa.x);
    diffuseColor.rgb *= mix(0.86 + 0.26 * n, 0.99, far);
  } else if (pid == 6.0) { // brick running bond
    float bw = 0.215, bh = 0.075; float row = floor(p.y / bh); float x = p.x / bw + mod(row, 2.0) * 0.5;
    vec2 c = vec2(floor(x), row);
    far = smoothstep(0.03, 0.08, aa.y);
    float mort = max(gline(x, 0.045, aa.x / bw), gline(p.y / bh, 0.12, aa.y / bh)) * (1.0 - far);
    vec3 b = diffuseColor.rgb * (0.78 + 0.4 * ih(c)) * (0.9 + 0.2 * vn(p * 7.0));
    diffuseColor.rgb = mix(b, vec3(0.52, 0.5, 0.47), mort * 0.85);
    pRough = mort * 0.2;
  } else if (pid == 7.0) { // subway tile 15 x 7.5
    float bw = 0.15, bh = 0.075; float row = floor(p.y / bh); float x = p.x / bw + mod(row, 2.0) * 0.5;
    far = smoothstep(0.02, 0.06, aa.y);
    float g = max(gline(x, 0.03, aa.x / bw), gline(p.y / bh, 0.06, aa.y / bh)) * (1.0 - far);
    float bev = smoothstep(0.0, 0.25, min(fract(p.y / bh), 1.0 - fract(p.y / bh))) * (1.0 - far);
    diffuseColor.rgb = mix(diffuseColor.rgb * (0.95 + 0.05 * bev), vec3(0.42, 0.42, 0.4), g * 0.8);
    pRough = g * 0.6;
  } else if (pid == 8.0) { // terrazzo / polished stone tiles 1.2 m
    vec2 c = floor(p / 1.2); far = smoothstep(0.01, 0.05, max(aa.x, aa.y));
    float g = max(gline(p.x / 1.2, 0.0025, aa.x / 1.2), gline(p.y / 1.2, 0.0025, aa.y / 1.2));
    float sp = step(0.86, ih(floor(p * 70.0))) * (1.0 - far);
    float sp2 = step(0.93, ih(floor(p * 43.0) + 3.7)) * (1.0 - far);
    diffuseColor.rgb *= (0.96 + 0.08 * ih(c)) * (0.93 + 0.1 * fbm2(p * 1.3));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + 0.05, sp * 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, sp2 * 0.4);
    diffuseColor.rgb *= 1.0 - 0.4 * g;
  } else if (pid == 9.0) { // vertical metal fluting
    float f = p.x / 0.06; far = smoothstep(0.1, 0.4, aa.x / 0.06);
    float r = abs(sin(f * 3.14159));
    diffuseColor.rgb *= mix(0.72 + 0.4 * r, 0.93, far);
  } else if (pid == 10.0) { // clapboard siding (horizontal boards)
    float bh = 0.14; float f = fract(p.y / bh); far = smoothstep(0.03, 0.1, aa.y);
    float lip = gline(p.y / bh, 0.05, aa.y / bh);
    diffuseColor.rgb *= mix((0.8 + 0.24 * f) * (1.0 - 0.35 * lip), 0.92, far);
  } else if (pid == 11.0) { // upholstery / fabric weave
    float n = vn(p * 90.0) * 0.4 + vn(p * 21.0) * 0.6;
    far = smoothstep(0.004, 0.02, aa.x);
    diffuseColor.rgb *= mix(0.88 + 0.22 * n, 0.98, far);
  } else if (pid == 12.0) { // fish-scale shingles
    float rh = 0.16, rw = 0.2; float row = floor(p.y / rh); float x = p.x / rw + mod(row, 2.0) * 0.5;
    vec2 f = vec2(fract(x) - 0.5, fract(p.y / rh));
    float d = length(vec2(f.x, (f.y - 0.1) * 1.2));
    far = smoothstep(0.02, 0.07, aa.y);
    float edge = smoothstep(0.38, 0.5, d);
    diffuseColor.rgb *= mix(0.95 - 0.35 * edge + 0.1 * ih(vec2(floor(x), row)), 0.8, far);
  } else if (pid == 13.0) { // vinyl composition tiles (speckled)
    vec2 c = floor(p / 0.3); far = smoothstep(0.02, 0.1, max(aa.x, aa.y));
    float tone = mod(c.x + c.y, 2.0) < 0.5 ? 1.0 : 0.86;
    float sp = vn(p * 60.0) * (1.0 - far);
    float g = max(gline(p.x / 0.3, 0.008, aa.x / 0.3), gline(p.y / 0.3, 0.008, aa.y / 0.3)) * (1.0 - far);
    diffuseColor.rgb *= tone * (0.9 + 0.2 * sp) * (1.0 - 0.25 * g);
  } else if (pid == 14.0) { // stucco
    diffuseColor.rgb *= 0.9 + 0.14 * fbm2(p * 3.0) + 0.05 * vn(p * 31.0) * (1.0 - smoothstep(0.02, 0.06, aa.x));
  } else if (pid == 16.0) { // furniture wood grain (no plank seams)
    float gr = vn(vec2(p.x * 1.6, p.y * 38.0)) * 0.6 + vn(vec2(p.x * 7.0, p.y * 120.0)) * 0.4;
    float fig = sin(p.y * 22.0 + vn(p * vec2(0.8, 3.0)) * 6.0) * 0.5 + 0.5;
    far = smoothstep(0.01, 0.05, max(aa.x, aa.y));
    diffuseColor.rgb *= mix(0.84 + 0.2 * gr + 0.08 * fig, 0.97, far);
  } else if (pid == 17.0) { // plaster wall (very subtle trowel noise)
    diffuseColor.rgb *= 0.96 + 0.06 * fbm2(p * 1.7) + 0.02 * vn(p * 17.0);
  } else if (pid == 15.0) { // wall panelling (0.6 m boards, v-grooves)
    float f = p.x / 0.6; far = smoothstep(0.05, 0.2, aa.x / 0.6);
    float g = gline(f, 0.012, aa.x / 0.6) * (1.0 - far);
    diffuseColor.rgb *= (0.95 + 0.08 * ih(vec2(floor(f), 1.0))) * (1.0 - 0.45 * g);
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
roughnessFactor = clamp(roughnessFactor * vRM.x * 1.25 + pRough, 0.1, 1.0);
#else
roughnessFactor = clamp(vRM.x + pRough, 0.1, 1.0);
#endif`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = vRM.y;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (vBake.rgb * uBakeK + vRM.w * uSkyCol);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.indirectDiffuse *= vBake.a;
reflectedLight.indirectSpecular *= 0.15 + 0.85 * vBake.a;`);
  };
  mat.customProgramCacheKey = () => key;
}

export function getMaterials() {
  if (MATS) return MATS;
  const main = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  patchUber(main, 'interiors-uber-v1');
  const atlas = getAtlas();
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas.texture, alphaTest: 0.35, roughness: 0.7 });
  patchUber(paint, 'interiors-uber-map-v1');
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
  // far windows turn into opaque, reflective panes (warm at night) so buildings never look see-through from afar
  glass.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.uNight;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uNight;`)
      .replace('#include <tonemapping_fragment>', `float gFar = smoothstep(60.0, 130.0, length(vViewPosition));
gl_FragColor.a = mix(gl_FragColor.a, 0.93, gFar);
gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.55 + vec3(0.015, 0.02, 0.028) + uNight * vec3(0.95, 0.62, 0.32) * 0.3, gFar);
#include <tonemapping_fragment>`);
  };
  glass.customProgramCacheKey = () => 'interiors-glass-v1';
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const sign = new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide });
  const pbrCache = new Map();
  const pbr = (key) => {
    if (pbrCache.has(key)) return pbrCache.get(key);
    const t = PBR.tex(key);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map || null, normalMap: t.normalMap || null, roughnessMap: t.roughnessMap || null, aoMap: t.aoMap || null, roughness: 1, metalness: 0 });
    m.normalScale = new THREE.Vector2(0.8, 0.8);
    patchUber(m, 'interiors-uber-pbr-v1');
    pbrCache.set(key, m); return m;
  };
  MATS = { main, paint, glass, glow, sign, atlas, pbr };
  return MATS;
}

// per frame: sky light colour through windows follows the time of day
const _day = new THREE.Color(0.62, 0.68, 0.76), _dusk = new THREE.Color(0.8, 0.52, 0.36), _nite = new THREE.Color(0.035, 0.045, 0.08);
export function updateMaterials(dt, env) {
  if (!MATS) return;
  const night = env?.night?.value ?? 0;
  const sunY = env?.sunDir ? env.sunDir.y : 0.5;
  U.uNight.value = night; U.uTime.value += dt;
  const dusk = Math.max(0, 1 - Math.abs(sunY - 0.08) / 0.2) * (1 - night);
  U.uSkyCol.value.copy(_day).lerp(_dusk, dusk * 0.8).lerp(_nite, night);
  MATS.sign.color.setScalar(1.35 + night * 0.9);
}
