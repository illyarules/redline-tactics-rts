/**
 * Cosmetic rifle fire for an Infantry squad: which visible soldier takes each shot, and the small
 * recoil kick that follows. Pure functions only. Shooter and recoil never touch damage, cooldowns,
 * range, targeting or the order of events: they only dress a hit the simulation already confirmed.
 */
import type { SquadRecoilConfig } from '../../config/types';

/**
 * The soldier who takes the next shot: the one after `previous`, wrapping among the `visibleCount`
 * standing soldiers (indices `0..visibleCount-1`). Hidden casualties are never chosen, and a
 * `previous` that has since fallen simply wraps back to the lead. `null` when nobody is standing.
 */
export function nextShooterIndex(previous: number | null, visibleCount: number): number | null {
  if (!Number.isInteger(visibleCount) || visibleCount <= 0) return null;
  if (previous === null || !Number.isInteger(previous) || previous < 0) return 0;
  return (previous + 1) % visibleCount;
}

/**
 * Kick strength `elapsedSeconds` after a shot, from 0 to 1: a fast rise to the peak, then a smooth
 * return to rest. Zero once the kick is over (and before it starts).
 */
export function recoilKick(elapsedSeconds: number, config: SquadRecoilConfig): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;
  if (elapsedSeconds < config.attackSeconds) {
    const rise = elapsedSeconds / config.attackSeconds;
    return 1 - (1 - rise) * (1 - rise);
  }
  const fall = (elapsedSeconds - config.attackSeconds) / config.releaseSeconds;
  if (fall >= 1) return 0;
  const remaining = 1 - fall;
  return remaining * remaining * (3 - 2 * remaining);
}

/** Total length of one kick, after which the soldier is back at rest. */
export function recoilDurationSeconds(config: SquadRecoilConfig): number {
  return config.attackSeconds + config.releaseSeconds;
}
