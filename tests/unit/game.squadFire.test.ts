import { describe, expect, it } from 'vitest';
import { SQUAD_RECOIL_CONFIG } from '../../src/config/squad';
import { nextShooterIndex, recoilDurationSeconds, recoilKick } from '../../src/game/models/squadFire';

describe('nextShooterIndex', () => {
  it('cycles through the standing soldiers in order, starting with the lead', () => {
    const shooters: number[] = [];
    let previous: number | null = null;
    for (let shot = 0; shot < 9; shot++) {
      const next = nextShooterIndex(previous, 4);
      shooters.push(next!);
      previous = next;
    }
    expect(shooters).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
  });

  it('never picks a hidden casualty, whatever the previous shooter was', () => {
    for (let visible = 1; visible <= 4; visible++) {
      for (let previous = -1; previous < 6; previous++) {
        const next = nextShooterIndex(previous < 0 ? null : previous, visible);
        expect(next).not.toBeNull();
        expect(next!).toBeGreaterThanOrEqual(0);
        expect(next!).toBeLessThan(visible);
      }
    }
  });

  it('adapts when the visible count falls between shots', () => {
    // The last shooter was the soldier in slot 3, who has since fallen: wrap back to the lead.
    expect(nextShooterIndex(3, 2)).toBe(0);
    // Slot 1 shot last and slot 2 has fallen: the cycle continues into slot 0, not the casualty.
    expect(nextShooterIndex(1, 2)).toBe(0);
    expect(nextShooterIndex(1, 3)).toBe(2);
    // A lone survivor always shoots.
    expect(nextShooterIndex(0, 1)).toBe(0);
    expect(nextShooterIndex(2, 1)).toBe(0);
  });

  it('picks nobody when no soldier stands or the count is not a count', () => {
    expect(nextShooterIndex(null, 0)).toBeNull();
    expect(nextShooterIndex(1, -1)).toBeNull();
    expect(nextShooterIndex(1, Number.NaN)).toBeNull();
    expect(nextShooterIndex(1, 2.5)).toBeNull();
  });

  it('restarts at the lead for a previous index that is not a valid slot', () => {
    expect(nextShooterIndex(Number.NaN, 4)).toBe(0);
    expect(nextShooterIndex(-7, 4)).toBe(0);
  });

  it('is deterministic', () => {
    expect(nextShooterIndex(2, 4)).toBe(nextShooterIndex(2, 4));
  });
});

describe('recoilKick', () => {
  const config = SQUAD_RECOIL_CONFIG;

  it('rests before the shot and kicks to full strength after the attack time', () => {
    expect(recoilKick(0, config)).toBe(0);
    expect(recoilKick(config.attackSeconds, config)).toBeCloseTo(1, 9);
  });

  it('rises fast and returns smoothly to rest', () => {
    let previous = 0;
    for (let step = 1; step <= 10; step++) {
      const kick = recoilKick(config.attackSeconds * step / 10, config);
      expect(kick).toBeGreaterThanOrEqual(previous);
      previous = kick;
    }
    for (let step = 1; step <= 20; step++) {
      const kick = recoilKick(config.attackSeconds + config.releaseSeconds * step / 20, config);
      expect(kick).toBeLessThanOrEqual(previous);
      previous = kick;
    }
    expect(previous).toBe(0);
  });

  it('is over after its duration, and stays at rest for later, negative or non-finite times', () => {
    expect(recoilDurationSeconds(config)).toBeCloseTo(config.attackSeconds + config.releaseSeconds, 12);
    expect(recoilKick(recoilDurationSeconds(config), config)).toBe(0);
    expect(recoilKick(10, config)).toBe(0);
    expect(recoilKick(-1, config)).toBe(0);
    expect(recoilKick(Infinity, config)).toBe(0);
    expect(recoilKick(Number.NaN, config)).toBe(0);
  });

  it('stays small and fast', () => {
    expect(config.armKickRadians).toBeLessThanOrEqual(0.25);
    expect(config.bodyKickTiles).toBeLessThanOrEqual(0.05);
    expect(recoilDurationSeconds(config)).toBeLessThanOrEqual(0.3);
    expect(config.attackSeconds).toBeLessThan(config.releaseSeconds);
  });
});
