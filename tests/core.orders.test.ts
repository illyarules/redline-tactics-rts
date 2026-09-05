import { describe, expect, it } from 'vitest';
import { createEntityIdFactory } from '../src/core/ids';
import { rectFromCorners, tileDistance } from '../src/core/geometry';
import {
  attackMoveOrder,
  attackOrder,
  buildOrder,
  gatherOrder,
  moveOrder,
  produceOrder,
  type Order,
} from '../src/core/orders';

describe('core identifiers', () => {
  it('hands out unique sequential entity ids', () => {
    const nextId = createEntityIdFactory('u');
    expect([nextId(), nextId(), nextId()]).toEqual(['u1', 'u2', 'u3']);
  });

  it('keeps separate factories independent', () => {
    const a = createEntityIdFactory();
    const b = createEntityIdFactory();
    a();
    expect(b()).toBe('e1');
  });
});

describe('core geometry', () => {
  it('measures tile distance allowing diagonals', () => {
    expect(tileDistance({ tx: 2, ty: 2 }, { tx: 5, ty: 4 })).toBe(3);
  });

  it('normalizes rectangles built from any two corners', () => {
    expect(rectFromCorners({ x: 40, y: 10 }, { x: 10, y: 30 })).toEqual({
      x: 10,
      y: 10,
      width: 30,
      height: 20,
    });
  });
});

describe('core orders', () => {
  it('tags every order with its kind', () => {
    const orders: Order[] = [
      moveOrder({ x: 1, y: 2 }),
      attackOrder('e7'),
      attackMoveOrder({ x: 3, y: 4 }),
      buildOrder('barracks', { tx: 8, ty: 9 }, 'e2', null),
      produceOrder('e1', 'infantry'),
      gatherOrder('west-home', 'toField', null),
    ];

    expect(orders.map((order) => order.kind)).toEqual([
      'Move',
      'Attack',
      'AttackMove',
      'Build',
      'Produce',
      'Gather',
    ]);
  });

  it('keeps order payloads intact', () => {
    expect(buildOrder('factory', { tx: 4, ty: 5 }, 'e9', null)).toEqual({
      kind: 'Build',
      buildingType: 'factory',
      topLeft: { tx: 4, ty: 5 },
      buildingId: 'e9',
      route: null,
    });
  });

  it('defaults a Gather order to no elapsed time and no drop-off', () => {
    expect(gatherOrder('west-home', 'gathering', null)).toEqual({
      kind: 'Gather',
      fieldId: 'west-home',
      phase: 'gathering',
      route: null,
      gatherElapsedSeconds: 0,
      dropoffId: null,
    });
  });
});
