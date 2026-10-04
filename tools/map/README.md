# 1:1 San Francisco map bake (v2)

Real-data map: OpenStreetMap (BBBike SanFrancisco extract, ODbL, credit "(c) OpenStreetMap contributors") + AWS Terrain Tiles
(Terrarium z14, USGS 3DEP public domain + NOAA/GEBCO bathymetry). Scale 1:1, projection in `common.py` (must match
`src/world/latlon.js` setProjection for v2: lat0 37.7749, lon0 -122.4194, accurate KX/KZ per degree).

## Run (all CPU, ~6 min total)
1. `python fetch_dem.py` (90 tiles, 7.7 MB) ; OSM: `curl` BBBike `SanFrancisco.osm.gz` (76 MB) into `raw/`, then `python convert_osm.py`
   (Overpass was down on 2026-09-28; `fetch_osm.py` is the Overpass alternative)
2. `python stage_dem.py` -> cache/dem.npy (4 m grid 4097 x 4225, origin -10240, -8192)
3. `python stage_roads.py` -> cache/roads.pkl (22,373 nodes, 30,292 edges, 2,347 km; bridges/tunnels solved). Grades: flat
   intersection tables only at real junctions (not way splits, dead ends, alleys / "Place" lanes, or a lower-class T onto the
   street), junctions < 10 m apart share one height, and every table edge gets a vertical curve (`vertical_curves`: 8-16 m
   by grade, box-filtered parabola) instead of a sharp lip. Crest takeoff (4 m chords) Hyde >= 45-57 mph, 22nd / Filbert
   ~48-54 mph; city edges with takeoff < 15 m/s: 313 -> ~50. Cycle flags: lane (64), track (128, painted green), sharrow (256).
4. `python stage_land.py` -> coastline land/water, surfaces, lakes, piers, roads carved into the heightfield (~3 min)
5. `python stage_buildings.py` -> 178,202 footprints (143k real heights), 512 m tiles
6. `python stage_export.py` -> public/assets/map/ (rails: cable = 1067 mm gauge trams; 21 MB: height.bin.gz 7.1, buildings.bin.gz 7.6, roads.json.gz 2.3, map_base.png 2.9, surf, extras, meta.json)

## Status 2026-09-28 (paused: laptop battery)
Data is baked and verified in preview PNGs (`pv_full.png`, `preview_roads_small.png`). NOT yet in the game.
Next: runtime in `src/world/v2/`:
* `mapdata.js` loader (DecompressionStream gzip; height decode a = r + left + up - upleft, Int16 cm)
* `terrain2.js` Terrain-compatible API (heightAt bilinear, groundAt with decks + tunnels (deck below terrain when probeY < th - 1),
  curbAt = sidewalk test from the edge hash, surfaceAt)
* `graph2.js` same edge/node shape as `roads.js` (kind: highway/arterial/street/alley/bridge/crooked/park/mountain; lanes per
  direction, laneW, median, oneway, signal/stop from ctrl bits); replace `findRoute` with a binary-heap A* (22k nodes)
* streaming tiles (512 m): terrain LOD, road ribbons + intersections + markings, sidewalks, buildings (resume the facades agent
  to accept footprints), props per tile (resume props agent), colliders per tile; far skyline LOD for the whole city
* then migrate landmarks (real positions + real heights), cable cars (rails in extras, kind 'cable'), races/police/interiors, `?map=v2`
Also pending: rename modes "Forza"/"GTA" (trademarks) e.g. "Festival"/"Outlaw"; wire settings.assists + camera settings into
physics/camera; Blender final atlases `tools/.venv-blender/Scripts/python tools/blender/bake_all.py --samples 192` (GPU, on power).

## Status 2026-09-28 evening: v2 BOOTS (`?map=v2`)
Runtime in src/world/v2/: mapdata (loader), terrain2 (Terrain API), graph2 (road graph, same shape as roads.js; heap A* in
roads.js), stream (512 m tile streamer + provider contract), terrainmesh (3 LODs + 2 km far chunks), roadmesh (junction
polygons, sidewalks + curbs + corners, markings, crosswalks/stop lines, cable-car/streetcar rails, viaduct slabs/barrier
colliders/piers, tunnel tubes; aRoad/aLanes attributes for a future road shader), world2 (assembly, water, districts2, spawn by
named intersection: Hyde & Lombard). Boots in ~10 s, heap ~620 MB (v1: 970). Buildings = placeholder extruder until
buildings.js exports registerBuildingsV2 (facades agent paused: src/world/facade/PROGRESS_V2.md). Landmarks paused
(src/world/landmarks/PROGRESS_V2.md, src/world/v2/anchors2.js).
TODO next session:
* bake fixes: Golden Gate deck profile (use anchors2 ggDeckY; edges 30282/30283 -> bridge; un-carve Marin approach),
  Bay Bridge upper/lower decks stacked 9.5 m (edges 4751 / 22914); extras.named misses big names (match by position)
* resume: facades (registerBuildingsV2), landmarks, props agent (v2 per-tile props + tree realism), render agent (road shader
  using aRoad/aLanes + terrain paved layer), festival (untested events), UI (v2 map/minimap from map_base.png)
* traffic/peds/police/interiors/cable cars on v2; title camera shots for v2; make v2 default
* physics: tuning params from tuning.js not read yet (brake balance, ARB split, camber, toe, pressure, diff, aero)
