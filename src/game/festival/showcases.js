// Showcase opponents (virtual racers for the race runtime):
//   jets  - "Bay Blades" display team: three original jets flying a scripted waterfront path with smoke trails
//   fog   - Karl the Fog: a rolling wall of cloud chasing you down Twin Peaks (a "catcher": it wins by reaching you)
//   boat  - a foiling racing catamaran on the bay
// Each exposes { name, color, P, done, time, tagTarget, pos, setup, update, cleanup, reveal? } for racing.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ll, snapWater, clamp, routeAt, speedLimits } from './util.js';
import { DIFFICULTY } from './catalog.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();

// ---------------------------------------------------------------- shared: a smooth 3D path (catmull-rom) with arc length
function path3(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal', 0.5);
  const L = curve.getLength();
  return { curve, L, at: (f, out) => curve.getPointAt(clamp(f, 0, 1), out), tan: (f, out) => curve.getTangentAt(clamp(f, 0, 1), out) };
}
function colorGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.index) geo = geo.toNonIndexed();
  return geo;
}

// ---------------------------------------------------------------- jet model (original design, ~14 m, faces -Z)
let jetGeo = null;
function makeJetGeo() {
  if (jetGeo) return jetGeo;
  const parts = [];
  const body = new THREE.CylinderGeometry(0.62, 0.8, 10.5, 12); body.rotateX(Math.PI / 2); parts.push(colorGeo(body, '#1b2a4a'));
  const nose = new THREE.ConeGeometry(0.62, 3.6, 12); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -7.05); parts.push(colorGeo(nose, '#e8e2d4'));
  const noz = new THREE.CylinderGeometry(0.72, 0.6, 1.2, 12); noz.rotateX(Math.PI / 2); noz.translate(0, 0, 5.8); parts.push(colorGeo(noz, '#3a3d44'));
  const canopy = new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); canopy.scale(0.9, 0.8, 2.6); canopy.translate(0, 0.45, -3.6); parts.push(colorGeo(canopy, '#8fc7ff'));
  // delta wing (flat triangle prism)
  const w = new THREE.Shape(); w.moveTo(0, -2.2); w.lineTo(5.6, 3.4); w.lineTo(5.6, 4.2); w.lineTo(0, 4.4); w.lineTo(-5.6, 4.2); w.lineTo(-5.6, 3.4); w.closePath();
  const wing = new THREE.ExtrudeGeometry(w, { depth: 0.18, bevelEnabled: false }); wing.rotateX(Math.PI / 2); wing.translate(0, -0.1, 0); parts.push(colorGeo(wing, '#1b2a4a'));
  // gold leading-edge stripe
  const st = new THREE.Shape(); st.moveTo(0, -2.3); st.lineTo(5.7, 3.3); st.lineTo(5.2, 3.45); st.lineTo(0, -1.7); st.lineTo(-5.2, 3.45); st.lineTo(-5.7, 3.3); st.closePath();
  const stripe = new THREE.ExtrudeGeometry(st, { depth: 0.2, bevelEnabled: false }); stripe.rotateX(Math.PI / 2); stripe.translate(0, -0.08, 0); parts.push(colorGeo(stripe, '#ffc247'));
  // tail fin + tailplanes
  const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(2.6, 0); f.lineTo(3.4, 2.8); f.lineTo(2.2, 2.8); f.closePath();
  const fin = new THREE.ExtrudeGeometry(f, { depth: 0.14, bevelEnabled: false }); fin.rotateY(-Math.PI / 2); fin.translate(0.07, 0.5, 2.4); parts.push(colorGeo(fin, '#ff2e7e'));
  const tp = new THREE.BoxGeometry(4.4, 0.12, 1.4); tp.translate(0, 0.1, 4.6); parts.push(colorGeo(tp, '#1b2a4a'));
  jetGeo = mergeGeometries(parts.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
  jetGeo.computeVertexNormals();
  return jetGeo;
}
// smoke ribbon: a horizontal strip through the last N positions (RGBA vertex colours on a basic material, so the
// engine's height fog applies)
function makeTrail(color, N = 90) {
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4);
  const c = new THREE.Color(color);
  for (let i = 0; i < N * 2; i++) { col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = 0; }
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const hist = [];
  for (let i = 0; i < N; i++) hist.push(new Float32Array(6));
  let count = 0, head = 0;
  return {
    mesh,
    push(p, side) { head = (head + N - 1) % N; const h = hist[head]; h[0] = p.x; h[1] = p.y; h[2] = p.z; h[3] = side.x; h[4] = side.y; h[5] = side.z; count = Math.min(N, count + 1); },
    update() {
      for (let i = 0; i < N; i++) {
        const h = hist[(head + Math.min(i, Math.max(0, count - 1))) % N];
        const w = 0.6 + i * 0.07, rise = i * 0.05;
        pos[i * 6] = h[0] - h[3] * w; pos[i * 6 + 1] = h[1] - h[4] * w + rise; pos[i * 6 + 2] = h[2] - h[5] * w;
        pos[i * 6 + 3] = h[0] + h[3] * w; pos[i * 6 + 4] = h[1] + h[4] * w + rise; pos[i * 6 + 5] = h[2] + h[5] * w;
        const a = i < count ? 0.8 * (1 - i / N) : 0; col[i * 8 + 3] = col[i * 8 + 7] = a;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { count = 0; },
  };
}

// ---------------------------------------------------------------- fog wall
let puffTex = null;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 40, r = 18 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  puffTex = new THREE.CanvasTexture(c); puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

// ---------------------------------------------------------------- catamaran (original design, ~15 m, faces -Z)
let boatGeo = null;
function makeBoatGeo() {
  if (boatGeo) return boatGeo;
  const parts = [];
  for (const sx of [-3.4, 3.4]) {
    const hull = new THREE.CylinderGeometry(0.55, 0.35, 15, 10); hull.rotateX(Math.PI / 2); hull.scale(1, 1.4, 1); hull.translate(sx, 0.6, 0.3); parts.push(colorGeo(hull, '#f4f1ea'));
    const bow = new THREE.ConeGeometry(0.55, 2.2, 10); bow.rotateX(-Math.PI / 2); bow.scale(1, 1.4, 1); bow.translate(sx, 0.6, -8.3); parts.push(colorGeo(bow, '#ff2e7e'));
    const foil = new THREE.BoxGeometry(0.16, 2.6, 0.7); foil.translate(sx, -0.8, -1.5); parts.push(colorGeo(foil, '#222'));
    const wingf = new THREE.BoxGeometry(2.2, 0.1, 0.6); wingf.translate(sx, -2.05, -1.5); parts.push(colorGeo(wingf, '#222'));
  }
  const beam = new THREE.BoxGeometry(7.6, 0.4, 1.0); beam.translate(0, 1.2, -1.5); parts.push(colorGeo(beam, '#1b2a4a'));
  const beam2 = new THREE.BoxGeometry(7.6, 0.35, 0.8); beam2.translate(0, 1.2, 4.8); parts.push(colorGeo(beam2, '#1b2a4a'));
  const net = new THREE.BoxGeometry(6.6, 0.08, 6.2); net.translate(0, 1.25, 1.6); parts.push(colorGeo(net, '#2c2f38'));
  // wing sail: thick symmetric aerofoil, 22 m tall, livery bands
  const s = new THREE.Shape(); s.moveTo(-1.9, 0); s.bezierCurveTo(-1.9, 0.6, 0.6, 0.55, 2.4, 0); s.bezierCurveTo(0.6, -0.55, -1.9, -0.6, -1.9, 0);
  const bands = [['#f4f1ea', 0, 9], ['#ff2e7e', 9, 12], ['#f4f1ea', 12, 17], ['#ffc247', 17, 19], ['#f4f1ea', 19, 22]];
  for (const [col, y0, y1] of bands) {
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, 1.4 + y0, -0.6); parts.push(colorGeo(g, col));
  }
  boatGeo = mergeGeometries(parts.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
  boatGeo.computeVertexNormals();
  return boatGeo;
}

export function createShowcases(F) {
  const { G, world } = F;
  const SC = {};
  SC.opponent = function (ev, route, diff) {
    const D = DIFFICULTY[diff] || DIFFICULTY[1];
    if (ev.opponent === 'jets') return jets(ev, route, D);
    if (ev.opponent === 'fog') return fog(ev, route, D);
    return boat(ev, route, D);
  };

  // pacing shared by the scripted opponents: progress fraction f, target average speed over the player's route,
  // rubber-banded toward the player so the race stays close
  function pacer(o, A, dt, avg, band = [0.82, 1.22], k = 0.0024) {
    const me = A.player;
    const rate = avg / Math.max(500, A.total);
    const gap = o.P - me.P;
    const rub = me.done ? 1.2 : clamp(1 - gap * k, band[0], band[1]);
    o.f += rate * rub * dt;
  }

  // ---------------------------------------------------------------- Fleet Week jets
  function jets(ev, route, D) {
    const pts = ev.fly.map(([lat, lon, alt]) => { const [x, z] = ll(lat, lon); return [x, Math.max(alt, world.heightAt(x, z) + 45), z]; });
    const P3 = path3(pts);
    const group = new THREE.Group(); group.name = 'showcase-jets';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55 });
    const geo = makeJetGeo();
    const planes = [0, 1, 2].map(() => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; group.add(m); return m; });
    const trails = ['#ffc247', '#f4f1ea', '#ff2e7e'].map(c => { const t = makeTrail(c); group.add(t.mesh); return t; });
    const offs = [[-14, 0, 6], [0, 2, -4], [14, 0, 6]];
    const tag = { root: { position: new THREE.Vector3() }, spec: { height: 3 } };
    const o = { name: 'Bay Blades', color: '#4fd2ff', carName: 'Display team', f: 0, P: 0, done: false, time: 0, tagTarget: tag, pos: { x: pts[0][0], z: pts[0][2] }, rollT: -1 };
    const avg = 27 + D.skill * 11;
    const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _b = new THREE.Vector3();
    let trailT = 0;
    function place(A, dt) {
      // before GO: during the reveal the formation roars in and passes overhead (~80% through it); during the
      // countdown it runs in again from behind to cross the start line at GO
      const pre = A.phase === 'reveal' ? ((A.revealDur || 3.6) * 0.8 - A.pt) * 70 : A.phase === 'countdown' ? (2.7 - A.pt) * 70 : 0;
      P3.at(Math.max(0, o.f), _p); P3.tan(Math.max(0, o.f), _t);
      if (pre) _p.addScaledVector(_t, -pre);
      // bank from curvature
      P3.tan(Math.min(1, Math.max(0, o.f) + 0.01), _b);
      const turn = _t.x * _b.z - _t.z * _b.x;
      _s.crossVectors(_t, _up).normalize();
      o.bank = (o.bank || 0) + (clamp(-turn * 30, -1.1, 1.1) - (o.bank || 0)) * Math.min(1, dt * 2);
      // occasional barrel roll by the lead
      if (o.rollT < 0 && Math.random() < dt * 0.05 && A.phase === 'race') o.rollT = 0;
      if (o.rollT >= 0) { o.rollT += dt; if (o.rollT > 2.2) o.rollT = -1; }
      planes.forEach((m, i) => {
        const [ox, oy, oz] = offs[i];
        m.position.copy(_p).addScaledVector(_s, ox).addScaledVector(_t, -oz); m.position.y += oy;
        _m.lookAt(_v.copy(m.position).add(_t), m.position, _up); m.quaternion.setFromRotationMatrix(_m);
        // lookAt points +Z at the target; our model faces -Z: flip, then bank
        m.quaternion.multiply(_q.setFromAxisAngle(_up, Math.PI));
        const roll = o.bank + (i === 1 && o.rollT >= 0 ? o.rollT / 2.2 * Math.PI * 2 : 0);
        m.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), roll));
      });
      tag.root.position.copy(planes[1].position);
      o.pos.x = _p.x; o.pos.z = _p.z;
      trailT -= dt;
      if (trailT <= 0) { trailT = 0.05; planes.forEach((m, i) => { _v.set(1, 0, 0).applyQuaternion(m.quaternion); _b.set(0, 0, 6).applyQuaternion(m.quaternion).add(m.position); trails[i].push(_b, _v); }); }
      trails.forEach(t => t.update());
    }
    o.setup = (A) => { G.scene.add(group); o.f = 0; trails.forEach(t => t.clear()); A.revealDur = 3.6; };
    o.update = (dt, A) => {
      if (A.phase === 'race' || A.phase === 'finished') { if (!o.done) pacer(o, A, dt, avg); }
      o.P = clamp(o.f, 0, 1) * A.total;
      if (o.f >= 1 && !o.done) { o.done = true; o.time = A.t; }
      place(A, dt);
    };
    o.reveal = (cam, t, A) => {
      // from beside the car, track the lead jet as the formation roars in and passes overhead
      // the car in the foreground, the formation coming in over it
      const p = A.player.v.root.position, j = planes[1].position;
      const dx = j.x - p.x, dz = j.z - p.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      cam.position.set(p.x - ux * 8.5 - uz * 3, p.y + 1.9, p.z - uz * 8.5 + ux * 3);
      const k = clamp(0.35 + t * 0.12, 0, 0.8);
      cam.lookAt(p.x + (j.x - p.x) * k, p.y + 1 + (j.y - p.y) * k, p.z + (j.z - p.z) * k);
      if (!o.roared && t > (A.revealDur || 3.6) * 0.72) { o.roared = true; G.audio?.ui?.('nearmiss'); G.rig?.addShake?.(0.5); }
    };
    o.cleanup = () => { G.scene.remove(group); };
    return o;
  }

  // ---------------------------------------------------------------- Fog Bank
  function fog(ev, route, D) {
    const tex = puff();
    const N = 46;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xdfe6ee, fog: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.renderOrder = 8;
    const seeds = Array.from({ length: N }, (_, i) => ({ lat: (Math.random() - 0.5) * 2, back: Math.random() * 90 + (i % 4) * 12, h: Math.random(), s: 45 + Math.random() * 55, ph: Math.random() * 6 }));
    const tag = { root: { position: new THREE.Vector3() }, spec: { height: 30 } };
    const o = { name: 'Karl the Fog', color: '#dfe6ee', carName: 'Weather system', catcher: true, P: -170, done: false, time: 0, tagTarget: tag, pos: { x: 0, z: 0 }, speed: 0 };
    // the fog "drives" the route: its pace follows the road's curvature speed limits (slow on the switchbacks, fast on
    // the straights), scaled by difficulty and rubber-banded so it is always just behind you
    const base = 19 + D.skill * 9; // m/s cruise (average difficulty ~21 m/s), never faster than the road allows
    const at = {}, _p = new THREE.Vector3();
    let t = 0, prevBoost = 0, lim = null;
    o.setup = (A) => { G.scene.add(mesh); o.P = -150; o.speed = 0; prevBoost = G.env.state.fogBoost || 0; A.revealDur = 3.4; lim = speedLimits(A.route, 8.5); };
    o.update = (dt, A) => {
      t += dt;
      const me = A.player;
      if (A.phase === 'race' && !me.done) {
        const gap = me.P - o.P;
        const rub = gap > 260 ? 1.5 : gap > 150 ? 1.18 : gap < 40 ? 0.7 : gap < 80 ? 0.86 : 1;
        routeAt(A.route, Math.max(0, A.route.startS + o.P), at);
        const want = Math.min(base * rub, clamp(lim[at.i] * 0.85, 9, 60));
        o.speed += (want - o.speed) * Math.min(1, dt * 0.9);
        o.P += o.speed * dt;
      }
      // wall geometry at the fog's route position, facing the player
      const s = A.route.startS + o.P;
      routeAt(A.route, Math.max(0, s), at);
      o.pos.x = at.x; o.pos.z = at.z;
      tag.root.position.set(at.x, at.y + 26, at.z);
      const cam = G.camera;
      for (let i = 0; i < N; i++) {
        const q = seeds[i];
        const back = q.back, lat = q.lat * 95;
        const x = at.x - at.dx * back - at.dz * lat, z = at.z - at.dz * back + at.dx * lat;
        const y = Math.max(world.heightAt(x, z), at.y - 20) + q.h * 55 + Math.sin(t * 0.6 + q.ph) * 3;
        _p.set(x, y, z);
        _m.lookAt(cam.position, _p, cam.up); _q.setFromRotationMatrix(_m);
        _e.set(0, 0, t * 0.05 + q.ph); _q.multiply(_q2.setFromEuler(_e));
        _m.compose(_p, _q, _v.set(q.s * 1.4, q.s, 1));
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // the world thickens as Karl closes in
      const gap = me.P - o.P;
      G.env.state.fogBoost = prevBoost + clamp(1 - gap / 320, 0, 1) * 0.85;
      if (me.done && A.how !== 'caught') o.P += 0; // stays put after you escape
    };
    o.reveal = (cam, tt, A) => {
      const p = A.player.v.root.position;
      routeAt(A.route, Math.max(0, A.route.startS + o.P), at);
      cam.position.set(p.x - (at.x - p.x) * 0.25 + 6, p.y + 7 + tt * 1.5, p.z - (at.z - p.z) * 0.25 + 6);
      cam.lookAt(at.x, at.y + 25, at.z);
    };
    o.cleanup = () => { G.scene.remove(mesh); G.env.state.fogBoost = prevBoost; };
    return o;
  }

  // ---------------------------------------------------------------- Foil Rush catamaran
  function boat(ev, route, D) {
    const wpts = [];
    for (const [lat, lon] of ev.sail) { const w = snapWater(world, lat, lon); if (w) wpts.push([w.x, 0, w.z]); }
    if (wpts.length < 2) { const a = {}; routeAt(route, route.startS, a); wpts.push([a.x, 0, a.z - 80], [a.x - 400, 0, a.z - 120]); }
    const P3 = path3(wpts);
    const group = new THREE.Group(); group.name = 'showcase-boat';
    const mesh = new THREE.Mesh(makeBoatGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }));
    mesh.castShadow = true; group.add(mesh);
    const tag = { root: { position: new THREE.Vector3() }, spec: { height: 22 } };
    const o = { name: 'Stormpetrel', color: '#ff6ad5', carName: 'Foiling catamaran', f: 0, P: 0, done: false, time: 0, tagTarget: tag, pos: { x: wpts[0][0], z: wpts[0][2] } };
    const avg = 28 + D.skill * 9;
    const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    let spray = 0, lift = 0, t = 0;
    o.setup = (A) => { G.scene.add(group); o.f = 0; A.revealDur = 3.4; };
    o.update = (dt, A) => {
      t += dt;
      const racing = A.phase === 'race' || A.phase === 'finished';
      if (racing && !o.done) pacer(o, A, dt, avg, [0.8, 1.25]);
      o.P = clamp(o.f, 0, 1) * A.total;
      if (o.f >= 1 && !o.done) { o.done = true; o.time = A.t; }
      P3.at(o.f, _p); P3.tan(o.f, _t);
      lift += ((racing ? 1.6 : 0) - lift) * Math.min(1, dt * 0.7);
      group.position.set(_p.x, lift + Math.sin(t * 1.3) * 0.15, _p.z);
      _m.lookAt(_v.copy(group.position).add(_t), group.position, _up); group.quaternion.setFromRotationMatrix(_m);
      group.quaternion.multiply(_q.setFromAxisAngle(_up, Math.PI));
      group.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), -0.14 * (lift / 1.6)));
      tag.root.position.set(_p.x, 20, _p.z);
      o.pos.x = _p.x; o.pos.z = _p.z;
      spray -= dt;
      if (racing && spray <= 0 && G.fx?.splash) { spray = 0.12; _v.set(3.4 * (Math.random() < 0.5 ? -1 : 1), 0, 6).applyQuaternion(group.quaternion).add(group.position); G.fx.splash(_v.x, 0.2, _v.z, 6); }
    };
    o.reveal = (cam, tt, A) => {
      const p = group.position;
      cam.position.set(p.x + 30 - tt * 4, 6 + tt, p.z + 26);
      cam.lookAt(p.x, 9, p.z);
      void A;
    };
    o.cleanup = () => { G.scene.remove(group); };
    return o;
  }
  return SC;
}
