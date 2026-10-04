# HILLBOMB: San Francisco

An open-world driving game set in a 1:1 recreation of San Francisco, inspired by Forza Horizon. It runs entirely in the browser.

![Chinatown, night rain](screenshots/01-chinatown-night-rain.jpg)

**Jump to:** [Showcase](#showcase) · [How to run it](#how-to-run-it) · [Controls](#controls) · [Project layout](#project-layout) · [Changelog](CHANGELOG.md) · [Every file and its history](FILES.md) · [Credits](#credits-and-attribution)

## What it is

- **The real city at real scale.** About 178,000 buildings and the full street network come from OpenStreetMap, with terrain from USGS elevation data, so Hyde, Lombard and Twin Peaks have their real grades. The far skyline streams in from photogrammetry.
- **Recognisable San Francisco.** 60+ hand-built landmarks, from the Golden Gate and Bay Bridge to City Hall, Coit Tower, the Ferry Building, Alcatraz and Oracle Park. 39 of them have interiors you can walk into.
- **A living city.** Traffic, police chases, 53 motion-captured pedestrian characters, cable cars and Muni sounds. Each district has its own look and soundscape.
- **Time of day and weather.** A physically based sky with volumetric-looking clouds, Karl the Fog rolling over Twin Peaks, rain with wet-street reflections, and neon nights.
- **Festival, Outlaw and Free Roam modes.** 39 races and events across the city, 20 story missions, and a creative mode with fast travel and time, weather and graphics controls.
- **Built for the browser.** three.js / WebGL 2 with streamed tiles, compressed textures, quality presets and dynamic resolution.

## Showcase

### Night

![Grant Avenue at night](screenshots/02-grant-ave-night.jpg)

| | |
|---|---|
| ![Mission Street in the rain](screenshots/03-mission-rain.jpg) | ![Bay Bridge at night](screenshots/11-bay-bridge-night.jpg) |
| ![Car at night in the rain](screenshots/21-car-night-rain.jpg) | ![Twin Peaks at sunset](screenshots/08-twin-peaks-sunset.jpg) |

### Day

| | |
|---|---|
| ![Chinatown by day](screenshots/04-chinatown-day.jpg) | ![Hyde Street](screenshots/05-hyde-street.jpg) |
| ![Haight Street](screenshots/06-haight-street.jpg) | ![Car at golden hour](screenshots/20-car-golden-hour.jpg) |
| ![Twin Peaks at golden hour](screenshots/07-twin-peaks-golden-hour.jpg) | ![Karl the Fog rolling in](screenshots/09-karl-the-fog.jpg) |

### Landmarks

| | |
|---|---|
| ![Golden Gate Bridge](screenshots/10-golden-gate-bridge.jpg) | ![Palace of Fine Arts](screenshots/12-palace-of-fine-arts.jpg) |
| ![Oracle Park](screenshots/13-oracle-park.jpg) | ![Painted Ladies, Alamo Square](screenshots/14-painted-ladies.jpg) |
| ![Golden Gate Park](screenshots/22-golden-gate-park.jpg) | ![Pedestrians downtown](screenshots/19-pedestrians.jpg) |

### Walk-in interiors

| | |
|---|---|
| ![Palace Hotel Garden Court](screenshots/15-palace-hotel-garden-court.jpg) | ![Department store rotunda](screenshots/16-neiman-rotunda.jpg) |
| ![Grace Cathedral](screenshots/17-grace-cathedral.jpg) | ![Hotel lobby, Union Square](screenshots/18-st-francis-lobby.jpg) |

## How to run it

**You need:** [Node.js](https://nodejs.org) 20 or newer (tested on 22), and Chrome or Edge on a PC with a dedicated GPU (WebGL 2). Cloning the repo downloads about 1.5 GB of game assets.

```bash
git clone https://github.com/Aarymanv/hillbomb-sf.git
cd hillbomb-sf
npm install
npm run dev
```

Then open **http://127.0.0.1:5190** and press Enter on the title screen.

**Optional: the photoreal far city.** The distant skyline uses Google Photorealistic 3D Tiles, which needs your own Google Cloud key with the Map Tiles API enabled (restrict it to your local HTTP referrers). Create a file named `.env.local` in the project folder:

```
VITE_GOOGLE_TILES_KEY=your-key-here
```

Without a key the game runs normally and draws the far city from its own buildings.

**Production build:** `npm run build`, then `npm run preview` and open http://127.0.0.1:4190.

**Useful URL options:**

| Option | What it does |
|---|---|
| `?tiles=0` | Turn the Google 3D Tiles off |
| `?mute` | Start with all sound off |
| `?map=v1` | The older, smaller stylised map |
| `?sky=hdri` | Photo skies instead of the physically based sky |

Graphics presets (Low / Medium / High / Ultra), dynamic resolution and handling options are in the in-game Settings menu.

## Controls

| Action | Keyboard | Action | Keyboard |
|---|---|---|---|
| Drive / walk | W A S D or arrows | Handbrake / jump | Space |
| Get in / out of a car | F | Enter a building, interact | E |
| Reset car | R | Camera | C |
| Look back | Q | Map (click to fast travel in Free Roam) | M |
| Pause / settings | Esc or P | Garage | G |
| Radio next / previous | T / Y | Headlights | L |
| Horn | H | Photo mode | V |
| Phone | Tab | Controls help | F1 |

Gamepads work in game and in menus.

## Project layout

| Folder | What's in it |
|---|---|
| `src/main.js` | Boot, renderer, main loop |
| `src/world/v2/` | The 1:1 San Francisco world: tile streaming, terrain, road graph and road meshes, Google 3D Tiles |
| `src/world/facade/` | Procedural buildings: footprints into lots, facades, bays, cornices, storefronts, night lighting |
| `src/world/landmarks/`, `src/world/interiors/` | Hand-built landmarks and walk-in interiors |
| `src/world/props/`, `src/world/grass/` | Trees, street furniture, parked cars, grass |
| `src/render/` | Sky and atmosphere, post-processing (reflections, AO, bloom), weather, lamp lighting, water |
| `src/vehicle/`, `src/player/` | Car physics and models, input, camera, the player on foot |
| `src/game/` | Game modes, races and events, police, traffic, pedestrians, economy, garage, tour |
| `src/audio/` | Engine sound, city ambience, music, Spotify radio |
| `src/ui/` | HUD, menus, minimap and big map |
| `public/assets/` | Baked map data, models, textures, lightmaps, audio |
| `tools/map/` | Python pipeline that bakes the map from OpenStreetMap and USGS data (see `tools/map/README.md`) |
| `tools/blender/` | Blender scripts that build and light-bake landmarks, interiors, cars, trees and building kits |
| `dev/` | Test and measurement harnesses: regression screenshots, flicker probe, perf drive, gameplay audit |

Developer notes: [QUALITY.md](QUALITY.md) (quality bar and rules), [NEXT_SESSION.md](NEXT_SESSION.md) (current status), [TESTING.md](TESTING.md), [CONVENTIONS.md](CONVENTIONS.md).

**Rebuilding the data (optional).** Everything needed to play is already in `public/assets/`.
- **Map bake:** Python 3 with numpy. Follow `tools/map/README.md`; it downloads the OpenStreetMap extract and elevation tiles itself.
- **Blender scripts:** need the `bpy` Python module (Blender 5.2) in a virtual environment at `tools/.venv-blender`.
- **Textures:** `tools/texpack.py` regenerates the compressed textures.

## History

- [CHANGELOG.md](CHANGELOG.md): every change with the files it touched, newest first.
- [FILES.md](FILES.md): every source file, what it does, and its full change history.

## How it was built

I designed and directed the project, working with AI coding agents. Every change was checked against reference screenshots, frame-time and GPU-memory budgets, and an automated playthrough of every event. Landmarks, interiors, cars and props are modelled and light-baked in Blender. The map is baked from open data by a custom pipeline.

**Stack:** three.js, WebGL 2, Vite, Blender (Cycles), Python, OpenStreetMap, USGS 3DEP, Web Audio.

## Credits and attribution

- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL). The baked map in `public/assets/map/` is derived from it and is under the same licence. Elevation: USGS 3DEP (public domain).
- Distant cityscape: Google Photorealistic 3D Tiles, © Google. Tiles are streamed live with your own key and are never stored or redistributed.
- Pedestrian characters: Microsoft Rocketbox Avatar Library (MIT). Animations: Quaternius (CC0).
- Materials, models and HDRIs: Poly Haven and ambientCG (CC0). Sounds: Freesound (CC0). Sign fonts: SIL Open Font License (rendered into textures only).
- Full per-asset list: [public/assets/ASSET_LICENSES.md](public/assets/ASSET_LICENSES.md).
- All store and business names in the game are fictional. Real landmarks appear as public places.
