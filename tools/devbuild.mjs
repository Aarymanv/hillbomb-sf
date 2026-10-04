// Orchestrator test server: rebuilds dist-dev/ on change (vite build --watch) and serves it statically on :5191.
// Pages never auto-reload, so long-running in-browser tests are not interrupted by other authors' edits.
import { build } from 'vite';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const out = path.resolve('dist-dev');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.webp': 'image/webp', '.ktx2': 'image/ktx2' };
const shots = path.resolve('shots');
const pub = path.resolve('public');
fs.mkdirSync(shots, { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.writeHead(204); res.end(); return; }
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const b64 = Buffer.concat(chunks).toString().replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(shots, name + '.jpg'), Buffer.from(b64, 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  // built files first, then public/ straight from the source tree (never copied: it is ~70 MB)
  let f = path.join(out, p);
  if (!f.startsWith(out) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(pub, p);
  if (!f.startsWith(pub) && !f.startsWith(out) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(5191, '127.0.0.1', () => console.log('[devbuild] serving dist-dev on http://127.0.0.1:5191'));

await build({
  configFile: false, base: './', logLevel: 'warn', mode: 'development', publicDir: false,
  build: { outDir: out, emptyOutDir: false, minify: false, sourcemap: true, target: 'esnext', chunkSizeWarningLimit: 5000,
    watch: { include: ['src/**', 'index.html'], buildDelay: 1500 }, rollupOptions: { input: path.resolve('index.html') } },
  plugins: [{ name: 'log', buildEnd(err) { console.log(err ? '[devbuild] build error ' + err.message : '[devbuild] built ' + new Date().toLocaleTimeString()); },
    // emptyOutDir is off (open tabs may still lazy-load old chunks), so prune stale chunks older than 20 min after each build
    // (every rebuild used to leave ~5 MB behind; dist-dev had grown to 8 GB and filled the disk)
    writeBundle(_o, bundle) {
      const dir = path.join(out, 'assets'), keep = new Set(Object.keys(bundle).map(k => path.basename(k))), old = Date.now() - 20 * 60e3;
      for (const f of fs.readdirSync(dir)) { if (keep.has(f)) continue; const p = path.join(dir, f); try { if (fs.statSync(p).mtimeMs < old) fs.unlinkSync(p); } catch { /* ignore */ } }
    } }],
});
