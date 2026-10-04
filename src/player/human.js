// HILLBOMB: procedural low-poly human (player on foot + pedestrians).
// One SkinnedMesh (one draw call) per human, 18 bones, procedural animation (no clips).
// LOCAL FRAME: +X right, +Y up, -Z forward. Feet at y = 0. See CONVENTIONS.md.
//
// Geometry is cached per variant (build | gender | hairStyle | outfit) and its position / normal /
// skinIndex / skinWeight attributes are SHARED between humans; each human only owns a baked
// per-face 'color' attribute (face colours are flat, lighting normals are smooth).
import * as THREE from 'three';
import { createRealHuman, realAvailable, setProcFactory } from '../game/peds/realhuman.js';

// --------------------------------------------------------------------------------------------
// constants
// --------------------------------------------------------------------------------------------
const REF_H = 1.78;                 // canonical rig height; a human of height h is the rig scaled by h / REF_H
const ANKLE_Y = 0.08;               // ankle joint height in rig units
const HIPS_Y = 0.95;                // hips bone rest height
const HIP_DY = -0.04;               // hip joint below the hips bone
const THIGH = 0.42, SHIN = 0.41;    // leg segment lengths
const UPPER_ARM = 0.29, FOREARM = 0.25;

/** Hip-bone height above the root in the 'drive' / 'sit' pose (metres, independent of the human's height).
 *  Place root at (seat point - HUMAN_SEAT_HIP_Y) where the seat point is where the pelvis centre should sit.
 *  In 'sit' this puts the feet flat on the ground at root level (bench seat surface ~0.44 m). */
export const HUMAN_SEAT_HIP_Y = 0.52;

// bone indices
const B = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  upperArm_L: 5, lowerArm_L: 6, hand_L: 7,
  upperArm_R: 8, lowerArm_R: 9, hand_R: 10,
  upperLeg_L: 11, lowerLeg_L: 12, foot_L: 13,
  upperLeg_R: 14, lowerLeg_R: 15, foot_R: 16,
  prop: 17,
};
const BONE_NAMES = Object.keys(B);
const NB = BONE_NAMES.length;

// colour regions (per-face ids; mapped to a per-human palette)
const R = {
  SKIN: 0, TORSO: 1, TORSO2: 2, SLEEVE_UP: 3, SLEEVE_LO: 4, CUFF: 5, PANTS: 6, PANTS_LO: 7, BELT: 8,
  SHOE: 9, SOLE: 10, HAIR: 11, EYE: 12, LIP: 13, ACCENT: 14, HAT: 15, PHONE: 16, SCREEN: 17,
  BROW: 18, TRIM: 19, SKIRT: 20, BRIM: 21,
};
const NREG = 22;

// --------------------------------------------------------------------------------------------
// small math helpers
// --------------------------------------------------------------------------------------------
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }

function hashSeed(seed) {
  if (typeof seed === 'number') return (Math.floor(seed * 2654435761) ^ 0x9e3779b9) >>> 0;
  let h = 2166136261 >>> 0; const s = String(seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickFrom = (r, arr) => arr[Math.floor(r * arr.length) % arr.length];
function pickWeighted(r, table) { // table: [[value, weight], ...]
  let sum = 0; for (const [, w] of table) sum += w;
  let x = r * sum;
  for (const [v, w] of table) { if ((x -= w) < 0) return v; }
  return table[table.length - 1][0];
}

// --------------------------------------------------------------------------------------------
// palettes (sRGB hex)
// --------------------------------------------------------------------------------------------
const PAL = {
  skin: [0xf3d2b8, 0xeac0a0, 0xe0ac86, 0xd39a6e, 0xc68642, 0xa86b45, 0x8d5524, 0x70442a, 0x5a3520, 0xf1c8a8, 0xd9a883],
  hair: [0x151312, 0x1f1712, 0x2b1d14, 0x3d2a1c, 0x5a3d25, 0x7a5532, 0xa67b45, 0xd2b06c, 0x8e8b88, 0xc9c6c1, 0x6b2c1a, 0x9a3d22],
  hairRare: [0x6a3fa0, 0x2f7fbf, 0xd6558c],
  hoodie: [0x8a8d91, 0x1e1f22, 0x23324d, 0x2f4a3a, 0x5c1f2a, 0xc8552a, 0xc9a13b, 0xd8d0bf, 0x4b5563, 0x7a2f8a],
  puffer: [0x1a1b1e, 0x4d5433, 0x1f2a44, 0xa3262a, 0xa9adb3, 0x9c7b52, 0x2d6a8a, 0xd9d4c7],
  vest: [0x1f2a44, 0x1a1b1e, 0x5f6368, 0x2f4a3a, 0x3b4252],
  vestShirt: [0x9fb8d8, 0xe9e9e6, 0xc9d6e6, 0x8fa4bf, 0xd8cfc0, 0x6f7f96],
  tee: [0xe8452c, 0xf2c14e, 0x3fa7d6, 0x59c3a0, 0xef7ca5, 0xf4f4f0, 0x7fbf3f, 0x2c2c30, 0x9b59b6, 0xff8a3d, 0x2e6fd8, 0xe9e2cf],
  print: [0xffffff, 0x1b1b1b, 0xd62d2d, 0xf2c14e, 0x2b59c3, 0xff6a00],
  suit: [0x2d3035, 0x1f2a44, 0x151618, 0x4f535a, 0x6b6f75, 0x3a3226],
  suitShirt: [0xf2f2ef, 0xdfe9f5, 0xf2f2ef, 0xe8e2d4],
  tie: [0x8a1c2b, 0x1d3f7a, 0x2a2a2a, 0x6c3a8c, 0x1f5f4a, 0xb8862b, 0xc0392b],
  dress: [0x8a2433, 0x2c5a7a, 0xd97a4a, 0x1d1d1f, 0x6b8e5a, 0xe6c35c, 0xc75b8a, 0xf0ece0, 0x3a3f8f],
  jeans: [0x2f4466, 0x3b5075, 0x243553, 0x4a6591, 0x1c1d21],
  pants: [0x222326, 0xa89470, 0x55585c, 0x7d6a4f, 0x3a4a3a, 0x6e6259],
  shorts: [0xb9a57e, 0x4a5f82, 0x5d6b45, 0x2a3552, 0xd2c6a8, 0x8a5a3a],
  shoe: [0xeeeeea, 0x1a1a1a, 0x4a2e1b, 0x7c8288, 0xb33a3a, 0xeeeeea, 0x2a3f6a, 0x1a1a1a],
  dressShoe: [0x141414, 0x2a1a10, 0x3a2416],
  sole: [0xf2f2f2, 0x202020, 0xc9a26b],
  belt: [0x1c1714, 0x3a2416, 0x5a3a22, 0x222222],
  cap: [0x1a1a1a, 0xf26b1c, 0x1d428a, 0xa3262a, 0x2f4a3a, 0xe9e2cf, 0x5f6368, 0xfdb927],
  tights: [0x1c1c1e, 0x3a2e2a],
};

// --------------------------------------------------------------------------------------------
// variant dimensions (canonical 1.78 m rig)
// --------------------------------------------------------------------------------------------
function makeDims(build, gender) {
  const f = gender === 'f';
  // (x1.06 / x1.18 over the first pass: real bodies + clothing read much fuller than the anatomical minimum; at street
  // distance thin limbs made everyone look like stick figures)
  const W = (build === 'slim' ? 0.92 : build === 'heavy' ? 1.12 : 1.0) * 1.06;   // torso width
  const L = (build === 'slim' ? 0.88 : build === 'heavy' ? 1.14 : 1.0) * 1.18;   // limb girth
  const belly = build === 'heavy' ? 1 : build === 'slim' ? -0.35 : 0;
  return {
    f, W, L, belly,
    shoulderX: (f ? 0.168 : 0.185) * (build === 'heavy' ? 1.06 : build === 'slim' ? 0.97 : 1),
    hipX: (f ? 0.097 : 0.092) * (build === 'heavy' ? 1.08 : 1),
    head: f ? 0.965 : 1,
  };
}

// --------------------------------------------------------------------------------------------
// geometry primitives. A "part" = { v: [x,y,z][], w: [[bone, weight], ...][], t: [a,b,c][], reg?: [region, shade][] }
// --------------------------------------------------------------------------------------------
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// signed power for superellipses
const spow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);

/**
 * Loft a tube through rings.
 * ring: { c:[x,y,z], rx, ry, ryb?, e? (superellipse exponent, 2 = ellipse), w: [[b,w]..] | (p)=>[[b,w]..] }
 * opts: { seg, ref:[x,y,z] (direction of the +ry axis, default front -Z), capStart, capEnd (bulge or false) }
 * frame per ring: t = axis tangent, side = cross(ref, t), n = cross(t, side); point = c + side*rx*cos + n*r*sin
 */
function tube(rings, o = {}) {
  const seg = o.seg || 8, ref = o.ref || [0, 0, -1];
  const v = [], w = [], t = [], q = [];
  const n = rings.length;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(n - 1, i + 1)].c;
    const tg = rings[i].t || vnorm(vsub(b, a));
    const side = vnorm(vcross(ref, tg));
    const nn = vcross(tg, side);
    frames.push([tg, side, nn]);
  }
  for (let i = 0; i < n; i++) {
    const r = rings[i], [, side, nn] = frames[i], e = 2 / (r.e || 2);
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * TAU + (o.phase || 0);
      const cs = spow(Math.cos(th), e), sn = spow(Math.sin(th), e);
      const ry = sn >= 0 ? r.ry : (r.ryb ?? r.ry);
      const p = [
        r.c[0] + side[0] * r.rx * cs + nn[0] * ry * sn,
        r.c[1] + side[1] * r.rx * cs + nn[1] * ry * sn,
        r.c[2] + side[2] * r.rx * cs + nn[2] * ry * sn,
      ];
      v.push(p); w.push(typeof r.w === 'function' ? r.w(p) : r.w);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      t.push([a, b, c], [b, d, c]);
      q.push([a, b, c, d], [a, b, c, d]);   // regions are evaluated at the quad centre (no zig-zag boundaries)
    }
  }
  const cap = (ri, bulge, dirSign) => {
    const r = rings[ri], [tg] = frames[ri];
    const tip = [r.c[0] + tg[0] * bulge * dirSign, r.c[1] + tg[1] * bulge * dirSign, r.c[2] + tg[2] * bulge * dirSign];
    const ti = v.length; v.push(tip); w.push(typeof r.w === 'function' ? r.w(tip) : r.w);
    const out = [tg[0] * dirSign, tg[1] * dirSign, tg[2] * dirSign];
    for (let j = 0; j < seg; j++) {
      const a = ri * seg + j, b = ri * seg + ((j + 1) % seg);
      const nrm = vcross(vsub(v[a], tip), vsub(v[b], tip));
      t.push(vdot(nrm, out) >= 0 ? [ti, a, b] : [ti, b, a]);
      q.push(null);
    }
  };
  if (o.capStart !== undefined && o.capStart !== false) cap(0, o.capStart, -1);
  if (o.capEnd !== undefined && o.capEnd !== false) cap(n - 1, o.capEnd, 1);
  return { v, w, t, q };
}

/**
 * Lat-long ellipsoid. deform(dir, p) may return a new position. Column 0 faces -Z (front).
 * Triangles are wound outward relative to the centre. Returns per-vertex unit dirs too.
 */
function ellipsoid(c, rx, ry, rz, lon, lat, weights, deform) {
  const v = [], w = [], t = [], dirs = [], q = [];
  const push = (dir) => {
    let p = [c[0] + dir[0] * rx, c[1] + dir[1] * ry, c[2] + dir[2] * rz];
    if (deform) p = deform(dir, p) || p;
    v.push(p); w.push(typeof weights === 'function' ? weights(p, dir) : weights); dirs.push(dir);
  };
  push([0, -1, 0]);
  for (let i = 1; i < lat; i++) {
    const ph = -Math.PI / 2 + (i / lat) * Math.PI;
    for (let j = 0; j < lon; j++) {
      const th = (j / lon) * TAU;
      push([Math.sin(th) * Math.cos(ph), Math.sin(ph), -Math.cos(th) * Math.cos(ph)]);
    }
  }
  push([0, 1, 0]);
  const top = v.length - 1;
  const idx = (i, j) => 1 + (i - 1) * lon + (j % lon);
  // wind outward using the undeformed direction (robust against deformations)
  const add = (a, b, cc) => {
    const nrm = vcross(vsub(v[b], v[a]), vsub(v[cc], v[a]));
    const d = [dirs[a][0] + dirs[b][0] + dirs[cc][0], dirs[a][1] + dirs[b][1] + dirs[cc][1], dirs[a][2] + dirs[b][2] + dirs[cc][2]];
    const s = [d[0] * rx, d[1] * ry, d[2] * rz];
    t.push(vdot(nrm, s) >= 0 ? [a, b, cc] : [a, cc, b]);
  };
  for (let j = 0; j < lon; j++) { add(0, idx(1, j), idx(1, j + 1)); q.push(null); }
  for (let i = 1; i < lat - 1; i++) for (let j = 0; j < lon; j++) {
    const quad = [idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1)];
    add(idx(i, j), idx(i, j + 1), idx(i + 1, j));
    add(idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j));
    q.push(quad, quad);
  }
  for (let j = 0; j < lon; j++) { add(top, idx(lat - 1, j + 1), idx(lat - 1, j)); q.push(null); }
  return { v, w, t, dirs, q };
}

/** Axis-aligned box (8 verts, 12 tris, flat normals) centred at c. */
function box(c, hx, hy, hz, weights) {
  const v = [], w = [], t = [];
  for (let i = 0; i < 8; i++) {
    v.push([c[0] + (i & 1 ? hx : -hx), c[1] + (i & 2 ? hy : -hy), c[2] + (i & 4 ? hz : -hz)]);
    w.push(weights);
  }
  const quads = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
  for (const [a, b, cc, d] of quads) {
    for (const tri of [[a, b, cc], [a, cc, d]]) {
      const nrm = vcross(vsub(v[tri[1]], v[tri[0]]), vsub(v[tri[2]], v[tri[0]]));
      const cm = vsub([(v[tri[0]][0] + v[tri[1]][0] + v[tri[2]][0]) / 3, (v[tri[0]][1] + v[tri[1]][1] + v[tri[2]][1]) / 3, (v[tri[0]][2] + v[tri[1]][2] + v[tri[2]][2]) / 3], c);
      t.push(vdot(nrm, cm) >= 0 ? tri : [tri[0], tri[2], tri[1]]);
    }
  }
  return { v, w, t, flat: true };
}

/** Accumulates parts, computes smooth normals per part, expands to a non-indexed geometry with per-face regions. */
class GeoBuilder {
  constructor() { this.P = []; this.N = []; this.W = []; this.T = []; this.REG = []; this.SH = []; this.F = []; }
  add(part, regFn) {
    const base = this.P.length;
    for (let i = 0; i < part.v.length; i++) this.F.push(part.f ? part.f[i] : NOFACE);
    const nrm = part.v.map(() => [0, 0, 0]);
    if (!part.flat) {
      for (const [a, b, c] of part.t) {
        const fn = vcross(vsub(part.v[b], part.v[a]), vsub(part.v[c], part.v[a]));
        for (const k of [a, b, c]) { nrm[k][0] += fn[0]; nrm[k][1] += fn[1]; nrm[k][2] += fn[2]; }
      }
    }
    for (let i = 0; i < part.v.length; i++) { this.P.push(part.v[i]); this.N.push(part.flat ? null : vnorm(nrm[i])); this.W.push(part.w[i]); }
    for (let k = 0; k < part.t.length; k++) {
      const [a, b, c] = part.t[k];
      const pa = part.v[a], pb = part.v[b], pc = part.v[c];
      let cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
      const qd = part.q && part.q[k];
      if (qd) {
        const [q0, q1, q2, q3] = qd.map((i) => part.v[i]);
        cen = [(q0[0] + q1[0] + q2[0] + q3[0]) / 4, (q0[1] + q1[1] + q2[1] + q3[1]) / 4, (q0[2] + q1[2] + q2[2] + q3[2]) / 4];
      }
      const rs = part.reg ? part.reg[k] : (typeof regFn === 'function' ? regFn(cen, k, part.t[k]) : regFn);
      const fn = part.flat ? vnorm(vcross(vsub(pb, pa), vsub(pc, pa))) : null;
      this.T.push([base + a, base + b, base + c, fn]);
      this.REG.push(Array.isArray(rs) ? rs[0] : rs); this.SH.push(Array.isArray(rs) ? rs[1] : 1);
    }
  }
  build() {
    const nt = this.T.length, nv = nt * 3;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);   // compact: 8-bit indices + normalized 8-bit weights
    const hf = new Int8Array(nv * 4);                                  // head dir (x, y, front) + hair signed distance
    let o = 0;
    for (let k = 0; k < nt; k++) {
      const tri = this.T[k];
      for (let m = 0; m < 3; m++, o++) {
        const i = tri[m], p = this.P[i], n = tri[3] || this.N[i];
        const fd = this.F[i];
        for (let c = 0; c < 4; c++) hf[o * 4 + c] = Math.round(clamp(fd[c], -1, 1) * 127);
        pos[o * 3] = p[0]; pos[o * 3 + 1] = p[1]; pos[o * 3 + 2] = p[2];
        nor[o * 3] = n[0]; nor[o * 3 + 1] = n[1]; nor[o * 3 + 2] = n[2];
        const ws = this.W[i].filter((x) => x[1] > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4);
        let sum = 0; for (const [, x] of ws) sum += x;
        let rest = 255;
        for (let q = ws.length - 1; q >= 0; q--) {
          const b8 = q === 0 ? rest : Math.round((ws[q][1] / sum) * 255);   // largest weight takes the rounding remainder
          si[o * 4 + q] = ws[q][0]; sw[o * 4 + q] = b8; rest -= b8;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    g.setAttribute('hface', new THREE.BufferAttribute(hf, 4, true));
    return { geometry: g, faceRegion: Uint8Array.from(this.REG), faceShade: Float32Array.from(this.SH), tris: nt };
  }
}

const NOFACE = [0, 0, -1, -1];

// weight helpers
const W1 = (b) => [[b, 1]];
const W2 = (a, b, t) => [[a, 1 - t], [b, t]];     // t = weight of b

// --------------------------------------------------------------------------------------------
// body variant geometry (cached)
// --------------------------------------------------------------------------------------------
const HEAD_C = [0, 1.672, 0.008];

function hairSdf(style, d) {
  const fr = -d[2], y = d[1];
  switch (style) {
    case 'short': return y - (fr > 0 ? lerp(0.04, 0.5, Math.pow(fr, 0.75)) : lerp(0.04, -0.5, -fr));
    case 'long': return y - (fr > 0 ? lerp(-0.5, 0.5, Math.pow(fr, 0.55)) : lerp(-0.5, -0.8, -fr));
    case 'bun': return y - (fr > 0 ? lerp(0.0, 0.5, Math.pow(fr, 0.75)) : lerp(0.0, -0.5, -fr));
    case 'cap': return y - (fr > 0 ? lerp(0.06, 0.45, fr) : lerp(0.06, -0.45, -fr));
    case 'bald': return Math.min(0.2 - y, y + 0.35, 0.12 - fr);
    default: return -1;
  }
}
function hairZone(style, d) {
  const fr = -d[2];                                   // +1 = front, -1 = back
  const y = d[1];
  switch (style) {
    case 'short': return y > (fr > 0 ? lerp(0.14, 0.5, fr) : lerp(0.14, -0.45, -fr));
    case 'long': return y > (fr > 0 ? lerp(-0.5, 0.5, Math.pow(fr, 0.55)) : lerp(-0.5, -0.8, -fr));
    case 'bun': return y > (fr > 0 ? lerp(0.02, 0.5, Math.pow(fr, 0.8)) : lerp(0.02, -0.5, -fr));
    case 'cap': return y > (fr > 0 ? lerp(0.1, 0.45, fr) : lerp(0.1, -0.42, -fr));
    case 'bald': return fr < 0.15 && y > -0.35 && y < 0.2 && Math.abs(d[0]) > 0.35 || (fr < -0.6 && y > -0.35 && y < 0.25);
    default: return false;
  }
}
function hatZone(d) { const fr = -d[2]; return d[1] > (fr > 0 ? lerp(0.22, 0.42, fr) : lerp(0.22, 0.12, -fr)); }

function buildVariant(build, gender, hairStyle, outfit) {
  const D = makeDims(build, gender);
  const G = new GeoBuilder();
  const f = D.f;
  const jacket = outfit === 'jacket', hoodie = outfit === 'hoodie', suit = outfit === 'suit';
  const dress = outfit === 'dress', police = outfit === 'police', tee = outfit === 'tshirt';
  const cap = hairStyle === 'cap' || police;
  const style = police && hairStyle !== 'long' && hairStyle !== 'bun' ? 'cap' : hairStyle;

  // ---------------- torso ----------------
  // [y, rx, rzFront, rzBack, cz]
  const TORSO = [
    [0.855, 0.10, 0.07, 0.08, 0.01],
    [0.90, 0.158, 0.095, 0.11, 0.01],
    [0.95, 0.165, 0.10, 0.115, 0.01],
    [0.985, 0.160, 0.10, 0.105, 0.005],
    [1.02, 0.152, 0.098, 0.098, 0],
    [1.07, 0.146, 0.098, 0.092, 0],
    [1.14, 0.150, 0.104, 0.094, 0],
    [1.22, 0.158, 0.113, 0.098, 0],
    [1.30, 0.162, 0.118, 0.102, 0],
    [1.37, 0.165, 0.113, 0.104, 0.005],
    [1.425, 0.172, 0.10, 0.098, 0.008],
    [1.465, 0.15, 0.08, 0.08, 0.01],
    [1.495, 0.078, 0.055, 0.06, 0.012],
    [1.545, 0.054, 0.05, 0.052, 0.012],
    [1.61, 0.052, 0.048, 0.05, 0.016],
  ];
  const hem = hoodie ? 0.94 : jacket ? 0.935 : suit ? 0.9 : police ? 0.955 : dress ? 0.8 : 0.965;
  const bulk = jacket ? 0.017 : hoodie ? 0.01 : suit ? 0.007 : police ? 0.004 : dress ? 0.001 : 0.003;
  // resample the profile so every colour boundary of this outfit lies exactly on a ring
  const bounds = [hem, 1.5];
  if (tee) bounds.push(0.97, 0.995, 1.2, 1.36, 1.465);
  if (hoodie) bounds.push(0.975, 1.0, 1.13, 1.52);
  if (jacket) { for (let y = 0.965; y < 1.46; y += 0.07) bounds.push(y); bounds.push(1.555); }
  if (suit) bounds.push(1.2, 1.3, 1.465, 1.535);
  if (police) bounds.push(0.97, 1.005, 1.28, 1.34, 1.37, 1.455, 1.525);
  if (dress) bounds.push(1.0, 1.03, 1.43, 1.455);
  const profile = (y) => {
    let i = 0; while (i < TORSO.length - 2 && TORSO[i + 1][0] < y) i++;
    const a = TORSO[i], b = TORSO[i + 1], u = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    return a.map((x, k) => lerp(x, b[k], u));
  };
  const ys = [...TORSO.map((r) => r[0])];
  for (const by of bounds) if (!ys.some((y) => Math.abs(y - by) < 0.006)) ys.push(by);
  ys.sort((a, b) => a - b);
  const torsoRings = ys.map((yy) => profile(yy)).map(([y, rx, rzF, rzB, cz]) => {
    const body = y >= 0.9 && y <= 1.44;
    if (body) rx *= D.W;
    if (f) {
      if (y >= 1.35) rx *= 0.9;
      if (y >= 1.0 && y <= 1.16) rx *= 0.9;
      if (y >= 0.9 && y < 1.0) { rx *= 1.06; rzB *= 1.08; }
      rzF += 0.024 * Math.exp(-((y - 1.285) ** 2) / 0.0025);
    }
    const bell = Math.exp(-((y - 1.09) ** 2) / 0.012);
    rzF += D.belly * 0.065 * bell; rx += D.belly * 0.018 * bell; rzB += D.belly * 0.012 * bell;
    if (y > hem - 0.02 && y < 1.48) { rx += bulk; rzF += bulk; rzB += bulk; }
    // collars
    if (y >= 1.49 && y < 1.56) {
      if (jacket) { rx += 0.03 * (y < 1.52 ? 1 : 0.6); rzF += 0.025; rzB += 0.03; }
      if (hoodie && y < 1.52) { rx += 0.015; rzF += 0.01; rzB += 0.02; }
      if (suit || police) { rx += 0.006; rzF += 0.006; rzB += 0.006; }
    }
    let w;
    if (y < 0.99) w = W1(B.hips);
    else if (y < 1.1) w = W2(B.hips, B.spine, smooth(0.99, 1.1, y));
    else if (y < 1.3) w = W2(B.spine, B.chest, smooth(1.12, 1.3, y));
    else if (y < 1.48) w = W1(B.chest);
    else if (y < 1.56) w = W2(B.chest, B.neck, smooth(1.48, 1.56, y) * 0.9 + 0.1);
    else w = W2(B.neck, B.head, 0.35);
    return { c: [0, y, cz], rx, ry: rzF, ryb: rzB, e: y > 0.88 && y < 1.47 ? 2.3 : 2, w };
  });
  const TSEG = suit ? 32 : 24;                     // suits get finer columns for tie + shirt V
  const torso = tube(torsoRings, { seg: TSEG, capStart: 0.02 });
  const nBody = (torsoRings.length - 1) * TSEG * 2;
  G.add(torso, (c, k) => {
    const [x, y, z] = c;
    // angular distance of this face's column from the front centre line (exact, independent of the body shape)
    let aa;
    if (k < nBody) { const j = (k >> 1) % TSEG; aa = Math.abs(((j + 0.5) / TSEG) * TAU - Math.PI / 2); if (aa > Math.PI) aa = TAU - aa; }
    else aa = Math.abs(Math.atan2(x, -z));
    const front = aa < Math.PI / 2;
    // neck + collar
    if (y > 1.5) {
      if (jacket && y < 1.555) return R.TORSO;
      if (hoodie && y < 1.52) return R.TORSO;
      if ((suit || police) && y < 1.535) return suit ? R.TORSO2 : R.TORSO;
      return R.SKIN;
    }
    if (y < hem) return y < 0.97 || !(tee || police) ? R.PANTS : R.BELT;
    if (tee) {
      if (y < 0.995) return aa < 0.45 ? R.ACCENT : R.BELT;
      if (y > 1.465 && front && aa < 0.9) return R.SKIN;
      if (front && aa < 0.7 && y > 1.2 && y < 1.36) return R.ACCENT;
      return R.TORSO;
    }
    if (hoodie) {
      if (y < 0.975) return R.CUFF;
      if (front && aa < 0.75 && y > 1.0 && y < 1.13) return [R.TRIM, 1];
      return R.TORSO;
    }
    if (jacket) {
      if (y < 0.965) return R.CUFF;
      if (y > 1.45 && front && aa < 0.45) return R.TORSO2;
      const band = Math.floor((y - 0.965) / 0.07) % 2;
      return [R.TORSO, band ? 0.84 : 1];
    }
    if (suit) {
      if (aa < 0.25 && y > 1.2 && y < 1.465) return R.ACCENT;     // tie (= shirt colour when tieless)
      if (aa < 0.25 && y > 1.2) return R.TORSO2;
      if (y > 1.3 && aa < 0.2 + (y - 1.3) * 3.2) return R.TORSO2;  // shirt V widening towards the collar
      if (y > 1.25 && aa < 0.45 + (y - 1.25) * 3.2) return [R.TORSO, 0.72];   // lapels
      if (y > 1.465 && aa < 1.2) return R.TORSO2;
      return R.TORSO;
    }
    if (police) {
      if (y < 1.005) return aa < 0.45 ? R.ACCENT : R.BELT;
      if (front && x < -0.04 && x > -0.13 && y > 1.28 && y < 1.37) return R.ACCENT;
      if (front && x > 0.04 && x < 0.13 && y > 1.28 && y < 1.34) return [R.TORSO, 0.8];
      if (y > 1.455 && aa < 0.45) return [R.TORSO, 0.6];
      return R.TORSO;
    }
    if (dress) {
      if (y > 1.43 && front && aa < 1.1) return R.SKIN;
      if (y > 1.455 && (aa < 1.25 || aa > 1.9)) return R.SKIN;
      if (y < 1.03 && y > 1.0) return [R.TORSO, 0.8];
      return R.TORSO;
    }
    return R.TORSO;
  });

  // ---------------- arms ----------------
  const L = D.L * (f ? 0.9 : 1);
  const armBulk = jacket ? 0.014 : hoodie ? 0.007 : suit ? 0.005 : police ? 0.003 : 0;
  const longSleeve = hoodie || jacket || suit || police;
  const ARM = [
    [1.462, 0.03], [1.44, 0.05], [1.41, 0.054], [1.37, 0.051], [1.33, 0.048],
    ...(tee ? [[1.31, 0.047, 1], [1.302, 0.047, 1], [1.295, 0.045]] : []),
    ...(dress ? [[1.4, 0.052]] : []),
    [1.24, 0.043], [1.18, 0.038], [1.15, 0.037], [1.10, 0.04], [1.03, 0.036],
    ...(longSleeve ? [[0.965, 0.031, 1], [0.955, 0.03, 1], [0.945, 0.028]] : [[0.96, 0.03]]),
    [0.915, 0.026],
  ].sort((a, b) => b[0] - a[0]);
  for (const side of [-1, 1]) {
    const ua = side < 0 ? B.upperArm_L : B.upperArm_R, la = side < 0 ? B.lowerArm_L : B.lowerArm_R, ha = side < 0 ? B.hand_L : B.hand_R;
    const x0 = side * D.shoulderX;
    const rings = ARM.map(([y, r, lip]) => {
      let rr = r * L;
      if (tee && y > 1.3) rr += 0.006 + (lip ? 0.004 : 0);
      if (longSleeve) rr += armBulk * (y > 0.955 ? 1 : 0) + (lip ? 0.004 : 0);
      let w;
      if (y > 1.43) w = W2(ua, B.chest, smooth(1.43, 1.475, y) * 0.5);
      else if (y > 1.2) w = W1(ua);
      else if (y > 1.1) w = W2(ua, la, smooth(1.2, 1.1, y));
      else if (y > 0.93) w = W1(la);
      else w = W2(la, ha, 0.35);
      return { c: [x0 - side * (y > 1.43 ? 0.01 : 0), y, 0.004], rx: rr, ry: rr * (y > 1.2 ? 1.02 : 0.94), w };
    });
    const arm = tube(rings, { seg: 12, capStart: 0.012, capEnd: 0.004 });
    G.add(arm, (c) => {
      const y = c[1];
      if (tee) { if (y > 1.306) return R.SLEEVE_UP; if (y > 1.296) return R.CUFF; return R.SKIN; }
      if (dress) return y > 1.44 ? R.SLEEVE_UP : R.SKIN;
      if (y < 0.935) return R.SKIN;
      if (y < 0.96) return R.CUFF;
      const sh = jacket ? (Math.floor((y - 0.955) / 0.07) % 2 ? 0.86 : 1) : 1;
      return [y > 1.16 ? R.SLEEVE_UP : R.SLEEVE_LO, sh];
    });
    // deltoid: rounds the shoulder into the arm (a bare tube-on-a-box reads as a mannequin)
    const drx = 0.041 * L + armBulk + (tee ? 0.005 : 0);
    const delt = ellipsoid([x0 - side * 0.006, 1.405, 0.006], drx, 0.05, drx * 1.05, 12, 8, (p) => {
      const out = clamp((p[0] * side - (D.shoulderX - 0.03)) / 0.06, 0, 1);
      return W2(B.chest, ua, 0.25 + 0.6 * out * smooth(1.47, 1.38, p[1]));
    });
    G.add(delt, (c) => (dress && c[1] < 1.44 ? R.SKIN : R.SLEEVE_UP));

    // hand (mitt): palm faces inward (thin along X, wide along Z), thumb forward
    const hs = f ? 0.92 : 1;
    const HAND = [[0.918, 0.022, 0.03], [0.885, 0.025, 0.042], [0.845, 0.023, 0.047], [0.8, 0.02, 0.045], [0.765, 0.017, 0.04], [0.74, 0.012, 0.03]];
    const hand = tube(HAND.map(([y, rx, rz]) => ({
      c: [x0 - side * 0.002, y, -0.004 + (0.918 - y) * -0.04], rx: rx * hs, ry: rz * hs,
      w: y > 0.91 ? W2(ha, la, 0.4) : W1(ha),
    })), { seg: 10, capEnd: 0.008 });
    G.add(hand, R.SKIN);
    const thumb = tube([
      { c: [x0 - side * 0.012, 0.885, -0.028], rx: 0.013 * hs, ry: 0.014 * hs, w: W1(ha) },
      { c: [x0 - side * 0.016, 0.852, -0.046], rx: 0.012 * hs, ry: 0.012 * hs, w: W1(ha) },
      { c: [x0 - side * 0.018, 0.826, -0.053], rx: 0.01 * hs, ry: 0.01 * hs, w: W1(ha) },
    ], { seg: 6, capEnd: 0.008 });
    G.add(thumb, R.SKIN);
  }

  // ---------------- legs ----------------
  const LEG = [
    [0.995, 0.08, 0.085, 0], [0.92, 0.086, 0.09, 0.005], [0.82, 0.078, 0.082, 0.004], [0.70, 0.066, 0.07, 0],
    [0.60, 0.056, 0.06, 0], [0.52, 0.051, 0.055, 0.004], [0.45, 0.053, 0.058, 0.008], [0.37, 0.054, 0.06, 0.01],
    [0.27, 0.046, 0.05, 0.006], [0.17, 0.038, 0.042, 0.002], [0.11, 0.035, 0.038, 0],
  ];
  const pantsLeg = !dress;
  for (const side of [-1, 1]) {
    const ul = side < 0 ? B.upperLeg_L : B.upperLeg_R, ll = side < 0 ? B.lowerLeg_L : B.lowerLeg_R, ft = side < 0 ? B.foot_L : B.foot_R;
    const x0 = side * D.hipX;
    const rings = LEG.map(([y, rx, rz, cz]) => {
      let g = D.L * (f ? 0.95 : 1);
      if (y > 0.85 && f) g *= 1.04;
      rx *= g; rz *= g;
      if (pantsLeg && y < 0.56) { rx = Math.max(rx, 0.05 * D.L) + 0.004; rz = Math.max(rz, 0.054 * D.L) + 0.004; }
      else if (pantsLeg) { rx += 0.004; rz += 0.004; }
      let w;
      if (y > 0.95) w = W2(ul, B.hips, 0.5);
      else if (y > 0.9) w = W2(ul, B.hips, 0.12);
      else if (y > 0.62) w = W1(ul);
      else if (y > 0.42) w = W2(ul, ll, smooth(0.6, 0.45, y));
      else if (y > 0.15) w = W1(ll);
      else w = W2(ll, ft, 0.3);
      return { c: [x0, y, cz], rx, ry: rz, w };
    });
    G.add(tube(rings, { seg: 12, capEnd: 0.02 }), (c) => (c[1] > 0.52 ? R.PANTS : R.PANTS_LO));

    // shoe (loft along -Z), flat sole at y = 0
    const sx = x0 + side * 0.006;
    const SHOE = [
      [0.078, 0.047, 0.028, 0.026, 0.042], [0.06, 0.052, 0.04, 0.045, 0.052], [0.0, 0.056, 0.046, 0.05, 0.056],
      [-0.06, 0.045, 0.05, 0.035, 0.045], [-0.12, 0.037, 0.05, 0.027, 0.037], [-0.17, 0.032, 0.045, 0.022, 0.032],
      [-0.196, 0.029, 0.03, 0.017, 0.029],
    ];
    const dressy = suit || police;
    const shoe = tube(SHOE.map(([z, cy, rx, ryT, ryB]) => ({
      c: [sx, cy, z], rx: rx * (dress ? 0.9 : 1) * (dressy ? 0.95 : 1), ry: ryT * (dressy || dress ? 0.85 : 1), ryb: ryB, e: 3,
      w: (p) => (p[1] > 0.095 ? W2(ft, ll, 0.3) : W1(ft)),
    })), { seg: 14, ref: [0, 1, 0], capStart: 0.01, capEnd: 0.006 });
    G.add(shoe, (c) => (c[1] < 0.016 ? R.SOLE : (c[1] > 0.08 && c[2] > -0.02 ? [R.SHOE, 0.8] : R.SHOE)));
  }

  // ---------------- head ----------------
  const hs = D.head;
  const hx = 0.08 * hs, hyT = 0.103 * hs, hyB = 0.122 * hs, hzF = 0.095 * hs, hzB = 0.104 * hs;
  const push = style === 'short' ? 0.01 : style === 'long' ? 0.016 : style === 'bun' ? 0.011 : style === 'bald' ? 0.004 : 0.006;
  const headShape = (d) => {
    const [dx, dy, dz] = d, fr = -dz;
    let x = dx * hx, y = dy * (dy > 0 ? hyT : hyB), z = dz * (dz < 0 ? hzF : hzB);
    if (dy < 0) {                               // jaw narrows, back of the skull tucks into the neck
      const k = -dy;
      x *= (1 - 0.17 * k * k) * (1 + 0.09 * Math.exp(-((dy + 0.62) ** 2) / 0.03));
      z *= dz < 0 ? 1 - 0.12 * k : 1 - 0.5 * k;
    }
    if (dy > 0.6) x *= 1 - 0.12 * (dy - 0.6);
    const frp = Math.max(0, fr), ax = Math.abs(dx);
    if (dz < 0) z = -Math.pow(-dz, 0.82) * hzF * (dy < 0 ? 1 - 0.12 * -dy : 1);   // flatter face plane, sides turn sharper
    x *= 1 + 0.05 * Math.exp(-((dy + 0.08) ** 2) / 0.03) * frp;                   // cheekbones
    const g = (a, s) => Math.exp(-(a * a) / s);
    // nose: bridge between the eyes, tip + wider alar base lower down
    const nW = 0.01 + 0.012 * g(dy + 0.34, 0.008);
    z -= 0.038 * hs * g(dx, nW) * (0.32 * g(dy - 0.02, 0.025) + g(dy + 0.29, 0.012)) * frp;
    z -= 0.009 * hs * g(dy - 0.21, 0.006) * frp * (1 - 0.4 * g(dx, 0.02));                      // brow ridge
    z += 0.011 * hs * g(ax - 0.39, 0.02) * g(dy - 0.04, 0.012) * frp;                          // eye sockets
    z -= 0.005 * hs * g(ax - 0.39, 0.008) * g(dy - 0.03, 0.005) * frp;                         // eyeballs
    z -= 0.007 * hs * g(dx, 0.05) * g(dy + 0.6, 0.012) * frp;                                  // lips / muzzle
    z -= 0.006 * hs * g(ax - 0.52, 0.03) * g(dy + 0.12, 0.02) * frp;                           // cheeks
    z -= 0.012 * hs * g(dy + 0.84, 0.02) * g(dx, 0.08) * frp;                                  // chin
    return [HEAD_C[0] + x, HEAD_C[1] + y, HEAD_C[2] + z];
  };
  const headDeform = (d) => {
    const p = headShape(d);
    let off = 0;
    if (cap && hatZone(d)) off = 0.02;
    else off = push * smooth(-0.03, 0.09, hairSdf(style, d));
    if (off) { const n = vnorm([d[0] / hx, d[1] / (d[1] > 0 ? hyT : hyB), d[2] / (d[2] < 0 ? hzF : hzB)]); p[0] += n[0] * off; p[1] += n[1] * off; p[2] += n[2] * off; }
    return p;
  };
  // dense lat-long head: face features (eyes, brows, lips, nostrils) are painted in the shader from the 'hface'
  // direction, so they stay crisp at any mesh resolution; the mesh only carries the relief (nose, sockets, chin)
  const head = ellipsoid([0, 0, 0], 1, 1, 1, 36, 26, W1(B.head), headDeform);
  head.f = head.dirs.map((d) => [d[0], d[1], -d[2], clamp(cap && hatZone(d) ? -1 : hairSdf(style, d), -0.98, 1)]);
  head.reg = head.t.map((tri, k) => {
    const ids = head.q[k] || tri;
    const d = vnorm(ids.reduce((acc, i) => [acc[0] + head.dirs[i][0], acc[1] + head.dirs[i][1], acc[2] + head.dirs[i][2]], [0, 0, 0]));
    if (cap && hatZone(d)) return R.HAT;
    return R.SKIN;                               // hair on the scalp is painted per pixel from hface.w (soft hairline)
  });
  G.add(head);

  for (const side of [-1, 1]) {
    if (style !== 'long') {
      const ear = ellipsoid([side * (hx * 0.97), HEAD_C[1] - 0.006, HEAD_C[2] + 0.014], 0.009, 0.03 * hs, 0.019 * hs, 10, 7, W1(B.head),
        (d, p) => [p[0] + side * 0.006 * Math.max(0, d[2]), p[1], p[2]]);   // flares out at the back like a real ear
      G.add(ear, [R.SKIN, 0.93]);
    }
  }

  // ---------------- hair extras ----------------
  if (style === 'long') {
    const HR = [[1.765, 0.058, 0.05, 0.018], [1.72, 0.086, 0.1, 0.03], [1.66, 0.09, 0.108, 0.03], [1.6, 0.092, 0.098, 0.026], [1.54, 0.094, 0.098, 0.022], [1.47, 0.095, 0.112, 0.018], [1.42, 0.085, 0.12, 0.012]];
    const curtain = tube(HR.map(([y, rx, z, th]) => ({
      c: [0, y, z * hs], rx: rx * hs, ry: th,
      w: y > 1.58 ? W1(B.head) : y > 1.5 ? W2(B.head, B.neck, 0.5) : W2(B.chest, B.neck, 0.3),
    })), { seg: 10, capStart: 0.012, capEnd: 0.008 });
    G.add(curtain, R.HAIR);
  }
  if (style === 'bun') {
    G.add(ellipsoid([0, 1.752 * 1 + (hs - 1) * 0.1, 0.088 * hs], 0.042, 0.04, 0.04, 8, 6, W1(B.head)), R.HAIR);
  }
  if (cap) {
    const topY = HEAD_C[1] + hyT + 0.02;
    if (police) {
      G.add(ellipsoid([0, topY - 0.012, HEAD_C[2] - 0.004], hx + 0.034, 0.03, hzF + 0.036, 12, 5, W1(B.head)), (c) => (c[1] < topY - 0.028 ? [R.HAT, 0.55] : R.HAT));
      const bd = headShape([0, 0.52, -0.85]);
      G.add(box([0, bd[1] + 0.03, bd[2] - 0.022], 0.012, 0.012, 0.004, W1(B.head)), R.ACCENT);
    }
    const bf = headShape([0, 0.42, -0.9]);
    G.add(ellipsoid([0, bf[1] + 0.012, bf[2] - 0.035], hx + 0.012, 0.007, 0.075 * hs, 12, 4, W1(B.head)), R.BRIM);
  }

  // ---------------- outfit extras ----------------
  if (hoodie) {
    // rolled hood around the back of the neck + hood drape on the upper back
    const arc = [];
    for (let i = 0; i <= 8; i++) {
      const a = lerp(-1.8, 1.8, i / 8);
      const back = Math.cos(a), bk = Math.max(0, back);
      arc.push({
        c: [Math.sin(a) * 0.098 * D.W, 1.49 + 0.03 * back, 0.02 + 0.09 * back], rx: 0.016 + 0.032 * bk, ry: 0.018 + 0.022 * bk,
        w: W2(B.chest, B.neck, 0.35),
      });
    }
    G.add(tube(arc, { seg: 6, ref: [0, 1, 0], capStart: 0.01, capEnd: 0.01 }), [R.TORSO, 0.92]);
    G.add(ellipsoid([0, 1.39, 0.108 + 0.01 * D.belly * 0 + (D.W - 1) * 0.05], 0.12 * D.W, 0.1, 0.035, 10, 5, W1(B.chest)), [R.TORSO, 0.9]);
    for (const side of [-1, 1]) {
      G.add(tube([
        { c: [side * 0.035, 1.46, -0.098 - bulk], rx: 0.0045, ry: 0.0045, w: W1(B.chest) },
        { c: [side * 0.037, 1.33, -0.123 - bulk - (f ? 0.02 : 0)], rx: 0.0045, ry: 0.0045, w: W1(B.chest) },
      ], { seg: 4, ref: [0, 0, -1], capEnd: 0.004 }), R.ACCENT);
    }
  }
  if (dress) {
    const legW = (p) => {
      const t = smooth(0.98, 0.7, p[1]);
      const near = p[0] < 0 ? B.upperLeg_L : B.upperLeg_R, far = p[0] < 0 ? B.upperLeg_R : B.upperLeg_L;
      const k = Math.min(1, Math.abs(p[0]) / 0.12);
      return [[B.hips, 1 - 0.6 * t], [near, 0.6 * t * (0.5 + 0.5 * k)], [far, 0.6 * t * (0.5 - 0.5 * k)]];
    };
    const SK = [[1.03, 0.152, 0.1, 0.1], [0.95, 0.182, 0.118, 0.13], [0.8, 0.205, 0.145, 0.15], [0.63, 0.222, 0.165, 0.165], [0.618, 0.214, 0.157, 0.157]];
    G.add(tube(SK.map(([y, rx, rzF, rzB]) => ({ c: [0, y, 0.008], rx: rx * D.W * 1.02, ry: rzF * (1 + 0.3 * D.belly * (y > 0.9 ? 1 : 0.4)), ryb: rzB, w: legW })), { seg: 16 }),
      (c) => (c[1] < 0.64 ? [R.SKIRT, 0.82] : R.SKIRT));
  }

  // ---------------- phone prop (bone 17, hidden by scaling the bone to ~0) ----------------
  const pr = B.prop;
  const px = D.shoulderX - 0.028;
  const phone = box([px, 0.8, -0.006], 0.0055, 0.072, 0.035, W1(pr));
  phone.reg = phone.t.map(([a, b, c]) => {
    const n = vcross(vsub(phone.v[b], phone.v[a]), vsub(phone.v[c], phone.v[a]));
    return n[0] < -1e-9 && Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? R.SCREEN : R.PHONE;
  });
  G.add(phone);

  const built = G.build();
  built.dims = D;
  built.geometry.name = `human_${build}_${gender}_${hairStyle}_${outfit}`;
  return built;
}

const GEO_CACHE = new Map();   // key -> { built, refs }
function acquireVariant(build, gender, hairStyle, outfit) {
  const key = `${build}|${gender}|${hairStyle}|${outfit}`;
  let e = GEO_CACHE.get(key);
  if (!e) { e = { key, built: buildVariant(build, gender, hairStyle, outfit), refs: 0 }; GEO_CACHE.set(key, e); }
  e.refs++;
  return e;
}

// --------------------------------------------------------------------------------------------
// options -> appearance (deterministic per seed)
// --------------------------------------------------------------------------------------------
const OUTFITS = ['tshirt', 'hoodie', 'jacket', 'suit', 'dress', 'police'];
const HAIRS = ['short', 'long', 'bun', 'bald', 'cap'];
const BUILDS = ['slim', 'average', 'heavy'];

function resolveLook(opts) {
  const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
  const rand = mulberry32(hashSeed(seed));
  const r = []; for (let i = 0; i < 32; i++) r.push(rand());   // fixed draw order: overriding one field never reshuffles the others

  let gender = opts.gender;
  if (gender === undefined || gender === null) gender = r[0] < 0.5 ? 'm' : 'f';
  else gender = /^(f|w|female|woman|girl)/i.test(String(gender)) ? 'f' : 'm';
  const f = gender === 'f';

  let outfit = OUTFITS.includes(opts.outfit) ? opts.outfit : pickWeighted(r[1], f
    ? [['tshirt', 26], ['hoodie', 22], ['jacket', 22], ['suit', 10], ['dress', 20]]
    : [['tshirt', 30], ['hoodie', 28], ['jacket', 24], ['suit', 16], ['police', 2]]);
  let hairStyle = HAIRS.includes(opts.hairStyle) ? opts.hairStyle : pickWeighted(r[2], f
    ? [['long', 45], ['bun', 25], ['short', 18], ['cap', 10], ['bald', 2]]
    : [['short', 55], ['cap', 18], ['bald', 13], ['long', 7], ['bun', 7]]);
  if (outfit === 'police' && hairStyle !== 'long' && hairStyle !== 'bun') hairStyle = 'cap';
  if (outfit === 'suit' && hairStyle === 'cap' && opts.hairStyle === undefined) hairStyle = f ? 'bun' : 'short';
  const build = BUILDS.includes(opts.build) ? opts.build : pickWeighted(r[3], [['slim', 30], ['average', 50], ['heavy', 20]]);
  const height = typeof opts.height === 'number' ? clamp(opts.height, 1.5, 2.05)
    : clamp((f ? 1.64 : 1.77) + (r[4] + r[5] + r[6] - 1.5) * (f ? 0.09 : 0.1), 1.58, 1.95);

  const hex = (v, fallback) => (typeof v === 'number' ? v : (typeof v === 'string' ? new THREE.Color(v).getHex() : fallback));
  const skin = hex(opts.skin, pickFrom(r[7], PAL.skin));
  const hairCol = hex(opts.hair, r[8] < 0.06 ? pickFrom(r[9], PAL.hairRare) : pickFrom(r[9], PAL.hair));
  let shirt, pants, shoes, sole, sleeveUp, sleeveLo, cuff, torso2, accent, trim, skirt, legUp, legLo, hat, brim, belt;
  const variant = r[10];
  belt = pickFrom(r[11], PAL.belt);
  shoes = pickFrom(r[12], PAL.shoe);
  sole = shoes === 0xeeeeea ? 0xf5f5f5 : pickFrom(r[13], PAL.sole);
  pants = r[14] < 0.6 ? pickFrom(r[15], PAL.jeans) : pickFrom(r[15], PAL.pants);
  hat = pickFrom(r[16], PAL.cap);
  brim = r[17] < 0.5 ? hat : 0x1a1a1a;
  switch (outfit) {
    case 'tshirt': {
      shirt = pickFrom(r[18], PAL.tee);
      const shorts = variant < 0.45;                                   // tourist: bright tee + shorts
      if (shorts) pants = pickFrom(r[15], PAL.shorts);
      sleeveUp = shirt; cuff = scaleHex(shirt, 0.85); sleeveLo = skin;
      accent = r[19] < 0.55 ? pickFrom(r[20], PAL.print) : shirt;
      if (accent === 0xffffff && shirt === 0xf4f4f0) accent = 0xd62d2d;   // keep a white print visible on a white tee
      torso2 = shirt; legUp = pants; legLo = shorts ? skin : pants;
      break;
    }
    case 'hoodie':
      shirt = pickFrom(r[18], PAL.hoodie); sleeveUp = sleeveLo = shirt; cuff = scaleHex(shirt, 0.8);
      accent = r[19] < 0.6 ? 0xf2f2f2 : scaleHex(shirt, 0.7); torso2 = shirt; legUp = legLo = pants;
      break;
    case 'jacket': {
      const vest = variant < 0.42;                                     // tech-bro fleece/puffer vest over a button-down
      shirt = vest ? pickFrom(r[18], PAL.vest) : pickFrom(r[18], PAL.puffer);
      torso2 = vest ? pickFrom(r[19], PAL.vestShirt) : (r[19] < 0.5 ? 0x2a2a2a : 0xd8d4cc);
      sleeveUp = sleeveLo = vest ? torso2 : shirt; cuff = vest ? scaleHex(torso2, 0.9) : scaleHex(shirt, 0.7);
      if (vest && r[14] < 0.7) pants = pickFrom(r[15], [0xa89470, 0x7d6a4f, 0x55585c, 0x2f4466]);
      accent = 0x2a2a2a; legUp = legLo = pants;
      break;
    }
    case 'suit':
      shirt = pickFrom(r[18], PAL.suit); torso2 = pickFrom(r[19], PAL.suitShirt);
      accent = f && r[20] < 0.6 ? torso2 : pickFrom(r[20], PAL.tie);
      sleeveUp = sleeveLo = shirt; cuff = torso2; pants = shirt; legUp = legLo = pants;
      shoes = pickFrom(r[12], PAL.dressShoe); sole = 0x151515; belt = 0x151515;
      break;
    case 'dress': {
      shirt = pickFrom(r[18], PAL.dress); skirt = shirt; torso2 = shirt; accent = shirt;
      sleeveUp = shirt; sleeveLo = skin; cuff = shirt;
      const tights = r[21] < 0.3 ? pickFrom(r[22], PAL.tights) : skin;
      legUp = legLo = tights; pants = tights;
      shoes = r[12] < 0.5 ? pickFrom(r[13], [0x141414, 0x6a2a2a, 0xd9c7a8, 0x2a2a2a]) : shoes;
      break;
    }
    case 'police': {
      const light = variant < 0.35;
      shirt = light ? 0x8fb3dc : 0x1b2438; torso2 = 0x1b2438;
      sleeveUp = sleeveLo = shirt; cuff = shirt; accent = 0xd4af37;
      pants = 0x1a2233; legUp = legLo = pants; belt = 0x111111; shoes = 0x111111; sole = 0x111111;
      hat = 0x1a2233; brim = 0x0e0e0e;
      break;
    }
  }
  // explicit overrides
  if (opts.shirt !== undefined) {
    shirt = hex(opts.shirt, shirt);
    if (sleeveUp !== skin) sleeveUp = outfit === 'jacket' && sleeveUp === torso2 ? sleeveUp : shirt;
    if (sleeveLo !== skin && !(outfit === 'jacket' && sleeveLo === torso2)) sleeveLo = shirt;
    cuff = outfit === 'suit' ? cuff : scaleHex(shirt, 0.82);
    if (outfit === 'dress') skirt = shirt;
  }
  if (opts.pants !== undefined) {
    pants = hex(opts.pants, pants);
    legUp = pants; if (legLo !== skin) legLo = pants;
  }
  if (opts.shoes !== undefined) shoes = hex(opts.shoes, shoes);
  trim = scaleHex(shirt, 0.72);
  return {
    seed, gender, outfit, hairStyle, build, height, skin, hairCol,
    colors: {
      [R.SKIN]: skin, [R.TORSO]: shirt, [R.TORSO2]: torso2, [R.SLEEVE_UP]: sleeveUp, [R.SLEEVE_LO]: sleeveLo, [R.CUFF]: cuff,
      [R.PANTS]: legUp, [R.PANTS_LO]: legLo, [R.BELT]: belt, [R.SHOE]: shoes, [R.SOLE]: sole, [R.HAIR]: hairCol,
      [R.EYE]: 0x16110e, [R.LIP]: mixHex(skin, 0x9a4a4a, 0.25), [R.ACCENT]: accent, [R.HAT]: hat, [R.BRIM]: brim,
      [R.PHONE]: 0x1c1c1e, [R.SCREEN]: 0x8fc8ff, [R.BROW]: mixHex(hairCol, 0x1a1410, 0.35), [R.TRIM]: trim, [R.SKIRT]: skirt ?? shirt,
    },
    beard: f ? 0 : typeof opts.beard === 'number' ? opts.beard : pickWeighted(r[26], [[0, 45], [1, 35], [2, 20]]),
    phoneMode: r[23] < 0.5 ? 'text' : 'call',
    idlePhase: r[24] * 100,
    fleeLook: r[25],
  };
}
function scaleHex(h, k) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  return (Math.min(255, Math.round(r * k)) << 16) | (Math.min(255, Math.round(g * k)) << 8) | Math.min(255, Math.round(b * k));
}
function mixHex(a, b, t) {
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(lerp(ch(a, s), ch(b, s), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

function bakeColors(built, look) {
  const n = built.faceRegion.length;
  const arr = new Uint16Array(n * 9);                    // linear colour, 16-bit normalized (8-bit bands in darks)
  const cols = new Array(NREG).fill(null).map((_, i) => new THREE.Color(look.colors[i] ?? 0xff00ff));
  const Q = (x) => Math.max(0, Math.min(65535, Math.round(x * 65535)));
  for (let k = 0; k < n; k++) {
    const c = cols[built.faceRegion[k]], s = built.faceShade[k];
    const r = Q(c.r * s), g = Q(c.g * s), b = Q(c.b * s);
    for (let m = 0; m < 3; m++) { arr[k * 9 + m * 3] = r; arr[k * 9 + m * 3 + 1] = g; arr[k * 9 + m * 3 + 2] = b; }
  }
  return arr;
}

/** per-vertex surface class for the shader (see CLS_*); skin-coloured clothing regions (bare forearms, shorts) count as skin */
function bakeClasses(built, look) {
  const n = built.faceRegion.length, out = new Uint8Array(n * 12);
  const hc = new THREE.Color(look.hairCol), h8 = [hc.r, hc.g, hc.b].map((x) => Math.round(x * 255));
  const skin = look.colors[R.SKIN], denim = PAL.jeans.includes(look.colors[R.PANTS]) && look.outfit !== 'suit' && look.outfit !== 'police';
  for (let k = 0; k < n; k++) {
    const r = built.faceRegion[k];
    let c = CLS_CLOTH;
    if (r === R.SKIN || r === R.LIP || look.colors[r] === skin) c = CLS_SKIN;
    else if (r === R.HAIR || r === R.BROW) c = CLS_HAIR;
    else if (r === R.SHOE || r === R.SOLE || r === R.BELT || r === R.PHONE || r === R.SCREEN || r === R.BRIM) c = CLS_LEATHER;
    else if (denim && (r === R.PANTS || r === R.PANTS_LO)) c = CLS_DENIM;
    if (c === CLS_SKIN) c += 8 * (look.beard || 0);
    for (let m = 0; m < 3; m++) { const o = (k * 3 + m) * 4; out[o] = c; out[o + 1] = h8[0]; out[o + 2] = h8[1]; out[o + 3] = h8[2]; }
  }
  return out;
}

// --------------------------------------------------------------------------------------------
// skeleton
// --------------------------------------------------------------------------------------------
function makeBones(D) {
  const bones = BONE_NAMES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const set = (i, parent, x, y, z) => { bones[i].position.set(x, y, z); if (parent >= 0) bones[parent].add(bones[i]); };
  set(B.hips, -1, 0, HIPS_Y, 0);
  set(B.spine, B.hips, 0, 0.10, 0);        // 1.05
  set(B.chest, B.spine, 0, 0.20, 0);       // 1.25
  set(B.neck, B.chest, 0, 0.25, 0.01);     // 1.50
  set(B.head, B.neck, 0, 0.10, 0);         // 1.60
  for (const side of [-1, 1]) {
    const o = side < 0 ? 0 : 3;
    set(B.upperArm_L + o, B.chest, side * D.shoulderX, 0.19, 0.005);   // 1.44
    set(B.lowerArm_L + o, B.upperArm_L + o, 0, -UPPER_ARM, 0);         // 1.15
    set(B.hand_L + o, B.lowerArm_L + o, 0, -FOREARM, 0);               // 0.90
    set(B.upperLeg_L + o, B.hips, side * D.hipX, HIP_DY, 0);          // 0.91
    set(B.lowerLeg_L + o, B.upperLeg_L + o, 0, -THIGH, 0);             // 0.49
    set(B.foot_L + o, B.lowerLeg_L + o, 0, -SHIN, 0);                  // 0.08
  }
  set(B.prop, B.hand_R, -0.028, -0.10, -0.006);
  return bones;
}

// --------------------------------------------------------------------------------------------
// pose = per-bone euler (XYZ) + hips position + prop visibility
// --------------------------------------------------------------------------------------------
class Pose {
  constructor() { this.r = new Float32Array(NB * 3); this.p = new Float32Array(3); this.prop = 0; this.reset(); }
  reset() { this.r.fill(0); this.p[0] = 0; this.p[1] = HIPS_Y; this.p[2] = 0; this.prop = 0; return this; }
  copy(o) { this.r.set(o.r); this.p.set(o.p); this.prop = o.prop; return this; }
  set(b, x, y, z) { const i = b * 3; this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z; }
  add(b, x, y, z) { const i = b * 3; this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z; }
  blend(a, b, t) {
    for (let i = 0; i < this.r.length; i++) this.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
    for (let i = 0; i < 3; i++) this.p[i] = a.p[i] + (b.p[i] - a.p[i]) * t;
    this.prop = a.prop + (b.prop - a.prop) * t;
    return this;
  }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3(), _t1 = new THREE.Vector3(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(1, 0, 0);
/**
 * Exact two-bone leg IK. Target = ankle position in rig space; the knee points along the foot's yaw.
 * footPitch = world pitch of the foot (+ = toes up), footYaw = toe-out yaw (rig space). Writes thigh, shin and foot rotations.
 */
function solveLeg(pose, D, side, tx, ty, tz, footPitch, footYaw = 0) {
  const ib = side < 0 ? B.upperLeg_L : B.upperLeg_R;
  const hr = pose.r;
  _e.set(hr[0], hr[1], hr[2]); _q.setFromEuler(_e); _qi.copy(_q).invert();
  _v.set(side * D.hipX, HIP_DY, 0).applyQuaternion(_q);
  _d.set(tx - pose.p[0] - _v.x, ty - pose.p[1] - _v.y, tz - pose.p[2] - _v.z).applyQuaternion(_qi);   // hips-local
  const dl = Math.max(1e-5, _d.length());
  const L = clamp(dl, 0.1, (THIGH + SHIN) * 0.9999);
  _d.multiplyScalar(1 / dl);
  // pole (knee direction) = foot forward, in hips-local space, made orthogonal to the target direction
  _pp.set(-Math.sin(footYaw), 0, -Math.cos(footYaw)).applyQuaternion(_qi);
  _pp.addScaledVector(_d, -_pp.dot(_d));
  if (_pp.lengthSq() < 1e-8) _pp.set(0, 0, -1);
  _pp.normalize();
  const a = (THIGH * THIGH - SHIN * SHIN + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
  _t1.copy(_d).multiplyScalar(a).addScaledVector(_pp, h).normalize();               // thigh direction
  const knee = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN), -1, 1));
  // thigh basis: local -Y along the thigh, local +Z toward the side the shin folds to (away from the pole)
  _by.copy(_t1).negate();
  _bz.copy(_pp).addScaledVector(_t1, -_pp.dot(_t1)).negate().normalize();
  _bx.crossVectors(_by, _bz);
  _m.makeBasis(_bx, _by, _bz);
  _q2.setFromRotationMatrix(_m);
  _e.setFromQuaternion(_q2, 'XYZ');
  pose.set(ib, _e.x, _e.y, _e.z);
  pose.set(ib + 1, -knee, 0, 0);
  // foot: desired rig-space orientation yaw * pitch, expressed relative to hips * thigh * shin
  _q3.setFromAxisAngle(_X, -knee);
  _q.multiply(_q2).multiply(_q3).invert();                                          // (hips*thigh*shin)^-1
  _e.set(footPitch, footYaw, 0, 'YXZ'); _q2.setFromEuler(_e);
  _q.multiply(_q2);
  _e.setFromQuaternion(_q, 'XYZ');
  pose.set(ib + 2, _e.x, _e.y, _e.z);
}

// foot geometry for the stance roll (rig units)
const HEEL_Z = 0.05, BALL_Z = 0.155;

/** Gait parameters for rig-space speed v. */
function gaitParams(v, out) {
  const g = smooth(1.9, 3.1, v);
  const freq = lerp(0.55 + 0.32 * Math.min(v, 2.4), 1.0 + 0.12 * Math.min(v, 9), g);
  const beta = lerp(0.62 - 0.03 * Math.min(v, 2), Math.max(0.19, 0.42 - 0.03 * v), g);
  const S = (v * beta) / freq;
  out.g = g; out.freq = freq; out.beta = beta; out.S = S;
  out.zF = -S * lerp(0.46, 0.28, g);
  out.p0 = lerp(0.28, 0.06, g);
  out.p1 = lerp(0.62, 0.85, g) * smooth(0.05, 0.6, v);
  out.u2 = lerp(0.5, 0.35, g);
  out.lift = lerp(0.05 + 0.025 * Math.min(v, 2), 0.17 + 0.034 * Math.min(v, 9), g) * smooth(0.0, 0.5, v);
  return out;
}
/** Ankle (y, z) + world foot pitch for a foot at gait phase ph (0..1, 0 = heel strike). */
function footStance(u, P, out) {
  const zr = P.zF + P.S * u;
  const p = P.p0 * (1 - smooth(0, 0.22, u)) - P.p1 * Math.pow(smooth(P.u2, 1, u), 1.3);
  const cp = Math.cos(p), sp = Math.sin(p);
  if (p >= 0) { out[0] = ANKLE_Y * cp + HEEL_Z * sp; out[1] = zr + HEEL_Z + ANKLE_Y * sp - HEEL_Z * cp; }
  else { out[0] = ANKLE_Y * cp - BALL_Z * sp; out[1] = zr - BALL_Z + ANKLE_Y * sp + BALL_Z * cp; }
  out[2] = p;
  return out;
}
const _fa = [0, 0, 0], _fb = [0, 0, 0];
function footAt(ph, P, out) {
  if (ph < P.beta) return footStance(ph / P.beta, P, out);
  const u = (ph - P.beta) / (1 - P.beta);
  footStance(1, P, _fa); footStance(0, P, _fb);
  const g = P.g;
  // C1 Hermite in z: the foot leaves and meets the ground with the stance's ground-relative velocity (no drag)
  const m = (P.S * (1 - P.beta)) / P.beta, u2 = u * u, u3 = u2 * u;
  // walk: symmetric arc; run: early heel kick (beta-shaped, zero slope at lift-off so the knee never snaps)
  const lift = lerp(Math.sin(Math.PI * u), Math.pow(u, 1.3) * Math.pow(1 - u, 1.8) / 0.1215, g) * P.lift;
  out[0] = lerp(_fa[0], _fb[0], smooth(0.2, 1, u)) + lift;
  out[1] = (2 * u3 - 3 * u2 + 1) * _fa[1] + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * _fb[1] + (u3 - u2) * m;
  out[2] = lerp(_fa[2], _fb[2], smooth(0.25, 0.95, u)) + (1 - g) * 0.12 * Math.sin(Math.PI * u) - g * 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.4));
  return out;
}

// --------------------------------------------------------------------------------------------
// procedural animator
// --------------------------------------------------------------------------------------------
const STATES = new Set(['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land', 'drive', 'sit', 'flee', 'knocked', 'getup', 'wave', 'phone', 'enterCar', 'exitCar']);
const LOCO = new Set(['walk', 'run', 'sprint']);
const DEFAULT_SPEED = { walk: 1.4, run: 4, sprint: 7, flee: 5.5 };
const FADE = { idle: 0.25, loco: 0.22, flee: 0.2, jump: 0.1, fall: 0.25, land: 0.12, drive: 0.25, sit: 0.35, knocked: 0.12, getup: 0.4, wave: 0.3, phone: 0.35, enterCar: 0.15, exitCar: 0.1 };
const LAND_T = 0.42, GETUP_T = 1.2, CAR_T = 0.6;

class Animator {
  constructor(D, look, bones, scale) {
    this.D = D; this.look = look; this.bones = bones; this.scale = scale;
    this.tgt = new Pose(); this.from = new Pose(); this.out = new Pose();
    this.P = {}; this._fl = [0, 0, 0]; this._fr = [0, 0, 0];
    this.phase = look.idlePhase % 1; this.t = look.idlePhase; this.vs = 0;
    this.req = null; this.key = null; this.st = 0; this.fade = 1; this.fadeDur = 0.2; this.lying = 0; this.steer = 0;
    this.mod = {};
  }

  // ---- generators ------------------------------------------------------------------------
  headLook(pose, lean, extraYaw = 0, extraPitch = 0) {
    const t = this.t;
    const ly = 0.33 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.3) + extraYaw;
    const lp = 0.05 * Math.sin(t * 0.29 + 0.7) + extraPitch;
    pose.set(B.neck, lean * 0.3 + lp * 0.4, ly * 0.4, 0);
    pose.set(B.head, lean * 0.35 + lp * 0.6, ly * 0.6, 0);
  }

  idle(pose, mod = {}) {
    const D = this.D, t = this.t;
    pose.reset();
    const br = Math.sin(t * 1.6);
    const shift = Math.sin(t * 0.31) * 0.8 + Math.sin(t * 0.13) * 0.2;
    const drop = mod.drop || 0, lean = mod.lean || 0, yaw = mod.yaw || 0;
    pose.p[0] = 0.014 * shift;
    pose.p[1] = HIPS_Y - 0.012 - drop;
    pose.p[2] = drop * 0.3;
    pose.set(B.hips, -lean * 0.45, yaw + 0.03 * Math.sin(t * 0.19), -0.025 * shift);
    pose.set(B.spine, -lean * 0.3 + 0.01 * br, -yaw * 0.15, 0.012 * shift);
    pose.set(B.chest, -lean * 0.25 + 0.012 * br - 0.015, -yaw * 0.1, 0.01 * shift);
    this.headLook(pose, lean, mod.headYaw || 0, mod.headPitch || 0);
    pose.add(B.head, 0, 0, 0.015 * shift);
    const abd = 0.1 + (D.W - 1) * 0.6 + 0.008 * br;
    const af = mod.armsFwd || 0;
    for (const side of [-1, 1]) {
      const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
      pose.set(ua, 0.03 + af * 0.8 + 0.02 * Math.sin(t * 0.5 + side), side * 0.05, side * (abd + af * 0.25));
      pose.set(ua + 1, 0.14 + af * 0.25, 0, 0);
      pose.set(ua + 2, 0.08, 0, -side * 0.06);
    }
    for (const side of [-1, 1]) {
      let fx = side * (D.hipX + 0.02), fy = ANKLE_Y, fz = (side < 0 ? -0.035 : 0.03) + (mod.feetZ || 0), pitch = 0;
      if (mod.step && side === mod.stepSide) { fy += 0.22 * mod.step; fx += side * 0.12 * mod.step; fz -= 0.08 * mod.step; pitch = -0.3 * mod.step; }
      solveLeg(pose, D, side, fx, fy, fz, pitch, -side * 0.1);
    }
  }

  loco(pose, v, vWorld, turn, mod = {}, flee = false) {
    const D = this.D, t = this.t, ph = this.phase;
    const P = gaitParams(v, this.P), g = P.g;
    pose.reset();
    const mv = smooth(0.0, 0.5, v);                     // 0 = standing still
    P.p0 *= smooth(0.05, 0.5, v);
    const a1 = TAU * (ph - P.beta / 2);
    const s1 = Math.sin(a1), c1 = Math.cos(a1), c2 = Math.cos(2 * a1);
    const lean = lerp(0.05, 0.13 + 0.014 * Math.min(v, 9), g) * mv + (mod.lean || 0);
    const bank = clamp((vWorld * turn) / 9.81 * 0.6, -0.3, 0.3) * lerp(0.6, 1, g) * mv;   // lean into turns
    const twist = lerp(0.12, 0.09, g) * s1 * mv;
    const sway = -lerp(0.022, 0.006, g) * c1 * mv;
    pose.p[0] = sway - Math.sin(bank) * 0.9;
    pose.set(B.hips, -lean * 0.3, twist, -lerp(0.045, 0.025, g) * c1 * mv + bank);
    let hy = HIPS_Y - 0.012 - lerp(0, 0.035 + 0.005 * Math.min(v, 8), g) + lerp(0.012, -0.03, g) * c2 * mv - (mod.drop || 0);
    const hyWanted = hy, maxDrop = lerp(0.09, 0.035, g);   // beyond this the stance foot may slip a little instead of crouching
    // feet targets
    const fx = D.hipX + 0.012 - 0.022 * g * mv;
    const feet = [footAt(ph % 1, P, this._fl), footAt((ph + 0.5) % 1, P, this._fr)];
    const Lmax = (THIGH + SHIN) * 0.985;
    const land = footStance(0, P, [0, 0, 0]);
    const limit = (side, fy, fz, c) => {
      if (c <= 0) return;
      const jz = -Math.sin(twist) * side * D.hipX, jx = pose.p[0] + side * D.hipX;
      const dz = fz - jz, dx = side * fx - jx;
      const jmax = fy + Math.sqrt(Math.max(0.01, Lmax * Lmax - dz * dz - dx * dx));
      hy = smin(hy, jmax - HIP_DY + (1 - c) * 0.4, 0.03);
    };
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1, f = feet[k];
      const fph = (ph + (k ? 0.5 : 0)) % 1;
      // reach constraints: the planted foot at full strength; a swinging foot fades out after toe-off and its
      // landing spot fades in during the late swing, so the pelvis dips smoothly into double support (no pops)
      if (fph < P.beta) limit(side, f[0], f[1], 1);
      else {
        const us = (fph - P.beta) / (1 - P.beta);
        limit(side, f[0], f[1], 1 - smooth(0, 0.3, us));
        limit(side, land[0], land[1], smooth(0.3, 1, us));
      }
    }
    pose.p[1] = Math.max(hy, hyWanted - maxDrop);
    // torso
    const br = Math.sin(t * lerp(1.6, 3.2, g));
    const look = clamp(turn * 0.2, -0.35, 0.35);
    pose.set(B.spine, -lean * 0.35, -twist * 0.5, -bank * 0.3);
    pose.set(B.chest, -lean * 0.35 + 0.01 * br, -twist * 0.9, -bank * 0.2);
    pose.set(B.neck, lean * 0.4, twist * 0.3 + look * 0.4, bank * 0.25);
    pose.set(B.head, lean * 0.45 - g * 0.02 * c2, twist * 0.3 + look * 0.6, bank * 0.25);
    // arms (counter-swing)
    const amp = Math.min(1.0, lerp(0.22 + 0.13 * Math.min(v, 2.2), 0.38 + 0.065 * v, g)) * mv;
    const abd = 0.1 + (D.W - 1) * 0.6 + 0.08 * g + (mod.armsOut || 0);
    const raised = flee && this.look.fleeLook < 0.5;
    for (const side of [-1, 1]) {
      const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
      const fwd = side < 0 ? s1 : -s1;
      if (raised) {
        const w = Math.sin(TAU * 1.9 * t + (side > 0 ? 0 : 2.1));
        pose.set(ua, 2.3 + 0.4 * w, side * 0.15, side * (0.5 + 0.2 * w));
        pose.set(ua + 1, 1.15 + 0.5 * w, 0, 0);
        pose.set(ua + 2, 0.2, 0, 0);
      } else {
        const a = flee ? amp * 1.25 : amp;
        pose.set(ua, a * fwd + lerp(0.02, 0.1, g) * mv, 0, side * (abd - 0.08 * g * Math.max(0, fwd)));
        pose.set(ua + 1, lerp(0.16 + 0.24 * Math.max(0, fwd) * mv, 1.3 + 0.22 * fwd, g), 0, 0);
        pose.set(ua + 2, lerp(0.06, 0.2, g), 0, -side * 0.05);
      }
    }
    if (flee) {
      const x = t * 0.42 + this.look.fleeLook * 3, u = x % 1, dir = Math.floor(x) % 2 ? 1 : -1;
      const pulse = smooth(0.66, 0.74, u) * (1 - smooth(0.9, 0.98, u));
      pose.add(B.chest, 0, 0.35 * pulse * dir, 0);
      pose.add(B.neck, 0.08 * pulse, 0.5 * pulse * dir, 0);
      pose.add(B.head, 0.1 * pulse, 0.75 * pulse * dir, 0);
    }
    // legs
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1, f = feet[k];
      solveLeg(pose, D, side, side * fx, f[0], f[1], f[2], -side * 0.08);
    }
  }

  seated(pose, drive, steer) {
    const D = this.D, t = this.t;
    pose.reset();
    pose.p[1] = HUMAN_SEAT_HIP_Y / this.scale;
    const br = Math.sin(t * 1.6);
    pose.set(B.hips, drive ? 0.14 : 0.04, 0, 0);
    pose.set(B.spine, (drive ? -0.08 : -0.03) + 0.008 * br, 0, 0);
    pose.set(B.chest, (drive ? -0.1 : -0.04) + 0.01 * br, drive ? steer * 0.06 : 0, 0);
    this.headLook(pose, 0, drive ? steer * 0.3 - 0.1 * Math.sin(t * 0.11) : 0, drive ? 0.03 : 0);
    if (drive) { pose.set(B.head, pose.r[B.head * 3] * 0.5, pose.r[B.head * 3 + 1] * 0.5, -steer * 0.05); }
    for (const side of [-1, 1]) {
      const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
      if (drive) {
        const st = side * steer;                                 // steer > 0 = turning left: left hand down, right hand up
        pose.set(ua, 0.8 + 0.28 * st, side * 0.15, side * (0.22 - 0.06 * st));
        pose.set(ua + 1, 0.8 - 0.15 * st, 0, 0);
        pose.set(ua + 2, -0.15, 0, -side * 0.25);
        solveLeg(pose, D, side, side * (D.hipX + 0.04), ANKLE_Y + 0.03, -0.6, side < 0 ? 0.1 : 0.25, -side * 0.05);
      } else {
        pose.set(ua, 0.35, side * 0.35, side * 0.06);
        pose.set(ua + 1, 1.1, 0, 0);
        pose.set(ua + 2, 0.15, 0, -side * 0.1);
        solveLeg(pose, D, side, side * (D.hipX + 0.035), ANKLE_Y, -0.47, 0, -side * 0.1);
      }
    }
  }

  jump(pose, v, st) {
    const D = this.D;
    const crouch = smooth(0, 0.07, st) * (1 - smooth(0.09, 0.2, st));
    const tuck = smooth(0.12, 0.34, st);
    pose.reset();
    pose.p[1] = HIPS_Y - 0.012 - 0.14 * crouch;
    pose.p[2] = 0.04 * crouch;
    pose.set(B.hips, -0.25 * crouch, 0, 0);
    pose.set(B.spine, -0.2 * crouch + 0.05 * tuck, 0, 0);
    pose.set(B.chest, -0.1 * crouch + 0.05 * tuck, 0, 0);
    pose.set(B.neck, 0.2 * crouch, 0, 0);
    pose.set(B.head, 0.15 * crouch - 0.1 * tuck, 0, 0);
    const moving = smooth(0.5, 2, v);
    for (const side of [-1, 1]) {
      const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
      pose.set(ua, -0.6 * crouch + tuck * (0.75 + (side < 0 ? 0.45 : -0.35) * moving), 0, side * (0.2 + 0.45 * tuck));
      pose.set(ua + 1, 0.3 + 0.75 * tuck, 0, 0);
      pose.set(ua + 2, 0.1, 0, 0);
      const lead = side < 0 ? 1 : -0.4;
      const fy = ANKLE_Y + tuck * (0.3 + 0.08 * lead * moving);
      const fz = (side < 0 ? -0.02 : 0.02) + tuck * (0.02 - 0.12 * lead * moving);
      solveLeg(pose, D, side, side * (D.hipX + 0.02), fy, fz, -0.45 * tuck, -side * 0.08);
    }
  }

  fall(pose) {
    const D = this.D, t = this.t;
    pose.reset();
    pose.p[1] = HIPS_Y - 0.03;
    pose.set(B.hips, 0.12 + 0.06 * Math.sin(t * 3), 0.12 * Math.sin(t * 2.3), 0.06 * Math.sin(t * 2.9));
    pose.set(B.spine, 0.12, 0, 0.05 * Math.sin(t * 3.7));
    pose.set(B.chest, 0.1 + 0.06 * Math.sin(t * 5), 0.1 * Math.sin(t * 4.1), 0);
    pose.set(B.neck, -0.2, 0, 0);
    pose.set(B.head, -0.25, 0.25 * Math.sin(t * 1.7), 0);
    for (const side of [-1, 1]) {
      const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
      const w = t * 7 + (side > 0 ? 0 : 2.4);
      pose.set(ua, 0.5 + 1.1 * Math.sin(w), 0.3 * side, side * (1.35 + 0.35 * Math.sin(t * 5.3 + side)));
      pose.set(ua + 1, 0.5 + 0.4 * Math.sin(w * 0.8 + 1), 0, 0);
      pose.set(ua + 2, 0.3 * Math.sin(w + 1), 0, 0);
      const lw = t * 6.5 + (side > 0 ? Math.PI : 0);
      solveLeg(pose, D, side, side * (D.hipX + 0.1), ANKLE_Y + 0.2 + 0.14 * Math.sin(lw), -0.05 + 0.2 * Math.cos(lw), -0.4, -side * 0.15);
    }
  }

  knocked(pose, st, lying) {
    const t = this.t, seed = this.look.fleeLook * 10;
    const a = (Math.exp(-1.6 * st) * 0.9 + 0.04) * (1 - 0.6 * lying);   // flail amplitude settles
    const w = (i, f) => Math.sin(t * f + seed + i * 1.7);
    const arch = 0.25 * (1 - lying);
    pose.reset();
    pose.p[1] = lerp(HIPS_Y, 0.13, lying);
    pose.p[2] = lerp(0, -0.05, lying);
    pose.set(B.hips, lerp(0.15, Math.PI / 2, lying) + 0.2 * a * w(0, 7), 0.25 * a * w(1, 5), 0.2 * a * w(2, 6));
    pose.set(B.spine, arch + 0.25 * a * w(3, 8), 0.2 * a * w(4, 6), 0.2 * a * w(5, 7) + 0.1 * lying * Math.sin(seed));
    pose.set(B.chest, arch * 0.6 + 0.2 * a * w(6, 9), 0.15 * a * w(7, 6), 0.1 * a * w(8, 8));
    pose.set(B.neck, 0.2 * (1 - lying) + 0.3 * a * w(9, 10), 0.3 * a * w(10, 7), 0.15);
    pose.set(B.head, 0.3 * (1 - lying) - 0.15 * lying + 0.3 * a * w(11, 9), 0.35 + 0.3 * a * w(12, 6), 0.25 * Math.sin(seed * 3));
    for (const side of [-1, 1]) {
      const o = side < 0 ? 0 : 3, k = side < 0 ? 0 : 7;
      pose.set(B.upperArm_L + o, lerp(side < 0 ? 0.5 : -0.3, -0.12, lying) + 0.9 * a * w(13 + k, 11), 0.3 * side * (1 - lying), side * (1.25 + 0.25 * Math.sin(seed + side)) + 0.6 * a * w(14 + k, 9));
      pose.set(B.lowerArm_L + o, (0.35 + 0.35 * Math.abs(Math.sin(seed * 2 + side))) * (1 - 0.6 * lying) + 0.7 * a * w(15 + k, 12), 0, 0);
      pose.set(B.hand_L + o, 0.3 * a * w(16 + k, 10), 0, 0);
      pose.set(B.upperLeg_L + o, lerp(side < 0 ? 0.45 : -0.05, side < 0 ? 0.25 : 0.0, lying) + 0.7 * a * w(17 + k, 10), 0, side * 0.3 + 0.3 * a * w(18 + k, 8));
      pose.set(B.lowerLeg_L + o, -lerp(side < 0 ? 0.8 : 0.3, side < 0 ? 0.5 : 0.1, lying) - 0.6 * a * Math.abs(w(19 + k, 9)), 0, 0);
      pose.set(B.foot_L + o, -0.45, 0, 0);
    }
  }

  wave(pose) {
    this.idle(pose, { headYaw: 0.1, headPitch: 0.05 });
    const t = this.t;
    pose.set(B.upperArm_R, 0.25, 0.1, 1.45);
    pose.set(B.lowerArm_R, 0.3, 0, 1.15 + 0.38 * Math.sin(t * 9));
    pose.set(B.hand_R, 0, 0, 0.1 * Math.sin(t * 9 - 0.8));
    pose.add(B.head, 0, 0, -0.08);
  }

  phone(pose) {
    const call = this.look.phoneMode === 'call';
    this.idle(pose, call ? { headYaw: -0.1 } : { headPitch: -0.55 });
    if (call) {
      pose.set(B.upperArm_R, 0.2, -0.3, 0.45);
      pose.set(B.lowerArm_R, 2.55, 0, 0);
      pose.set(B.hand_R, -0.1, -0.2, -0.25);
      pose.add(B.head, 0, 0, 0.1);
    } else {
      pose.set(B.upperArm_R, 0.35, 0.45, 0.1);
      pose.set(B.lowerArm_R, 1.5, 0, 0);
      pose.set(B.hand_R, 0.15, -1.25, 0);
      pose.set(B.upperArm_L, 0.3, -0.4, -0.08);
      pose.set(B.lowerArm_L, 1.45, 0, 0);
      pose.set(B.hand_L, 0.15, 1.1, 0);
      pose.add(B.neck, -0.15, 0, 0);
    }
    pose.prop = 1;
  }

  // ---- main update ------------------------------------------------------------------------
  update(dt, s) {
    dt = clamp(+dt || 0, 0, 0.1);
    let state = s && s.state; if (!STATES.has(state)) state = 'idle';
    const speedW = Math.max(0, s && typeof s.speed === 'number' ? s.speed : DEFAULT_SPEED[state] ?? 0);
    const turn = (s && s.turn) || 0;
    let changed = false;
    if (state !== this.req) { changed = this.req !== null; this.req = state; this.st = 0; } else this.st += dt;
    this.t += dt;
    this.vs += (speedW - this.vs) * Math.min(1, dt * 5);
    if (this.key === null) this.vs = speedW;
    const v = this.vs / this.scale, st = this.st;
    this.lying += ((s && typeof s.lying === 'number' ? clamp(s.lying, 0, 1) : 0) - this.lying) * Math.min(1, dt * 3);
    const steerT = s && typeof s.steer === 'number' ? clamp(s.steer, -1, 1) : clamp(turn * 0.6, -1, 1);
    this.steer += (steerT - this.steer) * Math.min(1, dt * 6);

    let key = LOCO.has(state) ? 'loco' : state;
    if (state === 'idle' && speedW > 0.25) key = 'loco';            // tolerate 'idle' while drifting
    if (state === 'land' && st > LAND_T) key = speedW > 0.3 ? 'loco' : 'idle';
    if (state === 'getup' && st > GETUP_T) key = speedW > 0.3 ? 'loco' : 'idle';
    if (key !== this.key || (changed && key === 'loco')) {       // walk <-> run <-> sprint also cross-fade
      if (this.key === null) this.fade = 1;
      else { this.from.copy(this.out); this.fade = 0; }
      this.fadeDur = FADE[key] ?? 0.2; this.key = key;
    }
    const moving = key === 'loco' || key === 'flee' || (key === 'land' && speedW > 0.3);
    if (moving) { gaitParams(Math.max(v, key === 'flee' ? 0.5 : 0), this.P); this.phase = (this.phase + this.P.freq * dt) % 1; }

    const T = this.tgt, side = s && s.side === -1 ? -1 : 1;
    switch (key) {
      case 'loco': this.loco(T, v, speedW, turn); break;
      case 'flee': this.loco(T, Math.max(v, 0.5), speedW, turn, {}, true); break;
      case 'idle': this.idle(T); break;
      case 'land': {
        const d = st < 0.06 ? st / 0.06 : 1 - smooth(0.06, LAND_T, st);
        const mod = { drop: 0.15 * d, lean: 0.25 * d, armsOut: 0.2 * d, armsFwd: 0.25 * d };
        if (speedW > 0.3) this.loco(T, v, speedW, turn, mod); else this.idle(T, mod);
        break;
      }
      case 'jump': this.jump(T, v, st); break;
      case 'fall': this.fall(T); break;
      case 'drive': this.seated(T, true, this.steer); break;
      case 'sit': this.seated(T, false, 0); break;
      case 'knocked': this.knocked(T, st, this.lying); break;
      case 'getup': {
        const e = 1 - smooth(0.35, GETUP_T, st);
        this.idle(T, { drop: 0.44 * e, lean: 0.95 * e, armsFwd: 0.9 * e, headPitch: -0.2 * e });
        break;
      }
      case 'wave': this.wave(T); break;
      case 'phone': this.phone(T); break;
      case 'enterCar':
      case 'exitCar': {
        const e = key === 'enterCar' ? smooth(0, CAR_T, st) : 1 - smooth(0, CAR_T, st);
        const step = key === 'enterCar' ? smooth(0.28, CAR_T, st) : 1 - smooth(0, CAR_T * 0.6, st);
        this.idle(T, { drop: 0.16 * e, lean: 0.6 * e, yaw: -side * 0.75 * e, headPitch: -0.3 * e, step, stepSide: side });
        const ua = side < 0 ? B.upperArm_L : B.upperArm_R;
        T.add(ua, 1.0 * e, 0, side * 0.35 * e);
        T.add(ua + 1, 0.4 * e, 0, 0);
        break;
      }
      default: this.idle(T);
    }
    this.fade = Math.min(1, this.fade + dt / Math.max(1e-3, this.fadeDur));
    if (this.fade >= 1) this.out.copy(T); else this.out.blend(this.from, T, smooth(0, 1, this.fade));
    this.apply(this.out);
  }

  apply(p) {
    const bs = this.bones;
    for (let i = 0; i < NB; i++) bs[i].rotation.set(p.r[i * 3], p.r[i * 3 + 1], p.r[i * 3 + 2]);
    bs[0].position.set(p.p[0], p.p[1], p.p[2]);
    const ps = Math.max(1e-4, p.prop);
    bs[B.prop].scale.set(ps, ps, ps);
  }
}

// --------------------------------------------------------------------------------------------
// public API
// --------------------------------------------------------------------------------------------
let SHARED_MAT = null;
// per-face surface class (baked per human from region + colour): 0 cloth, 1 skin, 2 hair, 3 leather / rubber, 4 denim
const CLS_CLOTH = 0, CLS_SKIN = 1, CLS_HAIR = 2, CLS_LEATHER = 3, CLS_DENIM = 4;
const HUMAN_FRAG = `
float hCl = mod(vCls, 8.0);
float hBeard = floor(vCls / 8.0 + 0.01);
float hBump = 0.0;
float hSkin = step(0.5, hCl) * step(hCl, 1.5);
float hHair = step(1.5, hCl) * step(hCl, 2.5);
float hLeather = step(2.5, hCl) * step(hCl, 3.5);
float hDenim = step(3.5, hCl);
float hCloth = clamp(1.0 - hSkin - hHair - hLeather, 0.0, 1.0);
float hRough = mix(0.86, 0.9, hDenim);
{
  // cloth: long soft creases running mostly vertically + weave, darker toward the crease valleys
  float folds = hn(vHp * vec3(22.0, 5.0, 22.0)) * 0.6 + hn(vHp * vec3(48.0, 11.0, 48.0)) * 0.4;
  float weave = hn(vHp * 420.0);
  vec3 cloth = diffuseColor.rgb * (0.84 + 0.3 * folds) * (0.94 + 0.12 * weave) * (0.92 + 0.08 * smoothstep(0.15, 0.6, folds));
  if (hDenim > 0.5) {
    float tw = sin(dot(vHp, vec3(700.0, 700.0, 0.0)) + 3.0 * hn(vHp * 90.0));
    float wear = smoothstep(0.45, 0.8, hn(vHp * vec3(14.0, 4.0, 14.0))) * smoothstep(0.0, 0.03, 0.02 - vHp.z);
    cloth *= 0.92 + 0.08 * tw;
    cloth = mix(cloth, cloth * vec3(1.45, 1.5, 1.6), 0.45 * wear);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, cloth, hCloth);
  hBump = hCloth * folds * 0.007;
  if (hLeather > 0.5) { diffuseColor.rgb *= 0.9 + 0.12 * hn(vHp * 160.0); hRough = 0.5; }
  if (hHair > 0.5) {
    float st = hn(vHp * vec3(300.0, 26.0, 300.0)) * 0.65 + hn(vHp * vec3(900.0, 70.0, 900.0)) * 0.35;
    diffuseColor.rgb *= 0.62 + 0.62 * st;
    hRough = 0.72;
    hBump = st * 0.003;
  }
  if (hSkin > 0.5) {
    vec3 sk = diffuseColor.rgb;
    sk *= 0.965 + 0.06 * hn(vHp * 700.0);                                        // pores
    sk *= mix(vec3(1.0), vec3(1.05, 0.96, 0.95), 0.7 * hn(vHp * 38.0));          // uneven tone / redness
    hRough = 0.56;
    if (vHf.w < -0.97) sk *= 1.0 - 0.38 * smoothstep(1.5, 1.6, vHp.y) * smoothstep(0.02, -0.04, vHp.z);   // under the jaw
    if (vHf.z > 0.12) {
      float fx = vHf.x, fy = vHf.y, ax = abs(fx);
      sk *= 1.0 - 0.2 * g2(vec2((ax - 0.37) / 0.2, (fy - 0.05) / 0.12));        // eye sockets
      sk *= mix(vec3(1.0), vec3(1.04, 0.93, 0.92), g2(vec2((ax - 0.5) / 0.14, (fy + 0.24) / 0.12)));   // cheeks
      // eye: almond between the lids, iris + pupil, shadow under the upper lid, lash line
      float ex = (ax - 0.385) / 0.16, ey = fy - 0.035 + 0.006 * ex;
      float lid = 0.05 * max(0.0, 1.0 - ex * ex);
      float aa = fwidth(fy) + 1e-4;
      float inEye = smoothstep(aa, -aa, abs(ey) - lid) * step(abs(ex), 1.0);
      float ir = length(vec2(ax - 0.39, (fy - 0.03) * 0.85));
      vec3 eyeC = vec3(0.62, 0.6, 0.57);
      eyeC = mix(eyeC, vec3(0.09, 0.055, 0.035), smoothstep(0.072 + aa, 0.072 - aa, ir));
      eyeC = mix(eyeC, vec3(0.012), smoothstep(0.03 + aa, 0.03 - aa, ir));
      eyeC *= (0.7 + 0.3 * (1.0 - ex * ex)) * mix(1.0, 0.55, smoothstep(lid * 0.2, lid, ey));
      sk = mix(sk, eyeC, inEye);
      float lash = smoothstep(0.016 + aa, 0.004, abs(ey - lid - 0.004)) * smoothstep(1.15, 0.85, abs(ex));
      sk = mix(sk, vec3(0.025, 0.018, 0.015), 0.85 * lash);
      sk *= 1.0 - 0.12 * smoothstep(0.03, 0.0, abs(ey + lid + 0.01)) * step(abs(ex), 1.0);   // lower lid crease
      hRough = mix(hRough, 0.12, inEye);
      // brows: arched band, thicker toward the nose
      float bx = (ax - 0.36) / 0.25;
      float by = fy - (0.2 + 0.04 * (1.0 - bx * bx));
      float bth = mix(0.03, 0.015, clamp(bx * 0.5 + 0.5, 0.0, 1.0));
      float brow = smoothstep(1.0, 0.75, abs(bx)) * smoothstep(bth + aa, bth * 0.4, abs(by)) * (0.75 + 0.25 * hn(vHp * vec3(1800.0, 300.0, 1800.0)));
      sk = mix(sk, sk * 0.16 + vec3(0.018, 0.012, 0.008), 0.9 * brow);
      // nose: nostrils + shadow under the tip
      sk *= 1.0 - 0.6 * g2(vec2((ax - 0.07) / 0.035, (fy + 0.375) / 0.022));
      sk *= 1.0 - 0.18 * g2(vec2(fx / 0.1, (fy + 0.41) / 0.04));
      // mouth: upper + lower lip, dark line between, soft shadow under the lower lip
      float mx = fx / 0.29, mc = max(0.0, 1.0 - mx * mx), my = fy + 0.6 - 0.02 * mx * mx;
      float lips = step(abs(mx), 1.0) * (smoothstep(-aa, aa, my) * smoothstep(0.05 * mc + aa, 0.05 * mc - aa, my)
                 + smoothstep(aa, -aa, my) * smoothstep(0.065 * mc + aa, 0.065 * mc - aa, -my));
      sk = mix(sk, sk * vec3(0.9, 0.6, 0.58), 0.85 * lips);
      sk *= 1.0 - 0.6 * smoothstep(0.012 + aa, 0.0, abs(my)) * smoothstep(1.05, 0.8, abs(mx));
      sk *= 1.0 - 0.15 * g2(vec2(fx / 0.2, (fy + 0.72) / 0.035));
      hRough = mix(hRough, 0.4, lips);
      if (hBeard > 0.5) {
        float bsd = -(fy + 0.33 - 0.3 * ax * ax) - 0.5 * g2(vec2(fx / 0.16, (fy + 0.3) / 0.1)) - 0.8 * lips;
        float bn = hn(vHp * vec3(2600.0, 1800.0, 2600.0));
        float bm = smoothstep(-0.01, 0.06, bsd + 0.04 * (hn(vHp * 160.0) - 0.5)) * smoothstep(0.98, 0.75, ax);
        if (hBeard < 1.5) sk = mix(sk, sk * mix(vec3(1.0), vHc * 1.6 + 0.08, 0.6), 0.55 * bm * (0.5 + 0.5 * bn));
        else { float bst = hn(vHp * vec3(500.0, 60.0, 500.0)); sk = mix(sk, vHc * (0.6 + 0.6 * bst), 0.92 * bm); hBump += bm * bst * 0.002; hRough = mix(hRough, 0.75, bm); }
      }
    }
    // scalp hair: soft, slightly noisy hairline (skin shows through at the edge), strand streaks
    if (vHf.w > -0.97) {
      float hsd = vHf.w + 0.06 * (hn(vHp * vec3(140.0, 220.0, 140.0)) - 0.5);
      float hm = smoothstep(-0.015, 0.075, hsd);
      float st = hn(vHp * vec3(300.0, 26.0, 300.0)) * 0.65 + hn(vHp * vec3(900.0, 70.0, 900.0)) * 0.35;
      sk = mix(sk, vHc * (0.62 + 0.62 * st), hm);
      hRough = mix(hRough, 0.72, hm);
      hBump += hm * st * 0.003;
    }
    diffuseColor.rgb = sk;
  }
}`;
function sharedMaterial() {
  if (!SHARED_MAT) {
    // One material for every human. The fragment shader branches on the baked surface class: cloth gets folds, weave and
    // sheen; skin gets pores, blotches, a softer roughness and the painted face (sockets, eyes with iris + lash line, brows,
    // nostrils, lips); hair gets strand streaks; shoes/belts read as leather; jeans get a twill + wear.
    SHARED_MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.0, sheen: 0.55, sheenRoughness: 0.7, sheenColor: 0xd8d4cc });
    SHARED_MAT.name = 'human';
    SHARED_MAT.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 hface;
attribute vec4 hcls;
varying vec3 vHp;
varying vec4 vHf;
varying float vCls;
varying vec3 vHc;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vHp = position; vHf = hface; vCls = hcls.x; vHc = hcls.yzw / 255.0;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vHp;
varying vec4 vHf;
varying float vCls;
varying vec3 vHc;
float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float hn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hh(i), hh(i+vec3(1,0,0)), f.x), mix(hh(i+vec3(0,1,0)), hh(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hh(i+vec3(0,0,1)), hh(i+vec3(1,0,1)), f.x), mix(hh(i+vec3(0,1,1)), hh(i+vec3(1,1,1)), f.x), f.y), f.z); }
float g2(vec2 d){ return exp(-dot(d, d)); }`)
        .replace('#include <color_fragment>', '#include <color_fragment>' + HUMAN_FRAG)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(hBump) * r1 + dFdy(hBump) * r2);
  normal = normalize(abs(det) * normal - grad);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = hRough;`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor *= hCloth + 0.35 * hSkin;
#endif`);
    };
    SHARED_MAT.customProgramCacheKey = () => 'human-cloth-v4';
  }
  return SHARED_MAT;
}
const SHARED_ATTRS = ['position', 'normal', 'skinIndex', 'skinWeight', 'hface'];

/**
 * Create a procedural human. See the header of this file for the frame; full option list:
 * { seed, skin, shirt, pants, shoes, hair (0xRRGGBB or css), hairStyle: 'short'|'long'|'bun'|'bald'|'cap',
 *   build: 'slim'|'average'|'heavy', height (m), outfit: 'tshirt'|'hoodie'|'jacket'|'suit'|'dress'|'police',
 *   gender: 'm'|'f' (cosmetic), castShadow = true, receiveShadow = false }
 * Missing fields are derived deterministically from `seed`.
 */
export function createHuman(opts = {}) {
  // realistic Rocketbox humans (src/game/peds/realhuman.js) unless disabled (?peds=v1) or opts.procedural; the player
  // (explicit look, no crowd style) gets the fixed player avatar
  if (!opts.procedural && realAvailable()) return createRealHuman({ ...opts, player: opts.player ?? !opts.style });
  return createProceduralHuman(opts);
}

function createProceduralHuman(opts = {}) {
  const look = resolveLook(opts);
  const entry = acquireVariant(look.build, look.gender, look.hairStyle, look.outfit);
  const built = entry.built, D = built.dims;
  const scale = look.height / REF_H;

  const geo = new THREE.BufferGeometry();
  for (const n of SHARED_ATTRS) geo.setAttribute(n, built.geometry.getAttribute(n));
  geo.setAttribute('color', new THREE.BufferAttribute(bakeColors(built, look), 3, true));
  geo.setAttribute('hcls', new THREE.BufferAttribute(bakeClasses(built, look), 4));
  geo.name = built.geometry.name;

  const root = new THREE.Object3D(); root.name = 'human';
  const rig = new THREE.Object3D(); rig.name = 'humanRig';
  root.add(rig);
  const bones = makeBones(D);
  const mesh = new THREE.SkinnedMesh(geo, sharedMaterial());
  mesh.name = 'humanMesh';
  mesh.add(bones[0]);
  rig.add(mesh);
  rig.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  rig.scale.setScalar(scale);
  // generous fixed bounds (mesh space) so culling never needs a per-frame skinned recompute
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.45);
  mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1.3, -0.5, -1.3), new THREE.Vector3(1.3, 2.3, 1.3));
  geo.boundingSphere = mesh.boundingSphere.clone();
  geo.boundingBox = mesh.boundingBox.clone();
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = !!opts.receiveShadow;

  const anim = new Animator(D, look, bones, scale);
  anim.update(0, { state: 'idle', speed: 0 });

  let disposed = false;
  const human = {
    root, mesh, skeleton, bones,
    height: look.height,
    scale,
    look,                                 // resolved appearance (seed, outfit, hairStyle, build, gender, colours)
    seatHipY: HUMAN_SEAT_HIP_Y,
    get state() { return anim.req; },
    _anim: anim,                          // debug/tooling only (preview page); not part of the API
    update(dt, s = {}) { if (!disposed) anim.update(dt, s); },
    setVisible(v) { root.visible = !!v; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (root.parent) root.parent.remove(root);
      skeleton.dispose();
      entry.refs--;
      if (entry.refs <= 0) {
        GEO_CACHE.delete(entry.key);
        geo.dispose();                   // last user: frees the shared buffers as well
        built.geometry.dispose();
      } else {
        for (const n of SHARED_ATTRS) geo.deleteAttribute(n);   // keep the shared GPU buffers alive
        geo.dispose();
      }
    },
  };
  return human;
}

/** Debug / tooling: triangle count of a variant and cache stats. */
export function humanStats() {
  const out = [];
  for (const [key, e] of GEO_CACHE) out.push({ key, tris: e.built.tris, refs: e.refs });
  return out;
}

/**
 * Headless procedural rig (no mesh): the bone hierarchy + Animator of this file, used by the realistic humans
 * (src/game/peds/realhuman.js) for the states that have no mocap clip (drive, knocked, getup, jump, fall, land,
 * enter / exit car). Frame: +X right, +Y up, -Z forward, rig units (REF_H tall), bones at rest have identity rotation.
 */
export function createProcRig(gender = 'm', seed = Math.random()) {
  const D = makeDims('average', gender);
  const bones = makeBones(D);
  const look = { idlePhase: seed * 100, fleeLook: (seed * 7.31) % 1, phoneMode: seed < 0.5 ? 'text' : 'call' };
  const anim = new Animator(D, look, bones, 1);
  return { bones, anim, D, B, HIPS_Y, REF_H };
}

setProcFactory(createProcRig, createProceduralHuman);
