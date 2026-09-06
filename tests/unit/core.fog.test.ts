import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { createEconomy } from '../../src/core/economy';
import {
  cellVisibility,
  createFogState,
  isEntityVisibleToPlayer,
  restoreFogState,
  serializeFogState,
  stepFogVisibility,
  updateFogVisibility,
} from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { restoreWorld, serializeWorld } from '../../src/core/snapshot';
import { createWorld } from '../../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  return { grid, world };
}

describe('fog-of-war visibility rules', () => {
  it('reveals the deterministic circular radius of a friendly unit while cells outside it stay hidden', () => {
    const { grid, world } = setup();
    world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const fog = createFogState(grid);

    updateFogVisibility(fog, world, grid);

    expect(cellVisibility(fog, 'player', 10, 10)).toBe('visible');
    expect(cellVisibility(fog, 'player', 16, 10)).toBe('visible');
    expect(cellVisibility(fog, 'player', 16, 13)).toBe('hidden'); // Outside the radius-6 circle.
    expect(cellVisibility(fog, 'player', 30, 30)).toBe('hidden');
    expect(cellVisibility(fog, 'ai', 10, 10)).toBe('hidden');
  });

  it('reveals from a friendly building using its configured vision range', () => {
    const { grid, world } = setup();
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 20, ty: 20 } });
    const fog = createFogState(grid);

    updateFogVisibility(fog, world, grid);

    // A 4×4 HQ is centred on tile 22,22; its configured radius is seven tiles.
    expect(cellVisibility(fog, 'player', 29, 22)).toBe('visible');
    expect(cellVisibility(fog, 'player', 30, 22)).toBe('hidden');
  });

  it('ages formerly visible cells to explored when all vision leaves', () => {
    const { grid, world } = setup();
    const scout = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);
    world.setPosition(scout.id, grid.tileCenter(30, 30));

    updateFogVisibility(fog, world, grid);

    expect(cellVisibility(fog, 'player', 10, 10)).toBe('explored');
    expect(cellVisibility(fog, 'player', 30, 30)).toBe('visible');
  });

  it('keeps overlapping vision visible after one source moves or dies', () => {
    const { grid, world } = setup();
    const first = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const second = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(14, 10),
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);
    world.setPosition(first.id, grid.tileCenter(35, 35));

    updateFogVisibility(fog, world, grid);
    expect(cellVisibility(fog, 'player', 12, 10)).toBe('visible');
    world.damage(second.id, 9999);

    updateFogVisibility(fog, world, grid);
    expect(cellVisibility(fog, 'player', 12, 10)).toBe('explored');
  });

  it('does not let destroyed units or buildings reveal cells', () => {
    const { grid, world } = setup();
    const unit = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const building = world.createBuilding({
      type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 40, ty: 40 },
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);
    world.damage(unit.id, 9999);
    world.damage(building.id, 9999);

    updateFogVisibility(fog, world, grid);

    expect(cellVisibility(fog, 'player', 10, 10)).toBe('explored');
    expect(cellVisibility(fog, 'player', 42, 42)).toBe('explored');
  });

  it('permits enemy entity queries only while that enemy tile is currently visible', () => {
    const { grid, world } = setup();
    const scout = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const enemy = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: grid.tileCenter(12, 10),
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);

    expect(isEntityVisibleToPlayer(fog, 'player', enemy)).toBe(true);
    expect(isEntityVisibleToPlayer(fog, 'player', scout)).toBe(true);
    world.setPosition(scout.id, grid.tileCenter(35, 35));
    updateFogVisibility(fog, world, grid);
    expect(isEntityVisibleToPlayer(fog, 'player', enemy)).toBe(false);
  });

  it('handles invalid cells and off-map entities safely', () => {
    const { grid, world } = setup();
    const enemy = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: { x: -1, y: -1 },
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);

    expect(cellVisibility(fog, 'player', -1, 0)).toBe('hidden');
    expect(cellVisibility(fog, 'player', 0.5, 0)).toBe('hidden');
    expect(cellVisibility(fog, 'player', 64, 0)).toBe('hidden');
    expect(isEntityVisibleToPlayer(fog, 'player', enemy)).toBe(false);
  });

  it('updates only at its configured low-frequency interval', () => {
    const { grid, world } = setup();
    const scout = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const fog = createFogState(grid, ['player'], { updateIntervalSeconds: 0.5, radiusShape: 'circle' });

    expect(stepFogVisibility(fog, world, grid, 0.49)).toBe(false);
    expect(cellVisibility(fog, 'player', 10, 10)).toBe('hidden');
    expect(stepFogVisibility(fog, world, grid, 0.01)).toBe(true);
    expect(cellVisibility(fog, 'player', 10, 10)).toBe('visible');
    world.setPosition(scout.id, grid.tileCenter(30, 30));
    expect(stepFogVisibility(fog, world, grid, 0.49)).toBe(false);
    expect(cellVisibility(fog, 'player', 10, 10)).toBe('visible');
    expect(stepFogVisibility(fog, world, grid, 0.01)).toBe(true);
    expect(cellVisibility(fog, 'player', 10, 10)).toBe('explored');
  });

  it('is deterministic for identical grid and world input', () => {
    const left = setup();
    const right = setup();
    for (const current of [left, right]) {
      current.world.createUnit({
        type: 'rocket', owner: 'player', faction: 'meridian', position: current.grid.tileCenter(14, 14),
      });
      current.world.createBuilding({
        type: 'barracks', owner: 'ai', faction: 'ember', topLeft: { tx: 40, ty: 40 },
      });
    }
    const leftFog = createFogState(left.grid);
    const rightFog = createFogState(right.grid);
    updateFogVisibility(leftFog, left.world, left.grid);
    updateFogVisibility(rightFog, right.world, right.grid);

    expect(serializeFogState(leftFog)).toEqual(serializeFogState(rightFog));
  });

  it('preserves explored and visible fog through the versioned match snapshot', () => {
    const { grid, world } = setup();
    const scout = world.createUnit({
      type: 'worker', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const fog = createFogState(grid);
    updateFogVisibility(fog, world, grid);
    world.setPosition(scout.id, grid.tileCenter(30, 30));
    updateFogVisibility(fog, world, grid);
    stepFogVisibility(fog, world, grid, 0.1);

    const snapshot = serializeWorld(
      world,
      [],
      createEconomy(),
      createResourceFieldState(grid),
      fog,
      grid,
    );
    const restored = restoreWorld(snapshot, grid);

    expect(serializeFogState(restored.fog)).toEqual(serializeFogState(fog));
    expect(cellVisibility(restored.fog, 'player', 10, 10)).toBe('explored');
    expect(cellVisibility(restored.fog, 'player', 30, 30)).toBe('visible');
    expect(serializeFogState(restoreFogState(snapshot.fog, grid))).toEqual(serializeFogState(fog));
  });
});
