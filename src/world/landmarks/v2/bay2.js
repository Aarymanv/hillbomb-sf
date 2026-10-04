// San Francisco-Oakland Bay Bridge, west (suspension) span, real scale on the v2 map.
// Axis SF (2525.8,-1254.6) -> YBI (4590.8,-3682.5) (BAY2 in anchors2.js). s = metres from the SF end, l = lateral.
// Two back-to-back suspension bridges (main spans 704 m, side spans 353 m) sharing the W4 centre anchorage:
// W1 SF anchorage s 296 | W2 649 | W3 1372 | W4 1750 | W5 2128 | W6 2831 | W7 YBI anchorage 3184 (piers from the bake).
// Double deck: upper (westbound) and lower (eastbound) stacked 9.5 m apart; YBI tunnel portals at s ~3316.
// The Bay Lights: LED strands on every suspender, animated at night.
import * as THREE from 'three';
import { Kit, shade, archGeom } from '../kit.js';
import { BAY2 } from '../../v2/anchors2.js';
import { weather, railTexture, quadUV } from './mats2.js';
import { finishWithDetail } from './gg2.js';

const GREY = 0x9ea5a8, GREY_D = shade(GREY, 0.72), GREY_L = shade(GREY, 1.1);
const CONC = 0xb9b4aa, CONC_D = 0x99948a, CONC_L = 0xcac5b9;
export const BAY_PIERS = { W1: 296, W2: 649, W3: 1372, W4: 1750, W5: 2128, W6: 2831, W7: 3184, portal: 3316 };
const TOWER_TOP = 158, CL = 10.6;

function frame() {
  const [ax, az] = BAY2.sf, [bx, bz] = BAY2.ybi, L = Math.hypot(bx - ax, bz - az);
  return { O: [ax, az], d: [(bx - ax) / L, (bz - az) / L], L };
}
export function bayS(x, z) { const { O, d } = frame(); return (x - O[0]) * d[0] + (z - O[1]) * d[1]; }
function bayL(x, z) { const { O, d } = frame(); return -(x - O[0]) * d[1] + (z - O[1]) * d[0]; }

// upper / lower deck road heights sampled from the baked graph (layer >= 2 = upper)
export function bayProfiles(graph) {
  const up = new Map(), lo = new Map();
  for (const e of graph?.edges || []) {
    if (!e.deck) continue;
    for (let k = 0; k < e.pts.length; k++) {
      const [x, z] = e.pts[k], s = bayS(x, z), l = bayL(x, z);
      if (s < -30 || s > 3330 || Math.abs(l) > 8) continue;
      const M = e.layer >= 2 ? up : lo, b = Math.round(s / 6), r = M.get(b) || [0, 0];
      r[0] += e.ys[k]; r[1]++; M.set(b, r);
    }
  }
  const mk = (M, fb) => {
    const keys = [...M.keys()].sort((a, b) => a - b);
    if (keys.length < 10) return fb;
    const S = keys.map(k => k * 6), Y = keys.map(k => M.get(k)[0] / M.get(k)[1]);
    return (s) => {
      if (s <= S[0]) return Y[0]; if (s >= S[S.length - 1]) return Y[Y.length - 1];
      let a = 0, b = S.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (S[m] <= s) a = m; else b = m; }
      return Y[a] + (Y[b] - Y[a]) * (s - S[a]) / (S[b] - S[a]);
    };
  };
  const upper = mk(up, s => 40 + 24 * Math.min(1, Math.max(0, s / 649)));
  const lower = mk(lo, s => upper(s) - 9.5);
  return { upper, lower };
}

// animated LED material for the Bay Lights (world-space travelling patterns, only at night)
function bayLightsMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4, emissive: 0xfff4e6, emissiveIntensity: 0 });
  const U = { uT: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = U.uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBL;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBL = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uT; varying vec3 vBL;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // The Bay Lights, gentle version: slow travelling swells + a slow per-LED shimmer. Everything eases (no steps, no
  // flashes): the fastest component has a ~9 s period and the brightness stays within 0.4-1.1 (low contrast).
  float s = dot(vBL.xz, vec2(0.6479, -0.7617));
  float a = 0.5 + 0.5 * sin(s * 0.02 - uT * 0.32 + vBL.y * 0.05);
  float b = 0.5 + 0.5 * sin(s * 0.006 + uT * 0.13);
  float h = fract(sin(dot(floor(vBL.xz * 0.11) + floor(vBL.y * 0.6), vec2(12.9898, 78.233))) * 43758.5453);
  float tw = 0.5 + 0.5 * sin(uT * (0.25 + 0.45 * h) + h * 6.2832);
  totalEmissiveRadiance *= 0.4 + 0.5 * a * b + 0.2 * tw;
}`);
  };
  m.customProgramCacheKey = () => 'bay-lights';
  m.name = 'lm-bay-lights';
  return { m, U };
}

export function buildBayBridge2({ heightAt, graph }) {
  const { O, d } = frame();
  const kit = new Kit('bayBridge2', { x: O[0], z: O[1], yaw: Math.atan2(-d[0], -d[1]), heightAt });
  const { upper: yU, lower: yL } = bayProfiles(graph);
  const LC = 0.45;                                   // deck centreline lateral offset (baked upper deck)
  const P = (s, l, y) => [l + LC, y, -s];
  const gh = (s, l) => kit.h(l + LC, -s);
  const W = BAY_PIERS;
  const BL = bayLightsMaterial(); kit.register('baylights', BL.m, { castShadow: false });
  const railMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  kit.register('rail', railMat, { castShadow: false });
  const towerMat = weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, emissive: 0xdde6ff, emissiveIntensity: 0 }), { strength: 0.45, streak: 0.5, key: 'bayt' });
  kit.register('tower', towerMat, {});
  const dkeys = new Set();
  const D = (s) => { const k = `d${Math.max(0, Math.floor(s / 450))}`; dkeys.add(k); return k; };

  // ----------------------------------------------------------------------------------------------- towers W2 W3 W5 W6
  for (const ts of [W.W2, W.W3, W.W5, W.W6]) {
    const up = yU(ts), lo = yL(ts);
    const g = Math.min(gh(ts, -25), gh(ts, 25), gh(ts, 0));
    const bot = Math.min(g, 0) - 8, top = 9;
    kit.boxY('solid', 0, bot, top - 1.5, -ts, 58, 30, CONC);
    kit.boxY('solid', 0, top - 1.5, top, -ts, 55, 27, CONC_D);
    for (const sg of [-1, 1]) kit.boxY('solid', sg * 15, top, top + 4, -ts, 10, 13, CONC_L);
    kit.collider(LC, -ts, 29, 15, 0, bot, top);
    const base = top + 4, lb = 15, lt = CL;
    for (const sg of [-1, 1]) {
      // inclined leg (cellular steel): tapering box beams between set-backs
      const segs = [[base, lo - 4], [lo - 4, up + 6], [up + 6, up + 40], [up + 40, up + 70], [up + 70, TOWER_TOP - 6], [TOWER_TOP - 6, TOWER_TOP]];
      for (let i = 0; i < segs.length; i++) {
        const [y0, y1] = segs[i], t0 = (y0 - base) / (TOWER_TOP - base), t1 = (y1 - base) / (TOWER_TOP - base);
        const l0 = sg * (lb + (lt - lb) * t0), l1 = sg * (lb + (lt - lb) * t1);
        const w = 5.4 - 1.6 * (t0 + t1) / 2, dd = 8.6 - 3 * (t0 + t1) / 2;
        kit.beam('tower', P(ts, l0, y0), P(ts, l1, y1), w, dd, GREY, { up: [0, 0, 1] });
        kit.beam('tower', P(ts, l0, y0 + 0.4), P(ts, l1, y1 - 0.4), w * 0.42, dd + 0.5, GREY_L, { up: [0, 0, 1] });
        kit.box('tower', l1 + LC, y1 - 0.4, -ts, w + 0.8, 0.8, dd + 0.8, GREY_D);
      }
      kit.boxY('tower', sg * lt + LC, TOWER_TOP, TOWER_TOP + 3, -ts, 3.4, 7.5, GREY_D);
      kit.box('blink', sg * lt + LC, TOWER_TOP + 3.8, -ts, 0.9, 1.1, 0.9, 0xff2a1a, { ecol: [4, 0.3, 0.2] });
      kit.collider(sg * (lb - 1) + LC, -ts, 3.6, 4.6, 0, base, up + 10);
    }
    // bracing: X panels above the upper deck and below the lower deck, horizontal struts at each panel top
    const legL = (y) => lb + (lt - lb) * (y - base) / (TOWER_TOP - base);
    const panel = (y0, y1) => {
      for (const f of [-1, 1]) {
        const z = -ts + f * 2.6;
        kit.beam('tower', [-legL(y0) + LC, y0, z], [legL(y1) + LC, y1, z], 1.1, 1.3, GREY_D);
        kit.beam('tower', [legL(y0) + LC, y0, z], [-legL(y1) + LC, y1, z], 1.1, 1.3, GREY_D);
      }
      kit.boxY('tower', LC, y1 - 2.2, y1, -ts, legL(y1) * 2, 6.4, GREY);
    };
    panel(up + 6, up + 40); panel(up + 40, up + 70); panel(up + 70, TOWER_TOP - 6);
    kit.boxY('tower', LC, TOWER_TOP - 6, TOWER_TOP, -ts, lt * 2, 7, GREY);
    if (lo - 6 - base > 12) panel(base + 2, lo - 6);
  }

  // ----------------------------------------------------------------------------------------------- anchorages W1 W4 W7
  function anchorage(sa, { cablesBoth = false, h = 22 } = {}) {
    const up = yU(sa), lo = yL(sa);
    let g = Infinity; for (const l of [-30, 0, 30]) for (const ds of [-16, 0, 16]) g = Math.min(g, gh(sa + ds, l));
    const bot = Math.min(g, 0) - 6, topY = up + h;
    // base under the lower deck
    kit.boxY('solid', 0, bot, lo - 3, -sa, 62, 34, CONC);
    kit.collider(LC, -sa, 31, 17, 0, bot, lo - 3);
    // side walls with Art Deco grooves + stepped top, bridge over the upper deck
    for (const sg of [-1, 1]) {
      kit.boxY('solid', sg * 21.5, lo - 3, topY, -sa, 19, 34, CONC);
      for (let r = 0; r < 5; r++) for (const f of [-1, 1]) kit.boxY('solid', sg * (13.5 + r * 4), lo, topY - 3, -sa + f * 17.2, 1.2, 0.5, CONC_L);
      kit.boxY('solid', sg * 21.5, topY, topY + 3, -sa, 16, 30, CONC_L);
      kit.boxY('solid', sg * 21.5, topY + 3, topY + 5, -sa, 12, 24, CONC);
      kit.collider(sg * 21.5 + LC, -sa, 9.5, 17, 0, bot, topY + 5);
    }
    kit.boxY('solid', 0, up + 7.5, topY, -sa, 24, 34, CONC);
    kit.boxY('solid', 0, topY, topY + 1.5, -sa, 26, 30, CONC_D);
    for (const f of cablesBoth ? [-1, 1] : [1]) for (const sg of [-1, 1]) kit.box('glow', sg * 12.3, up + 4, -sa + f * 17.3, 0.6, 3, 0.2, 0xe8dcc0, { ecol: [2.4, 1.7, 0.9] });
    return topY;
  }
  const aTop = { W1: anchorage(W.W1), W4: anchorage(W.W4, { cablesBoth: true, h: 26 }), W7: anchorage(W.W7) };

  // ----------------------------------------------------------------------------------------------- cables + suspenders
  const spans = [[W.W1, W.W2, W.W3, W.W4, aTop.W1, aTop.W4], [W.W4, W.W5, W.W6, W.W7, aTop.W4, aTop.W7]];
  for (const [a, t1, t2, b, ya, yb] of spans) {
    const sad = TOWER_TOP + 1.5, mid = (t1 + t2) / 2, sag = yU(mid) + 3.5;
    const cy = (s) => {
      if (s <= t1) { const t = (s - a) / (t1 - a); return ya - 2 + (sad - ya + 2) * t - 4 * 6 * t * (1 - t); }
      if (s >= t2) { const t = (s - t2) / (b - t2); return sad + (yb - 2 - sad) * t - 4 * 6 * t * (1 - t); }
      const u = (s - mid) / ((t2 - t1) / 2); return sag + (sad - sag) * u * u;
    };
    for (const sg of [-1, 1]) {
      const st = []; for (let s = a + 17; s < b - 17; s += 8) st.push(s); st.push(a + 17, b - 17, t1, t2); st.sort((p, q) => p - q);
      let prev = null;
      for (const s of st) { const p = P(s, sg * CL, cy(s)); if (prev && Math.abs(prev[2] + s) > 0.01) kit.rod('paint', prev, p, 0.47, 10, GREY); prev = p; }
      for (let s = a + 22; s < b - 20; s += 9.15) {
        if (Math.abs(s - t1) < 6 || Math.abs(s - t2) < 6) continue;
        const yc = cy(s), yd = yU(s) + 0.2; if (yc - yd < 1) continue;
        for (const o of [-0.3, 0.3]) kit.rod('baylights', P(s + o, sg * CL, yd), P(s + o, sg * CL, yc - 0.2), 0.07, 4, GREY_D);
        // cable band (tangent-aligned clamp) + suspender saddle; anchor socket on the deck chord
        kit.rod(D(s), P(s - 0.55, sg * CL, cy(s - 0.55)), P(s + 0.55, sg * CL, cy(s + 0.55)), 0.64, 8, GREY_D);
        kit.box(D(s), sg * CL + LC, yc - 0.55, -s, 0.45, 0.5, 1.2, GREY_D);
        kit.box(D(s), sg * CL + LC, yd + 0.2, -s, 0.5, 0.4, 1.1, GREY_D);
      }
    }
  }

  // ----------------------------------------------------------------------------------------------- double-deck truss
  const PAN = 9.15, s0 = 60, s1 = W.W7 + 14;
  let pi = 0;
  for (let s = s0; s < s1; s += PAN, pi++) {
    const sb = Math.min(s1, s + PAN);
    if ([W.W1, W.W4, W.W7].some(a => s + PAN > a - 17 && s < a + 17)) continue;   // passes through the anchorages
    const k = D(s);
    const ua = yU(s) - 0.35, ub = yU(sb) - 0.35, la = yL(s) - 0.35, lb2 = yL(sb) - 0.35;
    // slabs: upper slab (the lower deck's ceiling) + lower slab
    kit.beam('solid', P(s, 0, ua - 0.55), P(sb, 0, ub - 0.55), CL * 2, 1.1, 0x8d8a84);
    kit.beam('solid', P(s, 0, la - 0.6), P(sb, 0, lb2 - 0.6), CL * 2, 1.2, 0x8d8a84);
    for (const sg of [-1, 1]) {
      const l = sg * CL;
      kit.beam('paint', P(s, l, ua), P(sb, l, ub), 0.9, 1.2, GREY);                      // top chord
      kit.beam('paint', P(s, l, la - 1.4), P(sb, l, lb2 - 1.4), 1.0, 1.6, GREY);        // bottom chord
      kit.beam('paint', P(s, l, la - 0.8), P(sb, l, lb2 - 0.8), 0.6, 0.8, GREY_D);      // lower deck edge girder
      kit.beam(k, P(s, l, ua), P(s, l, la - 1.4), 0.6, 0.8, GREY_D);                    // post
      kit.beam(k, P(s, l, pi % 2 ? ua : la - 1.4), P(sb, l, pi % 2 ? lb2 - 1.4 : ub), 0.5, 0.7, GREY_D);
      // parapet rails on the upper deck edge
      const g = quadUV(P(s, sg * (CL - 0.3), ua + 0.35), P(sb, sg * (CL - 0.3), ub + 0.35), P(sb, sg * (CL - 0.3), ub + 1.4), P(s, sg * (CL - 0.3), ua + 1.4), PAN / 1.2);
      kit.geom('rail', g, null, GREY_L);
    }
    kit.beam(k, P(s, -CL, la - 2), P(sb, CL, lb2 - 2), 0.4, 0.4, GREY_D);                // bottom lateral
    // lower deck ceiling lights (fluorescent strips on the upper slab's underside)
    if (pi % 2 === 0) for (const o of [-4.5, 4.5]) kit.box('glow', o + LC, ua - 1.15, -(s + PAN / 2), 0.35, 0.1, 3.2, 0xdad6c8, { ecol: [1.6, 1.7, 1.5] });
  }
  // upper deck light standards (sodium) every 45.75 m, both sides
  for (let s = s0 + 20; s < s1 - 10; s += 45.75) {
    if ([W.W2, W.W3, W.W5, W.W6].some(t => Math.abs(s - t) < 10) || [W.W1, W.W4, W.W7].some(a => Math.abs(s - a) < 20)) continue;
    const k = D(s), y = yU(s);
    for (const sg of [-1, 1]) {
      const l = sg * (CL - 0.6);
      kit.boxY(k, l + LC, y, y + 9, -s, 0.28, 0.28, GREY_D);
      kit.beam(k, [l + LC, y + 8.9, -s], [l - sg * 2 + LC, y + 9.2, -s], 0.16, 0.16, GREY_D);
      kit.box('glow', l - sg * 2.3 + LC, y + 9.05, -s, 0.5, 0.25, 0.8, 0xe8dcc0, { ecol: [3.2, 1.9, 0.7] });
    }
  }
  // approach bents over Rincon Hill / the Embarcadero (s 60 .. W1)
  for (let s = 80; s < W.W1 - 25; s += 48) {
    const lo = yL(s) - 3.2;
    const gs = [-1, 1].map(sg => gh(s, sg * (CL + 1)));
    for (const sg of [-1, 1]) {
      const g0 = gs[(sg + 1) / 2];
      kit.boxY('solid', sg * (CL + 1) + LC, g0 - 1.5, g0 + 1, -s, 3.4, 3.4, CONC);
      kit.boxY('paint', sg * (CL + 1) + LC, g0 + 1, lo, -s, 1.6, 2.4, GREY);
      kit.collider(sg * (CL + 1) + LC, -s, 1.7, 1.7, 0, g0 - 1.5, lo);
    }
    kit.boxY('paint', LC, lo - 1.4, lo, -s, CL * 2 + 3.5, 2.2, GREY);
  }

  // ----------------------------------------------------------------------------------------------- YBI tunnel portals
  {
    const sp = W.portal, up = yU(sp), lo = yL(sp);
    const g = Math.min(gh(sp, -20), gh(sp, 20));
    const baseY = Math.min(g, lo) - 3, crown = lo + 18.5;
    // portal face: wall with an arched opening (23 m wide, 17.7 m high), Art Deco surround, stepped parapet
    const arch = archGeom(23, crown - (lo - 0.6), 12);
    const wallW = 58, wallTop = crown + 9;
    const shape = new THREE.Shape();
    shape.moveTo(-wallW / 2, 0); shape.lineTo(wallW / 2, 0); shape.lineTo(wallW / 2, wallTop - baseY); shape.lineTo(-wallW / 2, wallTop - baseY); shape.lineTo(-wallW / 2, 0);
    const hole = new THREE.Path(); const r = 11.5, hb = lo - 0.6 - baseY, hh = crown - baseY;
    hole.moveTo(-r, hb); hole.lineTo(r, hb); hole.lineTo(r, hh - r); hole.absarc(0, hh - r, r, 0, Math.PI, false); hole.lineTo(-r, hb);
    shape.holes.push(hole);
    const face = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 16 });
    face.translate(0, 0, -2);
    kit.place('solid', face, LC, baseY, -sp, CONC, { yaw: 0 });
    void arch;
    // surround ribs + parapet steps
    for (const sg of [-1, 1]) {
      kit.boxY('solid', sg * 14.5 + LC, baseY, crown + 6, -(sp - 2.6), 3.2, 1.4, CONC_L);
      kit.boxY('solid', sg * 26 + LC, baseY, wallTop + 2, -(sp - 1.5), 6, 5, CONC_L);
      kit.collider(sg * 20 + LC, -sp, 9, 2.5, 0, baseY, wallTop + 2);
    }
    kit.boxY('solid', LC, wallTop, wallTop + 1.4, -(sp - 1.2), wallW - 6, 4.6, CONC_L);
    kit.boxY('solid', LC, wallTop + 1.4, wallTop + 2.6, -(sp - 1.2), 20, 3.6, CONC);
    // the upper deck slab spanning the bore + portal lamps
    kit.boxY('solid', LC, up - 1.4, up - 0.3, -(sp - 2), 23, 4, 0x8d8a84);
    for (const sg of [-1, 1]) {
      kit.box('glow', sg * 9 + LC, up + 5, -(sp - 2.4), 1, 1.2, 0.4, 0xe8dcc0, { ecol: [3, 2, 1] });
      kit.box('glow', sg * 9 + LC, lo + 4.5, -(sp - 2.4), 1, 1.2, 0.4, 0xe8dcc0, { ecol: [3, 2, 1] });
    }
    // dark bore interior (so the arch reads as a deep tunnel from outside)
    kit.boxY('solid', LC, lo - 0.6, crown - 1, -(sp + 14), 22.6, 24, 0x1c1c1e);
  }

  for (const k of dkeys) kit.custom.set(k, { material: null, emissive: false, castShadow: false, receiveShadow: true, detailOf: 'paint' });
  const res = finishWithDetail(kit);
  const up0 = res.update;
  res.update = (dt, env = {}) => {
    up0(dt, env);
    const n = env.night || 0;
    BL.m.emissiveIntensity = n * 2.4; BL.U.uT.value = env.time || 0;
    towerMat.emissiveIntensity = n * 0.05;
  };
  res.profiles = { upper: yU, lower: yL };
  return res;
}
