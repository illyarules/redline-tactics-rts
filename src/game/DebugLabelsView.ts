import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import type { Scene } from '@babylonjs/core/scene';
import type { EntityId } from '../core/ids';
import type { ReadonlyEntity } from '../core/entities';
import type { World } from '../core/world';
import type { SceneSpace } from './sceneSpace';

/**
 * A development aid: each entity's type and id, written above it.
 *
 * The labels are HTML over the canvas rather than geometry in the scene, so they stay crisp at every
 * zoom and cost nothing to draw when they are switched off. Their positions come from projecting the
 * entity's own world position through the live camera, so a label sits over its entity at any angle.
 */

/** Just off the screen: where a label goes when its entity is behind the camera. */
const OFFSCREEN = '-1000px';

export class DebugLabelsView {
  private readonly root: HTMLElement;
  private readonly labels = new Map<EntityId, HTMLElement>();
  private readonly projected = Vector3.Zero();
  private readonly viewport = new Viewport(0, 0, 1, 1);
  private enabled = false;

  public constructor(
    container: HTMLElement,
    private readonly scene: Scene,
    private readonly canvas: HTMLCanvasElement,
    private readonly space: SceneSpace,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '9',
      display: 'none',
    });
    container.append(this.root);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.style.display = enabled ? 'block' : 'none';
  }

  /** Moves every label onto its entity. `heightOf` reports how tall an entity's model stands. */
  public update(
    world: World,
    heightOf: (id: EntityId) => number,
    isVisible: (entity: ReadonlyEntity) => boolean = () => true,
  ): void {
    if (!this.enabled) {
      return;
    }

    this.viewport.width = this.canvas.clientWidth;
    this.viewport.height = this.canvas.clientHeight;
    const transform = this.scene.getTransformMatrix();
    const present = new Set<EntityId>();

    for (const entity of world.entities()) {
      if (!isVisible(entity)) continue;
      present.add(entity.id);
      const label = this.labelFor(entity.id, `${entity.type} ${entity.id}`);
      Vector3.ProjectToRef(
        this.space.point(entity.position, heightOf(entity.id) + 0.5),
        Matrix.IdentityReadOnly,
        transform,
        this.viewport,
        this.projected,
      );

      if (this.projected.z < 0 || this.projected.z > 1) {
        label.style.left = OFFSCREEN;
        continue;
      }
      // `ProjectToRef` already reports screen coordinates with the origin at the top-left corner.
      label.style.left = `${this.projected.x}px`;
      label.style.top = `${this.projected.y}px`;
    }

    for (const [id, label] of this.labels) {
      if (!present.has(id)) {
        label.remove();
        this.labels.delete(id);
      }
    }
  }

  public dispose(): void {
    this.labels.clear();
    this.root.remove();
  }

  private labelFor(id: EntityId, text: string): HTMLElement {
    const existing = this.labels.get(id);
    if (existing !== undefined) {
      return existing;
    }

    const label = document.createElement('div');
    label.textContent = text;
    Object.assign(label.style, {
      position: 'absolute',
      transform: 'translate(-50%, -100%)',
      color: '#dce6f5',
      font: '10px/1.2 system-ui, sans-serif',
      textShadow: '0 1px 3px rgba(6, 10, 6, 0.9)',
      whiteSpace: 'nowrap',
    });
    this.root.append(label);
    this.labels.set(id, label);
    return label;
  }
}
