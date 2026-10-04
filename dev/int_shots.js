// dev: hero interior screenshots. Paste into the console of a running game tab (Free Roam), then
//   await __intShots(['stFrancis', 'davies'], { night: false, suffix: '_v2' })   -> shots/int_<id>_v2.jpg
// Each interior: walk to its door (loads it), enter, free camera at eye height a few metres inside the entrance looking at the
// room centre (or meta.shot = [x, y, z, tx, ty, tz] when the builder gave one). Hidden tabs do not run the loop: frames are stepped.
// background form (tool calls time out): __intRun(ids, opts) then poll window.__intRes
window.__intRun = (ids, o) => { window.__intRes = 'running'; window.__intShots(ids, o).then(r => (window.__intRes = r), e => (window.__intRes = 'ERR ' + e)); return 'started'; };
window.__intShots = async (ids, { night = false, suffix = '_v2', w = 1280, h = 720 } = {}) => {
  const G = window.__G, H = G.heroInteriors, out = [];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  if (G.env?.state) G.env.state.hours = night ? 22.5 : 13.0;
  for (const id of ids) {
    const it = H.list.find(i => i.id === id); if (!it) { out.push([id, 'missing']); continue; }
    const d = it.I.doors[0];
    window.__teleport(d.out[0], d.out[2], { foot: true });
    for (let k = 0; k < 120 && it.state !== 2; k++) { window.__frames(1); await wait(100); }
    H.enter(id);
    for (let k = 0; k < 80 && !(it.texOK && it.env); k++) { window.__frames(1); await wait(80); }   // textures + probe ready
    const r = it.I.rooms[it.I.probe?.room ?? 0];
    const s = it.I.shot;
    if (s) window.__look(...s);
    else {
      const [ix, iy, iz] = d.in, dx = r.x - ix, dz = r.z - iz, L = Math.hypot(dx, dz) || 1;
      const ex = ix - dx / L * 1.5, ez = iz - dz / L * 1.5;
      window.__look(ex, iy + 1.65, ez, r.x, iy + 1.9, r.z);
    }
    const hr = G.player.human?.root; if (hr) hr.visible = false;
    for (let k = 0; k < 6; k++) { window.__frames(2); await wait(40); }
    await window.__shot('int_' + id + suffix, w, h);
    if (hr) hr.visible = true;
    window.__look(null);
    out.push([id, it.state]);
  }
  return out;
};
