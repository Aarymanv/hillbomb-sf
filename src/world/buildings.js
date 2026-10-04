// HILLBOMB buildings v2: every lot becomes a styled San Francisco building (Victorian / Edwardian row houses, Sunset
// stucco, storefront blocks, Tenderloin apartments, Chinatown, SoMa brick lofts, warehouses, downtown towers).
//  * FAR LOD: cheap massing merged per 400 m tile, drawn by one procedural facade shader (windows with recess parallax,
//    interior-mapped rooms, storefronts, garages, grime), sharing its window grid/colours with the near LOD.
//  * NEAR LOD: streamed per 80 m cell around the camera: real 3D facades (recessed windows with frames, sills, hoods,
//    sash bars, bay windows, cornices with brackets, stairs, storefronts, awnings, signs, fire escapes, balconies).
//    When a cell's near meshes are ready its buildings are hidden in the far meshes via a per-building hide texture.
// See facade/*.js. API: buildBuildings(blocks, terrain, { night, blockers }) -> { group, colliders, count, update }.
import * as THREE from 'three';
import { BOUNDS } from './map.js';
import { planBuildings, makeParamsTexture, S } from './facade/plan.js';
import { createFacadeTextures } from './facade/texgen.js';
import { makeFacadeMaterials, HW } from './facade/material.js';
import { MeshBuf } from './facade/emit.js';
import { emitFar } from './facade/far.js';
import { NearLOD } from './facade/near.js';
import { makeBeacons } from './facade/beacons.js';
// v2 (1:1 OSM city, ?map=v2): see facade/v2city.js
export { registerBuildingsV2 } from './facade/v2city.js';

export const TILE = 400;
export const STYLE = S;

export function buildBuildings(blocks, terrain, { night, blockers = [] } = {}) {
  const t0 = performance.now();
  const specs = planBuildings(blocks, terrain, blockers);
  const t1 = performance.now();
  const paramsTex = makeParamsTexture(specs);
  const hideRows = Math.ceil(specs.length / HW) + 1;
  const hideData = new Uint8Array(HW * hideRows);
  const hideTex = new THREE.DataTexture(hideData, HW, hideRows, THREE.RedFormat, THREE.UnsignedByteType);
  hideTex.minFilter = hideTex.magFilter = THREE.NearestFilter; hideTex.generateMipmaps = false; hideTex.needsUpdate = true;
  const textures = createFacadeTextures();
  const time = { value: 0 };
  const nightU = night || { value: 0 };
  const { mat, depth } = makeFacadeMaterials({ night: nightU, textures, paramsTex, hideTex, time });

  // ---------------------------------------------------------------- far tiles
  const tiles = new Map();
  for (const sp of specs) {
    const k = Math.floor((sp.x - BOUNDS.minX) / TILE) * 1000 + Math.floor((sp.z - BOUNDS.minZ) / TILE);
    let B = tiles.get(k);
    if (!B) tiles.set(k, B = new MeshBuf(false, 16384));
    emitFar(sp, B);
  }
  const group = new THREE.Group();
  group.name = 'buildings';
  let renderer = null;
  const grab = (r) => { renderer = r; };
  let farTris = 0;
  for (const [, B] of tiles) {
    if (B.empty) continue;
    const m = new THREE.Mesh(B.toGeometry(), mat);
    m.customDepthMaterial = depth;
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.name = 'bld-far';
    m.onBeforeRender = grab;
    farTris += B.ni / 3;
    group.add(m);
  }
  tiles.clear();
  const t2 = performance.now();

  // ---------------------------------------------------------------- near LOD manager + night extras
  const near = new NearLOD({ specs, group, mat, depth, hideData, hideTex, night: nightU, time, textures, H: (x, z) => terrain.heightAt(x, z) });
  const beacons = makeBeacons(specs, time, nightU);
  if (beacons) group.add(beacons);

  const colliders = specs.map(sp => ({ x: sp.x, z: sp.z, hx: sp.hx, hz: sp.hz, yaw: sp.yaw, yMin: sp.yb, yMax: sp.yTop + (sp.gable ? 3 : 0), kind: 'building', lot: sp.lot }));
  const stats = { planMs: t1 - t0, farMs: t2 - t1, totalMs: performance.now() - t0, farTris, tiles: group.children.length };
  console.log(`[buildings] ${specs.length} buildings, plan ${stats.planMs.toFixed(0)} ms, far ${stats.farMs.toFixed(0)} ms (${(farTris / 1e6).toFixed(2)} M tris, ${stats.tiles} tiles)`);

  return {
    group, colliders, count: specs.length, specs, material: mat, stats, near,
    internals: { textures, paramsTex, hideTex, hideData, time, night: nightU, depth },
    update(dt, camera, env) {
      time.value += dt;
      if (!textures.ready && renderer && textures.step(renderer)) {
        console.log(`[buildings] facade textures ready after ${textures.genMs.toFixed(0)} ms (async compile + generation)`);
      }
      if (textures.ready && textures.state === 3 && renderer && textures.photoStep(renderer)) {
        for (const m of group.children) if (m.onBeforeRender === grab) m.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
      }
      if (camera) near.update(dt, camera);
    },
  };
}
