// Preview page for src/player/human.js: http://127.0.0.1:5190/dev/human.html
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHuman, humanStats, HUMAN_SEAT_HIP_Y } from '../src/player/human.js';

const STATES = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land', 'drive', 'sit', 'flee', 'knocked', 'getup', 'wave', 'phone', 'enterCar', 'exitCar'];
const MOVING = new Set(['walk', 'run', 'sprint', 'flee']);
const SPEED_FOR = { walk: 1.4, run: 4, sprint: 7, flee: 5.5 };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb7c9);
scene.fog = new THREE.Fog(0x9fb7c9, 40, 120);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 5.2, 10.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, -1.8);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6b5a48, 1.3));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0x333a40, 0x6d747a);
grid.position.y = 0.002;
scene.add(grid);

// a seat block + wheel ring to judge drive / sit poses
const seatMark = new THREE.Group();
const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x3b4450 }));
seat.position.set(0, HUMAN_SEAT_HIP_Y - 0.1, 0.02);
const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 8, 24), new THREE.MeshStandardMaterial({ color: 0x222222 }));
wheel.position.set(0, 1.02, -0.42);
wheel.rotation.x = -0.35;
seatMark.add(seat, wheel);
seatMark.visible = false;
scene.add(seatMark);

// ---------------- the row of pedestrians ----------------
const ROW = [
  { seed: 11 }, { seed: 12, outfit: 'hoodie' }, { seed: 13, outfit: 'jacket' }, { seed: 14, outfit: 'suit', gender: 'm' },
  { seed: 15, outfit: 'dress' }, { seed: 16, outfit: 'police' }, { seed: 17, outfit: 'tshirt', build: 'heavy' },
  { seed: 18, outfit: 'jacket', gender: 'f' }, { seed: 19, outfit: 'hoodie', hairStyle: 'cap' }, { seed: 20, outfit: 'suit', gender: 'f' },
  { seed: 21, outfit: 'tshirt', hairStyle: 'long', gender: 'f', build: 'slim' }, { seed: 22, build: 'heavy', outfit: 'hoodie', hairStyle: 'bald' },
];
const ROWSET = new URLSearchParams(location.search).get('rowSet');
if (ROWSET === 'hair') ROW.splice(0, ROW.length, ...['short', 'long', 'bun', 'bald', 'cap'].flatMap((hairStyle, i) => [{ seed: 40 + i, hairStyle, gender: 'm', outfit: 'hoodie' }, { seed: 50 + i, hairStyle, gender: 'f', outfit: 'tshirt' }]));
if (ROWSET === 'outfit') ROW.splice(0, ROW.length, ...['tshirt', 'hoodie', 'jacket', 'suit', 'dress', 'police'].flatMap((outfit, i) => [{ seed: 60 + i, outfit, gender: 'm', build: 'average' }, { seed: 70 + i, outfit, gender: 'f', build: i % 2 ? 'heavy' : 'slim' }]));
const row = ROW.map((o, i) => {
  const h = createHuman(o);
  h.root.position.set((i - (ROW.length - 1) / 2) * 1.25, 0, -6);
  h.root.rotation.y = Math.PI;   // face the default camera
  scene.add(h.root);
  return h;
});
const MIXED = ['idle', 'wave', 'phone', 'idle', 'phone', 'idle', 'wave', 'phone', 'idle', 'phone', 'wave', 'idle'];

// ---------------- hero ----------------
const $ = (id) => document.getElementById(id);
const stateSel = $('state');
for (const s of STATES) stateSel.append(new Option(s, s));
stateSel.value = 'walk';
let hero = null;
function makeHero() {
  if (hero) hero.dispose();
  const o = { seed: +$('seed').value || 0 };
  if ($('outfit').value) o.outfit = $('outfit').value;
  hero = createHuman(o);
  scene.add(hero.root);
  window.__hb.hero = hero;
}
window.__hb = { scene, camera, controls, renderer, row, THREE, createHuman, humanStats, freeze: false, t: 0 };
makeHero();
$('seed').addEventListener('change', makeHero);
$('outfit').addEventListener('change', makeHero);
stateSel.addEventListener('change', () => { if (SPEED_FOR[stateSel.value] !== undefined) { $('speed').value = SPEED_FOR[stateSel.value]; } });

// foot trail: world positions of both ankles over the last ~3 s
const TRAIL_N = 360;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL_N * 2 * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: 0xff3355, size: 0.035 }));
trail.frustumCulled = false;
scene.add(trail);
let trailI = 0;
const _p = new THREE.Vector3();

// URL params for reproducible screenshots: ?state=walk&speed=1.4&cam=follow&ui=0&stopAt=2.5&seed=7&outfit=hoodie&row=idle
const Q = new URLSearchParams(location.search);
if (Q.has('state')) stateSel.value = Q.get('state');
if (Q.has('speed')) $('speed').value = Q.get('speed');
if (Q.has('row')) $('rowState').value = Q.get('row');
if (Q.has('lying')) $('lying').value = Q.get('lying');
if (Q.has('steer')) $('steer').value = Q.get('steer');
if (Q.has('circle')) $('circle').checked = Q.get('circle') !== '0';
if (Q.has('trail')) $('trail').checked = Q.get('trail') !== '0';
if (Q.get('ui') === '0') $('ui').style.display = 'none';
if (Q.has('seed') || Q.has('outfit')) { if (Q.has('seed')) $('seed').value = Q.get('seed'); if (Q.has('outfit')) $('outfit').value = Q.get('outfit'); makeHero(); }
const CAM = Q.get('cam') || 'chase';
const stopAt = Q.has('stopAt') ? +Q.get('stopAt') : Infinity;   // run fixed 1/60 steps until this sim time, then freeze
const CAMS = {
  chase: [[0, 5.2, 10.5], [0, 0.8, -1.8]], front: [[0, 1.3, -2.8], [0, 1.0, 0]], side: [[2.8, 1.1, 0], [0, 0.95, 0]],
  face: [[0.25, 1.72, -0.9], [0, 1.64, 0]], row: [[0, 1.5, -1.2], [0, 1.0, -6]], far: [[0, 2.5, 30], [0, 1, 0]],
  top: [[0, 9, 0.01], [0, 0, 0]], back: [[0, 1.3, 2.8], [0, 1.0, 0]],
  rowBack: [[0, 1.5, -10.8], [0, 1.0, -6]], rowSide: [[5, 1.4, -3.5], [2, 1.0, -6]],
};
if (CAMS[CAM]) { camera.position.set(...CAMS[CAM][0]); controls.target.set(...CAMS[CAM][1]); }
if (CAM === 'far') camera.fov = 20, camera.updateProjectionMatrix();
if (Q.get('sun') === 'front') sun.position.set(3, 8, -6);
if (CAM === 'face') { const hy = hero.height * 0.935; camera.position.set(0.3, hy + 0.03, -0.75); controls.target.set(0, hy, 0); }

// filmstrip: ?strip=8 shows N copies of the hero at evenly spaced gait phases (side view)
const STRIP = +(Q.get('strip') || 0);
const strip = [];
if (STRIP > 0) {
  hero.root.visible = false; row.forEach((h) => (h.root.visible = false));
  for (let i = 0; i < STRIP; i++) {
    const h = createHuman({ seed: +$('seed').value || 0, ...($('outfit').value ? { outfit: $('outfit').value } : {}) });
    h.root.position.set(0, 0, -(i - (STRIP - 1) / 2) * 1.05);   // time runs left -> right
    scene.add(h.root); strip.push(h);
  }
  camera.position.set(9, 0.95, 0); controls.target.set(0, 0.85, 0); camera.fov = STRIP > 6 ? 30 : 24; camera.updateProjectionMatrix();
}
let theta = 0, simT = 0;
const clock = new THREE.Clock();
const _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, clock.getDelta());
  if (stopAt < Infinity) {                       // deterministic: simulate up to stopAt in fixed steps, then hold
    let n = 0;
    while (simT < stopAt - 1e-6 && n++ < 2000) step(Math.min(1 / 60, stopAt - simT));
    if (n === 0) step(0);
  } else step(window.__hb.freeze ? 0 : rawDt * +$('ts').value);
  render();
}
function step(dt) {
  simT += dt; window.__hb.t = simT;
  const state = stateSel.value;
  const speed = +$('speed').value;
  $('speedV').textContent = speed.toFixed(1);
  $('tsV').textContent = (+$('ts').value).toFixed(2);
  $('lyingV').textContent = (+$('lying').value).toFixed(2);
  $('steerV').textContent = (+$('steer').value).toFixed(2);

  // hero motion
  const moving = MOVING.has(state) || (state === 'land' && speed > 0.3);
  const R = 3.5;
  let turn = 0;
  if (moving && $('circle').checked) {
    const w = speed / R;
    theta += w * dt;
    hero.root.position.set(R * Math.cos(theta), 0, R * Math.sin(theta));
    hero.root.rotation.y = Math.PI - theta;
    turn = -w;
  } else if (!moving) {
    hero.root.position.set(0, 0, 0);
    hero.root.rotation.y = 0;
  } else {
    hero.root.position.set(0, 0, 0);
    hero.root.rotation.y = 0;
  }
  seatMark.visible = (state === 'drive' || state === 'sit') && !STRIP;
  if (state === 'drive') {   // put the preview wheel between the hands so the grip can be judged
    hero.root.updateMatrixWorld(true);
    const a = hero.bones[7].getWorldPosition(new THREE.Vector3()), b = hero.bones[10].getWorldPosition(new THREE.Vector3());
    wheel.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.05, -0.03));
  }
  wheel.visible = state === 'drive';
  hero.update(dt, { state, speed: moving ? speed : 0, turn, lying: +$('lying').value, steer: +$('steer').value });

  if (STRIP > 0) {
    strip.forEach((h, i) => {
      const A = h._anim, sp = MOVING.has(state) ? speed : 0;
      h.update(0, { state, speed: sp, lying: +$('lying').value, steer: +$('steer').value });
      A.fade = 1; A.t = simT; A.vs = sp; A.lying = +$("lying").value; A.steer = +$("steer").value;
      if (MOVING.has(state)) A.phase = i / STRIP; else A.st = (i / Math.max(1, STRIP - 1)) * (+(Q.get('stripT') || 1.3));
      h.update(0, { state, speed: sp, lying: +$('lying').value, steer: +$('steer').value });
    });
  }
  // row
  const rs = $('rowState').value;
  row.forEach((h, i) => {
    const st = rs === 'mixed' ? MIXED[i % MIXED.length] : rs;
    h.update(dt, { state: st, speed: st === 'walk' ? 1.4 : 0, lying: st === 'knocked' ? 1 : 0 });
  });

  // trail
  if ($('trail').checked && dt > 0) {
    hero.root.updateMatrixWorld(true);
    for (const k of [13, 16]) {
      hero.bones[k].getWorldPosition(_p);
      trailPos.set([_p.x, _p.y, _p.z], ((trailI % TRAIL_N) * 2 + (k === 13 ? 0 : 1)) * 3);
    }
    trailI++;
    trailGeo.attributes.position.needsUpdate = true;
  }
  trail.visible = $('trail').checked;
}
function render() {

  if (CAM === 'follow' || CAM === 'followFront' || CAM === 'game') {
    const r = hero.root; _fw.set(-Math.sin(r.rotation.y), 0, -Math.cos(r.rotation.y)); _rt.set(-_fw.z, 0, _fw.x);
    const off = CAM === 'follow' ? _rt.clone().multiplyScalar(3.2) : CAM === 'game' ? _fw.clone().multiplyScalar(-4.0) : _fw.clone().multiplyScalar(3.0).addScaledVector(_rt, 1.2);
    camera.position.copy(r.position).add(off).setY(CAM === 'game' ? 1.9 : 1.15); controls.target.copy(r.position).setY(CAM === 'game' ? 1.2 : 0.9);
  }
  controls.update();
  renderer.render(scene, camera);
  const st = humanStats();
  $('stats').textContent = `hero: ${hero.look.outfit}/${hero.look.hairStyle}/${hero.look.build}/${hero.look.gender} h=${hero.height.toFixed(2)}\n` +
    `tris/hero: ${hero.mesh.geometry.attributes.position.count / 3}  (1 draw call each)\n` +
    `draw calls: ${renderer.info.render.calls}  variants cached: ${st.length}`;
}
frame();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
