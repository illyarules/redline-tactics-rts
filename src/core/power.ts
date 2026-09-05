/**
 * The binary power rule: a player either has power or does not, decided by whether at least one
 * completed Power Plant of theirs is still standing.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { isCompleted } from './prerequisites';
import type { PlayerId } from './ids';
import type { World } from './world';

/** True when `player` has at least one completed, living Power Plant. */
export function isPowerAvailable(world: World, player: PlayerId): boolean {
  return world.buildings(player).some((building) => building.type === 'powerPlant' && isCompleted(building));
}

/** Whether a building of `player`'s currently produces, accounting for the binary power rule. */
export function isProductionActive(world: World, player: PlayerId, requiresPower: boolean): boolean {
  return !requiresPower || isPowerAvailable(world, player);
}
