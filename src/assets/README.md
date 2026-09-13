# assets/

Original artwork made for this project. Nothing here is imported, sampled, traced or adapted from
any other game, and nothing here is under a third-party licence.

## Audio

Audio is organized by playback role under `audio/`:

- `menu/` contains the main-menu playlist. A random track is selected on initial load and whenever
  the player returns from a match.
- `match/` is where future match music files belong. Import their URLs in `config/audio.ts` and add
  them to `AUDIO_CONFIG.matchMusic.tracks`; the match player handles random ordering and repeats.
- `effects/` is for sound effects registered in `AUDIO_CONFIG.soundEffects`.
- `audio/ui/` contains the compact enabled and muted artwork used by the global audio toggle.

## 3D artwork

Since the renderer moved to Babylon.js, **every model on the field is geometry built in code**, not
a file:

- Units and buildings are boxes and cylinders assembled by `game/models/units.ts` and
  `game/models/buildings.ts`, merged into one mesh per role and faction.
- The battlefield surface is painted into a texture by `game/groundTexture.ts`.
- Resource crystals are built per field by `game/MapView.ts`.
- The two faction palettes and the neutral machinery tones live in `game/palette.ts` — one palette
  per side, substituted into one set of models, which is why the two factions cannot drift apart.

```text
sprites/
  units/      worker, infantry, tank, rocket
  buildings/  hq, barracks, factory, powerPlant, resourceDepot
```

The SVGs above are the **2D plan-view artwork from before the move to 3D**. They are kept because
they are original work and a useful reference for each role's silhouette, but nothing imports them
and they are not part of any build. Delete them if the 2D direction is not coming back.

The repository's `assets/concepts/` folder, outside `src/`, holds visual reference for the art
direction. It is reference only: no concept image is loaded, rendered or sampled by the game, and
nothing is traced from one.
