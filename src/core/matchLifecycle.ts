/**
 * Renderer-independent match result, clock and statistics.
 *
 * Destruction events are recorded before callers remove their targets. The caller then supplies
 * post-removal building counts, making simultaneous final-building loss deterministic.
 */
import { MATCH_CONFIG } from '../config/match';
import { isAlive, type ReadonlyEntity } from './entities';
import type { EntityId, PlayerId, UnitTypeId } from './ids';

export type MatchResult = 'victory' | 'defeat' | 'draw' | null;

export interface OwnerCounts {
  readonly player: number;
  readonly ai: number;
}

export interface MatchLifecycleSnapshot {
  readonly result: MatchResult;
  readonly elapsedActiveSeconds: number;
  readonly unitsProduced: OwnerCounts;
  readonly unitsLost: OwnerCounts;
}

export interface MatchLifecycleState {
  result: MatchResult;
  elapsedActiveSeconds: number;
  unitsProduced: { player: number; ai: number };
  unitsLost: { player: number; ai: number };
}

interface EventBookkeeping {
  readonly producedUnitIds: Set<EntityId>;
  readonly lostUnitIds: Set<EntityId>;
}

/**
 * Event ids are session-local deduplication, not durable match facts. They are intentionally kept
 * outside the serializable state: completed queue rows and destroyed entities are absent after a
 * save, so those events cannot recur, while restored worlds are free to remap entity ids.
 */
const eventBookkeeping = new WeakMap<MatchLifecycleState, EventBookkeeping>();

/** A successful spawn reported by the normal production system. Opening units never emit this. */
export interface UnitProducedEvent {
  readonly kind: 'unit-produced';
  readonly unitId: EntityId;
  readonly producerId: EntityId;
  readonly owner: PlayerId;
  readonly unitType: UnitTypeId;
}

/** Metadata captured from a confirmed killing hit before its target is removed from the world. */
export interface CombatDestructionEvent {
  readonly targetId: EntityId;
  readonly owner: PlayerId;
  readonly entityKind: 'unit' | 'building';
  readonly entityType: string;
}

export function createMatchLifecycle(): MatchLifecycleState {
  return {
    result: null,
    elapsedActiveSeconds: 0,
    unitsProduced: { player: 0, ai: 0 },
    unitsLost: { player: 0, ai: 0 },
  };
}

/** Advances only live, unpaused simulation time. Invalid deltas are ignored like other core steps. */
export function stepMatchElapsedTime(
  state: MatchLifecycleState,
  deltaSeconds: number,
  paused = false,
  durationSeconds = MATCH_CONFIG.matchDurationSeconds,
): number {
  if (
    paused || state.result !== null || !Number.isFinite(deltaSeconds) || deltaSeconds < 0 ||
    !Number.isFinite(durationSeconds) || durationSeconds < 0
  ) return 0;
  const advancedSeconds = Math.min(deltaSeconds, Math.max(0, durationSeconds - state.elapsedActiveSeconds));
  state.elapsedActiveSeconds += advancedSeconds;
  return advancedSeconds;
}

/** Counts only successful normal production spawns, once per event in the submitted batch. */
export function recordProducedUnits(
  state: MatchLifecycleState,
  events: readonly UnitProducedEvent[],
): void {
  if (state.result !== null) return;
  const seen = bookkeepingFor(state).producedUnitIds;
  for (const event of events) {
    if (seen.has(event.unitId)) continue;
    seen.add(event.unitId);
    state.unitsProduced[event.owner] += 1;
  }
}

/**
 * Counts confirmed unit losses. Buildings never affect loss counters. Duplicate target ids are
 * ignored. Terminal resolution happens separately, after the destroyed buildings leave the world.
 */
export function recordCombatDestructions(
  state: MatchLifecycleState,
  events: readonly CombatDestructionEvent[],
): MatchResult {
  if (state.result !== null) return state.result;

  const seen = bookkeepingFor(state).lostUnitIds;
  for (const event of events) {
    if (seen.has(event.targetId)) continue;
    seen.add(event.targetId);
    if (event.entityKind === 'unit') {
      state.unitsLost[event.owner] += 1;
    }
  }
  return state.result;
}

/**
 * Resolves a simulation step after confirmed deaths were removed. Player elimination is checked
 * first, so simultaneous final-building loss is Defeat. The deadline is checked last, ensuring a
 * final enemy-building kill exactly at the time limit is Victory rather than Draw.
 */
export function resolveMatchOutcome(
  state: MatchLifecycleState,
  aliveBuildings: OwnerCounts,
  durationSeconds = MATCH_CONFIG.matchDurationSeconds,
): MatchResult {
  if (state.result !== null) return state.result;
  if (aliveBuildings.player === 0) state.result = 'defeat';
  else if (aliveBuildings.ai === 0) state.result = 'victory';
  else if (state.elapsedActiveSeconds >= durationSeconds) state.result = 'draw';
  return state.result;
}

/** Counts every alive owned structure, including incomplete construction sites. */
export function countAliveBuildings(entities: readonly ReadonlyEntity[]): OwnerCounts {
  const counts = { player: 0, ai: 0 };
  for (const entity of entities) {
    if (entity.kind === 'building' && isAlive(entity)) counts[entity.owner] += 1;
  }
  return counts;
}

/** Formats remaining active time with ceiling semantics so a partial second stays readable. */
export function formatMatchCountdown(
  elapsedActiveSeconds: number,
  durationSeconds = MATCH_CONFIG.matchDurationSeconds,
): string {
  const remainingSeconds = Math.ceil(Math.max(0, durationSeconds - elapsedActiveSeconds));
  const minutes = Math.floor(remainingSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
}

export function serializeMatchLifecycle(state: MatchLifecycleState): MatchLifecycleSnapshot {
  return {
    result: state.result,
    elapsedActiveSeconds: state.elapsedActiveSeconds,
    unitsProduced: { ...state.unitsProduced },
    unitsLost: { ...state.unitsLost },
  };
}

// eslint-disable-next-line complexity -- Snapshot validation checks each independently persisted lifecycle field.
export function isMatchLifecycleSnapshot(value: unknown): value is MatchLifecycleSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonNegativeFinite(candidate.elapsedActiveSeconds)) return false;
  const elapsedActiveSeconds = candidate.elapsedActiveSeconds;
  const resultIsValid = candidate.result === null || candidate.result === 'victory' ||
    candidate.result === 'defeat' || candidate.result === 'draw';
  return (
    resultIsValid &&
    elapsedActiveSeconds <= MATCH_CONFIG.matchDurationSeconds &&
    (candidate.result !== null || elapsedActiveSeconds < MATCH_CONFIG.matchDurationSeconds) &&
    (candidate.result !== 'draw' || elapsedActiveSeconds === MATCH_CONFIG.matchDurationSeconds) &&
    isOwnerCounts(candidate.unitsProduced) &&
    isOwnerCounts(candidate.unitsLost)
  );
}

export function restoreMatchLifecycle(snapshot: MatchLifecycleSnapshot): MatchLifecycleState {
  if (!isMatchLifecycleSnapshot(snapshot)) {
    throw new Error('Match lifecycle snapshot has an invalid shape');
  }
  return {
    result: snapshot.result,
    elapsedActiveSeconds: snapshot.elapsedActiveSeconds,
    unitsProduced: { ...snapshot.unitsProduced },
    unitsLost: { ...snapshot.unitsLost },
  };
}

function isOwnerCounts(value: unknown): value is OwnerCounts {
  if (typeof value !== 'object' || value === null) return false;
  const counts = value as Record<string, unknown>;
  return isNonNegativeInteger(counts.player) && isNonNegativeInteger(counts.ai);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value);
}

function bookkeepingFor(state: MatchLifecycleState): EventBookkeeping {
  const existing = eventBookkeeping.get(state);
  if (existing !== undefined) return existing;
  const created = { producedUnitIds: new Set<EntityId>(), lostUnitIds: new Set<EntityId>() };
  eventBookkeeping.set(state, created);
  return created;
}
