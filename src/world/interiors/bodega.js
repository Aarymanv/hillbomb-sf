// 21ST STREET MARKET: a Mission corner bodega at Mission St & 21st. Green stucco storefront with a striped awning and
// a lit box sign; inside: speckled VCT floor, drop ceiling with fluorescent troffers, two gondola aisles packed with
// products, a wall of glowing drink coolers, the clerk's counter with cigarettes / lotto / register, and the store cat.
import { Group } from 'three';
import { Kit, PAT, rng } from './kit.js';
import { shopSetup, shopBuild } from './shop.js';
import * as F from './furniture.js';
import { neon, text, rrect } from './atlas.js';

const SP = {
  label: '21st Street Market', hx: 4.9, hz: 8.6, gh: 3.8, floors: 1, uh: 3.1, depth: 12.0, corner: 'L',
  sf: [-4.4, 3.6], door: [-4.1, -2.9], sideShopLen: 6.6, backDoor: [2.5, 3.4],
  facade: { key: 'stucco', col: 0x2e6a52, upKey: 'stucco', upCol: 0xe7d9c0, sideCol: 0xe2d3b8, trim: 0xf3ead6 },
  frameCol: 0x1d1f23, bulkCol: 0x2e6a52, awning: { col: 0x2e6a52, stripe: 0xf3ead6, depth: 1.3 },
  floor: { col: 0xe9e3d5, rough: 0.35, pat: PAT.LINO, patS: 1 },
  wallLow: { key: 'painted_plaster', col: 0xd9d2bf }, wallUp: { key: 'painted_plaster', col: 0xefe9dc }, wainscot: 1.0,
  ceil: { col: 0xeeeae2, pat: PAT.TILE, patS: 0.5 },
};
export const FLOOR_PAD = 0.2;
const MENU = [
  { label: 'Chopped cheese', price: 7, health: 45, sub: 'Off the flat-top, extra peppers', msg: 'Chopped cheese' },
  { label: 'Soda & chips', price: 3, health: 15, sub: 'Mexican Coke, takis', msg: 'Snack break' },
  { label: 'Deli coffee', price: 2, health: 10, sub: 'Light and sweet', msg: 'Coffee' },
];
const GONDOLAS = [-2.2, 0.3];

export function setup(S) {
  const g = shopSetup(S, { ...SP, corner: S.side ?? null });
  S.box(2.85, -8.0, 3.65, -3.8, 0, 1.1);                         // counter
  for (const x of GONDOLAS) S.box(x - 0.48, -5.1, x + 0.48, 0.6, 0, 1.9);
  S.box(-SP.hx + 0.25, g.bz - 0.8, 2.35, g.bz, 0, 2.2);           // coolers
  S.box(-SP.hx + 0.25, 0.6, -4.05, 2.0, 0, 1.0);                   // coffee station
  S.box(1.0, 0.5, 2.6, 1.3, 0, 0.9);                                // freezer
  S.interact([2.2, 0, -5.9], { r: 2.0, prompt: () => '<b>21st Street Market</b>Press <kbd>E</kbd> to buy something', use: () => S.ctx.foodMenu('21st Street Market', 'COUNTER', 'Cash or card, no minimum', MENU) });
  S.lightSpots = { shop: [[-1.0, 3.0, -3.0, 0xe8f2ff, 10], [1.0, 3.0, 1.0, 0xe8f2ff, 8]] };
}

export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas);
  const g = shopBuild(k, S, { ...SP, corner: S.side ?? null, sign: reg.sign, doorSign: reg.open }, { roomOpts: { amb: [0.24, 0.25, 0.27], indirect: 0.4 } });
  const { XI, ZI, bz } = g;
  const r = rng(2121);
  k.room(g.room);
  // fluorescent troffers
  for (const x of [-2.6, 1.2]) for (const z of [-6.5, -3.5, -0.5, 2.2]) k.at(x, 0, z, 0, () => troffer(k));
  // gondolas with products
  for (const x of GONDOLAS) k.at(x, 0, -2.25, 0, () => gondola(k, 5.7, r));
  // drink coolers across the back wall
  k.at(-1.1, 0, bz - 0.42, 0, () => coolers(k, 6.8, r));
  // counter + back wall (cigarettes, lotto, bottles), register, TV, the cat
  k.at(3.25, 0, -5.9, Math.PI / 2, () => counter(k, reg, r));
  k.at(XI - 0.2, 0, -5.9, Math.PI / 2, () => backWall(k, reg, r));
  // coffee station by the front window (west corner), ice cream freezer, chips rack, newspapers
  k.at(-XI + 0.28, 0, 1.3, -Math.PI / 2, () => coffee(k));
  k.at(1.8, 0, 0.9, 0, () => freezer(k, r));
  k.at(-2.2, 0, -6.1, 0, () => chipRack(k, r));
  k.at(-0.9, 0, -6.9, 0, () => { k.c(0x2e6a52, 0.5, 0.3); k.box(-0.35, 0, -0.25, 0.35, 1.0, 0.25); for (let i = 0; i < 6; i++) { k.c(i % 2 ? 0xe9e3d5 : 0xd8d0b8, 0.9); k.box(-0.32, 0.4 + i * 0.1, -0.22, 0.32, 0.43 + i * 0.1, 0.2); } k.occBox(-0.35, 0, -0.25, 0.35, 1.0, 0.25, 0.4); });
  // posters on the side windows + wall
  k.at(-XI + 0.02, 1.9, -1.5, -Math.PI / 2, () => F.frame(k, { w: 0.8, h: 1.0, region: reg.lotto, col: 0xd23b2e, mat: 0xf2c14e }));
  // ATM
  k.at(-XI + 0.35, 0, -0.35, -Math.PI / 2, () => { k.c(0x2b3a52, 0.4, 0.4); k.box(-0.35, 0, -0.3, 0.35, 1.6, 0.3); k.sign([0.25, 1.05, -0.305], [-0.25, 1.05, -0.305], [-0.25, 1.45, -0.305], [0.25, 1.45, -0.305], reg.atm, 'sign'); k.occBox(-0.35, 0, -0.3, 0.35, 1.6, 0.3, 0.4); });
  const out = k.toMeshes(ctx.mats);
  const group = out.groups[''] || new Group(), ext = out.groups.x || new Group();
  const door = ctx.pivot(out.groups.sdoor, g.doorPivot[0], 0, g.doorPivot[1]); ext.add(door);
  let o = 0;
  return {
    group, ext, drawCalls: out.drawCalls, stats: out.stats,
    update(dt, info) {
      const p = info.playerLocal, near = p && Math.abs(p[0] - (SP.door[0] + SP.door[1]) / 2) < 1.6 && Math.abs(p[2] + SP.hz) < 2.2 && p[1] < 2;
      o += Math.sign((near ? 1 : 0) - o) * Math.min(Math.abs((near ? 1 : 0) - o), dt * 2.6);
      door.rotation.y = o * o * (3 - 2 * o) * 1.6; door.updateMatrix();
    },
  };
}

const PROD = [0xd23b2e, 0xf2c14e, 0x2e86c1, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf2eee4, 0x1d1d20, 0xe84393, 0x16a085, 0xc0392b, 0xf39c12];
function troffer(k) {
  const ceil = SP.gh - 0.02;
  k.c(0xe8e6e0, 0.5); k.box(-0.62, ceil - 0.03, -0.31, 0.62, ceil, 0.31, 63 & ~4);
  k.in('glow', () => { k.glow([0.9, 0.95, 1.0], 3.4); k.box(-0.57, ceil - 0.035, -0.26, 0.57, ceil - 0.03, 0.26, 8); });
  k.light(0, ceil - 0.2, 0, [0.88, 0.94, 1.0], 1.3, { range: 7, r0: 1.6, wrap: 0.1, dir: [0, -1, 0], cos0: -0.3, cos1: 0.45 });
}
// double-sided shelving run along z (length L), products on both faces
function gondola(k, L, r) {
  k.c(0xe9e7e2, 0.4, 0.3); k.box(-0.06, 0, -L / 2, 0.06, 1.75, L / 2);
  k.c(0x2e6a52, 0.5, 0.3); k.box(-0.47, 0, -L / 2, 0.47, 0.12, L / 2); k.box(-0.47, 0, -L / 2 - 0.04, 0.47, 1.8, -L / 2); k.box(-0.47, 0, L / 2, 0.47, 1.8, L / 2 + 0.04);
  for (let s = 0; s < 5; s++) {
    const y = 0.12 + s * 0.34;
    k.c(0xe9e7e2, 0.4, 0.3); k.box(-0.46, y, -L / 2, 0.46, y + 0.02, L / 2);
    k.c(0xf2c14e, 0.4); k.box(-0.47, y - 0.04, -L / 2, -0.46, y + 0.02, L / 2); k.box(0.46, y - 0.04, -L / 2, 0.47, y + 0.02, L / 2);
    if (s === 4) continue;
    for (const side of [-1, 1]) {
      let z = -L / 2 + 0.03;
      while (z < L / 2 - 0.08) {
        const w = 0.07 + r() * 0.14, h = 0.12 + r() * 0.17, d = 0.18 + r() * 0.2, col = PROD[Math.floor(r() * PROD.length)];
        const n = 1 + Math.floor(r() * 4);
        for (let i = 0; i < n && z < L / 2 - 0.08; i++) {
          k.c(col, 0.45);
          if (r() < 0.25) k.cyl(side * 0.3, y + 0.02, z + w / 2, w / 2, w / 2, h, 8);
          else k.box(side > 0 ? 0.44 - d : -0.44, y + 0.02, z, side > 0 ? 0.44 : -0.44 + d, y + 0.02 + h, z + w);
          z += w + 0.008;
        }
        z += 0.02;
      }
    }
  }
  k.occBox(-0.47, 0, -L / 2, 0.47, 1.8, L / 2, 0.5, 0.3);
}
function coolers(k, L, r) {
  // glass-door reach-in coolers (front faces -Z), glowing interiors full of bottles
  const n = 7, dw = L / n, H = 2.1;
  k.c(0x1d1f23, 0.4, 0.4); k.box(-L / 2 - 0.05, 0, -0.4, L / 2 + 0.05, H + 0.35, 0.4, 63 & ~32);
  k.c(0xdfe6ea, 0.5, 0.2); k.box(-L / 2, 0.1, -0.38, L / 2, 0.15, 0.36, 4); k.box(-L / 2, H - 0.05, -0.38, L / 2, H, 0.36, 8);
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + i * dw;
    k.in('glow', () => { k.glow([0.85, 0.95, 1.0], 2.4); k.box(x0 + 0.06, 0.15, 0.3, x0 + dw - 0.06, H - 0.05, 0.32, 32); k.glow([0.95, 0.98, 1.0], 5); k.box(x0 + 0.08, H - 0.1, -0.36, x0 + 0.12, H - 0.06, 0.3, 8 | 2 | 1); });
    for (let s = 0; s < 5; s++) {
      const y = 0.18 + s * 0.38;
      k.c(0x9aa3ad, 0.3, 0.8); k.box(x0 + 0.06, y - 0.02, -0.3, x0 + dw - 0.06, y, 0.28);
      for (let b = 0; b < 6; b++) {
        const col = PROD[Math.floor(r() * PROD.length)], bx = x0 + 0.12 + b * (dw - 0.2) / 6;
        k.c(col, 0.3, 0.2); k.cyl(bx, y, -0.12, 0.035, 0.035, 0.2 + r() * 0.08, 8); k.cyl(bx, y, 0.05, 0.035, 0.035, 0.2, 8);
      }
    }
    k.c(0x1d1f23, 0.35, 0.5); k.box(x0, 0.1, -0.44, x0 + 0.05, H, -0.4); k.box(x0, H - 0.05, -0.44, x0 + dw, H, -0.4);
    k.c(0xc0c4c8, 0.2, 1); k.box(x0 + dw - 0.14, 0.9, -0.48, x0 + dw - 0.11, 1.6, -0.44);
    k.in('glass', () => k.quad([x0 + dw - 0.02, 0.12, -0.42], [x0 + 0.05, 0.12, -0.42], [x0 + 0.05, H - 0.05, -0.42], [x0 + dw - 0.02, H - 0.05, -0.42]));
    k.light(x0 + dw / 2, 1.1, -0.7, [0.8, 0.92, 1.0], 0.45, { range: 2.8, r0: 0.8 });
  }
  k.c(0xd23b2e, 0.4); k.box(-L / 2 - 0.05, H + 0.05, -0.41, L / 2 + 0.05, H + 0.35, -0.4);
  k.occBox(-L / 2, 0, -0.4, L / 2, H + 0.35, 0.4, 0.4, 0.3);
}
function counter(k, reg, r) {
  // front faces -Z (customer side); clerk behind (+Z)
  k.tex('wood_floor', 0x5a3a24, 0.6); k.box(-2.0, 0, -0.35, 2.0, 1.0, 0.35);
  k.c(0xe9e3d5, 0.3, 0, PAT.TERRAZZO, 3); k.box(-2.05, 1.0, -0.42, 2.05, 1.05, 0.4);
  k.c(0xd23b2e, 0.5); k.box(-2.01, 0.1, -0.36, 2.01, 0.25, 0.35);
  // candy rack on the front face, lotto terminal, register, gum
  for (let i = 0; i < 18; i++) { k.c(PROD[i % PROD.length], 0.5); k.box(-1.8 + (i % 9) * 0.4, 0.35 + Math.floor(i / 9) * 0.22, -0.38, -1.5 + (i % 9) * 0.4, 0.52 + Math.floor(i / 9) * 0.22, -0.35); }
  k.c(0x1d1f23, 0.3, 0.5); k.box(0.6, 1.05, -0.1, 1.1, 1.25, 0.25); k.box(0.65, 1.25, 0.1, 1.05, 1.45, 0.25);
  k.in('glow', () => { k.glow(0x6aff9a, 2); k.box(0.68, 1.3, 0.099, 1.02, 1.42, 0.1, 32); });
  k.c(0x2e86c1, 0.4); k.box(-1.4, 1.05, -0.15, -1.0, 1.3, 0.15); k.sign([-1.02, 1.1, -0.155], [-1.38, 1.1, -0.155], [-1.38, 1.28, -0.155], [-1.02, 1.28, -0.155], reg.lotto, 'sign');
  for (let i = 0; i < 8; i++) { k.c(PROD[(i * 5) % PROD.length], 0.4); k.box(-0.6 + (i % 4) * 0.12, 1.05, -0.3 + Math.floor(i / 4) * 0.1, -0.52 + (i % 4) * 0.12, 1.15, -0.22 + Math.floor(i / 4) * 0.1); }
  // the store cat, curled up on the counter
  k.at(1.55, 1.05, 0.0, 0.4, () => {
    k.c(0xd98a3a, 0.9, 0, PAT.FABRIC, 4); k.sphere(0, 0.09, 0, 0.17, 12, 8, 0.55); k.sphere(0.13, 0.12, 0.05, 0.075, 10, 8);
    k.c(0xb86a28, 0.9); k.box(0.16, 0.18, 0.02, 0.18, 0.22, 0.04); k.box(0.16, 0.18, 0.08, 0.18, 0.22, 0.1);
    k.c(0xd98a3a, 0.9); k.tube([-0.14, 0.05, 0.05], [0.05, 0.03, 0.17], 0.025, 6);
  });
  k.occBox(-2.05, 0, -0.42, 2.05, 1.05, 0.4, 0.5);
  void r;
}
function backWall(k, reg, r) {
  // shelving behind the clerk (front faces -Z toward the counter): cigarettes, bottles, TV
  k.tex('wood_floor', 0x3a2618, 0.6); k.box(-2.1, 0, -0.2, 2.1, 2.4, 0.18);
  for (let s = 0; s < 4; s++) {
    const y = 1.0 + s * 0.35;
    k.c(0xe9e3d5, 0.4); k.box(-2.0, y, -0.25, 2.0, y + 0.02, -0.2);
    for (let i = 0; i < 26; i++) { const x = -1.95 + i * 0.15; k.c(s < 2 ? PROD[(i + s) % 6] : [0x6a3a1a, 0x2a4a2a, 0xe8d8a8, 0x7a1a2a][(i + s) % 4], s < 2 ? 0.5 : 0.25, 0, 0); if (s < 2) k.box(x, y + 0.02, -0.24, x + 0.12, y + 0.14, -0.2); else k.cyl(x + 0.06, y + 0.02, -0.21, 0.035, 0.035, 0.26, 8); }
  }
  k.in('glow', () => { k.glow(0xfff1dc, 2.2); k.box(-2.0, 2.35, -0.22, 2.0, 2.37, -0.2, 8); });
  k.light(0, 2.1, -0.6, [1, 0.92, 0.8], 0.6, { range: 3, r0: 0.8, dir: [0, -1, 0], cos0: -0.2, cos1: 0.5 });
  k.c(0x1d1d20, 0.3); k.box(0.9, 2.45, -0.3, 1.8, 2.95, -0.2);
  k.sign([1.78, 2.47, -0.305], [0.92, 2.47, -0.305], [0.92, 2.93, -0.305], [1.78, 2.93, -0.305], reg.tv, 'sign');
  void r;
}
function coffee(k) {
  F.cabinet(k, { w: 1.4, h: 0.9, d: 0.55, col: 0x2e6a52, doors: 2, top: 'marble', topCol: 0xe8e2d6 });
  k.c(0x1d1d20, 0.3, 0.5); for (const x of [-0.35, 0.2]) { k.box(x - 0.18, 0.9, -0.15, x + 0.18, 1.4, 0.22); k.c(0xd0d4d8, 0.2, 1); k.cyl(x, 0.95, -0.05, 0.08, 0.08, 0.22, 12); k.c(0x1d1d20, 0.3, 0.5); }
  for (let i = 0; i < 5; i++) { k.c(0xf2eee4, 0.4); k.cyl(0.5, 0.9 + i * 0.02, 0.0, 0.04, 0.035, 0.02, 10); }
}
function freezer(k, r) {
  k.c(0xf2f0ea, 0.4); k.box(-0.8, 0, -0.4, 0.8, 0.85, 0.4);
  k.in('glow', () => { k.glow([0.8, 0.9, 1.0], 1.4); k.box(-0.72, 0.55, -0.32, 0.72, 0.56, 0.32, 4); });
  for (let i = 0; i < 12; i++) { k.c(PROD[Math.floor(r() * PROD.length)], 0.4); k.box(-0.65 + (i % 6) * 0.22, 0.56, -0.25 + Math.floor(i / 6) * 0.26, -0.47 + (i % 6) * 0.22, 0.66, -0.05 + Math.floor(i / 6) * 0.26); }
  k.in('glass', () => k.quad([-0.75, 0.85, 0.35], [0.75, 0.85, 0.35], [0.75, 0.85, -0.35], [-0.75, 0.85, -0.35]));
  k.c(0x2e86c1, 0.4); k.box(-0.81, 0.3, -0.41, 0.81, 0.5, -0.4);
  k.occBox(-0.8, 0, -0.4, 0.8, 0.85, 0.4, 0.4);
}
function chipRack(k, r) {
  k.c(0x1d1d20, 0.4, 0.6); k.box(-0.4, 0, -0.02, 0.4, 1.7, 0.02); k.box(-0.35, 0, -0.25, 0.35, 0.05, 0.25);
  for (let row = 0; row < 6; row++) for (let i = 0; i < 5; i++) { k.c(PROD[Math.floor(r() * PROD.length)], 0.35); k.push(-0.32 + i * 0.16, 0.3 + row * 0.24, -0.07, (r() - 0.5) * 0.2, 1, 0, (r() - 0.5) * 0.15); k.rbox(-0.065, -0.1, -0.035, 0.065, 0.1, 0.03, 0.028); k.pop(); }
  k.c(0xd23b2e, 0.5); k.box(-0.4, 1.7, -0.03, 0.4, 1.85, 0.03);
}

function regions(atlas) {
  const sign = atlas.region('bd:sign', 512, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f7f1e2'); g.addColorStop(1, '#e8dcc0'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2e6a52'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
    text(c, '21ST ST MARKET', w * 0.36, h / 2 + 2, 40, '#d23b2e', { track: 2 });
    text(c, 'GROCERY · DELI · LIQUOR', w * 0.8, h / 2 + 2, 18, '#2e6a52', { track: 1 });
  });
  const open = atlas.region('bd:open', 128, 48, (c, w, h) => { c.strokeStyle = '#2e7bff'; c.lineWidth = 3; c.shadowColor = '#2e7bff'; c.shadowBlur = 8; rrect(c, 6, 6, w - 12, h - 12, 8); c.stroke(); c.shadowBlur = 0; neon(c, 'OPEN', w / 2, h / 2 + 1, 30, '#ff3050', { glow: 0.6 }); });
  const lotto = atlas.region('bd:lotto', 128, 160, (c, w, h) => {
    c.fillStyle = '#f2c14e'; c.fillRect(0, 0, w, h); c.fillStyle = '#d23b2e'; c.beginPath(); c.arc(w / 2, 58, 44, 0, 7); c.fill();
    text(c, 'LOTTO', w / 2, 60, 30, '#fff'); text(c, '$212', w / 2, 120, 30, '#1d1d20'); text(c, 'MILLION', w / 2, 146, 16, '#1d1d20', { track: 2 });
  });
  const atm = atlas.region('bd:atm', 80, 64, (c, w, h) => { c.fillStyle = '#0e2a52'; c.fillRect(0, 0, w, h); text(c, 'ATM', w / 2, 24, 22, '#4cd964'); c.fillStyle = '#5aa9ff'; c.fillRect(10, 40, w - 20, 10); });
  const tv = atlas.region('bd:tv', 128, 72, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1f6b3a'); g.addColorStop(1, '#0e3a1e'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(10, 10, w - 20, h - 20); c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w / 2, h - 10); c.stroke(); text(c, 'SF 2 · LA 1', w / 2, h - 8, 12, '#fff', { track: 1 }); });
  return { sign, open, lotto, atm, tv };
}
