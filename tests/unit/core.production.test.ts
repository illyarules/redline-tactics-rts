import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from '../../src/config/economy';
import { PRODUCTION_CONFIG } from '../../src/config/production';
import { resolveUnitStats } from '../../src/core/factionStats';
import { createMapGrid } from '../../src/core/map';
import { MAP_CONFIG } from '../../src/config/map';
import { createEconomy } from '../../src/core/economy';
import {
  cancelProduction,
  checkProductionRequest,
  queueProduction,
  stepProduction,
} from '../../src/core/production';
import { isUnderBuilding } from '../../src/core/matchSetup';
import { createWorld } from '../../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const economy = createEconomy();
  const hq = world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 30 } });
  const barracks = world.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 12, ty: 30 } });
  return { grid, world, economy, hq, barracks };
}

describe('production queues', () => {
  it('unlocks FPV operators only after a completed Unmanned Systems Forces Center exists', () => {
    const { world, economy, barracks } = setup();
    economy.earn('player', 1000);
    expect(checkProductionRequest(world, economy, 'player', barracks.id, 'fpvOperators')).toEqual({
      allowed: false, reason: 'missing-prerequisite',
    });
    const center = world.createBuilding({
      type: 'unmannedSystemsCenter', owner: 'player', faction: 'meridian', topLeft: { tx: 20, ty: 30 },
      constructionProgress: 0.5,
    });
    expect(checkProductionRequest(world, economy, 'player', barracks.id, 'fpvOperators').reason).toBe('missing-prerequisite');
    world.setConstructionProgress(center.id, 1);
    expect(queueProduction(world, economy, 'player', barracks.id, 'fpvOperators').allowed).toBe(true);
  });

  it('assigns each configured unit to its intended producer and charges once', () => {
    const { world, economy, hq, barracks } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 32, ty: 30 } });
    economy.earn('player', 500);
    const before = economy.balance('player');

    expect(queueProduction(world, economy, 'player', hq.id, 'worker').allowed).toBe(true);
    expect(queueProduction(world, economy, 'player', barracks.id, 'infantry').allowed).toBe(true);
    expect(queueProduction(world, economy, 'player', factory.id, 'tank').allowed).toBe(true);
    expect(queueProduction(world, economy, 'player', factory.id, 'rocket').allowed).toBe(true);
    expect(economy.balance('player')).toBe(
      before - resolveUnitStats('worker', 'meridian').cost - resolveUnitStats('infantry', 'meridian').cost
        - resolveUnitStats('tank', 'meridian').cost - resolveUnitStats('rocket', 'meridian').cost,
    );
    expect(checkProductionRequest(world, economy, 'player', hq.id, 'tank')).toEqual({
      allowed: false,
      reason: 'unsupported-unit',
    });
  });

  it('only advances the front item and spawns it at a nearby passable non-building cell', () => {
    const { grid, world, economy, barracks } = setup();
    queueProduction(world, economy, 'player', barracks.id, 'infantry');
    queueProduction(world, economy, 'player', barracks.id, 'infantry');
    const time = resolveUnitStats('infantry', 'meridian').buildTimeSeconds;

    expect(stepProduction(world, grid, time / 2)).toEqual([]);
    expect(barracks.productionQueue.map((item) => item.elapsedSeconds)).toEqual([time / 2, 0]);
    const events = stepProduction(world, grid, time / 2);

    expect(barracks.productionQueue).toHaveLength(1);
    expect(barracks.productionQueue[0]?.elapsedSeconds).toBe(0);
    const produced = world.units().find((unit) => unit.type === 'infantry');
    expect(produced).toBeDefined();
    if (produced === undefined) return;
    expect(events).toEqual([{
      kind: 'unit-produced', unitId: produced.id, producerId: barracks.id,
      owner: 'player', unitType: 'infantry',
    }]);
    const tile = grid.worldToTile(produced.position);
    expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
    expect(isUnderBuilding(world, tile)).toBe(false);
  });

  it('rejects Tank and Rocket without a Power Plant and accepts them once one is complete', () => {
    const { world, economy } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    const before = economy.balance('player');
    for (const unitType of ['tank', 'rocket'] as const) {
      expect(queueProduction(world, economy, 'player', factory.id, unitType)).toEqual({ allowed: false, reason: 'no-power' });
    }
    expect(factory.productionQueue).toEqual([]);
    expect(economy.balance('player')).toBe(before);

    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 32, ty: 30 } });
    expect(queueProduction(world, economy, 'player', factory.id, 'tank').allowed).toBe(true);
  });

  it('lets a Factory build a Combat Buggy without a Power Plant while Tank and Rocket are unavailable', () => {
    const { grid, world, economy } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    const before = economy.balance('player');
    expect(queueProduction(world, economy, 'player', factory.id, 'combatBuggy').allowed).toBe(true);
    const buggy = resolveUnitStats('combatBuggy', 'meridian');
    stepProduction(world, grid, buggy.buildTimeSeconds);
    expect(world.units().some((unit) => unit.type === 'combatBuggy')).toBe(true);
    expect(economy.balance('player')).toBe(before - buggy.cost);

    expect(checkProductionRequest(world, economy, 'player', factory.id, 'rocket')).toEqual({ allowed: false, reason: 'no-power' });
  });

  it('pauses a queued Tank when power is lost, then resumes it without paying again', () => {
    const { grid, world, economy } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    const plant = world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 32, ty: 30 } });
    queueProduction(world, economy, 'player', factory.id, 'tank');
    queueProduction(world, economy, 'player', factory.id, 'combatBuggy');
    const balance = economy.balance('player');
    stepProduction(world, grid, 3);
    world.remove(plant.id);
    stepProduction(world, grid, 50);
    expect(factory.productionQueue.map((item) => [item.unitType, item.elapsedSeconds])).toEqual([['tank', 3], ['combatBuggy', 0]]);
    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 32, ty: 30 } });
    stepProduction(world, grid, 2);
    expect(factory.productionQueue[0]?.elapsedSeconds).toBe(5);
    expect(economy.balance('player')).toBe(balance);
  });

  it('rejects full queues and insufficient funds without mutating Credits or queue state', () => {
    const { world, economy, barracks } = setup();
    for (let index = 0; index < PRODUCTION_CONFIG.queueCapacity; index++) {
      expect(queueProduction(world, economy, 'player', barracks.id, 'infantry').allowed).toBe(true);
    }
    const afterFullQueue = economy.balance('player');
    expect(queueProduction(world, economy, 'player', barracks.id, 'infantry')).toEqual({ allowed: false, reason: 'queue-full' });
    expect(economy.balance('player')).toBe(afterFullQueue);

    const poorEconomy = createEconomy({ ...ECONOMY_CONFIG, startingCredits: 1 });
    const hq = world.buildings().find((building) => building.type === 'hq')!;
    expect(queueProduction(world, poorEconomy, 'player', hq.id, 'worker')).toEqual({
      allowed: false,
      reason: 'insufficient-credits',
    });
    expect(hq.productionQueue).toHaveLength(0);
  });

  it('cancels any queued row and refunds the configured share of its original paid cost', () => {
    const { world, economy, barracks } = setup();
    const cost = resolveUnitStats('infantry', 'meridian').cost;
    const before = economy.balance('player');
    queueProduction(world, economy, 'player', barracks.id, 'infantry');
    queueProduction(world, economy, 'player', barracks.id, 'infantry');

    expect(cancelProduction(world, economy, barracks.id, 1)).toEqual({
      cancelled: true,
      refunded: Math.round(cost * ECONOMY_CONFIG.cancelRefundFraction),
    });
    expect(barracks.productionQueue).toHaveLength(1);
    expect(economy.balance('player')).toBe(before - cost * 2 + Math.round(cost * ECONOMY_CONFIG.cancelRefundFraction));
  });
});
