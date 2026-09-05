# World and visuals

## The map

"Open Field" is a 64 x 64 grid defined entirely as typed data in `src/config/map.ts`:

- **No obstacles at all.** Every tile in bounds is passable ground; only the map edges stop a unit,
  and `regions` is deliberately empty. The rock and water terrain kinds still exist in the types for
  later maps.
- **Two bases on opposite edges.** One sits against the west edge and one against the east edge at
  the same height, each with a base area, an HQ footprint inside it and a rally point on the side
  facing the middle.
- **Two resource fields**, one just outside each base on the side facing the middle, equally far
  from their owner's rally point.
- **A wide, empty centre.** Twenty tile-wide columns between the two fields hold nothing at all, so
  the middle of the map is open ground both sides have to cross.

The layout is 180-degree rotationally symmetric, so both starts are equivalent. One tile is 30 world
pixels; that is a rendering value only — every balance number is expressed in tiles, or tiles per
second.

## Visual direction

The concept in `assets/concepts/open-field-map-render.png` is art direction only; it is not used as a texture.

A perspective 3D field seen from a high angled top-down camera: steep enough that the battlefield
still reads like a map and units never hide behind each other, shallow enough that a building shows
the sides that give it its silhouette. North is up, exactly as the map data reads. The field is
muted olive green so that the two factions — the player in blue, the AI in orange — and the cyan
Credits crystals are the only saturated things on screen. Every model is original geometry: nothing
is imported, sampled or traced from any other game, and the concept image in `assets/concepts/` is
reference for the direction only, never a texture.

**Nothing on the field is an asset file.** Units and buildings are boxes and cylinders assembled in
`src/game/models/`, and most roles are merged into a single mesh per faction that `EntitiesView`
clones per entity, so a crowded field costs a handful of shapes each rather than a stack of parts.
`src/game/palette.ts` owns the two palettes both sides are built from — four planes plus a pennant
tone — and `src/game/materials.ts` caches one material per colour, so two parts painted the same
tone share one draw state.

- **Worker** — a small four-wheeled utility vehicle: lit cab in front, open bed carrying crystal.
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
tile reports as passable**. The field continues past the camera bounds without a lit border. Sparse grass, small painted stones and faded wheel tracks add scale without blocking movement. Each resource field is a grounded crystal deposit — an uneven dark stone bed, loose rocks and broken shard fragments around the base, and faceted prismatic shards of varied height, width, tilt and rotation, shading from a dark teal lower band into a bright, glowing cyan tip. `src/game/models/crystalField.ts` grows the same layout deterministically from the same map data every time; nothing about it is random per match.

A warm directional sun and cool hemispheric fill separate model faces with soft percentage-closer shadows. The opening camera uses a 58-degree pitch and fits roughly 26 tiles across on smaller desktop windows, up to the configured opening zoom. The HQ is selected on arrival.

The compact HUD shows configured starting Credits (900), selection health and status, disabled command buttons, and a read-only minimap of entities, resources and the camera footprint. Credits remain static until the economy is implemented.

Feedback is kept minimal at this stage:

- Selecting something draws a bright ring on the ground **under** it and shows a compact health bar
  above it. Anything damaged shows its bar whether or not it is selected.
- A selected entity's current order is marked where it points: a calm ring for Move, a warmer ring
  for AttackMove and Attack. The rule lives in `src/game/orderMarker.ts` and is tested without
  starting the renderer; Move orders drive it now; combat orders arrive with a later task.
