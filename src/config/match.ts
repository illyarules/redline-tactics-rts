/**
 * How a match starts. Every participant begins with one Worker and must produce combat units through
 * the normal economy and technology chain.
 */
import type { MatchRulesConfig, MatchSetupConfig } from './types';

export const MATCH_CONFIG: MatchRulesConfig = {
  matchDurationSeconds: 900,
};

export const MATCH_SETUP: MatchSetupConfig = {
  startingUnits: [{ type: 'worker', count: 1 }],
  factions: { player: 'meridian', ai: 'ember', ai2: 'ember' },
};
