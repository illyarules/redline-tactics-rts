/**
 * "Open Field" — the single fixed 64 x 64 battlefield, expressed entirely as data.
 *
 * The asymmetric environment keeps both starting economies equally viable: the southwest forest
 * is passable, the northern rock regions overlap into one connected blocking ridge, and the broad
 * central approach remains open. Rendering derives its forest, mountains and roads from this data.
 */
import type { MapConfig } from './types';

export const MAP_CONFIG: MapConfig = {
  id: 'open-field',
  name: 'Open Field',
  widthTiles: 64,
  heightTiles: 64,
  tileSizePixels: 30,

  regions: [
    // Sparse, passable southwest woodland, south of the player base and west resource field.
    { terrain: 'forest', area: { tx: 3, ty: 45, width: 18, height: 15 } },
    { terrain: 'forest', area: { tx: 8, ty: 41, width: 12, height: 6 } },
    { terrain: 'forest', area: { tx: 19, ty: 49, width: 7, height: 12 } },
    { terrain: 'forest', area: { tx: 5, ty: 58, width: 22, height: 4 } },

    // Every rock rectangle overlaps the next, producing one continuous irregular northern ridge.
    { terrain: 'rock', area: { tx: 2, ty: 4, width: 10, height: 5 } },
    { terrain: 'rock', area: { tx: 10, ty: 2, width: 11, height: 7 } },
    { terrain: 'rock', area: { tx: 19, ty: 4, width: 10, height: 5 } },
    { terrain: 'rock', area: { tx: 27, ty: 2, width: 11, height: 7 } },
    { terrain: 'rock', area: { tx: 36, ty: 1, width: 10, height: 8 } },
    { terrain: 'rock', area: { tx: 44, ty: 3, width: 10, height: 6 } },
    { terrain: 'rock', area: { tx: 52, ty: 2, width: 10, height: 7 } },
  ],

  resourceFields: [
    { id: 'west-home', center: { tx: 18, ty: 26 }, radiusTiles: 3, credits: 5000, contested: false, homeFor: 'player' },
    { id: 'east-home', center: { tx: 45, ty: 37 }, radiusTiles: 3, credits: 5000, contested: false, homeFor: 'ai' },
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

  // Ground rendering uses this route for the worn central road and derives branches to the bases
  // and resource fields from the other map data.
  lanes: [
    {
      id: 'central',
      name: 'Central approach',
      waypoints: [
        { tx: 16, ty: 32 },
        { tx: 24, ty: 34 },
        { tx: 32, ty: 33 },
        { tx: 40, ty: 32 },
        { tx: 47, ty: 32 },
      ],
    },
  ],
};

/** A larger three-start battlefield with three dry-land corridors through a rugged basin. */
export const TRIDENT_BASIN_CONFIG: MapConfig = {
  id: 'trident-basin',
  name: 'Trident Basin',
  widthTiles: 80,
  heightTiles: 80,
  tileSizePixels: 30,
  regions: [
    // Forest pockets and broken rock ridges distinguish the three approaches while keeping every
    // visible stretch of grass traversable. There are no hidden water barriers on this map.
    { terrain: 'forest', area: { tx: 11, ty: 7, width: 15, height: 9 } },
    { terrain: 'forest', area: { tx: 7, ty: 35, width: 13, height: 12 } },
    { terrain: 'forest', area: { tx: 52, ty: 8, width: 9, height: 9 } },
    { terrain: 'forest', area: { tx: 52, ty: 57, width: 10, height: 10 } },
    { terrain: 'forest', area: { tx: 25, ty: 58, width: 12, height: 11 } },
    { terrain: 'rock', area: { tx: 23, ty: 17, width: 10, height: 4 } },
    { terrain: 'rock', area: { tx: 49, ty: 17, width: 10, height: 4 } },
    { terrain: 'rock', area: { tx: 20, ty: 46, width: 12, height: 4 } },
    { terrain: 'rock', area: { tx: 50, ty: 46, width: 11, height: 4 } },
    { terrain: 'rock', area: { tx: 34, ty: 57, width: 4, height: 12 } },
    // Narrow rock interruptions make the outer paths tactically distinct without sealing them.
    { terrain: 'rock', area: { tx: 29, ty: 4, width: 4, height: 8 } },
    { terrain: 'rock', area: { tx: 50, ty: 67, width: 4, height: 8 } },
  ],
  resourceFields: [
    { id: 'player-home', center: { tx: 17, ty: 65 }, radiusTiles: 3, credits: 5000, contested: false, homeFor: 'player' },
    { id: 'north-ai-home', center: { tx: 62, ty: 15 }, radiusTiles: 3, credits: 5000, contested: false, homeFor: 'ai' },
    { id: 'south-ai-home', center: { tx: 62, ty: 65 }, radiusTiles: 3, credits: 5000, contested: false, homeFor: 'ai2' },
    { id: 'central-west', center: { tx: 29, ty: 39 }, radiusTiles: 2, credits: 5000, contested: true },
  ],
  starts: [
    { player: 'player', baseArea: { tx: 2, ty: 58, width: 14, height: 18 }, hqTopLeft: { tx: 5, ty: 67 }, rallyPoint: { tx: 14, ty: 68 } },
    { player: 'ai', baseArea: { tx: 64, ty: 4, width: 14, height: 18 }, hqTopLeft: { tx: 70, ty: 8 }, rallyPoint: { tx: 66, ty: 12 } },
    { player: 'ai2', baseArea: { tx: 64, ty: 58, width: 14, height: 18 }, hqTopLeft: { tx: 70, ty: 68 }, rallyPoint: { tx: 66, ty: 68 } },
  ],
  lanes: [
    { id: 'north-route', name: 'Northern crossing', waypoints: [{ tx: 16, ty: 60 }, { tx: 26, ty: 42 }, { tx: 33, ty: 26 }, { tx: 51, ty: 23 }, { tx: 65, ty: 14 }] },
    { id: 'south-route', name: 'Southern crossing', waypoints: [{ tx: 16, ty: 67 }, { tx: 29, ty: 61 }, { tx: 41, ty: 55 }, { tx: 53, ty: 61 }, { tx: 66, ty: 68 }] },
    { id: 'central-route', name: 'Central basin', waypoints: [{ tx: 18, ty: 58 }, { tx: 29, ty: 39 }, { tx: 41, ty: 35 }, { tx: 52, ty: 39 }, { tx: 63, ty: 45 }] },
  ],
};

export const MAP_CONFIGS: readonly MapConfig[] = [MAP_CONFIG, TRIDENT_BASIN_CONFIG];

export function mapConfigById(id: string): MapConfig | undefined {
  return MAP_CONFIGS.find((map) => map.id === id);
}
