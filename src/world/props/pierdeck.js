// Pier 39 boardwalk: the baked terrain models the pier as land (rock-textured slopes, bumpy top, rocky marina ridges).
// This lays a flat plank deck over every land cell of the pier complex, with a dark fascia + pilings down to the water,
// so the pier reads as a timber pier and the marina ridges read as docks. Surface only: the landmark buildings stay.
import * as THREE from 'three';

const BOX = { x0: 600, x1: 1080, z0: -4160, z1: -3746 };   // Pier 39 complex (world metres, v2 projection), south edge = the shore
const G = 2;                                                // deck cell (m)

const TOP = 3.05;                                           // the pier plateau (m): the baked grid's modal pier height

// Flatten the pier plateau in the height raster (4 m grid, cm) before any terrain tile is meshed: the bake left rocky bumps
// (3.2-5.3 m) that poke through a flat deck; physics and meshes then agree on one flat pier top. Low marina ridges keep
// their height (they become docks).
function flattenPier(t) {
  if (!t.h || !t.CELL) return;
  const i0 = Math.max(0, Math.floor((BOX.x0 - t.X0) / t.CELL)), i1 = Math.min(t.NX - 1, Math.ceil((BOX.x1 - t.X0) / t.CELL));
  const j0 = Math.max(0, Math.floor((BOX.z0 - t.Z0) / t.CELL)), j1 = Math.min(t.NZ - 1, Math.floor((BOX.z1 - t.Z0) / t.CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * t.NX + i;
    if (t.s[k] !== 0 && t.h[k] >= 200) t.h[k] = TOP * 100;
  }
}

export function buildPierDeck({ terrain, parent }) {
  flattenPier(terrain);
  const nx = Math.round((BOX.x1 - BOX.x0) / G), nz = Math.round((BOX.z1 - BOX.z0) / G);
  const mask = new Uint8Array(nx * nz), lvl = new Float32Array(nx * nz);
  let n = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = BOX.x0 + (i + 0.5) * G, z = BOX.z0 + (j + 0.5) * G;
    if (terrain.surfaceRaw(x, z) === 0) continue;
    const h = terrain.heightAt(x, z);
    if (h < 0.35) continue;
    // plateau cells: the pier top; lower cells (marina ridges, the slopes' foot): docks just over the ground
    mask[j * nx + i] = 1; lvl[j * nx + i] = h >= 1.6 ? TOP + 0.05 : Math.max(0.8, h + 0.06); n++;
  }
  if (n < 50) return null;
  const P = [], N = [], UV = [], C = [], I = [];
  const quad = (a, b, c, d, n, uv, col) => {
    const k = P.length / 3;
    for (const v of [a, b, c, d]) P.push(v[0], v[1], v[2]);
    for (let q = 0; q < 4; q++) { N.push(n[0], n[1], n[2]); C.push(col[0], col[1], col[2]); }
    UV.push(...uv);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && mask[j * nx + i] === 1;
  const WOOD = [0.62, 0.5, 0.38], DARK = [0.24, 0.19, 0.15];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!at(i, j)) continue;
    const x0 = BOX.x0 + i * G, x1 = x0 + G, z0 = BOX.z0 + j * G, z1 = z0 + G;
    const t = 0.88 + 0.24 * (((i * 7349 + j * 1931) % 97) / 97);       // weathering: board-to-board tone
    const Y = lvl[j * nx + i];
    // deck (planks run north-south along the pier)
    quad([x0, Y, z1], [x1, Y, z1], [x1, Y, z0], [x0, Y, z0], [0, 1, 0], [x0 / 1.6, z1 / 3.2, x1 / 1.6, z1 / 3.2, x1 / 1.6, z0 / 3.2, x0 / 1.6, z0 / 3.2], [WOOD[0] * t, WOOD[1] * t, WOOD[2] * t]);
    // fascia (down to the water, or to a lower neighbouring dock) + pilings on the open edges
    const lv = (ii, jj) => at(ii, jj) ? lvl[jj * nx + ii] : -1.2;
    const edges = [[lv(i, j - 1), [x1, z0], [x0, z0], [0, 0, -1]], [lv(i, j + 1), [x0, z1], [x1, z1], [0, 0, 1]],
      [lv(i - 1, j), [x0, z0], [x0, z1], [-1, 0, 0]], [lv(i + 1, j), [x1, z1], [x1, z0], [1, 0, 0]]];
    for (const [yb, a, b, n] of edges) {
      if (yb >= Y - 0.01) continue;
      quad([a[0], Y, a[1]], [b[0], Y, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], n, [0, 1, 1, 1, 1, 0, 0, 0], DARK);
      if (yb > -1 || (i + j) % 2) continue;
      const px = (a[0] + b[0]) / 2 + n[0] * 0.25, pz = (a[1] + b[1]) / 2 + n[2] * 0.25, r = 0.17;
      for (const [nn, dx, dz, ex, ez] of [[[1, 0, 0], r, 0, 0, r], [[-1, 0, 0], -r, 0, 0, -r], [[0, 0, 1], 0, r, -r, 0], [[0, 0, -1], 0, -r, r, 0]])
        quad([px + dx - ex, Y - 0.25, pz + dz - ez], [px + dx + ex, Y - 0.25, pz + dz + ez], [px + dx + ex, -1.5, pz + dz + ez], [px + dx - ex, -1.5, pz + dz - ez], nn, [0, 1, 1, 1, 1, 0, 0, 0], [0.2, 0.16, 0.13]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(I, 1)); g.computeBoundingSphere();
  const base = (import.meta.env?.BASE_URL || './') + 'assets/tex/wood_floor/';
  const L = new THREE.TextureLoader(), map = L.load(base + 'color.jpg'), nrm = L.load(base + 'normal.jpg');
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  // pulled forward a little in depth: the flattened terrain top sits 5 cm below
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nrm, vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'pier39-deck'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  return { mesh, top: TOP };
}
