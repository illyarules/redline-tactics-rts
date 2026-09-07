/**
 * Strategic thresholds and the deterministic opening economy plan. Military production,
 * scouting and combat actions arrive in later AI tasks.
 */
import type { AiConfig } from './types';

export const AI_CONFIG: AiConfig = {
  buildOrder: ['barracks', 'powerPlant', 'factory', 'resourceDepot'],
  placementRadiusTiles: 12,
  decisionIntervalSeconds: 1,
  minimumAttackArmyUnits: 3,
  criticalArmyUnits: 1,
  baseThreatRadiusTiles: 8,
  essentialBuildingTypes: ['hq'],
  minimumViableBuildingTypes: ['hq'],
};
