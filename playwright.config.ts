import { defineConfig, devices } from '@playwright/test';

/**
 * The suite drives the app through its ordinary `/` route. Fixtures live entirely under
 * `tests/e2e/fixtures/` and are seeded as local match snapshots before navigation — the app never
 * has a test-only mode to opt into, so this could just as well point at a production build; the dev
 * server is used only because it starts faster for local iteration.
 */
const PORT = 5183;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Failures must be fixed, not retried away.
  retries: 0,
  reporter: 'list',
  timeout: 25_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // `devices['Desktop Chrome']` carries its own default viewport (1280x720), which would
      // otherwise win this merge and silently override the fixed 1440x900 viewport above.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
