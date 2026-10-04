// Car roster (fictional makes/models, handling + economy) and the Vehicle wrapper (physics body + visual model + lights
// + audio voice). Per-instance builds (upgrades / tune / paint) come from src/game/sys_garage.js through
// setBuildProvider(); a Vehicle created with role 'player' asks the provider for its build.
//
// Roster entry fields (the ones other modules read are marked *):
//   name* (full display name), make/makeName, modelName, year, country, cat, tags, rarity, price* (null = not for sale)
//   model* = 3D model id in models.js, paint (default colour)
//   drive*, layoutBias (F | M | R | FWD: static weight split), engine* (audio profile), eng (description), asp
//   mass*, torque* (physics peak Nm), redline, idle, gearsN + v1 (1st gear km/h) + top* (km/h) -> gears*/final (derived)
//   grip*, gripF/gripR, tyre (stock compound), brake (g), downforce (N per (m/s)^2), steer, steerSpeed, assist, yawDamp,
//   slipFalloff, travel, comY, inertiaScale, antiRoll, swaps (engine swap ids, tuning.js SWAPS)
//   cls* / pi (derived lazily from measured performance, see tuning.js)
import * as THREE from 'three';
import { CarBody } from './physics.js';
import * as M from './models.js';
import { designGears, deriveParams, applyUpgrades, applyTune, measure, peakPower } from './tuning.js';

// ------------------------------------------------------------------ makes
export const MAKES = {
  bayliss: { name: 'Bayliss', country: 'USA', blurb: 'Detroit since 1903. Pony cars, trucks and small hatches for everyone.' },
  cardinal: { name: 'Cardinal', country: 'USA', blurb: 'Big-block V8s, fibreglass sports cars and full-size family haulers.' },
  hargrove: { name: 'Hargrove', country: 'USA', blurb: 'Loud, heavy and unapologetic. Muscle since 1966.' },
  meridian: { name: 'Meridian', country: 'USA', blurb: 'Sensible sedans, cabs and fleet cars.' },
  metro: { name: 'Metro Coachworks', country: 'USA', blurb: 'Buses and vans that keep the city moving.' },
  mesa: { name: 'Mesa Offroad', country: 'USA', blurb: 'Desert racers from Ensenada to Vegas.' },
  sandpiper: { name: 'Sandpiper', country: 'USA', blurb: 'Fibreglass beach buggies from Pismo Beach.' },
  volta: { name: 'Volta', country: 'USA', blurb: 'Silicon Valley electric cars.' },
  kaze: { name: 'Kaze', country: 'Japan', blurb: 'Rotary engines and light roadsters from Hiroshima.' },
  tenzan: { name: 'Tenzan', country: 'Japan', blurb: 'Bulletproof six-cylinders, 4x4s and the hachi-roku legend.' },
  himura: { name: 'Himura', country: 'Japan', blurb: 'Twin-turbo all-wheel-drive giant killers.' },
  ichiban: { name: 'Ichiban', country: 'Japan', blurb: 'High-revving VTEC-era engineering and red badges.' },
  sakata: { name: 'Sakata', country: 'Japan', blurb: 'Rally-bred turbo sedans.' },
  mutsu: { name: 'Mutsu', country: 'Japan', blurb: 'Boxer engines and blue-and-gold rally cars.' },
  schwabe: { name: 'Schwabe', country: 'Germany', blurb: 'Rear-engined sports cars from Stuttgart since 1948.' },
  kessler: { name: 'Kessler', country: 'Germany', blurb: 'Motorsport-division sedans from Munich.' },
  heimwagen: { name: 'Heimwagen', country: 'Germany', blurb: 'The people\'s car company.' },
  vierling: { name: 'Vierling', country: 'Germany', blurb: 'Four rings of all-wheel-drive rally history.' },
  toro: { name: 'Toro', country: 'Italy', blurb: 'Wedges, scissor doors and V12s from Sant\'Agata.' },
  rossetti: { name: 'Rossetti', country: 'Italy', blurb: 'Prancing thoroughbreds from Maranello.' },
  delfino: { name: 'Delfino', country: 'Italy', blurb: 'Rally champions from Turin.' },
  motta: { name: 'Motta', country: 'Italy', blurb: 'Tiny cars for tiny streets.' },
  rochelle: { name: 'Rochelle', country: 'France', blurb: 'Lively hot hatches from Sochaux.' },
  moreau: { name: 'Moreau', country: 'France', blurb: 'Molsheim hypercars: sixteen cylinders, four turbos.' },
  ashcombe: { name: 'Ashcombe', country: 'UK', blurb: 'Grand tourers for spies and gentlemen.' },
  merrick: { name: 'Merrick', country: 'UK', blurb: 'Woking engineering, three seats, one goal.' },
  pembrook: { name: 'Pembrook', country: 'UK', blurb: 'The small car that won Monte Carlo.' },
  hawthorne: { name: 'Hawthorne', country: 'UK', blurb: 'Solihull 4x4s that go anywhere.' },
  kestrel: { name: 'Kestrel', country: 'UK', blurb: 'Seven decades of lightweight track toys.' },
  kronvall: { name: 'Kronvall', country: 'Sweden', blurb: 'Ghost-badged megacars from Ängelholm.' },
  iskra: { name: 'Iskra', country: 'Croatia', blurb: 'Electric hypercars built in a garage near Zagreb.' },
  powell: { name: 'Powell St. Railway', country: 'USA', blurb: 'San Francisco cable cars.' },
};

// ------------------------------------------------------------------ roster
// Each car: design targets (top speed, 1st-gear speed, power via torque) -> gearing and drag are derived so the car
// actually does what the archetype does. Numbers are verified by the lab (dev/cars.html?lab, tools in the report).
const RAW = [
  // ---------------- city / everyday
  ['piccina', { make: 'motta', modelName: 'Piccina', year: 1965, cat: 'city', model: 'piccina', rarity: 'rare', price: 9000, paint: 0x9fd0c9,
    drive: 'RWD', layoutBias: 'R', engine: 'i4', ideal: 'twin', eng: '0.5L 2-cyl', asp: 'NA', mass: 530, torque: 50, redline: 5200, idle: 900, gearsN: 4, v1: 30, top: 105,
    grip: 0.84, tyre: 'vintage', brake: 0.78, downforce: 0, steer: 0.7, travel: 0.2, comY: 0.5, inertiaScale: 0.8, swaps: ['f4big'], tags: ['classic', 'tiny', 'italian'] }],
  ['nipper', { make: 'pembrook', modelName: 'Nipper S', year: 1965, cat: 'city', model: 'nipper', rarity: 'rare', price: 21000, paint: 0x8c1c24, paint2: 0xefe9dc,
    drive: 'FWD', layoutBias: 'FWD', engine: 'i4', eng: '1.3L I4', asp: 'NA', mass: 660, torque: 120, redline: 6500, idle: 850, gearsN: 4, v1: 52, top: 158,
    grip: 0.93, tyre: 'vintage', brake: 0.92, downforce: 0, steer: 0.68, assist: 0.5, travel: 0.2, inertiaScale: 0.78, swaps: ['i4t'], tags: ['classic', 'hot-hatch', 'british'] }],
  ['hatch', { make: 'bayliss', modelName: 'Kiwi GT', year: 2016, cat: 'city', model: 'hatch', rarity: 'common', price: 12000, paint: 0xc8352c,
    drive: 'FWD', layoutBias: 'FWD', engine: 'i4', eng: '1.6L I4', asp: 'NA', mass: 1090, torque: 182, redline: 6800, idle: 850, gearsN: 5, v1: 50, top: 192,
    grip: 0.96, tyre: 'eco', brake: 1.0, downforce: 0.05, steer: 0.64, swaps: ['i4t'], tags: ['modern', 'starter'] }],
  ['sedan', { make: 'meridian', modelName: 'Sedan', year: 2020, cat: 'city', model: 'sedan', rarity: 'common', price: 22000, paint: 0x2b3a55,
    drive: 'FWD', layoutBias: 'FWD', engine: 'i4', eng: '2.5L I4', asp: 'NA', mass: 1460, torque: 330, redline: 6500, idle: 750, gearsN: 6, v1: 55, top: 210,
    grip: 0.92, tyre: 'eco', brake: 1.02, downforce: 0.05, steer: 0.6, swaps: ['v6tt'], tags: ['modern', 'family'] }],
  ['taxi', { make: 'meridian', modelName: 'Cab', year: 2012, cat: 'special', model: 'taxi', rarity: 'rare', price: null, paint: 0xf2b90f,
    box: 'auto', drive: 'RWD', layoutBias: 'F', engine: 'v6', eng: '4.6L V8', asp: 'NA', mass: 1720, torque: 430, redline: 5800, idle: 700, gearsN: 4, v1: 70, top: 195,
    grip: 0.9, tyre: 'eco', brake: 0.98, downforce: 0.05, steer: 0.6, assist: 0.6, tags: ['sf', 'special'] }],
  ['police', { make: 'meridian', modelName: 'Interceptor', year: 2020, cat: 'special', model: 'police', rarity: 'epic', price: null, paint: 0x0c0c0e,
    box: 'auto', drive: 'AWD', layoutBias: 'F', engine: 'v6', eng: '3.5L TT V6', asp: 'twin-turbo', mass: 1870, torque: 640, redline: 6600, idle: 750, gearsN: 6, v1: 62, top: 240,
    grip: 1.0, brake: 1.12, downforce: 0.1, steer: 0.58, tags: ['sf', 'special', 'police'] }],
  ['van', { make: 'metro', modelName: 'Cargomaster HD', year: 2019, cat: 'truck', model: 'van', rarity: 'common', price: 28000, paint: 0xf2f2f0,
    cdaMax: 1.35, box: 'auto', antiRoll: 0.8, drive: 'RWD', layoutBias: 'F', engine: 'diesel', eng: '3.0L TD V6', asp: 'turbo', mass: 2600, torque: 560, redline: 4600, idle: 700, gearsN: 6, v1: 38, top: 160,
    grip: 0.84, tyre: 'eco', brake: 0.85, downforce: 0, steer: 0.55, comY: 0.86, travel: 0.3, tags: ['van', 'utility'] }],
  ['boxtruck', { make: 'metro', modelName: 'Hauler 16', year: 2017, cat: 'truck', model: 'boxtruck', rarity: 'rare', price: 36000, paint: 0xf0f0ee, paint2: 0xf4f4f2,
    cdaMax: 3.2, box: 'auto', antiRoll: 0.85, drive: 'RWD', layoutBias: 'F', engine: 'diesel', eng: '6.7L TD V8', asp: 'turbo', mass: 5200, torque: 880, redline: 3600, idle: 650, gearsN: 6, v1: 30, top: 125,
    grip: 0.82, tyre: 'eco', brake: 0.78, downforce: 0, steer: 0.52, steerSpeed: 9, comY: 1.0, travel: 0.3, tags: ['van', 'utility', 'sf'] }],
  ['bus', { make: 'metro', modelName: 'Transit 40', year: 2018, cat: 'special', model: 'bus', rarity: 'epic', price: 60000, paint: 0xc7cbd0,
    cdaMax: 7.0, drive: 'RWD', layoutBias: 'R', engine: 'bus', eng: '8.9L I6 diesel', asp: 'turbo', mass: 11000, torque: 1900, redline: 2600, idle: 600, gearsN: 5, v1: 22, top: 100,
    grip: 0.88, brake: 0.7, downforce: 0, steer: 0.6, steerSpeed: 9, comY: 1.0, travel: 0.3, tags: ['sf', 'special', 'utility'] }],
  // ---------------- hot hatches
  ['petard', { make: 'rochelle', modelName: 'Pétard GTi', year: 1987, cat: 'hothatch', model: 'petard', rarity: 'rare', price: 17000, paint: 0xf4f2ee,
    drive: 'FWD', layoutBias: 'FWD', engine: 'i4', eng: '1.9L I4', asp: 'NA', mass: 880, torque: 192, redline: 6900, idle: 850, gearsN: 5, v1: 55, top: 206,
    grip: 0.97, tyre: 'street', brake: 1.0, downforce: 0.02, steer: 0.66, assist: 0.45, yawDamp: 0.24, inertiaScale: 0.8, swaps: ['i4t'], tags: ['classic', 'hot-hatch', 'french'] }],
  ['gauner', { make: 'heimwagen', modelName: 'Gauner R', year: 2021, cat: 'hothatch', model: 'gauner', rarity: 'rare', price: 44000, paint: 0x2d5fa6,
    box: 'dct', drive: 'AWD', layoutBias: 'FWD', engine: 'i4', eng: '2.0L T I4', asp: 'turbo', mass: 1520, torque: 530, redline: 6800, idle: 850, gearsN: 7, v1: 58, top: 250,
    grip: 1.03, tyre: 'sport', brake: 1.1, downforce: 0.15, steer: 0.62, swaps: ['i5t'], tags: ['modern', 'hot-hatch', 'awd'] }],
  ['tora', { make: 'ichiban', modelName: 'Tora Type-RR', year: 2019, cat: 'hothatch', model: 'tora', rarity: 'epic', price: 46000, paint: 0xe9e9e6,
    drive: 'FWD', layoutBias: 'FWD', engine: 'i4', eng: '2.0L T I4', asp: 'turbo', mass: 1390, torque: 505, redline: 7000, idle: 850, gearsN: 6, v1: 62, top: 272,
    grip: 1.05, tyre: 'sport', brake: 1.14, downforce: 0.3, steer: 0.62, assist: 0.5, swaps: ['v6tt'], tags: ['modern', 'hot-hatch', 'jdm'] }],
  // ---------------- 60s/70s muscle
  ['muscle', { make: 'bayliss', modelName: 'Stallion 390 GT Fastback', year: 1968, cat: 'muscle', model: 'muscle', rarity: 'legendary', price: 78000, paint: 0x1f3a2c,
    drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '6.4L V8', asp: 'NA', mass: 1540, torque: 625, redline: 5800, idle: 750, gearsN: 4, v1: 82, top: 212,
    grip: 0.9, tyre: 'vintage', brake: 0.86, downforce: 0, steer: 0.58, assist: 0.62, slipFalloff: 0.08, yawDamp: 0.3, swaps: ['v8big', 'v8race'], tags: ['classic', 'muscle', 'hero', 'sf-chase'] }],
  ['brawler', { make: 'hargrove', modelName: 'Brawler 440', year: 1969, cat: 'muscle', model: 'brawler', rarity: 'epic', price: 72000, paint: 0x101012,
    drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '7.2L V8', asp: 'NA', mass: 1760, torque: 760, redline: 5600, idle: 700, gearsN: 3, v1: 98, top: 222,
    grip: 0.88, tyre: 'vintage', brake: 0.82, downforce: 0, steer: 0.56, assist: 0.62, slipFalloff: 0.08, yawDamp: 0.3, swaps: ['v8big'], tags: ['classic', 'muscle', 'sf-chase'] }],
  ['vandal', { make: 'cardinal', modelName: 'Vandal 454', year: 1970, cat: 'muscle', model: 'vandal', rarity: 'epic', price: 68000, paint: 0xd8a51b, paint2: 0x111111,
    drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '7.4L V8', asp: 'NA', mass: 1720, torque: 860, redline: 5800, idle: 700, gearsN: 4, v1: 88, top: 225,
    grip: 0.89, tyre: 'vintage', brake: 0.84, downforce: 0, steer: 0.56, assist: 0.6, slipFalloff: 0.08, yawDamp: 0.3, swaps: ['v8race'], tags: ['classic', 'muscle'] }],
  // ---------------- modern muscle
  ['stallion18', { make: 'bayliss', modelName: 'Stallion GT', year: 2018, cat: 'modernmuscle', model: 'stallion18', rarity: 'rare', price: 42000, paint: 0x1d57c2,
    box: 'auto', gripR: 1.08, frontBias: 0.53, drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '5.0L V8', asp: 'NA', mass: 1740, torque: 690, redline: 7500, idle: 750, gearsN: 6, v1: 72, top: 250,
    grip: 1.0, tyre: 'sport', brake: 1.1, downforce: 0.15, steer: 0.58, assist: 0.6, slipFalloff: 0.08, swaps: ['v8tt', 'v8race'], tags: ['modern', 'muscle'] }],
  ['hellion', { make: 'hargrove', modelName: 'Hellion Widebody', year: 2021, cat: 'modernmuscle', model: 'hellion', rarity: 'epic', price: 88000, paint: 0x7a1417,
    box: 'auto', gripR: 1.18, drive: 'RWD', layoutBias: 'F', engine: 'v8', ideal: 'v8sc', eng: '6.2L SC V8', asp: 'supercharged', mass: 2000, torque: 1400, redline: 6300, idle: 750, gearsN: 8, v1: 75, top: 327,
    grip: 1.02, tyre: 'sport', brake: 1.12, downforce: 0.2, steer: 0.56, assist: 0.62, slipFalloff: 0.09, tags: ['modern', 'muscle'] }],
  ['corsair', { make: 'cardinal', modelName: 'Corsair Z', year: 2019, cat: 'modernmuscle', model: 'corsair', rarity: 'epic', price: 92000, paint: 0xe8b40f,
    box: 'dct', gripR: 1.12, drive: 'RWD', layoutBias: 'F', frontBias: 0.5, engine: 'v8', ideal: 'v8sc', eng: '6.2L SC V8', asp: 'supercharged', mass: 1600, torque: 1080, redline: 6600, idle: 800, gearsN: 7, v1: 78, top: 315,
    grip: 1.1, tyre: 'semi', brake: 1.3, downforce: 0.85, steer: 0.58, assist: 0.58, slipFalloff: 0.07, swaps: ['v8race'], tags: ['modern', 'muscle', 'sports'] }],
  // ---------------- JDM legends
  ['rz7', { make: 'kaze', modelName: 'RZ-7 Spirit', year: 1993, cat: 'jdm', model: 'rz7', rarity: 'epic', price: 58000, paint: 0xc21a1a,
    stab: 0.02, drive: 'RWD', layoutBias: 'F', frontBias: 0.5, engine: 'i4', ideal: 'rotary', eng: '1.3L twin-rotor TT', asp: 'twin-turbo', mass: 1280, torque: 360, redline: 8000, idle: 1000, gearsN: 5, v1: 64, top: 255,
    grip: 0.98, tyre: 'street', brake: 1.08, downforce: 0.12, steer: 0.62, assist: 0.55, slipFalloff: 0.09, swaps: ['r4rotor', 'v8race'], tags: ['classic', 'jdm', 'drift'] }],
  ['kaminari', { make: 'tenzan', modelName: 'Kaminari RZ', year: 1998, cat: 'jdm', model: 'kaminari', rarity: 'legendary', price: 96000, paint: 0xe07a12,
    gripR: 1.05, drive: 'RWD', layoutBias: 'F', engine: 'v6', ideal: 'i6', eng: '3.0L TT I6', asp: 'twin-turbo', mass: 1570, torque: 540, redline: 6800, idle: 850, gearsN: 6, v1: 62, top: 285,
    grip: 0.99, tyre: 'street', brake: 1.1, downforce: 0.22, steer: 0.6, assist: 0.58, slipFalloff: 0.08, swaps: ['i6tt', 'v8tt'], tags: ['classic', 'jdm'] }],
  ['raiden', { make: 'himura', modelName: 'Raiden GT-R', year: 1999, cat: 'jdm', model: 'raiden', rarity: 'legendary', price: 110000, paint: 0x2f4fa3,
    drive: 'AWD', layoutBias: 'F', engine: 'v6', ideal: 'i6', eng: '2.6L TT I6', asp: 'twin-turbo', mass: 1560, torque: 490, redline: 7500, idle: 850, gearsN: 6, v1: 60, top: 265,
    grip: 1.0, tyre: 'street', brake: 1.1, downforce: 0.2, steer: 0.6, swaps: ['i6tt'], tags: ['classic', 'jdm', 'awd'] }],
  ['senkou', { make: 'ichiban', modelName: 'Senkou NX', year: 1992, cat: 'jdm', model: 'senkou', rarity: 'epic', price: 84000, paint: 0xcfd2d4,
    drive: 'RWD', layoutBias: 'M', engine: 'v6', eng: '3.0L V6', asp: 'NA', mass: 1370, torque: 375, redline: 8000, idle: 900, gearsN: 5, v1: 66, top: 270,
    grip: 1.0, tyre: 'street', brake: 1.1, downforce: 0.15, steer: 0.6, inertiaScale: 0.78, swaps: ['v6tt'], tags: ['classic', 'jdm', 'mid-engine'] }],
  ['hachi', { make: 'tenzan', modelName: 'Hachi 1600', year: 1986, cat: 'jdm', model: 'hachi', rarity: 'rare', price: 26000, paint: 0xf2f2f0, paint2: 0x131315,
    stab: 0.02, drive: 'RWD', layoutBias: 'F', frontBias: 0.54, engine: 'i4', eng: '1.6L I4', asp: 'NA', mass: 950, torque: 174, redline: 7600, idle: 900, gearsN: 5, v1: 55, top: 196,
    grip: 0.93, tyre: 'street', brake: 0.98, downforce: 0.02, steer: 0.66, assist: 0.5, slipFalloff: 0.12, yawDamp: 0.22, swaps: ['i4t', 'v8race'], tags: ['classic', 'jdm', 'drift'] }],
  ['sora', { make: 'kaze', modelName: 'Sora Roadster', year: 1990, cat: 'jdm', model: 'sora', rarity: 'common', price: 18000, paint: 0xb3121a,
    drive: 'RWD', layoutBias: 'F', frontBias: 0.52, engine: 'i4', eng: '1.6L I4', asp: 'NA', mass: 960, torque: 168, redline: 7200, idle: 850, gearsN: 5, v1: 55, top: 196,
    grip: 0.95, tyre: 'street', brake: 1.0, downforce: 0, steer: 0.66, assist: 0.52, slipFalloff: 0.09, yawDamp: 0.24, inertiaScale: 0.8, swaps: ['i4t'], tags: ['classic', 'jdm', 'roadster'] }],
  // ---------------- Euro sports
  ['coupe', { make: 'schwabe', modelName: '9R Carrera S', year: 2020, cat: 'euro', model: 'coupe', rarity: 'epic', price: 125000, paint: 0xb9bdc2,
    box: 'dct', drive: 'RWD', layoutBias: 'R', engine: 'flat6', eng: '3.0L TT flat-6', asp: 'twin-turbo', mass: 1515, torque: 660, redline: 7500, idle: 900, gearsN: 8, v1: 62, top: 308,
    grip: 1.1, tyre: 'sport', brake: 1.28, downforce: 0.4, steer: 0.6, assist: 0.55, swaps: ['v8race'], tags: ['modern', 'sports'] }],
  ['classic9', { make: 'schwabe', modelName: '9R RS 2.7', year: 1973, cat: 'euro', model: 'classic9', rarity: 'legendary', price: 360000, paint: 0xf1efe6, paint2: 0x1e4fb3,
    drive: 'RWD', layoutBias: 'R', engine: 'flat6', eng: '2.7L flat-6', asp: 'NA', mass: 975, torque: 322, redline: 7300, idle: 950, gearsN: 5, v1: 64, top: 245,
    grip: 0.95, tyre: 'vintage', brake: 1.0, downforce: 0.05, steer: 0.62, assist: 0.5, slipFalloff: 0.1, yawDamp: 0.22, inertiaScale: 0.8, tags: ['classic', 'sports'] }],
  ['coupeGT', { make: 'schwabe', modelName: '9R GT3 RS', year: 2019, cat: 'track', model: 'coupeGT', rarity: 'legendary', price: 205000, paint: 0x6fc13b,
    box: 'dct', drive: 'RWD', layoutBias: 'R', engine: 'flat6', eng: '4.0L flat-6', asp: 'NA', mass: 1430, torque: 645, redline: 9000, idle: 950, gearsN: 7, v1: 70, top: 312,
    grip: 1.14, tyre: 'semi', brake: 1.36, downforce: 1.35, steer: 0.6, assist: 0.55, tags: ['modern', 'sports', 'track'] }],
  ['k5', { make: 'kessler', modelName: 'K5 Sport', year: 2019, cat: 'euro', model: 'k5', rarity: 'epic', price: 104000, paint: 0x23282f,
    box: 'dct', drive: 'AWD', layoutBias: 'F', engine: 'v8', eng: '4.4L TT V8', asp: 'twin-turbo', mass: 1855, torque: 930, redline: 7200, idle: 750, gearsN: 8, v1: 66, top: 305,
    grip: 1.05, tyre: 'sport', brake: 1.2, downforce: 0.2, steer: 0.58, tags: ['modern', 'sedan', 'awd'] }],
  ['k3', { make: 'kessler', modelName: 'K3 Evolution', year: 1988, cat: 'euro', model: 'k3', rarity: 'epic', price: 92000, paint: 0xf1f1ee,
    drive: 'RWD', layoutBias: 'F', frontBias: 0.52, engine: 'i4', eng: '2.3L I4', asp: 'NA', mass: 1200, torque: 332, redline: 7250, idle: 900, gearsN: 5, v1: 62, top: 243,
    grip: 0.98, tyre: 'street', brake: 1.05, downforce: 0.08, steer: 0.62, assist: 0.55, slipFalloff: 0.08, swaps: ['i6tt', 'v8race'], tags: ['classic', 'touring'] }],
  ['sovereign', { make: 'ashcombe', modelName: 'Sovereign', year: 1964, cat: 'euro', model: 'sovereign', rarity: 'legendary', price: 640000, paint: 0xa9adb0,
    yawDamp: 0.3, drive: 'RWD', layoutBias: 'F', engine: 'v6', ideal: 'i6', eng: '4.0L I6', asp: 'NA', mass: 1500, torque: 545, redline: 5750, idle: 750, gearsN: 5, v1: 70, top: 233,
    grip: 0.86, tyre: 'vintage', brake: 0.85, downforce: 0, steer: 0.56, assist: 0.6, slipFalloff: 0.08, tags: ['classic', 'gt', 'british'] }],
  ['vanguard', { make: 'ashcombe', modelName: 'Vanguard V12', year: 2019, cat: 'euro', model: 'vanguard', rarity: 'epic', price: 310000, paint: 0x1f4a3b,
    box: 'auto', gripR: 1.1, drive: 'RWD', layoutBias: 'F', frontBias: 0.51, engine: 'v12', eng: '5.2L TT V12', asp: 'twin-turbo', mass: 1700, torque: 1140, redline: 7000, idle: 800, gearsN: 8, v1: 72, top: 340,
    grip: 1.07, tyre: 'sport', brake: 1.25, downforce: 0.5, steer: 0.57, tags: ['modern', 'gt', 'british'] }],
  // ---------------- rally legends
  ['rally', { make: 'bayliss', modelName: 'Kiwi R27 Rally', year: 2019, cat: 'rally', model: 'rally', rarity: 'epic', price: 120000, paint: 0x1464c8, paint2: 0xf5f5f5,
    cdaMax: 0.95, box: 'seq', drive: 'AWD', layoutBias: 'FWD', frontBias: 0.58, engine: 'rally', eng: '1.6L T I4', asp: 'turbo', mass: 1230, torque: 430, redline: 7500, idle: 1000, gearsN: 5, v1: 58, top: 200,
    grip: 1.03, tyre: 'rally', brake: 1.12, downforce: 0.2, steer: 0.66, travel: 0.32, swaps: ['i5t'], tags: ['modern', 'rally', 'awd'] }],
  ['sport1', { make: 'vierling', modelName: 'Sport 1 E2', year: 1985, cat: 'rally', model: 'sport1', rarity: 'legendary', price: 720000, paint: 0xf2f2ee, paint2: 0xc3141b,
    cdaMax: 1.0, box: 'seq', drive: 'AWD', layoutBias: 'F', frontBias: 0.6, engine: 'rally', ideal: 'i5', eng: '2.1L T I5', asp: 'turbo', mass: 1090, torque: 690, redline: 7600, idle: 1000, gearsN: 5, v1: 64, top: 235,
    grip: 1.02, tyre: 'rally', brake: 1.08, downforce: 0.35, steer: 0.62, travel: 0.32, tags: ['classic', 'rally', 'awd', 'group-b'] }],
  ['aspro', { make: 'delfino', modelName: 'Aspro Evo', year: 1992, cat: 'rally', model: 'aspro', rarity: 'epic', price: 68000, paint: 0xc4151c,
    drive: 'AWD', layoutBias: 'FWD', frontBias: 0.6, engine: 'rally', eng: '2.0L T I4', asp: 'turbo', mass: 1340, torque: 345, redline: 6800, idle: 900, gearsN: 5, v1: 55, top: 220,
    grip: 0.99, tyre: 'street', brake: 1.02, downforce: 0.1, steer: 0.62, travel: 0.3, swaps: ['i5t'], tags: ['classic', 'rally', 'awd'] }],
  ['rallye6', { make: 'sakata', modelName: 'Rallye VI', year: 1999, cat: 'rally', model: 'rallye6', rarity: 'epic', price: 58000, paint: 0xd11f25,
    drive: 'AWD', layoutBias: 'FWD', frontBias: 0.59, engine: 'rally', eng: '2.0L T I4', asp: 'turbo', mass: 1360, torque: 445, redline: 7000, idle: 900, gearsN: 5, v1: 58, top: 240,
    grip: 1.02, tyre: 'street', brake: 1.1, downforce: 0.2, steer: 0.62, travel: 0.29, swaps: ['i4t'], tags: ['classic', 'rally', 'jdm', 'awd'] }],
  ['saetta', { make: 'delfino', modelName: 'Saetta HF', year: 1974, cat: 'rally', model: 'saetta', rarity: 'legendary', price: 480000, paint: 0x2f7fd1,
    drive: 'RWD', layoutBias: 'M', engine: 'v6', eng: '2.4L V6', asp: 'NA', mass: 980, torque: 272, redline: 7800, idle: 900, gearsN: 5, v1: 62, top: 230,
    grip: 0.95, tyre: 'street', brake: 1.0, downforce: 0.08, steer: 0.64, assist: 0.5, slipFalloff: 0.1, yawDamp: 0.2, inertiaScale: 0.7, travel: 0.3, tags: ['classic', 'rally', 'mid-engine'] }],
  ['seiun', { make: 'mutsu', modelName: 'Seiun 22R', year: 1998, cat: 'rally', model: 'seiun', rarity: 'legendary', price: 160000, paint: 0x1d3f9e,
    drive: 'AWD', layoutBias: 'F', frontBias: 0.57, engine: 'rally', ideal: 'flat4', eng: '2.2L T flat-4', asp: 'turbo', mass: 1270, torque: 395, redline: 7900, idle: 900, gearsN: 5, v1: 60, top: 248,
    grip: 1.02, tyre: 'street', brake: 1.08, downforce: 0.2, steer: 0.62, travel: 0.29, swaps: ['f4big'], tags: ['classic', 'rally', 'jdm', 'awd'] }],
  // ---------------- supercars / hypercars
  ['super', { make: 'toro', modelName: 'Furia V12 S', year: 2017, cat: 'super', model: 'super', rarity: 'epic', price: 420000, paint: 0xf2640f,
    box: 'dct', drive: 'AWD', layoutBias: 'M', engine: 'v12', eng: '6.5L V12', asp: 'NA', mass: 1575, torque: 970, redline: 8500, idle: 1000, gearsN: 7, v1: 78, top: 350,
    grip: 1.14, tyre: 'sport', brake: 1.35, downforce: 1.05, steer: 0.57, inertiaScale: 0.8, tags: ['modern', 'supercar', 'awd'] }],
  ['contessa', { make: 'toro', modelName: 'Contessa 400', year: 1976, cat: 'super', model: 'contessa', rarity: 'legendary', price: 560000, paint: 0xd8231d,
    drive: 'RWD', layoutBias: 'M', engine: 'v12', eng: '3.9L V12', asp: 'NA', mass: 1200, torque: 470, redline: 8000, idle: 1000, gearsN: 5, v1: 72, top: 290,
    grip: 0.94, tyre: 'street', brake: 1.0, downforce: 0.1, steer: 0.56, assist: 0.55, slipFalloff: 0.09, inertiaScale: 0.8, tags: ['classic', 'supercar'] }],
  ['tempesta', { make: 'rossetti', modelName: 'Tempesta', year: 1989, cat: 'super', model: 'tempesta', rarity: 'legendary', price: 1400000, paint: 0xc8141a,
    drive: 'RWD', layoutBias: 'M', engine: 'v8', eng: '2.9L TT V8', asp: 'twin-turbo', mass: 1100, torque: 690, redline: 7750, idle: 950, gearsN: 5, v1: 80, top: 324,
    grip: 1.06, tyre: 'street', brake: 1.12, downforce: 0.55, steer: 0.58, assist: 0.5, slipFalloff: 0.1, inertiaScale: 0.78, tags: ['classic', 'supercar'] }],
  ['stradale', { make: 'rossetti', modelName: 'Stradale V12', year: 2018, cat: 'super', model: 'stradale', rarity: 'epic', price: 380000, paint: 0xa3121b,
    box: 'dct', gripR: 1.12, drive: 'RWD', layoutBias: 'F', frontBias: 0.47, engine: 'v12', eng: '6.5L V12', asp: 'NA', mass: 1630, torque: 985, redline: 8900, idle: 1000, gearsN: 7, v1: 80, top: 340,
    grip: 1.12, tyre: 'sport', brake: 1.3, downforce: 0.6, steer: 0.58, assist: 0.58, tags: ['modern', 'supercar', 'gt'] }],
  ['funo', { make: 'merrick', modelName: 'F-Uno', year: 1994, cat: 'hyper', model: 'funo', rarity: 'legendary', price: 2400000, paint: 0x9aa4a8,
    gripR: 1.08, drive: 'RWD', layoutBias: 'M', engine: 'v12', eng: '6.1L V12', asp: 'NA', mass: 1140, torque: 930, redline: 7500, idle: 950, gearsN: 6, v1: 88, top: 386,
    grip: 1.08, tyre: 'street', brake: 1.12, downforce: 0.25, steer: 0.58, assist: 0.55, inertiaScale: 0.78, tags: ['classic', 'hypercar'] }],
  ['aska', { make: 'kronvall', modelName: 'Aska', year: 2020, cat: 'hyper', model: 'aska', rarity: 'legendary', price: 2800000, paint: 0xf4f4f2,
    box: 'dct', gripR: 1.3, drive: 'RWD', layoutBias: 'M', engine: 'v8', eng: '5.0L TT V8', asp: 'twin-turbo', mass: 1420, torque: 2100, redline: 8500, idle: 1000, gearsN: 9, v1: 95, top: 440,
    grip: 1.22, tyre: 'semi', brake: 1.5, downforce: 1.7, steer: 0.56, assist: 0.6, inertiaScale: 0.78, tags: ['modern', 'hypercar'] }],
  ['celerite', { make: 'moreau', modelName: 'Célérité', year: 2021, cat: 'hyper', model: 'celerite', rarity: 'legendary', price: 3000000, paint: 0x1b2e5c, paint2: 0x0d0f14,
    box: 'dct', drive: 'AWD', layoutBias: 'M', engine: 'v12', ideal: 'w16', eng: '8.0L quad-turbo W16', asp: 'quad-turbo', mass: 1995, torque: 2450, redline: 6800, idle: 900, gearsN: 7, v1: 90, top: 420,
    grip: 1.18, tyre: 'sport', brake: 1.42, downforce: 0.9, steer: 0.55, tags: ['modern', 'hypercar', 'awd'] }],
  ['munja', { make: 'iskra', modelName: 'Munja', year: 2022, cat: 'hyper', model: 'munja', rarity: 'legendary', price: 2200000, paint: 0x4a5058,
    hpRated: 1914, drive: 'AWD', layoutBias: 'M', frontBias: 0.46, engine: 'electric', eng: 'Quad motor', asp: 'electric', ev: true, mass: 2150, torque: 1500, redline: 16000, idle: 0, gearsN: 2, v1: 190, top: 412,
    grip: 1.2, tyre: 'sport', brake: 1.42, downforce: 0.6, steer: 0.56, tags: ['modern', 'hypercar', 'ev', 'awd'] }],
  // ---------------- EV
  ['ev', { make: 'volta', modelName: 'Arc S', year: 2022, cat: 'ev', model: 'ev', rarity: 'rare', price: 95000, paint: 0xeceef0,
    hpRated: 1020, drive: 'AWD', layoutBias: 'M', frontBias: 0.48, engine: 'electric', eng: 'Tri motor', asp: 'electric', ev: true, mass: 2160, torque: 900, redline: 16000, idle: 0, gearsN: 2, v1: 150, top: 310,
    grip: 1.06, tyre: 'sport', brake: 1.15, downforce: 0.15, steer: 0.58, comY: 0.44, tags: ['modern', 'ev', 'sedan', 'awd'] }],
  ['elektra', { make: 'schwabe', modelName: 'Elektra S', year: 2021, cat: 'ev', model: 'elektra', rarity: 'epic', price: 185000, paint: 0x3e4f5f,
    hpRated: 750, drive: 'AWD', layoutBias: 'M', frontBias: 0.49, engine: 'electric', eng: 'Dual motor', asp: 'electric', ev: true, mass: 2300, torque: 760, redline: 16000, idle: 0, gearsN: 2, v1: 130, top: 260,
    grip: 1.08, tyre: 'sport', brake: 1.25, downforce: 0.25, steer: 0.58, comY: 0.44, tags: ['modern', 'ev', 'sports', 'awd'] }],
  // ---------------- off-road, trucks, SUVs
  ['trophy', { make: 'mesa', modelName: 'Trophy Truck', year: 2019, cat: 'offroad', model: 'trophy', rarity: 'legendary', price: 380000, paint: 0xf0f0ee, paint2: 0xe8601c,
    cdaMax: 1.9, antiRoll: 0.8, drive: 'RWD', layoutBias: 'F', frontBias: 0.5, engine: 'v8', eng: '6.2L V8', asp: 'NA', mass: 2700, torque: 1390, redline: 6800, idle: 900, gearsN: 4, v1: 85, top: 210,
    grip: 0.95, tyre: 'offroad', brake: 0.95, downforce: 0, steer: 0.6, travel: 0.6, comY: 0.78, assist: 0.62, airControl: 1, tags: ['modern', 'offroad', 'truck'] }],
  ['buggy', { make: 'sandpiper', modelName: 'Dune Buggy', year: 1970, cat: 'offroad', model: 'buggy', rarity: 'rare', price: 24000, paint: 0xf2a114,
    cdaMax: 0.95, drive: 'RWD', layoutBias: 'R', engine: 'i4', ideal: 'flat4', eng: '1.9L flat-4', asp: 'NA', mass: 640, torque: 200, redline: 5600, idle: 900, gearsN: 4, v1: 45, top: 150,
    grip: 0.95, tyre: 'offroad', brake: 0.95, downforce: 0, steer: 0.66, travel: 0.38, comY: 0.62, inertiaScale: 0.75, swaps: ['f4big', 'i4t'], tags: ['classic', 'offroad', 'beach'] }],
  ['trekker', { make: 'hawthorne', modelName: 'Trekker 110', year: 1985, cat: 'offroad', model: 'trekker', rarity: 'rare', price: 52000, paint: 0x40503a,
    cdaMax: 1.4, antiRoll: 0.8, drive: 'AWD', layoutBias: 'F', engine: 'v8', eng: '3.5L V8', asp: 'NA', mass: 1900, torque: 300, redline: 5000, idle: 700, gearsN: 5, v1: 40, top: 145,
    grip: 0.84, tyre: 'offroad', brake: 0.85, downforce: 0, steer: 0.58, travel: 0.36, comY: 0.85, swaps: ['v8big'], tags: ['classic', 'offroad', '4x4', 'british'] }],
  ['kodiak', { make: 'tenzan', modelName: 'Kodiak 40', year: 1978, cat: 'offroad', model: 'kodiak', rarity: 'rare', price: 58000, paint: 0x5d8fb8,
    cdaMax: 1.3, antiRoll: 0.8, drive: 'AWD', layoutBias: 'F', engine: 'v6', ideal: 'i6', eng: '4.2L I6', asp: 'NA', mass: 1700, torque: 330, redline: 4600, idle: 700, gearsN: 4, v1: 38, top: 140,
    grip: 0.84, tyre: 'offroad', brake: 0.82, downforce: 0, steer: 0.62, travel: 0.42, comY: 0.82, swaps: ['v8big'], tags: ['classic', 'offroad', '4x4'] }],
  ['baja', { make: 'bayliss', modelName: 'Bighorn Baja', year: 2021, cat: 'offroad', model: 'baja', rarity: 'epic', price: 78000, paint: 0x2f3237,
    cdaMax: 1.5, box: 'auto', antiRoll: 0.8, drive: 'AWD', layoutBias: 'F', engine: 'v6', eng: '3.5L TT V6', asp: 'twin-turbo', mass: 2620, torque: 840, redline: 6000, idle: 750, gearsN: 10, v1: 48, top: 185,
    grip: 0.93, tyre: 'offroad', brake: 0.95, downforce: 0, steer: 0.58, travel: 0.46, comY: 0.8, swaps: ['v8big'], tags: ['modern', 'offroad', 'truck'] }],
  ['pickup', { make: 'bayliss', modelName: 'Hauler 150 Crew', year: 2020, cat: 'truck', model: 'pickup', rarity: 'common', price: 52000, paint: 0x9c2a1f,
    cdaMax: 1.25, box: 'auto', antiRoll: 0.8, drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '5.0L V8', asp: 'NA', mass: 2250, torque: 690, redline: 6500, idle: 700, gearsN: 10, v1: 48, top: 180,
    grip: 0.9, tyre: 'street', brake: 0.95, downforce: 0, steer: 0.55, comY: 0.74, travel: 0.34, swaps: ['v8tt'], tags: ['modern', 'truck'] }],
  ['suv', { make: 'cardinal', modelName: 'Ridgeback XL', year: 2020, cat: 'truck', model: 'suv', rarity: 'common', price: 64000, paint: 0x5d6168,
    cdaMax: 1.15, box: 'auto', antiRoll: 0.8, drive: 'AWD', layoutBias: 'F', engine: 'v8', eng: '5.3L V8', asp: 'NA', mass: 2500, torque: 690, redline: 5800, idle: 700, gearsN: 10, v1: 48, top: 190,
    grip: 0.89, tyre: 'street', brake: 0.98, downforce: 0, steer: 0.56, comY: 0.75, travel: 0.34, tags: ['modern', 'suv', 'family'] }],
  // ---------------- vintage
  ['kugel', { make: 'heimwagen', modelName: 'Kugel 1300', year: 1963, cat: 'vintage', model: 'kugel', rarity: 'common', price: 15000, paint: 0x7fb2cf,
    drive: 'RWD', layoutBias: 'R', engine: 'i4', ideal: 'flat4', eng: '1.3L flat-4', asp: 'NA', mass: 820, torque: 104, redline: 4800, idle: 850, gearsN: 4, v1: 36, top: 125,
    grip: 0.84, tyre: 'vintage', brake: 0.78, downforce: 0, steer: 0.64, travel: 0.26, comY: 0.56, swaps: ['f4big'], tags: ['classic', 'vintage'] }],
  ['picknick', { make: 'heimwagen', modelName: 'Picknick Bus', year: 1967, cat: 'vintage', model: 'picknick', rarity: 'rare', price: 42000, paint: 0xd94e2a, paint2: 0xefe7d4,
    cdaMax: 1.3, drive: 'RWD', layoutBias: 'R', engine: 'i4', ideal: 'flat4', eng: '1.5L flat-4', asp: 'NA', mass: 1150, torque: 128, redline: 4600, idle: 850, gearsN: 4, v1: 32, top: 110,
    grip: 0.8, tyre: 'vintage', brake: 0.76, downforce: 0, steer: 0.6, travel: 0.28, comY: 0.85, swaps: ['f4big', 'ev'], tags: ['classic', 'vintage', 'van', 'sf'] }],
  ['comet', { make: 'cardinal', modelName: 'Comet Fuelie', year: 1957, cat: 'vintage', model: 'comet', rarity: 'legendary', price: 150000, paint: 0xb3151c, paint2: 0xf2efe6,
    yawDamp: 0.3, drive: 'RWD', layoutBias: 'F', engine: 'v8', eng: '4.6L V8', asp: 'NA', mass: 1300, torque: 510, redline: 6200, idle: 750, gearsN: 4, v1: 80, top: 210,
    grip: 0.86, tyre: 'vintage', brake: 0.8, downforce: 0, steer: 0.56, assist: 0.6, slipFalloff: 0.08, tags: ['classic', 'vintage', 'roadster'] }],
  // ---------------- track toys
  ['kestrel', { make: 'kestrel', modelName: 'Sprint 620', year: 2017, cat: 'track', model: 'kestrel', rarity: 'epic', price: 82000, paint: 0x1f7a3d,
    cdaMax: 0.8, gripR: 1.2, drive: 'RWD', layoutBias: 'F', frontBias: 0.49, engine: 'i4', eng: '2.0L SC I4', asp: 'supercharged', mass: 610, torque: 450, redline: 7700, idle: 1000, gearsN: 6, v1: 72, top: 250,
    grip: 1.14, tyre: 'semi', brake: 1.35, downforce: 0.15, steer: 0.64, assist: 0.5, inertiaScale: 0.72, travel: 0.16, comY: 0.36, swaps: ['i4t'], tags: ['modern', 'track', 'roadster'] }],
  // ---------------- SF specials (not drivable / not for sale)
  ['cablecar', { make: 'powell', modelName: 'Cable Car', year: 1888, cat: 'special', model: 'cablecar', rarity: 'legendary', price: null, hidden: true,
    drive: 'RWD', engine: 'bus', eng: 'Cable grip', mass: 7500, torque: 800, redline: 3000, idle: 600, gears: [3], final: 4, gearsN: 1, top: 20, grip: 1, steer: 0.1, tags: ['sf', 'special'] }],
];

export const CARS = {};
for (const [key, d] of RAW) {
  d.key = key;
  d.makeName = MAKES[d.make]?.name || d.make;
  d.country = MAKES[d.make]?.country || '';
  d.name = `${d.makeName} ${d.modelName}`;
  d.buyable = d.price != null && !d.hidden;
  d.tags = [...new Set([...(d.tags || []), d.cat, d.drive.toLowerCase(), d.year < 1990 ? 'classic' : 'modern'])];
  CARS[key] = d;
}
export const ROSTER_KEYS = RAW.map(([k]) => k).filter(k => !CARS[k].hidden);
export const CATEGORIES = { city: 'City & everyday', hothatch: 'Hot hatches', muscle: 'Classic muscle', modernmuscle: 'Modern muscle', jdm: 'JDM legends', euro: 'Euro sports & GT', rally: 'Rally legends', super: 'Supercars', hyper: 'Hypercars', ev: 'Electric', offroad: 'Off-road', truck: 'Trucks & SUVs', vintage: 'Vintage', track: 'Track toys', special: 'San Francisco specials' };

// ------------------------------------------------------------------ models
export const getSpec = id => M.getModelSpec(id);
export const buildModel = (id, opts) => M.buildCarModel(id, opts);
export const hasRealModels = true;

// gearing from design targets once the wheel radius is known (lazy: needs the model spec)
function finishDef(d) {
  if (d._done) return d;
  d._done = true;
  if (!d.gears || d.gearsN !== d.gears.length || d.gearsGen) {
    const s = getSpec(d.model);
    const g = designGears({ n: d.gearsN, v1: d.v1, top: d.top, redline: d.redline, r: s.wheelRadius });
    d.gears = g.gears; d.final = g.final; d.gearsGen = true;
  }
  d.hp = d.hpRated ?? Math.round(peakPower(d.torque, d.redline).hp / 5) * 5;
  return d;
}
for (const k in CARS) {
  const d = CARS[k];
  // gears/final are read by other modules (menus); resolve them on first touch
  for (const f of ['gears', 'final', 'hp']) {
    const own = d[f];
    if (own !== undefined && f !== 'hp') { d['_' + f] = own; }
    Object.defineProperty(d, f, { enumerable: true, configurable: true, get() { finishDef(this); return this['_' + f]; }, set(v) { this['_' + f] = v; } });
    if (own !== undefined) d['_' + f] = own;
  }
  if (d._gears) d.gearsN = d._gears.length;
  // class + PI measured lazily from the stock build
  // (non-enumerable: object spreads of a def must not trigger a measurement)
  Object.defineProperty(d, 'pi', { enumerable: false, configurable: true, get() { return d.hidden ? 100 : perfOf(k).pi; } });
  Object.defineProperty(d, 'cls', { enumerable: false, configurable: true, get() { return d.hidden ? 'D' : perfOf(k).cls; } });
}

// ------------------------------------------------------------------ params (stock or per-instance build)
const paramCache = new Map();
/** physics params for roster car `id`, optionally with a build { up, tune } (see tuning.js) */
export function carParams(id, build = null) {
  if (!build && paramCache.has(id)) return paramCache.get(id);
  const d0 = finishDef(CARS[id]);
  const spec = getSpec(d0.model);
  let d = d0;
  if (build?.up && Object.keys(build.up).length) d = applyUpgrades(d0, build.up, { r: spec.wheelRadius });
  let P = deriveParams(d, spec, d0);
  if (build?.tune) P = applyTune(P, build.tune, spec);
  if (!build) paramCache.set(id, P);
  return P;
}
/** upgraded roster def (display values: engine, mass, drive...) */
export function buildDef(id, build = null) {
  const d0 = finishDef(CARS[id]);
  if (!build?.up || !Object.keys(build.up).length) return d0;
  const d = applyUpgrades(d0, build.up, { r: getSpec(d0.model).wheelRadius });
  d.hp = (d0.hpRated ? d0.hpRated * d.torque / d0.torque : null) ?? Math.round(peakPower(d.torque, d.redline).hp / 5) * 5;
  return d;
}
const perfCache = new Map();
/** measured performance (PI, class, stat bars, 0-100, top speed...) for the stock car or a build */
const buildPerf = new Map(); // build-keyed cache (HUD and menus ask repeatedly for the same upgraded car)
export function perfOf(id, build = null, opts = undefined) {
  if (!build && !opts && perfCache.has(id)) return perfCache.get(id);
  const bk = build && !opts ? id + "|" + JSON.stringify(build.up || {}) + "|" + JSON.stringify(build.tune || {}) : null;
  if (bk && buildPerf.has(bk)) return buildPerf.get(bk);
  if (bk) { const r = measure(carParams(id, build), getSpec(finishDef(CARS[id]).model)); if (buildPerf.size > 200) buildPerf.clear(); buildPerf.set(bk, r); return r; }
  const spec = getSpec(finishDef(CARS[id]).model);
  const r = measure(carParams(id, build), spec, opts);
  if (!build && !opts) perfCache.set(id, r);
  return r;
}
export function clearPerfCache() { perfCache.clear(); paramCache.clear(); }

// ------------------------------------------------------------------ garage order + traffic
export const PLAYER_GARAGE_ORDER = ROSTER_KEYS.filter(k => CARS[k].buyable);
// SF traffic: sedans / compact SUVs / hatches and EVs dominate; cabs, delivery vans + box trucks, Muni coaches and the odd
// interceptor; a few older 4x4s and classics (16 body types)
export const TRAFFIC_MIX = [['sedan', 22], ['k5', 4], ['hatch', 12], ['kugel', 1], ['suv', 12], ['trekker', 2], ['kodiak', 1], ['ev', 8], ['elektra', 2],
  ['taxi', 7], ['pickup', 6], ['van', 6], ['boxtruck', 4], ['bus', 3], ['police', 2], ['coupe', 2], ['muscle', 1], ['stallion18', 1]];
const PAINTS = [0xe8e8ea, 0x1a1b1f, 0x8e939b, 0x5a616b, 0x9b1d20, 0x1d3f7a, 0x2f5d3a, 0xc9b28f, 0x6b1e34, 0x3c6e8f, 0xd9d3c3, 0x2a2d35, 0xa06a2c, 0x4a4f2c, 0xb8c2cc];

// ------------------------------------------------------------------ player build provider (installed by sys_garage)
let buildProvider = null;
/** fn(id, vehicleOpts) -> build { up, tune, look } | null. Vehicles created with role 'player' ask it. */
export function setBuildProvider(fn) { buildProvider = fn; }

let idSeq = 1;
const _ip = new THREE.Vector3();
export class Vehicle {
  constructor(id, { scene, paint, seed = 0, role = 'npc', build = undefined } = {}) {
    this.uid = idSeq++;
    this.id = id; this.role = role;
    if (build === undefined && role === 'player' && buildProvider) { try { build = buildProvider(id); } catch (e) { console.warn('[cars] build provider', e); build = null; } }
    this.build = build || null;
    this.def = this.build ? buildDef(id, this.build) : finishDef(CARS[id]);
    this.spec = getSpec(this.def.model);
    this.params = carParams(id, this.build);
    const look = this.build?.look || null;
    const rnd = (Math.sin(seed * 91.7 + this.uid) * 43758.5453) % 1;
    this.paint = look?.paint ?? paint ?? (id === 'taxi' || id === 'police' || id === 'bus' ? undefined : role === 'npc' || role === 'parked' ? (id === 'boxtruck' ? (Math.abs(rnd) < 0.7 ? 0xf0f0ee : PAINTS[Math.floor(Math.abs(rnd) * 97) % PAINTS.length]) : M.streetPaint(Math.abs(rnd))) : CARS[id].paint);
    this.visual = buildModel(this.def.model, { paint: this.paint ?? this.spec.defaultPaint, paint2: CARS[id].paint2, seed: this.uid, look, wing: this.def.wing, hero: role === 'player' });
    this.root = this.visual.root;
    this.body = new CarBody(this.spec, this.params);
    this.scene = scene;
    scene.add(this.root);
    this.health = 100; this.wrecked = false;
    this.driver = null;            // 'player' | 'npc' | 'cop' | 'racer' | null (parked / abandoned)
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0, pitch: 0 };
    this.lights = { head: false, brake: false, reverse: false, siren: false, sirenPhase: 0 };
    this.restPivotY = this.visual.wheels.map(w => w.pivot.position.y);
    this.sirenOn = false;
    this.voice = null;
    this.smoke = 0;
    this.lastImpact = 0;
  }
  /** live cosmetic change (paint shop): { paint, finish, paint2, rim, rimColor, caliper, tint, livery } */
  applyLook(look) { if (this.build) this.build.look = look; this.visual.setLook?.(look); if (look?.paint != null) this.paint = look.paint; }
  place(x, y, z, yaw) { this.body.place(x, y, z, yaw); this.sync(0); }
  get pos() { return this.body.pos; }
  sync(dt, night = 0, time = 0) {
    const b = this.body;
    // fixed 120 Hz physics vs a variable display rate: draw the body between its last two steps (no stepping judder)
    if (b.interp && b.alpha < 1) {
      this.root.quaternion.copy(b.prevQuat).slerp(b.quat, b.alpha);
      this.root.position.copy(b.com).negate().applyQuaternion(this.root.quaternion).add(_ip.copy(b.prevPos).lerp(b.pos, b.alpha));
    } else { b.originWorld(this.root.position); this.root.quaternion.copy(b.quat); }
    const eq = b.travel - b.wheels[0].sag;
    for (let i = 0; i < 4; i++) {
      const w = b.wheels[i], vw = this.visual.wheels[i];
      vw.pivot.position.y = this.restPivotY[i] + (eq - w.len);
      if (w.front) vw.pivot.rotation.y = -w.steer;
      vw.spin.rotation.x = -w.spin;
    }
    const L = this.lights;
    const reversing = b.reverse && b.fwdSpeed < -0.3;
    L.head = night > 0.35 || this.role === 'player' && night > 0.2;
    L.brake = (b.brake > 0.1 && !b.reverse) || (b.reverse && b.throttle > 0.1) || (this.driver && Math.abs(b.fwdSpeed) < 0.3);
    L.reverse = reversing;
    L.siren = this.sirenOn; L.sirenPhase = time;
    this.visual.setLights(L);
  }
  remove() { this.scene.remove(this.root); this.visual.dispose?.(); this.voice?.stop(); this.voice = null; }
}
