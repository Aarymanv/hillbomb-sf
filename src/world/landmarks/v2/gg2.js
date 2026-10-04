// Golden Gate Bridge at real scale on the v2 (1:1) map. Frame: GG2 axis (anchors2.js), s = metres north of the south
// tower, l = lateral (+ east). Kit local: x = l, z = -s, y = world height.
// Real dims: main span 1280 m, side spans 343 m, towers 227 m above water (152 m above the road), road 75-77 m,
// cables 0.92 m at 27.4 m spacing, suspenders every 15.24 m, stiffening truss 7.6 m, Fort Point arch 98 m.
import * as THREE from 'three';
import { Kit, shade, mats } from '../kit.js';
import { GG2, ggS, ggDeckY } from '../../v2/anchors2.js';
import { weather, railTexture, quadUV } from './mats2.js';

const ORANGE = 0xc2412a, ORANGE_D = shade(ORANGE, 0.74), ORANGE_L = shade(ORANGE, 1.04);
const CONC = 0xbcb6aa, CONC_D = 0x9a958b, CONC_L = 0xcdc8bc;
const MAIN = GG2.mainSpan, SIDE = GG2.sideSpan;
const TOWERS = [0, MAIN], ANCH = [-SIDE - 3, MAIN + SIDE];     // cable ends (pylon faces)
const TOP = GG2.towerTop, CL = 13.7;                         // cable planes at +-13.7 (27.4 m apart)
const TRUSS = 7.6, ROADH = 9.45, EDGE = 13.9;

// deck road height along the axis, sampled from the baked road graph (exact match with the drivable surface)
export function ggProfile(graph) {
  const bins = new Map();
  for (const e of graph?.edges || []) {
    if (!e.deck || e.deck.kind !== 'goldengate') continue;
    for (let k = 0; k < e.pts.length; k++) {
      const [x, z] = e.pts[k], s = ggS(x, z); if (s < -700 || s > 2060) continue;
      const b = Math.round(s / 4); const r = bins.get(b) || [0, 0]; r[0] += e.ys[k]; r[1]++; bins.set(b, r);
    }
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  if (keys.length < 20) return ggDeckY;
  const S = keys.map(k => k * 4), Y = keys.map(k => bins.get(k)[0] / bins.get(k)[1]);
  return (s) => {
    if (s <= S[0]) return Y[0]; if (s >= S[S.length - 1]) return Y[Y.length - 1];
    let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / (S[hi] - S[lo]); return Y[lo] + (Y[hi] - Y[lo]) * t;
  };
}

export function buildGoldenGate2({ heightAt, graph }) {
  const [ox, oz] = GG2.origin, [dx, dz] = GG2.dir;
  const kit = new Kit('goldenGate2', { x: ox, z: oz, yaw: Math.atan2(-dx, -dz), heightAt });
  const dY = ggProfile(graph);
  const P = (s, l, y) => [l, y, -s];
  const gh = (s, l) => kit.h(l, -s);
  // materials: tower (floodlit at night), detail keys chunked along the axis so far chunks can drop out (LOD)
  const towerMat = weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15, emissive: 0xff7a45, emissiveIntensity: 0 }), { strength: 0.4, streak: 0.35, key: 'ggt' });
  towerMat.name = 'lm-gg-tower'; kit.register('tower', towerMat, {});
  const railMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.15 });
  railMat.name = 'lm-gg-rail'; kit.register('rail', railMat, { castShadow: false });
  const dkeys = new Set();
  const D = (s) => { const k = `d${Math.max(0, Math.floor((s + 700) / 450))}`; dkeys.add(k); return k; };

  // ------------------------------------------------------------------------------------------------ towers
  const LEVELS = (dy) => [dy + 45, dy + 83, dy + 111, dy + 136];          // portal strut bottoms above the road
  for (const ts of TOWERS) {
    const dy = dY(ts);
    // pier + fender
    let gLo = Infinity; for (const [ds, dl] of [[-20, -30], [20, -30], [-20, 30], [20, 30], [0, 0]]) gLo = Math.min(gLo, gh(ts + ds, dl));
    const wet = gLo < 2, pierTop = Math.max(13, gLo + 3), pierBot = Math.min(gLo, 0) - 6;
    kit.boxY('solid', 0, pierBot, pierTop - 1.5, -ts, 50, 30, CONC);
    kit.boxY('solid', 0, pierTop - 1.5, pierTop, -ts, 47, 27, CONC_D);
    for (const sg of [-1, 1]) kit.boxY('solid', sg * 15.5, pierTop, pierTop + 2.2, -ts, 13.5, 19.5, CONC_L);
    kit.collider(0, -ts, 25, 15, 0, pierBot, pierTop + 2.2);
    if (wet) { // elliptical fender (88 x 48 m) around the south pier
      const n = 36;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
        const p0 = P(ts + Math.sin(a0) * 24, Math.cos(a0) * 44, 3.5), p1 = P(ts + Math.sin(a1) * 24, Math.cos(a1) * 44, 3.5);
        kit.beam('solid', p0, p1, 4.5, 9, CONC_D);
      }
      kit.collider(0, -ts, 44, 24, 0, -8, 8);
    }
    const base = pierTop + 2.2;
    const L = LEVELS(dy);
    // legs: 5 sections with set-backs on the outer and along-axis faces; inner faces stay at the road edge
    const sect = [base, dy - 9, L[0] + 8, L[1] + 7, L[2] + 6, TOP - 12];
    const legIn = 10.1;
    for (const sg of [-1, 1]) {
      for (let k = 0; k < sect.length - 1; k++) {
        const y0 = sect[k], y1 = sect[k + 1], t = k / (sect.length - 2);
        const w = 10.2 - 3.6 * t, hd = 8.3 - 3.2 * t, cx = sg * (legIn + w / 2);
        kit.boxY('tower', cx, y0, y1, -ts, w, hd * 2, ORANGE);
        // Art Deco fluting: recessed vertical grooves = proud pilasters between them
        const rh0 = y0 + 1.2, rh1 = y1 - 1.6;
        for (const f of [-1, 1]) {
          for (let r = 0; r < 4; r++) {
            const rx = cx + (r - 1.5) / 1.5 * (w / 2 - 0.55);
            kit.boxY('tower', rx, rh0, rh1, -ts + f * (hd + 0.2), 0.9, 0.4, ORANGE_L);
          }
          for (let r = 0; r < 3; r++) kit.boxY('tower', sg * (legIn + w + 0.2), rh0, rh1, -ts + f * (r - 1) * hd * 0.62, 0.4, 1.1, ORANGE_L);
        }
        // setback cornice
        kit.boxY('tower', cx, y1 - 1.6, y1, -ts, w + 0.9, hd * 2 + 0.9, ORANGE_D);
      }
      // crown: stepped cap + saddle housing
      const wT = 10.2 - 3.6, hT = 8.3 - 3.2;
      kit.boxY('tower', sg * (legIn + wT / 2), TOP - 12, TOP - 2, -ts, wT - 0.6, hT * 2 - 0.6, ORANGE);
      kit.boxY('tower', sg * (legIn + wT / 2), TOP - 2, TOP, -ts, wT - 1.6, hT * 2 - 2, ORANGE_D);
      kit.boxY('tower', sg * CL, TOP, TOP + 2.4, -ts, 3, 9, ORANGE_D);
      kit.box('blink', sg * (legIn + wT / 2), TOP + 3, -ts, 1.1, 1.3, 1.1, 0xff2a1a, { ecol: [4, 0.3, 0.2] });
      kit.box('blink', sg * (legIn + 10.4), L[1] + 3, -ts - 7, 0.8, 0.9, 0.8, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
      kit.collider(sg * (legIn + 5.1), -ts, 5.1, 8.3, 0, base, TOP + 2.4);
    }
    // portal struts with vertical Art Deco fins + stepped corbels; top strut = crown
    const struts = [[L[0], L[0] + 8], [L[1], L[1] + 7], [L[2], L[2] + 6], [L[3], TOP - 2]];
    for (const [y0, y1] of struts) {
      const hs = 3.4, wS = legIn * 2;
      kit.boxY('tower', 0, y0, y1, -ts, wS, hs * 2, ORANGE);
      for (const f of [-1, 1]) {
        const n = Math.round(wS / 1.6);
        for (let r = 0; r <= n; r++) kit.boxY('tower', -wS / 2 + r * wS / n, y0 + 0.9, y1 - 0.9, -ts + f * (hs + 0.18), 0.8, 0.36, ORANGE);
        kit.boxY('tower', 0, y0 - 0.2, y0 + 0.6, -ts + f * (hs + 0.15), wS, 0.5, ORANGE_D);
        kit.boxY('tower', 0, y1 - 0.6, y1 + 0.2, -ts + f * (hs + 0.15), wS, 0.5, ORANGE_D);
      }
      // corbels (the stepped "shoulders" that make the Art Deco portal outline)
      // five fine steps per corner (wave 5 detail pass: the real portals read as stepped Art Deco arches)
      for (const sg of [-1, 1]) for (let st = 0; st < 5; st++) {
        const d = 1.15 * (5 - st), hh = 1.05;
        kit.boxY('tower', sg * (legIn - d / 2), y0 - hh * (st + 1), y0 - hh * st, -ts, d, hs * 2 - 0.4 - st * 0.12, st % 2 ? ORANGE_D : ORANGE);
      }
    }
    // under-deck strut + X-bracing between the legs (visible from the water)
    kit.boxY('tower', 0, dy - TRUSS - 4.5, dy - TRUSS - 1, -ts, legIn * 2, 6, ORANGE);
    const yb0 = base + 2, yb1 = dy - TRUSS - 4.5;
    if (yb1 - yb0 > 10) {
      const nX = Math.max(1, Math.round((yb1 - yb0) / 24)), hX = (yb1 - yb0) / nX;
      for (let i = 0; i < nX; i++) for (const f of [-1, 1]) {
        const za = -ts + f * 3, a = yb0 + i * hX, b = a + hX;
        kit.beam('tower', [-legIn, a, za], [legIn, b, za], 1.1, 1.1, ORANGE_D);
        kit.beam('tower', [legIn, a, za], [-legIn, b, za], 1.1, 1.1, ORANGE_D);
        kit.boxY('tower', 0, b - 1.2, b, za, legIn * 2, 1.2, ORANGE_D);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ main cables
  const cEnd = [dY(ANCH[0]) + 6, dY(ANCH[1]) + 6], saddle = TOP + 1.2, sagY = dY(MAIN / 2) + 3.2;
  const cableY = (s) => {
    if (s <= 0) { const t = (s - ANCH[0]) / (0 - ANCH[0]); return cEnd[0] + (saddle - cEnd[0]) * t - 4 * 9 * t * (1 - t); }
    if (s >= MAIN) { const t = (s - MAIN) / (ANCH[1] - MAIN); return saddle + (cEnd[1] - saddle) * t - 4 * 9 * t * (1 - t); }
    const u = (s - MAIN / 2) / (MAIN / 2); return sagY + (saddle - sagY) * u * u;
  };
  for (const sg of [-1, 1]) {
    let prev = null;
    const st = [];
    for (let s = ANCH[0]; s < ANCH[1]; s += 8) st.push(s);
    st.push(ANCH[1], 0, MAIN); st.sort((a, b) => a - b);
    for (const s of st) {
      const p = P(s, sg * CL, cableY(s));
      if (prev && Math.abs(prev[2] + s) > 0.01) kit.rod('paint', prev, p, 0.46, 10, ORANGE);
      prev = p;
    }
    // suspenders (pairs of ropes) + cable bands
    for (let s = ANCH[0] + 15.24; s < ANCH[1] - 4; s += 15.24) {
      if (TOWERS.some(t => Math.abs(s - t) < 6)) continue;
      const yc = cableY(s), yd = dY(s) - 0.4;
      if (yc - yd < 0.8) continue;
      const k = D(s);
      for (const o of [-0.35, 0.35]) kit.rod(k, P(s + o, sg * CL, yd), P(s + o, sg * CL, yc - 0.3), 0.085, 5, ORANGE_D);
      // cable band: a split clamp around the cable (tangent-aligned) with the suspender saddle under it; socket at the deck
      const ya = cableY(s - 0.6), yb = cableY(s + 0.6);
      kit.rod(k, P(s - 0.6, sg * CL, ya), P(s + 0.6, sg * CL, yb), 0.62, 8, ORANGE_D);
      kit.box(k, sg * CL, yc - 0.55, -s, 0.5, 0.5, 1.3, ORANGE_D);
      kit.box(k, sg * CL, yd + 0.25, -s, 0.55, 0.5, 1.2, ORANGE_D);
    }
  }
  // aviation light at mid-cable
  for (const sg of [-1, 1]) kit.box('blink', sg * CL, sagY + 1.6, -MAIN / 2, 0.7, 0.7, 0.7, 0xff2a1a, { ecol: [3, 0.25, 0.15] });

  // ------------------------------------------------------------------------------------------------ suspended deck
  const PANEL = 7.62;
  let pi = 0;
  const sA = ANCH[0] + 2, sB = ANCH[1] - 2;
  for (let s = sA; s < sB - 0.1; s += PANEL, pi++) {
    const s1 = Math.min(sB, s + PANEL), k = D(s);
    const t0 = dY(s) - 0.45, t1 = dY(s1) - 0.45, b0 = t0 - TRUSS, b1 = t1 - TRUSS;
    kit.beam('paint', P(s, 0, t0 - 0.5), P(s1, 0, t1 - 0.5), EDGE * 2 - 0.6, 0.8, ORANGE_D);           // floor system
    for (const sg of [-1, 1]) {
      const l = sg * CL;
      kit.beam('paint', P(s, l, t0 - 0.55), P(s1, l, t1 - 0.55), 0.9, 1.1, ORANGE);                    // top chord
      kit.beam('paint', P(s, l, b0 + 0.55), P(s1, l, b1 + 0.55), 0.95, 1.1, ORANGE);                   // bottom chord
      kit.beam(k, P(s, l, t0 - 0.9), P(s, l, b0 + 0.9), 0.55, 0.7, ORANGE_D);                         // vertical
      if (pi % 2) kit.beam(k, P(s, l, t0 - 1), P(s1, l, b1 + 1), 0.45, 0.6, ORANGE_D);
      else kit.beam(k, P(s, l, b0 + 1), P(s1, l, t1 - 1), 0.45, 0.6, ORANGE_D);
      // sidewalk (outside the traffic barrier, inside the cable plane) + fascia
      kit.beam('solid', P(s, sg * (ROADH + 2.1), t0 + 0.55), P(s1, sg * (ROADH + 2.1), t1 + 0.55), 4.3, 0.4, 0x9f9c96);
      kit.beam('paint', P(s, sg * (EDGE + 0.15), t0 - 0.2), P(s1, sg * (EDGE + 0.15), t1 - 0.2), 0.3, 1.5, ORANGE);
    }
    kit.beam(k, P(s, -CL, b0 + 0.4), P(s, CL, b0 + 0.4), 0.5, 0.6, ORANGE_D);                          // bottom lateral
    kit.beam(k, P(s, pi % 2 ? -CL : CL, b0 + 0.4), P(s1, pi % 2 ? CL : -CL, b1 + 0.4), 0.35, 0.4, ORANGE_D);
  }
  // railings (alpha-tested, one quad per 30 m) on the outer deck edge, traffic barrier on the road edge
  const RAILSTEP = 30;
  for (let s = sA; s < sB - 0.1; s += RAILSTEP) {
    const s1 = Math.min(sB, s + RAILSTEP);
    for (const sg of [-1, 1]) {
      const l = sg * (EDGE - 0.05), a = P(s, l, dY(s) + 0.1), b = P(s1, l, dY(s1) + 0.1);
      const g = quadUV(a, b, [b[0], b[1] + 1.25, b[2]], [a[0], a[1] + 1.25, a[2]], (s1 - s) / 1.25);
      kit.geom('rail', g, null, ORANGE);
      kit.beam('solid', P(s, sg * (ROADH - 0.05), dY(s) + 0.25), P(s1, sg * (ROADH - 0.05), dY(s1) + 0.25), 0.45, 0.5, 0xa8a49c); // curb barrier
      kit.beam('steel', P(s, sg * (ROADH - 0.05), dY(s) + 0.85), P(s1, sg * (ROADH - 0.05), dY(s1) + 0.85), 0.12, 0.3, 0x9a9d9f);
    }
  }
  // light standards every 30.5 m, both sides (sodium orange at night)
  for (let s = sA + 15; s < sB - 5; s += 30.48) {
    if (TOWERS.some(t => Math.abs(s - t) < 12)) continue;
    const k = D(s);
    for (const sg of [-1, 1]) {
      const y = dY(s), l = sg * (ROADH + 0.35);
      kit.boxY(k, l, y + 0.3, y + 8.6, -s, 0.3, 0.3, ORANGE_D);
      kit.beam(k, [l, y + 8.5, -s], [l - sg * 1.6, y + 8.9, -s], 0.18, 0.18, ORANGE_D);
      // Art Deco luminaire: tapered hood over a sodium lens
      kit.boxY(k, l, y + 0.3, y + 1.4, -s, 0.55, 0.55, ORANGE_D);
      kit.box(k, l - sg * 1.95, y + 8.98, -s, 0.75, 0.22, 1.05, ORANGE_D);
      kit.box('glow', l - sg * 1.95, y + 8.8, -s, 0.6, 0.16, 0.85, 0xe8dcc0, { ecol: [3.2, 1.9, 0.7] });
    }
  }

  // ------------------------------------------------------------------------------------------------ end pylons + anchorages
  function pylons(sp, dir) {
    const dy = dY(sp);
    let g = Infinity; for (const l of [-24, 0, 24]) for (const d of [-20, 0, 20]) g = Math.min(g, gh(sp + d, l));
    const bot = Math.min(g, 0) - 3;
    // anchorage block under the deck (stepped, grooved concrete)
    kit.boxY('solid', 0, bot, dy - TRUSS - 1, -(sp + dir * 8), 46, 44, CONC);
    for (let i = 0; i < 3; i++) kit.boxY('solid', 0, dy - TRUSS - 1 - (i + 1) * 5, dy - TRUSS - 1 - i * 5 + 0.01, -(sp + dir * (8 + 23 + i)), 48 - i * 2, 1.2, CONC_D);
    kit.collider(0, -(sp + dir * 8), 23, 22, 0, bot, dy - TRUSS - 1);
    // the two Art Deco pylons flanking the roadway
    for (const sg of [-1, 1]) {
      const cx = sg * 17.2;
      kit.boxY('solid', cx, bot, dy + 10, -sp, 9, 11, CONC);
      kit.boxY('solid', cx, dy + 10, dy + 13.5, -sp, 7.4, 9.4, CONC_L);
      kit.boxY('solid', cx, dy + 13.5, dy + 15.2, -sp, 5.6, 7.6, CONC);
      for (let r = -1; r <= 1; r++) for (const f of [-1, 1]) kit.boxY('solid', cx + r * 2.6, dy - 6, dy + 9.4, -sp + f * 5.7, 0.9, 0.4, CONC_L);
      kit.box('glow', cx - sg * 4.6, dy + 6, -sp, 0.3, 2.2, 1.2, 0xe8dcc0, { ecol: [2.4, 1.6, 0.8] });
      kit.collider(cx, -sp, 4.5, 5.5, 0, bot, dy + 15.2);
    }
  }
  pylons(ANCH[0] - 3, -1);
  pylons(ANCH[1] + 3, 1);

  // ------------------------------------------------------------------------------------------------ Fort Point arch (S1 -> S2)
  {
    const s1 = ANCH[0] - 6, s2 = s1 - 98, sm = (s1 + s2) / 2;
    const dyS2 = dY(s2);
    let gS2 = Infinity; for (const l of [-20, 0, 20]) gS2 = Math.min(gS2, gh(s2, l));
    // S2 pylon block
    kit.boxY('solid', 0, Math.min(gS2, 0) - 3, dyS2 - 5, -(s2 - 10), 38, 20, CONC);
    for (const sg of [-1, 1]) {
      kit.boxY('solid', sg * 17.2, dyS2 - 5, dyS2 + 8, -(s2 - 10), 8, 12, CONC);
      kit.boxY('solid', sg * 17.2, dyS2 + 8, dyS2 + 10.5, -(s2 - 10), 6.4, 10.4, CONC_L);
    }
    kit.collider(0, -(s2 - 10), 19, 10, 0, Math.min(gS2, 0) - 3, dyS2 - 5);
    const spring = Math.max(gh(s1, 0), gh(s2, 0), 6) + 4, crown = dY(sm) - TRUSS - 2.2;
    const archY = (s) => { const u = (s - sm) / ((s1 - s2) / 2); return spring + (crown - spring) * (1 - u * u); };
    const NA = 24;
    for (const sg of [-1, 1]) {
      const l = sg * 10.5;
      for (let i = 0; i < NA; i++) {
        const a = s2 + (s1 - s2) * i / NA, b = s2 + (s1 - s2) * (i + 1) / NA;
        kit.beam('paint', P(a, l, archY(a)), P(b, l, archY(b)), 2.2, 3.4, ORANGE);
      }
      for (let s = s2 + 7; s < s1 - 3; s += 7.2) kit.beam('paint', P(s, l, archY(s)), P(s, l, dY(s) - 1), 0.8, 0.9, ORANGE_D);
      kit.beam('paint', P(s2, l, dY(s2) - 1.4), P(s1, l, dY(s1) - 1.4), 1.2, 2.6, ORANGE);
    }
    for (let i = 0; i < NA; i += 2) {
      const a = s2 + (s1 - s2) * i / NA, b = s2 + (s1 - s2) * (i + 2) / NA;
      kit.beam('paint', P(a, -10.5, archY(a)), P(b, 10.5, archY(b)), 0.6, 0.6, ORANGE_D);
      kit.beam('paint', P(a, 10.5, archY(a)), P(b, -10.5, archY(b)), 0.6, 0.6, ORANGE_D);
    }
    kit.beam('paint', P(s2, 0, dY(s2) - 0.9), P(s1, 0, dY(s1) - 0.9), EDGE * 2, 1.0, ORANGE_D);
  }

  // ------------------------------------------------------------------------------------------------ approach viaducts
  // follow the baked deck polylines outside the suspended part (south of S2, north of the Marin pylons)
  const done = new Set();
  for (const e of graph?.edges || []) {
    if (!e.deck || e.deck.kind !== 'goldengate' || done.has(e.id)) continue;
    done.add(e.id);
    const hw = e.width / 2 + 1.2;
    let acc = 0;
    for (let k = 0; k < e.pts.length - 1; k++) {
      const [ax, az] = e.pts[k], [bx, bz] = e.pts[k + 1], ay = e.ys[k], by = e.ys[k + 1];
      const sa = ggS(ax, az), sb = ggS(bx, bz);
      const inSusp = (s) => s > ANCH[0] - 110 && s < ANCH[1] + 2;
      if (inSusp(sa) && inSusp(sb)) continue;
      const [la, za] = kit.l(ax, az), [lb, zb] = kit.l(bx, bz);
      const len = Math.hypot(lb - la, zb - za); if (len < 0.5) continue;
      const nx = -(zb - za) / len, nz = (lb - la) / len;
      kit.beam('paint', [la, ay - 1.1, za], [lb, by - 1.1, zb], hw * 2, 1.0, ORANGE_D, { up: [0, 1, 0] });
      for (const sg of [-1, 1]) {
        kit.beam('paint', [la + nx * sg * hw, ay - 3.1, za + nz * sg * hw], [lb + nx * sg * hw, by - 3.1, zb + nz * sg * hw], 0.7, 5, ORANGE);
        const g = quadUV([la + nx * sg * hw, ay + 0.1, za + nz * sg * hw], [lb + nx * sg * hw, by + 0.1, zb + nz * sg * hw],
          [lb + nx * sg * hw, by + 1.25, zb + nz * sg * hw], [la + nx * sg * hw, ay + 1.25, za + nz * sg * hw], len / 1.25);
        kit.geom('rail', g, null, ORANGE);
      }
      // steel bents every ~42 m where the deck is well above the ground
      const n0 = Math.floor(acc / 42), n1 = Math.floor((acc + len) / 42);
      if (n1 > n0) {
        const t = ((n1 * 42) - acc) / len, x = la + (lb - la) * t, z = za + (zb - za) * t, y = ay + (by - ay) * t;
        const top = y - 5.6, yaw = Math.atan2(lb - la, zb - za);
        const legs = [-hw + 1.6, hw - 1.6].map(o => [x + nx * o, z + nz * o]);
        const gs = legs.map(([px, pz]) => kit.heightAt(...kit.w(px, pz)));
        if (top - Math.max(...gs) > 4) {
          legs.forEach(([px, pz], i) => {
            const g0 = gs[i];
            kit.boxY('solid', px, g0 - 2, g0 + 1.2, pz, 4, 4, CONC, { yaw });
            kit.boxY('paint', px, g0 + 1.2, top, pz, 1.7, 2.6, ORANGE, { yaw });
            kit.collider(px, pz, 2, 2, yaw, g0 - 2, top);
          });
          const gm = Math.max(...gs) + 4;
          for (let yy = gm; yy < top - 6; yy += 11) {
            const y2 = Math.min(top - 1, yy + 11);
            kit.beam('paint', [legs[0][0], yy, legs[0][1]], [legs[1][0], y2, legs[1][1]], 0.5, 0.5, ORANGE_D);
            kit.beam('paint', [legs[1][0], yy, legs[1][1]], [legs[0][0], y2, legs[0][1]], 0.5, 0.5, ORANGE_D);
          }
          kit.beam('paint', [legs[0][0], top - 0.6, legs[0][1]], [legs[1][0], top - 0.6, legs[1][1]], 1.4, 1.3, ORANGE);
        }
      }
      acc += len;
    }
  }

  // register the chunked detail keys onto the paint material (resolved lazily: mats() in finish)
  for (const k of dkeys) kit.custom.set(k, { material: null, emissive: false, castShadow: false, receiveShadow: true, detailOf: 'paint' });
  const res = finishWithDetail(kit);
  const up0 = res.update;
  res.update = (dt, env = {}) => { up0(dt, env); towerMat.emissiveIntensity = (env.night || 0) * 0.16; };
  res.profile = dY;
  return res;
}

// finish a kit whose custom keys may carry { detailOf: 'paint' } (share that shared material, marked as LOD detail)
export function finishWithDetail(kit, lodDist = 1400) {
  const M = mats();
  const det = [];
  for (const [k, c] of kit.custom) if (c.detailOf) { c.material = M[c.detailOf]; det.push(k); }
  const res = kit.finish();
  res.detail = [];
  for (const m of res.group.children) {
    const key = m.name.split(':').pop();
    if (det.includes(key)) {
      m.geometry.computeBoundingSphere();
      const c = m.geometry.boundingSphere.center.clone().applyMatrix4(res.group.matrixWorld);
      res.detail.push({ mesh: m, c, r: m.geometry.boundingSphere.radius, far: lodDist });
    }
  }
  return res;
}
