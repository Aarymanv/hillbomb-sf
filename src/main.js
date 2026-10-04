// HILLBOMB: San Francisco. Boot, loading screen, title, main loop.
import * as THREE from 'three';
import { createEnvironment } from './render/environment.js';
import { createPost } from './render/post.js';
import { createStreetMirror } from './render/streetmirror.js';
import { CT_SEGS, onCtStreet } from './world/landmarks/v2/ct_zone.js';
import { HERO_LIVE, NO_CT } from './world/landmarks/v2/hero_live.js';
import { buildCtStreet } from './world/landmarks/v2/ct_street.js';
import { buildWorld } from './world/world.js';
import { buildWorld2 } from './world/v2/world2.js';
import { ll } from './world/latlon.js';
import { createInput } from './player/input.js';
import { createGame } from './game/game.js';
import { createEconomy } from './game/economy.js';
import { createSkills } from './game/skills.js';
import { createHud } from './ui/hud.js';
import { injectStyles } from './ui/style.js';
import { createAudio } from './audio/audio.js';
import { loadAssets } from './world/assets.js';
import { loadTreeAssets } from './world/props/trees.js';
import { loadCarAssets } from './vehicle/models.js';
import { setMode, MODES } from './game/modes.js';
import { resolveQuality, installQualityBenchmark, createDynRes } from './game/quality.js';
import { initTexpack } from './world/texpack.js';
import { installShaderWarm } from './render/shaderwarm.js';

const params = new URLSearchParams(location.search);
injectStyles();
// ---------------------------------------------------------------- loading screen
const boot = document.createElement('div');
boot.id = 'boot';
boot.innerHTML = `<div class="bg"></div>${ggSilhouette()}<div class="logo">HILLBOMB<i>.</i></div><div class="tag">San Francisco</div><div class="bar"><i></i></div><div class="stage">Starting</div>`;
document.body.appendChild(boot);
const setLoad = (p, s) => { boot.querySelector('.bar i').style.width = (p * 100).toFixed(1) + '%'; boot.querySelector('.stage').textContent = s; };
const frame2 = () => new Promise(r => { let done = false; requestAnimationFrame(() => { done = true; r(); }); setTimeout(() => { if (!done) r(); }, 60); });
await frame2();

if (params.has('memtrack')) { await import(/* @vite-ignore */ (location.port === '5190' ? '' : 'http://127.0.0.1:5190') + '/dev/memtrack.js?' + Date.now()); window.__memtrackHook?.(THREE); } // dev: GPU memory accounting (__gpumem)
// presets low / medium / high / ultra (game/quality.js): ?q= > saved > GPU auto-detect on the first run
const quality = resolveQuality(params);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality.shadows > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 9000);
setLoad(0.01, 'Loading photo-scanned materials');
await initTexpack(renderer, quality);   // BC1/BC3 .dds variants of the photo textures (world/texpack.js)
await loadAssets(renderer, p => setLoad(0.01 + p * 0.12, 'Loading photo-scanned materials'));
await loadTreeAssets(p => setLoad(0.13 + p * 0.03, 'Planting the trees'));
setLoad(0.16, 'Parking the cars'); try { await Promise.race([loadCarAssets(), new Promise(r => setTimeout(r, 10000))]); } catch (err) { console.warn('[boot] car assets', err); }
const env = createEnvironment({ renderer, scene, quality });
const post = createPost(renderer, scene, camera, quality);
setLoad(0.02, 'Rolling in the fog');
// Default: the real 1:1 San Francisco (OpenStreetMap + USGS elevation), streamed by tile. Spawn: Hyde & Lombard.
// ?map=v1 = the old hand-built ~0.49-scale map (fallback).
const MAP_V2 = params.get('map') !== 'v1';
const V2_SPAWN = { lat: 37.80165, lon: -122.41885, yaw: 0 };
const world = MAP_V2 ? await buildWorld2({ scene, env, camera, renderer, progress: setLoad, spawn: (() => { const sp = params.get('spawn'); if (sp) { const [x, z, yaw] = sp.split(',').map(Number); return { x, z, yaw: yaw || 0 }; } return { at: ['Hyde Street', 'Lombard Street'], along: 'Hyde Street', back: 60 }; })() })
  : await buildWorld({ scene, env, progress: setLoad });
// Chinatown hero streets: planar wet-street mirror (render/streetmirror.js), sampled by the wet-reflection pass
try { if (MAP_V2 && !NO_CT && quality.name !== 'low' && post.wet) post.mirror = createStreetMirror({ renderer, scene, segs: CT_SEGS, groundAt: (x, z) => world.groundAt(x, z, 999), sites: () => HERO_LIVE.sites, scale: quality.name === 'medium' ? 0.5 : 0.85, samples: quality.name === 'medium' ? 0 : 4 }); } catch (err) { console.warn('[boot] street mirror', err); }
const ctStreet = MAP_V2 && !NO_CT ? buildCtStreet({ scene, segs: CT_SEGS, groundAt: (x, z) => world.groundAt(x, z, 999), night: env.night, onCt: (x, z) => onCtStreet(x, z, 1) }) : null;
setLoad(0.86, 'Warming up engines');
await frame2();
const input = createInput(renderer.domElement);
const audio = createAudio();
const G = createGame({ scene, world, env, input, camera, audio, post, quality });
G.renderer = renderer;
G.economy = createEconomy(G);
G.economy.load();
installQualityBenchmark(G, quality);
G.quality = quality;
G.dynres = createDynRes({ renderer, post, quality, enabled: G.economy.settings.dynres !== false && !params.has('nodynres') });
G.hud = createHud(G);
setMode(G, params.get('mode') || G.economy.settings.mode || 'forza');
G.skills = createSkills(G);
G.systems.push(G.economy, G.skills);
G.hud.units = G.economy.settings.units;
env.state.fogMode = G.economy.settings.fog;

// optional systems (loaded if present: every src/game/sys_*.js, e.g. sys_carwarm street-car warm-up)
for (const [name, m] of Object.entries(import.meta.glob('./game/sys_*.js', { eager: true }))) {
  try { m.install?.(G); } catch (e) { console.error('[system] ' + name, e); }
}

// start: the player's current car on Hyde St at the top of Russian Hill, golden hour
const START = MAP_V2 ? { x: world.spawn.x, z: world.spawn.z, yaw: world.spawn.yaw || 0 } : { x: 1053, z: -870, yaw: 0 };
if (params.get('spawn')) { const [sx, sz, syaw] = params.get('spawn').split(',').map(Number); START.x = sx; START.z = sz; START.yaw = syaw || 0; }
// resume where the last session left off (economy.js keeps it while free driving); ?fresh = the default Hyde St start
else if (!params.has('fresh') && G.economy.stats.lastPos?.map === (MAP_V2 ? 'v2' : 'v1')) { const lp = G.economy.stats.lastPos; START.x = lp.x; START.z = lp.z; START.yaw = lp.yaw || 0; }
// saved / linked positions from the old v1 map (~0.49 scale, different origin) land in the bay on the 1:1 map: any start
// point that is not on land falls back to the default spawn (Hyde & Lombard) instead of dropping the player in the water
if (MAP_V2 && !(world.heightAt(START.x, START.z) > 0.3 && Math.abs(START.x) < 9000 && Math.abs(START.z) < 9000)) { START.x = world.spawn.x; START.z = world.spawn.z; START.yaw = world.spawn.yaw || 0; }
const car = G.spawnVehicle(params.get('car') || G.economy.current || 'hatch', START.x, START.z, START.yaw, { role: 'player' });
G.player.setVehicle(car);
if (params.has('foot')) G.player.exitVehicle(true);
env.state.hours = params.has('time') ? Number(params.get('time')) : params.has('night') ? 21.5 : 18.1;
Object.assign(window, { __G: G, __world: world, __scene: scene, __camera: camera, __env: env, __player: G.player, __sim: G.sim, __input: input, __renderer: renderer });

// ---------------------------------------------------------------- pause (menus module may replace)
G.state = params.has('play') ? 'play' : 'title';
G.hud.setVisible(G.state === 'play');
let titleEl = null;
if (G.state === 'title') {
  titleEl = document.createElement('div'); titleEl.id = 'title';
  const modeBtns = Object.entries(MODES).map(([k, m]) => `<button class="hb-btn modebtn" data-mode="${k}">${m.label}<small>${m.blurb}</small></button>`).join('');
  titleEl.innerHTML = `<div class="logo">HILLBOMB<i>.</i></div><div class="tag">San Francisco · open world</div><div class="menu hb-menu" style="margin-bottom:22px;max-width:520px">${modeBtns}</div><div class="press">Choose a mode · Enter / A to drive</div>`;
  document.body.appendChild(titleEl);
  const markMode = () => titleEl.querySelectorAll('.modebtn').forEach(b => b.classList.toggle('sel', b.dataset.mode === G.mode));
  titleEl.querySelectorAll('.modebtn').forEach(b => b.addEventListener('click', () => { setMode(G, b.dataset.mode); markMode(); audio.unlock(); startPlay(); }));
  markMode();
}
function startPlay() {
  if (G.state !== 'title') return;
  post.grade.uniforms.uFlash.value = 0; post.grade.uniforms.uFlashCol.value.setRGB(1, 1, 1);
  G.state = 'play'; titleEl?.remove(); G.hud.setVisible(true);
  audio.unlock(); audio.setVolumes({ master: G.economy.settings.volume, sfx: G.economy.settings.sfx, music: G.economy.settings.music });
  input.wantPointerLock = true;
  G.hud.toast('Welcome to San Francisco', 'Bomb the hills. Hit the jumps, dodge the cops, own the Bay.', '', 5200);
  G.hud.hint(input.padConnected
    ? '<span class="kbd">RT / LT</span> drive · <span class="kbd">A</span> handbrake · <span class="kbd">Y</span> exit car · <span class="kbd">View</span> map · <span class="kbd">Start</span> menu'
    : '<span class="kbd">W A S D</span> drive · <span class="kbd">SPACE</span> handbrake · <span class="kbd">F</span> exit car · <span class="kbd">M</span> map · <span class="kbd">ESC</span> menu · <span class="kbd">F1</span> controls');
  setTimeout(() => G.hud.hint(''), 12000);
  G.emit('start');
}
addEventListener('pointerdown', () => { audio.unlock(); }, { once: true });

// cinematic title shots: [from, to, lookFrom, lookTo]
const TITLE_V1 = [
  [[-1350, 22, -1320], [-1500, 30, -1600], [-1640, 70, -1800], [-1690, 80, -2150]],   // under the Golden Gate
  [[1053, 53, -925], [1053, 51, -975], [1030, 30, -1300], [900, 20, -2300]],          // top of Hyde St toward Alcatraz
  [[2400, 60, -700], [2300, 75, -300], [1750, 90, -400], [1700, 80, -250]],           // downtown from the bay
  [[2600, 45, -450], [2900, 50, -880], [2650, 60, -700], [3000, 60, -1100]],           // along the Bay Bridge
];
// v2: real landmark views, placed by lat/lon; y = metres above the ground (or sea) at that point
const P2 = (lat, lon, dy) => { const [x, z] = ll(lat, lon); return [x, Math.max(0, world.heightAt(x, z)) + dy, z]; };
// Hyde St: on the street centre from the Greenwich crest toward Lombard (graph intersections, not raw lat/lon)
function hydeShot() {
  const A = world.graph.intersection?.('Hyde Street', 'Greenwich Street'), B = world.graph.intersection?.('Hyde Street', 'Lombard Street');
  if (!A || !B) return null;
  const at = (t, dy) => { const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; return [x, world.groundAt(x, z, 999) + dy, z]; };
  return [at(0.05, 3.2), at(0.45, 3.2), P2(37.8080, -122.4196, 2), P2(37.8267, -122.4230, 10)];
}
const TITLE_V2 = MAP_V2 ? [
  [P2(37.8118, -122.4712, 18), P2(37.8142, -122.4738, 26), P2(37.8199, -122.4783, 75), P2(37.8262, -122.4808, 85)],   // under the Golden Gate from the bay
  hydeShot() || [P2(37.8008, -122.4188, 4), P2(37.8016, -122.4189, 4), P2(37.8080, -122.4196, 2), P2(37.8267, -122.4230, 10)], // Hyde St crest toward Alcatraz
  [P2(37.8000, -122.3830, 55), P2(37.7935, -122.3835, 70), P2(37.7898, -122.3969, 150), P2(37.7952, -122.4028, 120)], // downtown from the bay
  [P2(37.7930, -122.3790, 70), P2(37.8015, -122.3715, 75), P2(37.7990, -122.3745, 65), P2(37.8105, -122.3637, 60)],   // along the Bay Bridge
] : null;

// ---------------------------------------------------------------- loop
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); post.setSize(innerWidth, innerHeight); });
const clock = new THREE.Clock();
let titleT = 0, titlePadDir = 0;
function frame(dt) {
  input.update();
  if (window.__autopilot) window.__autopilot(input, dt);
  if (G.state === 'title') {
    titleT += dt;
    if (input.pressed('confirm')) startPlay();
    // pad: d-pad / left stick move the mode selection too (the drive bindings don't map d-pad up / down to 'up' / 'down')
    let padDir = 0;
    try { const p = [...(navigator.getGamepads?.() || [])].find(q => q && q.connected); if (p) { const y = p.axes[1] || 0; const d = p.buttons[12]?.pressed || y < -0.6 ? -1 : p.buttons[13]?.pressed || y > 0.6 ? 1 : 0; if (d !== titlePadDir) padDir = d; titlePadDir = d; } } catch { /* no gamepad API */ }
    if (input.pressed('up') || input.pressed('down') || padDir) {
      const ks = Object.keys(MODES), i = ks.indexOf(G.mode);
      setMode(G, ks[(i + (input.pressed('down') || padDir > 0 ? 1 : ks.length - 1)) % ks.length]);
      titleEl?.querySelectorAll('.modebtn').forEach(b => b.classList.toggle('sel', b.dataset.mode === G.mode));
      audio.ui?.('hover');
    }
    // cinematic title sequence: [from, to, lookFrom, lookTo], 9 s each, fade between shots
    const SHOTS = MAP_V2 ? TITLE_V2 : TITLE_V1;
    const D = 9, k = Math.floor(titleT / D) % SHOTS.length, t = (titleT % D) / D, S = SHOTS[k];
    const e = t * t * (3 - 2 * t);
    camera.position.set(S[0][0] + (S[1][0] - S[0][0]) * e, S[0][1] + (S[1][1] - S[0][1]) * e, S[0][2] + (S[1][2] - S[0][2]) * e);
    camera.lookAt(S[2][0] + (S[3][0] - S[2][0]) * e, S[2][1] + (S[3][1] - S[2][1]) * e, S[2][2] + (S[3][2] - S[2][2]) * e);
    if (camera.fov !== 52) { camera.fov = 52; camera.updateProjectionMatrix(); }
    const fade = Math.max(0, 1 - Math.min(t, 1 - t) * D / 0.8);
    post.grade.uniforms.uFlashCol.value.setRGB(0, 0, 0);
    post.grade.uniforms.uFlash.value = fade;
    env.update(dt, camera, camera.position);
    world.update(dt, { time: titleT, night: env.night.value, camera, focus: camera.position });
    applyLook();
    post.render(dt);
    input.endFrame();
    return;
  }
  // a system that owns a whole 3D screen (garage showroom, podium) renders instead of the world:
  // G.renderOverride = { update?(dt), render(renderer, dt) }; menus + HUD still tick
  const ov = G.renderOverride;
  if (ov) { ov.update?.(dt); G.menus?.update?.(dt); ov.render(renderer, dt); input.endFrame(); return; }
  if (G.state === 'play') {
    if (input.pressed('pause')) { G.emit('pause'); }
    G.update(dt);
  }
  // photo mode / cutscenes drive the camera after the game rig: G.cameraOverride = { update(camera, dt) }
  G.cameraOverride?.update(camera, dt);
  const fc = window.__freeCam;
  if (fc) { camera.position.set(fc.x, fc.y, fc.z); camera.lookAt(fc.tx, fc.ty, fc.tz); }
  G.menus?.update?.(dt);
  env.update(G.state === 'play' ? dt : 0, camera, G.player.pos);
  world.update(dt, { time: G.time, night: env.night.value, camera, focus: G.player.pos });
  ctStreet?.update(dt, camera);
  G.hud.update(dt);
  applyLook();
  post.grade.uniforms.uSpeed.value = G.rig.rig.speedBlur * 0.7;
  post.grade.uniforms.uDamage.value = G.player.mode === 'foot' ? Math.max(0, (40 - G.player.health) / 40) : 0;
  post.render(dt);
  input.endFrame();
}
function applyLook() {
  const L = env.look; if (L.exposure === undefined) return;
  renderer.toneMappingExposure = L.exposure;
  post.grade.uniforms.uSat.value = L.sat; post.grade.uniforms.uContrast.value = L.con;
  // night: neon, lanterns and headlights get real halos (strength), the threshold stays high so facades don't glow
  const nv = env.night.value; post.bloom.strength = 0.4 + 0.2 * nv; post.bloom.radius = 0.6 + 0.1 * nv;   // was 0.42 + 0.5 nv: lamps / shop glass bloomed into white blobs
}
window.__frame = frame;
// dev: capture the WebGL canvas (right after a render, same task) and POST it to the test server
window.__shot = async (name = 'shot', w = 1280, h0 = 720) => {
  if (renderer.domElement.width !== w) {
    renderer.setPixelRatio(1); renderer.setSize(w, h0, false); post.setSize(w, h0);
    camera.aspect = w / h0; camera.updateProjectionMatrix();
  }
  frame(1 / 60);
  const src = renderer.domElement, h = Math.round(w * src.height / src.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.85);
  await fetch('http://127.0.0.1:5191/__shot?name=' + name, { method: 'POST', body: url });
  return name;
};
// dev: free camera for captures. __look(x, y, z, tx, ty, tz) positions the camera (disables the game camera rig
// until __look(null)); __frames(n) steps n frames; __teleport(x, z, {foot}) moves the player
window.__look = (x, y, z, tx, ty, tz) => { window.__freeCam = x === null ? null : { x, y, z, tx, ty, tz }; };
window.__frames = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); };
// dev: camera on the nearest street at eye height, looking along it (flip = look the other way, side = lateral offset)
window.__street = (x, z, { h = 1.7, flip = false, side = 0, ahead = 60 } = {}) => {
  const n = world.graph.nearestEdge(x, z, 200); if (!n) return null;
  const e = n.edge, k = Math.min(n.k, e.pts.length - 2);
  let dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  if (flip) { dx = -dx; dz = -dz; }
  const px = n.x - dz * side, pz = n.z + dx * side, py = world.groundAt(px, pz, 999) + h;
  const tx = px + dx * ahead, tz = pz + dz * ahead, ty = world.groundAt(tx, tz, 999) + h * 0.8;
  window.__look(px, py, pz, tx, ty, tz);
  return e.name;
};
window.__teleport = (x, z, opts = {}) => {
  const P = G.player;
  if (opts.foot && P.vehicle) P.exitVehicle(true);
  if (P.vehicle) { const y = world.groundAt(x, z, 999) + 0.4; P.vehicle.place(x, y, z, opts.yaw ?? 0); G.rig.snap(); }
  else { P.pos.set(x, world.groundAt(x, z, 999), z); G.rig.snap(); }
};
// compile every material's shader program now (behind the loading screen) instead of on first sight while driving
setLoad(0.99, 'Warming up shaders');
// (sync compile: compileAsync polls programs on a timer and one of our patched materials makes it throw, hanging boot)
try { renderer.compile(scene, camera); } catch (err) { console.warn('[boot] shader precompile', err); }
// renderer.compile skips hidden objects: landmarks / LOD sets / kit cells that are hidden at boot compiled on first sight
// (Golden Gate steel + towers: 70-80 ms each in the first water reflection). One object per unseen material.
try {
  const seen = new Set(), todo = [];
  scene.traverseVisible(o => { const m = o.material; if (m) for (const x of Array.isArray(m) ? m : [m]) seen.add(x); });
  scene.traverse(o => { if (o.visible || !o.isMesh || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.every(x => seen.has(x))) return; ms.forEach(x => seen.add(x)); todo.push(o); });
  for (const o of todo) { o.visible = true; try { renderer.compile(o, camera, scene); } catch { /* one bad material must not stop the rest */ } o.visible = false; }
  console.log(`[boot] precompiled ${todo.length} hidden materials`);
} catch (err) { console.warn('[boot] hidden precompile', err); }
// two real frames behind the loading screen: the water reflection, car probe and shadow passes compile their own
// program variants and upload what only they see (100-160 ms hitches on the first frames of play otherwise)
try { frame(1 / 60); frame(1 / 60); } catch (err) { console.warn('[boot] warm frames', err); }
// no first-use shader stalls while playing (render/shaderwarm.js; after the boot precompile, which still blocks)
window.__shaderWarm = installShaderWarm(renderer, { scene });
setLoad(1, 'Ready');
await frame2();
boot.classList.add('out');
setTimeout(() => boot.remove(), 900);
renderer.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), 1 / 20); if (!window.__manual) { const t0 = performance.now(); G.dynres?.begin(); frame(dt); G.dynres?.update(G.state === 'play' && !G.photo?.active, performance.now() - t0); } });

function ggSilhouette() {
  // Golden Gate silhouette for the loading screen (inline SVG)
  return `<svg class="gg" viewBox="0 0 800 300" preserveAspectRatio="xMaxYMax meet"><g fill="none" stroke="#c0362c" stroke-width="3" opacity=".9">
  <path d="M0 250 L800 250"/><path d="M40 250 Q210 70 250 20 Q400 190 550 20 Q590 70 760 250"/>
  ${Array.from({ length: 30 }, (_, i) => { const x = 60 + i * 23; const y = x < 250 ? 250 - (x - 40) * 0.95 * (1 - (x - 40) / 420) : x < 550 ? 20 + 170 * (1 - Math.pow((x - 400) / 150, 2)) : 250 - (760 - x) * 0.95 * (1 - (760 - x) / 420); return `<path d="M${x} 250 L${x} ${Math.max(22, y)}" stroke-width="1" opacity=".6"/>`; }).join('')}
  </g><g fill="#c0362c"><rect x="238" y="10" width="8" height="260"/><rect x="254" y="10" width="8" height="260"/><rect x="538" y="10" width="8" height="260"/><rect x="554" y="10" width="8" height="260"/>
  <rect x="236" y="40" width="28" height="5"/><rect x="236" y="100" width="28" height="5"/><rect x="236" y="160" width="28" height="5"/><rect x="536" y="40" width="28" height="5"/><rect x="536" y="100" width="28" height="5"/><rect x="536" y="160" width="28" height="5"/></g>
  <rect x="0" y="248" width="800" height="8" fill="#c0362c"/></svg>`;
}
