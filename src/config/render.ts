import type { RenderConfig } from './types';

/**
 * Conservative browser rendering budget for the current low-poly scene.
 * Quality presets can replace this single MVP profile once the game has a settings screen.
 */
export const RENDER_CONFIG: RenderConfig = {
  // Preserve full Retina detail in the default visual mode. A future Quality menu can expose a
  // lower DPR option instead of making every player trade clarity for quieter hardware.
  maxDevicePixelRatio: 2,
  targetFramesPerSecond: 60,
  maxDeltaSeconds: 0.1,
  hudUpdateIntervalSeconds: 0.1,
  shadowMapSize: 2048,
};
