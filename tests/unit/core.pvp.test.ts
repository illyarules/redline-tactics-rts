import { describe, expect, it } from 'vitest';
import { PvpMatch, isPvpCommand } from '../../src/core/pvp';
import { updateFogVisibility } from '../../src/core/fog';

describe('authoritative PvP match', () => {
  it('starts with two mirror openings and filters the enemy base', () => {
    const match = new PvpMatch();
    const west = match.view('player');
    const east = match.view('ai');
    expect(west.credits).toBe(900);
    expect(east.credits).toBe(900);
    expect(west.entities.filter((entity) => entity.owner === 'player')).toHaveLength(2);
    expect(east.entities.filter((entity) => entity.owner === 'ai')).toHaveLength(2);
    expect(west.entities.some((entity) => entity.owner === 'ai')).toBe(false);
    expect(east.entities.some((entity) => entity.owner === 'player')).toBe(false);
    expect(west.entities[0]?.id).not.toBe('e1');
    expect(west.entities.find((entity) => entity.type === 'worker')).toMatchObject({
      status: 'idle', facingRadians: 0, entrenchment: 'mobile',
    });
  });

  it('rejects forged and mixed-owner commands without moving either actor', () => {
    const match = new PvpMatch();
    const own = match.view('player').entities.find((entity) => entity.type === 'worker')!;
    const foreign = match.view('ai').entities.find((entity) => entity.type === 'worker')!;
    const destination = { x: 900, y: 900 };
    expect(match.apply('player', { type: 'Move', unitIds: [own.id, foreign.id], destination }).ok).toBe(false);
    expect(match.apply('player', { type: 'Move', unitIds: [foreign.id], destination }).ok).toBe(false);
    expect(match.world.units('player')[0]?.order).toBeNull();
  });

  it('validates finite input and resolves surrender from either seat', () => {
    expect(isPvpCommand({ type: 'Move', unitIds: ['x'], destination: { x: Infinity, y: 5 } })).toBe(false);
    const match = new PvpMatch();
    expect(match.apply('ai', { type: 'Surrender' }).ok).toBe(true);
    expect(match.result).toEqual({ winner: 'player', reason: 'surrender' });
    const tick = match.tick;
    match.step();
    expect(match.tick).toBe(tick);
  });

  it('accepts orders for both seats and applies paid construction and production once', () => {
    const match = new PvpMatch();
    const west = match.view('player');
    const east = match.view('ai');
    const westWorker = west.entities.find((entity) => entity.type === 'worker')!;
    const eastWorker = east.entities.find((entity) => entity.type === 'worker')!;
    const westHq = west.entities.find((entity) => entity.type === 'hq')!;
    expect(match.apply('player', { type: 'Move', unitIds: [westWorker.id], destination: { x: 420, y: 900 } }).ok).toBe(true);
    expect(match.apply('ai', { type: 'Move', unitIds: [eastWorker.id], destination: { x: 1450, y: 900 } }).ok).toBe(true);
    expect(match.apply('player', { type: 'Build', workerId: westWorker.id, buildingType: 'powerPlant', topLeft: { tx: 3, ty: 26 } }).ok).toBe(true);
    expect(match.view('player').credits).toBe(650);
    expect(match.apply('player', { type: 'Build', workerId: westWorker.id, buildingType: 'powerPlant', topLeft: { tx: 3, ty: 26 } }).ok).toBe(false);
    expect(match.view('player').credits).toBe(650);
    expect(match.apply('player', { type: 'Produce', buildingId: westHq.id, unitType: 'worker' }).ok).toBe(true);
    const queue = match.view('player').entities.find((entity) => entity.id === westHq.id)?.queue;
    expect(queue).toHaveLength(1);
    expect(match.apply('player', { type: 'CancelProduction', buildingId: westHq.id, queueEntryId: 'wrong-row' }).ok).toBe(false);
    expect(match.apply('player', { type: 'CancelProduction', buildingId: westHq.id, queueEntryId: queue![0]!.id! }).ok).toBe(true);
    expect(match.view('player').entities.find((entity) => entity.id === westHq.id)?.queue).toHaveLength(0);
    expect(match.view('ai').entities.some((entity) => entity.id === westHq.id)).toBe(false);
  });

  it('resolves elimination symmetrically and simultaneous structure loss as a draw', () => {
    const win = new PvpMatch();
    const westHq = win.world.buildings('player')[0]!;
    win.world.damage(westHq.id, westHq.health);
    win.step();
    expect(win.result).toEqual({ winner: 'ai', reason: 'elimination' });

    const draw = new PvpMatch();
    for (const building of draw.world.buildings()) draw.world.damage(building.id, building.health);
    draw.step();
    expect(draw.result).toEqual({ winner: null, reason: 'elimination' });
  });

  it('publishes own order targets and filtered combat effects for both observers', () => {
    const match = new PvpMatch();
    const position = match.grid.tileCenter(20, 15);
    match.world.createUnit({ type: 'infantry', owner: 'player', faction: 'meridian', position });
    match.world.createUnit({
      type: 'tank', owner: 'ai', faction: 'meridian',
      position: { x: position.x + match.grid.tileSizePixels, y: position.y }, health: 1,
    });
    updateFogVisibility(match.fog, match.world, match.grid);
    const west = match.view('player');
    const attacker = west.entities.find((entity) => entity.owner === 'player' && entity.type === 'infantry')!;
    const target = west.entities.find((entity) => entity.owner === 'ai' && entity.type === 'tank')!;

    expect(match.apply('player', { type: 'Attack', unitIds: [attacker.id], targetId: target.id }).ok).toBe(true);
    expect(match.view('player').entities.find((entity) => entity.id === attacker.id)?.order)
      .toEqual({ kind: 'Attack', targetId: target.id });
    expect(match.view('ai').entities.find((entity) => entity.owner === 'player')?.order).toBeUndefined();

    const effects = match.step();
    expect(effects.player[0]).toMatchObject({
      kind: 'combat-hit', weapon: 'infantry', targetToken: target.id,
    });
    expect(effects.ai[0]).toMatchObject({
      kind: 'combat-hit', weapon: 'infantry', targetToken: target.id,
    });
    expect(effects.ai[1]).toMatchObject({ kind: 'combat-death', targetToken: target.id });
    expect(effects.player).toHaveLength(2);
  });
});
