import { describe, expect, it } from 'vitest';
import { CRYSTAL_FIELD_CONFIG } from '../src/config/crystalField';
import { generateCrystalFieldLayout } from '../src/game/models/crystalField';
import { resourceFieldTiles } from '../src/core/map';
import { MAP_CONFIG } from '../src/config/map';

const FIELD = MAP_CONFIG.resourceFields[0];

describe('generateCrystalFieldLayout', () => {
  it('is deterministic for the same tiles and config', () => {
    if (FIELD === undefined) throw new Error('map has no resource fields to test against');
    const tiles = resourceFieldTiles(FIELD);
    expect(generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG)).toEqual(
      generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG),
    );
  });

  it('grows shards and an ore bed patch for every sampled tile', () => {
    const tiles = [
      { tx: 4, ty: 4 },
      { tx: 5, ty: 4 },
      { tx: 6, ty: 4 },
      { tx: 7, ty: 4 },
    ];
    const layout = generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG);
    expect(layout.orePatches.length).toBe(layout.shards.length);
    expect(layout.shards.length).toBeGreaterThan(0);
    // Every `tileStride`-th tile only.
    expect(layout.shards.length).toBe(Math.ceil(tiles.length / CRYSTAL_FIELD_CONFIG.tileStride));
  });

  it('keeps every shard faceted, never a smooth cone', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => ({ tx: i, ty: 0 }));
    const layout = generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG);
    for (const shard of layout.shards) {
      expect(shard.sides).toBeGreaterThanOrEqual(5);
      expect(shard.sides).toBeLessThanOrEqual(7);
      expect(shard.heightTiles).toBeGreaterThan(0);
      expect(shard.lowerDiameterTiles).toBeGreaterThan(0);
    }
  });

  it('varies shard height and diameter rather than repeating one cone', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => ({ tx: i * 3, ty: i }));
    const layout = generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG);
    const heights = new Set(layout.shards.map((s) => s.heightTiles));
    const diameters = new Set(layout.shards.map((s) => s.lowerDiameterTiles));
    expect(heights.size).toBeGreaterThan(1);
    expect(diameters.size).toBeGreaterThan(1);
  });

  it('produces a nonnegative number of rocks and fragments, never exceeding sampled tiles', () => {
    const tiles = Array.from({ length: 20 }, (_, i) => ({ tx: i, ty: 1 }));
    const layout = generateCrystalFieldLayout(tiles, CRYSTAL_FIELD_CONFIG);
    const sampled = Math.ceil(tiles.length / CRYSTAL_FIELD_CONFIG.tileStride);
    expect(layout.rocks.length).toBeGreaterThanOrEqual(0);
    expect(layout.rocks.length).toBeLessThanOrEqual(sampled);
    expect(layout.fragments.length).toBeGreaterThanOrEqual(0);
    expect(layout.fragments.length).toBeLessThanOrEqual(sampled);
  });
});
