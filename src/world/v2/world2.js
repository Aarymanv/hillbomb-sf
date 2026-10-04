// World assembly for the 1:1 real-data San Francisco (?map=v2). Same world API as world.js, content streamed by tile.
import * as THREE from 'three';
import { setProjection, ll } from '../latlon.js';
import { loadMapData } from './mapdata.js';
import { Terrain2 } from './terrain2.js';
import { buildGraph2 } from './graph2.js';
import { TileStreamer } from './stream.js';
import { registerTerrain } from './terrainmesh.js';
import { registerRoads } from './roadmesh.js';
import { StaticColliders } from '../collision.js';
import { createWater } from '../../render/water.js';
import { DISTRICTS2 } from './districts2.js';
import { createGoogleTiles } from './googletiles.js';
import { createGrass } from '../grass/index.js';
import { makeLotFrame } from './lotframe.js';
import { NOYARDG } from '../grass/yard_glsl.js';

const BLD_MOD = import.meta.glob('../buildings.js', { eager: true })['../buildings.js'] || null;
const LM_MOD = import.meta.glob('../landmarks.js', { eager: true })['../landmarks.js'] || null;
const PROPS_MOD = import.meta.glob('../props.js', { eager: true })['../props.js'] || null;
const tick = () => new Promise(r => setTimeout(r, 0));

export async function buildWorld2({ scene, env, camera = null, renderer = null, progress = () => {}, spawn }) {
  const t0 = performance.now();
  const data = await loadMapData(p => progress(0.05 + p * 0.45, 'Downloading San Francisco'));
  setProjection({ scale: 1, kx: data.meta.projection.kx, kz: data.meta.projection.kz });
  progress(0.52, 'Shaping the hills'); await tick();
  const terrain = new Terrain2(data);
  progress(0.58, 'Laying out 2,300 km of streets'); await tick();
  const graph = buildGraph2(data, terrain);
  terrain.setGraph(graph);
  const colliders = new StaticColliders(24);
  const mk = n => { const g = new THREE.Group(); g.name = n; scene.add(g); return g; };
  const terrRoot = mk('terrain2'), roadRoot = mk('city'), bldRoot = mk('buildings'), lmRoot = mk('landmarks'), propRoot = mk('props');
  const stream = new TileStreamer({ data, terrain, graph, scene, colliders });
  registerTerrain(stream, { data, terrain, root: terrRoot });
  registerRoads(stream, { data, terrain, graph, root: roadRoot, colliders, markingsInShader: true });
  // buildings / landmarks / props: the owners' v2 providers when present, otherwise a plain extruder
  let buildings = null, landmarks = null, props = null;
  try { buildings = BLD_MOD?.registerBuildingsV2?.(stream, { data, terrain, scene, root: bldRoot, night: env.night }) || registerPlainBuildings(stream, { data, terrain, root: bldRoot, colliders }); }
  catch (err) { console.error('[world2] buildings', err); buildings = registerPlainBuildings(stream, { data, terrain, root: bldRoot, colliders }); }
  try { landmarks = LM_MOD?.registerLandmarksV2?.(stream, { data, terrain, graph, scene, root: lmRoot, buildings, night: env.night }) || null; } catch (err) { console.error('[world2] landmarks', err); }
  try { props = PROPS_MOD?.registerPropsV2?.(stream, { data, terrain, graph, scene, root: propRoot, night: env.night }) || null; } catch (err) { console.error('[world2] props', err); }
  // OSM footprints standing on a tunnel's roadway (Broadway east portal): their walls / colliders block the bore
  if (buildings?.buildingAt && buildings.hideBuilding) {
    const B = data.buildings, hid = new Set();
    for (const e of graph.edges) {
      if (!e.tunnel) continue;
      for (let s = 0; s <= e.len; s += 4) {
        let k = 0; while (k < e.cum.length - 2 && e.cum[k + 1] < s) k++;
        const t = (s - e.cum[k]) / ((e.cum[k + 1] - e.cum[k]) || 1), a = e.pts[k], b = e.pts[k + 1];
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = e.ys[k] + (e.ys[k + 1] - e.ys[k]) * t;
        const dx = (b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1), dz = (b[1] - a[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
        for (const o of [0, -e.width / 2, e.width / 2]) {
          const i = buildings.buildingAt(x - dz * o, z + dx * o);
          if (i >= 0 && !hid.has(i) && B.base[i] + (B.minH?.[i] || 0) < y + 7) { hid.add(i); buildings.hideBuilding(i); }
        }
      }
    }
    if (hid.size) console.log(`[world2] ${hid.size} OSM footprints over tunnel bores hidden`);
  }
  // spawn: explicit {x, z} or a named intersection { at: ['Hyde Street', 'Lombard Street'], along: 'Hyde Street', back: 30 }
  let sp = spawn || { x: 0, z: 0 };
  if (spawn?.at) {
    const n = graph.intersection(spawn.at[0], spawn.at[1]);
    if (n) {
      const e = n.edges.find(q => q.name.toLowerCase().startsWith((spawn.along || spawn.at[0]).toLowerCase()) && (q.a === n ? q.b : q.a).z > n.z) || n.edges[0];
      const fwd = e.a === n, s = Math.min(spawn.back || 30, e.len * 0.6);
      const d = e.cum; let k = 0; const ss = fwd ? s : e.len - s; while (k < d.length - 2 && d[k + 1] < ss) k++;
      const t = (ss - d[k]) / ((d[k + 1] - d[k]) || 1), x = e.pts[k][0] + (e.pts[k + 1][0] - e.pts[k][0]) * t, z = e.pts[k][1] + (e.pts[k + 1][1] - e.pts[k][1]) * t;
      const lane = e.oneway ? 0 : e.median + e.laneW * 0.5, dx = n.x - x, dz = n.z - z, l = Math.hypot(dx, dz) || 1;
      sp = { x: x + (-dz / l) * lane, z: z + (dx / l) * lane, yaw: Math.atan2(-dx, -dz) };     // right lane, facing the junction
    }
  }
  progress(0.66, 'Building the neighbourhood'); await tick();
  stream.fill(sp.x, sp.z, p => progress(0.66 + p * 0.28, 'Building the neighbourhood'));
  // water: heightfield downsampled 3x (12 m) for depth colour + coast field
  let water = null;
  try {
    const s = 3, w = Math.ceil(data.NX / s), h = Math.ceil(data.NZ / s), hf = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) hf[j * w + i] = data.height[Math.min(data.NZ - 1, j * s) * data.NX + Math.min(data.NX - 1, i * s)] * 0.01;
    water = createWater({ scene, env, quality: env.quality, bounds: terrain.bounds, heightField: { data: hf, w, h, x0: terrain.X0, z0: terrain.Z0, res: data.meta.cell * s },
      heightAt: (x, z) => terrain.heightAt(x, z), reflect: [terrRoot, roadRoot, bldRoot, lmRoot] });
  } catch (err) { console.error('[world2] water failed', err); }
  // map-edge walls
  const B = terrain.bounds, W = 50;
  for (const [x, z, hx, hz] of [[(B.minX + B.maxX) / 2, B.minZ - W + 40, (B.maxX - B.minX) / 2 + 100, W], [(B.minX + B.maxX) / 2, B.maxZ + W - 40, (B.maxX - B.minX) / 2 + 100, W],
    [B.minX - W + 40, (B.minZ + B.maxZ) / 2, W, (B.maxZ - B.minZ) / 2 + 100], [B.maxX + W - 40, (B.minZ + B.maxZ) / 2, W, (B.maxZ - B.minZ) / 2 + 100]])
    colliders.add({ x, z, hx, hz, yaw: 0, yMin: -200, yMax: 2000, kind: 'bounds' });
  console.log(`[world2] real SF ready in ${(performance.now() - t0).toFixed(0)} ms: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${data.buildings.count} buildings, ${stream.stats.loads} tile loads`);
  // Google Photorealistic 3D Tiles for everything beyond our near block (needs VITE_GOOGLE_TILES_KEY; ?tiles=0 disables)
  let gtiles = null;
  const gkey = import.meta.env.VITE_GOOGLE_TILES_KEY;
  if (gkey && new URLSearchParams(location.search).get('tiles') !== '0') {
    try { gtiles = createGoogleTiles({ scene, camera, renderer: renderer || env.renderer, stream, roots: [terrRoot, roadRoot, bldRoot], key: gkey, env, graph }); }
    catch (err) { console.error('[world2] google tiles', err); }
    if (gtiles) buildings?.setNearOwner?.(gtiles);
  }
  // ground cover (src/world/grass): ground = terrain, never on roads / buildings / landmarks
  let grass = null;
  try { grass = createGrass({ scene, env, terrain, renderer: renderer || env.renderer, ground: [terrRoot], blocked: [roadRoot, bldRoot, lmRoot], lot: NOYARDG ? null : makeLotFrame(graph, terrain) }); } catch (err) { console.error('[world2] grass', err); }
  const world = {
    v2: true, grass, gtiles, spawn: sp, data, terrain, graph, blocks: [], colliders, stream, landmarks, buildings, props, water, ll,
    heightAt: (x, z) => terrain.heightAt(x, z),
    groundAt: (x, z, probeY, out) => terrain.groundAt(x, z, probeY, out),
    district(x, z) {
      let best = null, bd = Infinity;
      for (const d of DISTRICTS2) { const [dx, dz] = d.p || (d.p = ll(d.lat, d.lon)); const q = Math.hypot(x - dx, z - dz) / d.r; if (q < 1 && q < bd) { bd = q; best = d.name; } }
      return best || 'San Francisco';
    },
    streetName(x, z) { const n = graph.nearestEdge(x, z, 14); return n ? n.edge.name : null; },
    update(dt, envInfo) {
      stream.update(dt, envInfo, envInfo.focus || envInfo.camera?.position);
      gtiles?.update(dt, envInfo.focus || envInfo.camera?.position);
      water?.update(dt, envInfo);
      landmarks?.update?.(dt, envInfo); buildings?.update?.(dt, envInfo.camera, envInfo); props?.update?.(dt, envInfo);
      grass?.update(dt, envInfo);
    },
  };
  return world;
}

// Placeholder buildings (replaced by the facades module's registerBuildingsV2): extruded real footprints, flat roofs,
// vertex-coloured by kind, one box collider per footprint. Near range + a whole-city skyline of tall buildings.
function registerPlainBuildings(stream, { data, terrain, root, colliders }) {
  const B = data.buildings;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const KC = [[0.78, 0.75, 0.7], [0.86, 0.8, 0.7], [0.8, 0.74, 0.66], [0.72, 0.74, 0.76], [0.6, 0.58, 0.55], [0.84, 0.8, 0.72], [0.6, 0.6, 0.6], [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], [0.7, 0.7, 0.7]];
  const ring = [];
  function extrude(i, pos, col, idx, cols) {
    B.ring(i, ring);
    const n = ring.length / 2; if (n < 3) return;
    const y0 = B.base[i] + B.minH[i] - (B.minH[i] > 0 ? 0 : 0.5), y1 = B.base[i] + B.h[i];
    let c = KC[B.kind[i]] || KC[0];
    if (B.color[i]) { const h = B.color[i]; c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
    const vary = 0.9 + ((i * 2654435761) >>> 0) / 4294967296 * 0.2;
    const shape = [];
    for (let k = 0; k < n; k++) {
      const ax = ring[k * 2], az = ring[k * 2 + 1], bx = ring[((k + 1) % n) * 2], bz = ring[((k + 1) % n) * 2 + 1];
      const b = pos.length / 3, sh = (0.72 + 0.28 * Math.abs((bz - az) / (Math.hypot(bx - ax, bz - az) || 1))) * vary;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
      for (let q = 0; q < 4; q++) col.push(c[0] * sh, c[1] * sh, c[2] * sh);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      shape.push(new THREE.Vector2(ax, az));
    }
    const tris = THREE.ShapeUtils.triangulateShape(shape, []);
    const b = pos.length / 3;
    for (let k = 0; k < n; k++) { pos.push(ring[k * 2], y1, ring[k * 2 + 1]); col.push(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8); }
    for (const [p, q, r] of tris) idx.push(b + p, b + r, b + q);
    if (cols) {
      // oriented box on the longest edge
      let best = 0, yaw = 0;
      for (let k = 0; k < n; k++) { const dx = ring[((k + 1) % n) * 2] - ring[k * 2], dz = ring[((k + 1) % n) * 2 + 1] - ring[k * 2 + 1], l = dx * dx + dz * dz; if (l > best) { best = l; yaw = Math.atan2(dx, dz); } }
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < n; k++) { const x = ring[k * 2], z = ring[k * 2 + 1], lx = cy * x - sy * z, lz = sy * x + cy * z; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); }
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      cols.push({ x: cy * mx + sy * mz, z: -sy * mx + cy * mz, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, yaw, yMin: y0, yMax: y1, kind: 'building' });
    }
  }
  const mesh = (pos, col, idx, name) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = name === 'bld-near'; m.receiveShadow = true; m.matrixAutoUpdate = false;
    root.add(m); return m;
  };
  const drop = h => { if (!h) return; root.remove(h.m); h.m.geometry.dispose(); for (const c of h.cols || []) colliders.remove(c); };
  stream.register({
    name: 'buildings-near', range: 1300, priority: 1,
    load(tile) {
      const [f, c] = B.inTile(tile.tx, tile.tz); if (!c) return null;
      const pos = [], col = [], idx = [], cols = [];
      for (let i = f; i < f + c; i++) extrude(i, pos, col, idx, cols);
      colliders.addAll ? colliders.addAll(cols) : cols.forEach(q => colliders.add(q));
      return { m: mesh(pos, col, idx, 'bld-near'), cols };
    },
    unload: drop,
  });
  // skyline: tall buildings everywhere (hidden where the near tile exists)
  stream.register({
    name: 'buildings-far', range: 1e6, priority: 3,
    load(tile) {
      const [f, c] = B.inTile(tile.tx, tile.tz); if (!c) return null;
      const pos = [], col = [], idx = [];
      for (let i = f; i < f + c; i++) if (B.h[i] > 28) extrude(i, pos, col, idx, null);
      if (!pos.length) return null;
      return { m: mesh(pos, col, idx, 'bld-far'), key: tile.key };
    },
    unload: drop,
    update() { for (const [key, rec] of stream.loaded.get('buildings-far')) if (rec.handle) rec.handle.m.visible = !stream.isLoaded('buildings-near', key); },
  });
  return { plain: true };
}
