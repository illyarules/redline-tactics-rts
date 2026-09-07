import { describe, expect, it, vi } from 'vitest';
import { AI_CONFIG } from '../../src/config/ai';
import { BUILDING_CONFIG } from '../../src/config/buildings';
import { MAP_CONFIG } from '../../src/config/map';
import { createAiState, isAiSnapshotShape, observeAiWorld, restoreAiState, serializeAiState, stepAi } from '../../src/core/ai';
import { executeAiEconomyDecisions, executeAiEconomyIntent, planAiEconomy } from '../../src/core/aiEconomy';
import { planAiPlacement } from '../../src/core/aiPlacement';
import { stepConstruction } from '../../src/core/construction';
import { createEconomy } from '../../src/core/economy';
import { createFogState } from '../../src/core/fog';
import * as gather from '../../src/core/gather';
import { tileRectContains } from '../../src/core/geometry';
import { createMapGrid } from '../../src/core/map';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { checkBuildingPlacement } from '../../src/core/placement';
import { isCompleted } from '../../src/core/prerequisites';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { restoreWorld, serializeWorld } from '../../src/core/snapshot';
import { createWorld } from '../../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  populateStartingEntities(world, grid);
  return { world, grid, economy: createEconomy(), resourceFieldState: createResourceFieldState(grid) };
}

describe('AI economy', () => {
  it('plans without mutation and assigns a deterministic field through the normal API', () => {
    const context = setup();
    const ai = createAiState();
    const worker = context.world.units('ai').find((w) => w.type === 'worker')!;
    const plan = planAiEconomy(ai, context);
    expect(plan).toEqual(planAiEconomy(ai, context));
    expect(worker.order).toBeNull();
    expect(plan.intent?.kind).toBe('gather');
    const nearest = [...context.grid.resourceFields].sort((a, b) => {
      const base = context.grid.worldToTile(context.world.buildings('ai')[0]!.position);
      return Math.hypot(a.center.tx - base.tx, a.center.ty - base.ty) - Math.hypot(b.center.tx - base.tx, b.center.ty - base.ty);
    })[0]!;
    expect(plan.intent).toMatchObject({ fieldId: nearest.id });
    const spy = vi.spyOn(gather, 'issueGatherOrder');
    expect(executeAiEconomyIntent(context, plan.intent!)).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(context.world.unit(worker.id)?.order).toMatchObject({ kind: 'Gather', fieldId: nearest.id });
    spy.mockRestore();
  });

  it.each(['worker', 'field', 'dropoff'] as const)('does not mutate when no valid %s exists', (missing) => {
    const context = setup();
    if (missing === 'worker') for (const w of context.world.units('ai')) context.world.remove(w.id);
    if (missing === 'dropoff') for (const b of context.world.buildings('ai')) context.world.remove(b.id);
    if (missing === 'field') for (const f of context.grid.resourceFields) context.resourceFieldState.take(f.id, f.credits);
    // Isolate income planning from affordable construction.
    context.economy.spend('ai', context.economy.balance('ai'));
    const before = JSON.stringify(context.world.units());
    expect(planAiEconomy(createAiState(), context).intent).toBeNull();
    expect(JSON.stringify(context.world.units())).toBe(before);
    expect(context.economy.balance('ai')).toBe(0);
  });

  it('starts Barracks with a real Worker, charges once and waits for completion', () => {
    const context = setup();
    const ai = createAiState();
    executeAiEconomyIntent(context, planAiEconomy(ai, context).intent!);
    const intent = planAiEconomy(ai, context).intent!;
    expect(intent).toMatchObject({ kind: 'construct', buildingType: 'barracks' });
    const before = context.economy.balance('ai');
    expect(executeAiEconomyIntent(context, intent)).toBe(true);
    expect(context.economy.balance('ai')).toBe(before - BUILDING_CONFIG.barracks.cost);
    expect(executeAiEconomyIntent(context, intent)).toBe(false);
    expect(planAiEconomy(ai, context)).toEqual({ buildOrderIndex: 0, intent: null });
    expect(context.world.units('ai').find((w) => w.type === 'worker')?.order?.kind).toBe('Build');
    expect(context.world.buildings('ai').find((b) => b.type === 'barracks')?.constructionProgress).toBe(0);
    for (let i = 0; i < 160; i++) stepConstruction(context.world, 0.25);
    expect(planAiEconomy(ai, context).buildOrderIndex).toBe(1);
  });

  it('rejects unaffordable and blocked stale intents without partial mutation', () => {
    for (const failure of ['credits', 'placement']) {
      const context = setup();
      const ai = createAiState();
      executeAiEconomyIntent(context, planAiEconomy(ai, context).intent!);
      const intent = planAiEconomy(ai, context).intent!;
      if (intent.kind !== 'construct') throw new Error('Expected construction');
      if (failure === 'credits') context.economy.spend('ai', context.economy.balance('ai'));
      else context.world.createBuilding({ type: 'barracks', owner: 'player', faction: 'meridian', topLeft: intent.topLeft });
      const before = JSON.stringify([context.world.units(), context.world.buildings(), context.economy.balance('ai')]);
      expect(executeAiEconomyIntent(context, intent)).toBe(false);
      expect(JSON.stringify([context.world.units(), context.world.buildings(), context.economy.balance('ai')])).toBe(before);
    }
  });

  it('returns explicit no-placement in a blocked bounded search and keeps a depot near resources', () => {
    const { world, grid } = setup();
    const hq = world.buildings('ai')[0]!;
    expect(planAiPlacement(world, grid, 'ai', 'ember', 'barracks', hq.topLeft, 0)).toEqual({ kind: 'no-placement' });
    const field = [...grid.resourceFields].sort((a, b) => Math.hypot(a.center.tx - hq.topLeft.tx, a.center.ty - hq.topLeft.ty) - Math.hypot(b.center.tx - hq.topLeft.tx, b.center.ty - hq.topLeft.ty))[0]!;
    const result = planAiPlacement(world, grid, 'ai', 'ember', 'resourceDepot', hq.topLeft, 12, field);
    expect(result.kind).toBe('placement');
    if (result.kind !== 'placement') throw new Error('Expected placement');
    expect(checkBuildingPlacement(world, grid, 'resourceDepot', result.topLeft).valid).toBe(true);
    expect(Math.hypot(result.topLeft.tx - field.center.tx, result.topLeft.ty - field.center.ty)).toBeLessThan(8);
    expect(grid.resourceFields.some((f) => f.tiles.some((t) => tileRectContains({ ...result.topLeft, ...BUILDING_CONFIG.resourceDepot.footprint }, t)))).toBe(false);
  });

  it('finishes the ordered base deterministically using only initial Credits and deposited resources', () => {
    function simulate(reload = false) {
      let context = setup();
      let ai = createAiState();
      const fog = createFogState(context.grid);
      const initial = context.economy.balance('ai');
      const remaining = () => context.grid.resourceFields.reduce((n, f) => n + context.resourceFieldState.remaining(f.id), 0);
      const initialResources = remaining();
      const completed: string[] = [];
      for (let frame = 0; frame < 2400 && ai.buildOrderIndex < AI_CONFIG.buildOrder.length; frame++) {
        gather.stepGather(context.world, context.grid, context.resourceFieldState, context.economy, 0.25);
        stepConstruction(context.world, 0.25);
        executeAiEconomyDecisions(ai, stepAi(ai, observeAiWorld(context.world, context.grid, fog), 0.25), context);
        expect(context.world.buildings('ai').filter((b) => b.status === 'constructing').length).toBeLessThanOrEqual(1);
        for (const b of context.world.buildings('ai')) if (b.type !== 'hq' && isCompleted(b) && !completed.includes(b.type)) completed.push(b.type);
        if (reload && frame === 201) {
          const snapshot = serializeWorld(context.world, [], context.economy, context.resourceFieldState, fog, context.grid, ai);
          const restored = restoreWorld(JSON.parse(JSON.stringify(snapshot)), context.grid);
          expect(restored.ai).toEqual(ai);
          expect(restored.ai.buildOrderIndex).toBeGreaterThan(0);
          context = { ...restored, grid: context.grid };
          ai = restored.ai;
        }
      }
      expect(completed).toEqual(AI_CONFIG.buildOrder);
      expect(ai.buildOrderIndex).toBe(4);
      const spent = context.world.buildings('ai').reduce((n, b) => n + b.stats.cost, 0);
      const carried = context.world.units('ai').reduce((n, w) => n + w.carriedCredits, 0);
      expect(context.economy.balance('ai') + spent + carried).toBe(initial + initialResources - remaining());
      return { completed, buildings: context.world.buildings('ai').map((b) => ({ type: b.type, topLeft: b.topLeft })), balance: context.economy.balance('ai') };
    }
    expect(simulate(true)).toEqual(simulate());
  });

  it('persists progress and the exact remainder through the full world snapshot', () => {
    const context = setup();
    const ai = createAiState();
    ai.buildOrderIndex = 2;
    ai.decisionRemainingSeconds = 0.375;
    const fog = createFogState(context.grid);
    const snapshot = serializeWorld(context.world, [], context.economy, context.resourceFieldState, fog, context.grid, ai);
    const restored = restoreWorld(JSON.parse(JSON.stringify(snapshot)), context.grid);
    expect(restored.ai).toEqual(ai);
    expect(restoreAiState(serializeAiState(ai))).toEqual(ai);
  });

  it.each([-1, 5, 0.5, NaN, Infinity, '1', null, undefined])('rejects malformed build progress %s', (index) => {
    expect(isAiSnapshotShape({ ...serializeAiState(createAiState()), buildOrderIndex: index })).toBe(false);
  });
});
