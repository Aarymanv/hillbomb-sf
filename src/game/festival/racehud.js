// Race HUD: position / lap / time block, standings ladder with gaps, split popups, countdown lights, warnings,
// and name tags over the rivals' cars. Lives in the festival overlay layer; DOM writes only when values change.
import * as THREE from 'three';
import { fmtTime, fmtGap, esc, fmtNum } from './util.js';

const CSS = `
#hf-race{position:absolute;inset:0;display:none}
#hf-race.on{display:block}
#hf-race .blk{position:absolute;left:50%;top:18px;transform:translateX(-50%);display:flex;align-items:stretch;gap:2px;filter:drop-shadow(0 8px 24px rgba(0,0,0,.35))}
#hf-race .cell{background:rgba(8,9,14,.72);padding:8px 18px 9px;min-width:84px;text-align:center}
#hf-race .cell:first-child{border-radius:6px 0 0 6px}#hf-race .cell:last-child{border-radius:0 6px 6px 0}
#hf-race .cell .k{font:800 10.5px/1 var(--ui-sans);letter-spacing:.22em;text-transform:uppercase;color:var(--ui-dim)}
#hf-race .cell .v{font:italic 800 34px/1 var(--ui-cond);margin-top:3px;white-space:nowrap}
#hf-race .cell .v small{font-size:18px;color:var(--ui-dim);margin-left:2px}
#hf-race .cell.pos{background:var(--c,var(--ui-acc));color:#0b0c10;min-width:96px}
#hf-race .cell.pos .k{color:rgba(0,0,0,.6)}
#hf-race .lad{position:absolute;right:26px;top:150px;display:flex;flex-direction:column;gap:3px;min-width:230px}
#hf-lad{display:flex;flex-direction:column;gap:3px}
#hf-lad .row{display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(8,9,14,.62);border-radius:3px;font:700 13px/1 var(--ui-sans);color:var(--ui-ink)}
#hf-lad .row .p{width:18px;font:italic 800 17px/1 var(--ui-cond);color:var(--ui-dim)}#hf-lad .row .sw{width:4px;height:16px;border-radius:2px}
#hf-lad .row .n{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#hf-lad .row .g{font:italic 800 15px/1 var(--ui-cond);color:var(--ui-dim)}
#hf-lad .row.me{background:rgba(255,46,126,.85)}#hf-lad .row.me .p,#hf-lad .row.me .g{color:#fff}#hf-lad .row.done .g{color:#39e07a}
#hf-race .row{display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(8,9,14,.62);border-radius:3px;font:700 13px/1 var(--ui-sans);transition:transform .25s}
#hf-race .row .p{width:18px;font:italic 800 17px/1 var(--ui-cond);color:var(--ui-dim)}
#hf-race .row .sw{width:4px;height:16px;border-radius:2px;background:var(--c)}
#hf-race .row .n{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#hf-race .row .g{font:italic 800 15px/1 var(--ui-cond);color:var(--ui-dim)}
#hf-race .row.me{background:rgba(255,46,126,.85)}#hf-race .row.me .p,#hf-race .row.me .g{color:#fff}
#hf-race .row.done .g{color:#39e07a}
#hf-race .split{position:absolute;left:50%;top:92px;transform:translateX(-50%);font:italic 800 30px/1 var(--ui-cond);padding:6px 16px;border-radius:4px;background:rgba(8,9,14,.7);opacity:0;transition:opacity .2s}
#hf-race .split.on{opacity:1}#hf-race .split.good{color:#39e07a}#hf-race .split.bad{color:#ff4d5e}
#hf-race .warn{position:absolute;left:50%;top:38%;transform:translateX(-50%);font:italic 800 46px/1 var(--ui-cond);text-transform:uppercase;color:#ff4d5e;text-shadow:0 4px 24px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;white-space:nowrap}
#hf-race .warn.on{opacity:1;animation:hfblink .8s steps(2) infinite}
@keyframes hfblink{50%{opacity:.45}}
#hf-race .cd{position:absolute;left:50%;top:30%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .15s}
#hf-race .cd.on{opacity:1}
#hf-race .cd .lights{display:flex;gap:14px;justify-content:center;margin-bottom:14px}
#hf-race .cd .lights i{width:34px;height:34px;border-radius:50%;background:#2a2c33;box-shadow:inset 0 0 0 3px rgba(0,0,0,.4)}
#hf-race .cd .lights i.r{background:#ff3348;box-shadow:0 0 22px #ff3348}#hf-race .cd .lights i.g{background:#39e07a;box-shadow:0 0 26px #39e07a}
#hf-race .cd .n{font:italic 800 150px/.8 var(--ui-cond);text-shadow:0 8px 40px rgba(0,0,0,.5)}
#hf-race .tags{position:absolute;inset:0;overflow:hidden}
#hf-race .tag{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;font:800 12px/1 var(--ui-sans);letter-spacing:.08em;text-transform:uppercase;padding:4px 8px 4px 6px;border-radius:3px;background:rgba(8,9,14,.66);display:none;border-left:4px solid var(--c)}
#hf-race .tag b{font:italic 800 14px/1 var(--ui-cond);margin-right:6px;color:var(--c)}
#hf-race .sub{position:absolute;left:50%;top:94px;transform:translateX(-50%);font:700 14px/1 var(--ui-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--ui-dim);white-space:nowrap}
#hf-race .big{position:absolute;left:50%;top:20%;transform:translateX(-50%);text-align:center}
#hf-race .big .v{font:italic 800 64px/1 var(--ui-cond)}#hf-race .big .k{font:800 12px/1 var(--ui-sans);letter-spacing:.24em;text-transform:uppercase;color:var(--ui-acc2)}
`;
export function createRaceHud(F) {
  const { G, overlay } = F;
  if (!document.getElementById('hf-race-css')) { const s = document.createElement('style'); s.id = 'hf-race-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'hf-race';
  root.innerHTML = `<div class="tags"></div><div class="blk"></div><div class="sub"></div><div class="lad"></div><div class="split"></div><div class="warn"></div>
    <div class="cd"><div class="lights"><i></i><i></i><i></i></div><div class="n"></div></div><div class="big" style="display:none"><div class="k"></div><div class="v"></div></div>`;
  overlay.layer.appendChild(root);
  const blk = root.querySelector('.blk'), lad = root.querySelector('.lad'), split = root.querySelector('.split'), warn = root.querySelector('.warn'), sub = root.querySelector('.sub');
  const cd = root.querySelector('.cd'), cdN = cd.querySelector('.n'), lights = cd.querySelectorAll('.lights i'), tagsEl = root.querySelector('.tags');
  const big = root.querySelector('.big');
  const H = { root };
  let cells = [], rows = [], tags = [], splitT = 0, cellKeys = '';
  const _v = new THREE.Vector3();
  // with the UI shell's HUD (G.hud.race + checkpoint arrow), our own position block is hidden and the standings
  // ladder moves into the HUD's activity slot
  H.shellHud = () => !!(G.ui && G.hud?.race);
  H.show = function (cfg) {
    root.classList.add('on');
    const shell = H.shellHud();
    blk.style.display = shell ? 'none' : '';
    split.style.top = shell ? '138px' : '';
    const slot = shell ? G.ui.slots?.activity : null;
    if (slot && lad.parentNode !== slot) { slot.appendChild(lad); lad.style.cssText = 'position:static;min-width:230px'; lad.id = 'hf-lad'; }
    else if (!slot && lad.parentNode !== root) { root.appendChild(lad); lad.style.cssText = ''; }
    // cells: [{k, cls}] keys; values set by set()
    const key = cfg.cells.map(c => c.k).join('|');
    if (key !== cellKeys) {
      cellKeys = key;
      blk.innerHTML = cfg.cells.map(c => `<div class="cell ${c.cls || ''}"><div class="k">${esc(c.k)}</div><div class="v"></div></div>`).join('');
      cells = [...blk.querySelectorAll('.cell .v')].map(e => ({ e, v: null }));
    }
    blk.querySelector('.cell.pos')?.style.setProperty('--c', cfg.color || 'var(--ui-acc)');
    lad.innerHTML = ''; rows = [];
    for (let i = 0; i < (cfg.ladder || 0); i++) {
      const r = document.createElement('div'); r.className = 'row'; r.innerHTML = '<span class="p"></span><span class="sw"></span><span class="n"></span><span class="g"></span>';
      lad.appendChild(r); rows.push({ r, p: r.children[0], sw: r.children[1], n: r.children[2], g: r.children[3], key: '' });
    }
    tagsEl.innerHTML = ''; tags = [];
    for (let i = 0; i < (cfg.tags || 0); i++) { const t = document.createElement('div'); t.className = 'tag'; tagsEl.appendChild(t); tags.push({ t, key: '', vis: false }); }
    sub.textContent = cfg.sub || '';
    big.style.display = 'none';
  };
  H.hide = () => {
    root.classList.remove('on'); cd.classList.remove('on'); warn.classList.remove('on'); split.classList.remove('on');
    if (lad.parentNode !== root) { root.appendChild(lad); lad.style.cssText = ''; }
    lad.innerHTML = ''; rows = [];
    if (H.shellHud()) G.hud.race(null);
  };
  H.set = function (i, html) { const c = cells[i]; if (c && c.v !== html) { c.v = html; c.e.innerHTML = html; } };
  H.sub = t => { if (sub.textContent !== t) sub.textContent = t; };
  // ladder: entries [{pos, name, color, gap (s) | null, me, done}]
  H.ladder = function (entries) {
    for (let i = 0; i < rows.length; i++) {
      const R = rows[i], e = entries[i];
      if (!e) { R.r.style.display = 'none'; continue; }
      R.r.style.display = '';
      const g = e.me ? '' : e.gapText != null ? e.gapText : e.gap == null ? '' : fmtGap(e.gap);
      const key = e.pos + e.name + g + e.me + e.done;
      if (key === R.key) continue;
      R.key = key;
      R.p.textContent = e.pos; R.n.textContent = e.name; R.g.textContent = g; R.sw.style.background = e.color;
      R.r.classList.toggle('me', !!e.me); R.r.classList.toggle('done', !!e.done);
    }
  };
  H.split = function (text, good) { split.textContent = text; split.className = 'split on ' + (good ? 'good' : 'bad'); splitT = 2.6; };
  H.warn = function (text) { if (!text) { warn.classList.remove('on'); return; } if (warn.textContent !== text) warn.textContent = text; warn.classList.add('on'); };
  H.big = function (k, v) { if (!k) { big.style.display = 'none'; return; } big.style.display = ''; big.querySelector('.k').textContent = k; big.querySelector('.v').textContent = v; };
  // countdown: n = 3,2,1 -> red lights; 0 = GO (green); null hides
  H.countdown = function (n) {
    if (n == null) { cd.classList.remove('on'); return; }
    cd.classList.add('on');
    lights.forEach((l, i) => { l.className = n === 0 ? 'g' : i < 4 - n ? 'r' : ''; });
    cdN.textContent = n === 0 ? 'GO' : String(n);
    cdN.style.color = n === 0 ? '#39e07a' : '';
  };
  // name tags above cars: list [{v, name, color, pos}]
  H.tags = function (list) {
    const cam = G.camera, w = innerWidth, h = innerHeight;
    for (let i = 0; i < tags.length; i++) {
      const T = tags[i], e = list[i];
      let show = false;
      if (e && e.v) {
        const p = e.v.root.position;
        const dx = p.x - cam.position.x, dz = p.z - cam.position.z, d2 = dx * dx + dz * dz;
        if (d2 < 140 * 140 && d2 > 16) {
          _v.set(p.x, p.y + (e.v.spec?.height || 1.4) + 0.9, p.z).project(cam);
          if (_v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
            show = true;
            const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
            T.t.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%) scale(${Math.max(0.7, 1.15 - Math.sqrt(d2) / 160).toFixed(2)})`;
            const key = e.pos + e.name;
            if (T.key !== key) { T.key = key; T.t.innerHTML = `<b>${e.pos}</b>${esc(e.name)}`; T.t.style.setProperty('--c', e.color); }
          }
        }
      }
      if (show !== T.vis) { T.vis = show; T.t.style.display = show ? 'block' : 'none'; }
    }
  };
  H.update = function (dt) { if (splitT > 0) { splitT -= dt; if (splitT <= 0) split.classList.remove('on'); } };
  H.fmtTime = fmtTime; H.fmtNum = fmtNum;
  return H;
}
