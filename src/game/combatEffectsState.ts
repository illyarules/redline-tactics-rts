/** Pure bounded-pool bookkeeping shared by the Babylon combat effects view and its tests. */
export class BoundedEffectPool {
  private readonly available: number[];
  private readonly active = new Set<number>();

  public constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Effect pool capacity must be a positive integer.');
    }
    this.available = Array.from({ length: capacity }, (_, index) => capacity - index - 1);
  }

  public acquire(): number | null {
    const slot = this.available.pop();
    if (slot === undefined) return null;
    this.active.add(slot);
    return slot;
  }

  public release(slot: number): boolean {
    if (!this.active.delete(slot)) return false;
    this.available.push(slot);
    return true;
  }

  public clear(): void {
    this.active.clear();
    this.available.length = 0;
    for (let index = this.capacity - 1; index >= 0; index--) this.available.push(index);
  }

  public get activeCount(): number { return this.active.size; }
  public get availableCount(): number { return this.available.length; }
}

export interface EffectLifetime {
  readonly elapsedSeconds: number;
  readonly expired: boolean;
}

/** Advances a finite effect without allowing a bad frame delta to alter its lifetime. */
export function advanceEffectLifetime(
  elapsedSeconds: number,
  durationSeconds: number,
  deltaSeconds: number,
): EffectLifetime {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return { elapsedSeconds, expired: elapsedSeconds >= durationSeconds };
  }
  const next = elapsedSeconds + deltaSeconds;
  return { elapsedSeconds: Math.min(next, durationSeconds), expired: next >= durationSeconds };
}
