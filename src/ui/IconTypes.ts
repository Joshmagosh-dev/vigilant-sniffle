// src/ui/IconTypes.ts
// -----------------------------------------------------------------------------
// HexFleet — Icon Types
// Old-school, code-drawn icon identifiers + styling contracts.
// No Phaser imports here (pure types).
// -----------------------------------------------------------------------------

export type FleetIconKey = 'FLEET_SCOUT' | 'FLEET_FRIGATE' | 'FLEET_DESTROYER' | 'FLEET_CARRIER';
export type IntelIconKey = 'INTEL_MOVE' | 'INTEL_SCAN';
export type AlertIconKey = 'ALERT_INFO' | 'ALERT_WARNING' | 'ALERT_DANGER';

export type IconKey = FleetIconKey | IntelIconKey | AlertIconKey;

/**
 * High-level visual state for icons.
 * Scenes can switch icon state without recreating objects.
 */
export type IconState = 'normal' | 'selected' | 'disabled' | 'danger';

/**
 * Options used at creation time.
 */
export type IconCreateOpts = {
  size?: number;            // Typical range: 12–24
  alpha?: number;           // 0..1
  state?: IconState;        // default: 'normal'
  glyph?: string;           // optional override for glyph text
  label?: string;           // optional short label text (2–3 chars) beside glyph
  showLabel?: boolean;      // default: false
  crisp?: boolean;          // snap to integer pixels for sharper look (default true)
};

/**
 * Optional animation spec. If omitted, icon is static.
 * These are hooks; the scene decides when to apply them.
 */
export type IconAnimSpec = {
  pulse?: { min?: number; max?: number; periodMs?: number };     // scales container
  blink?: { min?: number; max?: number; periodMs?: number };     // alpha oscillation
  rotate?: { speedRadPerSec?: number };                          // continuous rotation
  jitter?: { radius?: number; periodMs?: number };               // tiny position wobble
};
