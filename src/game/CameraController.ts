import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { CAMERA_CONFIG } from '../config/camera';
import type { CameraConfig } from '../config/types';
import {
  cameraPlacement,
  groundFootprint,
  fieldOfViewRadians,
  initialCamera3dView,
  stepCamera3dView,
  zoomCamera3dView,
} from '../core/camera3d';
import type { CameraView, PanKeys, PointerState, ViewportSize } from '../core/cameraControl';
import type { Rect, Vec2 } from '../core/geometry';
import type { SceneSpace } from './sceneSpace';

/**
 * Relays keyboard, pointer and wheel input into the pure camera rules and stands the Babylon camera
 * where they say. Every limit lives in `core/camera3d.ts` and `core/cameraControl.ts`; this class
 * only reads input and places a camera.
 *
 * The camera is never driven by Babylon's own input handling, so the view cannot be rotated, rolled
 * or flown: it is a high angled top-down RTS camera that pans, zooms and stays over the map.
 */

/** The keys that pan, by `KeyboardEvent.code` so the layout of the keyboard does not matter. */
const PAN_KEY_CODES: Readonly<Record<string, keyof PanKeys>> = {
  KeyW: 'up',
  KeyA: 'left',
  KeyS: 'down',
  KeyD: 'right',
};

const NO_KEYS: PanKeys = { up: false, down: false, left: false, right: false };

export class CameraController {
  private view: CameraView;
  private readonly held = new Set<keyof PanKeys>();
  private pointer: PointerState | null = null;

  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onWheel: (event: WheelEvent) => void;

  public constructor(
    private readonly camera: TargetCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly bounds: Rect,
    private readonly space: SceneSpace,
    /** Where the view opens. Defaults to the middle of the map. */
    focus: Vec2 | null = null,
    private readonly config: CameraConfig = CAMERA_CONFIG,
  ) {
    // Keep the opening composition consistent on smaller desktop viewports.
    const openingConfig = { ...config, startZoom: Math.min(config.startZoom,
      this.viewport().width / (26 / space.unitsPerWorldPixel)) };
    this.view = initialCamera3dView(this.viewport(), bounds, openingConfig, focus);
    this.camera.fov = fieldOfViewRadians(config);
    this.apply();

    this.onKeyDown = (event) => {
      const key = PAN_KEY_CODES[event.code];
      if (key !== undefined) {
        this.held.add(key);
      }
    };
    this.onKeyUp = (event) => {
      const key = PAN_KEY_CODES[event.code];
      if (key !== undefined) {
        this.held.delete(key);
      }
    };
    // A key released while the window is not focused is never reported, which would leave the camera
    // panning on its own when the player comes back.
    this.onBlur = () => this.held.clear();

    this.onPointerMove = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        inside: true,
      };
    };
    this.onPointerLeave = () => {
      this.pointer = null;
    };
    this.onWheel = (event) => {
      event.preventDefault();
      this.view = zoomCamera3dView(
        this.view,
        event.deltaY,
        this.viewport(),
        this.bounds,
        this.config,
      );
      this.apply();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public update(deltaSeconds: number): void {
    this.view = stepCamera3dView(
      this.view,
      { keys: this.readKeys(), pointer: this.pointer },
      this.viewport(),
      this.bounds,
      this.config,
      deltaSeconds,
    );
    this.apply();
  }

  public visibleBounds(): Rect {
    const size = groundFootprint(this.viewport(), this.view.zoom, this.config);
    return { x: this.view.centerX - size.width / 2, y: this.view.centerY - size.height / 2,
      width: size.width, height: size.height };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  /** Places the camera for the current view. World pixels become scene units here and nowhere else. */
  private apply(): void {
    const placement = cameraPlacement(this.view, this.viewport(), this.config, this.bounds);

    this.camera.position.set(
      this.space.sceneX(placement.eye.x),
      this.space.length(placement.height),
      this.space.sceneZ(placement.eye.y),
    );
    this.camera.setTarget(
      new Vector3(
        this.space.sceneX(placement.target.x),
        0,
        this.space.sceneZ(placement.target.y),
      ),
    );
  }

  /** The viewport in CSS pixels, which is the space pointer positions and pan speeds are given in. */
  private viewport(): ViewportSize {
    return {
      width: Math.max(this.canvas.clientWidth, 1),
      height: Math.max(this.canvas.clientHeight, 1),
    };
  }

  private readKeys(): PanKeys {
    if (this.held.size === 0) {
      return NO_KEYS;
    }
    return {
      up: this.held.has('up'),
      down: this.held.has('down'),
      left: this.held.has('left'),
      right: this.held.has('right'),
    };
  }
}
