// Contact shadows: a soft ambient-occlusion blob under every car (driven vehicles + parked instances) so cars sit ON the
// road instead of hovering over it. One InstancedMesh (one draw call): a unit quad in XZ, oriented to the ground under
// the car, scaled to its footprint; the blob texture holds the body's soft umbra plus four darker tyre-contact spots.
//   update(vehicles, camera, world): dynamic cars every frame (from the physics wheel contacts), parked cars refreshed
//   from world.props.parked every ~0.5 s (nearest first, within RANGE).
import * as THREE from 'three';
import { getModelSpec } from '../vehicle/models.js';

const RANGE = 150, FADE0 = 110, MAX = 400;

function blobTexture() {
  const W = 128, H = 256;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) { const t = new THREE.DataTexture(new Uint8Array([160, 160, 160, 255]), 1, 1); t.needsUpdate = true; return t; }
  c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W * 2 - 1, v = (y + 0.5) / H * 2 - 1;
    // rounded-rectangle distance (footprint ~ 0.78 x 0.86 of the quad), soft penumbra outwards
    const qx = Math.abs(u) - 0.62, qy = Math.abs(v) - 0.74, r = 0.14;
    const sd = Math.hypot(Math.max(qx + r, 0), Math.max(qy + r, 0)) + Math.min(Math.max(qx + r, qy + r), 0) - r;
    let a = 0.62 * (1 - sstep(-0.22, 0.2, sd));
    a += 0.18 * (1 - sstep(-0.5, 0.0, sd));                        // denser core under the floor pan
    // tyre contacts (typical car: axles at +-0.58 of the half length, wheels at +-0.72 of the half width)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const dx = (u - sx * 0.7) / 0.13, dy = (v - sy * 0.58) / 0.16;
      a = Math.max(a, 0.92 * Math.exp(-(dx * dx + dy * dy) * 1.6));
    }
    const k = (y * W + x) * 4, val = Math.round(Math.min(1, a) * 255);
    d[k] = d[k + 1] = d[k + 2] = val; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

export function createCarShadows(scene) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n#ifdef USE_COLOR\ndiffuseColor.a *= vColor.r;\n#endif\ndiffuseColor.rgb = vec3(0.0);');
  };
  mat.customProgramCacheKey = () => 'hb-car-contact-shadow';
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'carContactShadows'; mesh.frustumCulled = false; mesh.renderOrder = -1;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  scene.add(mesh);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _c = new THREE.Color(), _gn = {};
  const _basis = new THREE.Matrix4();
  let parkedCache = [], parkedT = 0;
  const specOf = new Map();

  function put(i, x, y, z, fx, fz, nx, ny, nz, w, l, alpha) {
    // orthonormal frame: up = ground normal, forward = the car's heading projected onto the ground
    _n.set(nx, ny, nz).normalize();
    _f.set(fx, 0, fz); _f.addScaledVector(_n, -_f.dot(_n)).normalize();
    _r.crossVectors(_f, _n).normalize();
    _basis.makeBasis(_r, _n, _f.negate());
    _q.setFromRotationMatrix(_basis);
    _m.compose(_p.set(x, y, z), _q, _s.set(w, 1, l));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setScalar(alpha));
  }

  function refreshParked(world, cam) {
    const P = world.props?.parked; parkedCache = [];
    if (!P) return;
    const list = P.list, out = [];
    for (const p of list) {
      if (p.hidden) continue;
      const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (d2 > RANGE * RANGE) continue;
      out.push([d2, p]);
    }
    out.sort((a, b) => a[0] - b[0]);
    for (const [d2, p] of out.slice(0, MAX - 60)) {
      let sp = specOf.get(p.model);
      if (!sp) { try { sp = getModelSpec(p.model); } catch { sp = null; } if (!sp && p.collider) sp = { width: p.collider.hx * 2, length: p.collider.hz * 2 }; specOf.set(p.model, sp); }
      const w = (sp?.width ?? 1.85), l = (sp?.length ?? 4.6);
      // ground slope along the car (SF grades): heights front / back / left / right
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const hF = world.groundAt(p.x + fx * l * 0.4, p.z + fz * l * 0.4, p.y + 2, _gn), hB = world.groundAt(p.x - fx * l * 0.4, p.z - fz * l * 0.4, p.y + 2, _gn);
      const hL = world.groundAt(p.x - fz * w * 0.4, p.z + fx * w * 0.4, p.y + 2, _gn), hR = world.groundAt(p.x + fz * w * 0.4, p.z - fx * w * 0.4, p.y + 2, _gn);
      const yc = (hF + hB + hL + hR) / 4;
      // normal from the two slopes
      const a = new THREE.Vector3(fx * l * 0.8, hF - hB, fz * l * 0.8), b = new THREE.Vector3(fz * w * 0.8, hR - hL, -fx * w * 0.8);
      const n = new THREE.Vector3().crossVectors(b, a).normalize(); if (n.y < 0) n.negate();
      parkedCache.push({ x: p.x, y: yc, z: p.z, fx, fz, n, w, l, d: Math.sqrt(d2) });
    }
  }

  function update(vehicles, camera, world) {
    const cam = camera.position;
    parkedT -= 1;
    if (parkedT <= 0) { refreshParked(world, cam); parkedT = 30; }
    let i = 0;
    for (const v of vehicles) {
      if (i >= MAX) break;
      if (!v.root || v.root.visible === false || !v.body) continue;
      const b = v.body, sp = v.spec || v.visual?.spec;
      const dx = b.pos.x - cam.x, dz = b.pos.z - cam.z, d = Math.hypot(dx, dz);
      if (d > RANGE) continue;
      let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0, k = 0;
      for (const w of b.wheels) if (w.contact) { cx += w.cp.x; cy += w.cp.y; cz += w.cp.z; nx += w.n.x; ny += w.n.y; nz += w.n.z; k++; }
      let alpha = 1;
      if (k >= 2) { cx /= k; cy /= k; cz /= k; }
      else {
        // airborne: shadow drops to the ground under the car and fades with height
        cx = b.pos.x; cz = b.pos.z; cy = world.groundAt(cx, cz, b.pos.y + 1, _gn); nx = _gn.x ?? 0; ny = _gn.y ?? 1; nz = _gn.z ?? 0;
        alpha = Math.max(0, 1 - Math.max(0, b.pos.y - cy - 0.4) / 2.5);
        if (alpha <= 0.01) continue;
      }
      b.forward ? b.forward(_f) : _f.set(0, 0, -1).applyQuaternion(b.quat);
      alpha *= 1 - THREE.MathUtils.smoothstep(d, FADE0, RANGE);
      const w = (sp?.width ?? 1.85) + 0.32, l = (sp?.length ?? 4.6) + 0.45;
      put(i++, cx, cy + 0.035, cz, _f.x, _f.z, nx || 0, ny || 1, nz || 0, w, l, alpha);
    }
    for (const p of parkedCache) {
      if (i >= MAX) break;
      const alpha = 1 - THREE.MathUtils.smoothstep(p.d, FADE0, RANGE);
      put(i++, p.x, p.y + 0.035, p.z, p.fx, p.fz, p.n.x, p.n.y, p.n.z, p.w + 0.32, p.l + 0.45, alpha * 0.95);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { mesh, update, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mat.alphaMap?.dispose(); } };
}
