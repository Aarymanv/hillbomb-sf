// Garage studio: the 3D showroom the garage screens render through G.renderOverride (main.js). Own scene + camera:
// dark cyclorama, softbox environment map (PMREM of an emissive light rig), polished floor with a mirrored
// reflection of the car, turntable with an LED ring, contact shadow, orbit with mouse / wheel / right stick.
import * as THREE from 'three';
import { CARS, buildDef, getSpec, buildModel } from '../../vehicle/cars.js';

const TT_Y = 0.07;

export function createStudio(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = null;
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);

  // ---------------------------------------------------------------- environment: softbox rig -> PMREM
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050507);
  const panel = (w, h, I, col, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); envScene.add(m); return m;
  };
  panel(9, 3.2, 16, 0xfff4e8, [0, 7.5, 0], [Math.PI / 2, 0, 0]);              // big overhead softbox
  panel(1.1, 5, 22, 0xe8f0ff, [-7.5, 3, -1.5], [0, Math.PI / 2, 0]);          // left strip
  panel(1.1, 5, 22, 0xfff0e0, [7.5, 3, 1.5], [0, -Math.PI / 2, 0]);           // right strip
  panel(1.1, 5, 12, 0xffffff, [-5, 3, 7], [0, Math.PI * 0.8, 0]);            // rear kickers
  panel(1.1, 5, 12, 0xffffff, [5, 3, -7], [0, -Math.PI * 0.2, 0]);
  panel(8, 1.0, 10, 0xffffff, [0, 2.4, 9], [0, Math.PI, 0]);                  // back rim
  panel(8, 1.0, 6, 0xdfe8ff, [0, 2.0, -9], [0, 0, 0]);                        // front fill
  const envWall = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 12, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide }));
  envWall.position.y = 5; envScene.add(envWall);
  const envFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x1b1c20 }));
  envFloor.rotation.x = -Math.PI / 2; envScene.add(envFloor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.035);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();

  // ---------------------------------------------------------------- lights
  const key = new THREE.DirectionalLight(0xfff6ec, 1.5);
  key.position.set(3.5, 9, 4.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
  scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(0xcfd8ff, 0x1a1512, 0.2);
  scene.add(fill);
  const rim = new THREE.SpotLight(0xbfd4ff, 30, 30, 0.5, 0.8, 1.4);
  rim.position.set(-5, 5, 7); scene.add(rim, rim.target);

  // ---------------------------------------------------------------- set: cyclorama, floor, turntable
  const grad = document.createElement('canvas'); grad.width = 8; grad.height = 256;
  { const g = grad.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#030304'); gr.addColorStop(0.45, '#101218'); gr.addColorStop(0.78, '#2a2d35'); gr.addColorStop(0.9, '#1e2027'); gr.addColorStop(1, '#101115'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); }
  const gradTex = new THREE.CanvasTexture(grad); gradTex.colorSpace = THREE.SRGBColorSpace;
  const cyc = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 18, 64, 1, true), new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.BackSide, fog: false }));
  cyc.position.y = 8.9; scene.add(cyc);
  // polished floor: transparent over the mirrored car, more opaque away from the centre
  const fa = document.createElement('canvas'); fa.width = fa.height = 256;
  { const g = fa.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#b8b8b8'); gr.addColorStop(0.35, '#cfcfcf'); gr.addColorStop(0.75, '#f4f4f4'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const faTex = new THREE.CanvasTexture(fa);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.62, metalness: 0.0, transparent: true, alphaMap: faTex, opacity: 1, envMapIntensity: 0.12 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 96), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.renderOrder = 1; scene.add(floor);
  // visible light rig in the background (the same softboxes the environment map was baked from)
  const rigMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6ee).multiplyScalar(1.4), fog: false });
  const frMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
  for (let i = 0; i < 0; i++) { // (visible strips disabled: they read as artefacts behind the UI)
    const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.cos(a) * 16, z = Math.sin(a) * 16;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 6.5), rigMat); m.position.set(x, 4.2, z); m.lookAt(0, 4.2, 0); scene.add(m);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.7, 0.1), frMat); fr.position.copy(m.position); fr.quaternion.copy(m.quaternion); fr.translateZ(-0.07); scene.add(fr);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), rigMat); top.position.set(0, 7.6, 0); top.rotation.x = Math.PI / 2; scene.add(top);
  const turntable = new THREE.Group(); scene.add(turntable);
  const ttMat = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.86, envMapIntensity: 0.15 });
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.34, TT_Y, 96, 1), ttMat);
  tt.position.y = TT_Y / 2; tt.receiveShadow = true; tt.renderOrder = 2; scene.add(tt);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2e7e).multiplyScalar(2.2) });
  const led = new THREE.Mesh(new THREE.TorusGeometry(3.36, 0.012, 6, 160), ledMat);
  led.rotation.x = Math.PI / 2; led.position.y = TT_Y * 0.55; scene.add(led);
  // contact shadow under the car
  const cs = document.createElement('canvas'); cs.width = cs.height = 128;
  { const g = cs.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cs), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = TT_Y + 0.004; blob.renderOrder = 3; turntable.add(blob);

  // ---------------------------------------------------------------- car
  const carGroup = new THREE.Group(); carGroup.position.y = TT_Y; turntable.add(carGroup);
  const mirrorGroup = new THREE.Group(); mirrorGroup.scale.y = -1; mirrorGroup.position.y = TT_Y; turntable.add(mirrorGroup);
  let vis = null, mirror = null, spec = null, curKey = null;
  const orbit = { yaw: -0.65, pitch: 0.16, dist: 7.5, tYaw: -0.65, tPitch: 0.16, tDist: 7.5, auto: 0.09, idle: 0, target: new THREE.Vector3(0, 0.6, 0) };
  const frame = { shift: 0.16 };  // fraction of the screen width the car is shifted right (left panel)
  function rebuildMirror() {
    if (mirror) mirrorGroup.remove(mirror);
    mirror = vis ? vis.root.clone(true) : null;
    if (mirror) { mirror.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); mirrorGroup.add(mirror); }
  }
  function showCar(k, { build = null, look = null, keepCamera = true } = {}) {
    if (vis) { vis.dispose?.(); carGroup.remove(vis.root); vis = null; }
    curKey = k;
    if (!k || !CARS[k]) { rebuildMirror(); return null; }
    const d = buildDef(k, build);
    spec = getSpec(d.model);
    vis = buildModel(d.model, { paint: look?.paint ?? CARS[k].paint ?? spec.defaultPaint, paint2: CARS[k].paint2, hero: true, look: look || { paint: CARS[k].paint, finish: CARS[k].year < 1985 ? 'gloss' : 'metallic' }, wing: d.wing | 0, splitter: build?.up?.aeroF | 0 });
    vis.setLights({ head: false, brake: false }); // lenses read as glass; DRLs glow
    vis.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    carGroup.add(vis.root);
    rebuildMirror();
    blob.scale.set(spec.width * 1.35, spec.length * 1.12, 1);
    const L = spec.length, H = spec.height;
    orbit.target.set(0, TT_Y + H * 0.42, 0);
    const fit = Math.max(6.2, L * 1.5 + H * 0.9);
    orbit.tDist = fit; if (!keepCamera) orbit.dist = fit;
    return vis;
  }
  function setLook(look) { if (vis) { vis.setLook(look); rebuildMirror(); } }

  // ---------------------------------------------------------------- reveal (give / barn find / prize)
  const rv = { t: -1 };
  function reveal() { rv.t = 0; orbit.yaw = orbit.tYaw = 0.25; orbit.pitch = orbit.tPitch = 0.05; orbit.dist = orbit.tDist * 0.8; turntable.rotation.y = -2.2; }

  // ---------------------------------------------------------------- input: orbit
  const drag = { on: false, x: 0, y: 0 };
  let dom = null;
  const onDown = e => { if (e.button !== 0 && e.button !== 2) return; if (e.target.closest?.('[data-nav],.gx-panel,.gx-top,.gx-hints,button,input')) return; drag.on = true; drag.x = e.clientX; drag.y = e.clientY; orbit.idle = 0; };
  const onMove = e => { if (!drag.on) return; orbit.tYaw -= (e.clientX - drag.x) * 0.006; orbit.tPitch = THREE.MathUtils.clamp(orbit.tPitch + (e.clientY - drag.y) * 0.004, -0.02, 0.9); drag.x = e.clientX; drag.y = e.clientY; orbit.idle = 0; };
  const onUp = () => { drag.on = false; };
  const onWheel = e => { if (e.target.closest?.('.gx-panel,.gx-scroll')) return; orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * (e.deltaY > 0 ? 1.08 : 0.93), 2.6, 16); orbit.idle = 0; };
  function attach(el) { detach(); dom = el; el.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); el.addEventListener('wheel', onWheel, { passive: true }); }
  function detach() { if (!dom) return; dom.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); dom.removeEventListener('wheel', onWheel); dom = null; }

  // ---------------------------------------------------------------- frame
  const _sz = new THREE.Vector2();
  function update(dt, pad) {
    if (pad && (Math.abs(pad.rx) > 0.12 || Math.abs(pad.ry) > 0.12)) { orbit.tYaw -= pad.rx * dt * 2.2; orbit.tPitch = THREE.MathUtils.clamp(orbit.tPitch + pad.ry * dt * 1.2, -0.02, 0.9); orbit.idle = 0; }
    if (pad && (pad.lt > 0.1 || pad.rt > 0.1)) { orbit.tDist = THREE.MathUtils.clamp(orbit.tDist * (1 + (pad.lt - pad.rt) * dt * 1.2), 2.6, 16); orbit.idle = 0; }
    orbit.idle += dt;
    const spin = rv.t >= 0 ? Math.max(0.09, 2.2 * Math.max(0, 1 - rv.t / 2.2)) : orbit.idle > 2.5 ? orbit.auto : 0;
    turntable.rotation.y += spin * dt;
    if (rv.t >= 0) { rv.t += dt; if (rv.t > 2.6) rv.t = -1; orbit.tDist = orbit.tDist; }
    const k = 1 - Math.exp(-dt * 7);
    orbit.yaw += (orbit.tYaw - orbit.yaw) * k; orbit.pitch += (orbit.tPitch - orbit.pitch) * k; orbit.dist += (orbit.tDist - orbit.dist) * (1 - Math.exp(-dt * (rv.t >= 0 ? 1.4 : 5)));
    const t = orbit.target, cp = Math.cos(orbit.pitch);
    camera.position.set(t.x + Math.sin(orbit.yaw) * cp * orbit.dist, t.y + Math.sin(orbit.pitch) * orbit.dist + 0.2, t.z - Math.cos(orbit.yaw) * cp * orbit.dist);
    camera.lookAt(t);
    ledMat.color.setRGB(1, 0.18, 0.49).multiplyScalar(1.6 + Math.sin(performance.now() / 700) * 0.35);
  }
  function render(r) {
    r.getSize(_sz);
    const w = Math.max(2, _sz.x), h = Math.max(2, _sz.y);
    camera.aspect = w / h;
    if (frame.shift) camera.setViewOffset(w, h, -w * frame.shift, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const exp = r.toneMappingExposure, tm = r.toneMapping, ac = r.autoClear;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = rv.t >= 0 ? Math.min(0.9, rv.t * 0.6) : 0.9;
    r.autoClear = true;
    r.setRenderTarget(null);
    r.render(scene, camera);
    r.toneMappingExposure = exp; r.toneMapping = tm; r.autoClear = ac;
  }
  function dispose() {
    detach();
    if (vis) { vis.dispose?.(); vis = null; }
    envRT.dispose(); gradTex.dispose(); faTex.dispose();
    scene.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData?.shared) { /* car geometry is shared + cached: leave it */ } });
  }
  return {
    scene, camera, orbit, frame, showCar, setLook, reveal, attach, detach, update, render, dispose,
    get key() { return curKey; }, get vis() { return vis; }, get spec() { return spec; },
    view(name) {
      const V = { f34: [-0.65, 0.16], r34: [-2.45, 0.2], side: [-1.5708, 0.06], front: [0, 0.1], rear: [Math.PI, 0.14], top: [-0.8, 0.85], low: [-0.5, 0.02] }[name];
      if (V) { orbit.yaw = orbit.tYaw = V[0]; orbit.pitch = orbit.tPitch = V[1]; turntable.rotation.y = 0; orbit.idle = 0; }
    },
  };
}
