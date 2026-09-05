import { Engine } from '@babylonjs/core/Engines/engine';
import { RENDER_CONFIG } from './config/render';
import { FramePacer } from './game/framePacer';
import { MatchScene } from './game/MatchScene';

/**
 * Entry point: puts a Babylon canvas in the page, starts the match scene on it, and keeps both in
 * step with the size of the window.
 */
const container = document.getElementById('game-root');
if (container === null) {
  throw new Error('Missing #game-root element');
}

const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
// Without this the browser scrolls or zooms the page when the pointer is dragged over the canvas.
canvas.style.touchAction = 'none';
container.append(canvas);

const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, false);
const physicalPixelRatio = window.devicePixelRatio || 1;
engine.setHardwareScalingLevel(Math.max(1, physicalPixelRatio / RENDER_CONFIG.maxDevicePixelRatio));
const scene = new MatchScene(engine, canvas, container);
const framePacer = new FramePacer(
  RENDER_CONFIG.targetFramesPerSecond,
  RENDER_CONFIG.maxDeltaSeconds,
);

const render = (): void => {
  const deltaSeconds = framePacer.next(performance.now());
  if (deltaSeconds !== null) {
    scene.render(deltaSeconds);
  }
};

const updateVisibility = (): void => {
  engine.stopRenderLoop(render);
  framePacer.reset();
  if (!document.hidden) {
    engine.runRenderLoop(render);
  }
};

engine.runRenderLoop(render);
document.addEventListener('visibilitychange', updateVisibility);

window.addEventListener('resize', () => {
  engine.resize();
});

export { engine, scene };
