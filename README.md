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
| `npm run lint` | Check TypeScript source and tests with ESLint |
| `npm run lint:fix` | Apply ESLint's safe automatic fixes |

ESLint keeps function complexity at 10 or below and nesting at three levels or below. It intentionally
does not enforce formatting; use `npm run lint` to check changes and `npm run lint:fix` for automatic fixes.

## Documentation

Current design and scope live in [`game-design.md`](./game-design.md); the historical task-by-task
build order and remaining stabilization criteria live in [`implementation-plan.md`](./implementation-plan.md).
Gameplay, world, camera and per-task build notes live in [`docs/`](./docs/README.md).

## Match flow

The title screen offers Resume Game and New Game when a saved match exists, or only New Game when
there is none; New Game asks for confirmation before it discards an existing save. From there,
eliminate every enemy building before your own structures fall or the ten-minute active-time limit
expires. The battle report then offers a clean rematch or return to the title.

Escape opens Pause only while a match is live; Pause also offers New Match and a Quit to Main Menu
that first confirms — Save and Quit persists the match before closing it, Quit Without Saving
discards it, and Cancel returns to the live match unchanged. Active and terminal matches are restored
from local browser storage, while every fresh-match or discarded-quit path clears the prior save.

Gameplay and saves require no backend. The deployed client initializes Vercel Web Analytics; it does
not synchronize match state or provide accounts, cloud saves, multiplayer, or other online gameplay.
