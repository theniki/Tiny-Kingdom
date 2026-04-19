import Phaser from 'phaser';
import { TILE_SIZE, GRID_W, GRID_H } from './constants.js';
import { findPathAdjacent, findPathAdjacentAny } from '../systems/pathfinding.js';
import { gameState } from './gameState.js';
import * as audio from '../systems/audio.js';

const SELECT_RADIUS = 28;
const ATTACK_RANGE = 1;         // Chebyshev grid distance
const ATTACK_COOLDOWN_MS = 1000;
const BOB_AMOUNT = 2;

let nextId = 1;

export class Soldier {
  constructor(scene, gridX, gridY, opts = {}) {
    this.scene = scene;
    this.kind = 'soldier';
    this.id = nextId++;
    this.gridX = gridX;
    this.gridY = gridY;
    this.team = opts.team || 'blue';
    const knight = opts.isKnight;
    this.maxHp = opts.hp ?? (knight ? 80 : (this.team === 'blue' ? 60 : 50));
    this.hp = this.maxHp;
    this.attack = opts.attack ?? (knight ? 18 : 10);
    this.stepMs = opts.stepMs ?? (knight ? 333 : 400);

    this.state = 'idle';         // idle | walking | attacking | dying
    this.attackTarget = null;
    this.marchTarget = null;     // persistent attack target (e.g., wave objective)
    this.attackCooldown = 0;
    this.facing = 'east';
    this.selected = false;
    this.destroyed = false;
    this.isKnight = opts.isKnight || false;

    this._pathTween = null;
    this._bobTween = null;
    this._moving = false;
    this._rePathCooldown = 0;
    this._lastPathTargetTile = null;

    const px = gridX * TILE_SIZE + TILE_SIZE / 2;
    const py = gridY * TILE_SIZE + TILE_SIZE / 2;
    this.container = scene.add.container(px, py).setDepth(50);

    const ringColor = this.team === 'blue' ? 0xffe066 : 0xff6666;
    this.ring = scene.add.circle(0, 4, 24, ringColor, 0)
      .setStrokeStyle(2, ringColor)
      .setVisible(false);

    const diskColor = this.team === 'blue' ? 0x4488ff : 0xff4444;
    this.teamDisk = scene.add.ellipse(0, 22, 22, 8, diskColor, 0.6);

    this.knightGlow = scene.add.ellipse(0, 0, 36, 40, 0xffdd88, 0.35).setVisible(this.isKnight);

    this.sprite = scene.add.sprite(0, -4, 'soldier_east');
    this.sprite.setTint(this.team === 'blue' ? 0x99bbff : 0xff4444);

    this.hpBg = scene.add.rectangle(0, -30, 26, 5, 0x000000, 0.75).setVisible(false);
    this.hpBar = scene.add.rectangle(-12, -30, 24, 3, 0x44ff44)
      .setOrigin(0, 0.5).setVisible(false);

    const labelPrefix = this.team === 'blue' ? 'g' : 'e';
    this.label = scene.add.text(0, 24, `${labelPrefix}${this.id}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5, 0).setVisible(false);

    this.container.add([this.teamDisk, this.knightGlow, this.ring, this.sprite, this.hpBg, this.hpBar, this.label]);
  }

  get pixelX() { return this.container.x; }
  get pixelY() { return this.container.y; }

  hitTest(worldX, worldY) {
    const dx = worldX - this.container.x;
    const dy = worldY - this.container.y;
    return (dx * dx + dy * dy) <= (SELECT_RADIUS * SELECT_RADIUS);
  }

  setSelected(on) {
    if (this.destroyed) return;
    this.selected = on;
    this.ring.setVisible(on);
    this.label.setVisible(on);
  }

  cancelJob() {
    this.stopPath();
    this.attackTarget = null;
    this.marchTarget = null;
    this.state = 'idle';
  }

  stopPath() {
    if (this._pathTween) { this._pathTween.stop(); this._pathTween = null; }
    this._moving = false;
    this._stopBob();
  }

  _updateFacing(dx, dy) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (dx > 0 && dy > 0 && absDy >= 0.5 * absDx) this.facing = 'south_east';
    else if (dx > 0) this.facing = 'east';
    else if (dx < 0) this.facing = 'west';
    this._applyFacing();
  }

  _applyFacing() {
    const key = this.facing === 'south_east' ? 'soldier_south_east'
              : this.facing === 'west' ? 'soldier_west'
              : 'soldier_east';
    if (this.sprite.texture.key !== key) {
      this.sprite.setTexture(key);
      this.sprite.setTint(this.team === 'blue' ? 0x99bbff : 0xff4444);
    }
  }

  _startBob() {
    if (this._bobTween || this.destroyed) return;
    this._bobTween = this.scene.tweens.add({
      targets: this.sprite,
      y: -4 - BOB_AMOUNT,
      duration: 125,
      yoyo: true,
      repeat: -1
    });
  }

  _stopBob() {
    if (this._bobTween) { this._bobTween.stop(); this._bobTween = null; }
    this.sprite.y = -4;
  }

  moveAlongPath(path, onComplete) {
    this.stopPath();
    if (!path || path.length === 0) { if (onComplete) onComplete(); return; }
    this.state = 'walking';
    this._moving = true;
    this._startBob();
    let stepIndex = 0;

    const step = () => {
      if (this.destroyed) return;
      if (stepIndex >= path.length) {
        this._pathTween = null;
        this._moving = false;
        this._stopBob();
        if (this.state === 'walking') this.state = 'idle';
        if (onComplete) onComplete();
        return;
      }
      const next = path[stepIndex];
      const dx = next.x - this.gridX;
      const dy = next.y - this.gridY;
      this._updateFacing(dx, dy);

      this._pathTween = this.scene.tweens.add({
        targets: this.container,
        x: next.x * TILE_SIZE + TILE_SIZE / 2,
        y: next.y * TILE_SIZE + TILE_SIZE / 2,
        duration: this.stepMs,
        onComplete: () => {
          this.gridX = next.x;
          this.gridY = next.y;
          stepIndex++;
          step();
        }
      });
    };
    step();
  }

  assignAttackTarget(target) {
    this.cancelJob();
    this.attackTarget = target;
  }

  tick(dt) {
    if (this.destroyed || this.state === 'dying') return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this._rePathCooldown > 0) this._rePathCooldown -= dt;

    // If current attack target is dead, try to fall back to marchTarget
    if (this.attackTarget && (this.attackTarget.destroyed || this.attackTarget.hp <= 0)) {
      this.attackTarget = null;
    }
    if (!this.attackTarget && this.marchTarget && !this.marchTarget.destroyed && this.marchTarget.hp > 0) {
      this.attackTarget = this.marchTarget;
    }

    const t = this.attackTarget;
    if (!t) return;

    if (this._inRange(t)) {
      if (this._moving) this.stopPath();
      this.state = 'attacking';
      const dx = ((t.pixelX ?? t.centerX) - this.container.x) / TILE_SIZE;
      const dy = ((t.pixelY ?? t.centerY) - this.container.y) / TILE_SIZE;
      this._updateFacing(dx, dy);
      if (this.attackCooldown <= 0) {
        this._doAttack(t);
        this.attackCooldown = ATTACK_COOLDOWN_MS;
      }
      return;
    }

    // Not in range. Pursue, and re-path every 400ms if target has moved.
    if (!this._moving) {
      this._pursueTarget(t);
    } else if (this._rePathCooldown <= 0) {
      this._rePathCooldown = 400;
      const curTile = t.tiles ? t.tiles[0] : { x: t.gridX, y: t.gridY };
      const prev = this._lastPathTargetTile;
      if (prev && (Math.abs(curTile.x - prev.x) >= 1 || Math.abs(curTile.y - prev.y) >= 1)) {
        this.stopPath();
        this._pursueTarget(t);
      }
    }
  }

  _inRange(target) {
    if (target.tiles) {
      return target.tiles.some(tt =>
        Math.max(Math.abs(this.gridX - tt.x), Math.abs(this.gridY - tt.y)) <= ATTACK_RANGE);
    }
    const tx = target.gridX, ty = target.gridY;
    return Math.max(Math.abs(this.gridX - tx), Math.abs(this.gridY - ty)) <= ATTACK_RANGE;
  }

  _pursueTarget(target) {
    const scene = this.scene;
    const walkable = (x, y) => scene.isWalkable(x, y) || (x === this.gridX && y === this.gridY);
    let path;
    if (target.tiles) {
      path = findPathAdjacentAny({ x: this.gridX, y: this.gridY }, target.tiles, walkable, GRID_W, GRID_H);
    } else {
      path = findPathAdjacent(
        { x: this.gridX, y: this.gridY },
        { x: target.gridX, y: target.gridY },
        walkable, GRID_W, GRID_H
      );
    }
    if (path && path.length > 0) {
      this._lastPathTargetTile = target.tiles ? { ...target.tiles[0] } : { x: target.gridX, y: target.gridY };
      this._rePathCooldown = 400;
      this.moveAlongPath(path);
    }
  }

  _doAttack(target) {
    if (this.team === 'blue') audio.play('attack_hit');
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.2, scaleY: 1.2,
      duration: 100, yoyo: true
    });
    target.takeDamage(this.attack, this);
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
    this.attackTarget = null;
    this.stopPath();
    this.setSelected(false);
    this.scene.tweens.add({
      targets: this.container,
      angle: 180,
      alpha: 0,
      duration: 500,
      onComplete: () => {
        this.destroyed = true;
        const idx = gameState.soldiers.indexOf(this);
        if (idx >= 0) gameState.soldiers.splice(idx, 1);
        if (this.team === 'red') gameState.stats.enemiesDefeated++;
        this.container.destroy();
      }
    });
  }

  upgradeToKnight() {
    if (this.isKnight) return;
    this.isKnight = true;
    this.maxHp = Math.max(this.maxHp + 20, 80);
    this.hp = Math.min(this.maxHp, this.hp + 20);
    this.attack = 18;
    this.stepMs = 333;
    if (this.knightGlow) this.knightGlow.setVisible(true);
    this._updateHealthBar();
  }

  destroy() {
    this.stopPath();
    this.container.destroy();
  }
}
