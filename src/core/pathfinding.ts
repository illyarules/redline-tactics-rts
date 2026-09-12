/**
 * Deterministic grid A* pathfinding over the map's static terrain plus building footprints.
 *
 * Positions here are tiles, not pixels: callers convert to and from world space themselves (see
 * `core/map.ts`'s `tileCenter`/`worldToTile`). A tile is walkable when the grid reports it passable
 * and the caller's `isBlocked` predicate does not veto it — normally "is a building standing here" —
 * so this module never has to know what a building is.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { PATHFINDING_CONFIG } from '../config/pathfinding';
import type { TileCoord } from './geometry';
import type { MapGrid } from './map';
import { nearbyFreeTiles } from './matchSetup';

/** Vetoes tiles a grid alone cannot know about, such as a building's footprint. */
export type TileBlockedPredicate = (tile: TileCoord) => boolean;

const NEVER_BLOCKED: TileBlockedPredicate = () => false;

export interface PathFound {
  readonly found: true;
  /** Every tile from `start` to `goal`, inclusive, in travel order. */
  readonly tiles: readonly TileCoord[];
}

export interface PathNotFound {
  readonly found: false;
}

export type PathResult = PathFound | PathNotFound;

export interface RoutePlanFound {
  readonly found: true;
  /** `target`'s own tile, or the nearest reachable tile to it when `target` itself was blocked. */
  readonly resolvedTarget: TileCoord;
  /** Tiles from just after `start` through `resolvedTarget`, inclusive. Empty when already there. */
  readonly tiles: readonly TileCoord[];
}

export type RoutePlanResult = RoutePlanFound | PathNotFound;

/** Clockwise from north. Diagonal entries carry the longer octile step cost. */
const NEIGHBOR_OFFSETS: readonly { readonly dx: number; readonly dy: number; readonly cost: number }[] = [
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: 1, dy: 0, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.tx === b.tx && a.ty === b.ty;
}

/** Admissible octile-distance estimate matching the neighbor costs above. */
function heuristic(a: TileCoord, b: TileCoord): number {
  const dx = Math.abs(a.tx - b.tx);
  const dy = Math.abs(a.ty - b.ty);
  const diagonal = Math.min(dx, dy);
  return diagonal * Math.SQRT2 + (Math.max(dx, dy) - diagonal);
}

interface OpenNode {
  readonly tile: TileCoord;
  readonly f: number;
}

/**
 * A deterministic A* search over `grid`'s passable tiles, refusing any tile `isBlocked` vetoes.
 *
 * Neighbor order and tie-breaking are both fixed, so identical inputs always retrace the same route.
 * A diagonal step is refused unless both flanking orthogonal tiles are walkable, so a route can never
 * cut across a blocked corner. Returns an explicit no-path result rather than throwing.
 */
// eslint-disable-next-line complexity -- A* keeps all neighbor eligibility checks in its deterministic expansion loop.
export function findPath(
  grid: MapGrid,
  start: TileCoord,
  goal: TileCoord,
  isBlocked: TileBlockedPredicate = NEVER_BLOCKED,
): PathResult {
  const walkable = (tile: TileCoord): boolean => grid.isPassable(tile.tx, tile.ty) && !isBlocked(tile);
  if (!walkable(start) || !walkable(goal)) {
    return { found: false };
  }
  if (sameTile(start, goal)) {
    return { found: true, tiles: [start] };
  }

  const keyOf = (tile: TileCoord): number => tile.ty * grid.widthTiles + tile.tx;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, TileCoord>();
  const closed = new Set<number>();
  const open: OpenNode[] = [];

  gScore.set(keyOf(start), 0);
  open.push({ tile: start, f: heuristic(start, goal) });

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if ((open[i] as OpenNode).f < (open[bestIndex] as OpenNode).f) {
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0] as OpenNode;
    const currentKey = keyOf(current.tile);
    if (closed.has(currentKey)) {
      continue;
    }
    closed.add(currentKey);

    if (sameTile(current.tile, goal)) {
      return { found: true, tiles: reconstruct(cameFrom, keyOf, start, goal) };
    }

    const currentG = gScore.get(currentKey) as number;
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor: TileCoord = { tx: current.tile.tx + offset.dx, ty: current.tile.ty + offset.dy };
      if (!walkable(neighbor)) {
        continue;
      }
      if (offset.dx !== 0 && offset.dy !== 0) {
        const flankA: TileCoord = { tx: current.tile.tx + offset.dx, ty: current.tile.ty };
        const flankB: TileCoord = { tx: current.tile.tx, ty: current.tile.ty + offset.dy };
        // eslint-disable-next-line max-depth -- Corner cutting can only be checked after selecting a diagonal neighbor.
        if (!walkable(flankA) || !walkable(flankB)) {
          continue;
        }
      }

      const neighborKey = keyOf(neighbor);
      if (closed.has(neighborKey)) {
        continue;
      }
      const tentativeG = currentG + offset.cost;
      const knownG = gScore.get(neighborKey);
      if (knownG === undefined || tentativeG < knownG) {
        gScore.set(neighborKey, tentativeG);
        cameFrom.set(neighborKey, current.tile);
        open.push({ tile: neighbor, f: tentativeG + heuristic(neighbor, goal) });
      }
    }
  }

  return { found: false };
}

function reconstruct(
  cameFrom: ReadonlyMap<number, TileCoord>,
  keyOf: (tile: TileCoord) => number,
  start: TileCoord,
  goal: TileCoord,
): TileCoord[] {
  const path: TileCoord[] = [goal];
  let cursor = goal;
  while (!sameTile(cursor, start)) {
    const previous = cameFrom.get(keyOf(cursor));
    if (previous === undefined) {
      break;
    }
    path.push(previous);
    cursor = previous;
  }
  path.reverse();
  return path;
}

/**
 * The nearest walkable tile to `target`, searched ring by ring out to `searchRadiusTiles`. Returns
 * `target` itself when it is already walkable, or `null` when nothing within range qualifies.
 */
export function resolveDestination(
  grid: MapGrid,
  target: TileCoord,
  isBlocked: TileBlockedPredicate = NEVER_BLOCKED,
  searchRadiusTiles: number = PATHFINDING_CONFIG.blockedDestinationSearchRadiusTiles,
): TileCoord | null {
  const walkable = (tile: TileCoord): boolean => grid.isPassable(tile.tx, tile.ty) && !isBlocked(tile);
  if (walkable(target)) {
    return target;
  }
  return nearbyFreeTiles(grid, target, 1, walkable, searchRadiusTiles)[0] ?? null;
}

/**
 * Resolves `target` to a walkable tile if needed, then finds a route to it from `start`.
 *
 * A target with no walkable tile nearby, or one whose nearest walkable tile is itself unreachable
 * from `start` — a sealed pocket beyond the blocked area — both come back as `{ found: false }`, the
 * same explicit no-path result `findPath` uses.
 */
export function planRoute(
  grid: MapGrid,
  start: TileCoord,
  target: TileCoord,
  isBlocked: TileBlockedPredicate = NEVER_BLOCKED,
  searchRadiusTiles: number = PATHFINDING_CONFIG.blockedDestinationSearchRadiusTiles,
): RoutePlanResult {
  const resolvedTarget = resolveDestination(grid, target, isBlocked, searchRadiusTiles);
  if (resolvedTarget === null) {
    return { found: false };
  }
  const path = findPath(grid, start, resolvedTarget, isBlocked);
  if (!path.found) {
    return { found: false };
  }
  return { found: true, resolvedTarget, tiles: path.tiles.slice(1) };
}
