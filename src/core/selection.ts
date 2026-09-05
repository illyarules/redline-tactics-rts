/**
 * Picking: which entity is under a point, and whether the player may select it.
 *
 * The hit shapes match what `game/EntitiesView.ts` draws — a circle the size of a unit's body, and
 * a building's whole footprint — because both read the same config, not because they agree by luck.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { footprintRect, isAlive, isUnit, type ReadonlyEntity, type ReadonlyUnit } from './entities';
import { distanceSquared, pointToTile, rectContains, tileRectContains, type Rect, type Vec2 } from './geometry';
import type { EntityId, PlayerId } from './ids';
import type { World } from './world';

/** Stable IDs of the currently selected friendly entities, in selection order. */
export type Selection = readonly EntityId[];

/** Friendly, living units inside a world rectangle. Buildings are deliberately excluded. */
export function unitsInSelectionRect(world: World, rect: Rect, player: PlayerId): readonly EntityId[] {
  return world.units(player)
    .filter((unit) => isAlive(unit) && rectContains(rect, unit.position))
    .map((unit) => unit.id);
}

/** Applies a click or drag result. Shift toggles every proposed unit; empty non-shift clears. */
export function updateSelection(
  current: Selection,
  proposed: readonly EntityId[],
  additive: boolean,
): Selection {
  const next = new Set(current);
  if (!additive) return [...new Set(proposed)];
  for (const id of proposed) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

/** Removes gone and destroyed entities while retaining the order of surviving selections. */
export function pruneSelection(world: World, current: Selection, player: PlayerId): Selection {
  return current.filter((id) => {
    const entity = world.get(id);
    return entity !== undefined && entity.owner === player && isAlive(entity);
  });
}

/** Half a unit's drawn body, in world units. */
export function unitBodyRadius(unit: ReadonlyUnit, tileSizePixels: number): number {
  return (unit.stats.bodySizeTiles / 2) * tileSizePixels;
}

export function hitsEntity(entity: ReadonlyEntity, point: Vec2, tileSizePixels: number): boolean {
  if (isUnit(entity)) {
    const radius = unitBodyRadius(entity, tileSizePixels);
    return distanceSquared(entity.position, point) <= radius * radius;
  }
  // A building is clickable across its whole footprint, which is slightly larger than the inset
  // block drawn on top of it — clicks near the edge of a base should still land.
  return tileRectContains(footprintRect(entity), pointToTile(point, tileSizePixels));
}

/**
 * The entity a click lands on, matching what the player sees: units sit above buildings, and the
 * newer of two overlapping entities is the one on top. Destroyed entities cannot be picked.
 */
export function entityAtPoint(world: World, point: Vec2): ReadonlyEntity | null {
  let unitHit: ReadonlyEntity | null = null;
  let buildingHit: ReadonlyEntity | null = null;

  for (const entity of world.entities()) {
    if (!isAlive(entity) || !hitsEntity(entity, point, world.tileSizePixels)) {
      continue;
    }
    if (isUnit(entity)) {
      unitHit = entity;
    } else {
      buildingHit = entity;
    }
  }

  return unitHit ?? buildingHit;
}

/**
 * What a left-click selects: only the player's own entities are controllable, so a click on an
 * enemy or on open ground selects nothing and clears whatever was selected.
 */
export function selectableAtPoint(
  world: World,
  point: Vec2,
  player: PlayerId,
): ReadonlyEntity | null {
  const hit = entityAtPoint(world, point);
  return hit !== null && hit.owner === player ? hit : null;
}
