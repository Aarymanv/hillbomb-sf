// Pause / festival menu: a tabbed full-screen layer. Other modules add tabs:
//   G.ui.menu.addTab({ id, title, order, icon, build(el, nav), visible?() })
//   build() runs the first time the tab is shown in each menu session and may return hooks:
//   { onShow(), onHide(), update(dt, pad), onKey(e) -> true if handled, onBack() -> true if handled (menu stays open),
//     wantsStick() -> true to receive the left stick instead of stick-as-arrows, hints: [[key, label], ...], destroy() }
//   nav: { el, focus(elOrSelector), refresh(), rebuild(), close(), openTab(id), setHints(list), sound(name), usingPad() }
// Focusable things inside a tab carry [data-nav] (class 'focus' when focused). An element with el._adjust = dir => {}
// turns left/right into value changes.
import { svgIcon } from './icons.js';
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMenu(G, ui) {
  const tabs = new Map();
  let insertion = 0, L = null, cur = null, session = new Map(), lastTab = null;
  const root = document.createElement('div');
  root.className = 'mn';
  root.innerHTML = `<div class="mn-bg"><i></i></div>
    <header class="mn-top">
      <div class="mn-brand"><b>HILLBOMB<i>.</i></b><small>San Francisco Festival</small></div>
      <nav class="mn-tabs"><span class="mn-bump" data-dir="-1"></span><div class="mn-strip"></div><span class="mn-bump" data-dir="1"></span></nav>
      <div class="mn-stats"><div class="mn-lvl"><i>LVL</i><b></b></div><div class="mn-xp"><div class="mn-xpt"><span></span><em></em></div><div class="ui-bar"><i></i></div></div><div class="mn-cash ui-money"></div></div>
    </header>
    <main class="mn-body"></main>
    <footer class="mn-foot"><div class="mn-hints"></div><div class="mn-info"></div></footer>`;
  const strip = root.querySelector('.mn-strip'), body = root.querySelector('.mn-body');
  const hintsEl = root.querySelector('.mn-hints'), infoEl = root.querySelector('.mn-info');
  root.querySelectorAll('.mn-bump').forEach(b => b.addEventListener('click', () => cycle(+b.dataset.dir)));

  const visibleTabs = () => [...tabs.values()].filter(t => { try { return !t.visible || t.visible(); } catch { return true; } }).sort((a, b) => (a.order - b.order) || (a.ins - b.ins));

  function addTab(spec) {
    if (!spec || !spec.id) throw new Error('addTab needs an id');
    const prev = tabs.get(spec.id);
    const t = { ...spec, order: spec.order ?? prev?.order ?? 50, icon: spec.icon ?? prev?.icon, title: spec.title || spec.label || prev?.title || spec.id, ins: prev ? prev.ins : insertion++ };
    // action tab: { id, label, onSelect } -> a launcher page; choosing it closes the menu, then runs onSelect
    if (!t.build && typeof t.onSelect === 'function') t.build = (el, nav) => {
      el.innerHTML = '<div class="mw-k">' + esc(t.title) + '</div><h2 class="mw-h">' + esc(t.title) + '</h2>' + (t.sub ? '<p class="mw-p">' + esc(t.sub) + '</p>' : '') +
        '<div class="mw-grid" style="margin-top:22px;max-width:520px"><button class="mw-tile" data-nav data-nav-default>' + svgIcon(t.icon || 'play', 30, 'ic-big') + '<span class="t">' + esc(t.action || ('Open ' + t.title)) + '</span>' + (t.key ? '<span class="s">Shortcut: ' + esc(t.key) + '</span>' : '') + '</button></div>';
      el.querySelector('.mw-tile').addEventListener('click', () => { nav.close(); try { t.onSelect(); } catch (e) { console.error('[menu] ' + t.id, e); } });
    };
    tabs.set(spec.id, t);
    if (L) { // menu open: drop a stale page for this id and redraw the strip
      const s = session.get(spec.id); if (s) { try { s.hooks?.destroy?.(); } catch { /* ignore */ } s.page.remove(); session.delete(spec.id); }
      drawStrip(); if (cur === spec.id) show(spec.id, true);
    }
    return spec.id;
  }
  function removeTab(id) { tabs.delete(id); if (L) { drawStrip(); if (cur === id) show(visibleTabs()[0]?.id); } }

  function drawStrip() {
    const vt = visibleTabs();
    strip.innerHTML = vt.map(t => `<button class="mn-tab${t.id === cur ? ' on' : ''}" data-tab="${t.id}">${t.icon ? svgIcon(t.icon, 18) : ''}<span>${t.title}</span></button>`).join('') + '<i class="mn-ink"></i>';
    strip.querySelectorAll('.mn-tab').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== cur) { ui._sound('hover'); show(b.dataset.tab); } }));
    strip.classList.remove('tight', 'tighter');
    if (strip.scrollWidth > strip.clientWidth + 1) strip.classList.add('tight');
    if (strip.scrollWidth > strip.clientWidth + 1) strip.classList.add('tighter');
    placeInk();
    const kb = !ui.usingPad();
    root.querySelector('.mn-bump[data-dir="-1"]').innerHTML = kb ? '<kbd>Q</kbd>' : '<kbd class="pad">LB</kbd>';
    root.querySelector('.mn-bump[data-dir="1"]').innerHTML = kb ? '<kbd>E</kbd>' : '<kbd class="pad">RB</kbd>';
  }
  function placeInk() {
    const ink = strip.querySelector('.mn-ink'), b = strip.querySelector('.mn-tab.on');
    if (!ink || !b) return;
    ink.style.transform = `translateX(${b.offsetLeft}px)`; ink.style.width = b.offsetWidth + 'px';
  }
  function makeNav(id, page) {
    return {
      el: page, tabId: id,
      focus(x) { const e = typeof x === 'string' ? page.querySelector(x) : x; if (e && L) L.focus.focus(e, true); },
      refresh() { L?.focus.ensure(); },
      rebuild() { const s = session.get(id); if (!s) return; try { s.hooks?.destroy?.(); } catch { /* ignore */ } session.delete(id); page.remove(); if (cur === id) show(id, true); },
      close: () => close(),
      openTab: t => show(t),
      setHints(list) { const s = session.get(id); if (s) { s.hints = list; drawHints(); } },
      sound: n => ui._sound(n),
      usingPad: () => ui.usingPad(),
      get pad() { return ui.pad; },
    };
  }
  function show(id, force = false) {
    const vt = visibleTabs();
    if (!vt.length) return;
    if (!tabs.has(id) || !vt.find(t => t.id === id)) id = vt[0].id;
    if (id === cur && !force && session.has(id)) return;
    const prev = cur && session.get(cur);
    if (prev && cur !== id) { try { prev.hooks?.onHide?.(); } catch (e) { console.error(e); } prev.page.classList.remove('on'); }
    cur = id; lastTab = id;
    let s = session.get(id);
    if (!s) {
      const page = document.createElement('section'); page.className = 'mn-page'; page.dataset.tab = id; body.appendChild(page);
      s = { page, hooks: null, hints: null };
      session.set(id, s);
      try { s.hooks = tabs.get(id).build?.(page, makeNav(id, page)) || null; } catch (e) { console.error('[menu] tab ' + id, e); page.innerHTML = `<p class="ui-p">This page failed to load.</p>`; }
    }
    s.page.classList.remove('on'); void s.page.offsetWidth; s.page.classList.add('on');
    try { s.hooks?.onShow?.(); } catch (e) { console.error(e); }
    L?.focus.clear(); setTimeout(() => L?.focus.ensure(), 0);
    drawStrip(); drawHints();
  }
  function cycle(d) {
    const vt = visibleTabs(); if (!vt.length) return;
    const i = vt.findIndex(t => t.id === cur);
    ui._sound('hover');
    show(vt[(i + d + vt.length) % vt.length].id);
  }
  function drawHints() {
    const pad = ui.usingPad(), s = cur && session.get(cur);
    const K = (k, p) => pad ? `<kbd class="pad">${p}</kbd>` : `<kbd>${k}</kbd>`;
    const base = [[K('Enter', 'A'), 'Select'], [K('Esc', 'B'), s?.hooks?.onBack ? 'Back' : 'Resume'], [K('Q', 'LB') + K('E', 'RB'), 'Tabs']];
    const extra = (s?.hints || s?.hooks?.hints || []).map(([k, label, p]) => [K(k, p || k), label]);
    hintsEl.innerHTML = [...base, ...extra].map(([k, l]) => `<span>${k}${l}</span>`).join('');
  }
  function drawStats() {
    const E = G.economy; if (!E) return;
    root.querySelector('.mn-lvl b').textContent = E.level;
    root.querySelector('.mn-xpt span').textContent = 'XP';
    root.querySelector('.mn-xpt em').textContent = `${E.xpInLevel.toLocaleString()} / ${E.xpForNext.toLocaleString()}`;
    root.querySelector('.mn-xp .ui-bar i').style.width = (100 * E.xpInLevel / Math.max(1, E.xpForNext)).toFixed(1) + '%';
    root.querySelector('.mn-cash').textContent = G.flags?.creative ? '∞' : Math.round(E.money).toLocaleString();   // Free Roam: unlimited (as the HUD)
    const p = G.player?.pos, h = G.env?.state?.hours ?? 12;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    infoEl.innerHTML = `${p ? `<span>${G.world.district(p.x, p.z)}</span>` : ''}<span>${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}</span><span>${(G.flags?.label || G.mode || '').toString()} mode</span>`;
  }

  function open(tabId) {
    if (L) { if (tabId) show(tabId); return; }
    session = new Map(); body.innerHTML = ''; cur = null;
    L = ui._push({
      kind: 'menu', el: root, keepEl: false, pause: true, hideHud: true, focusRoot: body,
      onKey(e) {
        const s = session.get(cur);
        if (s?.hooks?.onKey && s.hooks.onKey(e) === true) return true;
        if (e.code === 'Tab') { cycle(e.shiftKey ? -1 : 1); return true; }
        return false;
      },
      onTab: d => cycle(d),
      onBack() { const s = session.get(cur); if (s?.hooks?.onBack && s.hooks.onBack() === true) return false; return true; },
      update(dt, pad) { const s = session.get(cur); s?.hooks?.update?.(dt, pad); },
      wantsStick() { const s = session.get(cur); return !!s?.hooks?.wantsStick?.(); },
      onClose() {
        for (const s of session.values()) { try { s.hooks?.onHide?.(); s.hooks?.destroy?.(); } catch (e) { console.error(e); } }
        session.clear(); L = null; cur = null;
        G.emit?.('menu', false);
      },
    });
    drawStats();
    const want = tabId || (G.events?.active && tabs.has('event') ? 'event' : null) || (lastTab && tabs.has(lastTab) && lastTab !== 'event' ? lastTab : null) || visibleTabs()[0]?.id;
    show(want, true);
    requestAnimationFrame?.(placeInk); setTimeout(placeInk, 60);
    G.emit?.('menu', true);
    ui._sound('click');
  }
  function close() { if (L) ui._close(L); }
  addEventListener('resize', () => { if (L) placeInk(); });
  return {
    addTab, removeTab, open, close,
    isOpen: () => !!L,
    current: () => cur,
    tabs: () => visibleTabs().map(t => t.id),
    refreshHints: () => L && (drawHints(), drawStrip()),
    el: root,
  };
}
