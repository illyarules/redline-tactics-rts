/** Camera pan speed, zoom limits and the angles of the 3D rig. Provisional values. */
import type { CameraConfig } from './types';

export const CAMERA_CONFIG: CameraConfig = {
  // The match opens close in on the player's own base and the field it will work first, where the
  // detail is: at 1 the battlefield around them reads as empty.
  startZoom: 2.2,
  minZoom: 0.6,
  maxZoom: 2.2,
  zoomStepPerNotch: 1.2,
  wheelNotchDelta: 100,
  panSpeedPixelsPerSecond: 900,
  edgePanMarginPixels: 28,

  // A high angled view: steep enough that the field still reads like a map and units never hide
  // behind each other, shallow enough that a building shows the sides that give it its silhouette.
  pitchDegrees: 58,
  // Narrow enough to keep perspective distortion mild across a wide screen. Must stay under twice
  // the pitch; `tests/core.camera3d.test.ts` checks that.
  fieldOfViewDegrees: 40,
};
