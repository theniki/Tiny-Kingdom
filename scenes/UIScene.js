import Phaser from 'phaser';
import { gameState } from '../data/gameState.js';
import { BUILDING_TYPES, BUILDABLE_IDS, UNIT_DEFS, canAffordWith, formatCost } from '../data/buildings.js';
import { GRID_W, GRID_H, WORLD_W, WORLD_H, CELL_TYPES, FEATURES } from '../data/constants.js';
import { FOW_UNSEEN, FOW_EXPLORED, FOW_VISIBLE, isFogDisabled } from '../systems/fogOfWar.js';
import * as audio from '../systems/audio.js';

const TOP_H = 48;
const BOTTOM_H = 96;

const TEXT_STYLE = {
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  fontSize: '22px',
  color: '#ffffff'
};
const SUBTLE_STYLE = {
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  fontSize: '16px',
  color: '#d0d8e0'
};

function _dim(color) {
  const r = Math.floor(((color >> 16) & 0xff) * 0.45);
  const g = Math.floor(((color >> 8) & 0xff) * 0.45);
  const b = Math.floor((color & 0xff) * 0.45);
  return (r << 16) | (g << 8) | b;
}

export class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W; this.H = H;

    this.add.rectangle(0, 0, W, TOP_H, 0x000000, 0.7).setOrigin(0, 0);
    this.add.rectangle(0, H - BOTTOM_H, W, BOTTOM_H, 0x000000, 0.7).setOrigin(0, 0);

    this.woodText = this.add.text(16, TOP_H / 2, '', TEXT_STYLE).setOrigin(0, 0.5);
    this.foodText = this.add.text(180, TOP_H / 2, '', TEXT_STYLE).setOrigin(0, 0.5);
    this.goldText = this.add.text(340, TOP_H / 2, '', TEXT_STYLE).setOrigin(0, 0.5);
    this.popText = this.add.text(W / 2, TOP_H / 2, '', TEXT_STYLE).setOrigin(0.5);
    this.timerText = this.add.text(W - 68, TOP_H / 2, '⏱ 0:00', TEXT_STYLE).setOrigin(1, 0.5);

    // Speaker toggle — top-right
    this._muted = audio.isMuted() && audio.isMusicMuted();
    this.speakerBtn = this.add.text(W - 16, TOP_H / 2, '🔊', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px'
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.speakerBtn.on('pointerdown', (_p, _lx, _ly, event) => {
      if (event) event.stopPropagation();
      audio.toggleAllMuted();
      this._muted = audio.isMuted() && audio.isMusicMuted();
      this.speakerBtn.setText(this._muted ? '🔇' : '🔊');
    });
    this._attachTooltip(this.speakerBtn, 'Toggle sound');

    this.bottomContainer = this.add.container(0, H - BOTTOM_H);

    this.refreshResources();
    this.refreshPopulation();
    this._renderBottomBar(null);

    this.game.events.on('resourcesChanged', this._onResourcesChanged, this);
    this.game.events.on('populationChanged', this._onPopulationChanged, this);
    this.game.events.on('selectionChanged', this.refreshSelection, this);

    // Minimap
    this._createMinimap();
    this.time.addEvent({
      delay: 250, loop: true,
      callback: () => this._updateMinimap()
    });

    // Pause overlay (hidden by default)
    this._pauseOverlay = this.add.container(0, 0).setDepth(5000).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0, 0);
    const pauseText = this.add.text(W / 2, H / 2 - 10, '⏸ Paused', {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: '#ffffff',
      fontStyle: 'bold', stroke: '#222', strokeThickness: 4
    }).setOrigin(0.5);
    const hint = this.add.text(W / 2, H / 2 + 40, 'Press SPACE to resume', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#d0d8e0'
    }).setOrigin(0.5);
    this._pauseOverlay.add([dim, pauseText, hint]);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('resourcesChanged', this._onResourcesChanged, this);
      this.game.events.off('populationChanged', this._onPopulationChanged, this);
      this.game.events.off('selectionChanged', this.refreshSelection, this);
    });
  }

  setPauseOverlay(on) {
    if (this._pauseOverlay) this._pauseOverlay.setVisible(on);
  }

  /* ---------------- minimap ---------------- */

  _createMinimap() {
    const MINI_SIZE = 180;
    const margin = 16;
    const x = this.W - margin - MINI_SIZE;
    const y = this.H - BOTTOM_H - margin - MINI_SIZE;
    this._minimapX = x;
    this._minimapY = y;
    this._minimapSize = MINI_SIZE;

    this.add.rectangle(x, y, MINI_SIZE, MINI_SIZE, 0x000000, 0.7)
      .setOrigin(0, 0).setStrokeStyle(2, 0xffffff).setDepth(5);

    this._minimapGfx = this.add.graphics().setDepth(6);

    // Interactive hit zone
    const hit = this.add.rectangle(x, y, MINI_SIZE, MINI_SIZE, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p, _lx, _ly, event) => {
      if (event) event.stopPropagation();
      this._onMinimapClick(p);
    });
    hit.on('pointermove', (p) => {
      if (p.isDown) this._onMinimapClick(p);
    });
  }

  _onMinimapClick(pointer) {
    const lx = pointer.x - this._minimapX;
    const ly = pointer.y - this._minimapY;
    if (lx < 0 || lx > this._minimapSize || ly < 0 || ly > this._minimapSize) return;
    const wx = (lx / this._minimapSize) * WORLD_W;
    const wy = (ly / this._minimapSize) * WORLD_H;
    const gs = this.scene.get('GameScene');
    if (gs && gs.cameras && gs.cameras.main) gs.cameras.main.centerOn(wx, wy);
  }

  _updateMinimap() {
    const g = this._minimapGfx;
    if (!g) return;
    g.clear();

    const gs = this.scene.get('GameScene');
    if (!gs || !gs.world) return;
    const world = gs.world;

    const ox = this._minimapX;
    const oy = this._minimapY;
    const cell = this._minimapSize / GRID_W; // 3 for 180/60
    const fog = gameState.fogOfWar?.blue;
    const fogOff = isFogDisabled();

    // Terrain + features
    for (let y = 0; y < GRID_H; y++) {
      const row = world.map[y];
      for (let x = 0; x < GRID_W; x++) {
        const c = row[x];
        const st = fogOff ? FOW_VISIBLE : (fog ? fog[y][x] : FOW_UNSEEN);
        let color;
        if (st === FOW_UNSEEN) {
          color = 0x000000;
        } else {
          if (c.type === CELL_TYPES.WATER) color = 0x1e4a8a;
          else if (c.type === CELL_TYPES.MOUNTAIN) color = 0x555555;
          else if (c.feature === FEATURES.TREE) color = 0x4a8a3c;
          else if (c.feature === FEATURES.APPLE) color = 0xb23a3a;
          else if (c.feature === FEATURES.GOLD) color = 0xdfaf2a;
          else color = 0x2d5c2d;
          if (st === FOW_EXPLORED) color = _dim(color);
        }
        g.fillStyle(color, 1);
        g.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }

    // Buildings (blocks)
    for (const b of gameState.buildings) {
      if (b.destroyed) continue;
      if (b.team !== 'blue' && !fogOff) {
        const any = b.tiles.some(t => (fog ? fog[t.y][t.x] : FOW_UNSEEN) !== FOW_UNSEEN);
        if (!any) continue;
      }
      g.fillStyle(b.team === 'blue' ? 0x4488ff : 0xff4444, 1);
      g.fillRect(ox + b.gridX * cell, oy + b.gridY * cell, b.footprint * cell, b.footprint * cell);
    }

    // Units (small dots)
    const dotSz = 2;
    for (const v of gameState.villagers) {
      if (v.destroyed) continue;
      if (v.team !== 'blue' && !fogOff) {
        if ((fog ? fog[v.gridY][v.gridX] : FOW_UNSEEN) !== FOW_VISIBLE) continue;
      }
      g.fillStyle(v.team === 'blue' ? 0x66aaff : 0xff6666, 1);
      g.fillRect(ox + v.gridX * cell, oy + v.gridY * cell, dotSz, dotSz);
    }
    for (const s of gameState.soldiers) {
      if (s.destroyed) continue;
      if (s.team !== 'blue' && !fogOff) {
        if ((fog ? fog[s.gridY][s.gridX] : FOW_UNSEEN) !== FOW_VISIBLE) continue;
      }
      g.fillStyle(s.team === 'blue' ? 0x99bbff : 0xff6666, 1);
      g.fillRect(ox + s.gridX * cell, oy + s.gridY * cell, dotSz, dotSz);
    }

    // Camera viewport rectangle
    const cam = gs.cameras.main;
    const vx = ox + (cam.scrollX / WORLD_W) * this._minimapSize;
    const vy = oy + (cam.scrollY / WORLD_H) * this._minimapSize;
    const vw = (cam.width / WORLD_W) * this._minimapSize;
    const vh = (cam.height / WORLD_H) * this._minimapSize;
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(vx, vy, vw, vh);
  }

  /* ---------------- tooltips ---------------- */

  _attachTooltip(target, text) {
    let timer = null;
    let tip = null;
    const clear = () => {
      if (timer) { timer.remove(); timer = null; }
      if (tip) { const t = tip; tip = null; this.tweens.add({ targets: t, alpha: 0, duration: 100, onComplete: () => t.destroy() }); }
    };
    target.on('pointerover', (pointer) => {
      clear();
      timer = this.time.delayedCall(500, () => {
        timer = null;
        const c = this.add.container(0, 0).setDepth(4500);
        c.alpha = 0;
        const txt = this.add.text(6, 4, text, {
          fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ffffff'
        }).setOrigin(0, 0);
        const bg = this.add.rectangle(0, 0, txt.width + 12, txt.height + 8, 0x000000, 0.85)
          .setOrigin(0, 0).setStrokeStyle(1, 0xffe066, 0.4);
        c.add([bg, txt]);
        // Position above target
        const bounds = target.getBounds ? target.getBounds() : null;
        const px = (bounds ? bounds.x + bounds.width / 2 : pointer.x) - (txt.width + 12) / 2;
        const py = (bounds ? bounds.y : pointer.y) - (txt.height + 12);
        c.setPosition(Math.max(4, px), Math.max(4, py));
        tip = c;
        this.tweens.add({ targets: c, alpha: 1, duration: 150 });
      });
    });
    target.on('pointerout', clear);
    target.on('pointerdown', clear);
  }

  update(_time, delta) {
    gameState.elapsedTime += delta / 1000;
    const total = Math.floor(gameState.elapsedTime);
    const mm = Math.floor(total / 60).toString();
    const ss = (total % 60).toString().padStart(2, '0');
    this.timerText.setText(`⏱ ${mm}:${ss}`);

    // Refresh progress bars if a building is selected
    if (gameState.selected?.kind === 'building') {
      const b = gameState.selected.building;
      if (this._trainProgressBar) {
        this._trainProgressBar.width = Math.max(1, 160 * (b.trainingProgress || 0));
      }
      if (this._trainQueueText) {
        this._trainQueueText.setText(`Queue: ${b.trainingQueue.length}/5`);
      }
      if (this._upgradeProgressBar) {
        this._upgradeProgressBar.width = Math.max(1, 190 * (b.upgradeProgress || 0));
      }
      if (this._researchProgressBar) {
        this._researchProgressBar.width = Math.max(1, 190 * (b.researchProgress || 0));
      }
    }
  }

  _onResourcesChanged() {
    this.refreshResources();
    // Affordability of build buttons may have changed
    if (gameState.selected?.kind === 'units' || gameState.selected?.kind === 'building') {
      this._renderBottomBar(gameState.selected);
    }
  }

  _onPopulationChanged() {
    this.refreshPopulation();
    if (gameState.selected?.kind === 'building') {
      this._renderBottomBar(gameState.selected);
    }
  }

  refreshResources() {
    this.woodText.setText(`🪵 Wood: ${gameState.wood}`);
    this.foodText.setText(`🍎 Food: ${gameState.food}`);
    this.goldText.setText(`🪙 Gold: ${gameState.gold}`);
  }

  refreshPopulation() {
    this.popText.setText(`👶 Villagers: ${gameState.villagers.length}/${gameState.villagerCap}`);
  }

  refreshSelection(sel) {
    this._renderBottomBar(sel);
  }

  /* ---------------- Bottom bar rendering ---------------- */

  _clearBottom() {
    this.bottomContainer.removeAll(true);
    this._trainProgressBar = null;
    this._trainQueueText = null;
    this._upgradeProgressBar = null;
    this._researchProgressBar = null;
  }

  _renderBottomBar(sel) {
    this._clearBottom();

    if (!sel) {
      this.bottomContainer.add(
        this.add.text(this.W / 2, BOTTOM_H / 2, 'No selection', {
          ...TEXT_STYLE, color: '#eaeaea'
        }).setOrigin(0.5)
      );
      return;
    }

    if (sel.kind === 'tile') {
      const parts = [sel.type];
      if (sel.feature) parts.push(sel.feature);
      if (sel.occupant) parts.push(sel.occupant);
      this.bottomContainer.add([
        this.add.text(this.W / 2, 28, `Tile (${sel.x}, ${sel.y})`, TEXT_STYLE).setOrigin(0.5),
        this.add.text(this.W / 2, 60, parts.join(' · '), SUBTLE_STYLE).setOrigin(0.5)
      ]);
      return;
    }

    if (sel.kind === 'units') {
      const list = sel.list;
      const villagers = list.filter(u => u.kind === 'villager');
      const soldiers = list.filter(u => u.kind === 'soldier');
      let title;
      if (list.length === 1) {
        const u = list[0];
        title = u.kind === 'villager' ? `Villager v${u.id}` : `Guard g${u.id}`;
      } else {
        const parts = [];
        if (villagers.length) parts.push(`${villagers.length} villager${villagers.length > 1 ? 's' : ''}`);
        if (soldiers.length) parts.push(`${soldiers.length} guard${soldiers.length > 1 ? 's' : ''}`);
        title = parts.join(' + ');
      }
      this.bottomContainer.add(
        this.add.text(12, 10, title, { ...TEXT_STYLE, fontSize: '18px' })
      );

      if (villagers.length > 0) {
        let x = 12;
        const btnY = 40;
        for (const id of BUILDABLE_IDS) {
          if (id === 'castle' && !this._canBuildCastle()) continue;
          const def = BUILDING_TYPES[id];
          const btn = this._makeBuildButton(x, btnY, def);
          this.bottomContainer.add(btn);
          x += 144;
        }
        this.bottomContainer.add(
          this.add.text(this.W - 16, 14, 'ESC to cancel placement', {
            ...SUBTLE_STYLE, fontSize: '13px', color: '#9ab'
          }).setOrigin(1, 0)
        );
      } else {
        this.bottomContainer.add(
          this.add.text(12, 44, 'Right-click an enemy to attack · Right-click ground to move',
            { ...SUBTLE_STYLE, color: '#9ab' })
        );
      }
      return;
    }

    if (sel.kind === 'building') {
      const b = sel.building;
      const statusBits = [];
      if (b.underConstruction) statusBits.push('building…');
      if (b.isUpgrading) statusBits.push('upgrading…');
      if (b.isResearching) statusBits.push('researching…');
      const statusStr = statusBits.length ? ` (${statusBits.join(', ')})` : '';
      this.bottomContainer.add([
        this.add.text(12, 10, `${b.typeDef.icon} ${b.typeDef.label}${statusStr}`, { ...TEXT_STYLE, fontSize: '18px' }),
        this.add.text(12, 34, `HP: ${b.hp}/${b.maxHp}`, SUBTLE_STYLE)
      ]);

      let x = 12;
      const btnY = 60;

      if (b.typeDef.effects?.trains && !b.underConstruction) {
        const btn = this._makeTrainUnitButton(b, x, btnY);
        this.bottomContainer.add(btn);
        x += 200;
        this._trainQueueText = this.add.text(x, btnY + 8, `Queue: ${b.trainingQueue.length}/5`, SUBTLE_STYLE);
        this.bottomContainer.add(this._trainQueueText);
        x += 100;
      }

      if (b.typeDef.effects?.upgradesTo && !b.underConstruction && b.team === 'blue') {
        const btn = this._makeUpgradeButton(b, x, btnY);
        this.bottomContainer.add(btn);
        x += 220;
      }

      if (b.typeDef.effects?.research && !b.underConstruction && b.team === 'blue'
          && !gameState.research[b.typeDef.effects.research.id]) {
        const btn = this._makeResearchButton(b, x, btnY);
        this.bottomContainer.add(btn);
      }

      return;
    }
  }

  _canBuildCastle() {
    const hasT2TC = gameState.buildings.some(b =>
      !b.destroyed && !b.underConstruction && b.team === 'blue' && b.type === 'town_center_t2');
    const hasCastle = gameState.buildings.some(b =>
      !b.destroyed && b.team === 'blue' && b.type === 'castle');
    return hasT2TC && !hasCastle;
  }

  showToast(message, durationMs = 2000, tintColor = 0xffdd44) {
    const y0 = -44;
    const t = this.add.container(this.W / 2, y0).setDepth(3000);
    const textObj = this.add.text(0, 0, message, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);
    const padding = 16;
    const bgWidth = Math.max(280, textObj.width + padding * 2);
    const bg = this.add.rectangle(0, 0, bgWidth, 40, 0x000000, 0.85)
      .setStrokeStyle(2, tintColor, 0.95);
    t.add([bg, textObj]);
    this.tweens.add({
      targets: t, y: 70, duration: 280, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.time.delayedCall(durationMs, () => {
          this.tweens.add({
            targets: t, y: y0, duration: 280, ease: 'Cubic.easeIn',
            onComplete: () => t.destroy()
          });
        });
      }
    });
  }

  _makeBuildButton(x, y, def) {
    const container = this.add.container(x, y);
    const affordable = canAffordWith(def.cost, gameState);
    const fill = affordable ? 0x3a3a3a : 0x1a1a1a;
    const stroke = affordable ? 0x99aacc : 0x555555;
    const textColor = affordable ? '#ffffff' : '#888888';

    const bg = this.add.rectangle(0, 0, 136, 48, fill, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(1, stroke);

    const label = this.add.text(68, 10, `${def.icon} ${def.label}`, {
      ...TEXT_STYLE, fontSize: '16px', color: textColor
    }).setOrigin(0.5, 0);

    const costStr = formatCost(def.cost);
    const costText = this.add.text(68, 30, costStr, {
      ...SUBTLE_STYLE, fontSize: '13px', color: textColor
    }).setOrigin(0.5, 0);

    container.add([bg, label, costText]);

    bg.setInteractive({ useHandCursor: true });
    this._attachTooltip(bg, `${def.label} — ${formatCost(def.cost)}`);
    if (affordable) {
      bg.on('pointerover', () => bg.setFillStyle(0x55667a, 0.95));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.9));
      bg.on('pointerdown', (pointer, _lx, _ly, event) => {
        if (event) event.stopPropagation();
        const gameScene = this.scene.get('GameScene');
        gameScene.enterPlacementMode(def.id);
      });
    }
    return container;
  }

  _makeUpgradeButton(building, x, y) {
    const container = this.add.container(x, y);
    const cost = building.typeDef.effects.upgradeCost;
    const canUp = building.canUpgrade();
    const fill = canUp ? 0x3a3a3a : 0x1a1a1a;
    const stroke = canUp ? 0xffdd44 : 0x555555;
    const textColor = canUp ? '#ffeeaa' : '#888888';

    const bg = this.add.rectangle(0, 0, 210, 30, fill, 0.9).setOrigin(0, 0).setStrokeStyle(1, stroke);
    const label = this.add.text(105, 6, `⬆️ Upgrade to T2  ${formatCost(cost)}`, {
      ...TEXT_STYLE, fontSize: '14px', color: textColor
    }).setOrigin(0.5, 0);

    const barBg = this.add.rectangle(10, 25, 190, 3, 0x222222, 0.9).setOrigin(0, 0.5);
    const bar = this.add.rectangle(10, 25, 1, 3, 0xffdd44).setOrigin(0, 0.5);
    container.add([bg, label, barBg, bar]);
    this._upgradeProgressBar = bar;
    this._upgradeBuildingRef = building;

    bg.setInteractive({ useHandCursor: true });
    this._attachTooltip(bg, `Upgrade to Tier 2 — ${formatCost(cost)}`);
    if (canUp) {
      bg.on('pointerover', () => bg.setFillStyle(0x55667a, 0.95));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.9));
      bg.on('pointerdown', (pointer, _lx, _ly, event) => {
        if (event) event.stopPropagation();
        building.startUpgrade();
      });
    }
    return container;
  }

  _makeResearchButton(building, x, y) {
    const container = this.add.container(x, y);
    const r = building.typeDef.effects.research;
    const canR = building.canResearch();
    const fill = canR ? 0x3a3a3a : 0x1a1a1a;
    const stroke = canR ? 0xffdd44 : 0x555555;
    const textColor = canR ? '#ffeeaa' : '#888888';

    const bg = this.add.rectangle(0, 0, 210, 30, fill, 0.9).setOrigin(0, 0).setStrokeStyle(1, stroke);
    const label = this.add.text(105, 6, `🛡️ Research Knight  ${formatCost(r.cost)}`, {
      ...TEXT_STYLE, fontSize: '14px', color: textColor
    }).setOrigin(0.5, 0);

    const barBg = this.add.rectangle(10, 25, 190, 3, 0x222222, 0.9).setOrigin(0, 0.5);
    const bar = this.add.rectangle(10, 25, 1, 3, 0xffdd44).setOrigin(0, 0.5);
    container.add([bg, label, barBg, bar]);
    this._researchProgressBar = bar;

    bg.setInteractive({ useHandCursor: true });
    this._attachTooltip(bg, `Research Knight — ${formatCost(r.cost)}. Upgrades all guards.`);
    if (canR) {
      bg.on('pointerover', () => bg.setFillStyle(0x55667a, 0.95));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.9));
      bg.on('pointerdown', (pointer, _lx, _ly, event) => {
        if (event) event.stopPropagation();
        building.startResearch();
      });
    }
    return container;
  }

  _makeTrainUnitButton(building, x, y) {
    const container = this.add.container(x, y);
    const def = building.trainableUnitDef();
    const canQueue = building.canQueueUnit();
    const fill = canQueue ? 0x3a3a3a : 0x1a1a1a;
    const stroke = canQueue ? 0x99aacc : 0x555555;
    const textColor = canQueue ? '#ffffff' : '#888888';

    const bg = this.add.rectangle(0, 0, 180, 30, fill, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(1, stroke);

    const label = this.add.text(90, 6, `${def.icon} Train ${def.label}  ${formatCost(def.cost)}`, {
      ...TEXT_STYLE, fontSize: '14px', color: textColor
    }).setOrigin(0.5, 0);

    const barBg = this.add.rectangle(10, 25, 160, 3, 0x222222, 0.9).setOrigin(0, 0.5);
    this._trainProgressBar = this.add.rectangle(10, 25, 1, 3, 0x80ff80).setOrigin(0, 0.5);

    container.add([bg, label, barBg, this._trainProgressBar]);

    bg.setInteractive({ useHandCursor: true });
    this._attachTooltip(bg, `Train ${def.label} — ${formatCost(def.cost)}`);
    if (canQueue) {
      bg.on('pointerover', () => bg.setFillStyle(0x55667a, 0.95));
      bg.on('pointerout', () => bg.setFillStyle(fill, 0.9));
      bg.on('pointerdown', (pointer, _lx, _ly, event) => {
        if (event) event.stopPropagation();
        building.queueUnit();
      });
    }
    return container;
  }
}
