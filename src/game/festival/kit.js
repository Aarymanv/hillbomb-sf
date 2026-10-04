// Geometry kit: collect primitives (with a colour and a transform) per material key, then merge each key into ONE mesh.
// Keeps festival sites / stunt props to a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export class Kit {
  constructor() { this.parts = new Map(); }
  // geo is cloned; color: hex / css / THREE.Color; t: {x,y,z, ry, rx, rz, sx, sy, sz} or a Matrix4
  add(key, geo, color, t = null) {
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (t) g.applyMatrix4(t.isMatrix4 ? t : mat(t));
    const c = color instanceof THREE.Color ? color : new THREE.Color(color ?? 0xffffff);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    let arr = this.parts.get(key); if (!arr) this.parts.set(key, arr = []);
    arr.push(g.index ? g.toNonIndexed() : g);
    return this;
  }
  box(key, w, h, d, color, t) { const g = new THREE.BoxGeometry(w, h, d); return this.add(key, g, color, t); }
  cyl(key, r0, r1, h, color, t, seg = 10) { return this.add(key, new THREE.CylinderGeometry(r0, r1, h, seg), color, t); }
  // build: mats = { key: Material } ; returns a Group of merged meshes (mesh.name = key)
  build(mats, { shadows = {} } = {}) {
    const group = new THREE.Group();
    for (const [key, arr] of this.parts) {
      if (!arr.length) continue;
      const geo = mergeGeometries(arr, false);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[key] || mats.std);
      m.name = key;
      m.castShadow = !!shadows[key]; m.receiveShadow = shadows[key] !== false;
      group.add(m);
    }
    return group;
  }
}
export function mat({ x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return _m.clone().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
// local (site frame) -> world transform helper: origin (ox, oy, oz) rotated by yaw
export function frame(ox, oy, oz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    x: (lx, lz) => ox + c * lx + s * lz,
    z: (lx, lz) => oz - s * lx + c * lz,
    t: (lx, ly, lz, extra = {}) => ({ ...extra, x: ox + c * lx + s * lz, y: oy + ly, z: oz - s * lx + c * lz, ry: yaw + (extra.ry || 0) }),
    yaw, ox, oy, oz,
  };
}
export const std = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, ...opts });
export const glowMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
