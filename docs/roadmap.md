# Post-MVP roadmap

This backlog begins after the MVP tasks in [`implementation-plan.md`](../implementation-plan.md).
Items are grouped by dependency rather than promised release dates.

The completed MVP baseline is desktop-only: one fixed, obstacle-free Open Field map, a fixed
Meridian-versus-Ember matchup, a read-only minimap, ground units only and no defensive weapons.
Phones and tablets are currently unsupported because core controls require a mouse and keyboard and
the interface is not laid out for a mobile viewport.

## Maps and environment

- [ ] Add map detail: forests, water, shores, rocks, ruins and roads.
- [ ] Define terrain rules for passability and vision; for example, water blocks ground units and
  forests may affect visibility.
- [ ] Add map themes: Open Field, forest and river-crossing maps.
- [ ] Add map and player-faction selection before a match starts.
- [ ] Move each map's starts, resource fields, obstacles and theme into a dedicated typed definition.
- [ ] Update AI scouting, construction and pathfinding to use the selected map.

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

1. Add map environment, map selection and faction selection.
2. Add defensive structures and aircraft.
3. Add mobile layouts and touch controls once the expanded desktop interaction model is stable.
4. Begin multiplayer only after the single-player simulation and expanded combat rules are stable.
