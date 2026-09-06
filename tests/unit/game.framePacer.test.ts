import { describe, expect, it } from 'vitest';
import { FramePacer } from '../../src/game/framePacer';

describe('FramePacer', () => {
  it('renders the first frame, caps a high-refresh loop, and returns elapsed simulation time', () => {
    const pacer = new FramePacer(60, 0.1);
    expect(pacer.next(0)).toBeCloseTo(1 / 60);
    expect(pacer.next(8)).toBeNull();
    expect(pacer.next(17)).toBeCloseTo(0.017);
  });

  it('clamps a resumed frame and restarts cleanly after reset', () => {
    const pacer = new FramePacer(60, 0.1);
    pacer.next(0);
    expect(pacer.next(1_000)).toBe(0.1);
    pacer.reset();
    expect(pacer.next(2_000)).toBeCloseTo(1 / 60);
  });
});
