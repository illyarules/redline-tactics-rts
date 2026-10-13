import type { AttackerTypeId } from '../config/types';
import type { PvpCombatEffect } from '../core/pvp';
import type { CombatEffectEvent } from '../game/combatEffectEvents';

const WEAPONS = new Set<AttackerTypeId>(['infantry', 'fpvOperators', 'combatBuggy', 'rocket']);
const MAX_REMEMBERED_EVENTS = 512;

/** Validates and de-duplicates filtered server VFX without deriving combat from entity changes. */
export class OnlineCombatEffectFeed {
  private matchId: string | null = null;
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];

  public consume(matchId: string, events: readonly PvpCombatEffect[]): readonly CombatEffectEvent[] {
    if (this.matchId !== matchId) {
      this.matchId = matchId;
      this.seen.clear();
      this.seenOrder.length = 0;
    }
    const playable: CombatEffectEvent[] = [];
    for (const event of events) {
      if (this.seen.has(event.eventId)) continue;
      const effect = validEffect(event);
      if (effect === null) continue;
      this.remember(event.eventId);
      playable.push(effect);
    }
    return playable;
  }

  private remember(eventId: string): void {
    this.seen.add(eventId);
    this.seenOrder.push(eventId);
    while (this.seenOrder.length > MAX_REMEMBERED_EVENTS) {
      const oldest = this.seenOrder.shift();
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }
}

function validEffect(event: PvpCombatEffect): CombatEffectEvent | null {
  if (event.eventId.length === 0 || event.targetToken.length === 0) return null;
  if (event.kind === 'combat-death') {
    return finitePoint(event.at)
      ? { kind: event.kind, at: { ...event.at }, targetToken: event.targetToken }
      : null;
  }
  if (
    !WEAPONS.has(event.weapon) ||
    !finitePoint(event.from) ||
    !finitePoint(event.to) ||
    !Number.isFinite(event.targetSizeTiles) ||
    event.targetSizeTiles <= 0
  ) return null;
  return {
    kind: event.kind,
    weapon: event.weapon,
    from: { ...event.from },
    to: { ...event.to },
    targetKind: event.targetKind,
    targetToken: event.targetToken,
    targetSizeTiles: event.targetSizeTiles,
    targetDestroyed: event.targetDestroyed,
  };
}

function finitePoint(point: { readonly x: number; readonly y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
