# Redline Tactics — Current Game Design

## High concept

Redline Tactics is an original 3D browser RTS about establishing a forward base, securing Credits,
producing a combined-arms force, and eliminating the enemy bases. A match has a fifteen-minute active-time
limit and should be understandable without a tutorial.

This MVP borrows only genre-level ideas. Its factions, names, silhouettes, colors, map, numbers, interface, and audiovisual identity must be original.

## MVP promise

The player can open the desktop game, choose Open Field (1v1) or Trident Basin (1v2), play as the
Meridian Directorate against Ember Collective AI, and reach a victory, defeat, or draw report. There is no faction selection,
campaign, or multiplayer.

## Match rules

- One human player and one AI opponent on Open Field, or two allied AI opponents on Trident Basin.
- Each participant begins with an HQ, one Worker, one Infantry, one Tank, one Rocket, and starting Credits.
- Workers construct buildings and gather Credits from neutral resource fields.
- Buildings unlock and produce units.
- Eliminating every opposing building wins; losing every player-owned building causes defeat.
- Incomplete construction sites count as surviving buildings. Units alone cannot keep a side alive.
- If both sides lose their final building in one simulation frame, Defeat takes precedence.
- If neither side is eliminated within fifteen minutes of active simulation time, the match is a Draw.
- In 1v2, every building belonging to both AI owners must be eliminated; enemy statistics are aggregated.
- The match may be paused or restarted and is automatically persisted in local browser storage.

Suggested starting balance values are provisional and live in config, not game logic.

## Match continuity

After a reload, Start Game resumes a valid active or completed match from a local schema-13 snapshot,
including the selected map and the second AI controller on Trident Basin. `New Match` and `Play Again`
open battlefield selection; `Start Match` clears the old save and creates the selected match.
Quitting a completed report to the title also clears its save.

- The save exists only in the current browser profile/device: no login, cloud save, cross-device
  sync, multiplayer state, or server storage exists.
- Saved data uses a versioned schema so future changes can tell an old save apart from a current one.
- An incompatible or corrupted saved snapshot is not resumed; the player can start a fresh match.

## Battlefield

The current build offers two maps. Open Field is an asymmetric 64 × 64 battlefield:

- A starting base area sits at the west and east edges.
- One finite home resource field sits near each base; there are no contested fields.
- A restrained worn road crosses the spacious center and branches toward both bases and resources.
- A sparse southwest forest is passable and has no speed, combat, or vision modifier.
- A connected rocky ridge spans the north. Rock is impassable to ground units and invalid for
  building placement, but open routes preserve access between every strategic location.
- The full map is larger than the viewport and supports camera pan and zoom.

Trident Basin is an 80 × 80 battlefield with the human base in the southwest and two allied AI
bases in the northeast and southeast. Three home fields contain 4,200 Credits each, and a central-west
contested field contains 2,400. Forest pockets are passable; broken rock ridges shape three connected
approaches. There are no water barriers. Both maps are typed definitions in `src/config/map.ts`.

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
- Open Field has two 3,000-Credit home fields; Trident Basin has three 4,200-Credit home fields and one 2,400-Credit contested field.
- Costs are paid when construction or production begins.
- Cancelling before completion refunds 75% to discourage free scouting/queue manipulation.
- No power grid, upkeep, supply cap, repairs, veterancy, or secondary resource in MVP.

Base configured values before faction modifiers:

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
- Shift + click/drag toggles selection.
- Control groups are not implemented.
- Right-click ground issues Move.
- Right-click enemy issues Attack.
- Attack-move is activated with `Q`, then left-clicked on the ground. `A` pans the camera.
- `Escape` cancels placement/order mode or opens the pause overlay.
- Edge pan, WASD or arrow keys move the camera; mouse wheel or +/− zoom within fixed limits.

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

Each AI commander has an independent state machine and uses the same costs, production rules, and
commands as the player. The two AI commanders on Trident Basin belong to the same enemy team.

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

1. Title screen with Start Game: resume a valid save or open mode selection. Phones and tablets are blocked.
2. Mode selection with Single Game and disabled Multiplayer, followed by battlefield selection and Start Match.
3. Match with an always-visible compact controls hint. The player's faction is fixed to Meridian.
4. Pause with Resume, New Match, Settings, and Quit to Main Menu. Quit confirms Save and Quit, Quit Without Saving, or Cancel.
5. Victory/defeat/draw report with active time, units produced/lost, Play Again, and Quit to Title.

The mode screen offers a persistent audio mute toggle; Pause settings expose audio controls. The
start page is silent, and menu music starts after entering mode selection. Entering a match switches
the audio manager to its configured match playlist.

## MVP completion checklist

The MVP is complete when a new player can, without developer tools:

- Start a match as the fixed Meridian faction against the Ember AI.
- Select units individually and by box, move them, attack, and attack-move.
- Gather Credits, place every building, and produce every unit.
- Navigate around buildings and the northern mountain ridge with acceptable group movement.
- Discover the map through fog of war.
- Face an AI that gathers, builds, produces, defends, and attacks.
- Win by eliminating every enemy building, lose when every owned building is eliminated, or draw at
  the fifteen-minute active-time limit.
- Read essential state in the HUD/read-only minimap and restart cleanly.

## Explicitly out of scope

Multiplayer, backend, accounts, cloud saves, campaign, story, cutscenes, map editor, procedural maps,
mobile controls, gamepad, replay, multiple AI difficulties, advanced formations, naval/air units,
superweapons, tech trees, upgrades, repairs, walls, capturing, audio voiceovers, localization, and
polished commercial art.
