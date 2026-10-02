# World and visuals

## Battlefields

The battlefield selector offers Open Field (1v1) and Trident Basin (1v2). Both have typed definitions
in `src/config/map.ts`; `src/config/maps.ts` supplies menu descriptions and thumbnails. The selected
map determines starts, resources, terrain, routes and the number of AI controllers, and is saved
with the match. The player uses Meridian and the AI commanders use Ember.

### Open Field

"Open Field" is a 64 x 64 grid defined entirely as typed data in `src/config/map.ts`:

- **A connected northern ridge.** Overlapping rock regions form an irregular mountain chain across
  the north. Rock blocks ground movement and building placement, while routes around both ends and
  across the broad southern field keep all strategic locations connected.
- **A passable southwest forest.** Explicit `forest` regions form a recognizable woodland clear of
  the player base and west Credits field. Forest changes no movement speed, combat, or vision rule,
  and otherwise-clear forest remains valid construction ground.
- **Two bases on opposite edges.** One sits against the west edge and one against the east edge at
  the same height, each with a base area, an HQ footprint inside it and a rally point on the side
  facing the middle.
- **Two resource fields**, one just outside each base on the side facing the middle, equally far
  from their owner's rally point.
- **A spacious road crossing.** A subdued worn road follows the central lane, with narrow branches
  toward both rally points and resource fields; there are no bare dirt pads below buildings.

The scenery is intentionally asymmetric, while connectivity and equal access to each side's home
field preserve gameplay fairness. One tile is 30 world pixels; that is a rendering value only.

### Trident Basin

An 80 × 80 battlefield with the human base in the southwest and allied AI bases in the northeast
and southeast. Three home fields each contain 4,200 Credits; a contested central-west field contains
2,400. Passable forest pockets and blocking rock ridges shape northern, southern and central routes.
There are no water barriers. Each AI has its own economy and controller; victory requires destroying
all buildings belonging to both AI owners. Both maps use 30 world pixels per tile.

## Visual direction

Battlefield meshes and ground textures are generated from map data. The image
`assets/concepts/open-field-map-render.png` is used as the mode-selection background, and the
Open Field and Trident Basin minimap reference images are used as battlefield-selection thumbnails.

A perspective 3D field seen from a high angled top-down camera: steep enough that the battlefield
still reads like a map and units never hide behind each other, shallow enough that a building shows
the sides that give it its silhouette. North is up, exactly as the map data reads. The field is
muted olive green so that the two factions — the player in blue, the AI in orange — and the cyan
Credits crystals are the only saturated things on screen. Every model is original geometry: nothing
is imported, sampled or traced from any other game. Menu reference images are separate from the
procedurally rendered battlefield.

**Nothing on the field is an asset file.** Units and buildings are boxes and cylinders assembled in
`src/game/models/`, and most roles are merged into a single mesh per faction that `EntitiesView`
clones per entity, so a crowded field costs a handful of shapes each rather than a stack of parts.
`src/game/palette.ts` owns the two palettes both sides are built from — four planes plus a pennant
tone — and `src/game/materials.ts` caches one material per colour, so two parts painted the same
tone share one draw state.

- **Worker** — a compact four-wheeled tractor with an engine hood, semi-enclosed cab and front scoop.
- **Infantry** — one entity, three soldiers: a compact asymmetric triangle of low-poly figures (helmet,
  torso and legs, one carrying a rifle) sharing the entity's single health pool, order and selection
  ring. Legs and rifle arm swing in a small procedural walk cycle while the squad moves, with a tiny
  phase offset between soldiers so their steps never land together, and settle into a subtle idle sway
  once it stops — all driven by `EntitiesView`/`src/game/models/soldier.ts` from the entity's own
  status, never by `src/core`.
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
tile reports as passable**. It also carries the road, forest floor, and rocky ground transition, all
derived from `MapGrid`. Sparse faceted trees leave visible travel gaps in the southwest, while merged
low-poly peaks make the northern blocked footprint unmistakable. Scenery placement is deterministic,
non-pickable, collision-free, chunk-merged, and conservatively hidden or dimmed with three-state fog.
Each resource field remains a grounded cyan crystal deposit generated deterministically from map data.

A warm directional sun and cool hemispheric fill separate model faces with soft percentage-closer shadows. The opening camera uses a 58-degree pitch and fits roughly 26 tiles across on smaller desktop windows, up to the configured opening zoom. The HQ is selected on arrival.

The compact HUD shows the live Credits balance, power state, match countdown, selection health and
status, contextual build/production panels, disabled decorative command buttons, and a read-only
minimap of fog, entities, resources and the camera footprint.

Feedback is kept minimal at this stage:

- Selecting something draws a bright ring on the ground **under** it and shows a compact health bar
  above it. Anything damaged shows its bar whether or not it is selected.
- A selected entity's current order is marked where it points: a calm ring for Move, a warmer ring
  for AttackMove and Attack. The rule lives in `src/game/orderMarker.ts` and is tested without
  starting the renderer.
