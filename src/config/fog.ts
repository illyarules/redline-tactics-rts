/** Authoritative fog-of-war cadence and grid-radius policy. */
import type { FogConfig } from './types';

export const FOG_CONFIG: FogConfig = {
  // Four updates per second is responsive for RTS scouting while keeping the work out of render rate.
  updateIntervalSeconds: 0.25,
  radiusShape: 'circle',
};
