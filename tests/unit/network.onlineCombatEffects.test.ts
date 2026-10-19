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

  it('accepts every supported attacker type, including the tank and FPV operators', () => {
    const feed = new OnlineCombatEffectFeed();
    const weapons = ['infantry', 'fpvOperators', 'combatBuggy', 'tank', 'rocket'] as const;
    const played = feed.consume('match-1', weapons.map((weapon, index) => ({ ...hit, eventId: `w${index}`, weapon })));
    expect(played.map((event) => event.kind === 'combat-hit' && event.weapon)).toEqual([...weapons]);
    expect(feed.consume('match-2', [{ ...hit, weapon: 'worker' as never }])).toEqual([]);
  });

  it('keeps a valid attacker token and drops a malformed one without losing the hit', () => {
    const feed = new OnlineCombatEffectFeed();
    const [withToken] = feed.consume('match-1', [{ ...hit, attackerToken: 'shooter-1' }]);
    expect(withToken).toMatchObject({ attackerToken: 'shooter-1' });
    const [without] = feed.consume('match-1', [{ ...hit, eventId: 'fx2', attackerToken: 7 as never }]);
    expect(without).toBeDefined();
    expect(without).not.toHaveProperty('attackerToken');
  });

  it('validates the vehicle descriptor of a death and degrades to the plain ring when it is malformed', () => {
    const death: PvpCombatEffect = {
      eventId: 'fx9:death', kind: 'combat-death', at: { x: 5, y: 6 }, targetToken: 't',
      vehicle: { unitType: 'tank', owner: 'ai', facingRadians: 1.5, sizeTiles: 1 },
    };
    const feed = new OnlineCombatEffectFeed();
    expect(feed.consume('m', [death])).toEqual([{
      kind: 'combat-death', at: { x: 5, y: 6 }, targetToken: 't',
      vehicle: { unitType: 'tank', owner: 'ai', facingRadians: 1.5, sizeTiles: 1 },
    }]);

    const bad = (vehicle: unknown, id: string) =>
      feed.consume('m', [{ ...death, eventId: id, vehicle: vehicle as never }])[0];
    for (const [index, vehicle] of [
      { unitType: 'infantry', owner: 'ai', facingRadians: 0, sizeTiles: 1 },
      { unitType: 'tank', owner: 'nobody', facingRadians: 0, sizeTiles: 1 },
      { unitType: 'tank', owner: 'ai', facingRadians: Number.NaN, sizeTiles: 1 },
      { unitType: 'tank', owner: 'ai', facingRadians: 0, sizeTiles: -1 },
      { unitType: 'tank', owner: 'ai', facingRadians: 0, sizeTiles: 1e9 },
      'tank',
    ].entries()) {
      expect(bad(vehicle, `bad${index}`)).toEqual({ kind: 'combat-death', at: { x: 5, y: 6 }, targetToken: 't' });
    }
  });

  it('still accepts an older death payload that has no vehicle descriptor', () => {
    const feed = new OnlineCombatEffectFeed();
    expect(feed.consume('m', [{ eventId: 'old', kind: 'combat-death', at: { x: 1, y: 2 }, targetToken: 't' }]))
      .toEqual([{ kind: 'combat-death', at: { x: 1, y: 2 }, targetToken: 't' }]);
  });
});
