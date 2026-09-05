import { beforeEach, describe, expect, it } from 'vitest';
import { UNIT_CONFIG } from '../src/config/units';
import { BUILDING_CONFIG } from '../src/config/buildings';
import { footprintRect, healthFraction, isAlive } from '../src/core/entities';
import { moveOrder } from '../src/core/orders';
import { createWorld, type World } from '../src/core/world';
import type { PlayerId, UnitTypeId } from '../src/core/ids';

const TILE = 32;

function newWorld(): World {
  return createWorld({ tileSizePixels: TILE, idPrefix: 'e' });
}

function addInfantry(world: World, owner: PlayerId = 'player') {
  return world.createUnit({
    type: 'infantry',
    owner,
    faction: 'meridian',
    position: { x: 100, y: 200 },
  });
}

describe('world creation', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('creates a unit at full resolved health with a stable id', () => {
    const unit = addInfantry(world);

    expect(unit.id).toBe('e1');
    expect(unit.kind).toBe('unit');
    expect(unit.owner).toBe('player');
    expect(unit.position).toEqual({ x: 100, y: 200 });
    expect(unit.order).toBeNull();
    expect(unit.status).toBe('idle');
    // Meridian units carry 10% more health than the base config value.
    expect(unit.health).toBe(Math.round(UNIT_CONFIG.infantry.maxHealth * 1.1));
    expect(unit.health).toBe(unit.stats.maxHealth);
  });

  it('resolves stats per faction', () => {
    const meridian = world.createUnit({
      type: 'tank',
      owner: 'player',
      faction: 'meridian',
      position: { x: 0, y: 0 },
    });
    const ember = world.createUnit({
      type: 'tank',
      owner: 'ai',
      faction: 'ember',
      position: { x: 0, y: 0 },
    });

    expect(meridian.stats.maxHealth).toBeGreaterThan(ember.stats.maxHealth);
    expect(ember.stats.speedTilesPerSecond).toBeGreaterThan(meridian.stats.speedTilesPerSecond);
  });

  it('gives every entity a unique id across both kinds', () => {
    const ids = [
      addInfantry(world).id,
      addInfantry(world).id,
      world.createBuilding({
        type: 'hq',
        owner: 'player',
        faction: 'meridian',
        topLeft: { tx: 4, ty: 4 },
      }).id,
    ];

    expect(new Set(ids).size).toBe(3);
    expect(world.size()).toBe(3);
  });

  it('places a building at the centre of its footprint', () => {
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'ai',
      faction: 'ember',
      topLeft: { tx: 10, ty: 20 },
    });

    expect(hq.footprint).toEqual(BUILDING_CONFIG.hq.footprint);
    expect(footprintRect(hq)).toEqual({ tx: 10, ty: 20, width: 4, height: 4 });
    // Four tiles wide from tile 10, so the centre sits on tile 12 in world units.
    expect(hq.position).toEqual({ x: 12 * TILE, y: 22 * TILE });
  });

  it('leaves buildings unaffected by faction modifiers', () => {
    const meridian = world.createBuilding({
      type: 'barracks',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 1, ty: 1 },
    });
    const ember = world.createBuilding({
      type: 'barracks',
      owner: 'ai',
      faction: 'ember',
      topLeft: { tx: 8, ty: 8 },
    });

    expect(meridian.stats.maxHealth).toBe(BUILDING_CONFIG.barracks.maxHealth);
    expect(ember.stats.maxHealth).toBe(BUILDING_CONFIG.barracks.maxHealth);
  });

  it('accepts a starting health below the maximum', () => {
    const unit = world.createUnit({
      type: 'worker',
      owner: 'player',
      faction: 'meridian',
      position: { x: 0, y: 0 },
      health: 30,
    });

    expect(unit.health).toBe(30);
    expect(healthFraction(unit)).toBeCloseTo(30 / unit.stats.maxHealth, 6);
  });
});

describe('world validation', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('rejects an unknown unit type', () => {
    expect(() =>
      world.createUnit({
        type: 'sniper' as UnitTypeId,
        owner: 'player',
        faction: 'meridian',
        position: { x: 0, y: 0 },
      }),
    ).toThrow(/unknown unit type/i);
  });

  it('rejects an unknown owner', () => {
    expect(() =>
      world.createUnit({
        type: 'infantry',
        owner: 'neutral' as PlayerId,
        faction: 'meridian',
        position: { x: 0, y: 0 },
      }),
    ).toThrow(/unknown owner/i);
  });

  it('rejects a non-finite position and a fractional footprint tile', () => {
    expect(() =>
      world.createUnit({
        type: 'infantry',
        owner: 'player',
        faction: 'meridian',
        position: { x: Number.NaN, y: 0 },
      }),
    ).toThrow(/finite/i);

    expect(() =>
      world.createBuilding({
        type: 'hq',
        owner: 'player',
        faction: 'meridian',
        topLeft: { tx: 2.5, ty: 3 },
      }),
    ).toThrow(/whole numbers/i);
  });

  it('rejects starting health outside the valid range', () => {
    const spec = {
      type: 'infantry',
      owner: 'player',
      faction: 'meridian',
      position: { x: 0, y: 0 },
    } as const;

    expect(() => world.createUnit({ ...spec, health: 0 })).toThrow(/starting health/i);
    expect(() => world.createUnit({ ...spec, health: 10_000 })).toThrow(/starting health/i);
    expect(world.size()).toBe(0);
  });

  it('rejects a world without a usable tile size', () => {
    expect(() => createWorld({ tileSizePixels: 0 })).toThrow(/positive tile size/i);
  });
});

describe('world queries', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('retrieves entities by id and by kind', () => {
    const unit = addInfantry(world);
    const hq = world.createBuilding({
      type: 'hq',
      owner: 'player',
      faction: 'meridian',
      topLeft: { tx: 0, ty: 0 },
    });

    expect(world.get(unit.id)).toBe(unit);
    expect(world.require(hq.id)).toBe(hq);
    expect(world.unit(unit.id)).toBe(unit);
    expect(world.unit(hq.id)).toBeUndefined();
    expect(world.building(hq.id)).toBe(hq);
    expect(world.has('nope')).toBe(false);
    expect(world.get('nope')).toBeUndefined();
    expect(() => world.require('nope')).toThrow(/no entity/i);
  });

  it('filters by owner and preserves creation order', () => {
    const first = addInfantry(world, 'player');
    const enemy = addInfantry(world, 'ai');
    const second = addInfantry(world, 'player');

    expect(world.units('player').map((unit) => unit.id)).toEqual([first.id, second.id]);
    expect(world.units('ai')).toEqual([enemy]);
    expect(world.entities().length).toBe(3);
    expect(world.buildings('player')).toEqual([]);
  });
});

describe('world updates', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('updates position, order and status through the world', () => {
    const unit = addInfantry(world);
    const order = moveOrder({ x: 300, y: 400 });

    expect(world.setPosition(unit.id, { x: 5, y: 6 })).toBe(true);
    expect(world.setOrder(unit.id, order)).toBe(true);
    expect(world.setStatus(unit.id, 'moving')).toBe(true);

    const updated = world.require(unit.id);
    expect(updated.position).toEqual({ x: 5, y: 6 });
    expect(updated.order).toEqual(order);
    expect(updated.status).toBe('moving');

    expect(world.setOrder(unit.id, null)).toBe(true);
    expect(world.require(unit.id).order).toBeNull();
  });

  it('reports a missing entity instead of throwing', () => {
    expect(world.setPosition('gone', { x: 1, y: 1 })).toBe(false);
    expect(world.setOrder('gone', null)).toBe(false);
    expect(world.setStatus('gone', 'idle')).toBe(false);
    expect(world.damage('gone', 10)).toBeUndefined();
    expect(world.remove('gone')).toBe(false);
  });

  it('rejects a non-finite position update', () => {
    const unit = addInfantry(world);
    expect(() => world.setPosition(unit.id, { x: 0, y: Number.POSITIVE_INFINITY })).toThrow(
      /finite/i,
    );
    expect(world.require(unit.id).position).toEqual({ x: 100, y: 200 });
  });
});

describe('damage and death', () => {
  let world: World;

  beforeEach(() => {
    world = newWorld();
  });

  it('subtracts damage without killing the entity', () => {
    const unit = addInfantry(world);
    const full = unit.stats.maxHealth;

    expect(world.damage(unit.id, 20)).toEqual({ applied: 20, health: full - 20, destroyed: false });
    expect(world.require(unit.id).status).toBe('idle');
    expect(isAlive(world.require(unit.id))).toBe(true);
  });

  it('floors health at zero and reports the death exactly once', () => {
    const unit = addInfantry(world);
    const full = unit.stats.maxHealth;
    world.setOrder(unit.id, moveOrder({ x: 1, y: 1 }));

    const killing = world.damage(unit.id, full + 500);
    expect(killing).toEqual({ applied: full, health: 0, destroyed: true });

    const dead = world.require(unit.id);
    expect(dead.status).toBe('destroyed');
    expect(dead.order).toBeNull();
    expect(isAlive(dead)).toBe(false);
    expect(healthFraction(dead)).toBe(0);

    // A second hit on the corpse must not report another death.
    expect(world.damage(unit.id, 50)).toEqual({ applied: 0, health: 0, destroyed: false });
  });

  it('never heals', () => {
    const unit = addInfantry(world);
    world.damage(unit.id, 30);
    const wounded = world.require(unit.id).health;

    expect(() => world.damage(unit.id, -10)).toThrow(/non-negative/i);
    expect(world.damage(unit.id, 0)).toEqual({
      applied: 0,
      health: wounded,
      destroyed: false,
    });
    expect(world.require(unit.id).health).toBe(wounded);
  });

  it('damages buildings the same way', () => {
    const barracks = world.createBuilding({
      type: 'barracks',
      owner: 'ai',
      faction: 'ember',
      topLeft: { tx: 6, ty: 6 },
    });

    const result = world.damage(barracks.id, BUILDING_CONFIG.barracks.maxHealth);
    expect(result?.destroyed).toBe(true);
    expect(world.require(barracks.id).status).toBe('destroyed');
  });
});

describe('removal', () => {
  it('removes an entity once and keeps ids unique afterwards', () => {
    const world = newWorld();
    const unit = addInfantry(world);
    const survivor = addInfantry(world);

    expect(world.remove(unit.id)).toBe(true);
    expect(world.remove(unit.id)).toBe(false);
    expect(world.has(unit.id)).toBe(false);
    expect(world.get(unit.id)).toBeUndefined();
    expect(world.units('player')).toEqual([survivor]);
    expect(world.size()).toBe(1);

    const replacement = addInfantry(world);
    expect(replacement.id).not.toBe(unit.id);
  });

  it('keeps a destroyed entity queryable until it is removed', () => {
    const world = newWorld();
    const unit = addInfantry(world);

    world.damage(unit.id, unit.stats.maxHealth);
    expect(world.size()).toBe(1);
    expect(world.entities().filter(isAlive)).toEqual([]);

    world.remove(unit.id);
    expect(world.entities()).toEqual([]);
  });
});
