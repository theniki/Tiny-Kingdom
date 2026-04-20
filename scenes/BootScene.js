import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const w = this.scale.width;
    const h = this.scale.height;

    const loadingText = this.add.text(w / 2, h / 2 - 20, 'Loading…', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '32px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const barBg = this.add.rectangle(w / 2, h / 2 + 24, 420, 16, 0x000000, 0.5);
    const bar = this.add.rectangle(w / 2 - 210, h / 2 + 24, 4, 12, 0xffe066).setOrigin(0, 0.5);

    this.load.on('progress', (p) => {
      bar.width = 4 + 416 * p;
    });
    this.load.on('complete', () => {
      loadingText.destroy();
      barBg.destroy();
      bar.destroy();
    });

    // Tiles
    this.load.image('grass', 'assets/tiles/grass.png');
    this.load.image('water', 'assets/tiles/water.png');
    this.load.image('mountain', 'assets/tiles/mountain.png');
    this.load.image('dirt', 'assets/tiles/dirt.jpg');
    this.load.spritesheet('decoration', 'assets/tiles/decoration.png', {
      frameWidth: 64, frameHeight: 64
    });

    // Resources
    this.load.image('tree', 'assets/resources/tree_64.png');
    this.load.image('apple_pile', 'assets/resources/apple_pile_64.png');
    this.load.image('gold', 'assets/resources/gold.png');
    this.load.image('grey_rocks', 'assets/resources/grey-rocks.png');
    this.load.image('purple_rocks', 'assets/resources/purple-rocks.png');
    this.load.image('minerals', 'assets/resources/minerals.png');
    this.load.image('rare_mineral', 'assets/resources/rare-mineral.png');

    // Buildings
    this.load.image('camp_l1', 'assets/buildings/camp_l1_64.png');
    this.load.image('house_l2', 'assets/buildings/house_l2_64.png');
    this.load.image('barracks', 'assets/buildings/BARRACKS.png');
    this.load.image('castle', 'assets/buildings/CASTLE.png');
    this.load.image('farm', 'assets/buildings/FARM.png');
    this.load.image('box', 'assets/buildings/box.png');
    this.load.image('treasure', 'assets/buildings/TREASURE.png');

    // Characters — villager sprite sheets (4 frames × 68×68)
    this.load.spritesheet('villager_idle_east', 'assets/characters/villager_idle_east.png', {
      frameWidth: 68, frameHeight: 68
    });
    this.load.spritesheet('villager_idle_west', 'assets/characters/villager_idle_west.png', {
      frameWidth: 68, frameHeight: 68
    });
    this.load.spritesheet('villager_walk_east', 'assets/characters/villager_walk_east.png', {
      frameWidth: 68, frameHeight: 68
    });
    this.load.spritesheet('villager_walk_west', 'assets/characters/villager_walk_west.png', {
      frameWidth: 68, frameHeight: 68
    });

    // Static soldier sprites
    this.load.image('soldier_east', 'assets/characters/SOLDIER-east.png');
    this.load.image('soldier_west', 'assets/characters/SOLDIER-west.png');
    this.load.image('soldier_south_east', 'assets/characters/SOLDIER-south_east.png');

    // Items — 5×4 grid of 32×32 findables
    this.load.spritesheet('findables', 'assets/items/RANDOM_SMALL_FINDABLES.png', {
      frameWidth: 32, frameHeight: 32
    });

    // Audio — music + sfx (MP3). Failures are logged but don't block the game.
    // Music keys consumed by systems/audio.js state machine (D-012).
    this.load.audio('theme-normal',  'assets/audio/background-theme-normal.mp3');
    this.load.audio('theme-attack',  'assets/audio/background-theme-attack.mp3');
    this.load.audio('ambient-layer', 'assets/audio/ambient-layer.mp3');
    this.load.audio('villager-action',  'assets/audio/villager-action.mp3');
    this.load.audio('guard-action',     'assets/audio/guard-action.mp3');
    this.load.audio('collect-wood',     'assets/audio/collect-wood.mp3');
    this.load.audio('collect-food',     'assets/audio/collect-food.mp3');
    this.load.audio('collect-gold',     'assets/audio/collect-gold.mp3');
    this.load.audio('level-up',         'assets/audio/level-up.mp3');
    this.load.audio('upgrade',          'assets/audio/upgrade.mp3');

    this.load.on('loaderror', (file) => {
      console.warn(`[boot] asset failed to load: ${file.key} (${file.src})`);
    });
  }

  create() {
    this.scene.start('StartScene');
  }
}
