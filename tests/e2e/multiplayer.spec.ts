import { expect, test } from '@playwright/test';
import WebSocket from 'ws';

function socketMessage(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', receive); reject(new Error(`Timed out waiting for ${type}`)); }, 5000);
    const receive = (raw: WebSocket.RawData): void => {
      const value = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (value.type !== type) return;
      clearTimeout(timeout); socket.off('message', receive); resolve(value);
    };
    socket.on('message', receive);
  });
}

async function connectedSocket(): Promise<WebSocket> {
  const socket = new WebSocket('ws://localhost:8788/ws', { origin: 'http://localhost:5183' });
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return socket;
}

function socketClosed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

test('server enforces origin, protocol, payload and room-capacity boundaries', async () => {
  const wrongOrigin = new WebSocket('ws://localhost:8788/ws', { origin: 'https://untrusted.example' });
  const refused = new Promise<void>((resolve) => {
    wrongOrigin.once('error', () => resolve());
    wrongOrigin.once('unexpected-response', () => resolve());
  });
  await refused;

  const invalidProtocol = await connectedSocket();
  const invalidWait = socketMessage(invalidProtocol, 'rejected');
  invalidProtocol.send(JSON.stringify({ protocolVersion: 999, type: 'create' }));
  expect((await invalidWait).reason).toBe('invalid-message');
  invalidProtocol.close();

  const oversized = await connectedSocket();
  const oversizedClose = socketClosed(oversized);
  oversized.send('x'.repeat(17 * 1024));
  expect(await oversizedClose).toBe(1009);

  const health = await fetch('http://localhost:8788/healthz').then(async (response) =>
    response.json() as Promise<{ rooms: { active: number; max: number } }>);
  const rooms: WebSocket[] = [];
  try {
    for (let index = health.rooms.active; index < health.rooms.max; index++) {
      const socket = await connectedSocket();
      const session = socketMessage(socket, 'session');
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'create' }));
      await session;
      rooms.push(socket);
    }
    const overflow = await connectedSocket();
    const capacity = socketMessage(overflow, 'rejected');
    overflow.send(JSON.stringify({ protocolVersion: 1, type: 'create' }));
    expect((await capacity).reason).toBe('capacity');
    overflow.close();
  } finally {
    for (const socket of rooms) {
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'leave' }));
      socket.close();
    }
  }
});

test('server applies owned orders once and rejects a forged actor', async () => {
  const west = await connectedSocket();
  const east = await connectedSocket();
  const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify({ protocolVersion: 1, ...message }));
  try {
    const westSessionWait = socketMessage(west, 'session'); send(west, { type: 'create' });
    const westSession = await westSessionWait;
    const eastSessionWait = socketMessage(east, 'session'); send(east, { type: 'join', roomId: westSession.roomId, invite: westSession.invite });
    const eastSession = await eastSessionWait;
    const westLoad = socketMessage(west, 'load'); const eastLoad = socketMessage(east, 'load');
    send(west, { type: 'ready', ready: true }); send(east, { type: 'ready', ready: true });
    await Promise.all([westLoad, eastLoad]);
    const westView = socketMessage(west, 'snapshot'); const eastView = socketMessage(east, 'snapshot');
    send(west, { type: 'loaded' }); send(east, { type: 'loaded' });
    const [westSnapshot, eastSnapshot] = await Promise.all([westView, eastView]);
    const ownWorker = (westSnapshot.entities as Array<{id: string; type: string}>).find((entity) => entity.type === 'worker')!.id;
    const foreignWorker = (eastSnapshot.entities as Array<{id: string; type: string}>).find((entity) => entity.type === 'worker')!.id;
    const command = { type: 'Move', unitIds: [ownWorker], destination: { x: 420, y: 900 } };
    const ackWait = socketMessage(west, 'ack');
    send(west, { type: 'command', matchId: westSnapshot.matchId, connectionEpoch: westSession.connectionEpoch, seq: 1, command });
    expect((await ackWait).ok).toBe(true);
    const duplicate = socketMessage(west, 'rejected');
    send(west, { type: 'command', matchId: westSnapshot.matchId, connectionEpoch: westSession.connectionEpoch, seq: 1, command });
    expect((await duplicate).reason).toBe('old-sequence');
    const forged = socketMessage(east, 'ack');
    send(east, { type: 'command', matchId: eastSnapshot.matchId, connectionEpoch: eastSession.connectionEpoch, seq: 1, command: { ...command, unitIds: [foreignWorker, ownWorker] } });
    expect((await forged).ok).toBe(false);
  } finally { west.close(); east.close(); }
});

test('two private seats can refresh, finish, rematch and leave without stale state', async ({ browser }) => {
  const westContext = await browser.newContext();
  const eastContext = await browser.newContext();
  const west = await westContext.newPage();
  const east = await eastContext.newPage();
  try {
    await west.goto('/');
    await west.getByTestId('title-start-game').click();
    await west.getByTestId('game-mode-multiplayer').click();
    await west.getByTestId('multiplayer-create').click();
    const invite = await west.getByTestId('multiplayer-invite-link').inputValue();
    await east.goto(invite);
    await expect(east.getByText(/East: connected/)).toBeVisible();
    await west.getByRole('button', { name: 'Ready' }).click();
    await east.getByRole('button', { name: 'Ready' }).click();
    await expect(west.getByText(/Playing as west/)).toBeVisible();
    await expect(east.getByText(/Playing as east/)).toBeVisible();

    const worker = { x: 720, y: 334 };
    await west.mouse.click(worker.x, worker.y);
    await expect(west.getByTestId('multiplayer-selection')).toContainText('Worker');
    await west.mouse.click(worker.x + 160, worker.y + 70, { button: 'right' });
    await expect(west.getByText('Order confirmed.')).toBeVisible();

    await east.reload();
    await expect(east.getByText(/Playing as east/)).toBeVisible();
    await west.getByTestId('multiplayer-surrender').click();
    await west.getByRole('button', { name: 'Surrender', exact: true }).last().click();
    await expect(east.getByText(/Victory/)).toBeVisible();
    await expect(west.getByText(/Defeat/)).toBeVisible();

    const lateContext = await browser.newContext();
    try {
      const late = await lateContext.newPage();
      await late.goto(invite);
      await expect(late.locator('.online-status')).toHaveText('This battle has already ended. Create or join another room.');
    } finally { await lateContext.close(); }

    await west.getByRole('button', { name: 'Rematch lobby' }).click();
    await expect(west.getByText(/Prepare for battle/)).toBeVisible();
    await expect(east.getByText(/Prepare for battle/)).toBeVisible();
    await west.getByRole('button', { name: 'Ready for battle' }).click();
    await east.getByRole('button', { name: 'Ready for battle' }).click();
    await expect(west.getByText(/Playing as west/)).toBeVisible();
    await expect(east.getByText(/Playing as east/)).toBeVisible();
    await expect(west.getByTestId('multiplayer-selection')).toContainText('No selection');

    await west.mouse.click(worker.x, worker.y);
    await expect(west.getByTestId('multiplayer-selection')).toContainText('Worker');
    await west.mouse.click(worker.x + 100, worker.y + 60, { button: 'right' });
    await expect(west.getByText('Order confirmed.')).toBeVisible();

    await east.getByTestId('multiplayer-surrender').click();
    await east.getByRole('button', { name: 'Surrender', exact: true }).last().click();
    await expect(west.getByText(/Victory/)).toBeVisible();
    await west.getByRole('button', { name: 'Return to title' }).click();
    await expect(west.getByTestId('title-screen')).toBeVisible();
    expect(await west.evaluate(() => sessionStorage.getItem('redline-online-seat'))).toBeNull();
  } finally {
    await westContext.close(); await eastContext.close();
  }
});

test('mode selection opens the multiplayer room entry', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('title-start-game').click();
  await page.getByTestId('game-mode-multiplayer').click();
  await expect(page.getByTestId('multiplayer-create')).toBeVisible();
});
