/** Attack-Move: retain a routed destination while briefly pursuing acquired enemies along the way. */
import { checkAttackEligibility, performAttack } from './combat';
import { isAlive } from './entities';
import type { Vec2 } from './geometry';
import type { EntityId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isUnderBuilding } from './matchSetup';
import { advanceAlongRoute, turnTowards } from './movement';
import { attackMoveOrder, attackOrder, type AttackMoveOrder, type MoveRoute } from './orders';
import { planRoute } from './pathfinding';
import { MOVEMENT_CONFIG } from '../config/movement';
import type { CanTargetEntity } from './autoCombat';
import type { World } from './world';
import type { AttackHitEvent } from './attack';

/** Routes selected combat units to a destination they may interrupt to fight. */
export function issueAttackMoveOrders(
  world: World,
  grid: MapGrid,
  player: PlayerId,
  selectedIds: readonly EntityId[],
  target: Vec2,
): readonly EntityId[] {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return [];
  const targetTile = grid.worldToTile(target);
  if (!grid.isInBounds(targetTile.tx, targetTile.ty)) return [];

  const accepted: EntityId[] = [];
  for (const id of new Set(selectedIds)) {
    const unit = world.unit(id);
    if (unit === undefined || unit.owner !== player || !isAlive(unit) || unit.stats.attack === null) continue;
    const plan = planRoute(
      grid,
      grid.worldToTile(unit.position),
      targetTile,
      (tile) => isUnderBuilding(world, tile),
    );
    if (!plan.found) {
      world.setOrder(unit.id, null);
      world.setStatus(unit.id, 'failed');
      continue;
    }
    const route: MoveRoute = {
      resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty),
      waypoints: plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty)),
      waypointIndex: 0,
    };
    world.setOrder(unit.id, attackMoveOrder({ x: target.x, y: target.y }, route));
    world.setStatus(unit.id, 'moving');
    accepted.push(unit.id);
  }
  return accepted;
}

/** Advances Attack-Move travel or its temporary target engagement and returns confirmed hit events. */
// eslint-disable-next-line complexity -- Travel and engagement states are intentionally handled in one ordered step.
export function stepAttackMoveOrders(world: World, grid: MapGrid, deltaSeconds: number, canTarget: CanTargetEntity = () => true): readonly AttackHitEvent[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return [];
  const events: AttackHitEvent[] = [];
  for (const unit of world.units()) {
    if (!isAlive(unit) || unit.order?.kind !== 'AttackMove') continue;
    const order = unit.order;
    if (order.engagement === null) {
      advanceDestination(world, unit.id, order, deltaSeconds);
      continue;
    }
    const target = world.get(order.engagement.targetId);
    if (target === undefined || !canTarget(unit, target)) { resumeDestination(world, unit.id, order); continue; }
    stepEngagement(world, grid, unit.id, order, deltaSeconds, events);
  }
  return events;
}

// eslint-disable-next-line complexity -- Engagement resolution keeps targeting, movement, and hit ordering atomic.
function stepEngagement(
  world: World,
  grid: MapGrid,
  unitId: EntityId,
  order: AttackMoveOrder,
  deltaSeconds: number,
  events: AttackHitEvent[],
): void {
  const unit = world.unit(unitId);
  const engagement = order.engagement;
  if (unit === undefined || engagement === null) return;
  const eligibility = checkAttackEligibility(world, unit.id, engagement.targetId);
  if (eligibility.allowed) {
    const result = performAttack(world, unit.id, engagement.targetId);
    if (result.attacked) {
      world.setStatus(unit.id, 'attacking');
      events.push({
        kind: 'hit', attackerId: unit.id, targetId: engagement.targetId,
        damage: result.appliedDamage, destroyed: result.destroyed,
      });
    }
    return;
  }
  if (eligibility.reason === 'cooling-down') {
    world.setStatus(unit.id, 'attacking');
    return;
  }
  if (eligibility.reason !== 'out-of-range') {
    resumeDestination(world, unit.id, order);
    return;
  }

  const route = engagement.route ?? planAttackRoute(world, grid, unit.id, engagement.targetId);
  if (route === undefined) {
    resumeDestination(world, unit.id, order);
    return;
  }
  if (route === null) {
    world.setOrder(unit.id, attackMoveOrder(order.target, order.route, attackOrder(engagement.targetId, null, 'attackMove')));
    world.setStatus(unit.id, 'moving');
    return;
  }

  const budget = unit.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
  const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * world.tileSizePixels;
  const step = advanceAlongRoute(route.waypoints, route.waypointIndex, unit.position, budget, tolerance);
  if (step.position.x !== unit.position.x || step.position.y !== unit.position.y) world.setPosition(unit.id, step.position);
  if (step.heading !== null) {
    world.setFacingRadians(unit.id, turnTowards(unit.facingRadians, step.heading, MOVEMENT_CONFIG.maxTurnRadiansPerSecond * deltaSeconds));
  }
  world.setOrder(
    unit.id,
    attackMoveOrder(
      order.target,
      order.route,
      attackOrder(engagement.targetId, step.arrived ? null : { ...route, waypointIndex: step.waypointIndex }, 'attackMove'),
    ),
  );
  world.setStatus(unit.id, 'moving');
}

function advanceDestination(world: World, unitId: EntityId, order: AttackMoveOrder, deltaSeconds: number): void {
  const unit = world.unit(unitId);
  if (unit === undefined) return;
  const budget = unit.stats.speedTilesPerSecond * world.tileSizePixels * deltaSeconds;
  const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * world.tileSizePixels;
  const step = advanceAlongRoute(order.route.waypoints, order.route.waypointIndex, unit.position, budget, tolerance);
  if (step.position.x !== unit.position.x || step.position.y !== unit.position.y) world.setPosition(unit.id, step.position);
  if (step.heading !== null) {
    world.setFacingRadians(unit.id, turnTowards(unit.facingRadians, step.heading, MOVEMENT_CONFIG.maxTurnRadiansPerSecond * deltaSeconds));
  }
  if (step.arrived) {
    world.setOrder(unit.id, null);
    world.setStatus(unit.id, 'idle');
  } else if (step.waypointIndex !== order.route.waypointIndex) {
    world.setOrder(unit.id, attackMoveOrder(order.target, { ...order.route, waypointIndex: step.waypointIndex }));
  }
}

function resumeDestination(world: World, unitId: EntityId, order: AttackMoveOrder): void {
  world.setOrder(unitId, attackMoveOrder(order.target, order.route));
  world.setStatus(unitId, 'moving');
}

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
  if (plan.tiles.length === 0) return null;
  return {
    resolvedTarget: grid.tileCenter(plan.resolvedTarget.tx, plan.resolvedTarget.ty),
    waypoints: plan.tiles.map((tile) => grid.tileCenter(tile.tx, tile.ty)),
    waypointIndex: 0,
  };
}
