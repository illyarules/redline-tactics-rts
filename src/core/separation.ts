/**
 * Local separation: nudges moving units apart when their bodies overlap too much, so a group does
 * not stack permanently while travelling or arriving.
 *
 * This only perturbs `position`. It never touches `order`, `status` or a route's waypoint index, so
 * `stepMovement` keeps driving waypoint progress from wherever a unit's position ends up, unaware
 * this ran at all. No physics engine and no global solver: each pair of nearby same-owner moving
 * units either pushes apart a little this frame or does not, and brief overlap in a dense cluster is
 * an accepted tradeoff, not a bug.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { SEPARATION_CONFIG } from '../config/separation';
import type { SeparationConfig } from '../config/types';
import { isAlive, type ReadonlyUnit } from './entities';
import type { Vec2 } from './geometry';
import type { MapGrid } from './map';
import { isUnderBuilding } from './matchSetup';
import type { World } from './world';

/**
 * Pushes each same-owner pair of moving, overlapping units apart by a little, clamped to a maximum
 * speed per unit. Iterates `world.units()` in its existing order with a plain nested loop, so results
 * are deterministic; an exact overlap (zero distance) is broken by comparing entity ids instead of
 * dividing by zero. A resulting position that would land out of bounds, on blocked terrain or under a
 * building is discarded for that unit this step, leaving its current position untouched.
 */
// eslint-disable-next-line complexity -- Separation retains pairwise deterministic collision resolution in one pass.
export function stepSeparation(
  world: World,
  grid: MapGrid,
  deltaSeconds: number,
  config: SeparationConfig = SEPARATION_CONFIG,
): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return;
  }
  const units = world.units();
  const maxDisplacementWorldUnits = config.maxSeparationTilesPerSecond * grid.tileSizePixels * deltaSeconds;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as ReadonlyUnit;
    if (unit.status !== 'moving' || !isAlive(unit)) {
      continue;
    }

    let pushX = 0;
    let pushY = 0;
    for (let j = 0; j < units.length; j++) {
      if (i === j) {
        continue;
      }
      const other = units[j] as ReadonlyUnit;
      if (other.status !== 'moving' || !isAlive(other) || other.owner !== unit.owner) {
        continue;
      }

      const minDistanceWorldUnits =
        ((unit.stats.bodySizeTiles + other.stats.bodySizeTiles) / 2 + config.separationPaddingTiles) *
        grid.tileSizePixels;
      let dx = unit.position.x - other.position.x;
      let dy = unit.position.y - other.position.y;
      let dist = Math.hypot(dx, dy);
      if (dist >= minDistanceWorldUnits) {
        continue;
      }

      if (dist < 1e-9) {
        // Exact overlap has no direction to push along; break the tie deterministically by id.
        dx = unit.id < other.id ? 1 : -1;
        dy = 0;
        dist = 1;
      }

      const overlap = minDistanceWorldUnits - dist;
      pushX += (dx / dist) * overlap;
      pushY += (dy / dist) * overlap;
    }

    if (pushX === 0 && pushY === 0) {
      continue;
    }
    const pushMagnitude = Math.hypot(pushX, pushY);
    const clampedMagnitude = Math.min(pushMagnitude, maxDisplacementWorldUnits);
    if (clampedMagnitude <= 0) {
      continue;
    }

    const scale = clampedMagnitude / pushMagnitude;
    const candidate: Vec2 = {
      x: unit.position.x + pushX * scale,
      y: unit.position.y + pushY * scale,
    };
    if (isValidSeparationPosition(world, grid, candidate)) {
      world.setPosition(unit.id, candidate);
    }
  }
}

function isValidSeparationPosition(world: World, grid: MapGrid, position: Vec2): boolean {
  const tile = grid.worldToTile(position);
  return grid.isInBounds(tile.tx, tile.ty) && grid.isPassable(tile.tx, tile.ty) && !isUnderBuilding(world, tile);
}
