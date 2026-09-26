import { inject } from '@vercel/analytics';
import { Engine } from '@babylonjs/core/Engines/engine';
import { RENDER_CONFIG } from './config/render';
import { FramePacer } from './game/framePacer';
import { clearSnapshot, loadSnapshot } from './game/matchPersistence';
import { MatchScene } from './game/MatchScene';
import { GAME_TITLE } from './game/title';
import { TitleScreen } from './ui/titleScreen';
import { AudioManager } from './audio/AudioManager';
import { MAP_CATALOG } from './config/maps';
import { mapConfigById } from './config/map';
import type { MapConfig } from './config/types';
import type { WorldSnapshot } from './core/snapshot';
import { MapSelectionScreen } from './ui/mapSelectionScreen';
import { GameModeScreen } from './ui/gameModeScreen';

// Initialize Vercel Analytics
inject();

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
canvas.dataset.testid = 'game-canvas';
// Without this the browser scrolls or zooms the page when the pointer is dragged over the canvas.
canvas.style.touchAction = 'none';
container.append(canvas);

const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, false);
const physicalPixelRatio = window.devicePixelRatio || 1;
engine.setHardwareScalingLevel(Math.max(1, physicalPixelRatio / RENDER_CONFIG.maxDevicePixelRatio));
let scene: MatchScene | null = null;
let titleScreen: TitleScreen | null = null;
let gameModeScreen: GameModeScreen | null = null;
let mapSelection: MapSelectionScreen | null = null;
const audio = new AudioManager();
const framePacer = new FramePacer(
  RENDER_CONFIG.targetFramesPerSecond,
  RENDER_CONFIG.maxDeltaSeconds,
);

const render = (): void => {
  const deltaSeconds = framePacer.next(performance.now());
  if (deltaSeconds !== null) {
    scene?.render(deltaSeconds);
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

const showTitle = (): void => {
  audio.stopAllMusic();
  scene?.dispose();
  scene = null;
  canvas.style.display = 'none';
  titleScreen?.destroy();
  gameModeScreen?.destroy();
  gameModeScreen = null;
  mapSelection?.destroy();
  mapSelection = null;
  titleScreen = new TitleScreen(
    container,
    GAME_TITLE,
    'Establish your base, secure crystal fields, and outmaneuver the Ember Collective in fast, readable RTS battles.',
    () => (loadSnapshot() === null ? showGameModeSelection() : resumeMatch()),
  );
};

const showGameModeSelection = (): void => {
  audio.enterMainMenu();
  scene?.dispose();
  scene = null;
  canvas.style.display = 'none';
  titleScreen?.destroy();
  titleScreen = null;
  mapSelection?.destroy();
  mapSelection = null;
  gameModeScreen?.destroy();
  gameModeScreen = new GameModeScreen(container, audio, showMapSelection);
};

const startMatch = (map: MapConfig, snapshot: WorldSnapshot | null): void => {
  audio.enterMatch();
  titleScreen?.destroy();
  titleScreen = null;
  gameModeScreen?.destroy();
  gameModeScreen = null;
  mapSelection?.destroy();
  mapSelection = null;
  canvas.style.display = 'block';
  scene = new MatchScene(engine, canvas, container, showMapSelection, showTitle, audio, map, snapshot);
  framePacer.reset();
};

const startNewMatch = (map: MapConfig): void => {
  scene?.dispose();
  scene = null;
  clearSnapshot();
  startMatch(map, null);
};

const resumeMatch = (): void => {
  const snapshot = loadSnapshot();
  const map = snapshot === null ? undefined : mapConfigById(snapshot.mapId);
  if (snapshot === null || map === undefined) {
    clearSnapshot();
    showTitle();
    return;
  }
  startMatch(map, snapshot);
};

const showMapSelection = (): void => {
  audio.enterMainMenu();
  scene?.dispose();
  scene = null;
  canvas.style.display = 'none';
  titleScreen?.destroy();
  titleScreen = null;
  gameModeScreen?.destroy();
  gameModeScreen = null;
  mapSelection?.destroy();
  mapSelection = new MapSelectionScreen(
    container,
    MAP_CATALOG,
    showGameModeSelection,
    (entry) => startNewMatch(entry.config),
  );
};

showTitle();

export { engine };
