// HILLBOMB car preview + lab. Renders ON DEMAND only (no animation loop unless ?anim=1).
// URL: ?car=muscle&view=f34 (single car), ?cars=a,b,c (row), ?lab (physics lab table), ?studio (garage studio look)
// Keys: [ / ] prev/next car, 1-7 views, L lights, N night, A toggle animation loop.
// Console / automation: __cars.show(key, view), __cars.sheet(name, keys, views, {w,h,cols,look}) -> POSTs a JPEG
// contact sheet to http://127.0.0.1:5191/__shot?name=NAME (shots/NAME.jpg), __cars.lab(keys) -> table.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS, ROSTER_KEYS, getSpec, buildModel, carParams, perfOf, buildDef } from '../src/vehicle/cars.js';
import { _modelStats, _archCheck } from '../src/vehicle/models.js';
import * as LAB from '../src/game/garage/lab.js';

const qs = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa3ab);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.addEventListener('change', () => renderNow());
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x5a5448, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.4);
sun.position.set(6, 12, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 40 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.92 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(200, 200, 0x5f6368, 0x6b6f74); grid.position.y = 0.002; grid.material.transparent = true; grid.material.opacity = 0.3; scene.add(grid);

const keys = (qs.get('cars') ? qs.get('cars').split(',') : ROSTER_KEYS).filter(k => CARS[k]);
let idx = Math.max(0, keys.indexOf(qs.get('car') || keys[0]));
let cur = null, view = qs.get('view') || 'f34';
const state = { head: false, night: qs.has('night'), anim: qs.get('anim') === '1', look: null };
const hud = document.getElementById('hud');

function show(key, v = view, look = state.look) {
  if (cur) { scene.remove(cur.car.root); cur.car.dispose?.(); }
  const d = CARS[key], spec = getSpec(d.model);
  const car = buildModel(d.model, { paint: d.paint ?? spec.defaultPaint, paint2: d.paint2, hero: true, look: look || { paint: d.paint, finish: d.year < 1985 ? 'gloss' : 'metallic', paint2: d.paint2 } });
  car.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(car.root);
  cur = { key, car, spec, d };
  idx = keys.indexOf(key);
  setView(v);
  return key;
}
const VIEWS = { f34: [-0.7, 0.2], r34: [-2.45, 0.22], side: [-Math.PI / 2, 0.05], front: [0, 0.08], rear: [Math.PI, 0.1], top: [-0.9, 1.1], low: [-0.55, 0.02], rf34: [0.7, 0.2], rr34: [2.45, 0.22] };
function setView(v) {
  view = v;
  const [az, el] = VIEWS[v] || VIEWS.f34;
  const s = cur.spec, d = Math.max(4.4, s.length * 1.18 + s.height * 0.8) * (v === 'top' ? 1.1 : 1);
  const t = new THREE.Vector3(0, s.height * 0.42, 0);
  camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z - d * Math.cos(el) * Math.cos(az));
  controls.target.copy(t); controls.update();
  renderNow();
}
function applyNight() { hemi.intensity = state.night ? 0.05 : 0.8; sun.intensity = state.night ? 0.06 : 2.4; scene.environmentIntensity = state.night ? 0.06 : 1; scene.background.set(state.night ? 0x0b0e14 : 0x9aa3ab); }
function renderNow() {
  if (!cur) return;
  cur.car.setLights({ head: state.head || state.night, brake: false });
  renderer.render(scene, camera);
  if (hud) {
    const st = _modelStats(cur.d.model), s = cur.spec, m = perfOf(cur.key);
    hud.textContent = `${cur.d.name} ${cur.d.year}  [${cur.key} / model ${cur.d.model}]  view ${view}\n` +
      `PI ${m.pi} ${m.cls}  ${Math.round(cur.d.hp)} hp  ${cur.d.mass} kg  0-100 ${m.t100?.toFixed(1)} s  top ${Math.round(m.vmax)} km/h  brake ${m.brake100.toFixed(1)} m  lat ${m.lat120.toFixed(2)} g\n` +
      `tris ${st.tris}  draw calls ${st.drawCalls}  L ${s.length.toFixed(2)} W ${s.width.toFixed(2)} H ${s.height.toFixed(2)} wb ${s.wheelbase} R ${s.wheelRadius}\n` +
      `arches ${JSON.stringify(_archCheck(cur.d.model))}\nkeys: [ ] cars · 1-7 views · L lights · N night · A anim`;
  }
}
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ']') show(keys[(idx + 1) % keys.length]);
  else if (k === '[') show(keys[(idx + keys.length - 1) % keys.length]);
  else if (k >= '1' && k <= '7') setView(Object.keys(VIEWS)[+k - 1]);
  else if (k === 'l') { state.head = !state.head; renderNow(); }
  else if (k === 'n') { state.night = !state.night; applyNight(); renderNow(); }
  else if (k === 'a') { state.anim = !state.anim; loop(); }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); renderNow(); });
function loop() { if (!state.anim) return; controls.update(); renderNow(); requestAnimationFrame(loop); }

async function post(name, canvas) {
  const url = canvas.toDataURL('image/jpeg', 0.86);
  await fetch('http://127.0.0.1:5191/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return name;
}
/** contact sheet: keys x views grid, one JPEG */
async function sheet(name, list = [keys[idx]], views = ['f34', 'r34', 'side'], { w = 426, h = 240, cols = null, look = null, night = false } = {}) {
  cols = cols || views.length;
  const n = list.length * views.length, rows = Math.ceil(n / cols);
  const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = rows * h;
  const g = cv.getContext('2d');
  const old = [innerWidth, innerHeight], hudVis = hud?.style.display;
  if (hud) hud.style.display = 'none';
  const oldNight = state.night; state.night = night; applyNight();
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  let i = 0;
  for (const k of list) {
    show(k, views[0], look);
    for (const v of views) {
      setView(v);
      g.drawImage(renderer.domElement, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect((i % cols) * w, Math.floor(i / cols) * h, 200, 16);
      g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.fillText(`${k} ${v}`, (i % cols) * w + 4, Math.floor(i / cols) * h + 12);
      i++;
    }
  }
  renderer.setSize(old[0], old[1]); camera.aspect = old[0] / old[1]; camera.updateProjectionMatrix();
  if (hud) hud.style.display = hudVis;
  state.night = oldNight; applyNight(); renderNow();
  return post(name, cv);
}
function lab(list = keys, laps = false) {
  const route = LAB.routePoints(), rows = [];
  for (const k of list) {
    const P = carParams(k), s = getSpec(CARS[k].model), m = perfOf(k), r = LAB.runStraight(P, s), b = LAB.runBrake(P, s);
    const lp = laps ? LAB.runLap(P, s, route, m.lat120 * 9.81) : null;
    rows.push({ key: k, pi: m.pi, cls: m.cls, hp: buildDef(k).hp, kg: CARS[k].mass, t100m: +(m.t100 ?? 0).toFixed(2), t100r: +(r.t100 ?? 0).toFixed(2), vmaxm: Math.round(m.vmax), vmaxr: Math.round(r.vmax), brakem: +m.brake100.toFixed(1), braker: +(b ?? 0).toFixed(1), lat: +m.lat120.toFixed(2), lap: lp ? +lp.time.toFixed(1) : null });
  }
  console.table(rows);
  return rows;
}
window.__cars = { show, setView, sheet, lab, renderNow, state, keys, CARS, applyNight, get cur() { return cur; } };
applyNight();
show(keys[idx], view);
if (qs.has('lab')) { const t = lab(keys, qs.has('laps')); if (hud) hud.textContent = JSON.stringify(t.slice(0, 5)); }
if (state.anim) loop();
