/**
 * Stable identifiers shared between core state, config records and rendered views.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */

/** Identifies a single unit or building instance for its whole lifetime. */
export type EntityId = string;

/** Every independently simulated owner that may appear on a battlefield. */
export type PlayerId = 'player' | 'ai' | 'ai2';
export type AiPlayerId = Exclude<PlayerId, 'player'>;

/** Everything on the map belongs to a player or to nobody (resource fields, terrain). */
export type OwnerId = PlayerId | 'neutral';

/** The two original factions. */
export type FactionId = 'meridian' | 'ember';

/** The five mobile unit roles. */
export type UnitTypeId = 'worker' | 'infantry' | 'fpvOperators' | 'tank' | 'rocket';

/** The six building roles. */
export type BuildingTypeId = 'hq' | 'barracks' | 'factory' | 'powerPlant' | 'resourceDepot' | 'unmannedSystemsCenter';

/** Any placeable/producible entity kind. */
export type EntityTypeId = UnitTypeId | BuildingTypeId;

/** The participants on the original 1v1 map. Kept stable for existing map-level consumers. */
export const PLAYER_IDS: readonly PlayerId[] = ['player', 'ai'];
export const ALL_PLAYER_IDS: readonly PlayerId[] = ['player', 'ai', 'ai2'];
export const AI_PLAYER_IDS: readonly AiPlayerId[] = ['ai', 'ai2'];
export const FACTION_IDS: readonly FactionId[] = ['meridian', 'ember'];
export const UNIT_TYPE_IDS: readonly UnitTypeId[] = ['worker', 'infantry', 'fpvOperators', 'tank', 'rocket'];
export const BUILDING_TYPE_IDS: readonly BuildingTypeId[] = [
  'hq',
  'barracks',
  'factory',
  'powerPlant',
  'resourceDepot',
  'unmannedSystemsCenter',
];

/** Creates sequential entity ids. One counter per world keeps ids stable and predictable. */
export function createEntityIdFactory(prefix = 'e'): () => EntityId {
  let next = 1;
  return () => `${prefix}${next++}`;
}
