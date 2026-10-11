export interface MultiplayerServerConfig {
  readonly port: number;
  readonly allowedOrigin: string;
  readonly maxRooms: number;
  readonly maxRoomLifetimeMs: number;
  readonly drainTimeoutMs: number;
  readonly adminToken: string | null;
}

export function multiplayerServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MultiplayerServerConfig {
  return {
    port: positiveInteger(environment.PORT, 8787, 'PORT'),
    allowedOrigin: webOrigin(environment.MULTIPLAYER_ORIGIN ?? 'http://localhost:5173'),
    maxRooms: positiveInteger(environment.MULTIPLAYER_MAX_ROOMS, 5, 'MULTIPLAYER_MAX_ROOMS'),
    maxRoomLifetimeMs: positiveInteger(
      environment.MULTIPLAYER_MAX_ROOM_LIFETIME_SECONDS,
      45 * 60,
      'MULTIPLAYER_MAX_ROOM_LIFETIME_SECONDS',
    ) * 1000,
    drainTimeoutMs: positiveInteger(
      environment.MULTIPLAYER_DRAIN_TIMEOUT_SECONDS,
      30 * 60,
      'MULTIPLAYER_DRAIN_TIMEOUT_SECONDS',
    ) * 1000,
    adminToken: environment.MULTIPLAYER_ADMIN_TOKEN?.trim() || null,
  };
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function webOrigin(raw: string): string {
  let value: URL;
  try { value = new URL(raw); } catch { throw new Error('MULTIPLAYER_ORIGIN must be an absolute HTTP(S) origin.'); }
  if ((value.protocol !== 'http:' && value.protocol !== 'https:') || value.origin !== raw) {
    throw new Error('MULTIPLAYER_ORIGIN must be an absolute HTTP(S) origin without a path.');
  }
  return value.origin;
}
