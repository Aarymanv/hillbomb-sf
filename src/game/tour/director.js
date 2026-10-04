// Cinematic tour director: plays the shot list (src/game/tour/shots.js) through G.cameraOverride, one time of day +
// weather per shot, streams the world in behind a black frame before each shot, fades through black between shots,
// draws letterbox bars + a title card, and optionally records the canvas (tour/recorder.js).
// Hero car = the player's own car, driven by the race AI (Driver path mode) through window.__autopilot.
import * as THREE from 'three';
import { ll } from '../../world/latlon.js';
import { GG2, BAY2 } from '../../world/v2/anchors2.js';
import { Driver } from '../drivers.js';
import { SHOTS, SHORT } from './shots.js';
import { createRecorder, downloadBlob } from './recorder.js';

const FADE_IN = 0.6, FADE_OUT = 0.5, PREROLL = 1.2, LOAD_MIN = 0.4, LOAD_MAX = 9;
const RES = { 1080: [1920, 1080], 1440: [2560, 1440] };
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = t => 0.45 * t + 0.55 * t * t * (3 - 2 * t);   // eased but never fully stopped
const lerp = (a, b, t) => a + (b - a) * t;
const _f = new THREE.Vector3();

export function createTour(G) {
  const world = G.world, graph = world.graph, env = G.env, post = G.post, camera = G.camera;
  const renderer = () => G.renderer || window.__renderer;
  const S = { active: false, state: 'idle', list: [], i: -1, shot: null, t: 0, simT: 0, wall0: 0, letterbox: true, titles: true, rec: null, recName: '', manual: false };
  let saved = null, overlay = null, octx = null, attrEl = null, driver = null, hero = false, cap = 20, heroPath = null, cableCar = null;
  let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camFixed = null, fwd = new THREE.Vector3(0, 0, -1), snap = true;
  let focus = new THREE.Vector3(), plan = null, gov = { lvl: 0, bad: 0, ema: 1 / 60, last: 0, scale: 1 }, keyGuard = 0, offAfter = null;

  // ---------------------------------------------------------------- geometry helpers
  const ground = (x, z) => Math.max(0, world.heightAt(x, z));
  const road = (x, z) => world.groundAt(x, z, 999);
  const same = (n, want) => !!n && !!want && n.toLowerCase().startsWith(want.toLowerCase());
  function pt(p) {
    if (Array.isArray(p)) { const [x, z] = ll(p[0], p[1]); return new THREE.Vector3(x, ground(x, z) + (p[2] || 0), z); }
    if (p.gg !== undefined) {
      const [ox, oz] = GG2.origin, [dx, dz] = GG2.dir, l = p.l || 0;
      const x = ox + dx * p.gg - dz * l, z = oz + dz * p.gg + dx * l;
      return new THREE.Vector3(x, p.y ?? ground(x, z) + (p.dy || 0), z);
    }
    if (p.at) { const n = graph.intersection(p.at[0], p.at[1]); if (n) { const x = n.x + (p.ox || 0), z = n.z + (p.oz || 0); return new THREE.Vector3(x, road(x, z) + (p.dy || 0), z); } }
    return new THREE.Vector3(p.x || 0, p.y ?? ground(p.x || 0, p.z || 0) + (p.dy || 0), p.z || 0);
  }
  const laneOff = e => (e.oneway ? 0 : (e.median || 0.15) + (e.laneW || 3.2) * 0.5);
  // walk the graph from node n along edge choices; pick(n, prevEdge) -> [edge, forward] | null
  function appendEdge(pts, offs, e, fwdDir) {
    const P = fwdDir ? e.pts : e.pts.slice().reverse();
    for (let k = 1; k < P.length; k++) { pts.push([P[k][0], P[k][1]]); offs.push(laneOff(e)); }
    return fwdDir ? e.b : e.a;
  }
  // continue straight-ish for `more` metres (prefers the same street name)
  function extend(pts, offs, n, prev, more, name) {
    let L = 0;
    for (let g = 0; g < 40 && n && L < more; g++) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      let hx = b[0] - a[0], hz = b[1] - a[1]; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      let best = null, bs = -Infinity, bf = true;
      for (const q of n.edges) {
        if (q === prev) continue;
        const f = q.a === n; if (q.oneway && !f) continue;
        const P = f ? q.pts : q.pts.slice().reverse(); if (P.length < 2) continue;
        let dx = P[1][0] - P[0][0], dz = P[1][1] - P[0][1]; const dl = Math.hypot(dx, dz) || 1;
        const s = (dx * hx + dz * hz) / dl + (same(q.name, name) ? 0.5 : 0);
        if (s > bs) { bs = s; best = q; bf = f; }
      }
      if (!best || bs < 0.3) break;
      const i0 = pts.length; n = appendEdge(pts, offs, best, bf); prev = best;
      for (let i = Math.max(1, i0); i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
  }
  function streetPath(from, to) {
    const A = graph.intersection(from[0], from[1]), B = graph.intersection(to[0], to[1]);
    if (!A || !B) return null;
    const pts = [[A.x, A.z]], offs = [0], name = from[0];
    let n = A, prev = null;
    for (let g = 0; g < 150 && n !== B; g++) {
      let best = null, bd = Infinity;
      for (const q of n.edges) { if (q === prev || !same(q.name, name)) continue; const o = q.a === n ? q.b : q.a; const d = Math.hypot(o.x - B.x, o.z - B.z); if (d < bd) { bd = d; best = q; } }
      if (!best) break;
      n = appendEdge(pts, offs, best, best.a === n); prev = best;
    }
    if (pts.length < 2) return null;
    extend(pts, offs, n, prev, 90, name);
    offs[0] = offs[1] ?? 0;
    return offsetPts(pts, offs);
  }
  function offsetPts(pts, offs) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const o = offs[i] || 0; out.push([pts[i][0] - dz * o, pts[i][1] + dx * o]);
    }
    // drop near-duplicate points (edge joins)
    return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 0.5);
  }
  function linePath(spec) {
    const pts = [];
    if (spec.line === 'gg') {
      const [ox, oz] = GG2.origin, [dx, dz] = GG2.dir, dir = Math.sign(spec.s1 - spec.s0), l = (spec.off || 4.5) * dir;
      for (let s = spec.s0; dir > 0 ? s <= spec.s1 : s >= spec.s1; s += 10 * dir) pts.push([ox + dx * s - dz * l, oz + dz * s + dx * l]);
    } else if (spec.line === 'bay') {
      const [ax, az] = BAY2.sf, [bx, bz] = BAY2.ybi, n = 120;
      let dx = (bx - ax) * Math.sign(spec.s1 - spec.s0), dz = (bz - az) * Math.sign(spec.s1 - spec.s0); const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const o = spec.off || 5;
      for (let i = 0; i <= n; i++) { const t = lerp(spec.s0, spec.s1, i / n); pts.push([ax + (bx - ax) * t - dz * o, az + (bz - az) * t + dx * o]); }
    }
    return pts;
  }
  function eventPath(id) {
    const F = G.festival, ev = F?.events?.list?.find(e => e.id === id);
    const R = ev && (ev.route || F.events.route?.(ev));
    if (!R?.pts?.length) return null;
    const s0 = Math.max(0, (R.startS || 0) - 4);
    let i0 = 0; if (R.cum) while (i0 < R.n - 2 && R.cum[i0 + 1] < s0) i0++;
    return R.pts.slice(i0, i0 + 400).map(p => [p[0], p[1]]);
  }
  function buildPath(spec) {
    if (spec.from) return streetPath(spec.from, spec.to);
    if (spec.line) return linePath(spec);
    if (spec.event) return eventPath(spec.event);
    return null;
  }

  // ---------------------------------------------------------------- player car: hero or parked out of shot
  const pv = () => G.player.vehicle;
  function ensureCar() {
    const P = G.player;
    if (P.vehicle) return P.vehicle;
    const c = G.spawnVehicle(G.economy?.current || 'hatch', P.pos.x, P.pos.z, P.yaw || 0, { role: 'player' });
    P.setVehicle(c); return c;
  }
  function placeCar(x, z, yaw, speed = 0, y = null) {
    const v = pv(); if (!v) return;
    v.place(x, (y ?? road(x, z)) + 0.4, z, yaw);
    v.body.vel.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);
    if (v.body.angVel) v.body.angVel.set(0, 0, 0);
  }
  function parkNear(x, z) {
    const n = graph.nearestNode(x, z, 450, q => Math.hypot(q.x - x, q.z - z) > 35);
    const v = pv(); if (!v) return;
    if (n) placeCar(n.x, n.z, 0); else placeCar(x, z, 0);
    v.root.visible = false;
  }
  const autopilot = (input, dt) => {
    const v = pv(); if (!v || !S.active) return;
    const A = input.axes || (input.axes = {});
    if (hero && driver && S.state !== 'load') {
      driver.drive(dt, G.traffic?.ctx);
      let thr = v.input.throttle, br = v.input.brake; const sp = v.body.fwdSpeed || 0;
      if (sp > cap) { thr = 0; br = Math.min(1, (sp - cap) * 0.25); } else if (sp > cap * 0.9) thr *= 0.35;
      A.throttle = thr; A.brake = br; A.steer = v.input.steer;
    } else { A.throttle = 0; A.brake = 1; A.steer = 0; }
  };

  // ---------------------------------------------------------------- shot setup
  function resolve(shot) {
    const c = shot.cam, p = { type: c.type };
    if (c.type === 'dolly') { p.a = pt(c.from); p.b = pt(c.to); p.la = pt(c.look); p.lb = pt(c.lookTo || c.look); p.focus = p.a.clone().lerp(p.b, 0.5); }
    else if (c.type === 'orbit') { p.c = pt(c.c); p.focus = p.c.clone(); }
    else if (c.type === 'seg') {
      const A = graph.intersection(c.st, c.a), B = graph.intersection(c.st, c.b);
      if (!A || !B) return null;
      const at = (t, dy) => { const x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t); return new THREE.Vector3(x, road(x, z) + dy, z); };
      p.a = at(c.t0, c.dy0); p.b = at(c.t1, c.dy1); p.la = at(c.lookT, c.lookDy); p.lb = p.la; p.focus = p.a.clone().lerp(p.b, 0.5);
    } else if (c.type === 'track') {
      const pts = buildPath(c.path); if (!pts || pts.length < 4) return null;
      p.pts = pts; p.focus = new THREE.Vector3(pts[0][0], 0, pts[0][1]);
    } else if (c.type === 'cable') {
      const n = graph.intersection(c.near[0], c.near[1]); const cars = G.cablecars || [];
      if (!n || !cars.length) return null;
      let best = null, bd = Infinity; for (const k of cars) { const d = Math.hypot(k.v.pos.x - n.x, k.v.pos.z - n.z); if (d < bd) { bd = d; best = k; } }
      p.car = best; p.focus = best.v.pos.clone();
    }
    return p;
  }
  function enterShot(i) {
    S.i = i; const shot = S.shot = S.list[i];
    plan = resolve(shot);
    if (!plan) { console.warn('[tour] skipping shot (not on this map)', shot.id); return next(); }
    // time + weather (weather held for the tour: never persisted)
    env.state.hours = shot.hours; env.state.paused = true;
    const W = G.weather; if (W?.set) { W.locked = false; W.set(shot.weather || 'clear', { transition: 0 }); W.locked = true; }
    hero = plan.type === 'track'; cableCar = plan.car || null; driver = null; camFixed = null; snap = true;
    focus.copy(plan.focus);
    const v = pv();
    if (hero) {
      const P = plan.pts, dx = P[3][0] - P[0][0], dz = P[3][1] - P[0][1];
      heroPath = { yaw: Math.atan2(-dx, -dz), x: P[0][0], z: P[0][1] };
      v.root.visible = true; placeCar(heroPath.x, heroPath.z, heroPath.yaw);
      cap = shot.cam.speed || 20;
    } else parkNear(focus.x, focus.z);
    try { world.stream?.fill?.(focus.x, focus.z); } catch (e) { console.warn('[tour] fill', e); }
    S.rec?.pause();
    S.state = 'load'; S.simT = 0; S.t = 0; S.wall0 = performance.now();
  }
  function startPreroll() {
    S.state = 'preroll'; S.simT = 0; snap = true; camFixed = null;
    if (hero) {
      const c = S.shot.cam;
      placeCar(heroPath.x, heroPath.z, heroPath.yaw, c.launch ? 0 : cap);
      driver = new Driver(pv(), graph, { mode: 'race' });
      driver.setPath(plan.pts, { latAcc: 6.5, loop: false, ys: plan.pts.map(p => road(p[0], p[1])) });
      driver.speedMul = 1; driver.rubber = 1;
    }
  }
  function next() {
    if (S.i + 1 >= S.list.length) { stop(true); return; }
    enterShot(S.i + 1);
  }

  // ---------------------------------------------------------------- camera per frame
  function heroFrame() {
    const v = cableCar ? cableCar.v : pv();
    const p = cableCar ? v.pos : v.root.position;
    if (cableCar) { const vel = v.vel; if (vel && Math.hypot(vel.x, vel.z) > 0.4) _f.set(vel.x, 0, vel.z).normalize(); else _f.copy(fwd); }
    else { v.body.forward(_f); _f.y = 0; _f.normalize(); }
    fwd.lerp(_f, snap ? 1 : 0.12).normalize();
    return p;
  }
  function camUpdate(cam, dt) {
    const c = S.shot.cam, u = S.state === 'play' ? S.t / S.shot.dur : 0, e = ease(clamp01(u));
    const want = new THREE.Vector3(), look = new THREE.Vector3();
    if (plan.type === 'dolly' || plan.type === 'seg') { want.lerpVectors(plan.a, plan.b, e); look.lerpVectors(plan.la, plan.lb, e); }
    else if (plan.type === 'orbit') {
      const a = THREE.MathUtils.degToRad(lerp(c.a0, c.a1 ?? c.a0, e)), r = lerp(c.r, c.r1 ?? c.r, e), h = lerp(c.h, c.h1 ?? c.h, e);
      want.set(plan.c.x + Math.sin(a) * r, plan.c.y + h, plan.c.z - Math.cos(a) * r); look.copy(plan.c); look.y += c.lookDy || 0;
    } else {
      const p = heroFrame(), rx = -fwd.z, rz = fwd.x;
      const A = c.a, B = c.b || c.a, r = lerp(A.r, B.r, e), up = lerp(A.u, B.u, e), f = lerp(A.f, B.f, e);
      if (c.fixed) {
        if (c.camAt) camFixed = camFixed || pt(c.camAt);
        else if (!camFixed || S.state !== 'play') camFixed = new THREE.Vector3(p.x + rx * A.r + fwd.x * A.f, p.y + A.u, p.z + rz * A.r + fwd.z * A.f);
        want.copy(camFixed);
      } else want.set(p.x + rx * r + fwd.x * f, p.y + up, p.z + rz * r + fwd.z * f);
      const L = c.look || { f: 0, u: 1 };
      look.set(p.x + fwd.x * L.f, p.y + L.u, p.z + fwd.z * L.f);
      focus.set(p.x, p.y, p.z);
    }
    want.y = Math.max(want.y, world.heightAt(want.x, want.z) + 0.4);
    const k = snap ? 1 : 1 - Math.exp(-(plan.type === 'track' || plan.type === 'cable' ? 9 : 30) * dt);
    camPos.lerp(want, k); camLook.lerp(look, k); snap = false;
    cam.position.copy(camPos); cam.lookAt(camLook);
    const fov = S.shot.fov || 52; if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- per-frame driver (G.cameraOverride.update)
  function update(cam, dt) {
    if (!S.active) return;
    const now = performance.now();
    if (G.ui) G.ui.hudHidden = true;
    if (G.rig?.rig) G.rig.rig.speedBlur = 0;
    const shot = S.shot; if (!shot) return;
    env.state.hours = (shot.hours + (shot.drift || 0) * S.t + 24) % 24;
    let flash = 1;
    if (S.state === 'load') {
      S.simT += dt;
      const gt = world.gtiles, wall = (now - S.wall0) / 1000;
      const pend = world.stream?.stats?.pending || 0;
      if ((S.simT > LOAD_MIN && pend === 0 && (!gt || !gt.tiles.group.visible || gt.ready) && wall > 0.3) || wall > LOAD_MAX) startPreroll();
    } else if (S.state === 'preroll') {
      S.simT += dt;
      if (S.simT >= (hero || cableCar ? PREROLL : 0.35)) { S.state = 'play'; S.t = 0; S.rec?.resume(); }
    } else if (S.state === 'play') {
      S.t += dt;
      flash = S.t < FADE_IN ? 1 - S.t / FADE_IN : S.t > shot.dur - FADE_OUT ? clamp01((S.t - (shot.dur - FADE_OUT)) / FADE_OUT) : 0;
      governor(now);
    }
    camUpdate(cam, dt);
    // stream + traffic around what the camera sees (main.js hands G.player.pos to world.update as the focus)
    G.player.pos.set(focus.x, focus.y, focus.z);
    const U = post?.grade?.uniforms; if (U) { U.uFlashCol.value.setRGB(0, 0, 0); U.uFlash.value = flash; }
    drawOverlay(octx, overlay.width, overlay.height, false);
    if (S.state === 'play' && S.t >= shot.dur) next();
  }

  // ---------------------------------------------------------------- overlay: letterbox, title card, attribution
  function drawOverlay(ctx, w, h, rec) {
    if (!ctx) return;
    if (!rec) ctx.clearRect(0, 0, w, h);
    const u = h / 1080, bh = S.letterbox ? Math.round(Math.max(0, (h - w / 2.39) / 2)) : 0;
    ctx.save();
    if (bh) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh); }
    const shot = S.shot, a = S.state === 'play' && shot ? clamp01((S.t - 0.8) / 0.7) * clamp01((shot.dur - 1.1 - S.t) / 0.6) : 0;
    if (S.titles && a > 0) {
      const x = Math.round(w * 0.055 + (1 - a) * 14 * u), y = h - Math.max(bh, 40 * u) - 70 * u;
      ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 14 * u;
      ctx.fillStyle = '#e0473a'; ctx.fillRect(x, y - 50 * u, 40 * u, 3 * u);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(44 * u)}px Inter, "Segoe UI", system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
      ctx.fillText(shot.title, x, y);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `600 ${Math.round(16 * u)}px Inter, "Segoe UI", system-ui, sans-serif`;
      try { ctx.letterSpacing = `${(3 * u).toFixed(1)}px`; } catch { /* older canvas */ }
      ctx.fillText(shot.sub.toUpperCase(), x, y + 32 * u);
      try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    }
    const at = world.gtiles?.tiles?.group?.visible && attrEl?.textContent;
    if (at) {
      ctx.globalAlpha = 0.7; ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = `500 ${Math.max(9, Math.round(12 * u))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(at, w / 2, h - Math.max(6 * u, bh / 2 - 5 * u));
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- render size + quality governor
  function setRender(W, H, pr) {
    const r = renderer(); r.setPixelRatio(pr); post?.composer?.setPixelRatio?.(pr);
    r.setSize(W, H, false); post?.setSize?.(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  const LEVELS = [
    () => { if (post) post.glossSSR = false; },
    () => { if (post?.ao) post.ao.enabled = false; },
    () => { gov.scale = 0.85; applyScale(); },
    () => { if (G.traffic) G.traffic.density = 0.4; },
    () => { gov.scale = 0.7; applyScale(); },
  ];
  function applyScale() { const b = saved.base; setRender(b.W, b.H, b.pr * gov.scale); }
  function governor(now) {
    if (S.manual || window.__manual) { gov.last = now; return; }
    const dt = gov.last ? (now - gov.last) / 1000 : 1 / 60; gov.last = now;
    if (dt > 0.5) return;   // tab switch / hitch: ignore
    gov.ema += (dt - gov.ema) * 0.08;
    gov.bad = gov.ema > 1 / 50 ? gov.bad + dt : Math.max(0, gov.bad - dt * 0.5);
    if (gov.bad > 1.2 && gov.lvl < LEVELS.length) { LEVELS[gov.lvl++](); gov.bad = 0; gov.ema = 1 / 60; console.log('[tour] quality step', gov.lvl); }
  }

  // ---------------------------------------------------------------- start / stop
  function onKey(e) {
    if (!S.active || performance.now() < keyGuard) return;
    e.preventDefault(); e.stopImmediatePropagation(); stop(false);
  }
  function start(opts = {}) {
    if (S.active) return;
    const ids = opts.shots || (opts.short ? SHORT : null);
    S.list = (ids ? ids.map(id => SHOTS.find(s => s.id === id)).filter(Boolean) : SHOTS.slice()).map(s => opts.short ? { ...s, dur: Math.min(s.dur, 5) } : s);
    if (!S.list.length) return;
    S.letterbox = opts.letterbox !== false; S.titles = opts.titles !== false; S.manual = !!opts.manual; S.download = opts.download !== false;
    const r = renderer(), P = G.player;
    const wasFoot = !P.vehicle, footPos = P.pos.clone(), footYaw = P.yaw;
    const car = ensureCar(); car.body.forward(_f);
    saved = {
      override: G.cameraOverride, autopilot: window.__autopilot, hours: env.state.hours, paused: env.state.paused,
      wKind: G.weather?.kind, wLocked: G.weather?.locked, fov: camera.fov, hud: G.ui?.hudHidden, wasFoot, footPos, footYaw,
      carPos: car.root.position.clone(), carYaw: Math.atan2(-_f.x, -_f.z), ssr: post?.glossSSR, ao: post?.ao?.enabled, density: G.traffic?.density,
      base: { W: innerWidth, H: innerHeight, pr: r.getPixelRatio() }, pr0: r.getPixelRatio(), restoreSize: false,
    };
    // recording: render at the capture size (1080p / 1440p / current)
    if (opts.record) {
      const [W, H] = RES[opts.record] || [r.domElement.width, r.domElement.height];
      saved.base = { W, H, pr: 1 }; saved.restoreSize = true; setRender(W, H, 1);
      try {
        S.rec = createRecorder({ w: W, h: H, fps: 60, bitrate: opts.bitrate || 40e6, audio: G.audio, manual: !!opts.manual });
        S.recName = `hillbomb-tour-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`;
        S.rec.pause();
        offAfter = post?.onAfterRender?.(() => { if (S.rec && !S.rec.paused) S.rec.frame(r.domElement, (c, w, h) => drawOverlay(c, w, h, true)); }) || null;
      } catch (e) { console.error('[tour] recorder', e); G.ui?.notify?.({ title: 'Recording unavailable', text: String(e.message || e), kind: 'bad', ms: 3000 }); S.rec = null; }
    }
    gov = { lvl: 0, bad: 0, ema: 1 / 60, last: 0, scale: 1 };
    attrEl = [...document.body.children].find(d => d.tagName === 'DIV' && d.style.zIndex === '30' && d.style.bottom === '4px') || null;
    overlay = document.createElement('canvas'); overlay.id = 'hb-tour';
    overlay.width = innerWidth; overlay.height = innerHeight;
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none';
    document.body.appendChild(overlay); octx = overlay.getContext('2d');
    document.body.classList.add('hb-tour-on');
    if (!document.getElementById('hb-tour-css')) {
      const st = document.createElement('style'); st.id = 'hb-tour-css';
      st.textContent = 'body.hb-tour-on > *:not(canvas):not(#hb-tour):not(style):not(script){visibility:hidden!important}';
      document.head.appendChild(st);
    }
    document.getElementById('hud')?.classList.add('hidden');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* not locked */ }
    if (G.input) G.input.wantPointerLock = false;
    S.active = true; keyGuard = performance.now() + 500;
    window.__autopilot = autopilot;
    G.cameraOverride = { update, tour: true };
    addEventListener('keydown', onKey, true);
    enterShot(0);
  }
  async function stop(finished) {
    if (!S.active) return;
    S.active = false; S.state = 'idle';
    removeEventListener('keydown', onKey, true);
    const s = saved;
    G.cameraOverride = s.override || null; window.__autopilot = s.autopilot || null;
    env.state.hours = s.hours; env.state.paused = s.paused;
    const W = G.weather; if (W?.set && s.wKind) { W.locked = false; W.set(s.wKind, { transition: 0 }); W.locked = !!s.wLocked; }
    camera.fov = s.fov; camera.updateProjectionMatrix();
    if (post) { post.glossSSR = s.ssr; if (post.ao && s.ao !== undefined) post.ao.enabled = s.ao; }
    if (G.traffic && s.density !== undefined) G.traffic.density = s.density;
    offAfter?.(); offAfter = null;
    if (s.restoreSize || gov.scale !== 1) {
      const r = renderer(), pr = s.pr0;
      if (s.restoreSize) { r.setPixelRatio(pr); post?.composer?.setPixelRatio?.(pr); r.setSize(innerWidth, innerHeight); post?.setSize?.(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
      else setRender(s.base.W, s.base.H, s.base.pr);
    }
    const U = post?.grade?.uniforms; if (U) { U.uFlash.value = 0; U.uFlashCol.value.setRGB(1, 1, 1); }
    if (G.ui) G.ui.hudHidden = !!s.hud;
    if (!s.hud) document.getElementById('hud')?.classList.remove('hidden');
    document.body.classList.remove('hb-tour-on'); overlay?.remove(); overlay = null; octx = null;
    const v = pv();
    if (v) { v.root.visible = true; placeCar(s.carPos.x, s.carPos.z, s.carYaw, 0, s.carPos.y - 0.4); G.rig?.snap?.(); }
    if (s.wasFoot && G.player.vehicle) { G.player.exitVehicle(true); G.player.pos.copy(s.footPos); G.rig?.snap?.(); }
    if (G.input && G.state === 'play') G.input.wantPointerLock = true;
    driver = null; hero = false; cableCar = null;
    if (S.rec) {
      const rec = S.rec; S.rec = null;
      const blob = await rec.stop();
      window.__tourBlob = blob;
      if (blob.size > 0 && S.download) downloadBlob(blob, S.recName);
      G.ui?.notify?.({ title: 'Tour video saved', text: `${S.recName} · ${(blob.size / 1048576).toFixed(1)} MB`, ms: 4000 });
    } else if (!finished) G.ui?.notify?.({ title: 'Cinematic tour stopped', ms: 1500 });
    G.emit?.('tour-end', { finished });
  }
  return {
    SHOTS, SHORT, start, stop: () => stop(false),
    get active() { return S.active; }, get state() { return S.state; }, get shot() { return S.shot; }, get index() { return S.i; },
    get recording() { return !!S.rec; },
    overlay: (c, w, h) => drawOverlay(c, w, h, true),   // dev captures: draw the overlay onto any 2D context
    // dev: jump to shot i (frames continue as normal)
    goto(i) { if (S.active) enterShot(Math.max(0, Math.min(S.list.length - 1, i))); },
  };
}
