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
 * Lane-based layout:
 * - Top lane: Fleet name
 * - Center lane: Fleet details (role, stats)
 * - Bottom lane: Fleet composition
 */

import Phaser from 'phaser';
import { getState } from '../core/GameState';
import { VisualStyle } from '../ui/VisualStyle';
import { getFleetGlyph } from '../ui/IconKit';
import type { Fleet } from '../core/types';

export default class FleetScene extends Phaser.Scene {
  constructor() {
    super('FleetScene');
  }

  create(): void {
    const { width, height } = this.scale;

    // Title
    this.add.text(16, 14, 'HexFleet — Fleets', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#d9e2ef'
    });

    // Fleet list with lane-based layout
    this.renderFleetList();

    // Back button
    const backButton = this.add.text(width - 100, height - 30, '← Back to Galaxy', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#4a9eff'
    }).setInteractive().on('pointerdown', () => {
      this.scene.start('GalaxyScene');
    });

    // A simple placeholder box for future fleet entries.
    this.add.rectangle(width / 2, height / 2, 640, 280, 0x111827, 0.7).setStrokeStyle(2, 0x2b394a);
    this.add.text(width / 2, height / 2, 'Fleet entries will go here\n(icons + composition + power)', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#d9e2ef',
      align: 'center'
    }).setOrigin(0.5);
  }

  private renderFleetList(): void {
    const state = getState();
    const fleets = Object.values(state.fleets)
      .filter(f => f.owner === 'PLAYER')
      .sort((a, b) => a.name.localeCompare(b.name));

    const startY = 60;
    const lineHeight = 80;

    fleets.forEach((fleet, index) => {
      const y = startY + (index * lineHeight);
      
      // Top lane: Fleet name
      this.add.text(16, y, fleet.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff'
      }).setOrigin(0.5, 0);

      // Center lane: Fleet details
      const roleText = fleet.role === 'MINER' ? `MINER(${fleet.miningTier || 'T1'})` : 'COMBAT';
      const detailsText = `Role: ${roleText} | Moves: ${fleet.movesLeft}/${fleet.maxMoves} | Ships: ${fleet.ships.length}`;
      
      this.add.text(16, y + 25, detailsText, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cccccc'
      }).setOrigin(0.5, 0);

      // Bottom lane: Fleet composition
      const compositionText = fleet.ships.map(ship => `${ship.type} (${ship.integrity}%)`).join(', ');
      
      this.add.text(16, y + 50, compositionText, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#999999'
      }).setOrigin(0.5, 0);

      // Fleet icon
      this.add.text(16 + 200, y + 25, getFleetGlyph(fleet), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#4a9eff'
      }).setOrigin(0.5, 0);
    });
  }
}
