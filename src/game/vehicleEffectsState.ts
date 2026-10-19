/**
 * Pure bookkeeping for vehicle cosmetics: turret angles, dust cadence, barrel recoil, bounded slot
 * reuse and effect timelines. No Babylon here, so every rule is deterministic and unit-testable.
 */
import type { TurretProfile, VehicleDestructionConfig, VehicleWreckConfig } from '../config/types';
import type { EntityId } from '../core/ids';
import type { Order } from '../core/orders';

const FULL_TURN = Math.PI * 2;

/** Wraps an angle into (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = angle - Math.floor((angle + Math.PI) / FULL_TURN) * FULL_TURN;
  return wrapped <= -Math.PI ? Math.PI : wrapped;
}

/** Signed shortest rotation from `from` to `to`, in (-PI, PI]. */
export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/** Rotates `current` toward `target` along the shortest arc by at most `maxStep`, never overshooting. */
export function stepAngleToward(current: number, target: number, maxStep: number): number {
  const delta = shortestAngleDelta(current, target);
  const step = Math.max(0, Number.isFinite(maxStep) ? maxStep : 0);
  return Math.abs(delta) <= step ? normalizeAngle(target) : normalizeAngle(current + Math.sign(delta) * step);
}

/**
 * Next turret yaw, relative to the hull. A `null` aim means "no valid target": the turret eases
 * back to hull-forward (zero). The hull's own heading is never changed.
 */
export function stepTurretYaw(
  currentRelative: number,
  aimHeading: number | null,
  hullFacing: number,
  deltaSeconds: number,
  maxTurnRadiansPerSecond: number,
): number {
  const desired = aimHeading === null ? 0 : shortestAngleDelta(hullFacing, aimHeading);
  return stepAngleToward(currentRelative, desired, maxTurnRadiansPerSecond * Math.max(0, deltaSeconds));
}

/** Heading to a point, in the core convention (zero is north, positive turns east); `null` when coincident. */
export function headingToPoint(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx === 0 && dy === 0 ? null : Math.atan2(dx, -dy);
}

/** The entity an order is currently shooting at or pursuing, if any. */
export function attackTargetIdOf(order: Order | null): EntityId | null {
  if (order === null) return null;
  if (order.kind === 'Attack') return order.targetId;
  if (order.kind === 'AttackMove') return order.engagement?.targetId ?? null;
  return null;
}

/**
 * Speed implied by a frame's displacement, in tiles per second. Zero for a stalled clock, bad
 * numbers, or a jump longer than `maxDisplacementTiles` (a teleport or snapshot reset).
 */
export function displacementSpeed(
  dxTiles: number,
  dyTiles: number,
  deltaSeconds: number,
  maxDisplacementTiles: number,
): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  const distance = Math.hypot(dxTiles, dyTiles);
  if (!Number.isFinite(distance) || distance > maxDisplacementTiles) return 0;
  return distance / deltaSeconds;
}

/**
 * Exponentially smoothed speed. Interpolated online snapshots advance in uneven steps (a plateau
 * between snapshots, then a catch-up), so a single frame's displacement flickers between zero and
 * far too much; the average over a short window is the vehicle's real pace.
 */
export class SpeedSmoother {
  private value = 0;

  public update(rawSpeed: number, deltaSeconds: number, windowSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.value;
    this.value += (rawSpeed - this.value) * (1 - Math.exp(-deltaSeconds / windowSeconds));
    return this.value;
  }
}

/** Fixed-cadence emitter. Paused (zero delta) time never accrues, and idle time is discarded. */
export class DustClock {
  private elapsed = 0;

  /** How many puffs are due this frame, capped so a hitch cannot spawn a burst. */
  public advance(deltaSeconds: number, moving: boolean, intervalSeconds: number, maxEmits: number): number {
    if (!moving) {
      this.elapsed = 0;
      return 0;
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    this.elapsed += deltaSeconds;
    let due = 0;
    while (this.elapsed >= intervalSeconds && due < maxEmits) {
      this.elapsed -= intervalSeconds;
      due++;
    }
    if (this.elapsed >= intervalSeconds) this.elapsed %= intervalSeconds;
    return due;
  }
}

/** Fixed set of slots reused oldest-first, so a long match never grows its scene object count. */
export class RecyclingRing {
  private next = 0;

  public constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Recycling ring capacity must be a positive integer.');
    }
  }

  /** The slot to fill now; whatever it held is the oldest and is overwritten. */
  public claim(): number {
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    return slot;
  }
}

/** Barrel recoil as a pure function of time since the shot, restartable from a mid-recovery offset. */
export class RecoilState {
  private elapsed = Number.POSITIVE_INFINITY;
  private startOffset = 0;

  /** A new shot kicks from wherever the barrel currently is, so rapid fire never snaps. */
  public trigger(profile: TurretProfile): void {
    this.startOffset = this.offsetTiles(profile);
    this.elapsed = 0;
  }

  public advance(deltaSeconds: number): void {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.elapsed += deltaSeconds;
  }

  /** Rearward barrel travel, in tiles. Exactly zero once recovered, so no drift can accumulate. */
  public offsetTiles(profile: TurretProfile): number {
    const { recoilKickSeconds: kick, recoilRecoverSeconds: recover, recoilDistanceTiles: peak } = profile;
    if (this.elapsed >= kick + recover) return 0;
    if (this.elapsed < kick) {
      const t = this.elapsed / kick;
      return this.startOffset + (peak - this.startOffset) * (1 - (1 - t) * (1 - t));
    }
    const t = (this.elapsed - kick) / recover;
    return peak * (1 - t * t * (3 - 2 * t));
  }
}

/** 0 before `start`, 1 from `start + duration`, linear between. */
export function stageProgress(elapsed: number, start: number, duration: number): number {
  if (!(duration > 0)) return 1;
  return Math.min(1, Math.max(0, (elapsed - start) / duration));
}

/** A cheap, deterministic hash in [0, 1) so effects vary without random allocation or flaky tests. */
export function unitHash(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Destruction scale from the destroyed vehicle's body size, clamped so it never obscures neighbours. */
export function destructionScale(sizeTiles: number, config: VehicleDestructionConfig): number {
  const raw = sizeTiles / config.referenceSizeTiles;
  return Math.min(config.maxScale, Math.max(config.minScale, Number.isFinite(raw) ? raw : 1));
}

/** Total length of the longest stage, i.e. when the slot can be recycled. */
export function destructionDurationSeconds(config: VehicleDestructionConfig): number {
  return Math.max(
    config.flash.durationSeconds,
    config.shockwave.durationSeconds,
    config.sparks.durationSeconds,
    config.fragments.durationSeconds,
    config.fire.durationSeconds,
    config.smoke.startDelaySeconds + config.smoke.durationSeconds,
  );
}

/** Wreck opacity: fully solid while held, then a linear fade to nothing. */
export function wreckVisibility(elapsed: number, config: VehicleWreckConfig): number {
  return 1 - stageProgress(elapsed, config.holdSeconds, config.fadeSeconds);
}

export function wreckExpired(elapsed: number, config: VehicleWreckConfig): boolean {
  return elapsed >= config.holdSeconds + config.fadeSeconds;
}
