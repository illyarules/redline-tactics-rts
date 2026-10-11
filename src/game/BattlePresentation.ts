import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { RENDER_CONFIG } from '../config/render';
import type { ReadonlyEntity } from '../core/entities';
import type { FogState } from '../core/fog';
import type { Vec2 } from '../core/geometry';
import type { EntityId, PlayerId } from '../core/ids';
import type { MapGrid } from '../core/map';
import { CameraController } from './CameraController';
import { CombatEffectsView } from './CombatEffectsView';
import type { CombatEffectEvent } from './combatEffectEvents';
import { EntitiesView } from './EntitiesView';
import { FogView } from './FogView';
import { MapView } from './MapView';
import { OrderMarkerView } from './OrderMarkerView';
import { SelectionMarker } from './SelectionMarker';
import { SlotMarkerView } from './SlotMarkerView';
import type { BattleViewState } from './battleViewState';
import { createMaterialLibrary, type MaterialLibrary } from './materials';
import { createModelLibrary } from './models/library';
import { color3, FIELD_TONES } from './palette';
import { createSceneSpace, type SceneSpace } from './sceneSpace';

const SUN_DIRECTION = new Vector3(0.45, -1, 0.35);
const SUN_DISTANCE_TILES = 90;
const SHADOW_SPAN_SHARE = 0.9;

/**
 * Shared Babylon presentation for a battle. It renders a read-only view and never advances or
 * mutates authoritative gameplay, so local and remote sessions can feed the same visual surface.
 */
export class BattlePresentation {
  public readonly scene: Scene;
  public readonly camera: TargetCamera;
  public readonly space: SceneSpace;
  public readonly materials: MaterialLibrary;
  public readonly cameraController: CameraController;

  private readonly mapView: MapView;
  private readonly fogView: FogView;
  private readonly entitiesView: EntitiesView;
  private readonly combatEffects: CombatEffectsView;
  private readonly selectionMarker: SelectionMarker;
  private readonly orderMarker: OrderMarkerView;
  private readonly slotMarker: SlotMarkerView;
  private readonly models;

  public constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    private readonly grid: MapGrid,
    openingFocus: Vec2 | null,
    private readonly revealAll = false,
  ) {
    this.scene = new Scene(engine);
    this.scene.clearColor = Color4.FromColor3(color3(FIELD_TONES.sky), 1);
    this.space = createSceneSpace(grid);
    this.camera = new TargetCamera('camera', Vector3.Zero(), this.scene);
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;
    this.scene.activeCamera = this.camera;

    const shadows = this.createLighting();
    this.materials = createMaterialLibrary(this.scene);
    this.models = createModelLibrary(this.scene, this.materials);
    this.mapView = new MapView(this.scene, grid, this.space, this.materials);
    for (const mesh of this.mapView.shadowCasters()) shadows.addShadowCaster(mesh);
    this.fogView = new FogView(this.scene, grid, this.space);
    this.fogView.setEnabled(!revealAll);
    this.entitiesView = new EntitiesView(
      this.scene,
      this.space,
      this.models,
      this.materials,
      (mesh: Mesh) => shadows.addShadowCaster(mesh),
    );
    this.combatEffects = new CombatEffectsView(this.scene, this.space, this.materials);
    this.selectionMarker = new SelectionMarker(this.scene, this.materials, this.space);
    this.orderMarker = new OrderMarkerView(this.scene, this.materials, this.space);
    this.slotMarker = new SlotMarkerView(this.scene, this.materials, this.space);
    this.cameraController = new CameraController(
      this.camera,
      canvas,
      grid.bounds,
      this.space,
      openingFocus,
    );
  }

  /** Synchronizes persistent battlefield objects with one immutable gameplay projection. */
  public sync(state: BattleViewState, deltaSeconds = 0): void {
    this.entitiesView.sync(state.entities, state.selectedIds, deltaSeconds, state.isVisible);
    const selected = selectedEntities(state.entities, state.selectedIds);
    this.selectionMarker.update(selected);
    this.orderMarker.update(selected, state.positionOfVisibleTarget);
    this.slotMarker.update(selected);
    for (const field of this.grid.resourceFields) {
      this.mapView.setFieldFraction(field.id, state.fieldFractions.get(field.id) ?? 0);
    }
  }

  /** Applies authoritative fog only when its simulation cadence reports a change. */
  public updateFog(fog: FogState, viewer: PlayerId): void {
    if (this.revealAll) return;
    this.fogView.update(fog, viewer);
    this.mapView.updateFog(fog, viewer);
  }

  public entityIdOfMesh(mesh: { uniqueId: number } | null): EntityId | null {
    return this.entitiesView.entityIdOfMesh(mesh);
  }

  public modelHeightOf(id: EntityId): number { return this.entitiesView.modelHeightOf(id); }
  public playEffect(event: CombatEffectEvent): void { this.combatEffects.play(event); }
  public updateEffects(deltaSeconds: number): void { this.combatEffects.update(deltaSeconds); }
  public render(): void { this.scene.render(); }

  public dispose(): void {
    this.cameraController.dispose();
    this.selectionMarker.dispose();
    this.orderMarker.dispose();
    this.slotMarker.dispose();
    this.combatEffects.dispose();
    this.entitiesView.dispose();
    this.fogView.dispose();
    this.mapView.dispose();
    this.models.dispose();
    this.materials.dispose();
    this.scene.dispose();
  }

  private createLighting(): ShadowGenerator {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.8;
    ambient.diffuse = color3(0xc5d8ed);
    ambient.groundColor = color3(0x727c79);
    ambient.specular = Color3.Black();

    const sun = new DirectionalLight('sun', SUN_DIRECTION, this.scene);
    sun.intensity = 1.25;
    sun.diffuse = color3(0xffe3bc);
    sun.specular = Color3.Black();
    sun.position = SUN_DIRECTION.scale(-SUN_DISTANCE_TILES).add(
      new Vector3(this.space.widthUnits / 2, 0, this.space.depthUnits / 2),
    );
    sun.autoUpdateExtends = false;
    const span = Math.max(this.space.widthUnits, this.space.depthUnits) * SHADOW_SPAN_SHARE;
    sun.orthoLeft = -span;
    sun.orthoRight = span;
    sun.orthoBottom = -span;
    sun.orthoTop = span;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = SUN_DISTANCE_TILES * 2.5;

    const shadows = new ShadowGenerator(RENDER_CONFIG.shadowMapSize, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadows.darkness = 0.4;
    return shadows;
  }
}

function selectedEntities(
  entities: readonly ReadonlyEntity[],
  selectedIds: readonly EntityId[],
): readonly ReadonlyEntity[] {
  const selected = new Set(selectedIds);
  return entities.filter((entity) => selected.has(entity.id));
}
