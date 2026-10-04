# HILLBOMB status (2026-09-28 late)
Default map = real 1:1 SF (?map=v1 = old half-scale map). Google Photorealistic 3D Tiles beyond ~300-800 m (key in .env.local,
never commit). Done: real buildings (178k, facade kit baked in Blender), landmarks at real scale + bridge decks, street life
(props/traffic/peds), grass + ground cover, photoreal cars (Blender LODs + probe reflections), road wear shader, global look
(SSR, lamp cones/shadows, haze, grade), festival/events/interiors/cable cars/police ported, Free Roam creative mode + Creative tab.
Vegetation pass (2026-09-29): tools/blender/trees.py = 26 species (+redwood x2, wind-shorn cypress3, ginkgo, Victorian box, pampas),
photo-derived bark, 3 LODs + 96 px hemi-oct impostors; trees.js leaf translucency + slow flutter; v2.js real-context placement
(woodsAt: GG Park redwood groves, Presidio pine/cypress/euc, Sutro/Mt Davidson blue gum, coastal cypress belt x<-6900), smooth-noise
groves, trails (extras.paths ribbons), 'woods-far' impostor field to 4.8 km, Pier 39 deck (props/pierdeck.js flattens the pier raster),
no-parking (Balmy Alley, Twin Peaks loop); grass/glsl.js ice plant on dunes + sparser flowers. Shots: shots/veg_*_{before,after}.jpg.
Night: trees/impostors/grass fade IBL fill with uNight and dim the moon on foliage (lamps unchanged). Perf A/B (dev server, ?tiles=0,
old code+assets vs new): GG Park 16.2->15.9 ms, Presidio 16.8->13.6 ms; drive p99 69->61-72 ms, drive p50 18.4->~21 ms (1 baseline
sample; not yet explained). Veg TODO: Pier 39 deck has no colliders on the overhang (terrain physics); ice plant reads olive at golden
hour; redwood spine shows above sparse tops; lupine heads still chunky; no golden-hill tuning beyond the existing dryness field.
Known issues: rivals overshoot Hyde->Bay corners; Hill Chase tail mission unverified; floating title-screen traffic on Hyde grade;
car probe ~1.65 ms; curb colours not tied to hydrants; prologue / Twin Peaks drift / interior walk-ins untested on v2.
Workflow the user wants: max 2 agents at a time; token-frugal; send before/after screenshots; references in shots/REF_*.

Cars pass 9/29: Blender tyre (tyre.jpg normal map, uv.y 2-3/6-7 marker) + drilled rotor (uv.y 4-5) + rim bevel; <id>_ao.jpg is now RGB (AO, convexity, grime);
paint layers/lamp depth in src/vehicle/carshade.js; contact shadows src/render/carshadow.js; boxtruck model; SF colour mix (STREET_PAINT);
hood/bumper + in-car cams (C cycles); race AI braking pass drivers.js propagateBraking (Hyde->Bay overshoot). In-car view interior is very dark.
Cars pass 2 9/29 (body detail): tools/blender/car_hero.py on `node tools/blender/cars_export.mjs --hero <ids>` (dense _hq2 loft + per-call
records/tags from models.js tagged()): knifed door/hood/fuel grooves, recessed lamps (bowls, projectors, DRL/light pipes, clear 'lens'
bucket), real grille lattices, seals, mirrors, wipers, tips, 3D badges, full interior (tub, dash, lit gauges, wheel, seats). Hero ids in
cars.py HERO_IDS get level H (player only, ~85-115k) + L0 30k / L1 5k / L2 1.7k; TRAFFIC6 get L0 40k. Preview without the game:
tools/blender/car_hero_preview.py -- <id>. Cockpit: camera.js eye/FOV 56 + cabin fill (details-material uniform box, build.setCabin).
All 13 rebuilt 10/1 (traffic-only ids: full-detail base B_* is build input only, L0 ~43k); AO dds via tools/texpack.py --only cars/.
Perf A/B: dev/car2perf.js + ?carbase=<dir> (baseline: HB_NOHERO=1 HB_OUT=<dir> cars.py). Shots: dev/car2shots.js.
Cars pass 3 10/3 (body shapes + in-car): the 13 hero/traffic bodies are sculpted in the JS loft (models.js SCULPT table -> section()
sculptSide/sculptTop: arch flares + haunches, waist, shoulder/cove/rocker, raked nose/tail via rndF/rndR zt/zx/zb, bonnet dome +
crowns, greenhouse ghIn/ghTaper; S.w + getModelSpec unchanged = physics identical), quarter lights + glass-wrapped slim A-pillars
(ghMat), Blender aero add-ons tools/blender/car_body.py (splitter, skirts). Review the shapes fast: tools/blender/car_shape_sheet.py
-- <ids> [--big] (workbench, seconds). Rebuild: cars_export.mjs --hero <ids>, cars.py <ids>, cars.py --index, texpack --only cars/.
In-car: CABIN {gain 3.2, lamp 2.5} (window-lit cabin from the probe / IBL, AO softened, gauges x2.5), camera.js eye = spec.seat, FOV 54.
Silent harness: node dev/car3cdp.mjs <url+mute> <script.js> (own headless Chrome --mute-audio, parks on manifest); shots dev/car3shots.js.
Baseline assets for A/B: public/assets/cars_p2 (untracked, ?carbase=cars_p2). Open: interior trim is still near-black plastic;
EV tail light bar dim at night (pre-existing); the 45 non-hero ids keep the pass-2 loft shapes.

Sky + night pass 9/29: physical sky by default (render/atmosphere.js Hillaire LUTs; ?sky=hdri = old photo sky). sky.js = dome + 1/3-res
volumetric cumulus pass (createCloudPass) + cirrus, moon phase (env.state.moonAge), few stars, city skyglow; the dome bakes the IBL
(equirect -> PMREM, throttled). environment.js PLOOKS: exposure + "adapt" EV (natural light only; lamps/windows fixed). Cloud shadows
(fog.js hbCloudShadow), Karl = fog.js slab (HB_FOG.y > 1 = top m). Night: render/lampmap.js world-space lamp + street-fill light map
on every lit material (old pool decals muted via props.js additiveFog/HB_POOLK); Google tiles get street glow + procedural windows
at night. post.js: N8AO half-res + depth-aware upsample, ContactShadowPass. roadmesh.js crosswalk bars clipped (no '#').
Dev: dev/sky_shots.js (__skyShot/__nightShot/__nightAll). Open: props lamps sparse on arterials (Divisadero ~86 m/side);
facade NIGHT_IND keeps walls near-black at night (buildings agent's call).

Look-dev pass 9/29 (whole-image cohesion, shots/look_*_{before,after}.jpg, look_sheet.jpg; dev/lookshots.js = spots/times, A/B variants, GPU timer, hidden-tab-safe settle):
- ROOT BUG: the sky IBL was black at every hour. environment.js re-bake drew the dome into eqRT while the dome still sampled uHdr = eqRT
  (WebGL feedback loop -> draw dropped; PMREM kept the black boot bake). Fixed (uHdr = null during the bake); eqRT 1024 -> 512 (bake ~1 ms).
  Every look had been tuned with sun + dim hemi only; shaded streets no longer go black.
- Tone map ACES -> AgX (post.js) + grade sat x1.12, day +0.05 EV, night -0.3 EV / +6 % contrast (environment.js); sky sat 0.76 -> 0.64,
  IBL bake desaturated 28 % (no cobalt shade), milder cool shadow tint; cumulus diffusion 0.9 -> 0.5 (shaded flanks / grey bases).
- Cloud streaks in captures: dome uRes now = the target it is drawn into (composer pixel ratio != drawing buffer).
- Fog: uBankWash was always 0 (THREE.MathUtils.smoothstep(camY, 360, 200) is not symmetric); inside Karl the sun now dims 80 %,
  shadows soften, eye adapts.
- Night walls: lamp-map wall response (material.js hbLampWall) falls off up the storeys (x0.2 vertical, 0.16 at the lamp heads),
  roofs above 2.5 m x0.18. The "night house lit like day" in bld4_closeup was mostly the parked player car's headlights.
- carlights.js: low beams (decay tag 1.9 -> horizontal cut-off patched into three's getSpotLightInfo), 110 cd, aimed 16 m ahead,
  player car also gets the road pool decal. Wet roads (fog.js): soaked diffuse darker, broad dry sheen x0.25 when wet (lampmap.js).
- Kit foliage (facade/kitleaf.js): shrubs / hedges / bougainvillea / pots / planters = shrunk core + alpha-tested leaf cards from the
  tree leaf atlas (u >= 2 encoding, patchKitMaterial opts.leaf, custom depth for shadows); ?noleaf = A/B (+0.1 M tris, GPU in noise).
- Open: shadow normal bias (~12 cm) untouched (a tighter near cascade costs a 3rd shadow pass); Chinatown wet road still greyer than
- Round 2 (battery stop): wet roads (fog.js) damp-film roughness 0.22-0.44 -> 0.07-0.21 (the gloss G-buffer read ~0, so SSR only lit puddles)
  + wet sky-reflection occlusion 0.85 -> 0.97: lantern / car reflections are back, but Chinatown rain still reads greyer than
  REF_target_chinatown_night (the rain night sky + lamp pools are too bright; try dimmer light pollution on low cloud in rain).
  Sidewalk albedo 0.74 -> 0.6 (terrainmat.js), not yet checked at night.
- TODO near shadows: environment.js has a 3rd "nearest" cascade (2048 map, +-28 m ahead of the camera, 4 cm normal bias, blended
  as index 2 in the patched light loop), OPT-IN via ?nearshadow. Its GPU cost is unmeasured: every A/B in r2 ran under GPU contention
  (baseline itself rose from ~10 to 35-67 ms). NOTE the high preset is quality.shadows = 1: the main sun map is 2048 over +-115 m
  (11 cm texels, ~18 cm normal bias), not 4096. Measure on an idle machine, then default it on if < 1 ms.
  the ref; Hyde St camera does not frame Alcatraz; sidewalks read pale at night.

Buildings v6 pass 10/3 (district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs): see src/world/facade/PROGRESS_V2.md top; ?nov6 = A/B; shots/bld6_*; headless harness dev/bld6_run.js via dev/car3cdp.mjs.
Buildings v5 pass 10/1 (massing variety: setbacks / bays / turrets / chamfers / mansards / balconies / eaves / crests; near sun-shadow cascade on by default; dithered cross-fades for v3 / kit / yards / near tiles): see src/world/facade/PROGRESS_V2.md top; ?nov5 ?nofade ?nonearshadow = A/B; shots/bld5_*.
Buildings v4 pass 9/29 (grounding / bounce / lamp-map night / front yards / murals / tree wells / residential poles): see src/world/facade/PROGRESS_V2.md top; ?nov4 = A/B; shots/bld4_*.

Streaming / colliders / pop pass 9/29 (dev/collider_audit.js, dev/pop_probe.js; perf_drive.js now reports cpuP50/gpuP50/heapMin):
building colliders = rectangle cover of the real footprint (v2city colsFor; the whole-OBB box for fill >= 0.7 was ~95 % of
all invisible walls, ~1.2k of them on carriageways); viaduct piers skipped on ground carriageways (roadmesh); hero colliders
only once a LOD is drawn (hero_lm); bld-col trash flushed on reload (duplicate boxes). Pops: StreamSet dither fades at maxDist
(props, parked proxies) + complementary proxy<->model cross-fade at 35-42 m (props/v2.js fadeMat, v2set matWrap); cell cull
spheres include the model radius + cell y-spread; kit cell bounds from real xz extent (were up to 59 m short: facade kit
blinked with camera yaw); 12 m hysteresis on KIT/V3/DET bands; stream: velocity-ahead loading + priority (stream.aheadBias,
also the buildings worker queue), unload keeps tiles ahead / in view for +T/2 and >= 4 s; Google near mask hysteresis by tile
key (was reset on every tile crossing) + our meshes / kit cells follow the mask in the same frame; terrain LOD1->far keeps the
tile until its chunk is rebuilt (no hole frame).
Open: MID->kit/v3 swaps still hard (dither needs material.js: look-dev owner); kit castShadow toggles at 60/140 m; bld-dress
re-merge pops at 900 m; interiors colliders over the road in SoMa (~10, 7 without mesh) not checked; props in carriageway
(~20 visible ones) not moved; JS heap ~2.3-3.2 GB while driving on both old and new code (usedJSHeapSize swings 1.1-3.3 GB
between GC; no leak found, not reduced); Google-tiles-on pop sweep and 360 deg yaw sweep not re-run after the fixes (battery).

Regression fix 9/30 (night look + strobing): tone map back to ACES (?tm=agx = look-dev A/B), bloom counts the brightest channel
(red lanterns / neon bloom), lanterns glow deep red, sky sat 0.8 + white cumulus, less rain skyglow, night walls lifted; no player
headlight pool (white smear), lamp cones 1/3, lens drops off (?lensdrops). STROBING ROOT CAUSE: v2dress / lanterns2 / nightdress
tickers set per-tile visibility in onBeforeRender from cam.position; the car probe's cube cameras (local pos 0,0) render on alternate
frames and that visibility only applies to the NEXT render -> sign bands / neon / lanterns vanished every other frame. Never cull in
onBeforeRender without skipping non-main cameras. Probes: dev/flicker_rt.js (__flickRT real-dt loop, __flickCatch saves jump pairs,
__altStat parity); hidden-tab __frames stepping MISSES async-ordered bugs. Regression set: dev/regress_shots.js (__regAll('after')).

Handling pass 9/30 (user: "bad handling, overly sensitive, doesn't detect"): input.js latches taps (>= 1 frame + 60 ms, keyup in capture phase,
blur/hidden release, last steering key wins), gamepad polled every 120 Hz step (sim.onPreStep), stick deadzone + curve. Player-only steering
model physics.js playerInput() (input.hs from player.js; AI/traffic keep the old model): grip-limited lock at speed, 2-stage keyboard ramp,
ramped keyboard pedals; Settings > Driving ABS / TCS / STM / Steering were never wired - now are (+ Handling: sensitivity, keyboard speed,
counter-steer, stick curve -> economy.settings.handling). Contact: hysteresis, digressive damper, tyre load relaxation (ENV.legacyContact = A/B).
Render interpolation of car bodies (sim alpha). Chase cam: spring yaw + look-ahead. Probes: node dev/hb_handling_probe.mjs (HS=standard),
dev/hb_contact.js (__hbContact routes, __hbRace, __hbInputTest). Open: curb hits at corner cuts are real 0.15 m steps (no curb ramps);
__hbRace player autopilot often stalls after the first race in a page.

VRAM/perf pass 9/30-10/1 (commit 4075efc; user: "pc dying, 11 GB VRAM"). GL-tracked GPU bytes (dev/memtrack.js, ?memtrack ->
__gpumem() table / __gpumemTotals(); dev/memspots.js __memSpots / __memDrive; dev/heapwalk.js) at 2560x1440, 5 spots:
High before 3.4-3.8 GB -> after 2.2-2.7 GB; Low 1.36-1.50 GB. Legacy run reached 11.1-11.4 GB system VRAM (nvidia-smi) and a
4.8 GB JS heap (one renderer crash mid-drive). What changed: tools/texpack.py -> BC1/BC3 .dds next to the photo PBR library,
kit/baked atlases, tree atlases, car AO (world/texpack.js loads them; normal maps stay RGBA8 = now the biggest texture item,
~0.45 GB); game/quality.js presets low/medium/high/ultra (texCap, tiles cache 160/240/300/520 MB, facade array 512 on low),
first-run GPU auto-detect + benchmark, dynamic resolution (GPU timer + CPU ms; Settings > Graphics toggle); HDRIs only for
?sky=hdri; building tile geometry frees its JS arrays after upload. A/B: ?legacy (whole old setup), ?texpack=0, ?keepgeo.
Open: kit cells built but not yet visible keep ~0.65 GB of typed arrays in the JS heap (heap valleys 1.4 GB, peaks 2.7-4.1 GB);
GPU buffers grow 0.7 -> ~1.15 GB in the first 4 min of driving then plateau (no leak over 10 min). Hidden-pane harness frame
times are dominated by multi-second stalls / GPU contention (p99 205 vs 468 ms between two runs): re-measure on a visible,
idle machine. Hidden tabs throttle chained setTimeout to ~1/min after 5 min: dev helpers now yield via MessageChannel.

Interiors v2 pass 10/01 (see src/world/landmarks/PROGRESS_V2.md "Interiors v2"): 39 hero walk-ins (9 new: Davies, Legion, Mission Bay Arena,
Girardi chocolate shop, Cliffside dining room, Embarcadero galleria, Hobart / Mills / Phelan lobbies), CC0 material library + Poly Haven
props, OIDN-denoised day + night lightmaps, box-projected probes, realistic idle people (spawnIdlePeds), indoor reverb, walkable
balconies / galleries with escalator & elevator links, landmark map markers + list. Review shots: dev/int_shots.js -> shots/int_<id>_v2.jpg,
shots/int_sheet_v2.jpg. Per-interior GPU (H.mem()): ~45-75 MB while resident (max 3 resident), 0 after leaving.
Open: Macy's / Saks still read bright white; Academy / Conservatory trees are the old low-poly blobs; de Young screen panel blocks the
review view; Alcatraz cellhouse flat; office lobbies bare; Oracle bowl seat rows rebuilt in LOD0 only; prop texture DDS are 1K.
"Union Square slab" (chk_marriott_day.jpg) = the camera (860, 40, -1440) was inside OSM building 23382 (base 26.7 m, 18 m tall):
its walls seen from inside, not a world bug (from y 60 the view is clean).

Gameplay pass 10/1 (dev/gameplay_audit.js; load it in a `/?sandbox` page = saves in sessionStorage, real profile untouched):
__gpRoutes/__gpRouteFlags (route sanity), __gpRun(id)/__gpRunAll (event on the race autopilot -> results -> rewards), __gpStory,
__gpPrologue/__gpProSeg, __gpOutlaw (?mode=gta), __gpUI (menus/map/photo/garage/F1/Tab softlock sweep). Hidden tabs throttle:
keep a javascript call awaiting (~25 s) while a batch runs. Events completing on the autopilot: 4/6 sampled before -> 34/39 after
(showcases end beaten/caught by design). Fixed: festival damage killed the car (no throttle, stuck forever), respawn loops in front of
streamed colliders, 28 m building-collider overhangs on Market St (v2city colsFor split), U-turn finishes, hairpin circuit starts,
collapsed routes (Presidio Circuit, Chinatown Lanterns, Pac Heights Plunge, Night Market, Polo Fields, beach), cliff off-road legs
(terrain A*), missed-checkpoint never-ending laps, parked cars streaming into race corridors, parked/abandoned car leak (240 bodies),
pad View = map+reset, Tab/F1 dead, title not pad-navigable, cops never reaching a stopped player / ram stars / hide limbo, resume pos.
Open: AI still respawns 10-160x per race (trees / props on off-road lines stream in after the route clearance; no runtime re-clear);
Yerba Buena tunnel exit drops 4.6 m (deck ys 59 vs terrain 54.5: world/roads) and the YBI ramp spiral costs every racer ~2 min
(Bay Crown, Fleet Week, Lowtide 5); Crissy Field Dash / Headlands XC rivals still stall (tree rows, steep faces); autopilot can't do
tail / drift / air / speed missions (not a game bug); cops spawn 140-260 m out and take ~25 s to arrive; JFK Drive is car-free
on the real map (GG Park events run along Fulton).
Gameplay round 2 10/1 (commits 112afa9..33cfbba): 37/39 events finish on the autopilot (was 34). Bake: tunnel portal approaches
straightened (YBI east portal continuous 59.1 -> 57.3), stacked I 80 deck offset at structure nodes (YBI viaduct had 77-107 %
humps). world/keepout.js race corridors: trees / street props (+ colliders) hidden inside the active line, loaded or streamed,
+3 m at corners; street furniture on carriageways not placed. Race AI: path-tangent waypoint popping, curvature-capped lane
offsets, TCS + STM for rivals. Decks: ramp shoulders (>= 3.2 m), no barrier stubs on at-grade roads, tunnel walls below the
surface. Rival respawns: Bay Crown 73 -> 12-15; road/street events 37 total over 29 races; off-road still 5-119 (Twin Peaks XC 59,
Headlands XC 119). YBI tunnel -> 20.4 km section 110-130 s -> ~100 s (single-lane loop + Macalla Rd, now drivable without stops).
Crissy Dash moved onto the lawn (0 rival respawns). Police: pursuit spawns 60-120 m with a short legal route, far patrols recycled,
A* pursuit routing; parked-suspect probe first unit < 30 m in 3.5-10 s at 4/6 spots (was 0/6 before the 22 s star timeout).
Collider CPU driving Market 3rd -> Van Ness: solveStatic 0.23 ms/frame all vehicles (184 candidates, 337 building boxes within
300 m), under the 0.3 ms bar: no change. Open: Headlands Dirt / XC (player autopilot stuck on 50-57 % Marin faces, rivals 4/5
finish XC); Macalla Rd DEM bumps (73 -> 80 -> 71 m); downtown pursuit units still sometimes start on the wrong side of one-ways.

Road 2 pass 10/2 (user: "fix the road" vs REF_target_chinatown_night): post.js WetReflectionPass alpha = roughness; masked anisotropic streak blur (2 vertical + 1 short horizontal pass, half res, only reflective pixels gather) + full-res sharp trace for standing water; per-pixel normal hash jitter and time-varying SSR jitter removed (flicker probe ref view events 192 -> 35, regionMax 15.9 -> 3.9); luminance knee on the rough film. Street mirror 0.85x + 4x MSAA on high (runtime-tunable post.mirror.scale/.samples). Wet pass GPU at 1280x720: ref 1.00 -> 1.31 ms, grant 0.81 -> 1.09 ms (dev/road2shots.js __road2Wet). Asphalt (roadwear.js): warm neutral, albedo 0x8a, dry roughness +0.3 (~0.82) + street-canyon spec occlusion (was a blue sky sheen), block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy for asphalt/concrete/paving; marking chips fade by pixel footprint. Asphalt031 is already ambientCG 4K (no download). Sacramento St (concept framing) is oneway=1 in OSM -> white dashed lane line, no double yellow (by design). Shots: shots/road2_vs_ref.jpg, road2_pairs.jpg. Open: mid-street grey veil under bright white lamps in rain; mission puddles less crisp than before (film streaks).

Road 3 10/2 (user: fix the open items): rain veil = lampmap.js broad lamp sheen (direction-less specular over the whole pool, > half of a rainy Market road's brightness) -> x(1 - 0.9 wet); reflections stay as streaks (wetstreaks + SSR). Puddle mask post.js: standing water only (gloss 0.989..0.994; the old 0.8..0.97 ramp made the glossiest damp film half-puddle and blurred puddle rims) -> roughness 0.02 = unblurred trace. regress_shots.js chase views now start in the car. Wet pass GPU 1280x720: ref 1.20 ms, grant 0.98, lamp 0.87. Flicker: lamp_rain (Market) jumps = traffic hitting the parked player car (flk_road3_lampcatch_0.jpg), not rendering. Sheet: shots/road3_sheet.jpg.

People round 2 (10/03, shots/peds2_sheet.jpg = before/after): props = tools/blender/peds/build_props.py -> peds/props.glb, runtime
src/game/peds/props.js (HeldProps on the hand bones: phone screen out of the palm, open umbrella left hand (rain > 0.3), furled umbrella /
bag / briefcase hanging with a lagging swing, cup in the right hand with the drink-idle arm; p.carry by crowd style in sys_peds).
Far crowds = src/game/peds/crowd.js (one instanced draw, 8 views x 8 gait phases of 16 avatars, dev/crowd_bake.js + tools/crowd_bake.mjs ->
peds/crowd_{alb,nrm}.png|dds; agents on block sidewalk rings 118-430 m from the camera, dithered 132-158 m hand-off; ?nocrowd = off).
Animations: tools/blender/peds/build_clips_extra.py appends Rocketbox sit-down / stand-up (car seat), CMU get-up back / front, falls, jump
(cmu.py = ASF/AMC reader + retarget onto Bip01 via rest-pose swings) to clips.bin; realhuman.js one-shot modes (jump/fall/land/knocked/
getup/enterCar/exitCar) with an anchored rig (owners adopt getupRoot / exitYaw), src/game/peds/ragdoll.js (Verlet, 18 particles).
player.js: tryEnter exported, enter/exit timed by human.carTime, exit animation (move input cuts it after ~0.8 s), knock -> ragdoll + get-up,
jump fix (P.jumpT now skips the ground snap; every jump used to be swallowed). seatWorld() uses ~36 % of the roof height as the hip
point (spec.seat[1] is near eye level). Open: no car door opening (cars agent); impostors switch view in 45-deg steps (no blending);
peds' styleFor() Union Square constant (1400,-100) is v1-map coordinates.
Perf (10/04, 5191, Union Sq): far crowd ~2400 agents = +0.25 ms CPU (ped system 0.86 -> 1.10 ms) + ~0.4 ms GPU at street level; VRAM High 2.24-2.66 GB at the 5 memspots. Interiors round 3: see src/world/landmarks/PROGRESS_V2.md.
