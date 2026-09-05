import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../src/config/map';
import { orderMarkerFor } from '../src/game/orderMarker';
import { attackMoveOrder, attackOrder, buildOrder, moveOrder, produceOrder } from '../src/core/orders';
import { createWorld, type World } from '../src/core/world';
import type { ReadonlyEntity } from '../src/core/entities';
import type { EntityId } from '../src/core/ids';
import type { Vec2 } from '../src/core/geometry';

const TILE = MAP_CONFIG.tileSizePixels;

function newWorld(): World {
  return createWorld({ tileSizePixels: TILE });
}

function addInfantry(world: World, position: Vec2): ReadonlyEntity {
  return world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position });
}

/** Resolves an attack target's position the way the scene does. */
function positionsIn(world: World) {
  return (id: EntityId): Vec2 | null => world.get(id)?.position ?? null;
}

const nowhere = (): null => null;

describe('orderMarkerFor', () => {
  it('marks nothing when there is no entity or no order', () => {
    const world = newWorld();
    const idle = addInfantry(world, { x: 100, y: 100 });

    expect(orderMarkerFor(null, nowhere)).toBeNull();
    expect(idle.order).toBeNull();
    expect(orderMarkerFor(idle, nowhere)).toBeNull();
  });

  it('marks a Move at the originally ordered point, not the resolved route target', () => {
    const world = newWorld();
    const unit = addInfantry(world, { x: 100, y: 100 });
    // The route resolved elsewhere (e.g. nudged off blocked terrain, or a group's own
    // formation slot) — the marker must still track the point the player actually ordered.
    const resolvedTarget = { x: 450, y: 390 };
    world.setOrder(
      unit.id,
      moveOrder({ x: 420, y: 360 }, { resolvedTarget, waypoints: [resolvedTarget], waypointIndex: 0 }),
    );

    expect(orderMarkerFor(world.get(unit.id) ?? null, nowhere)).toEqual({
      kind: 'move',
      position: { x: 420, y: 360 },
    });
  });

  it('marks an AttackMove at its destination, distinctly from a Move', () => {
    const world = newWorld();
    const unit = addInfantry(world, { x: 100, y: 100 });
    world.setOrder(unit.id, attackMoveOrder({ x: 900, y: 120 }));

    expect(orderMarkerFor(world.get(unit.id) ?? null, nowhere)).toEqual({
      kind: 'attackMove',
      position: { x: 900, y: 120 },
    });
  });

  it('marks an Attack on the target it names', () => {
    const world = newWorld();
    const attacker = addInfantry(world, { x: 100, y: 100 });
    const target = world.createUnit({
      type: 'tank',
      owner: 'ai',
      faction: 'ember',
      position: { x: 640, y: 640 },
    });
    world.setOrder(attacker.id, attackOrder(target.id));

    expect(orderMarkerFor(world.get(attacker.id) ?? null, positionsIn(world))).toEqual({
      kind: 'attack',
      position: { x: 640, y: 640 },
    });
  });

  it('marks nothing once an attack target is gone', () => {
    const world = newWorld();
    const attacker = addInfantry(world, { x: 100, y: 100 });
    const target = world.createUnit({
      type: 'tank',
      owner: 'ai',
      faction: 'ember',
      position: { x: 640, y: 640 },
    });
    world.setOrder(attacker.id, attackOrder(target.id));
    world.remove(target.id);

    expect(orderMarkerFor(world.get(attacker.id) ?? null, positionsIn(world))).toBeNull();
  });

  it('leaves orders with no single point on the map unmarked', () => {
    const world = newWorld();
    const worker = world.createUnit({
      type: 'worker',
      owner: 'player',
      faction: 'meridian',
      position: { x: 100, y: 100 },
    });
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 10, ty: 10 },
    });

    world.setOrder(worker.id, buildOrder('barracks', { tx: 20, ty: 20 }));
    expect(orderMarkerFor(world.get(worker.id) ?? null, positionsIn(world))).toBeNull();

    world.setOrder(hq.id, produceOrder(hq.id, 'worker'));
    expect(orderMarkerFor(world.get(hq.id) ?? null, positionsIn(world))).toBeNull();
  });
});
