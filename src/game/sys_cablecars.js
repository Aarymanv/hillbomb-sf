// San Francisco cable cars: kinematic cars running the real lines (Powell, Hyde, California) at ~9.5 mph,
// stopping at corners, ringing the bell, climbing the hills. They shove cars aside (infinite mass).
// v1 (hand-built grid): straight axis-aligned lines. v2 (1:1 OSM map): the real Powell-Hyde, Powell-Mason and California
// lines, routed over the street edges that carry cable rails (data.extras.rails kind 'cable'), one-way rules respected
// (so the Jackson / Washington couplet splits outbound and inbound like the real thing).
import * as THREE from 'three';
import { Vehicle } from '../vehicle/cars.js';
import { ll } from '../world/latlon.js';
import { findRoute } from '../world/roads.js';

const LINES_V1 = [
  { name: 'Powell–Mason', axis: 'x', c: 1350, from: 110, to: -1095 },
  { name: 'Powell–Hyde', axis: 'x', c: 1050, from: -465, to: -1175 },
  { name: 'California St', axis: 'z', c: -300, from: 1760, to: 760 },
];
// termini [lat, lon, street] (real turntables / terminals)
const LINES_V2 = [
  { name: 'Powell\u2013Hyde', a: [37.7849, -122.4076], b: [37.8063, -122.4205], streets: ['powell', 'jackson', 'washington', 'hyde'] },
  { name: 'Powell\u2013Mason', a: [37.7849, -122.4076], b: [37.8047, -122.4152], streets: ['powell', 'jackson', 'washington', 'mason', 'columbus', 'taylor'] },
  { name: 'California St', a: [37.7934, -122.3962], b: [37.7909, -122.4217], streets: ['california'] },
];
const SPEED = 4.25, LAT = 1.95;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();

// polyline path { pts, cum, len, stops: [s...] }
function mkPath(pts, stops = null) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], stops: stops || [] };
}
function v1Paths(L) {
  const P = u => (L.axis === 'x' ? [L.c, u] : [u, L.c]);
  const n = Math.ceil(Math.abs(L.to - L.from) / 20), pts = [];
  for (let i = 0; i <= n; i++) pts.push(P(L.from + (L.to - L.from) * i / n));
  const sp = L.axis === 'x' ? 80 : 100, len = Math.abs(L.to - L.from), stops = [];
  for (let s = sp; s < len - 10; s += sp) stops.push(s);
  return [mkPath(pts, stops), mkPath(pts.slice().reverse(), stops.map(s => len - s).reverse())];
}
function v2Paths(world) {
  // the OSM cable rails (data.extras.rails kind 'cable') cover only parts of the lines in the extract, so each line is
  // routed over the streets it really runs on (one-way costs make the Jackson / Washington couplet split outbound and
  // inbound like the real thing); the rails are drawn by the road mesh
  const g = world.graph;
  const norm = s => (s || '').toLowerCase();
  const nodeNear = ([lat, lon], ok) => {
    const [x, z] = ll(lat, lon);
    const n = g.nearestEdge(x, z, 300, ok);
    if (!n) return null;
    return n.s < n.edge.len / 2 ? n.edge.a : n.edge.b;
  };
  const route = (a, b, ok) => {
    const r = findRoute(g, a, b, { avoid: e => !ok(e), onewayCost: 2.5 });
    if (!r || !r.length) return null;
    const pts = [[a.x, a.z]], stops = [];
    let L = 0;
    for (const { edge, forward } of r) {
      const n = edge.pts.length;
      for (let k = 1; k < n; k++) { const p = edge.pts[forward ? k : n - 1 - k], q = pts[pts.length - 1]; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > 0.5) { pts.push([p[0], p[1]]); L += d; } }
      stops.push(L);
    }
    stops.pop();
    return mkPath(pts, stops.filter(s => s > 15 && s < L - 15));
  };
  const out = [];
  for (const L of LINES_V2) {
    const ok = e => e.main !== false && L.streets.some(n => norm(e.name).startsWith(n));
    const a = nodeNear(L.a, ok), b = nodeNear(L.b, ok);
    const p0 = a && b ? route(a, b, ok) : null, p1 = a && b ? route(b, a, ok) : null;
    if (p0 && p1) out.push({ name: L.name, paths: [p0, p1] });
    else console.warn('[cablecars] no route for', L.name);
  }
  return out;
}

export function install(G) {
  const { world, scene, audio } = G;
  const cars = [];
  let lines = [];
  try { lines = world.v2 ? v2Paths(world) : LINES_V1.map(L => ({ name: L.name, paths: v1Paths(L) })); } catch (err) { console.error('[cablecars]', err); }
  for (const L of lines) {
    for (const dir of [0, 1]) {
      const v = new Vehicle('cablecar', { scene, role: 'cablecar' });
      v.body.kinematic = true;
      v.driver = 'cablecar';
      const P = L.paths[dir];
      const c = { v, L, dir, P, s: P.len * (dir ? 0.6 : 0.15), wait: 0, bellCD: 0 };
      cars.push(c);
      G.addVehicle(v);
      place(c, 0);
    }
  }
  // world position of distance s along the car's current path (right-hand track: offset right of the centreline;
  // one-way streets carry a single centred track on v2)
  function at(c, s) {
    const P = c.P;
    const [x, z] = pointAt(P, s), pa = pointAt(P, s - 4), pb = pointAt(P, s + 4);   // heading smoothed over +-4 m
    let hx = pb[0] - pa[0], hz = pb[1] - pa[1]; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const lat = world.v2 ? (oneWayAt(x, z) ? 0 : 1.6) : LAT;
    return { x: x - hz * lat, z: z + hx * lat, hx, hz };
  }
  function pointAt(P, s) {
    s = Math.max(0, Math.min(P.len, s));
    const cum = P.cum; let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = P.pts[lo], b = P.pts[hi], t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function oneWayAt(x, z) { const n = world.graph.nearestEdge(x, z, 12); return !!n?.edge.oneway; }
  function place(c, dt) {
    const p = at(c, c.s), b = c.v.body, wb = 2.5;
    const probe = dt > 0 ? b.pos.y + 3 : 999;   // follow the deck / street the car is on (not a bridge above it)
    const yF = world.groundAt(p.x + p.hx * wb, p.z + p.hz * wb, probe), yR = world.groundAt(p.x - p.hx * wb, p.z - p.hz * wb, probe);
    const y = (yF + yR) / 2;
    const yaw = Math.atan2(-p.hx, -p.hz), pitch = Math.atan2(yF - yR, wb * 2);
    _e.set(pitch, yaw, 0); _q.setFromEuler(_e);
    const prev = b.pos.clone();
    b.quat.copy(_q);
    _v.copy(b.com).applyQuaternion(_q).add(new THREE.Vector3(p.x, y, p.z));
    b.pos.copy(_v);
    if (dt > 0) b.vel.copy(b.pos).sub(prev).divideScalar(dt); else b.vel.set(0, 0, 0);
    b.angVel.set(0, 0, 0);
    b.speed = b.vel.length(); b.fwdSpeed = b.speed;
    for (const w of b.wheels) { w.len = b.travel - w.sag; w.spin += (dt * SPEED / w.radius) * (c.wait > 0 ? 0 : 1); }
  }
  G.systems.push({
    update(dt) {
      if (G.state !== 'play') return;
      raceClosure();
      for (const c of cars) {
        if (c.off) continue;
        c.bellCD -= dt;
        if (c.wait > 0) {
          c.wait -= dt;
          if (c.wait <= 0) ring(c);
        } else {
          // blocked by something ahead in the lane?
          const p = at(c, c.s);
          let blocked = false;
          for (const o of G.vehicles()) {
            if (o === c.v) continue;
            const dx = o.pos.x - p.x, dz = o.pos.z - p.z, along = dx * p.hx + dz * p.hz, lat = Math.abs(dx * -p.hz + dz * p.hx);
            if (along > 2 && along < 12 && lat < 2.2 && Math.abs(o.pos.y - c.v.pos.y) < 3) { blocked = true; break; }
          }
          const P = G.playerOnFoot?.();
          if (P) { const dx = P.x - p.x, dz = P.z - p.z, along = dx * p.hx + dz * p.hz; if (along > 2 && along < 9 && Math.abs(dx * -p.hz + dz * p.hx) < 1.6) blocked = true; }
          if (!blocked) {
            const before = c.s;
            c.s += SPEED * dt;
            // corner stops: at intersections along the line, 45% chance
            for (const st of c.P.stops) if (before < st && c.s >= st) { if (Math.random() < 0.45) c.wait = 3 + Math.random() * 4; break; }
            if (c.s >= c.P.len) { c.dir = 1 - c.dir; c.P = c.L.paths[c.dir]; c.s = 0; c.wait = 8; } // turnaround at the end of the line
          } else if (c.bellCD <= 0) ring(c);
        }
        place(c, dt);
      }
    },
  });
  // festival races / missions close their roads: cable cars on a line that shares streets with the active route are
  // taken off the street (hidden, out of the sim) until it ends, so kinematic cars never wall off a race
  let closedFor = null;
  function raceClosure() {
    const F = G.festival, R = F?.racing?.active?.route || F?.stories?.active?.route || null;
    if (R === closedFor) return;
    closedFor = R;
    const hit = new Set();
    if (R) {
      const cell = new Set(), key = (x, z) => Math.floor(x / 12) * 100003 + Math.floor(z / 12);
      for (let i = 0; i < R.pts.length; i++) { const [x, z] = R.pts[i]; for (const dx of [-12, 0, 12]) for (const dz of [-12, 0, 12]) cell.add(key(x + dx, z + dz)); }
      for (const L of lines) for (const P of L.paths) if (P.pts.some(([x, z]) => cell.has(key(x, z)))) hit.add(L);
    }
    for (const c of cars) {
      const off = hit.has(c.L);
      if (off === !!c.off) continue;
      c.off = off; c.v.root.visible = !off;
      if (off) G.sim.remove(c.v); else { G.sim.add(c.v); place(c, 0); }
    }
  }
  function ring(c) {
    if (!audio || c.bellCD > 0) return;
    const d = Math.hypot(c.v.pos.x - G.camera.position.x, c.v.pos.z - G.camera.position.z);
    if (d < 140) { G.camera.getWorldDirection(_v); const pan = THREE.MathUtils.clamp(((c.v.pos.x - G.camera.position.x) * -_v.z + (c.v.pos.z - G.camera.position.z) * _v.x) / Math.max(1, d), -1, 1); audio.cableCarBell({ distance: d, pan }); }
    c.bellCD = 4;
  }
  G.cablecars = cars;
  G.cablecarLines = lines;
}
