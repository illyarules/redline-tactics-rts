import { ENTRENCHMENT_CONFIG } from '../config/entrenchment';
import { UNIT_CONFIG } from '../config/units';
import type { ArmorCategory } from '../config/types';
import { isAlive, type ReadonlyEntity, type ReadonlyUnit } from './entities';
import type { EntityId, PlayerId } from './ids';
import type { World } from './world';

export function startEntrenchment(world: World, player: PlayerId, selectedIds: readonly EntityId[]): readonly EntityId[] {
  const accepted: EntityId[] = [];
  for (const id of new Set(selectedIds)) {
    const unit = world.unit(id);
    if (unit === undefined || unit.owner !== player || unit.type !== 'fpvOperators' || !isAlive(unit)) continue;
    if (unit.entrenchment === 'entrenched') continue;
    world.setOrder(id, null);
    world.setEntrenchment(id, 'entrenching', 0);
    world.setStatus(id, 'entrenching');
    accepted.push(id);
  }
  return accepted;
}

export function clearEntrenchment(world: World, unitId: EntityId): void {
  const unit = world.unit(unitId);
  if (unit?.type !== 'fpvOperators' || unit.entrenchment === 'mobile') return;
  world.setEntrenchment(unitId, 'mobile', 0);
}

export function stepEntrenchment(world: World, deltaSeconds: number): readonly EntityId[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return [];
  const completed: EntityId[] = [];
  for (const unit of world.units()) {
    if (!isAlive(unit) || unit.type !== 'fpvOperators' || unit.entrenchment !== 'entrenching') continue;
    const elapsed = Math.min(ENTRENCHMENT_CONFIG.durationSeconds, unit.entrenchElapsedSeconds + deltaSeconds);
    if (elapsed >= ENTRENCHMENT_CONFIG.durationSeconds) {
      world.setEntrenchment(unit.id, 'entrenched', elapsed);
      world.setStatus(unit.id, 'entrenched');
      completed.push(unit.id);
    } else {
      world.setEntrenchment(unit.id, 'entrenching', elapsed);
    }
  }
  return completed;
}

export function canUnitAttack(unit: ReadonlyUnit): boolean {
  return unit.stats.attack !== null && (unit.type !== 'fpvOperators' || unit.entrenchment === 'entrenched');
}

export function effectiveArmor(entity: ReadonlyEntity): ArmorCategory {
  if (entity.kind === 'unit' && entity.type === 'fpvOperators' && entity.entrenchment === 'entrenched') {
    return UNIT_CONFIG.tank.armor;
  }
  return entity.stats.armor;
}
