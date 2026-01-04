// src/core/Reinforcement.ts
// -----------------------------------------------------------------------------
// HexFleet — Planet Reinforcement System
// -----------------------------------------------------------------------------

import { getState, pushIntel } from './GameState';
import type { Planet, PlanetController } from './types';

/**
 * Reinforce a planet with additional troops
 * @param planetId - ID of the planet to reinforce
 * @param amount - Number of troops to add
 * @param owner - Who owns the planet (must match current controller)
 * @returns true if reinforcement was successful
 */
export function reinforcePlanet(planetId: string, amount: number, owner: 'PLAYER' | 'ENEMY'): boolean {
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
    pushIntel('ALERT', `REINFORCEMENT FAILED: Planet ${planetId} not found.`);
    return false;
  }
  
  if (planet.defense.control !== owner) {
    pushIntel('ALERT', `REINFORCEMENT FAILED: Cannot reinforce enemy planet.`);
    return false;
  }
  
  if (amount <= 0) {
    pushIntel('ALERT', `REINFORCEMENT FAILED: Reinforcement amount must be positive.`);
    return false;
  }
  
  // Apply reinforcement
  planet.defense.garrison += amount;
  planet.groundTroops += amount; // Keep legacy field in sync
  
  // Reduce unrest when reinforcing
  planet.defense.unrest = Math.max(0, planet.defense.unrest - Math.floor(amount / 10));
  
  pushIntel('SYSTEM', `REINFORCED: ${planetName} +${amount} garrison`);
  return true;
}

/**
 * Get reinforcement capacity of fleets in a system
 * @param systemId - System to check
 * @param owner - Fleet owner to consider
 * @returns Total available ground troops for reinforcement
 */
export function getReinforcementCapacity(systemId: string, owner: 'PLAYER' | 'ENEMY'): number {
  const state = getState();
  const system = state.galaxy[systemId];
  
  if (!system) return 0;
  
  return Object.values(state.fleets)
    .filter(fleet => fleet.location === systemId && fleet.owner === owner)
    .reduce((total, fleet) => total + fleet.groundTroops, 0);
}

/**
 * Get planets that can be reinforced by a specific owner
 * @param owner - Owner to check for
 * @returns Array of reinforceable planets with their details
 */
export function getReinforceablePlanets(owner: 'PLAYER' | 'ENEMY'): Array<{
  planet: Planet;
  planetId: string;
  systemId: string;
  systemName: string;
  reinforcementCapacity: number;
}> {
  const state = getState();
  const reinforceable: Array<{
    planet: Planet;
    planetId: string;
    systemId: string;
    systemName: string;
    reinforcementCapacity: number;
  }> = [];
  
  for (const [systemId, system] of Object.entries(state.galaxy)) {
    for (const [planetId, planet] of Object.entries(system.planets || {})) {
      if (planet.defense.control === owner && !planet.invasion) {
        const capacity = getReinforcementCapacity(systemId, owner);
        reinforceable.push({
          planet,
          planetId,
          systemId,
          systemName: system.name,
          reinforcementCapacity: capacity
        });
      }
    }
  }
  
  return reinforceable;
}
