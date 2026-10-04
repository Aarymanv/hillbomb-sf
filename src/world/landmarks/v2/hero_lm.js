// Blender-baked 1:1 hero landmarks (Union Square, Market St / FiDi ...): GLB LODs streamed by tile.
// Assets: public/assets/landmarks/<id>/<id>_lod0.glb (full detail, < ~450 m) and _lod1.glb (flat windows, far),
// built by tools/blender/hero_wave*.py; site list (origin, hidden OSM footprints, colliders) in hero_sites.js.
// registerHeroes(stream, { root, colliders }) -> { hide: [osm indices], replaces: Set(site ids), update(dt, env), sites }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HERO_SITES } from './hero_sites.js';
import { heroMat, heroMatLM, heroMatLM1, updateHeroMats, setHeroScene, glowMat, GLOW_U, CT_NP, CT_WIN } from './hero_mats.js';
import { loadPacked, texpackOn } from '../../texpack.js';

// Chinatown lightmap tuning (night = gain on the baked emitter irradiance), live-editable from the console
export const HERO_CT = { night: 3.2, far: 0.45 };
import { HERO_LIVE, NO_CT } from './hero_live.js';
import { ENV_ZONE } from '../../../render/environment.js';
import { HB_WET } from '../../../render/fog.js';
import { onCtStreet } from './ct_zone.js';
let zoneK = 0;
// zone strengths (night rain on the hero streets): sky / fog darkening; dev: window.__ctTune
export const CT_ZONE = { sky: 0.9, fog: 0.7, amb: 0.75 };
if (typeof window !== 'undefined') window.__ctTune = { HERO_CT, CT_ZONE, ENV_ZONE, CT_NP, CT_WIN };

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/landmarks/';
const NEAR = 480, DROP = 760, RANGE = 1300;
let loader = null;
export function heroLoader() {
  if (!loader) {
    const d = new DRACOLoader().setDecoderPath((import.meta.env?.BASE_URL || './') + 'draco/');
    loader = new GLTFLoader(); loader.setDRACOLoader(d);
  }
  return loader;
}

const HERO_MERGE = typeof location === 'undefined' || !/[?&]noheromerge/.test(location.search);
const NOSHADOW = new Set(['lamp', 'neon', 'lantern', 'shopint', 'curtain', 'sign', 'cwin']);
// glTF scene -> group of meshes with the shared slot materials (node names: L<lod>_<slot>[.001])
export function prepHero(scene, matFor = heroMat) {
  const out = new THREE.Group();
  const meshes = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  // (perf 10/4) opaque pieces that share a slot material are merged into one mesh per material: the Chinatown blocks were
  // ~165 draws each (ct_e / ct_w: ~330 of Chinatown's ~1260), every landmark a few dozen. Geometry is already baked to
  // the site frame, so this only changes the draw count (and culls per material instead of per piece). ?noheromerge = A/B.
  const groups = new Map();
  for (const o of meshes) {
    const nm = (o.name || o.parent?.name || '').replace(/\.\d+$/, '');
    const slot = nm.replace(/^L\d_/, '').replace(/^I_/, '');
    const g = o.geometry;
    g.applyMatrix4(o.matrixWorld);
    const mat = matFor(slot, g);
    const opaque = !mat.transparent;
    const cast = opaque && !NOSHADOW.has(slot);
    let key = null;
    if (opaque && HERO_MERGE && !g.groups.length && !Object.keys(g.morphAttributes).length) {
      key = [mat.uuid, cast, g.index ? 1 : 0, slot];
      for (const a of Object.keys(g.attributes).sort()) { const A = g.attributes[a]; if (A.isInterleavedBufferAttribute) { key = null; break; } key.push(a, A.itemSize, A.normalized ? 1 : 0, A.array.constructor.name); }
    }
    const k = key ? key.join('|') : Symbol();
    if (!groups.has(k)) groups.set(k, { slot, mat, opaque, cast, geos: [] });
    groups.get(k).geos.push(g);
  }
  for (const { slot, mat, opaque, cast, geos } of groups.values()) {
    let g = geos[0];
    if (geos.length > 1) { const mg = mergeGeometries(geos, false); if (mg) { g = mg; for (const q of geos) q.dispose(); } else { for (const q of geos) add(q); continue; } }
    add(g);
    function add(geo) {
      const m = new THREE.Mesh(geo, mat);
      m.name = slot;
      m.castShadow = cast;
      m.receiveShadow = opaque;
      m.matrixAutoUpdate = false; m.updateMatrix();
      out.add(m);
    }
  }
  return out;
}

function dispose(g) { g?.traverse(o => { if (o.isMesh || o.isPoints) o.geometry.dispose(); }); }

export function registerHeroes(stream, { root, colliders, terrain, scene }) {
  if (scene) setHeroScene(scene);
  // walkable surfaces (plaza plateau, terrace ramps, interior floors): permanent terrain decks
  for (const s of HERO_SITES) for (const d of [...(s.decks || []), ...(s.interior?.decks || [])]) {
    try { terrain?.addDeck({ name: 'hero:' + s.id, kind: 'plaza', width: d.width, sidewalk: 0, rails: false, tunnel: !!d.tunnel, pts: d.pts }); } catch (e) { console.warn('[heroes] deck', s.id, e); }
  }
  const sites = HERO_SITES.filter(s => !NO_CT || !s.id.startsWith('ct_')).map(s => ({ ...s, key: stream.tileAt(s.origin[0], s.origin[2])?.key ?? -1, group: null, lod: [null, null], busy: [false, false], live: false, cols: null }));
  HERO_LIVE.sites = sites;
  const add = (list) => colliders.addAll ? colliders.addAll(list) : list.forEach(c => colliders.add(c));
  const cam = new THREE.Vector3();
  let t = 0;

  // Chinatown blocks (s.lm): LOD0 waits for its day + night lightmaps (BC1 .dds when packed); per-site wall materials
  function lmTex(s, k, cb) {
    const url = BASE + s.id + '/' + s.lm[k];
    if (texpackOn() && (s.lm.dds || []).includes(k)) {
      loadPacked(url.replace(/\.(jpe?g|png)$/i, '.dds') + '?v=' + (s.lm.v || 0), { srgb: true, anisotropy: 4, onLoad: (t) => cb(t), onError: () => cb(null) });
      return;
    }
    new THREE.TextureLoader().load(url + '?v=' + (s.lm.v || 0), (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; cb(t); }, undefined, () => cb(null));
  }
  function dropLm(s) {
    for (const m of s.lmMats || []) m.dispose();
    s.lmTex?.forEach(t => t?.dispose()); s.lmMats = null; s.lmTex = null;
  }
  function want(s, l) {
    if (s.lod[l] || s.busy[l] || s.failed) return;
    s.busy[l] = true;
    let gl = null, tex = l === 0 && s.lm ? null : [], n = 0;
    const done = () => {
      if (!gl || !tex) return;
      s.busy[l] = false;
      if (!s.live) { tex.forEach(t => t?.dispose()); return; }
      let matFor;
      if (l === 1 && s.lm?.avg) {     // far LOD: flat mean night tint so the LOD0 swap doesn't pop dark -> lit
        const k = (s.lm.nightScale || 1) * HERO_CT.night * HERO_CT.far, a = s.lm.avg;
        const U1 = { uLmAvg: { value: new THREE.Vector3(a[0] * k, a[1] * k, a[2] * k) } };
        const cache = new Map(); s.lm1Mats = [];
        matFor = (slot) => { if (!cache.has(slot)) { const m = heroMatLM1(slot, U1); cache.set(slot, m); if (m.userData.keep === false) s.lm1Mats.push(m); } return cache.get(slot); };
      }
      if (l === 0 && s.lm && tex[0]) {
        tex[0].channel = 1;
        const U = { uLmN: { value: tex[1] || tex[0] }, uLmNK: { value: tex[1] ? (s.lm.nightScale || 1) * HERO_CT.night : 0 }, uLmDK: { value: s.lm.dayScale || 1 } };
        const cache = new Map(); s.lmMats = []; s.lmTex = tex; s.lmU = U;
        matFor = (slot) => { if (!cache.has(slot)) { const m = heroMatLM(slot, U, tex[0]); cache.set(slot, m); if (m.userData.keep === false) s.lmMats.push(m); } return cache.get(slot); };
      }
      const g = prepHero(gl.scene, matFor); g.name = 'lod' + l;
      s.lod[l] = g; s.group.add(g); pick(s);
      if (!s.colsOn && s.cols) { add(s.cols); s.colsOn = true; }   // solid only once something is drawn
    };
    if (!tex) {
      tex = null; const got = [null, null];
      const one = (k, i) => lmTex(s, k, (t) => { got[i] = t; if (++n === 2) { tex = got; done(); } });
      one('day', 0); one('night', 1);
    }
    heroLoader().load(BASE + s.id + '/' + s.lods[l].file + (s.lods[l].v ? '?v=' + s.lods[l].v : ''), (g) => { gl = g; done(); },
      undefined, (e) => { s.busy[l] = false; s.failed = true; console.warn('[heroes] load failed', s.id, e); });
  }
  function pick(s) {
    const near = s.dist < (s.near || NEAR) && s.lod[0];
    if (s.lod[0]) s.lod[0].visible = !!near;
    if (s.lod[1]) s.lod[1].visible = !near;
  }
  function activate(s) {
    s.live = true; s.dist = 1e9;
    s.group = new THREE.Group(); s.group.name = 'hero:' + s.id;
    s.group.position.set(s.origin[0], s.origin[1], s.origin[2]);
    root.add(s.group);
    if (s.glow?.length) {     // Chinatown lantern rain-haze halos (always on with the site, independent of the LOD)
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(s.glow, 3)); g.computeBoundingSphere();
      const p = new THREE.Points(g, glowMat()); p.name = 'glow'; p.renderOrder = 2;     // (not in the street mirror: reflected halos smeared into salmon fog)
      p.onBeforeRender = (r) => { GLOW_U.uVH.value = r.getRenderTarget()?.height || r.domElement.height; };
      s.group.add(p);
    }
    // colliders go in when the first LOD is drawn (a slow or failed GLB left an invisible building on the plaza)
    s.cols = (s.colliders || []).map(c => ({ ...c, kind: 'building' })); s.colsOn = false;
    want(s, 1);
  }
  function deactivate(s) {
    s.live = false;
    if (s.colsOn) for (const c of s.cols || []) colliders.remove(c);
    s.cols = null; s.colsOn = false;
    root.remove(s.group); dispose(s.group); dropLm(s); for (const m of s.lm1Mats || []) m.dispose(); s.lm1Mats = null; s.group = null; s.lod = [null, null];
  }

  // most heroes stream within RANGE; island / skyline sites flagged `far` (metres) get their own longer-range provider
  // (only their flat LOD1 loads out there: LOD0 still waits for `near`)
  const provider = (name, range, list0, priority) => stream.register({
    name, range, priority,
    load(tile) { const list = list0.filter(s => s.key === tile.key); for (const s of list) activate(s); return list.length ? list : null; },
    unload(list) { for (const s of list || []) deactivate(s); },
  });
  provider('heroes', RANGE, sites.filter(s => !s.far), 1);
  const farSites = sites.filter(s => s.far);
  if (farSites.length) provider('heroesFar', Math.max(...farSites.map(s => s.far)), farSites, 3);

  return {
    sites,
    hide: sites.flatMap(s => s.hide || []),
    replaces: new Set(sites.flatMap(s => s.replaces ? [s.replaces] : [])),
    update(dt, env = {}) {
      updateHeroMats(dt, env);
      // Chinatown night rain: near-black sky + darker haze while the camera is on / near a hero street (eased, ~1 s)
      if (!NO_CT && env.camera) {
        const c = env.camera.position, inZ = onCtStreet(c.x, c.z, 25) ? 1 : 0;
        zoneK += (inZ - zoneK) * Math.min(1, dt * 1.5);
        const k = zoneK * Math.min(1, (env.night || 0) * 1.2) * Math.min(1, HB_WET.x * 1.5 + 0.35);
        ENV_ZONE.sky = 1 - CT_ZONE.sky * k; ENV_ZONE.fog = 1 - CT_ZONE.fog * k; ENV_ZONE.amb = 1 - CT_ZONE.amb * k;
      }
      t -= dt; if (t > 0) return; t = 0.25;
      const p = env.camera?.position || env.focus || stream.focus;
      cam.set(p.x, p.y || 0, p.z);
      for (const s of sites) {
        if (!s.live) continue;
        s.dist = Math.hypot(cam.x - s.origin[0], cam.z - s.origin[2]);
        if (s.dist < (s.near || NEAR)) want(s, 0);
        else if (s.dist > Math.max(DROP, (s.near || NEAR) + 150) && s.lod[0]) { s.group.remove(s.lod[0]); dispose(s.lod[0]); s.lod[0] = null; dropLm(s); }
        pick(s);
      }
    },
  };
}
