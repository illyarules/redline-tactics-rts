/**
 * Periodic automatic target search and immediate retaliation.  This is pure core state: the scene
 * supplies elapsed simulation time, while Babylon never decides who can be attacked.
 */
import { COMBAT_BEHAVIOR_CONFIG } from '../config/combat';
import type { CombatBehaviorConfig } from '../config/types';
import { checkAttackEligibility, attackTargetCategory } from './combat';
import { isAlive, type ReadonlyEntity, type ReadonlyUnit } from './entities';
import { distanceSquared } from './geometry';
import { attackMoveOrder, attackOrder } from './orders';
import type { AttackHitEvent } from './attack';
import type { EntityId } from './ids';
import type { World } from './world';

/** Scene-owned elapsed time for a bounded target scan; target choices themselves live in orders. */
export interface AutoTargetingState {
  scanElapsedSeconds: number;
}

export function createAutoTargetingState(): AutoTargetingState {
  return { scanElapsedSeconds: 0 };
}

/**
 * Scans only at the configured cadence. Idle units gain an acquired Attack order; Attack-Move
 * units retain their travel route and gain only a temporary engagement.
 */
export function stepAutomaticTargeting(
  world: World,
  state: AutoTargetingState,
  deltaSeconds: number,
  config: CombatBehaviorConfig = COMBAT_BEHAVIOR_CONFIG,
): readonly EntityId[] {
  if (
    !Number.isFinite(deltaSeconds) || deltaSeconds < 0 ||
    !Number.isFinite(config.targetScanIntervalSeconds) || config.targetScanIntervalSeconds <= 0 ||
    !Number.isFinite(config.acquisitionRangeTiles) || config.acquisitionRangeTiles <= 0
  ) return [];

  state.scanElapsedSeconds += deltaSeconds;
  if (state.scanElapsedSeconds < config.targetScanIntervalSeconds) return [];
  // One scan is enough after a long frame. Keep only the fractional remainder so cadence resumes
  // steadily rather than spending one frame repeatedly scanning every unit.
  state.scanElapsedSeconds %= config.targetScanIntervalSeconds;

  const changed: EntityId[] = [];
  for (const unit of world.units()) {
    if (!isCombatUnit(unit)) continue;
    const canAcquire = (unit.order === null && unit.status === 'idle') ||
      (unit.order?.kind === 'AttackMove' && unit.order.engagement === null);
    if (!canAcquire) continue;
    const target = nearestValidEnemy(world, unit, Math.min(config.acquisitionRangeTiles, unit.stats.visionRangeTiles));
    if (target === null) continue;

    if (unit.order === null && unit.status === 'idle') {
      world.setOrder(unit.id, attackOrder(target.id, null, 'acquired'));
      world.setStatus(unit.id, 'attacking');
      changed.push(unit.id);
      continue;
    }

    if (unit.order?.kind === 'AttackMove' && unit.order.engagement === null) {
      world.setOrder(
        unit.id,
        attackMoveOrder(unit.order.target, unit.order.route, attackOrder(target.id, null, 'attackMove')),
      );
      world.setStatus(unit.id, 'attacking');
      changed.push(unit.id);
    }
  }
  return changed;
}

/**
 * A known attacker from a confirmed hit needs no broad scan: the damaged unit answers immediately
 * if it can pursue and is not following an explicit player order.
 */
export function issueRetaliationOrders(world: World, hits: readonly AttackHitEvent[]): readonly EntityId[] {
  const changed: EntityId[] = [];
  for (const hit of hits) {
    const defender = world.unit(hit.targetId);
    if (!isCombatUnit(defender) || !mayRetaliate(defender)) continue;
    const eligibility = checkAttackEligibility(world, defender.id, hit.attackerId);
    if (!canPursue(eligibility)) continue;
    world.setOrder(defender.id, attackOrder(hit.attackerId, null, 'retaliation'));
    world.setStatus(defender.id, eligibility.allowed || eligibility.reason === 'cooling-down' ? 'attacking' : 'moving');
    changed.push(defender.id);
  }
  return changed;
}

/** Nearest valid enemy in range, with creation-order tie-breaking for deterministic replays/tests. */
export function nearestValidEnemy(
  world: World,
  attacker: ReadonlyUnit,
  rangeTiles: number,
): ReadonlyEntity | null {
  if (!isCombatUnit(attacker) || !Number.isFinite(rangeTiles) || rangeTiles <= 0) return null;
  const maximumDistanceSquared = (rangeTiles * world.tileSizePixels) ** 2;
  let nearest: ReadonlyEntity | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of world.entities()) {
    if (
      !isAlive(candidate) ||
      candidate.owner === attacker.owner ||
      !attacker.stats.attack!.targetCategories.includes(attackTargetCategory(candidate))
    ) continue;
    const candidateDistanceSquared = distanceSquared(attacker.position, candidate.position);
    if (candidateDistanceSquared > maximumDistanceSquared || candidateDistanceSquared >= nearestDistanceSquared) continue;
    nearest = candidate;
    nearestDistanceSquared = candidateDistanceSquared;
  }
  return nearest;
}

function isCombatUnit(unit: ReadonlyUnit | undefined): unit is ReadonlyUnit {
  return unit !== undefined && isAlive(unit) && unit.stats.attack !== null;
}

function mayRetaliate(unit: ReadonlyUnit): boolean {
  // Direct Move/Attack/Attack-Move are explicit player intent. An older auto target may be replaced
  // by the attacker that just proved it is a threat, but it never overrides an explicit attack.
  return unit.order === null || (unit.order.kind === 'Attack' && unit.order.source !== 'explicit');
}

function canPursue(eligibility: ReturnType<typeof checkAttackEligibility>): boolean {
  return eligibility.allowed || eligibility.reason === 'out-of-range' || eligibility.reason === 'cooling-down';
}
