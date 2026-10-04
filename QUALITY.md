# HILLBOMB quality scorecard

The bar is "near perfect": every area should read as real and play well, and no pass may make another area worse.
Scores run 0-10 and are judged from the user's screenshots plus our own measurements. The lowest scores get worked on first.

## Rules for every pass
1. Before reporting, run the regression views (`dev/regress_shots.js`: `__regAll('after')`) and compare them with the known-good targets:
   - day: `shots/REG_old_jackson_day_LIKED.webp`
   - night: `shots/REG_old_washington_rain.webp`
   - also `shots/reg_*_after.jpg` from 9/30
2. Flicker must stay steady. Check with a real-time probe (`dev/flicker_rt.js`); hidden-tab frame stepping can't catch every flicker.
3. Perf can't regress by more than 1 ms (`dev/perf_drive.js`), and GPU memory must stay within budget (High < 3.5 GB, Low < 2 GB).
4. Commit each self-contained change, so anything that regresses can be reverted.
5. The user plays on :5191 (the live watch build), so never leave it broken between steps.

## Scores (9/30 evening)
| Area | Score | Done means | Current owner / next |
|---|---|---|---|
| Lighting / sky / night | 6 | Matches the liked day + night shots, no flicker | Restored 9/30 (ACES, lanterns, signs, reflections); 10/1 lantern cores kept below the ACES white point (no pink-white), Chinatown hero streets baked GI + wet-street mirror (shots/chinatown_vs_ref.jpg) |
| Performance / VRAM | 6 | 60 fps, < 3.5 GB VRAM on High, no hitches > 50 ms | 10/1 (4075efc): High 2.2-2.7 GB, Low 1.4 GB, no leak. 10/4 perf pass (3125624..b1ab294): real-time 1080p High 33-41 fps (was 32-37), shader-compile hitches (430-830 ms) gone, max hitch 60-130 ms; 10/4 round 2 (cars, 032b7e1..c1d20b8): real-time 41-66 fps (p50 15-25 ms), frame CPU 14-20 ms; 10/4 round 3 (a3d8f4c..): tiles update time-sliced, interior / texture-decode / streaming / physics spikes cut: 45 m/s drives (interleaved A/B) Mission 67, FiDi 54 -> 60, Chinatown 48.5 -> 51, Sunset 76, Twin Peaks 71 fps, CPU p95 -2..-4 ms; rAF p95 still 33-38 (frames just over 16.7 ms); next: Chinatown hero batching, GC, tiles outside-frame work (NEXT_SESSION perf r3) |
| Driving / handling | 6 | Predictable, responsive, no dropped inputs | 10/1 commit 8c2adff: dropped taps 38->1, slalom spins 37->0; needs user feel test |
| Buildings / streets | 6 | Not boxy, varied, grounded, no pop-in | 10/1 v5 (aaa9e34..d3f79ed): bays/turrets/mansards/setbacks, near shadows, dither fade (pops 401->96); 10/3 v6: district bay/roof/arch frequencies, neighbour repaint, back yards (fences/decks/patios/sheds) + roof decks + yard trees (shots/bld6_*); terrain yard lawn still uniform green |
| Landmarks / interiors | 6 | Recognisable 1:1 exteriors, near-photoreal walk-in interiors, on the map | 10/1: 39 walk-ins rebuilt, real furniture, day/night bakes, map markers; many halls still sparse/overexposed (Macy's, Saks, Legion, office lobbies); 10/3 round 3: Davies floor gap fixed, Alcatraz cells lit, 8 sparse halls dressed (shots/int_sheet_v5.jpg) |
| People | 6 | Realistic bodies, faces, clothes, animation | 10/1: 53 Rocketbox mocap peds (be35afd, 3b3e0ca). 10/3 round 2: modelled props (phone w/ lit screen, umbrellas, cup, bag, briefcase), far-crowd impostors 140-420 m, mocap car entry/exit + CMU jump/get-up + Verlet ragdoll knockdowns (shots/peds2_sheet.jpg); 10/4 car doors open / close with the entry / exit (+ carjack) |
| Cars | 6 | FH-level bodies, paint, lights, interiors | 10/3 pass 3: 13 bodies sculpted (flares, waist, raked noses, tumblehome), slim A-pillars, window-lit cabin + lit gauges; 10/4 pass 4: all 57 loft bodies sculpted + detail pass, hinged front doors (53), interior material classes (soft-touch / leather / brushed / piano), brighter cabin, LED tail light bars bloom (shots/car4_*) |
| Nature | 6 | Real SF species, parks, coast | done 9/29; 10/4 ice plant mats + magenta flowers, slender lupine racemes (shots/fix_{iceplant,lupine}_*) |
| Roads | 6 | Real asphalt, markings, rails, curbs, wet | 10/2 road 2: streaked wet reflections (no sparkle), warm rough asphalt, crisp markings (shots/road2_vs_ref.jpg) |
| Sound | 6 | Engines, city, music feel right | 10/1 (35be7a7): no clipping, drone fixed, district + road sounds; needs user listen test |
| Gameplay (races, missions, police, menus, progression) | 6 | Everything works and feels good, no softlocks | 10/4 round 3: all non-showcase events finish incl. Headlands Dirt / XC, off-road rival respawns <= 7 per race (were 17-118), cops 24/24 arrive (median 4.8 s), no wrong-way spawns, Pier 39 deck drivable (NEXT_SESSION) |
