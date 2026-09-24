/**
 * Builds `WorldSnapshot` fixture data through the same public core contracts a real match uses to
 * save one — `core/world.ts` to create entities and `core/snapshot.ts`'s `serializeWorld` to capture
 * them — so a fixture can never drift from what the game itself considers a valid saved match.
 *
 * Test-only: nothing under `src/` imports this module. The application only ever sees the resulting
 * JSON through its normal `loadSnapshot()` / `restoreWorld()` path, exactly as if a player had saved
 * partway through an ordinary match.
 */
import { MAP_CONFIG } from '../../../src/config/map';
import type { Economy } from '../../../src/core/economy';
import { createEconomy } from '../../../src/core/economy';
import { createFogState, updateFogVisibility } from '../../../src/core/fog';
import type { EntityId, FactionId, PlayerId } from '../../../src/core/ids';
import { createMapGrid, type MapGrid } from '../../../src/core/map';
import { createResourceFieldState } from '../../../src/core/resourceFieldState';
import { serializeWorld, type WorldSnapshot } from '../../../src/core/snapshot';
import { createWorld, type World } from '../../../src/core/world';

/** The one fixed map every match (and every fixture) opens on. */
export const GRID: MapGrid = createMapGrid(MAP_CONFIG);

/** The player's real starting location, so a fixture's HQ sits exactly where a normal match's does
 * — that is what makes the ordinary opening camera frame a fixture's entities without any override. */
export const PLAYER_START = GRID.starts.find((start) => start.player === 'player')!;
export const AI_START = GRID.starts.find((start) => start.player === 'ai')!;

export const FACTION_OF: Readonly<Record<PlayerId, FactionId>> = { player: 'meridian', ai: 'ember', ai2: 'ember' };

/**
 * Builds one fixture world and serializes it. `populate` creates entities on a fresh `World` through
 * the normal `createUnit`/`createBuilding` contract and returns the ids that should already be
 * selected when the match opens (empty for none).
 */
export function buildSnapshot(
  populate: (world: World, economy: Economy, grid: MapGrid) => readonly EntityId[],
): WorldSnapshot {
  const grid = GRID;
  const world = createWorld({ tileSizePixels: grid.tileSizePixels, idPrefix: 'fx' });
  const economy = createEconomy();
  const selection = populate(world, economy, grid);

  const resourceFieldState = createResourceFieldState(grid);
  const fog = createFogState(grid);
  // Authoritative opening vision, exactly like a fresh match — see `MatchScene`'s own populate branch.
  updateFogVisibility(fog, world, grid);

  return serializeWorld(world, selection, economy, resourceFieldState, fog, grid);
}

/** Every fixture places the player's HQ on the real start footprint, completed, doing nothing. */
export function placeHomeHq(world: World): EntityId {
  return world.createBuilding({
    type: 'hq',
    owner: 'player',
    faction: FACTION_OF.player,
    topLeft: PLAYER_START.hqTopLeft,
  }).id;
}

/** Places the opposing HQ at its normal distant start so non-combat fixtures remain live. */
export function placeOpponentHq(world: World): EntityId {
  return world.createBuilding({
    type: 'hq',
    owner: 'ai',
    faction: FACTION_OF.ai,
    topLeft: AI_START.hqTopLeft,
  }).id;
}
