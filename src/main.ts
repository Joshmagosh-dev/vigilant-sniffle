// src/main.ts
import Phaser from 'phaser';

import GalaxyScene from './scenes/GalaxyScene';
import SystemScene from './scenes/SystemScene';
import MenuScene from './scenes/MenuScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#070a10',
  parent: 'app',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene, GalaxyScene, SystemScene],
  physics: { default: 'arcade' }
};

new Phaser.Game(config);
