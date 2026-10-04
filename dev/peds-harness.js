// Dev-only helpers for testing pedestrians in the running game (paste / import in the console).
// window.__pedsH = { wait, settle, camAt(ped, dist, side, h), corner(), crowdView(), stats() }
export function installPedHarness(W = window) {
  const H = {
    async wait() { for (let i = 0; i < 80 && !W.__shot; i++) await new Promise(r => setTimeout(r, 500)); W.__manual = true; return !!W.__shot; },
    settle(n = 120) { W.__manual = true; W.__frames(n); return W.__G.peds.stats; },
    // camera `dist` m in front of a ped (along its heading), `side` m to its right, eye height h
    camAt(p, dist = 6, side = 1.5, h = 1.65, lookH = 1.0) {
      const fx = p.hx, fz = p.hz, rx = -fz, rz = fx;
      W.__look(p.x + fx * dist + rx * side, p.y + h, p.z + fz * dist + rz * side, p.x, p.y + lookH, p.z);
    },
    near(max = 40) { const pl = W.__player.pos; return W.__G.peds.list.filter(p => Math.hypot(p.x - pl.x, p.z - pl.z) < max); },
    summary() {
      const P = W.__G.peds, pl = W.__player.pos, m = {};
      for (const p of P.list) { const k = p.mode + (p.cr ? ':' + p.cr.phase : '') + (p.tb ? ':tb' : ''); m[k] = (m[k] || 0) + 1; }
      return { stats: P.stats, modes: m, near30: P.list.filter(p => Math.hypot(p.x - pl.x, p.z - pl.z) < 30).length, near60: P.list.filter(p => Math.hypot(p.x - pl.x, p.z - pl.z) < 60).length };
    },
  };
  W.__pedsH = H;
  return H;
}
