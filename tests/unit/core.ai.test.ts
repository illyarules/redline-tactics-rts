import { describe, expect, it } from 'vitest';
import {
  createAiState,
  evaluateAiState,
  restoreAiState,
  serializeAiState,
  stepAi,
  type AiObservation,
} from '../../src/core/ai';
import { AI_CONFIG } from '../../src/config/ai';

const READY: AiObservation = {
  hasOperationalProduction: true,
  combatUnitCount: 3,
  playerBaseKnown: true,
  baseUnderThreat: false,
  essentialInfrastructureIntact: true,
  minimumViableBase: true,
};

describe('AI state-machine shell', () => {
  it('starts in develop', () => {
    expect(createAiState().state).toBe('develop');
  });

  it('waits for its configured cadence and evaluates exactly at the interval', () => {
    const ai = createAiState();
    expect(stepAi(ai, READY, AI_CONFIG.decisionIntervalSeconds - 0.01)).toMatchObject({ evaluations: 0 });
    expect(ai.state).toBe('develop');
    expect(stepAi(ai, READY, 0.01)).toMatchObject({ evaluations: 1, transition: { from: 'develop', to: 'produce' } });
    expect(ai.state).toBe('produce');
  });

  it('processes each decision boundary in order for a large simulation delta', () => {
    const ai = createAiState();
    const result = stepAi(ai, READY, AI_CONFIG.decisionIntervalSeconds * 3);
    expect(result.evaluations).toBe(3);
    expect(result.intents.map((intent) => intent.state)).toEqual(['produce', 'scout', 'attack']);
    expect(ai.state).toBe('attack');
  });

  it('covers the normal develop, produce, scout and attack path', () => {
    const ai = createAiState();
    expect(evaluateAiState(ai, READY)?.to).toBe('produce');
    expect(evaluateAiState(ai, READY)?.to).toBe('scout');
    expect(evaluateAiState(ai, READY)?.to).toBe('attack');
  });

  it('keeps scouting when its attack threshold is not met', () => {
    const ai = createAiState();
    ai.state = 'scout';
    expect(evaluateAiState(ai, { ...READY, combatUnitCount: AI_CONFIG.minimumAttackArmyUnits - 1 })).toBeNull();
    expect(ai.state).toBe('scout');
  });

  it('prioritizes defend over attack and recover over every state', () => {
    const ai = createAiState();
    ai.state = 'attack';
    expect(evaluateAiState(ai, { ...READY, baseUnderThreat: true })?.to).toBe('defend');
    ai.state = 'attack';
    expect(evaluateAiState(ai, { ...READY, baseUnderThreat: true, essentialInfrastructureIntact: false })?.to).toBe('recover');
  });

  it('recovers when an attack force is critically depleted, and exits defend/recover safely', () => {
    const ai = createAiState();
    ai.state = 'attack';
    expect(evaluateAiState(ai, { ...READY, combatUnitCount: AI_CONFIG.criticalArmyUnits })?.to).toBe('recover');
    ai.state = 'defend';
    expect(evaluateAiState(ai, READY)?.to).toBe('scout');
    ai.state = 'defend';
    expect(evaluateAiState(ai, { ...READY, combatUnitCount: 0 })?.to).toBe('produce');
    ai.state = 'recover';
    expect(evaluateAiState(ai, READY)?.to).toBe('develop');
  });

  it('keeps incomplete recovery active even when another threat appears', () => {
    const ai = createAiState(); ai.state = 'recover';
    expect(evaluateAiState(ai, { ...READY, minimumViableBase: false, baseUnderThreat: true })).toBeNull();
    expect(ai.state).toBe('recover');
  });

  it('serializes and restores the state and exact timer remainder', () => {
    const ai = createAiState();
    stepAi(ai, { ...READY, hasOperationalProduction: false }, 0.35);
    ai.state = 'scout';
    const restored = restoreAiState(serializeAiState(ai));
    expect(restored).toEqual(ai);
    expect(restored.decisionRemainingSeconds).toBeCloseTo(AI_CONFIG.decisionIntervalSeconds - 0.35);
  });
});
