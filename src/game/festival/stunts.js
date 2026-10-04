// World stunts: speed traps, speed zones, danger signs, drift zones, trailblazers. 1-3 stars per stunt, records,
// world props (camera poles, gantries, danger boards, flags, trailblazer pillars) merged into a few meshes.
import * as THREE from 'three';
import { STUNTS, STUNT_TYPES } from './catalog.js';
import { ll, snapRoad, pathBetween, makeRoute, makeTracker, trackUpdate, trackInit, speedVal, fmtTime, fmtNum, clamp, yawOf } from './util.js';
import { Kit, std, glowMat } from './kit.js';
import { createDriftMeter } from './drift.js';

const UNITS = G => (G.hud?.units === 'kmh' ? 'kmh' : 'mph');
export function createStunts(F) {
  const { G, world } = F;
  const ST = { list: [], byId: {} };
  const kit = new Kit();
  const g = world.graph;

  // ---------------------------------------------------------------- crest candidates (danger signs)
  const crests = [];
  for (const n of g.nodes) {
    if (n.edges.length < 2) continue;
    const h0 = world.heightAt(n.x, n.z);
    for (const e of n.edges) {
      if (e.len < 40 || e.deck || e.main === false || e.restricted || e.kind === 'alley' || e.kind === 'plaza') continue;
      const o = e.a === n ? e.b : e.a;
      const dx = (o.x - n.x) / e.len, dz = (o.z - n.z) / e.len, r = (n.radius || 6) + (world.v2 ? 24 : 10);   // v2: sample past the flat intersection plateau
      const hA = world.heightAt(n.x + dx * r, n.z + dz * r), hB = world.heightAt(n.x - dx * r, n.z - dz * r);
      const drop = h0 - hA, rise = h0 - hB;
      if (drop > (world.v2 ? 2.5 : 1.8) && rise > (world.v2 ? -3 : -1.5)) crests.push({ x: n.x, z: n.z, dx, dz, r: n.radius || 6, score: drop + Math.max(0, rise) * 0.8, name: e.name, used: false });
    }
  }

  // ---------------------------------------------------------------- resolve catalog stunts
  const put = (x, z) => ({ x, z, y: world.groundAt(x, z, world.heightAt(x, z) + 3) });
  for (const def of STUNTS) {
    const T = { ...def, def, info: STUNT_TYPES[def.type], broken: false, state: null };
    try {
      if (def.type === 'trap') {
        const r = snapRoad(world, def.ll[0], def.ll[1], def.hint, 300);
        if (!r) throw 0;
        Object.assign(T, { x: r.x, z: r.z, dx: r.dx, dz: r.dz, w: r.edge.width, y: r.edge.deck ? world.groundAt(r.x, r.z, 999) : world.groundAt(r.x, r.z, world.heightAt(r.x, r.z) + 3) });
        propTrap(T);
      } else if (def.type === 'zone' || def.type === 'drift') {
        const ra = snapRoad(world, def.ll[0], def.ll[1], def.hint || null, 300), rb = snapRoad(world, def.to[0], def.to[1], def.hint || null, 300);
        const th = ra && rb ? pathBetween(world, ra, rb) : null;
        if (!th) throw 0;
        const R = makeRoute(world, th, { startS: 0, smoothIters: 1 });
        if (R.L < 60) throw 0;
        Object.assign(T, { R, x: R.pts[0][0], z: R.pts[0][1], y: R.ys[0], ex: R.pts[R.n - 1][0], ez: R.pts[R.n - 1][1] });
        const dx = R.pts[Math.min(3, R.n - 1)][0] - T.x, dz = R.pts[Math.min(3, R.n - 1)][1] - T.z, l = Math.hypot(dx, dz) || 1;
        T.dx = dx / l; T.dz = dz / l;
        if (def.type === 'drift' && !def.stars) { const L = R.L; T.stars = [12, 26, 44].map(k => Math.round(k * L / 500) * 500); }
        propGate(T, def.type === 'zone' ? '#4fd2ff' : '#ff6ad5');
      } else if (def.type === 'danger') {
        const [x0, z0] = ll(def.ll[0], def.ll[1]);
        const hx = Math.sin((def.dir ?? 0) * Math.PI / 180), hz = -Math.cos((def.dir ?? 0) * Math.PI / 180);
        let best = null, bs = -Infinity;
        // hint = the street the jump is on (real SF crests: Filbert, Hyde, Lombard...): only its crests, wider search
        const hint = def.hint?.toLowerCase(), onHint = c => !hint || c.name?.toLowerCase().includes(hint);
        for (const pass of hint ? [true, false] : [false]) {
        for (const c of crests) {
          if (c.used || (pass && !onHint(c))) continue;
          const d = Math.hypot(c.x - x0, c.z - z0); if (d > (pass ? 520 : 340)) continue;
          const s = c.score - d / 90 + (def.dir != null ? (c.dx * hx + c.dz * hz) * 1.5 : 0);
          if (s > bs) { bs = s; best = c; }
        }
        if (best) break;
        }
        if (!best) throw 0;
        // one sign per crest (and keep signs 120 m apart)
        for (const c of crests) if (Math.hypot(c.x - best.x, c.z - best.z) < 120) c.used = true;
        Object.assign(T, { x: best.x, z: best.z, dx: best.dx, dz: best.dz, r: best.r, y: world.groundAt(best.x, best.z, world.heightAt(best.x, best.z) + 3) });
        propDanger(T);
      } else if (def.type === 'trail') {
        const a = snapRoad(world, def.ll[0], def.ll[1], def.hint || null, 300), b = snapRoad(world, def.to[0], def.to[1], null, 300);
        if (!a || !b) throw 0;
        Object.assign(T, { x: a.x, z: a.z, ex: b.x, ez: b.z, y: world.groundAt(a.x, a.z, world.heightAt(a.x, a.z) + 3), dist: Math.hypot(b.x - a.x, b.z - a.z) });
        if (!def.stars) T.stars = [T.dist / 17 + 14, T.dist / 22 + 9, T.dist / 27 + 6].map(v => Math.round(v));
        propTrail(T);
      }
    } catch { T.broken = true; }
    ST.list.push(T); ST.byId[T.id] = T;
  }
  // world props
  const group = kit.build({ std: std(), metal: std({ metalness: 0.7, roughness: 0.35 }), glow: glowMat() }, { shadows: { std: true, metal: true } });
  group.name = 'festival-stunt-props';
  G.scene.add(group);
  ST.group = group;
  const glowM = group.children.find(m => m.name === 'glow')?.material;

  ST.thresholdText = T => T.stars.map(v => fmtBest(T, v)).join(' / ');
  // markers
  for (const T of ST.list) {
    if (T.broken) continue;
    F.markers.add({ id: 'st:' + T.id, kind: T.type === 'drift' ? 'driftzone' : T.type, icon: T.type === 'drift' ? 'driftzone' : T.type, group: 'stunt', x: T.x, z: T.z, color: T.info.color,
      title: T.name, sub: T.info.name, meta: '★ ' + ST.thresholdText(T), beam: false, iconSize: 3.2, iconH: 5.5, iconRange: 300 });
  }
  ST.refreshMarkers = function () {
    for (const T of ST.list) if (!T.broken) { const r = F.S.stunts[T.id]; F.markers.update('st:' + T.id, { sub: `${T.info.name}${r ? ' · ' + '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : ''}`, meta: `${r?.best != null ? 'Best ' + fmtBest(T, r.best) + ' · ' : ''}★ ${ST.thresholdText(T)}`, done: r?.stars >= 3 }); }
  };

  // ---------------------------------------------------------------- props
  function propTrap(T) {
    const rx = -T.dz, rz = T.dx, off = T.w / 2 + 2.2;
    const px = T.x + rx * off, pz = T.z + rz * off, y = T.y;
    const yaw = yawOf(T.dx, T.dz);
    kit.cyl('metal', 0.14, 0.16, 6.4, '#2a2d33', { x: px, y: y + 3.2, z: pz });
    kit.box('metal', 0.7, 0.5, 1.1, '#23262d', { x: px - rx * 0.6, y: y + 6.2, z: pz - rz * 0.6, ry: yaw });
    kit.box('glow', 0.3, 0.14, 0.05, '#ff5a36', { x: px - rx * 0.6 - T.dx * 0.56, y: y + 6.2, z: pz - rz * 0.6 - T.dz * 0.56, ry: yaw });
    kit.box('glow', 0.12, 1.2, 0.12, '#5aa9ff', { x: px, y: y + 5.1, z: pz });
    world.colliders.add({ x: px, z: pz, hx: 0.3, hz: 0.3, yaw: 0, yMin: y - 1, yMax: y + 7, kind: 'pole' });
  }
  function propGate(T, color) {
    for (const [x, z, dx, dz, end] of [[T.x, T.z, T.dx, T.dz, false], [T.ex, T.ez, T.dx, T.dz, true]]) {
      const e = g.nearestEdge(x, z, 30), w = e ? e.edge.width : 14, y = world.groundAt(x, z, world.heightAt(x, z) + 3);
      const rx = -dz, rz = dx, off = w / 2 + 1.6;
      for (const s of [-1, 1]) {
        const px = x + rx * off * s, pz = z + rz * off * s;
        kit.cyl('metal', 0.13, 0.15, 5.6, '#2a2d33', { x: px, y: y + 2.8, z: pz });
        kit.box('glow', 0.18, 2.2, 0.18, end ? '#ffffff' : color, { x: px, y: y + 4.2, z: pz });
        world.colliders.add({ x: px, z: pz, hx: 0.28, hz: 0.28, yaw: 0, yMin: y - 1, yMax: y + 6, kind: 'pole' });
      }
      // pennant banner hanging off the right pole
      kit.box('std', 0.05, 1.6, 1.0, color, { x: x + rx * off, y: y + 4.2, z: z + rz * off, ry: yawOf(dx, dz), sz: 1 });
    }
  }
  function propDanger(T) {
    const rx = -T.dz, rz = T.dx;
    const x = T.x - T.dx * (T.r + 6) + rx * (T.r + 1.2), z = T.z - T.dz * (T.r + 6) + rz * (T.r + 1.2), y = world.groundAt(x, z, world.heightAt(x, z) + 3);
    const yaw = yawOf(-T.dx, -T.dz);
    kit.cyl('metal', 0.05, 0.05, 2.6, '#8a8f99', { x, y: y + 1.3, z });
    kit.box('std', 1.15, 1.15, 0.06, '#ffc21a', { x, y: y + 2.75, z, ry: yaw, rz: Math.PI / 4 });
    kit.box('std', 0.9, 0.9, 0.07, '#141414', { x: x - T.dx * 0.01, y: y + 2.75, z: z - T.dz * 0.01, ry: yaw, rz: Math.PI / 4, sx: 0.12, sy: 0.55 });
    kit.box('glow', 0.14, 0.14, 0.08, '#ffd23f', { x, y: y + 3.7, z });
  }
  function propTrail(T) {
    const y = T.y;
    const e = g.nearestEdge(T.x, T.z, 30), w = e ? e.edge.width : 12;
    const dx = e ? (e.edge.pts[Math.min(e.k + 1, e.edge.pts.length - 1)][0] - e.edge.pts[e.k][0]) : 1, dz = e ? (e.edge.pts[Math.min(e.k + 1, e.edge.pts.length - 1)][1] - e.edge.pts[e.k][1]) : 0;
    const l = Math.hypot(dx, dz) || 1, rx = -dz / l, rz = dx / l, off = w / 2 + 1.8;
    for (const s of [-1, 1]) {
      const px = T.x + rx * off * s, pz = T.z + rz * off * s;
      kit.box('std', 0.9, 7, 0.9, '#1b1c22', { x: px, y: y + 3.5, z: pz });
      kit.box('glow', 0.95, 2.2, 0.95, '#ff8a1d', { x: px, y: y + 6, z: pz });
      world.colliders.add({ x: px, z: pz, hx: 0.5, hz: 0.5, yaw: 0, yMin: y - 1, yMax: y + 7.5, kind: 'pole' });
    }
  }

  // ---------------------------------------------------------------- runtime
  const near = []; let scanT = 0, flash = 0, jump = null, run = null;
  const meter = createDriftMeter();
  ST.update = function (dt) {
    if (glowM) glowM.color.setScalar(1 + G.env.night.value * 1.8);
    if (flash > 0) { flash = Math.max(0, flash - dt * 1.6); G.post.grade.uniforms.uFlash.value = flash; if (flash === 0) G.post.grade.uniforms.uFlashCol.value.setRGB(1, 1, 1); }
    const pv = G.player.vehicle;
    if (!pv || F.activity) { if (run) cancelRun(); jump = null; return; }
    const b = pv.body, px = b.pos.x, pz = b.pos.z;
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.35; near.length = 0; for (const T of ST.list) if (!T.broken && Math.hypot(T.x - px, T.z - pz) < 260) near.push(T); }
    // ---- active zone / drift zone / trailblazer
    if (run) updateRun(dt, pv);
    for (const T of near) {
      if (T.type === 'trap') {
        const along = (px - T.x) * T.dx + (pz - T.z) * T.dz, lat = Math.abs((px - T.x) * -T.dz + (pz - T.z) * T.dx);
        const side = along >= 0 ? 1 : -1;
        if (T.side && side !== T.side && lat < T.w / 2 + 6 && Math.abs(along) < 20) trapHit(T, b.speed);
        T.side = side;
      } else if ((T.type === 'zone' || T.type === 'drift') && !run) {
        const along = (px - T.x) * T.dx + (pz - T.z) * T.dz, lat = Math.abs((px - T.x) * -T.dz + (pz - T.z) * T.dx);
        if (T.prevAlong !== undefined && T.prevAlong < 0 && along >= 0 && lat < 14 && b.vel.x * T.dx + b.vel.z * T.dz > 4) startRun(T, pv);
        T.prevAlong = along;
      } else if (T.type === 'trail' && !run) {
        const d = Math.hypot(px - T.x, pz - T.z);
        if (d < 12 && b.speed > 5 && !T.cool) startRun(T, pv);
        if (d > 40) T.cool = false;
      }
    }
    // ---- danger signs: track the flight after a crest
    if (!jump && b.grounded === 0) {
      for (const T of near) {
        if (T.type !== 'danger') continue;
        const along = (px - T.x) * T.dx + (pz - T.z) * T.dz, lat = Math.abs((px - T.x) * -T.dz + (pz - T.z) * T.dx);
        if (along > -4 && along < 40 && lat < 12) { jump = { T, x0: px, z0: pz, t: 0 }; break; }
      }
    }
    if (jump) {
      jump.t += dt;
      if (b.grounded >= 2) {
        const d = Math.hypot(px - jump.x0, pz - jump.z0) + 4;
        const T = jump.T; jump = null;
        if (d > 12) score(T, d, `${Math.round(UNITS(G) === 'kmh' ? d : d * 3.281)} ${UNITS(G) === 'kmh' ? 'M' : 'FT'}`);
      } else if (jump.t > 8) jump = null;
    }
  };
  function trapHit(T, speed) {
    const mph = speed * 2.23694;
    flash = 0.4; G.post.grade.uniforms.uFlashCol.value.setRGB(1, 1, 1);
    G.audio?.ui('checkpoint');
    score(T, mph, `${Math.round(speedVal(speed, UNITS(G)))} ${UNITS(G) === 'kmh' ? 'KM/H' : 'MPH'}`);
    G.skills?.add?.('SPEED TRAP', Math.round(mph * 6));
  }
  function startRun(T, pv) {
    run = { T, t: 0, tr: T.R ? makeTracker(T.R) : null };
    if (run.tr) trackInit(T.R, run.tr, pv.pos.x, pv.pos.z);
    if (T.type === 'drift') meter.reset();
    if (T.type === 'trail') {
      F.markers.add({ id: 'st-trail-end', kind: 'target', icon: 'finish', group: 'stunt-run', x: T.ex, z: T.ez, color: T.info.color, beamH: 140, title: T.name, edge: true });
      F.overlay.banner(T.info.name, T.name.replace(' Trailblazer', ''), 'Any route. Beat the clock.', T.info.color, 2200);
    }
    G.audio?.ui('confirm');
  }
  function cancelRun(msg) {
    if (!run) return;
    if (run.T.type === 'trail') { F.markers.remove('st-trail-end'); run.T.cool = true; }
    F.overlay.live(null);
    if (msg) F.overlay.stunt(run.T.name, msg, -1, '', run.T.info.color);
    run = null;
  }
  function updateRun(dt, pv) {
    const T = run.T, b = pv.body;
    run.t += dt;
    const units = UNITS(G);
    if (T.type === 'trail') {
      const d = Math.hypot(b.pos.x - T.ex, b.pos.z - T.ez);
      let tgt = null, n = 0;
      for (let i = 0; i < 3; i++) if (run.t < T.stars[i] && (tgt == null || T.stars[i] < tgt)) { tgt = T.stars[i]; n = i + 1; }
      F.overlay.live(T.info.name, fmtTime(run.t), `${Math.round(units === 'kmh' ? d : d * 3.281)} ${units === 'kmh' ? 'm' : 'ft'} to go${tgt ? ` · ${'★'.repeat(n)} ${fmtTime(tgt, false)}` : ''}`, T.info.color);
      if (d < 18) { const t = run.t; F.markers.remove('st-trail-end'); T.cool = true; run = null; F.overlay.live(null); score(T, t, fmtTime(t), true); }
      else if (run.t > T.stars[0] * 2.2) cancelRun('Too slow');
      return;
    }
    trackUpdate(T.R, run.tr, b.pos.x, b.pos.z);
    if (run.tr.dist > 45) { cancelRun(T.type === 'drift' ? 'Left the zone' : 'Left the zone'); return; }
    if (T.type === 'drift') {
      meter.update(dt, pv);
      F.overlay.live(T.info.name, fmtNum(meter.score()), meter.active ? `Combo ${fmtNum(meter.combo)} x${meter.mult.toFixed(1)}` : `${Math.round(100 * run.tr.s / T.R.L)}%`, T.info.color);
    } else {
      const avg = run.tr.s / Math.max(0.1, run.t);
      F.overlay.live(T.info.name, `${Math.round(speedVal(avg, units))} ${units === 'kmh' ? 'KM/H' : 'MPH'}`, `Average speed · ${Math.round(100 * run.tr.s / T.R.L)}%`, T.info.color);
    }
    if (run.tr.s >= T.R.L - 4) {
      const t = run.t, R = T.R;
      F.overlay.live(null);
      if (T.type === 'drift') { meter.bank(); const sc = meter.score(); run = null; score(T, sc, fmtNum(sc)); }
      else { const avg = R.L / t, mph = avg * 2.23694; run = null; score(T, mph, `${Math.round(speedVal(avg, units))} ${units === 'kmh' ? 'KM/H' : 'MPH'}`); }
    } else if (run.t > 120) cancelRun('Out of time');
  }
  ST.onPlayerHit = s => { if (run?.T.type === 'drift' && s > 0.2) meter.lose(); };
  // value -> stars (lower is better for trailblazers), record, rewards, feedback
  function score(T, value, text, lowerBetter = false) {
    const th = T.stars;
    let stars = 0;
    for (let i = 0; i < 3; i++) if (lowerBetter ? value <= th[i] : value >= th[i]) stars = i + 1;
    const rec = F.S.stunts[T.id] || (F.S.stunts[T.id] = { best: null, stars: 0 });
    const better = rec.best == null || (lowerBetter ? value < rec.best : value > rec.best);
    if (better) rec.best = value;
    const newStars = Math.max(0, stars - rec.stars);
    if (stars > rec.stars) rec.stars = stars;
    F.overlay.stunt(T.name, text, stars, better && rec.best != null ? 'Personal best' : rec.best != null ? `Best ${fmtBest(T, rec.best)}` : '', T.info.color);
    G.audio?.ui(stars >= 3 ? 'levelup' : stars ? 'skill' : 'click');
    if (newStars) {
      F.award({ credits: 350 * newStars + (stars === 3 ? 500 : 0), xp: 450 * newStars, fp: 25 * newStars }, T.name, { silent: true });
      F.checkAccolades();
    } else if (stars) F.award({ credits: 0, xp: 120 * stars, fp: 0 }, T.name, { silent: true });
    ST.refreshMarkers();
    F.save();
  }
  function fmtBest(T, v) {
    const u = UNITS(G);
    if (T.type === 'trap' || T.type === 'zone') return `${Math.round(u === 'kmh' ? v * 1.609 : v)} ${u === 'kmh' ? 'km/h' : 'mph'}`;
    if (T.type === 'danger') return `${Math.round(u === 'kmh' ? v : v * 3.281)} ${u === 'kmh' ? 'm' : 'ft'}`;
    if (T.type === 'trail') return fmtTime(v);
    return fmtNum(v);
  }
  ST.fmtBest = fmtBest;
  ST.cancel = () => cancelRun();
  ST.running = () => run;
  void clamp; void THREE;
  return ST;
}
