// HILLBOMB pedestrians: appearance presets per crowd style + a small pool of pre-built humans.
// Humans are expensive to create (a new body variant builds its geometry once, ~15 ms; every human bakes its
// own colours, ~2.5 ms), so the crowd reuses a pool: released humans are hidden and handed out again later.
import { makeHuman } from '../../player/player.js';
import { realAvailable } from './realhuman.js';

// same hash + PRNG as src/player/human.js (resolveLook draws r[0..31] in a fixed order; r[10] picks the
// t-shirt variant: < 0.45 = shorts). Used only to find seeds that give joggers / tourists shorts.
function hashSeed(seed) { return (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0; }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawR(seed, idx) { const r = mulberry32(hashSeed(seed)); let v = 0; for (let i = 0; i <= idx; i++) v = r(); return v; }
function seedWhere(rnd, pred) {
  let s = 1 + ((rnd() * 900000) | 0);
  for (let i = 0; i < 40; i++, s += 7919) if (pred(s)) return s;
  return s;
}
const pick = (rnd, a) => a[(rnd() * a.length) | 0];
function weighted(rnd, table) { let t = 0; for (const [, w] of table) t += w; let x = rnd() * t; for (const [v, w] of table) if ((x -= w) < 0) return v; return table[0][0]; }

const SPORT = [0xff4d2e, 0x2ec4ff, 0xc6ff3d, 0xff3d8b, 0xffd23d, 0x7a5cff, 0xf4f4f0, 0x1c1c1e, 0x19b37a, 0xff8a1f];
const TOURIST_TEE = [0xf4f4f0, 0xe8452c, 0x3fa7d6, 0xf2c14e, 0xc0362c, 0x59c3a0, 0xef7ca5, 0xff8a3d];

/** Options for createHuman() for a crowd style: 'generic' | 'business' | 'tourist' | 'jogger'. */
export function lookFor(style, rnd = Math.random) {
  const f = rnd() < 0.5;
  const gender = f ? 'f' : 'm';
  switch (style) {
    case 'jogger': {
      const seed = seedWhere(rnd, s => drawR(s, 10) < 0.45);
      return {
        seed, gender, outfit: 'tshirt', shirt: pick(rnd, SPORT), shoes: pick(rnd, [0xf2f2f2, 0xf2f2f2, 0x1a1a1a, 0xff4d2e, 0x2ec4ff]),
        hairStyle: f ? pick(rnd, ['bun', 'bun', 'cap', 'long']) : pick(rnd, ['short', 'short', 'cap', 'bald']),
        build: rnd() < 0.55 ? 'slim' : 'average',
      };
    }
    case 'tourist': {
      const outfit = weighted(rnd, [['tshirt', 55], ['hoodie', 25], ['jacket', 20]]);
      const seed = outfit === 'tshirt' ? seedWhere(rnd, s => drawR(s, 10) < 0.45) : 1 + ((rnd() * 900000) | 0);
      const o = { seed, gender, outfit, hairStyle: rnd() < 0.45 ? 'cap' : (f ? pick(rnd, ['long', 'bun', 'short']) : pick(rnd, ['short', 'bald', 'short'])) };
      if (outfit === 'tshirt' && rnd() < 0.6) o.shirt = pick(rnd, TOURIST_TEE);
      if (outfit === 'hoodie' && rnd() < 0.35) o.shirt = pick(rnd, [0xc0362c, 0xfdb927, 0x2a3f6a]);   // "San Francisco" souvenir hoodies
      return o;
    }
    case 'business':
      return {
        seed: 1 + ((rnd() * 900000) | 0), gender, outfit: rnd() < 0.8 ? 'suit' : 'jacket',
        hairStyle: f ? pick(rnd, ['bun', 'long', 'short']) : pick(rnd, ['short', 'short', 'bald']),
        build: weighted(rnd, [['slim', 35], ['average', 50], ['heavy', 15]]),
      };
    default: {
      const outfit = f ? weighted(rnd, [['tshirt', 22], ['hoodie', 20], ['jacket', 28], ['suit', 8], ['dress', 22]])
        : weighted(rnd, [['tshirt', 27], ['hoodie', 30], ['jacket', 30], ['suit', 13]]);
      return { seed: 1 + ((rnd() * 900000) | 0), gender, outfit };
    }
  }
}

/** Pool of humans, grouped by style. acquire() never builds more than `budget` new humans per frame. */
export function createHumanPool(parent, { perStyleCap = 40, cap = 60 } = {}) {
  const free = { generic: [], business: [], tourist: [], jogger: [] };
  const all = [];
  let createdThisFrame = 0;
  const pool = {
    all, free, budget: 1, cap,
    /** reuse=true copies the body variant (build/gender/hair/outfit) of an existing human of that style, so no new
     *  geometry is built (~2.5 ms instead of ~15 ms); colours, height and seed are fresh */
    create(style, reuse = false) {
      const o = lookFor(style);
      if (reuse && !realAvailable()) {
        const same = all.filter(h => h.style === style && h.look);
        if (same.length) { const L = same[(Math.random() * same.length) | 0].look; Object.assign(o, { build: L.build, gender: L.gender, hairStyle: L.hairStyle, outfit: L.outfit }); }
      }
      const h = makeHuman({ ...o, style, castShadow: true });
      h.style = style;
      h.root.rotation.order = 'YXZ';
      h.root.visible = false;
      h.root.matrixAutoUpdate = true;
      parent.add(h.root);
      all.push(h);
      return h;
    },
    count(style) { let n = 0; for (const h of all) if (h.style === style) n++; return n; },
    /** a hidden human of that style (random pick), creating one if allowed; falls back to any free human */
    acquire(style, force = false) {
      const arr = free[style] || free.generic;
      const room = all.length < pool.cap;
      if (arr.length && !(room && arr.length < 3 && pool.count(style) < perStyleCap && createdThisFrame < pool.budget && Math.random() < 0.3)) {
        const i = (Math.random() * arr.length) | 0; const h = arr[i]; arr[i] = arr[arr.length - 1]; arr.pop();
        return h;
      }
      if (force || (room && createdThisFrame < pool.budget)) { createdThisFrame++; return pool.create(style, true); }
      for (const k of ['generic', 'tourist', 'business', 'jogger']) {
        const a = free[k]; if (a.length && (style === 'generic' || k === 'generic' || !room)) { return a.pop(); }
      }
      return null;
    },
    release(h) { h.root.visible = false; (free[h.style] || free.generic).push(h); },
    warm(style, n) { for (let i = 0; i < n; i++) free[style].push(pool.create(style)); },
    /** one more pooled human (variant reuse), style weighted toward the generic crowd */
    grow() { const r = Math.random(); const s = r < 0.6 ? 'generic' : r < 0.75 ? 'tourist' : r < 0.9 ? 'business' : 'jogger'; free[s].push(pool.create(s, true)); },
    frame() { createdThisFrame = 0; },
    freeCount() { return free.generic.length + free.business.length + free.tourist.length + free.jogger.length; },
  };
  return pool;
}
