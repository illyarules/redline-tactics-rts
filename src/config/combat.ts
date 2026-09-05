/** Damage multipliers per attacker type against each armor category. */
import type { CombatBehaviorConfig, DamageTable } from './types';

export const DAMAGE_TABLE: DamageTable = {
  infantry: { light: 1.2, armored: 0.6, structure: 0.7 },
  tank: { light: 0.9, armored: 1.3, structure: 1.4 },
  rocket: { light: 0.8, armored: 1.5, structure: 1.2 },
};

/** Target-search policy only; it never changes weapon legality, range, damage, or cooldowns. */
export const COMBAT_BEHAVIOR_CONFIG: CombatBehaviorConfig = {
  targetScanIntervalSeconds: 0.25,
  acquisitionRangeTiles: 7,
};
