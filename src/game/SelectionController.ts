import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec2 } from '../core/geometry';
import type { EntityId, PlayerId } from '../core/ids';
import { pruneSelection, updateSelection } from '../core/selection';
import type { World } from '../core/world';
import type { SceneSpace } from './sceneSpace';

interface PointerPoint { readonly x: number; readonly y: number; }
interface DragState { readonly start: PointerPoint; readonly additive: boolean; }

const DRAG_THRESHOLD_PIXELS = 6;

/** Babylon input adapter for selection, ground moves, explicit attacks and one-click Attack-Move. */
export class SelectionController {
  private enabled = true;
  private attackMoveArmed = false;
  private selected: EntityId[] = [];
  private drag: DragState | null = null;
  private readonly ray = new Ray(Vector3.Zero(), Vector3.Up());
  private readonly identity = Matrix.Identity();
  private readonly dragBox: HTMLDivElement;
  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerUp: (event: PointerEvent) => void;

  public constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly space: SceneSpace,
    private readonly world: World,
    private readonly player: PlayerId,
    private readonly entityIdOfMesh: (mesh: AbstractMesh) => EntityId | null,
    private readonly onChange: (selected: readonly EntityId[]) => void,
    private readonly onMove: (selected: readonly EntityId[], target: Vec2) => void,
    private readonly onAttack: (selected: readonly EntityId[], targetId: EntityId) => void,
    private readonly onAttackMove: (selected: readonly EntityId[], target: Vec2) => void,
  ) {
    this.dragBox = document.createElement('div');
    Object.assign(this.dragBox.style, {
      position: 'fixed', display: 'none', pointerEvents: 'none', zIndex: '20',
      border: '1px solid rgba(181, 231, 255, 0.9)', background: 'rgba(90, 170, 230, 0.16)',
      boxShadow: '0 0 12px rgba(105, 208, 255, 0.22)',
    });
    canvas.parentElement?.append(this.dragBox);

    this.onPointerDown = (event) => {
      if (!this.enabled) return;
      const point = this.canvasPoint(event);
      if (event.button === 0) {
        if (this.attackMoveArmed && this.selected.length > 0) {
          this.attackMoveArmed = false;
          this.scene.createPickingRayToRef(point.x, point.y, this.identity, this.ray, this.camera);
          const target = this.groundPoint();
          if (target !== null) this.onAttackMove(this.selected, target);
          return;
        }
        this.drag = { start: point, additive: event.shiftKey };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (event.button !== 2 || this.selected.length === 0) return;
      event.preventDefault();
      this.scene.createPickingRayToRef(point.x, point.y, this.identity, this.ray, this.camera);
      const hit = this.scene.pickWithRay(this.ray, (mesh) => this.entityIdOfMesh(mesh) !== null);
      const targetId = hit?.pickedMesh === undefined || hit.pickedMesh === null
        ? null
        : this.entityIdOfMesh(hit.pickedMesh);
      if (targetId !== null) {
        if (this.world.get(targetId)?.owner !== this.player) {
          this.onAttack(this.selected, targetId);
        }
        return;
      }
      const target = this.groundPoint();
      if (target !== null) this.onMove(this.selected, target);
    };
    this.onPointerMove = (event) => {
      if (!this.enabled) return;
      if (this.drag === null) return;
      const point = this.canvasPoint(event);
      if (this.isDrag(point)) this.drawDragBox(this.drag.start, point);
    };
    this.onPointerUp = (event) => {
      if (!this.enabled) return;
      if (event.button !== 0 || this.drag === null) return;
      const drag = this.drag;
      this.drag = null;
      this.dragBox.style.display = 'none';
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      const point = this.canvasPoint(event);
      if (this.isDrag(point, drag.start)) {
        this.setSelection(updateSelection(this.selected, this.unitsInScreenRect(drag.start, point), drag.additive));
      } else {
        const id = this.pickAt(point.x, point.y);
        this.setSelection(updateSelection(this.selected, id === null ? [] : [id], drag.additive));
      }
    };

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  public selectedIds(): readonly EntityId[] { return this.selected; }
  public selectedId(): EntityId | null { return this.selected[0] ?? null; }
  public isAttackMoveArmed(): boolean { return this.attackMoveArmed; }
  /** The next left-click on ground becomes an Attack-Move request. */
  public setAttackMoveArmed(armed: boolean): void {
    this.attackMoveArmed = armed && this.enabled && this.selected.length > 0;
  }
  /** Allows the opening scene to seed one selected building. */
  public select(id: EntityId | null): void { this.setSelection(id === null ? [] : [id]); }
  /** Allows the opening scene to seed a whole selection restored from a local match snapshot. */
  public restoreSelection(ids: readonly EntityId[]): void { this.setSelection(ids); }
  public refresh(): void { this.setSelection(pruneSelection(this.world, this.selected, this.player)); }

  /** Lets the pause layer disable map commands even if it is temporarily not covering a pointer. */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.drag = null;
      this.attackMoveArmed = false;
      this.dragBox.style.display = 'none';
    }
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.dragBox.remove();
  }

  private setSelection(next: readonly EntityId[]): void {
    if (next.length === this.selected.length && next.every((id, index) => id === this.selected[index])) return;
    this.selected = [...next];
    this.onChange(this.selected);
  }

  private canvasPoint(event: PointerEvent): PointerPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private isDrag(point: PointerPoint, start = this.drag?.start): boolean {
    return start !== undefined && Math.hypot(point.x - start.x, point.y - start.y) >= DRAG_THRESHOLD_PIXELS;
  }

  private drawDragBox(a: PointerPoint, b: PointerPoint): void {
    const canvasRect = this.canvas.getBoundingClientRect();
    Object.assign(this.dragBox.style, {
      display: 'block', left: `${canvasRect.left + Math.min(a.x, b.x)}px`,
      top: `${canvasRect.top + Math.min(a.y, b.y)}px`, width: `${Math.abs(b.x - a.x)}px`,
      height: `${Math.abs(b.y - a.y)}px`,
    });
  }

  /** Selects projected unit centres; buildings are intentionally absent from this drag path. */
  private unitsInScreenRect(a: PointerPoint, b: PointerPoint): readonly EntityId[] {
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    return this.world.units(this.player).flatMap((unit) => {
      if (unit.status === 'destroyed') return [];
      const point = this.project(unit.position, unit.stats.bodySizeTiles * 0.5);
      return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom ? [unit.id] : [];
    });
  }

  private project(point: Vec2, height: number): PointerPoint {
    const engine = this.scene.getEngine();
    const renderWidth = engine.getRenderWidth();
    const renderHeight = engine.getRenderHeight();
    const projected = Vector3.Project(
      this.space.point(point, height), this.identity, this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(renderWidth, renderHeight),
    );
    return { x: projected.x * this.canvas.clientWidth / renderWidth, y: projected.y * this.canvas.clientHeight / renderHeight };
  }

  private pickAt(x: number, y: number): EntityId | null {
    this.scene.createPickingRayToRef(x, y, this.identity, this.ray, this.camera);
    const hit = this.scene.pickWithRay(this.ray, (mesh) => this.entityIdOfMesh(mesh) !== null);
    const hitMesh = hit?.pickedMesh;
    const id = hitMesh === null || hitMesh === undefined ? null : this.entityIdOfMesh(hitMesh);
    return id !== null && this.world.get(id)?.owner === this.player ? id : null;
  }

  private groundPoint(): Vec2 | null {
    const { origin, direction } = this.ray;
    if (direction.y > -1e-6) return null;
    const travel = -origin.y / direction.y;
    return this.space.toWorld(origin.x + direction.x * travel, origin.z + direction.z * travel);
  }
}
