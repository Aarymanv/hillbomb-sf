// SEA LION DINER: a stainless 1950s diner at Beach & Taylor (Fisherman's Wharf). Checkerboard floor, red vinyl
// booths along the windows, a long counter with chrome stools, back bar with pie case and milkshake mixers,
// kitchen pass-through, jukebox, teal neon cove lighting and a rooftop neon sign. E at the counter to order.
import { Group } from 'three';
import { Kit, PAT } from './kit.js';
import { shopSetup, shopBuild } from './shop.js';
import * as F from './furniture.js';
import { neon, text, rrect } from './atlas.js';

const SP = {
  label: 'Sea Lion Diner', hx: 9.4, hz: 10.8, gh: 4.4, floors: 0, uh: 3.2, depth: 13.0, corner: 'R',
  sf: [-8.8, 8.9], door: [-2.3, -0.8], sideShopLen: 9.0, backDoor: [5.2, 6.2],
  facade: { key: 'metal', col: 0xd5dbe0, trim: 0xc8323a, metal: 0.7, rough: 0.6 },
  frameCol: 0xb9bfc5, bulkCol: 0xc8323a,
  floor: { col: 0xf2efe8, rough: 0.28, pat: PAT.CHECKER, patS: 1 },
  wallLow: { key: 'metal', col: 0xc9cfd5, rough: 0.55 }, wallUp: { key: 'painted_plaster', col: 0xf3ead7 }, wainscot: 1.15,
  ceil: { col: 0xf1ede4 },
};
export const FLOOR_PAD = 0.2;
const MENU = [
  { label: 'Burger & milkshake', price: 15, health: 60, sub: 'Double smash, fries, black-and-white shake', msg: 'Burger & shake' },
  { label: 'Clam chowder bread bowl', price: 11, health: 45, sub: 'The Wharf classic', msg: 'Chowder' },
  { label: 'Coffee & apple pie', price: 6, health: 25, sub: 'Bottomless drip', msg: 'Pie & coffee' },
];

export function setup(S) {
  const g = shopSetup(S, { ...SP, corner: S.side ?? null });
  // counter, booths (seat backs), jukebox, back bar
  S.box(-7.8, -3.1, 4.6, -2.2, 0, 1.1);
  S.box(-XIo(), 0.6, SP.hx - 0.25, g.bz, 0, 1.2);
  for (const x of boothXs()) S.box(x - 1.05, -SP.hz + 0.25, x + 1.05, -SP.hz + 2.2, 0, 1.0);
  for (const z of sideBoothZs()) S.box(SP.hx - 2.2, z - 1.05, SP.hx - 0.25, z + 1.05, 0, 1.0);
  S.box(-SP.hx + 0.25, -6.0, -SP.hx + 1.0, -4.8, 0, 1.6);
  S.interact([-1.6, 0, -3.7], { r: 2.4, prompt: () => '<b>Sea Lion Diner</b>Press <kbd>E</kbd> to order', use: () => S.ctx.foodMenu('Sea Lion Diner', 'COUNTER', 'Pull up a stool', MENU) });
  S.lightSpots = { shop: [[-2.0, 3.6, -5.5, 0xffe4c4, 14], [4.0, 3.6, -6.5, 0xd8f4ff, 10]] };
}
const XIo = () => SP.hx - 0.25;
const boothXs = () => [-7.4, -4.9, 1.2, 3.7, 6.2];
const sideBoothZs = () => [-6.8, -4.3];

export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas);
  const sp = { ...SP, corner: S.side ?? null, sign: reg.band, doorSign: reg.open };
  const g = shopBuild(k, S, sp, { roomOpts: { amb: [0.26, 0.24, 0.23], indirect: 0.4 } });
  const { XI, ZI, bz } = g;
  k.room(g.room);
  // teal neon cove around the ceiling + red band at the wainscot cap
  k.in('glow', () => { k.glow(0x3ee6d6, 3.2); k.box(-XI + 0.05, SP.gh - 0.32, -ZI + 0.05, XI - 0.05, SP.gh - 0.29, -ZI + 0.09); k.box(-XI + 0.05, SP.gh - 0.32, bz - 0.09, XI - 0.05, SP.gh - 0.29, bz - 0.05); k.box(-XI + 0.05, SP.gh - 0.32, -ZI, -XI + 0.09, SP.gh - 0.29, bz); });
  for (let x = -7; x <= 7; x += 3.5) k.light(x, SP.gh - 0.5, -ZI + 0.4, [0.3, 0.9, 0.85], 0.5, { range: 4, r0: 1 });
  k.c(0xc8323a, 0.4); k.box(-XI, 1.12, -ZI, -XI + 0.03, 1.22, bz); k.box(-XI, 1.12, bz - 0.03, XI, 1.22, bz); k.box(XI - 0.03, 1.12, -ZI, XI, 1.22, bz);
  // ceiling fixtures: rows of flush lights
  for (const x of [-6, -2, 2, 6]) for (const z of [-8.4, -5.8]) k.at(x, 0, z, 0, () => F.ceilingDisc(k, { ceil: SP.gh - 0.02, I: 1.1, r: 0.25, col: [1, 0.92, 0.8] }));
  // booths along the front windows + the east windows
  for (const x of boothXs()) k.at(x, 0, -ZI + 1.0, 0, () => booth(k));
  for (const z of sideBoothZs()) k.at(XI - 1.0, 0, z, Math.PI / 2, () => booth(k));
  // counter with stools
  k.at(-1.6, 0, -2.65, 0, () => counter(k, 12.4));
  for (let i = 0; i < 9; i++) k.at(-7.2 + i * 1.35, 0, -3.55, 0, () => F.stool(k, { h: 0.78, seat: 0xc8323a, metal: 0xc9cfd5 }));
  for (let i = 0; i < 4; i++) k.at(-6.2 + i * 3.2, 0, -2.65, 0, () => F.pendant(k, { ceil: SP.gh - 0.02, y: 2.35, style: 'globe', I: 1.0, range: 5 }));
  // back bar: cabinets, pie case, coffee, shake mixers, pass-through + menu boards
  k.at(-2.0, 0, bz - 0.35, 0, () => backBar(k, reg));
  // jukebox, clock, EAT neon, wall art
  k.at(-XI + 0.45, 0, -5.4, -Math.PI / 2, () => jukebox(k));
  k.at(-XI + 0.02, 2.6, -8.5, -Math.PI / 2, () => k.sign([0.9, -0.35, 0], [-0.9, -0.35, 0], [-0.9, 0.35, 0], [0.9, 0.35, 0], reg.eat, 'sign'));
  k.light(-XI + 0.6, 2.6, -8.5, [1, 0.3, 0.55], 0.6, { range: 3.5, r0: 0.8 });
  k.at(-XI + 0.02, 2.4, -1.4, -Math.PI / 2, () => F.frame(k, { w: 1.0, h: 0.7, region: reg.poster, col: 0xc9cfd5 }));
  // rooftop neon sign on a steel frame
  k.room(-1);
  k.c(0x2b2e33, 0.4, 0.5);
  for (const x of [-5.5, 5.5]) k.box(x - 0.08, SP.gh, -SP.hz + 0.6, x + 0.08, SP.gh + 2.8, -SP.hz + 0.76);
  k.box(-6.2, SP.gh + 1.0, -SP.hz + 0.72, 6.2, SP.gh + 2.9, -SP.hz + 0.8);
  k.signZ(0, SP.gh + 1.95, -SP.hz + 0.71, 12.0, 1.9, reg.neon, 'sign');
  if (S.side === 'R') k.signX(SP.hx + 0.02, SP.gh - 0.5, -2.0, 6.0, 0.7, reg.band, 'sign', 1);
  // chrome trim bands on the facade
  k.c(0xe8ecef, 0.25, 1); k.box(-SP.hx - 0.02, 0.62, -SP.hz - 0.03, SP.hx + 0.03, 0.7, -SP.hz); k.box(SP.hx, 0.62, -SP.hz, SP.hx + 0.03, 0.7, SP.hz);
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

function booth(k) {
  // table centred, benches at -z and +z (front faces -Z)
  const red = 0xc8323a, chrome = 0xd4d9de;
  k.c(chrome, 0.2, 1); k.cyl(0, 0, 0, 0.2, 0.24, 0.03, 16); k.cyl(0, 0.03, 0, 0.04, 0.04, 0.7, 10);
  k.c(0xe9e3d3, 0.3, 0, PAT.TERRAZZO, 3); k.box(-0.62, 0.72, -0.38, 0.62, 0.76, 0.38);
  k.c(chrome, 0.2, 1); k.box(-0.63, 0.715, -0.39, 0.63, 0.725, 0.39, 1 | 2 | 16 | 32);
  for (const s of [-1, 1]) {
    k.push(0, 0, s * 0.78, s > 0 ? Math.PI : 0);
    k.c(0x6b1a20, 0.6); k.box(-0.95, 0, -0.28, 0.95, 0.42, 0.28);
    k.tex('leather', red, 0.5); k.rbox(-0.93, 0.4, -0.3, 0.93, 0.5, 0.26, 0.05); k.rbox(-0.93, 0.45, 0.2, 0.93, 1.15, 0.36, 0.06);
    k.c(chrome, 0.2, 1); k.box(-0.95, 1.15, 0.2, 0.95, 1.18, 0.37);
    k.pop();
  }
  // condiments + napkins + tabletop jukebox selector
  k.c(0xc8323a, 0.3); k.cyl(-0.35, 0.76, 0.12, 0.03, 0.03, 0.18, 8); k.c(0xf2c14e, 0.3); k.cyl(-0.28, 0.76, 0.12, 0.03, 0.03, 0.18, 8);
  k.c(chrome, 0.2, 1); k.box(-0.52, 0.76, 0.05, -0.42, 0.88, 0.2); k.box(0.35, 0.76, 0.15, 0.6, 0.95, 0.3);
  k.in('glow', () => { k.glow(0xffd28a, 1.6); k.box(0.37, 0.8, 0.149, 0.58, 0.92, 0.15, 32); });
  k.c(0xf2eee4, 0.3); k.cyl(0.1, 0.76, -0.15, 0.1, 0.1, 0.012, 16); k.cyl(-0.1, 0.76, 0.12, 0.1, 0.1, 0.012, 16);
  k.c(0x3a1f14, 0.4); k.cyl(0.1, 0.772, -0.15, 0.06, 0.06, 0.012, 12);
  k.occBox(-0.95, 0, -1.1, 0.95, 1.2, 1.1, 0.5);
  k.at(0, 0, 0, 0, () => F.pendant(k, { ceil: SP.gh - 0.02, y: 1.95, shade: 0xc8323a, style: 'dome', I: 0.9, range: 4 }));
}
function counter(k, L) {
  // front faces -Z (stool side)
  k.tex('metal', 0xc9cfd5, 0.55, 1); k.box(-L / 2, 0.12, -0.4, L / 2, 1.0, 0.4);
  k.c(0xc8323a, 0.4); k.box(-L / 2 - 0.01, 0.12, -0.41, L / 2 + 0.01, 0.3, 0.4);
  k.c(0xd4d9de, 0.2, 1); k.box(-L / 2 - 0.01, 0.84, -0.42, L / 2 + 0.01, 0.9, 0.4); k.box(-L / 2, 0, -0.35, L / 2, 0.12, 0.4);
  k.c(0xe9e3d3, 0.28, 0, PAT.TERRAZZO, 3); k.box(-L / 2 - 0.05, 1.0, -0.5, L / 2 + 0.05, 1.05, 0.45);
  k.c(0xd4d9de, 0.2, 1); k.box(-L / 2 - 0.06, 0.99, -0.52, L / 2 + 0.06, 1.01, 0.46, 1 | 2 | 32);
  k.tube([-L / 2, 0.22, -0.55], [L / 2, 0.22, -0.55], 0.025, 8);
  // pie dome, register, napkin holders, sugar, menus
  k.c(0xd4d9de, 0.2, 1); k.cyl(3.2, 1.05, 0, 0.22, 0.22, 0.03, 20);
  k.c(0xe8b04a, 0.6); k.cyl(3.2, 1.08, 0, 0.18, 0.2, 0.06, 20);
  k.in('glass', () => k.sphere(3.2, 1.08, 0, 0.22, 16, 8, 0.8));
  k.c(0x2b2e33, 0.3, 0.6); k.box(L / 2 - 0.9, 1.05, -0.15, L / 2 - 0.4, 1.25, 0.2); k.box(L / 2 - 0.85, 1.25, 0.0, L / 2 - 0.45, 1.4, 0.18);
  k.in('glow', () => { k.glow(0x6aff9a, 2); k.box(L / 2 - 0.82, 1.3, -0.001, L / 2 - 0.48, 1.36, 0.0, 32); });
  for (let x = -L / 2 + 0.9; x < L / 2 - 1; x += 2.7) { k.c(0xd4d9de, 0.2, 1); k.box(x - 0.08, 1.05, -0.15, x + 0.08, 1.18, -0.05); k.c(0xf2eee4, 0.4); k.cyl(x + 0.25, 1.05, -0.1, 0.03, 0.035, 0.1, 8); }
  k.occBox(-L / 2, 0, -0.5, L / 2, 1.05, 0.45, 0.5);
}
function backBar(k, reg) {
  const L = 16.0;
  F.cabinet(k, { w: L, h: 0.95, d: 0.62, col: 0xc9cfd5, handle: 0x2b2e33, doors: 16, top: 'marble', topCol: 0xe9e3d3 });
  // pie case (glowing), coffee brewers, shake mixers
  k.at(-5.0, 0.95, 0, 0, () => {
    k.c(0xd4d9de, 0.2, 1); k.box(-0.7, 0, -0.28, 0.7, 0.05, 0.28); k.box(-0.7, 0.7, -0.28, 0.7, 0.75, 0.28);
    for (const y of [0.05, 0.38]) { for (let i = 0; i < 4; i++) { k.c([0xe8b04a, 0x7a2a3a, 0xf2eee4, 0x5a3a24][i], 0.6); k.cyl(-0.5 + i * 0.33, y, 0, 0.13, 0.14, 0.07, 14); } }
    k.in('glass', () => { k.quad([0.7, 0.05, -0.285], [-0.7, 0.05, -0.285], [-0.7, 0.7, -0.285], [0.7, 0.7, -0.285]); });
    k.in('glow', () => { k.glow(0xfff1d6, 3); k.box(-0.65, 0.69, -0.2, 0.65, 0.7, 0.2, 8); });
    k.light(0, 0.4, -0.5, [1, 0.9, 0.75], 0.5, { range: 2.2, r0: 0.5 });
  });
  for (const x of [-1.8, -1.0]) k.at(x, 0.95, 0.05, 0, () => { k.c(0x1d1d20, 0.3, 0.5); k.box(-0.25, 0, -0.2, 0.25, 0.55, 0.22); k.c(0xd4d9de, 0.2, 1); k.box(-0.2, 0.55, -0.15, 0.2, 0.6, 0.2); k.in('glass', () => k.lathe(0, 0.03, -0.05, [[0, 0], [0.09, 0], [0.1, 0.18], [0.06, 0.24], [0, 0.24]], 12)); k.c(0x2a150a, 0.4); k.cyl(0, 0.03, -0.05, 0.085, 0.09, 0.1, 12); k.in('glow', () => { k.glow(0xff5a36, 2); k.box(-0.2, 0.08, -0.201, -0.14, 0.12, -0.2, 32); }); });
  for (const x of [0.6, 1.3, 2.0]) k.at(x, 0.95, 0.05, 0, () => { k.tex('metal', 0x7fc8c0, 0.4, 0.5); k.box(-0.13, 0, -0.05, 0.13, 0.12, 0.2); k.box(-0.06, 0.12, 0.1, 0.06, 0.55, 0.2); k.box(-0.1, 0.45, -0.05, 0.1, 0.55, 0.2); k.c(0xd4d9de, 0.15, 1); k.cyl(0, 0.12, 0, 0.05, 0.06, 0.2, 12); });
  // open shelves with mugs + pass-through to the kitchen + menu boards
  k.c(0xd4d9de, 0.25, 1); for (const y of [1.6, 1.95]) k.box(-L / 2, y, 0.05, -2.4, y + 0.03, 0.3);
  for (let i = 0; i < 22; i++) { const x = -L / 2 + 0.3 + (i % 11) * 0.45, y = i < 11 ? 1.63 : 1.98; k.c(i % 3 ? 0xf2eee4 : 0xc8323a, 0.3); k.cyl(x, y, 0.17, 0.045, 0.04, 0.09, 10); }
  k.c(0xd4d9de, 0.3, 0.8); k.box(3.0, 1.2, 0.3, 6.5, 2.2, 0.32, 32);
  k.in('glow', () => { k.glow(0xfff0dc, 1.3); k.box(3.1, 1.25, 0.31, 6.4, 2.15, 0.33, 32); });
  k.c(0x6f757c, 0.3, 1); for (let i = 0; i < 4; i++) { k.box(3.3 + i * 0.85, 1.25, 0.3, 3.35 + i * 0.85, 2.15, 0.31, 32); } k.box(3.1, 1.7, 0.29, 6.4, 1.73, 0.3, 32);
  for (let i = 0; i < 6; i++) { k.c([0x9aa3ad, 0x2a2a2c, 0xc0c4c8][i % 3], 0.3, 0.9); k.cyl(3.4 + i * 0.5, 1.73, 0.3, 0.12, 0.14, 0.2, 10); }
  k.in('glow', () => { k.glow(0xff8a3a, 2.2); for (let i = 0; i < 3; i++) k.box(3.5 + i * 1.1, 2.12, 0.0, 4.0 + i * 1.1, 2.16, 0.25, 8); });
  k.light(4.75, 2.0, 0.1, [1, 0.55, 0.25], 0.7, { range: 2.5, r0: 0.6, dir: [0, -1, 0], cos0: 0, cos1: 0.6 });
  k.c(0xd4d9de, 0.2, 1); k.box(3.0, 1.18, 0.0, 6.5, 1.22, 0.4);
  for (let i = 0; i < 4; i++) { k.c(0xf2eee4, 0.3); k.cyl(3.4 + i * 0.85, 1.22, 0.2, 0.12, 0.12, 0.012, 14); k.c([0x9a5a2a, 0xe8c04a, 0x7a3a1a, 0xd8d0b8][i], 0.6); k.sphere(3.4 + i * 0.85, 1.25, 0.2, 0.07, 8, 6, 0.5); }
  k.sign([-2.5, 2.25, 0.29], [-7.9, 2.25, 0.29], [-7.9, 3.35, 0.29], [-2.5, 3.35, 0.29], reg.menu, 'sign');
  k.light(-5.2, 2.8, -0.6, [1, 0.95, 0.85], 0.5, { range: 3, r0: 1 });
  k.occBox(-L / 2, 0, -0.31, L / 2, 0.95, 0.31, 0.5);
}
function jukebox(k) {
  k.c(0x7a1a24, 0.3, 0.2); k.box(-0.45, 0, -0.3, 0.45, 1.1, 0.3);
  k.c(0xd4d9de, 0.2, 1); k.torus(0, 1.1, -0.01, 0.45, 0.05, 8, 24, 0);
  k.in('glow', () => { k.glow(0xffb040, 2.4); k.box(-0.38, 0.2, -0.305, 0.38, 0.9, -0.3, 32); k.glow(0x40e0ff, 2.6); k.box(-0.44, 0.1, -0.31, -0.4, 1.05, -0.28, 32); k.box(0.4, 0.1, -0.31, 0.44, 1.05, -0.28, 32); k.glow(0xff4a8a, 2.2); k.sphere(0, 1.1, -0.1, 0.38, 16, 8, 1); });
  k.light(0, 0.8, -0.8, [1, 0.6, 0.35], 0.8, { range: 3, r0: 0.7 });
  k.occBox(-0.45, 0, -0.3, 0.45, 1.5, 0.3, 0.5);
}

function regions(atlas) {
  const neonR = atlas.region('dn:neon', 512, 96, (c, w, h) => {
    c.fillStyle = 'rgba(10,12,18,.9)'; rrect(c, 2, 2, w - 4, h - 4, 18); c.fill();
    c.strokeStyle = '#3ee6d6'; c.lineWidth = 4; c.shadowColor = '#3ee6d6'; c.shadowBlur = 12; rrect(c, 8, 8, w - 16, h - 16, 14); c.stroke(); c.shadowBlur = 0;
    neon(c, 'Sea Lion', w * 0.36, h * 0.5, 54, '#ff4a8a', { font: `'Brush Script MT','Segoe Script',cursive`, weight: 700, italic: true, glow: 0.7 });
    neon(c, 'DINER', w * 0.8, h * 0.52, 44, '#3ee6d6', { glow: 0.6, track: 4 });
  });
  const band = atlas.region('dn:band', 512, 48, (c, w, h) => { c.fillStyle = '#c8323a'; c.fillRect(0, 0, w, h); neon(c, 'SEA LION DINER  ·  OPEN 24 HOURS', w / 2, h / 2 + 1, 28, '#fff4d6', { glow: 0.3, track: 3 }); });
  const open = atlas.region('dn:open', 128, 48, (c, w, h) => { neon(c, 'OPEN', w / 2, h / 2 + 1, 36, '#ff3050', { glow: 0.7 }); });
  const eat = atlas.region('dn:eat', 192, 72, (c, w, h) => { neon(c, 'EAT', w * 0.5, h / 2 + 2, 60, '#ff4a8a', { glow: 0.8, track: 10 }); });
  const menu = atlas.region('dn:menu', 480, 96, (c, w, h) => {
    c.fillStyle = '#12151a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d4d9de'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
    const cols = [['BURGERS', 'Smash 9.50', 'Patty melt 10', 'Chili dog 7'], ['BREAKFAST', 'Pancakes 8', 'Hash & eggs 11', 'French toast 9'], ['SHAKES', 'Choc 6', 'Strawberry 6', 'Black & white 6.5']];
    cols.forEach((cl, i) => { const x = 20 + i * 155; text(c, cl[0], x, 20, 20, '#f2c14e', { align: 'left', track: 2 }); cl.slice(1).forEach((t, j) => text(c, t, x, 44 + j * 17, 15, '#f2eee4', { align: 'left', weight: 600 })); });
  });
  const poster = atlas.region('dn:poster', 160, 112, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3ec7c0'); g.addColorStop(1, '#f2e6c8'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#5a4a3a'; c.beginPath(); c.ellipse(w * 0.5, h * 0.62, 40, 16, -0.2, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.33, h * 0.5, 12, 0, 7); c.fill();
    text(c, 'PIER 39', w / 2, 16, 18, '#12151a', { track: 3 });
  });
  return { neon: neonR, band, open, eat, menu, poster };
}
