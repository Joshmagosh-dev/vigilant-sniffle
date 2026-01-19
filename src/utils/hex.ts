// src/utils/hex.ts
// -----------------------------------------------------------------------------
// Hex math helpers (axial q,r) - Phaser-free
// -----------------------------------------------------------------------------

import type { HexCoord } from '../core/types';

export function hexDistance(a: HexCoord, b: HexCoord): number {
  // axial distance
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (a.q + a.r) - (b.q + b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function hexKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export const HEX_DIRS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

export function hexNeighbor(c: HexCoord, dirIndex: number): HexCoord {
  const d = HEX_DIRS[((dirIndex % 6) + 6) % 6];
  return { q: c.q + d.q, r: c.r + d.r };
}

// ---------------------------------------------------------------------------
// Pixel <-> Hex conversion utilities (Phaser-free)
// ---------------------------------------------------------------------------

/**
 * Convert axial hex coordinates to pixel coordinates (pointy-top orientation)
 * @param coord - Hex coordinate {q, r}
 * @param hexSize - Size of hex (radius from center to corner)
 * @param originX - Grid origin X offset (in pixels)
 * @param originY - Grid origin Y offset (in pixels)
 * @returns Pixel coordinates {x, y}
 */
export function hexToPixel(
  coord: HexCoord, 
  hexSize: number, 
  originX: number = 0, 
  originY: number = 0
): { x: number; y: number } {
  // pointy-top axial to pixel conversion
  const x = hexSize * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = hexSize * ((3 / 2) * coord.r);
  
  return { x: x + originX, y: y + originY };
}

/**
 * Convert pixel coordinates to fractional axial hex coordinates (pointy-top orientation)
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate  
 * @param hexSize - Size of hex (radius from center to corner)
 * @param originX - Grid origin X offset (in pixels)
 * @param originY - Grid origin Y offset (in pixels)
 * @returns Fractional hex coordinates {q, r}
 */
export function pixelToHex(
  x: number, 
  y: number, 
  hexSize: number, 
  originX: number = 0, 
  originY: number = 0
): { q: number; r: number } {
  // Subtract origin offsets first
  const relX = (x - originX) / hexSize;
  const relY = (y - originY) / hexSize;
  
  // pointy-top pixel to axial conversion (fractional)
  const q = (2/3) * relX;
  const r = (-1/3) * relX + (Math.sqrt(3)/3) * relY;
  
  return { q, r };
}

/**
 * Round fractional axial coordinates to nearest hex using cube rounding
 * @param q - Fractional q coordinate
 * @param r - Fractional r coordinate
 * @returns Rounded hex coordinate {q, r}
 */
export function axialRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  
  const q_diff = Math.abs(rq - q);
  const r_diff = Math.abs(rr - r);
  const s_diff = Math.abs(rs - s);
  
  // Fix rounding errors by ensuring q + r + s = 0
  if (q_diff > r_diff && q_diff > s_diff) {
    rq = -rr - rs;
  } else if (r_diff > s_diff) {
    rr = -rq - rs;
  }
  
  return { q: rq, r: rr };
}

/**
 * Convert pixel coordinates to rounded hex coordinates (complete conversion)
 * @param worldX - World X coordinate (after camera transform)
 * @param worldY - World Y coordinate (after camera transform)
 * @param hexSize - Size of hex (radius from center to corner)
 * @param originX - Grid origin X offset (in pixels)
 * @param originY - Grid origin Y offset (in pixels)
 * @returns Rounded hex coordinate {q, r}
 */
export function pixelToHexRounded(
  worldX: number, 
  worldY: number, 
  hexSize: number, 
  originX: number = 0, 
  originY: number = 0
): HexCoord {
  const fractional = pixelToHex(worldX, worldY, hexSize, originX, originY);
  return axialRound(fractional.q, fractional.r);
}
