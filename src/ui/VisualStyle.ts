// src/ui/VisualStyle.ts
// -----------------------------------------------------------------------------
// One place to lock visuals
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

  // Colors
  bg: 0x070a10,
  gridUnknown: 0x4a4f5a,
  gridFriendly: 0x49b36d,
  gridControlled: 0x2f72ff,

  systemNode: 0x8aa0c7,
  systemUnknown: 0x3a3f4a,

  selection: 0xffffff,

  // UI text colors (strings for Phaser text)
  uiText: '#CFE3FF',
  uiDim: '#6B86A8',
  uiWarn: '#FFB25B',
  uiBad: '#FF5B5B',

  minerText: '#FFD54A',
  combatText: '#66A7FF'
};
