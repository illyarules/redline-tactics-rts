import type { SquadAnimationConfig } from './types';

/** Tuned by eye against the normal RTS camera height, not measured from anything real. */
export const SQUAD_CONFIG: SquadAnimationConfig = {
  formation: {
    // Give the three visible soldiers enough breathing room for their rifles and walk cycle to
    // read separately from the default tactical camera.
    leadOffsetTiles: 0.28,
    rearOffsetTiles: 0.24,
    rearSpreadTiles: 0.3,
  },
  walkCyclesPerSecond: 2.2,
  legSwingRadians: 0.5,
  armSwingRadians: 0.35,
  walkBobTiles: 0.035,
  soldierPhaseOffsetRadians: 0.6,
  idleCyclesPerSecond: 0.35,
  idleBobTiles: 0.012,
  idleSwayRadians: 0.05,
};
