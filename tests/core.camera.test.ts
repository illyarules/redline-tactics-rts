import { describe, expect, it } from 'vitest';
import { CAMERA_CONFIG } from '../src/config/camera';
import { MAP_CONFIG } from '../src/config/map';
import { createMapGrid } from '../src/core/map';
import type { Rect } from '../src/core/geometry';
import {
  NO_PAN_KEYS,
  clampCameraCenter,
  clampZoom,
  clampZoomToView,
  edgePanDirection,
  fitZoom,
  initialCameraView,
  keyPanDirection,
  panDirection,
  stepCameraView,
  visibleSize,
  zoomCameraView,
  zoomRange,
  type CameraPanInput,
  type CameraView,
  type PanKeys,
} from '../src/core/cameraControl';

const config = CAMERA_CONFIG;
const bounds: Rect = createMapGrid(MAP_CONFIG).bounds;
/** Small enough that the configured minimum zoom, not the map-fit floor, is the lower limit. */
const viewport = { width: 800, height: 600 };

function keys(held: Partial<PanKeys>): PanKeys {
  return { ...NO_PAN_KEYS, ...held };
}

function pan(held: Partial<PanKeys>): CameraPanInput {
  return { keys: keys(held), pointer: null };
}

function centeredView(zoom = 1): CameraView {
  return { centerX: bounds.width / 2, centerY: bounds.height / 2, zoom };
}

/** True when the whole view is inside the map, or centred on an axis the view overflows. */
function isWithinBounds(view: CameraView): boolean {
  const visible = visibleSize(viewport, view.zoom);
  const axisOk = (center: number, min: number, size: number, span: number): boolean =>
    span >= size
      ? Math.abs(center - (min + size / 2)) < 1e-9
      : center >= min + span / 2 - 1e-9 && center <= min + size - span / 2 + 1e-9;

  return (
    axisOk(view.centerX, bounds.x, bounds.width, visible.width) &&
    axisOk(view.centerY, bounds.y, bounds.height, visible.height)
  );
}

describe('zoom limits', () => {
  it('clamps to the configured range', () => {
    expect(clampZoom(config.minZoom - 5, config)).toBe(config.minZoom);
    expect(clampZoom(config.maxZoom + 5, config)).toBe(config.maxZoom);
    expect(clampZoom(1.4, config)).toBe(1.4);
  });

  it('falls back to the start zoom for a non-finite value', () => {
    expect(clampZoom(Number.NaN, config)).toBe(config.startZoom);
  });

  it('zooms in on a scroll up and out on a scroll down', () => {
    const zoomedIn = zoomCameraView(centeredView(), -config.wheelNotchDelta, viewport, bounds, config);
    const zoomedOut = zoomCameraView(centeredView(), config.wheelNotchDelta, viewport, bounds, config);

    expect(zoomedIn.zoom).toBeCloseTo(config.zoomStepPerNotch, 6);
    expect(zoomedOut.zoom).toBeCloseTo(1 / config.zoomStepPerNotch, 6);
  });

  it('scales with the wheel delta', () => {
    const half = zoomCameraView(centeredView(), -config.wheelNotchDelta / 2, viewport, bounds, config);
    expect(half.zoom).toBeCloseTo(config.zoomStepPerNotch ** 0.5, 6);
  });

  it('never leaves the configured range however far the wheel is spun', () => {
    let view = centeredView();
    for (let i = 0; i < 50; i++) {
      view = zoomCameraView(view, -config.wheelNotchDelta, viewport, bounds, config);
    }
    expect(view.zoom).toBe(config.maxZoom);

    for (let i = 0; i < 50; i++) {
      view = zoomCameraView(view, config.wheelNotchDelta, viewport, bounds, config);
    }
    expect(view.zoom).toBe(config.minZoom);
    expect(zoomRange(viewport, bounds, config).min).toBe(config.minZoom);
  });

  it('ignores an unusable wheel delta', () => {
    expect(zoomCameraView(centeredView(1.5), Number.NaN, viewport, bounds, config).zoom).toBe(1.5);
    expect(zoomCameraView(centeredView(1.5), 0, viewport, bounds, config).zoom).toBe(1.5);
  });

  it('starts at the configured zoom, centred on the map', () => {
    const view = initialCameraView(viewport, bounds, config);
    expect(view.zoom).toBe(config.startZoom);
    expect(view.centerX).toBe(bounds.width / 2);
    expect(view.centerY).toBe(bounds.height / 2);
  });

  it('opens on a requested point, clamped to the map like any other position', () => {
    const onBase = initialCameraView(viewport, bounds, config, { x: 600, y: 700 });
    expect(onBase.centerX).toBe(600);
    expect(onBase.centerY).toBe(700);

    // A corner base sits closer to the edge than half a viewport, so the view stops at the edge.
    const corner = initialCameraView(viewport, bounds, config, { x: 0, y: 0 });
    expect(corner.centerX).toBe(viewport.width / 2 / config.startZoom);
    expect(corner.centerY).toBe(viewport.height / 2 / config.startZoom);
  });
});

describe('zoom floor that keeps the map filling the screen', () => {
  const wideViewport = { width: 1280, height: 800 };
  /** Larger than even the maximum zoom can cover, derived from the map so it stays that way. */
  const hugeViewport = {
    width: bounds.width * config.maxZoom * 2,
    height: bounds.height * config.maxZoom * 2,
  };

  it('reports the zoom at which the map exactly fills the viewport', () => {
    expect(fitZoom(wideViewport, bounds)).toBeCloseTo(1280 / bounds.width, 9);
    expect(fitZoom({ width: 400, height: 3000 }, bounds)).toBeCloseTo(3000 / bounds.height, 9);
  });

  it('raises the minimum zoom when the configured one would show past the map', () => {
    const range = zoomRange(wideViewport, bounds, config);
    expect(range.min).toBeGreaterThan(config.minZoom);
    expect(range.min).toBeCloseTo(fitZoom(wideViewport, bounds), 9);
    expect(range.max).toBe(config.maxZoom);
  });

  it('stops zooming out at that floor', () => {
    let view: CameraView = { centerX: bounds.width / 2, centerY: bounds.height / 2, zoom: 2 };
    for (let i = 0; i < 40; i++) {
      view = zoomCameraView(view, config.wheelNotchDelta, wideViewport, bounds, config);
    }
    expect(view.zoom).toBeCloseTo(fitZoom(wideViewport, bounds), 9);
    expect(visibleSize(wideViewport, view.zoom).width).toBeLessThanOrEqual(bounds.width + 1e-9);
  });

  it('never pushes the zoom above the configured maximum', () => {
    const range = zoomRange(hugeViewport, bounds, config);
    expect(range.min).toBe(config.maxZoom);
    expect(clampZoomToView(0.1, hugeViewport, bounds, config)).toBe(config.maxZoom);
  });
});

describe('pan direction', () => {
  it('reads the pan keys', () => {
    expect(keyPanDirection(keys({ right: true }))).toEqual({ x: 1, y: 0 });
    expect(keyPanDirection(keys({ up: true }))).toEqual({ x: 0, y: -1 });
    expect(keyPanDirection(keys({ left: true, down: true }))).toEqual({ x: -1, y: 1 });
  });

  it('cancels opposite keys', () => {
    expect(keyPanDirection(keys({ left: true, right: true, up: true, down: true }))).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('pans when the pointer reaches an edge', () => {
    const inside = (x: number, y: number) => ({ x, y, inside: true });
    expect(edgePanDirection(inside(2, 300), viewport, config)).toEqual({ x: -1, y: 0 });
    expect(edgePanDirection(inside(798, 300), viewport, config)).toEqual({ x: 1, y: 0 });
    expect(edgePanDirection(inside(400, 1), viewport, config)).toEqual({ x: 0, y: -1 });
    expect(edgePanDirection(inside(799, 599), viewport, config)).toEqual({ x: 1, y: 1 });
    expect(edgePanDirection(inside(400, 300), viewport, config)).toEqual({ x: 0, y: 0 });
  });

  it('never edge-pans without a pointer over the game', () => {
    expect(edgePanDirection(null, viewport, config)).toEqual({ x: 0, y: 0 });
    expect(edgePanDirection({ x: 0, y: 0, inside: false }, viewport, config)).toEqual({ x: 0, y: 0 });
  });

  it('normalizes diagonals so they are not faster', () => {
    const diagonal = panDirection(pan({ right: true, down: true }), viewport, config);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
  });

  it('does not stack a key with the matching screen edge', () => {
    const both = panDirection(
      { keys: keys({ right: true }), pointer: { x: viewport.width - 1, y: 400, inside: true } },
      viewport,
      config,
    );
    expect(both).toEqual({ x: 1, y: 0 });
  });
});

describe('panning', () => {
  it('moves the view at the configured screen speed', () => {
    const view = stepCameraView(centeredView(), pan({ right: true }), viewport, bounds, config, 0.1);
    expect(view.centerX - bounds.width / 2).toBeCloseTo(config.panSpeedPixelsPerSecond * 0.1, 6);
    expect(view.centerY).toBe(bounds.height / 2);
  });

  it('covers the same screen distance when zoomed in', () => {
    const zoom = 2;
    const view = stepCameraView(centeredView(zoom), pan({ right: true }), viewport, bounds, config, 0.1);
    const worldMoved = view.centerX - bounds.width / 2;
    expect(worldMoved * zoom).toBeCloseTo(config.panSpeedPixelsPerSecond * 0.1, 6);
  });

  it('stands still without input', () => {
    const view = stepCameraView(centeredView(), pan({}), viewport, bounds, config, 0.5);
    expect(view).toEqual(centeredView());
  });

  it('ignores a zero, negative or unusable frame time', () => {
    for (const delta of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const view = stepCameraView(centeredView(), pan({ right: true }), viewport, bounds, config, delta);
      expect(view.centerX).toBe(bounds.width / 2);
    }
  });

  it('caps how far one long frame can pan', () => {
    const oneFrame = stepCameraView(centeredView(), pan({ right: true }), viewport, bounds, config, 5);
    const capped = stepCameraView(centeredView(), pan({ right: true }), viewport, bounds, config, 0.1);
    expect(oneFrame.centerX).toBe(capped.centerX);
  });
});

describe('map bounds', () => {
  it('keeps the view inside the map when it is smaller than the map', () => {
    const zoom = 1;
    const visible = visibleSize(viewport, zoom);
    const topLeft = clampCameraCenter({ x: -5000, y: -5000 }, zoom, viewport, bounds);
    const bottomRight = clampCameraCenter({ x: 99_999, y: 99_999 }, zoom, viewport, bounds);

    expect(topLeft).toEqual({ x: visible.width / 2, y: visible.height / 2 });
    expect(bottomRight).toEqual({
      x: bounds.width - visible.width / 2,
      y: bounds.height - visible.height / 2,
    });
  });

  it('centres an axis the view overflows instead of scrolling it', () => {
    const wide = { width: bounds.width * 2, height: 400 };
    const center = clampCameraCenter({ x: 0, y: 0 }, 1, wide, bounds);
    expect(center.x).toBe(bounds.width / 2);
    expect(center.y).toBe(200);
  });

  it('cannot be panned out of the map from any direction', () => {
    const directions: Partial<PanKeys>[] = [
      { up: true },
      { down: true },
      { left: true },
      { right: true },
      { up: true, left: true },
      { down: true, right: true },
    ];

    for (const held of directions) {
      let view = centeredView();
      for (let frame = 0; frame < 400; frame++) {
        view = stepCameraView(view, pan(held), viewport, bounds, config, 1 / 60);
        expect(isWithinBounds(view)).toBe(true);
      }
    }
  });

  it('stays inside the map while zooming out at a map corner', () => {
    let view = stepCameraView(
      centeredView(config.maxZoom),
      pan({ up: true, left: true }),
      viewport,
      bounds,
      config,
      5,
    );

    for (let i = 0; i < 40; i++) {
      view = zoomCameraView(view, config.wheelNotchDelta, viewport, bounds, config);
      expect(isWithinBounds(view)).toBe(true);
    }
    expect(view.zoom).toBe(config.minZoom);
  });
});
