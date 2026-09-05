import { describe, expect, it } from 'vitest';
import { createMapGrid, type MapGrid } from '../src/core/map';
import { findPath, planRoute, resolveDestination } from '../src/core/pathfinding';
import type { TerrainRegionConfig } from '../src/config/types';

function grid(widthTiles: number, heightTiles: number, regions: readonly TerrainRegionConfig[] = []): MapGrid {
  return createMapGrid({
    id: 'test',
    name: 'test',
    widthTiles,
    heightTiles,
    tileSizePixels: 10,
    regions,
    resourceFields: [],
    starts: [],
    lanes: [],
  });
}

describe('findPath', () => {
  it('returns a straight route across open passable ground', () => {
    const g = grid(5, 5);
    const result = findPath(g, { tx: 0, ty: 0 }, { tx: 4, ty: 0 });
    expect(result).toEqual({
      found: true,
      tiles: [
        { tx: 0, ty: 0 },
        { tx: 1, ty: 0 },
        { tx: 2, ty: 0 },
        { tx: 3, ty: 0 },
        { tx: 4, ty: 0 },
      ],
    });
  });

  it('returns a single-tile route when start and goal coincide', () => {
    const g = grid(3, 3);
    expect(findPath(g, { tx: 1, ty: 1 }, { tx: 1, ty: 1 })).toEqual({
      found: true,
      tiles: [{ tx: 1, ty: 1 }],
    });
  });

  it('detours around a solid wall of blocked terrain, through its gap', () => {
    const g = grid(7, 5, [{ terrain: 'rock', area: { tx: 3, ty: 0, width: 1, height: 4 } }]);
    const result = findPath(g, { tx: 0, ty: 0 }, { tx: 6, ty: 0 });
    expect(result.found).toBe(true);
    if (!result.found) return;

    for (const blocked of [{ tx: 3, ty: 0 }, { tx: 3, ty: 1 }, { tx: 3, ty: 2 }, { tx: 3, ty: 3 }]) {
      expect(result.tiles).not.toContainEqual(blocked);
    }
    // The only way past column 3 is its one open row.
    expect(result.tiles).toContainEqual({ tx: 3, ty: 4 });
    expect(result.tiles[0]).toEqual({ tx: 0, ty: 0 });
    expect(result.tiles[result.tiles.length - 1]).toEqual({ tx: 6, ty: 0 });
  });

  it('detours around a building footprint given as an isBlocked predicate', () => {
    const g = grid(7, 5);
    const isBlocked = (tile: { tx: number; ty: number }): boolean =>
      tile.tx === 3 && tile.ty >= 0 && tile.ty <= 3;
    const result = findPath(g, { tx: 0, ty: 0 }, { tx: 6, ty: 0 }, isBlocked);
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.tiles.some((tile) => tile.tx === 3 && tile.ty <= 3)).toBe(false);
  });

  it('never cuts across a blocked corner: a diagonal step needs both flanking tiles walkable', () => {
    const g = grid(3, 3, [{ terrain: 'rock', area: { tx: 1, ty: 0, width: 1, height: 1 } }]);
    const result = findPath(g, { tx: 0, ty: 0 }, { tx: 1, ty: 1 });
    // The direct diagonal (0,0)->(1,1) is cheaper, but blocked because (1,0) is a flank of it.
    expect(result).toEqual({
      found: true,
      tiles: [
        { tx: 0, ty: 0 },
        { tx: 0, ty: 1 },
        { tx: 1, ty: 1 },
      ],
    });
  });

  it('reports no path when the goal is completely walled in on every side', () => {
    const g = grid(5, 5, [
      { terrain: 'rock', area: { tx: 1, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 2, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 1, ty: 2, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 2, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 1, ty: 3, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 2, ty: 3, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 3, width: 1, height: 1 } },
    ]);
    // (2,2) itself is open ground, but nothing borders it, so it can never be reached.
    expect(g.isPassable(2, 2)).toBe(true);
    expect(findPath(g, { tx: 0, ty: 0 }, { tx: 2, ty: 2 })).toEqual({ found: false });
  });

  it('reports no path when the goal itself is not walkable', () => {
    const g = grid(3, 3, [{ terrain: 'rock', area: { tx: 2, ty: 2, width: 1, height: 1 } }]);
    expect(findPath(g, { tx: 0, ty: 0 }, { tx: 2, ty: 2 })).toEqual({ found: false });
  });

  it('produces an identical route for identical inputs, run after run', () => {
    const g = grid(9, 6, [{ terrain: 'rock', area: { tx: 4, ty: 0, width: 1, height: 4 } }]);
    const first = findPath(g, { tx: 0, ty: 2 }, { tx: 8, ty: 2 });
    const second = findPath(g, { tx: 0, ty: 2 }, { tx: 8, ty: 2 });
    expect(second).toEqual(first);
  });
});

describe('resolveDestination', () => {
  it('returns the target itself when it is already walkable', () => {
    const g = grid(5, 5);
    expect(resolveDestination(g, { tx: 2, ty: 2 })).toEqual({ tx: 2, ty: 2 });
  });

  it('resolves a blocked target to the nearest walkable tile', () => {
    const g = grid(5, 5);
    const isBlocked = (tile: { tx: number; ty: number }): boolean => tile.tx === 2 && tile.ty === 2;
    expect(resolveDestination(g, { tx: 2, ty: 2 }, isBlocked, 2)).toEqual({ tx: 1, ty: 1 });
  });

  it('returns null when nothing within the search radius is walkable', () => {
    const g = grid(7, 7, [{ terrain: 'rock', area: { tx: 1, ty: 1, width: 3, height: 3 } }]);
    expect(resolveDestination(g, { tx: 2, ty: 2 }, undefined, 1)).toBeNull();
  });
});

describe('planRoute', () => {
  it('finds a direct route when the target is already reachable', () => {
    const g = grid(5, 5);
    const plan = planRoute(g, { tx: 0, ty: 0 }, { tx: 4, ty: 0 });
    expect(plan).toEqual({
      found: true,
      resolvedTarget: { tx: 4, ty: 0 },
      tiles: [
        { tx: 1, ty: 0 },
        { tx: 2, ty: 0 },
        { tx: 3, ty: 0 },
        { tx: 4, ty: 0 },
      ],
    });
  });

  it('resolves a blocked destination and routes to the resolved tile', () => {
    const g = grid(5, 5);
    const isBlocked = (tile: { tx: number; ty: number }): boolean => tile.tx === 2 && tile.ty === 2;
    const plan = planRoute(g, { tx: 0, ty: 0 }, { tx: 2, ty: 2 }, isBlocked);
    expect(plan.found).toBe(true);
    if (!plan.found) return;
    expect(plan.resolvedTarget).toEqual({ tx: 1, ty: 1 });
    expect(plan.tiles[plan.tiles.length - 1]).toEqual({ tx: 1, ty: 1 });
  });

  it('fails when the target has no walkable tile within the search radius', () => {
    const g = grid(7, 7, [{ terrain: 'rock', area: { tx: 1, ty: 1, width: 3, height: 3 } }]);
    expect(planRoute(g, { tx: 0, ty: 0 }, { tx: 2, ty: 2 }, undefined, 1)).toEqual({ found: false });
  });

  it('fails when the resolved tile is walkable but sealed off from the start', () => {
    const g = grid(5, 5, [
      { terrain: 'rock', area: { tx: 1, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 2, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 1, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 1, ty: 2, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 2, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 1, ty: 3, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 2, ty: 3, width: 1, height: 1 } },
      { terrain: 'rock', area: { tx: 3, ty: 3, width: 1, height: 1 } },
    ]);
    expect(planRoute(g, { tx: 0, ty: 0 }, { tx: 2, ty: 2 })).toEqual({ found: false });
  });

  it('produces an identical plan for identical inputs, run after run', () => {
    const g = grid(9, 6, [{ terrain: 'rock', area: { tx: 4, ty: 0, width: 1, height: 4 } }]);
    const first = planRoute(g, { tx: 0, ty: 2 }, { tx: 8, ty: 2 });
    const second = planRoute(g, { tx: 0, ty: 2 }, { tx: 8, ty: 2 });
    expect(second).toEqual(first);
  });
});
