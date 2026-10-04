// Garage save data: one instance per owned car (upgrades, tune, paint, odometer, wins) + collection rewards.
// Own localStorage key; G.economy.owned / G.economy.current are kept in step for older code.
import { CARS } from '../../vehicle/cars.js';

const KEY = 'hillbomb.garage.v1';
export const DEFAULT_LOOK = k => ({ paint: CARS[k]?.paint ?? null, finish: CARS[k]?.year < 1985 ? 'gloss' : 'metallic', paint2: CARS[k]?.paint2 ?? null, rim: null, rimFinish: 'stock', rimColor: null, caliper: 0x1d1d1f, tint: 0, livery: { kind: 'none', color: 0xffffff, color2: 0x111111, number: 27 } });

export function createStore(G) {
  let data = { v: 1, cars: {}, order: [], claimed: {}, current: null, seen: {} };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.v === 1) data = { ...data, ...d }; } catch { /* storage unavailable */ }
  let dirty = false, saveT = 0;
  const S = {
    get data() { return data; },
    has: k => !!data.cars[k],
    get(k) { return data.cars[k] || null; },
    owned: () => data.order.filter(k => data.cars[k] && CARS[k]),
    add(k, source = 'dealer') {
      if (!CARS[k]) return null;
      if (!data.cars[k]) {
        data.cars[k] = { up: {}, tune: {}, look: DEFAULT_LOOK(k), odo: 0, wins: 0, races: 0, acquired: Date.now(), source };
        data.order.push(k);
      }
      S.sync(); S.save();
      return data.cars[k];
    },
    remove(k) { delete data.cars[k]; data.order = data.order.filter(x => x !== k); S.sync(); S.save(); },
    setCurrent(k) { data.current = k; S.sync(); S.save(); },
    current: () => data.current,
    claimed: m => !!data.claimed[m],
    claim(m) { data.claimed[m] = Date.now(); S.save(); },
    markSeen(k) { data.seen[k] = 1; S.touch(); },
    // economy mirror (the economy list is the one other systems read and write)
    sync() {
      const E = G.economy; if (!E) return;
      for (const k of data.order) if (!E.owned.includes(k)) E.owned.push(k);
      if (data.current && CARS[data.current]) E.current = data.current;
      E.save?.();
    },
    /** pull cars other modules added straight to G.economy.owned (festival prizes, legacy menus) */
    pull() {
      const E = G.economy; if (!E) return false;
      let changed = false;
      for (const k of E.owned) if (CARS[k] && !data.cars[k]) { data.cars[k] = { up: {}, tune: {}, look: DEFAULT_LOOK(k), odo: 0, wins: 0, races: 0, acquired: Date.now(), source: 'legacy' }; data.order.push(k); changed = true; }
      if (E.current && CARS[E.current] && data.cars[E.current] && E.current !== data.current) { data.current = E.current; changed = true; }
      if (changed) S.save();
      return changed;
    },
    touch() { dirty = true; },
    tick(dt) { if (dirty && (saveT += dt) > 8) S.save(); },
    save() { dirty = false; saveT = 0; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } },
    reset() { data = { v: 1, cars: {}, order: [], claimed: {}, current: null, seen: {} }; S.save(); },
  };
  return S;
}
