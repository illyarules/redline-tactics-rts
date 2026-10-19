import type { VehicleDustProfile, VehicleEffectsConfig } from './types';

/**
 * Tunable cosmetics for vehicle dust, turret aim, recoil, destruction and wrecks. Nothing here
 * reaches `core/`: it cannot change a legal target, a movement rule, damage, or a save.
 */
export const VEHICLE_EFFECTS_CONFIG: VehicleEffectsConfig = {
  dust: {
    poolCapacity: 96,
    lowPolySides: 6,
    maxFrameDisplacementTiles: 1.5,
    speedWindowSeconds: 0.12,
    maxEmitsPerFrame: 2,
    profiles: {
      // Heavy and slow: big, long-lived puffs that hang behind the tracks.
      tank: {
        intervalSeconds: 0.1, minSpeedTilesPerSecond: 0.25, lifetimeSeconds: 1.15,
        startDiameterTiles: 0.3, endDiameterTiles: 0.95, riseTiles: 0.32, driftBackTiles: 0.5,
        scatterShare: 0.35, peakVisibility: 0.6, rearOffsetTiles: 0.4, halfTrackTiles: 0.3, color: 0xb9a888,
      },
      // Light and quick: small puffs thrown far back, gone fast.
      combatBuggy: {
        intervalSeconds: 0.06, minSpeedTilesPerSecond: 0.25, lifetimeSeconds: 0.7,
        startDiameterTiles: 0.18, endDiameterTiles: 0.55, riseTiles: 0.22, driftBackTiles: 0.95,
        scatterShare: 0.3, peakVisibility: 0.5, rearOffsetTiles: 0.34, halfTrackTiles: 0.25, color: 0xc2b293,
      },
      worker: {
        intervalSeconds: 0.16, minSpeedTilesPerSecond: 0.25, lifetimeSeconds: 0.6,
        startDiameterTiles: 0.12, endDiameterTiles: 0.36, riseTiles: 0.16, driftBackTiles: 0.45,
        scatterShare: 0.3, peakVisibility: 0.3, rearOffsetTiles: 0.27, halfTrackTiles: 0.2, color: 0xc2b293,
      },
      rocket: {
        intervalSeconds: 0.13, minSpeedTilesPerSecond: 0.25, lifetimeSeconds: 0.75,
        startDiameterTiles: 0.16, endDiameterTiles: 0.48, riseTiles: 0.2, driftBackTiles: 0.5,
        scatterShare: 0.3, peakVisibility: 0.34, rearOffsetTiles: 0.34, halfTrackTiles: 0.24, color: 0xbcac8d,
      },
    },
  },
  turrets: {
    tank: {
      maxTurnRadiansPerSecond: 2.4, recoilDistanceTiles: 0.11, recoilKickSeconds: 0.05,
      recoilRecoverSeconds: 0.4, fallbackMuzzleLengthTiles: 0.45,
    },
    combatBuggy: {
      maxTurnRadiansPerSecond: 4.2, recoilDistanceTiles: 0.05, recoilKickSeconds: 0.035,
      recoilRecoverSeconds: 0.2, fallbackMuzzleLengthTiles: 0.3,
    },
  },
  shotAimHoldSeconds: 1.2,
  destruction: {
    poolCapacity: 5,
    referenceSizeTiles: 0.86,
    minScale: 0.8,
    maxScale: 1.4,
    sparkCount: 6,
    fragmentCount: 5,
    fireCount: 4,
    smokeCount: 6,
    flash: { durationSeconds: 0.2, diameterTiles: 0.9, growth: 1.7, color: 0xfff0c0 },
    shockwave: {
      durationSeconds: 0.55, diameterTiles: 0.5, endDiameterTiles: 2.6, thicknessTiles: 0.07,
      visibility: 0.75, color: 0xffcf8a,
    },
    sparks: {
      durationSeconds: 0.5, speedTilesPerSecond: 3.4, gravityTilesPerSecondSquared: 7,
      diameterTiles: 0.06, color: 0xffd36a,
    },
    fragments: {
      durationSeconds: 1.3, speedTilesPerSecond: 2.6, gravityTilesPerSecondSquared: 9,
      sizeTiles: 0.11, spinRadiansPerSecond: 9, fadeShare: 0.3, color: 0x2a2d2f,
    },
    fire: {
      durationSeconds: 0.95, riseTiles: 0.55, diameterTiles: 0.55, spreadTiles: 0.22,
      peakVisibility: 0.9, colors: [0xff7a2e, 0xffc24a],
    },
    smoke: {
      startDelaySeconds: 0.12, durationSeconds: 2.6, riseTiles: 1.5, driftTiles: 0.45,
      startDiameterTiles: 0.45, endDiameterTiles: 1.5, peakVisibility: 0.6, color: 0x2b2c2e,
    },
  },
  wreck: {
    capacity: 6,
    holdSeconds: 6,
    fadeSeconds: 1.8,
    scorchFactor: 0.16,
    tiltRadians: 0.07,
    turretTwistRadians: 0.5,
  },
};

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;
const positiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;
const share = (value: number): boolean => Number.isFinite(value) && value > 0 && value <= 1;
const color = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffffff;

function validDust(profile: VehicleDustProfile): boolean {
  return [
    profile.intervalSeconds, profile.minSpeedTilesPerSecond, profile.lifetimeSeconds,
    profile.startDiameterTiles, profile.endDiameterTiles, profile.riseTiles, profile.driftBackTiles,
    profile.rearOffsetTiles, profile.halfTrackTiles,
  ].every(finitePositive) &&
    Number.isFinite(profile.scatterShare) && profile.scatterShare >= 0 &&
    share(profile.peakVisibility) && color(profile.color);
}

/** Runtime check used by the views before they allocate any scene object. */
// eslint-disable-next-line complexity -- Validation mirrors the complete configuration shape.
export function isValidVehicleEffectsConfig(config: VehicleEffectsConfig): boolean {
  const { dust, turrets, destruction: d, wreck } = config;
  if (
    !positiveInteger(dust.poolCapacity) || !positiveInteger(dust.lowPolySides) ||
    !positiveInteger(dust.maxEmitsPerFrame) || !finitePositive(dust.maxFrameDisplacementTiles) || !finitePositive(dust.speedWindowSeconds) ||
    !(['worker', 'combatBuggy', 'tank', 'rocket'] as const).every((id) => validDust(dust.profiles[id]))
  ) return false;
  if (!(['tank', 'combatBuggy'] as const).every((id) => {
    const turret = turrets[id];
    return [
      turret.maxTurnRadiansPerSecond, turret.recoilDistanceTiles, turret.recoilKickSeconds,
      turret.recoilRecoverSeconds, turret.fallbackMuzzleLengthTiles,
    ].every(finitePositive);
  }) || !finitePositive(config.shotAimHoldSeconds)) return false;

  if (
    ![d.poolCapacity, d.sparkCount, d.fragmentCount, d.fireCount, d.smokeCount].every(positiveInteger) ||
    ![d.referenceSizeTiles, d.minScale, d.maxScale].every(finitePositive) || d.minScale > d.maxScale ||
    ![
      d.flash.durationSeconds, d.flash.diameterTiles, d.flash.growth,
      d.shockwave.durationSeconds, d.shockwave.diameterTiles, d.shockwave.endDiameterTiles, d.shockwave.thicknessTiles,
      d.sparks.durationSeconds, d.sparks.speedTilesPerSecond, d.sparks.gravityTilesPerSecondSquared, d.sparks.diameterTiles,
      d.fragments.durationSeconds, d.fragments.speedTilesPerSecond, d.fragments.gravityTilesPerSecondSquared,
      d.fragments.sizeTiles, d.fragments.spinRadiansPerSecond,
      d.fire.durationSeconds, d.fire.riseTiles, d.fire.diameterTiles, d.fire.spreadTiles,
      d.smoke.durationSeconds, d.smoke.riseTiles, d.smoke.driftTiles, d.smoke.startDiameterTiles, d.smoke.endDiameterTiles,
    ].every(finitePositive) ||
    !Number.isFinite(d.smoke.startDelaySeconds) || d.smoke.startDelaySeconds < 0 ||
    ![d.shockwave.visibility, d.fragments.fadeShare, d.fire.peakVisibility, d.smoke.peakVisibility].every(share) ||
    ![
      d.flash.color, d.shockwave.color, d.sparks.color, d.fragments.color, d.smoke.color,
      d.fire.colors[0], d.fire.colors[1],
    ].every(color)
  ) return false;

  return positiveInteger(wreck.capacity) &&
    [wreck.holdSeconds, wreck.fadeSeconds, wreck.tiltRadians, wreck.turretTwistRadians].every(finitePositive) &&
    share(wreck.scorchFactor);
}
