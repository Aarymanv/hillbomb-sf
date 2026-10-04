// dev-only: Chrome performance trace of a real-time drive (silent headless Chrome, like car3cdp.mjs + HB_UNCAP).
// Runs <script.js> (an async function body) which must leave the game running and define window.__traceRun (async; resolves
// when the recorded stretch is over), e.g. dev/perf_rt2.js with #trace=1. Records a devtools.timeline trace meanwhile and
// prints, for every rAF interval > SLOW ms, what the renderer main thread did in it: the rAF callback (+ its user-timing
// measures from perf_rt2's part wraps) and every other task (timers, worker messages, network callbacks, GC) with its
// biggest JS function, so frame spikes that happen OUTSIDE the game's frame() are attributed too.
//   node dev/trace_cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high#d=fidi&secs=12&v=45&trace=1" dev/perf_rt2.js [SLOW=25]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [url, scriptPath] = process.argv.slice(2);
const FILE_MODE = url === '--file';
const SLOW = +(process.env.SLOW || 25);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 400);
const prof = FILE_MODE ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'hbtr-'));
const ch = FILE_MODE ? null : spawn(CHROME, ['--headless=new', '--mute-audio', '--autoplay-policy=user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--window-size=1280,720', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-unsafe-swiftshader=false', '--no-first-run', '--no-default-browser-check',
  '--disable-frame-rate-limit', '--disable-gpu-vsync', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const events = []; let traceDone = null;
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr, timeout = 600000) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1500));
  return r.result.value;
}
async function main() {
  let tgt = null, browserWs = null;
  for (let k = 0; k < 60 && !tgt; k++) {
    await sleep(250);
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); tgt = l.find((t) => t.type === 'page'); browserWs = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* starting */ }
  }
  if (!tgt) throw new Error('chrome did not start');
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Tracing.dataCollected') { for (const e of d.params.value) events.push(e); return; }
    if (d.method === 'Tracing.tracingComplete') { traceDone?.(); return; }
    if (d.method === 'Runtime.exceptionThrown') console.error('PAGE EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 600));
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let k = 0; k < 240; k++) { await sleep(500); try { if (await ev('!!(window.__shot && window.__G && window.__G.player)', 5000)) break; } catch { /* loading */ } }
  const body = fs.readFileSync(scriptPath, 'utf8');
  console.log(JSON.stringify(await ev(`(async () => { ${body} })()`)));
  if (process.env.ALLOC) { await allocs(); await send('Page.navigate', { url: new URL('/assets/manifest.json', url).href }); await sleep(500); return; }
  if (process.env.SPIKE) { await spikes(); await send('Page.navigate', { url: new URL('/assets/manifest.json', url).href }); await sleep(500); return; }
  await send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { recordMode: 'recordContinuously', includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8', 'v8.execute', 'toplevel', 'disabled-by-default-v8.gc', 'gpu'] } });
  if (process.env.PROF) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
  await ev('window.__traceRun()');
  if (process.env.PROF) profReport((await send('Profiler.stop')).profile);
  const done = new Promise(r => (traceDone = r));
  await send('Tracing.end'); await done;
  if (process.env.TRACE_OUT) fs.writeFileSync(process.env.TRACE_OUT, JSON.stringify({ traceEvents: events }));
  analyse();
  await send('Page.navigate', { url: new URL('/assets/manifest.json', url).href }); await sleep(500);
}
// ALLOC=1: sampling heap profiler over the run (bytes allocated, sampled every 16 KB), top allocation sites by self size
async function allocs() {
  await send('HeapProfiler.enable'); await send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const t0 = Date.now(); await ev('window.__traceRun()'); const secs = (Date.now() - t0) / 1000;
  const { profile } = await send('HeapProfiler.stopSampling');
  const self = new Map(), incl = new Map(); let tot = 0;
  const key = n => `${n.callFrame.functionName || '(anon)'}@${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  const walk = (n, chain) => { const k = key(n); self.set(k, (self.get(k) || 0) + n.selfSize); tot += n.selfSize; const c2 = chain.includes(k) ? chain : [...chain, k]; for (const q of c2) incl.set(q, (incl.get(q) || 0) + n.selfSize); for (const c of n.children || []) walk(c, c2); };
  walk(profile.head, []);
  const fmt = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOPN || 40)).map(([k, b]) => `${(b / 1048576 / secs).toFixed(2).padStart(8)} MB/s  ${k}`).join(String.fromCharCode(10));
  console.log(`ALLOC total ${(tot / 1048576 / secs).toFixed(1)} MB/s over ${secs.toFixed(0)} s`);
  console.log('--- SELF ---' + String.fromCharCode(10) + fmt(self));
  console.log('--- INCLUSIVE ---' + String.fromCharCode(10) + fmt(incl));
}
// SPIKE=1: no trace; V8 sampling profile (100 us) over the run, then for every long frame the page recorded in
// window.__longFrames ([t0, t1, parts] in performance.now(), perf_rt2.js #spike=<ms>) the functions on the stack in that window
async function spikes() {
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 100 }); await send('Profiler.start');
  const pageT0 = await ev('performance.now()');
  await ev('window.__traceRun()');
  const { profile } = await send('Profiler.stop');
  const longs = await ev('window.__longFrames || []');
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = n => `${n.callFrame.functionName || '(anon)'}@${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  // sample times in page clock: profile.startTime (us) ~ pageT0 (ms) at Profiler.start
  let t = profile.startTime; const times = profile.timeDeltas.map(d => (t += d));
  const off = profile.startTime / 1000 - pageT0;
  const SKIP = /^(\(root\)|\(program\)|onAnimationFrame|frame|obj\.<computed>|\(anon\)@index[^:]*:161831|W\.__G\.post\.render|update@index[^:]*:157814)$/;
  for (const [a, b, parts] of longs.slice(0, +(process.env.NSLOW || 40))) {
    const incl = new Map(); let n = 0;
    profile.samples.forEach((s, i) => {
      const tm = times[i] / 1000 - off; if (tm < a || tm > b) return; n++;
      const seen = new Set(); let p = s; while (p !== undefined) { const k = key(nodes.get(p)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + 1); } p = parent.get(p); }
    });
    const top = [...incl].filter(([k]) => !SKIP.test(k.split('@')[0]) && !/^\(root\)|^\(program\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, +(process.env.TOPN || 14)).map(([k, c]) => `${(c * 0.1).toFixed(1)} ${k}`);
    console.log(`--- ${(b - a).toFixed(1)} ms [${parts}] samples ${n}`); console.log('   ' + top.join(String.fromCharCode(10) + '   '));
  }
}
// V8 sampling profile split into samples inside the game's rAF frame (stack has main.js frame) and outside it
function profReport(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  const isFrame = n => n.callFrame.functionName === 'frame' && /main|index/.test(n.callFrame.url);
  const dt = profile.timeDeltas, cnt = new Map(); profile.samples.forEach((s, i) => cnt.set(s, (cnt.get(s) || 0) + (dt[i] || 0)));
  const incl = { in: new Map(), out: new Map() }, tot = { in: 0, out: 0, idle: 0 };
  for (const [id, us] of cnt) {
    const chain = []; let p = id; while (p !== undefined) { chain.push(nodes.get(p)); p = parent.get(p); }
    const nm = nodes.get(id).callFrame.functionName;
    if (nm === '(idle)' || nm === '(program)') { tot.idle += us; continue; }
    const side = chain.some(isFrame) ? 'in' : 'out'; tot[side] += us;
    const seen = new Set(); for (const n of chain) { const k = key(n); if (seen.has(k)) continue; seen.add(k); incl[side].set(k, (incl[side].get(k) || 0) + us); }
  }
  const S = (profile.endTime - profile.startTime) / 1000;
  console.log(`PROFILE ${S.toFixed(0)} ms: in frame() ${(tot.in / 1000).toFixed(0)} ms, outside ${(tot.out / 1000).toFixed(0)} ms, idle/program ${(tot.idle / 1000).toFixed(0)} ms`);
  const fmt = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOPN || 45)).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(6)} ms  ${k}`).join(String.fromCharCode(10));
  console.log('--- OUTSIDE frame() inclusive ---' + String.fromCharCode(10) + fmt(incl.out));
  if (process.env.PROF === '2') console.log('--- IN frame() inclusive ---' + String.fromCharCode(10) + fmt(incl.in));
}
function analyse() {
  // renderer main thread: CrRendererMain of the pid that has FireAnimationFrame events
  const names = new Map(); for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  const rafPid = events.find(e => e.name === 'FireAnimationFrame')?.pid;
  const main = [...names].find(([k, n]) => n === 'CrRendererMain' && k.startsWith(rafPid + ':'))?.[0];
  if (!main) { console.log('no main thread found'); return; }
  const [pid, tid] = main.split(':').map(Number);
  const X = events.filter(e => e.pid === pid && e.tid === tid && e.ph === 'X' && e.dur !== undefined).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // top-level tasks: X events not nested in an earlier one
  const top = []; let end = -1;
  for (const e of X) { if (e.ts >= end) { top.push(e); end = e.ts + e.dur; } }
  // children per top task (X is sorted: walk once)
  let j = 0; const kidsOf = new Map();
  for (const t of top) { const k = []; while (j < X.length && X[j].ts < t.ts) j++; let q = j; while (q < X.length && X[q].ts < t.ts + t.dur) { if (X[q] !== t) k.push(X[q]); q++; } kidsOf.set(t, k); }
  const frames = top.filter(t => kidsOf.get(t).some(e => e.name === 'FireAnimationFrame'));
  // user timing measures (async b/e pairs)
  const um = []; { const open = new Map(); for (const e of events) { if (e.cat !== 'blink.user_timing') continue; const k = (e.id2?.local || e.id || '') + e.name; if (e.ph === 'b') open.set(k, e); else if (e.ph === 'e') { const b = open.get(k); if (b) { um.push({ name: e.name, ts: b.ts, dur: e.ts - b.ts }); open.delete(k); } } } }
  const desc = (t) => {
    const k = kidsOf.get(t);
    const fc = k.filter(e => e.name === 'FunctionCall' || e.name === 'TimerFire' || e.name === 'EventDispatch' || e.name === 'RunMicrotasks' || e.name === 'v8.callFunction');
    const gc = k.filter(e => /^(MinorGC|MajorGC|V8\.GC_SCAVENGER$|V8\.GC_MARK_COMPACTOR$|ScheduledGC|V8\.GCIncrementalMarking$)/.test(e.name)).reduce((a, e) => a + e.dur, 0);
    const fn = k.filter(e => e.name === 'FunctionCall').sort((a, b) => b.dur - a.dur)[0];
    const kind = k.find(e => e.name === 'TimerFire') ? 'timer' : k.find(e => e.name === 'EventDispatch') ? 'event:' + (k.find(e => e.name === 'EventDispatch').args?.data?.type || '') : k.find(e => e.name === 'RunMicrotasks') ? 'microtasks' : (fc[0]?.name || k.sort((a, b) => b.dur - a.dur)[0]?.name || t.name);
    const d = fn?.args?.data || {};
    const f = fn ? ` ${d.functionName || '?'}@${(d.url || '').split('/').pop().split('?')[0]}:${d.lineNumber}:${d.columnNumber}` : '';
    return { kind, f, gc: gc / 1000 };
  };
  const out = []; let nSlow = 0; const byKind = new Map(); let outsideMs = 0, gcMs = 0;
  const ivs = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i], iv = (b.ts - a.ts) / 1000; ivs.push(iv);
    const others = top.filter(t => t.ts >= a.ts + a.dur && t.ts < b.ts && !frames.includes(t));
    for (const t of others) { const D = desc(t); outsideMs += t.dur / 1000; gcMs += D.gc; const key = D.kind + D.f; const r = byKind.get(key) || { n: 0, ms: 0, max: 0 }; r.n++; r.ms += t.dur / 1000; r.max = Math.max(r.max, t.dur / 1000); byKind.set(key, r); }
    gcMs += desc(a).gc;
    if (iv <= SLOW) continue;
    nSlow++;
    const parts = um.filter(m => m.ts >= a.ts && m.ts < a.ts + a.dur && m.dur > 1500).sort((x, y) => y.dur - x.dur).slice(0, 6).map(m => m.name + ' ' + (m.dur / 1000).toFixed(1));
    const busy = (a.dur + others.reduce((s, t) => s + t.dur, 0)) / 1000;
    const big = others.filter(t => t.dur > 1500).map(t => { const D = desc(t); return `${(t.dur / 1000).toFixed(1)} ${D.kind}${D.f}${D.gc > 0.5 ? ' gc' + D.gc.toFixed(1) : ''}`; });
    const g = desc(a).gc;
    out.push(`${iv.toFixed(0)}ms frame ${(a.dur / 1000).toFixed(1)}${g > 0.5 ? ' (gc ' + g.toFixed(1) + ')' : ''} [${parts.join(', ')}] busy ${busy.toFixed(1)} idle ${(iv - busy).toFixed(1)} | ${big.join(' ; ')}`);
  }
  const q = (p) => { const s = [...ivs].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))].toFixed(1); };
  console.log(`frames ${frames.length}, interval p50 ${q(0.5)} p95 ${q(0.95)} max ${q(1)}; slow (> ${SLOW} ms) ${nSlow}; outside-frame tasks ${outsideMs.toFixed(0)} ms, GC ${gcMs.toFixed(0)} ms over ${((frames.at(-1).ts - frames[0].ts) / 1e6).toFixed(1)} s`);
  console.log('--- outside-frame tasks by kind (n, total ms, max ms) ---');
  for (const [k, r] of [...byKind].sort((x, y) => y[1].ms - x[1].ms).slice(0, 25)) console.log(`${String(r.n).padStart(5)} ${r.ms.toFixed(0).padStart(6)} ${r.max.toFixed(1).padStart(6)}  ${k}`);
  console.log('--- slow intervals ---'); for (const l of out.slice(0, +(process.env.NSLOW || 60))) console.log(l);
}
if (process.argv[2] === '--file') { for (const e of JSON.parse(fs.readFileSync(process.argv[3], "utf8")).traceEvents) events.push(e); analyse(); process.exit(); }
if (!FILE_MODE) main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => { try { ws?.close(); } catch { /* */ } ch?.kill(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* */ } process.exit(); }, 800); });
