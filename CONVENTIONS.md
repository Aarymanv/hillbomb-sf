# HILLBOMB: San Francisco. Engineering conventions

Browser open-world driving game (GTA/Forza style) in a stylised San Francisco. Vite + three.js r180, vanilla ES modules, no other runtime deps.
Everything is procedural (geometry, textures via canvas, audio via WebAudio). There are no binary assets.

## Frames and units
* Metres, seconds, radians. Speeds in m/s internally.
* WORLD: +X east, +Z south (north is -Z), +Y up. Sea level y = 0. See `src/world/anchors.js` for bridge and landmark anchors.
* OBJECT LOCAL FRAME (cars, humans, props): **+X = right, +Y = up, -Z = forward**. Origin at ground level (y = 0 = bottom of tyres or feet).
  For cars, the origin is centred between the axles (x = 0, z = 0 at the wheelbase midpoint).
* yaw = rotation about +Y, same sense as `object.rotation.y` in three.js. A yaw of 0 means the object faces -Z (north).
  Local->world for an oriented box: `wx = x + cos(yaw)*lx + sin(yaw)*lz; wz = z - sin(yaw)*lx + cos(yaw)*lz`.
* Colliders (static): `{ x, z, hx, hz, yaw, yMin, yMax }` = oriented box in XZ (half extents hx along local X, hz along local Z) spanning y in [yMin, yMax].

## Rendering rules
* Use `MeshStandardMaterial` / `MeshPhysicalMaterial` / `MeshBasicMaterial` / `MeshLambertMaterial`. Leave `fog` at its default (true).
  The engine patches three's fog shader chunks globally into a height fog (the "Karl the Fog" system), so built-in materials pick it up automatically.
  If you must write a `ShaderMaterial`, include three's fog chunks + `fog: true` + `UniformsLib.fog`.
* `scene.environment` is set by the engine (sky PMREM), so do not set `envMap` per material.
* Draw calls matter. Merge static parts per material (`BufferGeometryUtils.mergeGeometries`, import from `three/addons/utils/BufferGeometryUtils.js`).
  Use vertex colours to fold many colours into one material. Cache geometry per model id and share it across instances.
* Night: modules that own emissive things expose `update(dt, env)` where `env = { time /*s since start*/, night /*0 day..1 full night*/ }` and drive `emissiveIntensity` from it.
* Shadows: large static structures `castShadow = true`. Small or numerous things are optional. `receiveShadow = true` on big surfaces.

## Module ownership
* Orchestrator (main agent): `src/main.js`, `src/world/*` (except the modules below), `src/vehicle/physics.js`, `src/vehicle/sim.js`, `src/game/game.js`, `src/game/drivers.js`, `src/game/traffic.js`, `src/game/modes.js`, `src/game/sys_police.js`, `src/game/sys_cablecars.js`, `src/player/*` (except human.js), `src/ui/theme.js`, `src/world/latlon.js`.
* Festival/campaign agent: `src/game/festival/**`, `src/game/sys_festival.js`, `src/game/sys_events.js`, `src/game/economy.js`, `src/game/skills.js`.
* UI shell agent: `src/ui/**` (except theme.js), `src/game/sys_menus.js`. Provides `G.ui` (markers, menu tabs, screens, map, slots, notify).
* Cars agent: `src/vehicle/cars.js`, `src/vehicle/models.js`, `src/vehicle/tuning.js`, `src/game/garage/**`, `src/game/sys_garage.js`, `dev/cars.*`. Provides `G.garage`.
* Render agent: `src/render/**`, `src/game/sys_photo.js`, water code. Provides `G.weather`, photo mode.
* Audio agent: `src/audio/**`, `public/assets/audio/**`, `src/game/sys_spotify.js`, `dev/audio.*`.
* Landmarks: `src/world/landmarks.js` + `landmarks/`. Human: `src/player/human.js`. Buildings/facades: `src/world/buildings.js` + `facade/`.
* Street props: `src/world/props.js` + `props/`. Pedestrians: `src/game/sys_peds.js` + `peds/`. Interiors: `src/game/sys_interiors.js` + `src/world/interiors/`.
* Place content in real lat/lon via `src/world/latlon.js` `ll(lat, lon)` and snap to roads; the map is being rebuilt at real scale.
* UI screens use `src/ui/theme.js` (tokens, classes, `piBadge`, `makeNav` for keyboard + gamepad).
* Hooks in main.js: `G.renderOverride = { update?(dt), render(renderer, dt) }` renders a whole screen instead of the world; `G.cameraOverride = { update(camera, dt) }` drives the camera after the rig.
Any `src/game/sys_*.js` module is auto-installed by main.js: it must `export function install(G)`.
Testing and capture: see TESTING.md.
Quality bar: think of a current AAA open-world game in the browser. The Spiderbench project in ../spiderbench-ref is a QUALITY reference only.
Its license forbids copying, so do not open, copy or adapt its code or assets.
Do not edit files you do not own. If you need something from another module, write it down in your final report.

## Dev server
`npm run dev` serves on http://127.0.0.1:5190/ . Any `dev/*.html` page is served too, e.g. http://127.0.0.1:5190/dev/cars.html.
`npx vite build` must succeed.
