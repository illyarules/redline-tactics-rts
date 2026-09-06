import { describe, expect, it } from 'vitest';
import { createEconomy, refundAmount, serializeEconomy } from '../../src/core/economy';
import type { EconomyConfig } from '../../src/config/types';

const CONFIG: EconomyConfig = { startingCredits: 500, cancelRefundFraction: 0.75 };

describe('createEconomy', () => {
  it('starts every player at the configured balance', () => {
    const economy = createEconomy(CONFIG);
    expect(economy.balance('player')).toBe(500);
    expect(economy.balance('ai')).toBe(500);
  });

  it('affords and spends exactly what is available', () => {
    const economy = createEconomy(CONFIG);
    expect(economy.canAfford('player', 500)).toBe(true);
    expect(economy.canAfford('player', 501)).toBe(false);
    expect(economy.spend('player', 300)).toBe(true);
    expect(economy.balance('player')).toBe(200);
  });

  it('fails spending beyond the balance without mutating it', () => {
    const economy = createEconomy(CONFIG);
    expect(economy.spend('player', 501)).toBe(false);
    expect(economy.balance('player')).toBe(500);
  });

  it('earning adds Credits without touching the other player', () => {
    const economy = createEconomy(CONFIG);
    economy.earn('player', 120);
    expect(economy.balance('player')).toBe(620);
    expect(economy.balance('ai')).toBe(500);
  });

  it('spending never drives a balance negative', () => {
    const economy = createEconomy(CONFIG);
    expect(economy.spend('player', 500)).toBe(true);
    expect(economy.spend('player', 1)).toBe(false);
    expect(economy.balance('player')).toBe(0);
  });

  it('refund credits 75% of a paid cost, rounded to the nearest Credit', () => {
    const economy = createEconomy(CONFIG);
    expect(economy.refund('player', 100)).toBe(75);
    expect(economy.balance('player')).toBe(575);
    // 101 * 0.75 = 75.75, rounds up.
    expect(economy.refund('ai', 101)).toBe(76);
  });

  it('rejects a non-finite or negative amount', () => {
    const economy = createEconomy(CONFIG);
    expect(() => economy.spend('player', Number.NaN)).toThrow();
    expect(() => economy.spend('player', -1)).toThrow();
    expect(() => economy.earn('player', -1)).toThrow();
    expect(() => economy.canAfford('player', -1)).toThrow();
  });

  it('restores balances from a snapshot instead of the configured starting amount', () => {
    const economy = createEconomy(CONFIG, { player: 42, ai: 7 });
    expect(economy.balance('player')).toBe(42);
    expect(economy.balance('ai')).toBe(7);
  });

  it('serializes exactly the current balances', () => {
    const economy = createEconomy(CONFIG);
    economy.spend('player', 100);
    economy.earn('ai', 50);
    expect(serializeEconomy(economy)).toEqual({ player: 400, ai: 550 });
  });
});

describe('refundAmount', () => {
  it('rounds to the nearest whole Credit', () => {
    expect(refundAmount(100, 0.75)).toBe(75);
    expect(refundAmount(101, 0.75)).toBe(76);
    expect(refundAmount(0, 0.75)).toBe(0);
  });
});
