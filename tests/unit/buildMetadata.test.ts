import { describe, expect, it } from 'vitest';
import { resolveBuildId } from '../../vite.config';

describe('build metadata', () => {
  it('prefers and shortens the deployment commit', () => {
    expect(resolveBuildId({ VERCEL_GIT_COMMIT_SHA: '123456789abcdef' }, () => 'local')).toBe('1234567');
  });

  it('falls back to the local commit and then dev', () => {
    expect(resolveBuildId({}, () => 'abc1234')).toBe('abc1234');
    expect(resolveBuildId({}, () => { throw new Error('no repository'); })).toBe('dev');
  });
});
