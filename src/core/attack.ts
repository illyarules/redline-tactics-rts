/**
 * Explicit Attack orders: issue legal enemy targets, walk into weapon range, and turn successful
 * combat-math calls into renderer-neutral hit events. Target selection and effects stay outside.
 */
import { checkAttackEligibility, performAttack } from './combat';
import { isAlive } from './entities';
import type { EntityId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isUnderBuilding } from './matchSetup';
import { advanceAlongRoute, turnTowards } from './movement';
import { attackOrder, type MoveRoute } from './orders';
import { planRoute } from './pathfinding';
import { MOVEMENT_CONFIG } from '../config/movement';
import type { CanTargetEntity } from './autoCombat';
import type { World } from './world';

export interface AttackHitEvent {
  readonly kind: 'hit';
  readonly attackerId: EntityId;
  readonly targetId: EntityId;
  readonly damage: number;
  readonly destroyed: boolean;
}

/** Returns selected combat units that accepted this explicit enemy target. */
export function issueAttackOrders(
  world: World,
  player: PlayerId,
  selectedIds: readonly EntityId[],
  targetId: EntityId,
  canTarget: CanTargetEntity = () => true,
): readonly EntityId[] {
  const accepted: EntityId[] = [];
  for (const id of new Set(selectedIds)) {
    const unit = world.unit(id);
    const target = world.get(targetId);
    if (unit === undefined || target === undefined || !canTarget(unit, target)) continue;
    const eligibility = checkAttackEligibility(world, id, targetId);
    if (!canPursue(eligibility)) continue;
    const attacker = world.unit(id);
    if (attacker === undefined || attacker.owner !== player) continue;
    world.setOrder(id, attackOrder(targetId, null, 'explicit'));
    world.setStatus(id, eligibility.allowed || eligibility.reason === 'cooling-down' ? 'attacking' : 'moving');
    accepted.push(id);
  }
  return accepted;
}

/**
 * Advances every explicit Attack order. Units only follow a route while outside their attack range;
 * an unreachable or invalid target clears the order instead of leaving a unit stuck in pursuit.
 */
export function stepAttackOrders(world: World, grid: MapGrid, deltaSeconds: number, canTarget: CanTargetEntity = () => true): readonly AttackHitEvent[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return [];
  const events: AttackHitEvent[] = [];

  for (const attacker of world.units()) {
    if (!isAlive(attacker) || attacker.order?.kind !== 'Attack') continue;
    const order = attacker.order;
    const target = world.get(order.targetId);
    if (target === undefined || !canTarget(attacker, target)) { stopAttacking(world, attacker.id); continue; }
    const eligibility = checkAttackEligibility(world, attacker.id, order.targetId);

    if (eligibility.allowed) {
      const result = performAttack(world, attacker.id, order.targetId);
      if (result.attacked) {
        world.setStatus(attacker.id, 'attacking');
        events.push({
          kind: 'hit', attackerId: attacker.id, targetId: order.targetId,
          damage: result.appliedDamage, destroyed: result.destroyed,
        });
      }
      continue;
    }
    if (eligibility.reason === 'cooling-down') {
      world.setStatus(attacker.id, 'attacking');
      continue;
    }
    if (eligibility.reason !== 'out-of-range') {
      stopAttacking(world, attacker.id);
      continue;
    }

    const route = order.route ?? planAttackRoute(world, grid, attacker.id, order.targetId);
    if (route === undefined) {
      stopAttacking(world, attacker.id);
      continue;
    }
    if (route === null) {
      // The target may have moved after the route's endpoint was reached. Replan next frame rather
      // than assigning a fake movement route that could make the unit appear to walk in place.
      world.setOrder(attacker.id, attackOrder(order.targetId, null, order.source));
      world.setStatus(attacker.id, 'moving');
      continue;
    }

    const budget = attacker.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
    const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * world.tileSizePixels;
    const step = advanceAlongRoute(route.waypoints, route.waypointIndex, attacker.position, budget, tolerance);
    if (step.position.x !== attacker.position.x || step.position.y !== attacker.position.y) {
      world.setPosition(attacker.id, step.position);
    }
    if (step.heading !== null) {
      world.setFacingRadians(
        attacker.id,
        turnTowards(attacker.facingRadians, step.heading, MOVEMENT_CONFIG.maxTurnRadiansPerSecond * deltaSeconds),
      );
    }
    world.setOrder(
      attacker.id,
      attackOrder(order.targetId, step.arrived ? null : { ...route, waypointIndex: step.waypointIndex }, order.source),
    );
    world.setStatus(attacker.id, 'moving');
  }
  return events;
}

function canPursue(eligibility: ReturnType<typeof checkAttackEligibility>): boolean {
  return eligibility.allowed || eligibility.reason === 'out-of-range' || eligibility.reason === 'cooling-down';
}

/** Cancels pursuit through the normal order/status API. */
export function stopAttacking(world: World, attackerId: EntityId): void {
  world.setOrder(attackerId, null);
  world.setStatus(attackerId, 'idle');
}

/** A route toward the target's current tile, or `undefined` when pathfinding cannot reach it. */
function planAttackRoute(
  world: World,
  grid: MapGrid,
  attackerId: EntityId,
  targetId: EntityId,
): MoveRoute | null | undefined {
  const attacker = world.unit(attackerId);
  const target = world.get(targetId);
  if (attacker === undefined || target === undefined) return undefined;
  const plan = planRoute(
    grid,
    grid.worldToTile(attacker.position),
    grid.worldToTile(target.position),
    (tile) => isUnderBuilding(world, tile),
  );
  if (!plan.found) return undefined;
  const waypoints = plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty));
  if (waypoints.length === 0) return null;
  return {
    resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty),
    waypoints,
    waypointIndex: 0,
  };
}
