# HEX FLEET — TECHNICAL DESIGN DOCUMENT (TDD)

**Locked stack:** Phaser 3 (Phaser JS) + TypeScript

Version: 0.1 (Foundation)
Last updated: 2025-12-27

---

# 1. Purpose

This Technical Design Document (TDD) defines how **HexFleet** is implemented in this repository, and how we will extend it through Phase 1+ without breaking core design rules.

This doc is intentionally biased toward:

- **Determinism** (seeded/procedural galaxy, reproducible outcomes)
- **Separation of concerns** (pure rules/state vs Phaser rendering)
- **Testability** (core gameplay logic unit-testable without Phaser)

---

# 2. Goals / Non-goals

## 2.1 Goals

- **Pure GameState layer**
  - All game rules live in `src/core/*` and can run without Phaser.
  - Phaser scenes render state and call GameState actions.
- **Turn-based on a hex galaxy map**
  - Axial coordinates `(q,r)`.
  - Adjacent movement costs 1 MP.
  - Player phase then enemy phase.
- **Fog / Intel-first play**
  - Systems start `UNKNOWN`, become `SCANNED` via exploration/scanning.
- **Resource loop (Phase 1 foundation)**
  - Mining yields tiered metals per turn for miner fleets.
  - Building new fleets consumes tiered metals.
- **Persistence**
  - Save/load via `localStorage` with versioning.

## 2.2 Non-goals (Phase 1)

- **No tactical combat scene** (combat is abstracted).
- **No complex pathfinding** (adjacent-only movement for now).
- **No multiplayer**.
- **No server persistence** (local only).

---

# 3. Repository Architecture (as implemented)

## 3.1 Module boundaries

- **`src/core/types.ts`**
  - Authoritative shared types (no Phaser imports).
- **`src/core/GameState.ts`**
  - Authoritative rules + state transitions.
  - Owns save/load/new game.
  - Exposes a small action API consumed by scenes.
- **`src/scenes/*`**
  - Phaser scenes.
  - Render-only; they read from `getState()` and mutate via actions.
- **`src/ui/*`**
  - Visual constants (`VisualStyle`) and glyph helpers (`IconKit`).
- **`src/utils/*`**
  - Math helpers (hex axial distance/neighboring, etc.).

## 3.2 Key invariant

- **No Phaser objects inside `GameState`**
  - `GameState` must remain serializable to JSON.

---

# 4. Current Gameplay Implementation Snapshot

The repo already implements a working foundation:

- **Galaxy** is currently hard-seeded with a small number of systems (`seedGalaxy()` in `GameState.ts`).
- **Fleets** include one player miner and one enemy raider (`seedFleets()`).
- **Movement** is adjacent-only (`hexDistance(...) === 1`), consumes `movesLeft`.
- **Fog/Intel** is simplified: entering an `UNKNOWN` system auto-converts it to `SCANNED` and `discovered = true`.
- **Mining** occurs once per end-turn for each player miner fleet stationed on `sys.asteroids`.
- **Enemy phase** is a minimal behavior: enemy fleet moves 1 step toward `SOL`.
- **Build** hotkeys allow creating combat fleets if resources allow.
- **UI** is “text-first”: the Galaxy scene renders a hex grid and overlays text blocks (header, fleet list, intel feed).

---

# 5. Data Model (authoritative)

All types below are defined in `src/core/types.ts`.

## 5.1 Coordinates

- **`HexCoord`**
  - `{ q: number; r: number }` (axial).

## 5.2 Systems

- **`StarSystem`** (UPDATED)
  - `id`, `name`
  - `coord: HexCoord`
  - `seed: number`
  - `discovered: boolean`
  - `type: StarSystemType` (expanded to include GDD types)
  - `tier: number` (difficulty/depth)
  - `intel: 'UNKNOWN' | 'SCANNED'`
  - `asteroids?: { metalTier: 'T1' | 'T2' | 'T3'; richness: number }`
  - `station?: Station` (NEW: stations can exist in systems)

- **`StationState`** (NEW)
  - `'FRIENDLY' | 'ENEMY' | 'DERELICT'`

- **`Station`** (NEW)
  - `id`, `name`
  - `state: StationState`
  - `integrity: number` (0..100)
  - `functional: boolean` (can be repaired/rebuilt)

- **`StarSystemType`** (UPDATED)
  - GDD-aligned: `'EMPTY_SPACE' | 'MINING_SYSTEM' | 'DERELICT' | 'HOSTILE_STRONGHOLD' | 'ABYSS_ZONE'`
  - Legacy compatibility: `'STAR' | 'NEBULA' | 'RUIN' | 'ANOMALY'`

- **`Galaxy`**
  - `Record<string, StarSystem>` keyed by system `id`.

## 5.3 Fleets

- **`Ship`** (UPDATED)
  - Identity: `id`, `name`, `type: ShipType`
  - Status: `integrity` (0..100), `morale` (0..100)
  - Mining: `miningTier?: MetalTier` (only for MINER ships)
  - Combat: `weapons?: number`, `armor?: number` (for combat ships)
  - Economics: `buildCost: Partial<TieredMetals>` (for dismantling calculations)
  - **NEW**: Ship tier affects combat effectiveness and build costs

- **`Fleet`** (UPDATED)
  - Identity: `id`, `name`, `owner: 'PLAYER' | 'ENEMY'`
  - Composition: `ships: Ship[]` (authoritative ship array)
  - Legacy compatibility: `role: FleetRole`, `shipType: ShipType` (derived from ships)
  - Position: `location: string` (system id)
  - Turn economy: `movesLeft`, `maxMoves`
  - Status: `integrity` (0..100), `morale` (0..100) (aggregated from ships)
  - Mining: `miningTier?: MetalTier` (derived from best miner ship)

## 5.4 Resources

- **`Resources`**
  - `tieredMetals: { T1; T2; T3 }`
  - `alloys`, `gas`, `crystals` (reserved for later loops)

## 5.5 Intel log

- **`IntelEntry`**
  - `id`, `turn`, `ts`
  - `kind: 'MOVE' | 'SCAN' | 'MINE' | 'BUILD' | 'DISMANTLE' | 'ALERT' | 'SYSTEM'` (UPDATED: added DISMANTLE)
  - `text` (human readable)

## 5.6 Game state root

- **`GameState`**
  - `version: 1`
  - `turn: number`
  - `phase: 'PLAYER' | 'ENEMY'`
  - `galaxy: Galaxy`
  - `fleets: Record<string, Fleet>`
  - `selectedSystemId: string | null`
  - `selectedFleetId: string | null`
  - `resources: Resources`
  - `intelLog: IntelEntry[]`

### Invariants

- `Fleet.location` must always reference a valid `StarSystem.id`.
- `movesLeft` is clamped by usage (must never go negative by rule).
- `integrity` and `morale` are 0..100 (future: clamp in mutation helpers).
- `GameState` must remain JSON-serializable.

---

# 6. Core Rules and State Transitions

All authoritative transitions live in `src/core/GameState.ts`.

## 6.1 Public action API (current)

- **`bootstrapGameState()`**
  - Creates initial state (seeded galaxy, initial fleets, empty resources).
- **`getState()`**
  - Returns the in-memory singleton `state`.
- **`selectSystem(systemId)`**
  - Sets `selectedSystemId`.
  - Emits intel log entry.
- **`selectFleet(fleetId)`**
  - Player can select only player-owned fleets.
  - Emits intel log entry.
- **`moveFleet(fleetId, targetSystemId): boolean`**
  - Guardrails:
    - `phase` must be `PLAYER`
    - fleet must be player-owned
    - must have `movesLeft > 0`
    - target must be adjacent (`hexDistance == 1`)
  - Effects:
    - `fleet.location = targetSystemId`
    - `movesLeft -= 1`
    - If system intel is `UNKNOWN`, mark it `SCANNED` and `discovered = true`
    - Emit intel entries
- **`buildFleet(blueprintKey, atSystemId): boolean`**
  - Guardrails:
    - `phase` must be `PLAYER`
    - must have enough `tieredMetals` for the blueprint cost
  - Effects:
    - deduct metals
    - create a new `Fleet` at the selected system
    - emit intel
- **`endTurn()`**
  - Only valid in `PLAYER` phase.
  - Pipeline:
    - Apply mining
    - Switch to `ENEMY` phase
    - Run enemy step
    - Increment turn
    - Reset player moves
    - Switch back to `PLAYER` phase
- **`saveGame()`** / **`loadGame()`**
  - JSON serialization to `localStorage` key `hexfleet_save_v1`.
  - Minimal version validation.
- **`newGame()`**
  - Calls `bootstrapGameState()`.

## 6.2 Turn economy

### Turn Parameters
- **Moves per turn**: `MOVES_PER_TURN = 2` (constant in `GameState.ts`)
- **Turn reset**: At end of `endTurn()`, all player fleets get `movesLeft = maxMoves = MOVES_PER_TURN`
- **Phase structure**: PLAYER → ENEMY → TURN_INCREMENT → PLAYER
- **Turn limit**: Optional, default unlimited

### Movement Rules
- **Adjacent only**: `hexDistance(from, to) === 1`
- **Cost**: 1 move point per hex
- **Diagonal movement**: Supported via axial coordinate system
- **Enemy movement**: Same rules as player (adjacent only)

## 6.3 Mining

Mining is executed at the end of the player phase (`applyMiningForPlayerTurn()` called inside `endTurn()`).

### Eligibility
- `fleet.owner === 'PLAYER'`
- `fleet.role === 'MINER'`
- `system.asteroids` exists

### Yield Calculation
```ts
// Base yield per mining tier
const MINER_YIELD_PER_TURN = {
  T1: 10,  // Base metals per turn
  T2: 25,
  T3: 50
};

// System richness multiplier
const RICHNESS_MULTIPLIER = {
  POOR: 0.5,
  NORMAL: 1.0,
  RICH: 1.5,
  ABUNDANT: 2.0
};

// Final calculation
base = MINER_YIELD_PER_TURN[fleet.miningTier];
multiplier = RICHNESS_MULTIPLIER[system.asteroids.richness];
gained = Math.floor(base * multiplier);
```

### Mining Parameters
- **Moves per turn**: `MOVES_PER_TURN = 2`
- **Mining requires**: Fleet must be stationary for the turn
- **Yield cap**: Maximum 100 metals per fleet per turn
- **Resource type**: Mined into the asteroid's `metalTier`

## 6.4 Enemy step (current)

- Reset enemy `movesLeft`.
- Choose an adjacent system that reduces `hexDistance(..., SOL)`.
- Move at most 1 step, emit intel.

---

# 7. Deterministic Roguelite Design

## 7.1 Design Philosophy

HexFleet combines **deterministic mechanics** with **roguelite consequences**:

- **Deterministic**: Same inputs always produce same outputs
- **Roguelite**: Permanent loss and meaningful consequences
- **Player Agency**: Skill and decision-making over random chance

## 7.2 Deterministic Systems

### Seeded Galaxy Generation
- Same `runSeed` generates identical galaxy layout
- System types, resources, and threats are reproducible
- Enables shared seeds and challenge runs

### Combat Resolution
- Power calculations are transparent mathematical formulas
- No random damage rolls or critical hits
- Outcomes determined by fleet composition and preparation

### Resource Generation
- Mining yields follow fixed formulas
- No random resource drops or bonuses
- Predictable economic planning possible

## 7.3 Roguelite Elements

### Permanent Consequences
- **Fleet Destruction**: Lost forever, no recovery
- **Resource Scarcity**: Limited recovery from setbacks
- **Intel Gaps**: Players work with incomplete information

### Strategic Depth
- **Meaningful Choices**: Every decision has lasting impact
- **Risk vs Reward**: Deeper systems offer better rewards but higher danger
- **No Undo**: Actions cannot be taken back (except save/load)

### Run Structure
- **Session-based**: Each game is a complete run
- **Progress Reset**: Start fresh each new game
- **Meta Progression**: Future: unlock persistent bonuses

## 7.4 Balancing Determinism and Fun

### Information Asymmetry
- Players never have perfect information
- Scanning reveals intel gradually
- Enemy compositions hidden until engagement

### Preparation Matters
- Time to scout and plan approaches
- Fleet composition affects outcomes
- Resource management crucial

### Recovery Mechanics
- Dismantling ships for resources
- Salvage from combat victories
- Strategic retreat options

## 7.5 Technical Implementation

### RNG Usage
- **Prohibited**: `Math.random()` for gameplay
- **Required**: Seeded deterministic functions
- **Allowed**: `uid()` generation for unique IDs

### Save System
- **Ironman Mode**: Optional autosave each turn
- **Save Scumming**: Discouraged but possible
- **Checksums**: Detect tampering in competitive modes

### Reproducibility
- Same seed + same actions = same outcome
- Enables speedrun competition and shared challenges
- Debug mode with seed display

## 7.6 Procedural Galaxy Generation (Phase 1+)

Replace `seedGalaxy()` with a deterministic generator:

- Inputs:
  - `runSeed: number`
  - `radius: number` or system count
- Output:
  - `Galaxy` record
- Rules:
  - Ensure `SOL` at `{0,0}`.
  - Assign tiers based on distance from `SOL`.
  - Assign `StarSystemType` and `asteroids` via weighted tables by tier.
- Storage:
  - Generated galaxy is stored in save and becomes authoritative; do not regenerate on load.

### Implementation Details
```ts
// Weighted system type distribution by tier
const SYSTEM_TYPE_WEIGHTS = {
  1: { EMPTY_SPACE: 60, MINING_SYSTEM: 30, DERELICT: 10 },
  2: { EMPTY_SPACE: 40, MINING_SYSTEM: 35, DERELICT: 20, HOSTILE_STRONGHOLD: 5 },
  3: { EMPTY_SPACE: 20, MINING_SYSTEM: 25, DERELICT: 25, HOSTILE_STRONGHOLD: 25, ABYSS_ZONE: 5 }
};

// Asteroid richness distribution
const ASTEROID_RICHNESS = { POOR: 0.3, NORMAL: 0.5, RICH: 0.15, ABUNDANT: 0.05 };
```

---

# 8. Fog / Intel System (design target)

Current behavior: moving into an `UNKNOWN` system automatically reveals it (`SCANNED`).

Design expansion (compatible with current types):

- Add explicit actions:
  - `scanBasic(systemId)`
  - `scanDeep(systemId)`
  - `launchProbe(systemId)`
- Add intel granularity (future): keep `SystemIntel` as a coarse state, but supplement with a per-system intel payload (estimated enemy power, resources, modifiers) stored as new optional fields.
- Intel uncertainty:
  - “ranges” rather than exact numbers
  - inaccurate intel possible at low scan quality

---

# 9. Abstract Combat System (Phase 1 design, Phase 2 implementation)

The GDD specifies “no tactical battle screen (Phase 1)”. We will implement a deterministic resolver.

## 9.1 Core inputs

- Player fleet power (computed from ships/modules; current placeholder is `shipType` + status).
- Enemy power (derived from system tier + encounter tables).
- Modifiers:
  - intel quality
  - morale/integrity
  - system type

## 9.2 Outputs

- Outcome:
  - `VICTORY`
  - `PYRRHIC_VICTORY`
  - `RETREAT`
  - `DESTRUCTION`
- State deltas:
  - integrity / morale damage
  - possible fleet deletion on destruction
  - resource gain (loot tables, capped by system tier)

## 9.3 Implementation sketch

### Combat Power Calculation
```ts
// Fleet power calculation (UPDATED)
function calculateFleetPower(fleet: Fleet): number {
  let power = 0;
  for (const ship of fleet.ships) {
    const shipPower = 
      (ship.weapons || 0) * 1.0 +
      (ship.armor || 0) * 0.5 +
      ship.integrity * 0.1 +
      ship.morale * 0.05;
    power += shipPower;
  }
  return power * (fleet.morale / 100); // Fleet morale modifier
}

// System threat calculation (UPDATED)
function calculateSystemThreat(system: StarSystem): number {
  const baseThreat = system.tier * 20;
  const typeModifier = {
    'EMPTY_SPACE': 0,
    'MINING_SYSTEM': 5,
    'DERELICT': 15,
    'HOSTILE_STRONGHOLD': 50,
    'ABYSS_ZONE': 100
  }[system.type];
  return baseThreat + typeModifier;
}

// Combat intel generation (NEW)
function generateCombatIntel(fleetPower: number, systemThreat: number): CombatIntel {
  const powerRatio = fleetPower / systemThreat;
  return {
    fleetPower: Math.floor(fleetPower),
    estimatedEnemyThreat: Math.floor(systemThreat * (0.8 + Math.random() * 0.4)), // Intel uncertainty
    powerRatio: Math.round(powerRatio * 100) / 100,
    confidence: powerRatio > 1.5 ? 'HIGH' : powerRatio > 0.8 ? 'MEDIUM' : 'LOW'
  };
}
```

### Combat Resolution
```ts
function resolveCombat(fleetId: string, systemId: string): CombatOutcome {
  const fleetPower = calculateFleetPower(fleet);
  const systemThreat = calculateSystemThreat(system);
  const powerRatio = fleetPower / systemThreat;
  
  // Generate combat intel for logging
  const intel = generateCombatIntel(fleetPower, systemThreat);
  
  // Determine outcome based on power ratio
  let outcome: CombatOutcomeType;
  let damageMultiplier: number;
  
  if (powerRatio >= 2.0) {
    outcome = 'VICTORY';
    damageMultiplier = 0.1;
  } else if (powerRatio >= 1.2) {
    outcome = 'PYRRHIC_VICTORY';
    damageMultiplier = 0.4;
  } else if (powerRatio >= 0.8) {
    outcome = 'RETREAT';
    damageMultiplier = 0.6;
  } else {
    outcome = 'DESTRUCTION';
    damageMultiplier = 1.0;
  }
  
  // Apply damage based on outcome
  applyCombatDamage(fleetId, damageMultiplier);
  
  return {
    outcome,
    intel,
    damage: damageMultiplier,
    loot: calculateLoot(system, outcome)
  };
}

// Damage application (NEW)
function applyCombatDamage(fleetId: string, multiplier: number): void {
  const fleet = state.fleets[fleetId];
  if (!fleet) return;
  
  // Apply integrity damage
  const integrityDamage = Math.floor(50 * multiplier);
  fleet.integrity = Math.max(0, fleet.integrity - integrityDamage);
  
  // Apply morale damage
  const moraleDamage = Math.floor(30 * multiplier);
  fleet.morale = Math.max(0, fleet.morale - moraleDamage);
  
  // Apply ship damage (individual ships can be destroyed)
  for (const ship of fleet.ships) {
    const shipDamage = Math.floor(40 * multiplier);
    ship.integrity = Math.max(0, ship.integrity - shipDamage);
    ship.morale = Math.max(0, ship.morale - Math.floor(20 * multiplier));
  }
  
  // Remove destroyed ships
  fleet.ships = fleet.ships.filter(ship => ship.integrity > 0);
  
  // Delete fleet if all ships destroyed
  if (fleet.ships.length === 0) {
    delete state.fleets[fleetId];
  }
}
```

- Add `resolveCombat(fleetId, systemId, intent)` to `GameState`.
- Keep all arithmetic in `core`.
- Emit intel lines that narrate the result.
- Apply damage based on outcome type.

---

# 10. Persistence and Versioning

## 10.1 Current

- Save key: `hexfleet_save_v1`.
- Payload: `JSON.stringify(state)`.
- Validation:
  - `version === 1`
  - required top-level fields exist
  - ensure `tieredMetals` exists

## 10.2 Planned

- Introduce save schema migration:
  - `version: 2` adds `runSeed`, action counters, and any new fields.
  - `loadGame()` migrates old saves in-memory and re-saves if desired.
- Keep migrations pure, deterministic, and well-tested.

---

# 17. UI Layout & Motion System (UPDATED)

## 17.1 Lane-Based Text Layout

### Implementation
```ts
// Lane-based positioning for hex text (UPDATED)
interface HexLayout {
  hexSize: number;
  innerWidth: number;
  topLane: number;    // y + hexSize * 0.0
  centerLane: number; // y + hexSize * 0.0  
  bottomLane: number; // y + hexSize * 0.38
}

function createHexLayout(hexSize: number): HexLayout {
  return {
    hexSize,
    innerWidth: Math.floor(hexSize * 1.45),
    topLane: 0,
    centerLane: 0,
    bottomLane: hexSize * 0.38
  };
}
```

### Text Rendering Rules
- **Top Lane**: Reserved for future info (optional)
- **Center Lane**: Fleet names (if present)
- **Bottom Lane**: System names (always)
- **Word Wrapping**: Text wraps at `innerWidth` to prevent overflow
- **Origin**: All text uses `setOrigin(0.5, 0.5)` for centering
- **Depth**: System names (50), Fleet names (60) for proper layering

## 17.2 Motion & Animation System

### Phase 1 Motion (Informational)
```ts
// Fleet movement animation (UPDATED)
interface FleetMovement {
  fleetId: string;
  fromHex: HexCoord;
  toHex: HexCoord;
  duration: number; // 240-320ms
  easing: string; // "Cubic.Out"
}

function animateFleetMovement(movement: FleetMovement): void {
  const fleet = state.fleets[movement.fleetId];
  const startPos = hexToPixel(movement.fromHex);
  const endPos = hexToPixel(movement.toHex);
  
  // Create tween animation
  this.tweens.add({
    targets: fleet.renderObject,
    x: endPos.x,
    y: endPos.y,
    duration: movement.duration,
    ease: movement.easing,
    onComplete: () => {
      // Update game state after animation
      fleet.location = movement.toHex;
      refreshUI();
    }
  });
}
```

### Phase 2 Motion (Event Feedback)
```ts
// Combat resolution feedback (NEW)
interface CombatFeedback {
  systemId: string;
  outcome: CombatOutcomeType;
  effects: CombatEffect[];
}

function showCombatFeedback(feedback: CombatFeedback): void {
  const systemPos = getSystemPosition(feedback.systemId);
  
  // Screen shake for destruction
  if (feedback.outcome === 'DESTRUCTION') {
    this.cameras.main.shake(100, 0.02);
  }
  
  // Flash effect for victory
  if (feedback.outcome === 'VICTORY') {
    const flash = this.add.rectangle(systemPos.x, systemPos.y, 100, 100, 0xffffff, 0.3);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy()
    });
  }
}
```

## 17.3 UI Rendering Performance

### Optimization Strategy
- **Static Elements**: Cache hex grid to render texture
- **Dynamic Elements**: Update only changed system markers
- **Text Optimization**: Pre-render static labels, update dynamic ones
- **Spatial Hashing**: Fast system lookup for large galaxies
- **Level of Detail**: Reduce detail at zoom levels < 0.5

---

## 11.1 `GalaxyScene`

- Renders systems and hex grid.
- Handles camera pan and zoom.
- Input:
  - Click system: select system; if fleet selected attempt move.
  - Right click: cycle next player fleet.
  - `E`: end turn
  - `1/2/3`: build ship from blueprint keys
  - `N`: new game
  - `Ctrl+S`: save
  - `Ctrl+L`: load
- UI overlays:
  - Header (turn/phase/selected IDs/resources/hotkeys)
  - Fleet list (role glyphs and MP)
  - Intel feed (last N intel entries)

## 11.2 `SystemScene`

- Minimal overlay showing selected system details.
- `ESC` closes and resumes `GalaxyScene`.

## 11.3 Future scenes (from GDD)

- `FleetScene`
  - Fleet loadout, repairs/dismantle, merge (later).
- `StationScene`
  - Rebuild after wipe, blueprint unlocks, meta progression.

---

# 12. Rendering / Performance Notes

- Grid is redrawn every frame in `GalaxyScene.update()`.
  - Fine for small maps.
  - If galaxy size grows, optimize by:
    - caching static grid to a render texture
    - redrawing only on camera zoom/selection changes
- System markers are cached in `systems: SysRender[]` and updated via `refreshSystemMarkers()`.
- Picking is linear scan over systems.
  - If system count grows, use spatial hashing by hex key.

---

# 13. Testing Strategy

Goal: gameplay logic correctness without Phaser.

## 13.1 Unit tests (core)

- `hexDistance`, `hexNeighbor` correctness.
- `moveFleet()` guardrails:
  - not adjacent
  - no moves left
  - wrong phase
  - enemy fleet cannot be moved
- `endTurn()` pipeline:
  - mining happens exactly once
  - turn increments
  - phase cycles correctly
- `buildFleet()`:
  - cost enforcement
  - fleet creation at correct system

## 13.2 Determinism tests (after RNG introduction)

- For a fixed `runSeed`, generated galaxy snapshot is stable.
- For a fixed `runSeed` + action sequence, outcomes are stable.

## 13.3 Persistence tests

- Save then load yields deep-equal state.
- Corrupt save handling returns `false` and preserves current state.
- Migration tests for each `version`.

---

# 14. Milestones (implementation roadmap)

## 14.1 Phase 1 (current)

- Galaxy map + hex movement
- Fleets + MP
- Mining tick
- Basic build
- Save/load

## 14.2 Phase 2 (next)

- Deterministic run seed + RNG utilities
- Procedural galaxy generator
- Loot system + rarity caps by tier
- Dismantling and salvage
- Abstract combat resolver

## 14.3 Phase 3

- Events, factions, story hooks
- Meta progression
- Abyss zones

---

# 16. Victory & Defeat Conditions (NEW)

## 16.1 Victory Conditions

### Implementation
```ts
function checkVictoryConditions(state: GameState): VictoryResult | null {
  const conditions = {
    domination: checkDominationVictory(state),
    economic: checkEconomicVictory(state),
    exploration: checkExplorationVictory(state),
    survival: checkSurvivalVictory(state)
  };
  
  for (const [type, result] of Object.entries(conditions)) {
    if (result.achieved) {
      return {
        type: type as VictoryType,
        turn: state.turn,
        score: calculateFinalScore(state, result.bonus)
      };
    }
  }
  
  return null;
}

function checkDominationVictory(state: GameState): VictoryCheck {
  const allSystems = Object.keys(state.galaxy);
  const playerSystems = allSystems.filter(id => 
    isSystemControlledByPlayer(state, id)
  );
  
  return {
    achieved: playerSystems.length === allSystems.length,
    progress: playerSystems.length / allSystems.length,
    bonus: playerSystems.length * 100
  };
}

function checkEconomicVictory(state: GameState): VictoryCheck {
  const t3Metals = state.resources.tieredMetals.T3;
  return {
    achieved: t3Metals >= 10000,
    progress: t3Metals / 10000,
    bonus: Math.floor(t3Metals / 100)
  };
}
```

## 16.2 Defeat Conditions

### Implementation
```ts
function checkDefeatConditions(state: GameState): DefeatResult | null {
  const conditions = {
    annihilation: checkFleetAnnihilation(state),
    resourceCollapse: checkResourceCollapse(state),
    timeLimit: checkTimeLimit(state)
  };
  
  for (const [type, result] of Object.entries(conditions)) {
    if (result.triggered) {
      return {
        type: type as DefeatType,
        turn: state.turn,
        reason: result.reason
      };
    }
  }
  
  return null;
}

function checkFleetAnnihilation(state: GameState): DefeatCheck {
  const playerFleets = Object.values(state.fleets).filter(f => f.owner === 'PLAYER');
  return {
    triggered: playerFleets.length === 0,
    reason: 'All player fleets destroyed'
  };
}
```

## 16.3 Scoring System

### Score Calculation
```ts
function calculateFinalScore(state: GameState, victoryBonus: number): number {
  let score = 0;
  
  // Base score from turn efficiency
  score += Math.max(0, 10000 - state.turn * 10);
  
  // Resource bonus
  score += state.resources.tieredMetals.T1 * 1;
  score += state.resources.tieredMetals.T2 * 5;
  score += state.resources.tieredMetals.T3 * 20;
  
  // Fleet survival bonus
  const playerFleets = Object.values(state.fleets).filter(f => f.owner === 'PLAYER');
  score += playerFleets.reduce((sum, fleet) => {
    return sum + fleet.ships.length * 50;
  }, 0);
  
  // Discovery bonus
  const discoveredSystems = Object.values(state.galaxy).filter(s => s.discovered).length;
  score += discoveredSystems * 100;
  
  // Victory condition bonus
  score += victoryBonus;
  
  return score;
}
```

---

## 18. Platform Requirements & Accessibility (UPDATED)

## 18.1 Performance Targets

### Implementation
```ts
interface PerformanceMetrics {
  loadTime: number;      // < 3000ms target
  turnProcessing: number; // < 1000ms target
  memoryUsage: number;    // < 100MB target
  saveSize: number;      // < 1MB target
}

function measurePerformance(): PerformanceMetrics {
  return {
    loadTime: performance.now() - loadStartTime,
    turnProcessing: lastTurnDuration,
    memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
    saveSize: JSON.stringify(state).length
  };
}
```

### Optimization Strategies
- **Asset Loading**: Lazy load non-critical assets
- **State Management**: Minimize unnecessary state updates
- **Rendering**: Use object pooling for frequent creations
- **Memory**: Clean up unused Phaser objects

## 18.2 Accessibility Features

### Implementation
```ts
interface AccessibilitySettings {
  textScaling: number;     // 0.5 - 2.0
  highContrast: boolean;   // Improved visibility
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  keyboardOnly: boolean;    // Full keyboard navigation
}

function applyAccessibility(settings: AccessibilitySettings): void {
  // Update text scaling
  VisualStyle.font = `${Math.floor(16 * settings.textScaling)}px Consolas, Menlo, monospace`;
  VisualStyle.smallFont = `${Math.floor(14 * settings.textScaling)}px Consolas, Menlo, monospace`;
  
  // Update color schemes
  if (settings.highContrast) {
    VisualStyle.uiText = '#FFFFFF';
    VisualStyle.uiDim = '#CCCCCC';
    VisualStyle.systemNode = 0xFFFFFF;
  }
  
  // Update color blind friendly palettes
  if (settings.colorBlindMode !== 'none') {
    updateColorBlindPalette(settings.colorBlindMode);
  }
}
```

### Keyboard Navigation
```ts
// Full keyboard control implementation
interface KeyboardControls {
  navigate: 'Tab' | 'Shift+Tab';     // Cycle through elements
  select: 'Enter' | 'Space';          // Activate selected element
  back: 'Escape';                      // Close overlays
  menu: 'M';                          // Open menu
  help: 'F1';                         // Show help
}

function setupKeyboardNavigation(): void {
  // Tab navigation through UI elements
  this.input.keyboard.on('tab', () => navigateNextElement());
  this.input.keyboard.on('shift-tab', () => navigatePreviousElement());
  
  // Enter/Space for activation
  this.input.keyboard.on('enter', () => activateSelectedElement());
  this.input.keyboard.on('space', () => activateSelectedElement());
}
```

## 18.3 Cross-Platform Compatibility

### Browser Support Matrix
```ts
interface BrowserSupport {
  chrome: { min: '90', features: 'full' };
  firefox: { min: '88', features: 'full' };
  safari: { min: '14', features: 'full' };
  edge: { min: '90', features: 'full' };
}

function checkBrowserCompatibility(): CompatibilityResult {
  const userAgent = navigator.userAgent;
  const browser = detectBrowser(userAgent);
  const support = BrowserSupport[browser];
  
  return {
    supported: compareVersions(browserVersion, support.min) >= 0,
    browser,
    version: browserVersion,
    features: support.features
  };
}
```

### Mobile Considerations (Future)
- **Touch Interface**: Convert mouse events to touch events
- **Screen Size**: Responsive layout scaling
- **Performance**: Optimize for mobile processors
- **Controls**: On-screen button overlays for touch

---

**Decision**: Multi-ship fleets from Phase 1
- `Fleet.ships: Ship[]` array (as in GDD)
- Single shipType maintained for backward compatibility
- Migration path: derive `shipType` from primary ship in fleet
- UI simplification: Show fleet role glyph based on composition

## 15.2 Save Scumming Prevention

**Decision**: Multiple options for different player types
- **Casual**: Normal save/load allowed
- **Ironman**: Autosave each turn, single save slot
- **Challenge**: Seed-based runs with checksum validation
- **Speedrun**: Built-in timer and validation system

## 15.3 Intel Uncertainty Representation

**Decision**: Progressive revelation system
- **Phase 1**: Binary UNKNOWN/SCANNED states
- **Phase 2**: Add confidence levels (0-100%)
- **Phase 3**: Range-based estimates ("5-10 enemies")
- Keep core deterministic - uncertainty from incomplete data, not random rolls

## 15.4 Performance Optimization Priorities

**Current**: Small galaxy, no optimization needed
**Phase 2**: 
- Spatial hashing for system lookup (>100 systems)
- Cached rendering for static elements
- Lazy loading for intel data
**Phase 3**:
- Level-of-detail rendering for zoom levels
- Background processing for enemy AI

## 15.5 Testing Strategy Expansion

**Unit Tests** (Phase 1):
- Core gameplay logic
- Hex math utilities
- State transitions

**Integration Tests** (Phase 2):
- Save/load migration
- Combat resolution
- Mining calculations

**Determinism Tests** (Phase 2+):
- Seed reproducibility
- Action sequence consistency
- Version compatibility

**Performance Tests** (Phase 3):
- Large galaxy generation
- Memory usage profiling
- Turn processing benchmarks
