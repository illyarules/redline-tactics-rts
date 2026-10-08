import { describe, expect, it } from 'vitest';
import { ENTRENCHMENT_CONFIG } from '../../src/config/entrenchment';
import { MAP_CONFIG } from '../../src/config/map';
import { UNIT_CONFIG } from '../../src/config/units';
import { checkAttackEligibility, calculateAttackDamage } from '../../src/core/combat';
import { canUnitAttack, effectiveArmor, startEntrenchment, stepEntrenchment, toggleEntrenchment } from '../../src/core/entrenchment';
import { issueMoveOrders } from '../../src/core/movement';
import { createMapGrid } from '../../src/core/map';
import { createWorld } from '../../src/core/world';

describe('FPV operator entrenchment', () => {
  it('cannot attack while mobile or entrenching, then gains rocket damage and tank armor', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const operator = world.createUnit({
      type: 'fpvOperators', owner: 'player', faction: 'meridian', position: { x: 0, y: 0 },
    });
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 30, y: 0 },
    });

    expect(canUnitAttack(operator)).toBe(false);
    expect(checkAttackEligibility(world, operator.id, target.id)).toEqual({ allowed: false, reason: 'not-entrenched' });
    expect(effectiveArmor(operator)).toBe(UNIT_CONFIG.infantry.armor);
    expect(startEntrenchment(world, 'player', [operator.id])).toEqual([operator.id]);
    stepEntrenchment(world, ENTRENCHMENT_CONFIG.durationSeconds - 0.01);
    expect(operator.entrenchment).toBe('entrenching');
    expect(canUnitAttack(operator)).toBe(false);

    expect(stepEntrenchment(world, 0.01)).toEqual([operator.id]);
    expect(operator.entrenchment).toBe('entrenched');
    expect(canUnitAttack(operator)).toBe(true);
    expect(effectiveArmor(operator)).toBe(UNIT_CONFIG.tank.armor);
    expect(operator.stats.attack?.damage).toBe(UNIT_CONFIG.rocket.attack?.damage);
    const rocket = world.createUnit({
      type: 'rocket', owner: 'player', faction: 'meridian', position: { x: 0, y: 30 },
    });
    expect(calculateAttackDamage(operator, target)).toBe(calculateAttackDamage(rocket, target));
  });

  it('cancels entrenchment when given a move order', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const operator = world.createUnit({
      type: 'fpvOperators', owner: 'player', faction: 'meridian', position: { x: 0, y: 0 },
    });
    startEntrenchment(world, 'player', [operator.id]);
    stepEntrenchment(world, ENTRENCHMENT_CONFIG.durationSeconds);

    issueMoveOrders(world, grid, 'player', [operator.id], grid.tileCenter(10, 10));

    expect(operator.entrenchment).toBe('mobile');
    expect(operator.status).toBe('moving');
  });

  it('packs up an entrenched team when toggled again', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const operator = world.createUnit({
      type: 'fpvOperators', owner: 'player', faction: 'meridian', position: { x: 0, y: 0 },
    });
    toggleEntrenchment(world, 'player', [operator.id]);
    stepEntrenchment(world, ENTRENCHMENT_CONFIG.durationSeconds);

    expect(toggleEntrenchment(world, 'player', [operator.id])).toEqual([operator.id]);
    expect(operator.entrenchment).toBe('mobile');
    expect(operator.status).toBe('idle');
    expect(canUnitAttack(operator)).toBe(false);
  });

  it('rejects enemy and non-operator selections', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const enemy = world.createUnit({
      type: 'fpvOperators', owner: 'ai', faction: 'ember', position: { x: 0, y: 0 },
    });
    const infantry = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 30, y: 0 },
    });
    expect(startEntrenchment(world, 'player', [enemy.id, infantry.id])).toEqual([]);
  });
});
