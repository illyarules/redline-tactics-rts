import { describe, expect, it } from 'vitest';
import { AI_CONFIG } from '../../src/config/ai';
import { BUILDING_CONFIG } from '../../src/config/buildings';
import { MAP_CONFIG } from '../../src/config/map';
import { createAiState, observeAiStrategy, stepAi } from '../../src/core/ai';
import { observeAiDefense, planAiDefense, executeAiDefenseIntent } from '../../src/core/aiDefense';
import { planAiEconomy, executeAiEconomyDecisions, executeAiEconomyIntent } from '../../src/core/aiEconomy';
import { planAiMilitary } from '../../src/core/aiMilitary';
import { createEconomy } from '../../src/core/economy';
import { createFogState, updateFogVisibility, fogTargetPredicate } from '../../src/core/fog';
import { createMapGrid } from '../../src/core/map';
import { populateStartingEntities } from '../../src/core/matchSetup';
import { createResourceFieldState } from '../../src/core/resourceFieldState';
import { createWorld } from '../../src/core/world';
import { stepConstruction } from '../../src/core/construction';
import { stepGather } from '../../src/core/gather';
import { isCompleted } from '../../src/core/prerequisites';
import { restoreWorld, serializeWorld } from '../../src/core/snapshot';
import { stepAttackOrders } from '../../src/core/attack';
import { issueAttackMoveOrders, stepAttackMoveOrders } from '../../src/core/attackMove';
import { createAutoTargetingState, stepAutomaticTargeting, issueRetaliationOrders } from '../../src/core/autoCombat';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  populateStartingEntities(world, grid);
  return { grid, world, economy: createEconomy(), resourceFieldState: createResourceFieldState(grid), fog: createFogState(grid), ai: createAiState() };
}

describe('AI defense and recovery', () => {
  it('filters fog/radius/noncombat threats, sorts and caps defenders, preserves identical orders and exits defense', () => {
    const c = setup();
    const base = c.world.buildings('ai')[0]!;
    const spawn = (owner: 'player' | 'ai', x: number, type: 'infantry' | 'worker' = 'infantry') => c.world.createUnit({
      type, owner, faction: owner === 'ai' ? 'ember' : 'meridian', position: { x: base.position.x + x, y: base.position.y + c.grid.tileSizePixels * 3 } });
    const threats = [spawn('player', 0), spawn('player', 0)];
    spawn('player', c.grid.tileSizePixels * 20);
    spawn('player', 0, 'worker');
    for (let i = 0; i < 7; i++) spawn('ai', i * 2);
    const dead = spawn('ai', 0); c.world.damage(dead.id, 100000);
    executeAiEconomyIntent(c, planAiEconomy(c.ai, c).intent!);
    expect(observeAiDefense(c).threats).toEqual([]);
    c.ai.state = 'defend';
    expect(planAiDefense(c.ai, c).every((p) => p.kind !== 'defend')).toBe(true);
    updateFogVisibility(c.fog, c.world, c.grid);
    const observed = observeAiDefense(c);
    expect(observed.threats.map((u) => u.id)).toEqual(threats.map((u) => u.id).sort());
    expect(observed.defenders).toHaveLength(AI_CONFIG.maximumDefenders);
    expect(observed.defenders.every((u) => u.type !== 'worker' && u.id !== dead.id)).toBe(true);
    expect(observed.defenders.map((u) => u.position.x)).toEqual([...observed.defenders.map((u) => u.position.x)].sort((a,b) => a-b));
    c.ai.state = 'attack';
    stepAi(c.ai, observeAiStrategy(c.ai, c.world, c.grid, c.fog), 1);
    expect(c.ai.state).toBe('defend');
    for (const intent of planAiDefense(c.ai, c)) expect(executeAiDefenseIntent(c.ai, c, intent)).toBe(true);
    const orders = observed.defenders.map((u) => u.order);
    expect(planAiDefense(c.ai, c)).toEqual([]);
    expect(observed.defenders.map((u) => u.order)).toEqual(orders);
    const build = planAiEconomy(c.ai, c).intent!;
    expect(build.kind).toBe('construct');
    expect(executeAiEconomyIntent(c, build)).toBe(true);
    expect(c.world.units('ai').some((u) => u.type === 'worker' && u.order?.kind === 'Build')).toBe(true);
    expect(observeAiDefense(c).defenders.every((u) => u.type !== 'worker')).toBe(true);
    const stale = { kind: 'defend' as const, unitId: observed.defenders[0]!.id, targetId: threats[0]!.id };
    c.fog = createFogState(c.grid);
    expect(executeAiDefenseIntent(c.ai, c, stale)).toBe(false);
    stepAttackOrders(c.world, c.grid, 0.25, fogTargetPredicate(c.fog));
    expect(observed.defenders.every((u) => u.order === null)).toBe(true);
    const rally = planAiDefense(c.ai, c);
    expect(rally.length).toBeGreaterThan(0);
    for (const intent of rally) expect(executeAiDefenseIntent(c.ai, c, intent)).toBe(true);
    expect(planAiDefense(c.ai, c)).toEqual([]);
    stepAi(c.ai, observeAiStrategy(c.ai, c.world, c.grid, c.fog), 1);
    expect(c.ai.state).toBe('scout');
  });

  it('restores defense orders and releases obsolete assignments before normal strategy resumes', () => {
    const c = setup(); c.ai.state = 'defend';
    const base = c.world.buildings('ai')[0]!;
    const position = { x: base.position.x, y: base.position.y + 3 * c.grid.tileSizePixels };
    const unit = c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position });
    c.world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position });
    updateFogVisibility(c.fog, c.world, c.grid);
    for (const intent of planAiDefense(c.ai,c)) executeAiDefenseIntent(c.ai,c,intent);
    const snapshot = serializeWorld(c.world,[],c.economy,c.resourceFieldState,c.fog,c.grid,c.ai);
    const restored = { ...restoreWorld(JSON.parse(JSON.stringify(snapshot)),c.grid), grid: c.grid };
    expect(planAiDefense(restored.ai,restored)).toEqual([]);
    c.world.setPosition(unit.id,c.grid.tileCenter(0,0));
    expect(planAiDefense(c.ai,c)).toContainEqual({ kind: 'release', unitId: unit.id });
    for (const intent of planAiDefense(c.ai,c)) executeAiDefenseIntent(c.ai,c,intent);
    expect(unit.order).toBeNull();
    c.world.setPosition(unit.id,position);
    for (const intent of planAiDefense(c.ai,c)) executeAiDefenseIntent(c.ai,c,intent);
    c.ai.state = 'scout';
    for (const intent of planAiDefense(c.ai,c)) executeAiDefenseIntent(c.ai,c,intent);
    expect(unit.order).toBeNull();
  });

  it('blocks hidden AI acquisition, retaliation and Attack-Move engagement', () => {
    const c = setup();
    const position = c.grid.tileCenter(30, 30);
    const defender = c.world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position });
    const enemy = c.world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position });
    const predicate = fogTargetPredicate(c.fog);
    expect(stepAutomaticTargeting(c.world, createAutoTargetingState(), 1, undefined, predicate)).toEqual([]);
    expect(issueRetaliationOrders(c.world, [{ kind: 'hit', attackerId: enemy.id, targetId: defender.id, damage: 1, destroyed: false }], predicate)).toEqual([]);
    issueAttackMoveOrders(c.world, c.grid, 'ai', [defender.id], c.grid.tileCenter(32,30));
    stepAutomaticTargeting(c.world, createAutoTargetingState(), 1, undefined, predicate);
    expect(defender.order).toMatchObject({ kind: 'AttackMove', engagement: null });
    expect(stepAttackMoveOrders(c.world, c.grid, 0.25, predicate)).toEqual([]);
  });

  it('stops strategy after HQ loss without an HQ rebuild', () => {
    const c = setup();
    c.world.damage(c.world.buildings('ai')[0]!.id, 100000);
    stepAi(c.ai, observeAiStrategy(c.ai, c.world, c.grid, c.fog), 1);
    expect(c.ai.state).toBe('recover');
    expect(planAiEconomy(c.ai, c).intent).toBeNull();
    expect(planAiMilitary(c.ai, c)).toEqual([]);
    expect(planAiDefense(c.ai, c)).toEqual([]);
  });

  it.each(['credits', 'worker', 'site'] as const)('recovery retries safely without %s', (missing) => {
    const c = setup(); c.ai.state = 'recover';
    executeAiEconomyIntent(c, planAiEconomy(c.ai, c).intent!);
    if (missing === 'credits') c.economy.spend('ai', c.economy.balance('ai'));
    if (missing === 'worker') for (const w of c.world.units('ai')) c.world.remove(w.id);
    const before = JSON.stringify([c.world.units(), c.world.buildings(), c.economy.balance('ai')]);
    expect(planAiEconomy(c.ai, c, missing === 'site' ? { ...AI_CONFIG, placementRadiusTiles: 0 } : AI_CONFIG).intent).toBeNull();
    expect(JSON.stringify([c.world.units(), c.world.buildings(), c.economy.balance('ai')])).toBe(before);
  });

  it('rebuilds destroyed infrastructure deterministically with normal income, paid timed sites, and recovery restore', () => {
    function simulate(reload: boolean) {
      let c = setup();
      let spent = 0;
      const initial = c.economy.balance('ai');
      const resources = () => c.grid.resourceFields.reduce((n,f) => n+c.resourceFieldState.remaining(f.id),0);
      const initialResources = resources();
      const tick = () => {
        stepGather(c.world,c.grid,c.resourceFieldState,c.economy,0.25);
        stepConstruction(c.world,0.25);
        const before = c.world.buildings('ai').length;
        const balance = c.economy.balance('ai');
        executeAiEconomyDecisions(c.ai,stepAi(c.ai,observeAiStrategy(c.ai,c.world,c.grid,c.fog),0.25),c);
        if (c.world.buildings('ai').length > before) {
          const site = c.world.buildings('ai').at(-1)!;
          expect(site.constructionProgress).toBe(0);
          expect(balance-c.economy.balance('ai')).toBe(BUILDING_CONFIG[site.type].cost);
          spent += site.stats.cost;
        }
        expect(c.world.buildings('ai').filter((b) => b.status === 'constructing')).toHaveLength(c.world.buildings('ai').some((b) => b.status === 'constructing') ? 1 : 0);
      };
      for (let i=0;i<2400 && c.ai.buildOrderIndex<4;i++) tick();
      expect(c.ai.buildOrderIndex).toBe(4);
      for (const b of c.world.buildings('ai')) if (b.type !== 'hq') { c.world.damage(b.id,100000); c.world.remove(b.id); }
      const rebuilt: string[] = [];
      let gathering = false;
      let restored = false;
      for (let i=0;i<4800;i++) {
        tick();
        if (i===3) { expect(c.ai.state).toBe('recover'); expect(c.ai.buildOrderIndex).toBe(0); }
        if (c.ai.state === 'recover') {
          expect(planAiMilitary(c.ai,c)).toEqual([]);
          gathering ||= c.world.units('ai').some((u) => u.order?.kind === 'Gather');
          if (reload && !restored && c.world.buildings('ai').some((b) => b.status === 'constructing' && b.constructionProgress>0)) {
            const snapshot = serializeWorld(c.world,[],c.economy,c.resourceFieldState,c.fog,c.grid,c.ai);
            c = { ...c, ...restoreWorld(JSON.parse(JSON.stringify(snapshot)),c.grid) };
            expect(c.ai.state).toBe('recover'); restored = true;
          }
        }
        for (const b of c.world.buildings('ai')) if (b.type !== 'hq' && isCompleted(b) && !rebuilt.includes(b.type)) rebuilt.push(b.type);
        if (rebuilt.length===4 && c.ai.state!=='recover') break;
        if (rebuilt.length<4 && i>=3) expect(c.ai.state).toBe('recover');
      }
      expect(rebuilt).toEqual(AI_CONFIG.recoveryBuildOrder);
      expect(gathering).toBe(true);
      expect(c.ai.state).not.toBe('recover');
      expect(restored).toBe(reload);
      expect(c.economy.balance('ai')+spent+c.world.units('ai').reduce((n,u)=>n+u.carriedCredits,0)).toBe(initial+initialResources-resources());
      return { rebuilt, balance: c.economy.balance('ai'), buildings: c.world.buildings('ai').map((b) => ({ type: b.type, topLeft: b.topLeft, progress: b.constructionProgress })) };
    }
    expect(simulate(true)).toEqual(simulate(false));
  });
});
