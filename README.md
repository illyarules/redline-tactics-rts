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
| `npm run dev:server` | Start the authoritative multiplayer server on port 8787 |
| `npm run build` | Produce a production build in `dist/` |
| `npm run build:server` | Produce the Node server build in `dist-server/` |
| `npm run start:server` | Run the built multiplayer server |
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

The title screen offers Start Game and Multiplayer. With a valid save, Start Game resumes that match,
including a completed battle report. Without a save it opens mode selection: Single Game leads to
battlefield selection. Choose Open Field (64 × 64, 1v1) or Trident Basin (80 × 80, 1v2 against two
allied AI commanders), then Start Match. The player is always Meridian and the AI is Ember.
The lower title-screen footer shows the application version, current build identifier, developer,
source repository, bug-report and feedback links.

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
Attack-Move; E entrenches selected FPV Drone Operators; A pans the camera. Click the minimap to recenter the camera. Full controls are in
[`docs/gameplay.md`](./docs/gameplay.md).

Single-player gameplay and saves require no backend. For private multiplayer, start the Node server
with `npm run build:server && npm run start:server` alongside `npm run dev`. Select Multiplayer on
the title screen, create a room, share the invite link, and have both players select Ready. The
server starts a Meridian mirror match after both clients load. Online and single-player use the same
tactical HUD structure: match status and clock at the top, selection and Credits at bottom left,
contextual construction, production, queue and unit actions in the center, and the minimap at bottom
right. Online adds connection and surrender controls; single-player keeps its pause/save lifecycle.
Online matches use the same Open Field terrain, unit and building models, camera,
and fog-of-war presentation as single-player matches. Click, Shift-click, or drag to select units;
right-click ground to move, press Q then
click ground to attack-move, or right-click a visible enemy to attack. Select a Worker and choose a
building, then click a visible footprint to construct; select a production building and choose a unit
to queue it. Right-click a visible resource field with a Worker to gather. WASD or arrow keys move the
camera; the minimap recenters it. Escape clears an active order or selection. Surrender requires
confirmation and ends the match. Refreshing the same tab resumes its seat while the server is running.
Visible online movement is smoothed between the server's authoritative snapshots. The command panel
shows pending, confirmed, and rejected order states; movement and attack markers remain local visual
feedback until the server applies or rejects the command.
Confirmed PvP attacks keep a marker on the visible target and use the shared muzzle, projectile,
impact, target-flash, and destruction effects from the single-player battlefield.

The browser uses `ws://localhost:8787/ws` by default. Set `VITE_MULTIPLAYER_URL` to the public WSS
endpoint when building the client. Set `MULTIPLAYER_ORIGIN` to the exact HTTPS frontend origin on
the server; the default is `http://localhost:5173`. `MULTIPLAYER_MAX_ROOMS` sets the room cap.
The online service keeps rooms in memory and loses them on process restart. It has no accounts or
persistent match history. The deployed client also initializes Vercel Web Analytics.
