import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../../core/entities';
import type { MaterialLibrary } from '../materials';
import { buildBuildingModel } from './buildings';
import type { ModelSpec } from './kit';
import { buildUnitModel } from './units';

/**
 * The prototype model for every role and faction, built once and cloned per entity.
 *
 * A prototype is disabled and never drawn; `EntitiesView` clones it, and clones share its geometry
 * and its materials. Models are built the first time a role appears on the field, so a match that
 * never sees a Factory never pays for one.
 */
export interface ModelLibrary {
  /** The prototype for what `entity` is. Built on first use. */
  modelFor(entity: ReadonlyEntity): ModelSpec;
  dispose(): void;
}

export function createModelLibrary(scene: Scene, materials: MaterialLibrary): ModelLibrary {
  const models = new Map<string, ModelSpec>();

  return {
    modelFor(entity) {
      const key = `${entity.kind}:${entity.type}:${entity.owner}`;
      const existing = models.get(key);
      if (existing !== undefined) {
        return existing;
      }

      const model =
        entity.kind === 'building'
          ? buildBuildingModel(scene, materials, entity.type, entity.owner)
          : buildUnitModel(scene, materials, entity.type, entity.owner);
      models.set(key, model);
      return model;
    },

    dispose() {
      for (const model of models.values()) {
        model.mesh.dispose();
      }
      models.clear();
    },
  };
}
