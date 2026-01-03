// src/ui/IconKit.ts
// -----------------------------------------------------------------------------
// HexFleet — IconKit
//
// PURPOSE:
// Central place for choosing glyph icons for fleets, stations, intel, alerts.
//
// REQUIRED UPDATE (per user):
// - Stations are ALWAYS a diamond: ◆
// - Combat fleets use tier-based triangles:
//     Tier 1: ▲
//     Tier 2: △
//     Tier 3: ⟁  (with graceful fallback if unsupported)
// - Non-combat/special fleets must NOT use combat triangles
//
// DESIGN NOTES:
// - This file should be PURE: return glyph strings (and optional colors) only.
// - Keep the "decision logic" centralized and readable.
// -----------------------------------------------------------------------------

export type IconDecisionInput = {
  // common identifiers seen across refactors
  id?: string;
  name?: string;

  // fleet/system object may expose one or more of these
  type?: string;        // e.g. 'FLEET', 'STATION', 'MINER', 'FRIGATE', etc.
  shipType?: string;    // e.g. 'FRIGATE' | 'CORVETTE' | 'MINER' | ...
  kind?: string;        // e.g. 'STATION', 'FLEET'
  category?: string;    // e.g. 'COMBAT', 'CIVILIAN', 'STATION'
  role?: string;        // e.g. 'COMBAT', 'MINER', 'SCOUT'
  isStation?: boolean;  // explicit flags sometimes exist
  mobile?: boolean;     // stations tend to be non-mobile

  // tier (1..3+) if present
  tier?: number;

  // faction / ownership sometimes used for color (optional)
  faction?: string;
  owner?: 'PLAYER' | 'ENEMY' | 'NEUTRAL' | string;
};

// -----------------------------------------------------------------------------
// Glyph constants
// -----------------------------------------------------------------------------

// Stations: diamond, always.
const GLYPH_STATION = '◆';

// Combat fleet tier triangles.
const GLYPH_COMBAT_T1 = '▲';
const GLYPH_COMBAT_T2 = '△';

// Tier 3: prefer ⟁ but many fonts don’t have it.
// We'll attempt ⟁, then fallback to ▲ (solid triangle).
const GLYPH_COMBAT_T3_PRIMARY = '⟁';
const GLYPH_COMBAT_T3_FALLBACK = '▲';

// Non-combat glyphs (keep simple + readable)
const GLYPH_MINER = '⛏';   // if unsupported, fallback handled below
const GLYPH_SCOUT = '•';
const GLYPH_CIVILIAN = '○';

// Generic fallback
const GLYPH_UNKNOWN = '•';

// If your font does not support ⛏, replace with 'M' or '⚒'
const FALLBACK_MINER = 'M';

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Main glyph selector for "things on the map" (fleets, stations, etc.)
 * Keep this the single source of truth.
 */
export function getEntityGlyph(input: IconDecisionInput): string {
  // 1) Stations are ALWAYS diamond.
  if (isStation(input)) return GLYPH_STATION;

  // 2) Combat fleets use tier-based triangles.
  if (isCombatFleet(input)) {
    const tier = normalizeTier(input.tier);
    if (tier === 1) return GLYPH_COMBAT_T1;
    if (tier === 2) return GLYPH_COMBAT_T2;
    // tier 3+
    return preferGlyph(GLYPH_COMBAT_T3_PRIMARY, GLYPH_COMBAT_T3_FALLBACK);
  }

  // 3) Non-combat / special fleets (no combat triangles).
  if (isMiner(input)) return preferGlyph(GLYPH_MINER, FALLBACK_MINER);
  if (isScout(input)) return GLYPH_SCOUT;
  if (isCivilian(input)) return GLYPH_CIVILIAN;

  // 4) Unknown/default.
  return GLYPH_UNKNOWN;
}

/**
 * Optional: if your UI expects a "fleet glyph" specifically,
 * keep a wrapper for backwards compatibility.
 */
export function getFleetGlyph(fleet: IconDecisionInput): string {
  return getEntityGlyph(fleet);
}

/**
 * Optional: if your UI expects a "station glyph" specifically,
 * keep a wrapper for backwards compatibility.
 */
export function getStationGlyph(_station?: IconDecisionInput): string {
  return GLYPH_STATION;
}

// -----------------------------------------------------------------------------
// Backwards compatibility exports
// -----------------------------------------------------------------------------

export function fleetGlyph(fleet: IconDecisionInput): string {
  return getEntityGlyph(fleet);
}

export function systemGlyph(intel: 'UNKNOWN' | 'SCANNED'): string {
  return intel === 'UNKNOWN' ? '·' : '◆';
}

export function fleetColor(fleet: IconDecisionInput): string {
  // Assuming VisualStyle is available - you may need to import this
  // For now, return basic colors based on type
  if (isMiner(fleet)) return '#4a9eff'; // blue for miners
  if (isStation(fleet)) return '#49b36d'; // green for stations
  return '#cfE3FF'; // default for combat
}

// -----------------------------------------------------------------------------
// Helpers: classification
// -----------------------------------------------------------------------------

function isStation(input: IconDecisionInput): boolean {
  if (input.isStation === true) return true;

  const st = upper(input.shipType);
  
  // Only STATION shipType should be a station
  if (st === 'STATION') return true;
  
  return false;
}

function isCombatFleet(input: IconDecisionInput): boolean {
  const t = upper(input.type);
  const st = upper(input.shipType);
  const c = upper(input.category);
  const r = upper(input.role);

  // Explicit category/role
  if (c.includes('COMBAT')) return true;
  if (r.includes('COMBAT')) return true;

  // Ship types that are typically combat
  // Adjust this list to match your types.ts ShipType union.
  const combatShipTypes = [
    'FRIGATE',
    'CORVETTE',
    'DESTROYER',
    'CRUISER',
    'BATTLESHIP',
    'CARRIER'
  ];

  if (combatShipTypes.includes(st)) return true;
  if (combatShipTypes.includes(t)) return true;

  // If you tag fleets as 'FLEET' with a separate role elsewhere, keep conservative:
  return false;
}

function isMiner(input: IconDecisionInput): boolean {
  const t = upper(input.type);
  const st = upper(input.shipType);
  const r = upper(input.role);
  return t.includes('MINER') || st === 'MINER' || r.includes('MINER');
}

function isScout(input: IconDecisionInput): boolean {
  const t = upper(input.type);
  const st = upper(input.shipType);
  const r = upper(input.role);
  return t.includes('SCOUT') || st === 'SCOUT' || r.includes('SCOUT');
}

function isCivilian(input: IconDecisionInput): boolean {
  const t = upper(input.type);
  const st = upper(input.shipType);
  const r = upper(input.role);
  const c = upper(input.category);

  if (c.includes('CIVIL')) return true;
  if (r.includes('CIVIL')) return true;

  // Example civilian-ish ship types (customize if you have them)
  if (st === 'PROSPECTOR') return true;

  // If explicitly marked
  if (t.includes('CIVIL')) return true;

  return false;
}

// -----------------------------------------------------------------------------
// Helpers: utilities
// -----------------------------------------------------------------------------

function normalizeTier(tier?: number): 1 | 2 | 3 {
  const n = Math.floor(Number.isFinite(tier as number) ? (tier as number) : 1);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function upper(v?: string): string {
  return (v ?? '').toString().toUpperCase();
}

/**
 * "Graceful fallback" for glyphs that might not exist in the active font.
 * We can’t truly detect font support without rendering, so we provide a manual fallback hook.
 *
 * If you know your font supports it, just return primary.
 */
function preferGlyph(primary: string, fallback: string): string {
  // Keep primary by default. If you ever need to force fallback globally,
  // change this function to return fallback.
  return primary || fallback;
}
