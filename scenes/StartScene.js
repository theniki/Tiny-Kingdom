import Phaser from 'phaser';

const TUTORIAL_PANELS = [
  {
    title: 'Gather Resources',
    text: 'Click a villager to select them.\nDouble-click a tree — they\'ll chop wood!'
  },
  {
    title: 'Build Your Kingdom',
    text: 'Build Houses for more villagers.\nBuild Farms for endless food.'
  },
  {
    title: 'Defend Your Land',
    text: 'Train Guards at the Barracks.\nDouble-click an enemy to attack!'
  },
  {
    title: 'Win the Game',
    text: 'Build the Big Castle and hold it\nfor 60 seconds to WIN!'
  }
];

export class StartScene extends Phaser.Scene {
  constructor() { super('StartScene'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setBackgroundColor('#5aa85a');

    this._ensureVillagerAnims();
    this._spawnBackgroundVillagers(3);

    this.add.text(w / 2, h / 2 - 200, '🏰 Tiny Kingdom', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '72px',
      color: '#fff8d0',
      stroke: '#2a4a2a',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2 - 120, 'A cozy little kingdom-builder', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#f0fff0'
    }).setOrigin(0.5);

    // Play button
    const playBtn = this.add.rectangle(w / 2, h / 2 - 10, 240, 80, 0xffd54a)
      .setStrokeStyle(4, 0x8a6a1a)
      .setInteractive({ useHandCursor: true });
    const playText = this.add.text(w / 2, h / 2 - 10, '▶ Play', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '36px', color: '#3a2a0a', fontStyle: 'bold'
    }).setOrigin(0.5);
    playBtn.on('pointerover', () => playBtn.setFillStyle(0xffe066));
    playBtn.on('pointerout', () => playBtn.setFillStyle(0xffd54a));
    playBtn.on('pointerdown', () => {
      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    });

    // How-to-Play button
    const howBtn = this.add.rectangle(w / 2, h / 2 + 90, 200, 54, 0x88a8d0)
      .setStrokeStyle(3, 0x4a6a90)
      .setInteractive({ useHandCursor: true });
    const howText = this.add.text(w / 2, h / 2 + 90, '❓ How to Play', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px', color: '#fafaff', fontStyle: 'bold'
    }).setOrigin(0.5);
    howBtn.on('pointerover', () => howBtn.setFillStyle(0xaac0e8));
    howBtn.on('pointerout', () => howBtn.setFillStyle(0x88a8d0));
    howBtn.on('pointerdown', () => this._openTutorial());

    this.add.text(w / 2, h - 40, 'Click to select · Double-click to act · ESC to cancel · SPACE to pause', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px', color: '#d0f0d0'
    }).setOrigin(0.5);
  }

  /* ---------------- background villagers ---------------- */

  _ensureVillagerAnims() {
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

  _spawnBackgroundVillagers(n) {
    this._wanderers = [];
    for (let i = 0; i < n; i++) {
      const x = Phaser.Math.Between(100, this.scale.width - 100);
      const y = Phaser.Math.Between(this.scale.height * 0.15, this.scale.height - 140);
      const sprite = this.add.sprite(x, y, 'villager_idle_east').setDepth(1).setAlpha(0.9);
      sprite.play('villager_idle_east');
      // Small team disk under feet for consistency with in-game visuals
      const disk = this.add.ellipse(x, y + 22, 22, 8, 0x4488ff, 0.45).setDepth(0);
      const wanderer = { sprite, disk, facing: 'east' };
      this._wanderers.push(wanderer);
      this.time.delayedCall(Phaser.Math.Between(200, 1500), () => this._wanderNext(wanderer));
    }
  }

  _wanderNext(w) {
    const scene = this;
    if (!w.sprite.active) return;
    const pad = 80;
    const bottomPad = 160;
    const tx = Phaser.Math.Between(pad, scene.scale.width - pad);
    const ty = Phaser.Math.Between(scene.scale.height * 0.15, scene.scale.height - bottomPad);
    const dx = tx - w.sprite.x;
    w.facing = dx >= 0 ? 'east' : 'west';
    w.sprite.play(`villager_walk_${w.facing}`, true);
    const dist = Math.hypot(tx - w.sprite.x, ty - w.sprite.y);
    const duration = Math.max(1200, dist * 22);
    scene.tweens.add({
      targets: w.sprite,
      x: tx, y: ty,
      duration,
      onUpdate: () => {
        w.disk.x = w.sprite.x;
        w.disk.y = w.sprite.y + 22;
      },
      onComplete: () => {
        w.sprite.play(`villager_idle_${w.facing}`, true);
        scene.time.delayedCall(Phaser.Math.Between(600, 2000), () => scene._wanderNext(w));
      }
    });
  }

  /* ---------------- tutorial overlay ---------------- */

  _openTutorial() {
    if (this._tutorialOpen) return;
    this._tutorialOpen = true;
    this._tutorialIndex = 0;

    const w = this.scale.width;
    const h = this.scale.height;

    const container = this.add.container(0, 0).setDepth(9000);
    const backdrop = this.add.rectangle(0, 0, w, h, 0x000000, 0.65).setOrigin(0, 0)
      .setInteractive();
    const cardW = 560, cardH = 340;
    const card = this.add.rectangle(w / 2, h / 2, cardW, cardH, 0xfffef2, 1)
      .setStrokeStyle(4, 0x8a6a1a);

    const titleText = this.add.text(w / 2, h / 2 - 120, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '30px', color: '#3a2a0a', fontStyle: 'bold'
    }).setOrigin(0.5);
    const bodyText = this.add.text(w / 2, h / 2 - 40, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px', color: '#3a2a0a',
      align: 'center', wordWrap: { width: cardW - 60 }
    }).setOrigin(0.5, 0);

    // Progress dots
    const dotsY = h / 2 + 90;
    const dots = [];
    const dotStart = w / 2 - (TUTORIAL_PANELS.length - 1) * 10;
    for (let i = 0; i < TUTORIAL_PANELS.length; i++) {
      dots.push(this.add.circle(dotStart + i * 20, dotsY, 5, 0x8a6a1a, 0.35));
    }

    const prev = this._makeTutorialButton(w / 2 - 150, h / 2 + 130, '◀ Prev', () => {
      this._tutorialIndex = Math.max(0, this._tutorialIndex - 1);
      renderPanel();
    });
    const next = this._makeTutorialButton(w / 2 + 150, h / 2 + 130, 'Next ▶', () => {
      if (this._tutorialIndex < TUTORIAL_PANELS.length - 1) {
        this._tutorialIndex++;
        renderPanel();
      } else {
        cleanup();
      }
    });
    const close = this.add.text(w / 2 + cardW / 2 - 22, h / 2 - cardH / 2 + 8, '✕', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#3a2a0a', fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', cleanup);

    container.add([backdrop, card, titleText, bodyText, ...dots, prev, next, close]);

    const self = this;
    function renderPanel() {
      const p = TUTORIAL_PANELS[self._tutorialIndex];
      titleText.setText(p.title);
      bodyText.setText(p.text);
      for (let i = 0; i < dots.length; i++) {
        dots[i].setFillStyle(i === self._tutorialIndex ? 0xffd54a : 0x8a6a1a, i === self._tutorialIndex ? 0.95 : 0.35);
      }
      const isLast = self._tutorialIndex === TUTORIAL_PANELS.length - 1;
      next.list[1].setText(isLast ? 'Got it ✓' : 'Next ▶');
    }
    function cleanup() {
      container.destroy();
      self._tutorialOpen = false;
    }
    renderPanel();
  }

  _makeTutorialButton(x, y, label, onClick) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 120, 40, 0xffd54a, 1)
      .setStrokeStyle(3, 0x8a6a1a).setInteractive({ useHandCursor: true });
    const t = this.add.text(0, 0, label, {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#3a2a0a', fontStyle: 'bold'
    }).setOrigin(0.5);
    c.add([bg, t]);
    bg.on('pointerover', () => bg.setFillStyle(0xffe066));
    bg.on('pointerout', () => bg.setFillStyle(0xffd54a));
    bg.on('pointerdown', onClick);
    return c;
  }
}
