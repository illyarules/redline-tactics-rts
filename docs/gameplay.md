# Gameplay

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
