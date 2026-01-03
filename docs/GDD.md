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

```ts
Fleet {
  id: string
  name: string
  ships: Ship[]
  location: HexCoord
  integrity: number
  morale: number
}
