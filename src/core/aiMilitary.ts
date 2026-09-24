/** Pure military plans and a narrow executor using the same queues/orders as player commands. */
import { AI_CONFIG } from '../config/ai';
import type { AiConfig } from '../config/types';
import type { AiState, AiStepResult } from './ai';
import { issueAttackMoveOrders } from './attackMove';
import type { Economy } from './economy';
import { isAlive } from './entities';
import type { Vec2 } from './geometry';
import type { EntityId, PlayerId, UnitTypeId } from './ids';
import type { MapGrid } from './map';
import { isProductionActive } from './power';
import { isCompleted } from './prerequisites';
import { checkProductionRequest, queueProduction } from './production';
import type { World } from './world';

export interface AiMilitaryContext {
  readonly world: World;
  readonly grid: MapGrid;
  readonly economy: Economy;
}
export type AiMilitaryIntent =
  | { readonly kind: 'produce'; readonly producerId: EntityId; readonly unitType: UnitTypeId }
  | { readonly kind: 'scout' | 'attack'; readonly unitIds: readonly EntityId[]; readonly target: Vec2 };

/** Debug-only history is transient, never a second copy of orders or queues. */
export interface AiMilitaryReadout { latestAction: string }
export const aiArmy = (world: World, owner: PlayerId = 'ai') =>
  world.units(owner).filter((u) => isAlive(u) && u.stats.attack !== null);

// eslint-disable-next-line complexity -- Military planning uses ordered tactical gates before emitting an intent.
export function planAiMilitary(
  ai: AiState,
  { world, grid, economy }: AiMilitaryContext,
  config: AiConfig = AI_CONFIG,
  owner: PlayerId = 'ai',
  opponent: PlayerId = 'player',
): readonly AiMilitaryIntent[] {
  if (!world.buildings(owner).some((b) => b.type === 'hq' && isCompleted(b))) return [];
  const intents: AiMilitaryIntent[] = [];
  const workers = world.units(owner).filter((unit) => isAlive(unit) && unit.type === 'worker');
  const workerQueued = world.buildings(owner).some((building) => building.productionQueue.some((item) => item.unitType === 'worker'));
  if (workers.length === 0 && !workerQueued) {
    const hq = world.buildings(owner).find((building) =>
      building.type === 'hq' && isCompleted(building) && checkProductionRequest(world, economy, owner, building.id, 'worker').allowed);
    if (hq !== undefined) return [{ kind: 'produce', producerId: hq.id, unitType: 'worker' }];
  }
  const army = aiArmy(world, owner); // World creation order is deterministic, including after restore.
  // Reserve the normal opening for economy, but allow emergency reinforcements while defending or recovering.
  const mayReinforce = ai.buildOrderIndex === config.buildOrder.length || ai.state === 'defend' || ai.state === 'recover';
  if (mayReinforce &&
    army.length + world.buildings(owner).reduce((n, b) => n + b.productionQueue.length, 0) < config.targetArmyUnits) {
    const unitType = config.productionCycle[ai.productionCycleIndex]!;
    const producer = world.buildings(owner).find((b) =>
      isCompleted(b) && isProductionActive(world, owner, b.stats.requiresPower) &&
      checkProductionRequest(world, economy, owner, b.id, unitType).allowed);
    if (producer !== undefined) intents.push({ kind: 'produce', producerId: producer.id, unitType });
  }
  const attacking = ai.state === 'attack' && ai.lastKnownPlayerBasePosition !== null &&
    army.length >= config.minimumAttackArmyUnits;
  const start = grid.startFor(opponent);
  const target = attacking ? ai.lastKnownPlayerBasePosition :
    ai.state === 'scout' && ai.lastKnownPlayerBasePosition === null && start !== undefined
      ? grid.tileCenter(start.hqTopLeft.tx, start.hqTopLeft.ty) : null;
  if (target !== null) {
    const selected = attacking ? army : army.slice(0, 1);
    const unitIds = selected.filter((u) =>
      !(u.order?.kind === 'AttackMove' && u.order.target.x === target.x && u.order.target.y === target.y) &&
      u.order?.kind !== 'Attack' &&
      !(u.order === null && Math.hypot(u.position.x - target.x, u.position.y - target.y) <=
        config.commandArrivalRadiusTiles * grid.tileSizePixels)).map((u) => u.id);
    if (unitIds.length > 0) intents.push({ kind: attacking ? 'attack' : 'scout', unitIds, target: { ...target } });
  }
  return intents;
}

/** Re-plan before applying so stale/forged plans cannot bypass ownership, strategy or knowledge. */
export function executeAiMilitaryIntent(ai: AiState, context: AiMilitaryContext, intent: AiMilitaryIntent, config: AiConfig = AI_CONFIG, owner: PlayerId = 'ai'): boolean {
  const valid = planAiMilitary(ai, context, config, owner).some((p) => {
    if (p.kind === 'produce' || intent.kind === 'produce') {
      return p.kind === 'produce' && intent.kind === 'produce' &&
        p.producerId === intent.producerId && p.unitType === intent.unitType;
    }
    return p.kind === intent.kind && p.target.x === intent.target.x && p.target.y === intent.target.y &&
      p.unitIds.length === intent.unitIds.length && p.unitIds.every((id, index) => id === intent.unitIds[index]);
  });
  if (!valid) return false;
  if (intent.kind === 'produce') {
    if (!queueProduction(context.world, context.economy, owner, intent.producerId, intent.unitType).allowed) return false;
    if (intent.unitType !== 'worker') {
      ai.productionCycleIndex = (ai.productionCycleIndex + 1) % config.productionCycle.length;
    }
    return true;
  }
  return issueAttackMoveOrders(context.world, context.grid, owner, intent.unitIds, intent.target).length > 0;
}

export function executeAiMilitaryDecisions(ai: AiState, step: AiStepResult, context: AiMilitaryContext, readout?: AiMilitaryReadout, owner: PlayerId = 'ai'): void {
  for (let tick = 0; tick < step.evaluations; tick++) {
    const decisionAi = { ...ai, state: step.intents[tick]?.state ?? ai.state };
    for (const intent of planAiMilitary(decisionAi, context, AI_CONFIG, owner)) {
      if (executeAiMilitaryIntent(decisionAi, context, intent, AI_CONFIG, owner) && readout !== undefined) {
        readout.latestAction = intent.kind === 'produce' ? 'queue ' + intent.unitType : intent.kind + ' ' + intent.unitIds.length;
      }
    }
    ai.productionCycleIndex = decisionAi.productionCycleIndex;
  }
}
