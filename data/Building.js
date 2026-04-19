import Phaser from 'phaser';
import { TILE_SIZE } from './constants.js';
import { gameState } from './gameState.js';
import { UNIT_DEFS, BUILDING_TYPES, canAffordWith, spend } from './buildings.js';
import { econFor } from './gameState.js';

const QUEUE_MAX = 5;

export class Building {
  constructor(scene, typeDef, gridX, gridY, opts = {}) {
    this.scene = scene;
    this.kind = 'building';
    this.typeDef = typeDef;
    this.type = typeDef.id;
    this.gridX = gridX;
    this.gridY = gridY;
    this.footprint = typeDef.footprint;
    this.team = opts.team || 'blue';
    this.maxHp = typeDef.hp;
    this.hp = opts.alreadyBuilt ? this.maxHp : 1;
    this.underConstruction = !opts.alreadyBuilt;
    this.destroyed = false;

    this.tiles = [];
    for (let dy = 0; dy < this.footprint; dy++) {
      for (let dx = 0; dx < this.footprint; dx++) {
        this.tiles.push({ x: gridX + dx, y: gridY + dy });
      }
    }

    const centerPx = (gridX + this.footprint / 2) * TILE_SIZE;
    const centerPy = (gridY + this.footprint / 2) * TILE_SIZE;
    const displaySize = this.footprint * TILE_SIZE * typeDef.spriteScale;
    this.centerX = centerPx;
    this.centerY = centerPy;

    this.sprite = scene.add.image(centerPx, centerPy, typeDef.sprite)
      .setDisplaySize(displaySize, displaySize)
      .setDepth(40);

    if (this.team === 'red') {
      this.sprite.setTint(0xff4444);
    }

    // Under-building team ribbon: 24px × 4px at bottom edge
    const ribbonColor = this.team === 'blue' ? 0x4488ff : 0xff4444;
    const ribbonY = (gridY + this.footprint) * TILE_SIZE - 2;
    this.teamRibbon = scene.add.rectangle(centerPx, ribbonY, 28, 5, ribbonColor, 0.75)
      .setStrokeStyle(1, 0x000000, 0.4)
      .setDepth(39);

    if (this.underConstruction) {
      this.sprite.setAlpha(0.45);
      const topY = gridY * TILE_SIZE + 6;
      this.progressBg = scene.add.rectangle(centerPx, topY, 60, 6, 0x000000, 0.7).setDepth(90);
      this.progressBar = scene.add.rectangle(centerPx - 28, topY, 2, 4, 0x80ff80)
        .setOrigin(0, 0.5).setDepth(91);
    }

    // Health bar (hidden at full HP)
    const hbY = gridY * TILE_SIZE - 6;
    this.hpBg = scene.add.rectangle(centerPx, hbY, 52, 5, 0x000000, 0.75)
      .setDepth(92).setVisible(false);
    this.hpBar = scene.add.rectangle(centerPx - 24, hbY, 48, 3, 0x44ff44)
      .setOrigin(0, 0.5).setDepth(93).setVisible(false);

    for (const t of this.tiles) {
      scene.world.map[t.y][t.x].occupant = this;
    }

    this.trainingQueue = [];
    this.trainingProgress = 0;
    this.isUpgrading = false;
    this.upgradeProgress = 0;
    this.isResearching = false;
    this.researchProgress = 0;
    if (this._canTrain()) this._createTrainingUI();

    // Gold glow for T2 Barracks
    if (typeDef.hasGlow) this._addGlow();
  }

  _addGlow() {
    if (this.glow) return;
    const glowSize = this.footprint * TILE_SIZE + 16;
    this.glow = this.scene.add.rectangle(this.centerX, this.centerY, glowSize, glowSize, 0xffdd44, 0.15)
      .setDepth(38);
    this.scene.tweens.add({
      targets: this.glow, alpha: { from: 0.1, to: 0.25 },
      duration: 1200, yoyo: true, repeat: -1
    });
  }

  _canTrain() {
    return !!(this.typeDef.effects && this.typeDef.effects.trains);
  }

  hitTest(worldX, worldY) {
    const halfW = this.footprint * TILE_SIZE / 2;
    return worldX >= this.centerX - halfW &&
           worldX <= this.centerX + halfW &&
           worldY >= this.centerY - halfW &&
           worldY <= this.centerY + halfW;
  }

  setConstructionProgress(p) {
    if (!this.underConstruction) return;
    const clamped = Math.max(0, Math.min(1, p));
    this.sprite.setAlpha(0.45 + 0.55 * clamped);
    if (this.progressBar) this.progressBar.width = 2 + 56 * clamped;
    if (clamped >= 1) this._completeConstruction();
  }

  _completeConstruction() {
    if (!this.underConstruction) return;
    this.underConstruction = false;
    this.hp = this.maxHp;
    this.sprite.setAlpha(1);
    if (this.progressBg) { this.progressBg.destroy(); this.progressBg = null; }
    if (this.progressBar) { this.progressBar.destroy(); this.progressBar = null; }

    const fx = this.typeDef.effects || {};
    if (fx.villagerCapBonus) {
      gameState.villagerCap += fx.villagerCapBonus;
      this.scene.game.events.emit('populationChanged');
    }
    if (this._canTrain()) this._createTrainingUI();

    this.scene.emitSparkles(this.centerX, this.centerY);
    this.scene.game.events.emit('buildingCompleted', this);
  }

  /* ---------------- Training (generic: TC/Barracks) ---------------- */

  _createTrainingUI() {
    if (this._trainingDots) return;
    this._trainingDots = [];
    const startX = this.centerX - (QUEUE_MAX - 1) * 6;
    const y = this.gridY * TILE_SIZE - 14;
    for (let i = 0; i < QUEUE_MAX; i++) {
      const dot = this.scene.add.circle(startX + i * 12, y, 4, 0x666666, 0.8)
        .setStrokeStyle(1, 0x222222)
        .setDepth(95)
        .setVisible(false);
      this._trainingDots.push(dot);
    }
  }

  _refreshTrainingDots() {
    if (!this._trainingDots) return;
    const anyQueued = this.trainingQueue.length > 0;
    for (let i = 0; i < this._trainingDots.length; i++) {
      const d = this._trainingDots[i];
      d.setVisible(anyQueued);
      if (i < this.trainingQueue.length) {
        d.setFillStyle(i === 0 ? 0xffe066 : 0x99ccff, 0.95);
      } else {
        d.setFillStyle(0x444444, 0.6);
      }
    }
  }

  trainableUnitDef() {
    if (!this._canTrain()) return null;
    let id = this.typeDef.effects.trains;
    // If Knight research complete, barracks train Knights instead of Guards
    if (id === 'guard' && gameState.research?.knight && this.team === 'blue') id = 'knight';
    return UNIT_DEFS[id];
  }

  canQueueUnit() {
    if (this.underConstruction || this.destroyed) return false;
    if (!this._canTrain()) return false;
    if (this.isUpgrading || this.isResearching) return false;
    if (this.trainingQueue.length >= QUEUE_MAX) return false;
    const def = this.trainableUnitDef();
    const econ = econFor(this.team);
    if (!canAffordWith(def.cost, econ)) return false;
    if (def.affectsCap) {
      const ownVillagers = gameState.villagers.filter(v => v.team === this.team).length;
      const queuedVillagers = this.trainingQueue.filter(q => q.type === 'villager').length;
      if (ownVillagers + queuedVillagers >= econ.villagerCap) return false;
    }
    return true;
  }

  queueUnit() {
    if (!this.canQueueUnit()) return false;
    const def = this.trainableUnitDef();
    spend(def.cost, econFor(this.team));
    this.scene.game.events.emit('resourcesChanged');
    const speedMult = this.typeDef.trainSpeedMult || 1;
    this.trainingQueue.push({ type: def.id, durationMs: def.trainMs / speedMult });
    this._refreshTrainingDots();
    if (this.trainingQueue.length === 1) this._startNextTraining();
    this.scene.game.events.emit('selectionChanged', gameState.selected);
    return true;
  }

  _startNextTraining() {
    if (this.trainingQueue.length === 0) return;
    const entry = this.trainingQueue[0];
    this.trainingProgress = 0;
    this._trainTween = this.scene.tweens.addCounter({
      from: 0, to: 1,
      duration: entry.durationMs,
      onUpdate: (t) => { this.trainingProgress = t.getValue(); },
      onComplete: () => {
        this.trainingQueue.shift();
        this.trainingProgress = 0;
        this._refreshTrainingDots();
        if (entry.type === 'villager') {
          this.scene._spawnVillagerAt(this);
          if (this.team === 'blue') gameState.stats.villagersTrained++;
        } else if (entry.type === 'guard') {
          this.scene._spawnSoldierAt(this, { isKnight: false });
        } else if (entry.type === 'knight') {
          this.scene._spawnSoldierAt(this, { isKnight: true });
        }
        this.scene.game.events.emit('selectionChanged', gameState.selected);
        this._startNextTraining();
      }
    });
  }

  /* ---------------- Upgrades ---------------- */

  canUpgrade() {
    if (this.underConstruction || this.destroyed) return false;
    if (this.team !== 'blue') return false; // Red never upgrades in current plan
    if (this.isUpgrading || this.isResearching) return false;
    if (this.trainingQueue.length > 0) return false;
    const upId = this.typeDef.effects?.upgradesTo;
    if (!upId) return false;
    const cost = this.typeDef.effects.upgradeCost;
    return canAffordWith(cost, econFor(this.team));
  }

  startUpgrade() {
    if (!this.canUpgrade()) return false;
    const upId = this.typeDef.effects.upgradesTo;
    const cost = this.typeDef.effects.upgradeCost;
    const durationMs = this.typeDef.effects.upgradeTimeMs;
    spend(cost, econFor(this.team));
    this.scene.game.events.emit('resourcesChanged');

    this.isUpgrading = true;
    this.upgradeProgress = 0;
    const barY = this.gridY * TILE_SIZE - 6;
    this._upgradeBarBg = this.scene.add.rectangle(this.centerX, barY, 52, 5, 0x000000, 0.7).setDepth(92);
    this._upgradeBar = this.scene.add.rectangle(this.centerX - 24, barY, 2, 4, 0xffdd44)
      .setOrigin(0, 0.5).setDepth(93);

    this._upgradeTween = this.scene.tweens.addCounter({
      from: 0, to: 1,
      duration: durationMs,
      onUpdate: (t) => {
        this.upgradeProgress = t.getValue();
        if (this._upgradeBar) this._upgradeBar.width = 2 + 48 * this.upgradeProgress;
      },
      onComplete: () => {
        this._completeUpgrade(upId);
      }
    });
    this.scene.game.events.emit('selectionChanged', gameState.selected);
    return true;
  }

  _completeUpgrade(upId) {
    const newDef = BUILDING_TYPES[upId];
    if (!newDef) return;

    const hpRatio = this.hp / this.maxHp;
    const oldCapBonus = this.typeDef.effects?.villagerCapBonus || 0;
    const newCapBonus = newDef.effects?.villagerCapBonus || 0;
    const capDelta = newCapBonus - oldCapBonus;

    this.typeDef = newDef;
    this.type = newDef.id;
    this.maxHp = newDef.hp;
    this.hp = Math.max(1, Math.round(newDef.hp * hpRatio));

    const displaySize = this.footprint * TILE_SIZE * newDef.spriteScale;
    this.sprite.setTexture(newDef.sprite).setDisplaySize(displaySize, displaySize);
    if (this.team === 'red') this.sprite.setTint(0xff4444);

    if (capDelta && this.team === 'blue') {
      gameState.villagerCap += capDelta;
      this.scene.game.events.emit('populationChanged');
    } else if (capDelta && this.team === 'red') {
      gameState.red.villagerCap += capDelta;
    }

    if (newDef.hasGlow && !this.glow) this._addGlow();

    this.isUpgrading = false;
    this.upgradeProgress = 0;
    if (this._upgradeTween) { this._upgradeTween.stop(); this._upgradeTween = null; }
    if (this._upgradeBar) { this._upgradeBar.destroy(); this._upgradeBar = null; }
    if (this._upgradeBarBg) { this._upgradeBarBg.destroy(); this._upgradeBarBg = null; }

    this.scene.emitSparkles(this.centerX, this.centerY);
    this.scene.game.events.emit('buildingUpgraded', this);
    this.scene.game.events.emit('selectionChanged', gameState.selected);
  }

  /* ---------------- Research ---------------- */

  canResearch() {
    if (this.underConstruction || this.destroyed) return false;
    if (this.team !== 'blue') return false;
    if (this.isUpgrading || this.isResearching) return false;
    const r = this.typeDef.effects?.research;
    if (!r) return false;
    if (gameState.research[r.id]) return false;
    return canAffordWith(r.cost, econFor(this.team));
  }

  startResearch() {
    if (!this.canResearch()) return false;
    const r = this.typeDef.effects.research;
    spend(r.cost, econFor(this.team));
    this.scene.game.events.emit('resourcesChanged');

    this.isResearching = true;
    this.researchProgress = 0;
    const barY = this.gridY * TILE_SIZE - 6;
    this._upgradeBarBg = this.scene.add.rectangle(this.centerX, barY, 52, 5, 0x000000, 0.7).setDepth(92);
    this._upgradeBar = this.scene.add.rectangle(this.centerX - 24, barY, 2, 4, 0xffdd44)
      .setOrigin(0, 0.5).setDepth(93);

    this._upgradeTween = this.scene.tweens.addCounter({
      from: 0, to: 1,
      duration: r.timeMs,
      onUpdate: (t) => {
        this.researchProgress = t.getValue();
        if (this._upgradeBar) this._upgradeBar.width = 2 + 48 * this.researchProgress;
      },
      onComplete: () => {
        gameState.research[r.id] = true;
        if (r.id === 'knight') this.scene.applyKnightUpgradeToAllSoldiers?.();
        this.isResearching = false;
        this.researchProgress = 0;
        if (this._upgradeBar) { this._upgradeBar.destroy(); this._upgradeBar = null; }
        if (this._upgradeBarBg) { this._upgradeBarBg.destroy(); this._upgradeBarBg = null; }
        this.scene.emitSparkles(this.centerX, this.centerY);
        this.scene.game.events.emit('selectionChanged', gameState.selected);
      }
    });
    this.scene.game.events.emit('selectionChanged', gameState.selected);
    return true;
  }

  /* ---------------- Combat ---------------- */

  takeDamage(amount, _attacker) {
    if (this.destroyed) return;
    this.hp = Math.max(0, this.hp - amount);
    this._updateHealthBar();
    if (this.hp <= 0) this._die();
  }

  _updateHealthBar() {
    const ratio = this.hp / this.maxHp;
    const visible = ratio < 1 && !this.underConstruction;
    this.hpBg.setVisible(visible);
    this.hpBar.setVisible(visible);
    if (visible) {
      this.hpBar.width = Math.max(1, 48 * ratio);
      const color = ratio > 0.66 ? 0x44ff44 : ratio > 0.33 ? 0xffdd00 : 0xff4040;
      this.hpBar.setFillStyle(color);
    }
  }

  _die() {
    if (this.destroyed) return;
    this.destroyed = true;

    // Shake
    this.scene.tweens.add({
      targets: this.sprite,
      x: { from: this.centerX - 4, to: this.centerX + 4 },
      duration: 60,
      repeat: 10,
      yoyo: true
    });

    // Smoke particles
    if (!this.scene.textures.exists('pixel4')) {
      const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel4', 4, 4); g.destroy();
    }
    const emitter = this.scene.add.particles(this.centerX, this.centerY, 'pixel4', {
      tint: [0x888888, 0xaaaaaa, 0x666666],
      speed: { min: 40, max: 110 },
      angle: { min: 200, max: 340 },
      gravityY: -80,
      lifespan: 800,
      scale: { start: 2, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      emitting: false
    });
    emitter.setDepth(210);
    emitter.explode(30);
    this.scene.time.delayedCall(900, () => emitter.destroy());

    // Fade out
    this.scene.tweens.add({
      targets: [this.sprite, this.hpBg, this.hpBar],
      alpha: 0,
      duration: 600,
      delay: 200,
      onComplete: () => this._finalizeDestroy()
    });
  }

  _finalizeDestroy() {
    this.sprite.destroy();
    if (this.glow) this.glow.destroy();
    if (this.teamRibbon) this.teamRibbon.destroy();
    if (this.progressBg) this.progressBg.destroy();
    if (this.progressBar) this.progressBar.destroy();
    this.hpBg.destroy();
    this.hpBar.destroy();
    if (this._trainingDots) for (const d of this._trainingDots) d.destroy();
    if (this._trainTween) this._trainTween.stop();
    if (this._upgradeTween) this._upgradeTween.stop();
    if (this._upgradeBar) this._upgradeBar.destroy();
    if (this._upgradeBarBg) this._upgradeBarBg.destroy();
    for (const t of this.tiles) {
      const cell = this.scene.world.map[t.y]?.[t.x];
      if (cell && cell.occupant === this) cell.occupant = null;
    }
    const idx = gameState.buildings.indexOf(this);
    if (idx >= 0) gameState.buildings.splice(idx, 1);

    // Cleanup: if this was a House, reduce the villagerCap it contributed
    const capBonus = this.typeDef.effects?.villagerCapBonus;
    if (capBonus && this.team === 'blue') {
      gameState.villagerCap = Math.max(0, gameState.villagerCap - capBonus);
      this.scene.game.events.emit('populationChanged');
    } else if (capBonus && this.team === 'red') {
      if (gameState.red) gameState.red.villagerCap = Math.max(0, gameState.red.villagerCap - capBonus);
    }

    // Check for last TC loss
    if (this.type === 'town_center' || this.type === 'town_center_t2') {
      const remainingTCs = gameState.buildings.filter(b =>
        (b.type === 'town_center' || b.type === 'town_center_t2') && b.team === this.team
      ).length;
      if (remainingTCs === 0) {
        this.scene.onTeamDefeated?.(this.team);
      }
    }

    this.scene.game.events.emit('buildingDestroyed', this);
  }

  destroy() {
    this._finalizeDestroy();
  }
}

export { QUEUE_MAX };
