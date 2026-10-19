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
import { color3, OWNER_PALETTES } from '../palette';
import type { ModelSpec } from './kit';
import type { FpvSquadParts, SoldierPartPrototypes } from './soldier';

/** The soldier the squad study uses as the template for every soldier in a game squad. */
const TEMPLATE = 'Soldier2';
/** Height the finished soldier stands, in tiles, matching the procedural soldier it replaces. */
const STAND_HEIGHT_TILES = 0.77;
/** The three operators of the FPV squad study, in formation-slot order: lead, rear left, rear right. */
const FPV_OPERATORS = ['Operator1', 'Operator2', 'Operator3'] as const;

type Finder = (name: string) => Node;

/**
 * One scene-local asset load, turned into the same part prototypes the procedural soldier uses:
 * a body, a rifle arm and two legs, each baked relative to its pivot so `instantiateSoldier` can
 * hang them on the nodes the walk cycle swings. One material set per owner.
 */
export async function loadInfantryParts(scene: Scene): Promise<Map<PlayerId, SoldierPartPrototypes>> {
  const parts = new Map<PlayerId, SoldierPartPrototypes>();
  await loadOwners(scene, infantryUrl, 'infantry', (find, owner) => {
    parts.set(owner, bakeSoldier(find, owner, 'infantry', TEMPLATE, null).prototypes);
  });
  return parts;
}

/**
 * The FPV Drone Operators study: three different specialists, one prototype set each, plus the
 * drone baked as a ground prop. All three share one scale so their heights match the study.
 */
export async function loadFpvOperatorParts(scene: Scene): Promise<Map<PlayerId, FpvSquadParts>> {
  const parts = new Map<PlayerId, FpvSquadParts>();
  await loadOwners(scene, fpvUrl, 'fpv', (find, owner) => {
    const lead = bakeSoldier(find, owner, 'fpv', FPV_OPERATORS[0], null);
    const soldiers = [
      lead.prototypes,
      ...FPV_OPERATORS.slice(1).map(name => bakeSoldier(find, owner, 'fpv', name, lead.scale).prototypes),
    ];
    const dronePivot = (find('FPVDrone') as TransformNode).getAbsolutePosition().clone();
    const drone: ModelSpec = {
      mesh: bakePart(find('FPVDroneMesh'), dronePivot, lead.scale, `fpv:${owner}:drone`),
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

/** One soldier's prototypes, baked relative to its own pivots. `scale` is derived when null. */
function bakeSoldier(
  find: Finder,
  owner: PlayerId,
  prefix: string,
  template: string,
  scale: number | null,
): { prototypes: SoldierPartPrototypes; scale: number } {
  const origin = (find(template) as TransformNode).getAbsolutePosition().clone();
  const pivotAt = (suffix: string): Vector3 => (find(`${template}_${suffix}`) as TransformNode).getAbsolutePosition().subtract(origin);
  const arms = pivotAt('Arms');
  const hipA = pivotAt('LegLeft');
  const hipB = pivotAt('LegRight');
  const [legLeft, legRight] = hipA.x <= hipB.x ? [hipA, hipB] : [hipB, hipA];
  const name = `${prefix}:${owner}:${template}`;

  // Merge in world space (this keeps the loader's handedness conversion), then move the origin
  // to the pivot and scale to tiles.
  let bodyScale = scale;
  if (bodyScale === null) {
    const body = bakePart(find(`${template}_BodyMesh`), origin, 1, `${name}:measure`);
    body.computeWorldMatrix(true);
    bodyScale = STAND_HEIGHT_TILES / body.getBoundingInfo().boundingBox.maximumWorld.y;
    body.dispose();
  }
  const part = (label: string, pivot: Vector3, node: Node): ModelSpec => ({
    mesh: bakePart(node, origin.add(pivot), bodyScale, `${name}:${label}`),
    height: 0,
  });
  return {
    scale: bodyScale,
    prototypes: {
      torso: part('torso', new Vector3(0, 0, 0), find(`${template}_BodyMesh`)),
      rifleArm: part('rifleArm', arms, find(`${template}_ArmsMesh`)),
      legLeft: part('legLeft', legLeft, find(`${template}_LegLeftMesh`)),
      legRight: part('legRight', legRight, find(`${template}_LegRightMesh`)),
      standHeightTiles: STAND_HEIGHT_TILES,
      hipHeightTiles: legLeft.y * bodyScale,
      hipOffsetTiles: Math.abs(legLeft.x) * bodyScale,
      shoulderOffset: arms.scale(bodyScale),
    },
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
