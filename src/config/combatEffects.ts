import type { CombatEffectsConfig } from './types';

/**
 * All cosmetic combat timings, geometry and bounded pool sizes.  Kept out of `core/` so tuning a
 * flash cannot affect a legal target, cooldown, damage value or persisted match state.
 */
export const COMBAT_EFFECTS_CONFIG: CombatEffectsConfig = {
  // Enough for a 20-unit volley, with small headroom for staggered rocket travel, while remaining
  // a firm upper bound in a long battle.
  projectilePoolCapacity: 36,
  muzzlePoolCapacity: 32,
  impactPoolCapacity: 32,
  targetFlashPoolCapacity: 24,
  deathPoolCapacity: 16,
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
    rocketHeadDiameterMultiplier: 1.45,
    rocketTrailOffsetLengthMultiplier: 0.7,
    rocketTrailLengthMultiplier: 1.8,
    rocketTrailWidthMultiplier: 0.9,
    rocketTrailArrivalFade: 0.55,
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
      projectileDurationSeconds: 0.12,
      projectileHeightTiles: 0.52,
      projectileLengthTiles: 0.58,
      projectileWidthTiles: 0.035,
      muzzleDurationSeconds: 0.055,
      muzzleDiameterTiles: 0.16,
      impactDurationSeconds: 0.16,
      impactDiameterTiles: 0.22,
      debrisDiameterTiles: 0.045,
      debrisTravelTiles: 0.18,
      ringDiameterTiles: 0,
      projectileColor: 0xffc46c,
      trailColor: 0xff8658,
      impactColor: 0xffdd9a,
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
      projectileColor: 0xfff1c4,
      trailColor: 0xff704e,
      impactColor: 0xff8e6b,
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
      visual.targetFlashAlpha, visual.projectileArrivalFade, visual.rocketTrailArrivalFade,
      visual.ringVisibility, visual.ringAlpha, visual.targetFlashVisibility, visual.deathVisibility,
    ].every((value) => Number.isFinite(value) && value > 0 && value <= 1) ||
    ![
      visual.muzzleOffsetDiameterFraction, visual.rocketHeadDiameterMultiplier,
      visual.rocketTrailOffsetLengthMultiplier, visual.rocketTrailLengthMultiplier,
      visual.rocketTrailWidthMultiplier, visual.impactGrowthAtEnd, visual.ringGrowthAtEnd,
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
  return (['infantry', 'tank', 'rocket'] as const).every((id) => {
    const weapon = config.weapons[id];
    return weapon !== undefined &&
      positive(weapon.projectileDurationSeconds) &&
      positive(weapon.projectileHeightTiles) &&
      positive(weapon.projectileLengthTiles) &&
      positive(weapon.projectileWidthTiles) &&
      positive(weapon.muzzleDurationSeconds) &&
      positive(weapon.muzzleDiameterTiles) &&
      positive(weapon.impactDurationSeconds) &&
      positive(weapon.impactDiameterTiles) &&
      positive(weapon.debrisDiameterTiles) &&
      positive(weapon.debrisTravelTiles) &&
      Number.isFinite(weapon.ringDiameterTiles) && weapon.ringDiameterTiles >= 0 &&
      color(weapon.projectileColor) && color(weapon.trailColor) && color(weapon.impactColor);
  });
}
