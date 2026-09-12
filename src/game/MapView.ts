import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { CRYSTAL_FIELD_CONFIG } from '../config/crystalField';
import { cellVisibility, type FogState } from '../core/fog';
import type { PlayerId } from '../core/ids';
import type { MapGrid, ResourceField } from '../core/map';
import { createGroundTexture } from './groundTexture';
import type { MaterialLibrary } from './materials';
import { generateCrystalFieldLayout } from './models/crystalField';
import { buildModel } from './models/kit';
import { generateTerrainSceneryLayout } from './models/terrainScenery';
import { CRYSTAL_FIELD_TONES, FIELD_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The static battlefield: the ground the match is played on, the edge of the playable area, and the
 * crystal deposits standing in the resource fields.
 *
 * Everything here is read from the `MapGrid` and never decides a rule. Terrain scenery and crystal
 * deposits use deterministic layouts; this view only turns those layouts into merged geometry.
 */

/** How far past the map edge the ground keeps going, in map widths, so the horizon is never void. */
const SURROUND_SCALE = 4;

/** A depleted field still reads as something rather than vanishing outright. */
const MIN_FIELD_SCALE = 0.08;

export class MapView {
  private readonly meshes: Mesh[] = [];
  private readonly crystals: Mesh[] = [];
  private readonly scenery: { mesh: Mesh; tiles: readonly { tx: number; ty: number }[] }[] = [];
  private readonly crystalsByField = new Map<string, Mesh[]>();
  private readonly fogMaterials = new Map<Mesh, { normal: Mesh['material']; dim: Mesh['material'] }>();
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

    this.buildTerrainScenery(scene, materials, space);

    for (const field of grid.resourceFields) {
      const parts: Mesh[] = [];
      for (const tile of field.tiles) {
        const crystals = this.buildCrystals(scene, materials, space, field, tile);
        if (crystals === null) continue;
        parts.push(crystals);
        this.crystals.push(crystals);
        this.meshes.push(crystals);
        // Crystal positions are compressed toward the field center in buildCrystals.
        const bounds = crystals.getBoundingInfo().boundingBox.centerWorld;
        const world = space.toWorld(bounds.x, bounds.z);
        this.scenery.push({ mesh: crystals, tiles: [grid.worldToTile(world)] });
      }
      this.crystalsByField.set(field.id, parts);
    }
  }

  /** The ground mesh, which is what a click on open ground lands on. */
  public groundMesh(): Mesh {
    return this.ground;
  }

  /**
   * Shrinks a field's crystal deposit toward the ground as it is gathered out, so how much is left
   * reads at a glance instead of only through the HUD. `fraction` is remaining Credits over the
   * field's original total.
   */
  public setFieldFraction(fieldId: string, fraction: number): void {
    const mesh = this.crystalsByField.get(fieldId);
    if (mesh === undefined) {
      return;
    }
    for (const part of mesh) part.scaling.y = Math.max(fraction, MIN_FIELD_SCALE);
  }

  /** Applies fog to resource deposits, which stand above the terrain veil. */
  public updateFog(fog: FogState, player: PlayerId): void {
    for (const scenery of this.scenery) {
      this.applyTileFog(scenery.mesh, scenery.tiles, fog, player);
    }
  }

  /** Meshes that should cast a shadow. The ground itself only receives them. */
  public shadowCasters(): readonly Mesh[] {
    return this.scenery.map(({ mesh }) => mesh);
  }

  private buildTerrainScenery(scene: Scene, materials: MaterialLibrary, space: SceneSpace): void {
    for (const chunk of generateTerrainSceneryLayout(this.grid)) {
      for (const item of chunk.items) {
      const model = buildModel(scene, materials, `terrain:${chunk.id}:${item.tx}:${item.ty}`, (builder) => {
          const center = this.sceneTileCenter(space, item.tx, item.ty);
          const x = center.x + item.offsetX;
          const z = center.z - item.offsetY;
          if (item.kind === 'tree') {
            const trunkHeight = item.height * 0.36;
            builder.cylinder(
              { height: trunkHeight, diameter: item.width * 0.18, sides: 6, at: [x, trunkHeight / 2, z] },
              FIELD_TONES.treeTrunk,
            );
            builder.cylinder(
              {
                height: item.height * 0.48,
                diameter: item.width,
                diameterTop: item.width * 0.28,
                sides: 7,
                at: [x, trunkHeight + item.height * 0.2, z],
                turn: [0, item.turn, 0],
              },
              item.height > 1.7 ? FIELD_TONES.treeDark : FIELD_TONES.treeLight,
            );
            builder.cylinder(
              {
                height: item.height * 0.42,
                diameter: item.width * 0.7,
                diameterTop: 0.04,
                sides: 7,
                at: [x, trunkHeight + item.height * 0.5, z],
                turn: [0, item.turn + 0.35, 0],
              },
              FIELD_TONES.treeLight,
            );
          } else {
            builder.cylinder(
              {
                height: item.height,
                diameter: item.width,
                diameterTop: item.width * 0.28,
                sides: 5,
                at: [x, item.height / 2 - 0.02, z],
                turn: [0, item.turn, 0],
              },
              item.height > 1.85 ? FIELD_TONES.mountainLight : FIELD_TONES.mountainDark,
            );
          }
      });
      model.mesh.setEnabled(true);
      model.mesh.isPickable = false;
      model.mesh.checkCollisions = false;
      this.meshes.push(model.mesh);
      this.scenery.push({ mesh: model.mesh, tiles: [{ tx: item.tx, ty: item.ty }] });
      }
    }
  }

  // eslint-disable-next-line complexity -- Tile fog reduces several cell states into one shared mesh material state.
  private applyTileFog(
    mesh: Mesh,
    tiles: readonly { tx: number; ty: number }[],
    fog: FogState,
    player: PlayerId,
  ): void {
    let visibility: 'hidden' | 'explored' | 'visible' = 'visible';
    for (const tile of tiles) {
      const tileVisibility = cellVisibility(fog, player, tile.tx, tile.ty);
      if (tileVisibility === 'hidden') {
        visibility = 'hidden';
        break;
      }
      if (tileVisibility === 'explored') visibility = 'explored';
    }
    mesh.setEnabled(visibility !== 'hidden');
    mesh.visibility = 1;
    if (visibility === 'hidden') return;
    let pair = this.fogMaterials.get(mesh);
    if (pair === undefined) {
      const normal = mesh.material;
      const dim = normal?.clone(`${mesh.name}:explored`) ?? null;
      if (dim instanceof MultiMaterial) {
        dim.subMaterials = dim.subMaterials.map((material) => {
          const copy = material?.clone(`${material.name}:explored`) ?? null;
          if (copy instanceof StandardMaterial) {
            copy.diffuseColor = copy.diffuseColor.scale(0.42);
            copy.emissiveColor = copy.emissiveColor.scale(0.42);
            copy.specularColor = copy.specularColor.scale(0.42);
          }
          if (copy !== null) this.disposables.push(copy);
          return copy;
        });
      }
      if (dim !== null) this.disposables.push(dim);
      pair = { normal, dim };
      this.fogMaterials.set(mesh, pair);
    }
    mesh.material = visibility === 'explored' ? pair.dim : pair.normal;
  }

  public dispose(): void {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.meshes.length = 0;
    this.crystals.length = 0;
    this.scenery.length = 0;
    this.fogMaterials.clear();
    this.crystalsByField.clear();
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
    tile: { tx: number; ty: number },
  ): Mesh | null {
    const fullLayout = generateCrystalFieldLayout(field.tiles, CRYSTAL_FIELD_CONFIG);
    const layout = {
      rocks: fullLayout.rocks.filter((part) => part.tx === tile.tx && part.ty === tile.ty),
      shards: fullLayout.shards.filter((part) => part.tx === tile.tx && part.ty === tile.ty),
      fragments: fullLayout.fragments.filter((part) => part.tx === tile.tx && part.ty === tile.ty),
    };
    if (layout.rocks.length + layout.shards.length + layout.fragments.length === 0) return null;
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
