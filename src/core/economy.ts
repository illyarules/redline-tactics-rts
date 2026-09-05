/**
 * Credits accounts and transactions — the single resource.
 *
 * An account never goes negative: `spend` either finds the full amount or leaves the balance
 * untouched and reports failure, so a caller never has to unwind a partial charge.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { ECONOMY_CONFIG } from '../config/economy';
import type { EconomyConfig } from '../config/types';
import { PLAYER_IDS, type PlayerId } from './ids';

export interface Economy {
  balance(player: PlayerId): number;
  canAfford(player: PlayerId, amount: number): boolean;
  /** Deducts `amount` and reports success, or leaves the balance untouched and reports failure. */
  spend(player: PlayerId, amount: number): boolean;
  earn(player: PlayerId, amount: number): void;
  /** Credits the configured cancellation refund share of `paidCost` and returns the amount credited. */
  refund(player: PlayerId, paidCost: number): number;
}

/** The persisted shape of an `Economy`: every player's current balance. */
export type EconomySnapshot = Readonly<Record<PlayerId, number>>;

export function createEconomy(
  config: EconomyConfig = ECONOMY_CONFIG,
  initial?: EconomySnapshot,
): Economy {
  const balances = new Map<PlayerId, number>(
    PLAYER_IDS.map((player) => [player, initial?.[player] ?? config.startingCredits]),
  );

  return {
    balance(player) {
      return balances.get(player) ?? 0;
    },

    canAfford(player, amount) {
      assertAmount(amount);
      return (balances.get(player) ?? 0) >= amount;
    },

    spend(player, amount) {
      assertAmount(amount);
      const current = balances.get(player) ?? 0;
      if (current < amount) {
        return false;
      }
      balances.set(player, current - amount);
      return true;
    },

    earn(player, amount) {
      assertAmount(amount);
      balances.set(player, (balances.get(player) ?? 0) + amount);
    },

    refund(player, paidCost) {
      assertAmount(paidCost);
      const amount = refundAmount(paidCost, config.cancelRefundFraction);
      if (amount > 0) {
        balances.set(player, (balances.get(player) ?? 0) + amount);
      }
      return amount;
    },
  };
}

/** Refund share of a paid cost, rounded to the nearest whole Credit. */
export function refundAmount(paidCost: number, fraction: number): number {
  return Math.round(paidCost * fraction);
}

/** Captures every player's current balance. */
export function serializeEconomy(economy: Economy): EconomySnapshot {
  return Object.fromEntries(
    PLAYER_IDS.map((player) => [player, economy.balance(player)]),
  ) as EconomySnapshot;
}

function assertAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Credits amount must be a non-negative number, got ${amount}`);
  }
}
