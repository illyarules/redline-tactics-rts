/**
 * A typed, versioned snapshot of the world: everything needed to resume an unfinished match exactly
 * where it stood, and nothing that a fresh `createWorld` call already re-derives on its own.
 *
 * `stats` and `footprint` are deliberately left out of every entity snapshot: both are resolved
 * once, deterministically, from `type` + `faction` + config at creation time, so persisting them
 * would only be duplicated state that could drift from a future balance change.
 * Pure TypeScript: this module must not import Babylon, `game/` or `ui/`.
 */
import { createEconomy, serializeEconomy, type Economy, type EconomySnapshot } from './economy';
import {
  createAiState,
  isAiSnapshotShape,
  restoreAiState,
  serializeAiState,
  type AiSnapshot,
  type AiState,
} from './ai';
import { isAlive, isUnit } from './entities';
import type { EntityStatus, ProductionQueueItem } from './entities';
import {
  isFogSnapshotShape,
  restoreFogState,
  serializeFogState,
  type FogSnapshot,
  type FogState,
} from './fog';
import type { TileCoord, Vec2 } from './geometry';
import type { BuildingTypeId, EntityId, FactionId, PlayerId, UnitTypeId } from './ids';
import type { MapGrid } from './map';
import {
  attackMoveOrder,
  attackOrder,
  buildOrder,
  gatherOrder,
  moveOrder,
  produceOrder,
  type AttackOrder,
  type Order,
} from './orders';
import {
  createResourceFieldState,
  serializeResourceFieldState,
  type ResourceFieldState,
  type ResourceFieldStateSnapshot,
} from './resourceFieldState';
import { createWorld, type World } from './world';
import {
  createMatchLifecycle,
  isMatchLifecycleSnapshot,
  restoreMatchLifecycle,
  serializeMatchLifecycle,
  type MatchLifecycleSnapshot,
  type MatchLifecycleState,
} from './matchLifecycle';

/**
 * Bumped whenever a saved shape stops matching what `restoreWorld` expects, so an old save from a
 * prior version is discarded instead of misread.
 */
export const SNAPSHOT_SCHEMA_VERSION = 14;

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
  readonly attackCooldownRemainingSeconds: number;
  readonly carriedCredits: number;
  readonly entrenchment?: import('./entities').UnitEntity['entrenchment'];
  readonly entrenchElapsedSeconds?: number;
}

export interface BuildingSnapshot extends EntitySnapshotBase {
  readonly kind: 'building';
  readonly type: BuildingTypeId;
  readonly topLeft: TileCoord;
  readonly constructionProgress: number;
  readonly productionQueue: readonly ProductionQueueItem[];
}

export type EntitySnapshot = UnitSnapshot | BuildingSnapshot;

/** Everything needed to resume a match: the surviving entities and what the player had selected. */
export interface WorldSnapshot {
  readonly schemaVersion: number;
  readonly mapId: string;
  readonly entities: readonly EntitySnapshot[];
  readonly selection: readonly EntityId[];
  readonly credits: EconomySnapshot;
  readonly resourceFields: ResourceFieldStateSnapshot;
  /** Per-player hidden/explored/visible cells, including the fog cadence remainder. */
  readonly fog: FogSnapshot;
  /** AI strategy state and its time remaining until the next decision. */
  readonly ai: AiSnapshot;
  /** A second independent controller exists only on 1v2 maps. */
  readonly secondaryAi: AiSnapshot | null;
  /** Active clock, production/loss statistics and any terminal match result. */
  readonly lifecycle: MatchLifecycleSnapshot;
}

/**
 * Captures every living entity in `world`, in creation order, plus the given selection, every
 * player's Credits balance and every field's remaining Credits. Destroyed entities are left out: a
 * corpse carries no rule that matters once the match resumes.
 */
export function serializeWorld(
  world: World,
  selection: readonly EntityId[],
  economy: Economy,
  resourceFieldState: ResourceFieldState,
  fog: FogState,
  grid: MapGrid,
  ai: AiState = createAiState(),
  lifecycle: MatchLifecycleState = createMatchLifecycle(),
  secondaryAi: AiState | null = null,
): WorldSnapshot {
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
        ? {
            ...base,
            kind: 'unit',
            type: entity.type,
            facingRadians: entity.facingRadians,
            attackCooldownRemainingSeconds: entity.attackCooldownRemainingSeconds,
            carriedCredits: entity.carriedCredits,
            entrenchment: entity.entrenchment,
            entrenchElapsedSeconds: entity.entrenchElapsedSeconds,
          }
        : {
            ...base,
            kind: 'building',
            type: entity.type,
            topLeft: entity.topLeft,
            constructionProgress: entity.constructionProgress,
            productionQueue: entity.productionQueue.map((item) => ({ ...item })),
          },
    );
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    mapId: grid.id,
    entities,
    selection: [...selection],
    credits: serializeEconomy(economy),
    resourceFields: serializeResourceFieldState(resourceFieldState, grid),
    fog: serializeFogState(fog),
    ai: serializeAiState(ai),
    secondaryAi: secondaryAi === null ? null : serializeAiState(secondaryAi),
    lifecycle: serializeMatchLifecycle(lifecycle),
  };
}

/**
 * A cheap, top-level shape check only — is this a plausible `WorldSnapshot` at all, from a schema
 * version this build understands? It never inspects individual entities and never throws; deep
 * per-entity validation happens implicitly in `restoreWorld`, which the caller must guard instead.
 */
// eslint-disable-next-line complexity -- Validation verifies the complete externally stored snapshot contract.
export function isValidSnapshotShape(raw: unknown): raw is WorldSnapshot {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  const candidate = raw as Record<string, unknown>;
  return (
    candidate.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
    typeof candidate.mapId === 'string' &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.selection) &&
    typeof candidate.credits === 'object' &&
    candidate.credits !== null &&
    Array.isArray(candidate.resourceFields) &&
    isFogSnapshotShape(candidate.fog) &&
    isAiSnapshotShape(candidate.ai) &&
    (candidate.secondaryAi === null || isAiSnapshotShape(candidate.secondaryAi)) &&
    isMatchLifecycleSnapshot(candidate.lifecycle)
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
// eslint-disable-next-line complexity -- Restoration maps all entity references before rebuilding dependent state.
export function restoreWorld(
  snapshot: WorldSnapshot,
  grid: MapGrid,
): {
  world: World;
  selection: readonly EntityId[];
  economy: Economy;
  resourceFieldState: ResourceFieldState;
  fog: FogState;
  ai: AiState;
  secondaryAi: AiState | null;
  lifecycle: MatchLifecycleState;
} {
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  if (snapshot.mapId !== grid.id) throw new Error('Snapshot belongs to a different map');
  const idMap = new Map<EntityId, EntityId>();

  for (const entitySnapshot of snapshot.entities) {
    if (entitySnapshot.kind === 'building' && !Array.isArray(entitySnapshot.productionQueue)) {
      throw new Error('Building snapshot needs a production queue');
    }
    if (
      entitySnapshot.kind === 'unit' &&
      typeof entitySnapshot.attackCooldownRemainingSeconds !== 'number'
    ) {
      throw new Error('Unit snapshot needs an attack cooldown');
    }
    const created =
      entitySnapshot.kind === 'unit'
        ? world.createUnit({
            type: entitySnapshot.type,
            owner: entitySnapshot.owner,
            faction: entitySnapshot.faction,
            position: entitySnapshot.position,
            health: entitySnapshot.health,
            attackCooldownRemainingSeconds: entitySnapshot.attackCooldownRemainingSeconds,
            entrenchment: entitySnapshot.entrenchment ?? 'mobile',
            entrenchElapsedSeconds: entitySnapshot.entrenchElapsedSeconds ?? 0,
          })
        : world.createBuilding({
            type: entitySnapshot.type,
            owner: entitySnapshot.owner,
            faction: entitySnapshot.faction,
            topLeft: entitySnapshot.topLeft,
            health: entitySnapshot.health,
            constructionProgress: entitySnapshot.constructionProgress,
            productionQueue: entitySnapshot.productionQueue,
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
      world.setCarriedCredits(newId, entitySnapshot.carriedCredits);
    }
    if (entitySnapshot.order !== null) {
      world.setOrder(newId, remapOrder(entitySnapshot.order, idMap));
    }
  }

  const selection = snapshot.selection.flatMap((id) => {
    const mapped = idMap.get(id);
    return mapped === undefined ? [] : [mapped];
  });

  const rememberedBase = snapshot.ai.lastKnownPlayerBasePosition;
  if (rememberedBase !== null && !grid.isInBounds(grid.worldToTile(rememberedBase).tx, grid.worldToTile(rememberedBase).ty)) {
    throw new Error('AI remembered base is outside the map');
  }
  const secondaryRememberedBase = snapshot.secondaryAi?.lastKnownPlayerBasePosition ?? null;
  if (secondaryRememberedBase !== null && !grid.isInBounds(
    grid.worldToTile(secondaryRememberedBase).tx,
    grid.worldToTile(secondaryRememberedBase).ty,
  )) throw new Error('Secondary AI remembered base is outside the map');
  return {
    world,
    selection,
    economy: createEconomy(undefined, snapshot.credits),
    resourceFieldState: createResourceFieldState(grid, snapshot.resourceFields),
    fog: restoreFogState(snapshot.fog, grid),
    ai: restoreAiState(snapshot.ai),
    secondaryAi: snapshot.secondaryAi === null ? null : restoreAiState(snapshot.secondaryAi),
    lifecycle: restoreMatchLifecycle(snapshot.lifecycle),
  };
}

/**
 * Rebuilds one order through its own factory function, remapping any entity id it carries. An
 * order referencing an id that was not persisted (the entity it pointed at was already dead, or
 * otherwise absent, at save time) is unrestorable and becomes `null` rather than failing the whole
 * restore.
 */
// eslint-disable-next-line complexity -- The order union is remapped exhaustively to preserve snapshot compatibility.
function remapOrder(order: OrderSnapshot, idMap: ReadonlyMap<EntityId, EntityId>): Order | null {
  switch (order.kind) {
    case 'Move':
      return moveOrder(order.target, order.route);
    case 'AttackMove':
      return attackMoveOrder(
        order.target,
        order.route,
        order.engagement === null ? null : remapAttackOrder(order.engagement, idMap),
      );
    case 'Build': {
      const buildingId = idMap.get(order.buildingId);
      return buildingId === undefined ? null : buildOrder(order.buildingType, order.topLeft, buildingId, order.route);
    }
    case 'Attack': {
      return remapAttackOrder(order, idMap);
    }
    case 'Produce': {
      const buildingId = idMap.get(order.buildingId);
      return buildingId === undefined ? null : produceOrder(buildingId, order.unitType);
    }
    case 'Gather': {
      // The drop-off is resolved lazily by `stepGather` when it is missing or stale, so an
      // unpersisted drop-off only means one extra lookup next tick, not a broken restore.
      const dropoffId = order.dropoffId === null ? null : (idMap.get(order.dropoffId) ?? null);
      return gatherOrder(order.fieldId, order.phase, order.route, order.gatherElapsedSeconds, dropoffId);
    }
  }
}

function remapAttackOrder(
  order: AttackOrder,
  idMap: ReadonlyMap<EntityId, EntityId>,
): AttackOrder | null {
  const targetId = idMap.get(order.targetId);
  return targetId === undefined ? null : attackOrder(targetId, order.route, order.source);
}
