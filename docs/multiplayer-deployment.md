# Private multiplayer alpha deployment

## Supported topology

The browser client remains a static Vite deployment on Vercel. Private matches run in a separate,
single-instance Render Web Service named `redline-tactics-multiplayer`. Render terminates TLS and
forwards both HTTP health requests and WebSocket upgrades to the Node process. The client connects
only through `wss://<multiplayer-host>/ws`.

Keep the service at one instance. Rooms live only in process memory, so horizontal scaling would
send reconnects to an instance that does not own the room. A service restart aborts active matches;
it never reconstructs them or awards a winner.

## Server deployment

The repository's `render.yaml` defines the build command, start command, `/healthz` probe, shutdown
window and non-secret limits. Create a paid Render Web Service from that Blueprint; the free service
sleep behavior is not supported for the alpha.

Set these environment variables on the server service:

| Variable | Required value |
|---|---|
| `MULTIPLAYER_ORIGIN` | Exact Vercel frontend origin, such as `https://redline.example.com` |
| `MULTIPLAYER_ADMIN_TOKEN` | Random secret used only to start a planned drain |
| `MULTIPLAYER_MAX_ROOMS` | `5` for the first private alpha |
| `MULTIPLAYER_MAX_ROOM_LIFETIME_SECONDS` | `2700` (45 minutes) |
| `MULTIPLAYER_DRAIN_TIMEOUT_SECONDS` | `1200` (20 minutes, long enough for a 15-minute match) |
| `PORT` | Supplied by Render; do not override it |

The server accepts one exact `Origin`, caps messages at 16 KiB, rate-limits commands, bounds socket
buffers, expires idle rooms, and rejects room creation while draining. Logs contain lifecycle and
port information only; invite and resume credentials are never logged.

Render supports public WebSocket connections and recommends `wss://` on the public internet. Its
WebSocket documentation also describes `SIGTERM` shutdown and reconnect behavior:
<https://render.com/docs/websocket>. Configure `/healthz` as the service health check as described at
<https://render.com/docs/health-checks>.

## Client deployment on Vercel

Set the Production environment variable before building:

```text
VITE_MULTIPLAYER_URL=wss://<multiplayer-host>/ws
```

The production client validates that an explicit endpoint uses `wss://` and the `/ws` path. If the
variable is absent, the static single-player game still builds, but Multiplayer reports that it is
not configured. `ws://localhost:8787/ws` remains the development default.

Deploy the server first, confirm `/healthz`, then deploy the Vercel client. The Vercel deployment
continues to host static files only; it does not run the match process or store rooms.

## Health and operations

- `GET /healthz` returns process uptime, room phases, connection count, p95 tick duration and
  scheduler lag, outbound bytes, maximum observed socket buffer, rejected commands and reconnects.
- `GET /readyz` returns `503` while draining or at the room cap and `200` otherwise.
- `POST /admin/drain` with `Authorization: Bearer <MULTIPLAYER_ADMIN_TOKEN>` rejects new rooms while
  allowing running matches to finish. Start this at least 15 minutes before a planned deployment.
- `SIGTERM` and `SIGINT` also start draining. Once all rooms finish, the process closes cleanly.
  Signal-driven drain is capped at four minutes so the server can abort remaining matches and exit
  inside Render's five-minute shutdown window. Admin drain uses the configured longer deadline.
- Waiting rooms expire after 10 idle minutes, results after 5 minutes, and every room after the
  configured maximum lifetime.

For an unplanned process loss, clients retry their seat with bounded exponential backoff and then
show a service-unavailable result without declaring victory. A planned forced shutdown sends or
persists an authoritative `aborted` result before closing sockets.

## Load and soak procedure

Build and start the server, then run the checked-in WebSocket harness:

```bash
npm run build:server
npm run start:server
MULTIPLAYER_LOAD_MATCHES=10 MULTIPLAYER_LOAD_DURATION_SECONDS=1800 npm run load:multiplayer
```

The harness creates real rooms, joins both seats, completes loading, keeps connections alive,
captures `/healthz`, ends each match authoritatively and cleans up both seats. Run 1, 5 and 10 match
steps before changing `MULTIPLAYER_MAX_ROOMS`. A release candidate must also complete a 30-minute
run and room-churn smoke on the selected Render instance.

### Local baseline — 2026-10-11

The local development machine completed 1, 5 and 10 concurrent opening-state matches. Each measured
window ran for 3 seconds after room startup:

| Matches | Startup | Tick p95 | Scheduler lag p95 | Client receive rate | RSS while loaded | Max socket buffer |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 39 ms | 4.264 ms | 48.010 ms | 0.72 MiB/s | 67.7 MiB | 0 B |
| 5 | 57 ms | 2.585 ms | 48.010 ms | 3.61 MiB/s | 70.2 MiB | 0 B |
| 10 | 70 ms | 2.074 ms | 52.086 ms | 7.45 MiB/s | 71.4 MiB | 0 B |

These are opening-state smoke measurements on the development machine, not hosted capacity proof.
The ten-room tier crossed the one-tick scheduler-lag gate, so the first public cap is 5 rooms. To
repeat the stress tier, start the server with `MULTIPLAYER_MAX_ROOMS=10`. Do not raise the public cap
until a 30-minute run on the paid Render instance meets: p95 tick execution below 25 ms, no sustained
scheduler lag beyond 50 ms, bounded socket buffers, and memory returning near baseline after cleanup.

A separate drain smoke used a running match, a 5-second test deadline and the authenticated admin
endpoint. `/readyz` changed to `503`, a new room received `draining`, the existing room continued
until the deadline, and the server then reported zero active rooms and connections. The production
client build also passed with an explicit example `wss://.../ws` endpoint.

## Release smoke and rollback

Before opening the alpha:

1. Confirm `/healthz` reports `status: ok` and `/readyz` returns `200`.
2. Open the Vercel client in two isolated browser sessions; create, join, ready and start a room.
3. Issue an order from both seats, refresh one seat, surrender, and verify opposite results.
4. Confirm the health counters remain bounded and no credential appears in service logs.

To roll back, call `/admin/drain`, wait until `rooms.phases.running` reaches zero, redeploy the prior
known-good server commit, verify health, then restore the matching Vercel deployment. If a forced
rollback reaches the drain deadline, remaining matches end as aborted draws and clients receive the
service-interruption state.
