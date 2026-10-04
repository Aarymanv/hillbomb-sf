// Cinematic tour: a curated camera tour of the real San Francisco map (golden-hour Golden Gate, Lombard, Chinatown in
// the rain, the Bay Bridge at night...), with titles, letterbox and an optional .webm recording of the canvas + audio.
// G.tour = { start({ record: '1080'|'1440'|'current'|false, short, shots: [ids], letterbox, titles }), stop(), active }
// Entry points: pause menu "Cinematic" tab, Free Roam Creative tab, URL ?tour (auto-play), ?tour&record[=1440], &short.
// Any key stops the tour (a recording is still saved).
import { createTour } from './tour/director.js';

export function install(G) {
  if (!G.world?.v2 || !G.world.graph?.intersection) return;   // the shot list is placed on the real 1:1 map
  const tour = G.tour = createTour(G);
  const ui = G.ui;
  const opt = { letterbox: true };
  G.tour.menuStart = (kind) => {
    const o = { letterbox: opt.letterbox };
    if (kind === 'short') o.short = true;
    if (kind === 'rec1080') o.record = '1080';
    if (kind === 'rec1440') o.record = '1440';
    ui?.menu?.close?.();
    setTimeout(() => tour.start(o), 350);
  };

  if (ui?.menu?.addTab) {
    ui.menu.addTab({
      id: 'tour', title: 'Cinematic', order: 6, icon: 'camera',
      build(el, nav) {
        const draw = () => {
          el.innerHTML = `<div class="mw-k">Showcase</div><h2 class="mw-h">Cinematic tour</h2>
            <p class="mw-p">${tour.SHOTS.length} shots across the real city, each with its own time of day and weather: the Golden Gate at golden hour,
            Lombard, Chinatown in the rain, the Bay Bridge at night, Twin Peaks at sunset. About ${Math.round(tour.SHOTS.reduce((a, s) => a + s.dur + 1.5, 0) / 60)} minutes. Press any key to stop.</p>
            <div class="mw-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-top:18px">
              <button class="mw-tile" data-nav data-nav-default data-tour="play"><span class="t">Play tour</span><span class="s">Full cut</span></button>
              <button class="mw-tile" data-nav data-tour="short"><span class="t">Short cut</span><span class="s">Four shots, about 20 s</span></button>
              <button class="mw-tile" data-nav data-tour="rec1080"><span class="t">Record video 1080p</span><span class="s">.webm download, 40 Mbps</span></button>
              <button class="mw-tile" data-nav data-tour="rec1440"><span class="t">Record video 1440p</span><span class="s">.webm download, 40 Mbps</span></button>
              <button class="mw-tile" data-nav data-lb><span class="t">Letterbox</span><span class="s">${opt.letterbox ? 'ON' : 'OFF'}</span></button>
            </div>`;
          el.querySelectorAll('[data-tour]').forEach(b => b.addEventListener('click', () => { nav?.close?.(); G.tour.menuStart(b.dataset.tour); }));
          el.querySelector('[data-lb]').addEventListener('click', () => { opt.letterbox = !opt.letterbox; draw(); nav?.refresh?.(); });
        };
        draw();
      },
    });
  }

  // URL: ?tour (auto-play) · ?tour&record (1080p) · ?tour&record=1440 · &short · &shots=id,id · &nobars
  const q = new URLSearchParams(location.search);
  if (!q.has('tour')) return;
  const o = { short: q.has('short'), letterbox: !q.has('nobars') };
  if (q.has('record')) o.record = q.get('record') || '1080';
  if (q.get('shots')) o.shots = q.get('shots').split(',');
  const t0 = performance.now();
  const wait = setInterval(() => {
    if (performance.now() - t0 > 120000) { clearInterval(wait); return; }
    if (!window.__shot || document.getElementById('boot')) return;
    if (G.state === 'title') { document.querySelector('#title .modebtn.sel, #title .modebtn')?.click(); return; }
    if (G.state !== 'play') return;
    clearInterval(wait);
    setTimeout(() => tour.start(o), 1200);
  }, 250);
}
