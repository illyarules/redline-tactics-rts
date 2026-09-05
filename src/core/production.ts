/**
 * FIFO unit production: queue a paid request at a completed building, advance only its front item,
 * and create the finished unit on a nearby free map tile. This module is deliberately renderer-free.
 */
import { PRODUCTION_CONFIG } from '../config/production';
import type { ProductionConfig } from '../config/types';
import type { Economy } from './economy';
import { isAlive, type ProductionQueueItem, type ReadonlyBuilding } from './entities';
import { resolveUnitStats } from './factionStats';
import type { EntityId, PlayerId, UnitTypeId } from './ids';
import { nearbyFreeTiles, isUnderBuilding } from './matchSetup';
import type { MapGrid } from './map';
import { isProductionActive } from './power';
import { isCompleted } from './prerequisites';
import type { World } from './world';

export type ProductionBlockedReason =
  | 'invalid-building'
  | 'not-owner'
  | 'incomplete-building'
  | 'unsupported-unit'
  | 'queue-full'
  | 'insufficient-credits';

export interface ProductionCheck {
  readonly allowed: boolean;
  readonly reason: ProductionBlockedReason | null;
}

/** Reasons a queued row cannot be cancelled. */
export type CancelProductionResult =
  | { readonly cancelled: true; readonly refunded: number }
  | { readonly cancelled: false; readonly reason: 'invalid-building' | 'invalid-queue-index' };

/** Checks a request without changing Credits or queue state, for HUD affordances and tests. */
export function checkProductionRequest(
  world: World,
  economy: Economy,
  player: PlayerId,
  buildingId: EntityId,
  unitType: UnitTypeId,
  config: ProductionConfig = PRODUCTION_CONFIG,
): ProductionCheck {
  const building = world.building(buildingId);
  if (building === undefined || !isAlive(building)) return { allowed: false, reason: 'invalid-building' };
  if (building.owner !== player) return { allowed: false, reason: 'not-owner' };
  if (!isCompleted(building)) return { allowed: false, reason: 'incomplete-building' };
  if (!building.stats.produces.includes(unitType)) return { allowed: false, reason: 'unsupported-unit' };
  if (building.productionQueue.length >= config.queueCapacity) return { allowed: false, reason: 'queue-full' };
  const cost = resolveUnitStats(unitType, building.faction).cost;
  if (!economy.canAfford(player, cost)) return { allowed: false, reason: 'insufficient-credits' };
  return { allowed: true, reason: null };
}

/**
 * Pays for and appends one unit. A Factory may accept a request while power is down; the front item
 * simply remains paused until a Power Plant is available, which avoids losing a valid paid request.
 */
export function queueProduction(
  world: World,
  economy: Economy,
  player: PlayerId,
  buildingId: EntityId,
  unitType: UnitTypeId,
  config: ProductionConfig = PRODUCTION_CONFIG,
): ProductionCheck {
  const check = checkProductionRequest(world, economy, player, buildingId, unitType, config);
  if (!check.allowed) return check;

  const building = world.building(buildingId);
  // `check` above established this; retaining the guard keeps this function safe if the world is
  // changed by a caller between the two operations.
  if (building === undefined) return { allowed: false, reason: 'invalid-building' };
  const paidCost = resolveUnitStats(unitType, building.faction).cost;
  if (!economy.spend(player, paidCost)) return { allowed: false, reason: 'insufficient-credits' };

  world.setProductionQueue(building.id, [
    ...building.productionQueue,
    { unitType, elapsedSeconds: 0, paidCost },
  ]);
  world.setStatus(building.id, 'producing');
  return { allowed: true, reason: null };
}

/** Cancels exactly one paid queue row and refunds the normal configured share of its paid cost. */
export function cancelProduction(
  world: World,
  economy: Economy,
  buildingId: EntityId,
  queueIndex: number,
): CancelProductionResult {
  const building = world.building(buildingId);
  if (building === undefined || !isAlive(building)) {
    return { cancelled: false, reason: 'invalid-building' };
  }
  if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= building.productionQueue.length) {
    return { cancelled: false, reason: 'invalid-queue-index' };
  }
  const item = building.productionQueue[queueIndex]!;
  const queue = building.productionQueue.filter((_, index) => index !== queueIndex);
  world.setProductionQueue(building.id, queue);
  if (queue.length === 0 && building.status === 'producing') {
    world.setStatus(building.id, 'idle');
  }
  return { cancelled: true, refunded: economy.refund(building.owner, item.paidCost) };
}

/** Advances the one front item at each active producer. Completed units wait in place if blocked. */
export function stepProduction(
  world: World,
  grid: MapGrid,
  deltaSeconds: number,
  config: ProductionConfig = PRODUCTION_CONFIG,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;

  for (const building of world.buildings()) {
    if (!isAlive(building) || !isCompleted(building) || building.productionQueue.length === 0) continue;
    if (!isProductionActive(world, building.owner, building.stats.requiresPower)) continue;

    const front = building.productionQueue[0]!;
    const buildTimeSeconds = resolveUnitStats(front.unitType, building.faction).buildTimeSeconds;
    const elapsedSeconds = Math.min(buildTimeSeconds, front.elapsedSeconds + deltaSeconds);
    if (elapsedSeconds < buildTimeSeconds) {
      replaceFront(world, building, { ...front, elapsedSeconds });
      world.setStatus(building.id, 'producing');
      continue;
    }

    const spawnTile = findSpawnTile(world, grid, building, config);
    if (spawnTile === undefined) {
      // Keep the completed front item at 100% rather than silently deleting a paid unit.
      replaceFront(world, building, { ...front, elapsedSeconds: buildTimeSeconds });
      world.setStatus(building.id, 'producing');
      continue;
    }

    world.createUnit({
      type: front.unitType,
      owner: building.owner,
      faction: building.faction,
      position: grid.tileCenter(spawnTile.tx, spawnTile.ty),
    });
    const remaining = building.productionQueue.slice(1);
    world.setProductionQueue(building.id, remaining);
    world.setStatus(building.id, remaining.length === 0 ? 'idle' : 'producing');
  }
}

function replaceFront(world: World, building: ReadonlyBuilding, front: ProductionQueueItem): void {
  world.setProductionQueue(building.id, [front, ...building.productionQueue.slice(1)]);
}

function findSpawnTile(
  world: World,
  grid: MapGrid,
  building: ReadonlyBuilding,
  config: ProductionConfig,
) {
  const origin = {
    tx: building.topLeft.tx + Math.floor(building.footprint.width / 2),
    ty: building.topLeft.ty + Math.floor(building.footprint.height / 2),
  };
  return nearbyFreeTiles(
    grid,
    origin,
    1,
    (tile) =>
      !isUnderBuilding(world, tile) &&
      !world.units().some((unit) => {
        const occupied = grid.worldToTile(unit.position);
        return occupied.tx === tile.tx && occupied.ty === tile.ty;
      }),
    config.spawnSearchRadiusTiles,
  )[0];
}
