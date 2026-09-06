/**
 * Authoritative, renderer-independent fog of war. A player's cells progress only from hidden to
 * visible to explored, then back to visible while a living friendly entity covers them. No terrain
 * line-of-sight rule exists yet: vision uses deterministic circular distance between tile centres.
 */
import { FOG_CONFIG } from '../config/fog';
import type { FogConfig } from '../config/types';
import { isAlive, type ReadonlyEntity } from './entities';
import type { PlayerId } from './ids';
import { PLAYER_IDS } from './ids';
import type { MapGrid } from './map';
import type { World } from './world';

/** The only externally observable state of one map cell for one player. */
export type CellVisibility = 'hidden' | 'explored' | 'visible';

const HIDDEN = 0;
const EXPLORED = 1;
const VISIBLE = 2;

const VISIBILITY_BY_CODE: readonly CellVisibility[] = ['hidden', 'explored', 'visible'];

/** JSON-safe fog data stored alongside the rest of a local match snapshot. */
export interface FogSnapshot {
  readonly gridId: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** Fractional time accrued since the most recent visibility calculation. */
  readonly updateElapsedSeconds: number;
  readonly players: readonly FogPlayerSnapshot[];
}

export interface FogPlayerSnapshot {
  readonly player: PlayerId;
  /** Row-major visibility codes: hidden 0, explored 1, visible 2. */
  readonly cells: readonly number[];
}

interface PlayerFogCells {
  readonly player: PlayerId;
  readonly cells: Uint8Array;
}

/**
 * Mutable simulation state. `players` and dimensions make ownership and tile indexing explicit;
 * cell storage stays private to this module so views use the query functions below instead of
 * inventing their own visibility interpretation.
 */
export interface FogState {
  readonly gridId: string;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSizePixels: number;
  readonly players: readonly PlayerId[];
  readonly config: FogConfig;
  updateElapsedSeconds: number;
}

const cellsByState = new WeakMap<FogState, readonly PlayerFogCells[]>();

/** Creates fully hidden fog for every requested player. */
export function createFogState(
  grid: MapGrid,
  players: readonly PlayerId[] = PLAYER_IDS,
  config: FogConfig = FOG_CONFIG,
): FogState {
  assertFogConfig(config);
  const uniquePlayers = uniqueKnownPlayers(players);
  const cellCount = grid.widthTiles * grid.heightTiles;

  const fog: FogState = {
    gridId: grid.id,
    widthTiles: grid.widthTiles,
    heightTiles: grid.heightTiles,
    tileSizePixels: grid.tileSizePixels,
    players: uniquePlayers,
    config,
    updateElapsedSeconds: 0,
  };
  cellsByState.set(fog, uniquePlayers.map((player) => ({ player, cells: new Uint8Array(cellCount) })));
  return fog;
}

/**
 * Recomputes all current visibility immediately. This is deliberately separate from the cadence
 * wrapper so setup and tests can establish an initial, authoritative state without waiting a tick.
 */
export function updateFogVisibility(fog: FogState, world: World, grid: MapGrid): void {
  assertGridMatchesFog(fog, grid);

  for (const entry of entriesFor(fog)) {
    // Only cells visible on the previous update age into explored. Hidden cells never change here.
    for (let index = 0; index < entry.cells.length; index++) {
      if (entry.cells[index] === VISIBLE) entry.cells[index] = EXPLORED;
    }
  }

  for (const entity of world.entities()) {
    if (!isAlive(entity)) continue;
    const destination = cellsFor(fog, entity.owner);
    if (destination === undefined) continue;
    revealCircle(destination, grid, entity.position, entity.stats.visionRangeTiles);
  }
}

/**
 * Accumulates simulation time and updates fog no more often than the configured cadence. A long
 * frame performs one current-world calculation, retaining its fractional remainder for stability.
 */
export function stepFogVisibility(
  fog: FogState,
  world: World,
  grid: MapGrid,
  deltaSeconds: number,
): boolean {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return false;
  assertFogConfig(fog.config);
  fog.updateElapsedSeconds += deltaSeconds;
  if (fog.updateElapsedSeconds < fog.config.updateIntervalSeconds) return false;
  fog.updateElapsedSeconds %= fog.config.updateIntervalSeconds;
  updateFogVisibility(fog, world, grid);
  return true;
}

/** Visibility is hidden for unknown players and invalid/out-of-bounds/non-integer tile coordinates. */
export function cellVisibility(fog: FogState, player: PlayerId, tx: number, ty: number): CellVisibility {
  const cells = cellsFor(fog, player);
  if (
    cells === undefined ||
    !Number.isInteger(tx) ||
    !Number.isInteger(ty) ||
    tx < 0 || ty < 0 || tx >= fog.widthTiles || ty >= fog.heightTiles
  ) return 'hidden';
  return VISIBILITY_BY_CODE[cells[indexOf(fog, tx, ty)] as number] ?? 'hidden';
}

/**
 * Friendly living entities remain queryable to their owner. An enemy is queryable only when its
 * current tile is visible; fog never mutates or removes the hidden entity itself.
 */
export function isEntityVisibleToPlayer(
  fog: FogState,
  player: PlayerId,
  entity: ReadonlyEntity,
): boolean {
  if (!isAlive(entity)) return false;
  if (entity.owner === player) return cellsFor(fog, player) !== undefined;
  const tx = Math.floor(entity.position.x / fog.tileSizePixels);
  const ty = Math.floor(entity.position.y / fog.tileSizePixels);
  return cellVisibility(fog, player, tx, ty) === 'visible';
}

/** Produces a defensive JSON snapshot; callers cannot mutate live typed-array storage through it. */
export function serializeFogState(fog: FogState): FogSnapshot {
  return {
    gridId: fog.gridId,
    widthTiles: fog.widthTiles,
    heightTiles: fog.heightTiles,
    updateElapsedSeconds: fog.updateElapsedSeconds,
    players: entriesFor(fog).map((entry) => ({ player: entry.player, cells: Array.from(entry.cells) })),
  };
}

/** Restores fog only when its grid dimensions, player ownership, cadence fraction, and cell codes are valid. */
export function restoreFogState(
  snapshot: FogSnapshot,
  grid: MapGrid,
  config: FogConfig = FOG_CONFIG,
): FogState {
  assertFogConfig(config);
  if (!isFogSnapshotShape(snapshot)) throw new Error('Fog snapshot has an invalid shape');
  if (snapshot.gridId !== grid.id || snapshot.widthTiles !== grid.widthTiles || snapshot.heightTiles !== grid.heightTiles) {
    throw new Error('Fog snapshot belongs to a different map grid');
  }
  if (
    !Number.isFinite(snapshot.updateElapsedSeconds) ||
    snapshot.updateElapsedSeconds < 0 ||
    snapshot.updateElapsedSeconds >= config.updateIntervalSeconds
  ) {
    throw new Error('Fog snapshot has an invalid update remainder');
  }

  const players = uniqueKnownPlayers(snapshot.players.map((entry) => entry.player));
  if (players.length !== snapshot.players.length) throw new Error('Fog snapshot contains duplicate players');
  const fog = createFogState(grid, players, config);
  fog.updateElapsedSeconds = snapshot.updateElapsedSeconds;
  const expectedLength = grid.widthTiles * grid.heightTiles;
  for (const entry of snapshot.players) {
    if (entry.cells.length !== expectedLength || entry.cells.some((cell) => !isVisibilityCode(cell))) {
      throw new Error('Fog snapshot has invalid cell data');
    }
    const destination = cellsFor(fog, entry.player);
    if (destination === undefined) throw new Error('Fog snapshot has an unknown player');
    destination.set(entry.cells);
  }
  return fog;
}

/** Cheap JSON shape guard used before deep restoration; it deliberately never throws. */
export function isFogSnapshotShape(raw: unknown): raw is FogSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.gridId === 'string' &&
    typeof candidate.widthTiles === 'number' &&
    typeof candidate.heightTiles === 'number' &&
    typeof candidate.updateElapsedSeconds === 'number' &&
    Array.isArray(candidate.players) &&
    candidate.players.every(isFogPlayerSnapshotShell)
  );
}

function revealCircle(cells: Uint8Array, grid: MapGrid, position: { readonly x: number; readonly y: number }, radiusTiles: number): void {
  if (!Number.isFinite(radiusTiles) || radiusTiles < 0) return;
  const source = grid.worldToTile(position);
  if (!grid.isInBounds(source.tx, source.ty)) return;
  const radiusCeiling = Math.ceil(radiusTiles);
  const radiusSquared = radiusTiles ** 2;
  for (let ty = Math.max(0, source.ty - radiusCeiling); ty <= Math.min(grid.heightTiles - 1, source.ty + radiusCeiling); ty++) {
    const dy = ty - source.ty;
    for (let tx = Math.max(0, source.tx - radiusCeiling); tx <= Math.min(grid.widthTiles - 1, source.tx + radiusCeiling); tx++) {
      const dx = tx - source.tx;
      if (dx * dx + dy * dy <= radiusSquared) cells[ty * grid.widthTiles + tx] = VISIBLE;
    }
  }
}

function cellsFor(fog: FogState, player: PlayerId): Uint8Array | undefined {
  return entriesFor(fog).find((entry) => entry.player === player)?.cells;
}

function entriesFor(fog: FogState): readonly PlayerFogCells[] {
  const entries = cellsByState.get(fog);
  if (entries === undefined) throw new Error('Fog state was not created by createFogState');
  return entries;
}

function indexOf(fog: FogState, tx: number, ty: number): number {
  return ty * fog.widthTiles + tx;
}

function uniqueKnownPlayers(players: readonly PlayerId[]): readonly PlayerId[] {
  const unique: PlayerId[] = [];
  for (const player of players) {
    if (!PLAYER_IDS.includes(player)) throw new Error(`Unknown fog player "${player}"`);
    if (!unique.includes(player)) unique.push(player);
  }
  return unique;
}

function assertFogConfig(config: FogConfig): void {
  if (!Number.isFinite(config.updateIntervalSeconds) || config.updateIntervalSeconds <= 0) {
    throw new Error(`Fog update interval must be positive and finite, got ${config.updateIntervalSeconds}`);
  }
  if (config.radiusShape !== 'circle') throw new Error(`Unknown fog radius shape "${config.radiusShape}"`);
}

function assertGridMatchesFog(fog: FogState, grid: MapGrid): void {
  if (fog.gridId !== grid.id || fog.widthTiles !== grid.widthTiles || fog.heightTiles !== grid.heightTiles) {
    throw new Error('Fog state does not match this map grid');
  }
}

function isVisibilityCode(value: number): boolean {
  return Number.isInteger(value) && value >= HIDDEN && value <= VISIBLE;
}

function isFogPlayerSnapshotShell(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.player === 'string' && Array.isArray(candidate.cells);
}
