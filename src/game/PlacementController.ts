import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import { BUILDING_CONFIG } from '../config/buildings';
import type { TileCoord, Vec2 } from '../core/geometry';
import type { BuildingTypeId, EntityId } from '../core/ids';
import type { MapGrid } from '../core/map';
import { checkBuildingPlacement } from '../core/placement';
import type { World } from '../core/world';
import type { MaterialLibrary } from './materials';
import type { SceneSpace } from './sceneSpace';

/** How high the preview floats above the ground, so it never fights the ground for depth. */
const PREVIEW_HEIGHT = 0.05;
const VALID_COLOR = 0x6fdc8c;
const INVALID_COLOR = 0xd9614c;
const PREVIEW_ALPHA = 0.45;

/**
 * A chosen building's footprint, following the pointer snapped to the grid: green while its full
 * footprint could stand there, red otherwise. Confirms on left-click, cancels on right-click or
 * Escape, and never spends Credits itself — that is `startConstruction`'s job, called from the
 * confirm callback.
 *
 * Its pointer listeners sit on `window` in the capture phase so they run, and can veto further
 * propagation, before `SelectionController`'s own canvas listeners — attached later and on the
 * canvas itself — ever see the event. Registration order alone would not guarantee that on the same
 * element, so this is the one reliable way to make placement clicks take priority while active.
 */
export class PlacementController {
  private enabled = true;
  private mesh: Mesh | null = null;
  private buildingType: BuildingTypeId | null = null;
  private workerId: EntityId | null = null;
  private lastGroundPoint: Vec2 | null = null;
  private readonly ray = new Ray(Vector3.Zero(), Vector3.Up());
  private readonly identity = Matrix.Identity();
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.buildingType !== null) {
      event.preventDefault();
    }
  };

  public constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly space: SceneSpace,
    private readonly grid: MapGrid,
    private readonly world: World,
    private readonly materials: MaterialLibrary,
    private readonly onConfirm: (buildingType: BuildingTypeId, topLeft: TileCoord, workerId: EntityId) => void,
  ) {
    this.onPointerMove = (event) => {
      if (!this.enabled || this.buildingType === null) {
        return;
      }
      this.lastGroundPoint = this.groundPointFrom(event);
    };

    this.onPointerDown = (event) => {
      if (!this.enabled || this.buildingType === null) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();

      if (event.button !== 0) {
        this.cancel();
        return;
      }
      const buildingType = this.buildingType;
      const workerId = this.workerId;
      const topLeft = this.currentTopLeft();
      if (
        topLeft !== null &&
        workerId !== null &&
        checkBuildingPlacement(this.world, this.grid, buildingType, topLeft).valid
      ) {
        this.cancel();
        this.onConfirm(buildingType, topLeft, workerId);
      }
    };

    window.addEventListener('pointermove', this.onPointerMove, { capture: true });
    window.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Enters placement mode for `buildingType`, to be built by `workerId` once confirmed. */
  public start(buildingType: BuildingTypeId, workerId: EntityId): void {
    this.disposeMesh();
    this.buildingType = buildingType;
    this.workerId = workerId;
    this.lastGroundPoint = null;

    const footprint = BUILDING_CONFIG[buildingType].footprint;
    const mesh = CreatePlane(
      'placement:preview',
      {
        width: this.space.length(footprint.width * this.grid.tileSizePixels),
        height: this.space.length(footprint.height * this.grid.tileSizePixels),
      },
      this.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    this.mesh = mesh;
  }

  public isActive(): boolean {
    return this.buildingType !== null;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Repositions and recolors the preview from the last known pointer position. Call every frame. */
  public update(): void {
    if (this.buildingType === null || this.mesh === null) {
      return;
    }
    const topLeft = this.currentTopLeft();
    if (topLeft === null) {
      this.mesh.setEnabled(false);
      return;
    }

    const footprint = BUILDING_CONFIG[this.buildingType].footprint;
    const center: Vec2 = {
      x: (topLeft.tx + footprint.width / 2) * this.grid.tileSizePixels,
      y: (topLeft.ty + footprint.height / 2) * this.grid.tileSizePixels,
    };
    this.mesh.position = this.space.point(center, PREVIEW_HEIGHT);
    this.mesh.setEnabled(true);

    const valid = checkBuildingPlacement(this.world, this.grid, this.buildingType, topLeft).valid;
    this.mesh.material = this.materials.unlit(valid ? VALID_COLOR : INVALID_COLOR, PREVIEW_ALPHA);
  }

  public cancel(): void {
    this.buildingType = null;
    this.workerId = null;
    this.lastGroundPoint = null;
    this.disposeMesh();
  }

  public dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
    window.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.disposeMesh();
  }

  private disposeMesh(): void {
    this.mesh?.dispose();
    this.mesh = null;
  }

  /** Snaps so the footprint is centred under the pointer rather than trailing off one corner. */
  private currentTopLeft(): TileCoord | null {
    if (this.lastGroundPoint === null || this.buildingType === null) {
      return null;
    }
    const footprint = BUILDING_CONFIG[this.buildingType].footprint;
    const tile = this.grid.worldToTile(this.lastGroundPoint);
    return { tx: tile.tx - Math.floor(footprint.width / 2), ty: tile.ty - Math.floor(footprint.height / 2) };
  }

  private groundPointFrom(event: PointerEvent): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.scene.createPickingRayToRef(x, y, this.identity, this.ray, this.camera);
    const { origin, direction } = this.ray;
    if (direction.y > -1e-6) {
      return null;
    }
    const travel = -origin.y / direction.y;
    return this.space.toWorld(origin.x + direction.x * travel, origin.z + direction.z * travel);
  }
}
