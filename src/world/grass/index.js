// GPU grass + ground cover (both maps). Ring of camera-centred, world-aligned chunks per layer; each visible chunk is one
// instance of a batch geometry holding N objects, placed/animated entirely in the vertex shader (glsl.js). CPU per frame:
// chunk frustum tests (cached bounds) + a few uniforms; a top-down ground capture every ~32 m of travel.
//
//   const grass = createGrass({ scene, env, terrain, ground: [roots whose meshes are ground], blocked: [roots never grassed] });
//   grass.update(dt, { camera, focus })      // from world.update
// Meshes inside ground roots whose name looks like road/sidewalk/deck/paved are treated as blocked (see capture.js).
import * as THREE from 'three';
import { PBR } from '../assets.js';
import { BOUNDS } from '../map.js';
import { HF_RES } from '../terrain.js';
import { GroundCapture, BioWindow } from './capture.js';
import { TEMPLATES, batchGeometry, coverMaterial } from './layers.js';
import { TERRAIN_BIO } from '../../render/terrainmat.js';

const C = (...cls) => cls.reduce((m, c) => m | (1 << c), 0);
// near/far (m), chunk (m), objects per chunk, template, class mask, extra height for bounds, salt
const LAYERS = [
  { name: 'grass0', kind: 'grass', tpl: 'blade4', near: 0, far: 20, chunk: 8, n: 7040, mask: C(3, 4, 5, 6, 7, 8, 9), hMax: 1.2, salt: 11 },
  { name: 'grass1', kind: 'grass', tpl: 'blade2', near: 20, far: 45, chunk: 16, n: 6016, mask: C(3, 4, 5, 6, 7, 8, 9), hMax: 1.2, salt: 12 },
  { name: 'grass2', kind: 'grass', tpl: 'blade1', near: 45, far: 90, chunk: 32, n: 5632, mask: C(3, 4, 5, 6, 7, 8, 9), hMax: 1.2, salt: 13 },
  { name: 'flowers', kind: 'flower', tpl: 'flower', near: 0, far: 50, chunk: 16, n: 768, mask: C(3, 8, 9), hMax: 1, salt: 21 },
  { name: 'ferns', kind: 'fern', tpl: 'fern', near: 0, far: 60, chunk: 16, n: 128, mask: C(7), hMax: 1.3, alpha: 'fern', salt: 31 },
  { name: 'shrubs', kind: 'shrub', tpl: 'shrub', near: 0, far: 120, chunk: 32, n: 96, mask: C(3, 4, 7, 8), hMax: 2.6, alpha: 'shrub', salt: 41 },
  { name: 'rocks', kind: 'rock', tpl: 'rock', near: 0, far: 150, chunk: 32, n: 24, mask: C(3, 4, 5, 6, 7, 8), hMax: 3.5, salt: 51, cast: true },
];
const GRASS_FAR = 90;

export function createGrass({ scene, env, terrain, ground = [], blocked = [], renderer = env?.renderer }) {
  if (!renderer || !terrain) return null;
  const qName = env?.quality?.name || 'high';
  const densMul = qName === 'low' ? 0.45 : qName === 'medium' ? 0.7 : 1;
  const grid = terrain.X0 !== undefined ? { x0: terrain.X0, z0: terrain.Z0, cell: terrain.CELL || 4 } : { x0: BOUNDS.minX, z0: BOUNDS.minZ, cell: HF_RES };
  const clsAt = terrain.surfaceRaw ? (x, z) => terrain.surfaceRaw(x, z) : (x, z) => terrain.surfaceAt(x, z);
  const heightAt = (x, z) => terrain.heightAt(x, z);

  const cap = new GroundCapture(renderer, { ground, blocked });
  const bio = new BioWindow({ grid, cls: clsAt, height: heightAt });
  TERRAIN_BIO.tBio.value = bio.tex; TERRAIN_BIO.tBioXf.value = bio.xf;   // terrain grass layer follows the blade colours
  const flat = Array.from({ length: 12 }, () => new THREE.Vector4());
  const U = {
    uCap: { value: cap.rt.texture }, uCapXf: { value: cap.xf }, uBio: { value: bio.tex }, uBioXf: { value: bio.xf },
    uTime: { value: 0 }, uWind: { value: new THREE.Vector4(0.94, 0.34, 0.4, 0) }, uFlat: { value: flat },
    uCam: { value: new THREE.Vector3() }, uDensMul: { value: densMul }, uNight: { value: 0 },
  };
  const group = new THREE.Group(); group.name = 'grass';
  scene.add(group);
  const rockTex = PBR.tex('cliff_rock');
  const layers = [];
  for (const L of LAYERS) {
    const tpl = TEMPLATES[L.tpl]();
    const maxInst = Math.ceil((2 * L.far / L.chunk + 3) ** 2);
    const geo = batchGeometry(tpl, L.n, maxInst);
    const LU = { ...U, uLayer: { value: new THREE.Vector4(L.near, L.far, L.n / (L.chunk * L.chunk), L.kind === 'grass' ? GRASS_FAR : L.far) } };
    const std = L.kind === 'rock' ? { map: rockTex.map, normalMap: rockTex.normalMap, roughnessMap: rockTex.roughnessMap, roughness: 1 } : L.kind === 'shrub' ? { roughness: 0.75 } : {};
    const mat = coverMaterial(L.kind, LU, { alpha: L.alpha, std });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'grass-' + L.name; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    if (L.cast && renderer.shadowMap.enabled) { mesh.castShadow = true; mesh.customDepthMaterial = coverMaterial(L.kind, LU, { depth: true }); }
    const lay = { ...L, geo, mesh, attr: geo.attributes.aChunk, count: 0, maxInst, cache: new Map() };
    // never draw in override passes (e.g. the rain-occlusion render), which would lose the procedural placement
    mesh.onBeforeRender = (r, s) => { if (s.overrideMaterial) geo.instanceCount = 0; };
    mesh.onAfterRender = () => { geo.instanceCount = lay.count; };
    group.add(mesh); layers.push(lay);
  }

  // ------------------------------------------------------------ chunk bounds + class mask (cached per chunk)
  let budget = 0;
  function chunkInfo(lay, i, j) {
    const key = (i + 32768) * 65536 + (j + 32768);
    let inf = lay.cache.get(key);
    if (inf || budget <= 0) return inf;
    budget--;
    const cs = lay.chunk, x0 = i * cs, z0 = j * cs, st = Math.min(4, cs / 2), n = Math.round(cs / st);
    let mn = Infinity, mx = -Infinity, mask = 0;
    for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
      const x = x0 + a * st, z = z0 + b * st, h = heightAt(x, z);
      if (h < mn) mn = h; if (h > mx) mx = h;
      mask |= 1 << (clsAt(x, z) | 0);
    }
    inf = { mn, mx, mask };
    if (lay.cache.size > 30000) lay.cache.clear();
    lay.cache.set(key, inf);
    return inf;
  }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), box = new THREE.Box3();
  function fill(lay, cam) {
    const { chunk: cs, near, far, hMax } = lay, cx = cam.x, cy = cam.y, cz = cam.z, arr = lay.attr.array;
    const i0 = Math.floor((cx - far) / cs), i1 = Math.floor((cx + far) / cs), j0 = Math.floor((cz - far) / cs), j1 = Math.floor((cz + far) / cs);
    let k = 0;
    const pad = lay.kind === 'rock' || lay.kind === 'shrub' ? 3 : 1.5;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x0 = i * cs, z0 = j * cs;
      const dx = Math.max(x0 - cx, 0, cx - x0 - cs), dz = Math.max(z0 - cz, 0, cz - z0 - cs);
      if (dx * dx + dz * dz > far * far) continue;
      const inf = chunkInfo(lay, i, j);
      if (!inf || !(inf.mask & lay.mask)) continue;
      const dy = Math.max(inf.mn - cy, 0, cy - inf.mx - hMax);
      if (dx * dx + dz * dz + dy * dy > far * far) continue;
      if (near > 0) {
        const fx = Math.max(Math.abs(cx - x0), Math.abs(cx - x0 - cs)), fz = Math.max(Math.abs(cz - z0), Math.abs(cz - z0 - cs)), fy = Math.max(Math.abs(cy - inf.mn), Math.abs(cy - inf.mx - hMax));
        if (fx * fx + fz * fz + fy * fy < near * near) continue;
      }
      box.min.set(x0 - pad, inf.mn - 1.5, z0 - pad); box.max.set(x0 + cs + pad, inf.mx + hMax, z0 + cs + pad);
      if (!frustum.intersectsBox(box)) continue;
      if (k >= lay.maxInst) break;
      arr[k * 4] = x0; arr[k * 4 + 1] = z0; arr[k * 4 + 2] = cs; arr[k * 4 + 3] = lay.salt; k++;
    }
    lay.count = k; lay.geo.instanceCount = k;
    lay.attr.addUpdateRange(0, Math.max(4, k * 4)); lay.attr.needsUpdate = true;
  }

  // ------------------------------------------------------------ flattening trail (player car / on foot)
  const trail = []; let time = 0;
  function updateFlat(focus) {
    const n = trail.length;
    if (focus) {
      const gy = heightAt(focus.x, focus.z), onGround = Math.abs(focus.y - gy) < 2.5;
      const foot = window.__G?.player?.mode === 'foot';
      const r = foot ? 0.55 : 1.9;
      const last = trail[n - 1];
      if (onGround && (!last || Math.hypot(focus.x - last.x, focus.z - last.z) > 1.2)) { trail.push({ x: focus.x, z: focus.z, r, t: time }); if (trail.length > 11) trail.shift(); }
      flat[0].set(focus.x, focus.z, r, onGround ? 1 : 0);
    } else flat[0].set(0, 0, 0, 0);
    for (let k = 0; k < 11; k++) {
      const p = trail[trail.length - 1 - k];
      if (!p) { flat[k + 1].set(0, 0, 0, 0); continue; }
      flat[k + 1].set(p.x, p.z, p.r, Math.max(0, Math.exp(-(time - p.t) / 5) * 0.95 - 0.05));
    }
  }

  let enabled = true;
  const api = {
    group, layers, capture: cap, bio, uniforms: U,
    get enabled() { return enabled; }, set enabled(v) { enabled = !!v; group.visible = enabled; },
    update(dt, info = {}) {
      if (!enabled) return;
      const camera = info.camera; if (!camera) return;
      time += dt;
      camera.updateMatrixWorld();
      const cp = camera.position;
      U.uCam.value.copy(cp);
      U.uTime.value = time % 3600;
      U.uNight.value = typeof env?.night === 'number' ? env.night : env?.night?.value ?? 0;
      const w = env?.weather;
      const wind = w ? w.wind ?? 0.22 : 0.22;
      const ang = 0.35 + 0.25 * Math.sin(time * 0.013);                       // westerly off the ocean, slowly veering
      U.uWind.value.set(Math.cos(ang), Math.sin(ang), 0.18 + 1.1 * wind, w?.wetness ?? 0);
      bio.update(cp.x, cp.z);
      cap.age += dt;
      if (Math.hypot(cp.x - cap.cx, cp.z - cap.cz) > 32 || cap.age > 4) cap.capture(cp.x, cp.z);
      updateFlat(info.focus);
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      budget = 48;
      for (const lay of layers) fill(lay, cp);
    },
    stats() { const o = {}; for (const l of layers) o[l.name] = l.count; return o; },
  };
  window.__grass = api;
  return api;
}
