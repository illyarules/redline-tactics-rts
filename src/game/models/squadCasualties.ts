/**
 * Health-driven casualties for a squad's visible members. Pure bookkeeping: the entity keeps one
 * health pool, and the visible count is nothing but a function of that pool. Nothing here is saved,
 * sent over the network or fed back into the simulation.
 *
 * Members are indexed lead first (see `SQUAD_ROLES`), so the first `visibleCount` members stand and
 * the rest are casualties: the last member falls first and the lead is always the last to go.
 */
import type { SquadCasualtyConfig } from '../../config/types';

/** Absorbs floating-point error so an exact boundary such as 3/4 of 100 health never rounds up a member. */
const BOUNDARY_EPSILON = 1e-9;

/**
 * Members standing at `healthFraction` for a squad of `squadSize`: `ceil(fraction * size)`, so a
 * squad loses a member each time health drops to or below an even share of its maximum. A living
 * squad always shows at least one member; zero (or non-finite) health shows none.
 */
export function visibleMemberCount(healthFraction: number, squadSize: number): number {
  if (!Number.isFinite(healthFraction) || healthFraction <= 0) return 0;
  const standing = Math.ceil(Math.min(healthFraction, 1) * squadSize - BOUNDARY_EPSILON);
  return Math.min(squadSize, Math.max(1, standing));
}

export type MemberPhase = 'standing' | 'falling' | 'gone';

export interface CasualtyPose {
  /** Backwards tilt in radians, zero while standing. */
  readonly tiltRadians: number;
  /** How far the member has sunk, in tiles. */
  readonly dropTiles: number;
  /** Opacity multiplier: 1 while standing, easing to 0 as the member fades. */
  readonly visibility: number;
}

export const STANDING_POSE: CasualtyPose = { tiltRadians: 0, dropTiles: 0, visibility: 1 };

/** The pose `progress` (0 to 1) through a fall: tip over and sink first, then fade away. */
export function casualtyPose(progress: number, config: SquadCasualtyConfig): CasualtyPose {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - t) * (1 - t);
  const fade = Math.min(1, Math.max(0, (t - config.fadeStartFraction) / (1 - config.fadeStartFraction)));
  return {
    tiltRadians: config.tiltRadians * eased,
    dropTiles: config.dropTiles * eased,
    visibility: 1 - fade,
  };
}

/** Which members of one squad stand, are mid-fall or are gone. */
export class SquadRoster {
  private readonly phases: MemberPhase[];
  private readonly fallElapsed: number[];
  private target: number;

  /** Starts with `visibleCount` members standing and the rest already gone, so no fall is replayed. */
  public constructor(public readonly size: number, visibleCount: number) {
    this.target = clampCount(visibleCount, size);
    this.phases = Array.from({ length: size }, (_, index) => (index < this.target ? 'standing' : 'gone'));
    this.fallElapsed = Array.from({ length: size }, () => 0);
  }

  /** How many members are meant to be standing right now. Falling members are not counted. */
  public get visibleCount(): number {
    return this.target;
  }

  public phaseOf(index: number): MemberPhase {
    return this.phases[index] ?? 'gone';
  }

  /** Whether the member still occupies the scene at all, standing or on the way out. */
  public isShown(index: number): boolean {
    return this.phaseOf(index) !== 'gone';
  }

  /** Seconds a falling member has been down; zero otherwise. */
  public fallSeconds(index: number): number {
    return this.phaseOf(index) === 'falling' ? (this.fallElapsed[index] ?? 0) : 0;
  }

  /**
   * Moves to `count` standing members. Members past it start to fall, or vanish at once with
   * `animate: false` (for squads out of sight). A rise in count stands members back up instantly;
   * the game never heals, so that only covers a replaced or restored snapshot.
   */
  public setVisibleCount(count: number, animate: boolean): void {
    this.target = clampCount(count, this.size);
    for (let index = 0; index < this.size; index++) {
      if (index < this.target) {
        this.phases[index] = 'standing';
        this.fallElapsed[index] = 0;
      } else if (this.phases[index] === 'standing') {
        this.phases[index] = animate ? 'falling' : 'gone';
        this.fallElapsed[index] = 0;
      } else if (!animate) {
        this.phases[index] = 'gone';
      }
    }
  }

  /** Advances every fall; a member is gone once it has been down for `fallSeconds`. */
  public advance(deltaSeconds: number, fallSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (let index = 0; index < this.size; index++) {
      if (this.phases[index] !== 'falling') continue;
      const elapsed = (this.fallElapsed[index] ?? 0) + deltaSeconds;
      this.fallElapsed[index] = elapsed;
      if (elapsed >= fallSeconds) this.phases[index] = 'gone';
    }
  }

  /** The pose of one member: standing, partway through its fall, or fully faded. */
  public poseOf(index: number, config: SquadCasualtyConfig): CasualtyPose {
    switch (this.phaseOf(index)) {
      case 'standing': return STANDING_POSE;
      case 'falling': return casualtyPose(this.fallSeconds(index) / config.fallSeconds, config);
      case 'gone': return casualtyPose(1, config);
    }
  }
}

function clampCount(count: number, size: number): number {
  return Number.isFinite(count) ? Math.min(size, Math.max(0, Math.floor(count))) : 0;
}
