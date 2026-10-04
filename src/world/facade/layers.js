// Surface-material layers of the facade texture arrays (albedo+roughness / normal+AO+mask), generated on the GPU by texgen.js.
// TILE = metres covered by one texture repeat (UVs are emitted pre-divided by it). METAL = metalness of the layer.
export const L = {
  BRICK: 0, BRICK_PAINT: 1, STUCCO: 2, SIDING: 3, SHINGLE: 4, STONE: 5, CONCRETE: 6, GRANITE: 7, GRAVEL: 8, TRIM: 9,
  CORRUGATED: 10, GARAGE: 11, DOOR: 12, CLAYTILE: 13, AWNING: 14, TILE: 15, WOOD: 16, ROOF_SHINGLE: 17, ROLLUP: 18,
  RUSTIC: 19, METAL: 20, MARBLE: 21, BRICK_DARK: 22, PAVING: 23,
};
export const LAYER_COUNT = 24;
export const TILE = [
  2.2, 2.2, 3.0, 2.4, 1.2, 3.2, 3.2, 2.0, 3.0, 1.0,
  2.0, 1.0, 1.0, 1.0, 1.0, 1.2, 2.0, 2.0, 2.0,
  2.4, 2.0, 2.0, 2.2, 2.4,
];
// layers replaced by the shared photo-scanned PBR maps (src/world/assets.js) once loaded; the procedural layer is the fallback.
// neutral: convert to grey with the photo's relative variation (for paint-tinted surfaces); mean: target linear grey.
export const PHOTO = [
  { layer: 0, key: 'brick_tan' },
  { layer: 1, key: 'brick_tan', neutral: true, mean: 0.62, contrast: 0.85 },
  { layer: 22, key: 'brick_tan', mul: [0.58, 0.45, 0.4] },
  { layer: 2, key: 'stucco', neutral: true, mean: 0.74, contrast: 1.0 },
  { layer: 3, key: 'siding', neutral: true, mean: 0.7, contrast: 0.55 },
  { layer: 6, key: 'concrete' },
  { layer: 8, key: 'gravel_roof' },
  { layer: 17, key: 'roof_tiles' },
  { layer: 20, key: 'metal' },
  { layer: 10, key: 'corrugated', neutral: true, mean: 0.6, contrast: 1.0 },
  { layer: 23, key: 'paving' },
  { layer: 21, key: 'marble' },
  { layer: 15, key: 'tiles' },
  { layer: 16, key: 'wood_floor' },
];
export const METAL = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0.55, 0.1, 0, 0, 0, 0, 0, 0, 0.5,
  0, 0.6, 0, 0, 0,
];
