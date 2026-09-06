import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
