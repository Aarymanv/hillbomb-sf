# Changelog

Every change since the project went under version control (2026-09-30), newest first, with the files each one touched.
Work before that date (2026-09-26 to 09-30: the 1:1 map bake, streaming world, Festival/Outlaw/Free Roam modes,
first landmark waves, sky/weather, audio rebuild, Spotify radio) is summarised at the end.
Per-file history is in [FILES.md](FILES.md).

## 2026-10-02

### Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet
`1671ce8`

<details><summary>Files (6)</summary>

- changed: `NEXT_SESSION.md`
- changed: `dev/regress_shots.js`
- changed: `dev/road2_sheet.py`
- changed: `dev/road2shots.js`
- changed: `src/render/lampmap.js`
- changed: `src/render/post.js`

</details>

### Road 2: before/after shots (shots/road2_*), concept sheet shots/road2_vs_ref.jpg, notes; harness: unthrottled settle/ctShot, wet-pass GPU timer
`118b6be`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py
`03c10d9`

<details><summary>Files (9)</summary>

- added: `dev/road2_sheet.py`
- added: `dev/road2shots.js`
- changed: `src/main.js`
- changed: `src/render/post.js`
- changed: `src/render/roadwear.js`
- changed: `src/render/streetmirror.js`
- changed: `src/render/terrainmat.js`
- changed: `src/world/assets.js`
- changed: `src/world/landmarks/v2/ct_street.js`

</details>

### Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg
`8609279`

<details><summary>Files (19)</summary>

- changed: `src/world/interiors/hero_int.js`
- changed: `src/world/interiors/hero_int_expo.js`
- changed: `tools/blender/hero_int_w1.py`
- changed: `tools/blender/hero_int_w6.py`
- assets: `public/assets/landmarks/` (15 files)

</details>

### Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
`af8b9db`

<details><summary>Files (118)</summary>

- changed: `dev/ct_sheet.py`
- changed: `dev/ctshots.js`
- changed: `dev/regress_shots.js`
- changed: `src/main.js`
- changed: `src/render/environment.js`
- changed: `src/render/post.js`
- changed: `src/render/streetmirror.js`
- changed: `src/world/landmarks/PROGRESS_V2.md`
- added: `src/world/landmarks/v2/ct_street.js`
- changed: `src/world/landmarks/v2/hero_lm.js`
- changed: `src/world/landmarks/v2/hero_mats.js`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `tools/blender/hero_ctown.py`
- changed: `tools/blender/hero_lib.py`
- assets: `public/assets/landmarks/` (104 files)

</details>

### Audio: mute automated test runs (navigator.webdriver / ?mute) and suspend pages that start hidden (background test tabs never fire visibilitychange)
`9571e05`

<details><summary>Files (1)</summary>

- changed: `src/audio/audio.js`

</details>

## 2026-10-01

### Chinatown: lantern halos toned down and kept out of the street mirror, comparison sheet (shots/chinatown_vs_ref.jpg), review views (ref / refday / drives), QUALITY note
`0543bf1`

<details><summary>Files (4)</summary>

- changed: `QUALITY.md`
- changed: `dev/ctshots.js`
- changed: `src/world/landmarks/v2/hero_lm.js`
- changed: `src/world/landmarks/v2/hero_mats.js`

</details>

### NEXT_SESSION / QUALITY: gameplay round 2
`1288a60`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Police: pursuit spawns need a short legal drive (<= 1.6x + 40 m) and a clear spot, far patrols recycled when a chase starts, units drive to the last-seen spot for 12 s before the search ring; pursuit routing takes the A* road route (greedy edge choice circled blocks). Parked-suspect probe: first unit < 30 m in 3.5-10 s at 4/6 spots (was 0/6 within the 22 s star timeout)
`33cfbba`

<details><summary>Files (2)</summary>

- changed: `src/game/drivers.js`
- changed: `src/game/sys_police.js`

</details>

### Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
`5dfaa4d`

<details><summary>Files (242)</summary>

- changed: `src/world/interiors/hero_int.js`
- changed: `src/world/interiors/hero_int_expo.js`
- changed: `src/world/landmarks/PROGRESS_V2.md`
- assets: `public/assets/landmarks/` (239 files)

</details>

### gameplay_audit: progress trace, fade nudge for fresh pages
`0eae56c`

<details><summary>Files (1)</summary>

- changed: `dev/gameplay_audit.js`

</details>

### Police: pursuit units spawn 60-120 m out, out of sight (behind / beside, or hidden by a building)
`1e2df5f`

<details><summary>Files (1)</summary>

- changed: `src/game/sys_police.js`

</details>

### Crissy Field Dash on the airfield lawn (south leg was on the Presidio Parkway ramps); Headlands XC without the US 101 U-turn keys
`d0f8b14`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/catalog.js`

</details>

### Decks: single-lane ramp decks get a shoulder (>= 3.2 m to the barrier), no barrier stubs on an at-grade ground carriageway, tunnel walls stop under the surface above
`fbc705c`

<details><summary>Files (2)</summary>

- changed: `src/world/v2/graph2.js`
- changed: `src/world/v2/roadmesh.js`

</details>

### Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds
`838c23b`

<details><summary>Files (4)</summary>

- changed: `src/game/drivers.js`
- changed: `src/game/festival/racing.js`
- changed: `src/game/festival/util.js`
- changed: `src/vehicle/physics.js`

</details>

### Race corridors: world/keepout.js; props/v2 hides trees / street props + colliders inside an active race line (loaded and streamed tiles), +3 m at corners; street furniture on carriageways not placed
`afaae5a`

<details><summary>Files (3)</summary>

- changed: `src/game/festival/festival.js`
- added: `src/world/keepout.js`
- changed: `src/world/props/v2.js`

</details>

### Map bake: tunnel portal approaches straightened (YBI east portal dropped 4.6 m out of the bore); stacked I 80 deck offset moved to structure nodes (sqrt(sin) hump made 56-107 % grades on the YBI viaduct)
`112afa9`

<details><summary>Files (8)</summary>

- changed: `tools/map/stage_roads.py`
- assets: `public/assets/map/` (7 files)

</details>

### Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
`272db80`

<details><summary>Files (120)</summary>

- added: `dev/ct_sheet.py`
- changed: `dev/ctshots.js`
- changed: `src/main.js`
- changed: `src/render/post.js`
- changed: `src/world/landmarks/PROGRESS_V2.md`
- changed: `src/world/landmarks/v2/hero_live.js`
- changed: `src/world/landmarks/v2/hero_lm.js`
- changed: `src/world/landmarks/v2/hero_mats.js`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `src/world/props/lanterns2.js`
- changed: `tools/blender/ct_pack.py`
- changed: `tools/blender/hero_ctown.py`
- changed: `tools/blender/hero_index.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/landmarks/` (106 files)

</details>

### Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
`d4b928d`

<details><summary>Files (16)</summary>

- added: `dev/ctshots.js`
- changed: `src/main.js`
- changed: `src/render/post.js`
- added: `src/render/streetmirror.js`
- added: `src/world/landmarks/v2/ct_zone.js`
- added: `src/world/landmarks/v2/hero_live.js`
- changed: `src/world/landmarks/v2/hero_lm.js`
- changed: `src/world/landmarks/v2/hero_mats.js`
- changed: `src/world/props/lanterns2.js`
- changed: `src/world/texpack.js`
- added: `tools/blender/ct_pack.py`
- added: `tools/blender/ct_plan.py`
- added: `tools/blender/ct_signs.py`
- added: `tools/blender/hero_ctown.py`
- changed: `tools/blender/hero_extract.mjs`
- changed: `tools/blender/hero_index.py`

</details>

### Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
`3d8c0be`

<details><summary>Files (13)</summary>

- changed: `src/world/interiors/hero_int.js`
- added: `src/world/interiors/hero_int_expo.js`
- changed: `src/world/interiors/hero_int_life.js`
- added: `tools/blender/hero_int_dress.py`
- changed: `tools/blender/hero_int_pack.py`
- changed: `tools/blender/hero_int_w4.py`
- changed: `tools/blender/hero_int_w5.py`
- changed: `tools/blender/hero_int_w6.py`
- changed: `tools/blender/hero_interior.py`
- changed: `tools/blender/hero_props.py`
- changed: `tools/blender/int_assets.py`
- added: `tools/blender/int_expo.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)

</details>

### QUALITY: gameplay score after the 10/1 pass
`69731f0`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### NEXT_SESSION / QUALITY: gameplay pass notes
`e6d3b41`

<details><summary>Files (1)</summary>

- changed: `NEXT_SESSION.md`

</details>

### Off-road legs: prefer <= 45 % terrain paths, straight legs only up to ~27 deg (Headlands XC rivals stalled on 31 deg grass faces)
`ca6f511`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/util.js`

</details>

### QUALITY: buildings v5 status
`6265f18`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### Buildings v5: notes (PROGRESS_V2 / NEXT_SESSION)
`d3f79ed`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `src/world/facade/PROGRESS_V2.md`

</details>

### QUALITY: interiors status
`2e56302`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
`4346943`

<details><summary>Files (311)</summary>

- changed: `NEXT_SESSION.md`
- changed: `src/world/interiors/hero_int.js`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `tools/blender/hero_int_w6.py`
- assets: `public/assets/landmarks/` (307 files)

</details>

### Races: a checkpoint missed by > 400 m rewinds the player to it (progress only grows, so the race could never finish: Crissy Field Dash ran past twice its length); dirt gates as forgiving as cross-country
`fec3c05`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/racing.js`

</details>

### Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
`64aab3f`

- v2detail.js midFront: a 3-step stoop at the house entry cell of v3-eligible Victorian / Edwardian houses
  (collapses with the other V3LOD parts), so ground floors are not flat at 190-450 m.
- material.js fadeVariant(a, b, offset): facade fade materials share one program; v2city.js gives the bld-near
  detail tiles (non-v3 buildings: sills / hoods / stoops / brackets) a 410 -> 438 m dither-in.
- v2lots.js NOV5 is a live binding set from the plan in v2worker.js init (workers have no page URL: ?nov5 used to
  switch off only the lot setbacks).
- dev/bld5shots.js: closeups teleport to the nearest street (off-street teleports were reset to the last safe spot),
  hide the player car, warm-up pass; settle waits for the photogrammetry near mask.

<details><summary>Files (8)</summary>

- changed: `dev/bld5shots.js`
- changed: `src/world/facade/material.js`
- changed: `src/world/facade/v2build.js`
- changed: `src/world/facade/v2city.js`
- changed: `src/world/facade/v2detail.js`
- changed: `src/world/facade/v2lots.js`
- changed: `src/world/facade/v2plan.js`
- changed: `src/world/facade/v2worker.js`

</details>

### Golden Gate Park Loop: one lap (9.4 km per lap on the real map, two ran ~15 min); '1 lap' not '1 laps'
`25ac7ef`

<details><summary>Files (3)</summary>

- changed: `src/game/festival/catalog.js`
- changed: `src/game/festival/events.js`
- changed: `src/game/festival/screens.js`

</details>

### Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests
`fedfd56`

- v2plan.js: 60 % of Tenderloin / Nob Hill / Civic Center apartment blocks get stacked bays; winVar() varies the
  window type within a style (25 % of Edwardians with Victorian sashes, 15 % of Victorians plainer, 35 % of stucco
  houses modern sliders), MID kit window index and v3 winPiece agree.
- v3front.js: windows behind a full balcony run down to the floor (French doors); shed hood on brackets over the
  stoop (tile on stucco / Marina) on 45 % of non-Victorian house entries.
- v5mass.js crest(): raised (sometimes stepped) centre parapet with a name panel on SoMa / Dogpatch lofts,
  warehouses and old brick commercial blocks.

<details><summary>Files (4)</summary>

- changed: `src/world/facade/v2build.js`
- changed: `src/world/facade/v2plan.js`
- changed: `src/world/facade/v3front.js`
- changed: `src/world/facade/v5mass.js`

</details>

### Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
`5f91f00`

<details><summary>Files (5)</summary>

- changed: `dev/int_shots.js`
- changed: `src/world/interiors/hero_int.js`
- changed: `tools/blender/hero_int_pack.py`
- changed: `tools/blender/hero_int_w1.py`
- changed: `tools/blender/hero_int_w6.py`

</details>

### Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
`b4b520e`

- material.js: hide channels G / B are 3-state (0 off, 128 cross-fading: both LODs drawn, 255 the NEAR version is
  fully in and the MID stand-ins collapse); fadeGLSL = distance dither (screen-space IGN vs 1 - smoothstep(a, b));
  facade fade variant (matFade: v3 walls only, polygon offset so it wins the coplanar MID wall) and a fade option
  for the kit materials. Only the fade variants carry a discard (the main facade program keeps early-z).
- v2city.js: v3 walls + v3 kit dither in over 175 -> 147 m, front-yard clutter 118 -> 98 m, city kit (cornices,
  rooftop clutter) 312 -> 290 m; a building's MID stand-ins collapse once its whole bbox is inside the inner radius
  (per-building pass on the shown cells). ?nofade = old hard swaps.
- dev/pop_probe.js: meshes with userData.fadeBand only count when they switch inside the band; building-only counts.
  60 m/s drive (mission + sunset + richmond): building pops 401 -> 96 (vs ?nofade&nov5&nonearshadow).
- v5mass.js: balcony / Juliet bars as single quads.

<details><summary>Files (5)</summary>

- changed: `dev/bld5shots.js`
- changed: `dev/pop_probe.js`
- changed: `src/world/facade/material.js`
- changed: `src/world/facade/v2city.js`
- changed: `src/world/facade/v5mass.js`

</details>

### QUALITY: sound status
`32eb6f0`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla
`35be7a7`

- engine: compressed loudness model (cruise/idle always present), ramped physics throttle drives load, blow-off on lift under boost
- mix: hero-engine side-chain ducks radio 2.5 dB / traffic 3 dB at WOT (Spotify follows), radio ~-21 LUFS default, Spotify level matched
- traffic: idle NPCs half level, 1/sqrt(n) voice budget, darker with distance
- new CC0 assets (Freesound, verified): night market bed, museum walla, cobble roll, F-line streetcar, cable car, footsteps
- dev: review scenarios (cruise30, hyde, redline, downshift, drift, chinatown, lombard, freeway, tunnel, interior, menu, jam), radio waits for decode
- build_manifest: replaces only the Audio section of ASSET_LICENSES.md (kept later sections)

<details><summary>Files (34)</summary>

- changed: `dev/audio.pipeline/build_manifest.py`
- changed: `dev/audio.pipeline/fragments/freesound_meta.json`
- added: `dev/audio.pipeline/fragments/world_fragment.json`
- added: `dev/audio.pipeline/scan.py`
- added: `dev/audio.pipeline/world_sfx.py`
- changed: `dev/audio.scenarios.js`
- changed: `src/audio/PROGRESS.md`
- changed: `src/audio/ambience.js`
- changed: `src/audio/audio.js`
- changed: `src/audio/engine.js`
- changed: `src/audio/music.js`
- changed: `src/audio/sfx.js`
- changed: `src/audio/shots.js`
- changed: `src/game/game.js`
- changed: `src/world/interiors/hero_int_life.js`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/audio/` (18 files)

</details>

### dev: gameplay audit keys on document (UI shell path), prologue segment probe, lighter event runs
`0091c1a`

<details><summary>Files (1)</summary>

- changed: `dev/gameplay_audit.js`

</details>

### Outlaw: cops drive the last metres up to a stopped suspect (route ended at the road node, 20-30 m off: no bust ever), box in instead of shoving, only player-initiated rams add stars, the search widens and lying low evades (a parked player out of sight stayed wanted forever)
`157fb1a`

<details><summary>Files (2)</summary>

- changed: `src/game/drivers.js`
- changed: `src/game/sys_police.js`

</details>

### Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
`a61b163`

- v2lots.js: per-lot front setbacks (22-40 % of lots, 0.35-2.1 m; tract rows nearly even) so a row's street wall
  steps in and out; ?nov5 switches every v5 massing change off.
- v5mass.js (new): bay forms per building (angled / squared / round Queen Anne / shallow, depth 0.45-1.15 m) shared
  by the MID bays and the v3 real bays; street-corner features (round turret with corbel, window facets and a
  witch's-hat roof on Queen Anne / some Edwardian + apartment corners; chamfered corners on commercial / apartment
  corners, cut into the polygon so the v3 facades get the corner edge too); mansard attics with dormers
  (Second Empire Victorians, some Edwardians / apartments); full balconies (iron or solid stucco parapet, stacked on
  mid-century apartments) and Juliet rails.
- v2geom.js pitchedRoof: eaves overhang 0.3-0.8 m with the pitch, trim soffits and fascia / barge boards.
- v3front.js bayWindow takes any bay outline (round bays get 6 window facets).

<details><summary>Files (7)</summary>

- changed: `dev/bld5shots.js`
- changed: `src/world/facade/v2build.js`
- changed: `src/world/facade/v2detail.js`
- changed: `src/world/facade/v2geom.js`
- changed: `src/world/facade/v2lots.js`
- changed: `src/world/facade/v3front.js`
- added: `src/world/facade/v5mass.js`

</details>

### Race corridors also hide parked cars that stream in after the start (they were only cleared on loaded tiles: obstacles further along, e.g. Macalla Rd)
`b19378b`

<details><summary>Files (2)</summary>

- changed: `src/game/festival/festival.js`
- changed: `src/world/props/v2.js`

</details>

### QUALITY: cars, perf, sound status
`b2f01d7`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car
`ceacd8a`

<details><summary>Files (4)</summary>

- changed: `dev/gameplay_audit.js`
- changed: `src/game/festival/catalog.js`
- changed: `src/game/festival/prologue.js`
- changed: `src/game/festival/stories.js`

</details>

### Buildings v5: near sun-shadow cascade on by default (high/ultra), detail-only casters + every-other-frame refresh
`aaa9e34`

- environment.js: the 56 m / 2048 nearest cascade is on unless ?nonearshadow; its shadow camera only draws layer 7
  (NEAR_SHADOW_LAYER) and the patched light loop takes min(main, near) so it adds crisp sill / pent / railing /
  clutter shadows instead of replacing the main map; refreshed every other frame. Pass cost 0-0.46 ms GPU
  (layer on/off A/B, sunset / haight / mission) vs 0.5-1.4 ms for the full-scene version.
- v2city.js: v3 walls on layers 0 + 7 and casting while shown (140-190 m used to lose front-wall shadows);
  kit3 pieces + street clutter on layer 7 only (no castShadow switching at 60 m). Without the cascade: old behaviour.
- dev/bld5shots.js: capture / perf helpers for this pass.

<details><summary>Files (3)</summary>

- changed: `dev/bld5shots.js`
- changed: `src/render/environment.js`
- changed: `src/world/facade/v2city.js`

</details>

### Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper
`c750d23`

<details><summary>Files (17)</summary>

- changed: `NEXT_SESSION.md`
- added: `dev/car2perf.js`
- changed: `src/vehicle/models.js`
- changed: `tools/blender/cars.py`
- assets: `public/assets/cars/` (13 files)

</details>

### dev: memspots result posting + throttle-proof waits, gpu.js waits; NEXT_SESSION VRAM pass notes
`999dcf5`

<details><summary>Files (3)</summary>

- changed: `NEXT_SESSION.md`
- changed: `dev/gpu.js`
- changed: `dev/memspots.js`

</details>

### Polo Fields Oval: a flat 730 m oval on the field itself (the old box climbed 22 m of grass banks; nobody finished)
`7ad9fe5`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/catalog.js`

</details>

### Night Market Circuit on Treasure Island's real street grid (was 26 % off-road through 32 footprints, nobody finished); Bay Crown starts north of Lincoln (no opening U-turn), runs along the park (JFK is car-free)
`26b175d`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/catalog.js`

</details>

### Race grid: slots clear of solid obstacles (re-checked once colliders stream in before the countdown); audit: Outlaw loop + prologue runners
`e5c901d`

<details><summary>Files (2)</summary>

- changed: `dev/gameplay_audit.js`
- changed: `src/game/festival/racing.js`

</details>

### Races: player respawn after 10 s of throttle with no route progress (rocking against a wall never tripped the speed test), respawn reasons counted (dev); abandoned ex-player cars > 700 m away are freed too; audit: UI sweep, story runner, worker-paced yields
`5b603cf`

<details><summary>Files (3)</summary>

- changed: `dev/gameplay_audit.js`
- changed: `src/game/festival/racing.js`
- changed: `src/game/game.js`

</details>

### Routes that collapsed on the real map: Presidio Circuit (1.2 km out-and-back -> 3.8 km Arguello / Moraga / Presidio Blvd / West Pacific loop), Chinatown Lanterns (470 m of Sutter -> up Grant, Broadway, Stockton), Pacific Heights Plunge (1.1 km -> 2.8 km Divisadero / Chestnut / Fillmore), prologue night segment up Grant
`fc6ef63`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/catalog.js`

</details>

### Building colliders: split rectangle-cover boxes that stick > 3 m out of the footprint (diagonal facades left invisible walls up to 28 m into Market St)
`b18f3d9`

<details><summary>Files (1)</summary>

- changed: `src/world/facade/v2city.js`

</details>

### Circuits: start / finish moved onto a straight and seam stubs removed (Golden Gate Park Loop rivals sat pinned at a hairpin start line for 12 s, 81 respawns, nobody finished)
`0a670cf`

<details><summary>Files (1)</summary>

- changed: `src/game/festival/util.js`

</details>

### QUALITY: handling + people scores
`86fac52`

<details><summary>Files (1)</summary>

- changed: `QUALITY.md`

</details>

### Peds: asset fallback to procedural humans, phone/umbrella props, shot + perf dev helpers, Rocketbox fetch script
`3b3e0ca`

<details><summary>Files (2)</summary>

- changed: `dev/ped_shots.js`
- added: `tools/blender/peds/fetch_rocketbox.py`

</details>

### Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
`51a8035`

<details><summary>Files (8)</summary>

- added: `dev/int_shots.js`
- changed: `src/world/interiors/hero_int.js`
- changed: `tools/blender/hero_int_pack.py`
- changed: `tools/blender/hero_int_w1.py`
- changed: `tools/blender/hero_int_w3.py`
- changed: `tools/blender/hero_int_w4.py`
- changed: `tools/blender/hero_int_w6.py`
- changed: `tools/blender/hero_interior.py`

</details>

### Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad
`bf0246f`

<details><summary>Files (4)</summary>

- changed: `src/game/economy.js`
- changed: `src/game/sys_menus.js`
- changed: `src/main.js`
- changed: `src/ui/tabs.js`

</details>

### Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving
`221364e`

<details><summary>Files (5)</summary>

- changed: `src/game/festival/racing.js`
- changed: `src/game/festival/stories.js`
- changed: `src/game/festival/util.js`
- changed: `src/game/game.js`
- changed: `src/game/sys_events.js`

</details>

### Controls: pad View tap = map / hold = reset (every map open also reset the car), Tab / d-pad down opens the Campaign tab, pad d-pad / stick pick the title mode, controls help lists garage / campaign / photo
`19ebdb0`

<details><summary>Files (4)</summary>

- changed: `src/game/festival/festival.js`
- changed: `src/main.js`
- changed: `src/player/input.js`
- changed: `src/ui/tabs.js`

</details>

### dev: ?sandbox (saves in sessionStorage, real profile untouched) + dev/gameplay_audit.js (route sanity, event autopilot runs)
`69c5690`

<details><summary>Files (2)</summary>

- added: `dev/gameplay_audit.js`
- changed: `index.html`

</details>

### Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
`8174630`

- hero_int_w6.py: nine new walk-in interiors; office_lobby kit
- Neiman: walkable balconies, escalator links, the Rotunda restaurant; Marriott: 4th/20th floor corridors + glass elevators,
  lounge; City Hall: second-floor galleries; Ferry: food stalls, cafe, gallery rails
- furniture helpers emit Poly Haven props (g.style classic/modern/club), chandelier crystal -> emissive crystal slot
- d_<slot> detail geometry (seat rows, lettering) and props: no lightmap islands, probe-lit
- run_interior: interior links, ring/rect decks, rail colliders, lmMed for runtime auto exposure, HB_RESCAP
- runtime: realistic idle people via peds/realhuman.js spawnIdlePeds (pool fallback), auto exposure toward the median interior,
  link verbs
- Sutro Baths walkable promenades; Oracle bowl seat rows

<details><summary>Files (12)</summary>

- changed: `src/world/interiors/hero_int.js`
- changed: `src/world/interiors/hero_int_life.js`
- changed: `src/world/landmarks/PROGRESS_V2.md`
- changed: `tools/blender/hero_int_w1.py`
- changed: `tools/blender/hero_int_w2.py`
- changed: `tools/blender/hero_int_w3.py`
- changed: `tools/blender/hero_int_w4.py`
- added: `tools/blender/hero_int_w6.py`
- changed: `tools/blender/hero_interior.py`
- changed: `tools/blender/hero_props.py`
- changed: `tools/blender/hero_wave4.py`
- changed: `tools/blender/hero_wave5.py`

</details>

## 2026-09-30

### Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
`be35afd`

Blender pipeline tools/blender/peds: 53 avatars -> shared 34-bone skeleton, LOD0/1/2,
2048x1024 BC3 atlas (tint mask / roughness / hair alpha) + DXT5nm normals; 97 mocap clips
(phase-aligned in-place walk/run cycles, idles, phone, talk/listen, photo, wave, sit, umbrella).
Runtime src/game/peds/realhuman.js: custom clip sampler + FK writing bone textures, procedural
retarget for drive/knocked/getup/jump, skin wrap shading, clothing tints, props, mesh LOD.
?peds=v1 keeps the procedural humans.

<details><summary>Files (335)</summary>

- changed: `.gitignore`
- added: `dev/ped_shots.js`
- added: `dev/ped_states.js`
- changed: `src/game/peds/looks.js`
- added: `src/game/peds/realhuman.js`
- changed: `src/game/sys_peds.js`
- changed: `src/player/human.js`
- added: `tools/blender/peds/build_avatars.py`
- added: `tools/blender/peds/build_clips.py`
- added: `tools/blender/peds/build_index.py`
- added: `tools/blender/peds/common.py`
- changed: `tools/texpack.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/peds/` (321 files)
- assets: `public/assets/texpack.json/` (1 file)

</details>

### Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
`8c2adff`

- input.js: taps latch for >=1 frame and 60 ms, keyup in capture phase, blur/hidden release, last steering key wins, stick deadzone+curve
- physics.js: player-only playerInput() (AI unchanged), 2-stage keyboard ramp, ABS/TCS/STM from Settings > Driving, drift-intent window
- wheel contact hysteresis, digressive damper, tyre load relaxation (ENV.legacyContact for A/B)
- sim.js/cars.js: render interpolation between 120 Hz steps; camera.js spring yaw + look-ahead
- tabs.js: Handling section (sensitivity, keyboard speed, counter-steer, stick response) in economy.settings.handling
- dev probes: hb_handling_probe.mjs (headless), hb_contact.js (routes, race, real-time input audit)

<details><summary>Files (11)</summary>

- changed: `NEXT_SESSION.md`
- added: `dev/hb_contact.js`
- added: `dev/hb_handling_probe.mjs`
- changed: `src/game/game.js`
- changed: `src/player/camera.js`
- changed: `src/player/input.js`
- changed: `src/player/player.js`
- changed: `src/ui/tabs.js`
- changed: `src/vehicle/cars.js`
- changed: `src/vehicle/physics.js`
- changed: `src/vehicle/sim.js`

</details>

### Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
`54aafd7`

- int_assets.py: 28 library materials -> _itex/<key>/{color,rough,normal}.dds + lib.json (albedo, tile); 60 Poly Haven models
- hero_props.py: prop(g, asset, ...) placements, imported once, decimated, instanced, joined per material (variants, hang/fit)
  props are bake occluders and are lit at runtime by the room probe (no lightmap islands)
- hero_interior.py: legacy slots remapped to library materials (vertex colour = mean albedo), emissive slots out of the
  lightmap, OIDN with albedo/normal guides, UV layout refit, 4K cap
- hero_int.js: x_ library slots + p_ prop slots (ref-counted DDS cache), DXT5nm normals, box-projected 256 px probe
  (re-captured across dusk), roughness floor per material, albedo-normalised tinting
- St. Francis lobby: Poly Haven chandeliers, sofas, armchairs, coffee tables, plants; guest spots

<details><summary>Files (119)</summary>

- changed: `src/world/interiors/hero_int.js`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `tools/blender/hero_int_pack.py`
- changed: `tools/blender/hero_int_w1.py`
- changed: `tools/blender/hero_interior.py`
- added: `tools/blender/hero_props.py`
- added: `tools/blender/int_assets.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/landmarks/` (111 files)

</details>

### Add QUALITY.md scorecard and regression rules
`a73c3cc`

<details><summary>Files (1)</summary>

- added: `QUALITY.md`

</details>

### NEXT_SESSION: regression / strobing notes
`f53a3d2`

<details><summary>Files (1)</summary>

- changed: `NEXT_SESSION.md`

</details>

### Streetlight halos stronger in rain; regress_shots: Jackson free-cam sky view (vs the user's liked day shot)
`406c0a7`

<details><summary>Files (2)</summary>

- changed: `dev/regress_shots.js`
- changed: `src/render/lampglow.js`

</details>

### dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)
`8f40932`

<details><summary>Files (4)</summary>

- added: `dev/heapwalk.js`
- changed: `dev/memspots.js`
- changed: `dev/memtrack.js`
- changed: `dev/perf_drive.js`

</details>

### Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
`4075efc`

- tools/texpack.py -> <name>.dds (BC1 opaque, BC3 alpha, full mip chain, pre-flipped) for the photo PBR library
  (colour/rough/ao), kit + baked facade atlases, tree albedo atlases and car AO; world/texpack.js loads them when
  WEBGL_compressed_texture_s3tc(_srgb) exists (0.5-1 B/px instead of 4). Normal maps stay RGBA8. Same image (A/B shots).
- game/quality.js: presets low/medium/high/ultra (texCap, tile cache/error target, facade texture array size),
  first-run GPU auto-detect + 20 s benchmark, dynamic resolution (CPU ms of frame() + GPU timer query).
  Settings > Graphics: Ultra option + Dynamic resolution toggle.
- Google tiles cache 520 -> 300 MB on high (min 70 %); photo HDRIs only loaded for ?sky=hdri.
- Building tile geometry drops its JS arrays after GPU upload (?keepgeo = old). ?legacy = the whole old memory setup.

<details><summary>Files (150)</summary>

- added: `src/game/quality.js`
- changed: `src/main.js`
- changed: `src/ui/tabs.js`
- changed: `src/vehicle/models.js`
- changed: `src/world/assets.js`
- changed: `src/world/facade/material.js`
- changed: `src/world/facade/texgen.js`
- changed: `src/world/facade/v2city.js`
- changed: `src/world/props/trees.js`
- added: `src/world/texpack.js`
- changed: `src/world/v2/googletiles.js`
- added: `tools/texpack.py`
- assets: `public/assets/baked/` (5 files)
- assets: `public/assets/cars/` (58 files)
- assets: `public/assets/kit/` (4 files)
- assets: `public/assets/tex/` (68 files)
- assets: `public/assets/texpack.json/` (1 file)
- assets: `public/assets/trees/` (2 files)

</details>

### Look: deep-blue sky (sat 0.8) + white cumulus again, less rain skyglow (muddy veil), night walls lifted under ACES (facade lamp-wall response)
`bb3858b`

<details><summary>Files (3)</summary>

- changed: `src/render/environment.js`
- changed: `src/render/sky.js`
- changed: `src/world/facade/material.js`

</details>

### Fix night strobing: dress/lantern/nightdress tickers culled from the car-probe cube cameras (origin) on alternate frames; rain occlusion render exception-safe; lantern night colour deep red; dev/flicker_rt.js real-time flicker probe
`5aef278`

<details><summary>Files (1)</summary>

- changed: `dev/flicker_rt.js`

</details>

### Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
`9b6cda8`

- hero_interior.py: night lightmap (lamps only, half res) per interior, 2K cap, spots meta, wider UV margins
- hero_int_pack.py: lightmaps/sign atlases -> BC1/BC3 .dds via tools/texpack.py (2.7 MB vs 21 MB per 2K map)
- hero_int.js: .dds loading (S3TC, ?texpack=0 = JPEG), night blend, sky window panels follow the time of day,
  at most 3 resident interiors (nearest doors), PMREM render target disposed, late loads freed
- hero_int_life.js: idle people at spots (street human pool), murmur bed + hall reverb on the effects bus
- map: Landmarks group + list on the big map, heroLm / heroLmIn markers (walk-in = door icon), floating door labels

<details><summary>Files (47)</summary>

- added: `dev/flicker_rt.js`
- changed: `src/render/weather.js`
- changed: `src/ui/bigmap.js`
- changed: `src/ui/icons.js`
- changed: `src/ui/style.js`
- changed: `src/world/facade/v2dress.js`
- changed: `src/world/interiors/hero_int.js`
- added: `src/world/interiors/hero_int_life.js`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `src/world/props/lanterns2.js`
- changed: `src/world/props/nightdress.js`
- changed: `tools/blender/hero_index.py`
- added: `tools/blender/hero_int_pack.py`
- changed: `tools/blender/hero_interior.py`
- assets: `public/assets/landmarks/` (33 files)

</details>

### Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
`9fd802a`

<details><summary>Files (8)</summary>

- added: `dev/regress_shots.js`
- changed: `src/main.js`
- changed: `src/render/carlights.js`
- changed: `src/render/environment.js`
- changed: `src/render/lampglow.js`
- changed: `src/render/post.js`
- changed: `src/render/weather.js`
- changed: `src/world/props/lanterns2.js`

</details>

### dev: GPU memory accounting (?memtrack, __gpumem) and memory spot/drive report helpers
`9665c2b`

<details><summary>Files (3)</summary>

- added: `dev/memspots.js`
- added: `dev/memtrack.js`
- changed: `src/main.js`

</details>

### Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
`d8a7ad5`

<details><summary>Files (1037)</summary>

- added: `.claude/launch.json`
- added: `.gitignore`
- added: `CONVENTIONS.md`
- added: `NEXT_SESSION.md`
- added: `README.md`
- added: `TESTING.md`
- added: `dev/audio.html`
- added: `dev/audio.js`
- added: `dev/audio.pipeline/.gitignore`
- added: `dev/audio.pipeline/build_family.py`
- added: `dev/audio.pipeline/build_manifest.py`
- added: `dev/audio.pipeline/eng.py`
- added: `dev/audio.pipeline/extra_sfx.py`
- added: `dev/audio.pipeline/fragments/engines_manifest.json`
- added: `dev/audio.pipeline/fragments/extra_fragment.json`
- added: `dev/audio.pipeline/fragments/freesound_meta.json`
- added: `dev/audio.pipeline/fragments/music_fragment.json`
- added: `dev/audio.pipeline/fragments/passby_manifest.json`
- added: `dev/audio.pipeline/fragments/sfx_fragment.json`
- added: `dev/audio.pipeline/fs.py`
- added: `dev/audio.pipeline/loopkit.py`
- added: `dev/audio.pipeline/measf.py`
- added: `dev/audio.pipeline/pack_engines.py`
- added: `dev/audio.pipeline/passby.py`
- added: `dev/audio.pipeline/peaks.py`
- added: `dev/audio.pipeline/spec_bus.json`
- added: `dev/audio.pipeline/spec_diesel.json`
- added: `dev/audio.pipeline/spec_flat4.json`
- added: `dev/audio.pipeline/spec_v10.json`
- added: `dev/audio.pipeline/spec_v8.json`
- added: `dev/audio.pipeline/tilt.py`
- added: `dev/audio.pipeline/tracks/trk_183654_23.json`
- added: `dev/audio.pipeline/tracks/trk_183654_4.json`
- added: `dev/audio.pipeline/tracks/trk_205503_11.json`
- added: `dev/audio.pipeline/tracks/trk_205503_3.json`
- added: `dev/audio.pipeline/tracks/trk_213665_14.json`
- added: `dev/audio.pipeline/tracks/trk_213665_2.json`
- added: `dev/audio.pipeline/tracks/trk_273334_0.json`
- added: `dev/audio.pipeline/tracks/trk_273334_22.json`
- added: `dev/audio.pipeline/tracks/trk_457560_1.json`
- added: `dev/audio.pipeline/tracks/trk_457560_4.json`
- added: `dev/audio.pipeline/tracks/trk_457560_6.json`
- added: `dev/audio.pipeline/tracks/trk_457560_8.json`
- added: `dev/audio.pipeline/trk2.py`
- added: `dev/audio.scenarios.html`
- added: `dev/audio.scenarios.js`
- added: `dev/audio.spotify.html`
- added: `dev/audio.spotify.js`
- added: `dev/audio.spotify.test.mjs`
- added: `dev/bld3shots.js`
- added: `dev/bld4shots.js`
- added: `dev/bld5shots.js`
- added: `dev/buildings.html`
- added: `dev/buildings.js`
- added: `dev/buildings2.html`
- added: `dev/buildings2.js`
- added: `dev/car2shots.js`
- added: `dev/cars.html`
- added: `dev/cars.js`
- added: `dev/carshots.js`
- added: `dev/cityshots.js`
- added: `dev/collider_audit.js`
- added: `dev/flicker_probe.js`
- added: `dev/gpu.js`
- added: `dev/human.html`
- added: `dev/human.js`
- added: `dev/landmarks.html`
- added: `dev/landmarks.js`
- added: `dev/lookshots.js`
- added: `dev/peds-harness.js`
- added: `dev/perf_drive.js`
- added: `dev/pop_probe.js`
- added: `dev/quad.py`
- added: `dev/sheet.py`
- added: `dev/sky_shots.js`
- added: `index.html`
- added: `kit_facade3.py`
- added: `package-lock.json`
- added: `package.json`
- added: `public/draco/draco_decoder.js`
- added: `public/draco/draco_decoder.wasm`
- added: `public/draco/draco_wasm_wrapper.js`
- added: `src/audio/PROGRESS.md`
- added: `src/audio/ambience.js`
- added: `src/audio/assets.js`
- added: `src/audio/audio.js`
- added: `src/audio/dsp.js`
- added: `src/audio/engine.js`
- added: `src/audio/music.js`
- added: `src/audio/sfx.js`
- added: `src/audio/shots.js`
- added: `src/audio/spotify/api.js`
- added: `src/audio/spotify/auth.js`
- added: `src/audio/spotify/pkce.js`
- added: `src/audio/spotify/player.js`
- added: `src/audio/spotify/station.js`
- added: `src/game/drivers.js`
- added: `src/game/economy.js`
- added: `src/game/festival/PROGRESS.md`
- added: `src/game/festival/branding.js`
- added: `src/game/festival/cars.js`
- added: `src/game/festival/catalog.js`
- added: `src/game/festival/collectibles.js`
- added: `src/game/festival/crowd.js`
- added: `src/game/festival/drift.js`
- added: `src/game/festival/drivingline.js`
- added: `src/game/festival/events.js`
- added: `src/game/festival/festival.js`
- added: `src/game/festival/gates.js`
- added: `src/game/festival/icons.js`
- added: `src/game/festival/kit.js`
- added: `src/game/festival/markers.js`
- added: `src/game/festival/prologue.js`
- added: `src/game/festival/racehud.js`
- added: `src/game/festival/racing.js`
- added: `src/game/festival/rivals.js`
- added: `src/game/festival/save.js`
- added: `src/game/festival/screens.js`
- added: `src/game/festival/showcases.js`
- added: `src/game/festival/sites.js`
- added: `src/game/festival/stories.js`
- added: `src/game/festival/stunts.js`
- added: `src/game/festival/ui.js`
- added: `src/game/festival/util.js`
- added: `src/game/game.js`
- added: `src/game/garage/PROGRESS.md`
- added: `src/game/garage/lab.js`
- added: `src/game/garage/store.js`
- added: `src/game/garage/studio.js`
- added: `src/game/garage/ui.js`
- added: `src/game/modes.js`
- added: `src/game/peds/looks.js`
- added: `src/game/peds/nav.js`
- added: `src/game/peds/yell.js`
- added: `src/game/skills.js`
- added: `src/game/sys_cablecars.js`
- added: `src/game/sys_carprobe.js`
- added: `src/game/sys_creative.js`
- added: `src/game/sys_events.js`
- added: `src/game/sys_festival.js`
- added: `src/game/sys_garage.js`
- added: `src/game/sys_hero_interiors.js`
- added: `src/game/sys_interiors.js`
- added: `src/game/sys_menus.js`
- added: `src/game/sys_peds.js`
- added: `src/game/sys_photo.js`
- added: `src/game/sys_police.js`
- added: `src/game/sys_spotify.js`
- added: `src/game/sys_tour.js`
- added: `src/game/tour/director.js`
- added: `src/game/tour/recorder.js`
- added: `src/game/tour/shots.js`
- added: `src/game/traffic.js`
- added: `src/main.js`
- added: `src/player/camera.js`
- added: `src/player/human.js`
- added: `src/player/input.js`
- added: `src/player/player.js`
- added: `src/render/PROGRESS.md`
- added: `src/render/atmosphere.js`
- added: `src/render/carlights.js`
- added: `src/render/carprobe.js`
- added: `src/render/carshadow.js`
- added: `src/render/environment.js`
- added: `src/render/fog.js`
- added: `src/render/hdrisky.js`
- added: `src/render/lampglow.js`
- added: `src/render/lampmap.js`
- added: `src/render/particles.js`
- added: `src/render/photo/looks.js`
- added: `src/render/post.js`
- added: `src/render/roadwear.js`
- added: `src/render/skidmarks.js`
- added: `src/render/sky.js`
- added: `src/render/terrainmat.js`
- added: `src/render/water.js`
- added: `src/render/weather.js`
- added: `src/render/wetstreaks.js`
- added: `src/ui/bigmap.js`
- added: `src/ui/devshot.js`
- added: `src/ui/hud.js`
- added: `src/ui/icons.js`
- added: `src/ui/mapcanvas.js`
- added: `src/ui/menu.js`
- added: `src/ui/shell.js`
- added: `src/ui/style.js`
- added: `src/ui/tabs.js`
- added: `src/ui/theme.js`
- added: `src/vehicle/cars.js`
- added: `src/vehicle/carshade.js`
- added: `src/vehicle/models.js`
- added: `src/vehicle/physics.js`
- added: `src/vehicle/sim.js`
- added: `src/vehicle/tuning.js`
- added: `src/world/anchors.js`
- added: `src/world/assets.js`
- added: `src/world/blocks.js`
- added: `src/world/buildings.js`
- added: `src/world/citymesh.js`
- added: `src/world/collision.js`
- added: `src/world/facade/PROGRESS_V2.md`
- added: `src/world/facade/beacons.js`
- added: `src/world/facade/decals.js`
- added: `src/world/facade/emit.js`
- added: `src/world/facade/far.js`
- added: `src/world/facade/kitleaf.js`
- added: `src/world/facade/layers.js`
- added: `src/world/facade/material.js`
- added: `src/world/facade/near.js`
- added: `src/world/facade/plan.js`
- added: `src/world/facade/rooms.js`
- added: `src/world/facade/texgen.js`
- added: `src/world/facade/v2build.js`
- added: `src/world/facade/v2city.js`
- added: `src/world/facade/v2detail.js`
- added: `src/world/facade/v2dress.js`
- added: `src/world/facade/v2dressgeo.js`
- added: `src/world/facade/v2geom.js`
- added: `src/world/facade/v2lots.js`
- added: `src/world/facade/v2plan.js`
- added: `src/world/facade/v2worker.js`
- added: `src/world/facade/v3front.js`
- added: `src/world/geo.js`
- added: `src/world/grass/capture.js`
- added: `src/world/grass/glsl.js`
- added: `src/world/grass/index.js`
- added: `src/world/grass/layers.js`
- added: `src/world/interiors/arch.js`
- added: `src/world/interiors/atlas.js`
- added: `src/world/interiors/bodega.js`
- added: `src/world/interiors/cafe.js`
- added: `src/world/interiors/diner.js`
- added: `src/world/interiors/extras.js`
- added: `src/world/interiors/furniture.js`
- added: `src/world/interiors/hero_int.js`
- added: `src/world/interiors/hide.js`
- added: `src/world/interiors/kit.js`
- added: `src/world/interiors/materials.js`
- added: `src/world/interiors/parking.js`
- added: `src/world/interiors/pizza.js`
- added: `src/world/interiors/safehouse.js`
- added: `src/world/interiors/shop.js`
- added: `src/world/interiors/showroom.js`
- added: `src/world/interiors/site.js`
- added: `src/world/interiors/sites.js`
- added: `src/world/interiors/ui.js`
- added: `src/world/landmarks.js`
- added: `src/world/landmarks/PROGRESS_V2.md`
- added: `src/world/landmarks/bay.js`
- added: `src/world/landmarks/bayBridge.js`
- added: `src/world/landmarks/civic.js`
- added: `src/world/landmarks/downtown.js`
- added: `src/world/landmarks/goldenGate.js`
- added: `src/world/landmarks/kit.js`
- added: `src/world/landmarks/v2/bay2.js`
- added: `src/world/landmarks/v2/extra2.js`
- added: `src/world/landmarks/v2/gg2.js`
- added: `src/world/landmarks/v2/hero_lm.js`
- added: `src/world/landmarks/v2/hero_mats.js`
- added: `src/world/landmarks/v2/hero_sites.js`
- added: `src/world/landmarks/v2/lm2.js`
- added: `src/world/landmarks/v2/mats2.js`
- added: `src/world/landmarks/west.js`
- added: `src/world/latlon.js`
- added: `src/world/map.js`
- added: `src/world/props.js`
- added: `src/world/props/fx.js`
- added: `src/world/props/instset.js`
- added: `src/world/props/kit.js`
- added: `src/world/props/lanterns2.js`
- added: `src/world/props/models.js`
- added: `src/world/props/nightdress.js`
- added: `src/world/props/pierdeck.js`
- added: `src/world/props/textures.js`
- added: `src/world/props/trees.js`
- added: `src/world/props/v2.js`
- added: `src/world/props/v2blocks.js`
- added: `src/world/props/v2set.js`
- added: `src/world/props/v2zones.js`
- added: `src/world/props/wires.js`
- added: `src/world/roads.js`
- added: `src/world/terrain.js`
- added: `src/world/textures.js`
- added: `src/world/v2/anchors2.js`
- added: `src/world/v2/districts2.js`
- added: `src/world/v2/googletiles.js`
- added: `src/world/v2/graph2.js`
- added: `src/world/v2/mapdata.js`
- added: `src/world/v2/roadmesh.js`
- added: `src/world/v2/stream.js`
- added: `src/world/v2/terrain2.js`
- added: `src/world/v2/terrainmesh.js`
- added: `src/world/v2/world2.js`
- added: `src/world/world.js`
- added: `tools/blender/__pycache__/car_hero.cpython-313.pyc`
- added: `tools/blender/__pycache__/cars.cpython-313.pyc`
- added: `tools/blender/__pycache__/hb_kit.cpython-313.pyc`
- added: `tools/blender/__pycache__/hb_lib.cpython-313.pyc`
- added: `tools/blender/__pycache__/hb_props.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_int_w1.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_int_w2.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_int_w3.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_interior.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_lib.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_wave1.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_wave2.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_wave3.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_wave4.cpython-313.pyc`
- added: `tools/blender/__pycache__/hero_wave5.cpython-313.pyc`
- added: `tools/blender/__pycache__/shops.cpython-313.pyc`
- added: `tools/blender/__pycache__/trees.cpython-313.pyc`
- added: `tools/blender/_compose.py`
- added: `tools/blender/bake_all.py`
- added: `tools/blender/car_hero.py`
- added: `tools/blender/car_hero_preview.py`
- added: `tools/blender/car_textures.py`
- added: `tools/blender/cars.py`
- added: `tools/blender/cars_export.mjs`
- added: `tools/blender/facade_kit.py`
- added: `tools/blender/hb_kit.py`
- added: `tools/blender/hb_lib.py`
- added: `tools/blender/hb_props.py`
- added: `tools/blender/hero_extract.mjs`
- added: `tools/blender/hero_index.py`
- added: `tools/blender/hero_int_w1.py`
- added: `tools/blender/hero_int_w2.py`
- added: `tools/blender/hero_int_w3.py`
- added: `tools/blender/hero_int_w4.py`
- added: `tools/blender/hero_int_w5.py`
- added: `tools/blender/hero_interior.py`
- added: `tools/blender/hero_lib.py`
- added: `tools/blender/hero_murals.py`
- added: `tools/blender/hero_signs.py`
- added: `tools/blender/hero_wave1.py`
- added: `tools/blender/hero_wave2.py`
- added: `tools/blender/hero_wave3.py`
- added: `tools/blender/hero_wave4.py`
- added: `tools/blender/hero_wave5.py`
- added: `tools/blender/kit_city.py`
- added: `tools/blender/kit_facade3.py`
- added: `tools/blender/preview.py`
- added: `tools/blender/review.py`
- added: `tools/blender/rooms.py`
- added: `tools/blender/shops.py`
- added: `tools/blender/smoke.py`
- added: `tools/blender/stats.py`
- added: `tools/blender/trees.py`
- added: `tools/blender/verify_projection.py`
- added: `tools/devbuild.mjs`
- added: `tools/fetch_assets.py`
- added: `tools/map/README.md`
- added: `tools/map/__pycache__/common.cpython-313.pyc`
- added: `tools/map/__pycache__/fetch_osm.cpython-313.pyc`
- added: `tools/map/__pycache__/stage_land.cpython-313.pyc`
- added: `tools/map/common.py`
- added: `tools/map/convert_osm.py`
- added: `tools/map/dem_preview.png`
- added: `tools/map/dem_preview_small.png`
- added: `tools/map/demtest.py`
- added: `tools/map/fetch_dem.py`
- added: `tools/map/fetch_osm.py`
- added: `tools/map/preview.py`
- added: `tools/map/preview2.py`
- added: `tools/map/preview_roads.png`
- added: `tools/map/preview_roads_small.png`
- added: `tools/map/pv_full.png`
- added: `tools/map/pv_ggpark.png`
- added: `tools/map/pv_russianhill.png`
- added: `tools/map/stage_buildings.py`
- added: `tools/map/stage_dem.py`
- added: `tools/map/stage_export.py`
- added: `tools/map/stage_land.py`
- added: `tools/map/stage_roads.py`
- added: `tools/upgrade_tex.py`
- added: `trees.py`
- added: `vite.config.js`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/audio/` (138 files)
- assets: `public/assets/baked/` (10 files)
- assets: `public/assets/cars/` (120 files)
- assets: `public/assets/hdri/` (9 files)
- assets: `public/assets/kit/` (11 files)
- assets: `public/assets/landmarks/` (185 files)
- assets: `public/assets/manifest.json/` (1 file)
- assets: `public/assets/map/` (7 files)
- assets: `public/assets/tex/` (96 files)
- assets: `public/assets/trees/` (83 files)

</details>

## Before version control (2026-09-26 to 2026-09-30)

- Real 1:1 San Francisco map bake from OpenStreetMap + USGS elevation (`tools/map/`), streamed 512 m tiles, road graph with A*, road meshes with junctions, sidewalks, markings, bridges and tunnels.
- Google Photorealistic 3D Tiles for the far city, blended beyond ~300 m.
- Game modes: Festival (races, story, progression), Outlaw (police), Free Roam (creative mode: unlimited money, fast travel, time / weather / graphics switches), cinematic tour with recording.
- Hero landmark waves 1-5 (Union Square, FiDi, Civic Center, neighbourhoods, waterfront) modelled and light-baked in Blender, with walk-in interiors.
- Buildings v2-v4 (storefront dress, cornices, bays, per-lot rowhouses, 3D facades, front yards), trees and nature pass, road realism pass, sky / night lighting rewrite, car pass 1, audio rebuild with CC0 engine recordings, Spotify radio station.
