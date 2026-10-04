// HILLBOMB Festival San Francisco (auto-installed system). Everything lives in ./festival/; G.festival is the API.
import { createFestival } from './festival/festival.js';

export function install(G) {
  createFestival(G);
}
