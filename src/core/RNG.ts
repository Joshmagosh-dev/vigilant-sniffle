/**
 * RNG.ts
 * --------------------------------------------------------------------
 * Deterministic RNG utilities for HexFleet.
 *
 * Why this exists:
 * - HexFleet requires determinism (same seed => same galaxy, outcomes).
 * - We must NEVER use Math.random() in gameplay logic.
 *
 * Design:
 * - `makeRng(seed)` returns a function `rng()` that yields numbers in [0, 1).
 * - Includes helpers for ints, picks, and weighted selection.
 */

/** A function that returns a deterministic float in [0, 1). */
export type RNG = () => number;

/**
 * Creates a deterministic RNG function using the Mulberry32 algorithm.
 * Mulberry32 is simple, fast, and repeatable.
 *
 * @param seed Any integer seed. Non-integers will be coerced.
 * @returns rng() => number in [0, 1)
 */
export function makeRng(seed: number): RNG {
  // Force seed to unsigned 32-bit integer.
  let t = seed >>> 0;

  return function rng() {
    // Mulberry32 step
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    // Convert to [0,1)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a deterministic integer in [min, max], inclusive.
 */
export function randInt(rng: RNG, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const n = Math.floor(rng() * (hi - lo + 1)) + lo;
  return n;
}

/**
 * Returns a deterministic float in [min, max).
 */
export function randFloat(rng: RNG, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/**
 * Returns a deterministic element from an array.
 * Throws if array is empty (intentional: empty pick is a logic bug).
 */
export function pickOne<T>(rng: RNG, arr: T[]): T {
  if (arr.length === 0) throw new Error('pickOne() called with empty array');
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Weighted selection helper.
 * Each item has a `weight` > 0. Higher weight => more likely.
 * Throws if total weight <= 0 (invalid config).
 */
export function pickWeighted<T>(rng: RNG, items: { item: T; weight: number }[]): T {
  const total = items.reduce((sum, it) => sum + Math.max(0, it.weight), 0);
  if (total <= 0) throw new Error('pickWeighted() called with non-positive total weight');

  const roll = rng() * total;
  let acc = 0;

  for (const it of items) {
    acc += Math.max(0, it.weight);
    if (roll <= acc) return it.item;
  }

  // Fallback due to floating point edges.
  return items[items.length - 1].item;
}
