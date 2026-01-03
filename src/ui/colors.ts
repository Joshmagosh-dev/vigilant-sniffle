// src/ui/colors.ts
// -----------------------------------------------------------------------------
// HexFleet — Single Source of Truth for Colors
// 
// COLOR SEMANTICS (LOCK THIS):
// - Player/Friendly affiliation = BLUE (0x4a9eff)
// - Enemy affiliation = RED (0xff4444) 
// - Neutral/Unknown affiliation = GRAY (0x4a4f5a)
// - Derelict/Raidable affiliation = HOLLOW icon + GRAY stroke (no fill)
// - "Reachable / in-move-range" highlight = GREEN stroke only (0x49b36d)
// - "Selected" highlight = bright WHITE stroke (0xffffff)
// - "Hover" highlight = subtle BLUE stroke (0x4a9eff)
// 
// CRITICAL: Affiliation colors NEVER get overridden by highlight colors.
// Highlights use stroke-only on dedicated layers drawn after affiliation fills.
// -----------------------------------------------------------------------------

export type Affiliation = 'PLAYER' | 'ENEMY' | 'NEUTRAL' | 'UNKNOWN' | 'DERELICT' | 'CONTESTED';
export type HighlightType = 'reachable' | 'selected' | 'hover';

export interface AffiliationColors {
  fill?: number;           // undefined for hollow (derelict)
  stroke: number;          // always defined
  hollow?: boolean;        // true for derelict (no fill)
}

export interface HighlightStyle {
  stroke: number;
  alpha: number;
  width: number;
}

// AFFILIATION COLORS - Single source of truth
export function getAffiliationColor(affiliation: Affiliation): AffiliationColors {
  switch (affiliation) {
    case 'PLAYER':
      return { fill: 0x4a9eff, stroke: 0x4a9eff }; // BLUE
    case 'ENEMY':
      return { fill: 0xff4444, stroke: 0xff4444 }; // RED
    case 'NEUTRAL':
      return { fill: 0x4a4f5a, stroke: 0x4a4f5a }; // GRAY
    case 'UNKNOWN':
      return { fill: 0x4a4f5a, stroke: 0x4a4f5a }; // GRAY
    case 'DERELICT':
      return { stroke: 0x4a4f5a, hollow: true }; // HOLLOW + GRAY stroke
    case 'CONTESTED':
      return { fill: 0xffaa00, stroke: 0xffaa00 }; // ORANGE
    default:
      return { fill: 0x4a4f5a, stroke: 0x4a4f5a }; // GRAY fallback
  }
}

// HIGHLIGHT STYLES - Stroke only, never override fill
export function getHighlightStyle(type: HighlightType): HighlightStyle {
  switch (type) {
    case 'reachable':
      return { stroke: 0x49b36d, alpha: 0.8, width: 2 }; // GREEN stroke
    case 'selected':
      return { stroke: 0xffffff, alpha: 1.0, width: 3 }; // WHITE stroke
    case 'hover':
      return { stroke: 0x4a9eff, alpha: 0.6, width: 2 }; // BLUE stroke
    default:
      return { stroke: 0xffffff, alpha: 0.5, width: 1 }; // WHITE fallback
  }
}

// Helper to determine affiliation from game state
export function getSystemAffiliation(
  systemId: string, 
  hasPlayerFleet: boolean, 
  hasEnemyFleet: boolean,
  intel: string
): Affiliation {
  if (hasPlayerFleet) return 'PLAYER';
  if (hasEnemyFleet) return 'ENEMY';
  if (intel === 'UNKNOWN') return 'UNKNOWN';
  return 'NEUTRAL';
}

export function getStationAffiliation(stationState: string): Affiliation {
  switch (stationState) {
    case 'FRIENDLY': return 'PLAYER';
    case 'ENEMY': return 'ENEMY'; 
    case 'DERELICT': return 'DERELICT';
    default: return 'NEUTRAL';
  }
}

export function getPlanetAffiliation(controller: string): Affiliation {
  switch (controller) {
    case 'PLAYER': return 'PLAYER';
    case 'ENEMY': return 'ENEMY';
    case 'CONTESTED': return 'CONTESTED';
    default: return 'NEUTRAL';
  }
}
