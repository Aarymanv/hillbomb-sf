// HILLBOMB: hand-held pedestrian props (tools/blender/peds/build_props.py -> public/assets/peds/props.glb):
// smartphone with a lit screen, open / furled umbrellas (rain), paper coffee cup, shopping bag, briefcase.
// Each RealHuman owns a HeldProps (meshes created on first use, parented to its rig, placed from the hand bones
// every animated frame). Hanging props (bag, briefcase, furled umbrella) stay vertical in world space and swing
// a little behind the hand; the cup is held upright in the palm.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = (import.meta.env?.BASE_URL || './') + 'assets/peds/';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
let GEO = null, loading = null, night = 0;
const MAT = {};
export const UMB_COLORS = [0x15171c, 0x5a1418, 0x1b2f52, 0x2c2c2c, 0x7a1a1e, 0x23452e, 0x3b2a4f, 0x8a6a2a];
export const BAG_COLORS = [0xb08a5a, 0xe9e6df, 0x1d1d1f, 0x8e2a2a, 0xa8b8c4, 0xc49a62];

export function loadProps() {
  if (loading) return loading;
  loading = new GLTFLoader().loadAsync(BASE + 'props.glb').then(g => {
    GEO = {};
    g.scene.traverse(o => { if (o.isMesh) { GEO[o.name] = o.geometry; o.material?.dispose?.(); } });
    const vc = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, ...o });
    MAT.phone = vc({ roughness: 0.28, metalness: 0.35 });
    MAT.screen = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.12, metalness: 0, emissive: 0xffffff, emissiveMap: screenTex(), emissiveIntensity: 0.9 });
    MAT.frame = vc({ roughness: 0.4, metalness: 0.5 });
    MAT.cup = vc({ roughness: 0.55 });
    MAT.case = vc({ roughness: 0.45, metalness: 0.1 });
    MAT.canopy = UMB_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, side: THREE.DoubleSide }));
    MAT.closed = UMB_COLORS.map(c => vc({ color: c, roughness: 0.45 }));
    MAT.bag = BAG_COLORS.map(c => vc({ color: c, roughness: 0.8 }));
    return GEO;
  }).catch(e => { console.warn('[peds] props', e); GEO = null; });
  return loading;
}

/** 0 = day .. 1 = night (phone screens glow brighter after dark) */
export function setPropNight(n) {
  if (Math.abs(n - night) < 0.01) return;
  night = n;
  if (MAT.screen) MAT.screen.emissiveIntensity = 0.55 + 1.6 * n;
}

// a phone app (messages / map / feed), drawn once
function screenTex() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 192;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#eef3fb'); g.addColorStop(1, '#dfe8f5');
  x.fillStyle = g; x.fillRect(0, 0, 96, 192);
  x.fillStyle = '#2f6fe0'; x.fillRect(0, 0, 96, 22);
  x.fillStyle = '#ffffff'; x.fillRect(8, 8, 40, 6);
  const rows = [[10, 30, 52, '#ffffff'], [36, 48, 50, '#3b82f6'], [10, 70, 60, '#ffffff'], [10, 92, 44, '#ffffff'], [30, 114, 56, '#3b82f6'], [10, 136, 58, '#ffffff']];
  for (const [x0, y, w, col] of rows) { x.fillStyle = col; x.beginPath(); x.roundRect?.(x0, y, w, 16, 6); if (!x.roundRect) x.rect(x0, y, w, 16); x.fill(); }
  x.fillStyle = '#c9d4e6'; x.fillRect(6, 170, 84, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  return t;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(), _m = new THREE.Matrix4();
const PHONE_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

export class HeldProps {
  constructor(rig, seed) {
    this.rig = rig; this.m = {}; this.seed = seed;
    this.swing = { x: 0, z: 0, vx: 0, vz: 0, px: null, pz: 0 };
    if (!GEO) loadProps();
  }
  _mesh(key, geo, mat, cast = true) {
    let o = this.m[key];
    if (o) return o;
    if (!GEO) return null;
    if (Array.isArray(geo)) {
      o = new THREE.Group();
      for (const [gk, mt] of geo) { const me = new THREE.Mesh(GEO[gk], mt); me.castShadow = cast; o.add(me); }
    } else { o = new THREE.Mesh(GEO[geo], mat); o.castShadow = cast; }
    o.matrixAutoUpdate = false; o.visible = false; o.name = 'pedProp_' + key;
    this.rig.add(o); this.m[key] = o;
    return o;
  }
  hideAll() { for (const k in this.m) this.m[k].visible = false; }

  /**
   * h: the RealHuman (WQ / WP of the last FK, BN indices), want: { phone: hand | null, umb: 'open' | 'closed' | null,
   * carry: 'cup' | 'bag' | 'case' | null, carryHand: bone }, dt, near: show small props
   */
  update(h, want, dt, near, BN) {
    if (!GEO) { if (!loading) loadProps(); return; }
    const pick = (a) => a[Math.floor(this.seed * 997) % a.length];
    const show = {};
    // phone in the hand (screen to the face)
    if (want.phone != null && near) {
      const o = this._mesh('phone', [['phone', MAT.phone], ['phone_screen', MAT.screen]]);
      if (o) {
        const left = want.phone === BN.LHand;
        h._boneMatrix(want.phone, o.matrix, -0.075, 0.012, left ? 0.022 : -0.022, left ? PHONE_ROT_L : PHONE_ROT);
        o.matrixWorldNeedsUpdate = true; show.phone = 1;
      }
    }
    // open umbrella: the Rocketbox umbrella clips hold it in the left hand in front of the chest, shaft upright
    if (want.umb === 'open') {
      const o = this._mesh('umbOpen', [['umb_canopy', pick(MAT.canopy)], ['umb_frame', MAT.frame]]);
      if (o) {
        const b = BN.LHand;
        _v.fromArray(h.WP, b * 3); _v2.set(-0.05, 0, 0).applyQuaternion(_q.fromArray(h.WQ, b * 4)); _v.add(_v2); _v.y -= 0.03;
        this._upright(h, _q2, -0.1, 0, -0.06);
        o.matrix.compose(_v, _q2, _s); o.matrixWorldNeedsUpdate = true; show.umbOpen = 1;
      }
    }
    // hanging things: furled umbrella (right hand, like a cane), bag / briefcase (carry hand)
    const hang = (key, geo, mat, b, lat) => {
      const o = this._mesh(key, geo, mat); if (!o) return;
      _q.fromArray(h.WQ, b * 4);
      _v.fromArray(h.WP, b * 3); _v2.set(-0.07, 0.0, 0).applyQuaternion(_q); _v.add(_v2);   // grip ~ mid fingers
      _v.x += lat;
      this._swing(_v, dt);
      this._upright(h, _q2, this.swing.x, Math.PI / 2, this.swing.z);
      o.matrix.compose(_v, _q2, _s); o.matrixWorldNeedsUpdate = true; show[key] = 1;
    };
    if (want.umb === 'closed' && near) hang('umbClosed', 'umb_closed', pick(MAT.closed), BN.RHand, 0.01);
    if (want.carry === 'bag' && near) hang('bag', 'bag', pick(MAT.bag), want.carryHand, want.carryHand === BN.LHand ? -0.035 : 0.035);
    if (want.carry === 'case' && near) hang('case', 'case', MAT.case, want.carryHand, want.carryHand === BN.LHand ? -0.03 : 0.03);
    if (want.carry === 'cup' && near) {
      const o = this._mesh('cup', 'cup', MAT.cup);
      if (o) {
        const b = BN.RHand; _q.fromArray(h.WQ, b * 4);
        _v.fromArray(h.WP, b * 3); _v2.set(-0.07, -0.02, -0.015).applyQuaternion(_q); _v.add(_v2);
        this._upright(h, _q2, 0, 0, 0);
        o.matrix.compose(_v, _q2, _s); o.matrixWorldNeedsUpdate = true; show.cup = 1;
      }
    }
    for (const k in this.m) { const v = !!show[k]; if (this.m[k].visible !== v) this.m[k].visible = v; }
  }

  // rig-space rotation that is world-upright (rig tilt on slopes / anchors removed), yaw = the body's facing + yawOff
  _upright(h, out, rx, yawOff, rz) {
    this.rig.getWorldQuaternion(_q);
    _q.invert();                                          // world -> rig
    // body facing in world: rig yaw (anchor or root)
    const yaw = (h.anchor ? h.anchor.yaw : h.rw ? h.rw.yaw : 0) + yawOff;
    out.setFromEuler(_e.set(rx, yaw, rz, 'YXZ'));
    return out.premultiply(_q);
  }

  // hanging props lag the hand a little (critically-damped spring on the lean angle)
  _swing(p, dt) {
    const S = this.swing;
    if (S.px === null || dt <= 0) { S.px = p.x; S.pz = p.z; return; }
    const vx = (p.x - S.px) / dt, vz = (p.z - S.pz) / dt; S.px = p.x; S.pz = p.z;
    const tx = clamp(vz * 0.12, -0.35, 0.35), tz = clamp(-vx * 0.12, -0.35, 0.35);
    const k = 40, d = 9;
    S.vx += ((tx - S.x) * k - S.vx * d) * dt; S.vz += ((tz - S.z) * k - S.vz * d) * dt;
    S.x += S.vx * dt; S.z += S.vz * dt;
  }

  dispose() { for (const k in this.m) this.rig.remove(this.m[k]); this.m = {}; }
}
const PHONE_ROT_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, -Math.PI / 2));
