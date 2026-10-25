/**
 * Pure bookkeeping for how a vehicle looks while it drives: wheel spin, front-wheel steering and
 * the body's pitch and lean. Fed with the speed and heading the model actually showed, so it works
 * the same for local state and interpolated online snapshots. No Babylon here.
 */
import type { VehicleMotionConfig } from '../config/types';
import { shortestAngleDelta } from './vehicleEffectsState';

const FULL_TURN = Math.PI * 2;

function approach(current: number, target: number, ratePerSecond: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-ratePerSecond * deltaSeconds));
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Where a wheel set sits on the vehicle, in scene units (tiles). */
export interface WheelGeometry {
  readonly radius: number;
  /** Distance from the centreline to the wheels, which sets how fast each side turns when pivoting. */
  readonly halfTrack: number;
}

export interface VehiclePose {
  /** Wheel roll angles in radians; positive is forward. */
  readonly spinLeft: number;
  readonly spinRight: number;
  /** Front wheel steering in radians; positive turns right. */
  readonly steer: number;
  /** Nose-down body tilt in radians; negative lifts the nose. */
  readonly pitch: number;
  /** Body lean in radians; positive raises the right side. */
  readonly roll: number;
}

export class VehicleMotionState {
  private spinLeft = 0;
  private spinRight = 0;
  private steer = 0;
  private pitch = 0;
  private roll = 0;
  private yawRate = 0;
  private response = 0;
  private lastFacing: number | null = null;

  /** Advances by one frame; `speed` is tiles/s ahead, `facing` the hull's heading in radians. */
  public update(
    speed: number,
    facing: number,
    deltaSeconds: number,
    config: VehicleMotionConfig,
    wheels: WheelGeometry,
  ): VehiclePose {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !Number.isFinite(speed) || !Number.isFinite(facing)) {
      return this.pose();
    }
    const rawYawRate = this.lastFacing === null ? 0 : shortestAngleDelta(this.lastFacing, facing) / deltaSeconds;
    this.lastFacing = facing;
    this.yawRate = approach(this.yawRate, rawYawRate, config.settleRatePerSecond, deltaSeconds);

    // Pitch follows the change of a lightly smoothed speed, so a launch or a stop reads as a nod.
    const previous = this.response;
    this.response = approach(this.response, speed, config.accelerationResponsePerSecond, deltaSeconds);
    const acceleration = (this.response - previous) / deltaSeconds;
    this.pitch = approach(
      this.pitch, clamp(-acceleration * config.pitchPerAcceleration, config.maxPitchRadians),
      config.settleRatePerSecond, deltaSeconds,
    );
    this.roll = approach(
      this.roll, clamp(-speed * this.yawRate * config.rollPerCornering, config.maxRollRadians),
      config.settleRatePerSecond, deltaSeconds,
    );
    this.steer = approach(
      this.steer, clamp(this.yawRate * config.steerPerYawRate, config.maxSteerRadians),
      config.settleRatePerSecond, deltaSeconds,
    );

    // The outside wheels travel further in a turn, and the two sides counter-rotate when pivoting.
    const radius = Math.max(wheels.radius, 1e-3);
    this.spinLeft = (this.spinLeft + ((speed + this.yawRate * wheels.halfTrack) / radius) * deltaSeconds) % FULL_TURN;
    this.spinRight = (this.spinRight + ((speed - this.yawRate * wheels.halfTrack) / radius) * deltaSeconds) % FULL_TURN;
    return this.pose();
  }

  public pose(): VehiclePose {
    return { spinLeft: this.spinLeft, spinRight: this.spinRight, steer: this.steer, pitch: this.pitch, roll: this.roll };
  }
}
