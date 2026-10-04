// Driving line: chevrons along the route ahead of the player, green -> yellow -> red by how much braking the next
// stretch needs at the current speed (curvature + braking envelope from util.speedLimits).
// Modes: 'full' | 'braking' (only where you need to slow down) | 'off'. One instanced draw call, ~64 instances.
import * as THREE from 'three';
import { routeAt, speedLimits } from './util.js';

const N = 64, STEP = 3.4;
export function createDrivingLine(F) {
  const { G } = F;
  // flat chevron pointing +Z, 1.6 m wide
  const s = new THREE.Shape();
  s.moveTo(-0.8, -0.35); s.lineTo(0, 0.35); s.lineTo(0.8, -0.35); s.lineTo(0.8, -0.02); s.lineTo(0, 0.68); s.lineTo(-0.8, -0.02); s.closePath();
  const geo = new THREE.ShapeGeometry(s); geo.rotateX(Math.PI / 2); // lie flat, tip toward +Z
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.count = 0; mesh.name = 'driving-line';
  const colA = new Float32Array(N * 3); mesh.instanceColor = new THREE.InstancedBufferAttribute(colA, 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mesh);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const a = {}, b = {};
  const GREEN = [0.25, 0.95, 0.45], YEL = [1.0, 0.82, 0.18], RED = [1.0, 0.18, 0.2];
  const L = { route: null, lim: null, mode: 'full', on: false };
  L.set = function (route, { latAcc = 9.5 } = {}) { L.route = route; L.lim = route ? speedLimits(route, latAcc) : null; L.on = !!route; if (!route) mesh.count = 0; };
  L.clear = () => L.set(null);
  // s: player's arc length on the route (lap-relative); v: player speed m/s
  L.update = function (s, v, maxS = Infinity) {
    const mode = F.S.drivingLine || 'full';
    if (!L.on || mode === 'off' || !L.route) { mesh.count = 0; return; }
    const R = L.route;
    const s0 = Math.ceil((s + 5) / STEP) * STEP;
    let k = 0;
    const night = G.env.night.value, bright = 1 + night * 0.6;
    for (let i = 0; i < N; i++) {
      const si = s0 + i * STEP;
      if (!R.loop && si > R.L - 1) break;
      if (si > maxS) break;
      routeAt(R, si, a);
      const lim = L.lim[a.i];
      const r = v / Math.max(1, lim);
      let c;
      if (r > 1.02) c = RED; else if (r > 0.9) c = YEL; else c = GREEN;
      if (mode === 'braking' && c === GREEN) continue;
      routeAt(R, si + 1.2, b);
      const pitch = Math.atan2(b.y - a.y, 1.2);
      _e.set(-pitch, Math.atan2(a.dx, a.dz), 0); _q.setFromEuler(_e);
      const fadeIn = Math.min(1, i / 3), fadeOut = Math.min(1, (N - i) / 10);
      const sc = 0.55 + 0.45 * Math.min(fadeIn, fadeOut);
      _s.set(sc, 1, sc);
      _p.set(a.x, a.y + 0.07, a.z);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
      colA[k * 3] = c[0] * bright; colA[k * 3 + 1] = c[1] * bright; colA[k * 3 + 2] = c[2] * bright;
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  };
  return L;
}
