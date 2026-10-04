// Lot frame of a residential block on the 1:1 map, for the yard ground patchwork (terrainmat.js / grass via the biome
// window, grass/capture.js). SF lots are 25 ft (7.62 m) wide along the block's long side and back-to-back at its centre
// line, so a block gives a frame: origin O on the centre line at the block's lot-line end, angle of the long side.
// In it u = distance along the long side (lot index = floor(u / 7.62)), v = signed distance from the rear lot line.
// Blocks are the convex street-graph faces of props/v2blocks.js (cached on the graph); returns null off-block.
import { buildBlocksV2 } from '../props/v2blocks.js';
import { pointInConvex } from '../geo.js';

export function makeLotFrame(graph, terrain) {
  let hash = null;
  const BC = 64, key = (i, j) => i * 100003 + j;
  function init() {
    hash = new Map();
    for (const b of buildBlocksV2(graph, terrain)) {
      if (b.park) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of b.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      b._lbox = [x0, z0, x1, z1];
      for (let j = Math.floor(z0 / BC); j <= Math.floor(z1 / BC); j++) for (let i = Math.floor(x0 / BC); i <= Math.floor(x1 / BC); i++) {
        const k = key(i, j); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(b);
      }
    }
  }
  function frameOf(b) {
    if (b._lot !== undefined) return b._lot;
    const P = b.poly, n = P.length;
    let bl = 0, ang = 0;
    for (let k = 0; k < n; k++) { const a = P[k], c = P[(k + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > bl) { bl = l; ang = Math.atan2(c[1] - a[1], c[0] - a[0]); } }
    const tx = Math.cos(ang), tz = Math.sin(ang);
    let u0 = Infinity;
    for (const p of b.inner || P) u0 = Math.min(u0, (p[0] - b.cx) * tx + (p[1] - b.cz) * tz);
    return (b._lot = [b.cx + tx * u0, b.cz + tz * u0, ang]);
  }
  /** frame [ox, oz, angle] of the block containing (x, z), or null */
  return function lotFrame(x, z) {
    if (!hash) init();
    const a = hash.get(key(Math.floor(x / BC), Math.floor(z / BC)));
    if (!a) return null;
    for (const b of a) { const q = b._lbox; if (x < q[0] || x > q[2] || z < q[1] || z > q[3]) continue; if (pointInConvex(x, z, b.poly)) return frameOf(b); }
    return null;
  };
}
