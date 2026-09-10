# Redline Tactics — Current Game Design

## High concept

Redline Tactics is an original 3D browser RTS about establishing a forward base, securing Credits,
producing a combined-arms force, and eliminating the enemy base. A match has a ten-minute active-time
limit and should be understandable without a tutorial.

This MVP borrows only genre-level ideas. Its factions, names, silhouettes, colors, map, numbers, interface, and audiovisual identity must be original.

## MVP promise

The player can open the game, play a fixed skirmish as the Meridian Directorate against the Ember
Collective AI, and reach a clear victory, defeat, or draw report. There is no faction selection,
campaign, or multiplayer.

## Match rules

- One human player and one AI opponent.
- Both begin with an HQ, one Worker, one Infantry, one Tank, one Rocket, and starting Credits.
- Workers construct buildings and gather Credits from neutral resource fields.
- Buildings unlock and produce units.
- Eliminating every opposing building wins; losing every player-owned building causes defeat.
- Incomplete construction sites count as surviving buildings. Units alone cannot keep a side alive.
- If both sides lose their final building in one simulation frame, Defeat takes precedence.
- If neither side is eliminated within ten minutes of active simulation time, the match is a Draw.
- The match may be paused or restarted and is automatically persisted in local browser storage.

Suggested starting balance values are provisional and live in config, not game logic.

## Match continuity

An active or completed single-player match resumes after a browser page reload, using a versioned
snapshot saved locally in the browser. `New Match` and `Play Again` clear the local snapshot before
creating a fresh match; quitting a completed report to the title also clears it.

- The save exists only in the current browser profile/device: no login, cloud save, cross-device
  sync, multiplayer state, or server storage exists.
- Saved data uses a versioned schema so future changes can tell an old save apart from a current one.
- An incompatible or corrupted saved snapshot is safely discarded and replaced with a fresh match
  rather than blocking play.

## Battlefield

The current build uses one fixed, 180-degree rotationally symmetric 64 × 64 tile map, Open Field.

- A starting base area sits at the west and east edges.
- One finite home resource field sits near each base; there are no contested fields.
- The center is a wide, empty approach with no configured terrain obstacles.
- Every in-bounds terrain tile is currently passable; buildings and map edges block movement.
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

These values remain provisional until the dedicated balance pass is complete.

## Economy

The only resource is **Credits**.

- A Worker gathers from a resource field, carries a fixed load, returns it to an HQ or Resource Depot, deposits it, and repeats.
- Each of the two resource fields contains 3,000 Credits.
- Costs are paid when construction or production begins.
- Cancelling before completion refunds 75% to discourage free scouting/queue manipulation.
- No power grid, upkeep, supply cap, repairs, veterancy, or secondary resource in MVP.

Current configured values:

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

- Starting structure; losing it alone is not terminal while another owned building survives.
- Produces Workers.
- Accepts gathered Credits.
- Satisfies the HQ prerequisite for new construction while it remains alive.

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

Buildings use a footprint grid. A placement preview is green when the footprint is passable, inside
the map, and does not overlap another building; otherwise it is red. The current placement rule does
not require the footprint to be explored.

## Controls and orders

- Left-click selects one friendly unit/building.
- Left-drag box-selects friendly units.
- Shift + click/drag adds to selection.
- Control groups are not implemented.
- Right-click ground issues Move.
- Right-click enemy issues Attack.
- Attack-move is activated with `A`, then left-clicked on the ground.
- `Escape` cancels placement/order mode or opens the pause overlay.
- Edge pan or WASD moves the camera; mouse wheel zooms within fixed limits.

Selection markers, health bars for damaged/selected entities, destination markers, attack tracers,
impact flashes, and destruction effects make issued orders and combat results readable.

## Movement and pathfinding

- Use a tile/grid-based A* pathfinder over static terrain plus building footprints.
- Routes are calculated when an order is issued; pursuit routes are recalculated as moving targets
  require it.
- Nearby units use lightweight separation/steering; perfect formations and collision-free crowds are out of scope.
- If a destination is blocked, select the nearest reachable tile within a small radius.
- Units may briefly overlap in dense groups if necessary for a playable MVP.

## Combat

- Units acquire targets within sight/attack rules, rotate or face them visually, attack on cooldown, and apply configured damage.
- Attack orders pursue the chosen target until it is destroyed, lost in fog, or unreachable.
- Attack-move travels toward a point, briefly engaging visible enemies along the route before continuing.
- Basic focus-fire and automatic retaliation are supported.
- Destroyed entities are removed and leave a short readable effect.
- No friendly fire, cover, elevation bonuses, accuracy simulation, status effects, garrisoning, crushing, or aircraft.

## Fog of war

Use three states per map cell:

- **Hidden:** never seen; terrain and entities concealed.
- **Explored:** terrain visible under a dark veil; current enemy entities concealed.
- **Visible:** terrain and currently present entities visible.

Friendly units and buildings reveal circular areas, recomputed four times per second. The AI has its
own visibility state and cannot acquire or pursue currently hidden entities. It remembers the player
HQ's last visible coordinates and may attack-move toward that stale location.

## AI

One deliberately simple state-machine AI uses the same costs, production rules, and commands as the player.

States:

1. **Develop:** keep a Worker gathering; build missing prerequisites and a Resource Depot when affordable.
2. **Produce:** maintain a configurable mix of Infantry, Tanks, and Rockets.
3. **Scout:** send the first available combat unit toward the configured player start or last known
   player-HQ location.
4. **Attack:** once the player base is known and the combat-unit count reaches its threshold,
   attack-move toward the remembered location.
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
- A compact always-visible control hint.

The read-only minimap shows explored/visible terrain, friendly entities, visible enemies, resource
fields, and the current camera rectangle. Minimap navigation and orders are not implemented.

## Screens and flow

1. Title screen with Start Match. The player's faction is currently fixed to Meridian.
2. Match with an always-visible compact controls hint.
3. Pause overlay with Resume, New Match, and Return to Title.
4. Victory/defeat/draw report with active time, units produced/lost, Play Again, and Quit to Title.

## MVP completion checklist

The MVP is complete when a new player can, without developer tools:

- Start a match as the fixed Meridian faction against the Ember AI.
- Select units individually and by box, move them, attack, and attack-move.
- Gather Credits, place every building, and produce every unit.
- Navigate around buildings with acceptable group movement; the current map has no blocking terrain.
- Discover the map through fog of war.
- Face an AI that gathers, builds, produces, defends, and attacks.
- Win by eliminating every enemy building, lose when every owned building is eliminated, or draw at
  the ten-minute active-time limit.
- Read essential state in the HUD/read-only minimap and restart cleanly.

## Explicitly out of scope

Multiplayer, backend, accounts, cloud saves, campaign, story, cutscenes, map editor, procedural maps,
mobile controls, gamepad, replay, multiple AI difficulties, advanced formations, naval/air units,
superweapons, tech trees, upgrades, repairs, walls, capturing, audio voiceovers, localization, and
polished commercial art.
