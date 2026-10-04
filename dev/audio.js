// HILLBOMB audio bench: interactive test page for src/audio (sample-based engines, SFX, ambience, radio, mix).
import { createAudio, ENGINE_PROFILES, IMPACT_KINDS, UI_KINDS, BUSES } from '../src/audio/audio.js';
import * as SC from './audio.scenarios.js';

const $ = (id) => document.getElementById(id);
const val = (id) => parseFloat($(id).value);
const audio = createAudio();
window.audio = audio;

for (const row of document.querySelectorAll('label.row')) {
  const input = row.querySelector('input'), out = row.querySelector('span:last-child');
  const upd = () => { const v = parseFloat(input.value); out.textContent = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2); };
  input.addEventListener('input', upd); upd();
}
$('unlock').addEventListener('click', async () => { await audio.unlock(); $('unlock').textContent = 'Audio running'; $('unlock').classList.remove('primary'); });

// ---- engine
for (const p of ENGINE_PROFILES) if (p !== 'i3-turbo') $('profile').add(new Option(p, p, p === 'v8', p === 'v8'));
let eng = null, sweepT = 0;
function makeEngine() { if (eng) eng.stop(); eng = audio.createEngine($('profile').value); }
$('profile').addEventListener('change', () => { if ($('engOn').checked) makeEngine(); });
$('engOn').addEventListener('change', () => { if ($('engOn').checked) makeEngine(); else if (eng) { eng.stop(); eng = null; } });
$('cab').addEventListener('change', () => audio.setListener({ interior: $('cab').checked }));
$('shiftUp').onclick = () => audio.shift(true);
$('shiftDn').onclick = () => audio.shift(false);
$('backfire').onclick = () => audio.backfire();
$('starter').onclick = () => audio.starter();

// ---- impacts, horns, sirens, ui
for (const k of IMPACT_KINDS) { const b = document.createElement('button'); b.textContent = k; b.onclick = () => audio.impact(val('imp'), k); $('impacts').appendChild(b); }
for (const k of UI_KINDS) { const b = document.createElement('button'); b.textContent = k; b.onclick = () => audio.ui(k); $('ui').appendChild(b); }
$('horn').addEventListener('pointerdown', () => audio.horn(true, $('hornType').value));
$('horn').addEventListener('pointerup', () => audio.horn(false));
$('horn').addEventListener('pointerleave', () => audio.horn(false));
let siren = null;
$('siren').onclick = () => { if (!siren) { siren = audio.createSiren(); siren.setActive(true); siren.setSpatial({ distance: 20, pan: 0.3 }); } else { siren.stop(); siren = null; } };
$('yelp').onclick = () => siren && siren.setMode(siren._yelp = !siren._yelp ? 'yelp' : 'wail');
$('bell').onclick = () => audio.cableCarBell({ distance: 25, pan: -0.4 });
$('passby').onclick = () => audio.passby({ delay: 0.8, side: 1, dmin: 4 });
let brakeT = 0;
$('brake').onclick = () => { brakeT = 2.5; $('speed').value = 6; };

// ---- ambience
for (const d of ['Financial District', 'Mission', 'Pacific Heights', 'Richmond', 'Golden Gate Park', 'Presidio', "Fisherman's Wharf", 'Golden Gate Bridge', 'Twin Peaks']) $('district').add(new Option(d, d));
$('thunderN').onclick = () => audio.thunder(600);
$('thunderF').onclick = () => audio.thunder(4000);
$('foghorn').onclick = () => audio.foghorn(900);

// ---- radio + volumes
$('radioOn').onclick = () => audio.radio.setOn(!audio.radio.isOn());
$('nextSt').onclick = () => audio.radio.nextStation();
$('prevSt').onclick = () => audio.radio.prevStation();
audio.radio.subscribe((c) => { $('track').textContent = `${c.name}  ${c.track || ''}`; });
for (const b of BUSES) {
  const l = document.createElement('label'); l.className = 'row';
  l.innerHTML = `<span>${b}</span><input type="range" min="0" max="1" step="0.01" value="${audio.getVolume(b)}"><span>${audio.getVolume(b).toFixed(2)}</span>`;
  const i = l.querySelector('input'); i.oninput = () => { audio.setVolume(b, +i.value); l.lastChild.textContent = (+i.value).toFixed(2); };
  $('vols').appendChild(l);
}

// ---- main loop (30 Hz, like the game's audio updates)
let last = performance.now();
setInterval(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (eng) {
    let rpm = val('rpm');
    if ($('sweep').checked) { sweepT += dt; const u = (Math.sin(sweepT * 0.6 - Math.PI / 2) + 1) / 2; rpm = val('idle') + (val('red') - val('idle')) * u; $('rpm').value = rpm; $('thr').value = Math.cos(sweepT * 0.6 - Math.PI / 2) > 0 ? 1 : 0; }
    eng.setSpatial({ distance: val('dist'), pan: 0.3, velocity: 0 });
    eng.update({ rpm, idleRpm: val('idle'), redline: val('red'), throttle: val('thr'), load: val('thr'), speed: val('speed'), gear: 3 });
  }
  if (brakeT > 0) { brakeT -= dt; $('speed').value = Math.max(0, val('speed') - 3 * dt); }
  audio.tires.update({ slip: val('slip'), speed: val('speed'), surface: $('surface').value, brake: brakeT > 0 ? 1 : 0 });
  audio.wind.update(val('speed'));
  audio.scrape(val('scrape'));
  audio.weather({ rain: val('rain'), wind: val('wind') });
  if ($('ambOn').checked) audio.ambience.update({ district: $('district').value, night: val('night'), water: val('water'), altitude: val('alt'), fog: val('fog'), interior: $('cab').checked });
  else audio.ambience.update({ city: 0, park: 0, water: 0, altitude: 0 });
}, 33);

// ---- meter: short-term RMS + peak from the output analyser
const buf = new Float32Array(2048);
setInterval(() => {
  const an = audio.analyser(); if (!an) return;
  an.getFloatTimeDomainData(buf);
  let s = 0, p = 0; for (const x of buf) { s += x * x; p = Math.max(p, Math.abs(x)); }
  const db = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
  const st = audio.stats();
  $('meter').textContent = `rms ${db(Math.sqrt(s / buf.length)).toFixed(1)} dBFS  peak ${db(p).toFixed(1)}  lim ${st.limiterReduction} dB  engines ${st.engines} (src ${st.engineSources})  beds ${st.ambience.beds.length}`;
}, 200);

// ---- offline scenarios
$('runAll').onclick = async () => {
  $('out').textContent = 'rendering...';
  const r = await SC.run({ impl: 'new' });
  $('out').textContent = r.map((x) => `${x.name.padEnd(9)} LUFS ${String(x.lufs).padStart(6)}  short-max ${String(x.shortMax).padStart(6)}  peak ${String(x.peakDb).padStart(6)} dBFS  clipped ${x.clipped}  render ${x.ms} ms`).join('\n');
};
