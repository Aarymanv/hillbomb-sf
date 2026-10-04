// HILLBOMB audio: world ambience from CC0 field recordings.
// Stereo beds crossfade by where the listener is (downtown / residential / park / waterfront / hilltop / tunnel)
// and the time of day; weather adds rain (street or roof, depending on being in a car) and wind; sparse one-shots
// (gulls, distant horns, dogs, the Golden Gate foghorn in fog) keep it alive. Beds only run while audible, and a bed
// that has been silent for a few seconds is stopped, so an idle ambience costs 1-3 buffer sources.

import { clamp, num, rand, smoothstep } from './dsp.js';
import { foghorn } from './sfx.js';

const BEDS = ['amb_city_day', 'amb_city_night', 'amb_residential', 'amb_waterfront', 'amb_park_day', 'amb_park_night', 'amb_wind_high', 'amb_tunnel', 'rain_light', 'rain_heavy', 'rain_car_roof',
  'amb_night_market', 'amb_indoor_walla'];
// street life by district: crowd / night-market chatter level [day, night]
const CROWD = { Chinatown: [0.45, 0.9], 'Haight-Ashbury': [0.15, 0.25], 'North Beach': [0.2, 0.55], "Fisherman's Wharf": [0.3, 0.3], 'Union Square': [0.25, 0.35], Tenderloin: [0.1, 0.3], Mission: [0.12, 0.3], Castro: [0.1, 0.3] };
// streets with cable-car lines (grip clatter, bells) and Market St (F-line streetcars, Muni)
const CABLE = /^(Powell|Hyde|Mason|California|Jackson|Washington) Street$/;
const MUNI = /^(Market Street|The Embarcadero)$/;
const DENSE = new Set(['Financial District', 'SoMa', 'Chinatown', 'North Beach', 'Nob Hill', 'Tenderloin', 'Civic Center', 'Mission', 'Mission Bay', 'Hayes Valley', "Fisherman's Wharf", 'Castro', 'Telegraph Hill']);
const PARK = new Set(['Golden Gate Park', 'Presidio', 'Lands End', 'Twin Peaks', 'Marin Headlands', 'Alcatraz', 'Yerba Buena Island']);

function setTo(param, v, now, tau) {
  try { param.cancelScheduledValues(now); param.setTargetAtTime(v, now, tau); } catch (e) { param.value = v; }
}

export class Ambience {
  constructor(core) {
    this.core = core;
    this.built = false;
    this.beds = new Map();  // key -> { src, g, silentFor }
    this.next = { gull: 0, honk: 0, dog: 0, siren: 0, fog: 0, bell: 0 };
    this.weather = { rain: 0, wind: 0, storm: 0, indoors: false };
    this.w = {}; // smoothed zone weights
    this.lastT = 0;
  }
  _ensure() {
    if (this.built) return true;
    const c = this.core;
    if (!c.ctx) return false;
    this.out = c.ctx.createGain();
    // indoors / in a car the outside world loses its top end, not just level
    this.muffle = c.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.out.connect(this.muffle); this.muffle.connect(c.ambBus);
    this.inner = c.ctx.createGain(); // beds that ARE the room (indoor walla): not muffled
    this.inner.connect(c.ambBus);
    this.built = true;
    this.lastT = c.ctx.currentTime;
    return true;
  }
  setWeather(o = {}) {
    this.weather.rain = clamp(num(o.rain, this.weather.rain), 0, 1);
    this.weather.wind = clamp(num(o.wind, this.weather.wind), 0, 1);
    this.weather.storm = clamp(num(o.storm, this.weather.storm), 0, 1);
    this.weather.indoors = !!o.indoors;
    this.core.wetness = this.weather.rain;
  }
  _bed(key, gain, now, rate = 1, dest = null) {
    let b = this.beds.get(key);
    if (gain < 0.001 && !b) return;
    if (!b) {
      const a = this.core.assets && this.core.assets.ready(key);
      if (!a) return;
      const ctx = this.core.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.core.assets.buf(a.file);
      src.loop = true; src.loopStart = a.loopStart; src.loopEnd = a.loopEnd;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g); g.connect(dest || this.out);
      src.start(0, a.loopStart + Math.random() * (a.loopEnd - a.loopStart));
      b = { src, g, silentFor: 0 };
      this.beds.set(key, b);
    }
    setTo(b.g.gain, gain, now, 1.2);
    b.silentFor = gain < 0.001 ? b.silentFor + 1 : 0;
  }
  /**
   * o: { city 0..1, water 0..1, park 0..1, night 0..1, altitude m, tunnel 0..1, fog 0..1, district name,
   *      interior (listener inside a car) bool, indoors bool, dt }
   */
  update(o) {
    if (!o || !this._ensure()) return;
    const core = this.core, now = core.ctx.currentTime;
    const dt = clamp(now - this.lastT, 0, 1);
    if (dt < 0.2 && !o.force) return; // beds are slow: ~4 Hz is plenty
    this.lastT = now;
    let city = num(o.city, NaN), park = num(o.park, NaN);
    if (o.district && !Number.isFinite(city)) city = DENSE.has(o.district) ? 1 : PARK.has(o.district) ? 0.1 : 0.45;
    if (o.district && !Number.isFinite(park)) park = PARK.has(o.district) ? 1 : 0;
    city = clamp(Number.isFinite(city) ? city : 0.6, 0, 1);
    park = clamp(Number.isFinite(park) ? park : 0, 0, 1);
    const water = clamp(num(o.water, 0), 0, 1);
    const night = clamp(num(o.night, 0), 0, 1), day = 1 - night;
    const alt = Math.max(0, num(o.altitude, 0));
    const high = smoothstep(60, 220, alt);
    const tunnel = clamp(num(o.tunnel, 0), 0, 1);
    const indoors = !!(o.indoors || this.weather.indoors);
    const inCar = !!o.interior;
    // smooth the zone weights (district borders are hard lines)
    const S = this.w, k = 1 - Math.exp(-dt / 2.5);
    const upd = (n, v) => { S[n] = S[n] === undefined ? v : S[n] + (v - S[n]) * k; return S[n]; };
    const wCity = upd('city', city * (1 - 0.7 * high) * (1 - tunnel));
    const wRes = upd('res', (1 - city) * (1 - park) * (1 - 0.7 * high) * (1 - tunnel));
    const wPark = upd('park', park * (1 - 0.5 * high) * (1 - tunnel));
    const wWater = upd('water', water * (1 - tunnel));
    const wHigh = upd('high', Math.max(high, 0.4 * this.weather.wind) * (1 - tunnel));
    const wTun = upd('tun', tunnel);
    const inside = indoors ? 0.3 : inCar ? 0.6 : 1; // cars and rooms dull the world
    const B = 0.9 * inside;
    setTo(this.muffle.frequency, indoors ? 900 : inCar ? 5000 : 20000, now, 0.4);
    const crowd = CROWD[o.district] || null;
    this._bed('amb_night_market', crowd ? B * wCity * (crowd[0] * day + crowd[1] * night) * 0.8 : 0, now);
    // indoor walla: level from the interior's character (hero_int_life sets core.indoorMur: church 0.05 .. busy hall 0.32)
    this._bed('amb_indoor_walla', indoors ? 0.7 * clamp(num(core.indoorMur, 0.16) / 0.16, 0.25, 1.8) : 0, now, 1, this.inner);
    this._bed('amb_city_day', B * wCity * day, now);
    this._bed('amb_city_night', B * wCity * night * 0.9, now);
    this._bed('amb_residential', B * wRes * (0.55 + 0.45 * day), now);
    this._bed('amb_park_day', B * wPark * day, now);
    this._bed('amb_park_night', B * (wPark + 0.4 * wRes) * night * 0.8, now);
    this._bed('amb_waterfront', B * wWater, now);
    this._bed('amb_wind_high', B * wHigh * (0.6 + 0.6 * this.weather.wind), now);
    this._bed('amb_tunnel', 0.9 * wTun, now);
    // rain: street rain outside, drumming roof inside a car
    const r = this.weather.rain;
    const heavy = smoothstep(0.45, 0.9, r);
    const outside = indoors ? 0.2 : inCar ? 0.35 : 1;
    this._bed('rain_light', 0.9 * r * (1 - heavy) * outside, now);
    this._bed('rain_heavy', 0.9 * heavy * outside, now);
    this._bed('rain_car_roof', inCar && !indoors ? 0.8 * Math.pow(r, 0.8) : 0, now);
    // stop beds that have been silent a while
    for (const [key, b] of this.beds) {
      if (b.silentFor > 16) { try { b.src.stop(now + 0.1); } catch (e) { /* ignore */ } setTimeout(() => { try { b.src.disconnect(); b.g.disconnect(); } catch (e) { /* ignore */ } }, 300); this.beds.delete(key); }
    }
    // ---- sparse one-shots
    const N = this.next;
    const lowAlt = alt < 150 && !indoors && tunnel < 0.5;
    if (lowAlt && wWater > 0.25 && day > 0.4 && now >= N.gull) {
      if (N.gull > 0) core.oneShot('gull', { pool: 'amb', distance: rand(25, 90), pan: rand(-0.9, 0.9), send: 0.3, ref: 20, gain: 0.5 * inside });
      N.gull = now + rand(8, 22) / wWater;
    }
    if (lowAlt && wCity > 0.35 && now >= N.honk) {
      if (N.honk > 0) core.oneShot('city_honk', { pool: 'amb', distance: rand(80, 260), pan: rand(-1, 1), send: 0.45, ref: 40, gain: 0.5 * inside * (0.4 + 0.6 * day) });
      N.honk = now + rand(10, 30);
    }
    if (lowAlt && wRes > 0.4 && now >= N.dog) {
      if (N.dog > 0 && Math.random() < 0.5) core.oneShot('dog_bark', { pool: 'amb', distance: rand(80, 200), pan: rand(-1, 1), send: 0.5, ref: 30, gain: 0.35 * inside });
      N.dog = now + rand(30, 70);
    }
    if (lowAlt && wCity > 0.5 && now >= N.siren) {
      if (N.siren > 0 && Math.random() < 0.4) core.oneShot('distant_siren', { pool: 'amb', distance: rand(300, 600), pan: rand(-1, 1), send: 0.6, ref: 60, gain: 0.4 * inside });
      N.siren = now + rand(60, 140);
    }
    if (lowAlt && wCity > 0.5 && day > 0.3 && now >= N.bell) {
      if (N.bell > 0 && Math.random() < 0.35) core.oneShot('muni_bell', { pool: 'amb', distance: rand(60, 180), pan: rand(-1, 1), send: 0.4, ref: 30, gain: 0.4 * inside });
      N.bell = now + rand(40, 90);
    }
    // street-specific: F-line streetcars on Market / the Embarcadero, cable cars pulling away on the cable-car streets
    const street = String(o.street || '');
    if (lowAlt && MUNI.test(street) && now >= (N.tram || 0)) {
      if (N.tram > 0) core.oneShot('muni_tram', { pool: 'amb', distance: rand(15, 45), pan: rand(-0.6, 0.6), send: 0.25, ref: 15, gain: 0.55 * inside * (0.5 + 0.5 * day) });
      N.tram = now + rand(35, 80);
    }
    if (lowAlt && CABLE.test(street) && day > 0.2 && now >= (N.cable || 0)) {
      if (N.cable > 0 && Math.random() < 0.6) core.oneShot('cablecar_go', { pool: 'amb', distance: rand(30, 90), pan: rand(-0.8, 0.8), send: 0.3, ref: 20, gain: 0.5 * inside });
      N.cable = now + rand(40, 90);
    }
    // Golden Gate foghorn: in fog near the bay or on the bridges, every ~20-40 s
    const fog = clamp(num(o.fog, 0), 0, 1);
    if (fog > 0.45 && (wWater > 0.2 || o.district === 'Golden Gate Bridge' || o.district === 'Marina' || o.district === 'Presidio') && now >= N.fog) {
      if (N.fog > 0) foghorn(core, num(o.foghornDistance, 1200));
      N.fog = now + rand(20, 40);
    }
  }
  /** thunder at distance (m); the weather system already delays it for sound travel */
  thunder(d) {
    const core = this.core;
    if (!core.canPlay()) return;
    const dist = Math.max(50, num(d, 2000));
    const near = dist < 1500;
    const inside = this.weather.indoors ? 0.5 : 1;
    const g = clamp(1.4 / (1 + dist / 1200), 0.15, 1) * inside;
    if (!core.oneShot(near ? 'thunder_near' : 'thunder_far', { pool: 'amb', gain: 0.9 * g, lp: clamp(12000 / (1 + dist / 800), 600, 12000), send: 0.3, rate: rand(0.92, 1.05) })) {
      core.ambPool.play((S, t) => {
        const n = S.noise(core.white, t, 0.5);
        const lp = S.filter('lowpass', near ? 900 : 300, 0.7);
        const gg = S.gain(0);
        n.connect(lp); lp.connect(gg); gg.connect(S.out);
        gg.gain.setValueAtTime(0, t);
        gg.gain.linearRampToValueAtTime(0.5 * g, t + (near ? 0.05 : 0.6));
        gg.gain.setTargetAtTime(0, t + 0.8, near ? 1.2 : 2);
        return 7;
      }, { send: 0.5 });
    }
    if (near && dist < 800) core.duck(0.2);
  }
  stats() { return { beds: [...this.beds.keys()] }; }
}
export { BEDS };
