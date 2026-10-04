// Skill chain: drift, air, near miss, speed, wreckage. Banks after 3 s without a crash.
// Emits 'nearMiss' (other car) and 'skillBank' (points, state) for the festival (accolades, Festival Points).
import * as THREE from 'three';
const _f = new THREE.Vector3();
export function createSkills(G) {
  const S = { active: false, total: 0, mult: 1, timer: 0, feed: [], count: 0, status: '', statusT: 0, drift: 0, driftPts: 0, air: 0, nearCD: new Map() };
  const HOLD = 3.2;
  function add(name, pts, instant = true) {
    if (!S.active) { S.active = true; S.total = 0; S.mult = 1; S.count = 0; S.feed.length = 0; }
    S.total += pts;
    S.count++;
    S.mult = Math.min(10, 1 + Math.floor(S.count / 3));
    S.timer = 1;
    const last = S.feed[S.feed.length - 1];
    if (last && last.name === name && !instant) last.pts += pts; else S.feed.push({ name, pts });
    if (instant) G.audio?.ui(name.includes('NEAR') ? 'nearmiss' : 'skill');
  }
  function bank() {
    if (!S.active) return;
    const pts = Math.round(S.total * S.mult);
    if (pts > 0) {
      // skill points convert to XP at 40% (a level every few minutes of stylish driving), credits at 15%
      const xp = Math.round(pts * 0.4 * (G.festival?.perk?.('skillxp') ? 1.1 : 1)), cr = Math.round(pts * 0.15);
      G.economy.add(cr, xp, 'skills');
      G.hud?.toast(`Skill chain banked`, `${pts.toLocaleString()} pts · +${xp.toLocaleString()} XP · +$${cr.toLocaleString()}`, 'good', 3000);
      G.economy.stats.bestChain = Math.max(G.economy.stats.bestChain || 0, pts);
      G.emit('skillBank', pts, S);
    }
    S.total = pts; S.status = 'bank'; S.statusT = 1.2; S.active = false;
  }
  function lose() { if (!S.active) return; S.status = 'lost'; S.statusT = 1.2; S.active = false; G.audio?.ui('fail'); }
  S.add = add; S.bank = bank; S.lose = lose;
  G.on('impact', (v, e) => { if (v === G.player.vehicle && e.kind !== 'ground' && e.strength > 0.3) lose(); });
  G.on('carHit', (a, b, hit) => { const pv = G.player.vehicle; if ((a === pv || b === pv) && hit.strength > 0.25) lose(); });
  G.on('land', (v, e) => {
    if (v !== G.player.vehicle) return;
    const air = v.body.lastAir;
    if (air > 0.45) {
      add(air > 1.6 ? 'HUGE AIR' : air > 0.9 ? 'GREAT AIR' : 'AIR', 250 * air * air + 120);
      G.economy.stats.jumps++;
      if (air > G.economy.stats.bestAir) G.economy.stats.bestAir = air;
      G.emit('air', air);
    }
  });
  S.update = function (dt) {
    if (G.flags && !G.flags.skills) { if (S.active) { S.active = false; } G.hud?.skill(null); return; }
    const v = G.player.vehicle;
    if (v && G.state === 'play') {
      const b = v.body;
      // drift: sideslip angle of the velocity vs heading, at speed
      b.forward(_f);
      const sp = Math.hypot(b.vel.x, b.vel.z);
      let ang = 0;
      if (sp > 9 && b.grounded >= 3) { const fx = _f.x, fz = _f.z, fl = Math.hypot(fx, fz) || 1; ang = Math.acos(Math.min(1, Math.max(-1, (fx * b.vel.x + fz * b.vel.z) / (fl * sp)))); }
      if (ang > 0.26 && ang < 1.9 && b.fwdSpeed > 5) { const p = ang * sp * dt * 9; add('DRIFT', p, false); S.drift += dt; S.timer = 1; }
      else if (S.drift > 0) { if (S.drift > 1.2) G.emit('drift', S.drift); S.drift = 0; }
      // speed
      if (sp > 42) { add('SPEED', (sp - 42) * dt * 6, false); }
      if (b.speed * 3.6 > G.economy.stats.bestSpeed) G.economy.stats.bestSpeed = b.speed * 3.6;
      G.economy.stats.distance += sp * dt;
      // near misses against traffic
      if (sp > 16) {
        for (const o of G.vehicles()) {
          if (o === v || !o.driver) continue;
          const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z, d2 = dx * dx + dz * dz;
          if (d2 > 36 || Math.abs(o.pos.y - b.pos.y) > 2) continue;
          const d = Math.sqrt(d2) - (o.boxHalfX || 1) - 1;
          const cd = S.nearCD.get(o) || 0;
          if (G.time - cd > 3 && d < 2.6) { S.nearCD.set(o, G.time); S.pendingNear = S.pendingNear || new Map(); S.pendingNear.set(o, G.time); }
        }
        if (S.pendingNear) for (const [o, t] of S.pendingNear) {
          const dx = o.pos.x - b.pos.x, dz = o.pos.z - b.pos.z;
          if (dx * dx + dz * dz > 64) { S.pendingNear.delete(o); if (!S.hitRecent) { add('NEAR MISS', 200 + sp * 6); G.economy.stats.nearMisses = (G.economy.stats.nearMisses || 0) + 1; G.emit('nearMiss', o); } }
          else if (G.time - t > 2.5) S.pendingNear.delete(o);
        }
      }
      if (S.active) { S.timer -= dt / HOLD; if (S.timer <= 0 && S.drift === 0) bank(); }
    } else if (S.active) bank();
    if (S.statusT > 0) { S.statusT -= dt; if (S.statusT <= 0) S.status = ''; }
    G.hud?.skill(S.active || S.statusT > 0 ? { total: S.total, mult: S.mult, timer: Math.max(0, S.timer), feed: S.feed, status: S.status } : null);
  };
  return S;
}
