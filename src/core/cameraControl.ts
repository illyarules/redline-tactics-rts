/**
 * Camera math: where the view is allowed to be after panning or zooming.
 *
 * The view is described by its centre in world pixels plus a zoom factor, because both limits — the
 * zoom range and the map bounds — are easiest to state that way. Every function here returns a fully
 * clamped view, so a caller cannot produce a camera that leaves the map or exceeds the zoom range.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { CameraConfig } from '../config/types';
import { clamp, type Rect, type Vec2 } from './geometry';

export interface CameraView {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

/** Which pan keys are held this frame. */
export interface PanKeys {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/** Pointer position in screen pixels relative to the game viewport. */
export interface PointerState {
  readonly x: number;
  readonly y: number;
  /** False while the pointer is outside the game area, which stops edge panning. */
  readonly inside: boolean;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface CameraPanInput {
  readonly keys: PanKeys;
  /** `null` when there is no pointer to read this frame. */
  readonly pointer: PointerState | null;
}

export const NO_PAN_KEYS: PanKeys = { up: false, down: false, left: false, right: false };

/** A single frame never pans more than this, so a stalled tab cannot fling the camera. */
const MAX_STEP_SECONDS = 0.1;

/** A single wheel event never zooms more than this many notches. */
const MAX_WHEEL_NOTCHES = 3;

export function clampZoom(zoom: number, config: CameraConfig): number {
  if (!Number.isFinite(zoom)) {
    return config.startZoom;
  }
  return clamp(zoom, config.minZoom, config.maxZoom);
}

/** The zoom at which the map exactly fills the viewport. Below it, ground outside the map shows. */
export function fitZoom(viewport: ViewportSize, bounds: Rect): number {
  return Math.max(viewport.width / bounds.width, viewport.height / bounds.height);
}

/**
 * Zoom range actually usable in a given viewport: the configured range, but never zoomed out past
 * the point where the map stops filling the screen. On a viewport too large for even `maxZoom` to
 * cover the map, the range collapses to `maxZoom` and `clampCameraCenter` centres the map instead.
 */
export function zoomRange(
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
): { readonly min: number; readonly max: number } {
  const min = clamp(Math.max(config.minZoom, fitZoom(viewport, bounds)), config.minZoom, config.maxZoom);
  return { min, max: config.maxZoom };
}

/** Clamps a zoom to the range usable in this viewport. */
export function clampZoomToView(
  zoom: number,
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
): number {
  const range = zoomRange(viewport, bounds, config);
  if (!Number.isFinite(zoom)) {
    return clamp(config.startZoom, range.min, range.max);
  }
  return clamp(zoom, range.min, range.max);
}

/** How much of the world the viewport shows at a zoom level, in world pixels. */
export function visibleSize(viewport: ViewportSize, zoom: number): ViewportSize {
  return { width: viewport.width / zoom, height: viewport.height / zoom };
}

/**
 * Keeps the whole view inside the map. On an axis where the view is wider than the map there is
 * nothing to scroll, so the map is centred instead.
 */
export function clampCameraCenter(
  center: Vec2,
  zoom: number,
  viewport: ViewportSize,
  bounds: Rect,
): Vec2 {
  const visible = visibleSize(viewport, zoom);

  const clampAxis = (value: number, min: number, size: number, visibleSpan: number): number => {
    if (visibleSpan >= size) {
      return min + size / 2;
    }
    return clamp(value, min + visibleSpan / 2, min + size - visibleSpan / 2);
  };

  return {
    x: clampAxis(center.x, bounds.x, bounds.width, visible.width),
    y: clampAxis(center.y, bounds.y, bounds.height, visible.height),
  };
}

/** Direction requested by the pan keys. Opposite keys cancel out. */
export function keyPanDirection(keys: PanKeys): Vec2 {
  return {
    x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
    y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
  };
}

/** Direction requested by holding the pointer near a screen edge. */
export function edgePanDirection(
  pointer: PointerState | null,
  viewport: ViewportSize,
  config: CameraConfig,
): Vec2 {
  if (pointer === null || !pointer.inside) {
    return { x: 0, y: 0 };
  }

  const margin = config.edgePanMarginPixels;
  const atLeft = pointer.x <= margin;
  const atRight = pointer.x >= viewport.width - margin;
  const atTop = pointer.y <= margin;
  const atBottom = pointer.y >= viewport.height - margin;

  return {
    x: (atRight ? 1 : 0) - (atLeft ? 1 : 0),
    y: (atBottom ? 1 : 0) - (atTop ? 1 : 0),
  };
}

/**
 * Combined pan direction, normalized so that panning diagonally is not faster than panning
 * straight, and so that a key and the matching screen edge do not stack.
 */
export function panDirection(
  input: CameraPanInput,
  viewport: ViewportSize,
  config: CameraConfig,
): Vec2 {
  const keys = keyPanDirection(input.keys);
  const edge = edgePanDirection(input.pointer, viewport, config);
  const x = clamp(keys.x + edge.x, -1, 1);
  const y = clamp(keys.y + edge.y, -1, 1);
  const length = Math.hypot(x, y);

  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/**
 * Advances a pan by `deltaSeconds`. Pan speed is in screen pixels, so it is divided by the zoom.
 *
 * `viewport` is the viewport whose `visibleSize` is the world rectangle actually on screen. For the
 * 3D rig those are not the same thing — a tilted camera sees further into the map than it is tall —
 * so `edgeViewport` names the real screen size that edge panning measures its margin against. They
 * are the same viewport for a plain top-down view, which is why it defaults to `viewport`.
 */
export function stepCameraView(
  view: CameraView,
  input: CameraPanInput,
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
  deltaSeconds: number,
  edgeViewport: ViewportSize = viewport,
): CameraView {
  const zoom = clampZoomToView(view.zoom, viewport, bounds, config);
  const step = Number.isFinite(deltaSeconds) ? clamp(deltaSeconds, 0, MAX_STEP_SECONDS) : 0;
  const direction = panDirection(input, edgeViewport, config);
  const distance = (config.panSpeedPixelsPerSecond / zoom) * step;

  const center = clampCameraCenter(
    { x: view.centerX + direction.x * distance, y: view.centerY + direction.y * distance },
    zoom,
    viewport,
    bounds,
  );

  return { centerX: center.x, centerY: center.y, zoom };
}

/**
 * Applies one wheel event. Scrolling up (negative `deltaY`) zooms in. The view keeps its centre, and
 * is re-clamped afterwards because zooming out shows more of the map.
 */
export function zoomCameraView(
  view: CameraView,
  wheelDeltaY: number,
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
): CameraView {
  const notches = Number.isFinite(wheelDeltaY)
    ? clamp(-wheelDeltaY / config.wheelNotchDelta, -MAX_WHEEL_NOTCHES, MAX_WHEEL_NOTCHES)
    : 0;
  const current = clampZoomToView(view.zoom, viewport, bounds, config);
  const zoom = clampZoomToView(
    current * config.zoomStepPerNotch ** notches,
    viewport,
    bounds,
    config,
  );
  const center = clampCameraCenter({ x: view.centerX, y: view.centerY }, zoom, viewport, bounds);

  return { centerX: center.x, centerY: center.y, zoom };
}

/** The starting view: a chosen point, or the middle of the map, at the configured start zoom. */
export function initialCameraView(
  viewport: ViewportSize,
  bounds: Rect,
  config: CameraConfig,
  /** Where the view should open, clamped like any other position. Defaults to the map centre. */
  focus: Vec2 | null = null,
): CameraView {
  const zoom = clampZoomToView(config.startZoom, viewport, bounds, config);
  const center = clampCameraCenter(
    focus ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    zoom,
    viewport,
    bounds,
  );

  return { centerX: center.x, centerY: center.y, zoom };
}
