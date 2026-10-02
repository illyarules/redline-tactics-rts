# Build log

## Parallel AI military production

AI military production now begins as soon as a completed combat producer is operational, alongside
the remaining base build order. Before Factory production is available, Barracks may train the three
Infantry squads needed for an attack. Once a powered Factory is operational, normal composition keeps
two Infantry squads and directs later slots to rotating Tank and Rocket production; emergency defense
may exceed that cap. Unavailable types do not block another producer. Every eligible producer may queue
during the same strategic tick, while only living and queued combat units count toward the nine-unit
reinforcement target.

Normal development reserves the full cost of the next build-order structure that has not yet started,
so early units spend only surplus Credits. Construction still executes first on a shared decision tick,
defense may override the reserve, and Worker replacement remains ahead of routine military spending.
The three-unit attack threshold is composition-independent, so three Infantry are a valid first army.

Focused tests cover simultaneous producers, Factory variety, unavailable producers, early Infantry,
the exact construction reserve boundary, arbitrary three-unit attacks and the normal-income simulation.
The development readout labels its saved production cursor as a preference rather than a strict cycle.

## AI military production, scouting and attacks (Task 27)

Added typed Infantry → Tank → Rocket production, a nine-unit living-plus-queued target and a
configured arrival radius. The pure military planner and core executor share strategic ticks;
successful normal queue requests alone advance the persisted cycle. Military spending waits for
the Task 26 opening to finish, preserving its construction budget and ongoing gathering.

The first living combat unit scouts the published map start through Attack-Move. AI memory records
HQ coordinates only while its own fog reveals the HQ. Scout no longer bounces back to Produce.
Discovery plus the configured three-unit threshold launches Attack-Move at remembered coordinates;
matching routes and ongoing engagements survive later decisions. Defense/recovery execution remains
deferred to Task 28.

Moved hidden-target pursuit checks into core Attack and Attack-Move execution and supplied the same
fog predicate for human and AI commands, acquisition and retaliation. MatchScene only orchestrates.
Schema 9 adds validated cycle/coordinate memory; old snapshots use the existing fresh-match fallback.
The development-only readout includes cycle, army, discovery and the latest military action.

Deterministic renderer-free tests cover queue eligibility, costs/capacity, failed-request atomicity,
scout selection, fog memory, both players' hidden-target restrictions, route preservation, malformed
snapshots and a normal-income simulation from zero AI combat units through base completion and attack.
Verification: typecheck, 428 unit tests, 6 Playwright E2E tests and production build pass. Vite retains
its existing large-chunk warning.


## AI economy and deterministic build order (Task 26)

The AI now uses normal Worker gathering and paid construction to complete Barracks → Power Plant
→ Factory → Resource Depot. `core/aiEconomy.ts` separates read-only typed planning from execution
through `issueGatherOrder` and `startConstruction`. Each item waits for the previous completion;
only one construction site is pursued. The single opening Worker alternates income and building,
never interrupting a carried load. Missing funds or placement cause retries on later decision ticks.

`core/aiPlacement.ts` searches deterministic bounded square rings using normal placement validation,
excludes resource footprints, and ranks Depot candidates near an available reachable field. Search
radius and build order are typed config. Existing strategic transitions remain intact (HQ worker
production already satisfies the Task 25 production predicate), so the foundation plan continues
alongside subsequent strategic states; recovery actions remain deferred. No military orders or
unit queues are issued.

Snapshot schema 8 adds only the completed build-order index to persisted AI state; world orders,
sites, balances and resource reserves remain authoritative. Invalid indices are rejected and old
schemas use the existing fresh-match fallback. The development-only readout shows the next building.
Pure deterministic tests cover normal API execution, failure atomicity, placement, order, full-base
completion with Credit conservation, and snapshot restoration.

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

At the time of Tasks 13–17 fog of war had not landed, so `checkBuildingPlacement` did not check
"explored". Fog now exists, but placement still deliberately has no fog-state dependency and can be
confirmed on unexplored ground; this remaining shortcut is tracked in `known-shortcuts.md`.

## Task 28 — AI defense and recovery

Implemented configurable base threat/selection radii, a four-unit defense cap and deterministic
nearest-distance/entity-ID priority. The renderer-free defense planner issues normal, fog-validated
Attack and rally orders, retains identical commands and releases obsolete explicit defense orders.
Threats now interrupt develop/produce as well as scout/attack; infrastructure loss retains recovery
priority. No hidden entity can trigger defense or pass the existing shared combat fog predicate.

Recovery uses the existing gathering, placement and `startConstruction` APIs, rebuilding missing
Barracks, Power Plant, Factory and Resource Depot in that order. Opening progress is normalized
against completed structures; recovery exits only after configured infrastructure is complete.
New production/offense pauses while existing world jobs continue. HQ loss gates new strategic
actions, without an impossible rebuild or Task 29 defeat handling. No durable fields or schema bump
were needed; ongoing recovery restores through the existing schema-9 AI/world snapshot.

Added deterministic core tests for threat visibility/priority, capped living non-worker selection,
Attack/rally execution, unchanged commands, clean defense exit, hidden acquisition/retaliation,
HQ loss, blocked recovery and a full opening→destruction→rebuild simulation. The simulation checks
normal costs, zero initial site progress, one active site, ongoing income, prerequisite-safe order,
completion-gated recovery exit, resource conservation and mid-construction save/restore.

Verification: `npm run typecheck` passed; `npm test` passed all 437 tests in 38 files;
`npm run test:e2e` passed all 6 Chromium tests (local server required the approved sandbox
exception); `npm run build` passed with Vite's large-chunk warning. Recovery also remains active
if another threat appears before minimum infrastructure is complete. Defense restore and obsolete
assignment release have direct regression coverage. No `.env` files were read and no push was run.

## Task 29 — victory, defeat and clean match restart

Added renderer-independent lifecycle state for the active clock, per-owner successful production and
confirmed combat unit losses, plus the terminal result. Production now returns typed spawn events;
the scene batches confirmed killing hits before removal, counts unit deaths, and resolves HQ loss.
Player-HQ loss has explicit precedence if both HQs fall in one simulation frame. Once resolved, the
result cannot be changed or counted again.

Schema 10 persists and validates lifecycle state alongside the world, economy, fog and AI. Terminal
saves restore directly into a frozen battlefield and battle report. The terminal snapshot is written
once after killed entities are removed, then protected from autosave/pagehide rewrites. Play Again
and terminal Quit clear it before entering a fresh match or title; existing Pause and active-match
return-to-title behavior remains intact.

Added the HTML `MatchResultOverlay` with Victory/Defeat, active time, player and opponent unit totals,
Play Again and Quit to Title. Terminal entry disables simulation, all AI executors, camera, selection,
placement, map commands and Escape/Pause while Babylon continues rendering the final scene. Pure
lifecycle/snapshot/production tests and a real-control Playwright victory → terminal restore → clean
Play Again flow cover the new boundaries.

Final verification: `npm run typecheck` passed; `npm test` passed all 449 tests in 39 files;
`npm run test:e2e` passed all 7 Chromium tests in 25.3 seconds (the lifecycle flow took 24.0
seconds while sharing workers); `npm run build` passed with Vite's existing large-chunk warning.

### Task 29 follow-up — building elimination and ten-minute limit

Replaced HQ-only outcomes with post-destruction counts of all owned buildings. Completed and
incomplete structures both keep their owner alive; units do not. Player elimination is evaluated
before AI elimination, preserving Defeat precedence when both final buildings fall together.

Added typed `MATCH_CONFIG.matchDurationSeconds = 600`, a HUD countdown, Draw lifecycle/UI support and
deadline-capped simulation deltas. Each frame records/removes confirmed deaths, resolves elimination,
then resolves Draw only if the active clock reached 600 seconds without a winner. Schema 11 persists
the elapsed clock and Draw while rejecting saves produced under the former HQ-only semantics.

Follow-up verification: `npm run typecheck` passed; `npm test` passed all 455 tests in 39 files;
`npm run test:e2e` passed all 8 Chromium tests in 25.7 seconds; `npm run build` passed with Vite's
existing large-chunk warning. The complete browser suite remains well below three minutes.
