# Post-MVP roadmap

This backlog begins after the MVP tasks in [`implementation-plan.md`](../implementation-plan.md).
Items are grouped by dependency rather than promised release dates.

## Maps and environment

- [ ] Add map detail: forests, water, shores, rocks, ruins and roads.
- [ ] Define terrain rules for passability and vision; for example, water blocks ground units and
  forests may affect visibility.
- [ ] Add map themes: Open Field, forest and river-crossing maps.
- [ ] Add map selection before a match starts.
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

1. Complete MVP stabilization tasks 30–36.
2. Add map environment and map selection.
3. Add defensive structures and aircraft.
4. Begin multiplayer only after the single-player simulation and expanded combat rules are stable.
