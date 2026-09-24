import type { PlayerId } from './ids';

export type TeamId = 'human' | 'enemy';

export function teamOf(player: PlayerId): TeamId {
  return player === 'player' ? 'human' : 'enemy';
}

/** A single rule shared by combat, target acquisition and UI command validation. */
export function areHostile(left: PlayerId, right: PlayerId): boolean {
  return teamOf(left) !== teamOf(right);
}
