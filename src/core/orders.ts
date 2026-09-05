/**
 * Typed player and AI orders. Both sides issue the same commands.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { BuildingTypeId, EntityId, UnitTypeId } from './ids';
import type { TileCoord, Vec2 } from './geometry';

/** A unit's progress along a resolved route: which waypoint it is walking toward now. */
export interface MoveRoute {
  /** Where the route actually ends: `target`'s own tile centre, or the nearest walkable one to it. */
  readonly resolvedTarget: Vec2;
  /** Tile-centre waypoints from just after the order was given through `resolvedTarget`, in order. */
  readonly waypoints: readonly Vec2[];
  /** Index into `waypoints` the unit is currently walking toward. */
  readonly waypointIndex: number;
}

/** Walk to a world position, following a resolved route around obstacles. */
export interface MoveOrder {
  readonly kind: 'Move';
  /** The position originally ordered, kept for display even when the route resolved elsewhere. */
  readonly target: Vec2;
  readonly route: MoveRoute;
}

/** Pursue and shoot one specific entity. */
export interface AttackOrder {
  readonly kind: 'Attack';
  readonly targetId: EntityId;
}

/** Travel to a world position, engaging enemies met on the way. */
export interface AttackMoveOrder {
  readonly kind: 'AttackMove';
  readonly target: Vec2;
}

/** Send a worker to raise a building whose footprint starts at `topLeft`. */
export interface BuildOrder {
  readonly kind: 'Build';
  readonly buildingType: BuildingTypeId;
  readonly topLeft: TileCoord;
}

/** Queue a unit at a production building. */
export interface ProduceOrder {
  readonly kind: 'Produce';
  readonly buildingId: EntityId;
  readonly unitType: UnitTypeId;
}

export type Order = MoveOrder | AttackOrder | AttackMoveOrder | BuildOrder | ProduceOrder;

export type OrderKind = Order['kind'];

export function moveOrder(
  target: Vec2,
  route: MoveRoute = { resolvedTarget: target, waypoints: [target], waypointIndex: 0 },
): MoveOrder {
  return { kind: 'Move', target, route };
}

export function attackOrder(targetId: EntityId): AttackOrder {
  return { kind: 'Attack', targetId };
}

export function attackMoveOrder(target: Vec2): AttackMoveOrder {
  return { kind: 'AttackMove', target };
}

export function buildOrder(buildingType: BuildingTypeId, topLeft: TileCoord): BuildOrder {
  return { kind: 'Build', buildingType, topLeft };
}

export function produceOrder(buildingId: EntityId, unitType: UnitTypeId): ProduceOrder {
  return { kind: 'Produce', buildingId, unitType };
}
