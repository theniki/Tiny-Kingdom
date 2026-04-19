import { TILE_SIZE } from './constants.js';

export class Chest {
  constructor(scene, gridX, gridY) {
    this.scene = scene;
    this.gridX = gridX;
    this.gridY = gridY;
    this.collected = false;

    const px = gridX * TILE_SIZE + TILE_SIZE / 2;
    const py = gridY * TILE_SIZE + TILE_SIZE / 2;

    this.sprite = scene.add.image(px, py, 'treasure')
      .setDisplaySize(32, 32)
      .setDepth(36);

    this.glow = scene.add.circle(px, py, 22, 0xffe066, 0.28)
      .setDepth(35);

    // Pulse tween on both sprite and glow halo
    this._pulse = scene.tweens.add({
      targets: [this.sprite, this.glow],
      scaleX: { from: 1, to: 1.1 },
      scaleY: { from: 1, to: 1.1 },
      duration: 750,
      yoyo: true,
      repeat: -1
    });
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    if (this._pulse) this._pulse.stop();
    this.scene.tweens.add({
      targets: [this.sprite, this.glow],
      scaleX: 1.4, scaleY: 1.4,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        this.sprite.destroy();
        this.glow.destroy();
      }
    });
  }
}
