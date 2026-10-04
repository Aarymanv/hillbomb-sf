// Buildings v2: the real 1:1 OSM city (178k footprints) drawn with the facade system (material.js procedural facades,
// interior mapping, night windows, one params texel block per building from v2plan.js). Tiers:
//   FAR   whole city, merged per 2 km chunk: simplified footprints (oriented box for small houses), flat or pitched roofs.
//         A building is hidden here (hide texture R) while its MID tile is shown.
//   MID   'bld-mid' provider (512 m tiles, 1.4 km): real footprints, per-wall window grids, party walls without windows
//         (1 m raster probe against neighbours, windows above a lower neighbour), roof shapes, rooftop clutter.
//   NEAR  'bld-near' provider (~260 m): 3D street-facade detail on street-facing walls (cornices + brackets, bay windows,
//         sills / hoods, awnings, stoops, fire escapes, balconies).
//   COL   'bld-col' provider (600 m): oriented boxes per footprint (sliced along the long axis for L / U shapes).
// Geometry is built by a pool of Web Workers (v2worker.js, transferable buffers back); the tiles around the spawn are
// built on the main thread during the loading fill. Main-thread fallback when workers are unavailable.
// API: registerBuildingsV2(stream, { data, terrain, scene, root?, night, renderer? })
//   -> { group, count, plan, hideBuilding(i), showBuilding(i), isHidden(i), find(x, z, r), buildingAt(x, z), info(i), stats, update() }
import * as THREE from 'three';
import { PERF } from '../../render/perfflags.js';
import { createFacadeTextures } from './texgen.js';
import { makeFacadeMaterials, patchKitMaterial, lampUniforms, HW, NOV4 } from './material.js';
import { leafify, LEAF_DECODE } from './kitleaf.js';
import { leafAtlas } from '../props/trees.js';
import { makeBeacons } from './beacons.js';
import { S } from './plan.js';
import { planCity } from './v2plan.js';
import { Raster } from './v2geom.js';
import { createDressLayer } from './v2dress.js';
import { setKit, setKit3 } from './v2detail.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { packedUrl, loadPacked, capImage } from '../texpack.js';

// (perf 9/30) building tile geometry is never read on the CPU after it is built (bounds are precomputed, colliders come
// from the plan): drop each attribute's JS copy once it is on the GPU. ~0.9-1.3 GB of typed arrays (14 M kit vertices
// near the camera) stayed in the JS heap and drove the 1-3 GB heap swings / long GC pauses. ?keepgeo = old behaviour.
const KEEP_GEO = typeof location !== 'undefined' && /[?&](keepgeo|legacy)/.test(location.search);
function dropArray() { this.array = null; }
function freeAfterUpload(g) {
  if (KEEP_GEO) return;
  for (const k in g.attributes) g.attributes[k].onUpload(dropArray);
  g.index?.onUpload(dropArray);
}
import { ll, toLatLon } from '../latlon.js';
import { buildLanternStringsV2 } from '../props/lanterns2.js';
import { wrapB, B_KEYS, P_KEYS, buildFarChunk, buildMidTile, buildNearTile, buildDress, packBuf, geometryFrom } from './v2build.js';

const CHUNK = 2048;
const NEAR_R = 450;           // NEAR (3D facade detail) radius
const KIT_R = 320;            // Blender kit pieces (merged per 128 m cell) radius
const V3_R = 190;             // v3 real street facades (v3front.js + facade kit v3) radius
const DET_R = NOV4 ? 0 : 125;            // (v4) v3 street-front clutter cells (plants, bins, bikes, house numbers)
const SYNC_R = 520;           // loading fill: MID tiles closer than this are built on the main thread
const NSL = 7;                // NEAR_SHADOW_LAYER (render/environment.js)

export function registerBuildingsV2(stream, { data, terrain, scene, root = null, night, renderer: rOpt = null } = {}) {
  const T = data.buildings.tile;
  const t0 = performance.now();
  const P = planCity(data, terrain);
  // BD = footprint arrays incl. the rowhouse lot pieces appended after the N0 OSM buildings (v2lots.js)
  const BD = P.bx, N = P.N, N0 = P.N0, LF = P.lotF, LN = P.lotN;
  const B = wrapB(BD);
  const ctx = { B, P, R: new Raster(T) };
  const hideRows = Math.ceil(N / HW) + 1;
  const hideData = new Uint8Array(HW * hideRows * 4);   // R: FAR hidden (MID shown / landmark), G: NEAR kit shown (MID KITLOD parts hidden), B: v3 facade shown
  const hideTex = new THREE.DataTexture(hideData, HW, hideRows, THREE.RGBAFormat, THREE.UnsignedByteType);
  hideTex.minFilter = hideTex.magFilter = THREE.NearestFilter; hideTex.generateMipmaps = false; hideTex.needsUpdate = true;
  const why = new Uint8Array(N);                    // bit0: MID tile shown, bit1: landmark-hidden, bit2: NEAR kit shown, bit3: v3 facade shown
  let hideDirty = false;
  // (v5) G / B are 3-state (material.js HIDE): 0 off, 128 cross-fading (MID stand-ins still drawn, the NEAR version
  // dithers in by distance), 255 the building is wholly inside the fade's inner radius (MID stand-ins collapse)
  const NOFADE = typeof location !== 'undefined' && /[?&]nofade(&|$)/.test(location.search);   // ?nofade = old hard swaps (A/B)
  const fullK = new Uint8Array(N), full3 = new Uint8Array(N);
  const chan = (w, bit, full) => (w & bit) ? (full || NOFADE ? 255 : 128) : 0;
  const setWhy1 = (i, bit, on) => { const w = on ? why[i] | bit : why[i] & ~bit; if (w !== why[i]) { why[i] = w; hideData[i * 4] = w & 3 ? 255 : 0; hideData[i * 4 + 1] = chan(w, 4, fullK[i]); hideData[i * 4 + 2] = chan(w, 8, full3[i]); hideDirty = true; } };
  const setFull = (arr, i, f, ch, bit) => { if (arr[i] === f) return; arr[i] = f; const v = chan(why[i], bit, f); if (hideData[i * 4 + ch] !== v) { hideData[i * 4 + ch] = v; hideDirty = true; } };
  // a split row's MID / landmark state applies to its lot pieces (they carry their own ids)
  const setWhy = (i, bit, on) => { setWhy1(i, bit, on); if (i < N0 && LN[i] && bit !== 4 && bit !== 8) for (let j = LF[i], e = j + LN[i]; j < e; j++) setWhy1(j, bit, on); };
  const textures = createFacadeTextures();
  const time = { value: 0 }, nightU = night || { value: 0 };
  const { mat, depth, matFade, fadeR, fadeVariant } = makeFacadeMaterials({ night: nightU, textures, paramsTex: P.paramsTex, hideTex, time });
  const group = root || new THREE.Group();
  if (!root) { group.name = 'buildings'; scene?.add(group); }
  let renderer = rOpt;
  const grab = (r) => { renderer = r; };
  const farMeshes = [];
  const mkMesh = (geo, name, shadow) => {
    freeAfterUpload(geo);
    const m = new THREE.Mesh(geo, mat);
    m.customDepthMaterial = depth; m.castShadow = shadow; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.name = name;
    if (!renderer) m.onBeforeRender = grab;
    return m;
  };
  const st = { planMs: P.ms, farMs: 0, farTris: 0, farChunks: 0, midTiles: 0, nearTiles: 0, midTris: 0, nearTris: 0, cols: 0, yardCols: 0, yardColsDropped: 0, yardFilterMs: 0,
    workers: 0, inflight: 0, queued: 0, maxWorkerMs: 0, lastWorkerMs: 0, maxMainMs: 0, applyMs: 0, readyMs: 0 };

  // ================================================================ worker pool
  const pool = [];
  const queue = [];                                 // { msg, onDone, h, prio }
  const applyQ = [];                                // [job, result] from the workers, applied in update() within APPLY_MS
  const APPLY_MS = 4;
  function drainApply(ms = APPLY_MS) {
    const t0a = performance.now();
    while (applyQ.length && (performance.now() - t0a < ms)) { const [job, res] = applyQ.shift(); finish(job, res); }
    st.applyQueued = applyQ.length;
  }
  let seq = 1;
  const pending = new Map();                        // id -> job
  try {
    const nw = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    const Bmsg = { X0: BD.X0, Z0: BD.Z0, TC: BD.TC, TR: BD.TR, tile: T }, Pmsg = {};
    for (const k of B_KEYS) Bmsg[k] = BD[k];
    for (const k of P_KEYS) Pmsg[k] = P[k];
    for (let w = 0; w < nw; w++) {
      const wk = new Worker(new URL('./v2worker.js', import.meta.url), { type: 'module' });
      wk.busy = 0;
      // results are applied from update() under a per-frame budget (applyQ), not in the message task: several tiles
      // landing together used to apply back to back (mesh + kit cells + hide masks) in one 100-200 ms task
      wk.onmessage = (e) => { wk.busy--; const job = pending.get(e.data.id); pending.delete(e.data.id); if (job) applyQ.push([job, e.data]); pumpQueue(); };
      wk.onerror = (e) => { console.error('[buildings2] worker error', e.message || e); };
      wk.postMessage({ type: 'init', B: Bmsg, P: Pmsg });
      pool.push(wk);
    }
    st.workers = pool.length;
  } catch (err) { console.warn('[buildings2] no build workers, main-thread fallback', err); pool.length = 0; }

  function submit(msg, onDone, h = null) {
    const job = { msg, onDone, h, prio: 0 };
    if (!pool.length) { queue.push(job); return; }
    queue.push(job); pumpQueue();
  }
  function pumpQueue() {
    if (!queue.length) return;
    const f = stream.focus;
    for (const j of queue) j.prio = j.h ? stream.dist(j.h.tile, f.x, f.z) - (j.h.near ? 200 : 0) - stream.aheadBias(j.h.tile) : -1e9;
    queue.sort((a, b) => a.prio - b.prio);
    for (const wk of pool) {
      while (wk.busy < 2 && queue.length) {
        const job = queue.shift();
        if (job.h?.dead) continue;
        job.id = job.msg.id = seq++; pending.set(job.id, job); wk.busy++;
        wk.postMessage(job.msg);
      }
    }
    st.queued = queue.length; st.inflight = pending.size;
  }
  function finish(job, res) {
    st.lastWorkerMs = res.ms; st.maxWorkerMs = Math.max(st.maxWorkerMs, res.ms);
    st.inflight = pending.size; st.queued = queue.length;     // (pumpQueue returns early on an empty queue: keep these live)
    if (job.h?.dead) return;
    const a0 = performance.now();
    job.onDone(res);
    const ad = performance.now() - a0;
    st.applyMs = Math.max(st.applyMs * 0.98, ad);
    const am = st.applyMax || (st.applyMax = {}); if (ad > (am[job.msg.type] || 0)) am[job.msg.type] = +ad.toFixed(1);
  }
  // main-thread fallback: run one queued job per frame
  function runLocal(job) {
    const m = job.msg, hidden = m.hidden && m.hidden.length ? new Set(m.hidden) : null, s0 = performance.now();
    let res;
    if (m.type === 'far') res = { chunks: m.chunks.map(([key, list]) => [key, packBuf(buildFarChunk(ctx, list))]).filter(([, p]) => p.ni > 0) };
    else if (m.type === 'mid') { const { buf, fronts, ycols } = buildMidTile(ctx, m.tile, hidden); res = { geo: buf.empty ? null : packBuf(buf), fronts, ycols }; }
    else if (m.type === 'near') { const { buf, kit } = buildNearTile(ctx, m.key, m.fronts, hidden, m.tx, m.tz); res = { geo: buf.empty ? null : packBuf(buf), kit: kit ? kit.pack(packBuf) : null, kitOn: !!kit }; }
    else if (m.type === 'dress') res = buildDress(ctx, m.key, hidden, m.tx, m.tz);
    res.ms = performance.now() - s0; st.maxMainMs = Math.max(st.maxMainMs, res.ms);
    finish(job, res);
  }
  const hiddenIn = (tx, tz) => { const [f, c] = B.inTile(tx, tz), out = []; for (let i = f; i < f + c; i++) if (why[i] & 2) { out.push(i); for (let j = LF[i], e = j + LN[i]; j < e; j++) out.push(j); } return out; };

  // ================================================================ FAR (whole city, per 2 km chunk), built by the pool
  const t1 = performance.now();
  {
    const lists = new Map();
    for (let i = 0; i < N; i++) {
      if ((P.area[i] < 12 && BD.h[i] < 4) || (i < N0 && LN[i])) continue;
      const key = Math.floor((P.cx[i] - BD.X0) / CHUNK) * 100 + Math.floor((P.cz[i] - BD.Z0) / CHUNK);
      let l = lists.get(key); if (!l) lists.set(key, l = []); l.push(i);
    }
    // balance: one message per few chunks, largest first
    const all = [...lists].sort((a, b) => b[1].length - a[1].length);
    const per = Math.max(1, Math.ceil(all.length / Math.max(1, pool.length * 4)));
    let farPending = 0;
    for (let k = 0; k < all.length; k += per) {
      const part = all.slice(k, k + per).map(([key, l]) => [key, Int32Array.from(l)]);
      farPending++;
      const job = { type: 'far', chunks: part };
      const done = (res) => {
        for (const [, p] of res.chunks) {
          const m = mkMesh(geometryFrom(p), 'bld-far', false);
          st.farTris += p.ni / 3; group.add(m); farMeshes.push(m);
        }
        st.farChunks = farMeshes.length;
        if (--farPending === 0) { st.farMs = performance.now() - t1; console.log(`[buildings2] far skyline ready: ${(st.farTris / 1e6).toFixed(2)} M tris, ${farMeshes.length} chunks, ${st.farMs.toFixed(0)} ms after register`); }
      };
      if (pool.length) submit(job, done); else runLocal({ msg: job, onDone: done });
    }
  }

  // ================================================================ beacons on towers (> 60 m)
  const bspecs = [];
  for (let i = 0; i < N; i++) {
    if (P.yTop[i] - BD.base[i] < 60 || P.area[i] < 200) continue;
    const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), hx = P.ohx[i] * 0.9, hz = P.ohz[i] * 0.9;
    for (const [lx, lz] of [[hx, hz], [-hx, -hz]]) bspecs.push({ id: i, x: P.ox[i] + c * lx + s * lz, z: P.oz[i] - s * lx + c * lz, c: 1, s: 0, hx: 0, hz: 0, setback: 0, y0: P.yTop[i], beaconsCorner: [[0, 0, 0, 0]] });
  }
  const beacons = makeBeacons(bspecs, time, nightU);
  if (beacons) group.add(beacons);

  // ================================================================ MID tiles
  const midH = new Map(), nearH = new Map();
  let dress = null;
  try { dress = createDressLayer({ group, night: nightU, terrain }); } catch (err) { console.warn('[buildings2] dress', err); }
  // warm bulb festoons over a few district streets (North Beach, 24th St, Castro): the same strings as Chinatown's
  try {
    const R = data.roads, FEST = [
      [{ lat0: 37.7975, lat1: 37.8035, lon0: -122.4105, lon1: -122.4040 }, /^(Grant|Columbus|Green|Vallejo)\b/, 15, 911],
      [{ lat0: 37.7505, lat1: 37.7540, lon0: -122.4200, lon1: -122.4080 }, /^24th\b/, 17, 912],
      [{ lat0: 37.7590, lat1: 37.7640, lon0: -122.4370, lon1: -122.4320 }, /^(Castro|18th)\b/, 16, 913],
      [{ lat0: 37.7480, lat1: 37.7570, lon0: -122.4210, lon1: -122.4165 }, /^Mission\b/, 24, 914],
      [{ lat0: 37.7550, lat1: 37.7660, lon0: -122.4230, lon1: -122.4200 }, /^Valencia\b/, 21, 915],
      [{ lat0: 37.7685, lat1: 37.7725, lon0: -122.4520, lon1: -122.4440 }, /^Haight\b/, 22, 916],
      [{ lat0: 37.7880, lat1: 37.7990, lon0: -122.4240, lon1: -122.4180 }, /^Polk\b/, 22, 917],
    ];
    for (const [box, match, gap, seed] of FEST) {
      const edges = [];
      for (const E of R?.edges || []) {
        const nm = R.names[E[2]] || '', cls = E[3], p0 = E[10], np = E[11];
        if (!match.test(nm) || np < 2 || cls === 0 || cls === 1 || cls === 13 || cls === 14) continue;
        const pts = []; for (let k = 0; k < np; k++) pts.push([R.pts[(p0 + k) * 3], R.pts[(p0 + k) * 3 + 1]]);
        const [la, lo] = toLatLon(pts[0][0], pts[0][1]), [lb, lob] = toLatLon(pts[np - 1][0], pts[np - 1][1]);
        const inB = (a, b) => a > box.lat0 && a < box.lat1 && b > box.lon0 && b < box.lon1;
        if (!inB(la, lo) && !inB(lb, lob)) continue;
        let len = 0; for (let k = 1; k < np; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        edges.push({ pts, width: E[6] || 10, sidewalk: E[7] || 2.5, name: nm, kind: 'street', deck: null, len, a: { radius: 6 }, b: { radius: 6 } });
      }
      if (edges.length) buildLanternStringsV2({ graph: { edges }, heightAt: (x, z) => terrain.heightAt(x, z), group, night: nightU, box, only: 'bulbs', match, gap, seed, name: 'bld-festoons', maxWidth: 26 });
    }
  } catch (err) { console.warn('[buildings2] festoons', err); }
  function setMesh(h, geo, name, shadow, triKey) {
    if (h.mesh) { group.remove(h.mesh); h.mesh.geometry.dispose(); st[triKey] -= h.tris; h.mesh = null; h.tris = 0; }
    if (!geo) return;
    h.mesh = mkMesh(geometryFrom(geo), name, shadow); h.tris = geo.ni / 3; st[triKey] += h.tris;
    group.add(h.mesh);
  }
  function midRequest(h, sync) {
    const t = h.tile;
    const msg = { type: 'mid', tile: { tx: t.tx, tz: t.tz, key: t.key, x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1 }, hidden: hiddenIn(t.tx, t.tz) };
    const done = (res) => {
      setMesh(h, res.geo, 'bld-mid', true, 'midTris');
      h.fronts = res.fronts; h.ready = true;
      setYardCols(h.key, res.ycols);
      const [f, c] = B.inTile(t.tx, t.tz);
      for (let i = f; i < f + c; i++) setWhy(i, 1, true);
      const nh = nearH.get(h.key);
      if (nh && !nh.dead) nearRequest(nh, false);
      if (!st.readyMs && !queue.length && !pending.size) st.readyMs = performance.now() - t0;
    };
    if (sync) runLocal({ msg, onDone: done, h }); else submit(msg, done, h);
  }
  stream.register({
    name: 'bld-mid', range: 1400, priority: 1,
    load(tile) {
      const [, c] = B.inTile(tile.tx, tile.tz);
      if (!c) return null;
      const h = { tile, key: tile.key, ready: false, mesh: null, tris: 0, dead: false, fronts: null };
      midH.set(tile.key, h); st.midTiles++;
      const f = stream.focus, sync = stream.budgetMs === Infinity && stream.dist(tile, f.x, f.z) < SYNC_R;
      midRequest(h, sync);
      return h;
    },
    unload(h) {
      if (!h) return;
      h.dead = true; midH.delete(h.key); st.midTiles--;
      setYardCols(h.key, null);
      setMesh(h, null, '', false, 'midTris');
      const [f, c] = B.inTile(h.tile.tx, h.tile.tz);
      for (let i = f; i < f + c; i++) setWhy(i, 1, false);
    },
    update(dt) {
      time.value += dt;
      if (applyQ.length) drainApply(stream.budgetMs === Infinity ? Infinity : APPLY_MS);
      if (!textures.ready && renderer && textures.step(renderer)) console.log(`[buildings2] facade textures ready after ${textures.genMs.toFixed(0)} ms`);
      if (textures.ready && textures.state === 3 && renderer && textures.photoStep(renderer)) {
        group.traverse(m => { if (m.onBeforeRender === grab) m.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; });
      }
      if (pool.length) pumpQueue();
      else if (queue.length) {                     // fallback: one job per frame, nearest first
        pumpSortLocal(); const job = queue.shift(); if (!job.h?.dead) runLocal(job);
      }
      const c0 = performance.now();              // spread collider removals (StaticColliders.remove is O(list))
      while (colTrash.length && performance.now() - c0 < 1) stream.ctx.colliders.remove(colTrash.pop());
      kitCull();
      if (hideDirty) { hideTex.needsUpdate = true; hideDirty = false; }
    },
  });
  function pumpSortLocal() { const f = stream.focus; for (const j of queue) j.prio = j.h ? stream.dist(j.h.tile, f.x, f.z) - (j.h.near ? 200 : 0) - stream.aheadBias(j.h.tile) : -1e9; queue.sort((a, b) => a.prio - b.prio); }

  // ================================================================ NEAR tiles
  function nearRequest(h, sync) {
    const mh = midH.get(h.key);
    if (!mh || !mh.ready) return;                  // re-requested when the MID tile completes
    const msg = { type: 'near', key: h.key, tx: h.tile.tx, tz: h.tile.tz, fronts: mh.fronts, hidden: hiddenIn(h.tile.tx, h.tile.tz) };
    const done = (res) => {
      setMesh(h, res.geo, 'bld-near', true, 'nearTris');
      // (v5) the NEAR detail tile (sills / hoods / stoops / brackets of the non-v3 buildings) dithers in at the edge of
      // its range instead of appearing as a whole 512 m tile at once
      if (h.mesh && !NOFADE) { h.mesh.material = matFadeN || (matFadeN = fadeVariant(FADE_N[0], FADE_N[1], false)); h.mesh.userData.fadeBand = FADE_N; }
      setKitMesh(h, res.kitOn && kitMat ? res.kit : null);
    };
    if (sync) runLocal({ msg, onDone: done, h }); else submit(msg, done, h);
  }
  // ---------------------------------------------------------------- Blender city kit (NEAR): merged per tile, one draw
  // kit cells (128 m) are shown within KIT_R of the focus; a shown cell hides its buildings' MID stand-ins (hide G)
  let kitMat = null, kitMat3 = null, kitMat3d = null, kitLeafDepth = null;
  // (v5) cross-fade bands (camera distance, m): NEAR versions dither in over [a, b]; their cells switch on beyond b
  // (+ the camera's offset behind the focus), the MID stand-ins collapse once a building is wholly inside a
  const FADE_K = NOFADE ? [1e6, 1e6 + 1] : [290, 312], FADE_3 = NOFADE ? [1e6, 1e6 + 1] : [147, 175], FADE_D = NOFADE ? [1e6, 1e6 + 1] : [98, 118];
  fadeR.value.set(...FADE_3);
  const FADE_N = [NEAR_R - 40, NEAR_R - 12]; let matFadeN = null;
  const kitCells = new Set();
  const NSH = !!globalThis.HB_NEAR_SHADOW;           // nearest shadow cascade on (environment.js, high / ultra)
  // kit cell meshes live in their own sub-group: googletiles.js resets .visible of every direct child of the building
  // root a few times a second (near-block mask), which would undo the per-cell distance culling below
  const kitRoot = new THREE.Group(); kitRoot.name = 'bld-kitroot'; group.add(kitRoot);
  function setKitMesh(h, cells) {
    if (h.kcells) for (const c of h.kcells) {
      for (const m of [...c.meshes, ...c.m3, ...c.md]) { kitRoot.remove(m); m.geometry.dispose(); } st.kitTris -= c.tris; kitCells.delete(c);
      if (c.vis) for (const i of c.ids) setWhy(i, 4, false);
      if (c.vis3) for (const i of c.ids3) setWhy(i, 8, false);
    }
    h.kcells = null;
    if (!cells || !kitMat) return;
    h.kcells = [];
    for (const { cx, cz, ids, ids3, geo, geo3, geo3d, geoF } of cells) {
      const meshes = [], m3 = [], md = []; let tris = 0;
      if (geoF) { const mf = mkMesh(geometryFrom(geoF), 'bld-v3', true); mf.material = matFade; mf.userData.fadeBand = FADE_3; mf.visible = false; if (NSH) mf.layers.enable(NSL); m3.push(mf); tris += geoF.ni / 3; kitRoot.add(mf); }
      for (const [k, km, det] of [[geo, kitMat, false], [geo3, kitMat3, false], [geo3d, kitMat3d || kitMat3, true]]) {
      if (!k || !km) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(k.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(k.nrm, 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(k.uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(k.col, 3, true));
      g.setIndex(new THREE.BufferAttribute(k.idx, 1));
      // bounds from the known 128 m cell + one strided pass over y (computeBoundingSphere = two full passes per cell:
      // a near tile's cells took up to ~120 ms of main thread when applied)
      // (the xz extent too: pieces of a long building reach well past its cell, and a sphere of the cell + 8 m frustum-
      // culled them at some view angles: walls blinking in and out as the camera turned)
      { const P = k.pos; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        if (k.bb) [x0, y0, z0, x1, y1, z1] = k.bb;      // (perf r3) from the worker (v2detail.js pack)
        else for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        if (y0 <= y1) { g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)); g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere()); }
        else g.computeBoundingSphere(); }
      freeAfterUpload(g);
      const m = new THREE.Mesh(g, km); m.name = km === kitMat ? 'bld-kit' : 'bld-kit3'; m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; m.visible = false;
      if (det) { m.name = 'bld-kit3d'; if (kitLeafDepth) m.customDepthMaterial = kitLeafDepth; }
      // (v5) v3 kit pieces + street clutter cast only into the nearest cascade (layer 7, environment.js): no more
      // castShadow switching at 60 m (their shadows fade with the near map's border instead)
      if (NSH && (km === kitMat3 || km === kitMat3d)) m.layers.set(NSL);
      m.userData.fadeBand = det ? FADE_D : km === kitMat ? FADE_K : FADE_3;     // (dev/pop_probe.js: dithered in, not a pop)
      (det ? md : km === kitMat ? meshes : m3).push(m); tris += k.idx.length / 3; kitRoot.add(m);
      }
      const c = { meshes, m3, md, cx, cz, ids, ids3: kitMat3 ? ids3 : [], vis: false, vis3: false, visD: false, tris };
      st.kitTris = (st.kitTris || 0) + c.tris; h.kcells.push(c); kitCells.add(c);
    }
    kitCull(true);
  }
  // Google photogrammetry owner (world2 -> setNearOwner): kit cells outside our near block give way to the photos like
  // the MID tile meshes do (they sit in their own sub-group, so googletiles.js never hid them: kit + photo walls z-fought
  // at 300-320 m)
  let gOwn = null;
  function kitCull(force = false) {
    const f = stream.focus; if (!f) return;
    const gk = gOwn ? gOwn.nearMask * 4 + (gOwn.ready ? 1 : 0) + (stream.tileAt(f.x, f.z)?.key ?? 0) * 4096 : 0;
    if (!force && gk === kitCull.gk && Math.abs(f.x - kitCull.x) + Math.abs(f.z - kitCull.z) < 4) return;
    kitCull.x = f.x; kitCull.z = f.z; kitCull.gk = gk;
    for (const c of kitCells) {
      const own = !gOwn || gOwn.ours(c.cx, c.cz);
      // (12 m hysteresis on every band: circling a block at a band edge swapped the kit / v3 fronts back and forth)
      const dc = own ? Math.hypot(c.cx - f.x, c.cz - f.z) - 91 : 1e9, vis = dc < KIT_R + (c.vis ? 12 : 0), vis3 = dc < V3_R + (c.vis3 ? 12 : 0);
      if (vis3 !== c.vis3) {
        c.vis3 = vis3; for (const m of c.m3) m.visible = vis3;
        for (const i of c.ids3) setWhy(i, 8, vis3);
      }
      if (c.vis3) fullPass(c.ids3, full3, 2, 8, dc, FADE_3[0], f);
      if (c.vis) fullPass(c.ids, fullK, 1, 4, dc, FADE_K[0], f);
      // (v5) v3 walls cast while shown (their MID stand-ins are hidden in the shadow pass too: 140-190 m used to lose the
      // front walls' shadows); kit frames / clutter: near cascade only (layer 7) or, without it, within 60 m
      if (!NSH) for (const m of c.m3) m.castShadow = m.name === 'bld-v3' || dc < 60;
      const visD = DET_R > 0 && dc < DET_R + (c.visD ? 12 : 0);     // (v4) street-front clutter: plants, bins, bikes, house numbers: shorter range
      if (visD !== c.visD) { c.visD = visD; for (const m of c.md) m.visible = visD; }
      if (!NSH) for (const m of c.md) m.castShadow = dc < 60;
      if (vis === c.vis) continue;
      c.vis = vis; for (const m of c.meshes) m.visible = vis;
      for (const i of c.ids) setWhy(i, 4, vis);
    }
  }
  kitCull.x = 1e9; kitCull.z = 1e9;
  // a building is "full" once its whole bbox (+ 10 m: camera behind the focus) is inside the fade's inner radius
  function fullPass(ids, arr, ch, bit, dc, ra, f) {
    if (dc > ra) { for (const i of ids) setFull(arr, i, 0, ch, bit); return; }
    for (const i of ids) {
      const dx = Math.max(Math.abs(P.minX[i] - f.x), Math.abs(P.maxX[i] - f.x)), dz = Math.max(Math.abs(P.minZ[i] - f.z), Math.abs(P.maxZ[i] - f.z));
      setFull(arr, i, Math.hypot(dx, dz) + 10 < ra ? 1 : 0, ch, bit);
    }
  }
  (async () => {
    try {
      const base = (import.meta.env?.BASE_URL || './') + 'assets/kit/';
      const ld = new THREE.TextureLoader();
      const tx = (f, srgb) => packedUrl(base + f) ? loadPacked(base + f, { srgb, anisotropy: 8 }).userData.ready.then(t => t || Promise.reject(new Error(f)))   // BC1 (texpack)
        : new Promise((res, rej) => ld.load(base + f, t => { t.image = capImage(t.image); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
      const [gltf, alb, nrm, orm] = await Promise.all([new GLTFLoader().loadAsync(base + 'city_kit.glb'), tx('city_alb.jpg', true), tx('city_nrm.png'), tx('city_orm.jpg')]);
      const K = {};
      gltf.scene.traverse(o => {
        if (!o.isMesh || !o.geometry.index) return;
        const g = o.geometry;
        K[o.name] = { pos: Float32Array.from(g.attributes.position.array), nrm: Float32Array.from(g.attributes.normal.array), uv: Float32Array.from(g.attributes.uv.array), idx: Uint32Array.from(g.index.array) };
      });
      kitMat = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrm, aoMap: orm, roughnessMap: orm, metalnessMap: orm, vertexColors: true, roughness: 1, metalness: 1 });
      patchKitMaterial(kitMat, nightU, { fade: { value: new THREE.Vector2(...FADE_K) } });
      setKit(K);
      for (const wk of pool) wk.postMessage({ type: 'kit', kit: K });
      for (const nh of nearH.values()) if (!nh.dead) nearRequest(nh, false);
      console.log('[buildings2] city kit: ' + Object.keys(K).length + ' pieces');
    } catch (err) { console.warn('[buildings2] city kit unavailable', err); }
    // v3 facade kit (tools/blender/kit_facade3.py): window units, doors, garages, tile caps, railings, base clutter
    try {
      const base = (import.meta.env?.BASE_URL || './') + 'assets/kit/';
      const ld = new THREE.TextureLoader();
      const tx = (f, srgb) => packedUrl(base + f) ? loadPacked(base + f, { srgb, anisotropy: 8 }).userData.ready.then(t => t || Promise.reject(new Error(f)))   // BC1 (texpack)
        : new Promise((res, rej) => ld.load(base + f, t => { t.image = capImage(t.image); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
      const [gltf, meta, alb, nrm, orm] = await Promise.all([new GLTFLoader().loadAsync(base + 'fac3_kit.glb'), fetch(base + 'fac3_kit.json').then(r => r.json()), tx('fac3_alb.jpg', true), tx('fac3_nrm.jpg'), tx('fac3_orm.jpg')]);
      const K = {};
      gltf.scene.traverse(o => {
        if (!o.isMesh || !o.geometry.index || !meta.pieces[o.name]) return;
        const g = o.geometry, a = g.attributes, mk = a.uv1 ? a.uv1.array : null, nv = a.position.count, mask = new Float32Array(nv);
        for (let v = 0; v < nv; v++) mask[v] = mk ? mk[v * 2] * 2 : 0;
        K[o.name] = { pos: Float32Array.from(a.position.array), nrm: Float32Array.from(a.normal.array), uv: Float32Array.from(a.uv.array), idx: Uint32Array.from(g.index.array), mask, meta: meta.pieces[o.name] };
      });
      kitMat3 = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrm, aoMap: orm, roughnessMap: orm, metalnessMap: orm, vertexColors: true, roughness: 1, metalness: 1 });
      // (look-dev) shrubs / hedges / bougainvillea: shrunk core + alpha-tested leaf cards from the tree leaf atlas
      const leafTex = leafAtlas();
      const noLeaf = typeof location !== 'undefined' && /[?&]noleaf/.test(location.search);   // A/B
      if (!noLeaf) leafify(K);
      patchKitMaterial(kitMat3, nightU, { leaf: leafTex, fade: { value: new THREE.Vector2(...FADE_3) } });
      kitMat3d = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrm, aoMap: orm, roughnessMap: orm, metalnessMap: orm, vertexColors: true, roughness: 1, metalness: 1 });
      patchKitMaterial(kitMat3d, nightU, { leaf: leafTex, fade: { value: new THREE.Vector2(...FADE_D) } });
      kitLeafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex });
      kitLeafDepth.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', LEAF_DECODE + 'if (kLeaf && texture2D(map, kLeafUv).a < 0.5) discard;');
      };
      kitLeafDepth.customProgramCacheKey = () => 'kit-leaf-depth-v1';
      setKit3(K);
      for (const wk of pool) wk.postMessage({ type: 'kit3', kit: K });
      if (kitMat) for (const nh of nearH.values()) if (!nh.dead) nearRequest(nh, false);
      console.log('[buildings2] facade kit v3: ' + Object.keys(K).length + ' pieces');
    } catch (err) { console.warn('[buildings2] facade kit v3 unavailable', err); }
  })();
  stream.register({
    name: 'bld-near', range: NEAR_R, priority: 2,
    load(tile) {
      const [, c] = B.inTile(tile.tx, tile.tz);
      if (!c) return null;
      const h = { tile, key: tile.key, near: true, mesh: null, tris: 0, kcells: null, dead: false };
      nearH.set(tile.key, h); st.nearTiles++;
      nearRequest(h, stream.budgetMs === Infinity);
      return h;
    },
    unload(h) {
      if (!h) return;
      h.dead = true; nearH.delete(h.key); st.nearTiles--;
      setMesh(h, null, '', false, 'nearTris'); setKitMesh(h, null);
    },
  });

  // ================================================================ DRESS tiles (storefront signs / awnings / neon, v2dressgeo.js)
  const dressH = new Map();
  function dressRequest(h) {
    const msg = { type: 'dress', key: h.key, tx: h.tile.tx, tz: h.tile.tz, hidden: hiddenIn(h.tile.tx, h.tile.tz) };
    const done = (res) => { if (!h.dead && dress) { dress.add(h.key, res, h.tile.cx, h.tile.cz); st.dressMs = Math.max(st.dressMs || 0, res.ms || 0); } };
    if (pool.length) submit(msg, done, h); else runLocal({ msg, onDone: done, h });
  }
  if (dress) stream.register({
    name: 'bld-dress', range: 900, priority: 3,
    load(tile) {
      const [, c] = B.inTile(tile.tx, tile.tz);
      if (!c) return null;
      const h = { tile, key: tile.key, dead: false };
      dressH.set(tile.key, h); dressRequest(h);
      return h;
    },
    unload(h) { if (!h) return; h.dead = true; dressH.delete(h.key); dress.remove(h.key); },
  });

  // ================================================================ colliders
  const colTrash = [], colH = new Map(), cring = [];
  // back-yard fence / shed colliders (v6yard.js), built with the MID tile, live only while the tile's bld-col is loaded
  const yardCols = new Map();                         // tile key -> Float32Array (stride 7) from the MID build
  const NOYC = typeof location !== 'undefined' && /[?&]noyardcol\b/.test(location.search || '');
  function yardColsOn(h) {
    let a = yardCols.get(h.tile.key); if (!a || h.yard) return;
    if (!a.free) { const t0 = performance.now(); a = streetFree(a); a.free = true; yardCols.set(h.tile.key, a); st.yardFilterMs = Math.max(st.yardFilterMs, performance.now() - t0); }
    h.yard = [];
    for (let o = 0; o < a.length; o += 7) h.yard.push(stream.ctx.colliders.add({ x: a[o], z: a[o + 1], hx: a[o + 2], hz: a[o + 3], yaw: a[o + 4], yMin: a[o + 5], yMax: a[o + 6], kind: 'fence' }));
    st.yardCols += h.yard.length;
  }
  function yardColsOff(h, now) {
    if (!h.yard) return;
    for (const q of h.yard) if (now) stream.ctx.colliders.remove(q); else colTrash.push(q);
    st.yardCols -= h.yard.length; h.yard = null;
  }
  // a yard whose rear faces a street (through lots: nothing behind to stop the depth scan) must not wall off the
  // sidewalk / carriageway: drop boxes with a sample point (every ~3 m) on asphalt / paved ground (surface raster 1 / 2;
  // a graph nearestEdge test per sample cost ~26 ms per tile on arrival)
  function streetFree(a) {
    const T = stream.ctx.terrain, keep = [];
    for (let o = 0; o < a.length; o += 7) {
      const x = a[o], z = a[o + 1], hx = a[o + 2], hz = a[o + 3], c = Math.cos(a[o + 4]), sn = Math.sin(a[o + 4]);
      const long = hx >= hz, L = long ? hx : hz, ux = long ? c : sn, uz = long ? -sn : c;
      let bad = false;
      const ns = Math.max(1, Math.ceil(L / 1.6)), dt = 1 / ns;   // samples ~3.2 m apart (4 m raster)
      for (let t = -1 + dt; t < 1 && !bad; t += 2 * dt) { const s = T.surfaceRaw(x + ux * L * t, z + uz * L * t); if (s === 1 || s === 2) bad = true; }
      if (!bad) for (let k = 0; k < 7; k++) keep.push(a[o + k]);
    }
    st.yardColsDropped += (a.length - keep.length) / 7;
    return keep.length === a.length ? a : new Float32Array(keep);   // (filtered lazily when the tile's colliders go live)
  }
  function setYardCols(key, a) {
    if (NOYC) return;
    const ch = colH.get(key);
    if (ch) yardColsOff(ch, true);
    if (a && a.length) yardCols.set(key, a); else { yardCols.delete(key); a = null; }
    if (ch && a) yardColsOn(ch);
  }
  function colsFor(i, out) {
    if (P.area[i] < 6) return;
    const yMin = BD.minH[i] > 0 ? BD.base[i] + BD.minH[i] : BD.base[i] - 2, yMax = P.yTop[i];
    const c = Math.cos(P.oyaw[i]), s = Math.sin(P.oyaw[i]), ox = P.ox[i], oz = P.oz[i], yaw = P.oyaw[i], fill = P.fill[i];
    if (fill >= 0.93 || P.area[i] < 40) { out.push({ x: ox, z: oz, hx: P.ohx[i], hz: P.ohz[i], yaw, yMin, yMax, kind: 'building', bld: i }); return; }
    // Rectangle cover of the real footprint in the OBB frame (the old whole-OBB box for fill >= 0.7 / 2-3 slices left up to
    // ~30 % of the box as invisible wall, often over the sidewalk / street): scan the footprint every ~1.5 m along the long
    // axis (cross-axis covered intervals at the scan line), merge runs of scans with matching intervals, then shrink each
    // rectangle to the polygon's real extent inside it.
    B.ring(i, cring);
    const n = cring.length / 2, alongX = P.ohx[i] >= P.ohz[i], H = alongX ? P.ohx[i] : P.ohz[i];
    const lx = colTmp.lx.length >= n ? colTmp.lx : (colTmp.lx = new Float32Array(n * 2)), lz = colTmp.lz.length >= n ? colTmp.lz : (colTmp.lz = new Float32Array(n * 2));
    for (let k = 0; k < n; k++) { const dx = cring[k * 2] - ox, dz = cring[k * 2 + 1] - oz; lx[k] = c * dx - s * dz; lz[k] = s * dx + c * dz; }
    const A = alongX ? lx : lz, Bv = alongX ? lz : lx;
    const rects = [];
    for (let tol = 0.6; tol < 20; tol *= 2) {
      rects.length = 0;
      const ns = Math.min(64, Math.max(2, Math.ceil(2 * H / 1.5))), step = 2 * H / ns;
      let open = [];                               // running rects [a0, a1, lo, hi]
      for (let q = 0; q < ns; q++) {
        const a = -H + step * (q + 0.5), xs = [];
        for (let k = 0; k < n; k++) { const kk = (k + 1) % n, pa = A[k], pb = A[kk]; if ((pa <= a) !== (pb <= a)) xs.push(Bv[k] + (Bv[kk] - Bv[k]) * (a - pa) / (pb - pa)); }
        xs.sort((u, v) => u - v);
        const iv = []; for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > 0.05) iv.push([xs[k], xs[k + 1]]);
        const a0 = -H + step * q, a1 = a0 + step, next = [];
        for (const [lo, hi] of iv) {
          const m = open.find(r => !r.used && Math.abs(r[2] - lo) < tol && Math.abs(r[3] - hi) < tol);
          if (m) { m.used = true; m[1] = a1; m[2] = Math.min(m[2], lo); m[3] = Math.max(m[3], hi); next.push(m); }
          else next.push([a0, a1, lo, hi]);
        }
        for (const r of open) if (!r.used) rects.push(r);
        for (const r of next) r.used = false;
        open = next;
      }
      for (const r of open) rects.push(r);
      if (rects.length <= 12) break;
    }
    // shrink to the polygon inside the rectangle: along-axis extent of the part within [lo, hi] (vertices + edge crossings)
    const shrink = r => {
      let a0 = 1e9, a1 = -1e9, lo = 1e9, hi = -1e9;
      for (let k = 0; k < n; k++) {
        const kk = (k + 1) % n, pa = A[k], pb = A[kk], va = Bv[k], vb = Bv[kk];
        if (pa >= r[0] - 0.01 && pa <= r[1] + 0.01 && va >= r[2] - 0.01 && va <= r[3] + 0.01) { a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); lo = Math.min(lo, va); hi = Math.max(hi, va); }
        for (const sc of [r[0], r[1]]) if ((pa - sc) * (pb - sc) < 0) { const v = va + (vb - va) * (sc - pa) / (pb - pa); if (v >= r[2] - 0.01 && v <= r[3] + 0.01) { a0 = Math.min(a0, sc); a1 = Math.max(a1, sc); lo = Math.min(lo, v); hi = Math.max(hi, v); } }
        for (const sc of [r[2], r[3]]) if ((va - sc) * (vb - sc) < 0) { const q = pa + (pb - pa) * (sc - va) / (vb - va); if (q >= r[0] - 0.01 && q <= r[1] + 0.01) { a0 = Math.min(a0, q); a1 = Math.max(a1, q); lo = Math.min(lo, sc); hi = Math.max(hi, sc); } }
      }
      for (const pa of [r[0], r[1]]) for (const va of [r[2], r[3]]) if (inPoly(pa, va)) { a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); lo = Math.min(lo, va); hi = Math.max(hi, va); }   // rectangle corners covered by the footprint
      a0 = Math.max(a0, r[0]); a1 = Math.min(a1, r[1]); lo = Math.max(lo, r[2]); hi = Math.min(hi, r[3]);
      return a1 - a0 > 0.2 && hi - lo > 0.2 ? [a0, a1, lo, hi] : null;
    };
    const inPoly = (pa, va) => { let inside = false; for (let k = 0, j = n - 1; k < n; j = k++) if ((Bv[k] > va) !== (Bv[j] > va) && pa < (A[j] - A[k]) * (va - Bv[k]) / (Bv[j] - Bv[k]) + A[k]) inside = !inside; return inside; };
    // how far a rectangle corner sticks out past the footprint (a merged run along a diagonal facade left a 28 m invisible
    // wall across Market St at 8th: race cars stopped dead in the open road)
    const over = q => {
      let m = 0;
      for (const pa of [q[0], q[1]]) for (const va of [q[2], q[3]]) {
        if (inPoly(pa, va)) continue;
        let d = 1e9;
        for (let k = 0, j = n - 1; k < n; j = k++) { const ax = A[j], az = Bv[j], dx = A[k] - ax, dz = Bv[k] - az, l2 = dx * dx + dz * dz || 1; let t = ((pa - ax) * dx + (va - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; d = Math.min(d, Math.hypot(pa - ax - dx * t, va - az - dz * t)); }
        m = Math.max(m, d);
      }
      return m;
    };
    const emit = (q, depth) => {
      if (depth < 6 && over(q) > 3) {
        const r1 = q.slice(), r2 = q.slice();
        if (q[1] - q[0] >= q[3] - q[2]) { const m = (q[0] + q[1]) / 2; r1[1] = m; r2[0] = m; } else { const m = (q[2] + q[3]) / 2; r1[3] = m; r2[2] = m; }
        for (const h of [r1, r2]) { const sq = shrink(h); if (sq) emit(sq, depth + 1); }
        return;
      }
      const [a0, a1, lo, hi] = q;
      const ma = (a0 + a1) / 2, mb = (lo + hi) / 2, cx = alongX ? ma : mb, cz = alongX ? mb : ma;
      out.push({ x: ox + c * cx + s * cz, z: oz - s * cx + c * cz, hx: alongX ? (a1 - a0) / 2 : (hi - lo) / 2, hz: alongX ? (hi - lo) / 2 : (a1 - a0) / 2, yaw, yMin, yMax, kind: 'building', bld: i });
    };
    for (const r of rects) { const q = shrink(r); if (q) emit(q, 0); }
  }
  const colTmp = { lx: new Float32Array(64), lz: new Float32Array(64) };
  // (perf r3) a tile's building colliders (+ its yard fences) are added over a few frames, <= COL_MS each (?nostreamslice:
  // all in the load, 5-11 ms). The range is 600 m, so they are complete long before the car gets there.
  const colPend = new Set(), COL_MS = 1.2;
  function colWork(h, ms) {
    const cx = stream.ctx, t0 = performance.now();
    // colliders of unloaded tiles still waiting in the trash go first (a quick reload of this tile would otherwise stack
    // a second copy of every box on the old one until the 1 ms/frame drain reached it)
    while (colTrash.length) { cx.colliders.remove(colTrash.pop()); if ((colTrash.length & 31) === 0 && performance.now() - t0 > ms) return false; }
    for (; h.next < h.end; h.next++) {
      const i = h.next;
      if ((why[i] & 2) || h.by.has(i)) continue;
      const l = []; colsFor(i, l);
      if (l.length) { h.by.set(i, l); for (const q of l) cx.colliders.add(q); st.cols += l.length; }
      if ((i & 15) === 0 && performance.now() - t0 > ms) { h.next++; return false; }
    }
    yardColsOn(h);
    colPend.delete(h);
    return true;
  }
  stream.register({
    name: 'bld-col', range: 600, priority: 0,
    load(tile) {
      const [f, c] = B.inTile(tile.tx, tile.tz);
      if (!c) return null;
      const h = { tile, by: new Map(), next: f, end: f + c };
      colH.set(tile.key, h);
      if (PERF.streamslice && stream.budgetMs !== Infinity) colPend.add(h); else colWork(h, Infinity);
      return h;
    },
    unload(h) {
      if (!h) return;
      colPend.delete(h);
      colH.delete(h.tile.key);
      for (const l of h.by.values()) { for (const q of l) colTrash.push(q); st.cols -= l.length; }
      yardColsOff(h, false);
    },
    update() {
      if (!colPend.size) return;
      if (stream.budgetMs === Infinity) { for (const h of [...colPend]) colWork(h, Infinity); return; }
      // nearest pending tile first
      const f = stream.focus; let best = null, bd = Infinity;
      for (const h of colPend) { const d = stream.dist(h.tile, f.x, f.z); if (d < bd) { bd = d; best = h; } }
      colWork(best, COL_MS);
    },
  });

  // ================================================================ landmark hiding + queries
  function hideBuilding(i, on = true) {
    if (i < 0 || i >= N || ((why[i] & 2) !== 0) === on) return;
    setWhy(i, 2, on);
    const key = BD.tileOf[i], ch = colH.get(key);
    if (ch) {
      if (on) { const l = ch.by.get(i); if (l) { for (const q of l) stream.ctx.colliders.remove(q); ch.by.delete(i); st.cols -= l.length; } }
      else { const l = []; colsFor(i, l); if (l.length) { ch.by.set(i, l); for (const q of l) stream.ctx.colliders.add(q); st.cols += l.length; } }
    }
    const mh = midH.get(key);
    if (mh) midRequest(mh, false);                 // NEAR follows when the MID rebuild lands
    const dh = dressH.get(key);
    if (dh) dressRequest(dh);
  }
  function find(x, z, r = 30) {
    const out = [], tl = stream.tileAt(x, z);
    if (!tl) return out;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const [f, c] = B.inTile(tl.tx + dx, tl.tz + dz);
      for (let i = f; i < f + c; i++) if (P.maxX[i] >= x - r && P.minX[i] <= x + r && P.maxZ[i] >= z - r && P.minZ[i] <= z + r) out.push(i);
    }
    return out;
  }
  function buildingAt(x, z) {
    for (const i of find(x, z, 0)) {
      B.ring(i, cring); const n = cring.length / 2; let inside = false;
      for (let k = 0, j = n - 1; k < n; j = k++) { const zi = cring[k * 2 + 1], zj = cring[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (cring[j * 2] - cring[k * 2]) * (z - zi) / (zj - zi) + cring[k * 2]) inside = !inside; }
      if (inside) return i;
    }
    return -1;
  }
  const api = {
    v2: true, group, count: N0, plan: P, material: mat, stats: st,
    get dress() { return dress; },
    hideBuilding: (i) => hideBuilding(i, true), showBuilding: (i) => hideBuilding(i, false),
    isHidden: (i) => (why[i] & 2) !== 0, find, buildingAt,
    ring: (i, out) => B.ring(i, out), tileOf: (i) => BD.tileOf[i], colTiles: colH,     // (dev/collider_audit.js)
    setNearOwner(g) { gOwn = g; kitCull(true); },
    info(i) { return { style: Object.keys(S).find(k => S[k] === P.style[i]), zone: P.zone[i], h: BD.h[i], y0: P.y0[i], yTop: P.yTop[i], kind: BD.kind[i], roof: BD.roof[i], x: P.cx[i], z: P.cz[i] }; },
    internals: { textures, paramsTex: P.paramsTex, hideTex, hideData, time, night: nightU, depth, pool },
    dispose() { for (const w of pool) w.terminate(); pool.length = 0; },
    // night: the street lamps near the camera light the facades (facade + kit materials, material.js lampUniforms)
    update(dt, camera) { lampUpdate(dt, camera); },
  };
  // street lamps (props v2 exposes them on the world: window.__world.props.lamps): the nearest few, faded in / out by
  // distance so the set can change without pops
  const LU = lampUniforms(), lampPick = [];
  let lampT = 0;
  function lampUpdate(dt, camera) {
    lampT -= dt || 0;
    const nv = nightU.value; LU.on.value = nv > 0.02 ? 1 : 0;
    if (nv <= 0.02 || !camera) return;
    const lamps = globalThis.__world?.props?.lamps; if (!lamps || !lamps.length) { LU.n.value = 0; return; }
    const cx = camera.position.x, cz = camera.position.z;
    if (lampT <= 0) {
      lampT = 0.0; lampPick.length = 0;   // every frame: a few thousand distance checks, ~0.02 ms
      for (const L of lamps) { if (L.broken) continue; const d = Math.hypot(L.x - cx, L.z - cz); if (d < 95) lampPick.push([d, L]); }
      lampPick.sort((a, b) => a[0] - b[0]); if (lampPick.length > LU.max) lampPick.length = LU.max;
    }
    // weights fade to 0 at the set's edge (the 12th lamp when the set is full), so a lamp entering / leaving the set at
    // a re-pick does so at zero weight: no pops
    let n = 0, dCut = 90;
    if (lampPick.length >= LU.max) { dCut = 0; for (const [, L] of lampPick) dCut = Math.max(dCut, Math.hypot(L.x - cx, L.z - cz)); }
    for (const [, L] of lampPick) {
      const d = Math.hypot(L.x - cx, L.z - cz), w = Math.min(1, (90 - d) / 30, (dCut - d) / 20);
      if (w <= 0) continue;
      LU.pos.value[n].set(L.x, L.y - 0.4, L.z, w);
      const c = L.col || [1, 0.85, 0.6]; LU.col.value[n].set(c[0], c[1], c[2]);
      n++;
    }
    LU.n.value = n;
  }
  st.registerMs = performance.now() - t0;
  console.log(`[buildings2] ${N0} footprints (+${N - N0} lot pieces from ${P.lots.parents} rows, ${P.lotMs.toFixed(0)} ms): plan ${P.ms.toFixed(0)} ms (${P.fronts} street walls), register ${st.registerMs.toFixed(0)} ms, ${pool.length} build workers`);
  return api;
}
