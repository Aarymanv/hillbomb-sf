# Festival layer: progress note (paused: token budget)

`npx vite build` passes. Test on 5191 (`/?play&mode=forza&prologue=0`), stepping `G.update` headless (see "Test kit").

## Done
- Everything listed in the previous note (G.festival, save v2, catalog, races, showcases, stunts, sites, stories,
  collectibles, prologue, screens, markers) plus, this session:
- UI shell requests: screens open with `padKeys:false`; race HUD fed through `G.hud.race({pos, of, lap, laps, cp, cps,
  time, gap, best, target})`; `G.events.restart()` / `activeInfo()`; `G.festival.roadsDiscovered()` -> {discovered,
  total}; 'campaign' + 'collection' pause tabs re-registered after sys_menus' fallbacks (verified in the menu).
- Class limits shown as real PI caps (e.g. "A 800"); rival cars drawn from the top of the class.
- Fixes: auto-reverse disabled while cars are held on the grid (they reversed off it); exact key threading; despike
  (incl. circuit start/finish seam); divided roads race down the right carriageway; route obstacle clearance;
  tracker forward-jump penalty; parked cars cleared from race corridors; car-spec cache (grid build 600 ms -> 20 ms);
  rival car-following; tighter off-route / stuck auto-reset ("Stuck? Press R"); finish line 4 m before route end;
  showcase lost when the opponent finishes first; fog pace follows road curvature; results labels (Caught/Beaten).

## Verified (headless, ghost driver = `G.festival.debug.ghost(true, speed)`)
- Marina Sprint (autopilot) full flow; Fleet Week (beaten flow + reveal shot); Fog Bank (fog pacing, caught flow);
  Foil Rush (win, PB, clean bonus); Richmond Circuit (2 laps, lap times, results) with the player.

## Known issues (next)
1. Circuit rivals still stall / go backwards on Richmond Circuit: the ghost player is teleported through the pack
   (test artefact) but check with the autopilot; possibly AI respawn after the seam fix. Investigate `aiStep`.
2. Not yet run: drag, drift event, dirt/xc races, stories (tail/tag/smash/fare/...), prologue (`?prologue=1`),
   prize spin, hub screen, house purchase, board smash, barn find.
3. `__shot` only captures WebGL (no DOM HUD/screens): use the browser screenshot for UI shots.
4. Screenshot batch still to do: site day/night, event card, race HUD, results, prize spin, map, mission, prologue.
5. Final report to the orchestrator (API, files, requests: race-mode avoidance/overtaking in drivers.js).

## Test kit (paste in the page console)
```js
window.__manual = true;
window.__step = (n, dt = 1/60) => { for (let i = 0; i < n; i++) { __input.update(); if (window.__autopilot) window.__autopilot(__input, dt); if (__G.state === 'play') __G.update(dt); __G.cameraOverride?.update(__camera, dt); __input.endFrame(); } };
__G.festival.debug.chapter(6); __G.festival.startEvent('richmond-circuit', { car: 'tora' }); __step(400); __G.festival.debug.ghost(true, 25);
```
