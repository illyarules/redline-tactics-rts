import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../core/entities';
import type { EntityId } from '../core/ids';
import { color3, MARKER_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * A development aid: draws the remaining route of each selected, currently moving unit as a polyline.
 *
 * Off by default and cheap while off — it only ever looks at the entities the scene already resolved
 * for the current selection, and only draws anything once enabled.
 */

const ROUTE_HEIGHT = 0.08;

export class RouteDebugView {
  private readonly lines = new Map<EntityId, LinesMesh>();
  private enabled = false;

  public constructor(
    private readonly scene: Scene,
    private readonly space: SceneSpace,
  ) {}

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /** Redraws the route of every selected unit with an active Move order. Safe to call every frame. */
  public update(entities: readonly ReadonlyEntity[]): void {
    if (!this.enabled) {
      return;
    }

    const present = new Set<EntityId>();
    for (const entity of entities) {
      if (entity.kind !== 'unit' || entity.order?.kind !== 'Move') {
        continue;
      }
      const { route } = entity.order;
      const remaining = route.waypoints.slice(route.waypointIndex);
      if (remaining.length === 0) {
        continue;
      }

      present.add(entity.id);
      this.lines.get(entity.id)?.dispose();
      const points = [entity.position, ...remaining].map((point) => this.space.point(point, ROUTE_HEIGHT));
      const mesh = CreateLines(`route:${entity.id}`, { points }, this.scene);
      mesh.color = color3(MARKER_TONES.move);
      mesh.isPickable = false;
      this.lines.set(entity.id, mesh);
    }

    for (const [id, mesh] of this.lines) {
      if (!present.has(id)) {
        mesh.dispose();
        this.lines.delete(id);
      }
    }
  }

  public dispose(): void {
    this.clear();
  }

  private clear(): void {
    for (const mesh of this.lines.values()) {
      mesh.dispose();
    }
    this.lines.clear();
  }
}
