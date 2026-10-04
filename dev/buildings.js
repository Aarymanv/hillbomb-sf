// Buildings preview: terrain + streets + blocks + city meshes + buildings with the game's environment and post chain.
// URL: /dev/buildings.html?x=150&z=420&h=16  (camera start, hour). Dev hooks match the game: __look, __frames, __shot.
import * as THREE from 'three';
import { createEnvironment } from '../src/render/environment.js';
import { createPost } from '../src/render/post.js';
import { loadAssets } from '../src/world/assets.js';
import { Terrain, SURF } from '../src/world/terrain.js';
import { buildRoadGraph } from '../src/world/roads.js';
import { buildBlocks } from '../src/world/blocks.js';
import { buildCityMeshes } from '../src/world/citymesh.js';
import { buildBuildings } from '../src/world/buildings.js';

const P = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
const quality = { shadows: 1, msaa: 4, pixelRatio: 1, name: 'high' };
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 9000);
await loadAssets(renderer, () => {});
const env = createEnvironment({ renderer, scene, quality });
const post = createPost(renderer, scene, camera, quality);

const t0 = performance.now();
const terrain = new Terrain(); terrain.build(() => {});
const graph = buildRoadGraph(terrain);
for (const e of graph.edges) if (!e.deck) terrain.paintCorridor(e.pts, e.width / 2 + 0.5, SURF.ASPHALT);
const blocks = buildBlocks(terrain);
const city = buildCityMeshes({ terrain, graph, blocks, night: env.night });
scene.add(city.group);
let blockers = [];
try { const lm = await import('../src/world/landmarks.js'); const L = lm.buildLandmarks({ heightAt: (x, z) => terrain.heightAt(x, z) }); scene.add(L.group); blockers = L.colliders; } catch (e) { console.warn('landmarks', e); }
const tb = performance.now();
const bld = buildBuildings(blocks, terrain, { night: env.night, blockers });
const buildMs = performance.now() - tb;
scene.add(bld.group);
env.state.hours = P.has('h') ? Number(P.get('h')) : 16.5; env.state.paused = true;

const cam = { x: Number(P.get('x') || 150), z: Number(P.get('z') || 420) };
camera.position.set(cam.x, terrain.heightAt(cam.x, cam.z) + 1.7, cam.z);
camera.lookAt(cam.x, camera.position.y + 2, cam.z - 30);
let t = 0;
function frame(dt) {
  t += dt;
  const fc = window.__freeCam;
  if (fc) { camera.position.set(fc.x, fc.y, fc.z); camera.lookAt(fc.tx, fc.ty, fc.tz); }
  env.update(dt, camera, camera.position);
  bld.update(dt, camera, { time: t, night: env.night.value, camera });
  post.render(dt);
}
window.__frame = frame;
window.__frames = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); };
window.__look = (x, y, z, tx, ty, tz) => { window.__freeCam = x === null ? null : { x, y, z, tx, ty, tz }; };
window.__shot = async (name = 'shot', w = 1280, h0 = 720) => {
  if (renderer.domElement.width !== w) { renderer.setSize(w, h0, false); post.setSize(w, h0); camera.aspect = w / h0; camera.updateProjectionMatrix(); }
  frame(1 / 60);
  const src = renderer.domElement, c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * src.height / src.width);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  await fetch('http://127.0.0.1:5191/__shot?name=' + name, { method: 'POST', body: c.toDataURL('image/jpeg', 0.88) });
  return name;
};
window.__drawStats = () => { renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.autoReset = true; return r; };
Object.assign(window, { __scene: scene, __camera: camera, __renderer: renderer, __env: env, __bld: bld, __terrain: terrain, __THREE: THREE, __heightAt: (x, z) => terrain.heightAt(x, z) });
ui.textContent = `world ${(tb - t0).toFixed(0)} ms, buildings ${buildMs.toFixed(0)} ms, ${bld.count} buildings`;
window.__ready = true;
renderer.setAnimationLoop(() => { if (!window.__manual) frame(1 / 60); });
