/**
 * Limits costly scene renders on high-refresh displays while returning a deterministic simulation
 * delta to the caller. Pure by design, so it is cheap to cover without starting Babylon.
 */
export class FramePacer {
  private lastRenderAtMs: number | null = null;

  public constructor(
    private readonly targetFramesPerSecond: number,
    private readonly maxDeltaSeconds: number,
  ) {}

  /** Returns seconds for the next frame, or `null` when the render budget has not elapsed yet. */
  public next(nowMs: number): number | null {
    if (this.lastRenderAtMs === null) {
      this.lastRenderAtMs = nowMs;
      return 1 / this.targetFramesPerSecond;
    }

    const elapsedMs = nowMs - this.lastRenderAtMs;
    if (elapsedMs < 1000 / this.targetFramesPerSecond) {
      return null;
    }

    this.lastRenderAtMs = nowMs;
    return Math.min(elapsedMs / 1000, this.maxDeltaSeconds);
  }

  /** Starts timing afresh after a hidden tab is resumed. */
  public reset(): void {
    this.lastRenderAtMs = null;
  }
}
