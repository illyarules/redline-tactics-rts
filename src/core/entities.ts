/**
 * What a unit or a building is at any moment. `core/world.ts` owns the instances; this module only
 * describes their shape and answers questions about a single entity.
 *
 * Config values are never copied into entity state: each entity keeps the resolved stats record it
 * was created from, so balance changes stay in `config/`.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { BuildingConfig } from '../config/types';
import type { TileCoord, TileRect, TileSize, Vec2 } from './geometry';
import type { ResolvedUnitStats } from './factionStats';
import type { BuildingTypeId, EntityId, FactionId, PlayerId, UnitTypeId } from './ids';
import type { Order } from './orders';

/** A paid unit waiting at a producer. Only index zero is allowed to accumulate elapsed time. */
export interface ProductionQueueItem {
  readonly unitType: UnitTypeId;
  readonly elapsedSeconds: number;
  /** Captured at queue time, so cancellation refunds exactly what this faction paid. */
  readonly paidCost: number;
}

/**
 * What an entity is doing, in one word, for the HUD and for debugging. These are labels only; the
 * movement, gathering, construction, production and combat systems drive them. `destroyed` is set
 * by the world when health reaches zero.
 */
export type EntityStatus =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'gathering'
  | 'constructing'
  | 'producing'
  | 'entrenching'
  | 'entrenched'
  /** A requested order could not find a route; it remains visible until another order replaces it. */
  | 'failed'
  | 'destroyed';

interface EntityBase {
  readonly id: EntityId;
  readonly owner: PlayerId;
  readonly faction: FactionId;
  /** World position: a unit's centre, or the centre of a building's footprint. */
  position: Vec2;
  health: number;
  /** The order being carried out, or `null` when the entity has none. */
  order: Order | null;
  status: EntityStatus;
}

export interface UnitEntity extends EntityBase {
  readonly kind: 'unit';
  readonly type: UnitTypeId;
  /** Stats after the owner's faction modifiers, resolved once at creation. */
  readonly stats: ResolvedUnitStats;
  /** Heading in world space. Zero faces north (negative world Y). */
  facingRadians: number;
  /** Seconds before this unit's next shot is legal. Zero means its weapon is ready. */
  attackCooldownRemainingSeconds: number;
  /** Credits a Worker is currently carrying back from a field. Always 0 for other unit types. */
  carriedCredits: number;
  /** Only FPV Drone Operators use these fields; other unit roles remain permanently mobile. */
  entrenchment: 'mobile' | 'entrenching' | 'entrenched';
  entrenchElapsedSeconds: number;
}

export interface BuildingEntity extends EntityBase {
  readonly kind: 'building';
  readonly type: BuildingTypeId;
  readonly stats: BuildingConfig;
  /** Top-left tile of the footprint. */
  readonly topLeft: TileCoord;
  readonly footprint: TileSize;
  /** 0 to 1. Always 1 for a building that was not raised through construction. */
  constructionProgress: number;
  /** Paid unit requests, in first-in-first-out order. */
  productionQueue: readonly ProductionQueueItem[];
}

export type Entity = UnitEntity | BuildingEntity;

export type EntityKind = Entity['kind'];

/**
 * The world hands out read-only views: state changes go through the world's own methods so no
 * caller — least of all a rendered view — can quietly become the source of truth.
 */
export type ReadonlyUnit = Readonly<UnitEntity>;
export type ReadonlyBuilding = Readonly<BuildingEntity>;
export type ReadonlyEntity = ReadonlyUnit | ReadonlyBuilding;

export function isUnit(entity: ReadonlyEntity): entity is ReadonlyUnit {
  return entity.kind === 'unit';
}

export function isBuilding(entity: ReadonlyEntity): entity is ReadonlyBuilding {
  return entity.kind === 'building';
}

export function isAlive(entity: ReadonlyEntity): boolean {
  return entity.status !== 'destroyed';
}

/** Health as a 0–1 fraction, for health bars and AI judgement. */
export function healthFraction(entity: ReadonlyEntity): number {
  const max = entity.stats.maxHealth;
  return max > 0 ? entity.health / max : 0;
}

/** The tiles a building stands on, as a rectangle. */
export function footprintRect(building: ReadonlyBuilding): TileRect {
  return {
    tx: building.topLeft.tx,
    ty: building.topLeft.ty,
    width: building.footprint.width,
    height: building.footprint.height,
  };
}

/** Centre of a footprint in world units — where a building's `position` sits. */
export function footprintCenter(
  topLeft: TileCoord,
  footprint: TileSize,
  tileSizePixels: number,
): Vec2 {
  return {
    x: (topLeft.tx + footprint.width / 2) * tileSizePixels,
    y: (topLeft.ty + footprint.height / 2) * tileSizePixels,
  };
}
