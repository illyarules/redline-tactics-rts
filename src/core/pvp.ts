/** Authoritative, renderer-free rules for the first two-human Open Field match. */
import { MAP_CONFIG } from '../config/map';
import { BUILDING_CONFIG } from '../config/buildings';
import { MATCH_SETUP } from '../config/match';
import { UNIT_TYPE_IDS, BUILDING_TYPE_IDS, type EntityId } from './ids';
import { createMapGrid } from './map';
import { createWorld } from './world';
import { populateStartingEntities } from './matchSetup';
import { createEconomy } from './economy';
import { createResourceFieldState } from './resourceFieldState';
import { createFogState, fogTargetPredicate, isEntityVisibleToPlayer, cellVisibility, stepFogVisibility, updateFogVisibility } from './fog';
import { issueGroupMoveOrders } from './formation';
import { issueAttackMoveOrders, stepAttackMoveOrders } from './attackMove';
import { issueAttackOrders, stepAttackOrders, type AttackHitEvent } from './attack';
import { issueGatherOrder, stepGather } from './gather';
import { startConstruction, resumeConstruction, stepConstruction } from './construction';
import { queueProduction, cancelProduction, stepProduction } from './production';
import { startEntrenchment, clearEntrenchment, stepEntrenchment } from './entrenchment';
import { stepMovement } from './movement';
import { stepAttackCooldowns } from './combat';
import { createAutoTargetingState, issueRetaliationOrders, stepAutomaticTargeting } from './autoCombat';
import { stepSeparation } from './separation';
import { isAlive } from './entities';
import type { ReadonlyEntity } from './entities';
import type { AttackerTypeId } from '../config/types';
import type { Order } from './orders';

export const PVP_TICK_SECONDS = 0.05;
export const PVP_DURATION_TICKS = 18_000;
export type Seat = 'player' | 'ai';
export type PvpResult = { winner: Seat | null; reason: 'elimination' | 'surrender' | 'disconnect' | 'timeout' | 'aborted' };
export type PvpOrderView =
  | { readonly kind: 'Move' | 'AttackMove'; readonly target: { readonly x: number; readonly y: number } }
  | { readonly kind: 'Attack'; readonly targetId: string };
export type PvpCombatEffect =
  | {
      readonly eventId: string;
      readonly kind: 'combat-hit';
      readonly weapon: AttackerTypeId;
      readonly from: { readonly x: number; readonly y: number };
      readonly to: { readonly x: number; readonly y: number };
      readonly targetKind: 'unit' | 'building';
      readonly targetToken: string;
      readonly targetSizeTiles: number;
      readonly targetDestroyed: boolean;
    }
  | {
      readonly eventId: string;
      readonly kind: 'combat-death';
      readonly at: { readonly x: number; readonly y: number };
      readonly targetToken: string;
    };
export type PvpCombatEffectsBySeat = Readonly<Record<Seat, readonly PvpCombatEffect[]>>;
export type PvpCommand =
  | { type: 'Move' | 'AttackMove'; unitIds: EntityId[]; destination: { x: number; y: number } }
  | { type: 'Attack'; unitIds: EntityId[]; targetId: EntityId }
  | { type: 'Gather'; unitIds: EntityId[]; fieldId: string }
  | { type: 'Build'; workerId: EntityId; buildingType: typeof BUILDING_TYPE_IDS[number]; topLeft: { tx: number; ty: number } }
  | { type: 'ResumeConstruction'; workerId: EntityId; buildingId: EntityId }
  | { type: 'Produce'; buildingId: EntityId; unitType: typeof UNIT_TYPE_IDS[number] }
  | { type: 'CancelProduction'; buildingId: EntityId; queueEntryId: string }
  | { type: 'SetEntrenchment'; unitIds: EntityId[]; entrenched: boolean }
  | { type: 'Surrender' };

// eslint-disable-next-line complexity -- The protocol union is checked field by field at its trust boundary.
export function isPvpCommand(value: unknown): value is PvpCommand {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= 100 && v.every((id) => typeof id === 'string' && id.length <= 64);
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
  const point = (v: unknown): boolean => typeof v === 'object' && v !== null && Number.isFinite((v as {x?: number}).x) && Number.isFinite((v as {y?: number}).y);
  const tile = (v: unknown): boolean => typeof v === 'object' && v !== null && Number.isInteger((v as {tx?: number}).tx) && Number.isInteger((v as {ty?: number}).ty);
  switch (c.type) {
    case 'Move': case 'AttackMove': return ids(c.unitIds) && point(c.destination);
    case 'Attack': return ids(c.unitIds) && id(c.targetId);
    case 'Gather': return ids(c.unitIds) && id(c.fieldId);
    case 'Build': return id(c.workerId) && BUILDING_TYPE_IDS.includes(c.buildingType as typeof BUILDING_TYPE_IDS[number]) && tile(c.topLeft);
    case 'ResumeConstruction': return id(c.workerId) && id(c.buildingId);
    case 'Produce': return id(c.buildingId) && UNIT_TYPE_IDS.includes(c.unitType as typeof UNIT_TYPE_IDS[number]);
    case 'CancelProduction': return id(c.buildingId) && id(c.queueEntryId);
    case 'SetEntrenchment': return ids(c.unitIds) && typeof c.entrenched === 'boolean';
    case 'Surrender': return true;
    default: return false;
  }
}

export class PvpMatch {
  readonly grid = createMapGrid(MAP_CONFIG);
  readonly world = createWorld({ tileSizePixels: this.grid.tileSizePixels });
  readonly economy = createEconomy(undefined, undefined, ['player', 'ai']);
  readonly fields = createResourceFieldState(this.grid);
  readonly fog = createFogState(this.grid, ['player', 'ai']);
  private readonly targeting = createAutoTargetingState();
  private readonly publicIds = new Map<EntityId, string>();
  private readonly coreIds = new Map<string, EntityId>();
  private nextQueueId = 1;
  private nextEffectId = 1;
  tick = 0;
  result: PvpResult | null = null;

  constructor() {
    populateStartingEntities(this.world, this.grid, { ...MATCH_SETUP, factions: { player: 'meridian', ai: 'meridian', ai2: 'meridian' } });
    updateFogVisibility(this.fog, this.world, this.grid);
  }

  // eslint-disable-next-line complexity -- Every command branch owns its own authoritative validation.
  apply(seat: Seat, command: PvpCommand): { ok: boolean; actorIds: EntityId[] } {
    if (this.result !== null) return { ok: false, actorIds: [] };
    if (command.type === 'Surrender') {
      this.result = { winner: other(seat), reason: 'surrender' };
      return { ok: true, actorIds: [] };
    }
    command = this.decodeCommand(command);
    const ownedUnit = (id: EntityId) => { const unit = this.world.unit(id); return unit !== undefined && isAlive(unit) && unit.owner === seat; };
    const ownedBuilding = (id: EntityId) => { const building = this.world.building(id); return building !== undefined && isAlive(building) && building.owner === seat; };
    if ('unitIds' in command && (!command.unitIds.every(ownedUnit) || new Set(command.unitIds).size !== command.unitIds.length)) return { ok: false, actorIds: [] };
    if ('workerId' in command && (!ownedUnit(command.workerId) || this.world.unit(command.workerId)?.type !== 'worker')) return { ok: false, actorIds: [] };
    if ('buildingId' in command && command.type !== 'ResumeConstruction' && !ownedBuilding(command.buildingId)) return { ok: false, actorIds: [] };
    switch (command.type) {
      case 'Move': case 'AttackMove': {
        const { x, y } = command.destination;
        if (x < 0 || y < 0 || x >= this.grid.widthTiles * this.grid.tileSizePixels || y >= this.grid.heightTiles * this.grid.tileSizePixels) break;
        const applied = command.type === 'Move'
          ? issueGroupMoveOrders(this.world, this.grid, seat, command.unitIds, command.destination)
          : issueAttackMoveOrders(this.world, this.grid, seat, command.unitIds, command.destination);
        return { ok: applied.length > 0, actorIds: applied.map((id) => this.toPublicId(id)) };
      }
      case 'Attack': {
        const target = this.world.get(command.targetId);
        if (target === undefined || target.owner === seat || !isEntityVisibleToPlayer(this.fog, seat, target)) break;
        const applied = issueAttackOrders(this.world, seat, command.unitIds, command.targetId, fogTargetPredicate(this.fog));
        return { ok: applied.length > 0, actorIds: command.unitIds.map((id) => this.toPublicId(id)) };
      }
      case 'Gather': {
        const field = this.grid.resourceFields.find((candidate) => candidate.id === command.fieldId);
        if (field === undefined || cellVisibility(this.fog, seat, field.center.tx, field.center.ty) !== 'visible') break;
        const actors = command.unitIds.filter((id) => this.world.unit(id)?.type === 'worker' && issueGatherOrder(this.world, this.grid, this.economy, seat, id, field.id));
        return { ok: actors.length > 0, actorIds: actors.map((id) => this.toPublicId(id)) };
      }
      case 'Build': {
        const { tx, ty } = command.topLeft;
        const footprint = BUILDING_CONFIG[command.buildingType].footprint;
        if (!this.grid.isInBounds(tx, ty) || Array.from({ length: footprint.height }, (_, dy) => Array.from({ length: footprint.width }, (_, dx) => cellVisibility(this.fog, seat, tx + dx, ty + dy))).flat().some((value) => value !== 'visible')) break;
        const result = startConstruction(this.world, this.grid, this.economy, seat, 'meridian', command.buildingType, command.topLeft, command.workerId);
        return { ok: result !== null, actorIds: result !== null ? [this.toPublicId(command.workerId)] : [] };
      }
      case 'ResumeConstruction': {
        if (!ownedBuilding(command.buildingId)) break;
        const applied = resumeConstruction(this.world, this.grid, seat, command.buildingId, command.workerId);
        return { ok: applied, actorIds: applied ? [this.toPublicId(command.workerId)] : [] };
      }
      case 'Produce': {
        const result = queueProduction(this.world, this.economy, seat, command.buildingId, command.unitType);
        if (result.allowed) {
          const building = this.world.building(command.buildingId)!;
          const queue = [...building.productionQueue];
          queue[queue.length - 1] = { ...queue[queue.length - 1]!, id: `q${this.nextQueueId++}` };
          this.world.setProductionQueue(building.id, queue);
        }
        return { ok: result.allowed, actorIds: result.allowed ? [this.toPublicId(command.buildingId)] : [] };
      }
      case 'CancelProduction': {
        const index = this.world.building(command.buildingId)?.productionQueue.findIndex((entry) => entry.id === command.queueEntryId) ?? -1;
        const result = cancelProduction(this.world, this.economy, command.buildingId, index);
        return { ok: result.cancelled, actorIds: result.cancelled ? [this.toPublicId(command.buildingId)] : [] };
      }
      case 'SetEntrenchment': {
        if (command.entrenched) {
          const actors = startEntrenchment(this.world, seat, command.unitIds);
          return { ok: actors.length > 0, actorIds: actors.map((id) => this.toPublicId(id)) };
        }
        const actors = command.unitIds.filter((id) => {
          const unit = this.world.unit(id);
          return unit?.type === 'fpvOperators' && unit.entrenchment !== 'mobile';
        });
        actors.forEach((id) => clearEntrenchment(this.world, id));
        return { ok: actors.length > 0, actorIds: actors.map((id) => this.toPublicId(id)) };
      }
    }
    return { ok: false, actorIds: [] };
  }

  step(): PvpCombatEffectsBySeat {
    const noEffects: PvpCombatEffectsBySeat = { player: [], ai: [] };
    if (this.result !== null) return noEffects;
    const dt = PVP_TICK_SECONDS;
    this.tick++;
    stepMovement(this.world, dt);
    stepGather(this.world, this.grid, this.fields, this.economy, dt);
    stepConstruction(this.world, dt);
    stepEntrenchment(this.world, dt);
    stepProduction(this.world, this.grid, dt);
    stepAttackCooldowns(this.world, dt);
    stepFogVisibility(this.fog, this.world, this.grid, dt);
    const canTarget = (observer: Parameters<ReturnType<typeof fogTargetPredicate>>[0], target: Parameters<ReturnType<typeof fogTargetPredicate>>[1]) => observer.owner !== target.owner && isEntityVisibleToPlayer(this.fog, observer.owner, target);
    stepAutomaticTargeting(this.world, this.targeting, dt, undefined, canTarget);
    const hits = [...stepAttackOrders(this.world, this.grid, dt, canTarget), ...stepAttackMoveOrders(this.world, this.grid, dt, canTarget)];
    const effects = this.combatEffects(hits);
    for (const hit of hits) if (hit.destroyed) this.world.remove(hit.targetId);
    const living = (seat: Seat) => this.world.buildings(seat).some(isAlive);
    const a = living('player'); const b = living('ai');
    if (!a || !b) this.result = { winner: a === b ? null : a ? 'player' : 'ai', reason: 'elimination' };
    else if (this.tick >= PVP_DURATION_TICKS) this.result = { winner: null, reason: 'timeout' };
    if (this.result !== null) return effects;
    issueRetaliationOrders(this.world, hits, canTarget);
    stepSeparation(this.world, this.grid, dt);
    return effects;
  }

  view(seat: Seat) {
    return {
      tick: this.tick, seat, result: this.result,
      credits: this.economy.balance(seat),
      entities: this.world.entities().filter((entity) => isEntityVisibleToPlayer(this.fog, seat, entity)).map((entity) => ({
        id: this.toPublicId(entity.id), owner: entity.owner, kind: entity.kind, type: entity.type,
        x: entity.position.x, y: entity.position.y, health: entity.health, maxHealth: entity.stats.maxHealth,
        ...(entity.kind === 'unit' ? { status: entity.status, facingRadians: entity.facingRadians, entrenchment: entity.entrenchment } : {}),
        ...(entity.kind === 'unit' && entity.owner === seat ? { order: this.orderView(entity.order, seat) } : {}),
        ...(entity.kind === 'building' ? { status: entity.status, constructionProgress: entity.constructionProgress } : {}),
        ...(entity.kind === 'building' && entity.owner === seat ? { queue: entity.productionQueue.map((entry) => ({ id: entry.id, type: entry.unitType, progress: entry.elapsedSeconds })) } : {}),
      })),
      fog: Array.from({ length: this.grid.heightTiles }, (_, ty) => Array.from({ length: this.grid.widthTiles }, (_, tx) => cellVisibility(this.fog, seat, tx, ty))),
      fields: this.grid.resourceFields.filter((field) => cellVisibility(this.fog, seat, field.center.tx, field.center.ty) === 'visible').map((field) => ({ id: field.id, remaining: this.fields.remaining(field.id) })),
    };
  }

  private toPublicId(coreId: EntityId): string {
    let id = this.publicIds.get(coreId);
    if (!id) { id = globalThis.crypto.randomUUID(); this.publicIds.set(coreId, id); this.coreIds.set(id, coreId); }
    return id;
  }

  private orderView(order: Order | null, seat: Seat): PvpOrderView | null {
    if (order === null) return null;
    if (order.kind === 'Move' || order.kind === 'AttackMove') {
      return { kind: order.kind, target: { x: order.target.x, y: order.target.y } };
    }
    if (order.kind === 'Attack') {
      const target = this.world.get(order.targetId);
      return target !== undefined && isEntityVisibleToPlayer(this.fog, seat, target)
        ? { kind: 'Attack', targetId: this.toPublicId(target.id) }
        : null;
    }
    return null;
  }

  private combatEffects(hits: readonly AttackHitEvent[]): PvpCombatEffectsBySeat {
    const result: Record<Seat, PvpCombatEffect[]> = { player: [], ai: [] };
    for (const hit of hits) {
      const attacker = this.world.unit(hit.attackerId);
      const target = this.world.get(hit.targetId);
      if (attacker === undefined || attacker.type === 'worker' || target === undefined) continue;
      const effectId = `fx${this.nextEffectId++}`;
      for (const seat of ['player', 'ai'] as const) {
        if (!isEntityVisibleToPlayer(this.fog, seat, attacker) || !this.visibleEffectTarget(seat, target)) continue;
        const targetToken = this.toPublicId(target.id);
        result[seat].push({
          eventId: effectId,
          kind: 'combat-hit',
          weapon: attacker.type,
          from: { x: attacker.position.x, y: attacker.position.y },
          to: { x: target.position.x, y: target.position.y },
          targetKind: target.kind,
          targetToken,
          targetSizeTiles: targetSizeTiles(target),
          targetDestroyed: hit.destroyed,
        });
        if (hit.destroyed) {
          result[seat].push({
            eventId: `${effectId}:death`,
            kind: 'combat-death',
            at: { x: target.position.x, y: target.position.y },
            targetToken,
          });
        }
      }
    }
    return result;
  }

  private visibleEffectTarget(seat: Seat, target: ReadonlyEntity): boolean {
    if (target.owner === seat) return true;
    const tx = Math.floor(target.position.x / this.grid.tileSizePixels);
    const ty = Math.floor(target.position.y / this.grid.tileSizePixels);
    return cellVisibility(this.fog, seat, tx, ty) === 'visible';
  }

  // eslint-disable-next-line complexity -- Every command variant maps only its entity-id fields.
  private decodeCommand(command: PvpCommand): PvpCommand {
    const decode = (id: string) => this.coreIds.get(id) ?? '';
    switch (command.type) {
      case 'Move': case 'AttackMove': case 'Gather': case 'SetEntrenchment': return { ...command, unitIds: command.unitIds.map(decode) };
      case 'Attack': return { ...command, unitIds: command.unitIds.map(decode), targetId: decode(command.targetId) };
      case 'Build': return { ...command, workerId: decode(command.workerId) };
      case 'ResumeConstruction': return { ...command, workerId: decode(command.workerId), buildingId: decode(command.buildingId) };
      case 'Produce': case 'CancelProduction': return { ...command, buildingId: decode(command.buildingId) };
      case 'Surrender': return command;
    }
  }
}

function other(seat: Seat): Seat { return seat === 'player' ? 'ai' : 'player'; }
function targetSizeTiles(target: ReadonlyEntity): number {
  return target.kind === 'building'
    ? Math.max(target.footprint.width, target.footprint.height)
    : target.stats.bodySizeTiles;
}
