// Ground-cover review views (ice plant mats, lupine patches) at golden hour and noon. Load after sky_shots.js:
//   for (const f of ['sky_shots.js', 'grass_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?' + Date.now())
//   __grassFind('lupine', x, z, r)   -> nearest spots where the shader's flower field puts lupines (CPU port of glsl.js noise)
//   await __grassShot('iceplant', 'before', 17.8)  -> shots/fix_iceplant_before_17.jpg (camera from GRASS_VIEWS)
(() => {
  const W = window;
  const fract = v => v - Math.floor(v);
  const hash12 = (x, y) => { let p3x = fract(x * 0.1031), p3y = fract(y * 0.1031), p3z = fract(x * 0.1031); const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33); p3x += d; p3y += d; p3z += d; return fract((p3x + p3y) * p3z); };
  const vnoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1); return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy; };
  const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.03 + 7.1, y * 2.03 + 7.1) * 0.3 + vnoise(x * 4.11 + 3.7, y * 4.11 + 3.7) * 0.15;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  W.__grassFind = (kind, x0, z0, r = 400, step = 4) => {
    const T = W.__world.terrain, out = [];
    for (let z = z0 - r; z <= z0 + r; z += step) for (let x = x0 - r; x <= x0 + r; x += step) {
      const c = T.surfaceRaw(x, z);
      let v = 0;
      if (kind === 'lupine') { if (c !== 3 && c !== 8 && c !== 9) continue; v = ss(0.62, 0.74, fbm(x * 0.06 - 17, z * 0.06 - 17)); }
      else { const n = fbm(x * 0.025 + 41, z * 0.025 + 41); v = c === 4 ? (T.heightAt(x, z) > 3.5 ? ss(0.3, 0.44, n) : 0) : c === 8 && x < -6500 ? ss(0.52, 0.64, n) : 0; }
      if (v > 0.9) out.push([x, z, Math.hypot(x - x0, z - z0)]);
    }
    return out.sort((a, b) => a[2] - b[2]).slice(0, 8);
  };
  // camera: eye at (x, ground + h, z) looking toward (tx, ground + th, tz)
  W.GRASS_VIEWS = {};
  W.__grassShot = async (name, suf, hour) => {
    const v = W.GRASS_VIEWS[name], w = W.__world;
    W.__manual = true; W.__setWx?.('clear'); W.__env.state.hours = hour; W.__env.state.paused = true;
    const look = () => { const gy = w.groundAt(v.x, v.z, 999), ty = w.groundAt(v.tx, v.tz, 999); W.__look(v.x, gy + v.h, v.z, v.tx, ty + (v.th ?? 0), v.tz); };
    W.__teleport(v.x + 30, v.z + 30, { foot: true }); look(); await W.__settle(120); W.__setWx?.('clear'); W.__env.state.hours = hour; look(); await W.__settle(60);
    look(); W.__frames(30);
    return W.__shot(`fix_${name}_${suf}_${Math.round(hour)}`, 1280, 720);
  };
})();
