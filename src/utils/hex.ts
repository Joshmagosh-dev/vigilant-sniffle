// src/utils/hex.ts
// -----------------------------------------------------------------------------
// Hex math helpers (axial q,r)
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
