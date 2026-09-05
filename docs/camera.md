# Camera

The camera pans, zooms and stays over the map. It can never be rotated, rolled or flown: Babylon's
own camera input is never attached, and the camera is placed each frame from pure state.

That state is still the one the game has always used — a centre on the map plus a `zoom`, the number
of screen pixels one world pixel covers across the middle of the view — so the rules in
`src/core/cameraControl.ts` are unchanged by the move to 3D:

- Panning covers a fixed number of screen pixels per second, so it feels the same at every zoom, and
  diagonal panning is not faster than straight panning.
- Zoom is clamped to the range in `src/config/camera.ts`, and never zooms out past the point where
  the map stops filling the window.
- The view can never leave the map: it stops at each edge, and an axis wider than the map is centred.

`src/core/camera3d.ts` adds only what perspective needs. A tilted camera sees further into the map
than it is tall, by a factor that depends on the pitch and field of view alone, so the rules above
are handed an *effective viewport* whose visible size is the real ground footprint. The footprint is
also asymmetric — the camera sees further beyond the point it aims at than in front of it — so the
view centre stays the centre of what the player sees and the camera aims slightly past it. Both are
pure functions with focused tests in `tests/core.camera3d.test.ts`.
