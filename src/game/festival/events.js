// Festival events: catalog -> live instances (start point snapped to the road graph, route threaded on demand),
// world / map markers, the start prompt, the event-card -> car -> difficulty -> race flow, rewards and records.
import { EVENTS, DISCIPLINES, DIFFICULTY, RIVALS } from './catalog.js';
import { threadKeysClean, makeRoute, routeAt, snapNode, snapLand, fmtTime, fmtMoney, clamp, rng, hashStr } from './util.js';
import { classRank, clsLabel } from './cars.js';

const TYPE_BASE = { road: 3200, street: 3800, dirt: 3400, xc: 4200, drag: 2600, drift: 3400, showcase: 9000 };
const PLACE_MULT = [1, 0.72, 0.56, 0.44, 0.36, 0.3, 0.25, 0.22, 0.2, 0.18, 0.16, 0.15];

export function createEvents(F) {
  const { G, world } = F;
  const EV = { list: [], byId: {} };
  const pt = {};
  // ---------------------------------------------------------------- instances
  for (const def of EVENTS) {
    const k0 = def.keys[0];
    let start = null;
    if (k0[2] === '~') start = snapLand(world, k0[0], k0[1]);
    else { const n = snapNode(world, k0[0], k0[1], k0[2] || null); if (n) start = { x: n.x, z: n.z }; }
    const ev = { ...def, def, start, route: null, broken: !start, disc: DISCIPLINES[def.type] };
    ev.district = start ? world.district(start.x, start.z) : '';
    EV.list.push(ev); EV.byId[ev.id] = ev;
  }
  EV.available = ev => !ev.broken && F.chapter() >= (ev.chapter || 0);
  // route (threaded once, cached). Drag strips are cut to their fixed length.
  EV.route = function (ev) {
    if (ev.route || ev.broken) return ev.route;
    const th = threadKeysClean(world, ev.keys, { loop: !!ev.laps && ev.laps > 0 && ev.type !== 'drag' });
    if (!th) { ev.broken = true; console.warn('[festival] no route for', ev.id); return null; }
    const loop = !!ev.laps && ev.type !== 'drag';
    let R = makeRoute(world, th, { loop, startS: ev.type === 'drag' ? 30 : 55, smoothIters: ev.type === 'drag' ? 0 : 1 });
    if (ev.type === 'drag' && ev.dist) {
      // keep startS + dist metres of it (world scale: the strip is a real quarter mile of tarmac)
      const want = R.startS + ev.dist;
      if (R.L > want + 5) {
        const pts = [], deck = [];
        for (let i = 0; i < R.n && R.cum[i] <= want; i++) { pts.push(R.pts[i]); deck.push(NaN); }
        routeAt(R, want, pt); pts.push([pt.x, pt.z]); deck.push(NaN);
        R = makeRoute(world, { pts, deck }, { loop: false, startS: 30, smoothIters: 0 });
      }
    }
    ev.route = R;
    ev.length = loop ? R.L * ev.laps : R.L - R.startS;
    return R;
  };
  // ---------------------------------------------------------------- markers
  for (const ev of EV.list) {
    if (ev.broken) continue;
    F.markers.add({ id: 'ev:' + ev.id, kind: ev.type, icon: ev.disc.icon, group: 'event', x: ev.start.x, z: ev.start.z, color: ev.disc.color, title: ev.name,
      sub: `${ev.disc.name} · Class ${clsLabel(ev.cls)}`, meta: `Class ${clsLabel(ev.cls)}${ev.laps ? ` · ${ev.laps} lap${ev.laps > 1 ? 's' : ''}` : ''}`, visible: false, beamH: ev.type === 'showcase' ? 160 : 110, beamR: ev.type === 'showcase' ? 4.5 : 3.4, data: ev });
  }
  EV.refreshMarkers = function () {
    for (const ev of EV.list) if (!ev.broken) {
      const on = EV.available(ev);
      const rec = F.S.events[ev.id];
      F.markers.setVisible('ev:' + ev.id, on);
      if (on) F.markers.update('ev:' + ev.id, { sub: ev.desc, meta: `${ev.disc.name} · Class ${clsLabel(ev.cls)}${ev.laps ? ` · ${ev.laps} lap${ev.laps > 1 ? 's' : ''}` : ''}${rec?.best != null ? ` · Best ${ev.type === 'drift' ? Math.round(rec.best).toLocaleString() : fmtTime(rec.best)}` : ''}`, done: !!rec?.wins });
    }
  };

  // ---------------------------------------------------------------- nearby prompt
  let near = null, scanT = 0;
  EV.update = function (dt) {
    if (F.activity || F.busy()) { if (near) { F.overlay.prompt('event', null); near = null; } return; }
    scanT -= dt;
    const pv = G.player.vehicle;
    if (scanT <= 0) {
      scanT = 0.2; near = null;
      if (pv) {
        let bd = 18 * 18;
        for (const ev of EV.list) {
          if (!EV.available(ev)) continue;
          const dx = ev.start.x - pv.pos.x, dz = ev.start.z - pv.pos.z, d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; near = ev; }
        }
      }
      if (near) {
        const rec = F.S.events[near.id];
        F.overlay.prompt('event', { kicker: near.disc.name, title: near.name, color: near.disc.color,
          sub: `Class ${clsLabel(near.cls)}${near.laps ? ` · ${near.laps} lap${near.laps > 1 ? 's' : ''}` : ''}${rec?.best ? ` · Best ${near.type === 'drift' ? Math.round(rec.best).toLocaleString() : fmtTime(rec.best)}` : ''}`,
          action: `<span><kbd>E</kbd>Event details</span>` });
      } else F.overlay.prompt('event', null);
    }
    if (near && G.input.pressed('interact')) { F.overlay.prompt('event', null); const ev = near; near = null; EV.open(ev); }
  };

  // ---------------------------------------------------------------- flow: card -> car -> race
  EV.open = async function (ev) {
    if (!EV.route(ev)) { G.hud?.toast?.('Event unavailable', 'This route does not fit the current map', '', 2600); return; }
    const choice = await F.screens.eventCard(ev);
    if (!choice) return;
    const car = await F.chooseCar({ cls: ev.cls, title: ev.name, kicker: ev.disc.name, loaner: ev.loaner, tags: ev.tags });
    if (!car) return;
    EV.launch(ev, { carKey: car.key, loaner: car.loaner, diff: F.S.difficulty ?? 1 });
  };
  EV.launch = function (ev, { carKey, loaner = false, diff = 1, attempt = 0 }) {
    const R = EV.route(ev); if (!R) return;
    const rand = rng(hashStr(ev.id) + attempt * 101);
    const cfg = {
      id: ev.id, name: ev.name, kicker: ev.disc.name, desc: ev.desc, reward: Math.round((TYPE_BASE[ev.type] + (ev.length || 3000) / 1000 * 900) / 50) * 50, subtitle: `Class ${clsLabel(ev.cls)}${ev.laps ? ` · ${ev.laps} lap${ev.laps > 1 ? 's' : ''}` : ''} · ${DIFFICULTY[diff].name}`,
      route: R, laps: ev.laps || 1, discipline: ev.type, color: ev.disc.color, carKey, diff, traffic: !!ev.traffic, time: ev.time, weather: ev.weather,
      grid: [], virtual: [], attempt,
      rewards: res => EV.reward(ev, res, { loaner }),
      onDone: res => { if (loaner) F.restoreCar(); EV.refreshMarkers(); void res; },
    };
    if (ev.type === 'drift') {
      const par = 30 * (ev.laps ? R.L * ev.laps : R.L - R.startS);
      cfg.driftField = F.rivals.pickGrid(ev, 5, attempt).map(r => ({ rival: r, score: F.rivals.driftScore(r, diff, par) }));
      cfg.timeLimit = Math.max(60, ((ev.laps ? R.L * ev.laps : R.L) / 11) + 30);
    } else if (ev.type === 'showcase') {
      cfg.virtual = [F.showcases.opponent(ev, R, diff)];
      cfg.results = true;
    } else {
      const n = ev.rivals ?? 5;
      cfg.grid = F.rivals.pickGrid(ev, n, attempt).map(r => ({ rival: r, carKey: F.rivals.carFor(r, ev.cls, rand) }));
    }
    F.racing.start(cfg);
  };
  // ---------------------------------------------------------------- rewards + records
  EV.reward = function (ev, res, { loaner = false } = {}) {
    const S = F.S, rec = (S.events[ev.id] ||= { done: 0, wins: 0, best: null, bestPlace: 99 });
    const failed = res.how === 'caught' || res.how === 'beaten' || (res.how === 'timeout' && ev.type !== 'drift');
    const place = res.place;
    const km = (ev.length || 3000) / 1000;
    const pm = failed ? 0.1 : PLACE_MULT[Math.min(PLACE_MULT.length - 1, place - 1)];
    const D = DIFFICULTY[res.diff] || DIFFICULTY[1];
    const base = Math.round((TYPE_BASE[ev.type] + km * 900) / 50) * 50;
    const lines = [];
    let credits = base * pm; lines.push([`${failed ? 'Participation' : place === 1 ? 'Victory' : ordinalWord(place) + ' place'}`, Math.round(credits)]);
    if (D.bonus && !failed) { const b = base * pm * D.bonus; credits += b; lines.push([`${D.name} difficulty +${Math.round(D.bonus * 100)}%`, Math.round(b)]); }
    if (res.clean && !failed && ev.type !== 'drift') { const b = base * pm * 0.1; credits += b; lines.push(['Clean racing +10%', Math.round(b)]); }
    const perk = F.perk('credits') ? 0.05 : 0;
    if (perk && !failed) { const b = credits * perk; credits += b; lines.push(['Sea Cliff Villa +5%', Math.round(b)]); }
    if (loaner && !failed) { const b = -credits * 0.1; credits += b; lines.push(['Loaner fee', Math.round(b)]); }
    credits = Math.round(credits);
    const xp = Math.round(credits * 0.4 + 350 * pm + 150);
    const first = !rec.done, firstWin = place === 1 && !rec.wins && !failed;
    let fp = first ? (ev.type === 'showcase' ? 250 : 100) : 20;
    if (firstWin) fp += ev.type === 'showcase' ? 350 : ev.finale ? 800 : 80;
    else if (!first && place === 1 && !failed) fp += 10;
    if (failed) fp = first ? 25 : 5;
    // records
    rec.done++;
    const better = ev.type === 'drift' ? res.score > (rec.best ?? -1) : !failed && (rec.best == null || res.time < rec.best);
    const pb = better && (ev.type === 'drift' || place <= (rec.bestPlace ?? 99) || true);
    if (better) { rec.best = ev.type === 'drift' ? res.score : res.time; if (ev.type !== 'drift' && !failed) rec.splits = res.splits.slice(); }
    if (!failed && place < (rec.bestPlace ?? 99)) rec.bestPlace = place;
    if (place === 1 && !failed) rec.wins++;
    // stats + accolades
    F.bump('eventsDone');
    if (place === 1 && !failed) {
      F.bump('wins');
      if (res.diff >= 4) F.bump('winsUnbeatable');
      if (res.clean && ev.type !== 'drift') F.bump('cleanWins');
      if (ev.finale) F.bump('bayCrown');
    }
    G.economy.stats.races++; if (place === 1 && !failed) G.economy.stats.wins++;
    const beaten = ev.type === 'drift' || ev.type === 'showcase' ? [] : F.rivals.noteResult(res.standings);
    F.maxStat('topMph', Math.round(res.maxSpeed * 2.23694));
    F.award({ credits, xp, fp }, ev.name, { silent: true });
    F.save();
    return { credits, xp, fp, lines, pb: better, first, firstWin, beaten, failed };
  };
  EV.nearestAvailable = function (x, z) {
    let best = null, bd = Infinity;
    for (const ev of EV.list) if (EV.available(ev)) { const d = Math.hypot(ev.start.x - x, ev.start.z - z); if (d < bd) { bd = d; best = ev; } }
    return best;
  };
  EV.classOk = (key, cls) => { const s = F.cars.spec(key); return s && classRank(s.cls) <= classRank(cls); };
  void clamp; void fmtMoney; void RIVALS;
  return EV;
}
function ordinalWord(n) { return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'][n - 1] || n + 'th'; }
