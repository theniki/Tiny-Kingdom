import { GRID_W, GRID_H } from '../data/constants.js';
import { gameState } from '../data/gameState.js';

export const FOW_UNSEEN   = 0;
export const FOW_EXPLORED = 1;
export const FOW_VISIBLE  = 2;

const VISION = {
  villager: 5,
  soldier:  6,
  town_center:    8,
  town_center_t2: 8,
  house_t1:       3,
  house_t2:       3,
  farm:           3,
  barracks_t1:    5,
  barracks_t2:    5,
  castle:        10
};

const INITIAL_TC_REVEAL = 10;

export function initFogOfWar() {
  gameState.fogOfWar = {
    blue: _newGrid(FOW_UNSEEN),
    red:  _newGrid(FOW_UNSEEN)
  };
  gameState.fogDisabled = false;
}

export function seedStartingReveal(team, cx, cy, radius = INITIAL_TC_REVEAL) {
  const fog = gameState.fogOfWar[team];
  if (!fog) return;
  _mark(fog, cx, cy, radius, FOW_EXPLORED); // will flip to VISIBLE on next tick for TC's own radius
}

export function computeFog(team = 'blue') {
  if (gameState.fogDisabled) return;
  const fog = gameState.fogOfWar?.[team];
  if (!fog) return;

  // Downgrade VISIBLE → EXPLORED
  for (let y = 0; y < GRID_H; y++) {
    const row = fog[y];
    for (let x = 0; x < GRID_W; x++) {
      if (row[x] === FOW_VISIBLE) row[x] = FOW_EXPLORED;
    }
  }

  // Mark VISIBLE from every own unit + building
  for (const v of gameState.villagers) {
    if (v.destroyed || v.team !== team) continue;
    _mark(fog, v.gridX, v.gridY, VISION.villager, FOW_VISIBLE);
  }
  for (const s of gameState.soldiers) {
    if (s.destroyed || s.team !== team) continue;
    _mark(fog, s.gridX, s.gridY, VISION.soldier, FOW_VISIBLE);
  }
  for (const b of gameState.buildings) {
    if (b.destroyed || b.team !== team) continue;
    const r = VISION[b.type] ?? 3;
    // Radiate from every tile of the footprint
    for (const t of b.tiles) _mark(fog, t.x, t.y, r, FOW_VISIBLE);
  }
}

export function getFogState(team, x, y) {
  if (gameState.fogDisabled) return FOW_VISIBLE;
  const fog = gameState.fogOfWar?.[team];
  if (!fog) return FOW_VISIBLE;
  const row = fog[y];
  if (!row) return FOW_UNSEEN;
  return row[x] ?? FOW_UNSEEN;
}

export function revealAll(team = 'blue') {
  const fog = gameState.fogOfWar?.[team];
  if (!fog) return;
  for (let y = 0; y < GRID_H; y++) {
    const row = fog[y];
    for (let x = 0; x < GRID_W; x++) row[x] = FOW_VISIBLE;
  }
}

export function toggleDebugFog() {
  gameState.fogDisabled = !gameState.fogDisabled;
}

export function isFogDisabled() {
  return !!gameState.fogDisabled;
}

/* ---------------- internal ---------------- */

function _newGrid(fill) {
  const grid = new Array(GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    grid[y] = new Uint8Array(GRID_W).fill(fill);
  }
  return grid;
}

function _mark(fog, cx, cy, radius, state) {
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(GRID_W - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(GRID_H - 1, cy + radius);
  for (let y = minY; y <= maxY; y++) {
    const row = fog[y];
    for (let x = minX; x <= maxX; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > radius) continue;
      // Never downgrade: only raise state.
      if (row[x] < state) row[x] = state;
    }
  }
}
