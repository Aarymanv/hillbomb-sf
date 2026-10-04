// Photo-mode colour looks (display-referred, applied by post.js FinishShader) and the PNG capture helper.
import * as THREE from 'three';

const LUM = [0.2126, 0.7152, 0.0722];
function satMatrix(s) {
  const m = new THREE.Matrix3();
  const a = (1 - s);
  m.set(
    a * LUM[0] + s, a * LUM[1], a * LUM[2],
    a * LUM[0], a * LUM[1] + s, a * LUM[2],
    a * LUM[0], a * LUM[1], a * LUM[2] + s,
  );
  return m;
}
const sepia = new THREE.Matrix3().set(0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131);
// each look: matrix, lift (added to blacks), gamma (>1 brightens mids), gain (multiplies highlights)
export const LOOKS = [
  { name: 'None', mix: 0 },
  { name: 'Vivid', m: satMatrix(1.32), lift: [0, 0, 0], gamma: [1.02, 1.02, 1.02], gain: [1.04, 1.04, 1.04] },
  { name: 'Film', m: satMatrix(0.88), lift: [0.035, 0.03, 0.04], gamma: [0.96, 0.97, 0.98], gain: [1.02, 0.99, 0.94] },
  { name: 'Noir', m: satMatrix(0), lift: [0.0, 0.0, 0.0], gamma: [0.82, 0.82, 0.82], gain: [1.12, 1.12, 1.12] },
  { name: 'Teal & orange', m: satMatrix(1.12), lift: [0.0, 0.03, 0.05], gamma: [1.0, 1.0, 1.0], gain: [1.08, 0.99, 0.86] },
  { name: 'Cool night', m: satMatrix(0.9), lift: [0.0, 0.01, 0.035], gamma: [0.96, 1.0, 1.05], gain: [0.93, 1.0, 1.1] },
  { name: 'Golden', m: satMatrix(1.08), lift: [0.02, 0.01, 0.0], gamma: [1.04, 1.0, 0.94], gain: [1.1, 1.0, 0.86] },
  { name: 'Vintage', m: null, lift: [0.07, 0.06, 0.05], gamma: [1.0, 0.98, 0.94], gain: [0.95, 0.92, 0.85] },
];
// vintage: 55% sepia + 45% desaturated (Matrix3 has no add())
{
  const a = sepia.elements, b = satMatrix(0.45).elements, out = new THREE.Matrix3();
  for (let i = 0; i < 9; i++) out.elements[i] = a[i] * 0.55 + b[i] * 0.45;
  LOOKS[7].m = out;
}

export function applyLook(finish, i) {
  const L = LOOKS[i] || LOOKS[0], U = finish.uniforms;
  if (!L.m) { U.uMix.value = 0; return; }
  U.uMix.value = 1;
  U.uMat.value.copy(L.m);
  U.uLift.value.set(...L.lift); U.uGamma.value.set(...L.gamma); U.uGain.value.set(...L.gain);
}

// grab the canvas right after a composite (call from post.onAfterRender) and download it as PNG
export function downloadCanvas(canvas, name) {
  return new Promise(resolve => {
    const done = blob => {
      if (!blob) { resolve(null); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve(blob);
    };
    try { canvas.toBlob(done, 'image/png'); } catch { resolve(null); }
  });
}
export function stampName() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `hillbomb-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
