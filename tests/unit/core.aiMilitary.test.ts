import { describe, expect, it } from 'vitest';
import { AI_CONFIG } from '../../src/config/ai';
import { MAP_CONFIG } from '../../src/config/map';
import { PRODUCTION_CONFIG } from '../../src/config/production';
import { createAiState, isAiSnapshotShape, observeAiStrategy, restoreAiState, serializeAiState, stepAi, updateAiKnowledge } from '../../src/core/ai';
import { executeAiMilitaryDecisions, executeAiMilitaryIntent, planAiMilitary } from '../../src/core/aiMilitary';
import { executeAiEconomyDecisions } from '../../src/core/aiEconomy';
import { issueAttackOrders, stepAttackOrders } from '../../src/core/attack';
import { issueAttackMoveOrders, stepAttackMoveOrders } from '../../src/core/attackMove';
import { createAutoTargetingState, stepAutomaticTargeting, issueRetaliationOrders } from '../../src/core/autoCombat';
import { createEconomy } from '../../src/core/economy';
import { resolveUnitStats } from '../../src/core/factionStats';
import { createFogState, fogTargetPredicate, updateFogVisibility } from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { attackMoveOrder, attackOrder } from '../../src/core/orders';
import { stepConstruction } from '../../src/core/construction';
import { stepGather } from '../../src/core/gather';
import { stepMovement } from '../../src/core/movement';
import { stepProduction } from '../../src/core/production';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { restoreWorld, serializeWorld } from '../../src/core/snapshot';
import { createWorld } from '../../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const economy = createEconomy();
  const ai = createAiState();
  ai.buildOrderIndex = AI_CONFIG.buildOrder.length;
  ai.state = 'produce';
  world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 30, ty: 30 } });
  const barracks = world.createBuilding({ type: 'barracks', owner: 'ai', faction: 'ember', topLeft: { tx: 12, ty: 30 } });
  const factory = world.createBuilding({ type: 'factory', owner: 'ai', faction: 'ember', topLeft: { tx: 24, ty: 30 } });
  const power = world.createBuilding({ type: 'powerPlant', owner: 'ai', faction: 'ember', topLeft: { tx: 18, ty: 30 } });
  world.createUnit({ type: 'worker', owner: 'ai', faction: 'ember', position: grid.tileCenter(35, 35) });
  const fog = createFogState(grid);
  return { grid, world, economy, ai, barracks, factory, power, fog };
}
function queueNext(c: ReturnType<typeof setup>) {
  const intent = planAiMilitary(c.ai, c).find((p) => p.kind === 'produce');
  return intent !== undefined && executeAiMilitaryIntent(c.ai, c, intent);
}
function executeDecision(c: ReturnType<typeof setup>, readout?: { latestAction: string }) {
  executeAiMilitaryDecisions(c.ai, {
    evaluations: 1,
    transition: null,
    intents: [{ kind: 'none', state: c.ai.state }],
  }, c, readout);
}
describe('AI military', () => {
  it('uses every operational producer and rotates only multi-option production', () => {
    const c = setup();
    c.economy.earn('ai', 10000);
    const before = c.economy.balance('ai');
    executeDecision(c);
    executeDecision(c);
    expect(c.barracks.productionQueue.map((q) => q.unitType)).toEqual(['infantry', 'infantry']);
    expect(c.factory.productionQueue.map((q) => q.unitType)).toEqual(['tank', 'rocket']);
    expect(c.ai.productionCycleIndex).toBe(3);
    expect(c.economy.balance('ai')).toBe(before - resolveUnitStats('infantry', 'ember').cost * 2 -
      resolveUnitStats('tank', 'ember').cost - resolveUnitStats('rocket', 'ember').cost);
  });
  it('caps normal Infantry at two once an operational Factory can provide vehicles', () => {
    const c = setup();
    c.economy.earn('ai', 10_000);
    executeDecision(c);
    executeDecision(c);
    executeDecision(c);
    expect(c.barracks.productionQueue.map((item) => item.unitType)).toEqual(['infantry', 'infantry']);
    expect(c.factory.productionQueue.map((item) => item.unitType)).toEqual(['tank', 'rocket', 'tank']);
  });
  it('allows a third Infantry without a Factory, then waits for vehicle production', () => {
    const c = setup();
    c.world.remove(c.factory.id);
    c.world.remove(c.power.id);
    c.economy.earn('ai', 10_000);
    const infantry = Array.from({ length: AI_CONFIG.minimumAttackArmyUnits }, (_, index) => c.world.createUnit({
      type: 'infantry' as const,
      owner: 'ai' as const,
      faction: 'ember' as const,
      position: c.grid.tileCenter(20 + index, 40),
    }));
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'produce' && intent.unitType === 'infantry')).toBe(false);
    c.world.remove(infantry[0]!.id);
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'produce' && intent.unitType === 'infantry')).toBe(true);
  });
  it('allows emergency Infantry above the normal composition cap while defending', () => {
    const c = setup();
    c.economy.earn('ai', 10_000);
    c.ai.state = 'defend';
    for (let index = 0; index < 2; index++) {
      c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20 + index, 40) });
    }
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'produce' && intent.unitType === 'infantry')).toBe(true);
  });
  it.each(['incomplete', 'unpowered', 'enemy', 'credits', 'full'] as const)('rejects %s production without mutation', (failure) => {
    const c = setup();
    c.world.remove(c.barracks.id);
    c.ai.productionCycleIndex = 1;
    if (failure === 'incomplete') c.world.setConstructionProgress(c.factory.id, 0);
    if (failure === 'unpowered') c.world.remove(c.power.id);
    if (failure === 'enemy') {
      c.world.remove(c.factory.id);
      c.world.createBuilding({ type: 'factory', owner: 'player', faction: 'meridian', topLeft: { tx: 24, ty: 30 } });
    }
    if (failure === 'credits') c.economy.spend('ai', c.economy.balance('ai'));
    if (failure === 'full') c.world.setProductionQueue(c.factory.id, Array.from({ length: PRODUCTION_CONFIG.queueCapacity }, () => ({ unitType: 'tank' as const, elapsedSeconds: 0, paidCost: 100 })));
    const before = JSON.stringify([c.world.buildings(), c.economy.balance('ai'), c.ai]);
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'produce' && intent.producerId === c.factory.id)).toBe(false);
    expect(executeAiMilitaryIntent(c.ai, c, { kind: 'produce', producerId: c.factory.id, unitType: 'tank' })).toBe(false);
    expect(JSON.stringify([c.world.buildings(), c.economy.balance('ai'), c.ai])).toBe(before);
  });
  it('produces before opening completion while preserving the next unstarted building cost', () => {
    const c = setup();
    c.world.remove(c.factory.id);
    c.world.remove(c.power.id);
    c.ai.buildOrderIndex = 1;
    c.economy.spend('ai', c.economy.balance('ai') - 349);
    expect(queueNext(c)).toBe(false);
    c.economy.earn('ai', 1);
    expect(queueNext(c)).toBe(true);
    expect(c.barracks.productionQueue.map((item) => item.unitType)).toEqual(['infantry']);
    expect(executeAiMilitaryIntent(c.ai, c, { kind: 'produce', producerId: c.factory.id, unitType: 'infantry' })).toBe(false);
  });
  it('keeps producing available Infantry when another producer is unavailable', () => {
    const c = setup();
    c.economy.earn('ai', 10_000);
    c.world.setConstructionProgress(c.factory.id, 0);
    executeDecision(c);
    expect(c.barracks.productionQueue.map((item) => item.unitType)).toEqual(['infantry']);
    expect(c.factory.productionQueue).toEqual([]);
  });
  it('does not count a queued Worker toward the combat reinforcement target', () => {
    const c = setup();
    c.economy.earn('ai', 10_000);
    const hq = c.world.buildings('ai').find((building) => building.type === 'hq')!;
    c.world.setProductionQueue(hq.id, [{ unitType: 'worker', elapsedSeconds: 0, paidCost: 150 }]);
    for (let i = 0; i < AI_CONFIG.targetArmyUnits - 1; i++) {
      c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20 + i, 40) });
    }
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'produce' && intent.unitType !== 'worker')).toBe(true);
  });
  it('chooses the first combat unit and a static map start even if a hidden HQ moves', () => {
    const c = setup();
    c.ai.state = 'scout';
    c.world.createUnit({ type: 'worker', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20, 40) });
    const scout = c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20, 40) });
    c.world.createUnit({ type: 'tank', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(21, 40) });
    const hq = c.world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 30 } });
    const plan = () => planAiMilitary(c.ai, c).find((p) => p.kind === 'scout');
    const start = c.grid.startFor('player')!.hqTopLeft;
    expect(plan()).toEqual({ kind: 'scout', unitIds: [scout.id], target: c.grid.tileCenter(start.tx, start.ty) });
    c.world.setPosition(hq.id, c.grid.tileCenter(50, 30));
    updateAiKnowledge(c.ai, c.world, c.fog);
    expect(c.ai.lastKnownPlayerBasePosition).toBeNull();
    expect(executeAiMilitaryIntent(c.ai, c, plan()!)).toBe(true);
    const order = scout.order;
    expect(plan()).toBeUndefined();
    expect(scout.order).toBe(order);
  });
  it('remembers only visible HQ positions through fog loss and complete snapshot restoration', () => {
    const c = setup();
    const hq = c.world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 4, ty: 30 } });
    updateAiKnowledge(c.ai, c.world, c.fog);
    expect(c.ai.lastKnownPlayerBasePosition).toBeNull();
    const scout = c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: hq.position });
    updateFogVisibility(c.fog, c.world, c.grid);
    updateAiKnowledge(c.ai, c.world, c.fog);
    const remembered = { ...hq.position };
    c.world.remove(scout.id);
    updateFogVisibility(c.fog, c.world, c.grid);
    c.world.setPosition(hq.id, c.grid.tileCenter(50, 30));
    updateAiKnowledge(c.ai, c.world, c.fog);
    c.ai.productionCycleIndex = 2;
    c.ai.decisionRemainingSeconds = 0.25;
    expect(c.ai.lastKnownPlayerBasePosition).toEqual(remembered);
    expect(restoreAiState(serializeAiState(c.ai))).toEqual(c.ai);
    const snapshot = serializeWorld(c.world, [], c.economy, createResourceFieldState(c.grid), c.fog, c.grid, c.ai);
    expect(restoreWorld(snapshot, c.grid).ai).toEqual(c.ai);
    c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: hq.position });
    updateFogVisibility(c.fog, c.world, c.grid);
    updateAiKnowledge(c.ai, c.world, c.fog);
    expect(c.ai.lastKnownPlayerBasePosition).toEqual(hq.position);
  });
  it.each([
    { productionCycleIndex: -1 }, { productionCycleIndex: 0.5 }, { productionCycleIndex: AI_CONFIG.productionCycle.length },
    { lastKnownPlayerBasePosition: undefined }, { lastKnownPlayerBasePosition: { x: Infinity, y: 0 } },
    { lastKnownPlayerBasePosition: { x: 0, y: -1 } }, { lastKnownPlayerBasePosition: { x: 0 } },
    { decisionRemainingSeconds: NaN },
  ])('rejects malformed memory %j', (patch) => {
    const raw = { ...serializeAiState(createAiState()), ...patch };
    expect(isAiSnapshotShape(raw)).toBe(false);
    expect(() => restoreAiState(raw as ReturnType<typeof serializeAiState>)).toThrow();
  });
  it('gates attacks on both memory and army, issues normal routes, then preserves them', () => {
    const c = setup();
    c.ai.state = 'attack';
    for (let i = 0; i < AI_CONFIG.minimumAttackArmyUnits; i++) c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20 + i, 40) });
    expect(planAiMilitary(c.ai, c).some((p) => p.kind === 'attack')).toBe(false);
    c.ai.lastKnownPlayerBasePosition = c.grid.tileCenter(5, 30);
    expect(planAiMilitary(c.ai, c).some((p) => p.kind === 'produce')).toBe(true);
    const attack = planAiMilitary(c.ai, c).find((p) => p.kind === 'attack')!;
    expect(executeAiMilitaryIntent(c.ai, c, attack)).toBe(true);
    const combatUnits = () => c.world.units('ai').filter((unit) => unit.stats.attack !== null);
    const orders = combatUnits().map((u) => u.order);
    expect(orders.every((o) => o?.kind === 'AttackMove')).toBe(true);
    for (let i = 0; i < 5; i++) expect(planAiMilitary(c.ai, c).some((p) => p.kind === 'attack')).toBe(false);
    combatUnits().forEach((u, i) => expect(u.order).toBe(orders[i]));
    const reinforcement = c.world.createUnit({ type: 'rocket', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(25, 40) });
    const reinforce = planAiMilitary(c.ai, c).find((p) => p.kind === 'attack')!;
    expect(reinforce).toMatchObject({ unitIds: [reinforcement.id], target: c.ai.lastKnownPlayerBasePosition });
    expect(executeAiMilitaryIntent(c.ai, c, reinforce)).toBe(true);
    combatUnits().slice(0, orders.length).forEach((u, i) => expect(u.order).toBe(orders[i]));
    c.world.remove(reinforcement.id);
    c.world.remove(combatUnits()[0]!.id);
    expect(executeAiMilitaryIntent(c.ai, c, attack)).toBe(false);
  });
  it('launches every surviving combat unit with 20 Credits and reports Last Stand', () => {
    const c = setup();
    for (const worker of c.world.units('ai').filter((unit) => unit.type === 'worker')) c.world.remove(worker.id);
    c.economy.spend('ai', c.economy.balance('ai') - 20);
    const infantry = c.world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20, 40),
    });
    const tank = c.world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(21, 40),
    });
    const enemy = c.world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: c.grid.tileCenter(22, 40),
    });
    c.world.setOrder(infantry.id, attackOrder(enemy.id));
    c.ai.lastKnownPlayerBasePosition = c.grid.tileCenter(5, 30);
    const readout = { latestAction: '' };

    expect(planAiMilitary(c.ai, c)).toEqual([{
      kind: 'lastStand', unitIds: [infantry.id, tank.id], target: c.ai.lastKnownPlayerBasePosition,
    }]);
    executeDecision(c, readout);

    expect(readout.latestAction).toBe('last stand 2');
    expect([infantry.order, tank.order]).toEqual([
      expect.objectContaining({ kind: 'AttackMove', target: c.ai.lastKnownPlayerBasePosition }),
      expect.objectContaining({ kind: 'AttackMove', target: c.ai.lastKnownPlayerBasePosition }),
    ]);
    expect(planAiMilitary(c.ai, c)).toEqual([]);
  });
  it('waits for an affordable or already queued Worker instead of launching Last Stand', () => {
    const c = setup();
    for (const worker of c.world.units('ai').filter((unit) => unit.type === 'worker')) c.world.remove(worker.id);
    c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20, 40) });

    expect(planAiMilitary(c.ai, c)).toEqual([
      expect.objectContaining({ kind: 'produce', unitType: 'worker' }),
    ]);

    const hq = c.world.buildings('ai').find((building) => building.type === 'hq')!;
    c.world.setProductionQueue(hq.id, [{ unitType: 'worker', elapsedSeconds: 0, paidCost: 150 }]);
    c.economy.spend('ai', c.economy.balance('ai') - 20);
    expect(planAiMilitary(c.ai, c).some((intent) => intent.kind === 'lastStand')).toBe(false);
  });
  it('falls back to the opponent start and persists Last Stand after the AI HQ is destroyed', () => {
    const c = setup();
    const infantry = c.world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: c.grid.tileCenter(20, 40),
    });
    const hq = c.world.buildings('ai').find((building) => building.type === 'hq')!;
    c.world.remove(hq.id);
    const start = c.grid.startFor('player')!.hqTopLeft;
    const target = c.grid.tileCenter(start.tx, start.ty);
    const intent = planAiMilitary(c.ai, c).find((candidate) => candidate.kind === 'lastStand')!;

    expect(intent).toEqual({ kind: 'lastStand', unitIds: [infantry.id], target });
    expect(executeAiMilitaryIntent(c.ai, c, intent)).toBe(true);
    const snapshot = serializeWorld(c.world, [], c.economy, createResourceFieldState(c.grid), c.fog, c.grid, c.ai);
    const restored = restoreWorld(snapshot, c.grid);

    const restoredInfantry = restored.world.units('ai').find((unit) => unit.type === 'infantry');
    expect(restoredInfantry?.order).toMatchObject({ kind: 'AttackMove', target });
    expect(planAiMilitary(restored.ai!, { world: restored.world, grid: c.grid, economy: restored.economy })).toEqual([]);
  });
  it.each(['ai', 'player'] as const)('blocks hidden explicit attacks, acquisition, retaliation and pursuit for %s', (owner) => {
    const c = setup();
    const attacker = c.world.createUnit({ type: 'infantry', owner, faction: 'ember', position: c.grid.tileCenter(40, 30) });
    const enemy = c.world.createUnit({ type: 'infantry', owner: owner === 'ai' ? 'player' : 'ai', faction: 'ember', position: c.grid.tileCenter(41, 30) });
    const canTarget = fogTargetPredicate(c.fog);
    expect(issueAttackOrders(c.world, owner, [attacker.id], enemy.id, canTarget)).toEqual([]);
    expect(stepAutomaticTargeting(c.world, createAutoTargetingState(), 1, undefined, canTarget)).toEqual([]);
    expect(issueRetaliationOrders(c.world, [{ kind: 'hit', attackerId: enemy.id, targetId: attacker.id, damage: 1, destroyed: false }], canTarget)).toEqual([]);
    c.world.setOrder(attacker.id, attackOrder(enemy.id));
    expect(stepAttackOrders(c.world, c.grid, 1, canTarget)).toEqual([]);
    expect(attacker.order).toBeNull();
    issueAttackMoveOrders(c.world, c.grid, owner, [attacker.id], c.grid.tileCenter(45, 30));
    if (attacker.order?.kind !== 'AttackMove') throw new Error('Expected route');
    const route = attacker.order.route;
    c.world.setOrder(attacker.id, attackMoveOrder(attacker.order.target, route, attackOrder(enemy.id)));
    expect(stepAttackMoveOrders(c.world, c.grid, 1, canTarget)).toEqual([]);
    expect(attacker.order).toMatchObject({ kind: 'AttackMove', engagement: null, route });
    expect(enemy.health).toBe(enemy.stats.maxHealth);
  });
  // eslint-disable-next-line complexity -- This integration scenario intentionally exercises its complete strategic sequence.
  it('completes an ordinary economy, produces an arbitrary attack group and launches within bounded strategic ticks', () => {
    const grid = createMapGrid(MAP_CONFIG);
    const world = createWorld({ tileSizePixels: grid.tileSizePixels });
    populateStartingEntities(world, grid);
    for (const unit of world.units('ai')) if (unit.type !== 'worker') world.remove(unit.id);
    const context = { world, grid, economy: createEconomy(), resourceFieldState: createResourceFieldState(grid) };
    const fog = createFogState(grid);
    const ai = createAiState();
    let readyAt: number | null = null;
    let launchedAt: number | null = null;
    const readout = { latestAction: '' };
    for (let t = 0; t < 1200; t += 0.25) {
      stepMovement(world, 0.25);
      stepGather(world, grid, context.resourceFieldState, context.economy, 0.25);
      stepConstruction(world, 0.25);
      stepProduction(world, grid, 0.25);
      updateFogVisibility(fog, world, grid);
      const observation = observeAiStrategy(ai, world, grid, fog);
      if (readyAt === null && observation.playerBaseKnown && observation.combatUnitCount >= AI_CONFIG.minimumAttackArmyUnits) readyAt = t;
      const decision = stepAi(ai, observation, 0.25);
      executeAiEconomyDecisions(ai, decision, context);
      executeAiMilitaryDecisions(ai, decision, context, readout);
      if (launchedAt === null && readout.latestAction.startsWith('attack')) launchedAt = t;
      if (launchedAt !== null && ai.buildOrderIndex === AI_CONFIG.buildOrder.length) break;
      stepAttackMoveOrders(world, grid, 0.25, fogTargetPredicate(fog));
    }
    expect(ai.buildOrderIndex).toBe(AI_CONFIG.buildOrder.length);
    expect(world.units('ai').filter((unit) => unit.stats.attack !== null).length).toBeGreaterThanOrEqual(
      AI_CONFIG.minimumAttackArmyUnits,
    );
    expect(readyAt).not.toBeNull();
    expect(launchedAt).not.toBeNull();
    expect(launchedAt! - readyAt!).toBeLessThanOrEqual(3 * AI_CONFIG.decisionIntervalSeconds);
  });
});
