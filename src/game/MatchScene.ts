import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { MAP_CONFIG } from '../config/map';
import { PERSISTENCE_CONFIG } from '../config/persistence';
import { RENDER_CONFIG } from '../config/render';
import { createMapGrid, type MapGrid } from '../core/map';
import type { TileCoord, Vec2 } from '../core/geometry';
import type { BuildingTypeId, EntityId, PlayerId, UnitTypeId } from '../core/ids';
import { issueAttackOrders, stepAttackOrders, type AttackHitEvent } from '../core/attack';
import { issueAttackMoveOrders, stepAttackMoveOrders } from '../core/attackMove';
import { createAutoTargetingState, issueRetaliationOrders, stepAutomaticTargeting } from '../core/autoCombat';
import { startConstruction, stepConstruction } from '../core/construction';
import { stepAttackCooldowns } from '../core/combat';
import { createEconomy, type Economy } from '../core/economy';
import { fogTargetPredicate, isEntityVisibleToPlayer, createFogState, stepFogVisibility, updateFogVisibility, type FogState } from '../core/fog';
import type { ReadonlyEntity, ReadonlyUnit } from '../core/entities';
import { issueGroupMoveOrders } from '../core/formation';
import { issueGatherOrder, stepGather } from '../core/gather';
import { stepMovement } from '../core/movement';
import { cancelProduction, queueProduction, stepProduction } from '../core/production';
import { populateStartingEntities } from '../core/matchSetup';
import { createResourceFieldState, type ResourceFieldState } from '../core/resourceFieldState';
import { pruneSelection } from '../core/selection';
import { restoreWorld, serializeWorld, type WorldSnapshot } from '../core/snapshot';
import { stepSeparation } from '../core/separation';
import { createWorld, type World } from '../core/world';
import { executeAiMilitaryDecisions, type AiMilitaryReadout } from '../core/aiMilitary';
import { createAiState, observeAiStrategy, stepAi, type AiState } from '../core/ai';
import { executeAiDefenseDecisions } from '../core/aiDefense';
import { executeAiEconomyDecisions } from '../core/aiEconomy';
import { BuildMenu } from '../ui/buildMenu';
import { ControlsOverlay } from '../ui/controlsOverlay';
import { PauseMenu } from '../ui/pauseMenu';
import { SelectionPanel } from '../ui/selectionPanel';
import { ProductionMenu } from '../ui/productionMenu';
import { TacticalHud } from '../ui/tacticalHud';
import { TitleBanner } from '../ui/titleBanner';
import { CameraController } from './CameraController';
import { AiDebugReadout } from './AiDebugReadout';
import { CombatEffectsView } from './CombatEffectsView';
import { deathEffectAt, mapAttackHitToCombatEffect } from './combatEffectEvents';
import { DebugLabelsView } from './DebugLabelsView';
import { EntitiesView } from './EntitiesView';
import { FogView } from './FogView';
import { clearSnapshot, loadSnapshot, saveSnapshot } from './matchPersistence';
import { MapView } from './MapView';
import { OrderMarkerView } from './OrderMarkerView';
import { PlacementController } from './PlacementController';
import { RouteDebugView } from './RouteDebugView';
import { SelectionController } from './SelectionController';
import { SelectionMarker } from './SelectionMarker';
import { SlotMarkerView } from './SlotMarkerView';
import { createMaterialLibrary, type MaterialLibrary } from './materials';
import { createModelLibrary, type ModelLibrary } from './models/library';
import { color3, FIELD_TONES } from './palette';
import { createSceneSpace, type SceneSpace } from './sceneSpace';
import { GAME_TITLE } from './title';

/**
 * The single gameplay scene. It builds the map grid and the world from typed config, renders both in
 * three dimensions, and lets the player look around and select what they own. Selection, movement,
 * economy, production and combat orders are backed by pure `core/` systems.
 *
 * The scene owns the world but never edits entity state directly: the rules live in `core/`. Nothing
 * in this file — or in any other view — decides damage, cost or prerequisites.
 */

/** The side the human plays. The AI takes the other start. */
const PLAYER_ID: PlayerId = 'player';

/** How far the opening view slides from the player's HQ towards its nearest resource field. */
const OPENING_FIELD_BIAS = 0.55;

/** Toggles the entity debug labels. */
const DEBUG_LABEL_KEY = 'Backquote';

/**
 * The sun. It comes from behind the player's left shoulder so that models are lit on the faces the
 * camera sees and their shadows fall away from the viewer, which is what keeps silhouettes readable.
 */
const SUN_DIRECTION = new Vector3(0.45, -1, 0.35);
const SUN_INTENSITY = 1.25;
/** Fills the shadowed faces so nothing on the field goes black. */
const AMBIENT_INTENSITY = 0.8;
/** How far the sun stands off the field, in tiles, so nothing on it falls outside the shadow map. */
const SUN_DISTANCE_TILES = 90;
/** Half-width of the shadow camera, as a share of the map: enough to cover it corner to corner. */
const SHADOW_SPAN_SHARE = 0.9;

export class MatchScene {
  private readonly scene: Scene;
  private readonly grid: MapGrid;
  private readonly world: World;
  private readonly economy: Economy;
  private readonly resourceFieldState: ResourceFieldState;
  private readonly fog: FogState;
  private readonly ai: AiState;
  private readonly space: SceneSpace;
  private readonly materials: MaterialLibrary;
  private readonly models: ModelLibrary;
  private readonly mapView: MapView;
  private readonly fogView: FogView;
  private readonly entitiesView: EntitiesView;
  private readonly combatEffects: CombatEffectsView;
  private readonly selectionMarker: SelectionMarker;
  private readonly orderMarker: OrderMarkerView;
  private readonly slotMarker: SlotMarkerView;
  private readonly routeDebug: RouteDebugView;
  private readonly selection: SelectionController;
  private readonly cameraController: CameraController;
  private readonly camera: TargetCamera;
  private readonly shadows: ShadowGenerator;
  private readonly debugLabels: DebugLabelsView;
  private readonly defenseRecoveryReadout = { latestAction: '—' };
  private readonly militaryReadout: AiMilitaryReadout = { latestAction: '—' };
  private readonly aiDebug: AiDebugReadout | null;
  private readonly hud: TacticalHud;
  private readonly titleBanner: TitleBanner;
  private readonly controlsOverlay: ControlsOverlay;
  private readonly selectionPanel: SelectionPanel;
  private readonly buildMenu: BuildMenu;
  private readonly productionMenu: ProductionMenu;
  private readonly placement: PlacementController;
  private readonly pauseMenu: PauseMenu;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onPageHide: () => void;
  private readonly autoTargeting = createAutoTargetingState();
  private readonly isVisibleToHuman = (entity: ReadonlyEntity): boolean =>
    isEntityVisibleToPlayer(this.fog, PLAYER_ID, entity);
  private readonly canTarget = (observer: ReadonlyUnit, candidate: ReadonlyEntity): boolean =>
    fogTargetPredicate(this.fog)(observer, candidate);
  private hudElapsedSeconds = Number.POSITIVE_INFINITY;
  private saveElapsedSeconds = 0;
  private paused = false;

  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    /** The HTML layer above the canvas, where the title, controls card and readouts live. */
    overlayContainer: HTMLElement,
    private readonly onNewMatch: () => void,
    private readonly onReturnToTitle: () => void,
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromColor3(color3(FIELD_TONES.sky), 1);

    this.grid = createMapGrid(MAP_CONFIG);
    this.space = createSceneSpace(this.grid);

    // Resume an unfinished match saved on this device when one exists and is readable; otherwise
    // open the same opening position every fresh match always has.
    const restored = MatchScene.tryRestore(loadSnapshot(), this.grid);
    if (restored !== null) {
      this.world = restored.world;
      this.economy = restored.economy;
      this.resourceFieldState = restored.resourceFieldState;
      this.fog = restored.fog;
      this.ai = restored.ai;
    } else {
      clearSnapshot();
      this.world = createWorld({ tileSizePixels: this.grid.tileSizePixels });
      populateStartingEntities(this.world, this.grid);
      this.economy = createEconomy();
      this.resourceFieldState = createResourceFieldState(this.grid);
      this.fog = createFogState(this.grid);
      this.ai = createAiState();
      // Fresh matches have authoritative opening vision before the first rendered frame.
      updateFogVisibility(this.fog, this.world, this.grid);
    }

    this.camera = new TargetCamera('camera', Vector3.Zero(), this.scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;
    this.scene.activeCamera = this.camera;

    this.shadows = this.createLighting();

    this.materials = createMaterialLibrary(this.scene);
    this.models = createModelLibrary(this.scene, this.materials);
    this.mapView = new MapView(this.scene, this.grid, this.space, this.materials);
    this.fogView = new FogView(this.scene, this.grid, this.space);
    this.fogView.update(this.fog, PLAYER_ID);
    this.mapView.updateFog(this.fog, PLAYER_ID);
    for (const mesh of this.mapView.shadowCasters()) {
      this.shadows.addShadowCaster(mesh);
    }

    this.entitiesView = new EntitiesView(
      this.scene,
      this.space,
      this.models,
      this.materials,
      (mesh: Mesh) => this.shadows.addShadowCaster(mesh),
    );
    this.entitiesView.sync(this.world, [], 0, this.isVisibleToHuman);
    this.combatEffects = new CombatEffectsView(this.scene, this.space, this.materials);

    this.selectionMarker = new SelectionMarker(this.scene, this.materials, this.space);
    this.orderMarker = new OrderMarkerView(this.scene, this.materials, this.space);
    this.slotMarker = new SlotMarkerView(this.scene, this.materials, this.space);
    this.routeDebug = new RouteDebugView(this.scene, this.space);
    this.selection = new SelectionController(
      this.scene,
      this.camera,
      canvas,
      this.space,
      this.world,
      PLAYER_ID,
      this.isVisibleToHuman,
      (mesh) => this.entitiesView.entityIdOfMesh(mesh),
      () => this.showSelection(),
      (ids, target) => {
        this.issueRightClickOrders(ids, target);
        this.showSelection();
      },
      (ids, targetId) => {
        const target = this.world.get(targetId);
        if (target !== undefined && this.isVisibleToHuman(target)) {
          issueAttackOrders(this.world, PLAYER_ID, ids, targetId, this.canTarget);
        }
        this.showSelection();
      },
      (ids, target) => {
        issueAttackMoveOrders(this.world, this.grid, PLAYER_ID, ids, target);
        this.showSelection();
      },
    );

    this.cameraController = new CameraController(
      this.camera,
      canvas,
      this.grid.bounds,
      this.space,
      this.openingFocus(),
    );

    // The title, the controls card and the selection readout sit in the HTML layer above the canvas,
    // so no camera movement can scale them and they stay crisp at any zoom.
    this.hud = new TacticalHud(overlayContainer);
    this.titleBanner = new TitleBanner(overlayContainer, GAME_TITLE);
    this.controlsOverlay = new ControlsOverlay(overlayContainer);
    this.selectionPanel = new SelectionPanel(overlayContainer);
    this.buildMenu = new BuildMenu(overlayContainer, (buildingType) => {
      const workerId = this.selectedWorkerId();
      if (workerId !== null) {
        this.placement.start(buildingType, workerId);
      }
    });
    this.productionMenu = new ProductionMenu(
      overlayContainer,
      (unitType) => this.queueSelectedProduction(unitType),
      (queueIndex) => this.cancelSelectedProduction(queueIndex),
    );
    this.placement = new PlacementController(
      this.scene,
      this.camera,
      canvas,
      this.space,
      this.grid,
      this.world,
      this.materials,
      (buildingType, topLeft, workerId) => this.confirmPlacement(buildingType, topLeft, workerId),
    );
    this.pauseMenu = new PauseMenu(
      overlayContainer,
      () => this.setPaused(false),
      this.onNewMatch,
      () => {
        this.saveNow();
        this.onReturnToTitle();
      },
    );
    this.debugLabels = new DebugLabelsView(overlayContainer, this.scene, canvas, this.space);
    this.aiDebug = import.meta.env.DEV ? new AiDebugReadout(overlayContainer) : null;
    this.aiDebug?.update(this.ai, this.world, this.militaryReadout, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout.latestAction);

    this.onKeyDown = (event) => {
      if (event.code === 'Escape') {
        if (this.selection.isAttackMoveArmed()) {
          this.selection.setAttackMoveArmed(false);
        } else if (this.placement.isActive()) {
          this.placement.cancel();
        } else {
          this.setPaused(!this.paused);
        }
        event.preventDefault();
      } else if (!this.paused && !this.placement.isActive() && event.code === 'KeyA') {
        this.selection.setAttackMoveArmed(true);
        event.preventDefault();
      } else if (!this.paused && event.code === DEBUG_LABEL_KEY) {
        this.debugLabels.setEnabled(!this.debugLabels.isEnabled());
        this.routeDebug.setEnabled(this.debugLabels.isEnabled());
      }
    };
    // Capture A before the camera's WASD listener so it becomes a one-click command, not a left pan.
    window.addEventListener('keydown', this.onKeyDown, true);

    // The very latest state right before a reload or tab close should not be lost waiting for the
    // next periodic autosave tick.
    this.onPageHide = () => this.saveNow();
    window.addEventListener('pagehide', this.onPageHide);

    const restoredSelection =
      restored === null ? [] : pruneSelection(this.world, restored.selection, PLAYER_ID);
    if (restoredSelection.length > 0) {
      this.selection.restoreSelection(restoredSelection);
    } else {
      this.selection.select(this.world.buildings(PLAYER_ID)[0]?.id ?? null);
    }
    this.showSelection();
  }

  /**
   * Loads and restores a saved snapshot in one guarded step. Returns `null` for every reason a
   * fresh match should start instead: nothing was saved, the saved shape failed even the cheap
   * check `loadSnapshot` applies, or reconstructing the world from it threw on bad per-entity data.
   */
  private static tryRestore(
    snapshot: WorldSnapshot | null,
    grid: MapGrid,
  ): {
    world: World;
    selection: readonly EntityId[];
    economy: Economy;
    resourceFieldState: ResourceFieldState;
    fog: FogState;
    ai: AiState;
  } | null {
    if (snapshot === null) {
      return null;
    }
    try {
      return restoreWorld(snapshot, grid);
    } catch (error) {
      console.warn('Mini Command: discarding an unreadable local match snapshot.', error);
      return null;
    }
  }

  /** Advances and draws one budgeted frame. Called by the capped engine render loop. */
  public render(deltaSeconds: number): void {
    if (this.paused) {
      this.scene.render();
      return;
    }
    this.cameraController.update(deltaSeconds);
    stepMovement(this.world, deltaSeconds);
    stepGather(this.world, this.grid, this.resourceFieldState, this.economy, deltaSeconds);
    stepConstruction(this.world, deltaSeconds);
    stepProduction(this.world, this.grid, deltaSeconds);
    stepAttackCooldowns(this.world, deltaSeconds);
    if (stepFogVisibility(this.fog, this.world, this.grid, deltaSeconds)) {
      this.fogView.update(this.fog, PLAYER_ID);
      this.mapView.updateFog(this.fog, PLAYER_ID);
    }
    const aiStep = stepAi(this.ai, observeAiStrategy(this.ai, this.world, this.grid, this.fog), deltaSeconds);
    executeAiEconomyDecisions(this.ai, aiStep, {
      world: this.world, grid: this.grid, economy: this.economy, resourceFieldState: this.resourceFieldState,
    }, this.defenseRecoveryReadout);
    executeAiMilitaryDecisions(this.ai, aiStep, {
      world: this.world, grid: this.grid, economy: this.economy,
    }, this.militaryReadout);
    executeAiDefenseDecisions(this.ai, aiStep, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout);
    stepAutomaticTargeting(this.world, this.autoTargeting, deltaSeconds, undefined, this.canTarget);
    const hits = [
      ...stepAttackOrders(this.world, this.grid, deltaSeconds, this.canTarget),
      ...stepAttackMoveOrders(this.world, this.grid, deltaSeconds, this.canTarget),
    ];
    issueRetaliationOrders(this.world, hits, this.canTarget);
    this.showAttackFeedback(hits);
    this.combatEffects.update(deltaSeconds);
    for (const field of this.grid.resourceFields) {
      this.mapView.setFieldFraction(field.id, this.resourceFieldState.remaining(field.id) / field.credits);
    }
    stepSeparation(this.world, this.grid, deltaSeconds);
    // The selected entity keeps moving and taking damage, so the markers and the readout follow it.
    this.selection.refresh();
    this.entitiesView.sync(this.world, this.selection.selectedIds(), deltaSeconds, this.isVisibleToHuman);
    this.showSelection();
    this.placement.update();
    this.debugLabels.update(this.world, (id) => this.entitiesView.modelHeightOf(id), this.isVisibleToHuman);

    this.hudElapsedSeconds += deltaSeconds;
    if (this.hudElapsedSeconds >= RENDER_CONFIG.hudUpdateIntervalSeconds) {
      this.hud.update(
        this.world,
        this.grid,
        this.cameraController.visibleBounds(),
        this.economy,
        this.fog,
        PLAYER_ID,
      );
      this.aiDebug?.update(this.ai, this.world, this.militaryReadout, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout.latestAction);
      this.hudElapsedSeconds = 0;
    }

    this.saveElapsedSeconds += deltaSeconds;
    if (this.saveElapsedSeconds >= PERSISTENCE_CONFIG.saveIntervalSeconds) {
      this.saveNow();
    }
    this.scene.render();
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('pagehide', this.onPageHide);
    this.cameraController.dispose();
    this.selection.dispose();
    this.selectionMarker.dispose();
    this.orderMarker.dispose();
    this.slotMarker.dispose();
    this.routeDebug.dispose();
    this.combatEffects.dispose();
    this.entitiesView.dispose();
    this.fogView.dispose();
    this.mapView.dispose();
    this.models.dispose();
    this.materials.dispose();
    this.debugLabels.dispose();
    this.aiDebug?.dispose();
    this.hud.destroy();
    this.titleBanner.destroy();
    this.controlsOverlay.destroy();
    this.selectionPanel.destroy();
    this.buildMenu.destroy();
    this.productionMenu.destroy();
    this.placement.dispose();
    this.pauseMenu.destroy();
    this.scene.dispose();
  }

  /** Freezes simulation and all map input while the pause menu owns the screen. */
  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      // A placement preview is intentionally not resumable through a pause; this prevents a stale
      // click behind the overlay from confirming an old footprint.
      this.placement.cancel();
      this.saveNow();
    }
    this.cameraController.setEnabled(!paused);
    this.selection.setEnabled(!paused);
    this.placement.setEnabled(!paused);
    this.pauseMenu.setVisible(paused);
  }

  /** Saves the current world and selection to local storage now, and resets the autosave timer. */
  private saveNow(): void {
    saveSnapshot(
      serializeWorld(
        this.world,
        this.selection.selectedIds(),
        this.economy,
        this.resourceFieldState,
        this.fog,
        this.grid,
        this.ai,
      ),
    );
    this.saveElapsedSeconds = 0;
  }

  /** One directional sun with soft shadows, plus a sky fill. Restrained on purpose. */
  private createLighting(): ShadowGenerator {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = AMBIENT_INTENSITY;
    ambient.diffuse = color3(0xc5d8ed);
    ambient.groundColor = color3(0x727c79);
    ambient.specular = Color3.Black();

    const sun = new DirectionalLight('sun', SUN_DIRECTION, this.scene);
    sun.intensity = SUN_INTENSITY;
    sun.diffuse = color3(0xffe3bc);
    sun.specular = Color3.Black();
    // Stood off the middle of the field, far enough back that the shadow camera looks at the whole
    // map. Babylon fits the shadow frustum around the casters each frame, so the sun only has to be
    // outside everything it lights.
    sun.position = SUN_DIRECTION.scale(-SUN_DISTANCE_TILES).add(
      new Vector3(this.space.widthUnits / 2, 0, this.space.depthUnits / 2),
    );

    // The shadow camera is pinned over the whole battlefield rather than fitted to the casters:
    // ground that falls outside it is not shaded correctly, which shows up as the map being a
    // different tone from the apron around it.
    sun.autoUpdateExtends = false;
    const span = Math.max(this.space.widthUnits, this.space.depthUnits) * SHADOW_SPAN_SHARE;
    sun.orthoLeft = -span;
    sun.orthoRight = span;
    sun.orthoBottom = -span;
    sun.orthoTop = span;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = SUN_DISTANCE_TILES * 2.5;

    const shadows = new ShadowGenerator(RENDER_CONFIG.shadowMapSize, sun);
    // Percentage-closer filtering rather than an exponential map: it softens the edge without
    // bleeding light or darkening ground that happens to fall outside the shadow camera.
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.darkness = 0.4;
    return shadows;
  }

  /** Points the marker and the readout at whatever is selected right now. */
  private showSelection(): void {
    const entities = this.selection.selectedIds()
      .flatMap((id) => { const entity = this.world.get(id); return entity === undefined ? [] : [entity]; });
    this.selectionMarker.update(entities);
    this.orderMarker.update(entities, (targetId) => {
      const target = this.world.get(targetId);
      return target !== undefined && this.isVisibleToHuman(target) ? target.position : null;
    });
    this.slotMarker.update(entities);
    this.routeDebug.update(entities);
    this.selectionPanel.update(entities);
    this.buildMenu.update(entities, this.world, this.economy);
    this.productionMenu.update(entities, this.world, this.economy, PLAYER_ID);
  }

  /** Maps only confirmed core hits into renderer-safe cues, then removes a confirmed dead entity once. */
  private showAttackFeedback(events: readonly AttackHitEvent[]): void {
    for (const event of events) {
      const attacker = this.world.get(event.attackerId);
      const target = this.world.get(event.targetId);
      const effect = mapAttackHitToCombatEffect(event, attacker, target);
      if (effect === null || target === undefined) continue;
      this.combatEffects.play(effect);
      if (event.destroyed) {
        const death = deathEffectAt(effect.to, effect.targetToken);
        if (death !== null) this.combatEffects.play(death);
        this.world.remove(target.id);
      }
    }
  }

  /** The single selected friendly Worker's id, or `null` when the selection is not exactly that. */
  private selectedWorkerId(): EntityId | null {
    const ids = this.selection.selectedIds();
    if (ids.length !== 1) {
      return null;
    }
    const unit = this.world.unit(ids[0] as EntityId);
    return unit !== undefined && unit.owner === PLAYER_ID && unit.type === 'worker' ? unit.id : null;
  }

  /** Queues at the one selected friendly production building; the menu presents any failure. */
  private queueSelectedProduction(unitType: UnitTypeId) {
    const building = this.selectedProductionBuilding();
    return building === null
      ? { allowed: false as const, reason: 'invalid-building' as const }
      : queueProduction(this.world, this.economy, PLAYER_ID, building.id, unitType);
  }

  private cancelSelectedProduction(queueIndex: number) {
    const building = this.selectedProductionBuilding();
    return building === null
      ? { cancelled: false as const, reason: 'invalid-building' as const }
      : cancelProduction(this.world, this.economy, building.id, queueIndex);
  }

  private selectedProductionBuilding() {
    const ids = this.selection.selectedIds();
    if (ids.length !== 1) return null;
    const building = this.world.building(ids[0] as EntityId);
    return building !== undefined && building.owner === PLAYER_ID ? building : null;
  }

  /** Spends Credits and raises a construction site once a placement preview is confirmed. */
  private confirmPlacement(buildingType: BuildingTypeId, topLeft: TileCoord, workerId: EntityId): void {
    const worker = this.world.unit(workerId);
    if (worker === undefined) {
      return;
    }
    startConstruction(this.world, this.grid, this.economy, PLAYER_ID, worker.faction, buildingType, topLeft, workerId);
    this.showSelection();
  }

  /**
   * A right-click on a resource field sends every selected Worker to gather it instead of merely
   * walking there; any other selected units in the same click still receive a normal group Move.
   */
  private issueRightClickOrders(ids: readonly EntityId[], target: Vec2): void {
    const targetTile = this.grid.worldToTile(target);
    const field = this.grid.resourceFields.find((candidate) =>
      candidate.tiles.some((tile) => tile.tx === targetTile.tx && tile.ty === targetTile.ty),
    );

    if (field === undefined) {
      issueGroupMoveOrders(this.world, this.grid, PLAYER_ID, ids, target);
      return;
    }

    const workers: EntityId[] = [];
    const others: EntityId[] = [];
    for (const id of ids) {
      const unit = this.world.unit(id);
      (unit?.type === 'worker' ? workers : others).push(id);
    }
    for (const workerId of workers) {
      issueGatherOrder(this.world, this.grid, this.economy, PLAYER_ID, workerId, field.id);
    }
    if (others.length > 0) {
      issueGroupMoveOrders(this.world, this.grid, PLAYER_ID, others, target);
    }
  }

  /**
   * Where the match opens: between the player's HQ and the resource field it will work first, so the
   * base, its opening squad and the Credits are all on screen from the first frame. Falls back to
   * the HQ alone, then to the map centre, if a map ever ships without one of them.
   */
  private openingFocus(): Vec2 | null {
    const hq = this.world.buildings(PLAYER_ID).find((building) => building.type === 'hq');
    if (hq === undefined) {
      return null;
    }

    const field = this.nearestFieldCenter(hq.position);
    if (field === null) {
      return hq.position;
    }
    // Biased towards the base, which is what the player needs to read first.
    return {
      x: hq.position.x + (field.x - hq.position.x) * OPENING_FIELD_BIAS,
      y: hq.position.y + (field.y - hq.position.y) * OPENING_FIELD_BIAS,
    };
  }

  /** World centre of the resource field closest to `from`, or `null` when the map has none. */
  private nearestFieldCenter(from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const field of this.grid.resourceFields) {
      const center = this.grid.tileCenter(field.center.tx, field.center.ty);
      const distance = Math.hypot(center.x - from.x, center.y - from.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = center;
      }
    }
    return best;
  }
}
