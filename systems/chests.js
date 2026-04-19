import { GRID_W, GRID_H, CELL_TYPES, BLOCKING_FEATURES } from '../data/constants.js';
import { gameState } from '../data/gameState.js';

const FIRST_CHEST_AT_SEC = 80;
const MIN_GAP_SEC = 90;
const MAX_GAP_SEC = 150;
const MAX_ACTIVE = 3;

// findables frame indices for reward icons (5×4 grid)
const ICON_WOOD     = 2;   // log
const ICON_FOOD     = 16;  // red apple
const ICON_VILLAGER = 0;   // blue gem (placeholder — represents "people")
const ICON_BOOST    = 15;  // wand
const ICON_GUARD    = 8;   // red dagger

export function rollChestReward() {
  const r = Math.random();
  if (r < 0.30) return { type: 'wood',    amount: 50, icon: ICON_WOOD,     label: '+50 Wood' };
  if (r < 0.60) return { type: 'food',    amount: 50, icon: ICON_FOOD,     label: '+50 Food' };
  if (r < 0.80) return { type: 'villager',              icon: ICON_VILLAGER, label: 'Free Villager!' };
  if (r < 0.95) return { type: 'speed',   durationSec: 20, icon: ICON_BOOST, label: 'Gather Speed +50% for 20s' };
  return { type: 'guard',                              icon: ICON_GUARD,    label: 'Free Guard!' };
}

export function findChestSpawnTile(scene) {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    const cell = scene.world.map[y][x];
    if (cell.type !== CELL_TYPES.GRASS) continue;
    if (cell.feature && BLOCKING_FEATURES.has(cell.feature)) continue;
    if (cell.occupant) continue;
    // Don't stack chests
    if (gameState.chests.some(c => !c.collected && c.gridX === x && c.gridY === y)) continue;
    return { x, y };
  }
  return null;
}

export function nextChestSpawnTime(currentTime) {
  const gap = MIN_GAP_SEC + Math.random() * (MAX_GAP_SEC - MIN_GAP_SEC);
  return currentTime + gap;
}

export { FIRST_CHEST_AT_SEC, MAX_ACTIVE };
