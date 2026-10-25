import type { CombatEffectsConfig } from './types';

/**
 * All cosmetic combat timings, geometry and bounded pool sizes.  Kept out of `core/` so tuning a
 * flash cannot affect a legal target, cooldown, damage value or persisted match state.
 */
export const COMBAT_EFFECTS_CONFIG: CombatEffectsConfig = {
  // Enough for a 20-unit volley, with small headroom for staggered rocket travel, while remaining
  // a firm upper bound in a long battle.
  projectilePoolCapacity: 96,
  muzzlePoolCapacity: 64,
  impactPoolCapacity: 64,
  targetFlashPoolCapacity: 24,
  deathPoolCapacity: 16,
  smokePoolCapacity: 160,
  rocket: {
    arcHeightShare: 0.2,
    maxArcHeightTiles: 1.1,
    launchOffsetTiles: 0.22,
    flameLengthTiles: 0.34,
    glowColor: 0xffe28a,
    smokeIntervalSeconds: 0.025,
    smokeLifetimeSeconds: 0.6,
    smokeStartDiameterTiles: 0.1,
    smokeEndDiameterTiles: 0.34,
    smokeRiseTiles: 0.12,
    smokePeakVisibility: 0.6,
    smokeColor: 0xd5d0c6,
    smokeDarkColor: 0x69655e,
    launchSmokeCount: 4,
    launchSmokeDiameterTiles: 0.26,
    launchSmokeEndDiameterTiles: 0.75,
    impactSmokeCount: 3,
    impactSmokeDiameterTiles: 0.45,
    impactSmokeEndDiameterTiles: 1.2,
    impactSmokeRiseTiles: 0.7,
    impactSmokeLifetimeSeconds: 1.1,
  },
  targetFlashDurationSeconds: 0.14,
  unitFlashDiameterTiles: 0.82,
  buildingFlashDiameterTiles: 1.65,
  deathDurationSeconds: 0.55,
  lowPolySides: 8,
  debrisPerImpact: 3,
  visual: {
    metallicImpactColor: 0xd8e5ee,
    targetFlashColor: 0xffe4b1,
    deathColor: 0xff765c,
    muzzleAlpha: 0.95,
    impactFlashAlpha: 0.95,
    projectileAlpha: 0.98,
    trailAlpha: 0.72,
    debrisAlpha: 0.82,
    debrisVisibility: 0.9,
    targetFlashAlpha: 0.25,
    muzzleOffsetDiameterFraction: 0.55,
    projectileArrivalFade: 0.2,
    impactGroundHeightTiles: 0.1,
    impactGrowthAtEnd: 0.8,
    ringGrowthAtEnd: 1,
    ringVisibility: 0.8,
    ringAlpha: 0.58,
    ringThicknessTiles: 0.08,
    unitFlashHeightTiles: 0.35,
    buildingFlashHeightTiles: 0.42,
    targetFlashDiameterMultiplier: 0.55,
    targetFlashVisibility: 0.75,
    deathHeightTiles: 0.08,
    deathDiameterTiles: 0.8,
    deathThicknessTiles: 0.07,
    deathVisibility: 0.9,
    deathGrowthAtEnd: 1.8,
    debrisAngleSeedPerSlot: 0.71,
    debrisVerticalBase: 0.7,
    debrisVerticalStep: 0.12,
  },
  weapons: {
    infantry: {
      // A thin, quick tracer from a compact directional flash at the rifle, aimed at chest height
      // on the squads' short, toy-scale soldiers.
      projectileDurationSeconds: 0.07,
      projectileHeightTiles: 0.32,
      projectileLengthTiles: 0.3,
      projectileWidthTiles: 0.016,
      muzzleDurationSeconds: 0.05,
      muzzleDiameterTiles: 0.085,
      muzzleLengthMultiplier: 2.6,
      burst: { count: 3, intervalSeconds: 0.04, spreadTiles: 0.07 },
      impactDurationSeconds: 0.13,
      impactDiameterTiles: 0.17,
      debrisDiameterTiles: 0.034,
      debrisTravelTiles: 0.12,
      ringDiameterTiles: 0,
      projectileColor: 0xffc46c,
      trailColor: 0xff8658,
      impactColor: 0xffdd9a,
    },
    fpvOperators: {
      projectileDurationSeconds: 0.48,
      projectileHeightTiles: 0.74,
      projectileLengthTiles: 0.44,
      projectileWidthTiles: 0.12,
      muzzleDurationSeconds: 0.09,
      muzzleDiameterTiles: 0.28,
      impactDurationSeconds: 0.46,
      impactDiameterTiles: 0.72,
      debrisDiameterTiles: 0.11,
      debrisTravelTiles: 0.58,
      ringDiameterTiles: 1.15,
      projectileColor: 0x090b0d,
      trailColor: 0x31383c,
      impactColor: 0xff8e6b,
    },
    combatBuggy: {
      projectileDurationSeconds: 0.1,
      projectileHeightTiles: 0.4,
      projectileLengthTiles: 0.5,
      projectileWidthTiles: 0.05,
      muzzleDurationSeconds: 0.06,
      muzzleDiameterTiles: 0.2,
      burst: { count: 5, intervalSeconds: 0.035, spreadTiles: 0.08 },
      impactDurationSeconds: 0.18,
      impactDiameterTiles: 0.26,
      debrisDiameterTiles: 0.05,
      debrisTravelTiles: 0.2,
      ringDiameterTiles: 0,
      projectileColor: 0x9bf2e6,
      trailColor: 0x3fc4b4,
      impactColor: 0xc4fff5,
    },
    tank: {
      projectileDurationSeconds: 0.23,
      projectileHeightTiles: 0.64,
      projectileLengthTiles: 0.34,
      projectileWidthTiles: 0.13,
      muzzleDurationSeconds: 0.11,
      muzzleDiameterTiles: 0.38,
      impactDurationSeconds: 0.3,
      impactDiameterTiles: 0.52,
      debrisDiameterTiles: 0.085,
      debrisTravelTiles: 0.42,
      ringDiameterTiles: 0,
      projectileColor: 0xffefb2,
      trailColor: 0xff9b62,
      impactColor: 0xffbd75,
    },
    rocket: {
      // projectileColor is the missile body; trailColor the exhaust flame, ring and sparks.
      projectileDurationSeconds: 0.75,
      projectileHeightTiles: 0.5,
      projectileLengthTiles: 0.32,
      projectileWidthTiles: 0.07,
      muzzleDurationSeconds: 0.16,
      muzzleDiameterTiles: 0.36,
      muzzleLengthMultiplier: 1.8,
      impactDurationSeconds: 0.6,
      impactDiameterTiles: 1,
      debrisDiameterTiles: 0.12,
      debrisTravelTiles: 0.75,
      ringDiameterTiles: 1.5,
      projectileColor: 0xe9e6dc,
      trailColor: 0xff8a3c,
      impactColor: 0xffa24a,
    },
  },
};

/** Narrow runtime validation used by tests and by the view before it constructs a scene pool. */
// eslint-disable-next-line complexity -- Validation mirrors the complete persisted configuration shape.
export function isValidCombatEffectsConfig(config: CombatEffectsConfig): boolean {
  const positiveInteger = (value: number) => Number.isInteger(value) && value > 0;
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const color = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffff;
  if (
    !positiveInteger(config.projectilePoolCapacity) ||
    !positiveInteger(config.muzzlePoolCapacity) ||
    !positiveInteger(config.impactPoolCapacity) ||
    !positiveInteger(config.targetFlashPoolCapacity) ||
    !positiveInteger(config.deathPoolCapacity) ||
    !positiveInteger(config.smokePoolCapacity) ||
    !isValidRocketEffect(config.rocket) ||
    !positive(config.targetFlashDurationSeconds) ||
    !positive(config.unitFlashDiameterTiles) ||
    !positive(config.buildingFlashDiameterTiles) ||
    !positive(config.deathDurationSeconds) ||
    !positiveInteger(config.lowPolySides) ||
    !positiveInteger(config.debrisPerImpact)
  ) return false;

  const visual = config.visual;
  if (
    !color(visual.metallicImpactColor) || !color(visual.targetFlashColor) || !color(visual.deathColor) ||
    ![
      visual.muzzleAlpha, visual.impactFlashAlpha, visual.projectileAlpha, visual.trailAlpha, visual.debrisAlpha,
      visual.debrisVisibility,
      visual.targetFlashAlpha, visual.projectileArrivalFade,
      visual.ringVisibility, visual.ringAlpha, visual.targetFlashVisibility, visual.deathVisibility,
    ].every((value) => Number.isFinite(value) && value > 0 && value <= 1) ||
    ![
      visual.muzzleOffsetDiameterFraction, visual.impactGrowthAtEnd, visual.ringGrowthAtEnd,
      visual.targetFlashDiameterMultiplier, visual.deathGrowthAtEnd, visual.debrisAngleSeedPerSlot,
      visual.debrisVerticalBase, visual.debrisVerticalStep,
    ].every(positive) ||
    ![
      visual.impactGroundHeightTiles, visual.ringThicknessTiles, visual.unitFlashHeightTiles,
      visual.buildingFlashHeightTiles, visual.deathHeightTiles, visual.deathDiameterTiles,
      visual.deathThicknessTiles,
    ].every(positive)
  ) return false;

  // eslint-disable-next-line complexity -- Each weapon field is independently required by the render effect.
  return (['infantry', 'fpvOperators', 'combatBuggy', 'tank', 'rocket'] as const).every((id) => {
    const weapon = config.weapons[id];
    return weapon !== undefined &&
      positive(weapon.projectileDurationSeconds) &&
      positive(weapon.projectileHeightTiles) &&
      positive(weapon.projectileLengthTiles) &&
      positive(weapon.projectileWidthTiles) &&
      positive(weapon.muzzleDurationSeconds) &&
      positive(weapon.muzzleDiameterTiles) &&
      (weapon.muzzleLengthMultiplier === undefined || (Number.isFinite(weapon.muzzleLengthMultiplier) && weapon.muzzleLengthMultiplier >= 1)) &&
      (weapon.burst === undefined || (
        Number.isInteger(weapon.burst.count) && weapon.burst.count >= 1 &&
        positive(weapon.burst.intervalSeconds) && positive(weapon.burst.spreadTiles))) &&
      positive(weapon.impactDurationSeconds) &&
      positive(weapon.impactDiameterTiles) &&
      positive(weapon.debrisDiameterTiles) &&
      positive(weapon.debrisTravelTiles) &&
      Number.isFinite(weapon.ringDiameterTiles) && weapon.ringDiameterTiles >= 0 &&
      color(weapon.projectileColor) && color(weapon.trailColor) && color(weapon.impactColor);
  });
}

function isValidRocketEffect(rocket: CombatEffectsConfig['rocket']): boolean {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  const count = (value: number) => Number.isInteger(value) && value >= 0;
  const color = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xffffff;
  return [
    rocket.arcHeightShare, rocket.maxArcHeightTiles, rocket.launchOffsetTiles, rocket.flameLengthTiles,
    rocket.smokeIntervalSeconds, rocket.smokeLifetimeSeconds, rocket.smokeStartDiameterTiles,
    rocket.smokeEndDiameterTiles, rocket.smokeRiseTiles, rocket.launchSmokeDiameterTiles,
    rocket.launchSmokeEndDiameterTiles, rocket.impactSmokeDiameterTiles, rocket.impactSmokeEndDiameterTiles,
    rocket.impactSmokeRiseTiles, rocket.impactSmokeLifetimeSeconds,
  ].every(positive) &&
    positive(rocket.smokePeakVisibility) && rocket.smokePeakVisibility <= 1 &&
    count(rocket.launchSmokeCount) && count(rocket.impactSmokeCount) &&
    color(rocket.glowColor) && color(rocket.smokeColor) && color(rocket.smokeDarkColor);
}
