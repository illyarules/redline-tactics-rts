# Gameplay

## Current state

The desktop-only game opens on a title screen with Start Game. A valid saved match resumes directly;
otherwise Start Game opens mode selection. Single Game opens battlefield selection, while Multiplayer
is disabled. Open Field is a 64 × 64 1v1 map; Trident Basin is an 80 × 80 1v2 map against two allied
AI commanders. Select a battlefield and press Start Match. Phones and tablets cannot enter a match.

The selected battlefield renders in a Babylon.js scene under a high angled RTS camera. Menus,
controls and selection readouts sit in an HTML layer above the canvas. The player faction is fixed
to Meridian; both AI owners use Ember. Faction selection is not implemented.

Every participant starts with an HQ and one Worker, so every combat unit must come through normal
production. The view opens on the player's base and nearby Credits field. Combat is active; the AI
gathers Credits, builds its opening base, trains a deterministic army, scouts and launches attacks.

Open Field's forest tiles are normal passable ground for movement and construction and apply no
speed, combat, or vision modifier. The northern mountain ridge is `rock`: existing ground units
path around it and building placement rejects any footprint that overlaps it. Both starts retain a
ground route to both Credits fields and the opposing base.

Each player has a Credits balance, shown in the HUD, that starts from `src/config/economy.ts` and
never goes negative. Right-clicking a resource field with a Worker selected sends it to gather
instead of just walking there: it travels to the field, stands and gathers for a few seconds, carries
what it collected back to the HQ or a Resource Depot, deposits it as Credits, and repeats until the
field runs dry, at which point it goes idle. A mixed selection still sends any non-Worker units a
normal Move to the same point.

Left-click a currently visible crystal deposit to inspect its remaining Credits. The readout updates
as Workers gather and shows `0` and `Depleted` when the field is empty. The crystals retain their
original low profile when depleted, and the deposit remains clickable for inspection. Resource
amounts persist with the match. The exact amount is not shown while the field is outside current
vision.

Selecting a lone friendly Worker opens a small build menu next to its readout, with one button per
building role. A button is disabled with a tooltip explaining why when its prerequisites are unmet or
its cost is unaffordable right now — Barracks needs an HQ, the Factory needs a completed Barracks
*and* Power Plant. Clicking an enabled button starts placement: the building's footprint follows the
pointer, snapped to the grid, green while its full footprint is in bounds, on passable ground and
clear of every other building, red otherwise. Left-click on a green footprint spends the cost once and
sends the Worker to the site; right-click or Escape cancels without spending anything. A site under
construction stands shorter and a little translucent, rising to full height as the assigned Worker
finishes it — building progress only advances while that Worker is actually there. If another order
interrupts the Worker, select a Worker and right-click the unfinished friendly building to resume
from its existing progress without paying again. Losing every Power Plant pauses whatever in the tech
chain needs power (the HUD's power line turns red); completing a new one resumes it immediately.

Selecting a completed HQ, Barracks, or Factory opens its production panel. HQs queue Workers,
Barracks queue Infantry, and Factories queue Tanks or Rockets. Each building has a configured FIFO
queue: only its front item advances, and completion spawns the unit at a nearby passable tile. The
panel shows queue progress and capacity, explains full queues or insufficient Credits, and lets the
player cancel any paid entry for the normal 75% refund. Factory production pauses without a completed
Power Plant and resumes from the same progress when power returns.

An active or completed match can be resumed through Start Game after a browser reload on the same device: units mid-route resume
their route, the selection is restored, and a completed match reopens on its frozen battlefield with
the same battle report. From Pause, `New Match` opens battlefield selection, while
`Quit to Main Menu` opens a confirmation instead of leaving right away: `Save and Quit` persists the
match before returning to the title screen, `Quit Without Saving` discards it, and `Cancel` returns to
the unchanged live match. `Play Again` also opens battlefield selection. The prior save is cleared
when `Start Match` starts the selected battlefield; `Quit to Title` from the report clears the
completed save. The title screen's `Start Game` resumes a valid save or opens mode selection when
none exists. Local saves are not
synchronized, transferable, or backed by any server — see `implementation-plan.md`'s Task 12.5 for
scope.

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
states. Each AI controller follows this plan independently on Trident Basin.

Military planning in `core/aiMilitary.ts` shares the strategic cadence. After the opening is complete,
it pays for Infantry → Tank → Rocket in a strict repeating cycle, up to nine living plus queued units.
Barracks must be completed; Factories must also be powered. Blocked requests wait without cancelling
paid queues or advancing the cycle. This spending policy protects construction and keeps gathering active.

The first living AI combat unit scouts the map's published player-start tile using Attack-Move.
Only currently AI-visible HQ information updates remembered coordinates. Scout stays active while the
base is unknown; a remembered base and three combat units permit Attack. The army and reinforcements
use Attack-Move toward the remembered location, which can be stale after fog loss. Matching routes
and existing engagements continue; idle units within the configured arrival radius need no new route.
Acquisition, retaliation, explicit target commands and pursuit apply the same fog predicate to all
participants. Defense and recovery are implemented as described below.

Schema-13 `WorldSnapshot` persists the map ID, world and fog state, both AI controllers where present,
completed build-order indices, exact decision remainders, production-cycle indices, last-known base
coordinates and the match lifecycle clock/statistics/result. Older or invalid saves are not resumed;
the entry flow allows a fresh match. Queues, positions, orders and Credits remain solely in
world/economy data. The development-only AI readout shows strategy, cycle, army threshold, discovery
status and the latest military action.

Eliminating every AI-owned building across the enemy team ends the match in Victory; losing every player-owned building
ends it in Defeat. An HQ loss alone is not terminal while another owned structure remains, incomplete
sites count as surviving buildings, and units alone cannot keep a side alive. If both sides lose their
final building in one simulation frame, Defeat wins deterministically. On Trident Basin, destroying
one AI base is not enough while the other AI still has a building. The two AI owners are allied and
cannot target each other. Enemy production and loss totals are aggregated in the battle report.

The HUD counts down fifteen minutes of active simulation time from 15:00. Pause and terminal rendering do
not advance it. Confirmed deaths and the resulting surviving-building counts are processed before the
deadline, so eliminating the final enemy building exactly at 00:00 still wins; otherwise the match is
a Draw. The battlefield then freezes: simulation, AI decisions, camera, selection, placement, map
commands and Escape/Pause input all stop. The report shows the final active time and produced/lost unit
totals. Opening units are not production, and losses count only units removed by a confirmed killing
combat hit (never buildings, canceled sites or ordinary removals).

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
| `W` `A` `S` `D` or arrow keys | Pan the camera |
| Pointer at a screen edge | Pan the camera |
| Mouse wheel or `+` / `−` | Zoom in and out |
| `Q`, then left-click ground | Attack-Move with selected combat units |
| Left-click an entity | Select one of your units or buildings |
| Left-drag ground | Select friendly units in the rectangle |
| Shift + left-click/drag | Toggle a friendly unit or drag selection |
| Left-click open ground | Clear the selection |
| Left-click a visible crystal deposit | Show remaining Credits or depleted status |
| Right-click ground | Move the selected friendly units |
| Right-click a visible enemy | Order selected combat units to attack it |
| Right-click a resource field | Send the selected Worker(s) to gather it |
| Right-click an unfinished friendly building | Send the selected Worker to resume construction |
| Build menu button (Worker selected) | Start placing that building |
| Production panel button (completed producer selected) | Queue the named unit |
| Cancel in a production queue | Cancel that entry for a 75% refund |
| Left-click a valid (green) placement | Confirm it: spend Credits, send the Worker to build |
| Right-click, or `Escape`, during placement | Cancel placement; nothing is spent |
| `` ` `` (backtick) | Toggle entity debug labels (type and id) |

| `Escape` | Open or close Pause during a live match |
| `New Match` (Pause) or `Play Again` (battle report) | Open battlefield selection |
| `Quit to Title` (battle report) | Clear the completed save and return to the title screen |
| `Quit to Main Menu` (Pause) | Open a confirmation instead of leaving immediately |
| `Save and Quit` (quit confirmation) | Persist the match, then return to the title screen |
| `Quit Without Saving` (quit confirmation) | Discard the match, then return to the title screen |
| `Cancel` (quit confirmation) | Close the confirmation; the live match is unchanged |
| `Start Game` (title screen) | Resume a valid save, otherwise open mode selection |
| `Single Game` (mode selection) | Open battlefield selection |
| `Start Match` (battlefield selection) | Clear the prior save and start on the selected map |

During local development, open `/?debug=no-fog` to reveal the entire battlefield and all entities
for observation. This is a visual-only mode: selection, targeting, combat, AI knowledge, resource
inspection, fog persistence and every other gameplay rule continue to use authoritative fog of war.
The development AI status panel reports the current Credits balance for every AI commander.

A compact one-line version of this list sits in the bottom-left corner in game. Attack-Move is
available by pressing `Q` and then left-clicking passable ground; `A` pans the camera.

The match opens zoomed in close, between the player's HQ and the resource field it will work first,
so the base, its Worker and the Credits are all on screen from the first frame.

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

HQ is never a rebuild candidate. Its loss stops HQ-dependent AI actions, but the match continues while
another AI building survives; eliminating the final structure triggers the terminal freeze and
prevents any later AI economy, military or defense action.
Insufficient Credits, no available Worker or no valid site simply causes a later retry on the
one-second decision cadence while the match remains active.
