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
  /** Current route into weapon range, or `null` while firing / waiting to repath. */
  readonly route: MoveRoute | null;
  /** Explicit player attacks win over automatic acquisition and retaliation. */
  readonly source: AttackOrderSource;
}

export type AttackOrderSource = 'explicit' | 'acquired' | 'retaliation' | 'attackMove';

/** Travel to a world position, engaging enemies met on the way. */
export interface AttackMoveOrder {
  readonly kind: 'AttackMove';
  readonly target: Vec2;
  /** The original travel route, retained unchanged while a temporary engagement plays out. */
  readonly route: MoveRoute;
  /** The temporary enemy being pursued/fired upon, if acquisition found one. */
  readonly engagement: AttackOrder | null;
}

/** Send a worker to raise a building whose footprint starts at `topLeft`. */
export interface BuildOrder {
  readonly kind: 'Build';
  readonly buildingType: BuildingTypeId;
  readonly topLeft: TileCoord;
  /** The construction-site entity, created the moment the order is issued. */
  readonly buildingId: EntityId;
  /** The route still being walked to reach the site, or `null` once the Worker has arrived. */
  readonly route: MoveRoute | null;
}

/** Queue a unit at a production building. */
export interface ProduceOrder {
  readonly kind: 'Produce';
  readonly buildingId: EntityId;
  readonly unitType: UnitTypeId;
}

/** One leg of a Worker's gather cycle. */
export type GatherPhase = 'toField' | 'gathering' | 'toDropoff';

/** Travel to a resource field, gather timed Credits, carry them to a drop-off, and repeat. */
export interface GatherOrder {
  readonly kind: 'Gather';
  readonly fieldId: string;
  readonly phase: GatherPhase;
  /** The route still being walked this leg, or `null` while standing still (`gathering`, or having
   * just arrived and about to switch phase). */
  readonly route: MoveRoute | null;
  /** Elapsed seconds of the current `gathering` phase. 0 outside that phase. */
  readonly gatherElapsedSeconds: number;
  /** The building being delivered to. Set once the `toDropoff` phase begins. */
  readonly dropoffId: EntityId | null;
}

export type Order = MoveOrder | AttackOrder | AttackMoveOrder | BuildOrder | ProduceOrder | GatherOrder;

export type OrderKind = Order['kind'];

export function moveOrder(
  target: Vec2,
  route: MoveRoute = { resolvedTarget: target, waypoints: [target], waypointIndex: 0 },
): MoveOrder {
  return { kind: 'Move', target, route };
}

export function attackOrder(
  targetId: EntityId,
  route: MoveRoute | null = null,
  source: AttackOrderSource = 'explicit',
): AttackOrder {
  return { kind: 'Attack', targetId, route, source };
}

export function attackMoveOrder(
  target: Vec2,
  route: MoveRoute = { resolvedTarget: target, waypoints: [target], waypointIndex: 0 },
  engagement: AttackOrder | null = null,
): AttackMoveOrder {
  return { kind: 'AttackMove', target, route, engagement };
}

export function buildOrder(
  buildingType: BuildingTypeId,
  topLeft: TileCoord,
  buildingId: EntityId,
  route: MoveRoute | null,
): BuildOrder {
  return { kind: 'Build', buildingType, topLeft, buildingId, route };
}

export function produceOrder(buildingId: EntityId, unitType: UnitTypeId): ProduceOrder {
  return { kind: 'Produce', buildingId, unitType };
}

export function gatherOrder(
  fieldId: string,
  phase: GatherPhase,
  route: MoveRoute | null,
  gatherElapsedSeconds = 0,
  dropoffId: EntityId | null = null,
): GatherOrder {
  return { kind: 'Gather', fieldId, phase, route, gatherElapsedSeconds, dropoffId };
}
