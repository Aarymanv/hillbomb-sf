// Money (credits), XP / player level, owned cars, records and settings. Persisted through the versioned profile save
// (festival/save.js: 'hillbomb.save.v2', migrated from 'hillbomb.save.v1').
// Level-ups: in the festival (forza mode) every level awards a Prize Spin (G.festival.onLevelUp); elsewhere a cash bonus.
import { loadStore, persist, wipeStore } from './festival/save.js';

export function createEconomy(G) {
  const E = {
    money: 5000, displayMoney: 5000, xp: 0, level: 1, xpInLevel: 0, xpForNext: 1000,
    owned: ['hatch'], current: 'hatch', stats: { jumps: 0, bestAir: 0, bestSpeed: 0, races: 0, wins: 0, bestDrift: 0, distance: 0, nearMisses: 0, smashes: 0 },
    records: {},   // eventId -> best
    settings: { units: 'mph', volume: 0.9, music: 0.6, sfx: 1, quality: 'high', fog: 'karl', invertY: false },
  };
  // XP curve: early levels come fast (a race or two), later ones slow down
  const xpFor = lvl => Math.round(900 + (lvl - 1) * 380 + Math.max(0, lvl - 20) * 220);
  E.xpFor = xpFor;
  function recalc() {
    let lvl = 1, rest = E.xp;
    while (rest >= xpFor(lvl) && lvl < 999) { rest -= xpFor(lvl); lvl++; }
    const up = lvl - E.level;
    E.level = lvl; E.xpInLevel = Math.floor(rest); E.xpForNext = xpFor(lvl);
    return up;
  }
  E.add = function (money, xp = 0, reason = '') {
    E.money = Math.max(0, E.money + Math.round(money));
    if (xp > 0) {
      E.xp += Math.round(xp);
      const ups = recalc();
      for (let i = ups - 1; i >= 0; i--) {
        const lvl = E.level - i;
        if (G.festival?.onLevelUp && G.festival.enabled()) G.festival.onLevelUp(lvl);
        else { G.hud?.banner(`LEVEL ${lvl}`, 'Level bonus +$2,500', 'gold', 2400); G.audio?.ui('levelup'); E.money += 2500; }
        G.emit?.('levelUp', lvl);
      }
    }
    if (money > 0 && reason !== 'silent') G.audio?.ui('money');
    save();
  };
  E.addXP = xp => E.add(0, xp, 'silent');
  E.spend = function (amt) { if (G.flags?.creative) return true; if (E.money < amt) return false; E.money -= amt; save(); return true; };   // Free Roam: everything is free
  E.record = function (id, value, better = (a, b) => a > b) {
    const old = E.records[id];
    if (old === undefined || better(value, old)) { E.records[id] = value; save(); return true; }
    return false;
  };
  E.own = function (id) { if (!E.owned.includes(id)) { E.owned.push(id); save(); return true; } return false; };
  function save() {
    const st = loadStore();
    st.economy = { money: E.money, xp: E.xp, owned: E.owned, current: E.current, stats: E.stats, records: E.records, settings: E.settings };
    persist();
  }
  E.save = save;
  E.load = function () {
    const d = loadStore().economy;
    if (d) Object.assign(E, { money: d.money ?? E.money, xp: d.xp ?? 0, owned: d.owned || E.owned, current: d.current || E.current, stats: { ...E.stats, ...d.stats }, records: d.records || {}, settings: { ...E.settings, ...d.settings } });
    E.displayMoney = E.money; E.level = 1; recalc();
  };
  E.reset = function () { wipeStore(); };
  // resume point: where the player last drove (free driving only, on a road, not mid-event), restored by main.js on load
  let posT = 8;
  E.update = function (dt) {
    E.displayMoney += (E.money - E.displayMoney) * Math.min(1, dt * 6); if (Math.abs(E.money - E.displayMoney) < 1) E.displayMoney = E.money;
    if ((posT -= dt) > 0) return; posT = 10;
    const v = G.player?.vehicle;
    if (G.state !== 'play' || !v || G.festival?.activity || G.events?.active || v.body.speed > 25) return;
    const p = v.pos; if (!G.world?.graph?.nearestEdge?.(p.x, p.z, 10)) return;
    E.stats.lastPos = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, yaw: +v.body.yaw().toFixed(3), map: G.world.v2 ? 'v2' : 'v1' };
    save();
  };
  return E;
}
