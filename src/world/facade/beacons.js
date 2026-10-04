// Red aviation beacons on tall towers: one Points draw, blinking in the shader, only visible at dusk / night.
import * as THREE from 'three';

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.8)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeBeacons(specs, time, night) {
  const pos = [], ph = [];
  for (const sp of specs) {
    if (!sp.beaconsCorner) continue;
    // real skylines: aviation lights only on the tall towers (FAA ~60 m+), one light per corner at most, no mid-roof clutter
    const top = Math.max(...sp.beaconsCorner.map(p => p[1]));
    if (top < 60) continue;
    const pts = top > 120 ? [...sp.beaconsCorner, ...(sp.beacons || []).slice(0, 2)] : sp.beaconsCorner.slice(0, 2);
    for (const [u, v, d, inset] of pts) {
      // same frame as far.js frames(sp, F, 0, inset): origin at local (hx - inset, zf + inset), t = local -X, n = front
      const lx = sp.hx - inset - u, lz = -sp.hz + sp.setback + inset - d;
      pos.push(sp.x + sp.c * lx + sp.s * lz, sp.y0 + v + 0.4, sp.z - sp.s * lx + sp.c * lz);
      ph.push((sp.id * 0.137) % 1);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  const m = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: glow(), color: new THREE.Color(1.9, 0.14, 0.08), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time; sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh; uniform float uTime; uniform float uNight; varying float vBl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBl = step(0.55, fract(uTime * 0.5 + aPh)) * smoothstep(0.15, 0.6, uNight);')
      // distance: dots shrink to ~2 px and dim past ~500 m, so a skyline across the bay is pinpricks, not a red blob
      .replace('#include <project_vertex>', '#include <project_vertex>\nfloat bD = -mvPosition.z; gl_PointSize = size * clamp(260.0 / max(bD, 1.0), 0.22, 1.0); vBl *= clamp(700.0 / max(bD, 1.0), 0.12, 1.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBl;')
      .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\ngl_FragColor.rgb *= vBl; gl_FragColor.a *= vBl;');
  };
  const p = new THREE.Points(g, m);
  p.name = 'bld-beacons'; p.frustumCulled = false; p.matrixAutoUpdate = false; p.renderOrder = 2;
  return p;
}
