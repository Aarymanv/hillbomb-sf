// Keep-out corridors: active race / mission lines. Streamed obstacles (trees, street props, parked cars) inside an active
// corridor are hidden with their colliders, for tiles already loaded AND tiles that stream in later (props/v2.js re-tests
// its loaded tiles whenever `version` changes and tests every tile as it commits). Any placement system can call hit().
// Corridors are polylines with a half width per point; the festival registers one per event route (racing / stories /
// prologue) and removes it when the activity ends.
const C = 16;
const cells = new Map();          // cell key -> [[corridor, segment index], ...]
const corridors = new Map();      // id -> { pts, hw, segs }
const key = (cx, cz) => cx * 100003 + cz;

export const keepOut = {
  version: 0,
  get active() { return corridors.size > 0; },
  // pts: [[x, z], ...]; hw: number or per-point array (half width, m); loop closes the polyline
  add(id, pts, hw, { loop = false } = {}) {
    if (corridors.has(id)) this.remove(id);
    const n = pts.length, K = { id, pts, hw: new Float32Array(n), keys: [] };
    for (let i = 0; i < n; i++) K.hw[i] = typeof hw === 'number' ? hw : hw[i];
    const segs = loop ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n, a = pts[i], b = pts[j], r = Math.max(K.hw[i], K.hw[j]) + 3;
      const x0 = Math.floor((Math.min(a[0], b[0]) - r) / C), x1 = Math.floor((Math.max(a[0], b[0]) + r) / C);
      const z0 = Math.floor((Math.min(a[1], b[1]) - r) / C), z1 = Math.floor((Math.max(a[1], b[1]) + r) / C);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const k = key(cx, cz); let arr = cells.get(k); if (!arr) cells.set(k, arr = []);
        arr.push([K, i]); K.keys.push(k);
      }
    }
    corridors.set(id, K); this.version++;
    return id;
  },
  remove(id) {
    const K = corridors.get(id); if (!K) return;
    for (const k of new Set(K.keys)) { const arr = cells.get(k); if (!arr) continue; const f = arr.filter(q => q[0] !== K); if (f.length) cells.set(k, f); else cells.delete(k); }
    corridors.delete(id); this.version++;
  },
  clear() { cells.clear(); corridors.clear(); this.version++; },
  // true when a disc of radius r (<= 3 m) at (x, z) reaches into any active corridor
  hit(x, z, r = 0) {
    if (!corridors.size) return false;
    const arr = cells.get(key(Math.floor(x / C), Math.floor(z / C)));
    if (!arr) return false;
    for (let q = 0; q < arr.length; q++) {
      const K = arr[q][0], i = arr[q][1], n = K.pts.length, j = (i + 1) % n, a = K.pts[i], b = K.pts[j];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-6;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - a[0] - dx * t, ez = z - a[1] - dz * t, w = K.hw[i] + (K.hw[j] - K.hw[i]) * t + r;
      if (ex * ex + ez * ez < w * w) return true;
    }
    return false;
  },
};
