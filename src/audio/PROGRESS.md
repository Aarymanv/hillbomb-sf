# Audio: maintainer notes

Everything audible is recorded CC0 audio from `public/assets/audio/` (listed with sources in `manifest.json`).
Synthesis only fills gaps while a sample is loading or missing (and for the EV motor whine, which really is tonal).

## Files
* `audio.js`: `createAudio()`, public API, bus structure + master chain, the menu/cutscene director (`attach(G)`).
* `assets.js`: manifest + on-demand decode cache (engines per family, SFX after unlock, ambience ~1.5 s later).
* `engine.js`: sample-based engine voices + profile table (`ENGINE_PROFILES`).
* `sfx.js`: tyres, wind, scrape, impacts, horns, sirens, bell, foghorn, pass-bys, UI kinds.
* `ambience.js`: district/time beds, weather, thunder, sparse one-shots.
* `music.js`: radio (streams tracks through one `<audio>` element, live station timelines, idents, external stations).
* `spotify/*` + `src/game/sys_spotify.js`: the Spotify station (tests: `node dev/audio.spotify.test.mjs`).
* `shots.js` (one-shot pools with voice stealing), `dsp.js` (small helpers).

## Engines
Each family sprite (`engines/<family>.mp3`) holds seamless loops, each de-chirped to a constant firing frequency F
and cut on whole 720-degree cycles. A voice plays the two loops bracketing F = rpm * cyl / 120 at rate F / F_loop.
Families: flat4 (Scion FR-S dyno + WRX idle), v10 (gear pulls), v8 (Mustang GT500 + 1700 HP dyno + F150 idle),
diesel, bus. Other profiles reuse these by firing frequency plus EQ (see `PROFILES`).

## Regenerating assets
`dev/audio.pipeline/` has the scripts (Python 3 + numpy/scipy + ffmpeg): `fs.py` (Freesound CC0 search/verify/
download), `trk2.py` (harmonic-comb rpm tracking), `build_family.py spec_<family>.json`, `pack_engines.py`,
`passby.py`, `extra_sfx.py`, `build_manifest.py` (merges `fragments/*.json` into `manifest.json` and rewrites the
Audio section of `public/assets/ASSET_LICENSES.md`). Only CC0 sources (Freesound "Creative Commons 0", Kenney,
OpenGameArt items listing CC0).

## Measuring
`dev/audio.scenarios.html` renders scenarios offline through the real master chain (`S.run({ impl: 'new' })`);
`dev/audio.html` is the interactive bench. Before/after: put a HEAD copy of src/audio in `dev/_audio_before/` (git show) and run
`S.run({ impl: 'old' })`; WAVs posted to a local receiver were measured with ffmpeg ebur128 (LUFS, true peak) + numpy (clicks, bands).

## Mix and levels (review 10/1, offline renders through the master chain)
* Integrated loudness: WOT driving (Hyde climb, drift, freeway, tunnel) -14 to -16 LUFS, 30 mph cruise -20.6, idle -24, city
  beds -20 to -24, interiors -26; true peak <= -3 dBTP everywhere, 0 clipped samples. Limiter is a safety net, not a sound.
* Engine loudness model compressed (idle -9.5 dB, cruise ~-7 dB re. WOT redline) so the car is always present; ENGINE_GAIN 1.55.
* Side-chain (`core.sidechain`, called by the hero engine): radio -2.5 dB and traffic -3 dB at full throttle; Spotify follows at 4 Hz.
* Radio default ~-21 LUFS (MUSIC_TRIM 0.85); Spotify volume factor EXT_MATCH 0.96 matches it, assuming Spotify's -14 LUFS normalisation.
* Traffic: idle NPCs at half level, voices share a 1/sqrt(n) budget above two, darker with distance (8-car queue = +0.4 dB over solo idle).
* Tunnel: `core.space('tunnel')` (from `ambience.update({ tunnel })`) sends engine/traffic/fx into a 2.6 s slap-back reverb.

## World detail hooks (game.js passes them; all optional)
* `tires.update({ surface: 'brick' (Lombard crooked block) , rails 0..1 (cable-car / Market St), paint 0..1 (crosswalk band) })`, wet from weather.
* `ambience.update({ street, tunnel, indoors })`: night-market chatter by district/time (Chinatown, North Beach, ...), F-line streetcar
  on Market / Embarcadero, cable cars pulling away on Powell/Hyde/Mason/California, indoor walla (level from `core.indoorMur`,
  set by hero_int_life.js), outside world low-passed indoors / in the cabin.
* `foot.update({ speed, grounded, surface, indoor })`: recorded footsteps (street concrete / hall floor), cadence from speed, landings.
* Blow-off valve on a throttle lift under boost (not only on upshifts).

## Known limitations
* V12 / W16 near redline are pitched up from the V10 / V8 recordings (playback rate up to ~1.5-2x).
* Only flat4 has true overrun (off-throttle) loops; other families darken and drop the on-load loops.
* Diesel and bus have an idle + one on-load loop each (audio rpm compressed 0.8x).
* No CC0 grass rolling recording: grass uses the gravel loop slowed and low-passed.
