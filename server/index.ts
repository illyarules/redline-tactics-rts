import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import { isPvpCommand, PvpMatch, PVP_TICK_SECONDS, type PvpCombatEffect, type PvpCommand, type Seat } from '../src/core/pvp';
import { multiplayerServerConfig } from './config';

const config = multiplayerServerConfig();
const protocolVersion = 1;
const rooms = new Map<string, Room>();
const startedAt = Date.now();
let draining = false;
let drainDeadline: number | null = null;
let shutdownAfterDrain = false;
let outboundBytes = 0;
let maxBufferedAmount = 0;
let rejectedCommands = 0;
let reconnects = 0;
const tickDurations: number[] = [];
const tickLags: number[] = [];
const server = createServer((request, response) => {
  if (request.url === '/admin/drain' && request.method === 'POST' && config.adminToken !== null) {
    if (request.headers.authorization !== `Bearer ${config.adminToken}`) {
      response.writeHead(401).end();
      return;
    }
    startDrain('admin request', false);
    response.writeHead(202, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: 'draining' }));
    return;
  }
  if (request.url !== '/healthz' && request.url !== '/readyz' && request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  const ready = !draining && rooms.size < config.maxRooms;
  const status = request.url === '/readyz' && !ready ? 503 : 200;
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(healthView(ready)));
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

interface SeatState {
  token: string;
  socket: WebSocket | null;
  epoch: number;
  ready: boolean;
  loaded: boolean;
  lastSeq: number;
  disconnectedAt: number | null;
  lastMessageAt: number;
  messages: number;
  windowStart: number;
}
interface Room {
  id: string;
  invite: string;
  phase: 'waiting' | 'loading' | 'running' | 'finished';
  seats: Partial<Record<Seat, SeatState>>;
  match: PvpMatch | null;
  matchId: string | null;
  createdAt: number;
  changedAt: number;
  loadingAt: number | null;
  tickAccumulator: number;
  lastTickAt: number;
  snapshots: number;
  effects: Record<Seat, PvpCombatEffect[]>;
  pending: Partial<Record<Seat, Array<{ seq: number; command: PvpCommand; socket: WebSocket; epoch: number }>>>;
}
const token = () => randomBytes(24).toString('base64url');
const roomId = () => randomBytes(8).toString('hex');
const send = (socket: WebSocket | null, data: unknown): void => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 1_000_000) {
    const payload = JSON.stringify(data);
    outboundBytes += Buffer.byteLength(payload);
    maxBufferedAmount = Math.max(maxBufferedAmount, socket.bufferedAmount);
    socket.send(payload);
  }
  else if (socket?.readyState === WebSocket.OPEN) socket.close(1013, 'slow consumer');
};
const both = (room: Room, callback: (seat: Seat, state: SeatState) => void): void => {
  for (const seat of ['player', 'ai'] as const) {
    const state = room.seats[seat];
    if (state) callback(seat, state);
  }
};
const lobby = (room: Room): void => both(room, (seat, state) => send(state.socket, {
  type: 'lobby', roomId: room.id, phase: room.phase, seat,
  seats: (['player', 'ai'] as const).map((id) => ({ seat: id, occupied: !!room.seats[id], connected: room.seats[id]?.socket?.readyState === WebSocket.OPEN, ready: !!room.seats[id]?.ready })),
  matchId: room.matchId,
}));
const view = (room: Room): void => {
  if (!room.match) return;
  both(room, (seat, state) => send(state.socket, {
    type: 'snapshot',
    protocolVersion,
    matchId: room.matchId,
    snapshotSeq: ++room.snapshots,
    ...room.match!.view(seat),
    effects: room.effects[seat],
  }));
  room.effects = { player: [], ai: [] };
};
const finish = (room: Room): void => {
  room.phase = 'finished'; room.changedAt = Date.now(); view(room); lobby(room);
};
const attach = (room: Room, seat: Seat, socket: WebSocket): void => {
  const state = room.seats[seat]!;
  if (state.epoch > 0) reconnects++;
  state.socket?.close(4001, 'replaced');
  state.socket = socket; state.epoch++; state.disconnectedAt = null; state.lastMessageAt = Date.now();
  socketState.set(socket, { room, seat, epoch: state.epoch });
  send(socket, { type: 'session', roomId: room.id, invite: room.invite, credential: state.token, seat, connectionEpoch: state.epoch, lastSeq: state.lastSeq, matchId: room.matchId, protocolVersion });
  lobby(room); view(room);
};
const socketState = new WeakMap<WebSocket, { room: Room; seat: Seat; epoch: number }>();
const parse = (raw: string): Record<string, unknown> | null => {
  try { const value: unknown = JSON.parse(raw); return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
};
const reject = (socket: WebSocket, reason: string, seq?: number): void => {
  rejectedCommands++;
  send(socket, { type: 'rejected', reason, seq });
};

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws' || request.headers.origin !== config.allowedOrigin) { socket.destroy(); return; }
  sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws));
});
sockets.on('connection', (socket) => {
  socket.on('error', () => {
    // Protocol and payload violations are isolated to this connection by `ws`.
  });
  socket.on('message', (data) => {
    const message = parse(data.toString());
    if (!message || message.protocolVersion !== protocolVersion || typeof message.type !== 'string') { reject(socket, 'invalid-message'); return; }
    const attached = socketState.get(socket);
    if (!attached) {
      if (message.type === 'create') {
        if (draining) { reject(socket, 'draining'); return; }
        if (rooms.size >= config.maxRooms) { reject(socket, 'capacity'); return; }
        const now = Date.now(); const room: Room = { id: roomId(), invite: token(), phase: 'waiting', seats: {}, match: null, matchId: null, createdAt: now, changedAt: now, loadingAt: null, tickAccumulator: 0, lastTickAt: performance.now(), snapshots: 0, effects: { player: [], ai: [] }, pending: {} };
        room.seats.player = { token: token(), socket: null, epoch: 0, ready: false, loaded: false, lastSeq: 0, disconnectedAt: null, lastMessageAt: now, messages: 0, windowStart: now };
        rooms.set(room.id, room); attach(room, 'player', socket); return;
      }
      if (message.type === 'join' && typeof message.roomId === 'string' && typeof message.invite === 'string') {
        if (draining) { reject(socket, 'draining'); return; }
        const room = rooms.get(message.roomId);
        if (!room || room.invite !== message.invite || room.phase !== 'waiting' || room.seats.ai) { reject(socket, 'room-unavailable'); return; }
        const now = Date.now(); room.seats.ai = { token: token(), socket: null, epoch: 0, ready: false, loaded: false, lastSeq: 0, disconnectedAt: null, lastMessageAt: now, messages: 0, windowStart: now };
        room.changedAt = now; attach(room, 'ai', socket); return;
      }
      if (message.type === 'resume' && typeof message.roomId === 'string' && typeof message.credential === 'string') {
        const room = rooms.get(message.roomId);
        const seat = room && (['player', 'ai'] as const).find((candidate) => room.seats[candidate]?.token === message.credential);
        if (!room || !seat) { reject(socket, 'invalid-session'); return; }
        attach(room, seat, socket); return;
      }
      reject(socket, 'not-admitted'); return;
    }
    const { room, seat, epoch } = attached;
    const state = room.seats[seat]!;
    if (state.socket !== socket || state.epoch !== epoch) { reject(socket, 'stale-connection'); return; }
    const now = Date.now(); state.lastMessageAt = now;
    if (now - state.windowStart > 1000) { state.windowStart = now; state.messages = 0; }
    if (++state.messages > 40) { reject(socket, 'rate-limited'); return; }
    if (message.type === 'ping') { send(socket, { type: 'pong' }); return; }
    if (message.type === 'leave') {
      if (room.phase === 'running') { room.match!.result = { winner: seat === 'player' ? 'ai' : 'player', reason: 'surrender' }; finish(room); }
      else {
        delete room.seats[seat]; room.changedAt = now;
        if (seat === 'player' && room.phase === 'waiting' && room.seats.ai) {
          const replacement = room.seats.ai;
          delete room.seats.ai; room.seats.player = replacement;
          if (replacement.socket) {
            socketState.set(replacement.socket, { room, seat: 'player', epoch: replacement.epoch });
            send(replacement.socket, { type: 'session', roomId: room.id, invite: room.invite, credential: replacement.token, seat: 'player', connectionEpoch: replacement.epoch, lastSeq: replacement.lastSeq, matchId: room.matchId, protocolVersion });
          }
        }
        if (!room.seats.player && !room.seats.ai) rooms.delete(room.id);
        else lobby(room);
      }
      socket.close(); return;
    }
    if (message.type === 'ready' && room.phase === 'waiting' && typeof message.ready === 'boolean') {
      state.ready = message.ready; room.changedAt = now;
      if (room.seats.player?.ready && room.seats.ai?.ready) {
        room.phase = 'loading'; room.loadingAt = now; both(room, (_id, participant) => { participant.loaded = false; send(participant.socket, { type: 'load', map: 'open-field' }); });
      }
      lobby(room); return;
    }
    if (message.type === 'loaded' && room.phase === 'loading') {
      state.loaded = true;
      if (room.seats.player?.loaded && room.seats.ai?.loaded) {
        room.match = new PvpMatch(); room.matchId = roomId(); room.phase = 'running'; room.changedAt = now; room.lastTickAt = performance.now(); room.snapshots = 0;
        lobby(room); view(room);
      }
      return;
    }
    if (message.type === 'rematch' && room.phase === 'finished') {
      room.phase = 'waiting'; room.match = null; room.matchId = null; room.pending = {}; room.effects = { player: [], ai: [] }; room.changedAt = now;
      both(room, (_id, participant) => { participant.ready = false; participant.loaded = false; participant.lastSeq = 0; });
      lobby(room); return;
    }
    if (message.type === 'command' && room.phase === 'running' && room.match && message.matchId === room.matchId && message.connectionEpoch === epoch && Number.isSafeInteger(message.seq) && (message.seq as number) > 0 && isPvpCommand(message.command)) {
      const seq = message.seq as number;
      if (seq <= state.lastSeq) { reject(socket, 'old-sequence', seq); return; }
      if (seq !== state.lastSeq + 1) { reject(socket, 'sequence-gap', seq); return; }
      state.lastSeq = seq;
      (room.pending[seat] ??= []).push({ seq, command: message.command, socket, epoch });
      return;
    }
    reject(socket, 'invalid-action', typeof message.seq === 'number' ? message.seq : undefined);
  });
  socket.on('close', () => {
    const attached = socketState.get(socket); if (!attached) return;
    const state = attached.room.seats[attached.seat];
    if (state?.socket === socket) { state.socket = null; state.disconnectedAt = Date.now(); lobby(attached.room); }
  });
});

const maintenance = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    both(room, (_seat, state) => {
      if (state.socket && now - state.lastMessageAt > 10_000) state.socket.close(4000, 'heartbeat timeout');
    });
    if (now - room.createdAt > config.maxRoomLifetimeMs) {
      if (room.phase === 'running' && room.match) {
        room.match.result = { winner: null, reason: 'aborted' };
        finish(room);
      } else {
        closeRoom(room, 'maximum room lifetime reached');
        continue;
      }
    }
    if (room.phase === 'waiting' && now - room.changedAt > 600_000) { closeRoom(room, 'room expired'); continue; }
    if (room.phase === 'finished' && now - room.changedAt > 300_000) { closeRoom(room, 'result expired'); continue; }
    if (room.phase === 'loading' && room.loadingAt && now - room.loadingAt > 30_000) {
      room.phase = 'waiting'; both(room, (_seat, state) => { state.ready = false; state.loaded = false; }); lobby(room);
    }
    if (room.phase !== 'running' || !room.match) continue;
    const absent = (['player', 'ai'] as const).filter((seat) => room.seats[seat]?.disconnectedAt && now - room.seats[seat]!.disconnectedAt! > 30_000);
    if (absent.length) { room.match.result = { winner: absent.length === 2 ? null : absent[0] === 'player' ? 'ai' : 'player', reason: absent.length === 2 ? 'aborted' : 'disconnect' }; finish(room); continue; }
    const monotonicNow = performance.now();
    room.tickAccumulator += Math.max(0, monotonicNow - room.lastTickAt); room.lastTickAt = monotonicNow;
    remember(tickLags, Math.max(0, room.tickAccumulator - PVP_TICK_SECONDS * 1000));
    let steps = 0;
    while (room.tickAccumulator >= PVP_TICK_SECONDS * 1000 && steps++ < 5 && room.phase === 'running') {
      const tickStartedAt = performance.now();
      room.tickAccumulator -= PVP_TICK_SECONDS * 1000;
      const first: Seat = room.match.tick % 2 === 0 ? 'player' : 'ai';
      for (const seat of [first, first === 'player' ? 'ai' : 'player'] as Seat[]) {
        for (const queued of room.pending[seat] ?? []) {
          const outcome = room.match.apply(seat, queued.command);
          send(queued.socket, {
            type: 'ack',
            seq: queued.seq,
            appliedTick: room.match.tick + 1,
            actorIds: outcome.actorIds,
            ok: outcome.ok,
            ...(outcome.ok ? {} : { reason: 'invalid-action' }),
          });
        }
        room.pending[seat] = [];
      }
      const effects = room.match.step();
      room.effects.player.push(...effects.player);
      room.effects.ai.push(...effects.ai);
      if (room.match.result) finish(room);
      else if (room.match.tick % 2 === 0) view(room);
      remember(tickDurations, performance.now() - tickStartedAt);
    }
  }
  if (draining) {
    for (const room of rooms.values()) {
      if (room.phase === 'finished') closeRoom(room, 'server draining');
    }
    if (drainDeadline !== null && now >= drainDeadline) abortRunningRooms();
    if (shutdownAfterDrain && rooms.size === 0) completeShutdown();
  }
}, 50);

server.listen(config.port, () => process.stdout.write(`Multiplayer server listening on ${config.port}\n`));

let shutdownStarted = false;
function healthView(ready: boolean): object {
  const phases = { waiting: 0, loading: 0, running: 0, finished: 0 };
  const memory = process.memoryUsage();
  for (const room of rooms.values()) phases[room.phase]++;
  return {
    status: draining ? 'draining' : 'ok',
    ready,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    rooms: { active: rooms.size, max: config.maxRooms, phases },
    connections: sockets.clients.size,
    simulation: {
      tickDurationP95Ms: percentile(tickDurations, 0.95),
      schedulerLagP95Ms: percentile(tickLags, 0.95),
    },
    transport: { outboundBytes, maxBufferedAmount },
    memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed },
    commands: { rejected: rejectedCommands },
    reconnects,
    maxRoomLifetimeSeconds: config.maxRoomLifetimeMs / 1000,
  };
}

function remember(samples: number[], value: number): void {
  samples.push(value);
  if (samples.length > 1_200) samples.shift();
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!.toFixed(3));
}

function closeRoom(room: Room, reason: string): void {
  rooms.delete(room.id);
  both(room, (_seat, state) => state.socket?.close(1001, reason));
}

function abortRunningRooms(): void {
  for (const room of rooms.values()) {
    if (room.phase === 'running' && room.match) {
      room.match.result = { winner: null, reason: 'aborted' };
      finish(room);
    } else {
      sendServiceInterruption(room);
      closeRoom(room, 'server restart');
    }
  }
}

function sendServiceInterruption(room: Room): void {
  both(room, (_seat, state) => send(state.socket, {
    type: 'service-unavailable',
    reason: 'server-restart',
    retryable: false,
  }));
}

function startDrain(signal: string, exitWhenEmpty: boolean): void {
  if (draining) {
    shutdownAfterDrain ||= exitWhenEmpty;
    if (exitWhenEmpty) {
      drainDeadline = Math.min(drainDeadline ?? Number.POSITIVE_INFINITY, Date.now() + 240_000);
    }
    if (shutdownAfterDrain && rooms.size === 0) completeShutdown();
    return;
  }
  draining = true;
  shutdownAfterDrain = exitWhenEmpty;
  drainDeadline = Date.now() + (exitWhenEmpty ? Math.min(config.drainTimeoutMs, 240_000) : config.drainTimeoutMs);
  process.stdout.write(`Multiplayer server draining after ${signal}\n`);
  for (const room of rooms.values()) {
    if (room.phase === 'running') continue;
    sendServiceInterruption(room);
    closeRoom(room, 'server restart');
  }
  if (shutdownAfterDrain && rooms.size === 0) completeShutdown();
}

function completeShutdown(): void {
  if (shutdownStarted) return;
  shutdownStarted = true;
  clearInterval(maintenance);
  server.close(() => process.exit(0));
  sockets.close();
}

process.once('SIGTERM', () => startDrain('SIGTERM', true));
process.once('SIGINT', () => startDrain('SIGINT', true));
