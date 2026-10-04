// Golden Gate Bridge. Built in the bridge frame: local x = lateral l (+ = east side), local z = -s, y = world height.
import { GG_BRIDGE } from '../anchors.js';
import * as THREE from 'three';
import { Kit, shade } from './kit.js';

const ORANGE = 0xc0362c;
const ORANGE_D = shade(ORANGE, 0.78);
const ORANGE_L = shade(ORANGE, 1.08);
const CONCRETE = 0xb9b4aa;
const CONCRETE_D = 0x96918a;

export function bridgeYaw(br) { return Math.atan2(-br.dir[0], -br.dir[1]); }

// main-cable height along the axis for a 3-span suspension bridge with cable ends (s0,y0) and (s3,y3)
export function makeCableProfile(ends, towers, topY, sagY, sideSag) {
  // spans: [end0 -> tower0], [tower_i -> tower_i+1] (parabola to sagY), [towerN -> end1]
  return (s) => {
    const [a, b] = ends;
    if (s <= towers[0]) { const t = (s - a[0]) / (towers[0] - a[0]); return a[1] + (topY - a[1]) * t - 4 * sideSag * t * (1 - t); }
    const tl = towers[towers.length - 1];
    if (s >= tl) { const t = (s - tl) / (b[0] - tl); return topY + (b[1] - topY) * t - 4 * sideSag * t * (1 - t); }
    for (let i = 0; i < towers.length - 1; i++) {
      if (s <= towers[i + 1]) {
        const mid = (towers[i] + towers[i + 1]) / 2, half = (towers[i + 1] - towers[i]) / 2, u = (s - mid) / half;
        return sagY + (topY - sagY) * u * u;
      }
    }
    return topY;
  };
}

export function buildGoldenGate({ heightAt = () => 0, outerRailing = true } = {}) {
  const br = GG_BRIDGE;
  const kit = new Kit('goldenGate', { x: br.start[0], z: br.start[1], yaw: bridgeYaw(br), heightAt });
  const P = (s, l, y) => [l, y, -s];
  const gh = (s, l) => kit.h(l, -s);
  const dY = (s) => br.deckY(s);
  const L = br.length, TOP = br.towerTopY, CL = br.cableLateral;
  const EDGE = br.deckWidth / 2;             // 13.5
  const TRUSS_L = EDGE - 0.3;                 // truss side planes
  const TRUSS_D = 7;
  const legIn = Math.max(EDGE + 0.2, br.towerLegLateral - 2.3); // inner face of each leg (outside the deck)
  const towers = [br.southTowerS, br.northTowerS];
  const anchors = [br.southAnchorS, br.northAnchorS];
  // towers get their own material so they can be floodlit (warm orange glow) at night
  const towerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.12, emissive: 0xff5a2a, emissiveIntensity: 0 });
  towerMat.name = 'lm-gg-tower';
  kit.register('ggtower', towerMat, {});
  kit.onUpdate((dt, env) => { towerMat.emissiveIntensity = (env.night || 0) * 0.11; });

  // ---------------- towers ----------------
  for (const ts of towers) {
    const dy = dY(ts);
    // pier / fender
    let gLo = Infinity; for (const [ds, dl] of [[-16, -26], [16, -26], [-16, 26], [16, 26], [0, 0]]) gLo = Math.min(gLo, gh(ts + ds, dl));
    const pierBot = Math.min(gLo, 0) - 4, pierTop = Math.max(gLo, 0) + 7;
    kit.boxY('solid', 0, pierBot, pierTop, -ts, 50, 30, CONCRETE);
    kit.boxY('solid', 0, pierTop, pierTop + 1.2, -ts, 46, 26, CONCRETE_D);
    if (gLo < 1) { // fender ring in the water
      const fr = 34;
      for (let i = 0; i < 20; i++) {
        const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
        kit.beam('solid', [Math.cos(a0) * fr, 1.3, -ts + Math.sin(a0) * fr * 0.62], [Math.cos(a1) * fr, 1.3, -ts + Math.sin(a1) * fr * 0.62], 3, 4.6, CONCRETE_D);
      }
    }
    kit.collider(0, -ts, 25, 15, 0, pierBot, pierTop + 1.2);
    const base = pierTop + 1.2;
    // leg sections with setbacks; boundaries at the portal struts
    const levels = [base, dy - 9.5, 69, 92, 109, TOP];
    const portals = [[69, 75], [92, 97.5], [109, 113.5], [TOP - 6.5, TOP]];
    for (const sg of [-1, 1]) {
      for (let k = 0; k < levels.length - 1; k++) {
        const y0 = levels[k], y1 = levels[k + 1], t = k / (levels.length - 2);
        const outer = 19.8 - 1.9 * t, hs = 5.6 - 2.3 * t;
        const cx = sg * (legIn + outer) / 2, wx = outer - legIn;
        kit.boxY('ggtower', cx, y0, y1, -ts, wx, hs * 2, ORANGE);
        // recessed ribbing: pilasters on the along-axis faces and the outer face
        const rh = y1 - y0 - 1.2;
        for (const f of [-1, 1]) {
          for (let r = 0; r < 3; r++) {
            const rx = cx + (r - 1) * wx * 0.3;
            kit.boxY('ggtower', rx, y0 + 0.6, y0 + 0.6 + rh, -ts + f * (hs + 0.18), wx * 0.12, 0.36, ORANGE_L);
          }
          kit.boxY('ggtower', sg * (outer + 0.18), y0 + 0.6, y0 + 0.6 + rh, -ts + f * hs * 0.45, 0.36, hs * 0.22, ORANGE_L);
        }
        // setback cap
        kit.boxY('ggtower', cx, y1 - 0.5, y1, -ts, wx + 0.5, hs * 2 + 0.5, ORANGE_D);
      }
      // stepped crown + cable saddle housing
      kit.boxY('ggtower', sg * (legIn + 17.9) / 2, TOP, TOP + 2.2, -ts, 17.9 - legIn - 0.8, 5.2, ORANGE);
      kit.boxY('ggtower', sg * CL, TOP + 2.2, TOP + 3.6, -ts, 2.6, 7.5, ORANGE_D);
      kit.box('blink', sg * (legIn + 1.2), TOP + 2.8, -ts, 0.9, 1.2, 0.9, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
      kit.collider(sg * (legIn + 19.8) / 2, -ts, (19.8 - legIn) / 2, 5.6, 0, base, TOP + 3.6);
    }
    // portal struts above the deck + one under the deck
    const struts = [...portals, [dy - 10.2, dy - 7.4]];
    for (const [y0, y1] of struts) {
      const hs = 2.6;
      kit.boxY('ggtower', 0, y0, y1, -ts, legIn * 2 + 1, hs * 2, ORANGE);
      for (const f of [-1, 1]) {
        for (let r = -5; r <= 5; r++) kit.boxY('ggtower', r * 2.3, y0 + 0.5, y1 - 0.5, -ts + f * (hs + 0.15), 0.5, 0.3, ORANGE_L);
        kit.boxY('ggtower', 0, y0 - 0.1, y0 + 0.4, -ts + f * (hs + 0.1), legIn * 2, 0.4, ORANGE_D);
      }
      if (y0 > dy) for (const sg of [-1, 1]) { // corner gussets (art-deco chamfers)
        kit.beam('ggtower', [sg * legIn, y0 - 3, -ts], [sg * (legIn - 3), y0 + 0.2, -ts], 1.6, 4.2, ORANGE);
      }
    }
  }

  // ---------------- main cables + suspenders ----------------
  const endY = (s) => dY(s) + 2;
  const cableY = makeCableProfile([[anchors[0], endY(anchors[0])], [anchors[1], endY(anchors[1])]], towers, TOP + 3, br.cableSagY, 5);
  const step = 6;
  for (const sg of [-1, 1]) {
    let prev = null;
    for (let s = anchors[0]; s <= anchors[1] + 0.01; s += step) {
      // snap exactly onto the towers so the cable kinks at the saddles
      let ss = s; for (const t of towers) if (Math.abs(s - t) < step / 2) ss = t;
      const p = P(ss, sg * CL, cableY(ss));
      if (prev) kit.rod('paint', prev, p, 0.55, 6, ORANGE);
      prev = p;
    }
    // suspenders every 12.5 m
    for (let s = anchors[0] + 12.5; s < anchors[1] - 6; s += 12.5) {
      if (towers.some((t) => Math.abs(s - t) < 5)) continue;
      const yc = cableY(s), yd = dY(s) - 0.6;
      if (yc - yd < 1.5) continue;
      kit.box('paint', sg * CL, (yc + yd) / 2, -s, 0.3, yc - yd, 0.3, ORANGE_D);
      kit.box('paint', sg * CL, yc - 0.2, -s, 0.9, 0.7, 0.9, ORANGE_D); // cable band
    }
  }

  // ---------------- stiffening truss, underside, fascia, railing, lamps ----------------
  const PANEL = 7.5;
  let panelIdx = 0;
  for (let s = 0; s < L - 0.1; s += PANEL, panelIdx++) {
    const s1 = Math.min(L, s + PANEL);
    const g0 = Math.max(gh(s, 0), gh(s, -EDGE), gh(s, EDGE)), g1 = Math.max(gh(s1, 0), gh(s1, -EDGE), gh(s1, EDGE));
    const onGrade = Math.min(g0, g1) > dY((s + s1) / 2) - 1.2;
    if (onGrade) continue;
    const t0 = dY(s) - 0.4, t1 = dY(s1) - 0.4, b0 = t0 - TRUSS_D, b1 = t1 - TRUSS_D;
    // underside slab (top stays below deckY - 0.3) + fascia
    kit.beam('paint', P(s, 0, t0 - 0.45), P(s1, 0, t1 - 0.45), EDGE * 2, 0.9, ORANGE_D);
    for (const sg of [-1, 1]) {
      const l = sg * TRUSS_L;
      kit.beam('paint', P(s, sg * (EDGE + 0.1), t0 - 0.75), P(s1, sg * (EDGE + 0.1), t1 - 0.75), 0.25, 1.3, ORANGE); // fascia, top at deckY-0.5
      kit.beam('paint', P(s, l, t0 - 0.6), P(s1, l, t1 - 0.6), 0.7, 1.0, ORANGE);           // top chord
      kit.beam('paint', P(s, l, b0 + 0.4), P(s1, l, b1 + 0.4), 0.8, 0.9, ORANGE);           // bottom chord
      kit.beam('paint', P(s, l, t0 - 0.6), P(s, l, b0 + 0.4), 0.55, 0.55, ORANGE_D);         // vertical
      if (panelIdx % 2) kit.beam('paint', P(s, l, t0 - 0.8), P(s1, l, b1 + 0.6), 0.4, 0.4, ORANGE_D);
      else kit.beam('paint', P(s, l, b0 + 0.6), P(s1, l, t1 - 0.8), 0.4, 0.4, ORANGE_D);
    }
    // bottom lateral bracing
    kit.beam('paint', P(s, -TRUSS_L, b0 + 0.3), P(s, TRUSS_L, b0 + 0.3), 0.5, 0.5, ORANGE_D);
    if (panelIdx % 2 === 0) kit.beam('paint', P(s, -TRUSS_L, b0 + 0.3), P(s1, TRUSS_L, b1 + 0.3), 0.35, 0.35, ORANGE_D);
    else kit.beam('paint', P(s, TRUSS_L, b0 + 0.3), P(s1, -TRUSS_L, b1 + 0.3), 0.35, 0.35, ORANGE_D);

    // outer pedestrian railing (on the deck edge, outside the sidewalks)
    if (outerRailing) for (const sg of [-1, 1]) {
      const l = sg * (EDGE - 0.1);
      kit.beam('paint', P(s, l, dY(s) + 1.25), P(s1, l, dY(s1) + 1.25), 0.14, 0.14, ORANGE);
      kit.beam('paint', P(s, l, dY(s) + 0.35), P(s1, l, dY(s1) + 0.35), 0.1, 0.1, ORANGE);
      for (let k = 0; k < 3; k++) {
        const sp = s + k * PANEL / 3;
        if (towers.some((t) => Math.abs(sp - t) < 5.8)) continue;
        kit.box('paint', l, dY(sp) + 0.62, -sp, 0.12, 1.3, 0.12, ORANGE_D);
      }
    }
  }
  // lamp posts (staggered both sides, every 25 m)
  for (let s = 12.5; s < L - 5; s += 25) {
    if (towers.some((t) => Math.abs(s - t) < 8)) continue;
    for (const sg of [-1, 1]) {
      const sp = s + (sg > 0 ? 12.5 : 0);
      if (sp > L - 3 || towers.some((t) => Math.abs(sp - t) < 8)) continue;
      const y = dY(sp) - 0.3, l = sg * (EDGE - 0.35);
      kit.boxY('paint', l, y, y + 6.2, -sp, 0.26, 0.26, ORANGE_D);
      kit.box('paint', l - sg * 0.5, y + 6.1, -sp, 1.1, 0.16, 0.16, ORANGE_D);
      kit.box('glow', l - sg * 1.0, y + 5.85, -sp, 0.5, 0.35, 0.8, 0xe9e2cf, { ecol: [2.4, 1.7, 0.9] });
    }
  }

  // ---------------- anchorages ----------------
  anchors.forEach((as, i) => {
    const tw = i === 0 ? 1 : -1;   // direction (in s) toward the nearest tower
    const dy = dY(as);
    const s0 = as - 20 * tw, s1 = as + 16 * tw, sm = (s0 + s1) / 2, hsA = Math.abs(s1 - s0) / 2;
    let gLo = Infinity; for (const s of [s0, sm, s1]) for (const l of [-24, 0, 24]) gLo = Math.min(gLo, gh(s, l));
    const bot = Math.min(gLo, 0) - 2;
    const under = dY(as) - TRUSS_D - 0.8;
    if (under > bot + 0.5) { kit.boxY('solid', 0, bot, under, -sm, 48, hsA * 2, CONCRETE); kit.collider(0, -sm, 24, hsA, 0, bot, under); }
    for (const sg of [-1, 1]) {
      const cx = sg * (EDGE + 0.4 + 5.2);
      kit.boxY('solid', cx, bot, dy + 3.5, -sm, 10.4, hsA * 2, CONCRETE);
      kit.boxY('solid', cx, dy + 3.5, dy + 4.3, -sm, 11.2, hsA * 2 + 0.8, CONCRETE_D);
      // taller cable-entry block on the tower side, stepped
      const se = as + 6 * tw;
      kit.boxY('solid', sg * (EDGE + 0.4 + 3.2), dy + 4.3, dy + 9.5, -se, 6.4, 12, CONCRETE);
      kit.boxY('solid', sg * (EDGE + 0.4 + 3.2), dy + 9.5, dy + 10.3, -se, 7, 12.8, CONCRETE_D);
      for (let r = 0; r < 4; r++) kit.boxY('solid', sg * (EDGE + 10.8), bot + 1, dy + 2.8, -(s0 + tw * (6 + r * 8)), 0.4, 1.2, CONCRETE_D);
      kit.collider(cx, -sm, 5.2, hsA, 0, bot, dy + 10.3);
    }
  });

  // ---------------- approach piers (steel bents on concrete footings) ----------------
  const bentAt = [];
  for (let s = 18; s < anchors[0] - 22; s += 34) bentAt.push(s);
  for (let s = L - 18; s > anchors[1] + 22; s -= 34) bentAt.push(s);
  for (const s of bentAt) {
    const top = dY(s) - 0.4 - TRUSS_D;
    const gA = gh(s, -11), gB = gh(s, 11);
    if (Math.max(gA, gB) > top - 2.5) continue;
    kit.box('paint', 0, top - 0.6, -s, 29, 1.2, 1.6, ORANGE);
    for (const sg of [-1, 1]) {
      const g = sg < 0 ? gA : gB, gb = Math.max(g, 0);
      kit.boxY('solid', sg * 11, Math.min(g, 0) - 2, gb + 1.5, -s, 4.4, 4.4, CONCRETE);
      kit.boxY('paint', sg * 11, gb + 1.5, top - 0.6, -s, 1.8, 2.6, ORANGE);
      kit.collider(sg * 11, -s, 2.2, 2.2, 0, Math.min(g, 0) - 2, top);
    }
    const gb = Math.max(Math.min(gA, gB), 0) + 1.5;
    for (let y = gb + 3; y < top - 6; y += 12) {
      const y2 = Math.min(top - 1.5, y + 12);
      kit.beam('paint', [-11, y, -s], [11, y2, -s], 0.5, 0.5, ORANGE_D);
      kit.beam('paint', [11, y, -s], [-11, y2, -s], 0.5, 0.5, ORANGE_D);
      kit.box('paint', 0, y2, -s, 22, 0.6, 0.8, ORANGE_D);
    }
  }

  return kit.finish();
}
