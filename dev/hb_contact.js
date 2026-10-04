// Dev: wheel-contact audit on real SF routes (load in the game page: await import('http://127.0.0.1:5190/dev/hb_contact.js?'+Date.now())).
//   await __hbContact()   -> drives the player's car (direct 120 Hz body steps, pure-pursuit, no rendering) over the routes below,
//   returns per-route { km, flick, flickPerKm, airEv, hops, byCause } where flick = a wheel losing contact for < 0.15 s while
//   >= 2 other wheels stay grounded (grip vanishing at seams / curbs / deck joins), hops = all-wheel air < 0.15 s.
const W = window, KX = 111320 * Math.cos(37.7749 * Math.PI / 180), KZ = 110574;
const llx = (lat, lon) => [(lon + 122.4194) * KX, -(lat - 37.7749) * KZ];
const ROUTES = {
  hyde: [[37.7907, -122.4170], [37.8018, -122.4196], [37.8060, -122.4206]],
  lombard_rh: [[37.8003, -122.4241], [37.8016, -122.4188], [37.7990, -122.4157], [37.7972, -122.4140]],
  powell_cable: [[37.7850, -122.4078], [37.7920, -122.4093], [37.7929, -122.4045]],
  market_muni: [[37.7752, -122.4194], [37.7900, -122.4010], [37.7946, -122.3948]],
  downtown_grid: [[37.7880, -122.4070], [37.7880, -122.4010], [37.7920, -122.4010], [37.7945, -122.4030]],
  broadway_tunnel: { edge: [5742, 5743] },
  bay_bridge: { edge: [10214, 12542] },
  golden_gate: { edge: [7894, 19541] },
};
function astar(g, a, b) {
  const N = g.nodes.length, gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), pe = new Array(N), closed = new Uint8Array(N), heap = [];
  const push = (id, f) => { heap.push([f, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < heap.length && heap[L][0] < heap[m][0]) m = L; if (R < heap.length && heap[R][0] < heap[m][0]) m = R; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t[1]; };
  gs[a.id] = 0; push(a.id, 0);
  while (heap.length) { const c = pop(); if (closed[c]) continue; closed[c] = 1; if (c === b.id) break;
    for (const e of g.nodes[c].edges) { if (/alley|plaza|park|path|foot|stairs/.test(e.kind || '')) continue; const nb = e.a.id === c ? e.b : e.a, ng = gs[c] + e.len;
      if (ng < gs[nb.id]) { gs[nb.id] = ng; prev[nb.id] = c; pe[nb.id] = e; push(nb.id, ng + Math.hypot(nb.x - b.x, nb.z - b.z)); } } }
  const out = []; let n = b.id; while (prev[n] >= 0) { const e = pe[n], fwd = e.a.id === prev[n]; const P = fwd ? e.pts : [...e.pts].reverse(); out.unshift(...P.slice(1)); n = prev[n]; }
  return out;
}
function route(lls) {
  const g = W.__world.graph;
  if (lls.edge) { const a = g.nodes.find(n => n.id === lls.edge[0]); const e = a.edges.find(e => (e.a.id === lls.edge[0] && e.b.id === lls.edge[1]) || (e.b.id === lls.edge[0] && e.a.id === lls.edge[1])); const P = e.a.id === lls.edge[0] ? e.pts : [...e.pts].reverse(); return dens(P.map(p => [p[0], p[1]])); }
  const near = (x, z) => { let best = null, bd = Infinity; for (const n of g.nodes) { if (!n.edges.some(e => !/alley|plaza|park|path|foot|stairs/.test(e.kind || ''))) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
  const pts = lls.map(p => llx(...p)), out = [];
  for (let i = 0; i + 1 < pts.length; i++) { const a = near(...pts[i]), b = near(...pts[i + 1]); if (!out.length) out.push([a.x, a.z]); out.push(...astar(g, a, b).map(p => [p[0], p[1]])); }
  return dens(out);
}
function dens(out) {
  const d = [out[0]]; for (let i = 1; i < out.length; i++) { const [ax, az] = out[i - 1], [bx, bz] = out[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2)); for (let k = 1; k <= n; k++) d.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  return d;
}
function driveRoute(pts, { vmax = 20, h = 1 / 120, tMax = 600 } = {}) {
  const G = W.__G, world = W.__world, v = G.player.vehicle, b = v.body; if (!v) throw new Error('no player car');
  const [x0, z0] = pts[0], [x1, z1] = pts[3] || pts[1];
  b.place(x0, world.groundAt(x0, z0, 999) + 0.3, z0, Math.atan2(-(x1 - x0), -(z1 - z0)));
  b.sleeping = false;
  const inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, autoReverse: true };
  let i = 0, t = 0, dist = 0, flick = 0, airEv = 0, hops = 0; const evs = [], byCause = {}, loss = [0, 0, 0, 0], cause = ['', '', '', ''];
  let airT = 0, prevPos = b.pos.clone(), stuck = 0;
  const _f = { x: 0, y: 1, z: 0 };
  while (i < pts.length - 4 && t < tMax) {
    // pure pursuit
    const p = b.pos; let best = i; for (let k = i; k < Math.min(pts.length, i + 30); k++) if ((pts[k][0] - p.x) ** 2 + (pts[k][1] - p.z) ** 2 < (pts[best][0] - p.x) ** 2 + (pts[best][1] - p.z) ** 2) best = k; i = best;
    const sp = Math.abs(b.fwdSpeed), look = Math.max(6, sp * 0.7), tk = Math.min(pts.length - 1, i + Math.ceil(look / 2));
    const fw = b.forward(new W.__camera.position.constructor()), rt = b.right(new W.__camera.position.constructor());
    const dx = pts[tk][0] - p.x, dz = pts[tk][1] - p.z, lx = dx * rt.x + dz * rt.z, lz = dx * fw.x + dz * fw.z, L2 = dx * dx + dz * dz;
    const curv = 2 * lx / Math.max(1, L2), wb = Math.abs(v.spec.axleFZ - v.spec.axleRZ);
    // speed from upcoming curvature
    let kmax = 0; for (let k = i + 2; k < Math.min(pts.length - 2, i + 25); k++) { const a = pts[k - 2], c = pts[k], e = pts[k + 2]; const ang = Math.abs(Math.atan2(e[1] - c[1], e[0] - c[0]) - Math.atan2(c[1] - a[1], c[0] - a[0])); kmax = Math.max(kmax, Math.min(ang, 2 * Math.PI - ang) / 4); }
    const vt = Math.min(vmax, Math.sqrt(6 / Math.max(1e-4, kmax)));
    const maxA = b.maxSteer / (1 + sp / (v.params.steerSpeed ?? 26));
    inp.steer = Math.max(-1, Math.min(1, Math.atan(curv * wb) / maxA)); if (lz < 0) inp.steer = Math.sign(lx) || 1;
    inp.throttle = Math.max(0, Math.min(1, (vt - sp) * 0.4)); inp.brake = Math.max(0, Math.min(1, (sp - vt - 1) * 0.3));
    const prevC = b.wheels.map(w => w.contact), prevDeck = b.wheels.map(w => w.deck), prevCurb = b.wheels.map(w => world.terrain.curbAt(w.cp.x, w.cp.z));
    b.step(h, world, inp); t += h;
    const g = b.grounded;
    for (let k = 0; k < 4; k++) {
      const w = b.wheels[k];
      if (prevC[k] && !w.contact && g >= 2) { loss[k] = 1e-9; const cc = world.terrain.curbAt(w.cp.x + b.vel.x * h * 2, w.cp.z + b.vel.z * h * 2); world.groundAt(w.cp.x, w.cp.z, w.cp.y + 1, _f); cause[k] = cc !== prevCurb[k] ? 'curb' : (_f.deck || prevDeck[k]) ? ((_f.deck !== prevDeck[k]) ? 'deckEdge' : 'deck') : 'terrain'; }
      if (loss[k] > 0) { if (w.contact) { if (loss[k] < 0.15) { flick++; byCause[cause[k]] = (byCause[cause[k]] || 0) + 1; if (evs.length < 40) evs.push({ x: Math.round(w.cp.x), z: Math.round(w.cp.z), k, c: cause[k], dur: Math.round(loss[k] * 1000), v: Math.round(sp), cmp: +w.compression.toFixed(2) }); } loss[k] = 0; } else loss[k] += h; }
    }
    if (g === 0) airT += h; else if (airT > 0) { if (airT < 0.15) hops++; else airEv++; airT = 0; }
    dist += Math.hypot(p.x - prevPos.x, p.z - prevPos.z); prevPos.copy(p);
    if (sp < 1) { stuck += h; if (stuck > 6) break; } else stuck = 0;
  }
  const km = dist / 1000;
  return { km: +km.toFixed(2), t: +t.toFixed(0), done: i >= pts.length - 5, flick, flickPerKm: +(flick / Math.max(0.01, km)).toFixed(1), hops, airEv, byCause, evs };
}
W.__hbRoutes = ROUTES;
W.__hbContact = async (names = Object.keys(ROUTES), opts = {}) => {
  const out = {}; let km = 0, fl = 0, hp = 0;
  for (const n of names) { const r = driveRoute(route(ROUTES[n]), opts); out[n] = r; km += r.km; fl += r.flick; hp += r.hops; }
  out.total = { km: +km.toFixed(2), flickPerKm: +(fl / km).toFixed(2), hopsPerKm: +(hp / km).toFixed(2) };
  return out;
};
// Russian Hill Bomb with the player on the race-AI autopilot; renderer stubbed (logic + physics only), 1/60 s frames.
W.__hbRace = async (id = 'russian-hill-bomb', { maxFrames = 12000, car = null } = {}) => {
  const G = W.__G, F = G.festival, R = W.__renderer, orig = R.render; R.render = () => {};
  let hits = 0; const prevEv = G.sim.onEvent;
  G.sim.onEvent = (v, e) => { if (e.type === 'impact' && e.strength > 0.45 && v.ai) hits++; prevEv?.(v, e); };
  try {
    F.endEvent?.(); G.state = 'play'; W.__frames(10);
    if (!F.startEvent(id, car ? { car } : {})) return 'no event';
    let f = 0, A = null, ap = false;
    for (; f < maxFrames; f++) {
      G.state = 'play'; W.__frames(1);
      A = F.racing?.active; if (!A) { if (f > 600) break; continue; }
      if (!ap && A.phase === 'race') { F.debug.autopilot(true, 0.9); ap = true; }
      if (A.phase === 'finished' && A.finT > 0.5) { W.__frames(240); break; }   // let AI finish / estimate
      if (f % 400 === 0) await new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    }
    const ents = (A?.ents || []).map(e => ({ n: e.player ? 'YOU' : e.name, done: e.done, t: e.done ? +e.time.toFixed(2) : null, est: e.estTime ? +e.estTime.toFixed(1) : null }));
    return { frames: f, phase: A?.phase, how: A?.how, aiHits: hits, ents };
  } finally { R.render = orig; G.sim.onEvent = prevEv; W.__autopilot = null; }
};
// Real-time input audit (tab must be in front, __manual off): scripted synthetic key events for `sec` seconds.
//   taps 8-90 ms, holds 150-900 ms, 'burst' taps (keydown+keyup in one task = a tap swallowed by a frame hitch), periodic
//   60-140 ms main-thread hitches. A press is dropped if no 120 Hz physics step saw it. lat = keydown -> first step that sees it.
W.__hbInputTest = async (sec = 180, seed = 7) => {
  const G = W.__G, v = G.player.vehicle, b = v.body; let rnd = seed; const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const steps = []; const orig = b.step; b.step = function (dt, world, input) { steps.push([performance.now(), input.steer, input.throttle, input.brake]); return orig.call(this, dt, world, input); };
  const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  // hidden tab: no rAF and throttled timers -> MessageChannel waits + our own real-time frame pump (render stubbed)
  const yieldT = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const sleep = async ms => { const e = performance.now() + ms; while (performance.now() < e) await yieldT(); };
  const pump = document.hidden; let pumping = pump, frames = 0; const Rr = W.__renderer, rOrig = Rr.render;
  if (pump) { W.__manual = true; Rr.render = () => {}; G.state = 'play'; (async () => { let last = performance.now(); while (pumping) { await yieldT(); const now = performance.now(); if (now - last < 16.6) continue; W.__frame(Math.min((now - last) / 1000, 1 / 20)); last = now; frames++; } })(); }
  const press = []; const t0 = performance.now(); let hitches = 0;
  const hitchLoop = (async () => { while (performance.now() - t0 < sec * 1000) { await sleep(900 + R() * 1600); const e = performance.now() + 60 + R() * 80; while (performance.now() < e) { /* hitch */ } hitches++; } })();
  key('keydown', 'KeyW');
  while (performance.now() - t0 < sec * 1000) {
    const r = R(), code = R() < 0.5 ? 'KeyA' : 'KeyD', axis = code === 'KeyA' ? -1 : 1;
    if (r < 0.15) { const td = performance.now(); key('keydown', code); key('keyup', code); press.push({ td, tu: td, axis, kind: 'burst' }); }
    else if (r < 0.65) { const td = performance.now(); key('keydown', code); await sleep(8 + R() * 82); key('keyup', code); press.push({ td, tu: performance.now(), axis, kind: 'tap' }); }
    else { const td = performance.now(); key('keydown', code); await sleep(150 + R() * 750); key('keyup', code); press.push({ td, tu: performance.now(), axis, kind: 'hold' }); }
    if (R() < 0.08) { const td = performance.now(); key('keydown', 'KeyS'); await sleep(10 + R() * 50); key('keyup', 'KeyS'); press.push({ td, tu: performance.now(), axis: 0, kind: 'brakeTap' }); }
    await sleep(120 + R() * 380);
  }
  key('keyup', 'KeyW'); await hitchLoop; await sleep(200);
  b.step = orig; pumping = false; Rr.render = rOrig;
  const lat = [], drop = { tap: 0, burst: 0, hold: 0, brakeTap: 0 }, n = { tap: 0, burst: 0, hold: 0, brakeTap: 0 };
  let si = 0;
  for (const p of press) {
    n[p.kind]++;
    while (si < steps.length && steps[si][0] < p.td) si++;
    let seen = null;
    for (let k = si; k < steps.length && steps[k][0] < p.tu + 250; k++) { const s = steps[k]; const ok = p.axis === 0 ? s[3] > 0.01 : Math.sign(s[1]) === p.axis && Math.abs(s[1]) > 0.01; if (ok) { seen = s[0]; break; } }
    if (seen === null) drop[p.kind]++; else lat.push(seen - p.td);
  }
  lat.sort((a, b) => a - b);
  const stuck = Math.abs(v.input.steer) > 0.01 || v.input.brake > 0.01;
  return { presses: press.length, n, drop, dropped: Object.values(drop).reduce((a, b) => a + b, 0), hitches, frames, steps: steps.length, latP50: +lat[lat.length >> 1].toFixed(1), latP95: +lat[Math.floor(lat.length * 0.95)].toFixed(1), stuck };
};
W.__hbRaces = (n = 3) => { W.__hbRacesOut = []; (async () => { for (let i = 0; i < n; i++) { const r = await W.__hbRace(); W.__hbRacesOut.push(r.aiHits + ' | ' + r.ents.map(e => e.n.split(' ')[0] + ':' + (e.t ?? ('~' + e.est))).join(' ')); } W.__hbRacesOut.push('done'); })(); };
