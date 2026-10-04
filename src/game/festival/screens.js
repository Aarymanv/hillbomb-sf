// Festival screens (keyboard + gamepad through ui.openScreen): event card, results, prize spin, mission briefing /
// results, starter pick, car picker fallback, festival hub, fast travel, and the Campaign menu (tab or screen).
import { DISCIPLINES, DIFFICULTY, CHAPTERS, CHARACTERS, STORIES, ACCOLADES, STUNT_TYPES, PRIZE_TABLE, COSMETICS, RIVALS, BOARDS, FESTIVAL } from './catalog.js';
import { openScreen, confirmDialog, h, clsBadge, piBadge, RARITY } from './ui.js';
import { esc, fmtTime, fmtMoney, fmtNum, fmtDist, ordinal, stars as starStr, rng } from './util.js';
import { iconURL } from './icons.js';
import { classRank, CLASS_MAX } from './cars.js';

export function createScreens(F) {
  const { G, world } = F;
  const SC = {};
  const units = () => (G.hud?.units === 'kmh' ? 'kmh' : 'mph');
  const icon = (name, color = '#fff', bg = null, size = 22) => `<img src="${iconURL(name, color, bg)}" width="${size}" height="${size}" style="vertical-align:-5px">`;

  // ---------------------------------------------------------------- route map canvas
  function routeMap(pts, color, { w = 560, h = 330, loop = false } = {}) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.className = 'hf-map'; c.style.width = w + 'px'; c.style.height = h + 'px';
    const g = c.getContext('2d'); g.scale(2, 2);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pad = Math.max(120, (x1 - x0 + z1 - z0) * 0.12); x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const sc = Math.min(w / (x1 - x0), h / (z1 - z0)), ox = (w - (x1 - x0) * sc) / 2, oy = (h - (z1 - z0) * sc) / 2;
    const P = (x, z) => [ox + (x - x0) * sc, oy + (z - z0) * sc];
    g.fillStyle = '#0b1a22'; g.fillRect(0, 0, w, h);
    // land tint + streets from the road graph
    g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 1.2; g.lineCap = 'round';
    for (const e of world.graph.edges) {
      const a = e.pts[0], b = e.pts[e.pts.length - 1];
      if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < z0 || Math.min(a[1], b[1]) > z1) continue;
      g.lineWidth = e.width >= 18 ? 2 : 1.1;
      g.beginPath(); e.pts.forEach((p, i) => { const [sx, sy] = P(p[0], p[1]); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }); g.stroke();
    }
    // route
    const draw = (lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, z], i) => { const [sx, sy] = P(x, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }); if (loop) g.closePath(); g.stroke(); };
    draw(8, 'rgba(0,0,0,.5)'); draw(4.5, color);
    const [sx, sy] = P(pts[0][0], pts[0][1]);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 7, 0, 7); g.fill(); g.fillStyle = color; g.beginPath(); g.arc(sx, sy, 4.5, 0, 7); g.fill();
    if (!loop) { const [ex, ey] = P(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.fillStyle = '#111'; g.fillRect(ex - 7, ey - 7, 14, 14); g.fillStyle = '#fff'; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(ex - 7 + i * 7, ey - 7 + j * 7, 7, 7); }
    // north arrow
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '800 12px Barlow Condensed, sans-serif'; g.fillText('N', w - 18, 18);
    return c;
  }
  const mapOfEvent = ev => { const R = ev.route; return routeMap(R.pts, ev.disc.color, { loop: R.loop }); };

  // ---------------------------------------------------------------- event card
  SC.eventCard = function (ev) {
    return new Promise(res => {
      const R = ev.route, rec = F.S.events[ev.id], D = ev.disc;
      const grid = ev.type === 'drift' || ev.type === 'showcase' ? [] : F.rivals.pickGrid(ev, ev.rivals ?? 5, 0);
      const len = fmtDist(ev.length, units());
      let diff = F.S.difficulty ?? 1;
      const best = rec?.best != null ? (ev.type === 'drift' ? fmtNum(rec.best) : fmtTime(rec.best)) : '—';
      const reward = F.events.reward ? Math.round((({ road: 3200, street: 3800, dirt: 3400, xc: 4200, drag: 2600, drift: 3400, showcase: 9000 })[ev.type] + ev.length / 1000 * 900) / 50) * 50 : 0;
      const opp = ev.type === 'showcase' ? { jets: 'The Bay Blades display team', fog: 'Karl the Fog', boat: 'Stormpetrel, a foiling catamaran' }[ev.opponent] : null;
      const root = h(`<div>
        <div class="hf-kicker" style="--k:${D.color === '#ffffff' ? 'var(--ui-acc2)' : D.color}">${icon(D.icon, D.color === '#ffffff' ? '#ffc247' : D.color)} ${esc(D.name)}${ev.laps ? ` · ${ev.laps} lap${ev.laps > 1 ? 's' : ''}` : ''}${ev.traffic ? ' · Live traffic' : ''}${ev.time != null && (ev.time > 20 || ev.time < 5) ? ' · Night' : ''}</div>
        <div class="hf-title">${esc(ev.name)}</div>
        <p class="hf-desc">${esc(ev.desc)}</p>
        <div class="hf-cols">
          <div class="hf-col" style="flex:1.1">
            <div class="map-slot"></div>
            <div class="hf-stats">
              <div class="hf-stat"><span>Class limit</span><b>${piBadge(CLASS_MAX[ev.cls] || 999)}</b></div>
              <div class="hf-stat"><span>Length</span><b>${len}</b></div>
              <div class="hf-stat"><span>Reward</span><b style="color:var(--ui-acc2)">${fmtMoney(reward)}</b></div>
              <div class="hf-stat"><span>${ev.type === 'drift' ? 'Best score' : 'Best time'}</span><b>${best}</b></div>
              <div class="hf-stat"><span>Record</span><b>${rec?.wins ? `${rec.wins} win${rec.wins > 1 ? 's' : ''}` : rec?.done ? ordinal(rec.bestPlace || 0) : 'New'}</b></div>
            </div>
          </div>
          <div class="hf-col" style="flex:.9;min-width:300px">
            <div class="ui-h3">${opp ? 'Opponent' : ev.type === 'drift' ? 'Posted scores' : 'Rivals on the grid'}</div>
            <div class="hf-list">${opp ? `<div class="hf-li"><span class="sw" style="--c:#fff"></span><span class="nm">${esc(opp)}</span></div>`
              : ev.type === 'drift' ? F.rivals.pickGrid(ev, 5, 0).map(r => `<div class="hf-li"><span class="sw" style="--c:${r.color}"></span><span class="nm">${esc(r.nick)}<small>${esc(r.name)} · ${esc(r.home)}</small></span></div>`).join('')
              : grid.map(r => `<div class="hf-li"><span class="sw" style="--c:${r.color}"></span><span class="nm">${esc(r.nick)}<small>${esc(r.name)} · ${esc(r.home)}</small></span><span class="v" style="font-size:13px;color:var(--ui-dim)">${F.rivals.record(r.id).beat ? `${F.rivals.record(r.id).beat}-${F.rivals.record(r.id).lost}` : ''}</span></div>`).join('')}</div>
            <div class="ui-h3" style="margin-top:8px">Difficulty</div>
            <div class="hf-diff" data-nav data-lr tabindex="0"><span class="arr">‹</span><span class="nm"></span><span class="arr">›</span><span class="hf-pips"></span><span class="bn"></span></div>
            <p class="hf-note dd"></p>
            <div class="hf-btns">
              <button class="ui-btn primary" data-nav data-a="go">${icon('road', '#fff')} Start event</button>
              <button class="ui-btn" data-nav data-a="line">Driving line: <span class="ln"></span></button>
              <button class="ui-btn" data-nav data-a="back">Back</button>
            </div>
          </div>
        </div>
        <div class="hf-foot"><span><span class="ui-key">←</span><span class="ui-key">→</span> difficulty</span><span><span class="ui-key">Enter</span> select</span><span><span class="ui-key">Esc</span> back</span><span>Class ${esc(ev.cls)} or lower: ${esc(ev.cls === 'D' ? 'D' : ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'].slice(0, classRank(ev.cls) + 1).join(' / '))}</span></div>
      </div>`);
      root.querySelector('.map-slot').appendChild(mapOfEvent(ev));
      const dEl = root.querySelector('.hf-diff'), lnEl = root.querySelector('.ln');
      const paint = () => {
        const Dd = DIFFICULTY[diff];
        dEl.querySelector('.nm').textContent = Dd.name; dEl.querySelector('.bn').textContent = Dd.bonus ? `+${Math.round(Dd.bonus * 100)}% credits` : '';
        dEl.querySelector('.hf-pips').innerHTML = DIFFICULTY.map((_, i) => `<i class="${i <= diff ? 'on' : ''}"></i>`).join('');
        root.querySelector('.dd').textContent = Dd.desc;
        lnEl.textContent = { full: 'Full', braking: 'Braking only', off: 'Off' }[F.S.drivingLine || 'full'];
      };
      const setDiff = d => { diff = Math.max(0, Math.min(DIFFICULTY.length - 1, d)); F.S.difficulty = diff; G.audio?.ui('hover'); paint(); };
      paint();
      let done = false;
      const s = openScreen(G, root, { onBack: c => { c(); if (!done) { done = true; res(false); } }, keys: { left: () => setDiff(diff - 1), right: () => setDiff(diff + 1), lb: () => setDiff(diff - 1), rb: () => setDiff(diff + 1) }, initial: root.querySelector('[data-a=go]') });
      dEl.addEventListener('click', e => { const r = dEl.getBoundingClientRect(); setDiff(diff + (e.clientX < r.left + r.width / 2 ? -1 : 1)); });
      root.querySelector('[data-a=go]').onclick = () => { done = true; F.save(); s.close(); G.audio?.ui('confirm'); res(true); };
      root.querySelector('[data-a=back]').onclick = () => { done = true; s.close(); res(false); };
      root.querySelector('[data-a=line]').onclick = () => { const o = ['full', 'braking', 'off']; F.S.drivingLine = o[(o.indexOf(F.S.drivingLine || 'full') + 1) % 3]; paint(); F.save(); };
    });
  };

  // ---------------------------------------------------------------- results
  SC.results = function (A, res, rw) {
    return new Promise(done => {
      const drift = res.score != null;
      const win = !drift && res.place === 1 && res.how === 'finish';
      const me = res.standings.find(r => r.player);
      const head = res.how === 'caught' ? 'Caught' : res.how === 'beaten' ? 'Beaten' : res.how === 'timeout' && !drift ? 'Out of time' : ordinal(res.place);
      const bestTime = res.standings.filter(r => !r.est && isFinite(r.time)).reduce((m, r) => Math.min(m, r.time), Infinity);
      const rows = res.standings.map(r => `<div class="hf-li ${r.player ? 'me' : ''}"><span class="v" style="width:28px">${r.pos}</span><span class="sw" style="--c:${r.color}"></span>
        <span class="nm">${esc(r.name)}<small>${esc(r.car || (r.rival ? r.rival.home : ''))}</small></span>
        <span class="v">${r.label ? esc(r.label) : drift ? fmtNum(r.score) : isFinite(r.time) ? (r.pos === 1 || !isFinite(bestTime) ? fmtTime(r.time) : '+' + (r.time - bestTime).toFixed(2)) + (r.est ? '<small style="font-size:11px;color:var(--ui-dim)"> est</small>' : '') : 'DNF'}</span></div>`).join('');
      const lines = (rw?.lines || []).map(([k, v]) => `<div class="hf-reward"><span>${esc(k)}</span><b>${v < 0 ? '-' : ''}${fmtMoney(Math.abs(v))}</b></div>`).join('');
      const root = h(`<div>
        <div class="hf-kicker" style="--k:${A.color}">Results · ${esc(A.cfg.kicker || '')}</div>
        <div class="hf-title" style="margin-bottom:0">${esc(A.cfg.name)}</div>
        <div class="hf-cols">
          <div class="hf-col" style="flex:1">
            <div style="display:flex;align-items:flex-end;gap:22px"><div class="hf-big" style="color:${win ? 'var(--ui-acc2)' : res.how === 'finish' || drift ? 'var(--ui-ink)' : '#ff4d5e'}">${esc(head)}</div>
              <div style="padding-bottom:10px"><div class="ui-h3">${drift ? 'Score' : 'Time'}</div><div style="font:italic 800 40px/1 var(--ui-cond)">${drift ? fmtNum(res.score) : fmtTime(res.time)}</div>
              ${rw?.pb ? '<span class="hf-pb">Personal best</span>' : ''} ${res.clean && !drift && res.how === 'finish' ? '<span class="hf-pb" style="background:var(--ui-acc2)">Clean race</span>' : ''}</div></div>
            ${res.laps?.length > 1 ? `<div class="hf-note">Laps: ${res.laps.map(fmtTime).join(' · ')}</div>` : ''}
            ${res.launch != null && A.discipline === 'drag' ? `<div class="hf-note">Reaction ${res.launch.toFixed(3)} s · Trap speed ${Math.round(res.maxSpeed * (units() === 'kmh' ? 3.6 : 2.23694))} ${units() === 'kmh' ? 'km/h' : 'mph'}</div>` : ''}
            <div class="hf-list hf-scroll" style="max-height:44vh">${rows}</div>
          </div>
          <div class="hf-col" style="width:min(420px,38vw)">
            <div class="ui-h3">Rewards</div>
            ${lines}
            <div class="hf-reward total"><span>Credits</span><b>${fmtMoney(rw?.credits || 0)}</b></div>
            <div class="hf-reward"><span>XP</span><b>+${fmtNum(rw?.xp || 0)}</b></div>
            <div class="hf-reward"><span>Festival Points</span><b style="color:var(--ui-acc)">+${fmtNum(rw?.fp || 0)}</b></div>
            ${rw?.car ? `<div class="hf-reward"><span>Car</span><b>${esc(F.cars.name(rw.car))}</b></div>` : ''}
            ${rw?.beaten?.length ? `<p class="hf-note" style="margin-top:10px">Beat ${rw.beaten.map(r => `<b style="color:${r.color}">${esc(r.nick)}</b>`).join(', ')}</p>` : ''}
            ${rw?.firstWin ? '<p class="hf-note">First win on this event.</p>' : ''}
            <div class="hf-btns"><button class="ui-btn primary" data-nav data-a="ok">Continue</button><button class="ui-btn" data-nav data-a="restart">Restart</button></div>
          </div>
        </div></div>`);
      let fin = false;
      const s = openScreen(G, root, { onBack: c => { c(); if (!fin) { fin = true; done('continue'); } }, initial: root.querySelector('[data-a=ok]') });
      root.querySelector('[data-a=ok]').onclick = () => { fin = true; s.close(); done('continue'); };
      root.querySelector('[data-a=restart]').onclick = () => { fin = true; s.close(); done('restart'); };
      G.audio?.ui(win ? 'money' : 'confirm');
    });
  };

  // ---------------------------------------------------------------- mission briefing + result
  SC.mission = function (story, m) {
    return new Promise(res => {
      const ch = CHARACTERS[story.host], idx = story.missions.indexOf(m), best = F.stories.starsOf(story.id, m.id);
      const thr = m.kind === 'reach' || m.kind === 'fare' ? ['Arrive', 'Arrive clean', 'Arrive clean and early'] : m.kind === 'race' || m.kind === 'drag' ? ['Finish 2nd', '—', 'Win'] : (m.stars || []).map(v => fmtThreshold(m, v));
      const root = h(`<div style="max-width:1100px">
        <div class="hf-kicker" style="--k:${story.color}">${icon('story', story.color)} Story · ${esc(story.name)} · Mission ${idx + 1} of ${story.missions.length}</div>
        <div class="hf-title">${esc(m.name)}</div>
        <p class="hf-desc">${esc(m.desc)}</p>
        <div class="hf-cols">
          <div class="hf-col" style="flex:1">
            <div class="hf-li" style="padding:14px"><span class="sw" style="--c:${ch.color}"></span><span class="nm">${esc(ch.name)}<small>${esc(ch.role)}</small></span></div>
            <p class="hf-note">${esc(story.blurb)}</p>
            <div class="ui-h3">Stars</div>
            <div class="hf-list">${thr.map((t, i) => `<div class="hf-li"><span class="v" style="color:${i < best ? 'var(--ui-acc2)' : 'var(--ui-dim)'}">${'★'.repeat(i + 1)}</span><span class="nm">${esc(String(t))}</span></div>`).join('')}</div>
          </div>
          <div class="hf-col" style="width:360px">
            <div class="hf-stats">
              <div class="hf-stat"><span>Car</span><b style="font-size:20px">${m.car ? esc(F.cars.name(m.car)) : `Your ${clsBadge(m.cls || 'A')}`}</b></div>
              <div class="hf-stat"><span>Reward</span><b style="color:var(--ui-acc2)">${fmtMoney(m.rewards.credits)}</b></div>
              ${m.timeLimit ? `<div class="hf-stat"><span>Time</span><b>${fmtTime(m.timeLimit, false)}</b></div>` : ''}
              <div class="hf-stat"><span>Best</span><b>${best ? starStr(best) : '—'}</b></div>
            </div>
            ${m.rewards.car ? `<p class="hf-note">Completing this mission also wins you the ${esc(F.cars.name(m.rewards.car))}.</p>` : ''}
            <div class="hf-btns"><button class="ui-btn primary" data-nav data-a="go">Start mission</button><button class="ui-btn" data-nav data-a="back">Back</button></div>
          </div>
        </div></div>`);
      let fin = false;
      const s = openScreen(G, root, { onBack: c => { c(); if (!fin) { fin = true; res(false); } }, initial: root.querySelector('[data-a=go]') });
      root.querySelector('[data-a=go]').onclick = () => { fin = true; s.close(); G.audio?.ui('confirm'); res(true); };
      root.querySelector('[data-a=back]').onclick = () => { fin = true; s.close(); res(false); };
    });
  };
  function fmtThreshold(m, v) {
    const u = units();
    switch (m.kind) {
      case 'tail': return `In the pocket ${Math.round(v * 100)}% of the time`;
      case 'tag': return `${v} tag${v > 1 ? 's' : ''}`;
      case 'air': return `${v.toFixed(1)} s of air`;
      case 'drift': return `${fmtNum(v)} points`;
      case 'speed': return `${Math.round(u === 'kmh' ? v * 1.609 : v)} ${u === 'kmh' ? 'km/h' : 'mph'}`;
      case 'smash': return `${v} boxes`;
      case 'nearmiss': return `${v} near misses`;
      default: return String(v);
    }
  }
  SC.missionResult = function (story, m, r) {
    return new Promise(res => {
      const next = F.stories.next(story);
      const scoreTxt = m.kind === 'tail' ? `${Math.round(r.score * 100)}% in the pocket` : m.kind === 'air' ? `${(r.score || 0).toFixed(2)} s air` : m.kind === 'drift' ? `${fmtNum(r.score)} pts` : m.kind === 'speed' ? `${Math.round(units() === 'kmh' ? r.score * 1.609 : r.score)} ${units() === 'kmh' ? 'km/h' : 'mph'}` : m.kind === 'tag' ? `${r.score} tags` : m.kind === 'smash' ? `${r.score} smashed` : m.kind === 'nearmiss' ? `${r.score} near misses` : '';
      const rw = r.rewards;
      const root = h(`<div style="max-width:980px;margin:auto 0">
        <div class="hf-kicker" style="--k:${story.color}">${esc(story.name)} · ${r.stars ? 'Mission complete' : 'Mission failed'}</div>
        <div class="hf-title">${esc(m.name)}</div>
        <div style="display:flex;gap:40px;align-items:flex-end;margin:10px 0 18px">
          <div class="hf-big" style="font-size:110px;color:${r.stars ? 'var(--ui-acc2)' : '#ff4d5e'}">${r.stars ? '★'.repeat(r.stars) + '<span style="color:var(--ui-faint)">' + '★'.repeat(3 - r.stars) + '</span>' : 'Failed'}</div>
          <div><div class="ui-h3">${esc(r.fail || (r.how === 'timeout' ? 'Out of time' : 'Result'))}</div><div style="font:italic 800 34px/1 var(--ui-cond)">${esc(scoreTxt)}</div></div>
        </div>
        ${r.stars ? `<div class="hf-reward"><span>Credits</span><b>${fmtMoney(rw.credits)}</b></div><div class="hf-reward"><span>XP</span><b>+${fmtNum(rw.xp)}</b></div><div class="hf-reward"><span>Festival Points</span><b style="color:var(--ui-acc)">+${fmtNum(rw.fp)}</b></div>${rw.spins ? `<div class="hf-reward"><span>Prize Spins</span><b>+${rw.spins}</b></div>` : ''}${rw.car ? `<div class="hf-reward"><span>Car</span><b>${esc(F.cars.name(rw.car))}</b></div>` : ''}` : ''}
        <div class="hf-btns">${r.stars && next ? '<button class="ui-btn primary" data-nav data-a="next">Next mission</button>' : ''}<button class="ui-btn ${r.stars && next ? '' : 'primary'}" data-nav data-a="ok">Continue</button><button class="ui-btn" data-nav data-a="retry">Retry</button></div>
      </div>`);
      let fin = false;
      const s = openScreen(G, root, { onBack: c => { c(); if (!fin) { fin = true; res('ok'); } } });
      for (const a of ['ok', 'retry', 'next']) { const b = root.querySelector(`[data-a=${a}]`); if (b) b.onclick = () => { fin = true; s.close(); res(a); }; }
    });
  };

  // ---------------------------------------------------------------- starter car pick
  SC.starterPick = function (opts) {
    return new Promise(res => {
      const root = h(`<div style="margin:auto 0">
        <div class="hf-kicker">${esc(FESTIVAL.name)} · San Francisco</div>
        <div class="hf-title">Choose your first car</div>
        <p class="hf-desc">It is yours to keep. You can win, buy and find many more around the city.</p>
        <div class="hf-grid" style="grid-template-columns:repeat(3,1fr);margin-top:26px">${opts.map((o, i) => {
          const sp = F.cars.spec(o.key);
          return `<div class="hf-tile" data-nav data-i="${i}" style="min-height:230px;--c:${['#ff2e7e', '#ffc247', '#4fd2ff'][i]};padding:20px 22px">
            <div style="display:flex;justify-content:space-between;align-items:center">${piBadge(sp?.pi || 500)}<span class="ui-h3">${esc(sp?.tags?.[0] || '')}</span></div>
            <div class="t" style="font-size:36px;margin-top:18px">${esc(sp?.name || o.key)}</div>
            <div class="s" style="font-size:14px;margin-top:10px">${esc(o.blurb)}</div>
            ${sp?.stats?.top ? `<div class="s" style="margin-top:14px">${sp.stats.drive || ''} · ${sp.stats.torque || ''} Nm · top ${Math.round(units() === 'kmh' ? sp.stats.top : sp.stats.top / 1.609)} ${units() === 'kmh' ? 'km/h' : 'mph'}</div>` : ''}
          </div>`;
        }).join('')}</div></div>`);
      const s = openScreen(G, root, { onBack: () => {} });
      root.querySelectorAll('[data-i]').forEach(t => t.onclick = () => { s.close(); G.audio?.ui('purchase'); res(opts[+t.dataset.i].key); });
    });
  };

  // ---------------------------------------------------------------- car picker (fallback when the garage module has none)
  SC.carPick = function ({ cls, title, kicker, owned, loaner }) {
    return new Promise(res => {
      const list = owned.map(k => ({ k, s: F.cars.spec(k), ok: F.cars.eligible(k, cls) })).filter(x => x.s).sort((a, b) => (b.ok - a.ok) || (b.s.pi - a.s.pi));
      const cur = F.cars.current();
      const root = h(`<div>
        <div class="hf-kicker">${esc(kicker || 'Event')} · Class ${esc(cls)} or lower</div>
        <div class="hf-title">Choose a car</div>
        <p class="hf-desc">${esc(title || '')}</p>
        <div class="hf-grid hf-scroll" style="margin-top:20px">${list.map(x => `<div class="hf-tile ${x.ok ? '' : 'locked'}" data-nav data-k="${x.k}" style="--c:${x.ok ? 'var(--ui-acc)' : '#555'}">
          <div style="display:flex;justify-content:space-between">${piBadge(x.s.pi)}${x.k === cur ? '<span class="ui-h3" style="color:var(--ui-acc2)">Current</span>' : ''}</div>
          <div class="t" style="margin-top:10px">${esc(x.s.name)}</div><div class="s">${x.ok ? 'Eligible' : `Class ${x.s.cls}: too fast for this event`}</div></div>`).join('')}
          ${loaner ? `<div class="hf-tile" data-nav data-k="__loan" style="--c:var(--ui-acc2)"><div style="display:flex;justify-content:space-between">${piBadge(F.cars.spec(loaner)?.pi || 700)}<span class="ui-h3" style="color:var(--ui-acc2)">Loaner</span></div><div class="t" style="margin-top:10px">${esc(F.cars.name(loaner))}</div><div class="s">Borrow it for this event (10% loaner fee)</div></div>` : ''}
        </div></div>`);
      let fin = false;
      const s = openScreen(G, root, { onBack: c => { c(); if (!fin) { fin = true; res(null); } }, initial: root.querySelector(`[data-k="${cur}"]:not(.locked)`) || root.querySelector('[data-nav]:not(.locked)') });
      root.querySelectorAll('[data-k]').forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        if (k === '__loan') { fin = true; s.close(); res({ key: loaner, loaner: true }); return; }
        if (t.classList.contains('locked')) { G.audio?.ui('error'); return; }
        fin = true; s.close(); res({ key: k, loaner: false });
      });
    });
  };
  SC.confirm = opts => confirmDialog(G, opts);

  // ---------------------------------------------------------------- prize spin
  function rollItem(rand, kind = 'normal') {
    const W = PRIZE_TABLE[kind]; let tot = 0; for (const k in W) tot += W[k];
    let r = rand() * tot, rar = 'common'; for (const k in W) { r -= W[k]; if (r <= 0) { rar = k; break; } }
    const pool = PRIZE_TABLE.items[rar], t = pool[Math.floor(rand() * pool.length)];
    const it = { rarity: rar, ...t };
    if (t.kind === 'car') {
      const R = F.cars.roster().filter(k => { const s = F.cars.spec(k); return s && (s.cls === t.cls || (t.cls === 'S1' && s.cls === 'S2')); });
      const owned = F.cars.owned();
      const pick = R.filter(k => !owned.includes(k)); const pool2 = pick.length ? pick : R;
      if (!pool2.length) return { rarity: rar, kind: 'credits', amount: 15000 };
      it.car = pool2[Math.floor(rand() * pool2.length)]; it.dupe = owned.includes(it.car);
    }
    return it;
  }
  const itemLabel = it => it.kind === 'credits' ? fmtMoney(it.amount) : it.kind === 'car' ? F.cars.name(it.car) : COSMETICS[it.id]?.name || it.id;
  const itemSub = it => it.kind === 'credits' ? 'Credits' : it.kind === 'car' ? `Car · ${F.cars.spec(it.car)?.cls || ''}` : COSMETICS[it.id]?.type || 'Cosmetic';
  const card = it => `<div class="hf-spin-card" style="--r:${RARITY[it.rarity]}"><div class="rr">${it.rarity}</div><div class="nm">${esc(itemLabel(it))}</div><div class="sb">${esc(itemSub(it))}</div></div>`;
  function grantItem(it) {
    if (it.kind === 'credits') G.economy.add(it.amount, 0, 'spin');
    else if (it.kind === 'car') { if (it.dupe) G.economy.add(25000, 0, 'spin'); else F.cars.give(it.car, 'prizespin', { reveal: false }); }
    else if (it.kind === 'cosmetic') { if (!F.S.cosmetics.includes(it.id)) F.S.cosmetics.push(it.id); else G.economy.add(10000, 0, 'spin'); }
    F.save();
  }
  SC.prizeSpin = function (superSpin = false) {
    return new Promise(res => {
      ensureSpinCss();
      const rand = rng((Date.now() & 0xffffff) ^ 0x51f15e);
      const reels = superSpin ? 3 : 1, N = 42, WIN = 36;
      const wins = [], strips = [];
      for (let r = 0; r < reels; r++) {
        const items = []; for (let i = 0; i < N; i++) items.push(rollItem(rand, superSpin ? 'super' : 'normal'));
        wins.push(items[WIN]); strips.push(items);
      }
      const root = h(`<div style="margin:auto 0">
        <div class="hf-kicker">${superSpin ? 'Super Prize Spin' : 'Prize Spin'}</div>
        <div class="hf-title">${superSpin ? 'Three reels. Three prizes.' : 'Spin for a prize'}</div>
        <div class="hf-spin">${strips.map(it => `<div class="hf-reel"><div class="hf-strip">${it.map(card).join('')}</div></div>`).join('')}<div class="hf-spin-mark"></div></div>
        <div class="hf-spin-won"></div>
        <div class="hf-btns"><button class="ui-btn primary" data-nav data-a="ok" disabled>Spinning...</button></div></div>`);
      const s = openScreen(G, root, { onBack: () => {} });
      const CW = 196; // card width incl. gap
      const stripsEl = [...root.querySelectorAll('.hf-strip')];
      let finished = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        stripsEl.forEach((el, r) => {
          const reelW = el.parentElement.clientWidth || 900;
          const jitter = (rand() - 0.5) * 120;
          const target = WIN * CW - reelW / 2 + CW / 2 + jitter * 0.8;
          const dur = 4.2 + r * 0.9;
          el.style.transition = `transform ${dur}s cubic-bezier(.08,.82,.16,1)`;
          el.style.transform = `translateX(${-target}px)`;
          // ticking as cards pass the marker
          let last = -1; const t0 = performance.now();
          const tick = setInterval(() => {
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); const x = -m.m41;
            const idx = Math.floor((x + reelW / 2) / CW);
            if (idx !== last) { last = idx; G.audio?.ui('hover'); }
            if (performance.now() - t0 > dur * 1000 + 60) { clearInterval(tick); reveal(r); }
          }, 30);
        });
      }));
      function reveal(r) {
        const it = wins[r];
        const reel = root.querySelectorAll('.hf-reel')[r];
        reel.classList.add('won'); reel.style.setProperty('--r', RARITY[it.rarity]);
        G.audio?.ui(it.rarity === 'legendary' ? 'levelup' : it.rarity === 'epic' ? 'purchase' : 'money');
        grantItem(it);
        root.querySelector('.hf-spin-won').insertAdjacentHTML('beforeend', `<div class="hf-li" style="--c:${RARITY[it.rarity]}"><span class="sw" style="--c:${RARITY[it.rarity]}"></span><span class="nm">${esc(itemLabel(it))}<small>${esc(itemSub(it))}${it.dupe ? ' · already owned: +$25,000 instead' : ''}</small></span><span class="v" style="color:${RARITY[it.rarity]};text-transform:uppercase;font-size:15px">${it.rarity}</span></div>`);
        if (++finished === reels) { const b = root.querySelector('[data-a=ok]'); b.disabled = false; b.textContent = 'Collect'; b.onclick = () => { s.close(); res(wins); }; s.nav.focus(b); }
      }
    });
  };
  function ensureSpinCss() {
    if (document.getElementById('hf-spin-css')) return;
    const st = document.createElement('style'); st.id = 'hf-spin-css';
    st.textContent = `.hf-spin{position:relative;display:flex;flex-direction:column;gap:12px;margin:26px 0 18px}
.hf-reel{position:relative;height:150px;overflow:hidden;border-radius:8px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 1px var(--ui-faint);transition:box-shadow .3s}
.hf-reel.won{box-shadow:inset 0 0 0 3px var(--r),0 0 40px -6px var(--r)}
.hf-strip{display:flex;gap:12px;padding:14px 0;will-change:transform}
.hf-spin-card{flex:none;width:184px;height:120px;border-radius:6px;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));box-shadow:inset 0 -5px 0 var(--r),inset 0 0 0 1px rgba(255,255,255,.08);padding:12px 14px;box-sizing:border-box}
.hf-spin-card .rr{font:800 11px/1 var(--ui-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--r)}
.hf-spin-card .nm{font:italic 800 24px/1 var(--ui-cond);text-transform:uppercase;margin-top:12px}
.hf-spin-card .sb{font:500 12px/1.3 var(--ui-sans);color:var(--ui-dim);margin-top:6px}
.hf-spin-mark{position:absolute;left:50%;top:-8px;bottom:-8px;width:4px;margin-left:-2px;background:var(--ui-acc);box-shadow:0 0 18px var(--ui-acc);border-radius:2px}
.hf-spin-won{display:flex;flex-direction:column;gap:6px;min-height:44px}`;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- festival hub (site interaction)
  SC.hub = function (site) {
    const tiles = [];
    tiles.push({ a: 'campaign', t: 'Campaign', s: `Chapter ${F.chapter() + 1}: ${CHAPTERS[F.chapter()].name} · ${fmtNum(F.S.fp)} FP`, i: 'site', c: '#ff2e7e' });
    if (F.S.spins + F.S.superSpins > 0) tiles.push({ a: 'spin', t: 'Prize Spin', s: `${F.S.spins} spin${F.S.spins === 1 ? '' : 's'}${F.S.superSpins ? ` · ${F.S.superSpins} super` : ''} ready`, i: 'spin', c: '#ffc247' });
    if (G.garage?.open) tiles.push({ a: 'garage', t: 'Garage', s: 'Your cars, upgrades and tuning', i: 'house', c: '#4fd2ff' });
    if (G.garage?.openAutoshow || G.garage?.autoshow) tiles.push({ a: 'autoshow', t: 'Autoshow', s: 'Buy new cars', i: 'road', c: '#39e07a' });
    const evs = F.events.list.filter(e => F.events.available(e) && e.start && Math.hypot(e.start.x - site.hub.x, e.start.z - site.hub.z) < 900).slice(0, 4);
    for (const e of evs) tiles.push({ a: 'ev:' + e.id, t: e.name, s: `${e.disc.name} · Class ${e.cls} · set GPS`, i: e.disc.icon, c: e.disc.color });
    tiles.push({ a: 'ft', t: 'Fast Travel', s: F.coll.ftCost() ? `${fmtMoney(F.coll.ftCost())} per trip` : 'Free', i: 'fasttravel', c: '#a7b0ba' });
    const root = h(`<div>
      <div class="hf-kicker" style="--k:${site.color}">${esc(site.kind === 'main' ? 'Festival hub' : 'Outpost')} · ${esc(site.place)}</div>
      <div class="hf-title">${esc(site.name)}</div>
      <div class="hf-grid" style="margin-top:20px">${tiles.map(t => `<div class="hf-tile" data-nav data-a="${t.a}" style="--c:${t.c};min-height:92px"><div class="t">${icon(t.i, t.c)} ${esc(t.t)}</div><div class="s">${esc(t.s)}</div></div>`).join('')}</div>
      <div class="hf-foot"><span><span class="ui-key">Esc</span> close</span></div></div>`);
    const s = openScreen(G, root, {});
    root.querySelectorAll('[data-a]').forEach(el => el.onclick = async () => {
      const a = el.dataset.a;
      s.close();
      if (a === 'campaign') SC.campaign();
      else if (a === 'spin') F.useSpin();
      else if (a === 'garage') G.garage.open();
      else if (a === 'autoshow') (G.garage.openAutoshow || G.garage.autoshow)();
      else if (a === 'ft') SC.fastTravel();
      else if (a.startsWith('ev:')) F.gpsTo(F.events.byId[a.slice(3)].start, F.events.byId[a.slice(3)].disc.color, F.events.byId[a.slice(3)].name);
    });
  };
  SC.fastTravel = function () {
    const T = F.coll.ftTargets();
    const cost = F.coll.ftCost();
    const root = h(`<div>
      <div class="hf-kicker">Fast travel · ${cost ? fmtMoney(cost) + ' per trip' : 'free'}</div><div class="hf-title">Where to?</div>
      <p class="hf-desc">Festival sites you have opened and houses you own. ${BOARDS.filter(b => b.kind === 'ft').length} fast travel boards around the city each cut the price by 10%.</p>
      <div class="hf-grid" style="margin-top:20px">${T.map((t, i) => `<div class="hf-tile" data-nav data-i="${i}" style="--c:${t.color}"><div class="t">${icon(t.icon, t.color)} ${esc(t.name)}</div><div class="s">${esc(t.sub || '')} · ${fmtDist(Math.hypot(t.x - G.player.pos.x, t.z - G.player.pos.z), units())}</div></div>`).join('')}</div></div>`);
    const s = openScreen(G, root, {});
    root.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { s.close(); F.coll.fastTravel(T[+el.dataset.i]); });
  };

  // ---------------------------------------------------------------- campaign
  const TABS = [['overview', 'Festival'], ['events', 'Events'], ['stories', 'Stories'], ['stunts', 'Stunts'], ['world', 'Collectibles'], ['accolades', 'Accolades'], ['rivals', 'Rivals'], ['options', 'Options']];
  function campaignHTML(tab, tabs = TABS) {
    const S = F.S, ch = F.chapter(), C = CHAPTERS[ch], N = CHAPTERS[ch + 1];
    const frac = N ? (S.fp - C.fp) / (N.fp - C.fp) : 1;
    let body = '';
    if (tab === 'overview') {
      const evDone = F.events.list.filter(e => S.events[e.id]?.done).length, evAll = F.events.list.filter(e => !e.broken).length;
      body = `<div class="hf-chapter"><div class="n">${ch + 1}</div><div style="flex:1"><div class="ui-h3">Chapter ${ch + 1} of ${CHAPTERS.length}</div><div class="ui-h2" style="margin-top:4px">${esc(C.name)}</div><div class="hf-note" style="margin-top:4px">${esc(C.desc)}</div>
          <div class="hf-bar"><i style="width:${Math.round(frac * 100)}%"></i></div><div class="hf-note" style="margin-top:6px">${fmtNum(S.fp)} Festival Points${N ? ` · next: <b>${esc(N.name)}</b> at ${fmtNum(N.fp)}` : ' · Festival complete'}</div></div></div>
        <div class="hf-stats" style="margin-top:14px">
          <div class="hf-stat"><span>Level</span><b>${G.economy.level}</b></div><div class="hf-stat"><span>Credits</span><b>${fmtMoney(G.economy.money)}</b></div>
          <div class="hf-stat"><span>Events</span><b>${evDone} / ${evAll}</b></div><div class="hf-stat"><span>Wins</span><b>${F.stat('wins')}</b></div>
          <div class="hf-stat"><span>Stunt stars</span><b>${F.stat('stuntStars')}</b></div><div class="hf-stat"><span>Roads</span><b>${Math.floor(F.coll.roadsPct())}%</b></div>
          <div class="hf-stat"><span>Accolades</span><b>${Object.keys(S.accolades).length} / ${ACCOLADES.length}</b></div>
        </div>
        <div class="ui-h3" style="margin-top:18px">Chapters</div>
        <div class="hf-grid">${CHAPTERS.map(c => `<div class="hf-tile ${c.n > ch ? 'locked' : 'done'}" data-nav style="--c:${c.n <= ch ? 'var(--ui-acc)' : '#555'}"><div class="r">${c.n <= ch ? '✓' : fmtNum(c.fp) + ' FP'}</div><div class="t">${c.n + 1}. ${esc(c.name)}</div><div class="s">${esc(c.desc)}</div></div>`).join('')}</div>
        ${S.spins + S.superSpins ? `<div class="hf-btns"><button class="ui-btn primary" data-nav data-act="spin">${icon('spin')} Prize Spin (${S.spins}${S.superSpins ? ` + ${S.superSpins} super` : ''})</button></div>` : ''}`;
    } else if (tab === 'events') {
      const list = F.events.list.filter(e => !e.broken);
      body = Object.entries(DISCIPLINES).filter(([k]) => k !== 'story').map(([k, D]) => {
        const evs = list.filter(e => e.type === k); if (!evs.length) return '';
        return `<div class="ui-h3" style="margin:14px 0 8px;color:${D.color === '#ffffff' ? 'var(--ui-acc2)' : D.color}">${icon(D.icon, D.color === '#ffffff' ? '#ffc247' : D.color, null, 18)} ${esc(D.name)}</div><div class="hf-grid">${evs.map(e => {
          const r = S.events[e.id], av = F.events.available(e);
          return `<div class="hf-tile ${av ? '' : 'locked'} ${r?.wins ? 'done' : ''}" data-nav data-ev="${e.id}" style="--c:${D.color}"><div class="r">${!av ? 'Ch. ' + ((e.chapter || 0) + 1) : r?.wins ? '1st ✓' : r?.done ? ordinal(r.bestPlace || 0) : ''}</div>
            <div class="t">${esc(e.name)}</div><div class="s">Class ${e.cls}${e.laps ? ` · ${e.laps} lap${e.laps > 1 ? 's' : ''}` : ''} · ${esc(e.district || '')}${r?.best != null ? ` · Best ${e.type === 'drift' ? fmtNum(r.best) : fmtTime(r.best)}` : ''}</div></div>`;
        }).join('')}</div>`;
      }).join('') + '<p class="hf-note" style="margin-top:12px">Select an event to set your GPS to it.</p>';
    } else if (tab === 'stories') {
      body = `<div class="hf-grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${STORIES.map(s => {
        const av = F.stories.available(s), done = F.stories.completed(s.id), ch2 = CHARACTERS[s.host];
        return `<div class="hf-tile ${av ? '' : 'locked'}" data-nav data-story="${s.id}" style="--c:${s.color};min-height:150px"><div class="r">${done} / ${s.missions.length}</div><div class="t">${esc(s.name)}</div><div class="s">${esc(ch2.name)} · ${esc(ch2.role)}</div><div class="s">${esc(s.blurb)}</div>
          <div class="s" style="margin-top:8px;color:var(--ui-acc2)">${s.missions.map(m => { const st = F.stories.starsOf(s.id, m.id); return `<span title="${esc(m.name)}">${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '☆☆☆'}</span>`; }).join(' &nbsp; ')}</div>
          ${!av ? `<div class="s">Opens in chapter ${s.chapter + 1}</div>` : ''}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'stunts') {
      body = Object.entries(STUNT_TYPES).map(([k, T]) => {
        const list = F.stunts.list.filter(x => x.type === k && !x.broken);
        const got = list.reduce((a, x) => a + (S.stunts[x.id]?.stars || 0), 0);
        return `<div class="ui-h3" style="margin:14px 0 8px;color:${T.color}">${icon(T.icon, T.color, null, 18)} ${esc(T.name)}s · ${got} / ${list.length * 3} ★</div><div class="hf-grid">${list.map(x => {
          const r = S.stunts[x.id];
          return `<div class="hf-tile" data-nav data-st="${x.id}" style="--c:${T.color}"><div class="r" style="color:var(--ui-acc2)">${starStr(r?.stars || 0)}</div><div class="t">${esc(x.name.replace(' ' + T.name, ''))}</div><div class="s">${r?.best != null ? 'Best ' + F.stunts.fmtBest(x, r.best) + ' · ' : ''}★ ${esc(F.stunts.thresholdText(x))}</div></div>`;
        }).join('')}</div>`;
      }).join('');
    } else if (tab === 'world') {
      const bXP = BOARDS.filter(b => b.kind === 'xp'), bFT = BOARDS.filter(b => b.kind === 'ft');
      body = `<div class="hf-stats">
          <div class="hf-stat"><span>XP boards</span><b>${bXP.filter(b => S.boards[b.id]).length} / ${bXP.length}</b></div>
          <div class="hf-stat"><span>Fast travel boards</span><b>${bFT.filter(b => S.boards[b.id]).length} / ${bFT.length}</b></div>
          <div class="hf-stat"><span>Roads discovered</span><b>${F.coll.roadsPct().toFixed(1)}%</b></div>
          <div class="hf-stat"><span>Districts</span><b>${S.districts.length} / ${F.coll.districtCount}</b></div>
          <div class="hf-stat"><span>Barn finds</span><b>${Object.values(S.barns).filter(b => b.s !== 'rumour').length} / ${F.coll.barns.length}</b></div>
          <div class="hf-stat"><span>Houses</span><b>${S.houses.length} / ${F.coll.houses.length}</b></div></div>
        <div class="ui-h3" style="margin:16px 0 8px">Houses</div><div class="hf-grid">${F.coll.houses.map(H => `<div class="hf-tile ${F.coll.owns(H.id) ? 'done' : ''}" data-nav data-house="${H.id}" style="--c:${F.coll.owns(H.id) ? '#39e07a' : '#a7b0ba'}"><div class="r">${F.coll.owns(H.id) ? 'Owned' : fmtMoney(H.price)}</div><div class="t">${esc(H.name)}</div><div class="s">${esc(H.place)} · ${esc(H.perkText)}</div></div>`).join('')}</div>
        <div class="ui-h3" style="margin:16px 0 8px">Barn finds</div><div class="hf-grid">${F.coll.barns.map(B => { const st = S.barns[B.id]; return `<div class="hf-tile ${st ? '' : 'locked'}" data-nav data-barn="${B.id}" style="--c:#c8a26a"><div class="r">${!st ? 'Ch. ' + (B.chapter + 1) : st.s === 'rumour' ? 'Rumour' : st.s === 'restoring' ? 'Restoring' : 'Found'}</div><div class="t">${st && st.s !== 'rumour' ? esc(B.name) : '???'}</div><div class="s">${st ? esc(st.s === 'done' ? F.cars.name(st.car) : st.s === 'restoring' ? `${F.cars.name(st.car)} · ready in ${Math.max(0, Math.ceil((st.ready - (S.playTime || 0)) / 60))} min` : 'Search the marked area') : 'Keep progressing to hear rumours'}</div></div>`; }).join('')}</div>
        <div class="ui-h3" style="margin:16px 0 8px">Cosmetics</div><p class="hf-note">${S.cosmetics.length ? S.cosmetics.map(c => esc(COSMETICS[c]?.name || c)).join(' · ') : 'Win them from Prize Spins.'}</p>`;
    } else if (tab === 'accolades') {
      const cats = [...new Set(ACCOLADES.map(a => a.cat))];
      body = cats.map(cat => `<div class="ui-h3" style="margin:14px 0 8px">${esc(cat)}</div><div class="hf-grid">${ACCOLADES.filter(a => a.cat === cat).map(a => {
        const done = !!S.accolades[a.id], v = Math.min(a.target, F.stat(a.stat));
        return `<div class="hf-tile ${done ? 'done' : ''}" data-nav style="--c:${done ? '#39e07a' : 'var(--ui-acc)'}"><div class="r">${done ? '✓' : `${fmtNum(v)} / ${fmtNum(a.target)}`}</div><div class="t">${esc(a.name)}</div><div class="s">${esc(a.desc)} · ${a.fp} FP${a.spin ? ` · ${a.spin} spin${a.spin > 1 ? 's' : ''}` : ''}</div>${done ? '' : `<div class="hf-bar"><i style="width:${Math.round(100 * v / a.target)}%"></i></div>`}</div>`;
      }).join('')}</div>`).join('');
    } else if (tab === 'rivals') {
      body = `<div class="hf-grid">${RIVALS.map(r => { const rr = F.rivals.record(r.id); return `<div class="hf-tile" data-nav style="--c:${r.color};min-height:110px"><div class="r">${rr.beat}-${rr.lost}</div><div class="t">${esc(r.nick)}</div><div class="s">${esc(r.name)} · ${esc(r.home)}</div><div class="s" style="font-style:italic">"${esc(r.line)}"</div></div>`; }).join('')}</div>`;
    } else if (tab === 'options') {
      body = `<div class="hf-list" style="max-width:620px">
        <div class="hf-diff" data-nav data-opt="line" style="justify-content:space-between"><span class="nm" style="text-align:left">Driving line</span><span class="v">${{ full: 'Full', braking: 'Braking only', off: 'Off' }[S.drivingLine || 'full']}</span></div>
        <div class="hf-diff" data-nav data-opt="diff" style="justify-content:space-between"><span class="nm" style="text-align:left">Rival difficulty</span><span class="v">${DIFFICULTY[S.difficulty ?? 1].name}</span></div>
        <div class="hf-diff" data-nav data-opt="ft" style="justify-content:space-between"><span class="nm" style="text-align:left">Fast travel</span><span class="v">${F.coll.ftTargets().length} places</span></div>
        <div class="hf-diff" data-nav data-opt="prologue" style="justify-content:space-between"><span class="nm" style="text-align:left">Replay the prologue</span><span class="v"></span></div></div>`;
    }
    return `<div class="hf-tabs">${tabs.map(([id, t]) => `<button class="ui-btn ${id === tab ? 'on' : ''}" data-nav data-tab="${id}">${t}</button>`).join('')}</div><div class="hf-scroll">${body}</div>`;
  }
  function wireCampaign(el, state, rerender, close) {
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; rerender(); });
    el.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { const e = F.events.byId[b.dataset.ev]; if (!F.events.available(e)) { G.audio?.ui('error'); return; } F.gpsTo(e.start, e.disc.color, e.name); close?.(); });
    el.querySelectorAll('[data-story]').forEach(b => b.onclick = () => { const s = STORIES.find(x => x.id === b.dataset.story); if (!F.stories.available(s) || !s._p) { G.audio?.ui('error'); return; } F.gpsTo(s._p, s.color, s.name); close?.(); });
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { const x = F.stunts.byId[b.dataset.st]; F.gpsTo(x, x.info.color, x.name); close?.(); });
    el.querySelectorAll('[data-house]').forEach(b => b.onclick = () => { const H = F.coll.houses.find(x => x.id === b.dataset.house); F.gpsTo({ x: H.sx, z: H.sz }, '#39e07a', H.name); close?.(); });
    el.querySelectorAll('[data-barn]').forEach(b => b.onclick = () => { const B = F.coll.barns.find(x => x.id === b.dataset.barn), st = F.S.barns[B.id]; if (!st) return; F.gpsTo({ x: st.s === 'rumour' ? B.cx : B.x, z: st.s === 'rumour' ? B.cz : B.z }, '#c8a26a', 'Barn find'); close?.(); });
    el.querySelectorAll('[data-act=spin]').forEach(b => b.onclick = () => { close?.(); F.useSpin(); });
    el.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
      const o = b.dataset.opt;
      if (o === 'line') { const L = ['full', 'braking', 'off']; F.S.drivingLine = L[(L.indexOf(F.S.drivingLine || 'full') + 1) % 3]; }
      if (o === 'diff') F.S.difficulty = ((F.S.difficulty ?? 1) + 1) % DIFFICULTY.length;
      if (o === 'ft') { close?.(); SC.fastTravel(); return; }
      if (o === 'prologue') { close?.(); F.prologue.start(); return; }
      F.save(); rerender();
    });
  }
  // full-screen campaign (fallback, and from the festival hub)
  SC.campaign = function (tab = 'overview') {
    const state = { tab };
    const root = h('<div></div>');
    const head = `<div class="hf-kicker">${esc(FESTIVAL.name)} · San Francisco</div><div class="hf-title" style="font-size:56px">Campaign</div>`;
    let s = null;
    const rerender = () => { root.innerHTML = head + campaignHTML(state.tab); wireCampaign(root, state, rerender, () => s?.close()); const t = root.querySelector(`[data-tab="${state.tab}"]`); if (s && t) s.nav.focus(t); };
    rerender();
    s = openScreen(G, root, { keys: { lb: () => { const i = TABS.findIndex(t => t[0] === state.tab); state.tab = TABS[(i + TABS.length - 1) % TABS.length][0]; rerender(); }, rb: () => { const i = TABS.findIndex(t => t[0] === state.tab); state.tab = TABS[(i + 1) % TABS.length][0]; rerender(); } } });
    return s;
  };
  // pause-menu tab for the UI shell (G.ui.menu.addTab)
  SC.campaignTab = {
    id: 'campaign', title: 'Campaign', order: 10, icon: 'trophy', visible: () => F.enabled(),
    build(el, nav) {
      el.classList.add('hf-root');
      const state = { tab: 'overview' };
      const rerender = () => {
        el.innerHTML = `<div class="hf-kicker">${esc(FESTIVAL.name)} · San Francisco</div>` + campaignHTML(state.tab);
        wireCampaign(el, state, rerender, () => nav?.close?.());
        nav?.refresh?.();
        const t = el.querySelector(`[data-tab="${state.tab}"]`); if (t) nav?.focus?.(t);
      };
      rerender();
      return { onShow: rerender, hints: [['Enter', 'Select'], ['Esc', 'Back']] };
    },
  };
  // 'collection' pause-menu tab: records (event bests, stunt stars) and collectibles
  const CTABS = [['events', 'Event records'], ['stunts', 'Stunt records'], ['world', 'Collectibles'], ['accolades', 'Accolades']];
  SC.collectionTab = {
    id: 'collection', title: 'Collection', order: 40, icon: 'grid', visible: () => F.enabled(),
    build(el, nav) {
      el.classList.add('hf-root');
      const state = { tab: 'events' };
      const rerender = () => {
        el.innerHTML = `<div class="hf-kicker">Records · ${esc(FESTIVAL.name)}</div>` + campaignHTML(state.tab, CTABS);
        wireCampaign(el, state, rerender, () => nav?.close?.());
        nav?.refresh?.();
        const t = el.querySelector(`[data-tab="${state.tab}"]`); if (t) nav?.focus?.(t);
      };
      rerender();
      return { onShow: rerender, hints: [['Enter', 'Select'], ['Esc', 'Back']] };
    },
  };
  void DISCIPLINES;
  return SC;
}
