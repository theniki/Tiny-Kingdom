import { CELL_TYPES, FEATURES, GRID_W, GRID_H } from './constants.js';

const STONE_VARIANTS = ['grey_rocks', 'purple_rocks', 'minerals'];
const DECORATION_FRAME_COUNT = 9;

// Counts scaled for 60×60 (Prompt 10 bigger map).
const DEFAULT_COUNTS = {
  trees: 120,
  apples: 40,
  gold: 20,
  stone: 20,
  rare: 8,
  decorations: 160
};

// Where the two bases spawn (top-left for blue, bottom-right for red).
const PLAYER_CORNER = { cx: 10, cy: 10 };
const RED_CORNER    = { cx: GRID_W - 10, cy: GRID_H - 10 };
const BASE_RESERVE_RADIUS = 3; // 7×7 cleared around each base

const POND_MIN = 3, POND_MAX = 5;
const MOUNT_MIN = 2, MOUNT_MAX = 4;

export function generateMap(width = GRID_W, height = GRID_H, counts = DEFAULT_COUNTS) {
  const map = [];
  for (let y = 0; y < height; y++) {
    map[y] = [];
    for (let x = 0; x < width; x++) {
      map[y][x] = {
        type: CELL_TYPES.GRASS,
        feature: null,
        variant: null,
        decoFrame: 0
      };
    }
  }

  const reserved = new Set();
  const reserve = (cx, cy, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        reserved.add(`${cx + dx},${cy + dy}`);
      }
    }
  };
  reserve(PLAYER_CORNER.cx, PLAYER_CORNER.cy, BASE_RESERVE_RADIUS);
  reserve(RED_CORNER.cx,    RED_CORNER.cy,    BASE_RESERVE_RADIUS);

  // 2–3 water ponds scattered outside the base reserves
  const pondCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pondCount; i++) {
    const pw = POND_MIN + Math.floor(Math.random() * (POND_MAX - POND_MIN + 1));
    const ph = POND_MIN + Math.floor(Math.random() * (POND_MAX - POND_MIN + 1));
    const pos = _pickCluster(width, height, pw, ph, reserved);
    if (!pos) continue;
    stamp(map, width, height, pos.x, pos.y, pw, ph, (c) => { c.type = CELL_TYPES.WATER; });
  }

  // 3–4 mountain clusters
  const mountCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < mountCount; i++) {
    const mw = MOUNT_MIN + Math.floor(Math.random() * (MOUNT_MAX - MOUNT_MIN + 1));
    const mh = MOUNT_MIN + Math.floor(Math.random() * (MOUNT_MAX - MOUNT_MIN + 1));
    const pos = _pickCluster(width, height, mw, mh, reserved);
    if (!pos) continue;
    stamp(map, width, height, pos.x, pos.y, mw, mh, (c) => { c.type = CELL_TYPES.MOUNTAIN; });
  }

  const isCandidate = (x, y) => {
    if (reserved.has(`${x},${y}`)) return false;
    const c = map[y][x];
    return c.type === CELL_TYPES.GRASS && c.feature === null;
  };

  const place = (n, setter) => {
    for (let i = 0; i < n; i++) {
      const p = pickRandom(width, height, isCandidate);
      if (p) setter(map[p.y][p.x]);
    }
  };

  place(counts.trees,  (c) => { c.feature = FEATURES.TREE;   c.resourceAmount = 50; });
  place(counts.apples, (c) => { c.feature = FEATURES.APPLE;  c.resourceAmount = 30; });
  place(counts.gold,   (c) => { c.feature = FEATURES.GOLD;   c.resourceAmount = 50; });
  place(counts.stone,  (c) => {
    c.feature = FEATURES.STONE_DECO;
    c.variant = STONE_VARIANTS[Math.floor(Math.random() * STONE_VARIANTS.length)];
  });
  place(counts.rare,   (c) => { c.feature = FEATURES.RARE_MINERAL_DECO; });
  place(counts.decorations, (c) => {
    c.feature = FEATURES.DECORATION;
    c.decoFrame = Math.floor(Math.random() * DECORATION_FRAME_COUNT);
  });

  return {
    map,
    width,
    height,
    playerCorner: { ...PLAYER_CORNER },
    redCorner:    { ...RED_CORNER },
    reservedCenter: { cx: PLAYER_CORNER.cx, cy: PLAYER_CORNER.cy, size: BASE_RESERVE_RADIUS * 2 }
  };
}

function stamp(map, w, h, x0, y0, sw, sh, setter) {
  for (let dy = 0; dy < sh; dy++) {
    for (let dx = 0; dx < sw; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) setter(map[y][x]);
    }
  }
}

function pickRandom(w, h, predicate, maxTries = 1500) {
  for (let i = 0; i < maxTries; i++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    if (predicate(x, y)) return { x, y };
  }
  return null;
}

function _pickCluster(w, h, sw, sh, reserved, maxTries = 200) {
  for (let i = 0; i < maxTries; i++) {
    const x = 1 + Math.floor(Math.random() * (w - sw - 2));
    const y = 1 + Math.floor(Math.random() * (h - sh - 2));
    let overlaps = false;
    outer:
    for (let dy = 0; dy < sh; dy++) {
      for (let dx = 0; dx < sw; dx++) {
        if (reserved.has(`${x + dx},${y + dy}`)) { overlaps = true; break outer; }
      }
    }
    if (!overlaps) return { x, y };
  }
  return null;
}
