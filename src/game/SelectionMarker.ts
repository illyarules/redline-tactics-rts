import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../core/entities';
import type { EntityId } from '../core/ids';
import type { MaterialLibrary } from './materials';
import { MARKER_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The ring drawn around the selected entity.
 *
 * It lies flat on the ground rather than floating over the model, which is what makes it read as
 * marking a place on the field instead of hovering above it.
 *
 * One ring is kept per selected entity. Scaling a torus in the ground plane would stretch its tube,
 * so each ring is created at the entity's own footprint or body diameter.
 */

/** Just clear of the ground, so the ring never fights the field for depth. */
const RING_HEIGHT = 0.04;
const RING_THICKNESS = 0.09;
/** How far outside the entity the ring sits, in tiles. */
const RING_PADDING = 0.3;

export class SelectionMarker {
  private readonly rings = new Map<EntityId, Mesh>();

  public constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly space: SceneSpace,
  ) {}

  /** Puts one ground ring under every selected entity. */
  public update(entities: readonly ReadonlyEntity[]): void {
    const next = new Set<EntityId>();
    for (const entity of entities) {
      const ring = this.ringOf(entity.id, ringDiameter(entity));
      ring.position.set(this.space.sceneX(entity.position.x), RING_HEIGHT, this.space.sceneZ(entity.position.y));
      ring.setEnabled(true);
      next.add(entity.id);
    }
    for (const [id, ring] of this.rings) if (!next.has(id)) ring.setEnabled(false);
  }

  public dispose(): void {
    for (const ring of this.rings.values()) {
      ring.dispose();
    }
    this.rings.clear();
  }

  private ringOf(id: EntityId, diameter: number): Mesh {
    const existing = this.rings.get(id);
    if (existing !== undefined) {
      return existing;
    }

    const ring = this.newRing(diameter);
    this.rings.set(id, ring);
    return ring;
  }

  private newRing(diameter: number): Mesh {
    const ring = CreateTorus(
      `marker:selection:${diameter}`,
      { diameter, thickness: RING_THICKNESS, tessellation: 48 },
      this.scene,
    );
    ring.material = this.materials.unlit(MARKER_TONES.selection, 0.9);
    ring.isPickable = false;
    ring.setEnabled(false);
    return ring;
  }
}

/** Wide enough to sit clear of what it marks: a unit's body, or the longer side of a footprint. */
function ringDiameter(entity: ReadonlyEntity): number {
  const size =
    entity.kind === 'building'
      ? Math.max(entity.footprint.width, entity.footprint.height)
      : entity.stats.bodySizeTiles;
  return size + RING_PADDING * 2;
}
