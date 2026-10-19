import { describe, expect, it } from 'vitest';
import { COMBAT_EFFECTS_CONFIG, isValidCombatEffectsConfig } from '../../src/config/combatEffects';
import type { AttackHitEvent } from '../../src/core/attack';
import { createWorld } from '../../src/core/world';
import { deathEffectAt, mapAttackHitToCombatEffect, vehicleDeathDescriptor } from '../../src/game/combatEffectEvents';

function hit(attackerId: AttackHitEvent['attackerId'], targetId: AttackHitEvent['targetId'], destroyed = false): AttackHitEvent {
  return { kind: 'hit', attackerId, targetId, damage: 12, destroyed };
}

describe('combat effect event mapping', () => {
  it('maps a confirmed attack into renderer-safe weapon and target data', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const attacker = world.createUnit({
      type: 'rocket', owner: 'player', faction: 'meridian', position: { x: 30, y: 60 },
    });
    const target = world.createBuilding({
      type: 'factory', owner: 'ai', faction: 'ember', topLeft: { tx: 10, ty: 12 },
    });

    expect(mapAttackHitToCombatEffect(hit(attacker.id, target.id), attacker, target)).toEqual({
      kind: 'combat-hit',
      weapon: 'rocket',
      from: { x: 30, y: 60 },
      to: target.position,
      targetKind: 'building',
      targetToken: target.id,
      targetSizeTiles: Math.max(target.footprint.width, target.footprint.height),
      targetDestroyed: false,
      attackerToken: attacker.id,
    });
  });

  it('rejects malformed, non-combat, or already-destroyed target events before they reach Babylon', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const worker = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: { x: 30, y: 30 },
    });
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 60, y: 30 },
    });
    const infantry = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 0, y: 30 },
    });
    world.damage(target.id, target.health);

    expect(mapAttackHitToCombatEffect(hit(worker.id, target.id), worker, target)).toBeNull();
    expect(mapAttackHitToCombatEffect(hit(infantry.id, target.id), infantry, target)).toBeNull();
    expect(mapAttackHitToCombatEffect(hit(infantry.id, target.id), infantry, undefined)).toBeNull();
    expect(mapAttackHitToCombatEffect({ ...hit(infantry.id, target.id), damage: 0 }, infantry, target)).toBeNull();
  });

  it('keeps the impact of a confirmed killing hit but marks the target as no longer flashable', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const attacker = world.createUnit({
      type: 'tank', owner: 'player', faction: 'meridian', position: { x: 30, y: 30 },
    });
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 60, y: 30 }, health: 1,
    });
    world.damage(target.id, 1);

    expect(mapAttackHitToCombatEffect(hit(attacker.id, target.id, true), attacker, target))
      .toMatchObject({ weapon: 'tank', targetDestroyed: true, targetKind: 'unit' });
  });
});

describe('vehicle death descriptors', () => {
  it('captures a destroyed vehicle\'s look before the entity is removed', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const tank = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: { x: 60, y: 30 },
    });
    world.setFacingRadians(tank.id, 1.25);

    const descriptor = vehicleDeathDescriptor(tank);
    expect(descriptor).toEqual({ unitType: 'tank', owner: 'ai', facingRadians: 1.25, sizeTiles: tank.stats.bodySizeTiles });
    world.remove(tank.id);
    expect(descriptor?.facingRadians).toBe(1.25);

    const death = deathEffectAt({ x: 60, y: 30 }, tank.id, descriptor);
    expect(death).toEqual({ kind: 'combat-death', at: { x: 60, y: 30 }, targetToken: tank.id, vehicle: descriptor });
    expect(death?.vehicle).not.toBe(descriptor);
  });

  it('leaves infantry, buildings and missing targets with the plain death ring', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const infantry = world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 60, y: 30 } });
    const factory = world.createBuilding({ type: 'factory', owner: 'ai', faction: 'ember', topLeft: { tx: 10, ty: 12 } });

    expect(vehicleDeathDescriptor(infantry)).toBeNull();
    expect(vehicleDeathDescriptor(factory)).toBeNull();
    expect(vehicleDeathDescriptor(undefined)).toBeNull();
    expect(deathEffectAt({ x: 1, y: 2 }, 'id')).toEqual({ kind: 'combat-death', at: { x: 1, y: 2 }, targetToken: 'id' });
    expect(deathEffectAt({ x: Number.NaN, y: 2 }, 'id')).toBeNull();
  });
});

describe('combat effect configuration', () => {
  it('has valid bounded render-only values for every weapon type', () => {
    expect(isValidCombatEffectsConfig(COMBAT_EFFECTS_CONFIG)).toBe(true);
  });

  it('rejects invalid pool and weapon timing values', () => {
    expect(isValidCombatEffectsConfig({
      ...COMBAT_EFFECTS_CONFIG,
      projectilePoolCapacity: 0,
    })).toBe(false);
    expect(isValidCombatEffectsConfig({
      ...COMBAT_EFFECTS_CONFIG,
      weapons: {
        ...COMBAT_EFFECTS_CONFIG.weapons,
        rocket: { ...COMBAT_EFFECTS_CONFIG.weapons.rocket, projectileDurationSeconds: 0 },
      },
    })).toBe(false);
  });
});
