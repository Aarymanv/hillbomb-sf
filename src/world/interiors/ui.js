// Interior menus (garage terminal, showroom car card, bed, counters, elevator) + a fade-to-black for door transitions.
// Menus pause the game (G.state = 'paused') like the pause menu does, and take keyboard input in the capture phase so
// the game's own bindings (Esc = pause, E, F) don't also fire.
const CSS = `
#int-fade{position:fixed;inset:0;background:#05060a;opacity:0;pointer-events:none;z-index:45;transition:opacity .32s ease}
#int-fade.on{opacity:1}
.int-panel{width:min(1040px,94vw)}
.int-panel h2 small{display:block;margin-top:8px;font:700 15px/1 var(--cond);letter-spacing:.32em;color:var(--acc2);font-style:normal}
.int-keys{margin-top:18px;font:600 12px/1.4 var(--sans);color:var(--dim);letter-spacing:.04em}
.int-keys kbd{display:inline-block;min-width:18px;padding:1px 6px;margin:0 3px;border-radius:4px;background:var(--ink);color:#111;font:800 12px/1.35 var(--cond);text-align:center}
.int-car{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:start}
.int-car .cls{display:inline-block;padding:3px 10px;border-radius:6px;font:800 16px/1.2 var(--cond);letter-spacing:.08em;color:#111;background:var(--acc)}
.int-car .cls.S{background:#b36bff}.int-car .cls.A{background:#ff5a36}.int-car .cls.B{background:#ffc247}.int-car .cls.C{background:#4cd964}.int-car .cls.D{background:#5aa9ff}
.int-car .price{margin:18px 0 6px;font:800 54px/1 var(--cond);color:var(--acc2)}
.int-car .price.owned{color:#4cd964}
.int-car .blurb{font:500 14px/1.55 var(--sans);color:var(--dim);max-width:440px}
.int-bar{margin:0 0 14px}
.int-bar .k{display:flex;justify-content:space-between;font:700 13px/1 var(--cond);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
.int-bar .k b{color:var(--ink);font-weight:800}
.int-bar .t{height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.int-bar .t i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--acc),var(--acc2))}
.int-spec{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-top:10px;font:500 13px/2 var(--sans);color:var(--dim)}
.int-spec b{color:var(--ink);float:right;font-weight:600}
.int-panel .hb-card{position:relative}
.int-panel .hb-card .cur{position:absolute;right:12px;top:12px;font:800 12px/1 var(--cond);letter-spacing:.14em;color:#4cd964}
`;

export function createUI(G) {
  if (!document.getElementById('int-style')) { const s = document.createElement('style'); s.id = 'int-style'; s.textContent = CSS; document.head.appendChild(s); }
  const fadeEl = document.createElement('div'); fadeEl.id = 'int-fade'; document.body.appendChild(fadeEl);
  const audio = G.audio;
  const UI = { open: null, fading: false };
  let overlay = null, items = [], sel = 0, prevState = 'play', onKey = null, cols = 1;

  UI.fade = function (mid, ms = 330) {
    if (UI.fading) return;
    UI.fading = true; fadeEl.classList.add('on');
    setTimeout(() => { try { mid(); } catch (e) { console.error(e); } setTimeout(() => { fadeEl.classList.remove('on'); UI.fading = false; }, 120); }, ms);
  };

  function highlight() { items.forEach((el, i) => el.classList.toggle('sel', i === sel)); items[sel]?.scrollIntoView?.({ block: 'nearest' }); }
  function activate(i) { const el = items[i]; if (!el || el.disabled || el.classList.contains('locked-hard')) { audio?.ui('error'); return; } audio?.ui('click'); el._act?.(); }

  // spec: { title, kicker, sub, html, items: [{label, sub, act, disabled}], cards: [{html, act, cls}], cols }
  UI.show = function (spec) {
    UI.close(true);
    prevState = G.state === 'paused' ? 'play' : G.state;
    overlay = document.createElement('div');
    overlay.className = 'hb-overlay';
    const btns = (spec.items || []).map((it, i) => `<button class="hb-btn" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</button>`).join('');
    const cards = spec.cards ? `<div class="hb-grid">${spec.cards.map((c, i) => `<div class="hb-card ${c.cls || ''}" data-c="${i}">${c.html}</div>`).join('')}</div>` : '';
    overlay.innerHTML = `<div class="hb-panel int-panel"><h2>${spec.title}${spec.kicker ? `<small>${spec.kicker}</small>` : ''}</h2>${spec.sub ? `<p class="hb-sub">${spec.sub}</p>` : ''}
      ${spec.html || ''}${cards}${btns ? `<div class="hb-menu" style="margin-top:18px">${btns}</div>` : ''}
      <div class="int-keys"><kbd>W</kbd><kbd>S</kbd> select &nbsp; <kbd>E</kbd> / <kbd>Enter</kbd> confirm &nbsp; <kbd>Esc</kbd> close</div></div>`;
    document.body.appendChild(overlay);
    items = [];
    overlay.querySelectorAll('[data-c]').forEach(el => { const c = spec.cards[+el.dataset.c]; el._act = c.act; if (c.disabled) el.classList.add('locked-hard'); items.push(el); });
    overlay.querySelectorAll('[data-i]').forEach(el => { const it = spec.items[+el.dataset.i]; el._act = it.act; items.push(el); });
    items.forEach((el, i) => { el.addEventListener('click', () => { sel = i; activate(i); }); el.addEventListener('mouseenter', () => { sel = i; highlight(); audio?.ui('hover'); }); });
    cols = spec.cards ? Math.max(1, Math.round(overlay.querySelector('.hb-grid').clientWidth / 222)) : 1;
    sel = Math.max(0, Math.min(items.length - 1, spec.sel ?? items.findIndex(el => !el.disabled && !el.classList.contains('locked-hard'))));
    highlight();
    UI.open = spec.name || 'menu';
    UI.onClose = spec.onClose || null;
    G.state = 'paused';
    try { document.exitPointerLock?.(); } catch { /* not locked */ }
    G.input.wantPointerLock = false;
    onKey = (e) => {
      const k = e.code;
      const nCards = spec.cards ? spec.cards.length : 0;
      let used = true;
      if (k === 'ArrowDown' || k === 'KeyS') { sel = sel < nCards && sel + cols < nCards ? sel + cols : Math.min(items.length - 1, sel < nCards ? nCards : sel + 1); highlight(); audio?.ui('hover'); }
      else if (k === 'ArrowUp' || k === 'KeyW') { sel = sel >= nCards && nCards ? (sel === nCards ? Math.max(0, nCards - 1) : sel - 1) : Math.max(0, sel - (nCards ? cols : 1)); highlight(); audio?.ui('hover'); }
      else if ((k === 'ArrowRight' || k === 'KeyD') && sel < nCards) { sel = Math.min(nCards - 1, sel + 1); highlight(); audio?.ui('hover'); }
      else if ((k === 'ArrowLeft' || k === 'KeyA') && sel < nCards) { sel = Math.max(0, sel - 1); highlight(); audio?.ui('hover'); }
      else if (k === 'Enter' || k === 'KeyE' || k === 'NumpadEnter' || k === 'Space') activate(sel);
      else if (k === 'Escape' || k === 'Backspace' || k === 'KeyF' || k === 'KeyQ') { audio?.ui('back'); UI.close(); }
      else if (/^Digit[1-9]$/.test(k)) { const i = +k.slice(5) - 1; if (i < items.length) { sel = i; highlight(); activate(i); } }
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
    };
    addEventListener('keydown', onKey, true);
    return overlay;
  };
  UI.close = function (silent) {
    if (onKey) { removeEventListener('keydown', onKey, true); onKey = null; }
    if (!overlay) return;
    overlay.remove(); overlay = null; items = [];
    UI.open = null; UI.cooldown = performance.now() + 350;
    if (G.state === 'paused') G.state = prevState || 'play';
    G.input.wantPointerLock = true;
    const cb = UI.onClose; UI.onClose = null;
    if (!silent) cb?.();
  };
  UI.bar = (k, v, t) => `<div class="int-bar"><div class="k">${k}<b>${t}</b></div><div class="t"><i style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></i></div></div>`;
  return UI;
}
