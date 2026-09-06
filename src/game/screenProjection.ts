import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../core/geometry';
import type { SceneSpace } from './sceneSpace';

const IDENTITY = Matrix.Identity();

/**
 * A world position projected to canvas CSS pixels — the same coordinate space pointer events use.
 * Used by `SelectionController`'s own screen-space hit testing (projecting a unit's body to decide
 * whether a drag rectangle covers it).
 */
export function projectToScreen(
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
  space: SceneSpace,
  point: Vec2,
  /** Height above the ground, in scene units (tiles) — e.g. half a unit's `bodySizeTiles`. */
  heightSceneUnits = 0,
): Vec2 {
  const engine = scene.getEngine();
  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();
  const projected = Vector3.Project(
    space.point(point, heightSceneUnits),
    IDENTITY,
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(renderWidth, renderHeight),
  );
  return {
    x: (projected.x * canvas.clientWidth) / renderWidth,
    y: (projected.y * canvas.clientHeight) / renderHeight,
  };
}
