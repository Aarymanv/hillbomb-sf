// Ground-cover layers: object templates (CPU, built once), per-layer batch geometry (N copies of the template per chunk
// instance) and the materials (MeshStandardMaterial + onBeforeCompile; placement, wind and colour are in glsl.js).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMMON_V, BODY, COMMON_F, TRANSLUCENT_F, ALPHA_F, FLOWER_F } from './glsl.js';

// ------------------------------------------------------------------ templates: { pos, nrm?, tpl?, uv?, idx }
function bladeTpl(segs) {
  const pos = [], idx = [];
  for (let k = 0; k < segs; k++) pos.push(-1, k / segs, 0, 1, k / segs, 0);
  pos.push(0, 1, 0);
  for (let k = 0; k < segs - 1; k++) { const a = 2 * k; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const a = 2 * (segs - 1); idx.push(a, a + 1, a + 2);
  return { pos, idx };
}
function flowerTpl() {
  const pos = [-1, 0, 0, 1, 0, 0, -1, 0.5, 0, 1, 0.5, 0, 0, 1, 0], idx = [0, 1, 3, 0, 3, 2, 2, 3, 4];
  pos.push(0, 0, 1);                                            // head centre = 5
  for (let r = 1; r <= 2; r++) for (let k = 0; k < 6; k++) pos.push(r, k / 6, 1);
  for (let k = 0; k < 6; k++) {
    const a = 6 + k, b = 6 + (k + 1) % 6, c = 12 + k, d = 12 + (k + 1) % 6;
    idx.push(5, a, b, a, c, d, a, d, b);
  }
  return { pos, idx };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function fernTpl() {
  const R = rng(7), pos = [], nrm = [], tpl = [], idx = [], F = 7, SEG = 6;
  for (let f = 0; f < F; f++) {
    const yaw = f / F * Math.PI * 2 + (R() - 0.5) * 0.6, L = 0.75 + 0.35 * R(), lift = 0.55 + 0.35 * R();
    const cx = Math.cos(yaw), cz = Math.sin(yaw), sx = -cz, sz = cx;
    const base = pos.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const v = k / SEG, u = 1 - v;
      // quadratic arch: (0,0) -> (0.35L, 0.75L*lift) -> (0.95L, 0.15L)
      const r = 2 * u * v * 0.35 * L + v * v * 0.95 * L, y = 2 * u * v * 0.75 * L * lift + v * v * 0.15 * L;
      const w = 0.2 * L * Math.max(0.02, Math.sin(Math.PI * Math.pow(v, 0.75)));
      for (const sd of [-1, 1]) {
        pos.push(cx * r + sx * w * sd, y - w * 0.18, cz * r + sz * w * sd);
        nrm.push(-cx * 0.35, 1, -cz * 0.35); tpl.push(sd, v);
      }
    }
    for (let k = 0; k < SEG; k++) { const a = base + 2 * k; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  return { pos, nrm, tpl, idx };
}
function shrubTpl() {
  const R = rng(11), pos = [], nrm = [], tpl = [], idx = [], N = 56;
  for (let i = 0; i < N; i++) {
    const yy = 1 - (i + 0.5) / N * 1.25, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr).normalize();
    const c = dir.clone().multiplyScalar(0.5 + 0.45 * R());
    const n = dir.clone().add(new THREE.Vector3(R() - 0.5, R() - 0.3, R() - 0.5)).normalize();
    const t1 = new THREE.Vector3(0, 1, 0).cross(n); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize();
    const t2 = n.clone().cross(t1).normalize();
    const L = 0.22 + 0.08 * R(), W = 0.19 + 0.06 * R(), b = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = c.clone().addScaledVector(t1, u * W).addScaledVector(t2, v * L);
      pos.push(p.x, p.y, p.z); nrm.push(dir.x, dir.y, dir.z); tpl.push(u, v);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { pos, nrm, tpl, idx };
}
function rockTpl() {
  let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3(), R = rng(3);
  // a few flat facets + lumpy noise
  const planes = []; for (let k = 0; k < 6; k++) planes.push([new THREE.Vector3(R() - 0.5, R() - 0.2, R() - 0.5).normalize(), 0.72 + 0.2 * R()]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let r = 1 + 0.12 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.7 - v.y * 2.1) + 0.05 * Math.sin(v.x * 13 + v.z * 11);
    for (const [n, dd] of planes) { const k = v.dot(n); if (k > 0) r = Math.min(r, dd / k); }
    if (v.y < -0.2) r *= 0.8;
    v.multiplyScalar(r); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, pos = Array.from(p.array), nrm = Array.from(n.array), uv = [];
  for (let i = 0; i < p.count; i++) {   // box-projected UVs (metres-ish, rescaled per instance by the texture tile)
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.push(x * 0.5, z * 0.5); else if (ax >= az) uv.push(z * 0.5, y * 0.5); else uv.push(x * 0.5, y * 0.5);
  }
  return { pos, nrm, uv, idx: Array.from(g.index.array) };
}
export const TEMPLATES = { blade4: () => bladeTpl(4), blade2: () => bladeTpl(2), blade1: () => bladeTpl(1), flower: flowerTpl, fern: fernTpl, shrub: shrubTpl, rock: rockTpl };

// N copies of a template + one aChunk per instance
export function batchGeometry(tpl, n, maxInst) {
  const vc = tpl.pos.length / 3, ic = tpl.idx.length;
  const pos = new Float32Array(vc * n * 3), aIdx = new Float32Array(vc * n);
  const idx = (vc * n > 65535 ? new Uint32Array(ic * n) : new Uint16Array(ic * n));
  const nrm = tpl.nrm ? new Float32Array(vc * n * 3) : null, t2 = tpl.tpl ? new Float32Array(vc * n * 2) : null, uv = tpl.uv ? new Float32Array(vc * n * 2) : null;
  for (let o = 0; o < n; o++) {
    pos.set(tpl.pos, o * vc * 3); aIdx.fill(o, o * vc, (o + 1) * vc);
    if (nrm) nrm.set(tpl.nrm, o * vc * 3);
    if (t2) t2.set(tpl.tpl, o * vc * 2);
    if (uv) uv.set(tpl.uv, o * vc * 2);
    for (let k = 0; k < ic; k++) idx[o * ic + k] = tpl.idx[k] + o * vc;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aIdx', new THREE.BufferAttribute(aIdx, 1));
  if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (t2) g.setAttribute('aTpl', new THREE.BufferAttribute(t2, 2));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(maxInst * 4), 4);
  inst.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aChunk', inst);
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return g;
}

// ------------------------------------------------------------------ materials
export function coverMaterial(kind, U, { depth = false, alpha = null, std = {} } = {}) {
  const m = depth ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    : new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: kind === 'rock' ? THREE.FrontSide : THREE.DoubleSide, ...std });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + COMMON_V + BODY[kind]);
    if (depth) v = v.replace('#include <begin_vertex>', 'vec3 cP; vec3 cN; bool cK; coverMain(cP, cN, cK);\nvec3 transformed = cP;');
    else v = v.replace('#include <beginnormal_vertex>', 'vec3 cP; vec3 cN; bool cK; coverMain(cP, cN, cK);\nvec3 objectNormal = cN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = cP;');
    sh.vertexShader = v.replace('#include <project_vertex>', '#include <project_vertex>\nif (cK) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
    if (!depth) {
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON_F)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGC;' + (alpha ? ALPHA_F[alpha] : '') + (kind === 'flower' ? FLOWER_F : ''));
      if (kind !== 'rock') f = f.replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + TRANSLUCENT_F);
      // night: sky / IBL fill fades (street lamps and the moon are direct lights and still reach the ground cover)
      f = f.replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= 1.0 - 0.88 * uNight; reflectedLight.indirectSpecular *= 1.0 - 0.9 * uNight;');
      sh.fragmentShader = f;
    }
  };
  m.customProgramCacheKey = () => 'hbcover-' + kind + (depth ? '-d' : '');
  return m;
}
