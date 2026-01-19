# HEX FLEET — GAME DESIGN DOCUMENT (GDD)

**Version:** 0.3 (Clicker RTS Implementation)
**Last updated:** 2025-01-19

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

### D. Risk vs Reward (Real-Time)
- Deeper systems = better loot rate + better tier drops
- Abyss zones = extreme danger over time (pressure ramps)
- Retreat is always an option—until escalating threats close the window

### E. Real-Time Economy (Clicker Core)
- Mining and income are continuous (per second)
- Player actions amplify efficiency through clicks and timed decisions
- Growth comes from automation + upgrades + fleet routing

---

## 3. The Three Loops

### A. Income Loop (Resources per Second)
1. **Fleets mine asteroids** when positioned on asteroid hexes
2. **Fleets salvage derelicts** when positioned on derelict hexes  
3. **Passive station income** from captured stations
4. **Click boosts** provide temporary efficiency multipliers
5. **Upgrades** permanently improve base yields and capabilities

### B. Pressure Loop (Threat Over Time)
1. **Hostile systems generate pressure** while player fleets present
2. **Pressure rises** based on system tier and presence
3. **Combat ships suppress pressure** through SUPPRESS tasks
4. **Pressure thresholds** cause integrity/morale damage
5. **Collapse occurs** if pressure reaches maximum

### C. Expansion Loop (Strategic Growth)
1. **Explore unknown systems** to reveal resources and threats
2. **Build new fleets** using accumulated metals
3. **Capture stations** for strategic advantages
4. **Upgrade capabilities** to access deeper systems
5. **Survive escalating threats** while growing economy

---

## 4. Real-Time Model

### Tick-Based Simulation
- **Fixed tick rate:** 10 ticks per second (configurable)
- **Deterministic outcomes:** Same seed + same actions = same results
- **Event-driven:** Player inputs timestamped to specific ticks
- **Pause/Resume:** Space bar pauses simulation

### Fleet Tasks
- **IDLE:** Fleet waits for orders
- **MOVE:** Travel between systems with ETA countdown
- **MINE:** Extract resources from asteroids (requires position)
- **SCAN:** Reveal intel about system objects
- **SALVAGE:** Extract scrap from derelicts
- **SUPPRESS:** Combat threat pressure in hostile systems

### Time Scale
- **Movement:** 3 seconds per hex (30 ticks)
- **Mining:** Continuous yield per tick based on tier/richness
- **Boosts:** 6-10 second durations with 30-60 second cooldowns
- **Pressure:** Rises/falls based on fleet presence and actions

---

## 5. Fleet and Ship Properties

### Fleet Composition
- **Ships array:** Authoritative list of individual ships
- **Role derived:** MINER if any miner ship, COMBAT otherwise
- **Stats aggregated:** Integrity/morale averaged from ships
- **Mining tier:** Best mining tier among ships

### Ship Types
- **MINER:** Mining capability, T1-T3 yield potential
- **CORVETTE:** Basic combat, pressure suppression
- **FRIGATE:** Medium combat, better suppression
- **DESTROYER:** Heavy combat, strong suppression

### Fleet State
- **Location:** System ID (galaxy) or hex coord (system)
- **Task:** Current action (IDLE/MOVE/MINE/SCAN/SALVAGE/SUPPRESS)
- **ETA:** Countdown for task completion
- **Boosts:** Active temporary effects with cooldowns

---

## 6. Resources and Economy

### Tiered Metals
- **T1 (Common):** Basic construction, low-tier fleets
- **T2 (Uncommon):** Mid-tier fleets, better equipment
- **T3 (Rare):** High-tier fleets, best capabilities

### Income Sources
- **Mining:** Base yield per second × richness × boost × upgrades
- **Salvage:** Derelict depletion rate × efficiency × upgrades
- **Stations:** Passive income from captured infrastructure

### Click Boosts
- **Overclock:** 2× mining yield for 6 seconds (30s cooldown)
- **Focus:** 3× scan speed for 8 seconds (45s cooldown)
- **Brace:** 50% pressure damage reduction for 10 seconds (60s cooldown)

### Upgrades
- **Mining Yield:** Permanent +25% per level
- **Scan Speed:** Permanent +50% per level
- **Suppression:** Permanent +20% pressure reduction per level
- **Integrity:** Permanent +15 max integrity per level

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
