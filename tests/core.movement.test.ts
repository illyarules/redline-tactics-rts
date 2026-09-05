import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { MOVEMENT_CONFIG } from '../src/config/movement';
import { PATHFINDING_CONFIG } from '../src/config/pathfinding';
import type { ReadonlyUnit } from '../src/core/entities';
import { tileDistance } from '../src/core/geometry';
import { createMapGrid } from '../src/core/map';
import { isUnderBuilding } from '../src/core/matchSetup';
import { createWorld } from '../src/core/world';
import { headingForMovement, issueMoveOrders, stepMovement, turnTowards } from '../src/core/movement';
import { attackMoveOrder, type MoveRoute } from '../src/core/orders';

/** The unit's current route, or a test-failing error if it isn't following a Move order. */
function routeOf(unit: ReadonlyUnit): MoveRoute {
  if (unit.order?.kind !== 'Move') {
    throw new Error(`expected a Move order, got ${JSON.stringify(unit.order)}`);
  }
  return unit.order.route;
}

/** A neutral tile far from either base and both resource fields, so nothing else can block it. */
const START_TILE = { tx: 10, ty: 10 };

function setup() {
  const grid = createMapGrid(MAP_CONFIG);
  const world = createWorld({ tileSizePixels: grid.tileSizePixels });
  const unit = world.createUnit({
    type: 'worker',
    owner: 'player',
    faction: 'meridian',
    position: grid.tileCenter(START_TILE.tx, START_TILE.ty),
  });
  return { grid, world, unit };
}

describe('direct movement', () => {
  it('converts core movement directions to north-zero headings', () => {
    expect(headingForMovement(0, -1)).toBeCloseTo(0);
    expect(headingForMovement(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(headingForMovement(0, 1)).toBeCloseTo(Math.PI);
    expect(headingForMovement(-1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(headingForMovement(0, 0)).toBeNull();
  });

  it('clamps turns along the shortest arc and normalizes headings', () => {
    expect(turnTowards(0, Math.PI, 0.5)).toBeCloseTo(0.5);
    expect(turnTowards(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(-Math.PI + 0.1);
    expect(turnTowards(0, 1, -1)).toBe(0);
  });

  it('updates unit heading at the configured turn rate while moving', () => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(14, 10));
    stepMovement(world, 0.25, { maxTurnRadiansPerSecond: 1 });
    expect(unit.facingRadians).toBeCloseTo(0.25);
    expect(unit.position.x).toBeGreaterThan(grid.tileCenter(10, 10).x);
    stepMovement(world, 10, { maxTurnRadiansPerSecond: 1 });
    expect(unit.facingRadians).toBeCloseTo(Math.PI / 2);
  });
});

describe('routed movement orders', () => {
  it('creates a route, starts moving, copies the target and deduplicates selection', () => {
    const { grid, world, unit } = setup();
    const target = { x: 500, y: 300 };
    expect(issueMoveOrders(world, grid, 'player', [unit.id, unit.id], target)).toEqual([unit.id]);
    target.x = 900;

    expect(unit.order?.kind).toBe('Move');
    if (unit.order?.kind !== 'Move') return;
    expect(unit.order.target).toEqual({ x: 500, y: 300 });
    const targetTile = grid.worldToTile({ x: 500, y: 300 });
    expect(unit.order.route.resolvedTarget).toEqual(grid.tileCenter(targetTile.tx, targetTile.ty));
    expect(unit.order.route.waypointIndex).toBe(0);
    expect(unit.status).toBe('moving');
  });

  it('moves at configured speed along a straight diagonal route', () => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(14, 14));

    const speed = unit.stats.speedTilesPerSecond;
    const seconds = (0.5 * Math.SQRT2) / speed; // half of one diagonal leg, so no waypoint is reached yet
    stepMovement(world, seconds);

    const travelled = speed * grid.tileSizePixels * seconds;
    const start = grid.tileCenter(10, 10);
    expect(unit.position.x).toBeCloseTo(start.x + travelled / Math.SQRT2);
    expect(unit.position.y).toBeCloseTo(start.y + travelled / Math.SQRT2);
    expect(unit.status).toBe('moving');
  });

  it('uses faction-resolved speed and the world tile scale', () => {
    const { grid, world } = setup();
    const unit = world.createUnit({
      type: 'tank', owner: 'player', faction: 'ember', position: grid.tileCenter(10, 10),
    });
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(40, 10));
    stepMovement(world, 1);
    expect(unit.position.x).toBeCloseTo(
      grid.tileCenter(10, 10).x + unit.stats.speedTilesPerSecond * grid.tileSizePixels,
    );
  });

  it('advances the waypoint index leg by leg, then arrives at tolerance and clears the order', () => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(14, 10));
    const secondsPerTile = 1 / unit.stats.speedTilesPerSecond;

    stepMovement(world, secondsPerTile);
    expect(unit.position.x).toBeCloseTo(grid.tileCenter(11, 10).x);
    expect(routeOf(unit).waypointIndex).toBe(1);
    expect(unit.status).toBe('moving');

    stepMovement(world, secondsPerTile);
    expect(unit.position.x).toBeCloseTo(grid.tileCenter(12, 10).x);
    expect(routeOf(unit).waypointIndex).toBe(2);

    stepMovement(world, secondsPerTile);
    expect(unit.position.x).toBeCloseTo(grid.tileCenter(13, 10).x);
    expect(routeOf(unit).waypointIndex).toBe(3);

    stepMovement(world, 100);
    const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * grid.tileSizePixels;
    expect(unit.position.x).toBeCloseTo(grid.tileCenter(14, 10).x - tolerance);
    expect(unit.order).toBeNull();
    expect(unit.status).toBe('idle');

    const position = { ...unit.position };
    stepMovement(world, 1);
    expect(unit.position).toEqual(position);
  });

  it.each([0, 1, 2.4])('completes an order already within the destination tile at offset %s', (offset) => {
    const { grid, world, unit } = setup();
    const start = grid.tileCenter(10, 10);
    issueMoveOrders(world, grid, 'player', [unit.id], { x: start.x + offset, y: start.y });
    stepMovement(world, 0);
    expect(unit.order).toBeNull();
    expect(unit.status).toBe('idle');
    expect(unit.position).toEqual(start);
  });

  it('respects an injected arrival tolerance', () => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(11, 10));
    stepMovement(world, 0, { arrivalToleranceTiles: 1 });
    expect(unit.order).toBeNull();
  });

  it('is independent of frame partitioning', () => {
    const a = setup(), b = setup();
    for (const { grid, world, unit } of [a, b]) {
      issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(30, 10));
    }
    stepMovement(a.world, 1);
    for (let i = 0; i < 10; i++) stepMovement(b.world, 0.1);
    expect(a.unit.position.x).toBeCloseTo(b.unit.position.x);
    expect(a.unit.position.y).toBeCloseTo(b.unit.position.y);
    expect(a.unit.status).toBe('moving');
    expect(b.unit.status).toBe('moving');
  });

  it('rejects buildings, enemy units, destroyed units and missing ids', () => {
    const { grid, world, unit } = setup();
    const enemy = world.createUnit({ type: 'infantry', owner: 'ai', faction: 'ember', position: { x: 400, y: 400 } });
    const building = world.createBuilding({ type: 'hq', owner: 'player', faction: 'meridian', topLeft: { tx: 1, ty: 1 } });
    const removed = world.createUnit({ type: 'tank', owner: 'player', faction: 'meridian', position: { x: 400, y: 500 } });
    world.remove(removed.id);
    world.damage(unit.id, unit.health);
    expect(issueMoveOrders(world, grid, 'player', [unit.id, enemy.id, building.id, removed.id], { x: 500, y: 500 })).toEqual([]);
    expect(enemy.order).toBeNull();
    expect(building.order).toBeNull();
    expect(unit.status).toBe('destroyed');
  });

  it.each([{ x: -1, y: 400 }, { x: 1920, y: 400 }, { x: 400, y: 1920 }, { x: NaN, y: 400 }, { x: 400, y: Infinity }])(
    'rejects invalid destination %s without replacing an order',
    (target) => {
      const { grid, world, unit } = setup();
      issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(11, 10));
      const order = unit.order;
      expect(issueMoveOrders(world, grid, 'player', [unit.id], target)).toEqual([]);
      expect(unit.order).toBe(order);
    },
  );

  it('resolves a destination blocked by terrain to a nearby reachable tile instead of rejecting it', () => {
    const { world, unit } = setup();
    const grid = createMapGrid({
      ...MAP_CONFIG,
      regions: [{ terrain: 'rock', area: { tx: 20, ty: 20, width: 1, height: 1 } }],
    });

    expect(issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(20, 20))).toEqual([unit.id]);
    const route = routeOf(unit);
    const resolvedTile = grid.worldToTile(route.resolvedTarget);
    expect(resolvedTile).not.toEqual({ tx: 20, ty: 20 });
    expect(grid.isPassable(resolvedTile.tx, resolvedTile.ty)).toBe(true);
    expect(tileDistance(resolvedTile, { tx: 20, ty: 20 })).toBeLessThanOrEqual(
      PATHFINDING_CONFIG.blockedDestinationSearchRadiusTiles,
    );
  });

  it('resolves a destination blocked by a building footprint to a nearby reachable tile, routing clear of it', () => {
    const { grid, world, unit } = setup();
    world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 20, ty: 20 } });

    expect(issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(21, 21))).toEqual([unit.id]);
    const route = routeOf(unit);
    expect(isUnderBuilding(world, grid.worldToTile(route.resolvedTarget))).toBe(false);
    for (const waypoint of route.waypoints) {
      expect(isUnderBuilding(world, grid.worldToTile(waypoint))).toBe(false);
    }
  });

  it('leaves the order and status untouched when no route exists', () => {
    const { world, unit } = setup();
    const grid = createMapGrid({
      ...MAP_CONFIG,
      // (20,20) is open ground, but every tile touching it is blocked, so nothing can ever reach it.
      regions: [
        { terrain: 'rock', area: { tx: 19, ty: 19, width: 3, height: 1 } },
        { terrain: 'rock', area: { tx: 19, ty: 20, width: 1, height: 1 } },
        { terrain: 'rock', area: { tx: 21, ty: 20, width: 1, height: 1 } },
        { terrain: 'rock', area: { tx: 19, ty: 21, width: 3, height: 1 } },
      ],
    });
    expect(grid.isPassable(20, 20)).toBe(true);

    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(15, 10));
    const priorOrder = unit.order;
    expect(issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(20, 20))).toEqual([]);
    expect(unit.order).toBe(priorOrder);
    expect(unit.status).toBe('moving');
  });

  it('follows a route around a building footprint without ever entering it, and arrives', () => {
    const { grid, world, unit } = setup();
    // Straddles the direct east route at ty 10.
    world.createBuilding({ type: 'hq', owner: 'ai', faction: 'ember', topLeft: { tx: 12, ty: 8 } });

    const targetTile = { tx: 20, ty: 10 };
    expect(issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(targetTile.tx, targetTile.ty))).toEqual([unit.id]);
    for (const waypoint of routeOf(unit).waypoints) {
      expect(isUnderBuilding(world, grid.worldToTile(waypoint))).toBe(false);
    }

    for (let i = 0; i < 2000 && unit.order !== null; i++) {
      stepMovement(world, 0.05);
      expect(isUnderBuilding(world, grid.worldToTile(unit.position))).toBe(false);
    }

    expect(unit.order).toBeNull();
    expect(unit.status).toBe('idle');
    // Arrival stops short of the goal by the configured tolerance, whichever direction it approached from.
    const finalTarget = grid.tileCenter(targetTile.tx, targetTile.ty);
    const distanceToTarget = Math.hypot(unit.position.x - finalTarget.x, unit.position.y - finalTarget.y);
    expect(distanceToTarget).toBeCloseTo(MOVEMENT_CONFIG.arrivalToleranceTiles * grid.tileSizePixels);
  });

  it('replaces an active destination, and selection is not needed to finish travel', () => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(30, 10));
    stepMovement(world, 1);
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(2, 10));
    stepMovement(world, 1000);

    const tolerance = MOVEMENT_CONFIG.arrivalToleranceTiles * grid.tileSizePixels;
    const finalTarget = grid.tileCenter(2, 10);
    expect(Math.abs(unit.position.x - finalTarget.x)).toBeCloseTo(tolerance);
    expect(unit.position.y).toBeCloseTo(finalTarget.y);
    expect(unit.order).toBeNull();
  });

  it('does not simulate other order kinds or move a destroyed unit', () => {
    const { grid, world, unit } = setup();
    world.setOrder(unit.id, attackMoveOrder(grid.tileCenter(30, 10)));
    stepMovement(world, 1);
    expect(unit.position).toEqual(grid.tileCenter(10, 10));

    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(30, 10));
    world.damage(unit.id, unit.health);
    stepMovement(world, 1);
    expect(unit.position).toEqual(grid.tileCenter(10, 10));
  });

  it.each([-1, NaN, Infinity])('ignores invalid elapsed time %s', (elapsed) => {
    const { grid, world, unit } = setup();
    issueMoveOrders(world, grid, 'player', [unit.id], grid.tileCenter(30, 10));
    stepMovement(world, elapsed);
    expect(unit.position).toEqual(grid.tileCenter(10, 10));
    expect(unit.status).toBe('moving');
  });
});
