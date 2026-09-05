import { describe, expect, it } from 'vitest';
import { ECONOMY_CONFIG } from '../src/config/economy';
import { PRODUCTION_CONFIG } from '../src/config/production';
import { resolveUnitStats } from '../src/core/factionStats';
import { createMapGrid } from '../src/core/map';
import { MAP_CONFIG } from '../src/config/map';
import { createEconomy } from '../src/core/economy';
import {
  cancelProduction,
  checkProductionRequest,
  queueProduction,
  stepProduction,
} from '../src/core/production';
import { isUnderBuilding } from '../src/core/matchSetup';
import { createWorld } from '../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const economy = createEconomy();
  const hq = world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 30 } });
  const barracks = world.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 12, ty: 30 } });
  return { grid, world, economy, hq, barracks };
}

describe('production queues', () => {
  it('assigns each configured unit to its intended producer and charges once', () => {
    const { world, economy, hq, barracks } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
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

    stepProduction(world, grid, time / 2);
    expect(barracks.productionQueue.map((item) => item.elapsedSeconds)).toEqual([time / 2, 0]);
    stepProduction(world, grid, time / 2);

    expect(barracks.productionQueue).toHaveLength(1);
    expect(barracks.productionQueue[0]?.elapsedSeconds).toBe(0);
    const produced = world.units().find((unit) => unit.type === 'infantry');
    expect(produced).toBeDefined();
    if (produced === undefined) return;
    const tile = grid.worldToTile(produced.position);
    expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
    expect(isUnderBuilding(world, tile)).toBe(false);
  });

  it('pauses Factory timing without power and resumes from the same progress once powered', () => {
    const { grid, world, economy } = setup();
    const factory = world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    queueProduction(world, economy, 'player', factory.id, 'tank');

    stepProduction(world, grid, 10);
    expect(factory.productionQueue[0]?.elapsedSeconds).toBe(0);
    world.createBuilding({ type: 'powerPlant', owner: 'player', faction: 'meridian', topLeft: { tx: 32, ty: 30 } });
    stepProduction(world, grid, 2);
    expect(factory.productionQueue[0]?.elapsedSeconds).toBe(2);
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
