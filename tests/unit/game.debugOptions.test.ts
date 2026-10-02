import { describe, expect, it } from 'vitest';
import { readDebugOptions } from '../../src/game/debugOptions';

describe('visual debug options', () => {
  it('enables no-fog rendering only for the exact development query', () => {
    expect(readDebugOptions('?debug=no-fog', true)).toEqual({ noFog: true });
    expect(readDebugOptions('?debug=labels', true)).toEqual({ noFog: false });
    expect(readDebugOptions('?debug=no-fog', false)).toEqual({ noFog: false });
  });
});
