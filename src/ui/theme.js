// Shared festival UI language (menus, event cards, garage, results). Every screen uses these tokens/classes so
// screens built by different modules look like one game. Original look: no third-party logos, names or art.
// Screens must be fully usable with keyboard and gamepad through makeNav() (arrows/WASD, Enter/Space, Esc/Backspace).
export const CLASS_COLORS = { D: '#3bc4f4', C: '#f7d51d', B: '#ff8a1d', A: '#ff3b4e', S1: '#b04cf0', S2: '#2f6df0', X: '#35d65a' };
export const PI_BANDS = [['D', 100, 500], ['C', 501, 600], ['B', 601, 700], ['A', 701, 800], ['S1', 801, 900], ['S2', 901, 998], ['X', 999, 999]];
export const classOfPI = pi => (PI_BANDS.find(([, lo, hi]) => pi >= lo && pi <= hi) || PI_BANDS[pi < 100 ? 0 : 6])[0];
export const RARITY = { common: '#a7b0ba', rare: '#3aa0ff', epic: '#b25cff', legendary: '#ffb21e' };

// <span class="ui-pi" style="--c:...">A <b>742</b></span>
export function piBadge(pi) { const c = classOfPI(pi); return `<span class="ui-pi" style="--c:${CLASS_COLORS[c]}"><i>${c}</i><b>${pi}</b></span>`; }

export function injectTheme() {
  if (document.getElementById('ui-theme')) return;
  const s = document.createElement('style');
  s.id = 'ui-theme';
  s.textContent = `
:root{--ui-acc:#ff2e7e;--ui-acc2:#ffc247;--ui-ink:#f6f3ee;--ui-dim:rgba(246,243,238,.62);--ui-faint:rgba(246,243,238,.14);
  --ui-bg:rgba(9,10,16,.78);--ui-bg2:rgba(9,10,16,.92);--ui-glass:rgba(255,255,255,.06);
  --ui-cond:'Barlow Condensed','Arial Narrow',Impact,sans-serif;--ui-sans:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
.ui-screen{position:fixed;inset:0;z-index:60;color:var(--ui-ink);font-family:var(--ui-sans);
  background:radial-gradient(120% 90% at 20% 10%,rgba(40,20,60,.55),rgba(6,7,12,.9) 60%),rgba(6,7,12,.55);backdrop-filter:blur(10px) saturate(1.2);
  display:flex;flex-direction:column;padding:48px 64px;box-sizing:border-box;animation:ui-in .22s ease-out}
@keyframes ui-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.ui-h1{font:italic 800 56px/0.95 var(--ui-cond);text-transform:uppercase;letter-spacing:.005em;margin:0}
.ui-h2{font:italic 800 28px/1 var(--ui-cond);text-transform:uppercase;margin:0}
.ui-h3{font:700 15px/1.2 var(--ui-cond);text-transform:uppercase;letter-spacing:.14em;color:var(--ui-dim);margin:0}
.ui-p{font:500 15px/1.5 var(--ui-sans);color:var(--ui-dim);margin:0}
.ui-panel{background:var(--ui-bg);border-radius:6px;padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.ui-row{display:flex;gap:14px;align-items:center}.ui-col{display:flex;flex-direction:column;gap:10px}
.ui-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.ui-tile{position:relative;background:var(--ui-glass);border-radius:6px;padding:14px 16px;min-height:96px;cursor:pointer;outline:none;
  box-shadow:inset 0 0 0 1px var(--ui-faint);transition:transform .12s,box-shadow .12s,background .12s;overflow:hidden}
.ui-tile:hover,.ui-tile.focus{background:rgba(255,46,126,.14);box-shadow:inset 0 0 0 3px var(--ui-acc);transform:translateY(-2px)}
.ui-tile.locked{opacity:.45;filter:grayscale(.6)}
.ui-tile .t{font:italic 800 24px/1 var(--ui-cond);text-transform:uppercase}.ui-tile .s{font:500 13px/1.35 var(--ui-sans);color:var(--ui-dim);margin-top:6px}
.ui-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:0;border-radius:4px;cursor:pointer;outline:none;
  font:italic 800 20px/1 var(--ui-cond);text-transform:uppercase;letter-spacing:.02em;color:var(--ui-ink);background:var(--ui-glass);box-shadow:inset 0 0 0 1px var(--ui-faint)}
.ui-btn.primary{background:var(--ui-acc);box-shadow:none}.ui-btn:hover,.ui-btn.focus{box-shadow:inset 0 0 0 3px var(--ui-ink)}
.ui-tabs{display:flex;gap:6px;margin:18px 0 22px}.ui-tabs .ui-btn{background:transparent;box-shadow:none;color:var(--ui-dim)}
.ui-tabs .ui-btn.on{color:var(--ui-ink);box-shadow:inset 0 -3px 0 var(--ui-acc)}
.ui-pi{display:inline-flex;align-items:stretch;font:italic 800 16px/1 var(--ui-cond);border-radius:3px;overflow:hidden;box-shadow:0 0 0 2px var(--c)}
.ui-pi i{font-style:italic;background:var(--c);color:#0b0c10;padding:4px 7px}.ui-pi b{background:#0b0c10;color:#fff;padding:4px 7px}
.ui-bar{height:6px;background:var(--ui-faint);border-radius:3px;overflow:hidden}.ui-bar i{display:block;height:100%;background:var(--ui-ink)}
.ui-bar i.up{background:#39e07a}.ui-bar i.down{background:#ff4d5e}
.ui-key{display:inline-block;min-width:20px;padding:3px 7px;border-radius:4px;background:rgba(255,255,255,.14);font:700 12px/1.2 var(--ui-sans);text-align:center}
.ui-foot{margin-top:auto;display:flex;gap:22px;font:600 13px/1 var(--ui-sans);color:var(--ui-dim);padding-top:18px}
.ui-money:before{content:'$';color:var(--ui-acc2);margin-right:1px}
.ui-rar{box-shadow:inset 0 -4px 0 var(--r)}
`;
  document.head.appendChild(s);
}

// Keyboard/gamepad focus navigation over [data-nav] elements inside root. Arrow keys move to the geometrically nearest
// element in that direction; confirm clicks it; back calls onBack. Call nav.update() every frame with G.input
// (actions up/down/left/right/confirm/back), or rely on the built-in keydown listener. nav.destroy() when closing.
export function makeNav(root, { onBack = null, input = null, initial = null } = {}) {
  let cur = null;
  const items = () => [...root.querySelectorAll('[data-nav]')].filter(e => e.offsetParent !== null);
  function focus(e) { if (cur) cur.classList.remove('focus'); cur = e; if (e) { e.classList.add('focus'); e.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); e.dispatchEvent(new CustomEvent('navfocus', { bubbles: true })); } }
  function move(dx, dy) {
    const list = items(); if (!list.length) return;
    if (!cur || !list.includes(cur)) { focus(list[0]); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(), vx = b.left + b.width / 2 - ax, vy = b.top + b.height / 2 - ay;
      const along = vx * dx + vy * dy; if (along <= 4) continue;
      const side = Math.abs(vx * dy - vy * dx), s = along + side * 2.2;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) focus(best);
  }
  const act = { up: () => move(0, -1), down: () => move(0, 1), left: () => move(-1, 0), right: () => move(1, 0), confirm: () => cur?.click(), back: () => onBack?.() };
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'confirm', Space: 'confirm', Escape: 'back', Backspace: 'back' };
  const onKey = e => { if (input) return; const k = KEYS[e.code]; if (!k) return; e.preventDefault(); e.stopPropagation(); act[k](); };
  window.addEventListener('keydown', onKey, true);
  root.addEventListener('mouseover', e => { const t = e.target.closest?.('[data-nav]'); if (t && root.contains(t)) focus(t); });
  setTimeout(() => focus(initial || items()[0] || null), 0);
  return {
    focus, move, get current() { return cur; },
    update() { if (!input) return; for (const k of ['up', 'down', 'left', 'right', 'confirm', 'back']) if (input.pressed(k)) { act[k](); break; } },
    destroy() { window.removeEventListener('keydown', onKey, true); },
  };
}
