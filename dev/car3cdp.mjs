// dev-only: silent headless Chrome driver (no browser pane needed). Launches Chrome --headless=new --mute-audio on its own
// profile, opens ONE tab at <url> (add ?mute), waits for window.__shot, evaluates <script.js> (an async function body;
// its return value is printed as JSON), parks the tab on /assets/manifest.json and closes Chrome.
//   node dev/car3cdp.mjs "http://127.0.0.1:5191/?play&mute&car=sedan" dev/some_script.js [--keep]
// HB_UNCAP=1: rAF not capped at 60 Hz (--disable-frame-rate-limit --disable-gpu-vsync) for real-time fps runs (dev/perf_rt.js)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, scriptPath] = process.argv.slice(2);
const keep = process.argv.includes('--keep');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hbcdp-'));
const ch = spawn(CHROME, ['--headless=new', '--mute-audio', '--autoplay-policy=user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--no-first-run', '--no-default-browser-check', ...(process.env.HB_UNCAP ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : []), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr, timeout = 600000) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1500));
  return r.result.value;
}
async function main() {
  let tgt = null;
  for (let k = 0; k < 60 && !tgt; k++) {
    await sleep(250);
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); tgt = l.find((t) => t.type === 'page'); } catch { /* starting */ }
  }
  if (!tgt) throw new Error('chrome did not start');
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') console.error('PAGE EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 600)); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let k = 0; k < 240; k++) { await sleep(500); try { if (await ev('!!(window.__shot && window.__G && window.__G.player)', 5000)) break; } catch { /* loading */ } }
  const body = fs.readFileSync(scriptPath, 'utf8');
  const out = await ev(`(async () => { ${body} })()`);
  console.log(JSON.stringify(out, null, 1));
  if (!keep) { await send('Page.navigate', { url: new URL('/assets/manifest.json', url).href }); await sleep(500); }
}
main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => { try { ws?.close(); } catch { /* */ } if (!keep) ch.kill(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* */ } process.exit(); }, 800); });
