// Street dressing, city-wide (render agent): festoon string lights and red lantern strings zig-zagging across narrow
// commercial streets (dense in Chinatown, sparser in North Beach / Mission / Castro / the Wharf) and litter along the
// curbs everywhere (cardboard, paper, the odd crushed box; denser downtown). Merged per 400 m tile, frustum + distance
// culled by a zero-cost ticker; the glow follows the shared night uniform (no per-frame work beyond a few writes).
// buildNightDress({ graph, blocks, heightAt, group, night: { value } })
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zoneAt } from '../map.js';
import { mulberry } from './kit.js';
import { pointInConvex } from '../geo.js';

// festoons: spacing between strings (m) and share of lantern strings; litter: items per 100 m of street
const FEST = { chinatown: { gap: 13, lan: 0.5 }, northbeach: { gap: 30, lan: 0 }, mission: { gap: 42, lan: 0 }, castro: { gap: 48, lan: 0 }, wharf: { gap: 40, lan: 0 } };
const LITTER = { downtown: 5, downtown_soma: 5, soma: 6, tenderloin: 8, chinatown: 9, mission: 6, industrial: 5, wharf: 4, northbeach: 5, nobhill: 2.5, victorian: 2, castro: 3, marina: 1.5, avenues: 1.5 };
const TILE = 400, FEST_D = 650, LITTER_D = 170;

export function buildNightDress({ graph, blocks, heightAt, group, night }) {
  const rnd = mulberry(8812);
  // block zone lookup (the zone the facade builder dresses a block as), 100 m hash
  const BH = new Map(), BG = 100;
  for (const b of blocks || []) {
    if (!b.poly || !b.zone) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of b.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let i = Math.floor(x0 / BG); i <= Math.floor(x1 / BG); i++) for (let j = Math.floor(z0 / BG); j <= Math.floor(z1 / BG); j++) {
      const k = i * 65536 + j; let a = BH.get(k); if (!a) BH.set(k, a = []); a.push(b);
    }
  }
  const blockAt = (x, z) => { const a = BH.get(Math.floor(x / BG) * 65536 + Math.floor(z / BG)); if (a) for (const b of a) if (pointInConvex(x, z, b.poly)) return b; return null; };
  // zone of the street at a point: a block across either curb, else the map's style zone
  const zoneOfStreet = (x, z, px, pz, off) => {
    const b = blockAt(x + px * off, z + pz * off) || blockAt(x - px * off, z - pz * off);
    return b ? (b.park ? 'park' : b.zone) : (BH.size ? null : zoneAt(x, z));
  };

  const tiles = new Map();
  const tileOf = (x, z) => { const k = Math.floor(x / TILE) * 65536 + Math.floor(z / TILE); let t = tiles.get(k); if (!t) tiles.set(k, t = { cx: (Math.floor(x / TILE) + 0.5) * TILE, cz: (Math.floor(z / TILE) + 0.5) * TILE, wire: [], bulbs: [], lanterns: [], litter: [] }); return t; };
  const bulbG = new THREE.OctahedronGeometry(0.055, 0); bulbG.deleteAttribute('uv'); bulbG.deleteAttribute('normal');
  const lanG = (() => {   // 8-sided paper barrel, bulged middle, darker caps (vertex colours)
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8, 3, false); const p = g.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), mid = Math.abs(y) < 0.1; if (mid) { p.setX(i, p.getX(i) * 1.25); p.setZ(i, p.getZ(i) * 1.25); } const body = Math.abs(y) < 0.16; c.push(body ? 1.0 : 0.3, body ? 0.035 : 0.07, body ? 0.012 : 0.01); }   // linear: deep lantern red, dark gold caps
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g;
  })();
  const flatG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); flatG.deleteAttribute('uv');
  const boxG = new THREE.BoxGeometry(1, 1, 1); boxG.deleteAttribute('uv');
  const put = (arr, g, x, y, z, col, sx = 1, sy = sx, sz = sx, ry = 0) => {
    const q = g.clone(); q.scale(sx, sy, sz); if (ry) q.rotateY(ry); q.translate(x, y, z);
    if (col) { const n = q.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); q.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    arr.push(q);
  };
  const WARM = [[1.0, 0.58, 0.26], [1.0, 0.5, 0.2], [1.0, 0.66, 0.34]];
  const LCOL = [[0.42, 0.3, 0.18], [0.36, 0.25, 0.15], [0.7, 0.68, 0.62], [0.55, 0.55, 0.52], [0.12, 0.12, 0.13], [0.2, 0.3, 0.22]];
  let nStr = 0, nLit = 0;
  for (const e of graph.edges) {
    if (e.deck || !e.pts || e.pts.length < 2 || e.width < 7 || e.kind === 'highway' || e.kind === 'crooked' || e.kind === 'park') continue;
    const P = e.pts;
    const hw = e.width / 2, off = hw + 3.4;                     // festoon anchors just in front of the facades
    const tA = (e.a?.radius || 6) + 6, tB = (e.b?.radius || 6) + 6;
    let cum = 0; const segs = [];
    for (let i = 0; i < P.length - 1; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (L > 0.01) segs.push([P[i], P[i + 1], cum, L]); cum += L; }
    const total = cum; if (total < 30) continue;
    const pointAt = (s) => { for (const [a, b, c0, L] of segs) if (s <= c0 + L) { const t = (s - c0) / L, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ux, uz]; } const [a, b, , L] = segs[segs.length - 1]; return [b[0], b[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    const mid = pointAt(total / 2), zone = zoneOfStreet(mid[0], mid[1], -mid[3], mid[2], hw + 8);
    if (!zone || zone === 'park') continue;
    // ---- festoons (narrow commercial streets)
    const F = FEST[zone];
    if (F && e.width <= 14) {
      let flip = rnd() < 0.5 ? 1 : -1;
      for (let s = tA + rnd() * 4; s < total - tB - 6; s += F.gap * (0.8 + rnd() * 0.5)) {
        const [cx, cz, ux, uz] = pointAt(s), px = -uz, pz = ux;
        if (zoneOfStreet(cx, cz, px, pz, hw + 8) !== zone) continue;
        const kind = rnd() < F.lan ? 'lanterns' : 'bulbs';
        const sB = Math.min(total - tB, s + (kind === 'bulbs' ? 4 + rnd() * 3 : rnd() * 1.5));
        const [bx, bz] = pointAt(sB);
        const A = [cx + px * off * flip, heightAt(cx, cz) + 6.6 + rnd() * 1.6, cz + pz * off * flip];
        const B = [bx - px * off * flip, heightAt(bx, bz) + 6.6 + rnd() * 1.6, bz - pz * off * flip];
        flip = -flip;
        const span = Math.hypot(B[0] - A[0], B[2] - A[2]), sag = 0.7 + span * 0.06 + rnd() * 0.5;
        const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
        const T = tileOf(cx, cz);
        for (let i = 0; i < 14; i++) { const p = at(i / 14), q = at((i + 1) / 14); T.wire.push(...p, ...q); }
        if (kind === 'bulbs') {
          const n = Math.max(6, Math.round(span / 1.05)), col = WARM[Math.floor(rnd() * WARM.length)];
          for (let i = 1; i < n; i++) { const p = at(i / n); put(T.bulbs, bulbG, p[0], p[1] - 0.09, p[2], col, 0.85 + rnd() * 0.3); }
        } else {
          const n = Math.max(4, Math.round(span / 1.7));
          for (let i = 1; i < n; i++) {
            const p = at(i / n), drop = 0.3 + rnd() * 0.15;
            T.wire.push(p[0], p[1], p[2], p[0], p[1] - drop + 0.17, p[2]);
            put(T.lanterns, lanG, p[0], p[1] - drop, p[2], null, 0.9 + rnd() * 0.35, undefined, undefined, rnd() * 3);
          }
        }
        nStr++;
      }
    }
    // ---- litter along both curbs (and the odd piece out in the lane)
    const step = 100 / (LITTER[zone] ?? 2);
    for (let s = tA * 0.5 + rnd() * step; s < total - tB * 0.5; s += step * (0.5 + rnd())) {
      const [x0, z0, ux, uz] = pointAt(s), px = -uz, pz = ux;
      const side = rnd() < 0.5 ? -1 : 1, out = rnd() < 0.12;
      const o = side * (out ? rnd() * (hw - 1) : hw - 0.2 - rnd() * 0.6);
      const x = x0 + px * o, z = z0 + pz * o, y = heightAt(x, z), r = rnd();
      const col = LCOL[Math.floor(rnd() * LCOL.length)], T = tileOf(x, z);
      if (r < 0.1 && !out) put(T.litter, boxG, x, y + 0.1, z, [0.42, 0.3, 0.18], 0.35 + rnd() * 0.3, 0.12 + rnd() * 0.1, 0.3 + rnd() * 0.25, rnd() * 6.28);
      else if (r < 0.55) put(T.litter, flatG, x, y + 0.015, z, col, 0.45 + rnd() * 0.55, 1, 0.3 + rnd() * 0.45, rnd() * 6.28);
      else put(T.litter, flatG, x, y + 0.015, z, col === LCOL[0] ? LCOL[2] : col, 0.12 + rnd() * 0.18, 1, 0.1 + rnd() * 0.14, rnd() * 6.28);
      // paper blown into the gutter next to it
      if (rnd() < 0.35) put(T.litter, flatG, x + (rnd() - 0.5) * 0.8, y + 0.016, z + (rnd() - 0.5) * 0.8, LCOL[2 + Math.floor(rnd() * 2)], 0.1 + rnd() * 0.15, 1, 0.08 + rnd() * 0.12, rnd() * 6.28);
      nLit++;
    }
  }
  if (!tiles.size) return null;

  const root = new THREE.Group(); root.name = 'props:nightdress';
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0c0c0c });
  const bulbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lanMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lod = [];   // { o, x, z, maxD }
  const merged = (arr, normals) => { const g = mergeGeometries(arr); arr.forEach(q => q.dispose()); if (normals) g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
  for (const T of tiles.values()) {
    const add = (o, name, maxD) => { o.name = name; o.matrixAutoUpdate = false; root.add(o); lod.push({ o, x: T.cx, z: T.cz, maxD }); return o; };
    if (T.wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.wire, 3)); g.computeBoundingSphere(); add(new THREE.LineSegments(g, wireMat), 'props:festoonwire', FEST_D * 0.6); }
    if (T.bulbs.length) add(new THREE.Mesh(merged(T.bulbs), bulbMat), 'props:festoon', FEST_D);
    if (T.lanterns.length) add(new THREE.Mesh(merged(T.lanterns), lanMat), 'props:lanternstrings', FEST_D);
    if (T.litter.length) add(new THREE.Mesh(merged(T.litter, true), litMat), 'props:litter', LITTER_D).receiveShadow = true;
  }
  // ticker: an empty always-rendered mesh whose onBeforeRender drives the night glow + distance culling (runs once a
  // frame before the opaque pass; the tiles are frustum-culled by three as usual)
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const ticker = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  ticker.frustumCulled = false; ticker.renderOrder = -1e6; ticker.name = 'props:nightdress-ticker';
  const HALF = TILE * 0.71;
  ticker.onBeforeRender = (r, s, cam) => {
    // (flicker fix 9/30) main view only: the car reflection probe's cube cameras (local position 0,0 = the world origin)
    // render on alternate frames, and visibility set here only takes effect on the NEXT render: every other frame the
    // main view drew with the tiles culled from the origin (sign bands / neon / lanterns strobing)
    if (!cam || cam.isOrthographicCamera || cam.parent?.isCubeCamera) return;
    const k = Math.min(1, Math.max(0, night?.value ?? 0) * 1.3);
    bulbMat.color.setScalar(0.7 + (2.4 - 0.7) * k); lanMat.color.setScalar(0.7 + (1.15 - 0.7) * k);
    const cx = cam.matrixWorld.elements[12], cz = cam.matrixWorld.elements[14];
    for (const L of lod) L.o.visible = Math.hypot(L.x - cx, L.z - cz) - HALF < L.maxD;
  };
  root.add(ticker);
  group.add(root);
  return { group: root, strings: nStr, litter: nLit, tiles: tiles.size };
}
