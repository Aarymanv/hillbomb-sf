// HILLBOMB Festival San Francisco: the whole content catalog in one place.
// EVERY position is real-world [lat, lon] (resolved with ll() + road snapping at runtime), so this file survives map
// rebuilds unchanged. Route keys: [lat, lon, hint?]  hint = road-name substring to snap to, '~' = off-road point.
// Names, characters, brands and cars are original to HILLBOMB.

export const FESTIVAL = {
  name: 'HILLBOMB Festival', city: 'San Francisco', short: 'HILLBOMB', tagline: 'Seven hills. One festival. No brakes.',
};

// ------------------------------------------------------------------ cast
export const CHARACTERS = {
  lena: { name: 'Lena Ortiz', role: 'Festival Director', color: '#ff2e7e' },
  dex: { name: 'Dex Marlowe', role: 'Festival MC', color: '#ffc247' },
  frankie: { name: 'Frankie Delgado', role: 'Stunt driver, 40 years in the business', color: '#ff8a1d' },
  juno: { name: 'Juno Park', role: 'Director, "Fog City Fury"', color: '#3bc4f4' },
  mo: { name: 'Mo Adeyemi', role: 'Night dispatcher, FogCab', color: '#39e07a' },
  kai: { name: 'Kai Mendes', role: 'Lowtide Crew', color: '#b25cff' },
  rook: { name: 'Rook', role: 'Lowtide Crew', color: '#8e7cff' },
  walt: { name: 'Walt Castillo', role: 'Retired mechanic, knows every garage in town', color: '#c8a26a' },
  fare: { name: 'Passenger', role: '', color: '#a7b0ba' },
};

// ------------------------------------------------------------------ disciplines
// icon: glyph used on markers / map (drawn in the icon atlas)
export const DISCIPLINES = {
  road: { name: 'Road Racing', short: 'Road', color: '#ffc247', icon: 'road' },
  street: { name: 'Street Scene', short: 'Street', color: '#ff2e7e', icon: 'street' },
  dirt: { name: 'Dirt Racing', short: 'Dirt', color: '#d98a3a', icon: 'dirt' },
  xc: { name: 'Cross Country', short: 'Cross Country', color: '#7cc94a', icon: 'xc' },
  drag: { name: 'Drag Racing', short: 'Drag', color: '#ff5a36', icon: 'drag' },
  drift: { name: 'Drift Event', short: 'Drift', color: '#b25cff', icon: 'drift' },
  showcase: { name: 'Showcase', short: 'Showcase', color: '#ffffff', icon: 'showcase' },
  story: { name: 'Story', short: 'Story', color: '#3bc4f4', icon: 'story' },
};
export const STUNT_TYPES = {
  trap: { name: 'Speed Trap', color: '#5aa9ff', icon: 'trap' },
  zone: { name: 'Speed Zone', color: '#4fd2ff', icon: 'zone' },
  danger: { name: 'Danger Sign', color: '#ffd23f', icon: 'danger' },
  drift: { name: 'Drift Zone', color: '#ff6ad5', icon: 'driftzone' },
  trail: { name: 'Trailblazer', color: '#ff8a1d', icon: 'trail' },
};

export const DIFFICULTY = [
  { id: 'novice', name: 'Novice', bonus: 0, skill: 0.0, desc: 'Rivals take it easy. Learn the route.' },
  { id: 'average', name: 'Average', bonus: 0.1, skill: 0.25, desc: 'A fair fight.' },
  { id: 'skilled', name: 'Skilled', bonus: 0.2, skill: 0.5, desc: 'Rivals brake late and rarely mistake.' },
  { id: 'pro', name: 'Pro', bonus: 0.35, skill: 0.75, desc: 'Festival veterans. Every corner counts.' },
  { id: 'unbeatable', name: 'Unbeatable', bonus: 0.5, skill: 1.0, desc: 'Nobody beats them. Prove everybody wrong.' },
];

// ------------------------------------------------------------------ progression: chapters (festival points unlock)
export const CHAPTERS = [
  { n: 0, id: 'opening', name: 'Opening Night', fp: 0, desc: 'The HILLBOMB Festival arrives at Marina Green. Road racing and Street Scene are open.',
    line: ['lena', 'Welcome to HILLBOMB. Every point you earn out there grows this festival. Go make some noise.'] },
  { n: 1, id: 'sand', name: 'Sand & Surf', fp: 800, outpost: 'oceanbeach', desc: 'Ocean Beach opens for Dirt Racing and Cross Country.',
    line: ['lena', 'The crowds love you. We just opened a dirt outpost on Ocean Beach. Bring something with ground clearance.'] },
  { n: 2, id: 'island', name: 'Island Lights', fp: 2000, outpost: 'treasure', desc: 'The Treasure Island Night Market opens: drag strip, street racing and the Fleet Week showcase.',
    line: ['lena', 'Treasure Island is ours tonight. Drag strip, night market, and the jets are in town. You are not ready. Go anyway.'] },
  { n: 3, id: 'sideways', name: 'Sideways', fp: 3600, outpost: 'dogpatch', desc: 'Pier 70 Drift Club opens in Dogpatch. Drift events and drift zones pay double style.',
    line: ['lena', 'The Pier 70 crew have been sliding around those warehouses for years. Now they are part of the festival.'] },
  { n: 4, id: 'peaks', name: 'Peak Season', fp: 5600, outpost: 'twinpeaks', desc: 'Twin Peaks Road Club opens, and the fog is coming. Fog Bank showcase unlocked.',
    line: ['lena', 'We put a road club on top of the city. Karl the fog does not like that. Better outrun him.'] },
  { n: 5, id: 'gate', name: 'Over the Gate', fp: 8000, outpost: 'marin', desc: 'Marin Headlands Cross Country Camp opens across the Golden Gate.',
    line: ['lena', 'Across the bridge, into the hills. The headlands camp is open. Watch the cliffs.'] },
  { n: 6, id: 'stunt', name: 'Stunt City', fp: 11000, outpost: 'stunt', desc: 'Candlestick Stunt Park opens. Foil Rush showcase unlocked.',
    line: ['lena', 'Ramps, containers, and a racing catamaran with something to prove. Stunt City is open.'] },
  { n: 7, id: 'legend', name: 'HILLBOMB Legend', fp: 15000, desc: 'The Bay Crown: the final race across the whole city. Beat it and join the HILLBOMB Hall of Fame.',
    line: ['lena', 'One race left. Ocean to island, across the whole city, against the best we have. The Bay Crown is yours to take.'] },
];

// ------------------------------------------------------------------ festival sites (main + outposts)
// footprint w x d metres; the builder finds clear land near the anchor and turns the entrance toward the nearest road
export const SITES = [
  // facing: compass heading of the entrance (the crowd looks the other way: west, at the stage and the Golden Gate)
  { id: 'main', kind: 'main', name: 'HILLBOMB Main Stage', place: 'Marina Green', ll: [37.80563, -122.43990], w: 56, d: 76, facing: 90, chapter: 0, color: '#ff2e7e', theme: 'main' },
  { id: 'oceanbeach', kind: 'outpost', name: 'Ocean Beach Dirt Outpost', place: 'Ocean Beach', ll: [37.7640, -122.5075], w: 40, d: 28, chapter: 1, color: '#d98a3a', theme: 'dirt' },
  { id: 'treasure', kind: 'outpost', name: 'Treasure Island Night Market', place: 'Treasure Island', ll: [37.8250, -122.3715], w: 44, d: 30, chapter: 2, color: '#ff2e7e', theme: 'street' },
  { id: 'dogpatch', kind: 'outpost', name: 'Pier 70 Drift Club', place: 'Dogpatch', ll: [37.7615, -122.3845], w: 40, d: 28, chapter: 3, color: '#b25cff', theme: 'drift' },
  { id: 'twinpeaks', kind: 'outpost', name: 'Twin Peaks Road Club', place: 'Twin Peaks', ll: [37.7530, -122.4490], w: 36, d: 26, chapter: 4, color: '#ffc247', theme: 'road' },
  { id: 'marin', kind: 'outpost', name: 'Headlands Cross Country Camp', place: 'Marin Headlands', ll: [37.8300, -122.4880], w: 40, d: 28, chapter: 5, color: '#7cc94a', theme: 'xc' },
  // the real Candlestick Point sits south of the current map; alternates are tried in order until one fits
  { id: 'stunt', kind: 'outpost', name: 'Candlestick Stunt Park', place: 'Candlestick Point', ll: [37.7132, -122.3860], alt: [[37.7700, -122.3880], [37.7745, -122.3905]], w: 44, d: 30, chapter: 6, color: '#ff8a1d', theme: 'stunt' },
];

// ------------------------------------------------------------------ events
// cls: class restriction (car class must be <= this); laps: circuits; time: hour of day forced for the event;
// traffic: keep ambient traffic (Street Scene); dist: fixed length (drag); rivals: grid size - 1
export const EVENTS = [
  // ---- Road Racing
  { id: 'marina-sprint', type: 'road', name: 'Marina Sprint', cls: 'D', chapter: 0, rivals: 5,
    desc: 'A flat-out warm-up along the waterfront, from the festival gates to the Wharf.',
    keys: [[37.8055, -122.4410], [37.8058, -122.4318], [37.8043, -122.4238], [37.8063, -122.4205], [37.8080, -122.4160]] },
  { id: 'russian-hill-bomb', type: 'road', name: 'Russian Hill Bomb', cls: 'B', chapter: 0, rivals: 5,
    desc: 'Down Hyde Street, over every crest Russian Hill has, then flat out along the Wharf. Land it straight.',
    keys: [[37.7948, -122.4178, 'Hyde'], [37.7990, -122.4185, 'Hyde'], [37.8020, -122.4192, 'Hyde'], [37.8047, -122.4197, 'Hyde'], [37.8080, -122.4130], [37.8060, -122.4035, 'Embarcadero']] },
  { id: 'embarcadero-run', type: 'road', name: 'Embarcadero Run', cls: 'C', chapter: 0, rivals: 5,
    desc: 'Pier 39 to Mission Bay under the palms. Wide, fast and full of bridges overhead.',
    keys: [[37.8087, -122.4098, 'Embarcadero'], [37.8035, -122.4008, 'Embarcadero'], [37.7955, -122.3937, 'Embarcadero'], [37.7905, -122.3895, 'Embarcadero'], [37.7786, -122.3893, 'Embarcadero'], [37.7730, -122.3880]] },
  { id: 'golden-gate-run', type: 'road', name: 'Golden Gate Run', cls: 'A', chapter: 0, rivals: 5,
    desc: 'Marina Green to Hawk Hill: the Presidio Parkway, across the Golden Gate and up Conzelman Road.',
    keys: [[37.8055, -122.4410], [37.8015, -122.4490, 'Presidio Pkwy'], [37.8030, -122.4650, 'Presidio Pkwy'], [37.8077, -122.4750, 'Golden Gate'], [37.8324, -122.4812, 'Golden Gate'], [37.8330, -122.4840, 'Conzelman'], [37.8255, -122.4990, 'Conzelman']] },
  { id: 'pac-heights-plunge', type: 'road', name: 'Pacific Heights Plunge', cls: 'B', chapter: 0, rivals: 5,
    desc: 'Divisadero drops off a cliff between the mansions. Then back up Fillmore, if your brakes survive.',
    // (unhinted keys snapped past Beach St, U-turned and were dropped: the race was 1.1 km along Broadway)
    keys: [[37.7920, -122.4403, 'Divisadero'], [37.7960, -122.4415, 'Divisadero'], [37.7995, -122.4425, 'Divisadero'], [37.8007, -122.4400, 'Chestnut'], [37.8000, -122.4362, 'Fillmore'], [37.7945, -122.4350, 'Fillmore'], [37.7890, -122.4340, 'Fillmore']] },
  { id: 'richmond-circuit', type: 'road', name: 'Richmond Circuit', cls: 'C', chapter: 0, laps: 2, rivals: 5,
    desc: 'Two laps through the Avenues: Geary, 25th, Fulton and back up Arguello.',
    keys: [[37.7815, -122.4590], [37.7798, -122.4847], [37.7728, -122.4845], [37.7745, -122.4585]] },
  { id: 'mission-mile', type: 'road', name: 'Mission Mile', cls: 'C', chapter: 1, rivals: 5,
    desc: 'Valencia Street in the sun, murals flashing by, onto Market for the finish.',
    keys: [[37.7524, -122.4185], [37.7587, -122.4215], [37.7650, -122.4220], [37.7715, -122.4230, 'Market'], [37.7790, -122.4135, 'Market']] },
  { id: 'ggpark-loop', type: 'road', name: 'Golden Gate Park Loop', cls: 'C', chapter: 1, laps: 1, rivals: 5,   // one lap: the loop is 9.4 km on the real map (two laps ran ~15 min)
    desc: 'JFK Drive out to the ocean, MLK Drive back. Trees, lakes and bison, at speed.',
    keys: [[37.7710, -122.4570, 'JFK'], [37.7700, -122.4890, 'JFK'], [37.7650, -122.4900, 'MLK'], [37.7655, -122.4600, 'MLK']] },
  { id: 'presidio-circuit', type: 'road', name: 'Presidio Circuit', cls: 'A', chapter: 1, laps: 2, rivals: 5,
    desc: 'Arguello through the forest, down past the Main Post, out the Presidio Gate and back along West Pacific. Fast sweepers, no run-off.',
    // (the old Parkway / Park Presidio keys threaded into a 1.2 km out-and-back on Funston: every rival respawned at the line)
    keys: [[37.7880, -122.4592, 'Arguello'], [37.7960, -122.4610, 'Arguello'], [37.7985, -122.4580, 'Moraga'], [37.7960, -122.4530, 'Presidio Boulevard'], [37.7890, -122.4480, 'Presidio Boulevard'], [37.7880, -122.4530, 'West Pacific']] },
  { id: 'nob-hill-circuit', type: 'road', name: 'Nob Hill Circuit', cls: 'D', chapter: 2, laps: 3, rivals: 5,
    desc: 'Three laps around the top of Nob Hill. Cable car tracks, hotel doormen, zero flat ground.',
    keys: [[37.7919, -122.4096], [37.7910, -122.4170], [37.7890, -122.4165], [37.7899, -122.4090]] },
  { id: 'twin-peaks-descent', type: 'road', name: 'Twin Peaks Descent', cls: 'B', chapter: 4, rivals: 5,
    desc: 'From the summit, down the switchbacks and all the way down Market Street.',
    keys: [[37.7544, -122.4477, 'Twin Peaks'], [37.7580, -122.4450, 'Twin Peaks'], [37.7626, -122.4350, 'Market'], [37.7677, -122.4290, 'Market'], [37.7750, -122.4195, 'Market']] },
  { id: 'coast-highway', type: 'road', name: 'Coast Highway', cls: 'S1', chapter: 5, rivals: 5,
    desc: 'Lands End cliffs, the Cliff House bend, then the Great Highway: the fastest straight in town.',
    keys: [[37.7845, -122.5000, 'El Camino'], [37.7785, -122.5125, 'Great Highway'], [37.7655, -122.5095, 'Great Highway'], [37.7480, -122.5085, 'Great Highway']] },
  { id: 'bay-crown', type: 'road', name: 'The Bay Crown', cls: 'S2', chapter: 7, rivals: 7, finale: true,
    desc: 'The HILLBOMB finale. Ocean Beach to Treasure Island along the park, down Market and over the Bay Bridge.',
    // (JFK Drive is car-free on the real map: the line runs Fulton. Start north of Lincoln: from the old start the route had to
    // U-turn round Lincoln / MLK to reach the northbound Great Highway)
    keys: [[37.7640, -122.5088, 'Great Highway'], [37.7695, -122.5085, 'JFK'], [37.7710, -122.4560, 'JFK'], [37.7735, -122.4380], [37.7717, -122.4235, 'Market'], [37.7945, -122.3950, 'Market'], [37.7879, -122.3869, 'Bay Bridge'], [37.8105, -122.3640, 'Yerba Buena'], [37.8230, -122.3710, 'Avenue of the Palms']] },

  // ---- Street Scene (night, traffic)
  { id: 'chinatown-lanterns', type: 'street', name: 'Chinatown Lanterns', cls: 'D', chapter: 0, time: 22.5, traffic: true, rivals: 3,
    desc: 'Grant Avenue after dark: lanterns overhead, delivery vans everywhere, no room for mistakes.',
    // up Grant (one-way north) under the lanterns, Broadway, down Stockton (the old keys threaded 470 m of Sutter / Powell)
    keys: [[37.7906, -122.4057, 'Grant Avenue'], [37.7930, -122.4060, 'Grant Avenue'], [37.7962, -122.4065, 'Grant Avenue'], [37.7978, -122.4067, 'Grant Avenue'], [37.7979, -122.4085, 'Broadway'], [37.7945, -122.4081, 'Stockton']] },
  { id: 'tenderloin-nights', type: 'street', name: 'Tenderloin Nights', cls: 'C', chapter: 0, time: 23.2, traffic: true, rivals: 3,
    desc: 'Neon, steam and one-way grids. Market Street to Civic Center the long way round.',
    keys: [[37.7815, -122.4115, 'Market'], [37.7837, -122.4145], [37.7858, -122.4196], [37.7870, -122.4215], [37.7822, -122.4172], [37.7793, -122.4193]] },
  { id: 'lombard-late-show', type: 'street', name: 'Lombard Late Show', cls: 'D', chapter: 1, time: 21.8, traffic: true, rivals: 3,
    desc: 'Motel signs and red lights all the way out to the Presidio gate.',
    keys: [[37.8000, -122.4240], [37.7995, -122.4360], [37.7990, -122.4425], [37.7985, -122.4470]] },
  { id: 'soma-warehouse', type: 'street', name: 'SoMa Warehouse Run', cls: 'B', chapter: 1, time: 0.5, traffic: true, rivals: 3,
    desc: 'Loading docks, freeway pillars and the ballpark lights. Midnight in South of Market.',
    keys: [[37.7766, -122.3947], [37.7832, -122.3992], [37.7867, -122.3960], [37.7845, -122.3878, 'Embarcadero'], [37.7797, -122.3897]] },
  { id: 'night-market-sprint', type: 'street', name: 'Night Market Circuit', cls: 'B', chapter: 2, time: 22, traffic: true, laps: 2, rivals: 3,
    desc: 'Two laps of Treasure Island under the market lights, the whole city glowing across the water.',
    // TI's street grid (9th / Avenue M / 4th / Avenue H / 5th / Avenue D). The old keys all hinted 'Avenue of the Palms'
    // (386 m long here) and cut 26 % of the lap across lots and through 32 building footprints: nobody finished.
    keys: [[37.8212, -122.3745, 'Palms'], [37.8255, -122.3752, 'Gateview'], [37.8285, -122.3720, 'Avenue H'], [37.8265, -122.3650, 'Avenue M'], [37.8225, -122.3660, 'Avenue M'], [37.8222, -122.3700, '5th Street']] },
  { id: 'market-midnight', type: 'street', name: 'Market Street Midnight', cls: 'A', chapter: 3, time: 1.2, traffic: true, rivals: 3,
    desc: 'The Ferry Building clock strikes one. Market Street, end to end, in whatever gaps the buses leave.',
    keys: [[37.7945, -122.3950, 'Market'], [37.7832, -122.4080, 'Market'], [37.7717, -122.4235, 'Market'], [37.7626, -122.4350, 'Market']] },

  // ---- Dirt Racing
  { id: 'ocean-beach-scramble', type: 'dirt', name: 'Ocean Beach Scramble', cls: 'C', chapter: 1, rivals: 5,
    desc: 'Five kilometres of hard-packed sand between the surf and the dunes. Stay out of the water.',
    // along the sand line (the first key was on the bluff above the beach; the grid started on a 76 % dune face)
    keys: [[37.7755, -122.5122, '~'], [37.7720, -122.5120, '~'], [37.7690, -122.5115, '~'], [37.7660, -122.5115, '~'], [37.7630, -122.5110, '~'], [37.7590, -122.5105, '~'], [37.7540, -122.5100, '~'], [37.7490, -122.5098, '~']] },
  { id: 'crissy-dash', type: 'dirt', name: 'Crissy Field Dash', cls: 'D', chapter: 1, laps: 2, rivals: 5,
    desc: 'Grass, sand and a view of the bridge. Two laps of the old airfield.',
    // on the airfield lawn between Mason St and the dunes (the old south leg ran along the Presidio Parkway ramps and
    // the Mason St hangars: rivals pinned on the deck barriers)
    keys: [[37.8047, -122.4535, '~'], [37.8047, -122.4635, '~'], [37.80435, -122.4635, '~'], [37.80435, -122.4535, '~']] },
  { id: 'polo-fields-oval', type: 'dirt', name: 'Polo Fields Oval', cls: 'D', chapter: 1, laps: 3, rivals: 5,
    desc: 'Three laps of a dirt oval in the middle of Golden Gate Park. Throw it sideways.',
    // an oval on the flat polo field itself (the old 530 x 450 m box climbed 22 m of grass banks: FWD rivals
    // spun on the grid slope and nobody finished)
    keys: [[37.76812, -122.49115, '~'], [37.76854, -122.49169, '~'], [37.76872, -122.49300, '~'], [37.76854, -122.49431, '~'], [37.76812, -122.49485, '~'], [37.76770, -122.49431, '~'], [37.76752, -122.49300, '~'], [37.76770, -122.49169, '~']] },
  { id: 'presidio-trails', type: 'dirt', name: 'Presidio Trails', cls: 'B', chapter: 2, rivals: 5,
    desc: 'Through the eucalyptus from the Arguello Gate down to the bay.',
    keys: [[37.7880, -122.4590], [37.7925, -122.4610, '~'], [37.7960, -122.4650, '~'], [37.8000, -122.4600, '~'], [37.8040, -122.4560, '~']] },
  { id: 'headlands-dirt', type: 'dirt', name: 'Headlands Dirt Sprint', cls: 'B', chapter: 5, rivals: 5,
    desc: 'Up and over the Marin hills on fire roads, the bridge towers poking through the fog below.',
    keys: [[37.8330, -122.4840, 'Conzelman'], [37.8350, -122.4900, '~'], [37.8330, -122.4970, '~'], [37.8290, -122.5010, '~'], [37.8255, -122.4990, 'Conzelman']] },

  // ---- Cross Country
  { id: 'presidio-xc', type: 'xc', name: 'Presidio Cross Country', cls: 'C', chapter: 1, rivals: 5,
    desc: 'Palace of Fine Arts to Sea Cliff via Crissy Field, Fort Point and the sand at Baker Beach.',
    keys: [[37.8029, -122.4484], [37.8045, -122.4560, '~'], [37.8050, -122.4660, '~'], [37.8070, -122.4735, 'Lincoln'], [37.7980, -122.4790, 'Lincoln'], [37.7936, -122.4838, '~'], [37.7890, -122.4850, '~'], [37.7870, -122.4900]] },
  { id: 'lands-end-xc', type: 'xc', name: 'Lands End Cross Country', cls: 'B', chapter: 1, rivals: 5,
    desc: 'Clifftops, the Sutro ruins and the whole of Ocean Beach. Gates are generous. The cliffs are not.',
    keys: [[37.7870, -122.4900], [37.7850, -122.4990, '~'], [37.7810, -122.5060, '~'], [37.7790, -122.5105, '~'], [37.7740, -122.5115, '~'], [37.7680, -122.5110, '~'], [37.7695, -122.5090, 'Great Highway']] },
  { id: 'ggpark-xc', type: 'xc', name: 'Golden Gate Park Cross Country', cls: 'C', chapter: 2, rivals: 5,
    desc: 'Meadow to meadow across the park, all the way to the ocean.',
    keys: [[37.7745, -122.4540], [37.7720, -122.4620, '~'], [37.7700, -122.4720, '~'], [37.7680, -122.4930, '~'], [37.7690, -122.5010, '~'], [37.7700, -122.5080, 'Great Highway']] },
  { id: 'twin-peaks-xc', type: 'xc', name: 'Twin Peaks Cross Country', cls: 'B', chapter: 4, rivals: 5,
    desc: 'Straight down the grass from the summit. Gravity does most of the work.',
    keys: [[37.7544, -122.4477, 'Twin Peaks'], [37.7560, -122.4510, '~'], [37.7585, -122.4540, '~'], [37.7560, -122.4600, 'Clarendon'], [37.7600, -122.4560, '~'], [37.7625, -122.4465]] },
  { id: 'headlands-xc', type: 'xc', name: 'Marin Headlands Cross Country', cls: 'A', chapter: 5, rivals: 5,
    desc: 'The big one: off the bridge, over the headlands, past the batteries and down to the cliffs.',
    // (no Alexander Ave / 101 hill keys: reaching them from the bridge needed a U-turn on US 101 at the Alexander Ave
    // tunnel, where the whole grid piled up on the tunnel walls)
    keys: [[37.8324, -122.4812, 'Golden Gate'], [37.8340, -122.4930, '~'], [37.8255, -122.4990, '~'], [37.8290, -122.5040, '~'], [37.8280, -122.4940, 'Conzelman']] },

  // ---- Drag
  { id: 'marina-drag', type: 'drag', name: 'Marina Boulevard Drag', cls: 'B', chapter: 0, time: 21.5, dist: 402, rivals: 3,
    desc: 'A quarter mile along the Marina, festival lights on one side, the bay on the other.',
    keys: [[37.8057, -122.4440], [37.8060, -122.4320]] },
  { id: 'great-highway-quarter', type: 'drag', name: 'Great Highway Quarter Mile', cls: 'A', chapter: 1, dist: 402, rivals: 3,
    desc: 'Sand on the tarmac and the Pacific in your ear. Launch clean.',
    keys: [[37.7640, -122.5094, 'Great Highway'], [37.7560, -122.5090, 'Great Highway']] },
  { id: 'treasure-island-strip', type: 'drag', name: 'Treasure Island Strip', cls: 'S1', chapter: 2, time: 22.4, dist: 402, rivals: 3,
    desc: 'The old runway road, city lights across the water. Night Market regulars bet on this one.',
    keys: [[37.8235, -122.3740, 'California'], [37.8240, -122.3660, 'California']] },

  // ---- Drift (solo, scored against the rivals' posted scores)
  { id: 'pier70-warehouse', type: 'drift', name: 'Pier 70 Warehouse Drift', cls: 'B', chapter: 3, laps: 2, time: 21, rivals: 5,
    desc: 'Two laps around the old shipyard blocks. Angle and speed, nothing else matters.',
    keys: [[37.7605, -122.3880], [37.7605, -122.3840], [37.7580, -122.3840], [37.7580, -122.3880]] },
  { id: 'twin-peaks-switchbacks', type: 'drift', name: 'Twin Peaks Switchbacks', cls: 'B', chapter: 3, rivals: 5,
    desc: 'The figure-eight on the summit. Link every bend.',
    keys: [[37.7580, -122.4450, 'Twin Peaks'], [37.7544, -122.4477, 'Twin Peaks'], [37.7515, -122.4480, 'Twin Peaks'], [37.7530, -122.4455, 'Twin Peaks']] },
  { id: 'lincoln-slide', type: 'drift', name: 'Lincoln Boulevard Slide', cls: 'A', chapter: 3, rivals: 5,
    desc: 'Clifftop sweepers above Baker Beach. Keep it off the guardrail.',
    keys: [[37.8060, -122.4730, 'Lincoln'], [37.7980, -122.4790, 'Lincoln'], [37.7890, -122.4840, 'Lincoln']] },
  { id: 'conzelman-curves', type: 'drift', name: 'Conzelman Curves', cls: 'A', chapter: 5, rivals: 5,
    desc: 'The headlands road hangs off the cliff. The view is incredible. Do not look at it.',
    keys: [[37.8330, -122.4840, 'Conzelman'], [37.8290, -122.4905, 'Conzelman'], [37.8255, -122.4990, 'Conzelman']] },

  // ---- Showcases
  { id: 'fleet-week', type: 'showcase', name: 'Fleet Week', cls: 'S1', chapter: 2, opponent: 'jets', loaner: 'super',
    desc: 'The Bay Blades display team takes off from Treasure Island. They fly the waterfront to the Golden Gate. You drive it.',
    keys: [[37.8205, -122.3715, 'Avenue of the Palms'], [37.8110, -122.3640, 'Yerba Buena'], [37.7990, -122.3790, 'Bay Bridge'], [37.7879, -122.3869, 'Bay Bridge'], [37.7955, -122.3937, 'Embarcadero'], [37.8087, -122.4098, 'Embarcadero'], [37.8060, -122.4310], [37.8055, -122.4410], [37.8015, -122.4600, 'Presidio Pkwy'], [37.8077, -122.4750, 'Golden Gate']],
    fly: [[37.8230, -122.3690, 40], [37.8150, -122.3640, 110], [37.8000, -122.3760, 140], [37.7920, -122.3860, 120], [37.8000, -122.3950, 90], [37.8110, -122.4080, 80], [37.8110, -122.4250, 90], [37.8100, -122.4400, 100], [37.8080, -122.4580, 110], [37.8100, -122.4760, 150]] },
  { id: 'fog-bank', type: 'showcase', name: 'Fog Bank', cls: 'A', chapter: 4, opponent: 'fog', loaner: 'rally', time: 17.6,
    desc: 'Karl the Fog is pouring over Twin Peaks. Get from the summit to the sea before it swallows you.',
    keys: [[37.7544, -122.4477, 'Twin Peaks'], [37.7560, -122.4600, 'Clarendon'], [37.7640, -122.4660], [37.7650, -122.4800], [37.7655, -122.4950], [37.7655, -122.5095, 'Great Highway']] },
  { id: 'foil-rush', type: 'showcase', name: 'Foil Rush', cls: 'S1', chapter: 6, opponent: 'boat', loaner: 'coupe',
    desc: 'A 50-foot foiling catamaran does 45 knots on the bay. Race it from Pier 39 to the middle of the Golden Gate.',
    keys: [[37.8087, -122.4098, 'Embarcadero'], [37.8063, -122.4205], [37.8058, -122.4318], [37.8055, -122.4410], [37.8015, -122.4600, 'Presidio Pkwy'], [37.8077, -122.4750, 'Golden Gate'], [37.8199, -122.4783, 'Golden Gate']],
    sail: [[37.8115, -122.4100], [37.8105, -122.4230], [37.8095, -122.4320], [37.8090, -122.4420], [37.8080, -122.4560], [37.8110, -122.4700], [37.8199, -122.4783]] },
];

// ------------------------------------------------------------------ world stunts
// thresholds: [1-star, 2-star, 3-star]. traps: mph at the camera; zones: average mph; danger: jump distance in metres;
// drift: points (derived from the zone length when absent); trail: seconds (derived from the distance when absent)
export const STUNTS = [
  // speed traps
  { id: 'trap-great-hwy', type: 'trap', name: 'Great Highway Speed Trap', ll: [37.7610, -122.5093], hint: 'Great Highway', stars: [95, 125, 150] },
  { id: 'trap-gg', type: 'trap', name: 'Golden Gate Speed Trap', ll: [37.8199, -122.4783], hint: 'Golden Gate', stars: [90, 120, 150] },
  { id: 'trap-bay', type: 'trap', name: 'Bay Bridge Speed Trap', ll: [37.7990, -122.3790], hint: 'Bay Bridge', stars: [90, 120, 150] },
  { id: 'trap-embarc', type: 'trap', name: 'Embarcadero Speed Trap', ll: [37.8000, -122.3975], hint: 'Embarcadero', stars: [80, 105, 130] },
  { id: 'trap-presidio', type: 'trap', name: 'Presidio Parkway Speed Trap', ll: [37.8025, -122.4600], hint: 'Presidio Pkwy', stars: [85, 115, 140] },
  { id: 'trap-van-ness', type: 'trap', name: 'Van Ness Speed Trap', ll: [37.7890, -122.4222], hint: 'Van Ness', stars: [70, 95, 120] },
  { id: 'trap-geary', type: 'trap', name: 'Geary Speed Trap', ll: [37.7815, -122.4700], hint: 'Geary', stars: [75, 100, 125] },
  { id: 'trap-market', type: 'trap', name: 'Market Street Speed Trap', ll: [37.7760, -122.4180], hint: 'Market', stars: [75, 100, 125] },
  { id: 'trap-park-presidio', type: 'trap', name: 'Park Presidio Speed Trap', ll: [37.7850, -122.4722], hint: 'Park Presidio', stars: [80, 110, 135] },
  { id: 'trap-jfk', type: 'trap', name: 'JFK Drive Speed Trap', ll: [37.7705, -122.4780], hint: 'JFK', stars: [70, 95, 120] },
  // speed zones (start -> end)
  { id: 'zone-great-hwy', type: 'zone', name: 'Great Highway Speed Zone', ll: [37.7690, -122.5095], to: [37.7560, -122.5090], hint: 'Great Highway', stars: [85, 110, 130] },
  { id: 'zone-bay-bridge', type: 'zone', name: 'Bay Bridge Speed Zone', ll: [37.7900, -122.3860], to: [37.8060, -122.3700], hint: 'Bay Bridge', stars: [85, 110, 135] },
  { id: 'zone-gg', type: 'zone', name: 'Golden Gate Speed Zone', ll: [37.8110, -122.4760], to: [37.8290, -122.4800], hint: 'Golden Gate', stars: [85, 110, 135] },
  { id: 'zone-presidio', type: 'zone', name: 'Presidio Parkway Speed Zone', ll: [37.8015, -122.4500], to: [37.8045, -122.4700], hint: 'Presidio Pkwy', stars: [75, 100, 125] },
  { id: 'zone-embarcadero', type: 'zone', name: 'Embarcadero Speed Zone', ll: [37.8030, -122.4005], to: [37.7930, -122.3925], hint: 'Embarcadero', stars: [70, 90, 110] },
  { id: 'zone-geary', type: 'zone', name: 'Geary Boulevard Speed Zone', ll: [37.7812, -122.4650], to: [37.7800, -122.4830], hint: 'Geary', stars: [65, 85, 105] },
  // danger signs: dir = compass heading of the jump (deg, 0 = north); the nearest real crest is found at runtime
  { id: 'danger-filbert', type: 'danger', name: 'Filbert Street Danger Sign', ll: [37.8001, -122.4176], hint: 'Filbert', dir: 90, stars: [24, 40, 58] },
  { id: 'danger-hyde', type: 'danger', name: 'Hyde Street Danger Sign', ll: [37.8020, -122.4192], hint: 'Hyde', dir: 0, stars: [24, 40, 58] },
  { id: 'danger-taylor', type: 'danger', name: 'Taylor Street Danger Sign', ll: [37.7977, -122.4135], hint: 'Taylor', dir: 0, stars: [24, 40, 58] },
  { id: 'danger-jones', type: 'danger', name: 'Jones Street Danger Sign', ll: [37.7920, -122.4135], hint: 'Jones', dir: 180, stars: [24, 40, 58] },
  { id: 'danger-divisadero', type: 'danger', name: 'Divisadero Danger Sign', ll: [37.7937, -122.4410], hint: 'Divisadero', dir: 0, stars: [24, 40, 58] },
  { id: 'danger-fillmore', type: 'danger', name: 'Fillmore Street Danger Sign', ll: [37.7916, -122.4342], hint: 'Fillmore', dir: 180, stars: [24, 40, 58] },
  { id: 'danger-steiner', type: 'danger', name: 'Alamo Square Danger Sign', ll: [37.7766, -122.4359], hint: 'Steiner', stars: [20, 34, 50] },
  { id: 'danger-kearny', type: 'danger', name: 'Telegraph Hill Danger Sign', ll: [37.7985, -122.4055], hint: 'Kearny', stars: [20, 34, 50] },
  { id: 'danger-buena-vista', type: 'danger', name: 'Buena Vista Danger Sign', ll: [37.7705, -122.4420], hint: 'Buena Vista', stars: [20, 34, 50] },
  { id: 'danger-lombard', type: 'danger', name: 'Lombard Street Danger Sign', ll: [37.8016, -122.4200], hint: 'Lombard', stars: [20, 34, 50] },
  // drift zones (start -> end along the road)
  { id: 'dz-twin-peaks', type: 'drift', name: 'Twin Peaks Drift Zone', ll: [37.7580, -122.4460], to: [37.7530, -122.4480], hint: 'Twin Peaks' },
  { id: 'dz-conzelman', type: 'drift', name: 'Conzelman Drift Zone', ll: [37.8330, -122.4840], to: [37.8290, -122.4920], hint: 'Conzelman' },
  { id: 'dz-lincoln', type: 'drift', name: 'Lincoln Boulevard Drift Zone', ll: [37.8000, -122.4780], to: [37.7920, -122.4830], hint: 'Lincoln' },
  { id: 'dz-ti', type: 'drift', name: 'Treasure Island Drift Zone', ll: [37.8290, -122.3725], to: [37.8290, -122.3660], hint: 'Avenue of the Palms' },
  { id: 'dz-pier70', type: 'drift', name: 'Pier 70 Drift Zone', ll: [37.7610, -122.3880], to: [37.7580, -122.3845] },
  { id: 'dz-jfk', type: 'drift', name: 'JFK Drive Drift Zone', ll: [37.7700, -122.4650], to: [37.7700, -122.4820], hint: 'JFK' },
  { id: 'dz-clarendon', type: 'drift', name: 'Clarendon Drift Zone', ll: [37.7575, -122.4560], to: [37.7560, -122.4630], hint: 'Clarendon' },
  { id: 'dz-el-camino', type: 'drift', name: 'El Camino del Mar Drift Zone', ll: [37.7870, -122.4930], to: [37.7835, -122.5040], hint: 'El Camino' },
  // trailblazers: any route from A to B
  { id: 'tb-hill-to-sea', type: 'trail', name: 'Hill to Sea Trailblazer', ll: [37.7544, -122.4477], hint: 'Twin Peaks', to: [37.7580, -122.5090] },
  { id: 'tb-bridge-to-bridge', type: 'trail', name: 'Bridge to Bridge Trailblazer', ll: [37.8077, -122.4750], hint: 'Golden Gate', to: [37.7880, -122.3880] },
  { id: 'tb-coit-to-cliff', type: 'trail', name: 'Coit to Cliff Trailblazer', ll: [37.8020, -122.4070], to: [37.7785, -122.5130] },
  { id: 'tb-alamo-dash', type: 'trail', name: 'Alamo Dash Trailblazer', ll: [37.7764, -122.4346], to: [37.7700, -122.4760] },
  { id: 'tb-wharf-mission', type: 'trail', name: 'Wharf to Mission Trailblazer', ll: [37.8080, -122.4160], to: [37.7596, -122.4269] },
  { id: 'tb-presidio-plunge', type: 'trail', name: 'Presidio Plunge Trailblazer', ll: [37.7989, -122.4662], to: [37.8045, -122.4600] },
];

// ------------------------------------------------------------------ collectibles
// bonus boards: 'xp' (+XP) or 'ft' (fast travel discount). Placed roadside near the point, facing the road.
export const BOARDS = [
  ['xp', 'Fort Mason', 37.8060, -122.4300], ['xp', 'Aquatic Park', 37.8065, -122.4225], ['xp', 'Washington Square', 37.8008, -122.4100],
  ['xp', 'Telegraph Hill', 37.8015, -122.4050], ['xp', 'Ferry Plaza', 37.7960, -122.3935], ['xp', 'Rincon Park', 37.7905, -122.3900],
  ['xp', 'South Park', 37.7812, -122.3940], ['xp', 'Dolores Park', 37.7596, -122.4269], ['xp', 'The Castro', 37.7626, -122.4350],
  ['xp', 'Haight-Ashbury', 37.7700, -122.4469], ['xp', 'The Panhandle', 37.7725, -122.4450], ['xp', 'Japantown', 37.7853, -122.4298],
  ['xp', 'Lafayette Park', 37.7915, -122.4275], ['xp', 'Presidio Main Post', 37.7989, -122.4662], ['xp', 'Baker Beach', 37.7936, -122.4838],
  ['xp', 'Lands End', 37.7800, -122.5050], ['xp', 'Stow Lake', 37.7700, -122.4760], ['xp', 'Inner Sunset', 37.7640, -122.4660],
  ['xp', 'Outer Sunset', 37.7580, -122.5000], ['xp', 'Twin Peaks', 37.7520, -122.4470],
  ['ft', 'Treasure Island', 37.8240, -122.3700], ['ft', 'Yerba Buena Island', 37.8100, -122.3660], ['ft', 'Hawk Hill', 37.8260, -122.4970],
  ['ft', 'Vista Point', 37.8320, -122.4800], ['ft', 'Pier 70', 37.7610, -122.3860], ['ft', 'Mission Bay', 37.7780, -122.3900],
  ['ft', 'Civic Center', 37.7795, -122.4185], ['ft', 'Chinatown', 37.7940, -122.4070], ['ft', 'Inner Richmond', 37.7800, -122.4800],
  ['ft', 'Ocean Beach', 37.7700, -122.5090],
].map(([kind, name, lat, lon], i) => ({ id: `board-${i + 1}`, kind, name, ll: [lat, lon] }));

// barn finds: a rumour opens a search area; the car is restored `restore` minutes of play after discovery
export const BARNS = [
  { id: 'barn-presidio', name: 'The Stable Coupe', ll: [37.7960, -122.4580], chapter: 1, restore: 6, prefer: ['comet', 'classic9', 'muscle'], tags: ['classic', 'vintage'],
    rumour: 'A groundskeeper swears there is a coupe under a tarp behind the old Presidio stables. Nobody has opened those doors since the seventies.' },
  { id: 'barn-sunset', name: 'The Sunset Garage', ll: [37.7560, -122.5000], chapter: 2, restore: 8, prefer: ['sport1', 'seiun', 'rally'], tags: ['rally', 'group-b'],
    rumour: 'Out in the Sunset there is a garage that has not opened since a rally team rented it in the eighties. Salt air, sand, and something with four-wheel drive.' },
  { id: 'barn-dogpatch', name: 'The Shipyard Find', ll: [37.7575, -122.3900], chapter: 3, restore: 8, prefer: ['saetta', 'contessa', 'coupe'], tags: ['classic', 'supercar'],
    rumour: 'A welder at Pier 70 says one of the old shipyard sheds has a sports car sealed inside. Owner went to sea and never came back for it.' },
  { id: 'barn-marin', name: 'The Headlands Bunker', ll: [37.8290, -122.4950], chapter: 5, restore: 10, prefer: ['tempesta', 'sovereign', 'super'], tags: ['classic', 'supercar'],
    rumour: 'Somebody stashed a prototype in one of the old gun batteries in the Marin Headlands. The fog keeps it secret.' },
  { id: 'barn-ti', name: 'The Hangar Legend', ll: [37.8265, -122.3745], chapter: 6, restore: 12, prefer: ['funo', 'super'], tags: ['hypercar', 'hyper'],
    rumour: 'Treasure Island still has one hangar from the navy days. Word is there is something very fast and very Italian-looking in there.' },
];

// player houses: fast travel points with perks
export const HOUSES = [
  { id: 'house-dogpatch', name: 'Dogpatch Loft', place: 'Dogpatch', ll: [37.7585, -122.3890], price: 30000, perk: 'spin',
    perkText: 'Fast travel point. Includes a Prize Spin on purchase.' },
  { id: 'house-alamo', name: 'The Painted Lady', place: 'Alamo Square', ll: [37.7762, -122.4332], price: 85000, perk: 'skillxp',
    perkText: 'Fast travel point. +10% XP from skill chains.' },
  { id: 'house-russianhill', name: 'Russian Hill Penthouse', place: 'Russian Hill', ll: [37.8010, -122.4185], price: 300000, perk: 'freeft',
    perkText: 'Fast travel point. Fast travel is free everywhere.' },
  { id: 'house-seacliff', name: 'Sea Cliff Villa', place: 'Sea Cliff', ll: [37.7875, -122.4905], price: 750000, perk: 'credits',
    perkText: 'Fast travel point. +5% credits from events and a Super Prize Spin on purchase.' },
];

// ------------------------------------------------------------------ rivals (persistent, fill every grid)
// skill 0..1 (added to the difficulty), aggression 0..1 (late braking, less lift), prefers = car keys in order
export const RIVALS = [
  { id: 'fogline', name: 'Karla Jansen', nick: 'Fogline', home: 'Outer Sunset', skill: 0.95, aggr: 0.6, prefers: ['stallion18', 'hellion', 'muscle', 'corsair'], color: '#9fb4c7', line: 'I grew up in the fog. I do not need to see the road.' },
  { id: 'tiburon', name: 'Tony Russo', nick: 'Tiburon Tony', home: 'Marina', skill: 0.8, aggr: 0.4, prefers: ['coupe', 'vanguard', 'stradale', 'classic9'], color: '#ffc247', line: 'Nice car. Did it come with a driver?' },
  { id: 'maria', name: 'Maria Salazar', nick: 'Mission Maria', home: 'Mission', skill: 0.85, aggr: 0.75, prefers: ['aspro', 'rallye6', 'rally', 'baja'], color: '#ff5a36', line: 'Valencia Street is mine. Everything else is a loan.' },
  { id: 'sven', name: 'Sven Holm', nick: 'Sunset Sven', home: 'Sunset', skill: 0.7, aggr: 0.3, prefers: ['hatch', 'ev', 'elektra', 'munja'], color: '#4fd2ff', line: 'Silent but fast. Like the fog.' },
  { id: 'dee', name: 'Dee Okafor', nick: 'Dogpatch Dee', home: 'Dogpatch', skill: 0.9, aggr: 0.8, prefers: ['raiden', 'corsair', 'super', 'celerite'], color: '#b25cff', line: 'I build them, I race them, I break them.' },
  { id: 'nate', name: 'Nate Whitcombe', nick: 'Nob Hill Nate', home: 'Nob Hill', skill: 0.65, aggr: 0.2, prefers: ['sedan', 'k5', 'sovereign', 'vanguard'], color: '#e8e0c8', line: 'My family has driven these hills for four generations. Mostly slowly.' },
  { id: 'wren', name: 'Wren Park', nick: 'Switchback', home: 'Twin Peaks', skill: 0.88, aggr: 0.5, prefers: ['petard', 'tora', 'gauner', 'kestrel'], color: '#7cc94a', line: 'Corners are where races are won. Straights are for thinking.' },
  { id: 'deacon', name: 'Deacon Hale', nick: 'Deacon', home: 'Bayview', skill: 0.75, aggr: 0.9, prefers: ['brawler', 'vandal', 'baja', 'trophy'], color: '#c8843a', line: 'Rubbing is racing. Hope you brought paint.' },
  { id: 'lulu', name: 'Lulu Ferreira', nick: 'North Beach Lulu', home: 'North Beach', skill: 0.78, aggr: 0.55, prefers: ['sora', 'senkou', 'contessa', 'coupeGT'], color: '#ff6ad5', line: 'Espresso, then victory. In that order.' },
  { id: 'ike', name: 'Ike Tanaka', nick: 'Ike', home: 'Japantown', skill: 0.82, aggr: 0.45, prefers: ['hachi', 'rz7', 'kaminari', 'aska'], color: '#ff2e7e', line: 'Light car, heavy right foot.' },
  { id: 'priya', name: 'Priya Nair', nick: 'Redline', home: 'SoMa', skill: 0.92, aggr: 0.65, prefers: ['ev', 'elektra', 'munja', 'celerite'], color: '#3aa0ff', line: 'Torque is instant. So is losing to me.' },
  { id: 'otis', name: 'Otis Blackwood', nick: 'Headlands Otis', home: 'Marin', skill: 0.72, aggr: 0.35, prefers: ['kodiak', 'trekker', 'baja', 'trophy'], color: '#6f8f4e', line: 'Roads are a suggestion.' },
];

// ------------------------------------------------------------------ stories
// mission kinds: tail, tag, race, drag, reach, speed, air, drift, smash, nearmiss, fare
// stars: thresholds for 1/2/3 stars on the mission's score (see stories.js for each kind's score)
export const STORIES = [
  {
    id: 'hill-chase', name: 'Hill Chase', chapter: 0, host: 'frankie', color: '#ff8a1d',
    blurb: 'Frankie Delgado drove the most famous chase ever filmed on these hills. Forty years later, he wants to see if anyone can do it better.',
    missions: [
      { id: 'hc1', name: 'The Tail', kind: 'tail', car: 'muscle', time: 17.8,
        start: [37.7937, -122.4080], route: [[37.7937, -122.4080], [37.7962, -122.4130], [37.7990, -122.4185], [37.8020, -122.4192], [37.8047, -122.4197], [37.8060, -122.4310]],
        desc: 'Follow the black sedan through Russian Hill. Stay close enough to see it, far enough not to get made.',
        stars: [0.5, 0.7, 0.85], rewards: { credits: 6000, xp: 1500 },
        intro: [['frankie', 'Kid, in sixty-eight we spent three weeks on these hills and burned through two cars. Let me see how you tail somebody.'], ['frankie', 'Black sedan. Keep it in sight. Get too close and he knows.']],
        outro: [['frankie', 'Not bad. You drive like somebody who has watched the movie too many times. That is a compliment.']] },
      { id: 'hc2', name: 'Up and Over', kind: 'air', car: 'muscle', time: 16.5,
        start: [37.7948, -122.4178], route: [[37.7948, -122.4178], [37.7990, -122.4185], [37.8020, -122.4192], [37.8047, -122.4197]], timeLimit: 60,
        desc: 'Hit every crest down Russian Hill. Total air time is the score.',
        stars: [2.0, 3.5, 5.0], rewards: { credits: 7000, xp: 1800 },
        intro: [['frankie', 'The trick with these hills is that the car wants to fly. Let it.'], ['frankie', 'Get as much air as you can before the bottom. And land straight. I am too old to fill out insurance forms.']],
        outro: [['frankie', 'That hubcap sound. That is the sound of history.']] },
      { id: 'hc3', name: 'Squeal', kind: 'drift', car: 'muscle', time: 15.2,
        start: [37.8013, -122.4520], route: [[37.8013, -122.4520, 'Presidio Pkwy'], [37.8040, -122.4690, 'Presidio Pkwy'], [37.8070, -122.4735, 'Lincoln'], [37.7980, -122.4790, 'Lincoln']], timeLimit: 90,
        desc: 'The old studio sound guys dubbed tyre squeal over everything. Give them the real thing.',
        stars: [8000, 18000, 32000], rewards: { credits: 7500, xp: 2000 },
        intro: [['frankie', 'Back then we added the tyre noise in post. Today I want the real thing. Slide it through the Presidio.']],
        outro: [['frankie', 'Now THAT is a soundtrack.']] },
      { id: 'hc4', name: 'Hot Pursuit', kind: 'tag', car: 'muscle', time: 17.2, opponent: 'sedan',
        start: [37.7930, -122.4230], route: [[37.7930, -122.4230], [37.7990, -122.4240], [37.8000, -122.4360], [37.8055, -122.4410], [37.8015, -122.4600, 'Presidio Pkwy'], [37.8077, -122.4750, 'Golden Gate']],
        desc: 'The sedan is running for the Golden Gate. Catch it and stay on its bumper.',
        stars: [1, 2, 3], rewards: { credits: 9000, xp: 2400 },
        intro: [['frankie', 'This time you are not following. You are catching. Put your nose on his bumper and keep it there.']],
        outro: [['frankie', 'Caught him before the bridge. In the movie we needed a gas station and a lot of explosives.']] },
      { id: 'hc5', name: 'Final Cut', kind: 'race', car: null, cls: 'B', time: 18.4, opponent: 'frankie',
        start: [37.7948, -122.4178], route: [[37.7948, -122.4178], [37.8020, -122.4192], [37.8047, -122.4197], [37.8058, -122.4318], [37.8055, -122.4410]],
        desc: 'One last run. Frankie against you, Russian Hill to the festival gates.',
        stars: [1, 1, 1], rewards: { credits: 15000, xp: 4000, car: 'muscle' },
        intro: [['frankie', 'One more take. Me and you, down the hill to the festival. Loser buys the coffee for the next forty years.']],
        outro: [['frankie', 'Beat by a rookie. On my own hill. Keep the Stallion, kid. It likes you better anyway.']] },
    ],
  },
  {
    id: 'take-two', name: 'Take Two', chapter: 1, host: 'juno', color: '#3bc4f4',
    blurb: 'Juno Park is shooting "Fog City Fury" on a shoestring budget and a stolen permit. She needs a stunt driver who never needs a second take.',
    missions: [
      { id: 'tt1', name: 'Speed Shot', kind: 'speed', car: 'coupe', time: 12.5,
        start: [37.7690, -122.5095, 'Great Highway'], route: [[37.7690, -122.5095, 'Great Highway'], [37.7580, -122.5090, 'Great Highway']], timeLimit: 45,
        desc: 'The camera car is waiting on the Great Highway. Hit the speed gate as fast as you can.',
        stars: [100, 125, 145], rewards: { credits: 6500, xp: 1600 },
        intro: [['juno', 'Okay, so, we have the camera for one hour and no permit. Scene 12: hero car blasts past camera. Faster than that.'], ['juno', 'Speed gate is on the Great Highway. Make the camera shake.']],
        outro: [['juno', 'The camera op screamed. That is going in the trailer.']] },
      { id: 'tt2', name: 'Smash Cut', kind: 'smash', car: 'pickup', time: 10.5, count: 18,
        start: [37.7610, -122.3880], area: [37.7595, -122.3862], radius: 70, timeLimit: 70,
        desc: 'The art department built a street full of cardboard boxes. Wreck it before the light goes.',
        stars: [10, 14, 18], rewards: { credits: 7000, xp: 1800 },
        intro: [['juno', 'The art department built all of this and I have to destroy it. Please do not tell them I enjoyed saying that.']],
        outro: [['juno', 'Beautiful destruction. The art department is crying. Good crying, I think.']] },
      { id: 'tt3', name: 'Near Miss Montage', kind: 'nearmiss', car: 'hatch', time: 20.5, count: 10,
        start: [37.7815, -122.4115, 'Market'], area: [37.7790, -122.4135], radius: 600, timeLimit: 120,
        desc: 'Thread through traffic for the montage. Every near miss is a shot.',
        stars: [5, 8, 12], rewards: { credits: 7500, xp: 2000 },
        intro: [['juno', 'Montage time. I need close calls with traffic. Close. Not touching. The insurance is literally a handshake.']],
        outro: [['juno', 'I have forty minutes of footage and I love every frame.']] },
      { id: 'tt4', name: 'The Big Jump', kind: 'air', car: 'rally', time: 11.8,
        start: [37.7920, -122.4403], route: [[37.7920, -122.4403], [37.7960, -122.4415], [37.8005, -122.4428]], timeLimit: 40,
        desc: 'The poster shot: the hero car flying off Divisadero with the bay behind it.',
        stars: [1.2, 2.0, 2.8], rewards: { credits: 9000, xp: 2400 },
        intro: [['juno', 'This is the poster. Car in the air, bay in the background, and do NOT land on the camera.']],
        outro: [['juno', 'That is the poster. That is the whole movie, honestly. Everything else is filler.']] },
      { id: 'tt5', name: 'Premiere', kind: 'reach', car: null, cls: 'A', time: 19.6,
        start: [37.8055, -122.4410], to: [37.7620, -122.4350], timeLimit: 150, damage: true,
        desc: 'The premiere is at the Castro and the reels are in your trunk. Get there on time and in one piece.',
        stars: [1, 2, 3], rewards: { credits: 14000, xp: 3500, spin: 1 },
        intro: [['juno', 'Premiere starts in two and a half minutes and the only copy of the film is in your trunk. Also the car cannot have a scratch. The car is borrowed. From my mom.']],
        outro: [['juno', 'We made it! Standing ovation! Well, standing. Some people were leaving. But standing!']] },
    ],
  },
  {
    id: 'night-shift', name: 'Night Shift', chapter: 2, host: 'mo', color: '#39e07a',
    blurb: 'Mo runs the overnight desk at FogCab. The fares are strange, the tips are good, and the city never sleeps.',
    missions: [
      { id: 'ns1', name: 'First Fare', kind: 'fare', car: 'taxi', time: 22.2,
        start: [37.7880, -122.4075], pickup: [37.7879, -122.4074], to: [37.7955, -122.3937], timeLimit: 110,
        desc: 'Union Square to the Ferry Building. Your passenger is a nervous tourist. Drive smooth.',
        stars: [1, 2, 3], rewards: { credits: 5000, xp: 1400 },
        intro: [['mo', 'Welcome to the graveyard shift. First fare is at Union Square. Tourist. Nervous. Keep it smooth and they tip.']],
        fareLines: [['fare', 'Is it always this... hilly?'], ['fare', 'Oh wow, is that the Bay Bridge?']],
        outro: [['mo', 'Five stars from the tourist. Do not let it go to your head.']] },
      { id: 'ns2', name: 'Late for the Gig', kind: 'fare', car: 'taxi', time: 21.4, rush: true,
        start: [37.7524, -122.4185], pickup: [37.7524, -122.4185], to: [37.7786, -122.3893], timeLimit: 95,
        desc: 'A drummer is late for a gig at the ballpark. Speed matters more than comfort tonight.',
        stars: [1, 2, 3], rewards: { credits: 6000, xp: 1600 },
        intro: [['mo', 'Fare on 24th and Mission. Drummer. Late. Very late. He said the words "floor it" twice.']],
        fareLines: [['fare', 'Go go go! Soundcheck was an hour ago!'], ['fare', 'Take the next left! Or right! Just faster!']],
        outro: [['mo', 'He made it. Band played. Somebody filmed you pulling up. You are internet famous for about an hour.']] },
      { id: 'ns3', name: 'Fragile', kind: 'fare', car: 'van', time: 23.6, fragile: true,
        start: [37.7937, -122.4080], pickup: [37.7937, -122.4080], to: [37.7919, -122.4130], timeLimit: 120,
        desc: 'A five-tier wedding cake, Chinatown to Nob Hill. Every hill in the city. Zero impacts.',
        stars: [1, 2, 3], rewards: { credits: 7000, xp: 1800 },
        intro: [['mo', 'Special delivery. A wedding cake. Five tiers. Chinatown bakery to a hotel on Nob Hill. If you hit anything I am changing my number.']],
        fareLines: [['fare', 'The baker is watching you drive away. She looks worried.']],
        outro: [['mo', 'The cake arrived. The bride cried. Happy crying. Mostly.']] },
      { id: 'ns4', name: 'Island Run', kind: 'fare', car: 'taxi', time: 0.8, rush: true,
        start: [37.7919, -122.4096], pickup: [37.7919, -122.4096], to: [37.8230, -122.3710], timeLimit: 150,
        desc: 'Nob Hill to the Treasure Island night market before the last vendor closes.',
        stars: [1, 2, 3], rewards: { credits: 8000, xp: 2000 },
        intro: [['mo', 'Chef at a Nob Hill hotel needs to get to the island market before the last dumpling stall shuts. She says it is an emergency. I believe her.']],
        fareLines: [['fare', 'If they close before we get there I am quitting cooking.'], ['fare', 'Bridge! Bridge! Take the bridge!']],
        outro: [['mo', 'She got her dumplings. She sent me some. You get nothing. That is how dispatch works.']] },
      { id: 'ns5', name: 'Last Call', kind: 'fare', car: null, cls: 'B', time: 2.5, rush: true,
        start: [37.7978, -122.4058], pickup: [37.7978, -122.4058], to: [37.8055, -122.4410], timeLimit: 120,
        desc: 'Last fare of the night: North Beach to the festival. The passenger is someone you know.',
        stars: [1, 2, 3], rewards: { credits: 12000, xp: 3000, spin: 1 },
        intro: [['mo', 'Last one. North Beach, going to the festival. Do not be weird about who it is.']],
        fareLines: [['lena', 'Oh, it is you! Mo said the best driver in the city was on tonight. Show me.']],
        outro: [['lena', 'Mo was right. The festival needs you on the road, not in a cab. Well. Maybe both.'], ['mo', 'Good shift. Same time tomorrow?']] },
    ],
  },
  {
    id: 'lowtide', name: 'Lowtide', chapter: 3, host: 'kai', color: '#b25cff',
    blurb: 'The Lowtide Crew ran the street scene long before any festival. Kai Mendes wants to know if festival stars can race for real.',
    missions: [
      { id: 'lt1', name: 'Audition', kind: 'nearmiss', car: null, cls: 'C', time: 22.8, count: 12,
        start: [37.7832, -122.3992], area: [37.7832, -122.3992], radius: 650, timeLimit: 120,
        desc: 'Show the crew you can thread traffic in SoMa. Near misses only. Touch nothing.',
        stars: [6, 9, 12], rewards: { credits: 7000, xp: 1800 },
        intro: [['kai', 'Festival kid. Cute. We do not have grandstands here. We have traffic. Show me you can dance through it.']],
        outro: [['kai', 'Okay. You can drive. That does not mean you can race.']] },
      { id: 'lt2', name: 'Tail Lights', kind: 'race', car: null, cls: 'B', time: 23.5, opponent: 'rook', traffic: true,
        start: [37.7766, -122.3947], route: [[37.7766, -122.3947], [37.7832, -122.3992], [37.7867, -122.3960], [37.7905, -122.3895, 'Embarcadero'], [37.8035, -122.4008, 'Embarcadero']],
        desc: 'Rook is the fastest in the crew. One on one through SoMa to the Embarcadero.',
        stars: [1, 1, 1], rewards: { credits: 9000, xp: 2400 },
        intro: [['rook', 'Kai says you are fast. Kai says a lot of things.'], ['kai', 'SoMa to the waterfront. Traffic is live. First to Pier 23.']],
        outro: [['rook', 'Fine. FINE. Rematch whenever.'], ['kai', 'Nobody beats Rook. Huh.']] },
      { id: 'lt3', name: 'Heat Check', kind: 'speed', car: null, cls: 'S1', time: 0.2, top: true,
        start: [37.7879, -122.3869, 'Bay Bridge'], route: [[37.7879, -122.3869, 'Bay Bridge'], [37.8040, -122.3720, 'Bay Bridge']], timeLimit: 60,
        desc: 'The crew clocks top speed on the Bay Bridge. Beat the number on the wall.',
        stars: [130, 150, 170], rewards: { credits: 10000, xp: 2600 },
        intro: [['kai', 'There is a number painted on a wall in our garage. Top speed on the Bay Bridge. Nobody has touched it in six years.']],
        outro: [['kai', 'We are going to need more paint.']] },
      { id: 'lt4', name: 'Island Drag', kind: 'drag', car: null, cls: 'A', time: 22.6, opponent: 'kai', dist: 402,
        start: [37.8235, -122.3740, 'California'], route: [[37.8235, -122.3740, 'California'], [37.8240, -122.3660, 'California']],
        desc: 'Kai herself. A quarter mile on Treasure Island. No second chances.',
        stars: [1, 1, 1], rewards: { credits: 12000, xp: 3000 },
        intro: [['kai', 'Quarter mile. You and me. I lose, you get a seat at the table. You lose, you go back to your festival.']],
        outro: [['kai', 'Welcome to Lowtide. Do not make me regret it.']] },
      { id: 'lt5', name: 'Crown of the Bay', kind: 'race', car: null, cls: 'S1', time: 1.5, opponent: 'crew', traffic: true,
        start: [37.8205, -122.3715, 'Avenue of the Palms'], route: [[37.8205, -122.3715, 'Avenue of the Palms'], [37.8110, -122.3640, 'Yerba Buena'], [37.7990, -122.3790, 'Bay Bridge'], [37.7879, -122.3869, 'Bay Bridge'], [37.7945, -122.3950, 'Market'], [37.7832, -122.4080, 'Market'], [37.7717, -122.4235, 'Market']],
        desc: 'The whole crew, island to Market Street, live traffic. The oldest race in the city.',
        stars: [1, 1, 1], rewards: { credits: 20000, xp: 5000, spin: 2 },
        intro: [['kai', 'Crown of the Bay. We have run it every year since before you could walk. Island to Market, whole crew, no rules.'], ['rook', 'Try to keep up this time. Oh wait.']],
        outro: [['kai', 'The Crown is yours. Lowtide and HILLBOMB. Who would have thought.']] },
    ],
  },
];

// ------------------------------------------------------------------ accolades
// stat: the progress counter (festival stats) compared to target; fp / credits / spin rewards on completion
export const ACCOLADES = [
  // festival
  { id: 'welcome', cat: 'Festival', name: 'Welcome to HILLBOMB', desc: 'Arrive at the festival.', stat: 'prologue', target: 1, fp: 100, credits: 5000 },
  { id: 'first-event', cat: 'Festival', name: 'Opening Act', desc: 'Complete your first festival event.', stat: 'eventsDone', target: 1, fp: 50 },
  { id: 'events-10', cat: 'Festival', name: 'Regular', desc: 'Complete 10 festival events.', stat: 'eventsDone', target: 10, fp: 150 },
  { id: 'events-30', cat: 'Festival', name: 'Headliner', desc: 'Complete 30 festival events.', stat: 'eventsDone', target: 30, fp: 300, spin: 1 },
  { id: 'chapter-2', cat: 'Festival', name: 'Growing Crowd', desc: 'Reach the Island Lights chapter.', stat: 'chapter', target: 2, fp: 100 },
  { id: 'chapter-5', cat: 'Festival', name: 'Over the Gate', desc: 'Reach the Over the Gate chapter.', stat: 'chapter', target: 5, fp: 200, spin: 1 },
  { id: 'legend', cat: 'Festival', name: 'HILLBOMB Legend', desc: 'Win the Bay Crown.', stat: 'bayCrown', target: 1, fp: 1000, spin: 3 },
  { id: 'outposts', cat: 'Festival', name: 'Festival Everywhere', desc: 'Open all six outposts.', stat: 'outposts', target: 6, fp: 300, spin: 1 },
  // racing
  { id: 'win-1', cat: 'Racing', name: 'First Blood', desc: 'Win a race.', stat: 'wins', target: 1, fp: 50 },
  { id: 'win-10', cat: 'Racing', name: 'Podium Habit', desc: 'Win 10 races.', stat: 'wins', target: 10, fp: 200 },
  { id: 'win-25', cat: 'Racing', name: 'Serial Winner', desc: 'Win 25 races.', stat: 'wins', target: 25, fp: 400, spin: 1 },
  { id: 'win-unbeatable', cat: 'Racing', name: 'Beat the Unbeatable', desc: 'Win a race on Unbeatable difficulty.', stat: 'winsUnbeatable', target: 1, fp: 300, spin: 1 },
  { id: 'clean-win', cat: 'Racing', name: 'Squeaky Clean', desc: 'Win a race without touching anything.', stat: 'cleanWins', target: 1, fp: 100 },
  { id: 'road-all', cat: 'Racing', name: 'Road Warrior', desc: 'Win every Road Racing event.', stat: 'winAll:road', target: 1, fp: 300, spin: 1 },
  { id: 'street-all', cat: 'Racing', name: 'King of the Night', desc: 'Win every Street Scene event.', stat: 'winAll:street', target: 1, fp: 300, spin: 1 },
  { id: 'dirt-all', cat: 'Racing', name: 'Dirt Devil', desc: 'Win every Dirt Racing event.', stat: 'winAll:dirt', target: 1, fp: 300, spin: 1 },
  { id: 'xc-all', cat: 'Racing', name: 'Off the Map', desc: 'Win every Cross Country event.', stat: 'winAll:xc', target: 1, fp: 300, spin: 1 },
  { id: 'drag-all', cat: 'Racing', name: 'Quarter Master', desc: 'Win every Drag event.', stat: 'winAll:drag', target: 1, fp: 200 },
  { id: 'drift-all', cat: 'Racing', name: 'Sideways Forever', desc: 'Win every Drift event.', stat: 'winAll:drift', target: 1, fp: 300, spin: 1 },
  { id: 'showcase-all', cat: 'Racing', name: 'Showstopper', desc: 'Win all three Showcases.', stat: 'winAll:showcase', target: 1, fp: 500, spin: 2 },
  // stunts
  { id: 'trap-3', cat: 'Stunts', name: 'Flash Photography', desc: 'Get 3 stars on any speed trap.', stat: 'trap3', target: 1, fp: 50 },
  { id: 'traps-all', cat: 'Stunts', name: 'Camera Shy', desc: 'Get 3 stars on every speed trap.', stat: 'trap3', target: 10, fp: 300, spin: 1 },
  { id: 'danger-all', cat: 'Stunts', name: 'Frequent Flyer', desc: 'Get 3 stars on every danger sign.', stat: 'danger3', target: 10, fp: 300, spin: 1 },
  { id: 'drift-zones-all', cat: 'Stunts', name: 'Tyre Budget: None', desc: 'Get 3 stars on every drift zone.', stat: 'drift3', target: 8, fp: 300, spin: 1 },
  { id: 'zones-all', cat: 'Stunts', name: 'Average Is Fast', desc: 'Get 3 stars on every speed zone.', stat: 'zone3', target: 6, fp: 300, spin: 1 },
  { id: 'trails-all', cat: 'Stunts', name: 'Pathfinder', desc: 'Get 3 stars on every trailblazer.', stat: 'trail3', target: 6, fp: 300, spin: 1 },
  { id: 'stars-50', cat: 'Stunts', name: 'Starry Night', desc: 'Earn 50 stunt stars.', stat: 'stuntStars', target: 50, fp: 200 },
  { id: 'jumps-50', cat: 'Stunts', name: 'Hill Bomber', desc: 'Land 50 jumps.', stat: 'jumps', target: 50, fp: 150 },
  { id: 'near-100', cat: 'Stunts', name: 'Inches', desc: 'Pull off 100 near misses.', stat: 'nearMisses', target: 100, fp: 150 },
  { id: 'chain-50k', cat: 'Stunts', name: 'Chain Reaction', desc: 'Bank a 50,000 point skill chain.', stat: 'bestChain', target: 50000, fp: 200, spin: 1 },
  // exploration
  { id: 'roads-25', cat: 'Exploration', name: 'Tourist', desc: 'Discover 25% of the roads.', stat: 'roadsPct', target: 25, fp: 100 },
  { id: 'roads-50', cat: 'Exploration', name: 'Local', desc: 'Discover 50% of the roads.', stat: 'roadsPct', target: 50, fp: 200 },
  { id: 'roads-100', cat: 'Exploration', name: 'Every Street in the City', desc: 'Discover every road.', stat: 'roadsPct', target: 100, fp: 1000, spin: 2 },
  { id: 'districts', cat: 'Exploration', name: 'Neighbourhood Watch', desc: 'Discover every district.', stat: 'districts', target: 20, fp: 200, spin: 1 },
  { id: 'boards-10', cat: 'Exploration', name: 'Sign Language', desc: 'Smash 10 bonus boards.', stat: 'boards', target: 10, fp: 100 },
  { id: 'boards-all', cat: 'Exploration', name: 'Board Certified', desc: 'Smash every bonus board.', stat: 'boards', target: 30, fp: 400, spin: 1 },
  { id: 'barn-1', cat: 'Exploration', name: 'Rust Never Sleeps', desc: 'Find a barn find.', stat: 'barns', target: 1, fp: 150 },
  { id: 'barn-all', cat: 'Exploration', name: 'Archaeologist', desc: 'Find every barn find.', stat: 'barns', target: 5, fp: 500, spin: 2 },
  { id: 'house-1', cat: 'Exploration', name: 'Homeowner', desc: 'Buy a house.', stat: 'houses', target: 1, fp: 100 },
  { id: 'house-all', cat: 'Exploration', name: 'Property Empire', desc: 'Buy every house.', stat: 'houses', target: 4, fp: 400, spin: 1 },
  // stories
  { id: 'story-hc', cat: 'Stories', name: 'That Is a Wrap', desc: 'Finish Hill Chase.', stat: 'story:hill-chase', target: 5, fp: 300, spin: 1 },
  { id: 'story-tt', cat: 'Stories', name: 'Final Cut', desc: 'Finish Take Two.', stat: 'story:take-two', target: 5, fp: 300, spin: 1 },
  { id: 'story-ns', cat: 'Stories', name: 'Five Star Driver', desc: 'Finish Night Shift.', stat: 'story:night-shift', target: 5, fp: 300, spin: 1 },
  { id: 'story-lt', cat: 'Stories', name: 'Crew Member', desc: 'Finish Lowtide.', stat: 'story:lowtide', target: 5, fp: 300, spin: 1 },
  { id: 'story-stars', cat: 'Stories', name: 'Director\'s Cut', desc: 'Earn 60 story stars.', stat: 'storyStars', target: 60, fp: 500, spin: 2 },
  // rivals + style
  { id: 'rivals-5', cat: 'Rivals', name: 'Making Enemies', desc: 'Beat 5 different rivals.', stat: 'rivalsBeaten', target: 5, fp: 100 },
  { id: 'rivals-all', cat: 'Rivals', name: 'Nobody Left', desc: 'Beat all 12 rivals.', stat: 'rivalsBeaten', target: 12, fp: 300, spin: 1 },
  { id: 'beat-fogline', cat: 'Rivals', name: 'Through the Fog', desc: 'Beat Fogline 5 times.', stat: 'beat:fogline', target: 5, fp: 200 },
  { id: 'speed-200', cat: 'Style', name: 'Double Ton', desc: 'Hit 200 mph.', stat: 'topMph', target: 200, fp: 200 },
  { id: 'air-3', cat: 'Style', name: 'Cleared for Takeoff', desc: 'Stay airborne for 3 seconds.', stat: 'bestAirX10', target: 30, fp: 150 },
  { id: 'cars-10', cat: 'Style', name: 'Collector', desc: 'Own 10 cars.', stat: 'carsOwned', target: 10, fp: 200, spin: 1 },
];

// ------------------------------------------------------------------ Prize Spin
// weights per rarity; items are generated from these templates (cars resolved from the roster at spin time)
export const PRIZE_TABLE = {
  normal: { common: 58, rare: 28, epic: 11, legendary: 3 },
  super: { common: 30, rare: 38, epic: 23, legendary: 9 },
  items: {
    common: [{ kind: 'credits', amount: 5000 }, { kind: 'credits', amount: 8000 }, { kind: 'credits', amount: 12000 }, { kind: 'cosmetic', id: 'horn-bell' }, { kind: 'cosmetic', id: 'plate-sf' }, { kind: 'car', cls: 'D' }],
    rare: [{ kind: 'credits', amount: 20000 }, { kind: 'credits', amount: 35000 }, { kind: 'car', cls: 'C' }, { kind: 'car', cls: 'B' }, { kind: 'cosmetic', id: 'horn-foghorn' }, { kind: 'cosmetic', id: 'wrap-fog' }],
    epic: [{ kind: 'credits', amount: 60000 }, { kind: 'credits', amount: 90000 }, { kind: 'car', cls: 'A' }, { kind: 'cosmetic', id: 'wrap-neon' }, { kind: 'cosmetic', id: 'outfit-karl' }],
    legendary: [{ kind: 'credits', amount: 250000 }, { kind: 'car', cls: 'S1' }, { kind: 'cosmetic', id: 'horn-sealion' }, { kind: 'cosmetic', id: 'wrap-gold' }],
  },
};
export const COSMETICS = {
  'horn-bell': { name: 'Cable Car Bell Horn', type: 'Horn' },
  'horn-foghorn': { name: 'Foghorn Horn', type: 'Horn' },
  'horn-sealion': { name: 'Pier 39 Sea Lion Horn', type: 'Horn' },
  'plate-sf': { name: '"SF OG" Plate', type: 'Plate' },
  'wrap-fog': { name: 'Karl the Fog Livery', type: 'Livery' },
  'wrap-neon': { name: 'Tenderloin Neon Livery', type: 'Livery' },
  'wrap-gold': { name: 'Golden Gate Livery', type: 'Livery' },
  'outfit-karl': { name: 'Fog Hoodie', type: 'Outfit' },
};

// ------------------------------------------------------------------ prologue (first launch): four drives, then the festival
export const PROLOGUE = [
  { id: 'bridge', title: 'Golden Gate Bridge', sub: 'Dawn', car: 'funo', tags: ['hyper'], time: 6.35, weather: 'fog', fog: 0.55,
    caption: [['dex', 'Good morning, San Francisco! The HILLBOMB Festival opens tonight, and somebody is bringing a very loud alarm clock.']],
    keys: [[37.8324, -122.4812, 'Golden Gate'], [37.8199, -122.4783, 'Golden Gate'], [37.8077, -122.4750, 'Golden Gate'], [37.8030, -122.4650, 'Presidio Pkwy']], limit: 55 },
  { id: 'beach', title: 'Ocean Beach', sub: 'Morning', car: 'trophy', tags: ['offroad', 'truck'], time: 9.4, weather: 'overcast', fog: 0.15,
    caption: [['dex', 'Down on Ocean Beach the surfers are paddling out and the sand is getting rearranged.']],
    // on the sand the whole way (the old first key sat on the Sutro bluff: the truck dropped 16 m onto Point Lobos Ave and
    // stopped against a pole for the rest of the segment)
    keys: [[37.7755, -122.5122, '~'], [37.7720, -122.5120, '~'], [37.7690, -122.5115, '~'], [37.7660, -122.5115, '~'], [37.7630, -122.5110, '~'], [37.7590, -122.5105, '~']], limit: 55 },
  { id: 'hill', title: 'Russian Hill', sub: 'Afternoon', car: 'muscle', tags: ['sf-chase', 'muscle', 'classic'], time: 16.4, weather: 'clear', fog: 0,
    caption: [['dex', 'Russian Hill. Steepest streets in the country, and a V8 that was built for exactly this.']],
    keys: [[37.7948, -122.4178, 'Hyde'], [37.7990, -122.4185, 'Hyde'], [37.8020, -122.4192, 'Hyde'], [37.8047, -122.4197, 'Hyde'], [37.8063, -122.4205, 'Hyde']], limit: 50 },
  { id: 'neon', title: 'Chinatown to the Tenderloin', sub: 'Night', car: 'rz7', tags: ['jdm', 'drift'], time: 22.6, weather: 'rain', fog: 0.1,
    caption: [['dex', 'And tonight? Tonight the city is wet, the lanterns are lit, and the festival is waiting. Come find us at Marina Green.']],
    // up Grant under the lanterns (one-way north), Washington, down Stockton through the tunnel, Post into the Tenderloin
    keys: [[37.7906, -122.4057, 'Grant Avenue'], [37.7958, -122.4064, 'Grant Avenue'], [37.7954, -122.4075, 'Washington'], [37.7930, -122.4078, 'Stockton'], [37.7880, -122.4100, 'Post'], [37.7870, -122.4150, 'Post'], [37.7858, -122.4196]], limit: 60 },
];
// the three cars offered at the end of the prologue (resolved against the roster; fallbacks are in-game keys)
export const STARTER_CARS = [
  { key: 'tora', blurb: 'A screaming front-drive hot hatch. Light, nimble, forgiving, and it loves the hills.' },
  { key: 'rallye6', blurb: 'All-wheel drive, all-surface. Dirt, sand, rain, fog: no problem.' },
  { key: 'stallion18', blurb: 'Big V8, rear-wheel drive, lots of attitude. Handle with care.' },
];
