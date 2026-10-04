// Ambient life inside the hero interiors: a few idle / seated people (the street crowd's human builder + pool) and an
// indoor sound bed (procedural murmur + a hall reverb on the effects bus). Only runs while the player is inside a room.
// Spots: interior meta `spots` [[x, y, z, yaw|null, 'stand'|'sit'], ...] from the Blender build (IGeo.spot); interiors
// built before spots existed get random free floor points of their rooms (not inside a collider, on the room floor).
import * as THREE from 'three';
import { createHumanPool } from '../../game/peds/looks.js';
import { spawnIdlePeds, realAvailable } from '../../game/peds/realhuman.js';
import { reverbIR } from '../../audio/dsp.js';

const MAX_PEOPLE = 9, MAX_BUSY = 16;
const STYLES = ['generic', 'generic', 'business', 'tourist', 'tourist'];
// sound character by interior kind (name heuristic): murmur level, reverb seconds, reverb send
const KINDS = {
  church: { mur: 0.05, sec: 4.2, send: 0.75, re: /church|cathedral|mission|chapel|peter/i },
  busy: { mur: 0.32, sec: 1.9, send: 0.45, re: /market|pier 39|arcade|machines|science|concourse|ballpark|arena|food|square|atrium/i },
  hall: { mur: 0.14, sec: 3.0, send: 0.6, re: /rotunda|opera|symphony|museum|library|legion|court|hall|palace|conservatory|academy/i },
  lobby: { mur: 0.16, sec: 1.5, send: 0.35, re: /./ },
};
export function kindOf(name = '') { for (const k of ['church', 'busy', 'hall', 'lobby']) if (KINDS[k].re.test(name)) return k; return 'lobby'; }

function inBox(c, x, y, z, pad) {
  const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
  return Math.abs(lx) < c.hx + pad && Math.abs(lz) < c.hz + pad && y > c.yMin - 0.2 && y < c.yMax;
}

// random free floor spots of an interior (deterministic per id)
function autoSpots(it, world, n) {
  let s = 0; for (const ch of it.id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [], cols = it.I.colliders || [], doors = it.I.doors || [];
  for (let tries = 0; tries < 400 && out.length < n; tries++) {
    const r = it.I.rooms[(rnd() * it.I.rooms.length) | 0];
    const lx = (rnd() * 2 - 1) * (r.hx - 1.2), lz = (rnd() * 2 - 1) * (r.hz - 1.2);
    const cs = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    const x = r.x + cs * lx + sn * lz, z = r.z - sn * lx + cs * lz;
    const y = world.groundAt(x, z, r.y0 + 0.6);
    if (Math.abs(y - r.y0) > 0.35) continue;
    if (cols.some(c => inBox(c, x, y + 0.9, z, 0.6))) continue;
    if (doors.some(d => Math.hypot(d.in[0] - x, d.in[2] - z) < 3.5)) continue;
    if (out.some(p => Math.hypot(p[0] - x, p[2] - z) < 2.2)) continue;
    out.push([x, y, z, null, 'stand']);
  }
  return out;
}

export function createInteriorLife(G) {
  let pool = null, people = [], cur = null, audio = null, t = 0, crowd = null, crowdGroup = null;
  const A = { state: 'idle', speed: 0, turn: 0, lying: 0 };

  function ensurePool() {
    if (pool) return pool;
    pool = createHumanPool(G.scene, { perStyleCap: 6, cap: MAX_PEOPLE + 2 });
    pool.budget = 1;
    return pool;
  }
  function clear() {
    for (const p of people) if (p.h) pool?.release(p.h);
    people = [];
    if (crowd) { try { crowd.dispose(); } catch (e) { /* ignore */ } crowd = null; }
    if (crowdGroup) { G.scene.remove(crowdGroup); crowdGroup = null; }
  }
  // realistic humans (peds/realhuman.js spawnIdlePeds) when available; the street pool's builder otherwise
  const ANIMS = ['idle', 'talk', 'listen', 'look', 'phone', 'idle'];
  function spawnReal(list) {
    try {
      if (!realAvailable()) return false;
      crowdGroup = new THREE.Group(); crowdGroup.name = 'heroInt:people'; G.scene.add(crowdGroup);
      crowd = spawnIdlePeds(crowdGroup, list.map((p, i) => {
        const [x, y, z, yaw, kind] = p.spot;
        const fy = yaw ?? Math.atan2(-(p.cx - x), -(p.cz - z)) + Math.sin(i * 3.1) * 0.9;
        return { x, y, z, yaw: fy, anim: kind === 'sit' ? 'sit' : ANIMS[i % ANIMS.length], style: STYLES[i % STYLES.length] };
      }));
      return true;
    } catch (e) { console.warn('[heroInt] real people', e); clear(); return false; }
  }

  function populate(it) {
    clear(); cur = it;
    const room0 = it.I.rooms[0], area = it.I.rooms.reduce((a, r) => a + r.hx * r.hz * 4, 0);
    // busy places (markets, stores, arenas, piers) get a bigger crowd; churches and galleries stay quiet
    const busy = /market|pier|mayfield|saxton|apple|arena|concourse|ferry|galleria|machines/i.test(it.I.name || '');
    const cap = busy ? MAX_BUSY : MAX_PEOPLE;
    const n = Math.max(3, Math.min(cap, Math.round(area / (busy ? 45 : 90))));
    let spots = (it.I.spots || []).slice();
    if (spots.length < n) spots = spots.concat(autoSpots(it, G.world, n - spots.length));
    // deterministic shuffle so the same interior keeps roughly the same crowd
    const order = spots.map((s, i) => [Math.sin(i * 12.9898 + (it.id.length * 7.1)) * 43758.5453 % 1, s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    people = order.slice(0, n).map((s, i) => ({ spot: s, h: null, i, phase: i * 1.7, look: 0, cx: room0.x, cz: room0.z }));
  }

  function audioSetup() {
    const core = G.audio?.core; if (!core?.ctx || audio) return audio;
    try {
      const ctx = core.ctx, mk = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const out = mk(0); out.connect(core.ambBus || core.ambVol);
      // hall reverb: effects bus (footsteps, doors, UI) + the murmur
      const send = mk(0), wet = mk(0.5);
      core.fxBus?.connect(send);
      // murmur: pink-ish noise through two formant band-passes, slow random level wander (many distant voices)
      const src = ctx.createBufferSource(); src.buffer = core.white || null; src.loop = true;
      const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 420; bp1.Q.value = 1.1;
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1150; bp2.Q.value = 1.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1900;
      const am = mk(0.6), am2 = mk(0.35);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23; const lfoG = mk(0.25); lfo.connect(lfoG); lfoG.connect(am.gain);
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.71; const lfoG2 = mk(0.15); lfo2.connect(lfoG2); lfoG2.connect(am2.gain);
      src.connect(bp1); bp1.connect(am); src.connect(bp2); bp2.connect(am2); am.connect(lp); am2.connect(lp);
      const mur = mk(0); lp.connect(mur); mur.connect(out);
      if (src.buffer) { src.start(); lfo.start(); lfo2.start(); }
      const murSend = mk(0.6); mur.connect(murSend);
      audio = { ctx, out, send, wet, mur, murSend, kind: null, convNode: null };
      return audio;
    } catch (e) { console.warn('[heroInt] audio', e); audio = { broken: true }; return audio; }
  }
  function audioKind(k) {
    if (!audio || audio.broken || audio.kind === k) return;
    const K = KINDS[k], ctx = audio.ctx;
    try {
      audio.convNode?.disconnect();
      const c = ctx.createConvolver(); c.normalize = false;
      c.buffer = reverbIR(ctx, 'heroint_' + k, { seconds: K.sec, tau: K.sec * 0.28, pre: 0.03, bright: 0.35, dark: 0.93, early: [[0.031, 0.45], [0.057, 0.35], [0.093, 0.25], [0.131, 0.18]] });
      audio.send.disconnect(); audio.murSend.disconnect();
      audio.send.connect(c); audio.murSend.connect(c); c.connect(audio.wet); audio.wet.connect(audio.out);
      audio.convNode = c; audio.kind = k;
    } catch (e) { console.warn('[heroInt] reverb', e); }
  }
  const ramp = (p, v) => { try { p.setTargetAtTime(v, audio.ctx.currentTime, 0.6); } catch { /* ignore */ } };

  return {
    get people() { return people; },
    /** it = the interior the player is in (or null); called every frame */
    update(dt, it) {
      t += dt;
      // ---- audio
      const a = audioSetup();
      if (a && !a.broken) {
        if (it) audioKind(kindOf(it.I.name));
        const K = it ? KINDS[kindOf(it.I.name)] : null;
        const night = G.env?.night?.value || 0;
        ramp(a.out.gain, it ? 1 : 0);
        // audio hook: the recorded indoor walla bed (src/audio/ambience.js) follows this level; the synth murmur only fills in
        if (G.audio?.core) G.audio.core.indoorMur = K ? K.mur * (1 - 0.45 * night) : 0;
        const walla = G.audio?.core?.assets?.ready?.('amb_indoor_walla') ? 0.25 : 1;
        ramp(a.mur.gain, K ? walla * K.mur * (1 - 0.45 * night) * Math.min(1, 0.4 + people.length / 6) : 0);
        ramp(a.send.gain, K ? K.send : 0);
      }
      // ---- people
      if (!it) { if (people.length) clear(); cur = null; return; }
      if (it !== cur) {
        populate(it);
        if (!spawnReal(people)) ensurePool();
      }
      if (crowd) { crowd.update(dt); return; }
      pool.frame();
      const cam = G.camera?.position;
      for (const p of people) {
        if (!p.h) {
          const h = pool.acquire(STYLES[p.i % STYLES.length]); if (!h) continue;
          p.h = h; h.root.visible = true;
          const [x, y, z, yaw] = p.spot;
          // face the room centre (or the spot's own facing) with a little jitter
          p.yaw = yaw ?? Math.atan2(-(p.cx - x), -(p.cz - z)) + Math.sin(p.i * 3.1) * 0.9;
          h.root.position.set(x, y, z); h.root.rotation.set(0, p.yaw, 0);
        }
        const h = p.h, near = cam ? (h.root.position.distanceToSquared(cam) < 900) : true;
        // idle sway every frame when near, every 4th frame far; now and then a slow look around
        p.look += dt;
        if (!near && ((t * 60) | 0) % 4 !== p.i % 4) continue;
        A.state = p.spot[4] === 'sit' ? 'sit' : 'idle';
        A.turn = Math.sin(t * 0.17 + p.phase) > 0.85 ? Math.sin(t * 0.9 + p.phase) * 0.6 : 0;
        h.update(near ? dt : dt * 4, A);
        h.root.position.set(p.spot[0], p.spot[1], p.spot[2]);
        h.root.rotation.y = p.yaw + A.turn * 0.35;
      }
    },
    dispose() { clear(); },
  };
}
