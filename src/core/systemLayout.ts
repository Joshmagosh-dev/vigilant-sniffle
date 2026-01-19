// src/core/systemLayout.ts
// -----------------------------------------------------------------------------
// HexFleet — Deterministic System Layout Helpers
//
// Provides deterministic positioning for system objects like asteroids
// Ensures GameState and SystemScene agree on object positions
// -----------------------------------------------------------------------------

import type { StarSystem, HexCoord } from './types';

/**
 * Get the deterministic hex coordinate for the asteroid in a system
 * @param sys - The star system to get asteroid position for
 * @returns Hex coordinate of asteroid or null if no asteroids exist
 */
export function getAsteroidHex(sys: StarSystem): HexCoord | null {
  if (!sys.asteroids) return null;

  // Deterministic placement based on system seed
  // Use simple pattern for now: place at (1, 0) offset from center
  // This can be expanded later for more complex layouts
  const seed = sys.seed || 0;
  
  // Generate deterministic offset based on seed
  // This ensures different systems can have asteroids in different positions
  // but the same system always has the same asteroid position
  const offsetIndex = seed % 6; // 6 possible positions around center
  const offsets = [
    { q: 1, r: 0 },   // East
    { q: 0, r: 1 },   // South-East
    { q: -1, r: 1 },  // South-West
    { q: -1, r: 0 },  // West
    { q: 0, r: -1 },  // North-West
    { q: 1, r: -1 },  // North-East
  ];
  
  return offsets[offsetIndex];
}

/**
 * Check if a hex coordinate matches the asteroid position in a system
 * @param sys - The star system
 * @param coord - The coordinate to check
 * @returns True if coord matches asteroid position
 */
export function isAsteroidHex(sys: StarSystem, coord: HexCoord): boolean {
  const asteroidHex = getAsteroidHex(sys);
  if (!asteroidHex) return false;
  
  return coord.q === asteroidHex.q && coord.r === asteroidHex.r;
}

/**
 * Get all deterministic object positions for a system
 * @param sys - The star system
 * @returns Array of object positions and types
 */
export function getSystemObjectPositions(sys: StarSystem): Array<{coord: HexCoord, type: 'asteroid' | 'station' | 'planet'}> {
  const positions: Array<{coord: HexCoord, type: 'asteroid' | 'station' | 'planet'}> = [];
  
  // Add asteroid position
  const asteroidHex = getAsteroidHex(sys);
  if (asteroidHex) {
    positions.push({ coord: asteroidHex, type: 'asteroid' });
  }
  
  // TODO: Add station and planet positions later if needed
  // For now, focus on asteroid positioning
  
  return positions;
}
