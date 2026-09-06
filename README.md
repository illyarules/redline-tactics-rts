# Redline Tactics

A small, original browser RTS built with TypeScript, Babylon.js and Vite.

## Requirements

- Node.js 20+
- A current desktop browser with WebGL 2 (mouse and keyboard)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest unit suite once (`tests/unit/`) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run the Playwright E2E suite once (headless Chromium, `tests/e2e/`) |
| `npm run test:e2e:ui` | Run the Playwright E2E suite in the interactive UI runner |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |

## Documentation

Design and scope live in [`game-design.md`](./game-design.md); the task-by-task build order lives in
[`implementation-plan.md`](./implementation-plan.md). Gameplay, world, camera and per-task build
notes live in [`docs/`](./docs/README.md).
