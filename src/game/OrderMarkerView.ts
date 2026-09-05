import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../core/entities';
import type { Vec2 } from '../core/geometry';
import type { EntityId } from '../core/ids';
import type { MaterialLibrary } from './materials';
import { orderMarkerFor, type OrderMarkerKind } from './orderMarker';
import { MARKER_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The mark showing where the selected entity's order points.
 *
 * One ring for the whole scene, moved and re-coloured as the selection changes. `orderMarker.ts`
 * decides what to mark and where; this class only draws it. Move is calm and cool, the two
 * aggressive orders share a warmer tone.
 */

const MARKER_HEIGHT = 0.05;
const MARKER_DIAMETER = 0.7;
const MARKER_THICKNESS = 0.06;

const TONES: Readonly<Record<OrderMarkerKind, number>> = {
  move: MARKER_TONES.move,
  attackMove: MARKER_TONES.attackMove,
  attack: MARKER_TONES.attack,
};

export class OrderMarkerView {
  private readonly ring: Mesh;
  private drawn: OrderMarkerKind | null = null;

  public constructor(
    scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly space: SceneSpace,
  ) {
    this.ring = CreateTorus(
      'marker:order',
      { diameter: MARKER_DIAMETER, thickness: MARKER_THICKNESS, tessellation: 24 },
      scene,
    );
    this.ring.isPickable = false;
    this.ring.setEnabled(false);
  }

  /** Marks the shared selected-group destination while any selected unit carries it. */
  public update(entities: readonly ReadonlyEntity[], positionOf: (id: EntityId) => Vec2 | null): void {
    const marker = entities.map((entity) => orderMarkerFor(entity, positionOf)).find((value) => value !== null) ?? null;
    if (marker === null) {
      this.ring.setEnabled(false);
      this.drawn = null;
      return;
    }

    if (marker.kind !== this.drawn) {
      this.ring.material = this.materials.unlit(TONES[marker.kind], 0.9);
      this.drawn = marker.kind;
    }
    this.ring.position.set(
      this.space.sceneX(marker.position.x),
      MARKER_HEIGHT,
      this.space.sceneZ(marker.position.y),
    );
    this.ring.setEnabled(true);
  }

  public dispose(): void {
    this.ring.dispose();
  }
}
