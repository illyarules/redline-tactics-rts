import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { CRYSTAL_FIELD_CONFIG } from '../config/crystalField';
import type { MapGrid, ResourceField } from '../core/map';
import { createGroundTexture } from './groundTexture';
import type { MaterialLibrary } from './materials';
import { generateCrystalFieldLayout } from './models/crystalField';
import { buildModel } from './models/kit';
import { CRYSTAL_FIELD_TONES, FIELD_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The static battlefield: the ground the match is played on, the edge of the playable area, and the
 * crystal deposits standing in the resource fields.
 *
 * Everything here is read from the `MapGrid` and never decides a rule. "Open Field" has no blocking
 * terrain at all, so there is nothing to build but the surface itself. A deposit's own layout —
 * where its shards, rocks and fragments sit — comes from `generateCrystalFieldLayout`, so the same
 * map always grows the same crystals; this view only turns that layout into merged geometry.
 */

/** How far past the map edge the ground keeps going, in map widths, so the horizon is never void. */
const SURROUND_SCALE = 4;

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
   * One resource field's crystal deposit, merged into a single mesh: a dense, irregular group of
   * faceted cyan gems rooted directly in the grass. This follows the concept art deliberately — no
   * pads, glowing circles or generic rock scatter competing with the crystals' silhouette.
   */
  private buildCrystals(
    scene: Scene,
    materials: MaterialLibrary,
    space: SceneSpace,
    field: ResourceField,
  ): Mesh {
    const layout = generateCrystalFieldLayout(field.tiles, CRYSTAL_FIELD_CONFIG);
    const config = CRYSTAL_FIELD_CONFIG;

    const model = buildModel(scene, materials, `crystals:${field.id}`, (builder) => {
      const center = this.sceneTileCenter(space, field.center.tx, field.center.ty);
      for (const rock of layout.rocks) {
        const { x, z } = this.sceneTileCenter(space, rock.tx, rock.ty);
        const rx = center.x + (x + rock.offsetXTiles - center.x) * 0.7;
        const rz = center.z + (z + rock.offsetZTiles - center.z) * 0.7;
        builder.cylinder(
          {
            height: rock.heightTiles,
            diameter: rock.diameterTiles,
            diameterTop: rock.diameterTiles * 0.7,
            sides: 6,
            at: [rx, rock.heightTiles / 2 + 0.09, rz],
            turn: [0, rock.rotationRadians, 0],
          },
          CRYSTAL_FIELD_TONES.rock,
        );
      }
      for (const shard of layout.shards) {
        const { x, z } = this.sceneTileCenter(space, shard.tx, shard.ty);
        // Pull the deterministic tile samples toward the field centre, so a radius-three resource
        // field reads as a dense vein with negative space around it rather than a loose ring.
        const sx = center.x + (x + shard.offsetXTiles - center.x) * 0.7;
        const sz = center.z + (z + shard.offsetZTiles - center.z) * 0.7;
        const baseHeight = shard.heightTiles * config.lowerBandShare;
        const crownHeight = shard.heightTiles - baseHeight;
        const groundY = 0.025;
        // Two pyramidal rings make a true low-poly gem: narrow at the ground, widest at its
        // shoulder, then tapering to a point. The prior shape widened at the ground and read as a
        // traffic cone from this camera.
        builder.cylinder(
          {
            height: baseHeight,
            diameter: shard.lowerDiameterTiles * 0.14,
            diameterTop: shard.lowerDiameterTiles,
            sides: shard.sides,
            at: [sx, groundY + baseHeight / 2, sz],
            turn: [shard.tiltXRadians, shard.rotationRadians, shard.tiltZRadians],
          },
          CRYSTAL_FIELD_TONES.crystalLower,
        );
        builder.cylinder(
          {
            height: crownHeight,
            diameter: shard.lowerDiameterTiles,
            diameterTop: shard.capDiameterTiles,
            sides: shard.sides,
            at: [sx, groundY + baseHeight + crownHeight / 2, sz],
            turn: [shard.tiltXRadians, shard.rotationRadians, shard.tiltZRadians],
          },
          CRYSTAL_FIELD_TONES.crystalUpper,
        );
      }
      for (const fragment of layout.fragments) {
        const { x, z } = this.sceneTileCenter(space, fragment.tx, fragment.ty);
        const fx = center.x + (x + fragment.offsetXTiles - center.x) * 0.7;
        const fz = center.z + (z + fragment.offsetZTiles - center.z) * 0.7;
        // Tipped onto its side near the ground: a shard that broke off rather than one still growing.
        builder.cylinder(
          {
            height: fragment.lengthTiles,
            diameter: fragment.lengthTiles * 0.3,
            diameterTop: fragment.lengthTiles * 0.14,
            sides: 5,
            at: [fx, 0.1, fz],
            turn: [fragment.tiltXRadians, fragment.rotationRadians, fragment.tiltZRadians],
          },
          CRYSTAL_FIELD_TONES.fragment,
        );
      }
    });

    // A field's crystals are unique geometry rather than a role's prototype, so the merged mesh is
    // shown directly instead of being cloned per entity the way `EntitiesView` uses a model.
    model.mesh.setEnabled(true);
    return model.mesh;
  }

  private sceneTileCenter(space: SceneSpace, tx: number, ty: number): { x: number; z: number } {
    const center = this.grid.tileCenter(tx, ty);
    return { x: space.sceneX(center.x), z: space.sceneZ(center.y) };
  }
}
