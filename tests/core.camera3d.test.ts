import { describe, expect, it } from 'vitest';
import { CAMERA_CONFIG } from '../src/config/camera';
import { MAP_CONFIG } from '../src/config/map';
import { createMapGrid } from '../src/core/map';
import { NO_PAN_KEYS, type CameraView, type PanKeys } from '../src/core/cameraControl';
import {
  cameraPlacement,
  depthFactor,
  effectiveViewport,
  fieldOfViewRadians,
  groundFootprint,
  initialCamera3dView,
  perspectiveGeometry,
  pitchRadians,
  stepCamera3dView,
  zoomCamera3dView,
} from '../src/core/camera3d';
import type { Rect } from '../src/core/geometry';

const config = CAMERA_CONFIG;
const bounds: Rect = createMapGrid(MAP_CONFIG).bounds;
const viewport = { width: 1280, height: 720 };

function keys(held: Partial<PanKeys>): PanKeys {
  return { ...NO_PAN_KEYS, ...held };
}

function view(zoom = config.startZoom): CameraView {
  return { centerX: bounds.width / 2, centerY: bounds.height / 2, zoom };
}

describe('rig angles', () => {
  it('uses the configured angles as they are', () => {
    expect(pitchRadians(config)).toBeCloseTo((config.pitchDegrees * Math.PI) / 180, 12);
    expect(fieldOfViewRadians(config)).toBeCloseTo(
      (config.fieldOfViewDegrees * Math.PI) / 180,
      12,
    );
  });

  it('keeps the top of the frustum below the horizon', () => {
    // The shipped config must not need narrowing: the visible ground would otherwise be unbounded.
    expect(config.fieldOfViewDegrees).toBeLessThan(2 * config.pitchDegrees);
    expect(pitchRadians(config) - fieldOfViewRadians(config) / 2).toBeGreaterThan(0);
  });

  it('narrows a field of view that would reach past the horizon', () => {
    const reckless = { ...config, pitchDegrees: 20, fieldOfViewDegrees: 120 };
    expect(pitchRadians(reckless) - fieldOfViewRadians(reckless) / 2).toBeGreaterThan(0);
  });

  it('looks straight down at most', () => {
    expect(pitchRadians({ ...config, pitchDegrees: 200 })).toBeLessThanOrEqual(Math.PI / 2);
  });
});

describe('ground footprint', () => {
  it('reaches further away from the camera than towards it', () => {
    const geometry = perspectiveGeometry(config);
    expect(geometry.farExtent).toBeGreaterThan(geometry.nearExtent);
    expect(geometry.depth).toBeCloseTo(geometry.nearExtent + geometry.farExtent, 12);
    expect(geometry.targetOffset).toBeCloseTo(
      (geometry.farExtent - geometry.nearExtent) / 2,
      12,
    );
  });

  it('scales every distance linearly with the frustum height', () => {
    const single = perspectiveGeometry(config, 1);
    const tripled = perspectiveGeometry(config, 3);
    expect(tripled.distance).toBeCloseTo(single.distance * 3, 9);
    expect(tripled.height).toBeCloseTo(single.height * 3, 9);
    expect(tripled.depth).toBeCloseTo(single.depth * 3, 9);
  });

  it('is deeper than a flat view of the same viewport, and never narrower', () => {
    expect(depthFactor(config)).toBeGreaterThan(1);

    const footprint = groundFootprint(viewport, 1.5, config);
    // Only the pitch foreshortens, so nothing across the screen is stretched.
    expect(footprint.width).toBeCloseTo(viewport.width / 1.5, 9);
    expect(footprint.height).toBeCloseTo((viewport.height / 1.5) * depthFactor(config), 9);
  });

  it('describes itself as the viewport the flat camera rules understand', () => {
    const effective = effectiveViewport(viewport, config);
    expect(effective.width).toBe(viewport.width);
    expect(effective.height).toBeCloseTo(viewport.height * depthFactor(config), 9);
  });

  it('shrinks as the view zooms in', () => {
    const near = groundFootprint(viewport, 2, config);
    const far = groundFootprint(viewport, 1, config);
    expect(near.width).toBeLessThan(far.width);
    expect(near.height).toBeLessThan(far.height);
  });
});

describe('camera placement', () => {
  it('stands south of what it looks at, and above the ground', () => {
    const placement = cameraPlacement(view(), viewport, config, bounds);
    expect(placement.height).toBeGreaterThan(0);
    expect(placement.eye.x).toBeCloseTo(placement.target.x, 9);
    // The camera looks north — towards decreasing world `y` — so it stands at a larger `y`.
    expect(placement.eye.y).toBeGreaterThan(placement.target.y);
  });

  it('aims past the centre of the view, so the footprint is centred on it', () => {
    const current = view();
    const placement = cameraPlacement(current, viewport, config, bounds);
    const geometry = perspectiveGeometry(config, viewport.height / current.zoom);

    expect(placement.target.x).toBeCloseTo(current.centerX, 9);
    expect(placement.target.y).toBeCloseTo(current.centerY + geometry.targetOffset, 9);
    // Which puts the near and far edges the same distance either side of the view centre.
    expect(placement.target.y + geometry.nearExtent - current.centerY).toBeCloseTo(
      current.centerY - (placement.target.y - geometry.farExtent),
      9,
    );
  });

  it('pulls back as the view zooms out', () => {
    const near = cameraPlacement(view(config.maxZoom), viewport, config, bounds);
    const far = cameraPlacement(view(config.minZoom), viewport, config, bounds);
    expect(far.height).toBeGreaterThan(near.height);
    expect(far.distance).toBeGreaterThan(near.distance);
  });
});

/** The rectangle of map on screen, or a centred one on an axis the view overflows. */
function footprintWithinBounds(current: CameraView): boolean {
  const footprint = groundFootprint(viewport, current.zoom, config);
  const axisOk = (center: number, min: number, size: number, span: number): boolean =>
    span >= size
      ? Math.abs(center - (min + size / 2)) < 1e-9
      : center >= min + span / 2 - 1e-9 && center <= min + size - span / 2 + 1e-9;

  return (
    axisOk(current.centerX, bounds.x, bounds.width, footprint.width) &&
    axisOk(current.centerY, bounds.y, bounds.height, footprint.height)
  );
}

describe('camera limits', () => {
  it('opens inside the map at a usable zoom', () => {
    const opened = initialCamera3dView(viewport, bounds, config, { x: 200, y: 400 });
    expect(opened.zoom).toBeLessThanOrEqual(config.maxZoom);
    expect(footprintWithinBounds(opened)).toBe(true);
  });

  it('never pans what it can see off the map', () => {
    let current = initialCamera3dView(viewport, bounds, config);
    for (let frame = 0; frame < 400; frame++) {
      current = stepCamera3dView(
        current,
        { keys: keys({ up: true, left: true }), pointer: null },
        viewport,
        bounds,
        config,
        1 / 60,
      );
      expect(footprintWithinBounds(current)).toBe(true);
    }
  });

  it('never zooms out far enough to show ground beyond the map', () => {
    let current = initialCamera3dView(viewport, bounds, config);
    for (let notch = 0; notch < 20; notch++) {
      current = zoomCamera3dView(current, config.wheelNotchDelta, viewport, bounds, config);
      expect(current.zoom).toBeGreaterThanOrEqual(config.minZoom - 1e-9);
      expect(footprintWithinBounds(current)).toBe(true);
    }

    const footprint = groundFootprint(viewport, current.zoom, config);
    expect(footprint.width).toBeLessThanOrEqual(bounds.width + 1e-9);
    expect(footprint.height).toBeLessThanOrEqual(bounds.height + 1e-9);
  });

  it('measures edge panning against the real viewport, not the deeper footprint', () => {
    const start = { centerX: bounds.width / 2, centerY: bounds.height / 2, zoom: config.startZoom };
    const atBottomEdge = stepCamera3dView(
      start,
      {
        keys: NO_PAN_KEYS,
        pointer: { x: viewport.width / 2, y: viewport.height - 1, inside: true },
      },
      viewport,
      bounds,
      config,
      1 / 60,
    );
    expect(atBottomEdge.centerY).toBeGreaterThan(start.centerY);

    // A pointer that is only near the bottom of the *stretched* viewport is nowhere near the screen.
    const wellInside = stepCamera3dView(
      start,
      {
        keys: NO_PAN_KEYS,
        pointer: { x: viewport.width / 2, y: viewport.height * 0.8, inside: true },
      },
      viewport,
      bounds,
      config,
      1 / 60,
    );
    expect(wellInside.centerY).toBeCloseTo(start.centerY, 9);
  });
});
