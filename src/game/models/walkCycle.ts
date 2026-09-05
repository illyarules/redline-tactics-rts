/**
 * Procedural poses for one soldier: alternating leg swing, a little arm/rifle motion and a small
 * vertical body bob while moving; a slow breathing sway while idle.
 *
 * Pure trigonometry, no Babylon import and no notion of an entity — `EntitiesView` is the only
 * caller, and it is the one that turns a pose into a scene transform every frame. Per-frame animation
 * state (the phase counters this is driven by) lives there too, never in `src/core`.
 */
import type { SquadAnimationConfig } from '../../config/types';

export interface SquadPose {
  readonly legLeftRadians: number;
  readonly legRightRadians: number;
  readonly armRadians: number;
  readonly bobTiles: number;
}

/** One soldier's pose `phaseRadians` into the stride cycle. Legs alternate; the bob doubles up. */
export function walkPose(phaseRadians: number, config: SquadAnimationConfig): SquadPose {
  return {
    legLeftRadians: Math.sin(phaseRadians) * config.legSwingRadians,
    legRightRadians: Math.sin(phaseRadians + Math.PI) * config.legSwingRadians,
    armRadians: Math.sin(phaseRadians + Math.PI) * config.armSwingRadians,
    // Both feet pass under the body twice a stride, so the body rises and dips twice too.
    bobTiles: Math.abs(Math.sin(phaseRadians)) * config.walkBobTiles,
  };
}

/** A standing soldier's pose `elapsedSeconds` into an unbroken idle sway. Legs stay planted. */
export function idlePose(elapsedSeconds: number, config: SquadAnimationConfig): SquadPose {
  const cycle = elapsedSeconds * config.idleCyclesPerSecond * Math.PI * 2;
  return {
    legLeftRadians: 0,
    legRightRadians: 0,
    armRadians: Math.sin(cycle) * config.idleSwayRadians,
    bobTiles: (Math.sin(cycle) * 0.5 + 0.5) * config.idleBobTiles,
  };
}
