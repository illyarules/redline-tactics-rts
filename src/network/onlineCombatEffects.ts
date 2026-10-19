import type { AttackerTypeId } from '../config/types';
import type { PvpCombatEffect } from '../core/pvp';
import { isVehicleEffectType, type CombatDeathEffectEvent, type CombatEffectEvent, type VehicleDeathDescriptor } from '../game/combatEffectEvents';

const WEAPONS = new Set<AttackerTypeId>(['infantry', 'fpvOperators', 'combatBuggy', 'tank', 'rocket']);
const OWNERS: ReadonlySet<string> = new Set(['player', 'ai', 'ai2']);
const MAX_REMEMBERED_EVENTS = 512;
const MAX_VEHICLE_SIZE_TILES = 8;

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

// eslint-disable-next-line complexity -- Every field of an untrusted payload is checked at the trust boundary.
function validEffect(event: PvpCombatEffect): CombatEffectEvent | null {
  if (event.eventId.length === 0 || event.targetToken.length === 0) return null;
  if (event.kind === 'combat-death') {
    if (!finitePoint(event.at)) return null;
    const death: CombatDeathEffectEvent = { kind: event.kind, at: { ...event.at }, targetToken: event.targetToken };
    const vehicle = validVehicle(event.vehicle);
    // A malformed descriptor only costs the wreck: the plain death ring is still safe to show.
    return vehicle === null ? death : { ...death, vehicle };
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
    ...(typeof event.attackerToken === 'string' && event.attackerToken.length > 0
      ? { attackerToken: event.attackerToken }
      : {}),
  };
}

// eslint-disable-next-line complexity -- Every field of an untrusted payload is checked at the trust boundary.
function validVehicle(vehicle: unknown): VehicleDeathDescriptor | null {
  if (typeof vehicle !== 'object' || vehicle === null) return null;
  const { unitType, owner, facingRadians, sizeTiles } = vehicle as Record<string, unknown>;
  if (
    typeof unitType !== 'string' || !isVehicleEffectType(unitType) ||
    typeof owner !== 'string' || !OWNERS.has(owner) ||
    typeof facingRadians !== 'number' || !Number.isFinite(facingRadians) ||
    typeof sizeTiles !== 'number' || !Number.isFinite(sizeTiles) || sizeTiles <= 0 || sizeTiles > MAX_VEHICLE_SIZE_TILES
  ) return null;
  return { unitType, owner: owner as 'player' | 'ai' | 'ai2', facingRadians, sizeTiles };
}

function finitePoint(point: { readonly x: number; readonly y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
