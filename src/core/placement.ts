/**
 * Building placement validity: whether a building's full footprint could stand at a tile.
 *
 * Fog of war (`explored`) does not exist yet — that lands with the vision task — so a footprint is
 * judged only on bounds, terrain and occupancy for now; every hidden cell reads as valid ground
 * until then.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import { footprintRect } from './entities';
import { tileRectsOverlap, type TileCoord, type TileRect } from './geometry';
import type { BuildingTypeId } from './ids';
import type { MapGrid } from './map';
import type { World } from './world';

export type PlacementInvalidReason = 'out-of-bounds' | 'blocked-terrain' | 'occupied';

export interface PlacementCheck {
  readonly valid: boolean;
  readonly reasons: readonly PlacementInvalidReason[];
}

/**
 * Checks whether `buildingType`'s footprint could stand with its top-left at `topLeft`: every tile
 * in bounds, every tile passable ground, and no overlap with an existing building's footprint (which
 * a `constructing` site occupies exactly as fully as a finished one).
 */
export function checkBuildingPlacement(
  world: World,
  grid: MapGrid,
  buildingType: BuildingTypeId,
  topLeft: TileCoord,
): PlacementCheck {
  const footprint = BUILDING_CONFIG[buildingType].footprint;
  const rect: TileRect = { tx: topLeft.tx, ty: topLeft.ty, width: footprint.width, height: footprint.height };
  const reasons: PlacementInvalidReason[] = [];

  let allInBounds = true;
  let allPassable = true;
  for (let dy = 0; dy < footprint.height; dy++) {
    for (let dx = 0; dx < footprint.width; dx++) {
      const tx = topLeft.tx + dx;
      const ty = topLeft.ty + dy;
      if (!grid.isInBounds(tx, ty)) {
        allInBounds = false;
      } else if (!grid.isPassable(tx, ty)) {
        allPassable = false;
      }
    }
  }

  if (!allInBounds) {
    reasons.push('out-of-bounds');
  } else if (!allPassable) {
    reasons.push('blocked-terrain');
  }

  if (allInBounds && world.buildings().some((building) => tileRectsOverlap(rect, footprintRect(building)))) {
    reasons.push('occupied');
  }

  return { valid: reasons.length === 0, reasons };
}
