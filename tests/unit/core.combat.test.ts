import { describe, expect, it } from 'vitest';
import { DAMAGE_TABLE } from '../../src/config/combat';
import {
  calculateAttackDamage,
  checkAttackEligibility,
  performAttack,
  stepAttackCooldowns,
} from '../../src/core/combat';
import { createWorld, type World } from '../../src/core/world';

const TILE = 30;

function setup(): World {
  return createWorld({ tileSizePixels: TILE });
}

function unit(world: World, type: 'worker' | 'infantry' | 'tank' | 'rocket', owner: 'player' | 'ai', x: number, y = 0) {
  return world.createUnit({ type, owner, faction: owner === 'player' ? 'meridian' : 'ember', position: { x, y } });
}

describe('attack eligibility', () => {
  it('requires a living combat unit, an enemy, an allowed target category, range and a ready cooldown', () => {
    const world = setup();
    const infantry = unit(world, 'infantry', 'player', 0);
    const enemy = unit(world, 'tank', 'ai', TILE * 3.5);
    const ally = unit(world, 'tank', 'player', TILE);
    const farEnemy = unit(world, 'tank', 'ai', TILE * 3.51);
    const enemyBuilding = world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 0, ty: 0 } });
    const worker = unit(world, 'worker', 'player', 0);

    expect(checkAttackEligibility(world, infantry.id, enemy.id)).toEqual({ allowed: true, distanceTiles: 3.5 });
    expect(checkAttackEligibility(world, infantry.id, enemyBuilding.id)).toMatchObject({ allowed: true });
    expect(checkAttackEligibility(world, infantry.id, ally.id)).toEqual({ allowed: false, reason: 'same-owner' });
    expect(checkAttackEligibility(world, infantry.id, farEnemy.id)).toEqual({ allowed: false, reason: 'out-of-range' });
    expect(checkAttackEligibility(world, worker.id, enemy.id)).toEqual({ allowed: false, reason: 'invalid-attacker' });

    world.setAttackCooldown(infantry.id, 0.01);
    expect(checkAttackEligibility(world, infantry.id, enemy.id)).toEqual({ allowed: false, reason: 'cooling-down' });
  });
});

describe('damage and cooldowns', () => {
  it('uses typed armor multipliers for unit and building targets', () => {
    const world = setup();
    const infantry = unit(world, 'infantry', 'player', 0);
    const tank = unit(world, 'tank', 'ai', TILE);
    const hq = world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 1, ty: 0 } });

    expect(calculateAttackDamage(infantry, tank)).toBe(12 * DAMAGE_TABLE.infantry.armored);
    expect(calculateAttackDamage(infantry, hq)).toBe(12 * DAMAGE_TABLE.infantry.structure);
  });

  it('applies a legal hit once, starts its cooldown, and becomes ready precisely at the boundary', () => {
    const world = setup();
    const infantry = unit(world, 'infantry', 'player', 0);
    const target = unit(world, 'tank', 'ai', TILE);
    const healthBefore = target.health;

    expect(performAttack(world, infantry.id, target.id)).toEqual({
      attacked: true,
      damage: 12 * DAMAGE_TABLE.infantry.armored,
      appliedDamage: 12 * DAMAGE_TABLE.infantry.armored,
      targetHealth: healthBefore - 12 * DAMAGE_TABLE.infantry.armored,
      destroyed: false,
    });
    expect(infantry.attackCooldownRemainingSeconds).toBe(0.9);
    expect(performAttack(world, infantry.id, target.id)).toEqual({ attacked: false, reason: 'cooling-down' });

    stepAttackCooldowns(world, 0.89);
    expect(infantry.attackCooldownRemainingSeconds).toBeCloseTo(0.01);
    stepAttackCooldowns(world, 0.01);
    expect(infantry.attackCooldownRemainingSeconds).toBe(0);
    expect(checkAttackEligibility(world, infantry.id, target.id).allowed).toBe(true);
  });

  it('never reduces health below zero and reports a target death exactly once', () => {
    const world = setup();
    const infantry = unit(world, 'infantry', 'player', 0);
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: TILE, y: 0 }, health: 1,
    });

    const killing = performAttack(world, infantry.id, target.id);
    expect(killing).toMatchObject({ attacked: true, appliedDamage: 1, targetHealth: 0, destroyed: true });
    expect(performAttack(world, infantry.id, target.id)).toEqual({ attacked: false, reason: 'invalid-target' });
    expect(target.health).toBe(0);
  });

  it('rejects invalid cooldown state and leaves it unchanged on invalid ticks', () => {
    const world = setup();
    const infantry = unit(world, 'infantry', 'player', 0);
    expect(() => world.setAttackCooldown(infantry.id, -1)).toThrow(/cooldown/i);
    world.setAttackCooldown(infantry.id, 1);
    stepAttackCooldowns(world, -1);
    expect(infantry.attackCooldownRemainingSeconds).toBe(1);
  });
});
