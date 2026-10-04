// Far LOD: cheap massing per building, drawn with the procedural facade shader. Also emits the rooftop clutter
// (tanks, bulkheads, chimneys, pagoda roofs, antennas) with id -1, so it stays visible under the near LOD.
import { Frame } from './emit.js';
import { M } from './material.js';
import { L, TILE } from './layers.js';
import { S, GT } from './plan.js';
import { mulberry32 } from '../geo.js';

// procedural facade rect in frame F: u in [u0,u1], v in [v0,v1] (v relative to y0), plane d
export function procRect(F, u0, u1, v0, v1, d, mode, cw, nb, uOff = 0) {
  const B = F.b;
  B.sk = mode; B.sz = cw; B.sw = nb;
  const nx = F.nx, nz = F.nz;
  const a = B.v(F.wx(u0, d), F.oy + v0, F.wz(u0, d), nx, 0, nz, u0 + uOff, v0);
  const b = B.v(F.wx(u1, d), F.oy + v0, F.wz(u1, d), nx, 0, nz, u1 + uOff, v0);
  const c = B.v(F.wx(u1, d), F.oy + v1, F.wz(u1, d), nx, 0, nz, u1 + uOff, v1);
  const e = B.v(F.wx(u0, d), F.oy + v1, F.wz(u0, d), nx, 0, nz, u0 + uOff, v1);
  B.quad(a, b, c, e);
  B.sz = 0; B.sw = 0;
}
// procedural facade quad between two local points (a facet), u measured along the facet from 0
function procFacet(F, ua, da, ub, db, v0, v1, mode, cw, nb) {
  const B = F.b;
  const ex = ub - ua, ed = db - da, len = Math.hypot(ex, ed) || 1;
  // facet outward normal in local (u, d): (ed, -ex)/len rotated so it points outward (+d side)
  let nu = ed / len, nd = -ex / len; if (nd < 0) { nu = -nu; nd = -nd; }
  const wx = F.tx * nu + F.nx * nd, wz = F.tz * nu + F.nz * nd;
  B.sk = mode; B.sz = cw; B.sw = nb;
  const p = (u, d, v, uu) => B.v(F.wx(u, d), F.oy + v, F.wz(u, d), wx, 0, wz, uu, v);
  const a = p(ua, da, v0, 0), b = p(ub, db, v0, len), c = p(ub, db, v1, len), e = p(ua, da, v1, 0);
  B.quad(a, b, c, e);
  B.sz = 0; B.sw = 0;
}

// frames of a building footprint: front (u 0..W at local +X -> -X), sides and back
export function frames(sp, F, which, inset = 0) {
  const { c, s, x, z, hx } = sp;
  const zf = -sp.hz + sp.setback + inset, zb = -sp.hz + sp.setback + sp.depth - inset, hxi = hx - inset;
  const W = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  let o;
  switch (which) {
    case 0: o = W(hxi, zf); return F.set(o[0], sp.y0, o[1], -c, s);      // front, t = local -X
    case 1: o = W(hxi, zb); return F.set(o[0], sp.y0, o[1], -s, -c);     // local +X side, t = local -Z
    case 2: o = W(-hxi, zb); return F.set(o[0], sp.y0, o[1], c, -s);     // back, t = local +X
    default: o = W(-hxi, zf); return F.set(o[0], sp.y0, o[1], s, c);     // local -X side, t = local +Z
  }
}

const TMP = new Frame(null);

export function emitFar(sp, B) {
  const F = TMP; F.b = B;
  B.sid = sp.id; B.sc[3] = 255;
  const rnd = mulberry32(sp.seedInt);
  const vb = sp.yb - sp.y0, W = sp.W, D = sp.depth;
  const tower = sp.style === S.TOWER_GLASS || sp.style === S.TOWER_STONE;
  const big = tower || sp.style === S.OFFICE;
  const mainMode = sp.curtain ? M.CURTAIN : M.PROC;
  if (tower && sp.topH > 50) return emitTower(sp, B, F, rnd);
  const top = sp.topH;
  // ---------------------------------------------------------------- walls
  frames(sp, F, 0); procRect(F, 0, W, vb, top, 0, mainMode, sp.cw, sp.nb);
  frames(sp, F, 1); procRect(F, 0, D, vb, top, 0, big || sp.exposeL ? M.SIDEX : M.SIDE, sp.cwS, sp.nbS);
  frames(sp, F, 2); procRect(F, 0, W, vb, top, 0, big ? M.SIDEX : M.BACK, sp.cw, sp.nb);
  frames(sp, F, 3); procRect(F, 0, D, vb, top, 0, big || sp.exposeR ? M.SIDEX : M.SIDE, sp.cwS, sp.nbS);
  // ---------------------------------------------------------------- roof
  frames(sp, F, 0);
  const rt = 0.85 + rnd() * 0.3;
  F.mat(L.GRAVEL, 0.46 * rt, 0.45 * rt, 0.44 * rt);
  F.q([0, top, 0], [W, top, 0], [W, top, -D], [0, top, -D]);
  // ---------------------------------------------------------------- front features
  const fl = sp.floors, gH = sp.groundH, fH = sp.floorH;
  const trim = sp.trimC;
  if (sp.style === S.VICTORIAN || sp.style === S.EDWARDIAN || ((sp.style === S.APARTMENT || sp.style === S.COMMERCIAL) && sp.bayCols)) {
    const cells = [];
    if (sp.style === S.VICTORIAN) cells.push(sp.gCell);
    else if (sp.style === S.EDWARDIAN) { if (sp.nb >= 3) cells.push(0, sp.nb - 1); else cells.push(sp.gCell); }
    else for (let i = 0; i < sp.nb; i += 2) cells.push(i);
    const v0 = gH + (sp.style === S.VICTORIAN || sp.style === S.EDWARDIAN ? 0.1 : fH * 0.02), v1 = gH + fl * fH - 0.15;
    for (const ci of cells) {
      const ua = sp.margin + ci * sp.cw + 0.12, ub = sp.margin + (ci + 1) * sp.cw - 0.12;
      const dep = sp.style === S.VICTORIAN ? 0.85 : 0.7;
      const inset = sp.roundBay || sp.style !== S.EDWARDIAN ? dep : dep * 0.5;
      bay(F, B, sp, ua, ub, dep, inset, v0, v1, trim);
    }
  }
  // cornice
  const hasCornice = sp.style !== S.WAREHOUSE && sp.style !== S.STUCCO && !sp.curtain;
  if (hasCornice) {
    F.col(trim, 0, L.TRIM);
    const cp = sp.style === S.VICTORIAN ? 0.55 : sp.style === S.LOFT ? 0.45 : 0.4;
    F.box(-0.05, W + 0.05, top - 0.55, top, 0, cp, 1 | 4 | 8 | 16 | 32);
  } else if (sp.style === S.STUCCO && sp.tileRoof) {
    F.mat(L.CLAYTILE, 1, 1, 1);
    F.q([0, top - 0.9, 0.55], [W, top - 0.9, 0.55], [W, top - 0.2, -0.1], [0, top - 0.2, -0.1]);
  }
  // gable (Queen Anne)
  if (sp.gable) {
    const gh = Math.min(3.2, W * 0.36);
    F.col(sp.wallC, 0, L.SHINGLE);
    F.tri([0, top, 0], [W, top, 0], [W / 2, top + gh, 0]);
    F.mat(L.ROOF_SHINGLE, 0.5, 0.48, 0.5);
    const back = -Math.min(D * 0.5, 7);
    F.q([W / 2, top + gh, 0], [W / 2, top + gh, back], [-0.3, top - 0.2, back], [-0.3, top - 0.2, 0.3]);
    F.q([W + 0.3, top - 0.2, 0.3], [W + 0.3, top - 0.2, back], [W / 2, top + gh, back], [W / 2, top + gh, 0]);
    F.col(sp.wallC, 0, L.SHINGLE);
    F.tri([0, top, back], [W / 2, top + gh, back], [W, top, back]);
  }
  if (sp.turret) turret(F, sp, rnd, true);
  roofClutter(sp, B, F, rnd);
}

function bay(F, B, sp, ua, ub, dep, inset, v0, v1, trim) {
  // slanted (inset == dep) or squared (inset small) bay window footprint in local (u, d)
  const a = [ua, 0], b = [ua + inset, dep], c = [ub - inset, dep], d = [ub, 0];
  procFacet(F, a[0], a[1], b[0], b[1], v0, v1, M.PROC, Math.hypot(inset, dep), -1);
  procFacet(F, b[0], b[1], c[0], c[1], v0, v1, M.PROC, c[0] - b[0], -1);
  procFacet(F, c[0], c[1], d[0], d[1], v0, v1, M.PROC, Math.hypot(inset, dep), -1);
  F.col(trim, 0, L.TRIM);
  // top and bottom caps
  const top = [[a[0] - 0.1, 0], [b[0] - 0.05, b[1] + 0.12], [c[0] + 0.05, c[1] + 0.12], [d[0] + 0.1, 0]];
  F.q([top[0][0], v1, 0], [top[3][0], v1, 0], [top[2][0], v1, top[2][1]], [top[1][0], v1, top[1][1]]);
  F.q([top[0][0], v1 + 0.35, 0], [top[1][0], v1 + 0.35, top[1][1]], [top[2][0], v1 + 0.35, top[2][1]], [top[3][0], v1 + 0.35, 0]);
  for (let i = 0; i < 3; i++) { const p = top[i], q = top[i + 1]; F.q([p[0], v1, p[1]], [q[0], v1, q[1]], [q[0], v1 + 0.35, q[1]], [p[0], v1 + 0.35, p[1]]); }
  F.q([a[0], v0, 0], [d[0], v0, 0], [c[0], v0, c[1]], [b[0], v0, b[1]]);
}

export function turret(F, sp, rnd, far) {
  // round tower on the exposed corner, from the first floor up past the roofline, with a conical roof
  const W = sp.W, top = sp.topH;
  const onLeft = sp.exposeL || !sp.exposeR;
  const r = Math.min(1.7, W * 0.2);
  const cu = onLeft ? r * 0.7 : W - r * 0.7, cd = r * 0.55;
  const n = far ? 8 : 16;
  const v0 = sp.groundH + 0.1, v1 = top + 1.2;
  F.col(sp.wallC, 0, L.SIDING);
  const pts = [];
  for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; pts.push([cu + Math.cos(a) * r, cd + Math.sin(a) * r]); }
  F.prism(pts, v0, v1, false, true);
  // conical roof
  F.mat(L.ROOF_SHINGLE, 0.42, 0.4, 0.44);
  const apex = [cu, v1 + r * 2.4, cd];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const pe = [cu + (p[0] - cu) * 1.12, v1, cd + (p[1] - cd) * 1.12], qe = [cu + (q[0] - cu) * 1.12, v1, cd + (q[1] - cd) * 1.12];
    F.tri(pe, qe, apex);
  }
  F.mat(L.METAL, 0.5, 0.42, 0.25);
  F.box(cu - 0.04, cu + 0.04, apex[1], apex[1] + 0.9, cd - 0.04, cd + 0.04, 63 - 32);
}

// ------------------------------------------------------------------ towers
function emitTower(sp, B, F, rnd) {
  const W = sp.W, D = sp.depth, vb = sp.yb - sp.y0, top = sp.topH;
  const mode = sp.curtain ? M.CURTAIN : M.PROC;
  const tiers = [];
  const i1 = Math.min(W, D) * (0.1 + rnd() * 0.1);
  const split = 0.5 + rnd() * 0.25;
  if (top > 70) {
    tiers.push({ inset: 0, v1: sp.groundH + Math.round((top * split - sp.groundH) / sp.floorH) * sp.floorH });
    if (top > 120 && rnd() < 0.6) {
      tiers.push({ inset: i1, v1: sp.groundH + Math.round((top * 0.85 - sp.groundH) / sp.floorH) * sp.floorH });
      tiers.push({ inset: i1 * 1.8, v1: top });
    } else tiers.push({ inset: i1, v1: top });
  } else tiers.push({ inset: 0, v1: top });
  sp.tiers = tiers;
  let v0 = vb;
  for (const T of tiers) {
    const w = W - 2 * T.inset, d = D - 2 * T.inset;
    const nbF = Math.max(1, Math.round((w - 2 * sp.margin) / sp.cw)), cwF = (w - 2 * sp.margin) / nbF;
    const nbS = Math.max(1, Math.round((d - 2 * sp.margin) / sp.cw)), cwS = (d - 2 * sp.margin) / nbS;
    for (let k = 0; k < 4; k++) {
      frames(sp, F, k, T.inset);
      const len = k % 2 === 0 ? w : d;
      procRect(F, 0, len, v0, T.v1, 0, k === 0 || sp.curtain ? mode : M.SIDEX, k % 2 === 0 ? cwF : cwS, k % 2 === 0 ? nbF : nbS);
    }
    frames(sp, F, 0, T.inset);
    F.mat(L.GRAVEL, 0.5, 0.5, 0.5);
    F.q([0, T.v1, 0], [w, T.v1, 0], [w, T.v1, -d], [0, T.v1, -d]);
    // setback ledge trim
    F.col(sp.trimC, 0, sp.curtain ? L.METAL : L.STONE);
    F.box(-0.1, w + 0.1, T.v1 - 0.6, T.v1 + 0.5, 0, 0.3, 1 | 4 | 8 | 16 | 32);
    v0 = T.v1 - 0.01;
  }
  // crown
  const T = tiers[tiers.length - 1];
  const w = W - 2 * T.inset, d = D - 2 * T.inset;
  frames(sp, F, 0, T.inset);
  B.sid = -1;
  if (sp.curtain) {
    const r = rnd();
    if (r < 0.4) { // glass crown fin / sloped top
      F.col(sp.glassC, 0, L.METAL);
      F.q([0, top, 0], [w, top, 0], [w, top + w * 0.35, -d * 0.5], [0, top + w * 0.35, -d * 0.5]);
      F.q([0, top + w * 0.35, -d * 0.5], [w, top + w * 0.35, -d * 0.5], [w, top, -d], [0, top, -d]);
      F.tri([0, top, 0], [0, top + w * 0.35, -d * 0.5], [0, top, -d]);
      F.tri([w, top, -d], [w, top + w * 0.35, -d * 0.5], [w, top, 0]);
    } else {
      F.mat(L.METAL, 0.55, 0.57, 0.6);
      F.box(w * 0.2, w * 0.8, top, top + 5, -d * 0.8, -d * 0.2);
    }
  } else {
    // stepped stone crown
    F.col(sp.wallC, 0, sp.wallLayer);
    F.box(w * 0.12, w * 0.88, top, top + 4, -d * 0.88, -d * 0.12);
    F.box(w * 0.25, w * 0.75, top + 4, top + 7.5, -d * 0.75, -d * 0.25);
    if (rnd() < 0.5) { F.mat(L.METAL, 0.3, 0.4, 0.35); const cx = w / 2, cz = -d / 2, r = Math.min(w, d) * 0.25; F.tri([cx - r, top + 7.5, cz + r], [cx + r, top + 7.5, cz + r], [cx, top + 7.5 + r * 1.4, cz]); F.tri([cx + r, top + 7.5, cz + r], [cx + r, top + 7.5, cz - r], [cx, top + 7.5 + r * 1.4, cz]); F.tri([cx + r, top + 7.5, cz - r], [cx - r, top + 7.5, cz - r], [cx, top + 7.5 + r * 1.4, cz]); F.tri([cx - r, top + 7.5, cz - r], [cx - r, top + 7.5, cz + r], [cx, top + 7.5 + r * 1.4, cz]); }
  }
  // antenna + aviation lights
  if (top > 90) {
    F.mat(L.METAL, 0.6, 0.6, 0.62);
    const ah = 8 + rnd() * 14;
    F.box(w / 2 - 0.2, w / 2 + 0.2, top + 5, top + 5 + ah, -d / 2 - 0.2, -d / 2 + 0.2, 63 - 32);
    sp.beacons = [[w / 2, top + 5 + ah, -d / 2, T.inset]];
  }
  sp.beaconsCorner = [[0, top, 0], [w, top, 0], [w, top, -d], [0, top, -d]].map(p => [...p, T.inset]);
  B.sid = sp.id;
}

// ------------------------------------------------------------------ rooftop clutter (id -1, never hidden)
function roofClutter(sp, B, F, rnd) {
  frames(sp, F, 0);
  const W = sp.W, D = sp.depth, top = sp.topH;
  B.sid = -1;
  const st = sp.style;
  if (st === S.VICTORIAN || st === S.EDWARDIAN) {
    // brick chimneys on the party wall
    const nC = rnd() < 0.6 ? 1 : 2;
    F.mat(L.BRICK, 1, 1, 1);
    for (let i = 0; i < nC; i++) {
      const u = rnd() < 0.5 ? 0.2 : W - 1.0, dd = -D * (0.3 + 0.4 * rnd());
      F.box(u, u + 0.75, top - 0.5, top + 1.3 + rnd() * 0.6, dd - 0.45, dd + 0.45, 63 - 32);
    }
  } else if (st === S.STUCCO) {
    if (rnd() < 0.4) { F.mat(L.METAL, 0.6, 0.62, 0.64); const u = W * (0.3 + rnd() * 0.4), dd = -D * (0.4 + rnd() * 0.3); F.box(u, u + 0.9, top, top + 0.25, dd, dd + 0.9, 63 - 32); }
  } else if (st === S.WAREHOUSE) {
    // sawtooth / skylight rows
    if (rnd() < 0.55) {
      const n = Math.max(2, Math.floor(D / 6));
      for (let i = 0; i < n; i++) {
        const d0 = -D + i * (D / n) + 0.3, d1 = d0 + D / n - 0.6;
        F.mat(L.CORRUGATED, 0.55, 0.57, 0.58);
        F.q([0.3, top, d0], [W - 0.3, top, d0], [W - 0.3, top + 2.2, d1], [0.3, top + 2.2, d1]);
        F.col([0.4, 0.5, 0.55], 0, L.METAL);
        F.q([W - 0.3, top, d1], [0.3, top, d1], [0.3, top + 2.2, d1], [W - 0.3, top + 2.2, d1]);
        F.mat(L.CORRUGATED, 0.55, 0.57, 0.58);
        F.tri([0.3, top, d0], [0.3, top + 2.2, d1], [0.3, top, d1]);
        F.tri([W - 0.3, top, d1], [W - 0.3, top + 2.2, d1], [W - 0.3, top, d0]);
      }
    }
    acUnits(F, rnd, W, D, top, 1 + Math.floor(rnd() * 3));
  } else if (st === S.CHINATOWN && sp.pagoda) {
    pagoda(F, sp, rnd, W, D, top);
  } else {
    // bulkhead, AC units, vents, sometimes a wooden water tank
    if (W > 8 && D > 10) {
      F.col(sp.wallC, 0, sp.wallLayer === L.BRICK || sp.wallLayer === L.BRICK_DARK ? sp.wallLayer : L.STUCCO);
      const u = W * (0.15 + rnd() * 0.5), dd = -D * (0.3 + rnd() * 0.4);
      F.box(u, u + 2.6, top, top + 2.7, dd, dd + 2.8, 63 - 32);
      F.mat(L.GRAVEL, 0.5, 0.5, 0.5); F.box(u - 0.1, u + 2.7, top + 2.7, top + 2.9, dd - 0.1, dd + 2.9, 63 - 32);
    }
    acUnits(F, rnd, W, D, top, 1 + Math.floor(rnd() * (W > 15 ? 4 : 2)));
    if ((st === S.LOFT || st === S.APARTMENT || st === S.COMMERCIAL || st === S.CHINATOWN) && W > 9 && rnd() < (st === S.COMMERCIAL ? 0.2 : 0.5)) waterTank(F, rnd, W * (0.3 + rnd() * 0.4), -D * (0.45 + rnd() * 0.25), top);
  }
  B.sid = sp.id;
}
function acUnits(F, rnd, W, D, top, n) {
  F.mat(L.METAL, 0.72, 0.73, 0.72);
  for (let i = 0; i < n; i++) {
    const u = 1 + rnd() * Math.max(0.1, W - 3), dd = -1.5 - rnd() * Math.max(0.1, D - 4);
    const w = 1.0 + rnd() * 0.8, h = 0.8 + rnd() * 0.6;
    F.box(u, u + w, top, top + h, dd, dd + 1.0, 63 - 32);
  }
}
function waterTank(F, rnd, u, d, top) {
  const r = 1.6, h = 3.2, legs = 2.6, n = 12;
  F.mat(L.WOOD, 0.9, 0.85, 0.8);
  const pts = [];
  for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; pts.push([u + Math.cos(a) * r, d + Math.sin(a) * r]); }
  F.prism(pts, top + legs, top + legs + h, false, true);
  F.mat(L.METAL, 0.3, 0.3, 0.32);
  const apex = [u, top + legs + h + 1.2, d];
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; F.tri([p[0] + (p[0] - u) * 0.08, top + legs + h, p[1] + (p[1] - d) * 0.08], [q[0] + (q[0] - u) * 0.08, top + legs + h, q[1] + (q[1] - d) * 0.08], apex); }
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) F.box(u + a * r * 0.6 - 0.1, u + a * r * 0.6 + 0.1, top, top + legs, d + b * r * 0.6 - 0.1, d + b * r * 0.6 + 0.1, 63 - 48);
}
function pagoda(F, sp, rnd, W, D, top) {
  // small pavilion with a hipped, up-turned tile roof on the front corner of the roof
  const s = Math.min(4.2, W * 0.45), u0 = rnd() < 0.5 ? 0.3 : W - s - 0.3, d1 = -0.4, d0 = d1 - s;
  const ph = 2.4;
  F.col(sp.trimC, 0, L.TRIM);
  for (const [pu, pd] of [[u0, d1], [u0 + s, d1], [u0 + s, d0], [u0, d0]]) F.box(pu - 0.12, pu + 0.12, top, top + ph, pd - 0.12, pd + 0.12, 63 - 48);
  const ov = 0.9, lift = 0.55, rh = 1.5;
  const cu = u0 + s / 2, cd = (d0 + d1) / 2;
  const c = [[u0 - ov, d1 + ov], [u0 + s + ov, d1 + ov], [u0 + s + ov, d0 - ov], [u0 - ov, d0 - ov]];
  const ridge = [[cu - s * 0.2, cd], [cu + s * 0.2, cd]];
  F.mat(L.CLAYTILE, 0.35, 0.8, 0.45);
  const y = top + ph, yc = y + lift; // corners turned up
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // four roof faces, each as two quads (corner up-turn) meeting at the eave midpoints
  const faces = [[c[0], c[1], ridge[1], ridge[0]], [c[1], c[2], ridge[1], ridge[1]], [c[2], c[3], ridge[0], ridge[1]], [c[3], c[0], ridge[0], ridge[0]]];
  for (const [a, b, rb, ra] of faces) {
    const m = mid(a, b);
    F.q([a[0], yc, a[1]], [m[0], y, m[1]], [rb[0], y + rh, rb[1]], [ra[0], y + rh, ra[1]]);
    F.q([m[0], y, m[1]], [b[0], yc, b[1]], [rb[0], y + rh, rb[1]], [rb[0], y + rh, rb[1]]);
  }
  F.col(sp.trimC, 0, L.TRIM);
  F.box(ridge[0][0] - 0.2, ridge[1][0] + 0.2, y + rh, y + rh + 0.25, cd - 0.15, cd + 0.15, 63 - 32);
}
