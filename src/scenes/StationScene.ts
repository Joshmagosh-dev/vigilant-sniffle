/**
 * StationScene
 *
 * The rebuild / repair hub.
 *
 * Responsibilities (GDD-aligned):
 * - Build new fleets from blueprints
 * - Repair fleets (restore integrity)
 * - Manage resources
 * - Handle "you lost all fleets" recovery
 *
 * Starter behavior:
 * - Placeholder screen with navigation
 */

import Phaser from 'phaser';

export default class StationScene extends Phaser.Scene {
  constructor() {
    super('StationScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(16, 14, 'HexFleet — Station', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#d9e2ef'
    });

    this.add.text(16, 44, 'Placeholder station UI. Next: blueprint build + repair + resource display.', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9fb3c8'
    });

    // Back button
    const back = this.add.rectangle(16, height - 52, 220, 34, 0x111827, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x2b394a)
      .setInteractive({ useHandCursor: true });

    this.add.text(28, height - 44, 'Back to Galaxy', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#d9e2ef'
    });

    back.on('pointerdown', () => this.scene.start('GalaxyScene'));

    // Placeholder panel
    this.add.rectangle(width / 2, height / 2, 640, 280, 0x111827, 0.7).setStrokeStyle(2, 0x2b394a);
    this.add.text(width / 2, height / 2, 'Blueprint build / repair UI goes here', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#d9e2ef'
    }).setOrigin(0.5);
  }
}
