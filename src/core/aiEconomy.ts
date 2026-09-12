import { AI_CONFIG } from '../config/ai';
import { BUILDING_CONFIG } from '../config/buildings';
import type { AiConfig } from '../config/types';
import type { AiState, AiStepResult } from './ai';
import { planAiPlacement } from './aiPlacement';
import { startConstruction } from './construction';
import type { Economy } from './economy';
import { isAlive } from './entities';
import { canGatherField, issueGatherOrder } from './gather';
import type { TileCoord } from './geometry';
import type { BuildingTypeId, EntityId, PlayerId } from './ids';
import type { MapGrid } from './map';
import { isCompleted, checkPrerequisites } from './prerequisites';
import type { ResourceFieldState } from './resourceFieldState';
import type { World } from './world';

export type AiEconomyIntent =
  | { readonly kind: 'gather'; readonly workerId: EntityId; readonly fieldId: string }
  | { readonly kind: 'construct'; readonly workerId: EntityId; readonly buildingType: BuildingTypeId; readonly topLeft: TileCoord };
export interface AiEconomyContext {
  readonly world: World;
  readonly grid: MapGrid;
  readonly economy: Economy;
  readonly resourceFieldState: ResourceFieldState;
}

/** Pure plan: completed progress is returned, never copied into a second world model. */
// eslint-disable-next-line complexity -- Economy planning encodes ordered affordability and prerequisite decisions.
export function planAiEconomy(ai: AiState, context: AiEconomyContext, config: AiConfig = AI_CONFIG, owner: PlayerId = 'ai'):
  { readonly buildOrderIndex: number; readonly intent: AiEconomyIntent | null } {
  const { world, grid, economy, resourceFieldState } = context;
  let index = 0;
  while (index < config.buildOrder.length && world.buildings(owner).some((b) => b.type === config.buildOrder[index] && isCompleted(b))) index++;
  const result = (intent: AiEconomyIntent | null) => ({ buildOrderIndex: index, intent });
  const base = world.buildings(owner).find((b) => b.type === 'hq' && isCompleted(b));
  if (base === undefined) return result(null);
  const dropoff = base ?? world.buildings(owner).find((b) => b.stats.acceptsDeliveries && isCompleted(b));
  if (dropoff === undefined) return result(null);
  const workers = world.units(owner).filter((w) => w.type === 'worker' && isAlive(w));
  const fields = grid.resourceFields.filter((f) => !resourceFieldState.isDepleted(f.id)).slice().sort((a, b) => {
    const anchor = grid.worldToTile(dropoff.position);
    const distance = (tile: TileCoord) => Math.hypot(tile.tx - anchor.tx, tile.ty - anchor.ty);
    return distance(a.center) - distance(b.center) || a.id.localeCompare(b.id);
  });
  const validGatherer = workers.find((w) => w.order?.kind === 'Gather' &&
    fields.some((f) => f.id === (w.order?.kind === 'Gather' ? w.order.fieldId : null) && canGatherField(world, grid, owner, w.position, f)));
  if (validGatherer === undefined) {
    const available = [...workers.filter((w) => w.order === null), ...workers.filter((w) => w.order?.kind === 'Gather' && w.carriedCredits === 0)];
    for (const worker of available) {
      const field = fields.find((f) => canGatherField(world, grid, owner, worker.position, f));
      if (field !== undefined) return result({ kind: 'gather', workerId: worker.id, fieldId: field.id });
    }
  }
  const buildingType = ai.state === 'recover'
    ? config.recoveryBuildOrder.find((type) => !world.buildings(owner).some((b) => b.type === type && isCompleted(b)))
    : config.buildOrder[index];
  if (buildingType === undefined || world.buildings(owner).some((b) => isAlive(b) && b.status === 'constructing') ||
    workers.some((w) => w.order?.kind === 'Build') || !economy.canAfford(owner, BUILDING_CONFIG[buildingType].cost) ||
    !checkPrerequisites(world, owner, buildingType).allowed) return result(null);
  // The opening has one Worker: alternate paid construction with gathering, retaining carried loads.
  const builder = workers.find((w) => w.order === null && w.carriedCredits === 0) ??
    workers.find((w) => w.order?.kind === 'Gather' && w.carriedCredits === 0);
  if (builder === undefined) return result(null);
  const field = fields.find((f) => canGatherField(world, grid, owner, builder.position, f));
  const placement = planAiPlacement(world, grid, owner, builder.faction, buildingType, dropoff.topLeft, config.placementRadiusTiles, field);
  return result(placement.kind === 'no-placement' ? null : { kind: 'construct', workerId: builder.id, buildingType, topLeft: placement.topLeft });
}

/** All gameplay mutation goes through public player APIs; stale intents are revalidated. */
// eslint-disable-next-line complexity -- Intent execution dispatches the closed set of economy commands.
export function executeAiEconomyIntent(context: AiEconomyContext, intent: AiEconomyIntent, owner: PlayerId = 'ai'): boolean {
  const { world, grid, economy, resourceFieldState } = context;
  const worker = world.unit(intent.workerId);
  if (worker === undefined || worker.owner !== owner || !isAlive(worker) || worker.order?.kind === 'Build') return false;
  if (intent.kind === 'gather') {
    const field = grid.resourceFields.find((f) => f.id === intent.fieldId);
    if (field === undefined || resourceFieldState.isDepleted(field.id) || !canGatherField(world, grid, owner, worker.position, field)) return false;
    return issueGatherOrder(world, grid, economy, owner, worker.id, field.id);
  }
  if (world.buildings(owner).some((b) => isAlive(b) && b.status === 'constructing')) return false;
  return startConstruction(world, grid, economy, owner, worker.faction, intent.buildingType, intent.topLeft, worker.id) !== null;
}

/** Consume strategic decision ticks without adding a second timer or renderer rules. */
export function executeAiEconomyDecisions(ai: AiState, step: AiStepResult, context: AiEconomyContext, readout?: { latestAction: string }): void {
  for (let tick = 0; tick < step.evaluations; tick++) {
    const plan = planAiEconomy({ ...ai, state: step.intents[tick]?.state ?? ai.state }, context);
    ai.buildOrderIndex = plan.buildOrderIndex;
    if (plan.intent !== null && executeAiEconomyIntent(context, plan.intent) && ai.state === 'recover' && readout) {
      readout.latestAction = plan.intent.kind === 'construct' ? 'rebuild ' + plan.intent.buildingType : 'gather';
    }
  }
}
