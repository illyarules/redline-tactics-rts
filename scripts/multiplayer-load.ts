import WebSocket from 'ws';

const url = process.env.MULTIPLAYER_LOAD_URL ?? 'ws://localhost:8787/ws';
const origin = process.env.MULTIPLAYER_LOAD_ORIGIN ?? 'http://localhost:5173';
const matches = positiveInteger(process.env.MULTIPLAYER_LOAD_MATCHES, 1);
const durationSeconds = positiveInteger(process.env.MULTIPLAYER_LOAD_DURATION_SECONDS, 10);
const healthUrl = process.env.MULTIPLAYER_HEALTH_URL ?? 'http://localhost:8787/healthz';
const sockets: WebSocket[] = [];
let receivedBytes = 0;

interface LoadRoom {
  readonly west: WebSocket;
  readonly east: WebSocket;
  readonly westSession: Record<string, unknown>;
  readonly snapshot: Record<string, unknown>;
}

const startedAt = performance.now();
const baseline = await health();
const rooms: LoadRoom[] = [];
try {
  for (let index = 0; index < matches; index++) rooms.push(await startRoom());
  const heartbeat = setInterval(() => {
    for (const socket of sockets) send(socket, { type: 'ping' });
  }, 5_000);
  await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));
  clearInterval(heartbeat);
  const loaded = await health();
  process.stdout.write(`${JSON.stringify({
    matches,
    durationSeconds,
    startupMs: Math.round(performance.now() - startedAt - durationSeconds * 1000),
    receivedBytes,
    baseline,
    loaded,
  }, null, 2)}\n`);
} finally {
  await Promise.allSettled(rooms.map(finishRoom));
  for (const socket of sockets) socket.close();
}

async function startRoom(): Promise<LoadRoom> {
  const west = await connect();
  const westSessionWait = message(west, 'session');
  send(west, { type: 'create' });
  const westSession = await westSessionWait;
  const east = await connect();
  const eastSessionWait = message(east, 'session');
  send(east, { type: 'join', roomId: westSession.roomId, invite: westSession.invite });
  await eastSessionWait;
  const westLoad = message(west, 'load');
  const eastLoad = message(east, 'load');
  send(west, { type: 'ready', ready: true });
  send(east, { type: 'ready', ready: true });
  await Promise.all([westLoad, eastLoad]);
  const westSnapshot = message(west, 'snapshot');
  const eastSnapshot = message(east, 'snapshot');
  send(west, { type: 'loaded' });
  send(east, { type: 'loaded' });
  const [snapshot] = await Promise.all([westSnapshot, eastSnapshot]);
  return { west, east, westSession, snapshot };
}

async function finishRoom(room: LoadRoom): Promise<void> {
  const result = message(room.east, 'snapshot', (value) => value.result !== null);
  send(room.west, {
    type: 'command',
    matchId: room.snapshot.matchId,
    connectionEpoch: room.westSession.connectionEpoch,
    seq: 1,
    command: { type: 'Surrender' },
  });
  await result;
  send(room.west, { type: 'leave' });
  send(room.east, { type: 'leave' });
}

async function connect(): Promise<WebSocket> {
  const socket = new WebSocket(url, { origin });
  sockets.push(socket);
  socket.on('message', (raw) => { receivedBytes += raw.toString().length; });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

function send(socket: WebSocket, payload: object): void {
  socket.send(JSON.stringify({ protocolVersion: 1, ...payload }));
}

function message(
  socket: WebSocket,
  type: string,
  predicate: (value: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', receive);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 10_000);
    const receive = (raw: WebSocket.RawData): void => {
      const value = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (value.type !== type || !predicate(value)) return;
      clearTimeout(timeout);
      socket.off('message', receive);
      resolve(value);
    };
    socket.on('message', receive);
  });
}

async function health(): Promise<unknown> {
  const response = await fetch(healthUrl);
  if (!response.ok) throw new Error(`Health endpoint returned ${response.status}.`);
  return response.json();
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Load values must be positive integers.');
  return value;
}
