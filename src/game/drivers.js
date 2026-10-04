// AI driving: lane waypoints over the road graph, pure-pursuit steering, speed control, signals / stop signs,
// car following. Used by traffic, police (with a pursuit target) and race rivals (with a fixed route).
import * as THREE from 'three';
import { edgePointAt, edgesInRing, findRoute } from '../world/roads.js';

const _p = {};
export function laneOffset(e, lane) { return (e.median || 0.15) + (lane + 0.5) * e.laneW; }

// point on an edge lane. dir +1 = a->b. s measured along the travel direction.
export function lanePoint(e, dir, lane, s, out = {}) {
  const sa = dir > 0 ? s : e.len - s;
  edgePointAt(e, sa, _p);
  const rx = -_p.dz, rz = _p.dx; // right of the a->b direction
  // one-way: centred (v1); multi-lane one-ways on the 1:1 map (edges carry cls) spread their lanes across the carriageway
  const off = e.oneway ? (e.cls && e.lanes > 1 ? (lane - (e.lanes - 1) / 2) * e.laneW : 0) : laneOffset(e, lane) * dir;
  out.x = _p.x + rx * off; out.z = _p.z + rz * off; out.y = _p.y;
  out.hx = _p.dx * dir; out.hz = _p.dz * dir;
  return out;
}

// signal phase for an approach heading (hx,hz) into node n. returns 'green' | 'yellow' | 'red'
export function signalFor(n, hx, hz, time) {
  const cycle = 34, t = (time + n.id * 7.3) % cycle;
  const ns = Math.abs(hz) > Math.abs(hx);
  const phaseA = t < 15 ? 'green' : t < 18 ? 'yellow' : 'red';
  const phaseB = t >= 17 && t < 32 ? 'green' : t >= 32 && t < 34.5 ? 'yellow' : 'red';
  return ns ? phaseA : (t < 17 ? 'red' : phaseB);
}

export class Driver {
  constructor(vehicle, graph, { mode = 'traffic', rnd = Math.random, speedMul = 1 } = {}) {
    this.v = vehicle; this.graph = graph; this.mode = mode; this.rnd = rnd;
    this.wps = [];            // waypoints [{x,z,edge,dir,lane,s,node(if at intersection entry), speed}]
    this.edge = null; this.dir = 1; this.lane = 0; this.s = 0;
    this.speedMul = speedMul * (0.9 + rnd() * 0.2);
    this.stopTimer = 0; this.waitTimer = 0; this.honk = 0; this.stuckT = 0; this.reverseT = 0;
    this.state = 'drive';
    this.target = null;      // pursuit target {x,z,vx,vz}
    this.route = null;       // fixed route (race): array of {edge, forward}
    this.routeIdx = 0;
    this.blockedBy = null;
  }
  // race mode: follow an explicit dense polyline [[x,z],...] with curvature speed limits
  // ys (optional, heights per point): race paths also slow for crests (vertical curvature), so racers on the 1:1 hills
  // don't launch off every intersection plateau at full speed and land sideways
  setPath(points, { latAcc = 9, loop = false, ys = null, crestG = 1.35 } = {}) {
    this.pathMode = true; this.loop = loop;
    const n = points.length;
    const W = 3; // curvature over +-3 points (~18 m) so joins and tiny zigzags don't spike
    this.wps = points.map((p, i) => {
      if (i < W || i >= n - W) return { x: p[0], z: p[1], limit: 70, idx: i };
      const a = points[i - W], b = points[i + W];
      const d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
      const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
      if (l1 < 1e-3 || l2 < 1e-3) return { x: p[0], z: p[1], limit: 70, idx: i };
      const ang = Math.acos(Math.max(-1, Math.min(1, (d1x * d2x + d1z * d2z) / (l1 * l2))));
      const kappa = ang / Math.max(1, (l1 + l2) / 2);
      return { x: p[0], z: p[1], limit: kappa > 1e-4 ? Math.max(6, Math.min(70, Math.sqrt(latAcc / kappa))) : 70, idx: i };
    });
    if (ys && ys.length >= n) {
      for (let i = 0; i < n; i++) if (isFinite(ys[i])) this.wps[i].y = ys[i];
      const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
      for (let i = 1, a = 0, c = 1; i < n - 1; i++) {
        while (a < i - 1 && cum[i] - cum[a + 1] >= 12) a++;
        if (c <= i) c = i + 1; while (c < n - 1 && cum[c] - cum[i] < 12) c++;
        const d1 = cum[i] - cum[a], d2 = cum[c] - cum[i];
        if (d1 < 4 || d2 < 4 || !isFinite(ys[a]) || !isFinite(ys[i]) || !isFinite(ys[c])) continue;
        const k = -((ys[c] - ys[i]) / d2 - (ys[i] - ys[a]) / d1) / ((d1 + d2) / 2);   // > 0 at a crest
        if (k > 0.004) { const w = this.wps[i], lim = Math.sqrt(9.81 * crestG / k); if (lim < w.limit) w.limit = Math.max(9, lim); }
      }
      // grade breaks (SF intersection plateaus: -20 % -> flat -> -20 %) are sharper than the 12 m curvature above sees:
      // at 24 m/s racers flew 1-1.7 s off Hyde St crests, landed crossed up and wedged against walls / parked cars.
      // Launch limit from the flight time off a break of dG: t = 2 v dG / g  ->  v <= g T / (2 dG), T = 0.75 s.
      for (let i = 1, a = 0, c = 1; i < n - 1; i++) {
        while (a < i - 1 && cum[i] - cum[a + 1] >= 7) a++;
        if (c <= i) c = i + 1; while (c < n - 1 && cum[c] - cum[i] < 7) c++;
        const d1 = cum[i] - cum[a], d2 = cum[c] - cum[i];
        if (d1 < 3 || d2 < 3 || !isFinite(ys[a]) || !isFinite(ys[i]) || !isFinite(ys[c])) continue;
        const dG = (ys[i] - ys[a]) / d1 - (ys[c] - ys[i]) / d2;           // > 0: the road falls away
        if (dG > 0.06) {
          const w = this.wps[i], lim = Math.max(14, 9.81 * 0.75 / (2 * dG)); if (lim < w.limit) w.limit = lim;
          for (let j = i; j < n && cum[j] - cum[i] < 12; j++) this.wps[j].flight = true;   // a hop follows: no braking there
        }
      }
    }
    this.allPath = this.wps.slice();
    this.propagateBraking();
  }
  // Backward pass: every point's limit <= what the car can still brake down from to meet every limit after it, with
  // downhill-weakened deceleration and ~no braking where it will be airborne off a plateau lip. The runtime look-ahead
  // (140 m, per-frame) misses corners hidden behind a crest: rivals flew the Hyde St plateaus toward Bay St at 25 m/s,
  // could not brake in the air, overshot the right turn onto Bay and ran on toward Beach St / Victorian Park, then
  // respawned (festival Russian Hill Bomb). Limits only go down, so traffic / police paths are unaffected.
  propagateBraking(dec = 5.6) {
    const P = this.allPath; if (!P || P.length < 3) return;
    const passes = this.loop ? 2 : 1, n = P.length;
    for (let pass = 0; pass < passes; pass++) {
      for (let k = n - 2 + (this.loop ? 1 : 0); k >= 0; k--) {
        const a = P[k % n], b = P[(k + 1) % n], ds = Math.hypot(b.x - a.x, b.z - a.z);
        if (ds < 1e-3) { if (b.limit < a.limit) a.limit = b.limit; continue; }
        let d = dec;
        if (a.y !== undefined && b.y !== undefined) d = Math.max(2.4, dec - 9.81 * Math.max(0, (a.y - b.y) / ds) * 1.15);
        if (a.flight) d = 0.6;
        const lim = Math.sqrt(b.limit * b.limit + 2 * d * ds);
        if (lim < a.limit) a.limit = lim;
      }
    }
  }
  // race paths: short plateau lips / kickers (0.5-1 m over 2-4 m at the baked intersection plateaus) sit between the
  // path points, so the 7 m grade-break pass above can't see them. Sample the real ground every metre and cap the
  // speed over the 30 m run-up to each lip at the launch speed for a ~0.9 s hop (g T / (2 dG), >= 16 m/s).
  limitLips(groundAt, { T = 0.9, minV = 16 } = {}) {
    const P = this.allPath; if (!P || P.length < 3 || !groundAt) return 0;
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
    let k = 0, lips = 0;
    const at = s => { while (k > 0 && cum[k] > s) k--; while (k < P.length - 2 && cum[k + 1] < s) k++; const a = P[k], b = P[k + 1], t = Math.max(0, Math.min(1, (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1))); const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y !== undefined && b.y !== undefined ? a.y + (b.y - a.y) * t : 999; return groundAt(x, z, y + 2); };
    const L = cum[cum.length - 1];
    for (let s = 2; s < L - 4; s += 1) {
      const dg = q => { const h0 = at(q - 2), h1 = at(q), h2 = at(q + 4); return (h1 - h0) / 2 - (h2 - h1) / 4; };
      let dG = dg(s);
      if (dG < 0.09) continue;
      for (let q = s + 1; q <= s + 4; q++) dG = Math.max(dG, dg(q));   // the lip's peak, not its leading edge
      const lim = Math.max(minV, 9.81 * T / (2 * dG)); lips++;
      for (let i = 0; i < P.length; i++) {
        if (cum[i] > s - 30 && cum[i] <= s + 2 && lim < P[i].limit) P[i].limit = lim;
        if (cum[i] > s && cum[i] < s + 10) P[i].flight = true;
      }
      s += 4;
    }
    if (lips) this.propagateBraking();
    return lips;                // (allPath and the fresh wps share the point objects: both see the new limits)
  }
  start(edge, dir, lane, s) {
    this.edge = edge; this.dir = dir; this.lane = Math.min(lane, edge.lanes - 1); this.s = s; this.wps.length = 0;
    this.extend();
  }
  // generate waypoints ahead until ~80 m of path is queued
  extend() {
    if (this.pathMode) { if (this.loop && this.allPath && this.wps.length < 30) this.wps.push(...this.allPath.map(w => ({ ...w }))); else if (!this.loop) this.deadEnd = true; return; }
    let guard = 0;
    while (this.queuedLen() < 90 && guard++ < 12) {
      const e = this.edge;
      const step = 5;
      const s0 = this.wps.length ? this.lastS + step : Math.max(0, this.s);
      const nodeEnd = this.dir > 0 ? e.b : e.a;
      const stopAt = e.len - (nodeEnd.deg >= 3 ? nodeEnd.radius + 1.5 : 0);
      for (let s = s0; s < stopAt; s += step) {
        const q = lanePoint(e, this.dir, this.lane, s, {});
        q.edge = e; q.dir = this.dir; q.s = s; q.limit = edgeSpeed(e);
        this.wps.push(q); this.lastS = s;
      }
      // intersection entry marker at the stop line (skip if we are resuming right at it after a replan)
      const lastW = this.wps[this.wps.length - 1];
      const entry = lastW && lastW.node === nodeEnd && lastW.edge === e ? this.wps.pop() : lanePoint(e, this.dir, this.lane, Math.max(0, stopAt), {});
      entry.edge = e; entry.dir = this.dir; entry.s = stopAt; entry.node = nodeEnd; entry.limit = edgeSpeed(e);
      entry.hx = entry.hx; entry.hz = entry.hz;
      this.wps.push(entry);
      // choose the next edge
      const next = this.pickNext(nodeEnd, e);
      if (!next) { this.deadEnd = true; return; }
      const nd = next.a === nodeEnd ? 1 : -1;
      const nl = Math.min(this.lane, next.lanes - 1);
      const startS = nodeEnd.deg >= 3 ? nodeEnd.radius + 1.5 : 0;
      const exit = lanePoint(next, nd, nl, Math.min(startS, next.len * 0.4), {});
      // turn curve: quadratic bezier from entry to exit with control at the intersection of the headings
      const cx = nodeEnd.x + (entry.x - nodeEnd.x) * 0.15 + (exit.x - nodeEnd.x) * 0.15;
      const cz = nodeEnd.z + (entry.z - nodeEnd.z) * 0.15 + (exit.z - nodeEnd.z) * 0.15;
      const turnAng = Math.abs(Math.atan2(entry.hx * exit.hz - entry.hz * exit.hx, entry.hx * exit.hx + entry.hz * exit.hz));
      // corner speeds for tight city intersections (~8-12 m radius): lateral grip budget ~3.5 m/s^2 for calm traffic
      const turnLimit = turnAng > 2.2 ? 3.2 : turnAng > 1.2 ? 5.2 : turnAng > 0.5 ? 7.5 : 99;
      for (let t = 0.25; t < 1; t += 0.25) {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        this.wps.push({ x: a * entry.x + b * cx + c * exit.x, z: a * entry.z + b * cz + c * exit.z, edge: next, dir: nd, s: 0, turn: true, limit: turnLimit });
      }
      this.edge = next; this.dir = nd; this.lane = nl; this.lastS = Math.min(startS, next.len * 0.4) - step; this.s = 0;
      const ex = lanePoint(next, nd, nl, Math.min(startS, next.len * 0.4), {}); ex.edge = next; ex.dir = nd; ex.s = startS; ex.limit = turnLimit;
      this.wps.push(ex);
    }
  }
  // replace the path after the next intersection with a new route (array of edges starting at the next node)
  replan(routeEdges) {
    let cut = -1;
    for (let i = 0; i < this.wps.length; i++) if (this.wps[i].node) { cut = i; break; }
    if (cut < 0) return;
    const entry = this.wps[cut];
    this.wps.length = cut + 1;
    this.edge = entry.edge; this.dir = entry.dir; this.lastS = entry.s; this.deadEnd = false;
    this.route = routeEdges; this.routeIdx = 0;
    this.extend();
  }
  nextNode() { for (const w of this.wps) if (w.node) return w.node; return this.dir > 0 ? this.edge?.b : this.edge?.a; }
  queuedLen() {
    const w = this.wps; if (w.length < 2) return 0;
    let L = 0; for (let i = 1; i < w.length; i++) L += Math.hypot(w[i].x - w[i - 1].x, w[i].z - w[i - 1].z);
    return L;
  }
  pickNext(node, from) {
    const opts = node.edges.filter(e => e !== from && !(e.oneway && e.b === node) && e.kind !== 'crooked' && e.traffic !== false);
    if (!opts.length) return node.edges.find(e => e === from) ? from : null; // dead end: u-turn
    if (this.route) {
      const r = this.route[this.routeIdx], re = r && (r.edge ?? r);
      if (re && opts.includes(re)) { this.routeIdx++; return re; }
    }
    if (this.target) {
      // pursuit: first edge of the shortest legal road route to the target's nearest node (the greedy choice below went
      // round blocks / one-ways and units circled a parked suspect for 20+ s); greedy only when there is no route
      const g = this.graph, tn = g?.nearestNode?.(this.target.x, this.target.z, 80);
      if (tn && tn !== node && Math.hypot(tn.x - node.x, tn.z - node.z) < 600) {
        const path = findRoute(g, node, tn);
        const e0 = path && path[0] && (path[0].edge ?? path[0]);
        if (e0 && opts.includes(e0)) return e0;
      }
      let best = null, bd = Infinity;
      for (const e of opts) { const o = e.a === node ? e.b : e.a; const d = Math.hypot(o.x - this.target.x, o.z - this.target.z); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    // traffic: prefer going straight / staying on bigger roads
    const inDir = Math.atan2(node.x - (from.a === node ? from.b.x : from.a.x), node.z - (from.a === node ? from.b.z : from.a.z));
    let tot = 0; const ws = opts.map(e => {
      const o = e.a === node ? e.b : e.a;
      const d = Math.abs(wrap(Math.atan2(o.x - node.x, o.z - node.z) - inDir));
      let w = d < 0.4 ? 3 : 1;
      if (e.width >= 14) w *= 1.4;
      if (e.kind === 'park' || e.kind === 'mountain') w *= 0.5;
      tot += w; return w;
    });
    let r = this.rnd() * tot; for (let i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i]; }
    return opts[0];
  }

  // pinned for good: teleport to the nearest road lane that is out of the camera's view and free of cars (race paths
  // have their own respawn). Returns false when no spot qualifies (retried next frame).
  rescue(ctx) {
    if (this.pathMode || this.mode === 'race') return false;
    const v = this.v, p = v.root.position, list = edgesInRing(this.graph, p.x, p.z, 0, 260, _ring);
    let best = null, bd = Infinity;
    for (const e of list) {
      if (e.kind === 'crooked' || e.traffic === false || e.tunnel || e.len < 16) continue;
      const d = Math.hypot((e.a.x + e.b.x) / 2 - p.x, (e.a.z + e.b.z) / 2 - p.z);
      if (d < 20 || d >= bd) continue;
      const dir = e.oneway ? 1 : this.rnd() < 0.5 ? 1 : -1, s = e.len / 2, q = lanePoint(e, dir, 0, s, {});
      const y = q.y ?? p.y;
      if (ctx?.inView?.(q.x, y + 1, q.z) || ctx?.occupied?.(q.x, q.z, 9, v)) continue;
      best = { e, dir, s, q, y }; bd = d;
    }
    if (!best) return false;
    const { e, dir, s, q, y } = best;
    v.place(q.x, y + 0.45, q.z, Math.atan2(-q.hx, -q.hz));
    this.unstuck = null; this.stuckT = 0; this.laneOnlyT = 3; this.clearedNode = null;
    this.start(e, dir, 0, s);
    this.rescues = (this.rescues || 0) + 1;
    return true;
  }
  // produce vehicle.input for this frame
  drive(dt, ctx) {
    const v = this.v, b = v.body, inp = v.input;
    const pos = v.root.position;
    b.forward(_f);
    const hx = _f.x, hz = _f.z, hl = Math.hypot(hx, hz) || 1;
    const fx = hx / hl, fz = hz / hl;
    const speed = Math.max(0, b.fwdSpeed);
    // pop passed waypoints
    // race paths: skip waypoints the car has already passed laterally / been respawned past (otherwise the queue head
    // sits behind the car and the racer turns round to fetch it: the "stalls / goes backwards on circuits" bug)
    if (this.pathMode && this.mode === 'race' && this.wps.length) {
      const w0 = this.wps[0], d0 = Math.hypot(w0.x - pos.x, w0.z - pos.z);
      if (d0 > 40 && this.allPath) {
        // far from the queue head (respawned / pushed off): restart the queue at the nearest point of the whole path
        let bk = 0, bd = Infinity;
        for (let k = 0; k < this.allPath.length; k++) { const w = this.allPath[k], d = (w.x - pos.x) ** 2 + (w.z - pos.z) ** 2; if (d < bd) { bd = d; bk = k; } }
        bk = Math.min(bk + 2, this.allPath.length - 1);   // aim a little ahead of the nearest point
        this.wps = this.allPath.slice(bk).map(w => ({ ...w }));
        if (this.loop) this.wps.push(...this.allPath.slice(0, bk).map(w => ({ ...w })));
        this.deadEnd = false;
      } else if (d0 > 12) {
        let bk = 0, bd = d0;
        for (let k = 1; k < Math.min(this.wps.length, 80); k++) { const w = this.wps[k], d = Math.hypot(w.x - pos.x, w.z - pos.z); if (d < bd) { bd = d; bk = k; } }
        if (bk > 0 && bd < d0 - 6 && bd < 30) this.wps.splice(0, bk);
      }
    }
    // race paths pop a waypoint once the car is past it along the PATH (its tangent): the heading test popped the whole
    // cross street when a rival ran 2 m wide at a 90 deg corner (every waypoint of the new street lay beside it), so it
    // drove on straight into the park / beach until the 40 m reset: ~100 'noProgress' respawns per Bay Crown
    const racePath = this.pathMode && this.mode === 'race';
    while (this.wps.length > 1) {
      const w = this.wps[0];
      const dx = w.x - pos.x, dz = w.z - pos.z;
      let passed;
      if (racePath) { const n = this.wps[1], tx = n.x - w.x, tz = n.z - w.z, tl = Math.hypot(tx, tz) || 1; passed = -(dx * tx + dz * tz) / tl > -1.5; }
      else passed = dx * fx + dz * fz < 1.5;
      if (passed || dx * dx + dz * dz < 9) { if (w.node) this.lastNode = w.node; this.wps.shift(); } else break;
    }
    if (this.wps.length < 8 && !this.deadEnd) this.extend();
    if (!this.wps.length) { inp.throttle = 0; inp.brake = 1; inp.autoReverse = false; inp.reverse = false; return; }
    // lookahead
    const inTurn = this.wps[0]?.turn || this.wps[1]?.turn;
    const look = this.mode === 'race' ? Math.max(8, speed * 0.55 + 5) : inTurn ? Math.max(3.5, speed * 0.45 + 2) : Math.max(5, speed * 0.6 + 3);
    let tx = this.wps[this.wps.length - 1].x, tz = this.wps[this.wps.length - 1].z, acc = 0, px = pos.x, pz = pos.z;
    for (const w of this.wps) { acc += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; if (acc >= look) { tx = w.x; tz = w.z; break; } }
    let target = { x: tx, z: tz };
    // (the direct chase ignores buildings: right after an unstuck manoeuvre follow the lane waypoints instead)
    if (this.target && this.mode === 'pursuit' && !(this.laneOnlyT > 0)) {
      const dT = Math.hypot(this.target.x - pos.x, this.target.z - pos.z);
      if (dT < 70) { // direct chase with lead
        const lead = Math.min(1.2, dT / 25);
        target = { x: this.target.x + this.target.vx * lead, z: this.target.z + this.target.vz * lead };
      }
    }
    // pure pursuit steering
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const rx = -fz, rz = fx;
    const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
    const L2 = lx * lx + lz * lz || 1;
    const curvature = 2 * lx / L2;
    const wb = v.spec.wheelbase || 2.7;
    let steerAng = Math.atan(curvature * wb);
    const maxA = b.maxSteer / (1 + Math.abs(b.fwdSpeed) / (v.params.steerSpeed ?? 17));
    let steer = THREE.MathUtils.clamp(steerAng / Math.max(0.05, maxA), -1, 1);
    if (lz < 0 && this.mode !== 'pursuit') steer = Math.sign(lx) || 1;
    // ---- target speed
    // race rubber-band > 1 lifts the straight-line target only: corner / braking limits below stay physical
    let vt = (this.wps[0].limit ?? 13) * this.speedMul * (this.mode === 'pursuit' ? 1.5 : 1) * (this.mode === 'race' ? Math.max(1, this.rubber ?? 1) : 1);
    // upcoming turns within braking distance
    acc = 0; px = pos.x; pz = pos.z;
    for (const w of this.wps) {
      acc += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z;
      if (acc > (this.mode === 'race' ? 140 : 60)) break;
      const lim = (w.limit ?? 99) * this.speedMul * (this.mode === 'pursuit' ? (w.turn ? 1.25 : 1.5) : 1);
      // race paths with heights: braking downhill is weaker (g * grade), and the run-up to a corner on SF's hills is steep
      let dec = this.mode === 'race' ? 6.2 : 4.5;
      if (w.y !== undefined && acc > 4) dec = Math.max(3, dec - 9.81 * Math.min(0.35, Math.max(0, (pos.y - w.y) / acc)) * 1.1);
      const allowed = Math.sqrt(lim * lim + 2 * dec * Math.max(0, acc - 4));
      if (allowed < vt) vt = allowed;
      // intersections: signals and stop signs
      if (w.node && this.mode === 'traffic') {
        const n = w.node;
        if (n.signal) {
          const ph = signalFor(n, w.hx, w.hz, ctx.time);
          if (ph === 'red' || (ph === 'yellow' && acc > speed * 1.2 + 4)) { const stopV = Math.sqrt(Math.max(0, 2 * 5 * (acc - 2))); if (stopV < vt) vt = acc < 2.5 ? 0 : stopV; }
        } else if (n.stop && n !== this.clearedNode) {
          if (acc < 4 && speed < 1.2) { this.stopTimer += dt; if (this.stopTimer > 0.8 && !ctx.nodeBusy(n, v)) { this.clearedNode = n; this.stopTimer = 0; } }
          else { const stopV = Math.sqrt(Math.max(0, 2 * 4 * (acc - 1.5))); if (stopV < vt) vt = acc < 2 ? 0 : stopV; }
        }
        break;
      }
    }
    // car following
    this.blockedBy = null;
    const ahead = this.mode === 'race' ? null : ctx.carAhead(v, fx, fz, 34);
    if (ahead && this.mode !== 'pursuit') {
      const gap = ahead.dist - 5.5;
      const safe = 2 + speed * 0.9;
      const vFollow = Math.max(0, Math.min(ahead.speed + (gap - safe) * 0.6, Math.sqrt(Math.max(0, 2 * 6 * gap))));
      if (vFollow < vt) { vt = vFollow; this.blockedBy = ahead.v; }
    }
    if (this.mode === 'pursuit' && this.target) vt = Math.max(vt, 14);
    if (this.mode === 'race') vt *= Math.min(1, this.rubber ?? 1);
    if (this.state === 'stopped') vt = 0;
    // pursuit, closing in (< 70 m, steering straight at the target): drive up to the suspect even where the lane path ends
    // (a route ends at the target's road node; cops parked there 20-30 m off a stopped player and never made the arrest)
    if (this.mode === 'pursuit' && this.target && !(this.laneOnlyT > 0)) { const dT = Math.hypot(this.target.x - pos.x, this.target.z - pos.z); if (dT < 70) vt = Math.max(vt, Math.min(16, 1.5 + dT * 0.45)); if (dT < 16) vt = Math.min(vt, Math.hypot(this.target.vx, this.target.vz) + 2 + dT * 0.7); }   // ...and box them in rather than shove them down the street
    // ---- throttle / brake
    const err = vt - b.fwdSpeed;
    let throttle = THREE.MathUtils.clamp(err * 0.35, 0, 1), brake = 0;
    if (err < -1) brake = THREE.MathUtils.clamp(-err * (this.mode === 'race' ? 0.45 : 0.25), 0, 1);
    if (vt < 0.3 && speed < 1) { throttle = 0; brake = 1; }
    // stuck handling: alternate reverse (full lock, nose swings toward the path) and forward (full lock toward the lane
    // path, not the straight-line chase target) with growing durations; still pinned after RESCUE_S -> rescue()
    // (teleport to the nearest road out of view). The old version accumulated stuck time during its own reverse and
    // flipped straight back into reverse: police sat reversing into the same wall forever.
    let reverse = false;
    if (this.laneOnlyT > 0) this.laneOnlyT -= dt;
    const U = this.unstuck;
    if (U) {
      U.t -= dt; U.total += dt;
      const moved = Math.hypot(pos.x - U.x, pos.z - U.z);
      if (moved > 7) { this.unstuck = null; this.stuckT = 0; this.laneOnlyT = 4; }
      else if (U.total > RESCUE_S && this.rescue(ctx)) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; inp.handbrake = 0; inp.reverse = false; inp.autoReverse = false; return; }
      else {
        if (U.t <= 0) { U.phase = U.phase === 'rev' ? 'fwd' : 'rev'; U.n++; U.t = U.phase === 'rev' ? 1.1 + 0.25 * U.n : 1.3 + 0.2 * U.n; }
        const side = (Math.sign(lx) || 1) * (U.n % 4 < 2 ? 1 : -1);      // every second cycle try the other side
        if (U.phase === 'rev') { throttle = 0.6; brake = 0; steer = -side; reverse = true; }
        else { throttle = 0.7; brake = 0; steer = side; }
      }
    }
    if (!this.unstuck) {
      if (throttle > 0.3 && speed < 0.8 && !this.blockedBy && this.state !== 'stopped') this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT > 1.8) { this.stuckT = 0; this.laneOnlyT = 6; this.unstuck = { phase: 'rev', t: 1.2, n: 0, total: 0, x: pos.x, z: pos.z }; throttle = 0; brake = 1; }
    }
    // honk if blocked by the player
    if (this.blockedBy && this.blockedBy.role === 'player' && speed < 1) { this.waitTimer += dt; if (this.waitTimer > 2.5) { this.honk = 0.5; this.waitTimer = -2; } } else this.waitTimer = 0;
    if (this.honk > 0) this.honk -= dt;
    // airborne off a crest: wheels straight, no brake (a steered / braked landing spun racers into the walls)
    if (this.mode === 'race' && (b.airTime || 0) > 0.06) { steer = 0; brake = 0; throttle = Math.min(throttle, 0.4); }
    inp.throttle = throttle; inp.brake = brake; inp.steer = steer; inp.handbrake = 0;
    inp.autoReverse = false; inp.reverse = reverse;
    if (this.mode === 'pursuit' && this.target) {
      // handbrake for tight turns at speed
      inp.handbrake = Math.abs(steer) > 0.95 && speed > 18 ? 1 : 0;
    }
  }
}
const _f = new THREE.Vector3(), _ring = [];
const RESCUE_S = 7;             // seconds of failed unstuck manoeuvres before the out-of-view teleport
function edgeSpeed(e) {
  if (e.kind === 'highway' || e.kind === 'bridge') return 24;
  if (e.kind === 'boulevard' || e.kind === 'arterial') return 16;
  if (e.kind === 'mountain' || e.kind === 'scenic' || e.kind === 'park') return 12;
  if (e.kind === 'crooked') return 3;
  return 12.5;
}
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
