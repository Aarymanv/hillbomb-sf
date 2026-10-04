// Festival UI kit: styles (built on the shared theme tokens), full-screen modal screens (through G.ui.screen when the
// UI shell provides it, else a local fallback), keyboard + gamepad navigation, dialogue captions and big banners.
import { injectTheme, makeNav, piBadge, CLASS_COLORS, RARITY } from '../../ui/theme.js';
import { CHARACTERS } from './catalog.js';
import { esc } from './util.js';

export { piBadge, CLASS_COLORS, RARITY };
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const clsBadge = cls => `<span class="ui-pi hf-cls" style="--c:${CLASS_COLORS[cls === 'S' ? 'S1' : cls] || '#888'}"><i>${cls}</i></span>`;

// ------------------------------------------------------------------ styles
export function injectFestivalCss() {
  injectTheme();
  if (document.getElementById('hf-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-style';
  s.textContent = `
.hf-root{color:var(--ui-ink);font-family:var(--ui-sans);display:flex;flex-direction:column;min-height:0;flex:1}
.hf-fallback{position:fixed;inset:0;z-index:61;display:flex;flex-direction:column;padding:44px 60px;box-sizing:border-box;overflow:auto;color:var(--ui-ink);
  background:radial-gradient(120% 90% at 18% 8%,rgba(255,46,126,.20),rgba(6,7,12,.0) 55%),radial-gradient(90% 80% at 90% 100%,rgba(255,194,71,.10),transparent 60%),rgba(6,7,12,.80);
  backdrop-filter:blur(12px) saturate(1.25);animation:ui-in .22s ease-out}
.hf-kicker{display:flex;align-items:center;gap:10px;font:800 13px/1 var(--ui-sans);letter-spacing:.26em;text-transform:uppercase;color:var(--k,var(--ui-acc))}
.hf-kicker:before{content:'';width:26px;height:4px;background:var(--k,var(--ui-acc));transform:skewX(-20deg)}
.hf-title{font:italic 800 clamp(44px,5.2vw,78px)/.92 var(--ui-cond);text-transform:uppercase;margin:8px 0 10px;letter-spacing:.005em}
.hf-desc{font:500 16px/1.5 var(--ui-sans);color:var(--ui-dim);max-width:640px;margin:0}
.hf-cols{display:flex;gap:34px;flex:1;min-height:0;margin-top:22px}
.hf-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.hf-stats{display:flex;gap:10px;flex-wrap:wrap}
.hf-stat{background:var(--ui-glass);box-shadow:inset 0 0 0 1px var(--ui-faint);border-radius:5px;padding:10px 14px;min-width:96px}
.hf-stat b{display:block;font:italic 800 26px/1 var(--ui-cond);margin-top:5px}
.hf-stat span{font:700 11px/1 var(--ui-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ui-dim)}
.hf-map{border-radius:8px;background:#0b1a22;box-shadow:inset 0 0 0 1px var(--ui-faint),0 18px 50px rgba(0,0,0,.35);display:block}
.hf-list{display:flex;flex-direction:column;gap:5px}
.hf-li{display:flex;align-items:center;gap:12px;padding:7px 12px;border-radius:4px;background:rgba(255,255,255,.045);font:600 14px/1.2 var(--ui-sans)}
.hf-li .sw{width:5px;align-self:stretch;border-radius:2px;background:var(--c,#fff)}
.hf-li .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hf-li .nm small{display:block;font:500 12px/1.3 var(--ui-sans);color:var(--ui-dim)}
.hf-li .v{font:italic 800 18px/1 var(--ui-cond)}
.hf-li.me{background:rgba(255,46,126,.20);box-shadow:inset 0 0 0 2px var(--ui-acc)}
.hf-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:18px}
.hf-diff{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:6px;background:var(--ui-glass);box-shadow:inset 0 0 0 1px var(--ui-faint);cursor:pointer;outline:none}
.hf-diff.focus{box-shadow:inset 0 0 0 3px var(--ui-acc)}
.hf-diff .arr{font:800 22px/1 var(--ui-cond);color:var(--ui-dim)}
.hf-diff .nm{font:italic 800 24px/1 var(--ui-cond);text-transform:uppercase;min-width:150px;text-align:center}
.hf-diff .bn{font:700 13px/1 var(--ui-sans);color:#39e07a}
.hf-pips{display:flex;gap:4px}.hf-pips i{width:16px;height:6px;background:var(--ui-faint);transform:skewX(-20deg)}.hf-pips i.on{background:var(--ui-acc)}
.hf-reward{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07);font:600 14px/1.2 var(--ui-sans);color:var(--ui-dim)}
.hf-reward b{font:italic 800 24px/1 var(--ui-cond);color:var(--ui-ink)}
.hf-reward.total b{font-size:34px;color:var(--ui-acc2)}
.hf-pb{display:inline-block;padding:4px 9px;border-radius:3px;background:#39e07a;color:#08110b;font:800 12px/1 var(--ui-sans);letter-spacing:.14em;text-transform:uppercase}
.hf-big{font:italic 800 clamp(90px,12vw,170px)/.8 var(--ui-cond);text-transform:uppercase}
.hf-big sup{font-size:.38em;vertical-align:top;margin-left:4px}
.hf-cls i{padding:4px 8px}
.hf-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:3px;font:800 12px/1 var(--ui-sans);letter-spacing:.14em;text-transform:uppercase;background:var(--c,#333);color:#0b0c10}
.hf-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:14px 0 18px}
.hf-tabs .ui-btn{font-size:18px;padding:8px 14px}
.hf-tabs .ui-btn.on{background:var(--ui-acc)}
.hf-scroll{overflow:auto;min-height:0;flex:1;padding-right:6px}
.hf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.hf-tile{position:relative;padding:12px 14px 12px 18px;border-radius:5px;background:var(--ui-glass);box-shadow:inset 0 0 0 1px var(--ui-faint);cursor:pointer;outline:none;overflow:hidden;min-height:70px}
.hf-tile:before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--c,var(--ui-acc))}
.hf-tile.focus,.hf-tile:hover{box-shadow:inset 0 0 0 3px var(--ui-acc);background:rgba(255,46,126,.12)}
.hf-tile .t{font:italic 800 21px/1.02 var(--ui-cond);text-transform:uppercase}
.hf-tile .s{font:500 12.5px/1.35 var(--ui-sans);color:var(--ui-dim);margin-top:4px}
.hf-tile .r{position:absolute;right:12px;top:11px;font:800 15px/1 var(--ui-cond);color:var(--ui-acc2);letter-spacing:.05em}
.hf-tile.locked{opacity:.45}
.hf-tile.done .r{color:#39e07a}
.hf-bar{height:6px;border-radius:3px;background:var(--ui-faint);overflow:hidden;margin-top:8px}.hf-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--ui-acc),var(--ui-acc2))}
.hf-chapter{display:flex;align-items:center;gap:16px;padding:14px 18px;border-radius:6px;background:linear-gradient(100deg,rgba(255,46,126,.25),rgba(255,194,71,.08));box-shadow:inset 0 0 0 1px var(--ui-faint)}
.hf-chapter .n{font:italic 800 58px/.8 var(--ui-cond);color:var(--ui-acc)}
.hf-note{font:500 13px/1.45 var(--ui-sans);color:var(--ui-dim)}
.hf-foot{display:flex;gap:20px;font:600 12.5px/1 var(--ui-sans);color:var(--ui-dim);padding-top:14px;flex-wrap:wrap}
/* ---------- in-world overlays (non-modal) ---------- */
#hf-layer{position:fixed;inset:0;pointer-events:none;z-index:22;color:var(--ui-ink);font-family:var(--ui-sans);user-select:none}
#hf-layer.hidden{display:none}
.hf-cap{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);display:flex;gap:14px;align-items:flex-start;max-width:min(760px,86vw);padding:14px 20px 15px 14px;border-radius:8px;
  background:linear-gradient(90deg,rgba(8,9,14,.88),rgba(8,9,14,.72));box-shadow:0 12px 40px rgba(0,0,0,.35);opacity:0;transition:opacity .25s,transform .25s}
.hf-cap.on{opacity:1;transform:translateX(-50%) translateY(-4px)}
.hf-cap .av{flex:none;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:italic 800 21px/1 var(--ui-cond);color:#0b0c10;background:var(--c)}
.hf-cap .who{font:800 12px/1 var(--ui-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--c)}
.hf-cap .who small{font-weight:600;letter-spacing:.06em;text-transform:none;color:var(--ui-dim);margin-left:8px}
.hf-cap .tx{font:500 17px/1.42 var(--ui-sans);margin-top:6px;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.hf-cap .skip{position:absolute;right:12px;bottom:-22px;font:600 11px/1 var(--ui-sans);color:var(--ui-dim)}
.hf-ban{position:absolute;left:0;right:0;top:15%;text-align:center;opacity:0;transform:scale(1.04);transition:opacity .35s,transform .45s}
.hf-ban.on{opacity:1;transform:none}
.hf-ban .k{font:800 14px/1 var(--ui-sans);letter-spacing:.34em;text-transform:uppercase;color:var(--c,var(--ui-acc))}
.hf-ban .t{font:italic 800 clamp(54px,7.5vw,112px)/.9 var(--ui-cond);text-transform:uppercase;margin-top:8px;text-shadow:0 6px 30px rgba(0,0,0,.45)}
.hf-ban .s{font:700 18px/1.2 var(--ui-cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ui-dim);margin-top:10px}
.hf-ban .bar{width:180px;height:5px;margin:14px auto 0;background:var(--c,var(--ui-acc));transform:skewX(-20deg)}
.hf-lower{position:absolute;left:5vw;bottom:13vh;opacity:0;transform:translateX(-24px);transition:opacity .4s,transform .5s}
.hf-lower.on{opacity:1;transform:none}
.hf-lower .t{font:italic 800 clamp(40px,5vw,72px)/.92 var(--ui-cond);text-transform:uppercase;text-shadow:0 4px 24px rgba(0,0,0,.5)}
.hf-lower .s{font:700 16px/1 var(--ui-sans);letter-spacing:.3em;text-transform:uppercase;color:var(--ui-acc2);margin-top:10px}
.hf-lower .c{font:600 14px/1.3 var(--ui-sans);color:var(--ui-dim);margin-top:8px;letter-spacing:.04em}
.hf-skipring{position:absolute;right:34px;bottom:34px;display:flex;align-items:center;gap:10px;font:700 13px/1 var(--ui-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--ui-dim)}
.hf-skipring svg{width:30px;height:30px;transform:rotate(-90deg)}
.hf-fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:58;transition:opacity .01s}
.hf-prompt{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);min-width:320px;max-width:520px;padding:12px 18px 14px;border-radius:6px;background:rgba(8,9,14,.84);
  box-shadow:0 10px 36px rgba(0,0,0,.35);display:none;border-left:5px solid var(--c,var(--ui-acc))}
.hf-prompt.on{display:block}
.hf-prompt .k{font:800 11px/1 var(--ui-sans);letter-spacing:.24em;text-transform:uppercase;color:var(--c,var(--ui-acc))}
.hf-prompt .t{font:italic 800 28px/1 var(--ui-cond);text-transform:uppercase;margin-top:5px}
.hf-prompt .s{font:500 13px/1.4 var(--ui-sans);color:var(--ui-dim);margin-top:4px}
.hf-prompt .a{margin-top:9px;font:700 13px/1 var(--ui-sans);display:flex;gap:14px;align-items:center}
.hf-stunt{position:absolute;left:50%;top:24%;transform:translateX(-50%) scale(.96);text-align:center;opacity:0;transition:opacity .25s,transform .3s;min-width:340px}
.hf-stunt.on{opacity:1;transform:translateX(-50%)}
.hf-stunt .t{font:800 15px/1 var(--ui-sans);letter-spacing:.24em;text-transform:uppercase;color:var(--c)}
.hf-stunt .v{font:italic 800 84px/1 var(--ui-cond);margin-top:6px;text-shadow:0 6px 30px rgba(0,0,0,.45)}
.hf-stunt .st{display:flex;gap:8px;justify-content:center;margin-top:6px}
.hf-stunt .st i{width:34px;height:34px;background:rgba(255,255,255,.2);clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);transform:scale(.6);transition:transform .25s,background .25s}
.hf-stunt .st i.on{background:var(--ui-acc2);transform:scale(1)}
.hf-stunt .s{font:700 14px/1 var(--ui-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ui-dim);margin-top:10px}
.hf-live{position:absolute;left:50%;top:22px;transform:translateX(-50%);min-width:260px;text-align:center;padding:9px 20px 11px;border-radius:6px;background:rgba(8,9,14,.72);border-bottom:4px solid var(--c);display:none}
.hf-live.on{display:block}
.hf-live .k{font:800 11px/1 var(--ui-sans);letter-spacing:.24em;text-transform:uppercase;color:var(--c)}
.hf-live .v{font:italic 800 40px/1 var(--ui-cond);margin-top:4px}
.hf-live .s{font:600 12.5px/1.2 var(--ui-sans);color:var(--ui-dim);margin-top:3px}
.hf-prompt kbd{display:inline-block;min-width:22px;padding:3px 7px;margin-right:6px;border-radius:4px;background:var(--ui-ink);color:#111;font:800 14px/1.2 var(--ui-cond);text-align:center}
`;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ gamepad poller for modal screens (runs only while a screen is open)
const padState = { prev: [], active: new Set(), timer: 0, axisT: 0 };
function pollPads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p = null; for (const q of pads) if (q && q.connected) { p = q; break; }
  if (!p) return;
  const top = [...padState.active].pop(); if (!top) return;
  const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
  const edge = i => b(i) && !padState.prev[i];
  if (edge(0)) top.act('confirm'); else if (edge(1)) top.act('back');
  else if (edge(12)) top.act('up'); else if (edge(13)) top.act('down'); else if (edge(14)) top.act('left'); else if (edge(15)) top.act('right');
  else if (edge(4)) top.act('lb'); else if (edge(5)) top.act('rb'); else if (edge(2)) top.act('x'); else if (edge(3)) top.act('y');
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0, now = performance.now();
  if ((Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6) && now > padState.axisT) {
    padState.axisT = now + (padState.held ? 140 : 320); padState.held = true;
    if (Math.abs(ax) > Math.abs(ay)) top.act(ax > 0 ? 'right' : 'left'); else top.act(ay > 0 ? 'down' : 'up');
  } else if (Math.abs(ax) < 0.3 && Math.abs(ay) < 0.3) { padState.held = false; padState.axisT = 0; }
  padState.prev = p.buttons.map(x => x.pressed);
}
function ensurePoll() { if (!padState.timer) padState.timer = setInterval(pollPads, 16); }
function stopPollIfIdle() { if (!padState.active.size && padState.timer) { clearInterval(padState.timer); padState.timer = 0; } }

// ------------------------------------------------------------------ modal screens
// root: element to show. opts.onBack: back action (default close). opts.keys: { lb, rb, x, y, left, right } extra actions.
// Returns { close(), nav, root }.
let openCount = 0;
export function openScreen(G, root, opts = {}) {
  injectFestivalCss();
  root.classList.add('hf-root');
  let closed = false, handle = null, wrap = null;
  const prevState = G.state;
  const close = () => {
    if (closed) return; closed = true;
    nav.destroy(); padState.active.delete(ctl); stopPollIfIdle();
    window.removeEventListener('keydown', onKey, true);
    if (handle) { try { handle.close(); } catch (e) { console.warn(e); } }
    else { wrap?.remove(); if (--openCount <= 0) { openCount = 0; if (G.state === 'paused' || G.state === 'festival') G.state = prevState === 'paused' ? 'play' : prevState || 'play'; G.input.wantPointerLock = true; } }
    opts.onClose?.();
  };
  const back = () => { G.audio?.ui('back'); if (opts.onBack) opts.onBack(close); else close(); };
  // extra keys (tab switching etc.): Q/E, PageUp/PageDown, X / Y buttons
  const KEYX = { KeyQ: 'lb', KeyE: 'rb', PageUp: 'lb', PageDown: 'rb', KeyX: 'x', KeyR: 'y', KeyF: 'y' };
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const onKey = e => {
    if (closed) return;
    const k = KEYX[e.code];
    if (k && opts.keys?.[k]) { stop(e); opts.keys[k](); return; }
    const lr = nav?.current?.dataset.lr !== undefined;
    if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && opts.keys?.left && lr) { stop(e); opts.keys.left(); }
    else if ((e.code === 'ArrowRight' || e.code === 'KeyD') && opts.keys?.right && lr) { stop(e); opts.keys.right(); }
  };
  // registered before makeNav's listener so left/right on a value selector never also moves focus
  window.addEventListener('keydown', onKey, true);
  const nav = makeNav(root, { onBack: back, initial: opts.initial || null });
  const ctl = { act(a) {
    if (closed) return;
    if ((a === 'left' || a === 'right') && opts.keys?.[a] && nav.current?.dataset.lr !== undefined) { opts.keys[a](); return; }
    if (opts.keys?.[a]) { opts.keys[a](); return; }
    if (a === 'confirm') nav.current?.click(); else if (a === 'back') back(); else if (['up', 'down', 'left', 'right'].includes(a)) nav.move(a === 'left' ? -1 : a === 'right' ? 1 : 0, a === 'up' ? -1 : a === 'down' ? 1 : 0);
  } };
  padState.active.add(ctl); ensurePoll();
  // click sounds
  root.addEventListener('click', e => { if (e.target.closest?.('[data-nav]')) G.audio?.ui('click'); });
  root.addEventListener('navfocus', () => G.audio?.ui('hover'));
  const scr = G.ui?.screen;
  if (scr?.open && !opts.forceLocal) {
    // padKeys:false: festival screens poll the gamepad themselves (ui.js pollPads)
    try { handle = scr.open(root, { onBack: back, pause: opts.pause !== false, padKeys: false }); } catch (e) { console.warn('[festival] ui.screen.open failed, using fallback', e); handle = null; }
  }
  if (!handle) {
    wrap = document.createElement('div');
    wrap.className = 'hf-fallback';
    wrap.appendChild(root);
    document.body.appendChild(wrap);
    openCount++;
    if (opts.pause !== false && G.state === 'play') G.state = 'paused';
    try { document.exitPointerLock?.(); } catch { /* not locked */ }
    G.input.wantPointerLock = false;
  }
  return { close, nav, root, get closed() { return closed; } };
}

// small confirm dialog: resolves true / false
export function confirmDialog(G, { title, text, yes = 'Confirm', no = 'Cancel', kicker = '' }) {
  return new Promise(res => {
    const root = h(`<div style="margin:auto;max-width:640px;width:100%">
      ${kicker ? `<div class="hf-kicker">${esc(kicker)}</div>` : ''}<div class="hf-title" style="font-size:52px">${esc(title)}</div><p class="hf-desc">${text}</p>
      <div class="hf-btns"><button class="ui-btn primary" data-nav data-a="y">${esc(yes)}</button><button class="ui-btn" data-nav data-a="n">${esc(no)}</button></div></div>`);
    let done = false;
    const s = openScreen(G, root, { onBack: c => { c(); if (!done) { done = true; res(false); } } });
    root.querySelector('[data-a=y]').onclick = () => { done = true; s.close(); res(true); };
    root.querySelector('[data-a=n]').onclick = () => { done = true; s.close(); res(false); };
  });
}

// ------------------------------------------------------------------ in-world overlay layer (captions, banners, prompts)
export function createOverlay(G) {
  injectFestivalCss();
  const layer = h(`<div id="hf-layer">
    <div class="hf-ban"><div class="k"></div><div class="t"></div><div class="s"></div><div class="bar"></div></div>
    <div class="hf-lower"><div class="t"></div><div class="s"></div><div class="c"></div></div>
    <div class="hf-cap"><div class="av"></div><div><div class="who"></div><div class="tx"></div></div></div>
    <div class="hf-prompt"><div class="k"></div><div class="t"></div><div class="s"></div><div class="a"></div></div>
    <div class="hf-stunt"><div class="t"></div><div class="v"></div><div class="st"><i></i><i></i><i></i></div><div class="s"></div></div>
    <div class="hf-live"><div class="k"></div><div class="v"></div><div class="s"></div></div>
    <div class="hf-skipring" style="display:none"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="4"/><circle class="p" cx="18" cy="18" r="15" fill="none" stroke="#ff2e7e" stroke-width="4" stroke-dasharray="0 999"/></svg><span></span></div>
  </div>`);
  document.body.appendChild(layer);
  const fade = h('<div class="hf-fade"></div>'); document.body.appendChild(fade);
  const ban = layer.querySelector('.hf-ban'), low = layer.querySelector('.hf-lower'), cap = layer.querySelector('.hf-cap'), pr = layer.querySelector('.hf-prompt'), ring = layer.querySelector('.hf-skipring');
  const O = { layer, fade: 0, fadeTarget: 0, fadeSpeed: 2 };
  // ---- big banner queue
  const banQ = []; let banT = 0, banCur = null;
  O.banner = (kicker, title, sub = '', color = null, ms = 3200, sound = null) => { banQ.push({ kicker, title, sub, color, ms, sound }); };
  // ---- lower third (location / time titles)
  let lowT = 0;
  O.lower = (title, sub = '', cap2 = '', ms = 4200) => { low.querySelector('.t').textContent = title; low.querySelector('.s').textContent = sub; low.querySelector('.c').textContent = cap2; low.classList.add('on'); lowT = ms / 1000; };
  // ---- dialogue captions: lines [[who, text, secs?]]
  const capQ = []; let capT = 0, capCur = null, capDone = null, typeN = 0;
  O.say = (lines, onDone = null) => { for (const l of lines) capQ.push(l); if (onDone) capDone = onDone; };
  O.clearCaptions = () => { capQ.length = 0; capCur = null; cap.classList.remove('on'); const d = capDone; capDone = null; d?.(); };
  O.captionsBusy = () => !!capCur || capQ.length > 0;
  O.skipCaption = () => { if (capCur) capT = 0; };
  // ---- world prompt (event start etc.), owner-scoped like the HUD prompt
  let prOwner = null, prKey = '';
  O.prompt = (owner, data) => {
    if (!data) { if (prOwner === owner) { pr.classList.remove('on'); prOwner = null; prKey = ''; } return; }
    const key = data.kicker + data.title + data.sub + data.action;
    if (prOwner !== owner || prKey !== key) {
      pr.style.setProperty('--c', data.color || 'var(--ui-acc)');
      pr.querySelector('.k').textContent = data.kicker || ''; pr.querySelector('.t').textContent = data.title || '';
      pr.querySelector('.s').innerHTML = data.sub || ''; pr.querySelector('.a').innerHTML = data.action || '';
      prKey = key;
    }
    prOwner = owner; pr.classList.add('on');
  };
  // ---- stunt result readout (stars: 0-3, -1 hides the stars row)
  const stn = layer.querySelector('.hf-stunt'), liv = layer.querySelector('.hf-live');
  let stT = 0, starQ = [];
  O.stunt = (title, value, stars, sub, color) => {
    stn.style.setProperty('--c', color || 'var(--ui-acc2)');
    stn.querySelector('.t').textContent = title; stn.querySelector('.v').textContent = value; stn.querySelector('.s').textContent = sub || '';
    const st = stn.querySelector('.st'); st.style.display = stars < 0 ? 'none' : '';
    const is = st.querySelectorAll('i'); is.forEach(i => i.classList.remove('on'));
    starQ = []; for (let i = 0; i < Math.max(0, stars); i++) starQ.push([0.25 + i * 0.22, is[i]]);
    stn.classList.add('on'); stT = 3.2;
  };
  let liveKey = '';
  O.live = (k, v, s2, color) => {
    if (!k) { liv.classList.remove('on'); liveKey = ''; return; }
    const key = k + v + s2;
    if (key !== liveKey) { liveKey = key; liv.style.setProperty('--c', color || 'var(--ui-acc)'); liv.querySelector('.k').textContent = k; liv.querySelector('.v').textContent = v; liv.querySelector('.s').textContent = s2 || ''; }
    liv.classList.add('on');
  };
  // ---- skip ring (hold to skip)
  O.skip = (label, frac) => { if (frac == null) { ring.style.display = 'none'; return; } ring.style.display = ''; ring.querySelector('span').textContent = label; ring.querySelector('.p').setAttribute('stroke-dasharray', `${(frac * 94.2).toFixed(1)} 999`); };
  // ---- screen fade (DOM, independent of post-processing)
  O.fadeTo = (v, speed = 2.5) => { O.fadeTarget = v; O.fadeSpeed = speed; };
  O.setFade = v => { O.fade = O.fadeTarget = v; fade.style.opacity = v; };
  O.setVisible = b => layer.classList.toggle('hidden', !b);

  O.update = function (dt) {
    // fade
    if (O.fade !== O.fadeTarget) { const d = O.fadeTarget - O.fade, st = dt * O.fadeSpeed; O.fade = Math.abs(d) <= st ? O.fadeTarget : O.fade + Math.sign(d) * st; fade.style.opacity = O.fade.toFixed(3); }
    // banner
    if (banCur) { banT -= dt; if (banT <= 0) { ban.classList.remove('on'); banCur = null; banT = -0.45; } }
    else if (banT < 0) banT = Math.min(0, banT + dt);
    else if (banQ.length) {
      banCur = banQ.shift(); banT = banCur.ms / 1000;
      ban.style.setProperty('--c', banCur.color || 'var(--ui-acc)');
      ban.querySelector('.k').textContent = banCur.kicker || ''; ban.querySelector('.t').textContent = banCur.title || ''; ban.querySelector('.s').textContent = banCur.sub || '';
      ban.classList.add('on'); if (banCur.sound) G.audio?.ui(banCur.sound);
    }
    // stunt readout + staggered stars
    if (stT > 0) {
      const el0 = 3.2 - stT;
      for (const q of starQ) if (q[1] && el0 >= q[0]) { q[1].classList.add('on'); q[1] = null; G.audio?.ui('click'); }
      stT -= dt; if (stT <= 0) stn.classList.remove('on');
    }
    // lower third
    if (lowT > 0) { lowT -= dt; if (lowT <= 0) low.classList.remove('on'); }
    // captions
    if (capCur) {
      typeN += dt * 55;
      const full = capCur[1];
      const n = Math.min(full.length, Math.floor(typeN));
      if (n !== capCur._n) { capCur._n = n; cap.querySelector('.tx').textContent = full.slice(0, n); }
      capT -= dt;
      if (capT <= 0) { capCur = null; cap.classList.remove('on'); capT = -0.3; }
    } else if (capT < 0) capT = Math.min(0, capT + dt);
    else if (capQ.length) {
      capCur = capQ.shift(); typeN = 0; capCur._n = -1;
      const ch = CHARACTERS[capCur[0]] || { name: capCur[0], role: '', color: '#aaa' };
      cap.style.setProperty('--c', ch.color);
      cap.querySelector('.av').textContent = ch.name.split(' ').map(w => w[0]).join('').slice(0, 2);
      cap.querySelector('.who').innerHTML = `${esc(ch.name)}${ch.role ? `<small>${esc(ch.role)}</small>` : ''}`;
      cap.querySelector('.tx').textContent = '';
      cap.classList.add('on');
      capT = capCur[2] ?? Math.min(9, 2.2 + capCur[1].length * 0.052);
    } else if (capDone) { const d = capDone; capDone = null; d(); }
  };
  return O;
}
