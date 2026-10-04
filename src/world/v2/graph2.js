// Road graph for the 1:1 real-data map, in the same node/edge shape as world/roads.js (traffic, drivers, GPS, police,
// events, props all consume it unchanged). Bridges, viaducts and tunnels become terrain decks.
import { makeNearestEdge } from '../roads.js';

// OSM class index -> legacy "kind" the rest of the game understands
const CLS = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'busway', 'road', 'service',
  'pedestrian', 'track', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
const KIND = { motorway: 'highway', trunk: 'highway', motorway_link: 'highway', trunk_link: 'highway', primary: 'arterial', secondary: 'arterial',
  primary_link: 'arterial', secondary_link: 'arterial', tertiary: 'street', tertiary_link: 'street', unclassified: 'street', residential: 'street',
  living_street: 'street', road: 'street', busway: 'plaza', pedestrian: 'plaza', service: 'alley', track: 'mountain' };
const F = { bridge: 1, tunnel: 2, unpaved: 4, traffic: 8, restricted: 16, main: 32, cycle: 64, cycleTrack: 128, sharrow: 256 };

export function buildGraph2(data, terrain) {
  const R = data.roads, NP = R.nodes, P = R.pts;
  const nodes = [];
  for (let i = 0; i < NP.length / 3; i++) nodes.push({ id: i, x: NP[i * 3], z: NP[i * 3 + 1], y: NP[i * 3 + 2], edges: [], ctrl: R.ctrl[i] || 0 });
  const edges = [];
  for (const E of R.edges) {
    const [a, b, name, cls, lanesTot, oneway, width, sidewalk, parkSides, flags, p0, np, layer] = E;
    const pts = [], ys = [];
    for (let k = 0; k < np; k++) { const o = (p0 + k) * 3; pts.push([P[o], P[o + 1]]); ys.push(P[o + 2]); }
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const len = cum[cum.length - 1];
    if (len < 0.5) continue;
    const clsName = CLS[cls];
    let kind = KIND[clsName] || 'street';
    const nm = R.names[name] || '';
    // the crooked blocks (Lombard between Hyde and Leavenworth, Vermont at 20th-22nd): very sinuous residential edges
    const chord = Math.hypot(pts[np - 1][0] - pts[0][0], pts[np - 1][1] - pts[0][1]);
    // (the real crooked blocks are only ~1.4-1.5x their chord in the bake: named, with a looser ratio)
    const wig = len / Math.max(1, chord);
    if ((clsName === 'residential' || clsName === 'unclassified' || clsName === 'tertiary') && len > 60
      && (wig > 1.55 || (nm === 'Lombard Street' && wig > 1.25) || (nm === 'Vermont Street' && wig > 1.4))) kind = 'crooked';
    const lanes = oneway ? Math.max(1, lanesTot) : Math.max(1, Math.floor(lanesTot / 2));
    const parkW = parkSides ? 2.3 : 0;
    const median = oneway ? 0 : 0.15;
    const laneW = kind === 'crooked' ? width / 2 : Math.max(2.6, Math.min(3.9, oneway ? (width - parkSides * parkW) / lanes : (width / 2 - median - parkW) / lanes));
    const e = {
      id: edges.length, a: nodes[a], b: nodes[b], pts, ys, cum, len, width, name: nm, kind, cls: clsName, deck: null,
      lanes, laneW, median, oneway: oneway ? 1 : 0, sidewalk, parkSides, parkW, flags, layer,
      bridge: !!(flags & F.bridge), tunnel: !!(flags & F.tunnel), unpaved: !!(flags & F.unpaved), traffic: !!(flags & F.traffic),
      restricted: !!(flags & F.restricted), main: !!(flags & F.main), cycle: !!(flags & F.cycle), cycleTrack: !!(flags & F.cycleTrack), sharrow: !!(flags & F.sharrow),
    };
    if (e.bridge || e.tunnel) {
      const water = pts.some(([x, z]) => terrain.surfaceRaw(x, z) === 0 && terrain.heightAt(x, z) < -1);
      const dkind = /Golden Gate Bridge/i.test(nm) ? 'goldengate' : (e.bridge && water && /I 80|Bay Bridge|James Lick|Skyway/i.test(nm + ' ' + (R.refs?.[name] || ''))) ? 'baybridge'
        : e.tunnel ? 'tunnel' : 'viaduct';
      e.kind = e.tunnel ? kind : 'bridge';
      // Golden Gate: the two OSM carriageways (12.3 m each, 10 m apart) are wider than the real 18.9 m roadway, which put
      // the outer lane and its barrier inside the tower legs (10.1 m off the axis): narrow them to the real lanes
      if (dkind === 'goldengate' && width > 9.6) { e.width = 9.6; e.laneW = Math.max(2.6, 9.6 / lanes); }
      // (single-lane ramp decks get a shoulder: slab + barriers >= 3.2 m off the centreline, not a 4.2 m slot between rails)
      e.deck = terrain.addDeck({ pts: pts.map((p, k) => [p[0], p[1], ys[k]]), width: e.width, sidewalk: e.tunnel ? 0 : Math.max(e.bridge ? Math.min(sidewalk, 2) : 0, (dkind === 'goldengate' || dkind === 'baybridge') ? 0 : 3.2 - e.width / 2), kind: dkind, tunnel: e.tunnel, edge: e, water });
    }
    edges.push(e); e.a.edges.push(e); e.b.edges.push(e);
  }
  for (const n of nodes) {
    n.deg = n.edges.length;
    n.radius = n.deg ? Math.max(...n.edges.map(e => e.width / 2)) + 1.5 : 3;
    const onDeck = n.edges.some(e => e.deck);
    n.signal = n.deg >= 3 && !!(n.ctrl & 1) && !onDeck;
    // SF: unsignalised street junctions are almost all all-way stops; highways/ramps merge without stopping
    n.stop = n.deg >= 3 && !n.signal && !onDeck && !n.edges.every(e => e.kind === 'highway');
  }
  const liveNodes = nodes.filter(n => n.deg > 0);
  liveNodes.forEach((n, i) => { n.id = i; });
  edges.forEach((e, i) => { e.id = i; });
  const graph = { nodes: liveNodes, edges, polys: [] };
  graph.nearestEdge = makeNearestEdge(graph);
  // nearest node (junction snapping, curb mouths)
  const NC = 64, nh = new Map();
  for (const n of liveNodes) { const k = Math.floor(n.x / NC) * 100003 + Math.floor(n.z / NC); let a = nh.get(k); if (!a) nh.set(k, a = []); a.push(n); }
  graph.nearestNode = (x, z, maxDist = 60, filter = null) => {
    let best = null, bd = maxDist * maxDist;
    const r = Math.ceil(maxDist / NC), cx = Math.floor(x / NC), cz = Math.floor(z / NC);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const arr = nh.get((cx + a) * 100003 + (cz + b)); if (!arr) continue;
      for (const n of arr) { if (filter && !filter(n)) continue; const dx = n.x - x, dz = n.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  };
  // street name lookup for the named intersection API used by content: graph.intersection('Hyde Street', 'Lombard Street')
  graph.intersection = (a, b) => {
    const A = a.toLowerCase(), B = b.toLowerCase();
    return liveNodes.find(n => n.edges.some(e => e.name.toLowerCase().startsWith(A)) && n.edges.some(e => e.name.toLowerCase().startsWith(B))) || null;
  };
  return graph;
}
