// Buildings v2 preview (1:1 OSM city): map data + terrain2 + a simple streamed terrain mesh + the buildings v2 providers,
// with the game's environment and post chain. URL: /dev/buildings2.html?x=..&z=..&h=16 . Hooks: __look, __frames, __shot.
import * as THREE from 'three';
import { createEnvironment } from '../src/render/environment.js';
import { createPost } from '../src/render/post.js';
import { loadAssets } from '../src/world/assets.js';
import { loadMapData } from '../src/world/v2/mapdata.js';
import { Terrain2 } from '../src/world/v2/terrain2.js';
import { TileStreamer } from '../src/world/v2/stream.js';
import { setProjection } from '../src/world/latlon.js';
import { StaticColliders } from '../src/world/collision.js';

const P = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
window.__stage = 'start';
const quality = { shadows: 1, msaa: 4, pixelRatio: 1, name: 'high' };
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 30000);
setProjection({ scale: 1 });
await loadAssets(renderer, () => {});
window.__stage = 'assets';
const env = createEnvironment({ renderer, scene, quality });
const post = createPost(renderer, scene, camera, quality);
const t0 = performance.now();
const data = await loadMapData(p => { ui.textContent = 'map data ' + (p * 100).toFixed(0) + '%'; });
const tLoad = performance.now();
window.__stage = 'data';
const terrain = new Terrain2(data);
const colliders = new StaticColliders(24);
const stream = new TileStreamer({ data, terrain, graph: null, scene, colliders });

// --- simple terrain provider (the real world assembly replaces this): 8 m grid per tile, coloured by surface class
const SC = [[0.16, 0.26, 0.3], [0.2, 0.2, 0.21], [0.55, 0.54, 0.51], [0.33, 0.45, 0.2], [0.78, 0.71, 0.53], [0.42, 0.36, 0.26], [0.45, 0.42, 0.38], [0.2, 0.3, 0.14], [0.36, 0.38, 0.22], [0.34, 0.44, 0.22]];
const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
stream.register({
  name: 'devterrain', range: 20000, priority: -1,
  load(tile) {
    const S = 8, n = 512 / S + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = tile.x0 + i * S, z = tile.z0 + j * S, k = j * n + i;
      pos[k * 3] = x; pos[k * 3 + 1] = terrain.heightAt(x, z) - 0.05; pos[k * 3 + 2] = z;
      const c = SC[terrain.surfaceRaw(x, z)] || SC[3]; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, tmat); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    return m;
  },
  unload(m) { scene.remove(m); m.geometry.dispose(); },
});

// --- buildings v2
const mod = await import('../src/world/buildings.js');
const tb = performance.now();
const bld = mod.registerBuildingsV2(stream, { data, terrain, scene, night: env.night, renderer });
const tReg = performance.now() - tb;
env.state.hours = P.has('h') ? Number(P.get('h')) : 16.5; env.state.paused = true;
const cam = { x: Number(P.get('x') || 0), z: Number(P.get('z') || 0) };
camera.position.set(cam.x, terrain.heightAt(cam.x, cam.z) + 1.7, cam.z);
camera.lookAt(cam.x, camera.position.y + 2, cam.z - 30);
const tf = performance.now();
stream.fill(cam.x, cam.z);
const tFill = performance.now() - tf;
let t = 0;
function frame(dt) {
  t += dt;
  const fc = window.__freeCam;
  if (fc) { camera.position.set(fc.x, fc.y, fc.z); camera.lookAt(fc.tx, fc.ty, fc.tz); }
  camera.updateMatrixWorld();
  env.update(dt, camera, camera.position);
  stream.update(dt, { time: t, night: env.night.value, camera }, camera.position);
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
window.__drawStats = () => {
  const r = renderer; r.info.autoReset = false; r.info.reset(); r.render(scene, camera);
  const all = { calls: r.info.render.calls, tris: r.info.render.triangles };
  const hidden = []; scene.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible && !bld.group.getObjectById(o.id)) { o.visible = false; hidden.push(o); } });
  r.info.reset(); r.render(scene, camera); const b = { calls: r.info.render.calls, tris: r.info.render.triangles };
  const sm = r.shadowMap.enabled; r.shadowMap.enabled = false; r.info.reset(); r.render(scene, camera); const bc = { calls: r.info.render.calls, tris: r.info.render.triangles }; r.shadowMap.enabled = sm;
  for (const o of hidden) o.visible = true; r.info.autoReset = true;
  return { all, bldWithShadows: b, bldCamera: bc };
};
Object.assign(window, { __scene: scene, __camera: camera, __renderer: renderer, __env: env, __bld: bld, __data: data, __terrain: terrain, __stream: stream, __THREE: THREE, __colliders: colliders });
ui.textContent = `data ${(tLoad - t0).toFixed(0)} ms, register ${tReg.toFixed(0)} ms, fill ${tFill.toFixed(0)} ms, ${data.buildings.count} buildings`;
window.__ready = true;
renderer.setAnimationLoop(() => { if (!window.__manual) frame(1 / 60); });
