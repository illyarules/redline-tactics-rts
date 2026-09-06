import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { createEconomy } from '../src/core/economy';
import { createFogState } from '../src/core/fog';
import { createMapGrid } from '../src/core/map';
import { issueMoveOrders, stepMovement } from '../src/core/movement';
import { attackMoveOrder, attackOrder } from '../src/core/orders';
import { createResourceFieldState } from '../src/core/resourceFieldState';
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
  const economy = createEconomy();
  const resourceFieldState = createResourceFieldState(grid);
  const fog = createFogState(grid);
  return { grid, world, economy, resourceFieldState, fog };
}

describe('serializeWorld / restoreWorld round trip (AC-001)', () => {
  it('round-trips every persisted field exactly', () => {
    const { grid, world, economy, resourceFieldState, fog } = setup();
    economy.spend('player', 250);
    economy.earn('ai', 40);
    const field = grid.resourceFields[0]!;
    resourceFieldState.take(field.id, 300);

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
    world.setAttackCooldown(moving.id, 0.35);
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
    world.setCarriedCredits(idle.id, 25);

    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 30, ty: 30 },
    });
    world.setProductionQueue(hq.id, [{ unitType: 'worker', elapsedSeconds: 3, paidCost: 165 }]);
    world.createBuilding({
      type: 'barracks',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 35, ty: 30 },
      status: 'constructing',
      constructionProgress: 0.4,
    });

    const selection = [moving.id, hq.id];
    const snapshot = serializeWorld(world, selection, economy, resourceFieldState, fog, grid);
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.entities).toHaveLength(4);
    expect(snapshot.credits).toEqual({ player: 650, ai: 940 });
    expect(snapshot.resourceFields.find((entry) => entry.id === field.id)?.remainingCredits).toBe(
      field.credits - 300,
    );

    const {
      world: restoredWorld,
      selection: restoredSelection,
      economy: restoredEconomy,
      resourceFieldState: restoredFieldState,
      fog: restoredFog,
    } = restoreWorld(snapshot, grid);

    expect(restoredWorld.size()).toBe(4);
    expect(restoredEconomy.balance('player')).toBe(650);
    expect(restoredEconomy.balance('ai')).toBe(940);
    expect(restoredFieldState.remaining(field.id)).toBe(field.credits - 300);
    expect(restoredFog).toBeDefined();
    const restoredSite = restoredWorld.buildings().find((building) => building.type === 'barracks');
    expect(restoredSite?.status).toBe('constructing');
    expect(restoredSite?.constructionProgress).toBeCloseTo(0.4);
    expect(restoredSite?.productionQueue).toEqual([]);
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
    expect(restoredMoving.attackCooldownRemainingSeconds).toBeCloseTo(0.35);
    expect(restoredMoving.order).toEqual(moving.order);

    expect(restoredIdle.position).toEqual(idle.position);
    expect(restoredIdle.health).toBe(idle.health);
    expect(restoredIdle.status).toBe('gathering');
    expect(restoredIdle.carriedCredits).toBe(25);

    expect(restoredHq.position).toEqual(hq.position);
    expect(restoredHq.health).toBe(hq.health);
    expect(restoredHq.status).toBe(hq.status);
    expect(restoredHq.topLeft).toEqual(hq.topLeft);
    expect(restoredHq.productionQueue).toEqual([{ unitType: 'worker', elapsedSeconds: 3, paidCost: 165 }]);

    // Restored ids are freshly assigned, so the selection must have followed the same remap.
    expect(restoredSelection).toEqual([restoredMoving.id, restoredHq.id]);
  });
});

describe('automatic and Attack-Move order persistence', () => {
  it('round-trips acquired source and an Attack-Move route with its temporary engagement', () => {
    const { grid, world, economy, resourceFieldState, fog } = setup();
    const acquired = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const moving = world.createUnit({
      type: 'rocket', owner: 'player', faction: 'meridian', position: grid.tileCenter(11, 10),
    });
    const target = world.createUnit({
      type: 'tank', owner: 'ai', faction: 'ember', position: grid.tileCenter(14, 10),
    });
    world.setOrder(acquired.id, attackOrder(target.id, null, 'acquired'));
    const route = {
      resolvedTarget: grid.tileCenter(20, 10),
      waypoints: [grid.tileCenter(12, 10), grid.tileCenter(20, 10)],
      waypointIndex: 1,
    };
    world.setOrder(moving.id, attackMoveOrder(grid.tileCenter(20, 10), route, attackOrder(target.id, null, 'attackMove')));

    const { world: restored } = restoreWorld(
      serializeWorld(world, [], economy, resourceFieldState, fog, grid),
      grid,
    );
    const restoredAcquired = restored.units('player').find((unit) => unit.type === 'infantry');
    const restoredMoving = restored.units('player').find((unit) => unit.type === 'rocket');
    const restoredTarget = restored.units('ai').find((unit) => unit.type === 'tank');

    expect(restoredAcquired?.order).toEqual(expect.objectContaining({
      kind: 'Attack', source: 'acquired', targetId: restoredTarget?.id,
    }));
    expect(restoredMoving?.order).toEqual(expect.objectContaining({
      kind: 'AttackMove', route, engagement: expect.objectContaining({
        targetId: restoredTarget?.id, source: 'attackMove',
      }),
    }));
  });
});

const EMPTY_CREDITS = { player: 0, ai: 0 };
const EMPTY_FOG = {
  gridId: 'open-field',
  widthTiles: 64,
  heightTiles: 64,
  updateElapsedSeconds: 0,
  players: [],
};

describe('isValidSnapshotShape (AC-002)', () => {
  it('accepts a well-formed snapshot shell', () => {
    const snapshot: WorldSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      entities: [],
      selection: [],
      credits: EMPTY_CREDITS,
      resourceFields: [],
      fog: EMPTY_FOG,
    };
    expect(isValidSnapshotShape(snapshot)).toBe(true);
  });

  it('rejects a mismatched or missing schema version', () => {
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1,
        entities: [],
        selection: [],
        credits: EMPTY_CREDITS,
        resourceFields: [],
        fog: EMPTY_FOG,
      }),
    ).toBe(false);
    expect(isValidSnapshotShape({ entities: [], selection: [] })).toBe(false);
  });

  it('rejects entities/selection that are not arrays', () => {
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        entities: {},
        selection: [],
        credits: EMPTY_CREDITS,
        resourceFields: [],
        fog: EMPTY_FOG,
      }),
    ).toBe(false);
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        entities: [],
        selection: 'nope',
        credits: EMPTY_CREDITS,
        resourceFields: [],
      }),
    ).toBe(false);
  });

  it('rejects a missing or malformed credits/resourceFields section', () => {
    expect(
      isValidSnapshotShape({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, entities: [], selection: [] }),
    ).toBe(false);
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        entities: [],
        selection: [],
        credits: EMPTY_CREDITS,
        resourceFields: 'nope',
        fog: EMPTY_FOG,
      }),
    ).toBe(false);
  });

  it('rejects a missing or malformed fog section', () => {
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        entities: [],
        selection: [],
        credits: EMPTY_CREDITS,
        resourceFields: [],
      }),
    ).toBe(false);
    expect(
      isValidSnapshotShape({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        entities: [],
        selection: [],
        credits: EMPTY_CREDITS,
        resourceFields: [],
        fog: { gridId: 'open-field', widthTiles: 64, heightTiles: 64, updateElapsedSeconds: 0, players: [{}] },
      }),
    ).toBe(false);
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
      attackCooldownRemainingSeconds: 0,
      carriedCredits: 0,
    };
  }

  function snapshotOf(entity: WorldSnapshot['entities'][number]): WorldSnapshot {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      entities: [entity],
      selection: [],
      credits: EMPTY_CREDITS,
      resourceFields: [],
      fog: EMPTY_FOG,
    };
  }

  it('throws on an unknown unit type', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), type: 'sniper' as never }), grid),
    ).toThrow();
  });

  it('throws on an unknown owner', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), owner: 'neutral' as never }), grid),
    ).toThrow();
  });

  it('throws on an unknown faction', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), faction: 'nowhere' as never }), grid),
    ).toThrow();
  });

  it('throws on a non-finite position', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(snapshotOf({ ...validUnitSnapshot(), position: { x: Number.NaN, y: 0 } }), grid),
    ).toThrow();
  });

  it('throws on invalid starting health', () => {
    const { grid } = setup();
    expect(() => restoreWorld(snapshotOf({ ...validUnitSnapshot(), health: -5 }), grid)).toThrow();
  });

  it('throws when a building snapshot omits its production queue', () => {
    const { grid } = setup();
    expect(() =>
      restoreWorld(
        snapshotOf({
          ...validUnitSnapshot(),
          kind: 'building',
          type: 'hq',
          topLeft: { tx: 0, ty: 0 },
          constructionProgress: 1,
        } as never),
        grid,
      ),
    ).toThrow();
  });

  it('throws when a unit snapshot omits its attack cooldown', () => {
    const { grid } = setup();
    const unit = validUnitSnapshot() as unknown as Record<string, unknown>;
    delete unit.attackCooldownRemainingSeconds;
    expect(() => restoreWorld(snapshotOf(unit as never), grid)).toThrow();
  });
});

describe('id remapping correctness (AC-005)', () => {
  it('remaps order targets and selection through freshly assigned ids, not stale ones', () => {
    const { grid, world, economy, resourceFieldState, fog } = setup();

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
    const pursuitRoute = {
      resolvedTarget: grid.tileCenter(3, 3),
      waypoints: [grid.tileCenter(3, 3)],
      waypointIndex: 0,
    };
    world.setOrder(attacker.id, attackOrder(target.id, pursuitRoute));

    const snapshot = serializeWorld(
      world,
      [gapFiller.id, attacker.id, target.id],
      economy,
      resourceFieldState,
      fog,
      grid,
    );
    expect(snapshot.entities).toHaveLength(2);

    const { world: restoredWorld, selection } = restoreWorld(snapshot, grid);

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
    expect(restoredAttacker.order).toEqual(attackOrder(restoredTarget.id, pursuitRoute));

    // The stale, already-gone gapFiller id must be dropped from the restored selection, and the
    // surviving ids must be the new ones.
    expect(selection).toEqual([restoredAttacker.id, restoredTarget.id]);
  });

  it('restores an order referencing an entity that was not persisted as null, not a throw', () => {
    const { grid, world, economy, resourceFieldState, fog } = setup();
    const attacker = world.createUnit({
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: grid.tileCenter(2, 2),
    });
    // References an id that never existed in this world at all.
    world.setOrder(attacker.id, attackOrder('does-not-exist'));

    const snapshot = serializeWorld(world, [], economy, resourceFieldState, fog, grid);
    const { world: restoredWorld } = restoreWorld(snapshot, grid);
    const restoredAttacker = restoredWorld.units()[0];
    expect(restoredAttacker).toBeDefined();
    expect(restoredAttacker?.order).toBeNull();
  });
});
