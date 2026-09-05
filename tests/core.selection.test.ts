import { beforeEach, describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { createMapGrid, type MapGrid } from '../src/core/map';
import {
  entityAtPoint, hitsEntity, pruneSelection, selectableAtPoint, unitBodyRadius,
  unitsInSelectionRect, updateSelection,
} from '../src/core/selection';
import { createWorld, type World } from '../src/core/world';
import type { PlayerId, UnitTypeId } from '../src/core/ids';
import type { Vec2 } from '../src/core/geometry';

const grid: MapGrid = createMapGrid(MAP_CONFIG);
const TILE = grid.tileSizePixels;

function newWorld(): World {
  return createWorld({ tileSizePixels: TILE });
}

function addUnit(world: World, type: UnitTypeId, owner: PlayerId, position: Vec2) {
  return world.createUnit({ type, owner, faction: 'meridian', position });
}

describe('hit shapes', () => {
  const world = newWorld();
  const infantry = addUnit(world, 'infantry', 'player', { x: 200, y: 200 });
  const hq = world.createBuilding({
    type: 'hq',
    owner: 'player',
    faction: 'meridian',
    topLeft: { tx: 10, ty: 10 },
  });

  it('picks a unit inside its drawn body and misses just outside it', () => {
    const radius = unitBodyRadius(infantry, TILE);
    expect(radius).toBeCloseTo((0.8 / 2) * TILE, 6);

    expect(hitsEntity(infantry, { x: 200, y: 200 }, TILE)).toBe(true);
    expect(hitsEntity(infantry, { x: 200 + radius - 0.5, y: 200 }, TILE)).toBe(true);
    expect(hitsEntity(infantry, { x: 200 + radius + 1, y: 200 }, TILE)).toBe(false);
    expect(hitsEntity(infantry, { x: 200, y: 200 + radius + 1 }, TILE)).toBe(false);
  });

  it('picks a building anywhere on its footprint', () => {
    // The HQ covers tiles 10..13 on both axes.
    expect(hitsEntity(hq, grid.tileCenter(10, 10), TILE)).toBe(true);
    expect(hitsEntity(hq, grid.tileCenter(13, 13), TILE)).toBe(true);
    expect(hitsEntity(hq, grid.tileCenter(14, 13), TILE)).toBe(false);
    expect(hitsEntity(hq, grid.tileCenter(9, 10), TILE)).toBe(false);
  });
});

describe('entityAtPoint', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('returns nothing for open ground', () => {
    addUnit(world, 'infantry', 'player', { x: 200, y: 200 });
    expect(entityAtPoint(world, { x: 600, y: 600 })).toBeNull();
  });

  it('prefers a unit over the building underneath it', () => {
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 10, ty: 10 },
    });
    const onTop = addUnit(world, 'worker', 'player', hq.position);

    expect(entityAtPoint(world, hq.position)?.id).toBe(onTop.id);

    world.remove(onTop.id);
    expect(entityAtPoint(world, hq.position)?.id).toBe(hq.id);
  });

  it('prefers the newer of two overlapping units, matching the draw order', () => {
    const older = addUnit(world, 'infantry', 'player', { x: 300, y: 300 });
    const newer = addUnit(world, 'infantry', 'player', { x: 303, y: 300 });

    expect(entityAtPoint(world, { x: 301, y: 300 })?.id).toBe(newer.id);
    expect(entityAtPoint(world, { x: 300 - unitBodyRadius(older, TILE) + 1, y: 300 })?.id).toBe(
      older.id,
    );
  });

  it('ignores destroyed entities', () => {
    const doomed = addUnit(world, 'infantry', 'player', { x: 400, y: 400 });
    world.damage(doomed.id, doomed.stats.maxHealth);

    expect(entityAtPoint(world, { x: 400, y: 400 })).toBeNull();
  });
});

describe('what a left-click may select', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('selects a friendly unit', () => {
    const mine = addUnit(world, 'infantry', 'player', { x: 200, y: 200 });
    expect(selectableAtPoint(world, { x: 200, y: 200 }, 'player')?.id).toBe(mine.id);
  });

  it('selects a friendly building', () => {
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 6, ty: 6 },
    });
    expect(selectableAtPoint(world, hq.position, 'player')?.id).toBe(hq.id);
  });

  it('never selects an enemy entity', () => {
    const enemy = addUnit(world, 'tank', 'ai', { x: 500, y: 500 });
    const enemyHq = world.createBuilding({
      type: 'hq',
      owner: 'ai',
      faction: 'ember',
      topLeft: { tx: 20, ty: 20 },
    });

    expect(entityAtPoint(world, { x: 500, y: 500 })?.id).toBe(enemy.id);
    expect(selectableAtPoint(world, { x: 500, y: 500 }, 'player')).toBeNull();
    expect(selectableAtPoint(world, enemyHq.position, 'player')).toBeNull();

    // The same click from the other side of the table does select it.
    expect(selectableAtPoint(world, { x: 500, y: 500 }, 'ai')?.id).toBe(enemy.id);
  });

  it('selects nothing on open ground', () => {
    addUnit(world, 'infantry', 'player', { x: 200, y: 200 });
    expect(selectableAtPoint(world, { x: 900, y: 900 }, 'player')).toBeNull();
  });
});

describe('box and additive selection state', () => {
  it('filters a drag rectangle to living friendly units and excludes buildings and enemies', () => {
    const world = newWorld();
    const worker = addUnit(world, 'worker', 'player', { x: 100, y: 100 });
    const infantry = addUnit(world, 'infantry', 'player', { x: 180, y: 180 });
    addUnit(world, 'tank', 'ai', { x: 160, y: 160 });
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 4 } });
    const destroyed = addUnit(world, 'rocket', 'player', { x: 140, y: 140 });
    world.damage(destroyed.id, destroyed.health);
    expect(unitsInSelectionRect(world, { x: 80, y: 80, width: 140, height: 140 }, 'player')).toEqual([
      worker.id, infantry.id,
    ]);
  });

  it('replaces on plain click/drag and toggles each candidate on Shift click/drag', () => {
    expect(updateSelection(['a', 'b'], ['c'], false)).toEqual(['c']);
    expect(updateSelection(['a'], ['b'], true)).toEqual(['a', 'b']);
    expect(updateSelection(['a', 'b'], ['b'], true)).toEqual(['a']);
    expect(updateSelection(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'c']);
    expect(updateSelection(['a'], [], false)).toEqual([]);
    expect(updateSelection(['a'], [], true)).toEqual(['a']);
  });

  it('prunes removed, enemy and destroyed selection ids in their original order', () => {
    const world = newWorld();
    const first = addUnit(world, 'worker', 'player', { x: 100, y: 100 });
    const doomed = addUnit(world, 'infantry', 'player', { x: 200, y: 100 });
    const enemy = addUnit(world, 'tank', 'ai', { x: 300, y: 100 });
    const gone = addUnit(world, 'rocket', 'player', { x: 400, y: 100 });
    world.damage(doomed.id, doomed.health);
    world.remove(gone.id);
    expect(pruneSelection(world, [first.id, doomed.id, enemy.id, gone.id], 'player')).toEqual([first.id]);
  });
});
