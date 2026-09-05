/**
 * The small building tech chain: which completed structures a player needs before another becomes
 * buildable.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import { isAlive, type ReadonlyBuilding } from './entities';
import type { BuildingTypeId, PlayerId } from './ids';
import type { World } from './world';

export interface PrerequisiteCheck {
  readonly allowed: boolean;
  /** Required building types the player has no completed instance of yet. */
  readonly missing: readonly BuildingTypeId[];
}

/** True once a building is alive and has finished construction (or was never under construction). */
export function isCompleted(building: ReadonlyBuilding): boolean {
  return isAlive(building) && building.constructionProgress >= 1;
}

function hasCompleted(world: World, player: PlayerId, type: BuildingTypeId): boolean {
  return world.buildings(player).some((building) => building.type === type && isCompleted(building));
}

/** Whether `player` may place a `buildingType`, and which prerequisites are still missing if not. */
export function checkPrerequisites(
  world: World,
  player: PlayerId,
  buildingType: BuildingTypeId,
): PrerequisiteCheck {
  const missing = BUILDING_CONFIG[buildingType].requires.filter(
    (required) => !hasCompleted(world, player, required),
  );
  return { allowed: missing.length === 0, missing };
}

/** The buildable building types `player` currently has every prerequisite for. */
export function availableBuildings(world: World, player: PlayerId): readonly BuildingTypeId[] {
  return (Object.keys(BUILDING_CONFIG) as BuildingTypeId[]).filter(
    (type) => BUILDING_CONFIG[type].buildable && checkPrerequisites(world, player, type).allowed,
  );
}
