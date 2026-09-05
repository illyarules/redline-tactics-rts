import { describe, expect, it } from 'vitest';
import type { MapConfig } from '../src/config/types';
import { MAP_CONFIG } from '../src/config/map';
import { issueAttackOrders, stepAttackOrders } from '../src/core/attack';
import { stepAttackCooldowns } from '../src/core/combat';
import { createMapGrid } from '../src/core/map';
import { createWorld } from '../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  return { grid, world };
}

describe('explicit attack orders', () => {
  it('issues Attack only to selected friendly combat units, never Workers or buildings', () => {
    const { grid, world } = setup();
    const infantry = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(2, 2) });
    const worker = world.createUnit({ type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(3, 2) });
    const hq = world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 2 } });
    const target = world.createUnit({ type: 'tank', owner: 'ai', faction: 'ember', position: grid.tileCenter(20, 2) });

    expect(issueAttackOrders(world, 'player', [infantry.id, worker.id, hq.id], target.id)).toEqual([infantry.id]);
    expect(infantry.order).toEqual(expect.objectContaining({ kind: 'Attack', targetId: target.id }));
    expect(infantry.status).toBe('moving');
    expect(worker.order).toBeNull();
    expect(hq.order).toBeNull();
  });

  it('pursues until in range, then fires on cooldown without replacing the Attack order', () => {
    const { grid, world } = setup();
    const infantry = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(2, 2) });
    const target = world.createUnit({ type: 'tank', owner: 'ai', faction: 'ember', position: grid.tileCenter(12, 2) });
    const health = target.health;
    issueAttackOrders(world, 'player', [infantry.id], target.id);

    let hitCount = 0;
    for (let index = 0; index < 100 && hitCount === 0; index++) {
      stepAttackCooldowns(world, 0.1);
      hitCount += stepAttackOrders(world, grid, 0.1).length;
    }

    expect(hitCount).toBe(1);
    expect(target.health).toBeLessThan(health);
    expect(infantry.order).toEqual(expect.objectContaining({ kind: 'Attack', targetId: target.id }));
    expect(infantry.status).toBe('attacking');
  });

  it('becomes idle when its target dies or is invalid', () => {
    const { grid, world } = setup();
    const infantry = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(2, 2) });
    const target = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: grid.tileCenter(3, 2), health: 1,
    });
    issueAttackOrders(world, 'player', [infantry.id], target.id);

    expect(stepAttackOrders(world, grid, 0)).toMatchObject([{ kind: 'hit', destroyed: true }]);
    expect(target.status).toBe('destroyed');
    stepAttackOrders(world, grid, 0);
    expect(infantry.order).toBeNull();
    expect(infantry.status).toBe('idle');
  });

  it('becomes idle when no path can reach an out-of-range target', () => {
    const blockedMap: MapConfig = {
      id: 'sealed', name: 'Sealed', widthTiles: 5, heightTiles: 3, tileSizePixels: 30,
      regions: [{ terrain: 'rock', area: { tx: 2, ty: 0, width: 1, height: 3 } }],
      resourceFields: [], starts: [], lanes: [],
    };
    const grid = createMapGrid(blockedMap);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const infantry = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(0, 1) });
    const target = world.createUnit({ type: 'tank', owner: 'ai', faction: 'ember', position: grid.tileCenter(4, 1) });
    issueAttackOrders(world, 'player', [infantry.id], target.id);

    expect(stepAttackOrders(world, grid, 0.1)).toEqual([]);
    expect(infantry.order).toBeNull();
    expect(infantry.status).toBe('idle');
  });
});
