/**
 * Turning a valid placement into a completed building: spending Credits, sending the assigned
 * Worker to the site, advancing progress only while that Worker is there, and completing,
 * cancelling or destroying the site.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import type { Economy } from './economy';
import { isAlive, type ReadonlyUnit } from './entities';
import { tileRectContains, type TileCoord, type TileRect } from './geometry';
import type { BuildingTypeId, EntityId, FactionId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isUnderBuilding } from './matchSetup';
import { advanceAlongRoute } from './movement';
import { buildOrder, type MoveRoute } from './orders';
import { planRoute } from './pathfinding';
import { checkBuildingPlacement, type PlacementInvalidReason } from './placement';
import { checkPrerequisites } from './prerequisites';
import type { World } from './world';

/** How close the assigned Worker must stand to the site to count as arrived. */
const ARRIVAL_TOLERANCE_TILES = 0.15;

export type ConstructionBlockedReason = PlacementInvalidReason | 'missing-prerequisite' | 'insufficient-credits' | 'unreachable';

export interface ConstructionCheck {
  readonly allowed: boolean;
  readonly reasons: readonly ConstructionBlockedReason[];
}

/**
 * Everything that must hold for `player` to start `buildingType` at `topLeft` right now, short of
 * whether a route to it actually exists for a specific Worker (`startConstruction` checks that).
 */
export function checkConstructionStart(
  world: World,
  grid: MapGrid,
  economy: { canAfford(player: PlayerId, amount: number): boolean },
  player: PlayerId,
  buildingType: BuildingTypeId,
  topLeft: TileCoord,
): ConstructionCheck {
  const reasons: ConstructionBlockedReason[] = [...checkBuildingPlacement(world, grid, buildingType, topLeft).reasons];

  if (!checkPrerequisites(world, player, buildingType).allowed) {
    reasons.push('missing-prerequisite');
  }
  if (!economy.canAfford(player, BUILDING_CONFIG[buildingType].cost)) {
    reasons.push('insufficient-credits');
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Spends the configured cost, raises a `constructing` site at `topLeft`, and sends `workerId` to
 * build it. Returns the new building's id, or `null` without changing anything when placement,
 * prerequisites, affordability or reachability fail.
 */
export function startConstruction(
  world: World,
  grid: MapGrid,
  economy: Economy,
  player: PlayerId,
  faction: FactionId,
  buildingType: BuildingTypeId,
  topLeft: TileCoord,
  workerId: EntityId,
): EntityId | null {
  const worker = world.unit(workerId);
  if (worker === undefined || worker.owner !== player || worker.type !== 'worker' || !isAlive(worker)) {
    return null;
  }
  if (!checkConstructionStart(world, grid, economy, player, buildingType, topLeft).allowed) {
    return null;
  }

  const config = BUILDING_CONFIG[buildingType];
  const rect: TileRect = { tx: topLeft.tx, ty: topLeft.ty, width: config.footprint.width, height: config.footprint.height };
  // The site does not exist as a building yet, so its prospective footprint has to be blocked by
  // hand — otherwise the route search would happily walk the Worker straight through where it will
  // stand the moment it is created.
  const isBlocked = (tile: TileCoord): boolean => isUnderBuilding(world, tile) || tileRectContains(rect, tile);
  const siteTile: TileCoord = {
    tx: topLeft.tx + Math.floor(config.footprint.width / 2),
    ty: topLeft.ty + Math.floor(config.footprint.height / 2),
  };
  const route = routeToSite(grid, worker.position, siteTile, isBlocked);
  if (route === undefined) {
    return null;
  }

  if (!economy.spend(player, config.cost)) {
    // Cannot happen given the affordability check above, but a failed spend must never create a
    // free building.
    return null;
  }

  const building = world.createBuilding({
    type: buildingType,
    owner: player,
    faction,
    topLeft,
    status: 'constructing',
    constructionProgress: 0,
  });

  world.setOrder(worker.id, buildOrder(buildingType, topLeft, building.id, route));
  world.setStatus(worker.id, route === null ? 'constructing' : 'moving');

  return building.id;
}

/** Advances every in-progress construction site by `deltaSeconds`, driven by its assigned Worker. */
// eslint-disable-next-line complexity -- Construction progress retains ordered completion and cancellation transitions.
export function stepConstruction(world: World, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return;
  }

  for (const building of world.buildings()) {
    if (!isAlive(building) || building.status !== 'constructing') {
      continue;
    }
    const worker = assignedWorker(world, building.id);
    // No Worker is currently building this site: progress is paused, not reset.
    if (worker === undefined || worker.order?.kind !== 'Build') {
      continue;
    }
    const order = worker.order;

    if (order.route !== null) {
      const tolerance = ARRIVAL_TOLERANCE_TILES * world.tileSizePixels;
      const budget = worker.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
      const step = advanceAlongRoute(order.route.waypoints, order.route.waypointIndex, worker.position, budget, tolerance);

      if (step.position.x !== worker.position.x || step.position.y !== worker.position.y) {
        world.setPosition(worker.id, step.position);
      }
      if (step.heading !== null) {
        world.setFacingRadians(worker.id, step.heading);
      }

      if (step.arrived) {
        world.setOrder(worker.id, buildOrder(order.buildingType, order.topLeft, order.buildingId, null));
        world.setStatus(worker.id, 'constructing');
      } else if (step.waypointIndex !== order.route.waypointIndex) {
        world.setOrder(
          worker.id,
          buildOrder(order.buildingType, order.topLeft, order.buildingId, {
            ...order.route,
            waypointIndex: step.waypointIndex,
          }),
        );
      }
      continue;
    }

    const progress = building.constructionProgress + deltaSeconds / building.stats.buildTimeSeconds;
    world.setConstructionProgress(building.id, progress);
    if (progress >= 1) {
      world.setStatus(building.id, 'idle');
      world.setOrder(worker.id, null);
      world.setStatus(worker.id, 'idle');
    }
  }
}

/**
 * Cancels an in-progress site: refunds the configured share of its cost, frees its assigned Worker,
 * and removes it, clearing its footprint occupancy. Fails harmlessly for a finished building (which
 * is destroyed by combat, not cancelled) or one already gone.
 */
export function cancelConstruction(world: World, economy: Economy, buildingId: EntityId): boolean {
  const building = world.building(buildingId);
  if (building === undefined || !isAlive(building) || building.status !== 'constructing') {
    return false;
  }

  economy.refund(building.owner, building.stats.cost);

  const worker = assignedWorker(world, buildingId);
  if (worker !== undefined) {
    world.setOrder(worker.id, null);
    world.setStatus(worker.id, 'idle');
  }
  world.remove(buildingId);
  return true;
}

function assignedWorker(world: World, buildingId: EntityId): ReadonlyUnit | undefined {
  return world.units().find((unit) => isAlive(unit) && unit.order?.kind === 'Build' && unit.order.buildingId === buildingId);
}

/**
 * A route to the site's own tile, or `null` when the Worker is already standing close enough not to
 * need one, or `undefined` when the site has no reachable approach at all.
 */
function routeToSite(
  grid: MapGrid,
  from: { x: number; y: number },
  siteTile: TileCoord,
  isBlocked: (tile: TileCoord) => boolean,
): MoveRoute | null | undefined {
  const startTile = grid.worldToTile(from);
  const plan = planRoute(grid, startTile, siteTile, isBlocked);
  if (!plan.found) {
    return undefined;
  }
  const waypoints = plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty));
  return waypoints.length === 0
    ? null
    : { resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty), waypoints, waypointIndex: 0 };
}
