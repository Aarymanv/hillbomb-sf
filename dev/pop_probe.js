// Dev pop / flash probes (load in the game page after dev/perf_drive.js: await import('http://127.0.0.1:5190/dev/pop_probe.js')).
//   __popDrive({ route, speed = 60, R = 250 })  -> drive a __route() polyline; counts visible POPS: an object (mesh, or one
//        instance of an instanced set) that appears or disappears while it is inside the camera frustum and closer than R
//        in both frames (so camera motion alone never counts). Same-frame replacements (same name, same bounds) = swaps, not
//        pops. Instances that sit inside their set's shader fade band (set.fadeBand = [start, end] m) are not counted.
//        -> { frames, pops, byName: {name: n}, swaps, ex: [...] }
//   __popRun(names) / window.__popRes  -> background runs over the collider-audit AREAS
//   __boundsAudit()   -> meshes whose stored bounds do not enclose their real geometry (frustum-culled at some angles)
//   __yawSweep(spots) -> 360 deg camera sweep (5 deg): meshes culled by their bounds while their real geometry is in view,
//        + pixels that toggle between two frames at the same camera (LOD thrash / shadow / z-fight shimmer). Poll __yawRes.
import * as THREE from 'three';
import { AREAS } from './collider_audit.js';
const W = window;
const WORLD_ROOTS = new Set(['terrain2', 'city', 'buildings', 'landmarks', 'props', 'googleTiles']);
const SKIP = /^(props2:shard|props2:pools|props2:lamplight)/;
const group = (n) => /^props2:tree[0-2]:|^props2:trees:|^tree[0-2]:|^trees:/.test(n) ? 'tree' : /^props2:parked(Hi)?:/.test(n) ? 'parked' : n;
const _s = new THREE.Sphere(), _v = new THREE.Vector3();
const distS = (cam, s) => Math.max(0, Math.hypot(s.center.x - cam.x, s.center.y - cam.y, s.center.z - cam.z) - s.radius);

function snapshot(cam, fr, R) {
  const meshes = new Map(), inst = new Map();
  const walk = (o, root) => {
    if (!o.visible) return;
    if (o.isInstancedMesh) {
      if (SKIP.test(o.name)) return;
      const g = group(o.name), set = W.__popSets?.get(o.name), fb = set?.fadeBand;
      const A = o.instanceMatrix.array, hgt = Math.min(30, (o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere)).radius);   // (impostor quads: 1e6 sphere)
      let M = inst.get(g); if (!M) inst.set(g, M = new Map());
      for (let i = 0; i < o.count; i++) {
        const x = A[i * 16 + 12], y = A[i * 16 + 13], z = A[i * 16 + 14], d = Math.hypot(x - cam.x, z - cam.z);
        if (d > R + 20) continue;
        M.set(Math.round(x * 2) * 1e6 + Math.round(z * 2), [x, y, z, hgt, fb ? fb[0] : 1e9]);
      }
      return;
    }
    if ((o.isMesh || o.isPoints || o.isLine) && o.geometry && !SKIP.test(o.name)) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere) {
        _s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        // meshes that dither in over a distance band (userData.fadeBand = [a, b], buildings v5) only count as a pop when
        // they switch inside a - 20 m (bounding-sphere slack): beyond that the switch happens fully dithered out
        const fb = o.userData && o.userData.fadeBand, near = fb ? fb[0] - 20 : R;
        if (!o.frustumCulled || fr.intersectsSphere(_s)) if (distS(cam, _s) < Math.min(R, near)) meshes.set(o, { name: root + '/' + (o.name || o.type), c: _s.center.clone(), r: _s.radius, R: Math.min(R, near) });
      }
    }
    for (const c of o.children) walk(c, root);
  };
  for (const r of W.__scene.children) if (WORLD_ROOTS.has(r.name)) walk(r, r.name);
  return { meshes, inst };
}
function diff(prev, cur, pf, cf, pc, cc, R, out) {
  const vis = (fr, cam, c, r, RR = R) => { _s.center.copy(c); _s.radius = r; return fr.intersectsSphere(_s) && distS(cam, _s) < RR; };
  const app = [], dis = [];
  for (const [o, q] of cur.meshes) if (!prev.meshes.has(o) && vis(pf, pc, q.c, q.r, q.R)) app.push(q);
  for (const [o, q] of prev.meshes) if (!cur.meshes.has(o) && vis(cf, cc, q.c, q.r, q.R)) dis.push(q);
  // same-frame swaps (rebuilt tile mesh, grown instanced buffer) cancel out
  for (let i = app.length - 1; i >= 0; i--) {
    const a = app[i], j = dis.findIndex(d => d.name === a.name && d.c.distanceTo(a.c) < 2 && Math.abs(d.r - a.r) < 0.25 * a.r + 1);
    if (j >= 0) { dis.splice(j, 1); app.splice(i, 1); out.swaps++; }
  }
  for (const q of [...app, ...dis]) { const k = (q.r > 300 ? 'BIG:' : '') + q.name.replace(/\d+/g, '#'); if (q.name.startsWith('buildings/')) { out.bld = (out.bld || 0) + 1; (out.bldBy || (out.bldBy = {}))[k] = (out.bldBy[k] || 0) + 1; } out.byName[k] = (out.byName[k] || 0) + 1; out.pops++; if (out.ex.length < 30) out.ex.push([k, Math.round(q.c.x), Math.round(q.c.z), Math.round(q.r)]); }
  for (const [g, M] of cur.inst) {
    const P = prev.inst.get(g) || new Map();
    for (const [k, [x, y, z, h, f]] of M) if (!P.has(k)) { const d = Math.hypot(x - cc.x, z - cc.z); if (d < f && vis(pf, pc, _v.set(x, y + h * 0.5, z), h) && vis(cf, cc, _v, h)) { out.byName['inst:' + g] = (out.byName['inst:' + g] || 0) + 1; out.pops++; } }
  }
  for (const [g, M] of prev.inst) {
    const C = cur.inst.get(g) || new Map();
    for (const [k, [x, y, z, h, f]] of M) if (!C.has(k)) { const d = Math.hypot(x - cc.x, z - cc.z); if (d < f && vis(pf, pc, _v.set(x, y + h * 0.5, z), h) && vis(cf, cc, _v, h)) { out.byName['inst:' + g] = (out.byName['inst:' + g] || 0) + 1; out.pops++; } }
  }
}
function frustumOf(cam, fr) { cam.updateMatrixWorld(); const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m); return fr; }
function setsIndex() { const m = new Map(); for (const s of W.__world.props?._debug?.allSets || []) if (s.mesh) m.set(s.mesh.name, s); W.__popSets = m; }

W.__popDrive = async ({ route, speed = 60, R = 250, maxFrames = 1e9 } = {}) => {
  W.__manual = true;
  const v = W.__player.vehicle, cam = W.__camera;
  const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  const total = cum[cum.length - 1], out = { frames: 0, pops: 0, swaps: 0, byName: {}, ex: [] };
  let s = 0, k = 0, prev = null, pf = new THREE.Frustum(), cf = new THREE.Frustum(), pc = new THREE.Vector3();
  setsIndex();
  while (s < total && out.frames < maxFrames) {
    s += speed / 60; while (k < cum.length - 2 && cum[k + 1] < s) k++;
    const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), a = route[k], b = route[k + 1];
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, yaw = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
    v.place(x, W.__world.groundAt(x, z, 999) + 0.4, z, yaw); if (v.body?.vel) v.body.vel.set?.(0, 0, 0);
    W.__frame(1 / 60); out.frames++;
    if (out.frames % 120 === 0) setsIndex();
    frustumOf(cam, cf); const cc = cam.position.clone();
    const cur = snapshot(cc, cf, R);
    if (prev) diff(prev, cur, pf, cf, pc, cc, R, out);
    prev = cur; [pf, cf] = [cf, pf]; pc.copy(cc);
    if (out.frames % 30 === 0) await new Promise(r => setTimeout(r, 0));
  }
  out.perKm = +(out.pops / (total / 1000)).toFixed(1);
  out.byName = Object.fromEntries(Object.entries(out.byName).sort((p, q) => q[1] - p[1]).slice(0, 16));
  return out;
};
W.__popRun = (names = Object.keys(AREAS), opts = {}) => {
  W.__popRes = { running: true, areas: {} };
  (async () => {
    for (const nm of names) {
      try {
        const route = W.__route(AREAS[nm]);
        W.__teleport(route[0][0], route[0][1]); W.__world.stream.fill(route[0][0], route[0][1]);
        for (let i = 0; i < 90; i++) W.__frame(1 / 60);
        W.__popRes.areas[nm] = await W.__popDrive({ route, ...opts });
      } catch (e) { W.__popRes.areas[nm] = { error: String(e) }; }
    }
    const T = { pops: 0, frames: 0, byName: {} };
    for (const a of Object.values(W.__popRes.areas)) { if (a.error) continue; T.pops += a.pops; T.frames += a.frames; for (const [k, n] of Object.entries(a.byName)) T.byName[k] = (T.byName[k] || 0) + n; }
    T.byName = Object.fromEntries(Object.entries(T.byName).sort((p, q) => q[1] - p[1]).slice(0, 20));
    W.__popRes.total = T; W.__popRes.running = false;
  })();
  return 'started';
};

// ---------------------------------------------------------------- flashing at some view angles
const exactCache = new WeakMap();
function exactBox(o) {
  // world AABB of the real geometry (instanced: every instance), cached per geometry version
  const g = o.geometry, p = g.attributes.position; if (!p) return null;
  const key = o.isInstancedMesh ? o.count + ':' + o.instanceMatrix.version : p.version;
  const hit = exactCache.get(o); if (hit && hit.k === key && hit.mv === o.matrixWorld.elements[12] + o.matrixWorld.elements[14]) return hit.b;
  const lb = new THREE.Box3(); const A = p.array, st = p.isInterleavedBufferAttribute ? p.data.stride : p.itemSize, off = p.offset || 0;
  if (p.isInterleavedBufferAttribute || A.length / st === p.count) for (let i = 0; i < p.count; i++) { const x = A[i * st + off], y = A[i * st + off + 1], z = A[i * st + off + 2]; if (x < lb.min.x) lb.min.x = x; if (y < lb.min.y) lb.min.y = y; if (z < lb.min.z) lb.min.z = z; if (x > lb.max.x) lb.max.x = x; if (y > lb.max.y) lb.max.y = y; if (z > lb.max.z) lb.max.z = z; }
  if (p.normalized || lb.isEmpty()) return null;
  let b;
  if (o.isInstancedMesh) { b = new THREE.Box3(); const m = new THREE.Matrix4(), t = new THREE.Box3(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); b.union(t.copy(lb).applyMatrix4(m)); } b.applyMatrix4(o.matrixWorld); }
  else b = lb.clone().applyMatrix4(o.matrixWorld);
  exactCache.set(o, { k: key, mv: o.matrixWorld.elements[12] + o.matrixWorld.elements[14], b });
  return b;
}
function cullSphere(o, out) {
  // what WebGLRenderer tests (Frustum.intersectsObject)
  if (o.isInstancedMesh || o.isBatchedMesh) { if (o.boundingSphere === null) o.computeBoundingSphere(); out.copy(o.boundingSphere); }
  else { const g = o.geometry; if (g.boundingSphere === null) g.computeBoundingSphere(); out.copy(g.boundingSphere); }
  return out.applyMatrix4(o.matrixWorld);
}
// stored bounds vs real vertices: how far (m, local units) the farthest vertex / instance lies outside the sphere
// WebGLRenderer culls with (geometry.boundingSphere; InstancedMesh.boundingSphere over its instances)
const overCache = new WeakMap();
function boundsOver(o) {
  const g = o.geometry, p = g.attributes.position; if (!p || p.normalized) return 0;
  const key = (o.isInstancedMesh ? o.count + ':' + o.instanceMatrix.version : p.version) + ':' + g.id;
  const hit = overCache.get(o); if (hit && hit.k === key) return hit.v;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const gs = g.boundingSphere; let v = 0;
  if (o.isInstancedMesh) {
    if (o.boundingSphere === null) o.computeBoundingSphere();
    const S = o.boundingSphere, m = new THREE.Matrix4(), t = new THREE.Sphere();
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); t.copy(gs).applyMatrix4(m); v = Math.max(v, t.center.distanceTo(S.center) + t.radius - S.radius); }
  } else {
    const c = gs.center, r2 = gs.radius; let mx = 0;
    for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z, d = dx * dx + dy * dy + dz * dz; if (d > mx) mx = d; }
    v = Math.sqrt(mx) - r2;
  }
  overCache.set(o, { k: key, v });
  return v;
}
const pathOf = (o) => { let p = o, nm = o.name || o.type; while (p.parent && p.parent !== W.__scene) { p = p.parent; nm = (p.name || p.type) + '/' + nm; } return nm.replace(/\d+/g, '#'); };
W.__boundsAudit = ({ R = 400, tol = 0.25 } = {}) => {
  const cam = W.__camera.position, bad = [], sp = new THREE.Sphere();
  let n = 0;
  W.__scene.traverseVisible(o => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.frustumCulled || !o.geometry?.attributes?.position) return;
    cullSphere(o, sp); if (distS(cam, sp) > R) return;
    n++;
    const v = boundsOver(o);
    if (v > tol) bad.push({ path: pathOf(o), over: +v.toFixed(2), inst: !!o.isInstancedMesh });
  });
  const by = {}; for (const q of bad) by[q.path] = (by[q.path] || 0) + 1;
  return { checked: n, bad: bad.length, by, ex: bad.sort((p, q) => q.over - p.over).slice(0, 8) };
};
W.__yawSweep = (spots = [[650, 1500], [1700, -350], [-2000, 1500], [1560, -140], [1053, -880]], { step = 5, R = 200, toggles = true } = {}) => {
  W.__yawRes = { running: true, spots: [] };
  (async () => {
    const cam = W.__camera, fr = new THREE.Frustum(), sp = new THREE.Sphere(), gl = W.__renderer.getContext();
    for (const [x, z] of spots) {
      W.__teleport(x, z); W.__world.stream.fill(x, z); for (let i = 0; i < 120; i++) W.__frame(1 / 60);
      const y = W.__world.groundAt(x, z, 999) + 1.6, res = { at: [x, z], culledVisible: 0, objs: {}, togglePx: 0, toggleYaws: 0 };
      for (let a = 0; a < 360; a += step) {
        const r = a * Math.PI / 180;
        W.__look(x, y, z, x + Math.sin(r) * 50, y - 2, z - Math.cos(r) * 50);
        W.__frame(1 / 60);
        frustumOf(cam, fr);
        W.__scene.traverseVisible(o => {
          if (!(o.isMesh || o.isPoints || o.isLine) || !o.frustumCulled || !o.geometry?.attributes?.position) return;
          cullSphere(o, sp); if (distS(cam.position, sp) > R) return;
          // a mesh whose stored sphere misses real vertices, culled now while its real bounds are in view
          if (fr.intersectsSphere(sp) || boundsOver(o) <= 0.25) return;
          const b = exactBox(o); if (!b || !fr.intersectsBox(b)) return;
          res.culledVisible++; const nm = pathOf(o); res.objs[nm] = (res.objs[nm] || 0) + 1;
        });
        if (toggles) {
          const a1 = W.__rb ? W.__rb(160, 90) : null; W.__frame(1 / 60); const a2 = W.__rb ? W.__rb(160, 90) : null; W.__frame(1 / 60); const a3 = W.__rb ? W.__rb(160, 90) : null;
          if (a1) { let n = 0; for (let i = 0; i < a1.length; i++) if (Math.abs(a2[i] - a1[i]) > 40 && Math.abs(a3[i] - a2[i]) > 40) n++; res.togglePx += n; if (n > 3) res.toggleYaws++; }
        }
        await new Promise(r2 => setTimeout(r2, 0));
      }
      W.__look(null);
      W.__yawRes.spots.push(res);
    }
    W.__yawRes.running = false;
  })();
  return 'started';
};
