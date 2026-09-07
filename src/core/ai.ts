/**
 * Deterministic, renderer-independent AI state machine.
 *
 * This module deliberately decides strategy but performs no gameplay mutation yet. Future tasks
 * can consume its typed decision hook through the same economy, construction, production and order
 * APIs the human uses; this shell never creates resources, units or orders on its own.
 */
import { AI_CONFIG } from '../config/ai';
import type { AiConfig } from '../config/types';
import { isAlive } from './entities';
import { isEntityVisibleToPlayer, type FogState } from './fog';
import type { BuildingTypeId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isCompleted } from './prerequisites';
import { isProductionActive } from './power';
import type { World } from './world';

export const AI_STATE_IDS = ['develop', 'produce', 'scout', 'attack', 'defend', 'recover'] as const;
export type AiStateId = (typeof AI_STATE_IDS)[number];

/** Absorbs harmless binary floating-point residue at an otherwise exact simulation boundary. */
const TIME_EPSILON_SECONDS = 1e-9;

export interface AiTransition {
  readonly from: AiStateId;
  readonly to: AiStateId;
}

/** JSON-safe state saved with the rest of a local match. */
export interface AiSnapshot {
  readonly state: AiStateId;
  /** Time left before the next strategic evaluation. Always in (0, decisionIntervalSeconds]. */
  readonly decisionRemainingSeconds: number;
  readonly lastTransition: AiTransition | null;
}

/** Mutable match state; its shape remains serializable for persistence. */
export interface AiState extends AiSnapshot {
  state: AiStateId;
  decisionRemainingSeconds: number;
  lastTransition: AiTransition | null;
}

/** Minimal facts the state machine is allowed to use. Tests can supply these without a World. */
export interface AiObservation {
  readonly hasOperationalProduction: boolean;
  readonly combatUnitCount: number;
  readonly playerBaseKnown: boolean;
  readonly baseUnderThreat: boolean;
  readonly essentialInfrastructureIntact: boolean;
  readonly minimumViableBase: boolean;
}

/** A deliberately inert extension point until Tasks 26–28 execute actual normal-gameplay actions. */
export interface AiNoopIntent {
  readonly kind: 'none';
  readonly state: AiStateId;
}

export interface AiStepResult {
  /** Number of low-frequency evaluations completed, including every interval in a long simulation step. */
  readonly evaluations: number;
  readonly transition: AiTransition | null;
  readonly intents: readonly AiNoopIntent[];
}

export function createAiState(config: AiConfig = AI_CONFIG): AiState {
  assertAiConfig(config);
  return { state: 'develop', decisionRemainingSeconds: config.decisionIntervalSeconds, lastTransition: null };
}

export function serializeAiState(ai: AiState): AiSnapshot {
  return {
    state: ai.state,
    decisionRemainingSeconds: ai.decisionRemainingSeconds,
    lastTransition: ai.lastTransition === null ? null : { ...ai.lastTransition },
  };
}

/** Validates a persisted AI shell without creating mutable state or silently repairing bad saves. */
export function isAiSnapshotShape(raw: unknown): raw is AiSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const candidate = raw as Record<string, unknown>;
  return (
    isAiStateId(candidate.state) &&
    typeof candidate.decisionRemainingSeconds === 'number' &&
    (candidate.lastTransition === null || isAiTransitionShape(candidate.lastTransition))
  );
}

export function restoreAiState(snapshot: AiSnapshot, config: AiConfig = AI_CONFIG): AiState {
  assertAiConfig(config);
  if (!isAiSnapshotShape(snapshot)) throw new Error('AI snapshot has an invalid shape');
  if (
    !Number.isFinite(snapshot.decisionRemainingSeconds) ||
    snapshot.decisionRemainingSeconds <= 0 ||
    snapshot.decisionRemainingSeconds > config.decisionIntervalSeconds
  ) {
    throw new Error('AI snapshot has an invalid decision remainder');
  }
  return {
    state: snapshot.state,
    decisionRemainingSeconds: snapshot.decisionRemainingSeconds,
    lastTransition: snapshot.lastTransition === null ? null : { ...snapshot.lastTransition },
  };
}

/**
 * Advances only at whole configured intervals. A large delta walks every decision boundary in
 * order, rather than collapsing them into one state jump, so the result remains deterministic.
 */
export function stepAi(
  ai: AiState,
  observation: AiObservation,
  deltaSeconds: number,
  config: AiConfig = AI_CONFIG,
): AiStepResult {
  assertAiConfig(config);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return { evaluations: 0, transition: null, intents: [] };
  }

  let remainingDelta = deltaSeconds;
  let evaluations = 0;
  let latestTransition: AiTransition | null = null;
  const intents: AiNoopIntent[] = [];

  while (remainingDelta + TIME_EPSILON_SECONDS >= ai.decisionRemainingSeconds) {
    remainingDelta -= ai.decisionRemainingSeconds;
    if (remainingDelta < TIME_EPSILON_SECONDS) remainingDelta = 0;
    ai.decisionRemainingSeconds = config.decisionIntervalSeconds;
    const transition = evaluateAiState(ai, observation, config);
    if (transition !== null) latestTransition = transition;
    evaluations++;
    intents.push({ kind: 'none', state: ai.state });
  }
  ai.decisionRemainingSeconds -= remainingDelta;
  return { evaluations, transition: latestTransition, intents };
}

/** One explicit strategic transition, with recovery and defense conditions deliberately prioritized. */
export function evaluateAiState(
  ai: AiState,
  observation: AiObservation,
  config: AiConfig = AI_CONFIG,
): AiTransition | null {
  const next = nextAiState(ai.state, observation, config);
  if (next === ai.state) return null;
  const transition = { from: ai.state, to: next };
  ai.state = next;
  ai.lastTransition = transition;
  return transition;
}

export function nextAiState(
  state: AiStateId,
  observation: AiObservation,
  config: AiConfig = AI_CONFIG,
): AiStateId {
  // Essential infrastructure loss overrides every strategic state, including active defense.
  if (!observation.essentialInfrastructureIntact) return 'recover';

  switch (state) {
    case 'develop':
      return observation.hasOperationalProduction ? 'produce' : 'develop';
    case 'produce':
      return observation.combatUnitCount > 0 ? 'scout' : 'produce';
    case 'scout':
      if (observation.baseUnderThreat) return 'defend';
      return observation.playerBaseKnown && observation.combatUnitCount >= config.minimumAttackArmyUnits
        ? 'attack'
        : 'produce';
    case 'attack':
      // Defense wins over continuing an attack whenever both predicates are true.
      if (observation.baseUnderThreat) return 'defend';
      return observation.combatUnitCount <= config.criticalArmyUnits ? 'recover' : 'attack';
    case 'defend':
      if (observation.baseUnderThreat) return 'defend';
      return observation.combatUnitCount > 0 ? 'scout' : 'produce';
    case 'recover':
      return observation.minimumViableBase ? 'develop' : 'recover';
  }
}

/** Derives the shell's simple, visible-world predicates without leaking renderer state into core. */
export function observeAiWorld(
  world: World,
  grid: MapGrid,
  fog: FogState,
  config: AiConfig = AI_CONFIG,
  aiPlayer: PlayerId = 'ai',
  opponent: PlayerId = 'player',
): AiObservation {
  assertAiConfig(config);
  const completedTypes = (types: readonly BuildingTypeId[]): boolean =>
    types.every((type) => world.buildings(aiPlayer).some((building) => building.type === type && isCompleted(building)));
  const hq = world.buildings(aiPlayer).find((building) => building.type === 'hq' && isCompleted(building));
  const combatUnitCount = world.units(aiPlayer).filter((unit) => isAlive(unit) && unit.stats.attack !== null).length;
  const playerBaseKnown = world
    .buildings(opponent)
    .some((building) => building.type === 'hq' && isEntityVisibleToPlayer(fog, aiPlayer, building));
  const hasOperationalProduction = world.buildings(aiPlayer).some(
    (building) =>
      isCompleted(building) &&
      building.stats.produces.length > 0 &&
      isProductionActive(world, aiPlayer, building.stats.requiresPower),
  );
  const radiusWorld = config.baseThreatRadiusTiles * grid.tileSizePixels;
  const baseUnderThreat = hq !== undefined && world.units(opponent).some(
    (unit) =>
      isAlive(unit) &&
      unit.stats.attack !== null &&
      isEntityVisibleToPlayer(fog, aiPlayer, unit) &&
      Math.hypot(unit.position.x - hq.position.x, unit.position.y - hq.position.y) <= radiusWorld,
  );
  return {
    hasOperationalProduction,
    combatUnitCount,
    playerBaseKnown,
    baseUnderThreat,
    essentialInfrastructureIntact: completedTypes(config.essentialBuildingTypes),
    minimumViableBase: completedTypes(config.minimumViableBuildingTypes),
  };
}

function isAiStateId(value: unknown): value is AiStateId {
  return typeof value === 'string' && (AI_STATE_IDS as readonly string[]).includes(value);
}

function isAiTransitionShape(value: unknown): value is AiTransition {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isAiStateId(candidate.from) && isAiStateId(candidate.to);
}

function assertAiConfig(config: AiConfig): void {
  if (!Number.isFinite(config.decisionIntervalSeconds) || config.decisionIntervalSeconds <= 0) {
    throw new Error(`AI decision interval must be positive and finite, got ${config.decisionIntervalSeconds}`);
  }
  if (!Number.isInteger(config.minimumAttackArmyUnits) || config.minimumAttackArmyUnits < 1) {
    throw new Error('AI minimum attack army must be a positive integer');
  }
  if (!Number.isInteger(config.criticalArmyUnits) || config.criticalArmyUnits < 0) {
    throw new Error('AI critical army threshold must be a non-negative integer');
  }
  if (config.criticalArmyUnits >= config.minimumAttackArmyUnits) {
    throw new Error('AI critical army threshold must be below its attack threshold');
  }
  if (!Number.isFinite(config.baseThreatRadiusTiles) || config.baseThreatRadiusTiles < 0) {
    throw new Error('AI threat radius must be non-negative and finite');
  }
  if (config.essentialBuildingTypes.length === 0 || config.minimumViableBuildingTypes.length === 0) {
    throw new Error('AI infrastructure thresholds need at least one building type');
  }
}
