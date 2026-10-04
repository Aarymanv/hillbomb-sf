// BAY MOTORS: a glass-fronted corner dealership at King St & 4th St (SoMa). Double-height hall with a polished
// terrazzo floor, black ceiling with light rings over six display cars on turntables (one on a raised hero stage),
// reception + lounge, glass offices, an LED brand wall, and a drive-out glass door onto 4th St.
// Local frame: front (King St) on -Z, local +X = 4th St (east). Buying a car delivers it to the delivery bay inside
// the drive-out door with you at the wheel.
import { Kit, PAT } from './kit.js';
import { outerFace, innerFace, wbox } from './arch.js';
import * as F from './furniture.js';
import { neon, text, rrect, FONT } from './atlas.js';
import { CARS } from '../../vehicle/cars.js';
import { buildModel, getSpec } from '../../vehicle/cars.js';

const HX = 15.7, HZ = 12.8, T = 0.3, XI = HX - T, ZI = HZ - T;
const CEIL = 7.4, ROOF = 8.0, FASCIA = 9.6;
const PDOOR = [-9.2, -6.8];            // pedestrian sliding doors (front, x range)
const VDOOR = [-2.3, 3.1, 4.4];        // vehicle door (east wall, z range + height)
const BAYZ = 0.4;                      // delivery lane centre (z)
export const FLOOR_PAD = 0.2;
const DISPLAY = [
  { id: 'sedan', x: -9.8, z: -5.8, paint: 0xd9d6cf },
  { id: 'muscle', x: -2.4, z: -5.8, paint: 0xc0392b },
  { id: 'rally', x: 5.0, z: -6.6, paint: 0x1f4fa8 },
  { id: 'ev', x: -9.8, z: 3.4, paint: 0xf2f2f0 },
  { id: 'coupe', x: -2.4, z: 3.4, paint: 0x3a3d42 },
  { id: 'super', x: 9.2, z: 6.9, paint: 0xf2b01e, hero: true },
];
const TT_R = 2.75;

export function setup(S) {
  const Y1 = FASCIA;
  // shell colliders: front glass (gap at the doors), east glass (gap at the vehicle door), solid west + back
  S.box(-HX, -HZ, PDOOR[0], -ZI, S.baseY, Y1); S.box(PDOOR[1], -HZ, HX, -ZI, S.baseY, Y1); S.box(PDOOR[0], -HZ, PDOOR[1], -ZI, 2.6, Y1);
  S.box(XI, -HZ, HX, VDOOR[0], S.baseY, Y1); S.box(XI, VDOOR[1], HX, HZ, S.baseY, Y1); S.box(XI, VDOOR[0], HX, VDOOR[1], VDOOR[2], Y1);
  S.box(-HX, -HZ, -XI, HZ, S.baseY, Y1); S.box(-HX, ZI, HX, HZ, S.baseY, Y1);
  // offices along the back (glass partition with a door gap), reception desk, lounge sofas
  S.box(-XI, 9.3, -6.4, 9.5, 0, 3.0); S.box(-5.2, 9.3, 2.2, 9.5, 0, 3.0);
  S.box(-13.95, -12.25, -12.85, -8.95, 0, 1.2);
  S.box(2.1, 9.3, 2.3, ZI, 0, 3.05);
  S.box(HX + 0.85, -HZ - 1.75, HX + 1.95, -HZ - 1.05, -1, 7.8);
  S.box(-XI, 4.4, -XI + 0.7, 7.2, 0, 1.2);
  // turntables + hero stage (cars sit on them)
  for (const d of DISPLAY) { const r = d.hero ? 3.1 : TT_R; S.box(d.x - r * 0.8, d.z - r * 0.8, d.x + r * 0.8, d.z + r * 0.8, 0, d.hero ? 1.2 : 1.1); }
  // floor deck (drivable: cars can come in through the vehicle door) + a ramp lip outside the door
  S.floor(-XI, -ZI, HX + 0.05, ZI, 0);
  const g = S.groundLocal(HX + 3.2, BAYZ);
  S.ramp([HX + 3.2, BAYZ, Math.min(-0.02, g + 0.02)], [HX, BAYZ, 0], VDOOR[1] - VDOOR[0], 'apron');
  S.ceiling(-HX, -HZ, HX, HZ, CEIL);
  S.volume(-XI, 0, -ZI, XI, CEIL, ZI, { name: 'hall' });
  S.lightSpots = { hall: [[-6.0, 5.2, -2.0, 0xfff2e0, 60], [5.5, 5.2, 2.5, 0xfff2e0, 60]] };
  S.door({ label: 'Bay Motors', out: [(PDOOR[0] + PDOOR[1]) / 2, -HZ - 1.4, 0], in: [(PDOOR[0] + PDOOR[1]) / 2, -HZ + 1.6, Math.PI], y: 0 });
  // walk up to a car to see its card
  for (const d of DISPLAY) {
    S.interact([d.x, 0, d.z], {
      r: d.hero ? 4.0 : 3.7,
      prompt: () => { const c = CARS[d.id]; const own = S.G.economy.owned.includes(d.id); return `<b>${c.name}</b>Class ${c.cls} · ${own ? 'Owned' : '$' + c.price.toLocaleString()}<br>Press <kbd>E</kbd> to view`; },
      use: () => S.ctx.carCard(d.id, S, (id) => deliver(S, id)),
    });
  }
  S.spawn = { at: [10.0, BAYZ], yaw: -Math.PI / 2 };
}

function deliver(S, id) {
  const ctx = S.ctx, G = S.G;
  ctx.fade(() => {
    const P = G.player;
    if (P.vehicle) P.exitVehicle(true);
    const v = ctx.spawnCar(id, S, S.spawn.at[0], S.spawn.at[1], S.spawn.yaw);
    P.setVehicle(v);
    setTimeout(() => G.hud.toast(`${CARS[id].name} is yours`, 'Drive it out through the glass door onto 4th St', 'good', 4200), 500);
  }, 600);
}

// ------------------------------------------------------------------ build
export function build(S, ctx) {
  const k = new Kit();
  const reg = regions(ctx.atlas);
  const hall = k.addRoom(-XI, 0, -ZI, XI, CEIL, ZI, { amb: [0.34, 0.34, 0.36], indirect: 0.45, fall: 0.8 });

  // ================================================================ exterior
  k.room(-1);
  const WF = { axis: 'z', out: -HZ, inn: -ZI, u0: -HX, u1: HX }, WE = { axis: 'x', out: HX, inn: XI, u0: -HZ, u1: HZ };
  const WW = { axis: 'x', out: -HX, inn: -XI, u0: -HZ, u1: HZ }, WB = { axis: 'z', out: HZ, inn: ZI, u0: -HX, u1: HX };
  const GL = [0.2, CEIL - 0.1];                // glazed band height on the glass facades
  const frontHoles = [[-HX + 0.4, HX - 0.1, GL[0], GL[1]]], eastHoles = [[-HZ + 0.1, HZ - 0.4, GL[0], GL[1]]];
  k.c(0x2b2e33, 0.35, 0.6, PAT.PANEL, 0.5); outerFace(k, WF, S.baseY, FASCIA, frontHoles); outerFace(k, WE, S.baseY, FASCIA, eastHoles);
  k.tex('stucco', 0xd9d6cf, 0.9); outerFace(k, WW, S.baseY, ROOF + 0.4, []); outerFace(k, WB, S.baseY, ROOF + 0.4, []);
  k.c(0x2b2e33, 0.4, 0.5); // fascia returns + roof edge
  k.box(-HX, ROOF, -HZ, HX, FASCIA, -HZ + 0.3); k.box(HX - 0.3, ROOF, -HZ, HX, FASCIA, HZ);
  k.tex('gravel_roof', 0x55565a, 1.0); k.floor(-HX, -HZ, HX, HZ, ROOF, 3);
  k.c(0x2b2e33, 0.4, 0.5); k.box(-HX, ROOF, HZ - 0.3, HX - 0.3, ROOF + 0.9, HZ); k.box(-HX, ROOF, -HZ + 0.3, -HX + 0.3, ROOF + 0.9, HZ - 0.3);
  // curtain wall: mullions + transom + glass
  curtainWall(k, WF, -HX + 0.4, HX - 0.1, GL, [PDOOR]);
  curtainWall(k, WE, -HZ + 0.1, HZ - 0.4, GL, [[VDOOR[0], VDOOR[1]]]);
  // brand fascia + pylon
  k.signZ(-4.0, ROOF + 0.7, -HZ - 0.02, 13.0, 1.6, reg.logo, 'sign');
  k.signX(HX + 0.02, ROOF + 0.7, 1.0, 12.0, 1.5, reg.logo, 'sign', 1);
  pylon(k, reg);
  // entrance canopy
  k.c(0x2b2e33, 0.35, 0.6); k.box(PDOOR[0] - 1.2, 3.1, -HZ - 2.2, PDOOR[1] + 1.2, 3.35, -HZ);
  k.in('glow', () => { k.glow(0xfff1dc, 3.5); for (let i = 0; i < 3; i++) k.box(PDOOR[0] - 0.6 + i * 1.8, 3.09, -HZ - 1.4, PDOOR[0] - 0.2 + i * 1.8, 3.1, -HZ - 0.8, 8); });
  // drive-out door frame + sign
  k.c(0x2b2e33, 0.35, 0.6); wbox(k, WE, VDOOR[0] - 0.25, VDOOR[1] + 0.25, VDOOR[2], VDOOR[2] + 0.45, HX, HX + 0.25);
  k.signX(HX + 0.26, VDOOR[2] + 0.22, (VDOOR[0] + VDOOR[1]) / 2, 3.2, 0.36, reg.driveout, 'sign', 1);
  // apron outside the vehicle door
  const ay = Math.min(-0.02, S.groundLocal(HX + 3.2, BAYZ));
  k.c(0xa9a59b, 0.85, 0, PAT.CONCRETE, 1);
  k.quad([HX, 0.012, VDOOR[0]], [HX, 0.012, VDOOR[1]], [HX + 3.2, ay + 0.17, VDOOR[1]], [HX + 3.2, ay + 0.17, VDOOR[0]]);
  // sliding doors (animated) + vehicle door (rolls up)
  k.group('pdoorL'); k.room(-1); slidingLeaf(k, PDOOR[0], (PDOOR[0] + PDOOR[1]) / 2);
  k.group('pdoorR'); slidingLeaf(k, (PDOOR[0] + PDOOR[1]) / 2, PDOOR[1]);
  k.group('vdoor'); vehicleDoor(k);
  k.group('');

  // ================================================================ interior
  k.room(hall);
  k.tex('marble', 0xdedcd8, 0.25, 0, 0.8); k.floor(-XI, -ZI, XI, ZI, 0.002, 0.9);
  // dark band around the vehicle lane
  k.c(0x3a3d42, 0.18, 0, PAT.TERRAZZO, 1); k.floor(6.5, VDOOR[0] + 0.1, XI, VDOOR[1] - 0.1, 0.004, 0.9);
  k.c(0xf2c14e, 0.4); for (const z of [VDOOR[0] + 0.1, VDOOR[1] - 0.2]) k.box(6.5, 0.004, z, XI, 0.007, z + 0.1, 4);
  // ceiling: black acoustic + light slots
  k.c(0x141518, 0.95, 0, PAT.CARPET, 0.5); k.floor(-XI, -ZI, XI, ZI, CEIL, 1.2, true);
  // interior faces: west feature wall (dark slats), back wall (warm grey), inner sides of the glass walls
  k.c(0x2a2622, 0.6, 0, PAT.PANEL, 0.35); innerFace(k, WW, -ZI, ZI, 0, CEIL, [], 0.8);
  k.tex('painted_plaster', 0xcfcac2, 1.0); innerFace(k, WB, -XI, XI, 0, CEIL, [], 0.8);
  k.c(0x2b2e33, 0.4, 0.5); innerFace(k, WF, -XI, XI, 0, CEIL, frontHoles, 0.8); innerFace(k, WE, -ZI, ZI, 0, CEIL, eastHoles, 0.8);
  k.c(0x1a1b1e, 0.5); k.box(-XI, 0, -ZI, -XI + 0.05, 0.12, ZI); k.box(-XI, 0, ZI - 0.05, XI, 0.12, ZI);
  // LED brand wall on the west wall
  k.c(0x0c0d0f, 0.4, 0.3); k.box(-XI, 1.2, -9.0, -XI + 0.12, 6.2, 3.0);
  k.signX(-XI + 0.125, 3.7, -3.0, 11.6, 4.8, reg.wall, 'sign', 1);
  k.light(-XI + 1.5, 3.7, -3.0, [0.6, 0.75, 1.0], 1.2, { range: 7, r0: 2.5 });
  // turntables + light rings
  for (const d of DISPLAY) turntable(k, d, reg);
  // walnut slat feature wall behind the hero stage, warm LED washes
  k.c(0x2a1c12, 0.6); k.box(3.0, 0, ZI - 0.06, XI - 0.3, 6.6, ZI - 0.02);
  for (let x = 3.08; x < XI - 0.35; x += 0.16) { k.c(0x6a4428, 0.5, 0, PAT.GRAIN, 1); k.box(x, 0.15, ZI - 0.16, x + 0.09, 6.5, ZI - 0.06); }
  k.in('glow', () => { k.glow(0xffc27a, 3.2); k.box(3.0, 6.52, ZI - 0.3, XI - 0.3, 6.56, ZI - 0.05, 8); k.box(3.0, 0.1, ZI - 0.3, XI - 0.3, 0.13, ZI - 0.05, 4); });
  for (let x = 4.5; x < XI - 0.5; x += 3) k.light(x, 6.3, ZI - 0.6, [1, 0.72, 0.42], 1.2, { range: 5, r0: 1.2, dir: [0, -1, -0.1], cos0: -0.2, cos1: 0.4 });
  k.sign([12.6, 3.2, ZI - 0.17], [5.6, 3.2, ZI - 0.17], [5.6, 4.2, ZI - 0.17], [12.6, 4.2, ZI - 0.17], reg.logo, 'sign');
  // posters above the offices
  for (let i = 0; i < 3; i++) { const x = -12.2 + i * 4.6; k.at(x, 5.0, ZI - 0.02, 0, () => F.frame(k, { w: 3.6, h: 2.0, region: reg.posters[i], col: 0x1b1d21, mat: 0x1b1d21 })); k.light(x, 6.6, ZI - 1.2, [1, 0.95, 0.88], 0.8, { range: 4, r0: 1.2, dir: [0, -0.6, 0.8], cos0: 0.2, cos1: 0.7 }); }
  // track lighting over the lanes + downlights
  for (const x of [-10.2, -2.6, 5.0]) for (const z of [-10.8, 8.6]) k.at(x, 0, z, 0, () => F.tubeLight(k, { ceil: CEIL, len: 3.0, I: 1.4, col: [1, 0.96, 0.9], glowK: 5, range: 9 }));
  for (let x = 7.5; x <= 14; x += 3.2) k.at(x, 0, BAYZ, Math.PI / 2, () => F.tubeLight(k, { ceil: CEIL, len: 2.0, I: 1.5, col: [1, 0.97, 0.92], glowK: 5, range: 8 }));
  // reception desk (curved-ish, white with a logo band) near the entrance
  k.at(-13.4, 0, -10.6, -Math.PI / 2, () => reception(k, reg));
  // lounge: sofas, rug, coffee table, espresso bar, plants
  k.at(-11.8, 0, 7.6, 0, () => F.rug(k, { w: 4.4, d: 3.0, col: 0x4a4f57, border: 0x2a2d33, inner: 0x5a606a }));
  k.at(-11.8, 0, 8.9, Math.PI, () => F.sofa(k, { w: 2.6, col: 0x2d3440 }));
  k.at(-13.9, 0, 7.4, -Math.PI / 2, () => F.armchair(k, { col: 0x8a5a3a }));
  k.at(-9.7, 0, 7.4, Math.PI / 2, () => F.armchair(k, { col: 0x8a5a3a }));
  k.at(-11.8, 0, 7.4, 0, () => F.coffeeTable(k, { w: 1.3, top: 0x1d1d20, legs: 0xc59a4a, seed: 9 }));
  k.at(-XI + 0.35, 0, 5.8, -Math.PI / 2, () => espressoBar(k));
  for (const [x, z, s] of [[-XI + 0.5, -ZI + 0.5, 2], [-XI + 0.5, ZI - 3.6, 3], [-4.4, 8.8, 4], [XI - 0.6, ZI - 0.6, 5], [-4.8, -ZI + 0.5, 6]]) k.at(x, 0, z, 0, () => F.plant(k, { h: 1.8, seed: s, kind: s % 2 ? 'palm' : 'bush', pot: 0x2b2e33 }));
  for (const [x, z] of [[-11.8, 7.6]]) k.at(x, 0, z, 0, () => F.pendant(k, { ceil: CEIL, y: 2.6, shade: 0xc59a4a, style: 'brass', I: 1.4 }));
  // glass offices along the back wall (behind a glazed partition at z = 9.3..9.5)
  offices(k, reg);
  // bake: warm-neutral fill from the huge windows
  for (let x = -12; x <= 12; x += 6) k.win(x, 3.5, -ZI, 0, 1, 1.4, 10);
  for (let z = -9; z <= 9; z += 6) k.win(XI, 3.5, z, -1, 0, 1.4, 10);

  const out = k.toMeshes(ctx.mats);
  const group = out.groups[''] || new THREEGroup(), ext = out.groups.x || new THREEGroup();
  const cx = (PDOOR[0] + PDOOR[1]) / 2;
  const pL = ctx.pivot(out.groups.pdoorL, 0, 0, 0), pR = ctx.pivot(out.groups.pdoorR, 0, 0, 0), pV = ctx.pivot(out.groups.vdoor, HX - 0.15, VDOOR[2], 0);
  ext.add(pL, pR, pV);
  // display cars on turntables
  const cars = [];
  for (const d of DISPLAY) {
    try {
      const m = buildModel(CARS[d.id].model, { paint: d.paint, seed: 3 });
      const spin = new THREEGroup();
      spin.position.set(d.x, d.hero ? 0.62 : 0.16, d.z);
      spin.rotation.y = (d.x + d.z) * 0.37;
      spin.add(m.root);
      m.setLights?.({ head: true, brake: false });
      m.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      const calls = mergeByMaterial(m.root);
      group.add(spin);
      cars.push({ spin, m, d, calls });
    } catch (e) { console.warn('[interiors] display car', d.id, e); }
  }
  let dOpen = 0, vOpen = 0;
  return {
    group, ext, drawCalls: out.drawCalls + cars.reduce((n, c) => n + c.calls, 0), stats: out.stats,
    update(dt, info) {
      for (const c of cars) c.spin.rotation.y += dt * (c.d.hero ? 0.18 : 0.12);
      const p = info.playerLocal;
      const near = p && Math.abs(p[0] - cx) < 2.6 && Math.abs(p[2] + HZ) < 3.2 && p[1] < 3;
      dOpen = approach(dOpen, near ? 1 : 0, dt * 2.5);
      const e = dOpen * dOpen * (3 - 2 * dOpen);
      pL.position.x = -e * 1.15; pR.position.x = e * 1.15; pL.updateMatrix(); pR.updateMatrix();
      const reach = info.inCar ? 14 : 5;
      const vNear = p && p[0] > HX - reach && p[0] < HX + reach && p[2] > VDOOR[0] - 4 && p[2] < VDOOR[1] + 4 && p[1] < 3;
      vOpen = approach(vOpen, vNear ? 1 : 0, dt * 1.2);
      const v = vOpen * vOpen * (3 - 2 * vOpen);
      pV.rotation.z = -v * Math.PI / 2 * 0.98; pV.updateMatrix();
    },
    dispose() { for (const c of cars) c.m.dispose?.(); },
  };
}
function approach(v, t, d) { return v + Math.sign(t - v) * Math.min(Math.abs(t - v), d); }
import { Group as THREEGroup, Matrix4 as THREEMatrix4 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// static display car: merge every mesh that shares a material (body details + the four wheels) into one draw call.
// Geometries are cloned first (models share them between instances); mirrored wheels get their winding flipped.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREEMatrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  root.traverse(o => { if (o.isMesh) (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(o); });
  let calls = 0;
  for (const [mat, list] of byMat) {
    if (list.length < 2) { calls++; continue; }
    try {
      const geos = list.map(o => {
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
        const m = new THREEMatrix4().multiplyMatrices(inv, o.matrixWorld);
        g.applyMatrix4(m);
        if (m.determinant() < 0) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; for (let i = 0; i < p.count; i += 3) for (const a of [p, n, u].filter(Boolean)) { for (let c = 0; c < a.itemSize; c++) { const t = a.array[(i + 1) * a.itemSize + c]; a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c]; a.array[(i + 2) * a.itemSize + c] = t; } } }
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        return g;
      });
      const keys = Object.keys(geos[0].attributes);
      if (!geos.every(g => Object.keys(g.attributes).length === keys.length && keys.every(k => g.attributes[k]))) { calls += list.length; continue; }
      const merged = mergeGeometries(geos, false);
      if (!merged) { calls += list.length; continue; }
      for (const o of list) o.visible = false;
      const mesh = new list[0].constructor(merged, mat);
      mesh.userData.own = true; mesh.castShadow = false; mesh.receiveShadow = true;
      root.add(mesh); calls++;
      for (const g of geos) g.dispose();
    } catch (e) { calls += list.length; }
  }
  return calls;
}

// ------------------------------------------------------------------ pieces
function curtainWall(k, W, u0, u1, GL, gaps) {
  const n = Math.round((u1 - u0) / 2.4), step = (u1 - u0) / n;
  const out = W.out, mid = (W.out + W.inn) / 2;
  k.c(0x1b1d21, 0.35, 0.7);
  for (let i = 0; i <= n; i++) { const u = u0 + i * step; wbox(k, W, u - 0.05, u + 0.05, GL[0], GL[1], out - Math.sign(W.inn - W.out) * 0.06, W.inn); }
  // transom at 4.6 m + sill + head
  for (const v of [GL[0], 4.6, GL[1] - 0.08]) {
    const segs = []; let a = u0;
    for (const g of gaps) { if (v < 4.4 && g[0] > a) { segs.push([a, g[0]]); a = g[1]; } }
    segs.push([a, u1]);
    for (const [s0, s1] of v < 4.4 ? segs : [[u0, u1]]) wbox(k, W, s0, s1, v, v + 0.08, out - Math.sign(W.inn - W.out) * 0.06, W.inn);
  }
  k.bucket('glass');
  // fixed glass everywhere except the door openings below the transom
  const pts = (u, v, w) => (W.axis === 'z' ? [u, v, w] : [w, v, u]);
  const pane = (a, b, c, d) => k.quad(pts(a, c, mid), pts(b, c, mid), pts(b, d, mid), pts(a, d, mid));
  let a = u0;
  for (const g of gaps) { pane(a, g[0], GL[0], 4.6); a = g[1]; }
  pane(a, u1, GL[0], 4.6);
  pane(u0, u1, 4.68, GL[1]);
  k.bucket('main');
}
function slidingLeaf(k, x0, x1) {
  const z = -ZI - 0.12;
  k.c(0x1b1d21, 0.35, 0.7); k.box(x0 + 0.02, 0, z - 0.03, x1 - 0.02, 0.08, z + 0.03); k.box(x0 + 0.02, 2.5, z - 0.03, x1 - 0.02, 2.58, z + 0.03);
  k.box(x0 + 0.02, 0, z - 0.03, x0 + 0.08, 2.58, z + 0.03); k.box(x1 - 0.08, 0, z - 0.03, x1 - 0.02, 2.58, z + 0.03);
  k.c(0xc0c4c8, 0.2, 1); k.box((x0 + x1) / 2 - 0.02, 0.9, z - 0.06, (x0 + x1) / 2 + 0.02, 1.5, z - 0.03);
  k.in('glass', () => k.quad([x0 + 0.08, 0.08, z], [x1 - 0.08, 0.08, z], [x1 - 0.08, 2.5, z], [x0 + 0.08, 2.5, z]));
}
function vehicleDoor(k) {
  // glass sectional door hinged at its top edge (pivot at x = HX - 0.15, y = VDOOR[2])
  const x = HX - 0.15, [z0, z1, h] = VDOOR;
  k.c(0x1b1d21, 0.35, 0.7);
  for (let i = 0; i <= 4; i++) { const y = i * h / 4; k.box(x - 0.04, Math.max(0, y - 0.05), z0, x + 0.04, Math.min(h, y + 0.05), z1); }
  k.box(x - 0.04, 0, z0, x + 0.04, h, z0 + 0.08); k.box(x - 0.04, 0, z1 - 0.08, x + 0.04, h, z1);
  k.in('glass', () => k.quad([x, 0.05, z1 - 0.08], [x, 0.05, z0 + 0.08], [x, h - 0.05, z0 + 0.08], [x, h - 0.05, z1 - 0.08]));
}
function turntable(k, d, reg) {
  const r = d.hero ? 3.1 : TT_R, h = d.hero ? 0.62 : 0.16;
  if (d.hero) {
    k.c(0x1b1d21, 0.3, 0.4); k.cyl(d.x, 0, d.z, r + 0.2, r + 0.35, 0.45, 48);
    k.in('glow', () => { k.glow(0xffc247, 3); k.torus(d.x, 0.47, d.z, r + 0.12, 0.025, 6, 64); });
    k.c(0xd8d6d0, 0.15, 0.1, PAT.TERRAZZO, 1); k.cyl(d.x, 0.45, d.z, r, r, h - 0.45, 48);
  } else {
    k.c(0x2b2e33, 0.25, 0.5); k.cyl(d.x, 0, d.z, r + 0.08, r + 0.12, 0.06, 48);
    k.c(0xcfd0d2, 0.2, 0.8); k.cyl(d.x, 0.06, d.z, r, r, h - 0.06, 48);
    k.c(0x9a9da2, 0.3, 0.9); for (let i = 1; i <= 3; i++) k.torus(d.x, h + 0.001, d.z, r * i / 3.4, 0.008, 4, 48);
    k.in('glow', () => { k.glow(0x9fd4ff, 2.6); k.torus(d.x, 0.07, d.z, r + 0.1, 0.018, 5, 64); });
  }
  // light ring on the ceiling + downlight cone
  k.c(0x1b1d21, 0.4, 0.5); k.torus(d.x, CEIL - 0.25, d.z, r * 0.8, 0.08, 8, 48);
  k.in('glow', () => { k.glow(0xfff4e6, 5); k.torus(d.x, CEIL - 0.33, d.z, r * 0.8, 0.035, 6, 48); });
  k.c(0x111111, 0.6); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.tube([d.x + Math.cos(a) * r * 0.8, CEIL - 0.25, d.z + Math.sin(a) * r * 0.8], [d.x + Math.cos(a) * r * 0.8, CEIL, d.z + Math.sin(a) * r * 0.8], 0.008, 4); }
  k.addLight(d.x, CEIL - 0.6, d.z, [1, 0.97, 0.92], d.hero ? 5.5 : 4.2, { room: k.st.room, range: 9, r0: 2.4, wrap: 0.1, dir: [0, -1, 0], cos0: 0.35, cos1: 0.8 });
  k.addOcc(d.x - r * 0.75, h, d.z - r * 0.75, d.x + r * 0.75, h + 1.2, d.z + r * 0.75, 0.3, k.st.room, 0.6);
  // spec plinth (small lit sign stand) at the front of each car
  k.at(d.x - r - 0.5, 0, d.z - r * 0.5, 0.35, () => { k.c(0x1b1d21, 0.3, 0.5); k.box(-0.18, 0, -0.1, 0.18, 1.0, 0.1); k.c(0x1b1d21, 0.3, 0.5); k.push(0, 1.0, 0, 0, 1, -0.5); k.box(-0.26, 0, -0.2, 0.26, 0.04, 0.2); k.sign([0.24, 0.041, -0.18], [-0.24, 0.041, -0.18], [-0.24, 0.041, 0.18], [0.24, 0.041, 0.18], reg.plates[d.id], 'sign'); k.pop(); });
}
function reception(k, reg) {
  k.c(0xf2f0ec, 0.25); k.box(-1.6, 0, -0.5, 1.6, 1.05, 0.5);
  k.c(0x2b2e33, 0.3, 0.5); k.box(-1.65, 1.05, -0.55, 1.65, 1.1, 0.55);
  k.c(0xc59a4a, 0.3, 1); k.box(-1.61, 0.1, -0.52, 1.61, 0.16, -0.5);
  k.sign([1.2, 0.45, -0.505], [-1.2, 0.45, -0.505], [-1.2, 0.9, -0.505], [1.2, 0.9, -0.505], reg.logo, 'sign');
  k.c(0x1a1b1e, 0.4); k.box(-0.5, 1.1, 0.1, -0.02, 1.42, 0.13); k.box(0.3, 1.1, 0.1, 0.78, 1.42, 0.13);
  k.at(-0.5, 0, 1.2, Math.PI, () => F.officeChair(k)); k.at(0.5, 0, 1.2, Math.PI, () => F.officeChair(k));
  k.in('glow', () => { k.glow(0xffc247, 2.5); k.box(-1.6, 0.02, 0.5, 1.6, 0.04, 0.52, 16); });
  k.occBox(-1.6, 0, -0.5, 1.6, 1.1, 0.5, 0.5);
  k.at(0, 0, 0, 0, () => F.pendant(k, { ceil: CEIL, y: 2.8, shade: 0x1d1d20, style: 'cone', I: 1.0 }));
}
function espressoBar(k) {
  F.cabinet(k, { w: 2.6, h: 0.92, d: 0.6, col: 0x1d1d20, handle: 0xc59a4a, doors: 4, top: PAT.TERRAZZO, topCol: 0xeae6de });
  k.c(0xc0c4c8, 0.2, 1); k.box(-0.4, 0.92, -0.2, 0.2, 1.35, 0.2);
  k.c(0x1d1d20, 0.3); k.box(-0.36, 1.05, -0.24, 0.16, 1.1, -0.2);
  for (let i = 0; i < 6; i++) { k.c(0xf2eee4, 0.3); k.cyl(0.6 + (i % 3) * 0.12, 0.92, -0.05 + Math.floor(i / 3) * 0.12, 0.04, 0.035, 0.08, 10); }
  k.c(0x2e86c1, 0.4); k.box(-1.1, 0.92, -0.2, -0.7, 1.0, 0.2);
}
function offices(k, reg) {
  // partition: glass with mullions at z = 9.4, door gap x in [-6.4, -5.2]
  const z = 9.4;
  k.c(0x1b1d21, 0.35, 0.7);
  for (let x = -XI; x <= 2.2; x += 2.4) k.box(x - 0.04, 0, z - 0.04, x + 0.04, 3.0, z + 0.04);
  k.box(-XI, 2.95, z - 0.05, 2.2, 3.05, z + 0.05); k.box(-XI, 0, z - 0.05, 2.2, 0.08, z + 0.05);
  k.in('glass', () => { k.quad([-XI, 0.08, z], [-6.4, 0.08, z], [-6.4, 2.95, z], [-XI, 2.95, z]); k.quad([-5.2, 0.08, z], [2.2, 0.08, z], [2.2, 2.95, z], [-5.2, 2.95, z]); });
  k.c(0x1b1d21, 0.35, 0.7); k.box(2.1, 0, z, 2.3, 3.05, ZI);
  k.c(0xe9e6e0, 0.9); k.floor(-XI, z, 2.2, ZI, 3.05, 0.8, true);
  k.c(0x2b2e33, 0.5); k.floor(-XI, z - 0.05, 2.3, ZI, 3.1, 1.2);
  k.tex('carpet', 0x3a3e46, 1.0); k.floor(-XI, z + 0.05, 2.2, ZI, 0.006, 0.6);
  for (const x of [-12.5, -8.4, -2.8, 0.6]) {
    k.at(x, 0, ZI - 0.7, Math.PI, () => F.desk(k, { w: 1.5, top: 0xe8e4dc, screen: reg.screen }));
    k.at(x, 0, ZI - 1.5, 0, () => F.officeChair(k));
    k.at(x, 0, ZI - 1.3, 0, () => F.ceilingDisc(k, { ceil: 3.05, I: 1.0, r: 0.25 }));
  }
  k.at(-6.8, 0, ZI - 0.5, 0, () => F.plant(k, { h: 1.3, seed: 41 }));
}
function pylon(k, reg) {
  const x = HX + 1.4, z = -HZ - 1.4;
  k.c(0x1b1d21, 0.35, 0.5); k.box(x - 0.55, -1, z - 0.35, x + 0.55, 7.8, z + 0.35);
  k.signZ(x, 4.6, z - 0.36, 0.95, 5.8, reg.pylon, 'sign');
  k.signX(x + 0.56, 4.6, z, 0.6, 5.8, reg.pylon, 'sign', 1);
}

// ------------------------------------------------------------------ atlas art
function regions(atlas) {
  const logo = atlas.region('bm:logo', 512, 64, (c, w, h) => {
    neon(c, 'BAY MOTORS', w * 0.5, h * 0.52, 50, '#ff5a36', { italic: true, glow: 0.5, track: 6 });
  });
  const driveout = atlas.region('bm:driveout', 256, 32, (c, w, h) => { c.fillStyle = 'rgba(12,14,20,.9)'; c.fillRect(0, 0, w, h); text(c, 'DRIVE-OUT  ·  DELIVERIES', w / 2, h / 2 + 1, 20, '#ffc247', { track: 3 }); });
  const pylon = atlas.region('bm:pylon', 64, 384, (c, w, h) => {
    c.fillStyle = '#101216'; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); neon(c, 'BAY MOTORS', 0, 2, 40, '#ff5a36', { italic: true, glow: 0.4, track: 4 }); c.restore();
  });
  const wall = atlas.region('bm:wall', 512, 212, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0b1426'); g.addColorStop(0.6, '#1c1036'); g.addColorStop(1, '#3a0f1c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,90,54,.35)'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(0, h * 0.72 + i * 6); c.bezierCurveTo(w * 0.3, h * 0.55 + i * 5, w * 0.6, h * 0.95, w, h * 0.6 + i * 7); c.stroke(); }
    // car silhouette
    c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.moveTo(w * 0.2, h * 0.66); c.lineTo(w * 0.27, h * 0.52); c.quadraticCurveTo(w * 0.42, h * 0.36, w * 0.56, h * 0.4); c.lineTo(w * 0.7, h * 0.5); c.lineTo(w * 0.8, h * 0.54); c.lineTo(w * 0.82, h * 0.66); c.closePath(); c.fill();
    c.fillStyle = '#0b1426'; for (const x of [0.32, 0.7]) { c.beginPath(); c.arc(w * x, h * 0.67, h * 0.07, 0, 7); c.fill(); }
    neon(c, 'BAY MOTORS', w * 0.5, h * 0.18, 34, '#ff5a36', { italic: true, glow: 0.5, track: 5 });
    text(c, 'SAN FRANCISCO  ·  EST. 1968', w * 0.5, h * 0.88, 14, 'rgba(255,255,255,.75)', { track: 4 });
  });
  const screen = atlas.region('bm:screen', 192, 96, (c, w, h) => {
    c.fillStyle = '#f5f6f8'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a36'; c.fillRect(0, 0, w, 12);
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#d6d9de' : '#c4c8ce'; c.fillRect(8, 18 + i * 14, w - 60, 8); }
    c.fillStyle = '#2e86c1'; for (let i = 0; i < 5; i++) c.fillRect(w - 44 + i * 7, h - 12 - i * 9, 5, i * 9 + 4);
  });
  const plates = {};
  for (const d of DISPLAY) {
    const c = CARS[d.id];
    plates[d.id] = atlas.region('bm:plate:' + d.id, 160, 120, (g, w, h) => {
      g.fillStyle = '#101216'; g.fillRect(0, 0, w, h);
      g.fillStyle = { S: '#b36bff', A: '#ff5a36', B: '#ffc247', C: '#4cd964', D: '#5aa9ff' }[c.cls] || '#ff5a36'; g.fillRect(0, 0, w, 8);
      text(g, c.name.toUpperCase(), w / 2, 34, 20, '#f4f2ee', { maxW: w - 16 });
      text(g, 'CLASS ' + c.cls + '  ·  ' + c.drive, w / 2, 60, 14, 'rgba(244,242,238,.65)', { track: 1 });
      text(g, '$' + c.price.toLocaleString(), w / 2, 92, 28, '#ffc247');
    });
  }
  const posters = ['#ff5a36', '#2e7bff', '#ffc247'].map((col, i) => atlas.region('bm:poster' + i, 256, 144, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0b0d12'); gr.addColorStop(1, col); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(w * 0.12, h * 0.7); g.lineTo(w * 0.2, h * 0.55); g.quadraticCurveTo(w * 0.4, h * 0.38 - i * 6, w * 0.6, h * 0.45); g.lineTo(w * 0.86, h * 0.56); g.lineTo(w * 0.88, h * 0.7); g.closePath(); g.fill();
    g.fillStyle = '#0b0d12'; for (const x of [0.28, 0.74]) { g.beginPath(); g.arc(w * x, h * 0.71, h * 0.08, 0, 7); g.fill(); }
    text(g, ['BORN ON THE HILLS', 'ELECTRIC BAY', 'GOLD STANDARD'][i], w * 0.06, h * 0.14, 22, '#fff', { align: 'left', track: 2 });
  }));
  void rrect; void FONT;
  return { logo, driveout, pylon, wall, screen, plates, posters };
}
void getSpec;
