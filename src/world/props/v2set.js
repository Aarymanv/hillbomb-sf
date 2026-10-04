// StreamSet: the tile-streamed twin of InstanceSet (same constructor + add() + cull() + hide/show + addDynamic), for
// the 1:1 map. Instances arrive in per-tile CHUNKS (begin(key) ... add() ... end()) and leave with drop(key); one
// InstancedMesh per model covers every loaded tile. Chunks are sorted into 64 m cells; cull() copies whole cells with
// one typed-array copy when a cell is fully inside the draw distance, testing instances one by one only on the rim.
import * as THREE from 'three';

const _sphere = new THREE.Sphere();

export class StreamSet {
  constructor(name, geometry, material, { maxDist = 300, cell = 64, castShadow = false, receiveShadow = true, depthMaterial = null,
    attrs = null, color = false, dynamic = 0, height = 10, always = 45, cull = true, minDist = 0 } = {}) {
    this.name = name; this.geometry = geometry; this.material = material;
    this.maxDist = maxDist; this.cellSize = cell; this.castShadow = castShadow; this.receiveShadow = receiveShadow;
    this.depthMaterial = depthMaterial; this.attrDefs = attrs || {}; this.useColor = color; this.dynamicCap = dynamic;
    this.height = height; this.always = always; this.doCull = cull; this.minDist = minDist;
    this.chunks = new Map(); this.total = 0; this.n = 0;
    this.dyn = []; this.dirty = true; this.cap = 0; this.mesh = null; this.parent = null; this._cur = null;
    this.attrList = [];
  }
  // material (optionally wrapped by matWrap, e.g. the props distance fade; re-applied when the material is swapped)
  get material() { return this._mat; }
  set material(m) { this._mat = this.matWrap ? this.matWrap(m) : m; if (this.mesh) this.mesh.material = this._mat; }
  // ---- chunk building
  begin(key) { this._cur = { key, m: [], a: Object.fromEntries(Object.keys(this.attrDefs).map(k => [k, []])), c: [], n: 0 }; return this._cur; }
  add(m, attrVals = null, col = null) {
    const C = this._cur;
    if (!C) throw new Error('StreamSet.add outside begin/end: ' + this.name);
    for (let i = 0; i < 16; i++) C.m.push(m[i]);
    for (const k in this.attrDefs) { const s = this.attrDefs[k], v = attrVals?.[k]; for (let i = 0; i < s; i++) C.a[k].push(v ? (s === 1 ? v : v[i]) : 0); }
    if (this.useColor) C.c.push(col ? col[0] : 1, col ? col[1] : 1, col ? col[2] : 1);
    return C.n++;
  }
  abort() { this._cur = null; }
  end() {
    const C = this._cur; this._cur = null;
    if (!C || !C.n) return null;
    if (this.chunks.has(C.key)) this.drop(C.key);
    const n = C.n, CS = this.cellSize;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = C.m[i * 16 + 12], z = C.m[i * 16 + 14]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const NX = Math.max(1, Math.ceil((x1 - x0 + 0.01) / CS)), NZ = Math.max(1, Math.ceil((z1 - z0 + 0.01) / CS)), NC = NX * NZ;
    const cellOf = new Int32Array(n), cnt = new Int32Array(NC);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(NX - 1, Math.floor((C.m[i * 16 + 12] - x0) / CS)), cz = Math.min(NZ - 1, Math.floor((C.m[i * 16 + 14] - z0) / CS));
      cellOf[i] = cz * NX + cx; cnt[cellOf[i]]++;
    }
    const start = new Int32Array(NC); let acc = 0; for (let c = 0; c < NC; c++) { start[c] = acc; acc += cnt[c]; }
    const fill = new Int32Array(NC), order = new Int32Array(n);
    const src = new Float32Array(n * 16), px = new Float32Array(n), pz = new Float32Array(n);
    const asrc = {}; for (const k in this.attrDefs) asrc[k] = new Float32Array(n * this.attrDefs[k]);
    const csrc = this.useColor ? new Float32Array(n * 3) : null;
    const cy = new Float32Array(NC), y0c = new Float32Array(NC).fill(1e9), y1c = new Float32Array(NC).fill(-1e9);
    for (let i = 0; i < n; i++) {
      const c = cellOf[i], j = start[c] + fill[c]++;
      order[i] = j;
      for (let q = 0; q < 16; q++) src[j * 16 + q] = C.m[i * 16 + q];
      const yy = C.m[i * 16 + 13]; px[j] = C.m[i * 16 + 12]; pz[j] = C.m[i * 16 + 14]; cy[c] += yy / cnt[c];
      if (yy < y0c[c]) y0c[c] = yy; if (yy > y1c[c]) y1c[c] = yy;
      for (const k in this.attrDefs) { const s = this.attrDefs[k]; for (let q = 0; q < s; q++) asrc[k][j * s + q] = C.a[k][i * s + q]; }
      if (csrc) for (let q = 0; q < 3; q++) csrc[j * 3 + q] = C.c[i * 3 + q];
    }
    // non-empty cells only
    const cells = [];
    // y = middle of the instances' base heights, dy = half their spread (a 64 m cell on a 30 % SF grade spans ~20 m)
    for (let c = 0; c < NC; c++) if (cnt[c]) cells.push({ x: x0 + ((c % NX) + 0.5) * CS, z: z0 + (Math.floor(c / NX) + 0.5) * CS, y: (y0c[c] + y1c[c]) / 2, dy: (y1c[c] - y0c[c]) / 2, s0: start[c], s1: start[c] + cnt[c] });
    const ch = { key: C.key, n, src, px, pz, asrc, csrc, order, cells, alive: new Uint8Array(n).fill(1), dead: 0, x0, z0, x1, z1 };
    this.chunks.set(C.key, ch);
    this.total += n; this.n = this.total;
    this._ensure(this.doCull ? this.total : this.total);
    this.dirty = true;
    return ch;
  }
  drop(key) {
    const ch = this.chunks.get(key); if (!ch) return;
    this.chunks.delete(key); this.total -= ch.n; this.n = this.total; this.dirty = true;
  }
  // ---- GPU side
  finalize(parent = null) {
    if (parent) this.parent = parent;
    if (!this.mesh) this._ensure(Math.max(64, this.total));
    return this.mesh;
  }
  _ensure(n) {
    const need = n + this.dynamicCap + 1;
    if (this.mesh && need <= this.cap) return;
    const cap = Math.max(64, Math.ceil(need * 1.5));
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    mesh.name = 'props2:' + this.name;
    mesh.frustumCulled = false; mesh.castShadow = this.castShadow; mesh.receiveShadow = this.receiveShadow; mesh.matrixAutoUpdate = false;
    if (this.depthMaterial) mesh.customDepthMaterial = this.depthMaterial;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.attrList = [];
    for (const k in this.attrDefs) {
      const s = this.attrDefs[k];
      const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * s), s); at.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(k, at); this.attrList.push({ k, s, dst: at });
    }
    if (this.useColor) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    mesh.count = 0; mesh.visible = false;
    this.mesh = mesh; this.cap = cap; this.dstM = mesh.instanceMatrix.array;
    if (old) {
      const p = old.parent; if (p) { p.remove(old); p.add(mesh); }
      old.dispose?.();
    } else if (this.parent) this.parent.add(mesh);
    this.dirty = true;
  }
  // ---- per-instance state (chunk key + build index)
  matrixAt(key, i, out) { const ch = this.chunks.get(key); if (ch) out.fromArray(ch.src, ch.order[i] * 16); return out; }
  hide(key, i) { const ch = this.chunks.get(key); if (!ch) return; const j = ch.order[i]; if (ch.alive[j]) { ch.alive[j] = 0; ch.dead++; this.dirty = true; } }
  show(key, i) { const ch = this.chunks.get(key); if (!ch) return; const j = ch.order[i]; if (!ch.alive[j]) { ch.alive[j] = 1; ch.dead--; this.dirty = true; } }
  setAttr(key, i, name, v) {
    const ch = this.chunks.get(key); if (!ch) return;
    const a = ch.asrc[name], j = ch.order[i];
    if (a[j] !== v) { a[j] = v; this.dirty = true; }
  }
  addDynamic(d) {
    if (this.dyn.length >= this.dynamicCap) { const old = this.dyn.findIndex(x => !x.active); if (old >= 0) this.dyn.splice(old, 1); else this.dyn.shift(); }
    d.active = true; this.dyn.push(d); this.dirty = true;
    return d;
  }
  _geoR() {
    if (this._gR === undefined || this._gRg !== this.geometry) {
      const g = this.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      this._gRg = g; this._gR = g.boundingSphere ? Math.min(80, g.boundingSphere.center.length() + g.boundingSphere.radius) : 0;   // (impostor quads carry a huge sphere)
    }
    return this._gR;
  }
  // ---- copy helpers
  _copyRange(ch, j0, j1, d) {
    const n = j1 - j0;
    this.dstM.set(ch.src.subarray(j0 * 16, j1 * 16), d * 16);
    for (let a = 0; a < this.attrList.length; a++) { const L = this.attrList[a]; L.dst.array.set(ch.asrc[L.k].subarray(j0 * L.s, j1 * L.s), d * L.s); }
    if (ch.csrc) this.mesh.instanceColor.array.set(ch.csrc.subarray(j0 * 3, j1 * 3), d * 3);
    return n;
  }
  _copy(ch, j, d) {
    const S = ch.src, D = this.dstM, so = j * 16, dO = d * 16;
    for (let q = 0; q < 16; q++) D[dO + q] = S[so + q];
    for (let a = 0; a < this.attrList.length; a++) { const L = this.attrList[a], A = L.dst.array, B = ch.asrc[L.k]; for (let q = 0; q < L.s; q++) A[d * L.s + q] = B[j * L.s + q]; }
    if (ch.csrc) { const A = this.mesh.instanceColor.array; A[d * 3] = ch.csrc[j * 3]; A[d * 3 + 1] = ch.csrc[j * 3 + 1]; A[d * 3 + 2] = ch.csrc[j * 3 + 2]; }
  }
  _commit(count) {
    const cap = this.cap;
    for (let i = 0; i < this.dyn.length && count < cap; i++) {
      const d = this.dyn[i]; if (!d.active) continue;
      const dO = count * 16; for (let q = 0; q < 16; q++) this.dstM[dO + q] = d.m.elements[q];
      for (let a = 0; a < this.attrList.length; a++) { const L = this.attrList[a], A = L.dst.array; for (let q = 0; q < L.s; q++) A[count * L.s + q] = d.attr ? d.attr[q] : 0; }
      if (this.useColor) { const A = this.mesh.instanceColor.array; A[count * 3] = d.col ? d.col[0] : 1; A[count * 3 + 1] = d.col ? d.col[1] : 1; A[count * 3 + 2] = d.col ? d.col[2] : 1; }
      count++;
    }
    const mesh = this.mesh;
    mesh.count = count; mesh.visible = count > 0;
    const im = mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, Math.max(1, count) * 16); im.needsUpdate = true;
    for (let a = 0; a < this.attrList.length; a++) { const at = this.attrList[a].dst, s = this.attrList[a].s; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, count) * s); at.needsUpdate = true; }
    if (this.useColor) { const ic = mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, Math.max(1, count) * 3); ic.needsUpdate = true; }
    this.dirty = false; this.visible = count;
  }
  fillAll() {
    if (!this.mesh) return;
    let count = 0;
    for (const ch of this.chunks.values()) {
      if (!ch.dead) { count += this._copyRange(ch, 0, ch.n, count); continue; }
      for (let j = 0; j < ch.n; j++) if (ch.alive[j]) this._copy(ch, j, count++);
    }
    this._commit(count);
  }
  cull(camX, camZ, frustum) {
    if (!this.mesh) return;
    if (this.mesh.material !== this._mat) this.mesh.material = this._mat = this.matWrap ? this.matWrap(this.mesh.material) : this.mesh.material;
    if (!this.doCull) { if (this.dirty || this.dyn.length) this.fillAll(); return; }
    const R = this.maxDist, R2 = R * R, cr = this.cellSize * 0.7072, m2 = this.minDist * this.minDist, AL = this.always + cr;
    let count = 0;
    for (const ch of this.chunks.values()) {
      const bx = Math.max(ch.x0 - camX, 0, camX - ch.x1), bz = Math.max(ch.z0 - camZ, 0, camZ - ch.z1);
      if (bx * bx + bz * bz > R2) continue;
      const cells = ch.cells;
      for (let c = 0; c < cells.length; c++) {
        const C = cells[c], dx = C.x - camX, dz = C.z - camZ, d2 = dx * dx + dz * dz;
        if (d2 > (R + cr) * (R + cr)) continue;
        const d = Math.sqrt(d2);
        if (d > AL && frustum) {
          // (+ the model's own radius: a mast arm / shelter / tree crown at a cell corner reaches past the cell sphere and
          // blinked out at the screen edge as the camera turned)
          _sphere.center.set(C.x, C.y + this.height * 0.5, C.z); _sphere.radius = cr + C.dy + Math.max(this.height, this._geoR());
          if (!frustum.intersectsSphere(_sphere)) continue;
        }
        if (d + cr <= R && (m2 === 0 || d - cr >= this.minDist) && !ch.dead) { count += this._copyRange(ch, C.s0, C.s1, count); continue; }
        for (let j = C.s0; j < C.s1; j++) {
          if (!ch.alive[j]) continue;
          const ex = ch.px[j] - camX, ez = ch.pz[j] - camZ, di = ex * ex + ez * ez;
          if (di > R2 || di < m2) continue;
          this._copy(ch, j, count++);
        }
      }
    }
    this._commit(count);
  }
}
