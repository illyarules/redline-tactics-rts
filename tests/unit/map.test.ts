import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { BUILDING_CONFIG } from '../../src/config/buildings';
import { createMapGrid, resourceFieldTiles, type MapGrid } from '../../src/core/map';
import { PLAYER_IDS, type PlayerId } from '../../src/core/ids';
import { tileRectContains, type TileCoord, type TileRect } from '../../src/core/geometry';

const grid = createMapGrid(MAP_CONFIG);

function key(grid: MapGrid, tile: TileCoord): number {
  return tile.ty * grid.widthTiles + tile.tx;
}

/**
 * Breadth-first search over passable tiles, four-directional and deliberately naive: these tests
 * assert that the map's shape is navigable, not how units will be routed (that is task 11).
 */
function isReachable(grid: MapGrid, from: TileCoord, to: TileCoord): boolean {
  const passable = (tile: TileCoord): boolean => grid.isPassable(tile.tx, tile.ty);

  if (!passable(from) || !passable(to)) {
    return false;
  }

  const seen = new Set<number>([key(grid, from)]);
  const queue: TileCoord[] = [from];

  while (queue.length > 0) {
    const tile = queue.shift() as TileCoord;
    if (tile.tx === to.tx && tile.ty === to.ty) {
      return true;
    }
    const neighbors: TileCoord[] = [
      { tx: tile.tx + 1, ty: tile.ty },
      { tx: tile.tx - 1, ty: tile.ty },
      { tx: tile.tx, ty: tile.ty + 1 },
      { tx: tile.tx, ty: tile.ty - 1 },
    ];
    for (const next of neighbors) {
      const id = key(grid, next);
      if (!seen.has(id) && passable(next)) {
        seen.add(id);
        queue.push(next);
      }
    }
  }
  return false;
}

function startOf(player: PlayerId) {
  const start = grid.startFor(player);
  if (start === undefined) {
    throw new Error(`no start for ${player}`);
  }
  return start;
}

function hqRect(player: PlayerId): TileRect {
  const { hqTopLeft } = startOf(player);
  const { width, height } = BUILDING_CONFIG.hq.footprint;
  return { tx: hqTopLeft.tx, ty: hqTopLeft.ty, width, height };
}

/** Every tile of a rectangle, as a flat list. */
function tilesOf(rect: TileRect): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let ty = rect.ty; ty < rect.ty + rect.height; ty++) {
    for (let tx = rect.tx; tx < rect.tx + rect.width; tx++) {
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

describe('map data', () => {
  it('is a 64 x 64 battlefield with pixel bounds derived from the tile size', () => {
    expect(grid.widthTiles).toBe(64);
    expect(grid.heightTiles).toBe(64);
    expect(grid.bounds).toEqual({
      x: 0,
      y: 0,
      width: 64 * MAP_CONFIG.tileSizePixels,
      height: 64 * MAP_CONFIG.tileSizePixels,
    });
  });

  it('has two starts, two resource fields and one central route', () => {
    expect(grid.starts.map((start) => start.player).sort()).toEqual([...PLAYER_IDS].sort());
    expect(grid.resourceFields).toHaveLength(2);
    expect(grid.lanes).toHaveLength(1);
  });

  it('gives every resource field and lane a unique id', () => {
    expect(new Set(grid.resourceFields.map((field) => field.id)).size).toBe(2);
    expect(new Set(grid.lanes.map((lane) => lane.id)).size).toBe(1);
  });

  it('builds the same terrain every time from the same config', () => {
    const other = createMapGrid(MAP_CONFIG);
    for (let ty = 0; ty < grid.heightTiles; ty++) {
      for (let tx = 0; tx < grid.widthTiles; tx++) {
        expect(other.terrainAt(tx, ty)).toBe(grid.terrainAt(tx, ty));
      }
    }
  });

  it('keeps the layout rotationally symmetric so both starts are equal', () => {
    for (let ty = 0; ty < grid.heightTiles; ty++) {
      for (let tx = 0; tx < grid.widthTiles; tx++) {
        expect(grid.terrainAt(tx, ty)).toBe(grid.terrainAt(63 - tx, 63 - ty));
      }
    }
  });
});

describe('open field', () => {
  it('configures no terrain regions at all', () => {
    expect(MAP_CONFIG.regions).toEqual([]);
  });

  it('has no blocked cell anywhere in bounds', () => {
    const blocked: string[] = [];
    for (let ty = 0; ty < grid.heightTiles; ty++) {
      for (let tx = 0; tx < grid.widthTiles; tx++) {
        if (!grid.isPassable(tx, ty)) {
          blocked.push(`${tx},${ty}`);
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it('is ground everywhere, with no rock and no water', () => {
    const kinds = new Set<string>();
    for (let ty = 0; ty < grid.heightTiles; ty++) {
      for (let tx = 0; tx < grid.widthTiles; tx++) {
        kinds.add(grid.terrainAt(tx, ty) as string);
      }
    }
    expect(kinds).toEqual(new Set(['ground']));
  });

  it('leaves a wide empty band across the middle', () => {
    // Nothing — no base area, no HQ, no resource tile — may sit in the central columns.
    const occupied = new Set<number>();
    for (const start of grid.starts) {
      for (const tile of [...tilesOf(start.baseArea), ...tilesOf(hqRect(start.player))]) {
        occupied.add(tile.tx);
      }
    }
    for (const field of grid.resourceFields) {
      for (const tile of field.tiles) {
        occupied.add(tile.tx);
      }
    }

    const empty = [...Array(grid.widthTiles).keys()].filter((tx) => !occupied.has(tx));
    const centre = empty.filter((tx) => tx > 15 && tx < 48);
    expect(centre.length).toBeGreaterThanOrEqual(16);
    // The empty columns must be one unbroken band, not scattered gaps.
    expect(Math.max(...centre) - Math.min(...centre) + 1).toBe(centre.length);
  });
});

describe('map bounds', () => {
  it('treats everything outside the map as blocked', () => {
    for (const tile of [
      { tx: -1, ty: 0 },
      { tx: 0, ty: -1 },
      { tx: 64, ty: 10 },
      { tx: 10, ty: 64 },
    ]) {
      expect(grid.isInBounds(tile.tx, tile.ty)).toBe(false);
      expect(grid.terrainAt(tile.tx, tile.ty)).toBeUndefined();
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(false);
    }
  });

  it('converts between tiles and world positions', () => {
    const size = MAP_CONFIG.tileSizePixels;
    expect(grid.tileCenter(0, 0)).toEqual({ x: size / 2, y: size / 2 });
    expect(grid.worldToTile({ x: size * 3.5, y: size * 7.25 })).toEqual({ tx: 3, ty: 7 });
    expect(grid.worldToTile(grid.tileCenter(41, 17))).toEqual({ tx: 41, ty: 17 });
  });
});

describe('starts', () => {
  it.each([...PLAYER_IDS])('keeps the whole %s base area in bounds', (player: PlayerId) => {
    for (const tile of tilesOf(startOf(player).baseArea)) {
      expect(grid.isInBounds(tile.tx, tile.ty)).toBe(true);
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
    }
  });

  it.each([...PLAYER_IDS])('fits the %s HQ footprint inside its base area', (player: PlayerId) => {
    const { baseArea } = startOf(player);
    for (const tile of tilesOf(hqRect(player))) {
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
      expect(tileRectContains(baseArea, tile)).toBe(true);
    }
  });

  it.each([...PLAYER_IDS])('puts the %s rally point on open ground', (player: PlayerId) => {
    const { rallyPoint, baseArea } = startOf(player);
    expect(grid.isPassable(rallyPoint.tx, rallyPoint.ty)).toBe(true);
    expect(tileRectContains(baseArea, rallyPoint)).toBe(true);
    expect(tileRectContains(hqRect(player), rallyPoint)).toBe(false);
  });

  it('places the two bases against opposite map edges', () => {
    const playerBase = startOf('player').baseArea;
    const aiBase = startOf('ai').baseArea;

    // One base hugs the west edge, the other the east edge, both within two tiles of it.
    expect(playerBase.tx).toBeLessThanOrEqual(2);
    expect(grid.widthTiles - (aiBase.tx + aiBase.width)).toBeLessThanOrEqual(2);

    // They face each other across the map rather than sitting in diagonal corners.
    expect(playerBase.ty).toBe(aiBase.ty);
    expect(playerBase.height).toBe(aiBase.height);
  });

  it('keeps the two base areas far apart and non-overlapping', () => {
    const playerBase = startOf('player').baseArea;
    const aiBase = startOf('ai').baseArea;
    const gap = aiBase.tx - (playerBase.tx + playerBase.width);

    expect(gap).toBeGreaterThanOrEqual(grid.widthTiles / 2);
    for (const tile of tilesOf(playerBase)) {
      expect(tileRectContains(aiBase, tile)).toBe(false);
    }
  });

  it('connects the two starts', () => {
    expect(isReachable(grid, startOf('player').rallyPoint, startOf('ai').rallyPoint)).toBe(true);
  });
});

describe('resource fields', () => {
  it('resolves a field into the disc of tiles around its centre', () => {
    const tiles = resourceFieldTiles({
      id: 'test',
      center: { tx: 10, ty: 10 },
      radiusTiles: 1,
      credits: 100,
      contested: false,
    });
    expect(tiles).toEqual([
      { tx: 10, ty: 9 },
      { tx: 9, ty: 10 },
      { tx: 10, ty: 10 },
      { tx: 11, ty: 10 },
      { tx: 10, ty: 11 },
    ]);
  });

  it('places every field tile in bounds and on passable ground', () => {
    for (const field of grid.resourceFields) {
      expect(field.tiles.length).toBeGreaterThan(0);
      expect(field.credits).toBeGreaterThan(0);
      for (const tile of field.tiles) {
        expect(grid.isInBounds(tile.tx, tile.ty)).toBe(true);
        expect(grid.terrainAt(tile.tx, tile.ty)).toBe('ground');
        expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
      }
    }
  });

  it('lets both players reach every field', () => {
    for (const field of grid.resourceFields) {
      for (const player of PLAYER_IDS) {
        expect(isReachable(grid, startOf(player).rallyPoint, field.center)).toBe(true);
      }
    }
  });

  it('gives each player exactly one field nearer to them than to the enemy', () => {
    const playerBase = startOf('player').rallyPoint;
    const aiBase = startOf('ai').rallyPoint;

    const nearer = grid.resourceFields.map((field) => {
      const toPlayer = Math.hypot(field.center.tx - playerBase.tx, field.center.ty - playerBase.ty);
      const toAi = Math.hypot(field.center.tx - aiBase.tx, field.center.ty - aiBase.ty);
      return toPlayer < toAi ? 'player' : 'ai';
    });

    expect(nearer.sort()).toEqual([...PLAYER_IDS].sort());
  });

  it('puts each field just outside its own base, at an equal distance for both players', () => {
    const distances = grid.resourceFields.map((field) => {
      const start = grid.starts
        .map((candidate) => ({
          candidate,
          distance: Math.hypot(
            field.center.tx - candidate.rallyPoint.tx,
            field.center.ty - candidate.rallyPoint.ty,
          ),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (start === undefined) {
        throw new Error('no start to measure against');
      }

      // Near the base, but not inside it: workers must walk out to gather.
      for (const tile of field.tiles) {
        expect(tileRectContains(start.candidate.baseArea, tile)).toBe(false);
      }
      return start.distance;
    });

    expect(distances).toHaveLength(2);
    expect(Math.abs((distances[0] as number) - (distances[1] as number))).toBeLessThan(1);
    for (const distance of distances) {
      expect(distance).toBeLessThan(grid.widthTiles / 4);
    }
  });

  it('leaves both fields uncontested, one per base', () => {
    expect(grid.resourceFields.filter((field) => field.contested)).toHaveLength(0);
  });
});

describe('lanes', () => {
  it('runs the central route over passable ground', () => {
    for (const lane of grid.lanes) {
      expect(lane.waypoints.length).toBeGreaterThan(1);
      for (const point of lane.waypoints) {
        expect(grid.isPassable(point.tx, point.ty)).toBe(true);
      }
    }
  });

  it('connects the route start-to-start through its waypoints', () => {
    for (const lane of grid.lanes) {
      const route = [startOf('player').rallyPoint, ...lane.waypoints, startOf('ai').rallyPoint];
      for (let i = 0; i < route.length - 1; i++) {
        expect(isReachable(grid, route[i] as TileCoord, route[i + 1] as TileCoord)).toBe(true);
      }
    }
  });

  it('crosses the empty middle without touching either base area', () => {
    for (const lane of grid.lanes) {
      for (const point of lane.waypoints) {
        for (const start of grid.starts) {
          expect(tileRectContains(start.baseArea, point)).toBe(false);
        }
      }
    }
  });
});
