/**
 * Where an entity's current order should be marked on the ground, and with which mark.
 *
 * A player needs to see where the thing they selected is going, so the marker follows the selected
 * entity's own order rather than the last click: it is state, not a one-off animation, and it is
 * right again after a restart or a re-selection.
 *
 * Orders that have no single point on the map — production, and construction, which gets its own
 * placement feedback — are deliberately unmarked.
 *
 * Pure and renderer-free, so the rule can be tested without starting the game.
 */
import type { ReadonlyEntity } from '../core/entities';
import type { Vec2 } from '../core/geometry';
import type { EntityId } from '../core/ids';

export type OrderMarkerKind = 'move' | 'attackMove' | 'attack';

export interface OrderMarker {
  readonly kind: OrderMarkerKind;
  /** World position the mark is drawn at. */
  readonly position: Vec2;
}

/**
 * The mark for `entity`'s current order, or `null` when it has none worth marking.
 *
 * `positionOf` resolves an attack target's id, because an Attack order names an entity rather than
 * a place; it returns `null` for a target that is gone, and so does this.
 */
export function orderMarkerFor(
  entity: ReadonlyEntity | null,
  positionOf: (id: EntityId) => Vec2 | null,
): OrderMarker | null {
  const order = entity?.order ?? null;
  if (order === null) {
    return null;
  }

  switch (order.kind) {
    case 'Move':
      return { kind: 'move', position: order.target };
    case 'AttackMove':
      return { kind: 'attackMove', position: order.target };
    case 'Attack': {
      const position = positionOf(order.targetId);
      return position === null ? null : { kind: 'attack', position };
    }
    case 'Build':
    case 'Produce':
      return null;
  }
}
