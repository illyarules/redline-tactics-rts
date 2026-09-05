# Mini Command — MVP Game Design

## High concept

Mini Command is an original 2D browser RTS about establishing a forward base, securing Credits, producing a combined-arms force, and destroying the enemy HQ. A full match should take 8–15 minutes and be understandable without a tutorial.

This MVP borrows only genre-level ideas. Its factions, names, silhouettes, colors, map, numbers, interface, and audiovisual identity must be original.

## MVP promise

The player can open the game, choose one of two factions, play one fixed skirmish against an AI, and reach a clear victory or defeat screen. There is no campaign or multiplayer.

## Match rules

- One human player and one AI opponent.
- Both begin with an HQ, one Worker, a small squad of Infantry, and starting Credits.
- Workers construct buildings and gather Credits from neutral resource fields.
- Buildings unlock and produce units.
- Destroying the opposing HQ wins immediately. Losing the player's HQ causes defeat.
- Match may be paused or restarted. No save/load is required.

Suggested starting balance values are provisional and live in config, not game logic.

## Match continuity

An unfinished single-player match automatically resumes after a browser page reload, using a
versioned snapshot saved locally in the browser. The player can explicitly start a `New Match`,
which clears the local snapshot and creates a fresh match instead of resuming.

- The save exists only in the current browser profile/device: no login, cloud save, cross-device
  sync, multiplayer state, or server storage exists.
- Saved data uses a versioned schema so future changes can tell an old save apart from a current one.
- An incompatible or corrupted saved snapshot is safely discarded and replaced with a fresh match
  rather than blocking play.

## Battlefield

One fixed, symmetric 64 × 64 tile map supports reliable testing and fair starts.

- A starting plateau/base area in opposite corners.
- One nearby resource field per player.
- Two contested resource fields near the center.
- Central obstacles create two or three navigable attack lanes.
- Ground terrain is passable; rocks, water, buildings, and map edges are blocked.
- The full map is larger than the viewport and supports camera pan and zoom.

Placeholder visuals should use original geometric silhouettes and a clear palette. The player uses cool cyan/blue; AI uses warm amber/red. Faction identity is communicated by shape and accent, not copied iconography.

## Factions

Both factions use the same roles and technology structure to keep scope controlled, but config modifiers make them feel different.

### Meridian Directorate

Disciplined, durable, and expensive.

- Units have approximately 10% more health.
- Units cost approximately 10% more.
- Tank is the faction's strongest conventional unit.

### Ember Collective

Fast production and mobility, with lighter armor.

- Unit production is approximately 15% faster.
- Mobile units move approximately 8% faster.
- Units have approximately 8% less health.

Exact values should be tuned only after the complete loop is playable.

## Economy

The only resource is **Credits**.

- A Worker gathers from a resource field, carries a fixed load, returns it to an HQ or Resource Depot, deposits it, and repeats.
- Resource fields contain a finite but generous amount. Contested fields matter in longer matches.
- Costs are paid when construction or production begins.
- Cancelling before completion refunds 75% to discourage free scouting/queue manipulation.
- No power grid, upkeep, supply cap, repairs, veterancy, or secondary resource in MVP.

Suggested initial values:

| Item | Cost | Build time |
|---|---:|---:|
| Worker | 150 | 8 s |
| Infantry | 100 | 6 s |
| Tank | 450 | 18 s |
| Rocket | 300 | 14 s |
| Barracks | 300 | 12 s |
| Factory | 700 | 22 s |
| Power Plant | 250 | 10 s |
| Resource Depot | 400 | 15 s |

Start with 900 Credits. Economy rates and costs are config values.

## Units

### Worker

- Gathers and returns Credits.
- Constructs every building.
- Can move but cannot attack.
- Automatically finds the nearest valid drop-off after gathering.

### Infantry

- Cheap, quick anti-light unit.
- Short-to-medium attack range and low durability.
- Produced at Barracks.

### Tank

- Durable direct-fire vehicle.
- Strong against buildings and other vehicles; slow firing.
- Produced at Factory.

### Rocket

- Fragile long-range support unit.
- High damage, slow projectile/cooldown, weak when approached.
- Produced at Factory.

Armor/damage categories can remain minimal: `light`, `armored`, and `structure`, with a small typed multiplier table.

## Buildings

### HQ

- Starting structure and victory target.
- Produces Workers.
- Accepts gathered Credits.
- Destruction ends the match.

### Barracks

- Produces Infantry.
- Requires an HQ.

### Factory

- Produces Tanks and Rockets.
- Requires a Barracks and an active Power Plant.

### Power Plant

- Satisfies the single binary power prerequisite for Factory production.
- Power is either available or unavailable; no capacity calculation or low-power simulation.

### Resource Depot

- Accepts Worker deliveries near remote fields.
- Does not produce units or shoot.

Buildings use a footprint grid. A placement preview is green when the footprint is passable, explored, inside the map, and does not overlap another object; otherwise it is red.

## Controls and orders

- Left-click selects one friendly unit/building.
- Left-drag box-selects friendly units.
- Shift + click/drag adds to selection.
- Number keys 1–9 assign/select control groups if time permits; this is a stretch feature, not required for MVP completion.
- Right-click ground issues Move.
- Right-click enemy issues Attack.
- Attack-move is activated with `A`, then left-clicked on the ground.
- `Escape` cancels placement/order mode or opens the pause overlay.
- Edge pan or WASD moves the camera; mouse wheel zooms within fixed limits.

Selection markers, health bars for damaged/selected entities, destination feedback, invalid-order feedback, and attack range feedback should be readable with placeholder art.

## Movement and pathfinding

- Use a tile/grid-based A* pathfinder over static terrain plus building footprints.
- Recalculate when a path becomes invalid, not every frame.
- Nearby units use lightweight separation/steering; perfect formations and collision-free crowds are out of scope.
- If a destination is blocked, select the nearest reachable tile within a small radius.
- Units may briefly overlap in dense groups if necessary for a playable MVP.

## Combat

- Units acquire targets within sight/attack rules, rotate or face them visually, attack on cooldown, and apply configured damage.
- Attack orders pursue the chosen target until it is destroyed, lost in fog, or unreachable.
- Attack-move travels toward a point, briefly engaging visible enemies along the route before continuing.
- Basic focus-fire and automatic retaliation are supported.
- Destroyed entities are removed after a short readable effect.
- No friendly fire, cover, elevation bonuses, accuracy simulation, status effects, garrisoning, crushing, or aircraft.

## Fog of war

Use three states per map cell:

- **Hidden:** never seen; terrain and entities concealed.
- **Explored:** terrain visible under a dark veil; current enemy entities concealed.
- **Visible:** terrain and currently present entities visible.

Friendly units and buildings reveal circular areas. Visibility may update several times per second instead of every frame. The AI may use its own visibility model; it must not target human entities it has not recently seen, though it may attack known locations.

## AI

One deliberately simple state-machine AI uses the same costs, production rules, and commands as the player.

States:

1. **Develop:** keep a Worker gathering; build missing prerequisites and a Resource Depot when affordable.
2. **Produce:** maintain a configurable mix of Infantry, Tanks, and Rockets.
3. **Scout:** send a small force toward contested fields or the last known player location.
4. **Attack:** when army value exceeds a threshold, attack-move toward the player HQ/known base.
5. **Defend:** temporarily redirect nearby combat units when its base is attacked.
6. **Recover:** rebuild essential production/economy structures when possible.

AI decisions run on a low-frequency timer. The AI receives no free units or Credits on normal difficulty. It may know fixed map resource locations, but not live hidden-unit positions.

## HUD and minimap

The HUD shows:

- Current Credits.
- Selected entities, health, and current order.
- Contextual action buttons for Build and Produce.
- Production queue and progress for the selected building.
- Power prerequisite status.
- Short control hints and transient status messages.

The minimap shows terrain, explored/visible regions, friendly units/buildings, visible enemies, resource fields, and the current camera rectangle. Clicking the minimap moves the camera. Detailed minimap orders are not required.

## Screens and flow

1. Title screen with Play and faction choice.
2. Loading/brief controls card.
3. Match.
4. Pause overlay with Resume, Restart, and Quit.
5. Victory/defeat overlay with elapsed time, units produced/lost, and Play Again.

## MVP completion checklist

The MVP is complete when a new player can, without developer tools:

- Start a match as either faction.
- Select units individually and by box, move them, attack, and attack-move.
- Gather Credits, place every building, and produce every unit.
- Navigate around terrain/buildings with acceptable group movement.
- Discover the map through fog of war.
- Face an AI that gathers, builds, produces, defends, and attacks.
- Win by destroying the enemy HQ or lose when their own HQ is destroyed.
- Read essential state in the HUD/minimap and restart cleanly.

## Explicitly out of scope

Multiplayer, backend, accounts, saves, campaign, story, cutscenes, map editor, procedural maps, mobile controls, gamepad, replay, multiple AI difficulties, advanced formations, naval/air units, superweapons, tech trees, upgrades, repairs, walls, capturing, audio voiceovers, localization, and polished commercial art.

