import Phaser from 'phaser';
import type { HexCoord } from '../core/types';

export type HexToWorldFn = (q: number, r: number) => { x: number; y: number };

export class MovementOverlay {
  private gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private hexToWorld: HexToWorldFn,
    private hexRadius: number,
    private pointyTop: boolean = false
  ) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(50);
  }

  clear(): void {
    this.gfx.clear();
  }

  draw(tiles: HexCoord[]): void {
    this.gfx.clear();

    if (!tiles.length) return;

    this.gfx.lineStyle(2, 0x4aa3ff, 0.55);

    for (const t of tiles) {
      const { x, y } = this.hexToWorld(t.q, t.r);
      this.strokeHex(x, y);
    }
  }

  private strokeHex(cx: number, cy: number): void {
    const startAngle = this.pointyTop ? Math.PI / 6 : 0;

    this.gfx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = startAngle + (Math.PI / 3) * i;
      const px = cx + this.hexRadius * Math.cos(angle);
      const py = cy + this.hexRadius * Math.sin(angle);

      if (i === 0) this.gfx.moveTo(px, py);
      else this.gfx.lineTo(px, py);
    }
    this.gfx.closePath();
    this.gfx.strokePath();
  }
}
