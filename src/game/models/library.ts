import type { Scene } from '@babylonjs/core/scene';
import type { ReadonlyEntity } from '../../core/entities';
import type { BuildingTypeId, PlayerId, UnitTypeId } from '../../core/ids';
import type { MaterialLibrary } from '../materials';
import { BUILDING_CONFIG } from '../../config/buildings';
import { UNIT_CONFIG } from '../../config/units';
import { buildBuildingModel } from './buildings';
import type { ModelSpec } from './kit';
import { buildUnitModel } from './units';
import buggyUrl from '../../assets/models/meridian-combat-buggy.glb?url';
import rocketUrl from '../../assets/models/meridian-rocket.glb?url';
import workerUrl from '../../assets/models/meridian-worker.glb?url';
import barracksUrl from '../../assets/models/meridian-barracks.glb?url';
import factoryUrl from '../../assets/models/meridian-factory.glb?url';
import hqUrl from '../../assets/models/meridian-hq.glb?url';
import powerPlantUrl from '../../assets/models/meridian-power-plant.glb?url';
import resourceDepotUrl from '../../assets/models/meridian-resource-depot.glb?url';
import unmannedSystemsCenterUrl from '../../assets/models/meridian-unmanned-systems-center.glb?url';
import { loadTankModels } from './tank';
import { openVehicleSource, type VehicleSource } from './vehicle';

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
  /** The prototype for a vehicle role and owner, for cosmetics (wrecks) that outlive the entity. */
  vehicleModel(type: Exclude<UnitTypeId, 'infantry' | 'fpvOperators'>, owner: PlayerId): ModelSpec;
  dispose(): void;
}

/** Kept inside the footprint by this much per side, so adjacent buildings never merge visually. */
const BUILDING_MARGIN_TILES = 0.1;

export function createModelLibrary(scene: Scene, materials: MaterialLibrary): ModelLibrary {
  const models = new Map<string, ModelSpec>();
  let disposed = false;
  // Keep the procedural models as usable fallbacks while loading or if a request fails.
  const loadVehicle = (type: UnitTypeId, load: () => Promise<Map<PlayerId, ModelSpec>>): void => {
    void load().then(loaded => {
      for (const [owner, model] of loaded) {
        if (disposed) {
          model.mesh.dispose(false, true);
          continue;
        }
        const key = `unit:${type}:${owner}`;
        models.get(key)?.mesh.dispose();
        models.set(key, model);
      }
    }).catch(error => {
      if (!disposed) console.warn(`${type} model unavailable; using procedural fallback.`, error);
    });
  };
  loadVehicle('tank', () => loadTankModels(scene));
  // The other Blender vehicles load the first time a unit of that role appears on the field, and
  // build only the owners that field it, so a match never pays for a model it does not show.
  const vehicleUrls: Partial<Record<UnitTypeId, string>> = {
    worker: workerUrl,
    rocket: rocketUrl,
    combatBuggy: buggyUrl,
  };
  const sources = new Map<UnitTypeId, Promise<VehicleSource | null>>();
  const requested = new Set<string>();
  const requestVehicle = (type: UnitTypeId, owner: PlayerId, key: string): void => {
    const url = vehicleUrls[type];
    if (url === undefined || requested.has(key)) return;
    requested.add(key);
    const source = sources.get(type) ?? openVehicleSource(scene, url, type, UNIT_CONFIG[type].bodySizeTiles);
    sources.set(type, source);
    void source.then(loaded => {
      if (loaded === null) return;
      const model = loaded.build(owner);
      if (disposed) {
        model.mesh.dispose(false, true);
        return;
      }
      models.get(key)?.mesh.dispose();
      models.set(key, model);
    }).catch(error => {
      if (!disposed) console.warn(`${type} model unavailable; using procedural fallback.`, error);
    });
  };

  // Blender buildings load the first time a building of that role appears, drawn with the entrance
  // towards the camera (-z); the procedural model stands in until the asset arrives.
  const buildingUrls: Readonly<Record<BuildingTypeId, string>> = {
    hq: hqUrl,
    barracks: barracksUrl,
    factory: factoryUrl,
    powerPlant: powerPlantUrl,
    resourceDepot: resourceDepotUrl,
    unmannedSystemsCenter: unmannedSystemsCenterUrl,
  };
  const buildingSources = new Map<BuildingTypeId, Promise<VehicleSource | null>>();
  const requestBuilding = (type: BuildingTypeId, owner: PlayerId, key: string): void => {
    if (requested.has(key)) return;
    requested.add(key);
    const source = buildingSources.get(type) ?? openVehicleSource(
      scene,
      buildingUrls[type],
      `building:${type}`,
      BUILDING_CONFIG[type].footprint.width - BUILDING_MARGIN_TILES * 2,
      Math.PI,
    );
    buildingSources.set(type, source);
    void source.then(loaded => {
      if (loaded === null) return;
      const model = loaded.build(owner);
      if (disposed) {
        model.mesh.dispose(false, true);
        return;
      }
      models.get(key)?.mesh.dispose();
      models.set(key, model);
    }).catch(error => {
      if (!disposed) console.warn(`${type} model unavailable; using procedural fallback.`, error);
    });
  };

  const vehicleModel = (type: Exclude<UnitTypeId, 'infantry' | 'fpvOperators'>, owner: PlayerId): ModelSpec => {
    const key = `unit:${type}:${owner}`;
    const existing = models.get(key);
    if (existing !== undefined) return existing;
    requestVehicle(type, owner, key);
    const model = buildUnitModel(scene, materials, type, owner);
    models.set(key, model);
    return model;
  };

  return {
    modelFor(entity) {
      const key = `${entity.kind}:${entity.type}:${entity.owner}`;
      const existing = models.get(key);
      if (existing !== undefined) {
        return existing;
      }

      if (entity.kind === 'building') {
        requestBuilding(entity.type, entity.owner, key);
        const model = buildBuildingModel(scene, materials, entity.type, entity.owner);
        models.set(key, model);
        return model;
      }
      if (entity.type === 'infantry' || entity.type === 'fpvOperators') {
        throw new Error('Infantry roles render as squads; ModelLibrary does not build them.');
      }
      return vehicleModel(entity.type, entity.owner);
    },

    vehicleModel,

    dispose() {
      disposed = true;
      for (const model of models.values()) {
        model.mesh.dispose();
      }
      models.clear();
    },
  };
}
