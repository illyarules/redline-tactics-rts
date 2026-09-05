/**
 * The world: the authoritative set of live units and buildings, keyed by stable entity id.
 *
 * Everything that matters about an entity lives here, not in a mesh. Views read entities
 * through the read-only accessors and change them only through the mutators below.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { BUILDING_CONFIG } from '../config/buildings';
import { UNIT_CONFIG } from '../config/units';
import {
  footprintCenter,
  type BuildingEntity,
  type EntityStatus,
  type ReadonlyBuilding,
  type ReadonlyEntity,
  type ReadonlyUnit,
  type UnitEntity,
} from './entities';
import { resolveBuildingStats, resolveUnitStats } from './factionStats';
import type { TileCoord, Vec2 } from './geometry';
import {
  createEntityIdFactory,
  FACTION_IDS,
  PLAYER_IDS,
  type BuildingTypeId,
  type EntityId,
  type FactionId,
  type PlayerId,
  type UnitTypeId,
} from './ids';
import type { Order } from './orders';

export interface WorldOptions {
  /** Needed to place a building's footprint in world units. Pass `mapGrid.tileSizePixels`. */
  readonly tileSizePixels: number;
  /** Entity id prefix, so a test world can produce readable ids. */
  readonly idPrefix?: string;
}

export interface CreateUnitSpec {
  readonly type: UnitTypeId;
  readonly owner: PlayerId;
  readonly faction: FactionId;
  readonly position: Vec2;
  /** Defaults to full health. Must be above zero and no more than the resolved maximum. */
  readonly health?: number;
}

export interface CreateBuildingSpec {
  readonly type: BuildingTypeId;
  readonly owner: PlayerId;
  readonly faction: FactionId;
  /** Top-left tile of the footprint; the entity's position is the footprint centre. */
  readonly topLeft: TileCoord;
  readonly health?: number;
  /** Defaults to `idle`. Construction passes `constructing` when that task arrives. */
  readonly status?: EntityStatus;
}

export interface DamageResult {
  /** Health actually removed, which is less than the requested amount on a killing blow. */
  readonly applied: number;
  readonly health: number;
  /** True only on the hit that emptied the health bar, so a death is reported exactly once. */
  readonly destroyed: boolean;
}

export interface World {
  readonly tileSizePixels: number;

  createUnit(spec: CreateUnitSpec): ReadonlyUnit;
  createBuilding(spec: CreateBuildingSpec): ReadonlyBuilding;

  has(id: EntityId): boolean;
  get(id: EntityId): ReadonlyEntity | undefined;
  /** Like `get`, but throws when the entity is gone. Use it only where absence is a bug. */
  require(id: EntityId): ReadonlyEntity;
  unit(id: EntityId): ReadonlyUnit | undefined;
  building(id: EntityId): ReadonlyBuilding | undefined;

  /** Entities in creation order. Destroyed entities are included until they are removed. */
  entities(owner?: PlayerId): readonly ReadonlyEntity[];
  units(owner?: PlayerId): readonly ReadonlyUnit[];
  buildings(owner?: PlayerId): readonly ReadonlyBuilding[];
  size(): number;

  /**
   * Mutators report whether they found the entity instead of throwing: an entity can be destroyed
   * or removed between deciding on a change and applying it, and that is normal, not a bug.
   */
  setPosition(id: EntityId, position: Vec2): boolean;
  /** Sets a mobile unit's normalized heading. Buildings have no heading. */
  setFacingRadians(id: EntityId, facingRadians: number): boolean;
  setOrder(id: EntityId, order: Order | null): boolean;
  setStatus(id: EntityId, status: EntityStatus): boolean;
  /** Reduces health by `amount`, never below zero and never upwards. */
  damage(id: EntityId, amount: number): DamageResult | undefined;
  remove(id: EntityId): boolean;
}

export function createWorld(options: WorldOptions): World {
  const { tileSizePixels } = options;
  if (!Number.isFinite(tileSizePixels) || tileSizePixels <= 0) {
    throw new Error(`World needs a positive tile size, got ${tileSizePixels}`);
  }

  const entities = new Map<EntityId, UnitEntity | BuildingEntity>();
  const nextId = createEntityIdFactory(options.idPrefix);

  const live = (id: EntityId): UnitEntity | BuildingEntity | undefined => entities.get(id);

  function collect<T extends ReadonlyEntity>(
    matches: (entity: ReadonlyEntity) => entity is T,
    owner?: PlayerId,
  ): readonly T[] {
    const found: T[] = [];
    for (const entity of entities.values()) {
      if (matches(entity) && (owner === undefined || entity.owner === owner)) {
        found.push(entity);
      }
    }
    return found;
  }

  return {
    tileSizePixels,

    createUnit(spec) {
      assertKnown(spec.type, UNIT_CONFIG, 'unit type');
      assertOwner(spec.owner);
      assertFaction(spec.faction);
      assertPosition(spec.position);

      const stats = resolveUnitStats(spec.type, spec.faction);
      const unit: UnitEntity = {
        id: nextId(),
        kind: 'unit',
        type: spec.type,
        owner: spec.owner,
        faction: spec.faction,
        stats,
        position: spec.position,
        facingRadians: 0,
        health: startingHealth(spec.health, stats.maxHealth),
        order: null,
        status: 'idle',
      };
      entities.set(unit.id, unit);
      return unit;
    },

    createBuilding(spec) {
      assertKnown(spec.type, BUILDING_CONFIG, 'building type');
      assertOwner(spec.owner);
      assertFaction(spec.faction);
      assertTile(spec.topLeft);

      const stats = resolveBuildingStats(spec.type, spec.faction);
      const building: BuildingEntity = {
        id: nextId(),
        kind: 'building',
        type: spec.type,
        owner: spec.owner,
        faction: spec.faction,
        stats,
        topLeft: spec.topLeft,
        footprint: stats.footprint,
        position: footprintCenter(spec.topLeft, stats.footprint, tileSizePixels),
        health: startingHealth(spec.health, stats.maxHealth),
        order: null,
        status: spec.status ?? 'idle',
      };
      entities.set(building.id, building);
      return building;
    },

    has(id) {
      return entities.has(id);
    },

    get(id) {
      return live(id);
    },

    require(id) {
      const entity = live(id);
      if (entity === undefined) {
        throw new Error(`No entity with id "${id}"`);
      }
      return entity;
    },

    unit(id) {
      const entity = live(id);
      return entity?.kind === 'unit' ? entity : undefined;
    },

    building(id) {
      const entity = live(id);
      return entity?.kind === 'building' ? entity : undefined;
    },

    entities(owner) {
      const found: ReadonlyEntity[] = [];
      for (const entity of entities.values()) {
        if (owner === undefined || entity.owner === owner) {
          found.push(entity);
        }
      }
      return found;
    },

    units(owner) {
      return collect((entity): entity is ReadonlyUnit => entity.kind === 'unit', owner);
    },

    buildings(owner) {
      return collect((entity): entity is ReadonlyBuilding => entity.kind === 'building', owner);
    },

    size() {
      return entities.size;
    },

    setPosition(id, position) {
      const entity = live(id);
      if (entity === undefined) {
        return false;
      }
      assertPosition(position);
      entity.position = position;
      return true;
    },

    setFacingRadians(id, facingRadians) {
      const entity = live(id);
      if (entity === undefined || entity.kind !== 'unit' || !Number.isFinite(facingRadians)) {
        return false;
      }
      entity.facingRadians = normalizeRadians(facingRadians);
      return true;
    },

    setOrder(id, order) {
      const entity = live(id);
      if (entity === undefined) {
        return false;
      }
      entity.order = order;
      return true;
    },

    setStatus(id, status) {
      const entity = live(id);
      if (entity === undefined) {
        return false;
      }
      entity.status = status;
      return true;
    },

    damage(id, amount) {
      const entity = live(id);
      if (entity === undefined) {
        return undefined;
      }
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Damage must be a non-negative number, got ${amount}`);
      }

      const applied = Math.min(entity.health, amount);
      entity.health -= applied;

      const destroyed = entity.health === 0 && entity.status !== 'destroyed';
      if (destroyed) {
        entity.status = 'destroyed';
        entity.order = null;
      }
      return { applied, health: entity.health, destroyed };
    },

    remove(id) {
      return entities.delete(id);
    },
  };
}

function startingHealth(requested: number | undefined, maxHealth: number): number {
  if (requested === undefined) {
    return maxHealth;
  }
  if (!Number.isFinite(requested) || requested <= 0 || requested > maxHealth) {
    throw new Error(`Starting health must be between 0 and ${maxHealth}, got ${requested}`);
  }
  return requested;
}

function assertKnown(type: string, table: Readonly<Record<string, unknown>>, label: string): void {
  if (!Object.prototype.hasOwnProperty.call(table, type)) {
    throw new Error(`Unknown ${label} "${type}"`);
  }
}

function assertOwner(owner: PlayerId): void {
  if (!PLAYER_IDS.includes(owner)) {
    throw new Error(`Unknown owner "${owner}"`);
  }
}

function assertFaction(faction: FactionId): void {
  if (!FACTION_IDS.includes(faction)) {
    throw new Error(`Unknown faction "${faction}"`);
  }
}

function assertPosition(position: Vec2): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error(`Position must be finite, got (${position.x}, ${position.y})`);
  }
}

function assertTile(tile: TileCoord): void {
  if (!Number.isInteger(tile.tx) || !Number.isInteger(tile.ty)) {
    throw new Error(`Footprint tile must be whole numbers, got (${tile.tx}, ${tile.ty})`);
  }
}

function normalizeRadians(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}
