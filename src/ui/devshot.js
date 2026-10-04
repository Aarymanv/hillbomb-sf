// Dev capture of the DOM UI composited over the WebGL frame (TESTING.md's __shot only grabs the WebGL canvas).
//   await __uishot('name', { w: 1280, h: 720 })  -> POSTs shots/name.jpg to the capture server
// The overlay DOM is cloned into an SVG foreignObject laid out at w x h (fonts embedded as data URLs, canvases
// replaced by images, animations frozen at their end state). backdrop-filter is not rendered by this path.
let fontCss = null;
async function embedFonts() {
  if (fontCss != null) return fontCss;
  fontCss = '';
  try {
    const link = [...document.querySelectorAll('link[rel=stylesheet]')].find(l => l.href.includes('fonts.googleapis'));
    if (!link) return fontCss;
    const css = await (await fetch(link.href)).text();
    const blocks = css.split('/* ').filter(b => b.startsWith('latin */')).map(b => b.slice(8));
    const out = await Promise.all(blocks.map(async b => {
      const m = b.match(/url\((https:[^)]+)\)/); if (!m) return '';
      const buf = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return b.replace(m[1], 'data:font/woff2;base64,' + btoa(s));
    }));
    fontCss = out.join('\n');
  } catch (e) { console.warn('[uishot] fonts', e); }
  return fontCss;
}
const SELECTORS = ['#hud', '#ui-layers', '#ui-fade', '.hb-overlay', '#title', '#int-fade'];
export async function uiShot(name = 'ui', { w = 1280, h = 720, gl = true, post = true, extraCss = '' } = {}) {
  const fonts = await embedFonts();
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const g = out.getContext('2d');
  g.fillStyle = '#20242c'; g.fillRect(0, 0, w, h);
  if (gl && window.__renderer && window.__frame) {
    const r = window.__renderer;
    const G = window.__G, ov = G?.renderOverride;
    if (ov && ov.render && String(ov.render).includes('big map covers')) { /* map layer is opaque: skip the 3D frame */ }
    else {
      if (r.domElement.width !== w) { r.setPixelRatio(1); r.setSize(w, h, false); window.__camera.aspect = w / h; window.__camera.updateProjectionMatrix(); }
      window.__frame(1 / 60);
      g.drawImage(r.domElement, 0, 0, w, h);
    }
  }
  const styles = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const holder = document.createElement('div');
  for (const sel of SELECTORS) for (const src of document.querySelectorAll(sel)) {
    const cl = src.cloneNode(true);
    const oc = src.querySelectorAll('canvas'), cc = cl.querySelectorAll('canvas');
    oc.forEach((c, i) => {
      const img = document.createElement('img');
      try { img.src = c.width && c.height ? c.toDataURL('image/png') : ''; } catch { img.src = ''; }
      img.className = c.className; img.setAttribute('style', (c.getAttribute('style') || '') + ';display:block;width:100%;height:100%;position:' + (getComputedStyle(c).position === 'absolute' ? 'absolute;inset:0' : 'relative'));
      cc[i].replaceWith(img);
    });
    if (cl.id === 'hud') cl.style.setProperty('--hs', Math.max(0.72, Math.min(1.7, h / 1080)).toFixed(3));
    holder.appendChild(cl);
  }
  const html = new XMLSerializer().serializeToString(holder);
  const freeze = '*,*:before,*:after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}.h-district.show,.h-banner.show{opacity:1!important}.h-district.show i{width:220px!important}';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;transform:translateZ(0)"><style>${escXml(fonts)}\n${escXml(styles)}\n${freeze}\n${escXml(extraCss)}</style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  g.drawImage(img, 0, 0);
  const data = out.toDataURL('image/jpeg', 0.88);
  if (post) await fetch('http://127.0.0.1:5191/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: data });
  return name;
}
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
