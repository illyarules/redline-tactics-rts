# Playable private PvP epic

- Status: in progress
- Last updated: 2026-10-11
- Base branch: `feat/multiplayer-alpha`
- Source task: [Define the multiplayer architecture and first format](https://app.todoist.com/app/task/define-the-multiplayer-architecture-and-first-format-6hgGP99VfRj2Rr4G)
- Architecture reference: [Multiplayer architecture and first PvP format](./multiplayer-architecture.md)

## Objective

Turn the existing private multiplayer prototype into a complete and readable 1v1 match. A player
must be able to create or join a room, understand the battlefield, use the same RTS interaction and
gameplay vocabulary as single-player, finish the match, and recover from an ordinary page refresh.

The server remains authoritative. The browser renders filtered server state and submits player
intent; it never owns the online simulation. Single-player must continue to work without a server.

The target interface is the current PvP layout: a compact top status bar, a wide bottom command
area, selection and economy on the left, contextual actions in the center, and the minimap on the
right. The final shared HUD should apply this visual direction to both online and single-player
matches while retaining the information and controls each mode needs.

## First release scope

- Private invitation-only desktop matches for exactly two players.
- One Meridian mirror match on Open Field.
- One authoritative, long-running Node.js/WebSocket server.
- The existing Vercel deployment continues to serve the static client.
- The multiplayer server is deployed separately behind HTTPS/WSS.
- In-memory rooms and matches; no database or match history.
- Create, join, ready, play, reconnect after refresh, surrender, result, and return flow.
- The existing units, buildings, economy, construction, production, combat, fog, and victory rules.
- Shared map, models, camera, selection behavior, placement feedback, combat feedback, and HUD
  components where their behavior is identical.

## Out of scope

- Accounts, matchmaking, ranking, public room discovery, chat, spectators, and teams.
- Mobile or touch controls.
- Persistent rooms or recovery after a multiplayer server restart.
- Host migration, deterministic peer-to-peer lockstep, and client-authoritative simulation.
- New maps, factions, units, buildings, balance changes, or single-player AI changes.
- Deployment of the server as a Vercel serverless function.

## Branch and review workflow

Continue all remaining tasks in `codex/online-shared-battlefield`. Each task below must produce its
own commit and be reviewed before the next task begins. When the epic is accepted, merge the branch
into `feat/multiplayer-alpha`. Do not combine unrelated cleanup with an epic task.

Every task must leave the repository runnable and satisfy the project Definition of Done in
`AGENTS.md`. UI tasks require a live visual check. After a task is complete, stop for product
validation before starting the next task.

## Current implementation state

| Item | Status | Branch / commit | Result |
|---|---|---|---|
| Multiplayer foundation | Merged into epic base | `feat/multiplayer-alpha` / `9e8d709`, `56265ae` | Authoritative server, private room flow, filtered snapshots, core commands, reconnect, playable prototype HUD |
| Task 1 — shared battle presentation | Complete, awaiting merge | `codex/shared-battle-presentation` / `9378b46` | Shared Babylon scene, terrain, entities, fog, camera, effects, and battle view state |
| Task 2 — online shared battlefield | Complete, awaiting merge | `codex/online-shared-battlefield` / `2fc5985` | `OnlineMatch` renders server snapshots through the shared battlefield instead of prototype primitives |
| Task 3 — shared battle interaction | Complete and validated | `codex/online-shared-battlefield` / `cc613ce` | Shared selection, contextual orders, attack-move, and building placement preview |
| Task 4 — shared PvP-style tactical HUD | Complete and validated | `codex/online-shared-battlefield` / `b8582b0` | One presentation-only HUD for both modes, with mode-specific status and lifecycle controls |
| Task 5 — online command feedback and interpolation | Complete, awaiting validation | `codex/online-shared-battlefield` | Buffered visible movement, local command status, shared order markers, and safe resync reset |
| Tasks 6–7 | Not started | — | Must be implemented and validated one at a time |

## Epic acceptance criteria

1. Two desktop browsers can create or join a private room, become ready, and start exactly one
   authoritative match.
2. Both players see the shared Open Field terrain, production-quality models, local-viewer colors,
   fog of war, camera behavior, selection feedback, effects, and minimap.
3. Both players can select groups and issue every supported command: move, attack, attack-move,
   gather, build, resume construction, produce, cancel production, and set entrenchment.
4. Construction, economy, production, combat, destruction, surrender, timeout, and victory are
   decided by the server and displayed consistently to both players.
5. The HUD follows the preferred PvP layout and exposes the same information and contextual actions
   in online and single-player matches.
6. A page refresh restores the same seat and current filtered match view while the server is alive.
   A disconnect, rejected command, or unavailable server produces a clear player-facing state.
7. No filtered snapshot, effect, acknowledgement, error, or UI state reveals hidden enemy data.
8. Single-player start, play, save, resume, win/loss, and restart behavior remains intact.
9. The client still deploys on Vercel as a static Vite application. Production multiplayer uses a
   separately configured WSS endpoint and an origin-restricted server deployment.
10. Unit, integration, E2E, typecheck, lint, and production build checks required by the affected
    code pass. The complete two-player journey is visually validated from both seats.

---

## Task 1 — Extract a shared battle presentation

**Status:** Complete in `codex/shared-battle-presentation` at `9378b46`.

### Description

Extract the rendering-facing parts of `MatchScene` into a reusable presentation that accepts a
read-only battle view. Keep simulation ownership, save behavior, input, and single-player lifecycle
inside the existing single-player flow.

The shared presentation owns the Babylon scene, terrain, entity views, fog view, camera, combat
effects, and mapping between rendered meshes and stable entity IDs.

### Acceptance criteria

- Single-player renders through `BattlePresentation` with no visible behavior regression.
- The presentation accepts read-only entities and fog state without requiring a mutable `World`.
- Entity meshes retain stable IDs for selection and targeting.
- Simulation and presentation remain separated; Babylon and DOM imports do not enter `src/core/`.
- Existing single-player save and lifecycle behavior is unchanged.

### Test scenarios

- Start Open Field and verify terrain, entities, fog, camera, health bars, and selection rings.
- Select and move a group; verify models and order feedback update.
- Enter combat and verify damage/destruction effects still render.
- Save, return to title, and resume the same match.
- Run unit tests, the complete E2E suite, typecheck, lint, and production build.

## Task 2 — Render `OnlineMatch` through the shared battlefield

**Status:** Complete in `codex/online-shared-battlefield` at `2fc5985`.

### Description

Replace the online prototype scene, cubes, local fog canvas, and separate camera with
`BattlePresentation`. Add an adapter that converts each filtered server snapshot into the shared
read-only battle view without creating client authority or restoring a full simulation world.

### Acceptance criteria

- Online matches use the same Open Field terrain, entity models, camera, fog presentation, and
  entity picking as single-player.
- The adapter exposes only state present in the recipient's filtered snapshot.
- Hidden enemies disappear and cannot remain targetable through stale meshes.
- Both seats start focused on their assigned base and can pan, zoom, select, and issue a move order.
- Prototype online meshes, ground, fog texture, and `ArcRotateCamera` are removed.
- The existing room, reconnect, command, result, and single-player flows remain functional.

### Test scenarios

- Start a two-browser match and visually inspect the western and eastern seats.
- Select a Worker from each seat and issue a ground move; verify position and facing update.
- Move an enemy out of vision and verify its rendered mesh disappears.
- Refresh one browser and verify the current filtered battlefield is restored.
- Run adapter and projection unit tests, the complete E2E suite, typecheck, lint, and both builds.

## Task 3 — Share selection, orders, and placement interaction

**Status:** Complete and validated in `codex/online-shared-battlefield` at `cc613ce`.

### Description

Give `OnlineMatch` the same interaction quality as single-player. Refactor the existing selection and
placement code around a small read-only entity source and command callbacks so local and remote
sessions can reuse it. Keep server validation authoritative; shared browser input only expresses
intent.

Support click selection, Shift selection, drag selection, selection pruning, contextual right-click,
attack-move, building placement preview, cancellation, and minimap camera navigation. Do not copy
the controllers into a second online implementation.

### Acceptance criteria

- Click, Shift-click, and drag selection behave the same in both match modes.
- Only locally owned units and buildings can be selected; hidden enemies cannot be targeted.
- Right-click resolves to move, attack, gather, or resume construction from visible read state.
- `Q` arms one attack-move command and `Escape` cancels the active command or clears selection.
- Building placement uses the shared footprint preview and communicates that final validity is
  confirmed by the server.
- Multi-unit commands preserve stable IDs and never include foreign actors.
- The old pointer/order implementation is removed from `OnlineMatch` after parity is reached.

### Test scenarios

- Click one unit, Shift-add another, then clear selection.
- Drag-select a mixed visible area and verify only friendly units are selected.
- Move a selected group and confirm formation movement is applied by the server.
- Attack a visible enemy, then attempt the same after it leaves vision.
- Gather from a visible field and resume an interrupted construction site.
- Preview valid and invalid building footprints; cancel with right-click and `Escape`.
- Verify the same selection/movement E2E journey still passes in single-player.

## Task 4 — Build the shared PvP-style tactical HUD

**Status:** Complete, awaiting product validation.

### Description

Extract a shared, presentation-only tactical HUD using the preferred online layout. Apply it to both
online and single-player battles through mode-specific view models and command callbacks. Preserve
the compact top status area, wide bottom action area, selection/economy panel, contextual commands,
queue, and minimap.

The HUD must not inspect `World`, WebSocket, or Babylon objects directly. Mode-specific controllers
provide the current selection, economy, queues, available actions, connection state, clock, and
result actions.

### Acceptance criteria

- Online and single-player use the same HUD structure and visual system.
- The layout matches the approved PvP direction at the supported desktop viewport.
- Selection name, health, status, Credits, actions, prerequisites, production progress, and queue
  are accurate for the current viewer.
- Contextual actions cover construction, production, queue cancellation, and entrenchment.
- Online-only connection state and surrender controls appear without polluting single-player.
- Single-player pause/save controls remain available through its existing lifecycle.
- HUD buttons have disabled reasons or prerequisite text when an action is unavailable.
- No gameplay or networking implementation is embedded in DOM rendering code.

### Test scenarios

- Compare empty, unit, Worker, HQ, production building, construction site, and multi-selection states.
- Queue and cancel production; verify progress and Credits update.
- Toggle entrenchment and verify state/action text.
- Disconnect and reconnect one online client; verify status remains readable without shifting the
  main controls.
- Visually validate both modes at the supported desktop viewport and at a narrower desktop width.
- Run the existing start, pause, persistence, combat, and build/production E2E scenarios.

## Task 5 — Add online command feedback and smooth snapshot presentation

**Status:** Complete, awaiting product validation.

### Description

Make a 10 Hz authoritative stream feel responsive without predicting economy or combat. Add a short
snapshot interpolation buffer for visible entities and explicit local command states: pending,
confirmed, and rejected. Reuse shared order markers and combat feedback where the filtered protocol
contains enough information.

Reset interpolation safely after refresh, a sequence gap, or visibility loss. Never interpolate an
enemy through hidden terrain or retain live hidden state.

### Acceptance criteria

- Visible movement is smooth at ordinary snapshot cadence and different render frame rates.
- Selection and placement previews remain immediate and local.
- Submitted commands show pending feedback until acknowledged or rejected.
- Rejections produce a concise reason and remove optimistic markers without mutating authority.
- Visibility loss removes enemy presentation immediately; reappearance resumes from a fresh
  authorized snapshot.
- Duplicate snapshots and stale acknowledgements do not repeat effects or regress state.
- Refresh/reconnect clears obsolete interpolation and pending UI before applying the full resync.

### Test scenarios

- Move units under 30, 60, and 144 FPS rendering while snapshots arrive at 10 Hz.
- Delay acknowledgements and verify pending markers resolve once.
- Reject an unaffordable build and an invalid hidden target; verify safe feedback.
- Hide and reveal a moving enemy; verify no hidden route is displayed.
- Drop a snapshot, reconnect, and verify the client resumes from the newest full view.
- Verify combat effects do not repeat when the same snapshot is received twice.

### Implementation note

The client interpolates only between consecutive, already filtered snapshots and removes an entity
as soon as it is absent from the newest view. Command markers are presentation-only and disappear on
rejection or once the acknowledged server tick arrives. Reconnects and sequence gaps clear pending
feedback and interpolation before the next full snapshot. The current protocol does not contain
filtered combat-event identifiers, so online combat effects are intentionally deferred rather than
inferred from entity disappearance, which could reveal fog-of-war information or replay effects.

## Task 6 — Complete and audit the playable PvP loop

**Status:** Not started.

### Description

Close the functional gaps between the server command set and the browser experience. Exercise every
supported economy and combat action from both seats, then complete the room/result lifecycle needed
for repeated manual play sessions. Fix only parity and lifecycle defects found by this audit.

### Acceptance criteria

- Both seats can move, attack, attack-move, gather, build, resume construction, produce, cancel a
  queue entry, and change entrenchment state through the UI.
- Credits, prerequisites, queues, health, construction progress, fog, and result remain consistent
  with the authoritative server.
- Elimination, surrender, timeout, and disconnect produce one immutable result for both clients.
- Refresh restores the same seat; a replaced socket cannot continue issuing commands.
- Returning from a completed match leaves the client in a valid room/title state with no stale
  entities, selection, pending commands, or credentials.
- Single-player behavior and local save data remain unchanged.

### Test scenarios

- Play a complete two-browser economy loop: gather, build, produce, attack, and eliminate.
- Cancel the second queue entry after the first completes and verify the intended item is cancelled.
- Interrupt and resume a construction site.
- Entrench and unpack FPV Drone Operators from each seat.
- Surrender from each seat; refresh during a running match and on the result screen.
- Disconnect one seat through the grace period and verify the final outcome.
- Run a second match after returning from the first and verify no state leaks across match IDs.

## Task 7 — Validate and prepare the private alpha deployment

**Status:** Not started.

### Description

Define and verify the first supported deployment. Keep the Vite frontend on Vercel and deploy the
authoritative Node/WebSocket process to a host that supports a long-running process and stable WSS
connections. Add only the configuration, health information, operational limits, and documentation
needed for the private alpha.

### Acceptance criteria

- Production client builds with an explicit `VITE_MULTIPLAYER_URL` using `wss://`.
- Server rejects origins other than the configured frontend origin.
- Server has documented start, health, shutdown/drain, room-limit, and maximum-lifetime behavior.
- A server restart produces a clear aborted/service-unavailable experience and never awards a win.
- Logs omit invite and resume credentials.
- Measured room capacity is recorded before choosing the public room cap.
- The deployment guide states that Vercel hosts only the static client and identifies the separate
  server service, required environment variables, and rollback procedure.
- A production-like two-browser smoke match can be created, played, refreshed, and completed.

### Test scenarios

- Connect through HTTPS/WSS using the production-like frontend origin.
- Attempt a disallowed origin, invalid protocol revision, oversized message, and room overflow.
- Run 1, 5, and 10 concurrent representative matches and record tick time, lag, memory, bandwidth,
  and socket buffer growth.
- Run a 30-minute match/room churn soak within the selected capacity.
- Start draining, verify new rooms are rejected, and let existing matches finish.
- Restart the server during a match and verify both clients show the same service interruption.

## Release evidence checklist

- [ ] Tasks 1–7 have separate commits in `codex/online-shared-battlefield`, and the completed branch
  is merged into `feat/multiplayer-alpha`.
- [ ] All epic acceptance criteria are demonstrated.
- [ ] Full unit, server integration, and E2E suites pass from the final epic branch.
- [ ] Both player viewpoints receive a final visual review.
- [ ] Fog and filtered payload tests show no hidden-state leakage.
- [ ] Load/soak results and the selected room cap are recorded.
- [ ] Vercel client and separate multiplayer server deployment steps are documented.
- [ ] The complete private-alpha smoke match passes in the production-like environment.
