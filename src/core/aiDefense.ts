/** Bounded defense plans; world orders are the sole durable command memory. */
import { AI_CONFIG } from '../config/ai';
import type { AiConfig } from '../config/types';
import type { AiState, AiStepResult } from './ai';
import { issueAttackOrders, stopAttacking } from './attack';
import { issueAttackMoveOrders } from './attackMove';
import { isAlive } from './entities';
import { fogTargetPredicate, isEntityVisibleToPlayer, type FogState } from './fog';
import type { Vec2 } from './geometry';
import type { EntityId } from './ids';
import type { MapGrid } from './map';
import { isCompleted } from './prerequisites';
import type { World } from './world';

export interface AiDefenseContext { readonly world: World; readonly grid: MapGrid; readonly fog: FogState }
export type AiDefenseIntent =
  | { readonly kind: 'release'; readonly unitId: EntityId }
  | { readonly kind: 'defend'; readonly unitId: EntityId; readonly targetId: EntityId }
  | { readonly kind: 'rally'; readonly unitId: EntityId; readonly target: Vec2 };

export function observeAiDefense({ world, grid, fog }: AiDefenseContext, config: AiConfig = AI_CONFIG) {
  const base = world.buildings('ai').find((b) => b.type === 'hq' && isCompleted(b));
  const distance = (p: Vec2) => base === undefined ? Infinity : Math.hypot(p.x - base.position.x, p.y - base.position.y);
  const nearest = (a: { position: Vec2; id: string }, b: { position: Vec2; id: string }) =>
    distance(a.position) - distance(b.position) || a.id.localeCompare(b.id);
  const threats = base === undefined ? [] : world.units('player').filter((u) =>
    isAlive(u) && u.stats.attack !== null && isEntityVisibleToPlayer(fog, 'ai', u) &&
    distance(u.position) <= config.baseThreatRadiusTiles * grid.tileSizePixels).slice().sort(nearest);
  const defenders = base === undefined ? [] : world.units('ai').filter((u) =>
    isAlive(u) && u.type !== 'worker' && u.stats.attack !== null &&
    distance(u.position) <= config.defenderSelectionRadiusTiles * grid.tileSizePixels)
    .slice().sort(nearest).slice(0, config.maximumDefenders);
  return { base, threats, defenders };
}

// eslint-disable-next-line complexity -- Defense planning prioritizes mutually exclusive recovery conditions.
export function planAiDefense(ai: AiState, context: AiDefenseContext, config: AiConfig = AI_CONFIG): readonly AiDefenseIntent[] {
  const { base, threats, defenders } = observeAiDefense(context, config);
  const active = ai.state === 'defend' && base !== undefined;
  // AI offense uses Attack-Move; explicit AI attacks belong to defense. Release old assignments
  // when selection changes or strategy exits, so consecutive ticks cannot accumulate defenders.
  const intents: AiDefenseIntent[] = context.world.units('ai').filter((u) => isAlive(u) &&
    u.order?.kind === 'Attack' && u.order.source === 'explicit' &&
    (!active || !defenders.some((d) => d.id === u.id))).map((u) => ({ kind: 'release', unitId: u.id }));
  if (!active || base === undefined) return intents;
  for (const unit of defenders) {
    const target = threats.find((t) => unit.stats.attack?.targetCategories.includes('unit') && isAlive(t));
    if (target !== undefined) {
      if (unit.order?.kind !== 'Attack' || unit.order.targetId !== target.id) {
        intents.push({ kind: 'defend', unitId: unit.id, targetId: target.id });
      }
    } else if (Math.hypot(unit.position.x - base.position.x, unit.position.y - base.position.y) >
      config.commandArrivalRadiusTiles * context.grid.tileSizePixels &&
      !(unit.order?.kind === 'AttackMove' && unit.order.target.x === base.position.x && unit.order.target.y === base.position.y)) {
      // Normal route resolution chooses a reachable tile beside the occupied HQ footprint.
      intents.push({ kind: 'rally', unitId: unit.id, target: { ...base.position } });
    }
  }
  return intents;
}

export function executeAiDefenseIntent(ai: AiState, context: AiDefenseContext, intent: AiDefenseIntent, config: AiConfig = AI_CONFIG): boolean {
  const valid = planAiDefense(ai, context, config).some((p) => p.unitId === intent.unitId &&
    (p.kind === 'release' && intent.kind === 'release' ? true : p.kind === 'defend' && intent.kind === 'defend' ? p.targetId === intent.targetId :
      p.kind === 'rally' && intent.kind === 'rally' && p.target.x === intent.target.x && p.target.y === intent.target.y));
  if (!valid) return false;
  if (intent.kind === 'release') { stopAttacking(context.world, intent.unitId); return true; }
  return intent.kind === 'defend'
    ? issueAttackOrders(context.world, 'ai', [intent.unitId], intent.targetId, fogTargetPredicate(context.fog)).length > 0
    : issueAttackMoveOrders(context.world, context.grid, 'ai', [intent.unitId], intent.target).length > 0;
}

export function executeAiDefenseDecisions(ai: AiState, step: AiStepResult, context: AiDefenseContext, readout?: { latestAction: string }): void {
  for (const decision of step.intents) {
    const state = { ...ai, state: decision.state };
    for (const intent of planAiDefense(state, context)) {
      if (executeAiDefenseIntent(state, context, intent) && readout) readout.latestAction = intent.kind + ' ' + intent.unitId;
    }
  }
}
