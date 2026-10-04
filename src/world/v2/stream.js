// Tile streamer for the 1:1 map. The city is cut into 512 m tiles; every content module registers a PROVIDER and the
// streamer loads/unloads its tiles around the focus (player/camera), nearest first, within a per-frame time budget.
//
//   world.stream.register({
//     name: 'buildings',
//     range: 1400,                         // load tiles whose nearest point is within this distance (m); unload at range * 1.2
//     load(tile, ctx) -> handle,           // build synchronously (keep it < ~6 ms per tile; split work across tiles, not frames)
//     unload(handle, tile, ctx),           // free GPU memory + remove colliders
//     update?(dt, env, ctx),               // per frame (optional)
//     priority?: 0,                        // lower loads first at equal distance
//   })
//   tile = { tx, tz, key, x0, z0, x1, z1, cx, cz }
//   ctx  = { data, terrain, graph, scene, colliders, stream }
// Colliders: add with ctx.colliders.add(c) / addAll(list), remove with ctx.colliders.remove(c) in unload.
import { PERF } from '../../render/perfflags.js';
export class TileStreamer {
  constructor({ data, terrain, graph, scene, colliders }) {
    const m = data.meta;
    this.T = m.tile; this.X0 = m.extent.x0; this.Z0 = m.extent.z0; this.TC = m.tiles[0]; this.TR = m.tiles[1];
    this.ctx = { data, terrain, graph, scene, colliders, stream: this };
    this.providers = [];
    this.loaded = new Map();       // provider name -> Map(key -> {tile, handle})
    this.focus = { x: 0, z: 0 };
    this.budgetMs = 6;
    this.stats = { loads: 0, unloads: 0, ms: 0, pending: 0, reloads: 0 };
    // motion (focus velocity, smoothed) + camera forward: tiles ahead load first and further out, tiles in view or ahead
    // unload later (fast driving used to reload tiles it had just dropped at the range edge and fill ahead too late)
    this.vel = { x: 0, z: 0, speed: 0 }; this.view = { x: 0, z: -1 }; this._lastF = null; this._clock = 0;
    this._dropped = new Map();     // provider name + key -> time unloaded (reload stats)
    this._tiles = [];
    for (let tz = 0; tz < this.TR; tz++) for (let tx = 0; tx < this.TC; tx++) {
      const x0 = this.X0 + tx * this.T, z0 = this.Z0 + tz * this.T;
      this._tiles.push({ tx, tz, key: tz * this.TC + tx, x0, z0, x1: x0 + this.T, z1: z0 + this.T, cx: x0 + this.T / 2, cz: z0 + this.T / 2 });
    }
  }
  tileAt(x, z) {
    const tx = Math.floor((x - this.X0) / this.T), tz = Math.floor((z - this.Z0) / this.T);
    if (tx < 0 || tz < 0 || tx >= this.TC || tz >= this.TR) return null;
    return this._tiles[tz * this.TC + tx];
  }
  tile(tx, tz) { return tx < 0 || tz < 0 || tx >= this.TC || tz >= this.TR ? null : this._tiles[tz * this.TC + tx]; }
  register(p) {
    this.providers.push(p); this.loaded.set(p.name, new Map());
    this.providers.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    return p;
  }
  isLoaded(name, key) { return this.loaded.get(name)?.has(key) || false; }
  handle(name, key) { return this.loaded.get(name)?.get(key)?.handle; }
  dist(t, x, z) {
    const dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1);
    return Math.hypot(dx, dz);
  }
  // blocking fill around a point (loading screen / teleports)
  fill(x, z, progress = null) {
    this.focus.x = x; this.focus.z = z;
    const saved = this.budgetMs; this.budgetMs = Infinity;
    const todo = this._plan();
    let i = 0;
    for (const job of todo) { this._run(job); if (progress) progress(++i / todo.length); }
    this.budgetMs = saved;
  }
  // metres a tile's load priority gains for lying ahead of the motion (0 when slow or behind): for providers' own queues
  aheadBias(t) {
    const v = this.vel, sp = v.speed; if (!(sp > 12)) return 0;
    const cs = this._cos(t, this.focus.x, this.focus.z, v.x / sp, v.z / sp);
    return cs > 0 ? cs * Math.min(sp * 2.5, 160) * 1.5 : 0;
  }
  // cosine between the tile direction and a unit vector (1 when the focus is inside the tile)
  _cos(t, x, z, ux, uz) { const dx = t.cx - x, dz = t.cz - z, l = Math.hypot(dx, dz); return l < this.T * 0.5 ? 1 : (dx * ux + dz * uz) / l; }
  _plan() {
    const { x, z } = this.focus, jobs = [], v = this.vel, sp = v.speed, fast = sp > 12 && isFinite(sp);
    const ux = fast ? v.x / sp : 0, uz = fast ? v.z / sp : 0, ahead = fast ? Math.min(sp * 2.5, 160) : 0;
    const vw = this.view, now = this._clock;
    for (const p of this.providers) {
      const L = this.loaded.get(p.name), R = p.range;
      // hysteresis: unload at R * 1.2 + T / 4 behind; + T / 2 more while the tile is ahead of the motion or in front of the
      // camera, and never within 4 s of its load (teleports / U-turns at the range edge)
      const Ru = R * 1.2 + this.T * 0.25;
      if (R < 1e5) for (const [key, rec] of L) {
        const d = this.dist(rec.tile, x, z); if (d <= Ru) continue;
        const keep = (fast && this._cos(rec.tile, x, z, ux, uz) > 0.2) || this._cos(rec.tile, x, z, vw.x, vw.z) > 0.5;
        if ((keep && d <= Ru + this.T * 0.5) || now - (rec.t || 0) < 4) continue;
        jobs.push({ p, unload: true, rec, key, d: -1 });   // unloads first (free memory before allocating)
      }
      const Rl = R + ahead, r = Math.ceil(Rl / this.T) + 1, c = this.tileAt(x, z) || { tx: Math.floor((x - this.X0) / this.T), tz: Math.floor((z - this.Z0) / this.T) };
      // clamp to the grid (a whole-city provider has r ~ 2000 tiles: 15M empty iterations per replan otherwise)
      for (let tz = Math.max(0, c.tz - r); tz <= Math.min(this.TR - 1, c.tz + r); tz++) for (let tx = Math.max(0, c.tx - r); tx <= Math.min(this.TC - 1, c.tx + r); tx++) {
        const t = this.tile(tx, tz); if (!t || L.has(t.key)) continue;
        const d = this.dist(t, x, z);
        // ahead of the motion: loads up to `ahead` m further out and sorts earlier (by up to 1.5x ahead m)
        const cs = fast && d > 0 ? this._cos(t, x, z, ux, uz) : 0;
        if (d <= R || (cs > 0.5 && d <= R + ahead * cs)) jobs.push({ p, tile: t, key: t.key, d: d + (p.priority || 0) * 50 - cs * ahead * 1.5 });
      }
    }
    jobs.sort((a, b) => a.d - b.d);
    return jobs;
  }
  _run(job) {
    const L = this.loaded.get(job.p.name);
    if (job.unload) {
      try { job.p.unload?.(job.rec.handle, job.rec.tile, this.ctx); } catch (e) { console.error(`[stream] ${job.p.name} unload`, e); }
      L.delete(job.key); this.stats.unloads++;
      this._dropped.set(job.p.name + ':' + job.key, this._clock);
    } else {
      let handle = null;
      try { handle = job.p.load(job.tile, this.ctx); } catch (e) { console.error(`[stream] ${job.p.name} load ${job.tile.tx},${job.tile.tz}`, e); }
      L.set(job.key, { tile: job.tile, handle, t: this._clock }); this.stats.loads++;
      const dk = job.p.name + ':' + job.key, td = this._dropped.get(dk);
      if (td !== undefined) { if (this._clock - td < 30) this.stats.reloads++; this._dropped.delete(dk); }
    }
  }
  update(dt, env, focus) {
    this._clock += dt || 0;
    if (focus) {
      this.focus.x = focus.x; this.focus.z = focus.z;
      const lf = this._lastF;
      if (lf && dt > 0) {
        const vx = (focus.x - lf.x) / dt, vz = (focus.z - lf.z) / dt, k = Math.min(1, dt * 3);
        if (Math.hypot(vx, vz) > 400) { this.vel.x = this.vel.z = 0; }            // teleport
        else { this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k; }
        this.vel.speed = Math.hypot(this.vel.x, this.vel.z);
      }
      if (lf) { lf.x = focus.x; lf.z = focus.z; } else this._lastF = { x: focus.x, z: focus.z };
    }
    const cam = env?.camera;
    if (cam?.matrixWorld) { const e = cam.matrixWorld.elements, l = Math.hypot(e[8], e[10]); if (l > 1e-3) { this.view.x = -e[8] / l; this.view.z = -e[10] / l; } }
    const t0 = performance.now();
    this._tick = (this._tick || 0) + 1;
    if (!this._queue || this._tick % 10 === 0 || !this._queue.length) this._queue = this._plan();
    if (this._tick % 900 === 0) for (const [k, t] of this._dropped) if (this._clock - t > 60) this._dropped.delete(k);
    // (perf r3) ?streamslice: a 2.5 ms budget, and a job only starts when its provider's typical cost (EMA of its measured
    // loads / unloads) still fits; the first job of a frame always runs. The 6 ms budget used to start a 5-8 ms load at
    // 5.9 ms (11-14 ms of streaming in one frame).
    const slice = PERF.streamslice && this.budgetMs !== Infinity, budget = slice ? Math.min(this.budgetMs, 2.5) : this.budgetMs;
    const cost = this._cost || (this._cost = new Map());
    let ran = 0;
    while (this._queue.length && performance.now() - t0 < budget) {
      const job = this._queue[0];
      const L = this.loaded.get(job.p.name);
      if (job.unload ? !L.has(job.key) : L.has(job.key)) { this._queue.shift(); continue; }
      const ck = (job.unload ? 'u:' : 'l:') + job.p.name, est = cost.get(ck) ?? 1;
      if (slice && ran && performance.now() - t0 + est > budget) break;
      this._queue.shift();
      const tj = performance.now();
      this._run(job); ran++;
      const d = performance.now() - tj; cost.set(ck, cost.has(ck) ? cost.get(ck) * 0.7 + d * 0.3 : d);
    }
    this.stats.pending = this._queue.length;
    for (const p of this.providers) p.update?.(dt, env, this.ctx);
    this.stats.ms = performance.now() - t0;
  }
}
