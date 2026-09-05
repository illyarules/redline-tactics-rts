import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Vec2 } from '../core/geometry';
import type { MapGrid } from '../core/map';

/**
 * The one place that converts between core's world pixels and Babylon's scene units.
 *
 * Core measures the battlefield in world pixels, because that is what the balance data and the
 * camera rules were written in. A 64 x 64 map is 1920 units across in those terms, which is a poor
 * scale for a 3D scene: lights, shadow maps and near/far planes all behave better around 1. So the
 * scene is built in **tiles** — one tile is one Babylon unit — and every conversion goes through
 * here rather than each view scaling by hand.
 *
 * Orientation is chosen so the field looks the way the map data reads:
 *
 * - world `x` (east) becomes scene `x`, which is screen right;
 * - world `y` (south) becomes *decreasing* scene `z`, so north stays at the top of the screen and
 *   the camera, standing south of what it looks at, faces `+z`;
 * - scene `y` is height above the ground, which core has no concept of.
 */
export interface SceneSpace {
  /** Scene units per world pixel. One tile is one unit. */
  readonly unitsPerWorldPixel: number;
  /** Size of the map in scene units. */
  readonly widthUnits: number;
  readonly depthUnits: number;

  /** A world length — a radius, a body size — in scene units. */
  length(worldLength: number): number;
  /** A world position on the ground, or at `height` scene units above it. */
  point(position: Vec2, height?: number): Vector3;
  sceneX(worldX: number): number;
  sceneZ(worldY: number): number;
  /** Back to world pixels, for turning a picked point on the ground into something core understands. */
  toWorld(sceneX: number, sceneZ: number): Vec2;
}

export function createSceneSpace(grid: MapGrid): SceneSpace {
  const unitsPerWorldPixel = 1 / grid.tileSizePixels;
  const depthUnits = grid.bounds.height * unitsPerWorldPixel;
  const widthUnits = grid.bounds.width * unitsPerWorldPixel;
  // World `y` runs south; scene `z` runs north. Flipping around the map's own height keeps the whole
  // battlefield on positive coordinates, which makes every position easier to read while debugging.
  const sceneZ = (worldY: number): number => depthUnits - worldY * unitsPerWorldPixel;

  return {
    unitsPerWorldPixel,
    widthUnits,
    depthUnits,

    length(worldLength) {
      return worldLength * unitsPerWorldPixel;
    },

    point(position, height = 0) {
      return new Vector3(position.x * unitsPerWorldPixel, height, sceneZ(position.y));
    },

    sceneX(worldX) {
      return worldX * unitsPerWorldPixel;
    },

    sceneZ,

    toWorld(x, z) {
      return { x: x / unitsPerWorldPixel, y: (depthUnits - z) / unitsPerWorldPixel };
    },
  };
}
