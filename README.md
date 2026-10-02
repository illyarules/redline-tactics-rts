# Redline Tactics

A small, original browser RTS built with TypeScript, Babylon.js and Vite.

## Requirements

- Node.js 20+
- A current desktop browser with WebGL 2 (mouse and keyboard)

Phones and tablets are detected and blocked at the start screen. Touch controls are not implemented.

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
build order lives in [`implementation-plan.md`](./implementation-plan.md).
Gameplay, world, camera and per-task build notes live in [`docs/`](./docs/README.md).

## Match flow

The title screen offers Start Game. With a valid save it resumes that match, including a completed
battle report. Without a save it opens mode selection: Single Game leads to battlefield selection;
Multiplayer is disabled. Choose Open Field (64 × 64, 1v1) or Trident Basin (80 × 80, 1v2 against two
allied AI commanders), then Start Match. The player is always Meridian and the AI is Ember.

Eliminate every enemy building before your own structures fall or the fifteen-minute active-time
limit expires. In 1v2, buildings belonging to either AI keep the enemy team alive. The time limit
produces a draw if neither side is eliminated.

Escape opens Pause only while a match is live; Pause also offers New Match and a Quit to Main Menu
that first confirms — Save and Quit persists the match before closing it, Quit Without Saving
discards it, and Cancel returns to the live match unchanged. New Match and the battle report's
Play Again open battlefield selection; Start Match then clears the previous save and starts fresh.
Quit to Title from the battle report clears the completed save.

Use WASD or arrow keys to pan, the mouse wheel or +/− to zoom, left-click/drag to select, and
right-click to move, attack visible enemies, or gather with Workers. Q then left-click issues
Attack-Move; A pans the camera. The minimap is read-only. Full controls are in
[`docs/gameplay.md`](./docs/gameplay.md).

Gameplay and saves require no backend. The deployed client initializes Vercel Web Analytics; it does
not synchronize match state or provide accounts, cloud saves, multiplayer, or other online gameplay.
