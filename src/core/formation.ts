/**
 * Group Move orders: spreads a selected group across a square/grid of destination slots around the
 * clicked point instead of sending every unit to the same exact tile.
 *
 * A single selected unit needs none of this, so that case is handed straight to `issueMoveOrders`
 * and behaves exactly as it always has. For a group, slot index i is assigned to the i-th unit that
 * still qualifies to move, in selected order, so the arrangement is stable and reproducible. Each
 * slot then resolves to the nearest free, reachable tile the way `issueMoveOrders` resolves a single
 * destination, except a slot already claimed by an earlier unit in the same order is refused too.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { FORMATION_CONFIG } from '../config/formation';
import type { FormationConfig } from '../config/types';
import { isAlive, type ReadonlyUnit } from './entities';
import type { TileCoord, Vec2 } from './geometry';
import type { EntityId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isUnderBuilding, nearbyFreeTiles } from './matchSetup';
import { issueMoveOrders } from './movement';
import { moveOrder } from './orders';
import { findPath, type TileBlockedPredicate } from './pathfinding';
import type { World } from './world';

/**
 * Ideal, unclamped world positions for a square/grid formation of `count` slots centred on `origin`.
 * Slot index i is the i-th selected unit's ideal destination; callers resolve each to a real tile
 * separately. Deterministic and renderer-free: the same inputs always produce the same layout.
 */
export function formationSlotPositions(
  origin: Vec2,
  count: number,
  spacingWorldUnits: number,
): readonly Vec2[] {
  if (count <= 0) {
    return [];
  }
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);

  const slots: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    slots.push({
      x: origin.x + (column - (columns - 1) / 2) * spacingWorldUnits,
      y: origin.y + (row - (rows - 1) / 2) * spacingWorldUnits,
    });
  }
  return slots;
}

/**
 * Routes each selected mobile friendly unit to its own slot in a formation centred on `target`,
 * around blocked terrain, building footprints and the slots already claimed by other units in this
 * same call. One or zero selected units reduce exactly to `issueMoveOrders`, so single-unit Move
 * behaves precisely as it always has. A unit whose slot cannot be resolved keeps its previous order
 * and status untouched rather than being sent partway or stopped; so does anything beyond the
 * configured `maxGroupSize`.
 */
export function issueGroupMoveOrders(
  world: World,
  grid: MapGrid,
  player: PlayerId,
  selectedIds: readonly EntityId[],
  rawTarget: Vec2,
  config: FormationConfig = FORMATION_CONFIG,
): readonly EntityId[] {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length <= 1) {
    return issueMoveOrders(world, grid, player, uniqueIds, rawTarget);
  }
  if (!Number.isFinite(rawTarget.x) || !Number.isFinite(rawTarget.y)) {
    return [];
  }
  const targetTile = grid.worldToTile(rawTarget);
  if (!grid.isInBounds(targetTile.tx, targetTile.ty)) {
    return [];
  }
  // Copied so a caller mutating its own target object afterward cannot change an accepted order.
  const target = { x: rawTarget.x, y: rawTarget.y };

  const movable: ReadonlyUnit[] = [];
  // TODO(post-MVP): a selection larger than maxGroupSize is capped, not split into waves.
  for (const id of uniqueIds.slice(0, config.maxGroupSize)) {
    const unit = world.unit(id);
    if (
      unit &&
      unit.owner === player &&
      isAlive(unit) &&
      unit.health > 0 &&
      Number.isFinite(unit.stats.speedTilesPerSecond) &&
      unit.stats.speedTilesPerSecond > 0
    ) {
      movable.push(unit);
    }
  }
  if (movable.length === 0) {
    return [];
  }

  const widestBodySizeTiles = movable.reduce((widest, unit) => Math.max(widest, unit.stats.bodySizeTiles), 0);
  const spacingWorldUnits = (widestBodySizeTiles + config.slotGapTiles) * grid.tileSizePixels;
  const slots = formationSlotPositions(target, movable.length, spacingWorldUnits);

  const isBlocked: TileBlockedPredicate = (tile) => isUnderBuilding(world, tile);
  const searchDiameter = config.nearbySlotSearchRadiusTiles * 2 + 1;
  const maxCandidates = searchDiameter * searchDiameter;
  const claimed = new Set<string>();
  const accepted: EntityId[] = [];

  for (let i = 0; i < movable.length; i++) {
    const unit = movable[i] as ReadonlyUnit;
    const idealTile = grid.worldToTile(slots[i] as Vec2);
    const startTile = grid.worldToTile(unit.position);
    const isFreeSlot = (tile: TileCoord): boolean => !isBlocked(tile) && !claimed.has(tileKey(tile));
    const candidates = nearbyFreeTiles(grid, idealTile, maxCandidates, isFreeSlot, config.nearbySlotSearchRadiusTiles);

    let resolvedTile: TileCoord | null = null;
    let waypointTiles: readonly TileCoord[] = [];
    for (const candidate of candidates) {
      const path = findPath(grid, startTile, candidate, isBlocked);
      if (path.found) {
        resolvedTile = candidate;
        waypointTiles = path.tiles.slice(1);
        break;
      }
    }
    if (resolvedTile === null) {
      continue;
    }

    claimed.add(tileKey(resolvedTile));
    const resolvedTarget = grid.tileCenter(resolvedTile.tx, resolvedTile.ty);
    const waypoints = waypointTiles.map((tile) => grid.tileCenter(tile.tx, tile.ty));
    world.setOrder(unit.id, moveOrder(target, { resolvedTarget, waypoints, waypointIndex: 0 }));
    world.setStatus(unit.id, 'moving');
    accepted.push(unit.id);
  }

  return accepted;
}

function tileKey(tile: TileCoord): string {
  return `${tile.tx},${tile.ty}`;
}
