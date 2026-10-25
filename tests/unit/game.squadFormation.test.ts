import { describe, expect, it } from 'vitest';
import { SQUAD_DRONE_CONFIG, SQUAD_ROLES } from '../../src/config/squad';
import { squadFormationSlots, squadSize, variedSquadFormationSlots } from '../../src/game/models/squadFormation';

/** The smallest distance between any two slots of a formation, in tiles. */
function closestPair(slots: readonly { rightTiles: number; forwardTiles: number }[]): number {
  let closest = Infinity;
  for (let a = 0; a < slots.length; a++) {
    for (let b = a + 1; b < slots.length; b++) {
      closest = Math.min(closest, Math.hypot(
        slots[a]!.rightTiles - slots[b]!.rightTiles,
        slots[a]!.forwardTiles - slots[b]!.forwardTiles,
      ));
    }
  }
  return closest;
}

describe('squadFormationSlots', () => {
  it('stands Infantry in four slots and FPV Operators in three', () => {
    expect(squadFormationSlots(SQUAD_ROLES.infantry)).toHaveLength(4);
    expect(squadFormationSlots(SQUAD_ROLES.fpvOperators)).toHaveLength(3);
    expect(squadSize('infantry')).toBe(4);
    expect(squadSize('fpvOperators')).toBe(3);
    expect(SQUAD_ROLES.infantry.memberMotion).toHaveLength(4);
    expect(SQUAD_ROLES.fpvOperators.memberMotion).toHaveLength(3);
  });

  it('puts two Infantry forward and two behind, lead first, with a slight stagger', () => {
    const slots = squadFormationSlots(SQUAD_ROLES.infantry);
    const [lead, second, rearA, rearB] = slots as [typeof slots[0], typeof slots[0], typeof slots[0], typeof slots[0]];

    // Both forward soldiers stand ahead of the entity centre and both rear soldiers behind it.
    expect(lead.forwardTiles).toBeGreaterThan(0);
    expect(second.forwardTiles).toBeGreaterThan(0);
    expect(rearA.forwardTiles).toBeLessThan(0);
    expect(rearB.forwardTiles).toBeLessThan(0);

    // The first two slots are the front rank, so they are the last two standing.
    expect(Math.min(lead.forwardTiles, second.forwardTiles)).toBeGreaterThan(Math.max(rearA.forwardTiles, rearB.forwardTiles));

    // Slight asymmetry: neither rank is level, and the formation is not a mirror image.
    expect(lead.forwardTiles).not.toBe(second.forwardTiles);
    expect(rearA.forwardTiles).not.toBe(rearB.forwardTiles);
    expect(lead.rightTiles).not.toBe(second.rightTiles);
    const mirrored = slots.every(slot => slots.some(other => other.rightTiles === -slot.rightTiles && other.forwardTiles === slot.forwardTiles));
    expect(mirrored).toBe(false);
  });

  it('keeps three FPV slots with the lead ahead of the two rear operators', () => {
    const [lead, rearLeft, rearRight] = squadFormationSlots(SQUAD_ROLES.fpvOperators) as [
      { rightTiles: number; forwardTiles: number },
      { rightTiles: number; forwardTiles: number },
      { rightTiles: number; forwardTiles: number },
    ];
    expect(lead.forwardTiles).toBeGreaterThan(0);
    expect(rearLeft.forwardTiles).toBeLessThan(lead.forwardTiles);
    expect(rearRight.forwardTiles).toBeLessThan(lead.forwardTiles);
    expect(rearLeft.rightTiles).toBeLessThan(0);
    expect(rearRight.rightTiles).toBeGreaterThan(0);
  });

  it('spaces every member far enough apart that helmets and rifles do not pile up', () => {
    // A soldier is roughly 0.35 tiles wide; slots closer than that would overlap significantly.
    expect(closestPair(squadFormationSlots(SQUAD_ROLES.infantry))).toBeGreaterThanOrEqual(0.4);
    expect(closestPair(squadFormationSlots(SQUAD_ROLES.fpvOperators))).toBeGreaterThanOrEqual(0.4);
  });

  it('keeps each squad compact enough to fit its entity footprint, in tiles', () => {
    for (const role of ['infantry', 'fpvOperators'] as const) {
      for (const slot of squadFormationSlots(SQUAD_ROLES[role])) {
        expect(Math.hypot(slot.rightTiles, slot.forwardTiles)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('is deterministic for identical config', () => {
    expect(squadFormationSlots(SQUAD_ROLES.infantry)).toEqual(squadFormationSlots(SQUAD_ROLES.infantry));
  });

  it('gives separate entities stable but non-identical formation silhouettes', () => {
    const first = variedSquadFormationSlots(SQUAD_ROLES.infantry, 'unit-a');
    const repeated = variedSquadFormationSlots(SQUAD_ROLES.infantry, 'unit-a');
    const second = variedSquadFormationSlots(SQUAD_ROLES.infantry, 'unit-b');
    expect(first).toEqual(repeated);
    expect(first).not.toEqual(second);
    expect(first).toHaveLength(SQUAD_ROLES.infantry.slots.length);
  });

  it('keeps per-entity variation close to the authored formation', () => {
    const varied = variedSquadFormationSlots(SQUAD_ROLES.fpvOperators, 'operator-42');
    const base = SQUAD_ROLES.fpvOperators.slots;
    for (let index = 0; index < varied.length; index++) {
      expect(Math.abs(varied[index]!.forwardTiles - base[index]!.forwardTiles)).toBeLessThanOrEqual(0.04);
      expect(Math.abs(Math.abs(varied[index]!.rightTiles) - Math.abs(base[index]!.rightTiles))).toBeLessThanOrEqual(0.045);
    }
  });

  it('stands compact toy soldiers well under the previous 0.77 tile height', () => {
    expect(SQUAD_ROLES.infantry.standHeightTiles).toBeLessThanOrEqual(0.77 * 0.7);
    expect(SQUAD_ROLES.infantry.standHeightTiles).toBeGreaterThanOrEqual(0.77 * 0.65);
    expect(SQUAD_ROLES.fpvOperators.standHeightTiles).toBe(SQUAD_ROLES.infantry.standHeightTiles);
  });

  it('keeps the slightly taller revision compact and leaves the drone prop unchanged', () => {
    for (const role of ['infantry', 'fpvOperators'] as const) {
      expect(SQUAD_ROLES[role].standHeightTiles).toBe(0.53);
    }
    expect(SQUAD_DRONE_CONFIG.modelScaleTiles).toBe(0.55);
  });

  it('gives every member a distinct deterministic motion profile', () => {
    for (const role of ['infantry', 'fpvOperators'] as const) {
      const profiles = SQUAD_ROLES[role].memberMotion;
      expect(new Set(profiles.map(profile => profile.stridePhaseRadians)).size).toBe(profiles.length);
      expect(new Set(profiles.map(profile => profile.strideTempoMultiplier)).size).toBe(profiles.length);
      expect(new Set(profiles.map(profile => profile.idleOffsetSeconds)).size).toBe(profiles.length);
    }
  });
});
