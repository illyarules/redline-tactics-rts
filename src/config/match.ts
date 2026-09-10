/**
 * How a match starts. Both players get the same opening, so neither side is favoured.
 * Provisional values, tuned in a later balance task.
 *
 * The opening squad holds one of each mobile role so all four silhouettes and gameplay roles are
 * available from the first frame.
 */
import type { MatchRulesConfig, MatchSetupConfig } from './types';

export const MATCH_CONFIG: MatchRulesConfig = {
  matchDurationSeconds: 600,
};

export const MATCH_SETUP: MatchSetupConfig = {
  startingUnits: [
    { type: 'worker', count: 1 },
    { type: 'infantry', count: 1 },
    { type: 'tank', count: 1 },
    { type: 'rocket', count: 1 },
  ],
  factions: { player: 'meridian', ai: 'ember' },
};
