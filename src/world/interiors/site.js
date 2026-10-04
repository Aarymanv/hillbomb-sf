// Site frame: converts a building's local layout (origin = footprint centre at floor level, front on local -Z)
// into world colliders, drivable decks, interaction points, door pairs, camera ceilings and "inside" volumes.
export class Site {
  constructor(G, def, fp, y0) {
    this.G = G; this.def = def; this.id = def.id; this.name = def.name;
    this.x = fp.x; this.z = fp.z; this.yaw = fp.yaw; this.hx = fp.hx; this.hz = fp.hz; this.y0 = y0;
    this.c = Math.cos(fp.yaw); this.s = Math.sin(fp.yaw);
    this.colliders = []; this.decks = []; this.inter = []; this.doors = []; this.ceilings = []; this.volumes = [];
    this.built = null; this.lightSpots = [];
  }
  // local (lx, lz) -> world [x, z]
  w(lx, lz) { return [this.x + this.c * lx + this.s * lz, this.z - this.s * lx + this.c * lz]; }
  // world -> local
  l(x, z) { const dx = x - this.x, dz = z - this.z; return [this.c * dx - this.s * dz, this.s * dx + this.c * dz]; }
  wyaw(ly) { return this.yaw + ly; }
  // static collider from a local axis-aligned box (x0..x1, z0..z1) spanning local y0..y1
  box(x0, z0, x1, z1, y0, y1, kind = 'interior') {
    const [cx, cz] = this.w((x0 + x1) / 2, (z0 + z1) / 2);
    const c = { x: cx, z: cz, hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, yaw: this.yaw, yMin: this.y0 + y0, yMax: this.y0 + y1, kind };
    this.colliders.push(c); return c;
  }
  // collider along a local segment a->b (thickness th), e.g. angled bay-window walls
  seg(ax, az, bx, bz, th, y0, y1, kind = 'interior') {
    const [cx, cz] = this.w((ax + bx) / 2, (az + bz) / 2);
    const L = Math.hypot(bx - ax, bz - az), ly = Math.atan2(-(bz - az), bx - ax); // local yaw that maps local +X onto a->b
    const c = { x: cx, z: cz, hx: L / 2, hz: th / 2, yaw: this.yaw + ly, yMin: this.y0 + y0, yMax: this.y0 + y1, kind };
    this.colliders.push(c); return c;
  }
  // drivable / walkable rectangle deck at local height y (axis-aligned in the local frame)
  floor(x0, z0, x1, z1, y, name = 'floor') {
    const alongZ = (z1 - z0) >= (x1 - x0);
    if (alongZ) return this.ramp([(x0 + x1) / 2, z0, y], [(x0 + x1) / 2, z1, y], x1 - x0, name);
    return this.ramp([x0, (z0 + z1) / 2, y], [x1, (z0 + z1) / 2, y], z1 - z0, name);
  }
  // straight deck from local a=[x,z,y] to b with a width; the ends are exact (terrain.deckAt pads t by 2%)
  ramp(a, b, width, name = 'ramp') {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = 0.02 / 1.04;
    const ax = a[0] + (b[0] - a[0]) * k, az = a[1] + (b[1] - a[1]) * k, bx = b[0] - (b[0] - a[0]) * k, bz = b[1] - (b[1] - a[1]) * k;
    const ay = a[2] + (b[2] - a[2]) * k, by = b[2] - (b[2] - a[2]) * k;
    void L;
    const [wax, waz] = this.w(ax, az), [wbx, wbz] = this.w(bx, bz);
    const d = { name: `${this.id}:${name}`, kind: 'interior', width, sidewalk: 0, rails: false, pts: [[wax, waz, this.y0 + ay], [wbx, wbz, this.y0 + by]] };
    this.decks.push(d); return d;
  }
  // interaction point: at = [lx, ly, lz]; o = {r, prompt(), use(), when()}
  interact(at, o) { const [x, z] = this.w(at[0], at[2]); const it = { site: this, x, z, y: this.y0 + at[1], r: o.r ?? 1.6, ...o }; this.inter.push(it); return it; }
  // door pair: out/in = [lx, lz, facingLocalYaw]; y = local floor height inside
  door(o) { this.doors.push({ site: this, ...o }); return o; }
  // camera ceiling: local rect whose underside is at local y
  ceiling(x0, z0, x1, z1, y) { this.ceilings.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y }); }
  // inside volume (local box) for camera clamping and real-light activation
  volume(x0, y0, z0, x1, y1, z1, o = {}) { this.volumes.push({ b: [x0, y0, z0, x1, y1, z1], ...o }); }
  // terrain height at a local point, relative to the floor level
  groundLocal(lx, lz) { const [x, z] = this.w(lx, lz); return this.G.world.heightAt(x, z) - this.y0; }
  // local point -> world vec
  wp(lx, ly, lz) { const [x, z] = this.w(lx, lz); return { x, y: this.y0 + ly, z }; }
  // is a world point inside one of the volumes? returns the volume or null
  inside(x, y, z, pad = 0) {
    const [lx, lz] = this.l(x, z), ly = y - this.y0;
    for (const v of this.volumes) { const b = v.b; if (lx > b[0] - pad && lx < b[3] + pad && lz > b[2] - pad && lz < b[5] + pad && ly > b[1] - 0.6 && ly < b[4]) return v; }
    return null;
  }
  // lowest ceiling above a local point
  ceilingAt(x, z, yRef) {
    const [lx, lz] = this.l(x, z), ly = yRef - this.y0;
    let best = Infinity;
    for (const c of this.ceilings) if (lx > c.x0 && lx < c.x1 && lz > c.z0 && lz < c.z1 && c.y > ly + 0.3 && c.y < best) best = c.y;
    return best === Infinity ? null : this.y0 + best;
  }
}
