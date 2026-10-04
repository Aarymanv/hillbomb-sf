# Files

Every source file in the repository: what it is (from its header comment) and every change to it since version control
began (2026-09-30), oldest first. Asset folders are listed once each with their history. See [CHANGELOG.md](CHANGELOG.md).


## `.claude`

### `.claude/launch.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `(root)`

### `CONVENTIONS.md`
HILLBOMB: San Francisco. Engineering conventions

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `NEXT_SESSION.md`
HILLBOMB status (2026-09-28 late)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `f53a3d2` changed: NEXT_SESSION: regression / strobing notes
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `999dcf5` changed: dev: memspots result posting + throttle-proof waits, gpu.js waits; NEXT_SESSION VRAM pass notes
- 2026-10-01 `c750d23` changed: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper
- 2026-10-01 `4346943` changed: Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `d3f79ed` changed: Buildings v5: notes (PROGRESS_V2 / NEXT_SESSION)
- 2026-10-01 `e6d3b41` changed: NEXT_SESSION / QUALITY: gameplay pass notes
- 2026-10-01 `1288a60` changed: NEXT_SESSION / QUALITY: gameplay round 2
- 2026-10-02 `118b6be` changed: Road 2: before/after shots (shots/road2_*), concept sheet shots/road2_vs_ref.jpg, notes; harness: unthrottled settle/ctShot, wet-pass GPU timer
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `QUALITY.md`
HILLBOMB quality scorecard

- 2026-09-30 `a73c3cc` added: Add QUALITY.md scorecard and regression rules
- 2026-10-01 `86fac52` changed: QUALITY: handling + people scores
- 2026-10-01 `b2f01d7` changed: QUALITY: cars, perf, sound status
- 2026-10-01 `32eb6f0` changed: QUALITY: sound status
- 2026-10-01 `2e56302` changed: QUALITY: interiors status
- 2026-10-01 `6265f18` changed: QUALITY: buildings v5 status
- 2026-10-01 `69731f0` changed: QUALITY: gameplay score after the 10/1 pass
- 2026-10-01 `1288a60` changed: NEXT_SESSION / QUALITY: gameplay round 2
- 2026-10-01 `0543bf1` changed: Chinatown: lantern halos toned down and kept out of the street mirror, comparison sheet (shots/chinatown_vs_ref.jpg), review views (ref / refday / drives), QUALITY note
- 2026-10-02 `118b6be` changed: Road 2: before/after shots (shots/road2_*), concept sheet shots/road2_vs_ref.jpg, notes; harness: unthrottled settle/ctShot, wet-pass GPU timer

### `README.md`
HILLBOMB: San Francisco

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `TESTING.md`
Testing and capturing HILLBOMB in the real game

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `dev`

### `dev/audio.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.js`
HILLBOMB audio bench: interactive test page for src/audio (sample-based engines, SFX, ambience, radio, mix).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `dev/audio.pipeline`

### `dev/audio.pipeline/build_family.py`
build_family.py SPEC.json -> fam/<name>/loops.npz + fam/<name>/info.json + preview renders

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/build_manifest.py`
Merge engine sprites + pass-bys (mine) + SFX/ambience/UI fragment + music fragment into public/assets/audio/manifest.json and the "Audio" section of public/assets/ASSET_LICENSES.md.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `dev/audio.pipeline/eng.py`
Engine sample pipeline: ridge-track an engine order through a sweep, de-chirp windows to constant pitch, cut cycle-aligned seamless loops, and pack them into a per-family sprite.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/extra_sfx.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/engines_manifest.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/extra_fragment.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/freesound_meta.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `dev/audio.pipeline/fragments/music_fragment.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/passby_manifest.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/sfx_fragment.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/fragments/world_fragment.json`

- 2026-10-01 `35be7a7` added: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `dev/audio.pipeline/fs.py`
Freesound helper: CC0-filtered search, per-sound license verification, hq preview download. Usage: python fs.py search "query words" [pages]      -> prints id | user | dur | sr | downloads | rating | title python fs.py verify ID [ID...]    ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/loopkit.py`
Shared audio processing helpers for HILLBOMB assets (decode, loudness, loops, one-shots, encode, analysis).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/measf.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/pack_engines.py`
Pack engine families: tilt-correct (zero-phase circular EQ keeps loops seamless), loudness-normalise, write sprite mp3 [pad][loop][pad]... and a JSON block for the audio manifest.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/passby.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/peaks.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/scan.py`
quick look at a source: channels, duration, 1 s loudness profile (dB RMS) and the steadiest windows of a given length usage: python scan.py src/ID.mp3 [window_s]

- 2026-10-01 `35be7a7` added: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `dev/audio.pipeline/spec_bus.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/spec_diesel.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/spec_flat4.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/spec_v10.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/spec_v8.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tilt.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_183654_23.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_183654_4.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_205503_11.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_205503_3.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_213665_14.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_213665_2.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_273334_0.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_273334_22.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_457560_1.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_457560_4.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_457560_6.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/tracks/trk_457560_8.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/trk2.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.pipeline/world_sfx.py`
World sound pass (10/1): district beds, road surfaces, Muni / cable car one-shots, footsteps. All sources Freesound CC0 (verified by fs.py get). Writes public/assets/audio/{amb,loops,sfx}/... and fragments/world_fragment.json

- 2026-10-01 `35be7a7` added: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla


## `dev`

### `dev/audio.scenarios.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.scenarios.js`
HILLBOMB audio: offline scenario renderer for measurements (loudness, peaks, clicks, spectra). Drives the public audio API exactly like the game does (createEngine/update/setSpatial, tires, wind, impacts, radio) inside an OfflineAudioContex...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `dev/audio.spotify.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.spotify.js`
Browser bench for the Spotify station: a mock game object (G) with a mock radio implementing the external-station contract, then the real sys_spotify install(). Nothing here signs in: "dry run" shows the authorize URL only.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/audio.spotify.test.mjs`
Unit tests for the Spotify integration. Zero deps: `node dev/audio.spotify.test.mjs` (Node 20+). fetch, storage, clock, sleep and the SDK device are mocked; no network, no credentials.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/bld3shots.js`
dev-only capture helper for the buildings v3 pass (not shipped). Paste into the game page (5191 does not serve dev/): await __bld3('before', ['sunset'], ['gold', 'night'])  ->  shots/bld3_<place>_<mode>_<suffix>.jpg Cameras are fixed from t...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/bld4shots.js`
dev-only capture helper for the buildings v4 pass (lighting / grounding / street fronts). Load in the game page: eval(await (await fetch('http://127.0.0.1:5190/dev/bld4shots.js')).text()) await __bld4('before', ['sunset'], ['noon', 'night']...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/bld5shots.js`
dev-only capture helper for the buildings v5 pass (massing variety / near shadows / pop cross-fade). Game page (5191 tab): await import('http://127.0.0.1:5190/dev/bld5shots.js') await __bld5('before')                 -> shots/bld5_<place>_<...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `aaa9e34` changed: Buildings v5: near sun-shadow cascade on by default (high/ultra), detail-only casters + every-other-frame refresh
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `dev/buildings.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/buildings.js`
Buildings preview: terrain + streets + blocks + city meshes + buildings with the game's environment and post chain. URL: /dev/buildings.html?x=150&z=420&h=16  (camera start, hour). Dev hooks match the game: __look, __frames, __shot.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/buildings2.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/buildings2.js`
Buildings v2 preview (1:1 OSM city): map data + terrain2 + a simple streamed terrain mesh + the buildings v2 providers, with the game's environment and post chain. URL: /dev/buildings2.html?x=..&z=..&h=16 . Hooks: __look, __frames, __shot.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/car2perf.js`
dev-only: car pass 2 perf A/B with 45+ traffic cars. Load the game twice (default vs ?carbase=cars_old), then: await import('http://127.0.0.1:5190/dev/car2perf.js?' + Date.now()); __car2Perf().then(r => window.__c2p = r) Market Street downt...

- 2026-10-01 `c750d23` added: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper

### `dev/car2shots.js`
dev-only capture rig for the car body pass 2 (not shipped). In the game page: await import('/dev/car2shots.js?' + Date.now()); await __car2Shots('before', 'tora') Writes shots/car2_<hero_front|hero_rear|hero_side|cockpit|traffic|night>_<suf...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/cars.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/cars.js`
HILLBOMB car preview + lab. Renders ON DEMAND only (no animation loop unless ?anim=1). URL: ?car=muscle&view=f34 (single car), ?cars=a,b,c (row), ?lab (physics lab table), ?studio (garage studio look) Keys: [ / ] prev/next car, 1-7 views, L...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/carshots.js`
dev-only car capture rig (not shipped). In the game page: await import('http://127.0.0.1:5190/dev/carshots.js?' + Date.now()); await __carShots('before') Writes shots/car_<hero|wheel|traffic|parked|night>_<suffix>.jpg with fixed cameras (sa...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/cityshots.js`
dev-only capture helper for the facade agent (not imported by the game, not shipped). Paste into the game page via the browser JS tool (the test server does not serve dev/), then: await __cityShots('before', ['mission'], ['night', 'gold'])

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/collider_audit.js`
Dev collider audit: invisible obstacles (load in the game page: await import('http://127.0.0.1:5190/dev/collider_audit.js')). __colAudit({ r = 300 })          -> audit every static collider within r of the player (see classify below)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/ct_sheet.py`
Chinatown side-by-side sheet: the concept vs our same framing (night rain), daytime, drive-through (chase cam) frames.

- 2026-10-01 `272db80` added: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `dev/ctshots.js`
Chinatown hero set review views (tools/blender/hero_ctown.py). Load after sky_shots.js (needs __settle / __setWx): for (const f of ['sky_shots.js', 'ctshots.js']) await import('http://127.0.0.1:5190/dev/' + f) await __ctShot('wash', 'x')   ...

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `0543bf1` changed: Chinatown: lantern halos toned down and kept out of the street mirror, comparison sheet (shots/chinatown_vs_ref.jpg), review views (ref / refday / drives), QUALITY note
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `dev/flicker_probe.js`
Dev probe for night flicker / strobing (load in the game page: await import('/dev/flicker_probe.js')). __rb(w, h)            -> Float32Array luminance (0..255) of a w x h readback of the game canvas __flick(n)            -> steps n frames; ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/flicker_rt.js`
Real-time flicker probe (works in a hidden tab): drives the game's frame(dt) with the REAL elapsed time (MessageChannel loop, not rAF) so time-of-day, weather drift, IBL re-bakes, cloud shadows and every throttled update advance as they

- 2026-09-30 `9b6cda8` added: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `5aef278` changed: Fix night strobing: dress/lantern/nightdress tickers culled from the car-probe cube cameras (origin) on alternate frames; rain occlusion render exception-safe; lantern night colour deep red; dev/flicker_rt.js real-time flicker probe

### `dev/gameplay_audit.js`
Gameplay audit (dev). Load in a game page (5190 or 5191, ideally /?sandbox so the real save is untouched): await import('http://127.0.0.1:5190/dev/gameplay_audit.js?' + Date.now()) __gpRoutes()          every festival event / prologue / sto...

- 2026-10-01 `69c5690` added: dev: ?sandbox (saves in sessionStorage, real profile untouched) + dev/gameplay_audit.js (route sanity, event autopilot runs)
- 2026-10-01 `5b603cf` changed: Races: player respawn after 10 s of throttle with no route progress (rocking against a wall never tripped the speed test), respawn reasons counted (dev); abandoned ex-player cars > 700 m away are freed too; audit: UI sweep, story runner, worker-paced yields
- 2026-10-01 `e5c901d` changed: Race grid: slots clear of solid obstacles (re-checked once colliders stream in before the countdown); audit: Outlaw loop + prologue runners
- 2026-10-01 `ceacd8a` changed: Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car
- 2026-10-01 `0091c1a` changed: dev: gameplay audit keys on document (UI shell path), prologue segment probe, lighter event runs
- 2026-10-01 `0eae56c` changed: gameplay_audit: progress trace, fade nudge for fresh pages

### `dev/gpu.js`
dev-only GPU timing (EXT_disjoint_timer_query_webgl2): __gpu(n) median ms of n frames; __gpuAt(place) settles first

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `999dcf5` changed: dev: memspots result posting + throttle-proof waits, gpu.js waits; NEXT_SESSION VRAM pass notes

### `dev/hb_contact.js`
Dev: wheel-contact audit on real SF routes (load in the game page: await import('http://127.0.0.1:5190/dev/hb_contact.js?'+Date.now())). await __hbContact()   -> drives the player's car (direct 120 Hz body steps, pure-pursuit, no rendering)...

- 2026-09-30 `8c2adff` added: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring

### `dev/hb_handling_probe.mjs`
Headless handling probe: node dev/hb_handling_probe.mjs [car ...]  (flat world, 120 Hz sim, keyboard-style square inputs) latency: ms from steer key-down until yaw rate reaches 0.05 / 0.15 rad/s at 25 m/s (lat10 / lat63 columns)

- 2026-09-30 `8c2adff` added: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring

### `dev/heapwalk.js`
dev: ide: typed arrays reachable from the game objects, bytes by path (deduped by ArrayBuffer). __heapWalk(depth = 9)

- 2026-09-30 `8f40932` added: dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)

### `dev/human.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/human.js`
Preview page for src/player/human.js: http://127.0.0.1:5190/dev/human.html

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/int_shots.js`
dev: hero interior screenshots. Paste into the console of a running game tab (Free Roam), then await __intShots(['stFrancis', 'davies'], { night: false, suffix: '_v2' })   -> shots/int_<id>_v2.jpg Each interior: walk to its door (loads it),...

- 2026-10-01 `51a8035` added: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept

### `dev/landmarks.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/landmarks.js`
Dev preview for src/world/landmarks.js

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/lookshots.js`
Look-dev capture helper (whole-image pass). Load in the game page (5191 tab): await import('http://127.0.0.1:5190/dev/sky_shots.js'); await import('http://127.0.0.1:5190/dev/bld3shots.js'); await import('http://127.0.0.1:5190/dev/lookshots....

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/memspots.js`
dev: GPU-memory / perf report at 5 spots + a long drive memory trend. Needs ?memtrack (dev/memtrack.js) for GL byte totals. await __memSpots()            -> [{ pl, totalMB, texMB, rbMB, bufMB, gpuMs, heapMB }] __memDrive({ frames })        ...

- 2026-09-30 `9665c2b` added: dev: GPU memory accounting (?memtrack, __gpumem) and memory spot/drive report helpers
- 2026-09-30 `8f40932` changed: dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)
- 2026-10-01 `999dcf5` changed: dev: memspots result posting + throttle-proof waits, gpu.js waits; NEXT_SESSION VRAM pass notes

### `dev/memtrack.js`
Dev-only GPU memory accounting. Install BEFORE the renderer exists (main.js: ?memtrack). Wraps WebGL2 allocation calls and keeps bytes per GL object (textures per face/level, renderbuffers incl. MSAA samples, buffers). __gpumem(top = 25) ->...

- 2026-09-30 `9665c2b` added: dev: GPU memory accounting (?memtrack, __gpumem) and memory spot/drive report helpers
- 2026-09-30 `8f40932` changed: dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)

### `dev/ped_shots.js`
Pedestrian before/after shots. In the game page (?play&foot): await import('http://127.0.0.1:5190/dev/ped_shots.js'); await __pedAll('after') -> shots/peds_<unionsq|chinatown|mission|closeup|night|onfoot>_<suf>.jpg __pedPerf(name, n) -> mea...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-01 `3b3e0ca` changed: Peds: asset fallback to procedural humans, phone/umbrella props, shot + perf dev helpers, Rocketbox fetch script

### `dev/ped_states.js`
Realistic-human state sheet: forces the player's human through animation states and shoots each one. await import('http://127.0.0.1:5190/dev/ped_states.js'); await __pedStates(['idle','walk',...], 'tag') -> shots/pst_<tag>_<state>.jpg (came...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `dev/peds-harness.js`
Dev-only helpers for testing pedestrians in the running game (paste / import in the console). window.__pedsH = { wait, settle, camAt(ped, dist, side, h), corner(), crowdView(), stats() }

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/perf_drive.js`
Dev hitch profiler (load in the game page: await import('http://127.0.0.1:5190/dev/perf_drive.js')). __route(pts)                 -> street route (A* over the graph) through [[x,z], ...] as a dense polyline await __perfDrive(opts)      -> m...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8f40932` changed: dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)

### `dev/pop_probe.js`
Dev pop / flash probes (load in the game page after dev/perf_drive.js: await import('http://127.0.0.1:5190/dev/pop_probe.js')). __popDrive({ route, speed = 60, R = 250 })  -> drive a __route() polyline; counts visible POPS: an object (mesh,...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)

### `dev/quad.py`
dev: 2x2 comparison panel (each image cover-cropped to 16:9).  python dev/quad.py out.jpg a b c d [--w 1280]

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/regress_shots.js`
Visual regression set: a fixed list of key views captured with the real chase camera (player car parked on the street, heading along it) so look / lighting / streaming passes can be compared before -> after. in the game page (any tab, hidde...

- 2026-09-30 `9fd802a` added: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `406c0a7` changed: Streetlight halos stronger in rain; regress_shots: Jackson free-cam sky view (vs the user's liked day shot)
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `dev/road2_sheet.py`
Road pass 2 sheets (dev/road2shots.js captures).

- 2026-10-02 `03c10d9` added: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `dev/road2shots.js`
Road pass 2 review views (wet reflections, asphalt, markings, day colour). Load after sky_shots.js, regress_shots.js, ctshots.js, gpu.js: for (const f of ['sky_shots.js', 'regress_shots.js', 'ctshots.js', 'gpu.js', 'road2shots.js']) await i...

- 2026-10-02 `03c10d9` added: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `dev/sheet.py`
dev: contact sheet of shots.  python dev/sheet.py out.jpg cols w a.jpg b.jpg ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/sky_shots.js`
Sky / night capture helpers (load in the game page: await import('http://127.0.0.1:5190/dev/sky_shots.js')). await __skyShot(name, hours, kind)          wide view from Twin Peaks toward downtown (skyline + sky) await __nightShot(name, stree...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `(root)`

### `index.html`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `69c5690` changed: dev: ?sandbox (saves in sessionStorage, real profile untouched) + dev/gameplay_audit.js (route sanity, event autopilot runs)

### `kit_facade3.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `package-lock.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `package.json`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `public/draco`

### `public/draco/draco_decoder.js`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `public/draco/draco_wasm_wrapper.js`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src/audio`

### `src/audio/PROGRESS.md`
Audio: maintainer notes

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/ambience.js`
HILLBOMB audio: world ambience from CC0 field recordings. Stereo beds crossfade by where the listener is (downtown / residential / park / waterfront / hilltop / tunnel) and the time of day; weather adds rain (street or roof, depending on be...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/assets.js`
HILLBOMB audio: recorded-asset loader (CC0 recordings listed in public/assets/audio/manifest.json). Buffers are fetched + decoded on demand and cached; every getter is safe to call before anything has loaded (it returns null and the caller ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/audio.js`
HILLBOMB: San Francisco - audio. Sample-based: real CC0 recordings (engines, tyres, impacts, ambience, UI, radio tracks) listed in public/assets/audio/manifest.json, with tiny synthesised stand-ins only while something is still loading.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla
- 2026-10-02 `9571e05` changed: Audio: mute automated test runs (navigator.webdriver / ?mute) and suspend pages that start hidden (background test tabs never fire visibilitychange)

### `src/audio/dsp.js`
HILLBOMB audio: shared DSP helpers. Every sound in the game is generated in code. The noise tables, impulse responses, wavetables and struck-metal buffers below are computed at runtime; there are no audio files.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/engine.js`
HILLBOMB audio: sample-based vehicle engines. Each engine family (public/assets/audio/engines/<family>.mp3) is a sprite of seamless loops cut from real CC0 recordings (chassis-dyno sweeps, gear pulls, idles). Every loop was de-chirped to a ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/music.js`
HILLBOMB audio: radio. Stations play curated CC0 tracks (public/assets/audio/music/..., listed in the manifest) through one streaming <audio> element routed into the music bus (tracks are never decoded whole). Stations run on a "live" timel...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/sfx.js`
HILLBOMB audio: vehicle, world and UI sound effects. Recorded CC0 samples (see public/assets/audio/manifest.json) drive everything; the few tiny synthesised fallbacks only run while a sample is still loading or missing, so nothing is ever s...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/shots.js`
HILLBOMB audio: pooled one-shot voices. A ShotPool owns a fixed number of persistent output slots (pan -> distance low-pass -> gain, plus a reverb send). Every one-shot borrows a slot; when all slots are busy the oldest shot is

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/audio/spotify/api.js`
Spotify Web API client: bearer auth from auth.getAccessToken() (auto-refresh), one refresh+retry on 401, 429 handled by sleeping Retry-After seconds (short waits only; long ones throw so the game never stalls).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/spotify/auth.js`
Spotify OAuth: Authorization Code with PKCE (no client secret, no password ever touches the game). Flow: beginLogin() stashes {verifier, state, returnUrl} in sessionStorage and returns the accounts.spotify.com URL; Spotify redirects back to...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/spotify/pkce.js`
PKCE helpers (RFC 7636) for Spotify's Authorization Code flow. Pure functions: no DOM, no storage. Work in browsers (secure contexts: https or http://127.0.0.1) and in Node 20+ through globalThis.crypto.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/spotify/player.js`
Spotify Web Playback SDK (in-game device, Premium only) + the remote fallback (now-playing of the user's other device via the Web API; works on free accounts; control there needs Premium on Spotify's side). The SDK script is injected lazily...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/audio/spotify/station.js`
The Spotify radio station: implements the external-station contract of G.audio.radio ({ id, name, genre, onSelect, onDeselect, next, prev, setVolume, setPaused, nowPlaying }) plus the controls the Spotify panel needs (setSource, loadPlaylis...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src/game`

### `src/game/drivers.js`
AI driving: lane waypoints over the road graph, pure-pursuit steering, speed control, signals / stop signs, car following. Used by traffic, police (with a pursuit target) and race rivals (with a fixed route).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `157fb1a` changed: Outlaw: cops drive the last metres up to a stopped suspect (route ended at the road node, 20-30 m off: no bust ever), box in instead of shoving, only player-initiated rams add stars, the search widens and lying low evades (a parked player out of sight stayed wanted forever)
- 2026-10-01 `838c23b` changed: Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds
- 2026-10-01 `33cfbba` changed: Police: pursuit spawns need a short legal drive (<= 1.6x + 40 m) and a clear spot, far patrols recycled when a chase starts, units drive to the last-seen spot for 12 s before the search ring; pursuit routing takes the A* road route (greedy edge choice circled blocks). Parked-suspect probe: first unit < 30 m in 3.5-10 s at 4/6 spots (was 0/6 within the 22 s star timeout)

### `src/game/economy.js`
Money (credits), XP / player level, owned cars, records and settings. Persisted through the versioned profile save (festival/save.js: 'hillbomb.save.v2', migrated from 'hillbomb.save.v1'). Level-ups: in the festival (forza mode) every level...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `bf0246f` changed: Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad

### `src/game/festival/PROGRESS.md`
Festival layer: progress note (paused: token budget)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/branding.js`
Original festival branding drawn on canvas: the HILLBOMB emblem (a hill with a suspension tower inside a hexagon), the wordmark, stage screen art, arch banners and flag prints. Redrawn once the web fonts finish loading.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/cars.js`
Car roster adapter. Uses the garage module (G.garage: spec / pickCar / give / owned / current) when it exists, feature-detected at call time, and falls back to the built-in roster (vehicle/cars.js) + economy ownership.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/catalog.js`
HILLBOMB Festival San Francisco: the whole content catalog in one place. EVERY position is real-world [lat, lon] (resolved with ll() + road snapping at runtime), so this file survives map rebuilds unchanged. Route keys: [lat, lon, hint?]  h...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fc6ef63` changed: Routes that collapsed on the real map: Presidio Circuit (1.2 km out-and-back -> 3.8 km Arguello / Moraga / Presidio Blvd / West Pacific loop), Chinatown Lanterns (470 m of Sutter -> up Grant, Broadway, Stockton), Pacific Heights Plunge (1.1 km -> 2.8 km Divisadero / Chestnut / Fillmore), prologue night segment up Grant
- 2026-10-01 `26b175d` changed: Night Market Circuit on Treasure Island's real street grid (was 26 % off-road through 32 footprints, nobody finished); Bay Crown starts north of Lincoln (no opening U-turn), runs along the park (JFK is car-free)
- 2026-10-01 `7ad9fe5` changed: Polo Fields Oval: a flat 730 m oval on the field itself (the old box climbed 22 m of grass banks; nobody finished)
- 2026-10-01 `ceacd8a` changed: Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car
- 2026-10-01 `25ac7ef` changed: Golden Gate Park Loop: one lap (9.4 km per lap on the real map, two ran ~15 min); '1 lap' not '1 laps'
- 2026-10-01 `d0f8b14` changed: Crissy Field Dash on the airfield lawn (south leg was on the Presidio Parkway ramps); Headlands XC without the US 101 U-turn keys

### `src/game/festival/collectibles.js`
Open-world collectibles: bonus boards (smashable XP / fast-travel signs), barn finds (rumour -> search area -> discovery -> restoration -> car), player houses (buy, fast travel, perks), roads discovered (% of the network),

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/crowd.js`
Cheap instanced festival crowd: one merged low-poly figure (arms up), per-instance shirt colour, per-instance skin tone and a bob/jump animation in the vertex shader. One draw call per site.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/drift.js`
Drift scoring shared by drift events, drift zones and story missions: slip angle x speed, a combo multiplier that grows while the drift is held, banking after a short pause, and a lost combo on any real impact.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/drivingline.js`
Driving line: chevrons along the route ahead of the player, green -> yellow -> red by how much braking the next stretch needs at the current speed (curvature + braking envelope from util.speedLimits). Modes: 'full' | 'braking' (only where y...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/events.js`
Festival events: catalog -> live instances (start point snapped to the road graph, route threaded on demand), world / map markers, the start prompt, the event-card -> car -> difficulty -> race flow, rewards and records.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `25ac7ef` changed: Golden Gate Park Loop: one lap (9.4 km per lap on the real map, two ran ~15 min); '1 lap' not '1 laps'

### `src/game/festival/festival.js`
HILLBOMB Festival San Francisco: the festival / campaign / events layer (G.festival). Owns the festival save state, progression (Festival Points -> chapters -> outposts, XP levels -> Prize Spins, accolades), and wires every festival module:...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `19ebdb0` changed: Controls: pad View tap = map / hold = reset (every map open also reset the car), Tab / d-pad down opens the Campaign tab, pad d-pad / stick pick the title mode, controls help lists garage / campaign / photo
- 2026-10-01 `b19378b` changed: Race corridors also hide parked cars that stream in after the start (they were only cleared on loaded tiles: obstacles further along, e.g. Macalla Rd)
- 2026-10-01 `afaae5a` changed: Race corridors: world/keepout.js; props/v2 hides trees / street props + colliders inside an active race line (loaded and streamed tiles), +3 m at corners; street furniture on carriageways not placed

### `src/game/festival/gates.js`
Checkpoint gates for races / missions: light-pillar arches on roads, inflatable arches off-road, a chequered finish. A small fixed pool is repositioned as checkpoints are passed (no per-checkpoint allocation).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/icons.js`
Icon atlas (canvas, drawn once): white glyphs on transparent, 8 x 8 tiles of 64 px. Used by world markers and UI.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/kit.js`
Geometry kit: collect primitives (with a colour and a transform) per material key, then merge each key into ONE mesh. Keeps festival sites / stunt props to a handful of draw calls.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/markers.js`
World + map markers for everything the festival places. World: instanced light beams, ground rings and billboard icons (3 draw calls for every marker in the city). Map / minimap: registered with G.ui.markers when the UI shell provides it (c...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/prologue.js`
First-launch prologue: four short playable drives in different cars, places, times and weather, stitched with fades, lower-thirds and MC captions, then the arrival at the Main Stage (site flyover) and the starter-car pick.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `ceacd8a` changed: Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car

### `src/game/festival/racehud.js`
Race HUD: position / lap / time block, standings ladder with gaps, split popups, countdown lights, warnings, and name tags over the rivals' cars. Lives in the festival overlay layer; DOM writes only when values change.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/racing.js`
Race runtime shared by every racing activity: road / street / dirt / cross country / drag / drift events, showcases (virtual opponents) and story races. Flow: fade out -> grid (player at the back, named rivals ahead) -> reveal camera -> 3-2...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `221364e` changed: Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving
- 2026-10-01 `5b603cf` changed: Races: player respawn after 10 s of throttle with no route progress (rocking against a wall never tripped the speed test), respawn reasons counted (dev); abandoned ex-player cars > 700 m away are freed too; audit: UI sweep, story runner, worker-paced yields
- 2026-10-01 `e5c901d` changed: Race grid: slots clear of solid obstacles (re-checked once colliders stream in before the countdown); audit: Outlaw loop + prologue runners
- 2026-10-01 `fec3c05` changed: Races: a checkpoint missed by > 400 m rewinds the player to it (progress only grows, so the race could never finish: Crissy Field Dash ran past twice its length); dirt gates as forgiving as cross-country
- 2026-10-01 `838c23b` changed: Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds

### `src/game/festival/rivals.js`
Persistent named Rivals: grid selection per event, car choice, AI tuning (difficulty + personal skill / aggression), and head-to-head records saved in the festival state.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/save.js`
Versioned save. One localStorage key holds the whole profile: { v: 2, economy: {...}, festival: {...} }. v1 ('hillbomb.save.v1', economy only) is migrated on first load and kept as a settings mirror because main.js reads the graphics qualit...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/screens.js`
Festival screens (keyboard + gamepad through ui.openScreen): event card, results, prize spin, mission briefing / results, starter pick, car picker fallback, festival hub, fast travel, and the Campaign menu (tab or screen).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `25ac7ef` changed: Golden Gate Park Loop: one lap (9.4 km per lap on the real map, two ran ~15 min); '1 lap' not '1 laps'

### `src/game/festival/showcases.js`
Showcase opponents (virtual racers for the race runtime): jets  - "Bay Blades" display team: three original jets flying a scripted waterfront path with smoke trails fog   - Karl the Fog: a rolling wall of cloud chasing you down Twin Peaks (...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/sites.js`
Festival sites: the Main Stage at Marina Green + six outposts that open with progression. Everything is placed in a local site frame (+Z = entrance toward the road, stage at -Z), dropped onto the live terrain per prop, merged per material (...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/stories.js`
Story chains: character-led missions with dialogue captions, varied objectives and 1-3 stars. Kinds: tail, tag, race, drag, reach, speed, air, drift, smash, nearmiss, fare.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `221364e` changed: Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving
- 2026-10-01 `ceacd8a` changed: Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car

### `src/game/festival/stunts.js`
World stunts: speed traps, speed zones, danger signs, drift zones, trailblazers. 1-3 stars per stunt, records, world props (camera poles, gantries, danger boards, flags, trailblazer pillars) merged into a few meshes.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/ui.js`
Festival UI kit: styles (built on the shared theme tokens), full-screen modal screens (through G.ui.screen when the UI shell provides it, else a local fallback), keyboard + gamepad navigation, dialogue captions and big banners.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/festival/util.js`
Festival shared helpers: lat/lon placement + road snapping, route threading over the road graph, dense route paths with cumulative length / heights / widths, progress trackers, formatting. Everything the festival places is authored in real ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `221364e` changed: Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving
- 2026-10-01 `0a670cf` changed: Circuits: start / finish moved onto a straight and seam stubs removed (Golden Gate Park Loop rivals sat pinned at a hairpin start line for 12 s, 81 respawns, nobody finished)
- 2026-10-01 `ca6f511` changed: Off-road legs: prefer <= 45 % terrain paths, straight legs only up to ~27 deg (Headlands XC rivals stalled on 31 deg grass faces)
- 2026-10-01 `838c23b` changed: Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds

### `src/game/game.js`
Game hub: owns vehicles, the sim, the player, and wires systems (traffic, police, activities, skills, economy, audio, HUD) together through events.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `221364e` changed: Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving
- 2026-10-01 `5b603cf` changed: Races: player respawn after 10 s of throttle with no route progress (rocking against a wall never tripped the speed test), respawn reasons counted (dev); abandoned ex-player cars > 700 m away are freed too; audit: UI sweep, story runner, worker-paced yields
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `src/game/garage/PROGRESS.md`
Cars / garage: progress note

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/garage/lab.js`
Vehicle lab: drives the REAL physics (CarBody from physics.js) on a flat test pad, headless. Used to validate the performance model in tuning.js and the PI ordering. Runs in Node (tools in the report) and in dev/cars.html?lab.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/garage/store.js`
Garage save data: one instance per owned car (upgrades, tune, paint, odometer, wins) + collection rewards. Own localStorage key; G.economy.owned / G.economy.current are kept in step for older code.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/garage/studio.js`
Garage studio: the 3D showroom the garage screens render through G.renderOverride (main.js). Own scene + camera: dark cyclorama, softbox environment map (PMREM of an emissive light rig), polished floor with a mirrored reflection of the car,...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/garage/ui.js`
Garage screens: My Cars, Autoshow, Upgrades, Tuning, Paint, Collection, plus car select (pickCar) and the new-car reveal. One full-screen G.ui.screen layer over the 3D studio (G.renderOverride). Keyboard + gamepad through the

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/modes.js`
Game modes. Every system reads G.flags (or G.mode). Keys stay 'forza' | 'gta' | 'explore' (URL ?mode=, saves); the player-facing labels are original: Festival / Outlaw / Free Roam. forza   : Forza Horizon feel. No police, no crime, no carja...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/peds/looks.js`
HILLBOMB pedestrians: appearance presets per crowd style + a small pool of pre-built humans. Humans are expensive to create (a new body variant builds its geometry once, ~15 ms; every human bakes its own colours, ~2.5 ms), so the crowd reus...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `src/game/peds/nav.js`
HILLBOMB pedestrians: navigation data. Built lazily from world.blocks / world.graph and cached. SIDEWALK RING. Every block's curb polygon `poly` is convex; the sidewalk is the 3.6 m band between `poly` and `inner`. A walker is parametrised ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/peds/realhuman.js`
HILLBOMB realistic humans: Microsoft Rocketbox avatars (MIT) for pedestrians and the player on foot. Assets: public/assets/peds (tools/blender/peds/*): <id>.glb (LOD0 source mesh ~7-10k tris, LOD1 ~3.5k, LOD2 ~1.5k, skinned to one shared 34...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `src/game/peds/yell.js`
HILLBOMB pedestrians: short comic speech bubbles ("HEY! MY CAR!") above a pedestrian's head. A handful of pooled sprites; canvas textures are cached per line of text. No audio.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/quality.js`
Graphics presets, first-run auto-detect + benchmark, dynamic resolution. Presets: low / medium / high / ultra. 'ultra' runs every 'high' code path (quality.name === 'high') plus the 4096 sun shadow map, a sharper Google-tiles target and a b...

- 2026-09-30 `4075efc` added: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `src/game/skills.js`
Skill chain: drift, air, near miss, speed, wreckage. Banks after 3 s without a crash. Emits 'nearMiss' (other car) and 'skillBank' (points, state) for the festival (accolades, Festival Points).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_cablecars.js`
San Francisco cable cars: kinematic cars running the real lines (Powell, Hyde, California) at ~9.5 mph, stopping at corners, ringing the bell, climbing the hills. They shove cars aside (infinite mass). v1 (hand-built grid): straight axis-al...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_carprobe.js`
Reflection probe that follows the player's car (render/carprobe.js). Off on low quality or on foot. Debug: window.__carProbe (.enabled, .stats.ms = smoothed CPU ms per frame).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_creative.js`
Free Roam "Creative" tab in the pause menu: time of day, weather, reflections / lighting / graphics switches, map layers, quick teleports. Visible only in Free Roam (G.flags.creative). Settings persist in economy.settings.creative.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_events.js`
GPS + the G.events facade. The festival layer (sys_festival.js -> game/festival/*) owns every activity: races, stunts, stories, showcases. This module keeps the small shared API other systems use: G.gps { setTarget(x, z, color), points, col...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `221364e` changed: Races: festival damage never kills the player / rivals (dead car = no throttle = stuck for good), repeat respawns skip past whatever blocks the line, routes no longer U-turn past their finish, off-road legs follow the terrain (A*, no cliffs), knocked parked cars far away are freed; GPS leaves the street the way you are driving

### `src/game/sys_festival.js`
HILLBOMB Festival San Francisco (auto-installed system). Everything lives in ./festival/; G.festival is the API.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_garage.js`
Garage system: car ownership + per-car builds (upgrades, tune, paint), the garage screens (My Cars, Autoshow, Upgrades, Tuning, Paint, Collection), car select for events and the new-car reveal. Public API: G.garage. spec(key, { stock }) -> ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_hero_interiors.js`
Walk-in interiors of the hero landmarks (logic in src/world/interiors/hero_int.js). Auto-installed by main.js.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_interiors.js`
Enterable buildings: safehouse (Russian Hill), Bay Motors showroom (SoMa), multi-level parking garage (SoMa), diner (Fisherman's Wharf), bodega (Mission), cafe (Hayes Valley). Colliders + drivable decks are registered at install (cheap, per...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_menus.js`
Pause / festival menu, big map and settings wiring (the UI itself lives in src/ui: shell.js, menu.js, bigmap.js, tabs.js). Also radio hotkeys and car delivery. G.menus.update() is called by main.js every frame (also while

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `bf0246f` changed: Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad

### `src/game/sys_peds.js`
HILLBOMB: pedestrians. A living-city crowd around the player: sidewalk walkers, pairs, chatting groups, phone-starers, bus-stop waiters, joggers on park paths and promenades, tourists at landmarks. They cross at corners on the walk signal, ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `src/game/sys_photo.js`
Photo mode (G.state = 'photo') + weather wiring. freezes the game (physics, traffic, particles, rain, water, clock), hides the HUD, frees the mouse orbit camera around the car, or a free camera constrained to 45 m around it (never below the...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_police.js`
SFPD: patrols, wanted stars, witnesses, pursuit AI, roadblocks, busted / evaded.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `157fb1a` changed: Outlaw: cops drive the last metres up to a stopped suspect (route ended at the road node, 20-30 m off: no bust ever), box in instead of shoving, only player-initiated rams add stars, the search widens and lying low evades (a parked player out of sight stayed wanted forever)
- 2026-10-01 `1e2df5f` changed: Police: pursuit units spawn 60-120 m out, out of sight (behind / beside, or hidden by a building)
- 2026-10-01 `33cfbba` changed: Police: pursuit spawns need a short legal drive (<= 1.6x + 40 m) and a clear spot, far patrols recycled when a chase starts, units drive to the last-seen spot for 12 s before the search ring; pursuit routing takes the A* road route (greedy edge choice circled blocks). Parked-suspect probe: first unit < 30 m in 3.5-10 s at 4/6 spots (was 0/6 within the 22 s star timeout)

### `src/game/sys_spotify.js`
Spotify on the in-game radio: connect panel (PKCE login on Spotify's own page), a "Spotify" station registered with G.audio.radio, and a small now-playing card. Exposes G.spotify = { openPanel, closePanel, connect, disconnect, state, statio...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_tour.js`
Cinematic tour: a curated camera tour of the real San Francisco map (golden-hour Golden Gate, Lombard, Chinatown in the rain, the Bay Bridge at night...), with titles, letterbox and an optional .webm recording of the canvas + audio.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/tour/director.js`
Cinematic tour director: plays the shot list (src/game/tour/shots.js) through G.cameraOverride, one time of day + weather per shot, streams the world in behind a black frame before each shot, fades through black between shots,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/tour/recorder.js`
Canvas recorder for the cinematic tour: composites the WebGL frame + the tour overlay (letterbox, titles, attribution) into a 2D canvas and records it with MediaRecorder (VP9/VP8 webm, ~40 Mbps), plus the game's audio (the audio engine's fi...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/tour/shots.js`
Cinematic tour shot list (real 1:1 San Francisco, default map). Every shot has its own time of day + weather and one camera move. Points: [lat, lon, dy]              dy metres above the ground (or above sea level over water)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/traffic.js`
Ambient traffic: spawns AI cars on lanes in a ring around the player, despawns far ones, handles reactions.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src`

### `src/main.js`
HILLBOMB: San Francisco. Boot, loading screen, title, main loop.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9665c2b` changed: dev: GPU memory accounting (?memtrack, __gpumem) and memory spot/drive report helpers
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `19ebdb0` changed: Controls: pad View tap = map / hold = reset (every map open also reset the car), Tab / d-pad down opens the Campaign tab, pad d-pad / stick pick the title mode, controls help lists garage / campaign / photo
- 2026-10-01 `bf0246f` changed: Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py


## `src/player`

### `src/player/camera.js`
Chase camera (car), hood / bumper camera, in-car (cockpit) camera, on-foot orbit camera. Spring-smoothed, speed FOV, occlusion pull-in (never into the car itself), impact shake + a small speed-dependent road shake.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring

### `src/player/human.js`
HILLBOMB: procedural low-poly human (player on foot + pedestrians). One SkinnedMesh (one draw call) per human, 18 bones, procedural animation (no clips). LOCAL FRAME: +X right, +Y up, -Z forward. Feet at y = 0. See CONVENTIONS.md.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `src/player/input.js`
Keyboard + mouse + gamepad input with action edge detection.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `19ebdb0` changed: Controls: pad View tap = map / hold = reset (every map open also reset the car), Tab / d-pad down opens the Campaign tab, pad d-pad / stick pick the title mode, controls help lists garage / campaign / photo

### `src/player/player.js`
The player: on foot (GTA-style) or driving. Enter/exit/carjack, reset, horn, camera modes.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring


## `src/render`

### `src/render/PROGRESS.md`
Render agent status: water / weather / photo mode (2026-09-28, complete)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/atmosphere.js`
Physically based sky (Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"): Rayleigh + Mie + ozone, precomputed transmittance and multiple-scattering LUTs (once at boot), and sky-view LUTs

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/carlights.js`
Night car lighting: two real spotlights for the player's headlights (always present, intensity 0 by day so the light count never changes = no shader recompiles) + one Points draw call of lamp flares for every car + one instanced

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js

### `src/render/carprobe.js`
Dynamic reflection probe around the player's car: a small cube map (128 px, half-float) re-rendered one face per frame (full refresh every 6 frames) from ~1 m above the car, with the player's car, grass and rain hidden and no

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/carshadow.js`
Contact shadows: a soft ambient-occlusion blob under every car (driven vehicles + parked instances) so cars sit ON the road instead of hovering over it. One InstancedMesh (one draw call): a unit quad in XZ, oriented to the ground under

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/environment.js`
Time of day, sun/moon light with a camera-following shadow frustum, hemisphere light, sky, height fog, env map, and the weather system (render/weather.js) that modulates all of them.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `bb3858b` changed: Look: deep-blue sky (sat 0.8) + white cumulus again, less rain skyglow (muddy veil), night walls lifted under ACES (facade lamp-wall response)
- 2026-10-01 `aaa9e34` changed: Buildings v5: near sun-shadow cascade on by default (high/ultra), detail-only casters + every-other-frame refresh
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `src/render/fog.js`
Karl the Fog": replaces three's fog chunks with an analytic exponential HEIGHT fog + a thin global haze, plus a second, much denser and lower "bank" layer (rolling marine-layer fog that pours in from the west and leaves the bridge

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/hdrisky.js`
Photographic sky: blends two CC0 HDRI captures (Poly Haven "qwantani" time-of-day series) by sun elevation, rotates each so its sun sits at the engine's sun azimuth, normalises brightness, and blends in a THIRD capture for cloud cover

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/lampglow.js`
Volumetric street-lamp light at night: for the nearest lamps, a soft cone of light scattered by rain / haze under the head (with falling drops glinting inside it) and a wide halo around the head. Axial / camera-facing billboards,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `406c0a7` changed: Streetlight halos stronger in rain; regress_shots: Jackson free-cam sky view (vs the user's liked day shot)

### `src/render/lampmap.js`
Street-lamp light map: every street lamp within ~800 m of the camera is splatted (GPU, top-down) into a world-space irradiance texture: rgb = the lamp's irradiance on the ground (point source, cos / d^2, soft cut-off at ~3 lamp

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `src/render/particles.js`
Pooled GPU particles (one Points draw call per blend mode): tyre smoke, dust, engine smoke, sparks, splashes, flames.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/photo/looks.js`
Photo-mode colour looks (display-referred, applied by post.js FinishShader) and the PNG capture helper.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/post.js`
Post-processing: scene + ambient occlusion (N8AO, half res + bilateral upsample) -> contact shadows -> wet-surface reflections (SSR, rain only) -> depth of field (photo mode only) -> bloom -> grade (vignette, speed blur, contrast, split ton...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py
- 2026-10-02 `1671ce8` changed: Road 3: no grey lamp veil in rain (lampmap broad sheen x(1 - 0.9 wet), the reflection is the streak), mirror-sharp puddles (standing-water-only gloss mask, roughness 0.02 -> unblurred trace); regression chase views start in the car; road3 shots + sheet

### `src/render/roadwear.js`
Road surface wear, painted in the asphalt shader (makeRoadMaterial in terrainmat.js): tyre-polished wheel tracks + lighter lane centres + oil drips, rectangular repairs + utility trenches, crack networks (alligator cracking in the wheel pat...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py

### `src/render/skidmarks.js`
Skid marks: a ring buffer of quad strips (one draw call). Each sliding wheel extends its own strip.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/sky.js`
Sky dome: physically based atmosphere (atmosphere.js sky-view LUTs for the sun AND the moon), 2.5D cloud layers (cumulus / stratocumulus / nimbostratus low deck + cirrus, weather-driven coverage, sun-lit with multiple-scattering

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `bb3858b` changed: Look: deep-blue sky (sat 0.8) + white cumulus again, less rain skyglow (muddy veil), night walls lifted under ACES (facade lamp-wall response)

### `src/render/streetmirror.js`
Wet-street planar mirror for the Chinatown hero streets (Grant Ave + the hero side streets, src/world/landmarks/v2/ct_zone.js). In rain, the street run under the camera gets a mirror plane fitted to its road surface (least squares along the...

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py

### `src/render/terrainmat.js`
Photo-scanned ground materials: terrain splatting (grass / forest floor / sand / cliff rock by per-vertex weights, two-scale sampling against tiling), asphalt and sidewalk concrete with world-space UVs. Weather: every lit material gets wet ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py

### `src/render/water.js`
HILLBOMB water: the Bay + the Pacific. planar reflection (reduced resolution, oblique near-plane clip at sea level, a cheap scene layer: sky, terrain, decks, landmarks/bridges, buildings), skipped while no water pixel is visible (occlusion ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/render/weather.js`
HILLBOMB weather: clear | fog (Karl the Fog) | overcast | rain | storm, with smooth transitions and a slow random cycle in free roam. Drives: sky (storm HDRI blend, see hdrisky.js), sun/shadow strength, fog + the low marine-layer bank,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/render/wetstreaks.js`
Wet-road light streaks: every street lamp and car lamp near the camera paints its reflection on wet ground as a long, narrow streak running from the specular reflection point toward the viewer (the anisotropic look of wet asphalt at

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src/ui`

### `src/ui/bigmap.js`
Full-screen map: pan (drag / WASD / stick), zoom (wheel / +- / triggers), filters, marker cards, waypoints, fast travel. Opens standalone (M key, G.ui.map.open) or embedded in the pause menu's Map tab (mount()).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/ui/devshot.js`
Dev capture of the DOM UI composited over the WebGL frame (TESTING.md's __shot only grabs the WebGL canvas). await __uishot('name', { w: 1280, h: 720 })  -> POSTs shots/name.jpg to the capture server The overlay DOM is cloned into an SVG fo...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/ui/hud.js`
In-game HUD: speedo/tach + PI badge, rotating minimap (GPS, markers, compass), street/district, credits/XP/level, skill chain, race HUD + checkpoint arrow, notifications, district banner, wanted stars, prompts, readouts. createHud(G) also b...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/ui/icons.js`
Original icon set (24x24 design grid) used by the HUD, minimap, big map, menus and notifications. Each icon is a list of parts: { d: svgPathData, f: true (fill, evenodd) | w: strokeWidth }. svgIcon(name) -> inline <svg> string (currentColor...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/ui/mapcanvas.js`
Top-down map of SF (water, land, hillshade, parks, blocks, piers, roads) rendered into a tile pyramid. Shared by the minimap and the big map. Tiles are painted lazily (a small budget per frame) and cached (LRU). const T = createMapTiles(wor...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/ui/menu.js`
Pause / festival menu: a tabbed full-screen layer. Other modules add tabs: G.ui.menu.addTab({ id, title, order, icon, build(el, nav), visible?() }) build() runs the first time the tab is shown in each menu session and may return hooks:

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/ui/shell.js`
UI shell: G.ui. Modal layer stack (menu / map / screens), pause handling, keyboard capture, gamepad -> key synthesis, focus navigation, map markers, notifications, fade-to-black and fast travel. API (created by createHud, so it exists befor...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/ui/style.js`
HUD, shell, menu, map and legacy (.hb-*) styles, injected once. Tokens come from theme.js (--ui-*); the older --acc/--ink/--dim/--cond/--sans names stay defined because other modules' screens use them.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/ui/tabs.js`
Built-in pause-menu tabs. Other modules replace a tab by calling G.ui.menu.addTab() with the same id: event (only while G.events.active), campaign ("Festival", fallback), cars (fallback garage), map, collection (fallback records), photo (fa...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `19ebdb0` changed: Controls: pad View tap = map / hold = reset (every map open also reset the car), Tab / d-pad down opens the Campaign tab, pad d-pad / stick pick the title mode, controls help lists garage / campaign / photo
- 2026-10-01 `bf0246f` changed: Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad

### `src/ui/theme.js`
Shared festival UI language (menus, event cards, garage, results). Every screen uses these tokens/classes so screens built by different modules look like one game. Original look: no third-party logos, names or art. Screens must be fully usa...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src/vehicle`

### `src/vehicle/cars.js`
Car roster (fictional makes/models, handling + economy) and the Vehicle wrapper (physics body + visual model + lights + audio voice). Per-instance builds (upgrades / tune / paint) come from src/game/sys_garage.js through setBuildProvider();...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring

### `src/vehicle/carshade.js`
Car surface layers patched into the car materials (vehicle/models.js): wheel zone shading on the baked details material: the Blender tyre (tools/blender/cars.py tyre_mesh) and brake rotor carry marker UVs (uv.y 2..3 road tyre, 6..7 off-road...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/vehicle/models.js`
HILLBOMB: San Francisco. Procedural car models (no asset files). Owner: car models agent. See CONVENTIONS.md. Local frame: +X right, +Y up, -Z forward. Origin on the ground (y = 0 = tyre contact), x = 0 centre line, z = 0 midway between the...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `c750d23` changed: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper

### `src/vehicle/physics.js`
Raycast-suspension rigid-body car. Arcade-leaning but physical: springs/dampers per wheel, slip-based tyre forces with a friction circle, engine torque curve + automatic gearbox, drag/downforce, chassis-vs-ground and chassis-vs-wall

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `838c23b` changed: Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds

### `src/vehicle/sim.js`
Fixed-step vehicle simulation (120 Hz) with car-vs-car contacts and sleeping.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring

### `src/vehicle/tuning.js`
Car builds: upgrades, tuning, derived physics params and the Performance Index. Pipeline (pure functions, no THREE, no DOM; runs in Node for the lab): stock roster def ──applyUpgrades(def, build.up)──► upgraded def ──deriveParams(def, spec,...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `src/world`

### `src/world/anchors.js`
World anchors shared by every module. Pure data + tiny helpers, no three.js imports. WORLD FRAME: metres. +X = east, +Z = south (so north is -Z), +Y = up. Sea level y = 0. The map is San Francisco at ~0.5 horizontal scale (1 real km ~ 500 m...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/assets.js`
Shared photo-scanned PBR material library (CC0, ambientCG) + HDRI skies (CC0, Poly Haven). See public/assets/ASSET_LICENSES.md. Usage (any module): import { PBR } from '../world/assets.js'; const t = PBR.tex('brick_red');              // { ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py

### `src/world/blocks.js`
City blocks: grid cells minus street corridors, clipped by the diagonal / curved special roads, then building lots.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/buildings.js`
HILLBOMB buildings v2: every lot becomes a styled San Francisco building (Victorian / Edwardian row houses, Sunset stucco, storefront blocks, Tenderloin apartments, Chinatown, SoMa brick lofts, warehouses, downtown towers).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/citymesh.js`
Static world meshes: terrain, water, road surfaces, lane markings, sidewalks / blocks, decks (bridge road surfaces, rails, the Bay Bridge approach viaduct, piers). All merged per 400 m tile.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/collision.js`
Static oriented-box colliders in a spatial hash. Collider: {x, z, hx, hz, yaw, yMin, yMax, kind}

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/PROGRESS_V2.md`
Buildings v2 (1:1 OSM city): design + progress

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `d3f79ed` changed: Buildings v5: notes (PROGRESS_V2 / NEXT_SESSION)

### `src/world/facade/beacons.js`
Red aviation beacons on tall towers: one Points draw, blinking in the shader, only visible at dusk / night.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/decals.js`
Canvas atlases + materials for the near LOD: DECAL atlas (2048^2): 64 shop sign bands (invented SF names), 5 vertical blade/neon signs, 3 murals, ghost signs, lantern paper. Material: MeshStandard + alphaTest, emissive at night (lit signs, ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/emit.js`
Geometry writers for the facade material. MeshBuf: growable typed arrays in the facade vertex layout (position, normal(i8), aUv(vec4), aC(u8x4), aK, aId, [aG]). Frame: a local facade frame (u along the wall = "right" seen from outside, v up...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/far.js`
Far LOD: cheap massing per building, drawn with the procedural facade shader. Also emits the rooftop clutter (tanks, bulkheads, chimneys, pagoda roofs, antennas) with id -1, so it stays visible under the near LOD.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/kitleaf.js`
Leaf-card foliage for the v3 facade kit (look-dev pass): the Blender kit's shrubs / hedges / bougainvillea are solid displaced blobs; they read as green rocks. Here each foliage piece keeps its mesh as a slightly shrunk inner core and

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/layers.js`
Surface-material layers of the facade texture arrays (albedo+roughness / normal+AO+mask), generated on the GPU by texgen.js. TILE = metres covered by one texture repeat (UVs are emitted pre-divided by it). METAL = metalness of the layer.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/material.js`
One MeshStandardMaterial (+ onBeforeCompile) draws every opaque building surface, near and far: M_PROC/M_SIDE/M_BACK  far facades: windows, storefronts, garages, cornice band, recess parallax + interior mapping, analytic recess sun-shadow, ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `bb3858b` changed: Look: deep-blue sky (sat 0.8) + white cumulus again, less rain skyglow (muddy veil), night walls lifted under ACES (facade lamp-wall response)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/near.js`
Near LOD: real 3D street facades, streamed per CELL x CELL m cell around the camera and merged into 3 meshes per cell (facade material / alpha-tested ironwork / signs+murals). A cell's buildings are hidden in the far meshes once

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/plan.js`
Building planning: one spec per building (lots may split into terraced sub-buildings on steep streets). The spec drives both the far box LOD (far.js) and the near detailed LOD (near.js), and fills the params texture that the facade shader r...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/rooms.js`
Canvas atlas of furnished room back walls for the interior-mapping shader (fallback until baked atlases exist). 2048 x 1024 = 4 x 2 tiles of 512 x 512; each tile is a front view of a room's back wall (about 3.6 m wide, 3 m tall):

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/texgen.js`
GPU-generated, tileable PBR surface layers for the facades (brick, stucco, siding, stone, concrete, ...). Two WebGLArrayRenderTargets: ALB (rgb = sRGB albedo, a = roughness) and NRM (rg = tangent normal xy, b = AO, a = mask).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `src/world/facade/v2build.js`
Buildings v2 tile builders: pure functions over typed arrays, run in the build workers (v2worker.js) and, as a fallback during the loading fill, on the main thread. ctx = { B, P, R } where B = wrapB(footprint arrays), P = plan arrays

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `fedfd56` changed: Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v2city.js`
Buildings v2: the real 1:1 OSM city (178k footprints) drawn with the facade system (material.js procedural facades, interior mapping, night windows, one params texel block per building from v2plan.js). Tiers: FAR   whole city, merged per 2 ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `b18f3d9` changed: Building colliders: split rectangle-cover boxes that stick > 3 m out of the footprint (diagonal facades left invisible walls up to 28 m into Market St)
- 2026-10-01 `aaa9e34` changed: Buildings v5: near sun-shadow cascade on by default (high/ultra), detail-only casters + every-other-frame refresh
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v2detail.js`
Buildings v2 silhouette detail (kills the "square box" look). Pure functions over the plan arrays, run in the build workers with v2build.js: MID  (<= 1.4 km, merged into the tile mesh): projecting cornices, storefront cornice + belt courses...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v2dress.js`
Buildings v2 storefront dress, main-thread half: the canvas atlas (fictional district shop signs, bilingual Chinatown signs, CJK + English neon blade words, awning canvases, lanterns, glow / spill / pool gradients), the materials and

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/world/facade/v2dressgeo.js`
Buildings v2 storefront dress, geometry half (pure: runs in the build workers, one 512 m tile per job). Every street-facing storefront (ground type STORE: commercial corridors from v2plan.js, commercial styles, Tenderloin / Civic apartments...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/facade/v2geom.js`
Buildings v2 geometry: footprint utilities (closed Douglas-Peucker, party-wall raster) and the emitters for the three LOD tiers of the real OSM city. Everything writes MeshBuf vertices for the shared facade material (material.js):

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)

### `src/world/facade/v2lots.js`
Buildings v2 rowhouse individuation. OSM often traces a whole row of San Francisco houses as one long footprint, which then renders as one long box (one colour, one height, one flat roof). Here every residential footprint whose street

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v2plan.js`
Buildings v2 global pass: one tight loop over every real OSM footprint (178k) -> neighbourhood zone (real lat/lon), architectural style (zone + height + kind + area + levels), oriented bounding box, street-facing walls (outward probe

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fedfd56` changed: Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v2worker.js`
Buildings v2 build worker: holds a copy of the footprint + plan arrays and builds FAR chunks, MID tiles, NEAR tiles (facade detail + merged Blender kit pieces) and storefront DRESS tiles off the main thread. Geometry comes back as

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers

### `src/world/facade/v3front.js`
Buildings v3 NEAR street facades: real geometry for the street walls of the 1:1 OSM city (runs in the build workers with v2build.js buildNearTile). Replaces the MID procedural wall of a street front (flat quad with shader windows)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `fedfd56` changed: Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests

### `src/world/facade/v5mass.js`
Buildings v5 massing variety ("clean CG boxes" fix, part 2). Pure functions over the plan arrays, run in the build workers with v2build.js emitMid (MID geometry, shown at every distance up to the MID range; none of it is replaced by

- 2026-10-01 `a61b163` added: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
- 2026-10-01 `fedfd56` changed: Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests

### `src/world/geo.js`
Small geometry accumulator + 2D polygon helpers shared by the world builders.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/grass/capture.js`
Placement data for the ground-cover shaders. GroundCapture: an orthographic top-down render of the ground meshes around the camera into a float target (R = ground height, G = blocked (road / sidewalk / building / deck), B = ground present)....

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/grass/glsl.js`
Shared GLSL for the ground-cover layers (grass, flowers, ferns, shrubs, rocks). Every object is placed procedurally in the vertex shader from (chunk, object index): a hashed position inside the chunk, the ground capture (height, blocked mas...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/grass/index.js`
GPU grass + ground cover (both maps). Ring of camera-centred, world-aligned chunks per layer; each visible chunk is one instance of a batch geometry holding N objects, placed/animated entirely in the vertex shader (glsl.js). CPU per frame:

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/grass/layers.js`
Ground-cover layers: object templates (CPU, built once), per-layer batch geometry (N copies of the template per chunk instance) and the materials (MeshStandardMaterial + onBeforeCompile; placement, wind and colour are in glsl.js).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/arch.js`
Architectural helpers shared by the buildings: thick walls with openings (outer face + reveals), windows with frames / sashes / glazing, exterior trims. A wall is described in its own 2D (u along the wall, v = height): W = { axis: 'z' | 'x'...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/atlas.js`
One shared 2048x2048 canvas atlas for every interior sign, screen, poster and label (one texture, two materials). Regions are packed in rows on first use and redrawn if the web fonts arrive later.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/bodega.js`
21ST STREET MARKET: a Mission corner bodega at Mission St & 21st. Green stucco storefront with a striped awning and a lit box sign; inside: speckled VCT floor, drop ceiling with fluorescent troffers, two gondola aisles packed with

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/cafe.js`
FOGLINE COFFEE: a Hayes Valley third-wave cafe at Hayes & Octavia, in the ground floor of a butter-yellow Victorian. Black steel-and-glass storefront, white tile + plaster walls, warm oak floor, espresso bar with a big chrome machine and a ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/diner.js`
SEA LION DINER: a stainless 1950s diner at Beach & Taylor (Fisherman's Wharf). Checkerboard floor, red vinyl booths along the windows, a long counter with chrome stools, back bar with pie case and milkshake mixers, kitchen pass-through, juk...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/extras.js`
Lived-in extras: pool table, billiard lamp, sideboard with a record player, side table, guitar, skateboard, wall shelf, clock, ceiling medallion, throws and cushions. Same conventions as furniture.js.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/furniture.js`
Reusable furniture and fixtures. Every piece is built in its own frame: origin on the floor at the piece's centre, front facing -Z. Place with kit.at(x, y, z, yaw, k => sofa(k, {...})). Pieces register their own contact shadows

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/hero_int.js`
Walk-in interiors of the Blender-baked hero landmarks (St. Francis lobby, Neiman rotunda, Apple hall, Garden Court ...). Same contract as sys_interiors: on foot, press E at the door -> fade -> teleport inside; E at the inside door leaves.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` changed: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
- 2026-10-01 `4346943` changed: Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
- 2026-10-01 `5dfaa4d` changed: Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
- 2026-10-02 `8609279` changed: Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg

### `src/world/interiors/hero_int_expo.js`
GENERATED by tools/blender/int_expo.py from review shots: per-interior lightmap exposure trim (hero_int.js).

- 2026-10-01 `3d8c0be` added: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
- 2026-10-01 `5dfaa4d` changed: Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
- 2026-10-02 `8609279` changed: Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg

### `src/world/interiors/hero_int_life.js`
Ambient life inside the hero interiors: a few idle / seated people (the street crowd's human builder + pool) and an indoor sound bed (procedural murmur + a hall reverb on the effects bus). Only runs while the player is inside a room.

- 2026-09-30 `9b6cda8` added: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `35be7a7` changed: Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `src/world/interiors/hide.js`
Runtime fallback for lots the building generator did not skip: remove their colliders and hide their meshes. Buildings v2 (facade/*: far tiles + streamed near LOD with a per-building hide texture): mark the building hidden in

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/kit.js`
Interior geometry kit: a transform-aware mesh accumulator with per-vertex albedo, roughness/metalness, procedural surface pattern ids and a CPU light bake (room AO + furniture contact AO + point / spot / window lights). Everything a site bu...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/materials.js`
Shared interior materials: one uber MeshStandardMaterial (vertex albedo, per-vertex roughness/metalness, baked light, window sky light, procedural surface patterns), glazing, unlit HDR glow, and two atlas materials (glowing signs,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/parking.js`
SOMA PARK & RIDE: a four-level open-deck parking garage + roof, drivable end to end. Split-lane layout (local frame, front = King St on -Z): two 6.2 m ramp lanes along the long sides, parking in the middle. Up-ramps alternate lanes (E lane:...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/pizza.js`
BELLA NONNA PIZZERIA: a North Beach slice shop on Columbus Ave. Red-brick storefront with a green striped awning, neon PIZZA blade; inside: small white tiles, exposed brick, a glowing wood-fired oven, a glass pizza display at the

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/safehouse.js`
SAFEHOUSE: a three-storey Painted-Lady Victorian on the NW corner of Hyde & Filbert (Russian Hill crest). Street level: garage (roll-up door, car terminal) + entry hall with a stair. First floor: the apartment (living room with a canted bay...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/shop.js`
Street-front shop shell shared by the diner, bodega, cafe and pizzeria: a 1-3 storey building on its lot with a glazed storefront (bulkhead, mullions, transom, sign band, swing door), optional corner windows, awning and blade

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/showroom.js`
BAY MOTORS: a glass-fronted corner dealership at King St & 4th St (SoMa). Double-height hall with a polished terrazzo floor, black ceiling with light rings over six display cars on turntables (one on a raised hero stage),

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/site.js`
Site frame: converts a building's local layout (origin = footprint centre at floor level, front on local -Z) into world colliders, drivable decks, interaction points, door pairs, camera ceilings and "inside" volumes.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/sites.js`
Where the enterable buildings go. Nothing here is a hard-coded map position: every site is placed by a query that survives map rebuilds (hand-built v1 grid or the 1:1 OpenStreetMap v2 map): 1. anchor = the intersection of two named streets ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/interiors/ui.js`
Interior menus (garage terminal, showroom car card, bed, counters, elevator) + a fade-to-black for door transitions. Menus pause the game (G.state = 'paused') like the pause menu does, and take keyboard input in the capture phase so

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/keepout.js`
Keep-out corridors: active race / mission lines. Streamed obstacles (trees, street props, parked cars) inside an active corridor are hidden with their colliders, for tiles already loaded AND tiles that stream in later (props/v2.js re-tests

- 2026-10-01 `afaae5a` added: Race corridors: world/keepout.js; props/v2 hides trees / street props + colliders inside an active race line (loaded and streamed tiles), +3 m at corners; street furniture on carriageways not placed

### `src/world/landmarks.js`
HILLBOMB landmarks: procedural, recognisable San Francisco landmarks (no asset files). buildLandmarks({ heightAt }) -> { group, colliders, update(dt, env) } Every landmark is also exported on its own (same return shape) for the dev preview ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/PROGRESS_V2.md`
Landmarks v2 (1:1 real map): status 2026-09-28 evening

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `5dfaa4d` changed: Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `src/world/landmarks/bay.js`
Alcatraz, the ballpark (Oracle-style, unbranded), Fisherman's Wharf sign.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/bayBridge.js`
Bay Bridge west (suspension) span: SF anchorage -> 2 towers -> centre anchorage -> 2 towers -> YBI anchorage. Bridge frame: local x = lateral l (+ = south-east side), local z = -s, y = world height.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/civic.js`
City Hall, Grace Cathedral, Coit Tower, Painted Ladies.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/downtown.js`
Downtown landmarks: Transamerica Pyramid, Salesforce Tower, Ferry Building.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/goldenGate.js`
Golden Gate Bridge. Built in the bridge frame: local x = lateral l (+ = east side), local z = -s, y = world height.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/kit.js`
Landmark construction kit: per-material geometry batching with vertex colours, shared materials, primitive helpers and collider bookkeeping. Every landmark builds into one Kit (its own THREE.Group, one mesh per material).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/v2/bay2.js`
San Francisco-Oakland Bay Bridge, west (suspension) span, real scale on the v2 map. Axis SF (2525.8,-1254.6) -> YBI (4590.8,-3682.5) (BAY2 in anchors2.js). s = metres from the SF end, l = lateral. Two back-to-back suspension bridges (main s...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/v2/ct_street.js`
Chinatown hero streets: darker, broken, puddled asphalt (a multiply decal over the carriageway of ct_zone.js runs). The concept's street is near-black wet asphalt with patchy repairs and standing water; ours read smooth grey. The decal

- 2026-10-02 `af8b9db` added: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py

### `src/world/landmarks/v2/ct_zone.js`
GENERATED by tools/blender/ct_plan.py: the Chinatown hero streets (Grant Ave Bush..Broadway, Washington / Clay / Sacramento / Jackson one block each side, Waverly Place). seg = [name, a [x, z], b [x, z], width, sidewalk].

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass

### `src/world/landmarks/v2/extra2.js`
v2-only landmarks (real scale): Embarcadero Center night outlines, Pier 39 gate, Conservatory of Flowers, de Young Hamon tower, Legion of Honor, Mission Dolores, Castro Theatre sign, Chinatown Dragon Gate, Union Square Dewey column,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/v2/gg2.js`
Golden Gate Bridge at real scale on the v2 (1:1) map. Frame: GG2 axis (anchors2.js), s = metres north of the south tower, l = lateral (+ east). Kit local: x = l, z = -s, y = world height. Real dims: main span 1280 m, side spans 343 m, tower...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/v2/hero_live.js`
live hero site list (hero_lm.js fills it; render/streetmirror.js draws the Chinatown blocks' LOD1 into the wet-street mirror)

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B

### `src/world/landmarks/v2/hero_lm.js`
Blender-baked 1:1 hero landmarks (Union Square, Market St / FiDi ...): GLB LODs streamed by tile. Assets: public/assets/landmarks/<id>/<id>_lod0.glb (full detail, < ~450 m) and _lod1.glb (flat windows, far), built by tools/blender/hero_wave...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `0543bf1` changed: Chinatown: lantern halos toned down and kept out of the street mirror, comparison sheet (shots/chinatown_vs_ref.jpg), review views (ref / refday / drives), QUALITY note
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `src/world/landmarks/v2/hero_mats.js`
Materials for the Blender-baked hero landmarks (tools/blender/hero_*.py -> public/assets/landmarks/<id>/*.glb). GLB nodes are named L<lod>_<slot>; every slot maps to ONE shared material here (compiled once for all heroes).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `0543bf1` changed: Chinatown: lantern halos toned down and kept out of the street mirror, comparison sheet (shots/chinatown_vs_ref.jpg), review views (ref / refday / drives), QUALITY note
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `src/world/landmarks/v2/hero_sites.js`
GENERATED by tools/blender/hero_index.py from the Blender hero builds. Do not edit by hand. origin = [x, yBase, z] (world); hide = OSM building indices replaced; colliders in world coordinates.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` changed: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `4346943` changed: Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `src/world/landmarks/v2/lm2.js`
Landmarks on the v2 (1:1 real) map. registerLandmarksV2(stream, ctx) is called by world2.js. heroes (bridges, towers, anything seen from across the city) are built once and stay loaded; their fine detail (suspenders, truss web, lamp posts) ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/v2/mats2.js`
v2 landmark materials: the kit's shared materials get a world-space (triplanar) weathering pass so 200 m structures don't read as flat plastic: large-scale tone variation, fine grit, vertical rain streaks and roughness breakup.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/landmarks/west.js`
Palace of Fine Arts, Cliff House (+ Sutro Baths ruins), Sutro Tower, Hawk Hill vista.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/latlon.js`
Real-world lat/lon <-> world metres (+X east, +Z south). Author all placed content (events, festival sites, collectibles, story beats) in REAL lat/lon through ll(), never raw x/z, so it survives map rebuilds. The current hand-built map ('v1...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/map.js`
The San Francisco map: coastline, hills, the street grid, special roads, decks (bridges, ramps, piers), parks. Pure data + pure functions (no three.js). World frame: +X east, +Z south, +Y up, metres. See anchors.js.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props.js`
Street dressing for HILLBOMB: street + park trees (near 3D canopies, far billboards), lamps with night light pools, live traffic signals, stop signs, street-name blades, Muni trolley wires, Sunset/Richmond utility poles, sidewalk

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/fx.js`
Breakable prop effects: knocked-over props (animated copies in the model's own InstancedMesh), tumbling shards, and the hydrant water geyser (pooled Points). All pools are preallocated.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/instset.js`
InstanceSet: one InstancedMesh per prop model with CPU cell culling (distance + frustum), hide-by-index for breakables, extra "dynamic" slots for animated debris (knocked-over lamps etc). No per-frame allocations.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/kit.js`
Tiny procedural mesh kit for street props and trees: primitives emitted through a transform stack into one buffer set (position, normal, color, uv, aSurf = [nightGlow, roughness, metalness, dayGlow], optional aSway). Object local frame: +X ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/lanterns2.js`
v2 (real 1:1 map) Chinatown street dressing: red lantern strings (and a few warm bulb festoons) zig-zagging across the real Chinatown streets: Grant Ave densest (like the real thing), Stockton / Washington / Jackson / Pacific /

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9fd802a` changed: Night regression fixes: ACES tone map again (AgX via ?tm=agx), saturated lights bloom, lanterns glow, no player headlight pool smear, subtle lamp cones, lens drops off; dev/regress_shots.js
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B

### `src/world/props/models.js`
Street prop models (merged Kit geometry per model, vertex colours + aSurf material channels). Local frame: origin at the base on the ground, +Y up, -Z = the side facing the road (lamp arms reach toward -Z).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/nightdress.js`
Street dressing, city-wide (render agent): festoon string lights and red lantern strings zig-zagging across narrow commercial streets (dense in Chinatown, sparser in North Beach / Mission / Castro / the Wharf) and litter along the

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels

### `src/world/props/pierdeck.js`
Pier 39 boardwalk: the baked terrain models the pier as land (rock-textured slopes, bumpy top, rocky marina ridges). This lays a flat plank deck over every land cell of the pier complex, with a dark fascia + pilings down to the water,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/textures.js`
Canvas-painted atlases for street props: prop faces (signs, ads, meters), street-name blades, road decals, foliage (leaf clusters, palm fronds, bark) and the far-tree impostors. No image assets.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/trees.js`
Trees: photoreal San Francisco species baked in Blender by tools/blender/trees.py (public/assets/trees/, see trees.json). near = LOD0 glb (space-colonisation bark tubes + leaf cards rendered from real 3D leaves, 1-11k tris), instanced per s...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `src/world/props/v2.js`
Street dressing for the 1:1 map (?map=v2), streamed per 512 m tile from the real road graph: trees     : real OSM street trees + generated sidewalk trees (species by neighbourhood / boulevard) + park trees by surface class (forest / lawn / ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `b19378b` changed: Race corridors also hide parked cars that stream in after the start (they were only cleared on loaded tiles: obstacles further along, e.g. Macalla Rd)
- 2026-10-01 `afaae5a` changed: Race corridors: world/keepout.js; props/v2 hides trees / street props + colliders inside an active race line (loaded and streamed tiles), +3 m at corners; street furniture on carriageways not placed

### `src/world/props/v2blocks.js`
City blocks for the 1:1 map, in the v1 block shape the pedestrian nav understands ({ id, poly (convex curb polygon), inner (lot line), cx, cz, zone, park }). Faces of the planar street graph (decks, highways, alleys and dead ends left

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/v2set.js`
StreamSet: the tile-streamed twin of InstanceSet (same constructor + add() + cull() + hide/show + addDynamic), for the 1:1 map. Instances arrive in per-tile CHUNKS (begin(key) ... add() ... end()) and leave with drop(key); one

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/v2zones.js`
Neighbourhood character for the 1:1 map: the v1 zone keys (props / peds styles + densities) from the real districts, crowd hot spots, commercial corridors and Muni trolleybus streets by their real (OSM) names.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/props/wires.js`
Overhead wires (Muni trolley contact wires, span wires, utility lines, service drops) as 1 px line segments, chunked for frustum culling, faded with distance so the far web doesn't turn into noise.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/roads.js`
Road graph (nodes / edges with polylines, lanes, names) built from the street grid + special roads + drivable decks. Used by traffic AI, GPS routing, the minimap and the road meshes.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/terrain.js`
Heightfield: natural terrain (map.H0) blended with the street-grid lattice (flat intersections joined by straight ramps = the San Francisco hill-jump profile), then special roads carved in. Also the elevated decks (bridges, the

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/texpack.js`
GPU-compressed texture variants (tools/texpack.py): <name>.dds (BC1 opaque / BC3 alpha, full mip chain, pre-flipped to match the original's flipY) next to the JPG/PNG/WebP. BC1 = 0.5 B/px, BC3 = 1 B/px vs 4 B/px for the decoded image:

- 2026-09-30 `4075efc` added: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass

### `src/world/textures.js`
Canvas-generated tiling textures (no image assets).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/anchors2.js`
Real-scale (1:1) landmark anchors for the v2 map. Pure data + tiny helpers, no three.js imports. WORLD FRAME: metres, +X east, +Z south, +Y up, sea level 0 (same as anchors.js). Projection: EXACTLY the bake's (tools/map/common.py, public/as...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/districts2.js`
San Francisco neighbourhoods (real centres, radius in m) for the HUD location label on the 1:1 map.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/googletiles.js`
Google Photorealistic 3D Tiles (Map Tiles API) as the mid/far city on the 1:1 map. Our own city (roads, facades, props, physics) owns the 3x3 block of 512 m stream tiles around the player; the photogrammetry fills everything beyond it.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `src/world/v2/graph2.js`
Road graph for the 1:1 real-data map, in the same node/edge shape as world/roads.js (traffic, drivers, GPS, police, events, props all consume it unchanged). Bridges, viaducts and tunnels become terrain decks.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fbc705c` changed: Decks: single-lane ramp decks get a shoulder (>= 3.2 m to the barrier), no barrier stubs on an at-grade ground carriageway, tunnel walls stop under the surface above

### `src/world/v2/mapdata.js`
Loader for the baked 1:1 San Francisco (tools/map -> public/assets/map/). Decodes everything into typed arrays. Map data (c) OpenStreetMap contributors (ODbL); elevation: AWS Terrain Tiles (USGS 3DEP, NOAA). See meta.attribution.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/roadmesh.js`
Streamed road surfaces for the 1:1 map: asphalt ribbons trimmed at junctions + a junction polygon (curb corners solved from the real street angles), sidewalks with curbs wrapping the corners, lane markings, crosswalks / stop

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fbc705c` changed: Decks: single-lane ramp decks get a shoulder (>= 3.2 m to the barrier), no barrier stubs on an at-grade ground carriageway, tunnel walls stop under the surface above

### `src/world/v2/stream.js`
Tile streamer for the 1:1 map. The city is cut into 512 m tiles; every content module registers a PROVIDER and the streamer loads/unloads its tiles around the focus (player/camera), nearest first, within a per-frame time budget.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/terrain2.js`
Terrain for the 1:1 real-data map. Same query API as world/terrain.js (heightAt, groundAt, surfaceAt, deckAt, addDeck, curbAt, decks) so physics, AI and every placement module work unchanged. Heights are the baked 4 m grid (roads already

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/terrainmesh.js`
Streamed terrain for the 1:1 map: per 512 m tile, 3 LODs (4 m near, 8 m mid, 32 m far) chosen by distance with hysteresis; far tiles are merged into 2 km chunks (few draw calls) and rebuilt without the tiles that went finer.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/world2.js`
World assembly for the 1:1 real-data San Francisco (?map=v2). Same world API as world.js, content streamed by tile.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/world.js`
World assembly: terrain -> road graph -> blocks -> meshes -> buildings -> landmarks -> props. Returns the query API.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `tools/blender`

### `tools/blender/_compose.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/bake_all.py`
Re-bake everything: projection check, rooms atlas, shops atlas, contact sheet.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/car_hero.py`
HILLBOMB hero car detail pass (called by cars.py for the hero / top-traffic ids, input <id>.hero.json).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/car_hero_preview.py`
Review renders of the hero detail pass (no bake, no export): shots/car2_blend_<id>.jpg (4 views, 2x2).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/car_textures.py`
Shared car detail textures (height fields -> tangent-space normal maps, numpy), saved through bpy.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/cars.py`
HILLBOMB car assets: Blender pass over the procedural car models.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `c750d23` changed: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper

### `tools/blender/cars_export.mjs`
Dump the procedural car models (HQ loft) for tools/blender/cars.py.  node tools/blender/cars_export.mjs [--hero] [ids...] --hero: denser loft (_hq2) + the detail-call records / per-vertex tags used by tools/blender/car_hero.py

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/ct_pack.py`
Chinatown hero set -> BC1 .dds next to the JPEG/PNG (plain python: numpy + PIL, tools/texpack.py encoder).

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B

### `tools/blender/ct_plan.py`
Chinatown hero set plan (plain python, no bpy): which OSM footprints front the hero streets, grouped into blocks.

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass

### `tools/blender/ct_signs.py`
Chinatown hero set textures (plain CPython + Pillow, not Blender): shop-sign atlas + shop-interior atlas.

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass

### `tools/blender/facade_kit.py`
HILLBOMB facade kit: high-detail San Francisco facade units modelled in Blender and baked

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hb_kit.py`
Larger assemblies for the interior bakes: kitchens, offices, renovation props,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hb_lib.py`
HILLBOMB Blender baking library: scene/render setup, interior-mapping camera,

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hb_props.py`
Procedural furniture / props for the HILLBOMB interior bakes.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_ctown.py`
HILLBOMB Chinatown hero set: Grant Avenue (Bush .. Broadway) + Washington / Clay / Sacramento / Jackson (one block each

- 2026-10-01 `d4b928d` added: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `tools/blender/hero_extract.mjs`
HILLBOMB hero landmarks: dump the OSM footprints + nearby streets around each hero site (input for hero_*.py). node tools/blender/hero_extract.mjs  -> tools/blender/_cache/hero/sites.json

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass

### `tools/blender/hero_index.py`
Collect tools/blender/_cache/hero/<id>.json into src/world/landmarks/v2/hero_sites.js (plain python, no bpy)."""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-10-01 `d4b928d` changed: Chinatown hero set (WIP): Blender block builder (hero_ctown.py: Grant Ave + side streets + Waverly, shops, signs, fire escapes, lanterns, Dragon Gate), day/night exterior lightmaps, sign/shop atlases, wet-street planar mirror in the SSR pass
- 2026-10-01 `272db80` changed: Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B

### `tools/blender/hero_int_dress.py`
Interior dressing kit (round 2): the clutter that makes a hall read as a real place. All small parts go into 'd_*' detail slots

- 2026-10-01 `3d8c0be` added: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_int_pack.py`
Hero interior lightmaps / sign atlases -> BC1/BC3 .dds next to the JPEG/PNG (plain python: numpy + PIL).

- 2026-09-30 `9b6cda8` added: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` changed: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_int_w1.py`
HILLBOMB hero interiors, wave 1 (Union Square). Run:  python hero_int_w1.py -- stFrancis [--res 2048 --spp 384]"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `54aafd7` changed: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
- 2026-10-02 `8609279` changed: Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg

### `tools/blender/hero_int_w2.py`
HILLBOMB hero interiors, wave 2. Run:  python hero_int_w2.py -- palace [--res 2048 --spp 256]"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere

### `tools/blender/hero_int_w3.py`
HILLBOMB hero interiors, wave 3. Run:  python hero_int_w3.py -- cityHall opera ferry coit [--res 2048 --spp 256]"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js

### `tools/blender/hero_int_w4.py`
HILLBOMB hero interiors, wave 4. Run:  python hero_int_w4.py -- castro missionDolores ... [--res 2048 --spp 256]"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_int_w5.py`
HILLBOMB hero interiors, wave 5. Run:  python hero_int_w5.py -- fortPoint alcatraz ... [--res 2048 --spp 256]

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_int_w6.py`
HILLBOMB hero interiors, wave 6: the landmarks that had no walk-in yet.

- 2026-10-01 `8174630` added: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
- 2026-10-01 `4346943` changed: Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
- 2026-10-02 `8609279` changed: Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg

### `tools/blender/hero_interior.py`
HILLBOMB hero interiors: room kit + Cycles lightmap bake + export (Blender 5.x).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` changed: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` changed: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_lib.py`
HILLBOMB hero landmarks: geometry kit + bake/export pipeline (Blender 5.x, bpy).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-02 `af8b9db` changed: Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg

### `tools/blender/hero_murals.py`
Original mural atlas for Balmy Alley (plain CPython + Pillow, not Blender).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_props.py`
Poly Haven furniture / decor in the hero interiors (Blender side).

- 2026-09-30 `54aafd7` added: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/hero_signs.py`
Shop-sign atlas for hero interiors (plain CPython + Pillow, not Blender).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_wave1.py`
HILLBOMB hero landmarks, wave 1 (Union Square) + shared architecture helpers.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_wave2.py`
HILLBOMB hero landmarks, wave 2 (Market St / Financial District).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_wave3.py`
HILLBOMB hero landmarks, wave 3 (Civic Center + Embarcadero / waterfront + Telegraph Hill).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/hero_wave4.py`
HILLBOMB hero landmarks, wave 4 (neighbourhoods + parks).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere

### `tools/blender/hero_wave5.py`
HILLBOMB hero landmarks, wave 5 (waterfront + icons).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `8174630` changed: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere

### `tools/blender/int_assets.py`
Interior asset library: CC0 PBR materials (ambientCG, Poly Haven) + Poly Haven furniture models (plain python).

- 2026-09-30 `54aafd7` added: Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/int_expo.py`
Per-interior exposure trim from review shots (plain python): mean linear luminance of shots/int_<id>_<tag>.jpg (centre 80 %,

- 2026-10-01 `3d8c0be` added: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes

### `tools/blender/kit_city.py`
HILLBOMB city kit: reusable street-facade and rooftop pieces for the v2 (real 1:1 OSM) buildings, modelled in

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/kit_facade3.py`
HILLBOMB facade kit v3: real-geometry street-facade pieces for the NEAR tier of the v2 (1:1 OSM) buildings

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/peds/build_avatars.py`
Rocketbox avatars -> public/assets/peds/<id>.glb (+ <id>_alb.webp / <id>_nrm.png; tools/texpack.py makes the .dds) One skinned material per character: the body / head / hair / extra textures are packed into one 2048x1024 atlas

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/blender/peds/build_clips.py`
Rocketbox mocap -> public/assets/peds/clips.bin + clips.json (shared 34-bone skeleton, game space, 30 fps). Per frame: pelvis position (game space, in place) + local rotation quaternion of every bone (pelvis = world). Locomotion clips are c...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/blender/peds/build_index.py`
public/assets/peds/index.json: avatar list + crowd tags (style pools) from the per-avatar json files.

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/blender/peds/common.py`
Shared helpers for the pedestrian pipeline (Rocketbox -> HILLBOMB). Run with tools/.venv-blender python (bpy module). GAME SPACE: metres, +X right, +Y up, -Z forward (character faces -Z), feet at y = 0. Blender world (after FBX import): Z u...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/blender/peds/fetch_rocketbox.py`
Re-download the Rocketbox sources used by the ped pipeline into tools/peds_src (gitignored, ~4.7 GB). MIT licence. usage: cd tools/peds_src && python ../blender/peds/fetch_rocketbox.py

- 2026-10-01 `3b3e0ca` added: Peds: asset fallback to procedural humans, phone/umbrella props, shot + perf dev helpers, Rocketbox fetch script

### `tools/blender/preview.py`
Contact sheet for review: public/assets/baked/rooms_preview.png

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/review.py`
Quick review sheet of cached tiles: review.py rooms|shops idx,idx out.png [scale]"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/rooms.py`
HILLBOMB interior-mapping room atlas generator (Blender/Cycles).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/shops.py`
HILLBOMB storefront interior-mapping atlas (Blender/Cycles).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/smoke.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/stats.py`
Print mean luma / lit fraction of cached tiles: stats.py rooms|shops"""

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/trees.py`
HILLBOMB photoreal street / park trees, produced in Blender (Cycles) + numpy.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/verify_projection.py`
Verify the interior-mapping camera against the facade-shader contract.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `tools`

### `tools/devbuild.mjs`
Orchestrator test server: rebuilds dist-dev/ on change (vite build --watch) and serves it statically on :5191. Pages never auto-reload, so long-running in-browser tests are not interrupted by other authors' edits.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/fetch_assets.py`
Downloads the CC0 (public domain) PBR materials (ambientCG) and HDRI skies (Poly Haven) used by the game into public/assets/. Re-running skips files that already exist. Writes public/assets/manifest.json + ASSET_LICENSES.md.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `tools/map`

### `tools/map/README.md`
1:1 San Francisco map bake (v2)

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/common.py`
Shared constants/helpers for the 1:1 San Francisco map bake. The projection MUST match src/world/latlon.js (v2).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/convert_osm.py`
Converts raw/SanFrancisco.osm.gz (BBBike extract, OSM XML; (c) OpenStreetMap contributors, ODbL 1.0) into the same per-category JSON shape Overpass "out body geom" returns (raw/osm_<cat>_0.json), cropped to BBOX.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/demtest.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/fetch_dem.py`
Downloads elevation tiles (Terrarium PNG encoding, AWS Open Data "Terrain Tiles", s3://elevation-tiles-prod; in the US the source is USGS 3DEP, public domain; bathymetry from NOAA/GEBCO/ETOPO1) covering the map bbox at zoom 14 (~7.6 m/pixel...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/fetch_osm.py`
Downloads the real-world source data for the 1:1 San Francisco map into tools/map/raw/ (not shipped; bake.py turns it into public/assets/map/). OpenStreetMap data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyr...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/preview.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/preview2.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/stage_buildings.py`
Stage 4: buildings. OSM footprints (+ building:part for detailed towers) with real heights where tagged, estimated otherwise; base elevation from the carved heightfield; grouped by 512 m tile. Output cache/buildings.pkl.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/stage_dem.py`
Stage 1: elevation. Terrarium tiles -> world-aligned 4 m heightfield (float32, metres), cached to cache/dem.npy.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/stage_export.py`
Stage 5: write the game data to public/assets/map/. meta.json                 extent, projection, tiles, counts, attribution height.bin.gz             Int16 centimetres, NZ x NX, row-major (4 m cells, x fastest) surf.bin.gz               Ui...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/stage_land.py`
Stage 3: land/water from the OSM coastline, surface classes from land use, lakes, piers, and the final heightfield with every ground road carved in (flat across, cut/fill blended into the hillside).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/map/stage_roads.py`
Stage 2: road graph from OSM. Split ways at shared nodes, classify, widths/lanes/oneway, clip to the map, heights: ground roads follow the DEM with FLAT intersection plateaus (the SF "crest" profile), bridges/viaducts and tunnels

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `112afa9` changed: Map bake: tunnel portal approaches straightened (YBI east portal dropped 4.6 m out of the bore); stacked I 80 deck offset moved to structure nodes (sqrt(sin) hump made 56-107 % grades on the YBI viaduct)


## `tools`

### `tools/texpack.py`
Offline GPU texture packer: JPG/PNG/WebP -> DDS (BC1/DXT1 or BC3/DXT5) with a full mip chain, pre-flipped for WebGL.

- 2026-09-30 `4075efc` added: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/upgrade_tex.py`
Re-download selected ambientCG (CC0) materials at higher resolution and store them as quality JPEGs in public/assets/tex/<key>/.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `(root)`

### `trees.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `vite.config.js`
Dev: never auto-reload pages on file changes (several authors edit src/ in parallel; reload manually).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## Asset folders (`public/assets/`)

### `public/assets/ASSET_LICENSES.md/` (1 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `54aafd7` Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-09-30 `be35afd` Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-01 `35be7a7` Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla
- 2026-10-01 `3d8c0be` Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
- 2026-10-01 `272db80` Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B

### `public/assets/audio/` (155 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `35be7a7` Audio review: mix levels + side-chain, no traffic drone, tunnel reverb, road surfaces (rails/brick/crosswalk/wet), district street life (Chinatown night market, Market St streetcar, cable cars), footsteps, indoor walla

### `public/assets/baked/` (15 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `public/assets/cars/` (178 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `c750d23` Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper

### `public/assets/hdri/` (9 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `public/assets/kit/` (15 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `public/assets/landmarks/` (723 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `4346943` Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `272db80` Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `5dfaa4d` Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
- 2026-10-02 `af8b9db` Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `8609279` Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg

### `public/assets/manifest.json/` (1 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `public/assets/map/` (7 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `112afa9` Map bake: tunnel portal approaches straightened (YBI east portal dropped 4.6 m out of the bore); stacked I 80 deck offset moved to structure nodes (sqrt(sin) hump made 56-107 % grades on the YBI viaduct)

### `public/assets/peds/` (321 files)

- 2026-09-30 `be35afd` Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `public/assets/tex/` (164 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `public/assets/texpack.json/` (1 files)

- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-09-30 `be35afd` Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `public/assets/trees/` (85 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
