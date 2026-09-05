import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { SEPARATION_CONFIG } from '../src/config/separation';
import type { ReadonlyUnit } from '../src/core/entities';
import { createMapGrid, type MapGrid } from '../src/core/map';
import { isUnderBuilding } from '../src/core/matchSetup';
import { moveOrder } from '../src/core/orders';
import { stepSeparation } from '../src/core/separation';
import { createWorld, type World } from '../src/core/world';

function setup(): { grid: MapGrid; world: World } {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  return { grid, world };
}

/** Puts a unit into an active Move order without needing a real route: only `status` is checked. */
function markMoving(world: World, unit: ReadonlyUnit, target = unit.position): void {
  world.setOrder(unit.id, moveOrder(target));
  world.setStatus(unit.id, 'moving');
}

function distance(a: ReadonlyUnit, b: ReadonlyUnit): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

describe('stepSeparation', () => {
  it('measurably separates two overlapping moving units over successive steps (AC-008)', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const a = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: center });
    const b = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    markMoving(world, a);
    markMoving(world, b);

    const distances: number[] = [distance(a, b)];
    for (let i = 0; i < 5; i++) {
      stepSeparation(world, grid, 0.1);
      distances.push(distance(a, b));
    }

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1] as number);
    }
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0] as number);
  });

  it('never pushes a unit past blocked terrain it is being pushed toward (AC-009)', () => {
    const world = createWorld({ tileSizePixels: MAP_CONFIG.tileSizePixels });
    // A wall of rock immediately east of the pushed unit, so any eastward nudge would cross it.
    const blockedGrid = createMapGrid({
      ...MAP_CONFIG,
      regions: [{ terrain: 'rock', area: { tx: 31, ty: 28, width: 1, height: 4 } }],
    });
    const nearWall = blockedGrid.tileCenter(30, 30);
    const pusher = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian',
      position: { x: nearWall.x - blockedGrid.tileSizePixels * 0.1, y: nearWall.y },
    });
    const pushed = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: nearWall,
    });
    markMoving(world, pusher);
    markMoving(world, pushed);

    for (let i = 0; i < 50; i++) {
      stepSeparation(world, blockedGrid, 0.1);
      const tile = blockedGrid.worldToTile(pushed.position);
      expect(blockedGrid.isInBounds(tile.tx, tile.ty)).toBe(true);
      expect(blockedGrid.isPassable(tile.tx, tile.ty)).toBe(true);
    }
  });

  it('never pushes a unit out of bounds at a map edge (AC-009)', () => {
    const { grid, world } = setup();
    const corner = grid.tileCenter(0, 0);
    const cornerUnit = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: corner });
    const cornerNeighbor = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: { ...corner },
    });
    markMoving(world, cornerUnit);
    markMoving(world, cornerNeighbor);

    for (let i = 0; i < 50; i++) {
      stepSeparation(world, grid, 0.1);
      for (const unit of [cornerUnit, cornerNeighbor]) {
        const tile = grid.worldToTile(unit.position);
        expect(grid.isInBounds(tile.tx, tile.ty)).toBe(true);
      }
    }
  });

  it('never pushes a unit into a building footprint (AC-009)', () => {
    const { grid, world } = setup();
    world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 31, ty: 28 } });
    const nearBuilding = grid.tileCenter(30, 30);
    const pusher = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian',
      position: { x: nearBuilding.x - grid.tileSizePixels * 0.1, y: nearBuilding.y },
    });
    const pushed = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: nearBuilding,
    });
    markMoving(world, pusher);
    markMoving(world, pushed);

    for (let i = 0; i < 50; i++) {
      stepSeparation(world, grid, 0.1);
      const tile = grid.worldToTile(pushed.position);
      expect(isUnderBuilding(world, tile)).toBe(false);
    }
  });

  it('is deterministic: identical inputs produce identical outputs run after run', () => {
    function run(): { x: number; y: number }[] {
      const { grid, world } = setup();
      const center = grid.tileCenter(30, 30);
      const units = [
        world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } }),
        world.createUnit({ type: 'tank', owner: 'player', faction: 'meridian', position: { ...center } }),
        world.createUnit({ type: 'worker', owner: 'player', faction: 'meridian', position: { ...center } }),
      ];
      for (const unit of units) markMoving(world, unit);
      for (let i = 0; i < 10; i++) stepSeparation(world, grid, 0.1);
      return units.map((unit) => ({ ...(world.unit(unit.id) as ReadonlyUnit).position }));
    }

    expect(run()).toEqual(run());
  });

  it('leaves idle units untouched even when overlapping a moving one', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const idle = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    const moving = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    markMoving(world, moving);

    const before = { ...idle.position };
    stepSeparation(world, grid, 0.1);
    expect(idle.position).toEqual(before);
  });

  it('leaves an overlapping enemy-owned unit untouched', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const friendly = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    const enemy = world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: { ...center } });
    markMoving(world, friendly);
    markMoving(world, enemy);

    const friendlyBefore = { ...friendly.position };
    const enemyBefore = { ...enemy.position };
    stepSeparation(world, grid, 0.1);
    expect(friendly.position).toEqual(friendlyBefore);
    expect(enemy.position).toEqual(enemyBefore);
  });

  it('leaves units far enough apart untouched', () => {
    const { grid, world } = setup();
    const a = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(10, 10),
    });
    const b = world.createUnit({
      type: 'infantry', owner: 'player', faction: 'meridian', position: grid.tileCenter(20, 10),
    });
    markMoving(world, a);
    markMoving(world, b);

    const beforeA = { ...a.position };
    const beforeB = { ...b.position };
    stepSeparation(world, grid, 0.1);
    expect(a.position).toEqual(beforeA);
    expect(b.position).toEqual(beforeB);
  });

  it('ignores a non-positive or non-finite deltaSeconds', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const a = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    const b = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    markMoving(world, a);
    markMoving(world, b);

    const beforeA = { ...a.position };
    stepSeparation(world, grid, 0);
    stepSeparation(world, grid, -1);
    stepSeparation(world, grid, NaN);
    expect(a.position).toEqual(beforeA);
  });

  it('leaves order, status and route completely untouched', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const a = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    const b = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    markMoving(world, a, grid.tileCenter(40, 40));
    markMoving(world, b, grid.tileCenter(40, 40));
    const orderBefore = a.order;

    stepSeparation(world, grid, 0.1);
    expect(a.order).toBe(orderBefore);
    expect(a.status).toBe('moving');
  });

  it('clamps displacement to the configured max speed scaled by deltaSeconds', () => {
    const { grid, world } = setup();
    const center = grid.tileCenter(30, 30);
    const a = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    const b = world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position: { ...center } });
    markMoving(world, a);
    markMoving(world, b);

    const deltaSeconds = 0.05;
    const before = { ...a.position };
    stepSeparation(world, grid, deltaSeconds);
    const moved = Math.hypot(a.position.x - before.x, a.position.y - before.y);
    const maxMove = SEPARATION_CONFIG.maxSeparationTilesPerSecond * grid.tileSizePixels * deltaSeconds;
    expect(moved).toBeLessThanOrEqual(maxMove + 1e-6);
  });
});
