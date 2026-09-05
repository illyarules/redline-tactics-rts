/**
 * A typed, versioned snapshot of the world: everything needed to resume an unfinished match exactly
 * where it stood, and nothing that a fresh `createWorld` call already re-derives on its own.
 *
 * `stats` and `footprint` are deliberately left out of every entity snapshot: both are resolved
 * once, deterministically, from `type` + `faction` + config at creation time, so persisting them
 * would only be duplicated state that could drift from a future balance change.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import type { EntityStatus } from './entities';
import { isAlive, isUnit } from './entities';
import type { TileCoord, Vec2 } from './geometry';
import type { BuildingTypeId, EntityId, FactionId, PlayerId, UnitTypeId } from './ids';
import {
  attackMoveOrder,
  attackOrder,
  buildOrder,
  moveOrder,
  produceOrder,
  type Order,
} from './orders';
import { createWorld, type World } from './world';

/**
 * Bumped whenever a saved shape stops matching what `restoreWorld` expects, so an old save from a
 * prior version is discarded instead of misread.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * The persisted shape of an `Order`. Structurally identical to `core/orders.ts`'s `Order` union —
 * every field of every order kind is already plain JSON data — so it is kept as a direct alias
 * rather than a hand-duplicated copy that could drift out of sync with the real type.
 */
export type OrderSnapshot = Order;

interface EntitySnapshotBase {
  readonly id: EntityId;
  readonly owner: PlayerId;
  readonly faction: FactionId;
  readonly position: Vec2;
  readonly health: number;
  readonly status: EntityStatus;
  readonly order: OrderSnapshot | null;
}

export interface UnitSnapshot extends EntitySnapshotBase {
  readonly kind: 'unit';
  readonly type: UnitTypeId;
  readonly facingRadians: number;
}

export interface BuildingSnapshot extends EntitySnapshotBase {
  readonly kind: 'building';
  readonly type: BuildingTypeId;
  readonly topLeft: TileCoord;
}

export type EntitySnapshot = UnitSnapshot | BuildingSnapshot;

/** Everything needed to resume a match: the surviving entities and what the player had selected. */
export interface WorldSnapshot {
  readonly schemaVersion: number;
  readonly entities: readonly EntitySnapshot[];
  readonly selection: readonly EntityId[];
}

/**
 * Captures every living entity in `world`, in creation order, plus the given selection. Destroyed
 * entities are left out: a corpse carries no rule that matters once the match resumes.
 */
export function serializeWorld(world: World, selection: readonly EntityId[]): WorldSnapshot {
  const entities: EntitySnapshot[] = [];

  for (const entity of world.entities()) {
    if (!isAlive(entity)) {
      continue;
    }

    const base = {
      id: entity.id,
      owner: entity.owner,
      faction: entity.faction,
      position: entity.position,
      health: entity.health,
      status: entity.status,
      order: entity.order,
    };

    entities.push(
      isUnit(entity)
        ? { ...base, kind: 'unit', type: entity.type, facingRadians: entity.facingRadians }
        : { ...base, kind: 'building', type: entity.type, topLeft: entity.topLeft },
    );
  }

  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities, selection: [...selection] };
}

/**
 * A cheap, top-level shape check only — is this a plausible `WorldSnapshot` at all, from a schema
 * version this build understands? It never inspects individual entities and never throws; deep
 * per-entity validation happens implicitly in `restoreWorld`, which the caller must guard instead.
 */
export function isValidSnapshotShape(raw: unknown): raw is WorldSnapshot {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    candidate.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.selection)
  );
}

/**
 * Rebuilds a brand-new `World` from a snapshot. Entities are recreated in snapshot order through
 * the same validating `createUnit`/`createBuilding` calls a fresh match uses, so malformed saved
 * data throws here rather than being silently accepted — callers decide what to do about that.
 *
 * Restored entities get freshly assigned ids that do not generally match their snapshot ids (the
 * snapshot may itself have gaps from removed entities), so every reference to another entity — an
 * order's `targetId`/`buildingId`, and the selection — is carried through an id map built while
 * entities are created, resolved only once every entity exists.
 */
export function restoreWorld(
  snapshot: WorldSnapshot,
  tileSizePixels: number,
): { world: World; selection: readonly EntityId[] } {
  const world = createWorld({ tileSizePixels });
  const idMap = new Map<EntityId, EntityId>();

  for (const entitySnapshot of snapshot.entities) {
    const created =
      entitySnapshot.kind === 'unit'
        ? world.createUnit({
            type: entitySnapshot.type,
            owner: entitySnapshot.owner,
            faction: entitySnapshot.faction,
            position: entitySnapshot.position,
            health: entitySnapshot.health,
          })
        : world.createBuilding({
            type: entitySnapshot.type,
            owner: entitySnapshot.owner,
            faction: entitySnapshot.faction,
            topLeft: entitySnapshot.topLeft,
            health: entitySnapshot.health,
          });
    idMap.set(entitySnapshot.id, created.id);
  }

  for (const entitySnapshot of snapshot.entities) {
    const newId = idMap.get(entitySnapshot.id);
    if (newId === undefined) {
      // Every snapshot entity was just created above, so its id map entry always exists. Guarded
      // only so the lookup's `| undefined` type does not have to be asserted away.
      continue;
    }

    world.setStatus(newId, entitySnapshot.status);
    if (entitySnapshot.kind === 'unit') {
      world.setFacingRadians(newId, entitySnapshot.facingRadians);
    }
    if (entitySnapshot.order !== null) {
      world.setOrder(newId, remapOrder(entitySnapshot.order, idMap));
    }
  }

  const selection = snapshot.selection.flatMap((id) => {
    const mapped = idMap.get(id);
    return mapped === undefined ? [] : [mapped];
  });

  return { world, selection };
}

/**
 * Rebuilds one order through its own factory function, remapping any entity id it carries. An
 * order referencing an id that was not persisted (the entity it pointed at was already dead, or
 * otherwise absent, at save time) is unrestorable and becomes `null` rather than failing the whole
 * restore.
 */
function remapOrder(order: OrderSnapshot, idMap: ReadonlyMap<EntityId, EntityId>): Order | null {
  switch (order.kind) {
    case 'Move':
      return moveOrder(order.target, order.route);
    case 'AttackMove':
      return attackMoveOrder(order.target);
    case 'Build':
      return buildOrder(order.buildingType, order.topLeft);
    case 'Attack': {
      const targetId = idMap.get(order.targetId);
      return targetId === undefined ? null : attackOrder(targetId);
    }
    case 'Produce': {
      const buildingId = idMap.get(order.buildingId);
      return buildingId === undefined ? null : produceOrder(buildingId, order.unitType);
    }
  }
}
