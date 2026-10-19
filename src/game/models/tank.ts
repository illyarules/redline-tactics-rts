import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId } from '../../core/ids';
import { UNIT_CONFIG } from '../../config/units';
import tankUrl from '../../assets/models/meridian-tank.glb?url';
import { color3, OWNER_PALETTES } from '../palette';
import type { ModelSpec } from './kit';

/** One scene-local asset load, shared geometry and one material set per owner. */
export async function loadTankModels(scene: Scene): Promise<Map<PlayerId, ModelSpec>> {
  const container = await LoadAssetContainerAsync(tankUrl, scene);
  const models = new Map<PlayerId, ModelSpec>();
  if (scene.isDisposed) {
    container.dispose();
    return models;
  }
  for (const owner of ['player', 'ai', 'ai2'] as const) {
    const instance = container.instantiateModelsToScene(name => `tank:${owner}:${name}`, true, { doNotInstantiate: true });
    const root = new Mesh(`tank:${owner}:prototype`, scene);
    for (const node of instance.rootNodes) node.parent = root;
    // Keep the loader's handedness conversion: this asset faces the game's +Z.
    root.computeWorldMatrix(true);
    const bounds = root.getHierarchyBoundingVectors(true);
    const scale = UNIT_CONFIG.tank.bodySizeTiles / (bounds.max.x - bounds.min.x);
    root.scaling.setAll(scale);
    root.position.y = -bounds.min.y * scale;
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
    root.isPickable = false;
    root.setEnabled(false);
    models.set(owner, { mesh: root, height: (bounds.max.y - bounds.min.y) * scale });
  }
  // Clones share the container's geometry. Keep its buffers alive for the scene lifetime.
  scene.onDisposeObservable.addOnce(() => container.dispose());
  return models;
}
