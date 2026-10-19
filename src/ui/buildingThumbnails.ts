import type { BuildingTypeId } from '../core/ids';
import barracksUrl from '../assets/ui/buildings/barracks.png';
import factoryUrl from '../assets/ui/buildings/factory.png';
import powerPlantUrl from '../assets/ui/buildings/power-plant.png';
import resourceDepotUrl from '../assets/ui/buildings/resource-depot.png';
import unmannedSystemsCenterUrl from '../assets/ui/buildings/unmanned-systems-center.png';

/** Construction-card artwork only. The non-buildable HQ deliberately has no menu thumbnail. */
export const BUILDING_THUMBNAILS: Partial<Readonly<Record<BuildingTypeId, string>>> = {
  barracks: barracksUrl,
  factory: factoryUrl,
  powerPlant: powerPlantUrl,
  resourceDepot: resourceDepotUrl,
  unmannedSystemsCenter: unmannedSystemsCenterUrl,
};
