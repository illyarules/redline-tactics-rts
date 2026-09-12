/** Converts confirmed core hits into the deliberately small, renderer-safe payload the VFX owns. */
import type { AttackHitEvent } from '../core/attack';
import { isAlive, type ReadonlyEntity } from '../core/entities';
import type { AttackerTypeId } from '../config/types';

export interface CombatEffectPoint {
  readonly x: number;
  readonly y: number;
}

export interface CombatHitEffectEvent {
  readonly kind: 'combat-hit';
  readonly weapon: AttackerTypeId;
  readonly from: CombatEffectPoint;
  readonly to: CombatEffectPoint;
  readonly targetKind: 'unit' | 'building';
  /** Opaque render token used only to stop a prior target flash when this entity dies. */
  readonly targetToken: string;
  /** Diameter for an enclosing, transient target flash; never used for gameplay collision. */
  readonly targetSizeTiles: number;
  /** A killing hit may still show an impact, but never asks a removed target to keep flashing. */
  readonly targetDestroyed: boolean;
}

export interface CombatDeathEffectEvent {
  readonly kind: 'combat-death';
  readonly at: CombatEffectPoint;
  readonly targetToken: string;
}

export type CombatEffectEvent = CombatHitEffectEvent | CombatDeathEffectEvent;

/**
 * Returns `null` unless this is the exact pair that the gameplay layer just confirmed as a hit.
 * The VFX receives no mutable entity objects, combat values, or target-selection data. Its opaque
 * token is used solely to retire a pre-existing target flash on death.
 */
// eslint-disable-next-line complexity -- VFX mapping exhaustively guards the gameplay event contract before rendering.
export function mapAttackHitToCombatEffect(
  hit: AttackHitEvent,
  attacker: ReadonlyEntity | undefined,
  target: ReadonlyEntity | undefined,
): CombatHitEffectEvent | null {
  if (
    hit.kind !== 'hit' ||
    !Number.isFinite(hit.damage) || hit.damage <= 0 ||
    attacker === undefined || target === undefined ||
    attacker.kind !== 'unit' || attacker.type === 'worker' || !isAlive(attacker) ||
    // A target can be destroyed only by the confirmed killing hit represented by this event.
    (!isAlive(target) && !hit.destroyed) ||
    !isFinitePoint(attacker.position) || !isFinitePoint(target.position)
  ) return null;

  const targetSizeTiles = target.kind === 'building'
    ? Math.max(target.footprint.width, target.footprint.height)
    : target.stats.bodySizeTiles;
  if (!Number.isFinite(targetSizeTiles) || targetSizeTiles <= 0) return null;

  return {
    kind: 'combat-hit',
    weapon: attacker.type,
    from: { x: attacker.position.x, y: attacker.position.y },
    to: { x: target.position.x, y: target.position.y },
    targetKind: target.kind,
    targetToken: target.id,
    targetSizeTiles,
    targetDestroyed: hit.destroyed,
  };
}

export function deathEffectAt(at: CombatEffectPoint, targetToken: string): CombatDeathEffectEvent | null {
  return isFinitePoint(at) && targetToken.length > 0
    ? { kind: 'combat-death', at: { x: at.x, y: at.y }, targetToken }
    : null;
}

function isFinitePoint(point: CombatEffectPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
