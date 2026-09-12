/**
 * The map grid: turns typed `MapConfig` data into queryable terrain.
 *
 * This is the only place that answers "what is on this tile?" and "is this tile passable?", and it
 * also owns tile <-> world conversion so no other module needs the tile size.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type {
  MapConfig,
  MapLaneConfig,
  ResourceFieldConfig,
  StartLocationConfig,
  TerrainType,
} from '../config/types';
import type { PlayerId } from './ids';
import { pointToTile, type Rect, type TileCoord, type Vec2 } from './geometry';

/** A resource field with its tiles resolved from the configured centre and radius. */
export interface ResourceField extends ResourceFieldConfig {
  readonly tiles: readonly TileCoord[];
}

export interface MapGrid {
  readonly id: string;
  readonly name: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSizePixels: number;
  /** Map bounds in world pixels — the camera and the renderer use this, not the tile count. */
  readonly bounds: Rect;
  readonly resourceFields: readonly ResourceField[];
  readonly starts: readonly StartLocationConfig[];
  readonly lanes: readonly MapLaneConfig[];

  isInBounds(tx: number, ty: number): boolean;
  /** Terrain of a tile, or `undefined` outside the map. */
  terrainAt(tx: number, ty: number): TerrainType | undefined;
  /** True for in-bounds ground and forest. Out-of-bounds, rock and water are blocked. */
  isPassable(tx: number, ty: number): boolean;
  /** World position of the centre of a tile. */
  tileCenter(tx: number, ty: number): Vec2;
  /** Tile containing a world position; may be outside the map. */
  worldToTile(point: Vec2): TileCoord;
  startFor(player: PlayerId): StartLocationConfig | undefined;
  laneById(id: string): MapLaneConfig | undefined;
}

const TERRAIN_CODES: readonly TerrainType[] = ['ground', 'forest', 'rock', 'water'];

function codeOf(terrain: TerrainType): number {
  return TERRAIN_CODES.indexOf(terrain);
}

/** Tiles of a resource field: the disc of tiles whose centre is within the configured radius. */
export function resourceFieldTiles(field: ResourceFieldConfig): TileCoord[] {
  const radius = field.radiusTiles;
  const tiles: TileCoord[] = [];
  for (let ty = field.center.ty - radius; ty <= field.center.ty + radius; ty++) {
    for (let tx = field.center.tx - radius; tx <= field.center.tx + radius; tx++) {
      const dx = tx - field.center.tx;
      const dy = ty - field.center.ty;
      if (Math.hypot(dx, dy) <= radius) {
        tiles.push({ tx, ty });
      }
    }
  }
  return tiles;
}

/** Builds the grid for a map. Deterministic: the same config always produces the same terrain. */
export function createMapGrid(config: MapConfig): MapGrid {
  const { widthTiles, heightTiles, tileSizePixels } = config;
  const terrain = new Uint8Array(widthTiles * heightTiles).fill(codeOf('ground'));

  const index = (tx: number, ty: number): number => ty * widthTiles + tx;
  const inBounds = (tx: number, ty: number): boolean =>
    Number.isInteger(tx) &&
    Number.isInteger(ty) &&
    tx >= 0 &&
    ty >= 0 &&
    tx < widthTiles &&
    ty < heightTiles;

  for (const region of config.regions) {
    const code = codeOf(region.terrain);
    const { tx, ty, width, height } = region.area;
    for (let y = ty; y < ty + height; y++) {
      for (let x = tx; x < tx + width; x++) {
        // eslint-disable-next-line max-depth -- Region rasterization requires a cell guard inside both loops.
        if (inBounds(x, y)) {
          terrain[index(x, y)] = code;
        }
      }
    }
  }

  const resourceFields: readonly ResourceField[] = config.resourceFields.map((field) => ({
    ...field,
    tiles: resourceFieldTiles(field),
  }));

  return {
    id: config.id,
    name: config.name,
    widthTiles,
    heightTiles,
    tileSizePixels,
    bounds: {
      x: 0,
      y: 0,
      width: widthTiles * tileSizePixels,
      height: heightTiles * tileSizePixels,
    },
    resourceFields,
    starts: config.starts,
    lanes: config.lanes,

    isInBounds: inBounds,

    terrainAt(tx, ty) {
      if (!inBounds(tx, ty)) {
        return undefined;
      }
      return TERRAIN_CODES[terrain[index(tx, ty)] as number];
    },

    isPassable(tx, ty) {
      if (!inBounds(tx, ty)) return false;
      const kind = TERRAIN_CODES[terrain[index(tx, ty)] as number];
      return kind === 'ground' || kind === 'forest';
    },

    tileCenter(tx, ty) {
      return { x: (tx + 0.5) * tileSizePixels, y: (ty + 0.5) * tileSizePixels };
    },

    worldToTile(point) {
      return pointToTile(point, tileSizePixels);
    },

    startFor(player) {
      return config.starts.find((start) => start.player === player);
    },

    laneById(id) {
      return config.lanes.find((lane) => lane.id === id);
    },
  };
}
