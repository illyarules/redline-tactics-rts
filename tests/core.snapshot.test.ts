import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { createMapGrid } from '../src/core/map';
import { issueMoveOrders, stepMovement } from '../src/core/movement';
import { attackOrder } from '../src/core/orders';
import {
  isValidSnapshotShape,
  restoreWorld,
  serializeWorld,
  SNAPSHOT_SCHEMA_VERSION,
  type WorldSnapshot,
} from '../src/core/snapshot';
import { createWorld } from '../src/core/world';

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  return { grid, world };
}

describe('serializeWorld / restoreWorld round trip (AC-001)', () => {
  it('round-trips every persisted field exactly', () => {
    const { grid, world } = setup();

    const moving = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(10, 10),
    });
    issueMoveOrders(world, grid, 'player', [moving.id], grid.tileCenter(14, 10));
    // Advance partway so the route is mid-flight: a non-zero waypointIndex and a turned heading.
    const secondsPerTile = 1 / moving.stats.speedTilesPerSecond;
    stepMovement(world, secondsPerTile);
    expect(moving.order?.kind).toBe('Move');
    if (moving.order?.kind !== 'Move') return;
    expect(moving.order.route.waypointIndex).toBeGreaterThan(0);
    expect(moving.facingRadians).not.toBe(0);

    const idle = world.createUnit({
      type: 'worker',
      owner: 'ai',
      faction: 'ember',
      position: grid.tileCenter(20, 20),
      health: 12,
    });
    world.setStatus(idle.id, 'gathering');

    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 30, ty: 30 },
    });

    const selection = [moving.id, hq.id];
    const snapshot = serializeWorld(world, selection);
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.entities).toHaveLength(3);

    const { world: restoredWorld, selection: restoredSelection } = restoreWorld(
      snapshot,
      grid.tileSizePixels,
    );

    expect(restoredWorld.size()).toBe(3);
    const restoredMoving = restoredWorld
      .units()
      .find((unit) => unit.type === 'infantry' && unit.owner === 'player');
    const restoredIdle = restoredWorld
      .units()
      .find((unit) => unit.type === 'worker' && unit.owner === 'ai');
    const restoredHq = restoredWorld.buildings()[0];
    expect(restoredMoving).toBeDefined();
    expect(restoredIdle).toBeDefined();
    expect(restoredHq).toBeDefined();
    if (restoredMoving === undefined || restoredIdle === undefined || restoredHq === undefined) return;

    expect(restoredMoving.position).toEqual(moving.position);
    expect(restoredMoving.health).toBe(moving.health);
    expect(restoredMoving.status).toBe(moving.status);
    expect(restoredMoving.facingRadians).toBeCloseTo(moving.facingRadians);
    expect(restoredMoving.order).toEqual(moving.order);

    expect(restoredIdle.position).toEqual(idle.position);
    expect(restoredIdle.health).toBe(idle.health);
    expect(restoredIdle.status).toBe('gathering');

    expect(restoredHq.position).toEqual(hq.position);
    expect(restoredHq.health).toBe(hq.health);
    expect(restoredHq.status).toBe(hq.status);
    expect(restoredHq.topLeft).toEqual(hq.topLeft);

    // Restored ids are freshly assigned, so the selection must have followed the same remap.
    expect(restoredSelection).toEqual([restoredMoving.id, restoredHq.id]);
  });
});

describe('isValidSnapshotShape (AC-002)', () => {
  it('accepts a well-formed snapshot shell', () => {
    const snapshot: WorldSnapshot = { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities: [], selection: [] };
    expect(isValidSnapshotShape(snapshot)).toBe(true);
  });

  it('rejects a mismatched or missing schema version', () => {
    expect(isValidSnapshotShape({ schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1, entities: [], selection: [] })).toBe(false);
    expect(isValidSnapshotShape({ entities: [], selection: [] })).toBe(false);
  });

  it('rejects entities/selection that are not arrays', () => {
    expect(isValidSnapshotShape({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities: {}, selection: [] })).toBe(false);
    expect(isValidSnapshotShape({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities: [], selection: 'nope' })).toBe(false);
  });

  it('rejects null, primitives and other non-object input', () => {
    expect(isValidSnapshotShape(null)).toBe(false);
    expect(isValidSnapshotShape(undefined)).toBe(false);
    expect(isValidSnapshotShape(42)).toBe(false);
    expect(isValidSnapshotShape('snapshot')).toBe(false);
    expect(isValidSnapshotShape([])).toBe(false);
  });
});

describe('restoreWorld failure handling (AC-003)', () => {
  /** A valid unit snapshot entity, so each test below only has to break one field. */
  function validUnitSnapshot(): WorldSnapshot['entities'][number] {
    return {
      id: 'e1',
      kind: 'unit',
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: { x: 0, y: 0 },
      health: 1,
      status: 'idle',
      order: null,
      facingRadians: 0,
    };
  }

  function snapshotOf(entity: WorldSnapshot['entities'][number]): WorldSnapshot {
    return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities: [entity], selection: [] };
  }

  it('throws on an unknown unit type', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), type: 'sniper' as never }), grid.tileSizePixels),
    ).toThrow();
  });

  it('throws on an unknown owner', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), owner: 'neutral' as never }), grid.tileSizePixels),
    ).toThrow();
  });

  it('throws on an unknown faction', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), faction: 'nowhere' as never }), grid.tileSizePixels),
    ).toThrow();
  });

  it('throws on a non-finite position', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(
        snapshotOf({ ...validUnitSnapshot(), position: { x: Number.NaN, y: 0 } }),
        grid.tileSizePixels,
      ),
    ).toThrow();
  });

  it('throws on invalid starting health', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), health: -5 }), grid.tileSizePixels),
    ).toThrow();
  });
});

describe('id remapping correctness (AC-005)', () => {
  it('remaps order targets and selection through freshly assigned ids, not stale ones', () => {
    const { grid, world } = setup();

    const gapFiller = world.createUnit({
      type: 'worker',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(1, 1),
    });
    const attacker = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(2, 2),
    });
    const target = world.createUnit({
      type: 'tank',
      owner: 'ai',
      faction: 'ember',
      position: grid.tileCenter(3, 3),
    });

    // Removing the first-created entity opens a gap: the next fresh world's ids will not line up
    // one-to-one with these entities' current ids, so a correct remap has real work to do.
    world.remove(gapFiller.id);
    world.setOrder(attacker.id, attackOrder(target.id));

    const snapshot = serializeWorld(world, [gapFiller.id, attacker.id, target.id]);
    expect(snapshot.entities).toHaveLength(2);

    const { world: restoredWorld, selection } = restoreWorld(snapshot, grid.tileSizePixels);

    const restoredAttacker = restoredWorld
      .units()
      .find((unit) => unit.type === 'infantry');
    const restoredTarget = restoredWorld.units().find((unit) => unit.type === 'tank');
    expect(restoredAttacker).toBeDefined();
    expect(restoredTarget).toBeDefined();
    if (restoredAttacker === undefined || restoredTarget === undefined) return;

    // The restored target's id must differ from its original snapshot id...
    expect(restoredTarget.id).not.toBe(target.id);
    // ...and the restored order must follow that new id, not the stale original one.
    expect(restoredAttacker.order).toEqual(attackOrder(restoredTarget.id));

    // The stale, already-gone gapFiller id must be dropped from the restored selection, and the
    // surviving ids must be the new ones.
    expect(selection).toEqual([restoredAttacker.id, restoredTarget.id]);
  });

  it('restores an order referencing an entity that was not persisted as null, not a throw', () => {
    const { grid, world } = setup();
    const attacker = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(2, 2),
    });
    // References an id that never existed in this world at all.
    world.setOrder(attacker.id, attackOrder('does-not-exist'));

    const snapshot = serializeWorld(world, []);
    const { world: restoredWorld } = restoreWorld(snapshot, grid.tileSizePixels);
    const restoredAttacker = restoredWorld.units()[0];
    expect(restoredAttacker).toBeDefined();
    expect(restoredAttacker?.order).toBeNull();
  });
});
