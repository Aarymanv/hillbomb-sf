// GPS + the G.events facade. The festival layer (sys_festival.js -> game/festival/*) owns every activity: races,
// stunts, stories, showcases. This module keeps the small shared API other systems use:
//   G.gps { setTarget(x, z, color), points, color, target, timer }   route line for the minimap / big map
//   G.events { active, endRace(result), restart() / restartRace(), activeInfo(), routePoints(fx, fz, tx, tz), records }
// G.events.active is non-null while a festival race runs (legacy objective card / pause menu read it).
import { roadPath } from './festival/util.js';

export function install(G) {
  const gps = { points: null, color: '#b36bff', target: null, timer: 0 };
  G.gps = gps;
  gps.setTarget = (x, z, color = '#b36bff') => {
    gps.target = x == null ? null : { x, z }; gps.color = color; gps.timer = 0;
    if (x == null) gps.points = null;
  };
  const E = {
    active: null,
    records: G.economy.records,
    routePoints: (fx, fz, tx, tz) => {
      // the player's direction of travel (car velocity when moving, else the way it / they face)
      const v = G.player.vehicle; let hx = 0, hz = 0;
      if (v && Math.abs(fx - v.pos.x) + Math.abs(fz - v.pos.z) < 5) { const b = v.body; if (b.speed > 2) { hx = b.vel.x / b.speed; hz = b.vel.z / b.speed; } else { const y = b.yaw?.() ?? 0; hx = -Math.sin(y); hz = -Math.cos(y); } }
      return roadPath(G.world, fx, fz, tx, tz, hx, hz);
    },
    endRace(result = 'quit') { if (G.festival?.activity) G.festival.endEvent(result); E.active = null; },
    restartRace() { G.festival?.restartEvent?.(); },
    restart() { G.festival?.restartEvent?.(); },
    activeInfo() { return E.active?.R || null; },
    startRace(id) { return G.festival?.startEvent?.(id) ?? false; },
  };
  G.events = E;
  G.systems.push({
    update(dt) {
      if (G.state !== 'play' || !gps.target || G.festival?.activity) return;
      gps.timer -= dt;
      const p = G.player.pos;
      if (gps.timer <= 0) { gps.timer = 1.5; gps.points = E.routePoints(p.x, p.z, gps.target.x, gps.target.z); }
      if (Math.hypot(p.x - gps.target.x, p.z - gps.target.z) < 25) { gps.setTarget(null); G.audio?.ui('checkpoint'); G.hud?.toast?.('You have arrived', '', 'good', 2000); }
    },
  });
}
