import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from '../src/config/economy';
import { GATHER_CONFIG } from '../src/config/gather';
import { MAP_CONFIG } from '../src/config/map';
import { createEconomy, type Economy } from '../src/core/economy';
import { issueGatherOrder, stepGather } from '../src/core/gather';
import { createMapGrid, type MapGrid } from '../src/core/map';
import { gatherOrder } from '../src/core/orders';
import { createResourceFieldState, type ResourceFieldState } from '../src/core/resourceFieldState';
import { createWorld, type World } from '../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const economy = createEconomy();
  const resourceFieldState = createResourceFieldState(grid);
  const field = grid.resourceFields[0]!;
  const dropoff = world.createBuilding({
    type: 'hq',
    owner: 'player',
    faction: 'meridian',
    topLeft: { tx: 10, ty: 15 },
  });
  return { grid, world, economy, resourceFieldState, field, dropoff };
}

function addWorker(world: World, grid: MapGrid, tile: { tx: number; ty: number }, owner: 'player' | 'ai' = 'player') {
  return world.createUnit({
    type: 'worker',
    owner,
    faction: owner === 'player' ? 'meridian' : 'ember',
    position: grid.tileCenter(tile.tx, tile.ty),
  });
}

/** Fast-forwards the whole gather system in small steps so results do not depend on step size. */
function runGather(
  world: World,
  grid: MapGrid,
  resourceFieldState: ResourceFieldState,
  economy: Economy,
  totalSeconds: number,
  stepSeconds = 0.25,
) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    stepGather(world, grid, resourceFieldState, economy, stepSeconds);
    elapsed += stepSeconds;
  }
}

describe('issueGatherOrder', () => {
  it('rejects a unit that cannot gather', () => {
    const { world, grid, economy, field } = setup();
    const infantry = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(10, 20),
    });
    expect(issueGatherOrder(world, grid, economy, 'player', infantry.id, field.id)).toBe(false);
  });

  it('rejects a worker the ordering player does not own', () => {
    const { world, grid, economy, field } = setup();
    const enemyWorker = addWorker(world, grid, { tx: 10, ty: 20 }, 'ai');
    expect(issueGatherOrder(world, grid, economy, 'player', enemyWorker.id, field.id)).toBe(false);
  });

  it('rejects an unknown field id', () => {
    const { world, grid, economy } = setup();
    const worker = addWorker(world, grid, { tx: 10, ty: 20 });
    expect(issueGatherOrder(world, grid, economy, 'player', worker.id, 'not-a-field')).toBe(false);
  });

  it('starts travel toward the field and marks the unit moving', () => {
    const { world, grid, economy, field } = setup();
    const worker = addWorker(world, grid, { tx: 10, ty: 20 });
    expect(issueGatherOrder(world, grid, economy, 'player', worker.id, field.id)).toBe(true);
    expect(worker.order).toEqual(
      expect.objectContaining({ kind: 'Gather', fieldId: field.id, phase: 'toField' }),
    );
    expect(worker.status).toBe('moving');
  });

  it("deposits a Worker's undelivered load immediately when it is redirected to a new field", () => {
    const { world, grid, economy, field } = setup();
    const worker = addWorker(world, grid, { tx: 10, ty: 20 });
    world.setCarriedCredits(worker.id, 40);
    const before = economy.balance('player');
    expect(issueGatherOrder(world, grid, economy, 'player', worker.id, field.id)).toBe(true);
    expect(economy.balance('player')).toBe(before + 40);
    expect(worker.carriedCredits).toBe(0);
  });
});

describe('stepGather — gathering phase', () => {
  it('accumulates the timer and only takes Credits once it reaches capacity time', () => {
    const { world, grid, resourceFieldState, economy, field } = setup();
    const worker = addWorker(world, grid, field.center);
    world.setOrder(worker.id, gatherOrder(field.id, 'gathering', null, 0));
    world.setStatus(worker.id, 'gathering');

    stepGather(world, grid, resourceFieldState, economy, GATHER_CONFIG.gatherSeconds / 2);
    expect(worker.carriedCredits).toBe(0);
    expect(worker.order).toEqual(
      expect.objectContaining({ kind: 'Gather', phase: 'gathering' }),
    );

    stepGather(world, grid, resourceFieldState, economy, GATHER_CONFIG.gatherSeconds / 2);
    expect(worker.carriedCredits).toBe(GATHER_CONFIG.workerCapacityCredits);
    expect(worker.order).toEqual(expect.objectContaining({ kind: 'Gather', phase: 'toDropoff' }));
    expect(worker.status).toBe('moving');
    expect(resourceFieldState.remaining(field.id)).toBe(field.credits - GATHER_CONFIG.workerCapacityCredits);
  });

  it('carries only what remains when the field has less than a full capacity left', () => {
    const { world, grid, resourceFieldState, economy, field } = setup();
    resourceFieldState.take(field.id, field.credits - 10);
    const worker = addWorker(world, grid, field.center);
    world.setOrder(worker.id, gatherOrder(field.id, 'gathering', null, 0));

    stepGather(world, grid, resourceFieldState, economy, GATHER_CONFIG.gatherSeconds);
    expect(worker.carriedCredits).toBe(10);
    expect(resourceFieldState.isDepleted(field.id)).toBe(true);
  });

  it('sends the worker idle without cargo when the field is already depleted', () => {
    const { world, grid, resourceFieldState, economy, field } = setup();
    resourceFieldState.take(field.id, field.credits);
    const worker = addWorker(world, grid, field.center);
    world.setOrder(worker.id, gatherOrder(field.id, 'gathering', null, 0));

    stepGather(world, grid, resourceFieldState, economy, GATHER_CONFIG.gatherSeconds);
    expect(worker.carriedCredits).toBe(0);
    expect(worker.order).toBeNull();
    expect(worker.status).toBe('idle');
  });
});

describe('stepGather — deposit', () => {
  it('deposits carried Credits and loops back to the field when Credits remain', () => {
    const { world, grid, resourceFieldState, economy, field, dropoff } = setup();
    const worker = addWorker(world, grid, { tx: dropoff.topLeft.tx, ty: dropoff.topLeft.ty + 5 });
    world.setCarriedCredits(worker.id, 60);
    world.setOrder(worker.id, gatherOrder(field.id, 'toDropoff', null, 0, dropoff.id));

    const before = economy.balance('player');
    stepGather(world, grid, resourceFieldState, economy, 0.1);

    expect(economy.balance('player')).toBe(before + 60);
    expect(worker.carriedCredits).toBe(0);
    expect(worker.order).toEqual(expect.objectContaining({ kind: 'Gather', phase: 'toField' }));
    expect(worker.status).toBe('moving');
  });

  it('goes idle after depositing the last load once the field is depleted', () => {
    const { world, grid, resourceFieldState, economy, field, dropoff } = setup();
    resourceFieldState.take(field.id, field.credits);
    const worker = addWorker(world, grid, { tx: dropoff.topLeft.tx, ty: dropoff.topLeft.ty + 5 });
    world.setCarriedCredits(worker.id, 60);
    world.setOrder(worker.id, gatherOrder(field.id, 'toDropoff', null, 0, dropoff.id));

    const before = economy.balance('player');
    stepGather(world, grid, resourceFieldState, economy, 0.1);

    expect(economy.balance('player')).toBe(before + 60);
    expect(worker.order).toBeNull();
    expect(worker.status).toBe('idle');
  });

  it('retargets a live drop-off when the assigned one is gone', () => {
    const { world, grid, resourceFieldState, economy, field, dropoff } = setup();
    const worker = addWorker(world, grid, { tx: dropoff.topLeft.tx, ty: dropoff.topLeft.ty + 5 });
    world.setCarriedCredits(worker.id, 60);
    world.setOrder(worker.id, gatherOrder(field.id, 'toDropoff', null, 0, 'gone'));

    stepGather(world, grid, resourceFieldState, economy, 0.1);

    // The only drop-off is still the real one: it should be found again and travel resumed.
    expect(worker.order).toEqual(expect.objectContaining({ kind: 'Gather', phase: 'toDropoff' }));
    expect(worker.carriedCredits).toBe(60);
  });
});

describe('the full gather cycle end to end', () => {
  it('travels to the field, gathers, returns, deposits, and repeats', () => {
    const { world, grid, resourceFieldState, economy, field } = setup();
    const worker = addWorker(world, grid, { tx: field.center.tx, ty: field.center.ty - 8 });

    expect(issueGatherOrder(world, grid, economy, 'player', worker.id, field.id)).toBe(true);

    const startingBalance = economy.balance('player');
    runGather(world, grid, resourceFieldState, economy, 60);

    expect(economy.balance('player')).toBeGreaterThan(startingBalance);
    expect(resourceFieldState.remaining(field.id)).toBeLessThan(field.credits);
    // The field is nowhere near depleted, so the Worker should be back out working it.
    expect(worker.order).not.toBeNull();
    expect(worker.status === 'moving' || worker.status === 'gathering').toBe(true);
  });

  it('leaves the worker idle once a nearly-empty field runs out', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    const economy = createEconomy();
    const field = grid.resourceFields[0]!;
    const resourceFieldState = createResourceFieldState(grid, [
      { id: field.id, remainingCredits: 10 },
    ]);
    world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 10, ty: 15 } });
    const worker = addWorker(world, grid, { tx: field.center.tx, ty: field.center.ty - 8 });

    issueGatherOrder(world, grid, economy, 'player', worker.id, field.id);
    runGather(world, grid, resourceFieldState, economy, 60);

    expect(economy.balance('player')).toBe(ECONOMY_CONFIG.startingCredits + 10);
    expect(worker.status).toBe('idle');
    expect(worker.order).toBeNull();
    expect(resourceFieldState.isDepleted(field.id)).toBe(true);
  });
});
