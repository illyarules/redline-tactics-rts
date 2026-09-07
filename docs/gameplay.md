# Gameplay

## Current state

The application boots a single Babylon.js scene that renders the fixed battlefield, "Open Field", in
three dimensions and lets you look around it from a high angled RTS camera. The game title, the
controls card and the selection readout sit in an HTML layer above the canvas, so no camera movement
can scale them. Gameplay systems are added incrementally by the tasks in the implementation plan.

Both bases stand on the map. Each player starts with an HQ and one of each mobile role — Worker,
Infantry, Tank and Rocket — and the view opens on the player's own base. The starting units support selection and direct right-click movement. Combat is active; the AI gathers Credits, builds its opening base, trains a deterministic army, scouts and launches attacks.

Each player has a Credits balance, shown in the HUD, that starts from `src/config/economy.ts` and
never goes negative. Right-clicking a resource field with a Worker selected sends it to gather
instead of just walking there: it travels to the field, stands and gathers for a few seconds, carries
what it collected back to the HQ or a Resource Depot, deposits it as Credits, and repeats until the
field runs dry, at which point it goes idle. A mixed selection still sends any non-Worker units a
normal Move to the same point.

Selecting a lone friendly Worker opens a small build menu next to its readout, with one button per
building role. A button is disabled with a tooltip explaining why when its prerequisites are unmet or
its cost is unaffordable right now — Barracks needs an HQ, the Factory needs a completed Barracks
*and* Power Plant. Clicking an enabled button starts placement: the building's footprint follows the
pointer, snapped to the grid, green while its full footprint is in bounds, on passable ground and
clear of every other building, red otherwise. Left-click on a green footprint spends the cost once and
sends the Worker to the site; right-click or Escape cancels without spending anything. A site under
construction stands shorter and a little translucent, rising to full height as the assigned Worker
finishes it — building progress only advances while that Worker is actually there. Losing every
Power Plant pauses whatever in the tech chain needs power (the HUD's power line turns red); completing
a new one resumes it immediately.

Selecting a completed HQ, Barracks, or Factory opens its production panel. HQs queue Workers,
Barracks queue Infantry, and Factories queue Tanks or Rockets. Each building has a configured FIFO
queue: only its front item advances, and completion spawns the unit at a nearby passable tile. The
panel shows queue progress and capacity, explains full queues or insufficient Credits, and lets the
player cancel any paid entry for the normal 75% refund. Factory production pauses without a completed
Power Plant and resumes from the same progress when power returns.

An unfinished match survives a browser reload on the same device: units mid-route resume their
route, and the selection is restored too. The `New Match` button in the top-right corner clears the
local save and reloads into the normal fresh opening. Local saves are not synchronized, transferable,
or backed by any server — see `implementation-plan.md`'s Task 12.5 for scope.

Left-click selects one friendly unit or building. Dragging on ground selects every friendly unit in
the rectangle; buildings are excluded from box selection. Hold Shift to toggle one clicked unit or
every unit in a dragged rectangle. Every selected entity gets a ground ring, and the HUD summarizes
multi-unit selections. Clicking empty ground clears the selection; enemies are never selectable.
Right-click passable ground moves every selected friendly unit. Buildings, enemies, blocked terrain
and out-of-map destinations are rejected. Right-clicking a visible enemy issues an explicit Attack
order to selected combat units: they path into weapon range, fire on their configured cooldown, and
stop when the target is gone or unreachable. Workers and buildings ignore attack requests. Brief
tracers, impact flashes, health bars and a loss ring make combat results readable.

`src/core/world.ts` holds the authoritative entity state: units and buildings keyed by a stable id,
each with an owner, faction, resolved stats, position, health, current order and status. It knows
nothing about Babylon, so entity rules can be tested without starting the game.
`src/core/matchSetup.ts` creates the opening position from `src/config/match.ts`, and
`src/game/EntitiesView.ts` mirrors the world into the scene: it creates a mesh when an entity
appears, follows its position and health, and disposes the mesh when the entity is removed. It reads
core state and decides nothing.

`src/core/ai.ts` holds the renderer-independent AI state machine. It evaluates only at the configured
cadence in `src/config/ai.ts`, choosing among Develop, Produce, Scout, Attack, Defend, and Recover
from a small observation of completed infrastructure, combat-unit count, AI visibility, and nearby
threats. Each decision tick also runs a pure economy plan and a core executor using normal gathering
and construction APIs. The opening order is Barracks, Power Plant, Factory, then Resource Depot;
each must finish before the next starts. The opening Worker alternates gathering and building,
waiting for real income when necessary. Placement stays within a configured base radius, excludes
resource tiles, and prefers a field-adjacent Depot. The existing HQ production predicate can advance
the strategic state before the foundation finishes, so this economic plan continues alongside later
states; recovery actions remain deferred.

Military planning in `core/aiMilitary.ts` shares the strategic cadence. After the opening is complete,
it pays for Infantry → Tank → Rocket in a strict repeating cycle, up to nine living plus queued units.
Barracks must be completed; Factories must also be powered. Blocked requests wait without cancelling
paid queues or advancing the cycle. This spending policy protects construction and keeps gathering active.

The first living AI combat unit scouts the map's published player-start tile using Attack-Move.
Only currently AI-visible HQ information updates remembered coordinates. Scout stays active while the
base is unknown; a remembered base and three combat units permit Attack. The army and reinforcements
use Attack-Move toward the remembered location, which can be stale after fog loss. Matching routes
and existing engagements continue; idle units within the configured arrival radius need no new route.
Acquisition, retaliation, explicit target commands and pursuit apply the same fog predicate to both
players. Dedicated defense and recovery execution remain Task 28.

Schema-9 `WorldSnapshot` persists state, completed build-order index, exact decision remainder,
production-cycle index and last-known base coordinates. Old or invalid saves start fresh. Queues,
positions, orders and Credits remain solely in world/economy data. The development-only AI readout
shows strategy, cycle, army threshold, discovery status and the latest military action.

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
| Right-click a visible enemy | Order selected combat units to attack it |
| Right-click a resource field | Send the selected Worker(s) to gather it |
| Build menu button (Worker selected) | Start placing that building |
| Production panel button (completed producer selected) | Queue the named unit |
| Cancel in a production queue | Cancel that entry for a 75% refund |
| Left-click a valid (green) placement | Confirm it: spend Credits, send the Worker to build |
| Right-click, or `Escape`, during placement | Cancel placement; nothing is spent |
| `` ` `` (backtick) | Toggle entity debug labels (type and id) |

A compact one-line version of this list sits in the bottom-left corner in game, and it grows as
later tasks add controls. Attack-move is introduced by a later task.

The match opens zoomed in close, between the player's HQ and the resource field it will work first,
so the base, its opening squad and the Credits are all on screen from the first frame.

### AI base defense and recovery (Task 28)

A visible enemy combat unit within eight tiles of the AI HQ triggers defense in any normal
strategic state. The AI selects up to four living combat units within 32 tiles of HQ, nearest
first with stable entity-ID ties. Workers are excluded. Threats use the same distance/ID ordering.
Defenders issue normal explicit Attack orders; unchanged orders retain their routes. Without a
visible target, selected units outside the two-tile arrival tolerance can rally via Attack-Move
(the normal route planner resolves the HQ footprint to reachable ground). Old explicit defense
assignments are released when selection changes or defense ends. Every acquisition, retaliation,
Attack and Attack-Move engagement uses the acting owner's fog visibility, including during pursuit.

Lost completed opening infrastructure takes priority over normal strategy and defense. Recovery
keeps the existing gathering planner active, pauses new military queues and offensive commands,
and rebuilds Barracks → Power Plant → Factory → Resource Depot. Only missing types are built;
prerequisites, Credits, placement, Worker travel and construction time all apply. One construction
job at a time is pursued. With the starting single Worker, gathering alternates with construction;
with an idle second Worker, gathering can continue during a build. Existing queues and valid builds
continue normally. Recovery waits for HQ and all four configured infrastructure types to be complete.

HQ loss stops new AI economy, military and defense actions. HQ is never a rebuild candidate. No
victory/defeat result or end-match UI is introduced; that remains Task 29. Insufficient Credits,
no available Worker or no valid site simply causes a later retry on the one-second decision cadence.
