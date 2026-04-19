import {
  GRID_W, GRID_H, TILE_SIZE,
  CELL_TYPES, FEATURES
} from '../data/constants.js';
import { gameState } from '../data/gameState.js';

const HINT_DELAY_MS = 250;
const FADE_IN_MS = 150;
const FADE_OUT_MS = 100;

/**
 * Hover-hint manager. Detects what's under the cursor, decides the
 * action a double-click would perform given the current selection,
 * and renders (1) a yellow action-preview outline immediately, then
 * (2) a small tooltip after 250ms of steady hover.
 *
 * Public API:
 *   update(pointer)   — call from pointermove
 *   hide()            — call from pointerup/pointerout/selection-change
 *   identifyTarget(x, y) — exposed for GameScene's double-click resolver
 *   targetKey(target) — stable key for DoubleClickDetector
 */
export class HintManager {
  constructor(scene) {
    this.scene = scene;
    this._hoverKey = null;
    this._hoverTimer = null;
    this._hint = null;
    this._preview = null;
  }

  update(pointer) {
    const target = this.identifyTarget(pointer.worldX, pointer.worldY);
    const action = this._computeAction(target);
    const key = action ? this.targetKey(target) : null;

    if (key === this._hoverKey) {
      if (this._hint) this._positionHint(pointer);
      return;
    }

    this._clearHint();
    this._clearPreview();
    this._hoverKey = key;

    if (!action) return;

    this._drawPreview(target);

    this._hoverTimer = this.scene.time.delayedCall(HINT_DELAY_MS, () => {
      this._hoverTimer = null;
      this._showHint(action.label, pointer);
    });
  }

  hide() {
    this._clearHint();
    this._clearPreview();
    this._hoverKey = null;
  }

  identifyTarget(wx, wy) {
    // Helper: hidden by fog-of-war = untargetable
    const visibleUnit = (u) => u.container && u.container.visible;
    const visibleBuilding = (b) => b.sprite && b.sprite.visible;

    // Enemy unit first (soldier, then villager) — skip if hidden by fog
    const sEnemy = gameState.soldiers.find(u => !u.destroyed && u.team !== 'blue' && visibleUnit(u) && u.hitTest(wx, wy));
    if (sEnemy) return { kind: 'enemy_unit', ref: sEnemy };
    const vEnemy = gameState.villagers.find(u => !u.destroyed && u.team !== 'blue' && visibleUnit(u) && u.hitTest(wx, wy));
    if (vEnemy) return { kind: 'enemy_unit', ref: vEnemy };

    // Friendly unit
    const sOwn = gameState.soldiers.find(u => !u.destroyed && u.team === 'blue' && u.hitTest(wx, wy));
    if (sOwn) return { kind: 'friendly_unit', ref: sOwn };
    const vOwn = gameState.villagers.find(u => !u.destroyed && u.team === 'blue' && u.hitTest(wx, wy));
    if (vOwn) return { kind: 'friendly_unit', ref: vOwn };

    // Building (any team) — hide enemy buildings that haven't been explored
    for (const b of gameState.buildings) {
      if (b.destroyed) continue;
      if (!b.hitTest(wx, wy)) continue;
      if (b.team !== 'blue' && !visibleBuilding(b)) continue;
      if (b.team !== 'blue') return { kind: 'enemy_building', ref: b };
      if (b.type === 'farm' && !b.underConstruction) return { kind: 'farm', ref: b };
      return { kind: 'friendly_building', ref: b };
    }

    // Tile
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return null;
    const cell = this.scene.world.map[ty][tx];
    if (cell.type === CELL_TYPES.WATER || cell.type === CELL_TYPES.MOUNTAIN) {
      return { kind: 'blocked_tile', x: tx, y: ty };
    }
    if (cell.feature === FEATURES.TREE && cell.resourceAmount > 0) return { kind: 'resource_tree', x: tx, y: ty };
    if (cell.feature === FEATURES.APPLE && cell.resourceAmount > 0) return { kind: 'resource_apple', x: tx, y: ty };
    if (cell.feature === FEATURES.GOLD && cell.resourceAmount > 0) return { kind: 'resource_gold', x: tx, y: ty };
    if (this.scene.isWalkable(tx, ty)) return { kind: 'walkable_tile', x: tx, y: ty };
    return { kind: 'blocked_tile', x: tx, y: ty };
  }

  targetKey(target) {
    if (!target) return null;
    if (target.kind === 'enemy_unit' || target.kind === 'friendly_unit') return `unit:${target.ref.id}`;
    if (target.kind === 'enemy_building' || target.kind === 'friendly_building' || target.kind === 'farm') {
      return `bld:${target.ref.gridX},${target.ref.gridY}`;
    }
    return `tile:${target.x},${target.y}`;
  }

  _computeAction(target) {
    if (!target) return null;
    const selected = this.scene.selectedUnits || [];
    if (selected.length === 0) return null;

    const hasVillagers = selected.some(u => u.kind === 'villager' && u.team === 'blue');
    const hasGuards    = selected.some(u => u.kind === 'soldier'  && u.team === 'blue');
    const mixedNote    = (hasVillagers && hasGuards) ? ' (guards will follow)' : '';
    const villagerNote = (hasVillagers && hasGuards) ? ' (villagers follow)' : '';

    switch (target.kind) {
      case 'enemy_unit':
      case 'enemy_building':
        if (hasGuards) return { label: `Double-click to attack ⚔️${villagerNote}` };
        return null;
      case 'resource_tree':
        if (hasVillagers) return { label: `Double-click to chop 🪵${mixedNote}` };
        return null;
      case 'resource_apple':
        if (hasVillagers) return { label: `Double-click to gather 🍎${mixedNote}` };
        return null;
      case 'resource_gold':
        if (hasVillagers) return { label: `Double-click to mine 🪙${mixedNote}` };
        return null;
      case 'farm':
        if (hasVillagers) return { label: `Double-click to work 🍎${mixedNote}` };
        return { label: 'Double-click to move here' };
      case 'friendly_building':
        return { label: 'Double-click to move here' };
      case 'walkable_tile':
        return { label: 'Double-click to move' };
      case 'friendly_unit':
      case 'blocked_tile':
      default:
        return null;
    }
  }

  /* ---------------- preview outline ---------------- */

  _drawPreview(target) {
    const g = this.scene.add.graphics().setDepth(950);
    g.lineStyle(2, 0xffe066, 0.6);

    if (target.kind === 'enemy_unit' || target.kind === 'friendly_unit') {
      g.strokeCircle(target.ref.pixelX, target.ref.pixelY + 4, 28);
    } else if (target.kind === 'enemy_building' || target.kind === 'friendly_building' || target.kind === 'farm') {
      const w = target.ref.footprint * TILE_SIZE;
      g.strokeRect(target.ref.centerX - w / 2, target.ref.centerY - w / 2, w, w);
    } else {
      const px = target.x * TILE_SIZE;
      const py = target.y * TILE_SIZE;
      g.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
    this._preview = g;
  }

  _clearPreview() {
    if (this._preview) { this._preview.destroy(); this._preview = null; }
  }

  /* ---------------- tooltip ---------------- */

  _showHint(text, pointer) {
    const container = this.scene.add.container(0, 0).setDepth(3500);
    container.alpha = 0;

    const textObj = this.scene.add.text(6, 4, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0, 0);
    const bgW = textObj.width + 12;
    const bgH = textObj.height + 8;
    const bg = this.scene.add.rectangle(0, 0, bgW, bgH, 0x000000, 0.75)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffe066, 0.35);

    container.add([bg, textObj]);
    container._bgW = bgW;
    container._bgH = bgH;

    this.scene.tweens.add({ targets: container, alpha: 1, duration: FADE_IN_MS });
    this._hint = container;
    this._positionHint(pointer);
  }

  _positionHint(pointer) {
    const hint = this._hint;
    if (!hint) return;
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const w = hint._bgW;
    const h = hint._bgH;
    const margin = 20;

    let x = pointer.x + margin;
    let y = pointer.y + margin;
    if (x + w > W - 6) x = pointer.x - w - margin;
    if (y + h > H - 6) y = pointer.y - h - margin;
    hint.setPosition(Math.max(4, x), Math.max(4, y));
  }

  _clearHint() {
    if (this._hoverTimer) { this._hoverTimer.remove(); this._hoverTimer = null; }
    if (this._hint) {
      const hint = this._hint;
      this.scene.tweens.add({
        targets: hint,
        alpha: 0,
        duration: FADE_OUT_MS,
        onComplete: () => hint.destroy()
      });
      this._hint = null;
    }
  }
}
