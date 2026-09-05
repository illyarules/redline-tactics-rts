import { describe, expect, it } from 'vitest';
import { SQUAD_CONFIG } from '../src/config/squad';
import { squadFormationSlots, SQUAD_SIZE } from '../src/game/models/squadFormation';

describe('squadFormationSlots', () => {
  it('always returns exactly three slots', () => {
    expect(squadFormationSlots(SQUAD_CONFIG.formation)).toHaveLength(SQUAD_SIZE);
  });

  it('puts one soldier ahead and two behind, spread to either side', () => {
    const [lead, rearLeft, rearRight] = squadFormationSlots(SQUAD_CONFIG.formation);

    expect(lead.rightTiles).toBe(0);
    expect(lead.forwardTiles).toBeGreaterThan(0);

    expect(rearLeft.forwardTiles).toBeLessThan(0);
    expect(rearRight.forwardTiles).toBeLessThan(0);
    expect(rearLeft.forwardTiles).toBe(rearRight.forwardTiles);
    expect(rearLeft.rightTiles).toBe(-rearRight.rightTiles);
    expect(rearLeft.rightTiles).not.toBe(0);
  });

  it('is deterministic for identical config', () => {
    expect(squadFormationSlots(SQUAD_CONFIG.formation)).toEqual(
      squadFormationSlots(SQUAD_CONFIG.formation),
    );
  });

  it('shrinks toward the entity as configured spacing shrinks', () => {
    const tight = squadFormationSlots({ leadOffsetTiles: 0.05, rearOffsetTiles: 0.04, rearSpreadTiles: 0.05 });
    const wide = squadFormationSlots({ leadOffsetTiles: 0.5, rearOffsetTiles: 0.4, rearSpreadTiles: 0.5 });

    expect(tight[0]?.forwardTiles ?? 0).toBeLessThan(wide[0]?.forwardTiles ?? 0);
  });
});
