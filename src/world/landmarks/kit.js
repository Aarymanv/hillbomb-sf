// Landmark construction kit: per-material geometry batching with vertex colours,
// shared materials, primitive helpers and collider bookkeeping.
// Every landmark builds into one Kit (its own THREE.Group, one mesh per material).
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// ---------- colours (sRGB hex -> linear working space) ----------
const colCache = new Map();
export function col(hex) {
  if (hex && hex.isColor) return hex;
  if (Array.isArray(hex)) return new THREE.Color().setRGB(hex[0], hex[1], hex[2]);
  let c = colCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
  return c;
}
export function mix(a, b, t) { return col(a).clone().lerp(col(b), t); }
export function shade(hex, k) { return col(hex).clone().multiplyScalar(k); }

// ---------- shared materials ----------
let MATS = null;
function ecolPatch(m, key) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 ecol;\nvarying vec3 vEcol;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcol = ecol;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEcol;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vEcol;');
  };
  m.customProgramCacheKey = () => key;
  return m;
}
export function mats() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  MATS = {
    solid: std({ roughness: 0.86, metalness: 0.0 }),
    paint: std({ roughness: 0.6, metalness: 0.12 }),
    steel: std({ roughness: 0.42, metalness: 0.55 }),
    gold: std({ roughness: 0.3, metalness: 1.0 }),
    // per-vertex emissive colour lives in the 'ecol' attribute; intensity driven by night
    glow: ecolPatch(std({ roughness: 0.35, metalness: 0.25, emissive: 0xffffff, emissiveIntensity: 0 }), 'lm-glow'),
    blink: ecolPatch(std({ roughness: 0.5, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0 }), 'lm-blink'),
    water: new THREE.MeshStandardMaterial({ color: 0x1f4f4c, roughness: 0.1, metalness: 0.25 }),
  };
  // glow surfaces are mostly facade decals (windows, clock faces): pull them toward the camera
  for (const k of ['glow', 'blink']) { MATS[k].polygonOffset = true; MATS[k].polygonOffsetFactor = -1; MATS[k].polygonOffsetUnits = -4; }
  MATS.solid.name = 'lm-solid'; MATS.paint.name = 'lm-paint'; MATS.steel.name = 'lm-steel';
  MATS.gold.name = 'lm-gold'; MATS.glow.name = 'lm-glow'; MATS.blink.name = 'lm-blink'; MATS.water.name = 'lm-water';
  return MATS;
}
const EMISSIVE_KEYS = new Set(['glow', 'blink']);
const NO_SHADOW_KEYS = new Set(['glow', 'blink', 'water']);

// Shared material animation (idempotent; every landmark's update may call it).
export function updateShared(env) {
  const M = mats();
  const night = env.night || 0, t = env.time || 0;
  M.glow.emissiveIntensity = night;
  // aviation lights: slow, soft pulse (~5 s period, never fully off: no strobing)
  const ph = 0.5 + 0.5 * Math.sin(t * 1.2);
  const pulse = 0.35 + 0.65 * smooth(0.3, 0.9, ph);
  M.blink.emissiveIntensity = (0.35 + 1.4 * night) * pulse;
}
export function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---------- canvas helper (works in the browser; returns null elsewhere) ----------
export function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function canvasTex(canvas, { repeat = true, srgb = true } = {}) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- geometry batch (typed-array accumulator) ----------
class Batch {
  constructor(emissive) {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.ecol = emissive ? [] : null; this.n = 0;
  }
  push(geom, m, color, ecol) {
    const P = geom.attributes.position, N = geom.attributes.normal, U = geom.attributes.uv;
    const cnt = P.count, base = this.n;
    if (m) _nm.getNormalMatrix(m);
    const flip = m ? m.determinant() < 0 : false;
    const fn = typeof color === 'function' ? color : null;
    const cc = fn ? null : col(color == null ? 0xffffff : color);
    const ec = ecol == null ? null : (typeof ecol === 'function' ? null : col(ecol));
    for (let i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(P, i); if (m) _v.applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, i); if (m) _n.applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z); }
      else this.nor.push(0, 1, 0);
      if (U) this.uv.push(U.getX(i), U.getY(i)); else this.uv.push(0, 0);
      if (fn) { const c = col(fn(_v.x, _v.y, _v.z)); this.col.push(c.r, c.g, c.b); }
      else this.col.push(cc.r, cc.g, cc.b);
      if (this.ecol) {
        if (ec) this.ecol.push(ec.r, ec.g, ec.b);
        else if (typeof ecol === 'function') { const c = col(ecol(_v.x, _v.y, _v.z)); this.ecol.push(c.r, c.g, c.b); }
        else this.ecol.push(0, 0, 0);
      }
    }
    const I = geom.index;
    if (I) {
      for (let i = 0; i < I.count; i += 3) {
        const a = I.getX(i), b = I.getX(i + 1), c = I.getX(i + 2);
        if (flip) this.idx.push(base + a, base + c, base + b); else this.idx.push(base + a, base + b, base + c);
      }
    } else {
      for (let i = 0; i < cnt; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1); else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    this.n += cnt;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.ecol) g.setAttribute('ecol', new THREE.Float32BufferAttribute(this.ecol, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ---------- cached unit primitives ----------
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function unitCyl(ratio, seg, open) {
  const k = `${ratio.toFixed(4)}|${seg}|${open ? 1 : 0}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open); g.translate(0, 0.5, 0); cylCache.set(k, g); }
  return g;
}

// ---------- the Kit ----------
// frame: world placement of the landmark's local frame. Local +X = right, -Z = front (CONVENTIONS),
// yaw about +Y. Local y is ABSOLUTE world height (the group sits at y = 0).
export class Kit {
  constructor(name, { x = 0, z = 0, yaw = 0, heightAt = () => 0 } = {}) {
    this.name = name; this.fx = x; this.fz = z; this.yaw = yaw;
    this.cy = Math.cos(yaw); this.sy = Math.sin(yaw);
    this.heightAt = heightAt;
    this.batches = new Map(); this.custom = new Map();
    this.colliders = []; this.updaters = []; this.objects = [];
    this.group = new THREE.Group(); this.group.name = 'landmark:' + name;
    this.group.position.set(x, 0, z); this.group.rotation.y = yaw;
  }
  // local -> world XZ
  w(lx, lz) { return [this.fx + this.cy * lx + this.sy * lz, this.fz - this.sy * lx + this.cy * lz]; }
  // world -> local XZ
  l(wx, wz) { const dx = wx - this.fx, dz = wz - this.fz; return [this.cy * dx - this.sy * dz, this.sy * dx + this.cy * dz]; }
  h(lx, lz) { const [wx, wz] = this.w(lx, lz); return this.heightAt(wx, wz); }
  // min/max ground over a local oriented rectangle (centre cx,cz half hx,hz, local yaw ry), sampled on a grid
  hRange(cx, cz, hx, hz, ry = 0, n = 3) {
    let lo = Infinity, hi = -Infinity; const c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const ax = (i / n * 2 - 1) * hx, az = (j / n * 2 - 1) * hz;
      const y = this.h(cx + c * ax + s * az, cz - s * ax + c * az);
      if (y < lo) lo = y; if (y > hi) hi = y;
    }
    return [lo, hi];
  }
  register(key, material, { emissive = false, castShadow = true, receiveShadow = true } = {}) {
    this.custom.set(key, { material, emissive, castShadow, receiveShadow });
  }
  batch(key) {
    let b = this.batches.get(key);
    if (!b) {
      const cu = this.custom.get(key);
      b = new Batch(cu ? cu.emissive : EMISSIVE_KEYS.has(key));
      this.batches.set(key, b);
    }
    return b;
  }
  geom(key, geometry, matrix, color, ecol) { this.batch(key).push(geometry, matrix || null, color, ecol); }
  // axis-aligned (in local frame) box centred at (x,y,z) with optional yaw / tilt
  box(key, x, y, z, sx, sy, sz, color, o = {}) {
    _e.set(o.rx || 0, o.yaw || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.batch(key).push(UNIT_BOX, _m, color, o.ecol);
  }
  // box from y0 up to y1 (convenient for walls/columns)
  boxY(key, x, y0, y1, z, sx, sz, color, o = {}) { this.box(key, x, (y0 + y1) / 2, z, sx, y1 - y0, sz, color, o); }
  // beam of width w (horizontal-ish side) and height h between points a and b
  beam(key, a, b, w, h, color, o = {}) {
    _z.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _z.length(); if (len < 1e-4) return; _z.divideScalar(len);
    const up = o.up || (Math.abs(_z.y) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    _y.set(up[0], up[1], up[2]);
    _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x).normalize();
    _m.makeBasis(_x, _y, _z); _m.scale(_s.set(w, h, len));
    _m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.batch(key).push(UNIT_BOX, _m, color, o.ecol);
  }
  // cylinder / frustum standing on (x,y0,z)
  cyl(key, x, y0, z, rBot, rTop, h, seg, color, o = {}) {
    const g = unitCyl(rBot > 0 ? rTop / rBot : 1, seg, !!o.open);
    _e.set(o.rx || 0, o.yaw || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y0, z), _q, _s.set(rBot, h, rBot));
    this.batch(key).push(g, _m, color, o.ecol);
  }
  // cylinder between two points (rods, cables)
  rod(key, a, b, r, seg, color, o = {}) {
    _y.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _y.length(); if (len < 1e-4) return; _y.divideScalar(len);
    _q.setFromUnitVectors(_z.set(0, 1, 0), _y);
    _m.compose(_p.set(a[0], a[1], a[2]), _q, _s.set(r, len, r));
    this.batch(key).push(unitCyl(1, seg, true), _m, color, o.ecol);
  }
  // arbitrary geometry placed with position / yaw / scale
  place(key, geometry, x, y, z, color, o = {}) {
    _e.set(o.rx || 0, o.yaw || 0, o.rz || 0, o.order || 'YXZ'); _q.setFromEuler(_e);
    const sc = o.scale; if (Array.isArray(sc)) _s.set(sc[0], sc[1], sc[2]); else _s.setScalar(sc || 1);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.batch(key).push(geometry, _m, color, o.ecol);
  }
  // collider given in LOCAL frame -> world oriented box
  collider(lx, lz, hx, hz, lyaw, yMin, yMax) {
    const [x, z] = this.w(lx, lz);
    this.colliders.push({ x, z, hx, hz, yaw: this.yaw + (lyaw || 0), yMin, yMax });
  }
  onUpdate(fn) { this.updaters.push(fn); }
  add(obj) { this.objects.push(obj); }
  finish() {
    const M = mats();
    let tris = 0;
    for (const [key, b] of this.batches) {
      if (!b.n) continue;
      const cu = this.custom.get(key);
      const mat = cu ? cu.material : M[key];
      if (!mat) throw new Error('landmarks: unknown material ' + key);
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = this.name + ':' + key;
      mesh.castShadow = cu ? cu.castShadow : !NO_SHADOW_KEYS.has(key);
      mesh.receiveShadow = cu ? cu.receiveShadow : key !== 'blink';
      mesh.matrixAutoUpdate = false;
      tris += b.idx.length / 3;
      this.group.add(mesh);
    }
    for (const o of this.objects) this.group.add(o);
    this.group.updateMatrixWorld(true);
    this.batches.clear();
    const ups = this.updaters;
    return {
      name: this.name, group: this.group, colliders: this.colliders, triangles: tris,
      update(dt, env = {}) { updateShared(env); for (const f of ups) f(dt, env); },
    };
  }
}

// ---------- shape helpers ----------
// flat arch (rect + semicircle) in the XY plane, facing +Z, bottom at y=0, centred on x
export function archGeom(w, h, seg = 6) {
  const r = w / 2, s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, seg);
}
// pointed gothic arch
export function gothicGeom(w, h, seg = 5) {
  const r = w / 2, s = new THREE.Shape(), sp = h - w * 0.866;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, sp);
  s.absarc(-r, sp, w, 0, Math.PI / 3, false);
  s.absarc(r, sp, w, Math.PI * 2 / 3, Math.PI, false);
  s.lineTo(-r, 0);
  return new THREE.ShapeGeometry(s, seg);
}
export function discGeom(r, seg = 24) { const g = new THREE.CircleGeometry(r, seg); return g; }
// closed extruded polygon (pts [[x,y]...] CCW in the XY plane), depth along +Z from 0..d
export function prismGeom(pts, d) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 4 });
}
// rounded-rectangle ring (XZ) with n points per corner; winding = clockwise in the (x,z) plane,
// which is what loftGeom needs for outward-facing walls
export function roundedRing(hx, hz, r, n = 4) {
  const pts = [];
  const cs = [[hx - r, hz - r, Math.PI / 2], [hx - r, -hz + r, 0], [-hx + r, -hz + r, -Math.PI / 2], [-hx + r, hz - r, Math.PI]];
  for (const [cx, cz, a0] of cs) for (let i = 0; i <= n; i++) {
    const a = a0 - (i / n) * Math.PI / 2; // clockwise in math coords == CCW seen from +Y with z south
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}
// side walls lofted between two rings (same point count), optional caps; uv u = arc length, v = y
export function loftGeom(ringA, yA, ringB, yB, { capTop = false, capBottom = false, closed = true } = {}) {
  const n = ringA.length, pos = [], uv = [], idx = [];
  let arcA = 0;
  const segs = closed ? n : n - 1;
  for (let i = 0; i <= segs; i++) {
    const a = ringA[i % n], b = ringB[i % n];
    if (i > 0) { const p = ringA[(i - 1) % n]; arcA += Math.hypot(a[0] - p[0], a[1] - p[1]); }
    pos.push(a[0], yA, a[1], b[0], yB, b[1]);
    uv.push(arcA, yA, arcA, yB);
  }
  for (let i = 0; i < segs; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  let out = g.toNonIndexed(); out.computeVertexNormals();
  if (capTop || capBottom) {
    const parts = [out];
    if (capTop) parts.push(capGeom(ringB, yB, true));
    if (capBottom) parts.push(capGeom(ringA, yA, false));
    out = concatNonIndexed(parts);
  }
  return out;
}
export function capGeom(ring, y, up) {
  let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
  const pos = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (up) pos.push(cx, y, cz, a[0], y, a[1], b[0], y, b[1]); else pos.push(cx, y, cz, b[0], y, b[1], a[0], y, a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}
export function concatNonIndexed(list) {
  const pos = [], nor = [], uv = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array); else uv.push(...new Array(g.attributes.position.count * 2).fill(0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// check that the loft ring winding makes outward normals; roundedRing order gives outward faces with loftGeom
export { THREE };

// ---------- extra helpers used by several landmarks ----------
// gable volume (walls' triangle + two roof slabs). Ridge along local Z unless alongX. y0 = eave height.
Kit.prototype.gable = function (wallKey, roofKey, cx, cz, hx, hz, y0, rise, wallColor, roofColor, o = {}) {
  const alongX = !!o.alongX, over = o.over == null ? 0.45 : o.over, th = o.th || 0.3;
  const a = hx, b = hz; // a = half-width across the ridge, b = half-length along it
  const tri = prismGeom([[-a, 0], [a, 0], [0, rise]], b * 2);
  const yaw = (o.yaw || 0) + (alongX ? Math.PI / 2 : 0);
  // prism extrudes along +Z from 0..2b -> centre it
  tri.translate(0, 0, -b);
  this.place(wallKey, tri, cx, y0, cz, wallColor, { yaw });
  const ang = Math.atan2(rise, a), len0 = Math.hypot(a, rise);
  const sn = Math.sin(ang), cs = Math.cos(ang);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const sg of [-1, 1]) {
    // slab centre = slope midpoint + normal * th/2 + (towards the eave) * over/2, in the gable frame
    const lx = sg * a / 2 + sg * sn * th / 2 + sg * cs * over / 2;
    const ly = y0 + rise / 2 + cs * th / 2 - sn * over / 2;
    this.box(roofKey, cx + c * lx, ly, cz - s * lx, len0 + over, th, b * 2 + over * 2, roofColor, { yaw, rz: -sg * ang });
  }
};
// flat geometry (XZ, local frame) draped on the terrain
Kit.prototype.drape = function (key, geometry, cx, cz, off, color, o = {}) {
  const g = geometry.clone();
  if (!o.alreadyFlat) g.rotateX(-Math.PI / 2);
  if (o.yaw) g.rotateY(o.yaw);
  g.translate(cx, 0, cz);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, this.h(P.getX(i), P.getZ(i)) + off);
  g.computeVertexNormals();
  this.geom(key, g, null, color, o.ecol);
};
// ring of points (clockwise in the (x,z) plane, as loftGeom expects) for a star / fluted column
export function flutedRing(r, depth, flutes) {
  const pts = [], n = flutes * 2;
  for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2, rr = i % 2 ? r - depth : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return pts;
}
export function circleRing(r, n) {
  const pts = []; for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts;
}
// deterministic PRNG (so landmarks look identical every run)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// night emissive for one window: some dark, most warm at varying brightness
export function winLit(r, base = [1.6, 1.15, 0.6], pOff = 0.3) {
  const u = r();
  if (u < pOff) return [base[0] * 0.04, base[1] * 0.04, base[2] * 0.04];
  const k = 0.45 + 0.75 * r(), cool = r() < 0.15;
  return cool ? [base[0] * 0.75 * k, base[1] * 0.95 * k, base[2] * 1.6 * k] : [base[0] * k, base[1] * k, base[2] * k];
}
