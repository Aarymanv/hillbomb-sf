// FOGLINE COFFEE: a Hayes Valley third-wave cafe at Hayes & Octavia, in the ground floor of a butter-yellow
// Victorian. Black steel-and-glass storefront, white tile + plaster walls, warm oak floor, espresso bar with a big
// chrome machine and a glowing pastry case, chalkboard menu, edison pendants, window bar, communal table, plants.
import { Group } from 'three';
import { Kit, PAT } from './kit.js';
import { shopSetup, shopBuild } from './shop.js';
import * as F from './furniture.js';
import { neon, text, rrect } from './atlas.js';

const SP = {
  label: 'Fogline Coffee', hx: 5.4, hz: 10.6, gh: 4.0, floors: 2, uh: 3.1, depth: 13.5, corner: 'R',
  sf: [-4.9, 4.9], door: [-4.55, -3.35], sideShopLen: 8.2, backDoor: [3.4, 4.3],
  facade: { key: 'siding', col: 0x23262b, upKey: 'siding', upCol: 0xe6d49a, sideCol: 0xe0cd92, trim: 0xf3ead6 },
  frameCol: 0x16181b, bulkCol: 0x23262b,
  floor: { key: 'wood_floor', col: 0xa07a52, rough: 0.55 },
  wallLow: { key: 'tiles', col: 0xf2f0ea, rough: 0.35 }, wallUp: { key: 'painted_plaster', col: 0xefe8dc }, wainscot: 1.25,
  ceil: { col: 0xe6dfd2 },
};
export const FLOOR_PAD = 0.2;
const MENU = [
  { label: 'Espresso', price: 4, health: 25, stamina: true, sub: 'Double shot. Sprint stamina refilled', msg: 'Espresso' },
  { label: 'Oat latte & croissant', price: 9, health: 45, stamina: true, sub: 'Flaky, buttery, very SF', msg: 'Latte & croissant' },
  { label: 'Cold brew', price: 5, health: 20, stamina: true, sub: 'Twelve-hour steep', msg: 'Cold brew' },
];
const BAR = { x0: -4.2, x1: 2.6, z: 0.55 };

export function setup(S) {
  const g = shopSetup(S, { ...SP, corner: S.side ?? null });
  S.box(BAR.x0, BAR.z - 0.4, BAR.x1, BAR.z + 0.4, 0, 1.1);
  S.box(-SP.hx + 0.25, g.bz - 0.5, SP.hx - 0.25, g.bz, 0, 2.4);
  S.box(3.6, -7.9, 4.6, -2.3, 0, 0.8);                           // communal table
  S.box(-3.1, -10.35, 4.9, -9.85, 0, 1.0);                        // window bar
  for (const [x, z] of TABLES) S.box(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0, 0.8);
  S.interact([-0.8, 0, -0.35], { r: 2.3, prompt: () => '<b>Fogline Coffee</b>Press <kbd>E</kbd> to order', use: () => S.ctx.foodMenu('Fogline Coffee', 'ESPRESSO BAR', 'Single origin, roasted in the Dogpatch', MENU) });
  S.lightSpots = { shop: [[-1.0, 3.3, -4.0, 0xffd29a, 12], [2.5, 3.3, -6.5, 0xffd29a, 8]] };
}
const TABLES = [[-2.6, -7.2], [0.4, -7.2], [-2.6, -4.4], [0.4, -4.4]];

export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas);
  const g = shopBuild(k, S, { ...SP, corner: S.side ?? null, sign: reg.band, blade: reg.blade, signBucket: 'paint', doorSign: reg.open }, { roomOpts: { amb: [0.24, 0.2, 0.16], indirect: 0.35 } });
  const { XI, ZI, bz } = g;
  k.room(g.room);
  // chair rail on the tile line
  k.c(0x2a2d31, 0.5); k.box(-XI, 1.22, -ZI, -XI + 0.03, 1.28, bz); k.box(XI - 0.03, 1.22, -ZI, XI, 1.28, bz); k.box(-XI, 1.22, bz - 0.03, XI, 1.28, bz);
  // espresso bar
  k.at((BAR.x0 + BAR.x1) / 2, 0, BAR.z, 0, () => bar(k, BAR.x1 - BAR.x0, reg));
  // back wall: shelves with coffee bags + chalk menu + cups
  k.at(-0.8, 0, bz - 0.25, 0, () => backShelves(k, reg));
  // seating: window bar + stools, café tables + chairs, communal table under the Octavia windows
  k.at(0, 0, -ZI + 0.25, 0, () => { k.tex('wood_floor', 0x8a6040, 0.5); k.box(-3.1, 1.02, -0.25, 4.8, 1.07, 0.2); k.c(0x16181b, 0.4, 0.6); for (const x of [-2.9, -0.2, 2.4, 4.6]) k.box(x - 0.02, 0.0, 0.1, x + 0.02, 1.02, 0.14); k.occBox(-3.1, 0.9, -0.25, 4.8, 1.07, 0.2, 0.3); });
  for (const x of [-2.4, -1.1, 0.6, 2.0, 3.4]) k.at(x, 0, -ZI + 0.85, Math.PI, () => F.stool(k, { h: 0.74, seat: 0x3a2618, metal: 0x16181b }));
  for (const [x, z] of TABLES) {
    k.at(x, 0, z, 0, () => F.table(k, { w: 0.7, round: true, top: 0xe8e2d6, legs: 0x16181b, pat: PAT.NONE, metal: 0.6 }));
    k.at(x, 0, z - 0.62, 0, () => F.chair(k, { col: 0x3a2618, h: 0.45 })); k.at(x, 0, z + 0.62, Math.PI, () => F.chair(k, { col: 0x3a2618, h: 0.45 }));
    k.at(x + 0.1, 0.75, z + 0.05, 0, () => { k.c(0xf2eee4, 0.3); k.cyl(0, 0, 0, 0.07, 0.07, 0.01, 14); k.cyl(0, 0.01, 0, 0.045, 0.035, 0.07, 12); k.c(0x6a3e20, 0.5); k.cyl(0, 0.075, 0, 0.04, 0.04, 0.003, 12); });
  }
  k.at(4.1, 0, -5.1, 0, () => { F.table(k, { w: 0.9, d: 5.4, h: 0.75, top: 0x8a6040, legs: 0x16181b, metal: 0.5 }); });
  for (let i = 0; i < 4; i++) k.at(3.35, 0, -7.1 + i * 1.3, -Math.PI / 2, () => F.chair(k, { col: 0x16181b, h: 0.45 }));
  for (let i = 0; i < 4; i++) k.at(4.1, 0.75, -7.0 + i * 1.3, 0, () => { k.c(0xc0c4c8, 0.4, 0.6); k.box(-0.18, 0, -0.12, 0.18, 0.012, 0.12); k.c(0x1d1d20, 0.3, 0.3); k.push(0, 0.012, 0.02, 0, 1, -1.2); k.box(-0.17, 0, -0.005, 0.17, 0.22, 0.0); k.pop(); });
  // edison pendants, hanging plants, fiddle-leaf fig, art
  for (const x of [-3.4, -1.9, -0.4, 1.1]) k.at(x, 0, BAR.z - 0.2, 0, () => F.edison(k, { ceil: SP.gh - 0.02, y: 2.45 + (x % 2) * 0.1, I: 0.8 }));
  for (const z of [-7.0, -5.0, -3.1]) k.at(4.1, 0, z, 0, () => F.edison(k, { ceil: SP.gh - 0.02, y: 2.3, I: 0.7 }));
  for (const [x, z] of TABLES) k.at(x, 0, z, 0, () => F.pendant(k, { ceil: SP.gh - 0.02, y: 2.35, shade: 0xf2eee4, style: 'cone', I: 0.6, range: 3.5 }));
  for (const [x, z] of [[-4.2, -8.8], [2.8, -9.2], [-1.2, -9.0]]) k.at(x, 0, z, 0, () => hangingPlant(k));
  k.at(-XI + 0.45, 0, -2.2, 0, () => F.plant(k, { h: 1.9, seed: 71, kind: 'bush', pot: 0xe8e2d6 }));
  k.at(-XI + 0.02, 2.4, -5.0, -Math.PI / 2, () => F.frame(k, { w: 1.3, h: 0.9, region: reg.art, col: 0x16181b }));
  k.at(-XI + 0.02, 2.2, -7.8, -Math.PI / 2, () => F.frame(k, { w: 0.6, h: 0.8, region: reg.art2, col: 0xc59a4a }));
  k.at(-XI + 0.45, 0, -6.3, -Math.PI / 2, () => { k.tex('leather', 0x6a3e20, 0.6); k.rbox(-1.6, 0.0, -0.25, 1.6, 0.45, 0.25, 0.04); k.rbox(-1.6, 0.4, 0.15, 1.6, 0.95, 0.28, 0.05); k.occBox(-1.6, 0, -0.25, 1.6, 0.95, 0.28, 0.45); });
  // outside: sidewalk A-frame + bench
  k.room(-1);
  k.at(-1.2, S.groundLocal(-1.2, -SP.hz - 1.6) + 0.01, -SP.hz - 1.6, 0.2, () => { k.c(0x16181b, 0.5); k.push(0, 0, -0.18, 0, 1, 0.18); k.box(-0.3, 0, -0.02, 0.3, 0.95, 0.02); k.sign([0.27, 0.1, -0.025], [-0.27, 0.1, -0.025], [-0.27, 0.92, -0.025], [0.27, 0.92, -0.025], reg.aframe, 'paint'); k.pop(); k.push(0, 0, 0.18, 0, 1, -0.18); k.box(-0.3, 0, -0.02, 0.3, 0.95, 0.02); k.pop(); });
  k.at(2.6, S.groundLocal(2.6, -SP.hz - 0.5) + 0.01, -SP.hz - 0.45, 0, () => { k.tex('wood_floor', 0x8a6040, 0.6); k.box(-0.9, 0.42, -0.2, 0.9, 0.47, 0.2); k.c(0x16181b, 0.4, 0.6); for (const x of [-0.8, 0.8]) k.box(x - 0.03, 0, -0.18, x + 0.03, 0.42, 0.18); });
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

function bar(k, L, reg) {
  // front faces -Z (customers); barista behind
  k.tex('wood_floor', 0x6a4428, 0.55); k.box(-L / 2, 0.1, -0.38, L / 2, 1.0, 0.35);
  k.c(0x16181b, 0.5); k.box(-L / 2 + 0.02, 0, -0.33, L / 2 - 0.02, 0.1, 0.35);
  k.tex('marble', 0xefece6, 0.4); k.box(-L / 2 - 0.04, 1.0, -0.45, L / 2 + 0.04, 1.05, 0.42);
  // espresso machine (chrome, 3 group heads)
  k.at(-1.2, 1.05, 0.1, 0, () => {
    k.tex('metal', 0xd9dde1, 0.35, 1); k.box(-0.45, 0, -0.25, 0.45, 0.48, 0.25);
    k.c(0xd23b2e, 0.3, 0.3); k.box(-0.46, 0.1, -0.255, 0.46, 0.18, -0.25);
    k.c(0x1d1d20, 0.3, 0.6); for (const x of [-0.28, 0, 0.28]) { k.cyl(x, 0.2, -0.3, 0.035, 0.04, 0.07, 10); k.tube([x, 0.24, -0.33], [x, 0.24, -0.45], 0.01, 5); }
    k.c(0xd9dde1, 0.2, 1); k.box(-0.42, 0.48, -0.2, 0.42, 0.5, 0.2); for (let i = 0; i < 6; i++) { k.c(0xf2eee4, 0.3); k.cyl(-0.3 + i * 0.12, 0.5, 0.0, 0.035, 0.03, 0.07, 10); }
    k.c(0x1d1d20, 0.4); k.box(-0.4, 0.0, -0.32, 0.4, 0.03, -0.25);
  });
  // grinders
  for (const x of [-0.3, 0.05]) k.at(x, 1.05, 0.2, 0, () => { k.c(0x1d1d20, 0.35, 0.5); k.box(-0.1, 0, -0.1, 0.1, 0.35, 0.12); k.in('glass', () => k.lathe(0, 0.35, 0, [[0.03, 0], [0.09, 0.12], [0.09, 0.2], [0, 0.2]], 10)); k.c(0x3a2012, 0.6); k.cyl(0, 0.36, 0, 0.07, 0.08, 0.09, 10); });
  // pastry case (glowing) on the right
  k.at(L / 2 - 0.85, 1.05, -0.05, 0, () => {
    k.c(0x16181b, 0.4, 0.5); k.box(-0.7, 0, -0.35, 0.7, 0.05, 0.35); k.box(-0.7, 0.55, -0.35, 0.7, 0.58, 0.35);
    for (const y of [0.05, 0.3]) for (let i = 0; i < 5; i++) { k.c([0xd9a45a, 0xc47a3a, 0xf0dcb0, 0x7a4a2a, 0xe8b87a][(i + (y > 0.1 ? 2 : 0)) % 5], 0.7); k.rbox(-0.6 + i * 0.26, y, -0.15, -0.44 + i * 0.26, y + 0.07, 0.05, 0.03); }
    k.c(0x9aa3ad, 0.3, 0.8); k.box(-0.68, 0.27, -0.3, 0.68, 0.29, 0.3);
    k.in('glass', () => { k.quad([0.7, 0.05, -0.36], [-0.7, 0.05, -0.36], [-0.7, 0.55, -0.36], [0.7, 0.55, -0.36]); k.quad([-0.7, 0.55, -0.36], [0.7, 0.55, -0.36], [0.7, 0.55, 0.36], [-0.7, 0.55, 0.36]); });
    k.in('glow', () => { k.glow(0xfff0d8, 2.8); k.box(-0.66, 0.535, -0.3, 0.66, 0.545, 0.3, 8); });
    k.light(0, 0.3, -0.6, [1, 0.88, 0.7], 0.5, { range: 2.2, r0: 0.5 });
  });
  // register + tip jar + cups
  k.at(0.9, 1.05, -0.1, 0, () => { k.c(0xe9e6e0, 0.3); k.box(-0.15, 0, -0.1, 0.15, 0.03, 0.12); k.c(0x1d1d20, 0.3, 0.3); k.box(-0.12, 0.03, 0.0, 0.12, 0.2, 0.02); k.in('glow', () => { k.glow(0xf2f4f8, 1.5); k.box(-0.11, 0.05, -0.001, 0.11, 0.19, 0.0, 32); }); k.in('glass', () => k.cyl(0.35, 0, -0.1, 0.07, 0.07, 0.16, 12)); });
  k.occBox(-L / 2, 0, -0.45, L / 2, 1.05, 0.42, 0.5);
  void reg;
}
function backShelves(k, reg) {
  const W = 9.6;
  F.cabinet(k, { w: W, h: 0.9, d: 0.5, col: 0xe9e6e0, handle: 0x16181b, doors: 10, top: 'marble', topCol: 0xefece6 });
  k.c(0x6a4428, 0.4, 0, PAT.GRAIN, 1);
  for (const y of [1.55, 1.95, 2.35]) k.box(-W / 2, y, -0.05, -0.9, y + 0.04, 0.25);
  const bag = [0xd9c9a8, 0x2a2d31, 0xc9a06a, 0xe9e6e0];
  for (const y of [1.59, 1.99, 2.39]) for (let i = 0; i < 12; i++) { k.c(bag[(i + Math.round(y * 10)) % 4], 0.8); k.rbox(-W / 2 + 0.15 + i * 0.31, y, 0.0, -W / 2 + 0.37 + i * 0.31, y + 0.28, 0.14, 0.02); }
  k.sign([3.9, 1.35, 0.2], [-0.4, 1.35, 0.2], [-0.4, 3.35, 0.2], [3.9, 3.35, 0.2], reg.menu, 'paint');
  k.c(0x6a4428, 0.4, 0, PAT.GRAIN, 1); k.box(-0.45, 1.3, 0.18, 3.95, 1.35, 0.25); k.box(-0.45, 3.35, 0.18, 3.95, 3.4, 0.25); k.box(-0.45, 1.3, 0.18, -0.4, 3.4, 0.25); k.box(3.9, 1.3, 0.18, 3.95, 3.4, 0.25);
  k.light(1.75, 3.6, -0.7, [1, 0.85, 0.65], 0.8, { range: 3.5, r0: 1, dir: [0, -0.4, 1], cos0: 0, cos1: 0.6 });
}
function hangingPlant(k) {
  const y = SP.gh - 0.9;
  k.c(0x6a4428, 0.8); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.tube([Math.cos(a) * 0.12, y + 0.1, Math.sin(a) * 0.12], [0, SP.gh - 0.02, 0], 0.004, 3); }
  k.c(0xe8e2d6, 0.5); k.lathe(0, y - 0.1, 0, [[0, 0], [0.1, 0], [0.14, 0.2], [0, 0.2]], 12);
  for (let i = 0; i < 12; i++) { const a = i * 1.7, rr = 0.1 + (i % 3) * 0.04; k.c(i % 2 ? 0x3f6e3a : 0x5a8a3a, 0.7); k.sphere(Math.cos(a) * rr, y + 0.05 - (i % 4) * 0.12, Math.sin(a) * rr, 0.06, 6, 4); }
}

function regions(atlas) {
  const band = atlas.region('cf:band', 512, 56, (c, w, h) => { c.fillStyle = '#16181b'; c.fillRect(0, 0, w, h); text(c, 'FOGLINE  COFFEE', w / 2, h / 2 + 2, 36, '#e2c27a', { font: `Georgia,'Times New Roman',serif`, weight: 700, track: 8 }); });
  const blade = atlas.region('cf:blade', 96, 216, (c, w, h) => { c.fillStyle = '#16181b'; rrect(c, 2, 2, w - 4, h - 4, 12); c.fill(); c.strokeStyle = '#e2c27a'; c.lineWidth = 3; rrect(c, 8, 8, w - 16, h - 16, 9); c.stroke(); c.fillStyle = '#e2c27a'; c.beginPath(); c.ellipse(w / 2, 70, 22, 30, 0.3, 0, 7); c.fill(); c.strokeStyle = '#16181b'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2 - 6, 45); c.quadraticCurveTo(w / 2 + 8, 70, w / 2 - 4, 96); c.stroke(); text(c, 'FOGLINE', w / 2, 140, 19, '#e2c27a', { track: 2 }); text(c, 'COFFEE', w / 2, 166, 19, '#f3ead6', { track: 3 }); });
  const menu = atlas.region('cf:menu', 320, 150, (c, w, h) => {
    c.fillStyle = '#23282a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.01})`; c.fillRect((i * 37) % w, (i * 53) % h, 2, 1); }
    text(c, 'ESPRESSO', 20, 22, 22, '#f2eee4', { align: 'left', track: 3, font: `'Segoe Print','Comic Sans MS',cursive`, weight: 700 });
    const items = [['Espresso', '4'], ['Cortado', '4.5'], ['Oat latte', '5.5'], ['Cold brew', '5'], ['Pour over', '6']];
    items.forEach(([a, b], i) => { text(c, a, 24, 52 + i * 18, 15, '#e9e3d6', { align: 'left', font: `'Segoe Print','Comic Sans MS',cursive`, weight: 600 }); text(c, b, 170, 52 + i * 18, 15, '#e2c27a', { align: 'right', font: `'Segoe Print','Comic Sans MS',cursive`, weight: 600 }); });
    text(c, 'PASTRY', 200, 22, 22, '#f2eee4', { align: 'left', track: 3, font: `'Segoe Print','Comic Sans MS',cursive`, weight: 700 });
    [['Croissant', '4'], ['Morning bun', '5'], ['Scone', '4']].forEach(([a, b], i) => { text(c, a, 204, 52 + i * 18, 15, '#e9e3d6', { align: 'left', font: `'Segoe Print','Comic Sans MS',cursive`, weight: 600 }); text(c, b, 305, 52 + i * 18, 15, '#e2c27a', { align: 'right', font: `'Segoe Print','Comic Sans MS',cursive`, weight: 600 }); });
    c.strokeStyle = '#e9e3d6'; c.lineWidth = 2; c.beginPath(); c.arc(250, 125, 14, 0, 7); c.stroke();
  });
  const aframe = atlas.region('cf:aframe', 96, 144, (c, w, h) => { c.fillStyle = '#23282a'; c.fillRect(0, 0, w, h); text(c, 'COFFEE', w / 2, 30, 20, '#f2eee4', { font: `'Segoe Print','Comic Sans MS',cursive`, weight: 700 }); text(c, 'is ready', w / 2, 56, 15, '#e2c27a', { font: `'Segoe Print','Comic Sans MS',cursive` }); text(c, 'come in →', w / 2, 110, 15, '#f2eee4', { font: `'Segoe Print','Comic Sans MS',cursive` }); });
  const art = atlas.region('cf:art', 208, 144, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d8dfe2'); g.addColorStop(1, '#b8c4c8'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(40 + i * 35, 60 + (i % 2) * 10, 50, 16, 0, 0, 7); c.fill(); } c.fillStyle = '#c0362c'; c.fillRect(60, 30, 5, 90); c.fillRect(140, 30, 5, 90); c.fillStyle = '#5a6a6e'; c.fillRect(0, h - 22, w, 22); });
  const art2 = atlas.region('cf:art2', 96, 128, (c, w, h) => { c.fillStyle = '#efe8da'; c.fillRect(0, 0, w, h); c.fillStyle = '#6a4428'; c.beginPath(); c.ellipse(w / 2, h / 2, 26, 36, 0.3, 0, 7); c.fill(); c.strokeStyle = '#efe8da'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2 - 8, h / 2 - 30); c.quadraticCurveTo(w / 2 + 10, h / 2, w / 2 - 6, h / 2 + 32); c.stroke(); });
  const open = atlas.region('cf:open', 128, 40, (c, w, h) => { text(c, 'OPEN', w / 2, h / 2 + 1, 26, '#e2c27a', { font: `Georgia,serif`, weight: 700, track: 6 }); });
  void neon;
  return { band, blade, menu, aframe, art, art2, open };
}
