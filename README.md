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
right. Construction cards include a visual preview of the finished building beside its cost and
build time. Online adds connection and surrender controls; single-player keeps its pause/save lifecycle.
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

### Vehicle effects

Purely cosmetic, identical in single-player and private online matches, and tuned in
`src/config/vehicleEffects.ts`:

- Movement rule (not cosmetic, tuned in `src/config/movement.ts`): units turn before they drive. A sharp turn pivots in place and speed ramps up as the heading lines up
  with the route. Cosmetic: wheeled vehicles spin each wheel with their speed (the sides counter-rotate when
  pivoting), steer the front wheels into turns, nod forward when stopping, lift the nose when starting
  and lean outward in corners.
- Moving Workers, Combat Buggies, Tanks and Rockets kick up dust from both rear contact points: heavy
  and slow for the Tank, light and quick for the Buggy, restrained for Worker and Rocket. Dust stops
  when a vehicle stops, never comes from vehicles hidden in fog, and freezes while paused.
- Tank and Combat Buggy turrets swivel independently of the hull toward the visible target of an
  attack or engaged attack-move order (or the last shot fired), at a capped turn speed, and ease back
  to hull-forward when there is none. The hull's heading is unaffected.
- Each shot recoils the barrel and eases it home; the muzzle flash and projectile now leave the barrel.
- Combat Buggy and infantry hits are drawn as short bursts of tracers (3-5, slightly scattered; `burst` in `config/combatEffects.ts`). It is only visual: each hit still deals its normal single-hit damage.
- A Rocket launch throws back-blast smoke behind the tubes. The missile flies a lofted arc with an exhaust flame, a hot glow and a smoke trail, and lands in a fireball with a shockwave ring, sparks and dark rising smoke. Tuned in `config/combatEffects.ts` (`rocket`).
- A destroyed vehicle produces a flash, ground shockwave, sparks, fragments, a fire burst and rising
  smoke, and leaves a scorched, non-interactive wreck that fades out after a few seconds. Destruction
  in fog is not shown. Infantry and buildings keep the simple death ring.

### Infantry and FPV squads

Both are still one entity each (one health pool, selection, order, footprint, production item and
save/multiplayer entity); the visible soldiers are presentation only, tuned in `src/config/squad.ts`:

- **Compact toy proportions.** About 0.53 tiles tall (`standHeightTiles`; roughly 31% shorter than the original 0.77): short, sturdy
  bodies, no neck, oversized helmets, big boots and chunky equipment, in the Meridian palette recoloured
  per owner.
- **Squad sizes.** Infantry shows four riflemen in two staggered ranks; FPV Operators show three
  specialists (controller, drone case, radio mast) with their drone prop ahead of them.
- **Health-driven casualties.** The visible count is `ceil(health fraction x squad size)`: Infantry
  4 above 75% health, 3 above 50%, 2 above 25%, 1 above 0; FPV 3 above 2/3, 2 above 1/3, 1 above 0. A
  living squad always shows at least one member, and the lead (first slot) is the last to fall. Crossing a
  threshold plays a brief tip-over, sink and fade (no gore, no persistent bodies). A restored save, an
  online snapshot, or a squad coming out of fog shows the right count immediately. Nothing is
  gameplay: no per-soldier health, damage distribution, healing or reduced squad damage.
- **Rifle fire.** Each Infantry shot is taken by the next soldier still standing (never a casualty),
  with a small fast arms/rifle recoil. The flash and tracer start at that soldier's actual rifle muzzle (a
  `SoldierN_Muzzle` node in the model) and the tracer is thin and quick. FPV Operators have no rifle:
  their rocket-style effect leaves the drone, and they still attack only while deployed.

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

### Infantry and FPV squad studies

`scripts/blender/create_meridian_infantry.py` (four compact riflemen) and
`scripts/blender/create_meridian_fpv_operators.py` (three specialists plus the drone) are run the same
way as the tank, with the script path swapped. Both build on the shared "compact toy soldier" helpers
in `scripts/blender/meridian_common.py`, so the two squads keep one set of proportions (about 1.06 Blender
units tall, scaled to `standHeightTiles`, 0.53 tiles). Outputs go to `assets/models/meridian-infantry-squad/` and
`assets/models/meridian-fpv-operators/` as `.blend`, `.glb` and `preview.png`. Each soldier is a
`SoldierN` / `OperatorN` pivot with `_Body`, `_Arms` (both arms and the rifle or equipment) and
`_LegLeft` / `_LegRight` pivots for the walk cycle; each rifleman's `_Arms` also holds a `_Muzzle`
empty at the rifle's tip, and the FPV study holds `FPVDrone`. Materials follow the tank's naming
(`Uniform · deep teal`, `Armor · light panels`, `TeamColor`).

The game loads `src/assets/models/meridian-infantry-squad.glb` and `meridian-fpv-operators.glb` once
per match and bakes one prototype per soldier (body, arms, two legs, muzzle offset), recoloured per
owner, in formation-slot order. The procedural soldier is the fallback while a model loads or if loading
fails. After regenerating, copy each `.glb` into `src/assets/models/`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/blender/create_meridian_infantry.py
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/blender/create_meridian_fpv_operators.py
cp assets/models/meridian-infantry-squad/meridian-infantry-squad.glb src/assets/models/
cp assets/models/meridian-fpv-operators/meridian-fpv-operators.glb src/assets/models/
```

Keep the Blender slot positions in step with `SQUAD_ROLES` in `src/config/squad.ts` when changing a
formation (the game places soldiers from the config, not from the study); the generators take the
slots in tiles and convert them with `SOLDIER_TILES_PER_UNIT`, which must match `standHeightTiles`.

### Buildings

`scripts/blender/create_meridian_{hq,barracks,factory,power_plant,resource_depot,unmanned_systems_center}.py`
generate the six building models (shared helpers in `meridian_building_common.py`): a stepped plinth,
armoured hall or drum, vents, pipes, lit windows, door and ramp, drawn to the menu thumbnails. The game
loads each `.glb` the first time that building appears, scales it to its footprint (less a 0.1 tile
margin) and recolours the `deep teal`, `light panels` and `TeamColor` materials per owner. The
procedural model in `src/game/models/buildings.ts` is the fallback while it loads. After regenerating,
copy each `.glb` into `src/assets/models/`:

```sh
for n in hq barracks factory power_plant resource_depot unmanned_systems_center; do
  /Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python scripts/blender/create_meridian_$n.py
done
for n in hq barracks factory power-plant resource-depot unmanned-systems-center; do
  cp assets/models/meridian-$n/meridian-$n.glb src/assets/models/
done
```
