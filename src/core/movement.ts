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

/**
 * Follows each unit's resolved route waypoint by waypoint at configured speed. A frame's travel
 * budget can cross several short waypoints, so results stay independent of frame partitioning.
 * Facing turns toward whichever waypoint is current when the step begins. Arrival tolerance applies
 * only to the final waypoint; completion clears the order and leaves the unit idle.
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
    const waypoints = order.route.waypoints;
    let index = order.route.waypointIndex;
    let position = unit.position;
    let budget = unit.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
    let heading: number | null = null;
    let headingTaken = false;

    while (index < waypoints.length) {
      const waypoint = waypoints[index] as Vec2;
      const dx = waypoint.x - position.x;
      const dy = waypoint.y - position.y;
      const distance = Math.hypot(dx, dy);
      if (!headingTaken) {
        heading = headingForMovement(dx, dy);
        headingTaken = true;
      }

      const isFinalWaypoint = index === waypoints.length - 1;
      const travelToArrive = isFinalWaypoint ? Math.max(0, distance - tolerance) : distance;

      // A shortfall this small is float noise from dividing and re-multiplying by speed, not a real
      // gap: treating it as a gap would leave a unit stalled a hair short of its waypoint forever.
      if (budget + 1e-9 < travelToArrive) {
        if (distance > 0 && budget > 0) {
          position = { x: position.x + (dx / distance) * budget, y: position.y + (dy / distance) * budget };
        }
        budget = 0;
        break;
      }
      if (distance > 0) {
        position = { x: position.x + (dx / distance) * travelToArrive, y: position.y + (dy / distance) * travelToArrive };
      }
      budget -= travelToArrive;
      index += 1;
    }

    if (position.x !== unit.position.x || position.y !== unit.position.y) {
      world.setPosition(unit.id, position);
    }
    if (heading !== null) {
      world.setFacingRadians(
        unit.id,
        turnTowards(unit.facingRadians, heading, rules.maxTurnRadiansPerSecond * deltaSeconds),
      );
    }

    if (index >= waypoints.length) {
      world.setOrder(unit.id, null);
      world.setStatus(unit.id, 'idle');
    } else if (index !== order.route.waypointIndex) {
      world.setOrder(unit.id, moveOrder(order.target, { ...order.route, waypointIndex: index }));
    }
  }
}

function normalizeRadians(angle: number): number {
  return ((angle + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
}
