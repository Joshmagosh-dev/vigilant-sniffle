/**
 * FleetScene
 *
 * Fleet overview screen.
 *
 * Responsibilities (GDD-aligned):
 * - Show fleets, composition, and computed power
 * - Highlight role/tier via icons (later)
 * - Offer actions like dismantle (later)
 *
 * Starter behavior:
 * - Shows placeholder text
 * - Provides navigation back to GalaxyScene
 */

import Phaser from 'phaser';

export default class FleetScene extends Phaser.Scene {
  constructor() {
    super('FleetScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(16, 14, 'HexFleet — Fleets', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#d9e2ef'
    });

    this.add.text(16, 44, 'Placeholder fleet list. Next: read GameState.fleets and render composition + power.', {
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

    // A simple placeholder box for future fleet entries.
    this.add.rectangle(width / 2, height / 2, 640, 280, 0x111827, 0.7).setStrokeStyle(2, 0x2b394a);
    this.add.text(width / 2, height / 2, 'Fleet entries will go here\n(icons + composition + power)', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#d9e2ef',
      align: 'center'
    }).setOrigin(0.5);
  }
}
