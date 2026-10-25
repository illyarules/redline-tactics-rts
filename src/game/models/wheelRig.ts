import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { VehiclePose, WheelGeometry } from '../vehicleMotionState';

interface Wheel {
  readonly pivot: TransformNode;
  readonly left: boolean;
  readonly front: boolean;
}

const WHEEL_NODE = /Wheel(Front|Middle|Rear)(Left|Right)$/;

/**
 * Presentation-only wheels of one cloned vehicle model. Each `Wheel…` pivot is spun about its axle
 * (local X) and, at the front, steered about the vertical. Pivots are written outright every
 * frame, so nothing accumulates, and the hull's authoritative facing is never touched.
 */
export class WheelRig {
  private constructor(
    private readonly wheels: readonly Wheel[],
    /** -1 when the loader's handedness conversion mirrors the model, which flips both rotations. */
    private readonly sign: 1 | -1,
    public readonly geometry: WheelGeometry,
  ) {}

  /** `null` when the model has no separate wheels, e.g. a tracked tank or the procedural fallback. */
  public static find(modelRoot: Mesh): WheelRig | null {
    const wheels: Wheel[] = [];
    for (const node of modelRoot.getDescendants(false)) {
      const match = WHEEL_NODE.exec(node.name);
      if (match !== null) wheels.push({ pivot: node as TransformNode, left: match[2] === 'Left', front: match[1] === 'Front' });
    }
    const first = wheels[0];
    if (first === undefined || first.pivot.parent === null) return null;
    const chain: TransformNode[] = [];
    for (let node: TransformNode | null = first.pivot.parent as TransformNode; node !== null; node = node.parent as TransformNode | null) {
      chain.unshift(node);
    }
    for (const node of chain) node.computeWorldMatrix(true);
    const sign = (first.pivot.parent as TransformNode).getWorldMatrix().determinant() < 0 ? -1 : 1;
    const scale = Math.abs(modelRoot.scaling.x) || 1;
    const bounds = first.pivot.getHierarchyBoundingVectors(true);
    const radius = (bounds.max.y - bounds.min.y) / 2;
    const halfTrack = Math.abs(first.pivot.position.x) * scale;
    for (const wheel of wheels) wheel.pivot.rotationQuaternion ??= Quaternion.FromEulerAngles(
      wheel.pivot.rotation.x, wheel.pivot.rotation.y, wheel.pivot.rotation.z,
    );
    return new WheelRig(wheels, sign, { radius, halfTrack });
  }

  public apply(pose: VehiclePose): void {
    for (const wheel of this.wheels) {
      const spin = (wheel.left ? pose.spinLeft : pose.spinRight) * this.sign;
      const steer = wheel.front ? pose.steer * this.sign : 0;
      Quaternion.RotationYawPitchRollToRef(steer, spin, 0, wheel.pivot.rotationQuaternion as Quaternion);
    }
  }
}
