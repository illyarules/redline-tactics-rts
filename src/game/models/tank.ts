import type { Scene } from '@babylonjs/core/scene';
import type { PlayerId } from '../../core/ids';
import tankUrl from '../../assets/models/meridian-tank.glb?url';
import type { ModelSpec } from './kit';
import { loadVehicleModels } from './vehicle';

/** One scene-local asset load, shared geometry and one material set per owner. */
export function loadTankModels(scene: Scene): Promise<Map<PlayerId, ModelSpec>> {
  return loadVehicleModels(scene, tankUrl, 'tank');
}
