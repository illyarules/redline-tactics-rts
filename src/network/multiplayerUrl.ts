const DEVELOPMENT_SERVER_URL = 'ws://localhost:8787/ws';

/** Resolves the browser endpoint while requiring encrypted WebSockets for an explicit production URL. */
export function multiplayerServerUrl(
  configured: string | undefined,
  production: boolean,
): string | null {
  if (configured === undefined || configured.trim() === '') {
    return production ? null : DEVELOPMENT_SERVER_URL;
  }
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error('VITE_MULTIPLAYER_URL must be an absolute WebSocket URL.'); }
  if ((url.protocol !== 'ws:' && url.protocol !== 'wss:') || url.pathname !== '/ws') {
    throw new Error('VITE_MULTIPLAYER_URL must use ws:// or wss:// and end with /ws.');
  }
  if (production && url.protocol !== 'wss:') {
    throw new Error('Production multiplayer requires a wss:// VITE_MULTIPLAYER_URL.');
  }
  return url.href;
}
