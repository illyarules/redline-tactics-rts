import type { AiConfig } from '../config/types';
import type { ReadonlyBuilding } from './entities';
import type { PlayerId } from './ids';
import type { MapGrid } from './map';

/** A second drop-off pays for itself only when the home gas field is genuinely remote. */
export function shouldBuildAiResourceDepot(
  base: ReadonlyBuilding,
  grid: MapGrid,
  owner: PlayerId,
  config: AiConfig,
): boolean {
  const anchor = grid.worldToTile(base.position);
  const homeFields = grid.resourceFields.filter((field) => field.homeFor === owner);
  const candidates = homeFields.length > 0 ? homeFields : grid.resourceFields;
  if (candidates.length === 0) return false;
  const nearestDistance = Math.min(...candidates.map((field) =>
    Math.hypot(field.center.tx - anchor.tx, field.center.ty - anchor.ty)));
  return nearestDistance > config.resourceDepotMinimumDistanceTiles;
}
