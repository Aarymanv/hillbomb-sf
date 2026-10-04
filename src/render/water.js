// HILLBOMB water: the Bay + the Pacific.
//  * planar reflection (reduced resolution, oblique near-plane clip at sea level, a cheap scene layer: sky, terrain,
//    decks, landmarks/bridges, buildings), skipped while no water pixel is visible (occlusion query on the water draw)
//  * multi-scale wind waves (GPU-generated tileable wave texture, 4-5 scrolling scales with deep-water speeds),
//    geometric reflection distortion (long vertical streaks at grazing angles), Fresnel, GGX sun/moon glint
//  * depth colour + transparency toward shores (transmittance through the water column, from the terrain heightfield)
//  * coast field computed once on the GPU from terrain data (never from a hard-coded coastline): distance to shore
//    (jump flood), open-ocean exposure (rays toward the Pacific swell), shoreward direction -> surf bands on exposed
//    beaches, a foam line everywhere, whitecaps in wind, rain rings
//  * state: calm (mirror) .. choppy driven by weather (setState / env.weather), frozen with the game clock (photo mode)
// API: createWater({ scene, env, heightField: { data, w, h, x0, z0, res }, heightAt?, bounds?, quality, reflect: [roots] })
//   -> { mesh, update(dt, { camera }), setState({ wind, windDir, rain, choppy }), addReflectable(obj), info, dispose }
import * as THREE from 'three';
import { HB_WET, HB_FOG, HB_NOISE_GLSL } from './fog.js';
import { PERF } from './perfflags.js';

export const REFLECT_LAYER = 5;
const SEA = 0; // sea level

// ---------------------------------------------------------------- GPU helpers
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function fsPass(renderer, material, target) {
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false; scene.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target); renderer.render(scene, cam); renderer.setRenderTarget(prev);
  quad.geometry.dispose();
}

// tileable wave texture: RG = slope (x, z), B = height, A = foam web (cellular). 512^2 RGBA8 with mipmaps.
function makeWaveTexture(renderer) {
  const S = 512;
  const rt = new THREE.WebGLRenderTarget(S, S, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: `varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453123); }
      vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      void main(){
        vec2 p = vUv; float h = 0.0; vec2 g = vec2(0.0); float norm = 0.0;
        for (int i = 0; i < 56; i++) {
          float fi = float(i);
          float km = 1.0 + floor(pow(hash(fi * 1.713 + 0.3), 1.7) * 18.0);
          float ang = (hash(fi * 3.117 + 1.1) - 0.5) * 2.4;
          vec2 k = floor(vec2(cos(ang), sin(ang)) * km + 0.5);
          if (k.x == 0.0 && k.y == 0.0) k = vec2(1.0, 0.0);
          float amp = pow(length(k), -1.35) * (0.5 + hash(fi * 5.31 + 2.7));
          float arg = 6.2831853 * dot(k, p) + hash(fi * 7.77 + 4.2) * 6.2831853;
          // slightly peaked (trochoid-ish) profile: sharper crests, flatter troughs
          float s = sin(arg), c = cos(arg);
          h += amp * (s + 0.18 * (1.0 - c * c));
          g += amp * (c + 0.36 * s * c) * 6.2831853 * k;
          norm += amp;
        }
        h /= norm; g /= norm * 6.2831853 * 3.0;
        // foam density field (tileable): fbm streaks + clusters of bubbles (cellular F1), thresholded in the water shader
        float fb = 0.0, fa = 0.5;
        for (int o = 0; o < 5; o++) {
          float P = 6.0 * pow(2.0, float(o));
          vec2 q = p * P; vec2 i0 = floor(q), fq = fract(q); fq = fq * fq * (3.0 - 2.0 * fq);
          float a = hash(dot(mod(i0, P), vec2(1.0, 157.0))), b = hash(dot(mod(i0 + vec2(1.0, 0.0), P), vec2(1.0, 157.0)));
          float c = hash(dot(mod(i0 + vec2(0.0, 1.0), P), vec2(1.0, 157.0))), d = hash(dot(mod(i0 + vec2(1.0, 1.0), P), vec2(1.0, 157.0)));
          fb += fa * mix(mix(a, b, fq.x), mix(c, d, fq.x), fq.y); fa *= 0.5;
        }
        // lace: thin cell borders (F2 - F1) of a jittered 18-cell grid, warped by the fbm
        vec2 q = p * 18.0 + (vec2(fb, fb * 1.3) - 0.5) * 1.2; vec2 ci = floor(q), cf = fract(q); float f1 = 9.0, f2 = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y)); vec2 cell = mod(ci + o, 18.0);
          vec2 r = o + hash2(cell) - cf; float d = dot(r, r);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        float web = 1.0 - smoothstep(0.0, 0.16, sqrt(f2) - sqrt(f1));
        float foamF = clamp(fb * 0.75 + web * 0.32 - 0.04, 0.0, 1.0);
        gl_FragColor = vec4(clamp(g * 0.5 + 0.5, 0.0, 1.0), h * 0.5 + 0.5, foamF);
      }`,
    depthTest: false, depthWrite: false,
  });
  fsPass(renderer, mat, rt);
  mat.dispose();
  return rt;
}

// heightfield -> half-float texture (downsampled so the long side <= 1536)
function makeHeightTexture(hf, heightAt, bounds) {
  let w, h, x0, z0, res, read;
  if (hf?.data) {
    const s = Math.max(1, Math.ceil(Math.max(hf.w, hf.h) / 1536));
    w = Math.ceil(hf.w / s); h = Math.ceil(hf.h / s); x0 = hf.x0; z0 = hf.z0; res = hf.res * s;
    read = (i, j) => hf.data[Math.min(hf.h - 1, j * s) * hf.w + Math.min(hf.w - 1, i * s)];
  } else {
    const B = bounds, span = Math.max(B.maxX - B.minX, B.maxZ - B.minZ);
    res = Math.max(8, span / 1536); x0 = B.minX; z0 = B.minZ;
    w = Math.ceil((B.maxX - B.minX) / res) + 1; h = Math.ceil((B.maxZ - B.minZ) / res) + 1;
    read = (i, j) => heightAt(x0 + i * res, z0 + j * res);
  }
  const data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = THREE.DataUtils.toHalfFloat(Math.max(-80, Math.min(120, read(i, j))));
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  // texel centres: uv = (x - x0 + res/2) / (w * res)
  return { tex, w, h, x0: x0 - res / 2, z0: z0 - res / 2, sx: w * res, sz: h * res, res };
}

// coast field: R = signed distance to the shore (m, > 0 over water, < 0 inland), G = open-ocean exposure 0..1 (land
// texels inherit it from the nearest water, so waves can run up the beach), BA = unit direction of increasing R
function makeCoastTexture(renderer, H) {
  const s = Math.max(1, Math.ceil(Math.max(H.w, H.h) / 1024));
  const w = Math.ceil(H.w / s), h = Math.ceil(H.h / s);
  const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
  const A = new THREE.WebGLRenderTarget(w, h, opts), Bt = new THREE.WebGLRenderTarget(w, h, opts);
  const common = { tHeight: { value: H.tex }, uSize: { value: new THREE.Vector2(w, h) } };
  const init = new THREE.ShaderMaterial({
    uniforms: common, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tHeight; uniform vec2 uSize; varying vec2 vUv;
      void main(){ vec2 p = floor(gl_FragCoord.xy); float hh = texture2D(tHeight, (p + 0.5) / uSize).r;
        // RG: nearest land seed (for water texels), BA: nearest water seed (for land texels)
        gl_FragColor = hh > 0.0 ? vec4(p, -1.0, -1.0) : vec4(-1.0, -1.0, p); }`,
  });
  fsPass(renderer, init, A);
  const jfa = new THREE.ShaderMaterial({
    uniforms: { ...common, tPrev: { value: null }, uStep: { value: 1 } }, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tPrev; uniform vec2 uSize; uniform float uStep; varying vec2 vUv;
      void main(){ vec2 p = floor(gl_FragCoord.xy); vec2 bL = vec2(-1.0), bW = vec2(-1.0); float dL = 1e20, dW = 1e20;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 q = p + vec2(float(x), float(y)) * uStep;
          if (q.x < 0.0 || q.y < 0.0 || q.x >= uSize.x || q.y >= uSize.y) continue;
          vec4 sd = texelFetch(tPrev, ivec2(q), 0);
          if (sd.x >= 0.0) { float d = dot(sd.xy - p, sd.xy - p); if (d < dL) { dL = d; bL = sd.xy; } }
          if (sd.z >= 0.0) { float d = dot(sd.zw - p, sd.zw - p); if (d < dW) { dW = d; bW = sd.zw; } }
        }
        gl_FragColor = vec4(bL, bW); }`,
  });
  let src = A, dst = Bt;
  for (let step = 1 << Math.ceil(Math.log2(Math.max(w, h))); step >= 1; step >>= 1) {
    jfa.uniforms.tPrev.value = src.texture; jfa.uniforms.uStep.value = step;
    fsPass(renderer, jfa, dst); [src, dst] = [dst, src];
  }
  const out = new THREE.WebGLRenderTarget(w, h, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const fin = new THREE.ShaderMaterial({
    uniforms: { ...common, tSeed: { value: src.texture }, uTexel: { value: H.res * s }, uWorld: { value: new THREE.Vector2(H.sx, H.sz) } },
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tSeed, tHeight; uniform vec2 uSize, uWorld; uniform float uTexel; varying vec2 vUv;
      void main(){
        vec2 p = floor(gl_FragCoord.xy); vec2 uv = (p + 0.5) / uSize;
        float hh = texture2D(tHeight, uv).r;
        vec4 seeds = texelFetch(tSeed, ivec2(p), 0);
        vec2 away; float dist;
        if (hh > 0.0) {
          // inland: distance (negative) to the nearest water, which also lends its exposure (evaluated there)
          if (seeds.z < 0.0) { gl_FragColor = vec4(-5000.0, 0.0, 0.0, 0.0); return; }
          away = seeds.zw - p; dist = -length(away) * uTexel;
          if (dist < -120.0) { gl_FragColor = vec4(dist, 0.0, 0.0, 0.0); return; }
          away = length(away) > 0.0 ? normalize(away) : vec2(0.0);
          uv = (seeds.zw + 0.5) / uSize;
        } else {
          vec2 sd = seeds.xy;
          away = sd.x < 0.0 ? vec2(0.0) : p - sd;
          dist = sd.x < 0.0 ? 5000.0 : length(away) * uTexel;
          away = length(away) > 0.0 ? normalize(away) : vec2(0.0);
        }
        // open-ocean exposure: rays toward the Pacific swell (from the WNW), free fetch up to ~6 km. A ray that leaves
        // the map through its west edge reaches the open Pacific; through another edge it only counts partly (the map
        // may simply end there)
        float ex = 0.0;
        for (int r = 0; r < 5; r++) {
          float a = 3.14159 + 0.39 + (float(r) - 2.0) * 0.38;
          vec2 dir = vec2(cos(a), sin(a));
          float free = 1.0;
          for (int k = 1; k <= 100; k++) {
            vec2 q = uv + dir * (float(k) * 60.0) / uWorld;
            if (q.x < 0.0) break;
            if (q.y < 0.0 || q.y > 1.0 || q.x > 1.0) { free = 0.25 + 0.5 * smoothstep(1500.0, 6000.0, float(k) * 60.0); break; }
            if (texture2D(tHeight, q).r > 0.0) { free = smoothstep(300.0, 5000.0, float(k) * 60.0); break; }
          }
          ex += free * (r == 2 ? 0.28 : r == 1 || r == 3 ? 0.22 : 0.14);
        }
        gl_FragColor = vec4(dist, ex, away);
      }`,
  });
  fsPass(renderer, fin, out);
  init.dispose(); jfa.dispose(); fin.dispose(); A.dispose(); Bt.dispose();
  return out;
}

// polar grid in the xz plane: `rings` rings (first spacing d0, growing by `grow` per ring), `segs` segments around
function polarGrid(rings, segs, d0, grow) {
  const R = [0]; let r = 0, d = d0;
  for (let i = 0; i < rings; i++) { r += d; d *= grow; R.push(r); }
  const pos = new Float32Array((1 + rings * segs) * 3);
  let k = 3;
  for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
    const a = (j + (i & 1) * 0.5) / segs * Math.PI * 2;
    pos[k++] = Math.cos(a) * R[i]; pos[k++] = 0; pos[k++] = Math.sin(a) * R[i];
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

// ---------------------------------------------------------------- material
// shared by the vertex (displacement) and fragment (normal, foam) stages: open-ocean swell + surf on exposed beaches.
// Crests march toward the shore along the coast field's distance-to-shore, shoal (grow) and break in the last ~110 m,
// then run up the beach as swash. Returns height (m); d = d(height)/d(shore distance); w = wave phase; brk = breaking.
const SURF_GLSL = `
uniform sampler2D tWave, tCoast, tHeight;
uniform vec4 uHXf;             // x0, z0, 1/sizeX, 1/sizeZ (heightfield + coast share the frame)
uniform float uTime, uSurf;
float surfWave(vec2 p, vec4 coast, float outside, out float d, out float w, out float brk) {
  d = 0.0; w = 0.5; brk = 0.0;
  float sk = smoothstep(0.55, 0.9, coast.g * uSurf) * (1.0 - outside);
  if (sk < 0.01) return 0.0;
  float shoreD = coast.r;
  float A = 0.35 + 0.75 * (1.0 - smoothstep(50.0, 420.0, shoreD));      // shoaling: bigger toward the break
  brk = 1.0 - smoothstep(25.0, 115.0, shoreD);
  A *= mix(1.0, 0.4, brk) * sk * smoothstep(-45.0, -4.0, shoreD);        // broken: lower whitewater; dies out inland
  float nz = texture(tWave, p / 190.0 + vec2(uTime * 0.004, 0.0)).b;     // sets and peaks along the beach
  float ph = shoreD / 34.0 + uTime / 8.5 + nz * 1.6;
  w = fract(ph);                                                         // 0 = crest, grows seaward (back of the wave)
  // steep shoreward face (w 0.85..1), long gentle back (w 0..0.85)
  float u = (w - 0.85) / 0.15;
  float prof = w > 0.85 ? u * u * (3.0 - 2.0 * u) : pow(1.0 - w / 0.85, 2.2);
  float dprof = w > 0.85 ? 6.0 * u * (1.0 - u) / 0.15 : -2.2 * pow(1.0 - w / 0.85, 1.2) / 0.85;
  d = A * dprof / 34.0;
  return A * (prof - 0.28);
}
`;
const WATER_VS = `
varying vec3 vW;
uniform vec3 uGrid;            // snapped camera x, z; displacement fade radius
${SURF_GLSL}
#include <fog_pars_vertex>
void main(){
  vec3 wp = vec3(position.x + uGrid.x, ${SEA.toFixed(1)}, position.z + uGrid.y);
  vec2 huv = (wp.xz - uHXf.xy) * uHXf.zw;
  vec2 outB = max(-huv, huv - 1.0);
  float outside = smoothstep(0.0, 0.01, max(outB.x, outB.y));
  vec4 coast = texture(tCoast, huv);
  float sd, sw, sb;
  float h = surfWave(wp.xz, coast, outside, sd, sw, sb);
  wp.y += h * (1.0 - smoothstep(uGrid.z * 0.5, uGrid.z, length(position.xz)));
  vW = wp;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
${SURF_GLSL}
uniform sampler2D tRefl, tSky;
uniform mat4 uReflMat; uniform float uReflOn;
uniform vec3 uGrid;
uniform float uWind, uChop, uRain, uSkyScale, uNight, uAbsorb;
uniform vec2 uWindDir;
uniform vec3 uSunDir, uSunCol, uAmb, uDeep, uShallow, uHorizon;
varying vec3 vW;
#include <fog_pars_fragment>
// the noise / ripple helpers live in the fog chunk, which is empty when this renders without scene fog (reflection
// and precompile passes): declare them here in that case
#ifndef USE_FOG
${HB_NOISE_GLSL}
#endif

vec3 skyDir(vec3 d){
  d.y = max(d.y, 0.0);
  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return texture2D(tSky, uv).rgb * uSkyScale;
}
// one wave layer: returns slope (x, z) in world units + height in w
vec3 layer(vec2 p, float L, vec2 dir, float t, float bias){
  float c = sqrt(9.81 * L / 6.2831853);              // deep-water phase speed
  vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x))) / L;
  vec4 a = texture2D(tWave, q - vec2(c * t / L, 0.0), bias);
  return vec3(a.rg * 2.0 - 1.0, a.b);
}
mat2 rot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
void main(){
  vec2 huv = (vW.xz - uHXf.xy) * uHXf.zw;
  float ground = texture2D(tHeight, huv).r;
  vec4 coast = texture2D(tCoast, huv);
  float depth = max(vW.y - ground, 0.0);
  float shoreD = coast.r, expo = coast.g * uSurf; vec2 away = coast.ba;
  // beyond the terrain data: open, deep water (no foam line where the heightfield simply ends)
  vec2 outB = max(-huv, huv - 1.0);
  float outside = smoothstep(0.0, 0.01, max(outB.x, outB.y));
  depth = mix(depth, 40.0, outside); shoreD = mix(shoreD, 5000.0, outside); expo *= 1.0 - outside * 0.5;
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;

  // ---------------- waves (world-space slope)
  vec2 wd = uWindDir, p = vW.xz;
  float t = uTime;
  float wind = uWind;
  float shelter = mix(0.55, 1.0, smoothstep(0.0, 6.0, depth));          // shallows are calmer
  float fade3 = 1.0 - smoothstep(80.0, 520.0, dist), fade4 = 1.0 - smoothstep(10.0, 70.0, dist);
  vec2 slope = vec2(0.0); float crest = 0.0;
  // Pacific swell (exposed water only), long and slow, from the WNW
  vec2 swellDir = normalize(vec2(0.92, 0.38));
  if (expo > 0.02) { vec3 s0 = layer(p, 110.0, swellDir, t, 0.0); slope += s0.xy * 0.20 * expo; crest += (s0.z - 0.5) * expo; }
  vec3 s1 = layer(p, 26.0, wd, t, 0.0);
  vec3 s1b = layer(p + 13.0, 21.0, rot(0.55) * wd, t, 0.0);
  vec3 s2 = layer(p, 7.3, rot(-0.35) * wd, t, 0.0);
  vec3 s2b = layer(p + 5.0, 5.1, rot(0.8) * wd, t, 0.0);
  float a1 = mix(0.035, 0.30, wind), a2 = mix(0.025, 0.22, wind) * (0.7 + 0.3 * uChop);
  slope += (s1.xy + s1b.xy) * 0.5 * a1 * shelter + (s2.xy + s2b.xy) * 0.5 * a2 * shelter;
  crest += ((s1.z + s1b.z) - 1.0) * wind;
#if WATER_TIER > 0
  vec3 s3 = layer(p, 1.9, rot(0.25) * wd, t, 0.0);
  vec3 s3b = layer(p + 2.0, 1.35, rot(-0.9) * wd, t, 0.0);
  slope += (s3.xy + s3b.xy) * 0.5 * mix(0.02, 0.16, max(wind, uRain * 0.5)) * fade3;
#endif
#if WATER_TIER > 1
  vec3 s4 = layer(p, 0.47, rot(1.2) * wd, t, 0.0);
  slope += s4.xy * mix(0.015, 0.09, max(wind, uRain * 0.6)) * fade4;
#endif
  // rain rings
  if (uRain > 0.01) slope += hbRipple(p, t, uRain) * uRain * 1.2 * (1.0 - smoothstep(15.0, 90.0, dist));

  // ---------------- surf on exposed beaches (same wave as the vertex displacement): face slope + whitewater
  float surfFoam = 0.0;
  float surfK = smoothstep(0.55, 0.9, expo);
  {
    float sd, sw, brk;
    float sh = surfWave(p, coast, outside, sd, sw, brk);
    float nearK = 1.0 - smoothstep(uGrid.z * 0.5, uGrid.z, dist);
    slope += away * sd * mix(0.35, 1.0, nearK);                         // the wave face tilts the surface
    float lip = smoothstep(0.9, 0.99, sw) * brk;                           // breaking lip on the steep face
    float trail = (1.0 - smoothstep(0.0, 0.5, sw)) * brk;                  // whitewater left behind the crest
    float zone = surfK * (1.0 - smoothstep(40.0, 320.0, shoreD));
    surfFoam = max(lip * 1.2, trail * 0.8) * zone;
    crest += sh * 0.8;
  }
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  // ---------------- foam: waterline + surf + whitecaps. Amounts 0..1 threshold a lacy bubble web (thin lace at low
  // amounts, solid white water at high amounts)
  vec4 fw = texture2D(tWave, p / 7.0 + vec2(t * 0.021, t * 0.013));
  vec4 fw2 = texture2D(tWave, p / 19.0 - vec2(t * 0.011, -t * 0.017));
  float cover = texture2D(tWave, p / 57.0 + vec2(t * 0.003, 0.0)).b;
  float lace = fw.a * 0.6 + fw2.a * 0.4 + (cover - 0.5) * 0.35;
  float amt = (1.0 - smoothstep(0.0, 0.08 + 0.1 * surfK, depth)) * 0.85;          // waterline
  amt = max(amt, (1.0 - smoothstep(3.0, 16.0, shoreD)) * 0.55 * surfK);            // swash on exposed beaches
  amt = max(amt, surfFoam);
  float caps = smoothstep(0.25, 0.9, crest * 0.8 + cover * 0.4) * smoothstep(0.55, 0.95, wind) * (0.5 + 0.5 * uChop);
  amt = max(amt, caps * 0.7 * smoothstep(1.0, 4.0, depth));
  float foam = smoothstep(0.95 - amt * 0.75, 1.05 - amt * 0.6, lace) * step(0.02, amt);
  foam *= 1.0 - smoothstep(900.0, 2600.0, dist) * 0.7;

  // ---------------- optics
  float NdV = max(dot(N, V), 1e-3);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N); R.y = max(R.y, 0.004); R = normalize(R);
  vec3 refl = skyDir(R);
#if WATER_TIER > 0
  if (uReflOn > 0.5) {
    vec4 rc = uReflMat * vec4(vW + R * 320.0, 1.0);
    vec2 ruv = rc.xy / rc.w;
    float inb = smoothstep(0.0, 0.03, ruv.x) * smoothstep(1.0, 0.97, ruv.x) * smoothstep(0.0, 0.03, ruv.y) * smoothstep(1.0, 0.97, ruv.y);
    vec4 pl = texture2D(tRefl, clamp(ruv, 0.001, 0.999));
    refl = mix(refl, pl.rgb, inb * pl.a);
  }
#endif
  // sun / moon glint (GGX, roughness widens with wind and distance -> a glitter path)
  vec3 L = normalize(uSunDir);
  vec3 Hh = normalize(L + V);
  float NdL = max(dot(N, L), 0.0), NdH = max(dot(N, Hh), 0.0);
  float rough = clamp(mix(0.045, 0.16, wind) + dist * 0.00003, 0.03, 0.35);
  float a2g = rough * rough * rough * rough;
  float dd = NdH * NdH * (a2g - 1.0) + 1.0;
  float D = a2g / (3.14159 * dd * dd);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  vec3 glint = uSunCol * min(D * Fh * NdL / (4.0 * max(NdL, NdV) + 1e-3), 60.0) * step(0.0, L.y);

  // water column: scattering colour by depth, transmittance to the seabed (see-through shallows)
  float cosT = sqrt(1.0 - (1.0 - NdV * NdV) / 1.77);
  float T = exp(-uAbsorb * depth / max(cosT, 0.3));
  vec3 body = mix(uShallow, uDeep, smoothstep(0.4, 10.0, depth));
  vec3 lightIn = uAmb + uSunCol * max(L.y, 0.0) * 0.22;
  // light through the back of wave crests when looking toward the sun
  float sss = pow(max(dot(V, -L), 0.0), 4.0) * max(crest + 0.3, 0.0) * 0.6;
  vec3 scatter = body * (lightIn + uSunCol * sss);

  vec3 col = refl * F + glint + (1.0 - F) * scatter * (1.0 - T);
  float alpha = 1.0 - (1.0 - F) * T;
  vec3 foamCol = vec3(0.86, 0.9, 0.9) * (uAmb * 1.3 + uSunCol * max(L.y, 0.0) * 0.75);
  col = mix(col, foamCol, foam);
  alpha = clamp(mix(alpha, 1.0, foam), 0.02, 1.0);
  gl_FragColor = vec4(col / alpha, alpha);
  #include <fog_fragment>
}`;

export function createWater({ scene, env, heightField = null, heightAt = null, bounds = null, quality = {}, reflect = [] }) {
  const renderer = env.renderer;
  const tier = quality.water ?? ({ low: 0, medium: 1, high: 2 }[quality.name] ?? 2);
  const scale = [0, 0.36, 0.5][tier];
  const H = makeHeightTexture(heightField, heightAt, bounds);
  const wave = makeWaveTexture(renderer);
  const coast = makeCoastTexture(renderer, H);

  // reflection target + mirrored camera
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const reflCam = new THREE.PerspectiveCamera();
  reflCam.layers.set(REFLECT_LAYER);
  reflCam.matrixAutoUpdate = true;
  const reflMat = new THREE.Matrix4();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    hbWet: { value: null }, hbFog: { value: null }, uGrid: { value: new THREE.Vector3(0, 0, 1400) },
    tWave: { value: null }, tCoast: { value: null }, tHeight: { value: null }, tRefl: { value: null }, tSky: { value: null },
    uReflMat: { value: null }, uReflOn: { value: 0 },
    uHXf: { value: new THREE.Vector4(H.x0, H.z0, 1 / H.sx, 1 / H.sz) },
    uTime: { value: 0 }, uWind: { value: 0.3 }, uChop: { value: 0 }, uRain: { value: 0 }, uSkyScale: { value: 1 }, uNight: { value: 0 },
    uAbsorb: { value: 0.9 }, uSurf: { value: 1 }, uWindDir: { value: new THREE.Vector2(0.94, 0.34) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color(0.012, 0.035, 0.04) }, uShallow: { value: new THREE.Color(0.05, 0.13, 0.11) }, uHorizon: { value: new THREE.Color() },
  }]);
  // shared references (not clones) for the textures / matrices we update
  uniforms.hbWet.value = HB_WET; uniforms.hbFog.value = HB_FOG;
  uniforms.tWave.value = wave.texture; uniforms.tCoast.value = coast.texture; uniforms.tHeight.value = H.tex; uniforms.tRefl.value = rt.texture; uniforms.uReflMat.value = reflMat;
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true, transparent: true, depthWrite: true,
    defines: { WATER_TIER: tier },
  });
  // camera-centred polar grid: ~0.7 m rings near the camera growing 5% per ring out past the horizon, so surf and swell
  // displace real geometry (and run up the beach) while the far field stays cheap
  const geo = polarGrid(tier >= 2 ? 176 : tier >= 1 ? 150 : 110, tier >= 2 ? 192 : tier >= 1 ? 144 : 96, 0.7, 1.05);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  const B = bounds || { minX: H.x0, maxX: H.x0 + H.sx, minZ: H.z0, maxZ: H.z0 + H.sz };
  env.setWorldBounds?.(B);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = -1;            // first of the transparent list (after every opaque -> occlusion query is meaningful)
  mesh.userData.uTime = uniforms.uTime; // legacy
  scene.add(mesh);

  // ---------------------------------------------------------------- occlusion query: is any water pixel visible?
  const gl = renderer.getContext();
  let mainCamera = null, query = null, queryPending = false, lastVisible = 0, frameNo = 0, queryAt = 0;
  mesh.onBeforeRender = (r, s, cam) => {
    if (cam !== mainCamera || queryPending || !gl.createQuery) return;
    query = query || gl.createQuery();
    gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, query); queryPending = 'open'; queryAt = frameNo;
  };
  mesh.onAfterRender = () => { if (queryPending === 'open') { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); queryPending = true; } };
  function pollQuery() {
    if (queryPending !== true) return;
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { if (frameNo - queryAt > 3) lastVisible = frameNo; return; }  // slow GPU: assume visible
    if (gl.getQueryParameter(query, gl.QUERY_RESULT)) lastVisible = frameNo;
    queryPending = false;
  }

  // ---------------------------------------------------------------- reflection scene layer
  const roots = [...reflect];
  const lightsSeen = new Set();
  function tagReflectables() {
    for (const root of roots) {
      if (!root) continue;
      root.traverse(o => {
        if (o.userData.noReflect) return;
        const n = o.name || '';
        if (root.name === 'city' && o.isMesh && !(n === 'terrain' || n === 'decks')) return;
        if (tier < 2 && root.name === 'buildings' && o.isMesh && n !== 'bld-far' && n !== 'bld-beacons') return;
        o.layers.enable(REFLECT_LAYER);
      });
    }
    // every light must be visible to the reflection camera too (same light set -> same shader programs)
    scene.traverse(o => { if (o.isLight && !lightsSeen.has(o)) { o.layers.enable(REFLECT_LAYER); lightsSeen.add(o); } });
    env.sky?.mesh?.layers.enable(REFLECT_LAYER);
  }
  let tagTimer = 0;

  // ---------------------------------------------------------------- state (weather-driven)
  const state = { wind: 0.3, rain: 0, chop: 0, windDir: new THREE.Vector2(0.94, 0.34) };
  function setState(s) {
    if (s.wind !== undefined) state.wind = s.wind;
    if (s.rain !== undefined) state.rain = s.rain;
    if (s.choppy !== undefined) state.chop = s.choppy;
    if (s.windDir) state.windDir.copy(s.windDir).normalize();
  }

  const clipPlane = new THREE.Vector4(), q = new THREE.Vector4(), plane = new THREE.Plane();
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), size = new THREE.Vector2(), _cc = new THREE.Color(), _amb = new THREE.Color();
  const info = { reflect: 0, reflectMs: 0, visible: true, tier };
  function renderReflection(camera) {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(4, Math.round(size.x * scale)), h = Math.max(4, Math.round(size.y * scale));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    camera.updateMatrixWorld();
    // mirror about y = SEA
    _p.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(_d);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    reflCam.position.set(_p.x, 2 * SEA - _p.y, _p.z);
    _t.copy(_p).add(_d); _t.y = 2 * SEA - _t.y;
    reflCam.up.set(_u.x, -_u.y, _u.z);
    reflCam.lookAt(_t);
    reflCam.near = camera.near; reflCam.far = Math.min(camera.far, 12000);
    reflCam.fov = camera.fov; reflCam.aspect = camera.aspect; reflCam.zoom = camera.zoom;
    reflCam.updateProjectionMatrix();
    reflCam.updateMatrixWorld();
    reflMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    // oblique near plane = the water plane (clip everything below it)
    plane.set(_u.set(0, 1, 0), -SEA - 0.05);
    plane.applyMatrix4(reflCam.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pe = reflCam.projectionMatrix.elements;
    q.x = (Math.sign(clipPlane.x) + pe[8]) / pe[0]; q.y = (Math.sign(clipPlane.y) + pe[9]) / pe[5]; q.z = -1; q.w = (1 + pe[10]) / pe[14];
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    pe[2] = clipPlane.x; pe[6] = clipPlane.y; pe[10] = clipPlane.z + 1; pe[14] = clipPlane.w;
    reflCam.projectionMatrixInverse.copy(reflCam.projectionMatrix).invert();

    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate, prevAutoClear = renderer.autoClear;
    const fog = scene.fog;
    renderer.shadowMap.autoUpdate = false;
    fog?.setMirror?.(true);
    renderer.getClearColor(_cc); const prevAlpha = renderer.getClearAlpha();
    // world matrices are refreshed by the main render (a full scene.updateMatrixWorld costs ~1.5 ms); the reflected
    // layer is static geometry, so last frame's matrices are exact
    const prevMW = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = frameNo < 3;
    renderer.setRenderTarget(rt); renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, reflCam);
    scene.matrixWorldAutoUpdate = prevMW;
    fog?.setMirror?.(false);
    renderer.setClearColor(_cc, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadow; renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevRT);
    info.reflect++;
  }

  const sunDir = new THREE.Vector3();
  const NEAR_WATER = 320;
  let nearT = 0, nearWater = true, lastRefl = -9;
  function waterWithin(p, R) {
    for (const r of [25, 60, 110, 170, 240, R]) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      if (heightAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) < SEA + 0.4) return true;
    }
    return false;
  }
  function update(dt, envInfo = {}) {
    const camera = envInfo.camera;
    frameNo++;
    uniforms.uTime.value = env.time ?? (uniforms.uTime.value + dt);
    // lighting from the environment
    const sun = env.sun;
    if (sun) {
      sunDir.copy(sun.position).sub(sun.target.position).normalize();
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    }
    const hemi = env.hemi;
    if (hemi) uniforms.uAmb.value.copy(hemi.color).multiplyScalar(0.55).add(_amb.copy(hemi.groundColor).multiplyScalar(0.25));
    const su = env.sky?.uniforms;
    if (su) { uniforms.tSky.value = su.uHdr.value; uniforms.uSkyScale.value = su.uHdrMix.value > 0 ? su.uHdrScale.value : 1; uniforms.uNight.value = su.uNight.value; }
    // weather
    const W = env.weather;
    if (W) setState({ wind: W.wind, rain: W.rain, choppy: W.choppy ?? 0 });
    uniforms.uWind.value += (state.wind - uniforms.uWind.value) * Math.min(1, dt * 0.5);
    uniforms.uRain.value = state.rain; uniforms.uChop.value = state.chop;
    uniforms.uWindDir.value.copy(state.windDir);
    if (!camera) return;
    mainCamera = camera;
    uniforms.uGrid.value.set(Math.round(camera.position.x / 2) * 2, Math.round(camera.position.z / 2) * 2, 1400);
    tagTimer -= dt;
    if (tagTimer <= 0) { tagTimer = 1.0; tagReflectables(); }
    pollQuery();
    info.visible = frameNo - lastVisible < 45 || frameNo < 60;
    const t0 = performance.now();
    const want = tier > 0 && info.visible && camera.position.y > SEA + 0.25 && env.state?.reflections !== false;
    // (perf 10/4) water far from the camera (none within NEAR_WATER m: a few heightAt rings twice a second) re-renders its
    // mirror every 3rd frame (2.5-4 ms CPU + 4-5.5 ms GPU per render, Chinatown / FiDi see a sliver of the bay down the
    // streets). The mirror is sampled through the matrix it was rendered with, so a skipped frame shows the same world
    // positions, 1-2 frames old. ?nowaterthrottle = every frame.
    if (want) {
      nearT -= dt;
      if (nearT <= 0 && heightAt) { nearT = 0.5; nearWater = waterWithin(camera.position, NEAR_WATER); }
      if (!PERF.waterthrottle || nearWater || frameNo - lastRefl >= 3 || !uniforms.uReflOn.value) { renderReflection(camera); lastRefl = frameNo; }
      uniforms.uReflOn.value = 1;
    }
    else uniforms.uReflOn.value = 0;
    info.reflectMs = performance.now() - t0;
  }
  function addReflectable(o) { roots.push(o); tagTimer = 0; }
  function dispose() { scene.remove(mesh); rt.dispose(); wave.dispose(); coast.dispose(); H.tex.dispose(); mat.dispose(); }
  const api = { mesh, update, setState, addReflectable, info, dispose, reflectTarget: rt, coast: coast.texture, height: H, uniforms };
  env.water = api;
  return api;
}
