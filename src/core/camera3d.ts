/**
 * The 3D camera rig: where a perspective camera has to stand to show a given piece of the map.
 *
 * The rules the player feels — how fast the view pans, how far it may zoom, and that it never leaves
 * the map — already live in `cameraControl.ts` and are expressed in terms of a `zoom`: the number of
 * screen pixels one world pixel covers across the middle of the view. This module keeps that model
 * and adds only what perspective needs, so the camera behaves exactly as it did before the view
 * became three-dimensional.
 *
 * The link between the two is the **ground footprint**: the rectangle of map the camera covers.
 *
 * - Its width is `viewport.width / zoom`, exactly as in a flat view: the rig is only tilted around
 *   the horizontal axis, so nothing across the screen is foreshortened.
 * - Its depth is larger by a fixed factor that depends on the pitch and the field of view alone,
 *   because a tilted camera sees further into the map than it is tall.
 *
 * That lets every clamp in `cameraControl.ts` be reused unchanged, by handing it an *effective
 * viewport* whose `visibleSize` is the real ground footprint.
 *
 * The footprint is also asymmetric: the camera sees further beyond the point it aims at than in
 * front of it. So `CameraView.centerX/centerY` keeps meaning the centre of what the player sees, and
 * the point the camera aims at is offset from it — see `cameraPlacement`.
 *
 * TODO(post-MVP): the footprint is treated as a rectangle as wide as the view is at the point the
 * camera aims at. The real shape is a trapezoid whose far edge is wider, so a little ground past a
 * map edge can show at the top corners of the screen. Clamping the trapezoid exactly would lock the
 * view to the middle of the map at low zoom, which is worse; the field is drawn past its own edge
 * instead, so what shows there is never an empty void.
 *
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { CameraConfig } from '../config/types';
import {
  clampZoomToView,
  initialCameraView,
  stepCameraView,
  visibleSize,
  zoomCameraView,
  type CameraPanInput,
  type CameraView,
  type ViewportSize,
} from './cameraControl';
import { clamp, type Rect, type Vec2 } from './geometry';

/** Where the camera stands, in world pixels. Distances are the same units as `MapGrid.bounds`. */
export interface CameraPlacement {
  /** The point on the ground the camera is aimed at. Not the centre of the view — see above. */
  readonly target: Vec2;
  /** The point on the ground directly under the camera. */
  readonly eye: Vec2;
  /** How high above the ground the camera sits. */
  readonly height: number;
  /** Straight-line distance from the camera to `target`. */
  readonly distance: number;
}

/**
 * The shape of the view frustum where it meets the ground, as multiples of the frustum's height at
 * the point the camera aims at. Depends only on the two configured angles, never on zoom.
 */
export interface PerspectiveGeometry {
  /** Camera distance to its target. */
  readonly distance: number;
  /** Camera height above the ground. */
  readonly height: number;
  /** How far the footprint reaches towards the camera from its target. */
  readonly nearExtent: number;
  /** How far the footprint reaches away from the camera. Always the larger of the two. */
  readonly farExtent: number;
  /** Total depth of the footprint: `nearExtent + farExtent`. */
  readonly depth: number;
  /** How far the aim point sits from the centre of the footprint, away from the camera. */
  readonly targetOffset: number;
}

/**
 * The top of the frustum must stay below the horizon, or the camera would see an unbounded strip of
 * ground and no clamp could hold it inside the map. The field of view is narrowed if a config ever
 * asks for more; `tests/core.camera3d.test.ts` checks the shipped config never needs it.
 */
const MIN_HORIZON_MARGIN_RADIANS = (5 * Math.PI) / 180;

const DEGREES_TO_RADIANS = Math.PI / 180;

/** The configured pitch, in radians, kept strictly between looking at the horizon and straight down. */
export function pitchRadians(config: CameraConfig): number {
  return clamp(
    config.pitchDegrees * DEGREES_TO_RADIANS,
    MIN_HORIZON_MARGIN_RADIANS,
    Math.PI / 2 - 1e-6,
  );
}

/** The configured vertical field of view, in radians, narrowed if it would reach the horizon. */
export function fieldOfViewRadians(config: CameraConfig): number {
  const pitch = pitchRadians(config);
  const wanted = config.fieldOfViewDegrees * DEGREES_TO_RADIANS;
  return clamp(wanted, 1e-6, 2 * (pitch - MIN_HORIZON_MARGIN_RADIANS));
}

/**
 * The frustum's ground footprint for a camera whose frustum is `frustumHeight` tall at its target.
 * Every distance scales linearly with that height, so this is the whole of the perspective maths.
 */
export function perspectiveGeometry(
  config: CameraConfig,
  frustumHeight = 1,
): PerspectiveGeometry {
  const pitch = pitchRadians(config);
  const halfFov = fieldOfViewRadians(config) / 2;

  const distance = frustumHeight / (2 * Math.tan(halfFov));
  const height = distance * Math.sin(pitch);

  // Ground distances from the point under the camera to the target and to each frustum edge.
  const toTarget = height / Math.tan(pitch);
  const toNear = height / Math.tan(pitch + halfFov);
  const toFar = height / Math.tan(pitch - halfFov);

  const nearExtent = toTarget - toNear;
  const farExtent = toFar - toTarget;

  return {
    distance,
    height,
    nearExtent,
    farExtent,
    depth: nearExtent + farExtent,
    targetOffset: (farExtent - nearExtent) / 2,
  };
}

/** How much deeper the ground footprint is than a flat view of the same viewport would be. */
export function depthFactor(config: CameraConfig): number {
  return perspectiveGeometry(config).depth;
}

/**
 * The viewport to hand the rules in `cameraControl.ts`: the one whose `visibleSize` is the ground
 * the perspective camera actually covers. Its width is the real width; only the depth is stretched.
 */
export function effectiveViewport(viewport: ViewportSize, config: CameraConfig): ViewportSize {
  return { width: viewport.width, height: viewport.height * depthFactor(config) };
}

/** The rectangle of map on screen at this zoom, in world pixels. */
export function groundFootprint(
  viewport: ViewportSize,
  zoom: number,
  config: CameraConfig,
): ViewportSize {
  return visibleSize(effectiveViewport(viewport, config), zoom);
}

/** The opening view, clamped to the zoom range and the map like any other. */
export function initialCamera3dView(
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
  focus: Vec2 | null = null,
): CameraView {
  return initialCameraView(effectiveViewport(viewport, config), bounds, config, focus);
}

/** Advances a pan. Edge panning measures its margin against the real viewport, not the effective one. */
export function stepCamera3dView(
  view: CameraView,
  input: CameraPanInput,
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
  deltaSeconds: number,
): CameraView {
  return stepCameraView(
    view,
    input,
    effectiveViewport(viewport, config),
    bounds,
    config,
    deltaSeconds,
    viewport,
  );
}

/** Applies one wheel event. */
export function zoomCamera3dView(
  view: CameraView,
  wheelDeltaY: number,
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
): CameraView {
  return zoomCameraView(view, wheelDeltaY, effectiveViewport(viewport, config), bounds, config);
}

/**
 * Where to stand the camera so that `view` is what appears on screen.
 *
 * The camera looks north — towards decreasing world `y` — so it stands south of its target, which
 * in turn sits south of the centre of the view by the footprint's asymmetry.
 */
export function cameraPlacement(
  view: CameraView,
  viewport: ViewportSize,
  config: CameraConfig,
  bounds: Rect,
): CameraPlacement {
  const zoom = clampZoomToView(view.zoom, effectiveViewport(viewport, config), bounds, config);
  const geometry = perspectiveGeometry(config, viewport.height / zoom);
  const target: Vec2 = { x: view.centerX, y: view.centerY + geometry.targetOffset };

  return {
    target,
    eye: { x: target.x, y: target.y + geometry.height / Math.tan(pitchRadians(config)) },
    height: geometry.height,
    distance: geometry.distance,
  };
}
