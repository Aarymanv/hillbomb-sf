// Icon atlas (canvas, drawn once): white glyphs on transparent, 8 x 8 tiles of 64 px. Used by world markers and UI.
export const ICONS = ['road', 'street', 'dirt', 'xc', 'drag', 'drift', 'showcase', 'story', 'trap', 'zone', 'danger', 'driftzone', 'trail',
  'board', 'boardft', 'barn', 'house', 'site', 'outpost', 'checkpoint', 'finish', 'rival', 'fasttravel', 'pickup', 'dropoff', 'target', 'lock', 'spin'];
export const iconIndex = name => Math.max(0, ICONS.indexOf(name));
let atlas = null;
export function iconAtlas() {
  if (atlas) return atlas;
  const T = 64, N = 8, c = document.createElement('canvas'); c.width = c.height = T * N;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  ICONS.forEach((name, i) => {
    g.save(); g.translate((i % N) * T + T / 2, Math.floor(i / N) * T + T / 2); g.scale(T / 64, T / 64);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 5;
    draw(g, name);
    g.restore();
  });
  atlas = { canvas: c, tiles: N, tile: T };
  return atlas;
}
// data URL of one icon (for DOM use), cached
const urlCache = new Map();
export function iconURL(name, color = '#fff', bg = null) {
  const key = name + color + bg;
  if (urlCache.has(key)) return urlCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill(); }
  g.translate(32, 32); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 5; draw(g, name);
  const u = c.toDataURL(); urlCache.set(key, u); return u;
}
function tri(g, pts, fill = true) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); fill ? g.fill() : g.stroke(); }
function draw(g, name) {
  switch (name) {
    case 'road': case 'finish': { // chequered flag
      g.lineWidth = 4; g.beginPath(); g.moveTo(-16, 22); g.lineTo(-16, -22); g.stroke();
      for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) if ((r + q) % 2 === 0) g.fillRect(-14 + q * 6.4, -21 + r * 6.4, 6.4, 6.4);
      g.strokeRect(-14, -21, 32, 25.6); break;
    }
    case 'street': { // skyline + moon
      g.beginPath(); g.arc(12, -14, 9, 0, Math.PI * 2); g.fill();
      g.fillRect(-22, -2, 10, 22); g.fillRect(-10, -12, 10, 32); g.fillRect(2, 2, 10, 18); g.fillRect(14, 8, 8, 12); break;
    }
    case 'dirt': { // mountain with track
      tri(g, [-24, 18, -4, -16, 6, 0, 14, -8, 26, 18]);
      g.globalCompositeOperation = 'destination-out'; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, 16); g.quadraticCurveTo(0, 4, 10, 16); g.stroke(); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'xc': { // flag on a hill
      g.beginPath(); g.moveTo(-26, 22); g.quadraticCurveTo(0, 2, 26, 22); g.closePath(); g.fill();
      g.lineWidth = 4; g.beginPath(); g.moveTo(-2, 12); g.lineTo(-2, -22); g.stroke(); tri(g, [-2, -22, 20, -15, -2, -8]); break;
    }
    case 'drag': { // tree lights
      g.fillRect(-4, -24, 8, 48);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-13, -16 + i * 11, 5, 0, 7); g.fill(); g.beginPath(); g.arc(13, -16 + i * 11, 5, 0, 7); g.fill(); } break;
    }
    case 'drift': case 'driftzone': { // swoosh arrow
      g.lineWidth = 6; g.beginPath(); g.moveTo(-20, 18); g.bezierCurveTo(-24, -6, 4, -2, 2, -14); g.stroke(); tri(g, [-8, -18, 12, -24, 8, -4]);
      if (name === 'driftzone') { g.globalAlpha = 0.6; g.beginPath(); g.arc(14, 14, 6, 0, 7); g.fill(); g.beginPath(); g.arc(22, 6, 4, 0, 7); g.fill(); g.globalAlpha = 1; } break;
    }
    case 'showcase': { // star
      g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 25, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    }
    case 'story': { // speech bubble
      g.beginPath(); g.moveTo(-22, -16); g.lineTo(22, -16); g.lineTo(22, 10); g.lineTo(-2, 10); g.lineTo(-14, 22); g.lineTo(-12, 10); g.lineTo(-22, 10); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; for (const x of [-10, 0, 10]) { g.beginPath(); g.arc(x, -3, 3.4, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; break;
    }
    case 'trap': { // camera
      g.fillRect(-22, -10, 36, 22); tri(g, [14, -4, 24, -12, 24, 18, 14, 10]);
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(-4, 1, 6, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'zone': { // gauge
      g.lineWidth = 6; g.beginPath(); g.arc(0, 8, 22, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(0, 8); g.lineTo(14, -10); g.stroke(); g.beginPath(); g.arc(0, 8, 5, 0, 7); g.fill(); break;
    }
    case 'danger': { // warning triangle
      tri(g, [0, -24, 25, 20, -25, 20]);
      g.globalCompositeOperation = 'destination-out'; g.fillRect(-3, -8, 6, 16); g.beginPath(); g.arc(0, 13, 3.5, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'trail': { // flame
      g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(16, -8, 22, 4, 14, 16); g.bezierCurveTo(8, 26, -8, 26, -14, 16); g.bezierCurveTo(-20, 4, -10, -2, -6, -12); g.bezierCurveTo(-4, -4, 2, -2, 0, -26); g.fill(); break;
    }
    case 'board': case 'boardft': { // sign on post
      g.fillRect(-3, 0, 6, 24); g.fillRect(-22, -22, 44, 24);
      g.globalCompositeOperation = 'destination-out'; g.font = '800 17px Barlow Condensed, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name === 'board' ? 'XP' : 'FT', 0, -9); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'barn': { tri(g, [-22, -2, 0, -22, 22, -2]); g.fillRect(-18, -2, 36, 24); g.globalCompositeOperation = 'destination-out'; g.fillRect(-7, 6, 14, 16); g.globalCompositeOperation = 'source-over'; break; }
    case 'house': { tri(g, [-24, 0, 0, -22, 24, 0]); g.fillRect(-17, 0, 34, 22); g.globalCompositeOperation = 'destination-out'; g.fillRect(-5, 8, 10, 14); g.globalCompositeOperation = 'source-over'; break; }
    case 'site': { // festival mark: H in a hex
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.fillRect(-12, -13, 7, 26); g.fillRect(5, -13, 7, 26); g.fillRect(-12, -3, 24, 6); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'outpost': { tri(g, [-24, 20, 0, -22, 24, 20]); g.globalCompositeOperation = 'destination-out'; tri(g, [-7, 20, 0, 4, 7, 20]); g.globalCompositeOperation = 'source-over'; break; }
    case 'checkpoint': { g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 18, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); break; }
    case 'rival': { // helmet
      g.beginPath(); g.arc(0, 2, 22, Math.PI, 0); g.lineTo(22, 16); g.lineTo(-22, 16); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.fillRect(-2, -2, 22, 9); g.globalCompositeOperation = 'source-over'; break;
    }
    case 'fasttravel': { tri(g, [-22, -14, -2, 0, -22, 14]); tri(g, [0, -14, 20, 0, 0, 14]); break; }
    case 'pickup': { g.beginPath(); g.arc(0, -10, 9, 0, 7); g.fill(); g.beginPath(); g.moveTo(-16, 22); g.quadraticCurveTo(0, -8, 16, 22); g.fill(); break; }
    case 'dropoff': { g.beginPath(); g.moveTo(0, 24); g.bezierCurveTo(-26, -4, -14, -24, 0, -24); g.bezierCurveTo(14, -24, 26, -4, 0, 24); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, -8, 7, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; break; }
    case 'target': { g.lineWidth = 5; for (const r of [22, 12]) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); break; }
    case 'lock': { g.lineWidth = 6; g.beginPath(); g.arc(0, -6, 11, Math.PI, 0); g.stroke(); g.fillRect(-17, -6, 34, 26); break; }
    case 'spin': { g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.stroke(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); g.stroke(); } break; }
    default: g.beginPath(); g.arc(0, 0, 16, 0, 7); g.fill();
  }
}
