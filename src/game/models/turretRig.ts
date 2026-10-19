import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { TurretProfile } from '../../config/types';
import { RecoilState, stepTurretYaw } from '../vehicleEffectsState';

const TURRET_NODE = 'TurretPivot';
const BARREL_NODE = 'BarrelPivot';

function findNode(root: TransformNode, suffix: string): TransformNode | null {
  const found = root.getDescendants(false).find((node) => node.name.endsWith(suffix));
  return found === undefined ? null : (found as TransformNode);
}

/**
 * Presentation-only turret and barrel of one cloned vehicle model.
 *
 * The articulated GLBs carry a `TurretPivot` (yaw) holding a `BarrelPivot` (recoil). This rig owns
 * the turret's yaw *relative to the hull* and the barrel's recoil offset; the hull's authoritative
 * `facingRadians` is never touched. Both pivots are written from a remembered rest pose, so
 * repeated shots cannot accumulate drift.
 */
export class TurretRig {
  private yaw = 0;
  private readonly recoil = new RecoilState();
  private shotAim: { x: number; y: number } | null = null;
  private shotAimRemaining = 0;
  private muzzleLength: number | null = null;
  private lastRecoilTiles = Number.NaN;

  private constructor(
    private readonly profile: TurretProfile,
    private readonly turret: TransformNode,
    private readonly barrel: TransformNode,
    private readonly barrelMesh: Mesh | null,
    /** -1 when the loader's handedness conversion mirrors the hull, which flips yaw. */
    private readonly yawSign: 1 | -1,
    private readonly restX: number,
    private readonly restY: number,
    private readonly restZ: number,
    /** Scene units per model unit, for turning a recoil in tiles into a local offset. */
    private readonly modelScale: number,
  ) {}

  /** `null` when the model has no articulated turret, e.g. the procedural fallback. */
  public static find(modelRoot: Mesh, profile: TurretProfile): TurretRig | null {
    const turret = findNode(modelRoot, TURRET_NODE);
    const barrel = findNode(modelRoot, BARREL_NODE);
    if (turret === null || barrel === null || turret.parent === null) return null;
    const parent = turret.parent as TransformNode;
    // Fresh clones have no valid world matrices yet; build them top-down to read the mirroring.
    const chain: TransformNode[] = [];
    for (let node: TransformNode | null = parent; node !== null; node = node.parent as TransformNode | null) chain.unshift(node);
    for (const node of chain) node.computeWorldMatrix(true);
    const yawSign = parent.getWorldMatrix().determinant() < 0 ? -1 : 1;
    const scale = Math.abs(modelRoot.scaling.x) || 1;
    const barrelMesh = (barrel.getChildMeshes(true)[0] as Mesh | undefined) ?? null;
    return new TurretRig(
      profile, turret, barrel, barrelMesh, yawSign,
      barrel.position.x, barrel.position.y, barrel.position.z, scale,
    );
  }

  /** Remembers where a shot was fired, so a unit with no visible order target still faces it briefly. */
  public noteShot(target: { readonly x: number; readonly y: number }, holdSeconds: number): void {
    this.shotAim = { x: target.x, y: target.y };
    this.shotAimRemaining = holdSeconds;
    this.recoil.trigger(this.profile);
  }

  /** The point a shot-based aim is pointing at, while its hold lasts. */
  public get heldShotAim(): { readonly x: number; readonly y: number } | null {
    return this.shotAimRemaining > 0 ? this.shotAim : null;
  }

  /** Turret yaw relative to the hull, in radians. */
  public get relativeYaw(): number { return this.yaw; }

  public update(hullFacing: number, aimHeading: number | null, deltaSeconds: number): void {
    if (deltaSeconds > 0) {
      this.yaw = stepTurretYaw(this.yaw, aimHeading, hullFacing, deltaSeconds, this.profile.maxTurnRadiansPerSecond);
      this.recoil.advance(deltaSeconds);
      this.shotAimRemaining = Math.max(0, this.shotAimRemaining - deltaSeconds);
    }
    this.applyYaw();
    this.applyRecoil();
  }

  /**
   * Where a shell leaves the barrel, in scene space, written into `out`. Measured from the barrel
   * mesh's own bounds the first time, so it follows whatever model is loaded.
   */
  public muzzlePointToRef(hullFacing: number, out: Vector3): Vector3 {
    this.barrel.computeWorldMatrix(true);
    const heading = hullFacing + this.yaw;
    out.copyFrom(this.barrel.getAbsolutePosition());
    this.muzzleLength ??= this.measureMuzzleLength(heading);
    out.x += Math.sin(heading) * this.muzzleLength;
    out.z += Math.cos(heading) * this.muzzleLength;
    return out;
  }

  private measureMuzzleLength(heading: number): number {
    const mesh = this.barrelMesh;
    if (mesh === null) return this.profile.fallbackMuzzleLengthTiles;
    mesh.computeWorldMatrix(true);
    const pivot = this.barrel.getAbsolutePosition();
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    let tip = 0;
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
      tip = Math.max(tip, (corner.x - pivot.x) * dx + (corner.z - pivot.z) * dz);
    }
    return tip > 1e-3 ? tip : this.profile.fallbackMuzzleLengthTiles;
  }

  private applyYaw(): void {
    const angle = this.yaw * this.yawSign;
    if (this.turret.rotationQuaternion === null) {
      this.turret.rotation.y = angle;
    } else {
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, angle, this.turret.rotationQuaternion);
    }
  }

  private applyRecoil(): void {
    const tiles = this.recoil.offsetTiles(this.profile);
    if (tiles === this.lastRecoilTiles) return;
    this.lastRecoilTiles = tiles;
    // Always rest + offset, never `+=`: the pivot returns exactly home however many shots were fired.
    this.barrel.position.set(
      this.restX,
      this.restY,
      this.restZ - Math.sign(this.restZ || 1) * (tiles / this.modelScale),
    );
  }
}
