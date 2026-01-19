// src/utils/rng.ts
// -----------------------------------------------------------------------------
// HexFleet — Deterministic Random Number Generation
//
// Provides seeded random number generation for deterministic gameplay
// Uses Mulberry32 algorithm for good distribution and performance
// -----------------------------------------------------------------------------

export class SeededRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next random number in [0, 1)
   * Uses Mulberry32 algorithm
   */
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Generate random integer in [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Choose random element from array
   */
  nextChoice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Generate random boolean with given probability
   */
  nextBoolean(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Create new RNG with derived seed
   */
  derive(seedModifier: number): SeededRNG {
    return new SeededRNG(this.seed ^ seedModifier);
  }
}

/**
 * Create seeded RNG for galaxy generation
 */
export function createGalaxyRNG(seed: number): SeededRNG {
  return new SeededRNG(seed);
}

/**
 * Create seeded RNG for system-specific generation
 */
export function createSystemRNG(galaxySeed: number, coord: { q: number; r: number }): SeededRNG {
  const systemSeed = galaxySeed ^ (coord.q * 31 + coord.r * 17);
  return new SeededRNG(systemSeed);
}
