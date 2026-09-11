import { MOVEMENT_CONFIG } from '../config/movement';
import type { MovementConfig } from '../config/types';
import { isAlive } from './entities';
import type { TileCoord, Vec2 } from './geometry';
import type { EntityId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isUnderBuilding } from './matchSetup';
import { moveOrder } from './orders';
import { planRoute } from './pathfinding';
import type { World } from './world';

const FULL_TURN = Math.PI * 2;

/** Heading for a core-world direction: zero is north, positive values turn east. */
export function headingForMovement(dx: number, dy: number): number | null {
  return dx === 0 && dy === 0 ? null : Math.atan2(dx, -dy);
}

/** Moves from `current` towards `target` along the shortest arc by at most `maxDelta`. */
export function turnTowards(current: number, target: number, maxDelta: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(maxDelta)) return current;
  const rawDifference = target - current;
  // Exactly opposite headings have two equal arcs; choose clockwise so replay results stay stable.
  const difference = Math.abs(Math.abs(rawDifference) % FULL_TURN - Math.PI) < 1e-10
    ? Math.PI
    : normalizeRadians(rawDifference);
  return normalizeRadians(current + Math.sign(difference) * Math.min(Math.abs(difference), Math.max(0, maxDelta)));
}

/**
 * Routes each selected mobile friendly unit toward `target`, around blocked terrain and building
 * footprints. A unit whose target has no reachable tile within the configured search radius keeps
 * its previous order and status untouched rather than being sent partway or stopped.
 */
export function issueMoveOrders(
  world: World,
  grid: MapGrid,
  player: PlayerId,
  selectedIds: readonly EntityId[],
  target: Vec2,
): readonly EntityId[] {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return [];
  const targetTile = grid.worldToTile(target);
  if (!grid.isInBounds(targetTile.tx, targetTile.ty)) return [];

  const isBlocked = (tile: TileCoord): boolean => isUnderBuilding(world, tile);
  const accepted: EntityId[] = [];
  for (const id of new Set(selectedIds)) {
    const unit = world.unit(id);
    if (!unit || unit.owner !== player || !isAlive(unit) || unit.health <= 0 ||
      !Number.isFinite(unit.stats.speedTilesPerSecond) || unit.stats.speedTilesPerSecond <= 0) continue;

    const plan = planRoute(grid, grid.worldToTile(unit.position), targetTile, isBlocked);
    if (!plan.found) continue;

    const resolvedTarget = grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty);
    const waypoints = plan.tiles.map((waypointTile) => grid.tileCenter(waypointTile.tx, waypointTile.ty));
    // Copy coordinates so callers cannot change an accepted destination afterward.
    world.setOrder(id, moveOrder({ x: target.x, y: target.y }, { resolvedTarget, waypoints, waypointIndex: 0 }));
    world.setStatus(id, 'moving');
    accepted.push(id);
  }
  return accepted;
}

export interface RouteAdvance {
  readonly position: Vec2;
  /** Index of the waypoint still ahead, or `waypoints.length` once the route is fully walked. */
  readonly waypointIndex: number;
  /** The heading faced this step, or `null` when there was no waypoint left to face. */
  readonly heading: number | null;
  /** True once `waypointIndex` reached the end of `waypoints`. */
  readonly arrived: boolean;
}

/**
 * Advances `position` toward `waypoints[waypointIndex]` and beyond by up to `budget` world units,
 * crossing several short waypoints in one call so results stay independent of frame partitioning.
 * `finalTolerance` shortens only the very last waypoint's approach, so a unit does not have to land
 * exactly on it to arrive. Shared by every system that walks a unit along a resolved route: direct
 * Move orders, and the travel legs of gathering and construction.
 */
export function advanceAlongRoute(
  waypoints: readonly Vec2[],
  waypointIndex: number,
  position: Vec2,
  budget: number,
  finalTolerance: number,
): RouteAdvance {
  let index = waypointIndex;
  let current = position;
  let remaining = budget;
  let heading: number | null = null;
  let headingTaken = false;

  while (index < waypoints.length) {
    const waypoint = waypoints[index] as Vec2;
    const dx = waypoint.x - current.x;
    const dy = waypoint.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (!headingTaken) {
      heading = headingForMovement(dx, dy);
      headingTaken = true;
    }

    const isFinalWaypoint = index === waypoints.length - 1;
    const travelToArrive = isFinalWaypoint ? Math.max(0, distance - finalTolerance) : distance;

    // A shortfall this small is float noise from dividing and re-multiplying by speed, not a real
    // gap: treating it as a gap would leave a unit stalled a hair short of its waypoint forever.
    if (remaining + 1e-9 < travelToArrive) {
      if (distance > 0 && remaining > 0) {
        current = { x: current.x + (dx / distance) * remaining, y: current.y + (dy / distance) * remaining };
      }
      break;
    }
    if (distance > 0) {
      current = { x: current.x + (dx / distance) * travelToArrive, y: current.y + (dy / distance) * travelToArrive };
    }
    remaining -= travelToArrive;
    index += 1;
  }

  return { position: current, waypointIndex: index, heading, arrived: index >= waypoints.length };
}

/**
 * Follows each unit's resolved route waypoint by waypoint at configured speed. Facing turns toward
 * whichever waypoint is current when the step begins. Arrival tolerance applies only to the final
 * waypoint; completion clears the order and leaves the unit idle.
 */
export function stepMovement(
  world: World,
  deltaSeconds: number,
  config: Partial<MovementConfig> = MOVEMENT_CONFIG,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
  const rules = { ...MOVEMENT_CONFIG, ...config };
  const tolerance = rules.arrivalToleranceTiles * world.tileSizePixels;

  for (const unit of world.units()) {
    if (!isAlive(unit) || unit.order?.kind !== 'Move') continue;
    const order = unit.order;
    const budget = unit.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
    const step = advanceAlongRoute(order.route.waypoints, order.route.waypointIndex, unit.position, budget, tolerance);

    if (step.position.x !== unit.position.x || step.position.y !== unit.position.y) {
      world.setPosition(unit.id, step.position);
    }
    if (step.heading !== null) {
      world.setFacingRadians(
        unit.id,
        turnTowards(unit.facingRadians, step.heading, rules.maxTurnRadiansPerSecond * deltaSeconds),
      );
    }

    if (step.arrived) {
      world.setOrder(unit.id, null);
      world.setStatus(unit.id, 'idle');
    } else if (step.waypointIndex !== order.route.waypointIndex) {
      world.setOrder(unit.id, moveOrder(order.target, { ...order.route, waypointIndex: step.waypointIndex }));
    }
  }
}

function normalizeRadians(angle: number): number {
  return ((angle + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
}
