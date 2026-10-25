import { describe, expect, it } from 'vitest';
import { SQUAD_CASUALTY_CONFIG } from '../../src/config/squad';
import { SquadRoster, casualtyPose, visibleMemberCount } from '../../src/game/models/squadCasualties';

describe('visibleMemberCount', () => {
  it('shows four Infantry above 75% health and loses one at each quarter', () => {
    expect(visibleMemberCount(1, 4)).toBe(4);
    expect(visibleMemberCount(0.76, 4)).toBe(4);
    expect(visibleMemberCount(0.75, 4)).toBe(3);
    expect(visibleMemberCount(0.51, 4)).toBe(3);
    expect(visibleMemberCount(0.5, 4)).toBe(2);
    expect(visibleMemberCount(0.26, 4)).toBe(2);
    expect(visibleMemberCount(0.25, 4)).toBe(1);
    expect(visibleMemberCount(0.01, 4)).toBe(1);
    expect(visibleMemberCount(0, 4)).toBe(0);
  });

  it('shows three FPV Operators above two thirds health and loses one at each third', () => {
    expect(visibleMemberCount(1, 3)).toBe(3);
    expect(visibleMemberCount(0.67, 3)).toBe(3);
    expect(visibleMemberCount(2 / 3, 3)).toBe(2);
    expect(visibleMemberCount(0.34, 3)).toBe(2);
    expect(visibleMemberCount(1 / 3, 3)).toBe(1);
    expect(visibleMemberCount(0.001, 3)).toBe(1);
    expect(visibleMemberCount(0, 3)).toBe(0);
  });

  it('matches ceil(fraction * size) at exact health boundaries computed from real health values', () => {
    // Health is stored as points out of a maximum, so the fraction is a division, not a clean literal.
    for (const max of [45, 60, 90, 100, 120]) {
      for (let health = 1; health <= max; health++) {
        const fraction = health / max;
        expect(visibleMemberCount(fraction, 4)).toBe(Math.ceil(health * 4 / max));
        expect(visibleMemberCount(fraction, 3)).toBe(Math.ceil(health * 3 / max));
      }
    }
  });

  it('keeps a living squad at one member or more and never exceeds full strength', () => {
    expect(visibleMemberCount(Number.MIN_VALUE, 4)).toBe(1);
    expect(visibleMemberCount(1e-12, 3)).toBe(1);
    expect(visibleMemberCount(7, 4)).toBe(4);
  });

  it('shows nobody for zero, negative or non-finite health', () => {
    expect(visibleMemberCount(-0.5, 4)).toBe(0);
    expect(visibleMemberCount(Number.NaN, 3)).toBe(0);
    expect(visibleMemberCount(Number.NEGATIVE_INFINITY, 3)).toBe(0);
  });
});

describe('SquadRoster', () => {
  const fall = SQUAD_CASUALTY_CONFIG.fallSeconds;

  it('starts with only the surviving members and replays no fall for the rest', () => {
    const roster = new SquadRoster(4, 2);
    expect([0, 1, 2, 3].map(i => roster.phaseOf(i))).toEqual(['standing', 'standing', 'gone', 'gone']);
    expect(roster.visibleCount).toBe(2);
    expect(roster.isShown(2)).toBe(false);
  });

  it('removes rear members first and the lead last', () => {
    const roster = new SquadRoster(4, 4);
    const order: number[] = [];
    for (let count = 3; count >= 0; count--) {
      roster.setVisibleCount(count, true);
      order.push([0, 1, 2, 3].filter(i => roster.phaseOf(i) !== 'standing').sort((a, b) => a - b)[0]!);
    }
    // After each step the lowest-numbered casualty is the one that just fell: 3, then 2, 1 and finally the lead, 0.
    expect(order).toEqual([3, 2, 1, 0]);
  });

  it('lets a casualty fall for a short, fixed time and then disappear', () => {
    const roster = new SquadRoster(3, 3);
    roster.setVisibleCount(2, true);
    expect(roster.phaseOf(2)).toBe('falling');
    expect(roster.isShown(2)).toBe(true);
    roster.advance(fall / 2, fall);
    expect(roster.phaseOf(2)).toBe('falling');
    roster.advance(fall / 2, fall);
    expect(roster.phaseOf(2)).toBe('gone');
    expect(roster.isShown(2)).toBe(false);
    expect(roster.phaseOf(0)).toBe('standing');
  });

  it('reaches the final count safely when several thresholds are crossed at once', () => {
    const roster = new SquadRoster(4, 4);
    roster.setVisibleCount(1, true);
    expect([0, 1, 2, 3].map(i => roster.phaseOf(i))).toEqual(['standing', 'falling', 'falling', 'falling']);
    roster.advance(10, fall);
    expect([0, 1, 2, 3].map(i => roster.phaseOf(i))).toEqual(['standing', 'gone', 'gone', 'gone']);
    expect(roster.visibleCount).toBe(1);
  });

  it('does not restart the fall of a member already falling when health drops further', () => {
    const roster = new SquadRoster(4, 4);
    roster.setVisibleCount(3, true);
    roster.advance(fall * 0.6, fall);
    roster.setVisibleCount(2, true);
    expect(roster.fallSeconds(3)).toBeCloseTo(fall * 0.6, 9);
    expect(roster.fallSeconds(2)).toBe(0);
  });

  it('removes casualties instantly when the squad is out of sight', () => {
    const roster = new SquadRoster(4, 4);
    roster.setVisibleCount(2, false);
    expect([0, 1, 2, 3].map(i => roster.phaseOf(i))).toEqual(['standing', 'standing', 'gone', 'gone']);
    roster.setVisibleCount(2, true);
    expect(roster.phaseOf(3)).toBe('gone');
  });

  it('snaps a member mid-fall to gone when the squad leaves view', () => {
    const roster = new SquadRoster(3, 3);
    roster.setVisibleCount(2, true);
    roster.setVisibleCount(2, false);
    expect(roster.phaseOf(2)).toBe('gone');
  });

  it('removes every member for zero health and stands them back up if health returns', () => {
    const roster = new SquadRoster(3, 3);
    roster.setVisibleCount(0, true);
    roster.advance(10, fall);
    expect([0, 1, 2].every(i => roster.phaseOf(i) === 'gone')).toBe(true);
    roster.setVisibleCount(3, true);
    expect([0, 1, 2].every(i => roster.phaseOf(i) === 'standing')).toBe(true);
  });

  it('ignores bad frame deltas and clamps bad counts', () => {
    const roster = new SquadRoster(3, 3);
    roster.setVisibleCount(1, true);
    roster.advance(Number.NaN, fall);
    roster.advance(-1, fall);
    expect(roster.fallSeconds(2)).toBe(0);
    roster.setVisibleCount(99, true);
    expect(roster.visibleCount).toBe(3);
    roster.setVisibleCount(Number.NaN, true);
    expect(roster.visibleCount).toBe(0);
  });

});

describe('SquadRoster poses', () => {
  const fall = SQUAD_CASUALTY_CONFIG.fallSeconds;

  it('poses a standing member upright, a falling one partway and a gone one fully faded', () => {
    const roster = new SquadRoster(2, 2);
    roster.setVisibleCount(1, true);
    expect(roster.poseOf(0, SQUAD_CASUALTY_CONFIG)).toEqual({ tiltRadians: 0, dropTiles: 0, visibility: 1 });
    roster.advance(fall / 2, fall);
    const mid = roster.poseOf(1, SQUAD_CASUALTY_CONFIG);
    expect(mid.tiltRadians).toBeGreaterThan(0);
    expect(mid.visibility).toBeLessThan(1);
    roster.advance(fall, fall);
    expect(roster.poseOf(1, SQUAD_CASUALTY_CONFIG).visibility).toBe(0);
  });
});

describe('casualtyPose', () => {
  const config = SQUAD_CASUALTY_CONFIG;

  it('starts upright and opaque and ends tipped, sunk and invisible', () => {
    expect(casualtyPose(0, config)).toEqual({ tiltRadians: 0, dropTiles: 0, visibility: 1 });
    const end = casualtyPose(1, config);
    expect(end.tiltRadians).toBeCloseTo(config.tiltRadians, 9);
    expect(end.dropTiles).toBeCloseTo(config.dropTiles, 9);
    expect(end.visibility).toBe(0);
  });

  it('tips and sinks before it fades', () => {
    const early = casualtyPose(config.fadeStartFraction * 0.9, config);
    expect(early.visibility).toBe(1);
    expect(early.tiltRadians).toBeGreaterThan(0);
  });

  it('only ever tips, sinks and fades further as the fall goes on, and clamps out-of-range progress', () => {
    let previous = casualtyPose(0, config);
    for (let step = 1; step <= 20; step++) {
      const pose = casualtyPose(step / 20, config);
      expect(pose.tiltRadians).toBeGreaterThanOrEqual(previous.tiltRadians);
      expect(pose.dropTiles).toBeGreaterThanOrEqual(previous.dropTiles);
      expect(pose.visibility).toBeLessThanOrEqual(previous.visibility);
      previous = pose;
    }
    expect(casualtyPose(-3, config)).toEqual(casualtyPose(0, config));
    expect(casualtyPose(9, config)).toEqual(casualtyPose(1, config));
  });

  it('stays brief and restrained', () => {
    expect(config.fallSeconds).toBeLessThanOrEqual(0.75);
    expect(config.tiltRadians).toBeLessThanOrEqual(Math.PI / 2);
    expect(config.dropTiles).toBeLessThanOrEqual(0.2);
  });
});
