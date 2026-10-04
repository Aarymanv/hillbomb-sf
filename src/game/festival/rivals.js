// Persistent named Rivals: grid selection per event, car choice, AI tuning (difficulty + personal skill / aggression),
// and head-to-head records saved in the festival state.
import { RIVALS, DIFFICULTY } from './catalog.js';
import { clamp, rng, hashStr } from './util.js';

export function createRivals(F) {
  const { G } = F;
  const R = { all: RIVALS, byId: Object.fromEntries(RIVALS.map(r => [r.id, r])) };
  R.record = id => (F.S.rivals[id] ||= { beat: 0, lost: 0, met: 0 });
  // grid of n rivals for an event: locals first, then the ones you have met least, deterministic per event + attempt
  R.pickGrid = function (ev, n, attempt = 0, force = []) {
    const district = ev.district || '';
    const rand = rng(hashStr(ev.id) + attempt * 7919);
    const scored = RIVALS.map(r => {
      const rec = R.record(r.id);
      let s = rand() * 2;
      if (district && district.toLowerCase().includes(r.home.toLowerCase().split(' ').pop())) s += 3;
      if (ev.type === 'dirt' || ev.type === 'xc') s += r.prefers.some(p => ['rally', 'suv', 'pickup'].includes(p)) ? 1.5 : 0;
      if (ev.type === 'drift') s += r.aggr;
      s -= rec.met * 0.15;
      return { r, s };
    }).sort((a, b) => b.s - a.s).map(x => x.r);
    const out = force.map(id => R.byId[id]).filter(Boolean);
    for (const r of scored) { if (out.length >= n) break; if (!out.includes(r)) out.push(r); }
    return out.slice(0, n);
  };
  R.carFor = function (rival, cls, rand = Math.random) {
    return F.cars.bestFor(cls, { prefer: rival.prefers, rnd: rand });
  };
  // AI parameters for a rival at a difficulty index (0..4)
  R.tuning = function (rival, diffIdx) {
    const D = DIFFICULTY[clamp(diffIdx, 0, DIFFICULTY.length - 1)];
    const k = D.skill, sk = rival ? rival.skill : 0.8, ag = rival ? rival.aggr : 0.5;
    return {
      latAcc: 7.2 + k * 2.6 + sk * 0.9 + ag * 0.3,
      speedMul: 0.84 + k * 0.13 + sk * 0.05,
      rubberLo: 0.8 + k * 0.16, rubberHi: 1.06 + k * 0.1,
      rubberK: 0.0038 - k * 0.0012,
      launch: 0.85 + k * 0.12 + ag * 0.03,
    };
  };
  // drift events: the score a rival posts for a route (virtual opponents)
  R.driftScore = function (rival, diffIdx, par) {
    const D = DIFFICULTY[clamp(diffIdx, 0, DIFFICULTY.length - 1)];
    return Math.round(par * (0.55 + D.skill * 0.55 + rival.skill * 0.25 + rival.aggr * 0.1) / 50) * 50;
  };
  R.noteResult = function (standings) {
    const me = standings.find(s => s.player); if (!me) return [];
    const beaten = [];
    for (const s of standings) {
      if (!s.rival) continue;
      const rec = R.record(s.rival.id); rec.met++;
      if (s.pos > me.pos) { rec.beat++; beaten.push(s.rival); F.bump('beat:' + s.rival.id); } else rec.lost++;
    }
    return beaten;
  };
  void G;
  return R;
}
