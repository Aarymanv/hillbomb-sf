// Original icon set (24x24 design grid) used by the HUD, minimap, big map, menus and notifications.
// Each icon is a list of parts: { d: svgPathData, f: true (fill, evenodd) | w: strokeWidth }.
// svgIcon(name) -> inline <svg> string (currentColor). drawIcon(ctx, name, size) draws it on a canvas (Path2D).
// badgeSprite(kind/icon, color, shape, px) -> cached canvas for map/minimap markers.

const gear = (() => { // 8-tooth gear, evenodd hole
  let d = ''; const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 7.4 : 10;
    const p = (a, rr) => `${(12 + Math.cos(a) * rr).toFixed(2)} ${(12 + Math.sin(a) * rr).toFixed(2)}`;
    d += (i ? 'L' : 'M') + p(a0 + 0.06, r) + 'L' + p(a1 - 0.06, r);
  }
  return d + 'zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8z';
})();

export const ICONS = {
  flag: [{ d: 'M6 21V3', w: 2 }, { d: 'M7 3.5h12l-2.6 4.3L19 12H7zM10.5 3.5v4.3H14V3.5zM7 7.8V12h3.5V7.8zM14 7.8V12h3.2V7.8z', f: 1 }],
  circuit: [{ d: 'M18.2 8.2A7.6 7.6 0 1 0 19.6 13', w: 2.4 }, { d: 'M21 3.2v6.6h-6.6z', f: 1 }],
  sprint: [{ d: 'M3 5h4.2l7 7-7 7H3l7-7zM10 5h4.2l7 7-7 7H10l7-7z', f: 1 }],
  gauge: [{ d: 'M3.6 17.5a8.6 8.6 0 1 1 16.8 0', w: 2.4 }, { d: 'M12 17.5l5-5.6', w: 2.4 }, { d: 'M12 15.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4z', f: 1 }],
  danger: [{ d: 'M12 2.5l10.5 18.5h-21zM10.9 8.8h2.2l-.3 6.4h-1.6zM10.9 16.6h2.2v2.2h-2.2z', f: 1 }],
  drift: [{ d: 'M4.5 21c0-6.5 10-4.5 10-10.5C14.5 6 8 5.5 8 3', w: 2.2 }, { d: 'M10 21c0-6.5 10-4.5 10-10.5C20 6 13.5 5.5 13.5 3', w: 2.2 }],
  bolt: [{ d: 'M13.5 1.5L4 13.6h6.3L9 22.5l10-12.8h-6.5z', f: 1 }],
  house: [{ d: 'M12 2.8l9.5 8.4h-2.8V21h-4.9v-6.2h-3.6V21H5.3v-9.8H2.5z', f: 1 }],
  garage: [{ d: 'M2.5 9.2L12 3.5l9.5 5.7V21h-3v-8.5h-13V21h-3zM7 14h10v2H7zM7 17.2h10v2H7z', f: 1 }],
  car: [{ d: 'M4.2 11l2.3-5.2h11l2.3 5.2h1.4v6.4h-1.9V20h-3.2v-2.6H7.9V20H4.7v-2.6H2.8V11zM7.1 10.4h9.8l-1.3-3H8.4zM4.8 13v2h2.8v-2zM16.4 13v2h2.8v-2z', f: 1 }],
  star: [{ d: 'M12 2.2l2.95 6.2 6.8.85-5 4.7 1.3 6.75L12 17.35 5.95 20.7l1.3-6.75-5-4.7 6.8-.85z', f: 1 }],
  gem: [{ d: 'M6.5 3.5h11L22 9.2 12 21 2 9.2zM8.2 5.4L6 9h3.6zM12 5.3L10.3 9h3.4zM15.8 5.4L14.4 9H18z', f: 1 }],
  board: [{ d: 'M3 4h18v11.5H3zM5.2 6.2v7.1h13.6V6.2zM10.9 15.5h2.2V21h-2.2z', f: 1 }, { d: 'M7.5 11.5l3-3 2.5 2.2 3.3-3.5', w: 1.8 }],
  camera: [{ d: 'M3 7h3.8L8.6 4.5h6.8L17.2 7H21v12.5H3zM12 9.3a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 1 0 0-7.8z', f: 1 }],
  pin: [{ d: 'M12 1.8a7.4 7.4 0 0 1 7.4 7.4c0 5.3-7.4 13-7.4 13S4.6 14.5 4.6 9.2A7.4 7.4 0 0 1 12 1.8zM12 6.4a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 1 0 0-5.6z', f: 1 }],
  tower: [{ d: 'M11 1.5h2l1.2 5.5H9.8zM9.5 8h5l2.3 13.5H7.2zM11 12v6h2v-6z', f: 1 }],
  trophy: [{ d: 'M7 3h10v5.2a5 5 0 0 1-3.9 4.9V16h3.2v3.5H7.7V16h3.2v-2.9A5 5 0 0 1 7 8.2zM2.8 4h3.5v2H4.8v.8a2.4 2.4 0 0 0 1.6 2.3v2.1a4.4 4.4 0 0 1-3.6-4.4zM21.2 4h-3.5v2h1.5v.8a2.4 2.4 0 0 1-1.6 2.3v2.1a4.4 4.4 0 0 0 3.6-4.4z', f: 1 }],
  gear: [{ d: gear, f: 1 }],
  map: [{ d: 'M3 5.6l6-2.2 6 2.2 6-2.2v15l-6 2.2-6-2.2-6 2.2zM9 3.4v15M15 5.6v15', w: 2 }],
  grid: [{ d: 'M3.5 3.5h7.2v7.2H3.5zM13.3 3.5h7.2v7.2h-7.2zM3.5 13.3h7.2v7.2H3.5zM13.3 13.3h7.2v7.2h-7.2z', f: 1 }],
  tent: [{ d: 'M12 2.5l10 18H2zM12 9.5l-4.2 11h8.4z', f: 1 }],
  note: [{ d: 'M8.6 4.4L20 2.2v13.6a3 3 0 1 1-2.2-2.9V6.6l-7 1.4v10a3 3 0 1 1-2.2-2.9z', f: 1 }],
  shield: [{ d: 'M12 2l8.2 3.1v6.1c0 5.1-3.6 9-8.2 10.8-4.6-1.8-8.2-5.7-8.2-10.8V5.1z', f: 1 }],
  check: [{ d: 'M4.5 12.5l4.8 4.8L19.5 7', w: 3 }],
  up: [{ d: 'M12 3.5l8.5 8.5h-5.2v8.5H8.7V12H3.5z', f: 1 }],
  coin: [{ d: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 1 0 0-19zM12 5a7 7 0 1 1 0 14 7 7 0 1 1 0-14z', f: 1 }, { d: 'M14.6 9.2c-.5-.9-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 1.9 2.8.8 2.8 2.1-1.2 2.1-2.8 2.1c-1.2 0-2.3-.5-2.8-1.4M12 6.5v11', w: 1.7 }],
  door: [{ d: 'M5 21V3h11v18zM3 21h18M12.5 11.2h1.4v1.6h-1.4z', w: 2 }],
  info: [{ d: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 1 0 0-19zM10.8 10h2.4v7.5h-2.4zM10.8 6.3h2.4v2.4h-2.4z', f: 1 }],
  person: [{ d: 'M12 2.5a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 1 0 0-7.6zM4.5 21.5c0-5 3.3-9 7.5-9s7.5 4 7.5 9z', f: 1 }],
  cross: [{ d: 'M5.5 5.5l13 13M18.5 5.5l-13 13', w: 3 }],
  play: [{ d: 'M7 3.5l13 8.5-13 8.5z', f: 1 }],
  restart: [{ d: 'M5.2 12a6.8 6.8 0 1 0 2-4.8', w: 2.6 }, { d: 'M3 3.2v6.9h6.9z', f: 1 }],
  exit: [{ d: 'M10 4H4v16h6M9.5 12H21M16.5 7.5L21 12l-4.5 4.5', w: 2.4 }],
  wrench: [{ d: 'M20.8 6.3l-3.2 3.2-2.8-.4-.4-2.8 3.2-3.2a5.4 5.4 0 0 0-7 6.6L3.4 17a2.2 2.2 0 0 0 3.1 3.1l7.3-7.2a5.4 5.4 0 0 0 7-6.6z', f: 1 }],
  road: [{ d: 'M8.5 2.5L3 21.5h5l.6-3h6.8l.6 3h5L15.5 2.5zM11 6.5h2l.3 3h-2.6zM10.3 12h3.4l.4 3.6H9.9z', f: 1 }],
  mountain: [{ d: 'M1.5 20.5L8.6 8.2l4.1 6.6 2.9-4.3 6.9 10zM8.6 8.2l2.2 3.6-1.3-.6-1 1.1-.9-1.3-1.3.6z', f: 1 }],
  drag: [{ d: 'M12 1.8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5zM12 8.3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5zM12 14.8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z', f: 1 }, { d: 'M6 4.3h2.5M15.5 4.3H18M6 10.8h2.5M15.5 10.8H18M6 17.3h2.5M15.5 17.3H18', w: 2 }],
  lock: [{ d: 'M6.5 10.2V7.6a5.5 5.5 0 0 1 11 0v2.6h1.6V21H4.9V10.2zM9.2 10.2h5.6V7.6a2.8 2.8 0 0 0-5.6 0z', f: 1 }],
  compass: [{ d: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 1 0 0-19z', w: 2 }, { d: 'M12 5.5l2.6 6.5L12 18.5 9.4 12z', f: 1 }],
};

// kind -> default look + filter group on the big map
export const KINDS = {
  race: { icon: 'flag', shape: 'circle', color: '#ffc247', group: 'events', label: 'Street race' },
  sprint: { icon: 'sprint', shape: 'circle', color: '#ffc247', group: 'events', label: 'Sprint' },
  circuit: { icon: 'circuit', shape: 'circle', color: '#ffc247', group: 'events', label: 'Circuit' },
  event: { icon: 'flag', shape: 'circle', color: '#ffc247', group: 'events', label: 'Event' },
  showcase: { icon: 'trophy', shape: 'circle', color: '#ff2e7e', group: 'events', label: 'Showcase' },
  championship: { icon: 'trophy', shape: 'circle', color: '#ffc247', group: 'events', label: 'Championship' },
  speedtrap: { icon: 'gauge', shape: 'hex', color: '#3aa0ff', group: 'stunts', label: 'Speed trap' },
  speedzone: { icon: 'gauge', shape: 'hex', color: '#8f7bff', group: 'stunts', label: 'Speed zone' },
  danger: { icon: 'danger', shape: 'hex', color: '#ffd23f', group: 'stunts', label: 'Danger sign' },
  drift: { icon: 'drift', shape: 'circle', color: '#b25cff', group: 'events', label: 'Drift event' },
  stunt: { icon: 'bolt', shape: 'hex', color: '#ff8a1d', group: 'stunts', label: 'Stunt' },
  collectible: { icon: 'gem', shape: 'diamond', color: '#35d6c9', group: 'collectibles', label: 'Collectible' },
  board: { icon: 'board', shape: 'diamond', color: '#ffb21e', group: 'collectibles', label: 'Bonus board' },
  photo: { icon: 'camera', shape: 'diamond', color: '#f6f3ee', group: 'collectibles', label: 'Photo op' },
  barn: { icon: 'car', shape: 'diamond', color: '#c9a36b', group: 'collectibles', label: 'Barn find' },
  house: { icon: 'house', shape: 'square', color: '#39e07a', group: 'houses', label: 'House' },
  garage: { icon: 'garage', shape: 'square', color: '#39e07a', group: 'houses', label: 'Garage' },
  story: { icon: 'star', shape: 'shield', color: '#b25cff', group: 'story', label: 'Story' },
  mission: { icon: 'star', shape: 'shield', color: '#b25cff', group: 'story', label: 'Mission' },
  autoshow: { icon: 'car', shape: 'square', color: '#f6f3ee', group: 'places', label: 'Autoshow' },
  shop: { icon: 'car', shape: 'square', color: '#f6f3ee', group: 'places', label: 'Dealer' },
  festival: { icon: 'tent', shape: 'square', color: '#ff2e7e', group: 'places', label: 'Festival site' },
  landmark: { icon: 'tower', shape: 'circle', color: '#d6d0c4', group: 'places', label: 'Landmark' },
  interior: { icon: 'door', shape: 'square', color: '#39e07a', group: 'places', label: 'Building' },
  heroLm: { icon: 'tower', shape: 'circle', color: '#ffc247', group: 'landmarks', label: 'Landmark' },
  heroLmIn: { icon: 'door', shape: 'square', color: '#5ad1ff', group: 'landmarks', label: 'Landmark · walk-in' },
  fasttravel: { icon: 'bolt', shape: 'circle', color: '#f6f3ee', group: 'fasttravel', label: 'Fast travel' },
  waypoint: { icon: 'pin', shape: 'none', color: '#ff2e7e', group: null, label: 'Waypoint' },
  poi: { icon: 'info', shape: 'circle', color: '#d6d0c4', group: 'places', label: 'Point of interest' },
  // festival disciplines and activity kinds (src/game/festival)
  road: { icon: 'flag', shape: 'circle', color: '#ffc247', group: 'events', label: 'Road racing' },
  street: { icon: 'sprint', shape: 'circle', color: '#ff5a3c', group: 'events', label: 'Street scene' },
  dirt: { icon: 'mountain', shape: 'circle', color: '#d98a3a', group: 'events', label: 'Dirt racing' },
  xc: { icon: 'mountain', shape: 'circle', color: '#7cc94a', group: 'events', label: 'Cross country' },
  drag: { icon: 'drag', shape: 'circle', color: '#ff8a1d', group: 'events', label: 'Drag race' },
  trail: { icon: 'bolt', shape: 'hex', color: '#35d6c9', group: 'stunts', label: 'Trailblazer' },
  trap: { icon: 'gauge', shape: 'hex', color: '#3aa0ff', group: 'stunts', label: 'Speed trap' },
  zone: { icon: 'gauge', shape: 'hex', color: '#8f7bff', group: 'stunts', label: 'Speed zone' },
  driftzone: { icon: 'drift', shape: 'hex', color: '#ff6ad5', group: 'stunts', label: 'Drift zone' },
  boardft: { icon: 'bolt', shape: 'diamond', color: '#ffb21e', group: 'collectibles', label: 'Fast travel board' },
  site: { icon: 'house', shape: 'square', color: '#39e07a', group: 'houses', label: 'House' },
  outpost: { icon: 'tent', shape: 'square', color: '#ff2e7e', group: 'places', label: 'Festival outpost' },
  main: { icon: 'tent', shape: 'square', color: '#ff2e7e', group: 'places', label: 'Festival hub' },
  checkpoint: { icon: 'flag', shape: 'circle', color: '#ffc247', group: null, label: 'Checkpoint' },
  finish: { icon: 'flag', shape: 'circle', color: '#f6f3ee', group: null, label: 'Finish' },
  pickup: { icon: 'person', shape: 'circle', color: '#39e07a', group: 'story', label: 'Pickup' },
  dropoff: { icon: 'pin', shape: 'circle', color: '#39e07a', group: 'story', label: 'Drop-off' },
  target: { icon: 'star', shape: 'shield', color: '#ff2e7e', group: 'story', label: 'Target' },
  rival: { icon: 'car', shape: 'circle', color: '#ff2e7e', group: null, label: 'Rival' },
  lock: { icon: 'lock', shape: 'circle', color: '#8a8f99', group: 'events', label: 'Locked' },
};
export const GROUPS = [
  { id: 'events', label: 'Events', icon: 'flag' }, { id: 'stunts', label: 'Stunts', icon: 'gauge' },
  { id: 'collectibles', label: 'Collectibles', icon: 'gem' }, { id: 'houses', label: 'Houses', icon: 'house' },
  { id: 'fasttravel', label: 'Fast travel', icon: 'bolt' }, { id: 'story', label: 'Story', icon: 'star' },
  { id: 'places', label: 'Places', icon: 'tower' }, { id: 'landmarks', label: 'Landmarks', icon: 'tower' },
];
export const kindInfo = k => KINDS[k] || KINDS.poi;

export function svgIcon(name, size = 20, cls = '') {
  const parts = ICONS[name];
  if (!parts) return `<b class="ic-txt ${cls}" style="font-size:${Math.round(size * 0.8)}px">${esc(String(name || ''))}</b>`;
  const body = parts.map(p => p.f ? `<path d="${p.d}" fill="currentColor" fill-rule="evenodd"/>` : `<path d="${p.d}" fill="none" stroke="currentColor" stroke-width="${p.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const pathCache = new Map();
const p2d = d => { let p = pathCache.get(d); if (!p) { p = new Path2D(d); pathCache.set(d, p); } return p; };
// draws icon centred at (0,0), `size` px across, in the current fillStyle/strokeStyle
export function drawIcon(c, name, size, color) {
  const parts = ICONS[name];
  if (!parts) { // text glyph fallback (1-2 chars)
    c.fillStyle = color; c.font = `800 ${Math.round(size * 0.86)}px 'Barlow Condensed', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(name || ''), 0, size * 0.04); return;
  }
  c.save(); c.scale(size / 24, size / 24); c.translate(-12, -12);
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const p of parts) { if (p.f) c.fill(p2d(p.d), 'evenodd'); else { c.lineWidth = p.w; c.stroke(p2d(p.d)); } }
  c.restore();
}

export function shapePath(c, shape, r) {
  c.beginPath();
  if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); }
  else if (shape === 'square') { const s = r * 0.86, k = r * 0.28; c.roundRect ? c.roundRect(-s, -s, s * 2, s * 2, k) : c.rect(-s, -s, s * 2, s * 2); }
  else if (shape === 'diamond') { const s = r * 1.08; c.moveTo(0, -s); c.lineTo(s, 0); c.lineTo(0, s); c.lineTo(-s, 0); c.closePath(); }
  else if (shape === 'shield') { const s = r; c.moveTo(0, -s); c.lineTo(s * 0.92, -s * 0.62); c.lineTo(s * 0.86, s * 0.2); c.quadraticCurveTo(s * 0.7, s * 0.78, 0, s * 1.08); c.quadraticCurveTo(-s * 0.7, s * 0.78, -s * 0.86, s * 0.2); c.lineTo(-s * 0.92, -s * 0.62); c.closePath(); }
  else c.arc(0, 0, r, 0, Math.PI * 2);
}

// badge sprite: coloured shape, dark rim, white/dark glyph. px = diameter in device pixels.
const spriteCache = new Map();
export function badgeSprite(icon, color, shape, px, opts = {}) {
  const key = `${icon}|${color}|${shape}|${px}|${opts.ring ? 1 : 0}|${opts.dim ? 1 : 0}`;
  let cv = spriteCache.get(key);
  if (cv) return cv;
  const pad = Math.ceil(px * 0.22), S = px + pad * 2;
  cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.translate(S / 2, S / 2);
  const r = px / 2;
  if (shape === 'none') {
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = px * 0.12;
    drawIcon(c, icon, px * 1.1, color);
  } else {
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = px * 0.14; c.shadowOffsetY = px * 0.03;
    shapePath(c, shape, r); c.fillStyle = '#0b0c10'; c.fill();
    c.shadowColor = 'transparent';
    shapePath(c, shape, r * 0.86); c.fillStyle = opts.dim ? mix(color, '#2a2d36', 0.55) : color; c.fill();
    if (opts.ring) { shapePath(c, shape, r * 1.02); c.strokeStyle = '#fff'; c.lineWidth = px * 0.08; c.stroke(); }
    const light = lum(color) > 0.55;
    drawIcon(c, icon, px * 0.56, light ? '#0b0c10' : '#ffffff');
  }
  spriteCache.set(key, cv);
  if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value);
  return cv;
}
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) { try { const [r, g, b] = hex2rgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; } catch { return 0.5; } }
function mix(a, b, t) { try { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; } catch { return a; } }
