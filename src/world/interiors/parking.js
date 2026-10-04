// SOMA PARK & RIDE: a four-level open-deck parking garage + roof, drivable end to end.
// Split-lane layout (local frame, front = King St on -Z): two 6.2 m ramp lanes along the long sides, parking in the
// middle. Up-ramps alternate lanes (E lane: 0->1, 2->3 heading +Z; W lane: 1->2, 3->4 heading -Z); every floor
// has a hole over the ramp that comes up through it. Floors and ramps are terrain decks, walls are colliders.
// Roof: open deck with light masts, a kicker + landing ramp and the city view. Lift in the SW corner (E: pick a floor).
import { Kit, PAT } from './kit.js';
import { outerFace, wbox } from './arch.js';
import * as F from './furniture.js';
import { neon, text, FONT } from './atlas.js';
import { buildCarProxy, getModelSpec } from '../../vehicle/models.js';
import * as THREE from 'three';

export const FLOOR_PAD = 0.2;
const HX = 16.2, HZ = 23.2, T = 0.3, XI = HX - T, ZI = HZ - T;
const LV = 3.2, NL = 4, ROOF = NL * LV, SLAB = 0.3;
const LANE = 9.7, SPINE = 9.6, RZ = 13;            // lanes |x| > 9.7, spine walls at |x| = 9.6, ramps z in [-13, 13]
const ENT = [-8.0, 4.0];                              // entrance gap in the north wall (x)
const CORE = { x0: -XI, x1: -12.3, z0: 19.3, z1: ZI };
const Y = k => k * LV;
// surface lot = the parts of the replaced generic lots that the garage does not cover (local axis-aligned rects)
function leftovers(S) {
  if (S._left) return S._left;
  const out = [], G = [-HX, -HZ, HX, HZ];
  for (const l of S.covered || []) {
    const [lx, lz] = S.l(l.x, l.z);
    let dy = l.yaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (Math.abs(Math.sin(2 * dy)) > 0.15) continue;                  // not aligned with the garage grid
    const q = Math.abs(Math.sin(dy)) > 0.7, ahx = q ? l.hz : l.hx, ahz = q ? l.hx : l.hz;
    const R = [lx - ahx, lz - ahz, lx + ahx, lz + ahz];
    const parts = [];
    if (R[0] < G[0]) parts.push([R[0], R[1], Math.min(R[2], G[0]), R[3]]);
    if (R[2] > G[2]) parts.push([Math.max(R[0], G[2]), R[1], R[2], R[3]]);
    const x0 = Math.max(R[0], G[0]), x1 = Math.min(R[2], G[2]);
    if (x1 > x0) { if (R[1] < G[1]) parts.push([x0, R[1], x1, Math.min(R[3], G[1])]); if (R[3] > G[3]) parts.push([x0, Math.max(R[1], G[3]), x1, R[3]]); }
    for (const r of parts) if (r[2] - r[0] > 2.5 && r[3] - r[1] > 2.5 && r[1] > -HZ - 1.5) out.push(r);  // never on the street side
  }
  return (S._left = out);
}
const holeLane = k => (k % 2 === 1 ? 'E' : 'W');     // level k (>=1) has a hole over the lane of ramp (k-1)->k
const laneX = L => (L === 'E' ? [LANE, XI] : [-XI, -LANE]);

export function setup(S) {
  const TOP = ROOF + 1.2;
  // ---- perimeter (north wall split around the entrance)
  S.box(-HX, -HZ, ENT[0], -ZI, S.baseY, TOP); S.box(ENT[1], -HZ, HX, -ZI, S.baseY, TOP); S.box(ENT[0], -HZ, ENT[1], -ZI, 3.0, TOP);
  S.box(-HX, ZI, HX, HZ, S.baseY, TOP); S.box(-HX, -HZ, -XI, HZ, S.baseY, TOP); S.box(XI, -HZ, HX, HZ, S.baseY, TOP);
  // ---- ramps: spine walls, end walls under the high end, drop barriers at the low end of each hole
  for (let k = 0; k < NL; k++) {
    const L = k % 2 === 0 ? 'E' : 'W', [x0, x1] = laneX(L), sx = L === 'E' ? SPINE : -SPINE;
    const zLo = L === 'E' ? -RZ : RZ, zHi = -zLo;
    S.box(sx - 0.12, -RZ, sx + 0.12, RZ, Y(k) - 0.3, Y(k + 1) + 1.1);
    S.box(x0, zHi - 0.15, x1, zHi + 0.15, Y(k) - 0.3, Y(k + 1) - 0.35);
    S.box(x0, zLo - 0.12, x1, zLo + 0.12, Y(k + 1) - 0.2, Y(k + 1) + 1.1);
    S.ramp([(x0 + x1) / 2, zLo, Y(k)], [(x0 + x1) / 2, zHi, Y(k + 1)], x1 - x0, 'ramp' + k);
  }
  // ---- columns (through all levels) + lift core
  for (const x of [-4.6, 4.6]) for (const z of [-12.15, -4.05, 4.05, 12.15]) S.box(x - 0.3, z - 0.3, x + 0.3, z + 0.3, -1, ROOF);
  S.box(CORE.x0, CORE.z0, CORE.x1, CORE.z1, -1, ROOF + 3.2);
  // ---- floors: ground (full) + upper levels minus the hole over the ramp below
  S.floor(-XI, -HZ - 0.05, XI, ZI, 0, 'L0');
  for (let k = 1; k <= NL; k++) for (const r of slabRects(k)) S.floor(r[0], r[1], r[2], r[3], Y(k), 'L' + k);
  // apron from the street up into the entrance
  const g = S.groundLocal((ENT[0] + ENT[1]) / 2, -HZ - 3.2);
  S.ramp([(ENT[0] + ENT[1]) / 2, -HZ - 3.2, Math.min(-0.01, g + 0.02)], [(ENT[0] + ENT[1]) / 2, -HZ, 0], ENT[1] - ENT[0], 'apron');
  // ---- roof kicker + landing (middle aisle, heading +Z)
  S.ramp([0, -9.5, ROOF], [0, -6.2, ROOF + 1.05], 3.4, 'kicker');
  S.ramp([0, 4.8, ROOF + 1.0], [0, 10.5, ROOF], 4.2, 'landing');
  // ---- camera ceilings: underside of every slab above
  for (let k = 1; k <= NL; k++) for (const r of slabRects(k)) S.ceiling(r[0], r[1], r[2], r[3], Y(k) - SLAB);
  S.volume(-XI, 0, -ZI, XI, ROOF - 0.4, ZI, { name: 'garage' });
  // ---- parked cars (garage + surface lot) are solid
  for (const sp of parkedSpots(S)) {
    const spec = safeSpec(sp.id), hx = spec.width / 2, hz = spec.length / 2;
    const c = Math.abs(Math.sin(sp.yaw)) > 0.5;
    S.box(sp.x - (c ? hz : hx), sp.z - (c ? hx : hz), sp.x + (c ? hz : hx), sp.z + (c ? hx : hz), sp.y - 0.2, sp.y + spec.height);
  }
  // ---- lift: pick a floor
  for (let k = 0; k <= NL; k++) {
    S.interact([CORE.x1 + 0.9, Y(k), (CORE.z0 + CORE.z1) / 2], {
      r: 1.6, prompt: () => `<b>Lift</b>${k === NL ? 'Roof' : k === 0 ? 'Street level' : 'Level ' + (k + 1)} · Press <kbd>E</kbd> to pick a floor`,
      use: () => liftMenu(S, k),
    });
  }
}
function slabRects(k) {
  const H = holeLane(k), [hx0, hx1] = laneX(H);
  const rects = [];
  if (H === 'E') { rects.push([-XI, -ZI, hx0, ZI]); rects.push([hx0, -ZI, XI, -RZ]); rects.push([hx0, RZ, XI, ZI]); }
  else { rects.push([hx1, -ZI, XI, ZI]); rects.push([-XI, -ZI, hx1, -RZ]); rects.push([-XI, RZ, hx1, ZI]); }
  return rects;
}
function liftMenu(S, cur) {
  const ctx = S.ctx;
  const items = [];
  for (let k = NL; k >= 0; k--) items.push({
    label: k === NL ? 'Roof' : k === 0 ? 'Street level' : 'Level ' + (k + 1), sub: k === cur ? 'You are here' : k === NL ? 'Open deck, city view, kicker ramp' : '', disabled: k === cur,
    act: () => { ctx.UI.close(true); ctx.fade(() => { const p = S.wp(CORE.x1 + 1.2, Y(k), (CORE.z0 + CORE.z1) / 2); ctx.teleport(p.x, p.y + 0.2, p.z, S.yaw - Math.PI / 2); }); },
  });
  items.push({ label: 'Cancel', act: () => ctx.UI.close() });
  ctx.UI.show({ name: 'lift', title: 'Lift', kicker: 'SOMA PARK & RIDE', items });
}

// ------------------------------------------------------------------ build
export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas); S._reg = reg;
  const rooms = [];
  for (let l = 0; l < NL; l++) rooms.push(k.addRoom(-XI, Y(l), -ZI, XI, Y(l + 1) - SLAB, ZI, { amb: [0.16, 0.17, 0.18], indirect: 0.55, fall: 0.6, ao: 0.6 }));
  const CONC = 0x9d9a93, CONC_D = 0x7f7c76, CEILC = 0xb9b6ae, PAINT_W = 0xf1efe8, PAINT_Y = 0xf2c14e;

  // ================================================================ facade + perimeter walls
  k.room(-1);
  const WN = { axis: 'z', out: -HZ, inn: -ZI, u0: -HX, u1: HX }, WS = { axis: 'z', out: HZ, inn: ZI, u0: -HX, u1: HX };
  const WEa = { axis: 'x', out: HX, inn: XI, u0: -HZ, u1: HZ }, WWe = { axis: 'x', out: -HX, inn: -XI, u0: -HZ, u1: HZ };
  // openings: level 0 entrance; each upper storey has a continuous open band between parapet and downstand
  const band = (u0, u1) => { const h = []; for (let l = 1; l < NL; l++) h.push([u0, u1, Y(l) + 1.15, Y(l + 1) - 0.95]); h.push([u0, u1, 1.3, LV - 0.95]); return h; };
  const nHoles = [[ENT[0], ENT[1], 0, 3.0], ...band(-HX + 0.6, ENT[0] - 0.4).filter(h => h[2] < 3), ...band(ENT[1] + 0.4, HX - 0.6).filter(h => h[2] < 3), ...band(-HX + 0.6, HX - 0.6).filter(h => h[2] > 3)];
  const sideHoles = (u0, u1) => band(u0, u1);
  k.tex('concrete_rough', CONC, 0.95);
  outerFace(k, WN, S.baseY, ROOF + 1.1, nHoles, 2);
  outerFace(k, WS, S.baseY, ROOF + 1.1, sideHoles(-HX + 0.6, HX - 0.6), 2);
  outerFace(k, WEa, S.baseY, ROOF + 1.1, sideHoles(-HZ + 0.6, HZ - 0.6), 2);
  outerFace(k, WWe, S.baseY, ROOF + 1.1, sideHoles(-HZ + 0.6, CORE.z0 - 0.6), 2);
  // inner faces + reveals of the bands (the concrete thickness)
  for (const W of [WN, WS, WEa, WWe]) {
    const hs = W === WN ? nHoles : W === WWe ? sideHoles(-HZ + 0.6, CORE.z0 - 0.6) : W === WEa ? sideHoles(-HZ + 0.6, HZ - 0.6) : sideHoles(-HX + 0.6, HX - 0.6);
    for (const h of hs) {
      const lvl = Math.max(0, Math.min(NL - 1, Math.floor(h[2] / LV)));
      k.room(rooms[lvl]); k.c(CONC, 0.85, 0, PAT.CONCRETE, 0.6);
      revealAll(k, W, h);
    }
    for (let l = 0; l < NL; l++) {
      k.room(rooms[l]); k.tex('concrete_rough', CONC_D, 0.95);
      if (W.axis === 'z') k.wallZ(W.inn, -XI, XI, Y(l), Y(l + 1) - SLAB, Math.sign(W.inn - W.out), hs.filter(h => h[3] > Y(l) && h[2] < Y(l + 1)), 1.6);
      else k.wallX(W.inn, -ZI, ZI, Y(l), Y(l + 1) - SLAB, Math.sign(W.inn - W.out), hs.filter(h => h[3] > Y(l) && h[2] < Y(l + 1)), 1.6);
    }
    k.room(-1);
  }
  // steel cable rails in the open bands + accent fins on the King St facade
  k.c(0x6f7479, 0.4, 0.8);
  for (let l = 1; l < NL; l++) for (const dy of [1.45, 1.75]) {
    k.box(-XI + 0.1, Y(l) + dy, -ZI + 0.05, XI - 0.1, Y(l) + dy + 0.02, -ZI + 0.08); k.box(-XI + 0.1, Y(l) + dy, ZI - 0.08, XI - 0.1, Y(l) + dy + 0.02, ZI - 0.05);
    k.box(XI - 0.08, Y(l) + dy, -ZI, XI - 0.05, Y(l) + dy + 0.02, ZI);
  }
  const FIN = [0x1f8a8a, 0xe8683a, 0xf2c14e];
  for (let i = 0; i < 26; i++) { const x = -HX + 0.7 + i * 1.22; if (x > ENT[0] - 0.8 && x < ENT[1] + 0.8) continue; k.c(FIN[i % 3], 0.5, 0.2); k.box(x - 0.06, 3.1, -HZ - 0.45, x + 0.06, ROOF + 0.9, -HZ); }
  for (let i = 0; i < 38; i++) { const z = -HZ + 0.8 + i * 1.22; k.c(FIN[(i + 1) % 3], 0.5, 0.2); k.box(HX, 3.1, z - 0.06, HX + 0.45, ROOF + 0.9, z + 0.06); }
  // entrance: portal, clearance bar, big sign, vertical PARK blade on the NE corner
  k.c(0x2b2e33, 0.4, 0.5); k.box(ENT[0] - 0.5, 3.0, -HZ - 0.6, ENT[1] + 0.5, 3.6, -HZ);
  k.signZ((ENT[0] + ENT[1]) / 2, 3.3, -HZ - 0.61, 11.0, 0.55, reg.name, 'sign');
  k.c(0xf2c14e, 0.5); k.box(ENT[0] + 0.2, 2.55, -HZ + 0.6, ENT[1] - 0.2, 2.7, -HZ + 0.75);
  k.signZ((ENT[0] + ENT[1]) / 2, 2.625, -HZ + 0.59, 2.4, 0.14, reg.clear, 'paint');
  k.c(0x1b1d21, 0.35, 0.5); k.box(HX - 0.2, 4.0, -HZ - 1.6, HX + 0.2, ROOF + 3.2, -HZ - 0.6);
  k.signX(HX + 0.21, (4.0 + ROOF + 3.2) / 2, -HZ - 1.1, 0.9, ROOF - 0.9, reg.blade, 'sign', 1);
  k.signX(HX - 0.21, (4.0 + ROOF + 3.2) / 2, -HZ - 1.1, 0.9, ROOF - 0.9, reg.blade, 'sign', -1);
  // apron
  const ay = Math.min(-0.01, S.groundLocal((ENT[0] + ENT[1]) / 2, -HZ - 3.2));
  k.c(0x8f8b83, 0.85, 0, PAT.CONCRETE, 1); k.quad([ENT[0], 0.01, -HZ], [ENT[1], 0.01, -HZ], [ENT[1], ay + 0.17, -HZ - 3.2], [ENT[0], ay + 0.17, -HZ - 3.2]);
  // roof top of the whole thing + parapet cap
  k.c(0xb5b2aa, 0.7); k.box(-HX, ROOF + 1.1, -HZ, HX, ROOF + 1.2, -ZI); k.box(-HX, ROOF + 1.1, ZI, HX, ROOF + 1.2, HZ); k.box(-HX, ROOF + 1.1, -ZI, -XI, ROOF + 1.2, ZI); k.box(XI, ROOF + 1.1, -ZI, HX, ROOF + 1.2, ZI);

  // ================================================================ levels
  for (let l = 0; l <= NL; l++) {
    const room = l < NL ? rooms[l] : -1;
    k.room(room);
    const rects = l === 0 ? [[-XI, -ZI, XI, ZI]] : slabRects(l);
    // floor
    k.tex('concrete', l === NL ? 0x8c8a86 : 0x86837d, 0.85);
    for (const r of rects) k.floor(r[0], r[1], r[2], r[3], Y(l) + 0.002, 1.5);
    // slab edges around the hole (vertical faces)
    if (l > 0) {
      const H = holeLane(l), [hx0, hx1] = laneX(H), ex = H === 'E' ? hx0 : hx1;
      k.c(CONC, 0.85, 0, PAT.CONCRETE, 0.6);
      k.room(rooms[l - 1]);
      k.wallX(ex, -RZ, RZ, Y(l) - SLAB, Y(l), H === 'E' ? 1 : -1, [], 2);
      k.wallZ(-RZ, hx0, hx1, Y(l) - SLAB, Y(l), 1, [], 2); k.wallZ(RZ, hx0, hx1, Y(l) - SLAB, Y(l), -1, [], 2);
      k.room(room);
    }
    // ceiling of the level below (slab underside), beams, pipes, tube lights
    if (l > 0) {
      k.room(rooms[l - 1]);
      k.tex('concrete', CEILC, 0.95);
      for (const r of rects) k.floor(r[0], r[1], r[2], r[3], Y(l) - SLAB, 1.5, true);
      k.c(CONC, 0.85, 0, PAT.CONCRETE, 0.5);
      for (const z of [-12.15, -4.05, 4.05, 12.15]) { const H = holeLane(l), [hx0, hx1] = laneX(H); for (const [a, b] of H === 'E' ? [[-XI, hx0]] : [[hx1, XI]]) k.box(a, Y(l) - SLAB - 0.5, z - 0.2, b, Y(l) - SLAB, z + 0.2, 63 & ~4); }
      k.c(0xb3322a, 0.5, 0.2); for (const x of [-2.2, 2.2]) k.tube([x, Y(l) - SLAB - 0.12, -ZI], [x, Y(l) - SLAB - 0.12, ZI], 0.03, 6);
      for (let z = -20; z <= 20; z += 5.4) for (const x of [0, -12.8, 12.8, -7.0, 7.0]) {
        if (Math.abs(x) > 9 && Math.abs(z) < RZ && ((x > 0) === (holeLane(l) === 'E'))) continue;
        k.at(x, Y(l) - SLAB, z, Math.abs(x) > 5 ? Math.PI / 2 : 0, () => F.tubeLight(k, { ceil: 0, len: 1.5, I: 1.25, col: [0.85, 0.93, 1.0], glowK: 5, range: 8 }));
      }
      k.room(room);
    }
    if (l === NL) continue;
    // painted bays (middle strip), aisle arrows, bay numbers, wheel stops
    k.c(PAINT_W, 0.6);
    for (const [x0, x1] of [[-SPINE + 0.15, -4.9], [4.9, SPINE - 0.15]]) {
      for (let i = 0; i <= 9; i++) { const z = -12.15 + i * 2.7; k.box(x0, Y(l) + 0.003, z - 0.05, x1, Y(l) + 0.006, z + 0.05, 4); }
      k.box(x0 < 0 ? x1 - 0.1 : x0, Y(l) + 0.003, -12.15, x0 < 0 ? x1 : x0 + 0.1, Y(l) + 0.006, 12.15, 4);
    }
    k.c(0x6a6862, 0.8, 0, PAT.CONCRETE, 2);
    for (const xs of [-SPINE + 0.8, SPINE - 0.8]) for (let i = 0; i < 9; i++) { const z = -12.15 + 1.35 + i * 2.7; k.box(xs - 0.1, Y(l), z - 0.8, xs + 0.1, Y(l) + 0.12, z + 0.8); }
    k.c(PAINT_Y, 0.6); for (const x of [-4.55, 4.55]) k.box(x - 0.06, Y(l) + 0.003, -RZ, x + 0.06, Y(l) + 0.006, RZ, 4);
    arrow(k, 0, Y(l) + 0.004, -8, l % 2 === 0 ? 1 : -1, PAINT_W); arrow(k, 0, Y(l) + 0.004, 8, l % 2 === 0 ? 1 : -1, PAINT_W);
    // level number + stripes on both spine wall faces toward the aisle
    // columns (per level segment) with painted bases
    for (const x of [-4.6, 4.6]) for (const z of [-12.15, -4.05, 4.05, 12.15]) {
      k.c(0xb9b5ad, 0.85, 0, PAT.CONCRETE, 1); k.box(x - 0.3, Y(l), z - 0.3, x + 0.3, Y(l + 1) - SLAB, z + 0.3, 63 & ~12, 1.2);
      for (let s = 0; s < 4; s++) { k.c(s % 2 ? 0x1d1d1f : PAINT_Y, 0.6); k.box(x - 0.305, Y(l) + s * 0.25, z - 0.305, x + 0.305, Y(l) + (s + 1) * 0.25, z + 0.305, 63 & ~12); }
      k.signX(x + (x < 0 ? 0.31 : -0.31), Y(l) + 1.8, z, 0.5, 0.5, reg.lv[l], 'paint', x < 0 ? 1 : -1);
      k.addOcc(x - 0.3, Y(l), z - 0.3, x + 0.3, Y(l + 1), z + 0.3, 0.4, rooms[l], 0.4);
    }
    // oil stains in the bays + tyre marks on the aisle
    for (let i = 0; i < 9; i++) {
      const h = Math.sin(l * 31.7 + i * 12.3) * 43758.5453, f = h - Math.floor(h);
      const x = (i % 2 ? 1 : -1) * (6.6 + f * 1.4), z = -12.15 + 1.35 + (i % 9) * 2.7, sz = 0.5 + f * 0.6;
      k.sign([x - sz, Y(l) + 0.009, z + sz], [x + sz, Y(l) + 0.009, z + sz], [x + sz, Y(l) + 0.009, z - sz], [x - sz, Y(l) + 0.009, z - sz], reg.stain, 'sign');
    }
    k.sign([-1.6, Y(l) + 0.008, 9], [1.8, Y(l) + 0.008, 9], [1.8, Y(l) + 0.008, -9], [-1.6, Y(l) + 0.008, -9], reg.tyre, 'sign');
    // exit signs
    k.signZ(-12.8, Y(l) + 2.4, -ZI + 0.02, 1.0, 0.36, reg.exit, 'sign', 1);
  }
  // ================================================================ ramps + spine walls
  for (let r = 0; r < NL; r++) {
    const L = r % 2 === 0 ? 'E' : 'W', [x0, x1] = laneX(L), sx = L === 'E' ? SPINE : -SPINE;
    const zLo = L === 'E' ? -RZ : RZ, zHi = -zLo, y0 = Y(r), y1 = Y(r + 1);
    k.room(rooms[r]);
    // ramp top (sloped concrete) + underside + curb along the spine
    const P = (x, z, y) => [x, y, z];
    k.tex('concrete', 0x86837d, 0.85);
    if (L === 'E') k.quad(P(x0, zLo, y0 + 0.003), P(x0, zHi, y1 + 0.003), P(x1, zHi, y1 + 0.003), P(x1, zLo, y0 + 0.003), 1.5);
    else k.quad(P(x1, zLo, y0 + 0.003), P(x1, zHi, y1 + 0.003), P(x0, zHi, y1 + 0.003), P(x0, zLo, y0 + 0.003), 1.5);
    k.c(CEILC, 0.9, 0, PAT.CONCRETE, 0.5);
    if (L === 'E') k.quad(P(x1, zLo, y0 - SLAB), P(x1, zHi, y1 - SLAB), P(x0, zHi, y1 - SLAB), P(x0, zLo, y0 - SLAB), 1.5);
    else k.quad(P(x0, zLo, y0 - SLAB), P(x0, zHi, y1 - SLAB), P(x1, zHi, y1 - SLAB), P(x1, zLo, y0 - SLAB), 1.5);
    // painted chevrons up the ramp
    k.c(PAINT_W, 0.6);
    for (let i = 1; i < 5; i++) { const t = i / 5, z = zLo + (zHi - zLo) * t, y = y0 + (y1 - y0) * t; arrow(k, (x0 + x1) / 2, y + 0.006, z, Math.sign(zHi - zLo), PAINT_W, (y1 - y0) / (zHi - zLo)); }
    // spine wall (both faces), with painted level band
    const wy0 = y0 - SLAB, wy1 = y1 + 1.1;
    k.tex('concrete_rough', CONC, 0.95);
    k.wallX(sx - 0.12, -RZ, RZ, wy0, wy1, -1, [], 1.6); k.wallX(sx + 0.12, -RZ, RZ, wy0, wy1, 1, [], 1.6);
    k.box(sx - 0.12, wy1, -RZ, sx + 0.12, wy1 + 0.05, RZ, 4);
    k.box(sx - 0.12, wy0, -RZ - 0.12, sx + 0.12, wy1, -RZ, 32); k.box(sx - 0.12, wy0, RZ, sx + 0.12, wy1, RZ + 0.12, 16);
    k.c(r % 2 ? 0x1f8a8a : 0xe8683a, 0.6); k.box(sx - 0.125, y0 + 0.9, -RZ, sx + 0.125, y0 + 1.2, RZ, 3);
    k.signX(sx + (L === 'E' ? -0.13 : 0.13), y0 + 1.9, 0, 3.2, 1.3, reg.lvBig[r], 'paint', L === 'E' ? -1 : 1);
    k.signX(sx + (L === 'E' ? -0.13 : 0.13), y0 + 1.9, -7, 2.4, 0.8, reg.up, 'paint', L === 'E' ? -1 : 1);
    // end wall under the high end + barrier at the low end of the hole above
    k.c(CONC_D, 0.9, 0, PAT.CONCRETE, 0.6);
    k.box(x0, y0, zHi - 0.15, x1, y1 - SLAB - 0.05, zHi + 0.15, 63, 1.6);
    k.c(CONC, 0.85, 0, PAT.CONCRETE, 0.6); k.box(x0, y1, zLo - 0.12, x1, y1 + 1.1, zLo + 0.12, 63, 1.6);
    k.c(PAINT_Y, 0.6); k.box(x0, y1 + 0.9, zLo - 0.125, x1, y1 + 1.1, zLo + 0.125);
    // ramp lights
    for (const t of [0.25, 0.75]) { const z = zLo + (zHi - zLo) * t; k.light((x0 + x1) / 2, y0 + (y1 - y0) * t + 2.4, z, [0.85, 0.93, 1.0], 1.1, { range: 8, r0: 1.8, wrap: 0.1 }); }
  }
  // ================================================================ ground floor extras: ticket booth + barrier arm, pay machine
  k.room(rooms[0]);
  k.at(5.8, 0, -20.2, 0, () => {
    k.c(0xe9e6e0, 0.5); k.box(-0.8, 0, -1.0, 0.8, 2.4, 1.0);
    k.c(0x2b2e33, 0.4, 0.5); k.box(-0.95, 2.4, -1.15, 0.95, 2.6, 1.15);
    k.in('glass', () => { k.quad([-0.81, 1.0, 0.8], [-0.81, 1.0, -0.8], [-0.81, 2.2, -0.8], [-0.81, 2.2, 0.8]); });
    k.in('glow', () => { k.glow(0xfff1dc, 3); k.box(-0.6, 2.38, -0.6, 0.6, 2.39, 0.6, 8); });
    k.occBox(-0.8, 0, -1.0, 0.8, 2.4, 1.0, 0.5);
  });
  k.at(-10.5, 0, -21.4, 0, () => { k.c(0x2e86c1, 0.4, 0.3); k.box(-0.35, 0, -0.25, 0.35, 1.7, 0.25); k.sign([0.3, 0.9, -0.255], [-0.3, 0.9, -0.255], [-0.3, 1.5, -0.255], [0.3, 1.5, -0.255], reg.pay, 'sign'); });
  k.group('arm');
  k.c(0xf4f2ee, 0.4); k.box(ENT[0] + 0.6, 0.95, -20.25, 4.7, 1.05, -20.15);
  for (let x = ENT[0] + 1.0; x < 4.6; x += 1.0) { k.c(0xd23b2e, 0.5); k.box(x, 0.948, -20.255, x + 0.5, 1.052, -20.145); }
  k.group('');
  k.c(0x2b2e33, 0.4, 0.5); k.box(4.7, 0, -20.4, 5.0, 1.1, -20.0);
  // ================================================================ lift core (all floors + roof housing)
  k.room(-1);
  k.c(0xd9d6cf, 0.8, 0, PAT.STUCCO, 1);
  k.box(CORE.x0, 0, CORE.z0, CORE.x1, ROOF + 3.2, CORE.z1, 63 & ~8, 2);
  k.c(0x2b2e33, 0.4, 0.5); k.box(CORE.x0 - 0.1, ROOF + 3.2, CORE.z0 - 0.1, CORE.x1 + 0.1, ROOF + 3.4, CORE.z1 + 0.1);
  k.signZ((CORE.x0 + CORE.x1) / 2, ROOF + 2.2, CORE.z0 - 0.01, 2.2, 1.4, reg.blade2, 'sign');
  for (let l = 0; l <= NL; l++) {
    k.room(l < NL ? rooms[l] : -1);
    const y = Y(l), zc = (CORE.z0 + CORE.z1) / 2;
    k.c(0xa8adb3, 0.25, 1); k.box(CORE.x1, y, zc - 0.7, CORE.x1 + 0.05, y + 2.2, zc + 0.7);
    k.c(0x6f757c, 0.3, 1); k.box(CORE.x1 + 0.05, y, zc - 0.01, CORE.x1 + 0.06, y + 2.2, zc + 0.01);
    k.c(0x2b2e33, 0.4); k.box(CORE.x1, y + 2.2, zc - 0.85, CORE.x1 + 0.08, y + 2.5, zc + 0.85);
    k.signX(CORE.x1 + 0.09, y + 2.35, zc, 1.4, 0.24, reg.lift, 'sign', 1);
    k.in('glow', () => { k.glow(0x4cd964, 3); k.box(CORE.x1 + 0.05, y + 1.1, zc + 0.8, CORE.x1 + 0.07, y + 1.2, zc + 0.9, 1); });
  }
  // ================================================================ roof: kicker + landing, light masts, view
  k.room(-1);
  const RY = ROOF;
  kicker(k, [0, -9.5, RY], [0, -6.2, RY + 1.05], 3.4);
  kicker(k, [0, 10.5, RY], [0, 4.8, RY + 1.0], 4.2);
  k.c(0xf2c14e, 0.6); for (const z of [-11.2, 11.8]) k.box(-2.2, RY + 0.004, z - 0.1, 2.2, RY + 0.008, z + 0.1, 4);
  for (const [x, z] of [[-6, -18], [6, -18], [-6, 0], [6, 0], [-6, 18], [6, 18]]) k.at(x, RY, z, 0, () => lightMast(k));
  surfaceLot(k, S);
  const out = k.toMeshes(ctx.mats);
  const group = out.groups[''] || new THREE.Group(), ext = out.groups.x || new THREE.Group();
  const arm = ctx.pivot(out.groups.arm, 4.7, 1.0, -20.2); ext.add(arm);
  const parked = parkedCars(S);
  if (parked) group.add(parked.group);
  let open = 0;
  return {
    group, ext, drawCalls: out.drawCalls + (parked ? parked.calls : 0), stats: out.stats,
    update(dt, info) {
      const p = info.playerLocal;
      const near = p && p[2] < -14 && p[2] > -30 && p[0] > ENT[0] - 2 && p[0] < ENT[1] + 3 && p[1] < 3;
      open = approach(open, near ? 1 : 0, dt * 1.6);
      arm.rotation.z = -open * open * (3 - 2 * open) * Math.PI * 0.45; arm.updateMatrix();
    },
  };
}
function approach(v, t, d) { return v + Math.sign(t - v) * Math.min(Math.abs(t - v), d); }

// ------------------------------------------------------------------ pieces
function revealAll(k, W, h) {
  const [u0, u1, v0, v1] = h, a = W.out, b = W.inn;
  const P = (u, v, w) => (W.axis === 'z' ? [u, v, w] : [w, v, u]);
  const flip = W.axis === 'z' ? (W.out > W.inn) : (W.out < W.inn);
  const q = (p0, p1, p2, p3) => (flip ? k.quad(p3, p2, p1, p0) : k.quad(p0, p1, p2, p3));
  q(P(u0, v1, a), P(u1, v1, a), P(u1, v1, b), P(u0, v1, b));
  if (v0 > 0.05) q(P(u1, v0, a), P(u0, v0, a), P(u0, v0, b), P(u1, v0, b));
  q(P(u0, v0, a), P(u0, v1, a), P(u0, v1, b), P(u0, v0, b));
  q(P(u1, v1, a), P(u1, v0, a), P(u1, v0, b), P(u1, v1, b));
}
// painted arrow on the floor pointing along dir (+1 = +Z)
function arrow(k, x, y, z, dir, col, slope = 0) {
  k.c(col, 0.6);
  const s = dir, L = 1.6, W = 0.25;
  const yy = (dz) => y + dz * slope * s;
  k.quad([x - W, yy(-L / 2), z - s * L / 2], [x + W, yy(-L / 2), z - s * L / 2], [x + W, yy(L * 0.2), z + s * L * 0.2], [x - W, yy(L * 0.2), z + s * L * 0.2]);
  k.quad([x - 0.65, yy(L * 0.2), z + s * L * 0.2], [x + 0.65, yy(L * 0.2), z + s * L * 0.2], [x, yy(L / 2 + 0.3), z + s * (L / 2 + 0.3)], [x, yy(L / 2 + 0.3), z + s * (L / 2 + 0.3)]);
  if (s < 0) { /* winding flip for arrows pointing -Z so they face up */ }
}
function kicker(k, a, b, w) {
  // sloped steel-plated wedge from a (ground end) to b (lip)
  const [ax, az, ay] = a, [bx, bz, by] = b, x0 = ax - w / 2, x1 = ax + w / 2;
  const up = bz > az;
  k.c(0x6f7479, 0.45, 0.7, PAT.PANEL, 2);
  if (up) k.quad([x0, ay, az], [x0, by, bz], [x1, by, bz], [x1, ay, az]);
  else k.quad([x1, ay, az], [x1, by, bz], [x0, by, bz], [x0, ay, az]);
  k.c(0x2b2e33, 0.6, 0.3);
  k.quad([x0, ay, az], [x0, ay, bz], [x0, by, bz], [x0, ay, az]);
  k.quad([x1, ay, bz], [x1, ay, az], [x1, ay, az], [x1, by, bz]);
  if (up) k.quad([x1, ay, bz], [x0, ay, bz], [x0, by, bz], [x1, by, bz]); else k.quad([x0, ay, bz], [x1, ay, bz], [x1, by, bz], [x0, by, bz]);
  k.c(0xf2c14e, 0.5); k.box(x0, by - 0.02, bz - (up ? 0.25 : -0.05), x1, by + 0.01, bz + (up ? -0.05 : 0.25));
  void bx;
}
function lightMast(k) {
  k.c(0x3a3d42, 0.4, 0.7); k.cyl(0, 0, 0, 0.25, 0.3, 0.6, 12); k.cyl(0, 0.6, 0, 0.08, 0.1, 6.0, 10);
  k.c(0x2b2e33, 0.4, 0.5); k.box(-0.9, 6.5, -0.2, 0.9, 6.7, 0.2);
  k.in('glow', () => { k.glow(0xfff0d8, 5); k.box(-0.8, 6.48, -0.15, 0.8, 6.5, 0.15, 8); });
}
// a handful of parked cars as instanced low-detail proxies (one draw call per model)
const safeSpec = (id) => { try { return getModelSpec(id); } catch { return { width: 1.9, length: 4.6, height: 1.5 }; } };
function parkedSpots(S) {
  if (S._spots) return S._spots;
  const spots = [];
  const ids = ['sedan', 'suv', 'hatch', 'taxi', 'ev', 'pickup', 'van', 'sedan', 'hatch', 'suv', 'sedan', 'coupe'];
  const paints = [0xd9d6cf, 0x1d3f7a, 0x9b1d20, null, 0x2a2d35, 0x8e939b, 0xe8e8ea, 0x3c6e8f, 0x2f5d3a, 0x1a1b1f, 0xc9b28f, 0x6b1e34];
  let n = 0;
  const hsh = (a) => { const h = Math.sin(a) * 43758.5453; return h - Math.floor(h); };
  for (let l = 0; l < NL; l++) for (const [xs, dir] of [[-SPINE + 2.6, 1], [SPINE - 2.6, -1]]) for (let i = 0; i < 9; i++) {
    if (hsh(l * 12.9 + i * 7.3 + xs) > 0.34) continue;
    if (l === 0 && i < 1) continue;
    spots.push({ x: xs, z: -12.15 + 1.35 + i * 2.7, y: Y(l), yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, id: ids[n % ids.length], paint: paints[n % paints.length] }); n++;
  }
  // surface lot: nose-in bays along the far edge of each leftover strip
  for (const b of bays(S)) { if (hsh(b.x * 3.1 + b.z * 1.7) > 0.45) continue; spots.push({ ...b, y: 0, id: ids[n % ids.length], paint: paints[n % paints.length] }); n++; }
  return (S._spots = spots);
}
// bay slots in the leftover strips: { x, z, yaw, line: [x0, z0, x1, z1] }
function bays(S) {
  const out = [];
  for (const r of leftovers(S)) {
    const w = r[2] - r[0], d = r[3] - r[1];
    if (Math.min(w, d) < 5.2) continue;
    if (d >= w) { // long in z: bays across x at the edge away from the garage
      const far = (r[0] + r[2]) / 2 < 0 ? r[0] : r[2], dir = far === r[0] ? 1 : -1;
      for (let z = r[1] + 1.4; z < r[3] - 1.3; z += 2.6) out.push({ x: far + dir * 2.6, z, yaw: dir > 0 ? Math.PI / 2 : -Math.PI / 2, line: [far, z - 1.3, far + dir * 5.0, z - 1.3] });
    } else {
      const far = (r[1] + r[3]) / 2 < 0 ? r[1] : r[3], dir = far === r[1] ? 1 : -1;
      for (let x = r[0] + 1.4; x < r[2] - 1.3; x += 2.6) out.push({ x, z: far + dir * 2.6, yaw: dir > 0 ? Math.PI : 0, line: [x - 1.3, far, x - 1.3, far + dir * 5.0] });
    }
  }
  return out;
}
function parkedCars(S) {
  try {
    const spots = parkedSpots(S);
    const byId = new Map();
    for (const s of spots) (byId.get(s.id) || byId.set(s.id, []).get(s.id)).push(s);
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    let calls = 0;
    for (const [id, list] of byId) {
      const geo = buildCarProxy(id);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.userData.shared = true;
      list.forEach((s, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw); m4.compose(new THREE.Vector3(s.x, s.y, s.z), q, one); im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(s.paint ?? 0xf2c14e)); });
      im.castShadow = false; im.receiveShadow = true;
      group.add(im); calls++;
      for (const s of list) S.parked?.push(s);
    }
    return { group, calls };
  } catch (e) { console.warn('[interiors] parked cars', e); return null; }
}

function surfaceLot(k, S) {
  const L = leftovers(S); if (!L.length) return;
  k.room(-1);
  const y = -0.03;   // just above the lifted block pavement
  k.tex('asphalt', 0x55575a, 0.9);
  for (const r of L) k.floor(r[0], r[1], r[2], r[3], y, 3);
  k.c(0xf1efe8, 0.6);
  for (const b of bays(S)) { const [x0, z0, x1, z1] = b.line; k.box(Math.min(x0, x1) - 0.05, y + 0.004, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, y + 0.007, Math.max(z0, z1) + 0.05, 4); }
  // a light pole on each big strip, a pay kiosk + sign on the strip nearest the street
  for (const r of L) if ((r[2] - r[0]) * (r[3] - r[1]) > 120) k.at((r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2, 0, () => { k.c(0x3a3d42, 0.4, 0.7); k.cyl(0, 0, 0, 0.14, 0.18, 0.5, 10); k.cyl(0, 0.5, 0, 0.07, 0.09, 6.5, 8); k.box(-0.8, 6.9, -0.18, 0.8, 7.05, 0.18); k.in('glow', () => { k.glow(0xfff0d8, 5); k.box(-0.7, 6.88, -0.12, 0.7, 6.9, 0.12, 8); }); });
  const front = L.reduce((a, r) => (r[1] < a[1] ? r : a), L[0]);
  if (front[1] < -HZ + 4) k.at(front[0] + 1.2, y, front[1] + 1.0, 0, () => {
    k.c(0x2e86c1, 0.4, 0.3); k.box(-0.3, 0, -0.2, 0.3, 1.6, 0.2); k.c(0x1b1d21, 0.3); k.box(-0.22, 0.9, -0.21, 0.22, 1.35, -0.2);
    k.in('glow', () => { k.glow(0x4cd964, 2); k.box(-0.18, 1.2, -0.215, 0.18, 1.3, -0.21, 32); });
    k.c(0x1b1d21, 0.35, 0.5); k.box(0.9, 0, -0.05, 1.0, 2.9, 0.05); k.box(4.2, 0, -0.05, 4.3, 2.9, 0.05);
    k.signZ(2.6, 2.4, -0.06, 3.2, 0.9, S._reg.lotSign, 'sign');
  });
}

// ------------------------------------------------------------------ atlas art
function regions(atlas) {
  const lv = [], lvBig = [];
  for (let l = 0; l < NL; l++) {
    const name = l === 0 ? 'G' : String(l + 1);
    const col = ['#e8683a', '#1f8a8a', '#f2c14e', '#6a8ad8'][l];
    lv.push(atlas.region('pk:lv' + l, 64, 64, (c, w, h) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, 7); c.fill(); text(c, name, w / 2, h / 2 + 2, 40, '#111'); }));
    lvBig.push(atlas.region('pk:lvb' + l, 256, 104, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); text(c, 'LEVEL', 18, h / 2 + 2, 30, '#111', { align: 'left', track: 3 }); text(c, name, w - 22, h / 2 + 4, 92, '#111', { align: 'right' }); }));
  }
  const up = atlas.region('pk:up', 192, 64, (c, w, h) => { c.fillStyle = '#f1efe8'; c.fillRect(0, 0, w, h); text(c, 'UP  ▲  ROOF', w / 2, h / 2 + 2, 34, '#1d1d1f', { track: 2 }); });
  const exit = atlas.region('pk:exit', 128, 44, (c, w, h) => { c.fillStyle = '#0c3d1e'; c.fillRect(0, 0, w, h); neon(c, 'EXIT', w / 2, h / 2 + 1, 30, '#35e06a', { glow: 0.4 }); });
  const name = atlas.region('pk:name', 512, 26, (c, w, h) => { c.fillStyle = '#1b1d21'; c.fillRect(0, 0, w, h); text(c, 'SOMA PARK & RIDE  ·  OPEN 24 HRS  ·  ROOF LEVEL VIEWS', w / 2, h / 2 + 1, 19, '#f2c14e', { track: 3 }); });
  const clear = atlas.region('pk:clear', 192, 14, (c, w, h) => { text(c, 'CLEARANCE 2.5 m', w / 2, h / 2 + 1, 12, '#111', { track: 2 }); });
  const blade = atlas.region('pk:blade', 48, 400, (c, w, h) => { c.fillStyle = '#0d2a52'; c.fillRect(0, 0, w, h); c.fillStyle = '#2e7bff'; c.fillRect(4, 4, w - 8, 60); text(c, 'P', w / 2, 36, 50, '#fff'); c.save(); c.translate(w / 2, h * 0.6); c.rotate(-Math.PI / 2); neon(c, 'PARK', 0, 2, 38, '#5aa9ff', { glow: 0.5, track: 10 }); c.restore(); });
  const blade2 = atlas.region('pk:blade2', 128, 80, (c, w, h) => { c.fillStyle = '#0d2a52'; c.fillRect(0, 0, w, h); neon(c, 'P', w * 0.25, h / 2 + 2, 60, '#5aa9ff', { glow: 0.5 }); text(c, 'ROOF', w * 0.68, h / 2 + 2, 26, '#fff', { track: 2 }); });
  const lift = atlas.region('pk:lift', 160, 28, (c, w, h) => { c.fillStyle = '#1b1d21'; c.fillRect(0, 0, w, h); text(c, 'LIFT  ·  ALL LEVELS', w / 2, h / 2 + 1, 18, '#f1efe8', { track: 2 }); });
  const pay = atlas.region('pk:pay', 96, 96, (c, w, h) => { c.fillStyle = '#0e1a24'; c.fillRect(0, 0, w, h); text(c, 'PAY', w / 2, 26, 26, '#4cd964'); text(c, '$4/HR', w / 2, 56, 20, '#fff'); c.fillStyle = '#2e7bff'; c.fillRect(20, 72, w - 40, 12); });
  const stain = atlas.region('pk:stain', 64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(8,8,10,.55)'); g.addColorStop(0.6, 'rgba(10,10,12,.25)'); g.addColorStop(1, 'rgba(10,10,12,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2.6, 0.4, 0, 7); c.fill(); });
  const tyre = atlas.region('pk:tyre', 64, 256, (c, w, h) => { c.strokeStyle = 'rgba(12,12,14,.22)'; for (const x of [18, 46]) { c.lineWidth = 7; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 10, h * 0.3, x - 12, h * 0.6, x + 4, h); c.stroke(); } });
  void FONT;
  const lotSign = atlas.region('pk:lot', 256, 72, (c, w, h) => { c.fillStyle = '#0d2a52'; c.fillRect(0, 0, w, h); neon(c, 'P', 34, h / 2 + 2, 52, '#5aa9ff', { glow: 0.4 }); text(c, 'SURFACE LOT', 150, 26, 26, '#fff', { track: 2 }); text(c, 'OPEN 24 HRS · $2/HR', 150, 52, 16, '#f2c14e', { track: 1 }); });
  return { lv, lvBig, up, exit, name, clear, blade, blade2, lift, pay, stain, tyre, lotSign };
}
