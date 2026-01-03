// src/scenes/MenuScene.ts
// -----------------------------------------------------------------------------
// HexFleet — Main Menu Scene
// -----------------------------------------------------------------------------

import Phaser from 'phaser';
import { newGame, loadGame } from '../core/GameState';
import { VisualStyle } from '../ui/VisualStyle';

export default class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Dark space background
    this.background = this.add.graphics()
      .fillStyle(0x0a0e1a, 1)
      .fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

    // Add some stars for atmosphere
    this.createStarfield();

    // Title
    this.title = this.add.text(
      this.cameras.main.width / 2,
      100,
      'HEX FLEET',
      {
        font: 'bold 48px monospace',
        color: VisualStyle.uiText
      }
    ).setOrigin(0.5, 0);

    // Subtitle
    this.add.text(
      this.cameras.main.width / 2,
      160,
      'A turn-based space strategy game',
      {
        font: '20px monospace',
        color: VisualStyle.uiDim
      }
    ).setOrigin(0.5, 0);

    // Menu items
    this.createMenuItems();

    // Input handling
    this.setupInput();

    // Initial selection
    this.updateSelection();
  }

  private createStarfield(): void {
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * this.cameras.main.width;
      const y = Math.random() * this.cameras.main.height;
      const size = Math.random() * 2 + 0.5;
      const brightness = Math.random() * 0.8 + 0.2;
      
      this.add.circle(x, y, size, 0xffffff, brightness);
    }
  }

  private createMenuItems(): void {
    const centerX = this.cameras.main.width / 2;
    const startY = 250;
    const spacing = 60;

    const menuOptions = [
      { text: 'New Game', action: () => this.startNewGame() },
      { text: 'Continue Game', action: () => this.continueGame() },
      { text: 'Quit', action: () => this.quitGame() }
    ];

    menuOptions.forEach((option, index) => {
      const item = this.add.text(
        centerX,
        startY + index * spacing,
        option.text,
        {
          font: '24px monospace',
          color: VisualStyle.uiText
        }
      ).setOrigin(0.5, 0);

      // Store action for later use
      item.setData('action', option.action);
      this.menuItems.push(item);
    });
  }

  private setupInput(): void {
    // Keyboard navigation
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          this.selectedIndex = Math.max(0, this.selectedIndex - 1);
          this.updateSelection();
          break;
        case 'ArrowDown':
          this.selectedIndex = Math.min(this.menuItems.length - 1, this.selectedIndex + 1);
          this.updateSelection();
          break;
        case 'Enter':
          this.selectCurrentItem();
          break;
        case 'Escape':
          this.quitGame();
          break;
      }
    });

    // Mouse navigation
    this.menuItems.forEach((item, index) => {
      item.setInteractive({ useHandCursor: true });
      
      item.on('pointerover', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      item.on('pointerdown', () => {
        this.selectedIndex = index;
        this.selectCurrentItem();
      });
    });
  }

  private updateSelection(): void {
    this.menuItems.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.setColor('#ffffff'); // Highlight selected
        item.setFontSize(28);
      } else {
        item.setColor(VisualStyle.uiText);
        item.setFontSize(24);
      }
    });
  }

  private selectCurrentItem(): void {
    const selectedItem = this.menuItems[this.selectedIndex];
    const action = selectedItem.getData('action');
    if (action) action();
  }

  private startNewGame(): void {
    newGame();
    this.scene.start('GalaxyScene');
  }

  private continueGame(): void {
    const success = loadGame();
    if (success) {
      this.scene.start('GalaxyScene');
    } else {
      // Flash message or could show a "no save found" dialog
      this.title.setText('HEX FLEET - No Save Found');
      setTimeout(() => {
        this.title.setText('HEX FLEET');
      }, 2000);
    }
  }

  private quitGame(): void {
    // In a web context, this might just show a message
    // In Electron or desktop builds, this would close the app
    this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height - 50,
      'Thanks for playing HexFleet!',
      {
        font: '16px monospace',
        color: VisualStyle.uiDim
      }
    ).setOrigin(0.5, 0);
  }
}
