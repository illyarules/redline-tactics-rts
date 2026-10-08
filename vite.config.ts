import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface PackageMetadata {
  readonly version: string;
}

const packageMetadata = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as PackageMetadata;

export const resolveBuildId = (
  environment: NodeJS.ProcessEnv = process.env,
  localCommit: () => string = () => execFileSync(
    'git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' },
  ).trim(),
): string => {
  const deployedCommit = environment.VERCEL_GIT_COMMIT_SHA
    ?? environment.GITHUB_SHA
    ?? environment.CI_COMMIT_SHA
    ?? environment.COMMIT_SHA;
  if (deployedCommit !== undefined && deployedCommit.trim() !== '') {
    return deployedCommit.trim().slice(0, 7);
  }
  try {
    return localCommit() || 'dev';
  } catch {
    return 'dev';
  }
};

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
    __BUILD_ID__: JSON.stringify(resolveBuildId()),
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
