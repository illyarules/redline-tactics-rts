import { describe, expect, it } from 'vitest';
import { CAMERA_CONFIG } from '../../src/config/camera';
import { MAP_CONFIG } from '../../src/config/map';
import { createMapGrid } from '../../src/core/map';
import { NO_PAN_KEYS, type PanKeys } from '../../src/core/cameraControl';
import { stepCamera3dView, zoomCamera3dView } from '../../src/core/camera3d';
import { keyboardZoomDelta, PAN_KEY_CODES } from '../../src/game/CameraController';

const bounds = createMapGrid(MAP_CONFIG).bounds;
const viewport = { width: 800, height: 600 };
const view = { centerX: bounds.width / 2, centerY: bounds.height / 2, zoom: 1 };

function stepFor(code: string) {
  const direction = PAN_KEY_CODES[code];
  if (direction === undefined) throw new Error(`Missing pan mapping for ${code}`);
  const keys: PanKeys = { ...NO_PAN_KEYS, [direction]: true };
  return stepCamera3dView(view, { keys, pointer: null }, viewport, bounds, CAMERA_CONFIG, 0.1);
}

describe('keyboard camera controls', () => {
  it('maps A to a left pan and keeps WASD navigation intact', () => {
    expect(stepFor('KeyA').centerX).toBeLessThan(view.centerX);
    expect(stepFor('KeyW').centerY).toBeLessThan(view.centerY);
    expect(stepFor('KeyS').centerY).toBeGreaterThan(view.centerY);
    expect(stepFor('KeyD').centerX).toBeGreaterThan(view.centerX);
  });

  it('maps arrow keys to their matching pan directions', () => {
    expect(stepFor('ArrowUp').centerY).toBeLessThan(view.centerY);
    expect(stepFor('ArrowLeft').centerX).toBeLessThan(view.centerX);
    expect(stepFor('ArrowDown').centerY).toBeGreaterThan(view.centerY);
    expect(stepFor('ArrowRight').centerX).toBeGreaterThan(view.centerX);
  });

  it('zooms with keyboard shortcuts through the existing limits', () => {
    const zoomIn = keyboardZoomDelta('Equal', CAMERA_CONFIG);
    const zoomOut = keyboardZoomDelta('Minus', CAMERA_CONFIG);
    expect(zoomIn).not.toBeNull();
    expect(zoomOut).not.toBeNull();
    expect(keyboardZoomDelta('NumpadAdd', CAMERA_CONFIG)).toBe(zoomIn);
    expect(keyboardZoomDelta('NumpadSubtract', CAMERA_CONFIG)).toBe(zoomOut);

    const closer = zoomCamera3dView(view, zoomIn!, viewport, bounds, CAMERA_CONFIG);
    const farther = zoomCamera3dView(view, zoomOut!, viewport, bounds, CAMERA_CONFIG);
    expect(closer.zoom).toBeGreaterThan(view.zoom);
    expect(farther.zoom).toBeLessThan(view.zoom);

    let atLimit = view;
    for (let i = 0; i < 50; i++) atLimit = zoomCamera3dView(atLimit, zoomIn!, viewport, bounds, CAMERA_CONFIG);
    expect(atLimit.zoom).toBe(CAMERA_CONFIG.maxZoom);
    for (let i = 0; i < 50; i++) atLimit = zoomCamera3dView(atLimit, zoomOut!, viewport, bounds, CAMERA_CONFIG);
    expect(atLimit.zoom).toBe(CAMERA_CONFIG.minZoom);
  });
});
