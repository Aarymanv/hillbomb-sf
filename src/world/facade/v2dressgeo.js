// Buildings v2 storefront dress, geometry half (pure: runs in the build workers, one 512 m tile per job).
// Every street-facing storefront (ground type STORE: commercial corridors from v2plan.js, commercial styles,
// Tenderloin / Civic apartments, Chinatown) gets, parameterised by its district flavour:
//   * a lit sign band (box plate + one of the district's fictional English signs; bilingual CJK in Chinatown)
//   * canvas awnings under the sign band with a warm lit underside, and a soft light-spill volume below them
//   * vertical neon blade signs (dense in the Tenderloin / Broadway / Mission / Castro / Polk, sparse elsewhere)
//   * gooseneck lamps over painted signs (upscale flavour), sidewalk light-pool anchors (placed on the main thread,
//     which knows the ground height)
//   * Chinatown only: red paper lanterns on rods, green glazed-tile pagoda pent roofs (the v1 look, unchanged)
// Output per tile: { main, small, glow } vertex streams (position, normal, uv, colour; uv into the v2dress.js atlas)
// + pools Float32Array [x, z, tx, tz, w, depth, r, g, b] per shop unit. No z-fighting pairs: sign / blade faces ARE
// the plate faces (no coplanar decal quads), so the dress stays steady at any distance.
import { S, GT } from './plan.js';
import { prm, FRONT, Z, DIST, eachIn } from './v2plan.js';
import { simplify } from './v2geom.js';

export const AT = 2048;
// atlas layout (canvas px, y down). Signs 512 x 96 (4 x 16), blades 64 x 256 (32), misc row at y 1792.
export const SIGN = (k) => { k = ((k % 64) + 64) % 64; return [(k % 4) * 512, Math.floor(k / 4) * 96, 512, 96]; };
export const BLADE = (k) => { k = ((k % 32) + 32) % 32; return [k * 64, 1536, 64, 256]; };
export const LANTERN = [0, 1792, 64, 64], PLAIN = [64, 1792, 64, 64], TILES = [128, 1792, 128, 128], GLOW = [256, 1792, 128, 128];
export const AWN = (k) => [384 + (k % 8) * 128, 1792, 128, 128];
export const LAMP = [1408, 1792, 64, 64], SPILL = [1472, 1792, 128, 128], POOL = [1600, 1792, 128, 128];
// small horizontal window neons (OPEN, BAR, ...), 256 x 64, 16 of them on the bottom row
export const NEONW = (k) => { k = ((k % 16) + 16) % 16; return [(k % 8) * 256, 1920 + Math.floor(k / 8) * 64, 256, 64]; };
export const NEON_WORDS = ['OPEN', 'BAR', 'LIQUOR', 'BEER', 'TACOS', 'PHO', 'PIZZA', 'COCKTAILS', 'COFFEE', 'ATM', 'LOTTO', 'BOOKS', 'DELI', 'VINTAGE', 'KARAOKE', 'WINE'];
const NW = (...w) => w.map(x => NEON_WORDS.indexOf(x));
export const uvr = ([x, y, w, h], ins = 2) => [(x + ins) / AT, 1 - (y + h - ins) / AT, (x + w - ins) / AT, 1 - (y + ins) / AT];

// flavours: sign sets (6 each after the 16 Chinatown signs), blade word sets, awning colours / patterns, densities
export const FL = { UPSCALE: 0, LATIN: 1, CASTRO: 2, HAIGHT: 3, ITALIAN: 4, TL: 5, ASIAN: 6, GENERIC: 7, CHINA: 8 };
// English blade words (index 12 + k in the blade atlas; 0..11 = CJK)
export const BLADE_WORDS = ['BAR', 'HOTEL', 'LIQUOR', 'OPEN', 'CAFE', 'PIZZA', 'TACOS', 'COCKTAILS', 'DANCE', 'THEATER', 'LOUNGE', 'DELI',
  'PHO', 'BOOKS', 'VINTAGE', 'GELATO', 'TATTOO', 'CLUB', 'DINER', 'JAZZ'];
const BW = (...w) => w.map(x => 12 + BLADE_WORDS.indexOf(x));
const FLAV = [
  /* UPSCALE */ { neon: NW('OPEN', 'WINE', 'COCKTAILS', 'COFFEE'), nP: 0.25, blades: BW('HOTEL', 'COCKTAILS', 'LOUNGE', 'CAFE', 'THEATER', 'BAR'), awn: [[0.05, 0.06, 0.07], [0.12, 0.2, 0.12], [0.35, 0.05, 0.06], [0.55, 0.5, 0.42]], pat: [0, 0, 4, 3], awnP: 0.55, lamps: 0.6 },
  /* LATIN   */ { neon: NW('OPEN', 'TACOS', 'BEER', 'LOTTO', 'ATM', 'COFFEE'), nP: 0.55, blades: BW('TACOS', 'BAR', 'CAFE', 'OPEN', 'DANCE', 'LIQUOR'), awn: [[0.6, 0.12, 0.04], [0.05, 0.3, 0.12], [0.75, 0.45, 0.05], [0.55, 0.05, 0.2], [0.05, 0.2, 0.45]], pat: [0, 1, 6, 2], awnP: 0.65, lamps: 0.1 },
  /* CASTRO  */ { neon: NW('OPEN', 'BAR', 'COCKTAILS', 'KARAOKE', 'WINE'), nP: 0.5, blades: BW('BAR', 'CLUB', 'DANCE', 'LOUNGE', 'COCKTAILS', 'THEATER'), awn: [[0.45, 0.05, 0.3], [0.05, 0.05, 0.06], [0.1, 0.25, 0.5], [0.6, 0.2, 0.05]], pat: [0, 7, 4, 5], awnP: 0.55, lamps: 0.2 },
  /* HAIGHT  */ { neon: NW('OPEN', 'VINTAGE', 'BOOKS', 'COFFEE', 'BEER'), nP: 0.45, blades: BW('VINTAGE', 'BOOKS', 'TATTOO', 'CAFE', 'BAR', 'JAZZ'), awn: [[0.3, 0.08, 0.4], [0.7, 0.35, 0.05], [0.08, 0.3, 0.3], [0.5, 0.08, 0.08]], pat: [0, 6, 7, 3], awnP: 0.5, lamps: 0.15 },
  /* ITALIAN */ { neon: NW('OPEN', 'PIZZA', 'WINE', 'COCKTAILS', 'COFFEE', 'BAR'), nP: 0.5, blades: BW('PIZZA', 'CAFE', 'GELATO', 'JAZZ', 'COCKTAILS', 'CLUB', 'BAR'), awn: [[0.05, 0.25, 0.08], [0.45, 0.04, 0.04], [0.6, 0.55, 0.45], [0.05, 0.06, 0.07]], pat: [2, 1, 0, 3], awnP: 0.75, lamps: 0.35 },
  /* TL      */ { neon: NW('OPEN', 'LIQUOR', 'BEER', 'LOTTO', 'ATM', 'PHO', 'DELI', 'KARAOKE'), nP: 0.75, blades: BW('HOTEL', 'LIQUOR', 'BAR', 'PHO', 'DELI', 'CLUB', 'OPEN', 'TATTOO'), awn: [[0.4, 0.05, 0.04], [0.05, 0.12, 0.3], [0.05, 0.25, 0.1], [0.08, 0.08, 0.08]], pat: [0, 0, 1, 5], awnP: 0.35, lamps: 0.05 },
  /* ASIAN   */ { neon: NW('OPEN', 'PHO', 'KARAOKE', 'BEER', 'COFFEE'), nP: 0.45, blades: BW('PHO', 'CAFE', 'BAR', 'DELI', 'OPEN'), awn: [[0.5, 0.06, 0.04], [0.05, 0.25, 0.12], [0.7, 0.5, 0.05], [0.1, 0.1, 0.12]], pat: [0, 1, 2, 5], awnP: 0.5, lamps: 0.05 },
  /* GENERIC */ { neon: NW('OPEN', 'BAR', 'BEER', 'DELI', 'ATM', 'COFFEE'), nP: 0.35, blades: BW('BAR', 'CAFE', 'DINER', 'OPEN', 'LIQUOR', 'DELI'), awn: [[0.1, 0.18, 0.35], [0.45, 0.06, 0.05], [0.08, 0.22, 0.1], [0.4, 0.35, 0.3]], pat: [0, 3, 1, 2], awnP: 0.5, lamps: 0.15 },
];
// district -> [flavour, blade probability per building]
const DFL = [];
DFL[DIST.UNIONSQ] = [FL.UPSCALE, 0.2]; DFL[DIST.FIDI] = [FL.UPSCALE, 0.06]; DFL[DIST.POLK] = [FL.GENERIC, 0.5];
DFL[DIST.MISSION] = [FL.LATIN, 0.45]; DFL[DIST.VALENCIA] = [FL.LATIN, 0.3]; DFL[DIST.TWENTYFOURTH] = [FL.LATIN, 0.4];
DFL[DIST.CASTRO] = [FL.CASTRO, 0.5]; DFL[DIST.HAIGHT] = [FL.HAIGHT, 0.3]; DFL[DIST.NBEACH] = [FL.ITALIAN, 0.55];
DFL[DIST.TENDERLOIN] = [FL.TL, 0.6]; DFL[DIST.CLEMENT] = [FL.ASIAN, 0.15]; DFL[DIST.IRVING] = [FL.ASIAN, 0.12];
DFL[DIST.CHESTNUT] = [FL.UPSCALE, 0.1]; DFL[DIST.UNION] = [FL.UPSCALE, 0.1]; DFL[DIST.FILLMORE] = [FL.UPSCALE, 0.18]; DFL[DIST.DIVIS] = [FL.GENERIC, 0.15];
function flavourOf(P, i) {
  const d = P.corr ? P.corr[i] : 0;
  if (d && DFL[d]) return DFL[d];
  switch (P.zone[i]) {
    case Z.DOWNTOWN: return [FL.UPSCALE, 0.08];
    case Z.MISSION: return [FL.LATIN, 0.15];
    case Z.CASTRO: return [FL.CASTRO, 0.15];
    case Z.TENDERLOIN: case Z.CIVIC: return [FL.TL, 0.35];
    case Z.NORTHBEACH: return [FL.ITALIAN, 0.2];
    case Z.AVENUES: return [FL.ASIAN, 0.05];
    case Z.VICTORIAN: return [FL.HAIGHT, 0.08];
    case Z.MARINA: return [FL.UPSCALE, 0.05];
    default: return [FL.GENERIC, 0.06];
  }
}

// ------------------------------------------------------------------ vertex writer
class DG {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  v(p, n, u, w, c) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, w); this.col.push(c[0], c[1], c[2]); return this.pos.length / 3 - 1; }
  quad(p0, p1, p2, p3, r, c) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
    const n = [nx / l, ny / l, nz / l];
    const a = this.v(p0, n, r[0], r[1], c), b = this.v(p1, n, r[2], r[1], c), d = this.v(p2, n, r[2], r[3], c), e = this.v(p3, n, r[0], r[3], c);
    this.idx.push(a, b, d, a, d, e);
  }
  tri(p0, p1, p2, r, c) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1;
    const n = [nx / l, ny / l, nz / l];
    this.idx.push(this.v(p0, n, r[0], r[1], c), this.v(p1, n, r[2], r[1], c), this.v(p2, n, (r[0] + r[2]) / 2, r[3], c));
  }
  get empty() { return this.idx.length === 0; }
  pack() {
    const n = this.pos.length / 3;
    return { n, pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), uv: new Float32Array(this.uv), col: new Float32Array(this.col), idx: n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx) };
  }
}
function frame(ax, y0, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
  return { tx, tz, nx, nz, p: (u, v, d) => [ax + tx * u + nx * d, y0 + v, az + tz * u + nz * d] };
}
const PL8 = uvr(PLAIN, 8);
// box in the frame; faces: 1 front(+d) 4 right(+u) 8 left(-u) 16 top 32 bottom; rf = uv rect for the front face
function box(G, F, u0, u1, v0, v1, d0, d1, c, faces = 61, rf = PL8) {
  const p = F.p;
  if (faces & 1) G.quad(p(u0, v0, d1), p(u1, v0, d1), p(u1, v1, d1), p(u0, v1, d1), rf, c);
  if (faces & 4) G.quad(p(u1, v0, d1), p(u1, v0, d0), p(u1, v1, d0), p(u1, v1, d1), PL8, c);
  if (faces & 8) G.quad(p(u0, v0, d0), p(u0, v0, d1), p(u0, v1, d1), p(u0, v1, d0), PL8, c);
  if (faces & 16) G.quad(p(u0, v1, d1), p(u1, v1, d1), p(u1, v1, d0), p(u0, v1, d0), PL8, c);
  if (faces & 32) G.quad(p(u0, v0, d0), p(u1, v0, d0), p(u1, v0, d1), p(u0, v0, d1), PL8, c);
}
const WHITE = [1, 1, 1], DARK = [0.025, 0.022, 0.022], GOLD = [0.62, 0.38, 0.06], RED = [0.42, 0.025, 0.02], JADE = [0.06, 0.26, 0.12];
const LUV = uvr(LANTERN, 1);
function lantern(G, F, u, v, d, s) {
  const rings = [[0.07, 0], [0.165, 0.09], [0.165, 0.27], [0.07, 0.36]], seg = 6;
  let prev = null;
  for (let r = 0; r < rings.length; r++) {
    const [rad, h] = rings[r], ids = [];
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2, cu = Math.cos(a), cd = Math.sin(a);
      const P = F.p(u + cu * rad * s, v - 0.36 * s + h * s, d + cd * rad * s);
      const n = [F.tx * cu + F.nx * cd, r === 0 ? -0.5 : r === rings.length - 1 ? 0.5 : 0, F.tz * cu + F.nz * cd];
      ids.push(G.v(P, n, LUV[0] + (LUV[2] - LUV[0]) * k / seg, LUV[1] + (LUV[3] - LUV[1]) * h / 0.36, WHITE));
    }
    if (prev) for (let k = 0; k < seg; k++) G.idx.push(prev[k], prev[k + 1], ids[k + 1], prev[k], ids[k + 1], ids[k]);
    prev = ids;
  }
  G.quad(F.p(u - 0.008, v, d), F.p(u + 0.008, v, d), F.p(u + 0.008, v + 0.12, d), F.p(u - 0.008, v + 0.12, d), PL8, DARK);
}
// canvas awning between u0..u1: sloped top from the wall (vt) out to (vb, dd), valance, cheek triangles; lit underside
// + a spill volume below the valance go to the glow stream
function awning(G, GW, F, u0, u1, vt, vb, dd, col, pat, lit) {
  const rr = uvr(AWN(pat), 3), p = F.p;
  if (pat !== 0 && pat !== 5) col = WHITE;   // striped canvases are drawn in colour
  G.quad(p(u0, vb, dd), p(u1, vb, dd), p(u1, vt, 0), p(u0, vt, 0), rr, col);
  G.quad(p(u0, vb - 0.26, dd), p(u1, vb - 0.26, dd), p(u1, vb, dd), p(u0, vb, dd), rr, col);
  G.tri(p(u0, vt, 0), p(u0, vb, dd), p(u0, vb, 0.02), PL8, col);
  G.tri(p(u1, vb, dd), p(u1, vt, 0), p(u1, vb, 0.02), PL8, col);
  if (!lit) return;
  const g = uvr(GLOW, 4), w = [1.6, 0.9, 0.42];
  // underside glow (faces down, 6 cm under the canvas)
  GW.quad(p(u0 + 0.05, vt - 0.08, 0.02), p(u1 - 0.05, vt - 0.08, 0.02), p(u1 - 0.05, vb - 0.08, dd - 0.04), p(u0 + 0.05, vb - 0.08, dd - 0.04), g, w);
  // spill: a soft sheet of light hanging below the valance, leaning out toward the curb
  const sp = uvr(SPILL, 3), s = [0.62, 0.36, 0.16];
  GW.quad(p(u0 + 0.1, 0.15, dd + 0.55), p(u1 - 0.1, 0.15, dd + 0.55), p(u1 - 0.1, vb - 0.3, dd + 0.02), p(u0 + 0.1, vb - 0.3, dd + 0.02), sp, s);
}

const ring = [], idx = [];
export function buildDressTile({ B, P }, key, hidden, tx = key % B.TC, tz = Math.floor(key / B.TC)) {
  const [f, c] = B.inTile(tx, tz);
  const G = new DG(), GL = new DG(), GW = new DG(), pools = [];
  const st = { buildings: 0, signs: 0, blades: 0, awnings: 0, lanterns: 0 };
  const all = []; eachIn(P, f, c, hidden, (i) => all.push(i));
  for (const i of all) {
    const sty = P.style[i];
    if (sty === S.TOWER_GLASS || (P.flags[i] & 32)) continue;
    const gtype = prm(P, i, 2, 2) % 8, gH = prm(P, i, 0, 1), y0 = P.y0[i], top = P.yEave[i] - y0;
    if (gtype !== GT.STORE || gH < 3.2 || top < gH + 0.8) continue;
    const ctZone = P.zone[i] === Z.CHINATOWN;
    if ((sty === S.TOWER_STONE || sty === S.OFFICE) && (ctZone || !(P.corr && P.corr[i]))) continue;
    const china = sty === S.CHINATOWN, rnd = mulberry32(i * 7 + 1);
    const [fl, bladeP] = ctZone ? [FL.CHINA, 0.55] : flavourOf(P, i), FV = FLAV[fl] || FLAV[FL.GENERIC];
    B.ring(i, ring);
    const n = ring.length / 2; if (n < 3) continue;
    let area2 = 0; for (let k = 0; k < n; k++) { const kk = (k + 1) % n; area2 += ring[k * 2] * ring[kk * 2 + 1] - ring[kk * 2] * ring[k * 2 + 1]; }
    const sgn = area2 < 0 ? -1 : 1, v0 = B.v0[i];
    simplify(ring, n, 0.3, idx);
    const m = idx.length, walls = [];
    for (let q = 0; q < m; q++) {
      const a = idx[q], b = idx[(q + 1) % m];
      let ax = ring[a * 2], az = ring[a * 2 + 1], bx = ring[b * 2], bz = ring[b * 2 + 1];
      const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
      if (len < 3.2) continue;
      let front = false;
      for (let e = a; e !== b && !front; e = (e + 1) % n) if (P.edge[v0 + e] & FRONT) front = true;
      if (!front) continue;
      const nx = sgn * ez / len, nz = -sgn * ex / len;
      if ((bx - ax) * nz - (bz - az) * nx < 0) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; }
      walls.push({ ax, az, bx, bz, len });
    }
    if (!walls.length) continue;
    st.buildings++;
    let main = walls[0]; for (const w of walls) if (w.len > main.len) main = w;
    const CT = fl === FL.CHINA;
    const pagoda = CT && china && top > gH + 3 && rnd() < 0.4, bladeOn = top > gH + 2.5 && rnd() < (CT ? (china ? 0.55 : 0) : bladeP);
    const swd = (P.swd ? P.swd[i] : 50) / 10;
    for (const w of walls) {
      const F = frame(w.ax, y0, w.az, w.bx, w.bz), W = w.len;
      const ns = Math.max(1, Math.round(W / 7.5)), sw = W / ns, m0 = 0.3;
      for (let s = 0; s < ns; s++) {
        const u0 = s * sw + m0, u1 = (s + 1) * sw - m0;
        if (u1 - u0 < 2.2) continue;
        const sv0 = gH - 1.02, sv1 = gH - 0.28;
        if (CT) {
          // Chinatown (v1 port): plate + bilingual sign, lantern rods, awnings under the band
          const k = Math.floor(rnd() * 16), r = uvr(SIGN(k));
          box(G, F, u0 - 0.05, u1 + 0.05, sv0 - 0.06, sv1 + 0.05, 0, 0.12, rnd() < 0.5 ? DARK : china ? (rnd() < 0.5 ? RED : JADE) : [0.08, 0.07, 0.06], 61 - 1);
          const swdt = Math.min(u1 - u0 + 0.1, 6.4), su0 = (u0 + u1 - swdt) / 2;
          G.quad(F.p(u0 - 0.05, sv0 - 0.06, 0.12), F.p(su0, sv0 - 0.06, 0.12), F.p(su0, sv1 + 0.05, 0.12), F.p(u0 - 0.05, sv1 + 0.05, 0.12), PL8, DARK);
          G.quad(F.p(su0 + swdt, sv0 - 0.06, 0.12), F.p(u1 + 0.05, sv0 - 0.06, 0.12), F.p(u1 + 0.05, sv1 + 0.05, 0.12), F.p(su0 + swdt, sv1 + 0.05, 0.12), PL8, DARK);
          G.quad(F.p(su0, sv0 - 0.06, 0.12), F.p(su0 + swdt, sv0 - 0.06, 0.12), F.p(su0 + swdt, sv1 + 0.05, 0.12), F.p(su0, sv1 + 0.05, 0.12), r, WHITE);
          st.signs++;
          if (china ? rnd() < 0.5 : rnd() < 0.15) {
            const d = 1.35, v = gH - 1.06, nl = Math.max(2, Math.round((u1 - u0) / 1.6));
            box(G, F, u0 + 0.1, u1 - 0.1, v, v + 0.03, d - 0.015, d + 0.015, DARK, 63);
            box(G, F, u0 + 0.1, u0 + 0.14, v, v + 0.03, 0.12, d, DARK, 63); box(G, F, u1 - 0.14, u1 - 0.1, v, v + 0.03, 0.12, d, DARK, 63);
            for (let l = 0; l < nl; l++) { const u = u0 + 0.35 + (u1 - u0 - 0.7) * (nl === 1 ? 0.5 : l / (nl - 1)); lantern(GL, F, u, v - 0.12, d, 0.95 + rnd() * 0.25); st.lanterns++; }
          }
          // awnings (were v2geom nearWall): solid red / green canvas, per ~3 m bay
          const acc = [prm(P, i, 5, 0) * 0.8, prm(P, i, 5, 1) * 0.8, prm(P, i, 5, 2) * 0.8], nbA = Math.max(1, Math.round((u1 - u0) / 2.9));
          for (let a = 0; a < nbA; a++) {
            if (rnd() > 0.6) continue;
            const a0 = u0 + (u1 - u0) * a / nbA + 0.05, a1 = u0 + (u1 - u0) * (a + 1) / nbA - 0.05;
            awning(G, GW, F, a0, a1, gH - 1.12, gH - 1.75, 1.1, acc, 0, true); st.awnings++;
          }
        } else {
          // district storefront: sign plate whose front face IS the sign (no decal), awning below, lamps
          const k = 16 + fl * 6 + Math.floor(rnd() * 6), r = uvr(SIGN(k), 3);
          const plateC = rnd() < 0.6 ? DARK : [0.1, 0.09, 0.08];
          const sh = sv1 - sv0, swdt = Math.min(u1 - u0 - 0.1, sh * 512 / 96 * 1.2), su0 = (u0 + u1 - swdt) / 2;
          const sm = (sv0 + sv1) / 2, sa = sm - sh / 2, sb = sm + sh / 2;
          box(G, F, su0, su0 + swdt, sa, sb, 0, 0.14, plateC, 61, r);
          if (su0 - (u0 - 0.05) > 0.2) { box(G, F, u0 - 0.05, su0, sv0, sv1, 0, 0.06, plateC, 61 - 4); box(G, F, su0 + swdt, u1 + 0.05, sv0, sv1, 0, 0.06, plateC, 61 - 8); }
          st.signs++;
          if (rnd() < FV.lamps) for (const lu of [su0 + swdt * 0.25, su0 + swdt * 0.75]) {
            box(G, F, lu - 0.02, lu + 0.02, sb + 0.05, sb + 0.3, 0.02, 0.06, DARK, 63);
            box(G, F, lu - 0.02, lu + 0.02, sb + 0.28, sb + 0.32, 0.06, 0.42, DARK, 63);
            box(GL, F, lu - 0.08, lu + 0.08, sb + 0.2, sb + 0.28, 0.34, 0.48, [2.2, 1.6, 0.9], 63, uvr(LAMP, 6));
          }
          const aw = rnd() < FV.awnP;
          if (aw) {
            const col = FV.awn[Math.floor(rnd() * FV.awn.length)], pat = FV.pat[Math.floor(rnd() * FV.pat.length)];
            awning(G, GW, F, u0 + 0.05, u1 - 0.05, sv0 - 0.1, sv0 - 0.75, 1.25, col, pat, true); st.awnings++;
          } else {
            // no awning: a small under-sign downlight glow on the storefront head
            const g = uvr(GLOW, 4);
            GW.quad(F.p(u0 + 0.2, sv0 - 0.9, 0.05), F.p(u1 - 0.2, sv0 - 0.9, 0.05), F.p(u1 - 0.2, sv0 - 0.02, 0.05), F.p(u0 + 0.2, sv0 - 0.02, 0.05), g, [0.5, 0.3, 0.14]);
          }
        }
        // a small neon in the shop window (OPEN / BAR / LIQUOR ...), 7 cm in front of the glass
        if (!CT && rnd() < FV.nP) {
          const k = FV.neon[Math.floor(rnd() * FV.neon.length)], nw = 0.95 + rnd() * 0.35, nh = nw * 0.25, uc = u0 + 0.6 + rnd() * Math.max(0, u1 - u0 - 1.2);
          const vc = Math.min(gH - 1.35, 1.75 + rnd() * 0.4);
          GL.quad(F.p(uc - nw / 2, vc - nh / 2, 0.07), F.p(uc + nw / 2, vc - nh / 2, 0.07), F.p(uc + nw / 2, vc + nh / 2, 0.07), F.p(uc - nw / 2, vc + nh / 2, 0.07), uvr(NEONW(k), 2), WHITE);
        }
        // sidewalk light pool anchor (placed on the ground by the main thread)
        const um = (u0 + u1) / 2, p = F.p(um, 0, 0), warm = CT ? [0.62, 0.22, 0.1] : [0.6, 0.36, 0.16];
        pools.push(p[0], p[2], F.tx, F.tz, u1 - u0, Math.max(1.2, Math.min(3.2, swd * 0.62)), warm[0], warm[1], warm[2]);
      }
      if (w !== main) continue;
      const bladeUs = !bladeOn ? [] : (!CT && bladeP >= 0.4 && W > 14 && rnd() < 0.6) ? [0.55, W - 0.55] : [rnd() < 0.5 ? 0.55 : W - 0.55];
      for (const u of bladeUs) {
        const bv0 = gH + 0.35, bv1 = Math.min(top - 0.6, gH + 1.4 + Math.min(CT ? 4.2 : 5.0, (top - gH) * 0.7));
        if (bv1 - bv0 > 1.8) {
          const th = 0.14, d0 = 0.3, d1 = 1.15;
          const k = CT ? Math.floor(rnd() * 12) : FV.blades[Math.floor(rnd() * FV.blades.length)], r = uvr(BLADE(k), 3);
          // plate: front edge / top / bottom solid; the two big faces are the textured sign faces
          box(G, F, u - th / 2, u + th / 2, bv0, bv1, d0, d1, DARK, 1 | 16 | 32);
          box(G, F, u - 0.04, u + 0.04, bv0 + 0.25, bv0 + 0.31, 0, d0, DARK, 63); box(G, F, u - 0.04, u + 0.04, bv1 - 0.31, bv1 - 0.25, 0, d0, DARK, 63);
          const a = u + th / 2, b = u - th / 2;
          G.quad(F.p(a, bv0, d1), F.p(a, bv0, d0), F.p(a, bv1, d0), F.p(a, bv1, d1), r, WHITE);
          G.quad(F.p(b, bv0, d0), F.p(b, bv0, d1), F.p(b, bv1, d1), F.p(b, bv1, d0), r, WHITE);
          // neon halo on the wall behind the blade (additive)
          const g = uvr(GLOW, 4), hc = CT ? [0.3, 0.06, 0.04] : [0.22, 0.1, 0.16];
          GW.quad(F.p(u - 0.9, bv0 - 0.3, 0.03), F.p(u + 0.9, bv0 - 0.3, 0.03), F.p(u + 0.9, bv1 + 0.3, 0.03), F.p(u - 0.9, bv1 + 0.3, 0.03), g, hc);
          st.blades++;
        }
      }
      if (pagoda) {
        const vt = top - 0.05, vb = top - 0.8, vf = top - 0.42, D = 1.05, ov = 0.45;
        const col = rnd() < 0.75 ? JADE : [0.5, 0.3, 0.04];
        const tr = uvr(TILES, 2), segs = Math.max(2, Math.round((W + 2 * ov) / 1.3));
        const bot = (u) => { const t = Math.min(1, Math.min(u + ov, W + ov - u) / 1.2); return vf + (vb - vf) * t * (2 - t); };
        for (let s = 0; s < segs; s++) {
          const ua = -ov + (W + 2 * ov) * s / segs, ub = -ov + (W + 2 * ov) * (s + 1) / segs;
          G.quad(F.p(ua, bot(ua), D), F.p(ub, bot(ub), D), F.p(ub, vt, 0), F.p(ua, vt, 0), tr, col);
          G.quad(F.p(ua, bot(ua) - 0.16, D + 0.01), F.p(ub, bot(ub) - 0.16, D + 0.01), F.p(ub, bot(ub), D + 0.01), F.p(ua, bot(ua), D + 0.01), PL8, RED);
        }
        box(G, F, -ov, W + ov, vt - 0.02, vt + 0.14, 0, 0.16, GOLD, 63);
        for (const u of [-ov, W + ov]) box(G, F, u - 0.06, u + 0.06, bot(u), bot(u) + 0.28, D - 0.06, D + 0.06, GOLD, 63);
        box(G, F, 0.05, 0.38, gH, vb - 0.1, 0, 0.1, RED, 61); box(G, F, W - 0.38, W - 0.05, gH, vb - 0.1, 0, 0.1, RED, 61);
      }
    }
  }
  return { main: G.empty ? null : G.pack(), small: GL.empty ? null : GL.pack(), glow: GW.empty ? null : GW.pack(), pools: new Float32Array(pools), stats: st };
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const dressTransfer = (r) => { const t = []; for (const k of ['main', 'small', 'glow']) if (r[k]) t.push(r[k].pos.buffer, r[k].nrm.buffer, r[k].uv.buffer, r[k].col.buffer, r[k].idx.buffer); t.push(r.pools.buffer); return t; };
