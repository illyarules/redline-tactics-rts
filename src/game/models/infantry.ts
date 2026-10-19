import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId } from '../../core/ids';
import infantryUrl from '../../assets/models/meridian-infantry-squad.glb?url';
import { color3, OWNER_PALETTES } from '../palette';
import type { ModelSpec } from './kit';
import type { SoldierPartPrototypes } from './soldier';

/** The soldier the squad study uses as the template for every soldier in a game squad. */
const TEMPLATE = 'Soldier2';
/** Height the finished soldier stands, in tiles, matching the procedural soldier it replaces. */
const STAND_HEIGHT_TILES = 0.77;

/**
 * One scene-local asset load, turned into the same part prototypes the procedural soldier uses:
 * a body, a rifle arm and two legs, each baked relative to its pivot so `instantiateSoldier` can
 * hang them on the nodes the walk cycle swings. One material set per owner.
 */
export async function loadInfantryParts(scene: Scene): Promise<Map<PlayerId, SoldierPartPrototypes>> {
  const container = await LoadAssetContainerAsync(infantryUrl, scene);
  const parts = new Map<PlayerId, SoldierPartPrototypes>();
  if (scene.isDisposed) {
    container.dispose();
    return parts;
  }
  for (const owner of ['player', 'ai', 'ai2'] as const) {
    const instance = container.instantiateModelsToScene(name => `infantry:${owner}:${name}`, true, { doNotInstantiate: true });
    const find = (name: string): Node => {
      for (const root of instance.rootNodes) {
        const hit = root.getDescendants(false, node => node.name.endsWith(`:${name}`))[0];
        if (hit !== undefined) return hit;
      }
      throw new Error(`Infantry model is missing ${name}.`);
    };
    recolor(instance.rootNodes, owner);
    for (const root of instance.rootNodes) root.computeWorldMatrix?.(true);

    const origin = (find(TEMPLATE) as Mesh).getAbsolutePosition().clone();
    const pivotAt = (suffix: string): Vector3 => (find(`${TEMPLATE}_${suffix}`) as Mesh).getAbsolutePosition().subtract(origin);
    const arms = pivotAt('Arms');
    const hipA = pivotAt('LegLeft');
    const hipB = pivotAt('LegRight');
    const [legLeft, legRight] = hipA.x <= hipB.x ? [hipA, hipB] : [hipB, hipA];

    // Merge in world space (this keeps the loader's handedness conversion), then move the origin
    // to the pivot and scale to tiles.
    const body = bakePart(find(`${TEMPLATE}_BodyMesh`), origin, 1, `infantry:${owner}:body`);
    body.computeWorldMatrix(true);
    const scale = STAND_HEIGHT_TILES / body.getBoundingInfo().boundingBox.maximumWorld.y;
    const part = (name: string, pivot: Vector3, node: Node): ModelSpec => ({
      mesh: bakePart(node, origin.add(pivot), scale, `infantry:${owner}:${name}`),
      height: 0,
    });
    body.dispose();
    const prototypes: SoldierPartPrototypes = {
      torso: part('torso', new Vector3(0, 0, 0), find(`${TEMPLATE}_BodyMesh`)),
      rifleArm: part('rifleArm', arms, find(`${TEMPLATE}_ArmsMesh`)),
      legLeft: part('legLeft', legLeft, find(`${TEMPLATE}_LegLeftMesh`)),
      legRight: part('legRight', legRight, find(`${TEMPLATE}_LegRightMesh`)),
      standHeightTiles: STAND_HEIGHT_TILES,
      hipHeightTiles: legLeft.y * scale,
      hipOffsetTiles: Math.abs(legLeft.x) * scale,
      shoulderOffset: arms.scale(scale),
    };
    parts.set(owner, prototypes);
    // The loaded hierarchy only fed the baked parts above.
    for (const root of instance.rootNodes) root.dispose(false, false);
  }
  // Baked parts share the container's materials. Keep them alive for the scene lifetime.
  scene.onDisposeObservable.addOnce(() => container.dispose());
  return parts;
}

function recolor(roots: readonly Node[], owner: PlayerId): void {
  const palette = OWNER_PALETTES[owner];
  for (const root of roots) {
    for (const mesh of root.getChildMeshes()) {
      const mat = mesh.material;
      if (!(mat instanceof PBRMaterial)) continue;
      if (mat.name.includes('deep teal')) mat.albedoColor = color3(palette.body).toLinearSpace();
      if (mat.name.includes('light panels')) mat.albedoColor = color3(palette.light).toLinearSpace();
      if (mat.name.includes('TeamColor')) mat.albedoColor = color3(palette.accent).toLinearSpace();
      // The battlefield uses direct lights, without a studio reflection environment.
      mat.metallic = Math.min(mat.metallic ?? 0, 0.1);
      mat.roughness = Math.max(mat.roughness ?? 0.5, 0.5);
    }
  }
}

/** One disabled mesh holding `node`'s primitives, translated by `-pivot` and scaled. */
function bakePart(node: Node, pivot: Vector3, scale: number, name: string): Mesh {
  const primitives = [node, ...node.getChildMeshes()].filter(
    (part): part is Mesh => part instanceof Mesh && part.getTotalVertices() > 0,
  );
  const merged = Mesh.MergeMeshes(primitives.map(p => p.clone(`${name}:src`)), true, true, undefined, false, true);
  if (merged === null) throw new Error(`Infantry part ${name} has no geometry.`);
  merged.name = name;
  merged.parent = null;
  merged.bakeTransformIntoVertices(Matrix.Translation(-pivot.x, -pivot.y, -pivot.z).multiply(Matrix.Scaling(scale, scale, scale)));
  merged.isPickable = true;
  merged.receiveShadows = true;
  merged.setEnabled(false);
  return merged;
}
