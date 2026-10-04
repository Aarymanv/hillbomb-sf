// Game hub: owns vehicles, the sim, the player, and wires systems (traffic, police, activities, skills, economy,
// audio, HUD) together through events.
import * as THREE from 'three';
import { Vehicle, CARS } from '../vehicle/cars.js';
import { Sim } from '../vehicle/sim.js';
import { ENV as PHYS_ENV } from '../vehicle/physics.js';
import { createPlayer } from '../player/player.js';
import { createCameraRig } from '../player/camera.js';
import { createTraffic } from './traffic.js';
import { createCarLights } from '../render/carlights.js';
import { createCarShadows } from '../render/carshadow.js';
import { createParticles } from '../render/particles.js';
import { createSkidmarks } from '../render/skidmarks.js';

const _v = new THREE.Vector3();
export function createGame({ scene, world, env, input, camera, audio, post, quality }) {
  const sim = new Sim(world);
  const rig = createCameraRig(camera, world);
  const vehicles = [];
  const listeners = {};
  const G = {
    scene, world, env, input, camera, audio, post, sim, rig, quality,
    time: 0, paused: false, state: 'play',
    vehicles: () => vehicles,
    systems: [],
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    emit(ev, ...a) { for (const fn of listeners[ev] || []) fn(...a); },
    addVehicle(v) { if (!vehicles.includes(v)) vehicles.push(v); sim.add(v); },
    removeVehicle(v) { const i = vehicles.indexOf(v); if (i >= 0) vehicles.splice(i, 1); sim.remove(v); v.remove(); },
    spawnVehicle(id, x, z, yaw, opts = {}) {
      const v = new Vehicle(id, { scene, ...opts });
      const y = (opts.y ?? world.groundAt(x, z, opts.probeY ?? 999)) + 0.3;
      v.place(x, y, z, yaw);
      G.addVehicle(v);
      return v;
    },
    playerOnFoot: () => (G.player && G.player.mode === 'foot' ? G.player.pos : null),
    // hooks the player calls
    onEnterVehicle(v) {
      G.emit('enter', v); if (v.ai) { G.traffic?.removeCar(v); v.ai = null; }
      if (v.voice) { v.voice.stop(); v.voice = null; }
      G.attachVoice(v, true);
      if (v.role === 'parked') audio?.starter?.(); // cold car: crank it
      v.body.onShift = up => { v.voice?.shift?.(up); if (up && v.body.rpm > v.params.redline * 0.85 && ['v8', 'rally', 'v12', 'flat6'].includes(v.def.engine) && Math.random() < 0.5) { v.voice?.backfire?.(); G.backfireFx?.(v); } };
    },
    onExitVehicle(v) { G.emit('exit', v); },
    onCarjack(v) {
      G.emit('carjack', v);
      // eject the driver: a fleeing pedestrian
      G.peds?.spawnFleeing?.(v);
      if (v.ai) { G.traffic?.removeCar(v); v.ai = null; }
      v.driver = null;
    },
    onHorn(v) { G.emit('horn', v); },
    onPlayerHitByCar(v, rel) { G.emit('playerHit', v, rel); audio?.impact(Math.min(1, rel / 20), 'body'); },
    onWasted(reason) { G.emit('wasted', reason); },
    onDrown() { G.emit('drown'); },
  };
  const player = createPlayer({ scene, world, input, rig, sim, audio, game: G });
  sim.onPreStep = () => player.preStep?.();
  if (typeof window !== 'undefined') window.__physEnv = PHYS_ENV;   // dev: handling A/B (legacyContact)
  G.player = player;
  G.traffic = createTraffic({ scene, world, sim, game: G, max: quality.traffic ?? 24 });
  const carLights = createCarLights(scene);
  const carShadows = createCarShadows(scene); G.carShadows = carShadows;
  const fx = createParticles(scene);
  const skids = createSkidmarks(scene);
  G.fx = fx;
  const _p = new THREE.Vector3(), _d = new THREE.Vector3();
  function vehicleFx(dt) {
    const cam = camera.position;
    for (const v of vehicles) {
      const b = v.body;
      const dxc = v.pos.x - cam.x, dzc = v.pos.z - cam.z;
      if (dxc * dxc + dzc * dzc > 170 * 170) { for (let i = 0; i < 4; i++) skids.end(v.uid * 4 + i); continue; }
      b.forward(_d);
      const night = env.night.value, lit = 1 - night * 0.6;
      for (let i = 0; i < 4; i++) {
        const w = b.wheels[i], key = v.uid * 4 + i;
        if (!w.contact) { skids.end(key); continue; }
        const surf = w.surface;
        const soft = surf === 3 || surf === 4 || surf === 5 || surf === 7;
        if (!soft && w.skid > 0.22 && b.speed > 2) {
          skids.add(key, w.cp.x, w.cp.y, w.cp.z, _d.x, _d.z, v.spec.wheelWidth || 0.24, Math.min(1, w.skid * 1.4));
          if (Math.random() < w.skid * dt * 30) fx.tyreSmoke(w.cp.x, w.cp.y, w.cp.z, b.vel.x, b.vel.z, Math.min(1, w.skid * 1.5), lit);
        } else skids.end(key);
        if (soft && b.speed > 5 && Math.random() < dt * b.speed * 0.35) fx.dust(w.cp.x, w.cp.y, w.cp.z, b.vel.x, b.vel.z, Math.min(1, b.speed / 25), surf === 4 ? [0.72, 0.65, 0.5] : surf === 3 ? [0.4, 0.42, 0.3] : [0.55, 0.47, 0.36]);
      }
      // damage smoke from the engine bay
      if (v.health < 55) {
        const rate = (55 - v.health) / 55 * 12;
        if (Math.random() < rate * dt) {
          _p.set(0, v.spec.height * 0.78, v.spec.axleFZ * 0.85).applyQuaternion(b.quat).add(v.root.position);
          fx.engineSmoke(_p.x, _p.y, _p.z, v.health < 22);
        }
      }
      // underbody scrape sparks
      if (b.scrape > 0.25 && Math.random() < b.scrape * dt * 40) { _p.set((Math.random() - 0.5) * v.spec.width * 0.6, 0.1, (Math.random() - 0.5) * v.spec.length * 0.6).applyQuaternion(b.quat).add(v.root.position); fx.sparks(_p.x, _p.y, _p.z, b.vel.x * 0.6, 1, b.vel.z * 0.6, 3); }
      // splash
      if (v.pos.y < 0.4 && !v._splashed && world.heightAt(v.pos.x, v.pos.z) < -0.5) { v._splashed = true; fx.splash(v.pos.x, 0.2, v.pos.z, 60); audio?.impact(0.8, 'splash', G.audioAt?.(v)); }
      if (v.pos.y > 1.5) v._splashed = false;
    }
    skids.update();
    fx.update(dt, camera, G.renderer || { domElement: { height: innerHeight } });
  }
  G.on('impact', (v, e) => { if (e.point && e.strength > 0.22 && e.kind !== 'ground') fx.sparks(e.point.x, e.point.y + 0.5, e.point.z, v.body.vel.x * 0.3, 1.5, v.body.vel.z * 0.3, Math.round(6 + e.strength * 20)); });
  G.on('carHit', (a, b2, hit) => { if (hit.point && hit.strength > 0.18) fx.sparks(hit.point.x, hit.point.y + 0.4, hit.point.z, 0, 2, 0, Math.round(6 + hit.strength * 24)); });
  G.backfireFx = v => { for (const a of v.visual.exhaustAnchors || []) { _p.copy(a).applyQuaternion(v.body.quat).add(v.root.position); v.body.forward(_d); fx.flame(_p.x, _p.y, _p.z, -_d.x, -_d.z); } };

  // --------------------------------------------------------------- audio (owned by the audio module; see src/audio/audio.js)
  // Engines: the player's car + at most 3 nearby moving traffic cars get a sample-based voice (hard cull: 55 m).
  // Close fast passes also trigger a recorded pass-by aligned to the moment of closest approach.
  audio?.attach?.(G);
  G.audioAt = v => {
    if (v === player.vehicle) return { distance: 0, pan: 0 };
    camera.getWorldDirection(_cv);
    const d = Math.hypot(v.pos.x - camera.position.x, v.pos.z - camera.position.z);
    return { distance: d, pan: listenerPan(v.pos.x, v.pos.z, d) };
  };
  G.attachVoice = function (v, isPlayer = false) {
    if (!audio || v.voice) return;
    const prof = v.params?.engine || v.def?.engine || CARS[v.id].engine;   // per-instance builds (engine swaps) first
    const asp = String(v.def?.asp || CARS[v.id]?.asp || '');
    v.voice = audio.createEngine(prof, isPlayer ? { turbo: /turbo/.test(asp) ? true : undefined, supercharged: /super/.test(asp) || undefined } : { lite: true });
    v.voiceIsPlayer = isPlayer;
  };
  const NPC_VOICES = 3, NPC_RANGE = 55;
  let ambT = 0, audIndoors = false;
  const aRoad = { street: '', tunnel: 0, brick: false, rails: 0, paint: 0 };
  const RAIL_ST = /^(Powell|Hyde|Mason|California|Jackson|Washington|Market) Street$|^The Embarcadero$/;
  const _cv = new THREE.Vector3();
  function listenerPan(x, z, d) { return THREE.MathUtils.clamp(((x - camera.position.x) * -_cv.z + (z - camera.position.z) * _cv.x) / Math.max(1, d), -1, 1); }
  function updateVoices(dt) {
    if (!audio) return;
    camera.getWorldDirection(_cv);
    const cam = camera.position, pv = player.vehicle;
    const lvx = pv ? pv.body.vel.x : 0, lvz = pv ? pv.body.vel.z : 0;
    audio.setListener?.({ interior: !!pv && (rig.rig?.mode === 'hood' || rig.rig?.mode === 'cockpit') });
    // rank traffic by distance to the camera; moving cars matter more than parked/idling ones; hysteresis on current voices
    const npc = [];
    for (const v of vehicles) {
      if (v === pv || !v.driver || v.role === 'cablecar') continue;
      const d2 = (v.pos.x - cam.x) ** 2 + (v.pos.z - cam.z) ** 2;
      if (d2 > NPC_RANGE * NPC_RANGE * 1.3) continue;
      npc.push([v, d2 * (v.voice && !v.voiceIsPlayer ? 0.7 : 1) * (v.body.speed < 1 ? 2.5 : 1)]);
    }
    npc.sort((a, b) => a[1] - b[1]);
    const keep = new Set(npc.slice(0, NPC_VOICES).filter(([, d]) => d < NPC_RANGE * NPC_RANGE).map(([v]) => v));
    if (pv) keep.add(pv);
    for (const v of vehicles) {
      if (!keep.has(v)) { if (v.voice) { v.voice.stop(); v.voice = null; } continue; }
      if (v.voice && v.voiceIsPlayer !== (v === pv)) { v.voice.stop(); v.voice = null; }
      if (!v.voice) G.attachVoice(v, v === pv);
      const b = v.body, P = v.params;
      if (v === pv) v.voice.setSpatial?.({ distance: 0, pan: 0, velocity: 0 });
      else {
        const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z, dist = Math.hypot(dx, dz);
        const rvx = b.vel.x - lvx, rvz = b.vel.z - lvz;
        v.voice.setSpatial?.({ distance: dist, pan: listenerPan(v.pos.x, v.pos.z, dist), velocity: -(rvx * dx + rvz * dz) / Math.max(1, dist) });
        // recorded pass-by: predict closest approach
        const u2 = rvx * rvx + rvz * rvz;
        if (u2 > 11 * 11 && dist < 45 && performance.now() > (v._pbT || 0)) {
          const tc = -(dx * rvx + dz * rvz) / u2;
          if (tc > 0.35 && tc < 1.3) {
            const mx = dx + rvx * tc, mz = dz + rvz * tc, dmin = Math.hypot(mx, mz);
            if (dmin < 6.5) {
              const pan = listenerPan(v.pos.x, v.pos.z, dist);
              if (audio.passby?.({ delay: tc, side: pan <= 0 ? 1 : -1, dmin, rate: THREE.MathUtils.clamp(Math.sqrt(u2) / 18, 0.9, 1.15), gain: 0.55 })) v.voice.duckFor?.(tc + 1.6);
              v._pbT = performance.now() + 6000;
            }
          }
        }
      }
      const thr = b.reverse ? (b.brake ?? v.input.brake) : (b.throttle ?? v.input.throttle);   // the ramped pedal the engine actually sees
      v.voice.update({ rpm: b.rpm, idleRpm: P.idle, redline: P.redline, throttle: thr, load: Math.min(1, thr * (b.grounded ? 1 : 0.4)), speed: b.speed, gear: b.gear, boost: b.boost });
    }
    // player car extras
    if (pv) {
      const b = pv.body;
      let slip = 0; for (const w of b.wheels) if (w.contact) slip = Math.max(slip, w.skid);
      const surf = b.wheels[2].surface;
      // painted crosswalks: the band just outside a signal / stop junction's plateau
      const nn = world.graph?.nearestNode?.(pv.pos.x, pv.pos.z, 30);
      const dn = nn ? Math.hypot(pv.pos.x - nn.x, pv.pos.z - nn.z) : 99;
      aRoad.paint = nn && (nn.signal || nn.stop) && dn > nn.radius - 1.5 && dn < nn.radius + 3 ? 1 : 0;
      audio.tires.update({ slip: b.grounded ? slip : 0, speed: b.speed, brake: pv.input.brake, surface: surf === 3 || surf === 7 ? 'grass' : surf === 5 ? 'dirt' : surf === 4 ? 'gravel' : aRoad.brick ? 'brick' : 'asphalt',
        rails: aRoad.rails, paint: aRoad.paint });
      audio.wind.update(b.speed);
      audio.scrape(b.scrape);
    } else {
      audio.tires.update({ slip: 0, speed: 0, surface: 'asphalt' }); audio.wind.update(0); audio.scrape(0);
      const P = G.player;
      if (P && P.mode === 'foot' && audio.foot) {
        const s = world.terrain?.surfaceAt?.(P.pos.x, P.pos.z);
        audio.foot.update({ speed: Math.hypot(P.vel.x, P.vel.z), grounded: P.grounded, indoor: audIndoors, surface: audIndoors ? 'stone' : s === 3 || s === 7 ? 'grass' : s === 4 ? 'sand' : 'concrete' });
      }
    }
    // ambience: where the listener is (4 Hz)
    ambT -= dt;
    if (ambT <= 0) {
      ambT = 0.25;
      let wet = 0, n = 0;
      for (const r of [45, 140]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; n++; if (world.heightAt(cam.x + Math.cos(a) * r, cam.z + Math.sin(a) * r) < -0.5) wet += r < 100 ? 1.4 : 1; }
      const ground = world.groundAt ? world.groundAt(cam.x, cam.z, cam.y + 2) : world.heightAt(cam.x, cam.z);
      const h = env.state?.hours ?? 12, fm = env.state?.fogMode;
      const karl = fm === 'clear' ? 0 : fm === 'thick' ? 1 : Math.min(1, 0.25 + 0.55 * (Math.exp(-((h - 7) ** 2) / 5) + Math.exp(-((h - 21) ** 2) / 8)) + (env.state?.fogBoost || 0));
      // the road under the car / listener: street name (rails, Muni), tunnel (deck at our height), Lombard's brick
      const rp = pv ? pv.pos : cam, ne = world.graph?.nearestEdge?.(rp.x, rp.z, 14), e = ne?.edge;
      const ey = e?.ys ? e.ys[Math.min(e.ys.length - 1, ne.k || 0)] : NaN;
      aRoad.street = e?.name || ''; aRoad.brick = e?.kind === 'crooked'; aRoad.rails = RAIL_ST.test(aRoad.street) ? 1 : 0;
      aRoad.tunnel = e?.tunnel && Number.isFinite(ey) && Math.abs(rp.y - ey) < 5 ? 1 : 0;
      audIndoors = !!G.interiors?.sites?.some(S => S.inside?.(cam.x, cam.y, cam.z, 0.3));
      audio.ambience.update({ district: world.district(cam.x, cam.z), water: Math.min(1, wet / (n * 0.6)), night: env.night.value, altitude: Math.max(0, cam.y - (Number.isFinite(ground) ? ground : 0)),
        fog: karl, interior: !!pv && (rig.rig?.mode === 'hood' || rig.rig?.mode === 'cockpit'), indoors: audIndoors, street: aRoad.street, tunnel: aRoad.tunnel });
    }
  }

  // --------------------------------------------------------------- physics events -> damage / audio / systems
  sim.onEvent = (v, e) => {
    if (e.type === 'break') {
      const hit = world.props?.onHit?.(e.collider, e.speed, e.dir);
      if (hit !== false) { audio?.impact(Math.min(0.8, e.speed / 25), e.collider?.kind === 'pole' ? 'pole' : 'prop', G.audioAt?.(v)); if (v === player.vehicle) { rig.addShake(0.12); G.skills?.add?.('SMASH', 60); } G.emit('propSmash', e.collider); }
      return;
    }
    if (e.type === 'parked') { convertParked(e.collider, v); return; }
    if (e.type === 'impact') {
      const s = e.strength;
      if (e.kind !== 'ground' || s > 0.4) {
        damage(v, s * (e.kind === 'ground' ? 18 : 30));
        if (v === player.vehicle) {
          if (performance.now() - (v._lastSnd || 0) > 90) { audio?.impact(s, e.kind === 'ground' ? 'landing' : e.kind === 'pole' ? 'pole' : e.kind === 'rail' ? 'metal' : e.kind === 'prop' ? 'prop' : 'wall'); v._lastSnd = performance.now(); }
          rig.addShake(s * 0.7); input.rumble(s, s * 0.6, 160);
        }
        G.emit('impact', v, e);
      }
    } else if (e.type === 'land') {
      if (v === player.vehicle) { audio?.impact(e.strength * 0.7, 'landing'); rig.addShake(e.strength * 0.4); input.rumble(e.strength * 0.8, 0.3, 120); }
      G.emit('land', v, e);
    }
  };
  sim.onCarHit = (a, b, hit) => {
    const s = hit.strength;
    damage(a, s * 26); damage(b, s * 26);
    const pv = player.vehicle;
    if ((a === pv || b === pv) && performance.now() - (pv._lastSnd || 0) > 90) { audio?.impact(s, 'car'); pv._lastSnd = performance.now(); rig.addShake(s * 0.8); input.rumble(s, s, 180); }
    else if (s > 0.25 && audio) audio.impact(s * 0.7, 'car', G.audioAt?.(a));
    if (a.ai) G.traffic.onHit(a, s); if (b.ai) G.traffic.onHit(b, s);
    G.emit('carHit', a, b, hit);
  };
  // a hit parked car becomes a real physics car at the same spot (the static instance is hidden)
  function convertParked(c, hitter) {
    const P = world.props?.parked; const rec = P?.get(c.id);
    if (!rec || rec.hidden) { c.converting = false; return; }
    P.hide(c.id);
    const id = rec.model && CARS[rec.model] ? rec.model : 'sedan';
    const v = new Vehicle(id, { scene, paint: rec.paint, role: 'parked' });
    v.place(rec.x, rec.y + 0.05, rec.z, rec.yaw);
    v.driver = null; v.input.handbrake = 1; v.input.autoReverse = false;
    G.addVehicle(v);
    G.emit('parkedHit', v, hitter);
  }
  function damage(v, amt) {
    amt *= G.flags ? G.flags.damage : 1;
    if (amt < 1.5) return;
    // Festival / Free Roam damage is cosmetic: smoke and dents, but the player's car and the rivals never die (a dead car has no
    // throttle, and mid-race the stuck detector needs throttle: the car just rolled to a stop for good)
    const floor = !G.flags?.police && (v.role === 'player' || v.role === 'racer' || v.driver === 'racer') ? 20 : 0;
    v.health = Math.max(floor, v.health - amt * (v.role === 'player' ? 0.55 : 1));
    if (v.health <= 0 && !v.wrecked) { v.wrecked = true; G.emit('wrecked', v); }
  }
  G.damage = damage;

  // --------------------------------------------------------------- water / off-the-world recovery (every mode)
  // A car in the Bay gets heavy water drag, then after ~1.4 s the screen flashes and it's back at the last safe road
  // spot (festival-style); anything that fell below the world resets at once. NPC cars that end up in the water go away.
  let wetT = 0;
  function waterRecovery(dt) {
    const gu = post?.grade?.uniforms;
    if (gu?.uFlash && gu.uFlash.value > 0) gu.uFlash.value = Math.max(0, gu.uFlash.value - dt * 1.8);   // fade back in
    const v = player.vehicle, pos = v ? v.pos : player.pos;
    const inWater = pos.y < -0.5 && world.heightAt(pos.x, pos.z) < -0.4;
    if (v && inWater) {
      const b = v.body, k = Math.exp(-2.4 * dt);
      b.vel.x *= k; b.vel.z *= k; if (b.vel.y < 0) b.vel.y *= Math.exp(-5 * dt);
    }
    wetT = inWater ? wetT + dt : 0;
    if (wetT > 1.4 || pos.y < -60) {
      wetT = 0;
      if (post?.grade?.uniforms?.uFlash) { post.grade.uniforms.uFlashCol?.value?.setRGB?.(0, 0, 0); post.grade.uniforms.uFlash.value = 1; }
      player.resetToSafe?.();
      G.hud?.toast?.('Back on the road', pos.y < -60 ? 'You fell out of the world' : 'The Bay is cold', '', 1800);
      G.emit('recovered', inWater ? 'water' : 'void');
    }
    for (const o of vehicles) if (o !== v && o.ai && o.pos.y < -2 && world.heightAt(o.pos.x, o.pos.z) < -0.4) G.traffic?.removeCar?.(o);
  }

  // --------------------------------------------------------------- frame
  G.update = function (dt) {
    G.time += dt;
    player.update(dt);
    if (G.player.vehicle) G.player.vehicle.input.handbrake = G.player.vehicle.input.handbrake;
    G.traffic.update(dt, player.pos, camera, G.time);
    for (const s of G.systems) s.update?.(dt);
    PHYS_ENV.grip = G.weather?.gripMul ?? 1;          // wet roads (render/weather.js)
    sim.step(dt);
    waterRecovery(dt);
    // knocked parked cars (convertParked) stay real physics cars; far behind the player they are just a leak: a long
    // session of festival races left ~240 of them simulating across the city. Drop the far ones (max 2 / s).
    if ((G._parkedGC = (G._parkedGC || 0) - dt) <= 0) {
      G._parkedGC = 1;
      const p = player.pos; let n = 0;
      for (let i = vehicles.length - 1; i >= 0 && n < 2; i--) {
        const v = vehicles[i];
        // + cars the player stepped out of / swapped (role 'npc', no driver): kept longer so a walk around the block finds it
        if ((v.role !== 'parked' && v.role !== 'npc') || v === player.vehicle || v.driver || v.ai || v === player.enterCar) continue;
        if (G.traffic.cars.some(c => c.v === v)) continue;
        const r = v.role === 'npc' ? 700 : 350;
        if ((v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2 > r * r) { G.removeVehicle(v); n++; }
      }
    }
    // Free Roam (creative): [ / ] scrub the time of day, ; cycles the weather
    if (G.flags?.creative && G.state === 'play') {
      const st = env.state;
      if (input.keyPressed?.('BracketLeft')) { st.hours = (st.hours + 23) % 24; G.hud?.toast?.(`Time ${Math.floor(st.hours)}:00`, '', '', 900); }
      if (input.keyPressed?.('BracketRight')) { st.hours = (st.hours + 1) % 24; G.hud?.toast?.(`Time ${Math.floor(st.hours)}:00`, '', '', 900); }
      if (input.keyPressed?.('Semicolon') && G.weather?.set) {
        const K = ['clear', 'fog', 'overcast', 'rain', 'storm'], k = K[(K.indexOf(G.weather.kind) + 1) % K.length];
        G.weather.set(k, { transition: 3 }); G.hud?.toast?.('Weather: ' + k, '', '', 1200);
      }
    }
    const night = env.night.value;
    for (const v of vehicles) {
      v.sync(dt, night, G.time);
      // honking AI
      if (v.ai && v.ai.honk > 0.45 && audio && !v._honking) {
        v._honking = true; const d = v.pos.distanceTo(player.pos);
        if (d < 60) { const o = { id: 'npc' + v.uid, ...G.audioAt(v) }; audio.horn(true, v.def.mass > 2200 ? 'truck' : 'car', o); setTimeout(() => audio.horn(false, 'car', o), 380); }
      }
      if (v.ai && v.ai.honk <= 0) v._honking = false;
    }
    if (player.mode === 'car') rig.updateCar(dt, player.vehicle, input); else rig.updateFoot(dt, player, input);
    rig.apply(dt);
    carLights.update(vehicles, player, camera, night, G.time);
    carShadows.update(vehicles, camera, world);
    vehicleFx(dt);
    updateVoices(dt);
  };
  return G;
}
