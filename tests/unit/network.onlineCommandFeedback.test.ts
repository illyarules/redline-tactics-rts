import { describe, expect, it } from 'vitest';
import type { ReadonlyUnit } from '../../src/core/entities';
import { resolveUnitStats } from '../../src/core/factionStats';
import type { EntityId } from '../../src/core/ids';
import { OnlineCommandFeedback, withOnlineCommandMarkers } from '../../src/network/onlineCommandFeedback';

const unitId = 'unit-1' as EntityId;
const unit: ReadonlyUnit = {
  id: unitId, owner: 'player', faction: 'meridian', kind: 'unit', type: 'infantry',
  position: { x: 10, y: 10 }, health: 90, order: null, status: 'idle',
  stats: resolveUnitStats('infantry', 'meridian'), facingRadians: 0,
  attackCooldownRemainingSeconds: 0, carriedCredits: 0, entrenchment: 'mobile', entrenchElapsedSeconds: 0,
};

describe('OnlineCommandFeedback', () => {
  it('moves a command through pending and confirmed exactly once', () => {
    const feedback = new OnlineCommandFeedback();
    feedback.submit(1, { type: 'Move', unitIds: [unitId], destination: { x: 50, y: 60 } });
    expect(feedback.feedback()).toEqual({ state: 'pending', message: 'Move pending…' });
    expect(feedback.markerOrders().get(unitId)).toMatchObject({ kind: 'Move', target: { x: 50, y: 60 } });
    expect(feedback.acknowledge(1, true, 12)).toBe(true);
    expect(feedback.acknowledge(1, true, 12)).toBe(false);
    expect(feedback.feedback()?.state).toBe('confirmed');
    feedback.applySnapshot(11);
    expect(feedback.markerOrders().has(unitId)).toBe(true);
    feedback.applySnapshot(12);
    expect(feedback.feedback()?.state).toBe('confirmed');
    expect(feedback.markerOrders().has(unitId)).toBe(false);
  });

  it('rejects pending feedback, ignores stale acknowledgements and clears on reconnect', () => {
    const feedback = new OnlineCommandFeedback();
    feedback.submit(4, { type: 'Attack', unitIds: [unitId], targetId: 'hidden' as EntityId });
    expect(feedback.reject(4, 'invalid-action')).toBe(true);
    expect(feedback.feedback()).toEqual({ state: 'rejected', message: 'Attack rejected: action is unavailable' });
    expect(feedback.markerOrders().size).toBe(0);
    expect(feedback.acknowledge(3, true, 8)).toBe(false);
    feedback.clear();
    expect(feedback.feedback()).toBeNull();
  });

  it('adds marker-only orders without mutating authoritative entities', () => {
    const feedback = new OnlineCommandFeedback();
    feedback.submit(1, { type: 'AttackMove', unitIds: [unitId], destination: { x: 90, y: 90 } });
    const state = { entities: [unit], selectedIds: [unitId], fieldFractions: new Map(), isVisible: () => true, positionOfVisibleTarget: () => null };
    const marked = withOnlineCommandMarkers(state, feedback.markerOrders());
    expect(marked.entities[0]?.order).toMatchObject({ kind: 'AttackMove', target: { x: 90, y: 90 } });
    expect(unit.order).toBeNull();
  });
});
