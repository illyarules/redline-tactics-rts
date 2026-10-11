import { describe, expect, it } from 'vitest';
import type { CellVisibility } from '../../src/core/fog';
import { OnlineSnapshotInterpolator, type SequencedOnlineSnapshot } from '../../src/network/onlineSnapshotInterpolator';

const fog: CellVisibility[][] = [['visible']];

function snapshot(snapshotSeq: number, tick: number, x: number, enemy = true): SequencedOnlineSnapshot {
  return {
    matchId: 'match-1', snapshotSeq, tick, seat: 'player', fog, fields: [],
    entities: [
      { id: 'worker', owner: 'player', kind: 'unit', type: 'worker', x, y: 30, health: 100, maxHealth: 100, facingRadians: 0 },
      ...(enemy ? [{ id: 'enemy', owner: 'ai' as const, kind: 'unit' as const, type: 'infantry' as const, x: 90, y: 60, health: 90, maxHealth: 90 }] : []),
    ],
  };
}

describe('OnlineSnapshotInterpolator', () => {
  it.each([30, 60, 144])('smoothly samples a 10 Hz stream at %i FPS', (fps) => {
    const buffer = new OnlineSnapshotInterpolator();
    buffer.push(snapshot(1, 0, 0), 0);
    buffer.push(snapshot(2, 2, 30), 100);
    const positions: number[] = [];
    const frames = Math.ceil(fps / 10);
    for (let frame = 0; frame <= frames; frame++) {
      const sampled = buffer.sample(100 + frame * 100 / frames);
      positions.push(sampled!.entities.find((entity) => entity.id === 'worker')!.x);
    }
    expect(positions[0]).toBe(0);
    expect(positions.at(-1)).toBeCloseTo(30);
    expect(positions.every((position, index) => index === 0 || position >= positions[index - 1]!)).toBe(true);
  });

  it('removes an enemy immediately when the newest filtered snapshot hides it', () => {
    const buffer = new OnlineSnapshotInterpolator();
    buffer.push(snapshot(1, 0, 0), 0);
    buffer.push(snapshot(2, 2, 10, false), 100);
    expect(buffer.sample(100)!.entities.some((entity) => entity.id === 'enemy')).toBe(false);
  });

  it('ignores duplicate snapshots and resets without interpolating across a resync', () => {
    const buffer = new OnlineSnapshotInterpolator();
    expect(buffer.push(snapshot(2, 2, 20), 100)).toBe(true);
    expect(buffer.push(snapshot(2, 2, 999), 110)).toBe(false);
    expect(buffer.sample(150)!.entities[0]!.x).toBe(20);
    buffer.reset();
    buffer.push({ ...snapshot(1, 20, 200), matchId: 'match-2' }, 500);
    expect(buffer.sample(500)!.entities[0]!.x).toBe(200);
  });
});
