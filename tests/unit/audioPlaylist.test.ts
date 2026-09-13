import { describe, expect, it } from 'vitest';
import { selectRandomTrack } from '../../src/audio/audioPlaylist';

describe('match audio playlist', () => {
  it('stays silent for an empty playlist', () => {
    expect(selectRandomTrack([], null)).toBeNull();
  });

  it('allows a sole track to repeat', () => {
    expect(selectRandomTrack(['only.mp3'], 'only.mp3')).toBe('only.mp3');
  });

  it('does not immediately repeat when alternatives exist', () => {
    expect(selectRandomTrack(['first.mp3', 'second.mp3'], 'first.mp3', () => 0)).toBe('second.mp3');
  });

  it('continues safely if duplicate playlist entries leave no distinct alternative', () => {
    expect(selectRandomTrack(['same.mp3', 'same.mp3'], 'same.mp3', () => 0)).toBe('same.mp3');
  });

  it('uses the supplied random position', () => {
    expect(selectRandomTrack(['a.mp3', 'b.mp3', 'c.mp3'], null, () => 0.99)).toBe('c.mp3');
  });
});
