/**
 * The Worker gather loop: travel to a field, gather timed Credits, carry them to a drop-off,
 * deposit, and repeat until the field runs dry.
 *
 * A field's tiles and a Worker's speed both come from config; only the field's remaining Credits
 * (`ResourceFieldState`) and each Worker's `carriedCredits` change as the match plays out.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import { GATHER_CONFIG } from '../config/gather';
import type { GatherConfig } from '../config/types';
import { isAlive, type ReadonlyBuilding } from './entities';
import { distanceSquared, type TileCoord, type Vec2 } from './geometry';
import type { EntityId, PlayerId } from './ids';
import type { MapGrid, ResourceField } from './map';
import { isUnderBuilding, nearbyFreeTiles } from './matchSetup';
import { advanceAlongRoute } from './movement';
import { gatherOrder, type GatherOrder, type MoveRoute } from './orders';
import { planRoute } from './pathfinding';
import type { ResourceFieldState } from './resourceFieldState';
import type { World } from './world';

/** How close a Worker must stand to a field tile or a drop-off to count as arrived. */
const ARRIVAL_TOLERANCE_TILES = 0.15;
/** How far a drop-off's own free tile may be searched for, in tiles. */
const DROPOFF_SEARCH_RADIUS_TILES = 6;

/**
 * Sends `workerId` to gather from `fieldId`. Fails without changing anything when the unit is not a
 * living, owned Worker or the field has no reachable tile. Any Credits the Worker was already
 * carrying are deposited immediately, since redirecting it mid-return should not destroy them.
 */
export function issueGatherOrder(
  world: World,
  grid: MapGrid,
  economy: { earn(player: PlayerId, amount: number): void },
  player: PlayerId,
  workerId: EntityId,
  fieldId: string,
): boolean {
  const worker = world.unit(workerId);
  if (worker === undefined || worker.owner !== player || worker.type !== 'worker' || !isAlive(worker)) {
    return false;
  }
  const field = grid.resourceFields.find((candidate) => candidate.id === fieldId);
  if (field === undefined) {
    return false;
  }

  const route = routeToField(world, grid, worker.position, field);
  if (route === null) {
    return false;
  }

  if (worker.carriedCredits > 0) {
    economy.earn(worker.owner, worker.carriedCredits);
    world.setCarriedCredits(worker.id, 0);
  }

  world.setOrder(worker.id, gatherOrder(fieldId, 'toField', route));
  world.setStatus(worker.id, 'moving');
  return true;
}

/** Advances every Worker's Gather order by `deltaSeconds`. */
export function stepGather(
  world: World,
  grid: MapGrid,
  resourceFieldState: ResourceFieldState,
  economy: { earn(player: PlayerId, amount: number): void },
  deltaSeconds: number,
  config: GatherConfig = GATHER_CONFIG,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return;
  }

  for (const unit of world.units()) {
    if (!isAlive(unit) || unit.order?.kind !== 'Gather') {
      continue;
    }
    const order = unit.order;

    if (order.route !== null) {
      stepTravel(world, unit.id, order, deltaSeconds);
      continue;
    }

    switch (order.phase) {
      case 'gathering':
        stepGathering(world, grid, resourceFieldState, unit.id, order, deltaSeconds, config);
        break;
      case 'toField':
        // Arrived (route just cleared below): switch to gathering.
        world.setOrder(unit.id, gatherOrder(order.fieldId, 'gathering', null, 0));
        world.setStatus(unit.id, 'gathering');
        break;
      case 'toDropoff':
        deposit(world, grid, resourceFieldState, economy, unit.id, order);
        break;
    }
  }
}

function stepTravel(world: World, unitId: EntityId, order: GatherOrder, deltaSeconds: number): void {
  const unit = world.unit(unitId);
  if (unit === undefined || order.route === null) {
    return;
  }
  const tolerance = ARRIVAL_TOLERANCE_TILES * world.tileSizePixels;
  const budget = unit.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
  const step = advanceAlongRoute(order.route.waypoints, order.route.waypointIndex, unit.position, budget, tolerance);

  if (step.position.x !== unit.position.x || step.position.y !== unit.position.y) {
    world.setPosition(unitId, step.position);
  }
  if (step.heading !== null) {
    world.setFacingRadians(unitId, step.heading);
  }

  if (step.arrived) {
    world.setOrder(unitId, gatherOrder(order.fieldId, order.phase, null, order.gatherElapsedSeconds, order.dropoffId));
  } else if (step.waypointIndex !== order.route.waypointIndex) {
    world.setOrder(
      unitId,
      gatherOrder(order.fieldId, order.phase, { ...order.route, waypointIndex: step.waypointIndex }, order.gatherElapsedSeconds, order.dropoffId),
    );
  }
}

function stepGathering(
  world: World,
  grid: MapGrid,
  resourceFieldState: ResourceFieldState,
  unitId: EntityId,
  order: GatherOrder,
  deltaSeconds: number,
  config: GatherConfig,
): void {
  const elapsed = order.gatherElapsedSeconds + deltaSeconds;
  if (elapsed < config.gatherSeconds) {
    world.setOrder(unitId, gatherOrder(order.fieldId, 'gathering', null, elapsed));
    return;
  }

  const taken = resourceFieldState.take(order.fieldId, config.workerCapacityCredits);
  if (taken <= 0) {
    // Depleted while this cycle was running: stand down cleanly instead of hauling nothing.
    world.setOrder(unitId, null);
    world.setStatus(unitId, 'idle');
    return;
  }
  world.setCarriedCredits(unitId, taken);

  const unit = world.unit(unitId);
  const dropoff = unit === undefined ? undefined : nearestDropoff(world, unit.owner, unit.position);
  if (unit === undefined || dropoff === undefined) {
    // No reachable drop-off exists right now (e.g. it was just destroyed). Keep the load and wait;
    // the next tick tries again rather than losing the gathered Credits.
    world.setOrder(unitId, gatherOrder(order.fieldId, 'gathering', null, config.gatherSeconds));
    return;
  }

  const route = routeToDropoff(world, grid, unit.position, dropoff);
  if (route === null) {
    world.setOrder(unitId, gatherOrder(order.fieldId, 'gathering', null, config.gatherSeconds));
    return;
  }

  world.setOrder(unitId, gatherOrder(order.fieldId, 'toDropoff', route, 0, dropoff.id));
  world.setStatus(unitId, 'moving');
}

function deposit(
  world: World,
  grid: MapGrid,
  resourceFieldState: ResourceFieldState,
  economy: { earn(player: PlayerId, amount: number): void },
  unitId: EntityId,
  order: GatherOrder,
): void {
  const unit = world.unit(unitId);
  if (unit === undefined) {
    return;
  }

  const dropoffStillGood = order.dropoffId !== null && isLiveDropoff(world, order.dropoffId);
  if (!dropoffStillGood) {
    // The assigned drop-off died mid-return: retarget rather than depositing into nothing.
    const dropoff = nearestDropoff(world, unit.owner, unit.position);
    const route = dropoff === null || dropoff === undefined ? null : routeToDropoff(world, grid, unit.position, dropoff);
    if (dropoff === undefined || route === null) {
      world.setOrder(unitId, gatherOrder(order.fieldId, 'toDropoff', null, 0, null));
      return;
    }
    world.setOrder(unitId, gatherOrder(order.fieldId, 'toDropoff', route, 0, dropoff.id));
    return;
  }

  economy.earn(unit.owner, unit.carriedCredits);
  world.setCarriedCredits(unitId, 0);

  if (resourceFieldState.isDepleted(order.fieldId)) {
    world.setOrder(unitId, null);
    world.setStatus(unitId, 'idle');
    return;
  }

  const field = grid.resourceFields.find((candidate) => candidate.id === order.fieldId);
  const route = field === undefined ? null : routeToField(world, grid, unit.position, field);
  if (route === null) {
    world.setOrder(unitId, null);
    world.setStatus(unitId, 'idle');
    return;
  }

  world.setOrder(unitId, gatherOrder(order.fieldId, 'toField', route));
  world.setStatus(unitId, 'moving');
}

function isLiveDropoff(world: World, id: EntityId): boolean {
  const building = world.building(id);
  return building !== undefined && isAlive(building);
}

/** The closest living, owned building that accepts deliveries, or `undefined` when there is none. */
function nearestDropoff(world: World, player: PlayerId, from: Vec2): ReadonlyBuilding | undefined {
  let best: ReadonlyBuilding | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const building of world.buildings(player)) {
    if (!isAlive(building) || !BUILDING_CONFIG[building.type].acceptsDeliveries) {
      continue;
    }
    const distance = distanceSquared(building.position, from);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = building;
    }
  }
  return best;
}

function routeToField(world: World, grid: MapGrid, from: Vec2, field: ResourceField): MoveRoute | null {
  const startTile = grid.worldToTile(from);
  const targetTile = nearestFieldTile(startTile, field);
  const isBlocked = (tile: TileCoord): boolean => isUnderBuilding(world, tile);
  const plan = planRoute(grid, startTile, targetTile, isBlocked);
  if (!plan.found) {
    return null;
  }
  return {
    resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty),
    waypoints: plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty)),
    waypointIndex: 0,
  };
}

function routeToDropoff(world: World, grid: MapGrid, from: Vec2, dropoff: ReadonlyBuilding): MoveRoute | null {
  const startTile = grid.worldToTile(from);
  const isBlocked = (tile: TileCoord): boolean => isUnderBuilding(world, tile);
  const nearby = nearbyFreeTiles(grid, dropoff.topLeft, 1, (tile) => !isBlocked(tile), DROPOFF_SEARCH_RADIUS_TILES)[0];
  if (nearby === undefined) {
    return null;
  }
  const plan = planRoute(grid, startTile, nearby, isBlocked);
  if (!plan.found) {
    return null;
  }
  return {
    resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty),
    waypoints: plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty)),
    waypointIndex: 0,
  };
}

/** The field tile closest to `from`, so a Worker already inside the field does not walk to its centre. */
function nearestFieldTile(from: TileCoord, field: ResourceField): TileCoord {
  let best = field.center;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of field.tiles) {
    const dx = tile.tx - from.tx;
    const dy = tile.ty - from.ty;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}
