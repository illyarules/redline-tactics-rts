/**
 * Deterministic combat math. This module decides whether a shot is legal and applies one configured
 * hit; neighboring core systems select and pursue targets, while the game layer renders shots.
 */
import { DAMAGE_TABLE } from '../config/combat';
import { isAlive, isUnit, type ReadonlyEntity, type ReadonlyUnit } from './entities';
import type { EntityId } from './ids';
import type { World } from './world';
import { areHostile } from './teams';

/** Prevents binary floating-point residue from making a weapon miss its exact cooldown boundary. */
const COOLDOWN_EPSILON_SECONDS = 1e-9;

export type AttackIneligibleReason =
  | 'invalid-attacker'
  | 'invalid-target'
  | 'same-owner'
  | 'unsupported-target-category'
  | 'out-of-range'
  | 'cooling-down';

export type AttackEligibility =
  | { readonly allowed: true; readonly distanceTiles: number }
  | { readonly allowed: false; readonly reason: AttackIneligibleReason };

export type AttackResult =
  | { readonly attacked: false; readonly reason: AttackIneligibleReason }
  | {
      readonly attacked: true;
      /** Configured base damage after the target armor multiplier, before health clamping. */
      readonly damage: number;
      /** Damage actually removed from health. A killing hit may be smaller than `damage`. */
      readonly appliedDamage: number;
      readonly targetHealth: number;
      /** True only for the one hit that changed the target to destroyed. */
      readonly destroyed: boolean;
    };

/** Checks ownership, target kind, distance and weapon readiness without changing any state. */
export function checkAttackEligibility(world: World, attackerId: EntityId, targetId: EntityId): AttackEligibility {
  const attacker = world.unit(attackerId);
  if (attacker === undefined || !isAlive(attacker) || attacker.stats.attack === null) {
    return { allowed: false, reason: 'invalid-attacker' };
  }
  const target = world.get(targetId);
  if (target === undefined || !isAlive(target)) {
    return { allowed: false, reason: 'invalid-target' };
  }
  if (!areHostile(attacker.owner, target.owner)) {
    return { allowed: false, reason: 'same-owner' };
  }
  if (!attacker.stats.attack.targetCategories.includes(attackTargetCategory(target))) {
    return { allowed: false, reason: 'unsupported-target-category' };
  }

  const distanceTiles = Math.hypot(
    attacker.position.x - target.position.x,
    attacker.position.y - target.position.y,
  ) / world.tileSizePixels;
  if (distanceTiles > attacker.stats.attack.rangeTiles) {
    return { allowed: false, reason: 'out-of-range' };
  }
  if (attacker.attackCooldownRemainingSeconds > 0) {
    return { allowed: false, reason: 'cooling-down' };
  }
  return { allowed: true, distanceTiles };
}

/** The configured damage after the typed attacker-vs-armor multiplier, with no world mutation. */
export function calculateAttackDamage(attacker: ReadonlyUnit, target: ReadonlyEntity): number {
  if (attacker.type === 'worker' || attacker.stats.attack === null) {
    return 0;
  }
  return attacker.stats.attack.damage * DAMAGE_TABLE[attacker.type][target.stats.armor];
}

/** Applies one legal hit and starts the attacker's weapon cooldown. */
export function performAttack(world: World, attackerId: EntityId, targetId: EntityId): AttackResult {
  const eligibility = checkAttackEligibility(world, attackerId, targetId);
  if (!eligibility.allowed) {
    return { attacked: false, reason: eligibility.reason };
  }
  const attacker = world.unit(attackerId);
  const target = world.get(targetId);
  // Eligibility just proved both exist and the attacker has an attack profile.
  if (attacker === undefined || target === undefined || attacker.stats.attack === null) {
    return { attacked: false, reason: 'invalid-attacker' };
  }

  const damage = calculateAttackDamage(attacker, target);
  const result = world.damage(target.id, damage);
  if (result === undefined) {
    return { attacked: false, reason: 'invalid-target' };
  }
  world.setAttackCooldown(attacker.id, attacker.stats.attack.cooldownSeconds);
  return {
    attacked: true,
    damage,
    appliedDamage: result.applied,
    targetHealth: result.health,
    destroyed: result.destroyed,
  };
}

/** Counts down every living unit's weapon timer; elapsed time cannot make a cooldown negative. */
export function stepAttackCooldowns(world: World, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
  for (const unit of world.units()) {
    if (!isAlive(unit) || unit.attackCooldownRemainingSeconds <= 0) continue;
    const remaining = unit.attackCooldownRemainingSeconds - deltaSeconds;
    world.setAttackCooldown(unit.id, remaining <= COOLDOWN_EPSILON_SECONDS ? 0 : remaining);
  }
}

/** A narrow helper for consumers that need the target category without importing entity internals. */
export function attackTargetCategory(entity: ReadonlyEntity): 'unit' | 'building' {
  return isUnit(entity) ? 'unit' : 'building';
}
