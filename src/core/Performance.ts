// src/core/Performance.ts
// -----------------------------------------------------------------------------
// HexFleet — Performance monitoring and accessibility system
// -----------------------------------------------------------------------------

import type { PerformanceMetrics, AccessibilitySettings } from './types';

let loadStartTime: number = 0;
let lastTurnDuration: number = 0;

// -----------------------------------------------------------------------------
// Performance Monitoring
// -----------------------------------------------------------------------------

export function startPerformanceTimer(): void {
  loadStartTime = performance.now();
}

export function measurePerformance(): PerformanceMetrics {
  return {
    loadTime: performance.now() - loadStartTime,
    turnProcessing: lastTurnDuration,
    memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
    saveSize: JSON.stringify(getState()).length
  };
}

export function setTurnDuration(duration: number): void {
  lastTurnDuration = duration;
}

// -----------------------------------------------------------------------------
// Accessibility Settings
// -----------------------------------------------------------------------------

let currentAccessibilitySettings: AccessibilitySettings = {
  textScaling: 1.0,
  highContrast: false,
  colorBlindMode: 'none',
  keyboardOnly: false
};

export function getAccessibilitySettings(): AccessibilitySettings {
  return { ...currentAccessibilitySettings };
}

export function updateAccessibilitySettings(settings: Partial<AccessibilitySettings>): void {
  currentAccessibilitySettings = { ...currentAccessibilitySettings, ...settings };
  applyAccessibilitySettings();
}

function applyAccessibilitySettings(): void {
  // This would be called from UI scenes to update visual styles
  // Implementation would update VisualStyle based on settings
  console.log('Accessibility settings updated:', currentAccessibilitySettings);
}

// Import getState function (circular dependency issue)
function getState() {
  // This is a placeholder - in a real implementation, 
  // this would be properly imported or the performance module would be refactored
  return {} as any;
}
