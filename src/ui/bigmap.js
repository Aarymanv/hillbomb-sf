// Full-screen map: pan (drag / WASD / stick), zoom (wheel / +- / triggers), filters, marker cards, waypoints,
// fast travel. Opens standalone (M key, G.ui.map.open) or embedded in the pause menu's Map tab (mount()).
import { BOUNDS as BOUNDS_V1 } from '../world/map.js';
import { DISTRICTS as DISTRICTS_V1, LANDMARKS as LANDMARKS_V1 } from '../world/anchors.js';
import { DISTRICTS2 } from '../world/v2/districts2.js';
import { LM2 } from '../world/v2/anchors2.js';
import { ll } from '../world/latlon.js';
import { createMapTiles } from './mapcanvas.js';
import { badgeSprite, svgIcon, GROUPS, kindInfo } from './icons.js';

const LM_NAMES = { transamerica: 'Transamerica Pyramid', salesforce: 'Salesforce Tower', coit: 'Coit Tower', ferry: 'Ferry Building', palaceFineArts: 'Palace of Fine Arts',
  paintedLadies: 'Painted Ladies', cityHall: 'City Hall', sutroTower: 'Sutro Tower', alcatraz: 'Alcatraz', oraclePark: 'Ballpark', cliffHouse: 'Cliff House',
  fishermansWharfSign: "Fisherman's Wharf", graceCathedral: 'Grace Cathedral', hawkHill: 'Hawk Hill', twinPeaks: 'Twin Peaks Summit' };
const EXTRA_LABELS = [['Golden Gate Bridge', -1640, -1820, 'bridge'], ['Bay Bridge', 2700, -640, 'bridge'], ['San Francisco Bay', 1500, -2000, 'water'], ['Pacific Ocean', -3350, 900, 'water'], ['Golden Gate', -2300, -1500, 'water']];
// v2 (1:1 map): the same labels in real lat/lon
const EXTRA_LL = [['Golden Gate Bridge', 37.8199, -122.4783, 'bridge'], ['Bay Bridge', 37.7983, -122.3778, 'bridge'], ['San Francisco Bay', 37.8150, -122.3950, 'water'], ['Pacific Ocean', 37.7600, -122.5250, 'water'], ['Golden Gate', 37.8120, -122.4900, 'water']];
const PAN = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const ZMIN = 0.07, ZMAX = 3.2;
const ACC = '#ff2e7e';

export function createBigMap(G, ui) {
  const V2 = !!G.world.v2;
  const BOUNDS = V2 && G.world.terrain?.bounds ? G.world.terrain.bounds : BOUNDS_V1;
  const DISTRICTS = V2 ? DISTRICTS2.map(d => { const [x, z] = ll(d.lat, d.lon); return { name: d.name, x, z, r: d.r * 0.5 }; }) : DISTRICTS_V1;
  const LANDMARKS = V2 ? Object.fromEntries(Object.entries(LM2).map(([k, a]) => { const [x, z] = ll(a.lat, a.lon); return [k, { x, z }]; })) : LANDMARKS_V1;
  const EXTRA = V2 ? EXTRA_LL.map(([n, lat, lon, k]) => [n, ...ll(lat, lon), k]) : EXTRA_LABELS;
  let tiles = null;
  const T = () => tiles || (tiles = ui.tiles || createMapTiles(G.world));
  const root = document.createElement('div');
  root.className = 'bm';
  root.innerHTML = `<canvas class="bm-cv"></canvas><div class="bm-vig"></div>
    <div class="bm-head"><div class="bm-title"><small>Map</small><b>San Francisco</b><span class="bm-disc"></span></div><div class="bm-filters"></div></div>
    <div class="bm-reticle"><i></i></div><div class="bm-card"></div>
    <div class="bm-scale"><i></i><span></span></div><div class="bm-foot"></div><div class="bm-list"></div>`;
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const card = root.querySelector('.bm-card'), reticle = root.querySelector('.bm-reticle'), foot = root.querySelector('.bm-foot');
  const scaleEl = root.querySelector('.bm-scale'), discEl = root.querySelector('.bm-disc'), filtersEl = root.querySelector('.bm-filters');
  const view = { cx: 1000, cz: -400, zoom: 0.3, tcx: 1000, tcz: -400, tzoom: 0.3 };
  const filters = new Set(GROUPS.map(g => g.id));
  let preset = -1; // -1 = all, else index into GROUPS
  let L = null, embedded = null, visible = false, hover = null, lastCardId = null;
  const held = new Set();
  const mouse = { x: 0, y: 0, t: 0, in: false, drag: null };
  let W = 1, H = 1, dpr = 1, t = 0, chrome = [], chromeDirty = true;

  // ---------------------------------------------------------------- filters
  function drawFilters() {
    filtersEl.innerHTML = GROUPS.map((g, i) => `<button class="bm-chip${filters.has(g.id) ? ' on' : ''}" data-g="${g.id}" title="${i + 1}">${svgIcon(g.icon, 16)}<span>${g.label}</span><em>${countGroup(g.id)}</em></button>`).join('');
    filtersEl.querySelectorAll('.bm-chip').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggle(b.dataset.g); }));
  }
  function toggle(g) { if (filters.has(g)) filters.delete(g); else filters.add(g); preset = -2; ui._sound('hover'); drawFilters(); }
  // landmarks list (shown while Landmarks is the only active filter): click = centre on it, Go = fast travel / route
  const listEl = root.querySelector('.bm-list');
  let listKey = '';
  function drawList() {
    const only = filters.size === 1 && filters.has('landmarks');
    listEl.classList.toggle('on', only);
    if (!only) { listKey = ''; return; }
    const P = G.player.pos, lm = items().filter(m => m.group === 'landmarks').map(m => [m, Math.hypot(m.x - P.x, m.z - P.z)]).sort((a, b) => a[1] - b[1]);
    const key = lm.map(([m, d]) => m.id + Math.round(d / 50)).join() + (G.flags?.creative ? 1 : 0);
    if (key === listKey) return; listKey = key;
    listEl.innerHTML = `<h4>Landmarks <em>${lm.length}</em></h4>` + lm.map(([m, d], i) => `<div class="bm-li" data-i="${i}">${svgIcon(m.icon, 14)}<span>${esc(m.title || '')}</span><em>${fmtDist(d)}</em><button data-go="${i}">${canTravel(m) ? 'Go' : 'Route'}</button></div>`).join('');
    listEl.querySelectorAll('.bm-li').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); const m = lm[+el.dataset.i]?.[0]; if (!m) return;
      if (e.target.dataset.go != null) { if (canTravel(m)) fastTravel(m); else setWaypoint(m.x, m.z); return; }
      view.tcx = m.x; view.tcz = m.z; view.tzoom = Math.max(view.tzoom, 0.9); clampView(); ui._sound('hover');
    }));
  }
  function cyclePreset(d = 1) {
    preset = preset < -1 ? -1 : preset;
    preset = ((preset + 1 + d + GROUPS.length + 1) % (GROUPS.length + 1)) - 1;
    filters.clear();
    if (preset === -1) GROUPS.forEach(g => filters.add(g.id)); else filters.add(GROUPS[preset].id);
    ui._sound('hover'); drawFilters();
    ui.notify({ title: preset === -1 ? 'Showing everything' : GROUPS[preset].label, sub: 'Map filter', icon: preset === -1 ? 'map' : GROUPS[preset].icon, ms: 1400 });
  }
  function countGroup(g) { return items().filter(m => g === 'fasttravel' ? m.fastTravel : m.group === g).length; }

  // ---------------------------------------------------------------- items (registered markers + legacy systems)
  let cacheItems = null, cacheKey = '';
  function items() {
    const ev = G.events, key = ui.markers.version + '|' + (ev?.active ? 1 : 0) + '|' + (G.flags?.events ? 1 : 0);
    if (cacheItems && key === cacheKey) return cacheItems;
    const out = ui.markers.list().filter(m => m.bigmap !== false && !m.hidden);
    const near = (x, z) => out.some(m => Math.abs(m.x - x) < 8 && Math.abs(m.z - z) < 8);
    const add = m => { if (!near(m.x, m.z)) out.push({ bigmap: true, legacy: true, ...m, ...look(m) }); };
    if (ev && (!G.flags || G.flags.events)) {
      for (const R of ev.races || []) if (!R.broken && R.path) add({ id: 'race:' + R.id, kind: R.laps ? 'circuit' : 'race', x: R.path[0][0], z: R.path[0][1], title: R.name, sub: R.desc, meta: [R.type, R.cls ? 'Class ' + R.cls : '', R.reward ? '$' + R.reward.toLocaleString() : ''].filter(Boolean).join(' · '), best: G.economy?.records?.['race:' + R.id] });
      for (const X of ev.traps || []) if (!X.broken) add({ id: 'trap:' + X.name, kind: 'speedtrap', x: X.x, z: X.z, title: X.name, sub: 'Hit it as fast as you can.' });
      for (const J of ev.jumps || []) add({ id: 'jump:' + J.name, kind: 'danger', x: J.x, z: J.z, title: J.name, sub: 'Jump the crest for distance.' });
      for (const D of ev.drifts || []) add({ id: 'drift:' + D.name, kind: 'driftzone', x: D.x, z: D.z, title: D.name, sub: 'Chain drifts inside the zone.', radius: D.r });
    }
    // named blips (interiors etc.)
    try {
      for (const b of G.blips ? G.blips() : []) {
        if (!b.name) continue;
        const kind = /safehouse/i.test(b.name) ? 'house' : /motors|dealer|showroom/i.test(b.name) ? 'shop' : 'interior';
        add({ id: 'blip:' + b.name, kind, x: b.x, z: b.z, title: b.name, sub: kind === 'house' ? 'Your place. Save, sleep, swap cars.' : 'You can walk in here.', fastTravel: kind === 'house', color: kind === 'interior' ? b.color : undefined });
      }
    } catch { /* blips optional */ }
    cacheItems = out; cacheKey = key;
    return out;
  }
  function look(m) { const k = kindInfo(m.kind); return { icon: m.icon ?? k.icon, color: m.color ?? k.color, shape: m.shape ?? k.shape, group: m.group ?? (m.fastTravel && !k.group ? 'fasttravel' : k.group), kindLabel: m.kindLabel || k.label }; }
  const shown = m => filters.has(m.group) || (m.fastTravel && filters.has('fasttravel')) || !m.group;

  // ---------------------------------------------------------------- labels
  // street label candidates: the longest segment of every named edge; placed at draw time (collision-checked)
  const streetLabels = (() => {
    const out = [];
    for (const e of G.world.graph.edges) {
      if (!e.name || e.len < 40 || e.deck || /:/.test(e.name)) continue;
      const major = e.kind === 'highway' || e.kind === 'boulevard' || e.kind === 'arterial' || e.width >= 16;
      let k = 0, lmax = 0;
      for (let i = 0; i < e.pts.length - 1; i++) { const l = Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]); if (l > lmax) { lmax = l; k = i; } }
      if (lmax < 35) continue;
      const a = e.pts[k], b = e.pts[k + 1];
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      out.push({ name: e.name, x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, ang, len: lmax, major });
    }
    out.sort((p, q) => (q.major - p.major) || (q.len - p.len));
    return out;
  })();

  // ---------------------------------------------------------------- view helpers
  const s = () => view.zoom * dpr;
  const w2s = (x, z) => [(x - view.cx) * view.zoom + W / 2, (z - view.cz) * view.zoom + H / 2];
  const s2w = (sx, sy) => [(sx - W / 2) / view.zoom + view.cx, (sy - H / 2) / view.zoom + view.cz];
  const clampView = () => {
    view.tcx = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, view.tcx)); view.tcz = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, view.tcz));
    view.tzoom = Math.max(ZMIN, Math.min(ZMAX, view.tzoom));
  };
  function zoomAt(f, sx = W / 2, sy = H / 2) {
    const [wx, wz] = [(sx - W / 2) / view.tzoom + view.tcx, (sy - H / 2) / view.tzoom + view.tcz];
    view.tzoom = Math.max(ZMIN, Math.min(ZMAX, view.tzoom * f));
    view.tcx = wx - (sx - W / 2) / view.tzoom; view.tcz = wz - (sy - H / 2) / view.tzoom;
    clampView();
  }
  const cursor = () => (mouseMode() ? [mouse.x, mouse.y] : [W / 2, H / 2]);
  const mouseMode = () => mouse.in && performance.now() - mouse.t < 2500;
  function centerOnPlayer(snap = false) {
    const p = G.player.pos; view.tcx = p.x; view.tcz = p.z;
    if (snap) { view.cx = p.x; view.cz = p.z; }
  }

  // ---------------------------------------------------------------- actions
  const racing = () => !!G.events?.active;
  function setWaypoint(x, z, silent = false) {
    if (!G.gps) return false;
    if (racing()) { ui._sound('error'); ui.notify({ title: 'Route locked', sub: 'You are in an event', kind: 'bad', ms: 1800 }); return false; }
    const cur = G.gps.target;
    if (cur && Math.hypot(cur.x - x, cur.z - z) < 10) { G.gps.setTarget(null); ui._sound('back'); return true; }
    G.gps.setTarget(x, z, ACC);
    try { const p = G.player.pos; G.gps.points = G.events?.routePoints?.(p.x, p.z, x, z) || [[p.x, p.z], [x, z]]; G.gps.timer = 1.5; } catch { /* routing optional */ }
    if (!silent) ui._sound('confirm');
    return true;
  }
  function clearWaypoint() { if (G.gps?.target) { G.gps.setTarget(null); ui._sound('back'); } }
  function canTravel(m) { return !!(m && (m.fastTravel || G.flags?.creative)) && !racing() && !(G.police?.stars > 0); }
  function fastTravel(m) {
    if (!m) return;
    if (!canTravel(m)) { ui._sound('error'); ui.notify({ title: 'Fast travel unavailable', sub: racing() ? 'Finish or quit the event first' : G.police?.stars > 0 ? 'Lose the cops first' : 'Not a fast travel point', kind: 'bad', ms: 2200 }); return; }
    ui._sound('confirm');
    closeAll();
    ui.travel(m.x, m.z, { label: 'Fast travel · ' + (m.title || '') });
    G.emit?.('fastTravel', m);
  }
  function closeAll() { if (L) ui._close(L); if (embedded) ui.menu.close(); }
  function select(m) {
    if (!m) return;
    if (m.onSelect) {
      let r; try { r = m.onSelect(m, { setWaypoint: () => setWaypoint(m.x, m.z), fastTravel: () => fastTravel(m), close: closeAll }); } catch (e) { console.error('[map] onSelect', e); }
      ui._sound('confirm');
      if (r === 'close') closeAll();
      return;
    }
    setWaypoint(m.x, m.z);
  }
  function selectAtCursor() {
    if (hover) { if (G.flags?.creative) { fastTravel(hover); return; } select(hover); return; }
    const [sx, sy] = cursor(), [x, z] = s2w(sx, sy);
    if (G.flags?.creative && !racing()) { closeAll(); ui._sound('confirm'); ui.travel(x, z, { label: 'Fast travel' }); return; }   // Free Roam: go anywhere
    setWaypoint(x, z);
  }

  // ---------------------------------------------------------------- input
  cv.addEventListener('mousedown', e => { if (e.button === 0) mouse.drag = { x: e.clientX, y: e.clientY, cx: view.tcx, cz: view.tcz, moved: false }; });
  root.addEventListener('mousemove', e => {
    const r = root.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.t = performance.now(); mouse.in = true;
    const d = mouse.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) { view.tcx = d.cx - dx / view.zoom; view.tcz = d.cz - dy / view.zoom; clampView(); view.cx = view.tcx; view.cz = view.tcz; }
  });
  root.addEventListener('mouseleave', () => { mouse.in = false; });
  addEventListener('mouseup', e => {
    const d = mouse.drag; mouse.drag = null;
    if (!d || !visible || e.button !== 0) return;
    if (!d.moved && e.target === cv) selectAtCursor();
  });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (hover && G.gps?.target && Math.hypot(G.gps.target.x - hover.x, G.gps.target.z - hover.z) < 10) clearWaypoint(); else clearWaypoint(); });
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = root.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  function onKey(e) {
    const c = e.code;
    if (PAN[c]) { if (e.hbPad) { view.tcx += PAN[c][0] * 140 / view.tzoom; view.tcz += PAN[c][1] * 140 / view.tzoom; clampView(); } else held.add(c); return true; } // pad d-pad: nudge (no keyup)
    if (e.repeat) return !!({ Equal: 1, Minus: 1, NumpadAdd: 1, NumpadSubtract: 1 })[c];
    if (c === 'Equal' || c === 'NumpadAdd') { zoomAt(1.35); return true; }
    if (c === 'Minus' || c === 'NumpadSubtract') { zoomAt(1 / 1.35); return true; }
    if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { selectAtCursor(); return true; }
    if (c === 'KeyX') { if (hover) setWaypoint(hover.x, hover.z); else if (G.gps?.target) clearWaypoint(); else { const [x, z] = s2w(...cursor()); setWaypoint(x, z); } return true; }
    if (c === 'KeyF' || c === 'KeyY') { if (hover) fastTravel(hover); else ui._sound('error'); return true; }
    if (c === 'KeyC') { centerOnPlayer(); ui._sound('hover'); return true; }
    if (c === 'KeyR') { cyclePreset(1); return true; }
    if (/^Digit[1-7]$/.test(c)) { toggle(GROUPS[+c.slice(5) - 1].id); return true; }
    if (!embedded && (c === 'KeyQ' || c === 'KeyE')) { cyclePreset(c === 'KeyQ' ? -1 : 1); return true; }
    if (!embedded && c === 'KeyM') { ui._sound('back'); closeAll(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- frame
  function resize() {
    const r = root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)), d = Math.min(2, devicePixelRatio || 1);
    if (w !== W || h !== H || d !== dpr || cv.width !== Math.round(w * d)) { W = w; H = h; dpr = d; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); chromeDirty = true; }
    if (chromeDirty) {
      chromeDirty = false;
      chrome = ['.bm-title', '.bm-filters', '.bm-foot', '.bm-scale'].map(q => root.querySelector(q)?.getBoundingClientRect()).filter(b => b && b.width).map(b => [b.left - r.left - 6, b.top - r.top - 6, b.width + 12, b.height + 12]);
    }
  }
  const isActive = () => visible && (L ? ui._top() === L : embedded && ui._top()?.kind === 'menu' && ui.menu.current() === 'map');
  function update(dt) {
    if (!visible) return;
    t += dt;
    resize();
    const active = isActive();
    // pan input
    let px = 0, py = 0;
    if (active) {
      for (const c of held) { const v = PAN[c]; if (v) { px += v[0]; py += v[1]; } }
      const P = ui.pad;
      if (P.connected) { px += P.lx + P.rx * 0.8; py += P.ly + P.ry * 0.8; const z = (P.rt - P.lt); if (Math.abs(z) > 0.05) zoomAt(Math.exp(z * dt * 2.2)); }
    }
    const pl = Math.hypot(px, py);
    if (pl > 0.01) { const sp = 820 / view.tzoom * dt * Math.min(1.4, pl); view.tcx += px / Math.max(1, pl) * sp * Math.min(1, pl); view.tcz += py / Math.max(1, pl) * sp * Math.min(1, pl); clampView(); }
    else if (hover && !mouseMode() && active) { // gentle magnet toward the hovered marker (pad / keyboard)
      view.tcx += (hover.x - view.tcx) * Math.min(1, dt * 5); view.tcz += (hover.z - view.tcz) * Math.min(1, dt * 5);
    }
    const k = 1 - Math.exp(-dt * 14);
    view.cx += (view.tcx - view.cx) * k; view.cz += (view.tcz - view.cz) * k;
    view.zoom *= Math.pow(view.tzoom / view.zoom, 1 - Math.exp(-dt * 12));
    T().pump(12, 6);
    draw();
    reticle.classList.toggle('on', !mouseMode());
  }
  function draw() {
    try { drawList(); } catch (e) { console.warn("[map] list", e); }
    const S = s();
    ctx.setTransform(S, 0, 0, S, cv.width / 2 - view.cx * S, cv.height / 2 - view.cz * S);
    ctx.fillStyle = '#0b1721'; ctx.fillRect(view.cx - W / view.zoom, view.cz - H / view.zoom, 2 * W / view.zoom, 2 * H / view.zoom);
    const x0 = view.cx - W / 2 / view.zoom, x1 = view.cx + W / 2 / view.zoom, z0 = view.cz - H / 2 / view.zoom, z1 = view.cz + H / 2 / view.zoom;
    T().draw(ctx, S, x0, z0, x1, z1);
    const list = items().filter(shown);
    // zones
    for (const m of list) if (m.radius && view.zoom > 0.18) { ctx.beginPath(); ctx.arc(m.x, m.z, m.radius, 0, Math.PI * 2); ctx.fillStyle = hexA(m.color, 0.1); ctx.fill(); ctx.lineWidth = 1.5 * dpr / S; ctx.strokeStyle = hexA(m.color, 0.5); ctx.setLineDash([6 / view.zoom, 5 / view.zoom]); ctx.stroke(); ctx.setLineDash([]); }
    // GPS route
    const route = G.gps?.points;
    if (route && route.length > 1) {
      ctx.beginPath(); ctx.moveTo(route[0][0], route[0][1]); for (let i = 1; i < route.length; i++) ctx.lineTo(route[i][0], route[i][1]);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,6,12,.8)'; ctx.lineWidth = 8 * dpr / S; ctx.stroke();
      ctx.strokeStyle = racing() ? '#ffc247' : ACC; ctx.lineWidth = 4.5 * dpr / S; ctx.stroke();
    }
    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [cx, cy] = cursor(), rad = mouseMode() ? 24 : 34;
    let best = null, bd = rad;
    const pts = [];
    for (const m of list) {
      const [sx, sy] = w2s(m.x, m.z);
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
      pts.push([m, sx, sy]);
      const d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = m; }
    }
    hover = best;
    drawLabels(pts);
    const size = Math.round(Math.max(22, Math.min(32, 22 + view.zoom * 14)));
    for (const [m, sx, sy] of pts) if (m !== hover) blit(badgeSprite(m.icon, m.color, m.shape, Math.round(size * dpr), { dim: m.done }), sx, sy);
    // waypoint
    const tg = G.gps?.target;
    if (tg && !racing()) { const [sx, sy] = w2s(tg.x, tg.z); const b = 1 + Math.sin(t * 5) * 0.06; blit(badgeSprite('pin', ACC, 'none', Math.round(34 * dpr * b)), sx, sy - 14); }
    // cops
    try { for (const b of G.blips ? G.blips() : []) if (b.type === 'cop') { const [sx, sy] = w2s(b.x, b.z); ctx.fillStyle = (t * 4) % 1 < 0.5 ? '#ff3040' : '#2e7bff'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill(); } } catch { /* ignore */ }
    // player
    const p = G.player.pos, [ppx, ppy] = w2s(p.x, p.z);
    const yaw = G.player.vehicle ? G.player.vehicle.body.yaw() : G.player.yaw;
    const pr = (t * 0.8) % 1;
    ctx.beginPath(); ctx.arc(ppx, ppy, 10 + pr * 26, 0, Math.PI * 2); ctx.strokeStyle = hexA(ACC, 0.6 * (1 - pr)); ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(ppx, ppy); ctx.rotate(-yaw);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(10, 11); ctx.lineTo(0, 5.5); ctx.lineTo(-10, 11); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2.2; ctx.strokeStyle = ACC; ctx.stroke();
    ctx.restore();
    // hovered on top
    if (hover) { const [, sx, sy] = pts.find(q => q[0] === hover) || [0, 0, 0]; blit(badgeSprite(hover.icon, hover.color, hover.shape, Math.round((size + 10) * dpr), { ring: true }), sx, sy); }
    drawCard(pts);
    drawScale();
  }
  function blit(img, sx, sy) { const w = img.width / dpr, h = img.height / dpr; ctx.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h); }
  let placed = [];
  const fits = (x, y, w, h) => { for (const r of placed) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false; placed.push([x, y, w, h]); return true; };
  function drawLabels(pts) {
    const z = view.zoom;
    placed = chrome.slice();
    for (const [, sx, sy] of pts) placed.push([sx - 14, sy - 14, 28, 28]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // districts
    const da = z < 0.1 ? 0.5 : z > 1.4 ? Math.max(0, 1 - (z - 1.4) / 0.6) : 1;
    if (da > 0) {
      ctx.font = `italic 800 ${Math.round(Math.max(13, Math.min(30, 12 + z * 22)))}px 'Barlow Condensed', sans-serif`;
      for (const d of DISTRICTS) {
        if (!d.r && !d.rect) continue;
        if (d.r > 900 && z > 0.5) continue;
        const [sx, sy] = w2s(d.x, d.z);
        if (sx < -200 || sy < -40 || sx > W + 200 || sy > H + 40) continue;
        const txt = d.name.toUpperCase();
        if (d.r && d.r < 200 && z < 0.2) continue;
        const tw = ctx.measureText(txt).width + txt.length * 2.4, th = Math.max(13, Math.min(30, 12 + z * 22));
        if (!fits(sx - tw / 2, sy - th / 2, tw, th)) continue;
        ctx.globalAlpha = da * 0.9;
        spaced(txt, sx, sy, 2.4, 'rgba(8,10,14,.75)', 'rgba(246,243,238,.82)');
      }
      ctx.globalAlpha = 1;
    }
    // streets (zoomed in)
    if (z > 0.75) {
      const a = Math.min(1, (z - 0.75) / 0.3);
      ctx.font = `600 ${Math.round(11 + Math.min(3, (z - 0.75) * 2))}px Inter, sans-serif`;
      const seen = new Map();
      for (const l of streetLabels) {
        if (!l.major && z < 1.1) continue;
        const [sx, sy] = w2s(l.x, l.z); if (sx < 20 || sy < 20 || sx > W - 20 || sy > H - 20) continue;
        const prev = seen.get(l.name);
        if (prev && prev.some(([px, py]) => Math.hypot(px - sx, py - sy) < 420)) continue;
        const tw = ctx.measureText(l.name).width;
        if (l.len * z < tw + 20) continue;
        const ca = Math.abs(Math.cos(l.ang)), sa = Math.abs(Math.sin(l.ang)), bw = tw * ca + 14 * sa, bh = tw * sa + 14 * ca;
        if (!fits(sx - bw / 2, sy - bh / 2, bw, bh)) continue;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(l.ang);
        ctx.globalAlpha = a; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,16,.85)'; ctx.strokeText(l.name, 0, 0); ctx.fillStyle = '#dfe3ea'; ctx.fillText(l.name, 0, 0);
        ctx.restore();
        (prev || seen.set(l.name, []).get(l.name)).push([sx, sy]);
      }
      ctx.globalAlpha = 1;
    }
    // water + bridges
    ctx.font = `italic 700 ${Math.round(Math.max(12, Math.min(22, 10 + z * 16)))}px 'Barlow Condensed', sans-serif`;
    for (const [n, x, zz, k] of EXTRA) { const [sx, sy] = w2s(x, zz); const tw = ctx.measureText(n).width * 1.2 + n.length * 3; if (!fits(sx - tw / 2, sy - 9, tw, 18)) continue; ctx.globalAlpha = k === 'water' ? 0.55 : 0.85; spaced(n.toUpperCase(), sx, sy, 3, 'transparent', k === 'water' ? '#6f9bb5' : '#f0b49e'); }
    ctx.globalAlpha = 1;
    // landmarks
    if (z > 0.34) {
      ctx.font = `600 ${z > 0.8 ? 12 : 11}px Inter, sans-serif`;
      for (const [k, Lm] of Object.entries(LANDMARKS)) {
        if (Lm.x == null) continue;
        const name = LM_NAMES[k] || k;
        if (DISTRICTS.some(d => d.name === name)) continue;
        const [sx, sy] = w2s(Lm.x, Lm.z); if (sx < -60 || sy < -20 || sx > W + 60 || sy > H + 20) continue;
        const tw = ctx.measureText(name).width + 6;
        if (!fits(sx - tw / 2, sy - 18, tw, 22)) continue;
        ctx.fillStyle = '#ffc247'; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,14,.8)'; ctx.strokeText(LM_NAMES[k] || k, sx, sy - 11); ctx.fillStyle = '#ffd98a'; ctx.fillText(LM_NAMES[k] || k, sx, sy - 11);
      }
    }
  }
  function spaced(txt, x, y, sp, stroke, fill) {
    // letter-spaced text (canvas letterSpacing where supported)
    if ('letterSpacing' in ctx) { ctx.letterSpacing = sp + 'px'; if (stroke !== 'transparent') { ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); } ctx.fillStyle = fill; ctx.fillText(txt, x, y); ctx.letterSpacing = '0px'; return; }
    if (stroke !== 'transparent') { ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y); } ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  }
  function fmtDist(m) { const mph = G.hud?.units !== 'kmh'; return mph ? (m > 300 ? (m / 1609).toFixed(1) + ' mi' : Math.round(m * 3.281) + ' ft') : (m > 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'); }
  function drawCard(pts) {
    if (!hover) { if (lastCardId !== null) { card.classList.remove('on'); lastCardId = null; } return; }
    const e = pts.find(q => q[0] === hover); if (!e) return;
    const m = hover, pad = ui.usingPad();
    const K = (k, p) => pad ? `<kbd class="pad">${p}</kbd>` : `<kbd>${k}</kbd>`;
    const id = m.id + '|' + pad + '|' + (G.gps?.target ? G.gps.target.x.toFixed(0) : '') + '|' + (m.title || '') + '|' + (m.sub || '');
    if (id !== lastCardId) {
      lastCardId = id;
      const d = Math.hypot(m.x - G.player.pos.x, m.z - G.player.pos.z);
      const isWp = G.gps?.target && Math.hypot(G.gps.target.x - m.x, G.gps.target.z - m.z) < 10;
      card.style.setProperty('--c', m.color);
      card.innerHTML = `<div class="bm-k">${svgIcon(m.icon, 16)}<span>${esc(m.kindLabel || '')}</span><em>${fmtDist(d)}</em></div>
        <h3>${esc(m.title || m.kindLabel || 'Marker')}</h3>${m.meta ? `<div class="bm-meta">${esc(m.meta)}</div>` : ''}${m.sub ? `<p>${esc(m.sub)}</p>` : ''}
        ${m.best ? `<div class="bm-meta">Best ${fmtTime(m.best)}</div>` : ''}
        <div class="bm-acts">${m.onSelect ? `<span>${K('Enter', 'A')}${esc(m.action || 'Select')}</span>` : ''}<span>${K(m.onSelect ? 'X' : 'Enter', m.onSelect ? 'X' : 'A')}${isWp ? 'Clear route' : 'Set route'}</span>${m.fastTravel ? `<span class="${canTravel(m) ? '' : 'off'}">${K('F', 'Y')}Fast travel</span>` : ''}</div>`;
      card.classList.add('on');
    }
    const [, sx, sy] = e;
    const cw = card.offsetWidth || 300, ch = card.offsetHeight || 140;
    let x = sx + 30, y = sy - ch / 2;
    if (x + cw > W - 20) x = sx - 30 - cw;
    y = Math.max(90, Math.min(H - ch - 70, y));
    card.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  function drawScale() {
    const mph = G.hud?.units !== 'kmh';
    const target = 110 / view.zoom; // metres across ~110 px
    const unit = mph ? 0.3048 : 1; // ft or m
    let v = target / unit; const p = Math.pow(10, Math.floor(Math.log10(v))); v = [1, 2, 5, 10].map(k => k * p).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    let label = mph ? (v >= 1760 * 3 ? `${+(v / 5280).toFixed(2)} MI` : `${v} FT`) : (v >= 1000 ? `${v / 1000} KM` : `${v} M`);
    const px = v * unit * view.zoom;
    const key = label + '|' + px.toFixed(0);
    if (scaleEl._k !== key) { scaleEl._k = key; scaleEl.querySelector('i').style.width = px.toFixed(0) + 'px'; scaleEl.querySelector('span').textContent = label; }
  }
  function drawFoot() {
    const pad = ui.usingPad();
    const K = (k, p) => pad ? `<kbd class="pad">${p}</kbd>` : `<kbd>${k}</kbd>`;
    const rows = [[pad ? K('', 'L') : K('WASD', ''), 'Move'], [pad ? K('', 'LT') + K('', 'RT') : K('Wheel', ''), 'Zoom'], [K('Enter', 'A'), 'Select'], [K('X', 'X'), 'Waypoint'], [K('F', 'Y'), 'Fast travel'], [K('R', 'L3'), 'Filter'], [K('C', 'R3'), 'Find me']];
    if (!embedded) rows.push([K('Esc', 'B'), 'Close']);
    foot.innerHTML = rows.map(([k, l]) => `<span>${k}${l}</span>`).join('');
    const fr = G.festival?.roadsDiscovered;
    let pct = null;
    try { const v = typeof fr === 'function' ? fr() : fr; if (typeof v === 'number') pct = v <= 1 ? v * 100 : v; else if (v && v.total) pct = 100 * (v.discovered ?? v.count ?? 0) / v.total; } catch { /* optional */ }
    discEl.innerHTML = pct == null ? '' : `${svgIcon('road', 14)}Roads discovered <b>${Math.round(pct)}%</b>`;
  }

  // ---------------------------------------------------------------- open / close / mount
  function prepare(opts = {}) {
    cacheItems = null;
    if (opts.filter) { filters.clear(); [].concat(opts.filter).forEach(f => filters.add(f)); preset = -2; }
    drawFilters(); drawFoot(); chromeDirty = true;
    const f = opts.focus;
    const fm = typeof f === 'string' ? ui.markers.get(f) || items().find(m => m.id === f) : f;
    if (fm && fm.x != null) { view.tcx = view.cx = fm.x; view.tcz = view.cz = fm.z; view.tzoom = view.zoom = Math.max(view.zoom, 0.7); }
    else { centerOnPlayer(true); view.tzoom = view.zoom = view.zoom < 0.2 || view.zoom > 1.6 ? 0.45 : view.zoom; }
    visible = true; hover = null; lastCardId = null; card.classList.remove('on');
    held.clear();
    resize();
  }
  let overrideMine = false;
  function open(opts = {}) {
    if (L) { prepare(opts); return; }
    embedded = null;
    root.classList.remove('embedded');
    L = ui._push({ kind: 'map', el: root, keepEl: true, pause: true, hideHud: true, onKey, wantsStick: () => true,
      onClose() { L = null; visible = false; held.clear(); if (overrideMine && G.renderOverride === OVR) G.renderOverride = null; overrideMine = false; G.emit?.('map', false); } });
    prepare(opts);
    if (!G.renderOverride) { G.renderOverride = OVR; overrideMine = true; } // opaque map: skip the 3D render while it is up
    G.emit?.('map', true);
  }
  const OVR = { render() { /* big map covers the screen */ } };
  function close() { if (L) ui._close(L); }
  // embed into a container (the menu's Map tab); returns tab hooks
  function mount(el) {
    return {
      onShow() { embedded = el; root.classList.add('embedded'); el.appendChild(root); prepare({}); },
      onHide() { if (embedded === el) { embedded = null; visible = false; root.remove(); } },
      onKey,
      wantsStick: () => true,
      hints: [],
      destroy() { if (embedded === el) { embedded = null; visible = false; root.remove(); } },
    };
  }
  return {
    open, close, mount,
    isOpen: () => !!L,
    isVisible: () => visible,
    setWaypoint, clearWaypoint,
    _tick: update,
    get view() { return view; },
  };
}
function hexA(h, a) { if (!h || h[0] !== '#') return h; let s = h.slice(1); if (s.length === 3) s = s.split('').map(c => c + c).join(''); const n = parseInt(s, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
