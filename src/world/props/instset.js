// InstanceSet: one InstancedMesh per prop model with CPU cell culling (distance + frustum), hide-by-index for
// breakables, extra "dynamic" slots for animated debris (knocked-over lamps etc). No per-frame allocations.
import * as THREE from 'three';
import { BOUNDS } from '../map.js';

const _sphere = new THREE.Sphere();

export class InstanceSet {
  constructor(name, geometry, material, { maxDist = 300, cell = 64, castShadow = false, receiveShadow = true, depthMaterial = null,
    attrs = null, color = false, dynamic = 0, height = 10, always = 45, cull = true, minDist = 0 } = {}) {
    this.name = name; this.geometry = geometry; this.material = material;
    this.maxDist = maxDist; this.cellSize = cell; this.castShadow = castShadow; this.receiveShadow = receiveShadow;
    this.depthMaterial = depthMaterial; this.attrDefs = attrs || {}; this.useColor = color; this.dynamicCap = dynamic;
    this.height = height; this.always = always; this.doCull = cull; this.minDist = minDist;
    this.m = []; this.x = []; this.z = []; this.a = {}; this.c = [];
    for (const k in this.attrDefs) this.a[k] = [];
    this.n = 0; this.dyn = []; this.dirty = true;
  }
  // m: 16 numbers (column-major, like Matrix4.elements). returns the build index
  add(m, attrVals = null, col = null) {
    for (let i = 0; i < 16; i++) this.m.push(m[i]);
    this.x.push(m[12]); this.z.push(m[14]);
    for (const k in this.attrDefs) { const s = this.attrDefs[k], v = attrVals?.[k]; for (let i = 0; i < s; i++) this.a[k].push(v ? (s === 1 ? v : v[i]) : 0); }
    if (this.useColor) this.c.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1);
    return this.n++;
  }
  finalize() {
    const n = this.n, C = this.cellSize;
    this.NX = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / C) + 1; this.NZ = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / C) + 1;
    const NC = this.NX * this.NZ;
    const cellOf = new Int32Array(n);
    this.cellCount = new Int32Array(NC); this.cellStart = new Int32Array(NC); this.cellY = new Float32Array(NC);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(this.NX - 1, Math.max(0, Math.floor((this.x[i] - BOUNDS.minX) / C)));
      const cz = Math.min(this.NZ - 1, Math.max(0, Math.floor((this.z[i] - BOUNDS.minZ) / C)));
      cellOf[i] = cz * this.NX + cx; this.cellCount[cellOf[i]]++;
    }
    let acc = 0; for (let c = 0; c < NC; c++) { this.cellStart[c] = acc; acc += this.cellCount[c]; }
    const fill = new Int32Array(NC);
    this.order = new Int32Array(n);       // build index -> sorted slot
    const src = new Float32Array(n * 16), px = new Float32Array(n), pz = new Float32Array(n);
    const asrc = {}; for (const k in this.attrDefs) asrc[k] = new Float32Array(n * this.attrDefs[k]);
    const csrc = this.useColor ? new Float32Array(n * 3) : null;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i], j = this.cellStart[c] + fill[c]++;
      this.order[i] = j;
      for (let q = 0; q < 16; q++) src[j * 16 + q] = this.m[i * 16 + q];
      px[j] = this.x[i]; pz[j] = this.z[i];
      this.cellY[c] += this.m[i * 16 + 13] / this.cellCount[c];
      for (const k in this.attrDefs) { const s = this.attrDefs[k]; for (let q = 0; q < s; q++) asrc[k][j * s + q] = this.a[k][i * s + q]; }
      if (csrc) for (let q = 0; q < 3; q++) csrc[j * 3 + q] = this.c[i * 3 + q];
    }
    this.src = src; this.px = px; this.pz = pz; this.asrc = asrc; this.csrc = csrc;
    this.alive = new Uint8Array(n).fill(1);
    this.m = this.x = this.z = this.a = this.c = null;
    // GPU side
    const cap = Math.max(1, (this.doCull ? n : n) + this.dynamicCap);
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    mesh.name = 'props:' + this.name;
    mesh.frustumCulled = false; mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow;
    mesh.matrixAutoUpdate = false;
    if (this.depthMaterial) mesh.customDepthMaterial = this.depthMaterial;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dstM = mesh.instanceMatrix.array;
    this.dstA = {};
    for (const k in this.attrDefs) {
      const s = this.attrDefs[k];
      const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * s), s); at.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(k, at); this.dstA[k] = at;
    }
    if (this.useColor) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    mesh.count = 0;
    this.mesh = mesh;
    this.attrList = Object.keys(this.dstA).map(k => ({ s: this.attrDefs[k], dst: this.dstA[k], src: this.asrc[k] }));
    if (!this.doCull) this.fillAll();
    return mesh;
  }
  slotOf(buildIndex) { return this.order[buildIndex]; }
  matrixAt(buildIndex, out) { const j = this.order[buildIndex]; out.fromArray(this.src, j * 16); return out; }
  hide(buildIndex) { const j = this.order[buildIndex]; if (this.alive[j]) { this.alive[j] = 0; this.dirty = true; if (!this.doCull) this.fillAll(); } }
  show(buildIndex) { const j = this.order[buildIndex]; if (!this.alive[j]) { this.alive[j] = 1; this.dirty = true; if (!this.doCull) this.fillAll(); } }
  // static sets (no culling): write everything once
  fillAll() {
    let count = 0;
    for (let j = 0; j < this.n; j++) { if (!this.alive[j]) continue; this._copy(j, count++); }
    this._commit(count);
  }
  _copy(j, d) {
    const S = this.src, D = this.dstM, so = j * 16, dO = d * 16;
    for (let q = 0; q < 16; q++) D[dO + q] = S[so + q];
    const L = this.attrList; for (let a = 0; a < L.length; a++) { const s = L[a].s, A = L[a].dst.array, B = L[a].src; for (let q = 0; q < s; q++) A[d * s + q] = B[j * s + q]; }
    if (this.csrc) { const A = this.mesh.instanceColor.array; A[d * 3] = this.csrc[j * 3]; A[d * 3 + 1] = this.csrc[j * 3 + 1]; A[d * 3 + 2] = this.csrc[j * 3 + 2]; }
  }
  _commit(count) {
    // dynamic slots (falling debris of this model) go after the static ones
    for (let i = 0; i < this.dyn.length; i++) {
      const d = this.dyn[i]; if (!d.active) continue;
      const dO = count * 16; for (let q = 0; q < 16; q++) this.dstM[dO + q] = d.m.elements[q];
      const L = this.attrList; for (let a = 0; a < L.length; a++) { const s = L[a].s, A = L[a].dst.array; for (let q = 0; q < s; q++) A[count * s + q] = d.attr ? d.attr[q] : 0; }
      if (this.csrc) { const A = this.mesh.instanceColor.array; A[count * 3] = d.col ? d.col[0] : 1; A[count * 3 + 1] = d.col ? d.col[1] : 1; A[count * 3 + 2] = d.col ? d.col[2] : 1; }
      count++;
    }
    const mesh = this.mesh;
    mesh.count = count; mesh.visible = count > 0;
    const im = mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, Math.max(1, count) * 16); im.needsUpdate = true;
    for (let a = 0; a < this.attrList.length; a++) { const at = this.attrList[a].dst, s = this.attrList[a].s; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, count) * s); at.needsUpdate = true; }
    if (this.csrc) { const ic = mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, Math.max(1, count) * 3); ic.needsUpdate = true; }
    this.dirty = false;
    this.visible = count;
  }
  // cull around the camera position (distance to cell + frustum), include everything within `always` metres (shadows)
  cull(camX, camZ, frustum) {
    if (!this.doCull) { if (this.dyn.length) this.fillAll(); return; }
    const C = this.cellSize, R = this.maxDist, R2 = R * R, A2 = this.always * this.always, cr = C * 0.7072, m2 = this.minDist * this.minDist;
    const cx0 = Math.max(0, Math.floor((camX - R - BOUNDS.minX) / C)), cx1 = Math.min(this.NX - 1, Math.floor((camX + R - BOUNDS.minX) / C));
    const cz0 = Math.max(0, Math.floor((camZ - R - BOUNDS.minZ) / C)), cz1 = Math.min(this.NZ - 1, Math.floor((camZ + R - BOUNDS.minZ) / C));
    let count = 0;
    const cap = this.n;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cz * this.NX + cx, n = this.cellCount[c];
        if (!n) continue;
        const ccx = BOUNDS.minX + (cx + 0.5) * C, ccz = BOUNDS.minZ + (cz + 0.5) * C;
        const dx = ccx - camX, dz = ccz - camZ, d2 = dx * dx + dz * dz;
        if (d2 > (R + cr) * (R + cr)) continue;
        if (d2 > (this.always + cr) * (this.always + cr) && frustum) {
          _sphere.center.set(ccx, this.cellY[c] + this.height * 0.5, ccz); _sphere.radius = cr + this.height;
          if (!frustum.intersectsSphere(_sphere)) continue;
        }
        const s0 = this.cellStart[c], s1 = s0 + n;
        for (let j = s0; j < s1; j++) {
          if (!this.alive[j]) continue;
          const ex = this.px[j] - camX, ez = this.pz[j] - camZ;
          const d2i = ex * ex + ez * ez; if (d2i > R2 || d2i < m2) continue;
          if (count >= cap) break;
          this._copy(j, count++);
        }
      }
    }
    void A2;
    this._commit(count);
  }
  // dynamic slot for an animated copy of this model (knocked over, falling)
  addDynamic(d) {
    if (this.dyn.length >= this.dynamicCap) { const old = this.dyn.findIndex(x => !x.active); if (old >= 0) this.dyn.splice(old, 1); else this.dyn.shift(); }
    d.active = true; this.dyn.push(d); this.dirty = true;
    return d;
  }
}
