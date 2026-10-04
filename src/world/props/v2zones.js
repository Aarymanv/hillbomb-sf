// Neighbourhood character for the 1:1 map: the v1 zone keys (props / peds styles + densities) from the real districts,
// crowd hot spots, commercial corridors and Muni trolleybus streets by their real (OSM) names.
import { ll } from '../latlon.js';
import { DISTRICTS2 } from '../v2/districts2.js';

const ZONE_OF = {
  'Financial District': 'downtown', 'Union Square': 'downtown', 'Chinatown': 'chinatown', 'North Beach': 'northbeach', 'Telegraph Hill': 'northbeach',
  "Fisherman's Wharf": 'wharf', 'Russian Hill': 'nobhill', 'Nob Hill': 'nobhill', 'Tenderloin': 'tenderloin', 'Civic Center': 'downtown_soma',
  'SoMa': 'soma', 'Rincon Hill': 'downtown_soma', 'South Beach': 'soma', 'Mission Bay': 'soma', 'Dogpatch': 'industrial', 'Potrero Hill': 'victorian',
  'Mission': 'mission', 'Castro': 'castro', 'Noe Valley': 'castro', 'Hayes Valley': 'victorian', 'Lower Haight': 'victorian', 'Haight-Ashbury': 'victorian',
  'Cole Valley': 'victorian', 'Western Addition': 'victorian', 'Japantown': 'victorian', 'Pacific Heights': 'marina', 'Cow Hollow': 'marina', 'Marina': 'marina',
  'Presidio': 'park', 'Presidio Heights': 'marina', 'Laurel Heights': 'marina', 'Inner Richmond': 'avenues', 'Outer Richmond': 'avenues', 'Sea Cliff': 'marina',
  "Land's End": 'park', 'Golden Gate Park': 'park', 'Inner Sunset': 'avenues', 'Outer Sunset': 'avenues', 'Parkside': 'avenues', 'Twin Peaks': 'hills',
  'Forest Hill': 'hills', 'Diamond Heights': 'hills', 'Glen Park': 'victorian', 'Bernal Heights': 'mission', 'Excelsior': 'avenues', 'Visitacion Valley': 'avenues',
  'Bayview': 'industrial', 'Hunters Point': 'industrial', 'Ingleside': 'avenues', 'Lake Merced': 'hills', 'Ocean Beach': 'avenues', 'Treasure Island': 'industrial',
  'Yerba Buena Island': 'park', 'Alcatraz': 'park', 'Marin Headlands': 'park', 'Golden Gate Bridge': 'park', 'Bay Bridge': 'industrial',
};
let D = null;
function districts() {
  if (D) return D;
  D = DISTRICTS2.map(d => { const [x, z] = ll(d.lat, d.lon); return { x, z, r: d.r, zone: ZONE_OF[d.name] || 'victorian', name: d.name }; });
  return D;
}
// memo on a 64 m grid (zone lookups happen per prop / per ped)
const zmemo = new Map();
export function zoneAtV2(x, z) {
  const k = Math.floor(x / 64) * 100003 + Math.floor(z / 64);
  let v = zmemo.get(k);
  if (v !== undefined) return v;
  let best = 'avenues', bd = Infinity;
  for (const d of districts()) { const q = Math.hypot(x - d.x, z - d.z) / d.r; if (q < bd) { bd = q; best = d.zone; } }
  if (bd > 1.6) best = 'avenues';
  zmemo.set(k, best);
  return best;
}

const ZONE_DENSITY = {
  downtown: 1, downtown_soma: 0.75, chinatown: 1, tenderloin: 0.62, soma: 0.55, northbeach: 0.88, wharf: 0.95, nobhill: 0.6, marina: 0.55,
  victorian: 0.45, castro: 0.8, mission: 0.82, avenues: 0.28, industrial: 0.16, hills: 0.14, park: 0.3,
};
// real crowd magnets [lat, lon, radius m, density]
const HOT = [[37.7880, -122.4075, 260, 1], [37.7941, -122.4078, 240, 1], [37.8080, -122.4150, 330, 1], [37.7609, -122.4350, 250, 0.95],
  [37.7650, -122.4216, 330, 0.95], [37.7524, -122.4184, 300, 0.9], [37.7955, -122.3937, 230, 0.95], [37.7946, -122.3999, 380, 1],
  [37.7849, -122.4070, 450, 0.95], [37.7692, -122.4481, 280, 0.8], [37.7596, -122.4269, 170, 0.85], [37.8008, -122.4103, 260, 0.9],
  [37.7800, -122.4135, 300, 0.75], [37.7762, -122.4328, 120, 0.7], [37.8002, -122.4375, 200, 0.7], [37.7639, -122.4665, 200, 0.7]];
let HP = null;
export function densityAtV2(x, z) {
  let d = ZONE_DENSITY[zoneAtV2(x, z)] ?? 0.4;
  HP ||= HOT.map(([la, lo, r, k]) => { const [hx, hz] = ll(la, lo); return [hx, hz, r, k]; });
  for (const h of HP) { const dd = Math.hypot(x - h[0], z - h[1]); if (dd < h[2]) d = Math.max(d, h[3] * (1 - 0.35 * dd / h[2])); }
  return d;
}

export const COMMERCIAL_ZONES_V2 = new Set(['downtown', 'downtown_soma', 'chinatown', 'northbeach', 'tenderloin', 'wharf']);
const COMM = ['Haight Street', 'Valencia Street', '24th Street', 'Clement Street', 'Irving Street', 'Chestnut Street', 'Union Street', 'Fillmore Street',
  'Castro Street', '18th Street', 'Divisadero Street', 'Polk Street', 'Columbus Avenue', 'Geary Boulevard', 'Mission Street', 'Hayes Street', 'Judah Street',
  'Noriega Street', 'Van Ness Avenue', 'Market Street', 'Church Street', 'Sacramento Street', 'Balboa Street', 'Broadway', 'Lombard Street', 'Stanyan Street',
  'Grant Avenue', 'Stockton Street', 'Kearny Street', 'Powell Street', 'Taraval Street', 'West Portal Avenue', 'Ocean Avenue', 'Cortland Avenue',
  'Folsom Street', 'Howard Street', 'Townsend Street', 'Jefferson Street', 'The Embarcadero', 'Geary Street', 'Post Street', 'Sutter Street', 'Montgomery Street',
  'California Street', 'Bush Street', 'Pine Street', 'Hyde Street', 'Larkin Street', 'Jackson Street', 'Washington Street', 'Clay Street', '16th Street',
  'Noe Street', 'Cole Street', 'Ninth Avenue', '9th Avenue', 'Mission Street', '4th Street', '3rd Street', '2nd Street', 'New Montgomery Street', 'Battery Street', 'Front Street', 'Sansome Street'];
export const COMMERCIAL_STREETS_V2 = new Set(COMM);
// Muni trolleybus / streetcar overhead lines (street names)
export const TROLLEY_V2 = new Set(['Market Street', 'Mission Street', 'Van Ness Avenue', 'South Van Ness Avenue', 'Fillmore Street', 'Haight Street', 'Hayes Street',
  'McAllister Street', 'Fulton Street', 'Sacramento Street', 'Clay Street', 'Jackson Street', 'Washington Street', 'Stockton Street', 'Union Street',
  'Columbus Avenue', 'Chestnut Street', 'Divisadero Street', 'Castro Street', '16th Street', 'Kansas Street', '18th Street', 'Ashbury Street', 'Clayton Street',
  'Potrero Avenue', 'Presidio Avenue', 'Church Street', 'Duboce Avenue', 'Judah Street', 'Taraval Street', 'Carl Street', 'Irving Street', 'Ocean Avenue',
  'West Portal Avenue', '3rd Street', 'The Embarcadero', 'Jefferson Street', 'Beach Street', 'Folsom Street', 'Howard Street', 'Mason Street', 'Powell Street']);
// street-tree mixes per zone (Blender species ids, props/trees.js)
export const STREET_TREES_V2 = {   // SF Urban Forest Map top species: London plane, Brisbane box, Victorian box, ficus, ginkgo, flowering cherry / plum
  victorian: [['brisbox', 0.2], ['vbox', 0.18], ['plane2', 0.12], ['ficus', 0.1], ['ginkgo', 0.12], ['cherry', 0.12], ['plum', 0.16]],
  castro: [['cherry', 0.15], ['ficus', 0.15], ['brisbox', 0.2], ['vbox', 0.15], ['ginkgo', 0.15], ['plum', 0.1], ['plane2', 0.1]],
  mission: [['ficus', 0.33], ['ficus2', 0.14], ['brisbox', 0.15], ['vbox', 0.1], ['ginkgo', 0.1], ['cherry', 0.06], ['plane2', 0.12]],
  marina: [['ficus', 0.14], ['brisbox', 0.2], ['vbox', 0.2], ['plane2', 0.14], ['ginkgo', 0.16], ['cherry', 0.08], ['plum', 0.08]],
  nobhill: [['plane', 0.3], ['ficus', 0.2], ['brisbox', 0.25], ['ginkgo', 0.25]],
  northbeach: [['ficus', 0.5], ['ficus2', 0.2], ['ginkgo', 0.12], ['cherry', 0.18]],
  chinatown: [['ficus', 0.6], ['ficus2', 0.4]],
  tenderloin: [['ficus', 0.45], ['ficus2', 0.2], ['plane2', 0.25], ['ginkgo', 0.1]],
  downtown: [['plane', 0.4], ['ficus', 0.3], ['brisbox', 0.15], ['ginkgo', 0.15]],
  downtown_soma: [['plane', 0.45], ['plane2', 0.25], ['ficus', 0.2], ['ginkgo', 0.1]],
  soma: [['plane2', 0.35], ['ficus', 0.25], ['brisbox', 0.25], ['ginkgo', 0.15]],
  avenues: [['plum', 0.2], ['cherry', 0.14], ['vbox', 0.22], ['brisbox', 0.14], ['ficus2', 0.12], ['ginkgo', 0.08], ['plane2', 0.1]],   // Sunset / Richmond: small trees
  hills: [['brisbox', 0.2], ['vbox', 0.2], ['plum', 0.2], ['pine2', 0.2], ['cypress2', 0.2]],
  industrial: [['ficus', 0.45], ['brisbox', 0.4], ['vbox', 0.15]],
  wharf: [['canary2', 0.6], ['fanpalm', 0.4]],
  park: [['cypress2', 0.25], ['pine2', 0.25], ['euc2', 0.2], ['oak2', 0.15], ['redwood2', 0.15]],
};
// probability that a sidewalk slot holds a street tree
export const LINED_V2 = { victorian: 0.55, castro: 0.58, mission: 0.5, marina: 0.5, nobhill: 0.45, northbeach: 0.35, chinatown: 0.22, tenderloin: 0.32,
  downtown: 0.42, downtown_soma: 0.5, soma: 0.38, avenues: 0.3, hills: 0.35, industrial: 0.1, wharf: 0.18, park: 0.4 };
// palm boulevards (real): Dolores St median, the Embarcadero, Mission Bay
export const PALM_STREETS = new Set(['Dolores Street', 'The Embarcadero', "King Street", 'Marina Boulevard']);
