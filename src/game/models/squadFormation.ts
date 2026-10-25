/**
 * The compact arrangement a squad's visible members stand in around their entity's position:
 * four soldiers in two staggered ranks for Infantry, three specialists for FPV Operators.
 *
 * Offsets are in the model's own local space — `+z` forward, `+x` right — so a caller only has to
 * place and rotate one root per entity; the members keep their arrangement for free as that root
 * turns to face `facingRadians`.
 *
 * Pure data lookups: no Babylon import, so the shape of a formation can be tested without a scene.
 */
import { SQUAD_ROLES } from '../../config/squad';
import type { SquadRoleConfig, SquadRoleId, SquadSlot } from '../../config/types';

export type { SquadSlot };

/** The slots of `config`, lead first. Always one per visible member at full health. */
export function squadFormationSlots(config: SquadRoleConfig): readonly SquadSlot[] {
  return config.slots;
}

/**
 * Stable, subtle per-entity variation so separate squads do not repeat the exact same silhouette.
 * Slot order is preserved for casualties; offsets stay small enough to keep the formation readable.
 */
export function variedSquadFormationSlots(config: SquadRoleConfig, entityId: string): readonly SquadSlot[] {
  const mirror = unitHash(`${entityId}:mirror`) < 0.5 ? -1 : 1;
  return config.slots.map((slot, index) => ({
    rightTiles: slot.rightTiles * mirror + signedHash(`${entityId}:${index}:right`) * 0.045,
    forwardTiles: slot.forwardTiles + signedHash(`${entityId}:${index}:forward`) * 0.04,
  }));
}

/** How many members a squad of `role` shows at full health. */
export function squadSize(role: SquadRoleId): number {
  return SQUAD_ROLES[role].slots.length;
}

function signedHash(seed: string): number {
  return unitHash(seed) * 2 - 1;
}

function unitHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}
