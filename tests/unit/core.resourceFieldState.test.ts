import { describe, expect, it } from 'vitest';
import { MAP_CONFIG } from '../../src/config/map';
import { createMapGrid } from '../../src/core/map';
import {
  createResourceFieldState,
  serializeResourceFieldState,
} from '../../src/core/resourceFieldState';

function setup() {
  return createMapGrid(MAP_CONFIG);
}

describe('createResourceFieldState', () => {
  it('starts every field at its configured Credits', () => {
    const grid = setup();
    const state = createResourceFieldState(grid);
    for (const field of grid.resourceFields) {
      expect(state.remaining(field.id)).toBe(field.credits);
      expect(state.isDepleted(field.id)).toBe(false);
    }
  });

  it('takes up to the requested amount and never below zero', () => {
    const grid = setup();
    const state = createResourceFieldState(grid);
    const field = grid.resourceFields[0]!;

    expect(state.take(field.id, 100)).toBe(100);
    expect(state.remaining(field.id)).toBe(field.credits - 100);

    const rest = state.take(field.id, field.credits);
    expect(rest).toBe(field.credits - 100);
    expect(state.remaining(field.id)).toBe(0);
    expect(state.isDepleted(field.id)).toBe(true);

    expect(state.take(field.id, 50)).toBe(0);
    expect(state.remaining(field.id)).toBe(0);
  });

  it('returns 0 for an unknown field id without throwing', () => {
    const grid = setup();
    const state = createResourceFieldState(grid);
    expect(state.remaining('nope')).toBe(0);
    expect(state.take('nope', 10)).toBe(0);
  });

  it('rejects a non-finite or negative take amount', () => {
    const grid = setup();
    const state = createResourceFieldState(grid);
    const field = grid.resourceFields[0]!;
    expect(() => state.take(field.id, Number.NaN)).toThrow();
    expect(() => state.take(field.id, -1)).toThrow();
  });

  it('restores remaining amounts from a snapshot', () => {
    const grid = setup();
    const field = grid.resourceFields[0]!;
    const state = createResourceFieldState(grid, [{ id: field.id, remainingCredits: 12 }]);
    expect(state.remaining(field.id)).toBe(12);
  });

  it('serializes exactly the current remaining amounts', () => {
    const grid = setup();
    const state = createResourceFieldState(grid);
    const field = grid.resourceFields[0]!;
    state.take(field.id, 40);
    const snapshot = serializeResourceFieldState(state, grid);
    expect(snapshot.find((entry) => entry.id === field.id)?.remainingCredits).toBe(field.credits - 40);
  });
});
