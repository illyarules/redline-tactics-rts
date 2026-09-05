import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { MapGrid, ResourceField } from '../core/map';
import { createGroundTexture } from './groundTexture';
import type { MaterialLibrary } from './materials';
import { buildModel } from './models/kit';
import { FIELD_TONES, NEUTRAL_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The static battlefield: the ground the match is played on, the edge of the playable area, and the
 * Credits crystals standing in the resource fields.
 *
 * Everything here is read from the `MapGrid` and never decides a rule. "Open Field" has no blocking
 * terrain at all, so there is nothing to build but the surface itself.
 */

/** How far past the map edge the ground keeps going, in map widths, so the horizon is never void. */
const SURROUND_SCALE = 4;
/** Shards per resource tile, and how large they get. Small numbers: a field is a cluster, not a forest. */
const CRYSTAL_HEIGHT_TILES = 1.05;
const CRYSTAL_DIAMETER_TILES = 0.58;
const SHARDS_PER_TILE = 1;

/** Deterministic value in [0, 1) so a field always grows the same crystals. */
function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x2545f491, 0x27d4eb2f) ^ Math.imul(y + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(salt + 0x165667b1, 0x1b873593);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

export class MapView {
  private readonly meshes: Mesh[] = [];
  private readonly crystals: Mesh[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly ground: Mesh;

  public constructor(
    scene: Scene,
    private readonly grid: MapGrid,
    space: SceneSpace,
    materials: MaterialLibrary,
  ) {
    const width = space.widthUnits;
    const depth = space.depthUnits;

    // The apron: the same field carrying on past the playable grid, in shade. It is only ever seen
    // in the far corners of a tilted view, so it is deliberately plain and sits just under the map.
    const surround = CreateGround(
      'map:surround',
      { width: width * SURROUND_SCALE, height: depth * SURROUND_SCALE },
      scene,
    );
    surround.position = new Vector3(width / 2, -0.04, depth / 2);
    surround.material = materials.surface(FIELD_TONES.surround);
    surround.isPickable = false;
    this.meshes.push(surround);

    this.ground = CreateGround('map:ground', { width, height: depth }, scene);
    this.ground.position = new Vector3(width / 2, 0, depth / 2);
    const groundMaterial = new StandardMaterial('map:ground', scene);
    const texture = createGroundTexture(scene, grid);
    groundMaterial.diffuseTexture = texture;
    groundMaterial.specularColor = Color3.Black();
    this.ground.material = groundMaterial;
    this.ground.receiveShadows = true;
    this.meshes.push(this.ground);
    this.disposables.push(texture, groundMaterial);

    // The textured apron continues the field without a bright seam at the bounds.
    surround.material = groundMaterial;
    surround.receiveShadows = true;

    for (const field of grid.resourceFields) {
      const crystals = this.buildCrystals(scene, materials, space, field);
      this.crystals.push(crystals);
      this.meshes.push(crystals);
    }
  }

  /** The ground mesh, which is what a click on open ground lands on. */
  public groundMesh(): Mesh {
    return this.ground;
  }

  /** Meshes that should cast a shadow. The ground itself only receives them. */
  public shadowCasters(): readonly Mesh[] {
    return this.crystals;
  }

  public dispose(): void {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.meshes.length = 0;
    this.crystals.length = 0;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  /**
   * One resource field's crystals, merged into a single mesh. A field is a cluster of tall cyan
   * shards on the tiles the field data already describes, jittered so the cluster never looks
   * stamped, and it is the only saturated cool thing on the field besides the player's own colour.
   */
  private buildCrystals(
    scene: Scene,
    materials: MaterialLibrary,
    space: SceneSpace,
    field: ResourceField,
  ): Mesh {
    const model = buildModel(scene, materials, `crystals:${field.id}`, (builder) => {
      for (const [index, tile] of field.tiles.entries()) {
        if (index % 2 !== 0) continue;
        const center = this.grid.tileCenter(tile.tx, tile.ty);
        const x = space.sceneX(center.x);
        const z = space.sceneZ(center.y);
        builder.cylinder({height: 0.08, diameter: 1.35, diameterTop: 1.1,
          sides: 7, at: [x, 0.04, z]}, 0x586560);
        builder.cylinder({height: 0.025, diameter: 0.72, sides: 7,
          at: [x, 0.09, z]}, 0x368c93, 'glowing');
        for (let shard = 0; shard < SHARDS_PER_TILE; shard++) {
          const salt = index * SHARDS_PER_TILE + shard;
          const scale = 0.45 + hash01(tile.tx, tile.ty, salt) * 0.75;
          const height = CRYSTAL_HEIGHT_TILES * scale;
          builder.cylinder(
            {
              height,
              diameter: CRYSTAL_DIAMETER_TILES * scale,
              diameterTop: 0,
              sides: 5,
              at: [
                space.sceneX(center.x) + (hash01(tile.tx, tile.ty, salt + 64) - 0.5) * 0.7,
                height / 2 + 0.08,
                space.sceneZ(center.y) + (hash01(tile.tx, tile.ty, salt + 128) - 0.5) * 0.7,
              ],
              turn: [
                (hash01(tile.tx, tile.ty, salt + 192) - 0.5) * 0.35,
                0,
                (hash01(tile.tx, tile.ty, salt + 256) - 0.5) * 0.35,
              ],
            },
            NEUTRAL_TONES.crystal,
            'surface',
          );
        }
      }
    });

    // A field's crystals are unique geometry rather than a role's prototype, so the merged mesh is
    // shown directly instead of being cloned per entity the way `EntitiesView` uses a model.
    model.mesh.setEnabled(true);
    return model.mesh;
  }
}
