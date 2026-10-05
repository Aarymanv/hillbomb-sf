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
- 2026-10-03 `84fdab5` changed: NEXT_SESSION / QUALITY: cars pass 3
- 2026-10-04 `ec737ee` changed: NEXT_SESSION / QUALITY: people round 2 + interiors round 3 notes, perf / VRAM numbers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `bbcbc13` changed: NEXT_SESSION / QUALITY: gameplay + nature round 3 (off-road routing / AI, police spawns, Pier 39 deck, ice plant / lupines, rain flicker measurement)
- 2026-10-04 `954f475` changed: NEXT_SESSION: world round 2 notes; dev/world2_flick.js (real-time flicker probe on the yard views + regression set), dev/world2_perf.js (1920x1080 district drives: frame / GPU / VRAM)
- 2026-10-04 `b9878c1` changed: NEXT_SESSION / QUALITY: cars pass 4 (doors, interior materials, light bars, 45 bodies) notes + checks
- 2026-10-04 `8238972` changed: NEXT_SESSION / QUALITY: perf pass 10/4 (measurements, switches, open items for the cars owner)
- 2026-10-04 `14bef88` changed: NEXT_SESSION / QUALITY: perf round 2 (cars) notes, measurements, open items
- 2026-10-04 `d1a4a79` changed: NEXT_SESSION / QUALITY: perf round 3 (tiles slicing, spikes, streaming, physics smoothing) notes, interleaved before / after, open items; boot stage text 'Decoding textures'

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
- 2026-10-03 `84fdab5` changed: NEXT_SESSION / QUALITY: cars pass 3
- 2026-10-04 `ec737ee` changed: NEXT_SESSION / QUALITY: people round 2 + interiors round 3 notes, perf / VRAM numbers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `bbcbc13` changed: NEXT_SESSION / QUALITY: gameplay + nature round 3 (off-road routing / AI, police spawns, Pier 39 deck, ice plant / lupines, rain flicker measurement)
- 2026-10-04 `b9878c1` changed: NEXT_SESSION / QUALITY: cars pass 4 (doors, interior materials, light bars, 45 bodies) notes + checks
- 2026-10-04 `8238972` changed: NEXT_SESSION / QUALITY: perf pass 10/4 (measurements, switches, open items for the cars owner)
- 2026-10-04 `14bef88` changed: NEXT_SESSION / QUALITY: perf round 2 (cars) notes, measurements, open items
- 2026-10-04 `d1a4a79` changed: NEXT_SESSION / QUALITY: perf round 3 (tiles slicing, spikes, streaming, physics smoothing) notes, interleaved before / after, open items; boot stage text 'Decoding textures'

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

### `dev/bld6_alt.js`
headless body: frame-parity flicker check (__altStat, load-independent) at aerial views, env paused

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_close.js`
headless body: close-ups of v6 features (stucco oriel bay, arched Marina windows) via bld5shots __bld5Close

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_dbg.js`
headless body: debug the v6 yard emission on the MID tile around a point (window.__dbgAt)

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_gpu.js`
headless body: GPU A/B at fixed spots (5 x 40-frame medians), page variants via the URL (&nov6, &noyardtrees)

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_perf.js`
headless body (perf / memory A/B for the buildings v6 pass), page with &memtrack, A = &nov6: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&memtrack[&nov6]" dev/bld6_perf.js

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_reg.js`
headless body: regression views + real-time flicker probe for the buildings v6 pass node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&nov6]" dev/bld6_reg.js   (&noreg = flicker only)

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_run.js`
headless body for dev/car3cdp.mjs: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&nov6]" dev/bld6_run.js shots: ?nov6 -> bld6_<view>_before.jpg, otherwise _after. window.__bld6Only = [...] (via &views=a,b) limits the set.

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6_stats.js`
headless body: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0" dev/bld6_stats.js  -> feature census

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `dev/bld6shots.js`
dev-only capture helper for the buildings v6 pass (variety + aerial roofs). Game page (5191 tab, ?mute): for (const f of ['bld5shots.js', 'regress_shots.js', 'bld6shots.js']) await import('http://127.0.0.1:5190/dev/' + f);

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

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

### `dev/car3cdp.mjs`
dev-only: silent headless Chrome driver (no browser pane needed). Launches Chrome --headless=new --mute-audio on its own profile, opens ONE tab at <url> (add ?mute), waits for window.__shot, evaluates <script.js> (an async function body;

- 2026-10-03 `42da11e` added: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)
- 2026-10-03 `4dd68cb` changed: Cars in-car view: window-lit cabin (street probe / sky IBL sampled along the horizon-bent normal x CABIN.gain 3.2, baked AO softened in the cabin), gauges + screen x2.5 in cockpit, camera at the real driver eye point (no pulled-back / inboard offset), cockpit FOV 54 (+6 with speed)
- 2026-10-04 `1723f8b` changed: Dev: perf_rt.js real-time frame rate (the game's own rAF loop driving the world2_perf routes; car3cdp HB_UNCAP=1 uncaps rAF)

### `dev/car3shots.js`
dev-only capture rig for the car body pass 3 (not shipped). In the game page (or via dev/car3cdp.mjs): await import('http://127.0.0.1:5190/dev/car3shots.js?' + Date.now()); await __car3Shots('before', ['sedan', 'tora']) Writes shots/car3_<f...

- 2026-10-03 `42da11e` added: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)

### `dev/car4_sheet.py`
Stitch the car pass 4 frame strips (shots/car4_<name>_<suffix>_<k>.jpg) into shots/car4_<name>_<suffix>.jpg.

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `dev/car4_spec.mjs`
dump getModelSpec for every model id (physics dims check: node dev/car4_spec.mjs > file.json; diff before/after)

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `dev/car4shots.js`
dev-only capture rig for cars pass 4 (doors, cabin materials, EV light bar, 45 sculpted bodies). Not shipped. node dev/car3cdp.mjs "http://127.0.0.1:5190/?play&mute&prologue=0" dev/car4run.js   (car4run.js imports this + calls __car4Shots)

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

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

### `dev/cpuprof_cdp.mjs`
dev-only CPU profile variant of car3cdp.mjs: after <script.js> resolves, if it defined window.__profRun (async fn), runs it under the V8 sampling profiler (100 us) and prints the top self-time + inclusive-time functions (minified names on :...

- 2026-10-04 `3125624` added: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)

### `dev/crowd_bake.js`
Far-crowd impostor bake (run in the game page, any spot): renders 16 Rocketbox avatars walking (8 phases of their gait cycle) from 8 horizontal directions into a 2048x1024 atlas (32x64 px cells), albedo (sRGB, alpha = coverage) and view-spa...

- 2026-10-03 `e911b3a` added: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

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

### `dev/flicker_map.js`
Per-pixel temporal flicker map (dev): the concept framing (ctshots 'ref', Sacramento St in rain) with traffic / peds off, the rain streak + splash particles hidden, film grain off and time of day frozen, 12 s real-time warm-up (streaming / ...

- 2026-10-04 `2a850c7` added: Rain flicker probe: __flickRT still / noRain / rows options; dev/flicker_map.js per-pixel temporal std map. Measured road fix 1 (03c10d9) vs road fix 3 (HEAD) render files on the concept framing, same conditions: frame-region probe (traffic + peds off) max 3.1-3.7 vs 3.0-3.6, road-row mean |diff| 0.357 vs 0.306; std map (grain off, rain particles hidden, frozen hour) lower half 0.26-0.27 vs 0.28-0.35 luma: no wet-pass regression beyond run-to-run noise. The 9-11 / 47-121 readings came from moving traffic (a passing car: region jumps 38-180) and the rain streak particles crossing lit tower windows (regions 5-6,1); softer puddle mask + weaker ripples measured no better (0.36-0.39) and were not kept. Post / lampmap unchanged.

### `dev/flicker_probe.js`
Dev probe for night flicker / strobing (load in the game page: await import('/dev/flicker_probe.js')). __rb(w, h)            -> Float32Array luminance (0..255) of a w x h readback of the game canvas __flick(n)            -> steps n frames; ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `dev/flicker_rt.js`
Real-time flicker probe (works in a hidden tab): drives the game's frame(dt) with the REAL elapsed time (MessageChannel loop, not rAF) so time-of-day, weather drift, IBL re-bakes, cloud shadows and every throttled update advance as they

- 2026-09-30 `9b6cda8` added: Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `5aef278` changed: Fix night strobing: dress/lantern/nightdress tickers culled from the car-probe cube cameras (origin) on alternate frames; rain occlusion render exception-safe; lantern night colour deep red; dev/flicker_rt.js real-time flicker probe
- 2026-10-04 `2a850c7` changed: Rain flicker probe: __flickRT still / noRain / rows options; dev/flicker_map.js per-pixel temporal std map. Measured road fix 1 (03c10d9) vs road fix 3 (HEAD) render files on the concept framing, same conditions: frame-region probe (traffic + peds off) max 3.1-3.7 vs 3.0-3.6, road-row mean |diff| 0.357 vs 0.306; std map (grain off, rain particles hidden, frozen hour) lower half 0.26-0.27 vs 0.28-0.35 luma: no wet-pass regression beyond run-to-run noise. The 9-11 / 47-121 readings came from moving traffic (a passing car: region jumps 38-180) and the rain streak particles crossing lit tower windows (regions 5-6,1); softer puddle mask + weaker ripples measured no better (0.36-0.39) and were not kept. Post / lampmap unchanged.

### `dev/gameplay_audit.js`
Gameplay audit (dev). Load in a game page (5190 or 5191, ideally /?sandbox so the real save is untouched): await import('http://127.0.0.1:5190/dev/gameplay_audit.js?' + Date.now()) __gpRoutes()          every festival event / prologue / sto...

- 2026-10-01 `69c5690` added: dev: ?sandbox (saves in sessionStorage, real profile untouched) + dev/gameplay_audit.js (route sanity, event autopilot runs)
- 2026-10-01 `5b603cf` changed: Races: player respawn after 10 s of throttle with no route progress (rocking against a wall never tripped the speed test), respawn reasons counted (dev); abandoned ex-player cars > 700 m away are freed too; audit: UI sweep, story runner, worker-paced yields
- 2026-10-01 `e5c901d` changed: Race grid: slots clear of solid obstacles (re-checked once colliders stream in before the countdown); audit: Outlaw loop + prologue runners
- 2026-10-01 `ceacd8a` changed: Prologue: beach drive on the sand (started on the Sutro bluff, fell onto Point Lobos and sat against a pole), stuck / lost cars put back on the route; Ocean Beach Scramble on the sand line; route missions auto-recover a wedged car
- 2026-10-01 `0091c1a` changed: dev: gameplay audit keys on document (UI shell path), prologue segment probe, lighter event runs
- 2026-10-01 `0eae56c` changed: gameplay_audit: progress trace, fade nudge for fresh pages
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

### `dev/gpu.js`
dev-only GPU timing (EXT_disjoint_timer_query_webgl2): __gpu(n) median ms of n frames; __gpuAt(place) settles first

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `999dcf5` changed: dev: memspots result posting + throttle-proof waits, gpu.js waits; NEXT_SESSION VRAM pass notes

### `dev/grass_shots.js`
Ground-cover review views (ice plant mats, lupine patches) at golden hour and noon. Load after sky_shots.js: for (const f of ['sky_shots.js', 'grass_shots.js']) await import('http://127.0.0.1:5190/dev/' + f + '?' + Date.now())

- 2026-10-04 `be044ba` added: Ground cover: ice plant = closed fleshy yellow-green / glaucous mats (wider finger leaves, 1.6x density, shallow base shade, no dry-grass tip bleach: the 0.35 base AO under warm light read olive-brown), red-tinged tips + whole red-bronze mats by patch, broad magenta flowers in flowering patches; lupines = slender spindle racemes (~16 x 2 cm on a shorter stem) with whorls of small florets (dark gaps, pale banner flecks, paler buds at the tip) in a deeper purple, less backlit translucency (were solid 13 cm cones). dev/grass_shots.js: CPU port of the flower / ice noise to find patches + review views. Shots (untracked shots/): fix_{iceplant,lupine}_{before,after}.jpg (top 18:20 golden hour, bottom 12:30).

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

### `dev/peds2_sheet.py`
Stitch the people round 2 frame strips: shots/peds2_<name>_<suf>_<k>.jpg -> shots/peds2_<name>_<suf>.jpg (one row), and (with two suffixes) a before/after sheet shots/peds2_sheet.jpg. usage: python dev/peds2_sheet.py after [before]

- 2026-10-03 `b51235b` added: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` changed: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `dc0aa6e` changed: People 2d: phone sits on the palm with the screen out of it (Bip01 hands: palm +Z, left frame mirrored in Y), calmer night screen glow; shot harness: texting close-up + over-shoulder, drone crowd view with zoom inset, studio car / knock / jump strips, sheet

### `dev/peds2_shots.js`
People round 2 shots (props, far crowds, car entry / knockdown animation). In the game page (?play&foot&mute&tiles=0): await import('http://127.0.0.1:5190/dev/peds2_shots.js'); await __p2All('after') -> shots/peds2_<closeup_phone|umbrella_r...

- 2026-10-03 `b51235b` added: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` changed: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `e911b3a` changed: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off
- 2026-10-03 `dc0aa6e` changed: People 2d: phone sits on the palm with the screen out of it (Bip01 hands: palm +Z, left frame mirrored in Y), calmer night screen glow; shot harness: texting close-up + over-shoulder, drone crowd view with zoom inset, studio car / knock / jump strips, sheet

### `dev/perf_ab.js`
headless body for dev/car3cdp.mjs: interleaved A/B of runtime perf switches (render/perfflags.js) in ONE session, so machine drift (thermals, other GPU work) hits both arms alike. Per district: warm drive, then reps x [A: switches off, B: o...

- 2026-10-04 `0c76264` added: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories

### `dev/perf_diff.py`
dev-only: compare perf_shots.js captures. python dev/perf_diff.py before after [--sheet name] per view: mean abs diff (0-255), share of pixels differing > 24, and a before | after | diff x4 sheet in shots/.

- 2026-10-04 `3125624` added: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)

### `dev/perf_drive.js`
Dev hitch profiler (load in the game page: await import('http://127.0.0.1:5190/dev/perf_drive.js')). __route(pts)                 -> street route (A* over the graph) through [[x,z], ...] as a dense polyline await __perfDrive(opts)      -> m...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8f40932` changed: dev: memtrack S3TC sizes + re-import, heapwalk, perf_drive caps pending GPU timer queries (hidden tab slowed to ~1 fps)

### `dev/perf_prof.js`
dev-only per-pass GPU + per-system CPU profiler (load in the game page after gpu.js / perf_drive.js). await __gpuPass(frames = 20)  -> { total, sections: { label: medianMs }, draws, tris, programs } GPU time per section via EXT_disjoint_tim...

- 2026-10-04 `3125624` added: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)
- 2026-10-04 `0c76264` changed: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)

### `dev/perf_prof_run.js`
headless body for dev/car3cdp.mjs: per-district profile at 1920x1080 (world2_perf.js routes). For each district: settle at the route start, ~700-frame drive (frame p50/p95/p99/max, CPU/GPU p50), then at the drive's end: draw census (main be...

- 2026-10-04 `3125624` added: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)
- 2026-10-04 `0c76264` changed: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)

### `dev/perf_rt.js`
headless body for dev/car3cdp.mjs (run with HB_UNCAP=1): REAL-TIME frame rate, i.e. the game's own rAF loop (CPU and GPU overlap as in play, dynamic resolution off unless #dynres=1) while the car is moved along the world2_perf routes at 15 ...

- 2026-10-04 `1723f8b` added: Dev: perf_rt.js real-time frame rate (the game's own rAF loop driving the world2_perf routes; car3cdp HB_UNCAP=1 uncaps rAF)
- 2026-10-04 `8481ae8` changed: Dynamic resolution: a step down is a trial, kept only if the smoothed frame interval improves >= 6 % within ~2 s (else undone, no step down for 20 s). The GPU timer counts the GPU waiting on a CPU-bound frame, so on High (CPU-bound, ~21-26 ms frame CPU) it sank to minScale 0.65 for no frame-rate gain; real-time runs (dev/perf_rt.js dynres=1): every trial undone (24.9 -> 24.4 ms, 31.2 -> 31.3), native 1080p kept

### `dev/perf_rt2.js`
headless body for dev/car3cdp.mjs (run with HB_UNCAP=1): REAL-TIME frame rate like dev/perf_rt.js (the game's own rAF loop, dynres off) plus per-frame attribution: frame CPU, GPU time (one TIME_ELAPSED query per frame), draw calls (renderer...

- 2026-10-04 `a3d8f4c` added: Dev: perf_rt2.js (real-time drive at #v= m/s: rAF interval histogram, frame CPU / gap / GPU timer / draw calls per frame, physics steps, per-part mean + max, attributed slow frames) and trace_cdp.mjs (Chrome trace of the same drive: outside-frame tasks by kind; SPIKE=1 V8 samples per long frame; PROF=1 in / out of frame() split)
- 2026-10-04 `7fd3e16` changed: Perf r3: tiles cycle time-sliced (tilesphase.js: one generator per update, markUsedTiles and toggleTiles yield every 16 tiles once the frame's ~1 ms slice is spent; the visibility changes of a pass are queued and applied together so a parent hidden in one slice and its children shown in the next never leave a hole), a cycle starts every 5 frames or when the last ends; the tile view error runs without the library's per-tile plugin-list copies / closures (resetFrameState was the top allocation site, 8.3 MB/s). Drive FiDi / Chinatown: gtiles mean 1.5-1.7 -> 1.1-1.2 ms; a sharp turn / jump still finishes the cycle at once. Pan test 120 deg/s: FiDi 117 / 52 differing cells vs A/A noise 202 / 96. Dev: perf_rt2 slowExcess (parts of the >= p90 CPU frames minus the median ones), trace_cdp ALLOC=1 (sampling heap profiler)

### `dev/perf_shots.js`
headless body for dev/car3cdp.mjs: look check for perf work. Same views with and without an optimisation (A/B URL flags), then python dev/perf_diff.py <a> <b> for per-view pixel stats + a side-by-side sheet. node dev/car3cdp.mjs "http://127...

- 2026-10-04 `3125624` added: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)

### `dev/perf_views_ab.js`
headless body for dev/car3cdp.mjs: low-noise A/B of runtime perf switches (render/perfflags.js) on FIXED chase-cam views (no streaming between arms): per district 3 spots along the world2_perf route (start / middle / end); at each spot reps...

- 2026-10-04 `0c76264` added: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `9659fd1` changed: Perf: Google tiles traversal every other frame (3-4.5 ms CPU) on a camera widened by 8 deg per side at the same pixel scale (same LOD), tile meshes frustum-culled by three every frame; a turn > 4 deg, fov / aspect change or jump traverses at once. Fixed-view A/B CPU -2.4 ms (Mission / FiDi); pan test (240 deg/s, throttled vs forced traversal per frame) differs no more than the A/A noise (max 6 vs 9 of 14400 cells). ?notilesthrottle. perf_views_ab.js: dev-only nocars / noprobe arms (traffic cars cost -2.4 ms CPU / -1.2 GPU, car probe -1.9 / -2.5 at the same views)

### `dev/police_probe.js`
Police arrival probe (dev). Load in a `/?sandbox&mode=gta&mute` page: await import('http://127.0.0.1:5190/dev/police_probe.js?' + Date.now()) await __copProbe()            -> per downtown spot: seconds until the first unit is < 30 m from a ...

- 2026-10-04 `852703f` added: Police: route-aware pursuit spawns - one-way streets only in their legal direction (random dir put units nose-first against the flow), two-way spawns face the end with the shorter legal A* route, route <= 1.4x + 30 m and <= 14 s at 12 m/s, the shortest of the first 4 valid spots, first leg clear of building colliders (Falmouth St overhangs pinned a unit). dev/police_probe.js: 6 downtown spots by real lat/lon, parked suspect, 2 stars.

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

### `dev/tiles_pan.js`
headless body for dev/car3cdp.mjs: Google-tiles selection lag test. A free camera pans (#rate deg/s, #frames frames of 1/60 s) over the city from a rooftop view; every frame is read back at 160x90 and compared with the same pan run with a

- 2026-10-04 `72ef212` added: Perf r3: tiles phases start every 5th frame (A, B, C, two idle frames; was back to back): ~40 % less traversal CPU. dev/tiles_pan.js (free-camera pan, 160x90 readback per frame vs a full traversal on the real camera every frame): FiDi max / mean differing cells 115 / 51 (cycle 3) and 121 / 53 (cycle 5), A/A noise 202 / 93; Mission 584 / 332 and 1016 / 726, noise 761 / 500 and 1209 / 858 (tiles still streaming). gtiles.phCycle is runtime-tunable

### `dev/trace_cdp.mjs`
dev-only: Chrome performance trace of a real-time drive (silent headless Chrome, like car3cdp.mjs + HB_UNCAP). Runs <script.js> (an async function body) which must leave the game running and define window.__traceRun (async; resolves

- 2026-10-04 `a3d8f4c` added: Dev: perf_rt2.js (real-time drive at #v= m/s: rAF interval histogram, frame CPU / gap / GPU timer / draw calls per frame, physics steps, per-part mean + max, attributed slow frames) and trace_cdp.mjs (Chrome trace of the same drive: outside-frame tasks by kind; SPIKE=1 V8 samples per long frame; PROF=1 in / out of frame() split)
- 2026-10-04 `7fd3e16` changed: Perf r3: tiles cycle time-sliced (tilesphase.js: one generator per update, markUsedTiles and toggleTiles yield every 16 tiles once the frame's ~1 ms slice is spent; the visibility changes of a pass are queued and applied together so a parent hidden in one slice and its children shown in the next never leave a hole), a cycle starts every 5 frames or when the last ends; the tile view error runs without the library's per-tile plugin-list copies / closures (resetFrameState was the top allocation site, 8.3 MB/s). Drive FiDi / Chinatown: gtiles mean 1.5-1.7 -> 1.1-1.2 ms; a sharp turn / jump still finishes the cycle at once. Pan test 120 deg/s: FiDi 117 / 52 differing cells vs A/A noise 202 / 96. Dev: perf_rt2 slowExcess (parts of the >= p90 CPU frames minus the median ones), trace_cdp ALLOC=1 (sampling heap profiler)

### `dev/world2_flick.js`
headless body for dev/car3cdp.mjs: real-time flicker probe parked on the world2 yard views (+ the regression set with &reg=<suffix>) node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&noyardground]&reg=w2" dev/world2_flick.js

- 2026-10-04 `954f475` added: NEXT_SESSION: world round 2 notes; dev/world2_flick.js (real-time flicker probe on the yard views + regression set), dev/world2_perf.js (1920x1080 district drives: frame / GPU / VRAM)

### `dev/world2_gpu.js`
headless body: static GPU A/B (median of 3 x 40 frames, dev/gpu.js) at 1920x1080 on yard-heavy views node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&q=high[&noyardground&noyardcol]" dev/world2_gpu.js

- 2026-10-04 `703022a` added: Terrain: inside yards skip the natural layers (grass / forest / sand / rock taps + noise) that the yard patchwork replaces. Idle-machine GPU A/B at 1920x1080 (dev/world2_gpu.js, 2 rounds x 3 views, medians): yard views 13.6 vs 13.7 ms (min-of-reps), within run-to-run noise (+-3 ms)

### `dev/world2_perf.js`
headless body for dev/car3cdp.mjs: frame-time / GPU / GPU-memory report at 1920x1080 for 5 districts, each a ~700-frame drive (15 m/s, GPU-synced frames, real wall time) on a local route. Use ?q=high&memtrack&mute&prologue=0[&tiles=..].

- 2026-10-04 `954f475` added: NEXT_SESSION: world round 2 notes; dev/world2_flick.js (real-time flicker probe on the yard views + regression set), dev/world2_perf.js (1920x1080 district drives: frame / GPU / VRAM)

### `dev/world2_run.js`
headless body for dev/car3cdp.mjs: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0&suffix=after&views=yards_drone,crowds" dev/world2_run.js views: any of window.__w2Views, plus 'crowds' (census) and 'fence' (walk into a yard fe...

- 2026-10-04 `6395401` added: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.

### `dev/world2_shots.js`
World round 2 shots (ped hot spots on the 1:1 map, residential yard ground, yard fence colliders). Headless + muted: node dev/car3cdp.mjs "http://127.0.0.1:5191/?mute&prologue=0[&noyardground&noyardcol]" dev/world2_run.js

- 2026-10-04 `6395401` added: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.
- 2026-10-04 `dbb6485` changed: Yard ground: fewer watered lawns (6-18 % by neighbourhood) and those a little drier in the fall; world2 yards_street view = a Richmond block from back-window height


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
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

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
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

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
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

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
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

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
- 2026-10-04 `e1f7e96` changed: Off-road races: Headlands Dirt / XC rerouted on Conzelman + the Julian fire road, terrain router directional (climb <= 25 % on grass, grip-scaled, roads 30 %, descents <= 42 %), trail / fire-road preferred, hero landmark solids + inland lakes + raised decks as walls, building-proximity cost, no hairpin hooks, finer-grid fallback; race AI grip-aware corner / braking limits + side-slope margin, rollover cap for tall 4x4s, back-out recovery before respawn, queued rivals not 'stuck', runtime line guard (re-routes the line round colliders that stream in, hides parked cars on it); sprint finish 12 m before the route end; wrong-way allowed on minor one-ways when the legal way is a big detour.

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

### `src/game/peds/crowd.js`
HILLBOMB: far crowds. Beyond the real (skinned) pedestrians (~150 m) busy sidewalks keep people out to ~420 m as multi-angle impostors: 16 Rocketbox avatars walking, baked from 8 directions x 8 gait phases (dev/crowd_bake.js ->

- 2026-10-03 `e911b3a` added: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

### `src/game/peds/looks.js`
HILLBOMB pedestrians: appearance presets per crowd style + a small pool of pre-built humans. Humans are expensive to create (a new body variant builds its geometry once, ~15 ms; every human bakes its own colours, ~2.5 ms), so the crowd reus...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `src/game/peds/nav.js`
HILLBOMB pedestrians: navigation data. Built lazily from world.blocks / world.graph and cached. SIDEWALK RING. Every block's curb polygon `poly` is convex; the sidewalk is the 3.6 m band between `poly` and `inner`. A walker is parametrised ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `01d64e8` changed: Peds on the 1:1 map: tourist spots + tourist zones by real lat/lon (Union Square plaza, Dragon Gate, Wharf sign, Pier 39, Ferry plaza, Lombard, Painted Ladies, Palace, Coit, City Hall, Twin Peaks, Dolores, Castro Theatre, Balmy Alley; v2 had no spots and the Union Square tourist boost used old-map x/z), plaza footways at the sights as busy walker paths, spot sampling allowed on plazas inside a block's lot line (not yards). Census (dev/world2_shots.js __w2Crowds, 90 m): Union Sq 57 (10 at the spot, 24 tourists), Wharf 55, Chinatown 67, Castro 59, Mission 58, Ferry Building 0 -> 54.

### `src/game/peds/props.js`
HILLBOMB: hand-held pedestrian props (tools/blender/peds/build_props.py -> public/assets/peds/props.glb): smartphone with a lit screen, open / furled umbrellas (rain), paper coffee cup, shopping bag, briefcase. Each RealHuman owns a HeldPro...

- 2026-10-03 `2c844f6` added: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `dc0aa6e` changed: People 2d: phone sits on the palm with the screen out of it (Bip01 hands: palm +Z, left frame mirrored in Y), calmer night screen glow; shot harness: texting close-up + over-shoulder, drone crowd view with zoom inset, studio car / knock / jump strips, sheet

### `src/game/peds/ragdoll.js`
HILLBOMB: a light Verlet ragdoll for the realistic humans (knocked down by cars, shoves, carjack ejections). 18 particles (pelvis, hips, knees, ankles, toes, chest, neck, head, shoulders, elbows, wrists) with distance constraints (stiff tor...

- 2026-10-03 `b51235b` added: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js

### `src/game/peds/realhuman.js`
HILLBOMB realistic humans: Microsoft Rocketbox avatars (MIT) for pedestrians and the player on foot. Assets: public/assets/peds (tools/blender/peds/*): <id>.glb (LOD0 source mesh ~7-10k tris, LOD1 ~3.5k, LOD2 ~1.5k, skinned to one shared 34...

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-03 `b51235b` changed: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` changed: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `e911b3a` changed: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

### `src/game/peds/yell.js`
HILLBOMB pedestrians: short comic speech bubbles ("HEY! MY CAR!") above a pedestrian's head. A handful of pooled sprites; canvas textures are cached per line of text. No audio.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/quality.js`
Graphics presets, first-run auto-detect + benchmark, dynamic resolution. Presets: low / medium / high / ultra. 'ultra' runs every 'high' code path (quality.name === 'high') plus the 4096 sun shadow map, a sharper Google-tiles target and a b...

- 2026-09-30 `4075efc` added: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-04 `8481ae8` changed: Dynamic resolution: a step down is a trial, kept only if the smoothed frame interval improves >= 6 % within ~2 s (else undone, no step down for 20 s). The GPU timer counts the GPU waiting on a CPU-bound frame, so on High (CPU-bound, ~21-26 ms frame CPU) it sank to minScale 0.65 for no frame-rate gain; real-time runs (dev/perf_rt.js dynres=1): every trial undone (24.9 -> 24.4 ms, 31.2 -> 31.3), native 1080p kept

### `src/game/skills.js`
Skill chain: drift, air, near miss, speed, wreckage. Banks after 3 s without a crash. Emits 'nearMiss' (other car) and 'skillBank' (points, state) for the festival (accolades, Festival Points).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_cablecars.js`
San Francisco cable cars: kinematic cars running the real lines (Powell, Hyde, California) at ~9.5 mph, stopping at corners, ringing the bell, climbing the hills. They shove cars aside (infinite mass). v1 (hand-built grid): straight axis-al...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_carprobe.js`
Reflection probe that follows the player's car (render/carprobe.js). Off on low quality or on foot. Debug: window.__carProbe (.enabled, .stats.ms = smoothed CPU ms per frame).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_carwarm.js`
(perf r2) Street-car warm-up at boot (behind the loading screen): every traffic model's procedural build (30-66 ms the first time a model spawned mid-drive), its baked asset (loads in the background), the AO atlas upload and the far

- 2026-10-04 `d3bd755` added: Perf r2: street-car warm-up behind the loading screen (game/sys_carwarm.js): every TRAFFIC_MIX model's procedural build (P, lamp anchors, fallback geometry), its baked asset, the AO atlas upload (renderer.initTexture) and the far shadow proxies. First spawn of a model mid-drive (new Vehicle) 26-43 ms -> 0.1-0.5 ms (kodiak, elektra, stallion18, police). main.js: comment touch so the watch build re-scans the sys_* glob. ?nocarwarm = A/B

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
- 2026-10-04 `0c76264` changed: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `3acfc6b` changed: Perf r3: walk-in interior sites stay built once built at boot (hidden past HIDE_R as before) instead of being dropped past 450 m and rebuilt on the next approach (bodega: 56 ms, emit + vertex bake, while driving Mission). ?nointkeep

### `src/game/sys_menus.js`
Pause / festival menu, big map and settings wiring (the UI itself lives in src/ui: shell.js, menu.js, bigmap.js, tabs.js). Also radio hotkeys and car delivery. G.menus.update() is called by main.js every frame (also while

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `bf0246f` changed: Resume where you left off (?fresh = Hyde St start), F1 opens Settings > Controls, start hint follows keyboard / pad

### `src/game/sys_peds.js`
HILLBOMB: pedestrians. A living-city crowd around the player: sidewalk walkers, pairs, chatting groups, phone-starers, bus-stop waiters, joggers on park paths and promenades, tourists at landmarks. They cross at corners on the walk signal, ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `be35afd` changed: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-03 `b51235b` changed: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` changed: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `e911b3a` changed: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off
- 2026-10-04 `01d64e8` changed: Peds on the 1:1 map: tourist spots + tourist zones by real lat/lon (Union Square plaza, Dragon Gate, Wharf sign, Pier 39, Ferry plaza, Lombard, Painted Ladies, Palace, Coit, City Hall, Twin Peaks, Dolores, Castro Theatre, Balmy Alley; v2 had no spots and the Union Square tourist boost used old-map x/z), plaza footways at the sights as busy walker paths, spot sampling allowed on plazas inside a block's lot line (not yards). Census (dev/world2_shots.js __w2Crowds, 90 m): Union Sq 57 (10 at the spot, 24 tourists), Wharf 55, Chinatown 67, Castro 59, Mission 58, Ferry Building 0 -> 54.

### `src/game/sys_photo.js`
Photo mode (G.state = 'photo') + weather wiring. freezes the game (physics, traffic, particles, rain, water, clock), hides the HUD, frees the mouse orbit camera around the car, or a free camera constrained to 45 m around it (never below the...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/game/sys_police.js`
SFPD: patrols, wanted stars, witnesses, pursuit AI, roadblocks, busted / evaded.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `157fb1a` changed: Outlaw: cops drive the last metres up to a stopped suspect (route ended at the road node, 20-30 m off: no bust ever), box in instead of shoving, only player-initiated rams add stars, the search widens and lying low evades (a parked player out of sight stayed wanted forever)
- 2026-10-01 `1e2df5f` changed: Police: pursuit units spawn 60-120 m out, out of sight (behind / beside, or hidden by a building)
- 2026-10-01 `33cfbba` changed: Police: pursuit spawns need a short legal drive (<= 1.6x + 40 m) and a clear spot, far patrols recycled when a chase starts, units drive to the last-seen spot for 12 s before the search ring; pursuit routing takes the A* road route (greedy edge choice circled blocks). Parked-suspect probe: first unit < 30 m in 3.5-10 s at 4/6 spots (was 0/6 within the 22 s star timeout)
- 2026-10-04 `852703f` changed: Police: route-aware pursuit spawns - one-way streets only in their legal direction (random dir put units nose-first against the flow), two-way spawns face the end with the shorter legal A* route, route <= 1.4x + 30 m and <= 14 s at 12 m/s, the shortest of the first 4 valid spots, first leg clear of building colliders (Falmouth St overhangs pinned a unit). dev/police_probe.js: 6 downtown spots by real lat/lon, parked suspect, 2 stars.

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
- 2026-10-04 `0c76264` changed: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `d3bd755` changed: Perf r2: street-car warm-up behind the loading screen (game/sys_carwarm.js): every TRAFFIC_MIX model's procedural build (P, lamp anchors, fallback geometry), its baked asset, the AO atlas upload (renderer.initTexture) and the far shadow proxies. First spawn of a model mid-drive (new Vehicle) 26-43 ms -> 0.1-0.5 ms (kodiak, elektra, stallion18, police). main.js: comment touch so the watch build re-scans the sys_* glob. ?nocarwarm = A/B
- 2026-10-04 `f6379ba` changed: Perf r3: texture uploads off the first-draw frame (render/texwarm.js): image textures are queued when they become ready and uploaded by renderer.initTexture from the frame loop (2.5 ms budget, first of a frame always), big <img> sources (>= 1 Mpx) converted to ImageBitmap first (createImageBitmap, flipY / premultiply baked, colour conversion none; ~4x cheaper upload), small photo-tile bitmaps skipped; boot flushes the queue behind the loading screen. Gone mid-drive: facade_nrm.png 164 ms, fac3_nrm 87, facade_ma 85, leaves_normal 74, city_nrm 58 ms uploads. Look A/B (shots/r3_all_ab.jpg, all r3 switches off vs on): only traffic / signals / peds / clouds differ. ?notexwarm
- 2026-10-04 `d1a4a79` changed: NEXT_SESSION / QUALITY: perf round 3 (tiles slicing, spikes, streaming, physics smoothing) notes, interleaved before / after, open items; boot stage text 'Decoding textures'


## `src/player`

### `src/player/camera.js`
Chase camera (car), hood / bumper camera, in-car (cockpit) camera, on-foot orbit camera. Spring-smoothed, speed FOV, occlusion pull-in (never into the car itself), impact shake + a small speed-dependent road shake.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-03 `4dd68cb` changed: Cars in-car view: window-lit cabin (street probe / sky IBL sampled along the horizon-bent normal x CABIN.gain 3.2, baked AO softened in the cabin), gauges + screen x2.5 in cockpit, camera at the real driver eye point (no pulled-back / inboard offset), cockpit FOV 54 (+6 with speed)

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
- 2026-10-03 `b51235b` changed: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies


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
- 2026-10-04 `032b7e1` changed: Perf r2: car probe renders with the last main render's world matrices (scene.matrixWorldAutoUpdate off during the cube face: renderer.render walked the whole ~5.5 k node graph a second time each frame). Probe CPU (sys3) 3.0-3.5 -> 1.6-1.7 ms; fixed-view A/B (perf_views_ab, FiDi + Mission) frame CPU -1.0 ms mean. ?noprobeumw = A/B

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
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)
- 2026-10-04 `0a5722a` changed: Perf: hero landmark shadow proxies: the casting slots of a hero LOD are merged into one position-only depth proxy per material side (slot meshes stop casting); the proxy's geometry bounds are parked out of every camera's view and environment.js' caster test uses userData.shadowSphere (far cascade wrapped too, no view cull). Chinatown shadow draws 434 -> 142; look A/B (shots/perf_heroshadow_ab.jpg) identical shadows. ?noheroshadow = A/B

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

### `src/render/perfflags.js`
(perf 10/4) runtime switches for the performance passes, so a single session can A/B them (dev/perf_ab.js flips them between drive segments). Defaults on; ?no<name> in the URL turns one off at load, window.__perf.<name> = false at run time.

- 2026-10-04 `0c76264` added: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)
- 2026-10-04 `9659fd1` changed: Perf: Google tiles traversal every other frame (3-4.5 ms CPU) on a camera widened by 8 deg per side at the same pixel scale (same LOD), tile meshes frustum-culled by three every frame; a turn > 4 deg, fov / aspect change or jump traverses at once. Fixed-view A/B CPU -2.4 ms (Mission / FiDi); pan test (240 deg/s, throttled vs forced traversal per frame) differs no more than the A/A noise (max 6 vs 9 of 14400 cells). ?notilesthrottle. perf_views_ab.js: dev-only nocars / noprobe arms (traffic cars cost -2.4 ms CPU / -1.2 GPU, car probe -1.9 / -2.5 at the same views)
- 2026-10-04 `032b7e1` changed: Perf r2: car probe renders with the last main render's world matrices (scene.matrixWorldAutoUpdate off during the cube face: renderer.render walked the whole ~5.5 k node graph a second time each frame). Probe CPU (sys3) 3.0-3.5 -> 1.6-1.7 ms; fixed-view A/B (perf_views_ab, FiDi + Mission) frame CPU -1.0 ms mean. ?noprobeumw = A/B
- 2026-10-04 `46ea26f` changed: Perf r2: lean street cars. Traffic / AI / parked-hit cars (Vehicle role != player) mount their LOD levels with the shut front doors merged into the body per material (asset.lean, built once when the GLB arrives), only the drawn LOD level hangs in the graph, static sub-nodes skip the per-frame matrix recompose. A door that opens (carjack, getting in) remounts the hinged split levels. FiDi: car nodes 2894 -> 1121, car meshes 1728 -> 555; draw calls 691 -> 579 (FiDi), 825 -> 671 (Sunset). ?nocarlean = A/B
- 2026-10-04 `0345c33` changed: Perf r2: far street cars (LOD 1 / 2) cast the sun shadow from one depth-only proxy per level (lean body paint + details + the four wheels at rest, positions merged once per asset; bounds parked out of every colour pass, environment.js caster test via userData.shadowSphere like the hero proxies). Shadow draws (both cascades, same frame, in-session A/B) FiDi 168 -> 82, Sunset 224 -> 120, Mission 211 -> 111; look A/B shots/r2_carshadowproxy_ab.jpg: only moving peds differ. ?nocarshadowproxy = A/B
- 2026-10-04 `6027db5` changed: Perf r2: car physics ground probes: the wheel ray's first probe and the 20 chassis corner probes ask for the height only (the normal / surface taps, 4 more terrain samples + the surface raster, are taken only where they are read: a refined wheel contact or a corner below ground); SAT vs static colliders without per-collider arrays. Bit-identical trajectories (fresh body, 1800 scripted steps, physlite on / off: every state value equal to 17 digits); 7.0-7.7 -> 4.5-5.9 us per body step. ?nophyslite = A/B
- 2026-10-04 `d3bd755` changed: Perf r2: street-car warm-up behind the loading screen (game/sys_carwarm.js): every TRAFFIC_MIX model's procedural build (P, lamp anchors, fallback geometry), its baked asset, the AO atlas upload (renderer.initTexture) and the far shadow proxies. First spawn of a model mid-drive (new Vehicle) 26-43 ms -> 0.1-0.5 ms (kodiak, elektra, stallion18, police). main.js: comment touch so the watch build re-scans the sys_* glob. ?nocarwarm = A/B
- 2026-10-04 `78c4ced` changed: Perf r2: street cars past 75 m (lean LOD 2): the four wheels at rest are merged into the body details (same material; positions / normals transformed, mirrored wheels' winding flipped back), the wheel meshes hide at that level: 9 -> 5 meshes per far car (staged 8-car street: meshes per car 13,9,9,9,9,9,9,9 -> 13,9,9,5,5,5,5,5). At 75 m+ a wheel is ~8 px: spin / steer / suspension travel are sub-pixel; staged 4K A/B (shots/r2_carfarwheels_crop.jpg) shows no difference beyond the A/A foliage noise. ?nocarfarwheels = A/B
- 2026-10-04 `c1d20b8` changed: Perf r2: street cars share their lamp + lens materials per model and light state (head / brake / reverse / siren bits: the lamp uniforms are a pure function of them), so the renderer no longer refreshes a per-car lamp material in the main, probe and shadow passes; the in-car view keeps the car's own. Staged night A/B (shots/r2_carlampshare_night.jpg): identical lamps, only a walking ped differs. ?nocarlampshare = A/B
- 2026-10-04 `e506c0c` changed: Perf r3: Google tiles traversal in three phases on consecutive frames (world/v2/tilesphase.js: A = markUsedTiles, B = leaves / visible / toggle, C = LRU hand-over, requests, scheduleUnload, update-after; traversal functions copied from 3d-tiles-renderer 0.5.3, the previous used set stays marked until C so no unload pass can evict on-screen tiles mid-cycle). Per-frame tiles cost 0.3-0.6 ms per phase instead of 4-12 ms every 3rd frame; a sharp turn / jump finishes the cycle at once. Look A/B (shots/r3_tilesphase_ab.jpg): only peds / signals / clouds differ. ?notilesphase. perfflags.js also registers the other round-3 switches (intprobe, simsmooth, streamslice, texwarm, intkeep)
- 2026-10-04 `ef382e1` changed: Perf r3: Chinatown asphalt decal segments merged per 120 m cell (ct_street.js; multiply blend, no depth write: order-independent, same overlaps), the 200 m hiding per cell: 40-55 transparent draws -> a handful. Night-rain look A/B (shots/r3_ctmerge_ab.jpg): rows b / c mean 3.4 / 3.6 (peds, rain), row a differs by a headlight / spray pool around the car (additive light, not the decal). ?noctmerge

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

### `src/render/shaderwarm.js`
(perf 10/4) No first-use shader stalls while playing. ANGLE / D3D11 compiles our big patched shaders in 0.1-0.8 s, and three blocks on an object's first draw with a new program (onFirstUse -> getProgramInfoLog / getProgramParameter wait for

- 2026-10-04 `0c76264` added: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `4c056cf` changed: Perf r3: hero-interior reflection probe without the compile freeze: one PMREM generator kept for every probe (warmed at install at the probe size; a new one per probe released and recompiled its shaders), the cube capture's draws go through shaderwarm (extra guarded scenes): a capture with materials still compiling is dropped and retried 250 ms later. Hobart lobby while driving FiDi: 84-112 ms frame -> 8 ms. ?nointprobe

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
- 2026-10-04 `0a5722a` changed: Perf: hero landmark shadow proxies: the casting slots of a hero LOD are merged into one position-only depth proxy per material side (slot meshes stop casting); the proxy's geometry bounds are parked out of every camera's view and environment.js' caster test uses userData.shadowSphere (far cascade wrapped too, no view cull). Chinatown shadow draws 434 -> 142; look A/B (shots/perf_heroshadow_ab.jpg) identical shadows. ?noheroshadow = A/B

### `src/render/terrainmat.js`
Photo-scanned ground materials: terrain splatting (grass / forest floor / sand / cliff rock by per-vertex weights, two-scale sampling against tiling), asphalt and sidewalk concrete with world-space UVs. Weather: every lit material gets wet ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-02 `03c10d9` changed: Road 2: wet reflections = roughness-driven anisotropic streak blur (masked, half res) + full-res sharp water, no per-pixel normal jitter / time-varying SSR jitter (no sparkle), luminance knee on the rough film; Chinatown mirror 0.85x + 4x MSAA on high; asphalt: warm neutral, darker, rough dry (0.8) + street-canyon spec occlusion, block resurfacing age + slow mottle, near aggregate contrast + detail relief; full anisotropy on road textures; marking chips fade by pixel footprint; calmer hero street decal; dev/road2shots.js + road2_sheet.py
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.
- 2026-10-04 `703022a` changed: Terrain: inside yards skip the natural layers (grass / forest / sand / rock taps + noise) that the yard patchwork replaces. Idle-machine GPU A/B at 1920x1080 (dev/world2_gpu.js, 2 rounds x 3 views, medians): yard views 13.6 vs 13.7 ms (min-of-reps), within run-to-run noise (+-3 ms)

### `src/render/texwarm.js`
(perf r3 10/4) Big <img> textures decoded off the main thread. three uploads a texture the first time a draw samples it; for an <img> source the browser decodes the image inside that texImage / texSubImage call, so shared atlases that

- 2026-10-04 `f6379ba` added: Perf r3: texture uploads off the first-draw frame (render/texwarm.js): image textures are queued when they become ready and uploaded by renderer.initTexture from the frame loop (2.5 ms budget, first of a frame always), big <img> sources (>= 1 Mpx) converted to ImageBitmap first (createImageBitmap, flipY / premultiply baked, colour conversion none; ~4x cheaper upload), small photo-tile bitmaps skipped; boot flushes the queue behind the loading screen. Gone mid-drive: facade_nrm.png 164 ms, fac3_nrm 87, facade_ma 85, leaves_normal 74, city_nrm 58 ms uploads. Look A/B (shots/r3_all_ab.jpg, all r3 switches off vs on): only traffic / signals / peds / clouds differ. ?notexwarm
- 2026-10-04 `50d18b4` changed: Perf r3: texwarm is conversion-only: big (>= 1 Mpx) <img> textures become ImageBitmaps off the main thread (started before any upload work so the title camera cannot draw them first), nothing is uploaded ahead of its first draw. Uploading early (every image texture: +0.5 GB; every big one: +0.35-0.45 GB at the memspots) filled VRAM with interior / prop library maps nothing drew; a scan of the scene graph for the textures in use cost ~1 ms per frame and more > 50 ms frames. Memspots 2.36-2.80 GB (?notexwarm 2.37-2.80); first-draw uploads are copies: facade_nrm 4K 27-36 ms (was 130-196 ms decode), 2K 8-12 ms (26-90)

### `src/render/water.js`
HILLBOMB water: the Bay + the Pacific. planar reflection (reduced resolution, oblique near-plane clip at sea level, a cheap scene layer: sky, terrain, decks, landmarks/bridges, buildings), skipped while no water pixel is visible (occlusion ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)

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
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies
- 2026-10-04 `46ea26f` changed: Perf r2: lean street cars. Traffic / AI / parked-hit cars (Vehicle role != player) mount their LOD levels with the shut front doors merged into the body per material (asset.lean, built once when the GLB arrives), only the drawn LOD level hangs in the graph, static sub-nodes skip the per-frame matrix recompose. A door that opens (carjack, getting in) remounts the hinged split levels. FiDi: car nodes 2894 -> 1121, car meshes 1728 -> 555; draw calls 691 -> 579 (FiDi), 825 -> 671 (Sunset). ?nocarlean = A/B

### `src/vehicle/carshade.js`
Car surface layers patched into the car materials (vehicle/models.js): wheel zone shading on the baked details material: the Blender tyre (tools/blender/cars.py tyre_mesh) and brake rotor carry marker UVs (uv.y 2..3 road tyre, 6..7 off-road...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `src/vehicle/models.js`
HILLBOMB: San Francisco. Procedural car models (no asset files). Owner: car models agent. See CONVENTIONS.md. Local frame: +X right, +Y up, -Z forward. Origin on the ground (y = 0 = tyre contact), x = 0 centre line, z = 0 midway between the...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `c750d23` changed: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper
- 2026-10-03 `42da11e` changed: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)
- 2026-10-03 `4dd68cb` changed: Cars in-car view: window-lit cabin (street probe / sky IBL sampled along the horizon-bent normal x CABIN.gain 3.2, baked AO softened in the cabin), gauges + screen x2.5 in cockpit, camera at the real driver eye point (no pulled-back / inboard offset), cockpit FOV 54 (+6 with speed)
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies
- 2026-10-04 `46ea26f` changed: Perf r2: lean street cars. Traffic / AI / parked-hit cars (Vehicle role != player) mount their LOD levels with the shut front doors merged into the body per material (asset.lean, built once when the GLB arrives), only the drawn LOD level hangs in the graph, static sub-nodes skip the per-frame matrix recompose. A door that opens (carjack, getting in) remounts the hinged split levels. FiDi: car nodes 2894 -> 1121, car meshes 1728 -> 555; draw calls 691 -> 579 (FiDi), 825 -> 671 (Sunset). ?nocarlean = A/B
- 2026-10-04 `0345c33` changed: Perf r2: far street cars (LOD 1 / 2) cast the sun shadow from one depth-only proxy per level (lean body paint + details + the four wheels at rest, positions merged once per asset; bounds parked out of every colour pass, environment.js caster test via userData.shadowSphere like the hero proxies). Shadow draws (both cascades, same frame, in-session A/B) FiDi 168 -> 82, Sunset 224 -> 120, Mission 211 -> 111; look A/B shots/r2_carshadowproxy_ab.jpg: only moving peds differ. ?nocarshadowproxy = A/B
- 2026-10-04 `d3bd755` changed: Perf r2: street-car warm-up behind the loading screen (game/sys_carwarm.js): every TRAFFIC_MIX model's procedural build (P, lamp anchors, fallback geometry), its baked asset, the AO atlas upload (renderer.initTexture) and the far shadow proxies. First spawn of a model mid-drive (new Vehicle) 26-43 ms -> 0.1-0.5 ms (kodiak, elektra, stallion18, police). main.js: comment touch so the watch build re-scans the sys_* glob. ?nocarwarm = A/B
- 2026-10-04 `78c4ced` changed: Perf r2: street cars past 75 m (lean LOD 2): the four wheels at rest are merged into the body details (same material; positions / normals transformed, mirrored wheels' winding flipped back), the wheel meshes hide at that level: 9 -> 5 meshes per far car (staged 8-car street: meshes per car 13,9,9,9,9,9,9,9 -> 13,9,9,5,5,5,5,5). At 75 m+ a wheel is ~8 px: spin / steer / suspension travel are sub-pixel; staged 4K A/B (shots/r2_carfarwheels_crop.jpg) shows no difference beyond the A/A foliage noise. ?nocarfarwheels = A/B
- 2026-10-04 `8583d68` changed: Perf r2: far street cars with merged wheels also take their four wheel pivots (pivot / spin / wheel / caliper) out of the graph while at LOD 2 (applied from setLights during the car's sync, never inside LOD.update, which runs while the renderer walks the car's children). FiDi scene nodes 3739 -> 3097 (car nodes 1121 -> 491); 700-frame drives: draw calls FiDi 589 -> 430, Twin Peaks 551 -> 392, Sunset 759 -> 593. Under ?nocarfarwheels
- 2026-10-04 `c1d20b8` changed: Perf r2: street cars share their lamp + lens materials per model and light state (head / brake / reverse / siren bits: the lamp uniforms are a pure function of them), so the renderer no longer refreshes a per-car lamp material in the main, probe and shadow passes; the in-car view keeps the car's own. Staged night A/B (shots/r2_carlampshare_night.jpg): identical lamps, only a walking ped differs. ?nocarlampshare = A/B

### `src/vehicle/physics.js`
Raycast-suspension rigid-body car. Arcade-leaning but physical: springs/dampers per wheel, slip-based tyre forces with a friction circle, engine torque curve + automatic gearbox, drag/downforce, chassis-vs-ground and chassis-vs-wall

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-01 `838c23b` changed: Race AI: pop waypoints along the path tangent (corner overshoot popped the cross street), curvature-capped lane offsets, TCS + STM for rivals (power-oversteer spins at junctions); respawn log names nearby obstacle kinds
- 2026-10-04 `6027db5` changed: Perf r2: car physics ground probes: the wheel ray's first probe and the 20 chassis corner probes ask for the height only (the normal / surface taps, 4 more terrain samples + the surface raster, are taken only where they are read: a refined wheel contact or a corner below ground); SAT vs static colliders without per-collider arrays. Bit-identical trajectories (fresh body, 1800 scripted steps, physlite on / off: every state value equal to 17 digits); 7.0-7.7 -> 4.5-5.9 us per body step. ?nophyslite = A/B

### `src/vehicle/sim.js`
Fixed-step vehicle simulation (120 Hz) with car-vs-car contacts and sleeping.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `8c2adff` changed: Handling: latched input + per-step pad poll, grip-limited player steering, wired ABS/TCS/STM, contact smoothing, render interpolation, camera spring
- 2026-10-04 `500bd8f` changed: Perf r3: physics catch-up smoothing (vehicle/sim.js): steps per frame capped at the recent need (EMA of dt / h, rounded up, >= 2), the rest stays in the accumulator (<= 8 steps as before) and is worked off over the next frames; interpolation alpha clamped to 1 while behind. FiDi 45 m/s drive: 5-6 step frames 78 -> 5. ?nosimsmooth

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
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

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
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `6395401` changed: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.

### `src/world/facade/v2city.js`
Buildings v2: the real 1:1 OSM city (178k footprints) drawn with the facade system (material.js procedural facades, interior mapping, night windows, one params texel block per building from v2plan.js). Tiers: FAR   whole city, merged per 2 ...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` changed: Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-10-01 `b18f3d9` changed: Building colliders: split rectangle-cover boxes that stick > 3 m out of the footprint (diagonal facades left invisible walls up to 28 m into Market St)
- 2026-10-01 `aaa9e34` changed: Buildings v5: near sun-shadow cascade on by default (high/ultra), detail-only casters + every-other-frame refresh
- 2026-10-01 `b4b520e` changed: Buildings v5: dithered cross-fade MID <-> v3 facades / facade kit / front yards / city kit (pop fix)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
- 2026-10-04 `6395401` changed: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.
- 2026-10-04 `750fa36` changed: Perf r3: map streaming slices. stream.js: 2.5 ms per frame and a load only starts when its provider's typical cost (EMA per provider and load / unload) still fits; the first job of a frame always runs (6 ms budget used to start a 5-8 ms load at 5.9 ms). bld-col: a tile's building colliders + yard fences are added over a few frames (<= 1.2 ms each, nearest pending tile first; range 600 m) instead of 5-11 ms in the load. Kit cell bounds come from the build worker (v2detail pack bb; same numbers). ?nostreamslice

### `src/world/facade/v2detail.js`
Buildings v2 silhouette detail (kills the "square box" look). Pure functions over the plan arrays, run in the build workers with v2build.js: MID  (<= 1.4 km, merged into the tile mesh): projecting cornices, storefront cornice + belt courses...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `750fa36` changed: Perf r3: map streaming slices. stream.js: 2.5 ms per frame and a load only starts when its provider's typical cost (EMA per provider and load / unload) still fits; the first job of a frame always runs (6 ms budget used to start a 5-8 ms load at 5.9 ms). bld-col: a tile's building colliders + yard fences are added over a few frames (<= 1.2 ms each, nearest pending tile first; range 600 m) instead of 5-11 ms in the load. Kit cell bounds come from the build worker (v2detail pack bb; same numbers). ?nostreamslice

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
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `src/world/facade/v2lots.js`
Buildings v2 rowhouse individuation. OSM often traces a whole row of San Francisco houses as one long footprint, which then renders as one long box (one colour, one height, one flat roof). Here every residential footprint whose street

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `a61b163` changed: Buildings v5: massing variety (lot setbacks, bay forms, corner turrets / chamfers, mansards, balconies, real eaves)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `src/world/facade/v2plan.js`
Buildings v2 global pass: one tight loop over every real OSM footprint (178k) -> neighbourhood zone (real lat/lon), architectural style (zone + height + kind + area + levels), oriented bounding box, street-facing walls (outward probe

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fedfd56` changed: Buildings v5: Tenderloin bay stacks, per-lot window types, French doors at balconies, stoop hoods, loft parapet crests
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `src/world/facade/v2worker.js`
Buildings v2 build worker (v6): holds a copy of the footprint + plan arrays and builds FAR chunks, MID tiles, NEAR tiles (facade detail + merged Blender kit pieces) and storefront DRESS tiles off the main thread. Geometry comes back as

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `64aab3f` changed: Buildings v5: MID stoops, NEAR detail tiles dither in at 450 m, ?nov5 reaches the build workers
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `6395401` changed: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.

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
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

### `src/world/facade/v6yard.js`
Buildings v6: what a block looks like from above ("aerial reads boxy" fix). Pure functions run in the build workers with v2build.js emitMid (MID geometry, every distance up to the MID range, no LOD swap): - back yards behind houses / small ...

- 2026-10-04 `b9d1ee2` added: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs
- 2026-10-04 `6395401` changed: Yard fences + sheds collide: v6yard.js collects fence runs (both lot lines + the rear line, 0.3 m thick) and sheds as boxes while the MID tile builds (worker), mergeYardCols joins collinear touching boxes (back-to-back rear / shared side fences), the result rides with the MID result; v2city adds them as kind 'fence' only while the tile's bld-col (600 m) is live, dropping boxes that sample asphalt / paved raster cells (through-lot yards reaching a street), filtered lazily on collider load (<= 1.1 ms per tile). Fences are now double-sided (outer faces were missing: an invisible wall from the neighbour's side). Measured (Mission, dev/world2_shots.js __w2ColPerf): +7.8k colliders (33.5k -> 41.3k), collision queries 0.329 -> 0.312-0.336 ms / frame (noise), walking into a rear fence stops at the fence (7.9 m through -> 4.4 m). ?noyardcol = A/B. dev/world2_shots.js + world2_run.js: hot spot census, yard views, fence walk, collision cost.

### `src/world/geo.js`
Small geometry accumulator + 2D polygon helpers shared by the world builders.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/grass/capture.js`
Placement data for the ground-cover shaders. GroundCapture: an orthographic top-down render of the ground meshes around the camera into a float target (R = ground height, G = blocked (road / sidewalk / building / deck), B = ground present)....

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

### `src/world/grass/glsl.js`
Shared GLSL for the ground-cover layers (grass, flowers, ferns, shrubs, rocks). Every object is placed procedurally in the vertex shader from (chunk, object index): a hashed position inside the chunk, the ground capture (height, blocked mas...

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `be044ba` changed: Ground cover: ice plant = closed fleshy yellow-green / glaucous mats (wider finger leaves, 1.6x density, shallow base shade, no dry-grass tip bleach: the 0.35 base AO under warm light read olive-brown), red-tinged tips + whole red-bronze mats by patch, broad magenta flowers in flowering patches; lupines = slender spindle racemes (~16 x 2 cm on a shorter stem) with whorls of small florets (dark gaps, pale banner flecks, paler buds at the tip) in a deeper purple, less backlit translucency (were solid 13 cm cones). dev/grass_shots.js: CPU port of the flower / ice noise to find patches + review views. Shots (untracked shots/): fix_{iceplant,lupine}_{before,after}.jpg (top 18:20 golden hour, bottom 12:30).
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

### `src/world/grass/index.js`
GPU grass + ground cover (both maps). Ring of camera-centred, world-aligned chunks per layer; each visible chunk is one instance of a batch geometry holding N objects, placed/animated entirely in the vertex shader (glsl.js). CPU per frame:

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

### `src/world/grass/layers.js`
Ground-cover layers: object templates (CPU, built once), per-layer batch geometry (N copies of the template per chunk instance) and the materials (MeshStandardMaterial + onBeforeCompile; placement, wind and colour are in glsl.js).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `be044ba` changed: Ground cover: ice plant = closed fleshy yellow-green / glaucous mats (wider finger leaves, 1.6x density, shallow base shade, no dry-grass tip bleach: the 0.35 base AO under warm light read olive-brown), red-tinged tips + whole red-bronze mats by patch, broad magenta flowers in flowering patches; lupines = slender spindle racemes (~16 x 2 cm on a shorter stem) with whorls of small florets (dark gaps, pale banner flecks, paler buds at the tip) in a deeper purple, less backlit translucency (were solid 13 cm cones). dev/grass_shots.js: CPU port of the flower / ice noise to find patches + review views. Shots (untracked shots/): fix_{iceplant,lupine}_{before,after}.jpg (top 18:20 golden hour, bottom 12:30).

### `src/world/grass/yard_glsl.js`
Residential yard ground (surface class 9) as a lot patchwork instead of one green carpet. Shared by the terrain material (render/terrainmat.js: ground albedo) and the grass blades (grass/glsl.js: blade cover + colour), so blades only grow o...

- 2026-10-04 `3c697b8` added: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.
- 2026-10-04 `dbb6485` changed: Yard ground: fewer watered lawns (6-18 % by neighbourhood) and those a little drier in the fall; world2 yards_street view = a Richmond block from back-window height

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
- 2026-10-04 `4c056cf` changed: Perf r3: hero-interior reflection probe without the compile freeze: one PMREM generator kept for every probe (warmed at install at the probe size; a new one per probe released and recompiled its shaders), the cube capture's draws go through shaderwarm (extra guarded scenes): a capture with materials still compiling is dropped and retried 250 ms later. Hobart lobby while driving FiDi: 84-112 ms frame -> 8 ms. ?nointprobe

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
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)
- 2026-10-04 `ef382e1` changed: Perf r3: Chinatown asphalt decal segments merged per 120 m cell (ct_street.js; multiply blend, no depth write: order-independent, same overlaps), the 200 m hiding per cell: 40-55 transparent draws -> a handful. Night-rain look A/B (shots/r3_ctmerge_ab.jpg): rows b / c mean 3.4 / 3.6 (peds, rain), row a differs by a headlight / spray pool around the car (additive light, not the decal). ?noctmerge

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
- 2026-10-04 `fc00ce2` changed: Perf: shadow caster culling against the view (environment.js: a caster draws into the sun / nearest map only if its bounding sphere swept along the light to ~100 m below the focus touches the camera frustum; nearest map +5 m margin for its every-other-frame refresh): fixed-view A/B GPU -1.35 ms (Mission -0.7..-2.5), -100..-350 draws. Hero landmarks merged per slot material at load (Chinatown blocks ~165 -> ~60-90 draws each; ?noheromerge). Chinatown asphalt decal segments hidden past 200 m (fades to neutral by 140 m; were 40-80 draws anywhere). Water mirror re-rendered every 3rd frame while no water is within 320 m (sampled through the matrix it was rendered with). Look A/B (perf_shots s0/s1, shots/perf_shadowcull_ab.jpg): only moving peds / traffic differ. Switches: shadowcull, waterthrottle (render/perfflags.js)
- 2026-10-04 `0a5722a` changed: Perf: hero landmark shadow proxies: the casting slots of a hero LOD are merged into one position-only depth proxy per material side (slot meshes stop casting); the proxy's geometry bounds are parked out of every camera's view and environment.js' caster test uses userData.shadowSphere (far cascade wrapped too, no view cull). Chinatown shadow draws 434 -> 142; look A/B (shots/perf_heroshadow_ab.jpg) identical shadows. ?noheroshadow = A/B

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
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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
- 2026-10-04 `490dab1` changed: Pier 39: drivable plank deck everywhere it is drawn - every run of deck cells standing above the terrain (rim, overhang over the water, dock fingers, the 1.6-2 m cells the raster flatten skipped) becomes a flat terrain deck strip (2 m, kind 'pier', 1201 strips; groundAt ~0.23 us/call at the pier). Deck cells with physics ground > 10 cm under the planks 2772 / 18327 -> 1 (576 -> 0 that dropped to the water); drive test over 12 rim cells: 12 sank under the planks (to -2.9 m) -> 0. Shots (shots/ is untracked): fix_pier39_{before,after}.jpg.

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
- 2026-10-04 `b9d1ee2` changed: Buildings v6: district bay / roof / arched-window frequencies, neighbour repaint, mid-rise setbacks, back yards + roof decks + yard trees, FAR lite roofs

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
- 2026-10-04 `3125624` changed: Perf: cull Google tiles lying wholly inside our near block (every fragment there was discarded by the uNear mask) before the tiles renderer refines / loads / draws them, within 340 m of the focus (cells hand over at 420 m). Tile census: Mission ~190 of ~280 tile draws, FiDi 109 of 119, Chinatown 177 of 347 were fully masked. ?nomaskcull = A/B; look A/B (dev/perf_shots.js + perf_diff.py) only moving traffic / peds differ. Dev: perf_prof.js (per-pass GPU timer sections + CPU per render / draw category), perf_prof_run.js (district drive + profile), cpuprof_cdp.mjs (V8 sampling profile in the silent harness)
- 2026-10-04 `0c76264` changed: Perf: no first-use shader stalls (render/shaderwarm.js): with KHR_parallel_shader_compile a game-scene draw whose new program is not linked yet is skipped (status query throws a sentinel inside the draw) and retried next frame, capped at 600 ms; drive hitches from compiles (peds 404-445 ms, safehouse 783 ms, Bay Bridge tower / rooftile in the water reflection 428-481 ms) gone: Sunset max 824 -> 104 ms, Chinatown 862 -> 120 ms. Interior-site exterior shells hidden past 650 m (photogrammetry there; ~90 draws at any distance). Runtime switches render/perfflags.js (window.__perf, ?no<name>) for in-session A/B; dev/perf_ab.js (interleaved drives), perf_views_ab.js (fixed views), profiler shadow-pass categories
- 2026-10-04 `9659fd1` changed: Perf: Google tiles traversal every other frame (3-4.5 ms CPU) on a camera widened by 8 deg per side at the same pixel scale (same LOD), tile meshes frustum-culled by three every frame; a turn > 4 deg, fov / aspect change or jump traverses at once. Fixed-view A/B CPU -2.4 ms (Mission / FiDi); pan test (240 deg/s, throttled vs forced traversal per frame) differs no more than the A/A noise (max 6 vs 9 of 14400 cells). ?notilesthrottle. perf_views_ab.js: dev-only nocars / noprobe arms (traffic cars cost -2.4 ms CPU / -1.2 GPU, car probe -1.9 / -2.5 at the same views)
- 2026-10-04 `b1ab294` changed: Perf: tiles traversal every 3rd frame on a 10 deg-padded frustum (a ~5 ms traversal); tile content matrices static after load (no recompose of ~600 tile nodes per scene.updateMatrixWorld). Pan test 240 / 120 deg/s: max 7 / 4 differing cells of 14400 vs a forced per-frame traversal (A/A noise 9)
- 2026-10-04 `e506c0c` changed: Perf r3: Google tiles traversal in three phases on consecutive frames (world/v2/tilesphase.js: A = markUsedTiles, B = leaves / visible / toggle, C = LRU hand-over, requests, scheduleUnload, update-after; traversal functions copied from 3d-tiles-renderer 0.5.3, the previous used set stays marked until C so no unload pass can evict on-screen tiles mid-cycle). Per-frame tiles cost 0.3-0.6 ms per phase instead of 4-12 ms every 3rd frame; a sharp turn / jump finishes the cycle at once. Look A/B (shots/r3_tilesphase_ab.jpg): only peds / signals / clouds differ. ?notilesphase. perfflags.js also registers the other round-3 switches (intprobe, simsmooth, streamslice, texwarm, intkeep)
- 2026-10-04 `72ef212` changed: Perf r3: tiles phases start every 5th frame (A, B, C, two idle frames; was back to back): ~40 % less traversal CPU. dev/tiles_pan.js (free-camera pan, 160x90 readback per frame vs a full traversal on the real camera every frame): FiDi max / mean differing cells 115 / 51 (cycle 3) and 121 / 53 (cycle 5), A/A noise 202 / 93; Mission 584 / 332 and 1016 / 726, noise 761 / 500 and 1209 / 858 (tiles still streaming). gtiles.phCycle is runtime-tunable
- 2026-10-04 `7fd3e16` changed: Perf r3: tiles cycle time-sliced (tilesphase.js: one generator per update, markUsedTiles and toggleTiles yield every 16 tiles once the frame's ~1 ms slice is spent; the visibility changes of a pass are queued and applied together so a parent hidden in one slice and its children shown in the next never leave a hole), a cycle starts every 5 frames or when the last ends; the tile view error runs without the library's per-tile plugin-list copies / closures (resetFrameState was the top allocation site, 8.3 MB/s). Drive FiDi / Chinatown: gtiles mean 1.5-1.7 -> 1.1-1.2 ms; a sharp turn / jump still finishes the cycle at once. Pan test 120 deg/s: FiDi 117 / 52 differing cells vs A/A noise 202 / 96. Dev: perf_rt2 slowExcess (parts of the >= p90 CPU frames minus the median ones), trace_cdp ALLOC=1 (sampling heap profiler)

### `src/world/v2/graph2.js`
Road graph for the 1:1 real-data map, in the same node/edge shape as world/roads.js (traffic, drivers, GPS, police, events, props all consume it unchanged). Bridges, viaducts and tunnels become terrain decks.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `fbc705c` changed: Decks: single-lane ramp decks get a shoulder (>= 3.2 m to the barrier), no barrier stubs on an at-grade ground carriageway, tunnel walls stop under the surface above

### `src/world/v2/lotframe.js`
Lot frame of a residential block on the 1:1 map, for the yard ground patchwork (terrainmat.js / grass via the biome window, grass/capture.js). SF lots are 25 ft (7.62 m) wide along the block's long side and back-to-back at its centre

- 2026-10-04 `3c697b8` added: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

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
- 2026-10-04 `750fa36` changed: Perf r3: map streaming slices. stream.js: 2.5 ms per frame and a load only starts when its provider's typical cost (EMA per provider and load / unload) still fits; the first job of a frame always runs (6 ms budget used to start a 5-8 ms load at 5.9 ms). bld-col: a tile's building colliders + yard fences are added over a few frames (<= 1.2 ms each, nearest pending tile first; range 600 m) instead of 5-11 ms in the load. Kit cell bounds come from the build worker (v2detail pack bb; same numbers). ?nostreamslice

### `src/world/v2/terrain2.js`
Terrain for the 1:1 real-data map. Same query API as world/terrain.js (heightAt, groundAt, surfaceAt, deckAt, addDeck, curbAt, decks) so physics, AI and every placement module work unchanged. Heights are the baked 4 m grid (roads already

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `src/world/v2/terrainmesh.js`
Streamed terrain for the 1:1 map: per 512 m tile, 3 LODs (4 m near, 8 m mid, 32 m far) chosen by distance with hysteresis; far tiles are merged into 2 km chunks (few draw calls) and rebuilt without the tiles that went finer.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

### `src/world/v2/tilesphase.js`
(perf r3 10/4) Google tiles update spread over frames. TilesRendererBase.update() runs the whole traversal in one call (4-12 ms on our city: markUsedTiles ~40 %, toggleTiles ~35 %, queue / LRU / plugin hooks the rest); run every 3rd

- 2026-10-04 `e506c0c` added: Perf r3: Google tiles traversal in three phases on consecutive frames (world/v2/tilesphase.js: A = markUsedTiles, B = leaves / visible / toggle, C = LRU hand-over, requests, scheduleUnload, update-after; traversal functions copied from 3d-tiles-renderer 0.5.3, the previous used set stays marked until C so no unload pass can evict on-screen tiles mid-cycle). Per-frame tiles cost 0.3-0.6 ms per phase instead of 4-12 ms every 3rd frame; a sharp turn / jump finishes the cycle at once. Look A/B (shots/r3_tilesphase_ab.jpg): only peds / signals / clouds differ. ?notilesphase. perfflags.js also registers the other round-3 switches (intprobe, simsmooth, streamslice, texwarm, intkeep)
- 2026-10-04 `7fd3e16` changed: Perf r3: tiles cycle time-sliced (tilesphase.js: one generator per update, markUsedTiles and toggleTiles yield every 16 tiles once the frame's ~1 ms slice is spent; the visibility changes of a pass are queued and applied together so a parent hidden in one slice and its children shown in the next never leave a hole), a cycle starts every 5 frames or when the last ends; the tile view error runs without the library's per-tile plugin-list copies / closures (resetFrameState was the top allocation site, 8.3 MB/s). Drive FiDi / Chinatown: gtiles mean 1.5-1.7 -> 1.1-1.2 ms; a sharp turn / jump still finishes the cycle at once. Pan test 120 deg/s: FiDi 117 / 52 differing cells vs A/A noise 202 / 96. Dev: perf_rt2 slowExcess (parts of the >= p90 CPU frames minus the median ones), trace_cdp ALLOC=1 (sampling heap profiler)

### `src/world/v2/world2.js`
World assembly for the 1:1 real-data San Francisco (?map=v2). Same world API as world.js, content streamed by tile.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `3c697b8` changed: Yard ground: residential back yards (surface class 9) are a lot patchwork instead of one bright green lawn. grass/yard_glsl.js (shared by the terrain material and the grass blades): every yard point falls in a 25 ft lot of its block (v2/lotframe.js: block long side + centre line from props/v2blocks.js, per-cell frame in a float lot texture beside the biome window, capture.js) and gets watered lawn / dry golden lawn / bare dirt (darker leaf litter in shaded lots) / concrete slabs / brick pavers / bark mulch / decomposed granite, mix drifting per neighbourhood, fence-line planting beds in half the lots, SF fall season (Y_SEASON 0.75: most lawns golden-brown with green survivors). Blades only grow on the lawn lots (taller unmown dry lawns, no flowers on hard / mulched lots). Terrain tiles carry aYard (yard share per vertex); far lots fade to the mean colour (no shimmer). Parks keep their lawns. ?noyardground = A/B.

### `src/world/world.js`
World assembly: terrain -> road graph -> blocks -> meshes -> buildings -> landmarks -> props. Returns the query API.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)


## `tools/blender`

### `tools/blender/_compose.py`

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/bake_all.py`
Re-bake everything: projection check, rooms atlas, shops atlas, contact sheet.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/car_body.py`
HILLBOMB car body pass 3: modelled aero add-ons on the sculpted shells (called by cars.py after car_hero.detail).

- 2026-10-03 `42da11e` added: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)

### `tools/blender/car_door.py`
HILLBOMB cars pass 4: hinged front doors (called by cars.py after car_hero.detail + car_body.aero, before the AO bake).

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `tools/blender/car_door_preview.py`
Door split review (cars pass 4): import a built car GLB, swing both front doors open on their hinges, workbench renders.

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `tools/blender/car_glb_sheet.py`
Contact sheet of built car GLBs (cars pass 4 review): per car a front 3/4 and a rear 3/4 workbench render of the top

- 2026-10-04 `cb8e3ac` added: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `tools/blender/car_hero.py`
HILLBOMB hero car detail pass (called by cars.py for the hero / top-traffic ids, input <id>.hero.json).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

### `tools/blender/car_hero_preview.py`
Review renders of the hero detail pass (no bake, no export): shots/car2_blend_<id>.jpg (4 views, 2x2).

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/car_shape_sheet.py`
Body-shape review sheet (car body pass 3): one row per car, columns = side (ortho), front 3/4, rear 3/4, front (ortho).

- 2026-10-03 `42da11e` added: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)

### `tools/blender/car_textures.py`
Shared car detail textures (height fields -> tangent-space normal maps, numpy), saved through bpy.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `tools/blender/cars.py`
HILLBOMB car assets: Blender pass over the procedural car models.

- 2026-09-30 `d8a7ad5` added: Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `c750d23` changed: Cars pass 2: all 13 garage/traffic bodies rebuilt (hero detail pass), traffic-only L0 decimated to ~43k, cabin fill 3.5, perf A/B helper
- 2026-10-03 `42da11e` changed: Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)
- 2026-10-04 `cb8e3ac` changed: Cars pass 4 (code): hinged front doors, interior trim materials, LED tail light bars, sculpt terms for the other 45 bodies

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
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

### `tools/blender/hero_int_w6.py`
HILLBOMB hero interiors, wave 6: the landmarks that had no walk-in yet.

- 2026-10-01 `8174630` added: Interiors: wave 6 (Davies, Legion, arena, chocolate shop, Cliffside dining room, galleria, office lobbies), walkable balconies + lifts, real furniture everywhere
- 2026-10-01 `51a8035` changed: Interiors: auto exposure from lightmap medians (Saks/Macy's blow-out), chrome mirrors, Castro velvet seats + audience, review cameras, dev/int_shots.js
- 2026-10-01 `5f91f00` changed: Interiors: probe waits for library/prop textures (props were lit black), luminance-detail recolouring, arena frame fix, Cliffside hideExt + photo wall, Legion/Davies lighting, Macy's/Saks exposure, mem() accounting, 4K lightmaps kept
- 2026-10-01 `4346943` changed: Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `3d8c0be` changed: Interiors round 2 (code): per-room exposure trims from review shots + filmic roll-off + fixture white balance, dressing kit (racks, tables, mannequins, shelving, luggage carts, flowers, votives, pedestals, gates, reception), game trees in the glasshouses, Alcatraz cell clutter, real-size Legion / office lobbies / galleria, bigger crowds in busy places, de Young / Davies review fixes
- 2026-10-02 `8609279` changed: Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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
- 2026-10-04 `0ac6cf2` changed: Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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

### `tools/blender/peds/build_clips_extra.py`
Extra ped clips appended to public/assets/peds/clips.bin/json (idempotent: earlier extras are replaced): Rocketbox mocap (MIT) for getting in / out of a car seat: sit_down_chair_left/right, sit_stand_up_chair_left/right, try_door_outwards, ...

- 2026-10-03 `b51235b` added: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js

### `tools/blender/peds/build_index.py`
public/assets/peds/index.json: avatar list + crowd tags (style pools) from the per-avatar json files.

- 2026-09-30 `be35afd` added: Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot

### `tools/blender/peds/build_props.py`
Hand-held pedestrian props -> public/assets/peds/props.glb (original models, no third-party content). Objects (game space: +X right, +Y up, -Z forward; origin = the hand's grip point): phone + phone_screen (screen faces +Z, UV 0..1 for the ...

- 2026-10-03 `2c844f6` added: People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps

### `tools/blender/peds/cmu.py`
CMU Graphics Lab motion capture (mocap.cs.cmu.edu, free for any use incl. commercial products) ASF/AMC reader + FK. Frames: CMU world (Y up, the subject's rest pose faces +Z with its left side at +X). length unit = 1/0.45 inch.

- 2026-10-03 `b51235b` added: People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js

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

### `tools/crowd_bake.mjs`
Far-crowd impostor bake driver: runs dev/crowd_bake.js inside a game page over CDP and writes public/assets/peds/crowd_alb.png, crowd_nrm.png, crowd.json. Then: python tools/texpack.py --only crowd usage: CDP_PORT=9341 node tools/crowd_bake...

- 2026-10-03 `e911b3a` added: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

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
- 2026-10-03 `e911b3a` changed: People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

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
- 2026-10-03 `b51235b` People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `e911b3a` People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off
- 2026-10-04 `0ac6cf2` Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

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
- 2026-10-03 `42da11e` Cars body pass 3: sculpted shells for the 13 hero / top-traffic cars (models.js SCULPT: arch flares + haunches, coke-bottle waist, shoulder / cove / rocker section, raked nose + tail via split end-rounding lengths, bonnet dome + fender crowns, greenhouse tumblehome + plan taper; physics spec unchanged), quarter lights + glass-wrapped slim A-pillars, Blender aero add-ons (splitter, skirts: tools/blender/car_body.py), rebuilt GLBs/AO; shape review sheet tools/blender/car_shape_sheet.py; headless silent CDP harness dev/car3cdp.mjs + dev/car3shots.js; parked geometry bbox (ct_street crash)
- 2026-10-04 `a156f3a` Cars pass 4 (assets): all 57 loft bodies rebuilt through the detail / aero / door passes (garage bodies with level H, 2K AO atlases), hinged front doors on 53 (no doors: bus, cable car, picknick, buggy, kestrel), interior material classes, LED tail light bars; cars.json carries the door hinges; AO packed (texpack --only cars/). 37 -> 81 MB on disk (lazy per id).

### `public/assets/hdri/` (9 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `public/assets/kit/` (15 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `public/assets/landmarks/` (780 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `9b6cda8` Hero interiors: BC1 .dds lightmaps, night lightmap bake + time-of-day windows, residency cap, ambient people + indoor reverb bed, landmark map markers + door labels
- 2026-09-30 `54aafd7` Interiors v2 pipeline: CC0 PBR library (ambientCG/Poly Haven, BC1/BC3), Poly Haven props, OIDN-denoised bakes, box-projected probes
- 2026-10-01 `4346943` Interiors v2 bakes: 39 hero walk-ins rebaked (OIDN day + night lightmaps, BC1 .dds, Poly Haven props), 9 new interiors, Oracle bowl seat rows + Sutro Baths promenades; inside a room the sun/moon/sky light is replaced by the room probe; unlit interior glass; prop/detail IBL gain
- 2026-10-01 `272db80` Chinatown hero set: 16 baked blocks + Dragon Gate (day/night lightmaps, BC1), lantern festoons + rain-haze halos, LOD1 night tint, pavement light pools, mirror rendered inside the wet pass (after the main render), stronger soaked sheen on the hero streets, ?noct A/B
- 2026-10-01 `5dfaa4d` Interiors round 2 bakes: 35 interiors rebaked with the dressing kit, refined exposure trims (v3 review shots), street-view dimming of lit interiors (Phelan lobby glowed white in the 'market' regression view)
- 2026-10-02 `af8b9db` Chinatown round 2: rebake (brick-heavy, a lit box sign per shop bay + neon frames, more blades, lantern rows at 2-3 heights, interior-mapped window rooms, ground strips on the road surface, stray Old St. Mary's sliver removed), night look (lightmap pow/gain + normal-map relief, dark hero ambient, zone hemi/IBL/sky/fog darkening), darker puddled asphalt + sharper hero mirror with cars in it, harness fixes (lastSafe follows teleports, prologue=0, detached chase car), sheet shots/chinatown_vs_ref_v2.jpg
- 2026-10-02 `8609279` Interiors round 3: Macy's/Saks cosmetics halls (lit counters, fictional brands, dark ceiling + warm downlights, darker floors, entrance review camera); Davies house lights + lit stage, hideExt (exterior roofs cut the hall); glasshouse leaves un-premultiplied + translucency glow; Alcatraz/Chase IBL + exposure raised; sheet shots/int_sheet_v4.jpg
- 2026-10-04 `0ac6cf2` Interiors round 3: Davies hall floor (full-width orchestra treads + floor + top landing: no ground strip under the side tiers), Alcatraz cells lit (a bulb in every cell, some out; brighter skylights), sparse halls densified with new dressing kinds library / cafe / lobby / foyer / science + 10 more Poly Haven models (library, Transamerica, Salesforce, Exploratorium, Ghirardelli, Opera, JW Marriott, Legion); 10 interiors rebaked + packed + indexed; sheet shots/int_sheet_v5.jpg

### `public/assets/manifest.json/` (1 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)

### `public/assets/map/` (7 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-10-01 `112afa9` Map bake: tunnel portal approaches straightened (YBI east portal dropped 4.6 m out of the bore); stacked I 80 deck offset moved to structure nodes (sqrt(sin) hump made 56-107 % grades on the YBI viaduct)

### `public/assets/peds/` (327 files)

- 2026-09-30 `be35afd` Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-03 `b51235b` People 2a: mocap one-shots + ragdoll. Car entry/exit = Rocketbox sit-down / stand-up clips gliding the body door<->seat (anchored rig, side-aware); knockdowns = Verlet ragdoll (18 particles, hinge + anti-fold limits, sloped ground, follows the wall-aware tumble) then CMU get-up from back / front placed on the body (owners adopt getupRoot); jump / air / land from CMU 105_39; player jump no longer swallowed by the ground snap; avatar loads retried; tools/blender/peds/cmu.py + build_clips_extra.py; dev/peds2_shots.js
- 2026-10-03 `2c844f6` People 2b: real hand-held props (tools/blender/peds/build_props.py -> peds/props.glb): smartphone with a lit app screen (brighter at night), 8-rib umbrella open (rain) / furled in hand (drizzle, wet streets) in 8 colours, coffee cup (right hand, drink-idle arm), shopping bag / briefcase hanging from the hand with a lagging swing (hold-bag arm at half weight; swaps hands under an open umbrella); carry assigned by crowd style; peds/props.js HeldProps
- 2026-10-03 `e911b3a` People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

### `public/assets/tex/` (164 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry

### `public/assets/texpack.json/` (1 files)

- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
- 2026-09-30 `be35afd` Peds: realistic Rocketbox humans (MIT) for pedestrians + player on foot
- 2026-10-03 `e911b3a` People 2c: far crowds = multi-angle impostors. 16 Rocketbox avatars baked walking (8 views x 8 gait phases, 32x64 cells, albedo + view normals; dev/crowd_bake.js + tools/crowd_bake.mjs, BC3 via texpack) drawn as one instanced draw of camera-facing quads (view sector + phase picked in the vertex shader, baked normals lit by the PBR path, mip-safe coverage, dithered 132-158 m hand-off from the real peds, fade 360-420 m). Agents walk the block sidewalk rings around the camera by district density x night x rain, budget weighted toward nearer blocks (High 2600 / Medium 1400 / Low 600, ~0.1-0.2 ms CPU); ?nocrowd = off

### `public/assets/trees/` (85 files)

- 2026-09-30 `d8a7ad5` Snapshot 2026-09-30: state during lighting/flicker regression fix + perf work (baseline for bisecting)
- 2026-09-30 `4075efc` Perf/VRAM: BC1/BC3 textures, Low/Medium/High/Ultra presets, dynamic resolution, smaller tile cache, free building geometry
