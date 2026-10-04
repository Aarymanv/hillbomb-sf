// Lived-in extras: pool table, billiard lamp, sideboard with a record player, side table, guitar, skateboard,
// wall shelf, clock, ceiling medallion, throws and cushions. Same conventions as furniture.js.
import { PAT, rng } from './kit.js';
import { cabinet, tableLamp, plantSmall, COL } from './furniture.js';

const { WOOD_M, WOOD_D, BRASS } = COL;

export function poolTable(k, { felt = 0x1f5e46, wood = 0x4a2a1a } = {}) {
  const w = 1.42, l = 2.54, h = 0.8;
  k.c(wood, 0.35, 0, PAT.GRAIN, 1);
  for (const [x, z] of [[-w / 2 + 0.12, -l / 2 + 0.12], [w / 2 - 0.12, -l / 2 + 0.12], [-w / 2 + 0.12, l / 2 - 0.12], [w / 2 - 0.12, l / 2 - 0.12], [-w / 2 + 0.12, 0], [w / 2 - 0.12, 0]]) k.lathe(x, 0, z, [[0, 0], [0.09, 0], [0.07, 0.1], [0.06, 0.5], [0.08, 0.62], [0, 0.62]], 10);
  k.box(-w / 2, 0.58, -l / 2, w / 2, h - 0.06, l / 2);
  k.c(felt, 0.95, 0, PAT.FABRIC, 3); k.box(-w / 2 + 0.12, h - 0.07, -l / 2 + 0.12, w / 2 - 0.12, h - 0.04, l / 2 - 0.12, 4);
  k.c(wood, 0.3, 0, PAT.GRAIN, 1);
  k.box(-w / 2, h - 0.07, -l / 2, -w / 2 + 0.12, h + 0.02, l / 2); k.box(w / 2 - 0.12, h - 0.07, -l / 2, w / 2, h + 0.02, l / 2);
  k.box(-w / 2, h - 0.07, -l / 2, w / 2, h + 0.02, -l / 2 + 0.12); k.box(-w / 2, h - 0.07, l / 2 - 0.12, w / 2, h + 0.02, l / 2);
  k.c(felt, 0.9); k.box(-w / 2 + 0.1, h - 0.04, -l / 2 + 0.1, -w / 2 + 0.12, h + 0.01, l / 2 - 0.1); k.box(w / 2 - 0.12, h - 0.04, -l / 2 + 0.1, w / 2 - 0.1, h + 0.01, l / 2 - 0.1);
  k.c(0x0d0d0e, 0.7); for (const [x, z] of [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]) k.cyl(x * (w / 2 - 0.13), h - 0.041, z * (l / 2 - 0.13), 0.055, 0.055, 0.005, 10);
  const balls = [0xf2eee4, 0xf2c14e, 0x2f4fb0, 0xc0392b, 0x6a3d9a, 0xe67e22, 0x1e8449, 0x7b241c, 0x111111];
  for (let i = 0; i < balls.length; i++) {
    const p = i === 0 ? [0, -0.7] : [((i - 1) % 3 - 1) * 0.058 + Math.floor((i - 1) / 3) * 0.029, 0.45 + Math.floor((i - 1) / 3) * 0.05];
    k.c(balls[i], 0.15); k.sphere(p[0], h - 0.012, p[1], 0.028, 10, 8);
  }
  k.c(0xc79a5b, 0.4, 0, PAT.GRAIN, 3); k.tube([-0.3, h + 0.03, -0.9], [0.45, h + 0.03, 0.35], 0.012, 6);
  k.occBox(-w / 2, 0, -l / 2, w / 2, h, l / 2, 0.5);
}
// billiard pendant: long green shade over the table (ceil = ceiling height relative to the piece origin)
export function billiardLamp(k, { ceil = 2.9, y = 1.55, I = 1.6 } = {}) {
  k.c(0x111111, 0.6); for (const z of [-0.5, 0.5]) k.tube([0, y + 0.18, z], [0, ceil, z], 0.006, 5);
  k.c(0x1f4d3a, 0.35, 0.2); k.box(-0.18, y + 0.1, -0.7, 0.18, y + 0.18, 0.7);
  k.quad([-0.18, y + 0.1, 0.7], [-0.18, y + 0.1, -0.7], [-0.26, y - 0.05, -0.72], [-0.26, y - 0.05, 0.72]);
  k.quad([0.18, y + 0.1, -0.7], [0.18, y + 0.1, 0.7], [0.26, y - 0.05, 0.72], [0.26, y - 0.05, -0.72]);
  k.c(BRASS, 0.3, 1); k.box(-0.27, y - 0.07, -0.73, 0.27, y - 0.05, 0.73, 3 | 16 | 32);
  k.in('glow', () => { k.glow(0xfff0d0, 3.5); k.box(-0.22, y - 0.04, -0.66, 0.22, y - 0.03, 0.66, 8); });
  for (const z of [-0.45, 0.45]) k.light(0, y - 0.1, z, [1, 0.88, 0.66], I, { range: 4, r0: 0.9, wrap: 0.05, dir: [0, -1, 0], cos0: 0.1, cos1: 0.7 });
}
export function sideboard(k, { w = 1.8, col = WOOD_M, recordPlayer = true, seed = 12 } = {}) {
  cabinet(k, { w, h: 0.72, d: 0.45, col, doors: 3, handle: BRASS, top: PAT.GRAIN, topCol: col });
  if (recordPlayer) {
    k.c(0x2a1c12, 0.4, 0, PAT.GRAIN, 2); k.box(-0.25, 0.72, -0.18, 0.25, 0.8, 0.18);
    k.c(0x0c0c0c, 0.3); k.cyl(-0.05, 0.8, 0, 0.15, 0.15, 0.008, 24);
    k.c(0xd9452f, 0.5); k.cyl(-0.05, 0.808, 0, 0.045, 0.045, 0.002, 12);
    k.c(0xc0c4c8, 0.2, 1); k.tube([0.18, 0.82, 0.12], [0.05, 0.815, -0.05], 0.005, 5);
    for (const x of [-w / 2 + 0.16, w / 2 - 0.16]) {
      k.c(0x2a1c12, 0.5, 0, PAT.GRAIN, 2); k.box(x - 0.12, 0.72, -0.15, x + 0.12, 1.08, 0.15);
      k.c(0x1a1a1a, 0.9, 0, PAT.FABRIC, 4); k.box(x - 0.1, 0.75, -0.151, x + 0.1, 1.05, -0.15, 32);
    }
  }
  const r = rng(seed);
  for (let i = 0; i < 5; i++) { k.c([0xd94f3d, 0x2e86c1, 0xf2c14e, 0x1d1d1f, 0xe6e0d2][i], 0.6); k.push(w / 2 + 0.05, 0, -0.1 + i * 0.012, 0, 1, 0, -0.12 - r() * 0.05); k.box(0, 0, -0.005, 0.31, 0.31, 0.005); k.pop(); }
}
export function sideTable(k, { col = WOOD_D, lamp = true } = {}) {
  k.c(col, 0.4, 0, PAT.GRAIN, 1); k.cyl(0, 0.52, 0, 0.26, 0.26, 0.03, 24); k.cyl(0, 0, 0, 0.2, 0.22, 0.02, 20); k.cyl(0, 0.02, 0, 0.03, 0.03, 0.5, 8);
  if (lamp) k.at(0.02, 0.55, 0.03, 0, () => tableLamp(k, { base: 0xb35a3c, I: 0.8 }));
  k.occBox(-0.26, 0, -0.26, 0.26, 0.55, 0.26, 0.3);
}
export function guitar(k, { col = 0xb86b2a } = {}) {
  k.c(0x111111, 0.4, 0.6); k.tube([-0.15, 0, 0.1], [0, 0.55, 0.08], 0.01, 5); k.tube([0.15, 0, 0.1], [0, 0.55, 0.08], 0.01, 5); k.tube([0, 0, -0.18], [0, 0.55, 0.08], 0.01, 5);
  k.push(0, 0.12, 0, 0, 1, -0.2);
  k.c(col, 0.25, 0, PAT.GRAIN, 3); k.sphere(0, 0.28, 0, 0.19, 16, 10, 1); k.sphere(0, 0.52, 0, 0.15, 16, 10, 1);
  k.c(0x1a120c, 0.4); k.push(0, 0.4, -0.13, 0, 1, Math.PI / 2); k.cyl(0, 0, 0, 0.055, 0.055, 0.01, 16); k.pop();
  k.c(0x3a2618, 0.4, 0, PAT.GRAIN, 3); k.box(-0.025, 0.62, -0.02, 0.025, 1.05, 0.02); k.box(-0.045, 1.05, -0.02, 0.045, 1.2, 0.02);
  k.c(0xdddddd, 0.2, 1); for (let i = 0; i < 6; i++) k.box(-0.016 + i * 0.0064, 0.3, -0.16, -0.015 + i * 0.0064, 1.05, -0.155);
  k.pop();
}
// skateboard deck mounted on a wall (facing -Z)
export function skateboard(k, { top = 0x1d1d1f, art = 0xff5a36 } = {}) {
  k.c(art, 0.5); k.rbox(-0.1, -0.4, 0.0, 0.1, 0.4, 0.015, 0.009);
  k.c(top, 0.9); k.box(-0.095, -0.38, -0.003, 0.095, 0.38, 0.0, 32);
  k.c(0xc0c4c8, 0.3, 1); for (const y of [-0.26, 0.26]) k.box(-0.08, y - 0.02, -0.03, 0.08, y + 0.02, -0.003);
  k.c(0xf2eee4, 0.5); for (const y of [-0.26, 0.26]) for (const x of [-0.09, 0.09]) { k.push(x, y, -0.05, 0, 1, 0, Math.PI / 2); k.cyl(0, -0.015, 0, 0.028, 0.028, 0.03, 10); k.pop(); }
}
// small wall shelf with objects (facing -Z, mounted at its origin)
export function wallShelf(k, { w = 1.0, col = WOOD_M, seed = 4 } = {}) {
  const r = rng(seed);
  k.c(col, 0.45, 0, PAT.GRAIN, 1); k.box(-w / 2, -0.02, -0.24, w / 2, 0.02, 0);
  k.c(0x1d1d1f, 0.4, 0.6); k.box(-w / 2 + 0.1, -0.12, -0.04, -w / 2 + 0.12, 0.0, 0); k.box(w / 2 - 0.12, -0.12, -0.04, w / 2 - 0.1, 0.0, 0);
  let x = -w / 2 + 0.06;
  while (x < w / 2 - 0.12) {
    const t = r();
    if (t < 0.45) { const n = 3 + Math.floor(r() * 5); for (let i = 0; i < n; i++) { const bw = 0.025 + r() * 0.02, bh = 0.16 + r() * 0.08; k.c([0x8e2f2a, 0x2f4f6e, 0xd8c9a0, 0x3d5e3a, 0xc2833a][Math.floor(r() * 5)], 0.7); k.box(x, 0.02, -0.2, x + bw, 0.02 + bh, -0.04); x += bw + 0.003; } x += 0.05; }
    else if (t < 0.7) { plantSmall(k, x + 0.08, 0.02, -0.12, Math.floor(r() * 100)); x += 0.18; }
    else { k.c([0xe8e2d6, 0xb35a3c, 0x2d5a63][Math.floor(r() * 3)], 0.3); k.lathe(x + 0.06, 0.02, -0.12, [[0, 0], [0.04, 0], [0.055, 0.08], [0.03, 0.16], [0, 0.16]], 12); x += 0.14; }
  }
}
export function clock(k, { r = 0.2 } = {}) {
  k.push(0, 0, -0.02, 0, 1, Math.PI / 2);
  k.c(0x1d1d1f, 0.4); k.cyl(0, -0.02, 0, r, r, 0.04, 28);
  k.c(0xf4f1ea, 0.6); k.cyl(0, -0.024, 0, r - 0.02, r - 0.02, 0.003, 28);
  k.pop();
  k.c(0x111111, 0.5); k.box(-0.006, 0, -0.046, 0.006, r * 0.55, -0.043);
  k.push(0, 0, -0.048, 0, 1, 0, -2.1); k.box(-0.004, 0, 0, 0.004, r * 0.8, 0.002); k.pop();
}
// plaster ceiling medallion at a ceiling height
export function medallion(k, { ceil = 2.9, r = 0.45 } = {}) {
  k.c(0xf6f2ea, 0.8); k.torus(0, ceil - 0.015, 0, r, 0.025, 6, 32, Math.PI / 2); k.torus(0, ceil - 0.012, 0, r * 0.7, 0.018, 6, 28, Math.PI / 2);
  k.cyl(0, ceil - 0.02, 0, r * 0.55, r * 0.6, 0.02, 24);
}
export function throwBlanket(k, { w = 0.6, l = 0.9, col = 0xb8743a } = {}) {
  k.tex('fabric', col, 1.0, 0, 1.6); k.rbox(-w / 2, 0, -l / 2, w / 2, 0.035, l / 2, 0.015);
  k.push(0, 0, l / 2, 0, 1, 1.2); k.rbox(-w / 2, -0.35, -0.02, w / 2, 0.0, 0.015, 0.01); k.pop();
}
export function cushion(k, { col = 0xd8a44a, s = 0.42, tilt = -0.3 } = {}) {
  k.tex('fabric', col, 1.0, 0, 1.5); k.push(0, 0, 0, 0, 1, tilt); k.rbox(-s / 2, 0, -0.07, s / 2, s * 0.9, 0.07, 0.07); k.pop();
}
