import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../core/entities';
import type { EntityId } from '../core/ids';
import type { MaterialLibrary } from './materials';
import { MARKER_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * One small, faint marker per selected unit following an accepted group Move order, at that unit's
 * own resolved formation slot. `OrderMarkerView` still draws the single main ring at the point the
 * player actually clicked; this view only adds the per-unit spread underneath it, so a group's
 * individual destinations stay readable without permanent clutter once units arrive.
 *
 * A mesh pool keyed by entity id, following `EntitiesView`'s mirror pattern: a marker is created the
 * first time a unit needs one, repositioned every frame it still qualifies, and disposed the instant
 * it does not — the unit's order clears, its status stops being `moving`, or it leaves the selection.
 */

const MARKER_HEIGHT = 0.04;
const MARKER_DIAMETER = 0.4;
const MARKER_THICKNESS = 0.04;
const MARKER_ALPHA = 0.55;

export class SlotMarkerView {
  private readonly rings = new Map<EntityId, Mesh>();

  public constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly space: SceneSpace,
  ) {}

  /** Shows a marker at each selected unit's own resolved slot while it is actively moving there. */
  public update(entities: readonly ReadonlyEntity[]): void {
    const wanted = new Set<EntityId>();

    for (const entity of entities) {
      if (entity.order?.kind !== 'Move' || entity.status !== 'moving') {
        continue;
      }
      wanted.add(entity.id);
      const ring = this.ringFor(entity.id);
      const slot = entity.order.route.resolvedTarget;
      ring.position.set(this.space.sceneX(slot.x), MARKER_HEIGHT, this.space.sceneZ(slot.y));
      ring.setEnabled(true);
    }

    for (const [id, ring] of this.rings) {
      if (!wanted.has(id)) {
        ring.dispose();
        this.rings.delete(id);
      }
    }
  }

  public dispose(): void {
    for (const ring of this.rings.values()) {
      ring.dispose();
    }
    this.rings.clear();
  }

  private ringFor(id: EntityId): Mesh {
    const existing = this.rings.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const ring = CreateTorus(
      `marker:slot:${id}`,
      { diameter: MARKER_DIAMETER, thickness: MARKER_THICKNESS, tessellation: 16 },
      this.scene,
    );
    ring.isPickable = false;
    ring.material = this.materials.unlit(MARKER_TONES.move, MARKER_ALPHA);
    this.rings.set(id, ring);
    return ring;
  }
}
