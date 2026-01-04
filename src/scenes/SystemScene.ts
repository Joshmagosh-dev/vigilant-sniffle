// src/scenes/SystemScene.ts
// -----------------------------------------------------------------------------
// HexFleet — System Scene (Hex Grid View with RNG Contents)
//
// CHANGE (per request):
// - Prevent name overlap by moving names UNDER the marker
// - Keep type icons on the RIGHT side of the marker
// -----------------------------------------------------------------------------

import Phaser from 'phaser';
import { getState, mineAsteroid, isSystemBeingMined, invadePlanet, reinforcePlanet, getPlanetController, selectSystemObject, getSelectedSystemObject, mineSelectedObject, invadeSelectedObject, reinforceSelectedObject, listSystemObjects, createPlanet, setFleetAnchor } from '../core/GameState';
import { startInvasion, getOngoingInvasions } from '../core/Invasion';
import { reinforcePlanet as reinforcePlanetLegacy, getReinforcementCapacity } from '../core/Reinforcement';
import { VisualStyle } from '../ui/VisualStyle';
import { getAffiliationColor, getHighlightStyle, getStationAffiliation, getPlanetAffiliation } from '../ui/colors';
import { createFleetIcon, createPulseAnimation, createFadeAnimation } from '../ui/IconFactory';
import type { Fleet } from '../core/types';

// -----------------------------------------------------------------------------
// Safe formatting helper to prevent crashes
// -----------------------------------------------------------------------------

function fmt(value: unknown, digits: number = 0): string {
  if (typeof value === 'number' && isFinite(value)) {
    return value.toFixed(digits);
  }
  return '—'; // Em dash for undefined/null/invalid values
}

type StationState = 'FRIENDLY' | 'ENEMY' | 'DERELICT';

type SystemObject = {
  id: string;
  type: 'planet' | 'asteroid' | 'station' | 'anomaly';
  coord: { q: number; r: number };
  name: string;

  // NEW: only meaningful when type === 'station'
  stationState?: StationState;

  // NEW: planet control information
  planetController?: 'PLAYER' | 'ENEMY' | 'NEUTRAL' | 'CONTESTED';
  planetTroops?: number;
  planetDefenses?: number;

  marker: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text; // name (UNDER)
  icon: Phaser.GameObjects.Text;  // icon (RIGHT)
  
  // NEW: Store object data for interaction
  objectId: string; // Full object ID for core selection
};

export default class SystemScene extends Phaser.Scene {
  private readonly HEX_SIZE = 32;
  private readonly PICK_RADIUS = 20;

  // Layout rule (match GalaxyScene behavior)
  private readonly ICON_OFFSET_X = Math.round(this.HEX_SIZE * 0.55);
  private readonly ICON_OFFSET_Y = 0;
  private readonly LABEL_OFFSET_Y = Math.round(this.HEX_SIZE * 0.55);

  private background!: Phaser.GameObjects.Graphics;
  private gridLayer!: Phaser.GameObjects.Graphics;
  private selectionLayer!: Phaser.GameObjects.Graphics;
  private rangeLayer!: Phaser.GameObjects.Graphics; // NEW: dedicated layer for highlights
  private hoverLayer!: Phaser.GameObjects.Graphics; // NEW: dedicated layer for hover highlights
  private infoText!: Phaser.GameObjects.Text;

  private systemObjects: SystemObject[] = [];
  private selectedObjectId: string | null = null;
  private hoveredObjectId: string | null = null;

  // Fleet sprites for system view
  private systemFleetSprites: Record<string, Phaser.GameObjects.Container> = {};

  constructor() {
    super({ key: 'SystemScene' });
  }

  create(): void {
    // Darkened background overlay
    this.background = this.add.graphics()
      .fillStyle(0x000000, 0.9)
      .fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);

    // System view area (centered panel)
    const viewWidth = 800;
    const viewHeight = 600;
    const viewX = (this.cameras.main.width - viewWidth) / 2;
    const viewY = (this.cameras.main.height - viewHeight) / 2;

    // Panel background
    this.add.graphics()
      .fillStyle(0x0b0f14, 0.95)
      .lineStyle(2, 0xCFE3FF, 1)
      .fillRect(viewX, viewY, viewWidth, viewHeight)
      .strokeRect(viewX, viewY, viewWidth, viewHeight);

    // Grid and selection layers (clipped to panel)
    this.gridLayer = this.add.graphics();
    this.selectionLayer = this.add.graphics();
    this.rangeLayer = this.add.graphics(); // NEW: range layer for highlights
    this.hoverLayer = this.add.graphics(); // NEW: hover layer for highlights

    // NOTE: This doesn't truly clip rendering, but keeps your existing behavior.
    // If you want real clipping later, we can add a geometry mask.
    const clipRect = new Phaser.Geom.Rectangle(viewX + 20, viewY + 60, viewWidth - 40, viewHeight - 120);
    this.gridLayer.setInteractive(clipRect, Phaser.Geom.Rectangle.Contains);

    // Info text at top
    this.infoText = this.add.text(viewX + 20, viewY + 20, '', {
      font: VisualStyle.font,
      color: VisualStyle.uiText
    });

    // Generate system contents
    this.generateSystemContents();

    // Input handling
    this.setupInput();

    // Initial render
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // System content generation
  // ---------------------------------------------------------------------------

  private generateSystemContents(): void {
    const state = getState();
    const systemId = state.selectedSystemId;

    if (!systemId) return;

    const system = state.galaxy[systemId];
    if (!system) return;

    // Use system seed for deterministic RNG
    const rng = this.createSeededRNG(system.seed);

    // Generate system objects based on system type and tier
    const objectCount = 3 + system.tier + Math.floor(rng() * 3);

    for (let i = 0; i < objectCount; i++) {
      const coord = this.generateRandomCoord(rng);
      const type = this.selectObjectType(rng, system.type);

      // Determine if enemies are in this system (for enemy station coloring)
      const enemyInSystem = Object.values(state.fleets).some(
        f => f.owner === 'ENEMY' && f.location === systemId
      );

      // Station state rules (deterministic via rng):
      // - 35% chance station is DERELICT (raidable)
      // - otherwise, if enemy present: 50% ENEMY / 50% FRIENDLY
      // - otherwise: FRIENDLY
      let stationState: StationState | undefined = undefined;
      if (type === 'station') {
        const roll = rng();
        if (roll < 0.35) stationState = 'DERELICT';
        else if (enemyInSystem && rng() < 0.5) stationState = 'ENEMY';
        else stationState = 'FRIENDLY';
      }

      const obj: SystemObject = {
        id: `${system.id}-${i}`,
        objectId: `${systemId}:${type}:${i}`, // Core object ID for selection
        type,
        coord,
        name: this.generateObjectName(type, i, rng, systemId),
        stationState,
        marker: null as any,
        label: null as any,
        icon: null as any
      };

      // Add planet control information for planets
      if (type === 'planet') {
        const controller = this.determinePlanetController(systemId, enemyInSystem, rng);
        obj.planetController = controller;
        obj.planetTroops = controller === 'NEUTRAL' ? 0 : Math.floor(rng() * 50) + 20;
        obj.planetDefenses = Math.floor(rng() * 40) + 20;
        
        // Create the actual planet in core GameState
        createPlanet(systemId, obj.id, controller);
      }

      this.systemObjects.push(obj);
    }

    // Create visual representations
    this.createSystemVisuals();
  }

  private createSeededRNG(seed: number): () => number {
    let current = seed;
    return () => {
      current = (current * 9301 + 49297) % 233280;
      return current / 233280;
    };
  }

  private generateRandomCoord(rng: () => number): { q: number; r: number } {
    const maxRadius = 4;
    let q: number, r: number;

    do {
      q = Math.floor(rng() * (maxRadius * 2 + 1)) - maxRadius;
      r = Math.floor(rng() * (maxRadius * 2 + 1)) - maxRadius;
    } while (Math.abs(q) > maxRadius || Math.abs(r) > maxRadius || Math.abs(q + r) > maxRadius);

    return { q, r };
  }

  private determinePlanetController(systemId: string, enemyInSystem: boolean, rng: () => number): 'PLAYER' | 'ENEMY' | 'NEUTRAL' | 'CONTESTED' {
    const state = getState();
    const system = state.galaxy[systemId];
    
    // Check if player has station in system
    const hasPlayerStation = system?.station?.owner === 'PLAYER';
    
    // Check if enemy fleets are present
    const hasEnemyFleets = enemyInSystem;
    
    if (hasPlayerStation && !hasEnemyFleets) {
      return 'PLAYER';
    } else if (hasEnemyFleets && !hasPlayerStation) {
      return 'ENEMY';
    } else if (hasPlayerStation && hasEnemyFleets) {
      return 'CONTESTED';
    } else {
      // Neutral planets
      return 'NEUTRAL';
    }
  }

  private selectObjectType(
    rng: () => number,
    systemType: string
  ): 'planet' | 'asteroid' | 'station' | 'anomaly' {
    const roll = rng();

    if (systemType === 'RUIN') {
      if (roll < 0.3) return 'anomaly';
      if (roll < 0.6) return 'station';
      return 'planet';
    } else if (systemType === 'NEBULA') {
      if (roll < 0.2) return 'anomaly';
      if (roll < 0.4) return 'asteroid';
      return 'planet';
    } else {
      if (roll < 0.2) return 'asteroid';
      if (roll < 0.3) return 'station';
      return 'planet';
    }
  }

  private generateObjectName(
    type: 'planet' | 'asteroid' | 'station' | 'anomaly',
    index: number,
    rng: () => number,
    systemId: string
  ): string {
    const planetPrefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
    const planetSuffixes = ['Prime', 'Major', 'Minor', 'Secundus', 'Tertius', 'Quartus', 'Quintus', 'Sextus', 'Septimus', 'Octavus'];
    const planetDescriptors = ['Verdant', 'Barren', 'Frozen', 'Volcanic', 'Oceanic', 'Desert', 'Jungle', 'Arctic', 'Temperate', 'Stormy'];

    const asteroidPrefixes = ['Rocky', 'Metallic', 'Icy', 'Crystal', 'Dark', 'Floating', 'Shattered', 'Ancient', 'Radioactive', 'Magnetic'];
    const asteroidSuffixes = ['Field', 'Cluster', 'Belt', 'Ring', 'Cloud', 'Debris', 'Swarm', 'Veil', 'Drift', 'Nebula'];
    const asteroidDescriptors = ['Rich', 'Poor', 'Sparse', 'Dense', 'Unstable', 'Stable', 'Chaotic', 'Organized', 'Young', 'Old'];

    const stationPrefixes = ['Outpost', 'Haven', 'Port', 'Dock', 'Hub', 'Base', 'Fortress', 'Colony', 'Refuge', 'Sanctuary'];
    const stationSuffixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Prime', 'Central', 'Main', 'Core'];
    const stationDescriptors = ['Trading', 'Military', 'Research', 'Mining', 'Agricultural', 'Industrial', 'Medical', 'Communication', 'Observation', 'Defense'];

    const anomalyPrefixes = ['Strange', 'Mysterious', 'Ancient', 'Unknown', 'Eerie', 'Void', 'Quantum', 'Temporal', 'Spatial', 'Ethereal'];
    const anomalySuffixes = ['Signal', 'Echo', 'Whisper', 'Shadow', 'Void', 'Anomaly', 'Phenomenon', 'Distortion', 'Rift', 'Singularity'];
    const anomalyDescriptors = ['Pulsating', 'Static', 'Drifting', 'Expanding', 'Contracting', 'Rotating', 'Oscillating', 'Fading', 'Brightening', 'Shifting'];

    // Create system-specific RNG for additional uniqueness
    const systemRng = this.createSeededRNG(systemId.charCodeAt(0) + systemId.charCodeAt(systemId.length - 1) + index);

    // Use RNG for variety
    const useDescriptor = rng() < 0.4; // 40% chance to include descriptor
    const useTwoWord = rng() < 0.3; // 30% chance for two-word name

    let name = '';

    switch (type) {
      case 'planet':
        if (useTwoWord) {
          const desc = planetDescriptors[Math.floor(systemRng() * planetDescriptors.length)];
          const base = planetPrefixes[Math.floor(rng() * planetPrefixes.length)];
          name = `${desc} ${base}`;
        } else if (useDescriptor) {
          const desc = planetDescriptors[Math.floor(systemRng() * planetDescriptors.length)];
          const suf = planetSuffixes[Math.floor(rng() * planetSuffixes.length)];
          name = `${desc} ${suf}`;
        } else {
          const pre = planetPrefixes[Math.floor(systemRng() * planetPrefixes.length)];
          const suf = planetSuffixes[Math.floor(rng() * planetSuffixes.length)];
          name = `${pre} ${suf}`;
        }
        break;

      case 'asteroid':
        if (useTwoWord) {
          const desc = asteroidDescriptors[Math.floor(systemRng() * asteroidDescriptors.length)];
          const base = asteroidPrefixes[Math.floor(rng() * asteroidPrefixes.length)];
          name = `${desc} ${base}`;
        } else if (useDescriptor) {
          const desc = asteroidDescriptors[Math.floor(systemRng() * asteroidDescriptors.length)];
          const suf = asteroidSuffixes[Math.floor(rng() * asteroidSuffixes.length)];
          name = `${desc} ${suf}`;
        } else {
          const pre = asteroidPrefixes[Math.floor(systemRng() * asteroidPrefixes.length)];
          const suf = asteroidSuffixes[Math.floor(rng() * asteroidSuffixes.length)];
          name = `${pre} ${suf}`;
        }
        break;

      case 'station':
        if (useTwoWord) {
          const desc = stationDescriptors[Math.floor(systemRng() * stationDescriptors.length)];
          const base = stationPrefixes[Math.floor(rng() * stationPrefixes.length)];
          name = `${desc} ${base}`;
        } else if (useDescriptor) {
          const desc = stationDescriptors[Math.floor(systemRng() * stationDescriptors.length)];
          const suf = stationSuffixes[Math.floor(rng() * stationSuffixes.length)];
          name = `${desc} ${suf}`;
        } else {
          const pre = stationPrefixes[Math.floor(systemRng() * stationPrefixes.length)];
          const suf = stationSuffixes[Math.floor(rng() * stationSuffixes.length)];
          name = `${pre} ${suf}`;
        }
        break;

      case 'anomaly':
        if (useTwoWord) {
          const desc = anomalyDescriptors[Math.floor(systemRng() * anomalyDescriptors.length)];
          const base = anomalyPrefixes[Math.floor(rng() * anomalyPrefixes.length)];
          name = `${desc} ${base}`;
        } else if (useDescriptor) {
          const desc = anomalyDescriptors[Math.floor(systemRng() * anomalyDescriptors.length)];
          const suf = anomalySuffixes[Math.floor(rng() * anomalySuffixes.length)];
          name = `${desc} ${suf}`;
        } else {
          const pre = anomalyPrefixes[Math.floor(systemRng() * anomalyPrefixes.length)];
          const suf = anomalySuffixes[Math.floor(rng() * anomalySuffixes.length)];
          name = `${pre} ${suf}`;
        }
        break;
    }

    return name;
  }

  // ---------------------------------------------------------------------------
  // Visuals
  // ---------------------------------------------------------------------------

  private objectIcon(type: SystemObject['type']): string {
    // Simple, readable glyphs. (Monospace-safe)
    // You can swap these to IconKit later if you want.
    switch (type) {
      case 'planet': return '◉';
      case 'asteroid': return '⟡';
      case 'station': return '⌂';
      case 'anomaly': return '✦';
      default: return '?';
    }
  }

  private createSystemVisuals(): void {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    const state = getState();
    const systemId = state.selectedSystemId;
    const system = systemId ? state.galaxy[systemId] : null;
    const isBeingMined = systemId ? isSystemBeingMined(systemId) : false;

    for (const obj of this.systemObjects) {
      const pos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);

      // Use affiliation resolver for consistent colors
      let affiliationColors: { fill?: number; stroke: number; hollow?: boolean };
      let size: number;

      switch (obj.type) {
        case 'planet':
          // Use planet affiliation resolver
          const planetAffiliation = getPlanetAffiliation(obj.planetController || 'NEUTRAL');
          affiliationColors = getAffiliationColor(planetAffiliation);
          size = 8;
          break;
        case 'asteroid':
          // Asteroids use special status colors (not affiliation)
          if (system?.asteroids && system.asteroids.yieldRemaining !== undefined && system.asteroids.yieldRemaining !== null && system.asteroids.yieldRemaining <= 0) {
            affiliationColors = { fill: 0x666666, stroke: 0x666666 }; // Gray for depleted
          } else if (isBeingMined) {
            affiliationColors = { fill: 0xffaa00, stroke: 0xffaa00 }; // Orange for being mined
          } else {
            affiliationColors = { fill: 0x8b7355, stroke: 0x8b7355 }; // Brown for normal
          }
          size = 4;
          break;
        case 'station':
          // Use station affiliation resolver
          const stationAffiliation = getStationAffiliation(obj.stationState || 'NEUTRAL');
          affiliationColors = getAffiliationColor(stationAffiliation);
          size = 6;
          break;
        case 'anomaly':
          affiliationColors = { fill: 0xff44ff, stroke: 0xff44ff }; // Magenta for anomalies
          size = 7;
          break;
        default:
          affiliationColors = { fill: 0x4a4f5a, stroke: 0x4a4f5a }; // Gray fallback
          size = 6;
      }

      // Create marker with affiliation colors (hollow if derelict)
      if (affiliationColors.hollow) {
        obj.marker = this.add.circle(pos.x, pos.y, size, 0x000000, 0); // No fill
        // Add stroke separately for hollow objects
        const strokeGraphics = this.add.graphics();
        strokeGraphics.lineStyle(2, affiliationColors.stroke, 1);
        strokeGraphics.strokeCircle(pos.x, pos.y, size);
        // Store stroke graphics as a property (we'll need to clean it up later)
        (obj.marker as any).strokeGraphics = strokeGraphics;
      } else {
        obj.marker = this.add.circle(pos.x, pos.y, size, affiliationColors.fill || affiliationColors.stroke, 1);
      }

      // NEW: Make marker interactive
      obj.marker.setInteractive({ hitArea: new Phaser.Geom.Circle(0, 0, size + 4), hitAreaCallback: Phaser.Geom.Circle.Contains });
      obj.marker.setData('objectId', obj.objectId);
      obj.marker.setData('type', obj.type);
      
      // Add hover/selection handlers
      obj.marker.on('pointerover', () => {
        this.hoveredObjectId = obj.objectId;
        this.refreshHighlights();
      });
      
      obj.marker.on('pointerout', () => {
        this.hoveredObjectId = null;
        this.refreshHighlights();
      });
      
      obj.marker.on('pointerdown', () => {
        if (systemId) {
          selectSystemObject(systemId, obj.objectId);
          this.refresh();
        }
      });

      // ICON (RIGHT of marker) - add control indicators
      let iconText = this.objectIcon(obj.type);
      if (obj.type === 'planet') {
        switch (obj.planetController) {
          case 'PLAYER':
            iconText += ' 🟢'; // Green circle
            break;
          case 'ENEMY':
            iconText += ' 🔴'; // Red circle
            break;
          case 'CONTESTED':
            iconText += ' ⚔️'; // Swords for contested
            break;
          case 'NEUTRAL':
            iconText += ' ⚪'; // White circle for neutral
            break;
        }
        // Show troop count
        if (obj.planetTroops && obj.planetTroops > 0) {
          iconText += ` 👥${fmt(obj.planetTroops)}`;
        }
      } else if (obj.type === 'asteroid') {
        if (isBeingMined) {
          iconText += ' ⛏️'; // Add mining pickaxe
        }
        if (system?.asteroids && system.asteroids.yieldRemaining !== undefined && system.asteroids.yieldRemaining <= 0) {
          iconText = '💀'; // Skull for depleted
        }
      }

      obj.icon = this.add
        .text(pos.x + this.ICON_OFFSET_X, pos.y + this.ICON_OFFSET_Y, iconText, {
          font: VisualStyle.smallFont,
          color: VisualStyle.uiDim
        })
        .setOrigin(0, 0.5);

      // NAME (UNDER marker) — prevents overlap
      obj.label = this.add
        .text(pos.x, pos.y + this.LABEL_OFFSET_Y, obj.name, {
          font: VisualStyle.smallFont,
          color: VisualStyle.uiDim
        })
        .setOrigin(0.5, 0);
    }
  }

  private hexToPixel(q: number, r: number, centerX: number, centerY: number): { x: number; y: number } {
    const size = this.HEX_SIZE;
    const x = centerX + size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = centerY + size * ((3 / 2) * r);
    return { x, y };
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private setupInput(): void {
    // ESC to close
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'escape') {
        this.close();
        return;
      }

      // Tab to cycle through objects
      if (e.key.toLowerCase() === 'tab') {
        // Tab functionality can be added later if needed
        return;
      }

      // M to mine selected asteroid
      if (e.key.toLowerCase() === 'm') {
        mineSelectedObject();
        this.refresh();
        return;
      }

      // Space to mine if asteroid selected
      if (e.key === ' ') {
        mineSelectedObject();
        this.refresh();
        return;
      }

      // I to invade planet
      if (e.key.toLowerCase() === 'i') {
        this.handleInvasion();
        this.refresh();
        return;
      }

      // R to reinforce planet
      if (e.key.toLowerCase() === 'r') {
        this.handleReinforcement();
        this.refresh();
        return;
      }

      // Number keys to select objects by type (legacy - can be reimplemented later)
      if (e.key >= '1' && e.key <= '4') {
        // Type selection can be reimplemented later if needed
        return;
      }
    });

    // Click to select objects
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const viewX = (this.cameras.main.width - 800) / 2;
      const viewY = (this.cameras.main.height - 600) / 2;
      const centerX = viewX + 400;
      const centerY = viewY + 300;

      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const clicked = this.pickSystemObject(world.x, world.y, centerX, centerY);

      if (clicked) {
        this.selectedObjectId = clicked.id;
        this.refresh();
      }
    });
  }

  private pickSystemObject(worldX: number, worldY: number, centerX: number, centerY: number): SystemObject | null {
    let best: SystemObject | null = null;
    let bestD = Infinity;

    for (const obj of this.systemObjects) {
      const pos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);
      const dx = worldX - pos.x;
      const dy = worldY - pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < this.PICK_RADIUS && d < bestD) {
        best = obj;
        bestD = d;
      }
    }

    return best;
  }

  // Legacy methods removed - selection now handled by core state
  // Use selectSystemObject() and getSelectedSystemObject() from GameState instead
  
  // -----------------------------------------------------------------------------
  // Planet data synchronization
  // -----------------------------------------------------------------------------
  
  private syncPlanetDataWithCore(): void {
    const state = getState();
    const systemId = state.selectedSystemId;
    const system = systemId ? state.galaxy[systemId] : null;
    
    if (!system || !system.planets) return;
    
    // Sync visual planet objects with core planet data
    for (const visualObj of this.systemObjects) {
      if (visualObj.type === 'planet') {
        const corePlanet = system.planets[visualObj.id];
        if (corePlanet) {
          // Sync with new defense system
          visualObj.planetController = corePlanet.defense.control;
          visualObj.planetTroops = corePlanet.defense.garrison;
          visualObj.planetDefenses = corePlanet.defense.fortification;
        }
      }
    }
  }

  // -----------------------------------------------------------------------------
  // Invasion and Reinforcement Handlers
  // -----------------------------------------------------------------------------

  private handleInvasion(): void {
    const state = getState();
    const selectedObject = getSelectedSystemObject();
    
    if (!selectedObject) {
      return; // No object selected
    }

    // Parse object ID to extract type and actual ID
    const parts = selectedObject.objectId.split(':');
    const objectType = parts[1];
    const actualObjectId = parts[2];

    if (objectType !== 'planet') {
      return; // Not a planet
    }

    // Check if planet can be invaded
    const system = state.galaxy[selectedObject.systemId];
    const planet = system?.planets?.[actualObjectId];
    
    if (!planet) {
      return; // Planet not found
    }

    if (planet.defense.control === 'PLAYER') {
      return; // Can't invade own planet
    }

    if (planet.invasion) {
      return; // Already under invasion
    }

    // Find player combat fleet in system
    const playerCombatFleet = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.role === 'COMBAT' && 
      f.location === selectedObject.systemId
    );

    if (!playerCombatFleet) {
      return; // No combat fleet available
    }

    // Start invasion with default strength
    const invasionStrength = 3;
    const success = startInvasion(actualObjectId, invasionStrength, 'PLAYER');
    
    if (success) {
      // Animate fleet to planet
      this.animateFleetToAnchor(playerCombatFleet.id, `PLANET:${actualObjectId}`);
      // Pulse planet marker
      this.pulsePlanetMarker(actualObjectId);
    }
  }

  private handleReinforcement(): void {
    const state = getState();
    const selectedObject = getSelectedSystemObject();
    
    if (!selectedObject) {
      return; // No object selected
    }

    // Parse object ID to extract type and actual ID
    const parts = selectedObject.objectId.split(':');
    const objectType = parts[1];
    const actualObjectId = parts[2];

    if (objectType !== 'planet') {
      return; // Not a planet
    }

    // Check if planet can be reinforced
    const system = state.galaxy[selectedObject.systemId];
    const planet = system?.planets?.[actualObjectId];
    
    if (!planet) {
      return; // Planet not found
    }

    if (planet.defense.control !== 'PLAYER') {
      return; // Can't reinforce enemy planet
    }

    if (planet.invasion) {
      return; // Can't reinforce during invasion
    }

    // Check if player has troops available in system
    const reinforcementCapacity = getReinforcementCapacity(selectedObject.systemId, 'PLAYER');
    if (reinforcementCapacity <= 0) {
      return; // No troops available
    }

    // Find player fleet in system
    const playerFleet = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.location === selectedObject.systemId
    );

    if (!playerFleet) {
      return; // No fleet available
    }

    // Reinforce with default amount
    const reinforcementAmount = Math.min(2, reinforcementCapacity);
    const success = reinforcePlanetLegacy(actualObjectId, reinforcementAmount, 'PLAYER');
    
    if (success) {
      // Animate fleet to planet
      this.animateFleetToAnchor(playerFleet.id, `PLANET:${actualObjectId}`);
      // Pulse planet marker
      this.pulsePlanetMarker(actualObjectId);
      // Show floating text
      const planet = this.systemObjects.find(obj => obj.id === actualObjectId);
      if (planet) {
        const pos = this.hexToPixel(planet.coord.q, planet.coord.r, 400, 300);
        this.showFloatingText(pos.x, pos.y - 20, `+${reinforcementAmount} GARRISON`, 0x49b36d);
      }
    }
  }

  private showPlanetFeedback(obj: SystemObject, message: string, color: number): void {
    // Create temporary text feedback
    const feedback = this.add.text(
      obj.marker.x, 
      obj.marker.y - 20, 
      message, 
      { font: VisualStyle.smallFont, color: `#${color.toString(16).padStart(6, '0')}` }
    ).setOrigin(0.5, 1);

    // Flash the planet marker with highlight style (temporary)
    const originalColor = obj.marker.fillColor;
    const flashStyle = getHighlightStyle('selected');
    obj.marker.setFillStyle(flashStyle.stroke, 1);
    
    // Animate feedback
    this.tweens.add({
      targets: [feedback, obj.marker],
      y: { value: '-=10', duration: 1000 },
      alpha: { value: 0, duration: 1000 },
      onComplete: () => {
        feedback.destroy();
        obj.marker.setFillStyle(originalColor, 1);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Grid / selection
  // ---------------------------------------------------------------------------

  private drawHexGrid(): void {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    this.gridLayer.clear();

    // Check if system has stations for border color
    const hasStations = this.systemObjects.some(obj => obj.type === 'station');
    const borderColor = hasStations ? 0x4a9eff : 0x2a3f5f; // BLUE if stations, dark gray otherwise

    const maxRadius = 4;
    for (let q = -maxRadius; q <= maxRadius; q++) {
      for (let r = -maxRadius; r <= maxRadius; r++) {
        if (Math.abs(q) > maxRadius || Math.abs(r) > maxRadius || Math.abs(q + r) > maxRadius) continue;

        const pos = this.hexToPixel(q, r, centerX, centerY);
        this.drawHexOutline(this.gridLayer, pos.x, pos.y, this.HEX_SIZE, borderColor, 1);
      }
    }
  }

  // NEW: Dedicated method for hover and selection highlights
  private refreshHighlights(): void {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    // Clear highlight layers
    this.hoverLayer.clear();
    this.selectionLayer.clear();

    // Draw hover highlight
    if (this.hoveredObjectId) {
      const hoveredObj = this.systemObjects.find(obj => obj.objectId === this.hoveredObjectId);
      if (hoveredObj) {
        const pos = this.hexToPixel(hoveredObj.coord.q, hoveredObj.coord.r, centerX, centerY);
        const hoverStyle = getHighlightStyle('hover');
        this.drawHexOutline(this.hoverLayer, pos.x, pos.y, this.HEX_SIZE + 2, hoverStyle.stroke, hoverStyle.width);
      }
    }

    // Draw selection highlight (from core state)
    const selectedObject = getSelectedSystemObject();
    if (selectedObject && selectedObject.systemId === getState().selectedSystemId) {
      const selectedObj = this.systemObjects.find(obj => obj.objectId === selectedObject.objectId);
      if (selectedObj) {
        const pos = this.hexToPixel(selectedObj.coord.q, selectedObj.coord.r, centerX, centerY);
        const selectedStyle = getHighlightStyle('selected');
        this.drawHexOutline(this.selectionLayer, pos.x, pos.y, this.HEX_SIZE + 3, selectedStyle.stroke, selectedStyle.width);
      }
    }
  }

  private drawSelection(): void {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    // Clear both selection and range layers
    this.selectionLayer.clear();
    this.rangeLayer.clear();

    // Use new highlight system
    this.refreshHighlights();
  }

  private drawHexOutline(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    size: number,
    color: number,
    width: number
  ): void {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = Phaser.Math.DegToRad(60 * i - 30);
      pts.push({
        x: cx + size * Math.cos(angle),
        y: cy + size * Math.sin(angle)
      });
    }

    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.lineTo(pts[0].x, pts[0].y);
    g.strokePath();
  }

  // ---------------------------------------------------------------------------
  // Refresh / actions
  // ---------------------------------------------------------------------------

  private refresh(): void {
    const state = getState();
    const systemId = state.selectedSystemId;

    if (!systemId) {
      this.infoText.setText('No system selected');
      return;
    }

    const system = state.galaxy[systemId];
    if (!system) {
      this.infoText.setText(`System ${systemId} not found`);
      return;
    }

    // Sync selection with core state
    const selectedObject = getSelectedSystemObject();
    if (selectedObject && selectedObject.systemId === systemId) {
      this.selectedObjectId = selectedObject.objectId;
    } else {
      this.selectedObjectId = null;
    }
    
    // Sync planet data between visual and core
    this.syncPlanetDataWithCore();

    // System information
    const isBeingMined = isSystemBeingMined(systemId);
    const miningStatus = isBeingMined ? '⛏️ MINING' : '';
    const asteroidInfo = system.asteroids ? 
      `Asteroids: ${system.asteroids.metalTier} (${fmt(system.asteroids.yieldRemaining, 1)}% remaining)` : 
      'No asteroids';
    
    const stationInfo = system.station ? 
      `Station: ${system.station.name} (${system.station.owner})` : 
      'No station';

    // Count objects by type
    const objectCounts = {
      planets: this.systemObjects.filter(o => o.type === 'planet').length,
      asteroids: this.systemObjects.filter(o => o.type === 'asteroid').length,
      stations: this.systemObjects.filter(o => o.type === 'station').length,
      anomalies: this.systemObjects.filter(o => o.type === 'anomaly').length
    };

    // Fleets in system
    const fleetsInSystem = Object.values(state.fleets).filter(f => f.location === systemId);
    const playerFleets = fleetsInSystem.filter(f => f.owner === 'PLAYER');
    const enemyFleets = fleetsInSystem.filter(f => f.owner === 'ENEMY');

    // Info text lines
    const lines = [
      `SYSTEM: ${system.name} (${system.id}) ${miningStatus}`,
      `Type: ${system.type} | Tier: ${system.tier} | Intel: ${system.intel}`,
      `Objects: ${objectCounts.planets} planets, ${objectCounts.asteroids} asteroids, ${objectCounts.stations} stations, ${objectCounts.anomalies} anomalies`,
      asteroidInfo,
      stationInfo,
      `Fleets: ${playerFleets.length} player, ${enemyFleets.length} enemy | ESC to close | Tab: Next | 1-4: Select by type | M/Space: Mine | I: Invade Planet | R: Reinforce Planet`
    ];

    // Show selected object info
    if (selectedObject && selectedObject.systemId === systemId) {
      const selected = this.systemObjects.find(o => o.objectId === selectedObject.objectId);
      if (selected) {
        lines.push('');
        lines.push(`SELECTED: ${selected.name} (${selected.type})`);
        
        if (selected.type === 'asteroid') {
          lines.push('Press M to mine asteroid');
          if (system.asteroids && system.asteroids.yieldRemaining !== undefined && system.asteroids.yieldRemaining <= 0) {
            lines.push('⚠️ ASTEROID DEPLETED');
          }
        } else if (selected.type === 'planet') {
          // Get core planet data for invasion status
          const parts = selected.objectId.split(':');
          const planetId = parts[2];
          const corePlanet = system.planets?.[planetId];
          
          lines.push(`Controller: ${selected.planetController}`);
          if (selected.planetTroops) {
            lines.push(`Garrison: ${fmt(selected.planetTroops)} | Fortification: ${fmt(selected.planetDefenses || 0)}`);
            if (corePlanet?.defense && corePlanet.defense.unrest > 0) {
              lines.push(`Unrest: ${fmt(corePlanet.defense.unrest)}`);
            }
          }
          
          // Show invasion status
          if (corePlanet?.invasion) {
            const invasion = corePlanet.invasion;
            lines.push(`⚔️ INVASION: Turn ${invasion.turnsOngoing} - ${invasion.attacker} STR ${invasion.invasionStrength}`);
          } else {
            // Show action buttons
            if (selected.planetController === 'PLAYER') {
              const capacity = getReinforcementCapacity(systemId, 'PLAYER');
              if (capacity > 0) {
                lines.push(`Press R to reinforce (+${Math.min(2, capacity)} troops available)`);
              } else {
                lines.push('No troops available for reinforcement');
              }
            } else if (selected.planetController === 'ENEMY') {
              lines.push('Press I to invade planet');
            } else if (selected.planetController === 'NEUTRAL') {
              lines.push('Press I to colonize planet');
            }
          }
        } else if (selected.type === 'station') {
          if (selected.stationState) {
            lines.push(`Station Status: ${selected.stationState}`);
            if (selected.stationState === 'DERELICT') {
              lines.push('Can be salvaged for resources');
            }
          }
        } else if (selected.type === 'anomaly') {
          lines.push('Anomaly - unknown properties, investigate with caution');
        }
      }
    }

    // Show fleet names if present
    if (fleetsInSystem.length > 0) {
      lines.push('');
      lines.push('FLEETS IN SYSTEM:');
      fleetsInSystem.forEach(fleet => {
        const owner = fleet.owner === 'PLAYER' ? '🟢' : '🔴';
        lines.push(`${owner} ${fleet.name} (${fleet.role})`);
      });
    }

    this.infoText.setText(lines.join('\n'));

    // Redraw grid and selection layers
    this.drawHexGrid();
    this.drawSelection();
    
    // Refresh fleet sprites
    this.refreshSystemFleets();
  }

  // Legacy mining method removed - now handled by mineSelectedObject() in core
  // Mining feedback is now handled by the core action system

  // -----------------------------------------------------------------------------
  // System Fleet Sprite Management
  // -----------------------------------------------------------------------------

  private refreshSystemFleets(): void {
    const state = getState();
    const systemId = state.selectedSystemId;
    
    if (!systemId) {
      // Clear all fleet sprites if no system selected
      for (const sprite of Object.values(this.systemFleetSprites)) {
        sprite.destroy();
      }
      this.systemFleetSprites = {};
      return;
    }

    const system = state.galaxy[systemId];
    if (!system) return;

    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    // Get fleets in this system
    const fleetsInSystem = Object.values(state.fleets).filter(f => f.location === systemId);

    // Update or create fleet sprites
    for (const fleet of fleetsInSystem) {
      if (this.systemFleetSprites[fleet.id]) {
        // Update existing sprite position based on anchor
        this.updateFleetPosition(fleet.id, centerX, centerY);
      } else {
        // Create new sprite
        const pos = this.getFleetPosition(fleet, centerX, centerY);
        const sprite = createFleetIcon(
          this,
          pos.x,
          pos.y,
          fleet.owner,
          fleet.role,
          fleet.name
        );
        
        this.systemFleetSprites[fleet.id] = sprite;
      }
    }

    // Remove sprites for fleets no longer in system
    for (const fleetId of Object.keys(this.systemFleetSprites)) {
      if (!fleetsInSystem.find(f => f.id === fleetId)) {
        this.systemFleetSprites[fleetId].destroy();
        delete this.systemFleetSprites[fleetId];
      }
    }
  }

  private getFleetPosition(fleet: any, centerX: number, centerY: number): { x: number; y: number } {
    // Default position: system center
    let x = centerX;
    let y = centerY;

    // If fleet has an anchor, position near that object
    if (fleet.systemAnchor) {
      const parts = fleet.systemAnchor.split(':');
      const anchorType = parts[0];
      const anchorId = parts[1];

      switch (anchorType) {
        case 'STAR':
          // Keep at center
          break;
        case 'PLANET':
        case 'ASTEROID':
        case 'STATION':
          // Find the object and position near it
          const obj = this.systemObjects.find(o => o.id === anchorId);
          if (obj) {
            const objPos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);
            x = objPos.x + 15; // Offset to the right
            y = objPos.y;
          }
          break;
      }
    }

    return { x, y };
  }

  private updateFleetPosition(fleetId: string, centerX: number, centerY: number): void {
    const sprite = this.systemFleetSprites[fleetId];
    const state = getState();
    const fleet = state.fleets[fleetId];
    
    if (!sprite || !fleet) return;
    
    const pos = this.getFleetPosition(fleet, centerX, centerY);
    sprite.setPosition(pos.x, pos.y);
  }

  private animateFleetToAnchor(fleetId: string, targetAnchor: Fleet['systemAnchor']): void {
    const sprite = this.systemFleetSprites[fleetId];
    const state = getState();
    const fleet = state.fleets[fleetId];
    
    if (!sprite || !fleet || !targetAnchor) return;
    
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;
    
    // Set the anchor in core state
    setFleetAnchor(fleetId, targetAnchor);
    
    // Calculate target position
    const targetPos = this.getFleetPosition({ ...fleet, systemAnchor: targetAnchor }, centerX, centerY);
    
    // Animate to target
    this.tweens.add({
      targets: sprite,
      x: targetPos.x,
      y: targetPos.y,
      duration: 400,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        sprite.setPosition(targetPos.x, targetPos.y);
      }
    });
  }

  private pulsePlanetMarker(planetId: string): void {
    const planet = this.systemObjects.find(obj => obj.id === planetId && obj.type === 'planet');
    if (!planet) return;

    // Create a container for the planet marker to pulse
    const container = this.add.container(planet.marker.x, planet.marker.y);
    container.add(planet.marker);
    
    createPulseAnimation(this, container, 300, 1.2).then(() => {
      // Remove container and restore marker
      container.remove(planet.marker);
      container.destroy();
    });
  }

  private showFloatingText(x: number, y: number, text: string, color: number = 0xffffff): void {
    const floatingText = this.add.text(x, y, text, {
      font: '12px monospace',
      color: `#${color.toString(16).padStart(6, '0')}`,
      align: 'center'
    }).setOrigin(0.5, 1);

    // Animate floating up and fade
    this.tweens.add({
      targets: floatingText,
      y: y - 30,
      alpha: 0,
      duration: 1500,
      ease: 'Quad.easeOut',
      onComplete: () => {
        floatingText.destroy();
      }
    });
  }

  private showMiningFeedback(obj: SystemObject, message: string, color: number): void {
    // Create temporary text feedback
    const feedback = this.add.text(
      obj.marker.x, 
      obj.marker.y - 20, 
      message, 
      { font: VisualStyle.smallFont, color: `#${color.toString(16).padStart(6, '0')}` }
    ).setOrigin(0.5, 1);

    // Flash the asteroid marker with highlight style (temporary)
    const originalColor = obj.marker.fillColor;
    const flashStyle = getHighlightStyle('selected');
    obj.marker.setFillStyle(flashStyle.stroke, 1);
    
    // Animate feedback
    this.tweens.add({
      targets: [feedback, obj.marker],
      y: { value: '-=10', duration: 1000 },
      alpha: { value: 0, duration: 1000 },
      onComplete: () => {
        feedback.destroy();
        obj.marker.setFillStyle(originalColor, 1);
      }
    });
  }

  private close(): void {
    // Cleanup: destroy object visuals so reopening doesn't duplicate them
    for (const obj of this.systemObjects) {
      obj.marker?.destroy();
      obj.label?.destroy();
      obj.icon?.destroy();
    }
    this.systemObjects = [];
    this.selectedObjectId = null;
    
    // Cleanup fleet sprites
    for (const sprite of Object.values(this.systemFleetSprites)) {
      sprite.destroy();
    }
    this.systemFleetSprites = {};

    this.scene.stop();
    this.scene.resume('GalaxyScene');
  }

  update(): void {
    // Keep your existing behavior, but avoid rebuilding objects per-frame.
    // (We only redraw grid/selection + info, which is cheap.)
    this.refresh();
  }
}
