import Phaser from 'phaser';
import { gameState, resetGameState } from '../data/gameState.js';

export class LoseScene extends Phaser.Scene {
  constructor() { super('LoseScene'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setBackgroundColor('#3a3a4a');

    const total = Math.floor(gameState.elapsedTime);
    const mm = Math.floor(total / 60);
    const ss = (total % 60).toString().padStart(2, '0');

    this.add.text(w / 2, h / 2 - 180, 'Your kingdom fell 😢', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '56px',
      color: '#ffd0d0',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2 - 110, "Don't give up — try again!", {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#e0e0f0'
    }).setOrigin(0.5);

    const statsPanel = this.add.container(w / 2, h / 2 + 10);
    const panelBg = this.add.rectangle(0, 0, 440, 170, 0x000000, 0.55)
      .setStrokeStyle(2, 0x8888aa, 0.7);
    const statTextStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#d0d8e0'
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

    const btn = this.add.rectangle(w / 2, h / 2 + 170, 240, 64, 0x88a8d0)
      .setStrokeStyle(4, 0x4a6a90)
      .setInteractive({ useHandCursor: true });
    this.add.text(w / 2, h / 2 + 170, '▶ Try Again', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: '#fafaff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0xaac0e8));
    btn.on('pointerout', () => btn.setFillStyle(0x88a8d0));
    btn.on('pointerdown', () => {
      resetGameState();
      this.scene.start('StartScene');
    });
  }
}
