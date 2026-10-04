// Reusable furniture and fixtures. Every piece is built in its own frame: origin on the floor at the piece's centre,
// front facing -Z. Place with kit.at(x, y, z, yaw, k => sofa(k, {...})). Pieces register their own contact shadows
// and bake lights, so rooms read as lit and grounded without extra work.
import { PAT, lin, rng } from './kit.js';

const WOOD_D = 0x4a3222, WOOD_M = 0x8a5d3b, WOOD_L = 0xc49a6c, BLACK = 0x17181b, STEEL = 0xb8bcc2, BRASS = 0xc59a4a, WHITE = 0xeeeae2;
export const COL = { WOOD_D, WOOD_M, WOOD_L, BLACK, STEEL, BRASS, WHITE };
const WARM = [1.0, 0.72, 0.42];

// ------------------------------------------------------------------ seating
export function sofa(k, { w = 2.2, d = 0.95, col = 0x5a6e7a, leg = WOOD_D, seats = 3, arm = 0.2 } = {}) {
  const h0 = 0.14, seatH = 0.44, backH = 0.84;
  k.c(leg, 0.5); for (const [x, z] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) k.cyl(x, 0, z, 0.025, 0.018, h0, 6);
  k.tex('fabric', col, 1.0);
  k.rbox(-w / 2, h0, -d / 2 + 0.02, w / 2, h0 + 0.2, d / 2, 0.04);                       // base
  k.rbox(-w / 2, h0, d / 2 - 0.24, w / 2, backH, d / 2, 0.06);                           // back frame
  k.rbox(-w / 2, h0, -d / 2, -w / 2 + arm, 0.64, d / 2, 0.07);                           // arms
  k.rbox(w / 2 - arm, h0, -d / 2, w / 2, 0.64, d / 2, 0.07);
  const iw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) {
    const x0 = -w / 2 + arm + i * iw;
    k.rbox(x0 + 0.01, h0 + 0.2, -d / 2 + 0.04, x0 + iw - 0.01, seatH + 0.02, d / 2 - 0.2, 0.06);   // seat cushion
    k.rbox(x0 + 0.02, seatH, d / 2 - 0.34, x0 + iw - 0.02, backH + 0.02, d / 2 - 0.16, 0.08);   // back cushion
  }
  k.occBox(-w / 2, 0, -d / 2, w / 2, backH, d / 2, 0.6);
}
export function armchair(k, { col = 0x9a5a3a, leg = WOOD_D } = {}) { sofa(k, { w: 0.95, d: 0.9, col, leg, seats: 1, arm: 0.17 }); }
export function stool(k, { h = 0.75, seat = 0xb3261e, metal = STEEL, r = 0.19, back = false } = {}) {
  k.c(metal, 0.25, 1); k.cyl(0, 0, 0, 0.2, 0.22, 0.03, 18); k.cyl(0, 0.03, 0, 0.035, 0.035, h - 0.1, 10);
  k.torus(0, 0.3, 0, 0.16, 0.012, 6, 18);
  k.tex('leather', seat, 0.55); k.cyl(0, h - 0.08, 0, r, r - 0.01, 0.09, 20); k.sphere(0, h + 0.005, 0, r - 0.005, 18, 6, 0.12);
  if (back) { k.c(metal, 0.3, 1); k.tube([0, h, r - 0.03], [0, h + 0.35, r - 0.03], 0.012); k.c(seat, 0.5); k.rbox(-0.16, h + 0.2, r - 0.06, 0.16, h + 0.4, r, 0.03); }
  k.occBox(-r, 0, -r, r, h, r, 0.35, 0.2);
}
export function chair(k, { col = WOOD_M, seat = null, h = 0.46 } = {}) {
  k.c(col, 0.55, 0, PAT.GRAIN, 1);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.box(x - 0.02, 0, z - 0.02, x + 0.02, h, z + 0.02);
  if (seat) k.tex('fabric', seat, 1.0);
  k.rbox(-0.23, h - 0.01, -0.23, 0.23, h + 0.04, 0.23, 0.015);
  k.c(col, 0.55, 0, PAT.GRAIN, 1);
  k.box(-0.2, h + 0.04, 0.18, -0.17, h + 0.48, 0.22); k.box(0.17, h + 0.04, 0.18, 0.2, h + 0.48, 0.22);
  k.rbox(-0.21, h + 0.3, 0.18, 0.21, h + 0.47, 0.23, 0.015);
  k.occBox(-0.23, 0, -0.23, 0.23, h + 0.05, 0.23, 0.3, 0.2);
}

// ------------------------------------------------------------------ tables
export function coffeeTable(k, { w = 1.1, d = 0.6, h = 0.4, top = WOOD_M, legs = BLACK, props = true, seed = 3 } = {}) {
  k.c(legs, 0.4, 0.6); for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) k.box(x - 0.015, 0, z - 0.015, x + 0.015, h - 0.04, z + 0.015);
  k.box(-w / 2 + 0.05, 0.12, -d / 2 + 0.05, w / 2 - 0.05, 0.14, d / 2 - 0.05);
  k.c(top, 0.35, 0, PAT.GRAIN, 1); k.rbox(-w / 2, h - 0.045, -d / 2, w / 2, h, d / 2, 0.012);
  if (props) {
    const r = rng(seed);
    books(k, -w / 2 + 0.25, h, 0.02, 3, r);
    k.c(0xe8e2d6, 0.3); k.cyl(w / 2 - 0.22, h, -0.08, 0.045, 0.04, 0.1, 12);                      // mug
    k.c(0x2e3b2c, 0.8); k.cyl(w / 2 - 0.3, h, 0.12, 0.07, 0.05, 0.12, 12); k.c(0x4f7a3f, 0.8); k.sphere(w / 2 - 0.3, h + 0.2, 0.12, 0.13, 10, 6);
  }
  k.occBox(-w / 2, 0, -d / 2, w / 2, h, d / 2, 0.35);
}
export function table(k, { w = 1.4, d = 0.8, h = 0.75, top = WOOD_L, legs = WOOD_D, pat = PAT.WOOD, round = false, metal = 0 } = {}) {
  if (round) {
    k.c(legs, 0.3, metal); k.cyl(0, 0, 0, 0.24, 0.26, 0.03, 20); k.cyl(0, 0.03, 0, 0.04, 0.04, h - 0.06, 10);
    k.c(top, 0.3, 0, pat === PAT.WOOD ? PAT.GRAIN : pat, 1); k.cyl(0, h - 0.035, 0, w / 2, w / 2, 0.035, 28);
    k.occBox(-w / 2, 0, -w / 2, w / 2, h, w / 2, 0.3);
    return;
  }
  k.c(legs, 0.5, metal); for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) k.box(x - 0.03, 0, z - 0.03, x + 0.03, h - 0.04, z + 0.03);
  k.c(top, 0.35, 0, pat === PAT.WOOD ? PAT.GRAIN : pat, 1); k.rbox(-w / 2, h - 0.045, -d / 2, w / 2, h, d / 2, 0.01);
  k.occBox(-w / 2, 0, -d / 2, w / 2, h, d / 2, 0.3);
}
export function rug(k, { w = 2.4, d = 1.7, col = 0x9a3b34, border = 0xd9c8a4, inner = 0x2d3a5a } = {}) {
  k.tex('carpet', border, 1.0, 0, 1.5); k.box(-w / 2, 0, -d / 2, w / 2, 0.012, d / 2, 4 | 1 | 2 | 16 | 32, 0.5);
  k.tex('carpet', col, 1.0, 0, 1.5); k.box(-w / 2 + 0.1, 0.012, -d / 2 + 0.1, w / 2 - 0.1, 0.015, d / 2 - 0.1, 4, 0.5);
  k.tex('carpet', inner, 1.0, 0, 1.5); k.box(-w / 2 + 0.35, 0.015, -d / 2 + 0.35, w / 2 - 0.35, 0.017, d / 2 - 0.35, 4, 0.5);
}

// ------------------------------------------------------------------ storage
export function books(k, x, y, z, n, r, maxH = 0.05, flat = true) {
  const cols = [0x8e2f2a, 0x2f4f6e, 0xd8c9a0, 0x3d5e3a, 0x1f1f24, 0xc2833a, 0x6a3d6e, 0xe6e0d2];
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = 0.18 + r() * 0.08, dd = 0.13 + r() * 0.06, t = 0.025 + r() * maxH * 0.5;
    k.c(cols[Math.floor(r() * cols.length)], 0.7); k.box(x - w / 2, yy, z - dd / 2, x + w / 2, yy + t, z + dd / 2);
    yy += t; void flat;
  }
}
export function bookshelf(k, { w = 1.2, h = 2.0, d = 0.32, col = WOOD_D, seed = 7, shelves = 5 } = {}) {
  const r = rng(seed);
  k.c(col, 0.55, 0, PAT.GRAIN, 1);
  k.box(-w / 2, 0, -d / 2, -w / 2 + 0.03, h, d / 2); k.box(w / 2 - 0.03, 0, -d / 2, w / 2, h, d / 2);
  k.box(-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2); k.box(-w / 2 + 0.03, 0, d / 2 - 0.015, w / 2 - 0.03, h - 0.03, d / 2);
  const cols = [0x8e2f2a, 0x2f4f6e, 0xd8c9a0, 0x3d5e3a, 0x26262b, 0xc2833a, 0x6a3d6e, 0xe6e0d2, 0x9c7a3a, 0x3f6a7a];
  for (let s = 0; s < shelves; s++) {
    const y = 0.06 + s * (h - 0.1) / shelves;
    k.c(col, 0.55, 0, PAT.GRAIN, 1); k.box(-w / 2 + 0.03, y - 0.025, -d / 2, w / 2 - 0.03, y, d / 2 - 0.015);
    const sh = (h - 0.1) / shelves - 0.06;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.08) {
      const kind = r();
      if (kind < 0.8) { // run of books
        const n = 3 + Math.floor(r() * 9);
        for (let i = 0; i < n && x < w / 2 - 0.06; i++) {
          const bw = 0.02 + r() * 0.035, bh = sh * (0.62 + r() * 0.34), bd = d * (0.62 + r() * 0.25);
          k.c(cols[Math.floor(r() * cols.length)], 0.75); k.box(x, y, -d / 2 + (d - bd) / 2 - 0.02, x + bw, y + bh, -d / 2 + (d - bd) / 2 + bd - 0.02);
          x += bw + 0.002;
        }
        if (r() < 0.4) { const lean = 0.12; k.c(cols[Math.floor(r() * cols.length)], 0.75); k.push(x + 0.04, y, 0, 0, 1, 0, -0.35); k.box(0, 0, -d * 0.3, 0.03, sh * 0.8, d * 0.3); k.pop(); x += lean; }
        x += 0.03 + r() * 0.08;
      } else if (kind < 0.9) { // vase / object
        k.c([0xd9d2c3, 0x2d5a63, 0xb45a3c, 0x1d1d20][Math.floor(r() * 4)], 0.3);
        k.lathe(x + 0.06, y, 0, [[0, 0], [0.05, 0.005], [0.06, 0.06], [0.035, 0.14], [0.04, 0.17], [0, 0.17]], 12); x += 0.16;
      } else { // stacked books flat
        books(k, x + 0.1, y, 0, 2 + Math.floor(r() * 3), r); x += 0.24;
      }
    }
  }
  k.occBox(-w / 2, 0, -d / 2, w / 2, h, d / 2, 0.55);
}
export function cabinet(k, { w = 0.8, h = 0.9, d = 0.6, col = 0x2f3b3e, handle = BRASS, doors = 2, top = null, topCol = 0xe8e4dc, drawer = false, kick = true } = {}) {
  const kb = kick ? 0.1 : 0;
  if (kick) { k.c(0x111214, 0.8); k.box(-w / 2 + 0.03, 0, -d / 2 + 0.05, w / 2 - 0.03, 0.1, d / 2); }  // toe kick
  k.c(col, 0.45); k.box(-w / 2, kb, -d / 2 + 0.02, w / 2, h - (top ? 0.03 : 0), d / 2);
  // door panels (inset frames)
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x0 = -w / 2 + i * dw + 0.02, x1 = x0 + dw - 0.04;
    k.c(col, 0.4); k.box(x0, kb + 0.03, -d / 2 + 0.005, x1, h - 0.06, -d / 2 + 0.02, 63 & ~16);
    k.c(handle, 0.25, 1); if (drawer) k.box((x0 + x1) / 2 - 0.08, h - 0.16, -d / 2 - 0.015, (x0 + x1) / 2 + 0.08, h - 0.14, -d / 2 + 0.005);
    else k.box(i % 2 ? x0 + 0.04 : x1 - 0.05, h - 0.3, -d / 2 - 0.015, i % 2 ? x0 + 0.05 : x1 - 0.04, h - 0.12, -d / 2 + 0.005);
  }
  if (top) { if (typeof top === 'string') k.tex(top, topCol, 0.45); else k.c(topCol, 0.22, 0, top); k.box(-w / 2 - 0.02, h - 0.03, -d / 2 - 0.02, w / 2 + 0.02, h + 0.01, d / 2); }
  k.occBox(-w / 2, 0, -d / 2, w / 2, h, d / 2, 0.45);
}

// ------------------------------------------------------------------ lighting fixtures
export function floorLamp(k, { h = 1.6, shade = 0xf1e4c8, metal = BRASS, I = 1.4 } = {}) {
  k.c(metal, 0.3, 1); k.cyl(0, 0, 0, 0.16, 0.17, 0.025, 20); k.cyl(0, 0.025, 0, 0.012, 0.012, h - 0.2, 8);
  k.c(shade, 0.9); k.lathe(0, h - 0.32, 0, [[0.2, 0], [0.15, 0.3], [0.148, 0.3], [0.198, 0]], 20);
  k.in('glow', () => { k.glow(0xffd8a0, 2.2); k.lathe(0, h - 0.32, 0, [[0.19, 0.005], [0.145, 0.295]], 20); k.glow(0xfff1d6, 5); k.sphere(0, h - 0.22, 0, 0.05, 8, 6); });
  k.light(0, h - 0.2, 0, WARM, I, { range: 6.5, r0: 1.1, wrap: 0.3 });
  k.occBox(-0.17, 0, -0.17, 0.17, 0.05, 0.17, 0.2, 0.15);
}
export function tableLamp(k, { shade = 0xf3e7cf, base = 0x2d5a63, I = 0.7 } = {}) {
  k.c(base, 0.25); k.lathe(0, 0, 0, [[0, 0], [0.07, 0], [0.09, 0.08], [0.05, 0.2], [0.015, 0.26], [0, 0.26]], 14);
  k.c(shade, 0.9); k.lathe(0, 0.24, 0, [[0.15, 0], [0.1, 0.19], [0.098, 0.19], [0.148, 0]], 18);
  k.in('glow', () => { k.glow(0xffd29a, 2.4); k.lathe(0, 0.24, 0, [[0.14, 0.004], [0.095, 0.186]], 18); });
  k.light(0, 0.36, 0, WARM, I, { range: 4, r0: 0.7, wrap: 0.25 });
}
// pendant hanging from a ceiling at local height `ceil`, bulb bottom at `y`
export function pendant(k, { ceil = 2.9, y = 2.0, shade = BLACK, style = 'dome', I = 1.3, col = WARM, range = 6 } = {}) {
  k.c(0x111111, 0.6); k.tube([0, y + 0.2, 0], [0, ceil, 0], 0.006, 5);
  k.c(shade, 0.35, style === 'brass' ? 1 : 0.2);
  if (style === 'dome' || style === 'brass') k.lathe(0, y, 0, [[0.2, 0], [0.19, 0.06], [0.12, 0.16], [0.03, 0.22], [0, 0.23]], 20);
  else if (style === 'cone') k.lathe(0, y, 0, [[0.13, 0], [0.03, 0.26], [0, 0.27]], 16);
  else if (style === 'globe') { k.in('glow', () => { k.glow(0xffe0b0, 2.6); k.sphere(0, y, 0, 0.13, 16, 10); }); }
  if (style !== 'globe') k.in('glow', () => { k.glow(0xfff0d0, 6); k.sphere(0, y + 0.03, 0, 0.055, 10, 6); k.glow(0xffd29a, 1.6); k.lathe(0, y + 0.002, 0, [[0.185, 0.004], [0.115, 0.155], [0.03, 0.215]], 20); });
  k.light(0, y - 0.05, 0, col, I, { range, r0: 1.0, wrap: 0.25 });
}
// edison bulb on a cord
export function edison(k, { ceil = 3.2, y = 2.2, I = 0.7 } = {}) {
  k.c(0x111111, 0.6); k.tube([0, y + 0.08, 0], [0, ceil, 0], 0.005, 5);
  k.c(BRASS, 0.3, 1); k.cyl(0, y + 0.05, 0, 0.02, 0.02, 0.05, 8);
  k.in('glow', () => { k.glow(0xffa860, 4); k.sphere(0, y, 0, 0.055, 10, 8, 1.3); });
  k.light(0, y, 0, [1, 0.62, 0.3], I, { range: 4.5, r0: 0.8, wrap: 0.3 });
}
// flush ceiling fixture (disc) at height ceil
export function ceilingDisc(k, { ceil = 2.9, r = 0.22, I = 1.4, col = [1, 0.86, 0.7], range = 7 } = {}) {
  k.c(0xdddddd, 0.4); k.cyl(0, ceil - 0.03, 0, r + 0.02, r + 0.02, 0.03, 20);
  k.in('glow', () => { k.glow(0xfff2dc, 3.2); k.cyl(0, ceil - 0.06, 0, r, r * 0.9, 0.03, 20); });
  k.light(0, ceil - 0.25, 0, col, I, { range, r0: 1.4, wrap: 0.1, dir: [0, -1, 0], cos0: -0.25, cos1: 0.45 });
}
// fluorescent / LED tube fixture along x, hanging just under a ceiling
export function tubeLight(k, { ceil = 2.9, len = 1.2, I = 1.2, col = [0.86, 0.93, 1.0], glowK = 4, range = 7, bake = true } = {}) {
  k.c(0xd6d8da, 0.5, 0.3); k.box(-len / 2 - 0.03, ceil - 0.07, -0.08, len / 2 + 0.03, ceil, 0.08);
  k.in('glow', () => { k.glow(col, glowK); k.box(-len / 2, ceil - 0.1, -0.05, len / 2, ceil - 0.07, 0.05, 63 & ~4); });
  if (bake) k.light(0, ceil - 0.25, 0, col, I, { range, r0: 1.6, wrap: 0.1, dir: [0, -1, 0], cos0: -0.3, cos1: 0.4 });
}

// ------------------------------------------------------------------ plants
export function plant(k, { h = 1.1, pot = 0xd8d2c4, leaf = 0x3f6e3a, seed = 1, kind = 'bush' } = {}) {
  const r = rng(seed);
  k.c(pot, 0.5); k.lathe(0, 0, 0, [[0, 0], [0.13, 0], [0.18, 0.32], [0.17, 0.33], [0, 0.31]], 16);
  k.c(0x3a2a1c, 1); k.cyl(0, 0.28, 0, 0.165, 0.165, 0.02, 14);
  if (kind === 'palm' || kind === 'fern') {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, t = 0.5 + r() * 0.5, L = h * 0.55 * t;
      k.c(leaf, 0.6); k.push(0, 0.3, 0, a, 1, 0, 0);
      k.push(0, 0, 0, 0, 1, -0.6 - r() * 0.5, 0);
      k.box(-0.004, 0, -0.004, 0.004, L, 0.004);
      k.c(leaf, 0.6); k.box(-0.09 * t, L * 0.35, -0.004, 0.09 * t, L, 0.004);
      k.pop(); k.pop();
    }
  } else {
    k.c(0x4a3322, 0.9); k.cyl(0, 0.3, 0, 0.02, 0.025, h * 0.5, 6);
    const n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rr = 0.08 + r() * 0.16, y = 0.3 + h * (0.35 + r() * 0.55);
      const tone = 0.8 + r() * 0.4, c = lin(leaf);
      k.c([c[0] * tone, c[1] * tone, c[2] * tone], 0.7); k.sphere(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.12 + r() * 0.1, 8, 6, 0.8);
    }
  }
  k.occBox(-0.2, 0, -0.2, 0.2, h, 0.2, 0.3, 0.2);
}

// ------------------------------------------------------------------ bedroom
export function bed(k, { w = 1.65, l = 2.1, frame = WOOD_D, duvet = 0xe9e3d6, throwCol = 0x9b4a3a, head = 0x3b4a5a } = {}) {
  const h = 0.32;
  k.c(frame, 0.5, 0, PAT.GRAIN, 1); k.box(-w / 2, 0.08, -l / 2, w / 2, h, l / 2);
  for (const [x, z] of [[-w / 2 + 0.05, -l / 2 + 0.05], [w / 2 - 0.05, -l / 2 + 0.05], [-w / 2 + 0.05, l / 2 - 0.05], [w / 2 - 0.05, l / 2 - 0.05]]) k.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.09, z + 0.04);
  k.tex('fabric', head, 1.0); k.rbox(-w / 2 - 0.05, 0.1, l / 2 - 0.06, w / 2 + 0.05, 1.15, l / 2 + 0.04, 0.05);
  k.c(0xf4f1ea, 0.9); k.rbox(-w / 2 + 0.03, h, -l / 2 + 0.03, w / 2 - 0.03, h + 0.22, l / 2 - 0.08, 0.06);                 // mattress
  k.tex('fabric', duvet, 1.0, 0, 1.3); k.rbox(-w / 2 - 0.02, h + 0.1, -l / 2 + 0.0, w / 2 + 0.02, h + 0.32, l / 2 - 0.55, 0.09); // duvet
  k.c(0xf6f3ee, 0.9); for (const x of [-w / 4, w / 4]) k.rbox(x - w / 4 + 0.05, h + 0.2, l / 2 - 0.52, x + w / 4 - 0.05, h + 0.36, l / 2 - 0.12, 0.07);
  k.tex('fabric', 0x6d8aa0, 1.0); k.rbox(-0.3, h + 0.25, l / 2 - 0.6, 0.3, h + 0.42, l / 2 - 0.42, 0.06);
  k.tex('fabric', throwCol, 1.0, 0, 1.6); k.rbox(-w / 2 - 0.04, h + 0.3, -l / 2 + 0.05, w / 2 + 0.04, h + 0.36, -l / 2 + 0.55, 0.03);
  k.occBox(-w / 2, 0, -l / 2, w / 2, h + 0.35, l / 2, 0.55);
}
export function nightstand(k, { col = WOOD_M, lamp = true } = {}) {
  k.c(col, 0.5, 0, PAT.GRAIN, 1); k.rbox(-0.25, 0.12, -0.2, 0.25, 0.55, 0.2, 0.01);
  k.c(BLACK, 0.4, 0.5); for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) k.cyl(x, 0, z, 0.012, 0.012, 0.13, 6);
  k.c(BRASS, 0.3, 1); k.box(-0.06, 0.4, -0.215, 0.06, 0.41, -0.2);
  if (lamp) k.at(0.05, 0.55, 0.02, 0, () => tableLamp(k));
  k.occBox(-0.25, 0, -0.2, 0.25, 0.55, 0.2, 0.35);
}
export function desk(k, { w = 1.4, d = 0.65, top = WOOD_L, legs = BLACK, screen = null } = {}) {
  table(k, { w, d, h: 0.74, top, legs, metal: 0.5 });
  k.c(0x1a1b1e, 0.4); k.box(-0.35, 0.74, 0.05, 0.35, 0.755, 0.24); k.box(-0.03, 0.755, 0.12, 0.03, 0.95, 0.16);
  k.box(-0.36, 0.93, 0.1, 0.36, 1.3, 0.13);                                             // monitor
  if (screen) k.sign([0.34, 0.95, 0.098], [-0.34, 0.95, 0.098], [-0.34, 1.28, 0.098], [0.34, 1.28, 0.098], screen);
  k.c(0x2a2b2f, 0.5); k.box(-0.22, 0.74, -0.2, 0.22, 0.755, -0.06);                      // keyboard
  k.c(0x2a2b2f, 0.4); k.rbox(0.3, 0.74, -0.16, 0.37, 0.765, -0.06, 0.012);
  k.light(0, 1.1, -0.2, [0.55, 0.7, 1.0], 0.35, { range: 2.2, r0: 0.5 });
}
export function officeChair(k, { col = 0x1d1f24 } = {}) {
  k.c(0x2a2a2e, 0.4, 0.6); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.tube([0, 0.08, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.018, 5); k.sphere(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3, 0.03, 6, 4); }
  k.cyl(0, 0.08, 0, 0.025, 0.025, 0.36, 8);
  k.tex('leather', col, 0.6); k.rbox(-0.25, 0.44, -0.25, 0.25, 0.52, 0.22, 0.04); k.rbox(-0.23, 0.55, 0.2, 0.23, 1.1, 0.27, 0.06);
}
export function wardrobe(k, { w = 1.2, h = 2.1, d = 0.6, col = 0xe9e4da } = {}) {
  k.c(col, 0.45); k.box(-w / 2, 0, -d / 2, w / 2, h, d / 2);
  k.c(col, 0.4); k.box(-w / 2 + 0.02, 0.05, -d / 2 - 0.015, -0.005, h - 0.04, -d / 2, 63 & ~16); k.box(0.005, 0.05, -d / 2 - 0.015, w / 2 - 0.02, h - 0.04, -d / 2, 63 & ~16);
  k.c(BRASS, 0.3, 1); k.box(-0.06, 0.9, -d / 2 - 0.035, -0.045, 1.25, -d / 2 - 0.01); k.box(0.045, 0.9, -d / 2 - 0.035, 0.06, 1.25, -d / 2 - 0.01);
  k.occBox(-w / 2, 0, -d / 2, w / 2, h, d / 2, 0.55);
}

// ------------------------------------------------------------------ living room tech
export function tvUnit(k, { w = 1.8, screen = null, col = WOOD_D } = {}) {
  cabinet(k, { w, h: 0.48, d: 0.42, col, doors: 3, drawer: true, handle: BLACK });
  k.c(0x0c0c0e, 0.3); k.box(-0.62, 0.48, 0.02, 0.62, 0.5, 0.12); k.box(-0.03, 0.5, 0.05, 0.03, 0.58, 0.09);
  k.box(-0.72, 0.56, 0.04, 0.72, 1.39, 0.09);                                             // 65" panel
  if (screen) k.sign([0.7, 0.58, 0.035], [-0.7, 0.58, 0.035], [-0.7, 1.37, 0.035], [0.7, 1.37, 0.035], screen);
  k.light(0, 0.95, -0.4, [0.5, 0.65, 1.0], 0.45, { range: 3.2, r0: 0.8 });
  k.c(0x1a1a1c, 0.5); k.box(-0.35, 0.48, -0.1, 0.35, 0.56, 0.02);                          // soundbar
  plantSmall(k, w / 2 - 0.2, 0.48, 0, 5);
}
export function plantSmall(k, x, y, z, seed = 2) {
  const r = rng(seed);
  k.c(0xe6e1d6, 0.4); k.cyl(x, y, z, 0.07, 0.055, 0.12, 12);
  for (let i = 0; i < 6; i++) { const a = r() * 6.28, rr = r() * 0.05; k.c([0.08 + r() * 0.05, 0.22 + r() * 0.1, 0.07], 0.7); k.sphere(x + Math.cos(a) * rr, y + 0.16 + r() * 0.08, z + Math.sin(a) * rr, 0.05 + r() * 0.03, 6, 4); }
}
// framed art on a wall facing -Z (hang at y centre), region from the atlas
export function frame(k, { w = 0.8, h = 1.0, col = BLACK, mat = 0xf2efe8, region = null } = {}) {
  k.c(col, 0.4); k.box(-w / 2, -h / 2, 0, w / 2, h / 2, 0.035);
  k.c(mat, 0.8); k.box(-w / 2 + 0.03, -h / 2 + 0.03, -0.005, w / 2 - 0.03, h / 2 - 0.03, 0.0, 32);
  if (region) k.sign([w / 2 - 0.09, -h / 2 + 0.09, -0.008], [-w / 2 + 0.09, -h / 2 + 0.09, -0.008], [-w / 2 + 0.09, h / 2 - 0.09, -0.008], [w / 2 - 0.09, h / 2 - 0.09, -0.008], region, 'paint');
}
// curtains: a panel of folds hanging in x from y0 to y1, facing -Z
export function curtain(k, { w = 1.0, y0 = 0.1, y1 = 2.6, col = 0xd9cdb6, folds = 8 } = {}) {
  const fw = w / folds;
  for (let i = 0; i < folds; i++) {
    const x = -w / 2 + i * fw, dz = (i % 2) * 0.04;
    k.tex('fabric', col.map ? col : lin(col).map(v => v * (i % 2 ? 0.86 : 1)), 1.0, 0, 1.2);
    k.box(x, y0, dz, x + fw + 0.01, y1, dz + 0.03, 63 & ~12);
  }
  k.c(BRASS, 0.3, 1); k.tube([-w / 2 - 0.1, y1 + 0.06, 0.02], [w / 2 + 0.1, y1 + 0.06, 0.02], 0.014, 6);
}
