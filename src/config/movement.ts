import type { MovementConfig } from './types';

export const MOVEMENT_CONFIG: MovementConfig = {
  arrivalToleranceTiles: 0.08,
  maxTurnRadiansPerSecond: Math.PI * 1.5,
  fullSpeedAlignmentRadians: Math.PI / 8,
  turnInPlaceAlignmentRadians: Math.PI / 3,
};
