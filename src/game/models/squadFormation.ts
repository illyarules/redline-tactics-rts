/**
 * The compact, asymmetric triangle a three-soldier Infantry squad stands in around its entity's
 * position: one soldier slightly forward, two slightly behind and spread apart.
 *
 * Offsets are in the model's own local space — `+z` forward, `+x` right — so a caller only has to
 * place and rotate one root per entity; the three soldiers keep their arrangement for free as that
 * root turns to face `facingRadians`.
 *
 * Pure geometry: no Babylon import, so the shape of the formation can be tested without a scene.
 */
import type { SquadFormationConfig } from '../../config/types';

export const SQUAD_SIZE = 3;

/** One soldier's position relative to the entity root, in tiles. */
export interface SquadSlot {
  readonly rightTiles: number;
  readonly forwardTiles: number;
}

/** Slot 0 leads; slots 1 and 2 trail to its left and right. Always exactly `SQUAD_SIZE` entries. */
export function squadFormationSlots(
  config: SquadFormationConfig,
): readonly [SquadSlot, SquadSlot, SquadSlot] {
  return [
    { rightTiles: 0, forwardTiles: config.leadOffsetTiles },
    { rightTiles: -config.rearSpreadTiles, forwardTiles: -config.rearOffsetTiles },
    { rightTiles: config.rearSpreadTiles, forwardTiles: -config.rearOffsetTiles },
  ];
}
