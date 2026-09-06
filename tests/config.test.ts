import { describe, expect, it } from 'vitest';
import { BUILDING_CONFIG } from '../src/config/buildings';
import { UNIT_CONFIG } from '../src/config/units';
import { FACTION_CONFIG } from '../src/config/factions';
import { COMBAT_BEHAVIOR_CONFIG, DAMAGE_TABLE } from '../src/config/combat';
import { ECONOMY_CONFIG } from '../src/config/economy';
import { RENDER_CONFIG } from '../src/config/render';
import { FORMATION_CONFIG } from '../src/config/formation';
import { PERSISTENCE_CONFIG } from '../src/config/persistence';
import { FOG_CONFIG } from '../src/config/fog';
import { SEPARATION_CONFIG } from '../src/config/separation';
import { PRODUCTION_CONFIG } from '../src/config/production';
import type { ArmorCategory } from '../src/config/types';
import {
  BUILDING_TYPE_IDS,
  FACTION_IDS,
  UNIT_TYPE_IDS,
  type BuildingTypeId,
  type UnitTypeId,
} from '../src/core/ids';
import { resolveBuildingStats, resolveUnitStats } from '../src/core/factionStats';

const ARMOR_CATEGORIES: readonly ArmorCategory[] = ['light', 'armored', 'structure'];

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

describe('config completeness', () => {
  it('defines every unit role exactly once', () => {
    expect(Object.keys(UNIT_CONFIG).sort()).toEqual([...UNIT_TYPE_IDS].sort());
  });

  it('defines every building role exactly once', () => {
    expect(Object.keys(BUILDING_CONFIG).sort()).toEqual([...BUILDING_TYPE_IDS].sort());
  });

  it('defines both factions', () => {
    expect(Object.keys(FACTION_CONFIG).sort()).toEqual([...FACTION_IDS].sort());
  });

  it('keys every record by its own id', () => {
    for (const id of UNIT_TYPE_IDS) {
      expect(UNIT_CONFIG[id].id).toBe(id);
    }
    for (const id of BUILDING_TYPE_IDS) {
      expect(BUILDING_CONFIG[id].id).toBe(id);
    }
    for (const id of FACTION_IDS) {
      expect(FACTION_CONFIG[id].id).toBe(id);
    }
  });

  it('names everything for the HUD', () => {
    const named = [
      ...UNIT_TYPE_IDS.map((id) => UNIT_CONFIG[id].name),
      ...BUILDING_TYPE_IDS.map((id) => BUILDING_CONFIG[id].name),
      ...FACTION_IDS.map((id) => FACTION_CONFIG[id].name),
    ];
    for (const name of named) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('unit values', () => {
  it.each([...UNIT_TYPE_IDS])('%s has valid positive stats', (id: UnitTypeId) => {
    const unit = UNIT_CONFIG[id];
    expect(isPositiveFinite(unit.cost)).toBe(true);
    expect(isPositiveFinite(unit.buildTimeSeconds)).toBe(true);
    expect(isPositiveFinite(unit.maxHealth)).toBe(true);
    expect(isPositiveFinite(unit.speedTilesPerSecond)).toBe(true);
    expect(isPositiveFinite(unit.visionRangeTiles)).toBe(true);
    expect(isPositiveFinite(unit.bodySizeTiles)).toBe(true);
    // A unit wider than a tile would not fit down a one-tile gap once pathfinding arrives.
    expect(unit.bodySizeTiles).toBeLessThanOrEqual(1);
  });

  it('gives every combat unit a valid attack profile and the worker none', () => {
    expect(UNIT_CONFIG.worker.attack).toBeNull();
    for (const id of ['infantry', 'tank', 'rocket'] as const) {
      const attack = UNIT_CONFIG[id].attack;
      expect(attack).not.toBeNull();
      expect(isPositiveFinite(attack!.damage)).toBe(true);
      expect(isPositiveFinite(attack!.cooldownSeconds)).toBe(true);
      expect(isPositiveFinite(attack!.rangeTiles)).toBe(true);
      expect(attack!.rangeTiles).toBeLessThanOrEqual(UNIT_CONFIG[id].visionRangeTiles);
      expect(attack!.targetCategories).toEqual(expect.arrayContaining(['unit', 'building']));
    }
  });
});

describe('building values', () => {
  it.each([...BUILDING_TYPE_IDS])('%s has valid stats and footprint', (id: BuildingTypeId) => {
    const building = BUILDING_CONFIG[id];
    expect(isPositiveFinite(building.maxHealth)).toBe(true);
    expect(isPositiveFinite(building.visionRangeTiles)).toBe(true);
    expect(Number.isInteger(building.footprint.width)).toBe(true);
    expect(Number.isInteger(building.footprint.height)).toBe(true);
    expect(building.footprint.width).toBeGreaterThan(0);
    expect(building.footprint.height).toBeGreaterThan(0);

    if (building.buildable) {
      expect(isPositiveFinite(building.cost)).toBe(true);
      expect(isPositiveFinite(building.buildTimeSeconds)).toBe(true);
    } else {
      expect(building.cost).toBe(0);
      expect(building.buildTimeSeconds).toBe(0);
    }
  });

  it('only references known units and buildings', () => {
    for (const id of BUILDING_TYPE_IDS) {
      const building = BUILDING_CONFIG[id];
      for (const produced of building.produces) {
        expect(UNIT_TYPE_IDS).toContain(produced);
      }
      for (const required of building.requires) {
        expect(BUILDING_TYPE_IDS).toContain(required);
        expect(required).not.toBe(id);
      }
    }
  });

  it('covers every unit with exactly one producer', () => {
    for (const unit of UNIT_TYPE_IDS) {
      const producers = BUILDING_TYPE_IDS.filter((id) => BUILDING_CONFIG[id].produces.includes(unit));
      expect(producers).toHaveLength(1);
    }
  });

  it('follows the designed technology chain', () => {
    expect(BUILDING_CONFIG.hq.requires).toEqual([]);
    expect(BUILDING_CONFIG.barracks.requires).toContain('hq');
    expect(BUILDING_CONFIG.factory.requires).toEqual(expect.arrayContaining(['barracks', 'powerPlant']));
    expect(BUILDING_CONFIG.factory.requiresPower).toBe(true);
    expect(BUILDING_CONFIG.hq.acceptsDeliveries).toBe(true);
    expect(BUILDING_CONFIG.resourceDepot.acceptsDeliveries).toBe(true);
  });
});

describe('damage table', () => {
  it('rates each attacker against every armor category', () => {
    for (const attacker of ['infantry', 'tank', 'rocket'] as const) {
      for (const armor of ARMOR_CATEGORIES) {
        expect(isPositiveFinite(DAMAGE_TABLE[attacker][armor])).toBe(true);
      }
    }
  });

  it('has no entry for the worker', () => {
    expect(Object.keys(DAMAGE_TABLE).sort()).toEqual(['infantry', 'rocket', 'tank']);
  });
});

describe('combat behaviour values', () => {
  it('uses a positive, finite target acquisition range and scan interval', () => {
    expect(isPositiveFinite(COMBAT_BEHAVIOR_CONFIG.targetScanIntervalSeconds)).toBe(true);
    expect(isPositiveFinite(COMBAT_BEHAVIOR_CONFIG.acquisitionRangeTiles)).toBe(true);
  });
});

describe('economy values', () => {
  it('starts players with positive Credits', () => {
    expect(isPositiveFinite(ECONOMY_CONFIG.startingCredits)).toBe(true);
  });

  it('refunds a fraction between 0 and 1', () => {
    expect(ECONOMY_CONFIG.cancelRefundFraction).toBeGreaterThan(0);
    expect(ECONOMY_CONFIG.cancelRefundFraction).toBeLessThan(1);
    expect(ECONOMY_CONFIG.cancelRefundFraction).toBe(0.75);
  });
});

describe('production values', () => {
  it('uses a positive configured queue capacity and spawn-search radius', () => {
    expect(Number.isInteger(PRODUCTION_CONFIG.queueCapacity)).toBe(true);
    expect(PRODUCTION_CONFIG.queueCapacity).toBeGreaterThan(0);
    expect(Number.isInteger(PRODUCTION_CONFIG.spawnSearchRadiusTiles)).toBe(true);
    expect(PRODUCTION_CONFIG.spawnSearchRadiusTiles).toBeGreaterThan(0);
  });
});

describe('render values', () => {
  it('uses a finite browser rendering budget', () => {
    expect(isPositiveFinite(RENDER_CONFIG.maxDevicePixelRatio)).toBe(true);
    expect(isPositiveFinite(RENDER_CONFIG.targetFramesPerSecond)).toBe(true);
    expect(isPositiveFinite(RENDER_CONFIG.maxDeltaSeconds)).toBe(true);
    expect(isPositiveFinite(RENDER_CONFIG.hudUpdateIntervalSeconds)).toBe(true);
    expect(Number.isInteger(RENDER_CONFIG.shadowMapSize)).toBe(true);
    expect(RENDER_CONFIG.shadowMapSize).toBeGreaterThan(0);
  });
});

describe('formation and separation config', () => {
  it('uses positive, finite formation slot geometry', () => {
    expect(isPositiveFinite(FORMATION_CONFIG.slotGapTiles)).toBe(true);
    expect(isPositiveFinite(FORMATION_CONFIG.nearbySlotSearchRadiusTiles)).toBe(true);
    expect(isPositiveFinite(FORMATION_CONFIG.maxGroupSize)).toBe(true);
    expect(Number.isInteger(FORMATION_CONFIG.maxGroupSize)).toBe(true);
  });

  it('uses a positive, finite separation configuration', () => {
    expect(isPositiveFinite(SEPARATION_CONFIG.separationPaddingTiles)).toBe(true);
    expect(isPositiveFinite(SEPARATION_CONFIG.maxSeparationTilesPerSecond)).toBe(true);
  });
});

describe('persistence config', () => {
  it('uses a positive, finite save interval and a non-empty storage key', () => {
    expect(isPositiveFinite(PERSISTENCE_CONFIG.saveIntervalSeconds)).toBe(true);
    expect(PERSISTENCE_CONFIG.storageKey.trim().length).toBeGreaterThan(0);
  });
});

describe('fog config', () => {
  it('uses a positive visibility cadence and the supported circular tile policy', () => {
    expect(isPositiveFinite(FOG_CONFIG.updateIntervalSeconds)).toBe(true);
    expect(FOG_CONFIG.radiusShape).toBe('circle');
  });
});

describe('faction modifiers', () => {
  it('keeps every multiplier positive and finite', () => {
    for (const id of FACTION_IDS) {
      for (const multiplier of Object.values(FACTION_CONFIG[id].modifiers)) {
        expect(isPositiveFinite(multiplier)).toBe(true);
      }
    }
  });

  it('resolves Meridian units as tougher and pricier', () => {
    const base = UNIT_CONFIG.tank;
    const resolved = resolveUnitStats('tank', 'meridian');
    expect(resolved.maxHealth).toBeGreaterThan(base.maxHealth);
    expect(resolved.cost).toBeGreaterThan(base.cost);
    expect(resolved.buildTimeSeconds).toBe(base.buildTimeSeconds);
    expect(resolved.speedTilesPerSecond).toBe(base.speedTilesPerSecond);
  });

  it('resolves Ember units as faster and frailer', () => {
    const base = UNIT_CONFIG.infantry;
    const resolved = resolveUnitStats('infantry', 'ember');
    expect(resolved.buildTimeSeconds).toBeLessThan(base.buildTimeSeconds);
    expect(resolved.speedTilesPerSecond).toBeGreaterThan(base.speedTilesPerSecond);
    expect(resolved.maxHealth).toBeLessThan(base.maxHealth);
    expect(resolved.cost).toBe(base.cost);
  });

  it('resolves every unit for every faction to valid positive stats', () => {
    for (const faction of FACTION_IDS) {
      for (const unit of UNIT_TYPE_IDS) {
        const resolved = resolveUnitStats(unit, faction);
        expect(isPositiveFinite(resolved.cost)).toBe(true);
        expect(isPositiveFinite(resolved.buildTimeSeconds)).toBe(true);
        expect(isPositiveFinite(resolved.maxHealth)).toBe(true);
        expect(isPositiveFinite(resolved.speedTilesPerSecond)).toBe(true);
        expect(Number.isInteger(resolved.maxHealth)).toBe(true);
        expect(Number.isInteger(resolved.cost)).toBe(true);
      }
    }
  });

  it('leaves buildings unmodified by faction', () => {
    for (const faction of FACTION_IDS) {
      for (const building of BUILDING_TYPE_IDS) {
        expect(resolveBuildingStats(building, faction)).toBe(BUILDING_CONFIG[building]);
      }
    }
  });
});
