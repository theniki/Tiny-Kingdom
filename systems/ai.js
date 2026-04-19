import { GRID_W, GRID_H, TILE_SIZE, CELL_TYPES, FEATURES, BLOCKING_FEATURES } from '../data/constants.js';
import { gameState, econFor } from '../data/gameState.js';
import { BUILDING_TYPES, canAffordWith, spend } from '../data/buildings.js';
import { Villager } from '../data/Villager.js';
import { Soldier } from '../data/Soldier.js';
import { Building } from '../data/Building.js';

/**
 * Runs the red rival economy tick. Called every 10s from GameScene.
 * Mirrors player economy loop but at 80% effective gather rate (villager
 * Villager class already reads team and picks reduced gather amount).
 */
export function redAiTick(scene) {
  if (gameState.defeated) return;
  const red = gameState.red;
  const redTC = gameState.buildings.find(b =>
    !b.destroyed && b.team === 'red' && (b.type === 'town_center' || b.type === 'town_center_t2')
  );
  if (!redTC) return;

  const redVillagers = gameState.villagers.filter(v => v.team === 'red' && !v.destroyed);
  const redBuildings = gameState.buildings.filter(b => b.team === 'red' && !b.destroyed);
  const hasHouse = redBuildings.some(b => b.type === 'house_t1' || b.type === 'house_t2');
  const hasBarracks = redBuildings.some(b => b.type === 'barracks_t1' || b.type === 'barracks_t2');
  const idleVillagers = redVillagers.filter(v => !v.job && v.state !== 'dying');

  // Always queue a red villager if below cap and TC idle
  const villagerCount = redVillagers.length + (redTC.trainingQueue?.length || 0);
  if (villagerCount < red.villagerCap && redTC.canQueueUnit()) {
    redTC.queueUnit();
  }

  // Priority 1: low wood → chop
  if (red.wood < 100 && idleVillagers.length > 0) {
    const v = idleVillagers.shift();
    const tree = _findNearestFeature(v, FEATURES.TREE);
    if (tree) v.assignJob({ type: 'gather', resourceType: 'wood', target: tree });
  }

  // Priority 2: low food → apples or farm
  if (red.food < 100 && idleVillagers.length > 0) {
    const v = idleVillagers.shift();
    const farm = redBuildings.find(b => b.type === 'farm' && !b.underConstruction);
    if (farm) v.assignJob({ type: 'gather_building', resourceType: 'food', building: farm });
    else {
      const apple = _findNearestFeature(v, FEATURES.APPLE);
      if (apple) v.assignJob({ type: 'gather', resourceType: 'food', target: apple });
    }
  }

  // Priority 3: build House
  if (red.wood >= 80 && !hasHouse && idleVillagers.length > 0) {
    const spot = _findBuildSpot(redTC, 2);
    if (spot && canAffordWith(BUILDING_TYPES.house_t1.cost, red)) {
      _placeBuilding(scene, 'house_t1', spot, idleVillagers.shift(), 'red');
    }
  }

  // Priority 4: build Barracks
  if (red.wood >= 80 && hasHouse && !hasBarracks && idleVillagers.length > 0) {
    const spot = _findBuildSpot(redTC, 3);
    if (spot && canAffordWith(BUILDING_TYPES.barracks_t1.cost, red)) {
      _placeBuilding(scene, 'barracks_t1', spot, idleVillagers.shift(), 'red');
    }
  }
}

/**
 * Spawn a wave of red guards. Called by the wave scheduler.
 * Wave size: min(N, 4). Units spawn at red Barracks (or TC), target player TC.
 */
export function spawnRedWave(scene, waveNumber) {
  const redBarracks = gameState.buildings.find(b =>
    !b.destroyed && b.team === 'red' && (b.type === 'barracks_t1' || b.type === 'barracks_t2')
  );
  const redTC = gameState.buildings.find(b =>
    !b.destroyed && b.team === 'red' && (b.type === 'town_center' || b.type === 'town_center_t2')
  );
  const spawnFrom = redBarracks || redTC;
  if (!spawnFrom) return;

  const playerTC = gameState.buildings.find(b =>
    !b.destroyed && b.team === 'blue' && (b.type === 'town_center' || b.type === 'town_center_t2')
  );
  if (!playerTC) return;

  const count = Math.min(waveNumber, 4);
  for (let i = 0; i < count; i++) {
    const spot = _findSpawnSpot(spawnFrom);
    if (!spot) break;
    const s = new Soldier(scene, spot.x, spot.y, { team: 'red', hp: 50 });
    s.marchTarget = playerTC;
    s.attackTarget = playerTC;
    gameState.soldiers.push(s);
  }
}

/* ---------------- internal helpers ---------------- */

function _findNearestFeature(unit, featureType) {
  let best = null, bestD = Infinity;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = gameState.__sceneRef ? null : null; // placeholder; real lookup below
    }
  }
  // Iterate scene.world.map via unit.scene
  const map = unit.scene.world.map;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cell = map[y][x];
      if (cell.feature !== featureType) continue;
      if (!cell.resourceAmount || cell.resourceAmount <= 0) continue;
      const dx = x - unit.gridX, dy = y - unit.gridY;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

function _findBuildSpot(nearBuilding, footprint) {
  const scene = nearBuilding.scene;
  for (let r = 2; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const gx = nearBuilding.gridX + dx;
        const gy = nearBuilding.gridY + dy;
        if (_canPlaceAt(scene, gx, gy, footprint)) return { x: gx, y: gy };
      }
    }
  }
  return null;
}

function _canPlaceAt(scene, gridX, gridY, footprint) {
  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      const x = gridX + dx, y = gridY + dy;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
      const cell = scene.world.map[y][x];
      if (cell.type !== CELL_TYPES.GRASS) return false;
      if (cell.feature && BLOCKING_FEATURES.has(cell.feature)) return false;
      if (cell.occupant) return false;
    }
  }
  return true;
}

function _placeBuilding(scene, typeId, gridXY, builder, team) {
  const def = BUILDING_TYPES[typeId];
  if (!canAffordWith(def.cost, econFor(team))) return null;
  spend(def.cost, econFor(team));
  const b = new Building(scene, def, gridXY.x, gridXY.y, { team });
  gameState.buildings.push(b);
  if (builder) builder.assignJob({ type: 'build', building: b });
  return b;
}

function _findSpawnSpot(building) {
  const F = building.footprint;
  const scene = building.scene;
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= F - 1 + r; dy++) {
      for (let dx = -r; dx <= F - 1 + r; dx++) {
        const onBoundary = (dx === -r || dx === F - 1 + r || dy === -r || dy === F - 1 + r);
        if (!onBoundary) continue;
        const x = building.gridX + dx, y = building.gridY + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        if (!scene.isWalkable(x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}
