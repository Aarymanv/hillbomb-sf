// Checkpoint gates for races / missions: light-pillar arches on roads, inflatable arches off-road, a chequered finish.
// A small fixed pool is repositioned as checkpoints are passed (no per-checkpoint allocation).
import * as THREE from 'three';

let checkerTex = null;
function checker() {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 16, y * 16, 16, 16); }
  checkerTex = new THREE.CanvasTexture(c); checkerTex.colorSpace = THREE.SRGBColorSpace; checkerTex.wrapS = THREE.RepeatWrapping;
  return checkerTex;
}
const sheetVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const sheetFS = `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vUv;
  void main(){ float y = vUv.y; float chev = step(0.5, fract((abs(vUv.x - 0.5) * 3.0 + y * 1.6) * 3.0 - uTime * 1.4));
  float a = (0.18 + 0.22 * (1.0 - y) + chev * 0.08) * uAlpha * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(1.0, 0.8, y);
  gl_FragColor = vec4(uColor * a, a); }`;

function makeGate(style) {
  const g = new THREE.Group();
  const col = new THREE.Color('#ffc247');
  const glow = new THREE.MeshBasicMaterial({ color: col, fog: false, toneMapped: false });
  const sheetMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: col.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 } }, vertexShader: sheetVS, fragmentShader: sheetFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sheetMat); sheet.position.y = 0.5; g.add(sheet);
  let parts;
  if (style === 'xc') {
    const inflate = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.0, emissive: col, emissiveIntensity: 0.25 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 36, Math.PI), inflate); arch.castShadow = true; g.add(arch);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.047, 6, 36, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    stripe.scale.set(1, 1, 0.3); g.add(stripe);
    parts = { arch, stripe, inflate };
  } else {
    const pillarGeo = new THREE.BoxGeometry(0.5, 1, 0.5); pillarGeo.translate(0, 0.5, 0);
    const pl = new THREE.Mesh(pillarGeo, glow), pr = new THREE.Mesh(pillarGeo, glow); g.add(pl, pr);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.4), glow); g.add(bar);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: checker(), side: THREE.DoubleSide, fog: false, toneMapped: false }));
    flag.visible = false; g.add(flag);
    parts = { pl, pr, bar, flag };
  }
  g.visible = false;
  return { g, style, glow, sheetMat, parts, col };
}

export function createGates(F) {
  const { G } = F;
  const pool = { road: [makeGate('road'), makeGate('road'), makeGate('road')], xc: [makeGate('xc'), makeGate('xc'), makeGate('xc')] };
  for (const k in pool) for (const gt of pool[k]) G.scene.add(gt.g);
  const API = {};
  let t = 0;
  // slot: 0 = next checkpoint, 1 = the one after, 2 = finish (shown when near). opts: {x,y,z,dx,dz,w,color,style,finish,dim}
  API.set = function (slot, o) {
    for (const k in pool) pool[k][slot].g.visible = false;
    if (!o) return;
    const gt = pool[o.style === 'xc' ? 'xc' : 'road'][slot];
    const W = Math.max(8, o.w), H = o.style === 'xc' ? W * 0.5 : 7.5;
    gt.g.visible = true;
    gt.g.position.set(o.x, o.y, o.z);
    gt.g.rotation.set(0, Math.atan2(o.dx, o.dz), 0);
    const c = o.finish ? '#ffffff' : o.color;
    gt.glow.color.set(c).multiplyScalar(o.dim ? 1.2 : 2.4);
    gt.sheetMat.uniforms.uColor.value.set(c); gt.sheetMat.uniforms.uAlpha.value = o.dim ? 0.35 : 1;
    const sheet = gt.g.children[0]; sheet.scale.set(W, H * 0.92, 1); sheet.position.y = H * 0.46;
    if (gt.style === 'xc') {
      const { arch, stripe, inflate } = gt.parts;
      inflate.color.set(o.color); inflate.emissive.set(o.color); inflate.emissiveIntensity = o.dim ? 0.12 : 0.35;
      arch.scale.set(W, W, W); stripe.scale.set(W, W, W * 0.3); arch.position.y = 0; stripe.position.y = 0;
      stripe.visible = !!o.finish || true; stripe.material.color.set(o.finish ? '#111111' : '#ffffff');
    } else {
      const { pl, pr, bar, flag } = gt.parts;
      pl.position.set(-W / 2, 0, 0); pr.position.set(W / 2, 0, 0); pl.scale.y = pr.scale.y = H;
      bar.position.set(0, H, 0); bar.scale.set(W + 0.5, 1, 1);
      flag.visible = !!o.finish; flag.position.set(0, H - 1.1, 0); flag.scale.set(W, 1.8, 1);
      flag.material.map.repeat.set(Math.max(1, Math.round(W / 8)), 1);
    }
  };
  API.hideAll = () => { for (const k in pool) for (const gt of pool[k]) gt.g.visible = false; };
  API.update = dt => { t += dt; for (const k in pool) for (const gt of pool[k]) if (gt.g.visible) gt.sheetMat.uniforms.uTime.value = t; };
  return API;
}
