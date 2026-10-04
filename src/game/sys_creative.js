// Free Roam "Creative" tab in the pause menu: time of day, weather, reflections / lighting / graphics switches, map layers,
// quick teleports. Visible only in Free Roam (G.flags.creative). Settings persist in economy.settings.creative.
export function install(G) {
  const ui = G.ui; if (!ui?.menu?.addTab) return;
  const S = () => (G.economy.settings.creative ||= {});
  const post = G.post, env = G.env, renderer = window.__renderer;
  const W = () => G.weather;
  const gt = () => G.world?.gtiles;

  const TIMES = [['Dawn', 6.4], ['Morning', 9], ['Noon', 12.5], ['Afternoon', 15.5], ['Golden hour', 18.2], ['Sunset', 19.2], ['Dusk', 20], ['Night', 22.5], ['Midnight', 0.5]];
  const WEATHER = [['Clear', 'clear'], ['Karl the Fog', 'fog'], ['Overcast', 'overcast'], ['Rain', 'rain'], ['Storm', 'storm']];
  const PLACES = [['Hyde & Lombard', 'Hyde Street', 'Lombard Street'], ['Union Square', 'Powell Street', 'Geary Street'], ['Market & 4th', 'Market Street', '4th Street'],
    ['Chinatown', 'Grant Avenue', 'Washington Street'], ['Mission 24th', 'Mission Street', '24th Street'], ['Haight-Ashbury', 'Haight Street', 'Ashbury Street'],
    ['Embarcadero', 'The Embarcadero', 'Broadway'], ['Painted Ladies', 'Steiner Street', 'Hayes Street'], ['Twin Peaks', 'Twin Peaks Boulevard', 'Christmas Tree Point Road']];

  // switch definitions: [label, get(), set(on)]
  const SW = () => [
    ['Wet-road reflections', () => post?.wetEnabled !== false, v => { if (post) post.wetEnabled = v; }],
    ['Car + glass reflections', () => !!post?.glossSSR, v => { if (post) post.glossSSR = v; }],
    ['Water reflections', () => !G.world?.water?.mesh || G.world.water.reflectOff !== true, v => { if (G.world?.water) G.world.water.reflectOff = !v; }],
    ['Ambient occlusion', () => post?.ao ? post.ao.enabled !== false : false, v => { if (post?.ao) post.ao.enabled = v; }],
    ['Bloom', () => post?.bloom ? post.bloom.enabled !== false : false, v => { if (post?.bloom) post.bloom.enabled = v; }],
    ['Shadows', () => !!renderer?.shadowMap.enabled, v => { if (renderer) { renderer.shadowMap.enabled = v; G.scene?.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } }],
    ['Freeze time', () => !!env?.state.paused, v => { if (env) env.state.paused = v; }],
    ['Lock weather', () => !!W()?.locked, v => { if (W()) W().locked = v; }],
    ['Traffic', () => (G.traffic?.density ?? 1) > 0, v => { if (G.traffic) G.traffic.density = v ? 1 : 0; }],
    ['HUD', () => !G.ui?.hudHidden, v => { G.ui.hudHidden = !v; document.getElementById('hud')?.classList.toggle('hidden', !v); }],
    ...(gt() ? [['Google 3D city (far)', () => gt().tiles.group.visible, v => { gt().tiles.group.visible = v; }]] : []),
  ];
  const RES = [['Performance', 0.75], ['Balanced', 1], ['Sharp', 1.5], ['Ultra', 2]];

  function build(el, nav) {
    const st = env?.state || { hours: 12 };
    const h = Math.floor(st.hours), m = Math.floor((st.hours - h) * 60);
    const wk = W()?.kind || 'clear';
    const pr = renderer?.getPixelRatio?.() || 1;
    el.innerHTML = `<div class="mw-k">Free Roam</div><h2 class="mw-h">Creative</h2>
      <p class="mw-p">Time ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${wk}. Unlimited money, every car, and fast travel anywhere on the map (M, then click).</p>
      <div class="mw-k" style="margin-top:18px">Time of day</div>
      <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
        <button class="mw-tile" data-nav data-dt="-1"><span class="t">−1 hour</span></button><button class="mw-tile" data-nav data-dt="1"><span class="t">+1 hour</span></button>
        ${TIMES.map(([n, t]) => `<button class="mw-tile" data-nav data-time="${t}"><span class="t">${n}</span></button>`).join('')}</div>
      <div class="mw-k" style="margin-top:18px">Weather</div>
      <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        ${WEATHER.map(([n, k]) => `<button class="mw-tile ${k === wk ? 'on' : ''}" data-nav data-wx="${k}"><span class="t">${n}</span>${k === wk ? '<span class="s">Active</span>' : ''}</button>`).join('')}</div>
      <div class="mw-k" style="margin-top:18px">Graphics</div>
      <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">
        ${SW().map(([n, get], i) => `<button class="mw-tile" data-nav data-sw="${i}"><span class="t">${n}</span><span class="s" style="color:${get() ? 'var(--good,#39e07a)' : 'var(--dim)'}">${get() ? 'ON' : 'OFF'}</span></button>`).join('')}
        ${RES.map(([n, r]) => `<button class="mw-tile" data-nav data-res="${r}"><span class="t">${n}</span><span class="s">${Math.abs(pr - r) < 0.01 ? 'Current' : 'Render scale ' + r + 'x'}</span></button>`).join('')}</div>
      <div class="mw-k" style="margin-top:18px">Teleport</div>
      <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
        ${PLACES.map(([n], i) => `<button class="mw-tile" data-nav data-go="${i}"><span class="t">${n}</span></button>`).join('')}</div>
      ${G.tour ? `<div class="mw-k" style="margin-top:18px">Cinematic tour</div>
      <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
        ${[['play', 'Play tour'], ['short', 'Short cut'], ['rec1080', 'Record 1080p'], ['rec1440', 'Record 1440p']].map(([k, n]) => `<button class="mw-tile" data-nav data-tour="${k}"><span class="t">${n}</span></button>`).join('')}</div>` : ''}`;
    el.querySelectorAll('[data-tour]').forEach(b => b.addEventListener('click', () => { nav?.close?.(); G.tour?.menuStart?.(b.dataset.tour); }));
    const redraw = () => { build(el, nav); nav?.refresh?.(); };
    el.querySelectorAll('[data-dt]').forEach(b => b.addEventListener('click', () => { st.hours = (st.hours + Number(b.dataset.dt) + 24) % 24; ui._sound?.('select'); redraw(); }));
    el.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { st.hours = Number(b.dataset.time); ui._sound?.('select'); redraw(); }));
    el.querySelectorAll('[data-wx]').forEach(b => b.addEventListener('click', () => { W()?.set?.(b.dataset.wx, { transition: 2 }); if (W()) W().locked = true; S().weather = b.dataset.wx; ui._sound?.('select'); setTimeout(redraw, 50); }));
    el.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => { const [n, get, set] = SW()[+b.dataset.sw]; const v = !get(); set(v); S()[n] = v; G.economy.save(); ui._sound?.('toggle'); redraw(); }));
    el.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => {
      const r = Number(b.dataset.res); renderer.setPixelRatio(r); post?.composer?.setPixelRatio?.(r); renderer.setSize(innerWidth, innerHeight); post?.setSize?.(innerWidth, innerHeight);
      S().res = r; G.economy.save(); ui._sound?.('select'); redraw();
    }));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const [n, a, c] = PLACES[+b.dataset.go]; const node = G.world?.graph?.intersection?.(a, c);
      if (!node) { ui.notify?.({ title: n + ' not on this map', kind: 'bad', ms: 1800 }); return; }
      nav?.close?.(); ui.menu.close?.(); ui.travel ? ui.travel(node.x, node.z, { label: n }) : window.__teleport?.(node.x, node.z);
    }));
  }
  ui.menu.addTab({ id: 'creative', title: 'Creative', order: 5, icon: 'star', visible: () => !!G.flags?.creative, build });

  // re-apply saved switches when entering Free Roam
  const apply = () => {
    if (!G.flags?.creative) return;
    const s = S(); for (const [n, , set] of SW()) if (typeof s[n] === 'boolean') { try { set(s[n]); } catch { /* ignore */ } }
    if (s.weather && W()?.set) { W().set(s.weather, { transition: 0 }); W().locked = true; }
  };
  G.on?.('mode', apply); setTimeout(apply, 500);
}
