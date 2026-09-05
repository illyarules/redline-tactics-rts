import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../src/game/title';

describe('project smoke test', () => {
  it('exposes the game title', () => {
    expect(GAME_TITLE).toBe('Redline Tactics');
  });
});
