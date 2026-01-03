// src/ui/VisualStyle.ts
// -----------------------------------------------------------------------------
// One place to lock visuals
// 
// IMPORTANT: Affiliation colors have moved to src/ui/colors.ts
// Use getAffiliationColor() and getHighlightStyle() for all color decisions.
// Do NOT use hardcoded color values like 0x00ff00, 0x0000ff, etc.
// -----------------------------------------------------------------------------

export const VisualStyle = {
  // Hex geometry
  hexSize: 48,
  pickRadius: 26,

  // Grid
  gridLineWidth: 3,

  // Text
  font: '16px Consolas, Menlo, monospace',
  smallFont: '14px Consolas, Menlo, monospace',

  // Background
  bg: 0x070a10,

  // System nodes (base colors, affiliation handled by colors.ts)
  systemNode: 0x8aa0c7,
  systemUnknown: 0x3a3f4a,

  // UI text colors (strings for Phaser text)
  uiText: '#CFE3FF',
  uiDim: '#6B86A8',
  uiWarn: '#FFB25B',
  uiBad: '#FF5B5B',

  minerText: '#FFD54A',
  combatText: '#66A7FF'
};
