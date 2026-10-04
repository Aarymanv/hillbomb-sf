// Dev collider audit: invisible obstacles (load in the game page: await import('http://127.0.0.1:5190/dev/collider_audit.js')).
//   __colAudit({ r = 300 })          -> audit every static collider within r of the player (see classify below)
//   __colAuditDrive(route, opts)       -> drive a __route() polyline (dev/perf_drive.js) at opts.speed m/s, auditing every
//                                          opts.every m; results are merged per collider (each collider counted once)
//   __colAuditRun(areas)               -> background run over named drives; poll window.__colRes
// A collider is flagged when (a) it blocks traffic at ground level (y range overlaps 0.3-1.8 m over the road it stands
// on) on a carriageway / sidewalk and (b) nothing visible is drawn there:
//   building  : owner hidden (buildings.isHidden: hero landmark / tunnel / interiors) or the OBB slice reaches > 0.6 m
//               outside every visible footprint (phantom area; 1 m sample grid, 0.35 m inset)
//   instanced : props / parked cars / trees: no alive StreamSet instance (any set) within tolerance of the collider
//   other     : rails, interiors, festival, heroes: horizontal + vertical rays against visible non-ground meshes
// Also counts duplicate colliders (same object twice / same box twice) and orphans (owner tile unloaded).
import * as THREE from 'three';
const W = window;
const DRIVE = new Set(['street', 'highway', 'crooked', 'arterial', 'alley', 'bridge', 'mountain']);
const GROUND_NAME = /^(terrain|roads|sidewalk|markings|curbs?|grass|water|walk-path|props2:pools)/i;

function roadAt(x, z, y) {
  // 'road' (carriageway of a drivable edge at this height), 'walk' (its sidewalk), or null
  const w = W.__world, g = w.graph, C = g.edgeHashCell, arr = g.edgeHash.get(Math.floor(x / C) * 100003 + Math.floor(z / C));
  if (!arr) return null;
  let walk = false;
  for (const [e, k] of arr) {
    if (!DRIVE.has(e.kind) && e.kind !== 'plaza') continue;
    const p = e.pts[k], p2 = e.pts[k + 1], dx = p2[0] - p[0], dz = p2[1] - p[1], l2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - p[0]) * dx + (z - p[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - p[0] - dx * t, ez = z - p[1] - dz * t, d2 = ex * ex + ez * ez, hw = e.width * 0.5;
    if (d2 > (hw + (e.sidewalk || 0)) ** 2) continue;
    // the edge's surface height here (decks / tunnels carry ys; ground edges follow the terrain)
    const ey = (e.deck || e.tunnel) && e.ys ? e.ys[k] + (e.ys[k + 1] - e.ys[k]) * t : w.terrain.heightAt(x, z);
    if (Math.abs(ey - y) > 2.5) continue;
    if (d2 < hw * hw && DRIVE.has(e.kind)) return 'road';
    walk = true;
  }
  if (walk) { const n = g.nearestNode?.(x, z, 30); if (n && n.deg >= 3 && (x - n.x) ** 2 + (z - n.z) ** 2 < n.radius * n.radius) return 'road'; }
  return walk ? 'walk' : null;
}
const inPoly = (ring, x, z) => {
  const n = ring.length / 2; let inside = false;
  for (let k = 0, j = n - 1; k < n; j = k++) { const zi = ring[k * 2 + 1], zj = ring[j * 2 + 1]; if ((zi > z) !== (zj > z) && x < (ring[j * 2] - ring[k * 2]) * (z - zi) / (zj - zi) + ring[k * 2]) inside = !inside; }
  return inside;
};
// all alive StreamSet instances (props, parked cars, trees) in a 4 m hash: independent of the per-frame distance/frustum cull
function instanceIndex(cx, cz, R) {
  const P = W.__world.props, idx = new Map(), C = 4;
  for (const s of P._debug.allSets) for (const ch of s.chunks.values()) {
    if (ch.x1 < cx - R || ch.x0 > cx + R || ch.z1 < cz - R || ch.z0 > cz + R) continue;
    for (let j = 0; j < ch.n; j++) {
      if (!ch.alive[j]) continue;
      const x = ch.px[j], z = ch.pz[j], k = Math.floor(x / C) * 100003 + Math.floor(z / C);
      let a = idx.get(k); if (!a) idx.set(k, a = []); a.push(x, z, s.name.length);   // (name length: cheap tag, unused)
    }
  }
  return { has(x, z, tol) { const C0 = 4; for (let gz = Math.floor((z - tol) / C0); gz <= Math.floor((z + tol) / C0); gz++) for (let gx = Math.floor((x - tol) / C0); gx <= Math.floor((x + tol) / C0); gx++) { const a = idx.get(gx * 100003 + gz); if (!a) continue; for (let i = 0; i < a.length; i += 3) if ((a[i] - x) ** 2 + (a[i + 1] - z) ** 2 <= tol * tol) return true; } return false; } };
}
// visible, non-ground meshes (no building-root merged tiles: those are checked by owner) for the ray fallback
function visibleMeshes(cx, cz, R) {
  const out = [], sph = new THREE.Sphere();
  const walk = (o, bld) => {
    if (!o.visible) return;
    if (o.name === 'googleTiles' || o.name === 'terrain2') return;
    const inB = bld || o.name === 'buildings';
    if ((o.isMesh || o.isInstancedMesh) && !o.isInstancedMesh && o.geometry?.attributes?.position && !GROUND_NAME.test(o.name || '') && !(inB && /^bld-(far|mid|near)$/.test(o.name))) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (Math.hypot(sph.center.x - cx, sph.center.z - cz) - sph.radius < R + 20) out.push(o);
    }
    for (const c of o.children) walk(c, inB);
  };
  walk(W.__scene, false);
  return out;
}
const _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
function rayHit(c, meshes, gy) {
  const y = Math.min(Math.max(gy + 1, c.yMin + 0.2), c.yMax - 0.1);
  const near = meshes.filter(m => { const s = m.geometry.boundingSphere; _o.copy(s.center).applyMatrix4(m.matrixWorld); return Math.hypot(_o.x - c.x, _o.z - c.z) < s.radius * 1.02 + Math.hypot(c.hx, c.hz) + 1; });
  if (!near.length) return false;
  const tests = [];
  for (const [ax, az, e] of [[1, 0, c.hx], [0, 1, c.hz]]) {
    const wx = c.c * ax + c.s * az, wz = -c.s * ax + c.c * az;   // local axis -> world
    for (const sg of [1, -1]) tests.push([c.x + wx * sg * (e + 0.6), y, c.z + wz * sg * (e + 0.6), -wx * sg, 0, -wz * sg, 2 * e + 1.2]);
  }
  tests.push([c.x, c.yMax + 0.5, c.z, 0, -1, 0, c.yMax - c.yMin + 0.5]);
  for (const [x, yy, z, dx, dy, dz, far] of tests) {
    _rc.set(_o.set(x, yy, z), _d.set(dx, dy, dz)); _rc.far = far;
    for (const h of _rc.intersectObjects(near, false)) {
      if (dy === 0 && h.face && Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y) > 0.85) continue;   // ground-like surface
      return true;
    }
  }
  return false;
}

function classify(c, ctx) {
  const w = W.__world, bl = w.buildings, gy = w.terrain.heightAt(c.x, c.z);
  // samples: 1 m grid over the box (inset 0.35 m), capped at 24 per axis
  const nx = Math.min(24, Math.max(1, Math.ceil(2 * Math.max(0, c.hx - 0.35)))), nz = Math.min(24, Math.max(1, Math.ceil(2 * Math.max(0, c.hz - 0.35))));
  const cs = c.c ?? Math.cos(c.yaw || 0), sn = c.s ?? Math.sin(c.yaw || 0);
  let road = 0, walk = 0, phantomRoad = 0, phantom = 0, n = 0;
  const own = c.bld != null && bl?.ring ? bl.ring(c.bld, []) : null;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const lx = nx === 1 ? 0 : -(c.hx - 0.35) + 2 * (c.hx - 0.35) * i / (nx - 1), lz = nz === 1 ? 0 : -(c.hz - 0.35) + 2 * (c.hz - 0.35) * j / (nz - 1);
    const x = c.x + cs * lx + sn * lz, z = c.z - sn * lx + cs * lz, g = w.terrain.heightAt(x, z);
    n++;
    // hittable at this spot? (bottom below 1.8 m over the surface, top above 0.3 m)
    const ra = roadAt(x, z, g);
    const hit = c.yMin < g + 1.8 && c.yMax > g + 0.3;
    if (!hit) continue;
    if (ra === 'road') road++; else if (ra === 'walk') walk++;
    if (own) {
      if (inPoly(own, x, z)) continue;
      const o = bl.buildingAt(x, z);
      if (o >= 0 && !bl.isHidden(o)) continue;
      phantom++; if (ra) phantomRoad++;
    }
  }
  const r = { kind: c.kind || 'undefined', road: road > 0, walk: walk > 0, invisible: false, why: '' };
  if (c.kind === 'bounds') return null;
  if (c.bld != null) {
    if (bl.isHidden(c.bld)) { r.invisible = true; r.why = 'hidden-owner'; }
    else if (phantom >= 2) { r.invisible = true; r.why = 'obb-phantom'; r.phantom = phantom; r.road = phantomRoad > 0; }
  } else if (c.propRef || c.kind === 'parked' || c.kind === 'tree') {
    const tol = c.kind === 'parked' ? 1.2 : Math.max(0.6, Math.min(c.hx, c.hz) + 0.4);
    if (!ctx.inst.has(c.x, c.z, tol)) { r.invisible = true; r.why = 'no-instance'; }
  } else if (!rayHit(c, ctx.meshes, gy)) { r.invisible = true; r.why = 'no-mesh'; }
  // orphans: owner tile no longer streamed
  const st = w.stream;
  if (c.bld != null && bl.tileOf && !st.isLoaded('bld-col', bl.tileOf(c.bld))) r.orphan = true;
  if (typeof c.id === 'string' && c.id.startsWith('prop2:')) { const key = +c.id.split(':')[1]; if (!st.isLoaded('props', key)) r.orphan = true; }
  return r;
}

W.__colAudit = ({ r = 300, x = null, z = null, seen = null, agg = null } = {}) => {
  const w = W.__world, p = W.__player.vehicle?.pos || W.__player.pos, cx = x ?? p.x, cz = z ?? p.z;
  const t0 = performance.now();
  const list = w.colliders.query(cx, cz, r, []);
  const ctx = { inst: instanceIndex(cx, cz, r + 20), meshes: visibleMeshes(cx, cz, r) };
  const A = agg || { n: 0, byKind: {}, invisible: 0, invisibleRoad: 0, invisibleWalk: 0, onRoad: 0, orphan: 0, why: {}, ex: [], dupObj: 0, dupBox: 0 };
  for (const c of list) {
    if (c.kind === 'bounds' || (seen && seen.has(c))) continue;
    if (Math.hypot(c.x - cx, c.z - cz) > r) continue;
    seen?.add(c);
    const q = classify(c, ctx); if (!q) continue;
    A.n++;
    const K = A.byKind[q.kind] || (A.byKind[q.kind] = { n: 0, road: 0, inv: 0, invRoad: 0 });
    K.n++; if (q.road) { K.road++; A.onRoad++; }
    if (q.orphan) A.orphan++;
    if (q.invisible) {
      A.invisible++; K.inv++; A.why[q.why] = (A.why[q.why] || 0) + 1;
      if (q.road) { A.invisibleRoad++; K.invRoad++; } else if (q.walk) A.invisibleWalk++;
      if ((q.road || q.walk) && A.ex.length < 40) A.ex.push([q.kind, q.why, Math.round(c.x), Math.round(c.z), +c.hx.toFixed(1), +c.hz.toFixed(1), c.bld ?? c.id ?? '', q.phantom || 0]);
    }
  }
  // duplicates over the whole list
  if (!agg || !A._dupDone) {
    const ids = new Set(), boxes = new Map(); let dObj = 0, dBox = 0;
    for (const c of w.colliders.list) {
      if (ids.has(c)) dObj++; ids.add(c);
      const k = `${c.kind}|${c.x.toFixed(2)}|${c.z.toFixed(2)}|${c.hx.toFixed(2)}|${c.hz.toFixed(2)}|${(c.yaw || 0).toFixed(3)}|${c.yMin.toFixed(1)}`;
      boxes.set(k, (boxes.get(k) || 0) + 1);
    }
    for (const v of boxes.values()) if (v > 1) dBox += v - 1;
    A.dupObj = Math.max(A.dupObj, dObj); A.dupBox = Math.max(A.dupBox, dBox);
  }
  A.ms = Math.round(performance.now() - t0);
  return A;
};

W.__colAuditDrive = async (route, { speed = 60, every = 250, r = 300, settle = 30 } = {}) => {
  W.__manual = true;
  const v = W.__player.vehicle; if (!v) throw new Error('no car');
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = cum[cum.length - 1], seen = new Set(), A = { n: 0, byKind: {}, invisible: 0, invisibleRoad: 0, invisibleWalk: 0, onRoad: 0, orphan: 0, why: {}, ex: [], dupObj: 0, dupBox: 0 };
  let s = 0, k = 0, next = 0;
  while (s < total) {
    s += speed / 60; while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = route[k], b = route[k + 1];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    v.place(x, W.__world.groundAt(x, z, 999) + 0.4, z, yaw); if (v.body?.vel) v.body.vel.set?.(0, 0, 0);
    W.__frame(1 / 60);
    if (s >= next) {
      next += every;
      for (let i = 0; i < settle; i++) { v.place(x, W.__world.groundAt(x, z, 999) + 0.4, z, yaw); W.__frame(1 / 60); }
      W.__colAudit({ r, seen, agg: A });
      await new Promise(r2 => setTimeout(r2, 0));
    }
  }
  return A;
};

export const AREAS = {
  mission: [[640, 1050], [650, 2350]], soma: [[1450, 250], [2150, -300]], fidi: [[1650, -250], [1950, -720]],
  sunset: [[-1900, 1300], [-3400, 1650]], richmond: [[-1500, 150], [-3300, -50]], marina: [[-800, -1250], [300, -1350]], hyde: [[1050, -250], [1055, -1250]],
};
W.__colAuditRun = (names = Object.keys(AREAS), opts = {}) => {
  W.__colRes = { running: true, areas: {} };
  (async () => {
    for (const nm of names) {
      try {
        const route = W.__route(AREAS[nm]);
        W.__teleport(route[0][0], route[0][1]); W.__world.stream.fill(route[0][0], route[0][1]);
        for (let i = 0; i < 60; i++) W.__frame(1 / 60);
        W.__colRes.areas[nm] = await W.__colAuditDrive(route, opts);
      } catch (e) { W.__colRes.areas[nm] = { error: String(e) }; }
    }
    const T = { n: 0, invisible: 0, invisibleRoad: 0, invisibleWalk: 0, onRoad: 0, orphan: 0, dupObj: 0, dupBox: 0, why: {} };
    for (const a of Object.values(W.__colRes.areas)) { if (a.error) continue; for (const k of ['n', 'invisible', 'invisibleRoad', 'invisibleWalk', 'onRoad', 'orphan']) T[k] += a[k]; T.dupObj = Math.max(T.dupObj, a.dupObj); T.dupBox = Math.max(T.dupBox, a.dupBox); for (const [k, v] of Object.entries(a.why)) T.why[k] = (T.why[k] || 0) + v; }
    W.__colRes.total = T; W.__colRes.running = false;
  })();
  return 'started';
};
