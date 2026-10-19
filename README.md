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

The title screen offers Start Game, which opens the Single Game / Multiplayer mode selection.
Single Game resumes a valid save, including a completed battle report, or leads to battlefield
selection when there is no save. Choose Open Field (64 × 64, 1v1) or Trident Basin (80 × 80, 1v2
against two allied AI commanders), then Start Match. The player is always Meridian and the AI is Ember.
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
with `npm run build:server && npm run start:server` alongside `npm run dev`. Select Start Game, then
Multiplayer, create a room, share the invite link, and have both players select Ready. The
server starts a Meridian mirror match after both clients load. Online and single-player use the same
tactical HUD structure: match status and clock at the top, selection and Credits at bottom left,
contextual construction, production, queue and unit actions in the center, and the minimap at bottom
right. Online adds connection and surrender controls; single-player keeps its pause/save lifecycle.
Online matches use the same Open Field terrain, unit and building models, camera,
and fog-of-war presentation as single-player matches. Click, Shift-click, or drag to select units;
right-click ground to move, press Q then
click ground to attack-move, or right-click a visible enemy to attack. Select a Worker and choose a
building, then click a visible footprint to construct; select a production building and choose a unit
to queue it. A Factory builds the fast Combat Buggy with no Power Plant; Tanks and Rockets are
unavailable ("Needs Power Plant") until one is complete; a Tank or Rocket already queued pauses if power is lost. Right-click a visible resource field with a Worker to gather. WASD or arrow keys move the
camera; the minimap recenters it. Escape clears an active order or selection. Surrender requires
confirmation and ends the match. Refreshing the same tab resumes its seat while the server is running.
Opening an invite to a finished match shows a clear message and offers a new room instead.
Visible online movement is smoothed between the server's authoritative snapshots. The command panel
shows pending, confirmed, and rejected order states; movement and attack markers remain local visual
feedback until the server applies or rejects the command.
Confirmed PvP attacks keep a marker on the visible target and use the shared muzzle, projectile,
impact, target-flash, and destruction effects from the single-player battlefield.

The browser uses `ws://localhost:8787/ws` in development. Production keeps the static Vite client
on Vercel and runs the authoritative process as a separate single-instance Render Web Service; set
`VITE_MULTIPLAYER_URL` to its `wss://.../ws` endpoint. The online service keeps rooms in memory and
has no accounts or persistent match history. Environment variables, health checks, draining,
capacity testing and rollback are documented in
[`docs/multiplayer-deployment.md`](./docs/multiplayer-deployment.md). The deployed client also
initializes Vercel Web Analytics.

## Blender model study

`scripts/blender/create_meridian_tank.py` generates an original articulated tank study,
separate from the live game's procedural models. Open the saved script in Blender's
Scripting workspace and choose Run Script, or run on macOS from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/blender/create_meridian_tank.py
```

Outputs are `assets/models/meridian-tank/meridian-tank.blend`, `meridian-tank.glb`,
and `preview.png`. Rerunning replaces these generated files; save manual edits under
another name. The script creates a separate scene and does not delete existing scenes.
It uses plain PBR materials without external textures. `TurretPivot` and `BarrelPivot`
remain separate for later animation. Blender axes are Z-up / -Y-forward; exported
glTF axes are Y-up / +Z-forward.

The game loads `src/assets/models/meridian-tank.glb` once per match for all Tank units,
including resumed and online matches. Blue/orange armor identifies the owner. Selection,
movement, shadows, fog and combat use the existing entity rules; the turret follows the
hull's existing heading. The procedural tank remains visible during loading and
is retained if loading fails. After regenerating the model, copy the exported `.glb` into
`src/assets/models/` to update the game asset. The studio preview lighting differs from
the battlefield, and large-army performance still needs profiling.

### Infantry squad study

`scripts/blender/create_meridian_infantry.py` builds a detailed three-soldier Meridian squad in the
same way (same command, with the script path swapped). Outputs go to
`assets/models/meridian-infantry-squad/` as `.blend`, `.glb` and `preview.png`. Each soldier
has `BodyPivot`, `ArmsPivot` (both arms and rifle) and `LegLeftPivot`/`LegRightPivot`
for a later walk cycle; the squad leader carries a radio mast. Materials follow the tank's naming
(`Uniform · deep teal`, `Armor · light panels`, `TeamColor`).

The game loads `src/assets/models/meridian-infantry-squad.glb` once per match and builds one
soldier template from `Soldier2` (body, arms with rifle, two legs, baked relative to their pivots),
recoloured per owner. Every soldier of an Infantry squad uses it, with the existing formation and
walk cycle. FPV operators keep the procedural soldier, which is also the fallback while the model
loads or if loading fails. After regenerating, copy the `.glb` into `src/assets/models/`.
