# HEX FLEET — GAME DESIGN DOCUMENT (GDD)

**Version:** 0.2 (Clicker RTS Foundation)  
**Engine:** Phaser 3  
**Language:** TypeScript  
**Platform:** PC (Web / Desktop build later)  
**Genre:** Real-Time Strategy / Incremental (Clicker) / Fleet Management / Roguelite  
**Perspective:** Top-down Hex Grid Galaxy Map  

---

## 1. High Concept

HexFleet is a real-time, hex-grid space strategy clicker RTS focused on fleet survival, exploration, and permanent consequences.

Players command multiple fleets, scout unknown systems, mine resources in real time, fight hostile forces through escalating "pressure," and rebuild after losses using incremental economy growth.

**Death is meaningful. Progress is strategic. Recovery is possible—but never free.**

---

## 2. Core Pillars

### A. Permanent Consequences
- Fleet destruction is final
- Ships are lost forever
- Only partial resource recovery through dismantling or salvage

### B. Strategic Information
- Fog of war on galaxy map
- Scout ships and probes reveal intel
- Decisions are made with incomplete data

### C. Fleet Identity
- Fleets have composition, tier, and role
- Icons visually communicate fleet purpose and threat level
- Fleets grow organically, not linearly

### D. Risk vs Reward (Now Real-Time)
- Deeper systems = better loot rate + better tier drops
- Abyss zones = extreme danger over time (pressure ramps)
- Retreat is always an option—until escalating threats close the window

### E. Real-Time Economy (Clicker Core)
- Mining and income are continuous (per second)
- Player actions amplify efficiency through clicks and timed decisions
- Growth comes from automation + upgrades + fleet routing

---

## 3. Player Fantasy

> "I am not an empire. I am a survivor commanding what remains."

The player experiences:
- Tension when committing fleets into dangerous systems
- Loss when ships are destroyed
- Satisfaction rebuilding stronger through incremental growth
- Pride in optimized fleet routes and compositions

---

## 4. Core Gameplay Loop (Clicker RTS)

1. View Galaxy Map
2. Assign / Move Fleets in real time
3. Mine / Salvage / Scan passively (income ticks)
4. Click to boost operations (burst efficiency, emergency repairs, rapid scans)
5. Threat pressure increases in hostile zones
6. Pull back, reinforce, or risk destruction
7. Spend resources to build ships/upgrades/automation
8. Expand deeper and repeat

---

## 5. Real-Time Model (Replaces Turns)

### Time & Ticks

The game runs on a deterministic fixed tick loop:

- Example: 10 ticks/second or 20 ticks/second
- All systems update on ticks:
  - Mining yield
  - Threat pressure
  - Combat resolution progress
  - Scanning progress
  - Fleet repair over time (if applicable)

### Pause & Speed Controls (Phase 1)

- Space toggles Pause
- Optional speed steps later (Phase 2):
  - 1x / 2x / 4x (still deterministic)

### Determinism Rules

All real-time outcomes must be reproducible from:
- Seed
- Tick count
- Player input events (timestamped to ticks)

---

## 6. Galaxy & Map Design

### Hex Grid Galaxy

Each hex represents one star system

### System Properties

- Type
- Difficulty
- Resource profile
- Threat pressure profile (how danger ramps over time)

### System Types

- Empty Space
- Mining System
- Derelict
- Hostile Stronghold
- Abyss Zone (endgame)

---

## 7. Fleets

### Fleet Properties

Fleets are mobile groups of ships that move between systems in real time.

```ts
Fleet {
  id: string
  name: string
  ships: Ship[]
  location: HexCoord
  integrity: number
  morale: number

  // Clicker RTS additions
  task: FleetTask        // 'IDLE' | 'MOVE' | 'MINE' | 'SCAN' | 'SALVAGE' | 'FIGHT'
  taskTarget?: string    // systemId or objectId
  etaTicks?: number      // for travel timers
}
```

### Fleet Tasks (Real-Time)

- **MOVE**: travel timer counts down; arrival triggers system entry
- **MINE**: generates metals per second if on a mineable object
- **SCAN**: progresses intel unlock over time
- **SALVAGE**: converts wrecks/derelicts into resources over time
- **FIGHT**: engages hostile pressure; may take damage over time

---

## 8. Ships

### Ship Types

- **MINER** — extracts resources (continuous yield)
- **COMBAT** — reduces threat pressure and prevents losses
- **SCOUT** — reveals intel faster, expands fog-of-war visibility

### Ship Properties

```ts
Ship {
  id: string
  name: string
  type: ShipType
  integrity: number
  morale: number
  miningTier?: MetalTier
  weapons?: number
  armor?: number
  buildCost: TieredMetals

  // Clicker RTS additions
  upkeepT1?: number   // optional later: fleet upkeep per second
}
```

---

## 9. Resource & Economy (Clicker Core)

### Resource Types

- **Tiered Metals** — T1, T2, T3
- **Alloys** — Phase 2
- **Gas** — Phase 2
- **Crystals** — Phase 2

### Resource Acquisition (Real-Time)

- **Mining (Primary)**: yields per second while mining task active
- **Click Boost ("Overclock")**: clicking triggers a short burst multiplier
- **Salvage**: yields per second while salvage task active
- **Exploration Finds**: discrete rewards on discovery completion

### Click Boost Mechanics (Phase 1)

Clicking a mining target or a fleet grants:
- +X% yield for Y seconds (cooldown limited)

Clicking during combat can:
- "Brace" to reduce damage taken briefly

Clicking during scans can:
- "Focus" to accelerate scan progress briefly

### Automation (Phase 1)

Fleets can be assigned to a task and will continue until:
- Threat becomes too high
- Resource node is depleted (optional later)
- Player reassigns them

---

## 10. Combat System (Real-Time Pressure)

Combat is not tactical. It is a real-time pressure meter per system.

### Threat Pressure

Each hostile system has a pressure value that changes over time:
- Pressure rises while player is present
- Combat ships reduce pressure per second
- If pressure exceeds thresholds:
  - Fleet takes damage over time
  - Reinforcements may spawn (Phase 2)
  - Retreat window narrows

### Combat Outcomes (Real-Time)

- **Stabilized**: pressure reduced below safe threshold
- **Contained**: pressure held steady but not reduced
- **Forced Retreat**: pressure spikes, player must exit or be destroyed
- **Destruction**: fleet integrity reaches 0

---

## 11. User Interface (Clicker RTS)

### Galaxy Map

- Fleet icons animate between hexes
- Systems show:
  - Intel state (unknown/scanned)
  - Threat pressure bar/ring (if known)
  - Resource icons (if scanned)

### Fleet Management

- Click fleet → assign task buttons (minimal)
- Click system → quick actions:
  - Send selected fleet
  - Scan
  - Mine (if miner)
  - Salvage (if available)

### Intel Feed

Realtime log:
- "Mining +3 T1/sec"
- "Threat rising"
- "Fleet integrity -2"
- "Scan completed: Mining System (T2 potential)"

### Controls

- **Mouse click**: select / assign / boost
- **Space**: Pause
- **S**: Save
- **L**: Load
- **N**: New game
- **ESC**: Close overlays

---

## 12. Victory & Defeat Conditions (RTS-Friendly)

### Victory (Run Goals)

- **Deep Reach**: survive X minutes in Abyss Zone
- **Economic**: accumulate a target amount of T3
- **Exploration**: discover and scan all system types
- **Survival**: survive for a time threshold with at least one fleet

### Defeat

- All fleets destroyed
- No resources and no mining capability

---

## 13. Roguelite Elements & Determinism

### Deterministic Foundation

- Seeded galaxy
- Tick-based simulation
- Player inputs are recorded as tick events
- Same seed + same inputs = same results

### Roguelite Mechanics

- Permanent fleet loss
- Scarcity and tough tradeoffs
- Recovery through smart automation and routing

---

## 14. Audio & Visual Style

(Keep as-is, but tuned for real-time feedback)

---

## 14.5 Motion & Feedback (Phase 1 — Real-Time)

Motion in HexFleet is informational, not decorative.

### Core Principles

- Motion never alters game state
- Game state resolves via ticks; visuals animate to match
- Player input may lock briefly during travel animations
- Subtlety over spectacle

### Fleet Movement

- Fleet travel is a short tween between hex centers
- Duration: 240–320ms
- Easing: Cubic.Out
- Movement occurs whenever a fleet's location changes due to ETA completion

### Continuous Status Motion

- Mining fleets may show a subtle "work pulse" while mining
- Hostile systems show faint pressure flicker if known

---

## 15. Platform & Technical Requirements

### Target Platforms

- **Web Browser** - Primary target (Chrome, Firefox, Safari)
- **Desktop Build** - Electron wrapper for offline play
- **Mobile** - Future consideration (touch interface adaptation)

### Performance Targets

- **Load Time** < 3 seconds
- **Tick processing stable at chosen tick rate**
- **Memory Usage** < 100MB
- **Save Size** < 1MB per game

### Accessibility

- **Keyboard Navigation** - Full keyboard control support
- **Color Blind Friendly** - Not dependent on color alone
- **Text Scaling** - UI text adjustable
- **High Contrast** - Option for improved visibility

---

## 16. Non-Goals (Prevents Scope Creep)

- No tactical battle maps in Phase 1
- No real-time pathfinding inside systems beyond simple target selection
- No complex economy chains (Phase 2 only)
- No multiplayer
- No physics-based combat simulation
