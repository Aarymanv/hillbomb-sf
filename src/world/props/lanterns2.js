// v2 (real 1:1 map) Chinatown street dressing: red lantern strings (and a few warm bulb festoons) zig-zagging across the
// real Chinatown streets: Grant Ave densest (like the real thing), Stockton / Washington / Jackson / Pacific /
// Sacramento / Clay, lower and tighter over Waverly Place and Ross Alley. Anchored just in front of the facades
// (curb + sidewalk). Steady glow (no flicker), merged per 200 m tile, distance culled by a zero-cost ticker.
// Port of nightdress.js (v1) to the v2 road graph.
// buildLanternStringsV2({ graph, heightAt, group, night: { value } })
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './kit.js';
import { ll } from '../latlon.js';
import { onCtStreet } from '../landmarks/v2/ct_zone.js';
import { NO_CT } from '../landmarks/v2/hero_live.js';

// real Chinatown (Bush St .. Broadway, Powell/Stockton .. Kearny)
export const CHINATOWN_LL = { lat0: 37.7904, lat1: 37.7981, lon0: -122.4093, lon1: -122.4043 };

// opts (district festoons, buildings v2 dress): only = 'bulbs' forces warm bulb strings, match = street-name regex,
// gap = spacing (m), name = group name. Defaults reproduce Chinatown exactly.
export function buildLanternStringsV2({ graph, heightAt, group, night, box = CHINATOWN_LL, only = null, match = null, gap: gapO = 0, name = 'props2:lanternstrings', seed = 5150, maxWidth = 17 }) {
  const rnd = mulberry(seed);
  const [xa, za] = ll(box.lat1, box.lon0), [xb, zb] = ll(box.lat0, box.lon1);
  const X0 = Math.min(xa, xb), X1 = Math.max(xa, xb), Z0 = Math.min(za, zb), Z1 = Math.max(za, zb);
  const inBox = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  const T2 = 200, tiles = new Map();
  const tileOf = (x, z) => {
    const k = Math.floor(x / T2) * 65536 + Math.floor(z / T2); let t = tiles.get(k);
    if (!t) tiles.set(k, t = { cx: (Math.floor(x / T2) + 0.5) * T2, cz: (Math.floor(z / T2) + 0.5) * T2, wire: [], bulbs: [], lanterns: [] });
    return t;
  };
  const bulbG = new THREE.OctahedronGeometry(0.055, 0); bulbG.deleteAttribute('uv'); bulbG.deleteAttribute('normal');
  const lanG = (() => {   // 8-sided paper barrel, bulged middle, dark gold caps (linear vertex colours)
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8, 3, false); const p = g.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (Math.abs(y) < 0.1) { p.setX(i, p.getX(i) * 1.25); p.setZ(i, p.getZ(i) * 1.25); }
      const body = Math.abs(y) < 0.16; c.push(body ? 1.0 : 0.34, body ? 0.022 : 0.12, body ? 0.006 : 0.012);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g;
  })();
  const put = (arr, g, x, y, z, col, s = 1, ry = 0) => {
    const q = g.clone(); q.scale(s, s, s); if (ry) q.rotateY(ry); q.translate(x, y, z);
    if (col) { const n = q.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(col, i * 3); q.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    arr.push(q);
  };
  const WARM = [[1.0, 0.58, 0.26], [1.0, 0.5, 0.2], [1.0, 0.66, 0.34]];
  let nStr = 0;
  for (const e of graph.edges) {
    if (e.deck || !e.pts || e.pts.length < 2 || e.kind === 'highway' || e.width > maxWidth || e.len < 25) continue;
    const P = e.pts, mid = P[Math.floor(P.length / 2)];
    if (!inBox(P[0][0], P[0][1]) && !inBox(P[P.length - 1][0], P[P.length - 1][1]) && !inBox(mid[0], mid[1])) continue;
    const nm = e.name || '', grant = !only && /^Grant Av/i.test(nm), alley = e.width < 8 || (/Alley|Place|Lane/i.test(nm) && e.width < 10);
    if (match && !match.test(nm)) continue;
    const gap = gapO || (grant ? 8.5 : alley ? 7 : 13), lanShare = grant || alley ? 0.92 : 0.6;
    const hw = e.width / 2, off = hw + Math.max(0.8, Math.min(4, e.sidewalk || 2.5)) - 0.15;
    const hA = alley ? 4.8 : 6.3, hR = alley ? 1.0 : 1.5;
    const tA = (e.a?.radius || 6) + 3, tB = (e.b?.radius || 6) + 3;
    let cum = 0; const segs = [];
    for (let i = 0; i < P.length - 1; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (L > 0.01) segs.push([P[i], P[i + 1], cum, L]); cum += L; }
    if (!segs.length) continue;
    const total = cum;
    const pointAt = (s) => {
      for (const [a, b, c0, L] of segs) if (s <= c0 + L) { const t = (s - c0) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L]; }
      const [a, b, , L] = segs[segs.length - 1]; return [b[0], b[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L];
    };
    let flip = rnd() < 0.5 ? 1 : -1;
    for (let s = tA + rnd() * 3; s < total - tB - 2; s += gap * (0.85 + rnd() * 0.3)) {
      const [cx, cz, ux, uz] = pointAt(s), px = -uz, pz = ux;
      if (!inBox(cx, cz)) continue;
      if (!only && !match && !NO_CT && onCtStreet(cx, cz, 1)) continue;     // the Chinatown hero set (hero_ctown.py) hangs its own baked strings there
      const kind = only || (rnd() < lanShare ? 'lanterns' : 'bulbs');
      const sB = Math.min(total - tB, s + (kind === 'bulbs' ? 3 + rnd() * 3 : grant ? 1.5 + rnd() * 2.5 : rnd() * 1.5));
      const [bx, bz] = pointAt(sB);
      const A = [cx + px * off * flip, heightAt(cx, cz) + hA + rnd() * hR, cz + pz * off * flip];
      const B = [bx - px * off * flip, heightAt(bx, bz) + hA + rnd() * hR, bz - pz * off * flip];
      flip = -flip;
      const span = Math.hypot(B[0] - A[0], B[2] - A[2]), sag = 0.45 + span * 0.05 + rnd() * 0.35;
      const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
      const T = tileOf(cx, cz);
      for (let i = 0; i < 12; i++) { const p = at(i / 12), q = at((i + 1) / 12); T.wire.push(...p, ...q); }
      if (kind === 'bulbs') {
        const n = Math.max(6, Math.round(span / 1.05)), col = WARM[Math.floor(rnd() * WARM.length)];
        for (let i = 1; i < n; i++) { const p = at(i / n); put(T.bulbs, bulbG, p[0], p[1] - 0.09, p[2], col, 0.85 + rnd() * 0.3); }
      } else {
        const n = Math.max(3, Math.round(span / (alley ? 1.3 : 1.6)));
        for (let i = 1; i < n; i++) {
          const p = at(i / n), drop = 0.28 + rnd() * 0.12;
          T.wire.push(p[0], p[1], p[2], p[0], p[1] - drop + 0.17, p[2]);
          put(T.lanterns, lanG, p[0], p[1] - drop, p[2], null, (alley ? 0.8 : 0.95) + rnd() * 0.3, rnd() * 3);
        }
      }
      nStr++;
    }
  }
  if (!tiles.size) return null;
  const root = new THREE.Group(); root.name = name;
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0c0c0c });
  const bulbMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lanMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lod = [];
  const merged = (arr) => { const g = mergeGeometries(arr); arr.forEach(q => q.dispose()); g.computeBoundingSphere(); return g; };
  for (const T of tiles.values()) {
    const add = (o, name, maxD) => { o.name = name; o.matrixAutoUpdate = false; root.add(o); lod.push({ o, x: T.cx, z: T.cz, maxD }); return o; };
    if (T.wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.wire, 3)); g.computeBoundingSphere(); add(new THREE.LineSegments(g, wireMat), 'props2:lanternwire', 260); }
    if (T.bulbs.length) add(new THREE.Mesh(merged(T.bulbs), bulbMat), 'props2:festoon', 520);
    if (T.lanterns.length) add(new THREE.Mesh(merged(T.lanterns), lanMat), 'props2:lanterns', 620);
  }
  // ticker: an empty always-rendered mesh whose onBeforeRender drives the steady night glow + distance culling
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const ticker = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  ticker.frustumCulled = false; ticker.renderOrder = -1e6; ticker.name = 'props2:lanternstrings-ticker';
  const HALF = T2 * 0.71;
  ticker.onBeforeRender = (r, s, cam) => {
    // (flicker fix 9/30) main view only: the car reflection probe's cube cameras (local position 0,0 = the world origin)
    // render on alternate frames, and visibility set here only takes effect on the NEXT render: every other frame the
    // main view drew with the tiles culled from the origin (sign bands / neon / lanterns strobing)
    if (!cam || cam.isOrthographicCamera || cam.parent?.isCubeCamera) return;
    const k = Math.min(1, Math.max(0, night?.value ?? 0) * 1.3);
    bulbMat.color.setScalar(0.7 + (1.8 - 0.7) * k); lanMat.color.setRGB(0.5 + 0.75 * k, 0.5 + 0.06 * k, 0.5 - 0.02 * k);   // (10/1: red peak 1.9 -> 1.25: ACES pushed the brighter cores to pink-white)
      // (regression fix 9/30: was 0.78 grey: the red channel glows + blooms, G/B held so the paper stays deep red, not pink)
    const cx = cam.matrixWorld.elements[12], cz = cam.matrixWorld.elements[14];
    for (const L of lod) L.o.visible = Math.hypot(L.x - cx, L.z - cz) - HALF < L.maxD;
  };
  root.add(ticker);
  group.add(root);
  return { group: root, strings: nStr, tiles: tiles.size };
}
