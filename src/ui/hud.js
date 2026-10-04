// In-game HUD: speedo/tach + PI badge, rotating minimap (GPS, markers, compass), street/district, credits/XP/level,
// skill chain, race HUD + checkpoint arrow, notifications, district banner, wanted stars, prompts, readouts.
// createHud(G) also builds the UI shell (G.ui: markers, menu, screens, map, slots, notify); see shell.js.
// Everything writes to the DOM only when a value changes; the minimap is one canvas drawn from cached map tiles.
import { injectStyles } from './style.js';
import { createMapTiles, renderMapCanvas } from './mapcanvas.js';
import { createShell } from './shell.js';
import { badgeSprite, svgIcon, kindInfo } from './icons.js';
import { CLASS_COLORS, piBadge, classOfPI } from './theme.js';
import { uiShot } from './devshot.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const setT = (e, v) => { v = String(v); if (e._v !== v) { e._v = v; e.textContent = v; } };
const setH = (e, v) => { if (e._h !== v) { e._h = v; e.innerHTML = v; } };
const tog = (e, c, b) => { b = !!b; if (e['_c' + c] !== b) { e['_c' + c] = b; e.classList.toggle(c, b); } };
const ACC = '#ff2e7e', GOLD = '#ffc247';
const LEGACY_ICON = { R: 'flag', S: 'gauge', '!': 'danger', D: 'drift' };

export function createHud(G) {
  injectStyles();
  const root = el('div', null, document.body); root.id = 'hud';
  const TL = el('div', 'h-cl h-tl', root), TC = el('div', 'h-cl h-tc', root), TR = el('div', 'h-cl h-tr', root);
  const BL = el('div', 'h-cl h-bl', root), BR = el('div', 'h-cl h-br', root), BC = el('div', 'h-cl h-bc', root), CC = el('div', 'h-cc', root);

  // ---------------------------------------------------------------- top-left: race panel + notifications
  const race = el('div', 'h-race', TL, `<div class="rc-pos"><b></b><sup></sup><span></span></div><div class="rc-rows"></div>`);
  const rcPos = race.querySelector('.rc-pos b'), rcOrd = race.querySelector('.rc-pos sup'), rcOf = race.querySelector('.rc-pos span'), rcRows = race.querySelector('.rc-rows');
  const notifyEl = el('div', 'h-nt', TL);

  // ---------------------------------------------------------------- top-centre: checkpoint arrow + skill chain
  const cpa = el('div', 'h-cpa', TC, `<div class="cpa-a"><svg viewBox="0 0 64 64"><path d="M32 4 L58 52 L32 40 L6 52 Z"/></svg></div><div class="cpa-d"></div>`);
  const cpaA = cpa.querySelector('.cpa-a'), cpaD = cpa.querySelector('.cpa-d');
  const skill = el('div', 'h-skill', TC, `<div class="sk-top"><span class="sk-total"></span><span class="sk-mult"></span></div><div class="sk-bar"><i></i></div><div class="sk-state"></div><div class="sk-feed"></div>`);
  const skTotal = skill.querySelector('.sk-total'), skMult = skill.querySelector('.sk-mult'), skBar = skill.querySelector('.sk-bar i'), skFeed = skill.querySelector('.sk-feed'), skState = skill.querySelector('.sk-state');

  // ---------------------------------------------------------------- top-right: level / xp / cash, stars, objective, activity slot
  const prog = el('div', 'h-prog', TR, `<div class="pg-cash"><i>$</i><b></b><em class="pg-pop"></em></div><div class="pg-lvl"><div class="pg-badge"><small>LVL</small><b></b></div><div class="pg-xp"><div class="pg-xpt"><span></span><em class="pg-pop"></em></div><div class="pg-bar"><i></i></div></div></div>`);
  const pgCash = prog.querySelector('.pg-cash b'), pgCashPop = prog.querySelector('.pg-cash .pg-pop'), pgLvl = prog.querySelector('.pg-badge b');
  const pgXpT = prog.querySelector('.pg-xpt span'), pgXpPop = prog.querySelector('.pg-xpt .pg-pop'), pgBar = prog.querySelector('.pg-bar i');
  const stars = el('div', 'h-stars', TR);
  for (let i = 0; i < 5; i++) el('i', null, stars, svgIcon('star', 26));
  const obj = el('div', 'h-obj', TR, '<div class="ob-k"></div><div class="ob-t"></div><div class="ob-bar"><i></i></div><div class="ob-d"></div>');
  const objK = obj.querySelector('.ob-k'), objT = obj.querySelector('.ob-t'), objB = obj.querySelector('.ob-bar i'), objD = obj.querySelector('.ob-d');
  const slotActivity = el('div', 'h-slot h-slot-activity', TR);

  // ---------------------------------------------------------------- bottom-left: location, minimap, radio slot
  const loc = el('div', 'h-loc', BL, '<b></b><small></small>');
  const locB = loc.querySelector('b'), locS = loc.querySelector('small');
  const mm = el('div', 'h-mm', BL);
  const mmc = el('canvas', null, mm);
  el('div', 'mm-ring', mm);
  const health = el('div', 'h-health', BL, '<i></i>'); const healthI = health.firstChild;
  const slotRadio = el('div', 'h-slot h-slot-radio', BL);

  // ---------------------------------------------------------------- bottom-right: speedo
  const sp = el('div', 'h-speedo', BR, `<canvas></canvas><div class="sp-num"></div><div class="sp-unit"></div><div class="sp-gear"><b></b><small>GEAR</small></div><div class="sp-pi"></div><div class="sp-dmg"><i></i></div>`);
  const spCv = sp.querySelector('canvas'), spNum = sp.querySelector('.sp-num'), spUnit = sp.querySelector('.sp-unit'), spGear = sp.querySelector('.sp-gear b');
  const spPi = sp.querySelector('.sp-pi'), spDmg = sp.querySelector('.sp-dmg'), spDmgI = sp.querySelector('.sp-dmg i');

  // ---------------------------------------------------------------- bottom-centre + centre
  const prompt = el('div', 'h-prompt', BC); prompt.id = 'prompt';
  const hint = el('div', 'h-hint', BC); hint.id = 'hint';
  const banner = el('div', 'h-banner', CC, '<h1></h1><p></p>'); banner.id = 'banner';
  const readout = el('div', 'h-readout', CC, '<div class="t"></div><div class="v"></div><div class="s"></div>'); readout.id = 'readout';
  const bust = el('div', 'h-bust', CC, '<span>BUSTING</span><div><i></i></div>');
  const district = el('div', 'h-district', CC, '<small>Entering</small><b></b><i></i>');

  // ---------------------------------------------------------------- scale (1080p = 1)
  let userScale = 1;
  function rescale() {
    const hs = Math.max(0.72, Math.min(1.7, innerHeight / 1080)) * userScale;
    root.style.setProperty('--hs', hs.toFixed(3));
    H.scale = hs;
  }
  addEventListener('resize', rescale);

  const tiles = createMapTiles(G.world);
  let legacyMap = null;
  const H = {
    root, tiles, units: 'mph', scale: 1, notifyEl,
    slots: { radio: slotRadio, activity: slotActivity },
    get map() { return legacyMap || (legacyMap = renderMapCanvas(G.world, tiles)); },
    setVisible(b) { tog(root, 'hidden', !b); },
    setScale(s) { userScale = s || 1; rescale(); },
    toast(title, sub = '', kind = '', ms = 3800) { G.ui?.notify({ title, sub, kind, ms }); },
    banner(title, sub = '', cls = '', ms = 2600) {
      banner.className = 'h-banner show ' + cls;
      banner.querySelector('h1').textContent = title; banner.querySelector('p').textContent = sub;
      banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
      clearTimeout(H._bt); if (ms) H._bt = setTimeout(() => banner.classList.remove('show'), ms);
    },
    hideBanner() { banner.classList.remove('show'); },
    // prompts have owners so systems don't clear each other's prompt
    prompt(html, owner = 'default') {
      if (html) { if (H._pOwner !== owner || H._pHtml !== html) { prompt.innerHTML = html; H._pHtml = html; } H._pOwner = owner; tog(prompt, 'on', true); }
      else if (H._pOwner === owner) { tog(prompt, 'on', false); H._pOwner = null; H._pHtml = null; }
    },
    race(data) { setRace(data); },
    readout(t, v, s, ms = 2200) {
      readout.querySelector('.t').textContent = t; readout.querySelector('.v').textContent = v; readout.querySelector('.s').textContent = s || '';
      readout.classList.remove('show'); void readout.offsetWidth; readout.classList.add('show');
      clearTimeout(H._rt); H._rt = setTimeout(() => readout.classList.remove('show'), ms);
    },
    readoutBust(t) {
      const max = G.player?.mode === 'foot' ? 1.5 : 3, f = Math.max(0, Math.min(1, (t || 0) / max));
      tog(bust, 'on', f > 0.02);
      if (f > 0.02) bust.querySelector('i').style.transform = `scaleX(${f.toFixed(3)})`;
    },
    hint(text) { setH(hint, text || ''); tog(hint, 'on', !!text); },
    skill(state) { setSkill(state); },
    district(name, sub = 'Entering') { showDistrict(name, sub); },
    objective(o) { H._objOverride = o || null; },
  };
  rescale();

  // ---------------------------------------------------------------- race HUD
  let raceOn = false, raceData = null;
  const ord = n => (n % 100 >= 11 && n % 100 <= 13) ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH';
  const strip = v => String(v ?? '').replace(/<[^>]+>/g, '');
  function setRace(data) {
    if (!data) { if (raceOn) { raceOn = false; raceData = null; tog(race, 'on', false); tog(cpa, 'on', false); } return; }
    let d = data;
    if (Array.isArray(data)) { // legacy: [['Position', '2<small>/4</small>'], ['Checkpoint', '3<small>/12</small>'], ['Time', '1:02.33']]
      d = { rows: [] };
      for (const [k, v] of data) {
        const s = strip(v), key = String(k).toLowerCase();
        if (key.startsWith('pos')) { const [a, b] = s.split('/'); d.pos = +a; d.of = +b; }
        else d.rows.push([k, s]);
      }
    } else {
      d = { ...data, rows: [...(data.rows || [])] };
      if (d.lap != null) d.rows.unshift(['Lap', `${d.lap}/${d.laps ?? '?'}`]);
      if (d.cp != null) d.rows.push(['Checkpoint', `${d.cp}/${d.cps ?? '?'}`]);
      if (d.time != null) d.rows.push(['Time', typeof d.time === 'number' ? fmtTime(d.time) : d.time]);
      if (d.gap != null) d.rows.push(['Gap', typeof d.gap === 'number' ? (d.gap >= 0 ? '+' : '−') + Math.abs(d.gap).toFixed(1) : d.gap]);
      if (d.best != null) d.rows.push(['Best', typeof d.best === 'number' ? fmtTime(d.best) : d.best]);
    }
    raceData = d;
    if (!raceOn) { raceOn = true; tog(race, 'on', true); }
    const hasPos = d.pos > 0;
    tog(race, 'nopos', !hasPos);
    if (hasPos) { setT(rcPos, d.pos); setT(rcOrd, ord(d.pos)); setT(rcOf, d.of ? '/ ' + d.of : ''); tog(race, 'p1', d.pos === 1); }
    const html = d.rows.map(([k, v]) => `<div><i>${k}</i><b>${v}</b></div>`).join('');
    setH(rcRows, html);
  }
  function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }

  // ---------------------------------------------------------------- skill chain
  let skVisible = false;
  function setSkill(st) {
    if (!st) { if (skVisible) { skVisible = false; tog(skill, 'on', false); } return; }
    if (!skVisible) { skVisible = true; tog(skill, 'on', true); }
    tog(skill, 'bank', st.status === 'bank'); tog(skill, 'lost', st.status === 'lost');
    setT(skTotal, Math.round(st.total).toLocaleString());
    setT(skMult, st.mult > 1 ? '×' + st.mult.toFixed(0) : '');
    const w = Math.max(0, Math.min(1, st.timer)).toFixed(3);
    if (skBar._w !== w) { skBar._w = w; skBar.style.transform = `scaleX(${w})`; }
    setT(skState, st.status === 'bank' ? 'Skill chain banked' : st.status === 'lost' ? 'Chain lost' : '');
    const f = st.feed || [];
    const html = f.slice(-3).reverse().map((x, i) => `<div class="${i ? '' : 'n'}">${x.name}<b>+${Math.round(x.pts).toLocaleString()}</b></div>`).join('');
    setH(skFeed, html);
  }

  // ---------------------------------------------------------------- district banner
  let curDistrict = null, pendingDistrict = null, pendT = 0, lastShown = {};
  G.on?.('start', () => { curDistrict = null; pendingDistrict = null; lastShown = {}; });
  function showDistrict(name, sub = 'Entering') {
    district.querySelector('small').textContent = sub; district.querySelector('b').textContent = name;
    district.classList.remove('show'); void district.offsetWidth; district.classList.add('show');
    clearTimeout(H._dt); H._dt = setTimeout(() => district.classList.remove('show'), 3400);
  }

  // ---------------------------------------------------------------- per-frame
  let slow = 0, mmHeading = 0, mmScale = 1, lastXp = null, lastMoney = null, xpPop = 0, cashPop = 0, xpPopT = 0, cashPopT = 0;
  let spKey = '', spPiT = 0, spPiKey = '', hiddenNow = false;
  H.update = function (dt) {
    const hide = G.ui?.hudHiddenNow ?? (G.state === 'photo');
    if (hide !== hiddenNow) { hiddenNow = hide; tog(root, 'off', hide); }
    if (hide) return;
    slow -= dt;
    const tick4 = slow <= 0; if (tick4) slow = 0.2;
    const P = G.player, v = P.vehicle;
    // speedo
    tog(sp, 'on', !!v);
    if (v) updateSpeedo(v, dt);
    // location + district banner (5 Hz)
    if (tick4) {
      const p = P.pos, street = G.world.streetName(p.x, p.z), dist = G.world.district(p.x, p.z);
      setT(locB, street || dist); setT(locS, street ? dist : '');
      if (dist !== curDistrict) {
        if (dist !== pendingDistrict) { pendingDistrict = dist; pendT = 0; }
        pendT += 0.2;
        if (pendT > 0.8) {
          const prev = curDistrict; curDistrict = dist;
          const now = performance.now();
          if (dist && dist !== 'San Francisco' && !G.events?.active && G.state === 'play' && (now - (lastShown[dist] || -1e9)) > 45000) { lastShown[dist] = now; showDistrict(dist, prev ? 'Entering' : 'San Francisco'); }
        }
      } else pendingDistrict = null;
      updateObjective();
      const onFoot = P.mode === 'foot', showHealth = onFoot && G.flags?.damage > 0;
      tog(health, 'on', showHealth);
      if (showHealth) { healthI.style.transform = `scaleX(${Math.max(0, P.health / 100).toFixed(3)})`; tog(health, 'low', P.health < 30); }
    }
    // cash / xp
    const E = G.economy;
    if (E) {
      const cm = G.flags?.creative ? -1 : Math.floor(E.displayMoney); if (pgCash._n !== cm) { pgCash._n = cm; setT(pgCash, cm < 0 ? '∞' : cm.toLocaleString()); }   // Free Roam: unlimited
      if (lastMoney != null && E.money > lastMoney + 0.5) { cashPop += E.money - lastMoney; cashPopT = 2.2; setT(pgCashPop, '+' + Math.round(cashPop).toLocaleString()); tog(pgCashPop, 'on', true); }
      if (lastXp != null && E.xp > lastXp) { xpPop += E.xp - lastXp; xpPopT = 2.2; setT(pgXpPop, '+' + Math.round(xpPop).toLocaleString() + ' XP'); tog(pgXpPop, 'on', true); }
      lastMoney = E.money; lastXp = E.xp;
      if (cashPopT > 0 && (cashPopT -= dt) <= 0) { cashPop = 0; tog(pgCashPop, 'on', false); }
      if (xpPopT > 0 && (xpPopT -= dt) <= 0) { xpPop = 0; tog(pgXpPop, 'on', false); }
      setT(pgLvl, E.level);
      if (pgXpT._n !== E.xpInLevel + '/' + E.xpForNext) { pgXpT._n = E.xpInLevel + '/' + E.xpForNext; setT(pgXpT, `${E.xpInLevel.toLocaleString()} / ${E.xpForNext.toLocaleString()} XP`); }
      const f = (E.xpInLevel / Math.max(1, E.xpForNext)).toFixed(3);
      if (pgBar._f !== f) { pgBar._f = f; pgBar.style.transform = `scaleX(${f})`; }
    }
    // wanted stars
    const W = G.police, n = W ? W.stars : 0;
    tog(stars, 'on', n > 0);
    if (n > 0 || stars._n) { for (let i = 0; i < 5; i++) tog(stars.children[i], 'lit', i < n); stars._n = n; tog(stars, 'flash', !!(W && W.searching)); }
    // checkpoint arrow
    updateArrow();
    // minimap
    drawMinimap(dt);
    tiles.pump(2.5, 1);
  };

  // ---------------------------------------------------------------- speedo
  const SEG = 44, A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
  let dialLit = -1, dialFlash = false, dialSpeedF = -1, dialRed = -1, dialSize = 0;
  function updateSpeedo(v, dt) {
    const b = v.body, mph = H.units !== 'kmh';
    const spd = Math.round(b.speed * (mph ? 2.23694 : 3.6));
    setT(spNum, spd);
    setT(spUnit, mph ? 'MPH' : 'KM/H');
    const gear = b.reverse ? 'R' : Math.abs(b.fwdSpeed) < 0.3 && v.input.throttle < 0.05 ? 'N' : v.params.ev ? 'D' : b.gear;
    setT(spGear, gear);
    const P2 = v.params, frac = Math.min(1, Math.max(0, b.rpm / (P2.redline * 1.02)));
    const redF = P2.ev ? 1 : 0.86;
    const lit = Math.round(frac * SEG);
    const limiter = frac > 0.965 && !P2.ev;
    const flash = limiter && (performance.now() % 160) < 80;
    const topKmh = v.def?.top || 250, sf = Math.min(1, (b.speed * 3.6) / topKmh);
    const sfq = Math.round(sf * 200);
    tog(sp, 'limiter', limiter);
    // canvas size
    const px = Math.round(250 * (H.scale || 1) * Math.min(2, devicePixelRatio || 1));
    if (px !== dialSize) { dialSize = px; spCv.width = spCv.height = px; dialLit = -1; }
    if (lit !== dialLit || flash !== dialFlash || sfq !== dialSpeedF || redF !== dialRed) { dialLit = lit; dialFlash = flash; dialSpeedF = sfq; dialRed = redF; drawDial(lit, redF, flash, sf); }
    // PI badge (re-evaluated every 2 s: garage upgrades can change it)
    spPiT -= dt;
    if (spPiT <= 0 || spPiKey !== v.id) { spPiT = 2; spPiKey = v.id; setH(spPi, piHtml(v)); }
    const dmg = G.flags?.damage >= 0.5;
    tog(spDmg, 'on', dmg);
    if (dmg) { const hf = (Math.max(0, v.health) / 100).toFixed(2); if (spDmgI._f !== hf) { spDmgI._f = hf; spDmgI.style.transform = `scaleX(${hf})`; tog(spDmg, 'low', v.health < 30); } }
  }
  function drawDial(lit, redF, flash, sf) {
    const c = spCv.getContext('2d'), S = spCv.width, k = S / 250, cx = S / 2, cy = S / 2;
    c.clearRect(0, 0, S, S);
    // glass disc
    const g = c.createRadialGradient(cx, cy * 0.9, 10 * k, cx, cy, 124 * k);
    g.addColorStop(0, 'rgba(18,20,28,.78)'); g.addColorStop(0.72, 'rgba(10,11,16,.66)'); g.addColorStop(1, 'rgba(10,11,16,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 124 * k, 0, Math.PI * 2); c.fill();
    // segments
    const r = 104 * k, w = 13 * k, gap = 0.012;
    const redSeg = Math.round(redF * SEG);
    c.lineWidth = w; c.lineCap = 'butt';
    for (let i = 0; i < SEG; i++) {
      const a0 = A0 + (i / SEG) * SWEEP + gap, a1 = A0 + ((i + 1) / SEG) * SWEEP - gap;
      const on = i < lit, red = i >= redSeg;
      c.strokeStyle = on ? (flash ? ACC : red ? ACC : i > lit - 3 ? '#ffffff' : 'rgba(246,243,238,.92)') : red ? 'rgba(255,46,126,.22)' : 'rgba(255,255,255,.1)';
      const rr = r + (on && i === lit - 1 ? 2 * k : 0);
      c.beginPath(); c.arc(cx, cy, rr, a0, a1); c.stroke();
    }
    // speed sweep (thin inner arc)
    c.lineWidth = 3 * k; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(cx, cy, 88 * k, A0, A0 + SWEEP); c.stroke();
    if (sf > 0.005) { c.strokeStyle = ACC; c.beginPath(); c.arc(cx, cy, 88 * k, A0, A0 + SWEEP * sf); c.stroke(); }
    // rpm ticks (x1000) along the outside
    c.fillStyle = 'rgba(246,243,238,.5)';
    for (let i = 0; i <= 8; i++) { const a = A0 + (i / 8) * SWEEP; c.beginPath(); c.arc(cx + Math.cos(a) * 118 * k, cy + Math.sin(a) * 118 * k, 1.6 * k, 0, Math.PI * 2); c.fill(); }
  }
  function piHtml(v) {
    try {
      const sp2 = G.garage?.spec?.(v.carKey || v.id);
      const pi = v.pi ?? sp2?.pi;
      if (pi) return piBadge(Math.round(pi));
    } catch { /* garage optional */ }
    let c = v.def?.cls || 'D'; if (c === 'S') c = 'S1'; if (!CLASS_COLORS[c]) c = classOfPI(500);
    return `<span class="ui-pi" style="--c:${CLASS_COLORS[c]}"><i>${c}</i></span>`;
  }

  // ---------------------------------------------------------------- objective card
  const fmtDist = m => H.units !== 'kmh' ? (m > 300 ? (m / 1609).toFixed(1) + ' MI' : Math.round(m * 3.281) + ' FT') : (m > 1000 ? (m / 1000).toFixed(1) + ' KM' : Math.round(m) + ' M');
  H.fmtDist = fmtDist;
  function pathDist(pts, from) { if (!pts || pts.length < 2) return null; let d = Math.hypot(pts[0][0] - from.x, pts[0][1] - from.z); for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
  function updateObjective() {
    const p = G.player.pos, A = G.events?.active, W = G.police, O = H._objOverride;
    let cls = '', k = '', t = '', d = '', frac = 0;
    if (O) { cls = O.cls || ''; k = O.kicker || ''; t = O.title || ''; d = O.detail || ''; frac = O.progress || 0; }
    else if (A && A.R && A.R.cps) {
      const R = A.R, i = Math.min(A.cpIdx, R.cps.length - 1), cp = R.path[R.cps[i]];
      cls = 'race'; k = R.type; t = R.name;
      d = `Checkpoint ${Math.min(A.cpIdx + 1, R.cps.length)}/${R.cps.length} · ${fmtDist(Math.hypot(cp[0] - p.x, cp[1] - p.z))}`;
      frac = A.cpIdx / R.cps.length;
    } else if (W && W.stars > 0) {
      cls = 'cop'; k = W.searching ? 'Out of sight' : 'Wanted'; t = W.searching ? 'Stay hidden' : 'Lose the cops';
      d = W.searching ? 'Keep away from patrols' : `${W.cops.filter(c => !c.v.wrecked).length} units in pursuit`;
      frac = W.searching ? Math.min(1, W.unseenT / (8 + W.stars * 3)) : 0.05;
    } else if (G.gps?.target) {
      k = 'Route'; t = G.world.district(G.gps.target.x, G.gps.target.z) || 'Waypoint';
      const dist = pathDist(G.gps.points, p) ?? Math.hypot(G.gps.target.x - p.x, G.gps.target.z - p.z);
      d = fmtDist(dist); frac = 0;
    }
    if (cls === 'race' && raceOn && !O) t = ''; // the race HUD + checkpoint arrow already say it
    tog(obj, 'on', !!t);
    if (!t) return;
    tog(obj, 'race', cls === 'race'); tog(obj, 'cop', cls === 'cop');
    setT(objK, k); setT(objT, t); setT(objD, d);
    const f = frac.toFixed(3); if (objB._f !== f) { objB._f = f; objB.style.transform = `scaleX(${f})`; }
  }

  // ---------------------------------------------------------------- checkpoint arrow
  let arrowOn = false;
  function camHeading() {
    const cam = G.rig?.rig; if (!cam) return 0;
    return G.player.mode === 'car' ? cam.yaw + cam.orbitYaw + (cam.lookBack ? Math.PI : 0) : cam.orbitYaw;
  }
  function updateArrow() {
    let tgt = raceData?.target || null;
    const A = G.events?.active;
    if (!tgt && A && A.R?.cps && A.cpIdx < A.R.cps.length && A.state !== 'countdown') { const q = A.R.path[A.R.cps[A.cpIdx]]; tgt = { x: q[0], z: q[1] }; }
    const on = !!(tgt && raceOn);
    if (on !== arrowOn) { arrowOn = on; tog(cpa, 'on', on); }
    if (!on) return;
    const p = G.player.pos, dx = tgt.x - p.x, dz = tgt.z - p.z, h = camHeading();
    const rx = dx * Math.cos(h) - dz * Math.sin(h), ry = dx * Math.sin(h) + dz * Math.cos(h);
    const ang = Math.atan2(rx, -ry);
    const a = (ang * 180 / Math.PI).toFixed(1);
    if (cpaA._a !== a) { cpaA._a = a; cpaA.style.transform = `perspective(220px) rotateX(52deg) rotate(${a}deg)`; }
    if (slow === 0.2) setT(cpaD, fmtDist(Math.hypot(dx, dz)));
  }

  // ---------------------------------------------------------------- minimap
  let mmSize = 0;
  function drawMinimap(dt) {
    const css = 250, dpr = Math.min(2, devicePixelRatio || 1), S = Math.round(css * (H.scale || 1) * dpr);
    if (S !== mmSize) { mmSize = S; mmc.width = mmc.height = S; }
    const c = mmc.getContext('2d'), P = G.player, p = P.pos;
    const northUp = G.economy?.settings?.minimapNorth;
    const heading = northUp ? 0 : camHeading();
    mmHeading += wrap(heading - mmHeading) * Math.min(1, dt * 8);
    if (northUp) mmHeading = 0;
    const speed = P.vehicle ? P.vehicle.body.speed : 0;
    const want = (P.mode === 'foot' ? 1.15 : 0.66 - Math.min(1, speed / 45) * 0.28) * (G.world.v2 ? 0.6 : 1);   // 1:1 map: show more real metres
    mmScale += (want - mmScale) * Math.min(1, dt * 2.5);
    const k = S / css; // device px per css px
    const s = mmScale * k; // device px per metre
    const cx = S / 2, cy = S * 0.6;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b1721'; c.fillRect(0, 0, S, S);
    const R = Math.hypot(Math.max(cx, S - cx), Math.max(cy, S - cy)) / s;
    const cos = Math.cos(mmHeading), sin = Math.sin(mmHeading);
    c.setTransform(s * cos, s * sin, -s * sin, s * cos, cx - s * (cos * p.x - sin * p.z), cy - s * (sin * p.x + cos * p.z));
    tiles.draw(c, s, p.x - R, p.z - R, p.x + R, p.z + R);
    // GPS route
    const route = G.gps?.points;
    if (route && route.length > 1) {
      c.beginPath();
      let started = false;
      for (let i = 0; i < route.length; i++) { const q = route[i]; if (!started) { c.moveTo(q[0], q[1]); started = true; } else c.lineTo(q[0], q[1]); }
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(10,6,12,.75)'; c.lineWidth = 8 * k / s; c.stroke();
      c.strokeStyle = G.events?.active ? GOLD : ACC; c.lineWidth = 4.6 * k / s; c.stroke();
    }
    // markers (screen space)
    c.setTransform(1, 0, 0, 1, 0, 0);
    const toS = (x, z) => { const dx = x - p.x, dz = z - p.z; return [cx + s * (cos * dx - sin * dz), cy + s * (sin * dx + cos * dz)]; };
    const rMax = S / 2 - 12 * k;
    const clampEdge = (X, Y) => { const dx = X - S / 2, dy = Y - S / 2, d = Math.hypot(dx, dy); if (d <= rMax) return [X, Y, false]; return [S / 2 + dx * rMax / d, S / 2 + dy * rMax / d, true]; };
    const size = Math.round(21 * k);
    const reg = G.ui ? G.ui.markers.list() : [];
    const occupied = [];
    for (const m of reg) {
      if (m.minimap === false || m.hidden) continue;
      let [X, Y] = toS(m.x, m.z);
      if (m.kind === 'rival') { const d2 = clampEdge(X, Y); if (!d2[2]) dot(c, X, Y, 5 * k, m.color || ACC); continue; }
      const edge = m.edge || m.kind === 'waypoint' || m.kind === 'story' || m.kind === 'mission';
      let out = false; [X, Y, out] = clampEdge(X, Y);
      if (out && !edge) continue;
      occupied.push([m.x, m.z]);
      blit(c, badgeSprite(m.icon, m.color, m.shape, out ? Math.round(size * 0.8) : size, { dim: m.done }), X, Y);
    }
    let blips = [];
    try { blips = G.blips ? G.blips() : []; } catch { /* ignore */ }
    for (const b of blips) {
      if (occupied.some(o => Math.abs(o[0] - b.x) < 6 && Math.abs(o[1] - b.z) < 6)) continue;
      let [X, Y] = toS(b.x, b.z);
      let out = false; [X, Y, out] = clampEdge(X, Y);
      if (out && !b.edge) continue;
      if (b.type === 'cop') { const on = (G.time * 4 + (b.phase || 0)) % 1 < 0.5; dot(c, X, Y, 5.5 * k, on ? '#ff3040' : '#2e7bff'); continue; }
      if (b.type === 'car') { dot(c, X, Y, 5 * k, b.color || ACC); continue; }
      if (b.type === 'waypoint') { blit(c, badgeSprite('pin', ACC, 'none', Math.round(24 * k)), X, Y - 6 * k); continue; }
      if (b.type === 'checkpoint') { blit(c, badgeSprite(String(b.icon || ''), b.color || GOLD, 'circle', Math.round(22 * k), { ring: true }), X, Y); continue; }
      let ic = LEGACY_ICON[b.icon] || (b.type === 'race' ? 'flag' : b.icon || 'info'), col = b.color || '#fff', shape = b.type === 'race' ? 'circle' : 'hex';
      if (b.name) { const k = /safehouse/i.test(b.name) ? 'house' : /motors|dealer|showroom/i.test(b.name) ? 'shop' : 'interior'; const K = kindInfo(k); ic = K.icon; shape = K.shape; if (k !== 'interior') col = K.color; }
      blit(c, badgeSprite(ic, col, shape, Math.round(size * (out ? 0.8 : 0.92))), X, Y);
    }
    // north marker on the ring
    const nx = S / 2 - sin * (S / 2 - 13 * k), ny = S / 2 - cos * (S / 2 - 13 * k);
    c.fillStyle = 'rgba(10,11,16,.85)'; c.beginPath(); c.arc(nx, ny, 9 * k, 0, Math.PI * 2); c.fill();
    c.fillStyle = ACC; c.font = `italic 800 ${Math.round(13 * k)}px 'Barlow Condensed', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + 0.5 * k);
    // player arrow
    const py = P.mode === 'car' && P.vehicle ? P.vehicle.body.yaw() : P.yaw;
    c.save(); c.translate(cx, cy); c.rotate(mmHeading - py); c.scale(k, k);
    c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 6 * k;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8.5, 9); c.lineTo(0, 4.5); c.lineTo(-8.5, 9); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent'; c.lineWidth = 1.8; c.strokeStyle = ACC; c.stroke();
    c.restore();
    // wanted flash on the ring
    const wanted = G.police && G.police.stars > 0;
    tog(mm, 'wanted', wanted);
    if (wanted) tog(mm, 'blue', !G.police.searching && (G.time * 2) % 1 < 0.5);
  }
  function blit(c, img, x, y) { c.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2)); }
  function dot(c, x, y, r, col) { c.fillStyle = '#0b0c10'; c.beginPath(); c.arc(x, y, r + 1.6, 0, Math.PI * 2); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

  // the shell (G.ui) lives next to the HUD so every sys_* module can use it during install
  createShell(G, H);
  window.__uishot = uiShot; // dev: DOM UI + WebGL capture (see devshot.js)
  return H;
}
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
