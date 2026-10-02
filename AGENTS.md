# Redline Tactics — Engineering Guide

## Product goal

Build a small, original browser RTS that captures the readable base-building loop of classic RTS games without copying names, factions, story, art, audio, maps, UI, or other protected material from existing games.

The first milestone is a complete, playable single-player match. Prefer a modest finished game over a flexible engine or broad feature set.

## Required stack

- TypeScript with strict type checking.
- Babylon.js for the game canvas, input, camera, meshes/models, and effects.
- Vite for development and production builds.
- React only if Babylon.js/HTML cannot keep a UI screen simple. Do not add React by default.
- Vitest for deterministic, pure game-logic tests.
- Playwright for a small end-to-end suite covering the critical player journey only (see "End-to-end tests" below). Do not grow it into a broad UI-testing framework.
- Browser only. Desktop mouse and keyboard are the primary input target.

## Hard scope limits

- Single-player skirmish against one AI on Open Field or two allied AIs on Trident Basin.
- No gameplay backend, server, accounts, database, cloud sync, lobby, multiplayer, ranking, or map
  editor. Vercel Web Analytics is the only current networked integration.
- Local browser persistence through `localStorage` is limited to the current browser/device. No
  gameplay state or personal match data is persisted to a backend or synchronized between devices.
- Two selectable maps, two original factions (player fixed to Meridian), one resource, four unit roles, five building roles.
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
tests/
  unit/         pure-logic Vitest tests, if not colocated
  e2e/          Playwright end-to-end tests (see "End-to-end tests" below)
```

Use stable entity IDs between core state and rendered objects. Express player orders as typed commands such as `Move`, `Attack`, `AttackMove`, `Build`, and `Produce`.

## End-to-end tests

`tests/e2e/` holds a small Playwright suite covering only the critical player journey (title screen
and start, pause lifecycle, group selection/movement, save/reload persistence, combat, and
build/production). Keep it small, fast (well under 3 minutes total), and stable.

## Definition of done for every implementation task

- All acceptance criteria for that task are met.
- The game still starts and the existing playable flow still works.
- Type checking and production build pass.
- Relevant tests pass; new pure rules have focused tests.
- If the task touches a flow the E2E suite covers (start, pause, selection/movement, persistence, combat, build/production), `npm run test:e2e` still passes.
- If the task adds or changes any UI (a screen, menu, dialog, or HUD element), verify it visually against
  the running dev server using the Playwright MCP tools (navigate, click, screenshot) before reporting
  the task as complete — passing tests alone do not confirm the UI renders and behaves as intended.
- No unrelated features, dependencies, or cleanup are included.
- Any controls or visible behavior introduced by the task are briefly documented in the project README once it exists.
- Before reporting a task complete, inspect `artifacts/` and remove temporary screenshots, traces,
  and other files generated for that task. Keep only artifacts intentionally needed as project
  references or deliverables. Do not delete pre-existing or unrelated files without confirming
  their ownership and purpose.

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
