// Street-front shop shell shared by the diner, bodega, cafe and pizzeria: a 1-3 storey building on its lot with a
// glazed storefront (bulkhead, mullions, transom, sign band, swing door), optional corner windows, awning and blade
// sign, a finished shop room behind it, and dressed (lit, curtained) upper floors seen through their windows.
// spec: {
//   hx, hz            half footprint (local, front on -Z)
//   gh, floors, uh    ground storey height, number of upper storeys, upper storey height
//   depth             shop room depth from the front wall (back-of-house wall at z = -hz + depth)
//   corner            'L' | 'R' | null: side street on local -X / +X (gets shop windows + upper windows)
//   sf: [x0, x1]      storefront opening, door: [x0, x1] inside it
//   facade: { key, col, upKey, upCol, trim, frame }  PBR keys + tints for the ground / upper facades
//   awning: { col, stripe } | null, sign: region (sign band), blade: region | null
// }
import { PAT } from './kit.js';
import { outerFace, innerFace, reveal, windowUnit, wbox } from './arch.js';
import * as F from './furniture.js';

export function shopSetup(S, sp) {
  const { hx, hz, gh, depth } = sp;
  const T = 0.25, XI = hx - T, ZI = hz - T, top = gh + sp.floors * sp.uh + 1.2;
  const [d0, d1] = sp.door;
  // shell (front split around the door)
  S.box(-hx, -hz, d0, -ZI, S.baseY, top); S.box(d1, -hz, hx, -ZI, S.baseY, top); S.box(d0, -hz, d1, -ZI, 2.45, top);
  S.box(-hx, ZI, hx, hz, S.baseY, top); S.box(-hx, -hz, -XI, hz, S.baseY, top); S.box(XI, -hz, hx, hz, S.baseY, top);
  // back-of-house wall
  const bz = -hz + depth;
  S.box(-XI, bz, XI, bz + 0.2, 0, gh);
  S.floor(-XI, -hz - 0.05, XI, bz, 0);
  const g = S.groundLocal((d0 + d1) / 2, -hz - 1.2);
  if (g < -0.12) S.ramp([(d0 + d1) / 2, -hz - 1.3, g + 0.02], [(d0 + d1) / 2, -hz, 0], d1 - d0 + 0.6, 'step');
  S.ceiling(-hx, -hz, hx, bz + 0.2, gh - 0.02);
  S.volume(-XI, 0, -ZI, XI, gh - 0.02, bz, { name: 'shop', clampXZ: true });
  S.door({ label: sp.label || S.name, out: [(d0 + d1) / 2, -hz - 1.3, 0], in: [(d0 + d1) / 2, -hz + 1.4, Math.PI], y: 0 });
  return { XI, ZI, bz };
}

// builds the shell into kit k. Returns { room, XI, ZI, bz, doorPivot: [x, z] } (door leaf is in group 'sdoor')
export function shopBuild(k, S, sp, { roomOpts = {}, upperRoomOpts = {} } = {}) {
  const { hx, hz, gh, uh, floors, depth } = sp;
  const T = 0.25, XI = hx - T, ZI = hz - T, bz = -hz + depth, ROOFY = gh + floors * uh;
  const fc = sp.facade;
  const shop = k.addRoom(-XI, 0, -ZI, XI, gh - 0.02, bz, { amb: [0.22, 0.2, 0.18], indirect: 0.35, ...roomOpts });
  const upper = floors ? k.addRoom(-XI, gh, -ZI, XI, ROOFY - 0.02, ZI, { amb: [0.3, 0.22, 0.15], indirect: 0.4, ...upperRoomOpts }) : -1;
  const WF = { axis: 'z', out: -hz, inn: -ZI, u0: -hx, u1: hx }, WB = { axis: 'z', out: hz, inn: ZI, u0: -hx, u1: hx };
  const WL = { axis: 'x', out: -hx, inn: -XI, u0: -hz, u1: hz }, WR = { axis: 'x', out: hx, inn: XI, u0: -hz, u1: hz };
  const SF = [sp.sf[0], sp.sf[1], 0, gh - 0.95];
  // upper windows
  const upWins = (u0, u1, n) => { const out = []; const step = (u1 - u0) / n; for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) { const c = u0 + step * (i + 0.5); out.push([c - 0.55, c + 0.55, gh + f * uh + 0.8, gh + f * uh + 2.6]); } return out; };
  const nFront = Math.max(1, Math.round((2 * hx - 1) / 2.6));
  const frontHoles = [SF, ...upWins(-hx + 0.6, hx - 0.6, nFront)];
  const cornerW = sp.corner ? (sp.corner === 'L' ? WL : WR) : null;
  const sideShop = sp.corner ? [[-hz + 0.9, Math.min(bz - 0.6, -hz + 0.9 + (sp.sideShopLen || 5)), 0.55, gh - 0.95]] : [];
  const nSide = Math.max(1, Math.round((2 * hz - 1.5) / 3));
  const sideHoles = sp.corner ? [...sideShop, ...upWins(-hz + 0.8, hz - 0.8, nSide)] : [];
  // ---------------------------------------------------------------- exterior
  k.room(-1);
  // ground storey facade
  const ground = (W, hs) => { k.tex(fc.key, fc.col, fc.rough ?? 0.9, fc.metal ?? 0); outerFace(k, W, S.baseY, gh + 0.05, hs.filter(h => h[2] < gh)); };
  const uppers = (W, hs) => { if (!floors) return; k.tex(fc.upKey || fc.key, fc.upCol ?? fc.col, 0.9); outerFace(k, W, gh + 0.05, ROOFY, hs.filter(h => h[2] >= gh)); };
  ground(WF, frontHoles); uppers(WF, frontHoles);
  if (cornerW) { ground(cornerW, sideHoles); uppers(cornerW, sideHoles); }
  const plainL = cornerW === WL ? null : WL, plainR = cornerW === WR ? null : WR;
  k.tex(fc.upKey || fc.key, fc.sideCol ?? fc.upCol ?? fc.col, 0.95);
  for (const W of [WB, plainL, plainR]) if (W) outerFace(k, W, S.baseY, ROOFY + 0.9, []);
  k.tex('gravel_roof', 0x55565a, 1.0); k.floor(-hx, -hz, hx, hz, ROOFY, 3);
  k.c(fc.trim, 0.6); k.box(-hx, ROOFY, hz - 0.25, hx, ROOFY + 0.9, hz); k.box(-hx, ROOFY, -hz, -hx + 0.25, ROOFY + 0.9, hz); k.box(hx - 0.25, ROOFY, -hz, hx, ROOFY + 0.9, hz);
  // cornice + band between the shop and the upper floors
  k.c(fc.trim, 0.55);
  k.box(-hx - 0.35, ROOFY - 0.1, -hz - 0.4, hx + (sp.corner === 'R' ? 0.35 : 0), ROOFY + 0.35, -hz);
  if (sp.corner === 'L') k.box(-hx - 0.4, ROOFY - 0.1, -hz, -hx, ROOFY + 0.35, hz); if (sp.corner === 'R') k.box(hx, ROOFY - 0.1, -hz, hx + 0.4, ROOFY + 0.35, hz);
  for (let x = -hx + 0.25; x < hx; x += 0.6) k.box(x - 0.05, ROOFY - 0.35, -hz - 0.3, x + 0.05, ROOFY - 0.1, -hz);
  k.box(-hx - 0.15, gh - 0.05, -hz - 0.25, hx + (sp.corner === 'R' ? 0.15 : 0), gh + 0.2, -hz);
  // upper windows
  for (const h of frontHoles.slice(1)) { k.c(fc.trim, 0.6); reveal(k, WF, h); windowUnit(k, WF, h, { frame: fc.trim, trim: fc.trim, rows: 2, trimW: 0.11 }); }
  if (cornerW) for (const h of sideHoles.slice(sideShop.length)) { k.c(fc.trim, 0.6); reveal(k, cornerW, h); windowUnit(k, cornerW, h, { frame: fc.trim, trim: fc.trim, rows: 2, trimW: 0.11 }); }
  // storefront: bulkhead, mullions, transom, sign band, glass
  storefront(k, WF, SF, sp);
  if (cornerW) for (const h of sideShop) storefront(k, cornerW, h, { ...sp, door: null, noBulk: false });
  // sign band above the storefront
  if (sp.sign) k.signZ((sp.sf[0] + sp.sf[1]) / 2, gh - 0.5, -hz - 0.07, Math.min(sp.sf[1] - sp.sf[0] - 0.4, sp.signW || 99), 0.7, sp.sign, sp.signBucket || 'sign');
  if (sp.sign && cornerW && sideShop.length) { const h = sideShop[0], x = cornerW === WL ? -hx - 0.07 : hx + 0.07; k.signX(x, gh - 0.5, (h[0] + h[1]) / 2, h[1] - h[0] - 0.2, 0.7, sp.sign, sp.signBucket || 'sign', cornerW === WL ? -1 : 1); }
  if (sp.awning) awning(k, sp.sf[0] - 0.1, sp.sf[1] + 0.1, -hz, gh - 1.0, sp.awning);
  if (sp.blade) blade(k, sp.corner === 'L' ? -hx + 0.4 : hx - 0.4, -hz, gh + 1.6, sp.blade, fc.trim);
  // ---------------------------------------------------------------- interior shell
  k.room(shop);
  const fl = sp.floor || { key: 'wood_floor', col: null, rough: 0.6 };
  if (fl.key) k.tex(fl.key, fl.col, fl.rough ?? 0.7, 0, fl.scale ?? 1); else k.c(fl.col, fl.rough ?? 0.5, 0, fl.pat || 0, fl.patS || 1);
  k.floor(-XI, -ZI, XI, bz, 0.002, 0.5);
  const cl = sp.ceil || { col: 0xe8e2d6 };
  if (cl.key) k.tex(cl.key, cl.col, 0.95); else k.c(cl.col, 0.9, 0, cl.pat || 0, cl.patS || 1);
  k.floor(-XI, -ZI, XI, bz, gh - 0.02, 0.6, true);
  const walls = (v0, v1) => {
    innerFace(k, WF, -XI, XI, v0, v1, frontHoles, 0.5);
    innerFace(k, WL, -ZI, bz, v0, v1, cornerW === WL ? sideHoles : [], 0.5);
    innerFace(k, WR, -ZI, bz, v0, v1, cornerW === WR ? sideHoles : [], 0.5);
    k.wallZ(bz, -XI, XI, v0, v1, -1, sp.backDoor ? [[sp.backDoor[0], sp.backDoor[1], 0, 2.2]] : [], 0.5);
  };
  const wl = sp.wallLow || { col: 0xd8d2c4 }, wu = sp.wallUp || { col: 0xe8e2d6 };
  const setW = w => (w.key ? k.tex(w.key, w.col, w.rough ?? 0.95, 0, w.scale ?? 1) : k.c(w.col, w.rough ?? 0.9, 0, w.pat || 0, w.patS || 1));
  setW(wl); walls(0, sp.wainscot ?? 1.1);
  setW(wu); walls(sp.wainscot ?? 1.1, gh - 0.02);
  // reveals of the storefront opening (inside)
  k.c(sp.frameCol ?? 0x1d1f23, 0.4, 0.4); reveal(k, WF, SF, { bottom: false });
  if (cornerW) for (const h of sideShop) { k.c(sp.frameCol ?? 0x1d1f23, 0.4, 0.4); reveal(k, cornerW, h); }
  // back-of-house door (closed) + kick plate
  if (sp.backDoor) {
    const [b0, b1] = sp.backDoor;
    k.c(0xb9bec4, 0.3, 1); k.box(b0, 0, bz - 0.04, b1, 2.15, bz); k.c(0x6f757c, 0.4, 1); k.box(b0 + 0.05, 0.1, bz - 0.05, b1 - 0.05, 0.4, bz - 0.04);
    k.in('glass', () => k.quad([b1 - 0.25, 1.5, bz - 0.045], [b0 + 0.25, 1.5, bz - 0.045], [b0 + 0.25, 1.9, bz - 0.045], [b1 - 0.25, 1.9, bz - 0.045]));
  }
  // baseboard
  k.c(sp.baseCol ?? 0x2b2b2e, 0.6);
  k.box(-XI, 0, -ZI, -XI + 0.02, 0.12, bz); k.box(XI - 0.02, 0, -ZI, XI, 0.12, bz); k.box(-XI, 0, bz - 0.02, XI, 0.12, bz);
  // window sky light
  for (let x = sp.sf[0] + 1; x < sp.sf[1]; x += 2.5) k.win(x, 1.6, -ZI, 0, 1, 1.1, 8);
  if (cornerW) for (const h of sideShop) k.win(cornerW === WL ? -XI : XI, 1.6, (h[0] + h[1]) / 2, cornerW === WL ? 1 : -1, 0, 1.1, 8);
  // ---------------------------------------------------------------- upper floors (dressed, closed)
  if (floors) {
    k.room(upper);
    k.tex('wood_floor', null, 0.6); for (let f = 0; f < floors; f++) k.floor(-XI, -ZI, XI, ZI, gh + f * uh + 0.02, 1.0);
    for (let f = 0; f < floors; f++) {
      const y0 = gh + f * uh, y1 = y0 + uh - 0.25;
      k.c(0xe9e3d6, 0.9); k.floor(-XI, -ZI, XI, ZI, y1, 1.2, true);
      k.tex('painted_plaster', [0xe3cfae, 0xd6e0d9, 0xe8d6d0][f % 3], 1.0);
      innerFace(k, WF, -XI, XI, y0, y1, frontHoles, 1); innerFace(k, WB, -XI, XI, y0, y1, [], 1);
      innerFace(k, WL, -ZI, ZI, y0, y1, cornerW === WL ? sideHoles : [], 1); innerFace(k, WR, -ZI, ZI, y0, y1, cornerW === WR ? sideHoles : [], 1);
      for (let x = -hx + 2; x < hx - 1; x += 3.5) k.at(x, y0, -hz + 3, 0, () => F.ceilingDisc(k, { ceil: uh - 0.25, I: 1.0, col: [1, 0.78, 0.52] }));
      for (const h of frontHoles.slice(1)) if (h[2] >= y0 && h[2] < y1) k.at((h[0] + h[1]) / 2, y0, -ZI + 0.1, Math.PI, () => F.curtain(k, { w: 1.3, y0: 0.3, y1: 2.5, col: [0xe8dcc0, 0xc9d6cf, 0xe0c4c0][f % 3], folds: 6 }));
      if (f === 0) { k.at(-hx * 0.4, y0, -hz + 3.2, 0.3, () => F.sofa(k, { col: 0x7a4a5a })); k.at(hx * 0.5, y0, -hz + 2.2, 0, () => F.plant(k, { h: 1.4, seed: 8, kind: 'palm' })); }
    }
    k.c(0xe3dccf, 0.9); for (let f = 1; f < floors; f++) k.floor(-XI, -ZI, XI, ZI, gh + f * uh - 0.25, 1.2, true);
  }
  // door leaf (group 'sdoor'): glass swing door hinged at door[1]
  const [d0, d1] = sp.door;
  k.group('sdoor'); k.room(-1);
  const z = -hz + 0.1;
  k.c(sp.frameCol ?? 0x1d1f23, 0.35, 0.5);
  k.box(d0 + 0.03, 0, z - 0.03, d1 - 0.03, 0.12, z + 0.03); k.box(d0 + 0.03, 2.3, z - 0.03, d1 - 0.03, 2.4, z + 0.03);
  k.box(d0 + 0.03, 0, z - 0.03, d0 + 0.1, 2.4, z + 0.03); k.box(d1 - 0.1, 0, z - 0.03, d1 - 0.03, 2.4, z + 0.03);
  k.c(0xd0d4d8, 0.2, 1); k.box(d0 + 0.14, 0.9, z - 0.08, d0 + 0.17, 1.4, z - 0.05);
  k.in('glass', () => k.quad([d0 + 0.1, 0.12, z], [d1 - 0.1, 0.12, z], [d1 - 0.1, 2.3, z], [d0 + 0.1, 2.3, z]));
  if (sp.doorSign) k.sign([d0 + 0.25, 1.55, z - 0.035], [d1 - 0.25, 1.55, z - 0.035], [d1 - 0.25, 1.85, z - 0.035], [d0 + 0.25, 1.85, z - 0.035], sp.doorSign, 'sign');
  k.group('');
  return { room: shop, upper, XI, ZI, bz, WF, WL, WR, WB, frontHoles, sideHoles, doorPivot: [d1 - 0.05, z] };
}

// glazed storefront in an opening h = [u0, u1, v0, v1] of wall W, with bulkhead, mullions, transom and glass
function storefront(k, W, h, sp) {
  const [u0, u1, v0, v1] = h, fr = sp.frameCol ?? 0x1d1f23;
  const out = W.out, dIn = Math.sign(W.inn - W.out), gw = out + dIn * 0.08;
  const bulk = sp.noBulk ? 0 : 0.5, transom = v1 - 0.5;
  const door = sp.door && W.axis === 'z' ? sp.door : null;
  k.c(fr, 0.35, 0.5);
  // outer frame
  wbox(k, W, u0, u0 + 0.1, v0, v1, out, out + dIn * 0.14); wbox(k, W, u1 - 0.1, u1, v0, v1, out, out + dIn * 0.14);
  wbox(k, W, u0, u1, v1 - 0.1, v1, out, out + dIn * 0.14);
  // bulkhead (tile/panel) except at the door
  const segs = door ? [[u0 + 0.1, door[0]], [door[1], u1 - 0.1]] : [[u0 + 0.1, u1 - 0.1]];
  for (const [a, b] of segs) {
    if (b - a < 0.05) continue;
    if (bulk) { k.c(sp.bulkCol ?? 0x2d3a3a, 0.5, 0, PAT.TILE, 2.5); wbox(k, W, a, b, v0, v0 + bulk, out - dIn * 0.02, out + dIn * 0.2); }
    k.c(fr, 0.35, 0.5); wbox(k, W, a, b, v0 + bulk, v0 + bulk + 0.06, out, out + dIn * 0.14);
    const n = Math.max(1, Math.round((b - a) / 1.5)), step = (b - a) / n;
    for (let i = 1; i < n; i++) wbox(k, W, a + i * step - 0.035, a + i * step + 0.035, v0 + bulk, transom, out, out + dIn * 0.12);
    k.bucket('glass');
    const P = (u, v) => (W.axis === 'z' ? [u, v, gw] : [gw, v, u]);
    k.quad(P(a, v0 + bulk + 0.06), P(b, v0 + bulk + 0.06), P(b, transom), P(a, transom));
    k.bucket('main');
  }
  if (door) { k.c(fr, 0.35, 0.5); wbox(k, W, door[0] - 0.08, door[0], v0, transom, out, out + dIn * 0.14); wbox(k, W, door[1], door[1] + 0.08, v0, transom, out, out + dIn * 0.14); }
  // transom bar + transom glass (full width)
  k.c(fr, 0.35, 0.5); wbox(k, W, u0, u1, transom - 0.05, transom + 0.05, out, out + dIn * 0.14);
  k.bucket('glass'); const P = (u, v) => (W.axis === 'z' ? [u, v, gw] : [gw, v, u]); k.quad(P(u0 + 0.1, transom + 0.05), P(u1 - 0.1, transom + 0.05), P(u1 - 0.1, v1 - 0.1), P(u0 + 0.1, v1 - 0.1)); k.bucket('main');
}
// striped canvas awning sloping out from the facade (front wall at z = zf)
function awning(k, x0, x1, zf, y, o) {
  const d = o.depth ?? 1.4, drop = o.drop ?? 0.55, stripes = Math.max(1, Math.round((x1 - x0) / 0.35));
  const w = (x1 - x0) / stripes;
  for (let i = 0; i < stripes; i++) {
    const a = x0 + i * w, b = a + w;
    k.tex('fabric', i % 2 && o.stripe != null ? o.stripe : o.col, 0.95, 0, 1.4);
    k.quad([b, y + 0.9, zf], [a, y + 0.9, zf], [a, y + 0.9 - drop, zf - d], [b, y + 0.9 - drop, zf - d]);
    k.quad([a, y + 0.9 - drop, zf - d], [b, y + 0.9 - drop, zf - d], [b, y + 0.9 - drop - 0.28, zf - d - 0.02], [a, y + 0.9 - drop - 0.28, zf - d - 0.02]);
    // underside (dark)
    k.c(0x2a2a2a, 0.9); k.quad([a, y + 0.9, zf], [b, y + 0.9, zf], [b, y + 0.9 - drop, zf - d], [a, y + 0.9 - drop, zf - d]);
  }
  k.tex('fabric', o.col, 0.95, 0, 1.4);
  k.quad([x0, y + 0.9, zf], [x0, y + 0.9 - drop, zf - d], [x0, y + 0.9 - drop - 0.28, zf - d - 0.02], [x0, y + 0.9 - drop - 0.28, zf]);
  k.quad([x1, y + 0.9 - drop, zf - d], [x1, y + 0.9, zf], [x1, y + 0.9 - drop - 0.28, zf], [x1, y + 0.9 - drop - 0.28, zf - d - 0.02]);
  k.c(0x2a2a2a, 0.4, 0.6); k.tube([x0, y + 0.9 - drop, zf - d], [x1, y + 0.9 - drop, zf - d], 0.02, 6);
}
function blade(k, x, zf, y, region, trim) {
  k.c(trim, 0.4, 0.4); k.box(x - 0.06, y - 1.3, zf - 1.35, x + 0.06, y + 1.3, zf - 0.15);
  k.tube([x, y + 1.35, zf], [x, y + 1.35, zf - 1.25], 0.025, 6);
  k.signX(x + 0.065, y, zf - 0.75, 1.1, 2.5, region, 'sign', 1);
  k.signX(x - 0.065, y, zf - 0.75, 1.1, 2.5, region, 'sign', -1);
}
