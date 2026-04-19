/**
 * Building type catalog. Each entry has:
 *   id, label, icon, cost ({wood, food, gold}), footprint (tiles per side),
 *   buildTimeMs, hp, sprite (texture key), spriteScale, effects
 * Effects flag optional behaviours:
 *   villagerCapBonus: number
 *   gatherable: { type: 'food'|'wood'|..., yield, workMs } (infinite)
 *   trainable: boolean
 */

export const BUILDING_TYPES = {
  town_center: {
    id: 'town_center',
    label: 'Town Center',
    icon: '🏰',
    cost: null,
    footprint: 2,
    buildTimeMs: 0,
    hp: 400,
    sprite: 'camp_l1',
    spriteScale: 1,
    tier: 1,
    effects: { trains: 'villager', depot: true, villagerCapBonus: 0,
               upgradesTo: 'town_center_t2', upgradeCost: { wood: 80, food: 80 }, upgradeTimeMs: 10000 }
  },
  town_center_t2: {
    id: 'town_center_t2',
    label: 'Town Center (T2)',
    icon: '🏰',
    cost: null,
    footprint: 2,
    buildTimeMs: 0,
    hp: 600,
    sprite: 'house_l2',
    spriteScale: 1.5,
    tier: 2,
    effects: { trains: 'villager', depot: true, villagerCapBonus: 3, unlocksCastle: true }
  },
  house_t1: {
    id: 'house_t1',
    label: 'House',
    icon: '🏠',
    cost: { wood: 20 },
    footprint: 2,
    buildTimeMs: 3000,
    hp: 100,
    sprite: 'camp_l1',
    spriteScale: 0.8,
    tier: 1,
    effects: { villagerCapBonus: 4,
               upgradesTo: 'house_t2', upgradeCost: { wood: 40 }, upgradeTimeMs: 5000 }
  },
  house_t2: {
    id: 'house_t2',
    label: 'House (T2)',
    icon: '🏠',
    cost: null,
    footprint: 2,
    buildTimeMs: 0,
    hp: 150,
    sprite: 'house_l2',
    spriteScale: 1,
    tier: 2,
    effects: { villagerCapBonus: 6 }
  },
  farm: {
    id: 'farm',
    label: 'Farm',
    icon: '🌾',
    cost: { wood: 30 },
    footprint: 2,
    buildTimeMs: 3000,
    hp: 75,
    sprite: 'farm',
    spriteScale: 1,
    tier: 1,
    effects: { gatherable: { type: 'food', yield: 4, workMs: 2000 } }
  },
  barracks_t1: {
    id: 'barracks_t1',
    label: 'Barracks',
    icon: '⚔️',
    cost: { wood: 50 },
    footprint: 3,
    buildTimeMs: 4000,
    hp: 200,
    sprite: 'barracks',
    spriteScale: 1,
    tier: 1,
    effects: { trains: 'guard',
               upgradesTo: 'barracks_t2', upgradeCost: { wood: 60 }, upgradeTimeMs: 6000 }
  },
  barracks_t2: {
    id: 'barracks_t2',
    label: 'Barracks (T2)',
    icon: '⚔️',
    cost: null,
    footprint: 3,
    buildTimeMs: 0,
    hp: 300,
    sprite: 'barracks',
    spriteScale: 1,
    tier: 2,
    hasGlow: true,
    trainSpeedMult: 1.25,
    effects: { trains: 'guard',
               research: { id: 'knight', cost: { wood: 60, food: 60 }, timeMs: 15000 } }
  },
  castle: {
    id: 'castle',
    label: 'Big Castle',
    icon: '🏰',
    cost: { wood: 100, food: 100 },
    footprint: 3,
    buildTimeMs: 6000,
    hp: 500,
    sprite: 'castle',
    spriteScale: 1,
    tier: 2,
    effects: { countdownToWin: 60 }
  }
};

export const UNIT_DEFS = {
  villager: {
    id: 'villager',
    label: 'Villager',
    icon: '👶',
    cost: { food: 25 },
    trainMs: 5000,
    affectsCap: true
  },
  guard: {
    id: 'guard',
    label: 'Guard',
    icon: '⚔️',
    cost: { food: 40, wood: 20 },
    trainMs: 8000,
    affectsCap: false,
    hp: 60,
    attack: 10,
    stepMs: 400  // 2.5 tiles/sec
  },
  knight: {
    id: 'knight',
    label: 'Knight',
    icon: '🛡️',
    cost: { food: 40, wood: 20 },
    trainMs: 8000,
    affectsCap: false,
    hp: 80,
    attack: 18,
    stepMs: 333  // 3.0 tiles/sec
  }
};

export const BUILDABLE_IDS = ['house_t1', 'farm', 'barracks_t1', 'castle'];

export function canAfford(cost) {
  if (!cost) return true;
  // Caller must pass gameState; to avoid circular dep, we take cost + resources object.
  throw new Error('Use canAffordWith(cost, state) instead');
}

export function canAffordWith(cost, state) {
  if (!cost) return true;
  if ((cost.wood  || 0) > state.wood)  return false;
  if ((cost.food  || 0) > state.food)  return false;
  if ((cost.gold  || 0) > state.gold)  return false;
  return true;
}

export function spend(cost, state) {
  if (!cost) return;
  state.wood -= cost.wood || 0;
  state.food -= cost.food || 0;
  state.gold -= cost.gold || 0;
}

export function formatCost(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.wood) parts.push(`🪵${cost.wood}`);
  if (cost.food) parts.push(`🍎${cost.food}`);
  if (cost.gold) parts.push(`🪙${cost.gold}`);
  return parts.join(' ');
}
