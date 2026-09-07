# Source layout and module boundaries

Four areas, each with one responsibility. Imports may only flow **downward** in this list:

| Area | Contains | May import from |
|---|---|---|
| `game/` | Babylon scene, models, views, input, camera, effects | `ui`, `core`, `config`, Babylon |
| `ui/` | HUD and menu presentation | `core`, `config` |
| `core/` | Pure rules: state, commands, geometry, economy, combat, AI decisions | `config` |
| `config/` | Typed balance, faction and map data — data only, no behavior | `core` *types* only |
| `assets/` | Original artwork — files, not code | nothing |

Rules that keep the boundaries useful:

- **`core/` must never import Babylon, `game/` or `ui/`.** It is plain TypeScript so that rules can be
  tested without a browser or a running game loop. `tests/architecture.test.ts` enforces this.
- `core/` owns the authoritative entity state. Meshes in `game/` display that state and relay input;
  they do not decide costs, damage, prerequisites or victory.
- `config/` holds numbers and content records only, so balance can change without touching behavior.
  It may use `core`'s identifier and geometry **types** (`import type`) to stay strongly keyed, but it
  never imports runtime code from anywhere.
- Entities are referenced by a stable `EntityId` shared between `core/` state and rendered views.
- Player intent is expressed as typed commands (`Move`, `Attack`, `AttackMove`, `Build`, `Produce`)
  defined in `core/orders.ts`.

Current combat controls: idle combat units defend themselves; press `A`, then left-click passable
ground to issue Attack-Move. Those units pause for acquired enemies and resume toward the destination.

AI strategy and cadence live in `core/ai.ts`. `core/aiEconomy.ts` reads world facts to create typed
gather/construction intents and executes them through public core APIs. `core/aiPlacement.ts` owns
bounded deterministic placement search. `MatchScene` only orchestrates these modules after normal
simulation steps; economic rules do not live in the renderer. Only the completed build-order index
is added to AI persistence; construction progress and Worker orders stay in the world snapshot.
