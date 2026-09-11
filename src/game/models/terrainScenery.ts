import type { TileCoord } from '../../core/geometry';
import type { MapGrid } from '../../core/map';

export interface TreeScenery {
  readonly kind: 'tree';
  readonly tx: number;
  readonly ty: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly height: number;
  readonly width: number;
  readonly turn: number;
}

export interface MountainScenery {
  readonly kind: 'mountain';
  readonly tx: number;
  readonly ty: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly height: number;
  readonly width: number;
  readonly turn: number;
}

export type TerrainScenery = TreeScenery | MountainScenery;

export interface TerrainSceneryChunk {
  readonly id: string;
  readonly visibilityTiles: readonly TileCoord[];
  readonly items: readonly TerrainScenery[];
}

const CHUNK_TILES = 8;

/** Stable pseudo-random value in [0, 1), based solely on map coordinates and a layer salt. */
function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x165667b1, 0x27d4eb2f) ^ Math.imul(y + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(salt + 0x1b873593, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/**
 * Produces deterministic, sparse low-poly scenery positions from authoritative terrain cells.
 * Chunks bound draw calls and let raised scenery follow fog without creating one mesh per object.
 */
export function generateTerrainSceneryLayout(grid: MapGrid): readonly TerrainSceneryChunk[] {
  const chunks = new Map<string, { visibilityTiles: TileCoord[]; items: TerrainScenery[] }>();

  for (let ty = 0; ty < grid.heightTiles; ty++) {
    for (let tx = 0; tx < grid.widthTiles; tx++) {
      const terrain = grid.terrainAt(tx, ty);
      if (terrain !== 'forest' && terrain !== 'rock') continue;

      const chunkX = Math.floor(tx / CHUNK_TILES);
      const chunkY = Math.floor(ty / CHUNK_TILES);
      const id = `${chunkX}:${chunkY}`;
      let chunk = chunks.get(id);
      if (chunk === undefined) {
        chunk = { visibilityTiles: [], items: [] };
        chunks.set(id, chunk);
      }
      chunk.visibilityTiles.push({ tx, ty });

      const density = terrain === 'forest' ? 0.24 : 0.34;
      if (hash01(tx, ty, 1) >= density) continue;
      chunk.items.push({
        kind: terrain === 'forest' ? 'tree' : 'mountain',
        tx,
        ty,
        offsetX: (hash01(tx, ty, 2) - 0.5) * 0.58,
        offsetY: (hash01(tx, ty, 3) - 0.5) * 0.58,
        height: terrain === 'forest'
          ? 1.35 + hash01(tx, ty, 4) * 0.75
          : 1.25 + hash01(tx, ty, 4) * 1.1,
        width: terrain === 'forest'
          ? 0.66 + hash01(tx, ty, 5) * 0.32
          : 2.05 + hash01(tx, ty, 5) * 1.05,
        turn: hash01(tx, ty, 6) * Math.PI * 2,
      });
    }
  }

  return [...chunks.entries()]
    .filter(([, chunk]) => chunk.items.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, chunk]) => ({ id, ...chunk }));
}
