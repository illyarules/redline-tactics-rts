import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { healthFraction, isAlive, type ReadonlyEntity } from '../core/entities';
import { clamp } from '../core/geometry';
import type { EntityId } from '../core/ids';
import type { World } from '../core/world';
import { shouldShowHealthBar } from './healthBar';
import type { MaterialLibrary } from './materials';
import type { ModelLibrary } from './models/library';
import { healthTone } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * Draws every entity the world holds, and nothing else.
 *
 * This view is a mirror: each frame it creates a display for a new entity id, moves and re-reads the
 * ones it already has, and disposes the ones the world no longer holds. It reads core state and
 * decides nothing — no damage, no costs, no prerequisites.
 *
 * Each entity is a clone of its role's prototype model plus a health bar that turns to face the
 * camera. The mesh carries its entity id, so a click on it can be resolved back to core state.
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

interface EntityDisplay {
  readonly root: TransformNode;
  readonly mesh: Mesh;
  readonly bar: TransformNode;
  readonly barFill: Mesh;
  readonly barRest: Mesh;
  readonly barWidth: number;
  /** How tall the model stands, in tiles. Markers and labels sit above it. */
  readonly modelHeight: number;
}

export class EntitiesView {
  private readonly displays = new Map<EntityId, EntityDisplay>();
  private readonly meshOwners = new Map<number, EntityId>();

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
    private readonly models: ModelLibrary,
    private readonly materials: MaterialLibrary,
    /** Called for each new model so the scene can make it cast a shadow. */
    private readonly onMeshCreated: (mesh: Mesh) => void,
  ) {}

  /**
   * Brings the display in line with the world. Safe to call every frame.
   *
   * `selectedId` is display state, not world state: it decides whether an entity shows its health
   * bar, and nothing else. The selection itself lives in `core/selection.ts`.
   */
  public sync(world: World, selectedIds: readonly EntityId[] = []): void {
    const selected = new Set(selectedIds);
    const present = new Set<EntityId>();

    for (const entity of world.entities()) {
      present.add(entity.id);
      let display = this.displays.get(entity.id);
      if (display === undefined) {
        display = this.create(entity);
        this.displays.set(entity.id, display);
      }
      this.update(display, entity, selected.has(entity.id));
    }

    for (const [id, display] of this.displays) {
      if (!present.has(id)) {
        this.meshOwners.delete(display.mesh.uniqueId);
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
  }

  private create(entity: ReadonlyEntity): EntityDisplay {
    const model = this.models.modelFor(entity);
    const root = new TransformNode(`entity:${entity.id}`, this.scene);

    const mesh = model.mesh.clone(`entity:${entity.id}:model`, root);
    mesh.setEnabled(true);
    mesh.isPickable = true;
    this.meshOwners.set(mesh.uniqueId, entity.id);
    this.onMeshCreated(mesh);

    const barWidth = clamp(this.displayWidth(entity) * 0.9, BAR_MIN_WIDTH, BAR_MAX_WIDTH);
    const bar = new TransformNode(`entity:${entity.id}:bar`, this.scene);
    bar.parent = root;
    bar.position = new Vector3(0, model.height + BAR_GAP, 0);
    bar.billboardMode = TransformNode.BILLBOARDMODE_ALL;

    // Two quads side by side rather than one over the other: coplanar overlapping quads fight for
    // depth, and a bar that flickers is worse than no bar at all.
    const barFill = this.createBarQuad(`entity:${entity.id}:barFill`, bar);
    const barRest = this.createBarQuad(`entity:${entity.id}:barRest`, bar);
    barRest.material = this.materials.unlit(BAR_BACKING);

    return { root, mesh, bar, barFill, barRest, barWidth, modelHeight: model.height };
  }

  private createBarQuad(name: string, parent: TransformNode): Mesh {
    const quad = CreatePlane(name, { width: 1, height: BAR_HEIGHT }, this.scene);
    quad.parent = parent;
    quad.isPickable = false;
    quad.renderingGroupId = OVERLAY_RENDERING_GROUP;
    return quad;
  }

  private update(display: EntityDisplay, entity: ReadonlyEntity, selected: boolean): void {
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

    const alive = isAlive(entity);
    display.mesh.visibility = alive ? 1 : DEAD_VISIBILITY;

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

  /** How wide the entity is on the ground, in tiles: its footprint, or the body its config gives it. */
  private displayWidth(entity: ReadonlyEntity): number {
    return entity.kind === 'building' ? entity.footprint.width : entity.stats.bodySizeTiles;
  }
}
