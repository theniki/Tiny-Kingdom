import Phaser from 'phaser';
import {
  GRID_W, GRID_H, TILE_SIZE, WORLD_W, WORLD_H,
  CELL_TYPES, FEATURES, BLOCKING_FEATURES,
  DEBUG_ENEMY_SPAWN
} from '../data/constants.js';
import {
  initFogOfWar, computeFog, getFogState, seedStartingReveal,
  revealAll, toggleDebugFog, isFogDisabled,
  FOW_UNSEEN, FOW_EXPLORED, FOW_VISIBLE
} from '../systems/fogOfWar.js';
import * as combatState from '../systems/combatState.js';
import { generateMap } from '../data/mapgen.js';
import { gameState, resetGameState } from '../data/gameState.js';
import { Villager } from '../data/Villager.js';
import { Soldier } from '../data/Soldier.js';
import { Building } from '../data/Building.js';
import { Chest } from '../data/Chest.js';
import { BUILDING_TYPES, canAffordWith, spend } from '../data/buildings.js';
import { findPath } from '../systems/pathfinding.js';
import { redAiTick, spawnRedWave } from '../systems/ai.js';
import { rollChestReward, findChestSpawnTile, nextChestSpawnTime, FIRST_CHEST_AT_SEC, MAX_ACTIVE as CHEST_MAX } from '../systems/chests.js';
import { econFor } from '../data/gameState.js';
import { DoubleClickDetector } from '../systems/input.js';
import { HintManager } from '../systems/hints.js';
import * as audio from '../systems/audio.js';

const HUD_TOP = 48;
const HUD_BOTTOM = 96;

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    resetGameState();

    this.world = generateMap(GRID_W, GRID_H);
    this.renderMap();
    this.createAnimations();
    initFogOfWar();
    this.spawnTownCenter();
    this.spawnStartingVillagers();

    // Camera: world is 3840×3840 px, viewport is 1280×832.
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.centerOn(this.townCenter.centerX, this.townCenter.centerY);

    // Reveal a 10-tile radius around player TC at start.
    seedStartingReveal('blue', this.world.playerCorner.cx, this.world.playerCorner.cy, 10);
    this._fowAccum = 0;
    this._updateFogOverlay(); // initial paint

    this.input.mouse.disableContextMenu();

    this.tileSelectionRect = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE)
      .setStrokeStyle(3, 0xffe066)
      .setFillStyle(0xffe066, 0.12)
      .setDepth(1000)
      .setVisible(false);

    this.dragRect = this.add.rectangle(0, 0, 1, 1, 0xffffff, 0.12)
      .setStrokeStyle(1, 0xffffff, 0.9)
      .setOrigin(0, 0)
      .setDepth(1100)
      .setVisible(false);

    this._pendingClick = null;
    this._dragStart = null;
    this._dragging = false;
    this.DRAG_THRESHOLD_SQ = 36; // 6px

    this._doubleClick = new DoubleClickDetector({ windowMs: 350 });
    this.hintManager = new HintManager(this);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('pointerout', () => this.hintManager.hide(), this);
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.placementMode) this.exitPlacementMode();
      else this.clearSelection();
    });

    // SPACE → pause toggle
    this.input.keyboard.on('keydown-SPACE', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'INPUT') return;
      this.togglePause();
    });

    // Camera scroll keys
    this._camKeys = this.input.keyboard.addKeys({
      W: 'W', A: 'A', S: 'S', D: 'D',
      UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT'
    });

    // Fog debug
    this.input.keyboard.on('keydown-F', () => {
      toggleDebugFog();
      this._updateFogOverlay();
    });
    this.input.keyboard.on('keydown-M', () => {
      revealAll('blue');
      this._updateFogOverlay();
    });

    audio.AudioManager.attach(this);

    // Combat-reactive music (D-012): start peaceful, subscribe to state events.
    combatState.reset();
    const unsubStart = combatState.onCombatStarted(() => audio.AudioManager.setMusicState('combat'));
    const unsubEnd   = combatState.onCombatEnded  (() => audio.AudioManager.setMusicState('peaceful'));

    audio.AudioManager.resumeContext().then(() => {
      audio.AudioManager.setMusicState('peaceful');
    });

    // Debug: 'C' toggles combat override
    this.input.keyboard.on('keydown-C', () => {
      const s = combatState.currentState();
      if (s === 'combat') combatState.forcePeaceful();
      else                combatState.forceCombat();
    });

    // Pause audio on tab blur, restore on focus
    if (!this._audioBlurBound) {
      this._audioBlurBound = true;
      this._onBlur  = () => audio.AudioManager.onBlur();
      this._onFocus = () => audio.AudioManager.onFocus();
      window.addEventListener('blur',  this._onBlur);
      window.addEventListener('focus', this._onFocus);
    }

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubStart(); unsubEnd();
      combatState.reset();
      audio.AudioManager.stopMusic(0);
      if (this._audioBlurBound) {
        window.removeEventListener('blur',  this._onBlur);
        window.removeEventListener('focus', this._onFocus);
        this._audioBlurBound = false;
      }
    });

    // Debug: spawn red enemy at cursor (E).
    // Gated by DEBUG_ENEMY_SPAWN — flip to false before Prompt 11 ships
    // (multiplayer is server-authoritative; clients can't spawn units).
    if (DEBUG_ENEMY_SPAWN) {
      this.input.keyboard.on('keydown-E', () => {
        const p = this.input.activePointer;
        const tx = Math.floor(p.worldX / TILE_SIZE);
        const ty = Math.floor(p.worldY / TILE_SIZE);
        if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return;
        if (!this.isWalkable(tx, ty)) return;
        const e = new Soldier(this, tx, ty, { team: 'red', hp: 50 });
        gameState.soldiers.push(e);
      });
    }

    // Combat tick — 100ms
    this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (gameState.defeated) return;
        for (const s of gameState.soldiers) s.tick(100);
        this._autoEngageEnemies();
      }
    });

    // Red AI tick — 10s
    this.time.addEvent({
      delay: 10000, loop: true,
      callback: () => { if (!gameState.defeated) redAiTick(this); }
    });

    // Wave scheduler — every 90s, waves 1…N
    this._nextWaveNumber = 1;
    this.time.addEvent({
      delay: 90000, loop: true,
      callback: () => this._scheduleWave()
    });

    // Chest spawn scheduler — first at 120s, then 90–150s random gaps
    this._nextChestSpawnTime = FIRST_CHEST_AT_SEC;
    this.time.addEvent({
      delay: 500, loop: true,
      callback: () => this._checkChestSpawn()
    });
    // Chest collection check — every 200ms
    this.time.addEvent({
      delay: 200, loop: true,
      callback: () => this._checkChestCollection()
    });

    // Building-completed / destroyed listeners for castle countdown + win/lose
    this.game.events.on('buildingCompleted', this._onBuildingCompleted, this);
    this.game.events.on('buildingDestroyed', this._onBuildingDestroyed, this);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('buildingCompleted', this._onBuildingCompleted, this);
      this.game.events.off('buildingDestroyed', this._onBuildingDestroyed, this);
    });

    // Expose to console for debugging
    window.scene = this;
  }

  /* ---------------- Animations ---------------- */

  createAnimations() {
    const specs = [
      { key: 'villager_idle_east', rate: 4 },
      { key: 'villager_idle_west', rate: 4 },
      { key: 'villager_walk_east', rate: 8 },
      { key: 'villager_walk_west', rate: 8 }
    ];
    for (const { key, rate } of specs) {
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 3 }),
        frameRate: rate,
        repeat: -1
      });
    }
  }

  /* ---------------- Spawning ---------------- */

  spawnTownCenter() {
    const { playerCorner, redCorner } = this.world;

    this._clearReservedArea(playerCorner.cx - 1, playerCorner.cy - 1, 4, 4);
    const tc = new Building(this, BUILDING_TYPES.town_center,
      playerCorner.cx - 1, playerCorner.cy - 1,
      { team: 'blue', alreadyBuilt: true });
    gameState.buildings.push(tc);
    this.townCenter = tc;

    this._clearReservedArea(redCorner.cx - 1, redCorner.cy - 1, 4, 4);
    const redTc = new Building(this, BUILDING_TYPES.town_center,
      redCorner.cx - 1, redCorner.cy - 1,
      { team: 'red', alreadyBuilt: true });
    gameState.buildings.push(redTc);
    this.redTownCenter = redTc;

    // 3 red starting villagers
    const redSpawns = [
      { x: redCorner.cx - 1, y: redCorner.cy + 2 },
      { x: redCorner.cx,     y: redCorner.cy + 2 },
      { x: redCorner.cx + 1, y: redCorner.cy }
    ];
    for (const s of redSpawns) {
      if (this.isWalkable(s.x, s.y)) {
        const v = new Villager(this, s.x, s.y, { team: 'red' });
        gameState.villagers.push(v);
      }
    }
  }

  _clearReservedArea(x0, y0, w, h) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        const cell = this.world.map[y][x];
        // Clear any blocking features
        if (cell.feature && BLOCKING_FEATURES.has(cell.feature)) {
          cell.feature = null;
          cell.resourceAmount = 0;
          const key = `${x},${y}`;
          const sprite = this._featureSprites?.[key];
          if (sprite) { sprite.destroy(); delete this._featureSprites[key]; }
        }
        // Ensure walkable base tile
        if (cell.type !== CELL_TYPES.GRASS) cell.type = CELL_TYPES.GRASS;
      }
    }
  }

  spawnStartingVillagers() {
    const { cx, cy } = this.world.playerCorner;
    const spawnSpots = [
      { x: cx - 1, y: cy + 1 },
      { x: cx,     y: cy + 1 },
      { x: cx + 1, y: cy }
    ];
    for (const s of spawnSpots) {
      if (!this.isWalkable(s.x, s.y)) continue;
      const v = new Villager(this, s.x, s.y);
      gameState.villagers.push(v);
    }
    this.selectedUnits = [];
    this.game.events.emit('populationChanged');
  }

  /* ---------------- Walkability ---------------- */

  isWalkable(x, y) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
    const cell = this.world.map[y][x];
    if (cell.type === CELL_TYPES.WATER) return false;
    if (cell.type === CELL_TYPES.MOUNTAIN) return false;
    if (cell.feature && BLOCKING_FEATURES.has(cell.feature)) return false;
    if (cell.occupant) return false;
    return true;
  }

  /* ---------------- Input ---------------- */

  onPointerDown(pointer) {
    if (this._inHud(pointer)) return;

    // Middle-click → start camera pan drag
    if (pointer.middleButtonDown && pointer.middleButtonDown()) {
      this._camDrag = {
        startX: pointer.x, startY: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY
      };
      return;
    }

    // Placement mode: left-click confirms, right-click cancels
    if (this.placementMode) {
      if (pointer.rightButtonDown()) { this.exitPlacementMode(); return; }
      this._confirmPlacement();
      return;
    }

    // Right-button: defer the action. If the user drags, it's a pan.
    // If they release without moving, it's a deselect.
    if (pointer.rightButtonDown()) {
      this._rightDrag = {
        sx: pointer.x, sy: pointer.y,
        camX: this.cameras.main.scrollX,
        camY: this.cameras.main.scrollY,
        dragging: false
      };
      return;
    }

    const wx = pointer.worldX;
    const wy = pointer.worldY;
    const clickedUnit = this._findUnitAt(wx, wy, 'blue');
    const shift = !!(pointer.event && pointer.event.shiftKey);

    this._dragStart = { x: wx, y: wy };
    this._dragging = false;
    this._pendingClick = { worldX: wx, worldY: wy, clickedUnit, shift };
  }

  _findUnitAt(wx, wy, team = null) {
    const v = gameState.villagers.find(u => !u.destroyed && u.hitTest(wx, wy) && (!team || u.team === team));
    if (v) return v;
    return gameState.soldiers.find(u => !u.destroyed && u.hitTest(wx, wy) && (!team || u.team === team));
  }

  _findEnemyAt(wx, wy) {
    const s = gameState.soldiers.find(u => !u.destroyed && u.team !== 'blue' && u.hitTest(wx, wy));
    if (s) return s;
    const v = gameState.villagers.find(u => !u.destroyed && u.team !== 'blue' && u.hitTest(wx, wy));
    if (v) return v;
    return gameState.buildings.find(b => !b.destroyed && b.team !== 'blue' && b.hitTest(wx, wy));
  }

  _handleActionCommand(target, selection) {
    if (!target) return;
    const selected = (selection && selection.length > 0) ? selection : this.selectedUnits;
    if (!selected || selected.length === 0) return;

    const villagers = selected.filter(u => u.kind === 'villager' && u.team === 'blue' && !u.destroyed);
    const soldiers  = selected.filter(u => u.kind === 'soldier'  && u.team === 'blue' && !u.destroyed);

    switch (target.kind) {
      case 'enemy_unit':
      case 'enemy_building': {
        if (soldiers.length > 0) {
          for (const s of soldiers) s.assignAttackTarget(target.ref);
        }
        if (villagers.length > 0 && soldiers.length > 0) {
          const tx = target.ref.gridX ?? (target.ref.tiles ? target.ref.tiles[0].x : 0);
          const ty = target.ref.gridY ?? (target.ref.tiles ? target.ref.tiles[0].y : 0);
          this.commandMove(villagers, tx, ty);
        }
        return;
      }
      case 'resource_tree':
        if (villagers.length) this.commandGather(villagers, target.x, target.y, 'wood');
        if (soldiers.length)  this.commandMove(soldiers, target.x, target.y);
        return;
      case 'resource_apple':
        if (villagers.length) this.commandGather(villagers, target.x, target.y, 'food');
        if (soldiers.length)  this.commandMove(soldiers, target.x, target.y);
        return;
      case 'resource_gold':
        if (villagers.length) this.commandGather(villagers, target.x, target.y, 'gold');
        if (soldiers.length)  this.commandMove(soldiers, target.x, target.y);
        return;
      case 'farm': {
        const g = target.ref.typeDef.effects?.gatherable;
        if (villagers.length && g) this.commandGatherBuilding(villagers, target.ref, g.type);
        if (soldiers.length)       this.commandMove(soldiers, target.ref.gridX, target.ref.gridY);
        return;
      }
      case 'friendly_building':
        this.commandMove(selected, target.ref.gridX, target.ref.gridY);
        return;
      case 'walkable_tile':
        this.commandMove(selected, target.x, target.y);
        return;
      // friendly_unit / blocked_tile → no action
    }
  }

  commandGather(villagers, x, y, resourceType) {
    for (const v of villagers) {
      v.assignJob({ type: 'gather', resourceType, target: { x, y } });
    }
  }

  commandGatherBuilding(villagers, building, resourceType) {
    for (const v of villagers) {
      v.assignJob({ type: 'gather_building', resourceType, building });
    }
  }

  onPointerMove(pointer) {
    if (this._camDrag) {
      this.cameras.main.scrollX = this._camDrag.scrollX - (pointer.x - this._camDrag.startX);
      this.cameras.main.scrollY = this._camDrag.scrollY - (pointer.y - this._camDrag.startY);
      return;
    }

    if (this._rightDrag) {
      const dx = pointer.x - this._rightDrag.sx;
      const dy = pointer.y - this._rightDrag.sy;
      if (!this._rightDrag.dragging && (dx * dx + dy * dy) > this.DRAG_THRESHOLD_SQ) {
        this._rightDrag.dragging = true;
        this.hintManager.hide();
      }
      if (this._rightDrag.dragging) {
        this.cameras.main.scrollX = this._rightDrag.camX - dx;
        this.cameras.main.scrollY = this._rightDrag.camY - dy;
        return;
      }
    }

    if (this.placementMode) { this._updatePlacementGhost(pointer); return; }

    // Hover hints (only when something is selected)
    if (this._inHud(pointer)) {
      this.hintManager.hide();
    } else if (this.selectedUnits.length > 0) {
      this.hintManager.update(pointer);
    } else {
      this.hintManager.hide();
    }

    // Drag-selection detection
    if (!this._pendingClick || !this._dragStart) return;
    const dx = pointer.worldX - this._dragStart.x;
    const dy = pointer.worldY - this._dragStart.y;
    const distSq = dx * dx + dy * dy;

    if (!this._dragging) {
      if (distSq < this.DRAG_THRESHOLD_SQ) return;
      if (this._pendingClick.clickedUnit) return;
      this._dragging = true;
      this.dragRect.setVisible(true);
    }

    this._updateDragRect(pointer.worldX, pointer.worldY);
  }

  onPointerUp(pointer) {
    if (this._camDrag) {
      this._camDrag = null;
      return;
    }
    if (this._rightDrag) {
      const wasDragging = this._rightDrag.dragging;
      this._rightDrag = null;
      if (!wasDragging) {
        // Plain right-click → deselect
        this.clearSelection();
        this._doubleClick.reset();
        this._savedSelection = null;
        this.hintManager.hide();
      }
      return;
    }
    if (!this._pendingClick) return;
    const wx = pointer.worldX;
    const wy = pointer.worldY;

    if (this._dragging) {
      this._commitDragSelection(wx, wy, this._pendingClick.shift);
      this.dragRect.setVisible(false);
      this._doubleClick.reset();
      this._savedSelection = null;
    } else {
      // Double-click check: same target twice within 350ms triggers an action.
      // The first click may have switched selection to a building — we use
      // _savedSelection (captured before that switch) so the action still
      // targets whoever was selected at double-click start.
      const target = this.hintManager.identifyTarget(wx, wy);
      const key = this.hintManager.targetKey(target);
      const isDouble = this._doubleClick.register(this.time.now, key);
      if (isDouble) {
        const snapshot = (this._savedSelection || []).filter(u => !u.destroyed);
        const effective = snapshot.length > 0 ? snapshot : this.selectedUnits;
        if (effective.length > 0) this._handleActionCommand(target, effective);
        this._savedSelection = null;
      } else {
        // First click — remember current selection before _handleClick can change it
        this._savedSelection = [...this.selectedUnits];
        this._handleClick(this._pendingClick);
      }
    }

    this._pendingClick = null;
    this._dragStart = null;
    this._dragging = false;
  }

  _inHud(pointer) {
    if (pointer.y < HUD_TOP) return true;
    if (pointer.y > this.scale.height - HUD_BOTTOM) return true;
    // Minimap zone (mirrors UIScene._createMinimap position)
    const miniSize = 180;
    const margin = 16;
    const miniX = this.scale.width - margin - miniSize;
    const miniY = this.scale.height - HUD_BOTTOM - margin - miniSize;
    if (pointer.x >= miniX && pointer.x <= miniX + miniSize &&
        pointer.y >= miniY && pointer.y <= miniY + miniSize) return true;
    // Audio panel (when open)
    const ui = this.scene.get('UIScene');
    if (ui && ui._audioPanelOpen && ui._audioPanelBounds) {
      const b = ui._audioPanelBounds;
      if (pointer.x >= b.x && pointer.x <= b.x + b.w &&
          pointer.y >= b.y && pointer.y <= b.y + b.h) return true;
    }
    return false;
  }

  _updateDragRect(endX, endY) {
    const x1 = Math.min(this._dragStart.x, endX);
    const x2 = Math.max(this._dragStart.x, endX);
    const y1 = Math.min(this._dragStart.y, endY);
    const y2 = Math.max(this._dragStart.y, endY);
    this.dragRect.setPosition(x1, y1);
    this.dragRect.setSize(x2 - x1, y2 - y1);
  }

  _commitDragSelection(endX, endY, shift) {
    const x1 = Math.min(this._dragStart.x, endX);
    const x2 = Math.max(this._dragStart.x, endX);
    const y1 = Math.min(this._dragStart.y, endY);
    const y2 = Math.max(this._dragStart.y, endY);
    const inBox = (u) =>
      !u.destroyed && u.team === 'blue' &&
      u.pixelX >= x1 && u.pixelX <= x2 &&
      u.pixelY >= y1 && u.pixelY <= y2;
    const hit = [
      ...gameState.villagers.filter(inBox),
      ...gameState.soldiers.filter(inBox)
    ];
    if (shift) {
      const merged = [...this.selectedUnits];
      for (const u of hit) if (!merged.includes(u)) merged.push(u);
      this.setSelectedUnits(merged);
    } else {
      this.setSelectedUnits(hit);
    }
  }

  _handleClick({ worldX: wx, worldY: wy, clickedUnit, shift }) {
    // Pure selection — commands go through double-click.
    // Clicking a friendly unit always selects (or toggles with shift).
    if (clickedUnit) {
      if (shift) this.toggleUnit(clickedUnit);
      else this.setSelectedUnits([clickedUnit]);
      return;
    }

    // Clicking a friendly building always switches selection — standard
    // RTS behavior. Double-click on the same building still fires an action
    // via the _savedSelection snapshot captured in onPointerUp.
    const clickedBuilding = gameState.buildings.find(b =>
      !b.destroyed && b.team === 'blue' && b.hitTest(wx, wy)
    );
    if (clickedBuilding) {
      this.setSelectedBuilding(clickedBuilding);
      return;
    }

    // Empty tile / resource / enemy clicks preserve existing unit selection
    // (so the user can double-click for an action). With no selection, show
    // tile info.
    if (this.selectedUnits.length > 0) return;

    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return;

    this.selectTile(tx, ty);
  }

  /* ---------------- Selection ---------------- */

  setSelectedUnits(list) {
    for (const v of this.selectedUnits) v.setSelected(false);
    this.selectedUnits = [...list];
    for (const v of this.selectedUnits) v.setSelected(true);
    this.tileSelectionRect.setVisible(false);
    this._clearBuildingSelectionHighlight();
    this.hintManager?.hide();
    this._doubleClick?.reset();

    // First-time discovery toasts
    const ui = this.scene.get('UIScene');
    if (ui && ui.showToast) {
      const hasVillager = this.selectedUnits.some(u => u.kind === 'villager' && u.team === 'blue');
      const hasGuard    = this.selectedUnits.some(u => u.kind === 'soldier'  && u.team === 'blue');
      if (hasVillager && !gameState.uiHintsSeen.villagerFirstSelect) {
        ui.showToast('💡 Double-click to send your villager to work!', 6000, 0x66ccff);
        gameState.uiHintsSeen.villagerFirstSelect = true;
      }
      if (hasGuard && !gameState.uiHintsSeen.guardFirstSelect) {
        ui.showToast('💡 Double-click an enemy to attack!', 6000, 0xff6666);
        gameState.uiHintsSeen.guardFirstSelect = true;
      }
    }

    gameState.selected = this.selectedUnits.length > 0
      ? { kind: 'units', list: this.selectedUnits }
      : null;
    this.game.events.emit('selectionChanged', gameState.selected);
  }

  setSelectedBuilding(b) {
    for (const v of this.selectedUnits) v.setSelected(false);
    this.selectedUnits = [];
    this.tileSelectionRect.setVisible(false);
    this._setBuildingSelectionHighlight(b);
    gameState.selected = { kind: 'building', building: b };
    this.game.events.emit('selectionChanged', gameState.selected);
  }

  _setBuildingSelectionHighlight(b) {
    this._clearBuildingSelectionHighlight();
    const w = b.footprint * TILE_SIZE;
    this._buildingHighlight = this.add.rectangle(b.centerX, b.centerY, w, w)
      .setStrokeStyle(3, 0xffe066)
      .setFillStyle(0xffe066, 0.08)
      .setDepth(1000);
  }

  _clearBuildingSelectionHighlight() {
    if (this._buildingHighlight) { this._buildingHighlight.destroy(); this._buildingHighlight = null; }
  }

  toggleUnit(v) {
    if (this.selectedUnits.includes(v)) {
      this.setSelectedUnits(this.selectedUnits.filter(x => x !== v));
    } else {
      this.setSelectedUnits([...this.selectedUnits, v]);
    }
  }

  selectTile(x, y) {
    for (const v of this.selectedUnits) v.setSelected(false);
    this.selectedUnits = [];
    this._clearBuildingSelectionHighlight();
    const cell = this.world.map[y][x];
    gameState.selected = {
      kind: 'tile', x, y,
      type: cell.type, feature: cell.feature,
      occupant: cell.occupant ? cell.occupant.type : null
    };
    this.tileSelectionRect.setPosition(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2
    );
    this.tileSelectionRect.setVisible(true);
    this.game.events.emit('selectionChanged', gameState.selected);
  }

  clearSelection() {
    for (const v of this.selectedUnits) v.setSelected(false);
    this.selectedUnits = [];
    this.tileSelectionRect.setVisible(false);
    this._clearBuildingSelectionHighlight();
    this.hintManager?.hide();
    this._doubleClick?.reset();
    gameState.selected = null;
    this.game.events.emit('selectionChanged', null);
  }

  /* ---------------- Movement commands ---------------- */

  commandMove(units, tx, ty) {
    const claimed = new Set();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.destroyed) continue;
      u.cancelJob();
      const dest = this.pickDestination(u, { x: tx, y: ty }, claimed);
      if (!dest) continue;
      claimed.add(`${dest.x},${dest.y}`);
      const path = findPath(
        { x: u.gridX, y: u.gridY },
        dest,
        (x, y) => this.isWalkable(x, y) || (x === u.gridX && y === u.gridY),
        GRID_W, GRID_H
      );
      if (path) u.moveAlongPath(path);
    }
  }

  /* ---------------- Gather helpers ---------------- */

  findNearestTownCenter(villager, team = 'blue') {
    let best = null;
    let bestDist = Infinity;
    for (const b of gameState.buildings) {
      if (b.team !== team) continue;
      if (b.type !== 'town_center' && b.type !== 'town_center_t2') continue;
      if (b.underConstruction || b.destroyed) continue;
      const dx = villager.gridX - b.gridX;
      const dy = villager.gridY - b.gridY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  clearResourceAt(x, y) {
    const cell = this.world.map[y][x];
    cell.feature = null;
    cell.resourceAmount = 0;
    const key = `${x},${y}`;
    const sprite = this._featureSprites && this._featureSprites[key];
    if (sprite) {
      this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: sprite.scaleX * 0.6,
        scaleY: sprite.scaleY * 0.6,
        duration: 250,
        onComplete: () => sprite.destroy()
      });
      delete this._featureSprites[key];
    }
  }

  emitWorkParticles(x, y, color) {
    if (!this.textures.exists('pixel4')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel4', 4, 4);
      g.destroy();
    }
    const emitter = this.add.particles(x, y, 'pixel4', {
      tint: color,
      speed: { min: 60, max: 120 },
      angle: { min: 200, max: 340 },
      gravityY: 380,
      lifespan: 450,
      scale: { start: 1.4, end: 0.5 },
      alpha: { start: 1, end: 0.2 },
      emitting: false
    });
    emitter.setDepth(200);
    emitter.explode(Phaser.Math.Between(3, 5));
    this.time.delayedCall(700, () => emitter.destroy());
  }

  emitSparkles(x, y) {
    if (!this.textures.exists('pixel4')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel4', 4, 4); g.destroy();
    }
    const emitter = this.add.particles(x, y, 'pixel4', {
      tint: [0xffe066, 0xffffff, 0xfff0a0],
      speed: { min: 40, max: 140 },
      angle: { min: 0, max: 360 },
      gravityY: 0,
      lifespan: 900,
      scale: { start: 1.6, end: 0.2 },
      alpha: { start: 1, end: 0 },
      emitting: false
    });
    emitter.setDepth(250);
    emitter.explode(22);
    this.time.delayedCall(1200, () => emitter.destroy());
  }

  /* ---------------- Build placement ---------------- */

  enterPlacementMode(buildingTypeId) {
    if (!BUILDING_TYPES[buildingTypeId]) return;
    const typeDef = BUILDING_TYPES[buildingTypeId];
    if (!canAffordWith(typeDef.cost, gameState)) return;
    const villagers = this.selectedUnits.filter(u => u.kind === 'villager');
    if (villagers.length === 0) return;
    this._pendingBuilder = villagers[0];

    this.exitPlacementMode();
    const F = typeDef.footprint;
    const ghost = this.add.image(0, 0, typeDef.sprite)
      .setAlpha(0.55)
      .setDisplaySize(F * TILE_SIZE * typeDef.spriteScale, F * TILE_SIZE * typeDef.spriteScale)
      .setDepth(2001);

    const tileHighlights = [];
    for (let i = 0; i < F * F; i++) {
      tileHighlights.push(
        this.add.rectangle(0, 0, TILE_SIZE - 2, TILE_SIZE - 2, 0x00ff00, 0.35)
          .setStrokeStyle(2, 0x00ff00, 0.9)
          .setDepth(2000)
      );
    }

    this.placementMode = {
      typeDef, footprint: F, ghost, tileHighlights,
      gridX: 0, gridY: 0, valid: false
    };
    this._updatePlacementGhost(this.input.activePointer);
  }

  exitPlacementMode() {
    if (!this.placementMode) return;
    this.placementMode.ghost?.destroy();
    for (const r of this.placementMode.tileHighlights) r.destroy();
    this.placementMode = null;
  }

  _updatePlacementGhost(pointer) {
    if (!this.placementMode) return;
    const F = this.placementMode.footprint;
    const tx = Math.floor(pointer.worldX / TILE_SIZE);
    const ty = Math.floor(pointer.worldY / TILE_SIZE);
    const gridX = tx - Math.floor(F / 2);
    const gridY = ty - Math.floor(F / 2);

    const centerX = (gridX + F / 2) * TILE_SIZE;
    const centerY = (gridY + F / 2) * TILE_SIZE;
    this.placementMode.ghost.setPosition(centerX, centerY);

    const valid = this._canPlaceBuilding(gridX, gridY, F);
    const tint = valid ? 0x00ff00 : 0xff4040;
    let i = 0;
    for (let dy = 0; dy < F; dy++) {
      for (let dx = 0; dx < F; dx++) {
        const r = this.placementMode.tileHighlights[i++];
        r.setPosition((gridX + dx) * TILE_SIZE + TILE_SIZE / 2,
                      (gridY + dy) * TILE_SIZE + TILE_SIZE / 2);
        r.setFillStyle(tint, 0.35);
        r.setStrokeStyle(2, tint, 0.9);
      }
    }
    this.placementMode.ghost.setTint(valid ? 0xffffff : 0xff8080);
    this.placementMode.gridX = gridX;
    this.placementMode.gridY = gridY;
    this.placementMode.valid = valid;
  }

  _canPlaceBuilding(gridX, gridY, footprint) {
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        const x = gridX + dx, y = gridY + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
        const cell = this.world.map[y][x];
        if (cell.type !== CELL_TYPES.GRASS) return false;
        if (cell.feature && BLOCKING_FEATURES.has(cell.feature)) return false;
        if (cell.occupant) return false;
      }
    }
    return true;
  }

  _confirmPlacement() {
    if (!this.placementMode || !this.placementMode.valid) return;
    const { typeDef, gridX, gridY } = this.placementMode;
    spend(typeDef.cost, gameState);
    this.game.events.emit('resourcesChanged');

    const b = new Building(this, typeDef, gridX, gridY, { team: 'blue' });
    gameState.buildings.push(b);

    const builder = this._pendingBuilder || this.selectedUnits.find(u => u.kind === 'villager');
    if (builder) builder.assignJob({ type: 'build', building: b });
    this._pendingBuilder = null;

    this.exitPlacementMode();
  }

  /* ---------------- Villager spawn (from TC training) ---------------- */

  _spawnSoldierAt(building, opts = {}) {
    const F = building.footprint;
    const team = building.team || 'blue';
    const isKnight = opts.isKnight || (team === 'blue' && gameState.research.knight);
    for (let r = 1; r <= 5; r++) {
      for (let dy = -r; dy <= F - 1 + r; dy++) {
        for (let dx = -r; dx <= F - 1 + r; dx++) {
          const onBoundary = (dx === -r || dx === F - 1 + r || dy === -r || dy === F - 1 + r);
          if (!onBoundary) continue;
          const x = building.gridX + dx;
          const y = building.gridY + dy;
          if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
          if (!this.isWalkable(x, y)) continue;
          const s = new Soldier(this, x, y, { team, isKnight });
          gameState.soldiers.push(s);
          this.emitSparkles(s.pixelX, s.pixelY);
          if (team === 'blue') audio.AudioManager.playSfx('level-up');
          return s;
        }
      }
    }
    return null;
  }

  _scheduleWave() {
    if (gameState.defeated) return;
    const n = this._nextWaveNumber++;
    this._nextWaveNumber = Math.min(this._nextWaveNumber, 99);
    this._showWaveWarning(n);
    this.time.delayedCall(5000, () => {
      if (gameState.defeated) return;
      spawnRedWave(this, n);
    });
  }

  _showWaveWarning(waveNumber) {
    const ui = this.scene.get('UIScene');
    if (ui && ui.showToast) ui.showToast(`⚠️ Red army approaches! (Wave ${waveNumber})`, 4800, 0xff4444);

    // Dashed red path line from red TC to player TC
    const redTC = gameState.buildings.find(b =>
      !b.destroyed && b.team === 'red' && (b.type === 'town_center' || b.type === 'town_center_t2'));
    const playerTC = gameState.buildings.find(b =>
      !b.destroyed && b.team === 'blue' && (b.type === 'town_center' || b.type === 'town_center_t2'));
    if (!redTC || !playerTC) return;

    const g = this.add.graphics();
    g.lineStyle(3, 0xff4444, 0.85);
    const sx = redTC.centerX, sy = redTC.centerY;
    const ex = playerTC.centerX, ey = playerTC.centerY;
    const steps = 26;
    for (let i = 0; i < steps; i += 2) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      g.beginPath();
      g.moveTo(sx + (ex - sx) * t0, sy + (ey - sy) * t0);
      g.lineTo(sx + (ex - sx) * t1, sy + (ey - sy) * t1);
      g.strokePath();
    }
    g.setDepth(500);
    this.tweens.add({ targets: g, alpha: 0, duration: 4800, onComplete: () => g.destroy() });
  }

  applyKnightUpgradeToAllSoldiers() {
    for (const s of gameState.soldiers) {
      if (!s.destroyed && s.team === 'blue') s.upgradeToKnight();
    }
  }

  onTeamDefeated(team) {
    if (gameState.defeated) return;
    gameState.defeated = team;
    console.log(`Team ${team} loses — freezing units.`);
    // Freeze: cancel all jobs, stop all soldiers.
    for (const v of gameState.villagers) {
      if (v.team === team && !v.destroyed) { v.cancelJob?.(); v.stopPath?.(); }
    }
    for (const s of gameState.soldiers) {
      if (s.team === team && !s.destroyed) { s.cancelJob(); s.stopPath(); }
    }
    const ui = this.scene.get('UIScene');
    if (ui && ui.showToast) {
      const msg = team === 'red' ? '🏆 You defeated the red kingdom!' : '😢 Your Town Center fell!';
      ui.showToast(msg, 6000, team === 'red' ? 0x44ff88 : 0xff4444);
    }
  }

  update(time, delta) {
    if (gameState.paused) return;

    const cam = this.cameras.main;
    const speed = 8 * TILE_SIZE; // 8 tiles/sec
    const dt = delta / 1000;
    const k = this._camKeys;
    if (k) {
      if (k.W.isDown || k.UP.isDown)    cam.scrollY -= speed * dt;
      if (k.S.isDown || k.DOWN.isDown)  cam.scrollY += speed * dt;
      if (k.A.isDown || k.LEFT.isDown)  cam.scrollX -= speed * dt;
      if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += speed * dt;
    }

    // Edge-scroll — only when not dragging a box, camera, or placing
    const p = this.input.activePointer;
    const panActive = this._camDrag || (this._rightDrag && this._rightDrag.dragging);
    if (p && !panActive && !this._dragging && !this.placementMode) {
      const pad = 40;
      if (p.x >= 0 && p.x < pad) cam.scrollX -= speed * dt;
      else if (p.x > this.scale.width - pad && p.x <= this.scale.width) cam.scrollX += speed * dt;
      if (p.y >= 0 && p.y < pad) cam.scrollY -= speed * dt;
      else if (p.y > this.scale.height - pad && p.y <= this.scale.height) cam.scrollY += speed * dt;
    }

    // 250ms background systems: fog of war + combat-state detection
    this._fowAccum = (this._fowAccum || 0) + delta;
    if (this._fowAccum >= 250) {
      this._fowAccum = 0;
      computeFog('blue');
      this._updateFogOverlay();
      this._applyFogToEnemies();
      combatState.tick(this.time.now);
    }
  }

  /* ---------------- Fog overlay ---------------- */

  _updateFogOverlay() {
    if (!this._fogGfx) {
      this._fogGfx = this.add.graphics().setDepth(900);
    }
    const g = this._fogGfx;
    g.clear();
    if (isFogDisabled()) return;
    const fog = gameState.fogOfWar?.blue;
    if (!fog) return;

    const T = TILE_SIZE;
    // Pass 1: UNSEEN (solid black)
    g.fillStyle(0x000000, 1);
    for (let y = 0; y < GRID_H; y++) {
      const row = fog[y];
      for (let x = 0; x < GRID_W; x++) {
        if (row[x] === FOW_UNSEEN) g.fillRect(x * T, y * T, T, T);
      }
    }
    // Pass 2: EXPLORED (60% black)
    g.fillStyle(0x000000, 0.55);
    for (let y = 0; y < GRID_H; y++) {
      const row = fog[y];
      for (let x = 0; x < GRID_W; x++) {
        if (row[x] === FOW_EXPLORED) g.fillRect(x * T, y * T, T, T);
      }
    }
  }

  _applyFogToEnemies() {
    const disabled = isFogDisabled();
    for (const v of gameState.villagers) {
      if (v.destroyed || !v.container) continue;
      if (v.team === 'blue') { v.container.setVisible(true); continue; }
      const st = disabled ? FOW_VISIBLE : getFogState('blue', v.gridX, v.gridY);
      v.container.setVisible(st === FOW_VISIBLE);
    }
    for (const s of gameState.soldiers) {
      if (s.destroyed || !s.container) continue;
      if (s.team === 'blue') { s.container.setVisible(true); continue; }
      const st = disabled ? FOW_VISIBLE : getFogState('blue', s.gridX, s.gridY);
      s.container.setVisible(st === FOW_VISIBLE);
    }
    for (const b of gameState.buildings) {
      if (b.destroyed || !b.sprite) continue;
      if (b.team === 'blue') continue; // own buildings always visible
      // Enemy building: hidden until first explored
      const anyExplored = b.tiles.some(t => {
        const st = disabled ? FOW_VISIBLE : getFogState('blue', t.x, t.y);
        return st !== FOW_UNSEEN;
      });
      b.sprite.setVisible(anyExplored);
      if (b.teamRibbon) b.teamRibbon.setVisible(anyExplored);
    }
  }

  /* ---------------- Pause ---------------- */

  togglePause() {
    gameState.paused = !gameState.paused;
    if (gameState.paused) {
      this.tweens.pauseAll();
      this.anims.pauseAll();
      this.time.paused = true;
      audio.AudioManager.pauseAll();
    } else {
      this.tweens.resumeAll();
      this.anims.resumeAll();
      this.time.paused = false;
      audio.AudioManager.resumeAll();
    }
    const ui = this.scene.get('UIScene');
    if (ui && ui.setPauseOverlay) ui.setPauseOverlay(gameState.paused);
  }

  /* ---------------- Polish helpers ---------------- */

  emitHearts(x, y) {
    if (!this.textures.exists('pixel4')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel4', 4, 4); g.destroy();
    }
    const emitter = this.add.particles(x, y, 'pixel4', {
      tint: [0xff66aa, 0xff99cc, 0xffb0d8],
      speed: { min: 20, max: 60 },
      angle: { min: 240, max: 300 },
      gravityY: -40,
      lifespan: 800,
      scale: { start: 1.6, end: 0.4 },
      alpha: { start: 1, end: 0 },
      emitting: false
    });
    emitter.setDepth(250);
    emitter.explode(8);
    this.time.delayedCall(1000, () => emitter.destroy());
  }

  /* ---------------- Treasure chests ---------------- */

  _checkChestSpawn() {
    if (gameState.defeated || gameState.winner) return;
    const active = gameState.chests.filter(c => !c.collected);
    if (active.length >= CHEST_MAX) return;
    if (gameState.elapsedTime < this._nextChestSpawnTime) return;
    const spot = findChestSpawnTile(this);
    if (!spot) return;
    const c = new Chest(this, spot.x, spot.y);
    gameState.chests.push(c);
    this._nextChestSpawnTime = nextChestSpawnTime(gameState.elapsedTime);
  }

  _checkChestCollection() {
    if (!gameState.chests.length) return;
    for (const chest of gameState.chests) {
      if (chest.collected) continue;
      const unit =
        gameState.villagers.find(u => !u.destroyed && u.gridX === chest.gridX && u.gridY === chest.gridY)
        || gameState.soldiers.find(u => !u.destroyed && u.gridX === chest.gridX && u.gridY === chest.gridY);
      if (unit) this._collectChest(chest, unit);
    }
    // Drop fully-collected references
    gameState.chests = gameState.chests.filter(c => !c.collected || !c.sprite);
  }

  _collectChest(chest, collector) {
    chest.collect();
    const team = collector.team;
    const reward = rollChestReward();
    this._applyChestReward(reward, team, chest, collector);
    this.emitSparkles(chest.sprite.x, chest.sprite.y);
    if (team === 'blue') audio.AudioManager.playSfx('collect-gold');

    if (team === 'blue') {
      gameState.stats.chestsOpened++;
      const ui = this.scene.get('UIScene');
      if (ui && ui.showToast) ui.showToast(`🎉 ${reward.label}!`, 2200, 0xffdd44);
      this._floatRewardIcon(chest.sprite.x, chest.sprite.y, reward.icon);
    }
  }

  _applyChestReward(reward, team, chest, collector) {
    const econ = econFor(team);
    switch (reward.type) {
      case 'wood': econ.wood += reward.amount; break;
      case 'food': econ.food += reward.amount; break;
      case 'villager': {
        const tc = this._findTeamTC(team);
        if (tc) this._spawnVillagerAt(tc);
        break;
      }
      case 'speed':
        gameState.speedBoost[team] = gameState.elapsedTime + (reward.durationSec || 20);
        break;
      case 'guard': {
        const barracks = gameState.buildings.find(b =>
          !b.destroyed && !b.underConstruction && b.team === team &&
          (b.type === 'barracks_t1' || b.type === 'barracks_t2'));
        if (barracks) this._spawnSoldierAt(barracks);
        else econ.food += 50; // fallback
        break;
      }
    }
    if (team === 'blue') this.game.events.emit('resourcesChanged');
  }

  _floatRewardIcon(x, y, frame) {
    const icon = this.add.image(x, y - 6, 'findables', frame)
      .setScale(1.2)
      .setDepth(600);
    this.tweens.add({
      targets: icon,
      y: y - 46,
      alpha: { from: 1, to: 0 },
      duration: 1000,
      onComplete: () => icon.destroy()
    });
  }

  _findTeamTC(team) {
    return gameState.buildings.find(b =>
      !b.destroyed && !b.underConstruction && b.team === team &&
      (b.type === 'town_center' || b.type === 'town_center_t2'));
  }

  /* ---------------- Castle countdown ---------------- */

  _onBuildingCompleted(building) {
    if (building.team === 'blue' && building.type === 'castle') {
      audio.AudioManager.playSfx('upgrade');
      this._startCastleCountdown(building);
      this._attachCastleFlag(building);
    }
  }

  _attachCastleFlag(castle) {
    const flag = this.add.rectangle(
      castle.centerX,
      castle.gridY * TILE_SIZE - 6,
      8, 14, 0xffdd44
    ).setStrokeStyle(1, 0x8a6a1a).setDepth(85);
    this.tweens.add({
      targets: flag,
      scaleX: { from: 1, to: 0.7 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    castle._flag = flag;
  }

  _onBuildingDestroyed(building) {
    if (building._flag) { building._flag.destroy(); building._flag = null; }
    if (building === this._playerCastle) {
      this._cancelCastleCountdown();
      const ui = this.scene.get('UIScene');
      if (ui && ui.showToast) ui.showToast('Castle destroyed — rebuild to try again!', 3500, 0xff6666);
    }
  }

  _startCastleCountdown(castle) {
    this._cancelCastleCountdown(); // just in case
    this._playerCastle = castle;
    this._castleCountdown = 60;

    const y = castle.gridY * TILE_SIZE - 20;
    this._castleCountdownText = this.add.text(castle.centerX, y, '60', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '56px',
      color: '#ffdd44',
      fontStyle: 'bold',
      stroke: '#3a2a00',
      strokeThickness: 5
    }).setOrigin(0.5, 1).setDepth(700);

    const ui = this.scene.get('UIScene');
    if (ui && ui.showToast) ui.showToast('🏰 Hold the Castle for 60 seconds to win!', 3500, 0xffdd44);

    this._castleCountdownEvent = this.time.addEvent({
      delay: 1000, repeat: 59,
      callback: () => {
        if (!this._playerCastle || this._playerCastle.destroyed) {
          this._cancelCastleCountdown();
          return;
        }
        this._castleCountdown--;
        if (this._castleCountdownText) {
          this._castleCountdownText.setText(String(this._castleCountdown));
          // Pulse scale each tick
          this.tweens.add({
            targets: this._castleCountdownText,
            scale: { from: 1.2, to: 1 },
            duration: 220
          });
        }
        if (this._castleCountdown <= 0) {
          this._onPlayerWin();
        }
      }
    });
  }

  _cancelCastleCountdown() {
    if (this._castleCountdownEvent) { this._castleCountdownEvent.remove(); this._castleCountdownEvent = null; }
    if (this._castleCountdownText) { this._castleCountdownText.destroy(); this._castleCountdownText = null; }
    this._playerCastle = null;
  }

  /* ---------------- Win / Lose ---------------- */

  onTeamDefeated(team) {
    if (gameState.defeated || gameState.winner) return;
    gameState.defeated = team;
    console.log(`Team ${team} loses`);
    // Freeze all remaining units briefly for visual effect
    for (const v of gameState.villagers) {
      if (!v.destroyed) { v.cancelJob?.(); v.stopPath?.(); }
    }
    for (const s of gameState.soldiers) {
      if (!s.destroyed) { s.cancelJob(); s.stopPath(); }
    }
    if (team === 'blue') this._goToLoseScene();
    else this._onPlayerWin();
  }

  _onPlayerWin() {
    if (gameState.winner || gameState.defeated === 'blue') return;
    gameState.winner = 'blue';
    this._cancelCastleCountdown();
    this._goToWinScene();
  }

  _goToWinScene() {
    audio.AudioManager.stopMusic(1500);
    this.time.delayedCall(1500, () => {
      audio.AudioManager.playSfx('level-up');
    });
    this.time.delayedCall(500, () => {
      this.scene.stop('UIScene');
      this.scene.start('WinScene');
    });
  }

  _goToLoseScene() {
    audio.AudioManager.stopMusic(1500);
    this.time.delayedCall(500, () => {
      this.scene.stop('UIScene');
      this.scene.start('LoseScene');
    });
  }

  _autoEngageEnemies() {
    // Idle soldiers (either team) engage nearby enemies within 5 tiles.
    // Soldiers with a marchTarget keep it; we only swap if a closer enemy appears.
    for (const s of gameState.soldiers) {
      if (s.destroyed) continue;
      if (s.state === 'walking' && !s.attackTarget && !s.marchTarget) continue;
      const nearest = this._findNearestEnemy(s, 5);
      if (!nearest) continue;
      if (!s.attackTarget || s.attackTarget.destroyed) {
        s.attackTarget = nearest;
        continue;
      }
      // Switch to nearer enemy if significantly closer
      const cur = s.attackTarget;
      const curDist = Math.max(Math.abs(s.gridX - (cur.gridX ?? s.gridX)), Math.abs(s.gridY - (cur.gridY ?? s.gridY)));
      const newDist = Math.max(Math.abs(s.gridX - nearest.gridX), Math.abs(s.gridY - nearest.gridY));
      if (newDist + 2 < curDist) s.attackTarget = nearest;
    }
  }

  _findNearestEnemy(unit, maxGridDist = 6) {
    let best = null, bestD = Infinity;
    const check = (t) => {
      const tx = t.gridX ?? (t.tiles ? t.tiles[0].x : 0);
      const ty = t.gridY ?? (t.tiles ? t.tiles[0].y : 0);
      const d = Math.max(Math.abs(tx - unit.gridX), Math.abs(ty - unit.gridY));
      if (d <= maxGridDist && d < bestD) { bestD = d; best = t; }
    };
    for (const e of gameState.soldiers) {
      if (e.destroyed || e.team === unit.team) continue;
      check(e);
    }
    for (const e of gameState.villagers) {
      if (e.destroyed || e.team === unit.team) continue;
      check(e);
    }
    for (const b of gameState.buildings) {
      if (b.destroyed || b.team === unit.team) continue;
      if (b.underConstruction) continue;
      check(b);
    }
    return best;
  }

  _spawnVillagerAt(building) {
    const F = building.footprint;
    const team = building.team || 'blue';
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= F - 1 + r; dy++) {
        for (let dx = -r; dx <= F - 1 + r; dx++) {
          const onBoundary = (dx === -r || dx === F - 1 + r || dy === -r || dy === F - 1 + r);
          if (!onBoundary) continue;
          const x = building.gridX + dx;
          const y = building.gridY + dy;
          if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
          if (!this.isWalkable(x, y)) continue;
          const v = new Villager(this, x, y, { team });
          gameState.villagers.push(v);
          this.emitSparkles(v.pixelX, v.pixelY);
          if (team === 'blue') {
            this.emitHearts(v.pixelX, v.pixelY - 20);
            audio.AudioManager.playSfx('level-up');
            this.game.events.emit('populationChanged');
          }
          return v;
        }
      }
    }
    return null;
  }

  pickDestination(villager, target, claimed) {
    const tryTile = (x, y) => {
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
      if (!this.isWalkable(x, y)) return false;
      if (claimed.has(`${x},${y}`)) return false;
      return true;
    };
    if (tryTile(target.x, target.y)) return { x: target.x, y: target.y };
    // Spiral outward up to radius 3
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = target.x + dx;
          const y = target.y + dy;
          if (tryTile(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /* ---------------- Rendering ---------------- */

  renderMap() {
    const { map, width, height } = this.world;
    const T = TILE_SIZE;

    this._featureSprites = {};

    // Grass base: single TileSprite across the whole world (native 128 → 64 scale)
    this.add.tileSprite(0, 0, width * T, height * T, 'grass')
      .setOrigin(0, 0)
      .setTileScale(T / 128, T / 128)
      .setDepth(0);

    const terrainLayer = this.add.container(0, 0).setDepth(10);
    const decorationLayer = this.add.container(0, 0).setDepth(20);
    const resourceLayer = this.add.container(0, 0).setDepth(30);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cx = x * T + T / 2;
        const cy = y * T + T / 2;
        const byBottom = y * T + T;
        const cell = map[y][x];

        if (cell.type === CELL_TYPES.WATER) {
          terrainLayer.add(this.add.image(cx, cy, 'water').setDisplaySize(T, T));
          continue;
        }
        if (cell.type === CELL_TYPES.MOUNTAIN) {
          terrainLayer.add(this.add.image(cx, cy, 'mountain').setDisplaySize(T, T));
          continue;
        }

        switch (cell.feature) {
          case FEATURES.DECORATION:
            decorationLayer.add(
              this.add.image(cx, cy, 'decoration', cell.decoFrame).setDisplaySize(T, T)
            );
            break;
          case FEATURES.TREE: {
            const s = this.add.image(cx, byBottom, 'tree').setOrigin(0.5, 1).setDisplaySize(T + 16, T + 16);
            resourceLayer.add(s);
            this._featureSprites[`${x},${y}`] = s;
            break;
          }
          case FEATURES.APPLE: {
            const s = this.add.image(cx, byBottom, 'apple_pile').setOrigin(0.5, 1).setDisplaySize(T, T);
            resourceLayer.add(s);
            this._featureSprites[`${x},${y}`] = s;
            break;
          }
          case FEATURES.GOLD: {
            const s = this.add.image(cx, byBottom, 'gold').setOrigin(0.5, 1).setDisplaySize(T, T);
            resourceLayer.add(s);
            this._featureSprites[`${x},${y}`] = s;
            break;
          }
          case FEATURES.STONE_DECO: {
            const variantKey = cell.variant || 'grey_rocks';
            resourceLayer.add(
              this.add.image(cx, byBottom, variantKey).setOrigin(0.5, 1).setDisplaySize(T, T)
            );
            break;
          }
          case FEATURES.RARE_MINERAL_DECO:
            resourceLayer.add(
              this.add.image(cx, byBottom, 'rare_mineral').setOrigin(0.5, 1).setDisplaySize(T, T)
            );
            break;
        }
      }
    }
  }
}
