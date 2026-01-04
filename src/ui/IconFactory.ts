// src/ui/IconFactory.ts
// -----------------------------------------------------------------------------
// HexFleet — Fleet Icon Factory (Phaser-based, no assets required)
// -----------------------------------------------------------------------------

import Phaser from 'phaser';
import { FleetOwner, FleetRole } from '../core/types';

export type FleetIconColors = {
  PLAYER: number;
  ENEMY: number;
  NEUTRAL: number;
};

export const DEFAULT_FLEET_COLORS: FleetIconColors = {
  PLAYER: 0x49b36d,    // Green
  ENEMY: 0xff4444,     // Red  
  NEUTRAL: 0x4a4f5a,   // Gray
};

/**
 * Create a fleet icon container with ship marker and optional label
 * @param scene - Phaser scene
 * @param x - X position
 * @param y - Y position
 * @param owner - Fleet owner for coloring
 * @param role - Fleet role for icon shape
 * @param label - Optional text label (fleet name/ID)
 * @param colors - Custom colors (optional)
 * @returns Phaser.GameObjects.Container with icon and label
 */
export function createFleetIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  owner: FleetOwner,
  role: FleetRole,
  label?: string,
  colors: FleetIconColors = DEFAULT_FLEET_COLORS
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  
  // Get color based on owner
  const color = colors[owner];
  
  // Create icon based on role
  const icon = createShipIcon(scene, 0, 0, role, color);
  container.add(icon);
  
  // Add label if provided
  if (label) {
    const text = scene.add.text(0, 12, label, {
      font: '10px monospace',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5, 0);
    
    container.add(text);
  }
  
  // Set container size for interaction
  container.setSize(16, 16);
  container.setInteractive();
  
  return container;
}

/**
 * Create a ship icon based on fleet role
 * @param scene - Phaser scene
 * @param x - X position
 * @param y - Y position  
 * @param role - Fleet role determines shape
 * @param color - Fill color
 * @returns Phaser.GameObjects.Graphics with ship shape
 */
function createShipIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  role: FleetRole,
  color: number
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  
  // Set fill and stroke
  graphics.fillStyle(color, 1);
  graphics.lineStyle(1, 0xffffff, 0.8);
  
  switch (role) {
    case 'MINER':
      // Diamond shape for miners
      drawDiamond(graphics, x, y, 6);
      break;
      
    case 'COMBAT':
      // Triangle/chevron for combat ships
      drawTriangle(graphics, x, y, 7);
      break;
      
    default:
      // Circle fallback
      graphics.fillCircle(x, y, 5);
      graphics.strokeCircle(x, y, 5);
      break;
  }
  
  return graphics;
}

/**
 * Draw a diamond shape
 */
function drawDiamond(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const points = [
    { x: x, y: y - size },      // Top
    { x: x + size, y: y },      // Right
    { x: x, y: y + size },      // Bottom
    { x: x - size, y: y }       // Left
  ];
  
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

/**
 * Draw a triangle pointing up
 */
function drawTriangle(graphics: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const points = [
    { x: x, y: y - size },      // Top point
    { x: x + size * 0.8, y: y + size * 0.6 },  // Bottom right
    { x: x - size * 0.8, y: y + size * 0.6 }   // Bottom left
  ];
  
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

/**
 * Create a pulse animation for a container
 * @param scene - Phaser scene
 * @param target - Container to pulse
 * @param duration - Animation duration in ms
 * @param scale - Max scale to reach
 * @returns Promise that resolves when animation completes
 */
export function createPulseAnimation(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  duration: number = 300,
  scale: number = 1.3
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      scaleX: scale,
      scaleY: scale,
      duration: duration / 2,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => resolve()
    });
  });
}

/**
 * Create a fade animation for a container
 * @param scene - Phaser scene
 * @param target - Container to fade
 * @param fromAlpha - Starting alpha
 * @param toAlpha - Ending alpha
 * @param duration - Animation duration in ms
 * @returns Promise that resolves when animation completes
 */
export function createFadeAnimation(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  fromAlpha: number,
  toAlpha: number,
  duration: number = 200
): Promise<void> {
  target.setAlpha(fromAlpha);
  
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      alpha: toAlpha,
      duration: duration,
      ease: 'Linear',
      onComplete: () => resolve()
    });
  });
}
