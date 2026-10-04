// Car roster adapter. Uses the garage module (G.garage: spec / pickCar / give / owned / current) when it exists,
// feature-detected at call time, and falls back to the built-in roster (vehicle/cars.js) + economy ownership.
import { CARS, PLAYER_GARAGE_ORDER } from '../../vehicle/cars.js';

export const CLASS_ORDER = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
export const CLASS_MAX = { D: 500, C: 600, B: 700, A: 800, S1: 900, S2: 998, X: 999 };
export const clsLabel = c => `${c} ${CLASS_MAX[c] ?? ''}`.trim();
export const classRank = c => (c === 'S' ? 4 : Math.max(0, CLASS_ORDER.indexOf(c)));
const PI_OF = { D: 480, C: 580, B: 680, A: 780, S: 870, S1: 870, S2: 950, X: 999 };
const TAGS = {
  hatch: ['tuner', 'hatch', 'street'], sedan: ['sedan'], taxi: ['taxi'], van: ['van', 'utility'], suv: ['suv', 'offroad'], pickup: ['truck', 'offroad', 'utility'],
  muscle: ['muscle', 'classic', 'barnfind'], rally: ['rally', 'offroad', 'truck'], ev: ['ev', 'modern'], coupe: ['sports', 'classic'], super: ['hyper', 'super'], bus: ['bus'], police: ['police'],
};

export function createCars(G) {
  const gar = () => G.garage || null;
  // spec() is called a lot while building grids (sorting by PI): cache it, invalidated whenever the garage changes
  const cache = new Map(); let hooked = false;
  const hook = () => { if (hooked) return; const g = gar(); if (g?.onChange) { g.onChange(() => cache.clear()); hooked = true; } };
  const A = {
    spec(key) {
      hook();
      if (cache.has(key)) return cache.get(key);
      const v = A.specRaw(key); cache.set(key, v); return v;
    },
    flush() { cache.clear(); },
    specRaw(key) {
      const s = gar()?.spec?.(key);
      if (s) return { ...s, cls: s.cls || classOfPi(s.pi), pi: s.pi ?? PI_OF[s.cls] ?? 500, tags: s.tags || TAGS[key] || [] };
      const d = CARS[key]; if (!d) return null;
      const cls = d.cls === 'S' ? 'S1' : d.cls;
      return { key, name: d.name, make: '', year: '', cls, pi: PI_OF[d.cls] ?? 500, tags: TAGS[key] || [], stats: { top: d.top, torque: d.torque, mass: d.mass, drive: d.drive } };
    },
    name(key) { return A.spec(key)?.name || key; },
    exists(key) { return !!(gar()?.spec?.(key) || CARS[key]); },
    // every buyable / winnable car
    roster() {
      const g = gar();
      const r = g?.roster?.() || g?.all?.() || g?.list?.();
      if (Array.isArray(r) && r.length) return r.map(x => (typeof x === 'string' ? x : x.key || x.id)).filter(Boolean);
      return PLAYER_GARAGE_ORDER.filter(k => CARS[k] && k !== 'bus');
    },
    owned() { const o = gar()?.owned?.(); return Array.isArray(o) ? o.map(x => (typeof x === 'string' ? x : x.key || x.id)) : G.economy.owned.slice(); },
    owns(key) { return A.owned().includes(key); },
    current() { return gar()?.current?.() || G.player?.vehicle?.id || G.economy.current; },
    // resolves when the garage's car reveal (if any) closes
    give(key, source = 'festival', opts = {}) {
      const g = gar();
      let p = Promise.resolve(true);
      if (g?.give) { try { p = Promise.resolve(g.give(key, source, opts)); } catch (e) { console.warn('[festival] garage.give', e); } }
      // keep the economy list in step either way (other systems read it)
      if (!G.economy.owned.includes(key)) { G.economy.owned.push(key); G.economy.save(); }
      cache.delete(key);
      return p;
    },
    setCurrent(key) { gar()?.setCurrent?.(key); G.economy.current = key; G.economy.save(); },
    eligible(key, cls, tags) {
      const s = A.spec(key); if (!s) return false;
      if (cls && classRank(s.cls) > classRank(cls)) return false;
      if (tags && tags.length && !tags.some(t => s.tags.includes(t))) return false;
      return true;
    },
    // best roster car for a class (+optional preferred keys / tags), used for loaners, rival cars and prizes
    bestFor(cls, { prefer = [], tags = [], exact = false, rnd = Math.random } = {}) {
      const R = A.roster();
      const fit = k => { const s = A.spec(k); return s && (exact ? s.cls === cls : classRank(s.cls) <= classRank(cls)); };
      for (const k of prefer) if (A.exists(k) && fit(k)) return k;
      let pool = R.filter(k => fit(k) && (!tags.length || tags.some(t => A.spec(k).tags.includes(t))));
      if (!pool.length) pool = R.filter(fit);
      if (!pool.length) pool = R.slice();
      // competitive cars only: the top of the class (within 45 PI of the best, at least three to pick from)
      pool.sort((a, b) => (A.spec(b).pi - A.spec(a).pi));
      const best = A.spec(pool[0]).pi;
      let top = pool.filter(k => A.spec(k).pi >= best - 45);
      if (top.length < 3) top = pool.slice(0, 3);
      return top[Math.floor(rnd() * top.length)] || pool[0];
    },
    // roster car matching the most tags (earlier tags weigh more); the fallback wins ties
    byTags(tags, fallback) {
      const R = A.roster();
      let best = A.exists(fallback) ? fallback : null, bs = best ? score(best) + 0.5 : -1;
      function score(k) { const t = A.spec(k)?.tags || []; let s = 0; (tags || []).forEach((x, i) => { if (t.includes(x)) s += 10 - i; }); return s; }
      for (const k of R) { const sc = score(k); if (sc > bs) { bs = sc; best = k; } }
      return best || R[0];
    },
    // spawn a car for the player at a spot (garage may apply upgrades / paint)
    spawnPlayer(key, x, z, yaw, y = null) {
      const P = G.player, old = P.vehicle;
      if (old && old.id === key && !old.wrecked) { place(old, x, z, yaw, y); old.health = 100; G.rig.snap(); return old; }
      if (old) { P.exitVehicle(true); if (old.role !== 'parked') G.removeVehicle(old); }
      const g = gar();
      let v = null;
      try { v = g?.spawn?.(key, x, z, yaw, { role: 'player' }) || null; } catch (e) { console.warn('[festival] garage.spawn', e); }
      if (!v) v = G.spawnVehicle(A.exists(key) && CARS[key] ? key : 'hatch', x, z, yaw, { role: 'player', y: y ?? undefined });
      if (y != null) place(v, x, z, yaw, y);
      P.setVehicle(v);
      G.rig.snap();
      return v;
    },
    place,
  };
  function place(v, x, z, yaw, y = null) {
    const gy = y ?? G.world.groundAt(x, z, G.world.heightAt(x, z) + 3);
    v.place(x, gy + 0.3, z, yaw);
    v.body.sleeping = false;
    v.sync?.(0);
  }
  return A;
}
function classOfPi(pi) { return pi <= 500 ? 'D' : pi <= 600 ? 'C' : pi <= 700 ? 'B' : pi <= 800 ? 'A' : pi <= 900 ? 'S1' : pi <= 998 ? 'S2' : 'X'; }
