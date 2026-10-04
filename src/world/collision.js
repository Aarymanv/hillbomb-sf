// Static oriented-box colliders in a spatial hash. Collider: {x, z, hx, hz, yaw, yMin, yMax, kind}
export class StaticColliders {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); this.list = []; this.stamp = 0; }
  add(c) {
    const cs = Math.cos(c.yaw || 0), sn = Math.sin(c.yaw || 0);
    c.c = cs; c.s = sn; c.mark = 0;
    const ex = Math.abs(cs) * c.hx + Math.abs(sn) * c.hz, ez = Math.abs(sn) * c.hx + Math.abs(cs) * c.hz;
    c.ex = ex; c.ez = ez;
    const C = this.cell;
    const x0 = Math.floor((c.x - ex) / C), x1 = Math.floor((c.x + ex) / C), z0 = Math.floor((c.z - ez) / C), z1 = Math.floor((c.z + ez) / C);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = x * 100003 + z; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(c);
    }
    c._li = this.list.length; this.list.push(c);
    return c;
  }
  addAll(arr) { for (const c of arr) this.add(c); }
  remove(c) {
    const C = this.cell;
    const x0 = Math.floor((c.x - c.ex) / C), x1 = Math.floor((c.x + c.ex) / C), z0 = Math.floor((c.z - c.ez) / C), z1 = Math.floor((c.z + c.ez) / C);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const a = this.map.get(x * 100003 + z); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } }
    // O(1) swap-remove (tile streaming removes thousands per unload; list order doesn't matter)
    const L = this.list, i = c._li;
    if (i !== undefined && L[i] === c) { const last = L.pop(); if (last !== c) { L[i] = last; last._li = i; } c._li = undefined; }
  }
  // candidates overlapping the AABB around (x, z) with radius r; out array reused
  query(x, z, r, out = []) {
    out.length = 0;
    const C = this.cell, st = ++this.stamp;
    const x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C), z0 = Math.floor((z - r) / C), z1 = Math.floor((z + r) / C);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.map.get(cx * 100003 + cz); if (!a) continue;
      for (const c of a) {
        if (c.mark === st) continue; c.mark = st;
        if (Math.abs(c.x - x) > c.ex + r || Math.abs(c.z - z) > c.ez + r) continue;
        out.push(c);
      }
    }
    return out;
  }
  // point inside any collider (with y range)? returns the collider or null
  pointHit(x, y, z, pad = 0) {
    const arr = this.query(x, z, pad + 1, this._tmp || (this._tmp = []));
    for (const c of arr) {
      if (y < c.yMin || y > c.yMax) continue;
      const dx = x - c.x, dz = z - c.z;
      const lx = c.c * dx - c.s * dz, lz = c.s * dx + c.c * dz;
      if (Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad) return c;
    }
    return null;
  }
  // segment (x0,z0)->(x1,z1) at height y: returns t of first hit in [0,1] or 1 (camera occlusion, line of sight)
  raycast2D(x0, z0, x1, z1, y, pad = 0.2) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len < 1e-3) return 1;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const arr = this.query(mx, mz, len / 2 + 2, this._tmp2 || (this._tmp2 = []));
    let best = 1;
    for (const c of arr) {
      if (y < c.yMin || y > c.yMax) continue;
      // transform to local box space (local = R^-1 * (p - c)); world->local: lx = cos*dx - sin*dz, lz = sin*dx + cos*dz
      const ox = x0 - c.x, oz = z0 - c.z;
      const lox = c.c * ox - c.s * oz, loz = c.s * ox + c.c * oz;
      const ldx = c.c * dx - c.s * dz, ldz = c.s * dx + c.c * dz;
      let tmin = 0, tmax = 1;
      const hx = c.hx + pad, hz = c.hz + pad;
      if (Math.abs(ldx) < 1e-9) { if (Math.abs(lox) > hx) continue; } else {
        let t1 = (-hx - lox) / ldx, t2 = (hx - lox) / ldx; if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) continue;
      }
      if (Math.abs(ldz) < 1e-9) { if (Math.abs(loz) > hz) continue; } else {
        let t1 = (-hz - loz) / ldz, t2 = (hz - loz) / ldz; if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) continue;
      }
      if (tmin < best) best = tmin;
    }
    return best;
  }
}
