# Render agent status: water / weather / photo mode (2026-09-28, complete)

Everything below is built (`npx vite build` passes) and was verified in the real game on 5191.
Before shots are `shots/base_*` and after shots are `shots/after_*` (1280x720).

- **Water** `render/water.js`, created in `world/world.js` (water block).
  The surface is a camera-centred polar grid with displaced surf and swash. It has a planar reflection on layer 5, a coast field
  built on the GPU from the terrain heightfield, foam, glint and see-through shallows. Tiers come from `quality.water` 0/1/2.
- **Weather** `render/weather.js`, available as `env.weather` and `G.weather` (installed by `game/sys_photo.js`).
  It drives the sky (hdrisky.js, sky.js), the fog bank (fog.js `HB_FOG`) and wet materials (fog.js `HB_WET`).
  It also owns rain, splashes and lightning; lens drops, wet SSR and DOF are in post.js; light streaks in `wetstreaks.js`.
- **Photo mode** `game/sys_photo.js` + `render/photo/looks.js`. Key V, L3+R3, or the UI shell's Photo tab.
- The far shadow cascade (high quality) is in environment.js. N8AO transparency mode is off (saves ~5.7 ms CPU per frame).

## Open items for other modules
- props.js: dim the lamp pools on wet ground. `import { HB_WET } from '../render/fog.js'`, then at props.js:1262 use
  `poolMat.color.setScalar(Math.min(1, nightV * 1.15) * (1 - 0.5 * HB_WET.x));`
- UI settings row: `opts: G.weather.MODES, get: () => G.weather.mode, set: v => { G.weather.mode = v; }`.
- Audio hooks: `G.audio.weather({ rain, wind, storm, indoors })` every second, `G.audio.thunder(distanceMetres)` per strike.
