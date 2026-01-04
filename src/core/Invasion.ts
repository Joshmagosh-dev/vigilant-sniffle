// src/core/Invasion.ts
// -----------------------------------------------------------------------------
// HexFleet — Deterministic Turn-Based Invasion System
// -----------------------------------------------------------------------------

import { getState, pushIntel } from './GameState';
import type { Planet, PlanetDefense, Invasion, PlanetController } from './types';

/**
 * Start an invasion on a planet
 * @param planetId - ID of the planet to invade
 * @param strength - Initial invasion strength
 * @param attacker - Who is starting the invasion
 * @returns true if invasion started successfully
 */
export function startInvasion(planetId: string, strength: number, attacker: 'PLAYER' | 'ENEMY'): boolean {
  const state = getState();
  
  // Find the planet across all systems
  let planet: Planet | null = null;
  let planetName: string = '';
  
  for (const system of Object.values(state.galaxy)) {
    if (system.planets?.[planetId]) {
      planet = system.planets[planetId];
      planetName = system.name;
      break;
    }
  }
  
  // Validation
  if (!planet) {
    pushIntel('ALERT', `INVASION FAILED: Planet ${planetId} not found.`);
    return false;
  }
  
  if (planet.invasion) {
    pushIntel('ALERT', `INVASION FAILED: ${planetName} already under invasion.`);
    return false;
  }
  
  if (planet.defense.control === attacker) {
    pushIntel('ALERT', `INVASION FAILED: Cannot invade own planet.`);
    return false;
  }
  
  if (strength <= 0) {
    pushIntel('ALERT', `INVASION FAILED: Invasion strength must be positive.`);
    return false;
  }
  
  // Start invasion
  planet.invasion = {
    planetId,
    attacker,
    invasionStrength: strength,
    turnsOngoing: 0
  };
  
  // Set planet to contested state
  const originalController = planet.defense.control;
  planet.defense.control = 'CONTESTED';
  planet.controller = 'CONTESTED';
  
  pushIntel('ALERT', `INVASION START: ${planetName} by ${attacker} (STR ${strength})`);
  return true;
}

/**
 * Resolve all ongoing invasions for one turn
 * Called exactly once per turn during end-turn resolution
 */
export function resolveInvasions(): void {
  const state = getState();
  const invasionsToResolve: { planet: Planet; systemName: string }[] = [];
  
  // Collect all planets with active invasions
  for (const system of Object.values(state.galaxy)) {
    for (const planet of Object.values(system.planets || {})) {
      if (planet.invasion) {
        invasionsToResolve.push({ planet, systemName: system.name });
      }
    }
  }
  
  // Resolve each invasion
  for (const { planet, systemName } of invasionsToResolve) {
    resolveInvasionTick(planet, systemName);
  }
}

/**
 * Resolve one tick of an invasion
 */
function resolveInvasionTick(planet: Planet, systemName: string): void {
  if (!planet.invasion) return;
  
  const invasion = planet.invasion;
  const defense = planet.defense;
  
  // Increment turn counter
  invasion.turnsOngoing++;
  
  // Calculate damage (deterministic, no RNG)
  const attackDamage = Math.max(1, invasion.invasionStrength - defense.fortification);
  const defenseDamage = Math.max(1, defense.garrison);
  
  // Apply damage
  defense.garrison = Math.max(0, defense.garrison - attackDamage);
  invasion.invasionStrength = Math.max(0, invasion.invasionStrength - defenseDamage);
  defense.unrest += 1;
  
  // Check win conditions
  if (defense.garrison <= 0) {
    // Attacker wins
    const defender = invasion.attacker === 'PLAYER' ? 'ENEMY' : 'PLAYER';
    defense.control = invasion.attacker;
    planet.controller = invasion.attacker;
    
    // Set occupation garrison
    defense.garrison = Math.max(1, Math.floor(invasion.invasionStrength / 2));
    defense.unrest = Math.max(0, defense.unrest - 2); // Reduce unrest after capture
    
    // Clear invasion
    planet.invasion = undefined;
    
    pushIntel('ALERT', `CAPTURED: ${systemName} by ${invasion.attacker}`);
  } else if (invasion.invasionStrength <= 0) {
    // Defender wins
    const defender = invasion.attacker === 'PLAYER' ? 'ENEMY' : 'PLAYER';
    defense.control = defender;
    planet.controller = defender;
    
    // Reduce unrest after successful defense
    defense.unrest = Math.max(0, defense.unrest - 3);
    
    // Clear invasion
    planet.invasion = undefined;
    
    pushIntel('ALERT', `INVASION FAILED: ${systemName}`);
  } else {
    // Invasion continues - show progress
    pushIntel('SYSTEM', `INVASION: ${systemName} - Turn ${invasion.turnsOngoing} - Garrison: ${defense.garrison}, Invasion: ${invasion.invasionStrength}`);
  }
}

/**
 * Get all planets currently under invasion
 */
export function getOngoingInvasions(): Array<{ planet: Planet; systemName: string; systemId: string }> {
  const state = getState();
  const ongoing: Array<{ planet: Planet; systemName: string; systemId: string }> = [];
  
  for (const [systemId, system] of Object.entries(state.galaxy)) {
    for (const planet of Object.values(system.planets || {})) {
      if (planet.invasion) {
        ongoing.push({ planet, systemName: system.name, systemId });
      }
    }
  }
  
  return ongoing;
}
