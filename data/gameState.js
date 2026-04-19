export const gameState = {
  // Blue (player) economy — top-level for UI compatibility
  wood: 50,
  food: 50,
  gold: 0,
  villagerCap: 5,

  // Red (AI) economy
  red: {
    wood: 50,
    food: 50,
    gold: 0,
    villagerCap: 5
  },

  // Research flags
  research: {
    knight: false
  },

  // Speed-boost end times (in elapsedTime seconds). Active while > elapsedTime.
  speedBoost: {
    blue: 0,
    red: 0
  },

  // End-of-game stats
  stats: {
    villagersTrained: 0,
    enemiesDefeated: 0,
    chestsOpened: 0
  },

  elapsedTime: 0,
  villagers: [],
  buildings: [],
  soldiers: [],
  chests: [],

  selected: null,

  defeated: null,   // 'blue' | 'red' | null
  winner: null,     // 'blue' | 'red' | null

  // First-time UI hint tracking
  uiHintsSeen: {
    villagerFirstSelect: false,
    guardFirstSelect: false
  },

  paused: false
};

export function econFor(team) {
  return team === 'red' ? gameState.red : gameState;
}

export function isSpeedBoosted(team) {
  return (gameState.speedBoost[team] || 0) > gameState.elapsedTime;
}

export function resetGameState() {
  gameState.wood = 50;
  gameState.food = 50;
  gameState.gold = 0;
  gameState.villagerCap = 5;
  gameState.red.wood = 50;
  gameState.red.food = 50;
  gameState.red.gold = 0;
  gameState.red.villagerCap = 5;
  gameState.research.knight = false;
  gameState.speedBoost.blue = 0;
  gameState.speedBoost.red = 0;
  gameState.stats.villagersTrained = 0;
  gameState.stats.enemiesDefeated = 0;
  gameState.stats.chestsOpened = 0;
  gameState.elapsedTime = 0;
  gameState.villagers.length = 0;
  gameState.buildings.length = 0;
  gameState.soldiers.length = 0;
  gameState.chests.length = 0;
  gameState.selected = null;
  gameState.defeated = null;
  gameState.winner = null;
  gameState.uiHintsSeen.villagerFirstSelect = false;
  gameState.uiHintsSeen.guardFirstSelect = false;
  gameState.paused = false;
}

if (typeof window !== 'undefined') {
  window.gameState = gameState;
}
