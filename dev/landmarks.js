// Dev preview for src/world/landmarks.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildLandmarks } from '../src/world/landmarks.js';
import { GG_BRIDGE, BAY_BRIDGE, LANDMARKS, bridgePoint } from '../src/world/anchors.js';

// ---------------- preview terrain ----------------
// Default: a simple stand-in heightAt (flat 0, hills at Coit / Twin Peaks / bridge ends, water = -4).
// ?engine=1 : use the game's real Terrain (src/world/terrain.js) instead, to check placement on the real hills.
const USE_ENGINE = new URLSearchParams(location.search).has('engine');
let engineTerrain = null;
if (USE_ENGINE) {
  const { Terrain } = await import('../src/world/terrain.js');
  engineTerrain = new Terrain(); engineTerrain.build(() => {});
}
const hill = (x, z, cx, cz, r, h) => { const d = Math.hypot(x - cx, z - cz); return d < r ? h * (0.5 + 0.5 * Math.cos(Math.PI * d / r)) : 0; };
function isLand(x, z) {
  if (x > -3160 && x < 2240 && z > -1265 && z < 2400) return true;                        // SF
  if (z < -2380 && x < -900 && x > -4200) return true;                                    // Marin
  if (Math.hypot(x - 3420, z - 1440 * -1) < 390) return true;                             // Yerba Buena
  const a = LANDMARKS.alcatraz, c = Math.cos(a.yaw), s = Math.sin(a.yaw), dx = x - a.x, dz = z - a.z;
  const lx = c * dx - s * dz, lz = s * dx + c * dz;
  if ((lx / 125) ** 2 + (lz / 45) ** 2 < 1) return true;                                    // Alcatraz
  return false;
}
function heightAt(x, z) {
  if (engineTerrain) return engineTerrain.heightAt(x, z);
  if (!isLand(x, z)) return -4;
  let h = 0;
  h = Math.max(h, hill(x, z, 1520, -965, 170, 45));                                       // Telegraph Hill (Coit)
  h = Math.max(h, hill(x, z, -600, 1520, 330, 110), hill(x, z, -420, 1600, 300, 100));    // Twin Peaks / Sutro
  const [gsx, gsz] = GG_BRIDGE.start, [gnx, gnz] = bridgePoint(GG_BRIDGE, GG_BRIDGE.length);
  h = Math.max(h, hill(x, z, gsx, gsz + 40, 200, 30), hill(x, z, gnx, gnz - 60, 260, 30));  // bridge-end bluffs
  h = Math.max(h, hill(x, z, 3420, -1440, 390, 30));                                      // YBI
  h = Math.max(h, hill(x, z, 1180, -345, 220, 40));                                       // Nob Hill (Grace)
  h = Math.max(h, hill(x, z, 158, 420, 160, 14));                                         // Alamo Square slope
  h = Math.max(h, hill(x, z, -2330, -2560, 300, 60));                                     // Hawk Hill
  { const a = LANDMARKS.alcatraz, c = Math.cos(a.yaw), s = Math.sin(a.yaw), dx = x - a.x, dz = z - a.z;
    const lx = c * dx - s * dz, lz = s * dx + c * dz, e = Math.sqrt((lx / 125) ** 2 + (lz / 45) ** 2);
    if (e < 1) h = Math.max(h, 22 * Math.min(1, (1 - e) * 2.2)); }
  if (x < -3000) h = Math.max(h, 18 * Math.min(1, (x + 3160) / 60));                      // Lands End cliff
  return h;
}

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 14000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b5a4c, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, near: 1, far: 2500 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// terrain grid + water
{
  const X0 = -3500, X1 = 3950, Z0 = -3100, Z1 = 2300, step = USE_ENGINE ? 12 : 20;
  const nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const h = heightAt(P.getX(i), P.getZ(i)); P.setY(i, h + 0.01);
    if (h < 0) c.set(0x3d4f4f); else c.setHSL(0.22 - Math.min(h, 110) / 1000, 0.22, 0.2 + Math.min(h, 110) / 900);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshStandardMaterial({ color: 0x1d3f4f, roughness: 0.18, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
  water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
}

// ---------------- landmarks ----------------
const t0 = performance.now();
const LM = buildLandmarks({ heightAt });
const buildMs = performance.now() - t0;
scene.add(LM.group);
const ids = Object.keys(LM.parts);
const totalTris = Object.values(LM.parts).reduce((a, p) => a + p.triangles, 0);
let lmDraws = 0; LM.group.traverse((o) => { if (o.isMesh || o.isPoints) lmDraws++; });

// collider debug boxes
const colGroup = new THREE.Group(); colGroup.visible = false; scene.add(colGroup);
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true, transparent: true, opacity: 0.6 });
  for (const c of LM.colliders) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.hx * 2, c.yMax - c.yMin, c.hz * 2), mat);
    m.position.set(c.x, (c.yMin + c.yMax) / 2, c.z); m.rotation.y = c.yaw; colGroup.add(m);
  }
}

// ---------------- UI ----------------
const pick = document.getElementById('pick');
for (const id of ['(overview)', ...ids]) { const o = document.createElement('option'); o.value = id; o.textContent = id; pick.appendChild(o); }
let current = '(overview)', angle = 'front';
function frontDir(id) {
  const a = LANDMARKS[id];
  if (a && a.yaw != null) return new THREE.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  if (id === 'goldenGate') return new THREE.Vector3(-GG_BRIDGE.dir[1], 0, GG_BRIDGE.dir[0]); // looking from the east
  if (id === 'bayBridge') return new THREE.Vector3(BAY_BRIDGE.dir[1], 0, -BAY_BRIDGE.dir[0]); // from the north-west
  return new THREE.Vector3(0, 0, -1);
}
function frame(id = current, a = angle) {
  current = id; angle = a;
  let box = new THREE.Box3();
  if (id === '(overview)') { box.setFromObject(LM.group); }
  else box.setFromObject(LM.parts[id].group);
  const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.min(1500, Math.max(size.x, size.y * 1.4, size.z) * 0.5 + 10);
  const f = id === '(overview)' ? new THREE.Vector3(0.3, 0, 1).normalize() : frontDir(id);
  const side = new THREE.Vector3(-f.z, 0, f.x);
  let dir, dist = r * 2.1, lift = 0.35;
  if (a === 'front') dir = f.clone().add(side.clone().multiplyScalar(0.35));
  else if (a === 'side') dir = side.clone();
  else if (a === 'back') dir = f.clone().negate().add(side.clone().multiplyScalar(0.3));
  else if (a === 'top') { dir = f.clone().multiplyScalar(0.2); lift = 3; }
  else if (a === 'far') { dir = f.clone().add(side.clone().multiplyScalar(0.5)); dist = r * 7 + 400; lift = 0.12; }
  else { dir = f.clone().add(side.clone().multiplyScalar(0.6)); dist = r * 1.2; lift = -0.02; ctr.y = box.min.y + size.y * 0.35; }
  dir.normalize();
  const target = ctr.clone();
  camera.position.copy(target).addScaledVector(dir, dist); camera.position.y = Math.max(camera.position.y + dist * lift, heightAt(camera.position.x, camera.position.z) + 3, 2);
  controls.target.copy(target); controls.update();
  sun.target.position.copy(target); sun.position.copy(target).add(new THREE.Vector3(-300, 520, 260));
  if (document.getElementById('isolate').checked) for (const k of ids) LM.parts[k].group.visible = id === '(overview)' || k === id;
}
pick.addEventListener('change', () => frame(pick.value, 'front'));
document.querySelectorAll('#angles button').forEach((b) => b.addEventListener('click', () => frame(current, b.dataset.a)));
const nightR = document.getElementById('nightR');
let night = 0;
document.getElementById('night').addEventListener('click', () => { night = night > 0.5 ? 0 : 1; nightR.value = night; });
nightR.addEventListener('input', () => { night = +nightR.value; });
document.getElementById('isolate').addEventListener('change', (e) => { if (!e.target.checked) for (const k of ids) LM.parts[k].group.visible = true; else frame(); });
document.getElementById('cols').addEventListener('change', (e) => { colGroup.visible = e.target.checked; });
const fogBox = document.getElementById('fog');
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------------- loop ----------------
const daySky = new THREE.Color(0xa9c6dc), nightSky = new THREE.Color(0x0b1220), sky = new THREE.Color();
scene.fog = new THREE.Fog(0xa9c6dc, 400, 7000);
const clock = new THREE.Clock();
const stats = document.getElementById('stats');
let fpsAcc = 0, fpsN = 0, fps = 0, time = 0;
function applyEnv() {
  sky.copy(daySky).lerp(nightSky, night);
  scene.background = sky; scene.fog.color.copy(sky);
  scene.fog.far = fogBox.checked ? 7000 - 3000 * night : 1e6; scene.fog.near = fogBox.checked ? 300 : 1e6;
  hemi.intensity = 1.1 * (1 - night) + 0.06 * night;
  sun.intensity = 2.6 * (1 - night) + 0.12 * night;
  sun.color.set(night > 0.5 ? 0x9fb4ff : 0xfff1dc);
  scene.environmentIntensity = 1 - 0.9 * night;
}
function loop() {
  const dt = Math.min(0.1, clock.getDelta()); time += dt;
  applyEnv();
  LM.update(dt, { time, night });
  controls.update();
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  const inf = renderer.info.render;
  const cur = current === '(overview)' ? '' : `\n${current}: ${LM.parts[current].triangles} tris, ${LM.parts[current].colliders.length} colliders`;
  stats.textContent = `fps ${fps.toFixed(0)}  calls ${inf.calls}  tris ${inf.triangles}\nlandmarks: ${totalTris} tris, ${lmDraws} meshes, ${LM.colliders.length} colliders\nbuild ${buildMs.toFixed(0)} ms${cur}`;
  requestAnimationFrame(loop);
}
frame('(overview)', 'front');
loop();
const view = (px, py, pz, tx, ty, tz) => { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); sun.target.position.set(tx, ty, tz); sun.position.set(tx - 300, ty + 520, tz + 260); return 'ok'; };
// bridge helpers: view along a bridge at distance s / lateral l
const brView = (br, s, l, y, ts, tl, ty) => { const [px, pz] = bridgePoint(br, s, l), [tx, tz] = bridgePoint(br, ts, tl); return view(px, y, pz, tx, ty, tz); };
// dev capture: renders one frame off-loop and POSTs the PNG to a local receiver (used for automated review; optional)
const shot = async (name, w = 1000, h = 560, port = 5199) => {
  const ow = window.innerWidth, oh = window.innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  applyEnv(); LM.update(0.05, { time, night }); renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setSize(ow, oh, false); camera.aspect = ow / oh; camera.updateProjectionMatrix();
  try { return await (await fetch(`http://127.0.0.1:${port}/?name=${encodeURIComponent(name)}`, { method: 'POST', body: url })).text(); } catch (e) { return String(e); }
};
window.__lm = { LM, camera, controls, frame, view, brView, shot, GG_BRIDGE, BAY_BRIDGE, LANDMARKS, scene, renderer, setNight: (v) => { night = v; nightR.value = v; }, heightAt };
