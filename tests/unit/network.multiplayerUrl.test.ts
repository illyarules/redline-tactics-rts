import { describe, expect, it } from 'vitest';
import { multiplayerServerUrl } from '../../src/network/multiplayerUrl';

describe('multiplayer server URL', () => {
  it('uses the local WebSocket server only in development', () => {
    expect(multiplayerServerUrl(undefined, false)).toBe('ws://localhost:8787/ws');
    expect(multiplayerServerUrl(undefined, true)).toBeNull();
  });

  it('requires an explicit encrypted production endpoint', () => {
    expect(multiplayerServerUrl('wss://multiplayer.example.com/ws', true))
      .toBe('wss://multiplayer.example.com/ws');
    expect(() => multiplayerServerUrl('ws://multiplayer.example.com/ws', true)).toThrow(/wss/);
    expect(() => multiplayerServerUrl('https://multiplayer.example.com/ws', true)).toThrow(/ws:\/\//);
  });
});
