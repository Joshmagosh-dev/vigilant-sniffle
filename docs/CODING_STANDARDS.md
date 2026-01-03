# HEX FLEET — CODING STANDARDS (Phaser 3 + TypeScript)

**Locked stack:** Phaser 3 + TypeScript + Vite

This document defines the coding standards for this repo so gameplay logic remains deterministic, testable, and easy to extend.

---

# 1. Core Principles

- **Core logic is Phaser-free**
  - `src/core/*` and `src/utils/*` must not import Phaser.
  - Core code must be serializable-friendly (JSON-safe) and unit-testable.
- **Scenes render and orchestrate**
  - `src/scenes/*` reads state via getters and mutates state only via explicit actions.
  - Scenes may not “own” game rules.
- **Determinism first**
  - Gameplay-affecting randomness must come from a seeded RNG (never `Math.random()` for gameplay).
- **Keep UI text-first and minimal**
  - Prefer readable terminal-inspired UI over heavy widgets.

---

# 2. Project Layout & Ownership

- **`src/core/`**
  - Authoritative game state, rules, actions, and persistence.
  - Must remain Phaser-independent.
- **`src/scenes/`**
  - Phaser scenes: input, camera, rendering, UI composition.
  - May import from `@core`, `@ui`, `@utils`.
- **`src/ui/`**
  - Visual constants, glyph/icon helpers, HUD helpers.
  - Prefer pure helpers and minimal Phaser coupling.
- **`src/utils/`**
  - Math helpers and generic utilities (hex, hashing, etc.).

---

# 3. TypeScript Standards

- **Strict mode is required**
  - This repo uses `"strict": true`. Don’t introduce `any` unless there is no alternative.
- **Prefer explicit types at module boundaries**
  - Public functions in `core` should have explicit parameter/return types.
- **No non-null assertions (`!`) unless unavoidable**
  - If you must use `!`, document why in the PR/commit message.
- **Prefer `type` over `interface`**
  - Use `type` consistently for unions and data structures.

---

# 4. Imports, Aliases, and Dependency Rules

- **Use path aliases where it improves clarity**
  - `@core/*`, `@scenes/*`, `@ui/*`, `@utils/*` are available via `tsconfig.json`.
- **No circular dependencies**
  - Especially avoid `core -> scenes` and `utils -> core -> utils` cycles.
- **Imports must be at the top**
  - No mid-file imports.

---

# 5. Naming Conventions

- **Files**
  - `PascalCase` for scenes: `GalaxyScene.ts`, `SystemScene.ts`.
  - `camelCase` for pure utilities: `hex.ts`, `rng.ts`.
- **Exports**
  - `default export` only for Phaser scenes.
  - Named exports for helpers and core logic.
- **Constants**
  - Use `SCREAMING_SNAKE_CASE` for true constants and balance knobs.

---

# 6. Phaser Scene Standards

## 6.1 Scene keys (mandatory)

Every scene **must** set an explicit key:

- Use `constructor() { super({ key: 'GalaxyScene' }); }`

Never rely on Phaser’s default key. Duplicate defaults cause runtime errors.

## 6.2 Scene responsibilities

- Scenes should:
  - Render game state
  - Collect input
  - Call `core` actions
  - Display feedback (intel feed, HUD)
- Scenes should not:
  - Implement combat math
  - Mutate state directly (no editing `getState()` objects unless through actions)

## 6.3 Lifecycle

- Use `create()` to build objects.
- Avoid per-frame allocation in `update()`.
- Prefer small `refresh*()` methods that update text/UI from state.

---

# 7. Core State & Rules Standards (`src/core`)

- **Single source of truth**
  - All gameplay-affecting changes occur through `core` actions.
- **Actions must validate preconditions**
  - Check phase, ownership, adjacency, resource availability, etc.
- **Emit intel for player-visible events**
  - Movement, scanning, mining, build, combat outcomes.
- **State must remain JSON-serializable**
  - Don’t store Phaser objects, functions, Maps/Sets, Dates, or class instances in `GameState`.

---

# 8. Determinism & RNG Rules

- **Do not use `Math.random()` for gameplay**
  - Allowed only for non-gameplay identifiers/logging.
- **Seeded RNG only**
  - Use a small deterministic RNG (e.g., Mulberry32/Xorshift32) and seed derivation.
- **Avoid RNG drift**
  - Prefer deriving seeds from `(runSeed, systemId, turn, actionCounter)` rather than consuming an implicit global stream.

---

# 9. Persistence Standards

- **Version all saves**
  - Increment `GameState.version` when schema changes.
- **Migration is required**
  - `loadGame()` should migrate older versions forward.
- **Validate before accepting**
  - Reject corrupt data safely and keep the current in-memory state intact.

---

# 10. Performance Standards

- **Avoid per-frame heavy redraws for large maps**
  - If galaxy size grows, cache static visuals and redraw only on changes.
- **Avoid per-frame allocations**
  - No `Array.map`/`filter` in `update()` for hot paths; cache data when possible.
- **Keep text readable**
  - Favor stable UI layout over animation.

---

# 11. Testing Standards

Even without a full test harness yet, write code as if it will be unit-tested:

- `src/utils/*` and `src/core/*` must be testable without Phaser.
- Each action should be deterministic and side-effect limited.
- Avoid hidden global state beyond the authoritative `GameState` singleton.

Recommended unit targets:

- Hex math (`hexDistance`, `hexNeighbor`)
- Movement guardrails
- Turn phase progression
- Mining tick
- Save/load and migrations

---

# 12. Review Checklist (use in PRs)

- **Architecture**
  - Core remains Phaser-free
  - Scene keys are explicit and unique
- **Rules**
  - Actions validate preconditions
  - Player-visible events emit intel
- **Determinism**
  - No gameplay `Math.random()`
  - Outcomes reproducible for a seed
- **Performance**
  - No per-frame heavy allocations
- **Safety**
  - Save format versioned and validated
