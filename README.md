# Mini Command

A small, original browser RTS built with TypeScript, Babylon.js and Vite.

Design and scope live in [`game-design.md`](./game-design.md); the task-by-task build order lives in
[`implementation-plan.md`](./implementation-plan.md).

## Requirements

- Node.js 20+
- A current desktop browser with WebGL 2 (mouse and keyboard)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |

## Current state

The application boots a single Babylon.js scene that renders the fixed battlefield, "Open Field", in
three dimensions and lets you look around it from a high angled RTS camera. The game title, the
controls card and the selection readout sit in an HTML layer above the canvas, so no camera movement
can scale them. Gameplay systems are added incrementally by the tasks in the implementation plan.

Both bases stand on the map. Each player starts with an HQ and one of each mobile role — Worker,
Infantry, Tank and Rocket — and the view opens on the player's own base. The starting units support selection and direct right-click movement. Combat, economy and AI arrive in later tasks.

An unfinished match survives a browser reload on the same device: units mid-route resume their
route, and the selection is restored too. The `New Match` button in the top-right corner clears the
local save and reloads into the normal fresh opening. Local saves are not synchronized, transferable,
or backed by any server — see `implementation-plan.md`'s Task 12.5 for scope.

Left-click selects one friendly unit or building. Dragging on ground selects every friendly unit in
the rectangle; buildings are excluded from box selection. Hold Shift to toggle one clicked unit or
every unit in a dragged rectangle. Every selected entity gets a ground ring, and the HUD summarizes
multi-unit selections. Clicking empty ground clears the selection; enemies are never selectable.
Right-click passable ground moves every selected friendly unit. Buildings, enemies, blocked terrain
and out-of-map destinations are rejected; right-clicking an entity does not issue a ground order.

`src/core/world.ts` holds the authoritative entity state: units and buildings keyed by a stable id,
each with an owner, faction, resolved stats, position, health, current order and status. It knows
nothing about Babylon, so entity rules can be tested without starting the game.
`src/core/matchSetup.ts` creates the opening position from `src/config/match.ts`, and
`src/game/EntitiesView.ts` mirrors the world into the scene: it creates a mesh when an entity
appears, follows its position and health, and disposes the mesh when the entity is removed. It reads
core state and decides nothing.

Picking happens in two passes, in the order a player expects. A click is first resolved against the
models themselves, so a click on a roof selects the building and a unit in front of another cannot be
clicked through. If nothing was hit, the same ray is followed down to the ground and handed to
`src/core/selection.ts`, which decides what a point on the field lands on — a unit is clickable
across the circle its `bodySizeTiles` describes, a building across its whole footprint. Both the
models and the hit test read one body size from `src/config/units.ts`, so what you see is what you
can click. A health bar appears above an entity while it is selected and whenever it is damaged.

## The map

"Open Field" is a 64 x 64 grid defined entirely as typed data in `src/config/map.ts`:

- **No obstacles at all.** Every tile in bounds is passable ground; only the map edges stop a unit,
  and `regions` is deliberately empty. The rock and water terrain kinds still exist in the types for
  later maps.
- **Two bases on opposite edges.** One sits against the west edge and one against the east edge at
  the same height, each with a base area, an HQ footprint inside it and a rally point on the side
  facing the middle.
- **Two resource fields**, one just outside each base on the side facing the middle, equally far
  from their owner's rally point.
- **A wide, empty centre.** Twenty tile-wide columns between the two fields hold nothing at all, so
  the middle of the map is open ground both sides have to cross.

The layout is 180-degree rotationally symmetric, so both starts are equivalent. One tile is 30 world
pixels; that is a rendering value only — every balance number is expressed in tiles, or tiles per
second.

## Visual direction

The concept in `assets/concepts/open-field-map-render.png` is art direction only; it is not used as a texture.

A perspective 3D field seen from a high angled top-down camera: steep enough that the battlefield
still reads like a map and units never hide behind each other, shallow enough that a building shows
the sides that give it its silhouette. North is up, exactly as the map data reads. The field is
muted olive green so that the two factions — the player in blue, the AI in orange — and the cyan
Credits crystals are the only saturated things on screen. Every model is original geometry: nothing
is imported, sampled or traced from any other game, and the concept image in `assets/concepts/` is
reference for the direction only, never a texture.

**Nothing on the field is an asset file.** Units and buildings are boxes and cylinders assembled in
`src/game/models/`, and each role is merged into a single mesh per faction that `EntitiesView`
clones per entity, so a crowded field costs a handful of shapes each rather than a stack of parts.
`src/game/palette.ts` owns the two palettes both sides are built from — four planes plus a pennant
tone — and `src/game/materials.ts` caches one material per colour, so two parts painted the same
tone share one draw state.

- **Worker** — a small four-wheeled utility vehicle: lit cab in front, open bed carrying crystal.
- **Infantry** — a figure on foot: helmet and visor over shoulders, rifle carried to one side.
- **Tank** — a low hull between two tracks, with a round turret and a barrel past the front.
- **Rocket** — a six-wheeled chassis carrying three raised tubes, cab in front of them.

The five buildings share one vocabulary: a walled base plate, body walls in the faction colour, a
dark overhanging roof cap with a lighter deck inset in it, small neutral machinery and one accent.
Their outlines differ — a hall, a stepped tower, a technical wing, an entrance ramp and a dish on the
HQ; a ridged hall with a porch on the Barracks; a wide hall with two stacks and a vehicle door on the
Factory; a reactor drum between cooling pipes on the Power Plant; a hopper over a delivery bay on the
Resource Depot — and each is drawn to fill the footprint its config gives it. Fronts face the camera,
because a door on the far side of a building is a door nobody sees.

The ground is a single plane carrying one baked texture: a barely-there tint per tile to say where
the grid is, then soft blotches at free positions to stop those tints reading as a checkerboard, and
a faint grid so distances can be judged by eye. It is decoration only — **it never changes what a
tile reports as passable**. The field continues past the camera bounds without a lit border. Sparse grass, small painted stones and faded wheel tracks add scale without blocking movement. Each resource field uses fewer, wider faceted cyan crystals on shallow mineral beds, with restrained glow at their bases.

A warm directional sun and cool hemispheric fill separate model faces with soft percentage-closer shadows. The opening camera uses a 58-degree pitch and fits roughly 26 tiles across on smaller desktop windows, up to the configured opening zoom. The HQ is selected on arrival.

The compact HUD shows configured starting Credits (900), selection health and status, disabled command buttons, and a read-only minimap of entities, resources and the camera footprint. Credits remain static until the economy is implemented.

Feedback is kept minimal at this stage:

- Selecting something draws a bright ring on the ground **under** it and shows a compact health bar
  above it. Anything damaged shows its bar whether or not it is selected.
- A selected entity's current order is marked where it points: a calm ring for Move, a warmer ring
  for AttackMove and Attack. The rule lives in `src/game/orderMarker.ts` and is tested without
  starting the renderer; Move orders drive it now; combat orders arrive with a later task.

## Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` | Pan the camera |
| Pointer at a screen edge | Pan the camera |
| Mouse wheel | Zoom in and out |
| Left-click an entity | Select one of your units or buildings |
| Left-drag ground | Select friendly units in the rectangle |
| Shift + left-click/drag | Toggle a friendly unit or drag selection |
| Left-click open ground | Clear the selection |
| Right-click ground | Move the selected friendly units |
| `` ` `` (backtick) | Toggle entity debug labels (type and id) |

A compact one-line version of this list sits in the bottom-left corner in game, and it grows as
later tasks add controls. Attack and attack-move are introduced by a later task.

The match opens zoomed in close, between the player's HQ and the resource field it will work first,
so the base, its opening squad and the Credits are all on screen from the first frame.

## The camera

The camera pans, zooms and stays over the map. It can never be rotated, rolled or flown: Babylon's
own camera input is never attached, and the camera is placed each frame from pure state.

That state is still the one the game has always used — a centre on the map plus a `zoom`, the number
of screen pixels one world pixel covers across the middle of the view — so the rules in
`src/core/cameraControl.ts` are unchanged by the move to 3D:

- Panning covers a fixed number of screen pixels per second, so it feels the same at every zoom, and
  diagonal panning is not faster than straight panning.
- Zoom is clamped to the range in `src/config/camera.ts`, and never zooms out past the point where
  the map stops filling the window.
- The view can never leave the map: it stops at each edge, and an axis wider than the map is centred.

`src/core/camera3d.ts` adds only what perspective needs. A tilted camera sees further into the map
than it is tall, by a factor that depends on the pitch and field of view alone, so the rules above
are handed an *effective viewport* whose visible size is the real ground footprint. The footprint is
also asymmetric — the camera sees further beyond the point it aims at than in front of it — so the
view centre stays the centre of what the player sees and the camera aims slightly past it. Both are
pure functions with focused tests in `tests/core.camera3d.test.ts`.

## Known shortcuts

Marked in the source as `TODO(post-MVP)`:

- Models are cloned per entity rather than GPU-instanced. Cloning shares geometry and materials and
  is well inside the 50–100 unit target; instancing is a change to make after profiling asks for it.
- The camera clamp treats the visible ground as a rectangle the width of the view at the point the
  camera aims at. The far corners of the frustum are slightly wider than that, so a little ground
  past a map edge can show at the top corners of the screen; the field is drawn past its own edge so
  that this is never an empty void.

TODO(post-MVP): connect Credits to the future economy, enable command buttons with their gameplay, and add minimap navigation. Grass and small stones remain painted detail; models remain static low-poly geometry.

## Direct movement and group selection (Tasks 09–10)

`src/core/movement.ts` validates Move requests and advances core positions at faction-resolved unit speed. Arrival within `src/config/movement.ts`'s 0.08-tile tolerance clears the order and returns the unit to idle without overshooting. A new valid right-click replaces the current destination; clearing selection does not stop movement. The cyan destination ring remains visible while any selected unit carries the group order, then disappears when the group arrives.

`src/core/selection.ts` owns box filtering, additive toggling and pruning without renderer imports. `SelectionController` tracks screen-space drags, projects unit centres through the Babylon camera, and reuses its picking ray for right-click ground coordinates. The render loop advances core movement before synchronizing meshes, headings, selection rings, health bars and the minimap. Unit headings turn at the configured maximum rate in core; model local `+Z` is core north, so the Babylon yaw follows that heading directly. The canvas suppresses the browser context menu.

Movement is routed: `src/core/pathfinding.ts` finds a route around buildings and blocked terrain rather than walking straight at a destination.

## Group formation and separation (Task 12)

A group right-click no longer sends every selected unit to the same exact point. `src/core/formation.ts`'s `issueGroupMoveOrders` lays the group out in a square/grid of destination slots centred on the clicked point — slot spacing is the widest selected unit's body size plus a configured gap, so the layout scales with what is actually selected. Each unit keeps the selected-order slot assigned to it and resolves its own slot to the nearest tile that is free, outside every building footprint, not already claimed by another unit in the same order, and reachable by `findPath` from where that unit stands; a unit whose slot cannot be resolved this way keeps its previous order untouched rather than being sent partway. A single selected unit skips all of this and calls `issueMoveOrders` directly, so solo Move orders behave exactly as before. The main destination ring marks `order.target` — the point actually clicked, shared by every unit in the group — rather than each unit's own resolved route target, so it stays put on the clicked point instead of jumping between units' individual slots as they arrive one-by-one; a small, fainter ring from the new `src/game/SlotMarkerView.ts` also appears at each moving unit's own resolved slot and disappears the instant that unit arrives or is deselected.

`src/core/separation.ts`'s `stepSeparation` runs once per frame, right after `stepMovement`, and nudges same-owner units apart only while both are actively moving and their bodies sit closer than their combined size plus a configured padding. It only ever adjusts `position` — orders, status and route progress are untouched, so `stepMovement` keeps driving waypoints unaware separation ran — and every adjustment is checked against map bounds, terrain and building footprints before being applied, discarded otherwise. It is a local, deterministic nudge, not a physics solver or global avoidance system, so brief overlap in a dense cluster is expected and acceptable.

## Local match persistence (Task 12.5)

`src/core/snapshot.ts` is a pure module that turns a live `World` into a typed, versioned
`WorldSnapshot` and back. `serializeWorld` walks every living entity in creation order and captures
just what a fresh `createWorld` cannot re-derive on its own: id, kind, type, owner, faction,
position, health, status, current order (routes, waypoint progress and all) and, per kind, a unit's
facing or a building's footprint top-left. Resolved stats and footprints are deliberately left out,
since both come back identically from `type` + `faction` + config. `restoreWorld` rebuilds a brand
new `World` from a snapshot through the same validating `createUnit`/`createBuilding` calls a fresh
match uses — so a corrupt save throws instead of being silently accepted — and remaps every id a
restored entity's order or the saved selection refers to through a table built while the entities are
(re)created, since a restored entity's id does not generally match its saved one. An order that
pointed at an entity which was not itself persisted (already dead at save time) restores as `null`
rather than failing the whole load.

`src/game/matchPersistence.ts` is the only place that touches `localStorage`: `loadSnapshot`,
`saveSnapshot` and `clearSnapshot` wrap every read and write in a guard that swallows storage and
parsing failures, so a missing, corrupt, or blocked save can only ever fall back to a fresh match,
never crash the render loop. `MatchScene` tries to restore from the saved snapshot when the scene is
built, and falls back to today's opening (`createWorld` + `populateStartingEntities`) on any failure,
clearing whatever bad data was there. `render()` autosaves on a timer (`PERSISTENCE_CONFIG`'s
`saveIntervalSeconds`, in `src/config/persistence.ts`) and again immediately on the browser's
`pagehide` event, so the very latest state before a reload or tab close is not lost waiting for the
next tick. The `New Match` control in `src/ui/newMatchButton.ts` sits in the top-right corner; it
clears the saved snapshot and reloads the page into the normal fresh opening.
