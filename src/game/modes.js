// Game modes. Every system reads G.flags (or G.mode). Keys stay 'forza' | 'gta' | 'explore' (URL ?mode=, saves);
// the player-facing labels are original: Festival / Outlaw / Free Roam.
//   forza   : Forza Horizon feel. No police, no crime, no carjacking; pedestrians always dodge; cosmetic damage only;
//             races, speed traps, danger signs, drift zones and skill chains on.
//   gta     : open-world crime. Wanted stars, pursuits, carjacking, pedestrians can be knocked down, real damage,
//             busted / wasted. Events still available.
//   explore : peaceful sightseeing. No events or skill popups, no police, no damage, lighter traffic; walk into
//             buildings; time of day and weather are yours to set.
export const MODES = {
  forza:   { label: 'Festival', blurb: 'Festival driving: races, jumps, drift zones. No cops, no crime.', police: false, carjack: false, pedHits: false, damage: 0.25, events: true, skills: true, traffic: 1 },
  gta:     { label: 'Outlaw', blurb: 'Crime and consequences: cops, wanted stars, carjacking, real damage.', police: true, carjack: true, pedHits: true, damage: 1, events: true, skills: true, traffic: 1 },
  explore: { label: 'Free Roam', blurb: 'Creative mode: unlimited money, every car, fast travel anywhere on the map, [ and ] change the time, ; changes the weather. No cops, no damage.', police: false, carjack: false, pedHits: false, damage: 0, events: false, skills: false, traffic: 0.6, creative: true },
};
export function setMode(G, mode) {
  if (!MODES[mode]) mode = 'forza';
  const prev = G.mode;
  G.mode = mode;
  G.flags = MODES[mode];
  if (G.economy) { G.economy.settings.mode = mode; G.economy.save(); }
  if (G.traffic) G.traffic.density = G.flags.traffic;
  if (!G.flags.police) G.police?.clear?.();
  if (!G.flags.events && G.events?.active) G.events.endRace('quit');
  if (prev && prev !== mode) { G.hud?.toast(`${MODES[mode].label} mode`, MODES[mode].blurb, '', 3200); G.emit?.('mode', mode); }
}
