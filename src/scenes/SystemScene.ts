// src/scenes/SystemScene.ts
// -----------------------------------------------------------------------------
// HexFleet — System Scene (Hex Grid View with RNG Contents)
//
// CHANGE (per request):
// - Prevent name overlap by moving names UNDER the marker
// - Keep type icons on the RIGHT side of the marker
// -----------------------------------------------------------------------------

import Phaser from 'phaser';
import { getState, mineAsteroid, isSystemBeingMined, invadePlanet, reinforcePlanet, getPlanetController } from '../core/GameState';
import { VisualStyle } from '../ui/VisualStyle';
import { getAffiliationColor, getHighlightStyle, getStationAffiliation, getPlanetAffiliation } from '../ui/colors';

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
  private infoText!: Phaser.GameObjects.Text;

  private systemObjects: SystemObject[] = [];
  private selectedObjectId: string | null = null;

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
          if (system?.asteroids && system.asteroids.yieldRemaining <= 0) {
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
          iconText += ` 👥${obj.planetTroops}`;
        }
      } else if (obj.type === 'asteroid') {
        if (isBeingMined) {
          iconText += ' ⛏️'; // Add mining pickaxe
        }
        if (system?.asteroids && system.asteroids.yieldRemaining <= 0) {
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

      // M to mine selected asteroid
      if (e.key.toLowerCase() === 'm') {
        this.mineSelectedAsteroid();
        return;
      }

      // Tab to cycle through objects
      if (e.key.toLowerCase() === 'tab') {
        this.selectNextObject();
        return;
      }

      // Space to mine if asteroid selected
      if (e.key === ' ') {
        this.mineSelectedAsteroid();
        return;
      }

      // I to invade planet
      if (e.key.toLowerCase() === 'i') {
        this.invadeSelectedPlanet();
        return;
      }

      // R to reinforce planet
      if (e.key.toLowerCase() === 'r') {
        this.reinforceSelectedPlanet();
        return;
      }

      // Number keys to select objects by type
      if (e.key >= '1' && e.key <= '4') {
        this.selectObjectByType(parseInt(e.key));
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

  private selectNextObject(): void {
    if (this.systemObjects.length === 0) return;

    const currentIndex = this.selectedObjectId ? 
      this.systemObjects.findIndex(o => o.id === this.selectedObjectId) : -1;
    const nextIndex = (currentIndex + 1) % this.systemObjects.length;
    this.selectedObjectId = this.systemObjects[nextIndex].id;
    this.refresh();
  }

  private selectObjectByType(typeKey: number): void {
    const typeMap: { [key: number]: SystemObject['type'] } = {
      1: 'planet',
      2: 'asteroid', 
      3: 'station',
      4: 'anomaly'
    };

    const targetType = typeMap[typeKey];
    if (!targetType) return;

    const objects = this.systemObjects.filter(o => o.type === targetType);
    if (objects.length === 0) return;

    // Select first object of this type
    this.selectedObjectId = objects[0].id;
    this.refresh();
  }

  private invadeSelectedPlanet(): void {
    if (!this.selectedObjectId) return;

    const selected = this.systemObjects.find(o => o.id === this.selectedObjectId);
    if (!selected || selected.type !== 'planet') return;

    const state = getState();
    const systemId = state.selectedSystemId;
    if (!systemId) return;

    // Find player combat fleet in system
    const playerCombatFleet = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.role === 'COMBAT' && 
      f.location === systemId
    );

    if (!playerCombatFleet) {
      this.showPlanetFeedback(selected, 'NO COMBAT FLEET IN SYSTEM', 0xff4444); // RED for error
      return;
    }

    if (selected.planetController === 'PLAYER') {
      this.showPlanetFeedback(selected, 'ALREADY CONTROLLED', 0xffaa00);
      return;
    }

    const success = invadePlanet(systemId, selected.id, playerCombatFleet.id);
    if (success) {
      this.showPlanetFeedback(selected, 'PLANET CONQUERED!', 0x4a9eff); // BLUE for success (player color)
      selected.planetController = 'PLAYER';
      selected.planetTroops = (selected.planetTroops || 0) + 30; // Occupation troops
    } else {
      this.showPlanetFeedback(selected, 'INVASION FAILED!', 0xff4444); // RED for failure
    }

    this.refresh();
  }

  private reinforceSelectedPlanet(): void {
    if (!this.selectedObjectId) return;

    const selected = this.systemObjects.find(o => o.id === this.selectedObjectId);
    if (!selected || selected.type !== 'planet') return;

    const state = getState();
    const systemId = state.selectedSystemId;
    if (!systemId) return;

    // Find player fleet in system
    const playerFleet = Object.values(state.fleets).find(f => 
      f.owner === 'PLAYER' && 
      f.location === systemId
    );

    if (!playerFleet) {
      this.showPlanetFeedback(selected, 'NO FLEET IN SYSTEM', 0xff4444); // RED for error
      return;
    }

    if (selected.planetController !== 'PLAYER') {
      this.showPlanetFeedback(selected, 'MUST CONTROL PLANET FIRST', 0xff4444); // RED for error
      return;
    }

    const success = reinforcePlanet(systemId, selected.id, playerFleet.id);
    if (success) {
      this.showPlanetFeedback(selected, 'PLANET REINFORCED!', 0x4a9eff); // BLUE for success (player color)
      selected.planetTroops = (selected.planetTroops || 0) + 20;
    } else {
      this.showPlanetFeedback(selected, 'REINFORCEMENT FAILED!', 0xff4444); // RED for failure
    }

    this.refresh();
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

    if (!this.selectedObjectId) return;

    const obj = this.systemObjects.find(o => o.id === this.selectedObjectId);
    if (!obj) return;

    const pos = this.hexToPixel(obj.coord.q, obj.coord.r, centerX, centerY);
    
    // Draw selection highlight on dedicated layer
    const selectedStyle = getHighlightStyle('selected');
    this.drawHexOutline(this.selectionLayer, pos.x, pos.y, this.HEX_SIZE + 2, selectedStyle.stroke, selectedStyle.width);
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

    // System information
    const isBeingMined = isSystemBeingMined(systemId);
    const miningStatus = isBeingMined ? '⛏️ MINING' : '';
    const asteroidInfo = system.asteroids ? 
      `Asteroids: ${system.asteroids.metalTier} (${system.asteroids.yieldRemaining.toFixed(1)}% remaining)` : 
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

    if (this.selectedObjectId) {
      const selected = this.systemObjects.find(o => o.id === this.selectedObjectId);
      if (selected) {
        lines.push('');
        lines.push(`SELECTED: ${selected.name} (${selected.type})`);
        
        if (selected.type === 'asteroid') {
          lines.push('Press M to mine asteroid');
          if (system.asteroids && system.asteroids.yieldRemaining <= 0) {
            lines.push('⚠️ ASTEROID DEPLETED');
          }
        } else if (selected.type === 'planet') {
          lines.push(`Controller: ${selected.planetController}`);
          if (selected.planetTroops) {
            lines.push(`Troops: ${selected.planetTroops} | Defenses: ${selected.planetDefenses || 0}`);
          }
          if (selected.planetController === 'PLAYER') {
            lines.push('Press R to reinforce troops');
          } else if (selected.planetController === 'ENEMY' || selected.planetController === 'CONTESTED') {
            lines.push('Press I to invade planet (requires combat fleet)');
          } else {
            lines.push('Neutral planet - can be colonized');
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
  }

  private mineSelectedAsteroid(): void {
    if (!this.selectedObjectId) return;

    const selected = this.systemObjects.find(o => o.id === this.selectedObjectId);
    if (!selected || selected.type !== 'asteroid') return;

    const state = getState();
    const systemId = state.selectedSystemId;
    if (!systemId) return;

    const system = state.galaxy[systemId];
    if (system?.asteroids && system.asteroids.yieldRemaining <= 0) {
      // Visual feedback for depleted asteroid
      this.showMiningFeedback(selected, 'DEPLETED', 0xff6666);
      return;
    }

    const success = mineAsteroid(systemId, selected.id);
    if (success) {
      // Show success feedback with player color
      const yieldRemaining = system?.asteroids?.yieldRemaining ?? 100;
      this.showMiningFeedback(selected, `MINED! (${yieldRemaining.toFixed(1)}% left)`, 0x4a9eff); // BLUE for success
      
      // Update asteroid visual if depleted
      if (system?.asteroids && system.asteroids.yieldRemaining <= 0) {
        // Change asteroid to depleted appearance
        selected.marker.setFillStyle(0x666666, 1);
        selected.icon.setText('💀');
      }
    } else {
      // Show failure feedback
      this.showMiningFeedback(selected, 'MINING FAILED', 0xff4444); // RED for failure
    }

    this.refresh();
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

    this.scene.stop();
    this.scene.resume('GalaxyScene');
  }

  update(): void {
    // Keep your existing behavior, but avoid rebuilding objects per-frame.
    // (We only redraw grid/selection + info, which is cheap.)
    this.refresh();
  }
}
