// Buildings v2 storefront dress, main-thread half: the canvas atlas (fictional district shop signs, bilingual Chinatown
// signs, CJK + English neon blade words, awning canvases, lanterns, glow / spill / pool gradients), the materials and
// the per-tile meshes built from v2dressgeo.js worker output.
//   main   MeshStandardMaterial, atlas colour + emissive map, vertex colours; steady night glow (NO flicker)
//   small  same material (lanterns, gooseneck lamps), shorter range
//   glow   additive (lit awning undersides, spill sheets, neon halos, sidewalk light pools); scales with night and rain,
//          fades out by 300-460 m in the shader so nothing pops
// createDressLayer({ group, night, terrain }) -> { add(key, res), remove(key), count }
import * as THREE from 'three';
import { mulberry32 } from '../geo.js';
import { HB_WET } from '../../render/fog.js';
import { AT, SIGN, BLADE, LANTERN, PLAIN, TILES, GLOW, AWN, LAMP, SPILL, POOL, NEONW, NEON_WORDS, BLADE_WORDS, uvr } from './v2dressgeo.js';

const CN_NAMES = [
  ['GOLDEN LOTUS DIM SUM', '金蓮點心'], ['JADE PALACE', '玉宮酒家'], ['LUCKY DRAGON BAKERY', '福龍餅家'], ['WAH KEE HERBS', '華記藥材'],
  ['EASTERN TEA HOUSE', '東方茶樓'], ['NEW CANTON BBQ', '新廣州燒臘'], ['PEARL RIVER GIFTS', '珠江禮品'], ['DOUBLE HAPPINESS', '雙喜'],
  ['HONG KONG NOODLE', '香港麵家'], ['SUN WAH MARKET', '新華市場'], ['GREAT STAR JEWELRY', '大星珠寶'], ['OCEAN PEARL SEAFOOD', '海珠海鮮'],
  ['WING SING TRADING', '永盛貿易'], ['GOLDEN PHOENIX', '金鳳餐廳'], ['CHINA BAZAAR', '中華百貨'], ['KOW LOON CAFE', '九龍冰室'],
];
const CN_BLADES = ['酒家', '茶樓', '飯店', '點心', '餅家', '藥材', '旅館', '金龍', '海鮮', '珠寶', '麵家', '燒臘'];
// district flavours (v2dressgeo FL order): 6 fictional shop names each; sign style bias [box-lit, neon, painted]
const FLAV_NAMES = [
  { n: ['MAISON LUMIERE', 'BAY & BIRCH', 'THE GILDED FIG', 'HARLOW BAKERY', 'CYPRESS WINE BAR', 'NOB & CO. TAILORS'], s: [0.35, 0.25, 0.4] },
  { n: ['TAQUERIA EL SOL', 'PANADERIA LA ROSA', 'LA PALOMA MARKET', 'CASA AZUL', 'EL FARO CANTINA', 'MARIPOSA BOTANICA'], s: [0.5, 0.4, 0.1] },
  { n: ['RAINBOW ROOM', 'THE PINK DOOR', 'HALO BAR', 'NIGHTINGALE CAFE', 'VELVET LOUNGE', 'LILAC & LACE'], s: [0.2, 0.6, 0.2] },
  { n: ['PURPLE HAZE VINTAGE', 'SPIRAL RECORDS', 'COSMIC CAFE', 'KALEIDOSCOPE BOOKS', 'FLOWER POWER TEES', 'GOLDEN GATE GUITARS'], s: [0.35, 0.45, 0.2] },
  { n: ['CAFFE NAPOLI', 'TRATTORIA LUNA', 'FOCACCIA FORNO', 'BELLA NOTTE', 'SALUMERIA ROMA', 'CIAO BELLA GELATO'], s: [0.3, 0.5, 0.2] },
  { n: ['GOLDEN STAR LIQUOR', 'PHO SAIGON 88', 'ALLSTAR DONUTS', 'LUCKY 7 DELI', 'HOTEL EMBER', 'SUDS LAUNDROMAT'], s: [0.45, 0.5, 0.05] },
  { n: ['PEARL NOODLE HOUSE', 'SAKURA SUSHI', 'GOLDEN BOWL', 'SEOUL GARDEN BBQ', 'RANGOON STAR', 'BOBA LANE'], s: [0.6, 0.3, 0.1] },
  { n: ['CORNER MARKET', 'FOGHORN COFFEE', 'HILLSIDE DINER', 'FOG CITY BARBER', 'SUNRISE CLEANERS', 'LUCKY PENNY PUB'], s: [0.5, 0.35, 0.15] },
];
const TUBES = ['#ff3a3a', '#ffd23a', '#3aff9a', '#ff5ad0', '#ff7a2a', '#3ae0ff', '#b46bff', '#f8f4e8'];
// awning canvases: 0 / 5 tinted by vertex colour (white weave), the rest drawn in colour
const AWN_PAT = [null, ['#b3261e', '#f2ece0'], ['#1f6b3a', '#f2ece0'], ['#1c2c55', '#efe6cc'], ['#161616', '#f4f1ea'], null, ['#d2691e', '#f3e7cc'], ['#1d7a78', '#f4f1ea']];

let tex = null;
export function dressAtlas() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = AT;
  const x = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = AT;
  const y = e.getContext('2d');
  y.fillStyle = '#000'; y.fillRect(0, 0, AT, AT);
  x.fillStyle = '#1a1818'; x.fillRect(0, 0, AT, AT);
  const rnd = mulberry32(7117);
  const CJK = '"Microsoft YaHei", "Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", "SimHei", sans-serif';
  const SANS = '"Trebuchet MS", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  // ---- Chinatown bilingual signs (unchanged look)
  const bgs = ['#8f1414', '#b01c1c', '#14502c', '#0f3a24', '#1a1a1e', '#c8961e', '#6a0f18', '#0e2c4a', '#f0e2b8'];
  for (let k = 0; k < 16; k++) {
    const [X, Y, W, H] = SIGN(k), [en, zh] = CN_NAMES[k];
    const bg = bgs[k % bgs.length], light = bg === '#c8961e' || bg === '#f0e2b8';
    x.fillStyle = bg; x.fillRect(X, Y, W, H);
    x.strokeStyle = light ? '#5a1010' : '#e8c060'; x.lineWidth = 5; x.strokeRect(X + 5, Y + 5, W - 10, H - 10);
    x.lineWidth = 1.5; x.strokeRect(X + 12, Y + 12, W - 24, H - 24);
    x.textBaseline = 'middle'; x.textAlign = 'center';
    const fg = light ? '#7a0c0c' : (rnd() < 0.6 ? '#f4d060' : '#fff2dc');
    x.font = `bold 50px ${CJK}`;
    const zw = Math.min(W * 0.46, x.measureText(zh).width);
    x.save(); x.translate(X + 24 + zw / 2, Y + H / 2 + 2); x.scale(Math.min(1, (W * 0.46) / Math.max(1, x.measureText(zh).width)), 1);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillText(zh, 2, 3); x.fillStyle = fg; x.fillText(zh, 0, 0); x.restore();
    x.font = `bold 30px ${SANS}`;
    const ew = x.measureText(en).width, room = W - zw - 64, sx = Math.min(1, room / ew);
    x.save(); x.translate(X + 40 + zw + room / 2, Y + H / 2 + 2); x.scale(sx, 1);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillText(en, 2, 2); x.fillStyle = fg; x.fillText(en, 0, 0); x.restore();
    y.drawImage(c, X, Y, W, H, X, Y, W, H); y.fillStyle = 'rgba(0,0,0,0.5)'; y.fillRect(X, Y, W, H);
  }
  // ---- district signs: box-lit (glowing board, dark letters), neon (dark board, glowing tubes), painted (gold leaf)
  const fitText = (g, txt, cx, cy, maxW, px, font) => {
    g.font = `bold ${px}px ${font}`; const w = g.measureText(txt).width, s = Math.min(1, maxW / Math.max(1, w));
    g.save(); g.translate(cx, cy); g.scale(s, 1); g.fillText(txt, 0, 0); g.restore();
  };
  for (let f = 0; f < 8; f++) for (let j = 0; j < 6; j++) {
    const k = 16 + f * 6 + j, [X, Y, W, H] = SIGN(k), name = FLAV_NAMES[f].n[j], sb = FLAV_NAMES[f].s;
    const r = rnd(), style = r < sb[0] ? 0 : r < sb[0] + sb[1] ? 1 : 2;
    x.textBaseline = 'middle'; x.textAlign = 'center'; y.textBaseline = 'middle'; y.textAlign = 'center';
    if (style === 0) {
      const bg = ['#f4efe2', '#fff6d8', '#e9f1f4', '#ffe45c', '#f6f6f6'][Math.floor(rnd() * 5)], fg = ['#b3161a', '#1a3a8f', '#161616', '#0f6a3a', '#8a1f6a'][Math.floor(rnd() * 5)];
      x.fillStyle = bg; x.fillRect(X, Y, W, H); x.fillStyle = fg; x.fillRect(X, Y, W, 7); x.fillRect(X, Y + H - 7, W, 7);
      x.fillStyle = fg; fitText(x, name, X + W / 2, Y + H / 2 + 2, W - 40, 50, SANS);
      y.fillStyle = bg; y.fillRect(X, Y, W, H); y.fillStyle = 'rgba(0,0,0,0.2)'; y.fillRect(X, Y, W, H);
      y.fillStyle = fg; y.globalAlpha = 0.6; fitText(y, name, X + W / 2, Y + H / 2 + 2, W - 40, 50, SANS); y.globalAlpha = 1;
    } else if (style === 1) {
      const col = TUBES[Math.floor(rnd() * TUBES.length)], script = rnd() < 0.5;
      x.fillStyle = '#0d0c10'; x.fillRect(X, Y, W, H); x.strokeStyle = '#2a2830'; x.lineWidth = 4; x.strokeRect(X + 4, Y + 4, W - 8, H - 8);
      for (const g of [x, y]) {
        g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col;
        fitText(g, name, X + W / 2, Y + H / 2 + 2, W - 44, 48, script ? `italic ${SERIF}` : SANS);
        g.shadowBlur = 0; g.strokeStyle = '#fff8f0'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,0.35)';
        fitText(g, name, X + W / 2, Y + H / 2 + 2, W - 44, 48, script ? `italic ${SERIF}` : SANS);
      }
      y.strokeStyle = col; y.globalAlpha = 0.5; y.lineWidth = 3; y.strokeRect(X + 10, Y + 10, W - 20, H - 20); y.globalAlpha = 1;
    } else {
      const bg = ['#123524', '#4a0f14', '#10223f', '#141414', '#3b2410'][Math.floor(rnd() * 5)];
      x.fillStyle = bg; x.fillRect(X, Y, W, H); x.strokeStyle = '#c9a24a'; x.lineWidth = 3; x.strokeRect(X + 8, Y + 8, W - 16, H - 16);
      x.fillStyle = '#e6c15a'; fitText(x, name, X + W / 2, Y + H / 2 + 3, W - 50, 46, SERIF);
      y.drawImage(c, X, Y, W, H, X, Y, W, H); y.fillStyle = 'rgba(0,0,0,0.45)'; y.fillRect(X, Y, W, H);
    }
  }
  // ---- blades: CJK (0..11) and English words (12..31), dark plate + glowing tube letters
  for (let k = 0; k < 32; k++) {
    const [X, Y, W, H] = BLADE(k), cjk = k < 12, word = cjk ? CN_BLADES[k] : (BLADE_WORDS[k - 12] || 'OPEN'), col = TUBES[(k * 5 + 1) % TUBES.length];
    x.fillStyle = '#120a0a'; x.fillRect(X, Y, W, H);
    x.strokeStyle = cjk ? '#c8a040' : '#3a3440'; x.lineWidth = 3; x.strokeRect(X + 3, Y + 3, W - 6, H - 6);
    const n = word.length, step = Math.min(cjk ? 78 : 44, (H - 26) / n), px = cjk ? 46 : Math.min(40, step * 1.05);
    x.textAlign = 'center'; x.textBaseline = 'middle'; y.textAlign = 'center'; y.textBaseline = 'middle';
    for (const g of [x, y]) {
      g.font = `bold ${px}px ${cjk ? CJK : SANS}`;
      for (let i = 0; i < n; i++) {
        const cy = Y + H / 2 + (i - (n - 1) / 2) * step;
        g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = col; g.fillText(word[i], X + W / 2, cy);
        g.shadowBlur = 0; g.strokeStyle = '#fff4ec'; g.lineWidth = 1.2; g.strokeText(word[i], X + W / 2, cy);
      }
      g.shadowBlur = 0;
    }
    y.strokeStyle = col; y.lineWidth = 2; y.globalAlpha = 0.6; y.strokeRect(X + 3, Y + 3, W - 6, H - 6); y.globalAlpha = 1;
  }
  // ---- lantern paper
  { const [X, Y, W, H] = LANTERN;
    for (const g of [x, y]) {
      const gr = g.createLinearGradient(X, 0, X + W, 0); gr.addColorStop(0, '#b01810'); gr.addColorStop(0.5, '#ff3a20'); gr.addColorStop(1, '#b01810');
      g.fillStyle = gr; g.fillRect(X, Y, W, H);
      g.fillStyle = '#e0a830'; g.fillRect(X, Y, W, 7); g.fillRect(X, Y + H - 7, W, 7);
      g.fillStyle = 'rgba(60,0,0,0.35)'; for (let k = 0; k < 8; k++) g.fillRect(X + k * 8 + 3, Y + 7, 1.5, H - 14);
    } }
  { const [X, Y, W, H] = TILES;
    x.fillStyle = '#d8d8d8'; x.fillRect(X, Y, W, H);
    for (let k = 0; k < 4; k++) { const gr = x.createLinearGradient(X + k * 32, 0, X + k * 32 + 32, 0); gr.addColorStop(0, '#6a6a6a'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.7, '#b8b8b8'); gr.addColorStop(1, '#5a5a5a'); x.fillStyle = gr; x.fillRect(X + k * 32, Y, 32, H); }
    x.fillStyle = 'rgba(0,0,0,0.3)'; for (let r = 0; r < 4; r++) x.fillRect(X, Y + r * 32 + 28, W, 4); }
  { const [X, Y, W, H] = PLAIN; x.fillStyle = '#ffffff'; x.fillRect(X, Y, W, H); }
  // ---- awning canvases
  for (let k = 0; k < 8; k++) {
    const [X, Y, W, H] = AWN(k), p = AWN_PAT[k];
    if (!p) { x.fillStyle = '#f2f0ec'; x.fillRect(X, Y, W, H); x.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < W; i += 3) x.fillRect(X + i, Y, 1, H); }
    else { const n = k === 4 ? 16 : 8; for (let i = 0; i < n; i++) { x.fillStyle = p[i % 2]; x.fillRect(X + i * W / n, Y, W / n + 0.5, H); } }
    if (k === 5) { x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(X + (i + 0.5) * W / 8, Y + H, W / 16, Math.PI, 0); x.fill(); } }
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(X, Y + H - 10, W, 10);
  }
  // ---- gradients for the additive glow material (white; tinted by vertex colour)
  { const [X, Y, W, H] = GLOW; const g = x.createRadialGradient(X + W / 2, Y + H / 2, 2, X + W / 2, Y + H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(160,160,160,1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = g; x.fillRect(X, Y, W, H); }
  { const [X, Y, W, H] = SPILL;
    for (let i = 0; i < W; i++) { const t = i / (W - 1), hx = Math.sin(Math.PI * t) ** 1.5;
      const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, `rgba(${255 * hx | 0},${255 * hx | 0},${255 * hx | 0},1)`); g.addColorStop(0.35, `rgba(${110 * hx | 0},${110 * hx | 0},${110 * hx | 0},1)`); g.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = g; x.fillRect(X + i, Y, 1, H); } }
  { const [X, Y, W, H] = POOL; const g = x.createRadialGradient(X + W / 2, Y + H * 0.3, 2, X + W / 2, Y + H * 0.45, W * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(120,120,120,1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = g; x.fillRect(X, Y, W, H); }
  { const [X, Y, W, H] = LAMP; for (const g of [x, y]) { const r = g.createRadialGradient(X + W / 2, Y + H / 2, 1, X + W / 2, Y + H / 2, W / 2); r.addColorStop(0, '#fff6e0'); r.addColorStop(0.6, '#ffc070'); r.addColorStop(1, '#a05010'); g.fillStyle = r; g.fillRect(X, Y, W, H); } }
  // ---- window neons: tube words on a black backing (black = invisible once lit: the quad sits in front of glass)
  for (let k = 0; k < 16; k++) {
    const [X, Y, W, H] = NEONW(k), word = NEON_WORDS[k], col = ['#ff3040', '#ff5ad0', '#3ae0ff', '#ffd23a', '#ff7a2a', '#3aff9a'][k % 6];
    for (const g of [x, y]) {
      g.fillStyle = '#050406'; g.fillRect(X, Y, W, H);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${k === 7 || k === 14 ? 34 : 44}px ${k % 3 === 1 ? 'Georgia, serif' : SANS}`;
      g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = col; g.fillText(word, X + W / 2, Y + H / 2 + 2);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,250,240,0.55)'; g.fillText(word, X + W / 2, Y + H / 2 + 2);
      g.strokeStyle = col; g.lineWidth = 2.5; g.globalAlpha = 0.8; g.beginPath(); g.roundRect ? g.roundRect(X + 6, Y + 6, W - 12, H - 12, 12) : g.rect(X + 6, Y + 6, W - 12, H - 12); g.stroke(); g.globalAlpha = 1;
    }
  }
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  tex = { map: mk(c, true), emap: mk(e, true) };
  return tex;
}
export const AWN_TINTED = (k) => !AWN_PAT[k];

function geo(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(p.nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
  g.setIndex(new THREE.BufferAttribute(p.idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function createDressLayer({ group, night, terrain }) {
  const { map, emap } = dressAtlas();
  const root = new THREE.Group(); root.name = 'bld-dress'; group.add(root);
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  // small items (lanterns, lamps, window neons): same look, collapsed beyond ~330 m (no far z-fighting / sub-pixel shimmer)
  const small = mat.clone();
  small.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nif (-mvPosition.z > 330.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
  };
  small.customProgramCacheKey = () => 'hb-dress-small';
  const glowK = { value: 0 };
  const glow = new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, fog: false });
  glow.color.setScalar(3.2);   // night exposure is low: additive light needs HDR-ish values
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowK = glowK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHbD;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHbD = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHbD; uniform float uGlowK;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= uGlowK * (1.0 - smoothstep(300.0, 460.0, vHbD));\n#include <opaque_fragment>');
  };
  glow.customProgramCacheKey = () => 'hb-dress-glow';
  const tiles = new Map(), lod = [];
  const HALF = 362;
  function pools(a) {
    // sidewalk light pools: a quad per shop unit laid on the ground (terrain + curb), faded radially by the texture
    const n = a.length / 9; if (!n) return null;
    const pos = new Float32Array(n * 12), nrm = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    const r = uvr(POOL, 3);
    for (let q = 0; q < n; q++) {
      const o = q * 9, x = a[o], z = a[o + 1], tx = a[o + 2], tz = a[o + 3], w = a[o + 4] / 2 + 0.6, dep = a[o + 5], nx = -tz, nz = tx;
      const C = [[-w, 0.15], [w, 0.15], [w, dep], [-w, dep]];
      for (let k = 0; k < 4; k++) {
        const px = x + tx * C[k][0] + nx * C[k][1], pz = z + tz * C[k][0] + nz * C[k][1], py = (terrain ? terrain.heightAt(px, pz) : 0) + 0.2;
        pos.set([px, py, pz], (q * 4 + k) * 3); nrm.set([0, 1, 0], (q * 4 + k) * 3);
        uv.set([k === 0 || k === 3 ? r[0] : r[2], k < 2 ? r[3] : r[1]], (q * 4 + k) * 2);
        col.set([a[o + 6] * 0.85, a[o + 7] * 0.85, a[o + 8] * 0.85], (q * 4 + k) * 3);
      }
      idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    return { pos, nrm, uv, col, idx };
  }
  function add(key, res, cx, cz) {
    remove(key);
    const T = { meshes: [] };
    const put = (p, m, maxD, name) => {
      if (!p) return;
      const o = new THREE.Mesh(geo(p), m); o.name = name; o.matrixAutoUpdate = false; o.castShadow = false; o.receiveShadow = m === mat || m === small;
      root.add(o); T.meshes.push(o); lod.push({ o, x: cx, z: cz, maxD, key });
    };
    put(res.main, mat, 1000, 'bld-dress');
    put(res.small, small, 450, 'bld-dress-small');
    put(res.glow, glow, 480, 'bld-dress-glow');
    put(pools(res.pools), glow, 300, 'bld-dress-pools');
    tiles.set(key, T);
  }
  function remove(key) {
    const T = tiles.get(key); if (!T) return;
    for (const o of T.meshes) { root.remove(o); o.geometry.dispose(); }
    for (let k = lod.length - 1; k >= 0; k--) if (lod[k].key === key) lod.splice(k, 1);
    tiles.delete(key);
  }
  // ticker: steady night glow + per-tile distance culling
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const ticker = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  ticker.frustumCulled = false; ticker.renderOrder = -1e6; ticker.name = 'bld-dress-ticker';
  ticker.onBeforeRender = (r, s, cam) => {
    // (flicker fix 9/30) main view only: the car reflection probe's cube cameras (local position 0,0 = the world origin)
    // render on alternate frames, and visibility set here only takes effect on the NEXT render: every other frame the
    // main view drew with the tiles culled from the origin (sign bands / neon / lanterns strobing)
    if (!cam || cam.isOrthographicCamera || cam.parent?.isCubeCamera) return;
    const nv = Math.min(1, Math.max(0, night?.value ?? 0));
    mat.emissiveIntensity = small.emissiveIntensity = 0.03 + 1.25 * nv;          // steady (no flicker)
    glowK.value = nv * (0.5 + 0.5 * Math.min(1, HB_WET.z + HB_WET.x * 0.5));
    const cx = cam.matrixWorld.elements[12], cz = cam.matrixWorld.elements[14];
    for (const L of lod) L.o.visible = Math.hypot(L.x - cx, L.z - cz) - HALF < L.maxD && (L.o.material !== glow || glowK.value > 0.002);
  };
  root.add(ticker);
  return { group: root, add, remove, get count() { return tiles.size; } };
}
