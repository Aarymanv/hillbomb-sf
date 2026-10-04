// Pooled GPU particles (one Points draw call per blend mode): tyre smoke, dust, engine smoke, sparks, splashes, flames.
import * as THREE from 'three';

function smokeTexture() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  // soft puffy blob: several offset radial gradients
  for (let i = 0; i < 7; i++) {
    const r = n * (0.16 + Math.random() * 0.12), cx = n / 2 + (Math.random() - 0.5) * n * 0.22, cy = n / 2 + (Math.random() - 0.5) * n * 0.22;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
  }
  // circular mask so nothing touches the sprite's square edge
  const img = x.getImageData(0, 0, n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2);
    const m = d >= 1 ? 0 : d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45;
    img.data[(j * n + i) * 4 + 3] *= m * m;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sparkTexture() {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,220,160,0.8)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
}

class Pool {
  constructor(scene, max, map, blending, depthTest = true) {
    this.max = max; this.n = 0; this.cursor = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.col = new Float32Array(max * 4);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.size = new Float32Array(max); this.grow = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.alpha0 = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('pcolor', this.aCol); geo.setAttribute('psize', this.aSize); geo.setAttribute('prot', this.aRot);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScreen: { value: 900 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 0 }, fogFar: { value: 0 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; attribute float prot; varying vec4 vCol; varying float vRot;
        uniform float uScreen;
        void main(){ vCol = pcolor; vRot = prot; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScreen / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vCol; varying float vRot;
        void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot); c = mat2(co, -s, s, co) * c + 0.5; vec4 t = texture2D(map, c); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); }`,
      transparent: true, depthWrite: false, depthTest, blending, fog: false,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.rot = new Float32Array(max); this.spin = new Float32Array(max);
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, drag = 1.5, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.size[i] = size; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.alpha0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav; this.rot[i] = Math.random() * 6.28; this.spin[i] = (Math.random() - 0.5) * 1.5;
  }
  update(dt, screen) {
    this.mat.uniforms.uScreen.value = screen;
    let n = 0;
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array, Rr = this.aRot.array;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) continue;
      const d = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      P[n * 3] = this.p[i * 3]; P[n * 3 + 1] = this.p[i * 3 + 1]; P[n * 3 + 2] = this.p[i * 3 + 2];
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      C[n * 4] = this.col[i * 4]; C[n * 4 + 1] = this.col[i * 4 + 1]; C[n * 4 + 2] = this.col[i * 4 + 2]; C[n * 4 + 3] = this.alpha0[i] * fade;
      S[n] = this.size[i] + this.grow[i] * this.age[i];
      Rr[n] = this.rot[i];
      n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
  }
}

export function createParticles(scene) {
  const smoke = new Pool(scene, 1400, smokeTexture(), THREE.NormalBlending);
  const glow = new Pool(scene, 500, sparkTexture(), THREE.AdditiveBlending);
  return {
    smoke, glow,
    tyreSmoke(x, y, z, vx, vz, amount, lit = 1) {
      const c = 0.82 * lit;
      smoke.emit(x + (Math.random() - 0.5) * 0.4, y + 0.25, z + (Math.random() - 0.5) * 0.4, vx * 0.25 + (Math.random() - 0.5), 0.6 + Math.random() * 0.6, vz * 0.25 + (Math.random() - 0.5),
        1.6 + Math.random() * 1.4, 0.9, 2.4, c * 0.92, c * 0.92, c * 0.95, 0.2 * amount, 1.4, -0.15);
    },
    dust(x, y, z, vx, vz, amount, col = [0.55, 0.47, 0.36]) {
      smoke.emit(x, y + 0.2, z, vx * 0.3 + (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), vz * 0.3 + (Math.random() - 0.5) * 1.5, 1.2 + Math.random(), 0.8, 2.2, col[0], col[1], col[2], 0.35 * amount, 1.2, 0.2);
    },
    engineSmoke(x, y, z, dark) {
      const c = dark ? 0.12 : 0.55;
      smoke.emit(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 2 + Math.random(), 0.6, 1.8, c, c, c, dark ? 0.55 : 0.3, 0.8, -0.3);
    },
    sparks(x, y, z, vx, vy, vz, n = 12) {
      for (let i = 0; i < n; i++) glow.emit(x, y, z, vx + (Math.random() - 0.5) * 8, vy + Math.random() * 5, vz + (Math.random() - 0.5) * 8, 0.25 + Math.random() * 0.35, 0.18, -0.2, 1.6, 0.9, 0.45, 1, 0.8, 9.8);
    },
    splash(x, y, z, n = 40) {
      for (let i = 0; i < n; i++) smoke.emit(x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, 4 + Math.random() * 6, (Math.random() - 0.5) * 5, 1.2 + Math.random() * 0.6, 0.8, 1.5, 0.9, 0.95, 1, 0.55, 0.6, 9.8);
    },
    // wet-road spray behind a tyre (weather.js): a fine mist thrown up and back, drifting with the air behind the car
    spray(x, y, z, vx, vz, amount = 1, lit = 1) {
      const c = 0.72 * lit;
      smoke.emit(x + (Math.random() - 0.5) * 0.5, y + 0.15 + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.5,
        vx * 0.45 + (Math.random() - 0.5) * 2.2, 0.9 + Math.random() * 1.6, vz * 0.45 + (Math.random() - 0.5) * 2.2,
        0.55 + Math.random() * 0.6, 0.45, 2.8, c * 0.95, c * 0.97, c, 0.16 * amount, 2.6, 0.4);
    },
    flame(x, y, z, vx, vz) {
      for (let i = 0; i < 4; i++) glow.emit(x, y, z, vx * 3 + (Math.random() - 0.5), (Math.random()) * 0.5, vz * 3 + (Math.random() - 0.5), 0.12 + Math.random() * 0.1, 0.35, 1.5, 1.6, 0.6, 0.15, 1, 2, 0);
    },
    update(dt, camera, renderer) {
      const h = renderer.domElement.height;
      const screen = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      smoke.update(dt, screen); glow.update(dt, screen);
    },
  };
}
