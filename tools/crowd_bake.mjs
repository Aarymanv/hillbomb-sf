// Far-crowd impostor bake driver: runs dev/crowd_bake.js inside a game page over CDP and writes
// public/assets/peds/crowd_alb.png, crowd_nrm.png, crowd.json. Then: python tools/texpack.py --only crowd
// usage: CDP_PORT=9341 node tools/crowd_bake.mjs   (a headless, muted Chrome with the game loaded: ?play&mute&tiles=0)
import fs from 'node:fs';
import path from 'node:path';
const PORT = process.env.CDP_PORT || 9222;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'public', 'assets', 'peds');
const t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t => t.type === 'page')[0];
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
const r = await new Promise(res => {
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(async () => (await import('/dev/crowd_bake.js?v=${Date.now()}')).bake())()`, awaitPromise: true, returnByValue: true, timeout: 600000 } }));
});
const v = r.result?.result?.value;
if (!v || !v.alb) { console.log('bake failed', JSON.stringify(r.result?.exceptionDetails || v || r).slice(0, 1500)); process.exit(1); }
for (const k of ['alb', 'nrm']) fs.writeFileSync(path.join(OUT, `crowd_${k}.png`), Buffer.from(v[k].split(',')[1], 'base64'));
fs.writeFileSync(path.join(OUT, 'crowd.json'), JSON.stringify(v.meta, null, 1));
console.log('wrote crowd atlases', v.meta.avatars.length, 'avatars');
ws.close(); process.exit(0);
