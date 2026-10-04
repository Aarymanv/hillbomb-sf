# Cars / garage: progress note

## Done (verified in the real game at 5191 and in Node)
- Roster: 57 cars (56 drivable + hidden cable car), 32 fictional makes, every car has its own procedural model (43 new bodies).
- Physics/PI: derived gearing + drag, QSS performance model; real-physics lab (0-100, vmax, braking, skidpad, adaptive-driver
  laps). Final run: all 57 cars lap clean, Spearman rho(PI, real test-route lap) = 0.987. Build-keyed perf cache added (the
  HUD re-reads spec() every 2 s).
- Garage end to end in game: pause-menu 'cars' tab (replaces the fallback), G hotkey, Autoshow buy, Upgrades (parts +
  auto-upgrade to class, live before/after bars + PI), Tuning (22 sliders, save/reset), Paint (7 finishes, liveries, rims,
  calipers, tint), Collection, My Cars -> Get in (respawns with the build), pickCar, give + reveal. HUD hidden while open.
- Studio: softbox PMREM env, reflective turntable (mirrored car), contact shadow, orbit (mouse/wheel/right stick/triggers).
- Bay Motors dealership + safehouse garage routed to the garage screens at runtime (shared interiors ctx.carCard /
  ctx.garageMenu, originals kept as fallback). Needs a walk-in test.
- `npx vite build` passes.

## Next
1. Walk-in test of Bay Motors (interact -> Autoshow focused on that car -> buy -> spawns at the drive-out door).
2. Small model polish: studio framing crops long trucks at 3/4; trophy truck front arches very open; kestrel shots too far.
3. Optional: hero LOD for traffic (traffic uses full models; parked cars use proxies).

## Known issues
- Engine swaps change the sound only after the orchestrator's game.js fix (v.def.engine) lands.
- Tune sliders marked "approximated" write their named params (brakeBias, antiRollF/R, springF/R, camber*, toe*, tyrePress*,
  diffAccel/Decel, awdFront, aeroF/R) and apply documented proxies until physics.js reads them.
- EVs use 2 gear ratios (physics has no motor model: request P.motor { torque, power }).
