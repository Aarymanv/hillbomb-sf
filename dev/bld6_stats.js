// headless body: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0" dev/bld6_stats.js  -> feature census
for (let k = 0; k < 600 && !(window.__world && window.__world.buildings && window.__world.buildings.plan); k++) await new Promise(r => setTimeout(r, 200));
const P = window.__world.buildings.plan, ZN = ['DOWNTOWN', 'SOMA', 'INDUSTRIAL', 'CHINATOWN', 'NORTHBEACH', 'WHARF', 'NOBHILL', 'TENDERLOIN', 'VICTORIAN', 'CASTRO', 'MISSION', 'MARINA', 'AVENUES', 'PRESIDIO', 'BAYVIEW', 'CIVIC'];
const out = {};
let kinds = {};
for (let i = 0; i < P.N; i++) {
  if (i < P.N0 && P.lotN[i]) continue;
  const z = ZN[P.zone[i]], o = out[z] || (out[z] = { n: 0, house: 0, yard: 0, bay: 0, pitched: 0, ff: 0 });
  o.n++;
  const st = P.style[i]; const house = st >= 0 && st <= 2;
  if (house) o.house++;
  if (P.yg && P.yg[i] > -1e3) o.yard++;
  if (P.flags[i] & 1) o.bay++;
  if (P.pitched[i] > 0 && P.pitched[i] < 8) o.pitched++;
  if (P.flags[i] & 64) o.ff++;
  const kd = P.bx.kind[i]; kinds[kd] = (kinds[kd] || 0) + 1;
}
for (const o of Object.values(out)) for (const k of ['house', 'yard', 'bay', 'pitched', 'ff']) o[k] = +(o[k] / o.n).toFixed(3);
return { out, kinds, repainted: P.repainted, S: 'see plan.js S' };
