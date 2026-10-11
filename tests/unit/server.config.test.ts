import { describe, expect, it } from 'vitest';
import { multiplayerServerConfig } from '../../server/config';

describe('multiplayer server configuration', () => {
  it('parses production limits and the exact allowed origin', () => {
    expect(multiplayerServerConfig({
      PORT: '9000',
      MULTIPLAYER_ORIGIN: 'https://game.example.com',
      MULTIPLAYER_MAX_ROOMS: '12',
      MULTIPLAYER_MAX_ROOM_LIFETIME_SECONDS: '3600',
      MULTIPLAYER_DRAIN_TIMEOUT_SECONDS: '1200',
      MULTIPLAYER_ADMIN_TOKEN: 'private-token',
    })).toEqual({
      port: 9000,
      allowedOrigin: 'https://game.example.com',
      maxRooms: 12,
      maxRoomLifetimeMs: 3_600_000,
      drainTimeoutMs: 1_200_000,
      adminToken: 'private-token',
    });
  });

  it('rejects ambiguous origins and invalid limits', () => {
    expect(() => multiplayerServerConfig({ MULTIPLAYER_ORIGIN: 'https://game.example.com/path' }))
      .toThrow(/origin/);
    expect(() => multiplayerServerConfig({ MULTIPLAYER_MAX_ROOMS: '0' })).toThrow(/positive integer/);
  });
});
