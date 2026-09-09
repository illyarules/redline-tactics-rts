/**
 * The four deterministic scenarios the E2E suite seeds as local match snapshots. Every scenario
 * places the player's HQ on the real map start (see `snapshots.ts`'s `placeHomeHq`) and every other
 * entity at a small, fixed tile offset from the player's real rally point — so every scenario opens
 * under the exact same camera framing a normal fresh match would use (`MatchScene`'s own
 * HQ-plus-nearest-field opening focus, entirely unmodified).
 *
 * `SCREEN` holds the canvas click points that framing produces, at the suite's fixed 1440x900
 * viewport. They were derived empirically against the running app (see the project README) rather
 * than by re-deriving the renderer's perspective-camera math, and are deliberately generous — a big
 * drag rectangle for a group of units, one point comfortably inside a 4-tile HQ footprint — so small
 * drift in exactly where something renders cannot make a click land on the wrong thing. Nothing here
 * targets a single small unit directly: at this zoom a lone Infantry's clickable body is only about
 * 20 screen pixels across, too small to hit reliably from a fixed point, so any scenario that needs
 * one already selected restores that from the snapshot's own `selection` instead (see `PLAYER_START`
 * usages below).
 */
import { FACTION_OF, PLAYER_START, buildSnapshot, placeHomeHq, placeOpponentHq } from './snapshots';
import type { WorldSnapshot } from '../../../src/core/snapshot';
import { issueMoveOrders } from '../../../src/core/movement';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export const SCREEN = {
  /** Comfortably inside the HQ's 4-tile footprint. */
  hq: { x: 315, y: 490 } satisfies ScreenPoint,
  /** A rectangle generous enough to enclose every unit a scenario places near the rally point,
   * without reaching the HQ or any HUD panel. */
  groupDragFrom: { x: 650, y: 420 } satisfies ScreenPoint,
  groupDragTo: { x: 950, y: 560 } satisfies ScreenPoint,
  /** Open, unobstructed ground away from the HQ, the rally point and every HUD panel. */
  clearDestination: { x: 1150, y: 300 } satisfies ScreenPoint,
  /** Open ground clear of the HQ's footprint, valid for placing any buildable structure. */
  clearBuildSite: { x: 700, y: 250 } satisfies ScreenPoint,
  /** Centre of the low-health enemy HQ in `victoryScenario`. */
  victoryEnemyHq: { x: 923, y: 456 } satisfies ScreenPoint,
} as const;

/** Tile at the player's real rally point, offset by `(dx, dy)` tiles. */
function rallyTile(dx: number, dy: number): { readonly tx: number; readonly ty: number } {
  return { tx: PLAYER_START.rallyPoint.tx + dx, ty: PLAYER_START.rallyPoint.ty + dy };
}

/**
 * Three friendly Infantry at and east of the rally point, and a clear destination — for drag-selecting
 * a group and issuing a group Move.
 */
export function movementScenario(): WorldSnapshot {
  return buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    for (let i = 0; i < 3; i++) {
      const tile = rallyTile(i, 0);
      world.createUnit({
        type: 'infantry',
        owner: 'player',
        faction: FACTION_OF.player,
        position: grid.tileCenter(tile.tx, tile.ty),
      });
    }
    return [];
  });
}

/**
 * One friendly Infantry, already selected, and a clear destination — for the save/reload test. Pre
 * selecting it means the test never needs to click a small on-screen target before issuing the order.
 */
export function persistenceScenario(): WorldSnapshot {
  return buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    const tile = rallyTile(0, 0);
    const unit = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: FACTION_OF.player,
      position: grid.tileCenter(tile.tx, tile.ty),
    });
    return [unit.id];
  });
}

/**
 * One friendly Infantry, already selected, and one enemy Infantry three tiles away — inside
 * Infantry's 3.5-tile weapon range, so the game's own automatic targeting (`core/autoCombat.ts`)
 * engages them the instant the match opens, exactly as it would for a player who walked a squad
 * within sight of the enemy. Pre-selecting the friendly avoids needing a pixel-precise click on a
 * unit only ~20 screen pixels across at this zoom.
 */
export function combatScenario(): WorldSnapshot {
  return buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    const friendlyTile = rallyTile(0, 0);
    const enemyTile = rallyTile(3, 0);
    const friendly = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: FACTION_OF.player,
      position: grid.tileCenter(friendlyTile.tx, friendlyTile.ty),
    });
    world.createUnit({
      type: 'infantry',
      owner: 'ai',
      faction: FACTION_OF.ai,
      position: grid.tileCenter(enemyTile.tx, enemyTile.ty),
    });
    return [friendly.id];
  });
}

/**
 * One friendly Worker, already selected, standing on the rally point, plus the HQ every scenario
 * places. Starting Credits (900) comfortably cover a Barracks (300); the HQ itself can queue a Worker
 * once reselected.
 */
export function buildProductionScenario(): WorldSnapshot {
  return buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    const tile = rallyTile(0, 0);
    const worker = world.createUnit({
      type: 'worker',
      owner: 'player',
      faction: FACTION_OF.player,
      position: grid.tileCenter(tile.tx, tile.ty),
    });
    return [worker.id];
  });
}

/**
 * A selected Rocket and a visible, one-hit enemy HQ. The Rocket begins on a real Move order so
 * automatic targeting cannot win before the test issues its explicit right-click Attack command.
 */
export function victoryScenario(): WorldSnapshot {
  return buildSnapshot((world, _economy, grid) => {
    placeHomeHq(world);
    const rocketTile = rallyTile(0, 0);
    const rocket = world.createUnit({
      type: 'rocket',
      owner: 'player',
      faction: FACTION_OF.player,
      position: grid.tileCenter(rocketTile.tx, rocketTile.ty),
    });
    // Keeps the HQ visible even if a heavily loaded parallel test run lets the Rocket advance along
    // its anti-auto-acquisition Move order before Playwright can issue the real Attack click.
    world.createUnit({
      type: 'worker',
      owner: 'player',
      faction: FACTION_OF.player,
      position: grid.tileCenter(rallyTile(7, 0).tx, rallyTile(7, 0).ty),
    });
    issueMoveOrders(world, grid, 'player', [rocket.id], grid.tileCenter(rocketTile.tx - 8, rocketTile.ty));
    world.createBuilding({
      type: 'hq',
      owner: 'ai',
      faction: FACTION_OF.ai,
      topLeft: rallyTile(3, -2),
      health: 1,
    });
    return [rocket.id];
  });
}

/** A normal two-base save just before the active-time deadline, for the real Draw flow. */
export function timeoutScenario(): WorldSnapshot {
  const snapshot = buildSnapshot((world) => {
    placeHomeHq(world);
    placeOpponentHq(world);
    return [];
  });
  return {
    ...snapshot,
    lifecycle: { ...snapshot.lifecycle, elapsedActiveSeconds: 599.95 },
  };
}
