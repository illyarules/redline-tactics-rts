import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { MapGrid } from '../core/map';
import { FIELD_TONES, GAS_FIELD_TONES } from './palette';

/**
 * The battlefield's surface, painted once into a texture.
 *
 * Terrain color and the worn road are baked once from map data, beneath a quiet grid and small
 * deterministic surface details. Raised scenery is handled separately by `MapView`.
 *
 * Every value comes from a hash of the tile position, so the same map always paints the same field.
 * This is a visual projection only; `MapGrid` remains authoritative for passability.
 */

/** Texels per tile. Enough to stay soft at the closest zoom without a large texture. */
const TEXELS_PER_TILE = 24;
/** Kept well inside what a browser will allocate for a single 2D canvas. */
const MAX_TEXTURE_SIZE = 2048;

const TILE_TINT_ALPHA = 0.05;
const GRID_LINE_ALPHA = 0.04;
const BLOTCHES_PER_TILE = 0.55;

/** Deterministic value in [0, 1) from a tile position and a layer number. */
function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x165667b1, 0x27d4eb2f) ^ Math.imul(y + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(salt + 0x1b873593, 0x2545f491);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

function rgba(hex: number, alpha: number): string {
  return `rgba(${(hex >> 16) & 0xff}, ${(hex >> 8) & 0xff}, ${hex & 0xff}, ${alpha})`;
}

/** Paints the ground for `grid`. The caller owns the returned texture. */
// eslint-disable-next-line complexity -- Ground painting maps each authoritative terrain case to a fixed visual treatment.
export function createGroundTexture(scene: Scene, grid: MapGrid): DynamicTexture {
  const size = Math.min(grid.widthTiles * TEXELS_PER_TILE, MAX_TEXTURE_SIZE);
  const texture = new DynamicTexture(`ground:${grid.id}`, { width: size, height: size }, scene, true);
  const context = texture.getContext();
  const tile = size / grid.widthTiles;

  context.fillStyle = rgba(FIELD_TONES.ground, 1);
  context.fillRect(0, 0, size, size);

  for (let ty = 0; ty < grid.heightTiles; ty++) {
    for (let tx = 0; tx < grid.widthTiles; tx++) {
      const shade = hash01(tx, ty, 1);
      context.fillStyle = rgba(
        shade > 0.5 ? FIELD_TONES.groundLight : FIELD_TONES.groundDark,
        TILE_TINT_ALPHA * Math.abs(shade - 0.5) * 2,
      );
      context.fillRect(tx * tile, ty * tile, tile, tile);

      const terrain = grid.terrainAt(tx, ty);
      if (terrain === 'forest') {
        context.fillStyle = rgba(FIELD_TONES.forestFloor, 0.48);
        context.fillRect(tx * tile, ty * tile, tile, tile);
      } else if (terrain === 'rock') {
        context.fillStyle = rgba(FIELD_TONES.mountainGround, 0.9);
        context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
  }

  // Gas-bearing soil follows the existing resource-field footprint. Several offset translucent
  // discs soften its edge so it reads as stained earth rather than a painted game marker.
  for (const field of grid.resourceFields) {
    const cx = (field.center.tx + 0.5) * tile;
    const cy = (field.center.ty + 0.5) * tile;
    const radius = (field.radiusTiles + 0.45) * tile;
    const gradient = context.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
    gradient.addColorStop(0, rgba(GAS_FIELD_TONES.soil, 0.94));
    gradient.addColorStop(0.72, rgba(GAS_FIELD_TONES.soil, 0.88));
    gradient.addColorStop(1, rgba(GAS_FIELD_TONES.soilEdge, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    for (let blotch = 0; blotch < 9; blotch++) {
      const angle = hash01(field.center.tx, field.center.ty, 40 + blotch) * Math.PI * 2;
      const distance = radius * (0.42 + hash01(field.center.ty, field.center.tx, 60 + blotch) * 0.42);
      context.fillStyle = rgba(GAS_FIELD_TONES.soil, 0.22);
      context.beginPath();
      context.arc(
        cx + Math.cos(angle) * distance,
        cy + Math.sin(angle) * distance,
        radius * (0.18 + hash01(blotch, field.center.tx, 80) * 0.12),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  // Paint every configured route. Each route is extended to the closest distinct start at either
  // end, so multi-start maps display all of their approaches rather than only the first lane.
  const starts = [...grid.starts];
  if (grid.lanes.length > 0 && starts.length >= 2) {
    const mainRoutes = grid.lanes.map((lane) => {
      const first = lane.waypoints[0];
      const last = lane.waypoints[lane.waypoints.length - 1];
      if (first === undefined || last === undefined) return [...lane.waypoints];
      const byDistance = (point: { tx: number; ty: number }) => starts.slice().sort((a, b) =>
        Math.hypot(a.rallyPoint.tx - point.tx, a.rallyPoint.ty - point.ty) -
        Math.hypot(b.rallyPoint.tx - point.tx, b.rallyPoint.ty - point.ty));
      const start = byDistance(first)[0];
      const end = byDistance(last).find((candidate) => candidate !== start) ?? byDistance(last)[0];
      return [start?.rallyPoint, ...lane.waypoints, end?.rallyPoint]
        .filter((point): point is { tx: number; ty: number } => point !== undefined);
    });
    const lanePoints = grid.lanes.flatMap((lane) => lane.waypoints);
    const branches = grid.resourceFields.map((field) => {
      const nearest = lanePoints.reduce((best, point) => {
        const distance = Math.hypot(point.tx - field.center.tx, point.ty - field.center.ty);
        const bestDistance = Math.hypot(best.tx - field.center.tx, best.ty - field.center.ty);
        return distance < bestDistance ? point : best;
      });
      return [field.center, nearest];
    });

    for (const points of [...mainRoutes, ...branches]) {
      context.strokeStyle = rgba(FIELD_TONES.roadEdge, 0.4);
      context.lineWidth = tile * 1.58;
      context.beginPath();
      points.forEach((point, index) => {
        const x = (point.tx + 0.5) * tile;
        const y = (point.ty + 0.5) * tile;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      context.strokeStyle = rgba(FIELD_TONES.road, 0.58);
      context.lineWidth = tile * 1.18;
      context.stroke();
    }
  }

  // Soft blotches at free positions: what stops the tint above from reading as a checkerboard.
  const blotches = Math.round(grid.widthTiles * grid.heightTiles * BLOTCHES_PER_TILE);
  for (let i = 0; i < blotches; i++) {
    const x = hash01(i, 0, 2) * size;
    const y = hash01(i, 1, 3) * size;
    const radius = tile * (0.6 + hash01(i, 2, 4) * 2.2);
    const light = hash01(i, 3, 5) > 0.45;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(light ? FIELD_TONES.groundLight : FIELD_TONES.groundDark, 0.3));
    gradient.addColorStop(1, rgba(light ? FIELD_TONES.groundLight : FIELD_TONES.groundDark, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // A faint grid, so distances on the field can still be judged by eye.
  context.strokeStyle = rgba(FIELD_TONES.groundDark, GRID_LINE_ALPHA);
  context.lineWidth = 1;
  for (let i = 0; i <= grid.widthTiles; i++) {
    context.beginPath();
    context.moveTo(i * tile, 0);
    context.lineTo(i * tile, size);
    context.moveTo(0, i * tile);
    context.lineTo(size, i * tile);
    context.stroke();
  }

  // Sparse grass strokes and pebbles are paint only: the map remains passable.
  for (let i = 0; i < 11000; i++) {
    const x = hash01(i, 4, 10) * size;
    const y = hash01(i, 5, 11) * size;
    context.strokeStyle = rgba(i % 3 ? 0x9b9d69 : 0x34452d, 0.22);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x - 2, y - 3); context.lineTo(x, y);
    context.lineTo(x + 2, y - 4); context.stroke();
    if (i % 19 === 0) {
      context.fillStyle = rgba(0xa4a58c, 0.3);
      context.fillRect(x, y, 2.5, 1.5);
    }
  }
  texture.update();
  return texture;
}
