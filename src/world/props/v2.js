// Street dressing for the 1:1 map (?map=v2), streamed per 512 m tile from the real road graph:
//   trees     : real OSM street trees + generated sidewalk trees (species by neighbourhood / boulevard) + park trees by
//               surface class (forest / lawn / scrub / back yards), Blender LOD0/LOD1 near, one impostor set far
//   junctions : mast-arm signals + ped heads at real signalised nodes (phases = drivers.signalFor), stop signs
//   sidewalks : lamps (type by district / street width), wood utility poles + lines on the avenues, hydrants, meters,
//               pay stations, bins, news boxes, bike racks, planters, benches, bollards, mailboxes, parking signs,
//               bus stops (shelter + pole) on trolley / arterial streets
//   Muni      : trolley span poles + contact wires on the real trolleybus / streetcar streets, wires over tram rails
//   parking   : parked cars in the parking lanes (edge.parkSides), proxy LOD + lazily built real-model near LOD
// Every tile owns chunks in shared StreamSets (one InstancedMesh per model city-wide), its colliders, lamp pools and
// wires; unload drops them all. Breakables (onHit) and parked-car conversion (parked.get/hide) keep the v1 contracts.
import * as THREE from 'three';
import * as MD from './models.js';
import * as TX from './textures.js';
import * as TR from './trees.js';
import { buildPierDeck } from './pierdeck.js';
import { mulberry, hash2 } from './kit.js';
import { StreamSet } from './v2set.js';
import { WireBuilder, makeWireMaterial } from './wires.js';
import { createFx } from './fx.js';
import { NOV4 } from '../facade/material.js';
import { keepOut } from '../keepout.js';
import { signalFor } from '../../game/drivers.js';
import { HB_WET } from '../../render/fog.js';
import { HERO_SITES } from '../landmarks/v2/hero_sites.js';

// hero plazas / parks (Union Square, Redwood Park, the Transit Center roof ...) plant their own trees: no generic ones there
const NO_TREES = HERO_SITES.flatMap(s => (s.noTrees || []).map(r => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { r, x0, x1, z0, z1 };
}));
// (buildings v6) back-yard tree share per 8 m yard cell by district (Mission / Noe / Victorian back gardens are leafy)
const NOV6P = typeof location !== 'undefined' && /[?&](nov[56]|noyardtrees)/.test(location.search || '');   // ?nov6 / ?noyardtrees = A/B
const YARD_TREES = { victorian: 0.14, mission: 0.12, castro: 0.15, marina: 0.11, avenues: 0.09, nobhill: 0.07, northbeach: 0.07, hills: 0.13 };
function heroNoTree(x, z) {
  for (const q of NO_TREES) {
    if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
    let ins = false; const r = q.r;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
    }
    if (ins) return true;
  }
  return false;
}
import { buildCarProxy, buildCarModel, getModelSpec, upgradeParkedSet } from '../../vehicle/models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgePointAt } from '../roads.js';
import { junction, edgeSpan } from '../v2/roadmesh.js';
import { buildLanternStringsV2 } from './lanterns2.js';   // Chinatown lantern strings (render / props)
import { zoneAtV2, COMMERCIAL_ZONES_V2, COMMERCIAL_STREETS_V2, TROLLEY_V2, STREET_TREES_V2, LINED_V2, PALM_STREETS } from './v2zones.js';

const TAU = Math.PI * 2;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const STREET_SCALE = { plane: [0.85, 1.05], plane2: [0.85, 1.05], ficus: [0.85, 1.1], ficus2: [0.85, 1.1], brisbox: [0.8, 1.05], cherry: [0.85, 1.1], plum: [0.85, 1.1], palm: [0.85, 1.05], canary2: [0.9, 1.1], fanpalm: [0.8, 1.0], fanpalm2: [0.85, 1.05], cypress2: [0.7, 0.9], pine2: [0.7, 0.9], oak2: [0.8, 1.0], euc2: [0.7, 0.9],
  ginkgo: [0.7, 1.0], vbox: [0.75, 1.05], redwood: [0.8, 1.1], redwood2: [0.8, 1.1], cypress3: [0.75, 1.2], pampas: [0.75, 1.15], scrub: [0.7, 1.15] };
const FOREST = [['euc', 0.2], ['euc2', 0.16], ['pine', 0.16], ['pine2', 0.14], ['cypress', 0.14], ['cypress2', 0.12], ['redwood2', 0.08]];
const LAWN = [['oak', 0.2], ['oak2', 0.2], ['cypress2', 0.2], ['pine2', 0.15], ['plane2', 0.15], ['euc2', 0.1]];
// real planted forests of SF (world metres, v2 projection): who grows where
const WOODS = {
  ggpark: [['euc', 0.2], ['euc2', 0.1], ['pine', 0.18], ['pine2', 0.1], ['cypress', 0.16], ['cypress2', 0.08], ['redwood', 0.1], ['redwood2', 0.08]],
  presidio: [['pine', 0.24], ['pine2', 0.12], ['cypress', 0.2], ['cypress2', 0.1], ['euc', 0.2], ['euc2', 0.1], ['redwood2', 0.04]],
  sutro: [['euc', 0.62], ['euc2', 0.26], ['pine2', 0.06], ['cypress2', 0.06]],          // Sutro Forest / Mt Davidson: blue gum
  coast: [['cypress3', 0.42], ['cypress', 0.2], ['cypress2', 0.1], ['pine', 0.16], ['pine2', 0.08], ['euc2', 0.04]],   // Lands End / Sea Cliff / Ocean Beach
  redwood: [['redwood', 0.55], ['redwood2', 0.35], ['euc2', 0.1]],
};
const SCRUB_COAST = [['scrub', 0.64], ['pampas', 0.16], ['cypress3', 0.12], ['pine2', 0.08]];
const SCRUB_INLAND = [['scrub', 0.86], ['pampas', 0.04], ['cypress2', 0.06], ['pine2', 0.04]];
const REDWOOD_GROVES = [[-3621, 488, 200], [-4640, 640, 120], [-5480, 700, 110]];   // AIDS Memorial Grove + smaller GG Park groves
const inCircle = (x, z, c) => (x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2];
function woodsAt(x, z, n2) {
  if (x < -6900) return WOODS.coast;
  if (inCircle(x, z, [-3445, 1820, 560]) || inCircle(x, z, [-3022, 4062, 360])) return WOODS.sutro;
  if (x > -8000 && x < -3350 && z > 330 && z < 1020) return REDWOOD_GROVES.some(c => inCircle(x, z, c)) || n2 > 0.74 ? WOODS.redwood : WOODS.ggpark;
  if (x > -6900 && x < -2400 && z < -1400) return WOODS.presidio;
  return FOREST;
}
// smooth value noise (irregular groves and clearings, not the old 64 m hash squares)
function vnoise(x, z, cell, salt) {
  const fx = x / cell, fz = z / cell, ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz; tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt), c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
const fbm2 = (x, z, salt) => vnoise(x, z, 110, salt) * 0.55 + vnoise(x, z, 41, salt + 1) * 0.3 + vnoise(x, z, 17, salt + 2) * 0.15;
const DOWNTOWNISH = new Set(['downtown', 'downtown_soma', 'tenderloin', 'chinatown', 'soma']);
const LCOL = { cool: [1.0, 0.86, 0.66], warm: [1.0, 0.74, 0.44], sodium: [1.0, 0.6, 0.26] };
const yawFront = (fx, fz) => Math.atan2(-fx, -fz);
// no parked cars: Balmy Alley (mural alley) and the Twin Peaks summit loop (world metres, v2 projection)
const NO_PARK_NAMES = /^(Balmy (Alley|Street)|Twin Peaks Boulevard|Christmas Tree Point Road)$/;
const NO_PARK_ZONES = [[608, 2542, 110, null], [-2490, 2267, 520, /Twin Peaks|Christmas Tree/]];   // x, z, r, name filter (null = any alley-width edge)
function noParking(e, x, z) {
  if (/^Balmy/.test(e.name || '')) return true;
  for (const [cx, cz, r, re] of NO_PARK_ZONES) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r && (re ? re.test(e.name || '') || NO_PARK_NAMES.test(e.name || '') : (e.width || 10) < 7.5)) return true;
  return false;
}
const HI_DIST = 42, HI_FADE = 7;

// Distance dither fade for StreamSet instances (per set: its own material clone + uniform, shared program): instances
// fade out over the last `band` m before the set's cull distance (and, with a near band, fade in complementary to a
// nearer LOD set), so nothing pops at maxDist / at the parked-car proxy <-> model swap. Colour pass only (the far end of
// every band is beyond the sun-shadow range).
const DFADE_V = /* glsl */`
#ifdef USE_INSTANCING
{ vec4 hbIp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vDFade = distance(hbIp.xz, cameraPosition.xz); }
#else
vDFade = 0.0;
#endif`;
const DFADE_F = /* glsl */`
{ float aF = clamp((uDFade.x - vDFade) / uDFade.y, 0.0, 1.0), aN = clamp((vDFade - uDFade.z) / uDFade.w, 0.0, 1.0);
  float hbIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (hbIgn >= aF || hbIgn < 1.0 - aN) discard; }`;
function fadeMat(base, U) {
  const m = base.clone();
  const prev = base.onBeforeCompile, key = base.customProgramCacheKey ? base.customProgramCacheKey() : base.type;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uDFade = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DFADE_V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDFade; uniform vec4 uDFade;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DFADE_F);
  };
  m.customProgramCacheKey = () => key + '+dfade1';
  m.userData = { ...m.userData, dfade: U };
  return m;
}
// set.fadeBand = distances between which the set is (partly) dithered: the pop probe ignores instances there.
// set.matWrap re-applies the fade when the set's material is swapped later (parked cars: baked-LOD upgrade)
function applyFade(set, band) {
  const far = set.maxDist, U = { value: new THREE.Vector4(far, Math.max(0.01, band), -1e4, 1) };
  set.dfade = U; set.fadeBand = [far - band, far];
  set.matWrap = (m) => (m && !m.userData?.dfade ? fadeMat(m, U) : m);
  set.material = set.material;
}

export function registerV2(stream, { data, terrain, graph, scene, root, night, F }) {
  const t0 = performance.now();
  const { yawM, pickW, CAR_MODELS, CAR_PAINT } = F;
  const H = (x, z) => terrain.heightAt(x, z);
  const colliders = stream.ctx.colliders;
  const U = { night: { value: 0 }, glowK: { value: 3.2 }, time: { value: 0 }, wind: { value: new THREE.Vector3(0.94, 0.34, 0.32) }, sun: { value: new THREE.Vector4(0, 0, -1, 1) } };
  const propTex = TX.propAtlas(), glowTex = TX.glowTexture();
  const propMat = F.makePropMaterial(propTex, U, 'v2'), signalMat = F.makeSignalMaterial(propTex, U), carMat = F.makeCarMaterial();
  const wireMat = makeWireMaterial();
  // park / forest trails: terrain-draped dirt ribbons, parented to the road root so the grass capture clears grass off them
  const pathTex = new THREE.TextureLoader().load((import.meta.env?.BASE_URL || './') + 'assets/tex/forest_floor/color.jpg');
  pathTex.wrapS = pathTex.wrapT = THREE.RepeatWrapping; pathTex.colorSpace = THREE.SRGBColorSpace; pathTex.anisotropy = 8;
  const pathMat = new THREE.MeshStandardMaterial({ map: pathTex, vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pathRoot = scene.getObjectByName('city') || root;
  try { buildPierDeck({ terrain, parent: pathRoot }); } catch (err) { console.warn('[props2] pier deck', err); }
  const poolMat = F.additiveFog(new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));

  // ---------------------------------------------------------------- instanced sets (shared by every tile)
  const models = {
    cobra: MD.cobraLamp(), cobraTall: MD.cobraLamp({ H: 11.5, arm: 3.1 }), ornate: MD.ornateLamp(), post: MD.postLamp(),
    trolley: MD.trolleyPole(), trolleyLamp: MD.trolleyPole({ lamp: true }), wood: MD.woodPole(), woodT: MD.woodPole({ transformer: true }),
    signalPole: MD.signalPole(), arm: MD.mastArm(), head: MD.signalHead(), ped: MD.pedHead(), stop: MD.stopSign(),
    hydrant: MD.hydrant(), meter: MD.parkingMeter(), pay: MD.payStation(), shelter: MD.busShelter(), busPole: MD.busStopPole(),
    bench: MD.bench(), trash: MD.trashCan(), news: MD.newsBoxes(3), news2: MD.newsBoxes(2), bike: MD.bikeRack(), planter: MD.planter(),
    bollard: MD.bollard(), mailbox: MD.mailbox(), psign: MD.parkingSign(), shard: MD.shard(), well: MD.treeWell(), wellG: MD.treeWell({ grate: true }),
  };
  const SETCFG = {
    cobra: { maxDist: 460, shadow: true, dyn: 6, height: 10 }, cobraTall: { maxDist: 560, shadow: true, dyn: 4, height: 12 },
    ornate: { maxDist: 460, shadow: true, dyn: 6, height: 9 }, post: { maxDist: 340, shadow: true, dyn: 6, height: 8 },
    trolley: { maxDist: 480, shadow: true, height: 10 }, trolleyLamp: { maxDist: 480, shadow: true, height: 10 },
    wood: { maxDist: 480, shadow: true, height: 11 }, woodT: { maxDist: 480, shadow: true, height: 11 },
    signalPole: { maxDist: 480, shadow: true, height: 8 }, arm: { maxDist: 480, shadow: true, height: 7 },
    stop: { maxDist: 240, dyn: 6, height: 3 }, hydrant: { maxDist: 180, dyn: 6, height: 1 }, meter: { maxDist: 150, dyn: 8, height: 1.5 },
    pay: { maxDist: 170, dyn: 4, height: 1.7 }, shelter: { maxDist: 320, shadow: true, height: 3 }, busPole: { maxDist: 220, dyn: 4, height: 3 },
    bench: { maxDist: 170, dyn: 6, height: 1 }, trash: { maxDist: 170, dyn: 8, height: 1.2 }, news: { maxDist: 170, dyn: 4, height: 1.2 },
    news2: { maxDist: 170, dyn: 4, height: 1.2 }, bike: { maxDist: 150, dyn: 4, height: 1 }, planter: { maxDist: 220, height: 1.4 },
    bollard: { maxDist: 170, dyn: 8, height: 1 }, mailbox: { maxDist: 170, dyn: 4, height: 1.5 }, psign: { maxDist: 170, dyn: 6, height: 2.6 },
    shard: { maxDist: 1, dyn: 72, height: 1 }, well: { maxDist: 150, height: 0.3 }, wellG: { maxDist: 150, height: 0.3 },
  };
  const sets = {};
  for (const k in SETCFG) {
    const c = SETCFG[k];
    sets[k] = new StreamSet(k, models[k].kit.toGeometry(), propMat, { maxDist: c.maxDist, castShadow: !!c.shadow, dynamic: c.dyn || 0, height: c.height, color: k === 'shard' });
  }
  sets.head = new StreamSet('head', models.head.kit.toGeometry(), signalMat, { maxDist: 380, attrs: { aState: 1 }, height: 7 });
  sets.ped = new StreamSet('ped', models.ped.kit.toGeometry(), signalMat, { maxDist: 200, attrs: { aState: 1 }, height: 4 });
  const setName = new Map(Object.entries(sets).map(([k, s]) => [s, k]));
  // trees: the Blender species sets (LOD0 + LOD1 per species, one impostor set), built empty and filled per tile
  const treeSets = TR.buildTreeSets([], U, StreamSet, yawM);
  const treeFar = treeSets[treeSets.length - 1];
  const treeLod = treeSets.lods;
  // distant woods (forest / park groves 1.9-3.6 km): impostor-only field so the Presidio, Golden Gate Park and Sutro read as forests
  const treeWoods = TR.buildFarSet(U, StreamSet, 'trees:woods');
  const WOODS_IN = [1800, 2050];
  const wqueue = [];   // distant-woods tiles: their own small per-frame slice (0.7 ms), never competing with near tiles
  // parked cars: proxy everywhere, the real model within HI_DIST (built lazily)
  const carSets = {}, carSpecs = {}, carHi = {};
  for (const [id] of CAR_MODELS) {
    try { carSpecs[id] = getModelSpec(id); carSets[id] = new StreamSet('parked:' + id, buildCarProxy(id), carMat, { maxDist: 210, color: true, height: 2, always: 40 }); upgradeParkedSet(carSets[id], id, 2); }
    catch (err) { console.warn('[props2] car model unavailable', id, err); }
  }
  for (const k in sets) if (sets[k].maxDist >= 40) applyFade(sets[k], Math.min(40, Math.max(12, sets[k].maxDist * 0.15)));
  for (const id in carSets) applyFade(carSets[id], 30);
  const allSets = [...Object.values(sets), ...treeSets, treeWoods, ...Object.values(carSets)];
  for (const s of allSets) s.finalize(root);
  const fx = createFx({ groundAt: (x, z, y) => terrain.groundAt(x, z, y), shardSet: sets.shard, group: root });

  // ---------------------------------------------------------------- static lookups per tile
  const tkey = (x, z) => stream.tileAt(x, z)?.key ?? -1;
  const push = (map, k, v) => { let a = map.get(k); if (!a) map.set(k, a = []); a.push(v); };
  const edgesByTile = new Map(), nodesByTile = new Map(), osmTrees = new Map(), railsByTile = new Map(), pathsByTile = new Map();
  const _ep = {};
  for (const e of graph.edges) { edgePointAt(e, e.len / 2, _ep); push(edgesByTile, tkey(_ep.x, _ep.z), e); }
  for (const n of graph.nodes) if (n.signal || n.stop) push(nodesByTile, tkey(n.x, n.z), n);
  for (const t of data.extras.trees || []) push(osmTrees, tkey(t[0], t[1]), t);
  for (const r of data.extras.rails || []) {
    if (r.bridge || (r.kind !== 'tram' && r.kind !== 'light_rail')) continue;
    for (let i = 0; i < r.pts.length - 1; i++) push(railsByTile, tkey(r.pts[i][0], r.pts[i][1]), [r.pts[i], r.pts[i + 1]]);
  }
  for (const p of data.extras.paths || []) {
    const w = (p.w || 2) / 2 + 0.8;
    for (let i = 0; i < p.pts.length - 1; i++) push(pathsByTile, tkey(p.pts[i][0], p.pts[i][1]), [p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1], w]);
  }
  const EH = graph.edgeHash, EC = graph.edgeHashCell;
  // signed clearance from the nearest ground road surface (< 0 = on a carriageway)
  function roadClear(x, z) {
    const arr = EH.get(Math.floor(x / EC) * 100003 + Math.floor(z / EC));
    if (!arr) return 99;
    let best = 99;
    for (let q = 0; q < arr.length; q++) {
      const e = arr[q][0], k = arr[q][1]; if (e.deck || e.kind === 'plaza') continue;   // busways / pedestrian malls are walkable
      const a = e.pts[k], b = e.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - a[0] - dx * t, ez = z - a[1] - dz * t, d = Math.sqrt(ex * ex + ez * ez) - e.width * 0.5;
      if (d < best) best = d;
    }
    return best;
  }
  // (v4) direction (yaw) of the nearest ground road segment: tree wells line up with the kerb
  function roadYaw(x, z) {
    const arr = EH.get(Math.floor(x / EC) * 100003 + Math.floor(z / EC));
    let best = 1e9, yaw = 0;
    if (arr) for (let q = 0; q < arr.length; q++) {
      const e = arr[q][0], k = arr[q][1]; if (e.deck) continue;
      const a = e.pts[k], b = e.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
      if (d < best) { best = d; yaw = Math.atan2(dx, dz); }
    }
    return yaw;
  }
  // true under / on a viaduct or bridge deck (trees there poke through the deck and block the carriageway)
  function underDeck(x, z) {
    const arr = EH.get(Math.floor(x / EC) * 100003 + Math.floor(z / EC));
    if (!arr) return false;
    for (let q = 0; q < arr.length; q++) {
      const e = arr[q][0], k = arr[q][1]; if (!e.deck || e.tunnel || e.deck.tunnel) continue;
      const a = e.pts[k], b = e.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < e.width * 0.5 + (e.deck.sidewalk || 0) + 3) return true;
    }
    return false;
  }
  // building footprints of a tile: bbox grid (8 m) + exact point-in-polygon on the few candidates
  const B = data.buildings;
  function buildingMask(tile) {
    const [f, c] = B.inTile(tile.tx, tile.tz), G8 = 8, NG = 64, grid = new Map(), ring = [];
    const rings = [];
    for (let i = f; i < f + c; i++) {
      B.ring(i, ring); const n = ring.length / 2; if (n < 3) continue;
      const r = Float32Array.from(ring);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < n; k++) { const x = r[k * 2], z = r[k * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const rec = { r, n, x0, x1, z0, z1 }; rings.push(rec);
      const i0 = Math.max(0, Math.floor((x0 - tile.x0) / G8)), i1 = Math.min(NG - 1, Math.floor((x1 - tile.x0) / G8));
      const j0 = Math.max(0, Math.floor((z0 - tile.z0) / G8)), j1 = Math.min(NG - 1, Math.floor((z1 - tile.z0) / G8));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const k = j * NG + ii; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(rec); }
    }
    const inside1 = (x, z) => {
      const i = Math.floor((x - tile.x0) / G8), j = Math.floor((z - tile.z0) / G8);
      if (i < 0 || j < 0 || i >= NG || j >= NG) return false;
      const a = grid.get(j * NG + i); if (!a) return false;
      for (const q of a) {
        if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
        const r = q.r, n = q.n; let ins = false;
        for (let u = 0, v = n - 1; u < n; v = u++) { const ax = r[u * 2], az = r[u * 2 + 1], bx = r[v * 2], bz = r[v * 2 + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) ins = !ins; }
        if (ins) return true;
      }
      return false;
    };
    return (x, z, pad = 0) => inside1(x, z) || (pad > 0 && (inside1(x + pad, z) || inside1(x - pad, z) || inside1(x, z + pad) || inside1(x, z - pad)));
  }
  function pathNear(list, x, z) {
    for (const s of list) {
      const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1;
      let t = ((x - s[0]) * dx + (z - s[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - s[0] - dx * t, ez = z - s[1] - dz * t; if (ex * ex + ez * ez < s[4] * s[4]) return true;
    }
    return false;
  }
  // occupancy per tile (2 m grid hash of placed footprints)
  function makeOcc() {
    const m = new Map(), OC = 4, K = (i, j) => i * 100003 + j;
    return {
      free(x, z, r) {
        const i0 = Math.floor((x - r - 3) / OC), i1 = Math.floor((x + r + 3) / OC), j0 = Math.floor((z - r - 3) / OC), j1 = Math.floor((z + r + 3) / OC);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = m.get(K(i, j)); if (!a) continue; for (let q = 0; q < a.length; q += 3) { const dx = a[q] - x, dz = a[q + 1] - z, rr = a[q + 2] + r; if (dx * dx + dz * dz < rr * rr) return false; } }
        return true;
      },
      occupy(x, z, r) { const k = K(Math.floor(x / OC), Math.floor(z / OC)); let a = m.get(k); if (!a) m.set(k, a = []); a.push(x, z, r); },
    };
  }
  // edge frame at s: centre, direction, right normal
  function frame(e, s, out) { edgePointAt(e, s, _ep); out.x = _ep.x; out.z = _ep.z; out.dx = _ep.dx; out.dz = _ep.dz; out.rx = -_ep.dz; out.rz = _ep.dx; return out; }
  const sidewalkOf = e => (e.deck || e.tunnel || e.kind === 'highway' || e.sidewalk < 1.2) ? 0 : e.sidewalk;
  const spanCache = new WeakMap();
  const span = e => { let s = spanCache.get(e); if (!s) spanCache.set(e, s = edgeSpan(e)); return s; };
  const commercialOf = (e, zone) => COMMERCIAL_ZONES_V2.has(zone) || COMMERCIAL_STREETS_V2.has(e.name);

  // ---------------------------------------------------------------- trees of a tile (cached; the far impostors need them too)
  const treeCache = new Map();
  const SP = TR.SPECIES_INDEX;
  function treesFor(tile) { const g = treesGen(tile); let r; do r = g.next(); while (!r.done); return r.value; }
  function* treesGen(tile, h = null) {
    let T = treeCache.get(tile.key);
    if (T) return T;
    const trees = [], R = mulberry(tile.key * 7919 + 17);
    const tq = performance.now();
    const bmask = buildingMask(tile);
    stats.tMask += performance.now() - tq;
    if (yieldNow()) yield;
    const paths = pathsByTile.get(tile.key) || [];
    const occ = makeOcc();
    const add = (spId, x, y, z, s, collide = true, well = null) => {
      const sp = SP[spId]; if (sp === undefined || underDeck(x, z) || heroNoTree(x, z)) return;
      // wind-shorn coastal cypress stream downwind (prevailing WNW sea breeze -> local +x toward ESE)
      const yaw = spId === 'cypress3' ? -0.35 + (R() - 0.5) * 0.6 : R() * TAU;
      trees.push({ sp, x, y, z, yaw, s, sy: 0.92 + R() * 0.16, tint: [0.86 + R() * 0.24, 0.86 + R() * 0.24, 0.84 + R() * 0.2], collide, well });
      occ.occupy(x, z, 1.2);
    };
    const scaleOf = id => { const [a, b] = STREET_SCALE[id] || [0.8, 1]; return a + R() * (b - a); };
    // real OSM trees
    for (const [x, z] of osmTrees.get(tile.key) || []) {
      const surf = terrain.surfaceRaw(x, z); if (surf === 0) continue;
      const rc = roadClear(x, z); if (rc < 0.4) continue;
      const zone = zoneAtV2(x, z), park = surf === 3 || surf === 7 || surf === 8;
      const id = park ? pickW(LAWN, R()) : pickW(STREET_TREES_V2[zone] || STREET_TREES_V2.victorian, R());
      const wy = rc < 6 && !park && rc > 0.9 ? roadYaw(x, z) : null;     // (v4) sidewalk tree: a tree well cut in the pavement
      add(id, x, H(x, z) + (rc < 6 && !park ? 0.03 : -0.1), z, scaleOf(id), true, wy === null ? null : { yaw: wy, grate: DOWNTOWNISH.has(zone) });
    }
    // generated sidewalk trees
    for (const e of edgesByTile.get(tile.key) || []) {
      const sw = sidewalkOf(e); if (sw < 1.8 || e.kind === 'crooked') continue;
      if (yieldNow()) yield;
      const [s0, s1] = span(e); if (s1 - s0 < 10) continue;
      const mid = frame(e, e.len / 2, {});
      const zone = zoneAtV2(mid.x, mid.z);
      let list = STREET_TREES_V2[zone] || STREET_TREES_V2.victorian, lined = LINED_V2[zone] ?? 0.3, spacing = zone === 'avenues' ? 10 : 8.5, u = Math.min(1.0, sw * 0.32);
      if (e.name === 'Dolores Street') { list = [['canary', 0.6], ['canary2', 0.4]]; lined = 0.97; spacing = 12; }   // the Dolores median: Canary Island date palms
      else if (PALM_STREETS.has(e.name)) { list = [['canary', 0.5], ['canary2', 0.3], ['fanpalm', 0.2]]; lined = 0.95; spacing = 13; }
      else if (e.name === 'Market Street') { list = [['plane', 1]]; lined = 1; spacing = 9.5; u = 1.2; }
      else if (e.name === 'Van Ness Avenue' || e.name === 'Geary Boulevard') { list = [['plane2', 0.7], ['brisbox', 0.3]]; lined = 0.85; spacing = 11; }
      else if (e.name === 'Sunset Boulevard' || e.name === 'Park Presidio Boulevard' || e.name === '19th Avenue') { list = [['cypress2', 0.5], ['pine2', 0.5]]; lined = 0.85; spacing = 13; u = 1.3; }
      for (const side of [1, -1]) {
        if (hash2(e.id, side + 3, 71) > lined) continue;
        const main = pickW(list, hash2(e.id, side, 13)), f = {};
        for (let s = s0 + 4 + hash2(e.id, side, 3) * 3; s < s1 - 4; s += spacing + (R() - 0.5) * 2) {
          if (R() < 0.14) continue;
          frame(e, s, f);
          const off = e.width / 2 + u, x = f.x + f.rx * side * off, z = f.z + f.rz * side * off;
          if (!occ.free(x, z, 4) || roadClear(x, z) < 0.5 || terrain.surfaceRaw(x, z) === 0) continue;
          const id = R() < 0.8 ? main : pickW(list, R());
          add(id, x, H(x, z) + 0.03, z, scaleOf(id), true, { yaw: Math.atan2(f.dx, f.dz), grate: commercialOf(e, zone) || DOWNTOWNISH.has(zone) });
        }
      }
    }
    // parks / forest / scrub / back yards from the surface raster (jittered 8 m grid; meadows left open by a noise field)
    const G = 8;
    for (let gz = tile.z0 + G / 2; gz < tile.z1; gz += G) for (let gx = tile.x0 + G / 2; gx < tile.x1; gx += G) {
      if (gx === tile.x0 + G / 2 && yieldNow()) yield;
      const h0 = hash2(gx, gz, 3);
      const surf = terrain.surfaceRaw(gx, gz);
      let p = 0, list = null, collide = true;
      if (surf !== 7 && surf !== 3 && surf !== 8 && surf !== 9) continue;
      // clumping: smooth multi-octave value noise -> irregular groves, clearings and tree lines
      const n = fbm2(gx, gz, 9), n2 = vnoise(gx, gz, 70, 29);
      if (surf === 7) { p = 0.74 * (0.4 + 1.1 * n); list = woodsAt(gx, gz, n2); }
      else if (surf === 3) {
        p = 0.07; list = LAWN;
        // big parks (Golden Gate Park, Presidio, Lands End, McLaren): irregular wooded clumps around open meadows; small lawns: a few trees
        if (zoneAtV2(gx, gz) === 'park') { const g = ss(0.56, 0.66, n); p = 0.02 + 0.6 * g; list = g > 0.3 ? woodsAt(gx, gz, n2) : LAWN; } else p *= n * n * 3;
      }
      else if (surf === 8) { p = 0.3 + 0.25 * n; list = gx < -6500 ? SCRUB_COAST : SCRUB_INLAND; }
      else {
        // (buildings v6) back gardens: mid-block trees so a residential block reads green-hearted from above (was 6 %)
        const zn = zoneAtV2(gx, gz);
        p = NOV6P ? 0.06 : YARD_TREES[zn] ?? 0.06; list = STREET_TREES_V2[zn] || STREET_TREES_V2.victorian;
      }
      if (h0 > p) continue;
      const x = gx + (hash2(gx, gz, 5) - 0.5) * G * 0.9, z = gz + (hash2(gx, gz, 6) - 0.5) * G * 0.9;
      if (terrain.surfaceRaw(x, z) !== surf || H(x, z) < 0.5) continue;
      if (roadClear(x, z) < (surf === 9 ? 5 : 2.5) || bmask(x, z, 1.5) || pathNear(paths, x, z) || !occ.free(x, z, 1.5)) continue;
      const id = pickW(list, hash2(gx, gz, 8));
      collide = id !== 'scrub' && id !== 'pampas';
      const [a, b] = STREET_SCALE[id] || [0.8, 1.05];
      add(id, x, H(x, z) - 0.15, z, a + hash2(gx, gz, 12) * (b - a), collide);
    }
    T = { trees, occ, bmask };
    stats.tTrees += performance.now() - tq; stats.nTreeTiles++;
    treeCache.set(tile.key, T);
    return T;
  }

  // ---------------------------------------------------------------- per-tile build
  const handles = new Map();
  const parked = new Map();     // id -> record
  let lampsAll = [], seatsAll = [], seatVersion = 0;
  const paintCache = new Map();
  const paintCol = hex => { let c = paintCache.get(hex); if (!c) { _c.setHex(hex); paintCache.set(hex, c = [_c.r, _c.g, _c.b]); } return c; };
  const _c = new THREE.Color(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3(), _mx = new THREE.Matrix4();
  const stats = { maxStep: 0, maxStepAt: '', tMask: 0, tTrees: 0, nTreeTiles: 0, tiles: 0, trees: 0, parked: 0, lamps: 0, signals: 0, stops: 0, busStops: 0, furniture: 0, colliders: 0, buildMs: 0, maxBuildMs: 0 };

  // Tiles build as generators time-sliced from update() (a dense downtown tile is ~10 ms of work); the loading-screen
  // fill (stream budget = Infinity) runs them to completion at once.
  const queue = [], slice = { t0: 0, ms: Infinity };
  const newHandle = tile => ({ key: tile.key, tile, sets: new Set(), cols: [], lamps: [], heads: [], parked: [], meshes: [], seats: [], keep: [], nTrees: 0, gen: null, done: false, work: 0 });
  function runGen(h, ms) {
    slice.t0 = performance.now(); slice.ms = ms;
    const r = h.gen.next();
    const d = performance.now() - slice.t0; h.work += d;
    if (d > stats.maxStep) { stats.maxStep = d; stats.maxStepAt = (h.far ? 'far:' : '') + h.phase; }
    if (r.done) { h.done = true; h.gen = null; if (h.far) return true; stats.tiles++; stats.buildMs += h.work; stats.maxBuildMs = Math.max(stats.maxBuildMs, h.work); }
    return h.done;
  }
  function startTile(tile) {
    const h = newHandle(tile);
    h.gen = buildGen(tile, h);
    if (stream.budgetMs === Infinity) runGen(h, Infinity); else queue.push(h);
    return h;
  }
  function stopTile(h) {
    if (!h) return;
    if (h.done) { dropTile(h); return; }
    const i = queue.indexOf(h); if (i >= 0) queue.splice(i, 1);
    for (const s of h.sets) s.abort();
    h.gen?.return(); h.gen = null;
    dropTile(h);          // chunks / colliders / meshes committed before the tile was cancelled
  }
  // for tools / tests: build one tile synchronously
  function buildTile(tile) { const h = newHandle(tile); h.gen = buildGen(tile, h); runGen(h, Infinity); return h; }
  const yieldNow = () => performance.now() - slice.t0 > slice.ms;
  function* buildGen(tile, h) {
    const key = tile.key;
    const put = (set, m, attr = null, col = null) => { if (!h.sets.has(set)) { set.begin(key); h.sets.add(set); } return set.add(m, attr, col); };
    h.phase = 'trees'; const T = yield* treesGen(tile), occ = T.occ; h.phase = 'treeput';
    const R = mulberry(key * 104729 + 3);
    // trees (near LODs + trunk colliders)
    for (const t of T.trees) {
      const S = TR.SPECIES[t.sp], m = yawM(t.x, t.y, t.z, t.yaw, t.s, t.s * t.sy, t.s);
      const inst = [treeLod[t.sp][0], put(treeLod[t.sp][0], m, null, t.tint), treeLod[t.sp][1], put(treeLod[t.sp][1], m, null, t.tint), treeLod[t.sp][2], put(treeLod[t.sp][2], m, null, t.tint)];
      if (t.well && !NOV4) { const ws = t.well.grate ? sets.wellG : sets.well; inst.push(ws, put(ws, yawM(t.x, t.y + 0.12, t.z, t.well.yaw))); }
      let tc = null;
      if (t.collide && S.collider > 0) h.cols.push(tc = { x: t.x, z: t.z, hx: S.collider * t.s, hz: S.collider * t.s, yaw: 0, yMin: t.y - 0.5, yMax: t.y + S.H * t.s * t.sy, kind: 'tree' });
      // (keep-out: trunk + a little canopy; scrub / pampas without a collider are drive-through)
      if (tc) h.keep.push({ x: t.x, z: t.z, r: tc.hx + 0.6, inst, col: tc, hid: false });
    }
    h.nTrees = T.trees.length;
    let propId = 0;
    // street furniture whose centre falls on a ground carriageway (sidewalk offsets measured from a neighbouring edge at
    // bends / junction corners: the streaming audit found ~20 visible ones in the road) is not placed. Lamp / utility
    // poles carry lamp heads and wires, so they stay.
    const LAMPS = new Set(['cobra', 'cobraTall', 'ornate', 'post', 'trolley', 'trolleyLamp', 'wood', 'woodT', 'signalPole']);
    function place(name, x, y, z, yaw, { r = 0.3, hx, hz, h: ht = 1, breakable = false, kind = 'prop', noCollider = false, attr = null } = {}) {
      if (!noCollider && !LAMPS.has(name) && roadClear(x, z) < -0.1) { stats.inRoad = (stats.inRoad || 0) + 1; return null; }
      const idx = put(sets[name], yawM(x, y, z, yaw), attr);
      let c = null;
      if (!noCollider) {
        c = { x, z, hx: hx ?? r, hz: hz ?? r, yaw, yMin: y - 0.3, yMax: y + ht, kind, breakable, id: 'prop2:' + key + ':' + (propId++) };
        c.propRef = { set: name, key, index: idx, x, y, z, yaw };
        h.cols.push(c);
        h.keep.push({ x, z, r: Math.max(c.hx, c.hz), inst: [sets[name], idx], col: c, hid: false });
        if (name === 'bench' || name === 'shelter') h.seats.push(c);
      }
      return c;
    }
    const lampHead = (x, y, z, r, col) => { const L = { x, y, z, r, col, broken: false, pool: null }; h.lamps.push(L); return L; };
    // (footprints are not tested here: OSM building polygons often reach over the modelled sidewalk, e.g. all along Market St)
    const sidewalkY = (x, z, r) => (roadClear(x, z) > r + 0.1 && terrain.surfaceRaw(x, z) !== 0) ? H(x, z) + 0.15 : null;
    const wires = new WireBuilder(1e6);
    const f = {}, g = {};

    h.phase = 'junctions';
    // ---- junctions: signals + stop signs
    for (const n of nodesByTile.get(key) || []) {
      if (yieldNow()) yield;
      const J = junction(n);
      const apps = [];
      for (const a of J.arms) {
        const e = a.e; if (e.deck || e.kind === 'crooked' || e.kind === 'alley' || e.kind === 'plaza' || e.kind === 'highway') continue;
        apps.push({ e, dx: -a.dx, dz: -a.dz, rx: a.dz, rz: -a.dx, hw: e.width / 2, trim: a.trim });
      }
      if (apps.length < 3 && !(n.signal && apps.length >= 2)) continue;
      const crossD = (A) => { let D = 3; for (const Bq of apps) { if (Bq === A) continue; const sn = Math.abs(A.dx * Bq.dz - A.dz * Bq.dx); if (sn > 0.3) D = Math.max(D, Bq.hw / sn); } return Math.min(D, 30); };
      if (n.signal) {
        stats.signals++;
        for (const A of apps) {
          const D = crossD(A);
          let px = n.x + A.dx * (D + 1.1) + A.rx * (A.hw + 0.9), pz = n.z + A.dz * (D + 1.1) + A.rz * (A.hw + 0.9);
          let y = sidewalkY(px, pz, 0.35);
          if (y === null) { px = n.x + A.dx * (D + 2.5) + A.rx * (A.hw + 1.4); pz = n.z + A.dz * (D + 2.5) + A.rz * (A.hw + 1.4); y = sidewalkY(px, pz, 0.35); }
          if (y === null) continue;
          const yaw = yawFront(-A.rx, -A.rz);
          place('signalPole', px, y, pz, yaw, { r: 0.28, h: 7.4, kind: 'pole' });
          occ.occupy(px, pz, 0.9);
          const lat = (px - n.x) * A.rx + (pz - n.z) * A.rz;
          const lanes = Math.max(1, Math.min(4, A.e.lanes));
          const armLen = Math.max(3.2, Math.min(12, lat - laneLat(A.e, 0, 1) + 0.7));
          put(sets.arm, yawM(px, y + 5.9, pz, yaw, 1, 1, armLen));
          const hyaw = yawFront(-A.dx, -A.dz), grp = { set: sets.head, idx: [], node: n, hx: A.dx, hz: A.dz };
          for (let l = 0; l < lanes; l++) {
            const off = Math.min(armLen - 0.4, lat - laneLat(A.e, l, 1));
            grp.idx.push(put(sets.head, yawM(px - A.rx * off, y + 5.9 - 0.72, pz - A.rz * off, hyaw), { aState: 0 }));
          }
          grp.idx.push(put(sets.head, yawM(px - A.rx * 0.32, y + 3.3, pz - A.rz * 0.32, hyaw), { aState: 0 }));
          h.heads.push(grp);
          h.heads.push({ set: sets.ped, idx: [put(sets.ped, yawM(px - A.rx * 0.22, y + 2.75, pz - A.rz * 0.22, yawFront(-A.rx, -A.rz)), { aState: 0 })], node: n, hx: A.rx, hz: A.rz });
          h.heads.push({ set: sets.ped, idx: [put(sets.ped, yawM(px + A.dx * 0.22, y + 2.75, pz + A.dz * 0.22, yawFront(A.dx, A.dz)), { aState: 0 })], node: n, hx: A.dx, hz: A.dz });
        }
      } else if (n.stop) {
        for (const A of apps) {
          const D = crossD(A);
          const px = n.x - A.dx * (D + 1.3) + A.rx * (A.hw + 0.55), pz = n.z - A.dz * (D + 1.3) + A.rz * (A.hw + 0.55);
          const y = sidewalkY(px, pz, 0.2);
          if (y === null || !occ.free(px, pz, 0.3)) continue;
          place('stop', px, y, pz, yawFront(-A.dx, -A.dz), { r: 0.12, h: 2.9, breakable: true });
          occ.occupy(px, pz, 0.5); stats.stops++;
        }
      }
    }

    h.phase = 'streets';
    // ---- streets: both sidewalks of every edge in the tile
    for (const e of edgesByTile.get(key) || []) {
      if (e.deck || e.tunnel || e.kind === 'crooked') continue;
      if (yieldNow()) yield;
      const sw = sidewalkOf(e);
      const [s0, s1] = span(e), L = s1 - s0;
      if (L < 6) continue;
      const mid = frame(e, e.len / 2, {});
      const zone = zoneAtV2(mid.x, mid.z), com = commercialOf(e, zone), dt = DOWNTOWNISH.has(zone);
      const trolley = TROLLEY_V2.has(e.name) && e.width >= 10.5 && e.kind !== 'highway';
      const market = e.name === 'Market Street';
      // wood utility poles + overhead lines: the avenues / hills, and (v4) most residential streets of the Mission, Castro /
      // Noe, the Victorian districts and the industrial south-east (SF still has thousands of street poles there)
      const poleP = zone === 'avenues' || zone === 'hills' ? 1 : zone === 'mission' ? 0.75 : zone === 'castro' ? 0.65 : zone === 'victorian' ? 0.5 : zone === 'industrial' ? 0.55 : zone === 'northbeach' ? 0.3 : 0;
      const avenuesLocal = (NOV4 ? zone === 'avenues' || zone === 'hills' : poleP > 0) && e.width <= (zone === 'avenues' || zone === 'hills' ? 12.5 : 13.5) && !trolley && !(com && zone !== 'avenues' && zone !== 'hills') && hash2(e.id, 7, 23) < poleP;
      const parkOK = e.parkSides > 0 && !e.restricted && e.kind !== 'highway' && e.kind !== 'plaza' && !noParking(e, mid.x, mid.z);
      const busLine = trolley || e.kind === 'arterial';
      // trolley span poles + contact wires (one set of poles for both sides)
      const trolleyPoles = [];
      for (const side of [1, -1]) {
        const eh = hash2(e.id, side + 5, 11);
        const R2 = mulberry(Math.floor(hash2(e.id, side, 99) * 1e9));
        const yawS = s => { frame(e, s, g); return yawFront(-g.rx * side, -g.rz * side); };
        const at = (s, u) => { frame(e, s, f); const off = e.width / 2 + u; return [f.x + f.rx * side * off, f.z + f.rz * side * off]; };
        const blocked = [];     // [s0, s1] no-parking spans (hydrants, bus stops)
        if (sw > 0) {
          // hydrants: near a corner, some mid-block
          if (L > 16) {
            const hs = [];
            if (eh < 0.62) hs.push(eh < 0.31 ? s0 + 4 + eh * 6 : s1 - 4 - eh * 4);
            if (L > 90 && hash2(e.id, side, 21) < 0.35) hs.push(s0 + L * 0.5);
            for (const s of hs) {
              const [x, z] = at(s, 0.5), y = sidewalkY(x, z, 0.2);
              if (y === null || !occ.free(x, z, 0.4)) continue;
              place('hydrant', x, y, z, yawS(s), { r: 0.2, h: 0.85, breakable: true }); occ.occupy(x, z, 0.5);
              blocked.push([s - 2.8, s + 2.8]); stats.furniture++;
            }
          }
          // bus stop: near side of the far junction in the travel direction of this side
          if (busLine && L > 70 && sw >= 2.4 && hash2(e.id, side, 31) < (trolley ? 0.55 : 0.3)) {
            const s = side > 0 ? s1 - 16 : s0 + 16;
            const [x, z] = at(s, Math.min(sw - 1.0, 2.2)), y = sidewalkY(x, z, 0.8);
            if (y !== null && occ.free(x, z, 2)) {
              if (sw >= 3.2) place('shelter', x, y, z, yawS(s), { r: 0.5, hx: 2.1, hz: 0.75, h: 2.6, breakable: false });
              const [bx, bz] = at(s - 3 * side, 0.4), by = sidewalkY(bx, bz, 0.1);
              if (by !== null) place('busPole', bx, by, bz, yawS(s), { r: 0.1, h: 3, breakable: true });
              occ.occupy(x, z, 2.4); blocked.push([s - 14, s + 10]); stats.busStops++;
            }
          }
          // street lighting
          if (trolley) {
            // span poles stand in opposite pairs (the span wires); (v4) every pole carries a cobra head, 32 m apart
            // (was a lamp on every other pole: ~1 per 86 m per side on Divisadero)
            const sp = 32, off = hash2(e.id, 1, 4) * sp;
            for (let s = s0 + 4 + off % sp; s < s1 - 3; s += sp) {
              const [x, z] = at(s, 0.45), y = sidewalkY(x, z, 0.25);
              if (y === null || !occ.free(x, z, 0.5)) continue;
              const lamp = true, name = 'trolleyLamp';
              const c = place(name, x, y, z, yawS(s), { r: 0.24, h: 9, kind: 'pole' });
              occ.occupy(x, z, 0.8);
              if (lamp) { const mdl = models.trolleyLamp, yw = yawS(s), cc = Math.cos(yw), sn = Math.sin(yw); const L0 = lampHead(x + cc * mdl.head[0] + sn * mdl.head[2], y + mdl.head[1], z - sn * mdl.head[0] + cc * mdl.head[2], 8.5, LCOL.cool); if (c) c.propRef.lamps = [L0]; }
              trolleyPoles.push({ side, s, x, y, z });
            }
          } else if (avenuesLocal) {
            // wood utility poles on one side of the avenues, carrying sodium lamps and the overhead lines
            if (side === (hash2(e.id, 3, 17) < 0.5 ? 1 : -1)) {
              const sp = 40, poles = [];
              for (let s = s0 + 6 + hash2(e.id, 9, 2) * 12; s < s1 - 5; s += sp) {
                const [x, z] = at(s, 0.42), y = sidewalkY(x, z, 0.2);
                if (y === null || !occ.free(x, z, 0.5)) continue;
                const tr = hash2(x, z, 4) < 0.18, yw = yawS(s), mdl = tr ? models.woodT : models.wood;
                place(tr ? 'woodT' : 'wood', x, y, z, yw, { r: 0.2, h: 10.5, kind: 'pole' });
                occ.occupy(x, z, 0.7);
                const cc = Math.cos(yw), sn = Math.sin(yw), W = p => [x + cc * p[0] + sn * p[2], y + p[1], z - sn * p[0] + cc * p[2]];
                lampHead(...W(mdl.head), 6.5, LCOL.sodium);
                poles.push({ anchors: mdl.wires.map(W), comm: W(mdl.comm), s, x, z, y });
              }
              for (let i = 1; i < poles.length; i++) { const A = poles[i - 1], Bq = poles[i]; for (let w = 0; w < 4; w++) wires.span(A.anchors[w], Bq.anchors[w], w === 3 ? 0.35 : 0.55, 10); wires.span(A.comm, Bq.comm, 0.7, 10); }
              // (v4) service drops: from each pole to the fronts of the houses around it, on both sides of the street
              const bm = NOV4 ? () => false : T.bmask;
              for (const Pq of poles) for (const [ds, sd] of [[-9, 1], [7, 1], [-4, -1], [11, -1]]) {
                if (hash2(Pq.x + ds, Pq.z + sd, 41) < 0.25) continue;
                const s2 = Pq.s + ds + (hash2(Pq.x, ds, 43) - 0.5) * 3; if (s2 < s0 + 2 || s2 > s1 - 2) continue;
                frame(e, s2, g); const off = (e.width / 2 + sw + 0.15) * side * sd, hx = g.x + g.rx * off, hz = g.z + g.rz * off;
                const ix = hx + g.rx * side * sd * 0.8, iz = hz + g.rz * side * sd * 0.8;
                if (!bm(ix, iz)) continue;
                const hy = H(hx, hz) + 5.2 + 1.2 * hash2(hx, hz, 44);
                wires.span(Pq.comm, [hx, hy, hz], 0.22, 6);
              }
            }
          } else {
            let type, sp;
            if (market || e.name === 'The Embarcadero') { type = 'ornate'; sp = 29; }
            else if (dt) { type = 'cobra'; sp = 30; }
            // (v4) arterials / commercial streets: 30-34 m per side, staggered between the sides
            else if (e.width >= 16) { type = 'cobraTall'; sp = com ? 30 : 34; }
            else if (e.width >= 13 || com || zone === 'industrial' || zone === 'wharf') { type = 'cobra'; sp = com ? 30 : 32; }
            else { type = 'post'; sp = 42; }
            const st = (hash2(e.id, 1, 4) * sp + (side < 0 ? sp / 2 : 0)) % sp;
            for (let s9 = s0 + 3 + st; s9 < s1 - 3; s9 += sp) {
              // slide along the curb past a tree well / hydrant before giving the lamp up
              let s = s9, x = 0, z = 0, y = null;
              for (const d of [0, 2.4, -2.4, 4.8]) { s = s9 + d; if (s < s0 + 1 || s > s1 - 1) continue; [x, z] = at(s, 0.45); y = sidewalkY(x, z, 0.25); if (y !== null && occ.free(x, z, 0.6)) break; y = null; }
              if (y === null) continue;
              const yw = yawS(s), c = place(type, x, y, z, yw, { r: 0.2, h: 9, breakable: true });
              occ.occupy(x, z, 0.7);
              const mdl = models[type], cc = Math.cos(yw), sn = Math.sin(yw), li = [];
              for (const hd of mdl.heads2 || [mdl.head]) li.push(lampHead(x + cc * hd[0] + sn * hd[2], y + hd[1], z - sn * hd[0] + cc * hd[2], type === 'cobraTall' ? 10 : type === 'cobra' ? 8.5 : 6.2, type === 'post' || type === 'ornate' ? LCOL.warm : LCOL.cool));
              if (c) c.propRef.lamps = li;
            }
          }
          // furniture
          const putF = (model, s, u, yaw, r, ht, opts = {}) => {
            if (s < s0 + 1 || s > s1 - 1) return false;
            const [x, z] = at(s, u), y = sidewalkY(x, z, r); if (y === null || !occ.free(x, z, r + 0.15)) return false;
            place(model, x, y, z, yaw, { r, h: ht, breakable: opts.breakable ?? true, hx: opts.hx, hz: opts.hz });
            occ.occupy(x, z, r + 0.2); stats.furniture++;
            return true;
          };
          const Y = yawS(s0 + L / 2);
          if (com && parkOK && L > 24 && sw >= 2) {
            if (dt && R2() < 0.5) putF('pay', s0 + L * (0.3 + R2() * 0.4), 0.45, Y, 0.25, 1.6);
            else if (R2() < 0.7) for (let s = s0 + 7.5; s < s1 - 7; s += 6.2) { if (R2() < 0.12) continue; putF('meter', s, 0.35, yawS(s), 0.12, 1.5); }
          }
          const trashP = com ? 0.75 : 0.12;
          if (R2() < trashP) putF('trash', s0 + 3.6, 0.6, R2() * TAU, 0.33, 1.1);
          if (R2() < trashP * 0.6) putF('trash', s1 - 3.6, 0.6, R2() * TAU, 0.33, 1.1);
          if ((dt || zone === 'northbeach' || market) && R2() < 0.5) putF(R2() < 0.5 ? 'news' : 'news2', R2() < 0.5 ? s0 + 6.5 : s1 - 6.5, Math.min(sw - 0.6, 0.95), Y + Math.PI, 0.45, 1.1, { hx: 0.7, hz: 0.25 });
          if (com && sw >= 2.5 && R2() < 0.45) putF('bike', s0 + 10 + R2() * Math.max(1, L - 20), 0.9, Y + Math.PI / 2, 0.5, 1, { hx: 0.55, hz: 0.4 });
          if ((dt || market) && sw >= 3 && R2() < (market ? 0.95 : 0.35)) for (let s = s0 + 8 + R2() * 6; s < s1 - 8; s += market ? 24 : 38) putF('planter', s, market ? 2.4 : 1.0, Y, 0.6, 1.2, { breakable: false, hx: 0.55, hz: 0.55 });
          if ((market || (com && sw >= 3.2)) && R2() < (market ? 0.8 : 0.3)) for (let s = s0 + 12 + R2() * 10; s < s1 - 10; s += 30 + R2() * 20) {
            if (putF('bench', s, Math.min(sw - 0.8, 2.2), yawS(s), 0.9, 0.9, { hx: 0.9, hz: 0.3 })) { /* seat registered by place() */ }
          }
          if ((dt || market) && R2() < 0.35) for (const d of [1.2, 2.2]) putF('bollard', s0 + d, 0.35, 0, 0.11, 0.95);
          if (R2() < (com ? 0.18 : 0.08)) putF('mailbox', s0 + 4.5, 0.7, Y, 0.3, 1.5);
          if (!com && parkOK && R2() < 0.45) putF('psign', s0 + 12 + R2() * Math.max(1, L - 24), 0.3, Y, 0.1, 2.6);
        }
        // parked cars along this curb
        if (parkOK && (e.parkSides === 2 || side === 1) && !market) {
          const dens = dt ? 0.8 : zone === 'industrial' ? 0.55 : zone === 'avenues' ? 0.7 : zone === 'park' ? 0.4 : 0.78;
          const residential = !com && !dt;
          let s = s0 + 6.5 + R2() * 1.5;
          const dirSign = e.oneway ? 1 : side;
          while (s < s1 - 6.5) {
            let id = pickW(CAR_MODELS, R2());
            if (id === 'taxi' && !com) id = 'sedan';
            if (!carSets[id]) { s += 5; continue; }
            const sp = carSpecs[id], len = sp.length, wid = sp.width, sa = s, sb = s + len;
            if (sb > s1 - 6.5) break;
            let bad = false; for (const [a, b] of blocked) if (sb > a && sa < b) bad = true;
            if (!bad && R2() < dens) {
              const sc = (sa + sb) / 2;
              frame(e, sc, f);
              const lat = side * (e.width / 2 - 0.28 - wid / 2), x = f.x + f.rx * lat, z = f.z + f.rz * lat;
              const hx = f.dx * dirSign, hz = f.dz * dirSign, rx = -hz, rz = hx, fl = len * 0.38, wl = wid * 0.4;
              if (terrain.surfaceRaw(x, z) === 0) { s = sb + 1; continue; }
              const hF = H(x + hx * fl, z + hz * fl), hB = H(x - hx * fl, z - hz * fl), hR = H(x + rx * wl, z + rz * wl), hL = H(x - rx * wl, z - rz * wl);
              const y = Math.max((hF + hB) / 2, (hR + hL) / 2) + 0.06;
              _f.set(hx * 2 * fl, hF - hB, hz * 2 * fl).normalize(); _r.set(rx * 2 * wl, hR - hL, rz * 2 * wl).normalize();
              _u.crossVectors(_r, _f).normalize(); _r.crossVectors(_f, _u).normalize(); _b.copy(_f).negate();
              _mx.makeBasis(_r, _u, _b); _mx.setPosition(x, y, z);
              const paint = id === 'taxi' ? 0xf2c230 : pickW(CAR_PAINT, R2());
              const col = paintCol(paint);
              const setIndex = put(carSets[id], _mx.elements, null, col);
              const pid = 'pk2:' + key + ':' + h.parked.length, yaw = yawFront(hx, hz);
              const collider = { x, z, hx: wid / 2, hz: len / 2, yaw, yMin: y - 0.2, yMax: y + sp.height, kind: 'parked', breakable: false, id: pid };
              h.cols.push(collider);
              h.parked.push({ id: pid, model: id, paint, x, y, z, yaw, col, collider, set: id, key, setIndex, hiIndex: -1, hidden: false });
            }
            s = sb + 0.8 + R2() * 1.6 + (residential && R2() < 0.18 ? 3.2 : 0);
          }
        }
      }
      // trolley spans + contact wires
      if (trolley) {
        for (const P of trolleyPoles) {
          const o = trolleyPoles.find(q => q.side !== P.side && Math.abs(q.s - P.s) < 6);
          if (o && P.side > 0) wires.span([P.x, P.y + 7.2, P.z], [o.x, o.y + 7.2, o.z], 0.28, 10);
        }
        const dirs = e.oneway ? [1] : [1, -1];
        for (const d of dirs) {
          const cl = e.oneway ? e.width / 2 - (e.parkSides ? e.parkW : 0) - e.laneW / 2 : laneLat(e, e.lanes - 1, d);
          for (const w of [-0.3, 0.3]) {
            const pts = [];
            for (let s = s0 - 6; s <= s1 + 6; s += 8) { frame(e, Math.max(0, Math.min(e.len, s)), f); const lat = (e.oneway ? cl : cl * d) + w, x = f.x + f.rx * lat, z = f.z + f.rz * lat; pts.push([x, H(x, z) + 5.75, z]); }
            wires.line(pts);
          }
        }
      }
    }
    h.phase = 'final';
    // streetcar / light-rail contact wire over the rails
    for (const [a, b] of railsByTile.get(key) || []) {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / 8)), pts = [];
      for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n; pts.push([x, H(x, z) + 5.8, z]); }
      wires.line(pts);
    }
    // flush the batch into the shared sets
    for (const set of h.sets) { set.end(); if (yieldNow()) yield; }
    // near LOD of parked cars (when already built)
    addHiChunk(h);
    if (yieldNow()) yield;
    // wires + lamp pools
    for (const m of wires.build(wireMat)) { root.add(m); h.meshes.push(m); }
    // trails through parks / forest / scrub / dunes
    if (pathMat) {
      const P = [], C = [], UV = [], I = [];
      for (const sg of pathsByTile.get(key) || []) {
        const [x0, z0, x1, z1, w] = sg, hw = Math.max(0.6, w - 0.8) * 0.5 + 0.35, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
        if (L < 0.5) continue;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, sc = terrain.surfaceRaw(mx, mz);
        if (sc !== 3 && sc !== 4 && sc !== 5 && sc !== 7 && sc !== 8) continue;
        if (roadClear(mx, mz) < hw + 0.3 || underDeck(mx, mz)) continue;
        const ux = dx / L, uz = dz / L, rx = -uz, rz = ux, ext = hw * 0.7, n = Math.max(1, Math.ceil((L + 2 * ext) / 2));
        const tint = sc === 7 ? [1.0, 0.9, 0.78] : sc === 4 ? [1.7, 1.55, 1.3] : [1.5, 1.32, 1.08];
        const base = P.length / 3;
        for (let i = 0; i <= n; i++) {
          const t = -ext + (L + 2 * ext) * i / n, cx = x0 + ux * t, cz = z0 + uz * t;
          for (let k = -1; k <= 1; k++) {
            const x = cx + rx * k * hw, z = cz + rz * k * hw;
            P.push(x, H(x, z) + 0.06, z); UV.push(x * 0.45, z * 0.45);
            const e = k === 0 ? 1 : 0.5, j = 0.85 + 0.3 * hash2(x * 1.3, z * 1.3, 77);
            C.push(tint[0] * j * e + (1 - e) * 0.5, tint[1] * j * e + (1 - e) * 0.58, tint[2] * j * e + (1 - e) * 0.3);
          }
        }
        for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) { const a = base + i * 3 + k; I.push(a, a + 1, a + 4, a, a + 4, a + 3); }
      }
      if (I.length) {
        // wind the ribbons upward (normals must face the sky)
        const a = I[0] * 3, b = I[1] * 3, c = I[2] * 3;
        const cy = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]);
        if (cy < 0) for (let q = 0; q < I.length; q += 3) { const t = I[q + 1]; I[q + 1] = I[q + 2]; I[q + 2] = t; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
        g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
        g.computeVertexNormals(); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, pathMat); m.name = 'walk-path'; m.receiveShadow = true; m.matrixAutoUpdate = false;
        pathRoot.add(m); h.meshes.push(m);
      }
    }
    if (h.lamps.length) {
      const pos = [], uv = [], col = [], idx = [], N = 3;
      for (const Lp of h.lamps) {
        const base = pos.length / 3, gy = H(Lp.x, Lp.z), I = Math.min(1, 7.5 / (Lp.y - gy + 1)) * 0.85, r = Lp.r;
        for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
          const u = i / N, v = j / N, x = Lp.x + (u - 0.5) * 2 * r, z = Lp.z + (v - 0.5) * 2 * r;
          pos.push(x, H(x, z) + 0.17, z); uv.push(u, v); col.push(Lp.col[0] * I, Lp.col[1] * I, Lp.col[2] * I);
        }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = base + j * (N + 1) + i; idx.push(a, a + N + 1, a + N + 2, a, a + N + 2, a + 1); }
        Lp.pool = { start: base, count: (N + 1) * (N + 1) };
      }
      const gm = new THREE.BufferGeometry();
      gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gm.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      gm.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      gm.computeBoundingSphere();
      const pm = new THREE.Mesh(gm, poolMat); pm.name = 'props2:pools'; pm.renderOrder = 1; pm.matrixAutoUpdate = false; pm.visible = false;
      root.add(pm); h.meshes.push(pm); h.pool = pm;
      for (const Lp of h.lamps) Lp.mesh = pm;
    }
    for (let i = 0; i < h.cols.length; i++) { colliders.add(h.cols[i]); if ((i & 255) === 255 && yieldNow()) yield; }
    if (keepOut.active) applyKeep(h);
    // a race corridor (festival clearCorridor) also covers parked cars that stream in after the start
    for (const p of h.parked) { parked.set(p.id, p); if (parkedAPI.blocked && !p.hidden && parkedAPI.blocked(p.x, p.z) && parkedAPI.hide(p.id)) parkedAPI.onBlocked?.(p.id); }
    handles.set(key, h);
    rebuildLists();
    return h;
  }
  // keep-out corridors (race lines): hide trees / props inside one with their colliders; show them again once it is gone
  function applyKeep(h) {
    const on = keepOut.active;
    for (const k of h.keep) {
      const hit = on && keepOut.hit(k.x, k.z, k.r);
      if (hit === k.hid) continue;
      if (hit && (k.col.broken || k.col.removed)) continue;             // knocked over / already gone
      k.hid = hit;
      for (let i = 0; i < k.inst.length; i += 2) { if (hit) k.inst[i].hide(h.key, k.inst[i + 1]); else k.inst[i].show(h.key, k.inst[i + 1]); }
      if (hit) { try { colliders.remove(k.col); } catch { /* */ } k.col.removed = true; }
      else { colliders.add(k.col); k.col.removed = false; }
    }
  }
  let keepVer = keepOut.version;
  function dropTile(h) {
    if (!h) return;
    for (const s of h.sets) s.drop(h.key);
    for (const id in carHi) carHi[id]?.drop(h.key);
    for (const c of h.cols) if (!c.removed && c._li !== undefined) colliders.remove(c);
    for (const m of h.meshes) { m.parent?.remove(m); m.geometry.dispose(); }
    for (const p of h.parked) parked.delete(p.id);
    handles.delete(h.key);
    rebuildLists();
  }
  function rebuildLists() {
    lampsAll = []; seatsAll = [];
    for (const h of handles.values()) { for (const L of h.lamps) lampsAll.push(L); for (const c of h.seats) seatsAll.push(c); }
    seatVersion++;
  }

  // lane centre lateral offset (right of the travel direction dir) for lane l of edge e
  function laneLat(e, l, dir) {
    if (e.oneway) return (l - (e.lanes - 1) / 2) * e.laneW * dir;
    return ((e.median || 0.15) + (l + 0.5) * e.laneW);
  }

  // ---------------------------------------------------------------- parked-car near LOD (the real model, built lazily)
  function buildCarHi(id) {
    const car = buildCarModel(id, { paint: 0xffffff });
    car.root.updateMatrixWorld(true);
    const p2 = new THREE.Color(getModelSpec(id).defaultPaint2 ?? 0xf0f0f0);
    const parts = []; let paintN = 0;
    car.root.traverse(o => {
      if (!o.isMesh) return;
      const src = o.geometry, n = src.attributes.position.count, mn = o.material.name;
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', src.attributes.position.clone()); gg.setAttribute('normal', src.attributes.normal.clone());
      let col;
      if (src.attributes.color && mn !== 'car-paint') { const a = src.attributes.color; col = new THREE.Float32BufferAttribute(n * 3, 3); for (let i = 0; i < n; i++) col.setXYZ(i, a.getX(i), a.getY(i), a.getZ(i)); }
      else {
        let c = [0.62, 0.62, 0.62];
        if (mn === 'car-paint') c = paintN++ === 0 ? [1, 1, 1] : [p2.r * 0.96, p2.g * 0.96, p2.b * 0.96];
        else if (mn === 'car-glass') c = [0.016, 0.02, 0.025];
        const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set(c, i * 3); col = new THREE.BufferAttribute(arr, 3);
      }
      gg.setAttribute('color', col);
      if (src.index) gg.setIndex(src.index.clone());
      gg.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0 && gg.index) { const I = gg.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
      parts.push(gg);
    });
    car.dispose();
    const merged = mergeGeometries(parts, false); merged.computeBoundingSphere();
    return merged;
  }
  const _hm2 = new THREE.Matrix4();
  function addHiChunk(h, only = null) {
    for (const id in carHi) {
      if (only && id !== only) continue;
      const set = carHi[id], list = h.parked.filter(p => p.set === id);
      if (!list.length) continue;
      set.begin(h.key);
      for (const p of list) { carSets[p.set].matrixAt(h.key, p.setIndex, _hm2); p.hiIndex = set.add(_hm2.elements, null, p.col); }
      set.end();
      for (const p of list) if (p.hidden) set.hide(h.key, p.hiIndex);
    }
  }
  const pendingHi = CAR_MODELS.map(([id]) => id).filter(id => carSets[id]);
  function buildNextHi() {
    const id = pendingHi.shift(); if (!id) return;
    try {
      const set = new StreamSet('parkedHi:' + id, buildCarHi(id), carMat, { maxDist: HI_DIST, color: true, castShadow: true, height: 2, always: HI_DIST, cell: 32 });
      applyFade(set, HI_FADE);
      set.finalize(root);
      carHi[id] = set; allSets.push(set); upgradeParkedSet(set, id, 1);
      for (const h of handles.values()) addHiChunk(h, id);
      // proxy <-> model: both drawn over the last HI_FADE m with complementary dithers (was a hard swap at 42 m)
      const px = carSets[id], pb = px.dfade?.value;
      px.minDist = HI_DIST - HI_FADE; px.dirty = true;
      if (pb) { pb.z = HI_DIST - HI_FADE; pb.w = HI_FADE; }
    } catch (err) { console.warn('[props2] parked near LOD failed', id, err); }
  }

  // build the near LODs now, inside the loading screen (each real car model is tens of ms: a hitch in game)
  { const tc = performance.now(); while (pendingHi.length) buildNextHi(); stats.hiMs = Math.round(performance.now() - tc); }

  // ---------------------------------------------------------------- providers
  stream.register({
    name: 'props', range: 620, priority: 2,
    load(tile) { return startTile(tile); },
    unload(h) { stopTile(h); },
  });
  stream.register({
    name: 'trees-far', range: 1900, priority: 3,
    load(tile) {
      const h = { key: tile.key, far: true, sets: new Set(), gen: null, done: false, work: 0 };
      h.gen = farGen(tile, h);
      if (stream.budgetMs === Infinity) runGen(h, Infinity); else queue.push(h);
      return h;
    },
    unload(h) {
      if (!h.done) { const i = queue.indexOf(h); if (i >= 0) queue.splice(i, 1); h.gen?.return(); h.gen = null; }
      else treeFar.drop(h.key);
      if (!handles.has(h.key)) treeCache.delete(h.key);
    },
  });

  function* farGen(tile, h) {
    h.phase = 'trees'; const T = yield* treesGen(tile); h.phase = 'farput';
    if (!T.trees.length) return;
    treeFar.begin(tile.key);
    for (const t of T.trees) {
      const S = TR.SPECIES[t.sp], Bn = TR.BANDS[S.cls], im = S.meta; if (!im) continue;
      treeFar.add(yawM(t.x, t.y, t.z, t.yaw, t.s, t.s * t.sy, t.s), { aImp: [im.slot, im.R, im.cy, Math.min(Bn.far, WOODS_IN[1])], aFade: Bn.l2 }, t.tint);
    }
    treeFar.end();
  }

  stream.register({
    name: 'woods-far', range: 3600, priority: 4,
    load(tile) {
      const h = { key: tile.key, far: true, sets: new Set(), gen: null, done: false, work: 0 };
      h.gen = woodsGen(tile, h);
      if (stream.budgetMs === Infinity) runGen(h, Infinity); else wqueue.push(h);
      return h;
    },
    unload(h) {
      if (!h.done) { const i = wqueue.indexOf(h); if (i >= 0) wqueue.splice(i, 1); h.gen?.return(); h.gen = null; }
      else treeWoods.drop(h.key);
    },
  });
  // forest + big-park groves on a 16 m grid (larger trees: ~4k impostors, cheap re-uploads while driving), no street trees; fades in where the per-tile far field fades out
  function* woodsGen(tile, h) {
    h.phase = 'woods';
    const G = 16, out = [];
    for (let gz = tile.z0 + G / 2; gz < tile.z1; gz += G) {
      if (yieldNow()) yield;
      for (let gx = tile.x0 + G / 2; gx < tile.x1; gx += G) {
        const surf = terrain.surfaceRaw(gx, gz);
        if (surf !== 7 && surf !== 3) continue;
        const n = fbm2(gx, gz, 9);
        let p;
        if (surf === 7) p = 0.85 * (0.4 + 1.1 * n);
        else { if (zoneAtV2(gx, gz) !== 'park') continue; p = 0.65 * ss(0.56, 0.66, n); }
        if (hash2(gx, gz, 3) > p) continue;
        const x = gx + (hash2(gx, gz, 5) - 0.5) * G * 0.9, z = gz + (hash2(gx, gz, 6) - 0.5) * G * 0.9;
        if (terrain.surfaceRaw(x, z) !== surf || H(x, z) < 0.5 || roadClear(x, z) < 3) continue;
        const id = pickW(woodsAt(x, z, vnoise(x, z, 70, 29)), hash2(gx, gz, 8)), S = TR.SPECIES[SP[id]], im = S?.meta;
        if (!im) continue;
        const [a, b] = STREET_SCALE[id] || [0.8, 1.05], sc = (a + hash2(gx, gz, 12) * (b - a)) * 1.25;
        const yaw = id === 'cypress3' ? -0.35 : hash2(gx, gz, 14) * TAU, tn = 0.88 + hash2(gx, gz, 15) * 0.22;
        out.push([x, H(x, z) - 0.15, z, yaw, sc, im, TR.BANDS[S.cls].far, tn]);
      }
    }
    h.phase = 'woodsput';
    if (!out.length) return;
    treeWoods.begin(tile.key);
    for (const [x, y, z, yaw, sc, im, far, tn] of out) treeWoods.add(yawM(x, y, z, yaw, sc, sc, sc), { aImp: [im.slot, im.R, im.cy, far], aFade: WOODS_IN }, [tn, tn, tn * 0.97]);
    treeWoods.end();
  }

  // ---------------------------------------------------------------- per frame
  let sun = null;
  scene.traverse(o => { if (!sun && o.isDirectionalLight) sun = o; });
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4();
  const lastCam = new THREE.Vector3(1e9, 0, 0), lastQ = new THREE.Quaternion(), _sd = new THREE.Vector3();
  let clock = 0, sigT = 0, lastFocusX = 0, lastFocusZ = 0, frameN = 0;
  const perf = { ms: 0, avg: 0 };
  function updateSignals(time) {
    for (const h of handles.values()) for (const g2 of h.heads) {
      const ph = signalFor(g2.node, g2.hx, g2.hz, time), st = ph === 'red' ? 0 : ph === 'yellow' ? 1 : 2;
      for (const i of g2.idx) g2.set.setAttr(h.key, i, 'aState', st);
    }
  }
  // two real lights that follow the nearest street lamps at night (the pools only tint what is under them): wide
  // downward spots with a small shadow map each (cars, people, poles, trees cast night shadows). The shadow maps
  // re-render alternately at ~30 Hz (one 512^2 pass per frame); lights stay in the scene all night (no recompiles).
  const plights = [];
  const lampShadows = typeof window !== 'undefined' && /[?&]lampshadows=1/.test(location.search);   // opt-in: shadow refreshes shimmered while driving
  for (let i = 0; i < 2; i++) {
    const l = new THREE.SpotLight(0xffe2b8, 0, 26, 1.48, 1, 2);   // near-hemispherical, fully soft edge (no visible cone ring)
    l.castShadow = lampShadows; l.name = 'props2:lamplight';
    l.shadow.mapSize.set(512, 512); l.shadow.camera.near = 0.4; l.shadow.camera.far = 16; l.shadow.bias = -0.0006; l.shadow.normalBias = 0.04;
    l.shadow.focus = 0.72; l.shadow.autoUpdate = false; l.visible = false;
    root.add(l); root.add(l.target);
    plights.push({ light: l, lamp: null, k: 0 });
  }
  try { buildLanternStringsV2({ graph, heightAt: H, group: root, night: U.night }); } catch (err) { console.warn('[props2] lantern strings', err); }
  let lightT = 0, shadowFlip = 0, lastFx = null, lastFz = null, spd = 0, still = 1;
  function updateLights(dt, focus, nightV) {
    lightT -= dt;
    // real lamp lights only when (nearly) stopped or on foot: while driving they jumped lamp to lamp every ~2 s and,
    // through bloom, strobed. The additive pools carry the street lighting while moving.
    if (focus && dt > 0) { if (lastFx !== null) spd += (Math.hypot(focus.x - lastFx, focus.z - lastFz) / dt - spd) * Math.min(1, dt * 2); lastFx = focus.x; lastFz = focus.z; }
    still += ((spd < 4 ? 1 : 0) - still) * Math.min(1, dt * 0.8);
    if (lightT <= 0 && focus && nightV > 0.05) {
      lightT = 0.25;
      let a = null, b = null, da = 45 * 45, db = 45 * 45;
      for (const L of lampsAll) { if (L.broken) continue; const d = (L.x - focus.x) ** 2 + (L.z - focus.z) ** 2; if (d < da) { db = da; b = a; da = d; a = L; } else if (d < db) { db = d; b = L; } }
      const want = [a, b];
      for (const pl of plights) if (pl.lamp && !want.includes(pl.lamp)) pl.lamp = pl.k > 0.03 ? pl.lamp : null, pl.drop = true;
      for (const L of want) {
        if (!L || plights.some(p => p.lamp === L)) continue;
        const pl = plights.find(p => !p.lamp || (p.drop && p.k <= 0.03)); if (!pl) continue;
        pl.lamp = L; pl.drop = false; pl.light.position.set(L.x, L.y - 1.3, L.z); pl.light.color.setRGB(L.col[0], L.col[1], L.col[2]);
        pl.light.target.position.set(L.x, L.y - 12, L.z); pl.light.target.updateMatrixWorld(); pl.light.shadow.needsUpdate = true;
      }
      for (const pl of plights) if (pl.lamp && want.includes(pl.lamp)) pl.drop = false;
    }
    for (const pl of plights) {
      const target = pl.lamp && !pl.drop && nightV > 0.05 && !pl.lamp.broken ? 1 : 0;
      pl.k += (target - pl.k) * Math.min(1, dt * 1.2);   // slow fades, never pops
      pl.light.intensity = pl.k * nightV * 42 * still; pl.light.visible = nightV > 0.05;
    }
    if (nightV > 0.05) { const pl = plights[(shadowFlip++) & 1]; if (pl.light.intensity > 0.5) pl.light.shadow.needsUpdate = true; }
  }
  function update(dt, env = {}) {
    const tu = performance.now();
    clock += dt; frameN++;
    if (keepVer !== keepOut.version) { keepVer = keepOut.version; for (const h of handles.values()) applyKeep(h); }
    if (queue.length) { const tq = performance.now(); while (queue.length && performance.now() - tq < 2.5) if (runGen(queue[0], 2.5 - (performance.now() - tq))) queue.shift(); }
    else if (wqueue.length) { const tq = performance.now(); while (wqueue.length && performance.now() - tq < 0.7) if (runGen(wqueue[0], 0.7 - (performance.now() - tq))) wqueue.shift(); }
    U.time.value = clock;
    const nightV = typeof env.night === 'number' ? env.night : (night?.value ?? 0);
    U.night.value = nightV;
    const time = typeof env.time === 'number' ? env.time : clock;
    sigT -= dt; if (sigT <= 0) { sigT = 0.2; updateSignals(time); }
    const cam = env.camera;
    if (cam) {
      cam.updateMatrixWorld();
      projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
      const moved = cam.position.distanceToSquared(lastCam) > 0.01 || 1 - Math.abs(cam.quaternion.dot(lastQ)) > 1e-6;
      if (moved) { lastCam.copy(cam.position); lastQ.copy(cam.quaternion); }
      for (let i = 0; i < allSets.length; i++) { const s = allSets[i]; if (moved || s.dirty) s.cull(cam.position.x, cam.position.z, frustum); }
      if (sun) { _sd.subVectors(sun.position, sun.target.position).normalize().transformDirection(cam.matrixWorldInverse).negate(); U.sun.value.set(_sd.x, _sd.y, _sd.z, Math.max(0, 1 - nightV * 1.2)); }
      TR.updateTrees(cam);
      for (const h of handles.values()) if (h.pool) { const dx = h.tile.cx - cam.position.x, dz = h.tile.cz - cam.position.z; h.pool.visible = nightV > 0.03 && dx * dx + dz * dz < 1000 * 1000; }
    }
    poolMat.color.setScalar(Math.min(1, nightV * 1.15) * 2.6 * (1 - 0.6 * HB_WET.x));
    const focus = env.focus || cam?.position;
    if (focus) { lastFocusX = focus.x; lastFocusZ = focus.z; }
    updateLights(dt, focus, nightV);
    fx.update(dt);
    perf.ms = performance.now() - tu; perf.avg += (perf.ms - perf.avg) * 0.05;
  }

  // ---------------------------------------------------------------- breakables
  const _hm = new THREE.Matrix4();
  const SHARD_COL = { cobra: [0.6, 0.62, 0.64], cobraTall: [0.6, 0.62, 0.64], ornate: [0.2, 0.25, 0.2], post: [0.22, 0.28, 0.24], hydrant: [0.92, 0.92, 0.9],
    meter: [0.35, 0.37, 0.4], pay: [0.2, 0.22, 0.25], trash: [0.12, 0.25, 0.16], bench: [0.45, 0.3, 0.2], news: [0.2, 0.35, 0.7], news2: [0.7, 0.2, 0.2],
    bike: [0.6, 0.62, 0.64], bollard: [0.1, 0.1, 0.1], mailbox: [0.1, 0.25, 0.6], psign: [0.8, 0.8, 0.8], stop: [0.8, 0.1, 0.1], busPole: [0.6, 0.62, 0.64] };
  const TALL = { cobra: 9.2, cobraTall: 11.5, ornate: 8.4, post: 6.8, stop: 2.8, psign: 2.6, busPole: 3.1 };
  function onHit(c, speed = 10, dir = null) {
    if (!c || !c.breakable || c.broken || speed < 6 || !c.propRef) return false;
    c.broken = true;
    const ref = c.propRef, set = sets[ref.set];
    let dx, dz;
    if (dir) { dx = dir.x; dz = dir.z; } else { dx = c.x - lastFocusX; dz = c.z - lastFocusZ; }
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    set.matrixAt(ref.key, ref.index, _hm);
    set.hide(ref.key, ref.index);
    try { colliders.remove(c); c.removed = true; } catch { /* not registered */ }
    const col = SHARD_COL[ref.set] || [0.5, 0.5, 0.5];
    fx.knock(set, _hm, TALL[ref.set] ? { dirX: dx, dirZ: dz, speed, mode: 'tip', height: TALL[ref.set] } : { dirX: dx, dirZ: dz, speed, mode: 'tumble' });
    fx.spawnShards(c.x, ref.y, c.z, dx, dz, speed, col, ref.set === 'hydrant' ? 5 : 8);
    if (ref.set === 'hydrant') fx.geyser(c.x, ref.y, c.z, 9);
    if (ref.lamps) for (const L of ref.lamps) {
      L.broken = true;
      const m = L.mesh; if (!m || !L.pool) continue;
      const ca = m.geometry.attributes.color; for (let i = 0; i < L.pool.count; i++) ca.setXYZ(L.pool.start + i, 0, 0, 0); ca.needsUpdate = true;
    }
    return true;
  }
  const parkedAPI = {
    blocked: null, onBlocked: null,   // (x, z) -> true: hide on load (festival race corridors)
    get list() { return [...parked.values()]; },
    get(id) { return parked.get(id) || null; },
    hide(id) {
      const p = parked.get(id); if (!p || p.hidden) return false; p.hidden = true;
      carSets[p.set].hide(p.key, p.setIndex); if (p.hiIndex >= 0 && carHi[p.set]) carHi[p.set].hide(p.key, p.hiIndex);
      try { colliders.remove(p.collider); p.collider.removed = true; } catch { /* */ }
      return true;
    },
    show(id) {
      const p = parked.get(id); if (!p || !p.hidden) return false; p.hidden = false;
      carSets[p.set].show(p.key, p.setIndex); if (p.hiIndex >= 0 && carHi[p.set]) carHi[p.set].show(p.key, p.hiIndex);
      colliders.add(p.collider); p.collider.removed = false; return true;
    },
  };

  const api = {
    v2: true, update, onHit, parked: parkedAPI, sets, fx, perf, _debug: { stats, buildTile, dropTile, handles, treesFor, treeCache, allSets, roadClear, span },
    get lamps() { return lampsAll; },
    get seats() { return seatsAll; },
    get seatVersion() { return seatVersion; },
    get stats() {
      let trees = 0, parkedN = 0, lamps = 0, cols = 0;
      for (const h of handles.values()) { trees += h.nTrees; parkedN += h.parked.length; lamps += h.lamps.length; cols += h.cols.length; }
      const draws = allSets.filter(s => s.mesh?.visible).length;
      const visible = Object.fromEntries(allSets.filter(s => s.visible).map(s => [s.name, s.visible]));
      return { ...stats, queued: queue.length, loadedTiles: handles.size, trees, parked: parkedN, lamps, colliders: cols, farTrees: treeFar.total, draws, avgBuildMs: +(stats.buildMs / Math.max(1, stats.tiles)).toFixed(2), updateMs: +perf.avg.toFixed(3), visible };
    },
  };
  console.log(`[props2] street dressing registered in ${(performance.now() - t0).toFixed(0)} ms`);
  return api;
}
