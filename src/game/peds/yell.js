// HILLBOMB pedestrians: short comic speech bubbles ("HEY! MY CAR!") above a pedestrian's head.
// A handful of pooled sprites; canvas textures are cached per line of text. No audio.
import * as THREE from 'three';

const TEX = new Map();
function textTexture(text) {
  let t = TEX.get(text);
  if (t) return t;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '900 44px "Arial Black", Impact, system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 56, h = 96;
  c.width = w; c.height = h;
  ctx.font = font;
  // bubble with a tail
  const r = 26, bh = 72;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.strokeStyle = '#111'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r + 3, 3); ctx.lineTo(w - r - 3, 3); ctx.quadraticCurveTo(w - 3, 3, w - 3, r + 3);
  ctx.lineTo(w - 3, bh - r); ctx.quadraticCurveTo(w - 3, bh, w - r - 3, bh);
  ctx.lineTo(w / 2 + 14, bh); ctx.lineTo(w / 2 - 4, h - 4); ctx.lineTo(w / 2 - 6, bh);
  ctx.lineTo(r + 3, bh); ctx.quadraticCurveTo(3, bh, 3, bh - r); ctx.lineTo(3, r + 3); ctx.quadraticCurveTo(3, 3, r + 3, 3);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d12a1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, bh / 2 + 2);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  t.userData = { aspect: w / h };
  TEX.set(text, t);
  return t;
}

export const LINES = {
  carjack: ['HEY! MY CAR!', 'THIEF!', 'NOT MY CAR!', 'STOP! THIEF!', 'HELP! POLICE!'],
  nearMiss: ['WATCH IT!', 'HEY!', 'ARE YOU CRAZY?!', 'SLOW DOWN!', 'WHOA!', 'LEARN TO DRIVE!'],
  hit: ['OW!', 'AAAH!', 'MY BACK!', 'OOF!'],
  shove: ['HEY!', 'EXCUSE YOU!', 'RUDE!', 'WATCH IT, PAL!'],
  horn: ['ALRIGHT, ALRIGHT!', 'RELAX!', 'I SEE YOU!', 'HEY!'],
  panic: ['RUN!', 'AAAH!', 'OH NO!', 'CALL 911!'],
  hello: ['HI!', 'HEY THERE!', 'NICE DAY!'],
};
export const pickLine = (kind) => { const a = LINES[kind] || LINES.nearMiss; return a[(Math.random() * a.length) | 0]; };

export function createYeller(scene, max = 5) {
  const items = [];
  for (let i = 0; i < max; i++) {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    s.visible = false; s.renderOrder = 10; s.center.set(0.5, 0);
    scene.add(s);
    items.push({ s, ped: null, t: 0, dur: 0 });
  }
  let lastT = -9;
  const Y = {
    time: 0,
    /** show a bubble over ped for dur seconds; returns false when throttled */
    say(ped, text, dur = 1.8, force = false) {
      if (!force && Y.time - lastT < 0.35) return false;
      if (items.some(it => it.ped === ped && it.t < it.dur)) return false;
      let it = items.find(i => i.t >= i.dur) || items.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
      const tex = textTexture(text);
      it.s.material.map = tex; it.s.material.needsUpdate = true;
      const h = 0.42; it.s.scale.set(h * tex.userData.aspect, h, 1);
      it.ped = ped; it.t = 0; it.dur = dur; it.s.visible = true;
      lastT = Y.time;
      return true;
    },
    update(dt, camera) {
      Y.time += dt;
      for (const it of items) {
        if (!it.s.visible) continue;
        it.t += dt;
        const p = it.ped;
        if (it.t >= it.dur || !p || !p.alive) { it.s.visible = false; it.ped = null; continue; }
        const pop = Math.min(1, it.t / 0.12), fade = 1 - Math.max(0, (it.t - it.dur + 0.3) / 0.3);
        it.s.position.set(p.x, p.y + (p.human?.height ?? 1.75) + 0.28 + 0.1 * Math.min(1, it.t / 0.4), p.z);
        it.s.material.opacity = fade;
        // world-sized up close, roughly constant on screen beyond ~12 m so it stays readable
        const dc = camera ? camera.position.distanceTo(it.s.position) : 10;
        const k = (0.6 + 0.4 * pop) * Math.max(1, dc / 12);
        const tex = it.s.material.map; const h = 0.5 * k;
        it.s.scale.set(h * tex.userData.aspect, h, 1);
      }
    },
    clear(ped) { for (const it of items) if (!ped || it.ped === ped) { it.s.visible = false; it.ped = null; it.t = it.dur; } },
  };
  return Y;
}
