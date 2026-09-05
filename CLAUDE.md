# Mini Command — Claude Code Guide

## Product goal

Build a small, original browser RTS that captures the readable base-building loop of classic RTS games without copying names, factions, story, art, audio, maps, UI, or other protected material from existing games.

The first milestone is a complete, playable single-player match. Prefer a modest finished game over a flexible engine or broad feature set.

## Required stack

- TypeScript with strict type checking.
- Babylon.js for the game canvas, input, camera, meshes/models, and effects.
- Vite for development and production builds.
- React only if Babylon.js/HTML cannot keep a UI screen simple. Do not add React by default.
- Vitest for deterministic, pure game-logic tests.
- Browser only. Desktop mouse and keyboard are the primary input target.

## Hard scope limits

- Single-player skirmish against one AI opponent only.
- No backend, server, accounts, database, cloud sync, lobby, multiplayer, networking, ranking, analytics, or map editor.
- Local browser persistence through `localStorage` is allowed, limited to the current browser/device. No backend, server, accounts, database, cloud sync, analytics, multiplayer, lobby, or any other networked persistence is allowed.
- One fixed map, two original factions, one resource, four unit roles, five building roles.
- Use original placeholder shapes, colors, icons, names, and sounds. Do not import or imitate assets from Command & Conquer or any other commercial game.
- Do not add a feature unless the current implementation task explicitly asks for it.

## Engineering principles

1. Keep the game runnable after every task. `npm run dev`, `npm test`, and `npm run build` should remain valid once introduced.
2. Implement the simplest version that meets the acceptance criteria. Avoid speculative abstractions, ECS frameworks, dependency injection, plugins, and premature optimization.
3. Separate deterministic game rules from Babylon.js rendering where practical. Economy, costs, prerequisites, damage, cooldowns, production queues, victory rules, and AI decisions should be testable without starting Babylon.js.
4. Keep balance and content data separate from behavior. Put unit stats, building stats, faction modifiers, economy values, vision ranges, and AI timings in typed config modules.
5. Babylon.js objects display and relay state; they should not become the sole source of truth for important rules.
6. Prefer small modules with explicit types and one responsibility. Avoid global mutable state.
7. Use seeded or injectable randomness for logic that is tested.
8. Add focused Vitest coverage for new pure logic. Do not test Babylon.js internals or pixel output.
9. Preserve existing behavior outside the current task. Do not refactor unrelated code.
10. Document deliberate shortcuts with a brief `TODO(post-MVP)` only when useful; do not solve them during the MVP.

## Suggested boundaries

The exact file layout may evolve, but keep these concerns distinct:

```text
src/
  config/       typed balance and faction data
  core/         pure rules, state, commands, geometry, AI decisions
  game/         Babylon.js scenes, views, input, camera, effects
  ui/           HUD and menus
  assets/       original or clearly licensed assets
tests/          pure-logic tests, if not colocated
```

Use stable entity IDs between core state and rendered objects. Express player orders as typed commands such as `Move`, `Attack`, `AttackMove`, `Build`, and `Produce`.

## Definition of done for every implementation task

- All acceptance criteria for that task are met.
- The game still starts and the existing playable flow still works.
- Type checking and production build pass.
- Relevant tests pass; new pure rules have focused tests.
- No unrelated features, dependencies, or cleanup are included.
- Any controls or visible behavior introduced by the task are briefly documented in the project README once it exists.

## Gameplay priorities

When tradeoffs are necessary, prioritize in this order:

1. A match can be started, played, won, lost, and restarted.
2. Selection and orders feel immediate and understandable.
3. Economy, construction, production, and combat form a clear loop.
4. AI creates pressure without cheating excessively.
5. Readability and feedback.
6. Visual polish.

## Performance target

Target a smooth match on a current desktop browser with roughly 50–100 active units total. Simple grid/path caching and periodic AI/fog updates are acceptable. Do not build large-scale optimization systems before profiling demonstrates a need.

