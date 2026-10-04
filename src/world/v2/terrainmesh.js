// Streamed terrain for the 1:1 map: per 512 m tile, 3 LODs (4 m near, 8 m mid, 32 m far) chosen by distance with
// hysteresis; far tiles are merged into 2 km chunks (few draw calls) and rebuilt without the tiles that went finer.
// Every tile has a skirt so LOD seams never show sky. Splat weights come from the baked surface raster.
import * as THREE from 'three';
import { makeTerrainMaterial } from '../../render/terrainmat.js';

const LOD_STEP = [1, 2, 8];                 // grid cells per vertex (cell = 4 m)
const LOD_DIST = [520, 1900];              // switch finer below these (m, tile nearest point); coarser at 1.2x
const CHUNK = 4;                            // far chunk = 4 x 4 tiles
// surface class -> [grass, forest, sand, rock] weights and a colour tint
const SPLAT = [
  [0, 0, 0.55, 0.45, 0.62, 0.64, 0.6],      // 0 water (sea / lake bed)
  [0, 0.2, 0, 0.8, 0.42, 0.42, 0.42],       // 1 asphalt bed (under the road mesh)
  [0, 0.1, 0.1, 0.8, 0.8, 0.78, 0.74],      // 2 concrete / paved ground
  [1, 0, 0, 0, 1, 1, 1],                    // 3 grass
  [0, 0, 1, 0, 1, 1, 1],                    // 4 sand
  [0.1, 0.9, 0, 0, 1.08, 1.0, 0.92],        // 5 dirt
  [0, 0, 0, 1, 1, 1, 1],                    // 6 rock
  [0.3, 0.7, 0, 0, 0.9, 0.95, 0.85],        // 7 forest
  [0.55, 0.45, 0, 0, 1.12, 1.0, 0.74],      // 8 scrub (dry coastal grass)
  [0.78, 0.22, 0, 0, 0.92, 0.96, 0.86],     // 9 yard / backyard gardens
];

export function registerTerrain(stream, { data, terrain, root }) {
  const mat = makeTerrainMaterial();
  const NX = data.NX, NZ = data.NZ, H = data.height, S = data.surf;
  const T = stream.T, CPT = T / data.meta.cell;          // cells per tile (128)
  const tiles = new Map();                                // key -> { tile, lod, mesh, want }
  const chunks = new Map();                               // chunk key -> { mesh, dirty }
  const q = [];

  function build(tile, lod) {
    const st = LOD_STEP[lod], n = CPT / st + 1;
    const i0 = Math.round((tile.x0 - data.meta.extent.x0) / data.meta.cell), j0 = Math.round((tile.z0 - data.meta.extent.z0) / data.meta.cell);
    const nv = n * n + 4 * n;                              // grid + skirt ring
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), spl = new Float32Array(nv * 4);
    const hAt = (i, j) => { i = i < 0 ? 0 : i >= NX ? NX - 1 : i; j = j < 0 ? 0 : j >= NZ ? NZ - 1 : j; return H[j * NX + i] * 0.01; };
    let minY = Infinity, maxY = -Infinity;
    const put = (v, i, j, dy) => {
      const x = data.meta.extent.x0 + i * data.meta.cell, z = data.meta.extent.z0 + j * data.meta.cell, y = hAt(i, j) + dy;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const e = st;
      const gx = (hAt(i + e, j) - hAt(i - e, j)) / (2 * e * data.meta.cell), gz = (hAt(i, j + e) - hAt(i, j - e)) / (2 * e * data.meta.cell);
      const l = Math.hypot(gx, 1, gz); nor[v * 3] = -gx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -gz / l;
      uv[v * 2] = x / 64; uv[v * 2 + 1] = z / 64;
      // splat: average the surface classes of the cells this vertex stands for (softer far LODs)
      let a = 0, b = 0, c = 0, d = 0, r = 0, g = 0, bl = 0, cnt = 0;
      const s0 = st > 1 ? -(st >> 1) : 0, s1 = st > 1 ? st >> 1 : 0, ss = Math.max(1, st >> 1);
      for (let jj = s0; jj <= s1; jj += ss) for (let ii = s0; ii <= s1; ii += ss) {
        const ci = Math.min(NX - 1, Math.max(0, i + ii)), cj = Math.min(NZ - 1, Math.max(0, j + jj));
        const k = SPLAT[S[cj * NX + ci]] || SPLAT[3];
        a += k[0]; b += k[1]; c += k[2]; d += k[3]; r += k[4]; g += k[5]; bl += k[6]; cnt++;
      }
      spl[v * 4] = a / cnt; spl[v * 4 + 1] = b / cnt; spl[v * 4 + 2] = c / cnt; spl[v * 4 + 3] = d / cnt;
      col[v * 3] = r / cnt; col[v * 3 + 1] = g / cnt; col[v * 3 + 2] = bl / cnt;
    };
    let v = 0;
    for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) put(v++, i0 + ii * st, j0 + jj * st, 0);
    // skirt: the border ring again, 6 m lower (hides LOD cracks)
    const ring = [];
    for (let ii = 0; ii < n; ii++) ring.push([ii, 0]);
    for (let jj = 1; jj < n; jj++) ring.push([n - 1, jj]);
    for (let ii = n - 2; ii >= 0; ii--) ring.push([ii, n - 1]);
    for (let jj = n - 2; jj >= 1; jj--) ring.push([0, jj]);
    const skirt0 = v;
    for (const [ii, jj] of ring) put(v++, i0 + ii * st, j0 + jj * st, -6);
    const idx = [];
    for (let jj = 0; jj < n - 1; jj++) for (let ii = 0; ii < n - 1; ii++) {
      const a0 = jj * n + ii, b0 = a0 + 1, c0 = a0 + n, d0 = c0 + 1;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    for (let k = 0; k < ring.length; k++) {
      const [ii, jj] = ring[k], [i2, j2] = ring[(k + 1) % ring.length];
      const top0 = jj * n + ii, top1 = j2 * n + i2, bot0 = skirt0 + k, bot1 = skirt0 + (k + 1) % ring.length;
      idx.push(top0, top1, bot0, top1, bot1, bot0, top0, bot0, top1, top1, bot0, bot1);    // both windings (skirt is seen from either side)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(spl.subarray(0, v * 4), 4));
    g.setIndex(v > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    g.userData = { minY, maxY };
    return g;
  }
  const deep = new Map();
  function tileIsDeepWater(tile) {
    if (deep.has(tile.key)) return deep.get(tile.key);
    const i0 = Math.round((tile.x0 - data.meta.extent.x0) / data.meta.cell), j0 = Math.round((tile.z0 - data.meta.extent.z0) / data.meta.cell);
    let mx = -1e9;
    for (let j = j0; j <= j0 + CPT; j += 4) for (let i = i0; i <= i0 + CPT; i += 4) { const ii = Math.min(NX - 1, i), jj = Math.min(NZ - 1, j); mx = Math.max(mx, H[jj * NX + ii] * 0.01); }
    const r = mx < -14; deep.set(tile.key, r); return r;
  }
  function wantLod(t, cur) {
    const d = stream.dist(t.tile, stream.focus.x, stream.focus.z);
    let lod = d <= LOD_DIST[0] ? 0 : d <= LOD_DIST[1] ? 1 : 2;
    if (cur !== undefined && lod > cur) {              // hysteresis when coarsening
      if (cur === 0 && d <= LOD_DIST[0] * 1.2) lod = 0;
      else if (cur === 1 && d <= LOD_DIST[1] * 1.2) lod = 1;
    }
    return lod;
  }
  const chunkKey = t => Math.floor(t.tx / CHUNK) * 1000 + Math.floor(t.tz / CHUNK);
  function rebuildChunk(ck) {
    const c = chunks.get(ck);
    if (c?.mesh) { root.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    const parts = [];
    for (const t of tiles.values()) if (chunkKey(t.tile) === ck) {
      if (t.lod === 2 && t.farGeo) parts.push(t.farGeo);
      // the tile's LOD1 mesh stays up until its far geometry is in the chunk (no hole for the frames in between)
      if (t.lod === 2 && t.mesh) { root.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh = null; }
    }
    if (!parts.length) { chunks.set(ck, { mesh: null }); return; }
    const merged = mergeGeos(parts);
    const m = new THREE.Mesh(merged, mat); m.name = 'terrain'; m.receiveShadow = true; m.matrixAutoUpdate = false;
    root.add(m);
    chunks.set(ck, { mesh: m });
  }
  function setLod(t, lod) {
    const wasFar = t.lod === 2;
    if (t.mesh && lod < 2) { root.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh = null; }
    t.lod = lod;
    if (lod < 2) {
      const m = new THREE.Mesh(build(t.tile, lod), mat); m.name = 'terrain'; m.receiveShadow = true; m.castShadow = lod === 0; m.matrixAutoUpdate = false;
      root.add(m); t.mesh = m;
    } else if (!t.farGeo) t.farGeo = build(t.tile, 2);
    if (wasFar !== (lod === 2)) dirtyChunks.add(chunkKey(t.tile));
  }
  const dirtyChunks = new Set();
  stream.register({
    name: 'terrain', range: 1e6, priority: -2,
    load(tile) {
      if (tileIsDeepWater(tile)) return null;
      const t = { tile, lod: -1, mesh: null, farGeo: null };
      tiles.set(tile.key, t);
      setLod(t, wantLod(t));
      return t;
    },
    unload(t) { if (!t) return; if (t.mesh) { root.remove(t.mesh); t.mesh.geometry.dispose(); } t.farGeo?.dispose(); tiles.delete(t.tile.key); dirtyChunks.add(chunkKey(t.tile)); },
    update() {
      const t0 = performance.now();
      // LOD changes, nearest first, ~3 ms per frame
      const todo = [];
      for (const t of tiles.values()) { const w = wantLod(t, t.lod); if (w !== t.lod) todo.push([stream.dist(t.tile, stream.focus.x, stream.focus.z), t, w]); }
      todo.sort((a, b) => a[0] - b[0]);
      for (const [, t, w] of todo) { setLod(t, w); if (performance.now() - t0 > (stream.budgetMs === Infinity ? 1e9 : 3)) break; }
      for (const ck of dirtyChunks) { rebuildChunk(ck); dirtyChunks.delete(ck); if (performance.now() - t0 > (stream.budgetMs === Infinity ? 1e9 : 4)) break; }
    },
  });
  return { tiles, chunks, material: mat };
}

function mergeGeos(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const names = ['position', 'normal', 'uv', 'color', 'aSplat'], out = {};
  for (const n of names) out[n] = new Float32Array(nv * geos[0].attributes[n].itemSize);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of geos) {
    for (const n of names) out[n].set(g.attributes[n].array, vo * g.attributes[n].itemSize);
    const src = g.index.array; for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
    vo += g.attributes.position.count; io += src.length;
  }
  const m = new THREE.BufferGeometry();
  for (const n of names) m.setAttribute(n, new THREE.BufferAttribute(out[n], geos[0].attributes[n].itemSize));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  m.computeBoundingSphere(); m.computeBoundingBox();
  return m;
}
