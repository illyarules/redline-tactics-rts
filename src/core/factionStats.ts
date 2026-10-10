/**
 * The single place where faction modifiers are applied. Rules elsewhere ask for resolved stats
 * instead of multiplying by faction values themselves.
 */
import { FACTION_CONFIG } from '../config/factions';
import { UNIT_CONFIG } from '../config/units';
import { BUILDING_CONFIG } from '../config/buildings';
import type { AttackProfile, BuildingConfig, UnitConfig } from '../config/types';
import type { BuildingTypeId, FactionId, UnitTypeId } from './ids';

/** A unit's stats after its owner's faction modifiers are applied. */
export interface ResolvedUnitStats {
  readonly id: UnitTypeId;
  readonly name: string;
  readonly cost: number;
  readonly buildTimeSeconds: number;
  readonly maxHealth: number;
  readonly speedTilesPerSecond: number;
  readonly visionRangeTiles: number;
  readonly bodySizeTiles: number;
  readonly armor: UnitConfig['armor'];
  readonly requires: UnitConfig['requires'];
  readonly attack: AttackProfile | null;
}

export function unitConfig(type: UnitTypeId): UnitConfig {
  return UNIT_CONFIG[type];
}

export function buildingConfig(type: BuildingTypeId): BuildingConfig {
  return BUILDING_CONFIG[type];
}

export function resolveUnitStats(type: UnitTypeId, faction: FactionId): ResolvedUnitStats {
  const base = UNIT_CONFIG[type];
  const { modifiers } = FACTION_CONFIG[faction];

  return {
    id: base.id,
    name: base.name,
    cost: Math.round(base.cost * modifiers.unitCost),
    buildTimeSeconds: roundTo(base.buildTimeSeconds * modifiers.unitBuildTime, 2),
    maxHealth: Math.round(base.maxHealth * modifiers.unitHealth),
    speedTilesPerSecond: roundTo(base.speedTilesPerSecond * modifiers.unitSpeed, 3),
    visionRangeTiles: base.visionRangeTiles,
    bodySizeTiles: base.bodySizeTiles,
    armor: base.armor,
    requires: base.requires,
    attack: base.attack,
  };
}

/**
 * Buildings are unaffected by faction modifiers in the MVP; this accessor exists so callers use one
 * consistent entry point for both entity kinds.
 */
// The faction parameter is retained so this accessor matches resolveUnitStats while buildings have no modifiers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveBuildingStats(type: BuildingTypeId, _faction: FactionId): BuildingConfig {
  return BUILDING_CONFIG[type];
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
