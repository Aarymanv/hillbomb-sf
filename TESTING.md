# Testing and capturing HILLBOMB in the real game

The browser pane is often hidden. When it is, requestAnimationFrame does not fire and `computer screenshot` fails.
Do not depend on either. Drive frames manually and capture the WebGL canvas through the capture endpoint instead.

## Servers
* **http://127.0.0.1:5190/** is the Vite dev server. Pages do NOT auto-reload on file changes, so reload them yourself after edits.
* **http://127.0.0.1:5191/** is the orchestrator's watch-build (`dist-dev/`, rebuilt a few seconds after any `src/` change). It also accepts
  `POST http://127.0.0.1:5191/__shot?name=NAME` with a JPEG data-URL body and writes `shots/NAME.jpg`.
  CORS is open, so any page (5190 or 5191) can post. Then view the image with your file Read tool.

## In-game dev hooks (main game, `/?play`)
URL params: `?play` (skip title), `&spawn=x,z,yaw` (start position), `&foot` (start on foot), `&time=13.5` (hour of day), `&car=muscle`, `&q=low|medium|high`.
Once `window.__shot` exists the game is ready. Wait for it with a short poll, keeping each tool call under ~40 s.
```js
window.__manual = true;                 // stop the rAF loop; you step frames yourself
__frames(60);                           // run 60 frames of 1/60 s (game logic + render)
__look(x, y, z, tx, ty, tz);            // free camera at (x,y,z) looking at (tx,ty,tz); __look(null) returns control to the game camera
__teleport(x, z, { foot: true });       // move the player (or their car)
__street(x, z, { h: 1.7, flip: false, side: 0 }); // free camera ON the nearest street at eye height, looking along it (reliable street-level shots)
await __shot('myname');                 // renders one frame at 1280x720 and saves shots/myname.jpg
__env.state.hours = 21; __env.state.paused = true;   // time of day (night ~ 20.5-5.5)
```
Globals: `__G` (game), `__world` (terrain, graph, blocks, colliders, heightAt, groundAt), `__scene`, `__camera`, `__renderer`, `__env`, `__player`.

## Useful world spots (x, z)
* Russian Hill, Hyde St crest looking north to the bay: (1053, -880)
* Painted Ladies / Alamo Square: (100, 380)
* Downtown / Financial District: (1700, -350); Market St: (1500, -25)
* Chinatown: (1500, -420); North Beach: (1420, -820); Mission: (650, 1500)
* Sunset avenues: (-2000, 1500); Richmond: (-1500, 200)
* Embarcadero / Ferry Building: (2000, -560); Golden Gate toll plaza: (-1560, -1150)

A world build takes ~10-15 s after page load.
