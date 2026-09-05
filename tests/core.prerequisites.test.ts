import { describe, expect, it } from 'vitest';
import { availableBuildings, checkPrerequisites } from '../src/core/prerequisites';
import { isPowerAvailable, isProductionActive } from '../src/core/power';
import { createWorld, type World } from '../src/core/world';

const TILE = 30;

function newWorld(): World {
  return createWorld({ tileSizePixels: TILE });
}

describe('checkPrerequisites', () => {
  it('allows the HQ (no requirements) unconditionally', () => {
    const world = newWorld();
    expect(checkPrerequisites(world, 'player', 'hq')).toEqual({ allowed: true, missing: [] });
  });

  it('blocks Barracks until the HQ exists', () => {
    const world = newWorld();
    expect(checkPrerequisites(world, 'player', 'barracks')).toEqual({ allowed: false, missing: ['hq'] });

    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    expect(checkPrerequisites(world, 'player', 'barracks')).toEqual({ allowed: true, missing: [] });
  });

  it('blocks the Factory until both Barracks and a Power Plant are complete', () => {
    const world = newWorld();
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    expect([...checkPrerequisites(world, 'player', 'factory').missing].sort()).toEqual(['barracks', 'powerPlant']);

    world.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 10, ty: 0 } });
    expect(checkPrerequisites(world, 'player', 'factory')).toEqual({ allowed: false, missing: ['powerPlant'] });

    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 20, ty: 0 } });
    expect(checkPrerequisites(world, 'player', 'factory')).toEqual({ allowed: true, missing: [] });
  });

  it('does not count a still-constructing building as satisfying a prerequisite', () => {
    const world = newWorld();
    world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 0, ty: 0 },
      status: 'constructing',
      constructionProgress: 0.5,
    });
    expect(checkPrerequisites(world, 'player', 'barracks')).toEqual({ allowed: false, missing: ['hq'] });
  });

  it('does not count a destroyed building as satisfying a prerequisite', () => {
    const world = newWorld();
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 0, ty: 0 },
      health: 5,
    });
    world.damage(hq.id, 5);
    expect(checkPrerequisites(world, 'player', 'barracks')).toEqual({ allowed: false, missing: ['hq'] });
  });

  it('keeps each player\'s prerequisites independent', () => {
    const world = newWorld();
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    expect(checkPrerequisites(world, 'ai', 'barracks')).toEqual({ allowed: false, missing: ['hq'] });
  });
});

describe('availableBuildings', () => {
  it('lists only buildable types whose prerequisites are currently met', () => {
    const world = newWorld();
    expect(availableBuildings(world, 'player')).toEqual([]);

    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    expect([...availableBuildings(world, 'player')].sort()).toEqual(['barracks', 'powerPlant', 'resourceDepot']);
  });
});

describe('isPowerAvailable / isProductionActive', () => {
  it('is unavailable with no Power Plant and available once one completes', () => {
    const world = newWorld();
    expect(isPowerAvailable(world, 'player')).toBe(false);

    const plant = world.createBuilding({
      type: 'powerPlant',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 0, ty: 0 },
      status: 'constructing',
      constructionProgress: 0.2,
    });
    expect(isPowerAvailable(world, 'player')).toBe(false);

    world.setConstructionProgress(plant.id, 1);
    world.setStatus(plant.id, 'idle');
    expect(isPowerAvailable(world, 'player')).toBe(true);
  });

  it('loses power once the last Power Plant is destroyed and regains it when a new one completes', () => {
    const world = newWorld();
    const plant = world.createBuilding({
      type: 'powerPlant',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 0, ty: 0 },
      health: 10,
    });
    expect(isPowerAvailable(world, 'player')).toBe(true);

    world.damage(plant.id, 10);
    expect(isPowerAvailable(world, 'player')).toBe(false);

    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 10, ty: 0 } });
    expect(isPowerAvailable(world, 'player')).toBe(true);
  });

  it('never requires power for a building whose config does not need it', () => {
    const world = newWorld();
    expect(isProductionActive(world, 'player', false)).toBe(true);
  });

  it('requires an available Power Plant when the building needs power', () => {
    const world = newWorld();
    expect(isProductionActive(world, 'player', true)).toBe(false);
    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 0, ty: 0 } });
    expect(isProductionActive(world, 'player', true)).toBe(true);
  });
});
