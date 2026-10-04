// Garage system: car ownership + per-car builds (upgrades, tune, paint), the garage screens (My Cars, Autoshow,
// Upgrades, Tuning, Paint, Collection), car select for events and the new-car reveal. Public API: G.garage.
//
//   spec(key, { stock }) -> { key, name, make, model, year, country, cls, pi, stats{speed,handling,accel,launch,braking,
//                             offroad 0-10}, tags, rarity, price, drive, engine, hp, mass, t100, top, ... } (owned cars
//                             report their current build unless { stock: true })
//   pickCar({ title, filter: { cls, maxPI, tags, owned = true, keys } }) -> Promise<key | null>
//   owned() -> [key]   current() -> key   setCurrent(key, { deliver })   give(key, source) -> Promise (reveal closes)
//   open(tab) 'mycars' | 'autoshow' | 'upgrades' | 'tuning' | 'paint' | 'collection'
//   buildFor(key) -> physics params (carParams with this car's upgrades + tune; merge over carParams(key))
//   roster() -> every buyable key   spawn(key, x, z, yaw, opts) -> Vehicle with the owned build
//   autoUpgrade(key, cls) -> plan   perf(key, build?)   classOf(pi)   onChange(fn)
import { CARS, MAKES, ROSTER_KEYS, carParams, perfOf, buildDef, setBuildProvider, clearPerfCache } from '../vehicle/cars.js';
import { UPGRADES, partOptions, classOfPI, classMaxPI, CLASS_ORDER, TYRES } from '../vehicle/tuning.js';
import { ENGINE_PROFILES } from '../audio/audio.js';
import { createStore } from './garage/store.js';
import { createGarageUI } from './garage/ui.js';

export function install(G) {
  // engine sounds: use the ideal profile (i6, rotary, flat4, w16...) once the audio module offers it
  for (const k in CARS) { const d = CARS[k]; if (d.ideal && ENGINE_PROFILES.includes(d.ideal)) d.engine = d.ideal; }

  const store = createStore(G);
  store.pull();
  if (!store.owned().length) { const k = CARS[G.economy?.current] ? G.economy.current : 'hatch'; store.add(k, 'starter'); store.setCurrent(k); }
  if (!store.current()) store.setCurrent(store.owned()[0]);
  const listeners = [];
  const changed = () => { for (const f of listeners) try { f(); } catch (e) { console.error(e); } };

  // Vehicles created with role 'player' use the owned build (cars.js asks this provider)
  setBuildProvider(k => {
    const i = store.get(k);
    return i ? { up: { ...i.up }, tune: { ...i.tune }, look: JSON.parse(JSON.stringify(i.look || {})) } : null;
  });

  const buildOf = k => { const i = store.get(k); return i ? { up: i.up || {}, tune: i.tune || {} } : { up: {}, tune: {} }; };
  const lookOf = k => store.get(k)?.look || null;

  const api = {
    store,
    buildOf, lookOf,
    classOf: classOfPI,
    perf: (k, build) => perfOf(k, build ?? (store.has(k) ? buildOf(k) : null)),
    spec(k, { stock = false } = {}) {
      const d0 = CARS[k]; if (!d0) return null;
      const own = store.has(k) && !stock, b = own ? buildOf(k) : null, d = buildDef(k, b), m = perfOf(k, b);
      return {
        key: k, name: d0.name, make: d0.makeName, makeId: d0.make, model: d0.modelName, year: d0.year, country: d0.country,
        cls: m.cls, pi: m.pi, stats: { ...m.stats }, tags: d0.tags.slice(), rarity: d0.rarity, price: d0.price, buyable: d0.buyable,
        drive: d.drive, engine: d.eng || d.engine, sound: d.engine, hp: d.hp, mass: Math.round(d.mass), cat: d0.cat,
        t60: m.t60, t100: m.t100, top: Math.round(m.vmax), brake100: +m.brake100.toFixed(1), latG: +m.lat120.toFixed(2),
        owned: store.has(k), upgraded: own && Object.values(b.up).some(Boolean), stockPI: perfOf(k).pi,
      };
    },
    roster: () => ROSTER_KEYS.filter(k => CARS[k].buyable),
    all: () => ROSTER_KEYS.slice(),
    owned: () => G.flags?.creative ? ROSTER_KEYS.filter(k => CARS[k].buyable) : store.owned(),   // Free Roam: the whole roster
    owns: k => !!G.flags?.creative || store.has(k),
    current: () => store.current() || G.economy?.current,
    setCurrent(k, { deliver = false } = {}) {
      if (!CARS[k]) return false;
      if (!store.has(k)) store.add(k, 'unknown');
      store.setCurrent(k);
      if (deliver && G.player) { if (G.menus?.deliver) G.menus.deliver(k); else api.spawn(k, G.player.pos.x, G.player.pos.z, 0); }
      changed();
      return true;
    },
    /** add a car (prize, barn find, gift) and show the reveal. Resolves when the player closes it. */
    give(k, source = 'gift', { reveal = true } = {}) {
      if (!CARS[k]) return Promise.resolve(false);
      const had = store.has(k);
      store.add(k, source);
      changed();
      if (!reveal || !G.renderer || typeof document === 'undefined') return Promise.resolve(!had);
      return new Promise(res => { try { ui.open('reveal', { key: k, source: srcLabel(source), kicker: had ? 'Duplicate car' : source === 'barnfind' ? 'Barn find' : 'New car', resolve: () => res(!had) }); } catch (e) { console.error('[garage] reveal', e); res(!had); } });
    },
    open(tab = 'mycars', opts = {}) {
      if (busy() && (tab === 'mycars' || tab === 'autoshow') && !opts.force) { G.ui?.notify?.({ title: 'Garage unavailable', sub: 'Not during events or police chases', kind: 'bad', ms: 2200 }); return false; }
      ui.open(tab, opts); return true;
    },
    close: () => ui.close(),
    isOpen: () => ui.isOpen(),
    /** physics params of the owned build (merge over carParams(key)) */
    buildFor(k) { return carParams(k, store.has(k) ? buildOf(k) : null); },
    pickCar({ title = 'Choose your car', kicker, filter = {} } = {}) {
      const f = { owned: true, ...filter };
      const cls = f.cls ? [].concat(f.cls) : null;
      const rank = c => CLASS_ORDER.indexOf(c);
      let list = (f.keys || (f.owned ? api.owned() : api.roster())).filter(k => CARS[k]);
      list = list.filter(k => {
        const s = api.spec(k);
        if (cls && !cls.some(c => (f.exact ? s.cls === c : rank(s.cls) <= rank(c)))) return false;
        if (f.maxPI && s.pi > f.maxPI) return false;
        if (f.minPI && s.pi < f.minPI) return false;
        if (f.tags?.length && !(f.allTags ? f.tags.every(t => s.tags.includes(t)) : f.tags.some(t => s.tags.includes(t)))) return false;
        return true;
      }).sort((a, b) => api.spec(b).pi - api.spec(a).pi);
      if (!G.renderer || typeof document === 'undefined') return Promise.resolve(list[0] || null);
      return new Promise(res => ui.open('pick', { title, kicker, filter: f, list, resolve: res }));
    },
    /** spawn an owned (or stock) car for the player; returns the Vehicle */
    spawn(k, x, z, yaw, opts = {}) {
      const v = G.spawnVehicle(k, x, z, yaw, { role: 'player', ...opts });
      return v;
    },
    /** player's car was edited in the garage: respawn it in place so the new physics apply */
    refreshPlayerCar(k) {
      const P = G.player, v = P?.vehicle;
      if (!v || v.id !== k || v.role !== 'player') return;
      const o = v.root.position, yaw = v.body.yaw(), hp = v.health;
      P.exitVehicle(true);
      G.removeVehicle(v);
      const nv = G.spawnVehicle(k, o.x, o.z, yaw, { role: 'player', y: o.y - 0.3 });
      nv.health = hp;
      P.setVehicle(nv);
      G.rig?.snap?.();
    },
    applyLookLive(k) { const v = G.player?.vehicle; if (v && v.id === k && v.visual.hero) v.applyLook(JSON.parse(JSON.stringify(store.get(k).look))); },
    recordRace(k, won) { const i = store.get(k); if (!i) return; i.races = (i.races || 0) + 1; if (won) i.wins = (i.wins || 0) + 1; store.touch(); },
    onChange(fn) { listeners.push(fn); },
    // ---- auto-upgrade (FH style 'upgrade to A 800'): rank every available part option by PI gained per credit,
    // stack the best ones while the predicted PI stays in the class, then verify with real measurements and trim/fill.
    autoUpgrade(k, cls) {
      const d0 = CARS[k], inst = store.get(k), cap = classMaxPI(cls), base = { ...(inst?.up || {}) };
      const isOwned = (u, v) => v === 0 || v === (d0.tyre || 'street') || !!inst?.inv?.[u.id + ':' + v];
      const pf = up => perfOf(k, { up }, { fast: true }).pi;
      const pi0 = pf(base), tyreRank = ['eco', 'street', 'sport', 'semi', 'slick'];
      const cands = [];
      for (const u of UPGRADES) {
        const opts = partOptions(u, d0); if (opts.length < 2 || u.swap) continue;
        const cur = base[u.id] ?? (u.tyre ? d0.tyre || 'street' : 0);
        for (const o of opts) {
          const better = u.tyre ? tyreRank.indexOf(o.value) > tyreRank.indexOf(cur) : o.value > cur && !(u.id === 'springs' && o.value > 3) && !(u.id === 'diff' && o.value > 2);
          if (!better) continue;
          const dpi = pf({ ...base, [u.id]: o.value }) - pi0; if (dpi <= 0) continue;
          const price = isOwned(u, o.value) ? 0 : o.price;
          cands.push({ u, o, dpi, price, dens: dpi / Math.max(300, price) * (u.cat === 'tyres' || u.cat === 'platform' ? 1.2 : 1) });
        }
      }
      cands.sort((a, b) => b.dens - a.dens);
      let up = { ...base }, pred = pi0; const chosen = new Map();
      for (const c of cands) {
        const prev = chosen.get(c.u.id);
        if (prev && prev.dpi >= c.dpi) continue;
        const np = pred - (prev?.dpi || 0) + c.dpi * 0.92;
        if (np > cap - 2) continue;
        chosen.set(c.u.id, c); up[c.u.id] = c.o.value; pred = np;
      }
      let pi = pf(up);
      // trim: drop the least dense picks until we fit
      const order = () => [...chosen.values()].sort((a, b) => a.dens - b.dens);
      while (pi > cap && chosen.size) { const c = order()[0]; chosen.delete(c.u.id); if (base[c.u.id] != null) up[c.u.id] = base[c.u.id]; else delete up[c.u.id]; pi = pf(up); }
      // fill: try the remaining options, smallest gain first, while it still fits
      for (const c of cands.slice().sort((a, b) => a.dpi - b.dpi)) {
        if (chosen.has(c.u.id) && chosen.get(c.u.id).dpi >= c.dpi) continue;
        const tu = { ...up, [c.u.id]: c.o.value }, p2 = pf(tu);
        if (p2 <= cap && p2 > pi) { up = tu; pi = p2; chosen.set(c.u.id, c); }
      }
      let full = perfOf(k, { up }).pi;
      while (full > cap && chosen.size) { const c = order()[0]; chosen.delete(c.u.id); if (base[c.u.id] != null) up[c.u.id] = base[c.u.id]; else delete up[c.u.id]; full = perfOf(k, { up }).pi; }
      const inv = {}; let cost = 0;
      for (const c of chosen.values()) { if (c.price) { cost += c.price; inv[c.u.id + ':' + c.o.value] = 1; } }
      return { up, inv, cost, parts: chosen.size, pi: full };
    },
    collectionReward(m) {
      const cars = ROSTER_KEYS.filter(k => CARS[k].make === m && CARS[k].buyable);
      const value = cars.reduce((s, k) => s + (CARS[k].price || 0), 0);
      return { money: Math.round(Math.min(250000, Math.max(5000, value * 0.08)) / 500) * 500, xp: 1500 + cars.length * 800 };
    },
    claimCollection(m) {
      const cars = ROSTER_KEYS.filter(k => CARS[k].make === m && CARS[k].buyable);
      if (store.claimed(m) || !cars.every(k => store.has(k))) return null;
      const r = api.collectionReward(m);
      store.claim(m); G.economy?.add?.(r.money, r.xp, 'collection');
      return r;
    },
    clearPerfCache,
  };
  const busy = () => !!G.events?.active || (G.police?.stars || 0) > 0;
  const srcLabel = s => ({ festival: 'Festival prize', prize: 'Prize', barnfind: 'Barn find', gift: 'Gift', wheelspin: 'Wheelspin', autoshow: 'Autoshow', starter: 'Starter car' }[s] || s);
  const ui = createGarageUI(G, api);
  api._ui = ui; // dev / capture access (studio, state)
  G.garage = api;

  // ---------------------------------------------------------------- pause-menu tab (replaces the fallback 'cars')
  function cardHTML(k) {
    const s = api.spec(k), c = { D: '#3bc4f4', C: '#f7d51d', B: '#ff8a1d', A: '#ff3b4e', S1: '#b04cf0', S2: '#2f6df0', X: '#35d65a' }[s.cls];
    return `<span class="ui-pi" style="--c:${c}"><i>${s.cls}</i><b>${s.pi}</b></span>`;
  }
  const addTab = () => {
    const menu = G.ui?.menu; if (!menu?.addTab) return false;
    menu.addTab({
      id: 'cars', title: 'Cars', order: 20, icon: 'car',
      build(el, nav) {
        const k = api.current(), s = api.spec(k), own = api.owned().length, total = api.roster().length;
        const items = [['mycars', 'My cars', `${own} owned`], ['autoshow', 'Autoshow', `${total} cars from ${Object.keys(MAKES).length - 1} makers`], ['upgrades', 'Upgrades', `${UPGRADES.length} parts`], ['tuning', 'Tuning', 'Tyres, gearing, alignment, springs'], ['paint', 'Paint & wheels', 'Finishes, liveries, rims'], ['collection', 'Collection', `${api.owned().filter(x => CARS[x]?.buyable).length}/${total} collected`]];
        el.innerHTML = `<div class="mw-k">Garage</div><h2 class="mw-h">${s.make} ${s.model}</h2><p class="mw-p">${cardHTML(k)} &nbsp; ${s.year} · ${s.hp} hp · ${s.mass.toLocaleString()} kg · ${s.drive}. ${busy() ? 'Garage is unavailable during events and police chases.' : ''}</p>
          <div class="mw-grid" style="margin-top:22px">${items.map(([id, t, sub]) => `<button class="mw-tile" data-nav data-g="${id}" style="min-height:112px"><span class="t">${t}</span><span class="s">${sub}</span></button>`).join('')}</div>`;
        el.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { nav.close(); setTimeout(() => api.open(b.dataset.g), 30); }));
        return { hints: [] };
      },
    });
    return true;
  };
  // sys_menus registers the fallback 'cars' tab after us (install order): replace it once installs are done
  addTab(); queueMicrotask(addTab); G.on?.('start', addTab);

  // ---------------------------------------------------------------- walk-in dealership (Bay Motors) + safehouse garage
  // The interiors module gives every site one shared ctx and looks ctx.carCard / ctx.garageMenu up at call time, so the
  // garage screens can stand in for its simple cards. Their callbacks (fade + spawn at the drive-out / garage door) are
  // kept, so the car still appears inside the building. The originals stay as the fallback.
  let hooked = false;
  function hookInteriors() {
    const S0 = G.interiors?.sites?.find(s => s?.ctx); const ctx = S0?.ctx;
    if (!ctx || ctx.__garageHooked) return !!ctx;
    const origCard = ctx.carCard, origGarage = ctx.garageMenu;
    ctx.carCard = (id, S, onBuy) => { try { ui.open('autoshow', { key: id, onPick: (k) => onBuy?.(k, true) }); } catch (e) { console.warn('[garage] dealer', e); origCard?.(id, S, onBuy); } };
    ctx.garageMenu = (S) => { try { ui.open('mycars', { onDrive: (k) => { const sp = S.spawn; ctx.spawnCar(k, S, sp.at[0], sp.at[1], sp.yaw); G.hud?.toast?.(CARS[k].name + ' is out front', 'Parked by the garage door', 'good', 3200); } }); } catch (e) { console.warn('[garage] safehouse', e); origGarage?.(S); } };
    ctx.__garageHooked = true;
    return true;
  }

  // ---------------------------------------------------------------- per-frame: hotkey, odometer, economy sync, idle PI warm-up
  let warm = 0, syncT = 0;
  const lastPos = { x: 0, z: 0, ok: false };
  G.systems.push({
    update(dt) {
      const inp = G.input;
      if (inp?.pressed?.('garage') && G.state === 'play' && !G.ui?.isModal?.() && !ui.isOpen()) api.open('mycars');
      const v = G.player?.vehicle;
      if (v && v.role === 'player' && store.has(v.id)) {
        const p = v.root.position;
        if (lastPos.ok) { const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z); if (d < 60) { store.get(v.id).odo = (store.get(v.id).odo || 0) + d; store.touch(); } }
        lastPos.x = p.x; lastPos.z = p.z; lastPos.ok = true;
      } else lastPos.ok = false;
      store.tick(dt);
      if (!hooked) hooked = hookInteriors();
      if ((syncT += dt) > 2) { syncT = 0; if (store.pull()) changed(); }
      // measure stock PIs a couple per frame so the Autoshow opens instantly
      if (warm < ROSTER_KEYS.length) { perfOf(ROSTER_KEYS[warm++]); if (warm < ROSTER_KEYS.length) perfOf(ROSTER_KEYS[warm++]); }
    },
  });
  void TYRES;
}
