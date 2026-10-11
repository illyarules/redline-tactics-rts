import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { createMapGrid } from '../../src/core/map';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { createWorld } from '../../src/core/world';
import { localBattleViewState } from '../../src/game/battleViewState';

describe('localBattleViewState', () => {
  it('projects entities, selection, resources and visibility without exposing world mutation', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    populateStartingEntities(world, grid);
    const fields = createResourceFieldState(grid);
    const selected = world.units('player')[0]!;
    const hidden = world.units('ai')[0]!;
    const field = grid.resourceFields[0]!;
    fields.take(field.id, 125);

    const state = localBattleViewState(
      world,
      grid,
      fields,
      [selected.id],
      (entity) => entity.owner === 'player',
    );

    expect(state.entities).toEqual(world.entities());
    expect(state.selectedIds).toEqual([selected.id]);
    expect(state.fieldFractions.get(field.id)).toBe((field.credits - 125) / field.credits);
    expect(state.isVisible(selected)).toBe(true);
    expect(state.positionOfVisibleTarget(selected.id)).toEqual(selected.position);
    expect(state.positionOfVisibleTarget(hidden.id)).toBeNull();
  });

  it('keeps an already-created view stable when the authoritative world changes later', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    populateStartingEntities(world, grid);
    const fields = createResourceFieldState(grid);
    const field = grid.resourceFields[0]!;
    const state = localBattleViewState(world, grid, fields, [], () => true);

    fields.take(field.id, 200);

    expect(state.fieldFractions.get(field.id)).toBe(1);
  });
});
