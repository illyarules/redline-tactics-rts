import { describe, expect, it } from 'vitest';
import { SQUAD_CONFIG } from '../src/config/squad';
import { idlePose, walkPose } from '../src/game/models/walkCycle';

describe('walkPose', () => {
  it('swings the legs in opposite directions at the same phase', () => {
    const pose = walkPose(Math.PI / 2, SQUAD_CONFIG);
    expect(pose.legLeftRadians).toBeCloseTo(SQUAD_CONFIG.legSwingRadians, 5);
    expect(pose.legRightRadians).toBeCloseTo(-SQUAD_CONFIG.legSwingRadians, 5);
  });

  it('never bobs below the ground', () => {
    for (let step = 0; step <= 20; step++) {
      const phase = (step / 20) * Math.PI * 2;
      expect(walkPose(phase, SQUAD_CONFIG).bobTiles).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns to a neutral pose at the start and end of a full cycle', () => {
    const start = walkPose(0, SQUAD_CONFIG);
    const end = walkPose(Math.PI * 2, SQUAD_CONFIG);
    expect(start.legLeftRadians).toBeCloseTo(0, 5);
    expect(end.legLeftRadians).toBeCloseTo(0, 5);
  });
});

describe('idlePose', () => {
  it('keeps both legs still', () => {
    for (let seconds = 0; seconds < 5; seconds += 0.37) {
      const pose = idlePose(seconds, SQUAD_CONFIG);
      expect(pose.legLeftRadians).toBe(0);
      expect(pose.legRightRadians).toBe(0);
    }
  });

  it('sways gently rather than swinging through the full walk amplitude', () => {
    const pose = idlePose(1.3, SQUAD_CONFIG);
    expect(Math.abs(pose.armRadians)).toBeLessThanOrEqual(SQUAD_CONFIG.idleSwayRadians);
    expect(Math.abs(pose.armRadians)).toBeLessThan(SQUAD_CONFIG.armSwingRadians);
  });

  it('never bobs below the ground', () => {
    for (let seconds = 0; seconds < 5; seconds += 0.31) {
      expect(idlePose(seconds, SQUAD_CONFIG).bobTiles).toBeGreaterThanOrEqual(0);
    }
  });
});
