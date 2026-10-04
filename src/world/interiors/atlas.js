// One shared 2048x2048 canvas atlas for every interior sign, screen, poster and label (one texture, two materials).
// Regions are packed in rows on first use and redrawn if the web fonts arrive later.
import * as THREE from 'three';

const SIZE = 2048, PAD = 6;
let A = null;
export const FONT = `'Barlow Condensed','Arial Narrow',Impact,sans-serif`;
export const SANS = `Inter,system-ui,'Segoe UI',Arial,sans-serif`;

export function getAtlas() {
  if (A) return A;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const regions = new Map();
  let cx = PAD, cy = PAD, rowH = 0;
  A = {
    canvas, ctx, texture, regions,
    region(name, w, h, draw) {
      const got = regions.get(name); if (got) return got;
      if (cx + w + PAD > SIZE) { cx = PAD; cy += rowH + PAD; rowH = 0; }
      if (cy + h + PAD > SIZE) { console.warn('[interiors] atlas full', name); return { u0: 0, v0: 0, u1: 0.001, v1: 0.001 }; }
      const x = cx, y = cy; cx += w + PAD; rowH = Math.max(rowH, h);
      const r = { name, x, y, w, h, draw, u0: x / SIZE, u1: (x + w) / SIZE, v0: 1 - (y + h) / SIZE, v1: 1 - y / SIZE };
      regions.set(name, r);
      paint(r);
      return r;
    },
  };
  function paint(r) {
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.translate(r.x, r.y);
    try { r.draw(ctx, r.w, r.h); } catch (e) { console.warn('[interiors] atlas draw', r.name, e); }
    ctx.restore();
    texture.needsUpdate = true;
  }
  // repaint everything once the display font has loaded (canvas text falls back until then)
  try {
    document.fonts?.load(`800 64px 'Barlow Condensed'`).then(() => { for (const r of regions.values()) paint(r); }).catch(() => {});
  } catch { /* no font loading API */ }
  return A;
}

// ------------------------------------------------------------------ drawing helpers
export function neon(ctx, text, x, y, size, color, { font = FONT, weight = 800, italic = false, align = 'center', glow = 1, core = '#fff', track = 0 } = {}) {
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (track) ctx.letterSpacing = track + 'px';
  ctx.shadowColor = color;
  for (const [b, a] of [[size * 0.5 * glow, 0.55], [size * 0.22 * glow, 0.8], [size * 0.08, 1]]) { ctx.shadowBlur = b; ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillText(text, x, y); }
  ctx.shadowBlur = size * 0.05; ctx.globalAlpha = 1; ctx.fillStyle = core; ctx.fillText(text, x, y);
  ctx.restore();
}
export function text(ctx, str, x, y, size, color, { font = FONT, weight = 800, italic = false, align = 'center', base = 'middle', track = 0, maxW = 0 } = {}) {
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color;
  if (track) ctx.letterSpacing = track + 'px';
  if (maxW) { const w = ctx.measureText(str).width; if (w > maxW) { ctx.translate(x, y); ctx.scale(maxW / w, 1); ctx.fillText(str, align === 'left' ? 0 : 0, 0); ctx.restore(); return; } }
  ctx.fillText(str, x, y);
  ctx.restore();
}
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
