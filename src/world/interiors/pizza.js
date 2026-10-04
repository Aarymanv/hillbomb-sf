// BELLA NONNA PIZZERIA: a North Beach slice shop on Columbus Ave. Red-brick storefront with a green striped awning,
// neon PIZZA blade; inside: small white tiles, exposed brick, a glowing wood-fired oven, a glass pizza display at the
// counter, gingham-covered tables with Chianti bottles, framed photos and warm pendants. E at the counter to order.
import { Group } from 'three';
import { Kit, PAT } from './kit.js';
import { shopSetup, shopBuild } from './shop.js';
import * as F from './furniture.js';
import { neon, text } from './atlas.js';

const SP = {
  label: 'Bella Nonna Pizzeria', hx: 6.3, hz: 10.5, gh: 4.0, floors: 2, uh: 3.1, depth: 12.8, corner: null,
  sf: [-5.8, 5.8], door: [-0.6, 0.6], backDoor: [4.0, 4.9],
  facade: { key: 'brick_red', col: 0x8e3a2a, upKey: 'stucco', upCol: 0xe6d6ba, trim: 0x2f5d3a },
  frameCol: 0x22382a, bulkCol: 0x2f5d3a, awning: { col: 0x2f5d3a, stripe: 0xf3ead6, depth: 1.5 },
  floor: { key: 'tiles', col: 0xefe8dc, rough: 0.4, scale: 1 },
  wallLow: { key: 'brick_red', col: null, rough: 0.95 }, wallUp: { key: 'painted_plaster', col: 0xefe2c6 }, wainscot: 1.6,
  ceil: { col: 0xe9e0cf },
};
export const FLOOR_PAD = 0.2;
const MENU = [
  { label: 'Slice & a soda', price: 5, health: 30, sub: 'Pepperoni, thin crust, folded', msg: 'Slice & soda' },
  { label: 'Whole pie', price: 18, health: 80, sub: 'Margherita out of the wood oven', msg: 'Whole pie' },
  { label: 'Garlic knots', price: 4, health: 15, sub: 'Six knots, marinara', msg: 'Garlic knots' },
];
const TABLES = [[-3.8, -7.6], [0.2, -7.6], [3.9, -7.6], [-3.8, -4.4], [3.9, -4.4]];

export function setup(S) {
  const g = shopSetup(S, { ...SP, corner: S.side ?? null });
  S.box(-5.9, -2.0, 2.6, -1.2, 0, 1.2);                        // counter
  S.box(-4.3, g.bz - 1.9, -0.7, g.bz, 0, 2.4);                  // oven
  for (const [x, z] of TABLES) S.box(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 0, 0.8);
  S.interact([-1.6, 0, -2.6], { r: 2.2, prompt: () => '<b>Bella Nonna</b>Press <kbd>E</kbd> to order', use: () => S.ctx.foodMenu('Bella Nonna Pizzeria', 'COUNTER', 'By the slice since 1961', MENU) });
  S.lightSpots = { shop: [[-1.5, 3.3, -5.5, 0xffc88a, 12], [0, 3.2, 0, 0xff9a5a, 8]] };
}

export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas);
  const g = shopBuild(k, S, { ...SP, corner: S.side ?? null, sign: reg.band, blade: reg.blade, doorSign: reg.open }, { roomOpts: { amb: [0.26, 0.19, 0.13], indirect: 0.35 } });
  const { XI, ZI, bz } = g;
  k.room(g.room);
  k.c(0x2f5d3a, 0.5); k.box(-XI, 1.58, -ZI, -XI + 0.04, 1.66, bz); k.box(XI - 0.04, 1.58, -ZI, XI, 1.66, bz); k.box(-XI, 1.58, bz - 0.04, XI, 1.66, bz);
  // counter with a glass pizza display
  k.at(-1.65, 0, -1.6, 0, () => counter(k, 8.5, reg));
  // wood-fired oven against the back wall
  k.at(-2.5, 0, bz - 0.95, 0, () => oven(k));
  // prep bench + shelves with cans / flour
  k.at(2.2, 0, bz - 0.35, 0, () => { F.cabinet(k, { w: 3.0, h: 0.9, d: 0.6, col: 0xb9bec4, handle: 0x2b2e33, doors: 4, top: 'metal', topCol: 0xd4d9de }); k.c(0xefe6d2, 0.9, 0, PAT.FABRIC, 3); k.rbox(-0.9, 0.9, -0.15, -0.3, 1.0, 0.15, 0.04); k.c(0xd8c8a0, 0.9, 0, PAT.FABRIC, 2); for (let i = 0; i < 3; i++) k.rbox(0.2 + i * 0.35, 0.9, 0.0, 0.5 + i * 0.35, 1.3, 0.25, 0.05); k.c(0x6a4428, 0.4, 0, PAT.GRAIN, 1); for (const y of [1.6, 2.0]) k.box(-1.5, y, 0.05, 1.5, y + 0.03, 0.3); for (let i = 0; i < 16; i++) { k.c(i % 2 ? 0xc0392b : 0xf2c14e, 0.4, 0.2); k.cyl(-1.35 + (i % 8) * 0.38, i < 8 ? 1.63 : 2.03, 0.18, 0.06, 0.06, 0.16, 10); } });
  // tables with gingham cloths, chairs, chianti bottles, candles
  for (const [x, z] of TABLES) k.at(x, 0, z, 0, () => table(k, reg));
  for (const [x, z] of TABLES) for (const [dx, dz, a] of [[0, -0.7, 0], [0, 0.7, Math.PI]]) k.at(x + dx, 0, z + dz, a, () => F.chair(k, { col: 0x5a3a22, seat: 0x8a2a22, h: 0.46 }));
  for (const [x, z] of TABLES) k.at(x, 0, z, 0, () => F.pendant(k, { ceil: SP.gh - 0.02, y: 2.3, shade: 0x2f5d3a, style: 'dome', I: 0.9, range: 4 }));
  // wall photos, PIZZA neon in the window, bunting, plants
  for (const [z, r] of [[-8.0, reg.photo1], [-5.5, reg.photo2], [-3.0, reg.photo1]]) k.at(-XI + 0.02, 2.4, z, -Math.PI / 2, () => F.frame(k, { w: 0.7, h: 0.55, region: r, col: 0x2a1c12, mat: 0xf1e9d6 }));
  for (const [z, r] of [[-7.0, reg.photo2], [-4.0, reg.photo1]]) k.at(XI - 0.02, 2.4, z, Math.PI / 2, () => F.frame(k, { w: 0.7, h: 0.55, region: r, col: 0x2a1c12, mat: 0xf1e9d6 }));
  k.sign([3.2, 1.6, -ZI + 0.1], [5.2, 1.6, -ZI + 0.1], [5.2, 2.4, -ZI + 0.1], [3.2, 2.4, -ZI + 0.1], reg.pizzaNeon, 'sign');
  k.light(4.2, 2.0, -ZI + 0.5, [1, 0.35, 0.25], 0.6, { range: 3, r0: 0.7 });
  const cols = [0x2f8a3a, 0xf2eee4, 0xc8323a];
  for (let i = 0; i < 20; i++) { const x = -XI + 0.4 + i * (2 * XI - 0.8) / 19; k.c(cols[i % 3], 0.8); k.quad([x - 0.12, SP.gh - 0.35 - Math.sin(i / 19 * Math.PI) * 0.25, -3.2], [x + 0.12, SP.gh - 0.35 - Math.sin(i / 19 * Math.PI) * 0.25, -3.2], [x, SP.gh - 0.6 - Math.sin(i / 19 * Math.PI) * 0.25, -3.2], [x, SP.gh - 0.6 - Math.sin(i / 19 * Math.PI) * 0.25, -3.2]); }
  k.at(XI - 0.45, 0, -ZI + 0.6, 0, () => F.plant(k, { h: 1.3, seed: 91, pot: 0xb35a3c, kind: 'palm' }));
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

function counter(k, L, reg) {
  k.tex('wood_floor', 0x5a3a22, 0.55); k.box(-L / 2, 0.1, -0.4, L / 2, 1.0, 0.4);
  k.c(0x2f5d3a, 0.5); k.box(-L / 2 + 0.02, 0, -0.35, L / 2 - 0.02, 0.1, 0.4);
  k.tex('marble', 0xefece6, 0.4); k.box(-L / 2 - 0.04, 1.0, -0.45, L / 2 + 0.04, 1.05, 0.45);
  // heated glass display with pies
  k.at(-1.5, 1.05, 0.0, 0, () => {
    k.c(0xd4d9de, 0.25, 1); k.box(-1.4, 0, -0.4, 1.4, 0.04, 0.4); k.box(-1.4, 0.55, -0.4, 1.4, 0.58, 0.4);
    for (let i = 0; i < 4; i++) { const x = -1.05 + i * 0.7; k.c(0x9aa3ad, 0.3, 0.9); k.cyl(x, 0.04, 0, 0.3, 0.3, 0.01, 20); k.c([0xd9a24a, 0xe0b050, 0xc8783a, 0xe8c070][i], 0.7); k.cyl(x, 0.05, 0, 0.28, 0.28, 0.025, 20); k.c(0xb8321e, 0.6); for (let j = 0; j < 7; j++) k.cyl(x + Math.cos(j * 0.9) * 0.15 * (j % 2 + 0.5), 0.075, Math.sin(j * 0.9) * 0.15 * (j % 2 + 0.5), 0.035, 0.035, 0.006, 8); }
    k.in('glass', () => { k.quad([1.4, 0.04, -0.41], [-1.4, 0.04, -0.41], [-1.4, 0.55, -0.41], [1.4, 0.55, -0.41]); k.quad([-1.4, 0.55, -0.41], [1.4, 0.55, -0.41], [1.4, 0.55, 0.4], [-1.4, 0.55, 0.4]); });
    k.in('glow', () => { k.glow(0xffb070, 2.6); k.box(-1.35, 0.535, -0.3, 1.35, 0.545, 0.3, 8); });
    k.light(0, 0.3, -0.7, [1, 0.7, 0.4], 0.6, { range: 2.5, r0: 0.6 });
  });
  k.c(0x1d1d20, 0.3, 0.4); k.box(2.4, 1.05, -0.15, 2.9, 1.25, 0.2); k.in('glow', () => { k.glow(0x6aff9a, 2); k.box(2.45, 1.1, -0.151, 2.85, 1.2, -0.15, 32); });
  k.c(0xc0c4c8, 0.3, 1); k.box(0.6, 1.05, -0.2, 1.0, 1.3, 0.2);
  k.occBox(-L / 2, 0, -0.45, L / 2, 1.05, 0.45, 0.5);
  void reg;
}
function oven(k) {
  // brick dome oven with a glowing mouth (front faces -Z)
  k.tex('brick_red', null, 0.95, 0, 1.5); k.box(-1.8, 0, -0.9, 1.8, 1.0, 0.9);
  k.tex('brick_red', 0x8a3a2a, 0.95, 0, 1.5); k.sphere(0, 1.0, 0.1, 1.45, 20, 10, 0.75);
  k.c(0x2a2622, 0.8); k.box(-0.75, 1.0, -1.02, 0.75, 1.6, -0.88);
  k.in('glow', () => { k.glow(0xff7a2a, 4.5); k.box(-0.55, 1.03, -0.95, 0.55, 1.45, -0.93, 32); k.glow(0xffc070, 7); k.box(-0.3, 1.04, -0.94, 0.3, 1.2, -0.92, 32); });
  k.light(0, 1.25, -1.6, [1, 0.5, 0.2], 2.2, { range: 5, r0: 1.0, wrap: 0.2 });
  k.c(0x2a2622, 0.5, 0.6); k.box(-0.9, 1.0, -1.25, 0.9, 1.05, -0.9);
  k.c(0x8a8a8a, 0.4, 0.8); k.cyl(0.9, 2.1, 0.4, 0.18, 0.18, 1.8, 12);
  k.c(0xc79a5b, 0.5, 0, PAT.GRAIN, 3); k.tube([1.1, 0.0, -1.0], [1.35, 1.8, -1.05], 0.02, 6); k.box(1.2, 1.75, -1.2, 1.5, 1.77, -0.95);
  for (let i = 0; i < 8; i++) { k.c(0x6a4a2a, 0.9, 0, PAT.GRAIN, 4); k.cyl(-1.5 + (i % 4) * 0.2, 0.1 + Math.floor(i / 4) * 0.2, -0.95, 0.09, 0.09, 0.9, 8); }
  k.occBox(-1.8, 0, -0.9, 1.8, 2.0, 0.9, 0.5);
}
function table(k, reg) {
  F.table(k, { w: 0.9, d: 0.9, h: 0.75, top: 0xefe6d2, legs: 0x2a1c12 });
  const w = 0.49, y = 0.755, y0 = 0.52;
  k.sign([-w, y, w], [w, y, w], [w, y, -w], [-w, y, -w], reg.gingham, 'paint');
  k.sign([w, y0, -w], [-w, y0, -w], [-w, y, -w], [w, y, -w], reg.gingham, 'paint'); k.sign([-w, y0, w], [w, y0, w], [w, y, w], [-w, y, w], reg.gingham, 'paint');
  k.sign([-w, y0, -w], [-w, y0, w], [-w, y, w], [-w, y, -w], reg.gingham, 'paint'); k.sign([w, y0, w], [w, y0, -w], [w, y, -w], [w, y, w], reg.gingham, 'paint');
  // chianti bottle in straw + candle
  k.c(0x1f4a2a, 0.15); k.lathe(0.1, 0.753, 0.05, [[0, 0], [0.07, 0], [0.085, 0.08], [0.06, 0.16], [0.015, 0.2], [0.015, 0.3], [0, 0.3]], 12);
  k.c(0xc9a86a, 0.9, 0, PAT.FABRIC, 6); k.lathe(0.1, 0.753, 0.05, [[0.075, 0], [0.09, 0.08], [0.07, 0.15], [0, 0.15]], 12);
  k.c(0xf2eee4, 0.4); k.cyl(0.1, 1.05, 0.05, 0.012, 0.012, 0.08, 6);
  k.in('glow', () => { k.glow(0xffb050, 4); k.sphere(0.1, 1.15, 0.05, 0.012, 6, 4, 1.8); });
  k.light(0.1, 1.2, 0.05, [1, 0.62, 0.28], 0.35, { range: 1.8, r0: 0.4 });
  k.c(0xf2eee4, 0.3); k.cyl(-0.2, 0.753, -0.2, 0.14, 0.14, 0.012, 16); k.c(0xd9a24a, 0.7); k.cyl(-0.2, 0.765, -0.2, 0.12, 0.12, 0.01, 16);
}

function regions(atlas) {
  const band = atlas.region('pz:band', 512, 56, (c, w, h) => { c.fillStyle = '#16241a'; c.fillRect(0, 0, w, h); neon(c, 'BELLA NONNA', w * 0.34, h / 2 + 1, 34, '#ff4436', { glow: 0.5, track: 3 }); neon(c, 'PIZZERIA', w * 0.78, h / 2 + 1, 26, '#42e06a', { glow: 0.5, track: 4 }); });
  const blade = atlas.region('pz:blade', 72, 216, (c, w, h) => { c.fillStyle = '#16241a'; c.fillRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); neon(c, 'PIZZA', 0, 2, 44, '#ff4436', { glow: 0.6, track: 6 }); c.restore(); });
  const pizzaNeon = atlas.region('pz:neon', 192, 80, (c, w, h) => { neon(c, 'PIZZA', w / 2, h * 0.42, 40, '#ff4436', { glow: 0.8, track: 4 }); neon(c, 'BY THE SLICE', w / 2, h * 0.8, 16, '#42e06a', { glow: 0.6, track: 2 }); });
  const open = atlas.region('pz:open', 128, 40, (c, w, h) => { neon(c, 'APERTO', w / 2, h / 2 + 1, 24, '#42e06a', { glow: 0.6 }); });
  const gingham = atlas.region('pz:gingham', 64, 64, (c, w, h) => { c.fillStyle = '#f4efe6'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(200,40,40,.55)'; for (let i = 0; i < 8; i += 2) { c.fillRect(i * 8, 0, 8, h); c.fillRect(0, i * 8, w, 8); } });
  const photo1 = atlas.region('pz:ph1', 112, 88, (c, w, h) => { c.fillStyle = '#d8d0c0'; c.fillRect(0, 0, w, h); c.fillStyle = '#6a6258'; c.fillRect(8, h * 0.55, w - 16, h * 0.4); c.fillStyle = '#4a443c'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(22 + i * 22, h * 0.45, 7, 0, 7); c.fill(); c.fillRect(16 + i * 22, h * 0.5, 12, 22); } });
  const photo2 = atlas.region('pz:ph2', 112, 88, (c, w, h) => { c.fillStyle = '#cfc6b4'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a544a'; c.fillRect(10, 30, 36, 50); c.fillRect(56, 18, 44, 62); c.fillStyle = '#8a8272'; c.fillRect(0, h - 10, w, 10); text(c, 'NORTH BEACH 1961', w / 2, 10, 10, '#3a342c', { track: 1 }); });
  return { band, blade, pizzaNeon, open, gingham, photo1, photo2 };
}
