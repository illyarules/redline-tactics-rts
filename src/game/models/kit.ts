import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { MaterialLibrary } from '../materials';

/**
 * The small set of shapes every model in the game is made of, and the rule that a finished model is
 * one mesh.
 *
 * Each model is assembled from boxes and cylinders standing on the ground plane, then merged into a
 * single mesh with one submesh per colour. Merging is what makes the models affordable: a match with
 * a hundred units draws a handful of shapes each, not a hundred stacks of parts. The merged mesh is
 * a prototype — `EntitiesView` clones it per entity, and clones share its geometry and materials.
 *
 * TODO(post-MVP): clones each cost their own draw call. GPU instancing would collapse a whole role
 * into one, but it is a change to make once profiling asks for it, not before.
 *
 * Everything here is measured in **tiles**, matching `SceneSpace`: a unit roughly a tile across is
 * about 1 wide, and `y` is height above the ground.
 */
export interface ModelSpec {
  /** The prototype mesh, already merged. Not placed in the scene: clone it. */
  readonly mesh: Mesh;
  /** How tall the model stands, in tiles. Health bars and labels sit above it. */
  readonly height: number;
}

export interface PartPlacement {
  /** Centre of the part, in tiles. `y` is the height of the part's centre above the ground. */
  readonly at: readonly [x: number, y: number, z: number];
  /** Rotation in radians, applied before the part is baked into the model. */
  readonly turn?: readonly [x: number, y: number, z: number];
}

export interface BoxSpec extends PartPlacement {
  readonly size: readonly [width: number, height: number, depth: number];
}

export interface CylinderSpec extends PartPlacement {
  readonly height: number;
  readonly diameter: number;
  /** For cones and tapers. Defaults to `diameter`. */
  readonly diameterTop?: number;
  /** Low counts keep the models faceted, which is the look. */
  readonly sides?: number;
}

/** How the part takes light. `glowing` and `unlit` are for lamps, panels and crystal only. */
export type PartFinish = 'surface' | 'glowing' | 'unlit';

/** Collects parts and merges them into one model. Use `buildModel`. */
export class ModelBuilder {
  private readonly parts: Mesh[] = [];

  public constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly name: string,
  ) {}

  public box(spec: BoxSpec, color: number, finish: PartFinish = 'surface'): this {
    const [width, height, depth] = spec.size;
    return this.add(
      CreateBox(`${this.name}:box${this.parts.length}`, { width, height, depth }, this.scene),
      spec,
      color,
      finish,
    );
  }

  public cylinder(spec: CylinderSpec, color: number, finish: PartFinish = 'surface'): this {
    return this.add(
      CreateCylinder(
        `${this.name}:cyl${this.parts.length}`,
        {
          height: spec.height,
          diameterTop: spec.diameterTop ?? spec.diameter,
          diameterBottom: spec.diameter,
          tessellation: spec.sides ?? 12,
        },
        this.scene,
      ),
      spec,
      color,
      finish,
    );
  }

  /** Merges everything added so far. The builder must not be used afterwards. */
  public finish(): ModelSpec {
    const merged = Mesh.MergeMeshes(this.parts, true, true, undefined, false, true);
    if (merged === null) {
      throw new Error(`Model "${this.name}" has no parts to merge`);
    }

    merged.name = this.name;
    merged.isPickable = false;
    // The prototype is never shown; only its clones are.
    merged.setEnabled(false);

    return { mesh: merged, height: merged.getBoundingInfo().boundingBox.maximum.y };
  }

  private add(mesh: Mesh, placement: PartPlacement, color: number, finish: PartFinish): this {
    mesh.position = new Vector3(placement.at[0], placement.at[1], placement.at[2]);
    if (placement.turn !== undefined) {
      mesh.rotation = new Vector3(placement.turn[0], placement.turn[1], placement.turn[2]);
    }
    mesh.material =
      finish === 'surface'
        ? this.materials.surface(color)
        : finish === 'glowing'
          ? this.materials.glowing(color)
          : this.materials.unlit(color);

    this.parts.push(mesh);
    return this;
  }
}

export function buildModel(
  scene: Scene,
  materials: MaterialLibrary,
  name: string,
  parts: (builder: ModelBuilder) => void,
): ModelSpec {
  const builder = new ModelBuilder(scene, materials, name);
  parts(builder);
  return builder.finish();
}

/** A quarter turn, the rotation that lays a cylinder on its side pointing along `x`. */
export const QUARTER_TURN = Math.PI / 2;
