import { AI_CONFIG } from '../config/ai';
import { BUILDING_CONFIG } from '../config/buildings';
import type { TileCoord } from './geometry';
import { tileRectContains } from './geometry';
import type { BuildingTypeId, FactionId, PlayerId } from './ids';
import type { MapGrid, ResourceField } from './map';
import { checkBuildingPlacement } from './placement';
import type { World } from './world';

export type AiPlacement = { readonly kind: 'placement'; readonly topLeft: TileCoord } | { readonly kind: 'no-placement' };

/** Bounded square rings, with stable row/column ties. Depot candidates prefer the supplied field. */
// eslint-disable-next-line complexity -- Candidate selection evaluates each build location constraint independently.
export function planAiPlacement(
  world: World, grid: MapGrid, _owner: PlayerId, _faction: FactionId,
  buildingType: BuildingTypeId, anchor: TileCoord,
  radius = AI_CONFIG.placementRadiusTiles, field?: ResourceField,
): AiPlacement {
  const candidates: TileCoord[] = [];
  if (!Number.isInteger(radius) || radius < 0) return { kind: 'no-placement' };
  for (let r = 0; r <= radius; r++) {
    for (let ty = anchor.ty - r; ty <= anchor.ty + r; ty++) {
      for (let tx = anchor.tx - r; tx <= anchor.tx + r; tx++) {
        // eslint-disable-next-line max-depth -- Ring traversal needs the candidate check within both coordinate loops.
        if (Math.max(Math.abs(tx - anchor.tx), Math.abs(ty - anchor.ty)) === r) candidates.push({ tx, ty });
      }
    }
  }
  const footprint = BUILDING_CONFIG[buildingType].footprint;
  if (buildingType === 'resourceDepot' && field !== undefined) {
    const distance = (tile: TileCoord): number =>
      Math.hypot(tile.tx + footprint.width / 2 - field.center.tx, tile.ty + footprint.height / 2 - field.center.ty);
    candidates.sort((a, b) => distance(a) - distance(b));
  }
  for (const topLeft of candidates) {
    if (!checkBuildingPlacement(world, grid, buildingType, topLeft).valid) continue;
    const rect = { ...topLeft, ...footprint };
    if (grid.resourceFields.some((resource) => resource.tiles.some((tile) => tileRectContains(rect, tile)))) continue;
    return { kind: 'placement', topLeft };
  }
  return { kind: 'no-placement' };
}
