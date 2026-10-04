// Car surface layers patched into the car materials (vehicle/models.js):
//   * wheel zone shading on the baked details material: the Blender tyre (tools/blender/cars.py tyre_mesh) and brake
//     rotor carry marker UVs (uv.y 2..3 road tyre, 6..7 off-road tyre, 4..5 rotor disc face) -> tyre normal/cavity map
//     (public/assets/cars/tyre.jpg, tools/blender/car_textures.py), drilled + turned rotor faces.
//   * paint: metallic flake, clear-coat orange peel, and dirt / edge wear driven by the per-car mask atlas
//     (<id>_ao.jpg: R = AO, G = convexity, B = grime; tools/blender/cars.py bake_masks) and a per-instance dirt level.
import * as THREE from 'three';

let _tyre = null;
/** shared tyre detail texture (normal xy + cavity); returns immediately, fills in when loaded */
export function tyreTexture(base) {
  if (_tyre) return _tyre;
  _tyre = new THREE.Texture();
  _tyre.wrapS = THREE.RepeatWrapping; _tyre.wrapT = THREE.ClampToEdgeWrapping;
  _tyre.colorSpace = THREE.NoColorSpace; _tyre.anisotropy = 8;
  if (typeof document !== 'undefined') {
    new THREE.ImageLoader().load(base + 'tyre.jpg', (img) => { _tyre.image = img; _tyre.needsUpdate = true; }, undefined, () => {});
  }
  return _tyre;
}
const HAS = () => !!(_tyre && _tyre.image);

// ------------------------------------------------------------------ shared GLSL
export const NOISE_GLSL = `
float hbH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hbVN3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hbH3(i), hbH3(i + vec3(1, 0, 0)), f.x), mix(hbH3(i + vec3(0, 1, 0)), hbH3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hbH3(i + vec3(0, 0, 1)), hbH3(i + vec3(1, 0, 1)), f.x), mix(hbH3(i + vec3(0, 1, 1)), hbH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// value noise + analytic gradient: (value, d/dx, d/dy, d/dz)
vec4 hbVN3d(vec3 x) {
  vec3 i = floor(x), f = fract(x), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hbH3(i), b = hbH3(i + vec3(1, 0, 0)), c = hbH3(i + vec3(0, 1, 0)), d = hbH3(i + vec3(1, 1, 0));
  float e = hbH3(i + vec3(0, 0, 1)), f1 = hbH3(i + vec3(1, 0, 1)), g = hbH3(i + vec3(0, 1, 1)), h = hbH3(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f1, k7 = -a + b + c - d + e - f1 - g + h;
  return vec4(a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
    du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
}
// derivative bump (three's perturbNormalArb): height h given per pixel, returns the bent normal
vec3 hbBump(vec3 pos, vec3 n, float h, float faceDir) {
  vec2 dH = vec2(dFdx(h), dFdy(h));
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - g);
}
`;

// ------------------------------------------------------------------ wheels (details material)
const WHEEL_PARS = `
uniform sampler2D uTyre;
float hbZone = 0.0; vec2 hbTuv = vec2(0.0); vec3 hbTy = vec3(0.5, 0.5, 1.0);
`;
// replaces <map_fragment>
const WHEEL_MAP = `
#ifdef USE_MAP
{
  vec2 u = vMapUv;
  hbZone = u.y > 5.9 ? 3.0 : u.y > 3.9 ? 2.0 : u.y > 1.9 ? 1.0 : 0.0;   // 1 road tyre, 2 rotor, 3 off-road tyre
  if (hbZone < 0.5) { vec4 sampledDiffuseColor = texture2D(map, u); diffuseColor *= sampledDiffuseColor; }
  else if (hbZone != 2.0) {
    float tv = clamp(u.y - (hbZone > 2.5 ? 6.0 : 2.0), 0.002, 0.998);
    hbTuv = vec2(u.x, (hbZone > 2.5 ? 0.5 : 0.0) + tv * 0.5);
    hbTy = texture2D(uTyre, hbTuv).rgb;
    float tread = step(0.32, tv) * step(tv, 0.68);
    // rubber: sidewalls a touch lighter and dusty (brake dust towards the bead), grooves dark
    vec3 rub = mix(vec3(0.056, 0.055, 0.053), vec3(0.04), tread);
    rub = mix(rub, vec3(0.07, 0.058, 0.048), (1.0 - tread) * (1.0 - smoothstep(0.0, 0.12, min(tv, 1.0 - tv))) * 0.8);
    // (color_fragment multiplies the vertex colour next: the baked tyre keeps a dark vertex colour for instanced parked cars)
    #ifdef USE_COLOR
    diffuseColor.rgb = rub * mix(0.35, 1.0, hbTy.b) / max(vColor.rgb, vec3(0.004));
    #else
    diffuseColor.rgb = rub * mix(0.35, 1.0, hbTy.b);
    #endif
  } else {
    hbTuv = u;
  }
}
#endif
`;
const WHEEL_ROUGH = `
if (hbZone > 0.5 && hbZone != 2.0) {
  float tv = hbTuv.y * 2.0 - (hbZone > 2.5 ? 1.0 : 0.0);
  float tread = step(0.32, tv) * step(tv, 0.68);
  roughnessFactor = mix(0.97, mix(0.86, 0.72, tread), hbTy.b); metalnessFactor = 0.0;
} else if (hbZone == 2.0) {
  // rotor: turned friction ring (fine concentric roughness), drilled holes, darker outer lip
  float r = clamp(hbTuv.y - 4.0, 0.0, 1.0), a = hbTuv.x;
  float lathe = 0.5 + 0.5 * sin(r * 520.0);
  roughnessFactor = mix(0.28, 0.46, lathe) + 0.2 * smoothstep(0.9, 1.0, r);
  metalnessFactor = 0.85;
  float row = floor(r * 3.0), fr = fract(r * 3.0);
  float ang = fract(a * 24.0 + row * 0.33);
  float hole = (1.0 - smoothstep(0.16, 0.24, length(vec2((ang - 0.5) * 1.35, (fr - 0.5) * 0.9)))) * step(0.1, r) * step(r, 0.92);
  diffuseColor.rgb *= mix(1.0, 0.06, hole) * mix(1.0, 0.7, smoothstep(0.93, 1.0, r));
  roughnessFactor = mix(roughnessFactor, 0.95, hole); metalnessFactor = mix(metalnessFactor, 0.0, hole);
}
`;
const WHEEL_NORMAL = `
if (hbZone > 0.5 && hbZone != 2.0) {
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 s0 = dFdx(hbTuv), s1 = dFdy(hbTuv);
  vec3 N = normal, q1p = cross(q1, N), q0p = cross(N, q0);
  vec3 T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y;
  float det = max(dot(T, T), dot(B, B)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec3 mN = vec3((hbTy.xy * 2.0 - 1.0) * 1.15, 1.0);
  normal = normalize(T * sc * mN.x + B * sc * mN.y + N * mN.z);
}
`;
/** patch a details-style shader (surf-driven roughness/metalness already replaced) with the wheel zones */
export function wheelOBC(sh, base) {
  sh.uniforms.uTyre = { value: tyreTexture(base) };
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + WHEEL_PARS)
    .replace('#include <map_fragment>', WHEEL_MAP)
    .replace('float roughnessFactor = vSurf.y;', 'float roughnessFactor = vSurf.y;')
    .replace('float metalnessFactor = vSurf.x;', 'float metalnessFactor = vSurf.x;\n' + WHEEL_ROUGH)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WHEEL_NORMAL);
}
export { HAS as tyreReady };

// ------------------------------------------------------------------ paint layers
export const PAINT_VERT_PARS = 'varying vec3 vHbP; varying vec3 vHbAx; varying vec3 vHbAy; varying vec3 vHbAz;';
export const PAINT_VERT = 'vHbP = position; vHbAx = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz); vHbAy = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vHbAz = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);';
export const PAINT_FRAG_PARS = `
varying vec3 vHbP; varying vec3 vHbAx; varying vec3 vHbAy; varying vec3 vHbAz;
uniform float uHbFlake; uniform float uHbDirt; uniform float uHbWear; uniform float uHbPeel; uniform vec3 uHbDirtCol;
float hbDirtK = 0.0, hbWearK = 0.0;
` + NOISE_GLSL;
// after <map_fragment>
export const PAINT_MAP = `
{
  #ifdef USE_AOMAP
  vec3 hbM = texture2D(aoMap, vAoMapUv).rgb;
  #else
  vec3 hbM = vec3(1.0, 0.5, clamp(0.55 - vHbP.y * 0.5, 0.0, 1.0));
  #endif
  // grime collects low, in recesses and behind the wheels; streaks run down (anisotropic noise). Noise only where grime /
  // wear can show (most of a clean car's pixels skip it)
  float g = hbM.b * 1.35 + smoothstep(0.75, 0.2, vHbP.y) * 0.35;
  float gw0 = uHbWear * smoothstep(0.66, 0.9, hbM.g);
  if (uHbDirt * g * 1.45 > 0.18 || gw0 > 0.0) {
    float n1 = hbVN3(vHbP * vec3(2.2, 7.0, 2.2)), n2 = hbVN3(vHbP * 11.0 + 3.1);
    hbDirtK = clamp(uHbDirt * g * (0.55 + 0.9 * n1) - 0.18 + 0.1 * n2, 0.0, 1.0);
    hbWearK = gw0 * step(0.55, n2);
    diffuseColor.rgb = mix(diffuseColor.rgb, uHbDirtCol * (0.8 + 0.4 * n2), hbDirtK * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62), hbWearK * 0.5);
  }
}
`;
export const PAINT_ROUGH = 'roughnessFactor = mix(roughnessFactor, 0.8, hbDirtK); roughnessFactor = mix(roughnessFactor, 0.6, hbWearK);';
export const PAINT_METAL = 'metalnessFactor = mix(metalnessFactor, 0.0, max(hbDirtK, hbWearK));';
export const PAINT_NORMAL = `
if (uHbFlake > 0.0) {
  // real flake is sub-pixel: a faint jitter everywhere plus a sparse set of bright, tilted flakes that only sparkle in
  // highlights, gone once a pixel covers several flakes (the old 0.3 rad jitter on every cell read as sandpaper)
  float fade = 1.0 - smoothstep(0.0004, 0.0022, length(fwidth(vHbP)));
  if (fade > 0.0) {
    vec3 cell = floor(vHbP * 700.0);
    vec3 j = vec3(hbH3(cell), hbH3(cell + 17.1), hbH3(cell + 41.7)) - 0.5;
    float sel = step(0.93, hbH3(cell + 5.3));
    normal = normalize(normal + j * uHbFlake * (0.05 + 0.3 * sel) * fade);
  }
}
`;
// after <clearcoat_normal_fragment_maps>: orange peel (a ~5 mm ripple in the lacquer) + a long, soft panel waviness in both
// normals. Analytic value-noise gradients in object space, turned into view space with the object axes (smooth, no
// derivative speckle); each band fades out before it can alias.
export const PAINT_PEEL = `
{
  float fw = length(fwidth(vHbP));
  float kW = 1.0 - smoothstep(0.006, 0.02, fw), kP = (1.0 - smoothstep(0.25, 0.9, fw * 190.0)) * uHbPeel;
  if (kW > 0.0) {
    vec3 gw = hbVN3d(vHbP * vec3(4.0, 7.0, 4.0) + 3.7).yzw * 0.0035 * kW;
    vec3 gp = kP > 0.0 ? hbVN3d(vHbP * 190.0).yzw * 0.006 * kP : vec3(0.0);
    vec3 gv = (gp.x + gw.x) * vHbAx + (gp.y + gw.y) * vHbAy + (gp.z + gw.z) * vHbAz;
    clearcoatNormal = normalize(clearcoatNormal - (gv - dot(gv, clearcoatNormal) * clearcoatNormal) * faceDirection);
    vec3 gb = gw.x * vHbAx + gw.y * vHbAy + gw.z * vHbAz;
    normal = normalize(normal - (gb - dot(gb, normal) * normal) * faceDirection);
  }
}
`;
export const PAINT_COAT = `
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - hbDirtK * 0.85 - hbWearK * 0.6;
material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.4, hbDirtK);
#endif
`;
export function paintUniforms(o = {}) {
  return {
    uHbFlake: { value: o.flake ?? 0.3 }, uHbDirt: { value: o.dirt ?? 0 }, uHbWear: { value: o.wear ?? 0 }, uHbPeel: { value: o.peel ?? 1 },
    uHbDirtCol: { value: new THREE.Color(o.dirtCol ?? 0x6e675c) },
  };
}
/** paint layers on a MeshPhysicalMaterial shader (U = paintUniforms()) */
export function paintLayersOBC(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + PAINT_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PAINT_VERT);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PAINT_FRAG_PARS)
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + PAINT_MAP)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + PAINT_ROUGH)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + PAINT_METAL)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PAINT_NORMAL)
    .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n' + PAINT_PEEL)
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + PAINT_COAT);
}

// ------------------------------------------------------------------ lamps: depth behind the lens
// Lenses were flat decals. Now a lens shows an interior one "lamp depth" behind it, found by marching the view ray
// (object space) into the housing: plain lenses get a procedural interior (chrome reflector cups + bulbs for head /
// reverse lamps, an LED dot matrix under ribbed red for tail / brake), atlas lamps (projector / tail graphics) get their
// artwork parallax-shifted to that depth. Chrome inside reflects the probe / sky: headlights sparkle, tails glow deep.
export function lampDepthOBC(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vHbP; varying vec3 vHbN; varying vec3 vHbCam; varying float vHbId;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vHbP = position; vHbN = normal; vHbId = lampId;
{ mat4 mw = modelMatrix;
  #ifdef USE_INSTANCING
  mw = mw * instanceMatrix;
  #endif
  vHbCam = (inverse(mw) * vec4(cameraPosition, 1.0)).xyz; }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vHbP; varying vec3 vHbN; varying vec3 vHbCam; varying float vHbId;
float hbLampMetal = 0.0, hbLampRough = -1.0, hbLampGlow = 1.0;
float hbLH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
    .replace('#include <map_fragment>', `
{
  vec3 N = normalize(vHbN), V = normalize(vHbCam - vHbP);
  float depth = 0.028, cosv = max(dot(V, N), 0.3);
  vec3 pin = vHbP - V * (depth / cosv);                         // where the view ray meets the housing's back
  vec3 an = abs(N);
  vec2 q = an.z > an.x && an.z > an.y ? pin.xy : an.x > an.y ? pin.zy : pin.xz;
  vec2 q0 = an.z > an.x && an.z > an.y ? vHbP.xy : an.x > an.y ? vHbP.zy : vHbP.xz;
  #ifdef USE_MAP
  bool plain = abs(vMapUv.x - ${(32 / 1024).toFixed(6)}) < 2e-4 && abs(vMapUv.y - ${(1 - 32 / 1024).toFixed(6)}) < 2e-4;
  #else
  bool plain = true;
  #endif
  int id = int(vHbId + 0.5);
  if (plain) {
    if (id == 2 || id == 3 || id == 5) {
      // tail / brake: LED dots on a dark red reflector, ribbed lens in front
      vec2 c = q / 0.016, f = fract(c) - 0.5;
      float led = 1.0 - smoothstep(0.12, 0.3, length(f));
      float rib = 0.5 + 0.5 * sin(q0.y * 900.0);
      diffuseColor.rgb *= mix(0.32, 1.25, led) * mix(0.85, 1.05, rib);
      hbLampGlow = mix(0.35, 2.2, led);
      hbLampMetal = 0.35 * (1.0 - led); hbLampRough = mix(0.3, 0.15, rib);
    } else if (id == 1 || id == 4 || id == 8 || id == 0) {
      // head / reverse / DRL: chrome reflector cups with a bulb in each
      vec2 c = q / 0.05, f = fract(c) - 0.5;
      float r = length(f);
      float cup = 1.0 - smoothstep(0.36, 0.47, r), bulb = 1.0 - smoothstep(0.06, 0.13, r);
      float ring = smoothstep(0.2, 0.3, r) * (1.0 - smoothstep(0.3, 0.36, r));
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.25, mix(vec3(0.82), diffuseColor.rgb, 0.35), cup) + ring * 0.08;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), bulb);
      hbLampGlow = mix(0.25, 1.0, cup) + bulb * 2.5;
      hbLampMetal = cup * (1.0 - bulb) * 0.92; hbLampRough = mix(0.35, 0.08, cup);
    } else if (id == 9) {
      // centre screen (cars pass 4): matte anti-glare film, not a mirror of the sky
      hbLampRough = 0.5;
    }
  } else {
    #ifdef USE_MAP
    // artwork lamps: shift the atlas lookup by the parallax (derivative frame of the uv on the lens)
    vec3 dpx = dFdx(vHbP), dpy = dFdy(vHbP); vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
    vec3 d3 = pin - vHbP;
    // solve d3 ~ dpx * a + dpy * b in the lens plane, then du = dux * a + duy * b
    float a11 = dot(dpx, dpx), a12 = dot(dpx, dpy), a22 = dot(dpy, dpy), b1 = dot(d3, dpx), b2 = dot(d3, dpy);
    float det = a11 * a22 - a12 * a12;
    vec2 ab = abs(det) > 1e-14 ? vec2(a22 * b1 - a12 * b2, a11 * b2 - a12 * b1) / det : vec2(0.0);
    vec2 duv = clamp(dux * ab.x + duy * ab.y, vec2(-0.004), vec2(0.004));
    vec4 sampledDiffuseColor = texture2D(map, vMapUv + duv);
    diffuseColor *= sampledDiffuseColor;
    float lum = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.5, 0.2));
    hbLampMetal = smoothstep(0.35, 0.75, lum) * 0.7; hbLampRough = mix(0.3, 0.1, hbLampMetal);
    if (id == 10) {
      // LED light bar (cars pass 4): an even, saturated red emitter strip with a hotter core line (the bar art is a
      // dark-edged gradient); the lit part reads continuous instead of a dim painted stripe
      float core = smoothstep(0.08, 0.6, lum * 2.2);
      diffuseColor.rgb = mix(vec3(0.05, 0.003, 0.003), vec3(1.0, 0.035, 0.025), core);
      hbLampGlow = mix(0.15, 1.0, core) + 0.35 * smoothstep(0.5, 0.9, lum * 2.2);
      hbLampMetal = 0.0; hbLampRough = 0.18;
    }
    #endif
  }
}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (hbLampRough >= 0.0) roughnessFactor = hbLampRough;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = max(metalnessFactor, hbLampMetal);')
    .replace('totalEmissiveRadiance += diffuseColor.rgb * vLampI;', 'totalEmissiveRadiance += diffuseColor.rgb * vLampI * hbLampGlow;');
}
