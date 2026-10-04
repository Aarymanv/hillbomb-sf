// People round 2 shots (props, far crowds, car entry / knockdown animation). In the game page (?play&foot&mute&tiles=0):
//   await import('http://127.0.0.1:5190/dev/peds2_shots.js'); await __p2All('after')
// -> shots/peds2_<closeup_phone|umbrella_rain|crowd_far>_<suf>.jpg and frame strips
//    shots/peds2_<enter_car|exit_car|knockdown|jump>_<suf>_<k>.jpg (dev/peds2_sheet.py stitches strips + sheet)
(() => {
  const W = window;
  // one throwing frame (another module's bug) must not abort a capture run: step frames one by one and log the error
  if (!W.__framesRaw) { W.__framesRaw = W.__frames; W.__frames = (n = 1, dt) => { for (let i = 0; i < n; i++) { try { W.__framesRaw(1, dt); } catch (e) { W.__frameErr = (e.stack || e.message).slice(0, 300); } } }; }
  const G = () => W.__G;
  const isect = (a, b) => W.__G.world.graph.intersection(a, b);
  const US = { get x() { return isect('Powell Street', 'Geary Street').x + 6; }, get z() { return isect('Powell Street', 'Geary Street').z + 30; } };   // Union Square (Powell / Geary)
  const freezePeds = () => { const P = G().peds; if (!P._upd) { P._upd = P.update; P.update = () => {}; } };
  const thawPeds = () => { const P = G().peds; if (P._upd) { P.update = P._upd; P._upd = null; } };
  const prep = async (h, wx = 'clear', at = US, frames = 500) => {
    if (G().state === 'title') document.querySelector('.modebtn')?.click();
    thawPeds();
    W.__manual = true; W.__setWx?.(wx); W.__env.state.hours = h; W.__env.state.paused = true;
    W.__look(null);
    W.__teleport(at.x, at.z, { foot: true });
    await W.__settle?.();
    for (const q of G().peds.list) { q.fear = 0; q.hurry = 0; }   // calm the crowd after an earlier knock test
    W.__frames(frames);
  };
  const clearTo = (q, cx, cy, cz) => !W.__pedClear || (W.__pedClear(cx, cy, cz, q.x, q.y + 1.3, q.z) && W.__pedClear(cx, cy, cz, q.x, q.y + 0.5, q.z));
  // a visible, calm walker near the player with a clear view from (front dist, side, height)
  const pick = (filter, dist = 2.2, side = 0.5, hgt = 1.55) => {
    const pl = W.__player.pos;
    const L = G().peds.list.filter(q => !q.tb && q.fear <= 0 && q.human?.root.visible && q.human.mesh && (!filter || filter(q)))
      .sort((u, v) => Math.hypot(u.x - pl.x, u.z - pl.z) - Math.hypot(v.x - pl.x, v.z - pl.z));
    for (const q of L.slice(0, 60)) {
      const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw);
      const cx = q.x + fx * dist + fz * side, cz = q.z + fz * dist - fx * side, cy = q.y + hgt;
      if (clearTo(q, cx, cy, cz)) return { q, cam: [cx, cy, cz] };
    }
    return null;
  };
  W.__p2Phone = async (suf, h = 20.6) => {
    await prep(h);
    const r = pick(q => q.style !== 'jogger', 1.25, 0.35, 1.5); if (!r) throw new Error('no ped');
    const q = r.q, hm = q.human;
    freezePeds();
    hm._force = { state: 'phone', speed: 0 };
    for (let i = 0; i < 90; i++) { hm.update(1 / 60, hm._last || {}); W.__frames(1); }
    const aim = () => W.__look(...r.cam, q.x, q.y + 1.3, q.z);
    W.__player.human.setVisible(false); aim(); W.__frames(1); aim();
    const out = await W.__shot(`peds2_closeup_phone_${suf}`, 1280, 720);
    hm._force = null; W.__player.human.setVisible(true); thawPeds();
    return out;
  };
  // carried props: one frame per kind (cup, bag, case, furled umbrella in a drizzle)
  W.__p2Carry = async (suf, h = 14) => {
    await prep(h, 'clear', US, 300);
    const out = [];
    for (const kind of ['cup', 'bag', 'case']) {
      const r = pick(q => q.carry === kind && q.mode !== 'stand', 2.6, 0.9, 1.5); if (!r) continue;
      const q = r.q, aim = () => W.__look(...r.cam, q.x, q.y + 1.0, q.z);
      W.__player.human.setVisible(false); aim(); W.__frames(1); aim();
      out.push(await W.__shot(`peds2_carry_${suf}_${out.length}`, 640, 400));
    }
    W.__player.human.setVisible(true);
    return out;
  };
  W.__p2Umbrella = async (suf, h = 16.5) => {
    await prep(h, 'rain');
    W.__frames(200);
    const r = pick(q => q.human.umbW > 0.5 && q.mode !== 'stand', 3.6, 0.9, 1.75) || pick(q => q.human.umbW > 0.5, 3.6, 0.9, 1.75); if (!r) throw new Error('no umbrella ped');
    const q = r.q, aim = () => W.__look(...r.cam, q.x, q.y + 1.35, q.z);
    W.__player.human.setVisible(false); aim(); W.__frames(1); aim();
    const out = await W.__shot(`peds2_umbrella_rain_${suf}`, 1280, 720);
    W.__player.human.setVisible(true);
    return out;
  };
  // best telephoto street view near (x0, z0): road-centre cameras 4 m up looking along each street, scored by the far-crowd
  // impostors (150-450 m) inside the 28-deg view with a clear line of sight
  W.__p2CrowdFind = (x0, z0, R = 260) => {
    const g = G().peds.crowd.mesh.geometry, a = g.attributes.aP.array, n = g.instanceCount;
    const edges = G().world.graph.edges.filter(e => e.pts.some(p => Math.hypot(p[0] - x0, p[1] - z0) < R));
    let best = null;
    for (const e of edges) {
      for (let k = 0; k < e.pts.length - 1; k += 2) {
        const p = e.pts[k], q = e.pts[k + 1]; let dx = q[0] - p[0], dz = q[1] - p[1]; const L = Math.hypot(dx, dz); if (L < 20) continue; dx /= L; dz /= L;
        for (const s of [1, -1]) {
          const cx = (p[0] + q[0]) / 2, cz = (p[1] + q[1]) / 2, cy = W.__world.groundAt(cx, cz, 999) + 4;
          let c = 0;
          for (let i = 0; i < n; i += 2) {
            const ax = a[i * 4] - cx, az = a[i * 4 + 2] - cz, d = Math.hypot(ax, az);
            if (d < 150 || d > 450 || (ax * dx * s + az * dz * s) / d < 0.975) continue;
            if (W.__pedClear(cx, cy, cz, a[i * 4], a[i * 4 + 1] + 1.2, a[i * 4 + 2])) c++;
          }
          if (!best || c > best.c) best = { c, cx, cy, cz, dx: dx * s, dz: dz * s, name: e.name };
        }
      }
    }
    return best;
  };
  // telephoto (28 deg) street view of the far crowd near Union Square / Market St: view = { cx, cy, cz, dx, dz } or found by
  // __p2CrowdFind (the chosen view is kept in window.__p2CrowdView so the ?nocrowd 'before' run can reuse it)
  W.__p2Crowd = async (suf, h = 13.5, view = W.__p2CrowdView) => {
    const A = isect('Powell Street', 'Market Street') || isect('Market Street', '5th Street');
    await prep(h, 'clear', { x: A.x + 4, z: A.z - 4 }, 400);
    // default: a drone view 26 m over Powell St at Bush looking south over Union Square (crowd 150-400 m out)
    const U0 = isect('Powell Street', 'Bush Street'), T0 = isect('Powell Street', 'Ellis Street');
    let v = view;
    if (!v) { const dx = T0.x - U0.x, dz = T0.z - U0.z, L = Math.hypot(dx, dz); v = { cx: U0.x, cz: U0.z, cy: W.__world.groundAt(U0.x, U0.z, 999) + 26, dx: dx / L, dz: dz / L, down: 60 }; }
    W.__teleport(v.cx - v.dx * 3, v.cz - v.dz * 3, { foot: true }); await W.__settle?.(); W.__frames(450);
    const tx = v.cx + v.dx * 400, tz = v.cz + v.dz * 400, ty = W.__world.groundAt(tx, tz, 999) + 1.5 - (v.down || 0);
    W.__player.human.setVisible(false);
    G().cameraOverride = { update(cam) { cam.position.set(v.cx, v.cy, v.cz); cam.lookAt(tx, ty, tz); cam.fov = v.down ? 42 : 28; cam.updateProjectionMatrix(); } };
    W.__frames(30);
    const out = await W.__shot(`peds2_crowd_far_${suf}`, 1280, 720);
    G().cameraOverride = null;
    W.__player.human.setVisible(true);
    return out + ' ' + JSON.stringify(v);
  };
  // the player enters / leaves a car: frame strip from a fixed side camera
  const carCam = (v, back = 4.2, side = -3.6, hgt = 1.7) => {
    const b = v.body, o = v.root.position, yaw = b.yaw();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cx = o.x - fx * back + rx * side, cz = o.z - fz * back + rz * side;
    return [cx, o.y + hgt, cz, o.x + rx * -1.2 + fx * 0.3, o.y + 0.9, o.z + rz * -1.2 + fz * 0.3];
  };
  const parkedCar = () => {
    const pl = W.__player.pos;
    const vs = G().vehicles().filter(v => v.body && !v.driver && v.role !== 'cablecar' && v.body.speed < 0.5)
      .sort((a, b) => a.root.position.distanceTo(pl) - b.root.position.distanceTo(pl));
    return vs[0] || G().vehicles().filter(v => v.body && v.role !== 'cablecar' && v.role !== 'player')[0];
  };
  W.__p2Car = async (suf, times = [0.15, 0.4, 0.7, 1.0, 1.4], h = 14) => {
    await prep(h, 'clear', US, 200);
    const P = W.__player;
    let v = P.vehicle || parkedCar(); if (!v) throw new Error('no car');
    if (P.vehicle) P.exitVehicle(true);
    // stand 3 m off the driver door, facing it
    const b = v.body, yaw = b.yaw(), rx = Math.cos(yaw), rz = -Math.sin(yaw), o = v.root.position;
    P.pos.set(o.x - rx * (v.spec.width / 2 + 1.6), o.y, o.z - rz * (v.spec.width / 2 + 1.6)); P.yaw = yaw - Math.PI / 2;
    W.__frames(20);
    const cam = carCam(v); W.__look(...cam);
    const tag = `peds2_enter_car_${suf}`, out = [];
    P.tryEnter ? P.tryEnter() : Object.assign(P, { enterT: 0.55, enterCar: v });
    let t = 0;
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } out.push(await W.__shot(`${tag}_${out.length}`, 640, 400)); }
    // and out again
    W.__frames(60);
    const tag2 = `peds2_exit_car_${suf}`, out2 = [];
    P.exitVehicle(true); t = 0;
    for (const T of [0.05, ...times.slice(1)]) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } W.__look(...cam); out2.push(await W.__shot(`${tag2}_${out2.length}`, 640, 400)); }
    W.__look(null);
    return [out, out2];
  };
  // a pedestrian is hit at 13 m/s from the side: ragdoll + get up, fixed camera
  W.__p2Knock = async (suf, times = [0.12, 0.35, 0.8, 1.6, 2.6, 3.4, 4.2], h = 14) => {
    await prep(h, 'clear', US, 400);
    const r = pick(q => q.mode !== 'stand' && q.fixedY == null, 6, 4, 1.6); if (!r) throw new Error('no ped');
    const q = r.q, fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw);
    const cam = [q.x + fx * 7 + fz * 4, q.y + 2.0, q.z + fz * 7 - fx * 4];
    const tx = q.x + fz * 2.5, tz = q.z - fx * 2.5;
    W.__look(...cam, tx, q.y + 0.6, tz); W.__player.human.setVisible(false);
    G().peds.debugKnock(q, 9, fz, -fx);
    const out = []; let t = 0;
    // camera follows from 5.5 m, side-on to the throw
    const follow = () => { const r = q.human.root.position; W.__look(r.x + fx * 5 - fz * 1.5, r.y + 3.2, r.z + fz * 5 + fx * 1.5, r.x, r.y + 0.4, r.z); };
    for (const T of times) { while (t < T - 1e-6) { follow(); W.__frames(1); t += 1 / 60; } follow(); out.push(await W.__shot(`peds2_knockdown_${suf}_${out.length}`, 640, 400)); }
    W.__player.human.setVisible(true);
    return out;
  };
  // the player jumps (on foot): strip
  W.__p2Jump = async (suf, times = [0.05, 0.2, 0.4, 0.6, 0.85], h = 14) => {
    await prep(h, 'clear', US, 100);
    const P = W.__player;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const cam = [P.pos.x - fz * 3.6 + fx * 1, P.pos.y + 1.3, P.pos.z + fx * 3.6 + fz * 1];
    W.__look(...cam, P.pos.x, P.pos.y + 1.2, P.pos.z);
    await W.__studio(true, [P.human.root], P.pos.y);
    P.vel.y = 5.2; P.grounded = false; P.jumpT = 0.3;
    const out = []; let t = 0;
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } out.push(await W.__shot(`peds2_jump_${suf}_${out.length}`, 640, 400)); }
    await W.__studio(false);
    return out;
  };
  // dev: 'studio' = only lights + the given roots + a grey floor at height y (clean animation previews)
  W.__studio = async (on, roots = [], y = 0) => {
    const S = W.__scene;
    if (on) {
      const THREE = await import('http://127.0.0.1:5190/node_modules/three/build/three.module.js');
      W.__studioVis = S.children.map(o => [o, o.visible]);
      for (const o of S.children) if (!o.isLight && !roots.includes(o)) o.visible = false;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 }));
      g.position.set(W.__player.pos.x, y, W.__player.pos.z); g.receiveShadow = true; g.name = '__studioFloor'; S.add(g); W.__studioFloor = g;
    } else if (W.__studioVis) {
      for (const [o, v] of W.__studioVis) o.visible = v; W.__studioVis = null;
      if (W.__studioFloor) { S.remove(W.__studioFloor); W.__studioFloor = null; }
    }
  };
  // dev: frame strip of one clip on the player's human (side view, az = camera azimuth from the facing in rad)
  W.__clipStrip = async (clip, times = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], az = Math.PI / 2, rate = 1, dist = 4) => {
    W.__manual = true;
    const P = W.__player, h = P.human, out = [];
    const yaw = P.yaw + az, cx = P.pos.x - Math.sin(yaw) * dist, cz = P.pos.z - Math.cos(yaw) * dist;
    W.__look(cx, P.pos.y + 1.3, cz, P.pos.x, P.pos.y + 0.7, P.pos.z);
    h._force = { clip: '__none' }; W.__frames(2);
    h._force = { clip, rate }; let t = 0;
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } out.push(await W.__shot(`clip_${clip}_${out.length}`, 480, 400)); }
    h._force = null; W.__look(null);
    return out;
  };
  // studio checks (only the player, one car, a floor): car entry / exit + player knockdown, big frames
  W.__p2StudioCar = async (suf, times = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5]) => {
    await prep(13, 'clear', US, 60);
    const P = W.__player;
    let v = P.vehicle || parkedCar(); if (P.vehicle) P.exitVehicle(true);
    const b = v.body, yaw = b.yaw(), rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw), o = v.root.position;
    P.pos.set(o.x - rx * (v.spec.width / 2 + 1.2), o.y, o.z - rz * (v.spec.width / 2 + 1.2)); P.yaw = yaw - Math.PI / 2;
    W.__frames(5);
    await W.__studio(true, [P.human.root, v.root], o.y);
    const cam = [o.x - rx * 3.4 + fx * 1.4, o.y + 1.5, o.z - rz * 3.4 + fz * 1.4, o.x - rx * 0.6, o.y + 0.8, o.z - rz * 0.6];
    W.__look(...cam);
    const out = []; let t = 0;
    P.tryEnter();
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } out.push(await W.__shot(`peds2_senter_${suf}_${out.length}`, 640, 400)); }
    W.__frames(60); t = 0;
    P.exitVehicle();
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } W.__look(...cam); out.push(await W.__shot(`peds2_sexit_${suf}_${out.length - times.length}`, 640, 400)); }
    await W.__studio(false); W.__look(null);
    return out.length;
  };
  W.__p2StudioKnock = async (suf, times = [0.05, 0.2, 0.4, 0.7, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]) => {
    await prep(13, 'clear', US, 60);
    const P = W.__player;
    await W.__studio(true, [P.human.root], P.pos.y);
    const yaw = P.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const c0 = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
    const cam = [c0.x + fx * 6 - fz * 2, c0.y + 2.2, c0.z + fz * 6 + fx * 2, c0.x - fz * 2, c0.y + 0.4, c0.z + fx * 2];
    W.__look(...cam);
    P.knock({ x: -fz * 9, y: 0, z: fx * 9 }, 9);   // hit from the left side
    const out = []; let t = 0;
    for (const T of times) { while (t < T - 1e-6) { W.__frames(1); t += 1 / 60; } out.push(await W.__shot(`peds2_sknock_${suf}_${out.length}`, 640, 400)); }
    W.__frames(240);
    await W.__studio(false); W.__look(null);
    return out.length;
  };
  W.__p2All = async (suf) => {
    const o = [];
    for (const f of ['__p2Phone', '__p2Umbrella', '__p2Crowd', '__p2Car', '__p2Knock', '__p2Jump']) {
      try { o.push(await W[f](suf)); } catch (e) {   // the first teleport after boot sometimes throws inside world streaming: retry once
        try { o.push(await W[f](suf)); } catch (e2) { o.push(f + ' ERR ' + e2.message + ' ' + (e2.stack || '').split('\n').slice(1, 4).join(' ')); }
      }
    }
    W.__setWx?.('clear'); W.__look(null);
    return o;
  };
})();
