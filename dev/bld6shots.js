// dev-only capture helper for the buildings v6 pass (variety + aerial roofs). Game page (5191 tab, ?mute):
//   for (const f of ['bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f);
//   await __bld6('before')            -> shots/bld6_<view>_before.jpg (VIEWS below)
//   await __bld6('after', ['drone_mission'])
//   __bld6Stats()                     -> per-zone share of v5/v6 features over the whole plan
(() => {
  const W = window;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // aerial: focus (player) on the ground at f, camera at c (x, height above ground, z), looking at t (x, y abs or ground+, z)
  // street: a / b intersections as bld5shots
  const VIEWS = W.__bld6Views = {
    twinpeaks: { focus: [-2330, 2200], cam: [-2462, 300, 2318], look: [-1900, 90, 1960], hr: 15.5 },
    drone_mission: { at: ['24th Street', 'Harrison Street'], dist: 150, h: 120, yaw: 0.9, hr: 15.5 },
    drone_pacheights: { at: ['Jackson Street', 'Steiner Street'], dist: 90, h: 70, yaw: 2.4, hr: 15.5 },
    drone_sunset: { at: ['Judah Street', '30th Avenue'], dist: 260, h: 230, yaw: -0.6, hr: 15.5 },
    drone_low: { mid: [['23rd Street', 'Alabama Street'], ['24th Street', 'Florida Street']], dist: 40, h: 42, yaw: 2.6, hr: 15.5 },
    drone_low2: { mid: [['Fulton Street', '22nd Avenue'], ['Cabrillo Street', '23rd Avenue']], dist: 40, h: 42, yaw: 0.5, hr: 15.5 },
    drone_top: { mid: [['Fulton Street', '22nd Avenue'], ['Cabrillo Street', '23rd Avenue']], dist: 2, h: 90, yaw: 0, hr: 13 },
    drone_coit: { focus: [1080, -2960], cam: [1178, 148, -3032], look: [640, 20, -2700], hr: 15.5 },
    street_haight: { a: ['Haight Street', 'Masonic Avenue'], b: ['Haight Street', 'Ashbury Street'], t: 0.25, side: -1.2, turn: -0.45, h: 2.2, hr: 15.5 },
    street_sunset: { a: ['Judah Street', '30th Avenue'], b: ['Irving Street', '30th Avenue'], t: 0.3, side: -1.2, turn: -0.55, h: 2.2, hr: 15.5 },
    street_richmond: { a: ['Cabrillo Street', '22nd Avenue'], b: ['Cabrillo Street', '23rd Avenue'], t: 0.2, side: 1.4, turn: 0.4, h: 2.2, hr: 15.5 },
  };
  const prep = (hr) => {
    if (W.__G.state === 'title') document.querySelector('.modebtn')?.click();
    W.__regNoPolice?.();
    W.__manual = true; if (W.__setWx) W.__setWx('clear'); else { W.__G.weather.set('clear', { transition: 0 }); W.__G.weather.auto = false; }
    W.__env.state.hours = hr; W.__env.state.paused = true;
  };
  const gy = (x, z) => W.__world.groundAt(x, z, 999);
  function place(v) {
    let fx, fz, c;
    if (v.at || v.mid) {
      const g = W.__G.world.graph;
      if (v.mid) { const A = g.intersection(...v.mid[0]), B = g.intersection(...v.mid[1]); if (!A || !B) throw new Error('no intersection ' + v.mid); fx = (A.x + B.x) / 2; fz = (A.z + B.z) / 2; }
      else { const A = g.intersection(...v.at); if (!A) throw new Error('no intersection ' + v.at); fx = A.x; fz = A.z; }
      const cx = fx - Math.sin(v.yaw) * v.dist, cz = fz - Math.cos(v.yaw) * v.dist;
      c = [cx, gy(fx, fz) + v.h, cz, fx, gy(fx, fz), fz];
    } else if (v.focus) {
      [fx, fz] = v.focus; c = [v.cam[0], v.cam[1], v.cam[2], v.look[0], v.look[1], v.look[2]];
    } else {
      const g = W.__G.world.graph, A = g.intersection(...v.a), B = g.intersection(...v.b);
      if (!A || !B) throw new Error('no intersection ' + JSON.stringify(v));
      let dx = B.x - A.x, dz = B.z - A.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
      const px = A.x + dx * L * v.t - dz * v.side, pz = A.z + dz * L * v.t + dx * v.side;
      const cs = Math.cos(v.turn), sn = Math.sin(v.turn), lx = cs * dx + sn * dz, lz = -sn * dx + cs * dz, k = 30, py = gy(px, pz) + v.h;
      c = [px, py, pz, px + lx * k, py + 0.6, pz + lz * k];
      fx = px - dx * 20; fz = pz - dz * 20;
    }
    W.__teleport(fx, fz); W.__hbSafe?.(fx, fz); W.__look(...c);
    return c;
  }
  W.__bld6Place = (name) => place(VIEWS[name]);
  W.__bld6 = async (suffix, names = Object.keys(VIEWS).filter(n => !/^drone_(coit|low)/.test(n)), w = 1280, h = 720) => {
    const out = [];
    for (const nm of names) {
      const v = VIEWS[nm];
      prep(v.hr); place(v); await W.__bld5Settle(); prep(v.hr); place(v); await W.__bld5Settle(20);
      const vr = W.__player?.vehicle?.root; if (vr && !v.a) vr.visible = false;
      prep(v.hr); W.__frames(30);
      const file = `bld6_${nm}_${suffix}`; await W.__shot(file, w, h); out.push(file);
      if (vr) vr.visible = true;
    }
    return out;
  };
  // whole-plan feature census per zone (what share of buildings carries each feature)
  W.__bld6Stats = async () => {
    const P = W.__world.buildings.plan;
    const m5 = await import('http://127.0.0.1:5190/src/world/facade/v5mass.js'), dt = await import('http://127.0.0.1:5190/src/world/facade/v2detail.js'), pl = await import('http://127.0.0.1:5190/src/world/facade/v2plan.js'), pn = await import('http://127.0.0.1:5190/src/world/facade/plan.js');
    const S = pn.S, SN = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k])), ZN = pl.ZONE_NAMES;
    const out = {};
    for (let i = 0; i < P.N; i++) {
      if (i < P.N0 && P.lotN[i]) continue;
      const z = ZN[P.zone[i]], st = SN[P.style[i]];
      const o = out[z] || (out[z] = { n: 0, styles: {}, bay: 0, pitched: 0, mansard: 0, ff: 0, crest: 0, gable: 0, balc: 0, roofdeck: 0, solar: 0 });
      o.n++; o.styles[st] = (o.styles[st] || 0) + 1;
      if (P.flags[i] & 1) o.bay++;
      if (P.pitched[i] > 0 && P.pitched[i] < 8) o.pitched++;
      if (m5.mansardOf(P, i)) o.mansard++;
      if (P.flags[i] & 64) o.ff++;
      if (m5.crestOf(P, i)) o.crest++;
    }
    for (const o of Object.values(out)) { for (const k of ['bay', 'pitched', 'mansard', 'ff', 'crest']) o[k] = +(o[k] / o.n).toFixed(3); for (const s in o.styles) o.styles[s] = +(o.styles[s] / o.n).toFixed(3); }
    return out;
  };
})();
