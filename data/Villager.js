import Phaser from 'phaser';
import { TILE_SIZE, GRID_W, GRID_H } from './constants.js';
import { findPathAdjacent, findPathAdjacentAny } from '../systems/pathfinding.js';
import { gameState, econFor, isSpeedBoosted } from './gameState.js';
import * as audio from '../systems/audio.js';

const STEP_MS = 333;         // 3 tiles per second
const SELECT_RADIUS = 26;
const WORK_DURATION_MS = 2000;
const GATHER_PER_TRIP_BLUE = 5;
const GATHER_PER_TRIP_RED  = 4;  // 80% rate

const ICON_FRAME_WOOD = 2;   // findables sheet — log-ish
const ICON_FRAME_FOOD = 16;  // findables sheet — red apple-ish
const ICON_FRAME_GOLD = 1;   // findables sheet — yellow/gold ball

let nextId = 1;

export class Villager {
  constructor(scene, gridX, gridY, opts = {}) {
    this.scene = scene;
    this.kind = 'villager';
    this.team = opts.team || 'blue';
    this.id = nextId++;
    this.gridX = gridX;
    this.gridY = gridY;
    this.hp = 25;
    this.maxHp = 25;
    this.state = 'idle';       // idle | walking | working | carrying | dying
    this.inventory = null;
    this.facing = 'east';
    this.selected = false;
    this.destroyed = false;
    this.job = null;

    this._pathTween = null;
    this._workTimer = null;
    this._workParticleTimer = null;

    const px = gridX * TILE_SIZE + TILE_SIZE / 2;
    const py = gridY * TILE_SIZE + TILE_SIZE / 2;

    this.container = scene.add.container(px, py).setDepth(50);

    this.ring = scene.add.circle(0, 4, 22, 0xffe066, 0)
      .setStrokeStyle(2, 0xffe066)
      .setVisible(false);

    const diskColor = this.team === 'blue' ? 0x4488ff : 0xff4444;
    this.teamDisk = scene.add.ellipse(0, 22, 22, 8, diskColor, 0.6);

    this.sprite = scene.add.sprite(0, -4, 'villager_idle_east', 0);
    this.sprite.play('villager_idle_east');

    this.inventoryIcon = scene.add.image(0, -30, 'findables', 0)
      .setScale(0.7)
      .setVisible(false);

    this.hpBg = scene.add.rectangle(0, -30, 26, 5, 0x000000, 0.75).setVisible(false);
    this.hpBar = scene.add.rectangle(-12, -30, 24, 3, 0x44ff44)
      .setOrigin(0, 0.5).setVisible(false);

    this.label = scene.add.text(0, 22, `v${this.id}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5, 0).setVisible(false);

    this.container.add([this.teamDisk, this.ring, this.sprite, this.inventoryIcon, this.hpBg, this.hpBar, this.label]);
  }

  takeDamage(amount, _attacker) {
    if (this.destroyed || this.state === 'dying') return;
    this.hp = Math.max(0, this.hp - amount);
    this._updateHealthBar();
    if (this.hp <= 0) this._die();
  }

  _updateHealthBar() {
    const ratio = this.hp / this.maxHp;
    const visible = ratio < 1;
    this.hpBg.setVisible(visible);
    this.hpBar.setVisible(visible);
    if (visible) {
      this.hpBar.width = Math.max(1, 24 * ratio);
      const color = ratio > 0.66 ? 0x44ff44 : ratio > 0.33 ? 0xffdd00 : 0xff4040;
      this.hpBar.setFillStyle(color);
    }
  }

  _die() {
    this.state = 'dying';
    this.job = null;
    this.stopPath();
    if (this._workTimer) { this._workTimer.remove(); this._workTimer = null; }
    if (this._workParticleTimer) { this._workParticleTimer.remove(); this._workParticleTimer = null; }
    this.setSelected(false);
    this.scene.tweens.add({
      targets: this.container,
      angle: 180,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        this.destroyed = true;
        const idx = gameState.villagers.indexOf(this);
        if (idx >= 0) gameState.villagers.splice(idx, 1);
        if (this.team === 'red') gameState.stats.enemiesDefeated++;
        if (this.team === 'blue') this.scene.game.events.emit('populationChanged');
        this.container.destroy();
      }
    });
  }

  get pixelX() { return this.container.x; }
  get pixelY() { return this.container.y; }

  hitTest(worldX, worldY) {
    const dx = worldX - this.container.x;
    const dy = worldY - this.container.y;
    return (dx * dx + dy * dy) <= (SELECT_RADIUS * SELECT_RADIUS);
  }

  setSelected(on) {
    this.selected = on;
    this.ring.setVisible(on);
    this.label.setVisible(on);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this._refreshAnim();
  }

  setFacing(f) {
    if (f !== 'east' && f !== 'west') return;
    if (this.facing === f) return;
    this.facing = f;
    this._refreshAnim();
  }

  _refreshAnim() {
    const moving = this.state === 'walking' || this.state === 'carrying';
    const mode = moving ? 'walk' : 'idle';
    this.sprite.play(`villager_${mode}_${this.facing}`, true);
  }

  /* ---------------- Movement ---------------- */

  stopPath() {
    if (this._pathTween) {
      this._pathTween.stop();
      this._pathTween = null;
    }
  }

  moveAlongPath(path, onComplete, stateWhileMoving = 'walking') {
    this.stopPath();
    if (!path || path.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    this.setState(stateWhileMoving);
    let stepIndex = 0;

    const stepOnce = () => {
      if (stepIndex >= path.length) {
        this._pathTween = null;
        this.setState('idle');
        if (onComplete) onComplete();
        return;
      }
      const next = path[stepIndex];
      const dx = next.x - this.gridX;
      if (dx < 0) this.setFacing('west');
      else if (dx > 0) this.setFacing('east');

      this._pathTween = this.scene.tweens.add({
        targets: this.container,
        x: next.x * TILE_SIZE + TILE_SIZE / 2,
        y: next.y * TILE_SIZE + TILE_SIZE / 2,
        duration: STEP_MS,
        onComplete: () => {
          this.gridX = next.x;
          this.gridY = next.y;
          stepIndex++;
          stepOnce();
        }
      });
    };

    stepOnce();
  }

  /* ---------------- Jobs ---------------- */

  cancelJob() {
    this.stopPath();
    if (this._workTimer) { this._workTimer.remove(); this._workTimer = null; }
    if (this._workParticleTimer) { this._workParticleTimer.remove(); this._workParticleTimer = null; }
    this.job = null;
    this.setState(this.inventory ? 'carrying' : 'idle');
  }

  assignJob(job) {
    this.stopPath();
    if (this._workTimer) { this._workTimer.remove(); this._workTimer = null; }
    if (this._workParticleTimer) { this._workParticleTimer.remove(); this._workParticleTimer = null; }
    this.job = job;
    this._runJob();
  }

  _runJob() {
    if (!this.job) return;
    if (this.job.type === 'gather') this._runGather();
    else if (this.job.type === 'gather_building') this._runGatherBuilding();
    else if (this.job.type === 'build') this._runBuild();
  }

  _runGather() {
    const scene = this.scene;
    const { target, resourceType } = this.job;

    if (this.inventory) {
      this._deliverToTownCenter(() => this._runGather());
      return;
    }

    const cell = scene.world.map[target.y]?.[target.x];
    if (!cell || !cell.resourceAmount || cell.resourceAmount <= 0) {
      this.job = null;
      this.setState('idle');
      return;
    }

    const walkable = (x, y) => scene.isWalkable(x, y)
      || (x === this.gridX && y === this.gridY);
    const path = findPathAdjacent(
      { x: this.gridX, y: this.gridY },
      target, walkable, GRID_W, GRID_H
    );
    if (!path) { this.job = null; this.setState('idle'); return; }

    this.moveAlongPath(path, () => this._doTileWork());
  }

  _doTileWork() {
    if (!this.job) return;
    const scene = this.scene;
    const { target, resourceType } = this.job;
    const cell = scene.world.map[target.y]?.[target.x];
    if (!cell || !cell.resourceAmount || cell.resourceAmount <= 0) {
      this.job = null;
      this.setState('idle');
      return;
    }

    const dx = target.x - this.gridX;
    if (dx < 0) this.setFacing('west');
    else if (dx > 0) this.setFacing('east');
    this.setState('working');

    const color = this._workColor(resourceType);
    if (this.team === 'blue') audio.play(resourceType === 'wood' ? 'chop' : 'gather');
    scene.emitWorkParticles(this.container.x, this.container.y - 8, color);
    this._workParticleTimer = scene.time.addEvent({
      delay: 600, repeat: 2,
      callback: () => scene.emitWorkParticles(this.container.x, this.container.y - 8, color)
    });

    const workMs = isSpeedBoosted(this.team) ? WORK_DURATION_MS * 0.666 : WORK_DURATION_MS;
    this._workTimer = scene.time.delayedCall(workMs, () => {
      this._workTimer = null;
      this._workParticleTimer = null;
      if (!this.job) return;
      const perTrip = this.team === 'red' ? GATHER_PER_TRIP_RED : GATHER_PER_TRIP_BLUE;
      const amount = Math.min(perTrip, cell.resourceAmount);
      cell.resourceAmount -= amount;
      this.inventory = { type: resourceType, amount };
      this._showCarryIcon(resourceType);
      if (cell.resourceAmount <= 0) scene.clearResourceAt(target.x, target.y);
      this._runGather();
    });
  }

  _runGatherBuilding() {
    const scene = this.scene;
    const { building, resourceType } = this.job;

    if (this.inventory) {
      this._deliverToTownCenter(() => this._runGatherBuilding());
      return;
    }

    if (!building || building.destroyed || building.underConstruction) {
      this.job = null; this.setState('idle'); return;
    }

    const walkable = (x, y) => scene.isWalkable(x, y)
      || (x === this.gridX && y === this.gridY);
    const path = findPathAdjacentAny(
      { x: this.gridX, y: this.gridY },
      building.tiles, walkable, GRID_W, GRID_H
    );
    if (!path) { this.job = null; this.setState('idle'); return; }

    this.moveAlongPath(path, () => this._doBuildingWork());
  }

  _doBuildingWork() {
    if (!this.job) return;
    const scene = this.scene;
    const { building, resourceType } = this.job;
    if (!building || building.destroyed || building.underConstruction) {
      this.job = null; this.setState('idle'); return;
    }
    const gatherable = building.typeDef.effects?.gatherable;
    if (!gatherable) { this.job = null; this.setState('idle'); return; }

    const dx = building.centerX - this.container.x;
    if (dx < 0) this.setFacing('west');
    else if (dx > 0) this.setFacing('east');
    this.setState('working');

    const color = this._workColor(resourceType);
    scene.emitWorkParticles(this.container.x, this.container.y - 8, color);

    const bw = isSpeedBoosted(this.team) ? gatherable.workMs * 0.666 : gatherable.workMs;
    this._workTimer = scene.time.delayedCall(bw, () => {
      this._workTimer = null;
      if (!this.job) return;
      const yieldAmt = this.team === 'red'
        ? Math.max(1, Math.round(gatherable.yield * 0.8))
        : gatherable.yield;
      this.inventory = { type: resourceType, amount: yieldAmt };
      this._showCarryIcon(resourceType);
      this._runGatherBuilding();
    });
  }

  _runBuild() {
    const scene = this.scene;
    const b = this.job.building;
    if (!b || b.destroyed) { this.job = null; this.setState('idle'); return; }
    if (!b.underConstruction) { this.job = null; this.setState('idle'); return; }

    const walkable = (x, y) => scene.isWalkable(x, y)
      || (x === this.gridX && y === this.gridY);
    const path = findPathAdjacentAny(
      { x: this.gridX, y: this.gridY },
      b.tiles, walkable, GRID_W, GRID_H
    );
    if (!path) { this.job = null; this.setState('idle'); return; }

    this.moveAlongPath(path, () => this._doBuild());
  }

  _doBuild() {
    if (!this.job) return;
    const scene = this.scene;
    const b = this.job.building;
    if (!b || b.destroyed || !b.underConstruction) {
      this.job = null; this.setState('idle'); return;
    }

    const dx = b.centerX - this.container.x;
    if (dx < 0) this.setFacing('west');
    else if (dx > 0) this.setFacing('east');
    this.setState('working');

    const duration = b.typeDef.buildTimeMs;
    const start = b.hp > 1 ? 1 - (b.hp / b.maxHp) : 0; // resume-ish
    this._buildTween = scene.tweens.addCounter({
      from: start, to: 1,
      duration: duration * (1 - start),
      onUpdate: (t) => {
        if (b.destroyed) { this._buildTween.stop(); return; }
        b.setConstructionProgress(t.getValue());
      },
      onComplete: () => {
        this._buildTween = null;
        this.job = null;
        this.setState('idle');
      }
    });
  }

  _workColor(resourceType) {
    if (resourceType === 'food') return 0xd94040;
    if (resourceType === 'gold') return 0xf5c842;
    return 0x8b5a2b;
  }

  _deliverToTownCenter(onDone) {
    const scene = this.scene;
    const tc = scene.findNearestTownCenter(this, this.team);
    if (!tc) { this.job = null; this.setState('idle'); return; }

    const walkable = (x, y) => scene.isWalkable(x, y)
      || (x === this.gridX && y === this.gridY);
    const path = findPathAdjacentAny(
      { x: this.gridX, y: this.gridY },
      tc.tiles, walkable, GRID_W, GRID_H
    );
    if (!path) { this.job = null; this.setState('idle'); return; }

    this.moveAlongPath(path, () => {
      if (this.inventory) {
        const { type, amount } = this.inventory;
        const econ = econFor(this.team);
        if (type === 'wood') econ.wood += amount;
        else if (type === 'food') econ.food += amount;
        else if (type === 'gold') econ.gold += amount;
        this.inventory = null;
        this._hideCarryIcon();
        if (this.team === 'blue') scene.game.events.emit('resourcesChanged');
      }
      if (onDone) onDone();
    }, 'carrying');
  }

  _showCarryIcon(type) {
    let frame = ICON_FRAME_WOOD;
    if (type === 'food') frame = ICON_FRAME_FOOD;
    else if (type === 'gold') frame = ICON_FRAME_GOLD;
    this.inventoryIcon.setFrame(frame);
    this.inventoryIcon.setVisible(true);
  }

  _hideCarryIcon() {
    this.inventoryIcon.setVisible(false);
  }

  destroy() {
    this.stopPath();
    if (this._workTimer) this._workTimer.remove();
    if (this._workParticleTimer) this._workParticleTimer.remove();
    this.container.destroy();
  }
}
