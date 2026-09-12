import { describe, expect, it } from 'vitest';
import { AI_CONFIG } from '../../src/config/ai';
import { MAP_CONFIG } from '../../src/config/map';
import { createAiState, observeAiStrategy, stepAi, type AiState } from '../../src/core/ai';
import { executeAiDefenseDecisions } from '../../src/core/aiDefense';
import { executeAiEconomyDecisions } from '../../src/core/aiEconomy';
import { executeAiMilitaryDecisions } from '../../src/core/aiMilitary';
import { stepConstruction } from '../../src/core/construction';
import { createEconomy, type Economy } from '../../src/core/economy';
import { createFogState, updateFogVisibility, type FogState } from '../../src/core/fog';
import { stepGather } from '../../src/core/gather';
import { createMapGrid, type MapGrid } from '../../src/core/map';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { stepMovement } from '../../src/core/movement';
import { stepProduction } from '../../src/core/production';
import { createResourceFieldState, type ResourceFieldState } from '../../src/core/resourceFieldState';
import { createWorld, type World } from '../../src/core/world';

const STEP_SECONDS = 0.25;

interface Simulation {
  readonly ai: AiState;
  readonly economy: Economy;
  readonly fog: FogState;
  readonly grid: MapGrid;
  readonly resourceFieldState: ResourceFieldState;
  readonly world: World;
}

function createSimulation(): Simulation {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  populateStartingEntities(world, grid);
  return {
    ai: createAiState(),
    economy: createEconomy(),
    fog: createFogState(grid),
    grid,
    resourceFieldState: createResourceFieldState(grid),
    world,
  };
}

function stepSimulation(simulation: Simulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP_SECONDS) {
    const { ai, economy, fog, grid, resourceFieldState, world } = simulation;
    stepMovement(world, STEP_SECONDS);
    stepGather(world, grid, resourceFieldState, economy, STEP_SECONDS);
    stepConstruction(world, STEP_SECONDS);
    stepProduction(world, grid, STEP_SECONDS);
    updateFogVisibility(fog, world, grid);
    const decision = stepAi(ai, observeAiStrategy(ai, world, grid, fog), STEP_SECONDS);
    executeAiEconomyDecisions(ai, decision, { world, grid, economy, resourceFieldState });
    executeAiMilitaryDecisions(ai, decision, { world, grid, economy });
    executeAiDefenseDecisions(ai, decision, { world, grid, fog });
  }
}

function addCompletedAiBase(simulation: Simulation): void {
  const { world } = simulation;
  world.createBuilding({ type: 'barracks', owner: 'ai', faction: 'ember', topLeft: { tx: 49, ty: 24 } });
  world.createBuilding({ type: 'powerPlant', owner: 'ai', faction: 'ember', topLeft: { tx: 53, ty: 24 } });
  world.createBuilding({ type: 'factory', owner: 'ai', faction: 'ember', topLeft: { tx: 58, ty: 24 } });
  world.createBuilding({ type: 'resourceDepot', owner: 'ai', faction: 'ember', topLeft: { tx: 49, ty: 35 } });
  simulation.ai.buildOrderIndex = AI_CONFIG.buildOrder.length;
}

function queuedUnits(simulation: Simulation): number {
  return simulation.world.buildings('ai').reduce((total, building) => total + building.productionQueue.length, 0);
}

describe('AI simulation boundaries', () => {
  it('rebuilds a destroyed building when its Worker remains alive', () => {
    const simulation = createSimulation();
    addCompletedAiBase(simulation);
    simulation.economy.earn('ai', 10_000);
    const barracks = simulation.world.buildings('ai').find((building) => building.type === 'barracks');
    expect(barracks).toBeDefined();
    simulation.world.remove(barracks!.id);

    stepSimulation(simulation, 180);

    expect(simulation.ai.state).not.toBe('recover');
    expect(simulation.world.buildings('ai').some((building) => building.type === 'barracks')).toBe(true);
  });

  it('replaces a lost Worker and resumes rebuilding', () => {
    const simulation = createSimulation();
    addCompletedAiBase(simulation);
    const barracks = simulation.world.buildings('ai').find((building) => building.type === 'barracks');
    expect(barracks).toBeDefined();
    simulation.world.remove(barracks!.id);
    for (const worker of simulation.world.units('ai').filter((unit) => unit.type === 'worker')) {
      simulation.world.remove(worker.id);
    }

    stepSimulation(simulation, 180);

    expect(simulation.ai.state).not.toBe('recover');
    expect(simulation.world.units('ai').some((unit) => unit.type === 'worker')).toBe(true);
    expect(simulation.world.buildings('ai').some((building) => building.type === 'barracks')).toBe(true);
  });

  it('queues reinforcements while defending', () => {
    const simulation = createSimulation();
    addCompletedAiBase(simulation);
    simulation.economy.earn('ai', 10_000);
    const hq = simulation.world.buildings('ai').find((building) => building.type === 'hq')!;
    simulation.world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: { x: hq.position.x, y: hq.position.y + simulation.grid.tileSizePixels * 2 },
    });

    const armyBefore = simulation.world.units('ai').filter((unit) => unit.stats.attack !== null).length;
    stepSimulation(simulation, 10);

    expect(simulation.ai.state).toBe('defend');
    expect(queuedUnits(simulation)).toBeGreaterThan(0);
    expect(simulation.world.units('ai').filter((unit) => unit.stats.attack !== null).length).toBeGreaterThan(armyBefore);
  });

  it('queues reinforcements while recovering', () => {
    const simulation = createSimulation();
    addCompletedAiBase(simulation);
    simulation.economy.earn('ai', 10_000);
    const depot = simulation.world.buildings('ai').find((building) => building.type === 'resourceDepot');
    expect(depot).toBeDefined();
    simulation.world.remove(depot!.id);

    const armyBefore = simulation.world.units('ai').filter((unit) => unit.stats.attack !== null).length;
    stepSimulation(simulation, 10);

    expect(simulation.ai.state).toBe('recover');
    expect(queuedUnits(simulation)).toBeGreaterThan(0);
    expect(simulation.world.units('ai').filter((unit) => unit.stats.attack !== null).length).toBeGreaterThan(armyBefore);
  });
});
