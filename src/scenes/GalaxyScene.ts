// src/scenes/GalaxyScene.ts
// -----------------------------------------------------------------------------
// HexFleet — Galaxy Scene (Hex Grid + Text-First UI)
//
// HARD RULES:
// - GameState is pure; no Phaser objects stored there
// - Scene reads state via getters, mutates only via GameState actions
// - Text-first UI overlays only
// -----------------------------------------------------------------------------

import Phaser from 'phaser';

import type { StarSystem, Fleet } from '../core/types';
import { getState, selectSystem, selectFleet, moveFleet, endTurn, saveGame, loadGame, newGame, buildFleet } from '../core/GameState';
import { VisualStyle } from '../ui/VisualStyle';
import { hexDistance } from '../utils/hex';
import { getFleetGlyph } from '../ui/IconKit';
import type { PerformanceMetrics, AccessibilitySettings } from '../core/types';

type SysRender = {
  id: string;
  x: number;
  y: number;
  marker: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Text; // icon stays on RIGHT side
};

export default class GalaxyScene extends Phaser.Scene {
  private readonly HEX_SIZE = VisualStyle.hexSize;
  private readonly PICK_RADIUS = VisualStyle.pickRadius;

  // Layout rule:
  // - icon stays to the RIGHT of the node
  // - name label stays UNDER the node
  private readonly ICON_OFFSET_X = Math.round(VisualStyle.hexSize * 0.55);
  private readonly ICON_OFFSET_Y = 0;
  private readonly LABEL_OFFSET_Y = Math.round(VisualStyle.hexSize * 0.55);

  constructor() {
    super({ key: 'GalaxyScene' });
  }

  private cameraDrag = false;
  private dragStart = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0 };

  private gridLayer!: Phaser.GameObjects.Graphics;
  private selectionLayer!: Phaser.GameObjects.Graphics;
  private rangeLayer!: Phaser.GameObjects.Graphics; // NEW: dedicated layer for reachable highlights

  private systems: SysRender[] = [];

  // Fleet sprites for animation
  private fleetSprites: Record<string, Phaser.GameObjects.Container> = {};
  private prevFleetLocations: Record<string, string> = {}; // Track for animation triggers

  // UI text overlays
  private fleetListText!: Phaser.GameObjects.Text;
  private intelText!: Phaser.GameObjects.Text;
  private headerText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;

  // Move planning
  private plannedMove: { fleetId: string; targetSystemId: string } | null = null;

  // Real-time updates
  private lastUpdateTime = 0;

  create(): void {
    this.cameras.main.setBackgroundColor(VisualStyle.bg);

    this.gridLayer = this.add.graphics();
    this.selectionLayer = this.add.graphics();
    this.rangeLayer = this.add.graphics(); // NEW: range layer drawn after grid but before selection

    // Build system render cache
    this.rebuildSystemRenderables();

    // UI
    this.headerText = this.add
      .text(16, 12, '', { font: VisualStyle.font, color: VisualStyle.uiText })
      .setScrollFactor(0);

    this.turnText = this.add
      .text(this.cameras.main.width - 200, 12, '', { font: VisualStyle.font, color: VisualStyle.uiText })
      .setScrollFactor(0)
      .setOrigin(1, 0); // Right-aligned

    this.fleetListText = this.add
      .text(16, 48, '', { font: VisualStyle.font, color: VisualStyle.uiText })
      .setScrollFactor(0);

    this.intelText = this.add
      .text(16, 330, '', { font: VisualStyle.smallFont, color: VisualStyle.uiDim })
      .setScrollFactor(0);

    // Input: click systems
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Left mouse drag to pan
      if (p.leftButtonDown()) {
        this.cameraDrag = true;
        this.dragStart = { x: p.x, y: p.y };
        this.camStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
      }

      // Right click to select fleet cycling (optional)
      if (p.rightButtonDown()) {
        this.selectNextPlayerFleet();
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      // treat as click if minimal movement
      const dx = Math.abs(p.x - this.dragStart.x);
      const dy = Math.abs(p.y - this.dragStart.y);
      const isClick = dx < 5 && dy < 5;

      this.cameraDrag = false;

      if (!isClick) return;

      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const clickedSystem = this.pickSystem(world.x, world.y);
      if (!clickedSystem) return;

      // Select system always
      selectSystem(clickedSystem.id);

      // If a fleet is selected, attempt move
      const s = getState();
      const fleetId = s.selectedFleetId;
      let moveAttempted = false;

      if (fleetId) {
        const f = s.fleets[fleetId];
        const from = s.galaxy[f.location];
        const to = s.galaxy[clickedSystem.id];

        const isPlayerPhase = s.phase === 'PLAYER';
        const hasMoves = f.movesLeft > 0;
        const isDifferent = f.location !== clickedSystem.id;
        const isAdjacent = from && to ? hexDistance(from.coord, to.coord) === 1 : false;

        moveAttempted = true;

        if (isPlayerPhase && hasMoves && isDifferent && isAdjacent) {
          // Plan the move instead of executing immediately
          this.plannedMove = { fleetId, targetSystemId: clickedSystem.id };
          this.refreshAll(); // Update visual feedback
        } else {
          // Move failed - open system view
          this.openSystemView();
        }
      }

      // If no fleet selected, open system view
      if (!moveAttempted) {
        this.openSystemView();
      }

      // Update visuals immediately
      this.refreshAll();
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.cameraDrag) return;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      this.cameras.main.scrollX = this.camStart.x - dx;
      this.cameras.main.scrollY = this.camStart.y - dy;
    });

    // Zoom wheel
    this.input.on('wheel', (_pointer: any, _go: any, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.4, 1.6);
      cam.zoom = next;
    });

    // Hotkeys
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        saveGame();
        this.refreshAll();
        return;
      }

      if (e.ctrlKey && key === 'l') {
        e.preventDefault();
        loadGame();
        this.refreshAll();
        return;
      }

      if (key === 'n') {
        newGame();
        this.rebuildSystemRenderables();
        this.refreshAll();
        return;
      }

      if (key === 'e') {
        advanceTurn();
        this.refreshAll();
        return;
      }

      if (key === 'space') {
        // Space bar toggles auto-end turn mode (placeholder)
        this.refreshAll();
        return;
      }

      if (key === 'escape') {
        // ESC cancels planned move or returns to menu
        if (this.plannedMove) {
          this.plannedMove = null;
          this.refreshAll();
        } else {
          this.scene.start('MenuScene');
        }
        return;
      }

      if (key === 'enter') {
        // Enter confirms planned move (turn-based)
        if (this.plannedMove) {
          const success = moveFleet(this.plannedMove.fleetId, this.plannedMove.targetSystemId);
          if (success) {
            this.plannedMove = null;
          }
          this.refreshAll();
        }
        return;
      }

      if (key === 'e') {
        // E key ends turn
        endTurn();
        this.refreshAll();
        return;
      }

      if (key === 'tab') {
        // Tab cycles through fleets
        if (e.shiftKey) {
          // this.selectPreviousPlayerFleet(); // Function doesn't exist yet
        } else {
          // this.selectNextPlayerFleet(); // Function doesn't exist yet
        }
        return;
      }

      if (key === 'f') {
        // F key also cycles to next fleet
        this.selectNextPlayerFleet();
        return;
      }

      if (key === 's' && !e.ctrlKey) {
        this.scene.pause('GalaxyScene');
        this.scene.launch('SystemScene');
        return;
      }

      // Build ships at selected system
      const st = getState();
      const buildAt = st.selectedSystemId ?? 'SOL';
      if (key === '1') {
        buildFleet('CORVETTE', buildAt);
        this.refreshAll();
        return;
      }
      if (key === '2') {
        buildFleet('FRIGATE', buildAt);
        this.refreshAll();
        return;
      }
      if (key === '3') {
        buildFleet('DESTROYER', buildAt);
        this.refreshAll();
        return;
      }
      if (key === 'b') {
        // buildStation(buildAt); // Function doesn't exist yet
        this.refreshAll();
        return;
      }

      if (key === 'd') {
        // dismantleFleet(s.selectedFleetId); // Function doesn't exist yet
        if (st.selectedFleetId) {
          dismantleFleet(st.selectedFleetId);
          this.refreshAll();
        }
        return;
      }
    });

    // First draw
    this.refreshAll();
  }

  update(): void {
    // Repaint grid + selection each frame (cheap enough for small maps)
    this.drawGrid();
    this.drawRangeHighlights(); // NEW: draw reachable highlights on dedicated layer
    this.drawSelection();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private refreshAll(): void {
    this.refreshHeader();
    this.refreshFleetList();
    this.refreshIntel();
    this.layoutHud();
    this.refreshSystemMarkers();
    this.refreshFleets(); // NEW: Refresh fleet sprites with animation
  }

  private layoutHud(): void {
    const left = 16;
    const top = 12;
    const pad = 12;

    this.headerText.setPosition(left, top);

    const headerH = this.headerText.getBounds().height;
    const fleetY = top + headerH + pad;
    this.fleetListText.setPosition(left, fleetY);

    const viewH = this.cameras.main.height;
    const intelH = this.intelText.getBounds().height;
    const intelY = Math.max(fleetY + this.fleetListText.getBounds().height + pad, viewH - pad - intelH);

    this.intelText.setPosition(left, intelY);
  }

  private refreshHeader(): void {
    const s = getState();
    const tm = s.resources.tieredMetals;

    const phase = s.phase;
    const selSys = s.selectedSystemId ? s.galaxy[s.selectedSystemId]?.name : '—';
    const selFleet = s.selectedFleetId ? s.fleets[s.selectedFleetId]?.name : '—';
    
    // Show planned move status
    const plannedMoveText = this.plannedMove ? 
      `PLANNED: ${s.fleets[this.plannedMove.fleetId]?.name} → ${s.galaxy[this.plannedMove.targetSystemId]?.name}` : 
      '';

    this.headerText.setText(
      [
        `TURN ${s.turn}   PHASE: ${phase}`,
        `Selected System: ${selSys}    Selected Fleet: ${selFleet}`,
        `Metals: T1 ${tm.T1} | T2 ${tm.T2} | T3 ${tm.T3}`,
        plannedMoveText ? `PLANNED MOVE: ${plannedMoveText}` : '',
        `Keys: E EndTurn | Tab/Shift+Tab Fleet | F Next Fleet | Enter Confirm Move | ESC Cancel | S SystemView | B Station | D Dismantle | 1 Corvette | 2 Frigate | 3 Destroyer | ESC Menu`
      ].filter(line => line !== '').join('\n')
    );

    // Update turn indicator on the right
    this.turnText.setText(`TURN ${s.turn}\n${phase}`);
    
    // Color code the phase
    if (phase === 'PLAYER') {
      this.turnText.setColor('#4a9eff'); // Blue for player turn
    } else {
      this.turnText.setColor('#f44336'); // Red for enemy turn
    }
  }

  private refreshFleetList(): void {
    const s = getState();
    const fleets = Object.values(s.fleets)
      .filter(f => f.owner === 'PLAYER')
      .sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [];
    lines.push('FLEETS');
    lines.push('------------------------------------------');

    for (const f of fleets) {
      const isSel = s.selectedFleetId === f.id;
      const loc = s.galaxy[f.location]?.name ?? f.location;

      const roleTag = f.role === 'MINER' ? `MINER(${f.miningTier ?? 'T1'})` : 'COMBAT';

      const line =
        `${isSel ? '>' : ' '} ` +
        `@ ${loc.padEnd(8)} ` +
        `MP ${String(f.movesLeft).padStart(2)}/${String(f.maxMoves).padEnd(2)} ` +
        `${roleTag.padEnd(12)} ` +
        `${f.name.padEnd(14)} ` +
        `${getFleetGlyph(f)}`;

      lines.push(line);
    }

    this.fleetListText.setText(lines.join('\n'));
    this.fleetListText.setColor(VisualStyle.uiText);
  }

  private refreshIntel(): void {
    const s = getState();
    const last = s.intelLog.slice(-10);

    const lines: string[] = [];
    lines.push('INTEL FEED');
    lines.push('------------------------------------------');
    for (const it of last) {
      lines.push(`[T${it.turn}] ${it.text}`);
    }
    this.intelText.setText(lines.join('\n'));
  }

  private refreshSystemMarkers(): void {
    const s = getState();

    for (const r of this.systems) {
      const sys = s.galaxy[r.id];

      const isUnknown = sys.intel === 'UNKNOWN';
      const glyph = systemGlyph(sys.intel);
      const hasAst = sys.asteroids ? true : false;
      const isBeingMined = isSystemBeingMined(sys.id);
      const miningIcon = isBeingMined ? ' ⛏️' : '';
      const yieldInfo = sys.asteroids && sys.asteroids.yieldRemaining < 100 ? 
        ` ${Math.floor(sys.asteroids.yieldRemaining)}%` : '';
      
      r.icon.setText(`${glyph}${hasAst ? ' ⟡' : ''}${miningIcon}${yieldInfo}`);

      // NAME stays UNDER node: just the system name
      r.label.setText(sys.name);

      // Marker + text colors
      if (isUnknown) {
        r.marker.setFillStyle(VisualStyle.systemUnknown, 1);
        r.label.setColor(VisualStyle.uiDim);
        r.icon.setColor(VisualStyle.uiDim);
      } else {
        r.marker.setFillStyle(VisualStyle.systemNode, 1);
        r.label.setColor(VisualStyle.uiText);
        r.icon.setColor(VisualStyle.uiText);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Hex grid / selection
  // ---------------------------------------------------------------------------

  private drawGrid(): void {
    const s = getState();
    const g = this.gridLayer;
    g.clear();

    // Use affiliation resolver for consistent colors
    const playerLocations = new Set(Object.values(s.fleets).filter(f => f.owner === 'PLAYER').map(f => f.location));
    const enemyLocations = new Set(Object.values(s.fleets).filter(f => f.owner === 'ENEMY').map(f => f.location));

    for (const sys of Object.values(s.galaxy)) {
      const c = this.hexToPixel(sys.coord.q, sys.coord.r);
      
      // Determine affiliation and get color
      const hasPlayerFleet = playerLocations.has(sys.id);
      const hasEnemyFleet = enemyLocations.has(sys.id);
      const affiliation = getSystemAffiliation(sys.id, hasPlayerFleet, hasEnemyFleet, sys.intel);
      const colors = getAffiliationColor(affiliation);
      
      // Use affiliation color for grid (stroke only)
      this.drawHexOutline(g, c.x, c.y, this.HEX_SIZE, colors.stroke, VisualStyle.gridLineWidth);
    }
  }

  // NEW: Dedicated method for reachable highlights
  private drawRangeHighlights(): void {
    const s = getState();
    const g = this.rangeLayer;
    g.clear();

    // If fleet selected, show reachable ring (adjacent) - stroke only
    if (s.selectedFleetId) {
      const f = s.fleets[s.selectedFleetId];
      const from = s.galaxy[f.location];
      if (!from) return;

      const reachableStyle = getHighlightStyle('reachable');
      g.lineStyle(reachableStyle.width, reachableStyle.stroke, reachableStyle.alpha);

      for (const other of Object.values(s.galaxy)) {
        if (hexDistance(from.coord, other.coord) !== 1) continue;
        const p = this.hexToPixel(other.coord.q, other.coord.r);
        this.drawHexOutline(g, p.x, p.y, this.HEX_SIZE - 6, reachableStyle.stroke, reachableStyle.width);
      }
    }
  }

  private drawSelection(): void {
    const s = getState();
    const g = this.selectionLayer;
    g.clear();

    // Draw selected system
    if (!s.selectedSystemId) return;
    const sys = s.galaxy[s.selectedSystemId];
    if (!sys) return;

    const selectedStyle = getHighlightStyle('selected');
    const c = this.hexToPixel(sys.coord.q, sys.coord.r);
    this.drawHexOutline(g, c.x, c.y, this.HEX_SIZE + 3, selectedStyle.stroke, selectedStyle.width);

    // Draw selected fleet location (if different from selected system)
    if (s.selectedFleetId) {
      const fleet = s.fleets[s.selectedFleetId];
      if (fleet && fleet.location !== s.selectedSystemId) {
        const fleetSystem = s.galaxy[fleet.location];
        if (fleetSystem) {
          const f = this.hexToPixel(fleetSystem.coord.q, fleetSystem.coord.r);
          // Use hover style for fleet location indicator
          const hoverStyle = getHighlightStyle('hover');
          this.drawHexOutline(g, f.x, f.y, this.HEX_SIZE + 1, hoverStyle.stroke, hoverStyle.width);
        }
      }
    }

    // Draw planned move
    if (this.plannedMove) {
      const fleet = s.fleets[this.plannedMove.fleetId];
      const targetSystem = s.galaxy[this.plannedMove.targetSystemId];
      
      if (fleet && targetSystem) {
        // Draw dashed line from fleet to target
        const fromPos = this.hexToPixel(s.galaxy[fleet.location].coord.q, s.galaxy[fleet.location].coord.r);
        const toPos = this.hexToPixel(targetSystem.coord.q, targetSystem.coord.r);
        
        g.lineStyle(3, 0xffaa00, 0.8); // Orange dashed line
        g.setAlpha(0.8);
        
        // Draw dashed line manually
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const dashLength = 8;
        const gapLength = 4;
        
        for (let i = 0; i < distance; i += dashLength + gapLength) {
          const startRatio = i / distance;
          const endRatio = Math.min((i + dashLength) / distance, 1);
          
          g.beginPath();
          g.moveTo(fromPos.x + dx * startRatio, fromPos.y + dy * startRatio);
          g.lineTo(fromPos.x + dx * endRatio, fromPos.y + dy * endRatio);
          g.strokePath();
        }
        
        // Highlight target system with planned move style (orange)
        this.drawHexOutline(g, toPos.x, toPos.y, this.HEX_SIZE + 2, 0xffaa00, 3);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // System picking / layout
  // ---------------------------------------------------------------------------

  private rebuildSystemRenderables(): void {
    // destroy old
    for (const s of this.systems) {
      s.marker.destroy();
      s.label.destroy();
      s.icon.destroy();
    }
    this.systems = [];

    const st = getState();

    for (const sys of Object.values(st.galaxy)) {
      const p = this.hexToPixel(sys.coord.q, sys.coord.r);

      const marker = this.add.circle(p.x, p.y, 6, VisualStyle.systemNode, 1);

      // ICON (right side)
      const icon = this.add
        .text(p.x + this.ICON_OFFSET_X, p.y + this.ICON_OFFSET_Y, '', {
          font: VisualStyle.smallFont,
          color: VisualStyle.uiText
        })
        .setOrigin(0, 0.5);

      // LABEL (under node)
      const label = this.add
        .text(p.x, p.y + this.LABEL_OFFSET_Y, sys.name, {
          font: VisualStyle.smallFont,
          color: VisualStyle.uiText
        })
        .setOrigin(0.5, 0);

      this.systems.push({
        id: sys.id,
        x: p.x,
        y: p.y,
        marker,
        label,
        icon
      });
    }
  }

  private pickSystem(worldX: number, worldY: number): SysRender | null {
    let best: SysRender | null = null;
    let bestD = Infinity;

    for (const s of this.systems) {
      const dx = worldX - s.x;
      const dy = worldY - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < this.PICK_RADIUS && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  private selectNextPlayerFleet(): void {
    const s = getState();
    const fleets = Object.values(s.fleets)
      .filter(f => f.owner === 'PLAYER')
      .sort((a, b) => a.name.localeCompare(b.name));
    if (fleets.length === 0) return;

    const idx = s.selectedFleetId ? fleets.findIndex(f => f.id === s.selectedFleetId) : -1;
    const next = fleets[(idx + 1 + fleets.length) % fleets.length];
    selectFleet(next.id);
    this.refreshAll();
  }

  private selectPreviousPlayerFleet(): void {
    const s = getState();
    const fleets = Object.values(s.fleets)
      .filter(f => f.owner === 'PLAYER')
      .sort((a, b) => a.name.localeCompare(b.name));
    if (fleets.length === 0) return;

    const idx = s.selectedFleetId ? fleets.findIndex(f => f.id === s.selectedFleetId) : -1;
    const prev = fleets[(idx - 1 + fleets.length) % fleets.length];
    selectFleet(prev.id);
    this.refreshAll();
  }

  private openSystemView(): void {
    // Disable GalaxyScene input to prevent interference
    this.input.enabled = false;
    
    // Pause GalaxyScene and launch SystemScene
    this.scene.pause('GalaxyScene');
    this.scene.launch('SystemScene');
    
    // Listen for SystemScene shutdown to re-enable input
    this.events.on('wake', () => {
      this.input.enabled = true;
      console.log('GalaxyScene input re-enabled');
    });
    
    console.log('GalaxyScene input disabled, SystemScene launched');
  }

  // -----------------------------------------------------------------------------
  // Fleet Sprite Management
  // -----------------------------------------------------------------------------

  private refreshFleets(): void {
    const state = getState();
    
    // Store previous locations for animation detection
    const currentLocations: Record<string, string> = {};
    
    // Update or create fleet sprites
    for (const [fleetId, fleet] of Object.entries(state.fleets)) {
      currentLocations[fleetId] = fleet.location;
      
      const system = state.galaxy[fleet.location];
      if (!system) continue;
      
      const pos = this.hexToPixel(system.coord.q, system.coord.r);
      
      if (this.fleetSprites[fleetId]) {
        // Update existing sprite
        const sprite = this.fleetSprites[fleetId];
        sprite.setPosition(pos.x, pos.y);
        
        // Check if fleet moved and animate
        if (this.prevFleetLocations[fleetId] && this.prevFleetLocations[fleetId] !== fleet.location) {
          this.animateFleetToSystem(fleetId, this.prevFleetLocations[fleetId], fleet.location);
        }
      } else {
        // Create new sprite
        const sprite = createFleetIcon(
          this,
          pos.x,
          pos.y,
          fleet.owner,
          fleet.role,
          fleet.name
        );
        
        this.fleetSprites[fleetId] = sprite;
      }
    }
    
    // Remove sprites for fleets that no longer exist
    for (const fleetId of Object.keys(this.fleetSprites)) {
      if (!state.fleets[fleetId]) {
        this.fleetSprites[fleetId].destroy();
        delete this.fleetSprites[fleetId];
        delete this.prevFleetLocations[fleetId];
      }
    }
    
    // Update previous locations
    this.prevFleetLocations = currentLocations;
  }

  private animateFleetToSystem(fleetId: string, fromSystemId: string, toSystemId: string): void {
    const sprite = this.fleetSprites[fleetId];
    if (!sprite) return;
    
    const state = getState();
    const fromSystem = state.galaxy[fromSystemId];
    const toSystem = state.galaxy[toSystemId];
    
    if (!fromSystem || !toSystem) return;
    
    const fromPos = this.hexToPixel(fromSystem.coord.q, fromSystem.coord.r);
    const toPos = this.hexToPixel(toSystem.coord.q, toSystem.coord.r);
    
    // Animate movement
    this.tweens.add({
      targets: sprite,
      x: toPos.x,
      y: toPos.y,
      duration: 300,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        // Ensure sprite ends at exact position
        sprite.setPosition(toPos.x, toPos.y);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Hex geometry
  // ---------------------------------------------------------------------------

  private hexToPixel(q: number, r: number): { x: number; y: number } {
    // pointy-top axial to pixel
    const size = this.HEX_SIZE;
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = size * ((3 / 2) * r);
    return { x, y };
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
}
