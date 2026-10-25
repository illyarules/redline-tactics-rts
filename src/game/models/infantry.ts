import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Node } from '@babylonjs/core/node';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId } from '../../core/ids';
import fpvUrl from '../../assets/models/meridian-fpv-operators.glb?url';
import infantryUrl from '../../assets/models/meridian-infantry-squad.glb?url';
import { SQUAD_DRONE_CONFIG, SQUAD_ROLES } from '../../config/squad';
import type { SquadRoleId } from '../../config/types';
import { color3, OWNER_PALETTES } from '../palette';
import type { ModelSpec } from './kit';
import type { FpvSquadParts, SoldierPartPrototypes } from './soldier';

/** The four riflemen of the infantry study, in formation-slot order: lead first. */
const INFANTRY_SOLDIERS = ['Soldier1', 'Soldier2', 'Soldier3', 'Soldier4'] as const;
/** The three operators of the FPV squad study, in formation-slot order: lead first. */
const FPV_OPERATORS = ['Operator1', 'Operator2', 'Operator3'] as const;
/**
 * How tall a soldier stands in the Blender studies, helmet top to boot sole, in Blender units
 * (`soldier_torso` and `soldier_leg` in `scripts/blender/meridian_common.py`). The game scale is
 * the role's configured stand height divided by this, so both squads share one scale.
 */
const MODEL_HEIGHT_UNITS = 1.06;

type Finder = (name: string) => Node;

/**
 * One scene-local asset load, turned into the same part prototypes the procedural soldier uses:
 * a body, a rifle arm and two legs per rifleman, each baked relative to its pivot so
 * `instantiateSoldier` can hang them on the nodes the walk cycle swings. One material set per owner.
 */
export async function loadInfantryParts(scene: Scene): Promise<Map<PlayerId, readonly SoldierPartPrototypes[]>> {
  const parts = new Map<PlayerId, readonly SoldierPartPrototypes[]>();
  await loadOwners(scene, infantryUrl, 'infantry', (find, owner) => {
    parts.set(owner, INFANTRY_SOLDIERS.map(name => bakeSoldier(find, owner, 'infantry', 'infantry', name)));
  });
  return parts;
}

/** The FPV Drone Operators study: three different specialists, one prototype set each, plus the drone baked as a ground prop. */
export async function loadFpvOperatorParts(scene: Scene): Promise<Map<PlayerId, FpvSquadParts>> {
  const parts = new Map<PlayerId, FpvSquadParts>();
  await loadOwners(scene, fpvUrl, 'fpv', (find, owner) => {
    const soldiers = FPV_OPERATORS.map(name => bakeSoldier(find, owner, 'fpv', 'fpvOperators', name));
    const dronePivot = (find('FPVDrone') as TransformNode).getAbsolutePosition().clone();
    const drone: ModelSpec = {
      mesh: bakePart(find('FPVDroneMesh'), dronePivot, SQUAD_DRONE_CONFIG.modelScaleTiles, `fpv:${owner}:drone`),
      height: 0,
    };
    drone.mesh.computeWorldMatrix(true);
    parts.set(owner, { soldiers, drone });
  });
  return parts;
}

/** Instantiates `url` once per owner, recolours it and hands `bake` a finder for its named nodes. */
async function loadOwners(
  scene: Scene,
  url: string,
  prefix: string,
  bake: (find: Finder, owner: PlayerId) => void,
): Promise<void> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) {
    container.dispose();
    return;
  }
  for (const owner of ['player', 'ai', 'ai2'] as const) {
    const instance = container.instantiateModelsToScene(name => `${prefix}:${owner}:${name}`, true, { doNotInstantiate: true });
    const find: Finder = name => {
      for (const root of instance.rootNodes) {
        const hit = root.getDescendants(false, node => node.name.endsWith(`:${name}`))[0];
        if (hit !== undefined) return hit;
      }
      throw new Error(`Model ${url} is missing ${name}.`);
    };
    recolor(instance.rootNodes, owner);
    for (const root of instance.rootNodes) root.computeWorldMatrix?.(true);
    bake(find, owner);
    // The loaded hierarchy only fed the baked parts.
    for (const root of instance.rootNodes) root.dispose(false, false);
  }
  // Baked parts share the container's materials. Keep them alive for the scene lifetime.
  scene.onDisposeObservable.addOnce(() => container.dispose());
}

function modelScale(role: SquadRoleId): number {
  return SQUAD_ROLES[role].standHeightTiles / MODEL_HEIGHT_UNITS;
}

/** One soldier's prototypes, baked relative to its own pivots and scaled to tiles. */
function bakeSoldier(
  find: Finder,
  owner: PlayerId,
  prefix: string,
  role: SquadRoleId,
  template: string,
): SoldierPartPrototypes {
  const origin = (find(template) as TransformNode).getAbsolutePosition().clone();
  const pivotAt = (suffix: string): Vector3 => (find(`${template}_${suffix}`) as TransformNode).getAbsolutePosition().subtract(origin);
  const arms = pivotAt('Arms');
  const hipA = pivotAt('LegLeft');
  const hipB = pivotAt('LegRight');
  const [legLeft, legRight] = hipA.x <= hipB.x ? [hipA, hipB] : [hipB, hipA];
  const name = `${prefix}:${owner}:${template}`;
  const scale = modelScale(role);
  // The rifle's tip, measured from the arms pivot. Only the infantry study has one.
  const muzzle = role === 'infantry' ? pivotAt('Muzzle').subtract(arms).scale(scale) : Vector3.Zero();

  // Merge in world space (this keeps the loader's handedness conversion), then move the origin
  // to the pivot and scale to tiles.
  const part = (label: string, pivot: Vector3, node: Node): ModelSpec => ({
    mesh: bakePart(node, origin.add(pivot), scale, `${name}:${label}`),
    height: 0,
  });
  return {
    torso: part('torso', new Vector3(0, 0, 0), find(`${template}_BodyMesh`)),
    rifleArm: part('rifleArm', arms, find(`${template}_ArmsMesh`)),
    legLeft: part('legLeft', legLeft, find(`${template}_LegLeftMesh`)),
    legRight: part('legRight', legRight, find(`${template}_LegRightMesh`)),
    standHeightTiles: SQUAD_ROLES[role].standHeightTiles,
    hipHeightTiles: legLeft.y * scale,
    hipOffsetTiles: Math.abs(legLeft.x) * scale,
    shoulderOffset: arms.scale(scale),
    muzzleOffset: muzzle,
  };
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
  if (merged === null) throw new Error(`Model part ${name} has no geometry.`);
  merged.name = name;
  merged.parent = null;
  merged.bakeTransformIntoVertices(Matrix.Translation(-pivot.x, -pivot.y, -pivot.z).multiply(Matrix.Scaling(scale, scale, scale)));
  merged.isPickable = true;
  merged.receiveShadows = true;
  merged.setEnabled(false);
  return merged;
}
