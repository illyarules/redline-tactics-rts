# Known shortcuts

Marked in the source as `TODO(post-MVP)`:

- Models are cloned per entity rather than GPU-instanced. Cloning shares geometry and materials and
  is well inside the 50–100 unit target; instancing is a change to make after profiling asks for it.
- The camera clamp treats the visible ground as a rectangle the width of the view at the point the
  camera aims at. The far corners of the frustum are slightly wider than that, so a little ground
  past a map edge can show at the top corners of the screen; the field is drawn past its own edge so
  that this is never an empty void.

TODO(post-MVP): wire the decorative Move and Attack HUD buttons to explicit command modes, and add
minimap navigation. The same orders are already available through right-click and the `A` hotkey.
Grass and small stones remain painted detail; models remain static low-poly geometry.

Deliberate simplifications from the economy and construction tasks (13–17), none of them tagged
`TODO(post-MVP)` since each is either exactly matched to its task's scope or waits on a specific later
task, not the end of the MVP:

- `checkBuildingPlacement` does not receive fog state and therefore does not require a footprint to
  be explored, even though fog of war is now implemented.
- Exactly one Worker is ever tracked as "assigned" to a construction site — a second Worker cannot
  help build it faster. This falls out naturally from placement already rejecting an occupied
  footprint, not from an explicit cap.
- A construction site starts at full health and only its `constructionProgress` fraction changes as
  it is built. Once visible and in range, it can be targeted and damaged like any other building.
- A Worker with a full load that cannot find any reachable drop-off (every accepting building
  destroyed) waits holding it rather than dropping it on the ground; it retries every tick once a new
  drop-off exists.
