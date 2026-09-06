import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { MOVEMENT_CONFIG } from '../../src/config/movement';
import { FORMATION_CONFIG } from '../../src/config/formation';
import type { TerrainRegionConfig } from '../../src/config/types';
import type { ReadonlyUnit } from '../../src/core/entities';
import { formationSlotPositions, issueGroupMoveOrders } from '../../src/core/formation';
import { createMapGrid, type MapGrid } from '../../src/core/map';
import { isUnderBuilding } from '../../src/core/matchSetup';
import { issueMoveOrders, stepMovement } from '../../src/core/movement';
import type { MoveRoute } from '../../src/core/orders';
import { findPath } from '../../src/core/pathfinding';
import { stepSeparation } from '../../src/core/separation';
import { createWorld, type World } from '../../src/core/world';
import type { TileCoord } from '../../src/core/geometry';

/** The unit's current route, or a test-failing error if it isn't following a Move order. */
function routeOf(unit: ReadonlyUnit): MoveRoute {
  if (unit.order?.kind !== 'Move') {
    throw new Error(`expected a Move order, got ${JSON.stringify(unit.order)}`);
  }
  return unit.order.route;
}

function setup(regions: readonly TerrainRegionConfig[] = []): { grid: MapGrid; world: World } {
  const grid = createMapGrid({ ...MAP_CONFIG, regions });
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  return { grid, world };
}

function addUnit(world: World, grid: MapGrid, tile: TileCoord): ReadonlyUnit {
  return world.createUnit({
    type: 'infantry',
    owner: 'player',
    faction: 'meridian',
    position: grid.tileCenter(tile.tx, tile.ty),
  });
}

function tileKey(tile: TileCoord): string {
  return `${tile.tx},${tile.ty}`;
}

describe('formationSlotPositions', () => {
  it('centers a two-slot layout symmetrically around the origin', () => {
    const origin = { x: 500, y: 500 };
    const slots = formationSlotPositions(origin, 2, 30);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toBeDefined();
    expect(slots[1]).toBeDefined();
    expect(origin.x - (slots[0] as { x: number }).x).toBeCloseTo((slots[1] as { x: number }).x - origin.x);
    expect((slots[0] as { y: number }).y).toBeCloseTo(origin.y);
    expect((slots[1] as { y: number }).y).toBeCloseTo(origin.y);
  });

  it('returns the origin itself for a single slot', () => {
    expect(formationSlotPositions({ x: 10, y: 20 }, 1, 30)).toEqual([{ x: 10, y: 20 }]);
  });

  it('returns no slots for a non-positive count', () => {
    expect(formationSlotPositions({ x: 0, y: 0 }, 0, 30)).toEqual([]);
  });

  it('produces a distinct position for every slot in a larger group', () => {
    const slots = formationSlotPositions({ x: 0, y: 0 }, 9, 30);
    const keys = new Set(slots.map((slot) => `${slot.x},${slot.y}`));
    expect(keys.size).toBe(9);
  });

  it('is deterministic', () => {
    const first = formationSlotPositions({ x: 100, y: 200 }, 7, 25);
    const second = formationSlotPositions({ x: 100, y: 200 }, 7, 25);
    expect(second).toEqual(first);
  });
});

describe('issueGroupMoveOrders', () => {
  it('reduces to issueMoveOrders for a single selected unit (AC-001)', () => {
    const a = setup();
    const b = setup();
    const unitA = addUnit(a.world, a.grid, { tx: 10, ty: 10 });
    const unitB = addUnit(b.world, b.grid, { tx: 10, ty: 10 });
    const target = a.grid.tileCenter(14, 10);

    const acceptedA = issueGroupMoveOrders(a.world, a.grid, 'player', [unitA.id], target);
    const acceptedB = issueMoveOrders(b.world, b.grid, 'player', [unitB.id], target);

    expect(acceptedA).toEqual(acceptedB);
    expect(unitA.order).toEqual(unitB.order);
    expect(unitA.status).toBe(unitB.status);
  });

  it('reduces to issueMoveOrders for an empty selection', () => {
    const { world, grid } = setup();
    expect(issueGroupMoveOrders(world, grid, 'player', [], { x: 100, y: 100 })).toEqual([]);
  });

  it('deduplicates repeated ids the same way issueMoveOrders does', () => {
    const { world, grid } = setup();
    const unitA = addUnit(world, grid, { tx: 10, ty: 10 });
    const unitB = addUnit(world, grid, { tx: 11, ty: 10 });
    const target = grid.tileCenter(30, 30);

    const accepted = issueGroupMoveOrders(world, grid, 'player', [unitA.id, unitA.id, unitB.id], target);
    expect([...accepted].sort()).toEqual([unitA.id, unitB.id].sort());
  });

  it('gives each accepted unit in a group a distinct destination tile (AC-002)', () => {
    const { world, grid } = setup();
    const units = [
      addUnit(world, grid, { tx: 10, ty: 10 }),
      addUnit(world, grid, { tx: 11, ty: 10 }),
      addUnit(world, grid, { tx: 10, ty: 11 }),
    ];
    const target = grid.tileCenter(30, 30);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted).toHaveLength(3);

    const tiles = accepted.map((id) => grid.worldToTile(routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget));
    expect(new Set(tiles.map(tileKey)).size).toBe(3);
  });

  it('centers a two-unit group symmetrically around the clicked point (AC-003)', () => {
    const { world, grid } = setup();
    const unitA = addUnit(world, grid, { tx: 30, ty: 30 });
    const unitB = addUnit(world, grid, { tx: 30, ty: 30 });
    const target = grid.tileCenter(40, 40);

    issueGroupMoveOrders(world, grid, 'player', [unitA.id, unitB.id], target);
    const slotA = routeOf(unitA).resolvedTarget;
    const slotB = routeOf(unitB).resolvedTarget;

    expect(slotA.y).toBeCloseTo(target.y);
    expect(slotB.y).toBeCloseTo(target.y);
    expect(target.x - slotA.x).toBeCloseTo(slotB.x - target.x);
    expect(Math.abs(slotA.x - slotB.x)).toBeGreaterThan(0);
  });

  it('keeps slots in bounds and distinct when the click lands on a map corner (AC-004)', () => {
    const { world, grid } = setup();
    const units = [
      addUnit(world, grid, { tx: 5, ty: 5 }),
      addUnit(world, grid, { tx: 6, ty: 5 }),
      addUnit(world, grid, { tx: 5, ty: 6 }),
      addUnit(world, grid, { tx: 6, ty: 6 }),
    ];
    const target = grid.tileCenter(0, 0);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted.length).toBeGreaterThan(1);

    const tiles = accepted.map((id) => grid.worldToTile(routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget));
    expect(tiles.every((tile) => grid.isInBounds(tile.tx, tile.ty))).toBe(true);
    expect(new Set(tiles.map(tileKey)).size).toBe(tiles.length);
  });

  it('never assigns a slot inside a building footprint (AC-005)', () => {
    const { world, grid } = setup();
    world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 28, ty: 28 } });
    const units = [
      addUnit(world, grid, { tx: 10, ty: 10 }),
      addUnit(world, grid, { tx: 11, ty: 10 }),
      addUnit(world, grid, { tx: 12, ty: 10 }),
      addUnit(world, grid, { tx: 13, ty: 10 }),
    ];
    const target = grid.tileCenter(30, 30);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted.length).toBeGreaterThan(0);
    for (const id of accepted) {
      const tile = grid.worldToTile(routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget);
      expect(isUnderBuilding(world, tile)).toBe(false);
    }
  });

  it('never assigns a slot on blocked terrain (AC-005)', () => {
    const { world, grid } = setup([{ terrain: 'rock', area: { tx: 29, ty: 29, width: 3, height: 3 } }]);
    const units = [
      addUnit(world, grid, { tx: 10, ty: 10 }),
      addUnit(world, grid, { tx: 11, ty: 10 }),
      addUnit(world, grid, { tx: 12, ty: 10 }),
      addUnit(world, grid, { tx: 13, ty: 10 }),
    ];
    const target = grid.tileCenter(30, 30);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted.length).toBeGreaterThan(0);
    for (const id of accepted) {
      const tile = grid.worldToTile(routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget);
      expect(grid.isPassable(tile.tx, tile.ty)).toBe(true);
    }
  });

  it('confirms every accepted slot is path-reachable from its own unit (AC-006)', () => {
    const { world, grid } = setup();
    world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 20, ty: 20 } });
    const units = [
      addUnit(world, grid, { tx: 10, ty: 10 }),
      addUnit(world, grid, { tx: 11, ty: 10 }),
      addUnit(world, grid, { tx: 12, ty: 10 }),
    ];
    const target = grid.tileCenter(25, 25);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted.length).toBeGreaterThan(0);
    for (const id of accepted) {
      const unit = world.unit(id) as ReadonlyUnit;
      const startTile = grid.worldToTile(unit.position);
      const resolvedTile = grid.worldToTile(routeOf(unit).resolvedTarget);
      const path = findPath(grid, startTile, resolvedTile, (tile) => isUnderBuilding(world, tile));
      expect(path.found).toBe(true);
    }
  });

  it('assigns deterministic, non-duplicate alternatives when the target area is constrained (AC-007)', () => {
    function run(): readonly TileCoord[] {
      const grid = createMapGrid(MAP_CONFIG);
      const world = createWorld({ tileSizePixels: grid.tileSizePixels });
      // A 4x4 HQ centred on the click leaves no room for any slot at or near the exact point.
      world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 28, ty: 28 } });
      const units = [
        world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10) }),
        world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(11, 10) }),
        world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(12, 10) }),
        world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(13, 10) }),
      ];
      const target = grid.tileCenter(30, 30);
      const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
      return accepted.map((id) => grid.worldToTile(routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget));
    }

    const first = run();
    const second = run();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(new Set(first.map(tileKey)).size).toBe(first.length);
  });

  it('caps a group at maxGroupSize, leaving anything beyond it untouched (REQ-006)', () => {
    const { world, grid } = setup();
    const units = Array.from({ length: FORMATION_CONFIG.maxGroupSize + 1 }, (_, i) =>
      addUnit(world, grid, { tx: 5 + (i % 10), ty: 5 + Math.floor(i / 10) }));
    const target = grid.tileCenter(40, 40);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted.length).toBeLessThanOrEqual(FORMATION_CONFIG.maxGroupSize);

    const overflow = units[units.length - 1] as ReadonlyUnit;
    expect(accepted).not.toContain(overflow.id);
    expect(overflow.order).toBeNull();
    expect(overflow.status).toBe('idle');
  });

  it('leaves an enemy unit mixed into the selection untouched while moving the valid ones (REQ-006)', () => {
    const { world, grid } = setup();
    const validA = addUnit(world, grid, { tx: 10, ty: 10 });
    const validB = addUnit(world, grid, { tx: 11, ty: 10 });
    const enemy = world.createUnit({
      type: 'infantry', owner: 'ai', faction: 'ember', position: grid.tileCenter(12, 10),
    });
    const target = grid.tileCenter(30, 30);

    const accepted = issueGroupMoveOrders(world, grid, 'player', [validA.id, validB.id, enemy.id], target);
    expect([...accepted].sort()).toEqual([validA.id, validB.id].sort());
    expect(enemy.order).toBeNull();
  });

  it('rejects an out-of-bounds or non-finite target for a group, same as a single unit', () => {
    const { world, grid } = setup();
    const unitA = addUnit(world, grid, { tx: 10, ty: 10 });
    const unitB = addUnit(world, grid, { tx: 11, ty: 10 });

    expect(issueGroupMoveOrders(world, grid, 'player', [unitA.id, unitB.id], { x: -1, y: 100 })).toEqual([]);
    expect(unitA.order).toBeNull();
    expect(unitB.order).toBeNull();

    expect(issueGroupMoveOrders(world, grid, 'player', [unitA.id, unitB.id], { x: NaN, y: 100 })).toEqual([]);
    expect(unitA.order).toBeNull();
  });

  it('completes a 20-unit group move deterministically, each ending at its own resolved slot (AC-010)', () => {
    const { world, grid } = setup();
    const units = Array.from({ length: 20 }, (_, i) =>
      addUnit(world, grid, { tx: 10 + (i % 5), ty: 10 + Math.floor(i / 5) }));
    const target = grid.tileCenter(40, 40);

    const accepted = issueGroupMoveOrders(world, grid, 'player', units.map((unit) => unit.id), target);
    expect(accepted).toHaveLength(20);

    const resolvedSlots = new Map(accepted.map((id) => [id, routeOf(world.unit(id) as ReadonlyUnit).resolvedTarget]));

    for (let i = 0; i < 600 && world.units().some((unit) => unit.status === 'moving'); i++) {
      stepMovement(world, 0.05);
      stepSeparation(world, grid, 0.05);
    }

    expect(world.units().every((unit) => unit.status === 'idle')).toBe(true);

    const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * grid.tileSizePixels;
    for (const id of accepted) {
      const unit = world.unit(id) as ReadonlyUnit;
      const slot = resolvedSlots.get(id) as { x: number; y: number };
      const distance = Math.hypot(unit.position.x - slot.x, unit.position.y - slot.y);
      expect(distance).toBeLessThanOrEqual(tolerance + 1e-6);
    }
  });
});
