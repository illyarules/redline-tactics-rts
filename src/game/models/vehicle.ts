import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId, UnitTypeId } from '../../core/ids';
import { UNIT_CONFIG } from '../../config/units';
import { color3, OWNER_PALETTES } from '../palette';
import type { ModelSpec } from './kit';

/**
 * One scene-local asset load of a Blender-made vehicle, shared geometry and one material set per
 * owner. Materials named `deep teal`, `light panels` and `TeamColor` take the owner's body, light
 * and accent planes; every other material keeps the neutral colour it was authored with.
 */
export async function loadVehicleModels(
  scene: Scene,
  url: string,
  type: UnitTypeId,
): Promise<Map<PlayerId, ModelSpec>> {
  const models = new Map<PlayerId, ModelSpec>();
  const source = await openVehicleSource(scene, url, type);
  if (source === null) return models;
  for (const owner of ['player', 'ai', 'ai2'] as const) models.set(owner, source.build(owner));
  return models;
}

/** A loaded vehicle asset that builds one owner's prototype at a time, so unused owners cost nothing. */
export interface VehicleSource {
  build(owner: PlayerId): ModelSpec;
}

/** Loads `url` once; `null` when the scene was disposed meanwhile. */
export async function openVehicleSource(scene: Scene, url: string, type: UnitTypeId): Promise<VehicleSource | null> {
  const container = await LoadAssetContainerAsync(url, scene);
  if (scene.isDisposed) {
    container.dispose();
    return null;
  }
  // Clones share the container's geometry. Keep its buffers alive for the scene lifetime.
  scene.onDisposeObservable.addOnce(() => container.dispose());
  return {
    build(owner) {
      const instance = container.instantiateModelsToScene(name => `${type}:${owner}:${name}`, true, { doNotInstantiate: true });
      const root = new Mesh(`${type}:${owner}:prototype`, scene);
      for (const node of instance.rootNodes) node.parent = root;
      // Keep the loader's handedness conversion: this asset faces the game's +Z.
      root.computeWorldMatrix(true);
      const bounds = root.getHierarchyBoundingVectors(true);
      const scale = UNIT_CONFIG[type].bodySizeTiles / (bounds.max.x - bounds.min.x);
      root.scaling.setAll(scale);
      root.position.y = -bounds.min.y * scale;
      recolorVehicle(root, owner);
      root.isPickable = false;
      root.setEnabled(false);
      return { mesh: root, height: (bounds.max.y - bounds.min.y) * scale };
    },
  };
}

function recolorVehicle(root: Mesh, owner: PlayerId): void {
  const palette = OWNER_PALETTES[owner];
  for (const mesh of root.getChildMeshes()) {
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial)) continue;
    if (mat.name.includes('deep teal')) mat.albedoColor = color3(palette.body).toLinearSpace();
    if (mat.name.includes('light panels')) mat.albedoColor = color3(palette.light).toLinearSpace();
    if (mat.name.includes('TeamColor')) mat.albedoColor = color3(palette.accent).toLinearSpace();
    // The battlefield uses direct lights, without a studio reflection environment.
    mat.metallic = 0.1;
    mat.roughness = Math.max(mat.roughness ?? 0.5, 0.5);
  }
}
