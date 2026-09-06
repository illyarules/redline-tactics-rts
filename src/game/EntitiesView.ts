import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { SQUAD_CONFIG } from '../config/squad';
import { healthFraction, isAlive, type ReadonlyEntity, type ReadonlyUnit } from '../core/entities';
import { clamp } from '../core/geometry';
import type { EntityId } from '../core/ids';
import type { World } from '../core/world';
import { shouldShowHealthBar } from './healthBar';
import type { MaterialLibrary } from './materials';
import type { ModelLibrary } from './models/library';
import { createSoldierKit, instantiateSoldier, type SoldierInstance, type SoldierKit } from './models/soldier';
import { squadFormationSlots } from './models/squadFormation';
import { idlePose, walkPose } from './models/walkCycle';
import { healthTone } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * Draws every entity the world holds, and nothing else.
 *
 * This view is a mirror: each frame it creates a display for a new entity id, moves and re-reads the
 * ones it already has, and disposes the ones the world no longer holds. It reads core state and
 * decides nothing — no damage, no costs, no prerequisites.
 *
 * Every entity but Infantry is a clone of its role's prototype model plus a health bar that turns to
 * face the camera. Infantry is a three-soldier squad instead: one shared root carries three cloned
 * soldier rigs (`models/soldier.ts`) whose legs and rifle arm this view swings every frame from the
 * entity's `status`, entirely as view-layer state — `src/core` never sees a walk cycle. Every mesh
 * carries the owning entity's id, so a click on any soldier resolves back to core state.
 */

/** Health bar size in tiles, and how far above the model it floats. */
const BAR_HEIGHT = 0.1;
const BAR_MIN_WIDTH = 0.7;
const BAR_MAX_WIDTH = 2;
const BAR_GAP = 0.3;
const BAR_BACKING = 0x141b18;
/** Drawn after the field, so a bar is never lost behind the model in front of it. */
const OVERLAY_RENDERING_GROUP = 1;

const DEAD_VISIBILITY = 0.35;
/** Distinct from both a finished building (1) and a dead entity ({@link DEAD_VISIBILITY}). */
const CONSTRUCTING_VISIBILITY = 0.6;
/** Never fully flat, so even a freshly placed site reads as something standing there. */
const MIN_CONSTRUCTION_SCALE = 0.15;

interface Bar {
  readonly node: TransformNode;
  readonly fill: Mesh;
  readonly rest: Mesh;
}

interface DisplayBase {
  readonly root: TransformNode;
  readonly bar: TransformNode;
  readonly barFill: Mesh;
  readonly barRest: Mesh;
  readonly barWidth: number;
  /** How tall the model stands, in tiles. Markers and labels sit above it. */
  readonly modelHeight: number;
  /** Every mesh a click may land on, and every mesh the dead-visibility fade applies to. */
  readonly pickableMeshes: readonly Mesh[];
}

interface ModelDisplay extends DisplayBase {
  readonly kind: 'model';
}

interface SquadAnimationState {
  /** Only advances while the entity is moving; frozen — not reset — the instant it stops. */
  walkPhaseRadians: number;
  /** Always advances, so idle sway keeps breathing however long the squad has been standing still. */
  elapsedSeconds: number;
}

interface SquadDisplay extends DisplayBase {
  readonly kind: 'squad';
  readonly soldiers: readonly SoldierInstance[];
  readonly animation: SquadAnimationState;
}

type EntityDisplay = ModelDisplay | SquadDisplay;
type EntityVisibility = (entity: ReadonlyEntity) => boolean;

const ALWAYS_VISIBLE: EntityVisibility = () => true;

function isInfantry(entity: ReadonlyEntity): entity is ReadonlyUnit & { type: 'infantry' } {
  return entity.kind === 'unit' && entity.type === 'infantry';
}

export class EntitiesView {
  private readonly displays = new Map<EntityId, EntityDisplay>();
  private readonly meshOwners = new Map<number, EntityId>();
  private readonly soldierKit: SoldierKit;

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly models: ModelLibrary,
    private readonly materials: MaterialLibrary,
    /** Called for each new model so the scene can make it cast a shadow. */
    private readonly onMeshCreated: (mesh: Mesh) => void,
  ) {
    this.soldierKit = createSoldierKit(scene, materials);
  }

  /**
   * Brings the display in line with the world. Safe to call every frame.
   *
   * `selectedId` is display state, not world state: it decides whether an entity shows its health
   * bar, and nothing else. The selection itself lives in `core/selection.ts`. `deltaSeconds` drives
   * nothing but the Infantry walk cycle, which is likewise display state.
   */
  public sync(
    world: World,
    selectedIds: readonly EntityId[] = [],
    deltaSeconds = 0,
    isVisible: EntityVisibility = ALWAYS_VISIBLE,
  ): void {
    const selected = new Set(selectedIds);
    const present = new Set<EntityId>();

    for (const entity of world.entities()) {
      present.add(entity.id);
      let display = this.displays.get(entity.id);
      if (display === undefined) {
        display = this.create(entity);
        this.displays.set(entity.id, display);
      }
      this.update(display, entity, selected.has(entity.id), deltaSeconds, isVisible(entity));
    }

    for (const [id, display] of this.displays) {
      if (!present.has(id)) {
        for (const mesh of display.pickableMeshes) {
          this.meshOwners.delete(mesh.uniqueId);
        }
        display.root.dispose(false, false);
        this.displays.delete(id);
      }
    }
  }

  /** The entity a picked mesh belongs to, or `null` when the mesh is not an entity's. */
  public entityIdOfMesh(mesh: { uniqueId: number } | null): EntityId | null {
    return mesh === null ? null : (this.meshOwners.get(mesh.uniqueId) ?? null);
  }

  /** Where a marker above `id` should sit, in scene units above the ground. */
  public modelHeightOf(id: EntityId): number {
    return this.displays.get(id)?.modelHeight ?? 0;
  }

  public dispose(): void {
    for (const display of this.displays.values()) {
      display.root.dispose(false, false);
    }
    this.displays.clear();
    this.meshOwners.clear();
    this.soldierKit.dispose();
  }

  private create(entity: ReadonlyEntity): EntityDisplay {
    const root = new TransformNode(`entity:${entity.id}`, this.scene);

    if (isInfantry(entity)) {
      const parts = this.soldierKit.partsFor(entity.owner);
      const soldiers = squadFormationSlots(SQUAD_CONFIG.formation).map((slot, index) =>
        instantiateSoldier(this.scene, parts, root, slot, `entity:${entity.id}:soldier${index}`),
      );
      const pickableMeshes = soldiers.flatMap((soldier) => soldier.meshes);
      const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
      const bar = this.createBar(entity.id, root, parts.standHeightTiles);
      this.registerPickable(pickableMeshes, entity.id);

      return {
        kind: 'squad',
        root,
        soldiers,
        bar: bar.node,
        barFill: bar.fill,
        barRest: bar.rest,
        barWidth,
        modelHeight: parts.standHeightTiles,
        pickableMeshes,
        animation: { walkPhaseRadians: 0, elapsedSeconds: 0 },
      };
    }

    const model = this.models.modelFor(entity);
    const mesh = model.mesh.clone(`entity:${entity.id}:model`, root);
    mesh.setEnabled(true);
    mesh.isPickable = true;
    this.registerPickable([mesh], entity.id);

    const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
    const bar = this.createBar(entity.id, root, model.height);

    return {
      kind: 'model',
      root,
      bar: bar.node,
      barFill: bar.fill,
      barRest: bar.rest,
      barWidth,
      modelHeight: model.height,
      pickableMeshes: [mesh],
    };
  }

  private registerPickable(meshes: readonly Mesh[], id: EntityId): void {
    for (const mesh of meshes) {
      this.meshOwners.set(mesh.uniqueId, id);
      this.onMeshCreated(mesh);
    }
  }

  private createBar(id: EntityId, root: TransformNode, modelHeight: number): Bar {
    const node = new TransformNode(`entity:${id}:bar`, this.scene);
    node.parent = root;
    node.position = new Vector3(0, modelHeight + BAR_GAP, 0);
    node.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    // Two quads side by side rather than one over the other: coplanar overlapping quads fight for
    // depth, and a bar that flickers is worse than no bar at all.
    const fill = this.createBarQuad(`entity:${id}:barFill`, node);
    const rest = this.createBarQuad(`entity:${id}:barRest`, node);
    rest.material = this.materials.unlit(BAR_BACKING);

    return { node, fill, rest };
  }

  private createBarQuad(name: string, parent: TransformNode): Mesh {
    const quad = CreatePlane(name, { width: 1, height: BAR_HEIGHT }, this.scene);
    quad.parent = parent;
    quad.isPickable = false;
    quad.renderingGroupId = OVERLAY_RENDERING_GROUP;
    return quad;
  }

  private update(
    display: EntityDisplay,
    entity: ReadonlyEntity,
    selected: boolean,
    deltaSeconds: number,
    visible: boolean,
  ): void {
    // Written in place rather than reassigned: this runs for every entity, every frame.
    display.root.position.set(
      this.space.sceneX(entity.position.x),
      0,
      this.space.sceneZ(entity.position.y),
    );
    if (entity.kind === 'unit') {
      // Unit model local +Z is core north, so this yaw directly maps the core heading to Babylon.
      display.root.rotation.y = entity.facingRadians;
    }

    // Disabled roots are neither drawn nor picked, but stay allocated so an enemy can reappear
    // without recreating model geometry or changing its stable mesh-to-entity mapping.
    display.root.setEnabled(visible);
    if (!visible) {
      display.bar.setEnabled(false);
      return;
    }

    const alive = isAlive(entity);
    const constructing = entity.kind === 'building' && entity.status === 'constructing';
    const visibility = !alive ? DEAD_VISIBILITY : constructing ? CONSTRUCTING_VISIBILITY : 1;
    for (const mesh of display.pickableMeshes) {
      mesh.visibility = visibility;
    }
    // A building under construction rises out of the ground as it completes, rather than standing
    // at full height (and looking finished) the instant its site is placed.
    display.root.scaling.y = constructing
      ? Math.max(entity.constructionProgress, MIN_CONSTRUCTION_SCALE)
      : 1;

    if (display.kind === 'squad' && entity.kind === 'unit') {
      this.updateSquadAnimation(display, entity, deltaSeconds);
    }

    const fraction = clamp(healthFraction(entity), 0, 1);
    const show = shouldShowHealthBar(fraction, selected) && alive;
    display.bar.setEnabled(show);
    if (!show) {
      return;
    }

    const filled = display.barWidth * fraction;
    display.barFill.scaling.x = Math.max(filled, 1e-4);
    display.barFill.position.x = (filled - display.barWidth) / 2;
    display.barFill.material = this.materials.unlit(healthTone(fraction));

    const rest = display.barWidth - filled;
    display.barRest.setEnabled(rest > 1e-3);
    display.barRest.scaling.x = Math.max(rest, 1e-4);
    display.barRest.position.x = display.barWidth / 2 - rest / 2;
  }

  /**
   * Drives the walk cycle from the entity's own `status`: legs and the rifle arm swing while
   * `moving`, and freeze — rather than snap to rest — the instant it stops, so idle sway picks up
   * from wherever the stride left off.
   */
  private updateSquadAnimation(display: SquadDisplay, entity: ReadonlyUnit, deltaSeconds: number): void {
    const moving = entity.status === 'moving';
    if (moving) {
      display.animation.walkPhaseRadians =
        (display.animation.walkPhaseRadians +
          deltaSeconds * SQUAD_CONFIG.walkCyclesPerSecond * Math.PI * 2) %
        (Math.PI * 2);
    }
    display.animation.elapsedSeconds += deltaSeconds;

    display.soldiers.forEach((soldier, index) => {
      const phaseOffset = index * SQUAD_CONFIG.soldierPhaseOffsetRadians;
      const pose = moving
        ? walkPose(display.animation.walkPhaseRadians + phaseOffset, SQUAD_CONFIG)
        : idlePose(display.animation.elapsedSeconds + phaseOffset, SQUAD_CONFIG);
      soldier.legLeftPivot.rotation.x = pose.legLeftRadians;
      soldier.legRightPivot.rotation.x = pose.legRightRadians;
      soldier.armPivot.rotation.x = pose.armRadians;
      soldier.bob.position.y = pose.bobTiles;
    });
  }

  /** How wide the entity is on the ground, in tiles: its footprint, or the body its config gives it. */
  private displayWidth(entity: ReadonlyEntity): number {
    return entity.kind === 'building' ? entity.footprint.width : entity.stats.bodySizeTiles;
  }
}
