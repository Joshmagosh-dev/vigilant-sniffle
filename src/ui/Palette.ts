// src/ui/Palette.ts
// -----------------------------------------------------------------------------
// HexFleet — Palette
// Centralized colors (keep this tiny: text + 1–2 accents).
// IMPORTANT: This file MUST export something, or TS will say "is not a module".
// -----------------------------------------------------------------------------

export const Palette = {
  // Text (terminal-ish)
  text: '#d9e2ef',
  textDim: '#8fa1b3',

  // Accents
  cyan: '#4fd7ff',
  amber: '#ffb020',
  red: '#ff4d4d',

  // Lines / shapes (subtle)
  line: '#7b8da1',
  lineDim: '#465463',

  // Background helper
  bg: '#0b0f14'
} as const;

export type PaletteKey = keyof typeof Palette;

// Optional default export (harmless, sometimes convenient)
export default Palette;
