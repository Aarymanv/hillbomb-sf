# Landmarks v2 (1:1 real map): status 2026-09-28 evening

Entry: `registerLandmarksV2` (exported by `src/world/landmarks.js`, code in `landmarks/v2/lm2.js`), called by world2.js.
Data: `src/world/v2/anchors2.js` (`GG2`, `BAY2`, `SITES2` = world position / yaw / dims / OSM hides / hero flag per site).

## Built
* `v2/gg2.js` Golden Gate: towers 227 m (5 set-back leg sections, Art Deco fins, 4 portal struts + corbels, under-deck
  X-bracing, floodlit at night), fender 88x48, cables 0.92 m at +-13.7 m, suspender pairs every 15.24 m, 7.6 m Warren
  stiffening truss, sidewalks + alpha-tested railings, 30.5 m lamp standards, end pylons + anchorages, Fort Point arch
  (98 m), approach viaducts + steel bents that follow the baked deck polylines. Deck heights sampled from the road graph.
* `v2/bay2.js` Bay Bridge west span: W2 649, W3 1372, W5 2128, W6 2831 (piers from the surface raster), W1/W4/W7
  anchorages, 158 m towers with X-bracing, two cable systems, double-deck truss (lower-deck ceiling lights), animated
  Bay Lights (LED shader on the suspenders), YBI tunnel portal. Upper/lower deck profiles sampled from the graph.
* v1 builders reused at real size via the new `A` (anchor override) option: Transamerica, Salesforce, Coit, Ferry
  Building, City Hall (S 1.35), Palace of Fine Arts (S 1.4, `noLagoon`), Grace (S 1.35), Painted Ladies, Sutro Tower,
  Oracle Park (S 1.43), Cliff House, Wharf sign.
* `v2/extra2.js` new: Embarcadero Center night outlines, Pier 39 gate, Conservatory of Flowers, de Young Hamon tower,
  Legion of Honor, Mission Dolores (mission + basilica), Castro Theatre blade sign, Dragon Gate, Union Square Dewey
  column + palms, Alcatraz lighthouse + water tower.
* `v2/mats2.js`: triplanar weathering (tone, grit, rain streaks, roughness) on the shared kit materials (v2 only).
* Heroes always loaded (detail chunks hidden beyond 1.4 km); the rest streams (provider `landmarks2`, 2.2 km).
  OSM footprints are hidden through `buildings.hideBuilding` (171 incl. bridge towers/pylons); fallback for the
  placeholder extruder collapses vertices.

## Bake (tools/map/stage_roads.py `hero_bridges`)
GG deck = anchors2 `ggDeckY` (75 at towers, 77 crown), all GG edges bridge-flagged (Marin ravine now a viaduct).
Bay upper deck PCHIP profile (50 at W1, 63 at towers, 68 crowns, 62 at W4), lower deck 9.5 m below and snapped onto the
upper centreline; SF lower approach and YBI lower ramp re-profiled (lower tunnel 55 -> 59).

## Open
* roadmesh (not ours): barrier colliders of the two one-way GG/Bay edges sit inside the opposite carriageway (edges
  overlap ~3 m), and the two road ribbons z-fight on the GG deck.
* Legion / Mission Dolores / Dragon Gate are simple massing; Blender hero meshes would lift them.

## Hero waves 2b + 3 (2026-09-29)
Builders: `tools/blender/hero_wave2.py` (hobart, embCenter, turntable, transamerica, salesforce, transit) and `hero_wave3.py`
(cityHall, opera, davies, asianArt, library, ferry, coit, ghirardelli [signage "GIRARDI"], pier39). Interiors: `hero_int_w2.py`
(transamerica lobby, salesforce lobby + "Elevator - Salesforce Park" door to the Transit Center roof) and `hero_int_w3.py`
(City Hall rotunda + grand stair, Opera foyer, Ferry nave marketplace, Coit mural lobby + walkable spiral stair to the deck).
Run order: hero_waveN.py -- ids ; hero_int_wN.py -- ids ; hero_index.py (Blender python; `--exclude a,b` for before shots).
Index now writes `near` (per-site LOD0 radius: finned towers flip to flat LOD sooner), `noTrees` (props/v2.js skips generic trees
in hero plazas incl. Union Square) and `?v=` cache-busters for GLB/lightmap URLs. hero_mats: distance fade (rougher, flatter glass).
Hidden bogus OSM "buildings" over Market St (BART stations 17605/17612/17613/23507/17588/39033).
Open: Library/Asian Art have no interiors; Ferry interior is 183k tris (shop-name text); Transit park reachable only via the elevator.

## Hero wave 4 (2026-09-29): neighbourhoods + parks
Builders `tools/blender/hero_wave4.py` (castro, missionDolores, ssPeterPaul, columbusTower, grace, fairmont, markHopkins, paintedLadies, pofa,
deYoung, academy, conservatory, legion, oracle, chase, chinatown) + interiors `hero_int_w4.py` (castro auditorium under the tent ceiling,
Mission chapel, SS Peter & Paul nave, Grace nave + labyrinth, Fairmont lobby, Top of the Mark (elevator door at the Mark Hopkins corner),
de Young observation floor (elevator), Academy rainforest sphere + spiral walk, Conservatory palm house; wave-3 extras library atrium +
Asian Art grand hall run through the same script). Shared church kit: `church()` in hero_int_w4 (arcades, clerestory, vault, sanctuary).
Run order unchanged: hero_wave4.py -- ids ; hero_int_w4.py -- ids [--res 2048 --spp 256] ; hero_index.py.
New hero slots (hero_mats.js): `rooftile` (procedural barrel clay tiles, uv u along ridge / v down slope) and `clap` (lap siding).
Sites extracted by hero_extract.mjs (new entries at the end of SITES; columbusTower/deYoung radii widened for plotting).
Notes: OSM has no de Young main body (footprint designed in dy_frame, aligned with the Music Concourse); Columbus Tower = hull of
13577 + the prow circle 13646; PoFA colonnades follow band_medial() of 5188/2111; Oracle bowl lofts along band_medial(39956).
Interiors must stay inside one exterior shell and above the terrain (the terrain renders inside footprints): use floor_over().
Ferry interior shop names are now quads on a sign atlas (hero_signs.py, PIL; slot `signI`, meta interior.signs) instead of text meshes.
src/world/assets.js: img.decode() is capped at 2.5 s (it never settles while the pane/tab is hidden, which froze loading).
Brand signage fictionalised: FAIRHAVEN (Fairmont), MARK HOLLIS / TOP OF THE HILL, MISSION BAY ARENA (Chase), CHINA BASIN BALLPARK + FIZZ bottle.
hero_wave4 main() adds a noTrees zone over every site's hidden footprints (street trees grew inside Grace); library.json patched the same way.
Open: de Young body is simplified (two copper bars, no perforation pattern), Conservatory palms are chunky close-up, Academy interior
leaves are low-poly blobs, Oracle upper deck only where the OSM band is wide, PoFA lagoon still shows a little foam at the SE bank;
wave 1-3 heroes may have the same street-tree-inside-footprint issue (only the library was fixed); no Legion/Chinatown interiors.

## Hero wave 5 (2026-09-29): waterfront + icons
Builders `tools/blender/hero_wave5.py` (fortPoint, ggPlaza, alcatraz, pier33, wharfCrab, pier45, hydePier, seaLions, lombard, sutro, twinPeaks,
cliffHouse, sutroBaths, exploratorium, balmy, doloresPark) + interiors `hero_int_w5.py` (Fort Point courtyard, Alcatraz Broadway,
Pier 45 penny-arcade hall "Musee des Machines", Pier 39 two-level market street (sign atlas `hero_signs.py pier39`), Pier 15 science hall).
Run order unchanged: hero_wave5.py -- ids ; hero_int_w5.py -- ids ; hero_index.py. Sites were added to hero_extract.mjs (+ `sutro`).
Wave-5 sites without OSM footprints pass hide=[] and a custom ORIGINS entry. `hero_int_w5.site_origin` resolves wave 3/4 sites too (pier39).
New runtime features:
* hero_lm.js: sites with `far: <m>` stream on a second provider (`heroesFar`, LOD1 only out there): Alcatraz 4.5 km, Sutro Tower 7 km.
* hero_int.js: interior meta `hideExt` (hide the exterior hero while inside: Fort Point's open court shares its walls) and `showR` (0 =
  interior only when inside); site `links` = ferry-style E prompts between two far points (Pier 33 <-> Alcatraz dock); dev `heroInteriors.ride(i)`.
  TEXKEY/TILE gained brickred/brick/stucco for interiors (hero_interior TEX_ALBEDO too).
* hero_mats.js: slot `mural` (atlas public/assets/landmarks/balmy/balmy_murals.jpg from `hero_murals.py`, original art, explicit atlas UVs
  via hero_wave5.mural_uv) and slot `copper` (proc 3: perforated/dimpled copper, distance-faded) now used by the de Young.
* gg2.js detail pass: 5-step portal corbels, tangent cable-band clamps + saddles + deck sockets, Art Deco luminaires. bay2.js: cable bands;
  Bay Lights shader rewritten gentle (fastest component ~9 s period, brightness 0.4-1.1, no steps/flashes).
  kit.js aviation `blink`: ~5 s soft pulse, never off (was 2.6 s on/off).
* Cleanup: hero_index adds a noTrees zone per hidden footprint for every site (waves 1-3 had street trees inside heroes); PoFA lagoon sheet
  now also covers the partly-wet bank cells (SE foam); de Young copper panels use `copper`.
Fictional signage: FISHERMEN'S LANDING (crab wheel), ISLAND FERRY / ALCATRAZ LANDING, MUSEE DES MACHINES (+ LAUGHING LIL, MADAME ZOLTARA),
THE SCIENCE PIER, CLIFFSIDE HOUSE, GIANT CAMERA, ROUND HOUSE / WELCOME CENTER, Pier 39 shop names (P39_SHOPS).
Open / next:
* Pier 39's pier top is still the terrain (rocky cliff edges; the wave-3 decking grid only lands on flat cells); marina docks are terrain ridges.
* Parked cars fill Balmy Alley and the Twin Peaks loop (props/vehicles, other owner): a no-parking zone hook would help.
* Pier 45 submarine is placed only if the water beside the shed is deep enough (it was not); no Liberty ship yet.
* Lombard planters are 1.5 m cells (reads terraced/blocky close up); houses are generic SF row houses with bays toward the lane.
* Fort Point: only the ground-tier casemates are walkable; Alcatraz cells are not enterable; Eureka/Thayer/Balclutha have no interiors.
* Google photogrammetry sometimes showed over Pier 33 right after a teleport (mask settles later; googletiles.js is not ours).

## Interiors v2 (2026-09-30 / 10-01): near-photoreal walk-ins, every hero with an entrance
Pipeline (tools/blender): `int_assets.py` fetches CC0 materials (ambientCG / Poly Haven, 28 keys -> `public/assets/landmarks/_itex/<key>/
{color,rough,normal}.dds` + `lib.json`) and 60 Poly Haven models (`_cache/int_assets/models`); licences in public/assets/ASSET_LICENSES.md.
`hero_interior.run_interior` now: remaps the legacy slots to library materials (`x_<key>`; vertex colour = the surface's mean albedo,
runtime shades tex / mean * colour), builds `hero_props.prop()` placements (imported once, decimated, instanced, joined per material,
variants / hang / fit), bakes a day lightmap (2K, 4K for the big halls, `g.res`) + a half-res night lightmap (lamps only, daylight
emitters at a skyglow trickle, lights bluer than red = daylight) and denoises both with Open Image Denoise (`_cache/oidn`, albedo + normal
guides baked in lightmap space). Props, `d_<slot>` detail geometry (seat rows, lettering, merchandise) and emissive slots get no lightmap
texels (thousands of islands collapsed the pack): they occlude / bounce in the bake and are lit at runtime by the room probe.
Interior meta gained: lmn / lmnScale / lmMed, spots ([x, y, z, yaw|null, 'stand'|'sit']), props (slot -> textures), probe ({room, y}),
site `links` tagged `int` (escalators / elevators / galleries: E prompts like the ferry links). `hero_int_pack.py` = BC1 .dds of the
lightmaps + BC1/BC3 prop textures (`_iprops`), `hero_index.py` flags them (`dds`). Furniture helpers (sofa / table / potted_plant /
chandelier / round_table) emit Poly Haven props unless HB_PROCFURN=1; `g.style` = classic | modern | club.
Runtime (src/world/interiors/hero_int.js): ref-counted library / prop texture cache, DXT5nm normals, box-projected 256 px probe per
interior (re-captured across dusk / dawn), night lightmap blend by env.night, 'sky' window panels take the horizon colour by day and a
dim skyglow at night, roughness floor per material, auto exposure toward the median interior (lmMed), at most 3 resident interiors,
everything disposed on drop. hero_int_life.js: realistic idle people at the spots (peds/realhuman.js spawnIdlePeds, pool fallback),
murmur bed + hall reverb (effects bus) by interior kind. Map: every hero is a marker (big map 'Landmarks' filter + list, walk-ins get
the door icon), floating door labels within 30 m.
New interiors (hero_int_w6.py): Davies (glass lobby + loge balcony, auditorium: raked orchestra, side terrace boxes, rear tier,
stage with orchestra + piano, organ, acrylic clouds), Legion of Honor (three skylit galleries, paintings, sculpture, benches),
Mission Bay Arena (court, lower / upper bowl rows, concourse ring with concessions, centre-hung board, rig spots), Girardi chocolate
shop + soda fountain, Cliffside House dining room (glass wall to the real ocean), Embarcadero Center galleria (two shop levels,
escalators), Hobart / Mills / Phelan lobbies (office_lobby kit). Upgrades: Neiman rotunda balconies walkable + escalators + the
Rotunda restaurant, Marriott 4th / 20th floor corridors walkable + glass elevators + lounge, City Hall second-floor galleries,
Ferry food stalls / cafe / gallery rails, St. Francis seating groups + crystal chandeliers. Sutro Baths ruins: walkable promenades
+ stair deck (hero_wave5); Oracle Park bowl: seat rows on every tread (hero_wave4).
Run order: hero_int_wN.py -- ids [--res --spp] ; python tools/blender/hero_int_pack.py [ids] ; hero_index.py (Blender python).

## Chinatown hero set (2026-10-01): Grant Ave + side streets, baked GI, wet-street mirror
Target: shots/REF_target_chinatown_night.webp (sheet: shots/chinatown_vs_ref.jpg, `python dev/ct_sheet.py <suf>` after dev/ctshots.js).
Pipeline (plain python unless noted):
1. `node tools/blender/hero_extract.mjs` (site `ctown`, r 480 m) -> `python tools/blender/ct_plan.py`: footprints facing a hero street
   (Grant Bush..Broadway; Washington / Clay / Sacramento / Jackson Stockton..Kearny; Waverly Place) grouped into 16 blocks
   `ct_<w|e><0..7>` (side of Grant x segment between cross streets), > 32 m and other heroes' footprints excluded (Sing Chong / Sing Fat /
   Old St. Mary's stay). Also writes `src/world/landmarks/v2/ct_zone.js` (hero street segments: lantern-skip + mirror runs).
2. `python tools/blender/ct_signs.py`: sign atlas (24 fascia signs 1024x128 + 16 blades, fictional bilingual names, OFL fonts in
   `_cache/fonts`) + shop-interior atlas (8 lit back walls).
3. Blender: `hero_ctown.py -- all|ct_w3 ...|ct_gate [--nobake] [--res 2048 --spp 256] [--glowonly]` per block (~2 min each):
   per footprint: storeys from OSM height, brick / tan brick / painted stucco, recessed shop bays (clear glass + lit interior box from
   the atlas, mullions, roll-up grille housings, some grilles down), fascia signs + blade signs, striped / solid awnings, lantern rows,
   upper windows (curtains lit / unlit, AC units, flower boxes), canted bay windows, fire escapes (platforms, balusters, stairs, drop
   ladders), plain / ornate (Waverly) balconies with plants, laundry lines, metal / pagoda (green tile, kicked eaves) / plain cornices,
   goods displays (produce tables, souvenir racks), roof boxes / water tanks; lantern strings across the hero streets (Grant every
   7.8 m at 6.6 / 8.2 / 9.8 m, diagonal zig-zags; side streets 12 m; Waverly 6 m low); ground light-receiver strips in front of the
   facades. LOD1 = flat windows, no interiors / details. Dragon Gate (`ct_gate`, replaces lm2 `dragonGate`): 4 granite pillars, 3
   openings, kicked green-tile roofs, dragons + pearl + carp, plaque, guardian lions, pillar up-lights.
   Bake: vertex AO (all slots) + lightmaps for the wall slots (LM_SLOTS, `ct_unwrap`: smart project, roof islands down-weighted):
   day = uniform white sky, no sun -> sky visibility / bounce relative to an open surface of the same normal (1K), night = the
   emitters (lanterns, signs, shop interiors, windows, curtains, lamps) of this block + its neighbours' LOD1 (2K), both OIDN denoised.
4. `python tools/blender/ct_pack.py` (BC1 .dds of lightmaps + atlases, LOD1 night tint `lm.avg`) -> `hero_index.py` (Blender python).
Runtime: hero_lm.js loads LOD0 with its lightmaps (per-site materials from hero_mats.heroMatLM: day map multiplies the ambient / IBL
+ spec occlusion, night map adds albedo x irradiance x nightScale x HERO_CT.night 4.5), LOD1 gets a flat night tint (HERO_CT.far),
'ground' strips draw the baked light pools additively on the pavement at night, lantern rain-haze halos (point sprites from
site.glow, steady, faded by distance / size). LOD0 within 150 m + block radius. New hero slots: sign, shopint, lantern (saturated,
kept below the ACES white point: no pink-white centres), curtain, grille, ground; `d_<slot>` = detail geometry (no lightmap texels).
Wet street: render/streetmirror.js picks the hero street run under the camera in rain, fits a plane to the road (12 m behind ..
55 m ahead, eased), renders the hero blocks' LOD1 + halos from the mirrored camera at half res inside the wet pass (post.js
`preTrace`), and the SSR trace uses it for road pixels within the carriageway (ripple-perturbed, same film / puddle blur, soaked
sheen), falling back to the SSR result elsewhere; run switches cross-fade. lanterns2.js skips its strings on the hero streets.
`?noct` = A/B baseline (OSM + old strings, no mirror).
Known: right after a long teleport the Google photogrammetry can draw over the near block for a moment (googletiles.js mask,
pre-existing; dev/ctshots.js keeps the player near the camera); LOD1 has no lightmap (flat tint).
Round 2 (10/02, sheet shots/chinatown_vs_ref_v2.jpg): brick-heavy styles, one lit fascia box sign per shop bay (neon tube
frame, 8 colours), second blade sign on long fronts, lantern rows at 2-3 heights on most fronts; cwin = interior-mapped
window glass (room atlas + curtains, hero_mats ROOM_GLSL); ground strips split at the kerb (road quads were 0.18 m in the
air: light pools floated under the parked cars); radial_panel hit clamp (the dark slab across Sacramento was a stray
Old St. Mary's brick sliver). Runtime: night lightmap pow 2.0 x gain 1.4 with normal-map relief (light from below/front,
joints in shadow), hero IBL ambient x0.4 at night, zone (camera on a hero street, night rain) hemi/IBL x0.25, sky x0.1,
fog x0.3 (hero_lm.js CT_ZONE; live: window.__ctTune), asphalt decal 0.42 at night + puddles (ct_street.js), car contact
blobs, sharper / stronger mirror on the hero street, parked + traffic cars drawn into the street mirror. LOD0 1.06 -> 1.57 M
tris over 16 blocks (2-4 resident); VRAM 2.58 GB in Chinatown (High).

## Interiors round 2 (10/01): exposure, density, scale
Runtime: per-interior exposure trims from review shots (tools/blender/int_expo.py -> src/world/interiors/hero_int_expo.js; iterate
with `python tools/blender/int_expo.py v3`), filmic roll-off of baked light above 2.5x the room median, fixture white balance by kind
(warm hotels / theatres / churches, neutral stores / offices / arena, daylight glasshouses), interiors seen from the street dimmed
(0.55 day, 0.25 night; the probe is still captured at full brightness), busy places get up to 16 idle people.
Dressing (tools/blender/hero_int_dress.py, applied by run_interior from DRESS): racks / round racks / folded tables / mannequins /
shelving in Mayfield's and Saxton, hotel flowers + luggage carts + armchair groups + art, votive racks in the churches, museum
pedestals + benches, office reception + security gates, market crates with produce; free() avoids builder colliders and props, door
lanes stay clear. Glasshouses use the game's own trees ('tree:<species>' props on the shared leaf atlas). Alcatraz cells have bedding,
books, cups, shoes, paper. Legion = five real-size galleries; office lobbies and the galleria at real proportions.

## Interiors round 3 (10/03-04): Davies floor, Alcatraz cell lights, sparse halls (sheet shots/int_sheet_v5.jpg, v4 vs v5)
Davies (hero_int_w6.py): the hall shell has no floor, orchestra treads stopped 0.3 m short of the side walls (the green strip = the
ground under the side tiers): full-width treads, a carpet floor under / in front of the rows, a landing behind the top row.
Alcatraz (hero_int_w5.py): a bare ceiling bulb (fixture + emitter) in every cell, ~80 % lit at 18-26 W (some out), skylight sky_k 3.6 -> 4.6.
Dressing (hero_int_dress.py) new kinds: library (built oak reading tables, Poly Haven chairs, books, lamps, bookcase pairs, book walls),
cafe (bistro tables + chairs + cakes), lobby (rug seating groups, planters, benches, reception), foyer (classic chairs + flowers),
science (hands-on exhibit benches + stools); wall art for lobby / foyer / cafe. DRESS: library, transamerica, salesforce, exploratorium,
ghirardelli, opera, jwMarriott (hotel 1.5 + atrium), legion (museum 1.4). New Poly Haven models (int_assets.py round 3): book sets,
worn bookshelf, WoodenChair_01, coffee tables, clay planter, painted chair, metal stool, school desk. Rebuilt + packed + indexed:
davies alcatraz exploratorium legion ghirardelli library transamerica salesforce opera jwMarriott.
Testing note: after a rebake clear the browser cache (CDP Network.clearBrowserCache): a cached old lightmap .dds on a new glb renders black.
