/**
 * How a match starts. Both players get the same opening, so neither side is favoured.
 * Provisional values, tuned in a later balance task.
 *
 * The opening squad holds one of each mobile role so all four silhouettes are on the field from the
 * first frame. They are placed and drawn only — selection, orders, economy and combat arrive in
 * later tasks.
 */
import type { MatchSetupConfig } from './types';

export const MATCH_SETUP: MatchSetupConfig = {
  startingUnits: [
    { type: 'worker', count: 1 },
    { type: 'infantry', count: 1 },
    { type: 'tank', count: 1 },
    { type: 'rocket', count: 1 },
  ],
  factions: { player: 'meridian', ai: 'ember' },
};
