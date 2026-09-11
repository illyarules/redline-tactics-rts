# Redline Tactics — Atomic Implementation Plan

## Current status

This is the original incremental build plan, not the authoritative description of the current game.
The plan is considered implemented. Later decisions superseded some early acceptance wording: the
current MVP has a fixed player faction and a read-only minimap, while faction/map selection and
minimap navigation belong to the post-MVP backlog. The disabled Move/Attack buttons in the tactical
HUD are visual shortcuts, not missing commands: Move and explicit Attack use right-click, Attack-Move
uses `A` plus left-click, and the working Build/Produce actions live in contextual panels.

For current behavior use [`docs/gameplay.md`](./docs/gameplay.md) and the source code. In particular,
Open Field currently has two resource fields, a passable southwest forest and a blocking northern
ridge; building placement does not require explored fog state, the player faction is fixed, and
victory requires eliminating every enemy building rather than only the HQ.

## How to use this plan

Give Claude Code exactly one numbered task at a time. Each task must leave the project runnable and must not pre-implement later tasks. Before starting, read `CLAUDE.md` and `game-design.md`. After each task, run the relevant tests, type check, and production build.

## Phase 1 — Walking skeleton

### 01. Scaffold the application

**Goal:** Create the smallest TypeScript + Babylon.js + Vite application.

**Acceptance criteria:**

- Package scripts exist for development, build, preview, test, and type checking.
- A Babylon.js scene opens in the browser and displays a plain background plus the title.
- TypeScript strict mode is enabled.
- Vitest is configured with one passing smoke test.
- No React, backend, database, or multiplayer dependency is added.

### 02. Add the project module boundaries

**Goal:** Establish typed folders/interfaces before gameplay grows.

**Acceptance criteria:**

- `config`, `core`, `game`, and `ui` areas exist with brief boundary documentation.
- Core entity IDs, owner IDs, positions, and order types are defined without Babylon.js imports.
- A dependency check confirms `core` does not import from `game` or Babylon.js.
- The app still renders and all checks pass.

### 03. Define typed faction and balance config

**Goal:** Represent all MVP units, buildings, and two factions as data.

**Acceptance criteria:**

- Worker, Infantry, Tank, Rocket, HQ, Barracks, Factory, Power Plant, and Resource Depot have typed config records.
- Costs, times, health, movement/vision, footprint, production options, and prerequisites are config values where applicable.
- Meridian Directorate and Ember Collective modifiers are represented without duplicating logic.
- Tests prove config keys are complete and all numeric gameplay values are valid and positive where required.

### 04. Load and render the fixed map

**Goal:** Display one deterministic 64 × 64 battlefield.

**Acceptance criteria:**

- The map defines passable ground, two starts, and two home resource fields. Open Field has no
  blocking terrain.
- Terrain and resource fields render with original placeholder graphics.
- Map bounds and blocked cells come from typed map data, not scattered constants.
- A pure test verifies starts/resources are on passable cells and paths between major lanes exist.

### 05. Add camera controls

**Goal:** Make the battlefield comfortably navigable.

**Acceptance criteria:**

- WASD and edge pan move the camera.
- Mouse wheel zoom is clamped to configured minimum and maximum values.
- Camera cannot leave map bounds.
- A small overlay lists these controls.

## Phase 2 — Entities and player control

### 06. Create the core world and entity lifecycle

**Goal:** Add a Babylon-independent source of truth for entities.

**Acceptance criteria:**

- The core world can create, retrieve, update, and remove units/buildings by stable ID.
- Entity state includes owner, type, position, health, and current order/status.
- Invalid types/owners are rejected through types or explicit validation.
- Unit tests cover creation, damage, death, and removal.

### 07. Render units and buildings from core state

**Goal:** Synchronize simple Babylon views with core entities.

**Acceptance criteria:**

- The initial HQ and one of every mobile role for both players render in distinct owner colors and
  role shapes.
- View objects follow core position/health and disappear when the core entity is removed.
- Rendering code does not calculate damage, cost, or prerequisites.
- A debug label can expose entity type/ID during development.

### 08. Implement single selection

**Goal:** Select one friendly entity by left-click.

**Acceptance criteria:**

- Left-click selects the topmost friendly entity under the pointer and clears the previous selection.
- Clicking empty ground clears selection.
- Enemy entities cannot be selected as controllable units.
- A visible selection marker and basic name/health readout appear.

### 09. Implement box and additive selection

**Goal:** Select practical groups of friendly units.

**Acceptance criteria:**

- Left-drag shows a selection rectangle and selects friendly units inside it.
- Buildings are excluded from a multi-unit box result.
- Shift-click and Shift-drag add/remove entities consistently.
- Selection is pruned when entities die.

### 10. Implement direct movement orders

**Goal:** Move selected units to clicked ground.

**Acceptance criteria:**

- Right-click on ground creates typed Move orders for selected mobile friendly units.
- Units travel at configured speed and stop within a defined tolerance.
- A destination marker confirms the order.
- Buildings and enemy units never receive player movement orders.
- Pure tests cover order creation and arrival state transitions.

### 11. Add grid A* pathfinding

**Goal:** Route units around static obstacles.

**Acceptance criteria:**

- A pure A* module returns a valid route through passable cells or an explicit no-path result.
- Units follow routes around map obstacles.
- A blocked destination resolves to a nearby reachable cell within a configured radius.
- Tests cover straight, detour, blocked-destination, and unreachable cases.

### 12. Add lightweight group separation

**Goal:** Keep small groups readable while moving.

**Acceptance criteria:**

- Multiple selected units receive nearby destination slots rather than one identical point.
- Local separation reduces persistent exact overlap.
- Units do not get pushed onto blocked terrain.
- A 20-unit move remains responsive and reaches the destination area.

### 12.5. Add local browser match persistence

**Goal:** Persist the current single-player match locally across page reloads.

**Acceptance criteria:**

- A typed, versioned snapshot can serialize and restore the current world state without Babylon.js objects.
- The snapshot includes all state currently needed to resume faithfully: entity IDs; owner/faction/type;
  positions; health; facing; current status; active orders; movement routes and current waypoint, if
  present; and current selection when useful.
- The snapshot is stored in `localStorage` after meaningful world changes, with debouncing so it is not
  written every frame.
- Reloading the page restores a valid snapshot instead of recreating the opening setup.
- `New Match` clears the local snapshot and recreates the normal opening setup.
- Invalid, stale, corrupted, or incompatible snapshots fail safely and start a fresh match.
- Pure tests cover serialize → deserialize → restore, schema version rejection, corrupted data
  rejection, and new-match clearing.
- No backend, account, network call, or external persistence dependency is added.

## Phase 3 — Economy and construction

### 13. Implement Credits accounts and transactions

**Goal:** Create deterministic resource rules.

**Acceptance criteria:**

- Each player has a Credits balance initialized from config.
- Pure operations can afford, spend, earn, and refund Credits without negative balances.
- Failed spending does not mutate state.
- Unit tests cover all transaction paths and 75% cancellation refund rounding.
- Extends the local match snapshot from Task 12.5 to cover Credits balances.

### 14. Implement Worker gather/return loop

**Goal:** Make Workers generate Credits through visible activity.

**Acceptance criteria:**

- Ordering a Worker to a field starts travel, timed gathering, carrying, return, deposit, and repeat.
- HQ and Resource Depot are valid drop-offs.
- Field amount and Worker carried amount update visibly.
- Depleted fields stop yielding Credits and Workers enter a clear idle state.
- Pure tests cover state transitions, capacity, depletion, and deposit.
- Extends the local match snapshot from Task 12.5 to cover Worker gather state and field amounts.

### 15. Add building placement validation

**Goal:** Preview valid building footprints before construction.

**Acceptance criteria:**

- Selecting a Worker exposes build actions allowed by prerequisites.
- A chosen building follows the pointer snapped to the grid.
- Preview is green only when its full footprint is passable, in bounds, and does not overlap another
  building; otherwise red. Placement currently does not require explored fog state.
- Escape/right-click cancels placement without spending Credits.
- Pure validation tests cover each invalid reason.
- Extends the local match snapshot from Task 12.5 to cover any in-progress placement state worth resuming.

### 16. Implement building construction

**Goal:** Spend Credits and turn a valid placement into a completed structure.

**Acceptance criteria:**

- Valid placement spends the configured cost once and sends the Worker to the site.
- Construction progress advances only while the assigned Worker is present.
- Incomplete buildings are visibly distinct, occupy their footprint, and do not provide functions.
- Completion enables the building; cancellation/destruction clears occupancy and applies the configured refund rule.
- Tests cover cost, progress, completion, cancellation, and footprint cleanup.
- Extends the local match snapshot from Task 12.5 to cover construction progress and footprint occupancy.

### 17. Enforce prerequisites and binary power

**Goal:** Make the small technology chain meaningful.

**Acceptance criteria:**

- Barracks requires HQ; Factory placement/operation follows the design prerequisites.
- At least one completed Power Plant makes power available.
- Losing all Power Plants pauses Factory production and restoring power resumes it.
- HUD clearly explains unavailable actions.
- Pure tests cover prerequisite and power transitions.
- Extends the local match snapshot from Task 12.5 to cover power availability.

## Phase 4 — Production and combat

### 18. Implement production queues

**Goal:** Produce configured units from completed buildings.

**Acceptance criteria:**

- HQ queues Worker, Barracks queues Infantry, and Factory queues Tank/Rocket.
- Queueing spends Credits; only the front item progresses; completed units spawn at a nearby passable cell.
- Queue capacity is configured and full/insufficient-funds attempts fail visibly.
- Cancelling a queued item applies the refund rule.
- Pure tests cover queue order, timing, power pause, spawn request, and cancellation.
- Extends the local match snapshot from Task 12.5 to cover production queues and their progress.

### 19. Add health, damage, cooldown, and armor rules

**Goal:** Establish pure deterministic combat math.

**Acceptance criteria:**

- Attack eligibility uses owner, range, cooldown, and target category.
- Damage uses the typed armor multiplier table and cannot heal or reduce health below zero.
- Dead entities are reported for removal exactly once.
- Unit tests cover representative unit-vs-unit/building matchups and cooldown boundaries.
- Extends the local match snapshot from Task 12.5 to cover attack cooldown state.

### 20. Implement explicit Attack orders

**Goal:** Let selected combat units attack a clicked enemy.

**Acceptance criteria:**

- Right-clicking a visible enemy issues Attack to selected combat units.
- Attackers approach until in range, stop, and attack on cooldown.
- They stop or become idle if the target dies, becomes invalid, or cannot be reached.
- Worker and buildings reject unsupported attack orders.
- Shots, impacts, health bars, and death have simple readable feedback.
- Extends the local match snapshot from Task 12.5 to cover Attack orders.

### 21. Implement auto-acquisition and retaliation

**Goal:** Make idle units defend themselves naturally.

**Acceptance criteria:**

- Idle combat units acquire the nearest valid visible enemy within configured acquisition range.
- Damaged units retaliate when able unless carrying a higher-priority explicit order.
- Target scanning runs at a configured interval, not every entity every frame.
- Deterministic tests cover target preference and order priority.
- Extends the local match snapshot from Task 12.5 to cover acquired/retaliation targets.

### 22. Implement Attack-Move

**Goal:** Support the core combat movement command.

**Acceptance criteria:**

- Pressing A then left-clicking ground issues AttackMove and shows distinct feedback.
- Units move toward the destination, pause to fight acquired enemies, then resume.
- The order completes on arrival or becomes failed when unreachable.
- Tests cover travel → engage → resume → complete transitions.
- Extends the local match snapshot from Task 12.5 to cover AttackMove orders.

## Phase 5 — Information, opponent, and full match

### 23. Implement fog-of-war state

**Goal:** Track hidden, explored, and visible map cells as pure state.

**Acceptance criteria:**

- Friendly unit/building vision updates visibility at a configured low frequency.
- Previously visible cells become explored when vision leaves them.
- Enemy entities are queryable to the player only when currently visible.
- Tests cover reveal circles, overlapping vision, and visible-to-explored transitions.
- Extends the local match snapshot from Task 12.5 to cover explored/visible fog state.

### 24. Render fog of war

**Goal:** Communicate information boundaries clearly.

**Acceptance criteria:**

- Hidden cells fully conceal terrain detail/resources/enemies as designed.
- Explored cells show dim terrain but not current enemy entities.
- Visible cells show live state.
- Selection/attack orders cannot leak or target currently hidden enemies.
- Fog updates remain smooth during a representative match.
- Extends the local match snapshot from Task 12.5 as needed to keep resumed fog state consistent.

### 25. Build the AI state-machine shell

**Goal:** Add observable, timed AI states using normal commands.

**Acceptance criteria:**

- Develop, Produce, Scout, Attack, Defend, and Recover states exist with explicit transitions.
- Decisions run on a low-frequency configured timer with seeded randomness where needed.
- AI actions go through the same spend/build/produce/order APIs as the player.
- A debug-only readout/log shows state changes.
- Tests cover key state transitions without Babylon.js.
- Extends the local match snapshot from Task 12.5 to cover the AI's current state and timers.

### 26. Make AI economy and build order functional

**Goal:** Have the AI gather and establish its production base.

**Acceptance criteria:**

- AI keeps at least one Worker gathering when possible.
- It builds missing Barracks, Power Plant, Factory, and an economical Resource Depot using valid placement.
- It does not receive free Credits or ignore costs/prerequisites.
- Given a deterministic simulation window, a test verifies it reaches a functioning production base.
- Extends the local match snapshot from Task 12.5 to cover the AI's build-order progress.

### 27. Make AI produce and attack

**Goal:** Turn the AI economy into recurring military pressure.

**Acceptance criteria:**

- AI produces a configured Infantry/Tank/Rocket mix.
- It scouts when the player base is unknown and attacks when army value reaches a threshold.
- It uses AttackMove/Attack through normal command APIs and does not target live hidden positions.
- In a deterministic scenario, it launches an attack within a configured maximum time.
- Extends the local match snapshot from Task 12.5 to cover the AI's army/attack-timer state.

### 28. Add AI defense and recovery

**Goal:** Prevent the opponent from becoming inert after disruption.

**Acceptance criteria:**

- Base damage triggers Defend and redirects a bounded nearby force.
- Destroyed essential economy/production structures trigger Recover when affordable.
- Defense has an exit condition and cannot permanently block production/attacks.
- Tests cover defend entry/exit and recovery priority.
- Extends the local match snapshot from Task 12.5 to cover the AI's defend/recover state.

### 29. Implement victory, defeat, and clean restart

**Goal:** Complete the match lifecycle.

**Acceptance criteria:**

- Eliminating the AI's final building produces victory; losing the player's final building produces
  defeat exactly once. Simultaneous elimination is defeat, and a ten-minute active-time limit produces
  a draw only when neither elimination result applies.
- End overlay shows result, elapsed time, units produced, and units lost.
- Play Again/restart creates a fresh deterministic match without duplicated handlers, timers, entities, or stale selection.
- Quit returns to the title screen.
- Pure tests cover terminal-state precedence and statistics.

## Phase 6 — Interface and stabilization

### 30. Complete the contextual HUD

**Goal:** Expose all decisions without developer tools.

**Acceptance criteria:**

- HUD shows Credits, selection summary, health, current order, build/produce actions, queue/progress, and power status.
- Disabled actions show a concise reason such as cost, prerequisite, power, or queue full.
- UI clicks do not issue map commands beneath the panel.
- HUD remains readable at the minimum supported viewport.

### 31. Implement the minimap

**Goal:** Provide strategic awareness.

**Acceptance criteria:**

- Minimap shows terrain, resources, fog, friendly entities, visible enemies, and camera rectangle.
- Hidden enemies never appear.
- The MVP minimap is read-only; navigation is tracked as post-MVP work.
- Updates are throttled enough to remain smooth.

### 32. Add title, pause, and controls

**Goal:** Make the game approachable from first launch.

**Acceptance criteria:**

- Title screen offers Start Match; the player is Meridian and the AI is Ember.
- Escape opens a pause overlay with Resume, Restart, and Quit; simulation stops while paused.
- A concise controls card is accessible before/during play.

### 33. Add essential feedback and audio placeholders

**Goal:** Improve clarity without expanding mechanics.

**Acceptance criteria:**

- Orders, invalid actions, insufficient Credits, production completion, damage, destruction, and match result have distinct feedback.
- Any sounds/assets are original, generated for the project, or clearly licensed and documented.
- Volume/mute is available if audio is included.
- No commercial-game assets, names, or recognizable imitations are present.

### 34. Balance one complete match

**Goal:** Tune the existing loop to an 8–15 minute match.

**Acceptance criteria:**

- Both factions can gather, tech, produce every unit, and defeat the AI.
- Normal AI launches meaningful pressure without free resources.
- No single unit obviously invalidates all others in several manual matches.
- Changes are limited to config values unless a reproducible logic bug is found.
- A short balance note records tested match length and major config changes.

### 35. Performance and lifecycle pass

**Goal:** Keep a representative late match smooth and leak-free.

**Acceptance criteria:**

- A scenario with 50–100 active units remains acceptably smooth on a current desktop browser.
- Profiling identifies any changed hotspot; optimization is narrowly targeted.
- Restarting five times does not multiply input handlers, timers, or persistent views.
- No recurring console errors appear during a full match.

### 36. Final MVP verification and release build

**Goal:** Prove the promised experience works from a clean checkout.

**Acceptance criteria:**

- Install, test, type-check, and production-build instructions work from a clean environment.
- The complete checklist in `game-design.md` is manually verified.
- README documents controls, scope, browser requirements, asset licenses, and how to run/build.
- All automated tests pass and production output loads without development-only dependencies.
- Known non-blocking limitations are listed without adding post-MVP features.

## Optional only after task 36

Control groups, improved formations, richer effects/audio, an additional map, difficulty settings, and accessibility improvements may be planned after the MVP is complete. They are not acceptance criteria for any task above.
