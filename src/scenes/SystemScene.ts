// src/scenes/SystemScene.ts
// -----------------------------------------------------------------------------
// HexFleet — System Scene (Hex Grid View with RNG Contents)
//
// CHANGE (per request):
// - Prevent name overlap by moving names UNDER the marker
// - Keep type icons on the RIGHT side of the marker
// -----------------------------------------------------------------------------

import Phaser from 'phaser';
import { getState, mineAsteroid, isSystemBeingMined, invadePlanet, reinforcePlanet, getPlanetController, selectSystemObject, getSelectedSystemObject, mineSelectedObject, invadeSelectedObject, reinforceSelectedObject, listSystemObjects, createPlanet, setFleetAnchor, moveFleetInSystem } from '../core/GameState';
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
  private highlightLayer!: Phaser.GameObjects.Graphics; // NEW: selection highlights
  private infoText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text; // NEW: debug text for input verification

  private systemObjects: SystemObject[] = [];
  private selectedObjectId: string | null = null;
  private hoveredObjectId: string | null = null;

  // Fleet sprites for system view
  private systemFleetSprites: Record<string, Phaser.GameObjects.Container> = {};

  // Animation state
  private isUnitAnimating = false;
  private animationQueue: Array<{fleetId: string; targetHex: { q: number; r: number }}> = [];

  // Drag state for fleet positioning
  private dragState: {
    fleetId: string;
    startPos: { x: number; y: number };
    ghost?: Phaser.GameObjects.Container;
  } | null = null;

  // Diagnostic state
  private debugOverlay!: Phaser.GameObjects.Text;
  private debugState = {
    activeScenes: [] as string[],
    inputEnabled: false,
    pointerScreen: { x: 0, y: 0 },
    pointerWorld: { x: 0, y: 0 },
    pickedHex: { q: 0, r: 0 },
    selectedObjectId: '',
    selectedObjectType: '',
    selectedFleetId: '',
    pickedObjectId: '',
    pickedObjectType: '',
    pickedObjectName: '',
    lastAction: '',
    lastResult: '',
    isAnimating: false,
    galaxyScenePaused: false,
    systemSceneTopmost: false
  };

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
    this.highlightLayer = this.add.graphics(); // NEW: selection highlight layer

    // NOTE: This doesn't truly clip rendering, but keeps your existing behavior.
    // If you want real clipping later, we can add a geometry mask.
    const clipRect = new Phaser.Geom.Rectangle(viewX + 20, viewY + 60, viewWidth - 40, viewHeight - 120);
    this.gridLayer.setInteractive(clipRect, Phaser.Geom.Rectangle.Contains);

    // Info text at top
    this.infoText = this.add.text(viewX + 20, viewY + 20, '', {
      font: VisualStyle.font,
      color: VisualStyle.uiText
    });

    // Debug text for input verification (NEW)
    this.debugText = this.add.text(viewX + 20, viewY + viewHeight - 40, 'DEBUG: Ready for input', {
      font: '14px monospace',
      color: '#00ff00'
    });

    // Diagnostic overlay (top-left, always visible)
    this.debugOverlay = this.add.text(10, 10, '', {
      font: '12px monospace',
      color: '#ffff00',
      backgroundColor: '#000000',
      padding: { x: 8, y: 8 }
    }).setScrollFactor(0).setDepth(1000);

    // NEW: Click-catcher UI layer - ensures pointer events always captured
    const clickCatcher = this.add.graphics()
      .fillRect(0, 0, this.cameras.main.width, this.cameras.main.height)
      .setInteractive()
      .setScrollFactor(0)
      .setDepth(999); // Just below debug overlay
    
    clickCatcher.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Convert to world coordinates and route to existing handler
      const worldPos = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.onSystemPointerDown(worldPos.x, worldPos.y);
    });

    clickCatcher.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Update debug info on hover
      this.debugState.pointerScreen = { x: p.x, y: p.y };
      const worldPos = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.debugState.pointerWorld = { x: worldPos.x, y: worldPos.y };
      this.updateDiagnostics();
    });

    // Generate system contents
    this.generateSystemContents();

    // Input handling
    this.setupInput();

    // Initial render
    this.refresh();
    
    // Start diagnostic updates
    this.updateDiagnostics();
  }

  private updateDiagnostics(): void {
    // Update scene info
    this.debugState.activeScenes = this.scene.manager.getScenes(true).map(s => s.scene.key);
    this.debugState.inputEnabled = this.input.enabled;
    this.debugState.isAnimating = this.isUnitAnimating;
    
    // Check modal state
    const galaxyScene = this.scene.manager.getScene('GalaxyScene');
    this.debugState.galaxyScenePaused = galaxyScene ? this.scene.manager.isPaused('GalaxyScene') : false;
    this.debugState.systemSceneTopmost = this.debugState.activeScenes[0] === 'SystemScene';
    
    // Update selected object info
    const state = getState();
    this.debugState.selectedObjectId = this.selectedObjectId || 'none';
    this.debugState.selectedFleetId = state.selectedFleetId || 'none';
    
    // NEW: Update picked object info
    const pickedObject = this.debugState.pointerWorld.x !== 0 || this.debugState.pointerWorld.y !== 0 
      ? this.pickSystemObjectAt(this.debugState.pointerWorld.x, this.debugState.pointerWorld.y)
      : null;
    
    if (pickedObject) {
      this.debugState.pickedObjectId = pickedObject.id;
      this.debugState.pickedObjectType = pickedObject.type;
      this.debugState.pickedObjectName = pickedObject.name;
    } else {
      this.debugState.pickedObjectId = 'none';
      this.debugState.pickedObjectType = 'none';
      this.debugState.pickedObjectName = 'none';
    }
    
    // Update overlay text with all required fields
    const overlayText = [
      `=== SYSTEMSCENE DEBUG HUD ===`,
      `Screen Coords: (${this.debugState.pointerScreen.x.toFixed(0)}, ${this.debugState.pointerScreen.y.toFixed(0)})`,
      `World Coords: (${this.debugState.pointerWorld.x.toFixed(0)}, ${this.debugState.pointerWorld.y.toFixed(0)})`,
      `Picked Object: ${this.debugState.pickedObjectName} (${this.debugState.pickedObjectType}) [${this.debugState.pickedObjectId}]`,
      `Selected Fleet: ${this.debugState.selectedFleetId}`,
      `Last Action: ${this.debugState.lastAction}`,
      `Last Result: ${this.debugState.lastResult}`,
      `Active Scenes: ${this.debugState.activeScenes.join(', ')}`,
      `SystemScene Topmost: ${this.debugState.systemSceneTopmost}`,
      `GalaxyScene Paused: ${this.debugState.galaxyScenePaused}`,
      `Input Enabled: ${this.debugState.inputEnabled}`,
      `Is Animating: ${this.debugState.isAnimating}`,
      `===============================`
    ];
    
    this.debugOverlay.setText(overlayText.join('\n'));
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
  // NEW: Visual feedback methods
  // ---------------------------------------------------------------------------
  
  private refreshHighlights(): void {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    // Clear highlight layers
    this.highlightLayer.clear();
    this.hoverLayer.clear();
    this.selectionLayer.clear();

    // Draw hover highlight
    if (this.hoveredObjectId) {
      const hoveredObj = this.systemObjects.find(obj => obj.objectId === this.hoveredObjectId);
      if (hoveredObj) {
        const pos = this.hexToPixel(hoveredObj.coord.q, hoveredObj.coord.r, centerX, centerY);
        this.hoverLayer
          .lineStyle(2, 0xffff00, 0.7)
          .strokeCircle(pos.x, pos.y, this.HEX_SIZE * 1.1);
      }
    }

    // Draw selection highlight (from core state)
    const selectedObject = getSelectedSystemObject();
    if (selectedObject && selectedObject.systemId === getState().selectedSystemId) {
      const selectedObj = this.systemObjects.find(obj => obj.objectId === selectedObject.objectId);
      if (selectedObj) {
        const pos = this.hexToPixel(selectedObj.coord.q, selectedObj.coord.r, centerX, centerY);
        
        // Draw selection ring
        this.selectionLayer
          .lineStyle(3, 0x00ff00, 1)
          .strokeCircle(pos.x, pos.y, this.HEX_SIZE * 1.2);
          
        // Draw pulsing effect
        this.highlightLayer
          .lineStyle(2, 0x00ff00, 0.5)
          .strokeCircle(pos.x, pos.y, this.HEX_SIZE * 1.5);
      }
    }
  }
  
  private pulseAsteroid(asteroidId: string): void {
    const asteroid = this.systemObjects.find(obj => obj.id === asteroidId && obj.type === 'asteroid');
    if (!asteroid) return;
    
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;
    const pos = this.hexToPixel(asteroid.coord.q, asteroid.coord.r, centerX, centerY);
    
    // Create pulse effect
    const pulse = this.add.graphics()
      .lineStyle(4, 0xffaa00, 1)
      .strokeCircle(pos.x, pos.y, this.HEX_SIZE * 0.6);
    
    // Animate pulse
    this.tweens.add({
      targets: pulse,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => {
        pulse.destroy();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Movement handling with core integration
  // ---------------------------------------------------------------------------

  private tryMoveSelectedFleetTo(to: { q: number; r: number }): void {
    const selectedFleetId = this.selectedObjectId;
    if (!selectedFleetId) {
      this.infoText.setText('No fleet selected');
      this.debugState.lastResult = 'FAILED: No fleet selected';
      this.updateDiagnostics();
      return;
    }

    const state = getState();
    const selectedFleet = state.fleets[selectedFleetId];
    if (!selectedFleet) {
      this.infoText.setText('Selected fleet not found');
      this.debugState.lastResult = 'FAILED: Fleet not found';
      this.updateDiagnostics();
      return;
    }

    // Initialize system position if not set (for fleets entering systems)
    if (!selectedFleet.systemPos) {
      selectedFleet.systemPos = { q: 0, r: 0 }; // Start at center
    }

    const result = moveFleetInSystem(selectedFleetId, to);

    if (!result.ok) {
      this.infoText.setText(`Move failed: ${result.reason}`);
      this.debugState.lastResult = `FAILED: ${result.reason}`;
      this.updateDiagnostics();
      return;
    }

    // Success: animate then refresh
    if (this.isUnitAnimating) {
      this.queueMovement(selectedFleetId, to);
    } else {
      this.animateFleetMovement(selectedFleetId, to);
    }
    
    this.infoText.setText(`Moved to q=${to.q}, r=${to.r}`);
    this.debugState.lastResult = `SUCCESS: Moved to (${to.q}, ${to.r})`;
    this.updateDiagnostics();
  }

  private pixelToHex(x: number, y: number, centerX: number, centerY: number): { q: number; r: number } {
    const size = this.HEX_SIZE;
    const relX = (x - centerX) / size;
    const relY = (y - centerY) / size;
    
    const q = (2/3) * relX;
    const r = (-1/3) * relX + (Math.sqrt(3)/3) * relY;
    
    return this.hexRound(q, r);
  }

  private hexRound(q: number, r: number): { q: number; r: number } {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    
    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    } else {
      rs = -rq - rr;
    }
    
    return { q: rq, r: rr };
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

      // M key for mining diagnostics
      if (e.key.toLowerCase() === 'm') {
        this.debugState.lastAction = 'MINING_ATTEMPT';
        this.tryMineSelected();
        return;
      }

      // SPACE key for mining
      if (e.key === ' ') {
        e.preventDefault();
        this.debugState.lastAction = 'MINING_ATTEMPT';
        this.tryMineSelected();
        return;
      }
    });

    // Scene-level pointer handlers (MANDATORY - no .setInteractive() reliance)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Throttled pointer move updates
      this.debugState.pointerScreen = { x: p.x, y: p.y };
      const worldPos = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.debugState.pointerWorld = { x: worldPos.x, y: worldPos.y };
      this.updateDiagnostics();
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      console.log('[SystemScene] pointerdown fired');
      
      // Update pointer coords
      this.debugState.pointerScreen = { x: p.x, y: p.y };
      const worldPos = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.debugState.pointerWorld = { x: worldPos.x, y: worldPos.y };
      
      console.log('[SystemScene] world coords:', this.debugState.pointerWorld);
      
      // Route through unified handler
      this.onSystemPointerDown(worldPos.x, worldPos.y);
      
      // Update diagnostics
      this.updateDiagnostics();
    });
  }

  // PHASE 2: Click Router Implementation
  private onSystemPointerDown(worldX: number, worldY: number): void {
    console.log('[SystemScene] onSystemPointerDown called with:', worldX, worldY);
    
    this.debugState.lastAction = 'POINTER_DOWN';
    
    // Block input during animation
    if (this.isUnitAnimating) {
      this.debugState.lastResult = 'FAILED: Animation in progress';
      console.log('[SystemScene] input blocked - animating');
      this.updateDiagnostics();
      return;
    }

    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;

    // Convert to hex coordinates
    const hex = this.pixelToHex(worldX, worldY, centerX, centerY);
    this.debugState.pickedHex = hex;
    
    console.log('[SystemScene] picked hex:', hex);
    
    // Update debug text
    this.debugText.setText(`DEBUG: World (${worldX.toFixed(0)}, ${worldY.toFixed(0)}) → Hex (${hex.q}, ${hex.r})`);

    // Handle hex click
    this.handleHexClick(hex.q, hex.r, worldX, worldY, centerX, centerY);
  }

  // ---------------------------------------------------------------------------
  // NEW: Robust object picking (camera-safe)
  // ---------------------------------------------------------------------------
  
  private pickSystemObjectAt(worldX: number, worldY: number): SystemObject | null {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;
    
    let best: SystemObject | null = null;
    let bestDist = Infinity;
    
    for (const obj of this.systemObjects) {
      const objPos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);
      const dx = worldX - objPos.x;
      const dy = worldY - objPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Use larger pick radius for easier selection
      if (dist < this.PICK_RADIUS * 2 && dist < bestDist) {
        best = obj;
        bestDist = dist;
      }
    }
    
    return best;
  }

  private findObjectAtHex(q: number, r: number): SystemObject | null {
    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;
    
    const hexPos = this.hexToPixel(q, r, centerX, centerY);
    
    for (const obj of this.systemObjects) {
      const objPos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);
      const dx = hexPos.x - objPos.x;
      const dy = hexPos.y - objPos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      
      if (d < this.PICK_RADIUS) {
        return obj;
      }
    }
    
    return null;
  }

  private handleHexClick(q: number, r: number, worldX: number, worldY: number, centerX: number, centerY: number): void {
    console.log('[SystemScene] handleHexClick called with hex:', q, r);
    
    // Debug: Show hex indicator
    const hexPos = this.hexToPixel(q, r, centerX, centerY);
    const debugHex = this.add.graphics()
      .lineStyle(2, 0x00ff00, 1)
      .strokeCircle(hexPos.x, hexPos.y, this.HEX_SIZE * 0.8);
    
    // Remove debug indicator after 500ms
    this.time.delayedCall(500, () => {
      debugHex.destroy();
    });

    const state = getState();
    const systemId = state.selectedSystemId;
    if (!systemId) {
      this.debugState.lastResult = 'FAILED: No system selected';
      this.updateDiagnostics();
      return;
    }

    // NEW: Use robust picking first
    const clickedObject = this.pickSystemObjectAt(worldX, worldY);
    
    if (clickedObject) {
      console.log('[SystemScene] found object:', clickedObject);
      this.debugState.lastAction = 'SELECT_OBJECT';
      this.debugState.lastResult = `OK: Selected ${clickedObject.type} "${clickedObject.name}"`;
      this.selectedObjectId = clickedObject.id;
      
      // NEW: Check for mining interaction
      if (clickedObject.type === 'asteroid') {
        const selectedFleetId = this.selectedObjectId;
        if (selectedFleetId) {
          const selectedFleet = state.fleets[selectedFleetId];
          if (selectedFleet && selectedFleet.location === systemId && selectedFleet.role === 'MINER') {
            console.log('[SystemScene] attempting mining on asteroid:', clickedObject.name);
            this.debugState.lastAction = 'MINING_ATTEMPT';
            
            // Use existing mining method
            this.tryMineSelected();
            this.updateDiagnostics();
            return;
          }
        }
      }
      
      // Regular object selection
      selectSystemObject(systemId, clickedObject.objectId);
      this.refresh();
      this.updateDiagnostics();
      return;
    }

    // Check for fleet at hex
    const fleetAtHex = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.location === systemId && 
      f.systemPos && 
      f.systemPos.q === q && 
      f.systemPos.r === r
    );

    if (fleetAtHex) {
      console.log('[SystemScene] found fleet:', fleetAtHex);
      this.debugState.lastAction = 'SELECT_FLEET';
      this.debugState.lastResult = `OK: Selected fleet "${fleetAtHex.name}"`;
      this.selectedObjectId = fleetAtHex.id;
      this.refresh();
      this.updateDiagnostics();
      return;
    }

    // Empty hex - try to move selected fleet
    if (this.selectedObjectId) {
      const selectedFleet = state.fleets[this.selectedObjectId];
      if (selectedFleet && selectedFleet.location === systemId) {
        console.log('[SystemScene] attempting fleet movement to:', q, r);
        this.debugState.lastAction = 'MOVE_FLEET';
        
        // Use the new movement pipeline
        this.tryMoveSelectedFleetTo({ q, r });
        return;
      }
    }

    // Empty hex with no fleet selected
    console.log('[SystemScene] empty hex clicked');
    this.debugState.lastAction = 'EMPTY_HEX';
    this.debugState.lastResult = `OK: Empty hex (${q}, ${r})`;
    this.selectedObjectId = null;
    this.updateDiagnostics();
    
    // Update info text
    const currentInfo = this.infoText.text;
    this.infoText.setText(currentInfo + `\n[Picked hex ${q},${r}]`);
    this.time.delayedCall(2000, () => { this.refresh(); });
  }

  
  private getFleetHexPosition(anchor: Fleet['systemAnchor']): { q: number; r: number } {
    // Convert systemAnchor to hex coordinates
    if (!anchor) return { q: 0, r: 0 };
    
    if (anchor === 'STAR') {
      return { q: 0, r: 0 };
    }
    
    const parts = anchor.split(':');
    if (parts.length !== 2) return { q: 0, r: 0 };
    
    const type = parts[0];
    const id = parts[1];
    
    // For now, return a simple position based on type
    // In a real implementation, you'd look up the actual object position
    switch (type) {
      case 'PLANET':
      case 'ASTEROID':
      case 'STATION':
        // Find the object and return its position
        const obj = this.systemObjects.find(o => o.id === id);
        return obj ? obj.coord : { q: 0, r: 0 };
      default:
        return { q: 0, r: 0 };
    }
  }

  private queueMovement(fleetId: string, targetHex: { q: number; r: number }): void {
    // Simple queue implementation
    if (!this.animationQueue) {
      this.animationQueue = [];
    }
    this.animationQueue.push({ fleetId, targetHex });
  }

  private animateFleetMovement(fleetId: string, targetHex: { q: number; r: number }): void {
    const sprite = this.systemFleetSprites[fleetId];
    if (!sprite) return;

    const viewX = (this.cameras.main.width - 800) / 2;
    const viewY = (this.cameras.main.height - 600) / 2;
    const centerX = viewX + 400;
    const centerY = viewY + 300;
    
    const targetPos = this.hexToPixel(targetHex.q, targetHex.r, centerX, centerY);
    
    // Set animation flag to block input
    this.isUnitAnimating = true;
    this.debugText.setText('DEBUG: Animating fleet movement...');
    
    this.tweens.add({
      targets: sprite,
      x: targetPos.x,
      y: targetPos.y,
      duration: 250,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        // Clear animation flag
        this.isUnitAnimating = false;
        this.debugText.setText('DEBUG: Fleet movement complete');
        
        // Core state was already updated by tryMoveSelectedFleetTo
        // Just refresh visuals and process queue
        this.processAnimationQueue();
        
        // Refresh UI to show updated positions
        this.refresh();
      }
    });
  }

  private processAnimationQueue(): void {
    if (this.animationQueue && this.animationQueue.length > 0 && !this.isUnitAnimating) {
      const next = this.animationQueue.shift();
      if (next) {
        this.animateFleetMovement(next.fleetId, next.targetHex);
      }
    }
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
      return;
    }
    
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

    // If fleet has system position (hex-based), use that
    if (fleet.systemPos) {
      const hexPos = this.hexToPixel(fleet.systemPos.q, fleet.systemPos.r, centerX, centerY);
      x = hexPos.x;
      y = hexPos.y;
    }
    // Fallback to systemAnchor for compatibility
    else if (fleet.systemAnchor) {
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

    // Stop SystemScene and wake GalaxyScene
    this.scene.stop();
    this.scene.wake('GalaxyScene');
    
    console.log('SystemScene closed, GalaxyScene resumed');
  }

  private tryMineSelected(): void {
    const state = getState();
    const systemId = state.selectedSystemId;
    
    if (!systemId) {
      this.debugText.setText('DEBUG: No system selected');
      return;
    }

    const selectedObject = getSelectedSystemObject();
    if (!selectedObject || selectedObject.systemId !== systemId) {
      this.debugText.setText('DEBUG: No object selected');
      return;
    }

    // Find the visual object
    const selected = this.systemObjects.find(obj => obj.objectId === selectedObject.objectId);
    if (!selected || selected.type !== 'asteroid') {
      this.debugText.setText('DEBUG: Selected object is not an asteroid');
      return;
    }

    // Check if player has miner at this system
    const miner = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.role === 'MINER' && 
      f.location === systemId
    );

    if (!miner) {
      this.debugText.setText('DEBUG: No miner fleet at this system');
      this.infoText.setText('MINING FAILED: No miner fleet at this system');
      return;
    }

    // Attempt mining
    const success = mineAsteroid(systemId, selected.id);
    
    if (success) {
      this.debugText.setText('DEBUG: Mining successful!');
      this.infoText.setText(`MINING: ${miner.name} mined ${selected.name}`);
      this.debugState.lastResult = `SUCCESS: Mined ${selected.name}`;
      
      // Add visual pulse effect
      this.pulseAsteroid(selected.id);
    } else {
      this.debugText.setText('DEBUG: Mining failed');
      this.infoText.setText('MINING FAILED: Cannot mine this asteroid');
      this.debugState.lastResult = 'FAILED: Mining failed';
    }

    this.refresh();
  }

  private selectObjectByType(type: number): void {
    const types: ('planet' | 'asteroid' | 'station' | 'anomaly')[] = ['planet', 'asteroid', 'station', 'anomaly'];
    const targetType = types[type - 1];
    if (!targetType) return;

    const target = this.systemObjects.find(obj => obj.type === targetType);
    if (target) {
      this.selectedObjectId = target.id;
      this.refresh();
    }
  }

  update(): void {
    // Keep your existing behavior, but avoid rebuilding objects per-frame.
    // (We only redraw grid/selection + info, which is cheap.)
    this.refresh();
  }
}
