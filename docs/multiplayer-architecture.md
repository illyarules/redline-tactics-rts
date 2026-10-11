# Multiplayer architecture and first PvP format

Status: accepted architecture baseline; implementation is in progress and deployment is not included.
Originally reviewed on 2026-10-11 against repository commit `a5e3a31`. Current task status is tracked
in [Playable private PvP epic](./multiplayer-epic.md).
Task: [Define the multiplayer architecture and first format](https://app.todoist.com/app/task/define-the-multiplayer-architecture-and-first-format-6hgGP99VfRj2Rr4G).

## Decision

Build private, real-time, desktop 1v1 matches on Open Field. Use a dedicated authoritative
TypeScript server, WebSocket commands, and per-player state updates. Reuse the existing pure
rules and Babylon presentation. Keep single-player playable offline.

The first release is an unranked invitation-only alpha: create room, share an invite, join,
ready, play, see the result, return to the lobby. No accounts, matchmaking, public room browser,
ranking, chat, spectators, teams, host migration, persistent match history, or cross-device
resume. A running server owns the match even when the room creator leaves.

This proposal is the explicitly requested multiplayer planning exception to the current
single-player scope in `AGENTS.md`. It does not silently enable that scope in the implementation.
At implementation kickoff, update the scope documents to permit the narrowly defined server,
rooms, and session credentials. Preserve the remaining limits.

## Repository findings

| Area | Evidence | Consequence |
|---|---|---|
| Shared rules | `src/core/` contains economy, movement, construction, combat, fog, AI, and pathfinding; `tests/unit/architecture.test.ts` guards rendering imports | Reuse the core; no new engine or ECS is needed |
| Simulation owner | `MatchScene.render()` sequences systems; `main.ts` feeds variable frame deltas and stops rendering when hidden | Extract a renderer-free fixed-step simulation before networking |
| Death handling | `MatchScene.showAttackFeedback()` removes destroyed entities | Move removal and lifecycle bookkeeping into simulation; effects must only consume events |
| Identity | `PlayerId` is `player / ai / ai2`; `teams.ts` derives teams from those names; `MatchScene` hardcodes `PLAYER_ID` | Separate participant identity, controller type, faction, team, spawn slot, and local viewer |
| Intent vs state | `core/orders.ts` stores calculated routes, gather phases, construction IDs, and engagements | Define new input commands; do not accept serialized `Order` objects from clients |
| Validation | Most core actions accept an owner; `cancelProduction()` accepts only a building and queue index; construction accepts a caller-supplied faction | A single authoritative command dispatcher must validate all actions and derive identity/faction |
| Fog | `core/fog.ts` is pure, but the browser currently holds the full world; placement does not check fog | Filter network output and validate hidden-target/placement commands on the server |
| Persistence | Schema 14 includes all entities, economies, fog, AI, selection; `restoreWorld()` remaps IDs | Local saves are neither a network protocol nor a safe reconnection payload |
| Result | `matchLifecycle.ts` aggregates all bots, returns local victory/defeat, and gives player loss priority | Introduce a neutral PvP result and per-participant statistics |
| Content | Open Field is 64×64 with asymmetric starts/terrain; Trident Basin is 1v2; current code has five unit and six building roles | Start with Open Field and freeze a tested content revision; old four/five-role scope text is stale |
| Browser assumptions | Pause, save/quit, title resume, observer debug, and minimap colors assume one local human | Audit the complete second-player experience, not only command ownership |
| Tests | `multiplayer-map.test.ts` tests three-owner single-player setup, not a network match | Add server integration coverage; do not treat that filename as existing PvP support |

The inspected core/config code has no `Math.random()`, wall-clock reads, or direct browser API
calls affecting simulation. This is a useful starting point, not proof of deterministic execution:
variable timesteps, system order, IDs, implicit caches, and restoration still need explicit tests.
`config/maps.ts` imports image assets; the server must import pure `config/map.ts` data instead.

## First match rules

| Choice | Proposed alpha rule |
|---|---|
| Players | Exactly two human participants; no AI controller in PvP |
| Map | Open Field only; Trident Basin remains single-player |
| Factions | Meridian mirror match initially; faction identity stays independent from owner identity |
| Spawn | Server assigns the two slots randomly once when creating a match; records the assignment and seed |
| Opening | One HQ, one Worker, 900 Credits per participant, using versioned shared config |
| Content | The stabilized single-player roster at the implementation gate; no PvP-only units |
| Win | Eliminate every opponent structure, including construction sites, or receive their surrender/forfeit |
| Draw | Both participants have no structures at the end of the same tick, or 900 simulation seconds expire |
| Resolution | Resolve destruction before timeout; evaluate both participants symmetrically |
| Pause | Escape opens an overlay; the online match continues |
| Rematch | Return to lobby, reset readiness, create a new match ID and world |

A mirror match avoids coupling the first network release to faction selection and asymmetric
faction balancing. It does not establish map fairness: compare opening gather travel, buildable
space, and attack routes from both starts, then playtest both sides. Block the alpha if either start
has a material practical disadvantage; adjust the map in a separate balance task. Do not claim a
competitive ladder is ready on the strength of equal starting Credits.

Hot-seat and asynchronous play require different RTS time/input rules and do not serve the requested
live PvP loop. Peer-hosted simulation gives one player authority and complicates disconnects.
Deterministic lockstep distributes simulation but requires matching clients and usually exposes
the whole world. Authoritative state replication fits this game's modest unit count and fog model.

## Runtime boundaries

```text
Browser A: input -> commands --\
                               WSS -> room/session validation -> authoritative simulation
Browser B: input -> commands --/                              -> per-player projections
Browser A/B: Babylon + HTML <- filtered state + events + results

Offline single-player: input -> local command dispatcher -> same simulation -> local views
```

Keep one repository and the current build tools. Suggested modules, introduced only as needed:

- `src/core/simulation.ts`: state initialization, fixed tick, terminal resolution, domain events.
- `src/core/commands.ts`: player intent and rule validation; no transport or session secrets.
- `src/core/participants.ts`: participant setup, controller, team, faction, spawn mappings.
- `src/protocol/`: versioned network types and runtime parsers, independent from local-save schema.
- `src/network/`: browser connection, command acknowledgements, read model and interpolation.
- `server/`: HTTP/WebSocket entry, admission limits, sessions, rooms, scheduling, projection.
- `tests/integration/`: headless server and real socket clients; `tests/load/` for opt-in workloads.

Use explicit local and remote match sessions with a small surface such as `submit(command)`,
`readView()`, event subscription, and disposal. Local sessions own simulation; remote sessions
own a read model. Do not recreate every filtered update with `restoreWorld()` or run a second
authoritative world on the remote client. Reuse rendering-facing entity shapes through a small
read-only interface. Camera, selection, animation, audio, previews, and pending-order markers
remain local. Keep the existing single-player save format/flow through an explicit adapter.

Use Node.js with a small WebSocket library such as `ws`, native browser WebSocket, and JSON
messages initially. Pin a supported runtime and package versions at implementation time. A
separate server TypeScript configuration must exclude DOM/Babylon/assets and emit runnable code;
the existing Vite/bundler configuration alone does not establish a Node build.

## Deterministic simulation contract

Start with **20 simulation ticks/second** (`dt = 0.05`) and **10 state updates/second**. These are
profiling hypotheses, not measured capacity. The server uses a monotonic scheduler with an
accumulator; gameplay time advances in integer ticks, independent of client FPS or browser focus.
Bound catch-up work. Sustained inability to maintain ticks must trip admission/health handling,
not cause skipped ticks or oversized gameplay deltas.

Initially preserve the current system order: movement, gathering, construction, entrenchment,
production, cooldowns, fog, optional AI, automatic targeting, attack/attack-move, destruction and
outcome, retaliation, separation. Add a documented command boundary before these steps. Capture
immutable combat event data before removing entities. Any change in ordering must have a focused
behavior test, especially death, production, target acquisition, and time-limit precedence.

PvP commands use the authoritative fog state from the preceding completed tick; refresh initial
fog before accepting commands. The current 0.25-second fog cadence remains an explicit rule
unless tests justify a separate change. Input-time visibility and subsequent attack execution are
both checked. Terminal state stops gameplay, but connection/result delivery continues.

Assign commands to the next unsealed server tick. Preserve each participant's sequence order;
interleave participants with a deterministic alternating first slot by tick to avoid a permanent
same-tick spending/placement preference. Clients cannot choose authoritative execution ticks.
Record the resulting application order for diagnostics. Do not implement rollback initially.

Define stable iteration/tie-breaking, entity allocation, production-entry IDs, and seeded randomness.
Keep crypto tokens outside gameplay RNG. Replaying the same initial setup and applied commands
must reproduce canonical state hashes on the pinned server runtime. Cross-browser bitwise
simulation parity is not required because clients do not simulate authority.

If checkpoint replay is introduced, include ID allocator state, tick, fog cells and cadence,
targeting cadence, queues, resources, lifecycle, and all other future-influencing state. Existing
WeakMaps and local-save restoration are not automatically complete checkpoints. Server restart
recovery is outside this alpha, so checkpointing is not a prerequisite for ordinary reconnect.

## Commands and validation

Client envelope: `{ protocolVersion, matchId, connectionEpoch, seq, command }`.
The authenticated connection determines the participant; no client-provided owner is trusted.

| Command | Intent fields |
|---|---|
| Move / AttackMove | Owned unit IDs, destination |
| Attack | Owned unit IDs, target ID |
| Gather | Worker IDs, resource-field ID |
| Build | Worker ID, building type, footprint origin |
| ResumeConstruction | Worker ID, construction-site ID |
| Produce | Building ID, unit type |
| CancelProduction | Building ID, stable queue-entry ID |
| SetEntrenchment | Unit IDs, explicit desired state |
| Surrender | No gameplay payload |

Use explicit entrenchment intent instead of a retry-sensitive toggle. Queue-entry IDs avoid
cancelling the wrong unit after a previous queue row finishes. Do not transmit client-computed
paths, faction overrides, damage, cooldowns, costs, balances, or production elapsed time.

Validate at decode/admission and again at the application tick:

1. Message shape/version/size, bounded IDs and arrays, known command/type enums, finite coordinates,
   integral in-bounds tiles, session membership, active match, current connection epoch, sequence.
2. Live owned actors and producer/worker role; reject forged or mixed-owner selections atomically.
   Legitimately destroyed actors can be skipped, returning the applied actor IDs; reject if none remain.
3. Costs, power, prerequisites, queue limits, legal entrenchment state, and current construction rules.
   Derive faction from the participant/owned entity. Ownership checks also wrap production cancellation.
4. Target hostility and authoritative visibility. For PvP construction require the full footprint to
   be currently visible, then validate occupancy and a reachable worker route. This is a deliberate
   PvP restriction; leave offline placement behavior intact. Gathering requires a visible field.
5. Calculate routes, range, cooldowns, damage, and mutations exclusively on the server. Allow
   Move/AttackMove to unseen ground for scouting, with public terrain constraints.

Unknown and hidden targets get the same non-informative rejection. Avoid revealing hidden blockers
through detailed errors or sending full planned routes through unseen areas. Public map terrain and
initial resource locations are known; remaining resources outside vision are not live public data.

Return a final acknowledgement containing sequence, applied tick, applied actor IDs, or a safe
rejection code. Duplicates must never spend or execute twice: retain a per-participant high-water
mark and a bounded acknowledgement cache, rejecting old sequences after cache eviction. Rate-limit
expensive path requests and room creation as well as raw message counts. Initial tunable limits:
16 KiB command messages, 100 actors/command, 20 commands/second with a burst of 40; validate these
against normal interaction before release. These are transport limits, not new gameplay unit caps.

## Synchronization and fog

Start with complete **filtered player-view snapshots** at 10 Hz, not complete world snapshots.
This is simpler to recover and audit than delta baselines at the present scale. Measure bytes and
CPU before adding compression or deltas. The roadmap's command-sync intent means clients send
orders rather than positions; authoritative server-to-client state is still required by this design.

Each update includes protocol/content revision, match ID, tick, snapshot sequence, command
acknowledgement progress, recipient identity, own economy/queues, own entities, visible enemy
public fields, own fog, permitted resource observations, and terminal result. Use explicit DTO
allowlists. Never serialize a core object and merely delete a few secret fields.

Do not send enemy balances, queues, routes, orders, target IDs, fog, hidden health/positions, or
hidden resource depletion. Own attack targets and combat events also need filtering: an automatic
retaliation order, a projectile origin, or a death notification must not disclose an unseen enemy.
Strip foreign IDs/coordinates not authorized by the visibility policy. Use non-revealing opaque
network entity IDs so gaps in the global sequential core allocator do not reveal hidden production.

An enemy absent from the latest full projection disappears; absence does not imply death.
Reappearance uses the same match-scoped network ID. Any last-seen presentation is frozen historical
information, never hidden live updates. Reconnection gets only the same filtered projection.
Public outcome and final aggregate statistics are an explicit post-match disclosure policy; do
not reveal the full world. Disable observer/debug data paths for online matches.

Render from a short interpolation buffer, initially 100–150 ms. Give instant local selection,
order markers, and placement previews; mark commands pending until acknowledgement. Do not
predict combat, spending, or production. Hide entities immediately on visibility loss and never
interpolate an enemy along a hidden route. Drop obsolete snapshots; after a gap/focus restoration,
take a fresh full view and reset interpolation. Bound socket buffers and disconnect slow consumers
for reconnect instead of accumulating an unbounded stale-state queue. Bounded tick/event IDs
prevent repeated effects; result state remains available independently of transient effects.

## Rooms, lobby, and failure behavior

Room flow: `waiting -> ready -> loading -> running -> finished -> waiting`, plus `closed`.
The ready-to-loading transition atomically locks the two seats and the content revision. Both
clients acknowledge loaded assets before the start countdown; no simulation runs before start.

- Enter Multiplayer through mode selection after Start Game, even if a local single-player save exists.
  Offer Create / Join, then show invite, both seats, fixed map/factions, readiness and connection status.
- Invite capability grants access to a vacant seat only. Issue a separate unguessable seat/resume
  credential; possession of the room invite must never let a third party steal an occupied seat.
  Use TLS, origin allowlisting, expiring credentials and admission limits. Keep secrets out of logs,
  analytics and ordinary URL queries; invite fragments can be consumed and removed from the URL.
- Keep the resume credential in `sessionStorage` for same-tab refresh, with in-memory fallback.
  It is not a local gameplay save. No cross-device resume. Do not modify the single-player save.
- Waiting rooms expire after 10 idle minutes. Leaving frees a seat and clears readiness; if the
  creator leaves before the match, the remaining participant becomes lobby owner. Empty rooms close.
- Loading has a 30-second deadline. Failure returns to waiting and clears readiness. Only the
  server transitions to running, once, after both acknowledgements.
- During a match, continue simulation during disconnect, hidden tabs, menus and refresh; existing
  orders continue. Offer automatic reconnect with bounded exponential backoff. Define disconnect
  as failed heartbeat detection (initially 10 seconds), followed by a 30-second reconnect grace.
- Authenticate resume, keep the same participant, invalidate the old socket using a new connection
  epoch, and send current view plus sequence watermark. Do not replay old pending commands
  automatically across epochs; discard local pending UI after resync. Commands already applied
  are represented in current state, commands never accepted are not resurrected.
- Grace expiry produces a disconnect forfeit. Surrender produces immediate defeat at the next
  command boundary. If both are absent when a disconnect deadline expires, abort with no winner;
  ordinary gameplay elimination/timeout already resolved by then remains final. Terminal state is
  immutable and delivered consistently to both clients, including reconnecting clients.
- Keep finished room/result state for five minutes; then expire credentials and delete it. Rematch
  uses fresh match identity/sequence space. The server, not a client's result screen, resolves outcomes.
- A server crash loses in-memory matches: show service interruption/aborted, never award a client
  victory. Drain rooms during deployment; stop accepting new rooms and allow running matches to end.

## Hosting and operations

Use one long-lived Node service in one region for the alpha, behind HTTPS/WSS, with rooms in
memory. Keep the static frontend on its current hosting. No database, Redis, Kubernetes, autoscaling,
or cross-process room routing is needed for the first measured capacity tier. Add hard concurrent
room limits and a server-side maximum lifetime to prevent leaked or severely stalled rooms.

The hosting decision is based on a predictable simulation process and room ownership, not a blanket
claim that Vercel cannot handle WebSockets. Current Vercel guidance includes WebSocket support and
instance-local connections, while some older pages differ. A function-hosted alternative would need
a separate evaluation of room affinity, process lifetime, tick scheduling, and restart behavior.

Record active rooms/connections, tick duration/lag, command rejection counts, reconnects, view bytes,
buffer growth, and process memory. Never log credentials. Limit command traces and keep them
server-private. Choose provider, instance size, monthly budget and initial room cap after the load
spike; this document does not claim a measured operating cost or production capacity.

## Implementation sequence and acceptance gates

All task instructions below are intentionally in English. Each phase should leave single-player
runnable and be reviewed separately.

| Phase | Work | Acceptance / dependency |
|---|---|---|
| 0. Stabilize the baseline | Finish or explicitly defer the expanded combat/technology scope; freeze rules and map/content revision; record single-player checks | Required before implementation by the Todoist task. Current green unit tests alone do not satisfy this gate |
| 1. Extract the simulation | Coordinate with existing **Refactor MatchScene orchestration** task (`6hgGP8xHRW9X3qRG`); move ticks, deaths, events and results into core | Headless full match; stable replay hash; existing SP unit/E2E/build/type checks pass; no Babylon/DOM imports |
| 2. Separate participants and commands | Add controller/team/spawn/viewer identity, command dispatcher and neutral PvP outcome; preserve SP save semantics | Both slots can build/produce/gather/fight; actor, cancellation and double-submit tests; SP result/save regression tests |
| 3. Prove one headless network match | Add the server build, two seats, protocol parsing, full filtered projections and lifecycle | Two socket clients complete a match; hidden-data tests pass; disconnect/reconnect and incompatible revisions tested before public exposure |
| 4. Connect the browser match | Add remote read model, interpolation, local feedback and viewpoint-aware HUD/selection/camera/colors | Two browser contexts play from opposite seats; no client-side authority; SP save remains intact; visual verification of new UI |
| 5. Add the complete room journey | Create/join/ready/loading, reconnect banner, surrender, result, rematch and cleanup | Refresh preserves the seat, expiry forfeits correctly, double join cannot steal it, old socket cannot act, menus do not pause opponents |
| 6. Validate and release private alpha | Run impairment/load/security scenarios, verify map fairness, set room cap and deploy with draining | Measured performance envelope, complete two-human match, no hidden state leakage, operational abort paths verified |

Phases 1–2 precede 3; 3 precedes 4–5; all precede 6. Do not duplicate the existing MatchScene
refactor. Existing faction-selection, defensive-structure, aircraft and technology tasks remain
separate; define which belong to the stabilized baseline instead of assuming their backlog status
means they are implemented. Mobile support is not a technical prerequisite for desktop PvP.

## Test strategy and release evidence

**Pure rules:** deterministic replay over a full 18,000-tick match, stable tie-breaking/IDs,
participant symmetry, terminal precedence, command ownership and finite input, entrenchment,
queue-entry cancellation, resources/prerequisites/cooldowns, fog-gated attacks and placement.
Repeat with render schedules of 30/60/144 FPS around the same local fixed-step runner. Hash
future-influencing simulation state, not just positions or the existing save object.

**Integration:** run an actual server with two sockets and a controllable clock. Cover full room
lifecycle, start-once races, duplicate/stale commands, invalid packets, hidden-target probes,
fog-filtered nested references/events/resource updates, reconnect/full resync, old-socket fencing,
version mismatch, loading timeout, surrender, both-client absence, room expiry and process loss.
Replay identical command logs and compare canonical results. Check stable visible entity IDs
through hide/reveal and refresh.

**Browser:** add a small PvP journey using two isolated Playwright contexts: create/join/ready,
move/build/produce/combat, result, refresh/reconnect and surrender. Use server-side integration
fixtures for shortened scenarios, never a production client state-injection API. Keep the existing
single-player suite small and under its three-minute target; run broader network cases headlessly.
Visually inspect the new lobby, pending orders, second-player HUD, reconnect and result screens
against the dev server using Playwright MCP as required by the project.

**Impairment/load:** use a test proxy/harness with 50/150/300 ms RTT, jitter, stalled readers,
abrupt connection loss, refresh and background-tab suspension. WebSocket/TCP loss is generally
observed as delay/retransmission; do not pretend application packets are freely reordered.
Run 1, 5, 10, then more concurrent matches with 50–100 active units each, real movement/pathfinding,
production, combat and fog. Include a 30-minute soak and repeated room churn with a deliberate flood
client. Initial release targets: p95 per-room tick execution under 25 ms, no sustained scheduler lag
beyond one 50 ms tick at the chosen cap, p95 command-to-ack under 250 ms at 150 ms RTT, bounded
buffers, and memory returning near baseline after room cleanup. Record state bandwidth explicitly;
introduce deltas only if full filtered views exceed the selected network budget. These are proposed
gates to measure, not performance results from this planning task.

## Evidence and limitations of this review

This review reads the linked task and its empty comment/subtask lists, the related engineering
backlog, current source/config/tests, and the documentation. It does not implement a network
prototype, establish balance, benchmark a server, or certify the expanded single-player scope as
stable. The current task remains a design proposal until its product defaults and rollout gate are
accepted. Implementation estimates should follow phases 1–3, when coupling and payload cost are known.

Baseline verification during this review: `npm test` passed all 509 tests in 47 files;
`npm run typecheck` and `npm run build` passed. The build still reports the large-chunk warning
(main JavaScript approximately 1.38 MB before gzip). E2E and visual checks were not run because
this change adds documentation only; they remain mandatory implementation/release evidence.
No runtime source, dependencies, Todoist task status, or deployed services were changed.

External references checked for the transport/hosting choices:

- [ws documentation](https://github.com/websockets/ws): Node server usage, native browser client,
  authentication/heartbeat examples, and compression tradeoffs.
- [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket): browser API and
  lack of automatic backpressure; [bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount).
- [Vercel WebSocket example](https://vercel.com/kb/guide/real-time-chat-websockets): current support
  and instance-local connection behavior; transport support alone does not establish an RTS host.
