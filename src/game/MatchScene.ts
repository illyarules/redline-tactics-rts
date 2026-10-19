import type { Engine } from '@babylonjs/core/Engines/engine';
import type { MapConfig } from '../config/types';
import { PERSISTENCE_CONFIG } from '../config/persistence';
import { ECONOMY_CONFIG } from '../config/economy';
import { PRODUCTION_CONFIG } from '../config/production';
import { BUILDING_CONFIG } from '../config/buildings';
import { ENTRENCHMENT_CONFIG } from '../config/entrenchment';
import { RENDER_CONFIG } from '../config/render';
import { createMapGrid, type MapGrid } from '../core/map';
import type { TileCoord, Vec2 } from '../core/geometry';
import type { AiPlayerId, BuildingTypeId, EntityId, PlayerId, UnitTypeId } from '../core/ids';
import { issueAttackOrders, stepAttackOrders, type AttackHitEvent } from '../core/attack';
import { issueAttackMoveOrders, stepAttackMoveOrders } from '../core/attackMove';
import { createAutoTargetingState, issueRetaliationOrders, stepAutomaticTargeting } from '../core/autoCombat';
import { resumeConstruction, startConstruction, stepConstruction } from '../core/construction';
import { stepAttackCooldowns } from '../core/combat';
import { stepEntrenchment, toggleEntrenchment } from '../core/entrenchment';
import { createEconomy, type Economy } from '../core/economy';
import { fogTargetPredicate, isEntityVisibleToPlayer, createFogState, stepFogVisibility, updateFogVisibility, type FogState } from '../core/fog';
import type { ReadonlyBuilding, ReadonlyEntity, ReadonlyUnit } from '../core/entities';
import { issueGroupMoveOrders } from '../core/formation';
import { issueGatherOrder, stepGather } from '../core/gather';
import { stepMovement } from '../core/movement';
import { cancelProduction, checkProductionRequest, queueProduction, stepProduction } from '../core/production';
import { checkBuildingPlacement } from '../core/placement';
import { populateStartingEntities } from '../core/matchSetup';
import { inspectResourceField } from '../core/resourceFieldInspection';
import { createResourceFieldState, type ResourceFieldState } from '../core/resourceFieldState';
import { pruneSelection } from '../core/selection';
import { restoreWorld, serializeWorld, type WorldSnapshot } from '../core/snapshot';
import { stepSeparation } from '../core/separation';
import { createWorld, type World } from '../core/world';
import { executeAiMilitaryDecisions, type AiMilitaryReadout } from '../core/aiMilitary';
import { createAiState, observeAiStrategy, stepAi, type AiState } from '../core/ai';
import { executeAiDefenseDecisions } from '../core/aiDefense';
import { executeAiEconomyDecisions } from '../core/aiEconomy';
import { ConfirmDialog } from '../ui/confirmDialog';
import { PauseMenu } from '../ui/pauseMenu';
import { MatchResultOverlay } from '../ui/matchResultOverlay';
import type { AudioManager } from '../audio/AudioManager';
import { BattleHud, type BattleHudAction, type BattleHudViewModel } from '../ui/BattleHud';
import { BUILDING_THUMBNAILS } from '../ui/buildingThumbnails';
import { AiDebugReadout } from './AiDebugReadout';
import { deathEffectAt, mapAttackHitToCombatEffect, vehicleDeathDescriptor } from './combatEffectEvents';
import { DebugLabelsView } from './DebugLabelsView';
import { clearSnapshot, saveSnapshot } from './matchPersistence';
import { PlacementController } from './PlacementController';
import { RouteDebugView } from './RouteDebugView';
import { SelectionController } from './SelectionController';
import { BattlePresentation } from './BattlePresentation';
import { localBattleViewState } from './battleViewState';
import { GAME_TITLE } from './title';
import {
  createMatchLifecycle,
  countAliveBuildings,
  recordCombatDestructions,
  recordProducedUnits,
  resolveMatchOutcome,
  stepMatchElapsedTime,
  formatMatchCountdown,
  type CombatDestructionEvent,
  type MatchLifecycleState,
} from '../core/matchLifecycle';
import { areHostile } from '../core/teams';
import { cellVisibility } from '../core/fog';
import { checkPrerequisites, isCompleted } from '../core/prerequisites';
import { isPowerAvailable } from '../core/power';
import { resolveUnitStats } from '../core/factionStats';

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

export class MatchScene {
  private readonly presentation: BattlePresentation;
  private readonly grid: MapGrid;
  private readonly world: World;
  private readonly economy: Economy;
  private readonly resourceFieldState: ResourceFieldState;
  private readonly fog: FogState;
  private readonly aiPlayers: readonly AiPlayerId[];
  private readonly ais: ReadonlyMap<AiPlayerId, AiState>;
  private readonly lifecycle: MatchLifecycleState;
  private readonly routeDebug: RouteDebugView;
  private readonly selection: SelectionController;
  private readonly debugLabels: DebugLabelsView;
  private readonly defenseRecoveryReadout = { latestAction: '—' };
  private readonly militaryReadout: AiMilitaryReadout = { latestAction: '—' };
  private readonly aiDebug: AiDebugReadout | null;
  private readonly hud: BattleHud;
  private readonly placement: PlacementController;
  private readonly pauseMenu: PauseMenu;
  private readonly quitConfirm: ConfirmDialog;
  private readonly resultOverlay: MatchResultOverlay;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onPageHide: () => void;
  private readonly autoTargeting = createAutoTargetingState();
  private readonly isVisibleToHuman = (entity: ReadonlyEntity): boolean =>
    isEntityVisibleToPlayer(this.fog, PLAYER_ID, entity);
  /** Observer-mode visibility affects drawing only; every command still uses real fog. */
  private readonly isVisibleToObserver = (entity: ReadonlyEntity): boolean =>
    this.debugNoFog || this.isVisibleToHuman(entity);
  private readonly canTarget = (observer: ReadonlyUnit, candidate: ReadonlyEntity): boolean =>
    areHostile(observer.owner, candidate.owner) && fogTargetPredicate(this.fog)(observer, candidate);
  private hudElapsedSeconds = Number.POSITIVE_INFINITY;
  private saveElapsedSeconds = 0;
  private paused = false;
  private terminalSnapshotSaved = false;
  private selectedFieldId: string | null = null;
  private productionMessage = '';
  private productionBuildingId: EntityId | null = null;

  // eslint-disable-next-line complexity -- Construction wires independent scene systems and guarded restore state.
  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    /** The HTML layer above the canvas, where the title, controls card and readouts live. */
    overlayContainer: HTMLElement,
    private readonly onNewMatch: () => void,
    private readonly onReturnToTitle: () => void,
    audio: AudioManager,
    mapConfig: MapConfig,
    snapshot: WorldSnapshot | null,
    private readonly debugNoFog = false,
  ) {
    this.grid = createMapGrid(mapConfig);
    this.aiPlayers = this.grid.starts
      .map((start) => start.player)
      .filter((player): player is AiPlayerId => player !== PLAYER_ID);

    // Resume an unfinished match saved on this device when one exists and is readable; otherwise
    // open the same opening position every fresh match always has.
    const restored = MatchScene.tryRestore(snapshot, this.grid);
    if (restored !== null) {
      this.world = restored.world;
      this.economy = restored.economy;
      this.resourceFieldState = restored.resourceFieldState;
      this.fog = restored.fog;
      const states = new Map<AiPlayerId, AiState>();
      states.set('ai', restored.ai);
      if (restored.secondaryAi !== null) states.set('ai2', restored.secondaryAi);
      this.ais = states;
      this.lifecycle = restored.lifecycle;
      this.terminalSnapshotSaved = this.lifecycle.result !== null;
    } else {
      clearSnapshot();
      this.world = createWorld({ tileSizePixels: this.grid.tileSizePixels });
      populateStartingEntities(this.world, this.grid);
      this.economy = createEconomy(undefined, undefined, this.grid.starts.map((start) => start.player));
      this.resourceFieldState = createResourceFieldState(this.grid);
      this.fog = createFogState(this.grid, this.grid.starts.map((start) => start.player));
      this.ais = new Map(this.aiPlayers.map((owner) => [owner, createAiState()]));
      this.lifecycle = createMatchLifecycle();
      // Fresh matches have authoritative opening vision before the first rendered frame.
      updateFogVisibility(this.fog, this.world, this.grid);
    }

    this.presentation = new BattlePresentation(
      engine,
      canvas,
      this.grid,
      this.openingFocus(),
      this.debugNoFog,
    );
    this.presentation.sync(this.battleViewState([]));
    this.presentation.updateFog(this.fog, PLAYER_ID);
    this.routeDebug = new RouteDebugView(this.presentation.scene, this.presentation.space);
    this.selection = new SelectionController(
      this.presentation.scene,
      this.presentation.camera,
      canvas,
      this.presentation.space,
      {
        viewer: () => PLAYER_ID,
        get: (id) => this.world.get(id),
        entities: () => this.world.entities(),
        isAttackable: (entity) => areHostile(entity.owner, PLAYER_ID) && this.isVisibleToHuman(entity),
        visibleFieldAt: (point) => inspectResourceField(this.grid, this.fog, PLAYER_ID, point)?.id ?? null,
      },
      (mesh) => this.presentation.entityIdOfMesh(mesh),
      () => this.showSelection(),
      (ids, target) => {
        this.issueRightClickOrders(ids, target);
        this.showSelection();
      },
      (ids, targetId) => {
        this.resumeConstruction(ids, targetId);
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
      (fieldId) => {
        this.selectedFieldId = fieldId;
        this.showSelection();
      },
    );

    this.hud = new BattleHud(overlayContainer, {
      topActions: [],
      onMinimapNavigate: ({ x, y }) => this.presentation.cameraController.focus({
        x: x * this.grid.bounds.width,
        y: y * this.grid.bounds.height,
      }),
    });
    this.placement = new PlacementController(
      this.presentation.scene,
      this.presentation.camera,
      canvas,
      this.presentation.space,
      this.grid,
      this.presentation.materials,
      (buildingType, topLeft) => checkBuildingPlacement(this.world, this.grid, buildingType, topLeft).valid,
      (buildingType, topLeft, workerId) => this.confirmPlacement(buildingType, topLeft, workerId),
    );
    this.pauseMenu = new PauseMenu(
      overlayContainer,
      () => this.setPaused(false),
      this.onNewMatch,
      () => this.openQuitConfirm(),
      audio,
    );
    this.quitConfirm = new ConfirmDialog(
      overlayContainer,
      'quit-confirm',
      'Quit to Main Menu?',
      'Leaving now closes this match. Save your progress before you go, or quit without saving to discard it.',
      [
        { label: 'Save and Quit', testId: 'quit-confirm-save', primary: true, onClick: () => this.confirmQuit(true) },
        { label: 'Quit Without Saving', testId: 'quit-confirm-discard', onClick: () => this.confirmQuit(false) },
        { label: 'Cancel', testId: 'quit-confirm-cancel', onClick: () => this.cancelQuit() },
      ],
    );
    this.resultOverlay = new MatchResultOverlay(
      overlayContainer,
      this.onNewMatch,
      () => {
        clearSnapshot();
        this.onReturnToTitle();
      },
    );
    this.debugLabels = new DebugLabelsView(
      overlayContainer,
      this.presentation.scene,
      canvas,
      this.presentation.space,
    );
    this.aiDebug = import.meta.env.DEV ? new AiDebugReadout(overlayContainer) : null;
    const primaryAi = this.ais.get('ai');
    if (primaryAi !== undefined) this.aiDebug?.update(primaryAi, this.world, this.economy, this.militaryReadout, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout.latestAction);

    // eslint-disable-next-line complexity -- Keyboard shortcuts have intentionally ordered modal and match-state handling.
    this.onKeyDown = (event) => {
      if (this.lifecycle.result !== null) return;
      if (event.code === 'Escape') {
        if (this.pauseMenu.handleEscape()) {
          // Settings owns Escape while its navigation layer is open.
        } else if (this.quitConfirm.isVisible()) {
          this.cancelQuit();
        } else if (this.selection.isAttackMoveArmed()) {
          this.selection.setAttackMoveArmed(false);
        } else if (this.placement.isActive()) {
          this.placement.cancel();
        } else {
          this.setPaused(!this.paused);
        }
        event.preventDefault();
      } else if (!this.paused && !this.placement.isActive() && event.code === 'KeyQ') {
        this.selection.setAttackMoveArmed(true);
        event.preventDefault();
      } else if (!this.paused && !this.placement.isActive() && event.code === 'KeyE') {
        toggleEntrenchment(this.world, PLAYER_ID, this.selection.selectedIds());
        this.showSelection();
        event.preventDefault();
      } else if (!this.paused && event.code === DEBUG_LABEL_KEY) {
        this.debugLabels.setEnabled(!this.debugLabels.isEnabled());
        this.routeDebug.setEnabled(this.debugLabels.isEnabled());
      }
    };
    // Capture Q before other keyboard listeners so it becomes a one-click command.
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
    if (this.lifecycle.result !== null) {
      this.enterTerminalState();
    }
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
    secondaryAi: AiState | null;
    lifecycle: MatchLifecycleState;
  } | null {
    if (snapshot === null) {
      return null;
    }
    try {
      return restoreWorld(snapshot, grid);
    } catch (error) {
      console.warn('Redline Tactics: discarding an unreadable local match snapshot.', error);
      return null;
    }
  }

  /** Advances and draws one budgeted frame. Called by the capped engine render loop. */
  // eslint-disable-next-line complexity -- One frame intentionally sequences all deterministic simulation systems.
  public render(deltaSeconds: number): void {
    if (this.paused || this.lifecycle.result !== null) {
      this.presentation.render();
      return;
    }
    const activeDeltaSeconds = stepMatchElapsedTime(this.lifecycle, deltaSeconds);
    this.presentation.cameraController.update(activeDeltaSeconds);
    stepMovement(this.world, activeDeltaSeconds);
    stepGather(this.world, this.grid, this.resourceFieldState, this.economy, activeDeltaSeconds);
    stepConstruction(this.world, activeDeltaSeconds);
    stepEntrenchment(this.world, activeDeltaSeconds);
    recordProducedUnits(this.lifecycle, stepProduction(this.world, this.grid, activeDeltaSeconds));
    stepAttackCooldowns(this.world, activeDeltaSeconds);
    if (stepFogVisibility(this.fog, this.world, this.grid, activeDeltaSeconds)) {
      this.presentation.updateFog(this.fog, PLAYER_ID);
    }
    for (const owner of this.aiPlayers) {
      const ai = this.ais.get(owner);
      if (ai === undefined) continue;
      const aiStep = stepAi(ai, observeAiStrategy(ai, this.world, this.grid, this.fog, owner), activeDeltaSeconds);
      executeAiEconomyDecisions(ai, aiStep, {
        world: this.world, grid: this.grid, economy: this.economy, resourceFieldState: this.resourceFieldState,
      }, this.defenseRecoveryReadout, owner);
      executeAiMilitaryDecisions(ai, aiStep, {
        world: this.world, grid: this.grid, economy: this.economy,
      }, this.militaryReadout, owner);
      executeAiDefenseDecisions(ai, aiStep, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout, owner);
    }
    stepAutomaticTargeting(this.world, this.autoTargeting, activeDeltaSeconds, undefined, this.canTarget);
    const hits = [
      ...stepAttackOrders(this.world, this.grid, activeDeltaSeconds, this.canTarget),
      ...stepAttackMoveOrders(this.world, this.grid, activeDeltaSeconds, this.canTarget),
    ];
    recordCombatDestructions(this.lifecycle, this.combatDestructions(hits));
    this.showAttackFeedback(hits);
    resolveMatchOutcome(this.lifecycle, countAliveBuildings(this.world.entities()));
    if (this.lifecycle.result !== null) {
      this.finishTerminalFrame(activeDeltaSeconds);
      return;
    }
    issueRetaliationOrders(this.world, hits, this.canTarget);
    this.presentation.updateEffects(activeDeltaSeconds);
    stepSeparation(this.world, this.grid, activeDeltaSeconds);
    // The selected entity keeps moving and taking damage, so the markers and the readout follow it.
    this.selection.refresh();
    this.showSelection(activeDeltaSeconds);
    this.placement.update();
    this.debugLabels.update(this.world, (id) => this.presentation.modelHeightOf(id), this.isVisibleToObserver);

    this.hudElapsedSeconds += activeDeltaSeconds;
    if (this.hudElapsedSeconds >= RENDER_CONFIG.hudUpdateIntervalSeconds) {
      const ai = this.ais.get('ai');
      if (ai !== undefined) this.aiDebug?.update(ai, this.world, this.economy, this.militaryReadout, { world: this.world, grid: this.grid, fog: this.fog }, this.defenseRecoveryReadout.latestAction);
      this.hudElapsedSeconds = 0;
    }

    this.saveElapsedSeconds += activeDeltaSeconds;
    if (this.saveElapsedSeconds >= PERSISTENCE_CONFIG.saveIntervalSeconds) {
      this.saveNow();
    }
    this.presentation.render();
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('pagehide', this.onPageHide);
    this.selection.dispose();
    this.routeDebug.dispose();
    this.debugLabels.dispose();
    this.aiDebug?.dispose();
    this.hud.destroy();
    this.placement.dispose();
    this.pauseMenu.destroy();
    this.quitConfirm.destroy();
    this.resultOverlay.destroy();
    this.presentation.dispose();
  }

  /** Freezes simulation and all map input while the pause menu owns the screen. */
  private setPaused(paused: boolean): void {
    if (this.lifecycle.result !== null) return;
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      // A placement preview is intentionally not resumable through a pause; this prevents a stale
      // click behind the overlay from confirming an old footprint.
      this.placement.cancel();
      this.saveNow();
    }
    this.presentation.cameraController.setEnabled(!paused);
    this.selection.setEnabled(!paused);
    this.placement.setEnabled(!paused);
    this.pauseMenu.setVisible(paused);
  }

  /** Swaps the pause menu for the quit confirmation; the match stays paused underneath either way. */
  private openQuitConfirm(): void {
    this.pauseMenu.setVisible(false);
    this.quitConfirm.show();
  }

  /** "Cancel": back to the pause menu, match state untouched. */
  private cancelQuit(): void {
    this.quitConfirm.hide();
    this.pauseMenu.setVisible(true);
  }

  /** "Save and Quit" / "Quit Without Saving": persist or discard, then let the caller dispose this scene. */
  private confirmQuit(save: boolean): void {
    this.quitConfirm.hide();
    if (save) {
      this.saveNow();
    } else {
      clearSnapshot();
    }
    this.onReturnToTitle();
  }

  /** Saves the current world and selection to local storage now, and resets the autosave timer. */
  private saveNow(): void {
    if (this.lifecycle.result !== null && this.terminalSnapshotSaved) return;
    saveSnapshot(
      serializeWorld(
        this.world,
        this.selection.selectedIds(),
        this.economy,
        this.resourceFieldState,
        this.fog,
        this.grid,
        this.ais.get('ai') ?? createAiState(),
        this.lifecycle,
        this.ais.get('ai2') ?? null,
      ),
    );
    if (this.lifecycle.result !== null) this.terminalSnapshotSaved = true;
    this.saveElapsedSeconds = 0;
  }

  /** Points the marker and the readout at whatever is selected right now. */
  private showSelection(deltaSeconds = 0): void {
    const entities = this.selection.selectedIds()
      .flatMap((id) => { const entity = this.world.get(id); return entity === undefined ? [] : [entity]; });
    this.presentation.sync(this.battleViewState(this.selection.selectedIds()), deltaSeconds);
    this.routeDebug.update(entities);
    this.hud.update(this.hudModel(entities));
  }

  // eslint-disable-next-line complexity -- The controller maps each selection kind to presentation-only HUD data.
  private hudModel(entities: readonly ReadonlyEntity[]): BattleHudViewModel {
    const base = {
      commandTitle: this.debugNoFog ? `${GAME_TITLE} · Debug no fog` : `${GAME_TITLE} command`,
      status: `${this.grid.name.toUpperCase()} · Single-player`,
      connected: true,
      clock: formatMatchCountdown(this.lifecycle.elapsedActiveSeconds),
      clockLabel: 'Match time',
      selection: this.selectionView(entities),
      credits: this.economy.balance(PLAYER_ID),
      economyStatus: isPowerAvailable(this.world, PLAYER_ID) ? 'Power online' : 'No power',
      economyWarning: !isPowerAvailable(this.world, PLAYER_ID),
      minimap: this.minimapView(),
      queue: [] as const,
    };
    if (entities.length === 0) {
      this.productionMessage = '';
      this.productionBuildingId = null;
      return { ...base, actionTitle: 'Tactical commands', actions: [], emptyMessage: 'Select a Worker to construct a base, a production building to train units, or combat units to attack.' };
    }
    const single = entities.length === 1 ? entities[0] : undefined;
    if (single?.kind !== 'building') {
      this.productionMessage = '';
      this.productionBuildingId = null;
    }
    if (single?.kind === 'unit' && single.type === 'worker' && single.owner === PLAYER_ID) {
      const actions = (Object.keys(BUILDING_CONFIG) as BuildingTypeId[])
        .filter((type) => BUILDING_CONFIG[type].buildable)
        .map((type) => this.buildAction(single.id, type));
      return { ...base, actionTitle: 'Construction', actionTestId: 'build-menu', actions };
    }
    if (single?.kind === 'building' && single.owner === PLAYER_ID) return this.productionHudModel(base, single);
    if (entities.every((entity) => entity.kind === 'unit')) {
      const actions: BattleHudAction[] = [hudAction('attack-move', 'Attack-move', 'Q · engage enemies en route', () => {
        this.placement.cancel();
        this.selection.setAttackMoveArmed(true);
      })];
      const fpv = entities.filter((entity): entity is ReadonlyUnit => entity.kind === 'unit' && entity.type === 'fpvOperators' && entity.owner === PLAYER_ID);
      if (fpv.length > 0) {
        const entrenched = fpv.every((entity) => entity.entrenchment === 'entrenched');
        const entrenching = fpv.some((entity) => entity.entrenchment === 'entrenching');
        const progress = Math.floor(Math.max(...fpv.map((entity) => entity.entrenchElapsedSeconds)) / ENTRENCHMENT_CONFIG.durationSeconds * 100);
        actions.push(hudAction(
          'entrench',
          entrenched ? 'PACK UP' : entrenching ? `ENTRENCHING ${progress}%` : 'ENTRENCH',
          entrenched ? 'Return to mobile formation' : entrenching ? 'Return to mobile formation' : 'Deploy to enable attacks',
          () => { toggleEntrenchment(this.world, PLAYER_ID, fpv.map((entity) => entity.id)); this.showSelection(); },
          'entrench-fpv-operators',
        ));
      }
      return { ...base, actionTitle: 'Unit orders', ...(fpv.length > 0 ? { actionTestId: 'entrench-menu' } : {}), actions };
    }
    return { ...base, actionTitle: 'Mixed selection', actions: [], emptyMessage: 'Select units or one structure to show available commands.' };
  }

  // eslint-disable-next-line complexity -- Compact selection copy covers fields, groups and entity-specific status.
  private selectionView(entities: readonly ReadonlyEntity[]): BattleHudViewModel['selection'] {
    const field = entities.length === 0
      ? this.grid.resourceFields.find((candidate) => candidate.id === this.selectedFieldId)
      : undefined;
    if (field !== undefined && cellVisibility(this.fog, PLAYER_ID, field.center.tx, field.center.ty) === 'visible') {
      const remaining = this.resourceFieldState.remaining(field.id);
      return { name: 'Gas Extraction Site', detail: `${Math.floor(remaining)} / ${field.credits} Credits remaining · ${remaining > 0 ? 'Resource field' : 'Depleted'}`, healthFraction: field.credits === 0 ? 0 : remaining / field.credits };
    }
    if (entities.length === 0) return { name: 'No selection', detail: 'Select a friendly unit or structure', healthFraction: 0 };
    if (entities.length > 1) {
      const healthFraction = entities.reduce((total, entity) => total + entity.health / entity.stats.maxHealth, 0) / entities.length;
      return { name: `${entities.length} units selected`, detail: 'Right-click the battlefield to issue a group order', healthFraction };
    }
    const entity = entities[0]!;
    const progress = entity.kind === 'building' && entity.status === 'constructing' ? ` · ${Math.floor(entity.constructionProgress * 100)}% built` : '';
    const carrying = entity.kind === 'unit' && entity.carriedCredits > 0 ? ` · carrying ${Math.floor(entity.carriedCredits)} Credits` : '';
    const entrenchment = entity.kind === 'unit' && entity.type === 'fpvOperators'
      ? entity.entrenchment === 'mobile' ? ' · must entrench to attack' : ` · ${entity.entrenchment}`
      : '';
    return { name: entity.stats.name, detail: `${Math.ceil(entity.health)} / ${entity.stats.maxHealth} integrity · ${capitalize(entity.status)}${progress}${entrenchment}${carrying}`, healthFraction: entity.health / entity.stats.maxHealth };
  }

  private buildAction(workerId: EntityId, type: BuildingTypeId): BattleHudAction {
    const config = BUILDING_CONFIG[type];
    const prerequisite = checkPrerequisites(this.world, PLAYER_ID, type);
    const affordable = this.economy.canAfford(PLAYER_ID, config.cost);
    const disabledReason = !prerequisite.allowed
      ? `Requires ${prerequisite.missing.map((missing) => BUILDING_CONFIG[missing].name).join(', ')}`
      : !affordable ? `Needs ${config.cost} Credits` : undefined;
    const thumbnailUrl = BUILDING_THUMBNAILS[type];
    return {
      ...hudAction(type, config.name, `${config.cost} Credits · ${config.buildTimeSeconds}s`, () => this.placement.start(type, workerId), `build-${type}`, disabledReason !== undefined, disabledReason),
      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    };
  }

  private productionHudModel(base: Omit<BattleHudViewModel, 'actionTitle' | 'actions'>, building: ReadonlyBuilding): BattleHudViewModel {
    if (this.productionBuildingId !== building.id) {
      this.productionBuildingId = building.id;
      this.productionMessage = '';
    }
    if (!isCompleted(building)) return { ...base, actionTitle: `${building.stats.name} production`, actions: [], emptyMessage: 'Construction must finish before this structure can operate.' };
    if (building.stats.produces.length === 0) return { ...base, actionTitle: `${building.stats.name} production`, actions: [], emptyMessage: 'This structure supports your base and has no production queue.' };
    const actions = building.stats.produces.map((unitType) => {
      const stats = resolveUnitStats(unitType, building.faction);
      const check = checkProductionRequest(this.world, this.economy, PLAYER_ID, building.id, unitType);
      const reason = productionReason(check.reason, stats.cost, stats.requires);
      return hudAction(unitType, stats.name, `${stats.cost} Credits · ${stats.buildTimeSeconds}s`, () => { this.productionMessage = ''; this.queueSelectedProduction(unitType); this.showSelection(); }, `produce-${unitType}`, !check.allowed, reason, `Queue ${stats.name} (${stats.buildTimeSeconds}s)`);
    });
    const queue = building.productionQueue.map((item, index) => {
      const stats = resolveUnitStats(item.unitType, building.faction);
      const progress = index === 0 ? Math.min(100, Math.floor(item.elapsedSeconds / stats.buildTimeSeconds * 100)) : 0;
      return {
        id: `${building.id}-${index}`,
        label: `${index + 1}. ${stats.name} · ${progress}%`,
        detail: `Cancel and refund ${Math.round(item.paidCost * ECONOMY_CONFIG.cancelRefundFraction)} Credits`,
        testId: `cancel-production-${index}`,
        onCancel: () => {
          const result = this.cancelSelectedProduction(index);
          this.productionMessage = result.cancelled ? `Cancelled — refunded ${result.refunded} Credits` : 'Cannot cancel that queue item';
          this.showSelection();
        },
      };
    });
    const front = building.productionQueue[0];
    const powerPaused = front !== undefined &&
      (building.stats.requiresPower || resolveUnitStats(front.unitType, building.faction).requiresPower) &&
      !isPowerAvailable(this.world, PLAYER_ID);
    return {
      ...base,
      actionTitle: `${building.stats.name} production · ${powerPaused ? 'Paused — no power' : `Queue ${queue.length}/${PRODUCTION_CONFIG.queueCapacity}`}${this.productionMessage === '' ? '' : ` · ${this.productionMessage}`}`,
      actionTestId: 'production-menu',
      actions,
      queue,
    };
  }

  private minimapView(): BattleHudViewModel['minimap'] {
    const cells = Array.from({ length: this.grid.heightTiles }, (_, ty) =>
      Array.from({ length: this.grid.widthTiles }, (_, tx) => this.debugNoFog ? 'visible' as const : cellVisibility(this.fog, PLAYER_ID, tx, ty)));
    return {
      width: this.grid.bounds.width,
      height: this.grid.bounds.height,
      cells,
      fields: this.grid.resourceFields.map((field) => ({ position: this.grid.tileCenter(field.center.tx, field.center.ty), visible: this.debugNoFog || cellVisibility(this.fog, PLAYER_ID, field.center.tx, field.center.ty) !== 'hidden' })),
      entities: this.world.entities().filter(this.isVisibleToObserver).map((entity) => ({ position: entity.position, friendly: entity.owner === PLAYER_ID, building: entity.kind === 'building' })),
      viewport: this.presentation.cameraController.visibleBounds(),
    };
  }

  private battleViewState(selectedIds: readonly EntityId[]) {
    return localBattleViewState(
      this.world,
      this.grid,
      this.resourceFieldState,
      selectedIds,
      this.isVisibleToObserver,
    );
  }

  /** Maps only confirmed core hits into renderer-safe cues, then removes a confirmed dead entity once. */
  private showAttackFeedback(events: readonly AttackHitEvent[]): void {
    for (const event of events) {
      const attacker = this.world.get(event.attackerId);
      const target = this.world.get(event.targetId);
      const effect = mapAttackHitToCombatEffect(event, attacker, target);
      if (target === undefined) continue;
      if (effect !== null) this.presentation.playEffect(effect);
      if (event.destroyed) {
        // Destruction cues follow fog like everything else: an unseen enemy's death shows nothing.
        const death = effect === null || !this.isDeathVisible(target)
          ? null
          : deathEffectAt(effect.to, effect.targetToken, vehicleDeathDescriptor(target));
        if (death !== null) this.presentation.playEffect(death);
        this.world.remove(target.id);
      }
    }
  }

  /** Dead entities fail `isVisibleToObserver`, so a death is judged by where it happened. */
  private isDeathVisible(target: ReadonlyEntity): boolean {
    if (this.debugNoFog || target.owner === PLAYER_ID) return true;
    const tx = Math.floor(target.position.x / this.fog.tileSizePixels);
    const ty = Math.floor(target.position.y / this.fog.tileSizePixels);
    return cellVisibility(this.fog, PLAYER_ID, tx, ty) === 'visible';
  }

  /** Captures lifecycle facts before `showAttackFeedback` removes destroyed targets. */
  private combatDestructions(events: readonly AttackHitEvent[]): readonly CombatDestructionEvent[] {
    return events.flatMap((event) => {
      if (!event.destroyed) return [];
      const target = this.world.get(event.targetId);
      return target === undefined
        ? []
        : [{
            targetId: target.id,
            owner: target.owner,
            entityKind: target.kind,
            entityType: target.type,
          }];
    });
  }

  /** Performs the final renderer sync, freezes every gameplay input, and persists exactly once. */
  private finishTerminalFrame(deltaSeconds: number): void {
    this.presentation.updateEffects(deltaSeconds);
    this.selection.refresh();
    this.showSelection(deltaSeconds);
    this.debugLabels.update(this.world, (id) => this.presentation.modelHeightOf(id), this.isVisibleToObserver);
    this.enterTerminalState();
    this.saveNow();
    this.presentation.render();
  }

  private enterTerminalState(): void {
    if (this.lifecycle.result === null) return;
    this.paused = false;
    this.placement.cancel();
    this.presentation.cameraController.setEnabled(false);
    this.selection.setEnabled(false);
    this.placement.setEnabled(false);
    this.pauseMenu.setVisible(false);
    this.resultOverlay.show(this.lifecycle);
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

  /** A right-click with selected Workers resumes a friendly paused construction site. */
  private resumeConstruction(ids: readonly EntityId[], buildingId: EntityId): void {
    const worker = ids
      .map((id) => this.world.unit(id))
      .find((unit) => unit?.owner === PLAYER_ID && unit.type === 'worker');
    if (worker !== undefined) {
      resumeConstruction(this.world, this.grid, PLAYER_ID, buildingId, worker.id);
    }
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
   * base, its Worker and the Credits are all on screen from the first frame. Falls back to
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

function hudAction(
  id: string,
  label: string,
  detail: string,
  onTrigger: () => void,
  testId?: string,
  disabled = false,
  disabledReason?: string,
  title?: string,
): BattleHudAction {
  return {
    id,
    label,
    detail,
    onTrigger,
    disabled,
    ...(testId === undefined ? {} : { testId }),
    ...(disabledReason === undefined ? {} : { disabledReason }),
    ...(title === undefined ? {} : { title }),
  };
}

function productionReason(
  reason: ReturnType<typeof checkProductionRequest>['reason'],
  cost: number,
  requires: readonly BuildingTypeId[],
): string | undefined {
  switch (reason) {
    case null: return undefined;
    case 'queue-full': return 'Queue full';
    case 'insufficient-credits': return `Needs ${cost} Credits`;
    case 'no-power': return 'Needs Power Plant';
    case 'incomplete-building': return 'Building is not complete';
    case 'unsupported-unit': return 'This building cannot produce that unit';
    case 'missing-prerequisite': return `Requires ${requires.map((type) => BUILDING_CONFIG[type].name).join(', ')}`;
    case 'not-owner': return 'That building is not yours';
    default: return 'Production is unavailable';
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
