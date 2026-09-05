/**
 * The two original factions. Both use identical rules; only these multipliers differ, and they are
 * applied in exactly one place (`core/factionStats.ts`).
 */
import type { FactionId } from '../core/ids';
import type { FactionConfig } from './types';

export const FACTION_CONFIG: Readonly<Record<FactionId, FactionConfig>> = {
  meridian: {
    id: 'meridian',
    name: 'Meridian Directorate',
    blurb: 'Disciplined and durable, but everything costs more.',
    modifiers: {
      unitHealth: 1.1,
      unitCost: 1.1,
      unitBuildTime: 1,
      unitSpeed: 1,
    },
  },
  ember: {
    id: 'ember',
    name: 'Ember Collective',
    blurb: 'Quick to build and quick to move, easy to break.',
    modifiers: {
      unitHealth: 0.92,
      unitCost: 1,
      unitBuildTime: 0.85,
      unitSpeed: 1.08,
    },
  },
};
