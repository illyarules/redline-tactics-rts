import { describe, expect, it } from 'vitest';
import type { TerrainRegionConfig } from '../../src/config/types';
import { checkBuildingPlacement } from '../../src/core/placement';
import { createMapGrid, type MapGrid } from '../../src/core/map';
import { createWorld, type World } from '../../src/core/world';

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

function world(g: MapGrid): World {
  return createWorld({ tileSizePixels: g.tileSizePixels });
}

describe('checkBuildingPlacement', () => {
  it('accepts a footprint that is fully in bounds, passable and unoccupied', () => {
    const g = grid(20, 20);
    const w = world(g);
    expect(checkBuildingPlacement(w, g, 'barracks', { tx: 5, ty: 5 })).toEqual({ valid: true, reasons: [] });
  });

  it('rejects a footprint that runs off the edge of the map', () => {
    const g = grid(10, 10);
    const w = world(g);
    // Barracks is 3x3; topLeft (8, 8) runs two tiles past the 10x10 edge.
    expect(checkBuildingPlacement(w, g, 'barracks', { tx: 8, ty: 8 })).toEqual({
      valid: false,
      reasons: ['out-of-bounds'],
    });
  });

  it('rejects a footprint that overlaps blocked terrain', () => {
    const g = grid(20, 20, [{ terrain: 'rock', area: { tx: 5, ty: 5, width: 4, height: 4 } }]);
    const w = world(g);
    expect(checkBuildingPlacement(w, g, 'barracks', { tx: 4, ty: 4 })).toEqual({
      valid: false,
      reasons: ['blocked-terrain'],
    });
  });

  it('accepts otherwise-clear forest but rejects rock', () => {
    const g = grid(20, 20, [
      { terrain: 'forest', area: { tx: 2, ty: 2, width: 4, height: 4 } },
      { terrain: 'rock', area: { tx: 10, ty: 10, width: 4, height: 4 } },
    ]);
    const w = world(g);
    expect(checkBuildingPlacement(w, g, 'barracks', { tx: 2, ty: 2 })).toEqual({ valid: true, reasons: [] });
    expect(checkBuildingPlacement(w, g, 'barracks', { tx: 10, ty: 10 })).toEqual({
      valid: false,
      reasons: ['blocked-terrain'],
    });
  });

  it('rejects a footprint that overlaps another building', () => {
    const g = grid(20, 20);
    const w = world(g);
    w.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 5, ty: 5 } });
    // Power Plant is 3x3, offset by one tile so the two footprints overlap without coinciding.
    expect(checkBuildingPlacement(w, g, 'powerPlant', { tx: 7, ty: 7 })).toEqual({
      valid: false,
      reasons: ['occupied'],
    });
  });

  it('accepts a footprint that sits flush against another building without overlapping it', () => {
    const g = grid(20, 20);
    const w = world(g);
    w.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 5, ty: 5 } });
    expect(checkBuildingPlacement(w, g, 'powerPlant', { tx: 8, ty: 5 })).toEqual({ valid: true, reasons: [] });
  });

  it('reports blocked terrain and occupancy together when both apply', () => {
    const g = grid(20, 20, [{ terrain: 'rock', area: { tx: 5, ty: 5, width: 4, height: 4 } }]);
    const w = world(g);
    w.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 5, ty: 5 } });
    const result = checkBuildingPlacement(w, g, 'powerPlant', { tx: 6, ty: 6 });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['blocked-terrain', 'occupied']));
  });
});
