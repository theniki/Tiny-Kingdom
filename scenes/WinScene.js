import Phaser from 'phaser';
import { gameState, resetGameState } from '../data/gameState.js';

export class WinScene extends Phaser.Scene {
  constructor() { super('WinScene'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setBackgroundColor('#4a7a3a');

    // Ensure confetti texture
    if (!this.textures.exists('pixel4')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 4, 4);
      g.generateTexture('pixel4', 4, 4); g.destroy();
    }

    // Continuous confetti
    const emitter = this.add.particles(0, -10, 'pixel4', {
      tint: [0xffe066, 0xff66aa, 0x66ccff, 0x88ff88, 0xffffff, 0xffaa44],
      x: { min: 0, max: w },
      y: { min: -20, max: 0 },
      lifespan: 3500,
      gravityY: 90,
      speedX: { min: -30, max: 30 },
      speedY: { min: 60, max: 120 },
      scale: { start: 1.8, end: 0.6 },
      rotate: { start: 0, end: 360 },
      frequency: 45
    }).setDepth(0);

    const total = Math.floor(gameState.elapsedTime);
    const mm = Math.floor(total / 60);
    const ss = (total % 60).toString().padStart(2, '0');

    this.add.text(w / 2, h / 2 - 180, '🎉 You Win!', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '72px',
      color: '#ffe066',
      fontStyle: 'bold',
      stroke: '#3a2a00',
      strokeThickness: 8
    }).setOrigin(0.5).setDepth(10);

    this.add.text(w / 2, h / 2 - 100, 'Your kingdom stood strong.', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#fff8d0'
    }).setOrigin(0.5).setDepth(10);

    const statsPanel = this.add.container(w / 2, h / 2 + 10).setDepth(10);
    const panelBg = this.add.rectangle(0, 0, 440, 170, 0x000000, 0.55)
      .setStrokeStyle(2, 0xffe066, 0.7);
    const statTextStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#ffffff'
    };
    const lines = [
      `⏱  Time played: ${mm}:${ss}`,
      `👶 Villagers trained: ${gameState.stats.villagersTrained}`,
      `⚔️  Enemies defeated: ${gameState.stats.enemiesDefeated}`,
      `🎁 Chests opened: ${gameState.stats.chestsOpened}`
    ];
    const texts = lines.map((line, i) =>
      this.add.text(-200, -60 + i * 34, line, statTextStyle).setOrigin(0, 0.5)
    );
    statsPanel.add([panelBg, ...texts]);

    const btn = this.add.rectangle(w / 2, h / 2 + 170, 240, 64, 0xffd54a)
      .setStrokeStyle(4, 0x8a6a1a)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    const btnText = this.add.text(w / 2, h / 2 + 170, '▶ Play Again', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: '#3a2a0a',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(11);

    btn.on('pointerover', () => btn.setFillStyle(0xffe066));
    btn.on('pointerout', () => btn.setFillStyle(0xffd54a));
    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('StartScene');
    });
  }
}
