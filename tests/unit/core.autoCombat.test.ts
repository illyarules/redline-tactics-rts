import { describe, expect, it } from 'vitest';
import { issueRetaliationOrders, nearestValidEnemy, createAutoTargetingState, stepAutomaticTargeting } from '../../src/core/autoCombat';
import { attackOrder, moveOrder } from '../../src/core/orders';
import { createWorld } from '../../src/core/world';
import { startEntrenchment, stepEntrenchment } from '../../src/core/entrenchment';
import { ENTRENCHMENT_CONFIG } from '../../src/config/entrenchment';

function setup() {
  return createWorld({ tileSizePixels: 30 });
}

describe('automatic combat targeting', () => {
  it('chooses the nearest legal enemy deterministically', () => {
    const world = setup();
    const infantry = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const farther = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 420, y: 300 },
    });
    const nearer = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: { x: 330, y: 300 },
    });

    expect(nearestValidEnemy(world, infantry, 7)?.id).toBe(nearer.id);
    world.damage(nearer.id, nearer.health);
    expect(nearestValidEnemy(world, infantry, 7)?.id).toBe(farther.id);
  });

  it('only scans at the configured interval and gives idle combat units acquired orders', () => {
    const world = setup();
    const infantry = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 360, y: 300 },
    });
    const state = createAutoTargetingState();
    const config = { targetScanIntervalSeconds: 0.25, acquisitionRangeTiles: 7 };

    expect(stepAutomaticTargeting(world, state, 0.24, config)).toEqual([]);
    expect(infantry.order).toBeNull();
    expect(stepAutomaticTargeting(world, state, 0.01, config)).toContain(infantry.id);
    expect(infantry.order).toEqual(expect.objectContaining({
      kind: 'Attack', targetId: target.id, source: 'acquired',
    }));
  });

  it('lets entrenched FPV operators acquire enemies across their full weapon range', () => {
    const world = setup();
    const operator = world.createUnit({
      type: 'fpvOperators', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const target = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: { x: 522, y: 300 },
    });
    startEntrenchment(world, 'player', [operator.id]);
    stepEntrenchment(world, ENTRENCHMENT_CONFIG.durationSeconds);

    expect(stepAutomaticTargeting(world, createAutoTargetingState(), 0.25)).toEqual([operator.id]);
    expect(operator.order).toEqual(expect.objectContaining({
      kind: 'Attack', targetId: target.id, source: 'acquired',
    }));
  });

  it('respects an injected information boundary for acquisition and retaliation', () => {
    const world = setup();
    const defender = world.createUnit({
      type: 'tank', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const attacker = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 330, y: 300 },
    });
    const state = createAutoTargetingState();
    const config = { targetScanIntervalSeconds: 0.25, acquisitionRangeTiles: 7 };
    const hidden = () => false;
    const hit = { kind: 'hit' as const, attackerId: attacker.id, targetId: defender.id, damage: 1, destroyed: false };

    expect(nearestValidEnemy(world, defender, 7, hidden)).toBeNull();
    expect(stepAutomaticTargeting(world, state, 0.25, config, hidden)).toEqual([]);
    expect(issueRetaliationOrders(world, [hit], hidden)).toEqual([]);
    expect(defender.order).toBeNull();
  });

  it('retaliates against a known attacker but preserves an explicit player attack', () => {
    const world = setup();
    const defender = world.createUnit({
      type: 'tank', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const attacker = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 330, y: 300 },
    });
    const explicitTarget = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: { x: 360, y: 300 },
    });
    const hit = { kind: 'hit' as const, attackerId: attacker.id, targetId: defender.id, damage: 1, destroyed: false };

    world.setOrder(defender.id, attackOrder(explicitTarget.id));
    expect(issueRetaliationOrders(world, [hit])).toEqual([]);
    expect(defender.order).toEqual(expect.objectContaining({ targetId: explicitTarget.id, source: 'explicit' }));

    world.setOrder(defender.id, moveOrder({ x: 600, y: 300 }));
    expect(issueRetaliationOrders(world, [hit])).toEqual([]);
    expect(defender.order).toEqual(expect.objectContaining({ kind: 'Move' }));

    world.setOrder(defender.id, attackOrder(explicitTarget.id, null, 'acquired'));
    expect(issueRetaliationOrders(world, [hit])).toEqual([defender.id]);
    expect(defender.order).toEqual(expect.objectContaining({ targetId: attacker.id, source: 'retaliation' }));
  });
});
