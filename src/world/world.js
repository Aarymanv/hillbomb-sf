// World assembly: terrain -> road graph -> blocks -> meshes -> buildings -> landmarks -> props. Returns the query API.
import * as THREE from 'three';
import { Terrain, SURF, HF_RES, HF_W, HF_H } from './terrain.js';
import { buildRoadGraph } from './roads.js';
import { buildBlocks } from './blocks.js';
import { buildCityMeshes } from './citymesh.js';
import { buildBuildings } from './buildings.js';
import { StaticColliders } from './collision.js';
import { PLAY, BOUNDS, districtAt } from './map.js';
import { createWater } from '../render/water.js';
import { DISTRICTS } from './anchors.js';
import { createGrass } from './grass/index.js';

const tick = () => new Promise(r => setTimeout(r, 0));
// optional modules by other authors, bundled eagerly (no separate chunk fetch at runtime)
const LANDMARKS_MOD = import.meta.glob('./landmarks.js', { eager: true })['./landmarks.js'] || null;
const PROPS_MOD = import.meta.glob('./props.js', { eager: true })['./props.js'] || null;
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);

export async function buildWorld({ scene, env, progress = () => {} }) {
  const t0 = performance.now();
  const terrain = new Terrain();
  progress(0.05, 'Shaping the hills');
  await tick();
  terrain.build(p => progress(0.05 + p * 0.3, 'Shaping the hills'));
  progress(0.36, 'Laying out streets'); await tick();
  const graph = buildRoadGraph(terrain);
  for (const e of graph.edges) if (!e.deck) terrain.paintCorridor(e.pts, e.width / 2 + 0.5, SURF.ASPHALT);
  progress(0.45, 'Dividing blocks'); await tick();
  const blocks = buildBlocks(terrain);
  terrain.setBlocks(blocks);
  const colliders = new StaticColliders(24);

  // landmarks (optional module, built by a separate author)
  progress(0.5, 'Raising landmarks'); await tick();
  let landmarks = null;
  try {
    const mod = LANDMARKS_MOD;
    if (!mod) throw new Error('landmarks.js not present yet');
    landmarks = mod.buildLandmarks({ heightAt: (x, z) => terrain.heightAt(x, z) });
    scene.add(landmarks.group);
    colliders.addAll(landmarks.colliders.map(c => ({ ...c, kind: c.kind || 'landmark' })));
  } catch (err) { console.warn('[world] landmarks unavailable', err); }

  progress(0.6, 'Paving the city'); await tick();
  const city = buildCityMeshes({ terrain, graph, blocks, night: env.night });
  scene.add(city.group);
  colliders.addAll(city.colliders);

  progress(0.72, 'Building neighbourhoods'); await tick();
  const bld = buildBuildings(blocks, terrain, { night: env.night, blockers: landmarks ? landmarks.colliders : [] });
  scene.add(bld.group);
  colliders.addAll(bld.colliders);

  // street props (optional module, built by a separate author)
  let props = null;
  try {
    if (PROPS_MOD?.buildProps) {
      progress(0.8, 'Planting trees'); await tick();
      const mod = PROPS_MOD;
      props = mod.buildProps({ world: { terrain, graph, blocks, colliders, heightAt: (x, z) => terrain.heightAt(x, z), groundAt: (x, z, y, o) => terrain.groundAt(x, z, y, o) }, scene, night: env.night });
      scene.add(props.group);
      colliders.addAll(props.colliders);
    }
  } catch (err) { console.error('[world] props failed', err); }

  // world bounds walls
  const W = 50;
  colliders.add({ x: (PLAY.minX + PLAY.maxX) / 2, z: PLAY.minZ - W, hx: (PLAY.maxX - PLAY.minX) / 2 + W * 2, hz: W, yaw: 0, yMin: -100, yMax: 1000, kind: 'bounds' });
  colliders.add({ x: (PLAY.minX + PLAY.maxX) / 2, z: PLAY.maxZ + W, hx: (PLAY.maxX - PLAY.minX) / 2 + W * 2, hz: W, yaw: 0, yMin: -100, yMax: 1000, kind: 'bounds' });
  colliders.add({ x: PLAY.minX - W, z: (PLAY.minZ + PLAY.maxZ) / 2, hx: W, hz: (PLAY.maxZ - PLAY.minZ) / 2 + W * 2, yaw: 0, yMin: -100, yMax: 1000, kind: 'bounds' });
  colliders.add({ x: PLAY.maxX + W, z: (PLAY.minZ + PLAY.maxZ) / 2, hx: W, hz: (PLAY.maxZ - PLAY.minZ) / 2 + W * 2, yaw: 0, yMin: -100, yMax: 1000, kind: 'bounds' });

  // water (render/water.js): built from terrain data (heightfield), reflects sky + terrain + decks + landmarks + buildings
  let water = null;
  try {
    water = createWater({
      scene, env, quality: env.quality, bounds: BOUNDS,
      heightField: { data: terrain.hf, w: HF_W, h: HF_H, x0: BOUNDS.minX, z0: BOUNDS.minZ, res: HF_RES },
      heightAt: (x, z) => terrain.heightAt(x, z),
      reflect: [city.group, landmarks?.group, bld.group],
    });
  } catch (err) { console.error('[world] water failed', err); }
  console.log(`[world] built in ${(performance.now() - t0).toFixed(0)} ms: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${blocks.length} blocks, ${bld.count} buildings, ${colliders.list.length} colliders`);

  // ground cover (src/world/grass): terrain + lots are ground; road-ish meshes in city.group, buildings, landmarks are blocked
  let grass = null;
  try { grass = createGrass({ scene, env, terrain, ground: [city.group], blocked: [bld.group, landmarks?.group] }); } catch (err) { console.error('[world] grass', err); }
  const world = {
    grass, terrain, graph, blocks, colliders, landmarks, buildings: bld, props, water,
    heightAt: (x, z) => terrain.heightAt(x, z),
    groundAt: (x, z, probeY, out) => terrain.groundAt(x, z, probeY, out),
    district: (x, z) => districtAt(DISTRICTS, x, z) || 'San Francisco',
    streetName(x, z) { const n = graph.nearestEdge(x, z, 14); return n ? n.edge.name : null; },
    update(dt, envInfo) {
      water?.update(dt, envInfo);
      landmarks?.update?.(dt, envInfo);
      bld.update?.(dt, envInfo.camera, envInfo);
      props?.update?.(dt, envInfo);
      grass?.update(dt, envInfo);
    },
  };
  return world;
}
