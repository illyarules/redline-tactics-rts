import { cellVisibility, type FogState } from './fog';
import type { Vec2 } from './geometry';
import type { PlayerId } from './ids';
import type { MapGrid, ResourceField } from './map';

/** A deposit can be inspected only where the player currently sees the field. */
export function inspectResourceField(
  grid: MapGrid,
  fog: FogState,
  player: PlayerId,
  point: Vec2,
): ResourceField | null {
  const tile = grid.worldToTile(point);
  if (cellVisibility(fog, player, tile.tx, tile.ty) !== 'visible') return null;
  return grid.resourceFields.find((field) =>
    cellVisibility(fog, player, field.center.tx, field.center.ty) === 'visible' &&
    field.tiles.some((candidate) => candidate.tx === tile.tx && candidate.ty === tile.ty),
  ) ?? null;
}
