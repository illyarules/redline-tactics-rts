/**
 * The state-machine shell's deliberately small set of strategic thresholds. Execution of build,
 * production, scouting and combat intents arrives in later AI tasks.
 */
import type { AiConfig } from './types';

export const AI_CONFIG: AiConfig = {
  decisionIntervalSeconds: 1,
  minimumAttackArmyUnits: 3,
  criticalArmyUnits: 1,
  baseThreatRadiusTiles: 8,
  essentialBuildingTypes: ['hq'],
  minimumViableBuildingTypes: ['hq'],
};
