// SAFEHOUSE: a three-storey Painted-Lady Victorian on the NW corner of Hyde & Filbert (Russian Hill crest).
// Street level: garage (roll-up door, car terminal) + entry hall with a stair. First floor: the apartment
// (living room with a canted bay window, kitchen with island, dining nook, bedroom). Second floor is dressed but closed.
// Local frame: front (Filbert St) on -Z, local -X = Hyde St side (corner), +X = party wall.
import { Group } from 'three';
import { Kit, PAT, lin, rng } from './kit.js';
import { outerFace, innerFace, reveal, windowUnit, wbox } from './arch.js';
import * as F from './furniture.js';
import * as X from './extras.js';
import { neon, text, rrect, FONT, SANS } from './atlas.js';

const HX = 7.9, HZ = 10.8, T = 0.25;           // shell half extents, wall thickness
const XI = HX - T, ZI = HZ - T;                 // inner faces
const F1 = 3.2, F2 = 6.4, C0 = 2.9, C1 = 6.1, C2 = 9.2, ROOF = 9.5;
const BODY = 0x3f7f86, BODY2 = 0x5c9aa0, TRIM = 0xf3ead6, ACCENT = 0x8a2433, GOLD = 0xd6a94a, BASE = 0xa89d88;
const STAIR = { x0: -1.25, x1: 0.1, zb: -2.2, zt: -7.4 };   // stair footprint: bottom at zb (F0), top at zt (F1)
const OPEN = { x0: -1.25, x1: 0.1, z0: -7.4, z1: -3.4 };   // stairwell opening in the F1 floor
const BAY = { a: [0.4, -HZ], b: [1.3, -HZ - 0.9], c: [3.7, -HZ - 0.9], d: [4.6, -HZ] };
const GARAGE_DOOR = [1.9, 6.1, 0, 2.55];

// wall descriptors (u along the wall)
const WF = { axis: 'z', out: -HZ, inn: -ZI, u0: -HX, u1: HX };        // front (Filbert)
const WB = { axis: 'z', out: HZ, inn: ZI, u0: -HX, u1: HX };          // back
const WE = { axis: 'x', out: -HX, inn: -XI, u0: -HZ, u1: HZ };        // Hyde side (local -X)
const WW = { axis: 'x', out: HX, inn: XI, u0: -HZ, u1: HZ };          // party wall
const winV1 = [F1 + 0.55, F1 + 2.55], winV2 = [F2 + 0.55, F2 + 2.45];
const HOLES = {
  front: [GARAGE_DOOR, [-4.4, -3.2, 0, 2.35], [-6.8, -5.6, 1.0, 2.3],
    [0.4, 4.6, F1, C2], [-5.4, -4.2, ...winV1], [-3.0, -1.8, ...winV1], [-5.4, -4.2, ...winV2], [-3.0, -1.8, ...winV2]],
  side: [[-8.2, -7.0, 1.0, 2.3], ...[[-9.3, -8.1], [-6.3, -5.1], [-0.6, 0.6], [5.0, 6.4]].flatMap(([a, b]) => [[a, b, ...winV1], [a, b, ...winV2]])],
  back: [[-3.2, -1.8, ...winV1], [-3.2, -1.8, ...winV2], [-6.6, -5.8, F2 + 1.4, F2 + 2.3]],
  party: [],
};

export function setup(S) {
  // ---- colliders: shell walls split around the ground-floor openings
  const Y1 = ROOF + 1;
  // front wall (z = -HZ .. -ZI): garage door gap + front door gap
  S.box(-HX, -HZ, -4.4, -ZI, S.baseY, Y1); S.box(-3.2, -HZ, GARAGE_DOOR[0], -ZI, S.baseY, Y1); S.box(GARAGE_DOOR[1], -HZ, HX, -ZI, S.baseY, Y1);
  S.box(-4.4, -HZ, -3.2, -ZI, 2.35, Y1); S.box(GARAGE_DOOR[0], -HZ, GARAGE_DOOR[1], -ZI, GARAGE_DOOR[3], Y1);
  S.box(-HX, ZI, HX, HZ, S.baseY, Y1);                 // back
  S.box(-HX, -HZ, -XI, HZ, S.baseY, Y1);                // Hyde side
  S.box(XI, -HZ, HX, HZ, S.baseY, Y1);                  // party wall
  // ground floor: back of the used space, hall/garage partition (door gap near the stair foot), stair side rail
  S.box(-XI, -1.2, XI, -1.0, -1, C0);
  S.box(0.1, -ZI, 0.35, STAIR.zt, -1, C0); S.box(0.1, STAIR.zt, 0.35, OPEN.z1, -1, F1 + 1.0); S.box(0.1, OPEN.z1, 0.35, -2.15, -1, C0);
  S.box(STAIR.x0 - 0.06, STAIR.zt, STAIR.x0, -3.0, 0.6, F1 + 1.0);
  // first floor: railing across the back of the stairwell, bedroom partition (doorway), bathroom box, kitchen run, island
  S.box(OPEN.x0, OPEN.z1, OPEN.x1, OPEN.z1 + 0.06, F1 - 0.2, F1 + 1.0);
  S.box(-XI, 3.8, -2.0, 4.0, F1, C1); S.box(-0.6, 3.8, XI, 4.0, F1, C1);
  S.box(-XI, 7.9, -4.5, 8.1, F1, C1); S.box(-4.7, 7.9, -4.5, ZI, F1, C1);
  S.box(7.0, -3.3, XI, 3.75, F1, F1 + 2.2); S.box(3.9, -1.4, 5.5, 1.2, F1, F1 + 1.0);
  // bay window walls (first floor)
  const bt = 0.2;
  S.seg(BAY.a[0], BAY.a[1], BAY.b[0], BAY.b[1], bt, F1, C1); S.seg(BAY.b[0], BAY.b[1] - 0.1, BAY.c[0], BAY.c[1] - 0.1, bt, F1, C1); S.seg(BAY.c[0], BAY.c[1], BAY.d[0], BAY.d[1], bt, F1, C1);
  S.box(BAY.a[0], -HZ - 1.05, BAY.d[0], -HZ, S.baseY, F1 - 0.2); // under the bay (nothing to walk into)
  // furniture colliders (living room)
  S.box(-7.65, -8.0, -7.2, -6.4, F1, F1 + 1.4);   // tv unit
  S.box(-3.7, -8.3, -2.75, -6.1, F1, F1 + 0.9);    // sofa
  S.box(0.45, 8.4, 2.35, ZI, F1, F1 + 0.7);         // bed
  S.box(0.19, -0.67, 1.61, 1.87, F1, F1 + 0.85);    // pool table
  S.box(-4.9, 3.34, -3.1, 3.8, F1, F1 + 1.1);        // sideboard
  // ---- decks: ground floor, stair ramp, first floor around the stairwell, bay floor
  S.floor(-XI, -HZ - 0.05, XI, -1.2, 0);
  S.ramp([(STAIR.x0 + STAIR.x1) / 2, STAIR.zb, 0], [(STAIR.x0 + STAIR.x1) / 2, STAIR.zt, F1], STAIR.x1 - STAIR.x0, 'stair');
  S.floor(-XI, -ZI, OPEN.x0, ZI, F1, 'f1a');
  S.floor(OPEN.x1, -ZI, XI, ZI, F1, 'f1b');
  S.floor(OPEN.x0, -ZI, OPEN.x1, OPEN.z0, F1, 'f1c');
  S.floor(OPEN.x0, OPEN.z1, OPEN.x1, ZI, F1, 'f1d');
  S.floor(BAY.b[0], BAY.b[1], BAY.c[0], -ZI + 0.01, F1, 'bay');
  // ---- camera ceilings (ground floor ceiling excludes the stairwell)
  S.ceiling(-HX, -HZ, OPEN.x0, -1.2, C0); S.ceiling(OPEN.x1, -HZ, HX, -1.2, C0); S.ceiling(OPEN.x0, -HZ, OPEN.x1, OPEN.z0, C0); S.ceiling(OPEN.x0, OPEN.z1, OPEN.x1, -1.2, C0);
  S.ceiling(-HX, -HZ - 1, HX, HZ, C1);
  S.volume(-XI, 0, -ZI, XI, F1 - 0.01, -1.2, { name: 'f0', clampXZ: true });
  S.volume(-XI, F1 - 0.01, -HZ - 0.9, XI, C1, ZI, { name: 'f1', clampXZ: true });
  // real light spots per volume (local)
  S.lightSpots = { f0: [[-3.4, 2.4, -6.5, 0xffd9a8, 5], [4.0, 2.35, -5.5, 0xdfeaff, 7]], f1: [[-4.2, 5.6, -6.2, 0xffcf96, 8], [3.2, 5.6, 5.5, 0xffc88a, 6]] };
  // ---- doors (walk-through with E): front door
  S.door({ label: 'Safehouse', out: [-3.8, -HZ - 1.3, 0], in: [-3.8, -HZ + 1.3, Math.PI], y: 0 });
  S.garageDoor = { u0: GARAGE_DOOR[0], u1: GARAGE_DOOR[1] };
  // driveway apron from the street up to the garage floor
  S.driveY = Math.min(-0.02, S.groundLocal(4.0, -HZ - 3.0));
  S.ramp([4.0, -HZ - 3.0, S.driveY + 0.02], [4.0, -HZ - 0.05, 0], 4.6, 'drive');
  // interactions
  S.interact([1.4, F1, 7.9], { r: 1.7, prompt: () => '<b>Bed</b>Press <kbd>E</kbd> to sleep and save', use: () => S.ctx.sleepMenu(S) });
  S.interact([5.4, 0, -2.0], { r: 1.5, prompt: () => '<b>Garage</b>Press <kbd>E</kbd> to pick a car', use: () => S.ctx.garageMenu(S) });
  // spawn spot for cars out of the garage: parking lane of Filbert St in front of the garage, facing east (local -X)
  S.spawn = { at: [4.0, -HZ - 5.0], yaw: Math.PI / 2 };
}

// ------------------------------------------------------------------ build
export function build(S, ctx) {
  const k = new Kit();
  const { atlas } = ctx;
  const R = rng(1847);
  const reg = regions(atlas);
  const holes = HOLES;
  // rooms: F0 hall + garage (one bake room each), F1 main, F1 bedroom, F2 (dressed, closed)
  const rHall = k.addRoom(-XI, 0, -ZI, 0.1, C0, -1.2, { amb: [0.2, 0.17, 0.14], indirect: 0.3 });
  const rGar = k.addRoom(0.35, 0, -ZI, XI, C0, -1.2, { amb: [0.14, 0.15, 0.16], indirect: 0.35 });
  const rMain = k.addRoom(-XI, F1, -ZI, XI, C1, 3.8, { amb: [0.2, 0.17, 0.14], indirect: 0.3 });
  const rBed = k.addRoom(-XI, F1, 4.0, XI, C1, ZI, { amb: [0.18, 0.15, 0.13], indirect: 0.3 });
  const rTop = k.addRoom(-XI, F2, -ZI, XI, C2, ZI, { amb: [0.3, 0.22, 0.15], indirect: 0.4 });
  const rStair = rHall;

  // ================================================================ EXTERIOR SHELL
  k.room(-1);
  // front: stucco base (street level) + clapboard body
  const frontBase = holes.front.filter(h => h[2] < F1);
  const frontUp = holes.front.filter(h => h[3] > F1);
  k.tex('stucco', BASE, 0.9); outerFace(k, WF, S.baseY, F1 - 0.1, frontBase);
  k.tex('siding', BODY, 0.9); outerFace(k, WF, F1 - 0.1, ROOF, frontUp);
  k.tex('stucco', BASE, 0.9); outerFace(k, WE, S.baseY, F1 - 0.1, holes.side.filter(h => h[2] < F1));
  k.tex('siding', BODY, 0.9); outerFace(k, WE, F1 - 0.1, ROOF, holes.side.filter(h => h[3] > F1));
  k.tex('siding', BODY2, 0.9); outerFace(k, WB, S.baseY, ROOF, holes.back);
  k.tex('siding', BODY2, 0.9); outerFace(k, WW, S.baseY, ROOF + 0.9, []);
  // roof deck + parapet
  k.tex('gravel_roof', 0x55565a, 1.0); k.floor(-HX, -HZ, HX, HZ, ROOF, 2);
  k.c(TRIM, 0.6); k.box(-HX, ROOF, HZ - 0.25, HX, ROOF + 0.8, HZ); k.box(-HX, ROOF, -HZ, -HX + 0.25, ROOF + 0.8, HZ); k.box(HX - 0.25, ROOF, -HZ, HX, ROOF + 0.8, HZ);
  // reveals for every opening (trim colour)
  k.c(TRIM, 0.6);
  for (const h of holes.front) if (h !== holes.front[3] && h !== holes.front[0] && h !== holes.front[1]) reveal(k, WF, h);
  for (const h of holes.side) reveal(k, WE, h);
  for (const h of holes.back) reveal(k, WB, h);
  k.c(ACCENT, 0.55); reveal(k, WF, holes.front[1], { bottom: false });
  k.c(0xe8e2d4, 0.6); reveal(k, WF, GARAGE_DOOR, { bottom: false });
  // windows (sash, 2 rows) with trims on the outside
  const win = (W, h) => windowUnit(k, W, h, { frame: TRIM, trim: TRIM, rows: 2, trimW: 0.13 });
  for (const h of holes.front.slice(2)) if (h[1] - h[0] < 2) win(WF, h);
  for (const h of holes.side) win(WE, h);
  for (const h of holes.back) win(WB, h);
  // belt courses, corner boards, frieze, cornice with brackets
  k.c(TRIM, 0.6);
  for (const y of [F1 - 0.12, F2 - 0.1]) {
    k.box(-HX - 0.08, y, -HZ - 0.08, HX + 0.02, y + 0.24, -HZ);                 // front band
    k.box(-HX - 0.08, y, -HZ, -HX, y + 0.24, HZ + 0.02);                        // side band
  }
  k.box(-HX - 0.1, S.baseY, -HZ - 0.1, -HX + 0.14, ROOF, -HZ + 0.14);                // corner board (front/Hyde)
  k.box(HX - 0.14, S.baseY, -HZ - 0.1, HX + 0.02, ROOF, -HZ + 0.14);
  k.box(-HX - 0.1, S.baseY, HZ - 0.14, -HX + 0.14, ROOF, HZ + 0.02);
  // frieze + cornice on front and Hyde side
  k.c(ACCENT, 0.6); k.box(-HX - 0.06, ROOF - 0.55, -HZ - 0.06, HX, ROOF - 0.2, -HZ); k.box(-HX - 0.06, ROOF - 0.55, -HZ, -HX, ROOF - 0.2, HZ);
  k.c(TRIM, 0.55);
  k.box(-HX - 0.5, ROOF - 0.2, -HZ - 0.5, HX + 0.1, ROOF + 0.12, -HZ); k.box(-HX - 0.5, ROOF - 0.2, -HZ, -HX, ROOF + 0.12, HZ + 0.1);
  k.box(-HX - 0.58, ROOF + 0.12, -HZ - 0.58, HX + 0.12, ROOF + 0.22, -HZ); k.box(-HX - 0.58, ROOF + 0.12, -HZ, -HX, ROOF + 0.22, HZ + 0.12);
  for (let x = -HX + 0.3; x < HX - 0.1; x += 0.72) { k.box(x - 0.07, ROOF - 0.55, -HZ - 0.42, x + 0.07, ROOF - 0.2, -HZ); k.c(GOLD, 0.4); k.box(x - 0.04, ROOF - 0.5, -HZ - 0.44, x + 0.04, ROOF - 0.42, -HZ - 0.4); k.c(TRIM, 0.55); }
  for (let z = -HZ + 0.8; z < HZ; z += 0.72) k.box(-HX - 0.42, ROOF - 0.55, z - 0.07, -HX, ROOF - 0.2, z + 0.07);
  // false-front gable with fish-scale shingles + oculus
  const GY = ROOF + 0.22, GP = GY + 2.3;
  k.c(BODY, 0.8, 0, PAT.SHINGLE, 1);
  k.quad([HX, GY, -HZ - 0.02], [-HX, GY, -HZ - 0.02], [0, GP, -HZ - 0.02], [0, GP, -HZ - 0.02]);
  k.c(BODY, 0.8); k.quad([-HX, GY, -HZ + 0.25], [HX, GY, -HZ + 0.25], [0, GP, -HZ + 0.25], [0, GP, -HZ + 0.25]);
  k.c(0x2b2d33, 0.85, 0, PAT.SHINGLE, 1.3);
  k.quad([-HX - 0.1, GY, -HZ - 0.3], [-HX - 0.1, GY, -HZ + 3.4], [0, GP - 0.4, -HZ + 3.4], [0, GP + 0.1, -HZ - 0.3]);
  k.quad([HX + 0.1, GY, -HZ + 3.4], [HX + 0.1, GY, -HZ - 0.3], [0, GP + 0.1, -HZ - 0.3], [0, GP - 0.4, -HZ + 3.4]);
  k.c(TRIM, 0.55);
  k.tube([-HX - 0.2, GY - 0.02, -HZ - 0.12], [0, GP + 0.12, -HZ - 0.12], 0.09, 6); k.tube([HX + 0.2, GY - 0.02, -HZ - 0.12], [0, GP + 0.12, -HZ - 0.12], 0.09, 6);
  k.torus(0, GY + 1.0, -HZ - 0.06, 0.55, 0.07, 6, 28, 0);
  k.in('glow', () => { k.glow(0xffc27a, 1.1); k.push(0, GY + 1.0, -HZ - 0.03, 0, 1, Math.PI / 2); k.cyl(0, -0.01, 0, 0.49, 0.49, 0.02, 24); k.pop(); });
  k.c(GOLD, 0.35, 0.6); k.sphere(0, GP + 0.2, -HZ - 0.12, 0.12, 10, 8);

  // ---- bay window (first + second floor), projecting 0.9 m
  bayWindow(k, rMain, rTop);
  bayReveals(k, rMain, rTop);
  // ---- front door + stoop + lamp + house number
  frontDoor(k, reg);
  // ---- garage door (animated group) + frame
  k.c(TRIM, 0.55);
  wbox(k, WF, GARAGE_DOOR[0] - 0.16, GARAGE_DOOR[0], 0, GARAGE_DOOR[3] + 0.16, -HZ, -HZ - 0.07);
  wbox(k, WF, GARAGE_DOOR[1], GARAGE_DOOR[1] + 0.16, 0, GARAGE_DOOR[3] + 0.16, -HZ, -HZ - 0.07);
  wbox(k, WF, GARAGE_DOOR[0] - 0.16, GARAGE_DOOR[1] + 0.16, GARAGE_DOOR[3], GARAGE_DOOR[3] + 0.18, -HZ, -HZ - 0.1);
  k.group('gdoor'); k.room(rGar);
  garageDoorPanel(k);
  k.group(''); k.room(-1);
  // driveway apron
  k.c(0xa9a59b, 0.85, 0, PAT.CONCRETE, 1);
  k.quad([1.7, 0.012, -HZ], [6.3, 0.012, -HZ], [6.3, S.driveY + 0.17, -HZ - 3.0], [1.7, S.driveY + 0.17, -HZ - 3.0]);
  // wall sconce by the garage
  k.c(0x1a1a1a, 0.4, 0.6); k.box(GARAGE_DOOR[1] + 0.35, 2.0, -HZ - 0.12, GARAGE_DOOR[1] + 0.55, 2.45, -HZ);
  k.in('glow', () => { k.glow(0xffc680, 3.5); k.box(GARAGE_DOOR[1] + 0.38, 2.05, -HZ - 0.15, GARAGE_DOOR[1] + 0.52, 2.38, -HZ - 0.1); });
  // foundation skirt under grade
  k.c(0x8f8a80, 0.9, 0, PAT.CONCRETE, 1);
  k.box(-HX - 0.05, S.baseY, -HZ - 0.05, HX + 0.05, 0.02, -HZ + 0.1, 32 | 2 | 1);

  // ================================================================ GROUND FLOOR
  // hall
  k.room(rHall);
  k.tex('wood_floor', 0x6e4a30, 0.6); k.floor(-XI, -ZI, 0.1, -1.2, 0.001, 0.5);
  k.c(0xe0d9cc, 0.9); k.floor(-XI, -ZI, OPEN.x0, -1.2, C0, 0.6, true); k.floor(OPEN.x0, -ZI, 0.1, OPEN.z0, C0, 0.6, true); k.floor(OPEN.x0, OPEN.z1, 0.1, -1.2, C0, 0.6, true);
  // wainscot walls: lower panelled, upper paint
  const hallWalls = (v0, v1) => {
    innerFace(k, WF, -XI, 0.1, v0, v1, holes.front);
    innerFace(k, WE, -ZI, -1.2, v0, v1, holes.side);
    k.wallZ(-1.2, -XI, 0.1, v0, v1, -1);
    k.wallX(0.1, -ZI, -1.2, v0, v1, -1, [[-2.15, -1.25, 0, 2.2]]);
  };
  k.c(0x2f4f4a, 0.5, 0, PAT.PANEL, 1); hallWalls(0, 1.0);
  k.tex('painted_plaster', 0xe4d7bc, 1.0); hallWalls(1.0, C0);
  k.c(TRIM, 0.5); // chair rail + baseboards
  k.box(-XI, 0.98, -ZI, -XI + 0.03, 1.06, -1.2); k.box(-XI, 0.98, -1.23, 0.1, 1.06, -1.2); k.box(-XI, 0, -1.25, 0.1, 0.14, -1.2);
  k.box(-XI, 0, -ZI, -XI + 0.03, 0.14, -1.2);
  // stair: treads + risers + stringer + balustrade
  stair(k, rStair);
  // hall furniture: bench, coat hooks, shoe rack, mirror, runner rug, bike
  k.at(-6.7, 0, -4.0, -Math.PI / 2, () => {
    k.c(F.COL.WOOD_M, 0.5, 0, PAT.WOOD, 2); k.box(-0.7, 0.42, -0.2, 0.7, 0.47, 0.2); k.box(-0.68, 0, -0.18, -0.62, 0.42, 0.18); k.box(0.62, 0, -0.18, 0.68, 0.42, 0.18);
    k.c(0x8e2f2a, 0.9, 0, PAT.FABRIC, 1); k.rbox(-0.65, 0.47, -0.18, 0.65, 0.55, 0.18, 0.03);
    k.c(0x222222, 0.5); k.box(-0.6, 0.1, -0.15, 0.6, 0.12, 0.15);
    for (let i = 0; i < 4; i++) { k.c([0x1d1d1f, 0xb1492e, 0xeeeeee, 0x2f4f6e][i], 0.6); k.rbox(-0.5 + i * 0.3, 0.12, -0.12, -0.3 + i * 0.3, 0.2, 0.1, 0.03); }
    k.occBox(-0.7, 0, -0.2, 0.7, 0.55, 0.2, 0.5);
    k.c(F.COL.BRASS, 0.3, 1); for (let i = 0; i < 4; i++) k.box(-0.45 + i * 0.3, 1.7, 0.2, -0.43 + i * 0.3, 1.8, 0.28);
    k.c(0x3b4a5a, 0.9, 0, PAT.FABRIC, 1); k.rbox(-0.55, 1.05, 0.16, -0.25, 1.75, 0.3, 0.06); k.c(0x9a6a3a, 0.9); k.rbox(0.05, 1.2, 0.16, 0.38, 1.75, 0.3, 0.06);
  });
  k.at(-6.0, 0, -9.9, 0, () => F.plant(k, { h: 1.3, pot: 0x3c5a55, seed: 11, kind: 'palm' }));
  k.at(-3.4, 0.001, -5.2, 0, () => F.rug(k, { w: 1.1, d: 3.6, col: 0x7d2a2a, border: 0xd8c39a, inner: 0x2c3e57 }));
  k.at(-XI + 0.02, 1.7, -2.5, -Math.PI / 2, () => F.frame(k, { w: 0.7, h: 0.9, region: reg.art2 }));
  // bike on the wall
  k.at(-2.2, 0, -1.35, 0, () => bike(k));
  k.at(-3.4, 0, -4.2, 0, () => F.ceilingDisc(k, { ceil: C0, I: 1.1 }));
  for (const z of [-5.6, -9.4]) k.at(-XI + 0.02, 1.85, z, -Math.PI / 2, () => sconce(k));
  k.at(-XI + 0.25, 0, -9.3, -Math.PI / 2, () => { k.c(0x2a1c12, 0.45, 0, PAT.GRAIN, 1); k.box(-0.5, 0.8, -0.18, 0.5, 0.84, 0.18); for (const x of [-0.45, 0.45]) k.box(x - 0.02, 0, -0.15, x + 0.02, 0.8, 0.15); k.c(0xd8c9a0, 0.6); k.box(-0.3, 0.84, -0.1, 0.1, 0.86, 0.12); k.c(0x2d5a63, 0.3); k.lathe(0.3, 0.84, 0, [[0, 0], [0.05, 0], [0.06, 0.1], [0.03, 0.2], [0, 0.2]], 12); k.occBox(-0.5, 0, -0.18, 0.5, 0.84, 0.18, 0.4); k.c(F.COL.BRASS, 0.3, 1); k.box(-0.42, 1.0, 0.17, 0.42, 1.95, 0.2); k.c(0x9fb6c4, 0.12, 1); k.box(-0.38, 1.04, 0.16, 0.38, 1.91, 0.17, 32); });
  k.at(-3.4, 0, -8.4, 0, () => F.ceilingDisc(k, { ceil: C0, I: 1.3 }));
  k.win(-3.8, 1.2, -ZI, 0, 1, 0.6); k.win(-XI, 1.6, -7.6, 1, 0, 0.8);
  // garage
  k.room(rGar);
  k.tex('concrete', 0x7a7872, 0.75); k.floor(0.35, -ZI, XI, -1.2, 0.001, 0.6);
  k.c(0xd8d6d0, 0.9); k.floor(0.35, -ZI, XI, -1.2, C0, 0.7, true);
  const garWalls = (v0, v1) => { innerFace(k, WF, 0.35, XI, v0, v1, holes.front); innerFace(k, WW, -ZI, -1.2, v0, v1, []); k.wallZ(-1.2, 0.35, XI, v0, v1, -1); k.wallX(0.35, -ZI, -1.2, v0, v1, 1, [[-2.15, -1.25, 0, 2.2]]); };
  k.tex('concrete', 0x8f949a, 0.9); garWalls(0, 1.1);
  k.tex('brick_tan', 0xd8d2c8, 0.95); garWalls(1.1, C0);
  k.c(0xd6b23a, 0.6); k.box(0.35, 1.08, -ZI, 0.4, 1.14, -1.2); k.box(XI - 0.05, 1.08, -ZI, XI, 1.14, -1.2);
  // workbench, pegboard with tools, tyres, shelving, terminal
  k.at(XI - 0.35, 0, -6.0, Math.PI / 2, () => workbench(k, R));
  k.at(XI - 0.4, 0, -3.0, Math.PI / 2, () => {
    k.c(0x2a2c30, 0.5, 0.7); for (const x of [-0.6, 0.6]) for (const z of [-0.2, 0.2]) k.box(x - 0.02, 0, z - 0.02, x + 0.02, 2.0, z + 0.02);
    for (const y of [0.1, 0.7, 1.3, 1.9]) { k.c(0x5b5f64, 0.6, 0.5); k.box(-0.62, y, -0.22, 0.62, y + 0.03, 0.22); }
    k.c(0x151515, 0.9); for (let i = 0; i < 2; i++) k.torus(-0.3 + i * 0.6, 0.45, 0, 0.3, 0.1, 8, 18, 0);
    k.c(0x1d4f8a, 0.4); k.box(-0.5, 0.73, -0.15, -0.1, 1.0, 0.15); k.c(0xc0392b, 0.4); k.box(0.05, 0.73, -0.12, 0.3, 0.95, 0.12);
    k.c(0xd9d0b5, 0.8); k.box(-0.55, 1.33, -0.18, -0.05, 1.6, 0.18); k.box(0.0, 1.33, -0.18, 0.5, 1.55, 0.18);
    k.occBox(-0.65, 0, -0.25, 0.65, 2.0, 0.25, 0.5);
  });
  terminal(k, reg);
  // garage clutter: surfboards on the partition wall, a tyre stack, a mini fridge, a street sign
  for (const [z, col] of [[-8.6, 0xf2c14e], [-7.6, 0x2e86c1]]) k.at(0.42, 1.55, z, Math.PI / 2, () => { k.c(col, 0.3); k.ellipsoid(0, 0, 0, 0.27, 1.05, 0.035, 14, 10); k.c(0xf4f1ea, 0.4); k.ellipsoid(0, 0, -0.02, 0.012, 1.0, 0.02, 6, 8); });
  k.at(1.0, 0, -10.0, 0, () => { k.c(0x151515, 0.9); for (let i = 0; i < 4; i++) k.torus(0, 0.12 + i * 0.24, 0, 0.3, 0.11, 8, 20, Math.PI / 2); k.occBox(-0.42, 0, -0.42, 0.42, 1.0, 0.42, 0.5); });
  k.at(XI - 0.35, 0, -8.6, Math.PI / 2, () => { k.c(0xc0392b, 0.4, 0.2); k.rbox(-0.28, 0, -0.28, 0.28, 0.85, 0.28, 0.03); k.c(0xd0d4d8, 0.2, 1); k.box(0.22, 0.5, -0.3, 0.25, 0.75, -0.28); k.occBox(-0.28, 0, -0.28, 0.28, 0.85, 0.28, 0.4); });
  k.at(3.8, 2.2, -1.22, 0, () => { k.c(0x1f6b3a, 0.4, 0.3); k.box(-0.55, -0.12, -0.02, 0.55, 0.12, 0); k.sign([0.52, -0.1, -0.021], [-0.52, -0.1, -0.021], [-0.52, 0.1, -0.021], [0.52, 0.1, -0.021], reg.street, 'paint'); });
  k.c(0xffd23a, 0.5); k.box(0.9, 0.001, -9.5, 1.0, 0.004, -2.5, 4); k.box(XI - 1.4, 0.001, -9.5, XI - 1.3, 0.004, -2.5, 4);
  k.c(0x1a1a1a, 0.7); k.box(1.8, 0, -1.9, 6.0, 0.12, -1.7);                       // wheel stop
  k.at(2.4, 0, -1.25, 0, () => { k.c(0x3a3d42, 0.5); k.box(-0.3, 0, -0.25, 0.3, 0.9, 0.0); k.c(0xc0392b, 0.4); k.cyl(0.0, 0.9, -0.12, 0.08, 0.08, 0.1, 10); });
  for (const z of [-8.2, -4.2]) k.at(4.0, 0, z, 0, () => F.tubeLight(k, { ceil: C0, len: 1.5, I: 1.6 }));
  k.win(4.0, 1.4, -ZI, 0, 1, 0.5, 6);

  // ================================================================ FIRST FLOOR (apartment)
  k.room(rMain);
  k.tex('wood_floor', null, 0.55);
  floorWithHole(k, -XI, -ZI, XI, 3.8, F1, OPEN);
  k.c(0xe2dccf, 0.92); ceilingPlane(k, -XI, -ZI, XI, 3.8, C1);
  const mainWalls = (v0, v1) => { innerFace(k, WF, -XI, XI, v0, v1, holes.front); innerFace(k, WE, -ZI, 3.8, v0, v1, holes.side); innerFace(k, WW, -ZI, 3.8, v0, v1, []); k.wallZ(3.8, -XI, XI, v0, v1, -1, [[-2.0, -0.6, F1, F1 + 2.2]]); };
  k.c(0xefe7d6, 0.55, 0, PAT.PANEL, 1); mainWalls(F1, F1 + 0.95);
  k.tex('painted_plaster', 0xc9b89a, 1.0); mainWalls(F1 + 0.95, C1 - 0.42);
  k.tex('painted_plaster', 0xe9e2d3, 1.0); mainWalls(C1 - 0.42, C1);
  railRing(k, -XI, -ZI, XI, 3.8, F1 + 0.95, 0.06, TRIM); railRing(k, -XI, -ZI, XI, 3.8, C1 - 0.45, 0.035, TRIM);
  // crown moulding + baseboards + picture rail
  trimRing(k, -XI, -ZI, XI, 3.8, F1, C1, TRIM);
  // stairwell edge + railings
  railing(k);
  // living room
  k.at(-4.8, F1 + 0.001, -7.2, Math.PI / 2, () => F.rug(k, { w: 3.2, d: 2.4, col: 0x8c3b2e, border: 0xe0cfa8, inner: 0x2f3f5c }));
  k.at(-3.2, F1, -7.2, Math.PI / 2, () => F.sofa(k, { w: 2.3, col: 0x3e5566 }));
  k.at(-5.0, F1, -7.2, Math.PI / 2, () => F.coffeeTable(k, { w: 1.15, d: 0.62, seed: 5 }));
  k.at(-XI + 0.25, F1, -7.2, -Math.PI / 2, () => F.tvUnit(k, { w: 1.6, screen: reg.tv }));
  k.at(-5.9, F1, -9.6, Math.PI * 0.8, () => F.armchair(k, { col: 0xb8743a }));
  k.at(-2.4, F1, -9.2, 0, () => F.floorLamp(k, { I: 1.8 }));
  k.at(-6.85, F1, -ZI + 0.2, Math.PI, () => F.bookshelf(k, { w: 1.2, h: 2.2, seed: 21 }));
  k.at(-XI + 0.03, F1 + 1.75, -9.95, -Math.PI / 2, () => F.frame(k, { w: 0.55, h: 0.7, region: reg.art3 }));
  k.at(-1.6, F1, -10.1, 0, () => F.plant(k, { h: 1.5, seed: 4, kind: 'palm', pot: 0xb35a3c }));
  k.at(-3.2, F1, -5.55, 0, () => X.sideTable(k));
  k.at(-3.05, F1 + 0.42, -8.0, Math.PI / 2, () => X.throwBlanket(k, { col: 0xc8a55a }));
  for (const [z, c, t] of [[-7.9, 0xd8a44a, -0.35], [-6.6, 0xe9e2d2, -0.25], [-7.3, 0x8a2433, -0.3]]) k.at(-2.95, F1 + 0.47, z, Math.PI / 2, () => X.cushion(k, { col: c, tilt: t }));
  for (const [x, z] of [[-4.4, -7.2], [3.4, -6.5], [-5.2, 0.0], [0.9, 0.6]]) k.at(x, F1, z, 0, () => X.medallion(k, { ceil: C1 - F1, r: x === 0.9 ? 0.6 : 0.4 }));
  k.at(-XI + 0.01, F1 + 1.55, -3.6, -Math.PI / 2, () => X.wallShelf(k, { w: 1.3, seed: 8 }));
  k.at(-XI + 0.01, F1 + 2.05, -3.6, -Math.PI / 2, () => X.wallShelf(k, { w: 1.3, seed: 19 }));
  // painted ceiling beams across the flat
  k.c(0xf1ebdf, 0.7);
  for (const z of [-8.6, -5.0, -1.8, 1.9]) k.box(-XI, C1 - 0.24, z - 0.13, XI, C1, z + 0.13, 63 & ~4, 1.0);
  // front windows: curtains + art between them
  for (const xc of [-4.8, -2.4]) for (const s2 of [-1, 1]) k.at(xc + s2 * 0.82, F1, -ZI + 0.07, Math.PI, () => F.curtain(k, { w: 0.42, y0: 0.2, y1: 2.7, col: 0xcdb48e, folds: 4 }));
  k.at(-3.6, F1 + 1.6, -ZI + 0.02, Math.PI, () => F.frame(k, { w: 0.46, h: 0.62, region: reg.art2, col: 0xc59a4a }));
  // rugs under the pool table and the dining table, a bar cart, a lamp
  k.at(0.9, F1 + 0.001, 0.6, 0, () => F.rug(k, { w: 2.6, d: 3.8, col: 0x2c3e57, border: 0xc9b89a, inner: 0x3a5068 }));
  k.at(-5.2, F1 + 0.001, 0.0, Math.PI / 2, () => F.rug(k, { w: 2.6, d: 2.2, col: 0x7d5a3a, border: 0xe0cfa8, inner: 0x9a3b34 }));
  k.at(-1.9, F1, 3.2, 0, () => barCart(k));
  k.at(3.0, F1, 2.9, 0, () => F.floorLamp(k, { h: 1.6, I: 1.2, shade: 0xe9dcc4 }));
  // pool table + billiard lamp in the middle of the flat
  k.at(0.9, F1, 0.6, 0, () => X.poolTable(k));
  k.at(0.9, F1, 0.6, 0, () => X.billiardLamp(k, { ceil: C1 - F1, y: 1.6 }));
  // sideboard + record player against the bedroom partition, art above
  k.at(-4.0, F1, 3.57, 0, () => X.sideboard(k, { w: 1.8 }));
  k.at(-4.0, F1 + 1.75, 3.76, 0, () => F.frame(k, { w: 1.2, h: 0.8, region: reg.art3, col: 0x2a1c12 }));
  k.at(-1.3, F1 + 2.58, 3.8, 0, () => X.clock(k, { r: 0.17 }));
  // work corner extras: guitar, skateboards
  k.at(XI - 0.55, F1, -5.3, Math.PI / 2, () => X.guitar(k));
  for (const [z, a] of [[-9.1, 0xff5a36], [-8.6, 0x2f7fb8]]) k.at(XI - 0.02, F1 + 1.6, z, Math.PI / 2, () => X.skateboard(k, { art: a }));
  // curtains at the Hyde windows
  for (const zc of [-8.7, -5.7]) k.at(-XI + 0.06, F1, zc, -Math.PI / 2, () => { k.at(-0.85, 0, 0, 0, () => F.curtain(k, { w: 0.45, y0: 0.2, y1: 2.7, col: 0xcdb48e, folds: 4 })); k.at(0.85, 0, 0, 0, () => F.curtain(k, { w: 0.45, y0: 0.2, y1: 2.7, col: 0xcdb48e, folds: 4 })); });
  // bay window seat
  bayNook(k);
  // work corner by the party wall
  k.at(XI - 0.45, F1, -7.0, Math.PI / 2, () => F.desk(k, { w: 1.5, screen: reg.monitor }));
  k.at(XI - 1.25, F1, -7.0, -Math.PI / 2 + 0.3, () => F.officeChair(k));
  k.at(XI - 0.02, F1 + 1.9, -7.0, Math.PI / 2, () => F.frame(k, { w: 1.3, h: 0.8, region: reg.art1, col: 0xf1ede6 }));
  k.at(XI - 0.45, F1, -9.6, 0, () => F.plant(k, { h: 1.7, seed: 9, kind: 'bush' }));
  k.at(XI - 0.3, F1, -4.4, Math.PI / 2, () => F.bookshelf(k, { w: 0.9, h: 1.1, d: 0.34, seed: 33, shelves: 2 }));
  // kitchen run along the party wall + uppers, island with stools, pendants
  kitchen(k, reg);
  // dining nook by the Hyde window
  k.at(-5.2, F1, 0.0, 0, () => F.table(k, { w: 1.3, d: 0.85, top: 0xc49a6c, legs: 0x2b1e14 }));
  for (const [x, z, a] of [[-5.55, -0.65, 0], [-4.85, -0.65, 0], [-5.55, 0.65, Math.PI], [-4.85, 0.65, Math.PI]]) k.at(x, F1, z, a, () => F.chair(k, { col: 0x2b1e14, seat: 0x6a7d63 }));
  k.at(-5.2, F1, 0.0, 0, () => F.pendant(k, { ceil: C1 - F1, y: 1.65, shade: F.COL.BRASS, style: 'brass', I: 1.5 }));
  k.at(-5.2, F1 + 0.75, 0.0, 0, () => { k.c(0xe8e2d6, 0.3); k.lathe(0, 0, 0, [[0, 0], [0.06, 0], [0.08, 0.1], [0.05, 0.22], [0, 0.22]], 12); k.c(0xd94f3d, 0.6); k.sphere(0.02, 0.28, 0, 0.05, 8, 6); k.sphere(-0.03, 0.3, 0.02, 0.045, 8, 6); });
  k.at(-XI + 0.02, F1 + 1.8, 2.3, -Math.PI / 2, () => F.frame(k, { w: 0.9, h: 0.65, region: reg.art2 }));
  k.at(-XI + 0.3, F1, 3.3, 0, () => F.plant(k, { h: 1.2, seed: 14 }));
  // living room ceiling lights
  for (const [x, z] of [[-4.4, -7.2], [3.4, -6.5]]) k.at(x, F1, z, 0, () => F.ceilingDisc(k, { ceil: C1 - F1, I: 1.0, r: 0.18 }));
  // sky light through the windows
  for (const z of [-8.7, -5.7, 0]) k.win(-XI, F1 + 1.6, z, 1, 0, 0.9, 7);
  for (const x of [-4.8, -2.4]) k.win(x, F1 + 1.6, -ZI, 0, 1, 0.9, 7);
  k.win(2.5, F1 + 1.5, -HZ - 0.5, 0, 1, 1.6, 8);

  // ---- bedroom
  k.room(rBed);
  k.tex('wood_floor', null, 0.55); k.floor(-XI, 4.0, XI, ZI, F1 + 0.001, 0.5);
  k.c(0xe2dccf, 0.92); ceilingPlane(k, -XI, 4.0, XI, ZI, C1);
  const bedWalls = (v0, v1) => { innerFace(k, WB, -XI, XI, v0, v1, holes.back); innerFace(k, WE, 4.0, ZI, v0, v1, holes.side); innerFace(k, WW, 4.0, ZI, v0, v1, []); k.wallZ(4.0, -XI, XI, v0, v1, 1, [[-2.0, -0.6, F1, F1 + 2.2]]); };
  k.c(0x5f7c80, 0.6, 0, PAT.PANEL, 1); bedWalls(F1, F1 + 1.0);
  k.tex('painted_plaster', 0xd4cdbd, 1.0); bedWalls(F1 + 1.0, C1);
  railRing(k, -XI, 4.0, XI, ZI, F1 + 1.0, 0.05, TRIM);
  trimRing(k, -XI, 4.0, XI, ZI, F1, C1, TRIM);
  // doorway casing between rooms
  k.c(TRIM, 0.5); k.box(-2.1, F1, 3.75, -2.0, F1 + 2.3, 4.05); k.box(-0.6, F1, 3.75, -0.5, F1 + 2.3, 4.05); k.box(-2.1, F1 + 2.2, 3.75, -0.5, F1 + 2.3, 4.05);
  k.c(0xeae6de, 0.9); k.box(-2.0, F1 + 2.2, 3.8, -0.6, F1 + 2.21, 4.0, 8);
  k.at(1.4, F1 + 0.001, 8.3, 0, () => F.rug(k, { w: 3.4, d: 2.6, col: 0xcfc6b3, border: 0x8c3b2e, inner: 0xe7dfcd }));
  k.at(1.4, F1, 9.5, 0, () => F.bed(k, { w: 1.8, l: 2.1, head: 0x2f4058 }));
  k.at(0.1, F1, 10.2, 0, () => F.nightstand(k));
  k.at(2.7, F1, 10.2, 0, () => F.nightstand(k));
  k.at(1.4, F1 + 1.75, ZI - 0.02, 0, () => F.frame(k, { w: 1.6, h: 0.6, region: reg.art4, col: 0xd9c9a8 }));
  k.at(XI - 0.32, F1, 6.0, Math.PI / 2, () => F.wardrobe(k, { w: 1.6 }));
  k.at(-5.8, F1, 5.8, Math.PI * 0.75, () => F.armchair(k, { col: 0x5d6b52 }));
  k.at(-6.6, F1, 4.7, 0, () => F.floorLamp(k, { I: 1.0, h: 1.5 }));
  k.at(XI - 0.4, F1, 9.9, 0, () => F.plant(k, { h: 1.4, seed: 17, kind: 'fern', pot: 0x2d3e3a }));
  k.at(-3.2, F1, 4.4, Math.PI, () => { k.c(0x3a2a1c, 0.5, 0, PAT.WOOD, 2); k.box(-0.6, 0, -0.2, 0.6, 0.8, 0.2); k.c(0xe6e1d6, 0.3); k.cyl(-0.3, 0.8, 0, 0.12, 0.12, 0.03, 16); k.c(0x111111, 0.4); k.cyl(-0.3, 0.83, 0, 0.1, 0.1, 0.01, 16); k.occBox(-0.6, 0, -0.2, 0.6, 0.8, 0.2, 0.4); });
  // bathroom box (closed door)
  k.c(0xd9d4c4, 0.9); k.wallZ(7.9, -XI, -4.5, F1, C1, -1, [[-6.9, -6.1, F1, F1 + 2.1]]); k.wallX(-4.5, 7.9, ZI, F1, C1, 1);
  k.c(0xf3efe7, 0.5, 0, PAT.PANEL, 0.7); k.box(-6.85, F1, 7.84, -6.15, F1 + 2.08, 7.9);
  k.c(F.COL.BRASS, 0.3, 1); k.sphere(-6.25, F1 + 1.0, 7.8, 0.035, 8, 6);
  k.c(TRIM, 0.5); k.box(-6.95, F1, 7.82, -6.85, F1 + 2.2, 7.9); k.box(-6.15, F1, 7.82, -6.05, F1 + 2.2, 7.9); k.box(-6.95, F1 + 2.1, 7.82, -6.05, F1 + 2.2, 7.9);
  k.at(1.4, F1, 7.0, 0, () => F.ceilingDisc(k, { ceil: C1 - F1, I: 0.9 }));
  k.at(1.4, F1, 7.0, 0, () => X.medallion(k, { ceil: C1 - F1 }));
  k.c(0xe6ded0, 0.7); for (const z of [5.3, 8.8]) k.box(-XI, C1 - 0.22, z - 0.12, XI, C1, z + 0.12, 63 & ~4, 1.0);
  k.at(1.4, F1, 7.95, 0, () => { k.c(0x2a1c12, 0.5, 0, PAT.GRAIN, 1); k.box(-0.7, 0.35, -0.2, 0.7, 0.4, 0.2); for (const x of [-0.65, 0.65]) k.box(x - 0.03, 0, -0.18, x + 0.03, 0.35, 0.18); k.c(0x8a2433, 0.9, 0, PAT.FABRIC, 1); k.rbox(-0.68, 0.4, -0.19, 0.68, 0.48, 0.19, 0.03); k.occBox(-0.7, 0, -0.2, 0.7, 0.48, 0.2, 0.4); });
  k.at(5.2, F1, ZI - 0.25, 0, () => { F.cabinet(k, { w: 1.4, h: 0.85, d: 0.45, col: 0xe9e4da, doors: 3, drawer: true, handle: F.COL.BRASS, top: PAT.GRAIN, topCol: 0x8a5d3b }); });
  k.at(5.2, F1 + 0.85, ZI - 0.35, 0, () => { F.tableLamp(k, { base: 0x2d5a63, I: 0.7 }); });
  k.at(4.7, F1 + 1.7, ZI - 0.02, 0, () => F.frame(k, { w: 0.6, h: 0.8, region: reg.art2, col: F.COL.BRASS }));
  k.at(6.2, F1 + 0.85, ZI - 0.3, 0, () => F.plantSmall(k, 0, 0, 0, 23));
  k.at(-1.5, F1, 9.9, 0, () => F.plant(k, { h: 1.0, seed: 31, pot: 0xe8e2d6 }));
  k.at(3.4, F1, 5.0, 0.5, () => { k.c(0xd8c9a0, 0.9, 0, PAT.FABRIC, 3); k.cyl(0, 0, 0, 0.22, 0.2, 0.42, 16, true); k.c(0x6d8aa0, 0.9, 0, PAT.FABRIC, 1); k.rbox(-0.15, 0.35, -0.1, 0.15, 0.46, 0.12, 0.04); k.occBox(-0.22, 0, -0.22, 0.22, 0.42, 0.22, 0.3); });
  k.win(-2.5, F1 + 1.6, ZI, 0, -1, 0.9, 7); k.win(-XI, F1 + 1.6, 5.7, 1, 0, 0.9, 7);

  // ================================================================ SECOND FLOOR (dressed shell seen through windows)
  k.room(rTop);
  k.tex('wood_floor', null, 0.6); k.floor(-XI, -ZI, XI, ZI, F2, 1.0);
  k.c(0xf1ebdf, 0.9); ceilingPlane(k, -XI, -ZI, XI, ZI, C2, 1.0);
  const topWalls = (v0, v1) => { innerFace(k, WF, -XI, XI, v0, v1, holes.front, 1); innerFace(k, WE, -ZI, ZI, v0, v1, holes.side, 1); innerFace(k, WB, -XI, XI, v0, v1, holes.back, 1); innerFace(k, WW, -ZI, ZI, v0, v1, [], 1); };
  k.c(0xe3cfae, 0.9); topWalls(F2, C2);
  for (const [x, z] of [[-4, -7], [3, -7], [-4, 2], [3, 3], [-2, 8]]) k.at(x, F2, z, 0, () => F.ceilingDisc(k, { ceil: C2 - F2, I: 1.1, col: [1, 0.78, 0.52], range: 7 }));
  for (const zc of [-8.7, -5.7, 0, 5.7]) k.at(-XI + 0.1, F2, zc, -Math.PI / 2, () => F.curtain(k, { w: 1.5, y0: 0.4, y1: 2.6, col: 0xe8dcc0, folds: 8 }));
  k.at(-6, F2, -5, 0, () => F.bookshelf(k, { w: 1.2, h: 2.0, seed: 44 }));
  k.at(5, F2, -8, 0, () => F.plant(k, { h: 1.6, seed: 55, kind: 'palm' }));
  k.at(0, F2, -2, 0.4, () => F.sofa(k, { col: 0x7a4a5a }));

  // ---- build meshes
  const out = k.toMeshes(ctx.mats);
  const group = out.groups[''] || new Group(), ext = out.groups.x || new Group();
  // animated parts hang from pivots: garage door (tilts up into the garage), front door (swings in)
  const gPivot = ctx.pivot(out.groups.gdoor, 0, GARAGE_DOOR[3], -HZ + 0.1); ext.add(gPivot);
  const fPivot = ctx.pivot(out.groups.fdoor, -3.22, 0, -HZ + 0.12); ext.add(fPivot);
  let gOpen = 0, fOpen = 0;
  return {
    group, ext, drawCalls: out.drawCalls, stats: out.stats,
    update(dt, info) {
      const p = info.playerLocal;
      const reach = info.inCar ? 13 : 6;
      const gNear = p && p[0] > GARAGE_DOOR[0] - reach && p[0] < GARAGE_DOOR[1] + reach && p[2] > -HZ - reach && p[2] < -1.2 && p[1] < 2.6;
      gOpen = approach(gOpen, gNear ? 1 : 0, dt * 1.3);
      const e = gOpen * gOpen * (3 - 2 * gOpen);
      gPivot.rotation.x = -e * Math.PI / 2 * 0.98; gPivot.position.z = -HZ + 0.1 + e * 0.25; gPivot.updateMatrix();
      const fNear = p && Math.abs(p[0] + 3.8) < 1.8 && Math.abs(p[2] + HZ) < 2.2 && p[1] < 2;
      fOpen = approach(fOpen, fNear ? 1 : 0, dt * 2.4);
      fPivot.rotation.y = fOpen * fOpen * (3 - 2 * fOpen) * 1.75; fPivot.updateMatrix();
      S.garageOpen = gOpen;
    },
  };
}
function approach(v, t, d) { return v + Math.sign(t - v) * Math.min(Math.abs(t - v), d); }

// ------------------------------------------------------------------ pieces
function floorWithHole(k, x0, z0, x1, z1, y, H) {
  k.floor(x0, z0, H.x0, z1, y + 0.001, 0.5); k.floor(H.x1, z0, x1, z1, y + 0.001, 0.5);
  k.floor(H.x0, z0, H.x1, H.z0, y + 0.001, 0.5); k.floor(H.x0, H.z1, H.x1, z1, y + 0.001, 0.5);
}
function ceilingPlane(k, x0, z0, x1, z1, y, sub = 0.6) { k.floor(x0, z0, x1, z1, y, sub, true); }
function trimRing(k, x0, z0, x1, z1, y0, y1, col) {
  k.c(col, 0.5);
  k.box(x0, y0, z0, x1, y0 + 0.14, z0 + 0.02); k.box(x0, y0, z1 - 0.02, x1, y0 + 0.14, z1); k.box(x0, y0, z0, x0 + 0.02, y0 + 0.14, z1); k.box(x1 - 0.02, y0, z0, x1, y0 + 0.14, z1);
  const c = 0.1;
  k.box(x0, y1 - c, z0, x1, y1, z0 + c, 63 & ~4); k.box(x0, y1 - c, z1 - c, x1, y1, z1, 63 & ~4); k.box(x0, y1 - c, z0, x0 + c, y1, z1, 63 & ~4); k.box(x1 - c, y1 - c, z0, x1, y1, z1, 63 & ~4);
}
function railRing(k, x0, z0, x1, z1, y, h, col) {
  k.c(col, 0.5); const t = 0.025;
  k.box(x0, y, z0, x1, y + h, z0 + t, 63 & ~32); k.box(x0, y, z1 - t, x1, y + h, z1, 63 & ~16); k.box(x0, y, z0, x0 + t, y + h, z1, 63 & ~2); k.box(x1 - t, y, z0, x1, y + h, z1, 63 & ~1);
}
function sconce(k) {
  k.c(F.COL.BRASS, 0.3, 1); k.box(-0.06, -0.1, -0.02, 0.06, 0.1, 0); k.tube([0, 0, -0.02], [0, 0.05, -0.14], 0.01, 6);
  k.c(0xf1e4c8, 0.9); k.lathe(0, 0.02, -0.15, [[0.09, 0], [0.06, 0.16], [0.058, 0.16], [0.088, 0]], 14);
  k.in('glow', () => { k.glow(0xffd29a, 2.6); k.lathe(0, 0.02, -0.15, [[0.085, 0.004], [0.056, 0.156]], 14); });
  k.light(0, 0.1, -0.25, [1.0, 0.72, 0.42], 0.9, { range: 3.5, r0: 0.7, wrap: 0.3 });
}
function barCart(k) {
  k.c(F.COL.BRASS, 0.3, 1);
  for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) k.box(x - 0.012, 0.06, z - 0.012, x + 0.012, 0.85, z + 0.012);
  for (const y of [0.3, 0.82]) { k.c(0x1d1f23, 0.2, 0.3); k.box(-0.42, y, -0.24, 0.42, y + 0.015, 0.24); }
  k.c(F.COL.BRASS, 0.3, 1); for (const x of [-0.4, 0.4]) k.torus(x, 0.07, -0.22, 0.07, 0.015, 6, 16, 0);
  const bott = [0x6a3a1a, 0x2a4a2a, 0xd8c8a0, 0x7a1a2a, 0x3a5a7a];
  for (let i = 0; i < 5; i++) { k.c(bott[i], 0.12, 0.1); k.lathe(-0.3 + i * 0.14, 0.835, -0.08, [[0, 0], [0.04, 0], [0.042, 0.2], [0.015, 0.26], [0.015, 0.32], [0, 0.32]], 10); }
  k.in('glass', () => { for (let i = 0; i < 3; i++) k.cyl(-0.2 + i * 0.12, 0.835, 0.12, 0.03, 0.025, 0.09, 10); });
  k.c(0xc0c4c8, 0.2, 1); k.cyl(0.25, 0.315, 0.05, 0.1, 0.09, 0.14, 12);
  k.occBox(-0.42, 0, -0.24, 0.42, 0.85, 0.24, 0.35);
}
function stair(k, room) {
  const n = 18, run = (STAIR.zb - STAIR.zt) / n, rise = F1 / n;
  k.room(room);
  for (let i = 0; i < n; i++) {
    const z1 = STAIR.zb - i * run, z0 = z1 - run, y = (i + 1) * rise;
    k.c(0x5e3f28, 0.35, 0, PAT.WOOD, 1); k.box(STAIR.x0, y - 0.04, z0 - 0.02, STAIR.x1, y, z1, 63 & ~8);
    k.c(0xf1ebdf, 0.7); k.box(STAIR.x0 + 0.01, y - rise, z1 - 0.02, STAIR.x1 - 0.01, y - 0.04, z1, 16);
  }
  // stringer wall (hall side) + underside
  k.c(0x2f4f4a, 0.5, 0, PAT.PANEL, 1);
  const sx = STAIR.x0 - 0.06;
  for (let i = 0; i < n; i++) { const z1 = STAIR.zb - i * run, z0 = z1 - run, y = (i + 1) * rise; k.box(sx, 0, z0, STAIR.x0, y + 0.05, z1, 2); }
  k.c(TRIM, 0.5); k.quad([sx - 0.001, 0.0, STAIR.zb], [sx - 0.001, 0.0, STAIR.zt], [sx - 0.001, 0.14, STAIR.zt], [sx - 0.001, 0.14, STAIR.zb]);
  // balustrade on the open side: newel + balusters + handrail following the pitch
  k.c(0x3a2618, 0.4, 0, PAT.WOOD, 3);
  k.box(sx - 0.06, 0, STAIR.zb - 0.06, sx + 0.06, 1.15, STAIR.zb + 0.06);
  k.tube([sx, 1.05, STAIR.zb], [sx, F1 + 0.95, STAIR.zt], 0.035, 8);
  k.c(TRIM, 0.5);
  for (let i = 1; i < n; i++) { const z = STAIR.zb - i * run, y = i * rise; k.box(sx - 0.018, y, z - 0.018, sx + 0.018, y + 1.0, z + 0.018); }
}
function railing(k) {
  // stairwell slab edge on F1 + balustrades along the long sides and across the back
  k.c(0xf1ebdf, 0.8);
  k.box(OPEN.x0, C0, OPEN.z0, OPEN.x1, F1, OPEN.z0 + 0.01, 32); k.box(OPEN.x0, C0, OPEN.z1 - 0.01, OPEN.x1, F1, OPEN.z1, 16);
  k.box(OPEN.x1 - 0.01, C0, OPEN.z0, OPEN.x1, F1, OPEN.z1, 2); k.box(OPEN.x0, C0, OPEN.z0, OPEN.x0 + 0.01, F1, OPEN.z1, 1);
  k.c(0x3a2618, 0.4, 0, PAT.WOOD, 3);
  for (const [a, b] of [[[OPEN.x0 - 0.03, OPEN.z0], [OPEN.x0 - 0.03, OPEN.z1]], [[OPEN.x0, OPEN.z1 + 0.03], [OPEN.x1, OPEN.z1 + 0.03]], [[OPEN.x1 + 0.03, OPEN.z0 + 0.5], [OPEN.x1 + 0.03, OPEN.z1]]]) {
    k.tube([a[0], F1 + 0.95, a[1]], [b[0], F1 + 0.95, b[1]], 0.035, 8);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 0.12);
    k.c(TRIM, 0.5);
    for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; k.box(x - 0.018, F1, z - 0.018, x + 0.018, F1 + 0.93, z + 0.018); }
    k.c(0x3a2618, 0.4, 0, PAT.WOOD, 3);
  }
  k.box(OPEN.x0 - 0.09, F1, OPEN.z0 - 0.06, OPEN.x0 + 0.03, F1 + 1.15, OPEN.z0 + 0.06);
  k.box(OPEN.x0 - 0.09, F1, OPEN.z1 - 0.03, OPEN.x0 + 0.03, F1 + 1.15, OPEN.z1 + 0.09);
}
function bayWindow(k, rMain, rTop) {
  const { a, b, c, d } = BAY;
  // outer shell of the bay (two storeys), clapboard panels + windows + trims; interior faces per floor
  const segs = [[a, b], [b, c], [c, d]];
  for (const [fy, cy, room] of [[F1, C1, rMain], [F2, C2, rTop]]) {
    for (const [p, q] of segs) {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
      k.push(p[0], 0, p[1], ang);
      // in this frame the segment runs along +X from 0 to L; outward is -Z
      const W = { axis: 'z', out: -0.02, inn: 0.18, u0: 0, u1: L };
      const h = [0.18, L - 0.18, fy + 0.5, fy + 2.5];
      k.room(-1); k.tex('siding', BODY, 0.9);
      outerFace(k, W, fy - 0.3, cy + 0.3, [h]);
      k.c(TRIM, 0.6); reveal(k, W, h);
      windowUnit(k, W, h, { frame: TRIM, trim: TRIM, rows: 2, trimW: 0.1, cap: false });
      k.c(TRIM, 0.6); k.box(0.05, fy + 0.05, -0.1, L - 0.05, fy + 0.35, -0.02);          // apron panel
      k.box(0.06, fy + 0.1, -0.12, L - 0.06, fy + 0.3, -0.1);
      k.room(room); k.c(0xe8e0cf, 0.9); innerFace(k, W, 0, L, fy, cy, [h], 0.4);
      k.pop();
    }
    // bay floor / ceiling (interior) and trims between storeys (exterior)
    k.room(room);
    k.tex('wood_floor', null, 0.55); k.quad([a[0], fy + 0.001, a[1] + 0.25], [d[0], fy + 0.001, d[1] + 0.25], [c[0] - 0.12, fy + 0.001, c[1] + 0.18], [b[0] + 0.12, fy + 0.001, b[1] + 0.18], 0.5);
    k.c(0xf4efe6, 0.9); k.quad([d[0], cy, d[1] + 0.25], [a[0], cy, a[1] + 0.25], [b[0] + 0.12, cy, b[1] + 0.18], [c[0] - 0.12, cy, c[1] + 0.18], 0.5);
  }
  k.room(-1);
  // bottom: bracketed base under the first floor, bay cap on top
  k.c(TRIM, 0.55);
  k.quad([a[0], F1 - 0.3, a[1]], [b[0], F1 - 0.3, b[1]], [c[0], F1 - 0.3, c[1]], [d[0], F1 - 0.3, d[1]]);
  for (const x of [0.8, 2.5, 4.2]) { k.box(x - 0.08, F1 - 1.0, -HZ - 0.02, x + 0.08, F1 - 0.3, -HZ - (x > 1.2 && x < 3.8 ? 0.85 : 0.35)); }
  k.c(ACCENT, 0.6); k.box(a[0], C2 + 0.05, -HZ - 0.95, d[0], C2 + 0.3, -HZ);
  k.c(TRIM, 0.55); k.box(a[0] - 0.1, C2 + 0.3, -HZ - 1.1, d[0] + 0.1, C2 + 0.45, -HZ);
  k.c(0x2b2d33, 0.8); k.box(a[0], C2 + 0.45, -HZ - 1.0, d[0], C2 + 0.55, -HZ);
  // band between the two storeys
  k.c(TRIM, 0.55); for (const [p, q] of segs) { const L = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]); k.push(p[0], 0, p[1], ang); k.box(-0.02, C1 - 0.05, -0.12, L + 0.02, F2 + 0.05, 0); k.pop(); }
}
function bayReveals(k, rMain, rTop) {
  k.c(0xe8e0cf, 0.9);
  for (const [fy, cy, room] of [[F1, C1, rMain], [F2, C2, rTop]]) {
    k.room(room);
    k.quad([BAY.a[0], fy, -ZI], [BAY.a[0], fy, -HZ - 0.02], [BAY.a[0], cy, -HZ - 0.02], [BAY.a[0], cy, -ZI]);
    k.quad([BAY.d[0], fy, -HZ - 0.02], [BAY.d[0], fy, -ZI], [BAY.d[0], cy, -ZI], [BAY.d[0], cy, -HZ - 0.02]);
  }
  k.room(-1);
}
function bayNook(k) {
  const { b, c } = BAY;
  // window seat along the front face of the bay
  k.c(0xf1ebdf, 0.6); k.box(b[0] + 0.12, F1, b[1] + 0.2, c[0] - 0.12, F1 + 0.44, b[1] + 0.75);
  k.tex('fabric', 0x3c5c73, 1.0); k.rbox(b[0] + 0.15, F1 + 0.44, b[1] + 0.22, c[0] - 0.15, F1 + 0.54, b[1] + 0.73, 0.04);
  const cols = [0xd8a44a, 0xe9e2d2, 0x8a2433, 0x5a7a6a];
  for (let i = 0; i < 4; i++) { k.tex('fabric', cols[i], 1.0, 0, 1.5); k.push(b[0] + 0.45 + i * 0.52, F1 + 0.54, b[1] + 0.38, (i - 1.5) * 0.25, 1, -0.25); k.rbox(-0.2, 0, -0.07, 0.2, 0.38, 0.07, 0.06); k.pop(); }
  k.occBox(b[0] + 0.12, F1, b[1] + 0.2, c[0] - 0.12, F1 + 0.5, b[1] + 0.75, 0.45);
  k.at(1.0, F1, -ZI - 0.35, 0, () => F.plant(k, { h: 0.9, seed: 3, pot: 0xe8e2d6 }));
  k.at(4.1, F1, -ZI - 0.3, 0, () => F.plant(k, { h: 1.2, seed: 8, kind: 'fern', pot: 0xb35a3c }));
  k.at(2.5, F1, -ZI + 1.4, Math.PI, () => F.armchair(k, { col: 0x9fb0a0 }));
  k.at(3.6, F1, -ZI + 1.9, 0, () => F.floorLamp(k, { h: 1.55, I: 1.2 }));
}
function kitchen(k, reg) {
  // base run along the party wall (x = XI), cabinets face -X
  k.push(XI - 0.31, F1, -0.2, Math.PI / 2);
  // in this frame: +X runs toward site -z; the cabinet fronts (-Z) face the room (site -x)
  const L = 6.0;
  for (let i = 0; i < 7; i++) { const x = -L / 2 + 0.4 + i * 0.8; if (i === 4) continue; k.at(x, 0, 0, 0, () => F.cabinet(k, { w: 0.8, h: 0.9, d: 0.62, col: 0x2e4a46, handle: F.COL.BRASS, doors: 2, top: 'marble', topCol: 0xe9e5dc })); }
  // stove slot (i = 4)
  const sx = -L / 2 + 0.4 + 4 * 0.8;
  k.at(sx, 0, 0, 0, () => {
    k.c(0xb9bdc2, 0.25, 1); k.box(-0.4, 0.1, -0.31, 0.4, 0.9, 0.31);
    k.c(0x111214, 0.2); k.box(-0.4, 0.9, -0.31, 0.4, 0.93, 0.31);
    k.c(0x2a2a2c, 0.5, 0.6); for (const [x, z] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.14], [0.18, 0.14]]) k.torus(x, 0.94, z, 0.09, 0.012, 5, 16, Math.PI / 2);
    k.c(0x1a1a1c, 0.2, 0.3); k.box(-0.33, 0.25, -0.33, 0.33, 0.7, -0.31);
    k.c(0xb9bdc2, 0.2, 1); k.box(-0.3, 0.75, -0.36, 0.3, 0.77, -0.32);
    // hood
    k.c(0xb9bdc2, 0.25, 1); k.box(-0.45, 1.75, -0.2, 0.45, 1.95, 0.31); k.box(-0.15, 1.95, 0.0, 0.15, 2.9, 0.31);
    k.in('glow', () => { k.glow(0xfff0d6, 3); k.box(-0.3, 1.74, -0.1, 0.3, 1.75, 0.05, 8); });
    k.light(0, 1.6, -0.1, [1, 0.88, 0.7], 0.8, { range: 2.5, r0: 0.5 });
  });
  // fridge at the end
  k.at(-L / 2 - 0.45, 0, 0.02, 0, () => {
    k.tex('metal', 0xc7cbd0, 0.5, 1); k.box(-0.45, 0, -0.33, 0.45, 2.05, 0.33);
    k.c(0x9a9ea3, 0.3, 1); k.box(-0.448, 1.25, -0.335, 0.448, 1.27, -0.33);
    k.c(0x2a2a2c, 0.3, 0.8); k.box(0.3, 1.35, -0.37, 0.33, 1.9, -0.34); k.box(0.3, 0.4, -0.37, 0.33, 1.15, -0.34);
    k.occBox(-0.45, 0, -0.33, 0.45, 2.05, 0.33, 0.5);
  });
  // sink
  k.c(0x9ea3a8, 0.2, 1); k.box(-1.35, 0.86, -0.22, -0.75, 0.905, 0.12, 4);
  k.c(0x3a3c40, 0.3, 1); k.box(-1.3, 0.905, -0.18, -0.8, 0.91, 0.08, 4);
  k.c(0xd0d4d8, 0.15, 1); k.tube([-1.05, 0.91, 0.2], [-1.05, 1.22, 0.2], 0.014, 8); k.tube([-1.05, 1.22, 0.2], [-1.05, 1.2, 0.02], 0.012, 8);
  // backsplash (subway) + open shelf + uppers
  k.c(0xf2f0ea, 0.18, 0, PAT.SUBWAY, 1); k.wallZ(0.3, -L / 2, L / 2, 0.93, 1.55, -1, [], 0.5);
  k.c(0xf2f0ea, 0.18, 0, PAT.SUBWAY, 1); k.wallZ(0.3, -L / 2 + 3.25, -L / 2 + 3.75, 1.55, 1.75, -1, [], 0.5);
  for (let i = 0; i < 6; i++) { const x = -L / 2 + 0.4 + i * 0.8; if (i === 4) continue; k.at(x, 1.55, 0.13, 0, () => { F.cabinet(k, { w: 0.78, h: 0.85, d: 0.34, col: 0xece6da, handle: F.COL.BRASS, doors: 2, kick: false }); }); }
  // under-cabinet LED strip
  k.in('glow', () => { k.glow(0xffe2b8, 3.2); k.box(-L / 2, 1.535, -0.02, L / 2 - 0.9, 1.545, 0.06, 8); });
  for (let i = 0; i < 4; i++) k.light(-L / 2 + 0.8 + i * 1.4, 1.35, -0.05, [1, 0.84, 0.62], 0.55, { range: 2.2, r0: 0.5, dir: [0, -1, 0], cos0: -0.2, cos1: 0.5 });
  // counter clutter: kettle, cutting board, fruit bowl, knife block, jars
  k.c(0x1f1f22, 0.3, 0.7); k.lathe(0.6, 0.93, -0.05, [[0, 0], [0.09, 0], [0.1, 0.12], [0.07, 0.2], [0, 0.21]], 12);
  k.c(0xb88a55, 0.5, 0, PAT.WOOD, 3); k.box(-2.3, 0.93, -0.2, -1.8, 0.95, 0.1);
  k.c(0xe8e2d6, 0.3); k.lathe(1.6, 0.93, -0.05, [[0, 0], [0.12, 0.0], [0.16, 0.08], [0, 0.08]], 14);
  k.c(0xe0a030, 0.5); k.sphere(1.58, 1.02, -0.06, 0.045, 8, 6); k.c(0x9e2a2a, 0.5); k.sphere(1.64, 1.02, -0.02, 0.045, 8, 6); k.c(0x7ea83a, 0.5); k.sphere(1.54, 1.03, -0.01, 0.04, 8, 6);
  for (let i = 0; i < 3; i++) { k.c([0xd9cfb8, 0x6a4a2a, 0xefe9dc][i], 0.3); k.cyl(-2.8 + i * 0.16, 0.93, 0.12, 0.055, 0.055, 0.16 + i * 0.03, 12); }
  k.pop();
  // island + stools + pendants
  k.at(4.7, F1, -0.1, 0, () => {
    k.c(0x2e4a46, 0.45, 0, PAT.PANEL, 1); k.box(-0.8, 0.1, -1.3, 0.8, 0.9, 1.3);
    k.c(0x111214, 0.8); k.box(-0.75, 0, -1.25, 0.75, 0.1, 1.25);
    k.tex('marble', 0xeae6de, 0.4); k.box(-1.1, 0.9, -1.35, 0.85, 0.94, 1.35);
    k.occBox(-1.1, 0, -1.35, 0.85, 0.94, 1.35, 0.5);
    k.c(0x2f5a8a, 0.4); k.box(0.2, 0.94, -0.3, 0.55, 0.96, 0.05); k.c(0xe9e3d2, 0.6); k.box(-0.3, 0.94, 0.4, 0.2, 0.97, 0.75);
    k.c(0x1d1d20, 0.3); k.lathe(0.2, 0.94, 0.8, [[0, 0], [0.04, 0], [0.045, 0.18], [0.02, 0.26], [0, 0.26]], 10);
  });
  for (const z of [-1.0, -0.1, 0.8]) k.at(3.45, F1, z, Math.PI / 2, () => F.stool(k, { h: 0.72, seat: 0x3a2618, metal: 0x1d1d20, back: true }));
  for (const z of [-0.9, 0.7]) k.at(4.7, F1, z, 0, () => F.pendant(k, { ceil: C1 - F1, y: 1.85, shade: 0x1d1d20, style: 'cone', I: 1.1, range: 4.5 }));
  void reg;
}
function frontDoor(k, reg) {
  const [u0, u1] = [-4.4, -3.2];
  // door leaf (accent colour, panelled with a glazed upper half), slightly recessed
  const z = -HZ + 0.12;
  const st = k.save(); k.group('fdoor'); k.room(-1);
  k.c(ACCENT, 0.4); k.box(u0 + 0.02, 0, z, u1 - 0.02, 2.33, z + 0.05);
  k.c(0x6e1b28, 0.4); for (const [a, b] of [[0.15, 0.95]]) { k.box(u0 + 0.12, a, z - 0.015, u1 - 0.12, b, z); }
  k.in('glass', () => k.quad([u0 + 0.15, 1.15, z - 0.005], [u1 - 0.15, 1.15, z - 0.005], [u1 - 0.15, 2.15, z - 0.005], [u0 + 0.15, 2.15, z - 0.005]));
  k.c(GOLD, 0.3, 1); k.sphere(u0 + 0.14, 1.0, z - 0.04, 0.035, 8, 6); k.sphere(u0 + 0.14, 1.0, z + 0.09, 0.035, 8, 6); k.box(u0 + 0.45, 0.9, z - 0.02, u0 + 0.75, 0.93, z);
  k.restore(st);
  // casing + pediment
  k.c(TRIM, 0.5);
  k.box(u0 - 0.22, 0, -HZ - 0.08, u0, 2.6, -HZ); k.box(u1, 0, -HZ - 0.08, u1 + 0.22, 2.6, -HZ);
  k.box(u0 - 0.35, 2.55, -HZ - 0.25, u1 + 0.35, 2.7, -HZ);
  k.quad([u1 + 0.35, 2.7, -HZ - 0.2], [u0 - 0.35, 2.7, -HZ - 0.2], [(u0 + u1) / 2, 3.0, -HZ - 0.2], [(u0 + u1) / 2, 3.0, -HZ - 0.2]);
  // stoop (two steps up to the threshold)
  k.c(0xb9b3a6, 0.8, 0, PAT.CONCRETE, 1);
  k.box(u0 - 0.35, -0.8, -HZ - 1.0, u1 + 0.35, -0.12, -HZ); k.box(u0 - 0.35, -0.8, -HZ - 0.55, u1 + 0.35, 0.02, -HZ);
  // lamp + house number
  k.c(0x1a1a1a, 0.4, 0.6); k.box(u0 - 0.55, 1.85, -HZ - 0.16, u0 - 0.35, 2.25, -HZ);
  k.in('glow', () => { k.glow(0xffc680, 4); k.box(u0 - 0.52, 1.9, -HZ - 0.19, u0 - 0.38, 2.2, -HZ - 0.14); });
  k.room(-1);
  k.signZ((u0 + u1) / 2, 2.4, -HZ - 0.105, 0.5, 0.18, reg.number, 'paint');
}
function garageDoorPanel(k) {
  const [u0, u1, , v1] = GARAGE_DOOR, z = -HZ + 0.1;
  // door in its own group; rows of raised panels
  k.c(0xf1e9d6, 0.5); k.box(u0, 0.02, z, u1, v1, z + 0.06);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const w = (u1 - u0 - 0.25) / 4, h = (v1 - 0.25) / 4;
    const x0 = u0 + 0.1 + c * (w + 0.017), y0 = 0.1 + r * (h + 0.017);
    k.c(r === 3 ? 0xf1e9d6 : ACCENT, 0.45); k.box(x0, y0, z - 0.02, x0 + w - 0.02, y0 + h - 0.03, z);
    if (r === 3) k.in('glass', () => k.quad([x0 + 0.08, y0 + 0.08, z - 0.025], [x0 + w - 0.1, y0 + 0.08, z - 0.025], [x0 + w - 0.1, y0 + h - 0.11, z - 0.025], [x0 + 0.08, y0 + h - 0.11, z - 0.025]));
  }
  k.c(0xf1e9d6, 0.5); k.box(u0, 0.02, z + 0.06, u1, v1, z + 0.07, 16);
}
function terminal(k, reg) {
  // wall screen on the garage back wall (z = -1.2), facing -z
  const x = 5.4;
  k.c(0x1c1d21, 0.35, 0.4); k.box(x - 0.55, 1.05, -1.3, x + 0.55, 1.85, -1.2);
  k.sign([x + 0.5, 1.1, -1.305], [x - 0.5, 1.1, -1.305], [x - 0.5, 1.8, -1.305], [x + 0.5, 1.8, -1.305], reg.terminal);
  k.in('glow', () => { k.glow(0x4cd964, 3); k.box(x - 0.55, 1.02, -1.32, x + 0.55, 1.04, -1.2); });
  k.light(x, 1.5, -1.8, [0.45, 0.8, 1.0], 0.7, { range: 3.5, r0: 0.8 });
}
function workbench(k, R) {
  k.c(0x8a6a44, 0.6, 0, PAT.WOOD, 2); k.box(-1.0, 0.85, -0.35, 1.0, 0.9, 0.35);
  k.c(0x2a2c30, 0.5, 0.5); for (const [x, z] of [[-0.95, -0.3], [0.95, -0.3], [-0.95, 0.3], [0.95, 0.3]]) k.box(x - 0.03, 0, z - 0.03, x + 0.03, 0.85, z + 0.03);
  k.c(0xc0392b, 0.35, 0.3); k.box(-0.9, 0.0, -0.3, -0.3, 0.7, 0.3);                           // tool chest
  for (let i = 0; i < 4; i++) { k.c(0x8e8e8e, 0.3, 1); k.box(-0.85, 0.08 + i * 0.16, -0.305, -0.35, 0.1 + i * 0.16, -0.3); }
  k.c(0x5b3a1e, 0.8); k.box(-1.0, 1.0, 0.33, 1.0, 1.9, 0.35);                                   // pegboard
  for (let i = 0; i < 9; i++) { const x = -0.85 + i * 0.2, y = 1.2 + R() * 0.5; k.c([0xc0392b, 0x888888, 0xe0b030, 0x333333][i % 4], 0.4, 0.5); k.box(x - 0.02, y, 0.28, x + 0.02, y + 0.25, 0.33); }
  k.c(0x3b6ea5, 0.5); k.box(0.2, 0.9, -0.2, 0.5, 1.08, 0.05); k.c(0x444444, 0.4, 0.8); k.cyl(0.75, 0.9, -0.1, 0.08, 0.08, 0.12, 12);
  k.light(0, 1.8, 0.0, [1, 0.9, 0.75], 0.5, { range: 2.5, r0: 0.5 });
  k.in('glow', () => { k.glow(0xfff4dc, 3); k.box(-0.7, 1.93, 0.25, 0.7, 1.95, 0.3, 8); });
  k.occBox(-1.0, 0, -0.35, 1.0, 0.9, 0.35, 0.45);
}
function bike(k) {
  k.c(0x1d1d20, 0.4, 0.2);
  for (const x of [-0.52, 0.52]) k.torus(x, 0.36, -0.1, 0.33, 0.022, 6, 24, 0);
  k.c(0xc0392b, 0.35, 0.3);
  k.tube([-0.52, 0.36, -0.1], [-0.05, 0.36, -0.1], 0.018); k.tube([-0.05, 0.36, -0.1], [-0.25, 0.8, -0.1], 0.018); k.tube([-0.25, 0.8, -0.1], [0.38, 0.82, -0.1], 0.018);
  k.tube([0.38, 0.82, -0.1], [-0.05, 0.36, -0.1], 0.018); k.tube([0.38, 0.82, -0.1], [0.52, 0.36, -0.1], 0.016);
  k.c(0x111111, 0.5); k.box(-0.36, 0.84, -0.16, -0.14, 0.88, -0.04); k.tube([0.4, 0.82, -0.1], [0.45, 1.0, -0.1], 0.014); k.tube([0.35, 1.0, -0.3], [0.55, 1.0, 0.1], 0.014);
}

// ------------------------------------------------------------------ atlas art
function regions(atlas) {
  const tv = atlas.region('sh:tv', 384, 216, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ff8a4c'); g.addColorStop(0.45, '#f7c173'); g.addColorStop(0.62, '#e46f5a'); g.addColorStop(1, '#23324f');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,240,200,.95)'; c.beginPath(); c.arc(w * 0.7, h * 0.52, 26, 0, 7); c.fill();
    c.fillStyle = '#1a2238'; c.fillRect(0, h * 0.62, w, h);
    c.strokeStyle = '#b8322a'; c.lineWidth = 5; c.fillStyle = '#b8322a';
    for (const x of [w * 0.28, w * 0.62]) { c.fillRect(x - 5, h * 0.18, 10, h * 0.6); c.fillRect(x - 12, h * 0.3, 24, 4); }
    c.beginPath(); c.moveTo(0, h * 0.5); c.quadraticCurveTo(w * 0.28, h * 0.12, w * 0.28, h * 0.19); c.quadraticCurveTo(w * 0.45, h * 0.6, w * 0.62, h * 0.19); c.quadraticCurveTo(w * 0.62, h * 0.12, w, h * 0.5); c.stroke();
    c.fillRect(0, h * 0.6, w, 6);
    text(c, 'NOW PLAYING  ·  HILLBOMB TV', 14, h - 14, 13, 'rgba(255,255,255,.8)', { align: 'left', weight: 700 });
  });
  const monitor = atlas.region('sh:monitor', 256, 128, (c, w, h) => {
    c.fillStyle = '#0d1117'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#152033'; c.fillRect(0, 0, w, 14); text(c, 'hillbomb-sf  —  main.js', 8, 7, 9, '#9fb3c8', { align: 'left', font: SANS, weight: 600 });
    const cols = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787', '#ffa657'];
    for (let i = 0; i < 12; i++) { let x = 12; for (let j = 0; j < 4; j++) { const ww = 10 + ((i * 7 + j * 13) % 40); c.fillStyle = cols[(i + j) % cols.length]; c.fillRect(x, 20 + i * 8.5, ww, 4); x += ww + 5; } }
  });
  const terminal = atlas.region('sh:terminal', 256, 176, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0e1a24'); g.addColorStop(1, '#07121a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    text(c, 'GARAGE', 14, 22, 26, '#4cd964', { align: 'left' }); text(c, 'SELECT A VEHICLE', 14, 44, 12, '#8fb3c4', { align: 'left', weight: 700, track: 2 });
    for (let i = 0; i < 4; i++) { c.fillStyle = i === 0 ? 'rgba(76,217,100,.25)' : 'rgba(255,255,255,.06)'; rrect(c, 12, 60 + i * 26, w - 24, 22, 4); c.fill(); c.fillStyle = i === 0 ? '#4cd964' : 'rgba(255,255,255,.35)'; c.fillRect(20, 67 + i * 26, 60 + i * 12, 8); }
    text(c, 'PRESS  E', w - 14, h - 12, 12, '#ffc247', { align: 'right' });
  });
  const art1 = atlas.region('sh:art1', 256, 160, (c, w, h) => {
    c.fillStyle = '#f0e6d2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8573b'; c.beginPath(); c.arc(w * 0.72, h * 0.4, 34, 0, 7); c.fill();
    c.fillStyle = '#1f3b57'; c.fillRect(0, h * 0.68, w, h);
    c.fillStyle = '#c0362c'; for (const x of [w * 0.25, w * 0.55]) c.fillRect(x - 4, h * 0.15, 8, h * 0.6);
    c.strokeStyle = '#c0362c'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, h * 0.62); c.quadraticCurveTo(w * 0.25, h * 0.1, w * 0.4, h * 0.45); c.quadraticCurveTo(w * 0.55, h * 0.1, w, h * 0.62); c.stroke();
    text(c, 'SAN FRANCISCO', w / 2, h * 0.86, 22, '#f0e6d2', { track: 3 });
  });
  const art2 = atlas.region('sh:art2', 160, 200, (c, w, h) => {
    c.fillStyle = '#efe8da'; c.fillRect(0, 0, w, h);
    const cols = ['#2f4f6e', '#d9a441', '#b8322a', '#5a7a6a'];
    for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(40 + (i % 2) * 70, 50 + Math.floor(i / 2) * 90, 30 + i * 4, 0, 7); c.fill(); }
    c.fillStyle = '#1d1d1f'; c.fillRect(20, h - 30, w - 40, 3);
  });
  const art3 = atlas.region('sh:art3', 140, 180, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fc3d8'); g.addColorStop(1, '#e9d6b0'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3d5e3a'; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.6); c.quadraticCurveTo(w * 0.4, h * 0.35, w, h * 0.7); c.lineTo(w, h); c.fill();
    c.fillStyle = '#e8e2d4'; c.fillRect(w * 0.55, h * 0.3, 8, 24);
  });
  const art4 = atlas.region('sh:art4', 320, 120, (c, w, h) => {
    c.fillStyle = '#1e2a38'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2c14e'; for (let i = 0; i < 40; i++) { c.globalAlpha = 0.3 + (i % 5) / 7; c.fillRect((i * 53) % w, (i * 29) % (h * 0.5), 2, 2); }
    c.globalAlpha = 1; c.fillStyle = '#0f1620'; c.beginPath(); c.moveTo(0, h); c.lineTo(0, h * 0.7); for (let x = 0; x <= w; x += 20) c.lineTo(x, h * (0.45 + ((x * 37) % 30) / 100)); c.lineTo(w, h); c.fill();
    neon(c, 'HILLBOMB', w / 2, h * 0.3, 30, '#ff5a36', { glow: 0.6 });
  });
  const number = atlas.region('sh:number', 180, 64, (c, w, h) => {
    c.fillStyle = '#1d1f24'; rrect(c, 2, 2, w - 4, h - 4, 8); c.fill();
    c.strokeStyle = '#d6a94a'; c.lineWidth = 3; rrect(c, 6, 6, w - 12, h - 12, 6); c.stroke();
    text(c, '1847', w / 2, h / 2 + 2, 40, '#d6a94a', { font: `Georgia,'Times New Roman',serif`, weight: 700 });
  });
  void FONT; void lin;
  const street = atlas.region('sh:street', 256, 48, (c, w, h) => { c.fillStyle = '#1f6b3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8); text(c, 'HYDE  ST', w / 2, h / 2 + 2, 28, '#fff', { track: 4 }); text(c, '1800', w - 22, h - 14, 10, '#fff'); });
  return { tv, monitor, terminal, art1, art2, art3, art4, number, street };
}
