import type { ReadonlyEntity } from '../core/entities';
import type { EntityId } from '../core/ids';
import type { MapGrid } from '../core/map';
import type { ResourceFieldState } from '../core/resourceFieldState';
import type { World } from '../core/world';

/** Renderer input shared by local and remote matches. It cannot mutate authoritative gameplay. */
export interface BattleViewState {
  readonly entities: readonly ReadonlyEntity[];
  readonly selectedIds: readonly EntityId[];
  readonly fieldFractions: ReadonlyMap<string, number>;
  readonly isVisible: (entity: ReadonlyEntity) => boolean;
  readonly positionOfVisibleTarget: (id: EntityId) => ReadonlyEntity['position'] | null;
}

/** Projects the local authoritative world into the renderer's read-only boundary. */
export function localBattleViewState(
  world: World,
  grid: MapGrid,
  fields: ResourceFieldState,
  selectedIds: readonly EntityId[],
  isVisible: (entity: ReadonlyEntity) => boolean,
): BattleViewState {
  return {
    entities: world.entities(),
    selectedIds,
    fieldFractions: new Map(grid.resourceFields.map((field) => [
      field.id,
      fields.remaining(field.id) / field.credits,
    ])),
    isVisible,
    positionOfVisibleTarget(id) {
      const target = world.get(id);
      return target !== undefined && isVisible(target) ? target.position : null;
    },
  };
}
