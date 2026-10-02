/**
 * The opening position: what stands on the map the moment a match begins.
 *
 * Every participant is set up from the same typed config, and tests can assert the whole opening
 * without starting the renderer.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { MATCH_SETUP } from '../config/match';
import type { MatchSetupConfig } from '../config/types';
import { footprintRect, type ReadonlyEntity } from './entities';
import { tileRectContains, type TileCoord } from './geometry';
import type { MapGrid } from './map';
import type { World } from './world';

/** How far from a rally point starting units may be pushed before setup gives up. */
const SPAWN_SEARCH_RADIUS_TILES = 12;

/**
 * Creates each player's HQ on its start footprint and its configured opening units around its rally
 * point. Returns everything created, in creation order.
 */
export function populateStartingEntities(
  world: World,
  grid: MapGrid,
  setup: MatchSetupConfig = MATCH_SETUP,
): readonly ReadonlyEntity[] {
  const created: ReadonlyEntity[] = [];

  for (const start of grid.starts) {
    const faction = setup.factions[start.player];
    if (faction === undefined) throw new Error(`Missing faction for ${start.player}`);

    created.push(
      world.createBuilding({
        type: 'hq',
        owner: start.player,
        faction,
        topLeft: start.hqTopLeft,
      }),
    );

    const wanted = setup.startingUnits.reduce((total, group) => total + group.count, 0);
    const tiles = nearbyFreeTiles(
      grid,
      start.rallyPoint,
      wanted,
      (tile) => !isUnderBuilding(world, tile),
      SPAWN_SEARCH_RADIUS_TILES,
    );

    for (const group of setup.startingUnits) {
      for (let i = 0; i < group.count; i++) {
        const tile = tiles.shift();
        // eslint-disable-next-line max-depth -- Spawn-group creation keeps the missing-tile guard at its use site.
        if (tile === undefined) {
          throw new Error(`No free tile near the ${start.player} rally point for a ${group.type}`);
        }
        created.push(
          world.createUnit({
            type: group.type,
            owner: start.player,
            faction,
            position: grid.tileCenter(tile.tx, tile.ty),
          }),
        );
      }
    }
  }

  return created;
}

/**
 * Up to `count` passable tiles closest to `origin`, searched ring by ring so the result is stable
 * and the same config always produces the same opening. Returns fewer tiles when the area is full.
 */
// eslint-disable-next-line complexity -- Ring search intentionally keeps deterministic traversal and early completion together.
export function nearbyFreeTiles(
  grid: MapGrid,
  origin: TileCoord,
  count: number,
  isFree: (tile: TileCoord) => boolean = () => true,
  maxRadiusTiles = SPAWN_SEARCH_RADIUS_TILES,
): TileCoord[] {
  const found: TileCoord[] = [];
  if (count <= 0) {
    return found;
  }

  for (let radius = 0; radius <= maxRadiusTiles; radius++) {
    for (let ty = origin.ty - radius; ty <= origin.ty + radius; ty++) {
      for (let tx = origin.tx - radius; tx <= origin.tx + radius; tx++) {
        // Only the outer ring is new; the tiles inside it were visited on an earlier pass.
        // eslint-disable-next-line max-depth -- The outer-ring check belongs inside the coordinate traversal.
        if (Math.max(Math.abs(tx - origin.tx), Math.abs(ty - origin.ty)) !== radius) {
          continue;
        }
        const tile = { tx, ty };
        // eslint-disable-next-line max-depth -- Availability depends on the tile constructed by the nested loops.
        if (grid.isPassable(tx, ty) && isFree(tile)) {
          found.push(tile);
          // eslint-disable-next-line max-depth -- The early return prevents extra, observable candidate ordering work.
          if (found.length === count) {
            return found;
          }
        }
      }
    }
  }

  return found;
}

/** True when a building's footprint already covers this tile. */
export function isUnderBuilding(world: World, tile: TileCoord): boolean {
  return world.buildings().some((building) => tileRectContains(footprintRect(building), tile));
}
