import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { StartScene } from './scenes/StartScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { WinScene } from './scenes/WinScene.js';
import { LoseScene } from './scenes/LoseScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './data/constants.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#3a6a3a',
  pixelArt: true,
  roundPixels: true,
  scene: [BootScene, StartScene, GameScene, UIScene, WinScene, LoseScene]
};

const game = new Phaser.Game(config);
window.game = game;
