// Bay Bridge west (suspension) span: SF anchorage -> 2 towers -> centre anchorage -> 2 towers -> YBI anchorage.
// Bridge frame: local x = lateral l (+ = south-east side), local z = -s, y = world height.
import * as THREE from 'three';
import { BAY_BRIDGE } from '../anchors.js';
import { Kit, shade, loftGeom } from './kit.js';
import { bridgeYaw, makeCableProfile } from './goldenGate.js';

const STEEL = 0x858e95;
const STEEL_D = shade(STEEL, 0.72);
const STEEL_L = shade(STEEL, 1.12);
const CONC = 0xb3aea4;
const CONC_D = 0x8f8b84;

function rectRing(x0, x1, z0, z1) { return [[x1, z1], [x1, z0], [x0, z0], [x0, z1]]; }

export function buildBayBridge({ heightAt = () => 0 } = {}) {
  const br = BAY_BRIDGE;
  const kit = new Kit('bayBridge', { x: br.start[0], z: br.start[1], yaw: bridgeYaw(br), heightAt });
  const P = (s, l, y) => [l, y, -s];
  const gh = (s, l) => kit.h(l, -s);
  const dY = (s) => br.deckY(s);
  const TOP = br.towerTopY, CL = br.cableLateral, EDGE = br.deckWidth / 2;
  const legIn = Math.max(EDGE + 0.3, br.towerLegLateral - 1.2);
  const legOut = br.towerLegLateral + 1.3;
  const TS = br.towersS, CA = br.centerAnchorS, YA = br.ybiAnchorS;
  const TRUSS_L = EDGE - 0.2, TRUSS_D = 9;
  const CA_HALF_S = 34;

  const groundLo = (s, hs, hl) => {
    let lo = Infinity; for (const ds of [-hs, 0, hs]) for (const dl of [-hl, 0, hl]) lo = Math.min(lo, gh(s + ds, dl)); return lo;
  };

  // ---------------- towers (X-braced steel frames) ----------------
  for (const ts of TS) {
    const dy = dY(ts);
    const gLo = groundLo(ts, 12, 20);
    const pierBot = Math.min(gLo, 0) - 4, pierTop = Math.max(gLo, 0) + 6;
    kit.boxY('solid', 0, pierBot, pierTop, -ts, 38, 20, CONC);
    kit.boxY('solid', 0, pierTop, pierTop + 1, -ts, 35, 17, CONC_D);
    kit.collider(0, -ts, 19, 10, 0, pierBot, pierTop + 1);
    const base = pierTop + 1;
    for (const sg of [-1, 1]) {
      const cx = sg * (legIn + legOut) / 2, wx = legOut - legIn;
      // tapered cellular leg in three stacked sections
      const lv = [base, dy - TRUSS_D - 1, 72, TOP];
      for (let k = 0; k < 3; k++) {
        const hs = 2.6 - k * 0.45;
        kit.boxY('steel', cx, lv[k], lv[k + 1], -ts, wx, hs * 2, STEEL);
        for (const f of [-1, 1]) kit.boxY('steel', cx, lv[k], lv[k + 1] - 0.4, -ts + f * (hs + 0.12), wx * 0.35, 0.24, STEEL_L);
        kit.boxY('steel', cx, lv[k + 1] - 0.6, lv[k + 1], -ts, wx + 0.4, hs * 2 + 0.4, STEEL_D);
      }
      // cap + cable saddle
      kit.boxY('steel', cx, TOP, TOP + 2, -ts, wx + 0.8, 5.4, STEEL_D);
      kit.boxY('steel', sg * CL, TOP + 2, TOP + 3.4, -ts, 2.2, 6, STEEL);
      kit.box('blink', cx, TOP + 2.6, -ts, 0.8, 1.2, 0.8, 0xff2a1a, { ecol: [3, 0.25, 0.15] });
      kit.collider(cx, -ts, wx / 2, 2.6, 0, base, TOP + 3.4);
    }
    // struts + X bracing (above the deck clear of traffic, below the deck under the truss)
    const strutY = [dy - TRUSS_D - 1.5, 60, 76, 92, TOP - 1.5];
    for (const y of strutY) {
      kit.box('steel', 0, y, -ts, legIn * 2 + 0.5, 2.2, 3.2, STEEL);
      kit.box('steel', 0, y - 1.2, -ts, legIn * 2 + 0.5, 0.3, 3.6, STEEL_D);
    }
    const xPanels = [[60, 76], [76, 92], [92, TOP - 1.5]];
    const below = dy - TRUSS_D - 1.5;
    const lowMid = (base + below) / 2;
    if (below - base > 10) xPanels.push([base + 1, lowMid], [lowMid, below]);
    for (const [y0, y1] of xPanels) {
      for (const f of [-1.2, 1.2]) {
        kit.beam('steel', [-legIn, y0, -ts + f], [legIn, y1, -ts + f], 0.9, 0.9, STEEL_D);
        kit.beam('steel', [legIn, y0, -ts + f], [-legIn, y1, -ts + f], 0.9, 0.9, STEEL_D);
      }
    }
  }

  // ---------------- anchorages ----------------
  const cableEndH = 16;
  const caFrustum = (sc, hsBot, hsTop, l0, l1b, l1t, yb, yt, sg) => {
    // one side block of the centre anchorage: inner face vertical at l0, outer face tapers l1b -> l1t
    const ringB = sg > 0 ? rectRing(l0, l1b, -sc - hsBot, -sc + hsBot) : rectRing(-l1b, -l0, -sc - hsBot, -sc + hsBot);
    const ringT = sg > 0 ? rectRing(l0, l1t, -sc - hsTop, -sc + hsTop) : rectRing(-l1t, -l0, -sc - hsTop, -sc + hsTop);
    kit.geom('solid', loftGeom(ringB, yb, ringT, yt, { capTop: true }), null, CONC);
  };
  { // centre anchorage
    const dy = dY(CA), gLo = groundLo(CA, CA_HALF_S, 32);
    const bot = Math.min(gLo, 0) - 4;
    const top = dy + cableEndH + 5;
    // base under the road (its top carries the deck)
    kit.geom('solid', loftGeom(rectRing(-33, 33, -CA - CA_HALF_S - 2, -CA + CA_HALF_S + 2), bot, rectRing(-30, 30, -CA - CA_HALF_S, -CA + CA_HALF_S), dy - 0.7, { capTop: true }), null, CONC);
    kit.collider(0, -CA, 33, CA_HALF_S + 2, 0, bot, dy - 0.7);
    for (const sg of [-1, 1]) {
      caFrustum(CA, CA_HALF_S, 22, EDGE + 0.4, 30, 25, dy - 0.7, top, sg);
      kit.boxY('solid', sg * (EDGE + 0.4 + 7), top, top + 1.2, -CA, 15, 46, CONC_D);
      // vertical grooves on the outer face + a banding course at deck level
      const hB = top - (dy - 0.7), lean = Math.atan2(5, hB), lm = 30 - 5 * ((dy + top - 3) / 2 - (dy - 0.7)) / hB;
      for (let k = -3; k <= 3; k++) kit.boxY('solid', sg * (lm - 0.1), dy, top - 3, -CA + k * 5.5, 0.6, 1.4, CONC_D, { rz: sg * lean });
      kit.boxY('solid', sg * (EDGE + 0.4 + 9.5), dy - 1.5, dy + 0.5, -CA, 20, 2 * CA_HALF_S + 1, CONC_D);
      // cable saddle housings on the faces where the cables enter
      for (const f of [-1, 1]) kit.boxY('solid', sg * CL, dy + cableEndH - 3, dy + cableEndH + 3, -(CA + f * 25), 3.2, 3, CONC_D);
      kit.collider(sg * (EDGE + 0.4 + 9.8), -CA, 9.8, CA_HALF_S, 0, dy - 0.7, top + 1.2);
    }
  }
  // end anchorages (SF at s=0 in the water, YBI at ybiAnchorS). Road corridor stays clear above deckY-0.5.
  for (const [as, tw] of [[0, 1], [YA, -1]]) {
    const dy = dY(as);
    const s0 = as - 22 * tw, s1 = as + 16 * tw, sm = (s0 + s1) / 2, hsA = Math.abs(s1 - s0) / 2;
    const gLo = groundLo(sm, hsA, 24);
    const bot = Math.min(gLo, 0) - 3;
    kit.boxY('solid', 0, bot, dy - 0.7, -sm, 46, hsA * 2, CONC);
    kit.collider(0, -sm, 23, hsA, 0, bot, dy - 0.7);
    for (const sg of [-1, 1]) {
      const cx = sg * (EDGE + 0.4 + 5.6);
      kit.boxY('solid', cx, dy - 0.7, dy + 4, -sm, 11.2, hsA * 2, CONC);
      kit.boxY('solid', cx, dy + 4, dy + 4.8, -sm, 12, hsA * 2 + 0.8, CONC_D);
      const se = as + 7 * tw;
      kit.boxY('solid', sg * (EDGE + 0.4 + 3.4), dy + 4.8, dy + 10, -se, 6.8, 13, CONC);
      kit.boxY('solid', sg * (EDGE + 0.4 + 3.4), dy + 10, dy + 10.8, -se, 7.4, 13.8, CONC_D);
      kit.collider(cx, -sm, 5.6, hsA, 0, dy - 0.7, dy + 10.8);
    }
  }

  // ---------------- main cables + suspenders ----------------
  const systems = [
    makeCableProfile([[0, dY(0) + 2], [CA - 22, dY(CA) + cableEndH]], [TS[0], TS[1]], TOP + 2.8, br.cableSagY, 4),
    makeCableProfile([[CA + 22, dY(CA) + cableEndH], [YA, dY(YA) + 2]], [TS[2], TS[3]], TOP + 2.8, br.cableSagY, 4),
  ];
  const ranges = [[0, CA - 22, [TS[0], TS[1]]], [CA + 22, YA, [TS[2], TS[3]]]];
  const ledPts = []; // [l, y, s]
  ranges.forEach(([sa, sb, tws], k) => {
    const cy = systems[k];
    for (const sg of [-1, 1]) {
      let prev = null;
      for (let s = sa; s <= sb + 0.01; s += 6) {
        let ss = s; for (const t of tws) if (Math.abs(s - t) < 3) ss = t;
        const p = P(ss, sg * CL, cy(ss));
        if (prev) kit.rod('steel', prev, p, 0.5, 6, STEEL_D);
        prev = p;
        ledPts.push([sg * CL, cy(ss) + 0.7, ss]);
      }
      const pe = P(sb, sg * CL, cy(sb)); if (prev) kit.rod('steel', prev, pe, 0.5, 6, STEEL_D);
      for (let s = sa + 12; s < sb - 4; s += 12) {
        if (tws.some((t) => Math.abs(s - t) < 4)) continue;
        const yc = cy(s), yd = dY(s) - 0.6;
        if (yc - yd < 1.5) continue;
        kit.box('steel', sg * CL, (yc + yd) / 2, -s, 0.28, yc - yd, 0.28, STEEL_D);
        if (sg < 0) for (let y = yd + 1.5; y < yc - 0.5; y += 1.6) ledPts.push([sg * CL - 0.25, y, s]);
      }
    }
  });

  // ---------------- stiffening truss (double-deck), fascia, lamps ----------------
  const PANEL = 8;
  let pi = 0;
  for (let s = 0; s < br.length - 0.1; s += PANEL, pi++) {
    const s1 = Math.min(br.length, s + PANEL), sm = (s + s1) / 2;
    if (Math.abs(sm - CA) < CA_HALF_S) continue;                      // carried by the centre anchorage
    const gmax = Math.max(gh(sm, 0), gh(sm, -EDGE), gh(sm, EDGE));
    if (gmax > dY(sm) - 1.2) continue;                                 // on grade
    const t0 = dY(s) - 0.4, t1 = dY(s1) - 0.4, b0 = t0 - TRUSS_D, b1 = t1 - TRUSS_D;
    kit.beam('steel', P(s, 0, t0 - 0.45), P(s1, 0, t1 - 0.45), EDGE * 2, 0.9, STEEL_D);   // upper deck underside
    kit.beam('steel', P(s, 0, b0 + 1.6), P(s1, 0, b1 + 1.6), EDGE * 2 - 1, 0.7, STEEL_D); // lower deck slab
    for (const sg of [-1, 1]) {
      const l = sg * TRUSS_L;
      kit.beam('steel', P(s, sg * (EDGE + 0.05), t0 - 0.7), P(s1, sg * (EDGE + 0.05), t1 - 0.7), 0.25, 1.2, STEEL); // fascia, top at deckY-0.5
      kit.beam('steel', P(s, l, t0 - 0.7), P(s1, l, t1 - 0.7), 0.7, 1.1, STEEL);
      kit.beam('steel', P(s, l, b0 + 0.5), P(s1, l, b1 + 0.5), 0.8, 1.0, STEEL);
      kit.beam('steel', P(s, l, t0 - 0.7), P(s, l, b0 + 0.5), 0.6, 0.6, STEEL_D);
      if (pi % 2) kit.beam('steel', P(s, l, t0 - 0.9), P(s1, l, b1 + 0.7), 0.45, 0.45, STEEL_D);
      else kit.beam('steel', P(s, l, b0 + 0.7), P(s1, l, t1 - 0.9), 0.45, 0.45, STEEL_D);
    }
    kit.beam('steel', P(s, -TRUSS_L, b0 + 0.3), P(s, TRUSS_L, b0 + 0.3), 0.5, 0.5, STEEL_D);
    if (pi % 3 === 0) {
      const sp = sm, sg = (pi % 2) ? 1 : -1, y = dY(sp) - 0.3, l = sg * (EDGE - 0.3);
      kit.boxY('steel', l, y, y + 5.5, -sp, 0.24, 0.24, STEEL_D);
      kit.box('steel', l - sg * 0.6, y + 5.45, -sp, 1.2, 0.14, 0.14, STEEL_D);
      kit.box('glow', l - sg * 1.1, y + 5.25, -sp, 0.45, 0.3, 0.7, 0xe9e2cf, { ecol: [2.2, 1.9, 1.4] });
    }
  }

  // ---------------- the Bay Lights (LED points; twinkle at night) ----------------
  const n = ledPts.length;
  const pos = new Float32Array(n * 3), colA = new Float32Array(n * 3), meta = new Float32Array(n * 3);
  ledPts.forEach(([l, y, s], i) => {
    pos[i * 3] = l; pos[i * 3 + 1] = y; pos[i * 3 + 2] = -s;
    meta[i * 3] = s; meta[i * 3 + 1] = y; meta[i * 3 + 2] = Math.random() * 6.283;
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  pg.computeBoundingSphere();
  const pm = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  pm.name = 'lm-baylights';
  const pts = new THREE.Points(pg, pm);
  pts.name = 'bayBridge:bayLights'; pts.visible = false; pts.frustumCulled = true;
  kit.add(pts);
  let acc = 0;
  kit.onUpdate((dt, env) => {
    const night = env.night || 0, t = env.time || 0;
    pts.visible = night > 0.02;
    if (!pts.visible) return;
    pm.opacity = Math.min(1, night * 1.2);
    acc += dt || 0.016; if (acc < 1 / 30) return; acc = 0;         // 30 Hz is plenty
    const ca = pg.attributes.color.array;
    for (let i = 0; i < n; i++) {
      const s = meta[i * 3], y = meta[i * 3 + 1], ph = meta[i * 3 + 2];
      const wave = 0.5 + 0.5 * Math.sin(s * 0.03 - t * 1.1 + y * 0.05);
      const wave2 = 0.5 + 0.5 * Math.sin(s * 0.011 + t * 0.45 - y * 0.12);
      let b = 0.12 + 0.88 * Math.pow(wave * wave2, 1.6);
      b += 0.35 * Math.max(0, Math.sin(t * 3.1 + ph * 7.0) - 0.85) * 6.6; // sparkle
      ca[i * 3] = b; ca[i * 3 + 1] = b; ca[i * 3 + 2] = b * 0.96;
    }
    pg.attributes.color.needsUpdate = true;
  });

  return kit.finish();
}
