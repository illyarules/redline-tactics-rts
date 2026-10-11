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

test('two private seats can start, refresh and finish an online match', async ({ browser }) => {
  const westContext = await browser.newContext();
  const eastContext = await browser.newContext();
  const west = await westContext.newPage();
  const east = await eastContext.newPage();
  try {
    await west.goto('/');
    await west.getByTestId('title-multiplayer').click();
    await west.getByTestId('multiplayer-create').click();
    const invite = await west.getByTestId('multiplayer-invite-link').inputValue();
    await east.goto(invite);
    await expect(east.getByText(/East: connected/)).toBeVisible();
    await west.getByRole('button', { name: 'Ready' }).click();
    await east.getByRole('button', { name: 'Ready' }).click();
    await expect(west.getByText(/Playing as west/)).toBeVisible();
    await expect(east.getByText(/Playing as east/)).toBeVisible();
    await east.reload();
    await expect(east.getByText(/Playing as east/)).toBeVisible();
    await west.getByTestId('multiplayer-surrender').click();
    await west.getByRole('button', { name: 'Surrender', exact: true }).last().click();
    await expect(east.getByText(/Victory/)).toBeVisible();
    await expect(west.getByText(/Defeat/)).toBeVisible();
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
