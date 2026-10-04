// headless body: close-ups of v6 features (stucco oriel bay, arched Marina windows) via bld5shots __bld5Close
for (const f of ['bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?v=' + Date.now());
for (let k = 0; k < 2000 && !(window.__G && window.__world && window.__world.buildings && window.__world.buildings.stats.readyMs); k++) await new Promise(r => setTimeout(r, 200));
const P = window.__world.buildings.plan, g = window.__G.world.graph;
const q = new URLSearchParams(location.search), suf = q.has('nov6') ? 'before' : 'after';
const find = (a, b, test) => { const A = g.intersection(a, b); let best = -1, bd = 1e9; for (let i = 0; i < P.N; i++) { if (i < P.N0 && P.lotN[i]) continue; const d = Math.hypot(P.cx[i] - A.x, P.cz[i] - A.z); if (d < bd && d > 25 && test(i)) { bd = d; best = i; } } return best; };
const i1 = Number(q.get('b1')) || find('Judah Street', '30th Avenue', i => P.style[i] === 2 && (P.flags[i] & 1) && !P.pitched[i]);
const out = [];
out.push(i1, await window.__bld5Close('v6stucco_' + suf, i1, 11, ['noon']));
return out;
