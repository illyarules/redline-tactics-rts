import { describe, expect, it } from 'vitest';
import { VEHICLE_EFFECTS_CONFIG, isValidVehicleEffectsConfig } from '../../src/config/vehicleEffects';
import { attackMoveOrder, attackOrder, moveOrder } from '../../src/core/orders';
import type { EntityId } from '../../src/core/ids';
import {
  DustClock, RecoilState, SpeedSmoother, RecyclingRing, attackTargetIdOf, destructionDurationSeconds, destructionScale,
  displacementSpeed, headingToPoint, normalizeAngle, shortestAngleDelta, stageProgress, stepAngleToward,
  stepTurretYaw, unitHash, wreckExpired, wreckVisibility,
} from '../../src/game/vehicleEffectsState';

const CONFIG = VEHICLE_EFFECTS_CONFIG;
const TANK = CONFIG.turrets.tank;

describe('turret angles', () => {
  it('normalizes into (-PI, PI] and takes the shortest arc across the wrap', () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(shortestAngleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2);
    expect(shortestAngleDelta(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2);
  });

  it('steps by at most the angular budget and never overshoots', () => {
    expect(stepAngleToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(stepAngleToward(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(stepAngleToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
    expect(stepAngleToward(0.4, 0.4, 1)).toBeCloseTo(0.4);
    expect(stepAngleToward(0, 1, -5)).toBe(0);
  });

  it('turns through the short side of the wrap, not the long way round', () => {
    expect(stepAngleToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeCloseTo(Math.PI - 0.05);
  });

  it('rotates a turret toward the target heading at the configured speed, relative to the hull', () => {
    const next = stepTurretYaw(0, Math.PI / 2, 0, 0.1, TANK.maxTurnRadiansPerSecond);
    expect(next).toBeCloseTo(TANK.maxTurnRadiansPerSecond * 0.1);
    // The same world heading is a smaller relative turn when the hull already faces partly toward it.
    expect(stepTurretYaw(0, Math.PI / 2, Math.PI / 2, 10, TANK.maxTurnRadiansPerSecond)).toBeCloseTo(0);
  });

  it('keeps pointing at a world heading while the hull turns underneath it', () => {
    let yaw = 0;
    for (let i = 0; i < 100; i++) yaw = stepTurretYaw(yaw, 1, 0, 0.1, 5);
    expect(yaw).toBeCloseTo(1);
    // Hull swings to face 0.4: the turret's relative yaw must shrink to hold the world heading 1.
    yaw = stepTurretYaw(yaw, 1, 0.4, 1, 5);
    expect(yaw).toBeCloseTo(0.6);
  });

  it('returns to hull-forward when there is no target, and never snaps', () => {
    let yaw = 1.2;
    yaw = stepTurretYaw(yaw, null, 0.7, 0.1, 2);
    expect(yaw).toBeCloseTo(1.0);
    for (let i = 0; i < 20; i++) yaw = stepTurretYaw(yaw, null, 0.7, 0.1, 2);
    expect(yaw).toBe(0);
  });

  it('ignores a zero or negative frame', () => {
    expect(stepTurretYaw(0.5, 2, 0, 0, 3)).toBeCloseTo(0.5);
    expect(stepTurretYaw(0.5, 2, 0, -1, 3)).toBeCloseTo(0.5);
  });

  it('uses the core heading convention: zero is north, east is positive', () => {
    expect(headingToPoint({ x: 0, y: 0 }, { x: 0, y: -5 })).toBeCloseTo(0);
    expect(headingToPoint({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(headingToPoint({ x: 3, y: 3 }, { x: 3, y: 3 })).toBeNull();
  });
});

describe('attack target of an order', () => {
  it('names the pursued entity for attack and engaged attack-move orders only', () => {
    const id = 'victim' as EntityId;
    expect(attackTargetIdOf(null)).toBeNull();
    expect(attackTargetIdOf(attackOrder(id, null, 'explicit'))).toBe(id);
    expect(attackTargetIdOf(moveOrder({ x: 0, y: 0 }))).toBeNull();
    const idleMove = attackMoveOrder({ x: 0, y: 0 });
    expect(attackTargetIdOf(idleMove)).toBeNull();
    expect(attackTargetIdOf({ ...idleMove, engagement: attackOrder(id, null, 'attackMove') })).toBe(id);
  });
});

describe('vehicle dust', () => {
  it('derives speed from real displacement and rejects stalls, bad numbers and teleports', () => {
    expect(displacementSpeed(0.3, 0.4, 0.5, 1.5)).toBeCloseTo(1);
    expect(displacementSpeed(1, 0, 0, 1.5)).toBe(0);
    expect(displacementSpeed(1, 0, Number.NaN, 1.5)).toBe(0);
    expect(displacementSpeed(Number.NaN, 0, 0.1, 1.5)).toBe(0);
    expect(displacementSpeed(10, 0, 0.1, 1.5)).toBe(0);
  });

  it('emits on a fixed cadence only while moving', () => {
    const clock = new DustClock();
    expect(clock.advance(0.05, true, 0.1, 2)).toBe(0);
    expect(clock.advance(0.05, true, 0.1, 2)).toBe(1);
    expect(clock.advance(0.1, true, 0.1, 2)).toBe(1);
    expect(clock.advance(0.1, false, 0.1, 2)).toBe(0);
  });

  it('accrues nothing while paused (zero delta) and starts fresh after stopping', () => {
    const clock = new DustClock();
    clock.advance(0.09, true, 0.1, 2);
    expect(clock.advance(0, true, 0.1, 2)).toBe(0);
    clock.advance(0.5, false, 0.1, 2);
    expect(clock.advance(0.02, true, 0.1, 2)).toBe(0);
  });

  it('caps a hitch to the per-frame limit instead of bursting', () => {
    const clock = new DustClock();
    expect(clock.advance(5, true, 0.1, 2)).toBe(2);
    expect(clock.advance(0.01, true, 0.1, 2)).toBe(0);
  });

  it('makes the tank trail heavier and slower and the buggy trail lighter and faster', () => {
    const { tank, combatBuggy, worker, rocket } = CONFIG.dust.profiles;
    expect(tank.intervalSeconds).toBeGreaterThan(combatBuggy.intervalSeconds);
    expect(tank.lifetimeSeconds).toBeGreaterThan(combatBuggy.lifetimeSeconds);
    expect(tank.endDiameterTiles).toBeGreaterThan(combatBuggy.endDiameterTiles);
    expect(combatBuggy.driftBackTiles / combatBuggy.lifetimeSeconds)
      .toBeGreaterThan(tank.driftBackTiles / tank.lifetimeSeconds);
    for (const restrained of [worker, rocket]) {
      expect(restrained.peakVisibility).toBeLessThan(tank.peakVisibility);
      expect(restrained.endDiameterTiles).toBeLessThan(tank.endDiameterTiles);
    }
  });
});

describe('speed smoothing', () => {
  it('rides through the plateau-then-jump steps of interpolated snapshots', () => {
    const smoother = new SpeedSmoother();
    const window = CONFIG.dust.speedWindowSeconds;
    let value = 0;
    // True pace 2 tiles/s delivered as 5 stalled frames then one catch-up frame, repeatedly.
    for (let i = 0; i < 60; i++) value = smoother.update(i % 6 === 5 ? 12 : 0, 1 / 60, window);
    expect(value).toBeGreaterThan(CONFIG.dust.profiles.worker.minSpeedTilesPerSecond);
    expect(value).toBeLessThan(4);
  });

  it('decays to a stop, ignores zero-length frames, and starts from rest', () => {
    const smoother = new SpeedSmoother();
    expect(smoother.update(0, 0.1, 0.12)).toBe(0);
    smoother.update(2, 1, 0.12);
    const held = smoother.update(0, 0, 0.12);
    expect(held).toBeGreaterThan(1.9);
    expect(smoother.update(0, 1, 0.12)).toBeLessThan(0.01);
  });
});

describe('barrel recoil', () => {
  it('is zero at rest, peaks at the configured distance, and returns exactly to zero', () => {
    const recoil = new RecoilState();
    expect(recoil.offsetTiles(TANK)).toBe(0);
    recoil.trigger(TANK);
    expect(recoil.offsetTiles(TANK)).toBe(0);
    recoil.advance(TANK.recoilKickSeconds);
    expect(recoil.offsetTiles(TANK)).toBeCloseTo(TANK.recoilDistanceTiles);
    recoil.advance(TANK.recoilRecoverSeconds / 2);
    expect(recoil.offsetTiles(TANK)).toBeCloseTo(TANK.recoilDistanceTiles / 2);
    recoil.advance(TANK.recoilRecoverSeconds);
    expect(recoil.offsetTiles(TANK)).toBe(0);
  });

  it('moves monotonically back during the kick and forward during recovery', () => {
    const recoil = new RecoilState();
    recoil.trigger(TANK);
    let last = 0;
    for (let i = 0; i < 10; i++) {
      recoil.advance(TANK.recoilKickSeconds / 10);
      const offset = recoil.offsetTiles(TANK);
      expect(offset).toBeGreaterThanOrEqual(last);
      last = offset;
    }
    for (let i = 0; i < 10; i++) {
      recoil.advance(TANK.recoilRecoverSeconds / 10);
      const offset = recoil.offsetTiles(TANK);
      expect(offset).toBeLessThanOrEqual(last + 1e-12);
      last = offset;
    }
  });

  it('does not drift or snap over many rapid shots', () => {
    const recoil = new RecoilState();
    let previous = 0;
    for (let shot = 0; shot < 500; shot++) {
      recoil.trigger(TANK);
      // The restart continues from the current offset instead of jumping back to zero.
      expect(recoil.offsetTiles(TANK)).toBeCloseTo(previous, 9);
      recoil.advance(TANK.recoilKickSeconds * 0.6);
      expect(recoil.offsetTiles(TANK)).toBeLessThanOrEqual(TANK.recoilDistanceTiles + 1e-12);
      previous = recoil.offsetTiles(TANK);
    }
    recoil.advance(10);
    expect(recoil.offsetTiles(TANK)).toBe(0);
  });
});

describe('bounded reuse and timelines', () => {
  it('cycles through a fixed number of slots, reusing the oldest', () => {
    const ring = new RecyclingRing(3);
    expect(Array.from({ length: 7 }, () => ring.claim())).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(() => new RecyclingRing(0)).toThrow();
  });

  it('clamps stage progress to [0, 1]', () => {
    expect(stageProgress(0.5, 1, 2)).toBe(0);
    expect(stageProgress(2, 1, 2)).toBe(0.5);
    expect(stageProgress(9, 1, 2)).toBe(1);
    expect(stageProgress(0, 0, 0)).toBe(1);
  });

  it('hashes deterministically into [0, 1)', () => {
    expect(unitHash(3)).toBe(unitHash(3));
    for (let i = 0; i < 50; i++) {
      expect(unitHash(i)).toBeGreaterThanOrEqual(0);
      expect(unitHash(i)).toBeLessThan(1);
    }
  });

  it('scales destruction by body size within the configured clamp', () => {
    const d = CONFIG.destruction;
    expect(destructionScale(d.referenceSizeTiles, d)).toBeCloseTo(1);
    expect(destructionScale(0.01, d)).toBe(d.minScale);
    expect(destructionScale(50, d)).toBe(d.maxScale);
    expect(destructionScale(Number.NaN, d)).toBe(1);
  });

  it('lasts as long as its longest stage, with smoke the last to leave', () => {
    const d = CONFIG.destruction;
    expect(destructionDurationSeconds(d)).toBe(d.smoke.startDelaySeconds + d.smoke.durationSeconds);
  });

  it('keeps a wreck solid, fades it out, and expires it once', () => {
    const wreck = CONFIG.wreck;
    expect(wreckVisibility(0, wreck)).toBe(1);
    expect(wreckVisibility(wreck.holdSeconds, wreck)).toBe(1);
    expect(wreckVisibility(wreck.holdSeconds + wreck.fadeSeconds / 2, wreck)).toBeCloseTo(0.5);
    expect(wreckExpired(wreck.holdSeconds + wreck.fadeSeconds - 0.01, wreck)).toBe(false);
    expect(wreckExpired(wreck.holdSeconds + wreck.fadeSeconds, wreck)).toBe(true);
    expect(wreck.capacity).toBeGreaterThan(0);
  });
});

describe('vehicle effects configuration', () => {
  it('is valid as shipped', () => {
    expect(isValidVehicleEffectsConfig(CONFIG)).toBe(true);
  });

  it('rejects unbounded pools and nonsensical timings', () => {
    expect(isValidVehicleEffectsConfig({ ...CONFIG, dust: { ...CONFIG.dust, poolCapacity: 0 } })).toBe(false);
    expect(isValidVehicleEffectsConfig({ ...CONFIG, wreck: { ...CONFIG.wreck, capacity: 1.5 } })).toBe(false);
    expect(isValidVehicleEffectsConfig({
      ...CONFIG, turrets: { ...CONFIG.turrets, tank: { ...TANK, maxTurnRadiansPerSecond: 0 } },
    })).toBe(false);
    expect(isValidVehicleEffectsConfig({
      ...CONFIG, destruction: { ...CONFIG.destruction, minScale: 3 },
    })).toBe(false);
  });
});
