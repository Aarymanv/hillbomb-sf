# Buildings v2 (1:1 OSM city): design + progress

## 2026-10-03 (v6): district frequencies, neighbour paint, back yards + roof decks (aerial "boxy" fix)
- Variety (v2plan / v5mass / v2detail; ?nov6 = A/B, also inside the workers via plan.nov6 + v2lots setNOV6): Sunset /
  Richmond / Marina stucco get box-bay oriels over the garage (Avenues 50 %, Marina 32 %, Bayview 25 %; bayCells STUCCO =
  the picture-window cell, bayForm 'squareS' 0.38-0.7 m, v3 builds the same bay, its tile-pent oriel is skipped there) and
  Mediterranean arched windows (Marina 42 %, Avenues 15 %); inner / central Richmond is now Edwardian-heavy (stucco 50 /
  Edwardian 36 / Victorian 14 %); separately traced houses with no OSM roof shape get the district's hip / gable share
  (houseRoof: Avenues stucco 27 %, Bayview / Excelsior 44 %, Edwardian 32 %, Victorian 12 %); no two neighbours in the same
  paint (repaintNeighbours: a house within 4 % of a neighbour's wall colour, centroids < 13 m, is repainted with the
  farthest palette pick, 6,991 houses); downtown mid-rise (30-55 m) offices / stone blocks get a 1-2 storey setback under the
  crown (35-45 %), commercial / downtown cornice depth + height vary per building; Mission / SoMa side-wall murals cut to
  9-10 % (rainbow rectangles read as glitches from above). Census (whole plan): bay share Avenues 15 -> 59 %, Bayview 37 ->
  53 %, Marina 33 -> 52 %, Victorian zone 88 -> 92 %; pitched Avenues 10 -> 28 %, Bayview 8 -> 32 %.
- Back yards (v6yard.js new, MID geometry, every distance): plan P.yg / P.yd / P.ys = ground behind the house, the yard
  direction (opposite the main front; rear additions carry their lot's yard) and the slope. The worker finds the rear wall
  (non-party, facing the yard) and probes the party raster (margin RM 8 -> 20 m) for the next building: depth = half the gap
  (back-to-back yards meet at the rear fence), 6-18 m. Per yard: wood fences on both lot lines + the rear line (tops follow
  the slope), decks (elevated at the living floor with posts, rails, stair; or low), patios / fully paved yards with planter
  strips, ground cover patchwork (dry lawn / bark / decomposed granite / the terrain lawn), flower borders, raised beds,
  garden sheds. 76-92 % of houses in the residential zones have a yard record; ~65 % emit one (no rear edge on some
  corner lots, < 2.2 m gaps). Roof decks on 7-17 % of flat house roofs (rails, some with a stair penthouse); +1 skylight
  share. props/v2.js: back-garden trees 6 -> 9-15 % per 8 m yard cell by district (?nov6 / ?noyardtrees).
- FAR: pitched roofs without soffits / fascia (lite) -> FAR 2.72 M tris -> 2.52 M despite the extra pitched roofs.
- Cost: MID tile tris +19-38 % over the loaded tiles (Mission spot 3.72 -> 4.44 M; ~35 tris per yard); in view +0.15-0.3 M
  tris, +0-80 calls. FAR 2.72 -> 2.52 M. GPU (headless, RTX 5070 Ti shared with other agents' runs: identical reps spread
  16.5-25 ms, so nothing below ~2 ms resolves): 60 m/s Mission drive GPU p50 over 6 v6 reps median 19.5 ms vs nov6 20.5 /
  noyardtrees 19.0; CPU p50 14-21 ms both. VRAM (?memtrack, same session pairs) 3.01-3.03 -> 3.05-3.08 GB (+30-60 MB).
  Flicker RT (12 s, static cam): street views same event counts as nov6 (mission 83 vs 89, day 102 vs 94); aerial 15 vs 5
  small events (regionMax 3.7 vs 2.4: swaying yard trees); frame parity __altStat at 3 aerials d1 ~= d2, equal to nov6 (no
  shimmer from the thin fences). Regress views reg_*_bld6.jpg match reg_*_after.
- Shots: shots/bld6_<twinpeaks|drone_mission|drone_pacheights|drone_sunset|drone_coit|street_haight|street_richmond>_<before|
  after>.jpg (before = ?nov6, same build), close views bld6_drone_low / low2 / top_after.jpg, bld5_closeup_noon_v6stucco_after.
  Headless harness (no browser pane; hidden panes throttle timers to 1/min and Google tiles never settle):
  node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&nov6][&views=a,b]" dev/bld6_run.js; bld6_perf.js (perf +
  VRAM, add &memtrack), bld6_gpu.js, bld6_reg.js (regress views as reg_*_bld6 + flicker), bld6_stats.js (census).
- GOTCHA: the :5191 watch build can leave the v2worker bundle stale after a facade edit (the worker chunk kept an older
  v2geom); touch v2worker.js and check the newest dist-dev/assets/v2worker-*.js before measuring.
- Next: lawn colour of the terrain yard class (terrainmesh.js) is still a uniform bright green where no cover is drawn;
  rear-edge detection misses some corner lots; yard items have no colliders (walk-in on foot passes through fences).

## 2026-10-01 (v5): massing variety, near sun shadows, cross-fade pop fix
- Massing (v5mass.js new, MID geometry so near and far agree; ?nov5 = A/B, now also inside the build workers via the
  plan's nov5 + v2lots setNOV5 live binding): per-lot front setbacks (v2lots, 22-40 % of lots, 0.35-2.1 m); bay forms
  per building (angled / squared / round 6-facet / shallow, depth 0.45-1.15 m, bayPts shared by MID + v3 bays); street
  corners: round Queen Anne turrets (corbel, window facets, witch's-hat roof, finial) or chamfered corners (cut into the
  polygon, v3 gets the corner edge); mansard attics with dormers; full balconies (iron / solid stucco, stacked on
  mid-century apartments; v3 windows behind them become French doors) + Juliet rails; loft / warehouse / brick
  commercial parapet crests; pitched roofs get 0.3-0.8 m eaves with soffits + fascia / barge boards; MID stoops; stoop
  hoods on brackets (v3); per-lot window type (v2plan winVar, MID kit index + v3 piece agree); 60 % of Tenderloin /
  Nob Hill / Civic apartments get bay stacks. MID tile tris +37 % (76k -> 104k per 512 m tile, measured on the main
  thread); balcony bars are single quads.
- Near shadows (render/environment.js): the 56 m / 2048 cascade is on by default on high / ultra (?nonearshadow), its
  camera only draws layer 7 (v3 walls on 0 + 7, kit3 + clutter on 7 only), min()-combined with the main map, refreshed
  every other frame: pass cost 0-0.46 ms GPU (layer A/B). Kit pieces no longer toggle castShadow at 60 m; v3 walls cast
  while shown (140-190 m lost front-wall shadows before).
- Cross-fade (material.js 3-state hide G / B: 0 off, 128 fading, 255 full; fadeGLSL screen-space dither by camera
  distance, only in fade material variants so the main facade program keeps early-z): v3 walls + kit 175 -> 147 m,
  front-yard clutter 118 -> 98 m, city kit 312 -> 290 m, bld-near detail tiles 438 -> 410 m; MID stand-ins collapse
  once the building's bbox is inside the inner radius. ?nofade = old hard swaps. dev/pop_probe.js is fade-aware
  (userData.fadeBand) and counts building pops separately: 60 m/s mission + sunset + richmond 401 -> 96.
- Perf (headless Chrome, RTX 5070 Ti laptop, perf_drive 60 m/s, 2 alternating reps vs ?nofade&nov5&nonearshadow):
  GPU p50 mission 15.15 vs 14.78, sunset 14.38 vs 14.04 ms (+0.35); CPU p50 no change. VRAM (?memtrack) 2.18 vs
  2.09 GB. Flicker RT probe: same event counts as the A/B baseline (dominated by traffic / camera motion).
- Shots: shots/bld5_<sunset|haight|pacheights|mission|tenderloin>_<noon|night>_<before|after>.jpg, bld5_closeup_vs_ref.jpg
  (house 220025, before = ?nov5&nofade&nonearshadow, ?tiles=0 for both), bld5_feature_turret / _mansard.jpg.
  dev/bld5shots.js (__bld5, __bld5Close, __bld5Air, __bld5Perf).
- Harness notes: off-street teleports get reset to the player's last safe spot (focus far away -> Google photo tiles
  around the camera); the first shot after a long teleport can catch the photo mask unsettled (bld5shots warms up).
- Next: upper-floor setbacks on 4-6 storey apartments, front light courts on big apartment blocks, dormers on hip roofs,
  lit dormer windows at night, Edwardian entry columns, v3 French-door railings from the kit (MID bars now).

## 2026-09-29 (v4): grounding, bounce, street fronts ("clean CG box" fix)
- material.js lighting (all building surfaces, `?nov4` = A/B): hG = height above the local ground (v3 street walls carry
  their ground line in aG: wall length, ground at u = 0 / far end, marker 2; v3front.js). fOcc (indirect only): wall-foot
  contact AO, street-canyon sky visibility (fronts -22 %, side / back / party walls -45 % at the foot, fading by 11 / 8 m),
  soft AO under the roof edge, lot-line edge AO, contact AO around v3 window openings (ring outside the casing, under the
  sill, over the head; grid recomputed from aG.x + P0.w + P9.x). fCont: contact darkening of the sun at the very foot.
  fBounce: warm bounce from the sunlit street (view factor (1 - n.y) / 2, fades up the wall) + the sunlit row across the
  street onto walls in shade (max(-sun.n, 0), gone ~2 storeys up): shaded facades read as lit volumes, not black cards.
  Analytic sun shadows the 4096 map's ~12 cm normal bias erases: under v3 window sills, under the roof-edge tile cap.
  Kit material (patchKitMaterial): baked AO now also darkens 55 % of the sun, same bounce model.
- Weathering: moss / algae film at the foot of north-facing (-z) walls, rust run-off from floor lines (decor bit 4: lofts,
  warehouses, fire-escape brick), peeling paint on some Victorian / Edwardian siding (bit 2), vivid paint kept on ~50 % of
  Avenues / Marina stucco and ~35 % of Victorians (bit 8; the render-agent palette mute otherwise greys them).
- Murals (bit 1: Mission 22 %, SoMa / industrial 16 %): original generated art (landscape with sun + rays + hills + flower
  band, giant stylised flowers, stepped geometric bands) on exposed side / back walls (v2 BACK / SIDEX), windows suppressed,
  kept in the far anti-moire path.
- Params: P9.w (was spare) = v2 code: 1 | 2 * decor | 32 * (MID kit window + 1) | 512 * (kit door + 1). FIX: the shader
  read v1's P9.xy as kit-unit overrides, but v2 stores (bay width, floors) there: every MID house used unit int(bay) (an
  Italianate / brick window) and a WINDOW unit as its front door (floors = 1 -> unit 0). MID (190-450 m) now picks the
  style's window (vic / edw / stucco / brick / loft / modern / arched) and the vic / edw door, matching v3: smaller pop.
- Facade kit v4 (kit_facade3.py, GRID 7, 41 pieces, ~8 min OptiX): AO baked against occluder walls (with the opening cut
  out) and ground planes (AO distance 0.5): casings / sills / tiles / pots / bins now carry contact AO. New pieces: agave,
  succulents (gravel bed + echeveria + aloe), shrub, shrub_flower (hydrangea), flowerbed (tileable), bougainvillea (wall
  climber), pot_tall (olive standard), fence_iron, fence_pick (tint A), bike / scooter (tint B frame), bins3 (real SF carts),
  num_a / b / c (5x7-pixel brass / black house numbers). M_flora: per-leaf colour + flower-cell speckle baked into albedo;
  foliage hi copies are subdivided + voronoi-displaced so the normal bake carries leafy relief. Hedge = lumpy tileable sweep.
- v3front.js: frontYard() per lot (setback sb from P.swd): dry gardens, mixed borders, hedges, planters, specimen shrubs on
  deep lawns, iron / picket fences on the sidewalk line with a lot-line return, bougainvillea where there is no setback,
  potted standards by the door, bikes, shared scooters, house numbers beside the entry / over the garage, real bin carts.
  Concrete driveways with tyre-track / oil-stain vertex AO; sun-bleached garage doors (40 %); per-lot variants: stone /
  brick veneer wainscots (Sunset 30 %), wood panel round the picture window, Streamline-Moderne speed lines.
  Clutter goes to a separate per-cell KitBuf (KitCells.at3d -> geo3d -> 'bld-kit3d' meshes, v2city DET_R 125 m).
- props/v2.js: street-tree wells (soil / mulch / weeds, cast-iron grates on commercial / downtown streets) under generated
  sidewalk trees and OSM trees by the kerb (aligned to the nearest road); wood utility poles + lines now also on residential
  streets of the Mission (75 %), Castro / Noe (65 %), Victorian districts (50 %), industrial SE (55 %), North Beach (30 %);
  service drops from each pole to house fronts on both sides (building-mask tested).
- Night (after the sky / lamp-map agent): walls + kit pieces are lit from render/lampmap.js (hbLampWall, inserted after
  fog_pars_fragment; HB_NO_LAMPMAP skips fog.js' generic term so nothing doubles): the pool sampled 3 m out along the wall
  normal x ~0.5 (vertical receiver), faded above the lamp heads, + the lit roadway's bounce (8 m sample) on the lower walls
  + a dim warm city-glow floor. The 12-nearest-lamp uniforms are only the fallback while the map is off. NIGHT_IND 0.55 ->
  0.25, NIGHT_DIR 0.6 -> 0.3 (the new night sky is already dark). Window spill: a lit room (same coin flip as its glass)
  washes the wall around its window (v3 walls + MID). Lamp spacing (props/v2.js): trolley streets a cobra head on every
  span pole, 32 m (was every other pole: ~1 per 86 m per side on Divisadero); arterials / commercial 30-34 m, staggered.
  Flicker probe (__gser 60 frames, static cam): Noe max jump 0.07, Mission 0.2, no spikes.
- Perf A/B (same session, fresh load, same order; GPU median ms / tris / calls, v4 vs ?nov4): sunset 12.9 / 8.95 M / 553
  vs 11.55 / 8.30 M / 535; noe 9.68 / 7.85 M / 447 vs 10.45 / 7.51 M / 462; mission 10.85 / 8.47 M / 524 vs 11.6 / 8.16 M
  / 484. GPU within noise (mean -0.06 ms); +0.3-0.65 M tris (yards + wells + wires), +18-40 calls.
- Shots: shots/bld4_closeup_vs_ref.jpg (REF / noon before / noon after / night after; house 51194, south-facing Sunset
  stucco: the bld3 one faces east under a street tree, no midday sun), bld4_<place>_<noon|night>_<before|after>.jpg,
  bld4_sheet_noon/night.jpg. NOTE: "before" predates the concurrent sky / tone-map rework (after = darker ambient); the
  clean A/B for this pass is ?nov4 in one session. dev/bld4shots.js (__bld4, __bld4Close, __bld4Perf), dev/quad.py, sheet.py.
- Next: dithered v3 <-> MID cross-fade (the 190 m pop; kit meshes have no building id), front-yard trees from the vegetation
  species at small scale, murals on blank secondary street walls, alpha-cut leaf cards for the kit foliage.

## 2026-09-29 (v3): real-geometry street facades ("buildings look square" fix)
- v3front.js (new, workers): every street wall of a non-tower building (v3Eligible: not tower / office / Chinatown /
  canopy, <= 40 m) within V3_R 190 m gets real geometry instead of the MID procedural quad: the wall with openings
  (wall layer texture + FLAG.FRONT grime coords), reveals with vertex AO, interior-mapped glass, real 3-facet bays
  (same cells as MID), SF house typology (garage + apron at street level, entry vestibule with a stair up to the living
  floor, Sunset arched porch + tile hood, Victorian pediment), storefront bays (sign band left on the wall plane for
  v2dress), lobbies, industrial roll-ups + docks, apartment entries, Sunset oriels with tile pent roofs, stucco cap
  mouldings / corner beads, corner boards + belt courses, plinths, downspouts, meters, mailboxes, coach lamps (M.LIGHT
  glow), pots / planters / hedges, SF three-bin sets, window ACs.
- Facade kit v3 (tools/blender/kit_facade3.py -> public/assets/kit/fac3_kit.glb + fac3_alb/nrm/orm.jpg 3072, 27 pieces,
  ~5 min OptiX bake): window units per style (vic / edw / bay / stucco steel casement / modern slider / loft steel /
  brick with lintel / arched), doors (panelled, mid-century), garage doors (sectional, carriage, roll-up), industrial
  roll-up + dock bumpers, tile cap / tile pent runs, railing (sheared along stairs) + newel, lamp, mailbox, meters,
  downspout, planter, pot, hedge, gate. KitBuf.fit = 9-slice in geometry (margins keep size, middle stretches, parts
  inside the reveal follow the recess); tint mask in a 2nd UV set (trim / accent tints).
- Swap: MID parts carry V3LOD (aK 32768), v3 geometry KITHI (16384); hide texture B = "v3 cell shown" (bit 8 in why).
  v3 facade geometry + kit3 pieces are per 128 m cell meshes in a sub-group (bld-kitroot) shown within V3_R (culled,
  not collapsed). Found + fixed: googletiles.js resets .visible of every direct child of the building root, which had
  silently disabled the old kit-cell distance culling (all kit cells drew out to ~700 m).
- Plan: P.eg (ground 1.2 m out per front vertex) -> fronts stride 11 (ga, gb) for stoops / garages on slopes; PC 26
  (winType, recess, itype, lit); ?nov3 = A/B switch. MID: sawtooth roofs on big WAREHOUSE sheds (glazed north lights).
- material.js: street-lamp lighting of walls at night (the 12 nearest props lamps, uniforms updated per frame from
  __world.props.lamps, weights fade to 0 at the set edge: no pops), walls lose 55 % of sky indirect and 60 % of the
  moon at night (facade + kit materials), weathering on all wall LODs (blotches, rain streaks, sun fade, splash band),
  1.7x wall relief on street walls (0.6x concrete), sheer curtains in ~45 % of home windows, ghost signs in the frieze
  of some lofts / warehouses.
- Perf (GPU medians, box heavily shared, +-5 ms noise this session): sunset 4.6-5.6 v3 vs 5.1-8.7 nov3; in-view tris
  mission 5.09 M vs 8.33 M, sunset 4.66 vs 4.65, fidi 10.63 vs 10.16; calls mission 675 vs 772, fidi 883 vs 806.
- Shots: shots/bld3_<place>_<gold|night>_<before|after>.jpg, bld3_sheet_gold/night.jpg, bld3_closeup_vs_ref.jpg.
  NOTE the gold-hour "after" shots are dominated by the concurrent environment / sky rework (darker golden hour);
  bld3_closeup_before (?nov3) vs _after is the clean A/B.
- Next: murals on blank party walls, side-passage gates / fences, ghost-sign placement on blank side walls, a LOD-1
  kit (fewer tris beyond 80 m), MID bays with real depth for stucco oriels.

## 2026-09-29 (later): rowhouse individuation + roofs from above + far anti-box
- v2lots.js (new, called first in planCity): residential footprints (kind generic/house/apts <= 12 m, h 4.5-14 m, no OSM
  colour, zones Victorian/Castro/Mission/Marina/Avenues/NB/Nob/Bayview/Industrial) whose street front (road-raster probe)
  runs >= 12.5 m along an OBB axis are cut into 25 ft lots (jittered; some 33 / 50 ft) -> 21k rows, 63k lots, 71.5k
  pieces, ~0.45 s. Back-to-back rows (fronts on both sides, depth >= 22) are cut in two first. Per lot: own ground (the
  row steps with the street), top = street ground + row height +-1 storey (tract rows in Avenues / Marina stay even),
  rear addition (separate piece 1-2 storeys lower, 60 % of deep lots; copies its front lot's paint via copyLook),
  paired light wells notched into the lot lines (50 %). Pieces are appended after the N0 OSM buildings in extended
  footprint arrays (P.bx); parents stay valid ids (hideBuilding / find / buildingAt / colliders use parents; hiding a
  parent hides its pieces through setWhy); tiers iterate tiles with eachIn() (v2plan.js). ?nolots = A/B switch.
- Lot pieces get style first, then lotRoof(): Victorian 28 % front gable, Edwardian 30 % hip / 10 % gable, stucco
  14 % hip / 8 % gable, else flat. Flag 64 = false front (Italianate / stucco parapet front: street wall rises 0.9-2.1 m
  above the side parapets, v2detail falseFront(); gable() skips it). Palettes: whites / greys (18 % Victorians, 30 %
  Avenues stucco), bold Mission paints; brick cut to ~15 % for apartments / corner stores in residential zones.
- Roofs: membrane / tar / gravel / silver-coat / tan mix; SURF shader mottles flat gravel roofs per building (re-roofed
  patches, fades out sub-pixel); solar() arrays on 7-22 % of flat low-rise roofs (MID).
- material.js PROC far path: exact box-filtered window grid (pulseAA / bandF: columns x rows, ground-floor glass /
  garage band, cornice cap) replaces the flat average when a cell is < ~16 px; night windows / curtain walls glow at
  the expected lit share (no per-cell sparkle); porch lamps fade with it. Distance grade 380-1300 m toward the Google
  photogrammetry (x0.8, 66 % saturation, street-level occlusion on walls): Twin Peaks aerial lum 132 vs photo 124.
- FAR skips lot-line walls hidden by a sibling at least as tall (sibCovers); MID drops fully covered sibling party walls.
- Night far: per-cell lit coin flips kept while a cell covers >= ~3 px, expected share once sub-pixel (x1.5 homes);
  far office towers read as pale glowing blocks (sub-pixel average + night IBL): office share 0.2, far walls x0.5 at night,
  far glass F0 dimmed at night.
- Perf (GPU timer query medians; this box is shared, +-1-2 ms noise): tiles=0 tpeaks 8.7 vs 8.4 ms, mission 10.9 vs 10.3;
  tiles on: mission 12.4 vs 10.2 (repeatable-ish), tpeaks 10.8 vs 11.2, sunset 9.0 vs 8.9, fidi 12.6 vs 13.1 (lots vs
  ?nolots). In-view building tris at Mission +8 % (0.70 vs 0.65 M); FAR 1.97 -> 2.38 M tris. Watch Mission.
- Pre-existing, not mine: water shader compile error 'hbRipple' (no matching overload) seen in the console 03:3x. Chinatown night "flicker": whole-screen jumps persist with buildings / lamp glow / lamp
  lights / traffic hidden and vanish with a static camera: motion content (crosswalk stripes, camera), not a shader.
- Dev helpers moved to dev/ (cityshots.js, gpu.js, flicker_probe.js); public/assets/kit/_dev removed (it shipped).

## 2026-09-29: district night dress + anti-box pass
- v2plan.js: commercial-corridor raster from data.roads (DIST ids: Union Sq, FiDi, Polk, Mission/Valencia/24th, Castro,
  Haight, North Beach, Tenderloin, Clement, Irving, Chestnut, Union St, Fillmore, Divisadero); a building whose street
  front faces a corridor gets a STORE ground floor (P.corr, P.swd = street distance). Flat roof colours vary.
- v2dressgeo.js (workers, per 512 m tile, provider 'bld-dress' 900 m) + v2dress.js (main: 2048 canvas atlas, materials):
  per-district fictional sign sets (box-lit / neon / painted), neon blades (dense TL / Broadway / Mission / Castro / Polk),
  window neons, canvas awnings with lit undersides + spill sheets, sidewalk light pools (terrain height on the main thread),
  gooseneck lamps; Chinatown keeps its bilingual signs, lanterns, pagodas (+ awnings moved here from nearWall).
  No coplanar decal pairs (sign / blade faces are the plate faces); small items collapse > 330 m; glow fades 300-460 m.
  Festoons: lanterns2.js got bulb-only options; v2city builds them over 24th, Mission, Valencia, Castro, Haight, Polk, NB.
- v2detail.js: MID silhouette detail (cornices, storefront cornice + belt courses, full-height bays moved from NEAR,
  coped parapet rims with the roof lowered, Victorian front gables, tower chamfers / setbacks / crowns, rooftop clutter
  plan) + NEAR Blender kit (tools/blender/kit_city.py -> public/assets/kit/city_kit.glb + baked alb / nrm / orm atlas):
  cornice runs + scroll brackets, fire escapes, water tanks, HVAC, bulkheads, chimneys, vents, antennas, dishes,
  skylights. Kit merged per 128 m cell (KitCells), shown within KIT_R 320 m; MID stand-ins carry aK flag KITLOD and are
  collapsed via hide texture G (now RGBA) while their cell shows. NEAR_R 450 (was 260).
- material.js: HIDE reads R (FAR) / G (KITLOD); house entry lamps + wall wash; warm / cool variation of lit rooms.
- Dev: public/assets/kit/_dev/cityshots.js (__cityShots, __perfAt, __flickAt, __quick), before.html (old bundle).

## Status 2026-09-28 night: IMPLEMENTED (registerBuildingsV2 exported from buildings.js)
- Files: v2plan.js (zones by real lat/lon, style, OBB, street-wall probe, y0, params + compact copy), v2geom.js (DP, walls,
  roofs, rooftop clutter, party raster, near details), v2build.js (pure tile builders + transfer helpers), v2worker.js
  (3 build workers), v2city.js (FAR chunks, providers bld-mid 1400 / bld-near 260 / bld-col 600, hide/show, find).
- No material.js change was needed: MID/NEAR use aId = i + NEAR_OFF (never hidden), FAR uses i and is hidden per building
  while its MID tile is shown; landmark hide = FAR hide + MID/NEAR rebuild without it + colliders removed.
- Differences from the design below: per-wall ground line not used (y0 = highest street-front ground, capped +3.5 m; walls
  extend to the lowest front ground - 1.2); NEAR is an own detail emitter (not near.js front()).
- Load: plan ~1.0 s main thread, FAR ~2 s in workers (~1.9 M tris, 60 chunks); tiles near spawn built sync in the fill.

## Status (checkpoint, earlier)
- v1 (`?map=v1`, lot-based) is complete and untouched: `src/world/buildings.js` + `facade/*.js` (see the v1 report). `npx vite build` passes.
- v2: analysis done, design below, NOT implemented yet. `registerBuildingsV2` is not exported yet.
- `dev/buildings2.html` + `dev/buildings2.js`: preview page (loads map data, Terrain2, a TileStreamer, a simple 8 m terrain
  provider, the game's environment/post, dev hooks `__look/__frames/__shot/__drawStats`). It imports `registerBuildingsV2`
  from `src/world/buildings.js`, so it fails until that exists. `<base href="/">` is there because mapdata.js fetches the
  relative path `assets/map/`.

## Data facts (measured)
- 178,202 footprints, 1.80 M vertices (avg 10.1/footprint; many short edges: OSM traces bay notches and light wells).
- Edges in the Alamo tile: 14% < 1 m, 28% 1-2.5 m. Exact shared (party) edges only ~13% (+4% partial): OSM rows often have
  small gaps, so detect party walls with an outward point probe (see below), not edge matching.
- h: mostly 5-12 m; 144k heights known; levels known only 3.7k. kind: 164k generic, 6.6k house, 5.1k apartments, 678 commercial.
- roofs: 171k flat, 6.7k gabled, the rest rare. 593 non-empty 512 m tiles (median 288, max 1435 buildings).
- Test spots (x, z; tile): FiDi (1461, -2245; 22,11; 453 bldg), Mission 24th St (88, 2488; 20,20; 551), Sunset Judah/30th
  (-6150, 1504; 7,18; 557), Pac Heights (-1654, -1946; 16,12; 409), Twin Peaks (-2490, 2267; 15,20), Alamo Sq park (-1337, -155).
- Baked interior atlases are final (`public/assets/baked/`): rooms 4x4 (types in rooms.json: living 0-4, bedroom 5-7, kitchen
  8-9, office 10-12, dining 13, empty 14, blinds 15), shops 2x4 (pizzeria, diner, bodega, laundromat, cafe, bookstore,
  taqueria, dimsum). material.js already consumes them (`bakedAtlases()`, `bakedRoom()`), with procedural fallback.

## Design
Three LOD tiers sharing one facade material (material.js, extended) and one per-building params texture.

1. Global pass at registration (target < 1 s): for every footprint, one tight loop:
   ring -> area/centroid; zone from lat/lon boxes (fidi, eastcut, soma, missionbay, chinatown, northbeach, wharf, russianhill,
   nobhill, tenderloin, civic, pacheights, marina, presidio, haight/alamo/westernaddition, castro/noe, mission, potrero, dogpatch,
   bayview, richmond inner/outer, sunset, westoftwinpeaks, excelsior/bernal); style from zone + h + levels + kind + area
   (tower >= 45 m, midrise 16-45, houses by zone mix: Victorian/Edwardian in Haight/Alamo/Pac Heights/Castro/Noe/Mission/Potrero,
   stucco in Sunset/outer Richmond/Excelsior/Marina, lofts/warehouses in SoMa/Dogpatch, Presidio = brick military);
   front walls = walls whose outward probe hits asphalt (terrain.surfaceRaw == 1) within 3-20 m; y0 = max terrain along
   the front; params packed into a Float32 RGBA texture (9 texels/building, ~25.6 MB; half-float if memory matters).
   Full JS spec objects are recomputed lazily (deterministic seed) only for near/mid buildings.
2. FAR (whole city, always loaded, built during the loading fill): merged per 2x2 km chunk (~40 visible calls from Twin Peaks).
   Douglas-Peucker 1.2 m footprints (oriented rect for small low houses), flat roofs via Earcut, tiny sheds dropped;
   budget <= 2 M tris. Procedural facade shader with anti-moire averaging + lit windows at night; beacons on towers.
3. MID (<= 1.4 km, per 512 m tile, incremental job with a ms budget): real footprint walls with a per-wall window grid
   (cw/nb per wall; walls < 2.5 m blank), per-wall ground line in aG (gA, gB, 1, 0), party/near-neighbour walls from an
   outward point-in-polygon probe (0.8 m) against a global 32 m building grid (blank; skip below the neighbour's height),
   roof shapes (gabled/hipped/pyramidal/skillion on the OBB, dome for dome/onion/round), OSM colours when present.
4. NEAR (<= ~200 m, 128 m cells, incremental ~4 ms/frame): for each street-facing wall >= 3 m, run the v1 facade builder
   `front()` from near.js with a per-wall sub-spec (Object.create(buildingSpec) with W, nb, cw, gA/gB, groundType, wallFrame);
   patch `frames()` in far.js to honour `sp.wallFrame` for which === 0. Short OSM bay facets (1.2-3 m) get single
   windowUnit()s. Other walls + roof reuse the MID emitter. Turrets/side facades/murals off in v2 (OSM traces real turrets).
- LOD swap: aId offsets FAR = id, MID = id + 2^21, NEAR = id + 2^22. The hide texture becomes RGBA8: R hides FAR, G hides MID,
  B = landmark-hidden (all LODs, set by `hideBuilding(index)`). The vertex/depth shaders pick the channel from the offset.
  v1 stays compatible (RedFormat -> G/B read 0).
- Colliders: provider 'bld-col' (range ~600 m): min-area OBB per footprint (rotating edges); if fill < 0.7, split the
  polygon along the OBB long axis and fit two boxes. Removed on unload. Skipped for hidden (landmark) buildings.
- API (buildings.js): `registerBuildingsV2(stream, { data, terrain, scene, night, renderer? }) -> { group, hideBuilding(i),
  showBuilding(i), stats, update }` registering providers 'bld-far' (range = whole city), 'bld-mid' (1400), 'bld-near'
  (220, own incremental queue), 'bld-col' (600). Texture generation (texgen.js) needs the renderer: grab it via onBeforeRender
  as in v1, or accept `renderer` in opts.

## Next steps (in order)
1. cityplan.js: zones + style + global pass + params texture; export registerBuildingsV2 with FAR only; test in dev/buildings2.
2. material.js: RGBA hide channels + MID/NEAR offsets + vG ground line for PROC walls (keep v1 behaviour).
3. MID emitter + party probe + roofs; LOD swap via hide G channel.
4. NEAR via front() + wallFrame; colliders provider; hideBuilding.
5. Perf at FiDi, Mission, Sunset, Pac Heights, Twin Peaks view (calls/tris/ms), streaming at 60 m/s, `npx vite build`, shots.
