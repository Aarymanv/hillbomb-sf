// v2 landmark materials: the kit's shared materials get a world-space (triplanar) weathering pass so 200 m structures
// don't read as flat plastic: large-scale tone variation, fine grit, vertical rain streaks and roughness breakup.
// Applied once, only on the v2 map (enhanceV2Materials), so v1 renders exactly as before.
import * as THREE from 'three';
import { mats } from '../kit.js';

let NOISE = null;
function noiseTex() {
  if (NOISE || typeof document === 'undefined') return NOISE;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  // tileable value noise, 5 octaves (R), vertical streak noise (G), fine grit (B)
  const rnd = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 982451653) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y, p, s) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = rnd(i % p, j % p, s), b = rnd((i + 1) % p, j % p, s), cc = rnd(i % p, (j + 1) % p, s), d = rnd((i + 1) % p, (j + 1) % p, s);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { r += vn(x / N * f, y / N * f, f, o) * amp; amp *= 0.5; f *= 2; }
    const st = vn(x / N * 64, y / N * 4, 64, 7) * 0.7 + vn(x / N * 128, y / N * 8, 128, 8) * 0.3;
    const gr = rnd(x, y, 9);
    const k = (y * N + x) * 4;
    img.data[k] = r * 255; img.data[k + 1] = st * 255; img.data[k + 2] = gr * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  NOISE = new THREE.CanvasTexture(c);
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping; NOISE.colorSpace = THREE.NoColorSpace;
  NOISE.generateMipmaps = true; NOISE.minFilter = THREE.LinearMipmapLinearFilter; NOISE.anisotropy = 4;
  return NOISE;
}

// strength: 0 = off .. 1 = heavy grime. streak: vertical rain-streak darkening. Chains an existing onBeforeCompile.
export function weather(m, { strength = 0.5, streak = 0.5, key = 'w' } = {}) {
  const tex = noiseTex(); if (!tex || m.userData.weathered) return m;
  m.userData.weathered = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uWNoise = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uWNoise; varying vec3 vWPos; varying vec3 vWNrm;
vec4 triW(vec3 p, vec3 n, float sc) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return texture2D(uWNoise, p.zy * sc) * w.x + texture2D(uWNoise, p.xz * sc) * w.y + texture2D(uWNoise, p.xy * sc) * w.z;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 wn = normalize(vWNrm);
  float big = triW(vWPos, wn, 1.0 / 90.0).r, mid = triW(vWPos, wn, 1.0 / 14.0).r, grit = triW(vWPos, wn, 1.0 / 1.7).b;
  vec3 sp = abs(wn.x) > abs(wn.z) ? vec3(vWPos.z, vWPos.y, 0.0) : vec3(vWPos.x, vWPos.y, 0.0);
  float stk = texture2D(uWNoise, vec2(sp.x / 9.0, sp.y / 70.0)).g * (1.0 - abs(wn.y));
  float k = 1.0 + ${(strength * 0.34).toFixed(3)} * (big - 0.5) + ${(strength * 0.22).toFixed(3)} * (mid - 0.5) + ${(strength * 0.12).toFixed(3)} * (grit - 0.5);
  k -= ${(streak * 0.22).toFixed(3)} * smoothstep(0.45, 0.9, stk);
  diffuseColor.rgb *= clamp(k, 0.55, 1.25);
  vWRough = (mid - 0.5) * 0.25 + (grit - 0.5) * 0.12 + ${(streak * 0.15).toFixed(3)} * smoothstep(0.45, 0.9, stk);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vWRough, 0.04, 1.0);')
      .replace('void main() {', 'float vWRough = 0.0;\nvoid main() {');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|wx-' + key + strength + streak;
  m.needsUpdate = true;
  return m;
}

let done = false;
export function enhanceV2Materials() {
  if (done) return; done = true;
  const M = mats();
  weather(M.solid, { strength: 0.7, streak: 0.8, key: 'solid' });
  weather(M.paint, { strength: 0.45, streak: 0.35, key: 'paint' });
  weather(M.steel, { strength: 0.35, streak: 0.3, key: 'steel' });
}

// alpha-tested railing (vertical balusters + top / bottom rails) for long deck railings: one quad per span
let RAIL = null;
export function railTexture() {
  if (RAIL || typeof document === 'undefined') return RAIL;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 7); g.fillRect(0, 56, 64, 8);                // top + bottom rails
  for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 5, 0, 5, 64);     // balusters every 1/4 tile
  RAIL = new THREE.CanvasTexture(c); RAIL.wrapS = RepeatW(); RAIL.wrapT = THREE.ClampToEdgeWrapping; RAIL.anisotropy = 4;
  return RAIL;
}
function RepeatW() { return THREE.RepeatWrapping; }

// quad a-b-c-d (world/local points, counter-clockwise seen from the front) with uv u in [0, uLen], v in [0, 1]
export function quadUV(a, b, c, d, uLen = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uLen, 0, uLen, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
