/**
 * Stable identifiers shared between core state, config records and rendered views.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */

/** Identifies a single unit or building instance for its whole lifetime. */
export type EntityId = string;

/** The two competing sides of a skirmish. */
export type PlayerId = 'player' | 'ai';

/** Everything on the map belongs to a player or to nobody (resource fields, terrain). */
export type OwnerId = PlayerId | 'neutral';

/** The two original factions. */
export type FactionId = 'meridian' | 'ember';

/** The four mobile unit roles. */
export type UnitTypeId = 'worker' | 'infantry' | 'tank' | 'rocket';

/** The five building roles. */
export type BuildingTypeId = 'hq' | 'barracks' | 'factory' | 'powerPlant' | 'resourceDepot';

/** Any placeable/producible entity kind. */
export type EntityTypeId = UnitTypeId | BuildingTypeId;

export const PLAYER_IDS: readonly PlayerId[] = ['player', 'ai'];
export const FACTION_IDS: readonly FactionId[] = ['meridian', 'ember'];
export const UNIT_TYPE_IDS: readonly UnitTypeId[] = ['worker', 'infantry', 'tank', 'rocket'];
export const BUILDING_TYPE_IDS: readonly BuildingTypeId[] = [
  'hq',
  'barracks',
  'factory',
  'powerPlant',
  'resourceDepot',
];

/** Creates sequential entity ids. One counter per world keeps ids stable and predictable. */
export function createEntityIdFactory(prefix = 'e'): () => EntityId {
  let next = 1;
  return () => `${prefix}${next++}`;
}
