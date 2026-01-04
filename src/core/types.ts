// src/core/types.ts
// -----------------------------------------------------------------------------
// HexFleet — shared types (NO Phaser imports)
// -----------------------------------------------------------------------------

export type HexCoord = { q: number; r: number };

export type MetalTier = 'T1' | 'T2' | 'T3';

export type TieredMetals = {
  T1: number;
  T2: number;
  T3: number;
};

export type Resources = {
  tieredMetals: TieredMetals;
  alloys: number;
  gas: number;
  crystals: number;
};

export type SystemIntel = 'UNKNOWN' | 'SCANNED';

export type SystemObjectType = 'planet' | 'asteroid' | 'station' | 'anomaly';

export type SystemObjectRef = {
  systemId: string;
  objectId: string;
  type: SystemObjectType;
  coord: HexCoord;
};

export type StarSystemType = 
  | 'EMPTY_SPACE' 
  | 'MINING_SYSTEM' 
  | 'DERELICT' 
  | 'HOSTILE_STRONGHOLD' 
  | 'ABYSS_ZONE'
  | 'STAR' 
  | 'NEBULA' 
  | 'RUIN' 
  | 'ANOMALY'; // Keep existing for compatibility

export type StationState = 'FRIENDLY' | 'ENEMY' | 'DERELICT';

export type StationType = 'MINING' | 'INDUSTRIAL' | 'MILITARY' | 'RESEARCH';

export type Station = {
  id: string;
  name: string;
  owner: 'PLAYER' | 'ENEMY' | 'NEUTRAL';
  type: StationType;
  state: StationState;
  integrity: number; // 0..100
  functional: boolean; // can be repaired/rebuilt
};

export type Asteroids = {
  metalTier: MetalTier;
  richness: number; // 0.5 .. 2.0 multiplier
  yieldRemaining: number; // 0..100 percentage
  totalYield: number; // Total resources when 100%
};

export type PlanetController = 'PLAYER' | 'ENEMY' | 'NEUTRAL' | 'CONTESTED';

export type PlanetDefense = {
  control: PlanetController;
  garrison: number;
  fortification: number;
  unrest: number;
};

export type Invasion = {
  planetId: string;
  attacker: 'PLAYER' | 'ENEMY';
  invasionStrength: number;
  turnsOngoing: number;
};

export type Planet = {
  controller: PlanetController;
  groundTroops: number; // Troops stationed on planet
  defenses: number; // Planetary defense strength 0-100
  population: number; // Civilian population (for resource generation)
  // NEW: Invasion system fields
  defense: PlanetDefense;
  invasion?: Invasion;
};

export type StarSystem = {
  id: string;
  name: string;
  coord: HexCoord;
  seed: number;

  discovered: boolean;
  type: StarSystemType;
  tier: number;

  intel: SystemIntel;

  // Mining: if present, miners can extract per turn while stationed here
  asteroids?: Asteroids;

  // NEW: Stations can exist in systems
  station?: Station;

  // NEW: Planets can be controlled and fought over
  planets?: Record<string, Planet>;
};

export type Galaxy = Record<string, StarSystem>;

export type FleetOwner = 'PLAYER' | 'ENEMY';

export type FleetRole = 'MINER' | 'COMBAT';

export type ShipType =
  | 'MINER'
  | 'CORVETTE'
  | 'FRIGATE'
  | 'DESTROYER'
  | 'CRUISER'
  | 'BATTLESHIP'
  | 'CARRIER';

export type Ship = {
  id: string;
  type: ShipType;
  name: string;
  integrity: number; // 0..100
  morale: number; // 0..100
  
  // Combat stats
  firepower: number; // Attack power
  toughness: number; // Defense power
  
  // Ground troops for planetary invasion
  groundTroops: number;
  groundTroopCapacity: number;
  
  // Mining specific (only for MINER ships)
  miningTier?: MetalTier;
  
  // Combat specific
  weapons?: number; // weapon slots
  armor?: number; // armor value
  
  // Cost for rebuilding/dismantling calculations
  buildCost: Partial<TieredMetals>;
};

export type Fleet = {
  id: string;
  name: string;
  owner: FleetOwner;

  // Legacy compatibility - derived from ships composition
  role: FleetRole;
  shipType: ShipType;

  // NEW: Ship composition (authoritative)
  ships: Ship[];

  // Location is a systemId (NOT a coord)
  location: string;

  // NEW: System-level position for hex-based movement within systems
  systemPos?: HexCoord;

  // NEW: System-level anchor for presentation (serializable)
  systemAnchor?: 'STAR' | `PLANET:${string}` | `ASTEROID:${string}` | `STATION:${string}`;

  // Turn movement points (determined by fleet composition)
  movesLeft: number;
  maxMoves: number;

  // Fleet-wide stats (aggregated from ships)
  integrity: number; // 0..100 (average of ships)
  morale: number; // 0..100 (average of ships)

  // Mining: derived from miner ships in fleet
  miningTier?: MetalTier;

  // Ground troops for planetary invasion
  groundTroops: number;
  groundTroopCapacity: number;
};

export type GamePhase = 'PLAYER' | 'ENEMY';

export type IntelKind = 'MOVE' | 'SCAN' | 'MINE' | 'BUILD' | 'DISMANTLE' | 'ALERT' | 'SYSTEM';

export type IntelEntry = {
  id: string;
  turn: number;
  ts: number;
  kind: IntelKind;
  text: string;
};

export type GameState = {
  version: 1;

  turn: number;
  phase: GamePhase;

  galaxy: Galaxy;
  fleets: Record<string, Fleet>;

  // Selected ids (UI reads these)
  selectedSystemId: string | null;
  selectedFleetId: string | null;
  selectedSystemObject: { systemId: string; objectId: string } | null;

  resources: Resources;

  intelLog: IntelEntry[];
};
