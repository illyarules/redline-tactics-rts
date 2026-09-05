# Build log

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
