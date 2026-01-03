// src/core/GameState.ts
// -----------------------------------------------------------------------------
// HexFleet — Pure game state + rules (NO Phaser imports)
//
// Includes:
// - New Game bootstrap
// - Save/Load (localStorage)
// - Select system/fleet
// - Movement (adjacent hex, costs 1 move)
// - End Turn (resets moves, runs ENEMY step)
// - Mining tick (miners harvest if stationed on asteroids)
// - Build fleet (spend tiered metals)
// -----------------------------------------------------------------------------

import {
  GameState,
  Galaxy,
  Fleet,
  FleetOwner,
  FleetRole,
  ShipType,
  Ship,
  GamePhase,
  IntelKind,
  IntelEntry,
  Resources,
  TieredMetals,
  MetalTier,
  SystemIntel,
  StarSystem,
  PlanetController,
  HexCoord,
  SystemObjectType,
  SystemObjectRef
} from './types';

import { hexDistance } from '../utils/hex';

const STORAGE_KEY = 'hexfleet_save_v1';

// -----------------------------------------------------------------------------
// Balance knobs
// -----------------------------------------------------------------------------

const MOVES_PER_TURN = 2;

const MINER_YIELD_PER_TURN: Record<MetalTier, number> = {
  T1: 2, // small yield (your requirement)
  T2: 5,
  T3: 9
};

type Blueprint = {
  key: string;
  name: string;
  shipType: ShipType;
  cost: Partial<TieredMetals>;
};

const BLUEPRINTS: Blueprint[] = [
  { key: 'CORVETTE', name: 'Corvette', shipType: 'CORVETTE', cost: { T1: 10 } },
  { key: 'FRIGATE', name: 'Frigate', shipType: 'FRIGATE', cost: { T1: 15, T2: 5 } },
  { key: 'DESTROYER', name: 'Destroyer', shipType: 'DESTROYER', cost: { T2: 10, T3: 2 } },
];

function blueprintByKey(key: string): Blueprint | undefined {
  return BLUEPRINTS.find(b => b.key === key);
}

// -----------------------------------------------------------------------------
// Internal singleton state
// -----------------------------------------------------------------------------

let state: GameState;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(): string {
  // Simple deterministic-ish id for logs
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function ensureTieredMetals(tm?: TieredMetals): TieredMetals {
  return tm ?? { T1: 0, T2: 0, T3: 0 };
}

function canAfford(resources: GameState['resources'], cost: Partial<TieredMetals>): boolean {
  const tm = resources.tieredMetals;
  return (cost.T1 ?? 0) <= tm.T1 && (cost.T2 ?? 0) <= tm.T2 && (cost.T3 ?? 0) <= tm.T3;
}

function pay(resources: GameState['resources'], cost: Partial<TieredMetals>): void {
  resources.tieredMetals.T1 -= (cost.T1 ?? 0);
  resources.tieredMetals.T2 -= (cost.T2 ?? 0);
  resources.tieredMetals.T3 -= (cost.T3 ?? 0);
}

function addMetals(resources: GameState['resources'], tier: MetalTier, amount: number): void {
  resources.tieredMetals[tier] += amount;
}

function pushIntel(kind: IntelEntry['kind'], text: string): void {
  state.intelLog.push({
    id: uid(),
    turn: state.turn,
    ts: now(),
    kind,
    text
  });

  // keep log bounded
  if (state.intelLog.length > 200) {
    state.intelLog.splice(0, state.intelLog.length - 200);
  }
}

function getSystem(id: string): StarSystem | null {
  return state.galaxy[id] ?? null;
}

function systemCoord(id: string): HexCoord | null {
  const s = getSystem(id);
  return s ? s.coord : null;
}

function systemHasAsteroids(id: string): boolean {
  const s = getSystem(id);
  return !!s?.asteroids;
}

function resetMovesFor(owner: 'PLAYER' | 'ENEMY'): void {
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== owner) continue;
    f.maxMoves = MOVES_PER_TURN;
    f.movesLeft = MOVES_PER_TURN;
  }
}

// -----------------------------------------------------------------------------
// Bootstrap seed
// -----------------------------------------------------------------------------

function seedGalaxy(): Galaxy {
  const g: Galaxy = {
    SOL: {
      id: 'SOL',
      name: 'Sol',
      coord: { q: 0, r: 0 },
      seed: 1,
      discovered: true,
      type: 'STAR',
      tier: 1,
      intel: 'SCANNED',
      asteroids: { 
        metalTier: 'T1', 
        richness: 0.75,
        yieldRemaining: 100,
        totalYield: 1000 // Base total yield
      }
    },
    ALPHA: {
      id: 'ALPHA',
      name: 'Alpha',
      coord: { q: 1, r: 0 },
      seed: 2,
      discovered: false,
      type: 'STAR',
      tier: 1,
      intel: 'UNKNOWN',
      asteroids: { 
        metalTier: 'T2', 
        richness: 1.0,
        yieldRemaining: 100,
        totalYield: 1500
      }
    },
    BETA: {
      id: 'BETA',
      name: 'Beta',
      coord: { q: 0, r: 1 },
      seed: 3,
      discovered: false,
      type: 'NEBULA',
      tier: 1,
      intel: 'UNKNOWN',
      asteroids: { 
        metalTier: 'T1', 
        richness: 1.25,
        yieldRemaining: 100,
        totalYield: 1200
      }
    },
    GAMMA: {
      id: 'GAMMA',
      name: 'Gamma',
      coord: { q: -1, r: 1 },
      seed: 4,
      discovered: false,
      type: 'RUIN',
      tier: 2,
      intel: 'UNKNOWN'
    },
    DELTA: {
      id: 'DELTA',
      name: 'Delta',
      coord: { q: -1, r: 0 },
      seed: 5,
      discovered: false,
      type: 'ANOMALY',
      tier: 2,
      intel: 'UNKNOWN',
      asteroids: { 
        metalTier: 'T3', 
        richness: 0.6,
        yieldRemaining: 100,
        totalYield: 800
      }
    }
  };

  return g;
}

// -----------------------------------------------------------------------------
// Ship creation helpers
// -----------------------------------------------------------------------------

function createShip(shipType: ShipType, fleetId: string, index: number): Ship {
  const baseCosts: Record<ShipType, Partial<TieredMetals>> = {
    MINER: { T1: 8 },
    CORVETTE: { T1: 10 },
    FRIGATE: { T1: 15, T2: 5 },
    DESTROYER: { T2: 10, T3: 2 },
    CRUISER: { T2: 15, T3: 5 },
    BATTLESHIP: { T3: 12 },
    CARRIER: { T2: 20, T3: 8 }
  };

  const combatStats: Record<ShipType, { firepower: number; toughness: number; groundTroops: number; groundTroopCapacity: number }> = {
    MINER: { firepower: 1, toughness: 2, groundTroops: 0, groundTroopCapacity: 0 },
    CORVETTE: { firepower: 3, toughness: 3, groundTroops: 5, groundTroopCapacity: 10 },
    FRIGATE: { firepower: 5, toughness: 4, groundTroops: 10, groundTroopCapacity: 20 },
    DESTROYER: { firepower: 8, toughness: 6, groundTroops: 15, groundTroopCapacity: 30 },
    CRUISER: { firepower: 12, toughness: 8, groundTroops: 20, groundTroopCapacity: 40 },
    BATTLESHIP: { firepower: 20, toughness: 12, groundTroops: 30, groundTroopCapacity: 60 },
    CARRIER: { firepower: 5, toughness: 10, groundTroops: 50, groundTroopCapacity: 100 }
  };

  const stats = combatStats[shipType];
  const cost = baseCosts[shipType];

  const ship: Ship = {
    id: `${fleetId}-ship-${index}`,
    name: `${shipType}-${index + 1}`,
    type: shipType,
    integrity: 100,
    morale: 100,
    firepower: stats.firepower,
    toughness: stats.toughness,
    groundTroops: stats.groundTroops,
    groundTroopCapacity: stats.groundTroopCapacity,
    buildCost: cost
  };

  // Combat ships get weapons/armor
  if (shipType !== 'MINER') {
    ship.weapons = shipType === 'CARRIER' ? 6 : shipType === 'BATTLESHIP' ? 8 : 4;
    ship.armor = shipType === 'DESTROYER' || shipType === 'BATTLESHIP' ? 6 : 4;
  }

  return ship;
}

function calculateFleetStats(ships: Ship[]): { role: FleetRole; shipType: ShipType; integrity: number; morale: number; miningTier?: MetalTier; groundTroops: number; groundTroopCapacity: number } {
  if (ships.length === 0) {
    return { role: 'COMBAT', shipType: 'CORVETTE', integrity: 0, morale: 0, groundTroops: 0, groundTroopCapacity: 0 };
  }

  const avgIntegrity = Math.round(ships.reduce((sum, s) => sum + s.integrity, 0) / ships.length);
  const avgMorale = Math.round(ships.reduce((sum, s) => sum + s.morale, 0) / ships.length);

  // Calculate total ground troops
  const groundTroops = ships.reduce((sum, s) => sum + s.groundTroops, 0);
  const groundTroopCapacity = ships.reduce((sum, s) => sum + s.groundTroopCapacity, 0);

  // Determine role based on ship composition
  const hasMiners = ships.some(s => s.type === 'MINER');
  const role = hasMiners ? 'MINER' : 'COMBAT';

  // Determine "primary" ship type for legacy compatibility
  const shipCounts = ships.reduce((acc, ship) => {
    acc[ship.type] = (acc[ship.type] || 0) + 1;
    return acc;
  }, {} as Record<ShipType, number>);
  
  const primaryShipType = Object.entries(shipCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as ShipType || 'CORVETTE';

  // Mining tier from best miner
  const miningTier = hasMiners 
    ? ships.filter(s => s.type === 'MINER').reduce((best, s) => {
        if (!best || (s.miningTier && s.miningTier > best)) return s.miningTier || 'T1';
        return best;
      }, 'T1' as MetalTier)
    : undefined;

  return { role, shipType: primaryShipType, integrity: avgIntegrity, morale: avgMorale, miningTier, groundTroops, groundTroopCapacity };
}

function seedFleets(): Record<string, Fleet> {
  const minerShip = createShip('MINER', 'MINER-1', 0);
  const enemyShip = createShip('CORVETTE', 'ENEMY-1', 0);
  
  const minerStats = calculateFleetStats([minerShip]);
  const enemyStats = calculateFleetStats([enemyShip]);

  return {
    'MINER-1': {
      id: 'MINER-1',
      name: 'Prospector-1',
      owner: 'PLAYER',
      role: minerStats.role,
      shipType: minerStats.shipType,
      ships: [minerShip],
      location: 'SOL',
      maxMoves: MOVES_PER_TURN,
      movesLeft: MOVES_PER_TURN,
      integrity: minerStats.integrity,
      morale: minerStats.morale,
      miningTier: minerStats.miningTier,
      groundTroops: minerStats.groundTroops,
      groundTroopCapacity: minerStats.groundTroopCapacity
    },
    'ENEMY-1': {
      id: 'ENEMY-1',
      name: 'Raider-1',
      owner: 'ENEMY',
      role: enemyStats.role,
      shipType: enemyStats.shipType,
      ships: [enemyShip],
      location: 'DELTA',
      maxMoves: MOVES_PER_TURN,
      movesLeft: MOVES_PER_TURN,
      integrity: enemyStats.integrity,
      morale: enemyStats.morale,
      groundTroops: enemyStats.groundTroops,
      groundTroopCapacity: enemyStats.groundTroopCapacity
    }
  };
}

// -----------------------------------------------------------------------------
// Station building
// -----------------------------------------------------------------------------

export function buildStation(atSystemId: string, free: boolean = false): boolean {
  const sys = state.galaxy[atSystemId];
  if (!sys) return false;

  if (state.phase !== 'PLAYER') {
    pushIntel('ALERT', 'STATION BLOCKED: Not in PLAYER phase.');
    return false;
  }

  // Station cost: T1: 10, T2: 5, T3: 2
  const stationCost = { T1: 10, T2: 5, T3: 2 };

  if (!free && !canAfford(state.resources, stationCost)) {
    const tm = state.resources.tieredMetals;
    pushIntel(
      'ALERT',
      `STATION FAILED: Station costs [T1:10 T2:5 T3:2] | You have [T1:${tm.T1} T2:${tm.T2} T3:${tm.T3}]`
    );
    return false;
  }

  if (!free) {
    pay(state.resources, stationCost);
  }

  const id = `STATION-${uid()}`;
  const stationShip = createShip('CORVETTE', id, 0); // Use corvette as base for station
  stationShip.name = 'Station Module';
  stationShip.type = 'STATION' as any; // Override type for station
  const stationStats = calculateFleetStats([stationShip]);
  
  state.fleets[id] = {
    id,
    name: `Station-${sys.name}`,
    owner: 'PLAYER',
    role: stationStats.role,
    shipType: stationStats.shipType,
    ships: [stationShip],
    location: atSystemId,
    maxMoves: 0, // Stations can't move
    movesLeft: 0,
    integrity: stationStats.integrity,
    morale: stationStats.morale,
    groundTroops: stationStats.groundTroops,
    groundTroopCapacity: stationStats.groundTroopCapacity
  };

  // Add station to the system
  sys.station = {
    id,
    name: `Station-${sys.name}`,
    owner: 'PLAYER',
    type: 'MINING', // Default to mining station
    state: 'FRIENDLY',
    integrity: 100,
    functional: true
  };

  const message = free ? 
    `STATION: ${state.fleets[id].name} established at ${sys.name} (free starter).` :
    `STATION: ${state.fleets[id].name} constructed at ${sys.name}.`;
  pushIntel('BUILD', message);
  return true;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export function bootstrapGameState(): void {
  state = {
    version: 1,
    turn: 1,
    phase: 'PLAYER',
    galaxy: seedGalaxy(),
    fleets: seedFleets(),

    selectedSystemId: 'SOL',
    selectedFleetId: 'MINER-1',
    selectedSystemObject: null,

    resources: {
      tieredMetals: ensureTieredMetals(),
      alloys: 0,
      gas: 0,
      crystals: 0
    },

    intelLog: []
  };

  pushIntel('SYSTEM', 'NEW GAME: Prospector-1 online. Use E to end turn. Use 1/2/3 to build ships. Use S to build stations.');
  
  // Give player a free starter station at SOL
  buildStation('SOL', true);
}

export function getState(): GameState {
  return state;
}

export function getMovesLeft(): number {
  const f = state.selectedFleetId ? state.fleets[state.selectedFleetId] : null;
  return f ? f.movesLeft : 0;
}

export function selectSystem(systemId: string): void {
  if (!state.galaxy[systemId]) return;
  state.selectedSystemId = systemId;

  // auto-discover on selection if scanned (keeps fog simple)
  const sys = state.galaxy[systemId];
  if (sys.intel === 'UNKNOWN') {
    pushIntel('SCAN', `UNKNOWN SIGNAL: ${sys.name} selected (intel unknown).`);
  } else {
    pushIntel('SYSTEM', `SYSTEM: ${sys.name} selected.`);
  }
}

export function selectFleet(fleetId: string): void {
  if (!state.fleets[fleetId]) return;
  const f = state.fleets[fleetId];
  if (f.owner !== 'PLAYER') return; // player can only directly select player fleets
  state.selectedFleetId = fleetId;
  pushIntel('SYSTEM', `FLEET: ${f.name} selected.`);
}

// -----------------------------------------------------------------------------
// System Object Selection
// -----------------------------------------------------------------------------

export function selectSystemObject(systemId: string, objectId: string): void {
  const system = state.galaxy[systemId];
  if (!system) {
    state.selectedSystemObject = null;
    return;
  }

  // Validate object exists in system
  const objects = listSystemObjects(systemId);
  const objectExists = objects.some(obj => obj.objectId === objectId);
  
  if (objectExists) {
    state.selectedSystemObject = { systemId, objectId };
    pushIntel('SYSTEM', `OBJECT: ${objectId} selected in ${system.name}.`);
  } else {
    state.selectedSystemObject = null;
  }
}

export function getSelectedSystemObject(): { systemId: string; objectId: string } | null {
  return state.selectedSystemObject;
}

export function listSystemObjects(systemId: string): SystemObjectRef[] {
  const system = state.galaxy[systemId];
  if (!system) return [];

  const objects: SystemObjectRef[] = [];
  let objectIndex = 0;

  // Add asteroids if present
  if (system.asteroids) {
    objects.push({
      systemId,
      objectId: `${systemId}:asteroid:0`,
      type: 'asteroid',
      coord: { q: 0, r: 0 } // Will be overridden by scene positioning
    });
    objectIndex++;
  }

  // Add station if present
  if (system.station) {
    objects.push({
      systemId,
      objectId: `${systemId}:station:${system.station.id}`,
      type: 'station',
      coord: { q: 0, r: 0 } // Will be overridden by scene positioning
    });
    objectIndex++;
  }

  // Add planets if present
  if (system.planets) {
    for (const [planetId, planet] of Object.entries(system.planets)) {
      objects.push({
        systemId,
        objectId: `${systemId}:planet:${planetId}`,
        type: 'planet',
        coord: { q: 0, r: 0 } // Will be overridden by scene positioning
      });
      objectIndex++;
    }
  }

  // Add procedural anomalies (deterministic based on system seed)
  if (system.type === 'ANOMALY' || system.type === 'RUIN') {
    const anomalyCount = system.type === 'ANOMALY' ? 1 : Math.floor(system.seed % 3) + 1;
    for (let i = 0; i < anomalyCount; i++) {
      objects.push({
        systemId,
        objectId: `${systemId}:anomaly:${i}`,
        type: 'anomaly',
        coord: { q: 0, r: 0 } // Will be overridden by scene positioning
      });
    }
  }

  return objects;
}

export function moveFleet(fleetId: string, targetSystemId: string): boolean {
  const f = state.fleets[fleetId];
  const target = state.galaxy[targetSystemId];
  if (!f || !target) return false;

  if (state.phase !== 'PLAYER') {
    pushIntel('ALERT', 'MOVE BLOCKED: Not in PLAYER phase.');
    return false;
  }
  if (f.owner !== 'PLAYER') return false;
  if (f.movesLeft <= 0) {
    pushIntel('ALERT', `MOVE BLOCKED: ${f.name} has no moves left.`);
    return false;
  }

  const fromCoord = systemCoord(f.location);
  const toCoord = systemCoord(targetSystemId);
  if (!fromCoord || !toCoord) return false;

  const dist = hexDistance(fromCoord, toCoord);
  if (dist !== 1) {
    pushIntel('ALERT', `MOVE BLOCKED: ${target.name} is not adjacent.`);
    return false;
  }

  f.location = targetSystemId;
  f.movesLeft -= 1;

  // entering unknown auto-scans
  if (target.intel === 'UNKNOWN') {
    target.intel = 'SCANNED';
    target.discovered = true;
    pushIntel('SCAN', `SCAN COMPLETE: ${target.name} revealed.`);
  }

  pushIntel('MOVE', `MOVE: ${f.name} -> ${target.name} (${f.movesLeft}/${f.maxMoves} MP)`);
  return true;
}

export function getBlueprints(): Blueprint[] {
  return BLUEPRINTS.slice();
}

export function buildFleet(blueprintKey: string, atSystemId: string): boolean {
  const bp = blueprintByKey(blueprintKey);
  if (!bp) return false;

  const sys = state.galaxy[atSystemId];
  if (!sys) return false;

  if (state.phase !== 'PLAYER') {
    pushIntel('ALERT', 'BUILD BLOCKED: Not in PLAYER phase.');
    return false;
  }

  if (!canAfford(state.resources, bp.cost)) {
    const tm = state.resources.tieredMetals;
    pushIntel(
      'ALERT',
      `BUILD FAILED: ${bp.name} costs [T1:${bp.cost.T1 ?? 0} T2:${bp.cost.T2 ?? 0} T3:${bp.cost.T3 ?? 0}] | You have [T1:${tm.T1} T2:${tm.T2} T3:${tm.T3}]`
    );
    return false;
  }

  pay(state.resources, bp.cost);

  const id = `P-${bp.key}-${uid()}`;
  const newShip = createShip(bp.shipType, id, 0);
  const fleetStats = calculateFleetStats([newShip]);
  
  state.fleets[id] = {
    id,
    name: `${bp.name}-${String(Object.keys(state.fleets).length).padStart(2, '0')}`,
    owner: 'PLAYER',
    role: fleetStats.role,
    shipType: fleetStats.shipType,
    ships: [newShip],
    location: atSystemId,
    maxMoves: MOVES_PER_TURN,
    movesLeft: MOVES_PER_TURN,
    integrity: fleetStats.integrity,
    morale: fleetStats.morale,
    groundTroops: fleetStats.groundTroops,
    groundTroopCapacity: fleetStats.groundTroopCapacity
  };

  pushIntel('BUILD', `BUILD: ${state.fleets[id].name} constructed at ${sys.name}.`);
  return true;
}

// -----------------------------------------------------------------------------
// Fleet dismantling
// -----------------------------------------------------------------------------

export function dismantleFleet(fleetId: string): boolean {
  const fleet = state.fleets[fleetId];
  if (!fleet) {
    pushIntel('ALERT', 'DISMANTLE FAILED: Fleet not found.');
    return false;
  }

  if (fleet.owner !== 'PLAYER') {
    pushIntel('ALERT', 'DISMANTLE FAILED: Cannot dismantle enemy fleets.');
    return false;
  }

  if (state.phase !== 'PLAYER') {
    pushIntel('ALERT', 'DISMANTLE BLOCKED: Not in PLAYER phase.');
    return false;
  }

  // Calculate recovery: 50% of build costs rounded down
  const recoveredResources: TieredMetals = { T1: 0, T2: 0, T3: 0 };
  
  for (const ship of fleet.ships) {
    recoveredResources.T1 += Math.floor((ship.buildCost.T1 || 0) * 0.5);
    recoveredResources.T2 += Math.floor((ship.buildCost.T2 || 0) * 0.5);
    recoveredResources.T3 += Math.floor((ship.buildCost.T3 || 0) * 0.5);
  }

  // Add recovered resources to player's inventory
  state.resources.tieredMetals.T1 += recoveredResources.T1;
  state.resources.tieredMetals.T2 += recoveredResources.T2;
  state.resources.tieredMetals.T3 += recoveredResources.T3;

  // Remove the fleet
  delete state.fleets[fleetId];

  // Clear selection if this fleet was selected
  if (state.selectedFleetId === fleetId) {
    state.selectedFleetId = null;
  }

  pushIntel('DISMANTLE', `DISMANTLE: ${fleet.name} dismantled. Recovered [T1:${recoveredResources.T1} T2:${recoveredResources.T2} T3:${recoveredResources.T3}]`);
  return true;
}

// -----------------------------------------------------------------------------
// Mining tick
// -----------------------------------------------------------------------------

export function applyMiningForPlayerTurn(): void {
  // Mine once per end turn, based on current positions
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== 'PLAYER') continue;
    if (f.role !== 'MINER') continue;

    const sys = state.galaxy[f.location];
    if (!sys) continue;
    if (!sys.asteroids) continue;
    if (sys.asteroids.yieldRemaining <= 0) continue; // Skip depleted asteroids

    const minerTier = f.miningTier ?? 'T1';
    const base = MINER_YIELD_PER_TURN[minerTier];
    const gained = Math.max(0, Math.floor(base * (sys.asteroids.richness ?? 1)));

    if (gained <= 0) continue;

    // Calculate yield depletion (deplete by percentage of total yield)
    const depletionAmount = (gained / sys.asteroids.totalYield) * 100;
    sys.asteroids.yieldRemaining = Math.max(0, sys.asteroids.yieldRemaining - depletionAmount);

    addMetals(state.resources, sys.asteroids.metalTier, gained);

    const yieldStatus = sys.asteroids.yieldRemaining <= 0 ? ' [DEPLETED]' : ` [${Math.floor(sys.asteroids.yieldRemaining)}%]`;
    pushIntel(
      'MINE',
      `MINING: ${f.name} +${gained} ${sys.asteroids.metalTier} metals @ ${sys.name}${yieldStatus}`
    );
  }
}

export function isSystemBeingMined(systemId: string): boolean {
  return Object.values(state.fleets).some(f => 
    f.owner === 'PLAYER' && 
    f.role === 'MINER' && 
    f.location === systemId
  );
}

export function getMiningFleetAtSystem(systemId: string): string | null {
  const fleet = Object.values(state.fleets).find(f => 
    f.owner === 'PLAYER' && 
    f.role === 'MINER' && 
    f.location === systemId
  );
  return fleet?.id ?? null;
}

export function mineAsteroid(systemId: string, asteroidObjectId: string): boolean {
  const sys = state.galaxy[systemId];
  if (!sys) return false;

  if (state.phase !== 'PLAYER') {
    pushIntel('ALERT', 'MINING BLOCKED: Not in PLAYER phase.');
    return false;
  }

  // Check if player has miner at this system
  const miner = Object.values(state.fleets).find(f => 
    f.owner === 'PLAYER' && 
    f.role === 'MINER' && 
    f.location === systemId
  );

  if (!miner) {
    pushIntel('ALERT', 'MINING BLOCKED: No miner fleet at this system.');
    return false;
  }

  // Check if system has asteroids
  if (!sys.asteroids) {
    pushIntel('ALERT', 'MINING BLOCKED: No asteroids at this system.');
    return false;
  }

  const minerTier = miner.miningTier ?? 'T1';
  const base = MINER_YIELD_PER_TURN[minerTier];
  const gained = Math.max(0, Math.floor(base * (sys.asteroids.richness ?? 1)));

  if (gained <= 0) {
    pushIntel('ALERT', 'MINING FAILED: No resources to extract.');
    return false;
  }

  addMetals(state.resources, sys.asteroids.metalTier, gained);

  pushIntel(
    'MINE',
    `MINING: ${miner.name} +${gained} ${sys.asteroids.metalTier} metals from ${asteroidObjectId} @ ${sys.name}`
  );

  return true;
}

// -----------------------------------------------------------------------------
// Enemy phase: very simple “move toward SOL if adjacent; else do nothing”
// -----------------------------------------------------------------------------

function enemyPhaseStep(): void {
  const enemyFleets = Object.values(state.fleets).filter(f => f.owner === 'ENEMY');
  if (enemyFleets.length === 0) return;

  const sol = state.galaxy.SOL;
  if (!sol) return;

  for (const f of enemyFleets) {
    // reset enemy moves at start of enemy phase
    f.movesLeft = f.maxMoves;

    // attempt up to 1 move toward SOL (simple)
    const from = state.galaxy[f.location];
    if (!from) continue;

    // pick adjacent system that reduces distance to SOL
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const s of Object.values(state.galaxy)) {
      const d = hexDistance(from.coord, s.coord);
      if (d !== 1) continue;
      const distToSol = hexDistance(s.coord, sol.coord);
      if (distToSol < bestDist) {
        bestDist = distToSol;
        bestId = s.id;
      }
    }

    if (bestId) {
      f.location = bestId;
      f.movesLeft -= 1;
      pushIntel('MOVE', `ENEMY MOVE: ${f.name} -> ${state.galaxy[bestId].name}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Real-time game management (4X strategy)
// -----------------------------------------------------------------------------

export interface GameSpeed {
  multiplier: number;
  name: string;
}

export const GAME_SPEEDS: GameSpeed[] = [
  { multiplier: 0, name: 'PAUSED' },
  { multiplier: 1, name: 'NORMAL' },
  { multiplier: 2, name: 'FAST' },
  { multiplier: 4, name: 'VERY FAST' }
];

let currentGameSpeedIndex = 1; // Start at NORMAL speed
let gameTime = 0; // Game time in seconds
let lastUpdateTime = 0;

export function getGameSpeed(): GameSpeed {
  return GAME_SPEEDS[currentGameSpeedIndex];
}

export function setGameSpeed(index: number): void {
  if (index >= 0 && index < GAME_SPEEDS.length) {
    currentGameSpeedIndex = index;
    pushIntel('SYSTEM', `Game speed: ${getGameSpeed().name}`);
  }
}

export function getGameTime(): number {
  return gameTime;
}

export function isPaused(): boolean {
  return getGameSpeed().multiplier === 0;
}

export function updateRealTimeGame(deltaTime: number): void {
  if (isPaused()) return;

  const speed = getGameSpeed().multiplier;
  const adjustedDelta = deltaTime * speed;
  
  gameTime += adjustedDelta;

  // Update resource generation
  updateResourceGeneration(adjustedDelta);
  
  // Update fleet movements
  updateFleetMovements(adjustedDelta);
  
  // Update AI actions
  updateAIActions(adjustedDelta);
}

// -----------------------------------------------------------------------------
// Resource generation (continuous)
// -----------------------------------------------------------------------------

const RESOURCE_GENERATION_RATE = {
  T1: 0.5, // 0.5 T1 per second at base rate
  T2: 0.2, // 0.2 T2 per second
  T3: 0.1  // 0.1 T3 per second
};

function updateResourceGeneration(deltaTime: number): void {
  // Generate resources from stations
  for (const system of Object.values(state.galaxy)) {
    if (system.station && system.station.owner === 'PLAYER') {
      const stationType = system.station.type;
      
      // Different station types generate different resources
      let generationMultiplier = 1;
      if (stationType === 'MINING') generationMultiplier = 2;
      if (stationType === 'INDUSTRIAL') generationMultiplier = 1.5;
      
      // Generate resources based on station type and system resources
      if (system.asteroids) {
        const metalTier = system.asteroids.metalTier;
        const rate = RESOURCE_GENERATION_RATE[metalTier] * generationMultiplier * deltaTime;
        addMetals(state.resources, metalTier, Math.floor(rate));
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Real-time fleet movement
// -----------------------------------------------------------------------------

interface FleetMovement {
  fleetId: string;
  fromSystemId: string;
  toSystemId: string;
  startTime: number;
  duration: number; // seconds
}

let activeMovements: FleetMovement[] = [];

const MOVEMENT_TIME_PER_HEX = 3.0; // 3 seconds per hex movement

export function startFleetMovement(fleetId: string, targetSystemId: string): boolean {
  const fleet = state.fleets[fleetId];
  const targetSystem = state.galaxy[targetSystemId];
  
  if (!fleet || !targetSystem) return false;
  
  const currentSystem = state.galaxy[fleet.location];
  if (!currentSystem) return false;
  
  // Check if movement is valid (adjacent)
  if (hexDistance(currentSystem.coord, targetSystem.coord) !== 1) return false;
  
  // Check if fleet is already moving
  if (activeMovements.find(m => m.fleetId === fleetId)) return false;
  
  // Calculate movement duration based on fleet speed
  const baseDuration = MOVEMENT_TIME_PER_HEX;
  const speedMultiplier = fleet.maxMoves / 3; // Normalize to base speed
  const duration = baseDuration / speedMultiplier;
  
  // Create movement
  const movement: FleetMovement = {
    fleetId,
    fromSystemId: fleet.location,
    toSystemId: targetSystemId,
    startTime: gameTime,
    duration
  };
  
  activeMovements.push(movement);
  pushIntel('MOVE', `MOVING: ${fleet.name} → ${targetSystem.name} (${duration.toFixed(1)}s)`);
  
  return true;
}

function updateFleetMovements(deltaTime: number): void {
  const completedMovements: FleetMovement[] = [];
  
  for (const movement of activeMovements) {
    const elapsed = gameTime - movement.startTime;
    
    if (elapsed >= movement.duration) {
      // Movement completed
      const fleet = state.fleets[movement.fleetId];
      if (fleet) {
        fleet.location = movement.toSystemId;
        pushIntel('MOVE', `ARRIVED: ${fleet.name} at ${state.galaxy[movement.toSystemId].name}`);
      }
      completedMovements.push(movement);
    }
  }
  
  // Remove completed movements
  activeMovements = activeMovements.filter(m => !completedMovements.includes(m));
}

// -----------------------------------------------------------------------------
// AI actions (real-time)
// -----------------------------------------------------------------------------

let lastAIActionTime = 0;
const AI_ACTION_INTERVAL = 5.0; // AI acts every 5 seconds

function updateAIActions(deltaTime: number): void {
  lastAIActionTime += deltaTime;
  
  if (lastAIActionTime >= AI_ACTION_INTERVAL) {
    executeAIActions();
    lastAIActionTime = 0;
  }
}

function executeAIActions(): void {
  const enemyFleets = Object.values(state.fleets).filter(f => f.owner === 'ENEMY');
  
  for (const fleet of enemyFleets) {
    // Simple AI: move toward SOL if not already there
    if (fleet.location !== 'SOL') {
      const currentSystem = state.galaxy[fleet.location];
      const solSystem = state.galaxy['SOL'];
      
      if (currentSystem && solSystem) {
        // Find adjacent system closer to SOL
        let bestTarget: string | null = null;
        let bestDistance = hexDistance(currentSystem.coord, solSystem.coord);
        
        for (const [systemId, system] of Object.entries(state.galaxy)) {
          if (hexDistance(currentSystem.coord, system.coord) === 1) {
            const distanceToSol = hexDistance(system.coord, solSystem.coord);
            if (distanceToSol < bestDistance) {
              bestDistance = distanceToSol;
              bestTarget = systemId;
            }
          }
        }
        
        if (bestTarget && !activeMovements.find(m => m.fleetId === fleet.id)) {
          startFleetMovement(fleet.id, bestTarget);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Turn management (deprecated for real-time, kept for compatibility)
// -----------------------------------------------------------------------------

export interface TurnConfig {
  autoEndPlayerTurn: boolean;
  turnTimeLimit?: number; // seconds per turn (optional)
}

let turnConfig: TurnConfig = {
  autoEndPlayerTurn: false, // Default to manual for now
  turnTimeLimit: undefined
};

export function setTurnConfig(config: Partial<TurnConfig>): void {
  turnConfig = { ...turnConfig, ...config };
}

export function getTurnConfig(): TurnConfig {
  return { ...turnConfig };
}

export function hasPlayerActionsRemaining(): boolean {
  if (state.phase !== 'PLAYER') return false;
  
  // Check if any player fleet has moves left
  const playerFleets = Object.values(state.fleets).filter(f => f.owner === 'PLAYER');
  return playerFleets.some(f => f.movesLeft > 0);
}

export function canPlayerAct(): boolean {
  return state.phase === 'PLAYER';
}

export function shouldAutoEndTurn(): boolean {
  if (state.phase !== 'PLAYER') return false;
  
  // Auto-end if no player fleets have moves remaining
  return !hasPlayerActionsRemaining();
}

export function advanceTurn(): void {
  if (state.phase === 'PLAYER') {
    // End player turn
    endTurn();
  } else if (state.phase === 'ENEMY') {
    // End enemy turn and start new player turn
    state.phase = 'PLAYER';
    state.turn++;
    resetMovesFor('PLAYER');
    pushIntel('SYSTEM', `TURN ${state.turn}: Player phase begins.`);
    
    // Check for auto-end conditions
    if (shouldAutoEndTurn()) {
      setTimeout(() => {
        if (shouldAutoEndTurn()) {
          pushIntel('SYSTEM', 'Auto-ending turn: No actions remaining.');
          advanceTurn();
        }
      }, 1000); // Brief delay to show the turn start
    }
  }
}

// -----------------------------------------------------------------------------
// Turn handling (updated to use advanceTurn)
// -----------------------------------------------------------------------------

export function endTurn(): void {
  if (state.phase !== 'PLAYER') return;

  // Generate turn summary
  const turnSummary = generateTurnSummary();
  pushIntel('SYSTEM', `=== TURN ${state.turn} SUMMARY ===`);
  if (turnSummary.resourcesGained.T1 > 0 || turnSummary.resourcesGained.T2 > 0 || turnSummary.resourcesGained.T3 > 0) {
    pushIntel('MINE', `Resources gained: T1:${turnSummary.resourcesGained.T1} T2:${turnSummary.resourcesGained.T2} T3:${turnSummary.resourcesGained.T3}`);
  }
  if (turnSummary.fleetsMoved.length > 0) {
    pushIntel('MOVE', `Fleets moved: ${turnSummary.fleetsMoved.join(', ')}`);
  }
  if (turnSummary.enemyActions.length > 0) {
    pushIntel('MOVE', `Enemy actions: ${turnSummary.enemyActions.join(', ')}`);
  }

  // 1) Mining happens at end of player phase
  applyMiningForPlayerTurn();

  // 2) Switch to enemy phase
  state.phase = 'ENEMY';
  resetMovesFor('ENEMY');
  pushIntel('SYSTEM', `TURN ${state.turn}: Enemy phase begins.`);

  // 3) Execute enemy turn
  enemyPhaseStep();

  // 4) Start next turn
  state.phase = 'PLAYER';
  state.turn++;
  resetMovesFor('PLAYER');
  pushIntel('SYSTEM', `TURN ${state.turn}: Player phase begins.`);
}

interface TurnSummary {
  resourcesGained: { T1: number; T2: number; T3: number };
  fleetsMoved: string[];
  enemyActions: string[];
}

function generateTurnSummary(): TurnSummary {
  const summary: TurnSummary = {
    resourcesGained: { T1: 0, T2: 0, T3: 0 },
    fleetsMoved: [],
    enemyActions: []
  };

  // Calculate potential resource gains
  for (const fleet of Object.values(state.fleets)) {
    if (fleet.owner === 'PLAYER' && fleet.role === 'MINER') {
      const system = state.galaxy[fleet.location];
      if (system?.asteroids) {
        const minerTier = fleet.miningTier ?? 'T1';
        const base = MINER_YIELD_PER_TURN[minerTier];
        const gained = Math.max(0, Math.floor(base * (system.asteroids.richness ?? 1)));
        
        if (gained > 0) {
          summary.resourcesGained[system.asteroids.metalTier] += gained;
        }
      }
    }
  }

  return summary;
}

// -----------------------------------------------------------------------------
// Save / Load / New Game
// -----------------------------------------------------------------------------

export function saveGame(): void {
  const payload = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, payload);
  pushIntel('SYSTEM', 'SAVE: Game saved.');
}

export function loadGame(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    pushIntel('ALERT', 'LOAD FAILED: No save found.');
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as GameState;

    // minimal validation
    if (!parsed || parsed.version !== 1) {
      pushIntel('ALERT', 'LOAD FAILED: Bad save version.');
      return false;
    }
    if (!parsed.galaxy || !parsed.fleets || !parsed.resources) {
      pushIntel('ALERT', 'LOAD FAILED: Corrupt save data.');
      return false;
    }

    // ensure tiered metals exists
    parsed.resources.tieredMetals = ensureTieredMetals(parsed.resources.tieredMetals);

    state = parsed;
    pushIntel('SYSTEM', 'LOAD: Game loaded.');
    return true;
  } catch {
    pushIntel('ALERT', 'LOAD FAILED: Could not parse save.');
    return false;
  }
}

export function newGame(): void {
  bootstrapGameState();
}

// -----------------------------------------------------------------------------
// UI helper getters (optional)
// -----------------------------------------------------------------------------

export function getIntelLog(): IntelEntry[] {
  return state.intelLog;
}

// -----------------------------------------------------------------------------
// Planet and Ground Troop Mechanics
// -----------------------------------------------------------------------------

export function createPlanet(systemId: string, planetId: string, controller: PlanetController = 'NEUTRAL'): void {
  const system = state.galaxy[systemId];
  if (!system) return;

  if (!system.planets) {
    system.planets = {};
  }

  system.planets[planetId] = {
    controller,
    groundTroops: controller === 'NEUTRAL' ? 0 : 50, // Neutral planets have no troops
    defenses: controller === 'NEUTRAL' ? 20 : 40, // Basic defenses
    population: Math.floor(Math.random() * 10000) + 1000 // Random population
  };
}

export function invadePlanet(systemId: string, planetId: string, attackerFleetId: string): boolean {
  const system = state.galaxy[systemId];
  const planet = system?.planets?.[planetId];
  const fleet = state.fleets[attackerFleetId];

  if (!system || !planet || !fleet) return false;
  if (fleet.location !== systemId) return false;
  if (fleet.role !== 'COMBAT') return false;

  const attacker = fleet.owner;
  const defender = planet.controller;

  // Can't attack own planets
  if (attacker === defender) return false;

  // Calculate battle strength
  const attackerStrength = calculateFleetStrength(fleet) + fleet.groundTroops;
  const defenderStrength = planet.defenses + planet.groundTroops;

  // Battle resolution
  const attackerRoll = Math.random() * attackerStrength;
  const defenderRoll = Math.random() * defenderStrength;

  const success = attackerRoll > defenderRoll;

  // Battle results
  if (success) {
    // Attacker wins
    const attackerLosses = Math.floor(Math.random() * 0.3 * fleet.groundTroops);
    const defenderLosses = Math.floor(Math.random() * 0.8 * planet.groundTroops);
    
    fleet.groundTroops = Math.max(0, fleet.groundTroops - attackerLosses);
    planet.groundTroops = Math.max(0, planet.groundTroops - defenderLosses);
    planet.controller = attacker;
    planet.defenses = Math.max(0, planet.defenses - 20); // Reduce defenses
    
    // Leave some troops to occupy
    const occupationTroops = Math.min(fleet.groundTroops, 30);
    planet.groundTroops += occupationTroops;
    fleet.groundTroops -= occupationTroops;

    pushIntel('SYSTEM', `PLANET CONQUERED: ${planetId} now controlled by ${attacker}!`);
    return true;
  } else {
    // Defender wins
    const attackerLosses = Math.floor(Math.random() * 0.5 * fleet.groundTroops);
    const defenderLosses = Math.floor(Math.random() * 0.2 * planet.groundTroops);
    
    fleet.groundTroops = Math.max(0, fleet.groundTroops - attackerLosses);
    planet.groundTroops = Math.max(0, planet.groundTroops - defenderLosses);

    pushIntel('SYSTEM', `INVASION FAILED: ${planetId} successfully defended!`);
    return false;
  }
}

function calculateFleetStrength(fleet: Fleet): number {
  return fleet.ships.reduce((total, ship) => {
    return total + ship.firepower + ship.toughness;
  }, 0);
}

export function reinforcePlanet(systemId: string, planetId: string, fleetId: string): boolean {
  const system = state.galaxy[systemId];
  const planet = system?.planets?.[planetId];
  const fleet = state.fleets[fleetId];

  if (!system || !planet || !fleet) return false;
  if (fleet.location !== systemId) return false;
  if (fleet.owner !== planet.controller) return false;

  // Transfer troops from fleet to planet
  const transferTroops = Math.min(fleet.groundTroops, 20);
  fleet.groundTroops -= transferTroops;
  planet.groundTroops += transferTroops;

  pushIntel('SYSTEM', `PLANET REINFORCED: ${transferTroops} troops stationed on ${planetId}`);
  return true;
}

export function getPlanetController(systemId: string, planetId: string): PlanetController | null {
  const system = state.galaxy[systemId];
  return system?.planets?.[planetId]?.controller ?? null;
}

// -----------------------------------------------------------------------------
// Action wrappers that use selection
// -----------------------------------------------------------------------------

export function mineSelectedObject(): boolean {
  const selection = state.selectedSystemObject;
  if (!selection) {
    pushIntel('ALERT', 'MINING FAILED: No object selected.');
    return false;
  }

  // Parse object ID to extract type and actual ID
  const parts = selection.objectId.split(':');
  const objectType = parts[1];
  const actualObjectId = parts[2];

  if (objectType !== 'asteroid') {
    pushIntel('ALERT', 'MINING FAILED: Selected object is not an asteroid.');
    return false;
  }

  return mineAsteroid(selection.systemId, actualObjectId);
}

export function invadeSelectedObject(): boolean {
  const selection = state.selectedSystemObject;
  if (!selection) {
    pushIntel('ALERT', 'INVASION FAILED: No object selected.');
    return false;
  }

  // Parse object ID to extract type and actual ID
  const parts = selection.objectId.split(':');
  const objectType = parts[1];
  const actualObjectId = parts[2];

  if (objectType !== 'planet') {
    pushIntel('ALERT', 'INVASION FAILED: Selected object is not a planet.');
    return false;
  }

  // Find player combat fleet in system
  const playerCombatFleet = Object.values(state.fleets).find(f => 
    f.owner === 'PLAYER' && 
    f.role === 'COMBAT' && 
    f.location === selection.systemId
  );

  if (!playerCombatFleet) {
    pushIntel('ALERT', 'INVASION FAILED: No combat fleet in system.');
    return false;
  }

  return invadePlanet(selection.systemId, actualObjectId, playerCombatFleet.id);
}

export function reinforceSelectedObject(): boolean {
  const selection = state.selectedSystemObject;
  if (!selection) {
    pushIntel('ALERT', 'REINFORCEMENT FAILED: No object selected.');
    return false;
  }

  // Parse object ID to extract type and actual ID
  const parts = selection.objectId.split(':');
  const objectType = parts[1];
  const actualObjectId = parts[2];

  if (objectType !== 'planet') {
    pushIntel('ALERT', 'REINFORCEMENT FAILED: Selected object is not a planet.');
    return false;
  }

  // Find player fleet in system
  const playerFleet = Object.values(state.fleets).find(f => 
    f.owner === 'PLAYER' && 
    f.location === selection.systemId
  );

  if (!playerFleet) {
    pushIntel('ALERT', 'REINFORCEMENT FAILED: No fleet in system.');
    return false;
  }

  return reinforcePlanet(selection.systemId, actualObjectId, playerFleet.id);
}
