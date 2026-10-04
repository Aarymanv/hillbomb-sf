// Pedestrian before/after shots. In the game page (?play&foot):
//   await import('http://127.0.0.1:5190/dev/ped_shots.js'); await __pedAll('after')
//   -> shots/peds_<unionsq|chinatown|mission|closeup|night|onfoot>_<suf>.jpg
// __pedPerf(name, n) -> mean ms of the ped system + full frame over n manual frames at that spot.
const { Raycaster } = await import('http://127.0.0.1:5190/node_modules/three/build/three.module.js');
(() => {
  const W = window;
  const V = W.PED_VIEWS = {
    unionsq:   { a: ['Powell Street', 'Geary Street'], b: ['Powell Street', "O'Farrell Street"], t: 0.35, h: 13.5 },
    chinatown: { a: ['Grant Avenue', 'Clay Street'], b: ['Grant Avenue', 'Washington Street'], t: 0.4, h: 13 },
    mission:   { a: ['Mission Street', '22nd Street'], b: ['Mission Street', '23rd Street'], t: 0.4, h: 15 },
  };
  // line of sight from (ax,ay,az) to (bx,by,bz) against world meshes near the segment (peds, player, grass ignored)
  const _rc = { ray: null };
  W.__pedClear = (ax, ay, az, bx, by, bz) => {
    const S = W.__scene, peds = S.getObjectByName('peds'), ph = W.__player.human.root;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (!_rc.list || _rc.t !== W.__G.time) {
      _rc.list = []; _rc.t = W.__G.time;
      S.traverseVisible(o => {
        if (!o.isMesh || o.isSkinnedMesh || o.userData._noRay || (o.isInstancedMesh && o.count > 3000) || o.material?.transparent) return;
        let x = o; while (x) { if (x === peds || x === ph) return; x = x.parent; }
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _rc.list.push(o);
      });
    }
    const near = [];
    for (const o of _rc.list) {
      const bs = o.geometry.boundingSphere, e = o.matrixWorld.elements;
      const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      const cx = bs.center.x * e[0] + bs.center.y * e[4] + bs.center.z * e[8] + e[12];
      const cy = bs.center.x * e[1] + bs.center.y * e[5] + bs.center.z * e[9] + e[13];
      const cz = bs.center.x * e[2] + bs.center.y * e[6] + bs.center.z * e[10] + e[14];
      const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / (len * len)));
      const qx = ax + dx * t - cx, qy = ay + dy * t - cy, qz = az + dz * t - cz;
      if (qx * qx + qy * qy + qz * qz < (bs.radius * sc + 0.3) ** 2) near.push(o);
    }
    if (!near.length) return true;
    const rc = _rc.ray || (_rc.ray = new Raycaster());
    rc.set(rc.ray.origin.set(ax, ay, az), rc.ray.direction.set(dx / len, dy / len, dz / len));
    rc.far = len - 0.4; rc.near = 0.2;
    for (const o of near) { try { if (rc.intersectObject(o, false).length) return false; } catch (e) { o.userData._noRay = 1; } }
    return true;
  };
  const isect = (a) => W.__G.world.graph.intersection(...a);
  const place = (v) => {
    const A = isect(v.a), B = isect(v.b);
    if (!A || !B) throw new Error('no intersection ' + v.a + ' / ' + v.b);
    let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    return { x: A.x + dx * L * v.t, z: A.z + dz * L * v.t, dx, dz, L };
  };
  const prep = async (v, foot = true, side = 7) => {
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = v.h; W.__env.state.paused = true;
    const p = place(v);
    W.__look(null);
    W.__teleport(p.x - p.dz * side, p.z + p.dx * side, { foot, yaw: Math.atan2(-p.dx, -p.dz) });
    await W.__settle?.();
    W.__frames(W.__prepFrames || 600);  // crowd fills + walks in
    return p;
  };
  // street view: on the sidewalk edge, eye height, looking along the street
  W.__pedShot = async (name, suf) => {
    const v = V[name], p = await prep(v);
    const g = W.__world.groundAt ? W.__world.groundAt(p.x, p.z) : W.__world.heightAt(p.x, p.z);
    // frame the busiest clear sidewalk view: from walkers near the spot, a camera 10 m ahead of the walker looking back
    // along its line; score = people within 45 m in a +-28 deg cone with a clear line of sight (raycast vs. the world)
    const L = W.__G.peds.list.filter(q => q.human?.root.visible && !q.tb);
    let best = null, bc = -1, bcam = null;
    const cands = L.filter(q => q.fear <= 0 && q.mode !== 'stand' && q.spd > 0.5 && Math.hypot(q.x - p.x, q.z - p.z) < 90)
      .sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z)).slice(0, 14);
    for (const q of cands) {
      const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw);
      for (const lat of [1.4, -1.4, 0]) {
        const cx = q.x + fx * 9 - fz * lat, cz = q.z + fz * 9 + fx * lat, cy = W.__world.heightAt(cx, cz) + 2.7;   // raised: over bins / cars
        const ne = W.__G.world.graph.nearestEdge(cx, cz, 30); if (!ne || Math.hypot(ne.x - cx, ne.z - cz) > 7.5) continue;   // stay over the street / sidewalk
        if (!W.__pedClear(cx, cy, cz, q.x, q.y + 1.4, q.z)) continue;
        // nothing right in front of the lens (bins, poles, shelters): rays 4.5 m ahead, low / eye level, left / right
        let open = true;
        for (const [ly, lx] of [[-1.6, 0], [-1.6, 1.0], [-1.6, -1.0], [-0.6, 0.9], [-0.6, -0.9]]) {
          if (!W.__pedClear(cx, cy, cz, cx - fx * 4.5 - fz * lx, cy + ly, cz - fz * 4.5 + fx * lx)) { open = false; break; }
        }
        if (!open) continue;
        let c = 0;
        for (const o of L) {
          const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
          if (d > 3 && d < 45 && -(dx * fx + dz * fz) / d > 0.88 && W.__pedClear(cx, cy, cz, o.x, o.y + 1.4, o.z)) c++;
        }
        if (c > bc) { bc = c; best = q; bcam = [cx, cy, cz, cx - fx * 22, cy - 2.4, cz - fz * 22]; }
        break;
      }
    }
    if (bcam && bc >= 3) { W.__look(...bcam); }
    else W.__street(p.x, p.z, { h: 2.4, side: 3.2, ahead: 45 });   // over the parking lane, looking along the street
    W.__pedFrame = { people: bc };
    W.__player.human.setVisible(false);
    W.__frames(2);
    const r = await W.__shot(`peds_${name}_${suf}`, 1280, 720);
    W.__player.human.setVisible(true);
    return r;
  };
  // nearest visible ped, camera ~3 m in front of its face
  W.__pedClose = async (suf, night = false) => {
    const v = { ...V.unionsq, h: night ? 21.5 : 13.5 };
    await prep(v);
    const pl = W.__player.pos;
    const walkers = W.__G.peds.list.filter(q => !q.tb && q.fear <= 0 && q.human?.root.visible && q.mode !== 'stand' && q.spd > 0.6)
      .sort((u, v) => Math.hypot(u.x - pl.x, u.z - pl.z) - Math.hypot(v.x - pl.x, v.z - pl.z));
    let best = null, fx = 0, fz = 0;
    for (const q of walkers.slice(0, 20)) {
      fx = -Math.sin(q.yaw); fz = -Math.cos(q.yaw);
      const cx = q.x + fx * 3 + fz * 0.6, cz = q.z + fz * 3 - fx * 0.6, cy = q.y + 1.6;
      if (W.__pedClear(cx, cy, cz, q.x, q.y + 1.3, q.z) && W.__pedClear(cx, cy, cz, q.x, q.y + 0.4, q.z)) { best = q; break; }
    }
    if (!best) throw new Error('no ped');
    const aim = () => W.__look(best.x + fx * 3 + fz * 0.6, best.y + 1.6, best.z + fz * 3 - fx * 0.6, best.x, best.y + 1.2, best.z);
    const ph = W.__player.human; ph.setVisible(false);
    aim(); W.__frames(1); aim();
    const r = await W.__shot(`peds_${night ? 'night' : 'closeup'}_${suf}`, 1280, 720);
    ph.setVisible(true);
    return r;
  };
  W.__pedOnFoot = async (suf) => {
    await prep(V.unionsq, true, 6);
    W.__look(null);
    W.__frames(30);
    return W.__shot(`peds_onfoot_${suf}`, 1280, 720);
  };
  W.__pedAll = async (suf) => {
    const out = [];
    for (const n of Object.keys(V)) out.push(await W.__pedShot(n, suf));
    out.push(await W.__pedClose(suf, false));
    out.push(await W.__pedClose(suf, true));
    out.push(await W.__pedOnFoot(suf));
    return out;
  };
  // frame-time probe: mean ms of the ped system and of a whole manual frame (logic + render)
  W.__pedPerf = async (name, n = 240) => {
    await prep(V[name]);
    const p = place(V[name]);
    const sx = p.x - p.dz * 7.2, sz = p.z + p.dx * 7.2, y = W.__world.heightAt(sx, sz) + 1.65;
    W.__look(sx - p.dx * 6, y + 0.4, sz - p.dz * 6, sx + p.dx * 30, y - 0.6, sz + p.dz * 30);
    W.__frames(60);
    const st = W.__G.peds.stats; let ped = 0;
    const gl = W.__renderer.getContext();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { W.__frames(1); ped += st.ms; }
    gl.finish();
    const t = performance.now() - t0;
    // render-only A/B (logic paused): peds group shown vs hidden, interleaved blocks -> GPU + draw cost of the crowd
    const G = W.__G, grp = W.__scene.getObjectByName('peds'), was = G.paused;
    G.paused = true; let on = 0, off = 0; const m = 20;
    for (let k = 0; k < 6; k++) for (const vis of [true, false]) {
      grp.visible = vis; W.__frames(2); gl.finish(); const t1 = performance.now();
      for (let i = 0; i < m; i++) W.__frames(1);
      gl.finish(); const d = performance.now() - t1; if (vis) on += d; else off += d;
    }
    grp.visible = true; G.paused = was;
    const res = { name, peds: st.active, visible: st.visible, pedMs: +(ped / n).toFixed(3), frameMs: +(t / n).toFixed(2),
      renderOn: +(on / (6 * m)).toFixed(2), renderOff: +(off / (6 * m)).toFixed(2), pedRenderMs: +((on - off) / (6 * m)).toFixed(2) };
    (W.__perfRes ||= []).push(res);
    return res;
  };
})();
