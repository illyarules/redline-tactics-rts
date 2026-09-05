/**
 * "Open Field" — the single fixed 64 x 64 battlefield, expressed entirely as data.
 *
 * Everything about the map lives here: bounds, terrain, the two starts, the two resource fields and
 * the central approach. No other module may hard-code map constants.
 *
 * The layout is 180-degree rotationally symmetric: tile (tx, ty) mirrors (63 - tx, 63 - ty), so both
 * starts are equally far from every field and from the middle. Keep any edit symmetric — a case in
 * `tests/map.test.ts` checks it.
 *
 * Shape of the battlefield:
 *
 * - No blocking terrain at all: every tile in bounds is passable ground, and only the map edges
 *   stop a unit. `regions` stays empty on purpose.
 * - The two bases sit against the west and east edges at the same height, facing each other.
 * - One home resource field sits just outside each base, on the side facing the middle.
 * - The twenty tile-wide band between the two fields is left completely empty, so the centre of the
 *   map is open ground both sides have to cross.
 */
import type { MapConfig } from './types';

export const MAP_CONFIG: MapConfig = {
  id: 'open-field',
  name: 'Open Field',
  widthTiles: 64,
  heightTiles: 64,
  // Rendered size of a tile. Purely presentational — every balance value is in tiles or tiles per
  // second — but it sets how much room a unit's art has, so it is not smaller than it needs to be.
  tileSizePixels: 30,

  // An open field has no obstacles. Terrain regions exist in the type for later maps; this one
  // paints none, which leaves the whole grid as passable ground.
  regions: [],

  resourceFields: [
    {
      id: 'west-home',
      center: { tx: 18, ty: 26 },
      radiusTiles: 3,
      credits: 3000,
      contested: false,
    },
    {
      id: 'east-home',
      center: { tx: 45, ty: 37 },
      radiusTiles: 3,
      credits: 3000,
      contested: false,
    },
  ],

  starts: [
    {
      player: 'player',
      baseArea: { tx: 1, ty: 24, width: 14, height: 16 },
      hqTopLeft: { tx: 4, ty: 30 },
      rallyPoint: { tx: 13, ty: 32 },
    },
    {
      player: 'ai',
      baseArea: { tx: 49, ty: 24, width: 14, height: 16 },
      hqTopLeft: { tx: 56, ty: 30 },
      rallyPoint: { tx: 50, ty: 31 },
    },
  ],

  // One straight route across the empty middle, listed from the player's edge to the AI's edge.
  // With nothing to path around there is only one approach worth naming.
  lanes: [
    {
      id: 'central',
      name: 'Central approach',
      waypoints: [
        { tx: 16, ty: 32 },
        { tx: 24, ty: 32 },
        { tx: 32, ty: 32 },
        { tx: 40, ty: 32 },
        { tx: 47, ty: 32 },
      ],
    },
  ],
};
