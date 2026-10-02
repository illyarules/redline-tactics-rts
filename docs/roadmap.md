# Post-MVP roadmap

This backlog begins after the MVP tasks in [`implementation-plan.md`](../implementation-plan.md).
Items are grouped by dependency rather than promised release dates.

The current desktop game has selectable Open Field (1v1) and Trident Basin (1v2 against allied AI),
a fixed Meridian-versus-Ember matchup, a fifteen-minute active-time limit, local saves, a read-only
minimap, ground units only and no defensive weapons. Start Game resumes a valid save or opens mode
selection; Multiplayer is disabled. Phones and tablets are blocked at entry because touch controls
and mobile layouts are not implemented.

## Maps and environment

- [x] Add Open Field's first environment pass: road, passable forest, and blocking mountain ridge.
- [ ] Add further map detail: water, shores and ruins.
- [x] Define Open Field forest/rock passability (forest currently has no vision modifier).
- [ ] Add map themes: Open Field, forest and river-crossing maps.
- [x] Add battlefield selection before a fresh match starts.
- [x] Add Trident Basin with two independent allied AI controllers and map-aware save/resume.
- [x] Define each map's starts, resources, terrain regions and lanes as typed data in `src/config/map.ts`.
- [x] Update AI scouting, construction and pathfinding to use the selected map.
- [ ] Add player-faction selection before a match starts.
- [ ] Add a dedicated theme model for further map themes.

## Combat expansion

- [ ] Add defensive structures such as a turret, cannon and anti-air emplacement.
- [ ] Define their cost, health, range, vision, cooldown, target categories and prerequisites.
- [ ] Add one initial aircraft unit.
- [ ] Add ground/air movement and target categories.
- [ ] Let aircraft bypass ground obstacles while retaining their own movement, vision and combat rules.
- [ ] Add anti-air weapons and make target compatibility explicit: ground, air or both.
- [ ] Extend AI production, attack and defense plans for defensive structures and aircraft.
- [ ] Add readable aircraft flight, shadow, projectile and impact effects.

## Mobile platform support

This is a new input and layout target, not a responsive styling pass. The current game is not
playable on a touch-only device.

- [ ] Define supported phone and tablet viewport sizes, orientations and browser requirements.
- [ ] Make the title screen, HUD, contextual panels, pause menu and battle report responsive to
  narrow screens and safe-area insets.
- [ ] Add touch selection, drag selection and contextual Move, Attack, Attack-Move, Gather and Build
  controls without relying on hover, right-click or keyboard input.
- [ ] Add touch camera navigation with pan and pinch-to-zoom gestures that do not conflict with unit
  selection or building placement.
- [ ] Make the minimap and action targets large enough for reliable touch input.
- [ ] Add mobile render-quality limits and verify acceptable performance, memory use and battery
  behavior on representative iOS and Android devices.
- [ ] Add focused end-to-end coverage for the critical touch journey: start, select, move, build,
  produce, attack, pause and restart.

## Multiplayer

- [ ] Choose the first multiplayer format: real-time PvP, hot-seat or asynchronous matches.
- [ ] For real-time PvP, introduce an authoritative server architecture.
- [ ] Make the deterministic shared simulation suitable for server execution.
- [ ] Add rooms, create/join match flows and state synchronization.
- [ ] Synchronize validated player orders rather than every unit's position each frame.
- [ ] Validate ownership, resources, visibility, pathfinding and cooldowns on the server.
- [ ] Add reconnection, surrender and disconnect handling.
- [ ] Add lobby UI, map/side choice, ready states and connection status.
- [ ] Add server/client integration and load tests.

## Recommended order

1. Expand map environments and add faction selection; battlefield selection is already implemented.
2. Add defensive structures and aircraft.
3. Add mobile layouts and touch controls once the expanded desktop interaction model is stable.
4. Begin multiplayer only after the single-player simulation and expanded combat rules are stable.
