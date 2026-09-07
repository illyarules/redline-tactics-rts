# Build log

## AI state-machine shell (Task 25)

`src/core/ai.ts` adds a pure, deterministic six-state AI shell: `develop`, `produce`, `scout`,
`attack`, `defend`, and `recover`. Its configurable one-second cadence is advanced solely from game
delta time, and a long frame walks every elapsed decision boundary in order. The observation derives
only simple core facts — completed production, combat-unit count, AI-visible player HQ, nearby
visible attackers, and required structures — while recovery overrides every other state and defense
overrides an ongoing attack. It emits only typed no-op decision hooks in this task; no credits, units,
orders, or player behavior are changed until the later AI economy/production/action tasks.

The snapshot schema is now version 7 and includes AI state, timer remainder, and last transition.
`MatchScene` restores or creates that state, steps it from the simulation loop, and shows a compact
read-only status panel only in Vite development builds. Pure tests cover cadence, ordered long-delta
steps, all main state paths and priorities, and snapshot restoration.

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

## Economy and construction (Tasks 13–17)

`src/core/economy.ts`'s `createEconomy` holds one Credits balance per player and is the only thing
that may change one: `spend` fails and leaves the balance untouched rather than going negative,
`earn` adds freely, and `refund` credits a rounded share of a paid cost from the configured
`cancelRefundFraction`. `src/core/resourceFieldState.ts` tracks each field's remaining Credits
separately from `MapGrid` (which stays a pure, static view of the map config) since the amount left
is match state, not map data. The local match snapshot now carries both alongside the entities it
always has (`WorldSnapshot.credits`/`resourceFields`, `SNAPSHOT_SCHEMA_VERSION` bumped to 2), plus a
Worker's `carriedCredits` and a building's `constructionProgress` per entity.

`src/core/gather.ts`'s `issueGatherOrder`/`stepGather` drive the whole Worker loop as one `Gather`
order with a `toField` / `gathering` / `toDropoff` phase: travel legs reuse `core/movement.ts`'s
`advanceAlongRoute` (pulled out of `stepMovement` for exactly this reuse) rather than duplicating
waypoint-following, the field is chosen once at order time, and the nearest living building with
`acceptsDeliveries` is re-resolved every return trip so a destroyed drop-off does not strand the load.
A depleted field sends the Worker idle instead of starting another cycle. Redirecting a Worker that is
still carrying an undelivered load to a new field deposits that load immediately rather than losing it
or silently keeping the old order.

`src/core/placement.ts`'s `checkBuildingPlacement` is the single source of truth for whether a
footprint could stand somewhere — in bounds, on passable ground, clear of every other building's
footprint (`constructing` or finished, both fully occupy it) — used both to colour the placement
preview and to gate `startConstruction`. `src/core/prerequisites.ts` and `src/core/power.ts` add the
tech-chain and binary-power rules on top: a building only counts toward a prerequisite once it is
alive and `constructionProgress` has reached 1, and power is available whenever at least one such
Power Plant is standing.

`src/core/construction.ts`'s `startConstruction` spends the cost exactly once, raises a `constructing`
building at 0 progress, and sends the assigned Worker there — its route avoids the *prospective*
footprint too, since the site does not exist as an occupancy-blocking building yet at routing time.
`stepConstruction` only advances progress while that specific Worker's `Build` order still names the
site and it has arrived; pulling the Worker off the job (or losing it) pauses progress rather than
resetting it. `cancelConstruction` refunds the same configured share `Economy.refund` uses, frees the
Worker, and removes the site, which clears its footprint occupancy immediately. Only one Worker is
ever tracked as "assigned" to a site — a second Worker sent to the same footprint has nothing to build,
since placement already rejects a footprint that is occupied.

`src/game/PlacementController.ts` is the only Babylon-facing piece: it tracks the pointer over the
ground, recolors a preview plane from `checkBuildingPlacement` every frame, and confirms or cancels on
click. Its pointer listeners sit on `window` in the capture phase specifically so a placement click
cannot also reach `SelectionController`'s own canvas listeners — same-element registration order does
not otherwise guarantee that. `src/ui/buildMenu.ts` shows one button per buildable role while a lone
friendly Worker is selected, disabled with a reason (missing prerequisite or unaffordable) read
straight from `checkPrerequisites`/`Economy.canAfford`. `EntitiesView` scales a `constructing`
building's height by its progress and dims it, so an incomplete site reads as unfinished rather than a
building that just happens to be doing nothing yet.

Fog of war does not exist yet (it lands with the vision task), so `checkBuildingPlacement` does not
check "explored" — every tile reads as valid ground on that front until then.
