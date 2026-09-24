import { describe, expect, it } from 'vitest';
import { MAP_CONFIG, MAP_CONFIGS, TRIDENT_BASIN_CONFIG } from '../../src/config/map';
import { createAiState } from '../../src/core/ai';
import { checkAttackEligibility } from '../../src/core/combat';
import { createEconomy } from '../../src/core/economy';
import { createFogState, updateFogVisibility } from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { countAliveBuildings, createMatchLifecycle, resolveMatchOutcome } from '../../src/core/matchLifecycle';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { findPath } from '../../src/core/pathfinding';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { restoreWorld, serializeWorld } from '../../src/core/snapshot';
import { areHostile } from '../../src/core/teams';
import { createWorld } from '../../src/core/world';

describe('map catalog and Trident Basin', () => {
  it('registers stable unique 1v1 and 1v2 maps', () => {
    expect(MAP_CONFIGS.map((map) => map.id)).toEqual(['open-field', 'trident-basin']);
    expect(new Set(MAP_CONFIGS.map((map) => map.id)).size).toBe(2);
    expect(MAP_CONFIG.starts.map((start) => start.player)).toEqual(['player', 'ai']);
    expect(TRIDENT_BASIN_CONFIG.starts.map((start) => start.player)).toEqual(['player', 'ai', 'ai2']);
  });

  it('keeps every 1v2 start and home field valid, passable and mutually reachable', () => {
    const grid = createMapGrid(TRIDENT_BASIN_CONFIG);
    for (let ty = 0; ty < grid.heightTiles; ty++) for (let tx = 0; tx < grid.widthTiles; tx++) {
      expect(grid.terrainAt(tx, ty)).not.toBe('water');
    }
    for (const field of grid.resourceFields) for (const tile of field.tiles) {
      expect(grid.isInBounds(tile.tx, tile.ty)).toBe(true);
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
    }
    for (const start of grid.starts) {
      expect(grid.isPassable(start.rallyPoint.tx, start.rallyPoint.ty)).toBe(true);
      expect(grid.isInBounds(start.hqTopLeft.tx, start.hqTopLeft.ty)).toBe(true);
      const home = grid.resourceFields.find((field) => field.homeFor === start.player);
      expect(home, `home field for ${start.player}`).toBeDefined();
      expect(findPath(grid, start.rallyPoint, home!.center).found).toBe(true);
    }
    for (const left of grid.starts) for (const right of grid.starts) {
      expect(findPath(grid, left.rallyPoint, right.rallyPoint).found).toBe(true);
    }
  });

  it('populates three independent openings and economies', () => {
    const grid = createMapGrid(TRIDENT_BASIN_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    populateStartingEntities(world, grid);
    for (const owner of ['player', 'ai', 'ai2'] as const) {
      expect(world.buildings(owner).filter((building) => building.type === 'hq')).toHaveLength(1);
      expect(world.units(owner)).toHaveLength(4);
    }
    const economy = createEconomy(undefined, undefined, ['player', 'ai', 'ai2']);
    const firstBefore = economy.balance('ai');
    const secondBefore = economy.balance('ai2');
    economy.earn('ai', 25);
    economy.spend('ai2', 100);
    expect(economy.balance('ai')).toBe(firstBefore + 25);
    expect(economy.balance('ai2')).toBe(secondBefore - 100);
  });
});

describe('1v2 alliances and persistence', () => {
  it('treats the bots as allies and both as enemies of the player', () => {
    expect(areHostile('ai', 'ai2')).toBe(false);
    expect(areHostile('player', 'ai')).toBe(true);
    expect(areHostile('player', 'ai2')).toBe(true);
    const world = createWorld({ tileSizePixels: 30 });
    const first = world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 0, y: 0 } });
    const ally = world.createUnit({ type: 'infantry', owner: 'ai2', faction: 'ember', position: { x: 30, y: 0 } });
    const enemy = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 30, y: 0 } });
    expect(checkAttackEligibility(world, first.id, ally.id)).toEqual({ allowed: false, reason: 'same-owner' });
    expect(checkAttackEligibility(world, first.id, enemy.id).allowed).toBe(true);
  });

  it('round-trips the selected map and both AI controllers', () => {
    const grid = createMapGrid(TRIDENT_BASIN_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    populateStartingEntities(world, grid);
    const economy = createEconomy(undefined, undefined, ['player', 'ai', 'ai2']);
    const fields = createResourceFieldState(grid);
    const fog = createFogState(grid, ['player', 'ai', 'ai2']);
    updateFogVisibility(fog, world, grid);
    const primary = createAiState();
    const secondary = createAiState();
    primary.productionCycleIndex = 1;
    secondary.productionCycleIndex = 2;
    const snapshot = serializeWorld(world, [], economy, fields, fog, grid, primary, undefined, secondary);
    const restored = restoreWorld(snapshot, grid);
    expect(snapshot.mapId).toBe('trident-basin');
    expect(restored.ai.productionCycleIndex).toBe(1);
    expect(restored.secondaryAi?.productionCycleIndex).toBe(2);
    expect(restored.economy.players).toEqual(['player', 'ai', 'ai2']);
  });

  it('requires both allied bot bases to be eliminated for victory', () => {
    const world = createWorld({ tileSizePixels: 30 });
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    const first = world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 10, ty: 0 } });
    const second = world.createBuilding({ type: 'hq', owner: 'ai2', faction: 'ember', topLeft: { tx: 20, ty: 0 } });
    const lifecycle = createMatchLifecycle();
    world.remove(first.id);
    expect(resolveMatchOutcome(lifecycle, countAliveBuildings(world.entities()))).toBeNull();
    world.remove(second.id);
    expect(resolveMatchOutcome(lifecycle, countAliveBuildings(world.entities()))).toBe('victory');
  });
});
