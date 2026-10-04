// HILLBOMB realistic humans: Microsoft Rocketbox avatars (MIT) for pedestrians and the player on foot.
// Assets: public/assets/peds (tools/blender/peds/*): <id>.glb (LOD0 source mesh ~7-10k tris, LOD1 ~3.5k, LOD2 ~1.5k,
// skinned to one shared 34-bone biped, game space: +X right, +Y up, -Z forward, feet at y = 0), <id>_alb (2048x1024
// atlas, BC3 .dds via texpack: albedo + per-region alpha), <id>_nrm (1024x512 DXT5nm), clips.bin/json (97 Rocketbox
// mocap clips: walk/run cycles phase-aligned + in place, idles, phone, talk/listen, photo, wave, sit, umbrella...).
//
// Runtime (no AnimationMixer, no bone Object3Ds): every human samples / blends clips into a compact pose
// (pelvis pos + 34 local quaternions), runs its own FK and writes skeleton.boneMatrices directly (one 12x12 float
// texture upload when it changed). Geometry + textures are shared per avatar; each human only owns a material clone
// (clothing tint uniform) and its bone texture. States without a mocap clip (drive, knocked, getup, jump, fall, land,
// enter/exit car) run the procedural animator of src/player/human.js on a headless rig and are retargeted.
// API = the procedural human's API (root, mesh, height, scale, look, seatHipY, state, update(dt, s), setVisible, dispose)
// plus s.gesture ('talk'|'listen'|'photo'|'look'), s.lookYaw/s.lookW (head turn), s.lean/s.leanSide (spine), s.umbrella.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { packedUrl, loadPacked } from '../../world/texpack.js';
import { Ragdoll } from './ragdoll.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/peds/';
const OFF = typeof location !== 'undefined' && /[?&]peds=(v1|proc|0)/.test(location.search);
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------------------------------------- shared data
let IDX = null, LIB = null, NB = 34, PAR = null, BN = null, loading = null, failed = OFF;
const AV = new Map();          // id -> avatar record (geometry, textures, rest pose) once loaded
let procFactory = null, procHuman = null;   // from src/player/human.js (injected, avoids an import cycle)
export function setProcFactory(rig, human) { procFactory = rig; procHuman = human; }
export const realAvailable = () => !failed;

function rng(seed) {
  let a = (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function loadLib() {
  if (loading) return loading;
  loading = (async () => {
    const [idx, cj, cb] = await Promise.all([
      fetch(BASE + 'index.json').then(r => { if (!r.ok) throw new Error('index ' + r.status); return r.json(); }),
      fetch(BASE + 'clips.json').then(r => r.json()),
      fetch(BASE + 'clips.bin').then(r => r.arrayBuffer()),
    ]);
    NB = cj.bones.length; PAR = cj.parents; BN = {};
    cj.bones.forEach((n, i) => { BN[n.replace('Bip01 ', '').replace(/ /g, '')] = i; });
    const i16 = new Int16Array(cb), S = cj.stride, lib = {};
    for (const name in cj.clips) {
      const c = cj.clips[name], n = c.frames, o = c.off >> 1, d = new Float32Array(n * S);
      for (let k = 0; k < n * S; k++) d[k] = i16[o + k];
      for (let k = 0; k < n; k++) {
        const b = k * S; d[b] /= 1000; d[b + 1] /= 1000; d[b + 2] /= 1000;
        for (let j = 3; j < S; j++) d[b + j] /= 32767;
      }
      let my = 0; for (let k = 0; k < n; k++) my += d[k * S + 1]; my /= n;
      lib[name] = { name, g: c.g, fps: c.fps, n, dur: n / c.fps, loop: c.loop && c.speed !== undefined, speed: c.speed || 0,
        phase0: c.phase0 || 0, stride: (c.speed || 0) * (n / c.fps), d, S, hip0: cj.hip0[c.g], meanY: my, turn: c.turn || 0 };
    }
    LIB = lib; IDX = idx;
  })().catch(e => { console.warn('[peds] realistic humans unavailable, procedural fallback', e); failed = true; throw e; });
  return loading;
}
if (!OFF) loadLib().catch(() => {});

function clipFor(key, g) { return LIB[g + '_' + key] || LIB[(g === 'f' ? 'm' : 'f') + '_' + key] || null; }

// texture: BC3 .dds when the GPU has S3TC (tools/texpack.py), else the webp / png (glTF uv: flipY false)
function tex(url, srgb) {
  if (packedUrl(url)) { const t = loadPacked(url, { srgb, anisotropy: 4 }); return t.userData.ready.then(r => r || plain(url, srgb)); }
  return plain(url, srgb);
}
function plain(url, srgb) {
  return new THREE.TextureLoader().loadAsync(url).then(t => {
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t;
  });
}

const gltfLoader = new GLTFLoader();
function loadAvatar(id) {
  let a = AV.get(id);
  if (a) return a.promise;
  a = { id, ready: false };
  AV.set(id, a);
  a.promise = (async () => {
    const info = IDX.avatars.find(x => x.id === id);
    // retried: under load (boot streams hundreds of requests) Chrome can drop fetches with net errors
    const retry = async (f) => { for (let k = 0; ; k++) { try { return await f(); } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 800 * (k + 1))); } } };
    const [g, alb, nrm] = await Promise.all([retry(() => gltfLoader.loadAsync(BASE + id + '.glb')), retry(() => tex(BASE + id + '_alb.webp', true)), retry(() => tex(BASE + id + '_nrm.png', false))]);
    const lods = [];
    let skel = null;
    g.scene.traverse(o => { if (o.isSkinnedMesh) { lods[+o.name.replace(/\D/g, '') || 0] = o.geometry; skel = o.skeleton; if (o.material) o.material.dispose(); } });
    const T = new Float32Array(NB * 3), R = new Float32Array(NB * 4), IB = new Float32Array(NB * 16);
    for (let i = 0; i < NB; i++) {
      const b = skel.bones[i];
      T[i * 3] = b.position.x; T[i * 3 + 1] = b.position.y; T[i * 3 + 2] = b.position.z;
      R[i * 4] = b.quaternion.x; R[i * 4 + 1] = b.quaternion.y; R[i * 4 + 2] = b.quaternion.z; R[i * 4 + 3] = b.quaternion.w;
      IB.set(skel.boneInverses[i].elements, i * 16);
    }
    for (const geo of lods) { geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.45); }
    Object.assign(a, { info, lods, T, R, IB, alb, nrm, hip: info.hip, h: info.h, g: info.g, ready: true });
    a.align = restAlignment(a);
    return a;
  })().catch(e => { console.warn('[peds] avatar', id, e); a.failed = true; return null; });
  return a.promise;
}

// ---------------------------------------------------------------------------------------------- material
const PED_FRAG_PARS = /* glsl */`
uniform vec4 pedTint;      // x hue shift (rad), y saturation, z value, w amount
float pedSkin;
float pedRough;
vec3 pedHue(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
vec3 pedNrm(vec4 t) { vec2 xy = vec2(t.a, t.g) * 2.0 - 1.0; return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
`;
const PED_MAP = /* glsl */`
{
  // atlas regions (glTF uv, origin top-left): body u<.5 | head .5-.75 top | hair .75-1 top | extra .5-.75 bottom
  vec2 ru = vMapUv;
  float a = sampledDiffuseColor.a;
  pedSkin = 0.0; pedRough = 0.7;
  if (ru.x < 0.5) {
    vec3 c = diffuseColor.rgb;
    vec3 t = pedHue(c, pedTint.x);
    float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
    t = max(mix(vec3(l), t, pedTint.y) * pedTint.z, 0.0);
    diffuseColor.rgb = mix(c, t, a * pedTint.w);
    pedSkin = 1.0 - smoothstep(0.25, 0.75, a);
    pedRough = mix(0.52, 0.86, a);
  } else if (ru.y < 0.5 && ru.x < 0.75) {
    pedSkin = 1.0; pedRough = mix(0.72, 0.3, smoothstep(0.1, 0.8, a));
  } else {
    if (a < 0.45) discard;
    pedRough = ru.y < 0.5 ? 0.62 : 0.35;
  }
  diffuseColor.a = 1.0;
}`;
function wrapLights(src) {
  const line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  if (!src.includes(line)) return src;
  // skin: wrapped diffuse + a warm terminator (cheap subsurface look); cloth unchanged
  return src.replace(line, `{
    float pnl = dot( geometryNormal, directLight.direction );
    float pw = 0.4 * pedSkin;
    float pwrap = saturate( ( pnl + pw ) / ( 1.0 + pw ) );
    vec3 psss = vec3( 0.36, 0.11, 0.05 ) * pedSkin * max( pwrap - saturate( pnl ), 0.0 );
    reflectedLight.directDiffuse += ( pwrap + psss ) * directLight.color * BRDF_Lambert( material.diffuseColor );
  }`);
}
function pedOnBeforeCompile(sh) {
  sh.uniforms.pedTint = this.userData.tint;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PED_FRAG_PARS)
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + PED_MAP)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = pedRough;')
    .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0', 'pedNrm( texture2D( normalMap, vNormalMapUv ) )'))
    .replace('#include <lights_physical_pars_fragment>', wrapLights(THREE.ShaderChunk.lights_physical_pars_fragment));
}
function makeMaterial(av, tint) {
  const m = new THREE.MeshStandardMaterial({ map: av.alb, normalMap: av.nrm, roughness: 0.7, metalness: 0 });
  m.name = 'ped_' + av.id;
  m.userData.tint = { value: tint };
  m.onBeforeCompile = pedOnBeforeCompile;
  m.customProgramCacheKey = () => 'ped-real-v1';
  return m;
}

// ---------------------------------------------------------------------------------------------- pose math
// pose layout: [px, py, pz, q0x, q0y, q0z, q0w, q1x, ...] (pelvis position in avatar units, local quaternions)
const PS = () => new Float32Array(3 + 34 * 4);

/** accumulate w * clip(t) into out (sign-aligned quaternions). hs = pelvis scale (avatar hip / clip hip). */
function sampleInto(c, t, out, w, first, hs) {
  const n = c.n, S = c.S, d = c.d;
  let f = t * c.fps, i0 = Math.floor(f), a = f - i0, i1;
  if (c.loop) { i0 %= n; if (i0 < 0) i0 += n; i1 = (i0 + 1) % n; }
  else if (i0 >= n - 1) { i0 = i1 = n - 1; a = 0; } else if (i0 < 0) { i0 = i1 = 0; a = 0; } else i1 = i0 + 1;
  const A = i0 * S, B = i1 * S;
  for (let j = 0; j < 3; j++) { const v = (d[A + j] + (d[B + j] - d[A + j]) * a) * hs * w; out[j] = first ? v : out[j] + v; }
  for (let b = 0, j = 3; b < NB; b++, j += 4) {
    let x0 = d[A + j], y0 = d[A + j + 1], z0 = d[A + j + 2], w0 = d[A + j + 3];
    let x1 = d[B + j], y1 = d[B + j + 1], z1 = d[B + j + 2], w1 = d[B + j + 3];
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    let x = x0 + (x1 - x0) * a, y = y0 + (y1 - y0) * a, z = z0 + (z1 - z0) * a, ww = w0 + (w1 - w0) * a;
    if (first) { out[j] = x * w; out[j + 1] = y * w; out[j + 2] = z * w; out[j + 3] = ww * w; }
    else {
      const s = out[j] * x + out[j + 1] * y + out[j + 2] * z + out[j + 3] * ww < 0 ? -w : w;
      out[j] += x * s; out[j + 1] += y * s; out[j + 2] += z * s; out[j + 3] += ww * s;
    }
  }
}
function normPose(p) {
  for (let j = 3; j < p.length; j += 4) {
    const l = Math.hypot(p[j], p[j + 1], p[j + 2], p[j + 3]) || 1;
    p[j] /= l; p[j + 1] /= l; p[j + 2] /= l; p[j + 3] /= l;
  }
}
/** out = nlerp(a, b, t) for bones where mask[b] (all when mask null); positions too when mask null */
function blendPose(out, a, b, t, mask = null) {
  if (!mask) for (let j = 0; j < 3; j++) out[j] = a[j] + (b[j] - a[j]) * t;
  else for (let j = 0; j < 3; j++) out[j] = a[j];
  for (let k = 0, j = 3; k < NB; k++, j += 4) {
    const tt = mask ? t * mask[k] : t;
    if (tt <= 0) { out[j] = a[j]; out[j + 1] = a[j + 1]; out[j + 2] = a[j + 2]; out[j + 3] = a[j + 3]; continue; }
    const s = a[j] * b[j] + a[j + 1] * b[j + 1] + a[j + 2] * b[j + 2] + a[j + 3] * b[j + 3] < 0 ? -1 : 1;
    let x = a[j] + (s * b[j] - a[j]) * tt, y = a[j + 1] + (s * b[j + 1] - a[j + 1]) * tt, z = a[j + 2] + (s * b[j + 2] - a[j + 2]) * tt, w = a[j + 3] + (s * b[j + 3] - a[j + 3]) * tt;
    const l = Math.hypot(x, y, z, w) || 1;
    out[j] = x / l; out[j + 1] = y / l; out[j + 2] = z / l; out[j + 3] = w / l;
  }
  return out;
}
// quaternion helpers on arrays
function qmul(ax, ay, az, aw, bx, by, bz, bw, o, k) {
  o[k] = aw * bx + ax * bw + ay * bz - az * by;
  o[k + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[k + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[k + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

// upper-body mask (phone / umbrella / photo while walking)
let UPPER = null;
function upperMask() {
  if (UPPER) return UPPER;
  UPPER = new Float32Array(NB);
  for (const [n, i] of Object.entries(BN)) {
    if (/Spine1/.test(n)) UPPER[i] = 0.35; else if (/Spine2/.test(n)) UPPER[i] = 0.6;
    else if (/Neck|Head|Clavicle|UpperArm|Forearm|Hand|Finger/.test(n)) UPPER[i] = 1;
  }
  return UPPER;
}
let UMB_ARM = null;
function umbArmMask() {
  if (UMB_ARM) return UMB_ARM;
  UMB_ARM = new Float32Array(NB);
  for (const [n, i] of Object.entries(BN)) if (/^L(Clavicle|UpperArm|Forearm|Hand|Finger)/.test(n)) UMB_ARM[i] = 1;   // the umbrella arm (left)
  return UMB_ARM;
}

// ---------------------------------------------------------------------------------------------- procedural retarget
// procedural rig bone -> realistic bone; world rotation of the real bone = Qproc_world * A (A = rest alignment)
const PROC_MAP = [['hips', 'Pelvis'], ['spine', 'Spine'], ['chest', 'Spine2'], ['neck', 'Neck'], ['head', 'Head'],
  ['upperArm_L', 'LUpperArm'], ['lowerArm_L', 'LForearm'], ['hand_L', 'LHand'], ['upperArm_R', 'RUpperArm'], ['lowerArm_R', 'RForearm'], ['hand_R', 'RHand'],
  ['upperLeg_L', 'LThigh'], ['lowerLeg_L', 'LCalf'], ['foot_L', 'LFoot'], ['upperLeg_R', 'RThigh'], ['lowerLeg_R', 'RCalf'], ['foot_R', 'RFoot']];
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();
function restWorld(a) {
  const WQ = new Float32Array(NB * 4), WP = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const p = PAR[i];
    if (p < 0) { WQ.set(a.R.subarray(i * 4, i * 4 + 4), i * 4); WP.set(a.T.subarray(i * 3, i * 3 + 3), i * 3); continue; }
    _qa.fromArray(WQ, p * 4); _qb.fromArray(a.R, i * 4); _qa.multiply(_qb); _qa.toArray(WQ, i * 4);
    _va.fromArray(a.T, i * 3).applyQuaternion(_qb.fromArray(WQ, p * 4)); _va.x += WP[p * 3]; _va.y += WP[p * 3 + 1]; _va.z += WP[p * 3 + 2]; _va.toArray(WP, i * 3);
  }
  return { WQ, WP };
}
function restAlignment(a) {
  const { WQ, WP } = restWorld(a);
  const A = new Float32Array(NB * 4);
  const corr = {};
  const dirCorr = (b, c, target) => {
    _va.set(WP[c * 3] - WP[b * 3], WP[c * 3 + 1] - WP[b * 3 + 1], WP[c * 3 + 2] - WP[b * 3 + 2]).normalize();
    return new THREE.Quaternion().setFromUnitVectors(_va, target);
  };
  const down = new THREE.Vector3(0, -1, 0);
  for (const s of ['L', 'R']) {
    corr[s + 'UpperArm'] = dirCorr(BN[s + 'UpperArm'], BN[s + 'Forearm'], down);
    corr[s + 'Forearm'] = dirCorr(BN[s + 'Forearm'], BN[s + 'Hand'], down);
    corr[s + 'Hand'] = corr[s + 'Forearm'];
    corr[s + 'Thigh'] = dirCorr(BN[s + 'Thigh'], BN[s + 'Calf'], down);
    corr[s + 'Calf'] = dirCorr(BN[s + 'Calf'], BN[s + 'Foot'], down);
    corr[s + 'Foot'] = new THREE.Quaternion();
  }
  for (let i = 0; i < NB; i++) {
    const n = Object.keys(BN).find(k => BN[k] === i);
    _qa.fromArray(WQ, i * 4);
    if (corr[n]) _qa.premultiply(corr[n]);
    _qa.toArray(A, i * 4);
  }
  return { A, WQ, WP };
}

// ---------------------------------------------------------------------------------------------- avatar choice
const STYLE_TAG = { generic: 'generic', business: 'business', tourist: 'tourist', jogger: 'jogger' };
let workingSet = null;
function pickAvatar(style, g, r) {
  const tag = STYLE_TAG[style] || 'generic';
  if (!workingSet) {
    // quality: fewer distinct avatars resident = less VRAM (~3.6 MB each: BC3 atlas + normal atlas + 3 LODs)
    const q = (typeof location !== 'undefined' && /[?&]q=(low|medium)/.exec(location.search)?.[1]) || 'high';
    const cap = q === 'low' ? 16 : q === 'medium' ? 26 : 40;
    const all = IDX.avatars.filter(a => !a.tags.includes('police'));
    const must = all.filter(a => a.tags.includes('jogger') || a.tags.includes('business') || a.tags.includes('tourist'));
    const rest = all.filter(a => !must.includes(a)).sort(() => Math.random() - 0.5);
    workingSet = [...must.sort(() => Math.random() - 0.5).slice(0, Math.ceil(cap * 0.55)), ...rest].slice(0, cap);
  }
  let pool = workingSet.filter(a => a.tags.includes(tag) && (!g || a.g === g));
  if (!pool.length) pool = workingSet.filter(a => a.tags.includes(tag));
  if (!pool.length) pool = workingSet.filter(a => a.tags.includes('generic'));
  let t = 0; for (const a of pool) t += a.w;
  let x = r() * t; for (const a of pool) if ((x -= a.w) < 0) return a;
  return pool[0];
}

// ---------------------------------------------------------------------------------------------- the human
let viewer = null;
/** camera position used for the mesh LOD (call once per frame) */
export function setPedViewer(v) { viewer = v; }
const DUMMY_BONES = [];
const DUMMY_INV = [];
const IDENT = new THREE.Matrix4();

const PROC_STATES = new Set(['drive', 'knocked', 'getup', 'jump', 'fall', 'land', 'enterCar', 'exitCar']);
// mocap one-shots (tools/blender/peds/build_clips_extra.py); the procedural animator stays the fallback
const ONE_STATES = new Set(['jump', 'fall', 'land', 'knocked', 'getup', 'enterCar', 'exitCar']);
const ONE_CLIP = { jump: 'jump_up', fall: 'jump_air', land: 'jump_land', knocked: 'getup_back', getup: 'getup_back', enterCar: 'sit_down_chair_right', exitCar: 'sit_stand_up_chair_left' };
const ANCHORED = new Set(['knocked', 'getup', 'enterCar', 'exitCar']);
const FADE_IN = { jump: 0.1, fall: 0.25, land: 0.08, knocked: 1e-3, getup: 0.45, enterCar: 0.2, exitCar: 0.05, clip: 0.2 };
const GETUP_T0 = 0.15, ENTER_T0 = 1.15, ENTER_RATE = 2.2, EXIT_RATE = 2.3;
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4();
/** FK without matrices / additives: rig-space bone world rotations + positions (avatar units) of pose P */
function fkPos(av, P, WQ, WP) {
  const T = av.T;
  for (let b = 0; b < NB; b++) {
    const p = PAR[b], k = 3 + b * 4;
    if (p < 0) { WQ[0] = P[k]; WQ[1] = P[k + 1]; WQ[2] = P[k + 2]; WQ[3] = P[k + 3]; WP[0] = P[0]; WP[1] = P[1]; WP[2] = P[2]; continue; }
    const ax = WQ[p * 4], ay = WQ[p * 4 + 1], az = WQ[p * 4 + 2], aw = WQ[p * 4 + 3];
    qmul(ax, ay, az, aw, P[k], P[k + 1], P[k + 2], P[k + 3], WQ, b * 4);
    const vx = T[b * 3], vy = T[b * 3 + 1], vz = T[b * 3 + 2];
    const tx = 2 * (ay * vz - az * vy), ty = 2 * (az * vx - ax * vz), tz = 2 * (ax * vy - ay * vx);
    WP[b * 3] = WP[p * 3] + vx + aw * tx + (ay * tz - az * ty);
    WP[b * 3 + 1] = WP[p * 3 + 1] + vy + aw * ty + (az * tx - ax * tz);
    WP[b * 3 + 2] = WP[p * 3 + 2] + vz + aw * tz + (ax * ty - ay * tx);
  }
}
const LOCO_STATES = new Set(['walk', 'run', 'sprint', 'flee']);
const LISTS = {
  idle: ['idle_neutral_01', 'idle_neutral_02', 'idle_neutral_03', 'idle_neutral_04', 'idle_breathe_01', 'idle_neutral_01', 'idle_neutral_02', 'idle_look_around_01', 'idle_touch_hair_01', 'idle_scratch_head_01', 'idle_waiting_01'],
  look: ['idle_look_around_01', 'idle_look_around_02', 'idle_waiting_01', 'idle_waiting_02'],
  talk: ['gestic_talk_neutral_01', 'gestic_talk_neutral_02', 'gestic_talk_relaxed_01', 'gestic_laugh_low'],
  listen: ['gestic_listen_neutral_01', 'gestic_listen_neutral_02', 'gestic_listen_relaxed_01'],
  phone: ['cell_phone_talk_01', 'cell_phone_talk_02', 'cell_phone_textmessage', 'cell_phone_textmessage'],
  photo: ['take_picture'], wave: ['wave_01', 'wave_02'],
  sit: ['sit_chair_idle_neutral_01', 'sit_chair_idle_relaxed_01', 'sit_chair_idle_look_around'],
  umbrella: ['umbrella_idle_01', 'umbrella_idle_02'],
};
const GAIT = {
  slow: ['walk_slow_01', 'walk_slow_02', 'walk_stroll_01'],
  mid: ['walk_neutral', 'walk_neutral_01', 'walk_neutral_02', 'walk_neutral_03', 'walk_cool_01', 'walk_neutral_01', 'walk_neutral_02'],
  fast: ['walk_fast_01', 'walk_fast_02'],
  jog: ['run_slow_01'], run: ['run_neutral', 'run_neutral_01'], sprint: ['run_fast_01'],
};

// props: phone (right hand) and umbrella (right hand, rain)
let PHONE_GEO = null, PHONE_MAT = null, UMB = null;
function phoneMesh() {
  if (!PHONE_GEO) {
    PHONE_GEO = new THREE.BoxGeometry(0.072, 0.15, 0.009);
    PHONE_MAT = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.25, metalness: 0.4 });
  }
  const m = new THREE.Mesh(PHONE_GEO, PHONE_MAT); m.matrixAutoUpdate = false; m.visible = false; m.name = 'pedPhone';
  return m;
}
function umbrellaMesh() {
  if (!UMB) {
    const canopy = new THREE.SphereGeometry(0.56, 16, 5, 0, TAU, 0, 1.08); canopy.scale(1, 0.48, 1); canopy.translate(0, 0.9, 0);
    const shaft = new THREE.CylinderGeometry(0.008, 0.008, 1.18, 5); shaft.translate(0, 0.5, 0);
    UMB = { canopy, shaft, mats: [0x15171c, 0x3a1416, 0x1b2a44, 0x2c2c2c, 0x5a0f12].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, side: THREE.DoubleSide })),
      shaftMat: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.3 }) };
  }
  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.visible = false; g.name = 'pedUmbrella';
  g.add(new THREE.Mesh(UMB.canopy, UMB.mats[(Math.random() * UMB.mats.length) | 0]), new THREE.Mesh(UMB.shaft, UMB.shaftMat));
  return g;
}

export class RealHuman {
  constructor(opts = {}) {
    const r = this.r = rng(opts.seed ?? Math.random());
    this.isReal = true;
    this.style = opts.style;
    const g = opts.gender || (r() < 0.5 ? 'f' : 'm');
    this.root = new THREE.Object3D(); this.root.name = 'human';
    this.rig = new THREE.Object3D(); this.rig.name = 'humanRig'; this.root.add(this.rig);
    this.mesh = null; this.bones = null; this.skeleton = null;
    this.seatHipY = 0.52;
    this.req = null; this.castShadow = opts.castShadow !== false;
    this.wantH = opts.height || null;
    this.look = { gender: g, seed: opts.seed, outfit: opts.outfit, hairStyle: opts.hairStyle, build: opts.build };
    this.height = opts.height || (g === 'f' ? 1.66 : 1.78);
    this.scale = 1;
    this.lockLod0 = !!opts.player;
    this.av = null; this.avId = opts.avatar || null;
    this.pose = PS(); this.tmp = PS(); this.tmp2 = PS(); this.from = PS(); this.over = PS();
    this.fade = 1; this.fadeDur = 0.3;
    this.mode = null; this.clip = null; this.ct = 0; this.clipEnd = 0;
    this.phase = r(); this.vs = 0; this.gait = null;
    this.umbW = 0; this.lod = -1; this.dirty = true;
    this.WQ = new Float32Array(34 * 4); this.WP = new Float32Array(34 * 3);
    this.add = null;     // additive model-space rotations per bone (Float32Array quats) or null
    this.proc = null;
    this.phoneM = null; this.umbM = null;
    this.tint = new THREE.Vector4(0, 1, 1, 0);
    this.disposed = false;
    this._init(opts, g);
  }

  get state() { return this.req; }

  _init(opts, g) {
    loadLib().then(() => {
      if (this.disposed) return;
      const r = this.r;
      let info;
      if (this.avId) info = IDX.avatars.find(a => a.id === this.avId);
      if (!info && opts.player) info = IDX.avatars.find(a => a.id === IDX.player);
      if (!info) info = pickAvatar(opts.style || 'generic', g, r);
      this.look.gender = info.g;
      this.look.avatar = info.id;
      // clothing tint: hue rotation / saturation / value on the cloth mask (business: subtle, joggers: bold)
      const st = opts.style || 'generic';
      const hueAmp = st === 'business' ? 0.25 : st === 'jogger' ? 2.6 : 1.2;
      const hue = r() < 0.3 ? 0 : (r() * 2 - 1) * hueAmp;
      this.tint.set(hue, 0.75 + r() * 0.45, 0.78 + r() * 0.4, st === 'business' ? 0.6 : 0.9);
      if (opts.player) this.tint.set(0, 1, 1, 0);
      const base = info.h;
      const want = opts.height || base * (0.96 + r() * 0.08);
      this.scale = want / base; this.height = want;
      this.rig.scale.setScalar(this.scale);
      this._gaitPick(info.g, st);
      return loadAvatar(info.id).then(av => { if (this.disposed) return; if (av) this._build(av); else this._fallback(opts); });
    }).catch(() => this._fallback(opts));
  }

  _gaitPick(g, style) {
    const r = this.r, pk = (a) => a[(r() * a.length) | 0];
    const set = [pk(GAIT.slow), pk(GAIT.mid), pk(GAIT.fast), pk(GAIT.jog), pk(GAIT.run), pk(GAIT.sprint)];
    if (style === 'business') set[1] = pk(['walk_neutral', 'walk_neutral_02', 'walk_fast_01']);
    this.gait = set.map(k => clipFor(k, g)).filter(Boolean).sort((a, b) => a.speed - b.speed);
    this.g = g;
    this.phoneClip = clipFor(pk(LISTS.phone), g);
  }

  _build(av) {
    this.av = av;
    if (!DUMMY_BONES.length) for (let i = 0; i < NB; i++) { DUMMY_BONES.push(new THREE.Bone()); DUMMY_INV.push(new THREE.Matrix4()); }
    const sk = new THREE.Skeleton(DUMMY_BONES, DUMMY_INV);
    const self = this;
    sk.update = function () { if (self.dirty && this.boneTexture) { this.boneTexture.needsUpdate = true; self.dirty = false; } };
    const mat = makeMaterial(av, this.tint);
    const lod = this.lockLod0 ? 0 : 1;
    const mesh = new THREE.SkinnedMesh(av.lods[lod], mat);
    mesh.name = 'humanMesh';
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(sk, IDENT);
    mesh.boundingSphere = av.lods[0].boundingSphere.clone();
    mesh.castShadow = this.castShadow;
    mesh.frustumCulled = true;
    this.lod = lod;
    this.mesh = mesh; this.skeleton = sk;
    this.rig.add(mesh);
    // first pose so the bone texture is valid before the first update
    this.mode = null;
    this.update(0, this._last || { state: 'idle', speed: 0 });
  }

  // assets missing: become a procedural human (same API)
  _fallback(opts) {
    if (this.disposed || this.fb || !procHuman) return;
    const ph = this.fb = procHuman({ ...opts, procedural: true });
    this.root.add(ph.root);
    this.mesh = ph.mesh;
    if (this._last) ph.update(0, this._last);
  }

  setVisible(v) { this.root.visible = !!v; }

  // ---- clip control
  _startFade(dur) { this.from.set(this.pose); this.fade = 0; this.fadeDur = dur; }
  _play(list, keep = false) {
    const r = this.r;
    let c = null;
    for (let i = 0; i < 4 && (!c || (c === this.clip && list.length > 1)); i++) c = clipFor(list[(r() * list.length) | 0], this.g);
    if (!c) c = clipFor(list[0], this.g);
    this.clip = c;
    this.ct = keep ? this.ct : (c && c.dur > 6 ? r() * c.dur * 0.6 : 0);
    // long clips: switch after 7-16 s instead of playing 30 s of the same gesture
    this.clipEnd = c ? Math.min(c.dur - 0.05, this.ct + 7 + r() * 9) : 0;
  }

  update(dt, s = {}) {
    if (this.disposed) return;
    if (this._force) s = { ...s, ...this._force };     // debug: h._force = { state: 'knocked' }
    this._last = s;
    if (this.fb) { this.fb.update(dt, s); return; }
    dt = clamp(+dt || 0, 0, 0.25);
    const state = s.state || 'idle';
    this.req = state;
    const av = this.av;
    if (!av) return;
    const speedW = Math.max(0, +s.speed || 0);
    const speed = speedW / this.scale;
    this.vs += (speed - this.vs) * Math.min(1, dt * 6);
    // ---- choose the mode
    let mode;
    if (s.clip) mode = 'clip';               // debug / tooling: play one named clip (s.clip, s.rate), hold the last frame
    else if (ONE_STATES.has(state) && clipFor(ONE_CLIP[state], this.g)) mode = state;   // mocap one-shots (car, jump, knockdown)
    else if (PROC_STATES.has(state)) mode = 'proc';
    else if (LOCO_STATES.has(state) || (state === 'idle' && speed > 0.3)) mode = 'loco';
    else if (state === 'phone') mode = s.gesture === 'photo' ? 'photo' : 'phone';
    else if (state === 'wave') mode = 'wave';
    else if (state === 'sit') mode = 'sit';
    else mode = s.gesture && LISTS[s.gesture] ? s.gesture : 'idle';
    this._rootWorld();
    if (mode !== this.mode) {
      const prev = this.mode;
      const fromProc = prev === 'proc' || mode === 'proc';
      if (prev !== null) this._startFade(FADE_IN[mode] ?? (fromProc ? 0.22 : mode === 'loco' || prev === 'loco' ? 0.3 : 0.45));
      if (prev === 'knocked' && mode !== 'getup') this.rag = null;
      if (ANCHORED.has(prev) && !ANCHORED.has(mode)) this.anchor = null;   // the owner has adopted getupRoot / exitYaw by now
      this.mode = mode;
      if (mode === 'clip') this._clipName = null;
      else if (ONE_STATES.has(mode)) this._startOne(mode, s, prev);
      else if (mode === 'phone') { this.clip = this.phoneClip || clipFor('cell_phone_textmessage', this.g); this.ct = this.r() * 4; this.clipEnd = this.clip.dur - 0.05; }
      else if (mode !== 'loco' && mode !== 'proc') this._play(LISTS[mode]);
      if (mode === 'loco' && this.vs < 0.2) this.vs = speed;
    }
    const P = this.pose, T = this.tmp;
    const hs = av.hip;
    if (ONE_STATES.has(mode)) {
      this._onePose(mode, dt, s, T);
    } else if (mode === 'loco') {
      const G = this.gait, v = Math.max(this.vs, 0.05);
      let i = 0; while (i < G.length - 1 && G[i + 1].speed < v) i++;
      const a = G[i], b = G[Math.min(i + 1, G.length - 1)];
      const w = b === a ? 0 : clamp((v - a.speed) / (b.speed - a.speed), 0, 1);
      const stride = a.stride + (b.stride - a.stride) * w;
      this.phase = (this.phase + dt * v / Math.max(0.2, stride)) % 1;
      sampleInto(a, ((this.phase + a.phase0) % 1) * a.dur, T, 1 - w, true, hs / a.hip0);
      if (w > 0) sampleInto(b, ((this.phase + b.phase0) % 1) * b.dur, T, w, false, hs / b.hip0);
      normPose(T);
    } else if (mode === 'proc') {
      this._procPose(dt, s, T);
    } else if (mode === 'clip') {
      if (this._clipName !== s.clip) { this._clipName = s.clip; this.clip = clipFor(s.clip, this.g); this.ct = s.clipT || 0; }
      const c = this.clip;
      if (c) { this.ct = Math.min(c.dur - 0.01, this.ct + dt * (s.rate || 1)); sampleInto(c, this.ct, T, 1, true, hs / c.hip0); normPose(T); }
      else T.set(this.pose);
    } else {
      this.ct += dt;
      if (this.ct >= this.clipEnd) {
        this._startFade(0.6);
        if (mode === 'phone' || mode === 'photo') { this.ct = 0; this.clipEnd = this.clip.dur - 0.05; }
        else this._play(LISTS[mode]);
      }
      const c = this.clip;
      sampleInto(c, this.ct, T, 1, true, hs / c.hip0);
      normPose(T);
      if (mode === 'sit') {   // pelvis on the seat point: root = seat - seatHipY (world)
        T[1] = T[1] - c.meanY * (hs / c.hip0) + this.seatHipY / this.scale; T[0] = 0; T[2] = 0;
      }
    }
    // umbrella in the rain: upper body from the umbrella idle over walk / idle (right arm only while walking)
    const wantU = s.umbrella && (mode === 'loco' || mode === 'idle' || mode === 'look') && this.vs < 2.4 ? 1 : 0;
    this.umbW += (wantU - this.umbW) * Math.min(1, dt * 3);
    if (this.umbW > 0.01) {
      const uc = this.umbClip || (this.umbClip = clipFor(LISTS.umbrella[(this.r() * 2) | 0], this.g));
      if (uc) {
        this.ut = ((this.ut || this.r() * 10) + dt) % (uc.dur - 0.1);
        sampleInto(uc, this.ut, this.over, 1, true, hs / uc.hip0); normPose(this.over);
        blendPose(T, T, this.over, smooth(this.umbW), mode === 'loco' ? umbArmMask() : upperMask());
      }
    }
    // cross-fade from the snapshot
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      blendPose(P, this.from, T, smooth(this.fade));
    } else P.set(T);
    // additive: spine lean (slopes), head turn (look at the player / bus)
    let add = null;
    const lean = +s.lean || 0, side = +s.leanSide || 0, ly = (+s.lookYaw || 0) * (+s.lookW || 0);
    if (lean || side || ly) {
      add = this._add || (this._add = { lean: new THREE.Quaternion(), neck: new THREE.Quaternion(), head: new THREE.Quaternion() });
      _va.set(-lean, 0, side); add.lean.setFromEuler(_eu.set(-lean, 0, side * 0.8));
      add.neck.setFromAxisAngle(Y_AXIS, ly * 0.4); add.head.setFromAxisAngle(Y_AXIS, ly * 0.6);
    }
    this._fk(add);
    this._applyAnchor();
    this._prevRig = this._rigWorld(this._prevRig || {});
    this._props(mode, dt);
    // mesh LOD by camera distance (hysteresis)
    if (!this.lockLod0 && viewer && this.mesh) {
      const d = viewer.distanceTo(this.root.position);
      let l = this.lod;
      if (d < 13) l = 0; else if (d > 15 && d < 38) l = 1; else if (d > 42) l = 2;
      if (l !== this.lod) { this.lod = l; this.mesh.geometry = av.lods[l]; }
    }
  }

  // ---------------------------------------------------------------------------------------------- one-shots + anchor
  // Mocap one-shots (enter / exit a car seat, jump / fall / land, knockdown ragdoll + get up) may place the body away
  // from the owner's root: `this.anchor` = { x, y, z, yaw } is then the rig's world transform (the rig is re-parented
  // relative to the root every frame). Owners adopt getupRoot / exitYaw so the anchor coincides with the root when
  // the one-shot ends.
  _rootWorld() {
    const r = this.root;
    r.updateWorldMatrix(true, false);
    const e = r.matrixWorld.elements;
    this.rw = this.rw || { x: 0, y: 0, z: 0, yaw: 0 };
    this.rw.x = e[12]; this.rw.y = e[13]; this.rw.z = e[14]; this.rw.yaw = Math.atan2(e[8], e[10]);
    return this.rw;
  }
  _applyAnchor() {
    const rig = this.rig, A = this.anchor;
    if (!A) {
      if (this._anchored) { rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.setScalar(this.scale); this._anchored = false; }
      return;
    }
    this._anchored = true;
    _mA.compose(_va.set(A.x, A.y, A.z), _qa.setFromAxisAngle(Y_AXIS, A.yaw), _vb.setScalar(this.scale));
    _mB.copy(this.root.matrixWorld).invert().multiply(_mA);
    _mB.decompose(rig.position, rig.quaternion, rig.scale);
  }
  /** current rig world transform as an anchor record (no anchor = the root) */
  _rigWorld(out = {}) {
    if (this.anchor) return Object.assign(out, this.anchor);
    const r = this.rw; out.x = r.x; out.y = r.y; out.z = r.z; out.yaw = r.yaw; return out;
  }
  /** pelvis + head positions (avatar units, rig space) of clip c at time t */
  _clipFrame(c, t) {
    const T = this.tmp2, WQ = this._cfq || (this._cfq = new Float32Array(NB * 4)), WP = this._cfp || (this._cfp = new Float32Array(NB * 3));
    sampleInto(c, t, T, 1, true, this.av.hip / c.hip0); normPose(T);
    fkPos(this.av, T, WQ, WP);
    return { px: WP[0], py: WP[1], pz: WP[2], hx: WP[BN.Head * 3] - WP[0], hz: WP[BN.Head * 3 + 2] - WP[2] };
  }
  /** seconds the get-up takes at playback rate `rate` (owners size their knockdown timers with it) */
  getupTime(rate = 1.3) { const c = LIB && this.g && clipFor('getup_back', this.g); return c ? (c.dur - GETUP_T0) / rate : 1.25; }
  /** seconds of the car one-shots ('enter' = door -> seat, 'exit' = seat -> standing outside) */
  carTime(kind) {
    const c = LIB && this.g && this.av && clipFor(kind === 'enter' ? 'sit_down_chair_right' : 'sit_stand_up_chair_left', this.g);
    if (!c) return kind === 'enter' ? 0.55 : 0;
    return kind === 'enter' ? (c.dur - ENTER_T0) / ENTER_RATE : c.dur / EXIT_RATE;
  }

  _startOne(mode, s, prev) {
    const g = this.g, o = this.one = { mode, clip: clipFor(ONE_CLIP[mode], g), t: 0, rate: s.rate || 1, end: 0 };
    const sc = this.scale, rw = this.rw;
    if (mode === 'jump') { o.t = 0.16; }
    else if (mode === 'fall') { o.pp = true; o.rate = 0.55; o.t = 0.1; }
    else if (mode === 'land') { o.t = 0.12; o.rate = s.rate || 1.25; }
    else if (mode === 'knocked') {
      // ragdoll from the current pose (world space); the anchor holds the rig still while the root flies
      this.anchor = { ...(this._prevRig || this._rigWorld({})) };   // last frame's rig: the owner may have turned the root this frame
      this.rag = this.rag || new Ragdoll(BN, PAR, NB);
      const WQ = this._kq || (this._kq = new Float32Array(NB * 4)), WP = this._kp || (this._kp = new Float32Array(NB * 3));
      const A = this.anchor; _qb.setFromAxisAngle(Y_AXIS, A.yaw);
      for (let b = 0; b < NB; b++) {
        _qa.fromArray(this.WQ, b * 4).premultiply(_qb).toArray(WQ, b * 4);
        _va.fromArray(this.WP, b * 3).multiplyScalar(sc).applyQuaternion(_qb); WP[b * 3] = _va.x + A.x; WP[b * 3 + 1] = _va.y + A.y; WP[b * 3 + 2] = _va.z + A.z;
      }
      const v = s.vel || { x: 0, y: 1.5, z: 0 };
      this.rag.start(WQ, WP, v, s.spin || 0);
      this.fade = 1;
    } else if (mode === 'getup') {
      // pick the clip by how the body lies, then place the clip's first frame onto the body (pelvis + head line)
      const back = this.rag ? this.rag.onBack() : true;
      o.clip = clipFor(back ? 'getup_back' : 'getup_front', g); o.t = GETUP_T0; o.rate = s.rate || 1.3;
      const A0 = this._rigWorld({});
      _qb.setFromAxisAngle(Y_AXIS, A0.yaw);
      // current pelvis / head in world (from the last FK)
      _va.fromArray(this.WP, 0).multiplyScalar(sc).applyQuaternion(_qb); const pwx = _va.x + A0.x, pwz = _va.z + A0.z;
      _vb.fromArray(this.WP, BN.Head * 3).multiplyScalar(sc).applyQuaternion(_qb); const hwx = _vb.x + A0.x - pwx, hwz = _vb.z + A0.z - pwz;
      const f = this._clipFrame(o.clip, o.t);
      const yaw = Math.atan2(-hwx, -hwz) - Math.atan2(-f.hx, -f.hz);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const ox = (f.px * c + f.pz * sn) * sc, oz = (-f.px * sn + f.pz * c) * sc;
      const gy = s.ground ? s.ground.y : rw.y;
      this.anchor = { x: pwx - ox, y: gy, z: pwz - oz, yaw };
      this.getupRoot = { ...this.anchor };
      // re-express the current (ragdoll) pose in the new anchor frame for the blend
      this._poseInAnchor(this.from, A0, this.anchor);
      this.fade = 0; this.fadeDur = 0.45;
      this.getupDur = (o.clip.dur - o.t) / o.rate;
    } else if (mode === 'enterCar' || mode === 'exitCar') {
      const side = s.side === 1 ? 1 : -1;     // -1 = the car's left (driver) door
      if (mode === 'enterCar') { o.clip = clipFor(side < 0 ? 'sit_down_chair_right' : 'sit_down_chair_left', g); o.t = ENTER_T0; o.rate = s.rate || ENTER_RATE; }
      else { o.clip = clipFor(side < 0 ? 'sit_stand_up_chair_left' : 'sit_stand_up_chair_right', g); o.t = 0; o.rate = s.rate || EXIT_RATE; }
      o.f0 = this._clipFrame(o.clip, o.t); o.f1 = this._clipFrame(o.clip, o.clip.dur - 0.01);
      const cy = s.carYaw ?? rw.yaw;
      o.yaw = mode === 'enterCar' ? cy - o.clip.turn : cy;
      this.exitYaw = mode === 'exitCar' ? cy + o.clip.turn : null;
      this.anchor = { x: rw.x, y: rw.y, z: rw.z, yaw: o.yaw };
      this.carDur = (o.clip.dur - o.t) / o.rate;
    }
    o.t0 = o.t;
  }

  _onePose(mode, dt, s, T) {
    const o = this.one, c = o.clip, hs = this.av.hip, sc = this.scale;
    if (mode === 'knocked' && this.rag) {
      const rw = this.rw;
      this.rag.step(dt, s.ground || { y: rw.y, gx: 0, gz: 0, x: rw.x, z: rw.z }, s.follow === false ? null : { x: rw.x, z: rw.z, k: 0.04 });
      this._ragPose(T);
      return;
    }
    o.t += dt * o.rate;
    let t = o.t;
    if (o.pp) { const L = c.dur - 0.02, u = (t % (2 * L)); t = u < L ? u : 2 * L - u; }
    else t = Math.min(c.dur - 0.01, t);
    sampleInto(c, t, T, 1, true, hs / c.hip0); normPose(T);
    if (mode === 'enterCar' || mode === 'exitCar') {
      // the anchor glides so that the pelvis starts over the door point and ends on the seat (or the reverse)
      const k = (t - o.t0) / Math.max(1e-3, c.dur - 0.01 - o.t0);
      // entering: turn at the door first, then slide in while sitting down; exiting: out of the seat early
      const u = mode === 'enterCar' ? smooth((k - 0.3) / 0.6) : smooth(k / 0.7);
      const seat = s.seat, rw = this.rw, cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      const off = (f) => [(f.px * cs + f.pz * sn) * sc, (-f.px * sn + f.pz * cs) * sc];
      const [ax, az] = off(o.f0), [bx, bz] = off(o.f1);
      let A, B;
      if (mode === 'enterCar') {
        A = [rw.x - ax, rw.y, rw.z - az];
        B = seat ? [seat.x - bx, seat.y - o.f1.py * sc, seat.z - bz] : A;
      } else {
        A = seat ? [seat.x - ax, seat.y - o.f0.py * sc, seat.z - az] : [rw.x - ax, rw.y, rw.z - az];
        B = [rw.x - bx, rw.y, rw.z - bz];
      }
      const an = this.anchor;
      an.x = A[0] + (B[0] - A[0]) * u; an.y = A[1] + (B[1] - A[1]) * u; an.z = A[2] + (B[2] - A[2]) * u; an.yaw = o.yaw;
    }
    if (mode === 'jump' || mode === 'fall' || mode === 'land') { T[0] *= 0.3; T[2] *= 0.3; }
  }

  /** ragdoll bone world rotations + pelvis -> pose (rig space of the anchor) */
  _ragPose(out) {
    const R = this.rag, A = this.anchor, W = R.W, sc = this.scale;
    _qb.setFromAxisAngle(Y_AXIS, -A.yaw);
    const WR = this._rq2 || (this._rq2 = new Float32Array(NB * 4));
    for (let b = 0; b < NB; b++) { _qa.fromArray(W, b * 4).premultiply(_qb).toArray(WR, b * 4); }
    for (let b = 0; b < NB; b++) {
      const p = PAR[b], k = 3 + b * 4;
      if (p < 0) { out[k] = WR[b * 4]; out[k + 1] = WR[b * 4 + 1]; out[k + 2] = WR[b * 4 + 2]; out[k + 3] = WR[b * 4 + 3]; continue; }
      qmul(-WR[p * 4], -WR[p * 4 + 1], -WR[p * 4 + 2], WR[p * 4 + 3], WR[b * 4], WR[b * 4 + 1], WR[b * 4 + 2], WR[b * 4 + 3], out, k);
    }
    R.pelvis(_va); _va.x -= A.x; _va.y -= A.y; _va.z -= A.z; _va.applyQuaternion(_qb).multiplyScalar(1 / sc);
    out[0] = _va.x; out[1] = _va.y; out[2] = _va.z;
  }

  /** the current pose (rig frame A0) re-expressed in rig frame A1 (both {x,y,z,yaw}) -> out */
  _poseInAnchor(out, A0, A1) {
    out.set(this.pose);
    const dy = A0.yaw - A1.yaw, sc = this.scale;
    _qa.setFromAxisAngle(Y_AXIS, dy);
    // pelvis rotation
    _qb.fromArray(out, 3).premultiply(_qa).toArray(out, 3);
    // pelvis position: world = A0 + R0 p sc ; local1 = R1^-1 (world - A1) / sc
    _va.fromArray(out, 0).multiplyScalar(sc).applyAxisAngle(Y_AXIS, A0.yaw);
    _va.x += A0.x - A1.x; _va.y += A0.y - A1.y; _va.z += A0.z - A1.z;
    _va.applyAxisAngle(Y_AXIS, -A1.yaw).multiplyScalar(1 / sc);
    out[0] = _va.x; out[1] = _va.y; out[2] = _va.z;
    return out;
  }

  _procPose(dt, s, out) {
    if (!this.proc) {
      if (!procFactory) { out.set(this.pose); return; }
      this.proc = procFactory(this.g, this.r());
    }
    const pr = this.proc, av = this.av, al = av.align;
    pr.anim.update(dt, s);
    const pb = pr.bones, PB = pr.B;
    // procedural world quaternions (identity rest), hips position in rig units
    const pq = this._pq || (this._pq = new Float32Array(18 * 4));
    const ppar = this._ppar || (this._ppar = pb.map(b => pb.indexOf(b.parent)));
    for (let i = 0; i < pb.length; i++) {
      const q = pb[i].quaternion, p = ppar[i];
      if (p < 0) { pq[i * 4] = q.x; pq[i * 4 + 1] = q.y; pq[i * 4 + 2] = q.z; pq[i * 4 + 3] = q.w; }
      else qmul(pq[p * 4], pq[p * 4 + 1], pq[p * 4 + 2], pq[p * 4 + 3], q.x, q.y, q.z, q.w, pq, i * 4);
    }
    // real world quats
    const WQ = this._rq || (this._rq = new Float32Array(NB * 4));
    const done = this._rdone || (this._rdone = new Uint8Array(NB));
    done.fill(0);
    for (const [pn, rn] of PROC_MAP) {
      const i = PB[pn], j = BN[rn];
      qmul(pq[i * 4], pq[i * 4 + 1], pq[i * 4 + 2], pq[i * 4 + 3], al.A[j * 4], al.A[j * 4 + 1], al.A[j * 4 + 2], al.A[j * 4 + 3], WQ, j * 4);
      done[j] = 1;
    }
    // spine1 follows the procedural spine, clavicles the chest (rest offsets)
    const fromProc = (j, pi) => { qmul(pq[pi * 4], pq[pi * 4 + 1], pq[pi * 4 + 2], pq[pi * 4 + 3], al.WQ[j * 4], al.WQ[j * 4 + 1], al.WQ[j * 4 + 2], al.WQ[j * 4 + 3], WQ, j * 4); done[j] = 1; };
    fromProc(BN.Spine1, PB.spine); fromProc(BN.LClavicle, PB.chest); fromProc(BN.RClavicle, PB.chest);
    // locals
    for (let j = 0; j < NB; j++) {
      const p = PAR[j], k = 3 + j * 4;
      if (!done[j]) { out[k] = av.R[j * 4]; out[k + 1] = av.R[j * 4 + 1]; out[k + 2] = av.R[j * 4 + 2]; out[k + 3] = av.R[j * 4 + 3]; if (p >= 0) { qmul(WQ[p * 4], WQ[p * 4 + 1], WQ[p * 4 + 2], WQ[p * 4 + 3], out[k], out[k + 1], out[k + 2], out[k + 3], WQ, j * 4); } continue; }
      if (p < 0) { out[k] = WQ[j * 4]; out[k + 1] = WQ[j * 4 + 1]; out[k + 2] = WQ[j * 4 + 2]; out[k + 3] = WQ[j * 4 + 3]; continue; }
      // local = parent^-1 * world
      qmul(-WQ[p * 4], -WQ[p * 4 + 1], -WQ[p * 4 + 2], WQ[p * 4 + 3], WQ[j * 4], WQ[j * 4 + 1], WQ[j * 4 + 2], WQ[j * 4 + 3], out, k);
    }
    const hp = pb[0].position, k = av.hip / pr.HIPS_Y;
    out[0] = hp.x * k; out[1] = hp.y * k; out[2] = hp.z * k;
  }

  /** forward kinematics -> skeleton.boneMatrices (avatar units, mesh space) */
  _fk(add) {
    const av = this.av, P = this.pose, T = av.T, IB = av.IB, WQ = this.WQ, WP = this.WP;
    const M = this.skeleton.boneMatrices;
    for (let b = 0; b < NB; b++) {
      const p = PAR[b], k = 3 + b * 4;
      let qx, qy, qz, qw, px, py, pz;
      if (p < 0) { qx = P[k]; qy = P[k + 1]; qz = P[k + 2]; qw = P[k + 3]; px = P[0]; py = P[1]; pz = P[2]; }
      else {
        const ax = WQ[p * 4], ay = WQ[p * 4 + 1], az = WQ[p * 4 + 2], aw = WQ[p * 4 + 3];
        const bx = P[k], by = P[k + 1], bz = P[k + 2], bw = P[k + 3];
        qx = aw * bx + ax * bw + ay * bz - az * by; qy = aw * by - ax * bz + ay * bw + az * bx;
        qz = aw * bz + ax * by - ay * bx + az * bw; qw = aw * bw - ax * bx - ay * by - az * bz;
        // parent rotation applied to the rest offset
        const vx = T[b * 3], vy = T[b * 3 + 1], vz = T[b * 3 + 2];
        const tx = 2 * (ay * vz - az * vy), ty = 2 * (az * vx - ax * vz), tz = 2 * (ax * vy - ay * vx);
        px = WP[p * 3] + vx + aw * tx + (ay * tz - az * ty);
        py = WP[p * 3 + 1] + vy + aw * ty + (az * tx - ax * tz);
        pz = WP[p * 3 + 2] + vz + aw * tz + (ax * ty - ay * tx);
      }
      if (add) {
        const a = b === BN.Spine1 ? add.lean : b === BN.Neck ? add.neck : b === BN.Head ? add.head : null;
        if (a) {
          const rx = a.w * qx + a.x * qw + a.y * qz - a.z * qy, ry = a.w * qy - a.x * qz + a.y * qw + a.z * qx;
          const rz = a.w * qz + a.x * qy - a.y * qx + a.z * qw, rw = a.w * qw - a.x * qx - a.y * qy - a.z * qz;
          qx = rx; qy = ry; qz = rz; qw = rw;
        }
      }
      WQ[b * 4] = qx; WQ[b * 4 + 1] = qy; WQ[b * 4 + 2] = qz; WQ[b * 4 + 3] = qw;
      WP[b * 3] = px; WP[b * 3 + 1] = py; WP[b * 3 + 2] = pz;
      // bone matrix = [R(q) | p] * IB  (column-major)
      const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
      const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
      const r00 = 1 - (yy + zz), r10 = xy + wz, r20 = xz - wy;
      const r01 = xy - wz, r11 = 1 - (xx + zz), r21 = yz + wx;
      const r02 = xz + wy, r12 = yz - wx, r22 = 1 - (xx + yy);
      const o = b * 16;
      for (let c = 0; c < 4; c++) {
        const i0 = IB[o + c * 4], i1 = IB[o + c * 4 + 1], i2 = IB[o + c * 4 + 2], i3 = IB[o + c * 4 + 3];
        M[o + c * 4] = r00 * i0 + r01 * i1 + r02 * i2 + px * i3;
        M[o + c * 4 + 1] = r10 * i0 + r11 * i1 + r12 * i2 + py * i3;
        M[o + c * 4 + 2] = r20 * i0 + r21 * i1 + r22 * i2 + pz * i3;
        M[o + c * 4 + 3] = i3;
      }
    }
    this.dirty = true;
  }

  /** rig-space matrix of bone b with a local offset (bone frame) and an extra local rotation, for props */
  _boneMatrix(b, out, ox = 0, oy = 0, oz = 0, rot = null) {
    _qa.fromArray(this.WQ, b * 4);
    _vb.set(ox, oy, oz).applyQuaternion(_qa);
    _va.fromArray(this.WP, b * 3).add(_vb);
    if (rot) _qa.multiply(rot);
    return out.compose(_va, _qa, ONE);
  }

  _props(mode, dt) {
    const phoneOn = (mode === 'phone' || mode === 'photo') && this.fade > 0.5;
    if (phoneOn && !this.phoneM) { this.phoneM = phoneMesh(); this.rig.add(this.phoneM); }
    if (this.phoneM) {
      this.phoneM.visible = phoneOn;
      if (phoneOn) {
        // the phone goes in the higher hand (at the ear for calls; texting / photo: either)
        const yl = this.WP[BN.LHand * 3 + 1], yr = this.WP[BN.RHand * 3 + 1];
        if (this.phoneHand === undefined || Math.abs(yl - yr) > 0.08) this.phoneHand = yl > yr ? BN.LHand : BN.RHand;
        const left = this.phoneHand === BN.LHand;
        this._boneMatrix(this.phoneHand, this.phoneM.matrix, -0.075, 0.012, left ? 0.022 : -0.022, PHONE_ROT);   // hand frame: fingers -X, thumb +Y
        this.phoneM.matrixWorldNeedsUpdate = true;
      }
    }
    const umbOn = this.umbW > 0.4;
    if (umbOn && !this.umbM) { this.umbM = umbrellaMesh(); this.rig.add(this.umbM); }
    if (this.umbM) {
      this.umbM.visible = umbOn;
      if (umbOn) {
        // Rocketbox umbrella clips hold it in the left hand in front of the chest; the shaft stays upright
        _va.fromArray(this.WP, BN.LHand * 3); _vb.set(-0.05, 0, 0).applyQuaternion(_qa.fromArray(this.WQ, BN.LHand * 4)); _va.add(_vb);
        _va.y -= 0.08;
        this.umbM.matrix.compose(_va, _qb.setFromEuler(_eu.set(-0.1, 0, -0.06)), ONE);
        this.umbM.matrixWorldNeedsUpdate = true;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.mesh) { this.mesh.material.dispose(); this.skeleton.boneTexture?.dispose(); }
  }
}
const _eu = new THREE.Euler();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const PHONE_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

export function createRealHuman(opts) { return new RealHuman(opts); }

/** debug / tooling */
export function realStats() {
  let n = 0; for (const a of AV.values()) if (a.ready) n++;
  return { avatars: n, clips: LIB ? Object.keys(LIB).length : 0, failed };
}

/**
 * Idle people for interiors / plazas: spawns standing (or sitting) realistic humans at the given points.
 * points: [{ x, y, z, yaw, anim?: 'idle'|'talk'|'listen'|'phone'|'sit'|'look', style? }], group: THREE.Object3D (parent)
 * Returns { humans, update(dt), dispose() }; call update(dt) every frame while visible.
 */
export function spawnIdlePeds(group, points) {
  const humans = points.map((p, i) => {
    const h = new RealHuman({ seed: Math.random(), style: p.style || 'generic' });
    h.root.position.set(p.x, p.y || 0, p.z); h.root.rotation.y = p.yaw || 0;
    h._s = { state: p.anim === 'sit' ? 'sit' : p.anim === 'phone' ? 'phone' : 'idle', speed: 0, gesture: ['talk', 'listen', 'look'].includes(p.anim) ? p.anim : null };
    group.add(h.root);
    return h;
  });
  return {
    humans,
    update(dt) { for (const h of humans) h.update(dt, h._s); },
    dispose() { for (const h of humans) h.dispose(); },
  };
}
