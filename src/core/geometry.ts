/**
 * Positions and small geometry helpers used by core rules.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */

/** A position in world units (pixels in the rendered scene). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A position on the map grid, in whole tiles. */
export interface TileCoord {
  readonly tx: number;
  readonly ty: number;
}

/** An axis-aligned rectangle in world units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A footprint size in tiles. */
export interface TileSize {
  readonly width: number;
  readonly height: number;
}

/** An axis-aligned rectangle on the map grid, in whole tiles. `tx`/`ty` are the top-left tile. */
export interface TileRect {
  readonly tx: number;
  readonly ty: number;
  readonly width: number;
  readonly height: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function tileCoord(tx: number, ty: number): TileCoord {
  return { tx, ty };
}

/** Tile containing a world position. The tile may be outside the map. */
export function pointToTile(point: Vec2, tileSizePixels: number): TileCoord {
  return {
    tx: Math.floor(point.x / tileSizePixels),
    ty: Math.floor(point.y / tileSizePixels),
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** Chebyshev distance in tiles — the number of grid steps allowing diagonals. */
export function tileDistance(a: TileCoord, b: TileCoord): number {
  return Math.max(Math.abs(b.tx - a.tx), Math.abs(b.ty - a.ty));
}

export function tilesEqual(a: TileCoord, b: TileCoord): boolean {
  return a.tx === b.tx && a.ty === b.ty;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function rectContains(rect: Rect, point: Vec2): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function tileRectContains(rect: TileRect, tile: TileCoord): boolean {
  return (
    tile.tx >= rect.tx &&
    tile.tx < rect.tx + rect.width &&
    tile.ty >= rect.ty &&
    tile.ty < rect.ty + rect.height
  );
}

/** True when two tile rectangles share any tile. */
export function tileRectsOverlap(a: TileRect, b: TileRect): boolean {
  return (
    a.tx < b.tx + b.width &&
    a.tx + a.width > b.tx &&
    a.ty < b.ty + b.height &&
    a.ty + a.height > b.ty
  );
}

/** Builds a normalized rectangle from two opposite corners (drag selection, previews). */
export function rectFromCorners(a: Vec2, b: Vec2): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}
