// Wet-street planar mirror for the Chinatown hero streets (Grant Ave + the hero side streets, src/world/landmarks/v2/ct_zone.js).
// In rain, the street run under the camera gets a mirror plane fitted to its road surface (least squares along the run,
// eased so it never jumps); the hero blocks' cheap LOD1 meshes (lanterns, signs, lit windows, facades) are rendered from
// the mirrored camera into a reduced-resolution target (alpha = coverage) with an oblique near plane at the road. The
// wet-reflection pass (post.js) samples it for road pixels within the run's carriageway, perturbed by its ripple normal
// and blurred by the same puddle / film masks as the SSR, and keeps the screen-space result wherever the mirror is empty
// (other buildings, cars). So lanterns / neon above or behind the camera still reflect. No per-frame popping: the
// plane eases, switching runs cross-fades, and the layer set is fixed.
// createStreetMirror({ renderer, scene, segs, groundAt, sites: () => heroSites, scale }) -> { render(camera), U, info }
import * as THREE from 'three';
import { HB_WET } from './fog.js';

export const CT_MIRROR_LAYER = 6;

function buildRuns(segs) {
  // chain segments of the same street that continue each other (shared end point, < 7 deg turn) into straight runs
  const runs = [];
  const used = new Set();
  const dir = (s) => { const dx = s[2][0] - s[1][0], dz = s[2][1] - s[1][1], L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L, L]; };
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const run = [i]; used.add(i);
    for (const fwd of [true, false]) {
      let cur = i;
      for (;;) {
        const c = segs[cur], dc = dir(c), end = fwd ? c[2] : c[1];
        let nx = -1;
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j) || segs[j][0] !== c[0]) continue;
          const s = segs[j], st = fwd ? s[1] : s[2], ds = dir(s);
          if (Math.hypot(st[0] - end[0], st[1] - end[1]) > 0.6) continue;
          if (dc[0] * ds[0] + dc[1] * ds[1] < Math.cos(7 * Math.PI / 180)) continue;
          nx = j; break;
        }
        if (nx < 0) break;
        used.add(nx); fwd ? run.push(nx) : run.unshift(nx); cur = nx;
      }
    }
    const a = segs[run[0]][1], b = segs[run[run.length - 1]][2];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 8) continue;
    runs.push({ name: segs[i][0], a, b, ux: dx / L, uz: dz / L, L, hw: segs[i][3] / 2 });
  }
  return runs;
}

export function createStreetMirror({ renderer, scene, segs, groundAt, sites, scale = 0.5, samples = 0 }) {
  const runs = buildRuns(segs);
  // (road 2) 0.85 x the drawing buffer + 4x MSAA on high (was 0.5, no AA: stair-stepped, blocky lantern reflections)
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples });
  const cam = new THREE.PerspectiveCamera();
  cam.layers.set(CT_MIRROR_LAYER);
  const U = {
    tMirror: { value: rt.texture }, uMirMat: { value: new THREE.Matrix4() }, uMirOn: { value: 0 },
    uMirPlane: { value: new THREE.Vector4(0, 1, 0, 0) },           // n.xyz, d (n.p + d = 0)
    uMirBox: { value: new THREE.Vector4() },                       // centre x, z, axis x, z
    uMirExt: { value: new THREE.Vector2() },                       // half length, half width
  };
  const info = { run: null, renders: 0, ms: 0, slope: 0 };
  const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _o = new THREE.Vector3();
  const _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), size = new THREE.Vector2(), _cc = new THREE.Color();
  // eased plane state
  const P = { run: null, s0: 0, y0: 0, k: 0, on: 0, init: false };
  const lightsSeen = new Set(); let tagT = 0;

  function fit(run, sc, fwd) {
    // least squares y = y0 + k (s - sc) over the run from 12 m behind to 55 m ahead of the camera's station (view side)
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    const sa = fwd > 0 ? sc - 12 : sc - 55, sb = fwd > 0 ? sc + 55 : sc + 12;
    for (let s = Math.max(0, sa); s <= Math.min(run.L, sb); s += 3) {
      const x = run.a[0] + run.ux * s, z = run.a[1] + run.uz * s, y = groundAt(x, z);
      if (!isFinite(y)) continue;
      const d = s - sc; n++; sx += d; sy += y; sxx += d * d; sxy += d * y;
    }
    if (n < 3) return null;
    const k = (n * sxy - sx * sy) / Math.max(1e-6, n * sxx - sx * sx), y0 = (sy - k * sx) / n;
    return { y0, k };
  }

  function pickRun(cx, cz) {
    let best = null, bd = 1e9;
    for (const r of runs) {
      const s = (cx - r.a[0]) * r.ux + (cz - r.a[1]) * r.uz;
      if (s < -6 || s > r.L + 6) continue;
      const d = Math.abs((cx - r.a[0]) * r.uz - (cz - r.a[1]) * r.ux);
      if (d < r.hw + 6 && d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function tag() {
    const S = sites?.() || [];
    for (const s of S) {
      if (!(s.ct || s.id === 'ct_gate') || !s.lod?.[1] || s.lod[1].userData.ctMir) continue;
      s.lod[1].traverse(o => { if (o.isMesh && o.name !== 'clear') o.layers.enable(CT_MIRROR_LAYER); });
      s.lod[1].userData.ctMir = true;
    }
    scene.traverse(o => {
      if (lightsSeen.has(o)) return;
      // lights, and (round 2) the cars: parked instances + traffic / player bodies, so the street under a car reflects the
      // car (dark) instead of the lit facades behind it (cars read as floating over a bright mirror)
      if (o.isLight || (o.isInstancedMesh && /^props2:parked/.test(o.name)) || (o.isMesh && /^car:/.test(o.parent?.name || ''))) { o.layers.enable(CT_MIRROR_LAYER); lightsSeen.add(o); }
    });
  }

  function render(camera, dt = 1 / 60) {
    const wet = HB_WET.x > 0.04;
    camera.updateMatrixWorld();
    _p.setFromMatrixPosition(camera.matrixWorld);
    const run = wet ? pickRun(_p.x, _p.z) : null;
    // cross-fade: fade out before switching runs, fade in on the new one
    if (!P.run && run) { P.run = run; P.init = false; }
    const target = run && P.run === run ? 1 : 0;
    P.on += Math.sign(target - P.on) * Math.min(Math.abs(target - P.on), dt * 4);
    if (P.on <= 0.001 && run !== P.run) { P.run = run; P.init = false; }
    U.uMirOn.value = P.on * P.on * (3 - 2 * P.on);
    info.run = P.run?.name || null;
    if (!P.run || U.uMirOn.value <= 0.001) return false;
    const r = P.run, sc = (_p.x - r.a[0]) * r.ux + (_p.z - r.a[1]) * r.uz;
    camera.getWorldDirection(_t); const fwd = _t.x * r.ux + _t.z * r.uz >= 0 ? 1 : -1;
    const f = fit(r, sc, fwd);
    if (!f) return false;
    // ease the plane (in absolute terms: height at the camera's station and slope)
    const yAt = f.y0;
    if (!P.init) { P.y0 = yAt; P.k = f.k; P.s0 = sc; P.init = true; }
    else { const a = 1 - Math.exp(-dt * 6); P.y0 += (yAt + (sc - P.s0) * 0 - P.y0) * a; P.k += (f.k - P.k) * a; }
    P.s0 = sc; info.slope = P.k;
    // plane through (camera station on the run axis, y0) containing the axis direction (ux, k, uz) and the lateral
    const ox = r.a[0] + r.ux * sc, oz = r.a[1] + r.uz * sc;
    _o.set(ox, P.y0 + 0.02, oz);
    _v.set(r.ux, P.k, r.uz).normalize(); _t.set(-r.uz, 0, r.ux);
    _n.crossVectors(_v, _t).normalize(); if (_n.y < 0) _n.negate();
    U.uMirPlane.value.set(_n.x, _n.y, _n.z, -_n.dot(_o));
    U.uMirBox.value.set(ox + r.ux * 30 * fwd, oz + r.uz * 30 * fwd, r.ux, r.uz);
    U.uMirExt.value.set(75, r.hw + 0.4);
    if (_n.dot(_v.copy(_p).sub(_o)) <= 0.05) return false;      // camera under the plane (tunnel / deck): skip
    // mirrored camera (three Reflector construction about an arbitrary plane)
    renderer.getDrawingBufferSize(size);
    const w = Math.max(4, Math.round(size.x * api.scale)), h = Math.max(4, Math.round(size.y * api.scale));
    if (rt.samples !== api.samples) { rt.dispose(); rt.samples = api.samples; }     // tunable at runtime (perf A/B)
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    _v.subVectors(_o, _p).reflect(_n).negate().add(_o);
    _rot.extractRotation(camera.matrixWorld);
    _t.set(0, 0, -1).applyMatrix4(_rot).add(_p);
    const tgt = new THREE.Vector3().subVectors(_o, _t).reflect(_n).negate().add(_o);
    cam.position.copy(_v);
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    cam.lookAt(tgt);
    cam.near = camera.near; cam.far = Math.min(camera.far, 600);
    cam.fov = camera.fov; cam.aspect = camera.aspect; cam.zoom = camera.zoom;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    U.uMirMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _o).applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pe = cam.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pe[8]) / pe[0]; _q.y = (Math.sign(_clip.y) + pe[9]) / pe[5]; _q.z = -1; _q.w = (1 + pe[10]) / pe[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pe[2] = _clip.x; pe[6] = _clip.y; pe[10] = _clip.z + 1; pe[14] = _clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    if ((tagT -= dt) <= 0) { tag(); tagT = 1; }
    // draw the hero blocks' LOD1 (cheap, always resident) for the mirror; restore visibility after
    const S = sites?.() || [], vis = [];
    for (const s of S) if ((s.ct || s.id === 'ct_gate') && s.live && s.lod?.[1]) { vis.push(s, s.lod[1].visible, s.group.visible); s.lod[1].visible = true; s.group.visible = true; }
    const t0 = performance.now();
    const prevRT = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate, prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_cc);
    const prevMW = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = false;
    const bg = scene.background; scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.autoClear = true; renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(scene, cam);
    scene.background = bg; scene.matrixWorldAutoUpdate = prevMW;
    renderer.setClearColor(_cc, prevAlpha); renderer.shadowMap.autoUpdate = prevShadow; renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevRT);
    for (let i = 0; i < vis.length; i += 3) { vis[i].lod[1].visible = vis[i + 1]; vis[i].group.visible = vis[i + 2]; }
    info.renders++; info.ms = performance.now() - t0;
    return true;
  }
  const api = { render, U, info, runs, scale, samples, dispose() { rt.dispose(); } };
  return api;
}
