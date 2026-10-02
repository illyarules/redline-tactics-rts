import { describe, expect, test } from 'vitest';
import { MAP_CONFIG, TRIDENT_BASIN_CONFIG } from '../../src/config/map';
import { createFogState, updateFogVisibility } from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { inspectResourceField } from '../../src/core/resourceFieldInspection';
import { createWorld } from '../../src/core/world';

describe('resource field inspection', () => {
  test.each([MAP_CONFIG, TRIDENT_BASIN_CONFIG])('identifies visible deposits on $name', (config) => {
    const grid = createMapGrid(config);
    const fog = createFogState(grid, grid.starts.map((start) => start.player));
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const field = grid.resourceFields.find((candidate) => candidate.homeFor === 'player');
    expect(field).toBeDefined();
    if (field === undefined) return;
    const point = grid.tileCenter(field.center.tx, field.center.ty);
    expect(inspectResourceField(grid, fog, 'player', point)).toBeNull();
    world.createUnit({ type: 'worker', owner: 'player', faction: 'meridian', position: point });
    updateFogVisibility(fog, world, grid);
    expect(inspectResourceField(grid, fog, 'player', point)?.id).toBe(field.id);
    expect(inspectResourceField(grid, fog, 'player', { x: -1, y: -1 })).toBeNull();
    world.remove(world.units('player')[0]!.id);
    updateFogVisibility(fog, world, grid);
    expect(inspectResourceField(grid, fog, 'player', point)).toBeNull();
  });
});
