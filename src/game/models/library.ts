import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../../core/entities';
import type { MaterialLibrary } from '../materials';
import { buildBuildingModel } from './buildings';
import type { ModelSpec } from './kit';
import { buildUnitModel } from './units';

/**
 * The prototype model for every role and faction except Infantry, built once and cloned per entity.
 *
 * A prototype is disabled and never drawn; `EntitiesView` clones it, and clones share its geometry
 * and its materials. Models are built the first time a role appears on the field, so a match that
 * never sees a Factory never pays for one.
 *
 * Infantry renders as a three-soldier squad (`models/soldier.ts`, driven by `EntitiesView`)
 * rather than one of these single merged models, so `EntitiesView` never asks this library for one.
 */
export interface ModelLibrary {
  /** The prototype for what `entity` is. Built on first use. Never called for an Infantry unit. */
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

      if (entity.kind === 'building') {
        const model = buildBuildingModel(scene, materials, entity.type, entity.owner);
        models.set(key, model);
        return model;
      }
      if (entity.type === 'infantry') {
        throw new Error('Infantry renders as a squad; ModelLibrary does not build it.');
      }
      const model = buildUnitModel(scene, materials, entity.type, entity.owner);
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
