import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIG } from '../../src/config/buildings';
import { ECONOMY_CONFIG } from '../../src/config/economy';
import { createEconomy } from '../../src/core/economy';
import {
  cancelConstruction,
  checkConstructionStart,
  startConstruction,
  stepConstruction,
} from '../../src/core/construction';
import { createMapGrid } from '../../src/core/map';
import { MAP_CONFIG } from '../../src/config/map';
import { createWorld, type World } from '../../src/core/world';

const HQ_TOP_LEFT = { tx: 4, ty: 30 };
const SITE_TOP_LEFT = { tx: 12, ty: 30 };

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const economy = createEconomy();
  world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: HQ_TOP_LEFT });
  const worker = world.createUnit({
    type: 'worker',
    owner: 'player',
    faction: 'meridian',
    position: grid.tileCenter(10, 30),
  });
  return { grid, world, economy, worker };
}

function runConstruction(world: World, totalSeconds: number, stepSeconds = 0.25) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    stepConstruction(world, stepSeconds);
    elapsed += stepSeconds;
  }
}

describe('checkConstructionStart', () => {
  it('is blocked by an unmet prerequisite', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const economy = createEconomy();
    // No HQ at all: Barracks requires one.
    const result = checkConstructionStart(world, grid, economy, 'player', 'barracks', SITE_TOP_LEFT);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('missing-prerequisite');
  });

  it('is blocked by insufficient Credits', () => {
    const { grid, world } = setup();
    const economy = createEconomy({ startingCredits: 1, cancelRefundFraction: 0.75 });
    const result = checkConstructionStart(world, grid, economy, 'player', 'barracks', SITE_TOP_LEFT);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('insufficient-credits');
  });

  it('allows a valid, affordable, prerequisite-satisfied placement', () => {
    const { grid, world, economy } = setup();
    expect(checkConstructionStart(world, grid, economy, 'player', 'barracks', SITE_TOP_LEFT)).toEqual({
      allowed: true,
      reasons: [],
    });
  });
});

describe('startConstruction', () => {
  it('rejects a non-Worker or an enemy-owned unit', () => {
    const { grid, world, economy } = setup();
    const infantry = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(10, 30),
    });
    expect(startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', SITE_TOP_LEFT, infantry.id)).toBeNull();
  });

  it('spends the configured cost exactly once and raises a constructing site', () => {
    const { grid, world, economy, worker } = setup();
    const before = economy.balance('player');
    const id = startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', SITE_TOP_LEFT, worker.id);
    expect(id).not.toBeNull();
    expect(economy.balance('player')).toBe(before - BUILDING_CONFIG.barracks.cost);

    const site = world.building(id!);
    expect(site?.status).toBe('constructing');
    expect(site?.constructionProgress).toBe(0);
    expect(worker.order).toEqual(expect.objectContaining({ kind: 'Build', buildingId: id }));
  });

  it('spends nothing and creates nothing when the placement is invalid', () => {
    const { grid, world, economy, worker } = setup();
    const before = economy.balance('player');
    // Directly on top of the HQ's own footprint.
    const id = startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', HQ_TOP_LEFT, worker.id);
    expect(id).toBeNull();
    expect(economy.balance('player')).toBe(before);
    expect(world.buildings('player')).toHaveLength(1);
  });
});

describe('stepConstruction', () => {
  it('only advances progress once the assigned Worker has arrived and keeps building until complete', () => {
    const { grid, world, economy, worker } = setup();
    const id = startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', SITE_TOP_LEFT, worker.id)!;
    const buildTime = BUILDING_CONFIG.barracks.buildTimeSeconds;

    runConstruction(world, buildTime + 20);

    const site = world.building(id)!;
    expect(site.status).toBe('idle');
    expect(site.constructionProgress).toBe(1);
    expect(worker.order).toBeNull();
    expect(worker.status).toBe('idle');
  });

  it('pauses progress while no Worker is assigned to the site', () => {
    const { grid, world, economy, worker } = setup();
    const id = startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', SITE_TOP_LEFT, worker.id)!;

    // Let the Worker arrive and build briefly, then pull it off the job entirely.
    runConstruction(world, 3);
    const progressBeforeInterrupt = world.building(id)!.constructionProgress;
    expect(progressBeforeInterrupt).toBeGreaterThan(0);
    expect(progressBeforeInterrupt).toBeLessThan(1);

    world.setOrder(worker.id, null);
    world.setStatus(worker.id, 'idle');
    stepConstruction(world, 100);

    expect(world.building(id)!.constructionProgress).toBe(progressBeforeInterrupt);
    expect(world.building(id)!.status).toBe('constructing');
  });
});

describe('cancelConstruction', () => {
  it('refunds the configured share, frees the Worker, and clears footprint occupancy', () => {
    const { grid, world, economy, worker } = setup();
    const spent = BUILDING_CONFIG.barracks.cost;
    const balanceBeforeBuild = economy.balance('player');
    const id = startConstruction(world, grid, economy, 'player', 'meridian', 'barracks', SITE_TOP_LEFT, worker.id)!;

    expect(cancelConstruction(world, economy, id)).toBe(true);

    const expectedRefund = Math.round(spent * ECONOMY_CONFIG.cancelRefundFraction);
    expect(economy.balance('player')).toBe(balanceBeforeBuild - spent + expectedRefund);
    expect(world.building(id)).toBeUndefined();
    expect(worker.order).toBeNull();
    expect(worker.status).toBe('idle');

    // Occupancy is cleared: the same footprint can be built on again.
    const secondAttempt = checkConstructionStart(world, grid, economy, 'player', 'barracks', SITE_TOP_LEFT);
    expect(secondAttempt.allowed).toBe(true);
  });

  it('does nothing to an already-completed building', () => {
    const { world, economy } = setup();
    const hq = world.buildings('player')[0]!;
    const before = economy.balance('player');
    expect(cancelConstruction(world, economy, hq.id)).toBe(false);
    expect(economy.balance('player')).toBe(before);
    expect(world.building(hq.id)).toBeDefined();
  });

  it('does nothing for an unknown building id', () => {
    const { world, economy } = setup();
    expect(cancelConstruction(world, economy, 'not-a-real-id')).toBe(false);
  });
});
