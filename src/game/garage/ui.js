// Garage screens: My Cars, Autoshow, Upgrades, Tuning, Paint, Collection, plus car select (pickCar) and the new-car
// reveal. One full-screen G.ui.screen layer over the 3D studio (G.renderOverride). Keyboard + gamepad through the
// UI shell's [data-nav] focus (arrows / stick, Enter / A, Esc / B); Q / E (LB / RB) switch tabs; rows with el._adjust
// take left / right as value changes. Mouse: click, drag to orbit, wheel to zoom.
import { CARS, MAKES, CATEGORIES, ROSTER_KEYS, perfOf, buildDef, carParams } from '../../vehicle/cars.js';
import { UPGRADES, UPGRADE_CATS, partOptions, TUNE, tuneAvailable, TYRES, SWAPS, classOfPI, classMaxPI, CLASS_ORDER, PI_BANDS } from '../../vehicle/tuning.js';
import { FINISHES, RIM_STYLES, RIM_FINISHES, LIVERIES } from '../../vehicle/models.js';
import { createStudio } from './studio.js';
import { DEFAULT_LOOK } from './store.js';

export const CLASS_COLORS = { D: '#3bc4f4', C: '#f7d51d', B: '#ff8a1d', A: '#ff3b4e', S1: '#b04cf0', S2: '#2f6df0', X: '#35d65a' };
export const RARITY_COL = { common: '#a7b0ba', rare: '#3aa0ff', epic: '#b25cff', legendary: '#ffb21e' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString();
const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
export const piBadge = (pi, big = false) => { const c = classOfPI(pi); return `<span class="gx-pi${big ? ' big' : ''}" style="--c:${CLASS_COLORS[c]}"><i>${c}</i><b>${pi}</b></span>`; };
const STATS = [['speed', 'Speed'], ['handling', 'Handling'], ['accel', 'Acceleration'], ['launch', 'Launch'], ['braking', 'Braking'], ['offroad', 'Offroad']];
export const PALETTE = [0xf4f4f2, 0xd9d9d6, 0xa9adb0, 0x6c7075, 0x3a3d42, 0x121316, 0x0a0a0c, 0xc8141a, 0x9b1d20, 0x6b1e34, 0xe8601c, 0xf2a114, 0xf2d21b, 0xd8c79a, 0x9fd0c9,
  0x6fc13b, 0x1f7a3d, 0x1f3a2c, 0x40503a, 0x3c6e8f, 0x2f7fd1, 0x1d57c2, 0x1d3f9e, 0x1b2e5c, 0x5d3fa0, 0xc21a8c, 0xff6ad5, 0x7fb2cf, 0xa06a2c, 0x5a3a22];

function injectCss() {
  if (document.getElementById('gx-style')) return;
  const s = document.createElement('style'); s.id = 'gx-style';
  s.textContent = `
.gx{position:absolute;inset:0;color:var(--ink,#f6f3ee);font-family:var(--sans,Inter,sans-serif);pointer-events:auto;
  background:linear-gradient(90deg,rgba(5,6,10,.82) 0,rgba(5,6,10,.55) 29%,rgba(5,6,10,0) 42%,rgba(5,6,10,0) 64%,rgba(5,6,10,.5) 76%,rgba(5,6,10,.8) 100%)}
.gx-top{position:absolute;left:44px;right:44px;top:30px;display:flex;align-items:flex-start;gap:24px}
.gx-kick{font:800 11px/1 var(--sans);letter-spacing:.3em;text-transform:uppercase;color:var(--acc,#ff2e7e)}
.gx-title{margin-top:8px;font:italic 900 48px/.92 var(--cond,'Barlow Condensed',sans-serif);text-transform:uppercase;letter-spacing:.005em;text-shadow:0 2px 18px rgba(0,0,0,.5)}
.gx-title small{display:block;margin-top:6px;font:600 13px/1.2 var(--sans);letter-spacing:.14em;color:var(--dim,rgba(246,243,238,.62));text-transform:uppercase;font-style:normal}
.gx-cash{margin-left:auto;text-align:right;font:italic 900 34px/1 var(--cond);text-shadow:0 2px 12px rgba(0,0,0,.6)}
.gx-cash small{display:block;font:700 11px/1.4 var(--sans);letter-spacing:.2em;color:var(--dim);font-style:normal}
.gx-tabs{position:absolute;left:44px;top:128px;display:flex;gap:4px;align-items:center}
.gx-tab{border:0;background:transparent;color:var(--dim);font:italic 800 21px/1 var(--cond);text-transform:uppercase;padding:9px 14px;cursor:pointer;letter-spacing:.02em}
.gx-tab.on{color:var(--ink);box-shadow:inset 0 -3px 0 var(--acc)}
.gx-tab.focus,.gx-tab:hover{color:var(--ink);background:rgba(255,255,255,.06)}
.gx-tabs kbd{display:inline-block;min-width:18px;padding:3px 6px;border-radius:4px;background:rgba(255,255,255,.14);font:700 11px/1.2 var(--sans);margin:0 6px;color:var(--ink)}
.gx-panel{position:absolute;box-sizing:border-box}
.gx-left{left:44px;top:178px;bottom:62px;width:392px;display:flex;flex-direction:column}
.gx-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent;padding-right:6px;flex:1;min-height:0}
.gx-right{right:44px;top:128px;bottom:62px;width:352px;display:flex;flex-direction:column;gap:12px}
.gx-h{font:800 10.5px/1 var(--sans);letter-spacing:.26em;text-transform:uppercase;color:var(--dim);margin:14px 2px 8px}
.gx-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 4px;border:0;cursor:pointer;text-align:left;color:var(--ink);
  background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);font:500 13px/1.25 var(--sans);transition:background .12s,box-shadow .12s,padding .12s}
.gx-row:hover,.gx-row.focus{background:rgba(255,46,126,.16);box-shadow:inset 3px 0 0 var(--acc),inset 0 0 0 1px rgba(255,46,126,.35)}
.gx-row.sel{box-shadow:inset 3px 0 0 var(--acc2,#ffc247),inset 0 0 0 1px rgba(255,194,71,.3)}
.gx-row.dim{opacity:.5}
.gx-row .n{flex:1;min-width:0}.gx-row .n b{display:block;font:italic 800 19px/1.05 var(--cond);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-row .n span{display:block;color:var(--dim);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-row .v{font:italic 800 17px/1 var(--cond);white-space:nowrap}
.gx-row .v.good{color:#39e07a}.gx-row .v.gold{color:var(--acc2,#ffc247)}.gx-row .v.bad{color:#ff5a6a}
.gx-row .adj{display:flex;align-items:center;gap:8px;font:italic 800 17px/1 var(--cond);white-space:nowrap}
.gx-row .adj:before{content:'\\2039';opacity:.5;font-size:20px}.gx-row .adj:after{content:'\\203A';opacity:.5;font-size:20px}
.gx-rar{position:absolute;left:0;top:0;bottom:0;width:3px}
.gx-pi{display:inline-flex;align-items:stretch;font:italic 800 15px/1 var(--cond);border-radius:3px;overflow:hidden;box-shadow:0 0 0 2px var(--c);flex:none}
.gx-pi i{font-style:italic;background:var(--c);color:#0b0c10;padding:4px 7px}.gx-pi b{background:#0b0c10;color:#fff;padding:4px 7px;min-width:28px;text-align:center}
.gx-pi.big{font-size:26px}.gx-pi.big i,.gx-pi.big b{padding:6px 10px}
.gx-card{background:rgba(8,9,13,.78);box-shadow:0 14px 40px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.06);padding:16px 18px;backdrop-filter:blur(6px)}
.gx-card .hd{display:flex;align-items:center;gap:12px}.gx-card .hd .nm{flex:1;font:italic 800 20px/1 var(--cond);text-transform:uppercase}
.gx-card .hd .nm small{display:block;font:600 11px/1.3 var(--sans);letter-spacing:.12em;color:var(--dim);font-style:normal;margin-top:3px}
.gx-stat{display:grid;grid-template-columns:92px 1fr 34px;align-items:center;gap:8px;margin-top:8px;font:600 11.5px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.gx-stat .b{position:relative;height:7px;background:rgba(255,255,255,.1);border-radius:1px;overflow:hidden}
.gx-stat .b i{position:absolute;top:0;bottom:0;left:0;background:var(--ink)}.gx-stat .b i.up{background:#39e07a}.gx-stat .b i.dn{background:#ff4d5e}
.gx-stat b{font:italic 800 16px/1 var(--cond);color:var(--ink);text-align:right}.gx-stat b.up{color:#39e07a}.gx-stat b.dn{color:#ff5a6a}
.gx-spec{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:12px}
.gx-spec div{font:600 10px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.gx-spec div b{display:block;margin-top:4px;font:italic 800 18px/1 var(--cond);letter-spacing:.01em;color:var(--ink);text-transform:none;white-space:nowrap}
.gx-spec div b.up{color:#39e07a}.gx-spec div b.dn{color:#ff5a6a}
.gx-btn{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 16px;border:0;cursor:pointer;background:rgba(255,255,255,.07);color:var(--ink);
  font:italic 800 21px/1 var(--cond);text-transform:uppercase;letter-spacing:.02em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.gx-btn.primary{background:var(--acc);box-shadow:none}.gx-btn:hover,.gx-btn.focus{box-shadow:inset 0 0 0 3px var(--ink)}
.gx-btn[disabled]{opacity:.45;cursor:default}.gx-btn small{font:600 12px/1 var(--sans);text-transform:none;letter-spacing:0;opacity:.85}
.gx-hints{position:absolute;left:44px;right:44px;bottom:22px;display:flex;gap:20px;font:600 12.5px/1 var(--sans);color:var(--dim)}
.gx-hints kbd{display:inline-block;min-width:18px;padding:4px 7px;margin-right:7px;border-radius:4px;background:rgba(255,255,255,.14);font:700 11px/1.2 var(--sans);text-align:center;color:var(--ink)}
.gx-note{font:500 12px/1.45 var(--sans);color:var(--dim);margin:6px 2px}
.gx-sw{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;margin-bottom:6px}
.gx-sw button{aspect-ratio:1;border:0;cursor:pointer;border-radius:3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.gx-sw button.focus,.gx-sw button:hover{box-shadow:0 0 0 2px var(--ink),0 0 0 4px var(--acc)}.gx-sw button.on{box-shadow:0 0 0 2px var(--acc2)}
.gx-slider{position:relative;height:6px;width:120px;background:rgba(255,255,255,.14);border-radius:3px;flex:none}
.gx-slider i{position:absolute;top:-4px;width:6px;height:14px;margin-left:-3px;background:var(--ink);border-radius:2px}
.gx-slider em{position:absolute;top:0;bottom:0;left:0;background:var(--acc)}
.gx-lock{font:700 10px/1 var(--sans);letter-spacing:.16em;color:var(--acc2);text-transform:uppercase}
.gx-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.gx-chips .gx-row{width:auto;flex:1 1 30%;margin:0;padding:8px 10px}
.gx-reveal{position:absolute;left:0;right:0;bottom:92px;text-align:center;pointer-events:none}
.gx-reveal .k{font:800 13px/1 var(--sans);letter-spacing:.5em;color:var(--acc2);animation:gx-rise .6s .6s both}
.gx-reveal h1{margin:12px 0 0;font:italic 900 78px/.9 var(--cond);text-transform:uppercase;text-shadow:0 4px 30px rgba(0,0,0,.6);animation:gx-rise .7s .9s both}
.gx-reveal p{margin:10px 0 0;font:600 14px/1.4 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--dim);animation:gx-rise .7s 1.1s both}
.gx-reveal .gx-pi{margin-top:16px;animation:gx-rise .7s 1.3s both}
@keyframes gx-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.gx-toast{position:absolute;left:50%;top:190px;transform:translateX(-50%);padding:12px 22px;background:rgba(8,9,13,.9);font:italic 800 22px/1 var(--cond);text-transform:uppercase;box-shadow:inset 3px 0 0 var(--acc);animation:gx-rise .25s both;pointer-events:none}
@media (max-width:1100px){.gx-right{width:300px}.gx-left{width:340px}.gx-title{font-size:38px}}
`;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------------------------------------ the screen
export function createGarageUI(G, api) {
  const TABS = [['mycars', 'My cars'], ['autoshow', 'Autoshow'], ['upgrades', 'Upgrades'], ['tuning', 'Tuning'], ['paint', 'Paint'], ['collection', 'Collection']];
  let studio = null, layer = null, root = null, prevOverride = null, st = null, hudWasHidden = false;
  const units = () => (G.hud?.units === 'kmh' ? 'kmh' : 'mph');
  const spd = kmh => (units() === 'mph' ? Math.round(kmh / 1.609) + ' mph' : Math.round(kmh) + ' km/h');
  const busy = () => !!G.events?.active || (G.police?.stars || 0) > 0;
  const sound = n => { try { G.audio?.ui?.(n); } catch { /* optional */ } };

  // ------------------------------------------------------------------ open / close
  function open(mode = 'mycars', opts = {}) {
    injectCss();
    if (layer) close(true);
    studio ||= createStudio(G.renderer);
    root = document.createElement('div'); root.className = 'gx';
    st = { mode, opts, tab: TABS.find(t => t[0] === mode) ? mode : 'mycars', edit: opts.key || api.current() || api.owned()[0] || 'hatch', focusKey: null, filter: { cls: 'All', cat: 'All', make: 'All' }, part: null, tuneDraft: null, dirtyPhys: new Set(), resolve: opts.resolve || null, previewT: 0, previewKey: null, toastT: 0 };
    if (!api.owned().includes(st.edit)) st.edit = api.owned()[0] || st.edit;
    const scr = G.ui?.screen;
    const onBack = () => { if (st.part) { st.part = null; draw(); return false; } finish(null); return false; };
    if (scr) layer = scr.open(root, { onBack, pause: true, hud: false });
    else { document.body.appendChild(root); root.style.cssText = 'position:fixed;inset:0;z-index:70'; layer = { el: root, close: () => root.remove(), focus: () => {}, refresh: () => {} }; }
    studio.attach(root);
    // main.js skips hud.update() while a render override is active, so hide the HUD ourselves
    hudWasHidden = G.hud?.root ? G.hud.root.classList.contains('hidden') : !!document.getElementById('hud')?.classList.contains('hidden');
    document.getElementById('hud')?.classList.add('hidden');
    prevOverride = G.renderOverride;
    G.renderOverride = { update: dt => { studio.update(dt, G.ui?.pad); tick(dt); }, render: (r, dt) => studio.render(r, dt) };
    addEventListener('keydown', onKey, true);
    if (mode === 'reveal') { studio.frame.shift = 0; studio.showCar(opts.key, { build: api.buildOf(opts.key), look: api.lookOf(opts.key), keepCamera: false }); studio.reveal(); drawReveal(); return; }
    if (mode === 'pick') { studio.frame.shift = 0.02; drawPick(); return; }
    studio.frame.shift = 0.01;
    showEdit(false);
    draw();
    sound('click');
  }
  function finish(value) {
    const res = st?.resolve; close(); res?.(value);
  }
  function close(silent = false) {
    if (!layer) return;
    removeEventListener('keydown', onKey, true);
    // physics-affecting edits: respawn the player's car so it drives with the new build
    if (st?.dirtyPhys?.size) for (const k of st.dirtyPhys) api.refreshPlayerCar(k);
    const L = layer; layer = null;
    studio?.detach();
    if (G.renderOverride && G.renderOverride !== prevOverride) G.renderOverride = prevOverride || null;
    if (!hudWasHidden) document.getElementById('hud')?.classList.remove('hidden');
    try { L.close(); } catch { /* already closed */ }
    root = null;
    if (!silent) sound('back');
    api.store.save();
  }
  const isOpen = () => !!layer;

  // Q / E tab switching (window capture runs before the shell's document capture; pads synthesize KeyQ / KeyE)
  function onKey(e) {
    if (!layer || !st || st.mode === 'pick' || st.mode === 'reveal') {
      if (layer && st?.mode === 'reveal' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) { e.preventDefault(); e.stopPropagation(); finish(true); }
      return;
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'PageUp' || e.code === 'PageDown') {
      e.preventDefault(); e.stopPropagation();
      const i = TABS.findIndex(t => t[0] === st.tab), d = e.code === 'KeyQ' || e.code === 'PageUp' ? -1 : 1;
      setTab(TABS[(i + d + TABS.length) % TABS.length][0]);
    }
  }
  function setTab(t) { if (!st || st.tab === t) return; st.tab = t; st.part = null; st.focusKey = null; sound('hover'); showEdit(true); draw(); }
  function showEdit(keep = true) {
    const k = st.tab === 'autoshow' ? (st.focusKey || st.edit) : st.edit;
    if (studio.key !== k || !keep) studio.showCar(k, { build: api.buildOf(k), look: api.lookOf(k), keepCamera: keep });
  }
  function previewCar(k, stock = false) {
    // debounce model swaps while scrolling
    st.previewKey = k; st.previewStock = stock; st.previewT = 0.12;
  }
  function tick(dt) {
    if (!st) return;
    if (st.previewKey && (st.previewT -= dt) <= 0) {
      const k = st.previewKey; st.previewKey = null;
      if (studio.key !== k) studio.showCar(k, { build: st.previewStock ? null : api.buildOf(k), look: st.previewStock ? null : api.lookOf(k) });
    }
    if (st.toastT > 0 && (st.toastT -= dt) <= 0) root?.querySelector('.gx-toast')?.remove();
  }
  function toast(msg, ok = true) {
    root?.querySelector('.gx-toast')?.remove();
    const t = document.createElement('div'); t.className = 'gx-toast'; t.innerHTML = msg; if (!ok) t.style.boxShadow = 'inset 3px 0 0 #ff4d5e'; root?.appendChild(t); st.toastT = 2.2;
    sound(ok ? 'confirm' : 'error');
  }

  // ------------------------------------------------------------------ layout
  function frameHTML(title, sub, left, right, hints) {
    const E = G.economy;
    const tabs = st.mode === 'pick' ? '' : `<nav class="gx-tabs"><kbd>Q</kbd>${TABS.map(([id, n]) => `<button class="gx-tab${id === st.tab ? ' on' : ''}" data-tab="${id}">${n}</button>`).join('')}<kbd>E</kbd></nav>`;
    return `<div class="gx-top"><div><div class="gx-kick">${esc(st.mode === 'pick' ? (st.opts.kicker || 'Car select') : 'Garage')}</div><div class="gx-title">${title}<small>${sub}</small></div></div>
      <div class="gx-cash"><small>Credits</small>${money(E?.money ?? 0)}</div></div>${tabs}
      <div class="gx-panel gx-left">${left}</div><div class="gx-panel gx-right">${right}</div>
      <div class="gx-hints">${(hints || [['Enter', 'Select'], ['Esc', 'Back'], ['Q/E', 'Tabs'], ['Drag', 'Rotate']]).map(([k, l]) => `<span><kbd>${k}</kbd>${l}</span>`).join('')}</div>`;
  }
  function carTitle(k) { const d = CARS[k]; return `<span style="color:var(--dim);font-weight:800">${esc(d.makeName)}</span> ${esc(d.modelName)}`; }
  function carSub(k) { const d = CARS[k]; return `${d.year} · ${esc(d.country)} · ${esc(CATEGORIES[d.cat] || d.cat)} · <span style="color:${RARITY_COL[d.rarity]}">${d.rarity}</span>`; }
  function wire() {
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    layer.refresh?.();
  }
  function draw() {
    if (!root || !st) return;
    const fn = { mycars: drawMyCars, autoshow: drawAutoshow, upgrades: drawUpgrades, tuning: drawTuning, paint: drawPaint, collection: drawCollection }[st.tab];
    const t = root.querySelector('.gx-toast');
    fn();
    if (t) root.appendChild(t);
    wire();
  }
  // right-hand car card: PI badge, stat bars (before -> after), key specs
  function cardHTML(k, build, cmp = null, { price = null, extra = '' } = {}) {
    const m = perfOf(k, build), d = buildDef(k, build), c = cmp;
    const bar = (id, name) => {
      const a = (c ? c.stats[id] : m.stats[id]), b = m.stats[id];
      const lo = Math.min(a, b), hi = Math.max(a, b), up = b > a + 0.05, dn = b < a - 0.05;
      return `<div class="gx-stat"><span>${name}</span><div class="b"><i style="width:${lo * 10}%"></i>${up || dn ? `<i class="${up ? 'up' : 'dn'}" style="left:${lo * 10}%;width:${(hi - lo) * 10}%"></i>` : ''}</div><b class="${up ? 'up' : dn ? 'dn' : ''}">${b.toFixed(1)}</b></div>`;
    };
    const cmpv = (v, o, better, fmt) => { if (o == null || v == null || Math.abs(v - o) < 1e-6) return `<b>${fmt(v)}</b>`; const good = better === 'hi' ? v > o : v < o; return `<b class="${good ? 'up' : 'dn'}">${fmt(v)}</b>`; };
    const t60 = units() === 'mph' ? m.t60 : m.t100, t60c = c ? (units() === 'mph' ? c.t60 : c.t100) : null;
    return `<div class="gx-card"><div class="hd">${piBadge(m.pi, true)}<div class="nm">${esc(d.makeName)} ${esc(d.modelName)}<small>${d.year} · ${esc(d.eng || d.engine)} · ${d.drive}</small></div></div>
      ${STATS.map(([id, n]) => bar(id, n)).join('')}
      <div class="gx-spec">
        <div>Power${cmpv(d.hp, c?.hpDef, 'hi', v => Math.round(v) + ' hp')}</div><div>Weight${cmpv(d.mass, c?.massDef, 'lo', v => Math.round(v).toLocaleString() + ' kg')}</div>
        <div>${units() === 'mph' ? '0-60 mph' : '0-100 km/h'}${cmpv(t60, t60c, 'lo', v => (v ? v.toFixed(1) + ' s' : '—'))}</div><div>Top speed${cmpv(m.vmax, c?.vmax, 'hi', v => spd(v))}</div>
        <div>Braking${cmpv(m.brake100, c?.brake100, 'lo', v => (units() === 'mph' ? Math.round(v * 0.9324 * 3.281) + ' ft' : v.toFixed(1) + ' m'))}</div><div>Lateral${cmpv(m.lat120, c?.lat120, 'hi', v => v.toFixed(2) + ' g')}</div>
      </div>${price != null ? `<div class="gx-spec"><div>Price<b style="color:var(--acc2)">${price === 0 ? 'Owned' : money(price)}</b></div><div>Class band<b>${classOfPI(m.pi)} ${PI_BANDS.find(b => b[0] === classOfPI(m.pi))?.slice(1).join('-')}</b></div></div>` : ''}${extra}</div>`;
  }
  const withDefs = (k, build) => { const m = perfOf(k, build), d = buildDef(k, build); return { ...m, hpDef: d.hp, massDef: d.mass }; };

  // ------------------------------------------------------------------ My cars
  function drawMyCars() {
    const own = api.owned(), cur = api.current();
    const k = st.focusKey && own.includes(st.focusKey) ? st.focusKey : st.edit;
    const list = own.slice().sort((a, b) => (a === cur ? -1 : b === cur ? 1 : perfOf(b, api.buildOf(b)).pi - perfOf(a, api.buildOf(a)).pi));
    const rows = list.map(id => { const d = CARS[id], m = perfOf(id, api.buildOf(id)), i = api.store.get(id);
      return `<button class="gx-row${id === k ? ' sel' : ''}" data-nav ${id === k ? 'data-nav-default' : ''} data-car="${id}"><i class="gx-rar" style="background:${RARITY_COL[d.rarity]}"></i>${piBadge(m.pi)}<span class="n"><b>${esc(d.makeName)} ${esc(d.modelName)}</b><span>${d.year} · ${id === cur ? '<span style="color:var(--acc2)">Driving</span>' : Object.keys(i?.up || {}).some(x => i.up[x]) ? 'Upgraded' : 'Stock'} · ${Math.round((i?.odo || 0) / (units() === 'mph' ? 1609 : 1000))} ${units() === 'mph' ? 'mi' : 'km'}</span></span></button>`; }).join('');
    const right = cardHTML(k, api.buildOf(k)) + `<div class="gx-card" style="display:flex;flex-direction:column;gap:6px">
      <button class="gx-btn primary" data-nav data-act="drive" ${busy() || k === cur && G.player?.vehicle?.id === k ? 'disabled' : ''}>${k === cur && G.player?.vehicle?.id === k ? 'In use' : 'Get in'}<small>${busy() ? 'Not during events or chases' : 'Delivered to you'}</small></button>
      <button class="gx-btn" data-nav data-act="upgrades">Upgrade<small>${api.store.get(k) ? Object.values(api.store.get(k).up).filter(Boolean).length : 0} parts</small></button>
      <button class="gx-btn" data-nav data-act="tuning">Tune</button><button class="gx-btn" data-nav data-act="paint">Paint & wheels</button></div>`;
    root.innerHTML = frameHTML(carTitle(k), carSub(k), `<div class="gx-h">${own.length} car${own.length === 1 ? '' : 's'}</div><div class="gx-scroll">${rows || '<p class="gx-note">No cars yet. Visit the Autoshow.</p>'}</div>`, right);
    root.querySelectorAll('[data-car]').forEach(b => {
      b.addEventListener('navfocus', () => { if (st.focusKey !== b.dataset.car) { st.focusKey = b.dataset.car; st.edit = b.dataset.car; previewCar(b.dataset.car); refreshRight(); } });
      b.addEventListener('click', () => { st.edit = b.dataset.car; driveCar(b.dataset.car); });
    });
    root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act; st.edit = k;
      if (a === 'drive') driveCar(k); else setTab(a);
    }));
  }
  function refreshRight() {
    // rebuild only the right column + title for the focused car (keeps list focus)
    const k = st.focusKey || st.edit, r = root.querySelector('.gx-right');
    if (!r) return;
    if (st.tab === 'mycars') drawMyCarsRight(k, r);
    else if (st.tab === 'autoshow') drawAutoRight(k, r);
    root.querySelector('.gx-title').innerHTML = `${carTitle(k)}<small>${carSub(k)}</small>`;
    layer.refresh?.();
  }
  function drawMyCarsRight(k, r) {
    const cur = api.current();
    r.innerHTML = cardHTML(k, api.buildOf(k)) + `<div class="gx-card" style="display:flex;flex-direction:column;gap:6px">
      <button class="gx-btn primary" data-nav data-act="drive" ${busy() || k === cur && G.player?.vehicle?.id === k ? 'disabled' : ''}>${k === cur && G.player?.vehicle?.id === k ? 'In use' : 'Get in'}<small>${busy() ? 'Not during events or chases' : 'Delivered to you'}</small></button>
      <button class="gx-btn" data-nav data-act="upgrades">Upgrade</button><button class="gx-btn" data-nav data-act="tuning">Tune</button><button class="gx-btn" data-nav data-act="paint">Paint & wheels</button></div>`;
    r.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { const a = b.dataset.act; st.edit = k; if (a === 'drive') driveCar(k); else setTab(a); }));
  }
  function driveCar(k) {
    if (busy()) { toast('Not during events or police chases', false); return; }
    const cb = st.opts.onDrive;
    api.setCurrent(k, { deliver: !cb });
    close();
    cb?.(k);
  }

  // ------------------------------------------------------------------ Autoshow
  function autoList() {
    const f = st.filter;
    return ROSTER_KEYS.filter(k => CARS[k].buyable && (f.cls === 'All' || CARS[k].cls === f.cls) && (f.cat === 'All' || CARS[k].cat === f.cat) && (f.make === 'All' || CARS[k].make === f.make))
      .sort((a, b) => (CARS[a].makeName.localeCompare(CARS[b].makeName)) || CARS[a].year - CARS[b].year);
  }
  function drawAutoshow() {
    const list = autoList(), f = st.filter;
    if (st.opts.key && !st._keyed) { st._keyed = true; st.focusKey = st.opts.key; if (!list.includes(st.opts.key)) { st.filter = { cls: 'All', cat: 'All', make: 'All' }; return drawAutoshow(); } }
    const k = st.focusKey && list.includes(st.focusKey) ? st.focusKey : list[0] || st.edit;
    st.focusKey = k;
    const clsOpts = ['All', ...CLASS_ORDER.filter(c => c !== 'X')], catOpts = ['All', ...Object.keys(CATEGORIES).filter(c => c !== 'special')], makeOpts = ['All', ...Object.keys(MAKES).filter(m => ROSTER_KEYS.some(k => CARS[k].make === m && CARS[k].buyable))];
    const chip = (id, label, val) => `<button class="gx-row" data-nav data-chip="${id}"><span class="n"><span style="margin:0">${label}</span></span><span class="adj">${esc(val)}</span></button>`;
    const rows = list.map(id => { const d = CARS[id], own = api.owned().includes(id);
      return `<button class="gx-row${id === k ? ' sel' : ''}" data-nav ${id === k ? 'data-nav-default' : ''} data-car="${id}"><i class="gx-rar" style="background:${RARITY_COL[d.rarity]}"></i>${piBadge(d.pi)}<span class="n"><b>${esc(d.makeName)} ${esc(d.modelName)}</b><span>${d.year} · ${esc(CATEGORIES[d.cat])}</span></span><span class="v ${own ? 'good' : 'gold'}">${own ? 'Owned' : money(d.price)}</span></button>`; }).join('');
    root.innerHTML = frameHTML(carTitle(k), carSub(k), `<div class="gx-chips">${chip('cls', 'Class', f.cls)}${chip('cat', 'Type', f.cat === 'All' ? 'All' : CATEGORIES[f.cat])}${chip('make', 'Make', f.make === 'All' ? 'All' : MAKES[f.make].name)}</div>
      <div class="gx-h">${list.length} cars · ${api.owned().filter(x => CARS[x].buyable).length}/${ROSTER_KEYS.filter(x => CARS[x].buyable).length} owned</div><div class="gx-scroll">${rows || '<p class="gx-note">No cars match these filters.</p>'}</div>`, '<div></div>',
      [['Enter', 'Buy'], ['Esc', 'Back'], ['Q/E', 'Tabs'], ['◂ ▸', 'Filters'], ['Drag', 'Rotate']]);
    drawAutoRight(k, root.querySelector('.gx-right'));
    const opts = { cls: clsOpts, cat: catOpts, make: makeOpts };
    root.querySelectorAll('[data-chip]').forEach(b => {
      const id = b.dataset.chip;
      b._adjust = d => { const o = opts[id], i = o.indexOf(f[id]); f[id] = o[(i + d + o.length) % o.length]; st.focusKey = null; sound('hover'); draw(); layer.focus?.(root.querySelector(`[data-chip="${id}"]`)); };
      b.addEventListener('click', () => b._adjust(1));
    });
    root.querySelectorAll('[data-car]').forEach(b => {
      b.addEventListener('navfocus', () => { if (st.focusKey !== b.dataset.car) { st.focusKey = b.dataset.car; previewCar(b.dataset.car, !api.owned().includes(b.dataset.car)); refreshRight(); } });
      b.addEventListener('click', () => buy(b.dataset.car));
    });
    previewCar(k, !api.owned().includes(k));
  }
  function drawAutoRight(k, r) {
    const d = CARS[k], own = api.owned().includes(k), E = G.economy, can = E.money >= d.price;
    const dealer = !!st.opts.onPick;
    r.innerHTML = cardHTML(k, own ? api.buildOf(k) : null, null, { price: own ? 0 : d.price }) + `<div class="gx-card"><p class="gx-note" style="margin-top:0">${esc(MAKES[d.make]?.blurb || '')}</p>
      <button class="gx-btn primary" data-nav data-act="buy" ${own && !dealer ? 'disabled' : ''}>${own ? (dealer ? 'Take it out' : 'In your garage') : can ? 'Buy ' + money(d.price) : 'Need ' + money(d.price - E.money)}<small>${own ? (dealer ? 'Delivered to the drive-out door' : '') : can ? 'Leaves ' + money(E.money - d.price) : 'Win events to earn credits'}</small></button></div>`;
    r.querySelector('[data-act="buy"]')?.addEventListener('click', () => buy(k));
  }
  function buy(k) {
    const d = CARS[k], E = G.economy, cb = st.opts.onPick;
    if (api.owned().includes(k)) { if (cb) { api.setCurrent(k); close(); cb(k, false); return; } st.edit = k; setTab('mycars'); return; }
    if (!E.spend(d.price)) { toast(`Need ${money(d.price - E.money)} more`, false); return; }
    api.store.add(k, 'autoshow'); st.edit = k;
    sound('purchase');
    G.hud?.banner?.('SOLD', d.name, 'gold', 2200);
    if (cb) { api.setCurrent(k); close(); cb(k, true); return; }
    toast(`${esc(d.name)} is yours`);
    draw();
  }

  // ------------------------------------------------------------------ Upgrades
  function drawUpgrades() {
    const k = st.edit, inst = api.store.get(k);
    if (!inst) { st.tab = 'autoshow'; draw(); return; }
    const d0 = CARS[k], build = api.buildOf(k), up = build.up;
    if (st.part) return drawPart(k);
    const base = withDefs(k, build);
    let rows = '';
    // auto-upgrade: pick a class, preview, buy
    const curCls = classOfPI(perfOf(k, build).pi), targets = CLASS_ORDER.slice(CLASS_ORDER.indexOf(curCls));
    st.autoCls = targets.includes(st.autoCls) ? st.autoCls : targets[Math.min(1, targets.length - 1)];
    rows += `<div class="gx-h">Quick upgrade</div><button class="gx-row" data-nav data-auto><span class="n"><b>Upgrade to class</b><span>Best parts that fit, to the top of the class</span></span><span class="adj">${st.autoCls} ${classMaxPI(st.autoCls)}</span></button>`;
    for (const [cat, cname] of UPGRADE_CATS) {
      const parts = UPGRADES.filter(u => u.cat === cat && partOptions(u, d0).length > 1);
      if (!parts.length) continue;
      rows += `<div class="gx-h">${cname}</div>`;
      for (const u of parts) {
        const opts = partOptions(u, d0), v = up[u.id] ?? (u.tyre ? d0.tyre || 'street' : 0), o = opts.find(x => x.value === v) || opts[0];
        rows += `<button class="gx-row" data-nav data-part="${u.id}"><span class="n"><b>${u.name}</b><span>${esc(o.name)}</span></span><span class="v">${v && v !== (d0.tyre || 'street') ? '●' : ''}</span></button>`;
      }
    }
    root.innerHTML = frameHTML(carTitle(k), 'Upgrades · ' + carSub(k), `<div class="gx-scroll">${rows}</div>`, cardHTML(k, build, base) + `<div class="gx-card"><p class="gx-note" style="margin:0">Parts you have bought stay in your garage: switching back is free. Every change is measured on the test track, so PI always reflects real pace.</p><button class="gx-btn" data-nav data-act="stock" style="margin-top:10px">Revert to stock<small>free</small></button></div>`,
      [['Enter', 'Open'], ['Esc', 'Back'], ['Q/E', 'Tabs'], ['◂ ▸', 'Class']]);
    const auto = root.querySelector('[data-auto]');
    auto._adjust = dd => { const i = targets.indexOf(st.autoCls); st.autoCls = targets[(i + dd + targets.length) % targets.length]; auto.querySelector('.adj').textContent = `${st.autoCls} ${classMaxPI(st.autoCls)}`; sound('hover'); autoPreview(k); };
    auto.addEventListener('navfocus', () => autoPreview(k));
    auto.addEventListener('click', () => autoApply(k));
    root.querySelectorAll('[data-part]').forEach(b => {
      b.addEventListener('click', () => { st.part = b.dataset.part; draw(); });
      b.addEventListener('navfocus', () => { const r = root.querySelector('.gx-right'); r.firstElementChild.outerHTML = cardHTML(k, build, base); });
    });
    root.querySelector('[data-act="stock"]').addEventListener('click', () => { inst.up = {}; inst.tune = {}; api.store.touch(); st.dirtyPhys.add(k); studio.showCar(k, { build: api.buildOf(k), look: api.lookOf(k) }); toast('Back to stock'); draw(); });
  }
  let autoPlan = null;
  function autoPreview(k) {
    autoPlan = api.autoUpgrade(k, st.autoCls);
    const r = root.querySelector('.gx-right'); if (!r || !autoPlan) return;
    const build = api.buildOf(k);
    r.innerHTML = cardHTML(k, { ...build, up: autoPlan.up }, withDefs(k, build)) + `<div class="gx-card"><div class="gx-spec"><div>Parts<b>${autoPlan.parts}</b></div><div>Cost<b style="color:var(--acc2)">${money(autoPlan.cost)}</b></div></div><p class="gx-note">${autoPlan.pi > classMaxPI(st.autoCls) ? 'Cannot fit this class.' : autoPlan.parts ? 'Press Enter to buy and fit.' : 'Already at the top of this class.'}</p></div>`;
  }
  function autoApply(k) {
    if (!autoPlan || !autoPlan.parts) { toast('Nothing to fit', false); return; }
    if (!G.economy.spend(autoPlan.cost)) { toast(`Need ${money(autoPlan.cost - G.economy.money)} more`, false); return; }
    const inst = api.store.get(k); inst.up = { ...autoPlan.up }; inst.inv = { ...(inst.inv || {}), ...autoPlan.inv };
    api.store.touch(); st.dirtyPhys.add(k); sound('purchase');
    studio.showCar(k, { build: api.buildOf(k), look: api.lookOf(k) });
    toast(`Upgraded to ${classOfPI(perfOf(k, api.buildOf(k)).pi)} ${perfOf(k, api.buildOf(k)).pi}`);
    draw();
  }
  function drawPart(k) {
    const u = UPGRADES.find(x => x.id === st.part), inst = api.store.get(k), d0 = CARS[k], build = api.buildOf(k);
    const opts = partOptions(u, d0), cur = build.up[u.id] ?? (u.tyre ? d0.tyre || 'street' : 0), base = withDefs(k, build);
    const owns = v => v === 0 || v === (d0.tyre || 'street') || inst.inv?.[u.id + ':' + v];
    const rows = opts.map(o => `<button class="gx-row${o.value === cur ? ' sel' : ''}" data-nav ${o.value === cur ? 'data-nav-default' : ''} data-opt="${o.value}"><span class="n"><b>${esc(o.name)}</b><span>${o.value === cur ? 'Installed' : owns(o.value) ? 'In your garage' : ''}</span></span><span class="v ${owns(o.value) ? 'good' : 'gold'}">${owns(o.value) ? (o.value === cur ? '✓' : 'Free') : money(o.price)}</span></button>`).join('');
    root.innerHTML = frameHTML(carTitle(k), `${u.name} · ${carSub(k)}`, `<div class="gx-h">${u.name}</div><div class="gx-scroll">${rows}</div>${u.swap ? '<p class="gx-note">Engine swaps change the engine note, power band and weight.</p>' : u.tyre ? '<p class="gx-note">Rally and off-road tyres trade asphalt grip for dirt and grass. Drift tyres let go early and progressively.</p>' : ''}`, cardHTML(k, build, base),
      [['Enter', 'Buy / fit'], ['Esc', 'Parts'], ['Drag', 'Rotate']]);
    const val = v => (u.tyre || u.swap ? (v === '0' ? 0 : v) : +v);
    root.querySelectorAll('[data-opt]').forEach(b => {
      const v = val(b.dataset.opt);
      b.addEventListener('navfocus', () => { const tb = { ...build, up: { ...build.up, [u.id]: v } }; root.querySelector('.gx-right').innerHTML = cardHTML(k, tb, base); });
      b.addEventListener('click', () => {
        const o = opts.find(x => String(x.value) === String(v));
        if (!owns(v)) { if (!G.economy.spend(o.price)) { toast(`Need ${money(o.price - G.economy.money)} more`, false); return; } inst.inv = { ...(inst.inv || {}), [u.id + ':' + v]: 1 }; sound('purchase'); }
        inst.up = { ...inst.up, [u.id]: v };
        if (!v || v === (d0.tyre || 'street')) delete inst.up[u.id];
        api.store.touch(); st.dirtyPhys.add(k);
        if (u.id === 'aeroR' || u.id === 'aeroF' || u.id === 'swap') studio.showCar(k, { build: api.buildOf(k), look: api.lookOf(k) });
        toast(`${esc(o.name.replace(' (stock)', ''))} fitted`);
        st.part = null; draw();
        layer.focus?.(root.querySelector(`[data-part="${u.id}"]`));
      });
    });
  }

  // ------------------------------------------------------------------ Tuning
  function drawTuning() {
    const k = st.edit, inst = api.store.get(k);
    if (!inst) { st.tab = 'autoshow'; draw(); return; }
    const d0 = CARS[k], build = api.buildOf(k), P0 = carParams(k, { up: build.up });
    st.tuneDraft ||= { ...inst.tune };
    const T = st.tuneDraft;
    let rows = '', grp = '';
    for (const t of TUNE) {
      const ok = tuneAvailable(t, buildDef(k, build), build.up);
      if (t.group !== grp) { grp = t.group; rows += `<div class="gx-h">${t.group}</div>`; }
      const v = T[t.id] ?? t.def(P0), f = (v - t.min) / (t.max - t.min);
      const lock = !ok ? `<span class="gx-lock">${t.needs === 'trans' ? 'Needs race transmission' : t.needs === 'awdCar' ? 'AWD only' : 'Needs ' + (UPGRADES.find(u => u.id === t.needs)?.name || t.needs)}</span>` : '';
      rows += `<button class="gx-row${ok ? '' : ' dim'}" data-nav data-tune="${t.id}" ${ok ? '' : 'data-locked'}><span class="n"><b style="font-size:16px">${t.name}</b><span>${lock || (t.phys === 'proxy' ? '<span title="physics.js param pending">≈ approximated</span>' : 'direct')}</span></span>${ok ? `<span class="gx-slider"><em style="width:${f * 100}%"></em><i style="left:${f * 100}%"></i></span><span class="v" style="min-width:58px;text-align:right">${fmtTune(t, v)}</span>` : ''}</button>`;
    }
    const tb = { ...build, tune: { ...T } };
    root.innerHTML = frameHTML(carTitle(k), 'Tuning · ' + carSub(k), `<div class="gx-scroll">${rows}</div>`, cardHTML(k, tb, withDefs(k, build)) + `<div class="gx-card" style="display:flex;flex-direction:column;gap:6px">
      <button class="gx-btn primary" data-nav data-act="save">Save tune</button><button class="gx-btn" data-nav data-act="reset">Reset to default</button>
      <p class="gx-note">◂ ▸ adjusts. Sliders marked ≈ are approximated on the current physics model.</p></div>`,
      [['◂ ▸', 'Adjust'], ['Enter', 'Save'], ['Esc', 'Back'], ['Q/E', 'Tabs']]);
    root.querySelectorAll('[data-tune]').forEach(b => {
      if (b.hasAttribute('data-locked')) return;
      const t = TUNE.find(x => x.id === b.dataset.tune);
      b._adjust = dd => {
        const v0 = T[t.id] ?? t.def(P0), v = Math.round(Math.min(t.max, Math.max(t.min, v0 + dd * t.step * (t.step < 0.05 ? 5 : 1))) / t.step) * t.step;
        T[t.id] = +v.toFixed(3);
        const f = (T[t.id] - t.min) / (t.max - t.min);
        b.querySelector('em').style.width = f * 100 + '%'; b.querySelector('i').style.left = f * 100 + '%'; b.querySelector('.v').textContent = fmtTune(t, T[t.id]);
        clearTimeout(b._t); b._t = setTimeout(() => { root.querySelector('.gx-right').firstElementChild.outerHTML = cardHTML(k, { ...build, tune: { ...T } }, withDefs(k, build)); }, 60);
      };
      b.addEventListener('click', () => saveTune(k));
    });
    root.querySelector('[data-act="save"]').addEventListener('click', () => saveTune(k));
    root.querySelector('[data-act="reset"]').addEventListener('click', () => { st.tuneDraft = {}; api.store.get(k).tune = {}; api.store.touch(); st.dirtyPhys.add(k); toast('Tune reset'); draw(); });
  }
  function fmtTune(t, v) { return (t.unit === 'x' ? v.toFixed(2) + '×' : t.unit === '%' ? Math.round(v) + '%' : t.unit === ':1' ? v.toFixed(2) + ':1' : t.step < 1 ? (+v).toFixed(t.step < 0.1 ? 2 : 1) + ' ' + t.unit : Math.round(v) + ' ' + t.unit).trim(); }
  function saveTune(k) { const inst = api.store.get(k); inst.tune = { ...st.tuneDraft }; api.store.touch(); st.dirtyPhys.add(k); toast('Tune saved'); }

  // ------------------------------------------------------------------ Paint & wheels
  function drawPaint() {
    const k = st.edit, inst = api.store.get(k);
    if (!inst) { st.tab = 'autoshow'; draw(); return; }
    const L = inst.look ||= DEFAULT_LOOK(k);
    L.livery ||= { kind: 'none', color: 0xffffff, color2: 0x111111, number: 27 };
    const row = (id, name, val) => `<button class="gx-row" data-nav data-p="${id}"><span class="n"><b style="font-size:16px">${name}</b></span><span class="adj">${esc(val)}</span></button>`;
    const sw = (id, cur) => `<div class="gx-sw">${PALETTE.map(c => `<button data-nav data-sw="${id}" data-c="${c}" class="${c === cur ? 'on' : ''}" style="background:${hex(c)}"></button>`).join('')}</div>`;
    const rimName = L.rim ? RIM_STYLES[L.rim] : 'Stock', finName = L.rimFinish && L.rimFinish !== 'stock' ? RIM_FINISHES[L.rimFinish][0] : 'Stock';
    const left = `<div class="gx-scroll">
      <div class="gx-h">Body colour</div>${sw('paint', L.paint)}
      ${row('finish', 'Finish', FINISHES[L.finish || 'metallic'].name)}${row('hue', 'Custom hue', Math.round(hueOf(L.paint)) + '°')}${row('light', 'Custom shade', Math.round(lightOf(L.paint) * 100) + '%')}
      <div class="gx-h">Livery</div>${row('livery', 'Design', LIVERIES[L.livery.kind] || 'None')}${row('lcol', 'Livery colour', swName(L.livery.color))}${row('lcol2', 'Number colour', swName(L.livery.color2))}${row('num', 'Race number', L.livery.number)}
      ${CARS[k].paint2 != null ? row('paint2', 'Secondary colour', swName(L.paint2 ?? CARS[k].paint2)) : ''}
      <div class="gx-h">Wheels</div>${row('rim', 'Rim style', rimName)}${row('rimFinish', 'Rim finish', finName)}${row('rimColor', 'Rim colour (custom)', swName(L.rimColor ?? 0xc9ccd1))}${row('caliper', 'Brake calipers', swName(L.caliper ?? 0x1d1d1f))}
      <div class="gx-h">Glass</div>${row('tint', 'Window tint', Math.round((L.tint || 0) * 100) + '%')}
    </div>`;
    root.innerHTML = frameHTML(carTitle(k), 'Paint & wheels · ' + carSub(k), left, `<div class="gx-card"><p class="gx-note" style="margin:0">Paint, finish, livery, rims and tint are free and saved to this car. Changes show on the car right away.</p>
      <button class="gx-btn" data-nav data-act="shot" style="margin-top:10px">Front 3/4 · Rear 3/4 · Side<small>view</small></button><button class="gx-btn" data-nav data-act="def" style="margin-top:6px">Factory colours<small>reset</small></button></div>`,
      [['◂ ▸', 'Change'], ['Enter', 'Apply swatch'], ['Esc', 'Back'], ['Q/E', 'Tabs']]);
    const apply = () => { api.store.touch(); studio.setLook(L); api.applyLookLive(k); };
    const cyc = (arr, cur, d) => arr[(arr.indexOf(cur) + d + arr.length * 2) % arr.length];
    const setRow = (id, v) => { const b = root.querySelector(`[data-p="${id}"] .adj`); if (b) b.textContent = v; };
    const adj = {
      finish: d => { L.finish = cyc(Object.keys(FINISHES), L.finish || 'metallic', d); setRow('finish', FINISHES[L.finish].name); },
      hue: d => { L.paint = hslHex((hueOf(L.paint) + d * 6 + 360) % 360, Math.max(0.35, satOf(L.paint)), lightOf(L.paint)); setRow('hue', Math.round(hueOf(L.paint)) + '°'); },
      light: d => { L.paint = hslHex(hueOf(L.paint), satOf(L.paint), Math.min(0.92, Math.max(0.04, lightOf(L.paint) + d * 0.03))); setRow('light', Math.round(lightOf(L.paint) * 100) + '%'); },
      livery: d => { L.livery.kind = cyc(Object.keys(LIVERIES), L.livery.kind, d); setRow('livery', LIVERIES[L.livery.kind]); },
      lcol: d => { L.livery.color = cyc(PALETTE, L.livery.color, d); setRow('lcol', swName(L.livery.color)); },
      lcol2: d => { L.livery.color2 = cyc(PALETTE, L.livery.color2, d); setRow('lcol2', swName(L.livery.color2)); },
      num: d => { L.livery.number = Math.max(0, Math.min(99, (L.livery.number | 0) + d)); setRow('num', L.livery.number); },
      paint2: d => { L.paint2 = cyc(PALETTE, L.paint2 ?? CARS[k].paint2, d); setRow('paint2', swName(L.paint2)); },
      rim: d => { const o = [null, ...Object.keys(RIM_STYLES)]; L.rim = cyc(o, L.rim ?? null, d); setRow('rim', L.rim ? RIM_STYLES[L.rim] : 'Stock'); },
      rimFinish: d => { const o = ['stock', ...Object.keys(RIM_FINISHES)]; L.rimFinish = cyc(o, L.rimFinish || 'stock', d); setRow('rimFinish', L.rimFinish === 'stock' ? 'Stock' : RIM_FINISHES[L.rimFinish][0]); },
      rimColor: d => { L.rimColor = cyc(PALETTE, L.rimColor ?? 0xc9ccd1, d); L.rimFinish = 'paint'; setRow('rimColor', swName(L.rimColor)); setRow('rimFinish', 'Custom'); },
      caliper: d => { L.caliper = cyc([0x1d1d1f, 0xb01a20, 0xf2c200, 0x2f6df0, 0x6fc13b, 0xe8601c, 0xefefef, 0xc21a8c], L.caliper ?? 0x1d1d1f, d); setRow('caliper', swName(L.caliper)); },
      tint: d => { L.tint = Math.max(0, Math.min(1, +((L.tint || 0) + d * 0.1).toFixed(2))); setRow('tint', Math.round(L.tint * 100) + '%'); },
    };
    root.querySelectorAll('[data-p]').forEach(b => { const f = adj[b.dataset.p]; b._adjust = d => { f(d); sound('hover'); apply(); }; b.addEventListener('click', () => b._adjust(1)); });
    root.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => { L.paint = +b.dataset.c; root.querySelectorAll('[data-sw].on').forEach(x => x.classList.remove('on')); b.classList.add('on'); setRow('hue', Math.round(hueOf(L.paint)) + '°'); setRow('light', Math.round(lightOf(L.paint) * 100) + '%'); apply(); sound('click'); }));
    let vi = 0;
    root.querySelector('[data-act="shot"]').addEventListener('click', () => { studio.view(['f34', 'r34', 'side'][vi++ % 3]); });
    root.querySelector('[data-act="def"]').addEventListener('click', () => { inst.look = DEFAULT_LOOK(k); apply(); studio.setLook(inst.look); draw(); });
  }
  const swName = c => hex(c ?? 0).toUpperCase();

  // ------------------------------------------------------------------ Collection
  function drawCollection() {
    const makes = Object.keys(MAKES).filter(m => ROSTER_KEYS.some(k => CARS[k].make === m && CARS[k].buyable));
    const own = new Set(api.owned());
    st.colMake = makes.includes(st.colMake) ? st.colMake : makes[0];
    const total = ROSTER_KEYS.filter(k => CARS[k].buyable).length, have = ROSTER_KEYS.filter(k => CARS[k].buyable && own.has(k)).length;
    const rows = makes.map(m => { const cars = ROSTER_KEYS.filter(k => CARS[k].make === m && CARS[k].buyable), n = cars.filter(k => own.has(k)).length, done = n === cars.length, claimed = api.store.claimed(m);
      return `<button class="gx-row${m === st.colMake ? ' sel' : ''}" data-nav data-make="${m}"><span class="n"><b>${esc(MAKES[m].name)}</b><span>${esc(MAKES[m].country)} · ${n}/${cars.length} cars</span></span><span class="v ${claimed ? '' : done ? 'gold' : ''}">${claimed ? '✓' : done ? 'Claim' : Math.round(n / cars.length * 100) + '%'}</span></button>`; }).join('');
    root.innerHTML = frameHTML(`Collection <span style="color:var(--dim)">${have}/${total}</span>`, 'Own every car from a maker to earn its reward', `<div class="gx-h">Manufacturers</div><div class="gx-scroll">${rows}</div>`, '<div></div>',
      [['Enter', 'Claim'], ['Esc', 'Back'], ['Q/E', 'Tabs']]);
    const drawMake = m => {
      const cars = ROSTER_KEYS.filter(k => CARS[k].make === m && CARS[k].buyable), rw = api.collectionReward(m);
      root.querySelector('.gx-right').innerHTML = `<div class="gx-card"><div class="hd"><div class="nm">${esc(MAKES[m].name)}<small>${esc(MAKES[m].blurb)}</small></div></div>
        ${cars.map(k => `<div class="gx-stat" style="grid-template-columns:18px 1fr auto;text-transform:none;letter-spacing:0;font-size:13px"><span style="color:${own.has(k) ? '#39e07a' : 'var(--dim)'}">${own.has(k) ? '✓' : '○'}</span><span style="color:var(--ink)">${esc(CARS[k].modelName)} <span style="color:var(--dim)">${CARS[k].year}</span></span>${piBadge(CARS[k].pi)}</div>`).join('')}
        <div class="gx-spec"><div>Reward<b style="color:var(--acc2)">${money(rw.money)} + ${rw.xp.toLocaleString()} XP</b></div><div>Status<b>${api.store.claimed(m) ? 'Claimed' : cars.every(k => own.has(k)) ? 'Ready' : `${cars.filter(k => own.has(k)).length}/${cars.length}`}</b></div></div></div>`;
      const first = cars.find(k => own.has(k)) || cars[0]; previewCar(first, !own.has(first));
    };
    root.querySelectorAll('[data-make]').forEach(b => {
      b.addEventListener('navfocus', () => { st.colMake = b.dataset.make; drawMake(b.dataset.make); });
      b.addEventListener('click', () => { const r = api.claimCollection(b.dataset.make); if (r) { toast(`${esc(MAKES[b.dataset.make].name)} collection: +${money(r.money)}`); draw(); } else sound('error'); });
    });
    drawMake(st.colMake);
  }

  // ------------------------------------------------------------------ car select (events)
  function drawPick() {
    const list = st.opts.list;
    const k = st.focusKey && list.includes(st.focusKey) ? st.focusKey : list[0];
    st.focusKey = k;
    const rows = list.map(id => { const d = CARS[id], m = perfOf(id, api.owned().includes(id) ? api.buildOf(id) : null);
      return `<button class="gx-row${id === k ? ' sel' : ''}" data-nav ${id === k ? 'data-nav-default' : ''} data-car="${id}"><i class="gx-rar" style="background:${RARITY_COL[d.rarity]}"></i>${piBadge(m.pi)}<span class="n"><b>${esc(d.makeName)} ${esc(d.modelName)}</b><span>${d.year} · ${esc(CATEGORIES[d.cat])}</span></span></button>`; }).join('');
    const f = st.opts.filter || {};
    const rule = [f.cls ? `Class ${[].concat(f.cls).join(' / ')}` : '', f.maxPI ? `PI ≤ ${f.maxPI}` : '', f.tags?.length ? f.tags.join(', ') : ''].filter(Boolean).join(' · ') || 'Any car';
    root.innerHTML = frameHTML(esc(st.opts.title || 'Choose your car'), esc(rule), `<div class="gx-h">${list.length} eligible</div><div class="gx-scroll">${rows || '<p class="gx-note">You have no eligible cars. Visit the Autoshow.</p>'}</div>`, '<div></div>',
      [['Enter', 'Choose'], ['Esc', 'Cancel'], ['Drag', 'Rotate']]);
    const right = kk => { const own = api.owned().includes(kk); root.querySelector('.gx-right').innerHTML = cardHTML(kk, own ? api.buildOf(kk) : null) + `<div class="gx-card"><button class="gx-btn primary" data-nav data-act="pick">Choose<small>${esc(CARS[kk].name)}</small></button></div>`; root.querySelector('[data-act="pick"]').addEventListener('click', () => finish(kk)); root.querySelector('.gx-title').innerHTML = `${carTitle(kk)}<small>${esc(rule)}</small>`; };
    root.querySelectorAll('[data-car]').forEach(b => {
      b.addEventListener('navfocus', () => { st.focusKey = b.dataset.car; previewCar(b.dataset.car, !api.owned().includes(b.dataset.car)); right(b.dataset.car); });
      b.addEventListener('click', () => finish(b.dataset.car));
    });
    if (k) { right(k); studio.showCar(k, { build: api.owned().includes(k) ? api.buildOf(k) : null, look: api.owned().includes(k) ? api.lookOf(k) : null, keepCamera: false }); }
    layer.refresh?.();
  }

  // ------------------------------------------------------------------ reveal
  function drawReveal() {
    const k = st.opts.key, d = CARS[k];
    root.innerHTML = `<div class="gx-reveal"><div class="k">${esc(st.opts.kicker || 'New car')}</div><h1>${esc(d.makeName)} ${esc(d.modelName)}</h1><p>${d.year} · ${esc(d.country)} · <span style="color:${RARITY_COL[d.rarity]}">${d.rarity}</span>${st.opts.source ? ' · ' + esc(st.opts.source) : ''}</p>${piBadge(perfOf(k, api.buildOf(k)).pi, true)}</div>
      <div class="gx-hints" style="justify-content:center"><span><kbd>Enter</kbd>Continue</span></div>`;
    root.style.background = 'radial-gradient(120% 80% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,.55) 100%)';
    sound('levelup');
  }
  return { open, close, isOpen, get studio() { return studio; }, get state() { return st; }, draw };
}

// ------------------------------------------------------------------ colour helpers
function rgbOf(c) { return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; }
function hslOf(c) { const [r, g, b] = rgbOf(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
const hueOf = c => hslOf(c ?? 0)[0], satOf = c => hslOf(c ?? 0)[1], lightOf = c => hslOf(c ?? 0)[2];
function hslHex(h, s, l) { const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255); }
