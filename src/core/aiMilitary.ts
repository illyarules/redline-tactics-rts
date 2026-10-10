/** Pure military plans and a narrow executor using the same queues/orders as player commands. */
import { AI_CONFIG } from '../config/ai';
import { BUILDING_CONFIG } from '../config/buildings';
import type { AiConfig } from '../config/types';
import type { AiState, AiStepResult } from './ai';
import { issueAttackMoveOrders } from './attackMove';
import type { Economy } from './economy';
import { isAlive, type ReadonlyBuilding, type ReadonlyUnit } from './entities';
import { startEntrenchment } from './entrenchment';
import { resolveUnitStats } from './factionStats';
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
  | { readonly kind: 'scout' | 'attack' | 'lastStand'; readonly unitIds: readonly EntityId[]; readonly target: Vec2 };

/** Debug-only history is transient, never a second copy of orders or queues. */
export interface AiMilitaryReadout { latestAction: string }
export const aiArmy = (world: World, owner: PlayerId = 'ai') =>
  world.units(owner).filter((u) => isAlive(u) && u.stats.attack !== null);

interface CombatProductionChoice {
  readonly unitType: UnitTypeId;
  readonly nextCycleIndex: number;
  readonly cost: number;
}

interface CombatProductionSelection {
  readonly ai: Pick<AiState, 'productionCycleIndex'>;
  readonly world: World;
  readonly producer: ReadonlyBuilding;
  readonly economy: Economy;
  readonly owner: PlayerId;
  readonly spendableCredits: number;
  readonly config: AiConfig;
}

function queuedCombatUnits(world: World, owner: PlayerId): number {
  return world.buildings(owner).reduce((total, building) => total + building.productionQueue
    .filter((item) => resolveUnitStats(item.unitType, building.faction).attack !== null).length, 0);
}

function hasQueuedWorker(world: World, owner: PlayerId): boolean {
  return world.buildings(owner).some((building) => isAlive(building) &&
    building.productionQueue.some((item) => item.unitType === 'worker'));
}

function completedHq(world: World, owner: PlayerId): ReadonlyBuilding | undefined {
  return world.buildings(owner).find((building) =>
    building.type === 'hq' && isAlive(building) && isCompleted(building));
}

function unitsNeedingAttackMove(
  units: readonly ReadonlyUnit[],
  target: Vec2,
  grid: MapGrid,
  config: AiConfig,
  preserveExplicitAttacks = true,
): readonly EntityId[] {
  return units.filter((unit) =>
    !(unit.order?.kind === 'AttackMove' && unit.order.target.x === target.x && unit.order.target.y === target.y) &&
    (!preserveExplicitAttacks || unit.order?.kind !== 'Attack') &&
    !(unit.order === null && Math.hypot(unit.position.x - target.x, unit.position.y - target.y) <=
      config.commandArrivalRadiusTiles * grid.tileSizePixels)).map((unit) => unit.id);
}

function shouldLaunchLastStand(context: AiMilitaryContext, owner: PlayerId): boolean {
  const { world, economy } = context;
  if (aiArmy(world, owner).length === 0) return false;
  const hq = completedHq(world, owner);
  if (hq === undefined) return true;
  if (world.units(owner).some((unit) => isAlive(unit) && unit.type === 'worker') || hasQueuedWorker(world, owner)) {
    return false;
  }
  return !checkProductionRequest(world, economy, owner, hq.id, 'worker').allowed;
}

function infantryForceSize(world: World, owner: PlayerId): number {
  const living = world.units(owner).filter((unit) => isAlive(unit) && unit.type === 'infantry').length;
  const queued = world.buildings(owner).reduce((total, building) => total +
    building.productionQueue.filter((item) => item.unitType === 'infantry').length, 0);
  return living + queued;
}

function infantryProductionLimit(ai: AiState, world: World, owner: PlayerId, config: AiConfig): number {
  if (ai.state === 'defend') return Number.POSITIVE_INFINITY;
  const factoryOperational = world.buildings(owner).some((building) =>
    building.type === 'factory' && isCompleted(building) &&
    isProductionActive(world, owner, building.stats.requiresPower));
  return factoryOperational ? 2 : config.minimumAttackArmyUnits;
}

/** Construction sites are already paid; reserve only the next build-order structure not yet started. */
function nextBuildingReserve(world: World, owner: PlayerId, config: AiConfig): number {
  const next = config.buildOrder.find((type) =>
    !world.buildings(owner).some((building) => building.type === type && isAlive(building)));
  return next === undefined ? 0 : BUILDING_CONFIG[next].cost;
}

function chooseCombatUnit(selection: CombatProductionSelection): CombatProductionChoice | null {
  const { ai, world, producer, economy, owner, spendableCredits, config } = selection;
  const supported = config.productionCycle.filter((unitType) =>
    producer.stats.produces.includes(unitType) && resolveUnitStats(unitType, producer.faction).attack !== null);
  const eligibleSupported = supported.filter((unitType) => resolveUnitStats(unitType, producer.faction).requires.every(
    (type) => world.buildings(owner).some((building) =>
      building.type === type && isAlive(building) && isCompleted(building)),
  ));
  if (supported.length === 0) return null;
  for (let offset = 0; offset < config.productionCycle.length; offset++) {
    const index = (ai.productionCycleIndex + offset) % config.productionCycle.length;
    const unitType = config.productionCycle[index]!;
    if (!supported.includes(unitType)) continue;
    const cost = resolveUnitStats(unitType, producer.faction).cost;
    if (cost > spendableCredits || !checkProductionRequest(world, economy, owner, producer.id, unitType).allowed) continue;
    return {
      unitType,
      cost,
      // A producer with one currently eligible option must not disturb variety at other producers.
      nextCycleIndex: eligibleSupported.length === 1 ? ai.productionCycleIndex : (index + 1) % config.productionCycle.length,
    };
  }
  return null;
}

// eslint-disable-next-line complexity -- Execution revalidates worker priority, army caps, budget and composition together.
function combatProductionChoiceFor(
  ai: AiState,
  context: AiMilitaryContext,
  producerId: EntityId,
  config: AiConfig,
  owner: PlayerId,
): CombatProductionChoice | null {
  const { world, economy } = context;
  const hasWorker = world.units(owner).some((unit) => isAlive(unit) && unit.type === 'worker');
  const workerQueued = hasQueuedWorker(world, owner);
  if (!hasWorker && !workerQueued) return null;
  if (aiArmy(world, owner).length + queuedCombatUnits(world, owner) >= config.targetArmyUnits) return null;
  const producer = world.building(producerId);
  if (producer === undefined || producer.owner !== owner || !isCompleted(producer) ||
    !isProductionActive(world, owner, producer.stats.requiresPower)) return null;
  const reserve = ai.state === 'defend' ? 0 : nextBuildingReserve(world, owner, config);
  const choice = chooseCombatUnit({ ai, world, producer, economy, owner, spendableCredits: economy.balance(owner) - reserve, config });
  if (choice?.unitType === 'infantry' && infantryForceSize(world, owner) >= infantryProductionLimit(ai, world, owner, config)) {
    return null;
  }
  return choice;
}

// eslint-disable-next-line complexity -- Production planning combines worker priority, budget reserve and producer eligibility.
function planCombatProduction(
  ai: AiState,
  context: AiMilitaryContext,
  config: AiConfig,
  owner: PlayerId,
): readonly AiMilitaryIntent[] {
  const { world, economy } = context;
  const workers = world.units(owner).filter((unit) => isAlive(unit) && unit.type === 'worker');
  const workerQueued = hasQueuedWorker(world, owner);
  if (workers.length === 0 && !workerQueued) {
    const hq = world.buildings(owner).find((building) =>
      building.type === 'hq' && isCompleted(building) && checkProductionRequest(world, economy, owner, building.id, 'worker').allowed);
    return hq === undefined ? [] : [{ kind: 'produce', producerId: hq.id, unitType: 'worker' }];
  }
  const intents: AiMilitaryIntent[] = [];
  let remainingSlots = config.targetArmyUnits - aiArmy(world, owner).length - queuedCombatUnits(world, owner);
  let spendableCredits = economy.balance(owner) - (ai.state === 'defend' ? 0 : nextBuildingReserve(world, owner, config));
  let cycleIndex = ai.productionCycleIndex;
  let infantryCount = infantryForceSize(world, owner);
  const infantryLimit = infantryProductionLimit(ai, world, owner, config);
  for (const producer of world.buildings(owner)) {
    if (remainingSlots <= 0 || spendableCredits <= 0) break;
    if (!isCompleted(producer) || !isProductionActive(world, owner, producer.stats.requiresPower)) continue;
    const choice = chooseCombatUnit({
      ai: { productionCycleIndex: cycleIndex }, world, producer, economy, owner, spendableCredits, config,
    });
    if (choice === null) continue;
    if (choice.unitType === 'infantry' && infantryCount >= infantryLimit) continue;
    intents.push({ kind: 'produce', producerId: producer.id, unitType: choice.unitType });
    spendableCredits -= choice.cost;
    cycleIndex = choice.nextCycleIndex;
    if (choice.unitType === 'infantry') infantryCount++;
    remainingSlots--;
  }
  return intents;
}

// eslint-disable-next-line complexity -- Military planning uses ordered tactical gates before emitting an intent.
export function planAiMilitary(
  ai: AiState,
  { world, grid, economy }: AiMilitaryContext,
  config: AiConfig = AI_CONFIG,
  owner: PlayerId = 'ai',
  opponent: PlayerId = 'player',
): readonly AiMilitaryIntent[] {
  const context = { world, grid, economy };
  const army = aiArmy(world, owner); // World creation order is deterministic, including after restore.
  if (shouldLaunchLastStand(context, owner)) {
    const start = grid.startFor(opponent);
    const target = ai.lastKnownPlayerBasePosition ??
      (start === undefined ? null : grid.tileCenter(start.hqTopLeft.tx, start.hqTopLeft.ty));
    if (target === null) return [];
    const unitIds = unitsNeedingAttackMove(army, target, grid, config, false);
    return unitIds.length === 0 ? [] : [{ kind: 'lastStand', unitIds, target: { ...target } }];
  }
  if (completedHq(world, owner) === undefined) return [];
  const intents = [...planCombatProduction(ai, { world, grid, economy }, config, owner)];
  const attacking = ai.state === 'attack' && ai.lastKnownPlayerBasePosition !== null &&
    army.length >= config.minimumAttackArmyUnits;
  const start = grid.startFor(opponent);
  const target = attacking ? ai.lastKnownPlayerBasePosition :
    ai.state === 'scout' && ai.lastKnownPlayerBasePosition === null && start !== undefined
      ? grid.tileCenter(start.hqTopLeft.tx, start.hqTopLeft.ty) : null;
  if (target !== null) {
    const selected = attacking ? army : army.slice(0, 1);
    const unitIds = unitsNeedingAttackMove(selected, target, grid, config);
    if (unitIds.length > 0) intents.push({ kind: attacking ? 'attack' : 'scout', unitIds, target: { ...target } });
  }
  return intents;
}

/** Re-plan before applying so stale/forged plans cannot bypass ownership, strategy or knowledge. */
export function executeAiMilitaryIntent(ai: AiState, context: AiMilitaryContext, intent: AiMilitaryIntent, config: AiConfig = AI_CONFIG, owner: PlayerId = 'ai'): boolean {
  if (intent.kind === 'produce' && intent.unitType !== 'worker') {
    const choice = combatProductionChoiceFor(ai, context, intent.producerId, config, owner);
    if (choice === null || choice.unitType !== intent.unitType ||
      !queueProduction(context.world, context.economy, owner, intent.producerId, intent.unitType).allowed) return false;
    ai.productionCycleIndex = choice.nextCycleIndex;
    return true;
  }
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
    return queueProduction(context.world, context.economy, owner, intent.producerId, intent.unitType).allowed;
  }
  return issueAttackMoveOrders(context.world, context.grid, owner, intent.unitIds, intent.target).length > 0;
}

export function executeAiMilitaryDecisions(ai: AiState, step: AiStepResult, context: AiMilitaryContext, readout?: AiMilitaryReadout, owner: PlayerId = 'ai'): void {
  for (let tick = 0; tick < step.evaluations; tick++) {
    const decisionAi = { ...ai, state: step.intents[tick]?.state ?? ai.state };
    for (const intent of planAiMilitary(decisionAi, context, AI_CONFIG, owner)) {
      if (executeAiMilitaryIntent(decisionAi, context, intent, AI_CONFIG, owner) && readout !== undefined) {
        readout.latestAction = intent.kind === 'produce' ? 'queue ' + intent.unitType :
          intent.kind === 'lastStand' ? 'last stand ' + intent.unitIds.length : intent.kind + ' ' + intent.unitIds.length;
      }
    }
    ai.productionCycleIndex = decisionAi.productionCycleIndex;
  }
  const idleOperators = context.world.units(owner)
    .filter((unit) => unit.type === 'fpvOperators' && unit.order === null && unit.entrenchment === 'mobile')
    .map((unit) => unit.id);
  startEntrenchment(context.world, owner, idleOperators);
}
