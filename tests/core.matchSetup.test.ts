import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { MATCH_SETUP } from '../src/config/match';
import type { MatchSetupConfig } from '../src/config/types';
import { footprintRect, isBuilding, isUnit } from '../src/core/entities';
import { tileRectContains } from '../src/core/geometry';
import { createMapGrid, type MapGrid } from '../src/core/map';
import { isUnderBuilding, nearbyFreeTiles, populateStartingEntities } from '../src/core/matchSetup';
import { createWorld, type World } from '../src/core/world';
import {
  FACTION_IDS,
  PLAYER_IDS,
  UNIT_TYPE_IDS,
  type PlayerId,
} from '../src/core/ids';
import { UNIT_CONFIG } from '../src/config/units';

function newMatch(setup?: MatchSetupConfig): { grid: MapGrid; world: World } {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  populateStartingEntities(world, grid, setup);
  return { grid, world };
}

function tileOf(grid: MapGrid, position: { x: number; y: number }) {
  return grid.worldToTile(position);
}

describe('starting entities', () => {
  it('gives both players one HQ on their configured footprint', () => {
    const { grid, world } = newMatch();

    for (const start of grid.starts) {
      const buildings = world.buildings(start.player);
      expect(buildings).toHaveLength(1);
      const hq = buildings[0];
      expect(hq?.type).toBe('hq');
      expect(hq?.topLeft).toEqual(start.hqTopLeft);
      expect(hq?.health).toBe(hq?.stats.maxHealth);
    }
  });

  it('gives both players the configured opening units of their faction', () => {
    const { world } = newMatch();

    for (const player of ['player', 'ai'] as PlayerId[]) {
      const units = world.units(player);
      expect(units).toHaveLength(4);
      expect(units.map((unit) => unit.type)).toEqual(['worker', 'infantry', 'tank', 'rocket']);
      expect(units.every((unit) => unit.faction === MATCH_SETUP.factions[player])).toBe(true);
      expect(units.every((unit) => unit.status === 'idle' && unit.order === null)).toBe(true);
    }
  });

  it('starts each player on their own half of the map', () => {
    const { grid, world } = newMatch();
    const middle = grid.widthTiles / 2;

    for (const start of grid.starts) {
      const ownSide = start.rallyPoint.tx < middle ? 'west' : 'east';
      for (const entity of world.entities(start.player)) {
        const tile = tileOf(grid, entity.position);
        expect(tile.tx < middle ? 'west' : 'east').toBe(ownSide);
      }
    }
  });

  it('places every starting unit on a free passable tile of its own', () => {
    const { grid, world } = newMatch();
    const occupied = new Set<string>();

    for (const unit of world.units()) {
      const tile = tileOf(grid, unit.position);
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
      expect(isUnderBuilding(world, tile)).toBe(false);

      const key = `${tile.tx},${tile.ty}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  });

  it('keeps starting units near their own rally point', () => {
    const { grid, world } = newMatch();

    for (const start of grid.starts) {
      for (const unit of world.units(start.player)) {
        const tile = tileOf(grid, unit.position);
        const steps = Math.max(
          Math.abs(tile.tx - start.rallyPoint.tx),
          Math.abs(tile.ty - start.rallyPoint.ty),
        );
        expect(steps).toBeLessThanOrEqual(2);
      }
    }
  });

  it('is deterministic: the same config always produces the same opening', () => {
    const describeMatch = (world: World) =>
      world.entities().map((entity) => ({
        kind: entity.kind,
        type: entity.type,
        owner: entity.owner,
        position: entity.position,
      }));

    expect(describeMatch(newMatch().world)).toEqual(describeMatch(newMatch().world));
  });

  it('follows a custom setup config', () => {
    const setup: MatchSetupConfig = {
      startingUnits: [{ type: 'tank', count: 2 }],
      factions: { player: 'ember', ai: 'meridian' },
    };
    const { world } = newMatch(setup);

    expect(world.units('player').map((unit) => unit.type)).toEqual(['tank', 'tank']);
    expect(world.units('player')[0]?.faction).toBe('ember');
    expect(world.entities()).toHaveLength(6);
    expect(world.entities().filter(isBuilding)).toHaveLength(2);
    expect(world.entities().filter(isUnit)).toHaveLength(4);
  });

  it('never places a unit inside an HQ footprint', () => {
    const { grid, world } = newMatch();
    const footprints = world.buildings().map(footprintRect);

    for (const unit of world.units()) {
      const tile = tileOf(grid, unit.position);
      expect(footprints.some((rect) => tileRectContains(rect, tile))).toBe(false);
    }
  });
});

describe('nearbyFreeTiles', () => {
  const grid = createMapGrid(MAP_CONFIG);

  it('starts at the origin when it is passable', () => {
    expect(nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 1)).toEqual([{ tx: 12, ty: 12 }]);
  });

  it('returns exactly the requested number of passable tiles', () => {
    const tiles = nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 5);

    expect(tiles).toHaveLength(5);
    expect(tiles.every((tile) => grid.isPassable(tile.tx, tile.ty))).toBe(true);
    expect(new Set(tiles.map((tile) => `${tile.tx},${tile.ty}`)).size).toBe(5);
  });

  it('steps outside the map rather than off it, and skips tiles the caller rejects', () => {
    // The map has no blocking terrain, so the only thing to step around is the edge itself.
    const tiles = nearbyFreeTiles(grid, { tx: 0, ty: 0 }, 3);
    expect(tiles).toHaveLength(3);
    expect(tiles.every((tile) => grid.isInBounds(tile.tx, tile.ty))).toBe(true);

    const rejected = nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 1, (tile) => tile.tx !== 12);
    expect(rejected[0]?.tx).not.toBe(12);
  });

  it('returns fewer tiles than asked when the search radius is exhausted', () => {
    expect(nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 4, () => false, 2)).toEqual([]);
    expect(nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 0)).toEqual([]);
  });

  it('searches closest tiles first', () => {
    const tiles = nearbyFreeTiles(grid, { tx: 12, ty: 12 }, 9);
    const rings = tiles.map((tile) => Math.max(Math.abs(tile.tx - 12), Math.abs(tile.ty - 12)));

    expect(rings).toEqual([...rings].sort((a, b) => a - b));
  });
});

describe('starting unit presets', () => {
  it('opens with one of each mobile role', () => {
    expect(MATCH_SETUP.startingUnits.map((group) => group.type)).toEqual([...UNIT_TYPE_IDS]);
    expect(MATCH_SETUP.startingUnits.every((group) => group.count === 1)).toBe(true);
  });

  it('names a known faction for both sides', () => {
    for (const player of PLAYER_IDS) {
      expect(FACTION_IDS).toContain(MATCH_SETUP.factions[player]);
    }
    // Two different factions, so both sets of modifiers are on the field.
    expect(new Set(Object.values(MATCH_SETUP.factions)).size).toBe(2);
  });

  it('resolves every preset against the unit config', () => {
    for (const group of MATCH_SETUP.startingUnits) {
      expect(UNIT_CONFIG[group.type].id).toBe(group.type);
      expect(Number.isInteger(group.count)).toBe(true);
      expect(group.count).toBeGreaterThan(0);
    }
  });
});
