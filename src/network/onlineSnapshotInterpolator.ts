import type { OnlineBattleSnapshot, OnlineEntityView } from './onlineBattleView';

export interface SequencedOnlineSnapshot extends OnlineBattleSnapshot {
  readonly matchId: string;
  readonly snapshotSeq: number;
  readonly tick: number;
}

interface TimedSnapshot {
  readonly snapshot: SequencedOnlineSnapshot;
  readonly receivedAtMilliseconds: number;
}

/**
 * Renders one snapshot interval behind the server and blends only currently authorized entities.
 * Entities absent from the newest filtered snapshot are removed immediately, so fog never leaves a
 * stale enemy on screen or provides a hidden route to interpolate through.
 */
export class OnlineSnapshotInterpolator {
  private previous: TimedSnapshot | null = null;
  private current: TimedSnapshot | null = null;

  public push(snapshot: SequencedOnlineSnapshot, receivedAtMilliseconds: number): boolean {
    if (this.current !== null && snapshot.matchId === this.current.snapshot.matchId) {
      if (snapshot.snapshotSeq <= this.current.snapshot.snapshotSeq || snapshot.tick < this.current.snapshot.tick) return false;
      this.previous = this.current;
    } else {
      this.previous = null;
    }
    this.current = { snapshot, receivedAtMilliseconds };
    return true;
  }

  public sample(nowMilliseconds: number): SequencedOnlineSnapshot | null {
    if (this.current === null) return null;
    if (this.previous === null || this.previous.snapshot.matchId !== this.current.snapshot.matchId) {
      return this.current.snapshot;
    }
    const interval = Math.max(1, this.current.receivedAtMilliseconds - this.previous.receivedAtMilliseconds);
    const alpha = clamp((nowMilliseconds - this.current.receivedAtMilliseconds) / interval, 0, 1);
    const previousById = new Map(this.previous.snapshot.entities.map((entity) => [entity.id, entity]));
    return {
      ...this.current.snapshot,
      entities: this.current.snapshot.entities.map((entity) => interpolateEntity(previousById.get(entity.id), entity, alpha)),
    };
  }

  public reset(): void {
    this.previous = null;
    this.current = null;
  }
}

function interpolateEntity(
  previous: OnlineEntityView | undefined,
  current: OnlineEntityView,
  alpha: number,
): OnlineEntityView {
  if (previous === undefined || previous.kind !== current.kind || previous.owner !== current.owner) return current;
  return {
    ...current,
    x: lerp(previous.x, current.x, alpha),
    y: lerp(previous.y, current.y, alpha),
    ...(current.kind === 'unit' && previous.kind === 'unit'
      ? { facingRadians: interpolateAngle(previous.facingRadians ?? 0, current.facingRadians ?? 0, alpha) }
      : {}),
  };
}

function interpolateAngle(from: number, to: number, alpha: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * alpha;
}

function lerp(from: number, to: number, alpha: number): number { return from + (to - from) * alpha; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
