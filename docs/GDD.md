# HEX FLEET — GAME DESIGN DOCUMENT (GDD)

**Version:** 0.1 (Foundation)  
**Engine:** Phaser 3  
**Language:** TypeScript  
**Platform:** PC (Web / Desktop build later)  
**Genre:** Turn-based Strategy / Fleet Management / Roguelite  
**Perspective:** Top-down Hex Grid Galaxy Map  

---

## 1. High Concept

HexFleet is a turn-based, hex-grid space strategy game focused on fleet survival, exploration, and permanent consequences.

Players command multiple fleets, scout unknown systems, mine resources, fight hostile forces, and risk permanent fleet loss in a procedurally generated galaxy.

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

### D. Risk vs Reward
- Deeper systems = better loot
- Abyss zones = extreme danger
- Retreat is always an option—until it isn’t

---

## 3. Player Fantasy

> “I am not an empire. I am a survivor commanding what remains.”

The player experiences:
- Tension when committing fleets
- Loss when ships are destroyed
- Satisfaction rebuilding stronger
- Pride in optimized fleet compositions

---

## 4. Core Gameplay Loop

1. View Galaxy Map  
2. Select Fleet  
3. Move to System  
4. Scan / Explore / Engage  
5. Resolve Outcome  
6. Gain or Lose Resources  
7. Repair / Dismantle / Rebuild  
8. Repeat  

---

## 5. Galaxy & Map Design

### Hex Grid Galaxy
- Each hex represents one star system

### System Properties
- Type
- Difficulty
- Resource profile
- Threat level

### System Types
- Empty Space
- Mining System
- Derelict
- Hostile Stronghold
- Abyss Zone (endgame)

---

## 6. Fleets

### Fleet Properties
Fleets are mobile groups of ships that can move between systems.

```ts
Fleet {
  id: string
  name: string
  ships: Ship[]
  location: HexCoord
  integrity: number
  morale: number
}
```

---

## 7. Ships

### Ship Types

- **MINER** - Extracts resources from asteroid fields
  - Mining tier determines extraction efficiency
  - Light armor, minimal weapons
  - High cargo capacity

- **COMBAT** - Fleet protection and engagement
  - Heavy armor and weapons
  - No mining capability
  - Variable sizes (SCOUT, DESTROYER, CRUISER)

- **SCOUT** - Exploration and intelligence gathering
  - Extended sensor range
  - Fast movement
  - Light armament
  - Reveals fog of war

### Ship Properties

```ts
Ship {
  id: string
  name: string
  type: ShipType
  integrity: number    // 0-100
  morale: number       // 0-100
  miningTier?: MetalTier  // MINER only
  weapons?: number     // COMBAT only
  armor?: number       // COMBAT only
  buildCost: TieredMetals
}
```

---

## 8. Combat System

### Abstract Combat Resolution

Combat is resolved through deterministic calculations based on:

- **Fleet Power** - Aggregate of ship weapons, armor, integrity, morale
- **System Threat** - Based on system type and tier
- **Intel Quality** - Better intel reduces uncertainty
- **Terrain Modifiers** - System type affects combat

### Combat Outcomes

- **VICTORY** - Fleet wins with minimal damage
- **PYRRHIC VICTORY** - Fleet wins but takes heavy damage
- **RETREAT** - Fleet disengages with moderate damage
- **DESTRUCTION** - Fleet destroyed, permanent loss

### Damage Model

- **Integrity Damage** - Reduces combat effectiveness
- **Morale Damage** - Affects future performance
- **Ship Loss** - Individual ships can be destroyed

---

## 9. Resources & Economy

### Resource Types

- **Tiered Metals** - T1, T2, T3 (basic building materials)
- **Alloys** - Advanced construction (Phase 2)
- **Gas** - Fuel and special systems (Phase 2)
- **Crystals** - High-tech components (Phase 2)

### Resource Acquisition

- **Mining** - Primary source of tiered metals
- **Salvage** - Recover materials from destroyed fleets
- **Dismantling** - Recover build costs from own ships
- **Exploration** - Find abandoned resources

### Build Costs

```ts
ShipBuildCosts {
  MINER: { T1: 50, T2: 20, T3: 5 }
  SCOUT: { T1: 30, T2: 10, T3: 0 }
  COMBAT_SCOUT: { T1: 40, T2: 15, T3: 0 }
  COMBAT_DESTROYER: { T1: 80, T2: 40, T3: 10 }
  COMBAT_CRUISER: { T1: 150, T2: 80, T3: 30 }
}
```

---

## 10. User Interface

### Galaxy Map

- **Hex Grid Display** - Clear system visualization
- **Fleet Icons** - Glyph-based fleet identification
- **Fog of War** - Visual distinction for unknown/scanned systems
- **Resource Overlay** - Current resources displayed

### Fleet Management

- **Fleet Selection** - Click to select, right-click to cycle
- **Movement Preview** - Show valid moves and costs
- **Status Display** - Integrity, morale, moves remaining

### Information Panels

- **System Details** - Type, resources, threats when scanned
- **Fleet Composition** - Ships, status, capabilities
- **Intel Feed** - Turn-by-turn action log
- **Resource Summary** - Current stockpiles and income

### Controls

- **Mouse** - Primary interaction (select, move, inspect)
- **Keyboard Shortcuts**
  - `E` - End turn
  - `1-5` - Build fleet types
  - `S` - Save game
  - `L` - Load game
  - `N` - New game
  - `ESC` - Close overlays

---

## 11. Victory & Defeat Conditions

### Victory Conditions

- **Domination** - Control all systems in the galaxy
- **Economic** - Accumulate 10,000 T3 metals
- **Exploration** - Discover and scan all system types
- **Survival** - Survive 100 turns with at least one fleet

### Defeat Conditions

- **Fleet Annihilation** - All player fleets destroyed
- **Resource Collapse** - No resources and no mining capability
- **Time Limit** - Optional: Turn limit for challenge modes

### Scoring

- **Efficiency Bonus** - Fewer turns = higher score
- **Resource Multiplier** - Remaining resources add to score
- **Fleet Survival** - Intact fleets provide score bonus
- **Discovery Bonus** - Systems explored add to score

---

## 12. Progression & Meta

### Fleet Progression

- **Experience** - Fleets gain experience from successful actions
- **Veterancy** - Improved stats for experienced fleets
- **Specialization** - Fleets can develop unique capabilities

### Technology (Phase 2)

- **Blueprints** - Unlock new ship types and upgrades
- **Research** - Improve mining, combat, scanning efficiency
- **Artifacts** - Find special items in deep space

### Difficulty Scaling

- **Galaxy Size** - Larger galaxies = longer games
- **Enemy Density** - More hostile systems
- **Resource Scarcity** - Limited mining opportunities
- **Abyss Zones** - Endgame high-risk, high-reward areas

---

## 13. Roguelite Elements & Determinism

### Deterministic Foundation

- **Seeded Galaxy** - Same seed produces identical galaxy
- **Reproducible Combat** - Same inputs = same outcomes
- **Transparent Math** - All calculations visible to player

### Roguelite Mechanics

- **Permanent Fleet Loss** - Destroyed fleets are gone forever
- **Resource Scarcity** - Limited recovery options
- **Strategic Depth** - Every decision has lasting consequences
- **Run-based Structure** - Each game is a complete session

### Balance Philosophy

- **Skill > Luck** - Player decisions matter more than random chance
- **Information Asymmetry** - Players work with incomplete intel
- **Recovery Possible** - Setbacks aren't necessarily game-ending
- **Meaningful Choices** - No obviously correct decisions

---

## 14. Audio & Visual Style

### Visual Direction

- **Clean UI** - Minimalist, information-dense interface
- **Clear Iconography** - Glyph-based fleet and system identification
- **Color Coding** - Intuitive use of color for information hierarchy
- **Subtle Effects** - Polished but non-intrusive animations

### Audio Design

- **Ambient Space** - Low-key atmospheric background
- **UI Feedback** - Clear, satisfying interaction sounds
- **Event Audio** - Distinct sounds for combat, discovery, alerts
- **Minimal Approach** - Audio enhances, doesn't overwhelm



## 14.5 Motion & Feedback (Phase 1)

Motion in *HexFleet* is **informational**, not decorative.  
All animation exists to confirm player intent, communicate state changes, and reinforce the passage of turns.

### Core Principles
- Motion never alters game state
- Game state resolves instantly; visuals animate to match
- Player input is temporarily locked during critical animations
- Subtlety over spectacle; clarity over noise

### Fleet Movement
- Fleet movement is represented by a short positional tween between hex centers
- Movement confirms:
  - Which fleet moved
  - From where to where
  - That a turn cost was consumed
- Duration: **240–320ms**
- Easing: smooth out (`Cubic.Out` or equivalent)
- Multiple fleet movements (enemy turns) resolve in controlled sequence

### Idle Fleet Motion
- Stationary fleets exhibit minimal idle motion
- Slow, subtle positional drift (1–2px)
- Represents active systems and living crews
- Does not interfere with readability or selection

### Turn Transition Feedback
- Ending a turn triggers a brief visual transition
- Fleet movements resolve visibly before player control resumes
- Turn resolution reinforces that the galaxy has advanced

### System State Motion
- Systems communicate status through subtle motion cues:
  - Scanned systems may softly pulse
  - Hostile systems may flicker faintly
  - Derelicts may exhibit intermittent static shimmer
- Motion reinforces system state without requiring player interaction

### Motion Scope Limits
- No continuous camera drift
- No real-time unit pathing
- No decorative background animation in Phase 1
- All motion is event-driven and state-dependent


## 14.6 Motion & Feedback (Phase 2)

Phase 2 motion expands on Phase 1 by introducing **event-driven impact feedback** and **environmental motion**, while maintaining HexFleet’s commitment to clarity, determinism, and restraint.

All Phase 2 motion remains **non-interactive** and **state-reflective**.

### Combat Resolution Feedback
Combat remains abstract and non-tactical, but its outcome is reinforced through brief, high-impact motion cues.

- Combat resolution triggers short, localized visual feedback at the system hex
- Possible effects include:
  - Brief screen shake or impact pulse
  - Rapid flash or fracture effect on the system marker
  - Fleet icon compression or disruption to indicate damage
- Effects are:
  - Short-lived (sub-second)
  - Non-repeating
  - Clearly tied to the combat result
- Damage is visually represented as it is applied (integrity and morale changes resolve visibly)

Combat motion reinforces **finality and consequence** without simulating battle.

### Anomalies & Environmental Motion
Certain systems exhibit subtle, continuous motion to indicate unusual or dangerous conditions.

- Anomaly systems may display:
  - Distortion pulses
  - Irregular glow patterns
  - Directional pull or inward drift
- Abyss Zones may exhibit:
  - Slow, heavy motion
  - Darkening gradients or gravitational effects
  - Persistent environmental animation to signal extreme risk

Environmental motion serves as a **warning language**, not spectacle.

### Discovery & Event Feedback
Major discoveries and irreversible events are visually acknowledged.

- First-time discovery of system types may trigger:
  - Brief reveal pulse
  - Scan-line or data-acquisition effect
- Critical events (fleet destruction, artifact discovery) trigger:
  - Short, unmistakable visual response
  - Paired with clear intel log messaging

### Phase 2 Motion Constraints
- Motion remains subordinate to information clarity
- No motion introduces ambiguity into system state
- Effects never obscure icons, labels, or player input
- Phase 2 motion builds upon Phase 1 foundations without altering core controls

---

## 15. Platform & Technical Requirements

### Target Platforms

- **Web Browser** - Primary target (Chrome, Firefox, Safari)
- **Desktop Build** - Electron wrapper for offline play
- **Mobile** - Future consideration (touch interface adaptation)

### Performance Targets

- **Load Time** < 3 seconds
- **Turn Processing** < 1 second
- **Memory Usage** < 100MB
- **Save Size** < 1MB per game

### Accessibility

- **Keyboard Navigation** - Full keyboard control support
- **Color Blind Friendly** - Not dependent on color alone
- **Text Scaling** - UI text adjustable
- **High Contrast** - Option for improved visibility
