# Changelog

Every change since the project went under version control (2026-09-30), newest first, with the files each one touched.
Work before that date (2026-09-26 to 09-30: the 1:1 map bake, streaming world, Festival/Outlaw/Free Roam modes,
first landmark waves, sky/weather, audio rebuild, Spotify radio) is summarised at the end.
Per-file history is in [FILES.md](FILES.md).

## 2026-10-04

### NEXT_SESSION / QUALITY: perf round 3 (tiles slicing, spikes, streaming, physics smoothing) notes, interleaved before / after, open items; boot stage text 'Decoding textures'
`d1a4a79`

<details><summary>Files (3)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`
- changed: `src/main.js`

</details>

### Perf r3: texwarm is conversion-only: big (>= 1 Mpx) <img> textures become ImageBitmaps off the main thread (started before any upload work so the title camera cannot draw them first), nothing is uploaded ahead of its first draw. Uploading early (every image texture: +0.5 GB; every big one: +0.35-0.45 GB at the memspots) filled VRAM with interior / prop library maps nothing drew; a scan of the scene graph for the textures in use cost ~1 ms per frame and more > 50 ms frames. Memspots 2.36-2.80 GB (?notexwarm 2.37-2.80); first-draw uploads are copies: facade_nrm 4K 27-36 ms (was 130-196 ms decode), 2K 8-12 ms (26-90)
`50d18b4`

<details><summary>Files (1)</summary>

- changed: `src/render/texwarm.js`

</details>

### Perf r3: Chinatown asphalt decal segments merged per 120 m cell (ct_street.js; multiply blend, no depth write: order-independent, same overlaps), the 200 m hiding per cell: 40-55 transparent draws -> a handful. Night-rain look A/B (shots/r3_ctmerge_ab.jpg): rows b / c mean 3.4 / 3.6 (peds, rain), row a differs by a headlight / spray pool around the car (additive light, not the decal). ?noctmerge
`ef382e1`

<details><summary>Files (2)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/world/landmarks/v2/ct_street.js`

</details>

### Perf r3: tiles cycle time-sliced (tilesphase.js: one generator per update, markUsedTiles and toggleTiles yield every 16 tiles once the frame's ~1 ms slice is spent; the visibility changes of a pass are queued and applied together so a parent hidden in one slice and its children shown in the next never leave a hole), a cycle starts every 5 frames or when the last ends; the tile view error runs without the library's per-tile plugin-list copies / closures (resetFrameState was the top allocation site, 8.3 MB/s). Drive FiDi / Chinatown: gtiles mean 1.5-1.7 -> 1.1-1.2 ms; a sharp turn / jump still finishes the cycle at once. Pan test 120 deg/s: FiDi 117 / 52 differing cells vs A/A noise 202 / 96. Dev: perf_rt2 slowExcess (parts of the >= p90 CPU frames minus the median ones), trace_cdp ALLOC=1 (sampling heap profiler)
`7fd3e16`

<details><summary>Files (4)</summary>

- changed: `dev/perf_rt2.js`
- changed: `dev/trace_cdp.mjs`
- changed: `src/world/v2/googletiles.js`
- changed: `src/world/v2/tilesphase.js`

</details>

### Perf r3: tiles phases start every 5th frame (A, B, C, two idle frames; was back to back): ~40 % less traversal CPU. dev/tiles_pan.js (free-camera pan, 160x90 readback per frame vs a full traversal on the real camera every frame): FiDi max / mean differing cells 115 / 51 (cycle 3) and 121 / 53 (cycle 5), A/A noise 202 / 93; Mission 584 / 332 and 1016 / 726, noise 761 / 500 and 1209 / 858 (tiles still streaming). gtiles.phCycle is runtime-tunable
`72ef212`

<details><summary>Files (2)</summary>

- added: `dev/tiles_pan.js`
- changed: `src/world/v2/googletiles.js`

</details>

### Perf r3: walk-in interior sites stay built once built at boot (hidden past HIDE_R as before) instead of being dropped past 450 m and rebuilt on the next approach (bodega: 56 ms, emit + vertex bake, while driving Mission). ?nointkeep
`3acfc6b`

<details><summary>Files (1)</summary>

- changed: `src/game/sys_interiors.js`

</details>

### Perf r3: texture uploads off the first-draw frame (render/texwarm.js): image textures are queued when they become ready and uploaded by renderer.initTexture from the frame loop (2.5 ms budget, first of a frame always), big <img> sources (>= 1 Mpx) converted to ImageBitmap first (createImageBitmap, flipY / premultiply baked, colour conversion none; ~4x cheaper upload), small photo-tile bitmaps skipped; boot flushes the queue behind the loading screen. Gone mid-drive: facade_nrm.png 164 ms, fac3_nrm 87, facade_ma 85, leaves_normal 74, city_nrm 58 ms uploads. Look A/B (shots/r3_all_ab.jpg, all r3 switches off vs on): only traffic / signals / peds / clouds differ. ?notexwarm
`f6379ba`

<details><summary>Files (2)</summary>

- changed: `src/main.js`
- added: `src/render/texwarm.js`

</details>

### Perf r3: map streaming slices. stream.js: 2.5 ms per frame and a load only starts when its provider's typical cost (EMA per provider and load / unload) still fits; the first job of a frame always runs (6 ms budget used to start a 5-8 ms load at 5.9 ms). bld-col: a tile's building colliders + yard fences are added over a few frames (<= 1.2 ms each, nearest pending tile first; range 600 m) instead of 5-11 ms in the load. Kit cell bounds come from the build worker (v2detail pack bb; same numbers). ?nostreamslice
`750fa36`

<details><summary>Files (3)</summary>

- changed: `src/world/facade/v2city.js`
- changed: `src/world/facade/v2detail.js`
- changed: `src/world/v2/stream.js`

</details>

### Perf r3: physics catch-up smoothing (vehicle/sim.js): steps per frame capped at the recent need (EMA of dt / h, rounded up, >= 2), the rest stays in the accumulator (<= 8 steps as before) and is worked off over the next frames; interpolation alpha clamped to 1 while behind. FiDi 45 m/s drive: 5-6 step frames 78 -> 5. ?nosimsmooth
`500bd8f`

<details><summary>Files (1)</summary>

- changed: `src/vehicle/sim.js`

</details>

### Perf r3: hero-interior reflection probe without the compile freeze: one PMREM generator kept for every probe (warmed at install at the probe size; a new one per probe released and recompiled its shaders), the cube capture's draws go through shaderwarm (extra guarded scenes): a capture with materials still compiling is dropped and retried 250 ms later. Hobart lobby while driving FiDi: 84-112 ms frame -> 8 ms. ?nointprobe
`4c056cf`

<details><summary>Files (2)</summary>

- changed: `src/render/shaderwarm.js`
- changed: `src/world/interiors/hero_int.js`

</details>

### Perf r3: Google tiles traversal in three phases on consecutive frames (world/v2/tilesphase.js: A = markUsedTiles, B = leaves / visible / toggle, C = LRU hand-over, requests, scheduleUnload, update-after; traversal functions copied from 3d-tiles-renderer 0.5.3, the previous used set stays marked until C so no unload pass can evict on-screen tiles mid-cycle). Per-frame tiles cost 0.3-0.6 ms per phase instead of 4-12 ms every 3rd frame; a sharp turn / jump finishes the cycle at once. Look A/B (shots/r3_tilesphase_ab.jpg): only peds / signals / clouds differ. ?notilesphase. perfflags.js also registers the other round-3 switches (intprobe, simsmooth, streamslice, texwarm, intkeep)
`e506c0c`

<details><summary>Files (3)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/world/v2/googletiles.js`
- added: `src/world/v2/tilesphase.js`

</details>

### Dev: perf_rt2.js (real-time drive at #v= m/s: rAF interval histogram, frame CPU / gap / GPU timer / draw calls per frame, physics steps, per-part mean + max, attributed slow frames) and trace_cdp.mjs (Chrome trace of the same drive: outside-frame tasks by kind; SPIKE=1 V8 samples per long frame; PROF=1 in / out of frame() split)
`a3d8f4c`

<details><summary>Files (2)</summary>

- added: `dev/perf_rt2.js`
- added: `dev/trace_cdp.mjs`

</details>

### NEXT_SESSION / QUALITY: perf round 2 (cars) notes, measurements, open items
`14bef88`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Perf r2: street cars share their lamp + lens materials per model and light state (head / brake / reverse / siren bits: the lamp uniforms are a pure function of them), so the renderer no longer refreshes a per-car lamp material in the main, probe and shadow passes; the in-car view keeps the car's own. Staged night A/B (shots/r2_carlampshare_night.jpg): identical lamps, only a walking ped differs. ?nocarlampshare = A/B
`c1d20b8`

<details><summary>Files (2)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/vehicle/models.js`

</details>

### Perf r2: far street cars with merged wheels also take their four wheel pivots (pivot / spin / wheel / caliper) out of the graph while at LOD 2 (applied from setLights during the car's sync, never inside LOD.update, which runs while the renderer walks the car's children). FiDi scene nodes 3739 -> 3097 (car nodes 1121 -> 491); 700-frame drives: draw calls FiDi 589 -> 430, Twin Peaks 551 -> 392, Sunset 759 -> 593. Under ?nocarfarwheels
`8583d68`

<details><summary>Files (1)</summary>

- changed: `src/vehicle/models.js`

</details>

### Perf r2: street cars past 75 m (lean LOD 2): the four wheels at rest are merged into the body details (same material; positions / normals transformed, mirrored wheels' winding flipped back), the wheel meshes hide at that level: 9 -> 5 meshes per far car (staged 8-car street: meshes per car 13,9,9,9,9,9,9,9 -> 13,9,9,5,5,5,5,5). At 75 m+ a wheel is ~8 px: spin / steer / suspension travel are sub-pixel; staged 4K A/B (shots/r2_carfarwheels_crop.jpg) shows no difference beyond the A/A foliage noise. ?nocarfarwheels = A/B
`78c4ced`

<details><summary>Files (2)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/vehicle/models.js`

</details>

### Perf r2: street-car warm-up behind the loading screen (game/sys_carwarm.js): every TRAFFIC_MIX model's procedural build (P, lamp anchors, fallback geometry), its baked asset, the AO atlas upload (renderer.initTexture) and the far shadow proxies. First spawn of a model mid-drive (new Vehicle) 26-43 ms -> 0.1-0.5 ms (kodiak, elektra, stallion18, police). main.js: comment touch so the watch build re-scans the sys_* glob. ?nocarwarm = A/B
`d3bd755`

<details><summary>Files (4)</summary>

- added: `src/game/sys_carwarm.js`
- changed: `src/main.js`
- changed: `src/render/perfflags.js`
- changed: `src/vehicle/models.js`

</details>

### Perf r2: car physics ground probes: the wheel ray's first probe and the 20 chassis corner probes ask for the height only (the normal / surface taps, 4 more terrain samples + the surface raster, are taken only where they are read: a refined wheel contact or a corner below ground); SAT vs static colliders without per-collider arrays. Bit-identical trajectories (fresh body, 1800 scripted steps, physlite on / off: every state value equal to 17 digits); 7.0-7.7 -> 4.5-5.9 us per body step. ?nophyslite = A/B
`6027db5`

<details><summary>Files (2)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/vehicle/physics.js`

</details>

### Perf r2: far street cars (LOD 1 / 2) cast the sun shadow from one depth-only proxy per level (lean body paint + details + the four wheels at rest, positions merged once per asset; bounds parked out of every colour pass, environment.js caster test via userData.shadowSphere like the hero proxies). Shadow draws (both cascades, same frame, in-session A/B) FiDi 168 -> 82, Sunset 224 -> 120, Mission 211 -> 111; look A/B shots/r2_carshadowproxy_ab.jpg: only moving peds differ. ?nocarshadowproxy = A/B
`0345c33`

<details><summary>Files (2)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/vehicle/models.js`

</details>

### Perf r2: lean street cars. Traffic / AI / parked-hit cars (Vehicle role != player) mount their LOD levels with the shut front doors merged into the body per material (asset.lean, built once when the GLB arrives), only the drawn LOD level hangs in the graph, static sub-nodes skip the per-frame matrix recompose. A door that opens (carjack, getting in) remounts the hinged split levels. FiDi: car nodes 2894 -> 1121, car meshes 1728 -> 555; draw calls 691 -> 579 (FiDi), 825 -> 671 (Sunset). ?nocarlean = A/B
`46ea26f`

<details><summary>Files (3)</summary>

- changed: `src/render/perfflags.js`
- changed: `src/vehicle/cars.js`
- changed: `src/vehicle/models.js`

</details>

### Perf r2: car probe renders with the last main render's world matrices (scene.matrixWorldAutoUpdate off during the cube face: renderer.render walked the whole ~5.5 k node graph a second time each frame). Probe CPU (sys3) 3.0-3.5 -> 1.6-1.7 ms; fixed-view A/B (perf_views_ab, FiDi + Mission) frame CPU -1.0 ms mean. ?noprobeumw = A/B
`032b7e1`

<details><summary>Files (2)</summary>

- changed: `src/render/carprobe.js`
- changed: `src/render/perfflags.js`

</details>

### NEXT_SESSION / QUALITY: perf pass 10/4 (measurements, switches, open items for the cars owner)
`8238972`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Perf: tiles traversal every 3rd frame on a 10 deg-padded frustum (a ~5 ms traversal); tile content matrices static after load (no recompose of ~600 tile nodes per scene.updateMatrixWorld). Pan test 240 / 120 deg/s: max 7 / 4 differing cells of 14400 vs a forced per-frame traversal (A/A noise 9)
`b1ab294`

<details><summary>Files (1)</summary>

- changed: `src/world/v2/googletiles.js`

</details>

### Perf: hero landmark shadow proxies: the casting slots of a hero LOD are merged into one position-only depth proxy per material side (slot meshes stop casting); the proxy's geometry bounds are parked out of every camera's view and environment.js' caster test uses userData.shadowSphere (far cascade wrapped too, no view cull). Chinatown shadow draws 434 -> 142; look A/B (shots/perf_heroshadow_ab.jpg) identical shadows. ?noheroshadow = A/B
`0a5722a`

<details><summary>Files (3)</summary>

- changed: `src/render/environment.js`
- changed: `src/render/streetmirror.js`
- changed: `src/world/landmarks/v2/hero_lm.js`

</details>

### Dynamic resolution: a step down is a trial, kept only if the smoothed frame interval improves >= 6 % within ~2 s (else undone, no step down for 20 s). The GPU timer counts the GPU waiting on a CPU-bound frame, so on High (CPU-bound, ~21-26 ms frame CPU) it sank to minScale 0.65 for no frame-rate gain; real-time runs (dev/perf_rt.js dynres=1): every trial undone (24.9 -> 24.4 ms, 31.2 -> 31.3), native 1080p kept
`8481ae8`

<details><summary>Files (2)</summary>

- changed: `dev/perf_rt.js`
- changed: `src/game/quality.js`

</details>

### Dev: perf_rt.js real-time frame rate (the game's own rAF loop driving the world2_perf routes; car3cdp HB_UNCAP=1 uncaps rAF)
`1723f8b`

<details><summary>Files (2)</summary>

- changed: `dev/car3cdp.mjs`
- added: `dev/perf_rt.js`

</details>

### Perf: Google tiles traversal every other frame (3-4.5 ms CPU) on a camera widened by 8 deg per side at the same pixel scale (same LOD), tile meshes frustum-culled by three every frame; a turn > 4 deg, fov / aspect change or jump traverses at once. Fixed-view A/B CPU -2.4 ms (Mission / FiDi); pan test (240 deg/s, throttled vs forced traversal per frame) differs no more than the A/A noise (max 6 vs 9 of 14400 cells). ?notilesthrottle. perf_views_ab.js: dev-only nocars / noprobe arms (traffic cars cost -2.4 ms CPU / -1.2 GPU, car probe -1.9 / -2.5 at the same views)
`9659fd1`

<details><summary>Files (3)</summary>

- changed: `dev/perf_views_ab.js`
- changed: `src/render/perfflags.js`
- changed: `src/world/v2/googletiles.js`

</details>

### Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)
`fc00ce2`

<details><summary>Files (7)</summary>

- changed: `dev/perf_prof.js`
- changed: `dev/perf_prof_run.js`
- changed: `src/render/environment.js`
- changed: `src/render/perfflags.js`
- changed: `src/render/water.js`
- changed: `src/world/landmarks/v2/ct_street.js`
- changed: `src/world/landmarks/v2/hero_lm.js`

</details>

### Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
`0c76264`

<details><summary>Files (9)</summary>

- added: `dev/perf_ab.js`
- changed: `dev/perf_prof.js`
- changed: `dev/perf_prof_run.js`
- added: `dev/perf_views_ab.js`
- changed: `src/game/sys_interiors.js`
- changed: `src/main.js`
- added: `src/render/perfflags.js`
- added: `src/render/shaderwarm.js`
- changed: `src/world/v2/googletiles.js`

</details>

### Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)
`3125624`

<details><summary>Files (6)</summary>

- added: `dev/cpuprof_cdp.mjs`
- added: `dev/perf_diff.py`
- added: `dev/perf_prof.js`
- added: `dev/perf_prof_run.js`
- added: `dev/perf_shots.js`
- changed: `src/world/v2/googletiles.js`

</details>

### NEXT_SESSION / QUALITY: cars pass 4 (doors, interior materials, light bars, 45 bodies) notes + checks
`b9878c1`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Terrain: inside yards skip the natural layers (grass / forest / sand / rock taps + noise) that the yard patchwork replaces. Idle-machine GPU A/B at 1920x1080 (dev/world2_gpu.js, 2 rounds x 3 views, medians): yard views 13.6 vs 13.7 ms (min-of-reps), within run-to-run noise (+-3 ms)
`703022a`

<details><summary>Files (2)</summary>

- added: `dev/world2_gpu.js`
- changed: `src/render/terrainmat.js`

</details>

### Cars pass 4 (assets): all 57 loft bodies rebuilt through the detail / aero / door passes (garage bodies with level H, 2K AO atlases), hinged front doors on 53 (no doors: bus, cable car, picknick, buggy, kestrel), interior material classes, LED tail light bars; cars.json carries the door hinges; AO packed (texpack --only cars/). 37 -> 81 MB on disk (lazy per id).
`a156f3a`

<details><summary>Files (172)</summary>

- assets: `public/assets/cars/` (172 files)

</details>

### Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies
`cb8e3ac`

- Doors: tools/blender/car_door.py splits the driver / passenger front doors out of the built body (outline from the JS door-seam records, bmesh knife along the seams / sill / belt, paint + door glass + outer trim + mirror islands + the cabin tub's door card) into <level>_<kind>__dl/__dr nodes with shut faces (door front / rear / bottom + top cap, body-side hinge pillar / B-pillar / sill) and a hinge per side in cars.json. Runtime (models.js) hangs them on hinge pivots: visual.openDoor(side, t), Vehicle.openDoor / releaseDoor (car swings it shut once the person is clear of the arc, after 3.5 s, or when it moves). player.js door hooks: opens with the enter clip (yanked open on a carjack, while the NPC driver is thrown out), stays open while sliding in, pulled shut once seated; exit opens as the body rises and hands the door back to the car. Parked instanced geometry folds the door parts back in.
- Interior: car_hero.py interior finishes carry a material class (metalness >= 2): soft-touch, leather, brushed aluminium, piano black (screen bezel + shifter panel), fabric / alcantara, carpet; lighter real-world trim albedos. models.js INTERIOR_GLSL: grain bump / roughness, brushed streaks, piano lacquer, grazing sheen. Cabin balance: CABIN.gain 3.2 -> 6, cabin AO softened 0.5 -> 0.7, more bounce fill; centre screen dimmed + matte (it burned to white).
- Tail light bars (TAILBAR art: ev, elektra, coupe, hellion, senkou, vanguard, aska, celerite, munja) are their own lamp group LAMP.BAR = 10: saturated even LED strip with a hot core, 5.5 running at night (blooms), 9 braking; car_hero no longer turns the bar into a dim recessed tail unit.
- SCULPT terms for the 42 other bodies with arches (kugel / kestrel: fender shells, cable car: custom); getModelSpec physics fields identical for all 58 (dev/car4_spec.mjs; only camera / livery anchors moved <= 2 cm).
- cars.py: every body except the cable car gets the detail + aero + door passes, garage bodies get level H; HB_STAGE=<dir> builds into a staging folder. Review: tools/blender/car_door_preview.py, car_glb_sheet.py; shots dev/car4shots.js + car4_sheet.py.

<details><summary>Files (12)</summary>

- added: `dev/car4_sheet.py`
- added: `dev/car4_spec.mjs`
- added: `dev/car4shots.js`
- changed: `src/player/player.js`
- changed: `src/vehicle/cars.js`
- changed: `src/vehicle/carshade.js`
- changed: `src/vehicle/models.js`
- added: `tools/blender/car_door.py`
- added: `tools/blender/car_door_preview.py`
- added: `tools/blender/car_glb_sheet.py`
- changed: `tools/blender/car_hero.py`
- changed: `tools/blender/cars.py`

</details>

### NEXT_SESSION: world round 2 notes; dev/world2_flick.js (real-time flicker probe on the yard views + regression set), dev/world2_perf.js (1920x1080 district drives: frame / GPU / VRAM)
`954f475`

<details><summary>Files (3)</summary>

- changed: `NEXT_SESSION.md`
- added: `dev/world2_flick.js`
- added: `dev/world2_perf.js`

</details>

### Yard ground: fewer watered lawns (6-18 % by neighbourhood) and those a little drier in the fall; world2 yards_street view = a Richmond block from back-window height
`dbb6485`

<details><summary>Files (2)</summary>

- changed: `dev/world2_shots.js`
- changed: `src/world/grass/yard_glsl.js`

</details>

### Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.
`6395401`

<details><summary>Files (6)</summary>

- added: `dev/world2_run.js`
- added: `dev/world2_shots.js`
- changed: `src/world/facade/v2build.js`
- changed: `src/world/facade/v2city.js`
- changed: `src/world/facade/v2worker.js`
- changed: `src/world/facade/v6yard.js`

</details>

### Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.
`3c697b8`

<details><summary>Files (8)</summary>

- changed: `src/render/terrainmat.js`
- changed: `src/world/grass/capture.js`
- changed: `src/world/grass/glsl.js`
- changed: `src/world/grass/index.js`
- added: `src/world/grass/yard_glsl.js`
- added: `src/world/v2/lotframe.js`
- changed: `src/world/v2/terrainmesh.js`
- changed: `src/world/v2/world2.js`

</details>

### Peds on the 1:1 map: tourist spots + tourist zones by real lat/lon (Union Square plaza, Dragon Gate, Wharf sign, Pier 39, Ferry plaza, Lombard, Painted Ladies, Palace, Coit, City Hall, Twin Peaks, Dolores, Castro Theatre, Balmy Alley; v2 had no spots and the Union Square tourist boost used old-map x/z), plaza footways at the sights as busy walker paths, spot sampling allowed on plazas inside a block's lot line (not yards). Census (dev/world2_shots.js __w2Crowds, 90 m): Union Sq 57 (10 at the spot, 24 tourists), Wharf 55, Chinatown 67, Castro 59, Mission 58, Ferry Building 0 -> 54.
`01d64e8`

<details><summary>Files (2)</summary>

- changed: `src/game/peds/nav.js`
- changed: `src/game/sys_peds.js`

</details>

### NEXT_SESSION / QUALITY: gameplay + nature round 3 (off-road routing / AI, police spawns, Pier 39 deck, ice plant / lupines, rain flicker measurement)
`bbcbc13`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Rain flicker probe: __flickRT still / noRain / rows options; dev/flicker_map.js per-pixel temporal std map. Measured road fix 1 (03c10d9) vs road fix 3 (HEAD) render files on the concept framing, same conditions: frame-region probe (traffic + peds off) max 3.1-3.7 vs 3.0-3.6, road-row mean |diff| 0.357 vs 0.306; std map (grain off, rain particles hidden, frozen hour) lower half 0.26-0.27 vs 0.28-0.35 luma: no wet-pass regression beyond run-to-run noise. The 9-11 / 47-121 readings came from moving traffic (a passing car: region jumps 38-180) and the rain streak particles crossing lit tower windows (regions 5-6,1); softer puddle mask + weaker ripples measured no better (0.36-0.39) and were not kept. Post / lampmap unchanged.
`2a850c7`

<details><summary>Files (2)</summary>

- added: `dev/flicker_map.js`
- changed: `dev/flicker_rt.js`

</details>

### Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
`b9d1ee2`

Stucco box-bay oriels (Avenues 50 %, Marina 32 %) + Mediterranean arched windows, Edwardian-heavy inner Richmond,
district hip / gable share for houses without an OSM roof (Avenues pitched 10 -> 28 %), no two neighbours in the same
paint (6,991 repainted), 1-2 storey setbacks on 30-55 m downtown blocks, varied cornices, fewer side-wall murals.
v6yard.js: per-lot back yards from the party raster (fences on the lot lines, decks, patios, paved yards, ground-cover
patchwork, beds, sheds) and roof decks; back-garden trees 6 -> 9-15 %. FAR pitched roofs without soffits (2.72 -> 2.52 M
tris). ?nov6 = A/B. Headless harness dev/bld6_*.js (dev/car3cdp.mjs). Shots shots/bld6_*.

<details><summary>Files (21)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`
- added: `dev/bld6_alt.js`
- added: `dev/bld6_close.js`
- added: `dev/bld6_dbg.js`
- added: `dev/bld6_gpu.js`
- added: `dev/bld6_perf.js`
- added: `dev/bld6_reg.js`
- added: `dev/bld6_run.js`
- added: `dev/bld6_stats.js`
- added: `dev/bld6shots.js`
- changed: `src/world/facade/PROGRESS_V2.md`
- changed: `src/world/facade/v2build.js`
- changed: `src/world/facade/v2detail.js`
- changed: `src/world/facade/v2geom.js`
- changed: `src/world/facade/v2lots.js`
- changed: `src/world/facade/v2plan.js`
- changed: `src/world/facade/v2worker.js`
- changed: `src/world/facade/v5mass.js`
- added: `src/world/facade/v6yard.js`
- changed: `src/world/props/v2.js`

</details>

### Ground cover: ice plant = closed fleshy yellow-green / glaucous mats (wider finger leaves, 1.6x density, shallow base shade, no dry-grass tip bleach: the 0.35 base AO under warm light read olive-brown), red-tinged tips + whole red-bronze mats by patch, broad magenta flowers in flowering patches; lupines = slender spindle racemes (~16 x 2 cm on a shorter stem) with whorls of small florets (dark gaps, pale banner flecks, paler buds at the tip) in a deeper purple, less backlit translucency (were solid 13 cm cones). dev/grass_shots.js: CPU port of the flower / ice noise to find patches + review views. Shots (untracked shots/): fix_{iceplant,lupine}_{before,after}.jpg (top 18:20 golden hour, bottom 12:30).
`be044ba`

<details><summary>Files (3)</summary>

- added: `dev/grass_shots.js`
- changed: `src/world/grass/glsl.js`
- changed: `src/world/grass/layers.js`

</details>

### Pier 39: drivable plank deck everywhere it is drawn - every run of deck cells standing above the terrain (rim, overhang over the water, dock fingers, the 1.6-2 m cells the raster flatten skipped) becomes a flat terrain deck strip (2 m, kind 'pier', 1201 strips; groundAt ~0.23 us/call at the pier). Deck cells with physics ground > 10 cm under the planks 2772 / 18327 -> 1 (576 -> 0 that dropped to the water); drive test over 12 rim cells: 12 sank under the planks (to -2.9 m) -> 0. Shots (shots/ is untracked): fix_pier39_{before,after}.jpg.
`490dab1`

<details><summary>Files (1)</summary>

- changed: `src/world/props/pierdeck.js`

</details>

### Police: route-aware pursuit spawns - one-way streets only in their legal direction (random dir put units nose-first against the flow), two-way spawns face the end with the shorter legal A* route, route <= 1.4x + 30 m and <= 14 s at 12 m/s, the shortest of the first 4 valid spots, first leg clear of building colliders (Falmouth St overhangs pinned a unit). dev/police_probe.js: 6 downtown spots by real lat/lon, parked suspect, 2 stars.
`852703f`

Probe (first unit < 30 m): before 14/18 runs arrived within 25 s, median 6.2 s, 23/60 spawns facing the wrong way on a one-way; after 24/24 arrived, median 4.8 s (fidi 5.2-6.7, unionsq 4.6-20.6, tenderloin 2.9-15.2, soma 7.6-8.7, chinatown 2.3-4.9, northbeach 2.2-2.5), 0/83 wrong-way. Outlaw loop (bust / evade / carjack / wasted) unchanged.

<details><summary>Files (2)</summary>

- added: `dev/police_probe.js`
- changed: `src/game/sys_police.js`

</details>

### NEXT_SESSION / QUALITY: people round 2 + interiors round 3 notes, perf / VRAM numbers
`ec737ee`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg
`0ac6cf2`

<details><summary>Files (114)</summary>

- changed: `src/world/landmarks/PROGRESS_V2.md`
- changed: `src/world/landmarks/v2/hero_sites.js`
- changed: `tools/blender/hero_int_dress.py`
- changed: `tools/blender/hero_int_w5.py`
- changed: `tools/blender/hero_int_w6.py`
- changed: `tools/blender/int_assets.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/landmarks/` (107 files)

</details>

### Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.
`e1f7e96`

Rival respawns per race (gameplay_audit, mean of 2 runs, before -> after): Headlands Dirt 42 (player stuck) -> 5, Headlands XC 118 (timeout) -> 7, Twin Peaks XC 59 -> 0, GG Park XC 28 -> 3, Presidio XC 30 -> 1, Lands End XC 17 -> 3, Presidio Trails 3 -> 2, Ocean Beach / Crissy / Polo 0 -> 0. All 10 off-road and 26 on-road events finish on the autopilot.

<details><summary>Files (6)</summary>

- changed: `dev/gameplay_audit.js`
- changed: `src/game/drivers.js`
- changed: `src/game/festival/catalog.js`
- changed: `src/game/festival/festival.js`
- changed: `src/game/festival/racing.js`
- changed: `src/game/festival/util.js`

</details>

## 2026-10-03

### People 2d: phone sits on the palm with the screen out of it (Bip01 hands: palm +Z, left frame mirrored in Y), calmer night screen glow; shot harness: texting close-up + over-shoulder, drone crowd view with zoom inset, studio car / knock / jump strips, sheet
`dc0aa6e`

<details><summary>Files (3)</summary>

- changed: `dev/peds2_sheet.py`
- changed: `dev/peds2_shots.js`
- changed: `src/game/peds/props.js`

</details>

### People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off
`e911b3a`

<details><summary>Files (14)</summary>

- added: `dev/crowd_bake.js`
- changed: `dev/peds2_shots.js`
- added: `src/game/peds/crowd.js`
- changed: `src/game/peds/realhuman.js`
- changed: `src/game/sys_peds.js`
- added: `tools/crowd_bake.mjs`
- changed: `tools/texpack.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/peds/` (5 files)
- assets: `public/assets/texpack.json/` (1 file)

</details>

### NEXT_SESSION / QUALITY: cars pass 3
`84fdab5`

<details><summary>Files (2)</summary>

- changed: `NEXT_SESSION.md`
- changed: `QUALITY.md`

</details>

### People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
`2c844f6`

<details><summary>Files (8)</summary>

- changed: `dev/peds2_sheet.py`
- changed: `dev/peds2_shots.js`
- added: `src/game/peds/props.js`
- changed: `src/game/peds/realhuman.js`
- changed: `src/game/sys_peds.js`
- added: `tools/blender/peds/build_props.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/peds/` (1 file)

</details>

### Cars in-car view: window-lit cabin (street probe / sky IBL sampled along the horizon-bent normal x CABIN.gain 3.2, baked AO softened in the cabin), gauges + screen x2.5 in cockpit, camera at the real driver eye point (no pulled-back / inboard offset), cockpit FOV 54 (+6 with speed)
`4dd68cb`

<details><summary>Files (3)</summary>

- changed: `dev/car3cdp.mjs`
- changed: `src/player/camera.js`
- changed: `src/vehicle/models.js`

</details>

### People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
`b51235b`

<details><summary>Files (11)</summary>

- added: `dev/peds2_sheet.py`
- added: `dev/peds2_shots.js`
- added: `src/game/peds/ragdoll.js`
- changed: `src/game/peds/realhuman.js`
- changed: `src/game/sys_peds.js`
- changed: `src/player/player.js`
- added: `tools/blender/peds/build_clips_extra.py`
- added: `tools/blender/peds/cmu.py`
- assets: `public/assets/ASSET_LICENSES.md/` (1 file)
- assets: `public/assets/peds/` (2 files)

</details>

### Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)
`42da11e`

<details><summary>Files (46)</summary>

- added: `dev/car3cdp.mjs`
- added: `dev/car3shots.js`
- changed: `src/vehicle/models.js`
- added: `tools/blender/car_body.py`
- added: `tools/blender/car_shape_sheet.py`
- changed: `tools/blender/cars.py`
- assets: `public/assets/cars/` (40 files)

</details>

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
