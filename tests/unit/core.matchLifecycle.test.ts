import { describe, expect, it } from 'vitest';
import { MATCH_CONFIG } from '../../src/config/match';
import {
  createMatchLifecycle,
  countAliveBuildings,
  formatMatchCountdown,
  isMatchLifecycleSnapshot,
  recordCombatDestructions,
  recordProducedUnits,
  resolveMatchOutcome,
  restoreMatchLifecycle,
  serializeMatchLifecycle,
  stepMatchElapsedTime,
} from '../../src/core/matchLifecycle';
import { createWorld } from '../../src/core/world';

describe('match lifecycle', () => {
  it('starts active with zero elapsed time and statistics', () => {
    expect(createMatchLifecycle()).toEqual({
      result: null,
      elapsedActiveSeconds: 0,
      unitsProduced: { player: 0, ai: 0 },
      unitsLost: { player: 0, ai: 0 },
    });
  });

  it('counts active time only and freezes while paused or terminal', () => {
    const state = createMatchLifecycle();
    expect(stepMatchElapsedTime(state, 1.25)).toBe(1.25);
    expect(stepMatchElapsedTime(state, 5, true)).toBe(0);
    expect(state.elapsedActiveSeconds).toBe(1.25);
    state.result = 'draw';
    expect(stepMatchElapsedTime(state, 3)).toBe(0);
    expect(state.elapsedActiveSeconds).toBe(1.25);
  });

  it('counts successful production for the correct owner once per spawned unit', () => {
    const state = createMatchLifecycle();
    const event = {
      kind: 'unit-produced' as const, unitId: 'unit-1', producerId: 'factory-1',
      owner: 'player' as const, unitType: 'tank' as const,
    };
    recordProducedUnits(state, [event, event, { ...event, unitId: 'unit-2', owner: 'ai' }]);
    recordProducedUnits(state, [event]);
    expect(state.unitsProduced).toEqual({ player: 1, ai: 1 });
  });

  it('counts confirmed unit losses once and ignores building destruction', () => {
    const state = createMatchLifecycle();
    const unitLoss = {
      targetId: 'unit-1', owner: 'player' as const, entityKind: 'unit' as const, entityType: 'infantry',
    };
    recordCombatDestructions(state, [unitLoss, unitLoss, {
      targetId: 'barracks-1', owner: 'ai', entityKind: 'building', entityType: 'barracks',
    }]);
    recordCombatDestructions(state, [unitLoss]);
    expect(state.unitsLost).toEqual({ player: 1, ai: 0 });
  });

  it('does not count canceled construction or ordinary removals without a combat event', () => {
    const state = createMatchLifecycle();
    expect(state.unitsProduced).toEqual({ player: 0, ai: 0 });
    expect(state.unitsLost).toEqual({ player: 0, ai: 0 });
  });

  it('does not end when an AI HQ or player HQ falls but another owned building survives', () => {
    const afterAiHqLoss = createMatchLifecycle();
    recordCombatDestructions(afterAiHqLoss, [{
      targetId: 'ai-hq', owner: 'ai', entityKind: 'building', entityType: 'hq',
    }]);
    expect(resolveMatchOutcome(afterAiHqLoss, { player: 1, ai: 1 })).toBeNull();

    const afterPlayerHqLoss = createMatchLifecycle();
    recordCombatDestructions(afterPlayerHqLoss, [{
      targetId: 'player-hq', owner: 'player', entityKind: 'building', entityType: 'hq',
    }]);
    expect(resolveMatchOutcome(afterPlayerHqLoss, { player: 1, ai: 1 })).toBeNull();
  });

  it('resolves final AI building loss as Victory and final player building loss as Defeat', () => {
    const victory = createMatchLifecycle();
    expect(resolveMatchOutcome(victory, { player: 1, ai: 0 })).toBe('victory');
    const defeat = createMatchLifecycle();
    expect(resolveMatchOutcome(defeat, { player: 0, ai: 1 })).toBe('defeat');
  });

  it('counts an incomplete building as surviving and units alone do not prevent defeat', () => {
    const world = createWorld({ tileSizePixels: 30 });
    const incomplete = world.createBuilding({
      type: 'barracks', owner: 'player', faction: 'meridian', topLeft: { tx: 2, ty: 2 },
      status: 'constructing', constructionProgress: 0.25,
    });
    world.createBuilding({
      type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 20, ty: 20 },
    });
    world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { x: 300, y: 300 },
    });
    const incompleteBuildingStillAlive = createMatchLifecycle();
    expect(resolveMatchOutcome(incompleteBuildingStillAlive, countAliveBuildings(world.entities()))).toBeNull();

    world.remove(incomplete.id);
    const unitsButNoBuildings = createMatchLifecycle();
    expect(resolveMatchOutcome(unitsButNoBuildings, countAliveBuildings(world.entities()))).toBe('defeat');
  });

  it('gives Defeat precedence when both sides lose their final building in one step', () => {
    const state = createMatchLifecycle();
    expect(resolveMatchOutcome(state, { player: 0, ai: 0 })).toBe('defeat');
  });

  it('remains active at 599.999 seconds and draws at 600 without elimination', () => {
    const state = createMatchLifecycle();
    stepMatchElapsedTime(state, 599.999);
    expect(resolveMatchOutcome(state, { player: 1, ai: 1 })).toBeNull();
    expect(stepMatchElapsedTime(state, 1)).toBeCloseTo(0.001);
    expect(state.elapsedActiveSeconds).toBe(600);
    expect(resolveMatchOutcome(state, { player: 1, ai: 1 })).toBe('draw');
  });

  it('gives final-building elimination priority over Draw at exactly 600 seconds', () => {
    const state = createMatchLifecycle();
    stepMatchElapsedTime(state, MATCH_CONFIG.matchDurationSeconds);
    expect(resolveMatchOutcome(state, { player: 1, ai: 0 })).toBe('victory');
  });

  it('formats countdown boundaries deterministically', () => {
    expect(formatMatchCountdown(0)).toBe('10:00');
    expect(formatMatchCountdown(1)).toBe('09:59');
    expect(formatMatchCountdown(540)).toBe('01:00');
    expect(formatMatchCountdown(600)).toBe('00:00');
  });

  it('is terminally idempotent and never overwrites an established result', () => {
    const state = createMatchLifecycle();
    resolveMatchOutcome(state, { player: 1, ai: 0 });
    resolveMatchOutcome(state, { player: 0, ai: 1 });
    recordCombatDestructions(state, [{
      targetId: 'player-unit', owner: 'player', entityKind: 'unit', entityType: 'worker',
    }]);
    expect(state.result).toBe('victory');
    expect(state.unitsLost.player).toBe(0);
  });

  it('round-trips active state and a 600-second Draw', () => {
    const active = createMatchLifecycle();
    stepMatchElapsedTime(active, 12.5);
    recordProducedUnits(active, [{
      kind: 'unit-produced', unitId: 'u1', producerId: 'b1', owner: 'ai', unitType: 'worker',
    }]);
    expect(restoreMatchLifecycle(serializeMatchLifecycle(active))).toEqual(active);

    stepMatchElapsedTime(active, 600);
    resolveMatchOutcome(active, { player: 1, ai: 1 });
    expect(active.result).toBe('draw');
    expect(restoreMatchLifecycle(serializeMatchLifecycle(active))).toEqual(active);
  });

  it('rejects malformed lifecycle snapshot data', () => {
    expect(isMatchLifecycleSnapshot({
      result: 'stalemate', elapsedActiveSeconds: 1,
      unitsProduced: { player: 0, ai: 0 }, unitsLost: { player: 0, ai: 0 },
    })).toBe(false);
    expect(isMatchLifecycleSnapshot({
      result: null, elapsedActiveSeconds: -1,
      unitsProduced: { player: 0, ai: 0 }, unitsLost: { player: 0, ai: 0 },
    })).toBe(false);
    expect(isMatchLifecycleSnapshot({
      result: null, elapsedActiveSeconds: 601,
      unitsProduced: { player: 0, ai: 0 }, unitsLost: { player: 0, ai: 0 },
    })).toBe(false);
    expect(isMatchLifecycleSnapshot({
      result: 'draw', elapsedActiveSeconds: 599,
      unitsProduced: { player: 0, ai: 0 }, unitsLost: { player: 0, ai: 0 },
    })).toBe(false);
  });
});
