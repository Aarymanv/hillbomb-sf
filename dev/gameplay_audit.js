// Gameplay audit (dev). Load in a game page (5190 or 5191, ideally /?sandbox so the real save is untouched):
//   await import('http://127.0.0.1:5190/dev/gameplay_audit.js?' + Date.now())
// __gpRoutes()          every festival event / prologue / story route: length, detour, U-turns, off-road, buildings, water, grade
// await __gpRun(id)     one event start -> finish on the race autopilot (renderer stubbed): outcome, rewards, errors
// await __gpRunAll()    every event in turn (results in __gpOut)
import { findUturns, inBuilding, threadKeysClean, makeRoute, routeAt } from '../src/game/festival/util.js';
import { ll, setProjection } from '../src/world/latlon.js';
import { PROLOGUE, STORIES } from '../src/game/festival/catalog.js';

const W = window;
// this module graph is a separate instance from the game bundle: switch it to the 1:1 projection (v2 map) too
if (new URLSearchParams(location.search).get('map') !== 'v1') { setProjection({ scale: 1 }); try { const m = await (await fetch(new URL('assets/map/meta.json', document.baseURI))).json(); setProjection({ scale: 1, kx: m.projection.kx, kz: m.projection.kz }); } catch (e) { console.warn('[gp] meta', e); } }
const keyDist = (keys, loop) => { let d = 0; for (let i = 1; i < keys.length; i++) { const [a, b] = ll(keys[i - 1][0], keys[i - 1][1]), [c, e] = ll(keys[i][0], keys[i][1]); d += Math.hypot(c - a, e - b); } if (loop) { const [a, b] = ll(keys[0][0], keys[0][1]), [c, e] = ll(keys.at(-1)[0], keys.at(-1)[1]); d += Math.hypot(c - a, e - b); } return d; };

function routeStats(R, keys, type) {
  const world = W.__world;
  let bld = 0, water = 0, off = 0, grade = 0, gAt = null, up = 0, steep = 0;
  for (let i = 0; i < R.n; i++) {
    const [x, z] = R.pts[i];
    if (inBuilding(world, x, z)) bld++;
    if (world.heightAt(x, z) < 0.3 && R.ys[i] < 1.5) water++;
    if (R.off[i]) off++;
    if (i >= 2) { const ds = R.cum[i] - R.cum[i - 2]; if (ds > 4) { const g = Math.abs(R.ys[i] - R.ys[i - 2]) / ds; if (g > grade) { grade = g; gAt = [x | 0, z | 0]; } const u = (R.ys[i] - R.ys[i - 2]) / ds; if (R.off[i]) { if (u > up) up = u; if (u > 0.3) steep++; } } }
  }
  const kd = keys ? keyDist(keys, R.loop) : 0;
  return { L: R.L | 0, detour: kd ? +(R.L / kd).toFixed(2) : null, ut: R.loop ? 0 : findUturns(R.pts).length, offPct: +(off * 100 / R.n).toFixed(0), bld, water, grade: +(grade * 100).toFixed(0), gAt, up: +(up * 100).toFixed(0), steep, type };
}
W.__gpRoutes = () => {
  const F = W.__G.festival, out = {};
  for (const ev of F.events.list) { const R = F.events.route(ev); out[ev.id] = R ? routeStats(R, ev.keys, ev.type) : 'BROKEN'; }
  for (const seg of PROLOGUE) { const th = threadKeysClean(W.__world, seg.keys); out['pro:' + seg.id] = th ? routeStats(makeRoute(W.__world, th, { startS: 12 }), seg.keys, 'prologue') : 'BROKEN'; }
  for (const s of STORIES) for (const m of s.missions) if (m.route) { const th = threadKeysClean(W.__world, m.route); out['st:' + s.id + '/' + m.id] = th ? routeStats(makeRoute(W.__world, th, { startS: 25 }), m.route, m.kind) : 'BROKEN'; }
  return out;
};
// flag the suspicious ones
W.__gpRouteFlags = () => {
  const r = W.__gpRoutes(), bad = {};
  for (const [k, s] of Object.entries(r)) {
    if (s === 'BROKEN') { bad[k] = s; continue; }
    const f = [];
    const offOk = s.type === 'dirt' || s.type === 'xc' || s.type === 'prologue';
    if (s.detour > 1.9) f.push('detour ' + s.detour);
    if (s.ut) f.push('uturns ' + s.ut);
    if (!offOk && s.offPct > 3) f.push('off ' + s.offPct + '%');
    if (s.bld) f.push('bld ' + s.bld);
    if (s.water) f.push('water ' + s.water);
    if (s.grade > 40) f.push('grade ' + s.grade + '% @' + s.gAt);
    if (f.length) bad[k] = s.L + 'm ' + f.join(', ');
  }
  return bad;
};

// yield to the event loop between frame batches. A hidden tab throttles MessageChannel / timer tasks to a crawl (the
// batch ran at ~0.3x real time); replies from a Worker are not throttled.
const pong = (() => { try { const w = new Worker(URL.createObjectURL(new Blob(['onmessage = () => postMessage(0)'], { type: 'text/javascript' }))); let q = []; w.onmessage = () => { const r = q.shift(); r?.(); }; return () => new Promise(r => { q.push(r); w.postMessage(0); }); } catch { return null; } })();
const yieldT = pong || (() => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }));
const snapEco = G => ({ cr: G.economy.credits ?? G.economy.money, xp: G.economy.xp, lvl: G.economy.level, fp: G.festival.S.fp, ch: G.festival.S.chapter });
// one event: start, autopilot through it, wait for the results screen, close it. Returns a compact record.
W.__gpRun = async (id, { maxFrames = 30000, speed = 0.92, car = null, render = false } = {}) => {
  const G = W.__G, F = G.festival, Rr = W.__renderer, orig = Rr.render, pr = G.post?.render, hu = G.hud?.update;
  if (!render) { Rr.render = () => {}; if (G.post) G.post.render = () => {}; if (G.hud) G.hud.update = () => {}; }
  W.__manual = true;
  const errs0 = (W.__errs || []).length, e0 = snapEco(G);
  const rec = { id };
  try {
    F.endEvent?.(); W.__frames(5);
    const ev = F.events.byId[id];
    if (!F.startEvent(id, car ? { car } : {})) { rec.res = 'NO-START'; return rec; }
    let f = 0, A = null, ap = false, maxS = 0, stall = 0, lastS = 0, phase = '';
    for (; f < maxFrames; f++) {
      if (G.state !== 'play') G.state = 'play';
      W.__frames(1);
      A = F.racing?.active;
      if (!A) { if (f > 900) { rec.res = 'NO-RACE'; break; } continue; }
      // (a fade target reset by an earlier activity's timer left the race waiting in 'fadeout' forever on fresh pages)
      if (A.phase === 'fadeout' && f > 400 && F.overlay.fadeTarget < 1) F.overlay.fadeTo(1, 3);
      phase = A.phase;
      if (!ap && A.phase === 'race') { F.debug.autopilot(true, speed); ap = true; }
      const s = A.player?.tr ? (A.player.tr.lap || 0) * (A.route?.L || 0) + A.player.tr.s : 0;
      if (A.phase === 'race') { if (s > lastS + 3) { lastS = s; stall = 0; } else if (++stall > 900) { G.input?.tap?.('reset'); F.racing.resetPlayer?.(); stall = 0; rec.resets = (rec.resets || 0) + 1; if (rec.resets > 8) { rec.res = 'STUCK'; rec.at = [G.player.pos.x | 0, G.player.pos.z | 0]; break; } } }
      maxS = Math.max(maxS, s);
      if (A.phase === 'race' && f % 300 === 0) (rec.trace ||= []).push([Math.round(A.t), Math.round(s), ...A.ents.filter(e => !e.player).map(e => Math.round(e.P || 0))]);   // progress every 5 s: player, rivals
      // rival respawns (a > 12 m jump in one frame) and where they happen
      if (A.phase === 'race') for (const e of A.ents) { if (e.player || !e.v) continue; const p = e.v.pos, q = e._gpLast; if (q && Math.hypot(p.x - q[0], p.z - q[1]) > 12) { rec.aiResp = (rec.aiResp || 0) + 1; (rec.aiAt ||= []).length < 6 && rec.aiAt.push([q[0] | 0, q[1] | 0]); } e._gpLast = [p.x, p.z]; }
      if (A.phase === 'race') { const p = G.player.pos, q = rec._pl; if (q && Math.hypot(p.x - q[0], p.z - q[1]) > 12) (rec.plAt ||= []).push([q[0] | 0, q[1] | 0]); rec._pl = [p.x, p.z]; }
      if (A.phase === 'finished' && (A.finT || 0) > 0.5) { W.__frames(300); break; }
      if (f % 300 === 0) await yieldT();
    }
    rec.frames = f; rec.phase = phase; rec.how = A?.how; rec.why = A?.respawns; rec.whyAt = A?.respawnAt?.slice(0, 12);
    rec.ents = (A?.ents || []).map(e => (e.player ? 'YOU' : (e.name || '?').split(' ')[0]) + ':' + (e.done ? e.time.toFixed(1) : e.score != null ? Math.round(e.score) : '~' + (e.estTime ? e.estTime.toFixed(0) : 'dnf'))).join(' ');
    rec.pos = A?.player?.place ?? A?.player?.pos;
    rec.fixes = A?.lineFixes || 0;
    rec.rivResp = (A?.ents || []).reduce((t, e) => t + (e.player ? 0 : e.nResp || 0), 0);   // respawnOnRoute calls for rivals (aiResp = > 12 m jumps)
    W.__autopilot = null;
    // results screen: press confirm until the activity closes
    for (let k = 0; k < 40 && (F.activity || document.querySelector('.fs-screen, .hb-screen')); k++) { W.__gpKey('Enter'); W.__frames(30); await yieldT(); }
    rec.closed = !F.activity;
    rec.screen = document.querySelector('.fs-screen, .hb-screen')?.className || null;
  } catch (e) { rec.res = 'THROW ' + e.message; }
  finally { Rr.render = orig; if (pr) G.post.render = pr; if (hu) G.hud.update = hu; W.__autopilot = null; }
  const e1 = snapEco(G);
  rec.d = { cr: e1.cr - e0.cr, xp: e1.xp - e0.xp, fp: e1.fp - e0.fp, lvl: e1.lvl - e0.lvl, ch: e1.ch - e0.ch };
  rec.errs = (W.__errs || []).slice(errs0).slice(0, 3);
  rec.res = rec.res || (rec.phase === 'finished' ? 'FINISHED' : 'TIMEOUT ' + rec.phase);
  delete rec._pl;
  return rec;
};
// on document (the UI shell listens there in the capture phase; window listeners still see it on the way back up)
W.__gpKey = (code, hold = 3) => { document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); W.__frames(hold); document.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); W.__frames(2); };
W.__gpRunAll = async (ids = null, opts = {}) => {
  const F = W.__G.festival; W.__gpOut = [];
  for (const ev of F.events.list) { if (ids && !ids.includes(ev.id)) continue; if (ev.type === 'showcase' && !opts.showcase) continue; const r = await W.__gpRun(ev.id, opts); W.__gpOut.push(r); }
  return W.__gpOut.map(r => `${r.id}: ${r.res} ${r.how || ''} [${r.ents || ''}] fp+${r.d?.fp} cr+${r.d?.cr} closed=${r.closed}${r.resets ? ' resets=' + r.resets : ''}${r.aiResp ? ' aiResp=' + r.aiResp + ' ' + JSON.stringify(r.aiAt) : ''}${r.plAt ? ' plResp ' + JSON.stringify(r.plAt.slice(0, 4)) : ''}${r.errs?.length ? ' ERR ' + r.errs[0] : ''}`);
};
// console error capture
if (!W.__errs) {
  W.__errs = [];
  const oe = console.error; console.error = (...a) => { W.__errs.push(a.map(String).join(' ').slice(0, 240)); oe(...a); };
  addEventListener('error', e => W.__errs.push('ERR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', e => W.__errs.push('REJ ' + (e.reason?.stack || e.reason)));
}

// one story mission: start, drive it (route kinds on the race autopilot; trips / smash by teleport), close the result screen
W.__gpStory = async (sid, mid, { maxFrames = 20000 } = {}) => {
  const G = W.__G, F = G.festival, Rr = W.__renderer, orig = Rr.render; Rr.render = () => {};
  W.__manual = true;
  const rec = { id: sid + '/' + mid }, errs0 = (W.__errs || []).length, fp0 = F.S.fp;
  try {
    F.endEvent?.(); W.__frames(5);
    const s = F.stories.list.find(x => x.id === sid), m = s?.missions.find(x => x.id === mid);
    if (!s || !m) { rec.res = 'NO-MISSION'; return rec; }
    rec.kind = m.kind;
    F.stories.start(s, m, F.cars.current(), false);
    let f = 0, ap = false, M = null, teleT = 0;
    for (; f < maxFrames; f++) {
      if (G.state !== 'play') G.state = 'play';
      W.__frames(1);
      M = F.stories.active || null;
      const A = F.racing?.active;
      if (!M && !A) { if (f > 600) break; continue; }
      if (A) { if (!ap && A.phase === 'race') { F.debug.autopilot(true, 0.9); ap = true; } if (A.phase === 'finished' && (A.finT || 0) > 0.5) { W.__frames(200); break; } }
      else if (M.phase === 'run') {
        const K = m.kind, pv = G.player.vehicle;
        if (!ap && M.route && K !== 'tail' && K !== 'tag') { F.debug.autopilot(true, K === 'air' || K === 'speed' ? 1 : 0.8); ap = true; }
        if ((K === 'tail' || K === 'tag') && M.npc) { // follow 30 m behind the target along the route
          const n = M.npc; const s0 = Math.max(0, n.tr.s - (K === 'tail' ? 30 : 6)); const o = {}; const R = M.route;
          routeAt(R, s0, o);
          pv.place(o.x, o.y + 0.35, o.z, Math.atan2(-o.dx, -o.dz)); pv.body.vel.set(o.dx * n.v.body.speed, 0, o.dz * n.v.body.speed);
        }
        if ((K === 'fare' || K === 'reach') && (teleT -= 1 / 60) <= 0) {
          const tgt = K === 'fare' && !M.onboard ? M.pick : M.dest; teleT = 3;
          if (tgt && Math.hypot(tgt[0] - pv.pos.x, tgt[1] - pv.pos.z) > 10) { W.__teleport(tgt[0], tgt[1]); pv.body.vel.set(0, 0, 0); }
        }
        if (K === 'smash' && M.props && (teleT -= 1 / 60) <= 0) { const p = M.props.find(q => !q.hit); teleT = 0.4; if (p) { W.__teleport(p.x - 8, p.z); pv.body.vel.set(14, 0, 0); } }
        if (K === 'nearmiss' && !rec._nm) { rec._nm = 1; M.t = (m.timeLimit || 60) - 1; M.near = 1; }   // can't script traffic: jump to the time limit with one near miss
      }
      if (M?.phase === 'end') { W.__frames(120); break; }
      if (f % 300 === 0) await yieldT();
    }
    rec.frames = f; rec.phase = M?.phase || F.racing?.active?.phase; rec.fail = M?.fail; rec.score = M?.score;
    W.__autopilot = null;
    for (let k = 0; k < 40 && F.activity; k++) { W.__gpKey('Enter'); W.__frames(30); await yieldT(); }
    rec.closed = !F.activity;
  } catch (e) { rec.res = 'THROW ' + e.message; }
  finally { Rr.render = orig; W.__autopilot = null; }
  rec.fp = F.S.fp - fp0; rec.errs = (W.__errs || []).slice(errs0).slice(0, 3);
  rec.res = rec.res || (rec.closed ? 'DONE' : 'OPEN ' + rec.phase);
  delete rec._nm;
  return rec;
};
W.__gpStories = async () => { const F = W.__G.festival, out = []; for (const s of F.stories.list) for (const m of s.missions) { const r = await W.__gpStory(s.id, m.id); out.push(`${r.id} ${r.kind}: ${r.res} ${r.fail || ''} score=${r.score} fp+${r.fp}${r.errs?.length ? ' ERR ' + r.errs[0] : ''}`); W.__gpStOut = out; } return out; };

// UI sweep: pause menu (every tab, each focusable element visited with arrows), map open / waypoint / close, photo mode,
// garage, F1, Tab. Each step: errors raised + whether Escape gets back to play (softlock check).
W.__gpUI = async () => {
  const G = W.__G, ui = G.ui, out = [], e0 = (W.__errs || []).length;
  const back = async (label) => { for (let k = 0; k < 6 && (ui.isModal() || G.state !== 'play'); k++) { W.__gpKey('Escape'); W.__frames(20); await yieldT(); } if (ui.isModal() || G.state !== 'play') out.push('SOFTLOCK after ' + label + ' state=' + G.state); };
  W.__manual = true; G.festival?.endEvent?.(); W.__frames(5);
  W.__gpKey('Escape'); W.__frames(20);
  const tabs = ui.menu.tabs?.() || []; out.push('tabs: ' + tabs.join(','));
  for (const t of tabs) {
    try { ui.menu.open(t); W.__frames(10); for (let k = 0; k < 6; k++) { W.__gpKey(k % 2 ? 'ArrowRight' : 'ArrowDown'); } W.__frames(10); } catch (e) { out.push('tab ' + t + ' THROW ' + e.message); }
    const body = document.querySelector('.mn-body'); if (!body || !body.textContent.trim()) out.push('tab ' + t + ' EMPTY');
  }
  await back('menu');
  W.__gpKey('KeyQ'); W.__gpKey('KeyE'); // tab cycling with the menu closed must not open anything odd
  W.__gpKey('KeyM'); W.__frames(20); out.push('map open=' + ui.map.isOpen());
  W.__gpKey('KeyX'); W.__frames(10); out.push('waypoint=' + !!G.gps?.target);
  await back('map');
  W.__frames(100); out.push('gps pts=' + (G.gps?.points?.length || 0));
  W.__gpKey('KeyV'); W.__frames(20); out.push('photo state=' + G.state); await back('photo');
  W.__gpKey('KeyG'); W.__frames(30); out.push('garage modal=' + ui.isModal() + ' ov=' + !!G.renderOverride); await back('garage'); if (G.renderOverride) out.push('SOFTLOCK garage renderOverride stuck');
  W.__gpKey('F1'); W.__frames(20); out.push('F1 menu=' + ui.menu.isOpen() + ' ' + (document.querySelector('.st-cat.on')?.dataset.c || '')); await back('F1');
  W.__gpKey('Tab'); W.__frames(20); out.push('Tab menu=' + ui.menu.isOpen()); await back('Tab');
  out.push('errors: ' + JSON.stringify((W.__errs || []).slice(e0, e0 + 4)));
  return out;
};

// Outlaw loop (page must be in ?mode=gta): stars -> cops spawn / pursue -> bust (hold still), evade (teleport away),
// carjack (on foot next to a traffic car, F), wasted (on foot, health 0). Logic only (render stubbed).
W.__gpOutlaw = async () => {
  const G = W.__G, P = G.police, pl = G.player, Rr = W.__renderer, orig = Rr.render; Rr.render = () => {};
  W.__manual = true; const out = [], e0 = (W.__errs || []).length;
  const step = async n => { for (let i = 0; i < n; i++) { G.state = 'play'; W.__frames(1); if (i % 120 === 0) await yieldT(); } };
  try {
    out.push('mode=' + G.mode + ' police=' + !!G.flags.police);
    if (!pl.vehicle) { await step(5); }
    const home = { x: pl.pos.x, z: pl.pos.z };
    // 1) bust: 2 stars, hold the brakes
    P.addStars(2, 'audit'); let t = 0, maxCops = 0, pursuing = 0;
    const money0 = G.economy.money;
    W.__autopilot = (input) => { input.axes.throttle = 0; input.axes.brake = 1; input.axes.steer = 0; };
    while (P.stars > 0 && t < 90 * 60) { await step(60); t += 60; maxCops = Math.max(maxCops, P.cops.length); pursuing = Math.max(pursuing, P.cops.filter(c => c.d.mode === 'pursuit').length); }
    W.__autopilot = null;
    out.push(`bust: ${P.stars === 0 ? 'busted' : 'NOT busted'} after ${(t / 60) | 0}s, cops max ${maxCops} pursuing ${pursuing}, fine ${money0 - G.economy.money}, onFoot=${pl.mode === 'foot'} at ${pl.pos.x | 0},${pl.pos.z | 0}`);
    // 2) evade: back in a car, 1 star, then teleport 1.5 km away and wait
    await step(240);
    if (!pl.vehicle) { W.__G.menus?.deliver?.(G.economy.current || 'hatch'); await step(10); }
    W.__teleport(home.x, home.z); await step(30);
    P.addStars(1, 'audit'); await step(120);
    W.__teleport(home.x + 1100, home.z + 900); await step(10);
    t = 0; while (P.stars > 0 && t < 60 * 60) { await step(60); t += 60; }
    out.push(`evade: ${P.stars === 0 ? 'evaded' : 'NOT evaded (stars ' + P.stars + ', searching ' + P.searching + ')'} after ${(t / 60) | 0}s`);
    P.clear();
    // 3) carjack: on foot next to the nearest moving traffic car
    pl.exitVehicle(true); await step(30);
    const tc = G.traffic.cars.map(c => c.v).filter(v => !v.wrecked).sort((a, b) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z))[0];
    if (!tc) out.push('carjack: no traffic car');
    else {
      tc.body.vel.set(0, 0, 0); W.__teleport(tc.pos.x + 2, tc.pos.z, { foot: true }); await step(2);
      W.__gpKey('KeyF'); await step(90);
      out.push(`carjack: in car=${pl.mode === 'car'} same=${pl.vehicle === tc} stars=${P.stars}`);
    }
    P.clear();
    // 4) wasted on foot
    if (pl.vehicle) pl.exitVehicle(true); await step(10);
    const m1 = G.economy.money; pl.health = 0; G.onWasted?.('audit'); await step(240);
    out.push(`wasted: health=${pl.health} bill=${m1 - G.economy.money} at ${pl.pos.x | 0},${pl.pos.z | 0} mode=${pl.mode}`);
  } catch (e) { out.push('THROW ' + e.message); }
  finally { Rr.render = orig; W.__autopilot = null; }
  out.push('errors: ' + JSON.stringify((W.__errs || []).slice(e0, e0 + 4)));
  return out;
};

// prologue: all four drives on the race autopilot; per segment: distance driven / route length, time, respawns; then the
// arrival + starter pick (Enter) and back to free play
W.__gpPrologue = async () => {
  const G = W.__G, F = G.festival, PR = F.prologue, Rr = W.__renderer, orig = Rr.render; Rr.render = () => {};
  W.__manual = true; const out = [], e0 = (W.__errs || []).length;
  try {
    F.endEvent?.(); W.__frames(5);
    PR.start(); F.debug.autopilot(true, 0.85);
    let seg = -1, f = 0, rec = null;
    for (; f < 60 * 300 && PR.active; f++) {
      G.state = 'play'; W.__frames(1);
      const P = PR.active; if (!P) break;
      if (P.i !== seg) { if (rec) out.push(rec); seg = P.i; rec = `seg ${seg} ${P.seg?.id || P.phase}`; }
      if (P.phase === 'drive') rec = `seg ${seg} ${P.seg.id}: ${P.tr.s | 0}/${P.R.L | 0} m in ${P.t.toFixed(0)}/${P.seg.limit}s cp ${P.cp}/${P.gates.length}`;
      if (P.phase === 'arrive') { W.__autopilot = null; if (f % 90 === 0) { W.__gpKey('Enter'); await yieldT(); } }
      if (f % 300 === 0) await yieldT();
    }
    if (rec) out.push(rec);
    for (let k = 0; k < 20 && (PR.active || F.activity); k++) { W.__gpKey('Enter'); W.__frames(30); await yieldT(); }
    out.push(`done: active=${!!PR.active} activity=${F.activity?.kind || null} starter=${F.S.starter} car=${G.player.vehicle?.id} frames=${f}`);
  } catch (e) { out.push('THROW ' + e.message); }
  finally { Rr.render = orig; W.__autopilot = null; }
  out.push('errors: ' + JSON.stringify((W.__errs || []).slice(e0, e0 + 4)));
  return out;
};
// one prologue segment (0-3) on the autopilot: samples every second (s, speed, y, surface, nearby solids)
W.__gpProSeg = async (k, secs = 20) => {
  const G = W.__G, F = G.festival, PR = F.prologue, Rr = W.__renderer, orig = Rr.render; Rr.render = () => {};
  W.__manual = true; const out = [];
  try {
    F.endEvent?.(); W.__frames(3);
    PR.start(); const P = PR.active; P.i = k - 1; P.phase = 'fadeout'; F.overlay.setFade(1);
    for (let f = 0; f < 400 && P.phase !== 'drive'; f++) W.__frames(1);
    F.debug.autopilot(true, 0.85);
    for (let t = 0; t < secs; t++) {
      for (let f = 0; f < 60; f++) { G.state = 'play'; W.__frames(1); }
      const v = G.player.vehicle, p = v.pos, w = W.__world;
      out.push(`${t}s s${P.tr.s | 0} v${v.body.speed.toFixed(1)} thr${v.input.throttle.toFixed(1)} br${v.input.brake.toFixed(1)} y${p.y.toFixed(1)} h${w.heightAt(p.x, p.z).toFixed(1)} surf${w.terrain.surfaceAt(p.x, p.z)} gr${v.body.grounded} ${w.colliders.query(p.x, p.z, 3.5).filter(c => c.yMax > p.y - 0.5 && c.yMin < p.y + 2).map(c => c.kind).join(',')}`);
      await yieldT();
    }
    PR.skip(); for (let f = 0; f < 600 && PR.active; f++) { W.__frames(1); if (f % 60 === 0) W.__gpKey('Enter'); }
  } catch (e) { out.push('THROW ' + e.message); }
  finally { Rr.render = orig; W.__autopilot = null; }
  return out;
};
