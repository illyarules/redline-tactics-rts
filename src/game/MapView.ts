import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { cellVisibility, type FogState } from '../core/fog';
import type { PlayerId } from '../core/ids';
import type { MapGrid, ResourceField } from '../core/map';
import { createGroundTexture } from './groundTexture';
import type { MaterialLibrary } from './materials';
import { buildModel, QUARTER_TURN } from './models/kit';
import { generateTerrainSceneryLayout } from './models/terrainScenery';
import { FIELD_TONES, GAS_FIELD_TONES } from './palette';
import type { SceneSpace } from './sceneSpace';

/**
 * The static battlefield: the ground the match is played on, the edge of the playable area, and the
 * compact gas extraction equipment standing in the resource fields.
 *
 * Everything here is read from the `MapGrid` and never decides a rule. This view only turns the
 * deterministic terrain data into merged geometry.
 */

/** How far past the map edge the ground keeps going, in map widths, so the horizon is never void. */
const SURROUND_SCALE = 4;

/** A depleted field still reads as something rather than vanishing outright. */
const MIN_FIELD_SCALE = 0.08;

export class MapView {
  private readonly meshes: Mesh[] = [];
  private readonly scenery: { mesh: Mesh; tiles: readonly { tx: number; ty: number }[] }[] = [];
  private readonly gasRigsByField = new Map<string, Mesh>();
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
      const rig = this.buildGasRig(scene, materials, space, field);
      this.gasRigsByField.set(field.id, rig);
      this.meshes.push(rig);
      this.scenery.push({ mesh: rig, tiles: [field.center] });
    }
  }

  /** The ground mesh, which is what a click on open ground lands on. */
  public groundMesh(): Mesh {
    return this.ground;
  }

  /**
   * Dims a depleted extraction rig while leaving its silhouette on the field. `fraction` is the
   * remaining Credits over the field's original total.
   */
  public setFieldFraction(fieldId: string, fraction: number): void {
    const mesh = this.gasRigsByField.get(fieldId);
    if (mesh === undefined) {
      return;
    }
    mesh.visibility = Math.max(fraction, MIN_FIELD_SCALE);
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
    this.scenery.length = 0;
    this.fogMaterials.clear();
    this.gasRigsByField.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  /** A narrow gas separator inspired by industrial columns and overhead pipework. */
  private buildGasRig(
    scene: Scene,
    materials: MaterialLibrary,
    space: SceneSpace,
    field: ResourceField,
  ): Mesh {
    const center = this.sceneTileCenter(space, field.center.tx, field.center.ty);
    const model = buildModel(scene, materials, `gas-rig:${field.id}`, (builder) => {
      const x = center.x;
      const z = center.z;
      builder.box({ size: [1.18, 0.12, 0.82], at: [x, 0.08, z] }, GAS_FIELD_TONES.platform)
        .cylinder({ height: 2.35, diameter: 0.34, diameterTop: 0.3, sides: 10, at: [x - 0.18, 1.28, z] }, GAS_FIELD_TONES.column)
        .cylinder({ height: 1.5, diameter: 0.25, sides: 10, at: [x + 0.35, 0.84, z + 0.12] }, GAS_FIELD_TONES.columnShade)
        .cylinder({ height: 0.78, diameter: 0.12, sides: 8, at: [x + 0.1, 1.83, z], turn: [0, 0, QUARTER_TURN] }, GAS_FIELD_TONES.pipe)
        .cylinder({ height: 0.62, diameter: 0.11, sides: 8, at: [x + 0.42, 1.55, z + 0.12] }, GAS_FIELD_TONES.pipe)
        .box({ size: [0.08, 2.18, 0.08], at: [x - 0.48, 1.18, z - 0.25] }, GAS_FIELD_TONES.frame)
        .box({ size: [0.08, 2.18, 0.08], at: [x + 0.48, 1.18, z - 0.25] }, GAS_FIELD_TONES.frame)
        .box({ size: [1.04, 0.07, 0.08], at: [x, 1.55, z - 0.25] }, GAS_FIELD_TONES.frame)
        .box({ size: [1.04, 0.07, 0.08], at: [x, 2.22, z - 0.25] }, GAS_FIELD_TONES.frame)
        .cylinder({ height: 0.18, diameter: 0.17, diameterTop: 0.05, sides: 8, at: [x - 0.18, 2.54, z] }, GAS_FIELD_TONES.lamp, 'glowing');
    });
    model.mesh.setEnabled(true);
    return model.mesh;
  }

  private sceneTileCenter(space: SceneSpace, tx: number, ty: number): { x: number; z: number } {
    const center = this.grid.tileCenter(tx, ty);
    return { x: space.sceneX(center.x), z: space.sceneZ(center.y) };
  }
}
