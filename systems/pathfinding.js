const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * BFS from start to goal on a grid.
 * isWalkable(x, y) must return true for passable tiles.
 * Returns array of {x, y} steps (excluding start, including goal), or null if unreachable.
 * If start === goal, returns [].
 */
export function findPath(start, goal, isWalkable, gridW, gridH) {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!inBounds(goal.x, goal.y, gridW, gridH)) return null;
  if (!isWalkable(goal.x, goal.y)) return null;

  const visited = new Uint8Array(gridW * gridH);
  const parent = new Int32Array(gridW * gridH).fill(-1);
  const idx = (x, y) => y * gridW + x;

  const startIdx = idx(start.x, start.y);
  visited[startIdx] = 1;

  const queue = [startIdx];
  let head = 0;
  const goalIdx = idx(goal.x, goal.y);
  let found = false;

  while (head < queue.length) {
    const node = queue[head++];
    if (node === goalIdx) { found = true; break; }
    const nx = node % gridW;
    const ny = (node - nx) / gridW;
    for (const [dx, dy] of DIRS) {
      const ax = nx + dx;
      const ay = ny + dy;
      if (!inBounds(ax, ay, gridW, gridH)) continue;
      const ai = idx(ax, ay);
      if (visited[ai]) continue;
      if (!isWalkable(ax, ay)) continue;
      visited[ai] = 1;
      parent[ai] = node;
      queue.push(ai);
    }
  }

  if (!found) return null;

  const path = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    const x = cur % gridW;
    const y = (cur - x) / gridW;
    path.unshift({ x, y });
    cur = parent[cur];
  }
  return path;
}

/**
 * Find a walkable tile adjacent to `target`, closest (by BFS) to `start`.
 * Useful when the target itself is blocked (tree, building) but you want to stand next to it.
 */
export function findPathAdjacent(start, target, isWalkable, gridW, gridH) {
  return findPathAdjacentAny(start, [target], isWalkable, gridW, gridH);
}

/**
 * Find shortest path from start to any walkable tile adjacent to at least one
 * tile in `targets` (and not in `targets` itself). Useful for multi-tile buildings.
 */
export function findPathAdjacentAny(start, targets, isWalkable, gridW, gridH) {
  const targetKeys = new Set(targets.map(t => `${t.x},${t.y}`));
  const candidateKeys = new Set();
  for (const t of targets) {
    for (const [dx, dy] of DIRS) {
      const ax = t.x + dx;
      const ay = t.y + dy;
      const k = `${ax},${ay}`;
      if (targetKeys.has(k)) continue;
      if (!inBounds(ax, ay, gridW, gridH)) continue;
      if (!isWalkable(ax, ay) && !(start.x === ax && start.y === ay)) continue;
      candidateKeys.add(k);
    }
  }

  let best = null;
  let bestLen = Infinity;
  for (const key of candidateKeys) {
    const [x, y] = key.split(',').map(Number);
    if (start.x === x && start.y === y) return [];
    const p = findPath(start, { x, y }, isWalkable, gridW, gridH);
    if (p && p.length < bestLen) {
      best = p;
      bestLen = p.length;
    }
  }
  return best;
}

function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}
