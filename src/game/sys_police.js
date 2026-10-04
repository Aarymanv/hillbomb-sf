// SFPD: patrols, wanted stars, witnesses, pursuit AI, roadblocks, busted / evaded.
import * as THREE from 'three';
import { Driver, lanePoint } from './drivers.js';
import { edgesInRing, findRoute } from '../world/roads.js';
import { ll } from '../world/latlon.js';
const _ring = [];

const UNITS = [2, 2, 3, 5, 7, 9];      // cop cars wanted per star level (0 = patrols)
// v1 positions (hand-built map) + the real stations' lat/lon for the 1:1 map
const STATIONS_V1 = [{ name: 'Mission Station', x: 760, z: 1010, ll: [37.7627, -122.4219] }, { name: 'Central Station', x: 1480, z: -700, ll: [37.7985, -122.4100] },
  { name: 'Richmond Station', x: -1060, z: 120, ll: [37.7800, -122.4643] }, { name: 'Park Station', x: -260, z: 700, ll: [37.7676, -122.4553] }];
const HOSPITAL_V1 = { x: 1250, z: 1300, name: 'SF General', ll: [37.7556, -122.4046] };
const at = (p, v2) => (v2 ? (([x, z]) => ({ ...p, x, z }))(ll(p.ll[0], p.ll[1])) : p);
const _f = new THREE.Vector3();

export function install(G) {
  const { world, audio } = G;
  const STATIONS = STATIONS_V1.map(p => at(p, !!world.v2));
  const P = {
    stars: 0, heat: 0, searching: false, lastSeen: { x: 0, z: 0 }, unseenT: 0, bustT: 0, cops: [], sirenVoices: new Map(),
    cooldown: 0, roadblockT: 0,
  };
  G.police = P;
  const rnd = Math.random;

  function playerPos() { return G.player.pos; }
  function playerVel() { const v = G.player.vehicle; return v ? v.body.vel : G.player.vel; }
  function copSees(c, range = 110) {
    const p = playerPos(), o = c.v.pos;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d < 25) return true;
    const t = world.colliders.raycast2D(o.x, o.z, p.x, p.z, Math.max(o.y, p.y) + 1.5, 0.2);
    return t >= 0.98;
  }
  function anyCopSees(range) { return P.cops.some(c => !c.v.wrecked && copSees(c, range)); }
  function nearestCopDist() { const p = playerPos(); let d = Infinity; for (const c of P.cops) if (!c.v.wrecked) d = Math.min(d, Math.hypot(c.v.pos.x - p.x, c.v.pos.z - p.z)); return d; }

  P.addStars = function (n, reason = '') {
    if (G.flags && !G.flags.police) return;
    const before = P.stars;
    P.stars = Math.min(5, Math.max(P.stars, Math.min(5, P.stars + n)));
    P.heat = Math.max(P.heat, P.stars);
    if (P.stars > before) {
      P.unseenT = 0; P.searching = false;
      const p = playerPos(); P.lastSeen.x = p.x; P.lastSeen.z = p.z;
      audio?.ui('wanted');
      if (before === 0) G.hud.toast('Wanted by SFPD', reason || 'The cops are on to you', 'cop', 3500);
      // patrol cars > 150 m out (they took 20-40 s to arrive) make room for pursuit units spawned 60-120 m out, unless the
      // camera can see them (no popping)
      if (before === 0) {
        const cam = G.camera.position; G.camera.getWorldDirection(_f);
        for (const c of P.cops.slice()) {
          const d = Math.hypot(c.v.pos.x - p.x, c.v.pos.z - p.z); if (d < 150) continue;
          const cx = c.v.pos.x - cam.x, cz = c.v.pos.z - cam.z, cd = Math.hypot(cx, cz) || 1;
          const seen = (cx * _f.x + cz * _f.z) / (cd * (Math.hypot(_f.x, _f.z) || 1)) > 0.4 && world.colliders.raycast2D(cam.x, cam.z, c.v.pos.x, c.v.pos.z, cam.y, 0.2) > 0.97;
          if (!seen) despawnCop(c);
        }
        spawnT = 0;
      }
      for (const c of P.cops) setPursuit(c, true);
    }
  };
  P.clear = function () {
    P.stars = 0; P.heat = 0; P.searching = false; P.unseenT = 0; P.bustT = 0;
    for (const c of P.cops) setPursuit(c, false);
  };

  function setPursuit(c, on) {
    c.v.sirenOn = on;
    c.d.mode = on ? 'pursuit' : 'traffic';
    c.d.target = on ? { x: 0, z: 0, vx: 0, vz: 0 } : null;
    c.d.speedMul = on ? 1.35 : 1;
    c.d.wps.length = 0; c.d.deadEnd = false;
    // re-seed lane following from its current position
    const n = world.graph.nearestEdge(c.v.pos.x, c.v.pos.z, 40);
    if (n) {
      c.v.body.forward(_f);
      const e = n.edge, k = Math.min(n.k, e.pts.length - 2);
      const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1];
      const dir = dx * _f.x + dz * _f.z >= 0 ? 1 : -1;
      c.d.start(e, dir, 0, dir > 0 ? n.s : e.len - n.s);
    }
  }

  P.spawnCop = (...a) => spawnCop(...a);
  function spawnCop(pursuit, nearPlayer = true) {
    const p = playerPos();
    G.camera.getWorldDirection(_f);
    // pursuit units spawn 60-120 m out (a chase starts in ~5-8 s; at 140-260 m they took ~25 s to arrive), out of sight:
    // behind / beside the camera, or in front only when a building hides the spot. Patrols keep 120-320 m.
    const R0 = pursuit ? 60 : 120, R1 = pursuit ? 120 : 320;
    const cam = G.camera.position, pn = pursuit ? world.graph.nearestNode?.(p.x, p.z, 80) : null;
    let ring = edgesInRing(world.graph, p.x, p.z, R0, R1, _ring);
    if (!ring.length && pursuit) ring = edgesInRing(world.graph, p.x, p.z, R0, 200, _ring);
    if (!ring.length) return null;
    for (let tries = 0; tries < 30; tries++) {
      const e = ring[(rnd() * ring.length) | 0];
      if (e.kind === 'crooked' || e.len < 25) continue;
      if (pursuit && (e.deck || e.kind === 'alley' || e.kind === 'plaza' || e.kind === 'park' || e.kind === 'mountain' || e.kind === 'highway')) continue;   // streets a unit can leave quickly
      const dir = rnd() < 0.5 ? 1 : -1;
      let s = 10 + rnd() * (e.len - 20);
      if (pursuit) {   // the lane point nearest the ring (long edges cross it far from their midpoint)
        const a = e.a, b = e.b, ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2)), dn = Math.hypot(a.x + ex * t - p.x, a.z + ez * t - p.z);
        const want = (R0 + R1) / 2 + (rnd() - 0.5) * (R1 - R0) * 0.8, off = Math.sqrt(Math.max(0, want * want - dn * dn));
        const sab = Math.max(10, Math.min(e.len - 10, t * e.len + (rnd() < 0.5 ? -off : off)));
        s = dir > 0 ? sab : e.len - sab;   // (lanePoint / Driver.start measure s from the travel-direction start)
      }
      const q0 = lanePoint(e, dir, 0, s, {});
      const d = Math.hypot(q0.x - p.x, q0.z - p.z);
      if (d < R0 || d > (pursuit ? Math.max(R1, 200) : R1)) continue;
      if (pursuit) {
        const cx = q0.x - cam.x, cz = q0.z - cam.z, cd = Math.hypot(cx, cz) || 1;
        if ((cx * _f.x + cz * _f.z) / (cd * (Math.hypot(_f.x, _f.z) || 1)) > 0.4 && world.colliders.raycast2D(cam.x, cam.z, q0.x, q0.z, cam.y, 0.2) > 0.97) continue;
      } else if (((q0.x - p.x) * _f.x + (q0.z - p.z) * _f.z) / d > 0.6 && d < 220) continue;
      const q = q0;
      if (pursuit && world.colliders.pointHit(q.x, world.heightAt(q.x, q.z) + 1, q.z, 1.6)) continue;   // not inside a parked car / prop
      // and a short legal drive to the suspect (not the far side of a one-way block / freeway): road route <= 1.6x + 40 m
      if (pursuit && pn) {
        const fn = dir > 0 ? e.b : e.a, path = fn === pn ? [] : findRoute(world.graph, fn, pn);
        if (!path) continue;
        let L = e.len - s; for (const st of path) L += (st.edge ?? st).len;
        if (L > d * 1.6 + 40) continue;
      }
      if (G.vehicles().some(v => (v.pos.x - q.x) ** 2 + (v.pos.z - q.z) ** 2 < 144)) continue;
      const v = G.spawnVehicle('police', q.x, q.z, Math.atan2(-q.hx, -q.hz), { y: e.deck ? q.y : undefined, role: 'cop' });
      v.driver = 'cop'; v.role = 'cop';
      // pursuit tuning: a little extra grip and power so they keep up on the hills
      v.params = { ...v.params, torque: v.params.torque * 1.12, grip: (v.params.grip || 1) * 1.05 }; v.body.P = v.params;
      const d2 = new Driver(v, world.graph, { mode: 'traffic', rnd });
      d2.start(e, dir, 0, s);
      v.ai = d2;
      const c = { v, d: d2, born: G.time };
      P.cops.push(c);
      if (pursuit) setPursuit(c, true);
      return c;
    }
    return null;
  }
  function despawnCop(c) {
    const i = P.cops.indexOf(c); if (i >= 0) P.cops.splice(i, 1);
    const sv = P.sirenVoices.get(c); if (sv) { sv.stop(); P.sirenVoices.delete(c); }
    G.removeVehicle(c.v);
  }

  // ---- crimes
  G.on('carjack', v => {
    if (v.role === 'cop') { P.addStars(2, 'Stole a police cruiser'); return; }
    if (anyCopSees(90)) P.addStars(1, 'Grand theft auto, in front of a cop');
    else if (rnd() < 0.35) setTimeout(() => P.addStars(1, 'A witness called it in'), 4000);
  });
  G.on('pedHit', (ped, speed) => { if (speed > 5) P.addStars(P.stars >= 1 ? 1 : 1, 'Hit a pedestrian'); });
  G.on('carHit', (a, b, hit) => {
    const pv = G.player.vehicle; if (!pv || (a !== pv && b !== pv)) return;
    const other = a === pv ? b : a;
    other.lastPlayerHit = G.time;
    // only when the player did the ramming: a cruiser boxing in a stopped player used to add a star per bump
    if (other.role === 'cop' && hit.strength > 0.08) { if (pv.body.speed > 4 && pv.body.speed >= other.body.speed * 0.8) P.addStars(1, 'Assaulted an officer (with a car)'); return; }
    if (hit.strength > 0.3 && other.driver && anyCopSees(60)) P.addStars(1, 'Reckless driving');
  });
  G.on('propSmash', () => { if (anyCopSees(50)) P.addStars(1, 'Destruction of city property'); });
  G.on('wrecked', v => { if (v.role === 'cop' && P.stars > 0 && G.time - (v.lastPlayerHit ?? -99) < 5) P.addStars(1, 'Cruiser destroyed'); });

  // ---- busted / wasted
  function busted() {
    const fine = Math.max(500, Math.round(G.economy.money * 0.1));
    G.economy.money = Math.max(0, G.economy.money - fine); G.economy.save();
    audio?.ui('busted');
    G.hud.banner('BUSTED', `Fine: $${fine.toLocaleString()}`, 'blue', 3200);
    G.skills?.lose?.();
    respawnAt(nearest(STATIONS), true);
  }
  G.on('wasted', () => {
    const bill = Math.max(300, Math.round(G.economy.money * 0.06));
    G.economy.money = Math.max(0, G.economy.money - bill); G.economy.save();
    audio?.ui('fail');
    G.hud.banner('WASTED', `Hospital bill: $${bill.toLocaleString()}`, 'red', 3200);
    respawnAt(at(HOSPITAL_V1, !!world.v2), true);
  });
  G.on('drown', () => { G.hud.banner('SPLASH', 'The Bay is cold', 'blue', 2200); respawnAt(null, false); });
  function nearest(list) { const p = playerPos(); return list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; }
  function respawnAt(place, onFoot) {
    P.clear();
    for (const c of P.cops.slice()) despawnCop(c);
    const pl = G.player;
    pl.health = 100;
    if (!place) { // back to the last safe road spot
      const s = pl.lastSafe;
      if (pl.vehicle) { pl.vehicle.body.place(s.x, s.y + 0.4, s.z, s.yaw); pl.vehicle.health = Math.max(pl.vehicle.health, 50); }
      else { pl.pos.set(s.x, world.groundAt(s.x, s.z, 999), s.z); }
      G.rig.snap();
      return;
    }
    if (pl.vehicle) pl.exitVehicle(true);
    const n = world.graph.nearestEdge(place.x, place.z, 200);
    const x = n ? n.x + 4 : place.x, z = n ? n.z + 4 : place.z;
    pl.pos.set(x, world.groundAt(x, z, 999), z); pl.vel.set(0, 0, 0); pl.knocked = 0;
    G.rig.snap();
    G.hud.toast(place.name, 'You walk out onto the street.', '', 3000);
  }

  // ---- blips
  const prevBlips = G.blips;
  G.blips = () => {
    const out = prevBlips ? prevBlips() : [];
    for (const c of P.cops) if (!c.v.wrecked && (P.stars > 0 || Math.hypot(c.v.pos.x - G.player.pos.x, c.v.pos.z - G.player.pos.z) < 150)) out.push({ x: c.v.pos.x, z: c.v.pos.z, type: 'cop', phase: c.v.uid * 0.37, edge: P.stars > 0 });
    return out;
  };

  // ---- update
  let spawnT = 0;
  G.systems.push({
    update(dt) {
      if (G.state !== 'play') return;
      if (G.flags && !G.flags.police) {
        if (P.cops.length) for (const c of P.cops.slice()) despawnCop(c);
        for (const [c, sv] of P.sirenVoices) { sv.stop(); P.sirenVoices.delete(c); }
        return;
      }
      const p = playerPos(), pv = playerVel();
      // target unit count
      const want = UNITS[P.stars];
      spawnT -= dt;
      const live = P.cops.filter(c => !c.v.wrecked);
      if (live.length < want && spawnT <= 0) { spawnCop(P.stars > 0); spawnT = P.stars > 0 ? 1.5 : 4; }
      // speeding past a patrol
      if (P.stars === 0 && G.player.vehicle && G.player.vehicle.body.speed > 38) {
        for (const c of P.cops) if (Math.hypot(c.v.pos.x - p.x, c.v.pos.z - p.z) < 22) { P.addStars(1, 'Speeding past a patrol car'); break; }
      }
      // pursuit update
      let seen = false;
      for (const c of P.cops.slice()) {
        const v = c.v;
        const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
        if (v.wrecked || v.health <= 0 || v.body.up(_f).y < 0.2) { v.driver = null; v.sirenOn = false; v.input.throttle = 0; v.input.brake = 1; v.input.autoReverse = false; v.input.reverse = false; if (d > 220) despawnCop(c); continue; }
        if (v.driver !== 'cop') { const i = P.cops.indexOf(c); if (i >= 0) P.cops.splice(i, 1); continue; } // stolen by the player
        if ((d > 420) || (P.stars === 0 && d > 380)) { despawnCop(c); continue; }
        if (P.stars > 0) {
          const sees = copSees(c, 140);
          if (sees) { seen = true; P.lastSeen.x = p.x; P.lastSeen.z = p.z; }
          const tgt = c.d.target;
          if (sees || P.searching === false) { tgt.x = p.x; tgt.z = p.z; tgt.vx = pv.x; tgt.vz = pv.z; }
          else { const r = P.unseenT < 12 ? 6 : 60 + Math.min(140, (P.unseenT - 12) * 6); tgt.x = P.lastSeen.x + Math.sin(G.time * 0.3 + v.uid) * r; tgt.z = P.lastSeen.z + Math.cos(G.time * 0.27 + v.uid) * r; tgt.vx = tgt.vz = 0; }   // first 12 s: drive to the last-seen spot (the 60 m search ring kept units circling a parked suspect they couldn't see), then the search widens
          c.d.mode = d < 70 && sees ? 'pursuit' : 'pursuit';
        }
        // route planning toward the target every ~2 s (staggered per car)
        if (P.stars > 0 && c.d.target) {
          c.replanT = (c.replanT ?? (v.uid % 10) * 0.2) - dt;
          if (c.replanT <= 0) {
            c.replanT = 2 + (d < 120 ? -1 : 0);
            const from = c.d.nextNode();
            const tn = world.graph.nearestEdge(c.d.target.x, c.d.target.z, 80);
            if (from && tn) {
              const to = tn.s < tn.edge.len / 2 ? tn.edge.a : tn.edge.b;
              const r = from === to ? [] : findRoute(world.graph, from, to);
              if (r) c.d.replan(r.map(q => q.edge).concat(tn.edge));
            }
          }
        }
        c.d.drive(dt, G.traffic.ctx);
        // when adjacent and the player is slow, stop and block
        if (P.stars > 0 && d < 9 && (G.player.mode === 'foot' || G.player.vehicle.body.speed < 3)) { v.input.throttle = 0; v.input.brake = 1; v.input.autoReverse = false; v.input.reverse = false; }
      }
      // wanted decay: out of sight -> searching -> evaded
      if (P.stars > 0) {
        if (seen) { P.unseenT = 0; P.searching = false; }
        else {
          P.unseenT += dt;
          if (P.unseenT > 3) P.searching = true;
          const need = 8 + P.stars * 3;
          const farFromLast = Math.hypot(p.x - P.lastSeen.x, p.z - P.lastSeen.z) > 90 + P.stars * 25;
          // lying low works too, it just takes twice as long (a player parked out of sight 90 m from where they were last
          // seen used to stay wanted forever: the 60 m search circle never reached them and evading needed distance)
          if (P.unseenT > need && (farFromLast || P.unseenT > need * 2)) {
            const reward = 250 * P.stars;
            G.economy.add(reward, 300 * P.stars);
            audio?.ui('evaded');
            G.hud.banner('EVADED', `+${reward.toLocaleString()} $ for the getaway`, 'gold', 2400);
            P.clear();
          }
        }
        // busted check
        const nd = nearestCopDist();
        const slow = G.player.mode === 'foot' ? Math.hypot(pv.x, pv.z) < 2.5 : G.player.vehicle.body.speed < 1.6;
        if (nd < 8 && slow) { P.bustT += dt; if (P.bustT > (G.player.mode === 'foot' ? 1.5 : 3)) busted(); }
        else P.bustT = Math.max(0, P.bustT - dt);
        G.hud.readoutBust?.(P.bustT);
        // roadblocks at 3+ stars
        P.roadblockT -= dt;
        if (P.stars >= 3 && P.roadblockT <= 0 && G.player.vehicle) { P.roadblockT = 25; roadblock(); }
      }
      // sirens: nearest 2 cruisers with sirens on
      const sirens = P.cops.filter(c => c.v.sirenOn && !c.v.wrecked).map(c => [c, Math.hypot(c.v.pos.x - G.camera.position.x, c.v.pos.z - G.camera.position.z)]).sort((a, b) => a[1] - b[1]).slice(0, 2);
      const keep = new Set(sirens.map(s => s[0]));
      for (const [c, sv] of P.sirenVoices) if (!keep.has(c)) { sv.stop(); P.sirenVoices.delete(c); }
      G.camera.getWorldDirection(_f);
      for (const [c, d] of sirens) {
        let sv = P.sirenVoices.get(c);
        if (!sv && audio) { sv = audio.createSiren(); sv.setActive(true); P.sirenVoices.set(c, sv); }
        if (!sv) continue;
        const dx = c.v.pos.x - G.camera.position.x, dz = c.v.pos.z - G.camera.position.z;
        const pan = THREE.MathUtils.clamp((dx * -_f.z + dz * _f.x) / Math.max(1, d), -1, 1);
        const vel = -(c.v.body.vel.x * dx + c.v.body.vel.z * dz) / Math.max(1, d);
        sv.setSpatial({ distance: d, pan, velocity: vel });
        if (((G.time + c.v.uid) % 9) < 0.02) sv.setMode?.(rnd() < 0.5 ? 'yelp' : 'wail');
      }
    },
  });

  function roadblock() {
    // two cruisers parked across the road ~110 m ahead of the player
    const v = G.player.vehicle; if (!v) return;
    v.body.forward(_f);
    const ax = G.player.pos.x + _f.x * 110, az = G.player.pos.z + _f.z * 110;
    const n = world.graph.nearestEdge(ax, az, 30);
    if (!n || n.edge.deck) return;
    const e = n.edge, k = Math.min(n.k, e.pts.length - 2);
    const dx = e.pts[k + 1][0] - e.pts[k][0], dz = e.pts[k + 1][1] - e.pts[k][1], L = Math.hypot(dx, dz) || 1;
    const rx = -dz / L, rz = dx / L;
    const across = Math.atan2(-rx, -rz);
    for (const off of [-e.width / 4, e.width / 4]) {
      const x = n.x + rx * off, z = n.z + rz * off;
      if (G.vehicles().some(o => (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2 < 16)) continue;
      const c = G.spawnVehicle('police', x, z, across + (off > 0 ? 0.25 : -0.25), { role: 'cop' });
      c.driver = 'cop'; c.sirenOn = true;
      const d2 = new Driver(c, world.graph, { mode: 'traffic', rnd }); d2.state = 'stopped';
      c.ai = d2;
      const cc = { v: c, d: d2, born: G.time, roadblock: true };
      d2.target = { x: 0, z: 0, vx: 0, vz: 0 };
      d2.start(e, 1, 0, Math.max(0, n.s));
      P.cops.push(cc);
      setTimeout(() => { if (P.cops.includes(cc)) { d2.state = 'drive'; setPursuit(cc, P.stars > 0); } }, 14000);
    }
    G.hud.toast('Roadblock ahead', 'SFPD is closing the road', 'cop', 2500);
  }
}
