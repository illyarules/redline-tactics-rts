/**
 * How many Credits are left in each resource field, as mutable per-match state.
 *
 * `core/map.ts`'s `MapGrid` is derived once from static config and never changes; the amount a field
 * has actually yielded so far is match state instead, tracked here by field id so a fresh grid load
 * never has to be reconciled with it.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { MapGrid } from './map';

export interface ResourceFieldState {
  /** Credits left in the named field, or 0 for an id the map does not have. */
  remaining(fieldId: string): number;
  isDepleted(fieldId: string): boolean;
  /** Removes up to `amount` Credits from the field and returns how much was actually available. */
  take(fieldId: string, amount: number): number;
}

/** The persisted shape of a `ResourceFieldState`: remaining Credits per field id. */
export type ResourceFieldStateSnapshot = readonly {
  readonly id: string;
  readonly remainingCredits: number;
}[];

export function createResourceFieldState(
  grid: MapGrid,
  initial?: ResourceFieldStateSnapshot,
): ResourceFieldState {
  const remaining = new Map<string, number>(grid.resourceFields.map((field) => [field.id, field.credits]));
  if (initial !== undefined) {
    for (const entry of initial) {
      if (remaining.has(entry.id)) {
        remaining.set(entry.id, clampRemaining(entry.remainingCredits));
      }
    }
  }

  return {
    remaining(fieldId) {
      return remaining.get(fieldId) ?? 0;
    },

    isDepleted(fieldId) {
      return (remaining.get(fieldId) ?? 0) <= 0;
    },

    take(fieldId, amount) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Gather amount must be a non-negative number, got ${amount}`);
      }
      const current = remaining.get(fieldId);
      if (current === undefined) {
        return 0;
      }
      const taken = Math.min(current, amount);
      remaining.set(fieldId, current - taken);
      return taken;
    },
  };
}

export function serializeResourceFieldState(
  state: ResourceFieldState,
  grid: MapGrid,
): ResourceFieldStateSnapshot {
  return grid.resourceFields.map((field) => ({
    id: field.id,
    remainingCredits: state.remaining(field.id),
  }));
}

function clampRemaining(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
