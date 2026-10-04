// Cinematic tour shot list (real 1:1 San Francisco, default map). Every shot has its own time of day + weather and one
// camera move. Points:
//   [lat, lon, dy]              dy metres above the ground (or above sea level over water)
//   { gg: s, l, dy | y }        Golden Gate axis (s = metres north of the south tower, l = metres east), dy above ground / y absolute
//   { at: [street, cross], dy, ox, oz } a street intersection (+ offset)   { x, z, dy } world metres
// Cameras:
//   dolly  { from, to, look, lookTo }                     straight move, eased
//   orbit  { c, r, r1, h, h1, a0, a1, lookDy }            bearing a (deg, 0 = north of c, 90 = east) from a0 to a1
//   seg    { st, a, b, t0, t1, dy0, dy1, lookT, lookDy }  along a street between two cross streets (straight streets)
//   track  { path, speed, a, b, look, fixed }             follow the hero car (a -> b = camera offsets in the car frame:
//          r right, u up, f forward); path = { from: [st, cross], to: [st, cross] } | { road: [lat, lon], toward: [lat, lon] }
//          | { line: 'gg'|'bay', s0, s1, off } | { event: id }; fixed = the camera stays where it starts
//          (or at camAt) and watches the car; launch = the car starts from rest
//   cable  { near: [st, cross], a, b, look }              follow the nearest cable car
export const SHOTS = [
  { id: 'gg_spencer', title: 'Golden Gate Bridge', sub: 'Battery Spencer · Marin Headlands', hours: 17.9, weather: 'clear', dur: 8, fov: 44,
    cam: { type: 'dolly', from: { gg: 1590, l: -200, dy: 24 }, to: { gg: 1545, l: -160, dy: 27 }, look: { gg: 700, l: 60, y: 105 }, lookTo: { gg: 250, l: 60, y: 95 } } },
  { id: 'gg_deck', title: 'Crossing the Golden Gate', sub: 'US-101 northbound', hours: 18.1, weather: 'clear', dur: 7, fov: 52,
    cam: { type: 'track', path: { line: 'gg', s0: -150, s1: 1350, off: 4.6 }, speed: 24, a: { r: -7, u: 1.8, f: 16 }, b: { r: -4, u: 3.2, f: -15 }, look: { f: 4, u: 1.2 } } },
  { id: 'crissy', title: 'Crissy Field', sub: 'Presidio shoreline · morning', hours: 8.6, weather: 'clear', dur: 7, fov: 48,
    cam: { type: 'dolly', from: { gg: -1120, l: 1560, dy: 2.2 }, to: { gg: -1105, l: 1360, dy: 3.4 }, look: { gg: 80, l: 0, y: 100 }, lookTo: { gg: 300, l: 0, y: 105 } } },
  { id: 'palace', title: 'Palace of Fine Arts', sub: 'Marina District', hours: 9.4, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'orbit', c: [37.80285, -122.44835, 0], r: 175, r1: 140, h: 42, h1: 50, a0: 68, a1: 100, lookDy: 18 } },
  { id: 'festival', title: 'HILLBOMB Festival', sub: 'Race start · Marina', hours: 17.8, weather: 'clear', dur: 7, fov: 48,
    cam: { type: 'track', path: { event: 'golden-gate-run' }, speed: 30, launch: true, a: { r: 3.6, u: 0.8, f: 7 }, b: { r: 4.6, u: 1.8, f: -7 }, look: { f: 0, u: 0.8 } } },
  { id: 'lombard', title: 'Lombard Street', sub: 'The crookedest street · Russian Hill', hours: 16.3, weather: 'clear', dur: 8, fov: 42,
    cam: { type: 'track', path: { from: ['Lombard Street', 'Hyde Street'], to: ['Lombard Street', 'Leavenworth Street'] }, speed: 5.5, a: { r: -6, u: 40, f: -26 }, b: { r: 6, u: 36, f: -18 }, look: { f: 22, u: -6 } } },
  { id: 'hyde', title: 'Hyde Street', sub: 'Russian Hill · Alcatraz dead ahead', hours: 17.7, weather: 'clear', dur: 7, fov: 55,
    cam: { type: 'track', path: { from: ['Hyde Street', 'Union Street'], to: ['Hyde Street', 'Bay Street'] }, speed: 15, a: { r: 0.4, u: 1.5, f: -7 }, b: { r: -2.2, u: 3.4, f: -10.5 }, look: { f: 34, u: -3 } } },
  { id: 'cable', title: 'Cable Car', sub: 'Powell–Hyde line', hours: 15.2, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'cable', near: ['Hyde Street', 'Lombard Street'], a: { r: -4.5, u: 1.8, f: 11 }, b: { r: -3.6, u: 3.2, f: 4 }, look: { f: 0, u: 2.4 } } },
  { id: 'chinatown', title: 'Chinatown', sub: 'Grant Avenue · rain after dark', hours: 22.3, weather: 'rain', dur: 7, fov: 55,
    cam: { type: 'seg', st: 'Grant Avenue', a: 'Sacramento Street', b: 'Washington Street', t0: 0.02, t1: 0.42, dy0: 2.2, dy1: 3.2, lookT: 1.25, lookDy: 5.5 } },
  { id: 'transamerica', title: 'Transamerica Pyramid', sub: 'Financial District', hours: 13.4, weather: 'clear', dur: 7, fov: 64,
    cam: { type: 'dolly', from: [37.79615, -122.40345, 1.6], to: [37.79605, -122.40320, 1.8], look: [37.79519, -122.40279, 30], lookTo: [37.79519, -122.40279, 240] } },
  { id: 'union_sq', title: 'Union Square', sub: 'Downtown · evening', hours: 19.85, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'orbit', c: [37.78795, -122.40750, 0], r: 85, r1: 70, h: 30, h1: 18, a0: 215, a1: 250, lookDy: 10 } },
  { id: 'salesforce', title: 'Salesforce Tower', sub: 'SoMa skyline · dusk', hours: 19.6, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'orbit', c: { x: 1984, z: -1649, dy: 0 }, r: 330, r1: 300, h: 110, h1: 150, a0: 125, a1: 160, lookDy: 190 } },
  { id: 'embarcadero', title: 'The Embarcadero', sub: 'Ferry Building · Bay Bridge lights', hours: 20.1, weather: 'clear', dur: 8, fov: 54,
    cam: { type: 'track', path: { from: ['The Embarcadero', 'Washington Street'], to: ['The Embarcadero', 'Howard Street'] }, speed: 13, a: { r: -6, u: 24, f: -26 }, b: { r: -9, u: 30, f: -30 }, look: { f: 70, u: 0 } } },
  { id: 'bay_bridge', title: 'Bay Bridge', sub: 'Westbound upper deck · night', hours: 22.4, weather: 'clear', dur: 7, fov: 58,
    cam: { type: 'track', path: { line: 'bay', s0: 0.62, s1: 0.2, off: 5.2 }, speed: 23, a: { r: 3, u: 3, f: -12 }, b: { r: -2, u: 5.5, f: -17 }, look: { f: 35, u: 2 } } },
  { id: 'mission', title: 'Mission Street', sub: 'The Mission · late night', hours: 23.2, weather: 'clear', dur: 7, fov: 54,
    cam: { type: 'track', path: { from: ['Mission Street', '20th Street'], to: ['Mission Street', '24th Street'] }, speed: 11, a: { r: 2.5, u: 1.3, f: -7 }, b: { r: -2.5, u: 2.2, f: -9 }, look: { f: 22, u: 1.5 } } },
  { id: 'painted', title: 'The Painted Ladies', sub: 'Alamo Square', hours: 16.8, weather: 'clear', dur: 7, fov: 40,
    cam: { type: 'dolly', from: [37.77660, -122.43390, 7], to: [37.77600, -122.43385, 7.5], look: [37.77640, -122.43260, 10], lookTo: [37.77610, -122.43240, 12] } },
  { id: 'gg_park', title: 'Golden Gate Park', sub: 'Conservatory of Flowers', hours: 10.2, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'dolly', from: [37.77080, -122.46040, 0.7], to: [37.77120, -122.46040, 3.2], look: [37.77210, -122.46040, 7], lookTo: [37.77210, -122.46040, 9] } },
  { id: 'ocean_beach', title: 'Ocean Beach', sub: 'Great Highway · the Pacific', hours: 18.95, weather: 'clear', dur: 7, fov: 50,
    cam: { type: 'dolly', from: [37.76000, -122.51040, 1.6], to: [37.75900, -122.51060, 2.4], look: [37.75650, -122.52400, 2], lookTo: [37.75450, -122.52400, 2] } },
  { id: 'sutro', title: 'Sutro Tower', sub: 'Karl the Fog rolls in', hours: 8.1, weather: 'fog', dur: 7, fov: 46,
    cam: { type: 'dolly', from: [37.75370, -122.44800, 7], to: [37.75400, -122.44810, 9], look: [37.75520, -122.45280, 40], lookTo: [37.75520, -122.45280, 150] } },
  { id: 'twin_peaks', title: 'Twin Peaks', sub: 'Sunset over the city', hours: 18.3, drift: 0.08, weather: 'clear', dur: 9, fov: 46,
    cam: { type: 'dolly', from: [37.75335, -122.44745, 15], to: [37.75375, -122.44705, 17], look: [37.78450, -122.41000, 30], lookTo: [37.79200, -122.39900, 60] } },
];
// the ~20 s cut (?tour&short, "Short cut" button)
export const SHORT = ['gg_spencer', 'hyde', 'chinatown', 'twin_peaks'];
