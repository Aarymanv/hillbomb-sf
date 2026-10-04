// Dev-only GPU memory accounting. Install BEFORE the renderer exists (main.js: ?memtrack). Wraps WebGL2 allocation calls and
// keeps bytes per GL object (textures per face/level, renderbuffers incl. MSAA samples, buffers).
//   __gpumem(top = 25) -> { totalMB, texMB, rbMB, bufMB, top: [{ who, MB, n, info }] } attributed by walking scene + game objects
const P = WebGL2RenderingContext.prototype, G = WebGL2RenderingContext;
const FIRST = !P.__mt; P.__mt = true;   // re-import (to refresh __gpumem) keeps the first install's wrappers + state
const S = window.__memtrackState || { tex: new Map(), rb: new Map(), buf: new Map() }; // handle -> { bytes, info, levels: Map }
const BPP = { [G.RGBA8]: 4, [G.SRGB8_ALPHA8]: 4, [G.RGB8]: 4, [G.SRGB8]: 4, [G.RGBA16F]: 8, [G.RGB16F]: 8, [G.RGBA32F]: 16, [G.RGB32F]: 16,
  [G.R8]: 1, [G.RG8]: 2, [G.R16F]: 2, [G.RG16F]: 4, [G.R32F]: 4, [G.RG32F]: 8, [G.R11F_G11F_B10F]: 4, [G.RGB10_A2]: 4,
  [G.DEPTH_COMPONENT16]: 2, [G.DEPTH_COMPONENT24]: 4, [G.DEPTH_COMPONENT32F]: 4, [G.DEPTH24_STENCIL8]: 4, [G.DEPTH32F_STENCIL8]: 8,
  [G.R8UI]: 1, [G.R16UI]: 2, [G.R32UI]: 4, [G.RGBA8UI]: 4, [G.RG16UI]: 4, [G.RGBA16UI]: 8, [G.RGBA32UI]: 16, [G.RGB565]: 2, [G.RGBA4]: 2, [G.RGB5_A1]: 2 };
const bppOf = (ifmt, fmt, type) => {
  if (BPP[ifmt]) return BPP[ifmt];
  const ch = { [G.RGBA]: 4, [G.RGB]: 3, [G.RG]: 2, [G.RED]: 1, [G.LUMINANCE]: 1, [G.ALPHA]: 1, [G.LUMINANCE_ALPHA]: 2, [G.DEPTH_COMPONENT]: 1, [G.DEPTH_STENCIL]: 1 }[fmt || ifmt] || 4;
  const b = { [G.UNSIGNED_BYTE]: 1, [G.HALF_FLOAT]: 2, [G.FLOAT]: 4, [G.UNSIGNED_SHORT]: 2, [G.UNSIGNED_INT]: 4, [G.UNSIGNED_INT_24_8]: 4 }[type] || 1;
  return Math.max(ch, 1) * b === 3 ? 4 : ch * b;
};
const unit = { cur: 0 }, bound = new Map(); // `${unit}:${target}` -> handle
const bufBound = new Map(), rbBound = { h: null };
const CUBE = new Set([G.TEXTURE_CUBE_MAP_POSITIVE_X, G.TEXTURE_CUBE_MAP_NEGATIVE_X, G.TEXTURE_CUBE_MAP_POSITIVE_Y, G.TEXTURE_CUBE_MAP_NEGATIVE_Y, G.TEXTURE_CUBE_MAP_POSITIVE_Z, G.TEXTURE_CUBE_MAP_NEGATIVE_Z]);
const texFor = (target) => bound.get(unit.cur + ':' + (CUBE.has(target) ? G.TEXTURE_CUBE_MAP : target));
const rec = (h, key, bytes, info) => { if (!h) return; let r = S.tex.get(h); if (!r) S.tex.set(h, r = { levels: new Map(), bytes: 0 }); r.levels.set(key, bytes); r.bytes = 0; for (const v of r.levels.values()) r.bytes += v; if (info) r.info = info; };
const wrap = (k, f) => { if (!FIRST) return; const o = P[k]; P[k] = function (...a) { f.call(this, a); return o.apply(this, a); }; };
wrap('activeTexture', a => { unit.cur = a[0] - G.TEXTURE0; });
wrap('bindTexture', a => { bound.set(unit.cur + ':' + a[0], a[1]); });
wrap('deleteTexture', a => S.tex.delete(a[0]));
wrap('texImage2D', a => { const [t, lv, ifmt] = a; let w, h, fmt, type; if (a.length >= 8) { w = a[3]; h = a[4]; fmt = a[6]; type = a[7]; } else { fmt = a[3]; type = a[4]; const s = a[5]; w = s?.videoWidth || s?.naturalWidth || s?.width || 0; h = s?.videoHeight || s?.naturalHeight || s?.height || 0; }
  rec(texFor(t), t + ':' + lv, w * h * bppOf(ifmt, fmt, type), `${w}x${h} ${ifmt}`); });
wrap('texImage3D', a => { const [t, lv, ifmt, w, h, d, , fmt, type] = a; rec(texFor(t), t + ':' + lv, w * h * d * bppOf(ifmt, fmt, type), `${w}x${h}x${d} ${ifmt}`); });
wrap('compressedTexImage2D', a => { const [t, lv, ifmt, w, h] = a; const data = a[6]; const n = typeof data === 'number' ? data : (a[8] ?? data?.byteLength ?? 0); rec(texFor(t), t + ':' + lv, n, `${w}x${h} c${ifmt}`); });
wrap('compressedTexImage3D', a => { const [t, lv, ifmt, w, h, d] = a; const data = a[8]; rec(texFor(t), t + ':' + lv, typeof data === 'number' ? data : data?.byteLength || 0, `${w}x${h}x${d} c${ifmt}`); });
const COMP = { 0x8C4C: 0.5, 0x8C4D: 0.5, 0x8C4E: 1, 0x8C4F: 1, 0x83F0: 0.5, 0x83F1: 0.5, 0x83F2: 1, 0x83F3: 1, 0x8E8C: 1, 0x8E8D: 1, 0x8E8E: 1, 0x8E8F: 1, 0x93B0: 1, 0x93D0: 1, 0x9274: 0.5, 0x9278: 1, 0x8C00: 0.25, 0x8C02: 0.25, 0x8C01: 0.125, 0x8C03: 0.125, 0x8D64: 0.5 };
wrap('texStorage2D', a => { const [t, levels, ifmt, w, h] = a; const bpp = COMP[ifmt] ?? BPP[ifmt] ?? 4; let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp; if (t === G.TEXTURE_CUBE_MAP) n *= 6;
  const hnd = bound.get(unit.cur + ':' + t); if (hnd) { S.tex.set(hnd, { levels: new Map([['storage', n]]), bytes: n, info: `${w}x${h}${t === G.TEXTURE_CUBE_MAP ? ' cube' : ''} L${levels} ${ifmt}` }); } });
wrap('texStorage3D', a => { const [t, levels, ifmt, w, h, d] = a; const bpp = COMP[ifmt] ?? BPP[ifmt] ?? 4; let n = 0; for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp * (t === G.TEXTURE_3D ? Math.max(1, d >> l) : d);
  const hnd = bound.get(unit.cur + ':' + t); if (hnd) S.tex.set(hnd, { levels: new Map([['storage', n]]), bytes: n, info: `${w}x${h}x${d} L${levels} ${ifmt}` }); });
wrap('generateMipmap', a => { const h = bound.get(unit.cur + ':' + a[0]); const r = h && S.tex.get(h); if (r && !r.levels.has('storage') && !r.mip) { r.mip = 1; let b0 = 0; for (const [k, v] of r.levels) if (k.endsWith(':0')) b0 += v; r.levels.set('mips', Math.round(b0 / 3)); r.bytes += Math.round(b0 / 3); } });
wrap('bindRenderbuffer', a => { rbBound.h = a[1]; });
wrap('deleteRenderbuffer', a => S.rb.delete(a[0]));
wrap('renderbufferStorage', a => { const [, ifmt, w, h] = a; if (rbBound.h) S.rb.set(rbBound.h, { bytes: w * h * (BPP[ifmt] || 4), info: `${w}x${h} ${ifmt}` }); });
wrap('renderbufferStorageMultisample', a => { const [, s, ifmt, w, h] = a; if (rbBound.h) S.rb.set(rbBound.h, { bytes: w * h * (BPP[ifmt] || 4) * Math.max(1, s), info: `${w}x${h} x${s} ${ifmt}` }); });
wrap('bindBuffer', a => { bufBound.set(a[0], a[1]); });
wrap('deleteBuffer', a => S.buf.delete(a[0]));
wrap('bufferData', a => { const h = bufBound.get(a[0]); if (!h) return; const d = a[1]; const n = typeof d === 'number' ? d : (a[4] ? a[4] * (d.BYTES_PER_ELEMENT || 1) : d?.byteLength || 0); S.buf.set(h, { bytes: n }); });
window.__memtrackState = S;

const MB = b => +(b / 1048576).toFixed(1);
const sum = m => { let n = 0; for (const v of m.values()) n += v.bytes; return n; };
window.__gpumemTotals = () => ({ texMB: MB(sum(S.tex)), rbMB: MB(sum(S.rb)), bufMB: MB(sum(S.buf)), totalMB: MB(sum(S.tex) + sum(S.rb) + sum(S.buf)), nTex: S.tex.size, nRb: S.rb.size, nBuf: S.buf.size });
// attribution: GL texture/renderbuffer handle -> owner label
window.__gpumem = (top = 25) => {
  const R = window.__renderer, props = R.properties, owner = new Map(), seen = new WeakSet();
  const claimTex = (t, who) => { if (!t?.isTexture) return; const p = props.get(t); const h = p?.__webglTexture; if (h && !owner.has(h)) owner.set(h, who + (t.name ? '|' + t.name : '') + (t.image?.src ? '|' + String(t.image.src).split('/').slice(-2).join('/') : '')); };
  const claimRT = (rt, who) => { const p = props.get(rt); for (const t of rt.textures || [rt.texture]) claimTex(t, who); if (rt.depthTexture) claimTex(rt.depthTexture, who + '.depth');
    for (const k of ['__webglDepthbuffer', '__webglDepthRenderbuffer', '__webglColorRenderbuffer', '__webglMultisampledFramebuffer']) { const v = p?.[k]; for (const h of Array.isArray(v) ? v : [v]) if (h && !owner.has(h)) owner.set(h, who + '.rb'); } };
  // 1) scene objects: group by top-level ancestor (+ child name)
  const label = o => { const ch = []; let p = o; while (p && p !== window.__scene) { ch.unshift(p.name || p.type); p = p.parent; } return ch.slice(0, 2).join('/'); };
  const geo = new Map(), geoSeen = new WeakSet();
  const visitMat = (m, who) => { if (!m || seen.has(m)) return; seen.add(m); for (const k in m) { const v = m[k]; if (v?.isTexture) claimTex(v, who + '.' + k); }
    for (const k in (m.uniforms || {})) { const v = m.uniforms[k]?.value; if (v?.isTexture) claimTex(v, who + '.u.' + k); else if (Array.isArray(v)) v.forEach(x => x?.isTexture && claimTex(x, who + '.u.' + k)); } };
  window.__scene.traverse(o => { const who = label(o); for (const m of [].concat(o.material || [])) visitMat(m, who); if (o.customDepthMaterial) visitMat(o.customDepthMaterial, who);
    if (o.isLight && o.shadow?.map) claimRT(o.shadow.map, 'shadow:' + (o.name || o.type) + ' ' + o.shadow.mapSize.x);
    const g = o.geometry; if (g && !geoSeen.has(g)) { geoSeen.add(g); let n = 0; for (const k in g.attributes) n += g.attributes[k].array?.byteLength || 0; if (g.index) n += g.index.array?.byteLength || 0; for (const k in (g.morphAttributes || {})) for (const a of g.morphAttributes[k]) n += a.array?.byteLength || 0; geo.set(who, (geo.get(who) || 0) + n); } });
  if (window.__scene.background?.isTexture) claimTex(window.__scene.background, 'scene.background'); if (window.__scene.environment?.isTexture) claimTex(window.__scene.environment, 'scene.environment');
  // 2) deep walk of game objects for render targets / textures not in the scene
  const vis = new WeakSet(); const walk = (o, path, d) => { if (!o || typeof o !== 'object' || d > 7 || vis.has(o)) return; vis.add(o);
    if (o.isWebGLRenderTarget || o.isRenderTarget) { claimRT(o, 'rt:' + path); return; } if (o.isTexture) { claimTex(o, 'tex:' + path); return; }
    if (o.isObject3D || o.isBufferGeometry || o.isBufferAttribute || ArrayBuffer.isView(o) || o instanceof Node || o instanceof Window) return;
    if (o.isMaterial) { visitMat(o, 'mat:' + path); return; }
    let keys; try { keys = o instanceof Map ? [...o.keys()] : Object.keys(o); } catch { return; } if (keys.length > 400) keys = keys.slice(0, 400);
    for (const k of keys) { let v; try { v = o instanceof Map ? o.get(k) : o[k]; } catch { continue; } if (v && typeof v === 'object') walk(v, path + '.' + String(k).slice(0, 24), d + 1); } };
  walk(window.__G?.post, 'post', 0); walk(window.__env, 'env', 0); walk(window.__world, 'world', 0); walk(window.__G, 'G', 0); walk(R.shadowMap, 'shadowMap', 0);
  // 3) aggregate
  const agg = new Map(); const add = (who, bytes, info) => { const g = agg.get(who) || { who, bytes: 0, n: 0, info }; g.bytes += bytes; g.n++; agg.set(who, g); };
  const norm = s => s.replace(/\d{3,}/g, '#').replace(/\|[^|]*$/, m => m.length > 40 ? m.slice(0, 40) : m);
  for (const [h, r] of S.tex) add(owner.has(h) ? norm(owner.get(h)) : 'unowned ' + (window.__texName?.(h) || (r.info || '').replace(/^(\d+x\d+).*?(\d+)$/, '$1 f$2')), r.bytes, r.info);
  for (const [h, r] of S.rb) add(owner.has(h) ? norm(owner.get(h)) : 'unowned rb ' + r.info, r.bytes, r.info);
  const list = [...agg.values()].sort((a, b) => b.bytes - a.bytes).slice(0, top).map(g => ({ who: g.who, MB: MB(g.bytes), n: g.n, info: g.info }));
  const geoTop = [...geo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, b]) => [w, MB(b)]);
  const info = R.info; return { ...window.__gpumemTotals(), three: { geometries: info.memory.geometries, textures: info.memory.textures, calls: info.render.calls, tris: info.render.triangles }, top: list, geoCpuMB: geoTop };
};
// tag GL handles with their three.Texture right after upload (three calls texture.onUpdate after uploadTexture)
const refs = window.__memtrackRefs || new Map(); // handle -> WeakRef(texture)
window.__memtrackHook = (THREE) => {
  const T = THREE.Texture.prototype; Object.defineProperty(T, 'onUpdate', { configurable: true, get() { return this._mtOnUpdate || mtTag; }, set(f) { this._mtOnUpdate = typeof f === 'function' ? function (t) { mtTag.call(this, t); return f.call(this, t); } : null; } });
  function mtTag(t) { const tex = t || this; const tg = tex.isCubeTexture ? G.TEXTURE_CUBE_MAP : (tex.isDataArrayTexture || tex.isCompressedArrayTexture) ? G.TEXTURE_2D_ARRAY : tex.isData3DTexture ? G.TEXTURE_3D : G.TEXTURE_2D; const h = bound.get(unit.cur + ':' + tg); if (h) refs.set(h, new WeakRef(tex)); }
};
window.__memtrackRefs = refs;
window.__texName = (h) => { const t = refs.get(h)?.deref(); if (!t) return null; const src = t.image?.src || t.source?.data?.src || t.userData?.url || ''; return (t.name || '') + (src ? '|' + String(src).split('/').slice(-2).join('/') : '') || ('uuid ' + t.uuid.slice(0, 6) + ' ' + (t.constructor?.name || '')); };
