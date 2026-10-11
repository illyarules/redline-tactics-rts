import { describe, expect, it } from 'vitest';
import type { PvpCombatEffect } from '../../src/core/pvp';
import { OnlineCombatEffectFeed } from '../../src/network/onlineCombatEffects';

const hit: PvpCombatEffect = {
  eventId: 'fx1', kind: 'combat-hit', weapon: 'infantry',
  from: { x: 10, y: 20 }, to: { x: 30, y: 40 },
  targetKind: 'unit', targetToken: 'target-1', targetSizeTiles: 0.5, targetDestroyed: false,
};

describe('OnlineCombatEffectFeed', () => {
  it('plays each authoritative event once per match', () => {
    const feed = new OnlineCombatEffectFeed();
    expect(feed.consume('match-1', [hit])).toHaveLength(1);
    expect(feed.consume('match-1', [hit])).toEqual([]);
    expect(feed.consume('match-2', [hit])).toHaveLength(1);
  });

  it('rejects malformed renderer payloads', () => {
    const feed = new OnlineCombatEffectFeed();
    expect(feed.consume('match-1', [{ ...hit, from: { x: Number.NaN, y: 0 } }])).toEqual([]);
  });
});
