/**
 * Deterministic opening and military strategy; all actions use normal gameplay APIs.
 */
import type { AiConfig } from './types';

export const AI_CONFIG: AiConfig = {
  productionCycle: ['infantry', 'tank', 'rocket', 'fpvOperators'],
  targetArmyUnits: 9,
  commandArrivalRadiusTiles: 2,
  buildOrder: ['barracks', 'powerPlant', 'factory', 'resourceDepot', 'unmannedSystemsCenter'],
  placementRadiusTiles: 12,
  // Current home fields are about 11-14 tiles from HQ; eight extra tiles avoid redundant depots.
  resourceDepotMinimumDistanceTiles: 22,
  decisionIntervalSeconds: 1,
  minimumAttackArmyUnits: 3,
  criticalArmyUnits: 1,
  baseThreatRadiusTiles: 8,
  maximumDefenders: 4,
  defenderSelectionRadiusTiles: 32,
  defenderPriority: 'distanceThenId',
  recoveryBuildOrder: ['barracks', 'powerPlant', 'factory'],
  essentialBuildingTypes: ['hq'],
  minimumViableBuildingTypes: ['hq', 'barracks', 'powerPlant', 'factory'],
};
