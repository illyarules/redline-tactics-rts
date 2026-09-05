import { describe, expect, it } from 'vitest';
import type { MapConfig } from '../src/config/types';
import { issueAttackMoveOrders, stepAttackMoveOrders } from '../src/core/attackMove';
import { createAutoTargetingState, stepAutomaticTargeting } from '../src/core/autoCombat';
import { createMapGrid } from '../src/core/map';
import { createWorld } from '../src/core/world';
import { MAP_CONFIG } from '../src/config/map';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const unit = world.createUnit({
    type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
  });
  return { grid, world, unit };
}

describe('Attack-Move', () => {
  it('travels, engages an acquired enemy, resumes its route, then completes', () => {
    const { grid, world, unit } = setup();
    const target = world.createUnit({
      type: 'worker', owner: 'ai', faction: 'ember', position: grid.tileCenter(12, 10),
    });
    const destination = grid.tileCenter(16, 10);
    expect(issueAttackMoveOrders(world, grid, 'player', [unit.id], destination)).toEqual([unit.id]);

    const targeting = createAutoTargetingState();
    stepAutomaticTargeting(world, targeting, 0.25, { targetScanIntervalSeconds: 0.25, acquisitionRangeTiles: 7 });
    expect(unit.order).toMatchObject({ kind: 'AttackMove', engagement: { targetId: target.id, source: 'attackMove' } });
    expect(stepAttackMoveOrders(world, grid, 0)).toHaveLength(1);
    expect(unit.status).toBe('attacking');

    world.damage(target.id, target.health);
    stepAttackMoveOrders(world, grid, 0);
    expect(unit.order).toMatchObject({ kind: 'AttackMove', engagement: null });
    expect(unit.status).toBe('moving');

    for (let index = 0; index < 100 && unit.order !== null; index++) stepAttackMoveOrders(world, grid, 0.1);
    expect(unit.order).toBeNull();
    expect(unit.status).toBe('idle');
    expect(unit.position.x).toBeCloseTo(destination.x - 0.08 * grid.tileSizePixels);
  });

  it('marks a selected combat unit failed when no route reaches its destination', () => {
    const sealed: MapConfig = {
      id: 'sealed', name: 'Sealed', widthTiles: 5, heightTiles: 3, tileSizePixels: 30,
      regions: [{ terrain: 'rock', area: { tx: 2, ty: 0, width: 1, height: 3 } }],
      resourceFields: [], starts: [], lanes: [],
    };
    const grid = createMapGrid(sealed);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const unit = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(0, 1),
    });

    expect(issueAttackMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(4, 1))).toEqual([]);
    expect(unit.order).toBeNull();
    expect(unit.status).toBe('failed');
  });
});
