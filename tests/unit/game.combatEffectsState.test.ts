import { describe, expect, it } from 'vitest';
import { advanceEffectLifetime, BoundedEffectPool } from '../../src/game/combatEffectsState';

describe('bounded combat effect pool', () => {
  it('never hands out more active slots than its fixed capacity and reuses released slots', () => {
    const pool = new BoundedEffectPool(2);
    const first = pool.acquire();
    const second = pool.acquire();
    expect([first, second].sort()).toEqual([0, 1]);
    expect(pool.acquire()).toBeNull();
    expect(pool.activeCount).toBe(2);

    expect(pool.release(first!)).toBe(true);
    expect(pool.release(first!)).toBe(false);
    expect(pool.acquire()).toBe(first);
    expect(pool.activeCount).toBe(2);
  });

  it('resets all accounting during scene cleanup', () => {
    const pool = new BoundedEffectPool(3);
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.activeCount).toBe(0);
    expect(pool.availableCount).toBe(3);
  });
});

describe('combat effect lifetimes', () => {
  it('expires exactly at its duration and ignores invalid frame deltas', () => {
    expect(advanceEffectLifetime(0, 0.2, 0.1)).toEqual({ elapsedSeconds: 0.1, expired: false });
    expect(advanceEffectLifetime(0.1, 0.2, 0.1)).toEqual({ elapsedSeconds: 0.2, expired: true });
    expect(advanceEffectLifetime(0.1, 0.2, -1)).toEqual({ elapsedSeconds: 0.1, expired: false });
  });
});
