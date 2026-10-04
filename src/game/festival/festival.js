// HILLBOMB Festival San Francisco: the festival / campaign / events layer (G.festival).
// Owns the festival save state, progression (Festival Points -> chapters -> outposts, XP levels -> Prize Spins,
// accolades), and wires every festival module: sites, events + races, stunts, stories, collectibles, prologue.
// Active only in 'forza' mode (G.flags.festival, else G.mode === 'forza'); hidden and inert in other modes.
import { loadStore, persist } from './save.js';
import { CHAPTERS, ACCOLADES, STUNTS, EVENTS, RIVALS, HOUSES, FESTIVAL } from './catalog.js';
import { createCars } from './cars.js';
import { createMarkers } from './markers.js';
import { createOverlay, injectFestivalCss } from './ui.js';
import { createGates } from './gates.js';
import { createDrivingLine } from './drivingline.js';
import { createRaceHud } from './racehud.js';
import { createRivals } from './rivals.js';
import { createRacing } from './racing.js';
import { createEvents } from './events.js';
import { createShowcases } from './showcases.js';
import { createStunts } from './stunts.js';
import { createSites } from './sites.js';
import { createCollectibles } from './collectibles.js';
import { createStories } from './stories.js';
import { createPrologue } from './prologue.js';
import { createScreens } from './screens.js';
import { roadPath, fmtNum, fmtMoney, clamp, routeAt } from './util.js';
import { Driver } from '../drivers.js';
import { keepOut } from '../../world/keepout.js';

export const FESTIVAL_STATE_VERSION = 1;
function defaultState() {
  return {
    v: FESTIVAL_STATE_VERSION, prologue: 0, starter: null, fp: 0, chapter: 0, difficulty: 1, drivingLine: 'full',
    events: {}, stunts: {}, stories: {}, accolades: {}, stats: {}, spins: 0, superSpins: 0, cosmetics: [],
    boards: {}, barns: {}, houses: [], roads: '', roadsSig: '', districts: [], rivals: {}, outposts: [], playTime: 0,
  };
}

export function createFestival(G) {
  const t0 = performance.now();
  injectFestivalCss();
  const store = loadStore();
  const S = store.festival = Object.assign(defaultState(), store.festival || {});
  const params = new URLSearchParams(location.search);
  if (params.get('festival') === 'reset') { Object.assign(S, defaultState()); }
  if (params.get('prologue') === '0' && !S.prologue) { S.prologue = 1; }
  const F = { G, world: G.world, S, activity: null, version: FESTIVAL_STATE_VERSION };
  G.festival = F;

  // ---------------------------------------------------------------- basics
  F.enabled = () => (G.flags?.festival ?? (G.mode === 'forza')) && (G.flags ? G.flags.events !== false : true);
  F.chapter = () => S.chapter;
  F.save = () => { store.festival = S; persist(); };
  F.playerName = () => 'You';
  let screenBusy = 0, cine = null;
  F.busy = () => !!cine || G.state !== 'play' || !!F.prologue?.running?.();
  const timers = [];
  F.after = (sec, fn) => { timers.push({ t: sec, fn }); };
  F.wait = sec => new Promise(r => F.after(sec, r));

  // ---------------------------------------------------------------- modules
  F.cars = createCars(G);
  F.overlay = createOverlay(G);
  F.say = lines => F.overlay.say(lines);
  const capQ = [];
  F.queueCaption = lines => { capQ.push(...lines); };
  F.markers = createMarkers(G);
  F.gates = createGates(F);
  F.line = createDrivingLine(F);
  F.racehud = createRaceHud(F);
  F.rivals = createRivals(F);
  F.screens = createScreens(F);
  const tm = {}; const T = (k, fn) => { const a = performance.now(); const r = fn(); tm[k] = Math.round(performance.now() - a); return r; };
  F.showcases = createShowcases(F);
  F.racing = createRacing(F);
  F.sites = T('sites', () => createSites(F));
  F.events = T('events', () => createEvents(F));
  F.stunts = T('stunts', () => createStunts(F));
  F.coll = T('collect', () => createCollectibles(F));
  F.stories = T('stories', () => createStories(F));
  F.prologue = createPrologue(F);

  // ---------------------------------------------------------------- stats + accolades
  const statsByType = t => STUNTS.filter(s => s.type === t && !F.stunts.byId[s.id]?.broken);
  F.stat = function (key) {
    if (key.startsWith('winAll:')) { const ty = key.slice(7); const evs = F.events.list.filter(e => e.type === ty && !e.broken); return evs.length && evs.every(e => S.events[e.id]?.wins) ? 1 : 0; }
    switch (key) {
      case 'chapter': return S.chapter;
      case 'outposts': return F.sites.list.filter(s => s.kind !== 'main' && !s.broken && S.chapter >= s.chapter).length;
      case 'trap3': case 'danger3': case 'drift3': case 'zone3': case 'trail3': return statsByType(key.slice(0, -1)).filter(s => S.stunts[s.id]?.stars >= 3).length;
      case 'stuntStars': return Object.values(S.stunts).reduce((a, r) => a + (r.stars || 0), 0);
      case 'roadsPct': return Math.floor(F.coll.roadsPct());
      case 'districts': return S.districts.length;
      case 'boards': return Object.keys(S.boards).length;
      case 'barns': return Object.values(S.barns).filter(b => b.s !== 'rumour').length;
      case 'houses': return S.houses.length;
      case 'rivalsBeaten': return RIVALS.filter(r => (S.rivals[r.id]?.beat || 0) > 0).length;
      case 'carsOwned': return F.cars.owned().length;
      case 'topMph': return Math.max(S.stats.topMph || 0, Math.round((G.economy.stats.bestSpeed || 0) / 1.609));
      case 'bestAirX10': return Math.max(S.stats.bestAirX10 || 0, Math.round((G.economy.stats.bestAir || 0) * 10));
      default: return S.stats[key] || 0;
    }
  };
  let accT = -1;
  F.checkAccolades = () => { if (accT < 0) accT = 0.4; };
  F.bump = (k, n = 1) => { S.stats[k] = (S.stats[k] || 0) + n; F.checkAccolades(); };
  F.setStat = (k, v) => { S.stats[k] = v; F.checkAccolades(); };
  F.maxStat = (k, v) => { if (v > (S.stats[k] || 0)) { S.stats[k] = v; F.checkAccolades(); } };
  function runAccolades() {
    let any = false;
    for (const a of ACCOLADES) {
      if (S.accolades[a.id]) continue;
      if (F.stat(a.stat) < a.target) continue;
      S.accolades[a.id] = Date.now(); any = true;
      F.overlay.banner('Accolade', a.name, `${a.desc} · +${a.fp} FP${a.credits ? ' · ' + fmtMoney(a.credits) : ''}${a.spin ? ` · ${a.spin} Prize Spin${a.spin > 1 ? 's' : ''}` : ''}`, '#39e07a', 2800, 'levelup');
      F.award({ credits: a.credits || 0, xp: 500, fp: a.fp || 0 }, a.name, { silent: true, noAcc: true });
      if (a.spin) F.addSpins(a.spin, false, true);
    }
    if (any) F.save();
  }

  // ---------------------------------------------------------------- rewards, festival points, chapters, spins
  F.award = function ({ credits = 0, xp = 0, fp = 0 }, reason = '', { silent = false } = {}) {
    if (credits || xp) G.economy.add(credits, Math.round(xp * (F.perk('skillxp') && reason === 'skills' ? 1.1 : 1)), silent ? 'silent' : reason);
    if (fp) F.addFP(fp);
    F.checkAccolades();
  };
  F.addFP = function (n) {
    S.fp += Math.round(n);
    while (CHAPTERS[S.chapter + 1] && S.fp >= CHAPTERS[S.chapter + 1].fp) unlockChapter(S.chapter + 1);
  };
  function unlockChapter(n) {
    S.chapter = n;
    const C = CHAPTERS[n];
    F.overlay.banner(`Chapter ${n + 1} unlocked`, C.name, C.desc, '#ff2e7e', 4200, 'levelup');
    if (C.line) F.queueCaption([C.line]);
    if (C.outpost) { const s = F.sites.byId[C.outpost]; if (s && !s.broken) { if (!S.outposts.includes(s.id)) S.outposts.push(s.id); F.overlay.banner('Outpost open', s.name, `${s.place} · fast travel unlocked`, s.color, 3600); } }
    F.refreshWorld();
    F.save();
  }
  F.onLevelUp = function (level) {
    const sup = level % 5 === 0;
    F.addSpins(1, sup);
    F.overlay.banner(`Level ${level}`, sup ? 'Super Prize Spin earned' : 'Prize Spin earned', 'Open it from the festival hub or the Campaign menu', '#ffc247', 3000, 'levelup');
  };
  F.addSpins = function (n, sup = false, quiet = false) {
    if (sup) S.superSpins += n; else S.spins += n;
    if (!quiet) G.hud?.toast?.(sup ? 'Super Prize Spin' : 'Prize Spin', `${S.spins + S.superSpins} ready · festival hub or Campaign menu`, 'good', 3200);
    F.save();
  };
  F.useSpin = async function () {
    if (S.superSpins > 0) { S.superSpins--; F.save(); await F.screens.prizeSpin(true); }
    else if (S.spins > 0) { S.spins--; F.save(); await F.screens.prizeSpin(false); }
    else G.audio?.ui('error');
    F.checkAccolades();
  };
  F.perk = name => S.houses.some(id => HOUSES.find(h => h.id === id)?.perk === name);

  // ---------------------------------------------------------------- conditions (time / weather / fog) for events
  F.setConditions = function ({ time, weather, fog } = {}, keep = false) {
    const env = G.env.state;
    const W = G.weather;
    const tok = { hours: env.hours, timeScale: env.timeScale, fogBoost: env.fogBoost || 0, weather: W?.current ?? W?.kind ?? W?.state?.kind ?? null, locked: W?.locked };
    if (time != null) { env.hours = time; env.timeScale = 0; }
    if (weather && W?.set) { try { W.set(weather, { transition: 0 }); W.setLocked?.(true); } catch (e) { console.warn('[festival] weather', e); } }
    if (fog != null) env.fogBoost = fog;
    void keep;
    return tok;
  };
  F.restoreConditions = function (tok, { keepTime = false } = {}) {
    if (!tok) return;
    const env = G.env.state;
    if (!keepTime) env.hours = tok.hours;
    env.timeScale = tok.timeScale || 1 / 60; env.fogBoost = tok.fogBoost || 0;
    const W = G.weather;
    if (W?.set && tok.weather && W.kind !== tok.weather) { try { W.set(tok.weather, { transition: 4 }); } catch { /* ignore */ } }
    if (W?.setLocked && tok.locked !== undefined && W.locked !== tok.locked) W.setLocked(tok.locked);
  };

  // ---------------------------------------------------------------- race corridors: no parked cars on the racing line
  // hides the street's parked cars within the route's road corridor (and removes knocked-loose ones); restore after
  F.clearCorridor = function (R) {
    const P = G.world.props?.parked, hidden = [];
    const C = 16, grid = new Map(), key = (x, z) => Math.floor(x / C) * 73856093 ^ Math.floor(z / C) * 19349663;
    for (let i = 0; i < R.n; i++) { const k = key(R.pts[i][0], R.pts[i][1]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
    const near = (x, z) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const arr = grid.get((cx + a) * 73856093 ^ (cz + b) * 19349663); if (!arr) continue;
        for (const i of arr) { const w = (R.width[i] || 12) / 2 + 2.5; const dx = R.pts[i][0] - x, dz = R.pts[i][1] - z; if (dx * dx + dz * dz < w * w) return true; }
      }
      return false;
    };
    if (P?.list) for (const p of P.list) if (!p.hidden && near(p.x, p.z) && P.hide(p.id)) hidden.push(p.id);
    // tiles that stream in during the event: their parked cars on the line are hidden as they load (they were obstacles
    // on Macalla Rd / Treasure Island once the player got there)
    if (P && 'blocked' in P) { P.blocked = near; P.onBlocked = id => hidden.push(id); }
    for (const v of G.vehicles().slice()) if (v.role === 'parked' && near(v.pos.x, v.pos.z)) G.removeVehicle(v);
    // trees / street props on the line (streamed now or later: props/v2.js applies world/keepout.js): the carriageway on
    // road legs, the 14 m off-road lane on dirt / cross-country legs (the AI line wanders up to ~5 m off the centre)
    // + 3 m at junction corners (heading change > 30 deg over +-15 m): the line cuts the kerb there and the signal poles /
    // hydrants / news boxes on the corner were most of the remaining rival resets
    const hw = new Float32Array(R.n), n = R.n, RP = R.pts, at = i => RP[R.loop ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n; i++) {
      hw[i] = R.off[i] ? Math.max(6, (R.width[i] || 14) / 2) : Math.max(2.5, (R.width[i] || 8) / 2);
      const a = at(i - 3), b = at(i), c = at(i + 3), h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
      if (dh > 0.52) hw[i] += 3;
    }
    hidden.keepId = keepOut.add('route:' + (++corridorN), R.pts, hw, { loop: !!R.loop });
    return hidden;
  };
  let corridorN = 0;
  F.restoreCorridor = function (ids) { if (ids?.keepId) keepOut.remove(ids.keepId); const P = G.world.props?.parked; if (!P) return; if ('blocked' in P) { P.blocked = null; P.onBlocked = null; } if (!ids) return; for (const id of ids) P.show(id); };

  // ---------------------------------------------------------------- cinematic camera (G.cameraOverride)
  F.cinematic = function (dur, fn, onDone) {
    const prev = G.cameraOverride;
    let t = 0;
    const hudWas = G.ui ? G.ui.hudHidden : null;
    if (G.ui) G.ui.hudHidden = true;
    cine = {
      update(cam, dt) {
        t += dt; fn(cam, dt, t);
        if (t >= dur) { cine = null; if (G.cameraOverride === this) G.cameraOverride = prev && prev !== this ? prev : null; if (G.ui) G.ui.hudHidden = !!hudWas; G.rig.snap(); onDone?.(); }
      },
    };
    G.cameraOverride = cine;
  };

  // ---------------------------------------------------------------- cars for events: garage picker, loaners
  let ownCar = null;
  F.chooseCar = async function ({ cls, title, kicker, loaner, tags }) {
    const owned = F.cars.owned();
    const eligible = owned.filter(k => F.cars.eligible(k, cls, tags));
    const loanKey = F.cars.exists(loaner) && F.cars.eligible(loaner, cls) ? loaner : F.cars.bestFor(cls, { tags: tags || [] });
    ownCar = F.cars.current();
    if (!eligible.length) {
      const ok = await F.screens.confirm({ kicker: kicker || 'Event', title: 'Borrow a loaner?', text: `You do not own a Class ${cls} car yet. Borrow the <b>${F.cars.name(loanKey)}</b> for this event? (10% loaner fee on credits)`, yes: 'Borrow it', no: 'Cancel' });
      return ok ? { key: loanKey, loaner: true } : null;
    }
    const cur = F.cars.current();
    if (G.garage?.pickCar) {
      try {
        const k = await G.garage.pickCar({ title: title || 'Choose a car', filter: { cls, maxPI: { D: 500, C: 600, B: 700, A: 800, S1: 900, S2: 998, X: 999 }[cls] ?? 999, tags } });
        if (!k) return null;
        return { key: k, loaner: !owned.includes(k) };
      } catch (e) { console.warn('[festival] garage.pickCar', e); }
    }
    // our own picker (current car pre-selected if eligible)
    const r = await F.screens.carPick({ cls, title, kicker, owned, loaner: loanKey });
    void cur;
    return r;
  };
  F.restoreCar = function () {
    const key = ownCar || F.cars.current();
    const pv = G.player.vehicle;
    if (!pv || pv.id === key) return;
    const yaw = pv.body.yaw();
    F.cars.spawnPlayer(key, pv.pos.x, pv.pos.z, yaw);
  };

  // ---------------------------------------------------------------- GPS + map selection
  F.gpsTo = function (p, color = '#b36bff', name = '') {
    if (!p) return;
    G.gps.setTarget(p.x, p.z, color); G.gps.timer = 0;
    G.hud?.toast?.('GPS set', name, '', 1800);
    G.audio?.ui('confirm');
  };
  // map selection (G.ui.markers onSelect): sites / owned houses fast travel (festival pricing), anything else sets a route
  F.select = function (kind, obj, ctx) {
    if (kind === 'site') { F.coll.fastTravel({ name: obj.name, sub: obj.place, x: obj.hub.x, z: obj.hub.z }); return 'close'; }
    if (kind === 'house' && F.coll.owns(obj.id)) { F.coll.fastTravel({ name: obj.name, sub: obj.place, x: obj.x, z: obj.z }); return 'close'; }
    const pos = kind === 'house' ? { x: obj.sx, z: obj.sz } : obj.start || obj.hub || obj;
    if (ctx?.setWaypoint) ctx.setWaypoint(); else F.gpsTo(pos, '#b36bff', obj.name || '');
    return undefined;
  };

  // ---------------------------------------------------------------- points of interest (site hubs, houses)
  let poiNear = null, poiT = 0;
  function pois() {
    const out = [];
    for (const s of F.sites.list) if (s.open) out.push({ id: 'site:' + s.id, x: s.hub.x, z: s.hub.z, r: s.kind === 'main' ? 14 : 11, color: s.color, kicker: s.kind === 'main' ? 'Festival hub' : 'Outpost', title: s.name, sub: s.place, action: '<span><kbd>E</kbd>Enter</span>', run: () => F.screens.hub(s) });
    for (const H of F.coll.houses) out.push({ id: 'house:' + H.id, x: H.sx, z: H.sz, r: 9, color: F.coll.owns(H.id) ? '#39e07a' : '#a7b0ba', kicker: F.coll.owns(H.id) ? 'Your house' : 'House for sale', title: H.name, sub: F.coll.owns(H.id) ? H.perkText : `${fmtMoney(H.price)} · ${H.perkText}`,
      action: F.coll.owns(H.id) ? (G.garage?.open ? '<span><kbd>E</kbd>Garage</span>' : '<span><kbd>E</kbd>Fast travel</span>') : '<span><kbd>E</kbd>Buy</span>', run: () => (F.coll.owns(H.id) ? (G.garage?.open ? G.garage.open() : F.screens.fastTravel()) : F.coll.buyHouse(H)) });
    return out;
  }
  function updatePOI(dt) {
    poiT -= dt;
    if (poiT <= 0) {
      poiT = 0.25; poiNear = null;
      const pv = G.player.vehicle, p = G.player.pos;
      if (pv || p) { let bd = Infinity; for (const q of pois()) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < q.r && d < bd) { bd = d; poiNear = q; } } }
      if (poiNear) F.overlay.prompt('poi', { kicker: poiNear.kicker, title: poiNear.title, sub: poiNear.sub, color: poiNear.color, action: poiNear.action });
      else F.overlay.prompt('poi', null);
    }
    if (poiNear && G.input.pressed('interact')) { const q = poiNear; poiNear = null; F.overlay.prompt('poi', null); q.run(); }
  }

  // ---------------------------------------------------------------- world visibility / refresh
  F.refreshWorld = function () {
    const on = F.enabled();
    F.markers.setWorldVisible(on);
    F.overlay.setVisible(on);
    F.sites.refresh();
    F.events.refreshMarkers();
    for (const ev of F.events.list) if (!ev.broken) F.markers.setVisible('ev:' + ev.id, on && F.events.available(ev));
    for (const T of F.stunts.list) if (!T.broken) F.markers.setVisible('st:' + T.id, on);
    F.stunts.refreshMarkers();
    F.stunts.group.visible = on;
    F.coll.refreshAll();
    F.coll.setVisible(on);
    F.stories.refreshMarkers();
  };
  function onMode() {
    if (!F.enabled()) {
      if (F.activity) F.activity.end?.('quit');
      F.stunts.cancel();
      for (const k of ['event', 'story', 'poi']) F.overlay.prompt(k, null);
      F.overlay.live(null);
    }
    F.refreshWorld();
  }
  G.on('mode', onMode);

  // ---------------------------------------------------------------- hooks from the rest of the game
  const onHit = s => { F.racing.onPlayerHit(s); F.stunts.onPlayerHit(s); F.stories.onPlayerHit(s); };
  G.on('impact', (v, e) => { if (v === G.player.vehicle && e.kind !== 'ground' && e.strength > 0.12) onHit(e.strength); });
  G.on('carHit', (a, b, hit) => { const pv = G.player.vehicle; if (pv && (a === pv || b === pv)) onHit(hit.strength); });
  G.on('air', air => { if (!F.enabled()) return; F.bump('jumps'); F.maxStat('bestAirX10', Math.round(air * 10)); });
  G.on('nearMiss', () => { if (F.enabled()) F.bump('nearMisses'); });
  G.on('skillBank', pts => { if (!F.enabled()) return; F.maxStat('bestChain', Math.round(pts)); const fp = Math.min(150, Math.round(pts / 400)); if (fp > 0) F.addFP(fp); });
  G.on('fastTravel', m => {
    if (!F.enabled() || !m) return;
    const cost = F.coll.ftCost(); if (!cost) return;
    const paid = Math.min(cost, Math.floor(G.economy.money));
    if (paid > 0) { G.economy.spend(paid); G.hud?.toast?.('Fast travel', `${fmtMoney(paid)} · fast travel boards make it cheaper`, '', 2200); }
  });
  G.on('start', () => {
    // real launches (title screen -> play): first time in the festival runs the prologue
    if (F.enabled() && !S.prologue && params.get('prologue') !== '0') F.after(0.2, () => F.prologue.start());
  });

  // ---------------------------------------------------------------- per frame
  let saveT = 5, first = true, warm = null;
  F.after(2, () => { try { warm = F.cars.roster().slice(); } catch { warm = null; } });
  G.systems.push({
    update(dt) {
      // timers + overlay run whenever the game ticks
      for (let i = timers.length - 1; i >= 0; i--) { const T = timers[i]; T.t -= dt; if (T.t <= 0) { timers.splice(i, 1); T.fn(); } }
      F.overlay.update(dt);
      F.markers.update3D(dt);
      F.sites.update(dt);
      if (first) { first = false; F.refreshWorld(); if (params.get('prologue') === '1' && F.enabled()) F.prologue.start(); }
      // warm the car-spec cache a car per frame (grid building sorts the whole roster by PI)
      if (warm && !F.activity) { const k = warm.pop(); if (k) F.cars.spec(k); else warm = null; }
      if (!F.enabled()) return;
      S.playTime = (S.playTime || 0) + dt;
      if (capQ.length && !F.overlay.captionsBusy()) F.say(capQ.splice(0));
      if (accT >= 0) { accT -= dt; if (accT < 0) runAccolades(); }
      if (cine) { const pv = G.player.vehicle; if (pv) { pv.input.throttle = 0; pv.input.brake = 1; pv.input.autoReverse = false; pv.input.reverse = false; } }
      if (F.prologue.running()) { F.prologue.update(dt); return; }
      F.racing.update(dt);
      F.stories.update(dt);
      F.stunts.update(dt);
      F.coll.update(dt);
      if (!F.activity && !cine && G.state === 'play') { F.events.update(dt); updatePOI(dt); } else F.overlay.prompt('poi', null);
      // campaign shortcut (Tab / pad d-pad down): the pause menu's Campaign tab, or the festival's own screen without the UI shell
      if (G.input.pressed('phone') && !F.activity && G.state === 'play' && !G.ui?.isModal?.()) { if (G.ui?.menu?.addTab) G.ui.menu.open('campaign'); else F.screens.campaign(); }
      saveT -= dt; if (saveT <= 0) { saveT = 10; F.save(); }
    },
  });
  // 'campaign' + 'collection' tabs in the UI shell's pause menu. sys_menus installs after us and registers fallback
  // tabs with the same ids, so (re)register after every install has run (microtask, first frame, game start).
  const tryTab = () => { const m = G.ui?.menu; if (!m?.addTab) return; try { m.addTab(F.screens.campaignTab); m.addTab(F.screens.collectionTab); } catch (e) { console.warn('[festival] menu.addTab', e); } };
  tryTab(); queueMicrotask(tryTab); F.after(0.05, tryTab); G.on('start', tryTab);

  // ---------------------------------------------------------------- public API + dev helpers
  Object.assign(F, {
    roadsDiscovered: () => F.coll.roadsInfo(),
    openCampaign: tab => F.screens.campaign(tab),
    openEvent: id => F.events.open(F.events.byId[id]),
    startEvent: (id, opts = {}) => { const ev = F.events.byId[id]; if (!ev || !F.events.route(ev)) return false; F.events.launch(ev, { carKey: opts.car || F.cars.current(), diff: opts.diff ?? S.difficulty ?? 1, loaner: !!opts.loaner }); return true; },
    endEvent: why => F.activity?.end?.(why || 'quit'),
    restartEvent: () => { if (F.activity?.kind === 'race') F.racing.restart(); else if (F.activity?.kind === 'story') F.stories.restart(); },
    fastTravel: target => F.coll.fastTravel(target),
    openPrizeSpin: sup => F.screens.prizeSpin(!!sup),
    startStory: (sid, mid) => { const s = F.stories.list.find(x => x.id === sid); const m = s?.missions.find(x => x.id === mid) || F.stories.next(s); if (s && m) F.stories.open(s, m); },
    debug: {
      fp: n => { F.addFP(n); F.save(); },
      chapter: n => { while (S.chapter < n && CHAPTERS[S.chapter + 1]) { S.fp = Math.max(S.fp, CHAPTERS[S.chapter + 1].fp); unlockChapter(S.chapter + 1); } },
      skipPrologue: () => { if (F.prologue.running()) F.prologue.skip(); else { S.prologue = 1; F.save(); F.refreshWorld(); } },
      reset: () => { Object.assign(S, defaultState()); F.save(); },
      events: () => F.events.list.map(e => ({ id: e.id, type: e.type, broken: e.broken, start: e.start, district: e.district })),
      stunts: () => F.stunts.list.map(t => ({ id: t.id, type: t.type, broken: t.broken, x: t.x, z: t.z })),
      // dev: carry the player's car along the active route at `speed` m/s (deterministic logic tests, no driving)
      ghost(on = true, speed = 30) {
        if (!on) { window.__autopilot = null; return; }
        const o = {}; let s = null, route = null;
        window.__autopilot = (input, dt) => {
          const pv = G.player.vehicle; if (!pv) return;
          const A = F.racing.active, R = A?.route || F.stories.active?.route || F.prologue.active?.R;
          if (!R) return;
          if (R !== route) { route = R; s = null; }
          const live = !A || A.phase === 'race';
          if (s == null) s = A ? A.player.tr.s : 0;
          if (live) s += speed * dt;
          if (!R.loop) s = Math.min(s, R.L - 0.5);
          routeAt(R, s, o);
          pv.place(o.x, o.y + 0.35, o.z, Math.atan2(-o.dx, -o.dz));
          if (live) pv.body.vel.set(o.dx * speed, 0, o.dz * speed);
          input.axes.throttle = live ? 0.8 : 0; input.axes.brake = 0; input.axes.steer = 0;
        };
      },
      // dev: drive the player's car along the active route (race / mission / prologue) through window.__autopilot
      autopilot(on = true, speedMul = 0.9) {
        if (!on) { window.__autopilot = null; return; }
        let d = null, route = null;
        window.__autopilot = (input, dt) => {
          const pv = G.player.vehicle; if (!pv) return;
          const R = F.racing.active?.route || F.stories.active?.route || F.prologue.active?.R || null;
          if (!R) return;
          if (R !== route || !d || d.v !== pv) { route = R; d = new Driver(pv, G.world.graph, { mode: 'race' }); d.setPath(R.pts, { latAcc: 7.2, loop: R.loop, ys: R.ys }); d.speedMul = speedMul; d.rubber = 1; }
          d.drive(dt, G.traffic.ctx);
          input.axes.throttle = pv.input.throttle; input.axes.brake = pv.input.brake; input.axes.steer = pv.input.steer;
        };
      },
    },
  });
  console.log(`[festival] ${FESTIVAL.name}: ${F.events.list.filter(e => !e.broken).length}/${EVENTS.length} events, ${F.stunts.list.filter(s => !s.broken).length}/${STUNTS.length} stunts, ${F.sites.list.filter(s => !s.broken).length} sites, ${F.coll.boards.length} boards, ${F.coll.barns.length} barns, ${F.coll.houses.length} houses in ${(performance.now() - t0).toFixed(0)} ms`, tm);
  void screenBusy; void roadPath; void fmtNum; void clamp;
  return F;
}
