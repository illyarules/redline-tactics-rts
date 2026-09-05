import type { CrystalFieldConfig } from './types';

/** Small numbers on purpose: a field reads as a cluster of deposits, not a crystal forest. */
export const CRYSTAL_FIELD_CONFIG: CrystalFieldConfig = {
  // A deposit is a dense cluster of individual crystals, matching the map concept.
  tileStride: 1,
  oreBedDiameterTiles: 1.35,
  glowPoolDiameterTiles: 0.72,
  // The reference has crystal facets, not surrounding rubble.
  rockChance: 0,
  fragmentChance: 0,
  // Short diamond-like gems remain legible without turning into a forest of blue needles.
  shardHeightTiles: { min: 0.3, max: 0.76 },
  shardDiameterTiles: { min: 0.23, max: 0.46 },
  // The widest ring is a little below the midpoint, like a cut gem rooted in the ground.
  lowerBandShare: 0.46,
  jitterTiles: 0.22,
  maxTiltRadians: 0.13,
};
