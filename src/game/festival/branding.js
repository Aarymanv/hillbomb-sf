// Original festival branding drawn on canvas: the HILLBOMB emblem (a hill with a suspension tower inside a hexagon),
// the wordmark, stage screen art, arch banners and flag prints. Redrawn once the web fonts finish loading.
import * as THREE from 'three';

const PINK = '#ff2e7e', GOLD = '#ffc247', NAVY = '#0d0f1a', INK = '#f6f3ee';
const COND = "'Barlow Condensed','Arial Narrow',Impact,sans-serif";
const textures = [];
function tex(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const redraw = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
  redraw(); textures.push(redraw);
  return t;
}
if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(() => { for (const r of textures) r(); });

export function emblem(g, cx, cy, r, { ring = true } = {}) {
  g.save(); g.translate(cx, cy);
  const grad = g.createLinearGradient(-r, -r, r, r); grad.addColorStop(0, PINK); grad.addColorStop(1, GOLD);
  // hexagon
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  g.fillStyle = grad; g.fill();
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); } g.closePath();
  g.fillStyle = NAVY; g.fill();
  // hill + tower + cable
  g.save(); g.clip();
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(-r, r * 0.55); g.quadraticCurveTo(-r * 0.2, -r * 0.35, r * 0.35, r * 0.1); g.quadraticCurveTo(r * 0.7, r * 0.35, r, r * 0.2); g.lineTo(r, r); g.lineTo(-r, r); g.closePath(); g.fill();
  g.fillStyle = INK;
  g.fillRect(r * 0.18, -r * 0.62, r * 0.07, r * 0.9); g.fillRect(r * 0.34, -r * 0.62, r * 0.07, r * 0.9);
  g.fillRect(r * 0.16, -r * 0.44, r * 0.27, r * 0.05); g.fillRect(r * 0.16, -r * 0.2, r * 0.27, r * 0.05);
  g.strokeStyle = INK; g.lineWidth = r * 0.035;
  g.beginPath(); g.moveTo(-r * 0.9, -r * 0.05); g.quadraticCurveTo(-r * 0.3, -r * 0.1, r * 0.21, -r * 0.6); g.stroke();
  g.beginPath(); g.moveTo(r * 0.38, -r * 0.6); g.quadraticCurveTo(r * 0.6, -r * 0.2, r * 0.95, -r * 0.1); g.stroke();
  g.restore();
  if (ring) { g.lineWidth = r * 0.04; g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93); } g.closePath(); g.stroke(); }
  g.restore();
}
export function wordmark(g, x, y, size, { align = 'left', sub = 'FESTIVAL', color = INK } = {}) {
  g.save();
  g.textAlign = align; g.textBaseline = 'alphabetic';
  g.font = `italic 800 ${size}px ${COND}`;
  const grad = g.createLinearGradient(x - size * 2, y - size, x + size * 2, y);
  grad.addColorStop(0, color); grad.addColorStop(1, color);
  g.fillStyle = grad; g.fillText('HILLBOMB', x, y);
  if (sub) {
    const w = g.measureText('HILLBOMB').width;
    g.font = `800 ${Math.round(size * 0.3)}px ${COND}`; g.fillStyle = GOLD;
    const sx = align === 'center' ? x : align === 'right' ? x - w : x;
    g.textAlign = align;
    g.fillText(sub.split('').join(String.fromCharCode(8202)), align === 'left' ? sx + 4 : sx, y + size * 0.36);
  }
  g.restore();
}
// big stage LED wall: emblem + wordmark + city skyline strip
export const stageScreenTex = () => tex((g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#1a0a24'); bg.addColorStop(0.5, '#0d0f1a'); bg.addColorStop(1, '#2a0d16');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // light rays
  g.save(); g.globalAlpha = 0.18; g.translate(w / 2, h * 1.1);
  for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 18); g.fillStyle = i % 2 ? PINK : GOLD; g.beginPath(); g.moveTo(0, 0); g.lineTo(-40, -h * 1.4); g.lineTo(40, -h * 1.4); g.closePath(); g.fill(); }
  g.restore();
  emblem(g, w * 0.22, h * 0.5, h * 0.33);
  wordmark(g, w * 0.4, h * 0.56, h * 0.3, { sub: 'FESTIVAL  ·  SAN FRANCISCO' });
  // LED grid
  g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
}, 1024, 400);
// arch banner: wordmark on navy with a pink/gold edge; `line2` = site name
export const archBannerTex = (line2 = 'SAN FRANCISCO', color = PINK) => tex((g, w, h) => {
  g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.fillRect(0, 0, w, h * 0.07); g.fillRect(0, h * 0.93, w, h * 0.07);
  emblem(g, h * 0.62, h / 2, h * 0.36);
  wordmark(g, h * 1.12, h * 0.6, h * 0.46, { sub: null });
  g.font = `800 ${Math.round(h * 0.2)}px ${COND}`; g.fillStyle = color; g.textAlign = 'right';
  g.fillText(line2.toUpperCase(), w - h * 0.25, h * 0.4);
  g.fillStyle = GOLD; g.fillText('FESTIVAL', w - h * 0.25, h * 0.72);
}, 1024, 192);
// small side screens / tent fronts
export const sideScreenTex = (title = 'LIVE', color = PINK) => tex((g, w, h) => {
  g.fillStyle = NAVY; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, color); gr.addColorStop(1, GOLD);
  g.fillStyle = gr; g.fillRect(0, h * 0.78, w, h * 0.22);
  emblem(g, w / 2, h * 0.4, h * 0.3);
  g.font = `italic 800 ${Math.round(h * 0.16)}px ${COND}`; g.fillStyle = NAVY; g.textAlign = 'center'; g.fillText(title.toUpperCase(), w / 2, h * 0.95);
}, 256, 256);
// flag print atlas: 4 designs in a 2x2 grid (uv offset per instance)
export const flagTex = () => tex((g, w, h) => {
  const cw = w / 2, ch = h / 2;
  const designs = [[PINK, INK], [GOLD, NAVY], [NAVY, PINK], [INK, PINK]];
  designs.forEach(([bg, fg], i) => {
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    g.fillStyle = bg; g.fillRect(x, y, cw, ch);
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    g.fillStyle = fg; g.fillRect(x, y + ch * 0.9, cw, ch * 0.04);
    emblem(g, x + cw * 0.5, y + ch * 0.3, cw * 0.36, { ring: false });
    g.save(); g.translate(x + cw * 0.5, y + ch * 0.66); g.rotate(-Math.PI / 2);
    g.font = `italic 800 ${Math.round(cw * 0.3)}px ${COND}`; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HILLBOMB', 0, 0);
    g.restore();
    g.restore();
  });
}, 512, 1024);
export const COLORS = { PINK, GOLD, NAVY, INK };
