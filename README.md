# HexFleet (Starter)

A fresh **Phaser 3 (Phaser JS) + TypeScript** starter project for the game **HexFleet**.

## What this starter is for
- A clean base you can open in **Windsurf** and immediately start coding.
- A structure that enforces the project rule: **logic lives in `/src/core` and must not import Phaser**.
- Heavily-commented templates to match your requirement: **full commenting while programming**.

## Hard rules (locked)
1. **Use Phaser JS + TypeScript** only (no framework swaps).
2. **Full commenting required**:
   - Each file states its purpose.
   - Each exported function explains inputs, outputs, and side effects.
   - Non-obvious logic is commented.
3. **No Phaser imports in `/src/core`**.
4. **No `Math.random()`** — use seeded RNG (we’ll add `RNG.ts` next).

## Run it
```bash
npm install
npm run dev
```
Then open the URL shown in the terminal (typically `http://localhost:5173`).

## Build
```bash
npm run build
npm run preview
```

## Folder layout
- `src/core` — pure game logic (no Phaser)
- `src/scenes` — Phaser Scenes (rendering + input)
- `src/data` — static configs (ships, systems, loot tables)
- `docs` — GDD/TDD

## Next recommended step
Create `src/core/GameState.ts` and `src/core/RNG.ts`, then wire the first clickable hex interaction in `GalaxyScene`.
