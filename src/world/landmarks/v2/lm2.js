// Landmarks on the v2 (1:1 real) map. registerLandmarksV2(stream, ctx) is called by world2.js.
// * heroes (bridges, towers, anything seen from across the city) are built once and stay loaded; their fine detail
//   (suspenders, truss web, lamp posts) is split into chunks that hide beyond ~1.4 km (LOD);
// * everything else streams with the tile streamer (provider 'landmarks2', range 2.2 km);
// * OSM footprints under a model are hidden through buildings.hideBuilding(i) when the buildings module provides it,
//   otherwise (placeholder extruder) by collapsing their vertices + removing their colliders.
import * as THREE from 'three';
import { mats } from '../kit.js';
import { enhanceV2Materials } from './mats2.js';
import { buildGoldenGate2 } from './gg2.js';
import { buildBayBridge2, BAY_PIERS } from './bay2.js';
import * as X from './extra2.js';
import { buildTransamerica, buildSalesforce, buildFerryBuilding } from '../downtown.js';
import { buildCityHall, buildGraceCathedral, buildCoitTower, buildPaintedLadies } from '../civic.js';
import { buildPalaceOfFineArts, buildCliffHouse, buildSutroTower } from '../west.js';
import { buildBallpark, buildWharfSign } from '../bay.js';
import { SITES2, setProj2, GG2, ggPoint, BAY2 } from '../../v2/anchors2.js';
import { registerHeroes } from './hero_lm.js';

const V1 = {
  transamerica: buildTransamerica, salesforce: buildSalesforce, ferry: buildFerryBuilding, cityHall: buildCityHall,
  graceCathedral: buildGraceCathedral, coit: buildCoitTower, paintedLadies: buildPaintedLadies, palaceFineArts: buildPalaceOfFineArts,
  cliffHouse: buildCliffHouse, sutroTower: buildSutroTower, oraclePark: buildBallpark, wharfSign: buildWharfSign,
};

// ------------------------------------------------------------------------------------------ helpers
const yawFacing = (fx, fz) => Math.atan2(-fx, -fz);
function edgeDirNear(graph, name, x, z, r = 250) {
  let best = null, bd = r * r;
  const rx = name instanceof RegExp ? name : null, nm = rx ? null : name.toLowerCase();
  for (const e of graph.edges) {
    if (rx ? !rx.test(e.name) : !e.name.toLowerCase().startsWith(nm)) continue;
    for (let k = 0; k < e.pts.length - 1; k++) {
      const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2, d = (mx - x) ** 2 + (mz - z) ** 2;
      if (d < bd) { bd = d; const l = Math.hypot(bx - ax, bz - az) || 1; best = { dx: (bx - ax) / l, dz: (bz - az) / l, x: mx, z: mz }; }
    }
  }
  return best;
}
// uniform scale of a v1 result about its anchor (x, z) and base height (y absolute in kit frames)
function scaleResult(res, S, ax, az, base) {
  if (!S || S === 1) return res;
  const g = res.group; g.scale.setScalar(S); g.position.y = base * (1 - S); g.updateMatrixWorld(true);
  for (const c of res.colliders) {
    c.x = ax + (c.x - ax) * S; c.z = az + (c.z - az) * S; c.hx *= S; c.hz *= S;
    c.yMin = base + (c.yMin - base) * S; c.yMax = base + (c.yMax - base) * S;
  }
  return res;
}
function disposeGroup(g) {
  const shared = new Set(Object.values(mats()));
  g.traverse(o => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m && !shared.has(m) && !m.userData.keep) { for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap']) m[k]?.dispose?.(); m.dispose(); }
  });
}

export function registerLandmarksV2(stream, { data, terrain, graph, root, buildings, scene }) {
  setProj2(data.meta);
  enhanceV2Materials();
  const heightAt = (x, z) => terrain.heightAt(x, z);
  const B = data.buildings;
  const colliders = stream.ctx.colliders;
  const hide = new Set();
  const heroes = [];
  const t0 = performance.now();

  // hide lists: explicit indices + every footprint whose centroid is inside radius r
  const ring = [];
  function hideAround(x, z, r, floatingOnly = false) {
    const T = B.tile, tx0 = Math.floor((x - r - B.X0) / T), tx1 = Math.floor((x + r - B.X0) / T), tz0 = Math.floor((z - r - B.Z0) / T), tz1 = Math.floor((z + r - B.Z0) / T);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const [f, c] = B.inTile(tx, tz);
      for (let i = f; i < f + c; i++) {
        B.ring(i, ring); let cx = 0, cz = 0; const n = ring.length / 2;
        for (let k = 0; k < n; k++) { cx += ring[k * 2]; cz += ring[k * 2 + 1]; }
        if (Math.hypot(cx / n - x, cz / n - z) < r && (!floatingOnly || B.minH[i] > 3)) hide.add(i);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ site resolution
  function resolve(id, s) {
    const out = { ...s };
    if (s.street) {
      const n = graph.intersection(s.street[0], s.street[1]);
      if (n) {
        out.at = [n.x, n.z];
        if (s.along) {
          const d = edgeDirNear(graph, s.along, n.x, n.z, 120);
          if (d) { const sg = d.dz > 0 ? 1 : -1; out.at = [n.x + d.dx * sg * s.back, n.z + d.dz * sg * s.back]; out.yaw = yawFacing(d.dx * sg, d.dz * sg); }
        }
        if (s.off) out.at = [n.x + s.off[0], n.z + s.off[1]];
        if (s.north) out.at = [n.x, n.z - s.north];
      } else if (s.fallback) out.at = s.fallback;
    }
    if (s.yawStreet) { const d = edgeDirNear(graph, s.yawStreet, s.at[0], s.at[1]); if (d) out.yaw = Math.atan2(d.dx, d.dz); }
    if (s.frontStreet) {
      let best = null;
      for (const e of graph.edges) if (s.frontStreet.test(e.name)) { const [x, z] = e.pts[e.pts.length >> 1]; const d = Math.hypot(x - s.at[0], z - s.at[1]); if (!best || d < best.d) best = { d, x, z }; }
      if (best) out.yaw = yawFacing(best.x - s.at[0], best.z - s.at[1]); else out.yaw = 0;
    }
    if (s.corners) {
      const ps = s.corners.map(([a, b]) => graph.intersection(a, b)).filter(Boolean);
      out.at = ps.length === 4 ? [ps.reduce((q, n) => q + n.x, 0) / 4, ps.reduce((q, n) => q + n.z, 0) / 4] : s.fallback;
    }
    return out;
  }

  function build(id) {
    const s = resolve(id, SITES2[id]);
    let res = null;
    if (V1[id]) {
      const [x, z] = s.at;
      res = V1[id]({ heightAt, A: { x, z, yaw: s.yaw ?? 0, ...s.A } });
      if (s.S) scaleResult(res, s.S, x, z, heightAt(x, z));
    } else if (id === 'alcatraz') res = X.buildAlcatraz2({ light: s.light, tower: s.tower, heightAt });
    else if (id === 'conservatory') res = X.buildConservatory({ x: s.at[0], z: s.at[1], yaw: s.yaw, heightAt });
    else if (id === 'deYoung') res = X.buildDeYoungTower({ x: s.at[0], z: s.at[1], yaw: s.yaw, base: s.base, heightAt });
    else if (id === 'legion') res = X.buildLegion({ x: s.at[0], z: s.at[1], yaw: s.yaw, heightAt });
    else if (id === 'missionDolores') {
      const f = [-Math.sin(s.yaw), -Math.cos(s.yaw)];
      res = X.buildMissionDolores({ heightAt, mission: { x: s.mission[0], z: s.mission[1], yaw: s.yaw }, basilica: { x: s.basilica[0] + f[0] * 3.2, z: s.basilica[1] + f[1] * 3.2, yaw: s.yaw } });
    } else if (id === 'castroTheatre') res = X.buildCastroSign({ x: s.at[0], z: s.at[1], yaw: s.yaw, base: s.base, heightAt });
    else if (id === 'dragonGate') res = X.buildDragonGate({ x: s.at[0], z: s.at[1], yaw: s.yaw ?? 0, heightAt });
    else if (id === 'unionSquare') res = X.buildDeweyColumn({ x: s.at[0], z: s.at[1], heightAt });
    else if (id === 'embarcaderoCenter') res = X.buildEmbarcaderoLights({ B, groups: s.groups, heightAt });
    else if (id === 'pier39') res = X.buildPier39({ x: s.at[0], z: s.at[1], yaw: Math.PI, heightAt });
    if (res) res.group.name = 'lm2:' + id;
    return res;
  }

  // hides for every site (static: known up front)
  for (const [id, s] of Object.entries(SITES2)) {
    for (const i of s.hide || []) hide.add(i);
    if (s.hideR && s.at) hideAround(s.at[0], s.at[1], s.hideR);
    if (s.hideFloat && s.at) hideAround(s.at[0], s.at[1], s.hideFloat, true);   // raised OSM parts (colonnade roofs...)
    void id;
  }

  // bridge towers / pylons / anchorages are mapped as OSM buildings too
  for (const s of [0, GG2.mainSpan, -349, -450, GG2.mainSpan + GG2.sideSpan + 3]) { const [x, z] = ggPoint(s); hideAround(x, z, 32); }
  { const [ax, az] = BAY2.sf, [bx, bz] = BAY2.ybi, L = Math.hypot(bx - ax, bz - az);
    for (const s of Object.values(BAY_PIERS)) hideAround(ax + (bx - ax) * s / L, az + (bz - az) * s / L, 33); }

  // Blender-baked hero buildings (hero_lm.js): their OSM footprints hide, sites they replace are skipped
  let HX = null;
  try { HX = registerHeroes(stream, { root, colliders, terrain, scene }); for (const i of HX.hide) hide.add(i); } catch (e) { console.error('[landmarks2] heroes', e); }
  const replaced = HX ? HX.replaces : new Set();

  // ------------------------------------------------------------------------------------------ heroes
  const addHero = (res) => { if (!res) return; root.add(res.group); colliders.addAll ? colliders.addAll(res.colliders) : res.colliders.forEach(c => colliders.add(c)); heroes.push(res); };
  try { addHero(buildGoldenGate2({ heightAt, graph })); } catch (e) { console.error('[landmarks2] golden gate', e); }
  try { addHero(buildBayBridge2({ heightAt, graph })); } catch (e) { console.error('[landmarks2] bay bridge', e); }
  for (const [id, s] of Object.entries(SITES2)) if (s.hero && !replaced.has(id)) { try { addHero(build(id)); } catch (e) { console.error('[landmarks2] ' + id, e); } }

  // ------------------------------------------------------------------------------------------ streamed
  const streamed = Object.entries(SITES2).filter(([id, s]) => !s.hero && !replaced.has(id)).map(([id, s]) => {
    const r = resolve(id, s), at = r.at || s.mission;
    const t = stream.tileAt(at[0], at[1]);
    return { id, key: t ? t.key : -1 };
  });
  const live = new Set();
  stream.register({
    name: 'landmarks2', range: 2200, priority: 2,
    load(tile) {
      const list = [];
      for (const it of streamed) {
        if (it.key !== tile.key) continue;
        try {
          const res = build(it.id); if (!res) continue;
          root.add(res.group); colliders.addAll ? colliders.addAll(res.colliders) : res.colliders.forEach(c => colliders.add(c));
          list.push(res); live.add(res);
        } catch (e) { console.error('[landmarks2] ' + it.id, e); }
      }
      return list.length ? list : null;
    },
    unload(list) {
      for (const res of list || []) { root.remove(res.group); for (const c of res.colliders) colliders.remove(c); disposeGroup(res.group); live.delete(res); }
    },
  });

  // ------------------------------------------------------------------------------------------ OSM hides
  let plainHide = null;
  if (buildings?.hideBuilding) for (const i of hide) buildings.hideBuilding(i);
  else if (buildings?.plain) plainHide = makePlainHider(stream, B, hide, colliders);

  console.log(`[landmarks2] ${heroes.length} heroes + ${streamed.length} streamed sites, ${hide.size} OSM footprints hidden, ${(performance.now() - t0).toFixed(0)} ms`);
  const detail = heroes.flatMap(h => h.detail || []);
  const cam = new THREE.Vector3();
  let frame = 0;
  return {
    hideList: [...hide], heroes, live,
    update(dt, env = {}) {
      const p = env.camera?.position || env.focus || stream.focus;
      cam.set(p.x, p.y || 0, p.z);
      for (const d of detail) d.mesh.visible = d.c.distanceTo(cam) - d.r < d.far;
      for (const h of heroes) h.update(dt, env);
      for (const r of live) r.update(dt, env);
      HX?.update(dt, env);
      if (plainHide && (frame++ % 20) === 0) plainHide();
    },
  };
}

// Fallback for world2's placeholder extruder: collapse the hidden footprints' vertices in the loaded tile meshes
// (vertex layout mirrors registerPlainBuildings: 4 verts per wall edge + n roof verts; far LOD only h > 28) and drop
// their colliders. Removed automatically once buildings.js exports hideBuilding.
function makePlainHider(stream, B, hide, colliders) {
  const byTile = new Map();
  for (const i of hide) { const t = B.tileOf[i]; if (!byTile.has(t)) byTile.set(t, new Set()); byTile.get(t).add(i); }
  const done = new WeakSet();
  return () => {
    for (const [name, far] of [['buildings-near', false], ['buildings-far', true]]) {
      const L = stream.loaded.get(name); if (!L) continue;
      for (const [key, rec] of L) {
        const h = rec.handle; if (!h || !h.m || done.has(h)) continue;
        done.add(h);
        const set = byTile.get(key); if (!set) continue;
        const [f, c] = B.inTile(key % B.TC, Math.floor(key / B.TC));
        const P = h.m.geometry.attributes.position, A = P.array;
        let v = 0, ci = 0;
        for (let i = f; i < f + c; i++) {
          const n = B.nv[i]; if (n < 3) continue;
          if (far && !(B.h[i] > 28)) continue;
          const cnt = 5 * n;
          if (set.has(i)) {
            const x = A[v * 3], y = A[v * 3 + 1] - 500, z = A[v * 3 + 2];
            for (let k = v; k < v + cnt; k++) { A[k * 3] = x; A[k * 3 + 1] = y; A[k * 3 + 2] = z; }
            if (!far && h.cols?.[ci]) { colliders.remove(h.cols[ci]); h.cols[ci] = { x: 0, z: 0, hx: 0, hz: 0, yaw: 0, yMin: -1e4, yMax: -1e4 + 1 }; }
          }
          v += cnt; ci++;
        }
        P.needsUpdate = true; h.m.geometry.computeBoundingSphere();
      }
    }
  };
}
