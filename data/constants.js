// Viewport (what's visible on screen at any moment).
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 832;

// Tile size. All sprites render at integer multiples of this.
export const TILE_SIZE = 64;

// Map grid (world size). Prompt 10 expanded to 60×60.
export const GRID_W = 60;
export const GRID_H = 60;

// World in pixels.
export const WORLD_W = GRID_W * TILE_SIZE;   // 3840
export const WORLD_H = GRID_H * TILE_SIZE;   // 3840

// Viewport span in tiles — how many tiles fit on screen at once.
export const VIEW_TILES_W = GAME_WIDTH  / TILE_SIZE; // 20
export const VIEW_TILES_H = GAME_HEIGHT / TILE_SIZE; // 13

export const CELL_TYPES = {
  GRASS: 'grass',
  WATER: 'water',
  MOUNTAIN: 'mountain'
};

export const FEATURES = {
  TREE: 'tree',
  APPLE: 'apple',
  GOLD: 'gold',
  STONE_DECO: 'stone_deco',
  RARE_MINERAL_DECO: 'rare_mineral_deco',
  DECORATION: 'decoration'
};

export const BLOCKING_FEATURES = new Set([
  FEATURES.TREE,
  FEATURES.APPLE,
  FEATURES.GOLD,
  FEATURES.STONE_DECO,
  FEATURES.RARE_MINERAL_DECO
]);

// ─────────────────────────────────────────────────────────────
// Debug flags — must be OFF in multiplayer (Prompt 11+).
// In single-player these enable dev-only shortcuts.
// ─────────────────────────────────────────────────────────────
export const DEBUG_ENEMY_SPAWN = true; // TODO(Prompt 11): set false for multiplayer.
