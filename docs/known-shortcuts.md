# Known shortcuts

Marked in the source as `TODO(post-MVP)`:

- Models are cloned per entity rather than GPU-instanced. Cloning shares geometry and materials and
  is well inside the 50–100 unit target; instancing is a change to make after profiling asks for it.
- The camera clamp treats the visible ground as a rectangle the width of the view at the point the
  camera aims at. The far corners of the frustum are slightly wider than that, so a little ground
  past a map edge can show at the top corners of the screen; the field is drawn past its own edge so
  that this is never an empty void.

TODO(post-MVP): connect Credits to the future economy, enable command buttons with their gameplay, and add minimap navigation. Grass and small stones remain painted detail; models remain static low-poly geometry.
