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
import type { Vec2 } from '../core/geometry';
import type { EntityId, PlayerId } from '../core/ids';
import { issueGroupMoveOrders } from '../core/formation';
import { stepMovement } from '../core/movement';
import { populateStartingEntities } from '../core/matchSetup';
import { pruneSelection } from '../core/selection';
import { restoreWorld, serializeWorld, type WorldSnapshot } from '../core/snapshot';
import { stepSeparation } from '../core/separation';
import { createWorld, type World } from '../core/world';
import { ControlsOverlay } from '../ui/controlsOverlay';
import { NewMatchButton } from '../ui/newMatchButton';
import { SelectionPanel } from '../ui/selectionPanel';
import { TacticalHud } from '../ui/tacticalHud';
import { TitleBanner } from '../ui/titleBanner';
import { CameraController } from './CameraController';
import { DebugLabelsView } from './DebugLabelsView';
import { EntitiesView } from './EntitiesView';
import { clearSnapshot, loadSnapshot, saveSnapshot } from './matchPersistence';
import { MapView } from './MapView';
import { OrderMarkerView } from './OrderMarkerView';
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
 * three dimensions, and lets the player look around and select what they own. Direct movement is supported; economy,
 * combat and the AI arrive in later tasks.
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
  private readonly space: SceneSpace;
  private readonly materials: MaterialLibrary;
  private readonly models: ModelLibrary;
  private readonly mapView: MapView;
  private readonly entitiesView: EntitiesView;
  private readonly selectionMarker: SelectionMarker;
  private readonly orderMarker: OrderMarkerView;
  private readonly slotMarker: SlotMarkerView;
  private readonly routeDebug: RouteDebugView;
  private readonly selection: SelectionController;
  private readonly cameraController: CameraController;
  private readonly camera: TargetCamera;
  private readonly shadows: ShadowGenerator;
  private readonly debugLabels: DebugLabelsView;
  private readonly hud: TacticalHud;
  private readonly titleBanner: TitleBanner;
  private readonly controlsOverlay: ControlsOverlay;
  private readonly selectionPanel: SelectionPanel;
  private readonly newMatchButton: NewMatchButton;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onPageHide: () => void;
  private hudElapsedSeconds = Number.POSITIVE_INFINITY;
  private saveElapsedSeconds = 0;

  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    /** The HTML layer above the canvas, where the title, controls card and readouts live. */
    overlayContainer: HTMLElement,
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromColor3(color3(FIELD_TONES.sky), 1);

    this.grid = createMapGrid(MAP_CONFIG);
    this.space = createSceneSpace(this.grid);

    // Resume an unfinished match saved on this device when one exists and is readable; otherwise
    // open the same opening position every fresh match always has.
    const restored = MatchScene.tryRestore(loadSnapshot(), this.grid.tileSizePixels);
    if (restored !== null) {
      this.world = restored.world;
    } else {
      clearSnapshot();
      this.world = createWorld({ tileSizePixels: this.grid.tileSizePixels });
      populateStartingEntities(this.world, this.grid);
    }

    this.camera = new TargetCamera('camera', Vector3.Zero(), this.scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;
    this.scene.activeCamera = this.camera;

    this.shadows = this.createLighting();

    this.materials = createMaterialLibrary(this.scene);
    this.models = createModelLibrary(this.scene, this.materials);
    this.mapView = new MapView(this.scene, this.grid, this.space, this.materials);
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
    this.entitiesView.sync(this.world);

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
      (mesh) => this.entitiesView.entityIdOfMesh(mesh),
      () => this.showSelection(),
      (ids, target) => {
        issueGroupMoveOrders(this.world, this.grid, PLAYER_ID, ids, target);
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
    this.newMatchButton = new NewMatchButton(overlayContainer, () => {
      // `location.reload()` fires `pagehide` on its way out, which would otherwise re-run the
      // pagehide save below and immediately re-write the snapshot this click means to discard.
      window.removeEventListener('pagehide', this.onPageHide);
      clearSnapshot();
      location.reload();
    });
    this.debugLabels = new DebugLabelsView(overlayContainer, this.scene, canvas, this.space);

    this.onKeyDown = (event) => {
      if (event.code === DEBUG_LABEL_KEY) {
        this.debugLabels.setEnabled(!this.debugLabels.isEnabled());
        this.routeDebug.setEnabled(this.debugLabels.isEnabled());
      }
    };
    window.addEventListener('keydown', this.onKeyDown);

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
    tileSizePixels: number,
  ): { world: World; selection: readonly EntityId[] } | null {
    if (snapshot === null) {
      return null;
    }
    try {
      return restoreWorld(snapshot, tileSizePixels);
    } catch (error) {
      console.warn('Mini Command: discarding an unreadable local match snapshot.', error);
      return null;
    }
  }

  /** Advances and draws one budgeted frame. Called by the capped engine render loop. */
  public render(deltaSeconds: number): void {
    this.cameraController.update(deltaSeconds);
    stepMovement(this.world, deltaSeconds);
    stepSeparation(this.world, this.grid, deltaSeconds);
    // The selected entity keeps moving and taking damage, so the markers and the readout follow it.
    this.selection.refresh();
    this.entitiesView.sync(this.world, this.selection.selectedIds(), deltaSeconds);
    this.showSelection();
    this.debugLabels.update(this.world, (id) => this.entitiesView.modelHeightOf(id));

    this.hudElapsedSeconds += deltaSeconds;
    if (this.hudElapsedSeconds >= RENDER_CONFIG.hudUpdateIntervalSeconds) {
      this.hud.update(this.world, this.grid, this.cameraController.visibleBounds());
      this.hudElapsedSeconds = 0;
    }

    this.saveElapsedSeconds += deltaSeconds;
    if (this.saveElapsedSeconds >= PERSISTENCE_CONFIG.saveIntervalSeconds) {
      this.saveNow();
    }
    this.scene.render();
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pagehide', this.onPageHide);
    this.cameraController.dispose();
    this.selection.dispose();
    this.selectionMarker.dispose();
    this.orderMarker.dispose();
    this.slotMarker.dispose();
    this.routeDebug.dispose();
    this.entitiesView.dispose();
    this.mapView.dispose();
    this.models.dispose();
    this.materials.dispose();
    this.debugLabels.dispose();
    this.hud.destroy();
    this.titleBanner.destroy();
    this.controlsOverlay.destroy();
    this.selectionPanel.destroy();
    this.newMatchButton.destroy();
    this.scene.dispose();
  }

  /** Saves the current world and selection to local storage now, and resets the autosave timer. */
  private saveNow(): void {
    saveSnapshot(serializeWorld(this.world, this.selection.selectedIds()));
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
    this.orderMarker.update(entities, (targetId) => this.world.get(targetId)?.position ?? null);
    this.slotMarker.update(entities);
    this.routeDebug.update(entities);
    this.selectionPanel.update(entities);
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
